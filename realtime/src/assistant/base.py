"""
Core Assistant class — session management, page context, persistence, conversation history.

This is the central module of the assistant package. The Assistant class inherits
from Agent + all mixin classes (ToolsMixin, HeartbeatMixin, DispatchMixin).
"""
import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path

import aiohttp
import redis.asyncio as aioredis
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    room_io,
)
from livekit.api import LiveKitAPI
from livekit.plugins import noise_cancellation, silero

from utils import escape_xml, publish_info_bar

logger = logging.getLogger(__name__)

load_dotenv(".env.local")
load_dotenv(".env")

AGENT_NAME = os.getenv("AGENT_NAME", "VI")
VI_AGENT_NAME = os.getenv("VI_AGENT_NAME", "")

# --- Redis cached context for instant greeting ---
_redis_client: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis | None:
    global _redis_client
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            return None
        try:
            _redis_client = aioredis.from_url(redis_url, decode_responses=True)
        except Exception as e:
            logger.debug(f"[redis] Failed to connect: {e}")
            return None
    return _redis_client


async def _get_startup_context_cache(vi_user_id: str) -> str:
    """Read the last cached context from Redis as a startup fallback.

    This is used only once at session start to provide initial context before
    the PUB/SUB subscription (ContextMixin._start_context_subscription) takes over
    for live context updates. Returns empty string on miss/error.
    """
    try:
        r = await _get_redis()
        if not r:
            return ""
        val = await r.get(f"vi:ctx:{vi_user_id}")
        return val or ""
    except Exception as e:
        logger.debug(f"[redis] Failed to get cached context for {vi_user_id}: {e}")
        return ""


async def _get_resumption_token(vi_user_id: str) -> str | None:
    """Get cached Gemini session resumption token from Redis."""
    try:
        r = await _get_redis()
        if not r:
            return None
        return await r.get(f"vi:gemini:resume:{vi_user_id}")
    except Exception as e:
        logger.debug(f"[redis] Failed to get resumption token for {vi_user_id}: {e}")
        return None


async def _cache_resumption_token(vi_user_id: str, token: str):
    """Cache Gemini session resumption token with 2-hour TTL."""
    try:
        r = await _get_redis()
        if r and token:
            await r.set(f"vi:gemini:resume:{vi_user_id}", token, ex=7200)
    except Exception as e:
        logger.debug(f"[redis] Failed to cache resumption token for {vi_user_id}: {e}")


BASE_PROMPT_PATH = Path(__file__).parent.parent / "base.md"
try:
    AGENT_INSTRUCTIONS = BASE_PROMPT_PATH.read_text(encoding="utf-8").replace("{{AGENT_NAME}}", AGENT_NAME)
    AGENT_INSTRUCTIONS_CORE = AGENT_INSTRUCTIONS
except Exception as e:
    logger.error(f"Failed to load base.md: {e}")
    AGENT_INSTRUCTIONS = f"""You are {AGENT_NAME}, a warm and friendly voice assistant."""
    AGENT_INSTRUCTIONS_CORE = AGENT_INSTRUCTIONS

PAGE_PROMPTS = {
    "camera": (
        "## Camera Mode\n"
        "- Focus on visual analysis, describe what you see\n"
        "- Proactively suggest photo actions via suggest_action\n"
        "- Use update_info_bar to show perception status\n"
        "- On dispatch, gather <media> material first\n"
    ),
    "session": (
        "## Session Mode\n"
        "- Show structured progress of current task\n"
        "- MODIFICATION request → Re-dispatch via dispatch_to_nanoclaw\n"
        "- QUESTION about task → Answer directly, no dispatch\n"
        "- Use update_info_bar for task status\n"
    ),
    "home": (
        "## Home Mode\n"
        "- Help with navigation and memory management\n"
        "- Answer task history queries\n"
    ),
}



def log_info(message: str, participant_identity: str):
    if participant_identity.startswith("user"):
        logger.info(f"[user] {message}")
    elif participant_identity.startswith("agent"):
        logger.info(f"[agent] {message}")
    else:
        logger.info(f"{message}")


