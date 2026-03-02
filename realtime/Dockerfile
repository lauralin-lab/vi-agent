# syntax=docker/dockerfile:1

# VI LiveKit Agent — Python 3.13 + UV
ARG PYTHON_VERSION=3.13
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

ENV PYTHONUNBUFFERED=1

# Create non-privileged user
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

# Install build dependencies for native extensions
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./
RUN mkdir -p src

# Install dependencies using UV lock file
RUN uv sync --locked

# Copy all application files
COPY . .

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Pre-download ML models (Silero VAD, etc.)
RUN uv run src/agent.py download-files

# Run the V3 agent
CMD ["uv", "run", "src/agent.py", "start"]
