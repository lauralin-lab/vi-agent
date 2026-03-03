"""Internal API endpoints for vi-realtime agent to persist task lifecycle.

These endpoints are called by vi-realtime (within the Docker network)
and should NOT be exposed to the public internet.
"""

import logging
import os
import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, get_redis
from ..models import Session, User
from ..services.memory_center import memory_center
from ..services.gcs_service import GCS_BUCKET, get_gcs_bucket, get_signing_kwargs
from ..services.session_center import session_center

logger = logging.getLogger(__name__)

INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "vi-internal-dev-token")
if INTERNAL_API_TOKEN == "vi-internal-dev-token":
    logger.warning("INTERNAL_API_TOKEN is using default value. Set a secure token in production!")


async def verify_internal_token(
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
):
    """Verify the internal API token from X-Internal-Token header."""
    if x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid internal token")


router = APIRouter(dependencies=[Depends(verify_internal_token)])


async def _get_session_owner_vi_user_id(db: AsyncSession, session_id: str) -> str | None:
    """Look up vi_user_id from a session_id. Returns None if not found."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    session = await db.get(Session, sid)
    if not session:
        return None
    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()
    return user.vi_user_id if user else None


class CreateSessionRequest(BaseModel):
    vi_user_id: str
    context: dict | None = None


class DispatchSessionRequest(BaseModel):
    executor: str
    prompt: str


class CompleteSessionRequest(BaseModel):
    result: dict


class FailSessionRequest(BaseModel):
    error: str


class UpdateSessionRequest(BaseModel):
    title: str | None = None
    intention: str | None = None
    status: str | None = None
    progress_step: int | None = None
    progress_total: int | None = None
    progress_message: str | None = None
    result_summary: str | None = None
    result_html: str | None = None
    artifacts: list | None = None
    timeline: list | None = None
    memory_updates: list | None = None


class CreateMemoryRequest(BaseModel):
    vi_user_id: str
    content: str
    type: str = "long_term"
    source: str = "agent"


class MemoryUpdateItem(BaseModel):
    filename: str
    content: str
    category: str = "general"
    mode: str = "append"  # "append" or "replace"
    layer: str | None = None  # V3: optional; inferred if absent
    source_channel: str | None = None  # V3: livekit | slack | ...
    source_session_id: str | None = None  # V3: session that triggered this


class BatchMemoryUpdatesRequest(BaseModel):
    vi_user_id: str
    updates: list[MemoryUpdateItem]


class SessionEndMemoryRequest(BaseModel):
    session_id: str
    vi_user_id: str
    summary: str | None = None


class HeartbeatMemoryRequest(BaseModel):
    vi_user_id: str



# --- Endpoints ---


@router.patch("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mark a session as ended when the LiveKit room disconnects."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = await db.get(Session, sid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/memories")
async def create_memory(
    req: CreateMemoryRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Persist a memory from the gateway/agent.

    Called fire-and-forget by the gateway when the agent writes a memory update.
    Appends into the user's agent-memory.md file.
    Uses type and source from request for proper layer inference.
    """
    filename = "agent-memory.md"
    try:
        await memory_center.append_memory(
            db, req.vi_user_id, filename, req.content,
            category=req.type,  # V3: use type field for category inference
            source=req.source,  # V3: use source field
            redis=redis,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True, "filename": filename}


class UpsertMemoryRequest(BaseModel):
    vi_user_id: str
    filename: str
    content: str
    category: str = "general"
    source: str = "agent"


