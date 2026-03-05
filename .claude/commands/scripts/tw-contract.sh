#!/usr/bin/env bash
# tw-contract.sh — Mission Contract operations for teamwork skills
#
# USAGE:
#   bash tw-contract.sh teamwork-dir                      # Print detected teamwork directory
#   bash tw-contract.sh find [ISSUE]                       # Locate contract file(s)
#   bash tw-contract.sh read-field PATH FIELD              # Extract YAML frontmatter field
#   bash tw-contract.sh hash TITLE BODY                    # Compute SHA256 hash
#   bash tw-contract.sh check-freshness PATH ISSUE         # Compare hashes (0=fresh, 1=stale, 2=no-hash)
#   bash tw-contract.sh toggle-task PATH N                  # Check off Nth subtask
#   bash tw-contract.sh sync-checkbox ISSUE SUBTASK_TEXT   # Update checkbox in GitHub Issue body
#   bash tw-contract.sh delete PATH                         # Remove contract file
#
# EXIT CODES:
#   0 — success (or fresh for check-freshness)
#   1 — stale (for check-freshness) or error
#   2 — no hash in contract (for check-freshness)
#   3 — not found

set -euo pipefail

# Teamwork directory (v3: .teamwork only)
_teamwork_dir() {
  if [ -f .teamwork/config.yml ]; then
    echo ".teamwork"
  else
    echo ""
  fi
}

usage() {
  echo "Usage: tw-contract.sh <subcommand> [args...]" >&2
  echo "Subcommands: teamwork-dir, find, read-field, hash, check-freshness," >&2
  echo "             toggle-task, sync-checkbox, delete" >&2
  exit 1
}

cmd_teamwork_dir() {
  local dir
  dir=$(_teamwork_dir)
  if [ -z "$dir" ]; then
    echo "ERROR: No teamwork config found" >&2
    exit 3
  fi
  echo "$dir"
}

cmd_find() {
  local issue="${1:-}"
  local dir
  dir=$(_teamwork_dir)
  if [ -z "$dir" ]; then
    echo "ERROR: No teamwork config found" >&2
    exit 3
  fi

  if [ -n "$issue" ]; then
    local path="$dir/active/MISSION-${issue}.md"
    if [ -f "$path" ]; then
      echo "$path"
      return 0
    else
      echo "ERROR: Contract not found: $path" >&2
      exit 3
    fi
  fi

  # Find all contracts
  local contracts
  contracts=$(ls "$dir"/active/MISSION-*.md 2>/dev/null || true)

  if [ -z "$contracts" ]; then
    echo "ERROR: No active contracts found" >&2
    exit 3
  fi

  local count
  count=$(echo "$contracts" | wc -l | tr -d ' ')
  if [ "$count" -gt 1 ]; then
    echo "ERROR: Multiple active contracts found:" >&2
    echo "$contracts" >&2
    exit 1
  fi

  echo "$contracts"
}

