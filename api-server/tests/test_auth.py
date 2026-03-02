"""Tests for auth routes: signup, login, me."""

import pytest
from httpx import AsyncClient

from tests.conftest import TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER_DISPLAY_NAME


class TestSignup:
    @pytest.mark.asyncio
    async def test_signup_success(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/signup",
            json={
                "email": "new@example.com",
                "password": "pass1234secure",
                "display_name": "New User",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["email"] == "new@example.com"
        assert data["display_name"] == "New User"
        assert data["vi_user_id"].startswith("vi-")
        assert "user_id" in data

    @pytest.mark.asyncio
    async def test_signup_duplicate_email(self, client: AsyncClient, registered_user):
        resp = await client.post(
            "/api/auth/signup",
            json={
                "email": TEST_USER_EMAIL,
                "password": "another_pass_secure",
                "display_name": "Duplicate",
            },
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_signup_invalid_email(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/signup",
            json={"email": "not-an-email", "password": "pass1234secure"},
        )
        assert resp.status_code == 422  # Pydantic validation error

    @pytest.mark.asyncio
    async def test_signup_missing_password(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/signup",
            json={"email": "x@example.com"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_signup_without_display_name(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/signup",
            json={"email": "nodisplay@example.com", "password": "pass1234secure"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["display_name"] is None


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, registered_user):
        resp = await client.post(
            "/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["email"] == TEST_USER_EMAIL
        assert data["vi_user_id"] == registered_user["vi_user_id"]

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient, registered_user):
        resp = await client.post(
            "/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": "wrongpass1234"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "pass1234secure"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_invalid_email_format(self, client: AsyncClient):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "bad-email", "password": "pass1234secure"},
        )
        assert resp.status_code == 422


class TestMe:
    @pytest.mark.asyncio
    async def test_me_authenticated(self, client: AsyncClient, auth_headers):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == TEST_USER_EMAIL
        assert data["vi_user_id"].startswith("vi-")
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_me_no_token(self, client: AsyncClient):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 401  # No credentials → 401 Unauthorized

    @pytest.mark.asyncio
    async def test_me_invalid_token(self, client: AsyncClient):
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.jwt.token"},
        )
        assert resp.status_code == 401
