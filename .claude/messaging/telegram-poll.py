#!/usr/bin/env python3
"""Poll Telegram for reply message from a specific chat.

Usage:
    ~/.claude/telegram-poll.py [timeout_seconds]

Default timeout: 1800 (30 minutes).
Prints the reply text to stdout and exits 0.
Exits 1 with "TIMEOUT" on stderr if no reply within timeout.
"""
import json, urllib.request, sys, os, time

CONFIG_PATH = os.path.expanduser("~/.claude/self-drive.json")
OFFSET_PATH = os.path.expanduser("~/.claude/telegram-offset.txt")


def get_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def api_call(bot_token, method, params=None):
    url = f"https://api.telegram.org/bot{bot_token}/{method}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    try:
        resp = urllib.request.urlopen(url, timeout=40)
        return json.loads(resp.read())
    except Exception:
        return None


def get_offset(bot_token):
    """Read saved offset or initialize from latest update."""
    if os.path.exists(OFFSET_PATH):
        with open(OFFSET_PATH) as f:
            try:
                return int(f.read().strip())
            except ValueError:
                pass

    # Skip all existing messages — start fresh
    data = api_call(bot_token, "getUpdates")
    if data and data.get("result"):
        return data["result"][-1]["update_id"] + 1
    return 0


def save_offset(offset):
    with open(OFFSET_PATH, "w") as f:
        f.write(str(offset))


def main():
    timeout = int(sys.argv[1]) if len(sys.argv) > 1 else 1800

    config = get_config()
    bot_token = config["telegram"]["bot_token"]
    chat_id = str(config["telegram"]["chat_id"])
    offset = get_offset(bot_token)

    start = time.time()

    while time.time() - start < timeout:
        data = api_call(bot_token, "getUpdates", {
            "offset": offset,
            "timeout": 30,  # Telegram long-poll (seconds)
        })

        if not data or not data.get("ok"):
            time.sleep(5)
            continue

        for update in data.get("result", []):
            uid = update["update_id"]
            offset = uid + 1  # always advance past processed updates

            msg = update.get("message", {})
            msg_chat_id = str(msg.get("chat", {}).get("id", ""))
            text = msg.get("text", "")

            if msg_chat_id == chat_id and text:
                save_offset(offset)
                print(text)
                return

        # Save offset even if no matching message (skip non-matching updates)
        save_offset(offset)

    # Timeout
    print("TIMEOUT", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
