#!/usr/bin/env bash
# tw-git.sh — Git operations for teamwork skills
#
# USAGE:
#   bash tw-git.sh ensure-base                        # Checkout base_branch, pull latest
#   bash tw-git.sh create-branch ISSUE SLUG USER      # Create branch from pattern
#   bash tw-git.sh current                             # Print current branch name
#   bash tw-git.sh protect-check                       # Exit 3 if on protected branch
#   bash tw-git.sh push [BRANCH]                       # Push with -u (default: current branch)
#   bash tw-git.sh rebase TARGET                        # Fetch + rebase on target
#   bash tw-git.sh tag VERSION                          # Check exists, create, push, verify
#   bash tw-git.sh commit MSG [FILES...]               # Stage files + commit (-A if no files)
#   bash tw-git.sh worktree-add BRANCH PATH            # Create worktree
#   bash tw-git.sh worktree-remove PATH                # Remove worktree safely
#   bash tw-git.sh log-since [BASE]                     # Show commits + diff stat since base
#   bash tw-git.sh cut-release VERSION                  # Cut rc/VERSION from base branch
#   bash tw-git.sh slugify TITLE                         # Slugify title for branch names
#   bash tw-git.sh find-rc                               # Find active RC branch (exit 1=none, 3=multiple)
#   bash tw-git.sh next-version PREFIX                   # Derive next patch version from tags
#   bash tw-git.sh list-merged-branches                  # Local mission/* branches with merged PRs
#   bash tw-git.sh milestone-resolve NAME                # Resolve short milestone name to full title
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

