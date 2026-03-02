---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
description: 提交完成的 Mission Contract。QA验证、创建PR、合入main、更新Issue状态。做完任务后用这个skill来收尾。
---

# /complete-mission — 提交 Mission Contract

**User input**: $ARGUMENTS

你是 Mission Contract 的交付层。当 Role 完成了一个 MC 的开发，
通过这个 skill 进行 QA 验证、创建 PR、合入 main、更新 GitHub Issue 状态。

**Source of Truth: GitHub Issues + PRs + CI**

---

## 路由

| Input | 操作 |
|-------|------|
| (空) | 自动检测当前分支，执行完整提交流程 |
| `sync` | 仅 rebase on main，不提交 |
| `review {pr}` | 审查指定 PR |
| `done #{number}` 或 `done T-{id}` | PR 已合并后，执行清理和状态更新 |

---

## Operation: 完整提交流程（默认）

### Step 1: 检测状态

```bash
git branch --show-current
git worktree list
```

如果在 `main`，中止："You're on main. Run /get-mission first."

**识别关联的 Issue：**
1. 检查 worktree 根目录是否有 `.mission` 文件（由 get-mission 创建）：
   ```bash
   cat .mission 2>/dev/null
   ```
2. 如果没有 `.mission`，从分支名提取 Task ID（如 `feature/T-056-food-calorie` → 搜索 Issue title 含 `T-056`）：
   ```bash
   gh issue list --label "mission-contract" --search "T-056 in:title" --json number,title --jq '.[0].number'
   ```
3. 如果仍找不到，用 AskUserQuestion 让用户手动输入 Issue number。

确认 Issue 存在且状态为 `status:wip`：
```bash
gh issue view {number} --json number,title,labels,state
```

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
cd api-server && python -m pytest tests/ -v 2>&1; cd ..

# Frontend
cd frontend && npx eslint src/ 2>&1; cd ..

# Gateway
cd gateway/plugin && npm run lint 2>&1; cd ../..
```

**报告结果但不阻塞 PR 创建**——CI 会做最终裁决。
如果本地测试失败，在 Step 5 中标注警告。

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

gh pr create \
  --title "{type}({scope}): {description}" \
  --body "$(cat <<'EOF'
## Mission Contract: #{issue-number}
{task title}

Closes #{issue-number}

## Changes
- {what changed and why}

## Verification
- Local tests: {pass/fail summary}
- Quality Gates: {results}
- Conflicts: resolved (rebased on latest main)

## Checklist
- [ ] Tests pass locally
- [ ] Code self-reviewed
- [ ] No secrets committed
- [ ] Relevant docs updated

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**关键：`Closes #{issue-number}` 确保 PR merge 后 Issue 自动关闭。**

### Step 7: 更新 Issue 状态

```bash
# Move to review status
gh issue edit {number} --remove-label "status:wip" --add-label "status:review"

# Add PR link comment
gh issue comment {number} --body "📦 PR submitted: {pr-url}"
```

### Step 8: 检查 CI 状态

```bash
# Wait briefly and check CI status
gh pr view --json statusCheckRollup --jq '.statusCheckRollup[] | "\(.context): \(.state)"'
```

如果 CI 有失败：
```
⚠️  CI 检查失败:
   {check-name}: {status}

   查看详情: {pr-url}/checks
   修复后 push 到同一分支，CI 会自动重新运行。
```

### Step 9: 报告

```
🚀 Shipped: #{number} {title}
   PR:     {pr-url}
   Issue:  #{number} → status:review
   CI:     {pass/pending/fail}
   Files:  {N} changed

   CI 通过后:
   1. 等待 review (或自行 approve)
   2. Merge PR (GitHub 会自动关闭 Issue)
   3. 运行: /complete-mission done #{number}
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

**Trigger**: `/complete-mission done #{number}` 或 `/complete-mission done T-{id}`

PR 合并后的清理工作：

1. **验证 PR 已合并：**
   ```bash
   gh issue view {number} --json state --jq '.state'
   ```
   如果 Issue 仍 open（PR 没有 `Closes` 或手动 merge），手动关闭：
   ```bash
   gh issue close {number} --reason completed
   ```

2. **更新 Issue labels：**
   ```bash
   gh issue edit {number} --remove-label "status:review" --add-label "status:done"
   ```
   （如果 Issue 已 closed 且标签更新失败，跳过——closed issue 的 labels 更新在某些情况下可能不支持）

3. **更新 member file：**
   读取 `.teamspace/members/{id}.md`，添加到"最近完成"表。

4. **同步 board.md：**
   ```bash
   ./scripts/sync-board.sh
   ```

5. **清理 worktree（先询问）：**
   AskUserQuestion:
   - "Remove worktree" → `git worktree remove ../vi-wt-{slug}`
   - "Keep it for now" → 保留

6. 输出：

```
✅ Done: #{number} {title}
   Issue: closed ✅
   Board: synced ✅

   Next: /get-mission  ← 领取下一个 Mission Contract
```

---

## 行为规则

1. **GitHub Issues + PRs 是 source of truth.** Issue status 通过 labels 管理，PR 通过 `Closes #` 关联。
2. **`.mission` 文件** 是 worktree 到 Issue 的桥梁。没有它就从分支名推断。
3. **CI 是最终裁决.** 本地测试只做预检，CI pass 是 merge 的硬性条件。
4. **Rebase, don't merge.** 保持干净的 history。
5. **`Closes #{number}` 是必须的.** PR body 中必须包含，确保 merge 后 Issue 自动关闭。
6. **sync-board.sh** 在 done 操作后自动运行，保持 board.md 与 GitHub 同步。
