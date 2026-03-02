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
# 1. 设置身份（首次）
/set-role

# 2. 领取任务
/get-mission

# 3. 执行（用 drive 模式）
/drive T-{xxx}

# 4. 提交完成
/complete-mission
```

或直接用 Agent 模式：
```bash
claude --agent feature-lead
```

### Team Member Setup

1. Set git identity: `git config user.name "{name}"`
2. Run `.claude/install.sh` (once, for hooks and notifications)
3. Run `/set-role` to register and link to teamspace

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
