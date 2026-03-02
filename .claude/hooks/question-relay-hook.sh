#!/bin/bash
# Claude Code hook: handle AskUserQuestion in all modes
# ─────────────────────────────────────────────────────────────
# Interactive mode (default):
#   PreToolUse:  show macOS dialog, block tool with user's answer
#   PostToolUse: no-op
#
# Self-drive mode (CLAUDE_SELF_DRIVE or marker file):
#   PreToolUse:  save question data + start Slack relay
#   PostToolUse: cancel relay + cleanup

INPUT=$(cat)

PENDING="$HOME/.claude/pending-question.json"
RELAY_PID="$HOME/.claude/question-relay.pid"
SELF_DRIVE_MARKER="$HOME/.claude/slack-question-mode"

# ── Determine mode ──
IS_SELF_DRIVE=false
if [ -n "$CLAUDE_SELF_DRIVE" ]; then
  IS_SELF_DRIVE=true
elif [ -f "$SELF_DRIVE_MARKER" ]; then
  MARKER_AGE=$(( $(date +%s) - $(stat -f %m "$SELF_DRIVE_MARKER" 2>/dev/null || echo 0) ))
  if [ "$MARKER_AGE" -le 300 ]; then
    IS_SELF_DRIVE=true
  fi
fi

extract() {
  echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$1',''))" 2>/dev/null
}

HOOK_EVENT=$(extract hook_event_name)

# ── Skip subagent events ──
IS_SUBAGENT=$(extract is_subagent)
SESSION_TYPE=$(extract session_type)
SUBAGENT_ID=$(extract subagent_id)

if [ "$IS_SUBAGENT" = "True" ] || [ "$IS_SUBAGENT" = "true" ]; then exit 0; fi
if [ "$SESSION_TYPE" = "subagent" ] || [ "$SESSION_TYPE" = "task" ]; then exit 0; fi
if [ -n "$SUBAGENT_ID" ] && [ "$SUBAGENT_ID" != "None" ] && [ "$SUBAGENT_ID" != "" ]; then exit 0; fi

case "$HOOK_EVENT" in
  PreToolUse)
    if [ "$IS_SELF_DRIVE" = true ]; then
      # ── Self-drive mode: relay to Slack ──
      echo "$INPUT" | python3 -c "
import json, sys, time, os
data = json.load(sys.stdin)
q = data.get('tool_input', {})
q['timestamp'] = time.time()
with open(os.path.expanduser('$PENDING'), 'w') as f:
    json.dump(q, f, ensure_ascii=False)
" 2>/dev/null

      if [ -f "$RELAY_PID" ]; then
        kill "$(cat "$RELAY_PID")" 2>/dev/null
        rm -f "$RELAY_PID"
      fi

      nohup python3 "$HOME/.claude/slack-question-relay.py" >/dev/null 2>&1 &
    else
      # ── Interactive mode: let Claude Code's native terminal UI handle it ──
      # Don't intercept — exit 0 passes through to the native AskUserQuestion UI
      exit 0
    fi
    ;;

  PostToolUse)
    if [ -f "$RELAY_PID" ]; then
      kill "$(cat "$RELAY_PID")" 2>/dev/null
      rm -f "$RELAY_PID"
    fi
    rm -f "$PENDING"
    ;;
esac

exit 0
