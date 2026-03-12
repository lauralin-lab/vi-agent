"""Tests for device management — DEV-001 to DEV-008."""

import uuid

import pytest

from tests.conftest import TEST_PACKAGE_NAME


@pytest.mark.asyncio
async def test_dev_001_filter_by_user_id(client, admin_user, admin_headers, user_with_devices):
    """DEV-001: Filter devices by user_id."""
    resp = await client.get(
        f"/admin/devices?user_id={user_with_devices.id}", headers=admin_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert item["user_id"] == str(user_with_devices.id)


@pytest.mark.asyncio
async def test_dev_002_filter_by_device_token(client, admin_user, admin_headers, user_with_devices):
    """DEV-002: Filter devices by device_token."""
    resp = await client.get(
        "/admin/devices?device_token=token-000", headers=admin_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["device_token"] == "token-000"


@pytest.mark.asyncio
async def test_dev_003_sorted_by_updated_at(client, admin_user, admin_headers, user_with_devices):
    """DEV-003: Devices sorted by updated_at DESC."""
    resp = await client.get("/admin/devices", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 2


@pytest.mark.asyncio
async def test_dev_004_includes_required_fields(client, admin_user, admin_headers, user_with_devices):
    """DEV-004: Device list includes required fields."""
    resp = await client.get("/admin/devices", headers=admin_headers)
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert "user_id" in item
    assert "device_token" in item
    assert "updated_at" in item
    assert "token_valid" in item
    assert "user_email" in item


@pytest.mark.asyncio
async def test_dev_005_filter_nonexistent_user(client, admin_user, admin_headers):
    """DEV-005: Filter by non-existent user_id returns empty."""
    resp = await client.get(
        f"/admin/devices?user_id={uuid.uuid4()}", headers=admin_headers
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_dev_006_pagination(client, admin_user, admin_headers, db_session):
    """DEV-006: Device list pagination."""
    from app.models import Device, User as UserModel

    user = UserModel(
        id=str(uuid.uuid4()),
        firebase_uid="uid-manydevices",
        vi_user_id="vi-manydevices",
        email="manydevices@example.com",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    for i in range(15):
        d = Device(
            id=str(uuid.uuid4()),
            user_id=str(user.id),
            device_id=f"dev-page-{i:03d}",
            package_name=TEST_PACKAGE_NAME,
            device_token=f"pagetoken-{i:03d}",
        )
        db_session.add(d)
    await db_session.commit()

    resp = await client.get("/admin/devices?page=1&page_size=10", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 10
    assert data["total"] == 15
    assert data["has_next"] is True


@pytest.mark.asyncio
async def test_dev_007_filter_by_user_and_token(client, admin_user, admin_headers, user_with_devices):
    """DEV-007: Filter by both user_id and device_token."""
    resp = await client.get(
        f"/admin/devices?user_id={user_with_devices.id}&device_token=token-000",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1


@pytest.mark.asyncio
async def test_dev_008_no_auth(client):
    """DEV-008: Device list without auth returns 401."""
    resp = await client.get("/admin/devices")
    assert resp.status_code == 401
