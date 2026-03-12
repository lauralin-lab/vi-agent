# Plan: SKILL Architecture Redesign

## Mission Contract Reference
- Port original nanoclaw's rich agent-runner pattern to vi_agent container
- Implement Package → Skill build pipeline (generate SKILL.md from packages at container start)
- Pre-load all skills, support #tag soft activation at any conversation round
- Rename dashboard "Skills" → "Tools", add new "Skills" tab
- Clarify terminology: Package (shipping) / Skill (agent) / Tool (capability) / Construct Skill (developer)

## Approach Overview

Two parallel workstreams:

**Workstream A: Container Agent Runtime** — Upgrade vi_agent's agent-runner to match original nanoclaw's richness. Port personality, memory, skills discovery, MCP tools, hooks, session resume. Copy package SKILL.md files into .claude/skills/ at container start.

**Workstream B: Dashboard Rename** — Frontend change: rename Skills tab → Tools, add Skills tab showing agent's .claude/skills/.

### Why this approach?
The original nanoclaw already solved the "rich agent runtime" problem. We port its patterns rather than inventing new ones. The only genuinely new piece is the package→SKILL.md generation pipeline.

## Architecture / Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Package (what product ships)              │
│  manifest.json + instruction.md + templates/ + tools/       │
└────────────────────────────┬────────────────────────────────┘
                             │ generate at container start
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              .claude/skills/{name}/SKILL.md                  │
│  (what the agent sees — phase-based, autonomous)            │
│                                                              │
│  Pre-loaded, agent decides when to use                       │
│  #tag → soft prefill: [skill X — phase: start]              │
└────────────────────────────┬────────────────────────────────┘
                             │ Claude Code SDK auto-discovers
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Container Agent Runtime                         │
│                                                              │
│  sdk.query({                                                 │
│    prompt: userMessage,                                      │
│    options: {                                                │
│      cwd: '/workspace/group',                                │
│      systemPrompt: { preset: 'claude_code', append: base },│
│      allowedTools: [...],                                    │
│      mcpServers: { nanoclaw: { ... } },                     │
│      hooks: { PreCompact: [...] },                          │
│      resume: sessionId,                                      │
│      additionalDirectories: [...],                           │
│    }                                                         │
│  })                                                          │
└─────────────────────────────────────────────────────────────┘
```

### #tag Activation Flow

```
User: "#nutrition-analyzer what's in my lunch?"
  │
  ▼
Host (container-runner.ts):
  1. Parse message, detect #nutrition-analyzer
  2. Strip tag from user text → "what's in my lunch?"
  3. Append prefill context:
     "[skill nutrition-analyzer — phase: start]
      what's in my lunch?"
  4. Pass to container via stdin
  │
  ▼
Agent sees:
  - All skills pre-loaded in .claude/skills/
  - Prompt with soft activation nudge
  - Uses nutrition-analyzer skill → follows phases
  - Creates cards via publish_card tool
```

### Container Volume Mounts (upgraded)

```
/workspace/
├── .claude/
│   ├── CLAUDE.md              ← agent personality (base.md equivalent)
│   ├── skills/                ← generated from packages at start
│   │   ├── nutrition-analyzer/
│   │   │   └── SKILL.md
│   │   ├── scene-describer/
│   │   │   └── SKILL.md
│   │   └── ... (all enabled packages)
│   ├── memory.md              ← auto-memory
│   └── settings.json          ← feature flags
├── group/                     ← persistent user workspace (RW)
│   ├── memory/                ← user memory files
│   └── conversations/         ← archived transcripts
├── packages/                  ← package source (RO, for reference)
└── ipc/                       ← MCP communication
```

## Key Design Decisions

- **Pre-load all skills** — because agent should autonomously activate skills even without #tag
- **Phase-based SKILL.md** — flexible phases (Perceive/Analyze/Present/Remember) not rigid numbered steps
- **Soft prefill for #tag** — `[skill X — phase: start]` appended to prompt, not a hardcoded override
- **SKILL.md replaces instruction.md in packages** — authors write SKILL.md directly, no generation step
- **Copy at container start** — `cp packages/*/SKILL.md → .claude/skills/{name}/SKILL.md`, stable and predictable
- **Agent doesn't know packages exist** — clean abstraction boundary
- **Dashboard rename** — "Skills" → "Tools" reflects true nature; new "Skills" tab shows agent capabilities

## Implementation Sequence

### Phase 1: Agent Personality + Memory (foundation)
1. Create base CLAUDE.md for the vi_agent (port from realtime/src/base.md + original nanoclaw personality)
2. Upgrade agent-runner SDK query() call with systemPrompt, allowedTools, hooks, session resume
3. Mount .claude/ directory properly into container
4. Enable auto-memory

### Phase 2: Package Format Migration (instruction.md → SKILL.md)
5. Rename instruction.md → SKILL.md in all 5 packages
6. Rewrite each SKILL.md in phase-based format (Perceive/Analyze/Present/Remember)
7. Update package-loader.ts to read SKILL.md instead of instruction.md
8. Add skill copy step to container startup (cp packages/*/SKILL.md → .claude/skills/)

### Phase 3: #tag Activation
9. Add #tag detection in container-runner.ts (parse user messages)
10. Implement soft prefill mechanism
11. Test: #tag at first message, mid-conversation, multiple tags

### Phase 4: MCP Tools + Dashboard
12. Port MCP server from original nanoclaw (send_message, schedule_task)
13. Rename frontend Skills tab → Tools, group by type
14. Add new Skills tab showing .claude/skills/ contents

## Risk Mitigation

- **Startup latency from skill copy**: Just file copies. <10ms for 5 packages.
- **Context window from pre-loading all skills**: Claude Code SDK loads skills on-demand from .claude/skills/, not all at once. Manageable.
- **Breaking existing package test flow**: #tag activation is additive. Old skill-executor.ts path can remain as fallback during migration.
- **Migration from instruction.md**: Gradual — package-loader can fall back to instruction.md if SKILL.md not found.

## What This Plan Does NOT Cover
- User-created custom skills (API-persisted skills in data/users/{uid}/skills/)
- Custom tool definitions from packages (tools/tools.json)
- MCP tool migration from original nanoclaw beyond core tools
- App_mode / frontend UI transformation (stays as-is)
