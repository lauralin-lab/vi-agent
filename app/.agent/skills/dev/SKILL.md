---
name: dev
description: 创建个人 Dev 环境
---
# /dev — 创建个人 Dev 环境

你是一个 Dev 环境部署助手。你的任务是在共享的 GCP 服务器上为团队成员创建隔离的 vi-agent 实例。

**任何团队成员都可以运行 `/dev` 来部署自己的实例。**

## 配置

- **服务器 IP**: `34.172.9.61`
- **服务器用户**: 从 `dev.sh --show-config` 输出的 `SERVER` 字段获取（每人用自己的 Linux 账户 SSH）
- **GCP Project**: `excellent-nexus-488404-c8`
- **GCP Zone**: `us-central1-c`
- **Instance Name**: `vi-agent`
- **服务器工作目录**: `/opt/vi-agent`（registry、templates、instances）
- **代码目录**: 每人一份，位于 `~/vi-agent-repos/<DEV_NAME>/`
- **Docker Hub**: `collov` (org name)
- **镜像名称**: `collov/vi-agent-{api-server,frontend,gateway,realtime}`

## 前提条件

### 首次使用（一次性设置）

1. **本地有能连服务器的 SSH key** — 管理员已把你的公钥加到 GCP metadata
2. **本地有 GitHub SSH key** — 用于通过 Agent Forwarding 在服务器上拉代码
3. **本地 `.env`** — 项目根目录的 `.env` 文件包含 API keys

如果你是新成员，请参考 `docs/dev-onboarding.md` 获取服务器账户设置指引。

### SSH 连接方式

每个用户用自己的 SSH key 连接服务器。**skill 执行时需要先确定用户的 SSH key。**

```bash
# 自动检测: 按优先级查找本地 SSH key
for key in ~/.ssh/gcp_ssh_key ~/.ssh/id_ed25519 ~/.ssh/id_rsa ~/.ssh/id_ecdsa; do
  if [ -f "$key" ]; then echo "Found: $key"; break; fi
done
```

如果检测到多个 key，用 AskUserQuestion 让用户选择。

**获取 SSH 连接信息:**
```bash
# dev.sh --show-config 会输出 SERVER=<user>@<ip>
bash deploy/dev-environment/dev.sh --show-config
```

**验证连接:**
```bash
ssh -A -i <USER_SSH_KEY> -o ConnectTimeout=5 $SERVER "echo ok"
```
如果失败，提示：你的 SSH key 可能还没加到服务器，请参考 `docs/dev-onboarding.md`。

**所有后续 SSH 命令统一使用:**
```bash
SERVER=$(bash deploy/dev-environment/dev.sh --show-config 2>/dev/null | grep '^SERVER=' | cut -d= -f2)
SSH_CMD="ssh -A -i <USER_SSH_KEY> $SERVER"
SCP_CMD="scp -i <USER_SSH_KEY>"
```
- `-A`: Agent Forwarding，让服务器用本地的 GitHub SSH key 拉代码
- 每人用自己的 Linux 账户 SSH（`SERVER_USER` 在 `.dev.local` 中配置）

---

## 执行流程

### Step 0: Pre-flight Check（代码状态检查）

**每次部署前必须执行。**

```bash
# 1. 检查工作区是否干净
git status --porcelain

# 2. 检查当前分支是否已推送到远程
git log --oneline @{upstream}..HEAD 2>/dev/null

# 3. 列出最近的 git tags
git tag --sort=-creatordate | head -5

# 4. 检查远程是否有这些 tags
git ls-remote --tags origin | tail -5
```

**根据检查结果:**

- ❌ 有未提交的更改 → 提醒用户:
  ```
  ⚠️ 检测到未提交的更改。部署前请先提交并推送:
     git add -A && git commit -m "type(scope): description"
     git push
  ```

- ❌ 有未推送的 commit → 提醒用户:
  ```
  ⚠️ 有本地 commit 未推送到远程。请先:
     git push
  ```

- ❌ 没有合适的 tag → 提醒用户打 tag:
  ```
  ⚠️ 没有找到 dev tag。镜像需要通过 tag 来版本管理。请执行:
     git tag dev-$(date +%Y%m%d)-$(git rev-parse --short HEAD)
     git push --tags

  Tag 格式: dev-YYYYMMDD-COMMIT (如 dev-20260302-abc1234)
  ```

- ✅ 工作区干净 + 已推送 + 有 tag → 继续下一步

**注意**: 如果用户选择部署现有 Hub 镜像（不需要新构建），可以跳过 tag 检查。

### Step 0.5: 检测 SSH Key 并验证连接

```bash
# 按优先级检测本地 SSH key
FOUND_KEYS=()
for key in ~/.ssh/gcp_ssh_key ~/.ssh/id_ed25519 ~/.ssh/id_rsa ~/.ssh/id_ecdsa; do
  [ -f "$key" ] && FOUND_KEYS+=("$key")
done
```

- 如果找到 1 个 → 直接用它
- 如果找到多个 → AskUserQuestion 让用户选
- 如果没找到 → 提示用户生成 SSH key 并联系管理员

