#!/bin/bash
# deploy-instance.sh — Manage dev instances on the shared VM
# Called by GitHub Actions deploy-dev.yml workflow
#
# Secrets are injected as env vars by the workflow (from GitHub Environment Secrets).
# No SCP, no local .env upload, no SSH agent forwarding.
#
# Usage:
#   ./deploy-instance.sh deploy  <developer> <image_tag>
#   ./deploy-instance.sh destroy <developer>
#   ./deploy-instance.sh status  <developer|_all>
#   ./deploy-instance.sh logs    <developer> "" [service] [lines]
set -euo pipefail

ACTION="${1:-}"
DEVELOPER="${2:-}"
IMAGE_TAG="${3:-}"
SERVICE="${4:-}"
LINES="${5:-100}"

BASE_DIR="/opt/vi-agent"
REGISTRY="$BASE_DIR/registry.json"
TEMPLATE_DIR="$BASE_DIR/templates"

# --- Ensure registry exists ---
init_registry() {
  if [ ! -f "$REGISTRY" ]; then
    local ip
    ip=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    echo "{\"instances\":{},\"server_ip\":\"$ip\",\"max_slots\":9}" > "$REGISTRY"
  fi
}

get_server_ip() {
  python3 -c "import json; print(json.load(open('$REGISTRY'))['server_ip'])"
}

# --- Get or allocate slot ---
get_slot() {
  python3 -c "
import json
with open('$REGISTRY') as f: r = json.load(f)
inst = r['instances'].get('$DEVELOPER')
if inst:
    print(inst['slot'])
else:
    used = {v['slot'] for v in r['instances'].values()}
    slot = next((s for s in range(1, r.get('max_slots', 9) + 1) if s not in used), -1)
    print(slot)
"
}

# --- Calculate ports from slot ---
calc_ports() {
  local slot=$1
  FRONTEND_PORT=$((3000 + slot * 100))
  FRONTEND_HTTPS_PORT=$((FRONTEND_PORT + 10))
  API_PORT=$((3000 + slot * 100 + 1))
  NANOCLAW_PORT=$((3000 + slot * 100 + 2))
  NANOCLAW_HTTPS_PORT=$((NANOCLAW_PORT + 10))
  REALTIME_PORT=$((3000 + slot * 100 + 3))
  POSTGRES_PORT=$((5432 + slot))
  REDIS_PORT=$((6379 + slot))
}

# =====================================================================
# STATUS
# =====================================================================
cmd_status() {
  init_registry
  local SERVER_IP
  SERVER_IP=$(get_server_ip)

  if [ -n "${DEVELOPER:-}" ] && [ "$DEVELOPER" != "_all" ]; then
    # Status for specific developer
    python3 -c "
import json
with open('$REGISTRY') as f: r = json.load(f)
inst = r['instances'].get('$DEVELOPER')
if not inst:
    print('STATUS=not_found')
else:
    s = inst['slot']
    print(f'STATUS=found')
    print(f'SLOT={s}')
    print(f'FRONTEND_URL=http://$SERVER_IP:{3000 + s * 100}')
    print(f'FRONTEND_HTTPS_URL=https://$SERVER_IP:{3000 + s * 100 + 10}')
    print(f'API_URL=http://$SERVER_IP:{3000 + s * 100 + 1}')
    print(f'NANOCLAW_URL=http://$SERVER_IP:{3000 + s * 100 + 2}')
    print(f'IMAGE_TAG={inst.get(\"image_tag\", \"unknown\")}')
    print(f'DEPLOYED_AT={inst.get(\"deployed_at\", \"unknown\")}')
"
  else
    # Status for all instances
    echo "=== Dev Instances ==="
    python3 -c "
import json
with open('$REGISTRY') as f: r = json.load(f)
instances = r.get('instances', {})
if not instances:
    print('No active instances.')
else:
    for name, info in sorted(instances.items()):
        s = info['slot']
        tag = info.get('image_tag', 'unknown')
        deployed = info.get('deployed_at', 'unknown')[:19]
        print(f'  {name:12s}  slot={s}  http://$SERVER_IP:{3000+s*100}  tag={tag}  deployed={deployed}')
"
    echo ""
    echo "=== Server Resources ==="
    df -h / | tail -1 | awk '{print "  Disk: "$3" / "$2" ("$5" full)  Available: "$4}'
    echo "  Docker:"
    docker system df 2>/dev/null | grep -v '^$' | sed 's/^/    /' || echo "    (docker not accessible)"
  fi
}

