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

# Read label prefixes and mc_label from config (prefer tw-config.sh if available)
STATUS_PREFIX="status:"
PRIORITY_PREFIX="priority:"
MC_LABEL="mission"

TW_CONFIG="$HOME/.claude/commands/scripts/tw-config.sh"
if [[ -x "$TW_CONFIG" ]] || [[ -f "$TW_CONFIG" ]]; then
  _S=$(bash "$TW_CONFIG" labels.status_prefix "" 2>/dev/null)
  [[ -z "$_S" ]] && _S=$(bash "$TW_CONFIG" label_prefix.status "" 2>/dev/null)
  _P=$(bash "$TW_CONFIG" labels.priority_prefix "" 2>/dev/null)
  [[ -z "$_P" ]] && _P=$(bash "$TW_CONFIG" label_prefix.priority "" 2>/dev/null)
  _M=$(bash "$TW_CONFIG" labels.mission "" 2>/dev/null)
  [[ -z "$_M" ]] && _M=$(bash "$TW_CONFIG" github.mc_label "" 2>/dev/null)
  [[ -z "$_M" ]] && _M=$(bash "$TW_CONFIG" mc_label "" 2>/dev/null)
  [[ -n "$_S" ]] && STATUS_PREFIX="$_S"
  [[ -n "$_P" ]] && PRIORITY_PREFIX="$_P"
  [[ -n "$_M" ]] && MC_LABEL="$_M"
else
  # Fallback: grep from config files directly
  for CONF in .teamwork/config.yml .teamspace/config.yml; do
    if [[ -f "$CONF" ]]; then
      _S=$(grep -v '^\s*#' "$CONF" | grep '^\s*status:' | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' 2>/dev/null || true)
      _P=$(grep -v '^\s*#' "$CONF" | grep '^\s*priority:' | head -1 | sed 's/^[^:]*://' | sed 's/^ *//' | tr -d '"' 2>/dev/null || true)
      [[ -n "$_S" ]] && STATUS_PREFIX="$_S"
      [[ -n "$_P" ]] && PRIORITY_PREFIX="$_P"
      break
    fi
  done
fi

echo "Creating teamwork labels for $REPO"
echo "  Mission label:   ${MC_LABEL}"
echo "  Status prefix:   ${STATUS_PREFIX}"
echo "  Priority prefix: ${PRIORITY_PREFIX}"
echo ""

# Category label (read from config, default: "mission")
gh label create "$MC_LABEL" \
  --color "0075ca" --description "Team mission contract" \
  --repo "$REPO" --force
echo "✅ $MC_LABEL"

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
