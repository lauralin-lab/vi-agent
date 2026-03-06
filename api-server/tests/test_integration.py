"""Integration tests — full user flows through the API.

These tests exercise the real FastAPI app with a SQLite test database,
verifying multi-step user journeys end-to-end.
"""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session
from tests.conftest import TEST_PACKAGE_NAME


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def firebase_headers_for(uid: str) -> dict:
    """Create Firebase auth headers for a specific firebase uid."""
    return {
        "id-token": f"token-for-{uid}",
        "package-name": TEST_PACKAGE_NAME,
    }


async def firebase_register(client: AsyncClient, uid: str) -> tuple[dict, dict]:
    """Register a user via Firebase and return (headers, response_data)."""
    headers = firebase_headers_for(uid)
    resp = await client.post("/api/auth/firebase", headers=headers)
    assert resp.status_code == 200
    return headers, resp.json()


# ---------------------------------------------------------------------------
# Flow 1: Firebase auth → me
# ---------------------------------------------------------------------------
class TestAuthFlow:
    @pytest.mark.asyncio
    async def test_firebase_register_and_me(self, client: AsyncClient):
        """Complete auth lifecycle: register via Firebase, verify /me."""
        headers, data = await firebase_register(client, "flow-test-user-1")
        assert data["is_new_user"] is True
        assert data["vi_user_id"].startswith("vi-")

        # /me should return the same user
        resp = await client.get("/api/auth/me", headers=headers)
        assert resp.status_code == 200
        me_data = resp.json()
        assert me_data["user_id"] == data["user_id"]
        assert me_data["vi_user_id"] == data["vi_user_id"]

    @pytest.mark.asyncio
    async def test_firebase_login_returns_existing(self, client: AsyncClient):
        """Second login should return the same user with is_new_user=False."""
        headers, data = await firebase_register(client, "flow-test-user-2")
        assert data["is_new_user"] is True

        resp = await client.post("/api/auth/firebase", headers=headers)
        assert resp.status_code == 200
        data2 = resp.json()
        assert data2["is_new_user"] is False
        assert data2["vi_user_id"] == data["vi_user_id"]


# ---------------------------------------------------------------------------
# Flow 2: Auth → LiveKit token
# ---------------------------------------------------------------------------
class TestLiveKitFlow:
    @pytest.mark.asyncio
    async def test_firebase_then_get_livekit_token(self, client: AsyncClient):
        headers, data = await firebase_register(client, "livekit-user-1")

        resp = await client.post("/api/livekit/token", headers=headers)
        assert resp.status_code == 200
        lk_data = resp.json()
        assert "token" in lk_data
        assert lk_data["room_name"] == f"vi-room-{data['vi_user_id']}"


# ---------------------------------------------------------------------------
# Flow 3: Auth → Create sessions → Query them
# ---------------------------------------------------------------------------
class TestUserDataFlow:
    @pytest.mark.asyncio
    async def test_sessions_populated_after_insert(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        headers, data = await firebase_register(client, "data-user-1")
        user_id = data["user_id"]

        for i in range(3):
            session = Session(
                user_id=user_id,
                room_name=f"vi-room-test-{i}",
                prompt=f"Test prompt {i}",
                status="completed",
                started_at=datetime.now(timezone.utc),
            )
            db_session.add(session)
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=headers)
        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert len(sessions) == 3

    @pytest.mark.asyncio
    async def test_sessions_empty_initially(self, client: AsyncClient):
        headers, _ = await firebase_register(client, "data-user-2")
        resp = await client.get("/api/users/sessions", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"sessions": []}


# ---------------------------------------------------------------------------
# Flow 4: User isolation
# ---------------------------------------------------------------------------
class TestUserIsolation:
    @pytest.mark.asyncio
    async def test_users_see_only_their_own_sessions(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        headers_a, data_a = await firebase_register(client, "alice-uid")
        headers_b, data_b = await firebase_register(client, "bob-uid")

        session = Session(
            user_id=data_a["user_id"],
            room_name="alice-room",
            prompt="Alice's session",
            status="completed",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=headers_a)
        assert len(resp.json()["sessions"]) == 1

        resp = await client.get("/api/users/sessions", headers=headers_b)
        assert len(resp.json()["sessions"]) == 0


# ---------------------------------------------------------------------------
# Flow 5: Multiple users, vi_user_id uniqueness
# ---------------------------------------------------------------------------
class TestMultiUser:
    @pytest.mark.asyncio
    async def test_each_user_gets_unique_vi_user_id(self, client: AsyncClient):
        vi_user_ids = set()
        for i in range(5):
            _, data = await firebase_register(client, f"multi-user-{i}")
            vi_user_ids.add(data["vi_user_id"])
        assert len(vi_user_ids) == 5

    @pytest.mark.asyncio
    async def test_each_user_gets_own_livekit_room(self, client: AsyncClient):
        rooms = set()
        for i in range(3):
            headers, _ = await firebase_register(client, f"room-user-{i}")
            resp = await client.post("/api/livekit/token", headers=headers)
            rooms.add(resp.json()["room_name"])
        assert len(rooms) == 3


# ---------------------------------------------------------------------------
# Flow 6: Error handling
# ---------------------------------------------------------------------------
class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_no_token_rejected_everywhere(self, client: AsyncClient):
        endpoints = [
            ("GET", "/api/auth/me"),
            ("POST", "/api/livekit/token"),
            ("GET", "/api/users/sessions"),
        ]
        for method, path in endpoints:
            if method == "GET":
                resp = await client.get(path)
            else:
                resp = await client.post(path)
            assert resp.status_code in (401, 403), f"{method} {path} should require auth"
