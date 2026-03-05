#!/usr/bin/env bash
# tw-notify.sh — Notification abstraction layer for teamwork skills
#
# Sends notifications to configured channels (Slack, Feishu, custom webhooks)
# for team events like mission creation, completion, reviews, etc.
#
# USAGE:
#   bash tw-notify.sh {event} [--key value ...]
#
# EVENTS:
#   mc.created              -- Mission Contract created
#   mc.completed            -- Mission Contract submitted for review
#   milestone.created       -- Milestone created
#   milestone.done          -- Milestone completed
#   review.requested        -- Review requested
#   review.changes_requested -- Changes requested on review
#   review.approved         -- Review approved and merged
#
# EXAMPLES:
#   bash tw-notify.sh mc.created --issue 42 --title "Fix camera" --assignee "casey" --branch "mission/42-fix-camera"
#   bash tw-notify.sh mc.completed --issue 42 --title "Fix camera" --assignee "casey" --pr "https://github.com/.../pull/1"
#   bash tw-notify.sh milestone.created --title "V0.2" --mc_count 5
#   bash tw-notify.sh milestone.done --title "V0.2"
#   bash tw-notify.sh review.approved --issue 42 --assignee "casey"
#   bash tw-notify.sh review.changes_requested --issue 42 --assignee "casey" --feedback "Add tests"
#
# EXIT CODES:
#   0 — always (non-fatal: notification failures warn but do not block callers)
#
# READS: .teamwork/config.yml via tw-config.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TW_CONFIG="$SCRIPT_DIR/tw-config.sh"

usage() {
  echo "Usage: tw-notify.sh {event} [--key value ...]" >&2
  echo "" >&2
  echo "Events:" >&2
  echo "  mc.created, mc.completed, milestone.created, milestone.done," >&2
  echo "  review.requested, review.changes_requested, review.approved" >&2
  echo "" >&2
  echo "Common flags:" >&2
  echo "  --issue N          Issue number" >&2
  echo "  --title TEXT       Title string" >&2
  echo "  --assignee USER    GitHub username" >&2
  echo "  --branch NAME      Branch name" >&2
  echo "  --pr URL           Pull request URL" >&2
  echo "  --feedback TEXT     Review feedback" >&2
  echo "  --mc_count N       Number of MCs in milestone" >&2
  exit 0
}

# --- Parse arguments ---
EVENT="${1:-}"
[ -z "$EVENT" ] && usage
shift

PARAM_ISSUE=""
PARAM_TITLE=""
PARAM_ASSIGNEE=""
PARAM_BRANCH=""
PARAM_PR=""
PARAM_FEEDBACK=""
PARAM_MC_COUNT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --issue)      PARAM_ISSUE="${2:-}"; shift 2 ;;
    --title)      PARAM_TITLE="${2:-}"; shift 2 ;;
    --assignee)   PARAM_ASSIGNEE="${2:-}"; shift 2 ;;
    --branch)     PARAM_BRANCH="${2:-}"; shift 2 ;;
    --pr)         PARAM_PR="${2:-}"; shift 2 ;;
    --feedback)   PARAM_FEEDBACK="${2:-}"; shift 2 ;;
    --mc_count)   PARAM_MC_COUNT="${2:-}"; shift 2 ;;
    *)            shift ;;
  esac
done

# --- Read config ---
REPO=$(bash "$TW_CONFIG" team.repo "" 2>/dev/null)

