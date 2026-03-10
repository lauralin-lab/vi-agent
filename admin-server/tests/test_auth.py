"""Tests for admin authentication — AUTH-001 to AUTH-010."""

import pytest


@pytest.mark.asyncio
async def test_auth_001_admin_login_success(client, admin_user, admin_headers):
    """AUTH-001: Admin Google login success."""
    resp = await client.post("/admin/auth/login", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@example.com"
    assert data["role"] == "admin"
    assert data["display_name"] == "Admin User"


@pytest.mark.asyncio
async def test_auth_002_regular_user_rejected(client, regular_user, regular_headers):
    """AUTH-002: Non-admin user login rejected."""
    resp = await client.post("/admin/auth/login", headers=regular_headers)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "not_admin"


@pytest.mark.asyncio
async def test_auth_003_unknown_user_rejected(client):
    """AUTH-003: Unknown Firebase user rejected (no auto-registration)."""
    headers = {"id-token": "token-for-unknown-uid", "package-name": "com.example.viagent.ios"}
    resp = await client.post("/admin/auth/login", headers=headers)
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "user_not_found"


@pytest.mark.asyncio
async def test_auth_004_missing_id_token(client):
    """AUTH-004: Missing id-token header."""
    resp = await client.post("/admin/auth/login", headers={"package-name": "com.example"})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "missing_credentials"


@pytest.mark.asyncio
async def test_auth_005_invalid_token(client):
    """AUTH-005: Invalid Firebase token."""
    headers = {"id-token": "invalid-token", "package-name": "com.example.viagent.ios"}
    resp = await client.post("/admin/auth/login", headers=headers)
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "invalid_token"


@pytest.mark.asyncio
async def test_auth_006_expired_token(client):
    """AUTH-006: Expired Firebase token."""
    headers = {"id-token": "expired-token", "package-name": "com.example.viagent.ios"}
    resp = await client.post("/admin/auth/login", headers=headers)
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "token_expired"


@pytest.mark.asyncio
async def test_auth_007_disabled_admin_rejected(client, disabled_admin, disabled_admin_headers):
    """AUTH-007: Disabled admin login rejected."""
    resp = await client.post("/admin/auth/login", headers=disabled_admin_headers)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "user_disabled"


@pytest.mark.asyncio
async def test_auth_008_all_endpoints_require_auth(client):
    """AUTH-008: All management endpoints return 401 without token."""
    endpoints = [
        ("GET", "/admin/users"),
        ("GET", "/admin/devices"),
        ("GET", "/admin/settings"),
        ("GET", "/admin/invite-codes"),
    ]
    for method, path in endpoints:
        resp = await client.request(method, path)
        assert resp.status_code == 401, f"{method} {path} should return 401"


@pytest.mark.asyncio
async def test_auth_009_regular_user_cannot_access_admin(client, regular_user, regular_headers):
    """AUTH-009: Regular user token returns 403 on admin endpoints."""
    endpoints = [
        ("GET", "/admin/users"),
        ("GET", "/admin/devices"),
        ("GET", "/admin/settings"),
        ("GET", "/admin/invite-codes"),
    ]
    for method, path in endpoints:
        resp = await client.request(method, path, headers=regular_headers)
        assert resp.status_code == 403, f"{method} {path} should return 403 for regular user"


@pytest.mark.asyncio
async def test_auth_010_get_me(client, admin_user, admin_headers):
    """AUTH-010: GET /admin/auth/me returns admin info."""
    resp = await client.get("/admin/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "admin@example.com"
    assert data["role"] == "admin"
