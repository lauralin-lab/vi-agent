# Research: SKILL Architecture Redesign

## Current State

### Three Skill-Like Concepts (confused naming)

| What exists | Where | What it actually is |
|---|---|---|
| Packages | `packages/*/` (manifest.json + instruction.md + templates + tools + app_mode) | User-facing AI experience shipped by growth/product people |
| "Skills" in dashboard | `nanoclaw/src/skills/skill-executor.ts` — 13 tool definitions (file_*, bash, memory_*, card_*, web_*, oauth_*) | **Tools** — runtime capabilities the agent can call |
| `.claude/` commands/agents | `.claude/commands/` (22 commands), `.claude/agents/` (2 agents) | **Construct Skills** — instructions for developers using Claude Code CLI |

### VI Agent Container vs Original NanoClaw Container

Original nanoclaw (`/Users/neil/Playground/agent_one_project/nanoclaw/`) has a **rich agent runtime**:
- `CLAUDE.md` personality (per group)
- `.claude/skills/` (agent-browser, etc.) auto-discovered by Claude Code SDK
- `.claude/memory.md` (auto-memory)
- Session resume (`resume: sessionId`)
- MCP server (`nanoclaw` — send_message, schedule_task, etc.)
- Hooks (PreCompact for transcript archiving, PreToolUse for bash sanitization)
- `allowedTools` whitelist
- `additionalDirectories` for multi-folder context
- `settings.json` with feature flags

VI Agent container (`nanoclaw/container/agent-runner/src/index.ts`) is **bare**:
- Raw prompt string injected via stdin
- `cwd: '/workspace/group'` (empty directory)
- No personality, no memory, no skills, no MCP, no hooks, no session resume

## Agreed Design Decisions

### Terminology (final)

| Term | Definition | Who uses it |
|---|---|---|
| **Package** | Shipping vehicle for a complete AI experience. Contains skill, cards, tools, APIs, app_mode. Growth people create and manage packages. | Product/Growth → shipped to users |
| **Skill** (Code Skill) | What the agent sees. A `.claude/skills/{name}/SKILL.md` file. Agent doesn't know packages exist. Pre-loaded, used autonomously. | Claude Code SDK → agent runtime |
| **Construct Skill** | `.claude/commands/` and `.claude/agents/`. Instructions for Claude Code CLI to modify the codebase. `/drive`, `/package-drive`, `/team-*`. | Claude Code CLI → developers |
| **Tool** | Runtime capability the agent can call. file_read, web_search, publish_card, etc. Currently misnamed "skill" in dashboard. | Agent runtime → execution |

### Package → Skill Build Pipeline

- **Timing**: Container start time (dynamic per-user)
- **Process**: Read user's enabled packages → generate SKILL.md from instruction.md + manifest → write to `.claude/skills/`
- **Agent sees only skills**, never packages

### SKILL.md Format — Phase-Based

```markdown
# {skill-name}

## When to activate
{trigger.visual_cues, trigger.voice_keywords from manifest — natural language}

## Phases
▶ Perceive: {description}
▶ Analyze: {description}
▶ Present: {description}
▶ Remember: {description — if applicable}

Each phase may produce cards.

## Templates
- {template-name} (during {phase})
- ...

## Tools
- publish_card, memory_update, etc.

## Instruction
{instruction.md content}
```

### Activation Mechanism

- **All skills pre-loaded** at container start in `.claude/skills/`
- **Agent autonomously decides** which skill to use based on context
- **#tag activation**: When user types `#nutrition-analyzer`:
  1. Host detects and strips the `#tag` from user text
  2. Appends soft prefill to prompt: `[skill nutrition-analyzer — phase: start]`
  3. Agent sees the nudge and follows that skill
- **No runtime injection** — skills are always available, tags are just intent signals
- Tags can be used at **any conversation round**, not just the first

### Dashboard Reorganization

- Rename "Skills" tab → **"Tools"** (shows file_*, bash, memory_*, card_*, web_*, oauth_*)
- Add new **"Skills"** tab (shows `.claude/skills/` — the agent's available capabilities)
- Group tools by type: File, System, Memory, Output, Web & APIs

## Key Files Reference

### Original NanoClaw (reference implementation)
- `nanoclaw/container/agent-runner/src/index.ts:394-426` — full SDK query() call with personality, skills, MCP, hooks
- `nanoclaw/groups/global/CLAUDE.md` — agent personality
- `nanoclaw/container/skills/agent-browser/SKILL.md` — skill format example
- `nanoclaw/src/container-runner.ts` — volume mounts, skill sync, secrets handling

### VI Agent (to be upgraded)
- `vi_agent/nanoclaw/container/agent-runner/src/index.ts` — bare SDK query() call
- `vi_agent/nanoclaw/src/skills/skill-executor.ts` — 13 tool definitions (rename to "tools")
- `vi_agent/packages/*/` — 5 packages (document-scanner, nutrition-analyzer, recipe-analyzer, scene-describer, style-advisor)
- `vi_agent/frontend/src/components/SkillsView.jsx` — dashboard "Skills" tab (rename to "Tools")
