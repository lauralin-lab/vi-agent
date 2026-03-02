# VI Agent — Team Operating System

## Three Core Concepts

### 1. Mission Contract (原子任务)
A single task from `.teamspace/board.md`. Each Mission Contract has clear scope,
success criteria, and is independently mergeable. A Role pulls one, executes it
end-to-end, resolves all conflicts with main, merges, then pulls the next one.

### 2. Role (人 + Claude Code)
A person paired with Claude Code forms a Role. Each Role:
- Activates with `claude --agent feature-lead`
- Continuously pulls Mission Contracts from the board
- Drives each one to completion and merge
- The human watches, the agent drives

### 3. Product (main 分支)
The product is what's on main. Every merge makes the product better.
**The ultimate metric is: how many Mission Contracts have been merged to main.**

---

## How It Works

```
Role opens Claude Code
     │
     ▼
Agent reads board → presents next available Mission Contract
     │
     ▼
Role claims it → worktree + branch + isolated ports
     │
     ▼
Agent drives end-to-end implementation
     │
     ▼
Rebase on latest main → resolve ALL conflicts
     │
     ▼
PR → CI passes → merge to main → board updated
     │
     ▼
Agent presents next Mission Contract → repeat
```

### Start Working

```bash
# Activate your Role
claude --agent feature-lead

# The agent handles everything:
# - Identifies you from git config
# - Reads the board for available Mission Contracts
# - Presents one for you to claim
# - Creates isolated dev environment
# - Drives implementation
# - Resolves conflicts and merges
# - Loops to the next Mission Contract
```

### Team Member Setup

1. Added to `.teamspace/config.yml` → `members`
2. Has a file at `.teamspace/members/{id}.md`
3. Set git identity: `git config user.name "{name}"`
4. Run `.claude/install.sh` (once, for hooks and notifications)

---

## Key Files

| File | Purpose |
|------|---------|
| `.teamspace/board.md` | Mission Contracts queue — the work to be done |
| `.teamspace/config.yml` | Team config, members, conventions |
| `.claude/agents/feature-lead.md` | The Role agent — `claude --agent feature-lead` |
| `.claude/agents/code-reviewer.md` | Auto PR reviewer |
| `.claude/drive/v0.1-definition/v0.1-spec.md` | Current version quality gates |
| `scripts/setup-worktree.sh` | One-click isolated dev environment |

## Port Isolation (parallel development)

Each worktree gets its own ports via `.env` — no conflicts between Roles:

| Role | API | Frontend | Gateway |
|------|-----|----------|---------|
| Default | 8000 | 5173 | 18789 |
| Offset +100 | 8100 | 5273 | 18889 |
| Offset +200 | 8200 | 5373 | 18989 |

`scripts/setup-worktree.sh` handles this automatically.

## Code Standards

- Commit: `type(scope): description`
- Branch: `{type}/{task-id}-{slug}`
- PR target: always `main`
- Rebase before PR: resolve conflicts BEFORE creating PR
- No secrets, no absolute paths in committed code

## Architecture

4-service monorepo: `api-server/` (Python/FastAPI), `realtime/` (Python/LiveKit),
`gateway/` (TypeScript/Node), `frontend/` (React/Vite). See `README.md`.