@router.put("/memories/{filename}")
async def upsert_memory(
    filename: str,
    req: UpsertMemoryRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Create or replace a memory file for a user (agent internal use)."""
    try:
        await memory_center.upsert_memory(
            db, req.vi_user_id, filename, req.content,
            category=req.category, source=req.source, redis=redis,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True, "filename": filename}


@router.post("/memories/batch")
async def batch_memory_updates(
    req: BatchMemoryUpdatesRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Batch upsert/append multiple memory files.

    Called by the Gateway after task execution to persist memory_updates,
    or by the Agent at session end for auto-summary.
    V3: supports layer, source_channel, source_session_id fields.
    """
    results = []
    for item in req.updates:
        try:
            if item.mode == "replace":
                await memory_center.upsert_memory(
                    db, req.vi_user_id, item.filename, item.content,
                    category=item.category, source="agent",
                    layer=item.layer,
                    source_channel=item.source_channel,
                    source_session_id=item.source_session_id,
                    redis=redis,
                )
            else:
                await memory_center.append_memory(
                    db, req.vi_user_id, item.filename, item.content,
                    layer=item.layer,
                    category=item.category,
                    source="agent",
                    redis=redis,
                )
            results.append({"filename": item.filename, "ok": True})
        except ValueError as e:
            results.append({"filename": item.filename, "ok": False, "error": str(e)})
    return {"ok": True, "results": results}


@router.get("/memories/context/{vi_user_id}")
async def get_memory_context(
    vi_user_id: str,
    max_chars: int = Query(3000, le=10000),
    channel: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get importance-scored memory context for agent injection.

    V3: uses ImportanceScorer for selection, supports channel param,
    default max_chars increased to 3000.
    """
    try:
        context = await memory_center.get_context_for_agent(
            db, vi_user_id, channel=channel, max_chars=max_chars
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"context": context}


@router.post("/memories/session-end")
async def process_session_end_memory(
    req: SessionEndMemoryRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """V3: Auto-generate episodic memory at session end.

    Creates or appends to memory/YYYY-MM-DD.md with session summary.
    """
    try:
        await memory_center.process_session_end(
            db, req.session_id, req.vi_user_id,
            summary=req.summary, redis=redis,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@router.post("/memories/heartbeat")
async def heartbeat_memory_maintenance(
    req: HeartbeatMemoryRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """V3: Periodic memory maintenance — recompute scores, delete expired."""
    try:
        stats = await memory_center.heartbeat_maintenance(
            db, req.vi_user_id, redis=redis,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True, **stats}


# --- Session lifecycle endpoints (V2) ---


@router.post("/sessions")
async def create_session(
    req: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Create a new session for a user."""
    try:
        session_id = await session_center.create_session(
            db, req.vi_user_id, req.context, redis=redis,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"session_id": session_id}


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: str,
    req: UpdateSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Partial update of session fields (title, intention, progress, etc.)."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        data = await session_center.update_session(db, session_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return data


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single session by ID."""
    try:
        data = await session_center.get_session(db, session_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return data


@router.get("/sessions/by-user/{vi_user_id}")
async def get_user_sessions(
    vi_user_id: str,
    status: str | None = Query(None),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List sessions for a user, optionally filtered by status."""
    try:
        sessions = await session_center.get_user_sessions(
            db, vi_user_id, status=status, limit=limit
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"sessions": sessions}


@router.post("/sessions/{session_id}/dispatch")
async def dispatch_session(
    session_id: str,
    req: DispatchSessionRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Dispatch a session to an executor with a prompt."""
    vi_user_id = await _get_session_owner_vi_user_id(db, session_id)
    try:
        await session_center.dispatch_session(
            db, session_id, req.executor, req.prompt,
            redis=redis, vi_user_id=vi_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@router.post("/sessions/{session_id}/complete")
async def complete_session(
    session_id: str,
    req: CompleteSessionRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Mark a session as completed with result."""
    vi_user_id = await _get_session_owner_vi_user_id(db, session_id)
    try:
        await session_center.complete_session(
            db, session_id, req.result,
            redis=redis, vi_user_id=vi_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


@router.post("/sessions/{session_id}/fail")
async def fail_session(
    session_id: str,
    req: FailSessionRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Mark a session as failed with error."""
    vi_user_id = await _get_session_owner_vi_user_id(db, session_id)
    try:
        await session_center.fail_session(
            db, session_id, req.error,
            redis=redis, vi_user_id=vi_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True}


# --- Gateway Lazy Join proxy ---

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://vi-gateway:18789")


class GatewayJoinRequest(BaseModel):
    room_name: str


@router.post("/gateway/join")
async def gateway_join(req: GatewayJoinRequest):
    """Proxy a Lazy Join request to the vi-gateway service.

    Called by the vi-realtime agent when it needs the gateway to join a room
    for task execution via Room RPC.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{GATEWAY_URL}/join",
                json={"room_name": req.room_name},
            )
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Gateway join failed: {e}")


# --- GCS signed GET URL ---

# Pattern to extract GCS key from a full GCS URL
_GCS_URL_PATTERN = re.compile(
    r"https://storage\.googleapis\.com/([a-z0-9_-]+)/(.+)"
)


class PresignGetRequest(BaseModel):
    urls: list[str]


@router.post("/storage/presign-get")
async def presign_get_urls(body: PresignGetRequest):
    """Convert bare GCS URLs to signed GET URLs.

    Accepts {"urls": ["https://storage.googleapis.com/vi-uploads/photos/..."]}
    Returns {"urls": {"<original>": "<signed>"}}
    """
    from datetime import timedelta

    urls = body.urls
    if not urls:
        return {"urls": {}}

    bucket = get_gcs_bucket()
    result = {}
    for url in urls[:10]:  # cap at 10
        # Skip already-signed URLs (contain GCS signature params)
        if "X-Goog-" in url:
            result[url] = url
            continue
        # Strip query params before matching (in case of partial signing)
        clean_url = url.split("?")[0]
        m = _GCS_URL_PATTERN.match(clean_url)
        if not m:
            result[url] = url  # not a GCS URL, pass through
            continue
        key = m.group(2)
        try:
            blob = bucket.blob(key)
            signed = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(hours=1),
                method="GET",
                **get_signing_kwargs(),
            )
            result[url] = signed
        except Exception:
            result[url] = url  # fallback to original
    return {"urls": result}