验证连接：
```bash
ssh -A -i <CHOSEN_KEY> -o ConnectTimeout=5 $SERVER "echo ok" 2>&1
```
- 成功 → 设置 `SSH_CMD="ssh -A -i <CHOSEN_KEY> $SERVER"` 后续使用
- 失败 → 提示参考 `docs/dev-onboarding.md`

### Step 0.6: 同步模板到服务器

**每次执行 /dev 都自动同步**，确保服务器上的脚本和模板是最新版本:

```bash
$SCP_CMD deploy/dev-environment/*.sh deploy/dev-environment/*.tpl \
  $SERVER:/opt/vi-agent/templates/
$SSH_CMD "chmod +x /opt/vi-agent/templates/*.sh"
```

### Step 1: 收集信息

使用 AskUserQuestion 收集（一次性问完，减少来回）:

1. **名字** — 用作命名空间（仅小写字母，如 casey, alice, bob）
   - 这个名字将用于: Docker 项目名、数据库名、端口分配、代码仓库目录

2. **版本** — 部署哪个版本
   - 先检查 Docker Hub 上有哪些可用 tags:
     ```bash
     curl -s "https://hub.docker.com/v2/repositories/collov/vi-agent-api-server/tags/?page_size=10&ordering=last_updated" | python3 -c "
     import json,sys
     data=json.load(sys.stdin)
     for t in data.get('results',[]): print(f\"  {t['name']:30s} {t['last_updated'][:19]}\")
     " 2>/dev/null || echo "  (Docker Hub 暂无镜像，需要先构建)"
     ```
   - 同时列出本地 git tags:
     ```bash
     git tag --sort=-creatordate | head -10
     ```
   - 选项:
     - **从 Docker Hub 拉取已有镜像** (推荐，秒级) — 选择一个已有的 Hub tag
     - **从 git tag 构建新镜像** — 在服务器上构建并推送到 Hub
     - **从当前 HEAD 构建** — 不需要 tag，直接构建 latest

3. **构建模式** — 镜像从哪来（根据上面的选择自动决定）
   - **Mode A: Docker Hub Pull（推荐）** — 前提是 Hub 上有对应 tag 的镜像
   - **Mode B: 服务器构建 + Push** — 服务器 checkout tag → build → push to Hub → deploy

### Step 2: 读取本地 .env 中的 API Keys

从用户项目根目录的 `.env` 文件中提取 API keys:

```bash
ENV_FILE="<项目根目录>/.env"

USER_KEYS=(
    LIVEKIT_URL
    LIVEKIT_API_KEY
    LIVEKIT_API_SECRET
    GOOGLE_API_KEY
    ANTHROPIC_API_KEY
    GCS_BUCKET
)
```

使用 Read 工具读取项目根目录 `.env`，提取上述 key 的值。

**验证**: 检查这些值不是 placeholder（不以 `your-`, `change-`, `xxx` 开头）。如果缺失或是 placeholder，提示用户先配置本地 `.env`。

### Step 3: 查询 registry，分配端口

```bash
$SSH_CMD "cat /opt/vi-agent/registry.json 2>/dev/null || echo '{\"instances\":{},\"next_slot\":1}'"
```

**端口方案:** Slot N →

| 服务 | 端口 |
|------|------|
| Frontend (HTTP) | 3000 + N×100 |
| Frontend (HTTPS) | 3000 + N×100 + 10 |
| API | 3000 + N×100 + 1 |
| Gateway | 3000 + N×100 + 2 |
| Realtime | 3000 + N×100 + 3 |
| PostgreSQL | 5432 + N |
| Redis | 6379 + N |

如果用户已有实例，询问: 更新现有实例还是重新创建？
更新已有实例会**复用原来的 slot 和端口**，不会分配新的。

### Step 4: 生成实例 .env

组合 API keys (来自本地 .env) + 自动生成的基础设施密钥:

```bash
POSTGRES_PASSWORD=vi_dev_<DEV_NAME>
REDIS_PASSWORD=redis_dev_<DEV_NAME>
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_API_TOKEN=$(openssl rand -hex 16)
SERVER_IP=34.172.9.61
```

SCP 这个 .env 到服务器: `/opt/vi-agent/instances/<DEV_NAME>/.env`

**更新已有实例时**: 如果 .env 已存在，保留原文件（保护已有的密钥），只确保 `SERVER_IP` 存在。

### Step 5: 构建镜像（Mode B 才执行）

```bash
# 1. 确保服务器上有代码仓库（每人一份，按 DEV_NAME 隔离）
$SSH_CMD "test -d ~/vi-agent-repos/<DEV_NAME>/.git || git clone git@github.com:flair-home-stylist/vi_agent.git ~/vi-agent-repos/<DEV_NAME>"

# 2. 构建并推送镜像
$SSH_CMD "REPO_DIR=~/vi-agent-repos/<DEV_NAME> bash /opt/vi-agent/templates/build-and-push.sh <TAG>"
```

