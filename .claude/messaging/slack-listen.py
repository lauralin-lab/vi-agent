#!/usr/bin/env python3
"""Slack Socket Mode real-time listener.

Connects via WebSocket and waits for the user's reply in the configured
DM channel. When a message arrives, writes it to ~/.claude/slack-reply.txt
and prints it to stdout.

No timeout — runs forever until a reply is received.

Usage:
    python3 ~/.claude/slack-listen.py              # foreground, blocks until reply
    python3 ~/.claude/slack-listen.py --check      # just check if reply file exists
    python3 ~/.claude/slack-listen.py --clear      # clear previous reply file
    python3 ~/.claude/slack-listen.py --stop       # stop any running listener
"""
import asyncio
import json
import os
import signal
import sys
import time
import urllib.request

CONFIG_PATH = os.path.expanduser("~/.claude/self-drive.json")
REPLY_PATH = os.path.expanduser("~/.claude/slack-reply.txt")
PID_PATH = os.path.expanduser("~/.claude/slack-listen.pid")
LOG_PATH = os.path.expanduser("~/.claude/slack-listen.log")


def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    try:
        with open(LOG_PATH, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass
    print(line, file=sys.stderr)


def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def get_ws_url(app_token):
    """Get a fresh WebSocket URL via apps.connections.open."""
    data = json.dumps({}).encode()
    req = urllib.request.Request(
        "https://slack.com/api/apps.connections.open",
        data=data,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {app_token}",
        },
    )
    resp = urllib.request.urlopen(req, timeout=15)
    result = json.loads(resp.read())
    if result.get("ok"):
        return result["url"]
    raise RuntimeError(f"apps.connections.open failed: {result.get('error')}")


def get_bot_user_id(bot_token):
    req = urllib.request.Request(
        "https://slack.com/api/auth.test",
        headers={"Authorization": f"Bearer {bot_token}"},
    )
    resp = urllib.request.urlopen(req, timeout=15)
    result = json.loads(resp.read())
    return result.get("user_id") if result.get("ok") else None


def write_reply(text):
    """Write user reply to file."""
    with open(REPLY_PATH, "w") as f:
        f.write(text)


def write_pid():
    with open(PID_PATH, "w") as f:
        f.write(str(os.getpid()))


def cleanup_pid():
    try:
        if os.path.exists(PID_PATH):
            with open(PID_PATH) as f:
                if f.read().strip() == str(os.getpid()):
                    os.remove(PID_PATH)
    except Exception:
        pass


def stop_existing():
    """Stop any existing listener process."""
    if os.path.exists(PID_PATH):
        try:
            with open(PID_PATH) as f:
                pid = int(f.read().strip())
            os.kill(pid, signal.SIGTERM)
            log(f"Stopped existing listener (PID {pid})")
            os.remove(PID_PATH)
        except ProcessLookupError:
            os.remove(PID_PATH)
        except Exception as e:
            log(f"Warning stopping existing listener: {e}")


async def listen(config):
    import websockets

    app_token = config["slack"]["app_token"]
    bot_token = config["slack"]["bot_token"]
    channel_id = config["slack"]["channel_id"]
    bot_user_id = get_bot_user_id(bot_token)

    log(f"Listener started (PID {os.getpid()})")
    log(f"Bot user: {bot_user_id}, Channel: {channel_id}")
    log("Waiting for user reply via Socket Mode...")

    # Clear previous reply
    if os.path.exists(REPLY_PATH):
        os.remove(REPLY_PATH)

    reconnect_delay = 1

    while True:
        try:
            ws_url = get_ws_url(app_token)
            log("WebSocket connected")
            reconnect_delay = 1  # reset on successful connect

            async with websockets.connect(ws_url, ping_interval=30) as ws:
                async for raw in ws:
                    data = json.loads(raw)
                    envelope_id = data.get("envelope_id")
                    msg_type = data.get("type")

                    # Must acknowledge all envelopes
                    if envelope_id:
                        ack = json.dumps({"envelope_id": envelope_id})
                        await ws.send(ack)

                    # Handle events_api envelope (user messages)
                    if msg_type == "events_api":
                        event = data.get("payload", {}).get("event", {})
                        ev_type = event.get("type")
                        ev_channel = event.get("channel")
                        ev_user = event.get("user")
                        ev_subtype = event.get("subtype")
                        ev_text = event.get("text", "").strip()

                        if (
                            ev_type == "message"
                            and ev_channel == channel_id
                            and ev_user != bot_user_id
                            and not ev_subtype
                            and ev_text
                        ):
                            log(f"Reply received: {ev_text[:80]}")
                            write_reply(ev_text)
                            print(ev_text)
                            return

                    # Handle disconnect request from Slack
                    if msg_type == "disconnect":
                        reason = data.get("reason", "unknown")
                        log(f"Slack requested disconnect: {reason}")
                        break  # reconnect

        except asyncio.CancelledError:
            log("Listener cancelled")
            return
        except Exception as e:
            log(f"Connection error: {e}")

        # Exponential backoff for reconnect (1s, 2s, 4s, ..., max 30s)
        log(f"Reconnecting in {reconnect_delay}s...")
        await asyncio.sleep(reconnect_delay)
        reconnect_delay = min(reconnect_delay * 2, 30)


def cmd_check():
    """Check if a reply is available."""
    if os.path.exists(REPLY_PATH):
        with open(REPLY_PATH) as f:
            text = f.read().strip()
        if text:
            print(text)
            sys.exit(0)
    sys.exit(1)


def cmd_clear():
    """Clear reply file."""
    if os.path.exists(REPLY_PATH):
        os.remove(REPLY_PATH)
    print("Reply file cleared")


def cmd_stop():
    """Stop any running listener."""
    stop_existing()
    print("Listener stopped")


def main():
    if "--check" in sys.argv:
        cmd_check()
        return
    if "--clear" in sys.argv:
        cmd_clear()
        return
    if "--stop" in sys.argv:
        cmd_stop()
        return

    config = load_config()

    # Stop any existing listener before starting new one
    stop_existing()
    write_pid()

    # Handle graceful shutdown
    def handle_signal(sig, frame):
        cleanup_pid()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    try:
        asyncio.run(listen(config))
    except KeyboardInterrupt:
        log("Interrupted")
    finally:
        cleanup_pid()


if __name__ == "__main__":
    main()
