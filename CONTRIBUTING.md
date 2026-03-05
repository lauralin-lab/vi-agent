# Contributing to VI Agent

## 分支策略

- `main` 是稳定分支，所有变更通过 PR 合入
- 功能开发在独立分支上进行，命名规范见下文

### 分支命名

```
feature/F001-semantic-search      # 新功能
bugfix/B001-vad-signal            # Bug 修复
refactor/R001-split-agent-common  # 重构
infra/I003-github-actions-ci      # 基础设施
enhance/E001-alembic-migration    # 增强
```

格式：`{类型}/{任务ID}-{简短描述}`

---

## Teamwork — 团队协作系统

项目使用 **Push-based Mission Contract** 系统进行团队协作。Leader 创建并分配任务，Member 执行并报告。

### 核心文件

| 文件 | 用途 |
|------|------|
| `.teamwork/config.yml` | 团队配置：成员、角色、通知、质量门 |
| **GitHub Issues** | Mission Contract 源头 — label: `mission` |

### 工作流

**Leader（创建 & 审查）：**
```bash
/team                  # 团队面板 — 查看成员状态、审查队列
/create-mc             # 创建 MC 并分配给成员
/create-milestone      # 创建里程碑，可批量创建 MC
/review-mc             # 审查已提交的 MC（approve / request changes）
```

**Member（执行 & 提交）：**
```bash
/team                  # 个人面板 — 查看分配给我的 MC
/get-mc                # 查看 MC 详情 + checkout 分支
/complete-mc           # 提交完成 — push + PR + 通知 Leader
```

### 生命周期

```
Leader: /create-mc @member → Issue 创建，成员收到通知
Member: /get-mc → 查看详情，checkout 分支
        (code, test, commit)
Member: /complete-mc → PR 创建，Leader 收到通知
Leader: /review-mc → approve + merge，或 request changes
```

---

## Worktree 工作流

推荐使用 git worktree 并行开发，避免频繁 stash/切换分支。

### 完整流程

```bash
# 1. 创建 worktree + 新分支
cd vi-agent-team-version
git worktree add ../vi-wt-my-feature -b feature/F001-semantic-search

# 2. 进入 worktree 开发
cd ../vi-wt-my-feature

# 3. 安装依赖（如需修改对应子项目）
# Python:
cd api-server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
# Node:
cd frontend && npm install

# 4. 正常开发 & 提交
git add <files>
git commit -m "feat(api-server): add vector search to memory service"

# 5. 推送到远程
git push -u origin feature/F001-semantic-search

# 6. 创建 PR（target: main）
gh pr create --title "feat: semantic search for memory" --body "Closes #F001"

# 7. PR 合并后清理
cd vi-agent-team-version
git worktree remove ../vi-wt-my-feature
git branch -d feature/F001-semantic-search
```

### 查看当前 worktree

```bash
git worktree list
# 输出示例:
# /path/to/vi-agent-team-version        abc1234 [main]
# /path/to/vi-wt-my-feature             def5678 [feature/F001-semantic-search]
```

---

## PR 流程

1. **Target**: 始终以 `main` 为目标分支
2. **Review**: 至少 1 人 review 后合并
3. **CI**: PR 必须通过所有 CI 检查（待 I003 完成后生效）
4. **描述**: 说明改了什么、为什么改、如何测试
### PR 描述模板

```markdown
## Summary
- 做了什么改动
- 为什么做这个改动

## Test Plan
- [ ] 运行了哪些测试
- [ ] 手动验证了什么场景
```

---

## 代码风格

### Python（api-server, realtime）

- Formatter: Ruff (或 Black, line-length 88)
- Import 排序: isort 兼容
- 类型注解: 推荐但不强制（新代码应添加）
- Docstring: 仅复杂逻辑需要，不要求全量

```bash
# 检查
ruff check .
# 格式化
ruff format .
```

### TypeScript（gateway）

- TypeScript strict mode
- ESLint + Prettier（待 I008 配置后生效）

```bash
cd gateway/plugin
npm run lint
npm run lint:fix
```

### JavaScript/React（frontend）

- ESLint (flat config, `eslint.config.js`)
- React Hooks rules 严格模式
- 不使用 class components

```bash
cd frontend
npx eslint src/
```

### 通用规则

- 不提交 `console.log` / `print` 调试语句（结构化日志除外）
- 不提交 `// eslint-disable` 等抑制注释（应修复根因）
- 不硬编码密钥、URL、路径到代码中（用环境变量）
- Commit message 格式：`type(scope): description`
  - type: feat, fix, refactor, test, docs, chore, ci
  - scope: api-server, frontend, realtime, gateway, global