_production_branch() {
  local p
  p=$(bash "$TW_CONFIG" conventions.production_branch "main" 2>/dev/null)
  echo "${p:-main}"
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
  echo "Subcommands: ensure-base, create-branch, current, protect-check, push," >&2
  echo "             rebase, tag, commit, worktree-add, worktree-remove, log-since," >&2
  echo "             cut-release, slugify, find-rc, next-version," >&2
  echo "             list-merged-branches, milestone-resolve" >&2
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
  local current base prod
  current=$(git branch --show-current)
  if [ -z "$current" ]; then
    echo "OK: detached HEAD"
    return 0
  fi
  base=$(_base_branch)
  prod=$(_production_branch)

  # Block: base branch (develop), production branch (main), rc/* branches
  if [ "$current" = "$base" ] || [ "$current" = "$prod" ]; then
    echo "SAFETY: On protected branch '$current'" >&2
    exit 3
  fi
  # RC branches should only receive hotfix PRs, not direct commits
  if [[ "$current" == rc/* ]]; then
    echo "SAFETY: On RC branch '$current' — branch from it for hotfixes, don't commit directly" >&2
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
  # Use existing branch if it exists (create-branch may have already created it),
  # otherwise create it with -b
  if git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    git worktree add "$path" "$branch"
  else
    git worktree add -b "$branch" "$path"
  fi
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

cmd_cut_release() {
  local version="${1:-}"
  if [ -z "$version" ]; then
    echo "ERROR: cut-release requires VERSION" >&2
    exit 1
  fi

  local base rc_branch
  base=$(_base_branch)
  rc_branch="rc/$version"

  git checkout "$base" 2>/dev/null || {
    echo "ERROR: Could not checkout $base" >&2
    exit 2
  }
  git pull origin "$base" 2>/dev/null || {
    echo "WARNING: Could not pull $base, working with local copy" >&2
  }
  git checkout -b "$rc_branch" || {
    echo "ERROR: Could not create branch $rc_branch" >&2
    exit 2
  }
  git push -u origin "$rc_branch" || {
    echo "ERROR: Could not push $rc_branch" >&2
    exit 2
  }
  echo "$rc_branch"
}

cmd_slugify() {
  local title="${1:-}"
  if [ -z "$title" ]; then
    echo "ERROR: slugify requires TITLE" >&2
    exit 1
  fi
  local slug
  slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' \
    | sed 's/--*/-/g; s/^-//; s/-$//' | head -c 30 | sed 's/-$//')
  if [ -z "$slug" ]; then
    echo "ERROR: slugify produced empty result from title" >&2
    exit 1
  fi
  echo "$slug"
}

cmd_find_rc() {
  local branches
  branches=$(git ls-remote --heads origin 'rc/*' 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||') || true

  if [ -z "$branches" ]; then
    echo "NONE"
    exit 1
  fi

  local count
  count=$(echo "$branches" | wc -l | tr -d ' ')
  if [ "$count" -gt 1 ]; then
    echo "MULTIPLE" >&2
    echo "$branches" >&2
    exit 3
  fi

  echo "$branches"
}

cmd_next_version() {
  local prefix="${1:-}"
  if [ -z "$prefix" ]; then
    echo "ERROR: next-version requires PREFIX (e.g., V0.1)" >&2
    exit 1
  fi

  git fetch --tags origin 2>/dev/null || true

  # Find latest clean version tag matching PREFIX.N (exclude pre-release suffixes)
  local last_tag
  last_tag=$(git tag -l "${prefix}.*" --sort=-v:refname \
    | grep -E "^$(echo "$prefix" | sed 's/[.[\*^$()+?{|\\]/\\&/g')\.[0-9]+$" \
    | head -1) || true

  if [ -z "$last_tag" ]; then
    echo "${prefix}.0"
  else
    local patch prefix_part
    patch=$(echo "$last_tag" | awk -F. '{print $NF}')
    prefix_part=$(echo "$last_tag" | sed 's/\.[0-9]*$//')
    echo "${prefix_part}.$((patch + 1))"
  fi
}

cmd_list_merged_branches() {
  local branches
  branches=$(git branch --list 'mission/*' | sed 's/^[* ]*//' | tr -d ' ') || true

  if [ -z "$branches" ]; then
    exit 0
  fi

  while IFS= read -r branch; do
    [ -z "$branch" ] && continue
    local merged_pr
    merged_pr=$(gh pr list --head "$branch" --state merged --json number --jq '.[0].number' 2>/dev/null) || true
    if [ -n "$merged_pr" ]; then
      printf '%s\t#%s\n' "$branch" "$merged_pr"
    fi
  done <<< "$branches"
}

cmd_milestone_resolve() {
  local name="${1:-}"
  if [ -z "$name" ]; then
    echo "ERROR: milestone-resolve requires NAME" >&2
    exit 1
  fi

  local repo
  repo=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null) || {
    echo "$name"
    exit 0
  }

  local full
  full=$(gh api "repos/$repo/milestones" \
    --jq ".[] | select(.title | startswith(\"$name\")) | .title" 2>/dev/null | head -1) || true

  if [ -n "$full" ]; then
    echo "$full"
  else
    echo "$name"
  fi
}

# --- Main ---
SUBCOMMAND="${1:-}"
shift || true

case "$SUBCOMMAND" in
  ensure-base)      cmd_ensure_base ;;
  create-branch)    cmd_create_branch "$@" ;;
  current)          cmd_current ;;
  protect-check)    cmd_protect_check ;;
  push)                 cmd_push "$@" ;;
  rebase)               cmd_rebase "$@" ;;
  tag)                  cmd_tag "$@" ;;
  commit)               cmd_commit "$@" ;;
  worktree-add)         cmd_worktree_add "$@" ;;
  worktree-remove)      cmd_worktree_remove "$@" ;;
  log-since)            cmd_log_since "$@" ;;
  cut-release)          cmd_cut_release "$@" ;;
  slugify)              cmd_slugify "$@" ;;
  find-rc)              cmd_find_rc ;;
  next-version)         cmd_next_version "$@" ;;
  list-merged-branches) cmd_list_merged_branches ;;
  milestone-resolve)    cmd_milestone_resolve "$@" ;;
  *)                    usage ;;
esac
