#!/bin/bash
# Create or update a dev environment instance for a team member
# Usage: ./create-instance.sh <name> <branch> [commit] [build_mode] [image_tag]
#
# build_mode: "build" (source build on server) or "image" (pull from Docker Hub)
# image_tag:  Docker image tag (required for image mode, e.g. dev-20260302-abc1234)
#
# This script runs ON the server (called via SSH from /dev skill)
set -e

DEV_NAME="$1"
BRANCH="${2:-main}"
COMMIT="$3"
BUILD_MODE="${4:-build}"
IMAGE_TAG="${5:-latest}"

if [ -z "$DEV_NAME" ]; then
    echo "ERROR: Developer name required"
    echo "Usage: $0 <name> <branch> [commit] [build_mode] [image_tag]"
    exit 1
fi

BASE_DIR="/opt/vi-agent"
INSTANCE_DIR="$BASE_DIR/instances/$DEV_NAME"
REGISTRY="$BASE_DIR/registry.json"
TEMPLATE_DIR="$BASE_DIR/templates"

echo "=== Creating/updating dev instance for: $DEV_NAME ==="

# --- Read registry and allocate slot ---
if [ ! -f "$REGISTRY" ]; then
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    cat > "$REGISTRY" << EOF
{"instances":{},"next_slot":1,"server_ip":"$SERVER_IP","max_slots":9}
EOF
fi

