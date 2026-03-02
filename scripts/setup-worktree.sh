#!/bin/bash
# setup-worktree.sh — Create an isolated development environment for a task
#
# Usage:
#   ./scripts/setup-worktree.sh <task-slug> [port-offset]
#
# Examples:
#   ./scripts/setup-worktree.sh food-calorie        # Uses next available offset
#   ./scripts/setup-worktree.sh plant-detection 200  # Uses offset 200
#
# This creates:
#   1. A git worktree at ../vi-wt-{task-slug}
#   2. A feature branch feature/T-xxx-{task-slug}
#   3. A .env file with isolated ports (no collision with other developers)

set -e

TASK_SLUG="${1:?Usage: ./scripts/setup-worktree.sh <task-slug> [port-offset]}"
PORT_OFFSET="${2:-}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_PATH="$(dirname "$PROJECT_ROOT")/vi-wt-${TASK_SLUG}"

# Determine branch name
# Try to find the task ID from board.md
TASK_ID=""
if [ -f "$PROJECT_ROOT/.teamspace/board.md" ]; then
    TASK_ID=$(grep -o "T-[0-9]\{3\}" "$PROJECT_ROOT/.teamspace/board.md" | grep -m1 "" || echo "")
fi
BRANCH_NAME="feature/${TASK_ID:+${TASK_ID}-}${TASK_SLUG}"

# Auto-detect port offset if not specified
if [ -z "$PORT_OFFSET" ]; then
    # Count existing worktrees to determine offset
    EXISTING_WTS=$(git -C "$PROJECT_ROOT" worktree list | wc -l)
    PORT_OFFSET=$((EXISTING_WTS * 100))
    echo "Auto-detected port offset: ${PORT_OFFSET}"
fi

# Calculate ports
API_PORT=$((8000 + PORT_OFFSET))
FRONTEND_PORT=$((5173 + PORT_OFFSET))
GATEWAY_PORT=$((18789 + PORT_OFFSET))

echo "========================================"
echo "  Setting up isolated dev environment"
echo "========================================"
echo "  Task:      ${TASK_SLUG}"
echo "  Worktree:  ${WORKTREE_PATH}"
echo "  Branch:    ${BRANCH_NAME}"
echo "  Ports:"
echo "    API:      ${API_PORT}"
echo "    Frontend: ${FRONTEND_PORT}"
echo "    Gateway:  ${GATEWAY_PORT}"
echo "========================================"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
    echo "Worktree already exists at ${WORKTREE_PATH}"
    echo "To remove: git worktree remove ${WORKTREE_PATH}"
    exit 1
fi

# Create worktree with new branch
echo "Creating worktree..."
git -C "$PROJECT_ROOT" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"

# Create isolated .env
echo "Generating isolated .env..."
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Copy base .env and override ports
    cp "$PROJECT_ROOT/.env" "$WORKTREE_PATH/.env"
else
    # Copy from example
    cp "$PROJECT_ROOT/.env.example" "$WORKTREE_PATH/.env"
fi

# Override port settings in .env
cat >> "$WORKTREE_PATH/.env" << EOF

# ── Isolated Dev Environment ──
# Task: ${TASK_SLUG}
# Port offset: ${PORT_OFFSET}
API_PORT=${API_PORT}
FRONTEND_PORT=${FRONTEND_PORT}
GATEWAY_HTTP_PORT=${GATEWAY_PORT}
VITE_API_URL=http://localhost:${API_PORT}
CORS_ORIGINS=http://localhost:${FRONTEND_PORT},http://localhost:${API_PORT}
EOF

echo ""
echo "========================================"
echo "  Environment ready!"
echo "========================================"
echo ""
echo "  Next steps:"
echo "    cd ${WORKTREE_PATH}"
echo "    ./dev.sh"
echo ""
echo "  Your isolated stack:"
echo "    Frontend:  http://localhost:${FRONTEND_PORT}"
echo "    API:       http://localhost:${API_PORT}"
echo "    API Docs:  http://localhost:${API_PORT}/docs"
echo ""
echo "  When done:"
echo "    git push -u origin ${BRANCH_NAME}"
echo "    gh pr create"
echo "    cd ${PROJECT_ROOT}"
echo "    git worktree remove ${WORKTREE_PATH}"
echo "========================================"
