"""
LiveKit agent entrypoint selector.
"""
import os
from importlib import import_module

from livekit.agents import cli

# AGENT_GEMINI or AGENT_LLM
AGENT_PIPELINE = os.getenv("AGENT_PIPELINE", "AGENT_GEMINI").upper()

if AGENT_PIPELINE == "AGENT_LLM":
    impl = import_module("agent_llm")
else:
    impl = import_module("agent_gemini")

server = impl.server

if __name__ == "__main__":
    cli.run_app(server)


