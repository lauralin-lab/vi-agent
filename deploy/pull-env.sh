#!/bin/bash
# Pull secrets from GCP Secret Manager → generate .env → start services
# Runs ON the VM. No secrets in git, no manual .env editing.
#
# Usage:
#   ENV=prod  ./pull-env.sh          # pull + generate .env
#   ENV=prod  ./pull-env.sh --start  # pull + generate .env + docker compose up
set -euo pipefail

ENV="${ENV:?ERROR: Set ENV=staging or ENV=prod}"
PROJECT="excellent-nexus-488404-c8"
APP_DIR="/opt/vi-agent"
ENV_FILE="${APP_DIR}/.env"
COMPOSE_FILE="${APP_DIR}/docker-compose.${ENV}.yml"

# Secret name → .env variable mapping
declare -A SECRET_MAP

if [ "$ENV" = "prod" ]; then
  SECRET_MAP=(
    ["vi-agent-prod-db-password"]="DB_PASSWORD"
    ["vi-agent-prod-db-host"]="DB_HOST"
    ["vi-agent-prod-redis-auth"]="REDIS_AUTH"
    ["vi-agent-prod-redis-host"]="REDIS_HOST"
    ["vi-agent-prod-jwt-secret"]="JWT_SECRET"
    ["vi-agent-prod-internal-api-token"]="INTERNAL_API_TOKEN"
    ["vi-agent-prod-livekit-url"]="LIVEKIT_URL"
    ["vi-agent-prod-livekit-api-key"]="LIVEKIT_API_KEY"
    ["vi-agent-prod-livekit-api-secret"]="LIVEKIT_API_SECRET"
    ["vi-agent-prod-google-api-key"]="GOOGLE_API_KEY"
    ["vi-agent-prod-anthropic-api-key"]="ANTHROPIC_API_KEY"
    ["vi-agent-prod-firebase-enabled"]="FIREBASE_ENABLED"
    ["vi-agent-prod-firebase-projects"]="FIREBASE_PROJECTS"
  )
elif [ "$ENV" = "staging" ]; then
  SECRET_MAP=(
    ["vi-agent-staging-postgres-password"]="POSTGRES_PASSWORD"
    ["vi-agent-staging-redis-password"]="REDIS_PASSWORD"
    ["vi-agent-staging-jwt-secret"]="JWT_SECRET"
    ["vi-agent-staging-internal-api-token"]="INTERNAL_API_TOKEN"
    ["vi-agent-staging-livekit-url"]="LIVEKIT_URL"
    ["vi-agent-staging-livekit-api-key"]="LIVEKIT_API_KEY"
    ["vi-agent-staging-livekit-api-secret"]="LIVEKIT_API_SECRET"
    ["vi-agent-staging-google-api-key"]="GOOGLE_API_KEY"
    ["vi-agent-staging-anthropic-api-key"]="ANTHROPIC_API_KEY"
    ["vi-agent-staging-firebase-enabled"]="FIREBASE_ENABLED"
    ["vi-agent-staging-firebase-projects"]="FIREBASE_PROJECTS"
  )
fi

echo "=== Pulling secrets for ${ENV} ==="

# Pull each secret and build .env
: > "${ENV_FILE}.tmp"  # empty temp file

MISSING=0
for secret_name in "${!SECRET_MAP[@]}"; do
  var_name="${SECRET_MAP[$secret_name]}"
  value=$(gcloud secrets versions access latest --secret="$secret_name" --project="$PROJECT" 2>/dev/null || echo "")
  if [ -z "$value" ]; then
    echo "  WARN: ${secret_name} → empty (not set yet)"
    MISSING=$((MISSING + 1))
  else
    echo "  OK:   ${secret_name} → ${var_name}"
  fi
  echo "${var_name}=${value}" >> "${ENV_FILE}.tmp"
done

# Add static config
if [ "$ENV" = "prod" ]; then
  cat >> "${ENV_FILE}.tmp" << EOF
DB_USER=vi_agent
DB_NAME=vi_agent
REDIS_PORT=6379
API_BASE_URL=http://34.136.53.132:8000
CORS_ORIGINS=http://34.136.53.132,https://34.136.53.132
IMAGE_TAG=${IMAGE_TAG:-latest}
EOF
elif [ "$ENV" = "staging" ]; then
  cat >> "${ENV_FILE}.tmp" << EOF
API_BASE_URL=http://34.68.86.220:8000
CORS_ORIGINS=http://34.68.86.220,https://34.68.86.220
IMAGE_TAG=${IMAGE_TAG:-latest}
EOF
fi

# Atomic replace
mv "${ENV_FILE}.tmp" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

echo ""
echo "=== .env generated (${MISSING} secrets still empty) ==="

if [ "${1:-}" = "--start" ]; then
  if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: ${COMPOSE_FILE} not found"
    exit 1
  fi
  echo "Starting services..."
  cd "${APP_DIR}"
  docker compose -f "$COMPOSE_FILE" pull
  docker compose -f "$COMPOSE_FILE" up -d
  echo "=== Services started ==="
  docker compose -f "$COMPOSE_FILE" ps
fi
