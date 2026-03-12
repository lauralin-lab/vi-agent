"""Admin dependencies — require_admin enforces admin-only access."""

import logging

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User, async_session

logger = logging.getLogger(__name__)


async def get_db():
    """Database session dependency."""
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def require_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Admin auth dependency — all admin endpoints use this.

    1. Verify Firebase ID Token
    2. Find user (not found → 401, no auto-create)
    3. Check is_active (disabled → 403)
    4. Check role='admin' (not admin → 403)
    """
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")

    if not id_token or not package_name:
        raise HTTPException(401, detail={"code": "missing_credentials", "message": "Missing id-token or package-name header"})

    firebase_mgr = getattr(request.app.state, "firebase_manager", None)
    if firebase_mgr is None:
        raise HTTPException(503, detail={"code": "auth_service_unavailable", "message": "Firebase not initialized"})

    try:
        decoded = await firebase_mgr.verify_id_token(package_name, id_token)
    except ValueError as e:
        raise HTTPException(401, detail={"code": "unknown_package", "message": str(e)})
    except Exception as e:
        err_msg = str(e)
        err_type = type(e).__name__
        if "ExpiredIdToken" in err_type or "ExpiredIdToken" in err_msg:
            raise HTTPException(401, detail={"code": "token_expired", "message": "Firebase token expired"})
        if "RevokedIdToken" in err_type or "RevokedIdToken" in err_msg:
            raise HTTPException(401, detail={"code": "token_revoked", "message": "Firebase token revoked"})
        if "InvalidIdToken" in err_type or "InvalidIdToken" in err_msg or "CertificateFetchError" in err_type:
            raise HTTPException(401, detail={"code": "invalid_token", "message": "Invalid Firebase token"})
        logger.error("Firebase auth error: %s", e, exc_info=True)
        raise HTTPException(401, detail={"code": "auth_error", "message": "Authentication failed"})

    firebase_uid = decoded["uid"]

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(401, detail={"code": "user_not_found", "message": "User not registered"})
    if not user.is_active:
        raise HTTPException(403, detail={"code": "user_disabled", "message": "Account disabled"})
    if user.role != "admin":
        raise HTTPException(403, detail={"code": "not_admin", "message": "Admin access required"})

    return user
