"""Tests for user routes: sessions."""


import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Session


class TestGetSessions:
    @pytest.mark.asyncio
    async def test_empty_sessions(self, client: AsyncClient, auth_headers):
        resp = await client.get("/api/users/sessions", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == {"sessions": []}

    @pytest.mark.asyncio
    async def test_with_sessions(
        self, client: AsyncClient, auth_headers, registered_user, db_session: AsyncSession
    ):
        # Insert a session directly into DB (use string UUID for SQLite compat)
        user_id = registered_user["user_id"]
        session_obj = Session(
            user_id=user_id,
            room_name="vi-room-test-123",
            prompt="test prompt",
            status="completed",
        )
        db_session.add(session_obj)
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["sessions"]
        assert len(data) == 1
        assert data[0]["room_name"] == "vi-room-test-123"

    @pytest.mark.asyncio
    async def test_sessions_no_auth(self, client: AsyncClient):
        resp = await client.get("/api/users/sessions")
        assert resp.status_code == 401


class TestGetSessionsWithData:
    """Tests that previously tested /api/users/tasks now test sessions with prompt/result fields."""

    @pytest.mark.asyncio
    async def test_empty_sessions(self, client: AsyncClient, auth_headers):
        resp = await client.get("/api/users/sessions", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["sessions"] == []

    @pytest.mark.asyncio
    async def test_with_session_prompt_and_result(
        self, client: AsyncClient, auth_headers, registered_user, db_session: AsyncSession
    ):
        user_id = registered_user["user_id"]
        session_obj = Session(
            user_id=user_id,
            room_name="vi-room-analyze",
            prompt="Analyze this image",
            status="completed",
            result={"summary": "test"},
        )
        db_session.add(session_obj)
        await db_session.commit()

        resp = await client.get("/api/users/sessions", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["sessions"]
        assert len(data) == 1
        assert data[0]["prompt"] == "Analyze this image"
        assert data[0]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_sessions_no_auth(self, client: AsyncClient):
        resp = await client.get("/api/users/sessions")
        assert resp.status_code == 401
