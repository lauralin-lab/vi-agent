import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_db, get_firebase_user
from ..models import User

from ..limiter import limiter

router = APIRouter()
logger = logging.getLogger(__name__)


class TokenResponse(BaseModel):
    token: str
    room_name: str
    livekit_url: str


class AnonymousTokenRequest(BaseModel):
    device_id: str | None = None


class AnonymousTokenResponse(BaseModel):
    token: str
    room_name: str
    livekit_url: str
    vi_user_id: str
    session_id: str | None = None


@router.post("/token", response_model=TokenResponse)
@limiter.limit("10/minute")
async def get_livekit_token(
    request: Request,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    room_name = f"vi-room-{user.vi_user_id}"

    # Identity must start with "user-" for VI agent to recognize it
    user_identity = f"user-{user.id}"

    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(user_identity)
        .with_name(user.display_name or user.email)
        .with_ttl(timedelta(hours=2))
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )

    jwt_token = token.to_jwt()

    # Agent is auto-dispatched by LiveKit's rtc_session mechanism
    # when the user joins the room — no explicit dispatch needed.

    return TokenResponse(
        token=jwt_token,
        room_name=room_name,
        livekit_url=settings.LIVEKIT_URL,
    )


@router.post("/anonymous", response_model=AnonymousTokenResponse)
@limiter.limit("10/minute")
async def get_anonymous_livekit_token(
    request: Request,
    req: AnonymousTokenRequest = AnonymousTokenRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Generate a LiveKit token without authentication.

    Creates or reuses a device-based user for persistence.
    Used for the skip-auth camera-first experience.
    """
    device_id = req.device_id or f"dev-{uuid.uuid4().hex[:16]}"
    vi_user_id = f"vi-{device_id[:16]}"

    # Find or create user for this device
    result = await db.execute(
        select(User).where(User.vi_user_id == vi_user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=f"{device_id}@anonymous.vi",
            vi_user_id=vi_user_id,
            display_name="Anonymous",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    room_name = f"vi-room-{vi_user_id}"

    # Identity must start with "user-" for VI agent to recognize it
    user_identity = f"user-{user.id}"

    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(user_identity)
        .with_name("Anonymous User")
        .with_ttl(timedelta(hours=2))
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )

    jwt_token = token.to_jwt()

    # Agent is auto-dispatched by LiveKit's rtc_session mechanism
    # when the user joins the room — no explicit dispatch needed.

    return AnonymousTokenResponse(
        token=jwt_token,
        room_name=room_name,
        livekit_url=settings.LIVEKIT_URL,
        vi_user_id=vi_user_id,
        session_id=None,
    )
