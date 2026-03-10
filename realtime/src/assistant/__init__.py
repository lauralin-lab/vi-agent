"""
assistant package — modular voice assistant for VI LiveKit Agent.

Re-exports public names so existing imports like
`from assistant import Assistant` work unchanged.
"""
from assistant.base import (
    Assistant,
    VI_AGENT_NAME,
    AGENT_INSTRUCTIONS,
    server,
    run_agent,
    logger,
)

__all__ = [
    "Assistant",
    "VI_AGENT_NAME",
    "AGENT_INSTRUCTIONS",
    "server",
    "run_agent",
    "logger",
]
