"""
End-to-End Fake Case Test
=========================
Simulates a complete user flow: signup → login → get user info → get LiveKit token → query sessions
"""
import pytest
from httpx import AsyncClient

# Reuse conftest fixtures (client, db_session, etc.)


@pytest.mark.asyncio
class TestFullFlowFakeCase:
    """Simulates a complete user journey:
    1. New user signup
    2. Login to get token
    3. Use token to access /me for user info
    4. Get LiveKit token for realtime connection
    5. Query session history
    6. Verify user data isolation (second user cannot see first user's data)
    """

    async def test_complete_user_journey(self, client: AsyncClient):
        """Complete user journey - from signup to using all features"""

        # === Step 1: Register new user ===
        signup_resp = await client.post("/api/auth/signup", json={
            "email": "fakeuser@example.com",
            "password": "SecurePass123!",
            "display_name": "Fake Test User"
        })
        assert signup_resp.status_code == 200, f"Signup failed: {signup_resp.text}"
        signup_data = signup_resp.json()
        assert "token" in signup_data
        assert signup_data["email"] == "fakeuser@example.com"
        assert signup_data["display_name"] == "Fake Test User"
        assert "vi_user_id" in signup_data
        assert signup_data["vi_user_id"].startswith("vi-")
        token = signup_data["token"]
        user_id = signup_data["user_id"]
        vi_user_id = signup_data["vi_user_id"]

        # === Step 2: Verify /me endpoint with signup token ===
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = await client.get("/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["email"] == "fakeuser@example.com"
        assert me_data["display_name"] == "Fake Test User"
        assert me_data["user_id"] == user_id
        assert "created_at" in me_data

        # === Step 3: Re-login to get new token ===
        login_resp = await client.post("/api/auth/login", json={
            "email": "fakeuser@example.com",
            "password": "SecurePass123!"
        })
        assert login_resp.status_code == 200
        login_data = login_resp.json()
        new_token = login_data["token"]
        assert new_token  # got new token
        assert login_data["vi_user_id"] == vi_user_id  # same user
        headers = {"Authorization": f"Bearer {new_token}"}

        # === Step 4: Verify /me still works with new token ===
        me_resp2 = await client.get("/api/auth/me", headers=headers)
        assert me_resp2.status_code == 200
        assert me_resp2.json()["user_id"] == user_id

        # === Step 5: Get LiveKit Token ===
        lk_resp = await client.post("/api/livekit/token", headers=headers)
        assert lk_resp.status_code == 200
        lk_data = lk_resp.json()
        assert "token" in lk_data
        assert "livekit_url" in lk_data
        assert lk_data["room_name"] == f"vi-room-{vi_user_id}"
        # LiveKit token should be a valid JWT (3 parts)
        lk_jwt_parts = lk_data["token"].split(".")
        assert len(lk_jwt_parts) == 3, "LiveKit token should be a valid JWT"

        # === Step 6: Query sessions (should be empty — LiveKit does NOT auto-create sessions) ===
        sessions_resp = await client.get("/api/users/sessions", headers=headers)
        assert sessions_resp.status_code == 200
        sessions_data = sessions_resp.json()
        assert "sessions" in sessions_data
        sessions = sessions_data["sessions"]
        assert len(sessions) == 0, "No sessions should exist yet (LiveKit does not auto-create)"

        # === Step 7: Duplicate signup should fail ===
        dup_resp = await client.post("/api/auth/signup", json={
            "email": "fakeuser@example.com",
            "password": "AnotherPass456!",
            "display_name": "Duplicate User"
        })
        assert dup_resp.status_code == 409

        # === Step 8: Wrong password should fail ===
        bad_login = await client.post("/api/auth/login", json={
            "email": "fakeuser@example.com",
            "password": "WrongPassword!"
        })
        assert bad_login.status_code == 401

        # === Step 9: Unauthenticated access should fail ===
        no_auth_me = await client.get("/api/auth/me")
        assert no_auth_me.status_code == 401
        no_auth_lk = await client.post("/api/livekit/token")
        assert no_auth_lk.status_code == 401
        no_auth_sessions = await client.get("/api/users/sessions")
        assert no_auth_sessions.status_code == 401

        # Invalid token should return 401
        bad_token_headers = {"Authorization": "Bearer invalid.jwt.garbage"}
        bad_me = await client.get("/api/auth/me", headers=bad_token_headers)
        assert bad_me.status_code == 401

        # === Step 10: User data isolation test ===
        signup2 = await client.post("/api/auth/signup", json={
            "email": "other@example.com",
            "password": "OtherPass789!",
            "display_name": "Other User"
        })
        assert signup2.status_code == 200
        other_data = signup2.json()
        other_token = other_data["token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # Second user can see their own info
        other_me = await client.get("/api/auth/me", headers=other_headers)
        assert other_me.status_code == 200
        assert other_me.json()["email"] == "other@example.com"
        assert other_me.json()["user_id"] != user_id  # different user ID

        # Second user gets their own LiveKit room
        other_lk = await client.post("/api/livekit/token", headers=other_headers)
        assert other_lk.status_code == 200
        # Room names should differ (different vi_user_id)
        assert other_lk.json()["room_name"] != lk_data["room_name"]
        assert other_lk.json()["room_name"] == f"vi-room-{other_data['vi_user_id']}"

        # Second user's sessions are independent
        other_sessions = await client.get("/api/users/sessions", headers=other_headers)
        assert other_sessions.status_code == 200
        assert len(other_sessions.json()["sessions"]) == 0

        # === Step 11: Health Check ===
        health = await client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"
