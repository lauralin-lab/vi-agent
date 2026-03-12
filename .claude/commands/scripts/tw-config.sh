#!/usr/bin/env bash
# tw-config.sh — Unified config reader for teamwork skills
#
# USAGE (key lookup — backward compatible):
#   bash tw-config.sh <key> [default]
#
# USAGE (subcommands):
#   bash tw-config.sh detect-dir                # Print config directory (.teamwork or .teamspace)
#   bash tw-config.sh resolve-labels            # Print MISSION_LABEL, STATUS_PREFIX, PRIORITY_PREFIX
#   bash tw-config.sh get-user-level USER       # Print solo/leader/member
#   bash tw-config.sh team-mode                 # Print "solo" or "team" (based on member count)
#   bash tw-config.sh resolve-member MENTION    # Resolve @mention to GitHub username
#   bash tw-config.sh list-members              # List all members as github:name:role lines
#
# KEY FORMAT: dot-notation for nested keys (up to 2 levels)
#   "project.test_command"  → yaml: project:\n  test_command: "..."
#   "label_prefix.status"   → yaml: label_prefix:\n  status: "status:"
#
# EXIT CODES:
#   0 — success
#   1 — usage error
#   3 — no config found (for detect-dir)

set -euo pipefail

# --- Internal helpers ---

_detect_config() {
  if [ -f ".teamwork/config.yml" ]; then
    echo ".teamwork/config.yml"
  elif [ -f ".teamspace/config.yml" ]; then
    echo ".teamspace/config.yml"
  else
    echo ""
  fi
}

_detect_dir() {
  if [ -f ".teamwork/config.yml" ]; then
    echo ".teamwork"
  elif [ -f ".teamspace/config.yml" ]; then
    echo ".teamspace"
  else
    echo ""
  fi
}

# Core Python parser — reused by cmd_get and cmd_resolve_labels
_PYTHON_PARSER='
import sys