---

## 测试要求

### 现有测试

| 子项目 | 框架 | 运行方式 |
|--------|------|----------|
| api-server | pytest + pytest-asyncio | `cd api-server && .venv/bin/python -m pytest tests/ -v` |
| realtime | pytest + pytest-asyncio | `cd realtime && uv run python -m pytest tests/ -v` |
| frontend | （待搭建 I001） | — |
| gateway | （待搭建 I002） | — |

### 测试原则

- **新功能**必须附带测试（至少 happy path）
- **Bug 修复**应附带回归测试
- **重构**前确保已有测试覆盖，重构后测试必须全通过
- api-server 测试使用内存 SQLite，无需外部依赖

### 运行全部测试

```bash
# API Server
cd api-server && .venv/bin/python -m pytest tests/ -v

# Realtime
cd realtime && uv run python -m pytest tests/ -v

# 全栈冒烟测试（待 B005 完成后可用）
# ./smoke-test.sh
```

---

## 团队协作模式 — Mission Contract Push System

本项目使用三个核心概念驱动团队协作：

### 三个概念

| 概念 | 定义 | 载体 |
|------|------|------|
| **Mission Contract** | 原子任务，独立可合入 | GitHub Issue (label: `mission`) |
| **Role** | 人 + Claude Code 的组合 | `claude --agent feature-lead` |
| **Product** | main 分支上的产品 | 衡量指标 = 合入 main 的数目 |

### Role 的工作循环

```
receive(Leader 分配 MC) → execute(端到端实现) → resolve(解决冲突) → submit(PR + 通知) → receive(下一个)
```

```bash
# 激活 Role — agent 自动读取分配的 MC 并执行
claude --agent feature-lead

# 或手动创建隔离环境:
./scripts/setup-worktree.sh food-calorie
cd ../vi-wt-food-calorie && ./dev.sh
```

### 端口隔离（并行开发）

`scripts/setup-worktree.sh` 自动为每个 worktree 分配独立端口（偏移量 +100）。
支持多个 Role 在同一台机器上并行开发，互不干扰。

---

## Skill 工具链

本项目内置 Claude Code 技能和 Agent 系统，clone 后自动可用：

### Agent（角色模式，通过 `--agent` 激活）

| Agent | 用途 |
|-------|------|
| `feature-lead` | 版本迭代 Feature Lead — 自动读取 board，呈现 Mission Contract，端到端推动 |
| `code-reviewer` | 自动 PR 代码审查 — 安全性、架构合规性、质量检查 |

```bash
# 激活角色 agent
claude --agent feature-lead
```

### 技能（Slash Commands，在对话中调用）

**团队生命周期（每个成员的工作循环）：**

| 命令 | 用途 |
|------|------|
| `/team` | 团队面板 — 首次自动 onboard，后续显示 dashboard |
| `/create-mc` | 创建 MC 并分配给成员（Leader） |
| `/get-mc` | 查看分配给我的 MC（Member） |
| `/complete-mc` | 提交完成的 MC — PR + 通知 Leader |
| `/review-mc` | 审查已提交的 MC（Leader） |
| `/create-milestone` | 创建里程碑 + 批量 MC（Leader） |

**开发工具：**

| 命令 | 用途 |
|------|------|
| `/drive` | 高驱自主执行 — 分层蜂群模式 |
| `/self-drive` | 持续自主改进循环 |
| `/architect` | 系统架构设计 |
| `/improve-user` | 认知教练 |

**基础设施：**

| 命令 | 用途 |
|------|------|
| `/dev` | 创建个人 Dev 环境（GCP 服务器） |
| `/dev-info` | 查看 Dev 环境状态 |
| `/dev-log` | 查看 Dev 环境日志 |

### 首次设置

```bash
# 安装 hooks、sounds、messaging（仅需一次）
.claude/install.sh
```

这会将通知 hook 和声音文件符号链接到 `~/.claude/`，不会修改项目代码。

---

## 环境配置

详见 `SETUP.md`。关键要点：

- 复制 `.env.example` 为 `.env` 并填入你的 API keys
- 前端开发：`cd frontend && npm install && npx vite --host`
- 后端开发：`cd api-server && .venv/bin/uvicorn app.main:app --reload`
- Docker 全栈：`docker compose up --build`
