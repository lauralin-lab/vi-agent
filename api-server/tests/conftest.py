"""Test configuration and fixtures for the API server."""

import uuid as _uuid
from unittest.mock import AsyncMock, MagicMock

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, String as SAString
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.limiter import limiter
from app.models import Base

# Disable rate limiting for tests
limiter.enabled = False

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
# Mock Firebase Manager
# ---------------------------------------------------------------------------
TEST_FIREBASE_UID = "firebase-test-uid-001"
TEST_PACKAGE_NAME = "com.example.viagent.ios"
TEST_USER_EMAIL = "test@example.com"
TEST_USER_DISPLAY_NAME = "Test User"


def _make_mock_firebase_manager():
    """Create a mock FirebaseManager that maps id-token to firebase_uid.

    Token format: "token-for-{uid}" maps to firebase_uid "{uid}".
    Default token "valid-firebase-token" maps to TEST_FIREBASE_UID.
    """
    mock_mgr = MagicMock()

    async def _verify_id_token(package_name, id_token):
        if id_token == "invalid-token":
            raise Exception("InvalidIdTokenError: invalid token")
        if id_token == "expired-token":
            raise Exception("ExpiredIdTokenError: token expired")
        # Support multi-user: "token-for-{uid}" → uid
        if id_token.startswith("token-for-"):
            uid = id_token[len("token-for-"):]
        else:
            uid = TEST_FIREBASE_UID
        return {
            "uid": uid,
            "email": f"{uid}@example.com",
            "firebase": {"sign_in_provider": "google.com"},
        }

    async def _get_user(package_name, uid):
        user_record = MagicMock()
        user_record.display_name = f"User {uid[:8]}"
        user_record.email = f"{uid}@example.com"
        user_record.photo_url = "https://example.com/photo.jpg"
        user_record.phone_number = None
        user_record.email_verified = True
        user_record.provider_data = []
        return user_record

    mock_mgr.verify_id_token = AsyncMock(side_effect=_verify_id_token)
    mock_mgr.get_user = AsyncMock(side_effect=_get_user)
    return mock_mgr


# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    """Provide an HTTPX AsyncClient bound to the FastAPI app with test DB."""
    from app.deps import get_db
    from app.main import app

    # Disable lifespan for tests — background tasks cause hangs
    app.router.lifespan_context = None

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    # Provide a mock redis on app.state so routes that check it don't crash
    app.state.redis = None

    # Provide a mock Firebase manager
    app.state.firebase_manager = _make_mock_firebase_manager()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Convenience fixtures
# ---------------------------------------------------------------------------
FIREBASE_AUTH_HEADERS = {
    "id-token": "valid-firebase-token",
    "package-name": TEST_PACKAGE_NAME,
}


@pytest_asyncio.fixture
async def registered_user(client: AsyncClient):
    """Register a test user via Firebase auth and return the response dict."""
    resp = await client.post(
        "/api/auth/firebase",
        headers=FIREBASE_AUTH_HEADERS,
    )
    assert resp.status_code == 200
    return resp.json()


@pytest_asyncio.fixture
async def auth_headers(registered_user: dict):
    """Return Firebase auth headers for the registered test user."""
    return FIREBASE_AUTH_HEADERS.copy()
