"""SSE endpoint for real-time event streaming to frontend clients."""

import asyncio
import json
import logging
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ..deps import get_current_user_or_device, get_redis
from ..models import User

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
        channel = f"vi:events:{user.vi_user_id}"
        await pubsub.subscribe(channel)
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
                    event_type = data.get("event_type", "update")
                    payload = {k: v for k, v in data.items() if k != "event_type"}
                    yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

                now = time.time()
                if now - last_heartbeat >= 30:
                    yield f"event: heartbeat\ndata: {json.dumps({'ts': now})}\n\n"
                    last_heartbeat = now

                await asyncio.sleep(0.1)
        finally:
            await pubsub.unsubscribe(channel)
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
