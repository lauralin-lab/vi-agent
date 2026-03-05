#!/bin/bash
# VI Agent — Bootstrap a fresh Ubuntu VM for staging/prod deployment
# Usage: ssh user@vm 'bash -s' < deploy/setup-new-env.sh

set -e

echo "=== VI Agent — New Environment Setup ==="
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
sudo mkdir -p /opt/vi-agent/{ssl,data,logs}
sudo chown -R "$USER:$USER" /opt/vi-agent

# --- 4. Clone repo / copy compose files ---
echo "[4/6] Setting up project files..."
if [ ! -f /opt/vi-agent/docker-compose.yml ]; then
    echo "  Cloning repository..."
    git clone https://github.com/flair-home-stylist/vi_agent.git /opt/vi-agent/repo
    # Symlink compose files to app root
    ln -sf /opt/vi-agent/repo/docker-compose.yml /opt/vi-agent/docker-compose.yml
    ln -sf /opt/vi-agent/repo/docker-compose.deploy.yml /opt/vi-agent/docker-compose.deploy.yml
else
    echo "  Compose files already present, skipping clone."
fi

# --- 5. Setup .env ---
echo "[5/6] Setting up environment config..."
if [ ! -f /opt/vi-agent/.env ]; then
    if [ -f /opt/vi-agent/repo/.env.example ]; then
        cp /opt/vi-agent/repo/.env.example /opt/vi-agent/.env
        echo "  Copied .env.example -> .env (edit before starting!)"
    else
        echo "  WARNING: No .env.example found. Create .env manually."
    fi
else
    echo "  .env already exists, skipping."
fi

# --- 6. Configure firewall ---
echo "[6/6] Configuring UFW firewall..."
sudo ufw allow OpenSSH 2>/dev/null || true
sudo ufw allow 80/tcp 2>/dev/null || true
sudo ufw allow 443/tcp 2>/dev/null || true
sudo ufw allow 7880/tcp 2>/dev/null || true  # LiveKit WebRTC
echo "y" | sudo ufw enable 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Log out and back in (for docker group to take effect)"
echo "  2. Log in to Docker Hub:  docker login"
echo "  3. Edit .env:             nano /opt/vi-agent/.env"
echo "     - Set all API keys (LiveKit, Gemini, Anthropic)"
echo "     - Set strong passwords (POSTGRES_PASSWORD, JWT_SECRET, REDIS_PASSWORD)"
echo "     - Set CORS_ORIGINS to your domain"
echo "  4. Setup SSL:             Place cert.pem + key.pem in /opt/vi-agent/ssl/"
echo "  5. Deploy:"
echo "     cd /opt/vi-agent"
echo "     export IMAGE_TAG=<tag-from-ci>"
echo "     docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d"
echo ""
