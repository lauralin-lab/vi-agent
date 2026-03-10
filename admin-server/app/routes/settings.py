"""Admin settings management routes — full CRUD with soft delete."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, require_admin
from ..models import Setting, User
from ..schemas import SettingCreate, SettingResponse, SettingUpdate

router = APIRouter()


@router.get("", response_model=list[SettingResponse])
async def list_settings(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get all settings (including soft-deleted for admin visibility)."""
    result = await db.execute(select(Setting).order_by(Setting.created_at.desc()))
    settings = result.scalars().all()
    return [SettingResponse.model_validate(s) for s in settings]


@router.get("/{key}", response_model=SettingResponse)
async def get_setting(
    key: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single setting by key."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(404, detail={"code": "setting_not_found"})
    return SettingResponse.model_validate(setting)


@router.post("", response_model=SettingResponse, status_code=201)
async def create_setting(
    body: SettingCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new setting."""
    # Check duplicate
    existing = await db.execute(select(Setting).where(Setting.key == body.key))
    if existing.scalar_one_or_none():
        raise HTTPException(409, detail={"code": "key_already_exists", "message": f"Setting '{body.key}' already exists"})

    setting = Setting(key=body.key, value=body.value, note=body.note)
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    return SettingResponse.model_validate(setting)


@router.put("/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    body: SettingUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a setting (partial update)."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(404, detail={"code": "setting_not_found"})

    if body.value is not None:
        setting.value = body.value
    if body.note is not None:
        setting.note = body.note
    if body.is_active is not None:
        setting.is_active = body.is_active

    await db.commit()
    await db.refresh(setting)
    return SettingResponse.model_validate(setting)


@router.delete("/{key}", response_model=SettingResponse)
async def delete_setting(
    key: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a setting."""
    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(404, detail={"code": "setting_not_found"})

    setting.is_deleted = True
    await db.commit()
    await db.refresh(setting)
    return SettingResponse.model_validate(setting)
