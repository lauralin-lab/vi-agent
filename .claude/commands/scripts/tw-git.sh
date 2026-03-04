#!/usr/bin/env bash
# tw-git.sh — Git operations for teamwork skills
#
# USAGE:
#   bash tw-git.sh ensure-base                        # Checkout base_branch, pull latest
#   bash tw-git.sh create-branch ISSUE SLUG USER      # Create branch from pattern
#   bash tw-git.sh current                             # Print current branch name
#   bash tw-git.sh protect-check                       # Exit 3 if on protected branch
#   bash tw-git.sh push [BRANCH]                       # Push with -u (default: current branch)
#   bash tw-git.sh fetch BRANCH [BRANCH2...]           # Fetch specified branches
#   bash tw-git.sh rebase TARGET                        # Fetch + rebase on target
#   bash tw-git.sh merge-to TARGET                     # Fetch base + merge into target (dual-branch)
#   bash tw-git.sh tag VERSION                          # Check exists, create, push, verify
#   bash tw-git.sh commit MSG [FILES...]               # Stage files + commit (-A if no files)
#   bash tw-git.sh worktree-add BRANCH PATH            # Create worktree
#   bash tw-git.sh worktree-remove PATH                # Remove worktree safely
#   bash tw-git.sh log-since [BASE]                     # Show commits + diff stat since base
#
# EXIT CODES:
#   0 — success
#   1 — usage error or missing args
#   2 — git operation failed
#   3 — safety check failed (e.g., on protected branch)
#
# READS: .teamwork/config.yml or .teamspace/config.yml via tw-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TW_CONFIG="$SCRIPT_DIR/tw-config.sh"

# Read config values
_base_branch() {
  local b
  b=$(bash "$TW_CONFIG" conventions.base_branch "main" 2>/dev/null)
  echo "${b:-main}"
}

_release_branch() {
  local base r
  base=$(_base_branch)
  r=$(bash "$TW_CONFIG" conventions.release_branch "" 2>/dev/null)
  echo "${r:-$base}"
}

_branch_pattern() {
  local p
  # Try conventions.branch_pattern first, then worktree.branch_pattern (single call with fallback)
  p=$(bash "$TW_CONFIG" conventions.branch_pattern "" 2>/dev/null)
  if [ -z "$p" ]; then
    p=$(bash "$TW_CONFIG" worktree.branch_pattern "mission/{issue}-{slug}-{user}" 2>/dev/null)
  fi
  # CRITICAL: Do NOT use ${p:-default} when default contains {} — bash closes
  # parameter expansion at first unmatched }, appending leftover text to output.
  if [ -z "$p" ]; then
    p="mission/{issue}-{slug}-{user}"
  fi
  echo "$p"
}

usage() {
  echo "Usage: tw-git.sh <subcommand> [args...]" >&2
  echo "Subcommands: ensure-base, create-branch, current, protect-check, push, fetch," >&2
  echo "             rebase, merge-to, tag, commit, worktree-add, worktree-remove, log-since" >&2
  exit 1
}

cmd_ensure_base() {
  local base
  base=$(_base_branch)
  git checkout "$base" 2>/dev/null || {
    echo "ERROR: Could not checkout $base" >&2
    exit 2
  }
  git pull origin "$base" 2>/dev/null || {
    echo "WARNING: Could not pull $base, working with local copy" >&2
  }
  echo "$base"
}

cmd_create_branch() {
  local issue="${1:-}" slug="${2:-}" user="${3:-}"
  if [ -z "$issue" ] || [ -z "$slug" ] || [ -z "$user" ]; then
    echo "ERROR: create-branch requires ISSUE, SLUG, USER" >&2
    exit 1
  fi

  local pattern branch
  pattern=$(_branch_pattern)
  # Use bash parameter expansion instead of sed to avoid metachar injection (&, /, \)
  branch="${pattern//\{issue\}/$issue}"
  branch="${branch//\{slug\}/$slug}"
  branch="${branch//\{user\}/$user}"
  branch="${branch//\{type\}/mission}"
  branch="${branch//\{task-id\}/$issue}"

  if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    echo "Branch '$branch' already exists. Switching to it." >&2
    git checkout "$branch"
  else
    git checkout -b "$branch"
  fi
  echo "$branch"
}

cmd_current() {
  git branch --show-current
}

cmd_protect_check() {
  local current base release
  current=$(git branch --show-current)
  if [ -z "$current" ]; then
    echo "OK: detached HEAD"
    return 0
  fi
  base=$(_base_branch)
  release=$(_release_branch)

  if [ "$current" = "$base" ] || [ "$current" = "$release" ]; then
    echo "SAFETY: On protected branch '$current'" >&2
    exit 3
  fi
  echo "OK: on '$current'"
}

cmd_push() {
  local branch="${1:-}"
  [ -z "$branch" ] && branch=$(git branch --show-current)

  if git push -u origin "$branch"; then
    echo "Pushed: $branch"
  else
    echo "Push failed. Try: git pull --rebase origin $branch" >&2
    exit 2
  fi
}

