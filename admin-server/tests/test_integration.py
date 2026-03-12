"""Integration tests — INT-001 to INT-004."""

import uuid

import pytest


@pytest.mark.asyncio
async def test_int_001_disable_user_doesnt_affect_invite_codes(
    client, admin_user, admin_headers, user_with_invite_record, db_session
):
    """INT-001: Disabling a user doesn't affect their invite codes."""
    invite_code = user_with_invite_record["invite_code"]

    # Disable admin (who created the invite code)
    # First create another admin to do the disabling
    from app.models import User

    admin2 = User(
        id=str(uuid.uuid4()),
        firebase_uid="admin2-uid",
        vi_user_id="vi-admin2",
        email="admin2@example.com",
        role="admin",
        is_active=True,
    )
    db_session.add(admin2)
    await db_session.commit()

    admin2_headers = {
        "id-token": "token-for-admin2-uid",
        "package-name": "com.example.viagent.ios",
    }

    # Disable admin_user using admin2
    resp = await client.patch(
        f"/admin/users/{admin_user.id}/status",
        json={"is_active": False},
        headers=admin2_headers,
    )
    assert resp.status_code == 200

    # Check invite code still active
    resp = await client.get(
        f"/admin/invite-codes/{invite_code.id}", headers=admin2_headers
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_int_002_user_list_invite_code_correct(
    client, admin_user, admin_headers, user_with_invite_record
):
    """INT-002: User list shows correct invite code for invited user."""
    invited_user = user_with_invite_record["user"]
    resp = await client.get("/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    invited = next((u for u in items if u["email"] == "invited@example.com"), None)
    assert invited is not None
    assert invited["invite_code"] == "TESTCODE1"


@pytest.mark.asyncio
async def test_int_003_disabled_user_devices_still_visible(
    client, admin_user, admin_headers, user_with_devices
):
    """INT-003: Disabled user's devices are still queryable."""
    # Disable user
    resp = await client.patch(
        f"/admin/users/{user_with_devices.id}/status",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    # Devices still visible
    resp = await client.get(
        f"/admin/devices?user_id={user_with_devices.id}", headers=admin_headers
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 2


@pytest.mark.asyncio
async def test_int_004_update_setting(client, admin_user, admin_headers, sample_settings):
    """INT-004: Updating a setting persists correctly."""
    resp = await client.put(
        "/admin/settings/invite_required",
        json={"value": "false"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "false"

    # Verify by reading back
    resp = await client.get("/admin/settings/invite_required", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["value"] == "false"
