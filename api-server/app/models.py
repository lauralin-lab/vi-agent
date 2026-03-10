import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, MetaData, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import DateTime as _DateTime

from .config import settings

# Use timezone-aware TIMESTAMP WITH TIME ZONE for all datetime columns
DateTime = _DateTime(timezone=True)

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=convention)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Firebase Identity (replaces email/password)
    firebase_uid = Column(String(128), unique=True, nullable=True, index=True)
    package_name = Column(String(128), nullable=True, index=True)
    sign_in_provider = Column(String(50))
    firebase_info = Column(JSONB, default=dict)

    # VI Agent Identity
    vi_user_id = Column(String(64), unique=True, nullable=False, index=True)

    # Profile
    display_name = Column(String(100))
    email = Column(String(255), unique=True, nullable=True, index=True)
    photo_url = Column(String(500))
    phone_number = Column(String(20))
    language = Column(String(10), default="en")

    # App Info
    app_version = Column(String(20))

    # Status
    is_active = Column(Boolean, default=True)
    role = Column(String(20), default="user")

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, onupdate=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime)

    sessions = relationship("Session", back_populates="user")
    memories = relationship("AgentMemory", back_populates="user")
    devices = relationship("Device", back_populates="user")


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Device Identity
    device_id = Column(String(128), nullable=False)
    package_name = Column(String(128), nullable=False)

    # Push Token
    device_token = Column(String(512))

    # Hardware IDs
    gaid = Column(String(128))
    idfa = Column(String(128))
    idfv = Column(String(128))
    adjust_id = Column(String(128))
    app_instance_id = Column(String(128))
    appsflyer_id = Column(String(128))

    # App & Environment
    version = Column(String(20))
    store = Column(String(20))
    timezone = Column(Integer)
    ip = Column(String(45))
    user_agent = Column(String(500))

    # Status
    token_valid = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="devices")

    __table_args__ = (
        UniqueConstraint("device_id", "package_name", name="uq_device_package"),
    )


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    room_name = Column(String(255), nullable=False)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime)
    metadata_ = Column("metadata", JSONB)

    # V2 session lifecycle columns
    prompt = Column(Text)
    title = Column(String(200))
    context = Column(JSONB, default=dict)
    intention = Column(Text)
    executor = Column(String(50))
    status = Column(String(20), default="created")
    progress_step = Column(Integer, default=0)
    progress_total = Column(Integer, default=0)
    progress_message = Column(Text)
    result = Column(JSONB)
    result_summary = Column(Text)
    result_html = Column(Text)
    artifacts = Column(JSONB, default=list)
    timeline = Column(JSONB, default=list)
    dispatched_at = Column(DateTime)
    completed_at = Column(DateTime)
    memory_updates = Column(JSONB, default=list)

    user = relationship("User", back_populates="sessions")


class AgentMemory(Base):
    """V3 Memory model — three-layer memory pyramid with importance scoring."""
    __tablename__ = "agent_memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Layer classification
    layer = Column(String(20), nullable=False)        # identity|semantic|episodic
    category = Column(String(50), nullable=False, default="general")

    # Content
    filename = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")

    # Importance scoring
    importance = Column(Float, nullable=False, default=0.5)
    access_count = Column(Integer, nullable=False, default=0)
    last_accessed_at = Column(DateTime)

    # Provenance
    source = Column(String(50), nullable=False, default="agent")
    source_channel = Column(String(20))
    source_session_id = Column(UUID(as_uuid=True))

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    expires_at = Column(DateTime)

    user = relationship("User", back_populates="memories")

    __table_args__ = (
        UniqueConstraint("user_id", "filename", name="uq_agent_memories_user_filename"),
    )


class OAuthToken(Base):
    """V4 OAuth token metadata."""
    __tablename__ = "oauth_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider = Column(String(50), nullable=False)
    scopes = Column(ARRAY(Text), default=list)
    status = Column(String(20), default="active")
    connected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime)
    last_refreshed_at = Column(DateTime)

    user = relationship("User", backref="oauth_tokens")

    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_oauth_tokens_user_provider"),
    )


class InviteCode(Base):
    __tablename__ = "invite_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, nullable=False, index=True)
    creator_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    max_uses = Column(Integer, nullable=True)
    used_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    creator = relationship("User", foreign_keys=[creator_id])
    records = relationship("InviteRecord", back_populates="invite_code")


class InviteRecord(Base):
    __tablename__ = "invite_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invite_code_id = Column(
        UUID(as_uuid=True),
        ForeignKey("invite_codes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inviter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invitee_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    invite_code = relationship("InviteCode", back_populates="records")
    inviter = relationship("User", foreign_keys=[inviter_id])
    invitee = relationship("User", foreign_keys=[invitee_id])


class Setting(Base):
    """System settings — key-value configuration stored in database."""
    __tablename__ = "settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    note = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


async def init_db():
    """Validate database connectivity on startup.

    Schema creation is handled by Alembic migrations.
    Run 'alembic upgrade head' before starting the server.
    """
    async with engine.connect() as conn:
        await conn.execute(sa.text("SELECT 1"))
