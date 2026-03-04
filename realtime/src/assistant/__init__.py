"""
assistant package — modular voice assistant for VI LiveKit Agent.

Re-exports all public names so existing imports like
`from assistant import Assistant` work as before.
"""
from assistant.base import (
    # Core class
    Assistant,
    # Module-level constants
    AGENT_NAME,
    VI_AGENT_NAME,
    AGENT_INSTRUCTIONS,
    AGENT_INSTRUCTIONS_CORE,
    AGENT_INSTRUCTIONS_TEMPLATE,
    PAGE_PROMPTS,
    CATCH_UP_FOLLOWUP_PROMPT,
    BASE_PROMPT_PATH,
    # Redis helpers
    _get_redis,
    _get_startup_context_cache,
    _get_resumption_token,
    _cache_resumption_token,
    # Utility functions
    log_info,
    expand_media_tags,
    extract_xml_tags,
    strip_medias_section,
    publish_transcript,
    publish_result,
    publish_conversation_summary,
    publish_intention_prompt,
    # Runtime wiring
    register_agent_rpc_methods,
    server,
    prewarm,
    run_agent,
    # Logger
    logger,
)

__all__ = [
    "Assistant",
    "AGENT_NAME",
    "VI_AGENT_NAME",
    "AGENT_INSTRUCTIONS",
    "AGENT_INSTRUCTIONS_CORE",
    "AGENT_INSTRUCTIONS_TEMPLATE",
    "PAGE_PROMPTS",
    "CATCH_UP_FOLLOWUP_PROMPT",
    "BASE_PROMPT_PATH",
    "_get_redis",
    "_get_startup_context_cache",
    "_get_resumption_token",
    "_cache_resumption_token",
    "log_info",
    "expand_media_tags",
    "extract_xml_tags",
    "strip_medias_section",
    "publish_transcript",
    "publish_result",
    "publish_conversation_summary",
    "publish_intention_prompt",
    "register_agent_rpc_methods",
    "server",
    "prewarm",
    "run_agent",
    "logger",
]
