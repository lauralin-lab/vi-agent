#!/bin/bash
# Sync prompts from prompts/ folder back to their source locations
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Syncing prompts → source locations..."

cp "$SCRIPT_DIR/prompts/vi-livekit-agent.md" "$SCRIPT_DIR/realtime/src/base.md"
echo "  ✓ vi-livekit-agent.md → realtime/src/base.md"

echo "Done! All prompts synced."