def extract_xml_tags(message: str) -> dict:
    results = []

    def replace_result(match: re.Match) -> str:
        tag = match.group(1)
        result_type = match.group(2) or "text"
        content = (match.group(3) or "").strip()
        results.append({"type": result_type, "content": content})
        return ""

    pattern = re.compile(r"<(show_result|result)\s*(?:type=\"([^\"]+)\")?\s*>(.*?)</\1>", re.DOTALL)
    cleaned = pattern.sub(replace_result, message)
    cleaned = re.sub(r"\s{3,}", "\n\n", cleaned).strip()
    return {"text": cleaned, "results": results}


async def publish_transcript(room: rtc.Room, transcript_type: str, content: str):
    payload = f"<transcript type=\"{transcript_type}\">{escape_xml(content)}</transcript>"
    logger.info(f"[publish_transcript] {payload}")
    await room.local_participant.publish_data(
        payload.encode("utf-8"),
        reliable=True,
        topic="agent_transcript",
    )


async def publish_result(room: rtc.Room, result_type: str, content: str):
    payload = f"<show_result type=\"{result_type}\">{escape_xml(content)}</show_result>"
    logger.info(f"[publish_result] {payload}")
    await room.local_participant.publish_data(
        payload.encode("utf-8"),
        reliable=True,
        topic="agent_result",
    )


async def publish_conversation_summary(room: rtc.Room, summary: str):
    """Publish conversation summary to frontend."""
    payload = f"<conversation_summary>{escape_xml(summary)}</conversation_summary>"
    logger.info(f"[publish_conversation_summary] {payload[:200]}")
    await room.local_participant.publish_data(
        payload.encode("utf-8"),
        reliable=True,
        topic="agent_summary",
    )


async def publish_intention_prompt(room: rtc.Room, intention: str):
    """Publish intention prompt to frontend."""
    payload = f"<intention_prompt>{escape_xml(intention)}</intention_prompt>"
    logger.info(f"[publish_intention_prompt] {payload[:200]}")
    await room.local_participant.publish_data(
        payload.encode("utf-8"),
        reliable=True,
        topic="agent_intention",
    )


# Import mixins — these must be imported after the module-level constants
# since they reference logger, _get_redis, PAGE_PROMPTS, etc.
from assistant.tools import ToolsMixin
from assistant.heartbeat import HeartbeatMixin
from assistant.dispatch import DispatchMixin
from assistant.context import ContextMixin


