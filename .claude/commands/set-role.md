---
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
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
- `status=outdated` → skill 版本落后于 repo（git pull 后 skill 文件更新了但 fingerprint 没刷新），输出：
  ```
  ⚠️  你的 skill 版本落后于仓库最新版本。请重新安装：
     .claude/install.sh
  ```
  用 AskUserQuestion 让用户选择是否立即安装。

### Step 2: 识别身份

```bash
git config user.name
```

读取 `.teamspace/config.yml`，在 `members` 列表中匹配。

### Step 3: 分支 — 已有成员 vs 新成员

#### 已有成员

1. 读取 `.teamspace/members/{id}.md`
2. 读取 `.teamspace/board.md`，找到该成员的 WIP 任务和 merge count
3. 展示角色卡片：

```
╔══════════════════════════════════════════════╗
║  ROLE CARD                                   ║
╠══════════════════════════════════════════════╣
║  Name:   {name}                              ║
║  Role:   {role}                              ║
║  GitHub: @{github}                           ║
║                                              ║
║  Merge Count: {N}                            ║
║  Current MC:  {T-xxx title / 无}             ║
║  Status:      {Active / Blocked}             ║
║                                              ║
║  Version: {current version} ({status})       ║
║  V Progress: {done}/{total} MCs              ║
╚══════════════════════════════════════════════╝
```

4. 提供快捷操作：

AskUserQuestion:
- "领取任务" → 提示用 `/get-mission`
- "继续当前任务" → 提示用 `/drive T-{xxx}`（如果有 WIP）
- "提交完成" → 提示用 `/complete-mission`（如果有待提交的工作）
- "我就看看"

#### 新成员

如果 `$ARGUMENTS` 包含名字和 GitHub 用户名（如 `/set-role alice alice-gh`），
直接使用。否则用 AskUserQuestion 收集：

1. **名字**（英文，小写，用作 id）
2. **GitHub 用户名**

然后执行 onboard：

1. 编辑 `.teamspace/config.yml` → 添加到 `members` 列表：
   ```yaml
   - id: {id}
     name: "{Name}"
     role: contributor
     github: {github-username}
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
   ```

3. 编辑 `.teamspace/board.md` → 在 Merge Count 表中添加：
   ```
   | {name} | 0 | — |
   ```

4. 输出：
   ```
   ✅ Welcome to the team, {Name}! (@{github})

      Member file: .teamspace/members/{id}.md
      Merge count: initialized at 0

      Next steps:
      1. git config user.name "{name}"
      2. /get-mission  ← 领取你的第一个 Mission Contract
   ```

---

## 行为规则

1. **幂等**：如果成员已存在，不重复创建，直接展示角色卡片
2. **原子编辑**：编辑 config.yml 和 board.md 时，先读后改，最小改动
3. **不修改他人数据**：只添加新行，不碰已有成员的行
