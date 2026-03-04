"""V4 Redis Event Bus — Python type definitions.

SYNCHRONIZED COPY — canonical source: realtime/src/redis_events.py
Last synced: 2026-03-04
Both api-server and realtime use identical copies because they run in
separate Docker containers and cannot cross-import. Keep them in sync
when modifying channel schemas.

Pydantic models for all V4 Redis channels. These mirror the TypeScript
definitions in nanoclaw/src/channels/types.ts and serve as the contract
between Python services (api-server, realtime) and NanoClaw.

Channels:
  vi:ctx:{uid}      PUB/SUB  ContextSnapshot
  vi:exec:{uid}     PUB/SUB  ExecRequest
  vi:stream:{uid}   PUB/SUB  StreamEvent (union)
  vi:actions:{uid}  STREAM   ActionEvent
  vi:summary:{uid}  KV       ActivitySummary
  vi:intent:{uid}   PUB/SUB  IntentionUpdate
  vi:media:{uid}    PUB/SUB  MediaEvent
  vi:frames:{uid}   PUB/SUB  KeyframeEvent
  vi:events:{uid}   PUB/SUB  (legacy, kept for compatibility)
"""

import time
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

class PredictedIntention(BaseModel):
    id: str
    skill_slug: str
    title: str
    description: str
    confidence: float
    icon: str
    card_color: Optional[str] = None
    params: Optional[Dict[str, Any]] = None
    estimated_time: Optional[str] = None
    estimated_cost: Optional[str] = None


class MediaDimensions(BaseModel):
    w: int
    h: int


# ---------------------------------------------------------------------------
# vi:ctx:{uid} — Context snapshot from NanoClaw → Realtime Agent
# ---------------------------------------------------------------------------

class ContextSnapshot(BaseModel):
    version: Literal[4] = 4
    ts: float = Field(default_factory=time.time)
    uid: str
    snapshot: str  # <=2000 chars compiled context
    char_count: int
    memory_version: int
    session_active: bool
    latest_frame_url: Optional[str] = None
    predicted_intentions: List[PredictedIntention] = []


# ---------------------------------------------------------------------------
# vi:exec:{uid} — Task execution request → NanoClaw
# ---------------------------------------------------------------------------

class ExecRequest(BaseModel):
    taskId: str
    sessionId: str
    prompt: str
    context: Optional[Dict[str, Any]] = None
    priority: Literal["fast", "thorough"] = "thorough"
    skillSlug: Optional[str] = None
    mediaUrls: List[str] = []
    params: Optional[Dict[str, Any]] = None
    ts: float = Field(default_factory=time.time)


# ---------------------------------------------------------------------------
# vi:stream:{uid} — Execution stream events from NanoClaw
# ---------------------------------------------------------------------------

class ExecStart(BaseModel):
    type: Literal["exec_start"] = "exec_start"
    taskId: str
    executor: str


class ExecProgress(BaseModel):
    type: Literal["exec_progress"] = "exec_progress"
    taskId: str
    step: int
    total: int
    message: str


class ExecHtmlStream(BaseModel):
    type: Literal["exec_html_stream"] = "exec_html_stream"
    taskId: str
    chunk: str
    done: Optional[bool] = None


class ExecTextStream(BaseModel):
    type: Literal["exec_text_stream"] = "exec_text_stream"
    taskId: str
    chunk: str
    done: Optional[bool] = None


class ExecModule(BaseModel):
    type: Literal["exec_module"] = "exec_module"
    taskId: str
    moduleType: str
    data: Any


class ExecIntermediate(BaseModel):
    type: Literal["exec_intermediate"] = "exec_intermediate"
    taskId: str
    step: int
    label: str
    data: Any


class ExecResult(BaseModel):
    type: Literal["exec_result"] = "exec_result"
    taskId: str
    summary: str


class ExecError(BaseModel):
    type: Literal["exec_error"] = "exec_error"
    taskId: str
    error: str
    recoverable: bool


StreamEvent = Union[
    ExecStart,
    ExecProgress,
    ExecHtmlStream,
    ExecTextStream,
    ExecModule,
    ExecIntermediate,
    ExecResult,
    ExecError,
]


# ---------------------------------------------------------------------------
# vi:actions:{uid} — User action events (Redis Stream via XADD)
# ---------------------------------------------------------------------------

class ActionEvent(BaseModel):
    type: str  # voice_transcript, text_message, photo_taken, page_navigate, ...
    ts: float = Field(default_factory=time.time)
    user_id: str
    data: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# vi:summary:{uid} — Activity summary (Redis KV, TTL 5min)
# ---------------------------------------------------------------------------

class ActivitySummary(BaseModel):
    ts: float = Field(default_factory=time.time)
    period_seconds: int
    summary: str
    active_topics: List[str] = []
    recent_actions: List[str] = []
    current_page: str = ""
    session_active: bool = False


# ---------------------------------------------------------------------------
# vi:intent:{uid} — Intention predictions from NanoClaw
# ---------------------------------------------------------------------------

class IntentionUpdate(BaseModel):
    type: Literal["intention_update"] = "intention_update"
    ts: float = Field(default_factory=time.time)
    intentions: List[PredictedIntention] = []


# ---------------------------------------------------------------------------
# vi:media:{uid} — Media capture notifications
# ---------------------------------------------------------------------------

class MediaEvent(BaseModel):
    type: Literal["media_captured"] = "media_captured"
    mediaType: Literal["image", "video"]
    mediaUrl: str
    thumbnail: Optional[str] = None
    duration: Optional[float] = None
    dimensions: MediaDimensions


# ---------------------------------------------------------------------------
# vi:frames:{uid} — Keyframe events from Realtime Agent
# ---------------------------------------------------------------------------

class KeyframeEvent(BaseModel):
    ts: float = Field(default_factory=time.time)
    frameUrl: str
    sceneHash: str
    hasChange: bool


# ---------------------------------------------------------------------------
# Skill manifest (shared with NanoClaw TypeScript definition)
# ---------------------------------------------------------------------------

class SkillRequirements(BaseModel):
    oauth: Optional[List[str]] = None
    tools: Optional[List[str]] = None
    input_types: Optional[List[str]] = None


class SkillUI(BaseModel):
    card_color: Optional[str] = None
    preview_template: Optional[str] = None


class SkillManifest(BaseModel):
    name: str
    slug: str
    icon: str
    description: str
    category: str
    version: str
    requirements: Optional[SkillRequirements] = None
    ui: Optional[SkillUI] = None
    tags: List[str] = []
    model: Optional[str] = None


# ---------------------------------------------------------------------------
# Channel name helpers
# ---------------------------------------------------------------------------

def channel_ctx(uid: str) -> str:
    return f"vi:ctx:{uid}"

def channel_exec(uid: str) -> str:
    return f"vi:exec:{uid}"

def channel_stream(uid: str) -> str:
    return f"vi:stream:{uid}"

def channel_actions(uid: str) -> str:
    return f"vi:actions:{uid}"

def channel_summary(uid: str) -> str:
    return f"vi:summary:{uid}"

def channel_intent(uid: str) -> str:
    return f"vi:intent:{uid}"

def channel_media(uid: str) -> str:
    return f"vi:media:{uid}"

def channel_frames(uid: str) -> str:
    return f"vi:frames:{uid}"

def channel_events(uid: str) -> str:
    return f"vi:events:{uid}"
