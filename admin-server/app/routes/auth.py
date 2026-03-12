"""Admin authentication routes."""

from fastapi import APIRouter, Depends

from ..deps import require_admin
from ..models import User
from ..schemas import AdminLoginResponse

router = APIRouter()


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(admin: User = Depends(require_admin)):
    """Admin login — verify Firebase token and check admin role."""
    return AdminLoginResponse(
        user_id=admin.id,
        email=admin.email,
        display_name=admin.display_name,
        role=admin.role,
        photo_url=admin.photo_url,
    )


@router.get("/me", response_model=AdminLoginResponse)
async def admin_me(admin: User = Depends(require_admin)):
    """Get current admin info."""
    return AdminLoginResponse(
        user_id=admin.id,
        email=admin.email,
        display_name=admin.display_name,
        role=admin.role,
        photo_url=admin.photo_url,
    )
