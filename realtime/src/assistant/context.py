"""
ContextMixin — Redis context subscription, event publishing, keyframe sampling.

Subscribes to vi:ctx:{uid} for NanoClaw context snapshots + predicted intentions.
Publishes user events to vi:actions:{uid} Redis Stream.
Captures keyframes from video and publishes to vi:frames:{uid}.
"""
import asyncio
import hashlib
import json
import logging
import time

import aiohttp

from redis_events import (
    ActionEvent,
    KeyframeEvent,
    channel_ctx,
    channel_actions,
    channel_frames,
)

logger = logging.getLogger(__name__)

# Try to import PIL for image quality checks; degrade gracefully if unavailable
try:
    from PIL import Image
    import io as _io
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False
    logger.info("[redis][livekit] PIL not available — running in degraded mode (no blur detection)")

# Try to import LiveKit encode utilities for frame -> JPEG
try:
    from livekit.agents.utils.images import encode as lk_encode, EncodeOptions, ResizeOptions
    _HAS_LK_ENCODE = True
except ImportError:
    _HAS_LK_ENCODE = False
    logger.info("[redis][livekit] LiveKit encode utils not available — frame encoding may fail")

# Keyframe sampler constants
_SAMPLE_INTERVAL_S = 5          # Capture every 5 seconds
_JPEG_QUALITY = 80              # JPEG quality for keyframes
_FRAME_WIDTH = 720              # Target width
_FRAME_HEIGHT = 720             # Target max height
_BLUR_THRESHOLD = 100.0         # Laplacian variance threshold for blur detection
_UPLOAD_TIMEOUT_S = 10          # Timeout for presign + upload


