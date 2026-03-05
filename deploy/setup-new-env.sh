#!/bin/bash
# VI Agent — Bootstrap a fresh Ubuntu VM for staging/prod deployment
# Usage:
#   ENV=staging ssh user@vm 'bash -s' < deploy/setup-new-env.sh
#   ENV=prod    ssh user@vm 'bash -s' < deploy/setup-new-env.sh

set -e

ENV="${ENV:-staging}"
APP_DIR="/opt/vi-agent"
REPO_URL="https://github.com/flair-home-stylist/vi_agent.git"

echo "=== VI Agent — ${ENV} Environment Setup ==="
echo ""

# --- 1. System update ---
echo "[1/6] Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw

# --- 2. Install Docker + Compose plugin ---
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    echo "Docker installed."
else
    echo "Docker already installed, skipping."
fi

if ! docker compose version &> /dev/null; then
    sudo apt-get install -y docker-compose-plugin
fi

# Add current user to docker group (takes effect on next login)
sudo usermod -aG docker "$USER"

# --- 3. Create app directory structure ---
echo "[3/6] Creating app directories..."
sudo mkdir -p "${APP_DIR}"/{ssl,data,logs}
sudo chown -R "$USER:$USER" "${APP_DIR}"

# --- 4. Clone repo and symlink compose file ---
echo "[4/6] Setting up project files..."
if [ ! -d "${APP_DIR}/repo" ]; then
    echo "  Cloning repository..."
    git clone "${REPO_URL}" "${APP_DIR}/repo"
else
    echo "  Repo exists, pulling latest..."
    cd "${APP_DIR}/repo" && git pull || true
fi

# Symlink the environment-specific compose file
COMPOSE_SRC="${APP_DIR}/repo/deploy/docker-compose.${ENV}.yml"
COMPOSE_DST="${APP_DIR}/docker-compose.${ENV}.yml"
if [ -f "$COMPOSE_SRC" ]; then
    ln -sf "$COMPOSE_SRC" "$COMPOSE_DST"
    echo "  Linked docker-compose.${ENV}.yml"
else
    echo "  WARNING: ${COMPOSE_SRC} not found!"
fi

# --- 5. Setup .env ---
echo "[5/6] Setting up environment config..."
if [ ! -f "${APP_DIR}/.env" ]; then
    ENV_EXAMPLE="${APP_DIR}/repo/deploy/env.${ENV}.example"
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "${APP_DIR}/.env"
        chmod 600 "${APP_DIR}/.env"
        echo "  Copied env.${ENV}.example -> .env (edit before starting!)"
    else
        echo "  WARNING: No env.${ENV}.example found. Create .env manually."
    fi
else
    echo "  .env already exists, skipping."
fi

# --- 6. Configure firewall ---
echo "[6/6] Configuring UFW firewall..."
sudo ufw allow OpenSSH 2>/dev/null || true
sudo ufw allow 80/tcp 2>/dev/null || true
sudo ufw allow 443/tcp 2>/dev/null || true
echo "y" | sudo ufw enable 2>/dev/null || true

echo ""
echo "=== Setup Complete (${ENV}) ==="
echo ""
echo "Next steps:"
echo "  1. Log out and back in (for docker group to take effect)"
echo "  2. Edit .env:             nano ${APP_DIR}/.env"
echo "     - Set all API keys (LiveKit, Gemini, Anthropic)"
if [ "$ENV" = "staging" ]; then
echo "     - Set strong POSTGRES_PASSWORD and REDIS_PASSWORD"
else
echo "     - Set DB_HOST, REDIS_HOST from Terraform outputs"
echo "     - Set DB_PASSWORD, REDIS_AUTH from Terraform"
fi
echo "     - Set JWT_SECRET, INTERNAL_API_TOKEN"
echo "  3. Setup SSL:             Place cert.pem + key.pem in ${APP_DIR}/ssl/"
echo "  4. Deploy:"
echo "     cd ${APP_DIR}"
echo "     docker compose -f docker-compose.${ENV}.yml up -d"
echo ""
