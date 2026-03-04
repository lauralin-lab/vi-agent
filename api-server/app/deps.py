from fastapi import Depends, Header, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import User, async_session
from .services.token_service import decode_access_token

security = HTTPBearer(auto_error=False)


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


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: missing subject"
            )
        try:
            import uuid as _uuid
            _uuid.UUID(str(user_id))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: bad subject format"
            )
    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


async def get_current_user_or_device(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    vi_user_id: str | None = Query(None),
    x_internal_token: str | None = Header(None, alias="X-Internal-Token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via JWT bearer token, vi_user_id query param, or internal token.

    Priority:
    1. JWT bearer token (strict — invalid JWT is an error)
    2. X-Internal-Token + vi_user_id query param (internal service calls)
    3. vi_user_id query param alone (device auth)
    """
    import os

    # If JWT credentials are provided, validate them strictly
    if credentials and credentials.credentials:
        try:
            return await get_current_user(credentials=credentials, db=db)
        except HTTPException:
            raise  # Don't fall through — invalid JWT is an error

    # Internal service auth: X-Internal-Token + vi_user_id
    if x_internal_token and vi_user_id:
        expected_token = os.getenv("INTERNAL_API_TOKEN", "")
        if not expected_token:
            expected_token = "vi-internal-dev-token"
        if x_internal_token == expected_token:
            result = await db.execute(
                select(User).where(User.vi_user_id == vi_user_id)
            )
            user = result.scalar_one_or_none()
            if user is not None:
                return user

    # No JWT provided — try device auth via query param
    if vi_user_id:
        result = await db.execute(
            select(User).where(User.vi_user_id == vi_user_id)
        )
        user = result.scalar_one_or_none()
        if user is not None:
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
