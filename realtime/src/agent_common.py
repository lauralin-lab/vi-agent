"""
VI LiveKit Agent — shared utilities and base assistant.
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
    RunContext,
    function_tool,
    room_io,
)
from livekit.plugins import noise_cancellation, silero

from utils import escape_xml, publish_info_bar

logger = logging.getLogger(__name__)

load_dotenv(".env.local")
load_dotenv(".env")

AGENT_NAME = os.getenv("AGENT_NAME", "VI")
GATEWAY_URL = os.getenv("GATEWAY_URL", "")
VI_AGENT_NAME = os.getenv("VI_AGENT_NAME", "")
B2G_RPC_TIMEOUT_SECONDS = 60.0

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


async def _get_cached_context(vi_user_id: str) -> str:
    """Read cached catch-up context from Redis. Returns empty string on miss/error."""
    try:
        r = await _get_redis()
        if not r:
            return ""
        val = await r.get(f"vi:ctx:{vi_user_id}")
        return val or ""
    except Exception as e:
        logger.debug(f"[redis] Failed to get cached context for {vi_user_id}: {e}")
        return ""


async def _cache_context(vi_user_id: str, content: str):
    """Cache catch-up context in Redis with 30-day TTL."""
    try:
        r = await _get_redis()
        if r and content:
            await r.set(f"vi:ctx:{vi_user_id}", content, ex=30 * 86400)
    except Exception as e:
        logger.debug(f"[redis] Failed to cache context for {vi_user_id}: {e}")


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


async def invite_gateway_to_room(room_name: str, force: bool = False) -> bool:
    """Call the gateway HTTP endpoint to invite it into a LiveKit room.
    
    Args:
        room_name: LiveKit room name to join
        force: If True, force the gateway to disconnect and rejoin even if already in room
    """
    if not GATEWAY_URL:
        logger.warning("[gateway_invite] GATEWAY_URL not set, skipping gateway invitation")
        return False
    url = f"{GATEWAY_URL.rstrip('/')}/join"
    try:
        async with aiohttp.ClientSession() as session:
            payload = {"room_name": room_name}
            if force:
                payload["force"] = True
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                body = await resp.json()
                if body.get("ok"):
                    logger.info(f"[gateway_invite] Gateway invited to room {room_name} (force={force})")
                    return True
                else:
                    logger.warning(f"[gateway_invite] Gateway declined: {body}")
                    return False
    except Exception as e:
        logger.error(f"[gateway_invite] Failed to invite gateway to {room_name}: {e}")
        return False

BASE_PROMPT_PATH = Path(__file__).parent / "base.md"
try:
    AGENT_INSTRUCTIONS_TEMPLATE = BASE_PROMPT_PATH.read_text(encoding="utf-8")
    AGENT_INSTRUCTIONS = AGENT_INSTRUCTIONS_TEMPLATE.replace("{{AGENT_NAME}}", AGENT_NAME)
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
        "- MODIFICATION request → Re-dispatch via rpc_b2g_create_*\n"
        "- QUESTION about task → Answer directly, no dispatch\n"
        "- Use update_info_bar for task status\n"
    ),
    "home": (
        "## Home Mode\n"
        "- Help with navigation and memory management\n"
        "- Answer task history queries\n"
        "- Use rpc_b2g_update_memory for explicit memory saves\n"
    ),
}

CATCH_UP_FOLLOWUP_PROMPT = """

[FOLLOW-UP INSTRUCTION]
The above context was retrieved to help you catch up on the conversation so far.
Inheritently acknowledge the context provided and continue assisting the user seamlessly.

Recommended response:
**Conversation not started**: greet the user and offer help based on the context.
**Already chatting**: seamlessly continue the conversation without referencing the context retrieval.

Important:
- DO NOT mention that you are catching up or that context was retrieved.
- DO NOT call rpc_b2g_dispatch_message or rpc_b2g_update_memory as part of catch-up.
- BE VERY CONCISE in your response to avoid overwhelming the user with a long reply immediately after catch-up.

