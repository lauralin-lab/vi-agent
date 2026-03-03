---
name: set-role
description: 设置角色身份。每个成员第一次进来先 /set-role 注册身份，关联 teamspace。
---

# /set-role — 角色身份设置

**User input**: $ARGUMENTS

你是 VI Agent 团队的身份管理层。每个成员第一次打开 Claude Code 时，
先运行 `/set-role` 来注册身份、关联 teamspace、查看自己的状态。

---

## 执行流程

### Step 1: 检查 Skill 版本

**在做任何其他事情之前，先检查用户本地的 skill 是否最新。**

```bash
.claude/check-skills.sh
```

根据输出判断：

- `status=ok` → 一切正常，继续
- `status=missing` → 用户从未安装过 skill，输出：
  ```
  ⚠️  你的本地 skill 尚未安装。请先运行：
     .claude/install.sh
  ```
  **停止执行，等用户安装后重新运行 `/set-role`。**
- `status=stale` → skill 指向了其他来源（不是本 repo），输出：
  ```
  ⚠️  你的本地 skill 链接到了其他位置，建议重新安装以使用本项目的最新版本：
     .claude/install.sh
  ```
  用 AskUserQuestion 让用户选择是否立即安装。
- `status=outdated` → skill 版本落后于 repo，输出：
  ```
  ⚠️  你的 skill 版本落后于仓库最新版本。请重新安装：
     .claude/install.sh
  ```
  用 AskUserQuestion 让用户选择是否立即安装。

### Step 2: 验证 GitHub 认证

**检查 `gh` CLI 是否已认证，这是 GitHub-native 工作流的前提。**

```bash
gh auth status
```

- ✅ 已认证 → 继续，记录 GitHub username：
  ```bash
  gh api user --jq '.login'
  ```
- ❌ 未认证 → 输出：
  ```
  ❌ GitHub CLI 未认证。请先运行：
     gh auth login

     选择 GitHub.com → HTTPS → Login with a web browser
     确保登录的账号有本 repo 的访问权限。
  ```
  **停止执行。**

验证 repo 访问权限：
```bash
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

- ✅ 成功 → 继续
- ❌ 失败 → 输出：
  ```
  ❌ 当前 GitHub 账号无法访问本仓库。
     请确认：
     1. 你的 GitHub 账号已被添加为 repo collaborator
     2. 运行 gh auth login 登录正确的账号
  ```

### Step 3: 识别身份

```bash
git config user.name
```

读取 `.teamspace/config.yml`，在 `members` 列表中匹配（按 `id` 或 `github` 字段匹配 gh username）。

### Step 4: 分支 — 已有成员 vs 新成员

#### 已有成员

1. 读取 `.teamspace/members/{id}.md`
2. 查询 GitHub Issues 获取统计：
   ```bash
   # WIP 任务
   gh issue list --assignee @me --label "mission-contract" --label "status:wip" --json number,title --jq 'length'
   # 已完成
   gh issue list --assignee @me --label "mission-contract" --label "status:done" --state closed --json number --jq 'length'
   # 总分配
   gh issue list --assignee @me --label "mission-contract" --state all --json number --jq 'length'
   ```
3. 展示角色卡片：

```
╔══════════════════════════════════════════════╗
║  ROLE CARD                                   ║
╠══════════════════════════════════════════════╣
║  Name:     {name}                            ║
║  Role:     {role label}                      ║
║  GitHub:   @{github} ✅                      ║
║                                              ║
║  Missions: {total assigned}                  ║
║    WIP:    {wip count}                       ║
║    Done:   {done count}                      ║
║                                              ║
║  Version: {current version} ({status})       ║
╚══════════════════════════════════════════════╝
```

4. 提供快捷操作：

AskUserQuestion:
- "领取任务" → 提示用 `/get-mission`
- "继续当前任务" → 提示用 `/drive`（如果有 WIP）
- "提交完成" → 提示用 `/complete-mission`（如果有待提交的工作）
- "我就看看"

#### 新成员

如果 `$ARGUMENTS` 包含名字和 GitHub 用户名（如 `/set-role alice`），
直接使用。否则用 AskUserQuestion 收集：

1. **名字**（英文，小写，用作 id）

然后获取 GitHub username（已在 Step 2 获取）。

**选择角色**：
读取 `.teamspace/config.yml` → `roles` 列表，用 AskUserQuestion 让成员选择自己的 domain 角色：

AskUserQuestion:
- 列出所有可用角色（从 config.yml 的 `roles` 读取）
- 每个选项的 label = role label, description = role description

然后执行 onboard：

1. 编辑 `.teamspace/config.yml` → 添加到 `members` 列表：
   ```yaml
   - id: {id}
     name: "{Name}"
     role: {selected-role-id}
     github: {gh-username}
   ```

2. 创建 `.teamspace/members/{id}.md`：
   ```markdown
   # {Name}

   ## 当前状态

   🟢 Active

   ## 🟡 当前工作

   （无 WIP 任务）

   ## 🔴 被阻塞

   （无）

   ## 🔵 等待 Review

   （无）

   ## 最近完成

   | Task | Completed | Notes |
   |------|-----------|-------|

   ## 笔记

   - Joined the team on {date}
   - Role: {role label}
   - GitHub: @{github}
   ```

3. 输出：
   ```
   ✅ Welcome to the team, {Name}! (@{github})

      Role:        {role label}
      Member file: .teamspace/members/{id}.md
      GitHub:      ✅ authenticated, repo access confirmed

      Next steps:
      1. /get-mission  ← 领取你的第一个 Mission Contract
   ```

---

## 行为规则

1. **幂等**：如果成员已存在，不重复创建，直接展示角色卡片
2. **原子编辑**：编辑 config.yml 时，先读后改，最小改动
3. **不修改他人数据**：只添加新行，不碰已有成员的行
4. **GitHub 验证优先**：没有 `gh auth` 就不能继续——这是整个工作流的前提
