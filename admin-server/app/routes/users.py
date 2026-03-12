"""Admin user management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..deps import get_db, require_admin
from ..models import Device, InviteCode, InviteRecord, User
from ..schemas import (
    DeviceBrief,
    InviteCodeBrief,
    PaginatedResponse,
    RegisteredInviteCode,
    UserDetailResponse,
    UserListItem,
    UserStatusResponse,
    UserStatusUpdate,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[UserListItem])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=200),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List users with pagination and search."""
    # Base query
    base_filter = []
    if search:
        base_filter.append(
            or_(
                User.email.ilike(f"%{search}%"),
                User.vi_user_id.ilike(f"%{search}%"),
            )
        )

    # Count total
    count_stmt = select(func.count(User.id))
    if base_filter:
        count_stmt = count_stmt.where(*base_filter)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Main query with subquery counts
    device_count_sub = (
        select(func.count(Device.id))
        .where(Device.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    invite_code_count_sub = (
        select(func.count(InviteCode.id))
        .where(InviteCode.creator_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )

    # Get the invite code used for registration via InviteRecord
    invite_code_sub = (
        select(InviteCode.code)
        .join(InviteRecord, InviteRecord.invite_code_id == InviteCode.id)
        .where(InviteRecord.invitee_id == User.id)
        .correlate(User)
        .limit(1)
        .scalar_subquery()
    )

    stmt = (
        select(
            User,
            device_count_sub.label("device_count"),
            invite_code_count_sub.label("invite_code_count"),
            invite_code_sub.label("invite_code"),
        )
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if base_filter:
        stmt = stmt.where(*base_filter)

    rows = (await db.execute(stmt)).all()

    items = []
    for row in rows:
        user = row[0]
        items.append(
            UserListItem(
                id=user.id,
                vi_user_id=user.vi_user_id,
                firebase_uid=user.firebase_uid,
                email=user.email,
                display_name=user.display_name,
                is_active=user.is_active,
                role=user.role,
                last_login=user.last_login,
                created_at=user.created_at,
                invite_code=row.invite_code,
                device_count=row.device_count or 0,
                invite_code_count=row.invite_code_count or 0,
            )
        )

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get user detail with devices and invite codes."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.devices))
        .where(User.id == str(user_id))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, detail={"code": "user_not_found"})

    # Get created invite codes
    codes_result = await db.execute(
        select(InviteCode).where(InviteCode.creator_id == str(user_id))
    )
    created_codes = codes_result.scalars().all()

    # Get registered invite code (the code used when this user signed up)
    record_result = await db.execute(
        select(InviteRecord)
        .where(InviteRecord.invitee_id == str(user_id))
        .limit(1)
    )
    record = record_result.scalar_one_or_none()
    registered_invite_code = None
    if record:
        code_result = await db.execute(
            select(InviteCode).where(InviteCode.id == str(record.invite_code_id))
        )
        invite_code = code_result.scalar_one_or_none()
        if invite_code:
            registered_invite_code = RegisteredInviteCode(id=invite_code.id, code=invite_code.code)

    return UserDetailResponse(
        id=user.id,
        vi_user_id=user.vi_user_id,
        firebase_uid=user.firebase_uid,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        role=user.role,
        last_login=user.last_login,
        created_at=user.created_at,
        registered_invite_code=registered_invite_code,
        devices=[
            DeviceBrief(
                id=d.id,
                device_token=d.device_token,
                updated_at=d.updated_at,
                token_valid=d.token_valid,
            )
            for d in user.devices
        ],
        created_invite_codes=[
            InviteCodeBrief(
                id=c.id,
                code=c.code,
                used_count=c.used_count,
                max_uses=c.max_uses,
            )
            for c in created_codes
        ],
    )


@router.patch("/{user_id}/status", response_model=UserStatusResponse)
async def update_user_status(
    user_id: UUID,
    body: UserStatusUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Enable/disable a user. Admin cannot disable themselves."""
    if str(user_id) == str(admin.id) and not body.is_active:
        raise HTTPException(400, detail={"code": "cannot_disable_self", "message": "Admin cannot disable themselves"})

    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, detail={"code": "user_not_found"})

    user.is_active = body.is_active
    await db.commit()
    await db.refresh(user)

    return UserStatusResponse(id=user.id, is_active=user.is_active)