**关键点:**
- `~/vi-agent-repos/<DEV_NAME>/` — 每人独立代码目录，避免 checkout 冲突
- `-A` SSH Agent Forwarding — 服务器通过用户本地的 GitHub SSH key 拉取代码
- 构建在服务器上执行（不是本地），避免 ARM→AMD64 交叉编译问题

### Step 6: 部署实例

```bash
# Mode A 或 Mode B（构建完后）都用 image 模式部署
$SSH_CMD "bash /opt/vi-agent/templates/create-instance.sh <DEV_NAME> <BRANCH> <COMMIT> image <TAG>"
```

`create-instance.sh` 自动完成:
- 分配端口 slot（已有实例复用原 slot）
- 生成 SSL 自签名证书（如果不存在）
- 从模板生成 docker-compose.yml
- 生成 .env（仅首次，已有则保留）
- 停止旧容器（如果是更新）
- 拉取镜像 / 启动服务
- 等待 health check
- **运行部署测试套件** (test-instance.sh)
- 更新 registry.json

### Step 7: 验证并输出结果

检查输出中的测试结果:

```
=== Layer 1: Smoke Test ===
  ✅ Frontend HTTP 200
  ✅ Frontend returns HTML
  ✅ API /health
  ✅ API /docs reachable
  ✅ Gateway /health
  ✅ API /api/config returns JSON

=== Layer 2: Functional Test ===
  ✅ API signup (status=200)
  ✅ API login returns JWT
  ✅ API /auth/me with JWT

=== Layer 3: Connectivity Test ===
  ✅ Frontend→API proxy (/health via nginx)
  ✅ Frontend→API proxy (/api/config via nginx)
  ✅ CORS headers present

===============================
  Results: 12/12 passed, 0 failed
===============================
```

输出部署摘要:

```
✅ <DEV_NAME> 的 vi-agent 实例已部署完成！

📍 访问地址:
   Frontend:  https://34.172.9.61:<FRONTEND_HTTPS_PORT>  (HTTPS — camera works)
   Frontend:  http://34.172.9.61:<FRONTEND_PORT>  (HTTP fallback)
   API:       http://34.172.9.61:<API_PORT>
   API Docs:  http://34.172.9.61:<API_PORT>/docs
   Gateway:   http://34.172.9.61:<GATEWAY_PORT>

🔑 SSH 访问:
   ssh -i <YOUR_SSH_KEY> $SERVER

📦 版本信息:
   Image Tag: <TAG>
   Build:     <server-build|hub-pull>
   Deployed:  <TIMESTAMP>

🧪 测试: 12/12 passed

🛠 常用命令 (SSH 到服务器后):
   cd /opt/vi-agent/instances/<DEV_NAME>
   docker compose logs -f           # 查看日志
   docker compose restart           # 重启
   docker compose down              # 停止
```

## 错误处理

- SSH 连接失败: SSH key 可能还没加到服务器，参考 `docs/dev-onboarding.md`
- GitHub 拉取失败 (Permission denied): 确保本地有 GitHub SSH key 且 SSH 命令用了 `-A`
- gcloud 命令失败: 提示用户运行 `gcloud auth login`（仅管理员操作需要）
- 端口冲突: 从 registry 重新分配 slot
- Docker Hub push 失败: 需要 Read+Write 权限的 token（服务器上已登录）
- 本地 .env 缺少 API keys: 提示用户先配置本地 `.env`
- 测试失败: 检查 `docker compose logs` 排查

## 关键注意事项（从部署实践中总结）

1. **自助部署**: 任何团队成员都可以运行 `/dev`。管理员唯一的工作是首次添加成员的 SSH key 到 GCP。

2. **每人一份代码仓库**: 服务器上代码在 `~/vi-agent-repos/<DEV_NAME>/`，避免 checkout 冲突。

3. **SSH Agent Forwarding**: 服务器没有 GitHub SSH key。所有 SSH 命令必须用 `-A`，让服务器通过用户本地的 GitHub key 拉取代码。

4. **每个实例自带 PostgreSQL 和 Redis**: 不共享数据库。每个实例在 docker-compose 中定义自己的 postgres 和 redis 容器，通过 Docker 网络（`postgres:5432`、`redis:6379`）互联。

5. **REDIS_PREFIX 必须加引号**: YAML 中尾部冒号会被误解析。必须写成 `"REDIS_PREFIX=name:"`。

6. **Frontend 需要 SSL 证书**: `create-instance.sh` 自动生成自签名证书。

7. **Frontend 使用相对 API URL**: `VITE_API_URL=""` 使前端通过 nginx proxy 访问 `/api/*`，镜像通用。

8. **镜像在服务器上构建**: 不在本地 Mac 构建（ARM→AMD64 问题）。

9. **Tag 命名**: `dev-YYYYMMDD-COMMIT`，如 `dev-20260302-abc1234`。

10. **模板自动同步**: 每次运行 `/dev` 时自动上传本地 `deploy/dev-environment/` 到服务器 `/opt/vi-agent/templates/`，确保脚本最新。

11. **API Auth 端点**: signup=`/api/auth/signup`，login=`/api/auth/login`，me=`/api/auth/me`。JWT 字段名为 `token`。
