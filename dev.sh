#!/bin/bash
# VI Agent Core — Local Development Startup
# Starts all services for local development

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Starting VI Agent Core from $PROJECT_ROOT"

# Load .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Ensure infrastructure
echo "Starting Redis and PostgreSQL..."
brew services start redis 2>/dev/null || true
brew services start postgresql@16 2>/dev/null || true
sleep 2

# Create database if not exists
/opt/homebrew/opt/postgresql@16/bin/createdb vi_db 2>/dev/null || true

# Start API server
echo "Starting API server on :8000..."
cd "$PROJECT_ROOT/api-server"
if [ ! -d ".venv" ]; then
    /opt/homebrew/bin/python3.11 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
API_PID=$!
echo "API server PID: $API_PID"

# Start vi-realtime agent (needs LiveKit + Gemini API keys)
echo "Starting vi-realtime agent..."
cd "$PROJECT_ROOT/realtime"
if ! command -v uv &>/dev/null; then
    echo "ERROR: uv is required for realtime. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "Skipping vi-realtime."
else
    uv sync --quiet
fi
# Only start if GOOGLE_API_KEY is set
if [ -n "$GOOGLE_API_KEY" ] || grep -q "GOOGLE_API_KEY=." "$PROJECT_ROOT/.env" 2>/dev/null; then
    uv run python src/agent.py dev &
    REALTIME_PID=$!
    echo "vi-realtime PID: $REALTIME_PID"
else
    echo "Skipping vi-realtime (GOOGLE_API_KEY not set)"
fi

# Start vi-gateway
echo "Starting vi-gateway..."
cd "$PROJECT_ROOT/gateway/plugin"
npm install --silent 2>/dev/null
npm run dev &
VI_GATEWAY_PID=$!
echo "vi-gateway PID: $VI_GATEWAY_PID"

# Start frontend
echo "Starting frontend on :5173..."
cd "$PROJECT_ROOT/frontend"
npm install --silent 2>/dev/null
npx vite --host &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "==================================="
echo "  VI Agent Core — Development Mode"
echo "==================================="
echo "  Frontend:    http://localhost:5173"
echo "  API Server:  http://localhost:8000"
echo "  API Docs:    http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "==================================="

# Cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $API_PID $VI_GATEWAY_PID $FRONTEND_PID $REALTIME_PID 2>/dev/null
    wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# Wait for any process to exit
wait