# Parse notifications section directly (tw-config.sh can't handle nested lists).
# Returns: "enabled|channel1,channel2" or "disabled|" or "no_event|"
parse_notifications() {
  local config_file=""
  if [ -f ".teamwork/config.yml" ]; then
    config_file=".teamwork/config.yml"
  else
    echo "disabled|"
    return
  fi

  python3 - "$config_file" "$EVENT" << 'PYEOF'
import sys, re

config_file = sys.argv[1]
event = sys.argv[2]

with open(config_file) as f:
    content = f.read()

# Find notifications section
m = re.search(r'^notifications:\s*\n((?:[ \t]+.*\n)*)', content, re.MULTILINE)
if not m:
    print("disabled|")
    sys.exit(0)

notif_block = m.group(1)

# Check enabled (direct child, 2-space indent only)
enabled_match = re.search(r'^  enabled:\s*(\S+)', notif_block, re.MULTILINE)
if not enabled_match or enabled_match.group(1).lower() != 'true':
    print("disabled|")
    sys.exit(0)

# Find event channels
# Format: "    mc.created: [slack, feishu]"
# Events are under "  events:" subsection
events_match = re.search(r'^  events:\s*\n((?:[ \t]{4,}.*\n)*)', notif_block, re.MULTILINE)
if not events_match:
    print("no_event|")
    sys.exit(0)

events_block = events_match.group(1)
# Escape dots in event name for regex
event_escaped = re.escape(event)
chan_match = re.search(r'^\s+' + event_escaped + r':\s*\[([^\]]*)\]', events_block, re.MULTILINE)
if not chan_match:
    print("no_event|")
    sys.exit(0)

channels = [c.strip() for c in chan_match.group(1).split(',') if c.strip()]
print("enabled|" + ",".join(channels))
PYEOF
}

NOTIF_RESULT=$(parse_notifications)
NOTIF_STATUS="${NOTIF_RESULT%%|*}"
NOTIF_CHANNELS="${NOTIF_RESULT#*|}"

if [ "$NOTIF_STATUS" = "disabled" ]; then
  echo "Notifications disabled (notifications.enabled != true)" >&2
  exit 0
fi

if [ "$NOTIF_STATUS" = "no_event" ] || [ -z "$NOTIF_CHANNELS" ]; then
  echo "No channels configured for event: $EVENT" >&2
  exit 0
fi

# Split channels by comma into newline-separated list
CHANNELS=$(echo "$NOTIF_CHANNELS" | tr ',' '\n')

# --- Build GitHub URL ---
ISSUE_URL=""
PR_URL="$PARAM_PR"
if [ -n "$REPO" ] && [ -n "$PARAM_ISSUE" ]; then
  ISSUE_URL="https://github.com/${REPO}/issues/${PARAM_ISSUE}"
fi

# --- Format message per event ---
format_title() {
  case "$EVENT" in
    mc.created)            echo "Mission Created: #${PARAM_ISSUE} ${PARAM_TITLE}" ;;
    mc.completed)          echo "Mission Completed: #${PARAM_ISSUE} ${PARAM_TITLE}" ;;
    milestone.created)     echo "Milestone Created: ${PARAM_TITLE}" ;;
    milestone.done)        echo "Milestone Done: ${PARAM_TITLE}" ;;
    review.requested)      echo "Review Requested: #${PARAM_ISSUE}" ;;
    review.changes_requested) echo "Changes Requested: #${PARAM_ISSUE}" ;;
    review.approved)       echo "Review Approved: #${PARAM_ISSUE}" ;;
    *)                     echo "Event: $EVENT" ;;
  esac
}

format_body() {
  local body=""
  case "$EVENT" in
    mc.created)
      body="Assignee: @${PARAM_ASSIGNEE}\nBranch: ${PARAM_BRANCH}"
      [ -n "$ISSUE_URL" ] && body="${body}\nIssue: ${ISSUE_URL}"
      ;;
    mc.completed)
      body="Submitted by: @${PARAM_ASSIGNEE}"
      [ -n "$PARAM_PR" ] && body="${body}\nPR: ${PARAM_PR}"
      [ -n "$ISSUE_URL" ] && body="${body}\nIssue: ${ISSUE_URL}"
      ;;
    milestone.created)
      body="Mission Contracts: ${PARAM_MC_COUNT:-0}"
      ;;
    milestone.done)
      body="All missions in ${PARAM_TITLE} have been completed."
      ;;
    review.requested)
      body="Assignee: @${PARAM_ASSIGNEE}"
      [ -n "$ISSUE_URL" ] && body="${body}\nIssue: ${ISSUE_URL}"
      ;;
    review.changes_requested)
      body="Assignee: @${PARAM_ASSIGNEE}\nFeedback: ${PARAM_FEEDBACK}"
      [ -n "$ISSUE_URL" ] && body="${body}\nIssue: ${ISSUE_URL}"
      ;;
    review.approved)
      body="Assignee: @${PARAM_ASSIGNEE}"
      [ -n "$ISSUE_URL" ] && body="${body}\nIssue: ${ISSUE_URL}"
      ;;
    *)
      body="No details available."
      ;;
  esac
  echo "$body"
}

