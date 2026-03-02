"""Shared utility functions for the realtime agent."""
import logging

logger = logging.getLogger("vi-realtime.utils")


def escape_xml(text: str) -> str:
    """Escape XML special characters in text."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


async def publish_info_bar(room, status: str, message: str):
    """Publish info bar status update to frontend via data channel."""
    payload = f'<info_bar status="{escape_xml(status)}">{escape_xml(message)}</info_bar>'
    logger.info(f"[update_info_bar] {payload}")
    await room.local_participant.publish_data(
        payload.encode("utf-8"),
        reliable=True,
        topic="agent_info_bar",
    )
