import logging

from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import User, async_session

logger = logging.getLogger(__name__)


async def get_db():
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def get_redis(request: Request):
    """Return the Redis client stored on app.state, or None if unavailable."""
    return getattr(request.app.state, "redis", None)


async def get_firebase_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Firebase Auth Dependency — verify Firebase ID Token and return User.

    Required Headers:
        id-token: Firebase ID Token
        package-name: App bundle identifier
    """
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")

    if not id_token or not package_name:
        raise HTTPException(
            status_code=401,
            detail={"code": "missing_credentials", "message": "Missing id-token or package-name header"},
        )

    # --- Test login bypass ---
    if settings.TEST_LOGIN_CODE and id_token == settings.TEST_LOGIN_CODE:
        result = await db.execute(select(User).where(User.firebase_uid == "test-user-auto"))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail={"code": "user_not_found", "message": "Test user not registered. Call POST /api/auth/firebase first."})
        if not user.is_active:
            raise HTTPException(status_code=403, detail={"code": "user_disabled", "message": "Account disabled"})
        return user

    # --- Normal Firebase verification ---
    firebase_mgr = getattr(request.app.state, "firebase_manager", None)
    if firebase_mgr is None:
        raise HTTPException(
            status_code=503,
            detail={"code": "auth_service_unavailable", "message": "Firebase not initialized"},
        )

    try:
        decoded = await firebase_mgr.verify_id_token(package_name, id_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail={"code": "unknown_package", "message": str(e)})
    except Exception as e:
        err_msg = str(e)
        err_type = type(e).__name__
        if "ExpiredIdToken" in err_type or "ExpiredIdToken" in err_msg:
            raise HTTPException(status_code=401, detail={"code": "token_expired", "message": "Firebase token expired"})
        if "RevokedIdToken" in err_type or "RevokedIdToken" in err_msg:
            raise HTTPException(status_code=401, detail={"code": "token_revoked", "message": "Firebase token revoked"})
        if "InvalidIdToken" in err_type or "InvalidIdToken" in err_msg or "CertificateFetchError" in err_type:
            raise HTTPException(status_code=401, detail={"code": "invalid_token", "message": "Invalid Firebase token"})
        logger.error("Firebase auth error: %s", e, exc_info=True)
        raise HTTPException(status_code=401, detail={"code": "auth_error", "message": "Authentication failed"})

    firebase_uid = decoded["uid"]

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail={"code": "user_not_found", "message": "User not registered"})
    if not user.is_active:
        raise HTTPException(status_code=403, detail={"code": "user_disabled", "message": "Account disabled"})

    return user


async def get_current_user_or_device(
    request: Request,
    vi_user_id: str | None = Query(None),
    x_internal_token: str | None = Header(None, alias="X-Internal-Token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via Firebase, vi_user_id, or internal token.

    Priority:
    1. Firebase auth (id-token + package-name headers)
    2. X-Internal-Token + vi_user_id query param (internal service calls)
    3. vi_user_id query param alone (device auth)
    """
    # 1. Try Firebase auth first
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")

    if id_token and package_name:
        return await get_firebase_user(request, db)

    # 2. Internal service auth: X-Internal-Token + vi_user_id
    if x_internal_token and vi_user_id:
        from .routes.internal import INTERNAL_API_TOKEN
        if x_internal_token == INTERNAL_API_TOKEN:
            result = await db.execute(
                select(User).where(User.vi_user_id == vi_user_id)
            )
            user = result.scalar_one_or_none()
            if user is not None:
                if not user.is_active:
                    raise HTTPException(status_code=403, detail={"code": "user_disabled", "message": "Account disabled"})
                return user
            # Internal services with valid token: create a synthetic user
            # so endpoints like presign work without a DB row
            synthetic = User(vi_user_id=vi_user_id, is_active=True)
            return synthetic

    # 3. Device auth via query param
    if vi_user_id:
        result = await db.execute(
            select(User).where(User.vi_user_id == vi_user_id)
        )
        user = result.scalar_one_or_none()
        if user is not None:
            if not user.is_active:
                raise HTTPException(status_code=403, detail={"code": "user_disabled", "message": "Account disabled"})
            return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )


async def verify_device_ownership(
    vi_user_id: str = Query(...),
    x_device_id: str = Header(None, alias="X-Device-Id"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Verify device owns this vi_user_id."""
    if not x_device_id:
        raise HTTPException(status_code=401, detail="X-Device-Id header required")

    expected_vi_user_id = f"vi-{x_device_id[:16]}"
    if vi_user_id != expected_vi_user_id:
        raise HTTPException(status_code=403, detail="Device ID does not match user")

    result = await db.execute(select(User).where(User.vi_user_id == vi_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
