"""Invite Code routes.

GET  /api/invite/status        — check if invite code is required
GET  /api/invite/validate      — validate an invite code
POST /api/invite/create        — create an invite code (authenticated)
"""

import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_db, get_firebase_user
from ..limiter import limiter
from ..models import InviteCode, Setting, User

router = APIRouter()


# ---------- Schemas ----------

class InviteStatusResponse(BaseModel):
    invite_required: bool


class InviteValidateResponse(BaseModel):
    valid: bool
    reason: str | None = None


class InviteCreateRequest(BaseModel):
    code: str | None = None
    max_uses: int | None = None
    expires_at: datetime | None = None
    note: str | None = None


class InviteCreateResponse(BaseModel):
    id: str
    code: str
    max_uses: int | None
    used_count: int
    expires_at: datetime | None
    is_active: bool
    note: str | None
    created_at: datetime | None


# ---------- Helpers ----------

def _generate_code(length: int = 8) -> str:
    """Generate a random alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def get_setting(db: AsyncSession, key: str, default: str | None = None) -> str | None:
    """Read a setting from the database. Returns default if not found or inactive/deleted."""
    result = await db.execute(
        select(Setting).where(
            Setting.key == key,
            Setting.is_active.is_(True),
            Setting.is_deleted.is_(False),
        )
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else default


async def is_invite_required(db: AsyncSession) -> bool:
    """Check if invite code is required. DB setting takes priority, falls back to env var."""
    value = await get_setting(db, "invite_required")
    if value is not None:
        return value.lower() in ("true", "1", "yes")
    return settings.INVITE_REQUIRED


async def _validate_invite_code(db: AsyncSession, code: str) -> tuple[bool, str | None, InviteCode | None]:
    """Validate an invite code. Returns (valid, reason, invite_code_obj)."""
    result = await db.execute(select(InviteCode).where(InviteCode.code == code))
    invite = result.scalar_one_or_none()

    if invite is None:
        return False, "not_found", None
    if invite.is_deleted:
        return False, "not_found", None
    if not invite.is_active:
        return False, "disabled", None
    if invite.expires_at is not None and invite.expires_at < datetime.now(timezone.utc):
        return False, "expired", None
    if invite.max_uses is not None and invite.used_count >= invite.max_uses:
        return False, "used_up", None

    return True, None, invite


# ---------- Public Endpoints ----------

@router.get("/status", response_model=InviteStatusResponse)
@limiter.exempt
async def invite_status(request: Request, db: AsyncSession = Depends(get_db)):
    """Check if invite code is required for registration."""
    required = await is_invite_required(db)
    return InviteStatusResponse(invite_required=required)


@router.get("/validate", response_model=InviteValidateResponse)
@limiter.limit("10/minute")
async def invite_validate(
    request: Request,
    code: str = Query(..., min_length=1, max_length=32),
    db: AsyncSession = Depends(get_db),
):
    """Validate an invite code (public, rate-limited)."""
    valid, reason, _ = await _validate_invite_code(db, code)
    return InviteValidateResponse(valid=valid, reason=reason)


# ---------- Authenticated Endpoints ----------

@router.post("/create", response_model=InviteCreateResponse, status_code=201)
async def invite_create(
    body: InviteCreateRequest,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an invite code. Any authenticated user can create one."""
    code = body.code or _generate_code()

    # Check uniqueness
    existing = await db.execute(select(InviteCode).where(InviteCode.code == code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Invite code already exists")

    invite = InviteCode(
        code=code,
        creator_id=user.id,
        max_uses=body.max_uses,
        expires_at=body.expires_at,
        note=body.note,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return InviteCreateResponse(
        id=str(invite.id),
        code=invite.code,
        max_uses=invite.max_uses,
        used_count=invite.used_count,
        expires_at=invite.expires_at,
        is_active=invite.is_active,
        note=invite.note,
        created_at=invite.created_at,
    )


# ---------- Internal helper for auth.py ----------

async def consume_invite_code(db: AsyncSession, code: str, invitee_id, inviter_id=None) -> InviteCode:
    """Consume an invite code: validate, create record, atomically increment used_count.

    Called by auth.py during new user registration.
    Raises HTTPException if invalid.
    """
    from ..models import InviteRecord

    valid, reason, invite = await _validate_invite_code(db, code)
    if not valid:
        raise HTTPException(status_code=400, detail=f"Invalid invite code: {reason}")

    # Atomic increment with race-condition guard
    if invite.max_uses is not None:
        result = await db.execute(
            update(InviteCode)
            .where(InviteCode.id == invite.id)
            .where(InviteCode.used_count < InviteCode.max_uses)
            .values(used_count=InviteCode.used_count + 1)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=400, detail="Invalid invite code: used_up")
    else:
        await db.execute(
            update(InviteCode)
            .where(InviteCode.id == invite.id)
            .values(used_count=InviteCode.used_count + 1)
        )

    # Create invite record
    record = InviteRecord(
        invite_code_id=invite.id,
        inviter_id=invite.creator_id,
        invitee_id=invitee_id,
    )
    db.add(record)

    return invite
