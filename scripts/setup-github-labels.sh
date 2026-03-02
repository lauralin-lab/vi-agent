#!/usr/bin/env bash
# setup-github-labels.sh — Create the full label taxonomy for GitHub-native SOP
#
# Usage: ./scripts/setup-github-labels.sh
#
# Prerequisites: gh auth login with an account that has write access to the repo

set -euo pipefail

echo "🏷️  Setting up GitHub label taxonomy..."
echo ""

# Check gh auth
if ! gh auth status &>/dev/null; then
  echo "❌ gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

# Check repo access
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null) || {
  echo "❌ Cannot access repo. Make sure you're in the repo directory and have access."
  exit 1
}
echo "📦 Repo: $REPO"
echo ""

# Helper: create or update label
ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  if gh label list --search "$name" --json name --jq '.[].name' 2>/dev/null | grep -qx "$name"; then
    gh label edit "$name" --color "$color" --description "$description" 2>/dev/null
    echo "  ✏️  Updated: $name"
  else
    gh label create "$name" --color "$color" --description "$description" 2>/dev/null
    echo "  ✅ Created: $name"
  fi
}

echo "── Type ──"
ensure_label "mission-contract" "0E8A16" "This issue is a Mission Contract"

echo ""
echo "── Status ──"
ensure_label "status:queued"   "C5DEF5" "Queued — ready to be claimed"
ensure_label "status:wip"      "FBCA04" "In Progress — actively being worked on"
ensure_label "status:review"   "1D76DB" "In Review — PR submitted"
ensure_label "status:done"     "0E8A16" "Done — merged to main"
ensure_label "status:blocked"  "D93F0B" "Blocked — needs unblocking"

echo ""
echo "── Priority ──"
ensure_label "priority:P0"     "B60205" "🔥 Urgent — drop everything"
ensure_label "priority:P1"     "D93F0B" "⚡ High — current sprint must-do"
ensure_label "priority:P2"     "FBCA04" "📌 Normal — planned"
ensure_label "priority:P3"     "C2E0C6" "💤 Low — when available"

echo ""
echo "── Domain ──"
ensure_label "domain:api-server" "006B75" "Backend API (Python/FastAPI)"
ensure_label "domain:frontend"   "7057FF" "Frontend (React/Vite)"
ensure_label "domain:realtime"   "E99695" "Realtime voice agent (Python/LiveKit)"
ensure_label "domain:gateway"    "F9D0C4" "Gateway service (TypeScript/Express)"
ensure_label "domain:global"     "BFD4F2" "Cross-service / monorepo-level"
ensure_label "domain:infra"      "D4C5F9" "Infrastructure / CI / DevOps"

echo ""
echo "── Version ──"
ensure_label "version:v0.1"    "5319E7" "V0.1 — AI Camera Pipeline"

echo ""
echo "── Size ──"
ensure_label "size:S"          "C2E0C6" "Small (1-2 hours)"
ensure_label "size:M"          "FBCA04" "Medium (half-day to 1 day)"
ensure_label "size:L"          "D93F0B" "Large (2-3 days)"
ensure_label "size:XL"         "B60205" "Extra-large (needs splitting)"

echo ""
echo "🎉 Label taxonomy setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/migrate-board-to-issues.sh  (migrate existing tasks)"
echo "  2. Run: ./scripts/sync-board.sh               (generate board.md from Issues)"
