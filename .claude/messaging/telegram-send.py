#!/usr/bin/env python3
"""Send message via Telegram Bot API.

Usage:
    ~/.claude/telegram-send.py "Your message here"
    echo "multiline\nmessage" | ~/.claude/telegram-send.py --stdin
"""
import json, urllib.request, sys, os

CONFIG_PATH = os.path.expanduser("~/.claude/self-drive.json")


def main():
    if not os.path.exists(CONFIG_PATH):
        print(f"ERROR: {CONFIG_PATH} not found. Run self-drive setup first.", file=sys.stderr)
        sys.exit(1)

    with open(CONFIG_PATH) as f:
        config = json.load(f)

    bot_token = config["telegram"]["bot_token"]
    chat_id = config["telegram"]["chat_id"]

    if not bot_token or not chat_id:
        print("ERROR: bot_token or chat_id not configured", file=sys.stderr)
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

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": message}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        result = json.loads(resp.read())
        if result.get("ok"):
            print(f"OK:{result['result']['message_id']}")
        else:
            print(f"ERROR:{result.get('description', 'unknown')}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"ERROR:{e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
