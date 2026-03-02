#!/bin/bash
# Create a new dev environment instance for a team member
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
REPO_DIR="$BASE_DIR/repo"
INSTANCE_DIR="$BASE_DIR/instances/$DEV_NAME"
REGISTRY="$BASE_DIR/registry.json"
TEMPLATE_DIR="$BASE_DIR/templates"

echo "=== Creating dev instance for: $DEV_NAME ==="

# --- Ensure shared infra is running ---
if ! docker compose -f "$BASE_DIR/shared/docker-compose.yml" ps --status running 2>/dev/null | grep -q postgres; then
    echo "Starting shared infrastructure..."
    cd "$BASE_DIR/shared"
    docker compose up -d
    sleep 5
fi

# --- Read registry and allocate slot ---
if [ ! -f "$REGISTRY" ]; then
    echo '{"instances":{},"shared":{"postgres_port":5432,"redis_port":6379,"status":"running"},"next_slot":1,"server_ip":"","max_slots":9}' > "$REGISTRY"
    # Fill in server IP
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    python3 -c "
import json
with open('$REGISTRY','r') as f: r=json.load(f)
r['server_ip']='$SERVER_IP'
with open('$REGISTRY','w') as f: json.dump(r,f,indent=2)
"
fi

# Check if instance already exists
EXISTING=$(python3 -c "
import json
with open('$REGISTRY') as f: r=json.load(f)
print('yes' if '$DEV_NAME' in r['instances'] else 'no')
")

if [ "$EXISTING" = "yes" ]; then
    echo "Instance '$DEV_NAME' already exists. Use destroy-instance.sh first to recreate."
    exit 1
fi

# Allocate slot
SLOT=$(python3 -c "
import json
with open('$REGISTRY') as f: r=json.load(f)
print(r['next_slot'])
")

FRONTEND_PORT=$((3000 + SLOT * 100))
API_PORT=$((3000 + SLOT * 100 + 1))
GATEWAY_PORT=$((3000 + SLOT * 100 + 2))
REALTIME_PORT=$((3000 + SLOT * 100 + 3))

echo "Allocated slot $SLOT: frontend=$FRONTEND_PORT, api=$API_PORT, gateway=$GATEWAY_PORT, realtime=$REALTIME_PORT"

# --- Update repo ---
echo "Updating repository..."
cd "$REPO_DIR"
git fetch --all
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git pull origin "$BRANCH" 2>/dev/null || true

if [ -n "$COMMIT" ]; then
    git checkout "$COMMIT"
fi

ACTUAL_COMMIT=$(git rev-parse --short HEAD)
echo "Version: $BRANCH@$ACTUAL_COMMIT"

# --- Create database for this developer ---
echo "Creating database vi_$DEV_NAME..."
PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-vi_shared_dev}" psql -h localhost -U vi_admin -d vi_shared -c \
    "CREATE DATABASE vi_$DEV_NAME;" 2>/dev/null || echo "Database vi_$DEV_NAME already exists"

PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-vi_shared_dev}" psql -h localhost -U vi_admin -d vi_shared -c \
    "DO \$\$ BEGIN
       CREATE ROLE vi_$DEV_NAME WITH LOGIN PASSWORD '${DEV_NAME}_dev_pass';
     EXCEPTION WHEN duplicate_object THEN NULL;
     END \$\$;" 2>/dev/null

PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-vi_shared_dev}" psql -h localhost -U vi_admin -d vi_shared -c \
    "GRANT ALL PRIVILEGES ON DATABASE vi_$DEV_NAME TO vi_$DEV_NAME;" 2>/dev/null

# --- Create instance directory ---
echo "Creating instance directory..."
mkdir -p "$INSTANCE_DIR"

# Select template based on build mode
if [ "$BUILD_MODE" = "image" ]; then
    TEMPLATE_FILE="docker-compose.instance-image.yml.tpl"
    echo "Mode: image pull (tag=$IMAGE_TAG)"
else
    TEMPLATE_FILE="docker-compose.instance.yml.tpl"
    echo "Mode: source build"
fi

# Generate docker-compose from template
sed -e "s/__DEV_NAME__/$DEV_NAME/g" \
    -e "s/__SLOT__/$SLOT/g" \
    -e "s/__FRONTEND_PORT__/$FRONTEND_PORT/g" \
    -e "s/__API_PORT__/$API_PORT/g" \
    -e "s/__GATEWAY_PORT__/$GATEWAY_PORT/g" \
    -e "s/__REALTIME_PORT__/$REALTIME_PORT/g" \
    -e "s/__IMAGE_TAG__/$IMAGE_TAG/g" \
    "$TEMPLATE_DIR/$TEMPLATE_FILE" > "$INSTANCE_DIR/docker-compose.yml"

# Create .env from shared secrets + developer overrides
SERVER_IP=$(python3 -c "import json; print(json.load(open('$REGISTRY'))['server_ip'])")
cat > "$INSTANCE_DIR/.env" << ENVEOF
# Auto-generated for $DEV_NAME — $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Shared secrets (from /opt/vi-agent/shared/.env)
$(grep -E '^(LIVEKIT_|GOOGLE_API_KEY|ANTHROPIC_API_KEY|INTERNAL_API_TOKEN)' "$BASE_DIR/shared/.env" 2>/dev/null || echo "# No shared secrets found — configure manually")

# Instance-specific
POSTGRES_PASSWORD=${DEV_NAME}_dev_pass
REDIS_PASSWORD=${REDIS_PASSWORD:-redis_shared_dev}
JWT_SECRET=$(openssl rand -hex 32)
SERVER_IP=$SERVER_IP
ENVEOF

# --- Build/Pull and start ---
cd "$INSTANCE_DIR"
if [ "$BUILD_MODE" = "image" ]; then
    echo "Pulling images (tag=$IMAGE_TAG)..."
    docker compose pull
    docker compose up -d
else
    echo "Building and starting services..."
    docker compose build
    docker compose up -d
fi

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
        'realtime': $REALTIME_PORT
    },
    'branch': '$BRANCH',
    'commit': '$ACTUAL_COMMIT',
    'image_tag': '$IMAGE_TAG',
    'build_mode': '$BUILD_MODE',
    'deployed_at': '$DEPLOYED_AT',
    'deployed_by': '$DEV_NAME',
    'status': 'running'
}
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
        echo "⚠️  Some tests failed. Instance is running but may have issues."
    fi
else
    echo "(test-instance.sh not found — skipping)"
fi

echo ""
echo "=== Instance Created ==="
echo "  Developer:  $DEV_NAME"
echo "  Frontend:   http://$SERVER_IP:$FRONTEND_PORT"
echo "  API:        http://$SERVER_IP:$API_PORT"
echo "  API Docs:   http://$SERVER_IP:$API_PORT/docs"
echo "  Gateway:    http://$SERVER_IP:$GATEWAY_PORT"
echo "  Version:    $BRANCH@$ACTUAL_COMMIT"
echo "  Deployed:   $DEPLOYED_AT"
echo ""
