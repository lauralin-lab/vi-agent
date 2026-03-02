"""SessionCenter — service layer for session lifecycle management.

Provides CRUD and state-machine transitions for Session records.
All methods accept an AsyncSession (from get_db dependency) and work with
vi_user_id strings as the external user identifier.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Session
from ..utils import resolve_user_id, to_iso
from .events import publish_event


VALID_SESSION_STATUSES = {"active", "paused", "completed", "failed", "ended"}


class SessionCenter:

    async def _resolve_user_id(self, db: AsyncSession, vi_user_id: str):
        """Resolve vi_user_id -> internal UUID. Raises ValueError if not found."""
        return await resolve_user_id(db, vi_user_id)

    async def create_session(
        self, db: AsyncSession, vi_user_id: str, context: dict | None = None,
        redis=None,
    ) -> str:
        """Create a new session in 'created' status. Returns session_id string."""
        user_id = await self._resolve_user_id(db, vi_user_id)
        session = Session(
            user_id=user_id,
            room_name=f"vi-room-{vi_user_id}",
            status="created",
            context=context or {},
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        session_id = str(session.id)
        await publish_event(redis, vi_user_id, {
            "event_type": "session_update",
            "session_id": session_id,
            "status": "created",
        })
        return session_id

    async def dispatch_session(
        self, db: AsyncSession, session_id: str, executor: str, prompt: str,
        redis=None, vi_user_id: str | None = None,
    ) -> None:
        """Transition session to 'dispatched' with executor and prompt."""
        session = await self._get_session_or_raise(db, session_id)
        session.status = "dispatched"
        session.executor = executor
        session.prompt = prompt
        session.dispatched_at = datetime.now(timezone.utc)
        await db.commit()
        if vi_user_id:
            await publish_event(redis, vi_user_id, {
                "event_type": "session_update",
                "session_id": session_id,
                "status": "dispatched",
            })

    async def complete_session(
        self, db: AsyncSession, session_id: str, result: dict,
        redis=None, vi_user_id: str | None = None,
    ) -> None:
        """Mark session as completed with result payload."""
        session = await self._get_session_or_raise(db, session_id)
        session.status = "completed"
        # Extract HTML from result to avoid storing large content in both JSONB and Text
        result_clean = {k: v for k, v in result.items() if k != "html"}
        session.result = result_clean
        session.result_summary = result.get("summary", "")
        session.result_html = result.get("html", "")
        session.completed_at = datetime.now(timezone.utc)
        session.ended_at = datetime.now(timezone.utc)
        await db.commit()
        if vi_user_id:
            await publish_event(redis, vi_user_id, {
                "event_type": "session_update",
                "session_id": session_id,
                "status": "completed",
                "result_summary": result.get("summary", ""),
            })

    async def fail_session(
        self, db: AsyncSession, session_id: str, error: str,
        redis=None, vi_user_id: str | None = None,
    ) -> None:
        """Mark session as failed with error message."""
        session = await self._get_session_or_raise(db, session_id)
        session.status = "failed"
        session.result = {"error": error}
        session.completed_at = datetime.now(timezone.utc)
        session.ended_at = datetime.now(timezone.utc)
        await db.commit()
        if vi_user_id:
            await publish_event(redis, vi_user_id, {
                "event_type": "session_update",
                "session_id": session_id,
                "status": "failed",
                "error": error,
            })

    async def get_session(self, db: AsyncSession, session_id: str) -> dict:
        """Get a single session by ID, returned as dict."""
        session = await self._get_session_or_raise(db, session_id)
        return self._to_dict(session)

    async def get_user_sessions(
        self,
        db: AsyncSession,
        vi_user_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        """List sessions for a user, optionally filtered by status."""
        user_id = await self._resolve_user_id(db, vi_user_id)
        query = (
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(Session.started_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if status:
            query = query.where(Session.status == status)
        result = await db.execute(query)
        sessions = result.scalars().all()
        return [self._to_dict(s) for s in sessions]

    async def update_session(
        self, db: AsyncSession, session_id: str, updates: dict
    ) -> dict:
        """Apply partial updates to a session. Returns updated session dict."""
        session = await self._get_session_or_raise(db, session_id)
        if "status" in updates and updates["status"] not in VALID_SESSION_STATUSES:
            raise ValueError(f"Invalid session status: {updates['status']}")
        allowed_fields = {
            "title", "intention", "status", "progress_step", "progress_total",
            "progress_message", "result_summary", "result_html", "artifacts",
            "timeline", "memory_updates",
        }
        for key, value in updates.items():
            if key in allowed_fields and value is not None:
                setattr(session, key, value)
        await db.commit()
        await db.refresh(session)
        return self._to_dict(session)

    # -- Internal helpers --

    async def _get_session_or_raise(self, db: AsyncSession, session_id: str) -> Session:
        try:
            sid = uuid.UUID(session_id)
        except ValueError:
            raise ValueError(f"Invalid session_id: {session_id}")
        session = await db.get(Session, sid)
        if not session:
            raise ValueError(f"Session not found: {session_id}")
        return session

    @staticmethod
    def _to_dict(session: Session) -> dict:
        return {
            "id": str(session.id),
            "user_id": str(session.user_id),
            "room_name": session.room_name,
            "status": session.status or "created",
            "prompt": session.prompt,
            "title": session.title,
            "context": session.context,
            "intention": session.intention,
            "executor": session.executor,
            "progress_step": session.progress_step,
            "progress_total": session.progress_total,
            "progress_message": session.progress_message,
            "result": session.result,
            "result_summary": session.result_summary,
            "result_html": session.result_html,
            "artifacts": session.artifacts or [],
            "timeline": session.timeline or [],
            "memory_updates": session.memory_updates or [],
            "started_at": to_iso(session.started_at),
            "dispatched_at": to_iso(session.dispatched_at),
            "completed_at": to_iso(session.completed_at),
            "ended_at": to_iso(session.ended_at),
        }


# Module-level singleton
session_center = SessionCenter()
