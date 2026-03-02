"""
Full Main-Flow E2E Test
========================
Simulates the complete real-world user journey:

  1. User registers (signup) → gets token + vi_user_id
  2. User logs in → gets fresh token
  3. User verifies identity via /me
  4. User requests LiveKit token
  5. User creates a session via internal API
  6. User queries sessions → sees the session
  7. Gateway completes a session (simulated via DB update)
  8. User queries sessions → sees completed session with result
  9. Second user cannot see first user's sessions (isolation)
  10. Session room_name matches "vi-room-{vi_user_id}" pattern

This mirrors the real flow:
  user connects → LiveKit session created → agent dispatches →
  gateway completes session → user sees results in HistoryView
"""
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session


@pytest.mark.asyncio
class TestFullMainFlow:
    """Complete main-flow test simulating real user journey end-to-end."""

    async def test_register_login_session_history(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """
        Full flow: signup → login → /me → livekit/token
        → create session via internal API → dispatch + complete session
        → query sessions → verify user isolation
        """

        # ================================================================
        # Step 1: Register a new user
        # ================================================================
        signup_resp = await client.post("/api/auth/signup", json={
            "email": "mainflow@example.com",
            "password": "MainFlowPass123!",
            "display_name": "Main Flow User",
        })
        assert signup_resp.status_code == 200
        signup_data = signup_resp.json()

        assert "token" in signup_data
        assert "user_id" in signup_data
        assert "vi_user_id" in signup_data
        assert signup_data["email"] == "mainflow@example.com"
        assert signup_data["display_name"] == "Main Flow User"
        assert signup_data["vi_user_id"].startswith("vi-")

        user_id = signup_data["user_id"]
        vi_user_id = signup_data["vi_user_id"]
        signup_token = signup_data["token"]

        # ================================================================
        # Step 2: Login with the same credentials → get fresh token
        # ================================================================
        login_resp = await client.post("/api/auth/login", json={
            "email": "mainflow@example.com",
            "password": "MainFlowPass123!",
        })
        assert login_resp.status_code == 200
        login_data = login_resp.json()

        assert login_data["user_id"] == user_id
        assert login_data["vi_user_id"] == vi_user_id
        assert login_data["token"]  # new token issued

        token = login_data["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # ================================================================
        # Step 3: Verify identity via /me
        # ================================================================
        me_resp = await client.get("/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        me_data = me_resp.json()

        assert me_data["user_id"] == user_id
        assert me_data["email"] == "mainflow@example.com"
        assert me_data["display_name"] == "Main Flow User"
        assert me_data["vi_user_id"] == vi_user_id
        assert "created_at" in me_data

        # ================================================================
        # Step 4: Get LiveKit token
        # ================================================================
        lk_resp = await client.post("/api/livekit/token", headers=headers)
        assert lk_resp.status_code == 200
        lk_data = lk_resp.json()

        assert "token" in lk_data
        assert "livekit_url" in lk_data
        expected_room = f"vi-room-{vi_user_id}"
        assert lk_data["room_name"] == expected_room

        # Verify LiveKit token is a valid JWT (3 dot-separated parts)
        assert len(lk_data["token"].split(".")) == 3

        # ================================================================
        # Step 5: Create a session via DB insert (simulating internal API)
        # ================================================================
        session1 = Session(
            user_id=user_id,
            room_name=expected_room,
            prompt="Help me find the best ramen restaurant nearby",
            status="completed",
            executor="search",
            context={"image_url": "captured_frame_001.jpg", "location": "Tokyo"},
            result={
                "summary": "Found 3 top ramen restaurants within 500m",
                "items": [
                    {"name": "Ichiran Shibuya", "rating": 4.5, "distance": "200m"},
                    {"name": "Fuunji", "rating": 4.7, "distance": "350m"},
                    {"name": "Afuri", "rating": 4.3, "distance": "480m"},
                ],
            },
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db_session.add(session1)
        await db_session.commit()

        # ================================================================
        # Step 6: Query sessions → should see the completed session
        # ================================================================
        sessions_resp = await client.get("/api/users/sessions", headers=headers)
        assert sessions_resp.status_code == 200
        sessions = sessions_resp.json()["sessions"]

        assert len(sessions) == 1, "Should see 1 completed session"
        returned_session = sessions[0]
        assert returned_session["prompt"] == "Help me find the best ramen restaurant nearby"
        assert returned_session["status"] == "completed"
        assert returned_session["completed_at"] is not None
        session1_id = returned_session["id"]

        # ================================================================
        # Step 7: Create a second session with a different prompt
        # ================================================================
        session2 = Session(
            user_id=user_id,
            room_name=expected_room,
            prompt="Translate this menu to English",
            status="completed",
            executor="translate",
            context={"image_url": "captured_frame_002.jpg"},
            result={
                "summary": "Translated 12 menu items from Japanese to English",
                "translations": [
                    {"original": "味噌ラーメン", "translated": "Miso Ramen"},
                    {"original": "餃子", "translated": "Gyoza (Dumplings)"},
                ],
            },
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db_session.add(session2)
        await db_session.commit()

        sessions_resp2 = await client.get("/api/users/sessions", headers=headers)
        assert len(sessions_resp2.json()["sessions"]) == 2, "Should see 2 completed sessions"

        # ================================================================
        # Step 8: Verify first session is still visible
        # ================================================================
        all_sessions = sessions_resp2.json()["sessions"]
        session_ids = {s["id"] for s in all_sessions}
        assert session1_id in session_ids

        # ================================================================
        # Step 9: User isolation — second user sees nothing
        # ================================================================
        signup2 = await client.post("/api/auth/signup", json={
            "email": "other_user@example.com",
            "password": "OtherUserPass456!",
            "display_name": "Other User",
        })
        assert signup2.status_code == 200
        other_data = signup2.json()
        other_headers = {"Authorization": f"Bearer {other_data['token']}"}
        other_vi_user_id = other_data["vi_user_id"]

        # Other user has different vi_user_id
        assert other_vi_user_id != vi_user_id

        # Other user sees 0 sessions
        other_sessions = await client.get("/api/users/sessions", headers=other_headers)
        assert len(other_sessions.json()["sessions"]) == 0

        # Other user gets their own LiveKit room
        other_lk = await client.post("/api/livekit/token", headers=other_headers)
        assert other_lk.status_code == 200
        other_room = other_lk.json()["room_name"]
        assert other_room == f"vi-room-{other_vi_user_id}"
        assert other_room != expected_room

        # Other user still has 0 sessions (LiveKit token does NOT auto-create sessions)
        other_sessions2 = await client.get("/api/users/sessions", headers=other_headers)
        assert len(other_sessions2.json()["sessions"]) == 0

        # First user still has exactly 2 sessions (untouched by other user)
        first_sessions = await client.get("/api/users/sessions", headers=headers)
        assert len(first_sessions.json()["sessions"]) == 2

        # ================================================================
        # Step 10: Verify room_name pattern for all sessions
        # ================================================================
        for s in first_sessions.json()["sessions"]:
            assert s["room_name"] == f"vi-room-{vi_user_id}"

    async def test_signup_token_immediately_usable_for_full_flow(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """The token from signup (without login) should work for the entire flow."""
        resp = await client.post("/api/auth/signup", json={
            "email": "directflow@example.com",
            "password": "DirectFlowPass789!",
            "display_name": "Direct User",
        })
        assert resp.status_code == 200
        token = resp.json()["token"]
        vi_user_id = resp.json()["vi_user_id"]
        user_id = resp.json()["user_id"]
        headers = {"Authorization": f"Bearer {token}"}

        # /me works with signup token
        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["vi_user_id"] == vi_user_id

        # LiveKit token works
        lk = await client.post("/api/livekit/token", headers=headers)
        assert lk.status_code == 200
        assert lk.json()["room_name"] == f"vi-room-{vi_user_id}"

        # No sessions yet (LiveKit does NOT auto-create sessions)
        sessions = await client.get("/api/users/sessions", headers=headers)
        assert len(sessions.json()["sessions"]) == 0

        # Create a session via DB insert (simulating gateway completion)
        session_obj = Session(
            user_id=user_id,
            room_name=f"vi-room-{vi_user_id}",
            prompt="What is this building?",
            status="completed",
            result={"summary": "This is Tokyo Tower, a communications tower in Shiba-koen"},
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db_session.add(session_obj)
        await db_session.commit()

        # Session visible
        sessions = await client.get("/api/users/sessions", headers=headers)
        assert len(sessions.json()["sessions"]) == 1
        assert sessions.json()["sessions"][0]["status"] == "completed"

    async def test_multiple_sessions_per_user(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """A single user can have multiple sessions (user asks multiple questions)."""
        resp = await client.post("/api/auth/signup", json={
            "email": "multitask@example.com",
            "password": "MultiTaskPass999!",
            "display_name": "Multi Tasker",
        })
        user_id = resp.json()["user_id"]
        vi_user_id = resp.json()["vi_user_id"]
        headers = {"Authorization": f"Bearer {resp.json()['token']}"}

        # Create 3 sessions with different prompts
        prompts = [
            "What restaurant is this?",
            "Show me their menu",
            "How do I get there by train?",
        ]
        for i, prompt in enumerate(prompts):
            session = Session(
                user_id=user_id,
                room_name=f"vi-room-{vi_user_id}",
                prompt=prompt,
                status="completed" if i < 2 else "dispatched",
                started_at=datetime.now(timezone.utc),
            )
            db_session.add(session)
        await db_session.commit()

        sessions_resp = await client.get("/api/users/sessions", headers=headers)
        sessions = sessions_resp.json()["sessions"]
        assert len(sessions) == 3

        statuses = {s["status"] for s in sessions}
        assert "completed" in statuses
        assert "dispatched" in statuses

    async def test_pagination_works(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Verify skip/limit pagination on sessions."""
        resp = await client.post("/api/auth/signup", json={
            "email": "paginate@example.com",
            "password": "PaginatePass123!",
            "display_name": "Paginator",
        })
        user_id = resp.json()["user_id"]
        vi_user_id = resp.json()["vi_user_id"]
        headers = {"Authorization": f"Bearer {resp.json()['token']}"}

        # Create 5 sessions with prompts (so they pass the filter)
        for i in range(5):
            session = Session(
                user_id=user_id,
                room_name=f"vi-room-{vi_user_id}",
                prompt=f"Session prompt {i}",
                status="completed",
                started_at=datetime.now(timezone.utc),
            )
            db_session.add(session)
        await db_session.commit()

        # Default: get all 5
        sessions = await client.get("/api/users/sessions", headers=headers)
        assert len(sessions.json()["sessions"]) == 5

        # Paginate: skip=2, limit=2
        paginated = await client.get(
            "/api/users/sessions?skip=2&limit=2", headers=headers
        )
        assert len(paginated.json()["sessions"]) == 2

        # Paginate: skip=4, limit=10 → only 1 left
        tail = await client.get(
            "/api/users/sessions?skip=4&limit=10", headers=headers
        )
        assert len(tail.json()["sessions"]) == 1
