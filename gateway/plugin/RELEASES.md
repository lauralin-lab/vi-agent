# VI Channel Plugin Releases

## v1.0.1 (2026-02-07)

Critical fixes for runtime architecture and user identity stability.

### Fixed
- **Runtime Access Pattern**: Corrected to use `api.runtime` (has channel APIs) instead of `ctx.runtime` (basic runtime)
- **Config Storage**: Separated config/cfg storage in http-routes module for proper route handler access
- **User Identity Stability**: Implemented localStorage-based persistent user IDs to prevent new ID generation on each session
- **Session Keys**: Changed to per-user format `livekit:user-{participantId}` for better tracking
- **Runtime API Calls**: Fixed `runtime.channel.reply.createReplyDispatcherWithTyping` and `runtime.channel.reply.resolveHumanDelayConfig` calls

### Technical Details
- Studied openclaw-channel-dingtalk reference implementation
- Runtime now set in index.ts register() using api.runtime
- Config passed to HTTP route handlers via setHttpRoutesConfig()
- User identity stored in browser localStorage as 'vi-channel_user_id'

## v1.0.0 (2026-02-06)

Initial release of VI Channel by Collov.ai - LiveKit voice/video channel plugin for OpenClaw.

### Features
- Real-time voice/video conversations with AI agents
- LiveKit cloud integration
- RPC-based gateway communication
- Session persistence across page navigation
- Web-based configuration UI
- Always-on plugin with fallback config
