"""
HeartbeatMixin — heartbeat loop, idle detection, auto-close, staleness.
"""
import asyncio
import json
import logging
import time

import aiohttp

from utils import publish_info_bar

logger = logging.getLogger(__name__)


class HeartbeatMixin:
    """Mixin providing heartbeat loop and idle/shutdown detection for Assistant."""

    def start_heartbeat(self):
        """Start periodic heartbeat task."""
        self.start_time = time.time()
        self.last_talk_time = time.time()
        self.last_agent_time = time.time()
        self.last_heartbeat_time = time.time()
        self.should_stop_heartbeat = False
        self.catch_up_done = False
        self._track_task(asyncio.create_task(self._heartbeat_loop()))

    async def _heartbeat_loop(self):
        """Periodic heartbeat to log status and perform catch-up."""
        logger.info("[heartbeat] Started")
        while True:
            try:
                if self.should_stop_heartbeat:
                    logger.info("[heartbeat] Stopping due to user disconnect")
                    break

                # Mark catch-up done if not yet done (Redis context subscription)
                if not self.catch_up_done and self.user_identity and self._agent_session:
                    self.catch_up_done = True
                    logger.info("[heartbeat] Catch-up marked done (Redis context)")

                await asyncio.sleep(10)
                self._trim_conversation_history()
                # Periodically flush conversation timeline to DB (every 60s)
                if (self._conversation_timeline
                    and time.time() - self._conversation_timeline_last_flush > 60):
                    await self._flush_conversation_timeline()
                now = time.time()
                session_time = int(now - self.start_time)
                idle_time = int(now - self.last_talk_time)
                agent_time = int(now - self.last_agent_time)
                heartbeat_time = int(now - self.last_heartbeat_time)

                user_id = self.user_identity if self.user_identity else "None"
                agent_id = self.room.local_participant.identity if self.room else "None"

                talking = "none"
                if idle_time < 3:
                    talking = "active"

                logger.debug(f"[HEARTBEAT] Agent: {agent_id}, User: {user_id}")
                logger.debug(f"[HEARTBEAT] Talking: {talking}, Since start: {session_time}s, Since last talk: {idle_time}s")

                # Smart heartbeat: conditional triggers to reduce wasteful LLM calls
                has_pending_dispatch = self._current_session_id is not None
                agent_silent_long = agent_time > 15

                # Staleness detection: auto-clear tasks stuck > 5 minutes
                if has_pending_dispatch and self._current_dispatch_started_at:
                    task_age = now - self._current_dispatch_started_at
                    if task_age > 300:
                        stale_task_id = self._current_session_id
                        logger.warning(f"[heartbeat] Task {stale_task_id} stale after {int(task_age)}s, auto-clearing")
                        self._current_session_id = None
                        self._current_dispatch_started_at = None
                        self._dispatch_heartbeat_count = 0
                        has_pending_dispatch = False

                        async def _notify_stale_task(tid):
                            try:
                                http = await self._get_http_session()
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
                        self._track_task(asyncio.create_task(_notify_stale_task(stale_task_id)))
                        try:
                            await publish_info_bar(self.room, "ready", "Task timed out, please retry")
                        except Exception as e:
                            logger.warning(f"[heartbeat] Failed to publish timeout info bar: {e}")

                if self._agent_session:
                    if has_pending_dispatch and agent_silent_long and self._dispatch_heartbeat_count < 3:
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
                        logger.info(f"[heartbeat] No task + idle {idle_time}s, offering assistance")
                        try:
                            self.last_talk_time = now
                            self.last_heartbeat_time = now
                            # Use NanoClaw predicted intentions if available
                            heartbeat_prompt = self._build_idle_heartbeat_prompt()
                            self._agent_session.generate_reply(
                                user_input=heartbeat_prompt
                            )
                        except Exception as e:
                            logger.debug(f"[heartbeat] Failed to trigger idle prompt: {e}")

                # Shutdown conditions
                if self._agent_session:
                    should_shutdown = False
                    shutdown_reason = ""

                    if not self.user_identity:
                        should_shutdown = True
                        shutdown_reason = f"No user in room"
                    elif idle_time > 300 and agent_time > 300:
                        should_shutdown = True
                        shutdown_reason = f"Idle timeout (300s) and agent silent (300s)"
                    elif agent_time > 600:
                        should_shutdown = True
                        shutdown_reason = f"Agent silent for 10 minutes"
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

    def _build_idle_heartbeat_prompt(self) -> str:
        """Build heartbeat prompt incorporating NanoClaw predicted intentions if available."""
        # Check if NanoClaw context has predicted intentions
        latest_ctx = getattr(self, "_latest_context", "")
        if latest_ctx:
            return (
                f"[HEARTBEAT: User idle. Context from brain: {latest_ctx[:300]}. "
                "Based on this context, briefly offer relevant assistance or a suggestion.]"
            )
        # Graceful fallback: no NanoClaw context available
        return "[HEARTBEAT: User idle, offer assistance briefly]"

    def _trim_conversation_history(self):
        """Keep last N turns to prevent context explosion in long sessions."""
        MAX_TURNS = 20
        if not self._agent_session:
            return
        if self._generation_lock.locked():
            return
        try:
            chat_ctx = self._agent_session.chat_ctx
            if chat_ctx and len(chat_ctx.messages) > MAX_TURNS * 2:
                system_msgs = [m for m in chat_ctx.messages if m.role == "system"]
                recent_msgs = list(chat_ctx.messages[-(MAX_TURNS * 2):])
                new_messages = system_msgs + recent_msgs
                chat_ctx.messages = new_messages
                logger.info(f"[trim] Conversation trimmed to {len(new_messages)} messages")
        except Exception as e:
            logger.debug(f"[trim] Could not trim conversation history: {e}")
