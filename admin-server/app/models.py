"""Database models — copied from api-server to keep schema consistent.

admin-server does NOT run Alembic migrations. Schema is managed by api-server.
"""

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

    # Firebase Identity
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
    is_deleted = Column(Boolean, nullable=False, default=False)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    deleted_at = Column(DateTime, nullable=True)

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
    """Validate database connectivity on startup."""
    async with engine.connect() as conn:
        await conn.execute(sa.text("SELECT 1"))
