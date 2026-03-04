"""OAuth Token Center routes."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_current_user_or_device, get_db, get_redis
from ..models import OAuthToken, User
from ..services.token_center import (
    PROVIDER_CONFIGS,
    delete_encrypted_tokens,
    get_provider_config,
    load_encrypted_tokens,
    save_encrypted_tokens,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# OAuth client credentials from environment
OAUTH_CLIENTS = {
    "google": {
        "client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
    },
    "notion": {
        "client_id": os.getenv("NOTION_OAUTH_CLIENT_ID", ""),
        "client_secret": os.getenv("NOTION_OAUTH_CLIENT_SECRET", ""),
    },
    "slack": {
        "client_id": os.getenv("SLACK_OAUTH_CLIENT_ID", ""),
        "client_secret": os.getenv("SLACK_OAUTH_CLIENT_SECRET", ""),
    },
}

API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

# OAuth state TTL: 10 minutes
OAUTH_STATE_TTL = 600


def _validate_provider(provider: str):
    if provider not in PROVIDER_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


class ConnectResponse(BaseModel):
    authorization_url: str
    state: str


class CallbackRequest(BaseModel):
    code: str
    state: str


class TokenStatus(BaseModel):
    provider: str
    connected: bool
    scopes: list[str] | None = None
    connected_at: str | None = None
    expires_at: str | None = None


@router.post("/connect/{provider}", response_model=ConnectResponse)
async def connect_provider(
    provider: str,
    request: Request,
    scopes: str | None = Query(None),
    user: User = Depends(get_current_user_or_device),
    redis=Depends(get_redis),
):
    """Initiate OAuth flow — returns authorization URL."""
    _validate_provider(provider)

    client = OAUTH_CLIENTS.get(provider, {})
    if not client.get("client_id"):
        raise HTTPException(status_code=501, detail=f"OAuth not configured for {provider}")

    config = get_provider_config(provider)
    state = uuid.uuid4().hex

    # Store state in Redis for CSRF validation on callback
    if redis:
        state_key = f"oauth_state:{state}"
        state_data = f"{user.vi_user_id}:{provider}"
        await redis.set(state_key, state_data, ex=OAUTH_STATE_TTL)
    else:
        logger.warning("Redis unavailable — OAuth state cannot be validated on callback")

    requested_scopes = scopes.split(",") if scopes else config["default_scopes"]
    callback_url = f"{API_BASE_URL}/api/tokens/callback/{provider}"

    params = {
        "client_id": client["client_id"],
        "redirect_uri": callback_url,
        "response_type": "code",
        "state": state,
    }

    if requested_scopes:
        params["scope"] = " ".join(requested_scopes)

    if provider == "notion":
        params["owner"] = "user"

    authorization_url = f"{config['authorize_url']}?{urlencode(params)}"

    return ConnectResponse(authorization_url=authorization_url, state=state)


@router.get("/callback/{provider}")
async def oauth_callback(
    provider: str,
    request: Request,
    code: str = Query(...),
    state: str = Query(""),
    user: User = Depends(get_current_user_or_device),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """OAuth callback — exchange code for tokens and store encrypted."""
    _validate_provider(provider)

    # Validate OAuth state to prevent CSRF attacks
    if redis and state:
        state_key = f"oauth_state:{state}"
        stored = await redis.get(state_key)
        if not stored:
            raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
        expected = f"{user.vi_user_id}:{provider}"
        if stored != expected:
            raise HTTPException(status_code=400, detail="OAuth state mismatch")
        # One-time use: delete after validation
        await redis.delete(state_key)
    elif redis and not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state parameter")

    client = OAUTH_CLIENTS.get(provider, {})
    config = get_provider_config(provider)
    callback_url = f"{API_BASE_URL}/api/tokens/callback/{provider}"

    # Exchange code for tokens
    async with httpx.AsyncClient() as http:
        token_data = {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "code": code,
            "redirect_uri": callback_url,
            "grant_type": "authorization_code",
        }
        resp = await http.post(config["token_url"], data=token_data)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Token exchange failed: {resp.text}")
        tokens = resp.json()

    # Save encrypted tokens
    await save_encrypted_tokens(user.vi_user_id, provider, tokens)

    # Upsert DB metadata
    existing = await db.execute(
        select(OAuthToken).where(
            OAuthToken.user_id == user.id,
            OAuthToken.provider == provider,
        )
    )
    oauth_record = existing.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if oauth_record:
        oauth_record.status = "active"
        oauth_record.connected_at = now
        oauth_record.scopes = tokens.get("scope", "").split()
    else:
        oauth_record = OAuthToken(
            user_id=user.id,
            provider=provider,
            scopes=tokens.get("scope", "").split(),
            status="active",
            connected_at=now,
        )
        db.add(oauth_record)

    await db.commit()

    return {"ok": True, "provider": provider, "status": "connected"}


@router.get("/{provider}/status", response_model=TokenStatus)
async def get_token_status(
    provider: str,
    user: User = Depends(get_current_user_or_device),
    db: AsyncSession = Depends(get_db),
):
    """Check token validity for a provider."""
    _validate_provider(provider)

    result = await db.execute(
        select(OAuthToken).where(
            OAuthToken.user_id == user.id,
            OAuthToken.provider == provider,
        )
    )
    record = result.scalar_one_or_none()

    if not record or record.status != "active":
        return TokenStatus(provider=provider, connected=False)

    return TokenStatus(
        provider=provider,
        connected=True,
        scopes=record.scopes,
        connected_at=record.connected_at.isoformat() if record.connected_at else None,
        expires_at=record.expires_at.isoformat() if record.expires_at else None,
    )


@router.post("/{provider}/refresh")
async def refresh_token(
    provider: str,
    user: User = Depends(get_current_user_or_device),
    db: AsyncSession = Depends(get_db),
):
    """Refresh an expired token."""
    _validate_provider(provider)

    tokens = await load_encrypted_tokens(user.vi_user_id, provider)
    if not tokens or not tokens.get("refresh_token"):
        raise HTTPException(status_code=400, detail="No refresh token available")

    client = OAUTH_CLIENTS.get(provider, {})
    config = get_provider_config(provider)

    async with httpx.AsyncClient() as http:
        refresh_data = {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "refresh_token": tokens["refresh_token"],
            "grant_type": "refresh_token",
        }
        resp = await http.post(config["token_url"], data=refresh_data)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Token refresh failed: {resp.text}")
        new_tokens = resp.json()

    # Preserve refresh_token if not returned
    if "refresh_token" not in new_tokens and "refresh_token" in tokens:
        new_tokens["refresh_token"] = tokens["refresh_token"]

    await save_encrypted_tokens(user.vi_user_id, provider, new_tokens)

    # Update DB
    result = await db.execute(
        select(OAuthToken).where(
            OAuthToken.user_id == user.id,
            OAuthToken.provider == provider,
        )
    )
    record = result.scalar_one_or_none()
    if record:
        record.last_refreshed_at = datetime.now(timezone.utc)
        await db.commit()

    return {"ok": True, "provider": provider}


@router.delete("/{provider}")
async def revoke_token(
    provider: str,
    user: User = Depends(get_current_user_or_device),
    db: AsyncSession = Depends(get_db),
):
    """Revoke authorization for a provider."""
    _validate_provider(provider)

    await delete_encrypted_tokens(user.vi_user_id, provider)

    # Update DB status
    result = await db.execute(
        select(OAuthToken).where(
            OAuthToken.user_id == user.id,
            OAuthToken.provider == provider,
        )
    )
    record = result.scalar_one_or_none()
    if record:
        record.status = "revoked"
        await db.commit()

    return {"ok": True, "provider": provider, "status": "revoked"}
