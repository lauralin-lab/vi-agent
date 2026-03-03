#!/bin/bash
# dev.sh — /dev skill driver script
# Handles: local config persistence, SSH setup, pre-flight, template sync, .env upload, deploy
#
# Usage: bash deploy/dev-environment/dev.sh [OPTIONS]
#
# Config options (read/write .dev.local):
#   --show-config              Print current config and exit
#   --save-config              Save --name and/or --key to .dev.local and exit
#   --name  NAME               Developer team handle (e.g. casey, alice)
#   --key   PATH               SSH key path (auto-detected if omitted)
#
# Version options:
#   --show-versions            List Docker Hub tags + local git tags + server disk/image usage
#
# Cleanup options:
#   --cleanup                  Prune old Docker Hub tags + git gc on server clone
#   --keep  N                  Number of most-recent tags to keep per service (default: 5)
#   --dry-run                  Show what --cleanup would delete, without deleting
#
# Deploy options:
#   --tag   TAG                Image tag to deploy (required for --mode image)
#   --mode  image|build|head   Deployment mode (default: image)
#                                image = pull from Docker Hub (fast)
#                                build = checkout git tag on server + build + push + deploy
#                                head  = build from current HEAD (no tag needed)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/../..")"
CONFIG_FILE="$REPO_ROOT/.dev.local"

SERVER_IP="34.172.9.61"
SERVER_USER="liyasong"
DOCKER_ORG="collov"
SERVICES=(api-server frontend gateway realtime)

# ----------- Load saved config -----------
DEV_NAME=""
SSH_KEY=""
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

# ----------- Parse args -----------
SHOW_VERSIONS=false
SHOW_CONFIG=false
SAVE_CONFIG=false
CLEANUP=false
KEEP_N=5
DRY_RUN=false
IMAGE_TAG=""
BUILD_MODE="image"

while [[ $# -gt 0 ]]; do
  case $1 in
    --name)          DEV_NAME="$2";     shift 2 ;;
    --key)           SSH_KEY="$2";      shift 2 ;;
    --tag)           IMAGE_TAG="$2";    shift 2 ;;
    --mode)          BUILD_MODE="$2";   shift 2 ;;
    --show-versions) SHOW_VERSIONS=true; shift ;;
    --show-config)   SHOW_CONFIG=true;  shift ;;
    --save-config)   SAVE_CONFIG=true;  shift ;;
    --cleanup)       CLEANUP=true;      shift ;;
    --keep)          KEEP_N="$2";       shift 2 ;;
    --dry-run)       DRY_RUN=true;      shift ;;
    --help|-h)       grep '^# ' "$0" | cut -c3-; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ----------- SSH key auto-detection -----------
if [ -z "$SSH_KEY" ]; then
  for key in ~/.ssh/gcp_ssh_key ~/.ssh/id_ed25519 ~/.ssh/id_rsa ~/.ssh/id_ecdsa; do
    if [ -f "$key" ]; then
      SSH_KEY="$key"
      break
    fi
  done
fi

# ----------- --show-config -----------
if $SHOW_CONFIG; then
  if [ -z "$DEV_NAME" ]; then
    echo "STATUS=missing-name"
    echo "CONFIG_FILE=$CONFIG_FILE"
    echo "SSH_KEY=${SSH_KEY:-<not found>}"
  else
    echo "STATUS=ok"
    echo "DEV_NAME=$DEV_NAME"
    echo "SSH_KEY=${SSH_KEY:-<not found>}"
    echo "SERVER=${SERVER_USER}@${SERVER_IP}"
    echo "CONFIG_FILE=$CONFIG_FILE"
  fi
  exit 0
fi

# ----------- --save-config -----------
if $SAVE_CONFIG; then
  if [ -z "$DEV_NAME" ]; then
    echo "ERROR: --save-config requires --name NAME" >&2
    exit 1
  fi
  cat > "$CONFIG_FILE" << EOF
