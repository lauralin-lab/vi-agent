#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════
# VI Agent — Skill & Tooling Installer
# ═══════════════════════════════════════════════════════════════
#
# Installs hooks, sounds, and messaging scripts from this repo's
# .claude/ directory into ~/.claude/ for Claude Code integration.
#
# Commands (.claude/commands/) are auto-discovered by Claude Code
# when working in this project — no installation needed.
#
# Usage:
#   cd vi-agent-team-version
#   .claude/install.sh
#
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLAUDE_DIR="$HOME/.claude"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

print_header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

print_step() { echo -e "  ${GREEN}[+]${NC} $1"; }
print_skip() { echo -e "  ${YELLOW}[~]${NC} $1"; }
print_warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "  ${RED}[x]${NC} $1"; }
print_info() { echo -e "  ${BLUE}[i]${NC} $1"; }

# ─── Pre-flight checks ───

print_header "VI Agent — Skill Installer"

if ! command -v claude &>/dev/null; then
  print_error "Claude Code (claude) not found in PATH."
  print_info "Install: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi
print_step "Claude Code found: $(which claude)"

if [[ "$(uname)" != "Darwin" ]]; then
  print_warn "Optimized for macOS. TTS and banners won't work on other platforms."
  print_warn "Core skills (drive, architect) will still work."
  echo ""
  read -p "  Continue? [y/N] " -n 1 -r
  echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
fi

if ! command -v python3 &>/dev/null; then
  print_error "python3 not found. Required for messaging scripts."
  exit 1
fi
print_step "Python3 found: $(python3 --version)"

print_info "Project root: $PROJECT_ROOT"
print_info "Commands auto-discovered from .claude/commands/ (no install needed)"

# ─── Install hooks ───

print_header "Step 1: Install Hooks"

install_symlink() {
  local src="$1"
  local dst="$2"
  local name="$(basename "$dst")"

  if [ -L "$dst" ]; then
    local current=$(readlink "$dst")
    if [ "$current" = "$src" ]; then
      print_skip "$name — already linked"
      return
    fi
    rm "$dst"
  elif [ -f "$dst" ]; then
    print_warn "$name — backing up to $dst.bak"
    mv "$dst" "$dst.bak"
  fi

  ln -s "$src" "$dst"
  chmod +x "$src" 2>/dev/null || true
  print_step "$name — installed (symlink)"
}

install_symlink "$SCRIPT_DIR/hooks/notify.sh" "$CLAUDE_DIR/notify.sh"
install_symlink "$SCRIPT_DIR/hooks/question-relay-hook.sh" "$CLAUDE_DIR/question-relay-hook.sh"

# ─── Install skills (user-level) ───

print_header "Step 2: Install Skills"

print_info "User-level skills: drive, architect, self-drive, improve-user"
print_info "These are symlinked from the repo so 'git pull' keeps them up to date."

COMMANDS_DST="$CLAUDE_DIR/commands"
mkdir -p "$COMMANDS_DST"

for skill in drive.md architect.md self-drive.md improve-user.md; do
  install_symlink "$SCRIPT_DIR/skills/$skill" "$COMMANDS_DST/$skill"
done

# Write installed version fingerprint for freshness checks
md5_cmd="md5sum"
if command -v md5 &>/dev/null; then
  md5_cmd="md5 -q"
fi

SKILL_VERSION=""
for skill in drive.md architect.md self-drive.md improve-user.md; do
  SKILL_VERSION+="$($md5_cmd "$SCRIPT_DIR/skills/$skill" 2>/dev/null | awk '{print $1}')  $skill"$'\n'
done
echo "$SKILL_VERSION" > "$CLAUDE_DIR/.skill-versions"
print_step "Skill version fingerprint written"

# ─── Install sounds ───

print_header "Step 3: Install Sound Effects"

SOUNDS_SRC="$SCRIPT_DIR/sounds"
SOUNDS_DST="$CLAUDE_DIR/sounds"

if [ -L "$SOUNDS_DST" ]; then
  current=$(readlink "$SOUNDS_DST")
  if [ "$current" = "$SOUNDS_SRC" ]; then
    print_skip "sounds/ — already linked"
  else
    rm "$SOUNDS_DST"
    ln -s "$SOUNDS_SRC" "$SOUNDS_DST"
    print_step "sounds/ — relinked"
  fi
elif [ -d "$SOUNDS_DST" ]; then
  rm -rf "$SOUNDS_DST"
  ln -s "$SOUNDS_SRC" "$SOUNDS_DST"
  print_step "sounds/ — migrated to directory symlink"
else
  ln -s "$SOUNDS_SRC" "$SOUNDS_DST"
  print_step "sounds/ — installed (symlink)"
fi

# ─── Install messaging scripts ───

print_header "Step 4: Install Messaging Scripts"

for script in slack-send.py slack-listen.py slack-poll.py slack-question-relay.py telegram-send.py telegram-poll.py; do
  install_symlink "$SCRIPT_DIR/messaging/$script" "$CLAUDE_DIR/$script"
done

# ─── Self-drive config template ───

if [ ! -f "$CLAUDE_DIR/self-drive.json" ]; then
  cp "$SCRIPT_DIR/config/self-drive.json.example" "$CLAUDE_DIR/self-drive.json"
  print_step "self-drive.json — created from template"
else
  print_skip "self-drive.json — already exists"
fi

# ─── Configure settings.json ───

print_header "Step 5: Configure Claude Settings"

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

