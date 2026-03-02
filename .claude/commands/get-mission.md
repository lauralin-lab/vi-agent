---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
description: 领取 Mission Contract。从 board 拉取下一个可用任务，claim 并创建隔离开发环境。
---

# /get-mission — 领取 Mission Contract

**User input**: $ARGUMENTS

你是 Mission Contract 的分发层。Role 通过这个 skill 从 board 领取下一个任务，
claim 后进入隔离环境开始开发。

---

## 路由

| Input | 操作 |
|-------|------|
| (空) | 呈现下一个可用 MC |
| `T-{id}` | 直接领取指定 MC |
| `list` | 列出所有可用 MC |
| `status` | 显示团队看板快照 |
| `version` | 显示当前版本进度 |
| `create {description}` | 创建新 MC 到 board |

---

## Operation: 领取下一个 MC（默认）

### Step 1: 识别自己

```bash
git config user.name
```

匹配 `.teamspace/config.yml` → `members`。如果没匹配到，提示先运行 `/set-role`。

### Step 2: 读取 board

读取 `.teamspace/board.md`，按以下优先级查找：

1. **你的 WIP 任务**（In Progress 中 Owner = 你）→ 恢复
2. **分配给你的 Queued 任务** → 开始
3. **未分配的 Queued 任务**（P0 → P1 → P2）→ 领取

### Step 3: 读取版本上下文

读取 `.teamspace/config.yml` → `versions.spec_path`，了解 quality gate。

### Step 4: 呈现 MC

```
╔══════════════════════════════════════════════╗
║  MISSION CONTRACT                            ║
╠══════════════════════════════════════════════╣
║  Task: {T-xxx} {title}                       ║
║  Priority: {P0/P1/P2} │ Est: {S/M/L}        ║
║  Services: {tags}                            ║
║  Notes: {notes from board}                   ║
║  Quality Gates: {relevant gates}             ║
║                                              ║
║  Your merge count: {N}                       ║
╚══════════════════════════════════════════════╝
```

### Step 5: 确认

AskUserQuestion:
- "Claim this MC and start" → 执行 Claim 流程
- "Show me another MC" → 呈现下一个
- "I want to pick a specific one" → 列出所有可用 MC
- "Not now"

### Step 6: Claim 流程

1. 从任务标题生成 slug（kebab-case，简短）
2. 编辑 `.teamspace/board.md`：
   - 从 Queued 移除该任务行
   - 添加到 In Progress，填写 Owner, Branch, Worktree, Started
3. 运行 `./scripts/setup-worktree.sh {task-slug}` 创建隔离环境
4. 输出：

```
✅ Claimed: {T-xxx} {title}

   Branch:    feature/{T-xxx}-{slug}
   Worktree:  ../vi-wt-{slug}
   Ports:     API:{port} FE:{port} GW:{port}

   Next: cd ../vi-wt-{slug}
   Then: /drive T-{xxx}
   Done: /complete-mission
```

---

## Operation: Status（团队看板快照）

**Trigger**: `/get-mission status`

读取以下文件，输出简洁看板：

1. `.teamspace/board.md`
2. `.teamspace/config.yml`
3. `.teamspace/members/` 下所有文件
4. `git log --oneline -10`
5. `git worktree list`

```
╔══════════════════════════════════════════════════════════╗
║  TEAM DASHBOARD — {team name}                           ║
╠══════════════════════════════════════════════════════════╣
║  Version: {ver} ({status}) │ Progress: {done}/{total}   ║
║                                                          ║
║  ┌─ Merge Count ────────────────────────────────────┐   ║
║  │ {role1}: {N}  │ {role2}: {N}  │ {role3}: {N}     │   ║
║  └──────────────────────────────────────────────────┘   ║
║                                                          ║
║  ┌─ Active Work ────────────────────────────────────┐   ║
║  │ {role}: {T-xxx} {title}                          │   ║
║  └──────────────────────────────────────────────────┘   ║
║                                                          ║
║  Queued: {N} tasks ({N} P0, {N} P1, {N} P2)             ║
║  Worktrees: {list}                                       ║
╚══════════════════════════════════════════════════════════╝
```

---

## Operation: Version

**Trigger**: `/get-mission version`

读取版本 spec，展示测试矩阵和 quality gate 进度。

---

## Operation: Create

**Trigger**: `/get-mission create {description}`

1. 读取 `.teamspace/config.yml` → `next_id`
2. 解析描述，推断 Priority、Estimate、Tags
3. AskUserQuestion 确认
4. 编辑 `.teamspace/board.md` → 添加到 Queued
5. 编辑 `.teamspace/config.yml` → 递增 `next_id`
6. 输出：
   ```
   ✅ Created: T-{xxx} {title}
      Priority: {P} │ Est: {est} │ Version: {ver}
      Status: Queued on board.md
   ```

---

## Operation: List

**Trigger**: `/get-mission list`

列出所有 Queued 任务，按 Priority 排序，标注 Version 归属。

---

## 行为规则

1. **Always read board.md fresh.** 不依赖记忆。
2. **一人一 MC.** 如果有 WIP 任务，先完成或放弃再领新的。
3. **原子编辑.** 编辑 board.md 时最小改动，不破坏其他人的行。
4. **Respect ownership.** 不修改他人的 WIP 条目。
