"""SSE endpoint for real-time event streaming to frontend clients.

Also includes the user-facing exec dispatch endpoint (POST /api/users/exec).
"""

import asyncio
import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Literal

from pydantic import BaseModel, TypeAdapter

from ..deps import get_current_user_or_device, get_redis
from ..models import User
from ..schemas.redis_events import ExecRequest, StreamEvent, IntentionUpdate, CardAction

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/events")
async def user_events(
    request: Request,
    user: User = Depends(get_current_user_or_device),
    redis=Depends(get_redis),
):
    """Stream server-sent events for the authenticated user.

    Subscribes to the Redis pub/sub channel `vi:events:{vi_user_id}` and
    forwards messages as SSE. Sends a heartbeat every 30 seconds.
    """
    if redis is None:
        return JSONResponse(
            status_code=503,
            content={"detail": "Event streaming unavailable (Redis not connected)"},
        )

    async def event_generator():
        pubsub = redis.pubsub()
        uid = user.vi_user_id
        channels = [
            f"vi:events:{uid}",   # memory_update, session_update
            f"vi:stream:{uid}",   # V5 card ops + exec lifecycle from NanoClaw
            f"vi:intent:{uid}",   # intention_update from NanoClaw
        ]
        await pubsub.subscribe(*channels)
        last_heartbeat = time.time()

        try:
            while True:
                if await request.is_disconnected():
                    break

                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )

                if message and message["type"] == "message":
                    data = json.loads(message["data"])
                    channel = message.get("channel", b"").decode() if isinstance(message.get("channel"), bytes) else str(message.get("channel", ""))

                    # Validate incoming events against schemas (warn on failure, don't break SSE)
                    if f"vi:stream:{uid}" in channel:
                        try:
                            TypeAdapter(StreamEvent).validate_python(data)
                        except Exception as ve:
                            logger.warning("SSE stream event validation failed: %s — data: %s", ve, data)
                    elif f"vi:intent:{uid}" in channel:
                        try:
                            IntentionUpdate.model_validate(data)
                        except Exception as ve:
                            logger.warning("SSE intent event validation failed: %s — data: %s", ve, data)

                    # Card ops have "op" field; lifecycle/legacy events have "type" field
                    if "op" in data:
                        event_type = data["op"]
                    else:
                        event_type = data.get("type", "update")

                    yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

                now = time.time()
                if now - last_heartbeat >= 30:
                    yield f"event: heartbeat\ndata: {json.dumps({'ts': now})}\n\n"
                    last_heartbeat = now

                await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(*channels)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# User-facing exec dispatch to NanoClaw
# ---------------------------------------------------------------------------


class UserExecRequest(BaseModel):
    """Dispatch a task to NanoClaw via Redis. User-facing endpoint."""
    prompt: str
    session_id: str | None = None
    skill_slug: str | None = None
    media_urls: list[str] | None = None
    priority: Literal["fast", "thorough"] = "thorough"
    params: dict | None = None


@router.post("/exec")
async def dispatch_exec_user(
    req: UserExecRequest,
    user: User = Depends(get_current_user_or_device),
    redis=Depends(get_redis),
):
    """Dispatch an execution request to NanoClaw for the authenticated user.

    This is the REST dispatch path for:
    - Frontend intention card taps (when LiveKit RPC is unavailable)
    - Direct skill execution from the frontend
    - Any non-LiveKit dispatch scenario

    Results stream back via SSE on GET /api/users/events.
    """
    if redis is None:
        raise HTTPException(status_code=503, detail="Redis unavailable")

    uid = user.vi_user_id
    task_id = f"exec-{uuid.uuid4().hex[:12]}"
    session_id = req.session_id or f"session-{uuid.uuid4().hex[:12]}"

    exec_msg = ExecRequest(
        taskId=task_id,
        sessionId=session_id,
        prompt=req.prompt,
        priority=req.priority,
        skillSlug=req.skill_slug,
        mediaUrls=req.media_urls or [],
        params=req.params,
        userId=uid,
    )

    channel = f"vi:exec:{uid}"
    await redis.publish(channel, exec_msg.model_dump_json())

    logger.info("[redis][api] Exec dispatch: task=%s skill=%s uid=%s", task_id, req.skill_slug, uid)

    return {
        "ok": True,
        "taskId": task_id,
        "sessionId": session_id,
    }


class CardActionRequest(BaseModel):
    """Card action from frontend — user interacted with a living card."""
    cardId: str
    action: str
    payload: dict = {}
    timestamp: str | None = None


@router.post("/card-action")
async def send_card_action(
    req: CardActionRequest,
    user: User = Depends(get_current_user_or_device),
    redis=Depends(get_redis),
):
    """Send a card action upstream to NanoClaw.

    Used when users interact with living cards (check items, select options, etc.).
    The action is published to vi:actions:{uid} as an XADD event.
    """
    if redis is None:
        raise HTTPException(status_code=503, detail="Redis unavailable")

    uid = user.vi_user_id
    action_event = CardAction(
        cardId=req.cardId,
        action=req.action,
        payload=req.payload,
        timestamp=req.timestamp,
    )

    channel = f"vi:actions:{uid}"
    await redis.xadd(channel, {"data": action_event.model_dump_json()})

    logger.info("[redis][api] Card action: card=%s action=%s uid=%s", req.cardId, req.action, uid)

    return {"ok": True}
