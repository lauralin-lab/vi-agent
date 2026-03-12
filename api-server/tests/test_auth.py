"""Tests for Firebase auth routes: /api/auth/firebase, /api/auth/me."""

import pytest
from httpx import AsyncClient

from tests.conftest import FIREBASE_AUTH_HEADERS, TEST_FIREBASE_UID, TEST_PACKAGE_NAME


class TestFirebaseAuth:
    @pytest.mark.asyncio
    async def test_firebase_login_creates_new_user(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/firebase",
            headers=FIREBASE_AUTH_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_new_user"] is True
        assert data["firebase_uid"] == TEST_FIREBASE_UID
        assert data["vi_user_id"].startswith("vi-")
        assert data["sign_in_provider"] == "google.com"

    @pytest.mark.asyncio
    async def test_firebase_login_returns_existing_user(self, client: AsyncClient, registered_user):
        resp = await client.post(
            "/api/auth/firebase",
            headers=FIREBASE_AUTH_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_new_user"] is False
        assert data["vi_user_id"] == registered_user["vi_user_id"]

    @pytest.mark.asyncio
    async def test_firebase_login_missing_headers(self, client: AsyncClient):
        resp = await client.post("/api/auth/firebase")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_firebase_login_missing_package_name(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/firebase",
            headers={"id-token": "some-token"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_firebase_login_invalid_token(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/firebase",
            headers={"id-token": "invalid-token", "package-name": TEST_PACKAGE_NAME},
        )
        assert resp.status_code == 401


class TestMe:
    @pytest.mark.asyncio
    async def test_me_authenticated(self, client: AsyncClient, auth_headers):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["firebase_uid"] == TEST_FIREBASE_UID
        assert data["vi_user_id"].startswith("vi-")
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_me_no_token(self, client: AsyncClient):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_invalid_token(self, client: AsyncClient):
        resp = await client.get(
            "/api/auth/me",
            headers={"id-token": "invalid-token", "package-name": TEST_PACKAGE_NAME},
        )
        assert resp.status_code == 401
