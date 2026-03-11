"""Shared utility functions for the API server."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User

logger = logging.getLogger(__name__)


def to_iso(dt):
    """Convert datetime to ISO 8601 string."""
    if dt is None:
        return None
    return dt.isoformat()


async def resolve_user_id(
    db: AsyncSession, vi_user_id: str, *, auto_create: bool = False,
):
    """Resolve vi_user_id -> internal UUID.

    When *auto_create* is True (used by internal/trusted APIs), a stub user
    is created on the fly so that cross-environment LiveKit dispatches don't
    break session and memory flows.
    Raises ValueError if not found and auto_create is False.
    """
    result = await db.execute(
        select(User).where(User.vi_user_id == vi_user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        if not auto_create:
            raise ValueError(f"No user found for vi_user_id: {vi_user_id}")
        logger.info(f"[auto-create] creating stub user for {vi_user_id}")
        user = User(
            vi_user_id=vi_user_id,
            display_name="Auto-created",
            email=f"{vi_user_id}@auto.vi",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user.id
