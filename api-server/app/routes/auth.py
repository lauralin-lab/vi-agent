"""Firebase Authentication routes.

POST /api/auth/firebase — create or login user via Firebase ID Token
GET  /api/auth/me       — get current user info
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, get_firebase_user
from ..models import User
from ..services.user_center import generate_vi_user_id

from ..limiter import limiter

router = APIRouter()


class FirebaseAuthResponse(BaseModel):
    user_id: str
    vi_user_id: str
    firebase_uid: str
    display_name: str | None
    email: str | None
    photo_url: str | None
    sign_in_provider: str | None
    language: str | None
    is_new_user: bool


class UserResponse(BaseModel):
    user_id: str
    vi_user_id: str
    firebase_uid: str | None
    display_name: str | None
    email: str | None
    photo_url: str | None
    sign_in_provider: str | None
    language: str | None
    created_at: str | None


@router.post("/firebase", response_model=FirebaseAuthResponse)
@limiter.limit("30/minute")
async def create_or_login_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create or get a Firebase user.

    Called by Flutter App / React Web after Firebase client-side login.

    Required Headers:
        id-token: Firebase ID Token
        package-name: App bundle identifier
        app-version: App version (optional)
        accept-language: User language preference (optional)
    """
    id_token = request.headers.get("id-token")
    package_name = request.headers.get("package-name")
    app_version = request.headers.get("app-version", "")
    language = request.headers.get("accept-language", "en")[:10]

    if not id_token or not package_name:
        raise HTTPException(status_code=401, detail="Missing id-token or package-name")

    firebase_mgr = getattr(request.app.state, "firebase_manager", None)
    if firebase_mgr is None:
        raise HTTPException(status_code=503, detail="Firebase not initialized")

    try:
        decoded = await firebase_mgr.verify_id_token(package_name, id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    firebase_uid = decoded["uid"]
    sign_in_provider = decoded.get("firebase", {}).get("sign_in_provider", "unknown")

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()
    is_new_user = user is None

    if is_new_user:
        # Get full user info from Firebase
        firebase_user = await firebase_mgr.get_user(package_name, firebase_uid)

        user = User(
            firebase_uid=firebase_uid,
            package_name=package_name,
            sign_in_provider=sign_in_provider,
            firebase_info={
                "display_name": firebase_user.display_name,
                "email": firebase_user.email,
                "photo_url": firebase_user.photo_url,
                "phone_number": firebase_user.phone_number,
                "email_verified": firebase_user.email_verified,
                "provider_data": [
                    {"provider_id": p.provider_id, "uid": p.uid}
                    for p in (firebase_user.provider_data or [])
                ],
            },
            vi_user_id=generate_vi_user_id(),
            display_name=firebase_user.display_name or "",
            email=firebase_user.email,
            photo_url=firebase_user.photo_url,
            phone_number=firebase_user.phone_number,
            language=language,
            app_version=app_version,
            last_login=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Update existing user
        user.last_login = datetime.now(timezone.utc)
        user.app_version = app_version or user.app_version
        user.sign_in_provider = sign_in_provider
        await db.commit()

    return FirebaseAuthResponse(
        user_id=str(user.id),
        vi_user_id=user.vi_user_id,
        firebase_uid=user.firebase_uid,
        display_name=user.display_name,
        email=user.email,
        photo_url=user.photo_url,
        sign_in_provider=user.sign_in_provider,
        language=user.language,
        is_new_user=is_new_user,
    )


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_firebase_user)):
    return UserResponse(
        user_id=str(user.id),
        vi_user_id=user.vi_user_id,
        firebase_uid=user.firebase_uid,
        display_name=user.display_name,
        email=user.email,
        photo_url=user.photo_url,
        sign_in_provider=user.sign_in_provider,
        language=user.language,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )
