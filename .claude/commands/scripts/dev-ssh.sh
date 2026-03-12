#!/bin/bash
# dev-ssh.sh — SSH-based dev deploy (bypasses Docker Hub, builds on server)
#
# Usage:
#   ./dev-ssh.sh deploy [service...]   Build & restart (default: all app services)
#   ./dev-ssh.sh status                Show running containers
#   ./dev-ssh.sh logs [service] [N]    Tail logs
#   ./dev-ssh.sh restart [service...]  Restart without rebuild
#   ./dev-ssh.sh config                Show current .dev.local values
#
# Reads config from .dev.local (KEY=VALUE, no quotes required).
# Required keys: DEV_NAME, SSH_KEY, SERVER_USER, SERVER_IP, WORK_DIR, BASE_PORT
# Optional keys: REPO_URL, SERVICES
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONFIG_FILE="$REPO_ROOT/.dev.local"

# ── SSH connection multiplexing ───────────────────────────────────────────────
# Reuse a single TCP connection for all ssh_cmd calls (ControlMaster).
# This avoids repeated TCP+auth handshakes and reduces chance of connection
# refusal from too many concurrent sessions.
# Use /tmp (not $TMPDIR) to keep socket path under macOS 104-char limit.
# %C = hash of %l%h%p%r — short and unique.
SSH_CONTROL_DIR="/tmp/dev-ssh-$$"
SSH_CONTROL_PATH="$SSH_CONTROL_DIR/%C"

_ssh_mux_setup() {
  mkdir -p "$SSH_CONTROL_DIR"
}

_ssh_mux_cleanup() {
  # Gracefully close the master connection, then remove the control dir
  ssh -o ControlPath="$SSH_CONTROL_PATH" -O exit "${SERVER_USER}@${SERVER_IP}" 2>/dev/null || true
  rm -rf "$SSH_CONTROL_DIR" 2>/dev/null || true
}

_ssh_mux_setup
trap _ssh_mux_cleanup EXIT

# ── Load config ──────────────────────────────────────────────────────────────
load_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: $CONFIG_FILE not found" >&2
    echo "RUN_SETUP=true"
    return 1
  fi
  # Source as env vars (handles KEY=VALUE lines, skips comments/blanks)
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    export "$key=$value"
  done < <(grep -E '^[A-Z_]+=.+' "$CONFIG_FILE")

  # Validate required keys
  local missing=()
  for key in DEV_NAME SSH_KEY SERVER_USER SERVER_IP WORK_DIR BASE_PORT; do
    if [ -z "${!key:-}" ]; then
      missing+=("$key")
    fi
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "MISSING_KEYS=${missing[*]}" >&2
    return 1
  fi
  return 0
}

# ── Derived ports (from BASE_PORT) ──────────────────────────────────────────
calc_ports() {
  FRONTEND_PORT=$BASE_PORT
  FRONTEND_HTTPS_PORT=$((BASE_PORT + 10))
  API_PORT=$((BASE_PORT + 1))
  NANOCLAW_PORT=$((BASE_PORT + 2))
  NANOCLAW_HTTPS_PORT=$((NANOCLAW_PORT + 10))
}

# ── SSH helper ──────────────────────────────────────────────────────────────
ssh_cmd() {
  ssh -A -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 \
    -o ControlMaster=auto \
    -o ControlPath="$SSH_CONTROL_PATH" \
    -o ControlPersist=300 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=4 \
    "${SERVER_USER}@${SERVER_IP}" "$@"
}

# ── Commands ────────────────────────────────────────────────────────────────

cmd_config() {
  if ! load_config 2>/dev/null; then
    echo "STATUS=no_config"
    return
  fi
  calc_ports
  echo "STATUS=ok"
  echo "DEV_NAME=$DEV_NAME"
  echo "SERVER=$SERVER_USER@$SERVER_IP"
  echo "SSH_KEY=$SSH_KEY"
  echo "WORK_DIR=$WORK_DIR"
  echo "BASE_PORT=$BASE_PORT"
  echo "FRONTEND_PORT=$FRONTEND_PORT"
  echo "FRONTEND_HTTPS_PORT=$FRONTEND_HTTPS_PORT"
  echo "API_PORT=$API_PORT"
  echo "NANOCLAW_PORT=$NANOCLAW_PORT"
  echo "REPO_URL=${REPO_URL:-ssh://git@github.com/<auto>}"
}

cmd_status() {
  load_config
  echo "=== Containers: $DEV_NAME ==="
  ssh_cmd "cd $WORK_DIR && docker compose ps 2>/dev/null || echo 'No containers running'"
}

cmd_logs() {
  load_config
  local service="${1:-}"
  local lines="${2:-100}"
  if [ -n "$service" ]; then
    ssh_cmd "cd $WORK_DIR && docker compose logs --tail $lines $service"
  else
    ssh_cmd "cd $WORK_DIR && docker compose logs --tail $lines"
  fi
}

