#!/usr/bin/env python3
"""Poll Slack DM for reply message from the user (API fallback).

Fallback for when Socket Mode (slack-listen.py) is unavailable.
Uses exponential backoff to minimize API calls.

Usage:
    ~/.claude/slack-poll.py              # no timeout, wait forever
    ~/.claude/slack-poll.py 0            # no timeout, wait forever
    ~/.claude/slack-poll.py 3600         # 1 hour timeout

Prints the reply text to stdout and exits 0.
Also writes reply to ~/.claude/slack-reply.txt for compatibility.
"""
import json
import os
import sys
import time
import urllib.request

CONFIG_PATH = os.path.expanduser("~/.claude/self-drive.json")
CURSOR_PATH = os.path.expanduser("~/.claude/slack-poll-cursor.txt")
REPLY_PATH = os.path.expanduser("~/.claude/slack-reply.txt")

# Backoff: start at 3s, increase to max 30s between polls
POLL_INITIAL = 3
POLL_MAX = 30
POLL_FACTOR = 1.5


def slack_api(token, method, params=None):
    url = f"https://slack.com/api/{method}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += f"?{qs}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read())
    except Exception:
        return None


def get_last_ts():
    if os.path.exists(CURSOR_PATH):
        with open(CURSOR_PATH) as f:
            try:
                return f.read().strip()
            except Exception:
                pass
    return None


def save_last_ts(ts):
    with open(CURSOR_PATH, "w") as f:
        f.write(ts)


def get_bot_user_id(token):
    result = slack_api(token, "auth.test")
    if result and result.get("ok"):
        return result["user_id"]
    return None


def write_reply(text):
    with open(REPLY_PATH, "w") as f:
        f.write(text)


def main():
    timeout = int(sys.argv[1]) if len(sys.argv) > 1 else 0  # 0 = no timeout

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    bot_token = config["slack"]["bot_token"]
    channel_id = config["slack"]["channel_id"]
    bot_user_id = get_bot_user_id(bot_token)

    # Initialize cursor: mark current time so we only get NEW messages
    last_ts = get_last_ts()
    if not last_ts:
        last_ts = str(time.time())
        save_last_ts(last_ts)

    start = time.time()
    poll_interval = POLL_INITIAL

    while True:
        # Check timeout (0 = infinite)
        if timeout > 0 and (time.time() - start) >= timeout:
            print("TIMEOUT", file=sys.stderr)
            sys.exit(1)

        params = {
            "channel": channel_id,
            "oldest": last_ts,
            "limit": "10",
        }
        data = slack_api(bot_token, "conversations.history", params)

        if not data or not data.get("ok"):
            time.sleep(poll_interval)
            poll_interval = min(poll_interval * POLL_FACTOR, POLL_MAX)
            continue

        messages = data.get("messages", [])
        messages.reverse()  # oldest first

        for msg in messages:
            ts = msg.get("ts", "")
            user = msg.get("user", "")
            text = msg.get("text", "")

            # Skip bot's own messages
            if user == bot_user_id:
                last_ts = ts
                save_last_ts(last_ts)
                continue

            # Found a human reply
            if text and ts > last_ts:
                save_last_ts(ts)
                write_reply(text)
                print(text)
                return

        # No new messages — backoff
        time.sleep(poll_interval)
        poll_interval = min(poll_interval * POLL_FACTOR, POLL_MAX)


if __name__ == "__main__":
    main()