DO NOT call rpc_b2g_dispatch_message or rpc_b2g_update_memory as part of catch-up!!!
"""

def log_info(message: str, participant_identity: str):
    if participant_identity.startswith("gateway"):
        logger.info(f"[gateway] {message}")
    elif participant_identity.startswith("user"):
        logger.info(f"[user] {message}")
    elif participant_identity.startswith("agent"):
        logger.info(f"[agent] {message}")
    else:
        logger.info(f"{message}")


def expand_media_tags(text: str) -> str:
    pattern = re.compile(r'<media\s+id="([^"]+)"\s+ext="([^"]*)"\s*></media>')

    def replace_tag(match: re.Match) -> str:
        media_id = match.group(1)
        ext = match.group(2)
        filename = f"{media_id}.{ext}" if ext else media_id
        path = f"uploads/{filename}"
        replaced = f"{path}"
        logger.debug(f"[replace_tag] {replaced}")
        return replaced

    return pattern.sub(replace_tag, text)


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


def strip_medias_section(text: str) -> str:
    """Remove **Medias** section and everything after it from gateway response."""
    if not text:
        return text
    # Find **Medias** marker and strip it and everything after
    marker_patterns = [r"\n\*\*Medias\*\*", r"\*\*Medias\*\*"]
    for pattern in marker_patterns:
        match = re.search(pattern, text)
        if match:
            return text[:match.start()].strip()
    return text


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


# ── Action Card reply_hint templates ──
# Use inline styles to survive Tailwind v4 CDN resets in iframes.
_BTN_STYLE = (
    "display:inline-flex;align-items:center;justify-content:center;gap:8px;"
    "padding:0.55em 1.1em;border-radius:14px;border:1px solid rgba(0,0,0,0.06);"
    "background:#fff;color:rgba(0,0,0,0.6);font-weight:500;font-size:13px;"
    "cursor:pointer;transition:all 0.2s"
)
ACTION_CARD_INTENT_HINT = (
    "Analyze the photos and user intention. Generate an action card as HTML.\n"
    "The card should:\n"
    "1. Show a brief observation about what you see (1-2 sentences) as a <p>\n"
    "2. Present 2-4 contextually relevant action buttons\n"
    "   Examples: Product → 'Search prices', 'Find reviews'; Place → 'Get directions', 'Find nearby'\n"
    "3. Keep options specific and relevant to what you see — never generic.\n\n"
    "IMPORTANT — Use this exact HTML structure:\n"
    "<div style=\"background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:20px;padding:1em\">\n"
    "  <p style=\"margin-bottom:0.8em;color:rgba(0,0,0,0.6);font-size:14px\">Your observation here</p>\n"
    "  <div style=\"display:flex;flex-wrap:wrap;gap:8px\">\n"
    f'    <button style="{_BTN_STYLE}" data-action="vi_select" data-title="What would you like to do?" '
    'data-option="Option 1" data-all-options="Option 1|Option 2|Option 3">Option 1</button>\n'
    f'    <button style="{_BTN_STYLE}" data-action="vi_select" data-title="What would you like to do?" '
    'data-option="Option 2" data-all-options="Option 1|Option 2|Option 3">Option 2</button>\n'
    "  </div>\n"
    "</div>\n\n"
    "Rules:\n"
    "- Use INLINE STYLES on every button (copy the style exactly from the example above)\n"
    "- Do NOT use class attributes on buttons — only inline style\n"
    "- Buttons MUST have: data-action=\"vi_select\", data-title, data-option, data-all-options\n"
    "- data-title = a short description of the card context\n"
    "- data-all-options = ALL button texts joined by | (pipe)\n"
    "- Do NOT add any other elements, scripts, or wrapper HTML\n"
    "- Max 4 buttons"
)



class Assistant(Agent):
    """Base voice assistant — delegates to VI Gateway."""

    # Subclasses should set this to configure video handling
    use_video_context: bool = False

    # Internal API token for authenticating calls to api-server
    _INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "vi-internal-dev-token")

    def __init__(self, room_name: str, room: rtc.Room) -> None:
        super().__init__(instructions=AGENT_INSTRUCTIONS)
        self.room_name = room_name
        self.room = room
        self.gateway_participant: rtc.RemoteParticipant | None = None
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
        # Photo URLs captured from [USER_DISPATCH] — injected into gateway calls
        self._pending_photo_urls: list[str] = []
        # Stability: pending gateway responses queue (never drop responses)
        self._pending_gateway_responses: asyncio.Queue = asyncio.Queue()
        # Timeline: accumulates conversation entries for DB persistence
        self._session_timeline: list[dict] = []
        # Conversation session: tracks non-dispatch chat messages
        self._conversation_session_id: str | None = None
        self._conversation_timeline: list[dict] = []
        self._conversation_session_lock = asyncio.Lock()
        self._conversation_timeline_last_flush: float = 0.0
        # Action card: stores original [USER_DISPATCH] text for gateway context on [ActionCard]
        self._pending_dispatch_text: str | None = None
        # Tracks whether gateway is generating an action card (suppress "website ready" speech)
        self._awaiting_action_card: bool = False

        logger.info(f"Assistant initialized for room: {room_name}, vi_user_id: {self._vi_user_id}")

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
        """Create a session for non-dispatch chat conversation if one doesn't exist.

        Uses a lock to prevent duplicate creation from concurrent messages.
        """
        if self._conversation_session_id:
            return
        async with self._conversation_session_lock:
            # Double-check after acquiring lock
            if self._conversation_session_id:
                return
            try:
                async with aiohttp.ClientSession(headers=self._internal_headers) as http:
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

        Creates a session if needed, patches it with timeline entries,
        derives title from first user message, and sets status to 'ended'.
        """
        if not self._conversation_timeline:
            return
        try:
            # Ensure we have a session to attach the timeline to
            await self.ensure_conversation_session()
            session_id = self._conversation_session_id
            if not session_id:
                logger.warning("[conversation] Cannot persist timeline — no session_id")
                return

            # Derive title from first user message
            title = "Chat conversation"
            for entry in self._conversation_timeline:
                if entry.get("type") == "user":
                    title = entry.get("content", "Chat conversation")[:100]
                    break

            async with aiohttp.ClientSession(headers=self._internal_headers) as http:
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

                # Also mark session as ended
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
            async with aiohttp.ClientSession(headers=self._internal_headers) as http:
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
        """Persist a [USER_DISPATCH] message as a session in the DB."""
        try:
            import re as _re
            clean_prompt = text.replace("[USER_DISPATCH]", "").strip()
            photo_urls = []
            if "\nPhotos:" in clean_prompt:
                photos_section = clean_prompt[clean_prompt.index("\nPhotos:"):]
                clean_prompt = clean_prompt[:clean_prompt.index("\nPhotos:")]
                photo_urls = _re.findall(r'https?://[^\s]+', photos_section)
            if clean_prompt.startswith("intention:"):
                clean_prompt = clean_prompt[len("intention:"):].strip()

            async with aiohttp.ClientSession(headers=self._internal_headers) as http:
                # Step 1: Create a new session
                resp = await http.post(
                    f"{self._api_base}/api/internal/sessions",
                    json={
                        "vi_user_id": self._vi_user_id,
                        "context": {"source": "gateway", "photos": photo_urls},
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

                # Step 2: Dispatch the session
                resp2 = await http.post(
                    f"{self._api_base}/api/internal/sessions/{session_id}/dispatch",
                    json={
                        "executor": "gateway",
                        "prompt": clean_prompt[:500],
                    },
                )
                if resp2.status == 200:
                    self._current_session_id = session_id
                    self._current_dispatch_started_at = time.time()
                    self._dispatch_heartbeat_count = 0
                    logger.info(f"[persist_session] Session dispatched: {session_id}")
                    # Publish real-time task_started event to frontend
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
            async with aiohttp.ClientSession(headers=self._internal_headers) as http:
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
                    # progress update
                    resp = await http.patch(
                        f"{self._api_base}/api/internal/sessions/{session_id}",
                        json={"status": status},
                    )
                if resp.status == 200:
                    logger.info(f"[update_session_status] Session {session_id} → {status}")
                else:
                    body = await resp.text()
                    logger.warning(f"[update_session_status] Failed ({resp.status}): {body}")
                # Persist conversation timeline on completion/error
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
            # Publish real-time task_result event to frontend
            try:
                await self.room.local_participant.publish_data(
                    json.dumps({"type": "task_result", "task_id": session_id, "status": status}).encode(),
                    reliable=True,
                    topic="task_events",
                )
            except Exception as pub_err:
                logger.warning(f"[update_session_status] Failed to publish task_result: {pub_err}")
            # Clear session_id after terminal states
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

    def set_gateway_participant(self, participant: rtc.RemoteParticipant):
        """Set gateway participant for RPC calls."""
        self.gateway_participant = participant
        log_info(f"Gateway participant set: {participant.identity}", participant.identity)

    def _scan_for_gateway(self) -> bool:
        """Actively scan room.remote_participants for a gateway participant.
        
        This fixes the race condition where gateway joins during the duplicate-check
        window and the participant_connected event is silently ignored.
        Returns True if a gateway was found and set.
        """
        if self.gateway_participant:
            return True
        try:
            for participant in self.room.remote_participants.values():
                if participant.identity.startswith("gateway-"):
                    logger.info(f"[_scan_for_gateway] Found gateway in room: {participant.identity}")
                    self.set_gateway_participant(participant)
                    return True
        except Exception as e:
            logger.warning(f"[_scan_for_gateway] Error scanning participants: {e}")
        return False

    def set_user_identity(self, identity: str):
        """Track the active user participant identity."""
        self.user_identity = identity
        self.last_talk_time = time.time()
        log_info(f"User participant set: {identity}", identity)

    def start_heartbeat(self):
        """Start periodic heartbeat task."""
        self.start_time = time.time()
        self.last_talk_time = time.time()
        self.last_agent_time = time.time()
        self.last_heartbeat_time = time.time()
        self.should_stop_heartbeat = False
        self.catch_up_done = False
        asyncio.create_task(self._heartbeat_loop())

    async def _heartbeat_loop(self):
        """Periodic heartbeat to log status and perform catch-up."""
        logger.info("[heartbeat] Started")
        while True:
            try:
                # Check if we should stop
                if self.should_stop_heartbeat:
                    logger.info("[heartbeat] Stopping due to user disconnect")
                    break
                
                # Mark catch-up done if not yet done (V3 uses cached Redis context)
                if not self.catch_up_done and self.user_identity and self.gateway_participant and self._agent_session:
                    self.catch_up_done = True
                    logger.info("[heartbeat] Catch-up marked done (V3 cached context)")

                await asyncio.sleep(10)
                self._trim_conversation_history()
                # Drain any pending gateway responses that were queued due to timeout
                await self._drain_pending_responses()
                # Periodically flush conversation timeline to DB (every 60s)
                if (self._conversation_timeline
                    and time.time() - self._conversation_timeline_last_flush > 60):
                    await self._flush_conversation_timeline()
                now = time.time()
                session_time = int(now - self.start_time)
                idle_time = int(now - self.last_talk_time)
                agent_time = int(now - self.last_agent_time)
                heartbeat_time = int(now - self.last_heartbeat_time)
                
                gateway_id = self.gateway_participant.identity if self.gateway_participant else "None"
                user_id = self.user_identity if self.user_identity else "None"
                agent_id = self.room.local_participant.identity if self.room else "None"
                
                # Determine who's talking (simplified - based on recent activity)
                talking = "none"
                if idle_time < 3:  # Someone talked within last 3 seconds
                    talking = "active"

                logger.debug(f"[HEARTBEAT] Agent: {agent_id}, User: {user_id}, Gateway: {gateway_id}")
                logger.debug(f"[HEARTBEAT] Talking: {talking}, Since start: {session_time}s, Since last talk: {idle_time}s")

                # Smart heartbeat: conditional triggers to reduce wasteful LLM calls
                has_pending_dispatch = self._current_session_id is not None
                agent_silent_long = agent_time > 15  # Agent hasn't spoken in 15s

                # Staleness detection: auto-clear tasks stuck > 5 minutes
                if has_pending_dispatch and self._current_dispatch_started_at:
                    task_age = now - self._current_dispatch_started_at
                    if task_age > 300:  # 5 minutes
                        stale_task_id = self._current_session_id
                        logger.warning(f"[heartbeat] Task {stale_task_id} stale after {int(task_age)}s, auto-clearing")
                        # Clear synchronously first to prevent re-firing on next heartbeat
                        self._current_session_id = None
                        self._current_dispatch_started_at = None
                        self._dispatch_heartbeat_count = 0
                        has_pending_dispatch = False  # Skip task prompt below
                        # Fire-and-forget: update API server and notify frontend
                        async def _notify_stale_task(tid):
                            try:
                                async with aiohttp.ClientSession(headers=self._internal_headers) as http:
                                    await http.post(
                                        f"{self._api_base}/api/internal/sessions/{tid}/fail",
                                        json={"error": "Session timeout after 5 minutes"},
                                        timeout=aiohttp.ClientTimeout(total=5),
                                    )
                            except Exception as e:
                                logger.warning(f"[heartbeat] Failed to mark stale session {tid} as failed: {e}")
                            try:
                                await self.room.local_participant.publish_data(
                                    json.dumps({"type": "task_result", "task_id": tid, "status": "error"}).encode(),
                                    reliable=True, topic="task_events",
                                )
                            except Exception as e:
                                logger.warning(f"[heartbeat] Failed to publish stale task event: {e}")
                        asyncio.create_task(_notify_stale_task(stale_task_id))
                        try:
                            await publish_info_bar(self.room, "ready", "Task timed out, please retry")
                        except Exception as e:
                            logger.warning(f"[heartbeat] Failed to publish timeout info bar: {e}")

                if self._agent_session:
                    if has_pending_dispatch and agent_silent_long and self._dispatch_heartbeat_count < 3:
                        # Active task + agent silent 30s → check progress (max 3 times)
                        self._dispatch_heartbeat_count += 1
                        logger.info(f"[heartbeat] Pending task + agent silent {agent_time}s, prompting progress check ({self._dispatch_heartbeat_count}/3)")
                        try:
                            self.last_talk_time = now
                            self.last_heartbeat_time = now
                            self._agent_session.generate_reply(
                                user_input="[HEARTBEAT: Active task pending, check progress]"
                            )
                        except Exception as e:
                            logger.debug(f"[heartbeat] Failed to trigger task check: {e}")
                    elif has_pending_dispatch and self._dispatch_heartbeat_count >= 3:
                        logger.info(f"[heartbeat] Max heartbeat retries reached for task {self._current_session_id}, waiting for staleness timeout")
                    elif not has_pending_dispatch and idle_time > 180 and heartbeat_time > 180:
                        # No task + 3min idle → gentle offer
                        logger.info(f"[heartbeat] No task + idle {idle_time}s, offering assistance")
                        try:
                            self.last_talk_time = now
                            self.last_heartbeat_time = now
                            self._agent_session.generate_reply(
                                user_input="[HEARTBEAT: User idle, offer assistance briefly]"
                            )
                        except Exception as e:
                            logger.debug(f"[heartbeat] Failed to trigger idle prompt: {e}")
                    # else: stay silent — no need to waste LLM inference
                
                # Shutdown conditions
                if self._agent_session:
                    should_shutdown = False
                    shutdown_reason = ""
                    
                    # Shutdown if no user in room
                    if not self.user_identity:
                        should_shutdown = True
                        shutdown_reason = f"No user in room"
                    
                    # Shutdown if idle > 5 mins AND agent hasn't spoken in > 5 mins
                    elif idle_time > 300 and agent_time > 300:
                        should_shutdown = True
                        shutdown_reason = f"Idle timeout (300s) and agent silent (300s)"
                    
                    # Shutdown if agent hasn't spoken in > 10 minutes
                    elif agent_time > 600:
                        should_shutdown = True
                        shutdown_reason = f"Agent silent for 10 minutes"
                    
                    # Shutdown if total session > 30 minutes
                    elif session_time > 1800:
                        should_shutdown = True
                        shutdown_reason = f"Session time exceeded 30 minutes"
                    
                    if should_shutdown:
                        logger.warning(f"[heartbeat] Shutdown triggered: {shutdown_reason}")
                        logger.warning(f"!!! SHUTDOWN: {shutdown_reason} !!!")
                        await self._shutdown(shutdown_reason)
                        break
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[heartbeat] Heartbeat loop error: {e}")

    def _trim_conversation_history(self):
        """Keep last N turns to prevent context explosion in long sessions."""
        MAX_TURNS = 20
        if not self._agent_session:
            return
        # Skip trim during active generation to avoid concurrent modification
        if self._generation_lock.locked():
            return
        try:
            chat_ctx = self._agent_session.chat_ctx
            if chat_ctx and len(chat_ctx.messages) > MAX_TURNS * 2:
                system_msgs = [m for m in chat_ctx.messages if m.role == "system"]
                recent_msgs = list(chat_ctx.messages[-(MAX_TURNS * 2):])
                # Create new list to avoid in-place mutation
                new_messages = system_msgs + recent_msgs
                chat_ctx.messages = new_messages
                logger.info(f"[trim] Conversation trimmed to {len(new_messages)} messages")
        except Exception as e:
            logger.debug(f"[trim] Could not trim conversation history: {e}")

    async def _drain_pending_responses(self):
        """Process one queued gateway response per heartbeat cycle.

        Only processes ONE item to avoid firing multiple generate_reply calls
        before the previous one completes. The heartbeat calls this every 10s,
        so queued items drain gradually.
        """
        if not self._agent_session or self._pending_gateway_responses.empty():
            return
        # Only process if generation slot is available (don't wait/block)
        if self._generation_lock.locked():
            return
        try:
            item = self._pending_gateway_responses.get_nowait()
            user_input = item.get("user_input", "")
            use_say = item.get("use_say", False)
            if not user_input:
                return
            async with self._generation_lock:
                if use_say:
                    try:
                        await self._agent_session.say(user_input)
                    except Exception:
                        logger.info("[drain_pending] say() not available, falling back to generate_reply")
                        self._agent_session.generate_reply(user_input=f"<gateway>{user_input}</gateway>")
                else:
                    self._agent_session.generate_reply(user_input=user_input)
                logger.info("[drain_pending] Processed 1 queued gateway response")
        except asyncio.QueueEmpty:
            pass
        except Exception as e:
            logger.error(f"[drain_pending] Error processing queued response: {e}")

    async def _update_page_context(self, page: str):
        """Update instructions based on current page."""
        self._current_page = page
        page_section = PAGE_PROMPTS.get(page, PAGE_PROMPTS["camera"])
        base = AGENT_INSTRUCTIONS_CORE
        if hasattr(self, '_catch_up_section'):
            new_instructions = base + "\n\n" + page_section + "\n\n## Context\n" + self._catch_up_section
        else:
            new_instructions = base + "\n\n" + page_section
        await self.update_instructions(new_instructions)
        logger.info(f"[page_context] Updated instructions for page: {page}")

    async def _shutdown(self, reason: str):
        """Perform complete shutdown of agent session and room."""
        logger.warning(f"[shutdown] Initiating shutdown: {reason}")

        # Trigger memory update before shutdown
        if self._agent_session and self.user_identity:
            try:
                logger.info("[shutdown] Prompting agent to update memory before ending session...")
                await asyncio.sleep(1.5)
                self._agent_session.generate_reply(user_input="[SYSTEM: Session ending. If there's anything important from this conversation to remember (user preferences, facts, requests, or information user explicitly asked to remember), call rpc_b2g_update_memory now. Skip information already recorded in your previous calls of rpc_b2g_update_memory. If nothing important to remember, skip this step.]")
                logger.info("[shutdown] Memory update prompt sent")
                # Wait a moment for memory update to be processed
                await asyncio.sleep(2)
            except Exception as e:
                logger.warning(f"[shutdown] Failed to trigger memory update: {e}")

        # Say goodbye to the user (best-effort, single attempt)
        if self._agent_session and self.user_identity:
            try:
                await asyncio.sleep(1)
                self._agent_session.generate_reply(user_input=f"[SYSTEM: Session ending. Say a brief goodbye.]")
                logger.info("[shutdown] Goodbye message sent")
                await asyncio.sleep(3)  # Brief wait for goodbye to be spoken
            except Exception as e:
                logger.warning(f"[shutdown] Failed to say goodbye: {e}")
        
        # Persist conversation timeline (non-dispatch chat messages)
        try:
            await self.persist_conversation_timeline()
        except Exception as e:
            logger.warning(f"[shutdown] Failed to persist conversation timeline: {e}")

        # Trigger session-end memory extraction
        try:
            if self._conversation_timeline and self._vi_user_id:
                # Build summary from conversation timeline
                summary_parts = []
                for entry in self._conversation_timeline[:20]:
                    role = entry.get("type", "unknown")
                    text = entry.get("content", "")[:200]
                    summary_parts.append(f"{role}: {text}")
                summary = "\n".join(summary_parts)

                session_id = self._conversation_session_id or self._current_session_id or ""
                async with aiohttp.ClientSession(headers=self._internal_headers) as http:
                    resp = await http.post(
                        f"{self._api_base}/api/internal/memories/session-end",
                        json={
                            "session_id": session_id,
                            "vi_user_id": self._vi_user_id,
                            "summary": summary[:3000],
                        },
                    )
                    if resp.status == 200:
                        logger.info("[shutdown] Session-end memory extraction triggered")
                    else:
                        body = await resp.text()
                        logger.debug(f"[shutdown] Session-end memory failed ({resp.status}): {body}")
        except Exception as e:
            logger.warning(f"[shutdown] Failed to trigger session-end memory: {e}")

        # Cache Gemini session resumption token for faster next-session connect
        # Path: AgentSession.llm → RealtimeModel._sessions (set) → RealtimeSession.session_resumption_handle
        try:
            if self._agent_session and self._agent_session.llm:
                llm = self._agent_session.llm
                handle = None
                # RealtimeModel stores sessions in _sessions (a set)
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

        try:
            # Close agent session first
            if self._agent_session:
                logger.info("[shutdown] Closing agent session...")
                await self._agent_session.aclose()
                logger.info("[shutdown] Agent session closed")
            
            # Disconnect from room
            if self.room:
                logger.info("[shutdown] Disconnecting from room...")
                await self.room.disconnect()
                logger.info("[shutdown] Room disconnected")
            
            # Shutdown job context if available
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

    # Pattern to detect bare GCS URLs that need signing
    _GCS_URL_RE = re.compile(r'https://storage\.googleapis\.com/[a-z0-9_-]+/[^\s\'"<>]+')

    async def _presign_storage_urls(self, text: str) -> str:
        """Replace bare GCS URLs with signed GET URLs so the gateway agent can access them."""
        gcs_urls = self._GCS_URL_RE.findall(text)
        if not gcs_urls:
            return text

        # Skip URLs that are already signed (contain GCS signature query params)
        gcs_urls = [u for u in gcs_urls if "X-Goog-" not in u]
        if not gcs_urls:
            return text

        try:
            async with aiohttp.ClientSession(headers=self._internal_headers) as http:
                resp = await http.post(
                    f"{self._api_base}/api/internal/storage/presign-get",
                    json={"urls": gcs_urls},
                    timeout=aiohttp.ClientTimeout(total=5),
                )
                if resp.status == 200:
                    data = await resp.json()
                    url_map = data.get("urls", {})
                    for original, signed in url_map.items():
                        if signed != original:
                            text = text.replace(original, signed)
                            logger.info(f"[presign_storage] Replaced GCS URL: {original[:60]}... -> signed")
                else:
                    logger.warning(f"[presign_storage] Failed to sign URLs: status={resp.status}")
        except Exception as e:
            logger.warning(f"[presign_storage] Error signing URLs: {e}")

        return text

    async def publish_session_header(self, intention: str, steps: list = None, full_prompt: str = ""):
        """Publish structured session header to frontend before gateway dispatch."""
        try:
            payload = json.dumps({
                "intention": intention,
                "decomposition": steps or [],
                "full_prompt": full_prompt,
            })
            await self.room.local_participant.publish_data(
                payload.encode(), reliable=True, topic="session_header",
            )
            logger.info(f"[session_header] Published: {intention[:80]}")
        except Exception as e:
            logger.warning(f"[session_header] Failed to publish: {e}")

    async def rpc_b2g_dispatch_message(self, context: RunContext,
                                       text: str, action: str = "dispatch_message",
                                       reply_hint: str = None,
                                       stream_to_frontend: bool = False) -> dict:
        """Send a message to the gateway and get response (chat-based interaction). Gateway processes asynchronously and replies via rpcG2BSendReply."""
        MAX_RETRIES = 2
        BACKOFF_DELAY = 3  # seconds

        # Inject pending photo URLs if the prompt doesn't already contain them
        if self._pending_photo_urls:
            existing_gcs = self._GCS_URL_RE.findall(text)
            missing_urls = [u for u in self._pending_photo_urls if u not in existing_gcs]
            if missing_urls:
                photo_section = (
                    "\n\n[PHOTO CONTEXT — CRITICAL]\n"
                    "The user captured the following photo(s). You MUST download and analyze "
                    "each photo using web_fetch BEFORE generating any content. Incorporate the "
                    "visual details (colors, objects, text, layout, style) into your output.\n"
                    + "\n".join(f"- {url}" for url in missing_urls)
                    + "\n[END PHOTO CONTEXT]\n"
                )
                text = photo_section + text
                logger.info(f"[rpc_b2g_dispatch_message] Injected {len(missing_urls)} pending photo URL(s) into prompt")
            # Clear after injection (one-shot)
            self._pending_photo_urls = []

        # Convert bare GCS URLs to signed GET URLs so gateway can access them
        text = await self._presign_storage_urls(text)

        # D.2: Publish session header before gateway dispatch
        if action == "dispatch_message":
            # Clean intention: strip [USER_DISPATCH] prefix and filter out generic greetings
            clean_intention = text.replace("[USER_DISPATCH]", "").strip()
            # Remove photo context blocks for the header display
            clean_intention = re.sub(r'\[PHOTO CONTEXT[^\]]*\][\s\S]*?\[END PHOTO CONTEXT\]', '', clean_intention).strip()
            greeting_prefixes = ["hello", "hi ", "hi!", "how can i help", "what can i do"]
            if any(clean_intention.lower().startswith(g) for g in greeting_prefixes):
                clean_intention = "Photo Analysis"
            await self.publish_session_header(
                intention=clean_intention[:200],
                full_prompt=text,
            )

        # Build V3 TaskRequest payload for gateway's dispatch_task RPC
        task_id = self._current_session_id or f"dispatch-{int(time.time())}"
        
        # Extract photo URLs from the text
        photo_urls = self._GCS_URL_RE.findall(text)
        
        # Build the prompt: combine reply_hint with text if provided
        prompt = text
        if reply_hint:
            prompt = f"{text}\n\n[REPLY FORMAT INSTRUCTIONS]\n{reply_hint}"
        
        rpc_payload = {
            "taskId": task_id,
            "sessionId": self.room_name,
            "userId": self._vi_user_id,
            "prompt": prompt,
            "context": {
                "photoUrls": photo_urls,
                "visualObservation": "",
                "userMemory": "",
                "conversationSummary": "",
                "viUserId": self._vi_user_id,
            },
            "priority": "thorough",
        }
        # Executor hint: env VI_EXECUTOR_HINT overrides, empty = let gateway priority routing decide
        executor_hint = os.getenv("VI_EXECUTOR_HINT", "")
        if executor_hint:
            rpc_payload["executorHint"] = executor_hint

        last_error = None

        # Ensure gateway is available — scan, then invite if needed
        if not self.gateway_participant:
            self._scan_for_gateway()
        if not self.gateway_participant:
            logger.warning("[rpc_b2g_dispatch_message] Gateway not found, inviting...")
            await invite_gateway_to_room(self.room_name, force=True)
            for _wait in range(5):
                await asyncio.sleep(1)
                self._scan_for_gateway()
                if self.gateway_participant:
                    break

        for attempt in range(MAX_RETRIES):
            if not self.gateway_participant:
                self._scan_for_gateway()
            if not self.gateway_participant:
                logger.warning(f"[rpc_b2g_dispatch_message] Gateway not connected (attempt {attempt+1}/{MAX_RETRIES})")
                last_error = "Gateway not connected"
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(BACKOFF_DELAY)
                continue

            try:
                logger.info(f"[rpc_b2g_dispatch_message] Sending to gateway (attempt {attempt+1}/{MAX_RETRIES}): {text[:100]}")

                response = await self.room.local_participant.perform_rpc(
                    destination_identity=self.gateway_participant.identity,
                    method="dispatch_task",
                    payload=json.dumps(rpc_payload),
                    response_timeout=B2G_RPC_TIMEOUT_SECONDS,
                )

                result = json.loads(response) if response else {"ok": False, "error": "No response"}

                # Gateway now returns immediately with acknowledgment
                if result.get("ok"):
                    status = result.get("status", "unknown")
                    logger.info(f"[rpc_b2g_dispatch_message] Request accepted by gateway: status={status}")
                    asyncio.create_task(self.update_session_status("progress"))
                    asyncio.create_task(publish_info_bar(self.room, "working", "Processing..."))

                    # Explicitly prompt agent to speak about progress after dispatch
                    async def _speak_progress():
                        await asyncio.sleep(0.5)  # Brief delay to let tool response process
                        if self._agent_session and not self._generation_lock.locked():
                            async with self._generation_lock:
                                self._agent_session.generate_reply(
                                    user_input="[SYSTEM: Gateway is now processing your request. Briefly tell the user you're working on it and they'll see results shortly. Keep it natural and concise - one sentence.]"
                                )
                    asyncio.create_task(_speak_progress())

                    return {
                        "ok": True,
                        "status": status,
                        "message": "Request accepted, gateway is processing. Reply will arrive shortly."
                    }
                else:
                    # Gateway explicitly rejected — don't retry
                    error = result.get("error", "Unknown error")
                    logger.error(f"[rpc_b2g_dispatch_message] Request rejected by gateway: {error}")
                    return {"ok": False, "error": error}

            except asyncio.TimeoutError:
                last_error = f"Gateway timeout after {B2G_RPC_TIMEOUT_SECONDS}s"
                logger.warning(f"[rpc_b2g_dispatch_message] Timeout (attempt {attempt+1}/{MAX_RETRIES})")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(BACKOFF_DELAY)
            except Exception as e:
                last_error = str(e)
                logger.warning(f"[rpc_b2g_dispatch_message] Failed (attempt {attempt+1}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(BACKOFF_DELAY)

        # All retries exhausted
        logger.error(f"[rpc_b2g_dispatch_message] All {MAX_RETRIES} attempts failed: {last_error}")
        asyncio.create_task(self.update_session_status("error", error=f"Gateway failed after {MAX_RETRIES} retries"))
        asyncio.create_task(publish_info_bar(self.room, "ready", "Request failed, please retry"))
        try:
            error_msg = f"Gateway request failed after {MAX_RETRIES} retries. Please try again."
            # Publish on task_events topic (legacy)
            await self.room.local_participant.publish_data(
                json.dumps({"type": "task_error", "error": error_msg}).encode(),
                reliable=True,
                topic="task_events",
            )
            # Also publish on vi-gateway topic so frontend gatewayBlocks shows the error
            task_id = self._current_session_id or f"dispatch-{int(time.time())}"
            await self.room.local_participant.publish_data(
                json.dumps({
                    "type": "error",
                    "taskId": task_id,
                    "message": error_msg,
                    "recoverable": False,
                }).encode(),
                reliable=True,
                topic="vi-gateway",
            )
        except Exception as pub_err:
            logger.warning(f"[rpc_b2g_dispatch_message] Failed to publish error event: {pub_err}")
        return {"ok": False, "error": last_error}

    async def rpc_b2f_call(self, method: str, payload: dict = None) -> dict:
        """Send RPC to user participant for frontend control."""
        if not self.user_identity:
            logger.warning(f"[{method}] User not connected, cannot call")
            return {"success": False, "error": "User not connected"}

        try:
            logger.info(f"[{method}] Sending RPC to user: payload={payload}")
            response = await self.room.local_participant.perform_rpc(
                destination_identity=self.user_identity,
                method=method,
                payload=json.dumps(payload or {}),
            )
            result = json.loads(response) if response else {"success": True}
            logger.info(f"[{method}] User RPC response: {result}")
            return result
        except Exception as e:
            logger.error(f"[{method}] User RPC failed: {e}")
            return {"success": False, "error": str(e)}

    # Frontend Control Tools (RPC to user participant)
    # Naming: prompt+agent use snake_case with f2b/b2f/b2g/g2b tags; frontend handlers use camelCase with F2B/B2F

    @function_tool
    async def rpc_b2f_take_photo(self, context: RunContext):
        """Captures photo from camera, adds to chat input (user must then Send)."""
        logger.info("[rpc_b2f_take_photo] Tool invoked")
        result = await self.rpc_b2f_call("rpcB2FTakePhoto")
        return {"status": "captured" if result.get("success") else "failed"}

    @function_tool
    async def rpc_b2f_capture_and_upload(self, context: RunContext):
        """Captures a photo from the user's camera and uploads it to S3 automatically. Returns the S3 URL of the captured image. Use this when you need a photo to include in a gateway task (website creation, research, etc.) — no user action needed."""
        logger.info("[rpc_b2f_capture_and_upload] Tool invoked")
        result = await self.rpc_b2f_call("rpcB2FCaptureAndUpload")
        if result.get("success") and result.get("url"):
            url = result["url"]
            logger.info(f"[rpc_b2f_capture_and_upload] Photo uploaded: {url}")
            return {"status": "uploaded", "url": url}
        error = result.get("error", "Unknown error")
        logger.error(f"[rpc_b2f_capture_and_upload] Failed: {error}")
        return {"status": "failed", "error": error}

    @function_tool
    async def rpc_b2f_set_chat_text(self, context: RunContext, text: str):
        """Writes text into chat input box."""
        logger.info(f"[rpc_b2f_set_chat_text] Tool invoked text={text[:50]}")
        result = await self.rpc_b2f_call("rpcB2FSetChatText", {"text": text})
        return {"status": "set" if result.get("success") else "failed"}

    @function_tool
    async def rpc_b2f_get_chat_content(self, context: RunContext):
        """Reads current text and images from chat input box."""
        logger.info("[rpc_b2f_get_chat_content] Tool invoked")
        result = await self.rpc_b2f_call("rpcB2FGetChatContent")
        return result if result.get("text") is not None else {}

    @function_tool
    async def rpc_b2f_show_action_card(self, context: RunContext, title: str, options: list[str]):
        """Shows clickable option buttons (max 4 options)."""
        logger.info(f"[rpc_b2f_show_action_card] Tool invoked title={title} options={len(options)}")
        result = await self.rpc_b2f_call("rpcB2FShowActionCard", {"title": title, "options": options[:4]})
        return {"status": "shown" if result.get("success") else "failed"}

    @function_tool
    async def rpc_b2f_show_result(self, context: RunContext, result_type: str, content: str):
        """Displays rich content visually to user. Types: html, json, url, markdown, text, data. Call BEFORE speaking your response when you have rich content."""
        logger.info(f"[rpc_b2f_show_result] Tool invoked type={result_type} len={len(content)}")
        result = await self.rpc_b2f_call("rpcB2FShowResult", {"result_type": result_type, "content": content})
        return {"status": "shown" if result.get("success") else "failed"}

    @function_tool
    async def update_info_bar(self, context: RunContext, status: str, message: str):
        """Updates the info bar to show current agent status. Call this to inform the user what you're doing before speaking. Use status to categorize the action (e.g., 'thinking', 'searching', 'creating', 'analyzing', 'ready', 'error') and message to provide details."""
        asyncio.create_task(publish_info_bar(self.room, status, message))
        return {"status": "updated"}

    @function_tool
    async def send_conversation_summary(self, context: RunContext, summary: str):
        """Send a conversation summary to the frontend before dispatching to gateway. Include what the user showed you, what they said/asked, and key context that informed your decision."""
        asyncio.create_task(publish_conversation_summary(self.room, summary))
        return {"status": "sent"}

    @function_tool
    async def send_intention_prompt(self, context: RunContext, intention: str):
        """Send the intention prompt to the frontend showing what will be sent to gateway. This is the exact text/instruction being sent to the AI."""
        asyncio.create_task(publish_intention_prompt(self.room, intention))
        return {"status": "sent"}

    @function_tool
    async def suggest_action(self, context: RunContext, icon: str, label: str):
        """Update the shutter button icon and label based on current scene context. Call proactively when scene/context changes. Icons: camera, scan, search, shop, identify, translate, receipt, create."""
        payload = f"<action_suggestion action=\"{escape_xml(icon)}\" icon=\"{escape_xml(icon)}\" label=\"{escape_xml(label)}\">{escape_xml(label)}</action_suggestion>"
        logger.info(f"[suggest_action] {payload}")
        asyncio.create_task(
            self.room.local_participant.publish_data(
                payload.encode("utf-8"),
                reliable=True,
                topic="agent_action",
            )
        )
        return {"status": "updated"}

    @function_tool
    async def rpc_b2f_navigate_to(self, context: RunContext, page: str):
        """Navigate the user to a different page. Pages: 'camera', 'session', 'home'. Use when context suggests user should see a different view."""
        logger.info(f"[rpc_b2f_navigate_to] Navigating to: {page}")
        result = await self.rpc_b2f_call("rpcB2FNavigateTo", {"page": page})
        if result.get("success"):
            self._current_page = page
        return {"status": "navigated" if result.get("success") else "failed", "page": page}

    @function_tool
    async def rpc_b2f_zoom(self, context: RunContext, level: float):
        """Adjust camera zoom level. level: 1.0 = normal, 2.0 = 2x zoom, etc. Use to focus on details."""
        logger.info(f"[rpc_b2f_zoom] Setting zoom: {level}")
        result = await self.rpc_b2f_call("rpcB2FZoom", {"level": level})
        return {"status": "zoomed" if result.get("success") else "failed", "level": level}

    @function_tool
    async def rpc_b2f_switch_camera(self, context: RunContext, camera: str):
        """Switch between front and back camera. camera: 'front' or 'back'."""
        logger.info(f"[rpc_b2f_switch_camera] Switching to: {camera}")
        result = await self.rpc_b2f_call("rpcB2FSwitchCamera", {"camera": camera})
        return {"status": "switched" if result.get("success") else "failed", "camera": camera}

    @function_tool
    async def rpc_b2g_deep_research(self, context: RunContext, research_query: str):
        """Conducts comprehensive research via gateway on a topic. Provide a clear research question or topic and the gateway will gather information from multiple sources, analyze, and synthesize findings. Gateway processes asynchronously and replies when complete."""
        logger.info(f"[rpc_b2g_deep_research] Delegating to rpc_b2g_dispatch_message: {research_query[:100]}")
        return await self.rpc_b2g_dispatch_message(context, research_query)

    HTML_REPLY_HINT = (
        "Output ONLY the raw HTML document. No explanations, no markdown, no code fences, no preamble, no trailing text. "
        "Start with <!DOCTYPE html> and end with </html>. The output will be rendered directly in a browser iframe. "
        "Include all CSS inline in a <style> tag and all JavaScript in a <script> tag. "
        "Make it a complete, self-contained, beautiful, responsive HTML document. "
        "Do NOT use any tools to write files. Do NOT create workspace files. Output the HTML directly as your response text. "
        "IMPORTANT: If photo URLs are provided in the prompt, you MUST first use web_fetch to download and analyze them, "
        "then incorporate the visual details (colors, objects, text, style, mood) from the photos into the website design. "
        "The website must visually reflect what was captured in the user's photos."
    )

    @function_tool
    async def rpc_b2g_create_websites(self, context: RunContext, website_prompt: str):
        """Creates comprehensive websites via gateway. The HTML will be streamed directly to the user's browser for live progressive rendering. Provide a clear description of the website requirements."""
        logger.info(f"[rpc_b2g_create_websites] Delegating with HTML streaming: {website_prompt[:100]}")
        return await self.rpc_b2g_dispatch_message(
            context, website_prompt,
            reply_hint=self.HTML_REPLY_HINT,
            stream_to_frontend=True,
        )

    @function_tool
    async def rpc_b2g_create_docs(self, context: RunContext, doc_prompt: str):
        """Creates comprehensive documents via gateway and returns links. Provide a clear description of the document requirements (reports, articles, guides, etc.) and the gateway will plan and implement the details. Gateway processes asynchronously and replies when complete."""
        logger.info(f"[rpc_b2g_create_docs] Delegating to rpc_b2g_dispatch_message: {doc_prompt[:100]}")
        return await self.rpc_b2g_dispatch_message(context, doc_prompt)

    @function_tool
    async def rpc_b2g_create_slides(self, context: RunContext, slides_prompt: str):
        """Creates comprehensive presentation slides via gateway and returns links. Provide a clear description of the presentation requirements (topic, key points, audience) and the gateway will plan and implement the details. Gateway processes asynchronously and replies when complete."""
        logger.info(f"[rpc_b2g_create_slides] Delegating to rpc_b2g_dispatch_message: {slides_prompt[:100]}")
        return await self.rpc_b2g_dispatch_message(context, slides_prompt)

    @function_tool
    async def rpc_b2g_create_sheets(self, context: RunContext, sheets_prompt: str):
        """Creates comprehensive spreadsheets via gateway and returns links. Provide a clear description of the spreadsheet requirements (data structure, calculations, visualizations) and the gateway will plan and implement the details. Gateway processes asynchronously and replies when complete."""
        logger.info(f"[rpc_b2g_create_sheets] Delegating to rpc_b2g_dispatch_message: {sheets_prompt[:100]}")
        return await self.rpc_b2g_dispatch_message(context, sheets_prompt)

    @function_tool
    async def rpc_b2g_query_task(self, context: RunContext, task_query: str):
        """Queries gateway for task status, progress, results, or errors. Use this to check on background tasks like website creation, research, or document generation. Provide a clear query about what you want to know (e.g., 'What is the status of the website creation?', 'Show me the latest progress on the research task'). Gateway processes asynchronously and replies with current status."""
        logger.info(f"[rpc_b2g_query_task] Delegating to rpc_b2g_dispatch_message: {task_query[:100]}")
        return await self.rpc_b2g_dispatch_message(context, task_query)

    @function_tool
    async def rpc_b2g_update_memory(self, context: RunContext, memory_update: str):
        """Updates important memory in the gateway (agent name, user name, profile, facts, requests, preferences). Use this to record information the user explicitly wants remembered OR information that's critical for future conversations. MUST be called when user says 'remember this', 'you must know', etc. This is async and non-blocking - just records the information without waiting for confirmation."""
        logger.info(f"[rpc_b2g_update_memory] Saving memory directly: {memory_update[:100]}")
        # Write directly to memory API instead of routing through gateway
        try:
            async with aiohttp.ClientSession(headers=self._internal_headers) as http:
                resp = await http.post(
                    f"{self._api_base}/api/internal/memories",
                    json={
                        "vi_user_id": self._vi_user_id,
                        "content": memory_update,
                        "type": "long_term",
                        "source": "agent",
                    },
                )
                if resp.status == 200:
                    logger.info(f"[memory] Saved memory update for user {self._vi_user_id}")
                    return {"ok": True, "message": "Memory saved successfully"}
                else:
                    body = await resp.text()
                    logger.warning(f"[memory] Memory save failed ({resp.status}): {body}")
                    return {"ok": False, "error": f"Memory save failed: {resp.status}"}
        except Exception as e:
            logger.warning(f"[memory] Error saving memory: {e}")
            return {"ok": False, "error": str(e)}
        

def register_agent_rpc_methods(room: rtc.Room, assistant: Assistant):
    """Register RPC methods for agent to receive from gateway."""

    async def handle_g2b_send_reply(request: rtc.RpcInvocationData):
        """Receive async reply from gateway and process it."""
        data = json.loads(request.payload) if request.payload else {}
        text = data.get("text", "")
        error = data.get("error")
        is_html_stream = data.get("isHtmlStream", False)

        log_info(f"[rpc_g2b_send_reply] Received reply from gateway: text={len(text)} chars, error={error}, isHtmlStream={is_html_stream}", "agent")

        # Update info_bar when gateway response arrives
        try:
            if error:
                await publish_info_bar(assistant.room, "ready", "Task failed")
            else:
                await publish_info_bar(assistant.room, "ready", "Complete")
        except Exception as e:
            logger.warning(f"[rpc_g2b_send_reply] Failed to update info bar: {e}")

        # For HTML stream responses, the HTML was already streamed to the frontend
        # via data channel. Agent just needs to speak a summary, not process the HTML.
        if is_html_stream:
            logger.info("[rpc_g2b_send_reply] HTML stream response — HTML already delivered to frontend via data channel")

            # If this was an action card (not a final deliverable), skip "website ready" speech
            if assistant._awaiting_action_card:
                assistant._awaiting_action_card = False
                logger.info("[rpc_g2b_send_reply] Action card delivered — suppressing 'website ready' speech")
                await publish_transcript(assistant.room, "gateway", "Action card displayed.")
                return json.dumps({"ok": True, "received": True})

            # Publish a brief transcript (not raw HTML)
            await publish_transcript(assistant.room, "gateway", "✅ Website HTML generated and streamed to display.")
            assistant.record_timeline_entry("gateway", "✅ Website HTML generated and streamed to display.")

            # Update task status to complete — include full HTML for DB persistence
            full_html = data.get("html", "") or text or ""
            asyncio.create_task(assistant.update_session_status(
                "complete",
                result={"type": "html", "html": full_html, "summary": text or "", "chars": len(full_html)},
            ))

            # Tell agent to speak a brief confirmation
            async def speak_html_ready():
                if not assistant._agent_session:
                    return
                html_ready_input = "<gateway>[HTML_STREAMED] The website HTML has been generated and is now displaying on the user's screen. Briefly tell the user their website is ready and they can interact with it.</gateway>"
                try:
                    await asyncio.wait_for(assistant._generation_lock.acquire(), timeout=30.0)
                    try:
                        assistant._agent_session.generate_reply(user_input=html_ready_input)
                    finally:
                        assistant._generation_lock.release()
                except asyncio.TimeoutError:
                    logger.warning("[speak_html_ready] Timed out waiting 30s for generation slot, queuing response")
                    await assistant._pending_gateway_responses.put({"user_input": html_ready_input})
                except Exception as e:
                    logger.error(f"[speak_html_ready] Failed to generate HTML ready reply: {e}")

            asyncio.create_task(speak_html_ready())
            return json.dumps({"ok": True, "received": True})

        # Non-HTML response: original flow
        # Publish gateway response to frontend transcript
        if text:
            await publish_transcript(assistant.room, "gateway", text)
            assistant.record_timeline_entry("gateway", text)
            logger.info(f"[rpc_g2b_send_reply] Published gateway response to frontend")

        # Check if gateway response contains an actual workspace URL
        has_workspace_url = "<workspace>" in text if text else False

        # Update task status for non-HTML responses
        if error:
            asyncio.create_task(assistant.update_session_status("error", error=str(error)))
        elif text:
            asyncio.create_task(assistant.update_session_status(
                "complete",
                result={"type": "text", "summary": text[:200]},
            ))

        # Process with agent session asynchronously
        async def process_gateway_response():
            if not assistant._agent_session:
                logger.warning("[gateway_response] Agent session not ready, cannot process response")
                return

            # Build the user_input based on response type
            user_input = None
            use_say = False
            if error:
                logger.error(f"[gateway_response] Gateway returned error: {error}")
                user_input = f"Gateway error: {error}. Tell user briefly."
            elif text and len(text) > 500:
                logger.info(f"[gateway_response] Long reply ({len(text)} chars), requesting one-sentence summary")
                user_input = (
                    f"<gateway_summary>Task complete. Result ({len(text)} chars) "
                    f"displayed on screen. Key excerpt: {text[:250]}... "
                    f"Give ONE-SENTENCE spoken summary.</gateway_summary>"
                )
            elif text and len(text) <= 100:
                logger.info(f"[gateway_response] Short reply ({len(text)} chars), attempting direct TTS")
                user_input = text
                use_say = True
            elif text:
                logger.info(f"[gateway_response] Medium reply ({len(text)} chars), normal processing")
                user_input = f"<gateway>{text}</gateway>"
            else:
                logger.warning("[gateway_response] No text or error in gateway response")
                return

            try:
                await asyncio.wait_for(assistant._generation_lock.acquire(), timeout=30.0)
                try:
                    if use_say:
                        try:
                            await assistant._agent_session.say(user_input)
                        except Exception:
                            logger.info("[gateway_response] say() not available, falling back to generate_reply")
                            assistant._agent_session.generate_reply(
                                user_input=f"<gateway>{user_input}</gateway>"
                            )
                    else:
                        assistant._agent_session.generate_reply(user_input=user_input)
                finally:
                    assistant._generation_lock.release()
            except asyncio.TimeoutError:
                logger.warning("[gateway_response] Timed out waiting 30s for generation slot, queuing response")
                await assistant._pending_gateway_responses.put({"user_input": user_input, "use_say": use_say})
            except Exception as e:
                logger.error(f"[gateway_response] Failed to process response: {e}")

        # Spawn processing as background task
        asyncio.create_task(process_gateway_response())

        return json.dumps({"ok": True, "received": True})

    async def handle_f2b_send_message(request: rtc.RpcInvocationData):
        """Receive message from frontend user and process with LLM."""
        data = json.loads(request.payload) if request.payload else {}

        # D.1: Handle page_context action — frontend tells agent which page user is on
        if data.get("action") == "page_context":
            page = data.get("page", "camera")
            assistant._current_page = page
            assistant._page_metadata = data.get("metadata", {})
            if hasattr(assistant, '_update_page_context'):
                await assistant._update_page_context(page)
            logger.info(f"[page_context] User is now on: {page}")
            return json.dumps({"ok": True})

        text = data.get("text", "")
        images = data.get("images", [])
        log_info(f"[rpc_f2b_send_message] Received message from user: {text[:100]}", "user")

        # ── ACTION CARD FLOW (gateway-generated HTML cards) ──
        # Simple flow:
        #   [USER_DISPATCH] → gateway generates action card HTML → user clicks button →
        #   [ActionCard] message sent to LiveKit → LiveKit calls gateway to act on it
        is_dispatch = text.strip().startswith("[USER_DISPATCH]")
        is_confirmed = text.strip().startswith("[ActionCard]")

        if is_confirmed:
            # User clicked a button in a gateway-generated action card.
            # Format: "[ActionCard] {title}, user click on {option} (options: ...)"
            # No confirmation step — dispatch directly to gateway.
            confirmed_text = text.strip()
            log_info(f"[action_card] {confirmed_text}", "user")

            # Parse the clicked option
            click_match = re.search(r'user click on (.+?)(?:\s*\(options?:|\s*$)', confirmed_text)
            clicked_option = click_match.group(1).strip() if click_match else ""
            dispatch_context = assistant._pending_dispatch_text or ""

            async def _action_dispatch():
                try:
                    logger.info(f"[action_card] User selected '{clicked_option}' — dispatching to gateway")
                    await assistant.rpc_b2g_dispatch_message(
                        context=None,
                        text=(
                            f"The user selected: \"{clicked_option}\"\n\n"
                            f"Original context: {dispatch_context}"
                        ),
                        reply_hint=(
                            f"The user chose \"{clicked_option}\" from the action card. "
                            "Generate a rich, informative HTML page about this topic. "
                            "Use clean semantic HTML with inline styles. "
                            "Start your output with an HTML tag like <div> or <h2> — do NOT start with JSON or markdown."
                        ),
                        stream_to_frontend=True,
                    )
                    logger.info("[action_card] Gateway dispatch complete")
                except Exception as e:
                    logger.error(f"[action_card] Gateway dispatch failed: {e}", exc_info=True)

            asyncio.create_task(_action_dispatch())

            try:
                if assistant._agent_session:
                    assistant._agent_session.generate_reply(
                        user_input=(
                            f"[SYSTEM] The user selected: '{clicked_option}'. "
                            f"Tell the user briefly you're working on it. "
                            f"Do NOT call any tools. Keep it under 15 words."
                        )
                    )
            except Exception as e:
                logger.warning(f"[action_card] Failed to prompt after selection: {e}")

            return json.dumps({"ok": True, "status": "dispatched"})

        # Record all non-action user text messages to conversation timeline
        if text and not is_dispatch and not is_confirmed:
            assistant.record_timeline_entry("user", text)
            asyncio.create_task(assistant.ensure_conversation_session())

        # Persist task to DB if this is a dispatch message
        if is_dispatch:
            await assistant.persist_session(text)

            # Extract and store GCS photo URLs for reference
            photo_urls = assistant._GCS_URL_RE.findall(text)
            if photo_urls:
                assistant._pending_photo_urls = photo_urls
                logger.info(f"[rpc_f2b_send_message] Stored {len(photo_urls)} photo URL(s) for gateway dispatch")

            # ── ACTION CARD INTENT DISCOVERY (via gateway HTML) ──
            # Ask gateway to generate an action card with contextual options.
            # The card is streamed to the user as normal HTML (CanvasCard).
            # When user clicks a button, frontend sends "[ActionCard] ..." to LiveKit.
            assistant._pending_dispatch_text = text
            assistant._awaiting_action_card = True

            async def _request_intent_card():
                try:
                    logger.info("[action_card] Requesting intent discovery card from gateway")
                    await assistant.rpc_b2g_dispatch_message(
                        context=None,
                        text=text,
                        reply_hint=ACTION_CARD_INTENT_HINT,
                        stream_to_frontend=True,
                    )
                    logger.info("[action_card] Intent discovery card dispatched to gateway")
                except Exception as e:
                    logger.error(f"[action_card] Failed to request intent card: {e}", exc_info=True)
                    assistant._awaiting_action_card = False
                    # Fallback: dispatch directly without action card
                    assistant._pending_dispatch_text = None
                    try:
                        await assistant.rpc_b2g_dispatch_message(
                            context=None, text=text, stream_to_frontend=True,
                        )
                    except Exception as de:
                        logger.error(f"[action_card] Fallback dispatch failed: {de}", exc_info=True)

            asyncio.create_task(_request_intent_card())

            # Tell Gemini to speak briefly about what it sees
            try:
                if assistant._agent_session:
                    assistant._agent_session.generate_reply(
                        user_input=(
                            "[SYSTEM] The user captured photos and pressed Done. "
                            "Say 1-2 sentences about what you see. "
                            "Options are being generated — do NOT call any tools."
                        )
                    )
                    logger.info("[action_card] Brief observation prompt sent to Gemini")
            except Exception as e:
                logger.warning(f"[action_card] Failed to prompt Gemini for observation: {e}")

            return json.dumps({"ok": True, "status": "intent_discovery"})

        try:
            if assistant._agent_session:
                log_info("[rpc_f2b_send_message] Processing message with generate_reply", "agent")
                assistant._agent_session.generate_reply(user_input=text)
                log_info("[rpc_f2b_send_message] Message queued for processing", "agent")
                return json.dumps({"ok": True, "status": "processing"})
            logger.warning("[rpc_f2b_send_message] Agent session not ready")
            return json.dumps({"ok": False, "error": "Agent session not ready"})
        except Exception as e:
            logger.error(f"[rpc_f2b_send_message] Failed to process message: {e}")
            return json.dumps({"ok": False, "error": str(e)})

    room.local_participant.register_rpc_method("rpcG2BSendReply", handle_g2b_send_reply)
    room.local_participant.register_rpc_method("rpcF2BSendMessage", handle_f2b_send_message)
    log_info("[rpc_g2b_send_reply] Agent RPC methods registered", "agent")


server = AgentServer()


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
    # Guard: block ALL event processing until duplicate agent check passes.
    # This prevents the 10s window where two agents both process events.
    duplicate_check_passed = False

    # === INSTANT GREETING — reads cached context from Redis, no gateway wait ===
    async def _fire_instant_greeting():
        """Read cached context from Redis + memory API and fire greeting immediately.

        Key optimization: we do NOT call update_instructions here because that
        reconfigures the Gemini realtime session (slow). Instead we embed the
        cached context directly in the generate_reply prompt. The full
        update_instructions happens later in the background catch-up path.
        """
        if assistant._greeting_sent or session is None:
            return
        try:
            cached = await _get_cached_context(assistant._vi_user_id)

            # Fetch persistent memory context from API
            memory_context = ""
            try:
                async with aiohttp.ClientSession(headers=assistant._internal_headers) as http:
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

            # Combine cached Redis context with persistent memory
            combined_context = ""
            if cached:
                combined_context = cached[:1500]
            if memory_context:
                if combined_context:
                    combined_context += f"\n\n## User Memory\n{memory_context[:1000]}"
                else:
                    combined_context = memory_context[:1500]

            if combined_context:
                # Store for later use by catch-up, but DON'T call update_instructions yet
                assistant._catch_up_section = combined_context
                # Ultra-short prompt = fastest Gemini inference
                # CRITICAL: "Do not call any tools" prevents Gemini from speaking info_bar
                # metadata aloud. "under 10 words" caps greeting length to reduce audio streaming time.
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

        if participant.identity.startswith("gateway-"):
            assistant.set_gateway_participant(participant)
            log_info(f"Gateway participant detected: {participant.identity}", participant.identity)

            # Mark catch-up done (V3 uses cached Redis context)
            if not catch_up_done and user_state["identity"] and session is not None:
                catch_up_done = True
                assistant.catch_up_done = True
                logger.info("[init] Gateway ready, catch-up marked done (V3 cached context)")

        if participant.identity.startswith("user-"):
            user_state["identity"] = participant.identity
            assistant.set_user_identity(participant.identity)

            if session is not None:
                try:
                    session.room_io.set_participant(participant.identity)
                    logger.info(f"[session] Linked participant set to {participant.identity}")
                except Exception as exc:
                    logger.warning(f"[session] Failed to set linked participant: {exc}")

            # Fire instant greeting as soon as user + session are ready (no gateway wait)
            if session is not None and not assistant._greeting_sent:
                asyncio.create_task(_fire_instant_greeting())

            # Mark catch-up done (V3 uses cached Redis context)
            if not catch_up_done and assistant.gateway_participant and session is not None:
                catch_up_done = True
                assistant.catch_up_done = True
                logger.info("[init] User ready, catch-up marked done (V3 cached context)")

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        if not duplicate_check_passed:
            return
        log_info(f"Participant disconnected: {participant.identity}", participant.identity)
        
        # Clear gateway reference if gateway disconnects
        if participant.identity.startswith("gateway-"):
            logger.warning(f"[disconnect] Gateway participant disconnected: {participant.identity}")
            assistant.gateway_participant = None

        # Trigger full shutdown if user disconnects
        if participant.identity.startswith("user-"):
            logger.info(f"[disconnect] User disconnected, triggering shutdown...")
            assistant.should_stop_heartbeat = True
            # Trigger shutdown with memory update and goodbye
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
        if participant.identity.startswith("gateway-"):
            assistant.set_gateway_participant(participant)
            logger.info(f"Gateway participant already in room: {participant.identity}")
            continue
        if participant.identity.startswith("user-"):
            user_state["identity"] = participant.identity
            assistant.set_user_identity(participant.identity)

    logger.info("Connecting to LiveKit room...")
    await ctx.connect()
    logger.info("Connected to room, registering RPC methods...")

    # Duplicate agent guard: if another agent is already in the room, wait briefly
    # for it to leave (common during docker restarts), then disconnect if still present.
    my_identity = ctx.room.local_participant.identity
    other_agent = None
    for participant in ctx.room.remote_participants.values():
        if participant.identity.startswith("agent-") and participant.identity != my_identity:
            other_agent = participant.identity
            break

    if other_agent:
        logger.warning(
            f"[init] Another agent in room ({other_agent}), "
            f"waiting up to 10s for it to leave..."
        )
        for _wait in range(10):
            await asyncio.sleep(1)
            # Recheck: has the old agent left yet?
            still_present = any(
                p.identity == other_agent
                for p in ctx.room.remote_participants.values()
            )
            if not still_present:
                logger.info(f"[init] Old agent ({other_agent}) left, proceeding normally")
                break
        else:
            # Old agent still present after 10s — yield
            logger.warning(
                f"[init] Old agent ({other_agent}) still in room after 10s, "
                f"shutting down duplicate job {ctx.room.name}"
            )
            await ctx.room.disconnect()
            return

    # Duplicate check passed — enable event processing
    duplicate_check_passed = True
    logger.info("[init] Duplicate check passed, enabling event processing")

    register_agent_rpc_methods(ctx.room, assistant)

    # Re-check for existing participants after connecting (they won't fire participant_connected)
    for participant in ctx.room.remote_participants.values():
        if participant.identity.startswith("gateway-") and not assistant.gateway_participant:
            assistant.set_gateway_participant(participant)
            logger.info(f"[init] Gateway already in room (post-connect): {participant.identity}")
        if participant.identity.startswith("user-") and not user_state["identity"]:
            user_state["identity"] = participant.identity
            assistant.set_user_identity(participant.identity)
            logger.info(f"[init] User already in room (post-connect): {participant.identity}")

    # Invite gateway to join this room (if not already present)
    if not assistant.gateway_participant and GATEWAY_URL:
        logger.info(f"[init] Inviting gateway to join room {ctx.room.name}...")
        asyncio.create_task(invite_gateway_to_room(ctx.room.name))

    logger.info("Creating AgentSession...")
    # Fetch cached Gemini session resumption token for faster reconnect
    resumption_token = await _get_resumption_token(assistant._vi_user_id)
    if resumption_token:
        logger.info(f"[init] Found Gemini resumption token, attempting session resume")
    try:
        session = create_session(ctx, resumption_handle=resumption_token)
    except TypeError:
        # create_session doesn't accept resumption_handle (e.g., agent_llm.py)
        session = create_session(ctx)
    assistant._agent_session = session
    assistant._job_context = ctx

    @ctx.room.on("data_received")
    def on_data_received(dp: rtc.DataPacket):
        # We only care about user dispatch messages (topic is usually empty for standard sendMessage)
        if dp.topic == "" or dp.topic is None:
            try:
                text = dp.data.decode("utf-8")
                if text.strip().startswith("[USER_DISPATCH]"):
                    asyncio.create_task(assistant.persist_session(text))
            except Exception as e:
                logger.warning(f"[data_received] Failed to process data packet: {e}")


    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event):
        # Update last talk time
        assistant.last_talk_time = time.time()
        
        if not event.is_final:
            return
        identity = user_state["identity"] or "user"
        log_info(f"[session] User speech transcribed: {event.transcript[:100]}", identity)
        if identity:
            asyncio.create_task(publish_transcript(ctx.room, "user", event.transcript))
            assistant.record_timeline_entry("user", event.transcript)

    @session.on("agent_speech_committed")
    def on_agent_speech_committed(event):
        # Update when agent STARTS speaking (not just when finished)
        assistant.last_talk_time = time.time()
        assistant.last_agent_time = time.time()
        log_info(f"[session] Agent started speaking", user_state["identity"] or "agent")

    # Deduplication tracking for conversation items
    last_processed_message = {"content": None, "timestamp": 0}
    
    @session.on("conversation_item_added")
    def on_conversation_item_added(event):
        # Only process agent messages
        if event.item.role != "assistant":
            return
        
        # Update last talk time for agent (when message is complete)
        assistant.last_talk_time = time.time()
        assistant.last_agent_time = time.time()
        
        identity = user_state["identity"]
        message = event.item.text_content or ""
        if identity and message:
            # Deduplicate: skip if we've seen a similar message within the last 10 seconds
            current_time = time.time()
            last_msg = last_processed_message["content"]
            time_since_last = current_time - last_processed_message["timestamp"]
            
            # Check for duplicates: exact match OR one message is a prefix of the other
            is_duplicate = False
            if last_msg and time_since_last < 10:
                if message == last_msg:
                    is_duplicate = True
                elif message.startswith(last_msg) or last_msg.startswith(message):
                    # One is a prefix of the other (handles emoji additions or incremental updates)
                    is_duplicate = True
            
            if is_duplicate:
                log_info(f"[session] Skipping duplicate agent speech (seen {time_since_last:.1f}s ago)", identity)
                # Update to the longer version for next comparison
                if len(message) > len(last_msg):
                    last_processed_message["content"] = message
                return
            
            # Update deduplication tracker
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
    
    # Get room options from assistant (handles video_input configuration)
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

    # If user is already connected (joined before session.start), fire instant greeting now
    if user_state["identity"]:
        await _fire_instant_greeting()

    # Mark catch-up done if gateway already connected (V3 uses cached Redis context)
    if not catch_up_done and user_state["identity"] and assistant.gateway_participant:
        catch_up_done = True
        assistant.catch_up_done = True
        logger.info("[init] Gateway already ready, catch-up marked done (V3 cached context)")

    # Start heartbeat once session is started
    assistant.start_heartbeat()

