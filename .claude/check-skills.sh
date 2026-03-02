#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Check if user-level skills are installed and up to date.
# Returns exit code 0 if all good, 1 if update needed.
# Output: JSON-like status for Claude to parse.
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DST="$CLAUDE_DIR/commands"

SKILLS="drive.md architect.md self-drive.md improve-user.md"
STATUS="ok"
ISSUES=""

# Check 1: Are skills installed at all?
for skill in $SKILLS; do
  if [ ! -e "$COMMANDS_DST/$skill" ]; then
    STATUS="missing"
    ISSUES+="missing:$skill "
  fi
done

# Check 2: Are symlinks pointing to THIS repo?
if [ "$STATUS" = "ok" ]; then
  for skill in $SKILLS; do
    if [ -L "$COMMANDS_DST/$skill" ]; then
      target=$(readlink "$COMMANDS_DST/$skill")
      if [ "$target" != "$SCRIPT_DIR/skills/$skill" ]; then
        STATUS="stale"
        ISSUES+="wrong-source:$skill "
      fi
    elif [ -f "$COMMANDS_DST/$skill" ]; then
      STATUS="stale"
      ISSUES+="not-symlinked:$skill "
    fi
  done
fi

# Check 3: Are repo skill files newer than installed?
if [ "$STATUS" = "ok" ]; then
  md5_cmd="md5sum"
  if command -v md5 &>/dev/null; then
    md5_cmd="md5 -q"
  fi

  if [ -f "$CLAUDE_DIR/.skill-versions" ]; then
    for skill in $SKILLS; do
      repo_hash=$($md5_cmd "$SCRIPT_DIR/skills/$skill" 2>/dev/null | awk '{print $1}')
      installed_hash=$(grep "  ${skill}$" "$CLAUDE_DIR/.skill-versions" 2>/dev/null | awk '{print $1}')
      if [ "$repo_hash" != "$installed_hash" ]; then
        STATUS="outdated"
        ISSUES+="updated:$skill "
      fi
    done
  fi
fi

# Output
echo "status=$STATUS"
if [ -n "$ISSUES" ]; then
  echo "issues=$ISSUES"
fi
exit $( [ "$STATUS" = "ok" ] && echo 0 || echo 1 )
