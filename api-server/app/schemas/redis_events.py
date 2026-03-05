"""V5 Redis Event Bus — Python type definitions.

CANONICAL SOURCE: api-server/app/schemas/redis_events.py
Both api-server and realtime use identical copies because they run in
separate Docker containers and cannot cross-import. Keep them in sync
when modifying channel schemas.

Pydantic models for the V5 Redis channels. These mirror the TypeScript
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
    version: Literal[5] = 5
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
    userId: Optional[str] = None


# ---------------------------------------------------------------------------
# Card Template Protocol — Card Operations (vi:stream:{uid})  §5
# ---------------------------------------------------------------------------

class CreateCard(BaseModel):
    op: Literal["create_card"] = "create_card"
    taskId: str
    cardId: str
    template: str
    data: Dict[str, Any] = {}
    position: Optional[str] = "append"  # append | prepend | after:{cardId}
    timestamp: Optional[str] = None


class StreamToCard(BaseModel):
    op: Literal["stream_to_card"] = "stream_to_card"
    taskId: str
    cardId: str
    slot: str
    chunk: str
    timestamp: Optional[str] = None


class UpdateCard(BaseModel):
    op: Literal["update_card"] = "update_card"
    taskId: str
    cardId: str
    updates: Dict[str, Any]
    timestamp: Optional[str] = None


class AppendToCard(BaseModel):
    op: Literal["append_to_card"] = "append_to_card"
    taskId: str
    cardId: str
    slot: str
    items: List[Any]
    timestamp: Optional[str] = None


class ReplaceCard(BaseModel):
    op: Literal["replace_card"] = "replace_card"
    taskId: str
    cardId: str
    template: str
    data: Dict[str, Any] = {}
    timestamp: Optional[str] = None


class FinalizeCard(BaseModel):
    op: Literal["finalize_card"] = "finalize_card"
    taskId: str
    cardId: str
    timestamp: Optional[str] = None


class RemoveCard(BaseModel):
    op: Literal["remove_card"] = "remove_card"
    taskId: str
    cardId: str
    reason: Optional[str] = None
    timestamp: Optional[str] = None


class HtmlStream(BaseModel):
    op: Literal["html_stream"] = "html_stream"
    taskId: str
    cardId: str
    chunk: str
    done: Optional[bool] = None
    timestamp: Optional[str] = None


CardOp = Union[
    CreateCard,
    StreamToCard,
    UpdateCard,
    AppendToCard,
    ReplaceCard,
    FinalizeCard,
    RemoveCard,
    HtmlStream,
]

# --- Session-level events (task lifecycle) ---

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


class ExecResult(BaseModel):
    type: Literal["exec_result"] = "exec_result"
    taskId: str
    summary: str


class ExecError(BaseModel):
    type: Literal["exec_error"] = "exec_error"
    taskId: str
    error: str
    recoverable: bool


# All events over vi:stream:{uid}
StreamEvent = Union[
    CreateCard,
    StreamToCard,
    UpdateCard,
    AppendToCard,
    ReplaceCard,
    FinalizeCard,
    RemoveCard,
    HtmlStream,
    ExecStart,
    ExecProgress,
    ExecResult,
    ExecError,
]



# --- Card Actions (upstream: user → NanoClaw) ---

class CardAction(BaseModel):
    op: Literal["card_action"] = "card_action"
    cardId: str
    action: str
    payload: Dict[str, Any] = {}
    timestamp: Optional[str] = None


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

def channel_queue() -> str:
    return "vi:queue"

def channel_cron(uid: str, job_id: str) -> str:
    return f"vi:cron:{uid}:{job_id}"
