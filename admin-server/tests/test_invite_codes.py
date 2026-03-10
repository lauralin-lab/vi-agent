"""Tests for invite code management — INV-001 to INV-016."""

import uuid
from datetime import datetime, timezone

import pytest


@pytest.mark.asyncio
async def test_inv_001_list_invite_codes(client, admin_user, admin_headers, sample_invite_codes):
    """INV-001: List invite codes."""
    resp = await client.get("/admin/invite-codes", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    item = data["items"][0]
    assert "id" in item
    assert "code" in item
    assert "creator_id" in item
    assert "used_count" in item
    assert "max_uses" in item


@pytest.mark.asyncio
async def test_inv_002_list_pagination(client, admin_user, admin_headers, db_session):
    """INV-002: Invite code list pagination."""
    from app.models import InviteCode

    for i in range(15):
        code = InviteCode(
            id=str(uuid.uuid4()),
            code=f"PAGE-{i:03d}",
            creator_id=str(admin_user.id),
            max_uses=10,
            is_active=True,
        )
        db_session.add(code)
    await db_session.commit()

    resp = await client.get("/admin/invite-codes?page=1&page_size=10", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 10
    assert data["total"] == 15
    assert data["has_next"] is True


@pytest.mark.asyncio
async def test_inv_002a_filter_by_creator(client, admin_user, admin_headers, sample_invite_codes, db_session):
    """INV-002a: Filter by creator_id."""
    from app.models import InviteCode, User

    other_user = User(
        id=str(uuid.uuid4()),
        firebase_uid="uid-other-creator",
        vi_user_id="vi-othercreator",
        email="other@example.com",
        role="user",
        is_active=True,
    )
    db_session.add(other_user)
    await db_session.flush()
    code = InviteCode(
        id=str(uuid.uuid4()),
        code="OTHER-CODE",
        creator_id=str(other_user.id),
        is_active=True,
    )
    db_session.add(code)
    await db_session.commit()

    resp = await client.get(
        f"/admin/invite-codes?creator_id={admin_user.id}", headers=admin_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3  # only admin's codes


@pytest.mark.asyncio
async def test_inv_003_detail_with_users(client, admin_user, admin_headers, user_with_invite_record):
    """INV-003: Invite code detail includes users who used it."""
    invite_code = user_with_invite_record["invite_code"]
    resp = await client.get(f"/admin/invite-codes/{invite_code.id}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == "TESTCODE1"
    assert len(data["users"]) == 1
    assert data["users"][0]["email"] == "invited@example.com"


@pytest.mark.asyncio
async def test_inv_004_detail_no_users(client, admin_user, admin_headers, sample_invite_codes):
    """INV-004: Invite code detail with no usage shows empty users."""
    code = sample_invite_codes[0]
    resp = await client.get(f"/admin/invite-codes/{code.id}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["users"] == []


@pytest.mark.asyncio
async def test_inv_005_create_auto_code(client, admin_user, admin_headers):
    """INV-005: Create invite code with auto-generated code."""
    resp = await client.post(
        "/admin/invite-codes",
        json={
            "creator_id": str(admin_user.id),
            "max_uses": 10,
            "expires_at": "2027-12-31T23:59:59Z",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["code"]) > 0
    assert data["creator_id"] == str(admin_user.id)


@pytest.mark.asyncio
async def test_inv_006_create_custom_code(client, admin_user, admin_headers):
    """INV-006: Create invite code with custom code."""
    resp = await client.post(
        "/admin/invite-codes",
        json={
            "creator_id": str(admin_user.id),
            "code": "CUSTOM2026",
            "max_uses": 5,
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["code"] == "CUSTOM2026"


@pytest.mark.asyncio
async def test_inv_007_create_duplicate_code(client, admin_user, admin_headers, sample_invite_codes):
    """INV-007: Duplicate code returns 409."""
    resp = await client.post(
        "/admin/invite-codes",
        json={"creator_id": str(admin_user.id), "code": "CODE-ACTIVE"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_inv_008_create_nonexistent_creator(client, admin_user, admin_headers):
    """INV-008: Non-existent creator_id returns 404."""
    resp = await client.post(
        "/admin/invite-codes",
        json={"creator_id": str(uuid.uuid4()), "max_uses": 5},
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_inv_009_enable_invite_code(client, admin_user, admin_headers, sample_invite_codes):
    """INV-009: Enable an invite code."""
    disabled = next(c for c in sample_invite_codes if not c.is_active)
    resp = await client.patch(
        f"/admin/invite-codes/{disabled.id}/status",
        json={"is_active": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_inv_010_disable_invite_code(client, admin_user, admin_headers, sample_invite_codes):
    """INV-010: Disable an invite code."""
    active = next(c for c in sample_invite_codes if c.is_active)
    resp = await client.patch(
        f"/admin/invite-codes/{active.id}/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_inv_011_status_nonexistent(client, admin_user, admin_headers):
    """INV-011: Status update on non-existent invite code."""
    resp = await client.patch(
        f"/admin/invite-codes/{uuid.uuid4()}/status",
        json={"is_active": True},
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_inv_012_creator_deleted(client, admin_user, admin_headers, db_session):
    """INV-012: Invite code detail when creator is null."""
    from app.models import InviteCode

    code = InviteCode(
        id=str(uuid.uuid4()),
        code="ORPHAN-CODE",
        creator_id=None,  # creator deleted
        is_active=True,
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)

    resp = await client.get(f"/admin/invite-codes/{code.id}", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["creator_id"] is None
    assert data["creator_email"] is None


@pytest.mark.asyncio
async def test_inv_013_max_uses_zero(client, admin_user, admin_headers):
    """INV-013: max_uses=0 returns 422."""
    resp = await client.post(
        "/admin/invite-codes",
        json={"creator_id": str(admin_user.id), "max_uses": 0},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_inv_014_max_uses_negative(client, admin_user, admin_headers):
    """INV-014: max_uses=-1 returns 422."""
    resp = await client.post(
        "/admin/invite-codes",
        json={"creator_id": str(admin_user.id), "max_uses": -1},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_inv_015_expired_date(client, admin_user, admin_headers):
    """INV-015: expires_at in the past returns 400."""
    resp = await client.post(
        "/admin/invite-codes",
        json={
            "creator_id": str(admin_user.id),
            "expires_at": "2020-01-01T00:00:00Z",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_inv_016_no_auth(client):
    """INV-016: Invite code endpoints without auth return 401."""
    for method, path in [
        ("GET", "/admin/invite-codes"),
        ("POST", "/admin/invite-codes"),
        ("PATCH", f"/admin/invite-codes/{uuid.uuid4()}/status"),
    ]:
        resp = await client.request(method, path)
        assert resp.status_code == 401, f"{method} {path} should return 401"
