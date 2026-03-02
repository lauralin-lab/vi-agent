#!/bin/bash
# Claude Code notification — bundled TTS voice + macOS banner
# Plays pre-generated sound files from ~/.claude/sounds/
# Skips subagent notifications.

INPUT=$(cat)

extract() {
  echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null
}

HOOK_EVENT=$(extract hook_event_name)
MESSAGE=$(extract message)
NOTIF_TYPE=$(extract notification_type)
CWD=$(extract cwd)

# ── Skip subagent events ──
IS_SUBAGENT=$(extract is_subagent)
SESSION_TYPE=$(extract session_type)
SUBAGENT_ID=$(extract subagent_id)

if [ "$IS_SUBAGENT" = "True" ] || [ "$IS_SUBAGENT" = "true" ]; then
  exit 0
fi
if [ "$SESSION_TYPE" = "subagent" ] || [ "$SESSION_TYPE" = "task" ]; then
  exit 0
fi
if [ -n "$SUBAGENT_ID" ] && [ "$SUBAGENT_ID" != "None" ] && [ "$SUBAGENT_ID" != "" ]; then
  exit 0
fi

# ── Project name ──
PROJECT=$(basename "$CWD" 2>/dev/null)

# ── Extract event-specific fields ──
LAST_MSG=$(extract last_assistant_message)
TEAMMATE_NAME=$(extract teammate_name)

# ── Helper: short summary from long text ──
short() {
  echo "$1" | tr '\n' ' ' | sed 's/^[[:space:]]*//' | head -c 100
}

# ── Sound file directory ──
SOUNDS_DIR="$HOME/.claude/sounds"

# ── Build summary (banner) + sound file (fixed per type) ──
# NEEDS_VOICE: only true for events requiring user intervention
SUMMARY=""
SOUND_FILE=""
NEEDS_VOICE=false

case "$HOOK_EVENT" in
  Notification)
    case "$NOTIF_TYPE" in
      permission_prompt)
        SUMMARY=$(short "$MESSAGE")
        [ -z "$SUMMARY" ] && SUMMARY="Permission required"
        SOUND_FILE="$SOUNDS_DIR/permission-required.mp3"
        NEEDS_VOICE=true
        ;;
      elicitation_dialog)
        SUMMARY=$(short "$MESSAGE")
        [ -z "$SUMMARY" ] && SUMMARY="Question for you"
        SOUND_FILE="$SOUNDS_DIR/waiting-for-input.mp3"
        NEEDS_VOICE=true
        ;;
      idle_prompt)
        SUMMARY="Waiting for input"
        SOUND_FILE="$SOUNDS_DIR/waiting-for-input.mp3"
        NEEDS_VOICE=true
        ;;
      auth_success)
        SUMMARY="Authentication successful"
        # No sound — success, no user action needed
        ;;
      *)
        SUMMARY=$(short "$MESSAGE")
        [ -z "$SUMMARY" ] && SUMMARY="Needs attention"
        SOUND_FILE="$SOUNDS_DIR/needs-attention.mp3"
        NEEDS_VOICE=true
        ;;
    esac
    ;;
  Stop)
    SUMMARY=$(short "$LAST_MSG")
    [ -z "$SUMMARY" ] && SUMMARY="Task complete"
    SOUND_FILE="$SOUNDS_DIR/task-complete.mp3"
    NEEDS_VOICE=true
    ;;
  TeammateIdle)
    if [ -n "$TEAMMATE_NAME" ] && [ "$TEAMMATE_NAME" != "None" ]; then
      SUMMARY="Teammate ${TEAMMATE_NAME} is idle"
    else
      SUMMARY="Teammate idle"
    fi
    SOUND_FILE="$SOUNDS_DIR/teammate-idle.mp3"
    ;;
  *)
    SUMMARY="Needs attention"
    SOUND_FILE="$SOUNDS_DIR/needs-attention.mp3"
    NEEDS_VOICE=true
    ;;
esac

# ── macOS notification banner ──
ESCAPED_PROJECT=$(echo "$PROJECT" | sed "s/\"/\\\\\"/g")
ESCAPED_SUMMARY=$(echo "$SUMMARY" | sed "s/\"/\\\\\"/g")

osascript -e "display notification \"${ESCAPED_SUMMARY}\" with title \"${ESCAPED_PROJECT}\""

# ── Play bundled sound — only for events requiring user intervention ──
if [ "$NEEDS_VOICE" = "true" ] && [ -f "$SOUND_FILE" ]; then
  afplay "$SOUND_FILE" &
fi

exit 0