# Dev environment local config — NOT committed to git (covered by *.local in .gitignore)
DEV_NAME=$DEV_NAME
SSH_KEY=${SSH_KEY:-}
EOF
  echo "Saved to $CONFIG_FILE"
  echo "  DEV_NAME=$DEV_NAME"
  echo "  SSH_KEY=${SSH_KEY:-<not set>}"
  exit 0
fi

# ----------- --show-versions -----------
if $SHOW_VERSIONS; then
  echo "=== Docker Hub tags (${DOCKER_ORG}/vi-agent-api-server) ==="
  curl -s "https://hub.docker.com/v2/repositories/${DOCKER_ORG}/vi-agent-api-server/tags/?page_size=15&ordering=last_updated" \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
results = data.get('results', [])
if not results:
    print('  (no tags found — need to build first)')
for t in results:
    size_mb = t.get('full_size', 0) // 1048576
    print(f\"  {t['name']:40s} updated={t['last_updated'][:10]}  size={size_mb}MB\")
" 2>/dev/null || echo "  (could not reach Docker Hub)"

  echo ""
  echo "=== Local git tags (most recent first) ==="
  git -C "$REPO_ROOT" tag --sort=-creatordate | head -10 \
    | while read -r tag; do
        commit=$(git -C "$REPO_ROOT" rev-list -n1 "$tag" 2>/dev/null | head -c 7)
        date=$(git -C "$REPO_ROOT" log -1 --format="%ad" --date=short "$tag" 2>/dev/null)
        printf "  %-40s commit=%s  date=%s\n" "$tag" "$commit" "$date"
      done

  # Server disk/image usage — SSH if key is available
  if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
    echo ""
    echo "=== Server disk + Docker usage (${SERVER_USER}@${SERVER_IP}) ==="
    _SHOW_CMD="ssh -A -i $SSH_KEY -o ConnectTimeout=5 ${SERVER_USER}@${SERVER_IP}"
    if $_SHOW_CMD "echo ok" > /dev/null 2>&1; then
      $_SHOW_CMD "
        echo '--- Disk ---'
        df -h / | tail -1 | awk '{print \"  Used: \"\$3\" / \"\$2\" (\"\$5\" full)  Available: \"\$4}'
        echo '--- Docker images ---'
        docker system df 2>/dev/null | grep -v '^$' | sed 's/^/  /' || echo '  (docker not accessible)'
        echo '--- Active instances ---'
        python3 -c \"
import json
try:
  r = json.load(open('/opt/vi-agent/registry.json'))
  instances = r.get('instances', {})
  if not instances:
    print('  (no instances in registry)')
  for name, info in instances.items():
    tag = info.get('image_tag', 'unknown')
    deployed = info.get('deployed_at', 'unknown')[:10]
    print(f'  {name:15s}  tag={tag}  deployed={deployed}')
except:
  print('  (could not read registry)')
\" 2>/dev/null
      " 2>/dev/null || echo "  (SSH error fetching server stats)"
    else
      echo "  (SSH connection failed — skipping server stats)"
    fi
  else
    echo ""
    echo "Note: To show server disk/image usage, configure SSH key:"
    echo "  bash deploy/dev-environment/dev.sh --save-config --name YOUR_HANDLE"
  fi

  echo ""
  echo "Tip: Use '--cleanup --keep N' to prune old Docker Hub tags (keeps N most recent per service)."
  exit 0
fi

# ----------- --cleanup -----------
if $CLEANUP; then
  echo "=== Dev environment cleanup ==="
  echo "  Keep: $KEEP_N most recent tags per service"
  if $DRY_RUN; then echo "  Mode: DRY RUN (no changes)"; else echo "  Mode: LIVE"; fi
  echo ""

  # Fetch all tags for the primary service (api-server) — all services share same tag names
  ALL_TAGS=$(curl -s "https://hub.docker.com/v2/repositories/${DOCKER_ORG}/vi-agent-api-server/tags/?page_size=100&ordering=last_updated" \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
# Return tags sorted newest first (already ordered by last_updated desc)
tags = [t['name'] for t in data.get('results', [])]
print('\n'.join(tags))
" 2>/dev/null)

  if [ -z "$ALL_TAGS" ]; then
    echo "Could not fetch Docker Hub tags (network error or no tags)." >&2
    exit 1
  fi

  TAGS_TO_KEEP=$(echo "$ALL_TAGS" | head -n "$KEEP_N")
  TAGS_TO_DELETE=$(echo "$ALL_TAGS" | tail -n +$((KEEP_N + 1)))

  echo "Tags to KEEP ($KEEP_N most recent):"
  echo "$TAGS_TO_KEEP" | sed 's/^/  ✅ /'
  echo ""

  if [ -z "$TAGS_TO_DELETE" ]; then
    echo "Nothing to delete — only $KEEP_N or fewer tags exist."
  else
    echo "Tags to DELETE:"
    echo "$TAGS_TO_DELETE" | sed 's/^/  🗑  /'
    echo ""

    if $DRY_RUN; then
      echo "DRY RUN: no changes made."
    else
      # Authenticate with Docker Hub to get deletion token
      # Requires DOCKER_HUB_TOKEN env var or will attempt via ~/.docker/config.json credentials
      if [ -n "${DOCKER_HUB_TOKEN:-}" ]; then
        HUB_TOKEN="$DOCKER_HUB_TOKEN"
      elif [ -f ~/.docker/config.json ]; then
        # Try to extract token from docker config (login already done)
        HUB_TOKEN=$(python3 -c "
import json, base64
cfg = json.load(open('$HOME/.docker/config.json'))
auths = cfg.get('auths', {})
hub = auths.get('https://index.docker.io/v1/', {})
if 'auth' in hub:
    creds = base64.b64decode(hub['auth']).decode()
    user, pwd = creds.split(':', 1)
    import urllib.request, urllib.parse
    data = json.dumps({'username': user, 'password': pwd}).encode()
    req = urllib.request.Request('https://hub.docker.com/v2/users/login/',
        data=data, headers={'Content-Type': 'application/json'})
    resp = json.loads(urllib.request.urlopen(req).read())
    print(resp.get('token', ''))
" 2>/dev/null || echo "")
      fi

      if [ -z "$HUB_TOKEN" ]; then
        echo "ERROR: Cannot authenticate with Docker Hub." >&2
        echo "  Option 1: Set DOCKER_HUB_TOKEN env var (personal access token)" >&2
        echo "  Option 2: Run 'docker login' first to cache credentials in ~/.docker/config.json" >&2
        echo "  Option 3: Delete tags manually at https://hub.docker.com/r/${DOCKER_ORG}/vi-agent-api-server/tags" >&2
        exit 1
      fi

      DELETED=0
      FAILED=0
      while IFS= read -r tag; do
        [ -z "$tag" ] && continue
        for svc in "${SERVICES[@]}"; do
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
            "https://hub.docker.com/v2/repositories/${DOCKER_ORG}/vi-agent-${svc}/tags/${tag}/" \
            -H "Authorization: JWT ${HUB_TOKEN}")
          if [ "$HTTP_STATUS" = "204" ] || [ "$HTTP_STATUS" = "200" ]; then
            echo "  Deleted: ${DOCKER_ORG}/vi-agent-${svc}:${tag}"
            DELETED=$((DELETED + 1))
          else
            echo "  WARN: Could not delete ${DOCKER_ORG}/vi-agent-${svc}:${tag} (HTTP $HTTP_STATUS)"
            FAILED=$((FAILED + 1))
          fi
        done
      done <<< "$TAGS_TO_DELETE"

      echo ""
      echo "Deleted: $DELETED tag(s) | Failed: $FAILED"
    fi
  fi

  # Server-side cleanup (git gc) — if SSH key available and DEV_NAME set
  if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ] && [ -n "$DEV_NAME" ]; then
    echo ""
    echo "--- Server-side cleanup (${SERVER_USER}@${SERVER_IP}) ---"
    _CLEANUP_SSH="ssh -A -i $SSH_KEY -o ConnectTimeout=5 ${SERVER_USER}@${SERVER_IP}"
    if $_CLEANUP_SSH "echo ok" > /dev/null 2>&1; then
      if $DRY_RUN; then
        echo "DRY RUN: would run 'git gc' on ~/vi-agent-repos/$DEV_NAME/"
        echo "DRY RUN: would run 'docker image prune -f'"
      else
        $_CLEANUP_SSH "
          if [ -d ~/vi-agent-repos/$DEV_NAME/.git ]; then
            echo 'Running git gc on ~/vi-agent-repos/$DEV_NAME/ ...'
            git -C ~/vi-agent-repos/$DEV_NAME gc --auto --quiet
            echo 'git gc done.'
          else
            echo '(no git clone at ~/vi-agent-repos/$DEV_NAME/ — skipping)'
          fi
          echo 'Running docker image prune...'
          docker image prune -f 2>/dev/null | tail -1
        " 2>/dev/null || echo "  (server cleanup error)"
      fi
    else
      echo "  (SSH connection failed — skipping server cleanup)"
    fi
  fi

  exit 0
fi

# ----------- Validate required fields -----------
if [ -z "$DEV_NAME" ]; then
  echo "ERROR: DEV_NAME not set." >&2
  echo "  Run: bash deploy/dev-environment/dev.sh --show-config" >&2
  echo "  Then: bash deploy/dev-environment/dev.sh --save-config --name YOUR_HANDLE" >&2
  exit 1
fi

if [ -z "$SSH_KEY" ]; then
  echo "ERROR: No SSH key found. Pass --key /path/to/key or set in $CONFIG_FILE" >&2
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "ERROR: SSH key file not found: $SSH_KEY" >&2
  exit 1
fi

SSH_CMD="ssh -A -i $SSH_KEY ${SERVER_USER}@${SERVER_IP}"
SCP_CMD="scp -i $SSH_KEY"

# ----------- Validate mode/tag combo -----------
if [ "$BUILD_MODE" = "image" ] && [ -z "$IMAGE_TAG" ]; then
  echo "ERROR: --mode image requires --tag TAG." >&2
  echo "  Run: bash deploy/dev-environment/dev.sh --show-versions  to see available tags" >&2
  exit 1
fi

# For head mode, generate a tag from current commit
if [ "$BUILD_MODE" = "head" ]; then
  COMMIT=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
  IMAGE_TAG="head-$(date +%Y%m%d)-${COMMIT}"
  BUILD_MODE_SERVER="build"
elif [ "$BUILD_MODE" = "build" ]; then
  BUILD_MODE_SERVER="build"
else
  BUILD_MODE_SERVER="image"
fi

# ----------- Save config (persist resolved values) -----------
cat > "$CONFIG_FILE" << EOF
# Dev environment local config — NOT committed to git (covered by *.local in .gitignore)
DEV_NAME=$DEV_NAME
SSH_KEY=$SSH_KEY
EOF

echo "=== /dev Deployment ==="
echo "  Developer: $DEV_NAME"
echo "  Mode:      $BUILD_MODE"
echo "  Tag:       ${IMAGE_TAG:-latest}"
echo "  Server:    ${SERVER_USER}@${SERVER_IP}"
echo "  SSH key:   $SSH_KEY"
echo ""

# ----------- Test SSH connection -----------
echo "--- Testing SSH connection ---"
if ! $SSH_CMD -o ConnectTimeout=5 "echo ok" > /dev/null 2>&1; then
  echo "ERROR: SSH connection failed." >&2
  echo "  Server: ${SERVER_USER}@${SERVER_IP}" >&2
  echo "  Key:    $SSH_KEY" >&2
  echo "  → Your SSH key may not be added to the server. Contact admin (liyasong)." >&2
  exit 1
fi
echo "SSH OK"

# ----------- Pre-flight check -----------
echo ""
echo "--- Pre-flight check ---"
DIRTY=$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null || echo "")
UNPUSHED=$(git -C "$REPO_ROOT" log --oneline '@{upstream}..HEAD' 2>/dev/null || echo "")

