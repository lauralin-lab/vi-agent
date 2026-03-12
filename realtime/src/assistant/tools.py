"""
ToolsMixin — all @function_tool decorated methods for the Assistant.

These are the tools exposed to the LLM (Gemini / OpenAI) during a voice session.
Legacy RPC methods are preserved but NOT decorated with @function_tool
so Gemini cannot invoke them. They can still be called programmatically.
"""
import asyncio
import json
import logging

from livekit.agents import RunContext, function_tool

from utils import escape_xml

logger = logging.getLogger(__name__)


class ToolsMixin:
    """Mixin providing all @function_tool methods for Assistant."""

    async def rpc_b2f_call(self, method: str, payload: dict = None) -> dict:
        """Send RPC to user participant for frontend control."""
        if not self.user_identity:
            logger.warning(f"[{method}] User not connected, cannot call")
            return {"success": False, "error": "User not connected"}

        try:
            logger.info(f"[{method}] Sending RPC to user: payload={payload}")
            response = await self.room.local_participant.perform_rpc(
                destination_identity=self.user_identity,
                method=method,
                payload=json.dumps(payload or {}),
            )
            result = json.loads(response) if response else {"success": True}
            logger.info(f"[{method}] User RPC response: {result}")
            return result
        except Exception as e:
            logger.error(f"[{method}] User RPC failed: {e}")
            return {"success": False, "error": str(e)}

    # ─── Legacy RPC methods (kept for programmatic use, NOT exposed to Gemini) ───

    async def rpc_b2f_take_photo(self, context: RunContext = None):
        """Captures photo from camera, adds to chat input (user must then Send)."""
        logger.info("[rpc_b2f_take_photo] Tool invoked")
        result = await self.rpc_b2f_call("rpcB2FTakePhoto")
        return {"status": "captured" if result.get("success") else "failed"}

    async def rpc_b2f_capture_and_upload(self, context: RunContext = None):
        """Captures a photo from the user's camera and uploads it to S3 automatically."""
        logger.info("[rpc_b2f_capture_and_upload] Tool invoked")
        result = await self.rpc_b2f_call("rpcB2FCaptureAndUpload")
        if result.get("success") and result.get("url"):
            url = result["url"]
            logger.info(f"[rpc_b2f_capture_and_upload] Photo uploaded: {url}")
            return {"status": "uploaded", "url": url}
        error = result.get("error", "Unknown error")
        logger.error(f"[rpc_b2f_capture_and_upload] Failed: {error}")
        return {"status": "failed", "error": error}

    async def rpc_b2f_set_chat_text(self, context: RunContext = None, text: str = ""):
        """Writes text into chat input box."""
        logger.info(f"[rpc_b2f_set_chat_text] Tool invoked text={text[:50]}")
        result = await self.rpc_b2f_call("rpcB2FSetChatText", {"text": text})
        return {"status": "set" if result.get("success") else "failed"}

    async def rpc_b2f_get_chat_content(self, context: RunContext = None):
        """Reads current text and images from chat input box."""
        logger.info("[rpc_b2f_get_chat_content] Tool invoked")
        result = await self.rpc_b2f_call("rpcB2FGetChatContent")
        return result if result.get("text") is not None else {}

    async def rpc_b2f_show_action_card(self, context: RunContext = None, title: str = "", options: list[str] = None):
        """Shows clickable option buttons (max 4 options)."""
        options = options or []
        logger.info(f"[rpc_b2f_show_action_card] Tool invoked title={title} options={len(options)}")
        result = await self.rpc_b2f_call("rpcB2FShowActionCard", {"title": title, "options": options[:4]})
        return {"status": "shown" if result.get("success") else "failed"}

    async def rpc_b2f_show_result(self, context: RunContext = None, result_type: str = "", content: str = ""):
        """Displays rich content visually to user."""
        logger.info(f"[rpc_b2f_show_result] Tool invoked type={result_type} len={len(content)}")
        result = await self.rpc_b2f_call("rpcB2FShowResult", {"result_type": result_type, "content": content})
        return {"status": "shown" if result.get("success") else "failed"}

    async def rpc_b2f_navigate_to(self, context: RunContext = None, page: str = ""):
        """Navigate the user to a different page."""
        logger.info(f"[rpc_b2f_navigate_to] Navigating to: {page}")
        result = await self.rpc_b2f_call("rpcB2FNavigateTo", {"page": page})
        if result.get("success"):
            self._current_page = page
        return {"status": "navigated" if result.get("success") else "failed", "page": page}

    async def rpc_b2f_zoom(self, context: RunContext = None, level: float = 1.0):
        """Adjust camera zoom level."""
        logger.info(f"[rpc_b2f_zoom] Setting zoom: {level}")
        result = await self.rpc_b2f_call("rpcB2FZoom", {"level": level})
        return {"status": "zoomed" if result.get("success") else "failed", "level": level}

    async def rpc_b2f_switch_camera(self, context: RunContext = None, camera: str = ""):
        """Switch between front and back camera."""
        logger.info(f"[rpc_b2f_switch_camera] Switching to: {camera}")
        result = await self.rpc_b2f_call("rpcB2FSwitchCamera", {"camera": camera})
        return {"status": "switched" if result.get("success") else "failed", "camera": camera}

    # ─── Active tools (exposed to Gemini via @function_tool) ─────────────

    @function_tool
    async def update_info_bar(self, context: RunContext, status: str, message: str):
        """Updates the info bar to show current agent status. Call this to inform the user what you're doing before speaking. Use status to categorize the action (e.g., 'thinking', 'searching', 'creating', 'analyzing', 'ready', 'error') and message to provide details."""
        from utils import publish_info_bar
        self._track_task(asyncio.create_task(publish_info_bar(self.room, status, message)))
        return {"status": "updated"}

    @function_tool
    async def send_conversation_summary(self, context: RunContext, summary: str):
        """Send a conversation summary to the frontend before dispatching a task. Include what the user showed you, what they said/asked, and key context that informed your decision."""
        from assistant.base import publish_conversation_summary
        self._track_task(asyncio.create_task(publish_conversation_summary(self.room, summary)))
        return {"status": "sent"}

    @function_tool
    async def send_intention_prompt(self, context: RunContext, intention: str):
        """Send the intention prompt to the frontend showing what will be dispatched. This is the exact text/instruction being sent to the AI."""
        from assistant.base import publish_intention_prompt
        self._track_task(asyncio.create_task(publish_intention_prompt(self.room, intention)))
        return {"status": "sent"}

    @function_tool
    async def suggest_action(self, context: RunContext, icon: str, label: str):
        """Update the shutter button icon and label based on current scene context. Call proactively when scene/context changes. Icons: camera, scan, search, shop, identify, translate, receipt, create."""
        payload = f"<action_suggestion action=\"{escape_xml(icon)}\" icon=\"{escape_xml(icon)}\" label=\"{escape_xml(label)}\">{escape_xml(label)}</action_suggestion>"
        logger.info(f"[suggest_action] {payload}")
        self._track_task(asyncio.create_task(
            self.room.local_participant.publish_data(
                payload.encode("utf-8"),
                reliable=True,
                topic="agent_action",
            )
        ))
        return {"status": "updated"}

    @function_tool
    async def rpc_b2f_action_button(self, context: RunContext, hashtag: str, label: str):
        """Show a tappable action button to the user. ONLY use these predefined hashtags: #search, #identify, #translate, #shop, #solve, #ask, #nutrition, #read, #todo, #schedule. Use the matching predefined label: Search, Identify, Translate, Shop, Solve, Ask, Nutrition, Read, Todo, Schedule. Do NOT invent custom hashtags or labels."""
        logger.info(f"[rpc_b2f_action_button] hashtag={hashtag} label={label}")
        await self._push_to_frontend("vi-agent", {
            "type": "action_button",
            "hashtag": hashtag,
            "label": label,
        })
        return {"status": "shown", "hashtag": hashtag}

    @function_tool
    async def dispatch_to_nanoclaw(self, context: RunContext, prompt: str):
        """Dispatches a task to NanoClaw for processing. Provide a clear, detailed description of what needs to be done. NanoClaw will automatically choose the best approach (website creation, research, document generation, data analysis, etc.). Results are delivered asynchronously to the frontend via SSE."""
        logger.info(f"[dispatch_to_nanoclaw] Dispatching: {prompt[:100]}")
        return await self._dispatch_via_nanoclaw(prompt)
