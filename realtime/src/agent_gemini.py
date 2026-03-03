"""
Gemini Realtime LiveKit agent.
"""
import os

from livekit import rtc
from livekit.agents import AgentSession, JobContext, cli, room_io
from google.genai import types as gemini_types
from livekit.plugins import google, noise_cancellation

from agent_common import AGENT_INSTRUCTIONS, VI_AGENT_NAME, Assistant, run_agent, server

GEMINI_REALTIME_MODEL = os.getenv(
    "GEMINI_REALTIME_MODEL",
    "gemini-2.5-flash-native-audio-preview-12-2025",
)
GEMINI_REALTIME_VOICE = os.getenv("GEMINI_REALTIME_VOICE", "Aoede")
GEMINI_REALTIME_TEMPERATURE = float(os.getenv("GEMINI_REALTIME_TEMPERATURE", "0.7"))


class GeminiAssistant(Assistant):
    """Gemini Realtime assistant with native video input."""

    use_video_context = False  # Uses native video_input, not manual sampling

    def __init__(self, room_name: str, room: rtc.Room) -> None:
        super().__init__(room_name, room)

    def get_room_options(self) -> room_io.RoomOptions:
        """Gemini Realtime: enable native video_input for real-time video processing."""
        return room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
            video_input=room_io.VideoInputOptions(),  # Native video input for Gemini
        )


def create_session(
    ctx: JobContext,
    resumption_handle: str | None = None,
) -> AgentSession:
    # Build RealtimeModel kwargs — only include session_resumption when we have
    # a valid handle, otherwise omit it entirely so the plugin uses its NOT_GIVEN
    # sentinel (passing None crashes the plugin).
    llm_kwargs = dict(
        model=GEMINI_REALTIME_MODEL,
        voice=GEMINI_REALTIME_VOICE,
        temperature=GEMINI_REALTIME_TEMPERATURE,
        instructions=AGENT_INSTRUCTIONS,
        thinking_config=gemini_types.ThinkingConfig(thinking_budget=0),
    )
    if resumption_handle:
        llm_kwargs["session_resumption"] = gemini_types.SessionResumptionConfig(
            handle=resumption_handle,
        )

    return AgentSession(
        llm=google.realtime.RealtimeModel(**llm_kwargs),
        vad=ctx.proc.userdata["vad"],
    )


@server.rtc_session(agent_name=VI_AGENT_NAME)
async def my_agent(ctx: JobContext):
    assistant = GeminiAssistant(ctx.room.name, ctx.room)
    await run_agent(ctx, assistant, create_session)


if __name__ == "__main__":
    cli.run_app(server)
