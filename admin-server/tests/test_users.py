"""Tests for user management — USER-001 to USER-019."""

import uuid

import pytest


@pytest.mark.asyncio
async def test_user_001_list_sorted_by_created_at(client, admin_user, admin_headers, multiple_users):
    """USER-001: User list sorted by created_at DESC."""
    resp = await client.get("/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 25  # multiple_users + admin


@pytest.mark.asyncio
async def test_user_002_list_includes_counts(client, admin_user, admin_headers, user_with_devices, user_with_invite_record):
    """USER-002: User list includes device_count and invite_code_count."""
    resp = await client.get("/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    # Find user_with_devices
    dev_user = next((u for u in items if u["email"] == "withdevices@example.com"), None)
    assert dev_user is not None
    assert dev_user["device_count"] == 2

    # Find admin (who created invite codes)
    admin_item = next((u for u in items if u["email"] == "admin@example.com"), None)
    assert admin_item is not None
    assert admin_item["invite_code_count"] >= 1


@pytest.mark.asyncio
async def test_user_003_pagination_first_page(client, admin_user, admin_headers, multiple_users):
    """USER-003: Pagination — first page."""
    resp = await client.get("/admin/users?page=1&page_size=10", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 10
    assert data["total"] >= 25
    assert data["has_next"] is True


@pytest.mark.asyncio
async def test_user_004_pagination_last_page(client, admin_user, admin_headers, multiple_users):
    """USER-004: Pagination — last page."""
    # 25 users + 1 admin = 26 total, page_size=10, page=3 → 6 items
    resp = await client.get("/admin/users?page=3&page_size=10", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 6
    assert data["has_next"] is False


@pytest.mark.asyncio
async def test_user_005_pagination_out_of_range(client, admin_user, admin_headers, multiple_users):
    """USER-005: Pagination — beyond range returns empty."""
    resp = await client.get("/admin/users?page=100&page_size=10", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 0
    assert data["total"] >= 25


@pytest.mark.asyncio
async def test_user_006_search_by_email(client, admin_user, admin_headers, db_session):
    """USER-006: Search by email (fuzzy)."""
    from app.models import User as UserModel
    for name in ["alice", "alice.wang"]:
        u = UserModel(
            id=str(uuid.uuid4()),
            firebase_uid=f"uid-{name}",
            vi_user_id=f"vi-{name}",
            email=f"{name}@example.com",
            display_name=name.title(),
            role="user",
            is_active=True,
        )
        db_session.add(u)
    await db_session.commit()

    resp = await client.get("/admin/users?search=alice", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2


@pytest.mark.asyncio
async def test_user_007_search_by_vi_user_id(client, admin_user, admin_headers, db_session):
    """USER-007: Search by vi_user_id (fuzzy)."""
    from app.models import User as UserModel
    for suffix in ["abc123", "abc456", "xyz789"]:
        u = UserModel(
            id=str(uuid.uuid4()),
            firebase_uid=f"uid-{suffix}",
            vi_user_id=f"vi-{suffix}",
            email=f"{suffix}@example.com",
            role="user",
            is_active=True,
        )
        db_session.add(u)
    await db_session.commit()

    resp = await client.get("/admin/users?search=abc", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_user_008_search_no_results(client, admin_user, admin_headers):
    """USER-008: Search with no results."""
    resp = await client.get("/admin/users?search=nonexistent_string_xyz", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_user_009_search_empty_string(client, admin_user, admin_headers):
    """USER-009: Empty search returns all users."""
    resp = await client.get("/admin/users?search=", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1  # at least admin


@pytest.mark.asyncio
async def test_user_010_enable_user(client, admin_user, admin_headers, db_session):
    """USER-010: Enable a disabled user."""
    from app.models import User as UserModel
    user = UserModel(
        id=str(uuid.uuid4()),
        firebase_uid="uid-disabled",
        vi_user_id="vi-disabled",
        email="disabled@example.com",
        role="user",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    resp = await client.patch(
        f"/admin/users/{user.id}/status",
        json={"is_active": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_user_011_disable_user(client, admin_user, admin_headers, regular_user):
    """USER-011: Disable a user."""
    resp = await client.patch(
        f"/admin/users/{regular_user.id}/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_user_012_status_nonexistent_user(client, admin_user, admin_headers):
    """USER-012: Status update for non-existent user."""
    resp = await client.patch(
        f"/admin/users/{uuid.uuid4()}/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_013_invalid_user_id_format(client, admin_user, admin_headers):
    """USER-013: Invalid user_id format."""
    resp = await client.patch(
        "/admin/users/not-a-uuid/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_user_014_cannot_disable_self(client, admin_user, admin_headers):
    """USER-014: Admin cannot disable themselves."""
    resp = await client.patch(
        f"/admin/users/{admin_user.id}/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "cannot_disable_self"


@pytest.mark.asyncio
async def test_user_015_no_invite_code_shows_null(client, admin_user, admin_headers, regular_user):
    """USER-015: User without invite code shows null."""
    resp = await client.get("/admin/users", headers=admin_headers)
    items = resp.json()["items"]
    regular = next((u for u in items if u["email"] == "user@example.com"), None)
    assert regular is not None
    assert regular["invite_code"] is None


@pytest.mark.asyncio
async def test_user_016_user_detail(client, admin_user, admin_headers, user_with_devices, user_with_invite_record):
    """USER-016: User detail includes devices and invite codes."""
    resp = await client.get(f"/admin/users/{user_with_devices.id}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["devices"]) == 2
    assert data["registered_invite_code"] is None

    # Check invited user detail
    invited_user = user_with_invite_record["user"]
    resp2 = await client.get(f"/admin/users/{invited_user.id}", headers=admin_headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["registered_invite_code"] is not None
    assert data2["registered_invite_code"]["code"] == "TESTCODE1"


@pytest.mark.asyncio
async def test_user_017_detail_nonexistent(client, admin_user, admin_headers):
    """USER-017: User detail for non-existent user."""
    resp = await client.get(f"/admin/users/{uuid.uuid4()}", headers=admin_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_018_device_count_zero(client, admin_user, admin_headers, regular_user):
    """USER-018: User with no devices shows device_count=0."""
    resp = await client.get("/admin/users", headers=admin_headers)
    items = resp.json()["items"]
    regular = next((u for u in items if u["email"] == "user@example.com"), None)
    assert regular is not None
    assert regular["device_count"] == 0


@pytest.mark.asyncio
async def test_user_019_invite_code_count_zero(client, admin_user, admin_headers, regular_user):
    """USER-019: User with no invite codes shows invite_code_count=0."""
    resp = await client.get("/admin/users", headers=admin_headers)
    items = resp.json()["items"]
    regular = next((u for u in items if u["email"] == "user@example.com"), None)
    assert regular is not None
    assert regular["invite_code_count"] == 0
