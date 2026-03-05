# VI Agent — Team Operating System

## Three Core Concepts

### 1. Mission Contract (原子任务)
A single task represented as a **GitHub Issue** (label: `mission`).
Each Mission Contract has clear scope, success criteria, and is independently mergeable.
Leader creates and assigns MCs via `/create-mc`. Member views assigned MCs via `/get-mc`,
executes end-to-end, submits via `/complete-mc`, leader reviews via `/review-mc`.

**Source of Truth: GitHub Issues** (label: `mission`)

### 2. Role (人 + Claude Code)
A person paired with Claude Code forms a Role. Each Role:
- Activates with `claude --agent feature-lead`
- Receives assigned Mission Contracts from the leader
- Drives each one to completion and submits for review
- The human watches, the agent drives

### 3. Product (main 分支)
The product is what's on main. Every merge makes the product better.
**The ultimate metric is: how many Mission Contracts have been merged to main.**

---

## How It Works

```
Leader creates MC via /create-mc
     │
     ▼
Member receives assignment → /get-mc shows details + branch
     │
     ▼
Checkout branch → drive end-to-end implementation
     │
     ▼
Rebase on latest main → resolve ALL conflicts
     │
     ▼
/complete-mc → PR (Closes #N) → notify leader
     │
     ▼
Leader /review-mc → approve + merge → Issue auto-closed
     │
     ▼
Member checks /get-mc for next assignment → repeat
```

### Start Working

```bash
# 1. 加入团队（首次）
/team

# 2. 查看分配的任务
/get-mc

# 3. 执行（用 drive 模式）
/drive

# 4. 提交完成
/complete-mc
```

或直接用 Agent 模式：
```bash
claude --agent feature-lead
```

### Leader Workflow

```bash
# 创建里程碑（可选，批量创建 MC）
/create-milestone

# 创建并分配任务
/create-mc fix camera permission @xxLe

# 查看团队状态
/team

# 审核提交的任务
/review-mc
```

### Team Member Setup

1. Set git identity: `git config user.name "{name}"`
2. Authenticate GitHub CLI: `gh auth login` (use your org account)
3. Run `.claude/install.sh` (once, for hooks and notifications)
4. Run `/team` to onboard, verify GitHub auth, and see your dashboard

---

## Key Files

| File | Purpose |
|------|---------|
| **GitHub Issues** | Mission Contracts — source of truth (label: `mission`) |
| `.teamwork/config.yml` | Team config, members, roles, notifications, GitHub integration |
| `.github/ISSUE_TEMPLATE/mission-contract.yml` | Issue template for creating MCs |
| `.claude/agents/feature-lead.md` | The Role agent — `claude --agent feature-lead` |
| `.claude/agents/code-reviewer.md` | Auto PR reviewer |
| `.claude/commands/create-mc.md` | Leader: create + assign MC |
| `.claude/commands/get-mc.md` | Member: view assigned MCs |
| `.claude/commands/complete-mc.md` | Member: submit completed MC |
| `.claude/commands/review-mc.md` | Leader: review + approve/reject |
| `.claude/commands/create-milestone.md` | Leader: create milestone with batch MCs |
| `.claude/commands/team.md` | Onboard + dashboard |
| `.claude/commands/scripts/tw-*.sh` | Shared helper scripts (config, git, label, notify, etc.) |

## Skill 版本检查（主动执行）

**每次新会话开始时**，如果用户要开始工作（不只是聊天），主动运行：

```bash
.claude/check-skills.sh
```

如果返回非 `status=ok`，**立即提醒用户更新**，然后再继续其他操作。
不要等用户问、不要跳过。更新命令：`.claude/install.sh`

用户级 skill（`/drive`, `/architect`, `/self-drive`, `/improve-user`）的最新版本
存储在 `.claude/skills/` 目录。`git pull` 会拉取最新版，但需要 `install.sh`
刷新 symlink 和 fingerprint。

## Code Standards

- Commit: `type(scope): description`
- Branch: `mission/{issue}-{slug}`
- PR target: always `main`
- Rebase before PR: resolve conflicts BEFORE creating PR
- No secrets, no absolute paths in committed code

## Architecture

4-service monorepo: `api-server/` (Python/FastAPI), `realtime/` (Python/LiveKit),
`nanoclaw/` (TypeScript), `frontend/` (React/Vite). See `README.md`.
