#!/bin/bash
# VI Agent Core — Deploy Script
# Run from project root after setup-gce.sh and .env configuration

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== VI Agent Core — Deploying ==="

# Verify .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example and configure it."
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

# Verify required env vars
source .env
REQUIRED_VARS=("LIVEKIT_API_KEY" "LIVEKIT_API_SECRET" "GOOGLE_API_KEY" "ANTHROPIC_API_KEY" "JWT_SECRET")
for var in "${REQUIRED_VARS[@]}"; do
    val="${!var}"
    if [ -z "$val" ] || [[ "$val" == your-* ]] || [[ "$val" == change-* ]]; then
        echo "ERROR: $var is not configured in .env"
        exit 1
    fi
done

# Build and start all services
echo "Building and starting services..."
docker compose build
docker compose up -d

# Wait for health checks
echo "Waiting for API server to become healthy..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "API server is healthy."
        break
    fi
    if [ "$i" = "30" ]; then
        echo "ERROR: API server did not become healthy within 60 seconds"
        exit 1
    fi
    sleep 2
done

# Check health
echo ""
echo "=== Service Status ==="
docker compose ps
echo ""

# Test API health
API_HEALTH=$(curl -s http://localhost:8000/health 2>/dev/null || echo '{"status":"error"}')
echo "API Server: $API_HEALTH"

FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80 2>/dev/null || echo "error")
echo "Frontend: HTTP $FRONTEND_STATUS"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Access the application:"
echo "  Frontend:   http://$(curl -s ifconfig.me 2>/dev/null || echo '<your-ip>')"
echo "  API Docs:   http://$(curl -s ifconfig.me 2>/dev/null || echo '<your-ip>'):8000/docs"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f              # View all logs"
echo "  docker compose logs -f vi-realtime  # View agent logs"
echo "  docker compose restart              # Restart all"
echo "  docker compose down                 # Stop all"
echo ""