if [ ! -f "$SETTINGS_FILE" ]; then
  cp "$SCRIPT_DIR/config/settings.json" "$SETTINGS_FILE"
  print_step "settings.json — installed (fresh)"
else
  print_info "Existing settings.json found. Merging..."
  SCRIPT_DIR="$SCRIPT_DIR" python3 << 'MERGE_SCRIPT'
import json, os

settings_path = os.path.expanduser("~/.claude/settings.json")
template_path = os.path.join(os.environ["SCRIPT_DIR"], "config", "settings.json")

with open(settings_path) as f:
    existing = json.load(f)
with open(template_path) as f:
    template = json.load(f)

changed = False

if "env" not in existing:
    existing["env"] = {}
if existing["env"].get("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS") != "1":
    existing["env"]["CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"] = "1"
    changed = True

if "hooks" not in existing:
    existing["hooks"] = {}

for hook_name in ["Notification", "Stop", "TeammateIdle"]:
    if hook_name not in existing["hooks"]:
        existing["hooks"][hook_name] = template["hooks"][hook_name]
        changed = True
    else:
        has_notify = any(
            h.get("command", "").endswith("notify.sh")
            for entry in existing["hooks"][hook_name]
            for h in entry.get("hooks", [])
        )
        if not has_notify:
            existing["hooks"][hook_name].extend(template["hooks"][hook_name])
            changed = True

for hook_name in ["PreToolUse", "PostToolUse"]:
    if hook_name not in existing["hooks"]:
        existing["hooks"][hook_name] = template["hooks"][hook_name]
        changed = True
    else:
        has_relay = any(
            h.get("command", "").endswith("question-relay-hook.sh")
            for entry in existing["hooks"][hook_name]
            for h in entry.get("hooks", [])
        )
        if not has_relay:
            existing["hooks"][hook_name].extend(template["hooks"][hook_name])
            changed = True

if changed:
    with open(settings_path, "w") as f:
        json.dump(existing, f, indent=2)
    print("  [\033[0;32m+\033[0m] settings.json — merged")
else:
    print("  [\033[1;33m~\033[0m] settings.json — already configured")
MERGE_SCRIPT
fi

# ─── Shell configuration ───

print_header "Step 6: Shell Configuration"

SHELL_NAME=$(basename "$SHELL")
if [ "$SHELL_NAME" = "zsh" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ "$SHELL_NAME" = "bash" ]; then
  SHELL_RC="$HOME/.bashrc"
else
  SHELL_RC="$HOME/.${SHELL_NAME}rc"
fi

NEEDS_SHELL_UPDATE=false
SHELL_ADDITIONS=""

if ! grep -q 'teammate-mode in-process' "$SHELL_RC" 2>/dev/null; then
  SHELL_ADDITIONS+=$'\n# Claude Code: in-process teammate mode (visible swarm)\nalias claude="claude --teammate-mode in-process"\n'
  NEEDS_SHELL_UPDATE=true
fi

if ! grep -q 'CLAUDE_CODE_MAX_OUTPUT_TOKENS' "$SHELL_RC" 2>/dev/null; then
  SHELL_ADDITIONS+=$'\n# Claude Code: maximize output token budget\nexport CLAUDE_CODE_MAX_OUTPUT_TOKENS=1000000\n'
  NEEDS_SHELL_UPDATE=true
fi

if [ "$NEEDS_SHELL_UPDATE" = true ]; then
  echo "" >> "$SHELL_RC"
  echo "# ─── VI Agent Skill Configuration ───" >> "$SHELL_RC"
  echo "$SHELL_ADDITIONS" >> "$SHELL_RC"
  print_step "Updated $SHELL_RC"
  print_warn "Run 'source $SHELL_RC' to apply."
else
  print_skip "Shell already configured"
fi

# ─── Summary ───

print_header "Installation Complete"

echo -e "  ${BOLD}Team lifecycle skills (project-level, auto-discovered):${NC}"
echo -e "    ${GREEN}/set-role${NC}       — Register identity, link to teamspace"
echo -e "    ${GREEN}/get-mission${NC}    — Pull Mission Contract from board"
echo -e "    ${GREEN}/complete-mission${NC} — QA, PR, merge, board cleanup"
echo ""
echo -e "  ${BOLD}Dev tools (user-level, symlinked to ~/.claude/commands/):${NC}"
echo -e "    ${GREEN}/drive${NC}          — Hierarchical swarm execution"
echo -e "    ${GREEN}/self-drive${NC}     — Perpetual improvement loop"
echo -e "    ${GREEN}/architect${NC}      — System architecture design"
echo -e "    ${GREEN}/improve-user${NC}   — Cognitive coaching"
echo ""
echo -e "  ${BOLD}Installed to ~/.claude/:${NC}"
echo -e "    Skills (symlinked), hooks, sounds, messaging (Slack/Telegram)"
echo ""
echo -e "  ${BOLD}Quick start:${NC}"
echo -e "    ${CYAN}/set-role${NC}                  → register + see your status"
echo -e "    ${CYAN}/get-mission${NC}               → pull your next task"
echo -e "    ${CYAN}/drive${NC}                     → execute with full autonomy"
echo -e "    ${CYAN}/complete-mission${NC}           → ship it to main"
echo ""
echo -e "  ${BOLD}Skill updates:${NC}"
echo -e "    Skills are symlinked from the repo. Run ${CYAN}git pull${NC} to get latest versions."
echo -e "    If skills are stale, Claude will prompt you to re-run ${CYAN}.claude/install.sh${NC}"
echo ""
