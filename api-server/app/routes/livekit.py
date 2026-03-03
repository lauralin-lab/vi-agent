import logging
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from livekit.api import AccessToken, CreateAgentDispatchRequest, LiveKitAPI, VideoGrants
from passlib.hash import bcrypt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..deps import get_current_user, get_db
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


async def _dispatch_agent(room_name: str) -> None:
    """Explicitly dispatch the vi-realtime agent to a room.

    This ensures an agent is always available even when reconnecting
    to an existing room where a previous agent may have left.
    """
    try:
        async with LiveKitAPI(
            url=settings.LIVEKIT_URL,
            api_key=settings.LIVEKIT_API_KEY,
            api_secret=settings.LIVEKIT_API_SECRET,
        ) as lk_api:
            req = CreateAgentDispatchRequest(room=room_name)
            if settings.VI_AGENT_NAME:
                req.agent_name = settings.VI_AGENT_NAME
            dispatch = await lk_api.agent_dispatch.create_dispatch(req)
            logger.info("Agent dispatched to room %s: %s", room_name, dispatch.id)
    except Exception as e:
        logger.warning("Failed to dispatch agent to room %s: %s", room_name, e)


@router.post("/token", response_model=TokenResponse)
@limiter.limit("10/minute")
async def get_livekit_token(
    request: Request,
    user: User = Depends(get_current_user),
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

    # Dispatch the agent to the room
    await _dispatch_agent(room_name)

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
            password_hash=bcrypt.hash("!anonymous-no-login-" + str(uuid.uuid4())),
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

    # Dispatch the agent to the room
    await _dispatch_agent(room_name)

    return AnonymousTokenResponse(
        token=jwt_token,
        room_name=room_name,
        livekit_url=settings.LIVEKIT_URL,
        vi_user_id=vi_user_id,
        session_id=None,
    )
