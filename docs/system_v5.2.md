# VI Agent — System v5.2: Skills, Experience Packages, and the Development Loop

> **Last Updated:** 2026-03-08
>
> **Builds on:** system_v5.md (Experience Package Architecture, Card Template Protocol, NanoClaw Core Backend)
>
> **Scope:** This document clarifies the Skill vs. Experience Package distinction, explains how skills work natively in NanoClaw, analyzes the relationship with container lifecycle and sessions, and proposes the architecture for a dashboard-driven development loop that enables product managers and marketers to design and test experience packages directly.

---

## 1. Skill vs. Experience Package — Clear Definitions

### 1.1 What is a Skill?

A **Skill** is a single unit of AI behavior — "how to do one thing."

```
Skill = System Prompt (skill.md) + Tool Access + Model Config
      = "Given this input, here's how I reason and what I output"
```

A skill defines:
- **What the AI knows** — domain expertise baked into the system prompt
- **What tools it can use** — which tools are available during execution
- **How it reasons** — the cognitive strategy (analyze→compare→recommend, etc.)
- **What model powers it** — Claude Sonnet, Haiku, etc.

A skill does NOT define:
- How results are displayed (that's templates)
- What external APIs to call (that's API config)
- How the user triggers it (that's triggers/intentions)
- What assets/examples ship with it (that's the package)

**Analogy:** A skill is like a chef's recipe technique — "how to braise." It's pure cognitive capability.

### 1.2 What is an Experience Package?

An **Experience Package** is a complete, deployable user experience — everything needed to go from "user has an intent" to "user sees a beautiful, useful result."

```
Experience Package = Skill
                   + Prompt (skill.md — the AI's cognitive instructions)
                   + Templates (how results are displayed as cards)
                   + Tools (custom API wrappers the AI can call)
                   + APIs (external service configs + auth)
                   + Triggers (visual cues, voice keywords for intention prediction)
                   + UI Config (thinking steps, preview template, card sequence)
                   + App Mode (frontend transformation — camera, layout, interaction style)
                   + Assets (example inputs/outputs, demo media, illustrations)
                   + Workflow (multi-step orchestration, conditional branching)
                   + MCP (Model Context Protocol servers for external data sources)
```

**A package can totally transform the app.** A "Document Scanner" package doesn't just output analysis cards — it changes the camera to scan mode, adds a scan overlay, replaces the shutter with a "Scan" button, and shows extracted text as the primary result. A "Calorie Calculator" package turns the app into a food diary with running totals. The package declares these transformations; the frontend applies them.

**Analogy:** An experience package is like an app mode — not just what the AI does (skill), but what the app looks like, how the camera behaves, what buttons appear, and how results are presented. Switching packages = switching apps.

### 1.3 The Relationship

```
┌─────────────────────────────────────────────────────────────┐
│                    Experience Package                         │
│                                                               │
│   ┌───────────────────┐                                      │
│   │      Skill        │  ← The cognitive core                │
│   │   (skill.md +     │                                      │
│   │    model config)  │                                      │
│   └───────────────────┘                                      │
│                                                               │
│   + Templates (card layouts for rendering results)            │
│   + Tools (function definitions the AI calls)                 │
│   + APIs (external service configurations)                    │
│   + Triggers (how intention prediction activates this)        │
│   + UI Config (thinking steps, preview, card sequence)        │
│   + App Mode (camera, layout, buttons, interaction style)     │
│   + Assets (examples, demo media, illustrations)              │
│   + Workflow (multi-step orchestration rules)                 │
│   + MCP Servers (external data source connections)            │
│                                                               │
│   manifest.json  ← Declares everything above                 │
└─────────────────────────────────────────────────────────────┘
```

Every experience package contains exactly one skill. But a skill can exist without a package (bare skill in `/skills/` directory) — it just won't have templates, triggers, examples, etc.

### 1.4 App Mode — Packages That Transform the App

An experience package can declare an **app_mode** that transforms the frontend when the package is active. This goes beyond cards — it changes what the app looks like and how it behaves.

```json
// Example: Document Scanner package manifest.json
{
  "id": "document-scanner",
  "name": "Document Scanner",
  "app_mode": {
    "camera": {
      "overlay": "scan-frame",
      "resolution": "high",
      "flash": "auto",
      "guides": true
    },
    "shutter": {
      "label": "Scan",
      "icon": "📄",
      "style": "document"
    },
    "layout": "result-first",
    "hide": ["chat-input"],
    "show": ["scan-history"],
    "theme": {
      "accent": "#2563eb"
    }
  }
}
```

```json
// Example: Calorie Calculator package manifest.json
{
  "id": "calorie-calculator",
  "name": "Calorie Calculator",
  "app_mode": {
    "camera": {
      "overlay": "food-detect",
      "resolution": "standard"
    },
    "shutter": {
      "label": "Log Meal",
      "icon": "🍽️",
      "style": "health"
    },
    "layout": "dashboard",
    "persistent_widget": {
      "template": "daily-summary",
      "position": "top",
      "data_source": "memory/episodic/food-log.md"
    },
    "theme": {
      "accent": "#16a34a"
    }
  }
}
```

**How it works:**

```
Frontend receives intention prediction → package X is activated
  │
  ├── Read package X's manifest.json
  │
  ├── If app_mode exists:
  │   ├── camera.overlay → show scan frame / food detection overlay
  │   ├── camera.resolution → adjust video track constraints
  │   ├── shutter.label/icon → change capture button text and icon
  │   ├── layout → switch between "canvas-first", "result-first", "dashboard"
  │   ├── hide/show → toggle UI elements
  │   ├── persistent_widget → pin a summary card (e.g., daily calorie total)
  │   └── theme.accent → tint the UI to match the experience
  │
  └── When package deactivates → revert to default app mode

No app_mode → default behavior (camera + card canvas)
```

**Frontend already supports the building blocks:**
- 7 view states (`camera`, `live-session`, `home`, etc.)
- RPC-based navigation (`navigate_page`)
- Camera controls (`camera_zoom`, `switch_camera`)
- Intent-based shutter colors and actions
- MatrixScanOverlay for scan animations
- 13 native module renderers

The `app_mode` manifest field connects these existing mechanisms to package metadata, so the frontend can apply transformations declaratively.

**Examples of app-transforming packages:**

| Package | App Looks Like | Camera Mode | Shutter | Primary Output |
|---------|---------------|-------------|---------|----------------|
| Default (no package) | Camera + cards | Standard | Capture | Conversation |
| Document Scanner | Scanner app | High-res + frame guides | "Scan" | Extracted text + PDF |
| Calorie Calculator | Food diary | Standard + food overlay | "Log Meal" | Nutrition card + daily total |
| Movie Poster | Creative studio | Standard | "Create" | Hero image card |
| Plant Identifier | Field guide | Macro mode | "Identify" | Species card + care guide |
| Receipt Scanner | Expense tracker | High-res + receipt frame | "Scan Receipt" | Line items + total |
| Style Advisor | Fashion mirror | Front camera | "Rate Outfit" | Style score + suggestions |

---

## 2. How Skills Work in NanoClaw

### 2.1 Reference: Native NanoClaw (`../nanoclaw/`)

The native NanoClaw (`../nanoclaw/`, outside our codebase) is the **reference implementation** that defines how NanoClaw should work. Our NanoClaw (`vi_agent/nanoclaw/`) must follow the same architecture.

In native NanoClaw, skills are deeply integrated with the **container lifecycle**:

```
Message arrives (from Telegram, WhatsApp, etc.)
    │
    ▼
NanoClaw Host Process
    │
    ├── Channel receives message → stores in SQLite
    │
    ├── Message loop polls → enqueues to GroupQueue
    │
    ├── GroupQueue spawns Docker container for user/group
    │   ├── Mount: /workspace/group/ (group's filesystem — writable)
    │   ├── Mount: /home/node/.claude/ (Claude Code sessions — writable)
    │   ├── Mount: /workspace/ipc/ (IPC namespace — writable)
    │   └── Mount: /app/src/ (agent-runner source — writable, customizable)
    │
    ├── Container starts → Claude Code agent runs
    │   ├── Loads CLAUDE.md from group folder (per-group persona)
    │   ├── Loads .claude/skills/ (slash commands available in container)
    │   ├── Has full shell access (sandboxed to /workspace/)
    │   ├── Can read/write files, run commands, use browser
    │   ├── Can spawn sub-agents (Claude Code agent teams)
    │   └── Session persists in .claude/ between invocations
    │
    ├── Container outputs results via stdout markers (OUTPUT_START/END)
    │   └── Host stream-parses stdout in real-time → routes to channel
    │
    ├── Follow-up messages piped via IPC (/workspace/ipc/input/)
    │
    └── Container exits after idle timeout
```

**Key facts:**
- A "skill" = a Claude Code slash command (files in `container/skills/`)
- Container is **ephemeral** (killed after idle), session is **persistent** (.claude/ survives)
- Sub-agents spawn natively through Claude Code agent teams
- IPC is the communication mechanism (file-based + stdout markers)
- Host process is a **thin orchestrator** — it routes messages, spawns containers, and relays output

### 2.2 Our NanoClaw — Current (WRONG) Architecture

Our current NanoClaw (`vi_agent/nanoclaw/`) has a fundamentally different and **incorrect** architecture:

```
CURRENT (to be removed):
    ExecRequest arrives via Redis
    │
    ├── exec-handler.ts picks up request (in-process)
    ├── skill-loader.ts loads manifest.json + skill.md
    ├── skill-executor.ts calls Claude SDK DIRECTLY IN PROCESS
    │   ├── No container, no Claude Code, no IPC
    │   ├── Hardcoded tool implementations (file_read, publish_card, etc.)
    │   ├── Single agentic loop (max 10 turns)
    │   └── No sub-agent spawning capability
    └── Results stream via Redis PUB/SUB
```

**What's wrong:**
- No container isolation — everything runs in the NanoClaw Node.js process
- No Claude Code — uses raw Claude SDK, losing slash commands, agent teams, session persistence
- No IPC — no way for the main agent to spawn and communicate with sub-agents
- Skills are manifest.json + skill.md instead of Claude Code slash commands
- No multi-agent orchestration capability

### 2.3 Our NanoClaw — Target Architecture

Our NanoClaw must adopt the native NanoClaw container model, with Redis as a channel and card streaming as an enhancement layer:

```
TARGET ARCHITECTURE:

Frontend / Realtime Agent / Dashboard
    │
    │  HTTP POST /chat  or  LiveKit RPC
    ▼
API Server
    │
    │  Redis PUB/SUB (vi:exec:{uid})
    ▼
┌──────────────────────────────────────────────────────────────┐
│                  NanoClaw Host Process                        │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Redis Channel (self-registering, like Telegram)        │  │
│  │  - subscribes to vi:exec:*                              │  │
│  │  - receives messages, pipes to container                │  │
│  │  - stream-parses container stdout                       │  │
│  │  - publishes card ops to vi:stream:{uid}                │  │
│  │  - publishes text to vi:stream:{uid}                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  GroupQueue + Container Runner                          │  │
│  │  (same as native NanoClaw)                              │  │
│  │                                                           │  │
│  │  Spawns Docker container per user:                       │  │
│  │  ├── Mount: /workspace/ (user data volume)              │  │
│  │  ├── Mount: /home/node/.claude/ (sessions + skills)     │  │
│  │  ├── Mount: /workspace/ipc/ (IPC namespace)             │  │
│  │  └── stdin: secrets (never on disk)                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                     │
│            stdout (stream-parsed in real-time)                 │
│                          │                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Output Parser                                          │  │
│  │  ├── OUTPUT_MARKER → text response → Redis channel      │  │
│  │  ├── CARD_OP_MARKER → card operation → vi:stream:{uid}  │  │
│  │  └── IPC files → follow-up messages, tasks              │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
                          │  Redis PUB/SUB (vi:stream:{uid})
                          ▼
                Frontend (SSE) / Dashboard / Realtime Agent
```

### 2.4 Container ↔ Card Streaming Protocol

The agent inside the container is **Redis-unaware**. Card operations flow through stdout markers, parsed by the host in real-time:

```
Inside Container (agent-runner):
    Agent calls publish_card tool
    → agent-runner writes to stdout:
      ---CARD_OP_START---
      {"op":"create_card","cardId":"card_123","template":"nutrition-card","data":{...}}
      ---CARD_OP_END---
    → agent-runner also writes text output:
      ---NANOCLAW_OUTPUT_START---
      {"status":"success","result":"Analysis complete"}
      ---NANOCLAW_OUTPUT_END---

Outside Container (host process):
    Stream-parses stdout in real-time:
    → CARD_OP_MARKER detected → publish to vi:stream:{uid} (~10-50ms latency)
    → OUTPUT_MARKER detected → route text to Redis channel / IPC

Frontend receives cards via SSE with near-zero latency.
```

**Why stdout markers instead of direct Redis access:**
- Container stays Redis-unaware (clean isolation, same as native NanoClaw)
- Host is the single point of output routing (text → channel, cards → vi:stream)
- Same latency as direct Redis (stdout parsing is real-time, not polled)
- Agent-runner pattern is identical to native NanoClaw, just extended with card markers

### 2.5 IPC and Sub-Agents

Sub-agents work exactly as in native NanoClaw:

```
Main Agent (container)
    │
    ├── Claude Code agent teams enabled
    │   (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)
    │
    ├── Main agent spawns sub-agents natively
    │   └── Sub-agents run in same container
    │       └── Each sub-agent has access to /workspace/ipc/
    │
    ├── IPC for communication:
    │   ├── /workspace/ipc/messages/  → outbound messages
    │   ├── /workspace/ipc/tasks/     → scheduled task requests
    │   └── /workspace/ipc/input/     → follow-up messages from host
    │
    └── Both main agent and sub-agents can emit card ops via stdout
        └── Host publishes all card ops to vi:stream:{uid}
```

### 2.6 Skills = Claude Code Slash Commands

Skills are Claude Code slash commands, synced into the container at startup:

```
Host: container/skills/
├── analyze-food/
│   └── SKILL.md          ← "Analyze this food photo, output nutrition card"
├── movie-poster/
│   └── SKILL.md          ← "Create a movie poster from this scene"
├── agent-browser/
│   └── SKILL.md          ← "Browser automation tool"
└── ...

At container startup:
  Host copies container/skills/* → /home/node/.claude/skills/
  Claude Code loads them as available slash commands
  User (or intention predictor) triggers: /analyze-food
```

Experience packages (manifest.json + templates + tools + assets) are the **packaging layer around skills**. The manifest provides metadata for the host (intention prediction, template registry, dashboard display), while the skill itself is a Claude Code slash command executed inside the container.

### 2.7 Session and Container Lifecycle

```
Container Lifecycle:
  spawn → run Claude Code agent → [idle: accept IPC follow-ups] → kill after timeout

Session Lifecycle (Claude Code):
  /home/node/.claude/ persists across container invocations (bind-mounted)
  Each user has isolated .claude/ directory
  Session resume = Claude Code picks up where it left off

Memory Lifecycle:
  /workspace/memory/ persists across sessions (bind-mounted user data volume)
  identity/ semantic/ episodic/ — same 3-layer pyramid from system_v5.md
  Agent reads/writes memory natively via filesystem

Card Lifecycle:
  Card ops stream from container stdout → host → Redis → frontend (real-time)
  Card state persisted by host to /workspace/sessions/{sessionId}/
  Dashboard shows session history with all cards
```

---

## 3. Architecture Migration — What to Remove and What to Build

### 3.1 Files to REMOVE (Current Wrong Architecture)

These files implement the in-process Claude SDK execution model and must be removed:

| File | Reason for Removal |
|------|-------------------|
| `nanoclaw/src/skills/skill-executor.ts` | In-process Claude SDK execution — replaced by container-based Claude Code |
| `nanoclaw/src/skills/skill-loader.ts` | Loads manifest.json + skill.md for SDK execution — replaced by Claude Code slash commands |
| `nanoclaw/src/skills/types.ts` | Types for the SDK-based skill model |
| `nanoclaw/src/executor/task-executor.ts` | Task execution wrapper for SDK model — replaced by container runner |
| `nanoclaw/src/channels/exec-handler.ts` | In-process exec request handler — replaced by Redis channel |
| `nanoclaw/src/pool/process-pool.ts` | Process pool for SDK workers — replaced by container pool |
| `nanoclaw/src/pool/queue-router.ts` | Queue routing for SDK pool — replaced by GroupQueue |
| `nanoclaw/src/tools/memory-update.ts` | Hardcoded tool — agent does this natively via filesystem |
| `nanoclaw/src/tools/oauth-call.ts` | Hardcoded tool — agent does this natively |

### 3.2 Files to KEEP (Still Valid)

| File | Why Keep |
|------|----------|
| `nanoclaw/src/redis-client.ts` | Redis connection — still needed for Redis channel |
| `nanoclaw/src/channels/stream-publisher.ts` | Publishes card ops to vi:stream:{uid} — still needed |
| `nanoclaw/src/channels/types.ts` | Type definitions — update for new architecture |
| `nanoclaw/src/channels/active-users.ts` | Tracks active users — still needed |
| `nanoclaw/src/channels/frames-consumer.ts` | Consumes camera frames — still needed |
| `nanoclaw/src/channels/media-consumer.ts` | Consumes media events — still needed |
| `nanoclaw/src/channels/actions-consumer.ts` | Consumes user actions — still needed |
| `nanoclaw/src/channels/request-context.ts` | AsyncLocalStorage for user context — still needed |
| `nanoclaw/src/context/context-compiler.ts` | Compiles user context every 30s — still needed |
| `nanoclaw/src/context/intention-predictor.ts` | Predicts intentions from scene — still needed |
| `nanoclaw/src/packages/package-loader.ts` | Loads experience packages — still needed for host-side metadata |
| `nanoclaw/src/packages/template-registry.ts` | Template registry — still needed for dashboard |
| `nanoclaw/src/persistence/card-store.ts` | Card state persistence — still needed |
| `nanoclaw/src/persistence/card-middleware.ts` | Card persistence middleware — still needed |
| `nanoclaw/src/fs/user-fs.ts` | User filesystem helpers — still needed |
| `nanoclaw/src/fs/cloud-sync.ts` | Cloud sync — still needed |
| `nanoclaw/src/dashboard-routes.ts` | Dashboard API — update to show IPC content |
| `nanoclaw/src/config.ts` | Configuration — update for container config |
| `nanoclaw/src/index.ts` | Entry point — rewrite for container model |

### 3.3 Files to CREATE (New Container Architecture)

| File | Purpose | Reference |
|------|---------|-----------|
| `nanoclaw/src/container-runner.ts` | Spawns Docker containers with bind mounts | `../nanoclaw/src/container-runner.ts` |
| `nanoclaw/src/container-runtime.ts` | Docker runtime abstraction | `../nanoclaw/src/container-runtime.ts` |
| `nanoclaw/src/group-queue.ts` | Concurrency management for containers | `../nanoclaw/src/group-queue.ts` |
| `nanoclaw/src/channels/redis-channel.ts` | Redis as a self-registering NanoClaw channel | New (modeled after Telegram channel) |
| `nanoclaw/src/channels/registry.ts` | Channel self-registration registry | `../nanoclaw/src/channels/registry.ts` |
| `nanoclaw/src/ipc.ts` | IPC watcher for container communication | `../nanoclaw/src/ipc.ts` |
| `nanoclaw/src/db.ts` | SQLite for sessions, messages, state | `../nanoclaw/src/db.ts` |
| `nanoclaw/container/Dockerfile` | Container image with Claude Code | `../nanoclaw/container/Dockerfile` |
| `nanoclaw/container/agent-runner/` | Agent runner inside container (extended with card markers) | `../nanoclaw/container/agent-runner/` |
| `nanoclaw/container/skills/` | Skills directory (Claude Code slash commands) | Convert from packages/ |

### 3.4 What Stays the Same

The **frontend-facing protocol is unchanged**:
- Card operations still stream via Redis PUB/SUB (`vi:stream:{uid}`)
- Frontend still receives via SSE
- Card templates and renderers are unchanged
- Dashboard API structure is unchanged (endpoints may get new backing)

The **user data model is unchanged**:
- 3-layer memory pyramid (identity/semantic/episodic)
- Session persistence
- Cloud sync

The **context and intention systems are unchanged**:
- Context compiler still runs every 30s
- Intention predictor still uses Claude Haiku on camera frames
- Intention cards still appear in the frontend

### 3.5 Dashboard Updates

The dashboard should show **all IPC content** like native NanoClaw records:

| Current Dashboard | Updated Dashboard |
|-------------------|-------------------|
| Shows card ops from Redis stream | Shows card ops from Redis stream (same) |
| Shows exec_start/exec_result events | Shows full IPC history (all messages in/out) |
| Chat sends via Redis exec request | Chat sends via Redis channel → container |
| No container visibility | Shows container status (running/idle/stopped) |
| No session visibility | Shows Claude Code session state |
| No sub-agent visibility | Shows sub-agent spawns and their output |

### 3.6 Experience Package → Skill Conversion

Experience packages (manifest.json + skill.md) convert to Claude Code slash commands:

```
BEFORE (packages/movie-poster/):
  manifest.json  → host-side metadata (triggers, templates, UI config)
  skill.md       → becomes SKILL.md (Claude Code slash command)

AFTER:
  container/skills/movie-poster/
    SKILL.md     ← converted from skill.md (Claude Code format)

  packages/movie-poster/
    manifest.json ← kept for host-side metadata (intention prediction, dashboard)
    (skill.md removed — SKILL.md lives in container/skills/)
```

The manifest.json stays in packages/ for the host to use (template registry, intention prediction, dashboard gallery). The actual skill execution moves to container/skills/ as a Claude Code slash command.

---

## 4. Experience Package Architecture (Updated for Container Model)

### 4.1 What is an Experience Package Now?

With the container model, an experience package has a clear split between **host-side** and **container-side** components:

```
Experience Package = Host-Side Metadata + Container-Side Skill

Host-Side (packages/{id}/):
  manifest.json    → triggers, templates, UI config, API declarations
  templates/       → card template schemas + renderers
  examples/        → test inputs/outputs, demo assets
  assets/          → gallery images, marketing materials

Container-Side (container/skills/{id}/):
  SKILL.md         → Claude Code slash command (the actual AI behavior)
  (tools, APIs, MCP — available to agent via filesystem/environment)
```

### 4.2 Growth Team Workflow — `/package-drive`

The growth team workflow is powered by the **`/package-drive`** Claude Code skill (`.claude/commands/package-drive.md`). This skill is designed for non-programmers — it uses `AskUserQuestion` at every step and handles all technical details automatically.

```
Growth Team builds package via /package-drive:

  Step 0: Git Workflow Gate
    • Checks if user has a mission branch
    • If not → creates a GitHub Issue and claims it automatically
    • Non-developer never touches git directly — /package-drive handles it

  Step 1: Describe the Idea (AskUserQuestion)
    • PM describes what the AI should do in plain English
    • Claude asks clarifying questions (photo→analysis? photo→creative? chat→action?)
    • Claude picks templates, triggers, model config

  Step 2: Generate Package
    • Claude creates: manifest.json + SKILL.md + examples/
    • Shows PM the generated SKILL.md for review
    • PM can refine the prompt in plain English — Claude rewrites

  Step 3: Upload Assets
    • PM uploads example images, demo screenshots, gallery hero image
    • Assets stored in packages/{id}/assets/ (cloud upload via dashboard later)
    • Dashboard gallery shows the package with full visual illustration

  Step 4: Test via Dashboard
    • PM opens dashboard → Chat tab → types trigger phrase
    • Watches cards stream in real-time
    • Reports issues → Claude fixes SKILL.md → test again

  Step 5: Ship
    • Claude commits files and guides PM to /team-ship
    • PR created → code review → merge → live

The PM never writes JSON, never touches git, never reads error logs.
/package-drive handles everything through guided AskUserQuestion steps.
```

### 4.3 Dashboard Features for Growth Team

```
Dashboard "Test Package" flow:
  1. PM selects package from gallery
  2. Uploads test image + types prompt
  3. Dashboard sends via Redis channel → container
  4. Container loads SKILL.md, executes Claude Code agent
  5. Agent outputs card ops via stdout markers
  6. Host stream-parses → publishes to vi:stream:{uid}
  7. Dashboard receives cards via SSE, renders in real-time
  8. PM sees full IPC log + card output + execution details
```

**"Save as Example" button (dashboard feature):**
- After a test run produces good results, PM clicks "Save as Example"
- Dashboard captures: input (photo/prompt) + output (card snapshots + raw data)
- Saved to `packages/{id}/examples/{timestamp}/` automatically
- No manual upload needed — examples come from real test runs
- Saved examples appear in the package gallery as visual proof of what the skill does

**Package Gallery displays:**
- Package card with icon, name, description, status badge
- Saved example pairs: input photo → output cards (from real test runs)
- Technical details: model, cost estimate, triggers
- "Test Now" button → opens Live Tester with the package pre-selected
- Each example is clickable — shows full card output as it would appear in the app

**Publishing workflow:**
- Draft → Testing → Review → Published status machine
- PM clicks "Publish" in dashboard after testing
- Publish = PR via `/team-ship` → code review → merge

---

## 5. Host-Side Integration Points

With the container model, the **host process** does NOT execute skills — containers do. The host's role is limited to:

1. **Metadata registry** — loading package manifests for intention prediction, template rendering, and dashboard display
2. **Container lifecycle** — spawning, monitoring, and killing containers via GroupQueue
3. **Output routing** — parsing container stdout for card ops and text, publishing to Redis
4. **Context provisioning** — compiling user context and writing it to container-accessible paths

### 5.1 Host-Side Package Loading

```
NanoClaw startup:
  1. package-loader.ts scans packages/
  2. For each package:
     a. Load manifest.json → register in package registry (metadata only)
     b. Load templates/ → register in template-registry
     c. Index triggers → feed to intention predictor
  3. Skills are NOT loaded by the host — they live in container/skills/
     and are synced into containers at spawn time

Container spawn:
  1. GroupQueue allocates container slot for user/group
  2. container-runner.ts spawns Docker container with:
     - Bind mount: container/skills/ → /home/node/.claude/skills/
     - Bind mount: user data → /workspace/ (memory, sessions)
     - Env: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  3. Redis channel message piped to container stdin
  4. Container stdout stream-parsed for:
     - CARD_OP markers → publish to vi:stream:{uid}
     - OUTPUT markers → route to Redis channel response
     - IPC file watches → handle follow-up messages, scheduled tasks
```

### 5.2 Context Compiler — Efficiency Rules

The context compiler runs on a 30s interval but **must not waste tokens or CPU when nothing has changed**. The current implementation already has partial dedup (scene hash, action polling) but needs stricter idle detection.

**When to run vs. skip:**

```
Every 30s tick:
  1. Check: any active users? (getActiveUserIds())
     → No active users → SKIP ENTIRELY (no memory reads, no API calls)

  2. For each active user, check change signals:
     a. Scene changed? (frame sceneHash differs from last)
     b. New user actions? (consumeRecentActions() returns non-empty)
     c. Memory files modified? (stat() mtime changed since last compile)
     d. Active session changed? (current.json modified)

  3. Decision:
     → NO change signals → SKIP this user
       - Do NOT call intention predictor (saves ~$0.002/call)
       - Do NOT publish to vi:ctx:{uid}
       - Reuse cached context snapshot + cached intentions
     → ANY change signal → compile + predict + publish as normal
```

**Current code (context-compiler.ts) implements all efficiency rules:**
- Scene hash dedup (`updateSceneHash`) — skips intention prediction if scene unchanged
- `predictIntentions(null, ...)` returns cached intentions — no API call
- Memory mtime caching (`readMemoryDirCached`) — skips disk reads when files unchanged
- Snapshot hash dedup (`lastSnapshotHash`) — skips Redis publish when output identical
- Idle tick tracking (`idleTicks`) — reduces interval for idle users
- No active users → returns immediately (zero cost)

**Implemented (T1 — context-compiler.ts, commit `perf(nanoclaw): optimize context compiler`):**
- ✅ Memory file mtime tracking — `readMemoryDirCached()` checks file mtimes before re-reading, returns cached content when unchanged
- ✅ User idle detection — `idleTicks` counter, after 10 consecutive idle ticks (~5 min) reduces to 60s effective interval
- ✅ No active users → skip entirely (no reads, no API calls, no Redis)
- ✅ Snapshot hash dedup — MD5 hash of compiled snapshot, skips Redis publish + intention prediction if identical and no new activity
- ✅ Cached memory content per directory — `memoryCache` reuses content when mtimes unchanged

**Token cost model (post-optimization):**
```
Intention predictor: ~$0.002/call (Claude Haiku with image)
30s interval = 120 calls/hour = ~$0.24/hour per active user

With implemented optimizations:
  User actively using camera → 120 calls/hour ($0.24/hr)
  User idle (app in background) → 0 calls/hour ($0.00/hr)  ← skip entirely
  User typing (no camera) → ~10 calls/hour ($0.02/hr, only on action changes)
  No active users → $0.00/hr (no reads, no API calls)
```

**Context snapshot is written to filesystem for containers:**

```
Writes snapshot to: /workspace/context/latest.json
(bind-mounted, so container agent can read it)

Also publishes to vi:ctx:{uid} (Redis) for other services

Container agent:
  Claude Code agent reads /workspace/context/latest.json
  SKILL.md can reference: "Read the user's current context from /workspace/context/latest.json"
  No host-side hooks needed — filesystem IS the integration point
```

### 5.3 Package Metadata Hooks (Host-Side Only)

The host needs a lightweight event system for metadata-only operations. These are NOT execution hooks — execution is entirely inside containers.

```typescript
// Host-side metadata events (NOT execution hooks)
interface PackageEvents {
  /** Package manifest loaded at startup — register templates, triggers */
  'package:loaded': (manifest: PackageManifest, path: string) => void;

  /** Container spawned for a user — update dashboard status */
  'container:spawned': (uid: string, containerId: string) => void;

  /** Container output received — card ops already routed, this is for logging */
  'container:output': (uid: string, output: string) => void;

  /** Container exited — update dashboard, persist session state */
  'container:exited': (uid: string, exitCode: number) => void;
}
```

This is intentionally minimal. The principle: **containers handle execution complexity; the host handles routing and metadata.**

### 5.4 Package Integration Architecture — Manifest-Declarative vs. Hook-Registry

An experience package affects multiple modules across the system: template rendering, intention prediction, frontend UI, container configuration, context compilation, and dashboard display. The question is: **how does a package declare and deliver these cross-module effects systematically?**

#### Approach A: Manifest-Declarative (Current Design)

Each integration point is a field in `manifest.json`. Each module reads the fields it cares about at startup:

```
manifest.json
├── templates.bundled     → template-registry.ts reads this
├── trigger.visual_cues   → intention-predictor.ts reads this
├── app_mode.camera       → frontend reads this
├── app_mode.shutter      → frontend reads this
├── tools.bundled         → container-runner.ts mounts these
├── mcp.servers           → container-runner.ts writes config
├── output.card_sequence  → dashboard gallery reads this
└── skill.prompt          → container/skills/ SKILL.md (copied at build)
```

**How it works today:**
```typescript
// startup: package-loader scans packages/, returns manifests
const packages = await loadPackages(packagesDir);

// each module pulls what it needs
templateRegistry.registerFromManifests(packages);    // reads templates
intentionPredictor.loadTriggers(packages);           // reads triggers
dashboardRoutes.setPackages(packages);               // reads everything for gallery

// at runtime: frontend fetches manifest via SSE/API
// applies app_mode if present, otherwise default behavior
```

**Strengths:**
- Simple — manifest is a single source of truth, each module reads what it needs
- Explicit — you can see all effects of a package by reading its manifest
- Static analysis — TypeScript types enforce the contract (`PackageManifest` interface)
- No runtime surprise — all integrations are declared, not discovered

**Weaknesses:**
- Adding a new integration point = adding a manifest field + updating `PackageManifest` type + updating every consuming module
- Can't express dynamic effects (e.g., "enrich context with nutrition data when this package is active")
- Each module hardcodes which manifest fields to read — tight coupling

#### Approach B: Hook-Registry (Future Evolution)

Packages register **hooks** — named integration points that modules subscribe to. The registry is the mediator:

```typescript
// Package registration (at startup, driven by manifest + optional hook file)
interface PackageHooks {
  /** Templates this package provides */
  'template:register': TemplateDefinition[];

  /** Triggers for intention prediction */
  'intention:triggers': { visual_cues: string[]; voice_keywords: string[] };

  /** Frontend app transformation when package is active */
  'frontend:app_mode': AppMode;

  /** MCP servers to start inside container */
  'container:mcp': McpServerConfig[];

  /** Custom tools available in container */
  'container:tools': ToolDefinition[];

  /** Context enrichment — called by context compiler when this package is active */
  'context:enrich': (snapshot: string, uid: string) => string;

  /** Dashboard widget pinned when package is active */
  'dashboard:widget': { template: string; position: 'top' | 'bottom'; data_source?: string };

  /** Lifecycle hooks */
  'session:start': (sessionId: string, uid: string) => void;
  'session:end': (sessionId: string, uid: string) => void;

  /** Cross-package dependencies */
  'requires': string[];  // other package IDs this depends on
}

// Module subscription (each module registers interest)
packageRegistry.on('template:register', (pkgId, templates) => {
  templateRegistry.addTemplates(pkgId, templates);
});

packageRegistry.on('frontend:app_mode', (pkgId, appMode) => {
  // Stored; frontend fetches active package's app_mode via API
});

packageRegistry.on('context:enrich', (pkgId, enrichFn) => {
  contextCompiler.addEnricher(pkgId, enrichFn);
});
```

**Strengths:**
- Extensible — new integration points don't require manifest schema changes
- Dynamic — hooks like `context:enrich` can run code, not just declare data
- Decoupled — modules subscribe to hooks they care about, don't parse manifest directly
- Composable — multiple packages can register the same hook type (e.g., multiple context enrichers)

**Weaknesses:**
- More infrastructure (registry, event system, lifecycle management)
- Harder to reason about — effects are discovered at runtime, not visible in one file
- Debugging is harder — "why did the UI change?" requires tracing hook registrations
- Overkill when there are only 5-6 integration points

#### Decision: Start with A, Evolve to B

**Phase 1 (now): Manifest-Declarative.** We have ~6 integration points (templates, triggers, app_mode, tools, mcp, dashboard). The manifest schema covers all of them. Each module reads its fields directly. Simple, explicit, type-safe.

**Trigger to evolve to B:** When ANY of these become true:
1. We need **dynamic/computed** integrations (e.g., context enrichment that depends on runtime state)
2. We need **cross-package** composition (package A depends on package B's hooks)
3. The number of integration points exceeds ~10, and manifest becomes unwieldy
4. Third-party packages need to extend the system without modifying our manifest schema

**The migration path is clean:** Approach B reads from the same `manifest.json` — it just adds a registry layer on top. Existing manifest fields become auto-registered hooks. New capabilities (like `context:enrich`) are added as hook-only features with optional `hooks.ts` files in the package directory.

```
Evolution path:
  Phase 1: manifest.json → modules read directly (NOW)
  Phase 2: manifest.json → hook-registry → modules subscribe (WHEN NEEDED)
  Phase 3: manifest.json + hooks.ts → hook-registry (FUTURE — dynamic hooks)
```

**The key principle:** Skills are NanoClaw-native (container execution). Experience packages use the host-side manifest to affect different modules. The manifest is the contract. If the contract needs to become dynamic, we add a registry — but the contract (manifest) remains the source of truth.

---

## 5. Dashboard Upgrade — The Development Loop

### 5.1 The Vision: PM and Marketing in the Loop

The dashboard should enable a complete **design → test → publish → iterate** loop for experience packages, accessible to non-engineers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard — Experience Studio              │
│                                                               │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │  Package       │  │  Live         │  │  Asset           │  │
│  │  Designer      │  │  Tester       │  │  Manager         │  │
│  │               │  │               │  │                 │  │
│  │ • manifest    │  │ • Run skill   │  │ • Upload media  │  │
│  │ • skill.md    │  │ • See cards   │  │ • Example I/O   │  │
│  │ • templates   │  │ • Test tools  │  │ • Demo videos   │  │
│  │ • triggers    │  │ • View logs   │  │ • Screenshots   │  │
│  │ • workflow    │  │ • Compare     │  │ • Cloud URLs    │  │
│  └───────────────┘  └───────────────┘  └─────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │                    Package Gallery                     │    │
│  │                                                         │    │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐        │    │
│  │  │ 🎬  │  │ 🍽️  │  │ 🥗  │  │ 🐕  │  │ 🏠  │        │    │
│  │  │Movie│  │Rest.│  │Nutr.│  │Pet  │  │Real │        │    │
│  │  │Post.│  │Find.│  │Anal.│  │Care │  │Est. │        │    │
│  │  │     │  │     │  │     │  │     │  │     │        │    │
│  │  │ v1.0│  │ v0.3│  │Draft│  │Draft│  │Idea │        │    │
│  │  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘        │    │
│  │                                                         │    │
│  │  Status: Published │ Testing │ Draft │ Draft │ Concept  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │               Claude AI Assistant                      │    │
│  │                                                         │    │
│  │  "Help me create a Pet Health Checker skill"           │    │
│  │                                                         │    │
│  │  → Generates manifest.json, skill.md, template schemas │    │
│  │  → Suggests tools and API integrations                 │    │
│  │  → Creates example inputs/outputs                      │    │
│  │  → Runs live test with sample image                    │    │
│  └───────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 The PM/Marketing Workflow (via `/package-drive`)

The PM's primary interface is the **`/package-drive`** Claude Code skill. It handles git, issues, and file creation — the PM just describes what they want.

```
Step 1: START
  PM runs: /package-drive
  Claude asks: "What should this AI skill do?"
  PM describes in plain English: "Identify plants from photos and give care tips"
  Claude auto-creates GitHub Issue + mission branch (PM never touches git)

Step 2: GENERATE
  Claude creates all files from PM's description:
    - SKILL.md (what the AI does — plain English)
    - manifest.json (triggers, templates, model config)
  Shows the generated SKILL.md for PM to review
  PM can say "make it also suggest where to buy the plant" → Claude rewrites

Step 3: TEST
  PM opens dashboard → Chat tab → types "what plant is this?"
  Watches cards stream in real-time:
    - Thinking card: "Identifying plant species..."
    - Image analysis card: "Monstera deliciosa"
    - Step guide card: "Care Instructions"
  If results are poor → tells Claude → Claude edits SKILL.md → test again

Step 4: SAVE EXAMPLES
  When PM gets a result they like → clicks "Save as Example" in dashboard
  Dashboard auto-captures: input photo + output cards + screenshots
  Saved examples appear in the package gallery

Step 5: SHIP
  PM tells Claude "ship it" → Claude commits + creates PR via /team-ship
  Code review by engineering → merge → live for all users

Step 6: ITERATE
  PM runs: /package-drive improve {id}
  Dashboard shows usage analytics per package
  PM refines SKILL.md based on real usage → re-tests → re-ships
```

### 5.3 Package Gallery — Full Information Display

Each package in the gallery shows:

```
┌─────────────────────────────────────────────────────────────┐
│ 🎬 Movie Poster Creator                          v1.0.0    │
│                                                              │
│ Transforms a scene into a cinematic movie poster with       │
│ title and tagline.                                          │
│                                                              │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│ │ Example 1      │  │ Example 2      │  │ Example 3      │ │
│ │ [input photo]  │  │ [input photo]  │  │ [input photo]  │ │
│ │      ↓         │  │      ↓         │  │      ↓         │ │
│ │ [output card]  │  │ [output card]  │  │ [output card]  │ │
│ └────────────────┘  └────────────────┘  └────────────────┘ │
│                                                              │
│ ─── Technical Details ───────────────────────────────────── │
│ Model: claude-sonnet-4-6  │  Est. time: 10-20s  │  $0.02-0.05 │
│ Triggers: "movie poster", "电影海报"                        │
│ Templates: thinking-process → hero-image                    │
│ Tools: (none)  │  APIs: (none)                              │
│                                                              │
│ ─── Execution Flow ─────────────────────────────────────── │
│ Step 1: [Analyzing scene] → thinking-process card           │
│ Step 2: [Generating poster] → hero-image card               │
│                                                              │
│ [▶ Test Now]  [✏️ Edit]  [📊 Analytics]  [📤 Export]       │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Online Testing — "Try Before You Ship"

The Live Tester is the most critical feature for closing the dev loop:

```
┌─────────────────────────────────────────────────────────────┐
│  Live Tester: Movie Poster Creator                          │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  Input                │  │  Output (live)               │ │
│  │                      │  │                              │ │
│  │  [📷 Upload Image]   │  │  ┌────────────────────────┐ │ │
│  │                      │  │  │ Thinking...            │ │ │
│  │  or paste URL:       │  │  │ • Analyzing scene ✅   │ │ │
│  │  [________________]  │  │  │ • Composing poster ⏳  │ │ │
│  │                      │  │  │ • Generating title...  │ │ │
│  │  Prompt:             │  │  └────────────────────────┘ │ │
│  │  [Create a movie     │  │                              │ │
│  │   poster from this   │  │  ┌────────────────────────┐ │ │
│  │   scene]             │  │  │ 🎬 THE GOLDEN HOUR     │ │ │
│  │                      │  │  │ [poster image]         │ │ │
│  │  Skill: movie-poster │  │  │ "Every sunset tells    │ │ │
│  │                      │  │  │  a different story"    │ │ │
│  │  [▶ Run Test]        │  │  └────────────────────────┘ │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                                                              │
│  ─── Execution Log (expandable) ────────────────────────── │
│  [exec_start] nanoclaw:movie-poster @ 2026-03-08T10:15:32  │
│  [exec_progress] Step 1/4: Preparing context...             │
│  [create_card] thinking-process (card_1709884532_1)         │
│  [stream_to_card] steps: "Analyzing scene"                  │
│  [tool_call] publish_card → hero-image                      │
│  [exec_result] Complete (12.4s, $0.03)                      │
│  ─── Raw API Response (expandable) ─────────────────────── │
│  { model: "claude-sonnet-4-6", usage: { ... } }            │
└─────────────────────────────────────────────────────────────┘
```

**Key features:**
- Upload test images or use example assets
- Watch card streaming in real-time (same rendering as the mobile app)
- See full execution log with tool calls, timings, costs
- Compare runs side-by-side (A/B testing different skill.md prompts)
- Save test runs as example scenarios for the gallery

### 5.5 Claude-Assisted Package Creation

The dashboard includes an AI assistant that helps PMs create packages:

```
PM: "I want a skill that scans food labels and calculates daily intake"

Claude:
  "Great idea! Let me design this for you.

  Skill concept: The user photographs a food label. The AI reads the
  nutrition facts, calculates how this fits into their daily intake goals,
  and suggests alternatives if it's unhealthy.

  Here's what I'll generate:

  1. manifest.json — with triggers like 'nutrition', 'food label', 'calories'
  2. skill.md — prompt that instructs the AI to:
     - Read the nutrition facts from the image
     - Compare against recommended daily values
     - Check user's dietary preferences (from memory)
     - Suggest healthier alternatives if needed
  3. Templates:
     - text-extraction (for reading the label)
     - nutrition-card (for the breakdown)
     - comparison-table (for alternatives)
  4. Example: I'll use a sample cereal box label

  Shall I generate this now?"

PM: "Yes, but make it also track cumulative daily intake"

Claude:
  "Got it — I'll add a memory_update tool call so the AI saves each
  scanned item to the user's episodic memory. Then the nutrition-card
  will show both this item AND today's running total.

  [generates all files]
  [runs test with sample image]
  [shows resulting cards in preview]

  Here's the test result. The skill correctly read the label, showed
  450 calories, and noted this is 22% of daily recommended intake.
  Want me to adjust anything?"
```

### 5.6 Examples from Test Runs — "Save as Example"

Instead of manual asset uploads, examples come from **real test runs saved by the PM**. This is simpler and guarantees examples always reflect actual behavior.

```
PM tests in dashboard → gets good result → clicks "Save as Example"

Dashboard auto-captures:
  packages/nutrition-analyzer/
  ├── manifest.json
  ├── skill.md
  ├── templates/
  │   └── nutrition-card.json
  └── examples/
      ├── pasta-carbonara/
      │   ├── input.json          ← { prompt, mediaUrls } — what PM sent
      │   ├── output.json         ← { cards: [...], duration, cost } — what AI returned
      │   └── card-snapshots/     ← rendered card screenshots (auto-captured)
      │       ├── thinking-process.png
      │       └── nutrition-card.png
      └── cereal-box/
          ├── input.json
          ├── output.json
          └── card-snapshots/
              └── ...
```

**How it works:**
1. PM runs a test via dashboard Live Tester
2. Dashboard captures the full card output (JSON + visual snapshots)
3. PM clicks "Save as Example" → dashboard writes to `packages/{id}/examples/`
4. Example appears in the package gallery with input/output pair
5. Examples also serve as regression tests — compare future runs against saved output

No manual file uploads. No cloud storage management. The dashboard handles everything from test runs.

---

## 6. Architecture — Connecting the Pieces

### 6.1 Overall System Flow (Container Model)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dashboard (React)                         │
│  Package Gallery │ Designer │ Live Tester │ Asset Manager        │
└─────────┬──────────────────┬──────────────────┬─────────────────┘
          │                  │                  │
          │  REST API        │  SSE             │  File upload
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Server (FastAPI)                          │
│                                                                   │
│  /api/packages/         ← CRUD for package manifests             │
│  /api/packages/:id/test ← Execute test → Redis channel          │
│  /api/packages/:id/assets ← Upload/list/delete assets           │
│  /api/packages/:id/publish ← Promote Draft → Published          │
│  /api/packages/:id/examples ← Manage example scenarios          │
│  /api/ai/assist         ← Claude-assisted package creation       │
│                                                                   │
│  Storage: packages/ dir (filesystem) + GCS (assets + media)     │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ Redis PUB/SUB (vi:exec:{uid})
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NanoClaw Host Process                         │
│                                                                   │
│  ┌─────────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ Redis Channel   │ │ Package      │ │ Context Compiler     │  │
│  │ (self-register) │ │ Registry     │ │ (30s interval)       │  │
│  │                 │ │ (metadata)   │ │                      │  │
│  │ Subscribes to   │ │              │ │ Writes to            │  │
│  │ vi:exec:{uid}   │ │ Templates    │ │ /workspace/context/  │  │
│  │ → GroupQueue     │ │ Triggers     │ │                      │  │
│  └────────┬────────┘ └──────────────┘ └──────────────────────┘  │
│           │                                                       │
│           ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ GroupQueue + Container Pool                               │    │
│  │                                                            │    │
│  │  container-runner.ts:                                      │    │
│  │    1. Spawn Docker container (or reuse idle one)           │    │
│  │    2. Bind mount: skills/, user data/, context/            │    │
│  │    3. Pipe message to stdin                                │    │
│  │    4. Stream-parse stdout:                                 │    │
│  │       - CARD_OP markers → publish vi:stream:{uid}          │    │
│  │       - OUTPUT markers → Redis channel response            │    │
│  │    5. Watch IPC files for sub-agent communication          │    │
│  │    6. Idle timeout → kill container                        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Intention    │ │ Card Store   │ │ IPC Watcher              │ │
│  │ Predictor    │ │ (persist)    │ │ (follow-ups, tasks)      │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Redis PUB/SUB (vi:stream:{uid})
                          ▼
                    Frontend (SSE) / Realtime Agent
```

### 6.2 Dashboard Feature Matrix

| Feature | Purpose | Backend | Frontend Component |
|---------|---------|---------|-------------------|
| **Package Gallery** | Browse all packages with status, examples, metrics | `GET /api/packages` | `PackageGallery.tsx` |
| **Package Designer** | Edit manifest, skill.md, templates, triggers | `PUT /api/packages/:id` | `PackageDesigner.tsx` |
| **Live Tester** | Execute skill with test input, see cards in real-time | `POST /api/packages/:id/test` + SSE | `LiveTester.tsx` |
| **Asset Manager** | Upload media, manage examples, generate URLs | `POST /api/packages/:id/assets` | `AssetManager.tsx` |
| **AI Assistant** | Claude helps create/refine packages | `POST /api/ai/assist` | `AIAssistant.tsx` |
| **Execution Log** | Detailed view of skill execution with tool calls | SSE stream events | `ExecutionLog.tsx` |
| **A/B Comparator** | Side-by-side comparison of test runs | Client-side state | `ABComparator.tsx` |
| **Publishing Flow** | Draft → Testing → Review → Published status machine | `POST /api/packages/:id/publish` | `PublishFlow.tsx` |
| **Usage Analytics** | Per-package execution count, success rate, avg cost | `GET /api/packages/:id/analytics` | `PackageAnalytics.tsx` |

### 6.3 Package Status Machine

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌───────────┐
│  Idea   │────▶│  Draft  │────▶│ Testing │────▶│ Published │
│         │     │         │     │         │     │           │
│ concept │     │ has     │     │ has     │     │ live,     │
│ only    │     │ skill.md│     │ passing │     │ available │
│         │     │ and     │     │ tests   │     │ to users  │
│         │     │ manifest│     │         │     │           │
└─────────┘     └────┬────┘     └────┬────┘     └─────┬─────┘
                     │               │                 │
                     │               ▼                 ▼
                     │          ┌─────────┐     ┌───────────┐
                     └─────────▶│ Archived│     │ Deprecated│
                                │         │     │           │
                                │ removed │     │ still     │
                                │ from    │     │ works but │
                                │ gallery │     │ hidden    │
                                └─────────┘     └───────────┘
```

---

## 7. Implementation Plan

### Phase 1: Container Migration — Replace In-Process Execution

**Goal:** Remove the fundamentally wrong in-process Claude SDK execution and replace with the native NanoClaw container+IPC model.

1. **Remove in-process execution** (see Section 3.1 for full file list)
   - Delete: `skill-executor.ts`, `skill-loader.ts`, `task-executor.ts`, `exec-handler.ts`, `process-pool.ts`, `queue-router.ts`
   - These files implement the wrong architecture — in-process Claude SDK calls with hardcoded tools

2. **Create container infrastructure** (reference: `../nanoclaw/src/`)
   - `container-runner.ts` — Docker container spawning with bind mounts, stdin/stdout piping
   - `container-runtime.ts` — Docker runtime abstraction (exec, kill, inspect)
   - `group-queue.ts` — Concurrency management (per-user container limits)
   - `container/Dockerfile` — Container image with Claude Code CLI installed
   - `container/agent-runner/` — Agent runner script (extended with CARD_OP markers)
   - `container/skills/` — Skills directory (Claude Code slash commands, synced at spawn)

3. **Create Redis channel**
   - `channels/redis-channel.ts` — Self-registering NanoClaw channel (modeled after Telegram in native NanoClaw)
   - Subscribes to `vi:exec:{uid}`, pipes messages to container via GroupQueue
   - Receives container output, publishes to `vi:stream:{uid}`

4. **Create IPC system**
   - `ipc.ts` — Watch `/workspace/ipc/` for outbound messages, tasks, follow-ups
   - File-based communication between container and host (same as native NanoClaw)

5. **Extend stdout stream-parser with card ops**
   - Parse `CARD_OP_START`/`CARD_OP_END` markers from container stdout
   - Publish card ops to `vi:stream:{uid}` in real-time (~10-50ms latency)
   - Keep existing `OUTPUT_START_MARKER`/`OUTPUT_END_MARKER` for text output

6. **Update entry point** (`index.ts`)
   - Remove process pool startup
   - Add Redis channel registration
   - Add container pool initialization
   - Add IPC watcher startup

### Phase 2: Dashboard + `/package-drive` Skill

**Goal:** PMs can see all packages, run tests through containers, save examples, and iterate on SKILL.md — using `/package-drive` and the dashboard together.

1. **`/package-drive` Claude Code skill** (`.claude/commands/package-drive.md`) — **DONE**
   - CREATE mode: describe idea → generate package → test → ship
   - IMPROVE mode: load existing package → edit → test → ship
   - TEST mode: guide dashboard testing → fix issues → iterate
   - Git workflow gate: auto-creates GitHub Issue + mission branch for non-developers
   - Uses `AskUserQuestion` at every step — no jargon, no coding required

2. **API Server endpoints** (new routes in `api-server/`)
   - `GET /api/packages` — list all packages with metadata from manifest.json
   - `GET /api/packages/:id` — full package details (manifest + SKILL.md content)
   - `PUT /api/packages/:id` — update manifest or SKILL.md
   - `POST /api/packages/:id/test` — send test message via Redis channel → container execution
   - `GET /api/packages/:id/examples` — list saved example scenarios
   - `POST /api/packages/:id/examples` — "Save as Example" — capture test run input+output

3. **Frontend components** (new pages in `frontend/`)
   - `PackageGallery` — grid of package cards with status badges and saved examples
   - `PackageDetail` — full info display with input/output example pairs
   - `LiveTester` — input form + real-time card output + "Save as Example" button
   - Reuse existing card renderers from the session view

4. **NanoClaw dashboard routes** (extend `dashboard-routes.ts`)
   - `POST /api/dashboard/test-package` — send test via Redis channel → container
   - `GET /api/dashboard/containers` — show running container status
   - `GET /api/dashboard/ipc/:sessionId` — show IPC history for a session
   - `GET /api/dashboard/packages/:id/examples` — serve saved examples
   - `POST /api/dashboard/packages/:id/save-example` — save current test run as example

### Phase 3: Dashboard — Designer + AI Assistant

**Goal:** PMs can create new packages with Claude's help.

1. **Package Designer UI**
   - manifest.json editor (form-based, not raw JSON)
   - SKILL.md editor (markdown editor with preview — Claude Code slash command format)
   - Template picker (visual selection from template catalog)
   - Trigger configurator (visual cue tags + voice keyword input)

2. **AI Assistant integration**
   - Chat interface in the dashboard
   - Claude generates package scaffolding from natural language description
   - Generates both `packages/{id}/manifest.json` and `container/skills/{id}/SKILL.md`
   - Iterative refinement: PM describes → Claude generates → PM tests via container → PM adjusts → repeat

3. **Example management (from test runs)**
   - "Save as Example" button auto-captures test input + card output + screenshots
   - Example gallery in package detail page
   - Compare saved examples against new test runs (regression detection)
   - Export examples for documentation or marketing use

### Phase 4: Publishing + Analytics

**Goal:** Full lifecycle management with usage tracking.

1. **Publishing workflow**
   - Status machine enforcement (Draft → Testing → Published)
   - Publish = copy SKILL.md to `container/skills/` + manifest to `packages/` → containers pick up on next spawn
   - Rollback = revert to previous SKILL.md version

2. **Usage analytics**
   - Track executions per package: count, success rate, avg duration, avg cost
   - Store in PostgreSQL (extend api-server schema)
   - Dashboard charts: usage trends, error rates, user satisfaction

3. **Feedback loop**
   - Users can rate skill outputs (thumbs up/down on cards)
   - PM sees aggregated feedback per package
   - Claude suggests improvements based on failure patterns

---

## 8. Key Design Decisions

### 8.1 Container-Side vs. Host-Side Responsibilities

| Capability | Where | Rationale |
|------------|:-----:|-----------|
| Skill execution | Container | Claude Code CLI in Docker — full isolation, native agent capabilities |
| Tool access | Container | Agent uses Claude Code tools natively — filesystem, bash, MCP, etc. |
| Card emission | Container (stdout) | Agent emits CARD_OP markers; host stream-parses and routes to Redis |
| Sub-agent spawning | Container | Claude Code agent teams — entirely within container |
| Memory read/write | Container | Agent reads/writes `/workspace/memory/` via filesystem |
| Template registry | Host | Templates must be known to frontend before container runs |
| Intention prediction | Host | Runs on camera frames every 30s — independent of containers |
| Context compilation | Host | Aggregates across services — writes to container-readable path |
| Container lifecycle | Host | GroupQueue manages spawn/idle/kill — containers don't self-manage |
| Card routing | Host | Parses container stdout → publishes to vi:stream:{uid} |
| IPC handling | Host | Watches IPC files for outbound messages and follow-up tasks |
| Dashboard/Analytics | Host + API Server | Metadata, status, and usage tracking |

### 8.2 Why Containers, Not In-Process SDK?

The in-process Claude SDK model was fundamentally wrong because:

1. **It reimplements Claude Code poorly.** Claude Code already has tool dispatch, file access, bash execution, agent teams, MCP support, and conversation management. Reimplementing these as hardcoded `TOOL_DEFINITIONS` in `skill-executor.ts` creates a fragile, limited subset.

2. **It breaks isolation.** In-process execution shares the Node.js process — a misbehaving skill can crash the entire NanoClaw server. Containers provide process isolation and resource limits.

3. **It can't scale.** The process pool (`process-pool.ts`) runs N workers in a single Node.js process. Container pools run N independent Docker containers with true parallelism.

4. **It diverges from the reference architecture.** Native NanoClaw uses containers with IPC — a proven, battle-tested model. Our in-process model was a shortcut that created technical debt.

5. **Skills can't leverage Claude Code features.** In-process SDK calls don't support slash commands, agent teams, MCP servers, or context window management. Inside a container, the agent has the full Claude Code CLI.

### 8.3 Why Redis as a NanoClaw Channel?

Redis is implemented as a **self-registering channel**, just like Telegram or WhatsApp in native NanoClaw. This means:

- Redis subscribes to `vi:exec:{uid}` messages like any channel subscribes to incoming messages
- Messages are routed through the same GroupQueue → container pipeline as any channel message
- No special-case code for Redis — it's just another channel
- The frontend, API server, and realtime agent all send messages the same way: publish to Redis

This follows the native NanoClaw pattern where channels self-register at startup and the message router doesn't know or care which channel a message came from.

### 8.4 MCP in the Container Model

MCP servers declared in `manifest.json` are started **inside the container**, not on the host:

```json
{
  "mcp": {
    "servers": [
      {
        "name": "restaurant-db",
        "command": "npx",
        "args": ["-y", "@mcp/restaurant-search"],
        "env": { "API_KEY": "${YELP_API_KEY}" }
      }
    ]
  }
}
```

At container spawn, the host writes MCP server configs to the container's `.claude/` directory. Claude Code inside the container starts and connects to MCP servers natively. This means:
- MCP servers are isolated per-container (no cross-user leakage)
- Agent has full MCP tool access via Claude Code's native MCP support
- No host-side MCP lifecycle management needed

### 8.5 Scaling Considerations

- **Intention prediction uses a learning approach** (Claude Haiku with context) rather than rule-based trigger matching. Scales to unlimited skills.
- **Template selection is AI-driven** — Claude inside the container chooses which card templates to emit. Adding templates doesn't require code changes.
- **Skills are just SKILL.md files** — adding a skill = adding a file. No code changes, no registry updates, no hook wiring.
- **Container pool scales horizontally** — more containers = more parallel users. GroupQueue handles concurrency limits.

The manifest schema uses strict validation (Zod) — this is a LAW (contract between package and host), not a heuristic.

---

## 9. Summary

```
Skill    = SKILL.md (Claude Code slash command) — "how to do one thing"
Package  = manifest.json + SKILL.md + templates + assets — complete deployable experience

Architecture:
  Container model (target):
    Redis channel → GroupQueue → Docker container → Claude Code CLI
    Container stdout → CARD_OP markers → host stream-parser → vi:stream:{uid}
    IPC files → follow-up messages, scheduled tasks
    Skills = /home/node/.claude/skills/ (bind-mounted from container/skills/)

  In-process model (REMOVE — fundamentally wrong):
    exec-handler → process-pool → skill-executor → Claude SDK → hardcoded tools
    (This entire execution path must be deleted and replaced)

Current state:
  ✅ Package loading and template registration (host-side metadata)
  ✅ Card streaming protocol (vi:stream:{uid} → SSE)
  ✅ Context compiler (30s interval, fully optimized — mtime cache, hash dedup, idle detection)
  ✅ Intention predictor (Claude Haiku on camera frames)
  ✅ Basic dashboard (health, skills, sessions, chat)
  ✅ /package-drive skill (Claude Code slash command for growth team)
  ✅ AppMode type defined in types.ts (manifest schema ready)
  ❌ Container execution model (using wrong in-process SDK — MUST MIGRATE)
  ❌ Redis as self-registering channel
  ❌ IPC system
  ❌ Card ops via stdout markers
  ❌ Frontend app_mode consumption (type exists, frontend doesn't read it)
  ❌ Dashboard package gallery + live tester + "Save as Example"
  ❌ AI-assisted package creation (dashboard-side)
  ❌ Publishing workflow
  ❌ Hook-registry for package integration (future — start with manifest-declarative)

Implementation phases:
  Phase 1: Container migration — remove in-process SDK, build container+IPC model
  Phase 2: Dashboard + /package-drive — PM creates packages via skill, tests in dashboard, saves examples
  Phase 3: Designer + AI assistant — dashboard-side package editing with Claude
  Phase 4: Publishing + analytics — full lifecycle management
```

The ultimate goal: **PM runs `/package-drive` → describes the idea in plain English → Claude creates GitHub Issue + branch + all package files → PM tests in dashboard → clicks "Save as Example" on good results → Claude ships via `/team-ship` → PR reviewed and merged → live. No code, no git, no JSON editing.**
