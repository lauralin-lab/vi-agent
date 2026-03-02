#!/usr/bin/env python3
"""Slack question relay for Claude Code AskUserQuestion.

When Claude asks a question via AskUserQuestion and the user doesn't respond
within 60 seconds, this relay forwards the question to Slack. When the user
replies on Slack, the answer is injected back into the terminal.

If the user recently answered via Slack (slack-question-mode), subsequent
questions are forwarded immediately without waiting.

Spawned automatically by question-relay-hook.sh (PreToolUse hook).
Do not run manually.
"""
import fcntl
import json
import os
import signal
import subprocess
import sys
import time

PENDING_FILE = os.path.expanduser("~/.claude/pending-question.json")
SLACK_MODE_FILE = os.path.expanduser("~/.claude/slack-question-mode")
CONFIG_FILE = os.path.expanduser("~/.claude/self-drive.json")
PID_FILE = os.path.expanduser("~/.claude/question-relay.pid")
REPLY_FILE = os.path.expanduser("~/.claude/slack-reply.txt")

SEND_SCRIPT = os.path.expanduser("~/.claude/slack-send.py")
POLL_SCRIPT = os.path.expanduser("~/.claude/slack-poll.py")

# macOS TIOCSTI ioctl number — injects a character into terminal input queue
TIOCSTI = 0x80017472

# How long to wait before forwarding to Slack (seconds)
WAIT_NORMAL = 60
WAIT_SLACK_MODE = 3  # Small buffer for consecutive questions


# ── PID management ──────────────────────────────────────────

def write_pid():
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))


def cleanup_pid():
    try:
        if os.path.exists(PID_FILE):
            with open(PID_FILE) as f:
                if f.read().strip() == str(os.getpid()):
                    os.remove(PID_FILE)
    except Exception:
        pass


# ── Slack configuration ─────────────────────────────────────

def is_slack_configured():
    """Check if Slack is configured with valid tokens."""
    if not os.path.exists(CONFIG_FILE):
        return False
    try:
        with open(CONFIG_FILE) as f:
            config = json.load(f)
        token = config.get("slack", {}).get("bot_token", "")
        channel = config.get("slack", {}).get("channel_id", "")
        return bool(token and channel and not token.startswith("xoxb-YOUR"))
    except Exception:
        return False


# ── Slack question mode (consecutive questions) ─────────────

def is_slack_mode():
    """Check if user recently answered via Slack (5-minute window)."""
    if not os.path.exists(SLACK_MODE_FILE):
        return False
    try:
        mtime = os.path.getmtime(SLACK_MODE_FILE)
        return (time.time() - mtime) < 300
    except Exception:
        return False


def set_slack_mode():
    """Mark that user is answering via Slack."""
    with open(SLACK_MODE_FILE, "w") as f:
        f.write(str(time.time()))


# ── Question state ──────────────────────────────────────────

def is_still_pending():
    """Check if the question is still pending (user hasn't answered in terminal)."""
    return os.path.exists(PENDING_FILE)


# ── Slack messaging ─────────────────────────────────────────

def format_slack_message(data):
    """Format question data as a readable Slack message."""
    questions = data.get("questions", [])
    parts = ["🤖 *Claude is asking:*", ""]

    emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]

    for i, q in enumerate(questions):
        question_text = q.get("question", "")
        options = q.get("options", [])
        multi = q.get("multiSelect", False)

        if len(questions) > 1:
            parts.append(f"*Q{i+1}: {question_text}*")
        else:
            parts.append(f"*{question_text}*")
        parts.append("")

        for j, opt in enumerate(options):
            label = opt.get("label", "")
            desc = opt.get("description", "")
            emoji = emojis[j] if j < len(emojis) else f"{j+1}."
            parts.append(f"  {emoji} *{label}*")
            if desc:
                parts.append(f"       _{desc}_")

        if multi:
            parts.append("")
            parts.append("_(Multiple selections allowed — reply with comma-separated numbers)_")

        parts.append("")

    parts.append("━━━━━━━━━━━━━━")
    if len(questions) == 1:
        parts.append("Reply: number (1-4) or type your answer")
    else:
        parts.append("Reply: one answer per line, or comma-separated (e.g. 1,3,2)")

    return "\n".join(parts)