class Assistant(ToolsMixin, HeartbeatMixin, DispatchMixin, ContextMixin, Agent):
    """Base voice assistant — dispatches tasks to NanoClaw via Redis."""

    # Subclasses should set this to configure video handling
    use_video_context: bool = False

    # Internal API token for authenticating calls to api-server
    _INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "vi-internal-dev-token")
    if os.getenv("ENVIRONMENT") == "production" and _INTERNAL_API_TOKEN == "vi-internal-dev-token":
        raise RuntimeError("INTERNAL_API_TOKEN must be set in production — refusing to start with default dev token")

    def __init__(self, room_name: str, room: rtc.Room) -> None:
        super().__init__(instructions=AGENT_INSTRUCTIONS)
        self.room_name = room_name
        self.room = room
        self.user_identity: str | None = None
        self._agent_session: AgentSession | None = None
        self._job_context: JobContext | None = None
        # API server for task persistence
        self._api_base = os.getenv("API_BASE_URL", "http://api-server:8000")
        self._vi_user_id = room_name.replace("vi-room-", "") if room_name.startswith("vi-room-") else room_name
        self._current_session_id: str | None = None  # Track active session for status updates
        self._current_dispatch_started_at: float | None = None  # Staleness detection
        self._dispatch_heartbeat_count: int = 0  # Max retries for heartbeat task prompts
        self._generation_lock = asyncio.Lock()  # Serializes generate_reply() calls
        self._current_page = "camera"
        self._page_metadata = {}
        self._greeting_sent = False
        # Photo URLs from camera capture — injected into NanoClaw dispatch prompts
        self._pending_photo_urls: list[str] = []
        # Timeline: accumulates conversation entries for DB persistence
        self._session_timeline: list[dict] = []
        # Conversation session: tracks non-dispatch chat messages
        self._conversation_session_id: str | None = None
        self._conversation_timeline: list[dict] = []
        self._conversation_session_lock = asyncio.Lock()
        self._conversation_timeline_last_flush: float = 0.0
        # Latest context snapshot from NanoClaw (updated via vi:ctx subscription)
        self._latest_context: str = ""
        # Background task handles for context subscription
        self._context_sub_task: asyncio.Task | None = None
        self._keyframe_sampler_task: asyncio.Task | None = None
        # Catch-up context from greeting (used by _update_page_context)
        self._catch_up_section: str | None = None
        # Background tasks list — prevents fire-and-forget tasks from being GC'd
        self._background_tasks: list[asyncio.Task] = []
        # Shared HTTP session — lazy-initialized, reused across all internal API calls
        self._http_session: aiohttp.ClientSession | None = None

        logger.info(f"Assistant initialized for room: {room_name}, vi_user_id: {self._vi_user_id}")

    def _track_task(self, task: asyncio.Task) -> asyncio.Task:
        """Track a background task to prevent GC. Auto-removes on completion."""
        self._background_tasks.append(task)
        task.add_done_callback(lambda t: self._background_tasks.remove(t) if t in self._background_tasks else None)
        return task

    async def _get_http_session(self) -> aiohttp.ClientSession:
        """Return a shared aiohttp.ClientSession, creating it on first use."""
        if self._http_session is None or self._http_session.closed:
            self._http_session = aiohttp.ClientSession(
                headers=self._internal_headers,
                timeout=aiohttp.ClientTimeout(total=30),
            )
        return self._http_session

    async def _close_http_session(self):
        """Close the shared HTTP session if open."""
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
            self._http_session = None

    @property
    def _internal_headers(self) -> dict:
        """Headers for internal API calls (authenticates with api-server)."""
        return {"X-Internal-Token": self._INTERNAL_API_TOKEN}

    def record_timeline_entry(self, entry_type: str, content: str):
        """Record a conversation entry for later persistence to DB."""
        if not content:
            return
        entry = {
            "type": entry_type,
            "content": content[:2000],
            "ts": time.time(),
        }
        # Always record to conversation timeline (for non-dispatch chat persistence)
        self._conversation_timeline.append(entry)
        # Also record to dispatch session timeline when a dispatch is active
        if self._current_session_id:
            self._session_timeline.append(entry)

    async def ensure_conversation_session(self):
        """Create a session for non-dispatch chat conversation if one doesn't exist."""
        if self._conversation_session_id:
            return
        async with self._conversation_session_lock:
            # Double-check after acquiring lock
            if self._conversation_session_id:
                return
            try:
                http = await self._get_http_session()
                resp = await http.post(
                    f"{self._api_base}/api/internal/sessions",
                    json={
                        "vi_user_id": self._vi_user_id,
                        "context": {"source": "chat", "type": "conversation"},
                    },
                )
                if resp.status == 200:
                    data = await resp.json()
                    self._conversation_session_id = data.get("session_id")
                    logger.info(f"[conversation] Created chat session: {self._conversation_session_id}")
                else:
                    body = await resp.text()
                    logger.warning(f"[conversation] Failed to create session ({resp.status}): {body}")
            except Exception as e:
                logger.warning(f"[conversation] Error creating session: {e}")

    async def persist_conversation_timeline(self):
        """Persist conversation timeline to DB on disconnect.

        Only persists if there are user messages — agent-only timelines
        (e.g. just a greeting) are not worth saving as sessions.
        """
        if not self._conversation_timeline:
            return
        has_user_message = any(e.get("type") == "user" for e in self._conversation_timeline)
        if not has_user_message:
            logger.info("[conversation] Skipping timeline persist — no user messages (agent-only)")
            return
        try:
            await self.ensure_conversation_session()
            session_id = self._conversation_session_id
            if not session_id:
                logger.warning("[conversation] Cannot persist timeline — no session_id")
                return

            title = "Chat conversation"
            for entry in self._conversation_timeline:
                if entry.get("type") == "user":
                    title = entry.get("content", "Chat conversation")[:100]
                    break

            http = await self._get_http_session()
            resp = await http.patch(
                f"{self._api_base}/api/internal/sessions/{session_id}",
                json={
                    "timeline": self._conversation_timeline,
                    "title": title,
                    "status": "ended",
                },
            )
            if resp.status == 200:
                logger.info(f"[conversation] Timeline persisted ({len(self._conversation_timeline)} entries) to session {session_id}")
            else:
                body = await resp.text()
                logger.warning(f"[conversation] Timeline persist failed ({resp.status}): {body}")

            try:
                await http.patch(
                    f"{self._api_base}/api/internal/sessions/{session_id}/end",
                    json={},
                )
            except Exception:
                pass  # Best-effort

            self._conversation_timeline_last_flush = time.time()
        except Exception as e:
            logger.warning(f"[conversation] Error persisting timeline: {e}")

    async def _flush_conversation_timeline(self):
        """Periodically flush conversation timeline to DB as insurance against crashes."""
        session_id = self._conversation_session_id
        if not session_id or not self._conversation_timeline:
            return
        try:
            http = await self._get_http_session()
            resp = await http.patch(
                f"{self._api_base}/api/internal/sessions/{session_id}",
                json={"timeline": self._conversation_timeline},
            )
            if resp.status == 200:
                self._conversation_timeline_last_flush = time.time()
                logger.info(f"[conversation] Flushed timeline ({len(self._conversation_timeline)} entries)")
            else:
                logger.debug(f"[conversation] Timeline flush failed: {resp.status}")
        except Exception as e:
            logger.debug(f"[conversation] Timeline flush error: {e}")

    async def persist_session(self, text: str):
        """Persist a dispatch prompt as a session in the DB."""
        try:
            clean_prompt = text.strip()
            photo_urls = []
            if "\nPhotos:" in clean_prompt:
                photos_section = clean_prompt[clean_prompt.index("\nPhotos:"):]
                clean_prompt = clean_prompt[:clean_prompt.index("\nPhotos:")]
                photo_urls = re.findall(r'https?://[^\s]+', photos_section)
            if clean_prompt.startswith("intention:"):
                clean_prompt = clean_prompt[len("intention:"):].strip()

            http = await self._get_http_session()
            resp = await http.post(
                f"{self._api_base}/api/internal/sessions",
                json={
                    "vi_user_id": self._vi_user_id,
                    "context": {"source": "nanoclaw", "photos": photo_urls},
                },
            )
            if resp.status != 200:
                body = await resp.text()
                logger.warning(f"[persist_session] Session create failed ({resp.status}): {body}")
                return
            data = await resp.json()
            session_id = data.get('session_id')
            if not session_id:
                logger.warning(f"[persist_session] No session_id in response")
                return

            resp2 = await http.post(
                f"{self._api_base}/api/internal/sessions/{session_id}/dispatch",
                json={
                    "executor": "nanoclaw",
                    "prompt": clean_prompt[:500],
                },
            )
            if resp2.status == 200:
                self._current_session_id = session_id
                self._current_dispatch_started_at = time.time()
                self._dispatch_heartbeat_count = 0
                logger.info(f"[persist_session] Session dispatched: {session_id}")
                try:
                    await self.room.local_participant.publish_data(
                        json.dumps({"type": "task_started", "task_id": session_id, "description": clean_prompt[:200]}).encode(),
                        reliable=True,
                        topic="task_events",
                    )
                except Exception as pub_err:
                    logger.warning(f"[persist_session] Failed to publish task_started: {pub_err}")
            else:
                body2 = await resp2.text()
                logger.warning(f"[persist_session] Session dispatch failed ({resp2.status}): {body2}")
        except Exception as persist_err:
            logger.warning(f"[persist_session] Session persist error: {persist_err}")

    async def update_session_status(self, status: str, result: dict | None = None, error: str | None = None):
        """Update current session status in the DB and notify frontend."""
        session_id = self._current_session_id
        if not session_id:
            logger.debug("[update_session_status] No current session_id to update")
            return
        try:
            http = await self._get_http_session()
            if status == "complete":
                resp = await http.post(
                    f"{self._api_base}/api/internal/sessions/{session_id}/complete",
                    json={"result": result or {}},
                )
            elif status == "error":
                resp = await http.post(
                    f"{self._api_base}/api/internal/sessions/{session_id}/fail",
                    json={"error": error or "Unknown error"},
                )
            else:
                resp = await http.patch(
                    f"{self._api_base}/api/internal/sessions/{session_id}",
                    json={"status": status},
                )
            if resp.status == 200:
                logger.info(f"[update_session_status] Session {session_id} → {status}")
            else:
                body = await resp.text()
                logger.warning(f"[update_session_status] Failed ({resp.status}): {body}")
            if status in ("complete", "error") and self._session_timeline:
                try:
                    tl_resp = await http.patch(
                        f"{self._api_base}/api/internal/sessions/{session_id}",
                        json={"timeline": self._session_timeline},
                    )
                    if tl_resp.status == 200:
                        logger.info(f"[update_session_status] Timeline persisted ({len(self._session_timeline)} entries)")
                    else:
                        tl_body = await tl_resp.text()
                        logger.warning(f"[update_session_status] Timeline persist failed ({tl_resp.status}): {tl_body}")
                except Exception as tl_err:
                    logger.warning(f"[update_session_status] Timeline persist error: {tl_err}")
            try:
                await self.room.local_participant.publish_data(
                    json.dumps({"type": "task_result", "task_id": session_id, "status": status}).encode(),
                    reliable=True,
                    topic="task_events",
                )
            except Exception as pub_err:
                logger.warning(f"[update_session_status] Failed to publish task_result: {pub_err}")
            if status in ("complete", "error"):
                self._current_session_id = None
                self._current_dispatch_started_at = None
                self._dispatch_heartbeat_count = 0
                self._session_timeline = []
        except Exception as err:
            logger.warning(f"[update_session_status] Error: {err}")

    def get_room_options(self) -> room_io.RoomOptions:
        """Return RoomOptions for this assistant. Override in subclasses."""
        return room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        )

    def set_user_identity(self, identity: str):
        """Track the active user participant identity."""
        self.user_identity = identity
        self.last_talk_time = time.time()
        log_info(f"User participant set: {identity}", identity)

    async def _update_page_context(self, page: str):
        """Update instructions based on current page."""
        self._current_page = page
        page_section = PAGE_PROMPTS.get(page, PAGE_PROMPTS["camera"])
        base = AGENT_INSTRUCTIONS_CORE
        if self._catch_up_section:
            new_instructions = base + "\n\n" + page_section + "\n\n## Context\n" + self._catch_up_section
        else:
            new_instructions = base + "\n\n" + page_section
        await self.update_instructions(new_instructions)
        logger.info(f"[page_context] Updated instructions for page: {page}")

    async def _shutdown(self, reason: str):
        """Perform complete shutdown of agent session and room."""
        logger.warning(f"[shutdown] Initiating shutdown: {reason}")

        await self._publish_user_event("session_ended", {"reason": reason})

        # Cancel background tasks
        if self._context_sub_task and not self._context_sub_task.done():
            self._context_sub_task.cancel()
        if self._keyframe_sampler_task and not self._keyframe_sampler_task.done():
            self._keyframe_sampler_task.cancel()

        # Say goodbye to the user (best-effort, single attempt)
        if self._agent_session and self.user_identity:
            try:
                await asyncio.sleep(1)
                self._agent_session.generate_reply(user_input=f"[SYSTEM: Session ending. Say a brief goodbye.]")
                logger.info("[shutdown] Goodbye message sent")
                await asyncio.sleep(3)
            except Exception as e:
                logger.warning(f"[shutdown] Failed to say goodbye: {e}")

        # Persist conversation timeline (non-dispatch chat messages)
        try:
            await self.persist_conversation_timeline()
        except Exception as e:
            logger.warning(f"[shutdown] Failed to persist conversation timeline: {e}")

        # Memory is handled exclusively by NanoClaw memory-hook (diary + promote)
        # LiveKit voice chat does not write memory — only NanoClaw tasks do

        # Cache Gemini session resumption token for faster next-session connect
        try:
            if self._agent_session and self._agent_session.llm:
                llm = self._agent_session.llm
                handle = None
                sessions = getattr(llm, "_sessions", None)
                if sessions:
                    for rt_session in sessions:
                        h = getattr(rt_session, "session_resumption_handle", None)
                        if h:
                            handle = h
                            break
                if handle:
                    await _cache_resumption_token(self._vi_user_id, handle)
                    logger.info("[shutdown] Cached Gemini session resumption token")
                else:
                    logger.info("[shutdown] No resumption token available to cache")
        except Exception as e:
            logger.warning(f"[shutdown] Failed to cache resumption token: {e}")

        # Close shared HTTP session
        try:
            await self._close_http_session()
        except Exception as e:
            logger.warning(f"[shutdown] Failed to close HTTP session: {e}")

        try:
            if self._agent_session:
                logger.info("[shutdown] Closing agent session...")
                await self._agent_session.aclose()
                logger.info("[shutdown] Agent session closed")

            if self.room:
                logger.info("[shutdown] Disconnecting from room...")
                await self.room.disconnect()
                logger.info("[shutdown] Room disconnected")

            if self._job_context:
                logger.info("[shutdown] Shutting down job context...")
                try:
                    shutdown_result = self._job_context.shutdown()
                    if shutdown_result is not None:
                        await shutdown_result
                    logger.info("[shutdown] Job context shutdown complete")
                except Exception as ctx_err:
                    logger.warning(f"[shutdown] Job context shutdown failed: {ctx_err}")

            logger.info(f"[shutdown] Agent shutdown complete: {reason}")

        except Exception as e:
            logger.error(f"[shutdown] Error during shutdown: {e}", exc_info=True)

    # Internal methods (_publish_user_event, _push_to_frontend, _start_context_subscription,
    # _format_intention_hints, _start_keyframe_sampler) are provided by ContextMixin.


