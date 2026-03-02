#!/bin/bash
# Fish Audio TTS voice announcement for Claude Code
# Usage: ~/.claude/speak.sh "Your message here"
# Runs in background, never blocks the caller
#
# Setup: Set your Fish Audio API key below or via environment variable
#   export FISH_AUDIO_API_KEY="your-key-here"
#   Get one at: https://fish.audio

TEXT="$1"
if [ -z "$TEXT" ]; then
  exit 0
fi

# API key: environment variable takes precedence over hardcoded value
FISH_API_KEY="${FISH_AUDIO_API_KEY:-YOUR_FISH_AUDIO_API_KEY_HERE}"
# Voice reference ID — change this to use a different voice
FISH_MODEL_ID="${FISH_AUDIO_VOICE_ID:-8faa225dd3a54c4aa455771dd19e7cba}"
CACHE_DIR="$HOME/.claude/tts-cache"
mkdir -p "$CACHE_DIR"

if [ "$FISH_API_KEY" = "YOUR_FISH_AUDIO_API_KEY_HERE" ]; then
  # No API key configured — skip TTS silently
  exit 0
fi

# Cache key: md5 hash of text
HASH=$(echo -n "$TEXT" | md5 -q 2>/dev/null || echo -n "$TEXT" | md5sum | cut -d' ' -f1)
CACHE_FILE="$CACHE_DIR/${HASH}.mp3"

# If cached, play immediately
if [ -f "$CACHE_FILE" ] && [ -s "$CACHE_FILE" ]; then
  afplay "$CACHE_FILE" &
  exit 0
fi

# Call Fish Audio TTS API
TMP_FILE="/tmp/claude-tts-${HASH}.mp3"

HTTP_CODE=$(curl -s -w "%{http_code}" -X POST "https://api.fish.audio/v1/tts" \
  -H "Authorization: Bearer ${FISH_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "model: speech-1.6" \
  -d "{
    \"text\": $(echo "$TEXT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),
    \"reference_id\": \"${FISH_MODEL_ID}\",
    \"format\": \"mp3\",
    \"mp3_bitrate\": 64,
    \"latency\": \"balanced\"
  }" \
  -o "$TMP_FILE" 2>/dev/null)

# Verify the file is valid audio (not an error JSON)
if [ "$HTTP_CODE" = "200" ] && [ -f "$TMP_FILE" ] && [ -s "$TMP_FILE" ]; then
  # Check it's not a JSON error response
  if ! head -c 4 "$TMP_FILE" | grep -q '{'; then
    cp "$TMP_FILE" "$CACHE_FILE"
    afplay "$CACHE_FILE" &
  fi
fi

rm -f "$TMP_FILE" 2>/dev/null
exit 0
