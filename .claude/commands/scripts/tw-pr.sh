#!/usr/bin/env bash
# tw-pr.sh — PR lifecycle operations for teamwork skills
#
# USAGE:
#   bash tw-pr.sh exists BRANCH [BASE]              # Check if open PR exists, print number
#   bash tw-pr.sh commit-type TITLE                   # Infer feat/fix/refactor/test/docs
#   bash tw-pr.sh create ISSUE TITLE BODY BASE BRANCH # Create PR, return number + url
#   bash tw-pr.sh comment ISSUE TEXT                   # Post comment on Issue (non-fatal)
#   bash tw-pr.sh watch PR                               # Watch CI checks (blocks until done)
#   bash tw-pr.sh wait-merged PR [REPO]                 # Poll until PR is merged (10 min max)
#   bash tw-pr.sh add-reviewer PR REVIEWER             # Request review (non-fatal)
#   bash tw-pr.sh verify-merged BRANCH                 # Check if PR merged, print number+url
#
# EXIT CODES:
#   0 — success
#   1 — not found / usage error
#   2 — operation failed

set -euo pipefail

usage() {
  echo "Usage: tw-pr.sh <subcommand> [args...]" >&2
  echo "Subcommands: exists, commit-type, create, comment, watch, wait-merged, add-reviewer, verify-merged" >&2
  exit 1
}

cmd_exists() {
  local branch="${1:-}" base="${2:-}"
  if [ -z "$branch" ]; then
    echo "ERROR: exists requires BRANCH" >&2
    exit 1
  fi

  local base_flag=""
  [ -n "$base" ] && base_flag="--base $base"

  local result
  result=$(gh pr list --head "$branch" $base_flag --state open --json number,url --limit 1 2>/dev/null) || {
    echo "ERROR: Could not query PRs" >&2
    exit 2
  }

  local count
  count=$(echo "$result" | jq 'length' 2>/dev/null || echo "0")

  if [ "$count" -gt 0 ]; then
    local number url
    number=$(echo "$result" | jq -r '.[0].number')
    url=$(echo "$result" | jq -r '.[0].url')
    echo "$number $url"
    return 0
  else
    return 1
  fi
}

cmd_commit_type() {
  local title="${1:-}"
  if [ -z "$title" ]; then
    echo "feat"  # default
    return 0
  fi

  local lower
  lower=$(echo "$title" | tr '[:upper:]' '[:lower:]')

  # Use word-boundary matching to avoid false positives (e.g., "prefix" → fix)
  if echo "$lower" | grep -qEw '(fix|bug|hotfix|patch)'; then
    echo "fix"
  elif echo "$lower" | grep -qEw '(refactor|clean|restructure)'; then
    echo "refactor"
  elif echo "$lower" | grep -qEw '(test|spec)'; then
    echo "test"
  elif echo "$lower" | grep -qEw '(doc|docs|readme)'; then
    echo "docs"
  else
    echo "feat"
  fi
}

cmd_create() {
  local issue="${1:-}" title="${2:-}" body="${3:-}" base="${4:-}" branch="${5:-}"
  if [ -z "$issue" ] || [ -z "$title" ] || [ -z "$base" ] || [ -z "$branch" ]; then
    echo "ERROR: create requires ISSUE, TITLE, BASE, BRANCH (BODY optional)" >&2
    exit 1
  fi

  local url
  url=$(gh pr create \
    --title "$title" \
    --body "$body" \
    --base "$base" \
    --head "$branch" 2>/dev/null) || {
    echo "ERROR: PR creation failed" >&2
    exit 2
  }

  # gh pr create outputs the URL on stdout; extract PR number from last line
  local number
  url=$(echo "$url" | tail -1)
  number=$(echo "$url" | grep -oE '[0-9]+$' || echo "")

  echo "$number $url"
}

