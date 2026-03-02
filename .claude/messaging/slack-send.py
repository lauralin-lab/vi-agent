#!/usr/bin/env python3
"""Send message via Slack Bot API.

Usage:
    ~/.claude/slack-send.py "Your message here"
    echo "multiline message" | ~/.claude/slack-send.py --stdin
"""
import json, urllib.request, sys, os

CONFIG_PATH = os.path.expanduser("~/.claude/self-drive.json")


def slack_api(token, method, payload):
    url = f"https://slack.com/api/{method}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": f"Bearer {token}",
    })
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())


def main():
    if not os.path.exists(CONFIG_PATH):
        print(f"ERROR: {CONFIG_PATH} not found.", file=sys.stderr)
        sys.exit(1)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    bot_token = config["slack"]["bot_token"]
    channel_id = config["slack"]["channel_id"]

    if not bot_token or not channel_id:
        print("ERROR: bot_token or channel_id not configured", file=sys.stderr)
        sys.exit(1)

    # Get message from args or stdin
    if len(sys.argv) > 1 and sys.argv[1] == "--stdin":
        message = sys.stdin.read().strip()
    elif len(sys.argv) > 1:
        message = " ".join(sys.argv[1:])
    else:
        message = sys.stdin.read().strip()

    if not message:
        print("ERROR: No message provided", file=sys.stderr)
        sys.exit(1)

    result = slack_api(bot_token, "chat.postMessage", {
        "channel": channel_id,
        "text": message,
    })

    if result.get("ok"):
        print(f"OK:{result['ts']}")
    else:
        print(f"ERROR:{result.get('error', 'unknown')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
