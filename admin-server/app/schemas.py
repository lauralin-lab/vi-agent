"""Pydantic request/response schemas for admin API."""

from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar("T")


# --- Pagination ---

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    has_next: bool


# --- Auth ---

class AdminLoginResponse(BaseModel):
    user_id: UUID
    email: str | None
    display_name: str | None
    role: str
    photo_url: str | None


# --- Users ---

class UserListItem(BaseModel):
    id: UUID
    vi_user_id: str
    firebase_uid: str | None
    email: str | None
    display_name: str | None
    is_active: bool
    role: str
    last_login: datetime | None
    created_at: datetime | None
    invite_code: str | None
    device_count: int
    invite_code_count: int

    model_config = {"from_attributes": True}


class DeviceBrief(BaseModel):
    id: UUID
    device_token: str | None
    updated_at: datetime | None
    token_valid: bool | None

    model_config = {"from_attributes": True}


class InviteCodeBrief(BaseModel):
    id: UUID
    code: str
    used_count: int
    max_uses: int | None

    model_config = {"from_attributes": True}


class RegisteredInviteCode(BaseModel):
    id: UUID
    code: str

    model_config = {"from_attributes": True}


class UserDetailResponse(BaseModel):
    id: UUID
    vi_user_id: str
    firebase_uid: str | None
    email: str | None
    display_name: str | None
    is_active: bool
    role: str
    last_login: datetime | None
    created_at: datetime | None
    registered_invite_code: RegisteredInviteCode | None
    devices: list[DeviceBrief]
    created_invite_codes: list[InviteCodeBrief]

    model_config = {"from_attributes": True}


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserStatusResponse(BaseModel):
    id: UUID
    is_active: bool


# --- Devices ---

class DeviceListItem(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str | None
    device_id: str
    device_token: str | None
    token_valid: bool | None
    version: str | None
    store: str | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


# --- Settings ---

class SettingResponse(BaseModel):
    key: str
    value: str
    note: str | None
    is_active: bool
    is_deleted: bool
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class SettingCreate(BaseModel):
    key: str = Field(..., min_length=1, max_length=100)
    value: str
    note: str | None = None


class SettingUpdate(BaseModel):
    value: str | None = None
    note: str | None = None
    is_active: bool | None = None


# --- Invite Codes ---

class InviteCodeListItem(BaseModel):
    id: UUID
    code: str
    creator_id: UUID | None
    creator_email: str | None
    max_uses: int | None
    used_count: int
    expires_at: datetime | None
    is_active: bool
    note: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class InviteCodeUserBrief(BaseModel):
    id: UUID
    email: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class InviteCodeDetailResponse(BaseModel):
    id: UUID
    code: str
    creator_id: UUID | None
    creator_email: str | None
    max_uses: int | None
    used_count: int
    expires_at: datetime | None
    is_active: bool
    note: str | None
    created_at: datetime | None
    users: list[InviteCodeUserBrief]

    model_config = {"from_attributes": True}


class InviteCodeCreate(BaseModel):
    creator_id: UUID
    code: str | None = None
    max_uses: int | None = Field(None, gt=0)
    expires_at: datetime | None = None
    note: str | None = None


class InviteCodeStatusUpdate(BaseModel):
    is_active: bool
