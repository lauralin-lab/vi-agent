# VI Agent NanoClaw Agent Container
# Runs Claude Code CLI in isolated container for skill execution.
# Input: JSON via stdin (prompt, userId, taskId, secrets)
# Output: CARD_OP::{json} markers on stdout for card operations
#         ---NANOCLAW_OUTPUT_START/END--- markers for final result

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

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p \
    /workspace/group \
    /workspace/user-data \
    /workspace/skills \
    /workspace/packages \
    /workspace/ipc/messages \
    /workspace/ipc/input

# Create entrypoint script
# Reads JSON from stdin, passes to agent-runner
RUN printf '#!/bin/bash\nset -e\ncd /app && npx tsc --outDir /tmp/dist 2>&1 >&2\nln -s /app/node_modules /tmp/dist/node_modules\nchmod -R a-w /tmp/dist\ncat > /tmp/input.json\nnode /tmp/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership to node user (non-root)
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user
USER node

# Set working directory
WORKDIR /workspace/group

# Entry point reads JSON from stdin
ENTRYPOINT ["/app/entrypoint.sh"]
