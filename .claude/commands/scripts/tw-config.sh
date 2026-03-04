#!/usr/bin/env bash
# tw-config.sh — Unified config value extractor for teamwork skills
#
# USAGE:
#   bash tw-config.sh <key> [default]
#
# EXAMPLES:
#   bash tw-config.sh project.test_command ""
#   bash tw-config.sh label_prefix.status "status:"
#   bash tw-config.sh conventions.base_branch "main"
#   bash tw-config.sh versions.current ""
#   bash tw-config.sh worktree.enabled "false"
#
# KEY FORMAT: dot-notation for nested keys (up to 2 levels)
#   - "project.test_command"  → yaml: project:\n  test_command: "..."
#   - "label_prefix.status"   → yaml: label_prefix:\n  status: "status:"
#   - "schema_version"        → yaml: schema_version: 1
#
# HANDLES:
#   - Values containing colons (e.g., label_prefix.status: "status:")
#   - Quoted and unquoted values
#   - Missing keys (returns default)
#   - Both .teamwork/config.yml and .teamspace/config.yml

KEY="${1:-}"
DEFAULT="${2:-}"

if [ -z "$KEY" ]; then
  echo "Usage: tw-config.sh <key> [default]" >&2
  exit 1
fi

# Detect config file
if [ -f ".teamwork/config.yml" ]; then
  CONFIG_FILE=".teamwork/config.yml"
elif [ -f ".teamspace/config.yml" ]; then
  CONFIG_FILE=".teamspace/config.yml"
else
  echo "$DEFAULT"
  exit 0
fi

# Use Python3 for robust YAML parsing (handles colon-containing values correctly)
python3 - "$CONFIG_FILE" "$KEY" "$DEFAULT" << 'PYEOF'
import sys

config_file = sys.argv[1]
key_path = sys.argv[2]
default = sys.argv[3] if len(sys.argv) > 3 else ""

def strip_val(raw):
    """Extract YAML scalar value, stripping quotes and inline comments."""
    v = raw.strip()
    if not v:
        return ''
    # If quoted: extract content between first matching pair of quotes
    if v[0] in ('"', "'"):
        q = v[0]
        end = v.find(q, 1)
        return v[1:end] if end > 0 else v.strip(q)
    # Unquoted: strip inline comment (space + # ...)
    for marker in ('  #', ' #'):
        pos = v.find(marker)
        if pos >= 0:
            v = v[:pos]
    return v.strip()

def parse_simple_yaml(filepath):
    """Parse a subset of YAML: flat keys + 1-level nesting. No arrays."""
    result = {}
    current_section = None

    try:
        with open(filepath) as f:
            for line in f:
                line = line.rstrip('\n')

                # Skip empty lines and comments
                if not line.strip() or line.strip().startswith('#'):
                    continue

                # Section header (no leading spaces, ends with colon, no value)
                if not line.startswith(' ') and not line.startswith('\t') and ':' in line:
                    parts = line.split(':', 1)
                    section_key = parts[0].strip()
                    section_val = strip_val(parts[1])

                    if section_val == '' or section_val == '|' or section_val == '>':
                        # Section header — subsequent indented lines belong to this section
                        current_section = section_key
                    else:
                        # Top-level key: value
                        result[section_key] = section_val
                        current_section = section_key  # in case sub-keys follow

                # Indented key: value (belongs to current_section)
                elif (line.startswith('  ') or line.startswith('\t')) and ':' in line:
                    if current_section is None:
                        continue
                    stripped = line.strip()
                    parts = stripped.split(':', 1)
                    sub_key = parts[0].strip()
                    sub_val = strip_val(parts[1]) if len(parts) > 1 else ''
                    if sub_val != '' and sub_val not in ('|', '>'):
                        result[current_section + '.' + sub_key] = sub_val

    except (IOError, OSError):
        pass

    return result

config = parse_simple_yaml(config_file)
value = config.get(key_path, default)
print(value)
PYEOF
