"""Admin invite code management routes."""

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, require_admin
from ..models import InviteCode, InviteRecord, User
from ..schemas import (
    InviteCodeCreate,
    InviteCodeDetailResponse,
    InviteCodeListItem,
    InviteCodeStatusUpdate,
    InviteCodeUserBrief,
    PaginatedResponse,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[InviteCodeListItem])
async def list_invite_codes(
    creator_id: UUID | None = Query(None),
    include_deleted: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List invite codes with optional creator filter."""
    filters = []
    if creator_id:
        filters.append(InviteCode.creator_id == str(creator_id))
    if not include_deleted:
        filters.append(InviteCode.is_deleted.is_(False))

    # Count
    count_stmt = select(func.count(InviteCode.id))
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Query with creator email
    stmt = (
        select(InviteCode, User.email.label("creator_email"))
        .outerjoin(User, User.id == InviteCode.creator_id)
        .order_by(InviteCode.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if filters:
        stmt = stmt.where(*filters)

    rows = (await db.execute(stmt)).all()

    items = [
        InviteCodeListItem(
            id=row[0].id,
            code=row[0].code,
            creator_id=row[0].creator_id,
            creator_email=row.creator_email,
            max_uses=row[0].max_uses,
            used_count=row[0].used_count,
            expires_at=row[0].expires_at,
            is_active=row[0].is_active,
            note=row[0].note,
            created_at=row[0].created_at,
        )
        for row in rows
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{invite_code_id}", response_model=InviteCodeDetailResponse)
async def get_invite_code_detail(
    invite_code_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get invite code detail with users who used it."""
    result = await db.execute(
        select(InviteCode).where(InviteCode.id == str(invite_code_id))
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, detail={"code": "invite_code_not_found"})

    # Creator email
    creator_email = None
    if code.creator_id:
        creator_result = await db.execute(select(User.email).where(User.id == str(code.creator_id)))
        creator_email = creator_result.scalar_one_or_none()

    # Users who used this invite code
    records_result = await db.execute(
        select(InviteRecord, User)
        .join(User, User.id == InviteRecord.invitee_id)
        .where(InviteRecord.invite_code_id == str(invite_code_id))
        .order_by(InviteRecord.created_at.desc())
    )
    records = records_result.all()

    users = [
        InviteCodeUserBrief(
            id=row[1].id,
            email=row[1].email,
            created_at=row[0].created_at,
        )
        for row in records
    ]

    return InviteCodeDetailResponse(
        id=code.id,
        code=code.code,
        creator_id=code.creator_id,
        creator_email=creator_email,
        max_uses=code.max_uses,
        used_count=code.used_count,
        expires_at=code.expires_at,
        is_active=code.is_active,
        note=code.note,
        created_at=code.created_at,
        users=users,
    )


@router.post("", response_model=InviteCodeListItem, status_code=201)
async def create_invite_code(
    body: InviteCodeCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new invite code."""
    # Validate creator exists
    creator_result = await db.execute(select(User).where(User.id == str(body.creator_id)))
    creator = creator_result.scalar_one_or_none()
    if not creator:
        raise HTTPException(404, detail={"code": "creator_not_found", "message": "Creator user not found"})

    # Validate expires_at is in the future
    if body.expires_at and body.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, detail={"code": "expired_date", "message": "Expiration date must be in the future"})

    # Generate code if not provided
    code_str = body.code or secrets.token_hex(4).upper()

    # Check duplicate code
    existing = await db.execute(select(InviteCode).where(InviteCode.code == code_str))
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail={"code": "code_already_exists", "message": f"Code '{code_str}' already exists"})

    invite_code = InviteCode(
        code=code_str,
        creator_id=str(body.creator_id),
        max_uses=body.max_uses,
        expires_at=body.expires_at,
        note=body.note,
    )
    db.add(invite_code)
    await db.commit()
    await db.refresh(invite_code)

    return InviteCodeListItem(
        id=invite_code.id,
        code=invite_code.code,
        creator_id=invite_code.creator_id,
        creator_email=creator.email,
        max_uses=invite_code.max_uses,
        used_count=invite_code.used_count,
        expires_at=invite_code.expires_at,
        is_active=invite_code.is_active,
        note=invite_code.note,
        created_at=invite_code.created_at,
    )


@router.delete("/{invite_code_id}")
async def delete_invite_code(
    invite_code_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete an invite code."""
    result = await db.execute(
        select(InviteCode).where(InviteCode.id == str(invite_code_id))
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, detail={"code": "invite_code_not_found"})

    code.is_active = False
    code.is_deleted = True
    code.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    return {"ok": True}


@router.patch("/{invite_code_id}/status", response_model=InviteCodeListItem)
async def update_invite_code_status(
    invite_code_id: UUID,
    body: InviteCodeStatusUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Enable/disable an invite code."""
    result = await db.execute(
        select(InviteCode).where(InviteCode.id == str(invite_code_id))
    )
    code = result.scalar_one_or_none()
    if not code:
        raise HTTPException(404, detail={"code": "invite_code_not_found"})

    code.is_active = body.is_active
    await db.commit()
    await db.refresh(code)

    # Get creator email
    creator_email = None
    if code.creator_id:
        creator_result = await db.execute(select(User.email).where(User.id == code.creator_id))
        creator_email = creator_result.scalar_one_or_none()

    return InviteCodeListItem(
        id=code.id,
        code=code.code,
        creator_id=code.creator_id,
        creator_email=creator_email,
        max_uses=code.max_uses,
        used_count=code.used_count,
        expires_at=code.expires_at,
        is_active=code.is_active,
        note=code.note,
        created_at=code.created_at,
    )
