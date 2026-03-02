# VI Gateway

Standalone AI executor gateway for VI Agent, powered by LiveKit.

## Features

- **Multi-executor**: Gemini Flash, Claude (NanoClaw) executors with configurable routing
- **LiveKit Integration**: Joins rooms as gateway participant, handles RPC dispatch
- **Session Management**: Persistent sessions with idle timeout

## Architecture

```
User Browser → LiveKit Cloud (spawns Agent)
  ↓ RPC: rpc_dispatch_message
VI Gateway → AI Processing (Gemini / Claude)
  ↓ RPC response with text/HTML
Agent → TTS → User Browser
```

## Configuration

Gateway is configured via environment variables (see `.env.example` in project root):

| Variable | Description |
|----------|-------------|
| `LIVEKIT_URL` | LiveKit server URL |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GATEWAY_HTTP_PORT` | HTTP server port (default: 18789) |

## Development

```bash
# Run via docker compose (recommended)
docker compose up vi-gateway

# Or standalone
cd gateway && npm install && npm run dev
```

## License

MIT
