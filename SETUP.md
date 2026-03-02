# VI Agent Core — Setup & Configuration Guide

This guide walks you through configuring and running the full VI stack: API server, vi-realtime agent, vi-gateway executor, and the interaction demo frontend.

## Architecture Overview

```
Frontend (React)  ←→  API Server (FastAPI)  ←→  PostgreSQL
      ↕                      ↕
  LiveKit Cloud            Redis
      ↕                      ↕
vi-realtime (Gemini Live)  ←→  vi-gateway (Claude Agent via LiveKit RPC)
```

## Prerequisites

- macOS with Homebrew (for local dev) or Docker (for containerized)
- Python 3.11+
- Node.js 20+
- Redis
- PostgreSQL 16

---

## 1. API Keys You Need

| Key | Service | Where to Get | Required? |
|-----|---------|-------------|-----------|
| `LIVEKIT_API_KEY` | LiveKit Cloud | [cloud.livekit.io](https://cloud.livekit.io) → Project → Settings → Keys | Yes |
| `LIVEKIT_API_SECRET` | LiveKit Cloud | Same as above (shown once when created) | Yes |
| `LIVEKIT_URL` | LiveKit Cloud | Project page shows the WebSocket URL (e.g., `wss://xxx.livekit.cloud`) | Yes |
| `GOOGLE_API_KEY` | Google AI Studio | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Yes |
| `ANTHROPIC_API_KEY` | Anthropic Console | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Yes |
| `JWT_SECRET` | Self-generated | `openssl rand -hex 32` | Yes (production) |

### How to Get Each Key

**LiveKit Cloud (free tier available):**
1. Sign up at [cloud.livekit.io](https://cloud.livekit.io)
2. Create a new project
3. Go to Settings → Keys → "Add New Key"
4. Copy the **API Key** and **API Secret** (secret is only shown once)
5. Your project URL is shown on the project page (format: `wss://xxx.livekit.cloud`)

**Google Gemini API Key:**
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Select or create a Google Cloud project
4. Copy the key. The `gemini-2.5-flash-native-audio-preview` model is used for real-time voice.

**Anthropic API Key:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Navigate to Settings → API Keys
3. Click "Create Key" and copy it
4. This powers the Claude agent inside vi-gateway containers

---

## 2. Environment Configuration

### Option A: Local Development

Copy the example and fill in your keys:

```bash
cd agent-core
cp .env.example .env
```

Edit `.env`:

```bash
# --- Required API Keys ---
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=your-livekit-secret

GOOGLE_API_KEY=AIza...your-gemini-key
ANTHROPIC_API_KEY=sk-ant-...your-anthropic-key

# --- Security (generate for production) ---
JWT_SECRET=run-openssl-rand-hex-32-here

# --- Database (defaults work for local dev) ---
# DATABASE_URL=postgresql+asyncpg://vi:vi_secret_change_me@localhost:5432/vi_db
# REDIS_URL=redis://localhost:6379/0

# --- PostgreSQL (only needed for Docker Compose) ---
# POSTGRES_USER=vi
# POSTGRES_PASSWORD=vi_secret_change_me
# POSTGRES_DB=vi_db
```

Also configure the frontend:

```bash
cd ../vi-interaction-demo
cp .env.local.example .env.local  # or create it
```

Edit `vi-interaction-demo/.env.local`:

```bash
VITE_API_URL=http://localhost:8000
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### Option B: Docker Compose

All variables go in `agent-core/.env`. Docker Compose reads them automatically. The `VITE_LIVEKIT_URL` is passed as a build arg to the frontend container.

---

## 3. Running Locally

### Quick Start (all services at once)

```bash
cd agent-core
./dev.sh
```

This starts: PostgreSQL, Redis, API server (:8000), vi-realtime, vi-gateway, and frontend (:5173).

### Manual Start (service by service)

```bash
# 1. Infrastructure
brew services start redis
brew services start postgresql@16
createdb vi_db 2>/dev/null  # create DB if needed

# 2. API Server
cd agent-core/api-server
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 3. vi-realtime (new terminal)
cd agent-core/realtime
uv sync
uv run python src/agent.py dev

# 4. vi-gateway (new terminal)
cd agent-core/gateway/plugin
npm install
npm run dev

# 5. Frontend (new terminal)
cd vi-interaction-demo
npm install
npx vite --host
```

### Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API Server | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Demo Mode | http://localhost:5173?demo |

---

## 4. Running with Docker Compose

```bash
cd agent-core

# Make sure .env is configured (see Section 2)
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:80 |
| API Server | http://localhost:8000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

---

## 5. Running Tests

### API Server Tests (55 tests)

```bash
cd agent-core/api-server

# First time: set up test venv
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install pytest pytest-asyncio httpx aiosqlite

# Run all tests
.venv/bin/python -m pytest tests/ -v

# Run specific categories:
.venv/bin/python -m pytest tests/test_token_service.py tests/test_user_center.py -v  # Unit tests (19)
.venv/bin/python -m pytest tests/test_auth.py tests/test_livekit.py tests/test_users.py -v  # Route tests (21)
.venv/bin/python -m pytest tests/test_integration.py -v  # Integration tests (14)
```

Tests use an in-memory SQLite database — **no PostgreSQL or Redis needed**.

### Realtime Tests

```bash
cd agent-core/realtime

# Run all tests
uv run python -m pytest tests/ -v
```

Tests mock all LiveKit dependencies — **no external services needed**.

### All Tests Summary

| Component | Test File | Tests | Type |
|-----------|-----------|-------|------|
| API Server | `test_token_service.py` | 9 | Unit — JWT token create/decode |
| API Server | `test_user_center.py` | 10 | Unit — password hash, vi-gateway_id |
| API Server | `test_smoke.py` | 1 | Smoke — health endpoint |
| API Server | `test_auth.py` | 12 | Route — signup, login, /me |
| API Server | `test_livekit.py` | 3 | Route — LiveKit token endpoint |
| API Server | `test_users.py` | 6 | Route — sessions, tasks |
| API Server | `test_integration.py` | 14 | Integration — full user flows |
| Realtime | `test_agent_core.py` | — | Unit — agent core logic |
| Realtime | `test_core.py` | — | Unit — core module |
| Realtime | `test_skill_registration.py` | — | Unit — skill registration |
| Realtime | `test_tool_registry.py` | — | Unit — tool registry |

---

## 6. Environment Variables Reference

### API Server (`agent-core/api-server`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://vi:password@localhost:5432/vi_db` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `JWT_SECRET` | `change-this-to-a-random-secret-key` | Secret for signing JWT tokens |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | `1440` (24h) | JWT token expiration |
| `LIVEKIT_URL` | `wss://localhost:7880` | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | (empty) | LiveKit API key |
| `LIVEKIT_API_SECRET` | (empty) | LiveKit API secret |

### vi-realtime (`agent-core/realtime`)

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVEKIT_URL` | (none) | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | (none) | LiveKit API key |
| `LIVEKIT_API_SECRET` | (none) | LiveKit API secret |
| `GOOGLE_API_KEY` | (none) | Gemini API key for voice/video |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis for task dispatch |

### vi-gateway

| Variable | Default | Description |
|----------|---------|-------------|
| `LIVEKIT_URL` | (none) | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | (none) | LiveKit API key |
| `LIVEKIT_API_SECRET` | (none) | LiveKit API secret |
| `ANTHROPIC_API_KEY` | (none) | Claude API key for agent |
| `GOOGLE_API_KEY` | (none) | Gemini API key |
| `GATEWAY_HTTP_PORT` | `18789` | HTTP port for gateway |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | API server URL |
| `VITE_LIVEKIT_URL` | `wss://localhost:7880` | LiveKit WebSocket URL |

---

## 7. Troubleshooting

**"GOOGLE_API_KEY not set" → vi-realtime skipped**
- Make sure `GOOGLE_API_KEY` is in your `.env` file
- Verify the key works: `curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"`

**"Invalid credentials" on login**
- Check that PostgreSQL is running and the database exists
- Run `createdb vi_db` if needed

**LiveKit token errors**
- Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set correctly
- The key/secret pair must come from the same LiveKit project

**Frontend can't connect to API**
- Check `VITE_API_URL` points to the running API server
- In dev mode, the Vite proxy at `/api` forwards to `localhost:8000`

**vi-gateway not processing tasks**
- Check that vi-gateway is healthy and connected to LiveKit
- Verify `ANTHROPIC_API_KEY` and `GOOGLE_API_KEY` are set
- Check gateway logs: `docker compose logs -f vi-gateway`

---

## 8. Production Deployment

See `deploy/README.md` for GCE deployment instructions. The key differences for production:

1. **Generate a strong JWT_SECRET**: `openssl rand -hex 32`
2. **Use a strong POSTGRES_PASSWORD**
3. **Set up HTTPS** (nginx or cloud load balancer)
4. **LiveKit Cloud production project** (separate from dev)
5. **Monitor API key usage** on Google and Anthropic dashboards
