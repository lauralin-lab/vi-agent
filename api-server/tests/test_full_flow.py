"""
Full Main-Flow E2E Test (Firebase Auth)
========================================
Simulates the complete real-world user journey:

  1. User registers via Firebase → gets vi_user_id
  2. User verifies identity via /me
  3. User requests LiveKit token
  4. User creates a session via internal API
  5. User queries sessions → sees the session
  6. Second user cannot see first user's sessions (isolation)
"""
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session
from tests.conftest import TEST_PACKAGE_NAME


def firebase_headers(uid: str) -> dict:
    return {"id-token": f"token-for-{uid}", "package-name": TEST_PACKAGE_NAME}


async def register(client: AsyncClient, uid: str) -> tuple[dict, dict]:
    headers = firebase_headers(uid)
    resp = await client.post("/api/auth/firebase", headers=headers)
    assert resp.status_code == 200
    return headers, resp.json()


@pytest.mark.asyncio
class TestFullMainFlow:
    async def test_register_session_history(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        # Step 1: Register via Firebase
        headers, data = await register(client, "mainflow-user")
        assert data["is_new_user"] is True
        assert data["vi_user_id"].startswith("vi-")
        user_id = data["user_id"]
        vi_user_id = data["vi_user_id"]

        # Step 2: /me
        me_resp = await client.get("/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["user_id"] == user_id

        # Step 3: LiveKit token
        lk_resp = await client.post("/api/livekit/token", headers=headers)
        assert lk_resp.status_code == 200
        room_name = lk_resp.json()["room_name"]
        assert room_name.startswith(f"vi-room-{vi_user_id}-")

        # Step 4: Create sessions via DB
        session1 = Session(
            user_id=user_id, room_name=room_name,
            prompt="Find ramen nearby", status="completed",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db_session.add(session1)
        await db_session.commit()

        # Step 5: Query sessions
        resp = await client.get("/api/users/sessions", headers=headers)
        assert len(resp.json()["sessions"]) == 1

        # Step 6: User isolation
        headers_b, data_b = await register(client, "other-user")
        resp_b = await client.get("/api/users/sessions", headers=headers_b)
        assert len(resp_b.json()["sessions"]) == 0

        # Original user still sees their session
        resp_a = await client.get("/api/users/sessions", headers=headers)
        assert len(resp_a.json()["sessions"]) == 1

    async def test_firebase_token_immediately_usable(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        headers, data = await register(client, "direct-user")
        user_id = data["user_id"]
        vi_user_id = data["vi_user_id"]

        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200

        lk = await client.post("/api/livekit/token", headers=headers)
        assert lk.json()["room_name"].startswith(f"vi-room-{vi_user_id}-")

        sessions = await client.get("/api/users/sessions", headers=headers)
        assert len(sessions.json()["sessions"]) == 0

        session = Session(
            user_id=user_id, room_name=f"vi-room-{vi_user_id}",
            prompt="What is this?", status="completed",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(session)
        await db_session.commit()

        sessions = await client.get("/api/users/sessions", headers=headers)
        assert len(sessions.json()["sessions"]) == 1

    async def test_multiple_sessions_per_user(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        headers, data = await register(client, "multi-session-user")
        user_id = data["user_id"]
        vi_user_id = data["vi_user_id"]

        for prompt in ["Q1", "Q2", "Q3"]:
            db_session.add(Session(
                user_id=user_id, room_name=f"vi-room-{vi_user_id}",
                prompt=prompt, status="completed",
                started_at=datetime.now(timezone.utc),
            ))
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=headers)
        assert len(resp.json()["sessions"]) == 3

    async def test_pagination(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        headers, data = await register(client, "paginate-user")

        for i in range(5):
            db_session.add(Session(
                user_id=data["user_id"], room_name=f"vi-room-{data['vi_user_id']}",
                prompt=f"P{i}", status="completed",
                started_at=datetime.now(timezone.utc),
            ))
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=headers)
        assert len(resp.json()["sessions"]) == 5

        resp = await client.get("/api/users/sessions?skip=2&limit=2", headers=headers)
        assert len(resp.json()["sessions"]) == 2
