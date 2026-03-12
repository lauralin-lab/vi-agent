"""Admin device management routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, require_admin
from ..models import Device, User
from ..schemas import DeviceListItem, PaginatedResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[DeviceListItem])
async def list_devices(
    user_id: UUID | None = Query(None),
    device_token: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List devices with optional filters."""
    filters = []
    if user_id:
        filters.append(Device.user_id == str(user_id))
    if device_token:
        filters.append(Device.device_token == device_token)

    # Count
    count_stmt = select(func.count(Device.id))
    if filters:
        count_stmt = count_stmt.where(*filters)
    total = (await db.execute(count_stmt)).scalar() or 0

    # Query with user email join
    stmt = (
        select(Device, User.email.label("user_email"))
        .outerjoin(User, User.id == Device.user_id)
        .order_by(Device.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    if filters:
        stmt = stmt.where(*filters)

    rows = (await db.execute(stmt)).all()

    items = [
        DeviceListItem(
            id=row[0].id,
            user_id=row[0].user_id,
            user_email=row.user_email,
            device_id=row[0].device_id,
            device_token=row[0].device_token,
            token_valid=row[0].token_valid,
            version=row[0].version,
            store=row[0].store,
            updated_at=row[0].updated_at,
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