cmd_restart() {
  load_config
  local services=("$@")
  if [ ${#services[@]} -eq 0 ]; then
    services=(api-server frontend nanoclaw vi-realtime)
  fi
  echo "Restarting: ${services[*]}"
  ssh_cmd "cd $WORK_DIR && docker compose restart ${services[*]}"
}

cmd_deploy() {
  load_config
  calc_ports

  local DOCKER_BUILD_EXTRA=""
  local services=()
  for arg in "$@"; do
    case "$arg" in
      --no-cache) DOCKER_BUILD_EXTRA="--no-cache" ;;
      *) services+=("$arg") ;;
    esac
  done
  if [ ${#services[@]} -eq 0 ]; then
    services=(api-server frontend nanoclaw vi-realtime)
  fi

  local BRANCH
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  local REPO_REMOTE
  REPO_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

  # Ensure REPO_URL
  if [ -z "${REPO_URL:-}" ]; then
    # Convert HTTPS to SSH if needed
    if echo "$REPO_REMOTE" | grep -q "https://"; then
      REPO_URL=$(echo "$REPO_REMOTE" | sed 's|https://github.com/|ssh://git@github.com/|')
    else
      REPO_URL="$REPO_REMOTE"
    fi
  fi

  echo "DEPLOY_START"
  echo "BRANCH=$BRANCH"
  echo "SERVICES=${services[*]}"
  echo "SERVER=$SERVER_USER@$SERVER_IP"

  # Step 0.5: Auto-bump version in realtime/src/version.py
  local VERSION_FILE="$REPO_ROOT/realtime/src/version.py"
  if [ -f "$VERSION_FILE" ]; then
    local OLD_VER
    OLD_VER=$(grep -oP 'VERSION = "\K[^"]+' "$VERSION_FILE" || echo "")
    if [ -n "$OLD_VER" ]; then
      # Increment the last numeric segment (e.g. 0.1.0-dev.1 → 0.1.0-dev.2)
      local NEW_VER
      NEW_VER=$(echo "$OLD_VER" | sed -E 's/([0-9]+)$/echo $((\1+1))/e' 2>/dev/null || echo "")
      if [ -n "$NEW_VER" ] && [ "$NEW_VER" != "$OLD_VER" ]; then
        sed -i '' "s/VERSION = \"$OLD_VER\"/VERSION = \"$NEW_VER\"/" "$VERSION_FILE" 2>/dev/null || \
          sed -i "s/VERSION = \"$OLD_VER\"/VERSION = \"$NEW_VER\"/" "$VERSION_FILE"
        git add "$VERSION_FILE"
        git commit -m "chore(realtime): bump version to $NEW_VER" --no-verify 2>/dev/null || true
        echo "VERSION_BUMP=$OLD_VER→$NEW_VER"
      fi
    fi
  fi

  # Step 1: Push current branch
  echo "STEP=push"
  git push origin "$BRANCH" 2>&1 || {
    echo "ERROR=push_failed"
    return 1
  }

  # Step 2: Clone or update source on server
  echo "STEP=pull"
  ssh_cmd "
    SRC_DIR='$WORK_DIR/src'
    if [ -d \"\$SRC_DIR/.git\" ]; then
      cd \"\$SRC_DIR\"
      git fetch origin '$BRANCH' && git checkout FETCH_HEAD
    elif [ -d \"\$SRC_DIR\" ] && [ ! -d \"\$SRC_DIR/.git\" ]; then
      # Exists but not a git repo (worktree or stale) — remove and clone
      sudo rm -rf \"\$SRC_DIR\"
      sudo mkdir -p \"\$SRC_DIR\"
      sudo chown $SERVER_USER:$SERVER_USER \"\$SRC_DIR\"
      git clone --depth 1 --branch '$BRANCH' '$REPO_URL' \"\$SRC_DIR\"
      cd \"\$SRC_DIR\"
    else
      sudo mkdir -p \"\$SRC_DIR\"
      sudo chown $SERVER_USER:$SERVER_USER \"\$SRC_DIR\"
      git clone --depth 1 --branch '$BRANCH' '$REPO_URL' \"\$SRC_DIR\"
      cd \"\$SRC_DIR\"
    fi
    echo 'HEAD='
    git log --oneline -1
  " 2>&1 || {
    echo "ERROR=pull_failed"
    return 1
  }

  # Step 3: Build all services in a single SSH session
  # (Previously opened 2 SSH calls per service — now 1 call total)
  echo "STEP=build"

  # Generate the build script to run on server
  local BUILD_SCRIPT="set -e; cd '$WORK_DIR/src'"
  for svc in "${services[@]}"; do
    # Each service: resolve image tag from compose, then build
    case "$svc" in
      api-server)
        BUILD_SCRIPT="$BUILD_SCRIPT
echo 'STEP=build:api-server'
TAG=\$(grep -oP 'collov/vi-agent-api-server:\K[^ ]+' '$WORK_DIR/docker-compose.yml' 2>/dev/null || echo 'local-build')
cd '$WORK_DIR/src'
rm -rf api-server/shared_skills/document-scanner api-server/shared_skills/recipe-analyzer api-server/shared_skills/style-advisor 2>/dev/null || true
cp -r nanoclaw/data/shared/skills/* api-server/shared_skills/ 2>/dev/null || true
cd api-server
docker build $DOCKER_BUILD_EXTRA -t collov/vi-agent-api-server:\$TAG .
echo 'BUILT=api-server'"
        ;;
      frontend)
        BUILD_SCRIPT="$BUILD_SCRIPT
echo 'STEP=build:frontend'
TAG=\$(grep -oP 'collov/vi-agent-frontend:\K[^ ]+' '$WORK_DIR/docker-compose.yml' 2>/dev/null || echo 'local-build')
cd '$WORK_DIR/src/frontend'
set -a; source '$WORK_DIR/.env' 2>/dev/null || true; set +a
docker build $DOCKER_BUILD_EXTRA \
  --build-arg VITE_API_URL= \
  --build-arg VITE_FIREBASE_API_KEY=\${VITE_FIREBASE_API_KEY:-} \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=\${VITE_FIREBASE_AUTH_DOMAIN:-} \
  --build-arg VITE_FIREBASE_PROJECT_ID=\${VITE_FIREBASE_PROJECT_ID:-} \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=\${VITE_FIREBASE_STORAGE_BUCKET:-} \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=\${VITE_FIREBASE_MESSAGING_SENDER_ID:-} \
  --build-arg VITE_FIREBASE_APP_ID=\${VITE_FIREBASE_APP_ID:-} \
  --build-arg VITE_FIREBASE_PACKAGE_NAME=\${VITE_FIREBASE_PACKAGE_NAME:-com.viapp.web} \
  -t collov/vi-agent-frontend:\$TAG .
echo 'BUILT=frontend'"
        ;;
      nanoclaw)
        BUILD_SCRIPT="$BUILD_SCRIPT
echo 'STEP=build:nanoclaw'
TAG=\$(grep -oP 'collov/vi-agent-nanoclaw:\K[^ ]+' '$WORK_DIR/docker-compose.yml' 2>/dev/null || echo 'local-build')
cd '$WORK_DIR/src/nanoclaw'
docker build $DOCKER_BUILD_EXTRA -t collov/vi-agent-nanoclaw:\$TAG .
echo 'BUILT=nanoclaw'"
        ;;
      vi-realtime)
        BUILD_SCRIPT="$BUILD_SCRIPT
echo 'STEP=build:vi-realtime'
TAG=\$(grep -oP 'collov/vi-agent-realtime:\K[^ ]+' '$WORK_DIR/docker-compose.yml' 2>/dev/null || echo 'local-build')
cd '$WORK_DIR/src/realtime'
docker build $DOCKER_BUILD_EXTRA -t collov/vi-agent-realtime:\$TAG .
echo 'BUILT=vi-realtime'"
        ;;
      *)
        echo "SKIP=$svc (unknown service)"
        ;;
    esac
  done

  ssh_cmd "$BUILD_SCRIPT" 2>&1 || {
    echo "ERROR=build_failed"
    return 1
  }

  # Step 4: Pre-flight check + Restart + health check in a single SSH session
  echo "STEP=restart"
  ssh_cmd "
    cd '$WORK_DIR'

    # Pre-flight: docker-compose.yml must exist (generated by /dev GitHub Actions)
    if [ ! -f docker-compose.yml ]; then
      echo 'ERROR=no_compose'
      echo 'docker-compose.yml not found in $WORK_DIR.'
      echo 'Run /dev to deploy once via GitHub Actions first — it generates the instance compose file.'
      exit 1
    fi

    # Pre-flight: .env must be readable (fix group permission if needed)
    if [ -f .env ] && [ ! -r .env ]; then
      echo 'FIXING .env permission (adding group read)'
      chmod g+r .env 2>/dev/null || sudo chmod g+r .env
    fi

    docker compose up -d --build --force-recreate ${services[*]}
    echo 'STEP=health'
    for i in \$(seq 1 20); do
      if curl -sf 'http://localhost:$API_PORT/health' > /dev/null 2>&1; then
        echo 'HEALTH=ok'
        exit 0
      fi
      sleep 3
    done
    echo 'HEALTH=timeout'
    docker compose logs --tail=20 api-server 2>&1 || true
  " 2>&1

  # Output
  echo ""
  echo "DEPLOY_COMPLETE"
  echo "FRONTEND_HTTP=http://$SERVER_IP:$FRONTEND_PORT"
  echo "FRONTEND_HTTPS=https://$SERVER_IP:$FRONTEND_HTTPS_PORT"
  echo "API=http://$SERVER_IP:$API_PORT"
  echo "NANOCLAW=http://$SERVER_IP:$NANOCLAW_PORT"
}

# ── Main ────────────────────────────────────────────────────────────────────
ACTION="${1:-deploy}"
shift || true

case "$ACTION" in
  deploy)  cmd_deploy "$@" ;;
  status)  cmd_status ;;
  logs)    cmd_logs "$@" ;;
  restart) cmd_restart "$@" ;;
  config)  cmd_config ;;
  *)
    echo "Usage: $0 {deploy|status|logs|restart|config} [args...]" >&2
    exit 1
    ;;
esac