def strip_val(raw):
    """Extract YAML scalar value, stripping quotes and inline comments."""
    v = raw.strip()
    if not v:
        return ""
    if v[0] in ("\"", "'"'"'"):
        q = v[0]
        end = v.find(q, 1)
        return v[1:end] if end > 0 else v.strip(q)
    for marker in ("  #", " #"):
        pos = v.find(marker)
        if pos >= 0:
            v = v[:pos]
    return v.strip()

def parse_simple_yaml(filepath):
    """Parse flat keys + 1-level nesting. No arrays."""
    result = {}
    current_section = None
    try:
        with open(filepath) as f:
            for line in f:
                line = line.rstrip("\n")
                if not line.strip() or line.strip().startswith("#"):
                    continue
                if not line.startswith(" ") and not line.startswith("\t") and ":" in line:
                    parts = line.split(":", 1)
                    section_key = parts[0].strip()
                    section_val = strip_val(parts[1])
                    if section_val == "" or section_val in ("|", ">"):
                        current_section = section_key
                    else:
                        result[section_key] = section_val
                        current_section = section_key
                elif (line.startswith("  ") or line.startswith("\t")) and ":" in line:
                    if current_section is None:
                        continue
                    indent = len(line) - len(line.lstrip())
                    if indent > 2 and not line.startswith("\t"):
                        continue
                    if line.startswith("\t") and indent > 1:
                        continue
                    stripped = line.strip()
                    if stripped.startswith("-"):
                        continue
                    parts = stripped.split(":", 1)
                    sub_key = parts[0].strip()
                    sub_val = strip_val(parts[1]) if len(parts) > 1 else ""
                    if sub_val != "" and sub_val not in ("|", ">"):
                        result[current_section + "." + sub_key] = sub_val
    except (IOError, OSError):
        pass
    return result
'

# Shared member+roles parser — reused by get-user-level, team-mode, resolve-member, list-members
_PYTHON_MEMBER_PARSER='
def parse_members_and_roles(config_file):
    """Parse members/team array and roles array from YAML config.
    Returns (members: list[dict], roles: dict[id->level]).
    """
    members = []
    roles = {}
    current_section = None
    current_item = {}

    with open(config_file) as f:
        for line in f:
            line = line.rstrip("\n")
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            # Top-level section detection
            if not line.startswith(" ") and not line.startswith("\t") and ":" in line:
                key = line.split(":", 1)[0].strip()
                val = line.split(":", 1)[1].strip()
                if key in ("members", "team") and (val == "" or val.startswith("#")):
                    if current_item and current_section in ("members", "team"):
                        members.append(current_item)
                        current_item = {}
                    current_section = key
                    continue
                elif key == "roles" and (val == "" or val.startswith("#")):
                    if current_item and current_section in ("members", "team"):
                        members.append(current_item)
                        current_item = {}
                    current_section = "roles"
                    continue
                else:
                    if current_item and current_section in ("members", "team"):
                        members.append(current_item)
                        current_item = {}
                    current_section = key
                    continue

            # Under members/team section — parse array items
            if current_section in ("members", "team") and stripped.startswith("-"):
                if current_item:
                    members.append(current_item)
                current_item = {}
                rest = stripped[1:].strip()
                if ":" in rest:
                    k = rest.split(":", 1)[0].strip()
                    v = rest.split(":", 1)[1].strip().strip("\"").strip("'"'"'")
                    current_item[k] = v
                continue

            if current_section in ("members", "team") and ":" in stripped and not stripped.startswith("-"):
                indent = len(line) - len(line.lstrip())
                if indent >= 2:
                    k = stripped.split(":", 1)[0].strip()
                    v = stripped.split(":", 1)[1].strip().strip("\"").strip("'"'"'")
                    current_item[k] = v
                continue

            # Under roles section — parse array items
            if current_section == "roles" and stripped.startswith("-"):
                if "_pending" in roles:
                    pending = roles.pop("_pending")
                    if "id" in pending:
                        roles[pending["id"]] = pending.get("level", "member")
                rest = stripped[1:].strip()
                role_item = {}
                if ":" in rest:
                    k = rest.split(":", 1)[0].strip()
                    v = rest.split(":", 1)[1].strip().strip("\"").strip("'"'"'")
                    role_item[k] = v
                roles["_pending"] = role_item
                continue

            if current_section == "roles" and "_pending" in roles and ":" in stripped:
                indent = len(line) - len(line.lstrip())
                if indent >= 4:
                    k = stripped.split(":", 1)[0].strip()
                    v = stripped.split(":", 1)[1].strip().strip("\"").strip("'"'"'")
                    roles["_pending"][k] = v
                else:
                    pending = roles.pop("_pending")
                    if "id" in pending:
                        roles[pending["id"]] = pending.get("level", "member")
                    if stripped.startswith("-"):
                        rest = stripped[1:].strip()
                        role_item = {}
                        if ":" in rest:
                            k = rest.split(":", 1)[0].strip()
                            v = rest.split(":", 1)[1].strip().strip("\"").strip("'"'"'")
                            role_item[k] = v
                        roles["_pending"] = role_item
                continue

    # Flush final items
    if current_item and current_section in ("members", "team"):
        members.append(current_item)
    if "_pending" in roles:
        pending = roles.pop("_pending")
        if "id" in pending:
            roles[pending["id"]] = pending.get("level", "member")

    # Filter: only entries with github/id field (skip metadata like {name, repo})
    real_members = [m for m in members if "github" in m or "id" in m]
    return real_members, roles
'

# --- Subcommands ---

cmd_get() {
  local key="${1:-}" default="${2:-}"
  if [ -z "$key" ]; then
    echo "Usage: tw-config.sh <key> [default]" >&2
    exit 1
  fi

  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    echo "$default"
    exit 0
  fi

  python3 - "$config_file" "$key" "$default" << PYEOF
${_PYTHON_PARSER}

config_file = sys.argv[1]
key_path = sys.argv[2]
default = sys.argv[3] if len(sys.argv) > 3 else ""
config = parse_simple_yaml(config_file)
print(config.get(key_path, default))
PYEOF
}

cmd_detect_dir() {
  local dir
  dir=$(_detect_dir)
  if [ -z "$dir" ]; then
    echo "ERROR: No teamwork config found" >&2
    exit 3
  fi
  echo "$dir"
}

cmd_resolve_labels() {
  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    echo "MISSION_LABEL=mission"
    echo "STATUS_PREFIX=status:"
    echo "PRIORITY_PREFIX=priority:"
    exit 0
  fi

  python3 - "$config_file" << PYEOF
${_PYTHON_PARSER}

config = parse_simple_yaml(sys.argv[1])

# Mission label: github.mc_label -> mc_label -> labels.mission -> "mission"
ml = config.get("github.mc_label", "")
if not ml:
    ml = config.get("mc_label", "")
if not ml:
    ml = config.get("labels.mission", "")
if not ml:
    ml = "mission"

# Status prefix: label_prefix.status -> labels.status_prefix -> "status:"
sp = config.get("label_prefix.status", "")
if not sp:
    sp = config.get("labels.status_prefix", "")
if not sp:
    sp = "status:"

# Priority prefix: label_prefix.priority -> labels.priority_prefix -> "priority:"
pp = config.get("label_prefix.priority", "")
if not pp:
    pp = config.get("labels.priority_prefix", "")
if not pp:
    pp = "priority:"

print(f'MISSION_LABEL="{ml}"')
print(f'STATUS_PREFIX="{sp}"')
print(f'PRIORITY_PREFIX="{pp}"')
PYEOF
}

cmd_get_user_level() {
  local user="${1:-}"
  if [ -z "$user" ]; then
    echo "ERROR: get-user-level requires USER (GitHub username)" >&2
    exit 1
  fi

  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    echo "leader"
    exit 0
  fi

  python3 - "$config_file" "$user" << PYEOF
import sys
${_PYTHON_MEMBER_PARSER}

members, roles = parse_members_and_roles(sys.argv[1])
target_user = sys.argv[2]

if len(members) <= 1:
    print("solo")
    sys.exit(0)

user_role = None
for m in members:
    gh = m.get('github', m.get('id', ''))
    if gh == target_user:
        user_role = m.get('role', '')
        break

if user_role is None:
    print("unknown")
    sys.exit(0)

if roles:
    level = roles.get(user_role, 'member')
else:
    level = 'leader'

print(level)
PYEOF
}

cmd_team_mode() {
  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    echo "solo"
    exit 0
  fi

  python3 - "$config_file" << PYEOF
import sys
${_PYTHON_MEMBER_PARSER}

members, _ = parse_members_and_roles(sys.argv[1])
print("solo" if len(members) <= 1 else "team")
PYEOF
}

cmd_resolve_member() {
  local mention="${1:-}"
  if [ -z "$mention" ]; then
    echo "ERROR: resolve-member requires MENTION" >&2
    exit 1
  fi
  mention="${mention#@}"

  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    echo "ERROR: No teamwork config found" >&2
    exit 1
  fi

  python3 - "$config_file" "$mention" << PYEOF
import sys
${_PYTHON_MEMBER_PARSER}

members, _ = parse_members_and_roles(sys.argv[1])
mention = sys.argv[2].lower()

if not members:
    print("ERROR: No members in config", file=sys.stderr)
    sys.exit(1)

# Priority 1: exact match on github/id (case-insensitive)
for m in members:
    gh = m.get('github', m.get('id', ''))
    if gh.lower() == mention:
        print(gh)
        sys.exit(0)

# Priority 2: exact match on name (case-insensitive)
for m in members:
    name = m.get('name', '')
    if name.lower() == mention:
        print(m.get('github', m.get('id', '')))
        sys.exit(0)

# Priority 3: partial match (case-insensitive, contains)
matches = []
for m in members:
    name = m.get('name', '').lower()
    gh = m.get('github', m.get('id', '')).lower()
    if mention in name or mention in gh:
        matches.append(m)

if len(matches) == 1:
    print(matches[0].get('github', matches[0].get('id', '')))
    sys.exit(0)
elif len(matches) > 1:
    print(f"ERROR: Ambiguous — '{mention}' matches multiple members:", file=sys.stderr)
    for m in matches:
        gh = m.get('github', m.get('id', ''))
        name = m.get('name', '')
        print(f"  @{gh} ({name})", file=sys.stderr)
    sys.exit(1)

available = [m.get('github', m.get('id', '')) for m in members]
print(f"ERROR: Member '@{mention}' not found. Available: {', '.join('@' + a for a in available)}", file=sys.stderr)
sys.exit(1)
PYEOF
}

cmd_list_members() {
  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    exit 0
  fi

  python3 - "$config_file" << PYEOF
import sys
${_PYTHON_MEMBER_PARSER}

members, _ = parse_members_and_roles(sys.argv[1])
for m in members:
    gh = m.get('github', m.get('id', ''))
    if not gh:
        continue
    name = m.get('name', gh)
    role = m.get('role', '')
    print(f"{gh}:{name}:{role}")
PYEOF
}

cmd_migrate() {
  # Migrate config.yml to current schema (idempotent)
  # 1. Ensure schema_version: 3
  # 2. Remove stale skill_version line (now in skill frontmatter only)
  # 3. Migrate worktree: section → git config --local

  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    echo "ERROR: No teamwork config found" >&2
    exit 3
  fi

  local changes=0

  # 1. schema_version → 3
  if grep -q "^schema_version:" "$config_file"; then
    if ! grep -q "^schema_version: 3$" "$config_file"; then
      sed -i '' "s/^schema_version:.*/schema_version: 3/" "$config_file"
      echo "Updated schema_version → 3"
      changes=$((changes + 1))
    fi
  else
    sed -i '' "1i\\
schema_version: 3" "$config_file"
    echo "Added schema_version: 3"
    changes=$((changes + 1))
  fi

  # 2. Remove skill_version (stale — version lives in skill frontmatter)
  if grep -q "^skill_version:" "$config_file"; then
    sed -i '' '/^skill_version:/d' "$config_file"
    echo "Removed stale skill_version line"
    changes=$((changes + 1))
  fi

  # 3. Migrate worktree: section → git config --local
  if grep -q "^worktree:" "$config_file"; then
    git config --local teamwork.worktree true 2>/dev/null || true
    sed -i '' '/^worktree:/,/^[^ #]/{ /^worktree:/d; /^  /d; }' "$config_file"
    echo "Migrated worktree → git config --local teamwork.worktree true"
    changes=$((changes + 1))
  fi

  if [ "$changes" -eq 0 ]; then
    echo "Config already up to date (schema v3, no stale fields)"
  else
    echo "Applied $changes migration(s)"
  fi
}

cmd_has_section() {
  # Check if a top-level section exists in config.yml
  # Usage: tw-config.sh has-section <section_name>
  # Handles label_prefix/labels dual-schema
  # Exit 0 = exists, Exit 1 = missing

  local section="${1:-}"
  if [ -z "$section" ]; then
    echo "ERROR: has-section requires SECTION name" >&2
    exit 1
  fi

  local config_file
  config_file=$(_detect_config)
  if [ -z "$config_file" ]; then
    exit 1
  fi

  if [ "$section" = "label_prefix" ]; then
    grep -q "^label_prefix:\|^labels:" "$config_file" && exit 0 || exit 1
  else
    grep -q "^${section}:" "$config_file" && exit 0 || exit 1
  fi
}

usage() {
  echo "Usage: tw-config.sh <subcommand|key> [args...]" >&2
  echo "Subcommands: detect-dir, resolve-labels, get-user-level, team-mode," >&2
  echo "             resolve-member, list-members, migrate, has-section" >&2
  echo "Key lookup:  tw-config.sh <dotted.key> [default]" >&2
  exit 1
}

# --- Main (backward-compatible routing) ---
case "${1:-}" in
  detect-dir)       cmd_detect_dir ;;
  resolve-labels)   cmd_resolve_labels ;;
  get-user-level)   shift; cmd_get_user_level "$@" ;;
  team-mode)        cmd_team_mode ;;
  resolve-member)   shift; cmd_resolve_member "$@" ;;
  list-members)     cmd_list_members ;;
  migrate)          cmd_migrate ;;
  has-section)      shift; cmd_has_section "$@" ;;
  -h|--help|help)   usage ;;
  "")               usage ;;
  *)                cmd_get "$@" ;;
esac
