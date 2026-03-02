---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
description: 提交完成的 Mission Contract。QA验证、创建PR、合入main、更新board。做完任务后用这个skill来收尾。
---

# /complete-mission — 提交 Mission Contract

**User input**: $ARGUMENTS

你是 Mission Contract 的交付层。当 Role 完成了一个 MC 的开发，
通过这个 skill 进行 QA 验证、创建 PR、合入 main、更新 board。

---

## 路由

| Input | 操作 |
|-------|------|
| (空) | 自动检测当前分支，执行完整提交流程 |
| `sync` | 仅 rebase on main，不提交 |
| `review {pr}` | 审查指定 PR |
| `done T-{id}` | PR 已合并后，执行清理和 board 更新 |

---

## Operation: 完整提交流程（默认）

### Step 1: 检测状态

```bash
git branch --show-current
git worktree list
```

如果在 `main`，中止："You're on main. Run /get-mission first."

从分支名提取 Task ID（如 `feature/T-056-food-calorie` → `T-056`）。

读取 `.teamspace/board.md`，找到对应任务确认存在。

### Step 2: Sync with main

```bash
git fetch origin main
git rebase origin/main
```

如果有冲突 → 报告冲突文件，协助解决。

### Step 3: QA 验证

运行项目测试套件（存在哪些就跑哪些）：

```bash
# API Server
cd api-server && .venv/bin/python -m pytest tests/ -v 2>&1 || true

# Frontend
cd frontend && npx eslint src/ 2>&1 || true

# Gateway
cd gateway/plugin && npm run lint 2>&1 || true
```

读取版本 spec 中的 quality gate，逐项检查。

### Step 4: Diff 摘要

```bash
git diff origin/main --stat
```

展示变更文件列表和行数统计。

### Step 5: 确认提交

AskUserQuestion:
- "Create PR and ship it" → 创建 PR
- "I need to fix something first" → 中止，让用户修复
- "Just show me the status" → 仅展示，不操作
- "Run full QA checklist" → 详细逐项验证

### Step 6: 创建 PR

```bash
git push -u origin {branch-name}

gh pr create --title "{type}({scope}): {description}" --body "$(cat <<'EOF'
## Mission Contract: {T-xxx}
{task title}

## Changes
- {what changed and why}

## Verification
- Tests: {pass/fail}
- Quality Gates: {results}
- Conflicts: resolved (rebased on latest main)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 7: 报告

```
🚀 Shipped: {T-xxx} {title}
   PR: {url}
   Files changed: {N}
   Tests: {pass/fail}

   After merge, run: /complete-mission done T-{xxx}
```

---

## Operation: Sync

**Trigger**: `/complete-mission sync`

快速 rebase，不执行完整提交流程。

```bash
git fetch origin main
git rebase origin/main
```

- Clean: "✅ Up to date with main. No conflicts."
- Conflicts: 列出冲突文件，协助解决。

---

## Operation: Review

**Trigger**: `/complete-mission review {pr-number}` 或 `/complete-mission review`

1. 如果没给 PR number，从当前分支检测：
   ```bash
   gh pr list --head $(git branch --show-current) --json number,title
   ```

2. 获取 PR 详情和 diff：
   ```bash
   gh pr view {pr-number} --json title,body,files,additions,deletions
   gh pr diff {pr-number}
   ```

3. 审查 PR（读取每个改动文件的完整内容）：
   - 正确性、安全性、架构合规性、质量、性能

4. 发布 review：
   ```bash
   gh pr review {pr-number} --body "{review}" {--approve|--request-changes|--comment}
   ```

---

## Operation: Done

**Trigger**: `/complete-mission done T-{id}`

PR 合并后的清理工作：

1. 读取 `.teamspace/board.md`，找到任务
2. 编辑 `.teamspace/board.md`：
   - 从 In Progress / In Review 移除
   - 添加到 Done 区域，标注完成日期
   - 递增 Merge Count
3. 更新 `.teamspace/members/{id}.md`：
   - 添加到"最近完成"表
   - 清空"当前工作"
4. 清理 worktree（先询问）：
   ```bash
   git worktree remove ../vi-wt-{slug}
   ```
5. 更新 Stats 区域的计数
6. 输出：

```
✅ Done: T-{xxx} {title}
   Merge count: {N} → {N+1}

   Next: /get-mission  ← 领取下一个 Mission Contract
```

---

## 行为规则

1. **Always read board.md fresh.** 不依赖记忆。
2. **原子编辑.** 编辑 board.md 时最小改动，不破坏其他人的行。
3. **Merge count is sacred.** 只有 PR 真正合入 main 后才递增。
4. **Rebase, don't merge.** 保持干净的 history。
5. **先测试后提交.** 不跳过测试步骤。
