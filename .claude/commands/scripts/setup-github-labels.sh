#!/usr/bin/env bash
# setup-github-labels.sh — Create GitHub labels for teamwork
#
# Usage:
#   bash ~/.claude/commands/scripts/setup-github-labels.sh
#   bash ~/.claude/commands/scripts/setup-github-labels.sh OWNER/REPO
#
# Run from the project root (reads .teamwork/config.yml or .teamspace/config.yml for prefixes).
# Creates labels with --force so safe to re-run (updates existing labels).

set -euo pipefail

# Resolve repo
if [[ $# -ge 1 ]]; then
  REPO="$1"
else
  REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || true)
fi

if [[ -z "$REPO" ]]; then
  echo "ERROR: No repo found. Run from a GitHub repo or pass OWNER/REPO as argument." >&2
  exit 1
fi

# Read label prefixes from config (if available)
STATUS_PREFIX="status:"
PRIORITY_PREFIX="priority:"

for CONF in .teamwork/config.yml .teamspace/config.yml; do
  if [[ -f "$CONF" ]]; then
    _S=$(grep '^\s*status:' "$CONF" | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' 2>/dev/null || true)
    _P=$(grep '^\s*priority:' "$CONF" | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' 2>/dev/null || true)
    [[ -n "$_S" ]] && STATUS_PREFIX="$_S"
    [[ -n "$_P" ]] && PRIORITY_PREFIX="$_P"
    break
  fi
done

echo "Creating teamwork labels for $REPO"
echo "  Status prefix:   ${STATUS_PREFIX}"
echo "  Priority prefix: ${PRIORITY_PREFIX}"
echo ""

# Category label
gh label create "mission" \
  --color "0075ca" --description "Team mission contract" \
  --repo "$REPO" --force
echo "✅ mission"

# Status labels
gh label create "${STATUS_PREFIX}queued" \
  --color "c2e0c6" --description "Ready to be claimed" \
  --repo "$REPO" --force
echo "✅ ${STATUS_PREFIX}queued"

gh label create "${STATUS_PREFIX}wip" \
  --color "fbca04" --description "Currently being worked on" \
  --repo "$REPO" --force
echo "✅ ${STATUS_PREFIX}wip"

gh label create "${STATUS_PREFIX}review" \
  --color "7057ff" --description "PR open, awaiting merge" \
  --repo "$REPO" --force
echo "✅ ${STATUS_PREFIX}review"

gh label create "${STATUS_PREFIX}done" \
  --color "0e8a16" --description "Completed and merged" \
  --repo "$REPO" --force
echo "✅ ${STATUS_PREFIX}done"

gh label create "${STATUS_PREFIX}blocked" \
  --color "d73a4a" --description "Blocked by dependency" \
  --repo "$REPO" --force
echo "✅ ${STATUS_PREFIX}blocked"

# Priority labels
gh label create "${PRIORITY_PREFIX}P0" \
  --color "d73a4a" --description "Critical — drop everything" \
  --repo "$REPO" --force
echo "✅ ${PRIORITY_PREFIX}P0"

gh label create "${PRIORITY_PREFIX}P1" \
  --color "e4e669" --description "High priority" \
  --repo "$REPO" --force
echo "✅ ${PRIORITY_PREFIX}P1"

gh label create "${PRIORITY_PREFIX}P2" \
  --color "0e8a16" --description "Medium priority (default)" \
  --repo "$REPO" --force
echo "✅ ${PRIORITY_PREFIX}P2"

gh label create "${PRIORITY_PREFIX}P3" \
  --color "cfd3d7" --description "Low priority / nice to have" \
  --repo "$REPO" --force
echo "✅ ${PRIORITY_PREFIX}P3"

echo ""
echo "Done. All labels created/updated for $REPO."