# =====================================================================
# DESTROY
# =====================================================================
cmd_destroy() {
  local KEEP_DATA="${1:-}"
  init_registry

  if [ -z "$DEVELOPER" ]; then
    echo "ERROR: Developer name required for destroy" >&2
    exit 1
  fi

  local INSTANCE_DIR="$BASE_DIR/instances/$DEVELOPER"
  echo "=== Destroying dev instance: $DEVELOPER ==="

  # Stop containers and remove volumes
  if [ -d "$INSTANCE_DIR" ]; then
    cd "$INSTANCE_DIR"
    docker compose down --remove-orphans -v 2>/dev/null || true
    echo "Containers and volumes removed."
  fi

  # Remove instance directory
  if [ "$KEEP_DATA" != "--keep-data" ]; then
    rm -rf "$INSTANCE_DIR"
    echo "Instance directory removed."
  fi

  # Update registry
  python3 -c "
import json
with open('$REGISTRY', 'r') as f: r = json.load(f)
r['instances'].pop('$DEVELOPER', None)
with open('$REGISTRY', 'w') as f: json.dump(r, f, indent=2)
"
  echo "=== Instance '$DEVELOPER' destroyed ==="
}

# =====================================================================
# DEPLOY
# =====================================================================
cmd_deploy() {
  local IMAGE_TAG="${1:?ERROR: image_tag required}"
  init_registry

  if [ -z "$DEVELOPER" ]; then
    echo "ERROR: Developer name required for deploy" >&2
    exit 1
  fi

  local SLOT
  SLOT=$(get_slot)
  if [ "$SLOT" = "-1" ]; then
    echo "ERROR: No available slots (max 9). Destroy an existing instance first." >&2
    exit 1
  fi

  calc_ports "$SLOT"
  local SERVER_IP
  SERVER_IP=$(get_server_ip)
  local INSTANCE_DIR="$BASE_DIR/instances/$DEVELOPER"

  echo "=== Deploying dev instance: $DEVELOPER (slot $SLOT) ==="
  echo "  Image tag: $IMAGE_TAG"
  echo "  Ports: frontend=$FRONTEND_PORT api=$API_PORT nanoclaw=$NANOCLAW_PORT"

  mkdir -p "$INSTANCE_DIR"
  chown gitaction:docker "$INSTANCE_DIR"
  chmod 2775 "$INSTANCE_DIR"

  # --- Generate SSL cert if missing ---
  if [ ! -f "$INSTANCE_DIR/ssl/cert.pem" ]; then
    mkdir -p "$INSTANCE_DIR/ssl"
    chown gitaction:docker "$INSTANCE_DIR/ssl"
    chmod 2775 "$INSTANCE_DIR/ssl"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "$INSTANCE_DIR/ssl/key.pem" \
      -out "$INSTANCE_DIR/ssl/cert.pem" \
      -subj "/CN=vi-agent-$DEVELOPER" 2>/dev/null
    echo "SSL cert generated."
  fi

  # --- Generate or update .env ---
  if [ ! -f "$INSTANCE_DIR/.env" ]; then
    cat > "$INSTANCE_DIR/.env" << EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_API_TOKEN=$(openssl rand -hex 16)
SERVER_IP=$SERVER_IP
EOF
    echo ".env created (new instance)."
  fi

  # Update API keys from environment (injected by GitHub Actions)
  for key in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET GOOGLE_API_KEY ANTHROPIC_API_KEY GCS_BUCKET FIREBASE_ENABLED FIREBASE_PROJECTS; do
    val="${!key:-}"
    if [ -n "$val" ]; then
      sed -i "/^${key}=/d" "$INSTANCE_DIR/.env"
      echo "${key}=${val}" >> "$INSTANCE_DIR/.env"
    fi
  done
  # Ensure SERVER_IP is current
  sed -i "/^SERVER_IP=/d" "$INSTANCE_DIR/.env"
  echo "SERVER_IP=$SERVER_IP" >> "$INSTANCE_DIR/.env"
  chown gitaction:docker "$INSTANCE_DIR/.env"
  chmod 660 "$INSTANCE_DIR/.env"
  echo "API keys updated from environment."

  # --- Setup Firebase SA file (shared → instance, readable by container) ---
  SHARED_SA="$BASE_DIR/firebase/sa.json"
  INSTANCE_SA_DIR="$INSTANCE_DIR/firebase"
  if [ -f "$SHARED_SA" ]; then
    mkdir -p "$INSTANCE_SA_DIR"
    chown gitaction:docker "$INSTANCE_SA_DIR"
    chmod 2775 "$INSTANCE_SA_DIR"
    cp "$SHARED_SA" "$INSTANCE_SA_DIR/sa.json"
    chmod 644 "$INSTANCE_SA_DIR/sa.json"
    echo "Firebase SA copied to instance (644 for container read access)."
  else
    mkdir -p "$INSTANCE_SA_DIR"
    chown gitaction:docker "$INSTANCE_SA_DIR"
    chmod 2775 "$INSTANCE_SA_DIR"
    echo "WARNING: No Firebase SA at $SHARED_SA — Firebase auth will be disabled."
  fi

  # --- Generate docker-compose.yml from template ---
  local TEMPLATE_FILE="$TEMPLATE_DIR/docker-compose.instance-image.yml.tpl"
  if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "ERROR: Template not found: $TEMPLATE_FILE" >&2
    exit 1
  fi

  sed -e "s/__DEV_NAME__/$DEVELOPER/g" \
      -e "s/__SLOT__/$SLOT/g" \
      -e "s/__FRONTEND_PORT__/$FRONTEND_PORT/g" \
      -e "s/__FRONTEND_HTTPS_PORT__/$FRONTEND_HTTPS_PORT/g" \
      -e "s/__API_PORT__/$API_PORT/g" \
      -e "s/__NANOCLAW_PORT__/$NANOCLAW_PORT/g" \
      -e "s/__NANOCLAW_HTTPS_PORT__/$NANOCLAW_HTTPS_PORT/g" \
      -e "s/__REALTIME_PORT__/$REALTIME_PORT/g" \
      -e "s/__POSTGRES_PORT__/$POSTGRES_PORT/g" \
      -e "s/__REDIS_PORT__/$REDIS_PORT/g" \
      -e "s/__IMAGE_TAG__/$IMAGE_TAG/g" \
      "$TEMPLATE_FILE" > "$INSTANCE_DIR/docker-compose.yml"
  echo "docker-compose.yml generated."

  # --- Stop existing containers ---
  cd "$INSTANCE_DIR"
  docker compose down --remove-orphans 2>/dev/null || true

  # --- Docker Hub login (avoid rate limit) ---
  if [ -n "${DOCKERHUB_USERNAME:-}" ] && [ -n "${DOCKERHUB_TOKEN:-}" ]; then
    echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin 2>/dev/null
    echo "Docker Hub authenticated."
  else
    echo "WARNING: No Docker Hub credentials — pull may hit rate limit."
  fi

  # --- Pull and start ---
  echo "Pulling images..."
  docker compose pull
  echo "Starting services..."
  docker compose up -d

  # --- Health check ---
  echo "Waiting for API server..."
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
      echo "API server healthy."
      break
    fi
    if [ "$i" = "30" ]; then
      echo "ERROR: API server did not become healthy within 60s"
      docker compose logs --tail=20 api-server 2>/dev/null || true
      exit 1
    fi
    sleep 2
  done

  # --- Database migrations (after health check to ensure DB is ready) ---
  echo "Running database migrations..."
  docker compose exec -T api-server alembic upgrade head || {
    echo "WARNING: Migration failed — check api-server logs"
    docker compose logs --tail=10 api-server 2>/dev/null || true
  }

  # --- Run tests if available ---
  if [ -f "$TEMPLATE_DIR/test-instance.sh" ]; then
    echo ""
    echo "Running deployment tests..."
    bash "$TEMPLATE_DIR/test-instance.sh" "$SERVER_IP" "$FRONTEND_PORT" "$API_PORT" "$NANOCLAW_PORT" "$FRONTEND_HTTPS_PORT" || true
  fi

  # --- Update registry ---
  local DEPLOYED_AT
  DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  python3 -c "
import json
with open('$REGISTRY', 'r') as f: r = json.load(f)
r['instances']['$DEVELOPER'] = {
    'slot': $SLOT,
    'ports': {
        'frontend': $FRONTEND_PORT,
        'frontend_https': $FRONTEND_HTTPS_PORT,
        'api': $API_PORT,
        'nanoclaw': $NANOCLAW_PORT,
        'realtime': $REALTIME_PORT,
        'postgres': $POSTGRES_PORT,
        'redis': $REDIS_PORT
    },
    'image_tag': '$IMAGE_TAG',
    'deployed_at': '$DEPLOYED_AT',
    'status': 'running'
}
with open('$REGISTRY', 'w') as f: json.dump(r, f, indent=2)
"

  # --- Output (parsed by workflow) ---
  echo ""
  echo "=== Instance Ready ==="
  echo "  Developer:  $DEVELOPER"
  echo "  Frontend:   https://$SERVER_IP:$FRONTEND_HTTPS_PORT  (HTTPS)"
  echo "  Frontend:   http://$SERVER_IP:$FRONTEND_PORT  (HTTP)"
  echo "  API:        http://$SERVER_IP:$API_PORT"
  echo "  API Docs:   http://$SERVER_IP:$API_PORT/docs"
  echo "  NanoClaw:   http://$SERVER_IP:$NANOCLAW_PORT"
  echo "  Image Tag:  $IMAGE_TAG"
  echo "  Deployed:   $DEPLOYED_AT"
  echo ""
  # Machine-readable output for workflow parsing
  echo "DEPLOY_RESULT=success"
  echo "DEPLOY_FRONTEND=http://$SERVER_IP:$FRONTEND_PORT"
  echo "DEPLOY_HTTPS=https://$SERVER_IP:$FRONTEND_HTTPS_PORT"
  echo "DEPLOY_API=http://$SERVER_IP:$API_PORT"
}

