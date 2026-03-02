"""Integration tests — full user flows through the API.

These tests exercise the real FastAPI app with a SQLite test database,
verifying multi-step user journeys end-to-end.
"""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
TEST_EMAIL = "integration@example.com"
TEST_PASSWORD = "strongP@ss99"
TEST_DISPLAY = "Tester"


async def signup_and_get_headers(client: AsyncClient) -> tuple[dict, dict]:
    """Register a user and return (auth_headers, response_data)."""
    resp = await client.post(
        "/api/auth/signup",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "display_name": TEST_DISPLAY,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    headers = {"Authorization": f"Bearer {data['token']}"}
    return headers, data


# ---------------------------------------------------------------------------
# Flow 1: Full signup → login → me
# ---------------------------------------------------------------------------
class TestAuthFlow:
    @pytest.mark.asyncio
    async def test_signup_login_me_flow(self, client: AsyncClient):
        """Complete auth lifecycle: signup, re-login, verify /me returns same user."""
        # Step 1: Signup
        resp = await client.post(
            "/api/auth/signup",
            json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "display_name": TEST_DISPLAY,
            },
        )
        assert resp.status_code == 200
        signup_data = resp.json()
        assert signup_data["email"] == TEST_EMAIL
        assert signup_data["display_name"] == TEST_DISPLAY
        assert signup_data["vi_user_id"].startswith("vi-")
        user_id = signup_data["user_id"]
        vi_user_id = signup_data["vi_user_id"]

        # Step 2: Login with same credentials
        resp = await client.post(
            "/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert resp.status_code == 200
        login_data = resp.json()
        assert login_data["user_id"] == user_id
        assert login_data["vi_user_id"] == vi_user_id
        # Login should return a new token (not necessarily the same one)
        assert login_data["token"]

        # Step 3: Use login token to access /me
        headers = {"Authorization": f"Bearer {login_data['token']}"}
        resp = await client.get("/api/auth/me", headers=headers)
        assert resp.status_code == 200
        me_data = resp.json()
        assert me_data["user_id"] == user_id
        assert me_data["email"] == TEST_EMAIL
        assert me_data["vi_user_id"] == vi_user_id

    @pytest.mark.asyncio
    async def test_signup_token_works_immediately(self, client: AsyncClient):
        """The token returned from signup should be usable right away."""
        resp = await client.post(
            "/api/auth/signup",
            json={
                "email": "immediate@example.com",
                "password": "pass1234secure",
                "display_name": "Quick",
            },
        )
        token = resp.json()["token"]

        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "immediate@example.com"


# ---------------------------------------------------------------------------
# Flow 2: Auth → LiveKit token
# ---------------------------------------------------------------------------
class TestLiveKitFlow:
    @pytest.mark.asyncio
    async def test_signup_then_get_livekit_token(self, client: AsyncClient):
        """After signup, user can get a LiveKit room token."""
        headers, signup_data = await signup_and_get_headers(client)

        resp = await client.post("/api/livekit/token", headers=headers)
        assert resp.status_code == 200

        lk_data = resp.json()
        assert "token" in lk_data
        assert lk_data["room_name"] == f"vi-room-{signup_data['vi_user_id']}"
        assert lk_data["livekit_url"]

    @pytest.mark.asyncio
    async def test_livekit_token_is_valid_jwt(self, client: AsyncClient):
        """The LiveKit token should be a valid JWT (3 dot-separated parts)."""
        headers, _ = await signup_and_get_headers(client)

        resp = await client.post("/api/livekit/token", headers=headers)
        token = resp.json()["token"]

        parts = token.split(".")
        assert len(parts) == 3, "JWT should have 3 parts"


# ---------------------------------------------------------------------------
# Flow 3: Auth → Create sessions → Query them
# ---------------------------------------------------------------------------
class TestUserDataFlow:
    @pytest.mark.asyncio
    async def test_sessions_populated_after_insert(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """After inserting session records, GET /sessions returns them."""
        headers, signup_data = await signup_and_get_headers(client)
        user_id = signup_data["user_id"]

        # Insert session records directly into DB with prompt set so they pass the filter
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

        # Query via API
        resp = await client.get("/api/users/sessions", headers=headers)
        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert len(sessions) == 3
        room_names = {s["room_name"] for s in sessions}
        assert "vi-room-test-0" in room_names
        assert "vi-room-test-1" in room_names
        assert "vi-room-test-2" in room_names

    @pytest.mark.asyncio
    async def test_sessions_with_prompt_and_result(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """After inserting sessions with prompts, GET /sessions returns them."""
        headers, signup_data = await signup_and_get_headers(client)
        user_id = signup_data["user_id"]

        # Insert sessions with prompts and results (replaces old Task tests)
        for prompt_text in ["Analyze food", "Find recipe", "Translate menu"]:
            session = Session(
                user_id=user_id,
                room_name=f"vi-room-{prompt_text.lower().replace(' ', '-')}",
                prompt=prompt_text,
                status="completed",
                result={"summary": f"Result for {prompt_text}"},
                started_at=datetime.now(timezone.utc),
            )
            db_session.add(session)
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=headers)
        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert len(sessions) == 3
        prompts = {s["prompt"] for s in sessions}
        assert prompts == {"Analyze food", "Find recipe", "Translate menu"}

    @pytest.mark.asyncio
    async def test_sessions_empty_initially(self, client: AsyncClient):
        """A fresh user should have no sessions."""
        headers, _ = await signup_and_get_headers(client)

        resp = await client.get("/api/users/sessions", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == {"sessions": []}


# ---------------------------------------------------------------------------
# Flow 4: User isolation — users cannot see each other's data
# ---------------------------------------------------------------------------
class TestUserIsolation:
    @pytest.mark.asyncio
    async def test_users_see_only_their_own_sessions(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """User A's sessions should not be visible to User B."""
        # Create User A
        resp_a = await client.post(
            "/api/auth/signup",
            json={"email": "alice@example.com", "password": "pass1234alice", "display_name": "Alice"},
        )
        data_a = resp_a.json()
        headers_a = {"Authorization": f"Bearer {data_a['token']}"}

        # Create User B
        resp_b = await client.post(
            "/api/auth/signup",
            json={"email": "bob@example.com", "password": "pass1234bob", "display_name": "Bob"},
        )
        data_b = resp_b.json()
        headers_b = {"Authorization": f"Bearer {data_b['token']}"}

        # Insert sessions for User A only (with prompt so it passes the filter)
        session = Session(
            user_id=data_a["user_id"],
            room_name="alice-room",
            prompt="Alice's session",
            status="completed",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        # User A sees session
        resp = await client.get("/api/users/sessions", headers=headers_a)
        sessions_a = resp.json()["sessions"]
        assert len(sessions_a) == 1
        assert sessions_a[0]["room_name"] == "alice-room"

        # User B sees nothing
        resp = await client.get("/api/users/sessions", headers=headers_b)
        sessions_b = resp.json()["sessions"]
        assert len(sessions_b) == 0

    @pytest.mark.asyncio
    async def test_users_see_only_their_own_session_data(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """User A's session data should not be visible to User B."""
        resp_a = await client.post(
            "/api/auth/signup",
            json={"email": "carol@example.com", "password": "pass1234carol", "display_name": "Carol"},
        )
        data_a = resp_a.json()
        headers_a = {"Authorization": f"Bearer {data_a['token']}"}

        resp_b = await client.post(
            "/api/auth/signup",
            json={"email": "dave@example.com", "password": "pass1234dave", "display_name": "Dave"},
        )
        data_b = resp_b.json()
        headers_b = {"Authorization": f"Bearer {data_b['token']}"}

        session = Session(
            user_id=data_a["user_id"],
            room_name="carol-room",
            prompt="Carol's private session",
            status="dispatched",
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
        """Multiple signups should produce unique vi_user_ids."""
        vi_user_ids = set()
        for i in range(5):
            resp = await client.post(
                "/api/auth/signup",
                json={
                    "email": f"user{i}@example.com",
                    "password": "pass1234secure",
                    "display_name": f"User {i}",
                },
            )
            assert resp.status_code == 200
            vi_user_ids.add(resp.json()["vi_user_id"])

        assert len(vi_user_ids) == 5, "All vi_user_ids should be unique"

    @pytest.mark.asyncio
    async def test_each_user_gets_own_livekit_room(self, client: AsyncClient):
        """Multiple users should get different LiveKit room names."""
        rooms = set()
        for i in range(3):
            resp = await client.post(
                "/api/auth/signup",
                json={
                    "email": f"room{i}@example.com",
                    "password": "pass1234secure",
                    "display_name": f"Roomer {i}",
                },
            )
            token = resp.json()["token"]

            resp = await client.post(
                "/api/livekit/token",
                headers={"Authorization": f"Bearer {token}"},
            )
            rooms.add(resp.json()["room_name"])

        assert len(rooms) == 3, "Each user should get a unique room"


# ---------------------------------------------------------------------------
# Flow 6: Error handling across endpoints
# ---------------------------------------------------------------------------
class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_expired_token_rejected_everywhere(self, client: AsyncClient):
        """An invalid token should be rejected on all authenticated endpoints."""
        bad_headers = {"Authorization": "Bearer totally.invalid.token"}

        endpoints = [
            ("GET", "/api/auth/me"),
            ("POST", "/api/livekit/token"),
            ("GET", "/api/users/sessions"),
        ]
        for method, path in endpoints:
            if method == "GET":
                resp = await client.get(path, headers=bad_headers)
            else:
                resp = await client.post(path, headers=bad_headers)
            assert resp.status_code in (401, 403), f"{method} {path} should reject bad token"

    @pytest.mark.asyncio
    async def test_no_token_rejected_everywhere(self, client: AsyncClient):
        """Requests without token should be rejected on all authenticated endpoints."""
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