server = AgentServer(num_idle_processes=1)


def prewarm(proc: JobProcess):
    """Prewarm VAD model for faster startup."""
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


async def run_agent(ctx: JobContext, assistant: Assistant, create_session):
    """Shared agent runtime wiring."""
    ctx.log_context_fields = {"room": ctx.room.name}

    user_state: dict[str, str | None] = {"identity": None}
    session: AgentSession | None = None
    catch_up_done = False
    duplicate_check_passed = False

    async def _fire_instant_greeting():
        """Read cached context from Redis + memory API and fire greeting immediately."""
        if assistant._greeting_sent or session is None:
            return
        try:
            cached = await _get_startup_context_cache(assistant._vi_user_id)

            memory_context = ""
            try:
                http = await assistant._get_http_session()
                resp = await http.get(
                    f"{assistant._api_base}/api/internal/memories/context/{assistant._vi_user_id}",
                    params={"max_chars": 1500},
                    timeout=aiohttp.ClientTimeout(total=3),
                )
                if resp.status == 200:
                    data = await resp.json()
                    memory_context = data.get("context", "")
                    if memory_context:
                        logger.info(f"[init] Fetched memory context ({len(memory_context)} chars)")
            except Exception as mem_err:
                logger.debug(f"[init] Memory context fetch failed (non-critical): {mem_err}")

            combined_context = ""
            if cached:
                combined_context = cached[:1500]
            if memory_context:
                if combined_context:
                    combined_context += f"\n\n## User Memory\n{memory_context[:1000]}"
                else:
                    combined_context = memory_context[:1500]

            if combined_context:
                assistant._catch_up_section = combined_context
                greeting_prompt = (
                    "[SYSTEM: Do NOT call any tools. Greet the user warmly in under 10 words. "
                    + f"Previous context: {combined_context[:150]}]"
                )
            else:
                greeting_prompt = "[SYSTEM: Do NOT call any tools. If you can see video input, briefly describe what you see in under 15 words. Otherwise, greet warmly in under 10 words.]"
            assistant._greeting_sent = True
            session.generate_reply(user_input=greeting_prompt)
            logger.info(f"[init] Instant greeting fired (cached={'yes' if cached else 'no'}, memory={'yes' if memory_context else 'no'})")
        except Exception as e:
            logger.warning(f"[init] Instant greeting failed: {e}")

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        nonlocal catch_up_done
        if not duplicate_check_passed:
            logger.info(f"[init] Ignoring participant_connected (duplicate check pending): {participant.identity}")
            return
        log_info(f"Participant connected: {participant.identity}", participant.identity)

        if participant.identity.startswith("user-"):
            user_state["identity"] = participant.identity
            assistant.set_user_identity(participant.identity)

            if session is not None:
                try:
                    session.room_io.set_participant(participant.identity)
                    logger.info(f"[session] Linked participant set to {participant.identity}")
                except Exception as exc:
                    logger.warning(f"[session] Failed to set linked participant: {exc}")

            if session is not None and not assistant._greeting_sent:
                asyncio.create_task(_fire_instant_greeting())

            if not catch_up_done and session is not None:
                catch_up_done = True
                assistant.catch_up_done = True
                logger.info("[init] User ready, catch-up marked done (Redis context)")

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        if not duplicate_check_passed:
            return
        log_info(f"Participant disconnected: {participant.identity}", participant.identity)

        if participant.identity.startswith("user-"):
            logger.info(f"[disconnect] User disconnected, triggering shutdown...")
            assistant.should_stop_heartbeat = True
            asyncio.create_task(assistant._shutdown("User disconnected"))

    @ctx.room.on("track_subscribed")
    def on_track_subscribed(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if not duplicate_check_passed:
            return
        source = getattr(publication, "source", None)
        log_info(
            f"Track subscribed: kind={track.kind} source={source} sid={publication.sid}",
            participant.identity,
        )

    for participant in ctx.room.remote_participants.values():
        if participant.identity.startswith("user-"):
            user_state["identity"] = participant.identity
            assistant.set_user_identity(participant.identity)

    logger.info("Connecting to LiveKit room...")
    await ctx.connect()
    logger.info("Connected to room, setting up event handlers...")

    # Duplicate agent guard — kick old agent, new agent always proceeds
    my_identity = ctx.room.local_participant.identity
    other_agents = [
        p.identity
        for p in ctx.room.remote_participants.values()
        if p.identity.startswith("agent-") and p.identity != my_identity
    ]

    if other_agents:
        logger.warning(
            f"[init] Old agent(s) in room: {other_agents}, removing via Server API..."
        )
        try:
            lk_url = os.environ.get("LIVEKIT_URL", "")
            lk_key = os.environ.get("LIVEKIT_API_KEY", "")
            lk_secret = os.environ.get("LIVEKIT_API_SECRET", "")
            async with LiveKitAPI(url=lk_url, api_key=lk_key, api_secret=lk_secret) as lk_api:
                for agent_id in other_agents:
                    try:
                        await lk_api.room.remove_participant(
                            room=ctx.room.name, identity=agent_id
                        )
                        logger.info(f"[init] Kicked old agent: {agent_id}")
                    except Exception as e:
                        logger.warning(f"[init] Failed to kick {agent_id}: {e}")
        except Exception as e:
            logger.warning(f"[init] LiveKit API error: {e}, waiting 5s for old agent to leave")
            await asyncio.sleep(5)

    duplicate_check_passed = True
    logger.info("[init] Duplicate check passed, enabling event processing")

    # V5: Handle page_context from DataChannel (best-effort, for voice agent context)
    @ctx.room.on("data_received")
    def _on_data_received(data_packet):
        try:
            msg = json.loads(data_packet.data.decode("utf-8"))
            if msg.get("type") == "page_context":
                page = msg.get("page", "camera")
                assistant._current_page = page
                if hasattr(assistant, '_update_page_context'):
                    asyncio.create_task(assistant._update_page_context(page))
                asyncio.create_task(assistant._publish_user_event("page_navigate", {"page": page}))
                logger.info(f"[page_context] Updated instructions for page: {page}")
        except Exception as e:
            logger.debug(f"[data] Failed to parse DataChannel message: {e}")

    for participant in ctx.room.remote_participants.values():
        if participant.identity.startswith("user-") and not user_state["identity"]:
            user_state["identity"] = participant.identity
            assistant.set_user_identity(participant.identity)
            logger.info(f"[init] User already in room (post-connect): {participant.identity}")

    logger.info("Creating AgentSession...")
    resumption_token = await _get_resumption_token(assistant._vi_user_id)
    if resumption_token:
        logger.info(f"[init] Found Gemini resumption token, attempting session resume")
    try:
        session = create_session(ctx, resumption_handle=resumption_token)
    except TypeError:
        session = create_session(ctx)
    assistant._agent_session = session
    assistant._job_context = ctx

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event):
        assistant.last_talk_time = time.time()
        if not event.is_final:
            return
        identity = user_state["identity"] or "user"
        log_info(f"[session] User speech transcribed: {event.transcript[:100]}", identity)
        if identity:
            asyncio.create_task(publish_transcript(ctx.room, "user", event.transcript))
            assistant.record_timeline_entry("user", event.transcript)
            asyncio.create_task(assistant._publish_user_event(
                "voice_transcript", {"text": event.transcript[:500]}
            ))

    @session.on("agent_speech_committed")
    def on_agent_speech_committed(event):
        assistant.last_talk_time = time.time()
        assistant.last_agent_time = time.time()
        log_info(f"[session] Agent started speaking", user_state["identity"] or "agent")

    last_processed_message = {"content": None, "timestamp": 0}

    @session.on("conversation_item_added")
    def on_conversation_item_added(event):
        if event.item.role != "assistant":
            return
        assistant.last_talk_time = time.time()
        assistant.last_agent_time = time.time()

        identity = user_state["identity"]
        message = event.item.text_content or ""
        if identity and message:
            current_time = time.time()
            last_msg = last_processed_message["content"]
            time_since_last = current_time - last_processed_message["timestamp"]

            is_duplicate = False
            if last_msg and time_since_last < 10:
                if message == last_msg:
                    is_duplicate = True
                elif message.startswith(last_msg) or last_msg.startswith(message):
                    is_duplicate = True

            if is_duplicate:
                log_info(f"[session] Skipping duplicate agent speech (seen {time_since_last:.1f}s ago)", identity)
                if len(message) > len(last_msg):
                    last_processed_message["content"] = message
                return

            last_processed_message["content"] = message
            last_processed_message["timestamp"] = current_time

            log_info(f"[session] Agent speech: {message[:100]}", identity)
            parsed = extract_xml_tags(message)
            if parsed["text"]:
                asyncio.create_task(publish_transcript(ctx.room, "agent", parsed["text"]))
                assistant.record_timeline_entry("agent", parsed["text"])
            for result in parsed["results"]:
                asyncio.create_task(publish_result(ctx.room, result["type"], result["content"]))

    logger.info(f"Starting AgentSession with room (video_context={assistant.use_video_context})...")

    room_opts = assistant.get_room_options()

    await session.start(
        agent=assistant,
        room=ctx.room,
        room_options=room_opts,
    )

    if user_state["identity"]:
        try:
            session.room_io.set_participant(user_state["identity"])
            logger.info(f"[session] Linked participant set to {user_state['identity']}")
        except Exception as exc:
            logger.warning(f"[session] Failed to set linked participant: {exc}")

    logger.info("========== AGENT SESSION STARTED AND RUNNING ==========")

    if user_state["identity"]:
        await _fire_instant_greeting()

    if not catch_up_done and user_state["identity"]:
        catch_up_done = True
        assistant.catch_up_done = True
        logger.info("[init] Catch-up marked done (Redis context)")

    assistant._context_sub_task = asyncio.create_task(
        assistant._start_context_subscription()
    )
    logger.info("[init] Context subscription started")

    await assistant._publish_user_event("session_started", {
        "room": ctx.room.name,
    })

    if hasattr(assistant, '_start_keyframe_sampler'):
        assistant._keyframe_sampler_task = asyncio.create_task(
            assistant._start_keyframe_sampler()
        )
        logger.info("[init] Keyframe sampler started (stub)")

    assistant.start_heartbeat()