MSG_TITLE=$(format_title)
MSG_BODY=$(format_body)

# Track which channels were notified
NOTIFIED=""

# --- Read channel configs ---
# We need to iterate config channels to find webhook URLs and enabled status.
# Config structure:
#   notifications.channels is a list, which tw-config.sh can't parse directly.
#   We use Python to extract channel details from the config file.

get_channel_config() {
  local channel_type="$1"
  local field="$2"

  # Detect config file
  local config_file=""
  if [ -f ".teamwork/config.yml" ]; then
    config_file=".teamwork/config.yml"
  else
    echo ""
    return
  fi

  python3 - "$config_file" "$channel_type" "$field" << 'PYEOF'
import sys, re

config_file = sys.argv[1]
target_type = sys.argv[2]
target_field = sys.argv[3]

with open(config_file) as f:
    lines = f.readlines()

in_channels = False
current_item = {}
result = None

for line in lines:
    stripped = line.rstrip('\n')

    # Detect notifications.channels section
    if re.match(r'\s+channels:', stripped):
        in_channels = True
        continue

    if in_channels:
        # End of channels section (non-indented or different section)
        if stripped and not stripped.startswith(' ') and not stripped.startswith('#'):
            in_channels = False
            continue

        # New list item
        m = re.match(r'\s+- (\w+):\s*(.*)', stripped)
        if m:
            # Save previous item if it matches
            if current_item.get('type') == target_type:
                result = current_item.get(target_field, '')
                break
            current_item = {m.group(1): m.group(2).strip().strip('"').strip("'")}
            continue

        # Continuation of current list item
        m = re.match(r'\s+(\w+):\s*(.*)', stripped)
        if m:
            current_item[m.group(1)] = m.group(2).strip().strip('"').strip("'")

# Check last item
if result is None and current_item.get('type') == target_type:
    result = current_item.get(target_field, '')

print(result if result else '')
PYEOF
}

