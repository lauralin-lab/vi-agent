"""Tests for LiveKit token route."""

import pytest
from httpx import AsyncClient


class TestLiveKitToken:
    @pytest.mark.asyncio
    async def test_get_token_authenticated(self, client: AsyncClient, auth_headers, registered_user):
        resp = await client.post("/api/livekit/token", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "room_name" in data
        assert "livekit_url" in data
        # Room name should contain the user's vi_user_id
        assert registered_user["vi_user_id"] in data["room_name"]
        assert data["room_name"].startswith("vi-room-")

    @pytest.mark.asyncio
    async def test_get_token_no_auth(self, client: AsyncClient):
        resp = await client.post("/api/livekit/token")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_token_is_valid_jwt(self, client: AsyncClient, auth_headers):
        resp = await client.post("/api/livekit/token", headers=auth_headers)
        token = resp.json()["token"]
        # LiveKit tokens are JWTs with 3 dot-separated parts
        parts = token.split(".")
        assert len(parts) == 3
