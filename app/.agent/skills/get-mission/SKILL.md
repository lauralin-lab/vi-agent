---
name: get-mission
description: 领取 Mission Contract。从 GitHub Issues 拉取下一个可用任务，claim 并创建隔离开发环境。
---

# /get-mission — 领取 Mission Contract

**User input**: $ARGUMENTS

你是 Mission Contract 的分发层。Role 通过这个 skill 从 GitHub Issues 领取下一个任务，
claim 后进入隔离环境开始开发。

**Source of Truth: GitHub Issues** (label: `mission-contract`)

---

## 路由

| Input | 操作 |
|-------|------|
| (空) | 呈现下一个可用 MC |
| `#{number}` 或 `T-{id}` | 直接领取指定 MC |
| `list` | 列出所有可用 MC |
| `status` | 显示团队看板快照 |
| `version` | 显示当前版本进度 |
| `create {description}` | 创建新 MC (GitHub Issue) |

---

## Operation: 领取下一个 MC（默认）

### Step 1: 识别自己

```bash
git config user.name
```

匹配 `.teamspace/config.yml` → `members`。如果没匹配到，提示先运行 `/set-role`。

同时获取 GitHub username：
```bash
gh api user --jq '.login'
```

如果 `gh auth status` 失败，提示先运行 `/set-role` 完成认证。

### Step 2: 查找可用任务

按以下优先级查找 GitHub Issues：

**1. 你的 WIP 任务（恢复未完成的工作）**
```bash
gh issue list --assignee @me --label "mission-contract" --label "status:wip" --json number,title,labels,body --limit 5
```

**2. 分配给你的 Queued 任务**
```bash
gh issue list --assignee @me --label "mission-contract" --label "status:queued" --json number,title,labels,body --limit 5
```

**3. 未分配的 Queued 任务（按 priority 排序）**
```bash
gh issue list --label "mission-contract" --label "status:queued" --no-assignee --json number,title,labels,body --limit 20
```

对未分配任务，按 priority label 排序：P0 > P1 > P2 > P3。

### Step 3: 读取版本上下文

读取 `.teamspace/config.yml` → `versions.spec_path`，了解 quality gate。

### Step 4: 呈现 MC

从 Issue body 中解析 Mission Contract 内容。展示：

```
╔══════════════════════════════════════════════╗
║  MISSION CONTRACT                            ║
╠══════════════════════════════════════════════╣
║  Issue:    #{number}                         ║
║  Task:     {title}                           ║
║  Priority: {priority label} │ Size: {size}   ║
║  Domain:   {domain label}                    ║
║  Version:  {version label}                   ║
║                                              ║
║  Success Criteria:                           ║
║  {parsed from issue body}                    ║
║                                              ║
║  Sub-tasks:                                  ║
║  {parsed from issue body}                    ║
╚══════════════════════════════════════════════╝
```

### Step 5: 确认

AskUserQuestion:
- "Claim this MC and start" → 执行 Claim 流程
- "Show me another MC" → 呈现下一个
- "I want to pick a specific one" → 列出所有可用 MC
- "Not now"

### Step 6: Claim 流程

1. 从任务标题生成 slug（kebab-case，简短）。如果标题含 `[T-xxx]`，提取作为 task-id。

2. **更新 GitHub Issue:**
   ```bash
   # Assign to self
   gh issue edit {number} --add-assignee @me

   # Update status label
   gh issue edit {number} --remove-label "status:queued" --add-label "status:wip"

   # Add claim comment
   gh issue comment {number} --body "🚀 Claimed by @{username} — starting work in worktree"
   ```

3. **创建隔离环境:**
   ```bash
   ./scripts/setup-worktree.sh {task-slug}
   ```
   如果 setup-worktree.sh 不存在或失败，手动创建：
   ```bash
   git worktree add -b feature/{task-id}-{slug} ../vi-wt-{slug}
   ```

