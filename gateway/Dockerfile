FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install build essentials for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Create app user and dirs
RUN useradd -m -r -s /bin/bash appuser

WORKDIR /home/appuser/app

# Copy package files first for layer caching
COPY plugin/package.json plugin/package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev 2>/dev/null || npm install

# Copy source code
COPY plugin/ ./

# Set ownership
RUN chown -R appuser:appuser /home/appuser

USER appuser

ENV HOME=/home/appuser
ENV NODE_ENV=production

# Gateway HTTP port (health + Lazy Join)
EXPOSE 18789

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=15s \
  CMD curl -f http://localhost:18789/health || exit 1

# Run standalone gateway (tsx runs TypeScript directly)
CMD ["npx", "tsx", "src/main.ts"]