cmd_read_field() {
  local path="${1:-}" field="${2:-}"
  if [ -z "$path" ] || [ -z "$field" ]; then
    echo "ERROR: read-field requires PATH and FIELD" >&2
    exit 1
  fi
  if [ ! -f "$path" ]; then
    echo "ERROR: File not found: $path" >&2
    exit 3
  fi

  # Extract from YAML frontmatter (between --- markers)
  python3 -c "
import sys
path, field = sys.argv[1], sys.argv[2]
in_frontmatter = False
with open(path) as f:
    for line in f:
        line = line.rstrip()
        if line == '---':
            if in_frontmatter:
                break  # end of frontmatter
            in_frontmatter = True
            continue
        if in_frontmatter and ':' in line:
            key = line.split(':', 1)[0].strip()
            if key == field:
                val = line.split(':', 1)[1].strip().strip('\"').strip(\"'\")
                print(val)
                sys.exit(0)
# Field not found — exit with empty output
" "$path" "$field"
}

cmd_hash() {
  local title="${1:-}" body="${2:-}"
  echo "${title}${body}" | shasum -a 256 | cut -d' ' -f1
}

cmd_check_freshness() {
  local path="${1:-}" issue="${2:-}"
  if [ -z "$path" ] || [ -z "$issue" ]; then
    echo "ERROR: check-freshness requires PATH and ISSUE" >&2
    exit 1
  fi

  # Pre-check file existence — cmd_read_field uses exit (not return),
  # which kills the $(…) subshell before || true can fire.
  if [ ! -f "$path" ]; then
    echo "NO_HASH"
    exit 2
  fi

  # Read contract hash
  local contract_hash
  contract_hash=$(cmd_read_field "$path" "issue_content_hash" 2>/dev/null) || true

  if [ -z "$contract_hash" ]; then
    echo "NO_HASH"  # Pre-v2.3.0 contract
    exit 2
  fi

  # Fetch current Issue content
  local issue_data
  issue_data=$(gh issue view "$issue" --json title,body 2>/dev/null) || {
    echo "NETWORK_ERROR"
    exit 0  # Non-fatal
  }

  local title body current_hash
  title=$(echo "$issue_data" | jq -r '.title // ""')
  body=$(echo "$issue_data" | jq -r '.body // ""')
  current_hash=$(echo "${title}${body}" | shasum -a 256 | cut -d' ' -f1)

  if [ "$contract_hash" = "$current_hash" ]; then
    echo "FRESH"
    exit 0
  else
    echo "STALE"
    exit 1
  fi
}

cmd_toggle_task() {
  local path="${1:-}" n="${2:-}"
  if [ -z "$path" ] || [ -z "$n" ]; then
    echo "ERROR: toggle-task requires PATH and N (1-indexed)" >&2
    exit 1
  fi

  local timestamp
  timestamp=$(date '+%H:%M')

  python3 -c "
import sys
path, n, ts = sys.argv[1], int(sys.argv[2]), sys.argv[3]
with open(path) as f:
    lines = f.readlines()
count = 0
found = False
for i, line in enumerate(lines):
    if '- [ ] ' in line:
        count += 1
        if count == n:
            lines[i] = line.replace('- [ ] ', '- [x] ', 1).rstrip() + ' — ' + ts + '\n'
            found = True
            break
if not found:
    print(f'ERROR: Task {n} not found ({count} unchecked tasks exist)', file=sys.stderr)
    sys.exit(1)
with open(path, 'w') as f:
    f.writelines(lines)
print(f'Task {n} checked off at {ts}')
" "$path" "$n" "$timestamp"
}

cmd_sync_checkbox() {
  local issue="${1:-}" subtask_text="${2:-}"
  if [ -z "$issue" ] || [ -z "$subtask_text" ]; then
    echo "ERROR: sync-checkbox requires ISSUE and SUBTASK_TEXT" >&2
    exit 1
  fi

  local issue_body
  issue_body=$(gh issue view "$issue" --json body --jq '.body' 2>/dev/null) || {
    echo "WARNING: Could not fetch Issue body" >&2
    exit 0
  }

  if [ -z "$issue_body" ]; then
    echo "WARNING: Issue body is empty" >&2
    exit 0
  fi

  local updated_body
  updated_body=$(python3 -c "
import sys
body = sys.stdin.read()
task = sys.argv[1]
body = body.replace('- [ ] ' + task, '- [x] ' + task, 1)
print(body, end='')
" "$subtask_text" <<< "$issue_body" 2>/dev/null) || {
    echo "WARNING: Could not process Issue body" >&2
    exit 0
  }

  if [ -n "$updated_body" ]; then
    gh issue edit "$issue" --body "$updated_body" 2>/dev/null || {
      echo "WARNING: Could not sync sub-task to GitHub Issue (non-fatal)" >&2
      exit 0
    }
    echo "Synced checkbox to Issue #$issue"
  fi
}

cmd_delete() {
  local path="${1:-}"
  if [ -z "$path" ]; then
    echo "ERROR: delete requires PATH" >&2
    exit 1
  fi
  if [ -f "$path" ]; then
    rm "$path"
    echo "Deleted: $path"
  else
    echo "WARNING: Contract not found: $path" >&2
  fi
}

# --- Main ---
SUBCOMMAND="${1:-}"
shift || true

case "$SUBCOMMAND" in
  teamwork-dir)     cmd_teamwork_dir ;;
  find)             cmd_find "$@" ;;
  read-field)       cmd_read_field "$@" ;;
  hash)             cmd_hash "$@" ;;
  check-freshness)  cmd_check_freshness "$@" ;;
  toggle-task)      cmd_toggle_task "$@" ;;
  sync-checkbox)    cmd_sync_checkbox "$@" ;;
  delete)           cmd_delete "$@" ;;
  *)                usage ;;
esac