def send_slack(msg):
    """Send a message to Slack. Returns True on success."""
    try:
        proc = subprocess.run(
            ["python3", SEND_SCRIPT, "--stdin"],
            input=msg,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return proc.returncode == 0
    except Exception:
        return False


def wait_for_reply(timeout=300):
    """Wait for a Slack reply using slack-poll.py."""
    # Clear previous reply
    if os.path.exists(REPLY_FILE):
        os.remove(REPLY_FILE)

    try:
        proc = subprocess.run(
            ["python3", POLL_SCRIPT, str(timeout)],
            capture_output=True,
            text=True,
            timeout=timeout + 30,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        pass

    # Check reply file as fallback
    if os.path.exists(REPLY_FILE):
        with open(REPLY_FILE) as f:
            text = f.read().strip()
        if text:
            return text

    return None


# ── Terminal input injection ────────────────────────────────

def inject_via_tiocsti(tty_device, raw_bytes):
    """Inject bytes into terminal input queue via TIOCSTI ioctl.

    This is the preferred method: no Accessibility permissions needed,
    works in background, handles all terminal emulators.
    """
    fd = os.open(tty_device, os.O_RDWR)
    try:
        for byte_val in raw_bytes:
            if isinstance(byte_val, int):
                fcntl.ioctl(fd, TIOCSTI, bytes([byte_val]))
            else:
                fcntl.ioctl(fd, TIOCSTI, byte_val)
            time.sleep(0.003)  # Small delay between characters
    finally:
        os.close(fd)


def inject_option_tiocsti(tty_device, option_num, num_options):
    """Select option N (1-indexed) via TIOCSTI."""
    # Navigate: Down arrow × (option_num - 1), then Enter
    for _ in range(option_num - 1):
        inject_via_tiocsti(tty_device, b"\x1b[B")  # Down arrow
        time.sleep(0.02)
    time.sleep(0.05)
    inject_via_tiocsti(tty_device, b"\r")  # Enter


def inject_other_tiocsti(tty_device, num_options, text):
    """Select 'Other' and type custom text via TIOCSTI."""
    # Navigate past all options to "Other"
    for _ in range(num_options):
        inject_via_tiocsti(tty_device, b"\x1b[B")  # Down arrow
        time.sleep(0.02)
    time.sleep(0.05)
    inject_via_tiocsti(tty_device, b"\r")  # Enter to select Other
    time.sleep(0.3)

    # Type the text
    text_clean = text.replace("\n", " ").strip()
    inject_via_tiocsti(tty_device, text_clean.encode("utf-8"))
    time.sleep(0.1)

    # Submit
    inject_via_tiocsti(tty_device, b"\r")


def inject_via_applescript(terminal_app, option_num, num_options, text=None):
    """Fallback: simulate keystrokes via AppleScript.

    Requires macOS Accessibility permissions for the terminal app.
    """
    lines = []
    lines.append(f'tell application "{terminal_app}" to activate')
    lines.append("delay 0.3")

    if text is not None:
        # Select "Other": navigate past all options
        for _ in range(num_options):
            lines.append(
                'tell application "System Events" to key code 125'
            )
            lines.append("delay 0.03")
        lines.append(
            'tell application "System Events" to key code 36'
        )
        lines.append("delay 0.3")

        # Type text via clipboard (handles special characters)
        subprocess.run(
            ["pbcopy"],
            input=text.replace("\n", " ").strip().encode(),
            check=True,
        )
        lines.append(
            'tell application "System Events" to keystroke "v" using command down'
        )
        lines.append("delay 0.2")
        lines.append(
            'tell application "System Events" to key code 36'
        )
    else:
        # Navigate to option
        for _ in range(option_num - 1):
            lines.append(
                'tell application "System Events" to key code 125'
            )
            lines.append("delay 0.03")
        lines.append(
            'tell application "System Events" to key code 36'
        )

    script = "\n".join(lines)
    try:
        subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass


def simulate_answer(data, reply):
    """Parse the Slack reply and inject it into the terminal."""
    questions = data.get("questions", [])
    tty_device = data.get("tty_device", "")
    terminal_app = data.get("terminal_app", "Terminal")

    if not questions:
        return

    # Parse answers: support newline or comma-separated for multi-question
    if len(questions) > 1:
        # Try newline-separated first, then comma-separated
        if "\n" in reply:
            answers = [a.strip() for a in reply.strip().split("\n") if a.strip()]
        else:
            answers = [a.strip() for a in reply.strip().split(",") if a.strip()]
    else:
        answers = [reply.strip()]

    for i, q in enumerate(questions):
        options = q.get("options", [])
        num_options = len(options)
        answer = answers[i] if i < len(answers) else ""

        if not answer:
            continue

        # Determine: numeric selection or "Other" text
        use_other = True
        option_num = 0
        if answer.isdigit():
            n = int(answer)
            if 1 <= n <= num_options:
                option_num = n
                use_other = False

        # Try TIOCSTI first (preferred), fall back to AppleScript
        injected = False
        if tty_device and os.path.exists(tty_device):
            try:
                if use_other:
                    inject_other_tiocsti(tty_device, num_options, answer)
                else:
                    inject_option_tiocsti(tty_device, option_num, num_options)
                injected = True
            except (OSError, IOError):
                pass  # TIOCSTI not available, try AppleScript

        if not injected:
            if use_other:
                inject_via_applescript(terminal_app, 0, num_options, answer)
            else:
                inject_via_applescript(terminal_app, option_num, num_options)

        # Wait between questions (for sequential TUI)
        if i < len(questions) - 1:
            time.sleep(0.8)


# ── Main ────────────────────────────────────────────────────

def main():
    write_pid()

    # Gate: Slack must be configured
    if not is_slack_configured():
        return

    # Determine wait time: immediate if in slack-mode, else 60s
    wait_seconds = WAIT_SLACK_MODE if is_slack_mode() else WAIT_NORMAL

    # Wait (interruptible — SIGTERM from PostToolUse hook kills us)
    time.sleep(wait_seconds)

    # Check if question is still pending
    if not is_still_pending():
        return  # User already answered in terminal

    # Read question data
    try:
        with open(PENDING_FILE) as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return

    # Format and send to Slack
    msg = format_slack_message(data)
    if not send_slack(msg):
        time.sleep(2)
        if not send_slack(msg):
            return  # Give up after retry

    # Wait for Slack reply
    reply = wait_for_reply(timeout=300)

    if not reply:
        send_slack("⏰ _No reply received. Please answer in the terminal._")
        return

    # Cancel commands
    cancel_words = {"stop", "cancel", "取消", "算了", "skip"}
    if reply.strip().lower() in cancel_words:
        send_slack("🚫 _Cancelled. Please answer in the terminal._")
        return

    # Verify question is still pending (user might have answered while we waited)
    if not is_still_pending():
        send_slack("ℹ️ _Already answered in terminal._")
        return

    # Set slack-question-mode for consecutive questions
    set_slack_mode()

    # Confirm receipt
    send_slack(f"✅ _Got it: {reply}_")

    # Inject answer into terminal
    time.sleep(0.3)
    simulate_answer(data, reply)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    try:
        main()
    except Exception:
        pass
    finally:
        cleanup_pid()
