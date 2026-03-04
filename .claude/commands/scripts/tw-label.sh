#!/usr/bin/env bash
# tw-label.sh — GitHub label state transitions for teamwork skills
#
# USAGE:
#   bash tw-label.sh transition ISSUE FROM TO     # queued→wip, wip→review, etc.
#   bash tw-label.sh set ISSUE STATUS              # Direct set (removes other status labels)
#   bash tw-label.sh verify ISSUE EXPECTED         # Verify label applied correctly
#   bash tw-label.sh pr-label PR STATUS            # Add status label to PR
#
# EXAMPLES:
#   bash tw-label.sh transition 42 queued wip       # Claim: queued→wip
#   bash tw-label.sh transition 42 wip review       # Ship: wip→review
#   bash tw-label.sh transition 42 review done       # Done: review→done (also removes wip)
#   bash tw-label.sh set 42 blocked                  # Set blocked status
#   bash tw-label.sh verify 42 review                # Check that "status:review" is on Issue #42
#   bash tw-label.sh pr-label 15 review              # Add status:review to PR #15
#
# EXIT CODES:
#   0 — success
#   1 — usage error or missing args
#   2 — label operation failed (gh error)
#   3 — verification failed (label mismatch)
#
# READS: .teamwork/config.yml or .teamspace/config.yml via tw-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TW_CONFIG="$SCRIPT_DIR/tw-config.sh"

# Read status prefix from config
STATUS_PREFIX=$(bash "$TW_CONFIG" label_prefix.status "" 2>/dev/null)
[ -z "$STATUS_PREFIX" ] && STATUS_PREFIX="status:"

# All known status values
ALL_STATUSES="queued wip review done blocked"

usage() {
  echo "Usage:" >&2
  echo "  tw-label.sh transition ISSUE FROM TO" >&2
  echo "  tw-label.sh set ISSUE STATUS" >&2
  echo "  tw-label.sh verify ISSUE EXPECTED" >&2
  echo "  tw-label.sh pr-label PR STATUS" >&2
  exit 1
}

cmd_transition() {
  local issue="${1:-}"
  local from="${2:-}"
  local to="${3:-}"

  if [ -z "$issue" ] || [ -z "$from" ] || [ -z "$to" ]; then
    echo "ERROR: transition requires ISSUE, FROM, and TO" >&2
    usage
  fi

  # Build remove list: always remove FROM label
  local remove_labels="--remove-label ${STATUS_PREFIX}${from}"

  # Special case: done transition also removes wip and review
  if [ "$to" = "done" ]; then
    remove_labels="--remove-label ${STATUS_PREFIX}${from} --remove-label ${STATUS_PREFIX}wip --remove-label ${STATUS_PREFIX}review"
  fi

  if gh issue edit "$issue" $remove_labels --add-label "${STATUS_PREFIX}${to}" 2>/dev/null; then
    echo "${STATUS_PREFIX}${from} → ${STATUS_PREFIX}${to}"
  else
    echo "WARNING: Label transition failed for Issue #${issue}" >&2
    return 2
  fi
}

cmd_set() {
  local issue="${1:-}"
  local status="${2:-}"

  if [ -z "$issue" ] || [ -z "$status" ]; then
    echo "ERROR: set requires ISSUE and STATUS" >&2
    usage
  fi

  # Remove all status labels first, then add the desired one
  local remove_args=""
  for s in $ALL_STATUSES; do
    remove_args="$remove_args --remove-label ${STATUS_PREFIX}${s}"
  done

  if gh issue edit "$issue" $remove_args --add-label "${STATUS_PREFIX}${status}" 2>/dev/null; then
    echo "${STATUS_PREFIX}${status}"
  else
    echo "WARNING: Label set failed for Issue #${issue}" >&2
    return 2
  fi
}

cmd_verify() {
  local issue="${1:-}"
  local expected="${2:-}"

  if [ -z "$issue" ] || [ -z "$expected" ]; then
    echo "ERROR: verify requires ISSUE and EXPECTED" >&2
    usage
  fi

  local labels
  labels=$(gh issue view "$issue" --json labels --jq '[.labels[].name] | join(",")' 2>/dev/null) || {
    echo "WARNING: Could not verify labels (network error)" >&2
    return 0  # Non-fatal — assume success
  }

  local expected_label="${STATUS_PREFIX}${expected}"
  # Use comma-delimited exact match to avoid substring false positives
  if echo ",$labels," | grep -qF ",${expected_label},"; then
    echo "VERIFIED: $expected_label (labels: $labels)"
    return 0
  else
    echo "MISMATCH: Expected $expected_label but got: $labels" >&2
    return 3
  fi
}

cmd_pr_label() {
  local pr="${1:-}"
  local status="${2:-}"

  if [ -z "$pr" ] || [ -z "$status" ]; then
    echo "ERROR: pr-label requires PR and STATUS" >&2
    usage
  fi

  if gh pr edit "$pr" --add-label "${STATUS_PREFIX}${status}" 2>/dev/null; then
    echo "${STATUS_PREFIX}${status} added to PR #${pr}"
  else
    echo "WARNING: Could not add label to PR #${pr}" >&2
    return 0  # Non-fatal for PR labels
  fi
}

# --- Main ---
SUBCOMMAND="${1:-}"
shift || true

case "$SUBCOMMAND" in
  transition) cmd_transition "$@" ;;
  set)        cmd_set "$@" ;;
  verify)     cmd_verify "$@" ;;
  pr-label)   cmd_pr_label "$@" ;;
  *)          usage ;;
esac
