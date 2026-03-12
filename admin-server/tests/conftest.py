"""Test configuration and fixtures for admin-server."""

import uuid as _uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, String as SAString
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base, Device, InviteCode, InviteRecord, Setting, User

# ---------------------------------------------------------------------------
# SQLite compatibility: patch PG column types
# ---------------------------------------------------------------------------
_patched = False


def _patch_pg_types():
    global _patched
    if _patched:
        return
    _patched = True

    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, PG_UUID):
                col.type = SAString(36)
                if col.default is not None and callable(col.default.arg):
                    col.default.arg = lambda *_args: str(_uuid.uuid4())
            elif isinstance(col.type, JSONB):
                col.type = JSON()
            elif isinstance(col.type, PG_ARRAY):
                col.type = JSON()


# ---------------------------------------------------------------------------
# Async engine + session for tests (SQLite)
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------
TEST_ADMIN_UID = "admin-firebase-uid"
TEST_REGULAR_UID = "regular-firebase-uid"
TEST_DISABLED_ADMIN_UID = "disabled-admin-uid"
TEST_PACKAGE_NAME = "com.example.viagent.ios"


# ---------------------------------------------------------------------------
# Mock Firebase Manager
# ---------------------------------------------------------------------------
def _make_mock_firebase_manager():
    mock_mgr = MagicMock()

    async def _verify_id_token(package_name, id_token):
        if id_token == "invalid-token":
            raise Exception("InvalidIdTokenError: invalid token")
        if id_token == "expired-token":
            raise Exception("ExpiredIdTokenError: token expired")
        if id_token.startswith("token-for-"):
            uid = id_token[len("token-for-"):]
        else:
            uid = TEST_ADMIN_UID
        return {"uid": uid}

    mock_mgr.verify_id_token = AsyncMock(side_effect=_verify_id_token)
    return mock_mgr


# ---------------------------------------------------------------------------
# DB session fixture
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db_session():
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
    from app.deps import get_db
    from app.main import app

    app.router.lifespan_context = None

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.state.firebase_manager = _make_mock_firebase_manager()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession):
    user = User(
        id=str(_uuid.uuid4()),
        firebase_uid=TEST_ADMIN_UID,
        vi_user_id="vi-admin001",
        email="admin@example.com",
        display_name="Admin User",
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_headers():
    return {
        "id-token": f"token-for-{TEST_ADMIN_UID}",
        "package-name": TEST_PACKAGE_NAME,
    }


@pytest_asyncio.fixture
async def regular_user(db_session: AsyncSession):
    user = User(
        id=str(_uuid.uuid4()),
        firebase_uid=TEST_REGULAR_UID,
        vi_user_id="vi-regular001",
        email="user@example.com",
        display_name="Regular User",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def regular_headers():
    return {
        "id-token": f"token-for-{TEST_REGULAR_UID}",
        "package-name": TEST_PACKAGE_NAME,
    }


@pytest_asyncio.fixture
async def disabled_admin(db_session: AsyncSession):
    user = User(
        id=str(_uuid.uuid4()),
        firebase_uid=TEST_DISABLED_ADMIN_UID,
        vi_user_id="vi-disadmin001",
        email="disabled-admin@example.com",
        display_name="Disabled Admin",
        role="admin",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def disabled_admin_headers():
    return {
        "id-token": f"token-for-{TEST_DISABLED_ADMIN_UID}",
        "package-name": TEST_PACKAGE_NAME,
    }


# ---------------------------------------------------------------------------
# Data fixtures
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture
async def multiple_users(db_session: AsyncSession):
    """Create 25 users for pagination tests."""
    users = []
    for i in range(25):
        user = User(
            id=str(_uuid.uuid4()),
            firebase_uid=f"firebase-uid-{i:03d}",
            vi_user_id=f"vi-user{i:03d}",
            email=f"user{i:03d}@example.com",
            display_name=f"User {i:03d}",
            role="user",
            is_active=True,
        )
        db_session.add(user)
        users.append(user)
    await db_session.commit()
    for u in users:
        await db_session.refresh(u)
    return users


@pytest_asyncio.fixture
async def user_with_devices(db_session: AsyncSession, admin_user):
    """Create a user with 2 devices."""
    user = User(
        id=str(_uuid.uuid4()),
        firebase_uid="firebase-uid-with-devices",
        vi_user_id="vi-withdevices",
        email="withdevices@example.com",
        display_name="User With Devices",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    for i in range(2):
        device = Device(
            id=str(_uuid.uuid4()),
            user_id=str(user.id),
            device_id=f"device-{i:03d}",
            package_name=TEST_PACKAGE_NAME,
            device_token=f"token-{i:03d}",
            token_valid=True,
        )
        db_session.add(device)

    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def user_with_invite_record(db_session: AsyncSession, admin_user):
    """Create a user who registered with an invite code."""
    # Create invite code owned by admin
    invite_code = InviteCode(
        id=str(_uuid.uuid4()),
        code="TESTCODE1",
        creator_id=str(admin_user.id),
        max_uses=10,
        used_count=1,
        is_active=True,
    )
    db_session.add(invite_code)
    await db_session.flush()

    # Create user
    user = User(
        id=str(_uuid.uuid4()),
        firebase_uid="firebase-uid-invited",
        vi_user_id="vi-invited001",
        email="invited@example.com",
        display_name="Invited User",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    # Create invite record
    record = InviteRecord(
        id=str(_uuid.uuid4()),
        invite_code_id=str(invite_code.id),
        inviter_id=str(admin_user.id),
        invitee_id=str(user.id),
    )
    db_session.add(record)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(invite_code)
    return {"user": user, "invite_code": invite_code, "record": record}


@pytest_asyncio.fixture
async def sample_settings(db_session: AsyncSession):
    """Create sample settings."""
    settings_list = []
    for key, value, note in [
        ("invite_required", "true", "Whether invite code is required"),
        ("max_retries", "3", "Maximum retry count"),
        ("feature_x", "false", "Feature X toggle"),
    ]:
        s = Setting(key=key, value=value, note=note)
        db_session.add(s)
        settings_list.append(s)
    await db_session.commit()
    for s in settings_list:
        await db_session.refresh(s)
    return settings_list


@pytest_asyncio.fixture
async def sample_invite_codes(db_session: AsyncSession, admin_user):
    """Create sample invite codes."""
    codes = []
    for code_str, max_uses, used, active in [
        ("CODE-ACTIVE", 10, 5, True),
        ("CODE-DISABLED", 5, 2, False),
        ("CODE-FULL", 3, 3, True),
    ]:
        code = InviteCode(
            id=str(_uuid.uuid4()),
            code=code_str,
            creator_id=str(admin_user.id),
            max_uses=max_uses,
            used_count=used,
            is_active=active,
        )
        db_session.add(code)
        codes.append(code)
    await db_session.commit()
    for c in codes:
        await db_session.refresh(c)
    return codes
