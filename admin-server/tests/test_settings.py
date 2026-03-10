"""Tests for settings management — SET-001 to SET-013."""

import pytest


@pytest.mark.asyncio
async def test_set_001_list_settings(client, admin_user, admin_headers, sample_settings):
    """SET-001: Get all settings."""
    resp = await client.get("/admin/settings", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    # Check fields
    item = data[0]
    assert "key" in item
    assert "value" in item
    assert "is_active" in item
    assert "note" in item


@pytest.mark.asyncio
async def test_set_002_create_setting(client, admin_user, admin_headers):
    """SET-002: Create a new setting."""
    resp = await client.post(
        "/admin/settings",
        json={"key": "test_feature_flag", "value": "true", "note": "Test toggle"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["key"] == "test_feature_flag"
    assert data["value"] == "true"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_set_003_create_duplicate_key(client, admin_user, admin_headers, sample_settings):
    """SET-003: Create with duplicate key returns 409."""
    resp = await client.post(
        "/admin/settings",
        json={"key": "invite_required", "value": "false"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_set_004_update_value(client, admin_user, admin_headers, sample_settings):
    """SET-004: Update setting value."""
    resp = await client.put(
        "/admin/settings/max_retries",
        json={"value": "5", "note": "Increased retries"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["value"] == "5"


@pytest.mark.asyncio
async def test_set_005_update_is_active(client, admin_user, admin_headers, sample_settings):
    """SET-005: Update setting is_active."""
    resp = await client.put(
        "/admin/settings/feature_x",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_set_006_update_nonexistent(client, admin_user, admin_headers):
    """SET-006: Update non-existent setting returns 404."""
    resp = await client.put(
        "/admin/settings/nonexistent_key",
        json={"value": "x"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_set_007_soft_delete(client, admin_user, admin_headers, sample_settings):
    """SET-007: Soft-delete a setting."""
    resp = await client.delete("/admin/settings/feature_x", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["is_deleted"] is True


@pytest.mark.asyncio
async def test_set_008_delete_nonexistent(client, admin_user, admin_headers):
    """SET-008: Delete non-existent setting returns 404."""
    resp = await client.delete("/admin/settings/nonexistent", headers=admin_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_set_009_empty_key(client, admin_user, admin_headers):
    """SET-009: Empty key returns 422."""
    resp = await client.post(
        "/admin/settings",
        json={"key": "", "value": "something"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_set_010_missing_value(client, admin_user, admin_headers):
    """SET-010: Missing value field returns 422."""
    resp = await client.post(
        "/admin/settings",
        json={"key": "some_key"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_set_011_key_too_long(client, admin_user, admin_headers):
    """SET-011: Key longer than 100 chars returns 422."""
    resp = await client.post(
        "/admin/settings",
        json={"key": "x" * 101, "value": "v"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_set_012_get_single_setting(client, admin_user, admin_headers, sample_settings):
    """SET-012: Get single setting by key."""
    resp = await client.get("/admin/settings/invite_required", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"] == "invite_required"
    assert data["value"] == "true"


@pytest.mark.asyncio
async def test_set_013_no_auth(client):
    """SET-013: Settings endpoints without auth return 401."""
    for method, path in [
        ("GET", "/admin/settings"),
        ("POST", "/admin/settings"),
        ("PUT", "/admin/settings/x"),
        ("DELETE", "/admin/settings/x"),
    ]:
        resp = await client.request(method, path)
        assert resp.status_code == 401, f"{method} {path} should return 401"