cmd_fetch() {
  if [ $# -eq 0 ]; then
    echo "ERROR: fetch requires at least one branch name" >&2
    exit 1
  fi
  for branch in "$@"; do
    git fetch origin "$branch" 2>/dev/null || echo "WARNING: Could not fetch $branch" >&2
  done
}

cmd_rebase() {
  local target="${1:-}"
  [ -z "$target" ] && target=$(_base_branch)

  git fetch origin "$target" 2>/dev/null || {
    echo "WARNING: Could not fetch $target, rebasing on local ref" >&2
  }
  if git rebase "origin/$target"; then
    echo "Rebased on origin/$target"
  else
    echo "Rebase failed. Resolve conflicts, then: git rebase --continue" >&2
    exit 2
  fi
}

cmd_merge_to() {
  local target="${1:-}"
  if [ -z "$target" ]; then
    echo "ERROR: merge-to requires TARGET branch" >&2
    exit 1
  fi

  local base
  base=$(_base_branch)

  git fetch origin "$base" "$target" 2>/dev/null || {
    echo "WARNING: Could not fetch, working with local refs" >&2
  }
  git checkout "$target" || {
    echo "ERROR: Could not checkout $target" >&2
    exit 2
  }
  git pull origin "$target" 2>/dev/null || {
    echo "WARNING: Could not pull $target, working with local copy" >&2
  }
  if git merge "origin/$base" --no-edit; then
    git push origin "$target"
    echo "Merged $base → $target"
  else
    echo "Merge conflict: $base → $target. Resolve manually." >&2
    exit 2
  fi
}

cmd_tag() {
  local version="${1:-}"
  if [ -z "$version" ]; then
    echo "ERROR: tag requires VERSION" >&2
    exit 1
  fi

  # Check if tag already exists (use refs/tags/ prefix to avoid matching branches)
  if git rev-parse "refs/tags/$version" >/dev/null 2>&1; then
    echo "Tag '$version' already exists locally. Skipping." >&2
    return 0
  fi
  if git ls-remote --tags origin | grep -qF "refs/tags/${version}"; then
    echo "Tag '$version' already exists on remote. Skipping." >&2
    return 0
  fi

  git tag "$version"
  git push origin "$version"

  # Verify (use -F for fixed string match to avoid regex metachar issues with dots)
  if git ls-remote --tags origin | grep -qF "refs/tags/${version}"; then
    echo "Tag $version pushed and verified"
  else
    echo "ERROR: Tag $version push could not be verified" >&2
    exit 2
  fi
}

cmd_commit() {
  local msg="${1:-}"
  if [ -z "$msg" ]; then
    echo "ERROR: commit requires MSG" >&2
    exit 1
  fi
  shift

  if [ $# -eq 0 ]; then
    git add -A
  else
    git add "$@"
  fi

  git commit -m "$msg"
}

cmd_worktree_add() {
  local branch="${1:-}" path="${2:-}"
  if [ -z "$branch" ] || [ -z "$path" ]; then
    echo "ERROR: worktree-add requires BRANCH and PATH" >&2
    exit 1
  fi
  git worktree add -b "$branch" "$path"
  echo "$path"
}

cmd_worktree_remove() {
  local path="${1:-}"
  if [ -z "$path" ]; then
    echo "ERROR: worktree-remove requires PATH" >&2
    exit 1
  fi
  if [ -d "$path" ]; then
    git worktree remove "$path" 2>/dev/null || {
      echo "WARNING: Could not remove worktree at $path (try --force)" >&2
      return 2
    }
    echo "Removed worktree: $path"
  else
    echo "WARNING: Worktree path not found: $path" >&2
    return 0
  fi
}

cmd_log_since() {
  local base="${1:-}"
  [ -z "$base" ] && base=$(_base_branch)

  echo "=== Commits since $base ==="
  local commits
  commits=$(git log --oneline "${base}..HEAD" 2>/dev/null) || true
  if [ -z "$commits" ]; then
    echo "(no commits)"
  else
    echo "$commits"
  fi
  echo ""
  echo "=== Files changed ==="
  git diff "${base}...HEAD" --stat 2>/dev/null || echo "(no changes)"
}

# --- Main ---
SUBCOMMAND="${1:-}"
shift || true

case "$SUBCOMMAND" in
  ensure-base)      cmd_ensure_base ;;
  create-branch)    cmd_create_branch "$@" ;;
  current)          cmd_current ;;
  protect-check)    cmd_protect_check ;;
  push)             cmd_push "$@" ;;
  fetch)            cmd_fetch "$@" ;;
  rebase)           cmd_rebase "$@" ;;
  merge-to)         cmd_merge_to "$@" ;;
  tag)              cmd_tag "$@" ;;
  commit)           cmd_commit "$@" ;;
  worktree-add)     cmd_worktree_add "$@" ;;
  worktree-remove)  cmd_worktree_remove "$@" ;;
  log-since)        cmd_log_since "$@" ;;
  *)                usage ;;
esac