class ContextMixin:
    """Mixin providing Redis context subscription and event publishing."""

    # ─── Redis event publishing ───────────────────────────────────

    async def _publish_user_event(self, event_type: str, data: dict):
        """Publish user event to Redis Stream vi:actions:{uid}."""
        from assistant.base import _get_redis
        try:
            redis = await _get_redis()
            if not redis:
                return
            event = ActionEvent(
                type=event_type,
                user_id=self._vi_user_id,
                data=data,
            )
            await redis.xadd(
                channel_actions(self._vi_user_id),
                {"data": event.model_dump_json()},
                maxlen=1000,
            )
            logger.info(f"[redis][livekit] Event → vi:actions: {event_type}: {str(data.get('text', data.get('page', '')))[:80]}")
        except Exception as e:
            logger.warning(f"[redis][livekit] Failed to publish {event_type}: {e}")

    async def _push_to_frontend(self, topic: str, data: dict):
        """Push JSON data to frontend via LiveKit DataChannel."""
        try:
            await self.room.local_participant.publish_data(
                json.dumps(data).encode("utf-8"),
                reliable=True,
                topic=topic,
            )
        except Exception as e:
            logger.warning(f"[push_to_frontend] Failed to push to {topic}: {e}")

    # ─── Redis context subscription ─────────────────────────────

    async def _start_context_subscription(self):
        """Subscribe to NanoClaw context updates (vi:ctx:{uid}).

        On each message: parse ContextSnapshot, update system instructions,
        and push intention cards to frontend via DataChannel.
        Gracefully degrades if NanoClaw/Redis is not available.
        """
        from assistant.base import _get_redis, AGENT_INSTRUCTIONS_CORE, PAGE_PROMPTS
        try:
            redis = await _get_redis()
            if not redis:
                logger.warning("[redis][livekit] Redis not available, skipping context subscription")
                return
            pubsub = redis.pubsub()
            await pubsub.subscribe(channel_ctx(self._vi_user_id))
            logger.info(f"[redis][livekit] Subscribed to {channel_ctx(self._vi_user_id)}")

            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    context_data = json.loads(message["data"])
                    snapshot = context_data.get("snapshot", "")
                    self._latest_context = snapshot
                    intentions = context_data.get("predicted_intentions", [])

                    # Update system instructions with new context
                    intent_hints = self._format_intention_hints(intentions)
                    page_section = PAGE_PROMPTS.get(self._current_page, PAGE_PROMPTS["camera"])
                    new_instructions = (
                        f"{AGENT_INSTRUCTIONS_CORE}\n\n{page_section}\n\n"
                        f"## Context\n{snapshot}\n\n{intent_hints}"
                    )

                    if self._agent_session:
                        await self.update_instructions(new_instructions)
                        logger.info(f"[redis][livekit] Updated instructions with context ({len(snapshot)} chars)")

                    # Push intention cards to frontend via DataChannel
                    if intentions:
                        await self._push_to_frontend("vi-agent", {
                            "type": "intention_update",
                            "intentions": intentions,
                        })
                except Exception as e:
                    logger.warning(f"[redis][livekit] Error processing context message: {e}")
        except asyncio.CancelledError:
            logger.info("[redis][livekit] Context subscription cancelled")
        except Exception as e:
            logger.error(f"[redis][livekit] Context subscription error: {e}")

    def _format_intention_hints(self, intentions: list) -> str:
        """Format predicted intentions as hints for the LLM."""
        if not intentions:
            return ""
        hints = ["## Predicted User Intentions"]
        for intent in intentions[:5]:
            title = intent.get("title", "")
            desc = intent.get("description", "")
            confidence = intent.get("confidence", 0)
            hints.append(f"- {title} ({confidence:.0%}): {desc}")
        return "\n".join(hints)

    # ─── Keyframe sampling ─────────────────────────────────────────

    async def _start_keyframe_sampler(self):
        """Periodically capture keyframes from video and publish to vi:frames:{uid}.

        Captures a frame every 5 seconds from the user's video track, encodes
        as JPEG, uploads to GCS via presigned URL, and publishes a KeyframeEvent
        to Redis PUB/SUB.

        Optimizations:
        - Scene change detection: skips if frame hash matches previous
        - Blur detection (if PIL available): skips blurry frames
        Graceful degradation: skips frames on any failure, continues sampling.
        """
        from assistant.base import _get_redis

        last_scene_hash = ""
        frames_captured = 0
        frames_skipped = 0

        try:
            logger.info(f"[redis][livekit] Keyframe sampler started for {self._vi_user_id}")

            # Wait for video to become available
            await asyncio.sleep(3)

            while True:
                await asyncio.sleep(_SAMPLE_INTERVAL_S)

                try:
                    # Step 1: Get latest frame from video stream
                    frame = getattr(self, "_latest_frame", None)
                    if frame is None:
                        logger.debug("[redis][livekit] No video frame available, skipping")
                        continue

                    # Step 2: Encode frame as JPEG bytes
                    jpeg_bytes = self._encode_frame_to_jpeg(frame)
                    if jpeg_bytes is None:
                        continue

                    # Step 3: Scene change detection via hash
                    scene_hash = hashlib.md5(jpeg_bytes[:4096]).hexdigest()[:16]
                    if scene_hash == last_scene_hash:
                        frames_skipped += 1
                        logger.debug(f"[redis][livekit] Scene unchanged (hash={scene_hash}), skipping")
                        continue

                    # Step 4: Blur detection (if PIL available)
                    if _HAS_PIL and self._is_frame_blurry(jpeg_bytes):
                        frames_skipped += 1
                        logger.debug("[redis][livekit] Frame too blurry, skipping")
                        continue

                    # Step 5: Upload to GCS via presigned URL
                    frame_url = await self._upload_keyframe(jpeg_bytes)
                    if not frame_url:
                        continue

                    # Step 6: Publish KeyframeEvent to Redis
                    has_change = last_scene_hash != "" and scene_hash != last_scene_hash
                    last_scene_hash = scene_hash
                    frames_captured += 1

                    redis = await _get_redis()
                    if redis:
                        event = KeyframeEvent(
                            frameUrl=frame_url,
                            sceneHash=scene_hash,
                            hasChange=has_change,
                        )
                        await redis.publish(
                            channel_frames(self._vi_user_id),
                            event.model_dump_json(),
                        )
                        logger.info(
                            f"[redis][livekit] Published frame #{frames_captured} "
                            f"(hash={scene_hash}, change={has_change}, skipped={frames_skipped})"
                        )

                except Exception as e:
                    logger.warning(f"[redis][livekit] Frame capture error: {e}")

        except asyncio.CancelledError:
            logger.info(
                f"[redis][livekit] Keyframe sampler cancelled "
                f"(captured={frames_captured}, skipped={frames_skipped})"
            )
        except Exception as e:
            logger.error(f"[redis][livekit] Keyframe sampler fatal error: {e}")

    def _encode_frame_to_jpeg(self, frame) -> bytes | None:
        """Encode a LiveKit VideoFrame to JPEG bytes. Returns None on failure."""
        if not _HAS_LK_ENCODE:
            logger.debug("[redis][livekit] No LiveKit encode utils, cannot encode frame")
            return None
        try:
            return lk_encode(
                frame,
                EncodeOptions(
                    format="JPEG",
                    quality=_JPEG_QUALITY,
                    resize_options=ResizeOptions(
                        width=_FRAME_WIDTH,
                        height=_FRAME_HEIGHT,
                        strategy="scale_aspect_fit",
                    ),
                ),
            )
        except Exception as e:
            logger.warning(f"[redis][livekit] Frame encode failed: {e}")
            return None

    def _is_frame_blurry(self, jpeg_bytes: bytes) -> bool:
        """Check if a JPEG frame is too blurry using Laplacian variance.

        Returns True if the frame is blurry (variance below threshold).
        Only called when PIL is available.
        """
        try:
            img = Image.open(_io.BytesIO(jpeg_bytes)).convert("L")
            # Simple Laplacian-like sharpness: variance of pixel differences
            pixels = list(img.getdata())
            width = img.width
            total = 0
            count = 0
            for y in range(1, img.height - 1):
                for x in range(1, width - 1):
                    idx = y * width + x
                    lap = (
                        pixels[idx - 1] + pixels[idx + 1]
                        + pixels[idx - width] + pixels[idx + width]
                        - 4 * pixels[idx]
                    )
                    total += lap * lap
                    count += 1
            variance = total / count if count > 0 else 0
            return variance < _BLUR_THRESHOLD
        except Exception as e:
            logger.debug(f"[redis][livekit] Blur detection failed: {e}")
            return False  # On error, don't skip the frame

    async def _upload_keyframe(self, jpeg_bytes: bytes) -> str | None:
        """Upload JPEG bytes to GCS via presigned URL. Returns public URL or None."""
        try:
            http = await self._get_http_session()

            # Get presigned PUT URL from API server
            resp = await http.get(
                f"{self._api_base}/api/internal/storage/presign-put",
                params={"ext": "jpg", "prefix": "frames"},
                timeout=aiohttp.ClientTimeout(total=_UPLOAD_TIMEOUT_S),
            )
            if resp.status != 200:
                logger.warning(f"[redis][livekit] Presign failed: {resp.status}")
                return None

            data = await resp.json()
            put_url = data.get("put_url")
            public_url = data.get("public_url")
            content_type = data.get("content_type", "image/jpeg")

            if not put_url:
                logger.warning("[redis][livekit] No put_url in presign response")
                return None

            # Upload JPEG bytes to GCS via presigned URL
            # Use a separate session for GCS upload (different host, no internal auth headers)
            async with aiohttp.ClientSession() as upload_session:
                upload_resp = await upload_session.put(
                    put_url,
                    data=jpeg_bytes,
                    headers={"Content-Type": content_type},
                    timeout=aiohttp.ClientTimeout(total=_UPLOAD_TIMEOUT_S),
                )
                if upload_resp.status not in (200, 201):
                    logger.warning(f"[redis][livekit] GCS upload failed: {upload_resp.status}")
                    return None

            logger.debug(f"[redis][livekit] Uploaded frame to {public_url}")
            return public_url

        except Exception as e:
            logger.warning(f"[redis][livekit] Upload error: {e}")
            return None
