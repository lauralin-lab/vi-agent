"""
STT -> LLM -> TTS LiveKit agent.
"""
import asyncio
import base64
import os

from livekit import rtc
from livekit.agents import AgentSession, JobContext, cli, get_job_context, room_io
from livekit.agents.llm import ImageContent
from livekit.agents.utils.images import encode, EncodeOptions, ResizeOptions
from livekit.plugins import cartesia, deepgram, openai, noise_cancellation
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from assistant import VI_AGENT_NAME, Assistant, logger, run_agent, server

STT_MODEL = os.getenv("STT_MODEL", "nova-3")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
TTS_MODEL = os.getenv("TTS_MODEL", "sonic-3")
TTS_VOICE = os.getenv("TTS_VOICE", "f786b574-daa5-4673-aa0c-cbe3e8534c02")


class LLMAssistant(Assistant):
    """STT-LLM-TTS assistant with manual video frame sampling for vision."""

    use_video_context = True

    def __init__(self, room_name: str, room: rtc.Room) -> None:
        super().__init__(room_name, room)
        self._latest_frame: rtc.VideoFrame | None = None
        self._video_stream: rtc.VideoStream | None = None
        self._tasks: list[asyncio.Task] = []

    def get_room_options(self) -> room_io.RoomOptions:
        """LLM pipeline: no native video_input (we sample frames manually)."""
        return room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
            video_input=None,  # Manual frame sampling via on_user_turn_completed
        )

    async def on_enter(self) -> None:
        """Subscribe to video tracks for manual frame sampling."""
        room = get_job_context().room

        # Watch for new video tracks (must register BEFORE checking existing tracks)
        @room.on("track_subscribed")
        def on_track_subscribed(
            track: rtc.Track,
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            if track.kind == rtc.TrackKind.KIND_VIDEO:
                logger.info(f"[vision] New video track subscribed from {participant.identity}")
                self._create_video_stream(track)

        # Find the first video track (if any) from a remote participant
        for participant in room.remote_participants.values():
            for publication in participant.track_publications.values():
                track = publication.track
                if track and track.kind == rtc.TrackKind.KIND_VIDEO:
                    logger.info(f"[vision] Found existing video track from {participant.identity}")
                    self._create_video_stream(track)
                    return  # Only use first video track found

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        """Attach the latest video frame to user message for vision context."""
        if not self._latest_frame:
            logger.warning("[vision] No video frame available for this turn")
            return

        frame = self._latest_frame
        logger.info(f"[vision] Attaching video frame to user message: {frame.width}x{frame.height}")

        # Encode frame at consistent high quality (640px, JPEG quality 95)
        try:
            encoded_bytes = encode(
                frame,
                EncodeOptions(
                    format="JPEG",
                    quality=95,
                    resize_options=ResizeOptions(
                        width=640,
                        height=640,
                        strategy="scale_aspect_fit",
                    ),
                ),
            )
            data_url = f"data:image/jpeg;base64,{base64.b64encode(encoded_bytes).decode('utf-8')}"
            logger.info(f"[vision] Encoded frame: {len(encoded_bytes)} bytes")
        except Exception as e:
            logger.error(f"[vision] Failed to encode frame: {e}")
            self._latest_frame = None
            return

        # Get current content and convert to list if needed
        current_content = new_message.content
        if not isinstance(current_content, list):
            current_content = [current_content] if current_content else []

        # Add image content with the encoded data URL
        current_content.append(ImageContent(image=data_url))
        new_message.content = current_content

        logger.info(f"[vision] Message content types: {[type(c).__name__ for c in new_message.content]}")
        self._latest_frame = None

    def _create_video_stream(self, track: rtc.Track) -> None:
        """Create a video stream to buffer the latest frame."""
        if self._video_stream is not None:
            logger.info("[vision] Closing existing video stream")
            self._video_stream.close()

        logger.info(f"[vision] Creating video stream for track {track.sid}")
        self._video_stream = rtc.VideoStream(track)

        async def read_stream() -> None:
            frame_count = 0
            async for event in self._video_stream:
                self._latest_frame = event.frame
                frame_count += 1
                if frame_count == 1:
                    logger.info("[vision] Receiving video frames")
                elif frame_count % 100 == 0:
                    logger.debug(f"[vision] Received {frame_count} frames")

        task = asyncio.create_task(read_stream())
        task.add_done_callback(lambda t: self._tasks.remove(t) if t in self._tasks else None)
        self._tasks.append(task)


def create_session(ctx: JobContext) -> AgentSession:
    return AgentSession(
        stt=deepgram.STT(model=STT_MODEL, language="multi"),
        llm=openai.LLM(model=LLM_MODEL),
        tools=[],
        tts=cartesia.TTS(
            model=TTS_MODEL,
            voice=TTS_VOICE,
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )


@server.rtc_session(agent_name=VI_AGENT_NAME)
async def my_agent(ctx: JobContext):
    assistant = LLMAssistant(ctx.room.name, ctx.room)
    await run_agent(ctx, assistant, create_session)


if __name__ == "__main__":
    cli.run_app(server)
