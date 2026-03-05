"""V5 integration tests: exec dispatch, SSE event schemas, card protocol."""

import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_exec_dispatch_requires_auth(client: AsyncClient):
    """POST /api/users/exec requires authentication (vi_user_id or JWT)."""
    resp = await client.post(
        "/api/users/exec",
        json={"prompt": "test"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_exec_dispatch_with_user(client: AsyncClient, registered_user: dict):
    """POST /api/users/exec dispatches task and returns taskId."""
    vi_user_id = registered_user["vi_user_id"]

    # Mock Redis so we don't need a real connection
    mock_redis = AsyncMock()
    mock_redis.publish = AsyncMock(return_value=1)

    with patch("app.routes.events.get_redis", return_value=mock_redis):
        # Override the dependency for this test
        from app.deps import get_redis
        from app.main import app

        app.dependency_overrides[get_redis] = lambda: mock_redis

        resp = await client.post(
            f"/api/users/exec?vi_user_id={vi_user_id}",
            json={"prompt": "Analyze this photo"},
        )

        app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "taskId" in data
    assert data["taskId"].startswith("exec-")
    assert "sessionId" in data


@pytest.mark.asyncio
async def test_exec_dispatch_with_media_urls(client: AsyncClient, registered_user: dict):
    """POST /api/users/exec passes media_urls to the exec message."""
    vi_user_id = registered_user["vi_user_id"]

    mock_redis = AsyncMock()
    published_messages = []

    async def capture_publish(channel, message):
        published_messages.append((channel, json.loads(message)))
        return 1

    mock_redis.publish = capture_publish

    from app.deps import get_redis
    from app.main import app

    app.dependency_overrides[get_redis] = lambda: mock_redis

    resp = await client.post(
        f"/api/users/exec?vi_user_id={vi_user_id}",
        json={
            "prompt": "Analyze this photo",
            "media_urls": ["https://example.com/photo.jpg"],
            "priority": "thorough",
        },
    )

    app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 200

    # Verify the Redis message contains media_urls
    assert len(published_messages) == 1
    channel, msg = published_messages[0]
    assert f"vi:exec:{vi_user_id}" == channel
    assert msg["prompt"] == "Analyze this photo"
    assert msg["mediaUrls"] == ["https://example.com/photo.jpg"]
    assert msg["priority"] == "thorough"


@pytest.mark.asyncio
async def test_exec_dispatch_redis_unavailable(client: AsyncClient, registered_user: dict):
    """POST /api/users/exec returns 503 when Redis is unavailable."""
    vi_user_id = registered_user["vi_user_id"]

    from app.deps import get_redis
    from app.main import app

    app.dependency_overrides[get_redis] = lambda: None

    resp = await client.post(
        f"/api/users/exec?vi_user_id={vi_user_id}",
        json={"prompt": "test"},
    )

    app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_sse_events_endpoint_requires_auth(client: AsyncClient):
    """GET /api/users/events requires authentication."""
    resp = await client.get("/api/users/events")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_card_action_requires_auth(client: AsyncClient):
    """POST /api/users/card-action requires authentication."""
    resp = await client.post(
        "/api/users/card-action",
        json={"cardId": "test", "action": "click", "payload": {}},
    )
    assert resp.status_code == 401
