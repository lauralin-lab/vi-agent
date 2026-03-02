#!/bin/bash
# VI Agent Core — GCE VM Setup Script
# Run this on a fresh GCE VM (Ubuntu 22.04 or Debian 12)

set -e

echo "=== VI Agent Core — GCE Setup ==="

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. You may need to log out and back in for group changes."
fi

# Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose plugin..."
    sudo apt-get install -y docker-compose-plugin
fi

# Install git
sudo apt-get install -y git curl

# Create app directory
sudo mkdir -p /opt/vi-agent
sudo chown $USER:$USER /opt/vi-agent

# Configure firewall
echo "Configuring firewall rules..."
# Allow HTTP, HTTPS, and LiveKit ports
sudo ufw allow 80/tcp 2>/dev/null || true
sudo ufw allow 443/tcp 2>/dev/null || true
sudo ufw allow 7880/tcp 2>/dev/null || true  # LiveKit

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Clone the repo:  cd /opt/vi-agent && git clone <your-repo-url> ."
echo "  2. Copy .env:       cp .env.example .env && nano .env"
echo "  3. Deploy:          ./deploy/deploy.sh"
echo ""