# =====================================================================
# LOGS
# =====================================================================
cmd_logs() {
  init_registry

  if [ -z "$DEVELOPER" ]; then
    echo "ERROR: Developer name required for logs" >&2
    exit 1
  fi

  local INSTANCE_DIR="$BASE_DIR/instances/$DEVELOPER"
  if [ ! -d "$INSTANCE_DIR" ]; then
    echo "ERROR: Instance '$DEVELOPER' not found" >&2
    echo "Available instances:"
    ls "$BASE_DIR/instances/" 2>/dev/null || echo "  (none)"
    exit 1
  fi

  echo "=== Container Logs: $DEVELOPER ==="
  cd "$INSTANCE_DIR"
  if [ -n "$SERVICE" ]; then
    docker compose logs --tail "$LINES" "$SERVICE" 2>&1
  else
    docker compose logs --tail "$LINES" 2>&1
  fi

  # Also show logs from spawned agent containers (not part of compose)
  echo ""
  echo "=== Spawned Agent Containers ==="
  local SPAWNED
  SPAWNED=$(docker ps -a --filter "label=vi-agent-spawned=true" --format "{{.Names}}\t{{.Status}}" 2>/dev/null || true)
  if [ -z "$SPAWNED" ]; then
    echo "  (none)"
  else
    echo "$SPAWNED"
    echo ""
    for CNAME in $(docker ps -a --filter "label=vi-agent-spawned=true" --format "{{.Names}}"); do
      echo "--- Logs: $CNAME (last 50 lines) ---"
      docker logs --tail 50 "$CNAME" 2>&1 || echo "  (no logs available)"
      echo ""
    done
  fi
}

# =====================================================================
# MAIN
# =====================================================================
case "${ACTION}" in
  deploy)  cmd_deploy "$IMAGE_TAG" ;;
  destroy) cmd_destroy ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *)
    echo "Usage: $0 {deploy|destroy|status|logs} <developer> [image_tag] [service] [lines]" >&2
    exit 1
    ;;
esac