if [ -n "$DIRTY" ]; then
  echo "WARNING: Uncommitted changes detected:"
  echo "$DIRTY" | head -5
fi
if [ -n "$UNPUSHED" ]; then
  echo "WARNING: Unpushed commits:"
  echo "$UNPUSHED"
fi
if [ -z "$DIRTY" ] && [ -z "$UNPUSHED" ]; then
  echo "Working tree clean and in sync with remote."
fi

# ----------- Sync templates to server -----------
echo ""
echo "--- Syncing deploy templates to server ---"
$SCP_CMD "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR"/*.tpl \
  "${SERVER_USER}@${SERVER_IP}:/opt/vi-agent/templates/" 2>&1
$SSH_CMD "chmod +x /opt/vi-agent/templates/*.sh"
echo "Templates synced."

# ----------- Read and upload API keys from local .env -----------
echo ""
echo "--- Reading API keys from local .env ---"
ENV_FILE="$REPO_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.example and fill in API keys." >&2
  exit 1
fi

REQUIRED_KEYS=(LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET GOOGLE_API_KEY ANTHROPIC_API_KEY GCS_BUCKET)
MISSING=()
for key in "${REQUIRED_KEYS[@]}"; do
  val=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
  if [ -z "$val" ] || echo "$val" | grep -qiE "^(your-|change-|xxx|<)"; then
    MISSING+=("$key")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Missing or placeholder values in .env:" >&2
  printf '  %s\n' "${MISSING[@]}" >&2
  exit 1
fi
echo "${#REQUIRED_KEYS[@]} API keys found."

# Extract keys to temp file and upload to server
TMP_ENV=$(mktemp)
grep -E "^(LIVEKIT_URL|LIVEKIT_API_KEY|LIVEKIT_API_SECRET|GOOGLE_API_KEY|ANTHROPIC_API_KEY|GCS_BUCKET)=" "$ENV_FILE" > "$TMP_ENV"
$SSH_CMD "mkdir -p /opt/vi-agent/instances/$DEV_NAME"
$SCP_CMD "$TMP_ENV" "${SERVER_USER}@${SERVER_IP}:/opt/vi-agent/instances/$DEV_NAME/.env.keys"
rm "$TMP_ENV"

# Merge keys into instance .env on server (create or update)
$SSH_CMD "
  ENV_FILE=/opt/vi-agent/instances/$DEV_NAME/.env
  KEYS_FILE=/opt/vi-agent/instances/$DEV_NAME/.env.keys
  if [ -f \"\$ENV_FILE\" ]; then
    # Update: replace existing keys, append new ones
    while IFS= read -r line; do
      KEY=\$(echo \"\$line\" | cut -d= -f1)
      sed -i \"/^\${KEY}=/d\" \"\$ENV_FILE\"
      echo \"\$line\" >> \"\$ENV_FILE\"
    done < \"\$KEYS_FILE\"
  else
    mv \"\$KEYS_FILE\" \"\$ENV_FILE\"
    KEYS_FILE=/dev/null
  fi
  [ -f \"\$KEYS_FILE\" ] && rm \"\$KEYS_FILE\" || true
"
echo "API keys uploaded."

# ----------- Build on server (if needed) -----------
if [ "$BUILD_MODE" = "build" ] || [ "$BUILD_MODE" = "head" ]; then
  echo ""
  echo "--- Building images on server ---"
  echo "This may take several minutes..."

  $SSH_CMD "
    set -e
    REPO_DIR=~/vi-agent-repos/$DEV_NAME
    if [ ! -d \"\$REPO_DIR/.git\" ]; then
      echo 'Cloning repository...'
      git clone git@github.com:flair-home-stylist/vi_agent.git \"\$REPO_DIR\"
    fi
    REPO_DIR=\$REPO_DIR bash /opt/vi-agent/templates/build-and-push.sh '$IMAGE_TAG'
  "
fi

# ----------- Deploy instance -----------
echo ""
echo "--- Deploying instance ---"
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
$SSH_CMD "bash /opt/vi-agent/templates/create-instance.sh \
  '$DEV_NAME' '$BRANCH' 'HEAD' '$BUILD_MODE_SERVER' '$IMAGE_TAG'"

echo ""
echo "=== Deployment complete ==="
