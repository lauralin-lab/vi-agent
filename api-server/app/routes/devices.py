"""Device registration and management routes.

POST   /api/devices              — report/update device info
GET    /api/devices              — list user's devices
DELETE /api/devices/{device_id}  — remove a device
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, get_firebase_user
from ..models import Device, User

router = APIRouter()


class DeviceReportRequest(BaseModel):
    device_id: str
    device_token: str | None = None
    gaid: str | None = None
    idfa: str | None = None
    idfv: str | None = None
    adjust_id: str | None = None
    app_instance_id: str | None = None
    appsflyer_id: str | None = None
    version: str | None = None
    store: str | None = None
    timezone: int | None = None
    user_agent: str | None = None


@router.post("")
async def report_device_info(
    request: Request,
    body: DeviceReportRequest,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """Report or update device info. Upsert by (device_id, package_name)."""
    package_name = request.headers.get("package-name", user.package_name or "")

    ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    user_agent = body.user_agent or request.headers.get("user-agent", "")

    result = await db.execute(
        select(Device).where(
            Device.device_id == body.device_id,
            Device.package_name == package_name,
        )
    )
    device = result.scalar_one_or_none()

    if device:
        device.user_id = user.id
        device.device_token = body.device_token or device.device_token
        device.gaid = body.gaid or device.gaid
        device.idfa = body.idfa or device.idfa
        device.idfv = body.idfv or device.idfv
        device.adjust_id = body.adjust_id or device.adjust_id
        device.app_instance_id = body.app_instance_id or device.app_instance_id
        device.appsflyer_id = body.appsflyer_id or device.appsflyer_id
        device.version = body.version or device.version
        device.store = body.store or device.store
        device.timezone = body.timezone if body.timezone is not None else device.timezone
        device.ip = ip
        device.user_agent = user_agent
        device.token_valid = True
    else:
        device = Device(
            user_id=user.id,
            device_id=body.device_id,
            package_name=package_name,
            device_token=body.device_token,
            gaid=body.gaid,
            idfa=body.idfa,
            idfv=body.idfv,
            adjust_id=body.adjust_id,
            app_instance_id=body.app_instance_id,
            appsflyer_id=body.appsflyer_id,
            version=body.version,
            store=body.store,
            timezone=body.timezone,
            ip=ip,
            user_agent=user_agent,
        )
        db.add(device)

    await db.commit()
    await db.refresh(device)

    return {
        "id": str(device.id),
        "device_id": device.device_id,
        "device_token": device.device_token[:20] + "..." if device.device_token else None,
        "updated": True,
    }


@router.get("")
async def list_devices(
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """List all devices for the current user."""
    result = await db.execute(
        select(Device).where(Device.user_id == user.id).order_by(Device.updated_at.desc())
    )
    devices = result.scalars().all()

    return [
        {
            "id": str(d.id),
            "device_id": d.device_id,
            "store": d.store,
            "version": d.version,
            "has_push_token": bool(d.device_token),
            "token_valid": d.token_valid,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }
        for d in devices
    ]


@router.delete("/{device_id}")
async def delete_device(
    device_id: str,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a device by device_id."""
    result = await db.execute(
        select(Device).where(Device.device_id == device_id, Device.user_id == user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    await db.delete(device)
    await db.commit()
    return {"ok": True}
