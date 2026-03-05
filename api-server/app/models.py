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
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    vi_user_id = Column(String(64), unique=True, nullable=False, index=True)
    display_name = Column(String(100))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime)
    is_active = Column(Boolean, default=True)

    sessions = relationship("Session", back_populates="user")
    memories = relationship("AgentMemory", back_populates="user")


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


async def init_db():
    """Validate database connectivity on startup.

    Schema creation is handled by Alembic migrations.
    Run 'alembic upgrade head' before starting the server.
    """
    async with engine.connect() as conn:
        await conn.execute(sa.text("SELECT 1"))
