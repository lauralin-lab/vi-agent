"""OAuth Token Center — AES-256-GCM encrypted token storage."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import settings

logger = logging.getLogger(__name__)

USER_DATA_DIR = os.getenv("USER_DATA_DIR", "./data/users")

# Provider OAuth configs (URLs only — credentials come from env)
PROVIDER_CONFIGS = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "default_scopes": ["openid", "email", "profile"],
    },
    "notion": {
        "authorize_url": "https://api.notion.com/v1/oauth/authorize",
        "token_url": "https://api.notion.com/v1/oauth/token",
        "default_scopes": [],
    },
    "slack": {
        "authorize_url": "https://slack.com/oauth/v2/authorize",
        "token_url": "https://slack.com/api/oauth.v2.access",
        "default_scopes": ["channels:read", "chat:write"],
    },
}


def _derive_key() -> bytes:
    """Derive AES-256 key from JWT_SECRET."""
    return hashlib.sha256(settings.JWT_SECRET.encode()).digest()


def _encrypt(data: dict) -> bytes:
    """Encrypt dict as JSON with AES-256-GCM."""
    key = _derive_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)
    plaintext = json.dumps(data).encode()
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def _decrypt(data: bytes) -> dict:
    """Decrypt AES-256-GCM encrypted JSON."""
    key = _derive_key()
    aesgcm = AESGCM(key)
    nonce = data[:12]
    ciphertext = data[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode())


def _token_path(uid: str) -> Path:
    return Path(USER_DATA_DIR) / uid / "tokens" / "oauth.enc.json"


def _sync_save_encrypted_tokens(uid: str, provider: str, tokens: dict):
    path = _token_path(uid)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = {}
    if path.exists():
        try:
            existing = _decrypt(path.read_bytes())
        except Exception:
            logger.warning("Failed to decrypt existing tokens for %s, starting fresh", uid)
    existing[provider] = tokens
    path.write_bytes(_encrypt(existing))


async def save_encrypted_tokens(uid: str, provider: str, tokens: dict):
    """Save encrypted OAuth tokens to user's filesystem."""
    await asyncio.to_thread(_sync_save_encrypted_tokens, uid, provider, tokens)


def _sync_load_encrypted_tokens(uid: str, provider: str) -> dict | None:
    path = _token_path(uid)
    if not path.exists():
        return None
    try:
        all_tokens = _decrypt(path.read_bytes())
        return all_tokens.get(provider)
    except Exception:
        logger.error("Failed to decrypt tokens for %s", uid)
        return None


async def load_encrypted_tokens(uid: str, provider: str) -> dict | None:
    """Load decrypted OAuth tokens for a provider."""
    return await asyncio.to_thread(_sync_load_encrypted_tokens, uid, provider)


def _sync_delete_encrypted_tokens(uid: str, provider: str):
    path = _token_path(uid)
    if not path.exists():
        return
    try:
        all_tokens = _decrypt(path.read_bytes())
        all_tokens.pop(provider, None)
        if all_tokens:
            path.write_bytes(_encrypt(all_tokens))
        else:
            path.unlink(missing_ok=True)
    except Exception:
        logger.error("Failed to update tokens for %s", uid)


async def delete_encrypted_tokens(uid: str, provider: str):
    """Remove a provider's tokens from encrypted storage."""
    await asyncio.to_thread(_sync_delete_encrypted_tokens, uid, provider)


def get_provider_config(provider: str) -> dict | None:
    """Get OAuth configuration for a provider."""
    return PROVIDER_CONFIGS.get(provider)
