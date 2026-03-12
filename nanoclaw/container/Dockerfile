# VI Agent NanoClaw Agent Container
# Supports two modes:
#   ONE-SHOT (default): JSON via stdin → process → exit
#   PERSISTENT (AGENT_MODE=persistent): Task loop via IPC filesystem
#
# Output (one-shot): CARD_OP::{json} markers on stdout + OUTPUT markers
# Output (persistent): CARD_OPs published directly to Redis

FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install claude-code globally
RUN npm install -g @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY agent-runner/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY agent-runner/ ./

# Copy base CLAUDE.md for agent personality
COPY CLAUDE.md /app/CLAUDE.md

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p \
    /workspace/group \
    /workspace/user-data \
    /workspace/skills \
    /workspace/packages \
    /workspace/ipc/tasks \
    /workspace/ipc/results \
    /workspace/media

# Create entrypoint script that supports both modes
# ONE-SHOT: reads stdin, runs once, exits
# PERSISTENT: runs task loop (no stdin), stays alive
# Uses pre-built dist/ from npm run build above — no recompilation needed
RUN cat > /app/entrypoint.sh << 'ENTRY'
#!/bin/bash
set -e

if [ "$AGENT_MODE" = "persistent" ]; then
  # Persistent mode: run task loop (no stdin needed)
  exec node /app/dist/index.js
else
  # One-shot mode: read stdin, process, exit
  cat > /tmp/input.json
  node /app/dist/index.js < /tmp/input.json
fi
ENTRY
RUN chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root)
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user
USER node

# Set working directory
WORKDIR /workspace/group

# Entry point handles both modes
ENTRYPOINT ["/app/entrypoint.sh"]
