"""
End-to-End Fake Case Test (Firebase Auth)
==========================================
Simulates a complete user flow:
  register via Firebase → /me → LiveKit token → sessions → isolation
"""
import pytest
from httpx import AsyncClient

from tests.conftest import TEST_PACKAGE_NAME


def firebase_headers(uid: str) -> dict:
    return {"id-token": f"token-for-{uid}", "package-name": TEST_PACKAGE_NAME}


@pytest.mark.asyncio
class TestFullFlowFakeCase:
    async def test_complete_user_journey(self, client: AsyncClient):
        # Step 1: Register via Firebase
        headers = firebase_headers("fakecase-user-1")
        resp = await client.post("/api/auth/firebase", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_new_user"] is True
        assert data["vi_user_id"].startswith("vi-")
        user_id = data["user_id"]
        vi_user_id = data["vi_user_id"]

        # Step 2: /me
        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["user_id"] == user_id

        # Step 3: Second login returns same user
        resp2 = await client.post("/api/auth/firebase", headers=headers)
        assert resp2.status_code == 200
        assert resp2.json()["is_new_user"] is False
        assert resp2.json()["vi_user_id"] == vi_user_id

        # Step 4: LiveKit token
        lk = await client.post("/api/livekit/token", headers=headers)
        assert lk.status_code == 200
        assert lk.json()["room_name"] == f"vi-room-{vi_user_id}"
        assert len(lk.json()["token"].split(".")) == 3

        # Step 5: Empty sessions
        sessions = await client.get("/api/users/sessions", headers=headers)
        assert sessions.status_code == 200
        assert len(sessions.json()["sessions"]) == 0

        # Step 6: Unauthenticated access fails
        assert (await client.get("/api/auth/me")).status_code == 401
        assert (await client.post("/api/livekit/token")).status_code == 401
        assert (await client.get("/api/users/sessions")).status_code == 401

        # Step 7: User isolation
        headers_b = firebase_headers("fakecase-user-2")
        resp_b = await client.post("/api/auth/firebase", headers=headers_b)
        assert resp_b.status_code == 200
        assert resp_b.json()["user_id"] != user_id

        me_b = await client.get("/api/auth/me", headers=headers_b)
        assert me_b.json()["user_id"] != user_id

        lk_b = await client.post("/api/livekit/token", headers=headers_b)
        assert lk_b.json()["room_name"] != f"vi-room-{vi_user_id}"

        # Step 8: Health
        assert (await client.get("/health")).json()["status"] == "ok"
