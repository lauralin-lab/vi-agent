"""
DispatchMixin — NanoClaw dispatch via Redis, session header publishing, URL pre-signing.

LiveKit agent dispatches prompts to NanoClaw via Redis. NanoClaw decides
skill routing autonomously — the agent never specifies skill slugs.
"""
import asyncio
import json
import logging
import re
import time

from redis_events import ExecRequest, channel_exec
from utils import publish_info_bar

logger = logging.getLogger(__name__)


class DispatchMixin:
    """Mixin providing NanoClaw dispatch methods for Assistant."""

    # Pattern to detect bare GCS URLs that need signing
    _GCS_URL_RE = re.compile(r'https://storage\.googleapis\.com/[a-z0-9_-]+/[^\s\'"<>]+')

    async def _presign_storage_urls(self, text: str) -> str:
        """Replace bare GCS URLs with signed GET URLs so NanoClaw can access them."""
        import aiohttp
        gcs_urls = self._GCS_URL_RE.findall(text)
        if not gcs_urls:
            return text

        gcs_urls = [u for u in gcs_urls if "X-Goog-" not in u]
        if not gcs_urls:
            return text

        try:
            http = await self._get_http_session()
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

    @property
    def _room_connected(self) -> bool:
        """Check if LiveKit room is available and connected."""
        return bool(getattr(self, 'room', None) and getattr(self.room, 'local_participant', None))

    async def publish_session_header(self, intention: str, steps: list = None, full_prompt: str = ""):
        """Publish structured session header to frontend before NanoClaw dispatch.
        Gracefully skips if LiveKit room is not connected.
        """
        if not self._room_connected:
            logger.debug("[session_header] Skipped (no LiveKit room)")
            return
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

    async def _dispatch_via_nanoclaw(self, text: str) -> dict:
        """Dispatch task to NanoClaw via Redis vi:exec:{uid}.

        NanoClaw decides skill routing autonomously — no skill_slug needed.
        Results are delivered asynchronously via vi:stream -> SSE -> Frontend.
        """
        from assistant.base import _get_redis

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
                logger.info(f"[redis][livekit] Injected {len(missing_urls)} pending photo URL(s) into prompt")
            self._pending_photo_urls = []

        # Convert bare GCS URLs to signed GET URLs so NanoClaw can access them
        text = await self._presign_storage_urls(text)

        # Publish session header before dispatch (LiveKit-optional)
        clean_intention = re.sub(r'\[PHOTO CONTEXT[^\]]*\][\s\S]*?\[END PHOTO CONTEXT\]', '', text).strip()
        greeting_prefixes = ["hello", "hi ", "hi!", "how can i help", "what can i do"]
        if any(clean_intention.lower().startswith(g) for g in greeting_prefixes):
            clean_intention = "Photo Analysis"
        await self.publish_session_header(
            intention=clean_intention[:200],
            full_prompt=text,
        )

        # Build ExecRequest — no skillSlug, NanoClaw auto-routes
        task_id = self._current_session_id or f"dispatch-{int(time.time())}"
        photo_urls = self._GCS_URL_RE.findall(text)

        exec_request = ExecRequest(
            taskId=task_id,
            sessionId=self.room_name,
            prompt=text,
            context={
                "photoUrls": photo_urls,
                "viUserId": self._vi_user_id,
            },
            priority="thorough",
            mediaUrls=photo_urls,
        )

        try:
            redis = await _get_redis()
            if not redis:
                logger.error("[redis][livekit] Redis not available, cannot dispatch to NanoClaw")
                if self._room_connected:
                    self._track_task(asyncio.create_task(self.update_session_status("error", error="Redis not available")))
                    self._track_task(asyncio.create_task(publish_info_bar(self.room, "ready", "Request failed, please retry")))
                return {"ok": False, "error": "Redis not available"}

            await redis.publish(
                channel_exec(self._vi_user_id),
                exec_request.model_dump_json(),
            )
            logger.info(f"[redis][livekit] Dispatch → vi:exec:{self._vi_user_id}: {text[:100]}")

            # Publish event for tracking
            await self._publish_user_event("task_dispatched", {
                "task_id": task_id,
                "prompt": text[:500],
            })

            if self._room_connected:
                self._track_task(asyncio.create_task(self.update_session_status("progress")))
                self._track_task(asyncio.create_task(publish_info_bar(self.room, "working", "Processing...")))

                # Prompt agent to speak about progress (only if LiveKit connected)
                async def _speak_progress():
                    await asyncio.sleep(0.5)
                    if self._agent_session and not self._generation_lock.locked():
                        async with self._generation_lock:
                            self._agent_session.generate_reply(
                                user_input="[SYSTEM: Your request is now being processed. Briefly tell the user you're working on it and they'll see results shortly. Keep it natural and concise - one sentence.]"
                            )
                self._track_task(asyncio.create_task(_speak_progress()))

            return {
                "ok": True,
                "status": "dispatched",
                "message": "Request dispatched to NanoClaw via Redis. Results will arrive via SSE.",
            }

        except Exception as e:
            logger.error(f"[redis][livekit] Failed to dispatch to NanoClaw: {e}")
            if self._room_connected:
                self._track_task(asyncio.create_task(self.update_session_status("error", error=str(e))))
                self._track_task(asyncio.create_task(publish_info_bar(self.room, "ready", "Request failed, please retry")))
                try:
                    await self.room.local_participant.publish_data(
                        json.dumps({"type": "task_error", "error": str(e)}).encode(),
                        reliable=True,
                        topic="task_events",
                    )
                except Exception as pub_err:
                    logger.warning(f"[redis][livekit] Failed to publish error event: {pub_err}")
            return {"ok": False, "error": str(e)}
