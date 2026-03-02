import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_current_user, get_db, verify_device_ownership
from ..models import Session, User
from ..services.session_center import session_center


router = APIRouter()


# --- Session endpoints (V3 — unified, sessions only) ---


@router.get("/sessions/by-device")
async def get_sessions_by_device(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(verify_device_ownership),
    db: AsyncSession = Depends(get_db),
):
    """Get sessions for a device-based anonymous user."""
    sessions = await session_center.get_user_sessions(db, user.vi_user_id, limit=limit, offset=skip)
    # Filter out empty 'created' sessions (no prompt, no dispatch)
    sessions = [s for s in sessions if s.get("status") not in (None, "created") or s.get("prompt")]
    return {"sessions": sessions}


@router.get("/sessions")
async def get_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vi_user_id = user.vi_user_id
    sessions = await session_center.get_user_sessions(db, vi_user_id, limit=limit, offset=skip)
    sessions = [s for s in sessions if s.get("status") not in (None, "created") or s.get("prompt")]
    return {"sessions": sessions}


@router.delete("/sessions/by-device/{session_id}")
async def delete_session_by_device(
    session_id: str,
    user: User = Depends(verify_device_ownership),
    db: AsyncSession = Depends(get_db),
):
    """Delete a session for a device-based anonymous user."""
    try:
        sid = _uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")
    session = await db.get(Session, sid)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a session by ID (JWT auth)."""
    try:
        sid = _uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")
    session = await db.get(Session, sid)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"ok": True}
