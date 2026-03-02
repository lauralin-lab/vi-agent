# Changelog

All notable changes to the Drive Skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-03-01

### Added
- **Slack Question Relay** — when user doesn't respond to AskUserQuestion within 60 seconds, automatically forwards the question to Slack DM with formatted options
- **Slack-question-mode** — after answering via Slack, subsequent questions are forwarded immediately (no 60s wait) for seamless consecutive Q&A
- **Terminal input injection** — Slack replies are injected back into the terminal via TIOCSTI ioctl (primary) or AppleScript keystroke simulation (fallback)
- **PreToolUse/PostToolUse hooks** — `question-relay-hook.sh` intercepts AskUserQuestion tool calls to manage the relay lifecycle
- **`slack-question-relay.py`** — background relay script: format → send → listen → inject
- **Subagent filtering** — relay only activates for main agent questions, not teammate AskUserQuestion calls

### Changed
- **settings.json template** — added PreToolUse/PostToolUse hooks for AskUserQuestion
- **install.sh** — installs question-relay-hook.sh and slack-question-relay.py, merges new hooks into existing settings

## [3.0.0] - 2026-02-26

### Added
- **Full-suite one-click installer** — `install.sh` sets up everything with symlinks, settings merge, and shell config
- **Self-Drive skill** — perpetual improvement loop with Slack/Telegram async communication
- **Architect skill** — 6-phase system architecture design process
- **Notification hook** (`notify.sh`) — macOS banners + TTS voice
- **Bundled sound effects** (`sounds/`) — 5 pre-generated TTS voice files, no API key needed
- **Slack messaging** — `slack-send.py`, `slack-listen.py` (Socket Mode), `slack-poll.py` (API fallback)
- **Telegram messaging** — `telegram-send.py`, `telegram-poll.py` (long-poll)
- **Settings template** — `config/settings.json` with agent teams, hooks, and bypass permissions
- **Self-drive config template** — `config/self-drive.json.example` for Slack/Telegram tokens
- **Repository restructure** — organized into `commands/`, `hooks/`, `messaging/`, `config/`
- **.gitignore** — excludes secrets (`self-drive.json`), cache files, Python artifacts

### Changed
- **drive.md** moved from root to `commands/drive.md`
- **README.md** — complete rewrite: full-suite documentation with install guide, uninstall, optional setup
- **Notification system** — switched from Fish Audio API to bundled sound effects
- **Install model** — all files symlinked (not copied) for live version control

### Security
- Added self-drive.json to .gitignore (contains Slack/Telegram tokens)
- Config template uses placeholder values

## [2.0.0] - 2026-02-26

### Added
- **Hierarchical Team Topology** — new first-class concept: Sub-Team-Leads (STLs) who own domains and spawn their own Task subagents for inner parallelism
- **STL spawn template** — full prompt template with inner-subagent protocol, domain brief, reporting protocol, escalation path
- **In-Process Visibility Protocol** — dedicated section for making the swarm visible in `--teammate-mode in-process`, including Shift+Down navigation, "War Room" effect
- **Dynamic Hierarchy Restructuring** — 6 operations: PROMOTE (leaf→STL), SPLIT (overloaded STL→2 STLs), DEMOTE (STL→leaf), REASSIGN (cross-domain), SCALE-UP, SCALE-DOWN
- **Team Topology Visualization** — mandatory `🗺️ TEAM TOPOLOGY` broadcast at Phase T and on every hierarchy change
- **STL-INNER broadcast** — `🎖️ STL-INNER` announces when STLs spawn inner subagents
- **Domain Complete broadcast** — `🏁 DOMAIN COMPLETE` when an STL finishes all domain tasks
- **Swarm Status Dashboard** — `📊 SWARM STATUS` emitted after each wave completion
- **Hierarchy Decision Tree** — algorithmic guide for when to use STLs vs. leaf teammates
- **STL Multiplier Effect** — documented: 1 STL + 3 inner = 4x throughput per teammate slot
- **Early Team Creation (Mode B)** — create team during Phase 0 research for in-process visibility
- **9 new anti-patterns** — hierarchy-specific: flat teams for complex missions, micromanaging STLs, ignoring STL escalations, static hierarchy, invisible hierarchy, STLs without inner subagents, too many direct reports, etc.

### Changed
- **Team Sizing** — new formula: `effective_parallelism = teammates + Σ(inner_subagents_per_STL)`. Sizing table now shows hierarchy topology and effective parallelism
- **Teammate Roles Table** — added `stl-{domain}` as first-class role (top of table)
- **Wave Map** — hierarchical notation showing STL inner subagent structure within waves
- **The Loop** — hierarchical orchestration: STL domain reports vs. leaf teammate reports handled separately, STL escalation priority, hierarchy health check
- **Team Lead Principles** — expanded from 9 to 11, now hierarchy-aware: "delegate domains not tasks", "micromanage less as hierarchy deepens", "prefer STLs over flat"
- **Research Swarm** — Mode A (fire-and-forget Task agents) vs. Mode B (early team creation for visible in-process research)
- **Debrief Stats** — added STL count, inner subagent count, hierarchy changes
- **Six-Step Discipline Summary** — updated to reflect hierarchy additions
- **Mindset** — rewritten for hierarchical swarm identity, STL-aware inner monologue
- **Pure Orchestrator Threshold** — now triggers at ≥2 STLs (was ≥5 flat teammates), >80% orchestrating

## [1.0.0] - 2026-02-26

### Added
- Initial version committed to git (previously managed as a local file)
- **Drive Mode core** — autonomous loop, Team Lead identity, Cardinal Rule
- **Swarm-First Execution Model** — Fork-Join, Pipeline, Speculative concurrency patterns
- **Broadcast Protocol** — `📡 DISPATCH`, `✅ RETURN`, `🔄 RE-DISPATCH` announcements
- **Phase 0: Deep Briefing** — Research Swarm, Interrogation, Mission Contract
- **Phase T: Team Assembly** — TeamCreate, teammate sizing by parallelism width, spawn templates
- **Phase 1: Battle Plan** — Wave Decomposition, Critical Path Analysis, task assignment
- **The Loop** — wave-driven swarm execution with checkpoint protocol
- **Six-Step Discipline** — Research → Plan → Annotate → Todo List → Implement → Feedback
- **Deep Reasoning Protocol** — Self-Dialectic, Formal Logic, First Principles, 众神殿 integration
- **Scaling Mindset** — Bitter Lesson, learning-first alternatives, anti-patterns of rule obsession
- **Direction Validation Protocol** — visual confirmation with Mermaid/ASCII, path enumeration
- **Self-Adversarial Review** — 6-axis review before marking any task complete
- **Notification System** — bundled voice announcements via hooks
- **Team Shutdown Protocol** — graceful shutdown with SendMessage + TeamDelete
- **Anti-patterns** — comprehensive list of Drive Mode anti-patterns