# Check if instance already exists — if so, reuse slot
EXISTING_SLOT=$(python3 -c "
import json
with open('$REGISTRY') as f: r=json.load(f)
inst = r['instances'].get('$DEV_NAME')
print(inst['slot'] if inst else '')
" 2>/dev/null)

if [ -n "$EXISTING_SLOT" ]; then
    SLOT=$EXISTING_SLOT
    echo "Instance '$DEV_NAME' exists (slot $SLOT). Updating..."
else
    SLOT=$(python3 -c "
import json
with open('$REGISTRY') as f: r=json.load(f)
print(r['next_slot'])
")
    echo "New instance — allocating slot $SLOT"
fi

FRONTEND_PORT=$((3000 + SLOT * 100))
API_PORT=$((3000 + SLOT * 100 + 1))
GATEWAY_PORT=$((3000 + SLOT * 100 + 2))
REALTIME_PORT=$((3000 + SLOT * 100 + 3))
POSTGRES_PORT=$((5432 + SLOT))
REDIS_PORT=$((6379 + SLOT))

echo "Ports: frontend=$FRONTEND_PORT, api=$API_PORT, gateway=$GATEWAY_PORT, postgres=$POSTGRES_PORT, redis=$REDIS_PORT"

# --- Create instance directory ---
mkdir -p "$INSTANCE_DIR"

# --- Generate SSL certs if missing ---
if [ ! -f "$INSTANCE_DIR/ssl/cert.pem" ]; then
    echo "Generating self-signed SSL certificate..."
    mkdir -p "$INSTANCE_DIR/ssl"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$INSTANCE_DIR/ssl/key.pem" \
        -out "$INSTANCE_DIR/ssl/cert.pem" \
        -subj "/CN=vi-agent-$DEV_NAME" 2>/dev/null
fi

# --- Select template based on build mode ---
if [ "$BUILD_MODE" = "image" ]; then
    TEMPLATE_FILE="docker-compose.instance-image.yml.tpl"
    echo "Mode: image pull (tag=$IMAGE_TAG)"
else
    TEMPLATE_FILE="docker-compose.instance.yml.tpl"
    echo "Mode: source build"
fi

# --- Generate docker-compose from template ---
sed -e "s/__DEV_NAME__/$DEV_NAME/g" \
    -e "s/__SLOT__/$SLOT/g" \
    -e "s/__FRONTEND_PORT__/$FRONTEND_PORT/g" \
    -e "s/__API_PORT__/$API_PORT/g" \
    -e "s/__GATEWAY_PORT__/$GATEWAY_PORT/g" \
    -e "s/__REALTIME_PORT__/$REALTIME_PORT/g" \
    -e "s/__POSTGRES_PORT__/$POSTGRES_PORT/g" \
    -e "s/__REDIS_PORT__/$REDIS_PORT/g" \
    -e "s/__IMAGE_TAG__/$IMAGE_TAG/g" \
    "$TEMPLATE_DIR/$TEMPLATE_FILE" > "$INSTANCE_DIR/docker-compose.yml"

# --- Generate .env if it doesn't exist (preserve existing secrets on update) ---
SERVER_IP=$(python3 -c "import json; print(json.load(open('$REGISTRY'))['server_ip'])")
if [ ! -f "$INSTANCE_DIR/.env" ]; then
    echo "Generating .env..."
    cat > "$INSTANCE_DIR/.env" << ENVEOF
# Auto-generated for $DEV_NAME — $(date -u +%Y-%m-%dT%H:%M:%SZ)
POSTGRES_PASSWORD=vi_dev_$DEV_NAME
REDIS_PASSWORD=redis_dev_$DEV_NAME
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_API_TOKEN=$(openssl rand -hex 16)
SERVER_IP=$SERVER_IP
ENVEOF
    echo "NOTE: API keys (LIVEKIT_*, GOOGLE_*, ANTHROPIC_*) must be added to .env manually or via /dev skill"
else
    # Ensure SERVER_IP is present
    if ! grep -q SERVER_IP "$INSTANCE_DIR/.env"; then
        echo "SERVER_IP=$SERVER_IP" >> "$INSTANCE_DIR/.env"
    fi
    echo "Using existing .env (secrets preserved)"
fi

# --- Stop existing containers if updating ---
cd "$INSTANCE_DIR"
if [ -n "$EXISTING_SLOT" ]; then
    echo "Stopping existing containers..."
    docker compose down --remove-orphans 2>/dev/null || true
fi

# --- Build/Pull and start ---
if [ "$BUILD_MODE" = "image" ]; then
    echo "Pulling images (tag=$IMAGE_TAG)..."
    docker compose pull
fi
echo "Starting services..."
docker compose up -d

# --- Wait for health ---
echo "Waiting for API server..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
        echo "API server healthy."
        break
    fi
    if [ "$i" = "30" ]; then
        echo "WARNING: API server did not become healthy within 60 seconds"
    fi
    sleep 2
done

# --- Update registry ---
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
python3 -c "
import json
with open('$REGISTRY','r') as f: r=json.load(f)
r['instances']['$DEV_NAME'] = {
    'slot': $SLOT,
    'ports': {
        'frontend': $FRONTEND_PORT,
        'api': $API_PORT,
        'gateway': $GATEWAY_PORT,
        'realtime': $REALTIME_PORT,
        'postgres': $POSTGRES_PORT,
        'redis': $REDIS_PORT
    },
    'branch': '$BRANCH',
    'commit': '$(cd $INSTANCE_DIR && git -C /opt/vi-agent/repo rev-parse --short HEAD 2>/dev/null || echo unknown)',
    'image_tag': '$IMAGE_TAG',
    'build_mode': '$BUILD_MODE',
    'deployed_at': '$DEPLOYED_AT',
    'deployed_by': '$DEV_NAME',
    'status': 'running'
}
if $SLOT >= r.get('next_slot', 1):
    r['next_slot'] = $SLOT + 1
with open('$REGISTRY','w') as f: json.dump(r,f,indent=2)
"

# --- Run deployment tests ---
echo ""
echo "Running deployment tests..."
if [ -f "$TEMPLATE_DIR/test-instance.sh" ]; then
    bash "$TEMPLATE_DIR/test-instance.sh" "$SERVER_IP" "$FRONTEND_PORT" "$API_PORT" "$GATEWAY_PORT"
    TEST_EXIT=$?
    if [ $TEST_EXIT -ne 0 ]; then
        echo "WARNING: Some tests failed. Instance is running but may have issues."
    fi
else
    echo "(test-instance.sh not found — skipping)"
fi

echo ""
echo "=== Instance Ready ==="
echo "  Developer:  $DEV_NAME"
echo "  Frontend:   http://$SERVER_IP:$FRONTEND_PORT"
echo "  API:        http://$SERVER_IP:$API_PORT"
echo "  API Docs:   http://$SERVER_IP:$API_PORT/docs"
echo "  Gateway:    http://$SERVER_IP:$GATEWAY_PORT"
echo "  Image Tag:  $IMAGE_TAG"
echo "  Build Mode: $BUILD_MODE"
echo "  Deployed:   $DEPLOYED_AT"
echo ""