cmd_comment() {
  local issue="${1:-}" text="${2:-}"
  if [ -z "$issue" ] || [ -z "$text" ]; then
    echo "WARNING: comment requires ISSUE and TEXT, skipping" >&2
    return 0
  fi

  gh issue comment "$issue" --body "$text" 2>/dev/null || {
    echo "WARNING: Could not post comment to Issue #$issue" >&2
    exit 0  # Non-fatal
  }
  echo "Comment posted to Issue #$issue"
}

cmd_watch() {
  local pr="${1:-}"
  if [ -z "$pr" ]; then
    echo "ERROR: watch requires PR number" >&2
    exit 1
  fi

  local interval=10
  if gh pr checks "$pr" --watch --interval "$interval" 2>&1; then
    echo "CI passed"
    return 0
  else
    echo "CI failed or timed out" >&2
    return 2
  fi
}

cmd_add_reviewer() {
  local pr="${1:-}" reviewer="${2:-}"
  if [ -z "$pr" ] || [ -z "$reviewer" ]; then
    echo "WARNING: add-reviewer requires PR and REVIEWER, skipping" >&2
    return 0
  fi

  gh pr edit "$pr" --add-reviewer "$reviewer" 2>/dev/null || {
    echo "WARNING: Could not add reviewer $reviewer to PR #$pr" >&2
    exit 0
  }
  echo "Review requested from $reviewer on PR #$pr"
}

cmd_wait_merged() {
  local pr="${1:-}" repo="${2:-}"
  if [ -z "$pr" ]; then
    echo "ERROR: wait-merged requires PR number" >&2
    exit 1
  fi

  local repo_flag=""
  [ -n "$repo" ] && repo_flag="--repo $repo"

  local max_polls=60  # 10 minutes max (60 × 10s)
  local poll_count=0
  echo "⏳ Waiting for PR #$pr to merge..."

  while true; do
    local state
    state=$(gh pr view "$pr" --json state --jq '.state' $repo_flag 2>/dev/null) || {
      echo "WARNING: Could not query PR state" >&2
      state="UNKNOWN"
    }

    if [ "$state" = "MERGED" ]; then
      echo "PR #$pr merged"
      return 0
    fi

    if [ "$state" = "CLOSED" ]; then
      echo "ERROR: PR #$pr was closed without merging" >&2
      echo "Check: gh pr view $pr $repo_flag" >&2
      return 1
    fi

    poll_count=$((poll_count + 1))
    if [ "$poll_count" -ge "$max_polls" ]; then
      echo "ERROR: Timed out waiting for PR #$pr to merge (10 min)" >&2
      echo "Check CI: gh pr checks $pr $repo_flag" >&2
      return 3
    fi

    local elapsed=$((poll_count * 10))
    echo "  ⏳ ${elapsed}s / 600s — state: $state"
    sleep 10
  done
}

cmd_verify_merged() {
  local branch="${1:-}"
  if [ -z "$branch" ]; then
    echo "ERROR: verify-merged requires BRANCH" >&2
    exit 1
  fi

  local result
  result=$(gh pr list --head "$branch" --state merged --json number,url --limit 1 2>/dev/null) || {
    echo "ERROR: Could not query PRs" >&2
    exit 2
  }

  local count
  count=$(echo "$result" | jq 'length' 2>/dev/null || echo "0")

  if [ "$count" -gt 0 ]; then
    local number url
    number=$(echo "$result" | jq -r '.[0].number')
    url=$(echo "$result" | jq -r '.[0].url')
    echo "$number $url"
    return 0
  else
    echo "No merged PR found for branch: $branch" >&2
    return 1
  fi
}

# --- Main ---
SUBCOMMAND="${1:-}"
shift || true

case "$SUBCOMMAND" in
  exists)         cmd_exists "$@" ;;
  commit-type)    cmd_commit_type "$@" ;;
  create)         cmd_create "$@" ;;
  comment)        cmd_comment "$@" ;;
  watch)          cmd_watch "$@" ;;
  wait-merged)    cmd_wait_merged "$@" ;;
  add-reviewer)   cmd_add_reviewer "$@" ;;
  verify-merged)  cmd_verify_merged "$@" ;;
  *)              usage ;;
esac
