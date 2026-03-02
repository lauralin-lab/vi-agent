"""Shared utility functions for the API server."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User


def to_iso(dt):
    """Convert datetime to ISO 8601 string."""
    if dt is None:
        return None
    return dt.isoformat()


async def resolve_user_id(db: AsyncSession, vi_user_id: str):
    """Resolve vi_user_id -> internal UUID. Raises ValueError if not found."""
    result = await db.execute(
        select(User).where(User.vi_user_id == vi_user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError(f"No user found for vi_user_id: {vi_user_id}")
    return user.id
