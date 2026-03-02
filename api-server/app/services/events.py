"""Event publishing helper for Redis pub/sub SSE delivery."""

import json
import logging

logger = logging.getLogger(__name__)


async def publish_event(redis, vi_user_id: str, event: dict) -> None:
    """Publish an event to the user's SSE channel.

    Args:
        redis: aioredis client (or None to skip publishing).
        vi_user_id: The user's external identifier.
        event: Dict with 'event_type' key and arbitrary payload.
    """
    if redis is None:
        return
    channel = f"vi:events:{vi_user_id}"
    try:
        await redis.publish(channel, json.dumps(event))
    except Exception:
        logger.warning("Failed to publish event to %s", channel, exc_info=True)
