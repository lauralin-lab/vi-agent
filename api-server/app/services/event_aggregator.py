"""Event Aggregator — summarize vi:actions streams into vi:summary KV.

Uses a Redis SET `vi:active_users` (populated by event publishers via SADD)
instead of SCAN to find active users efficiently.
"""

import asyncio
import json
import logging
import time

logger = logging.getLogger(__name__)

AGGREGATION_INTERVAL = 10  # seconds
SUMMARY_TTL = 300  # 5 minutes
ACTIVE_USERS_KEY = "vi:active_users"
ACTIVE_USER_TTL = 120  # seconds — individual user marker expiry


async def mark_user_active(redis, uid: str):
    """Mark a user as active. Called when publishing to vi:actions:{uid}."""
    await redis.sadd(ACTIVE_USERS_KEY, uid)
    # Set a per-user expiry marker so stale users are cleaned up
    await redis.set(f"vi:active_user:{uid}", "1", ex=ACTIVE_USER_TTL)


async def aggregate_user_events(redis, uid: str):
    """Read recent actions for a user and write summary."""
    try:
        # XRANGE last 10 seconds of events
        now_ms = int(time.time() * 1000)
        start_ms = now_ms - (AGGREGATION_INTERVAL * 1000)
        start_id = f"{start_ms}-0"

        entries = await redis.xrange(
            f"vi:actions:{uid}", min=start_id, max="+"
        )

        if not entries:
            return

        # Extract event data
        action_types = {}
        topics = set()
        recent_actions = []
        current_page = ""

        for entry_id, fields in entries:
            data = json.loads(fields.get("data", "{}"))
            event_type = data.get("type", "unknown")
            action_types[event_type] = action_types.get(event_type, 0) + 1

            # Track topics from event data
            if "topic" in data:
                topics.add(data["topic"])
            if "text" in data:
                # Extract simple topic from text (first few words)
                words = data["text"].split()[:5]
                if words:
                    topics.add(" ".join(words))

            if event_type == "page_navigate":
                current_page = data.get("page", "")

            recent_actions.append(event_type)

        # Build summary
        summary_parts = []
        for atype, count in sorted(action_types.items(), key=lambda x: -x[1]):
            summary_parts.append(f"{atype}: {count}")

        summary = {
            "ts": time.time(),
            "period_seconds": AGGREGATION_INTERVAL,
            "summary": "; ".join(summary_parts),
            "active_topics": list(topics)[:10],
            "recent_actions": recent_actions[-10:],
            "current_page": current_page,
            "session_active": True,
        }

        await redis.set(
            f"vi:summary:{uid}",
            json.dumps(summary),
            ex=SUMMARY_TTL,
        )

    except Exception:
        logger.error("Failed to aggregate events for %s", uid, exc_info=True)


async def run_event_aggregator(redis):
    """Background loop: aggregate events for active users every 10 seconds."""
    logger.info("Event aggregator started")
    while True:
        try:
            # Read active users from the SET instead of SCAN
            all_uids = await redis.smembers(ACTIVE_USERS_KEY)
            active_uids = []
            for uid in all_uids:
                # Check per-user expiry marker; remove stale entries
                if await redis.exists(f"vi:active_user:{uid}"):
                    active_uids.append(uid)
                else:
                    await redis.srem(ACTIVE_USERS_KEY, uid)

            # Aggregate for each active user
            for uid in active_uids:
                await aggregate_user_events(redis, uid)

        except Exception:
            logger.error("Event aggregator loop error", exc_info=True)

        await asyncio.sleep(AGGREGATION_INTERVAL)
