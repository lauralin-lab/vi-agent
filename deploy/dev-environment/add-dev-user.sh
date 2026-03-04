#!/bin/bash
# add-dev-user.sh — Create a new Linux user for dev environment access
#
# Run this ON THE SERVER as root/sudo to provision a new team member.
#
# Usage: sudo bash add-dev-user.sh <username> <ssh_public_key>
#
# What it does:
#   1. Creates Linux user with home directory
#   2. Adds user to vi-agent group (shared access to /opt/vi-agent/)
#   3. Adds user to docker group (can run docker commands)
#   4. Sets up SSH authorized_keys
#   5. Creates user's vi-agent-repos directory
#
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: sudo bash $0 <username> '<ssh_public_key>'" >&2
  echo "" >&2
  echo "Example:" >&2
  echo "  sudo bash $0 raymond 'ssh-ed25519 AAAA... raymond@laptop'" >&2
  exit 1
fi

USERNAME="$1"
SSH_PUB_KEY="$2"

# --- 1. Create vi-agent group if it doesn't exist ---
if ! getent group vi-agent > /dev/null 2>&1; then
  groupadd vi-agent
  echo "Created group: vi-agent"
fi

# --- 2. Create user ---
if id "$USERNAME" > /dev/null 2>&1; then
  echo "User '$USERNAME' already exists. Updating groups..."
  usermod -aG vi-agent,docker "$USERNAME"
else
  useradd -m -s /bin/bash -G vi-agent,docker "$USERNAME"
  echo "Created user: $USERNAME"
fi

# --- 3. Setup SSH ---
SSH_DIR="/home/$USERNAME/.ssh"
mkdir -p "$SSH_DIR"
AUTHKEYS="$SSH_DIR/authorized_keys"

# Add key if not already present
if [ -f "$AUTHKEYS" ] && grep -qF "$SSH_PUB_KEY" "$AUTHKEYS"; then
  echo "SSH key already in authorized_keys"
else
  echo "$SSH_PUB_KEY" >> "$AUTHKEYS"
  echo "Added SSH public key"
fi

chmod 700 "$SSH_DIR"
chmod 600 "$AUTHKEYS"
chown -R "$USERNAME:$USERNAME" "$SSH_DIR"

# --- 4. Setup /opt/vi-agent/ permissions ---
# Ensure vi-agent group owns shared directories
chgrp -R vi-agent /opt/vi-agent/templates/ 2>/dev/null || true
chmod -R g+rwX /opt/vi-agent/templates/ 2>/dev/null || true

# Set setgid on templates so new files inherit group
chmod g+s /opt/vi-agent/templates/ 2>/dev/null || true

# User's instance directory will be created by create-instance.sh
# but ensure the instances parent dir is group-writable
mkdir -p /opt/vi-agent/instances/
chgrp vi-agent /opt/vi-agent/instances/
chmod g+rwx /opt/vi-agent/instances/
chmod g+s /opt/vi-agent/instances/

# Registry needs group write access
touch /opt/vi-agent/registry.json
chgrp vi-agent /opt/vi-agent/registry.json
chmod g+rw /opt/vi-agent/registry.json

# --- 5. Create user's repos directory ---
REPOS_DIR="/home/$USERNAME/vi-agent-repos"
mkdir -p "$REPOS_DIR"
chown "$USERNAME:$USERNAME" "$REPOS_DIR"

echo ""
echo "=== User '$USERNAME' provisioned ==="
echo "  Home:      /home/$USERNAME"
echo "  Groups:    vi-agent, docker"
echo "  SSH:       $AUTHKEYS"
echo "  Repos:     $REPOS_DIR"
echo ""
echo "The user can now SSH with:"
echo "  ssh -i <their_key> $USERNAME@$(hostname -I | awk '{print $1}')"
echo ""
echo "They should set SERVER_USER in their .dev.local:"
echo "  SERVER_USER=$USERNAME"
