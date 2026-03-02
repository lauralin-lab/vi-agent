#!/bin/bash
set -e

echo "🛑 Stopping openclaw gateway..."
openclaw gateway stop 2>/dev/null || true
sleep 1

echo "🔪 Force killing openclaw-gateway..."
pkill -9 -f openclaw-gateway 2>/dev/null || true
sleep 1

echo "🚀 Starting openclaw gateway --dev..."
openclaw gateway --dev &
GATEWAY_PID=$!

echo "📂 Starting file server for ~/.openclaw/workspace on port 8888..."
python3 -m http.server 8888 --directory "$HOME/.openclaw/workspace" &
FILE_SERVER_PID=$!

echo ""
echo "✅ All services started:"
echo "   Gateway PID: $GATEWAY_PID"
echo "   File Server PID: $FILE_SERVER_PID (http://localhost:8888)"
echo ""
echo "Press Ctrl+C to stop all services"

# Trap Ctrl+C to kill both processes
trap "echo '🛑 Stopping...'; kill $GATEWAY_PID $FILE_SERVER_PID 2>/dev/null; exit 0" INT TERM

# Wait for both
wait
