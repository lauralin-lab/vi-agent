# VI Channel by Collov.ai

Real-time voice/video AI agent channel plugin for OpenClaw Gateway, powered by LiveKit.

## Features

- **🎤 Voice Conversations**: Natural voice interactions with AI agents
- **� Session Persistence**: User identity persists via localStorage
- **⚙️ Easy Configuration**: Web-based configuration UI
- **🔒 Secure**: Token-based authentication via LiveKit

## Architecture

```
User Browser → LiveKit Cloud (spawns Agent)
  ↓ RPC: rpc_dispatch_message
OpenClaw Gateway → AI Processing
  ↓ RPC response with text
Agent → TTS → User Browser
```

### Components

- **Frontend UI** ([livekit-ui.html](frontend/livekit-ui.html)): Three-column layout with real-time audio chat
- **Gateway Client** ([room-client.ts](src/room-client.ts)): Joins as `gateway-xxx`, registers RPC methods
- **HTTP Routes** ([http-routes.ts](src/http-routes.ts)): Token generation, config UI, gateway join endpoint
- **Python Agent** (livekit-python/src/agent.py): Audio streaming with STT, AI processing via gateway RPC, TTS

## Installation

### 1. Configure Credentials

Edit `~/.openclaw/openclaw.json`:
```json
{
  "channels": {
    "vi-channel": {
      "enabled": true,
      "livekitUrl": "wss://your-project.livekit.cloud",
      "livekitApiKey": "APIxxxxxxxxxx",
      "livekitApiSecret": "your-secret-key",
      "httpPort": 18789,
      "debug": false
    }
  }
}
```

Or visit: http://localhost:18789/collov/config

### 2. Deploy Python Agent

```bash
cd livekit-python
pip install -r requirements.txt

export LIVEKIT_URL=wss://your-project.livekit.cloud
export LIVEKIT_API_KEY=APIxxxxxxxxxx
export LIVEKIT_API_SECRET=your-secret-key
export GATEWAY_URL=http://localhost:18789

python src/agent.py dev
```

## Usage

1. Start gateway: `openclaw gateway start`
2. Open UI: http://localhost:18789/collov/livekit/ui
3. Click **Connect** and speak

**User Identity**: Stored in localStorage as `vi-channel_user_id` (persists across sessions)
**Session Keys**: Format `livekit:user-{participantId}`

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable plugin (always on for config UI) |
| `livekitUrl` | string | - | LiveKit WebSocket URL (wss://...) |
| `livekitApiKey` | string | - | LiveKit API key |
| `livekitApiSecret` | string | - | LiveKit API secret |
| `httpPort` | number | `18789` | HTTP server port (shares gateway port) |
| `noUserTimeoutMs` | number | `60000` | Gateway disconnect timeout (ms) |
| `debug` | boolean | `false` | Enable debug logging |

## Key Endpoints

- `GET /collov/livekit/ui` - Three-column LiveKit interface
- `GET /collov/config` - Configuration UI
- `POST /collov/livekit/token` - Generate user access token
- `POST /collov/livekit/gateway/join` - Agent requests gateway to join room

### Frontend Flow

**1. Get Token (Frontend)**
```javascript
const response = await fetch('http://localhost:18789/collov/livekit/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-12345',    // 12345 - firebase id
    roomName: 'room-12345'   // 12345 - firebase id
  })
});
const { token } = await response.json();
// Use token to connect to LiveKit room
```

**2. Request Gateway Join (Agent)**
```javascript
response = requests.post('http://localhost:18789/collov/livekit/gateway/join', 
  json={
    'roomName': 'room-12345',   // 12345 - firebase id
  }
)
# Gateway joins as "gateway-xxx" participant
# Returns: {ok: true, participantName: 'gateway-xxx', sessionKey: 'livekit:main'}
```

## RPC Methods

**Agent → Gateway**: `rpc_dispatch_message` with action (`dispatch_message`, `memory_search`, `memory_get`)
**Gateway → Agent**: Returns JSON with `{ok, text, replies, queuedFinal}`

## Troubleshooting

- **No audio**: Check browser mic permissions and LiveKit URL accessibility
- **Token fails**: Verify credentials in openclaw.json or via /collov/config
- **Gateway not joining**: Check GATEWAY_URL in agent env vars and port 18789 access
- **Logs**: `openclaw logs` or `/tmp/openclaw/openclaw-*.log`

## Development

```bash
# Gateway (Terminal 1)
openclaw gateway start

# Agent (Terminal 2)
cd livekit-python && python src/agent.py dev

# Browser (Terminal 3)
open http://localhost:18789/collov/livekit/ui
```

## License

MIT

## Credits

- Built by [Collov.ai](https://collov.ai)
- Powered by [LiveKit](https://livekit.io)
- Integrated with [OpenClaw Gateway](https://github.com/openclaw/openclaw)
