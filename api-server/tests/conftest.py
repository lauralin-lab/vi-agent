"""Test configuration and fixtures for the API server."""

import uuid as _uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, String as SAString
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.limiter import limiter
from app.models import Base

# Disable rate limiting for tests
limiter.enabled = False

# Provide fake LiveKit credentials so AccessToken() doesn't raise in CI
if not settings.LIVEKIT_API_KEY:
    settings.LIVEKIT_API_KEY = "fake-api-key-for-tests"
if not settings.LIVEKIT_API_SECRET:
    settings.LIVEKIT_API_SECRET = "fake-api-secret-for-tests-must-be-256-bits!!"

# ---------------------------------------------------------------------------
# SQLite compatibility: patch PG column types
# ---------------------------------------------------------------------------
_patched = False


def _patch_pg_types():
    """Replace PG-specific column types with SQLite-friendly equivalents."""
    global _patched
    if _patched:
        return
    _patched = True

    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, PG_UUID):
                col.type = SAString(36)
                # Fix default: uuid.uuid4 → callable producing string UUID
                # SQLAlchemy passes execution context as arg, so accept *args
                if col.default is not None and callable(col.default.arg):
                    col.default.arg = lambda *_args: str(_uuid.uuid4())
            elif isinstance(col.type, JSONB):
                col.type = JSON()
            elif isinstance(col.type, PG_ARRAY):
                col.type = JSON()  # Store arrays as JSON in SQLite


# ---------------------------------------------------------------------------
# Async engine + session for tests (SQLite)
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session():
    """Create tables and yield a test DB session, then drop everything."""
    _patch_pg_types()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    """Provide an HTTPX AsyncClient bound to the FastAPI app with test DB.

    We create a fresh FastAPI app WITHOUT the production lifespan to avoid
    background tasks (event aggregator, stale session cleanup) that would
    keep the event loop alive and hang pytest.
    """
    from app.deps import get_db
    from app.main import app

    # Disable lifespan for tests — background tasks cause hangs
    app.router.lifespan_context = None

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    # Provide a mock redis on app.state so routes that check it don't crash
    app.state.redis = None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Convenience fixtures
# ---------------------------------------------------------------------------
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "securepass123"
TEST_USER_DISPLAY_NAME = "Test User"


@pytest_asyncio.fixture
async def registered_user(client: AsyncClient):
    """Register a test user and return the auth response dict."""
    resp = await client.post(
        "/api/auth/signup",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "display_name": TEST_USER_DISPLAY_NAME,
        },
    )
    assert resp.status_code == 200
    return resp.json()


@pytest_asyncio.fixture
async def auth_headers(registered_user: dict):
    """Return Authorization headers for the registered test user."""
    token = registered_user["token"]
    return {"Authorization": f"Bearer {token}"}