# --- Send to each channel ---
for CHANNEL in $CHANNELS; do
  CHANNEL_ENABLED=$(get_channel_config "$CHANNEL" "enabled")
  if [ "$CHANNEL_ENABLED" = "false" ]; then
    echo "Channel '$CHANNEL' is disabled, skipping" >&2
    continue
  fi

  case "$CHANNEL" in
    slack)
      WEBHOOK=$(get_channel_config "slack" "webhook")
      SLACK_CHANNEL=$(get_channel_config "slack" "channel")

      if [ -z "$WEBHOOK" ] && [ -z "$SLACK_CHANNEL" ]; then
        echo "WARNING: Slack channel has no webhook or channel configured" >&2
        continue
      fi

      # Build Slack payload (markdown blocks)
      SLACK_TEXT=$(printf '%s\n%b' "$MSG_TITLE" "$MSG_BODY")
      SLACK_PAYLOAD=$(python3 -c "
import json, sys
text = sys.argv[1]
payload = {
    'text': text,
    'blocks': [
        {'type': 'header', 'text': {'type': 'plain_text', 'text': sys.argv[2]}},
        {'type': 'section', 'text': {'type': 'mrkdwn', 'text': sys.argv[3]}}
    ]
}
print(json.dumps(payload))
" "$SLACK_TEXT" "$MSG_TITLE" "$(echo -e "$MSG_BODY")")

      if [ -n "$WEBHOOK" ]; then
        if curl -s -o /dev/null -w '' -X POST -H 'Content-Type: application/json' \
           -d "$SLACK_PAYLOAD" "$WEBHOOK" 2>/dev/null; then
          NOTIFIED="${NOTIFIED:+$NOTIFIED, }slack"
        else
          echo "WARNING: Slack webhook notification failed" >&2
        fi
      else
        echo "Slack: no webhook URL configured (channel: $SLACK_CHANNEL)" >&2
      fi
      ;;

    feishu)
      WEBHOOK=$(get_channel_config "feishu" "webhook")

      if [ -z "$WEBHOOK" ]; then
        echo "WARNING: Feishu channel has no webhook configured" >&2
        continue
      fi

      # Build Feishu interactive card payload
      BUTTON_URL="${PARAM_PR:-$ISSUE_URL}"
      FEISHU_PAYLOAD=$(python3 -c "
import json, sys

title = sys.argv[1]
body = sys.argv[2]
url = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else ''

card = {
    'msg_type': 'interactive',
    'card': {
        'header': {
            'title': {'tag': 'plain_text', 'content': title}
        },
        'elements': [
            {'tag': 'div', 'text': {'tag': 'lark_md', 'content': body}}
        ]
    }
}

if url:
    card['card']['elements'].append({
        'tag': 'action',
        'actions': [{
            'tag': 'button',
            'text': {'tag': 'plain_text', 'content': 'View on GitHub'},
            'url': url,
            'type': 'primary'
        }]
    })

print(json.dumps(card, ensure_ascii=False))
" "$MSG_TITLE" "$(echo -e "$MSG_BODY")" "$BUTTON_URL")

      if curl -s -o /dev/null -w '' -X POST -H 'Content-Type: application/json' \
         -d "$FEISHU_PAYLOAD" "$WEBHOOK" 2>/dev/null; then
        NOTIFIED="${NOTIFIED:+$NOTIFIED, }feishu"
      else
        echo "WARNING: Feishu webhook notification failed" >&2
      fi
      ;;

    webhook)
      WEBHOOK=$(get_channel_config "webhook" "webhook")
      [ -z "$WEBHOOK" ] && WEBHOOK=$(get_channel_config "webhook" "url")

      if [ -z "$WEBHOOK" ]; then
        echo "WARNING: Custom webhook has no URL configured" >&2
        continue
      fi

      # Raw JSON payload
      WEBHOOK_PAYLOAD=$(python3 -c "
import json, sys
payload = {
    'event': sys.argv[1],
    'title': sys.argv[2],
    'body': sys.argv[3],
    'params': {}
}
# Parse remaining args as key=value pairs
i = 4
while i < len(sys.argv) - 1:
    payload['params'][sys.argv[i]] = sys.argv[i+1]
    i += 2
print(json.dumps(payload, ensure_ascii=False))
" "$EVENT" "$MSG_TITLE" "$(echo -e "$MSG_BODY")" \
  "issue" "$PARAM_ISSUE" "assignee" "$PARAM_ASSIGNEE" \
  "branch" "$PARAM_BRANCH" "pr" "$PARAM_PR")

      if curl -s -o /dev/null -w '' -X POST -H 'Content-Type: application/json' \
         -d "$WEBHOOK_PAYLOAD" "$WEBHOOK" 2>/dev/null; then
        NOTIFIED="${NOTIFIED:+$NOTIFIED, }webhook"
      else
        echo "WARNING: Custom webhook notification failed" >&2
      fi
      ;;

    *)
      echo "WARNING: Unknown channel type: $CHANNEL" >&2
      ;;
  esac
done

# --- Output result ---
if [ -n "$NOTIFIED" ]; then
  echo "Notified: $NOTIFIED"
else
  echo "No notifications sent (channels disabled or not configured)"
fi

exit 0
