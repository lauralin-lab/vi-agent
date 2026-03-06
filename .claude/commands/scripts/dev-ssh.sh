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
  ssh -A -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
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

  local services=("$@")
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

  # Step 3: Build each service
  for svc in "${services[@]}"; do
    echo "STEP=build:$svc"

    # Determine image tag from current compose
    local IMAGE_TAG
    IMAGE_TAG=$(ssh_cmd "grep -oP 'collov/vi-agent-${svc}:\K[^ ]+' '$WORK_DIR/docker-compose.yml' 2>/dev/null || echo 'local-build'")
    IMAGE_TAG="${IMAGE_TAG:-local-build}"

    case "$svc" in
      api-server)
        ssh_cmd "
          cd '$WORK_DIR/src'
          rm -rf api-server/shared_skills/document-scanner api-server/shared_skills/recipe-analyzer api-server/shared_skills/style-advisor 2>/dev/null
          cp -r nanoclaw/data/shared/skills/* api-server/shared_skills/ 2>/dev/null || true
          cd api-server
          docker build -t collov/vi-agent-api-server:$IMAGE_TAG .
        " 2>&1
        ;;
      frontend)
        ssh_cmd "
          cd '$WORK_DIR/src/frontend'
          set -a; source '$WORK_DIR/.env' 2>/dev/null; set +a
          docker build \
            --build-arg VITE_API_URL= \
            --build-arg VITE_FIREBASE_API_KEY=\${VITE_FIREBASE_API_KEY:-} \
            --build-arg VITE_FIREBASE_AUTH_DOMAIN=\${VITE_FIREBASE_AUTH_DOMAIN:-} \
            --build-arg VITE_FIREBASE_PROJECT_ID=\${VITE_FIREBASE_PROJECT_ID:-} \
            --build-arg VITE_FIREBASE_STORAGE_BUCKET=\${VITE_FIREBASE_STORAGE_BUCKET:-} \
            --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=\${VITE_FIREBASE_MESSAGING_SENDER_ID:-} \
            --build-arg VITE_FIREBASE_APP_ID=\${VITE_FIREBASE_APP_ID:-} \
            --build-arg VITE_FIREBASE_PACKAGE_NAME=\${VITE_FIREBASE_PACKAGE_NAME:-com.viapp.web} \
            -t collov/vi-agent-frontend:$IMAGE_TAG .
        " 2>&1
        ;;
      nanoclaw)
        ssh_cmd "
          cd '$WORK_DIR/src/nanoclaw'
          docker build -t collov/vi-agent-nanoclaw:$IMAGE_TAG .
        " 2>&1
        ;;
      vi-realtime)
        ssh_cmd "
          cd '$WORK_DIR/src/realtime'
          docker build -t collov/vi-agent-realtime:$IMAGE_TAG .
        " 2>&1
        ;;
      *)
        echo "SKIP=$svc (unknown service)"
        ;;
    esac

    if [ $? -ne 0 ]; then
      echo "ERROR=build_failed:$svc"
      return 1
    fi
    echo "BUILT=$svc"
  done

  # Step 4: Recreate containers
  echo "STEP=restart"
  ssh_cmd "cd '$WORK_DIR' && docker compose up -d --force-recreate ${services[*]}" 2>&1

  # Step 5: Health check
  echo "STEP=health"
  local healthy=false
  for i in $(seq 1 20); do
    if ssh_cmd "curl -sf 'http://localhost:$API_PORT/health' > /dev/null 2>&1"; then
      healthy=true
      break
    fi
    sleep 3
  done

  if $healthy; then
    echo "HEALTH=ok"
  else
    echo "HEALTH=timeout"
    ssh_cmd "cd '$WORK_DIR' && docker compose logs --tail=20 api-server" 2>&1 || true
  fi

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