4. **记录 Issue number 到 worktree**（供 complete-mission 使用）：
   在 worktree 根目录创建 `.mission` 文件：
   ```bash
   echo "{number}" > ../vi-wt-{slug}/.mission
   ```

5. 输出：
```
✅ Claimed: #{number} {title}

   Branch:    feature/{task-id}-{slug}
   Worktree:  ../vi-wt-{slug}
   Issue:     #{number}
   Ports:     API:{port} FE:{port} GW:{port}

   Next: cd ../vi-wt-{slug}
   Then: /drive
   Done: /complete-mission
```

---

## Operation: Status（团队看板快照）

**Trigger**: `/get-mission status`

从 GitHub Issues 聚合状态：

```bash
# 各状态计数
gh issue list --label "mission-contract" --label "status:wip" --json number --jq 'length'
gh issue list --label "mission-contract" --label "status:queued" --json number --jq 'length'
gh issue list --label "mission-contract" --label "status:review" --json number --jq 'length'
gh issue list --label "mission-contract" --label "status:blocked" --json number --jq 'length'
gh issue list --label "mission-contract" --label "status:done" --state closed --json number --jq 'length'

# Active work details
gh issue list --label "mission-contract" --label "status:wip" --json number,title,assignees
```

结合 `.teamspace/config.yml` 和 `git worktree list`，输出：

```
╔══════════════════════════════════════════════════════════╗
║  TEAM DASHBOARD — {team name}                           ║
╠══════════════════════════════════════════════════════════╣
║  Source: GitHub Issues (label: mission-contract)        ║
║  Version: {ver} ({status})                              ║
║                                                          ║
║  ┌─ Active Work ────────────────────────────────────┐   ║
║  │ @{user}: #{N} {title}                            │   ║
║  │ @{user}: #{N} {title}                            │   ║
║  └──────────────────────────────────────────────────┘   ║
║                                                          ║
║  📋 Queued: {N}  🟡 WIP: {N}  🔵 Review: {N}          ║
║  🔴 Blocked: {N}  ✅ Done: {N}                          ║
║                                                          ║
║  Worktrees: {list from git worktree list}               ║
╚══════════════════════════════════════════════════════════╝
```

---

## Operation: Version

**Trigger**: `/get-mission version`

读取版本 spec（`.claude/drive/v0.1-definition/v0.1-spec.md`），展示：
- 测试矩阵进度
- Quality gate 状态
- 版本内任务完成情况（从 GitHub Issues by version label）

---

## Operation: Create

**Trigger**: `/get-mission create {description}`

1. 解析描述，推断 Priority、Size、Domain
2. 用 AskUserQuestion 确认详情
3. 创建 GitHub Issue：
   ```bash
   gh issue create \
     --title "[T-{next_id}] {title}" \
     --body "{mission contract body}" \
     --label "mission-contract,status:queued,priority:{P},size:{size},domain:{domain}" \
     --label "version:{ver}"
   ```
4. 编辑 `.teamspace/config.yml` → 递增 `next_id`
5. 输出：
   ```
   ✅ Created: #{number} [T-{xxx}] {title}
      Priority: {P} │ Size: {size} │ Domain: {domain}
      URL: {issue url}
   ```

---

## Operation: List

**Trigger**: `/get-mission list`

```bash
gh issue list --label "mission-contract" --label "status:queued" --json number,title,labels --limit 50
```

按 Priority 排序列出所有 Queued 任务，标注 Version 归属。

---

## 行为规则

1. **GitHub Issues 是 source of truth.** 不从 board.md 读取任务状态。
2. **一人一 MC.** 如果有 WIP 任务（`--assignee @me --label "status:wip"`），先完成或放弃再领新的。
3. **Claim = assign + label + comment.** 三步操作确保状态一致。
4. **`.mission` 文件.** 在 worktree 根目录记录 Issue number，供 complete-mission 读取。
5. **Respect ownership.** 不修改他人的 Issue assignee。
6. **Fallback.** 如果 `gh` 命令失败，输出清晰的错误信息和修复指引。
