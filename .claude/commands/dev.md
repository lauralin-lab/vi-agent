# /dev — 创建个人 Dev 环境

你是一个 Dev 环境部署助手。你的任务是在共享的 GCP 服务器上为团队成员创建隔离的 vi-agent 实例。

## 配置

- **服务器 IP**: `34.56.23.173`
- **管理员 SSH Key**: `~/.ssh/gcp_ssh_key`
- **管理员用户**: `liyasong`
- **GCP Project**: `excellent-nexus-488404-c8`
- **GCP Zone**: `us-central1-c`
- **Instance Name**: `vi-agent`
- **服务器工作目录**: `/opt/vi-agent`
- **Docker Hub**: `collov` (org name)
- **镜像名称**: `collov/vi-agent-{api-server,frontend,gateway,realtime}`

## 谁来运行 /dev？

**只有管理员 (liyasong) 运行 `/dev`**。团队成员不需要安装任何工具，只需提供两样东西：

### 团队成员需要准备的

1. **名字** — 用作命名空间的英文名（小写，如 casey, alice, bob）
2. **SSH Public Key** — 用于登录服务器

如果没有 SSH key，先生成一个：
```bash
ssh-keygen -t ed25519 -C "yourname@collov.com"
# 然后把公钥发给管理员:
cat ~/.ssh/id_ed25519.pub
```

3. **本地 `.env`** — 复制管理员发的 `.env` 文件到项目根目录 `vi_agent/.env`（包含共享的 API keys）

### 流程

```
团队成员                             管理员 (liyasong)
────────                             ────────────────
1. 生成 SSH key (如果没有)
2. 发送公钥 + 名字给 liyasong ──→    3. 运行 /dev
                                        - 输入成员名字
                                        - 粘贴成员的 SSH public key
                                        - 选择版本 (git tag)
                                        - 自动: 服务器构建 → push Hub → 部署 → 测试
4. 收到访问信息             ←──      5. 发送给成员:
   - ssh casey@34.56.23.173             - 服务器 IP + 端口
   - http://34.56.23.173:3200           - .env 文件 (如果还没发)
```

---

## 执行流程

### Step 0: Pre-flight Check（代码状态检查）

**每次部署前必须执行。** 这一步确保要部署的代码已经正确提交和推送。

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

### Step 1: 收集信息

使用 AskUserQuestion 收集（一次性问完，减少来回）:

1. **名字** — 用作命名空间（仅小写字母，如 casey, alice, bob）
   - 这个名字将用于: Docker 项目名、数据库名、端口分配、SSH 用户标识

2. **版本** — 部署哪个版本
   - 先检查 Docker Hub 上有哪些可用 tags:
     ```bash
     # 查询 Docker Hub 可用 tags (取 api-server 为代表)
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

4. **SSH Public Key** (仅首次) — 如果该用户名在 registry 中不存在
   - 选项: 自动检测本地 ~/.ssh/*.pub, 使用已有的 gcp_ssh_key, 手动粘贴
   - 如果用户已在 registry 中有记录，跳过此步

### Step 2: 读取本地 .env 中的 API Keys

从用户项目根目录的 `.env` 文件中提取 API keys:

```bash
# 读取本地 .env，提取需要的 API keys
ENV_FILE="<项目根目录>/.env"  # 通常就是当前 vi_agent 项目根目录

# 需要提取的 key（用户自己的 API 凭据）
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

### Step 3: 添加 SSH Key 到服务器（仅首次）

如果是新用户，通过管理员 SSH 添加 key:

```bash
# 1. 即时生效: 追加到 authorized_keys
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.56.23.173 \
  "echo '<USER_SSH_PUBLIC_KEY>' >> ~/.ssh/authorized_keys"

# 2. 持久化: 添加到 GCP metadata (防止 guest agent 覆盖)
gcloud compute instances describe vi-agent \
  --zone=us-central1-c \
  --format="value(metadata.items.filter(key:ssh-keys).extract(value).flatten())" \
  > /tmp/existing-ssh-keys.txt

echo "<DEV_NAME>:<USER_SSH_PUBLIC_KEY>" >> /tmp/existing-ssh-keys.txt

gcloud compute instances add-metadata vi-agent \
  --zone=us-central1-c \
  --metadata-from-file ssh-keys=/tmp/existing-ssh-keys.txt
```

### Step 4: 查询 registry，分配端口

```bash
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.56.23.173 \
  "cat /opt/vi-agent/registry.json 2>/dev/null || echo '{\"instances\":{},\"next_slot\":1}'"
```

端口方案: Slot N → frontend=3N00, api=3N01, gateway=3N02, realtime=3N03

如果用户已有实例，询问: 更新现有实例还是重新创建？

### Step 5: 生成实例 .env

组合 API keys (来自本地 .env) + 自动生成的基础设施密钥:

```bash
# 自动生成部分
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_API_TOKEN=$(openssl rand -hex 16)
POSTGRES_PASSWORD=vi_dev_<DEV_NAME>
REDIS_PASSWORD=redis_dev_<DEV_NAME>

# 计算的部分
DATABASE_URL=postgresql+asyncpg://vi:${POSTGRES_PASSWORD}@postgres:5432/vi_<DEV_NAME>
API_BASE_URL=http://<SERVER_IP>:<API_PORT>
CORS_ORIGINS=http://<SERVER_IP>:<FRONTEND_PORT>,http://localhost:<FRONTEND_PORT>
```

SCP 这个 .env 到服务器: `/opt/vi-agent/instances/<DEV_NAME>/.env`

### Step 6: 构建镜像（Mode B 才执行）

如果选择了 Mode B（服务器构建），先在服务器上构建并推送镜像:

```bash
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.56.23.173 \
  "bash /opt/vi-agent/templates/build-and-push.sh <TAG>"
```

这个脚本会:
1. `git fetch --tags` 并 checkout 到指定 tag
2. 构建 4 个服务镜像 (api-server, frontend, gateway, realtime)
3. Tag 为 `collov/vi-agent-{service}:{tag}` 和 `collov/vi-agent-{service}:latest`
4. Push 到 Docker Hub

**重要**: 构建在服务器上执行（不是本地），避免 ARM→AMD64 交叉编译问题。
Frontend 镜像使用 `VITE_API_URL=""` (空值/相对路径)，使镜像在任何实例上通用。

构建完成后，后续 Mode A 部署可以直接 pull 这个 tag。

### Step 7: 部署实例

使用 `create-instance.sh` 创建实例:

```bash
# Mode A: 从 Docker Hub 拉取
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.56.23.173 \
  "bash /opt/vi-agent/templates/create-instance.sh <DEV_NAME> <BRANCH> <COMMIT> image <TAG>"

# Mode B: 在服务器上构建 (如果 Step 6 没有单独执行)
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.56.23.173 \
  "bash /opt/vi-agent/templates/create-instance.sh <DEV_NAME> <BRANCH> <COMMIT> build"
```

`create-instance.sh` 自动完成:
- 分配端口 slot
- 创建数据库
- 生成 docker-compose.yml (image 或 build 模式)
- 启动服务
- 等待 health check
- **运行部署测试套件** (test-instance.sh)
- 更新 registry.json

### Step 8: 验证并输出结果

`create-instance.sh` 执行完毕后，检查输出中的测试结果:

```
=== Layer 1: Smoke Test ===
  ✅ Frontend HTTP 200
  ✅ Frontend returns HTML
  ✅ API /health
  ✅ API /docs reachable
  ✅ Gateway /health
  ✅ API /api/config returns JSON

=== Layer 2: Functional Test ===
  ✅ API register
  ✅ API login returns JWT
  ✅ API /users/me with JWT

=== Layer 3: Connectivity Test ===
  ✅ Frontend→API proxy (/health via nginx)
  ✅ Frontend→API proxy (/api/config via nginx)
  ✅ CORS headers present

===============================
  Results: 12/12 passed, 0 failed
===============================
  ✅ All tests passed
```

同步更新本地 `.teamspace/environments/dev/registry.yml`

输出部署摘要:

```
✅ <DEV_NAME> 的 vi-agent 实例已部署完成！

📍 访问地址:
   Frontend:  http://34.56.23.173:<FRONTEND_PORT>
   API:       http://34.56.23.173:<API_PORT>
   API Docs:  http://34.56.23.173:<API_PORT>/docs
   Gateway:   http://34.56.23.173:<GATEWAY_PORT>

🔑 SSH 访问:
   ssh <DEV_NAME>@34.56.23.173

📦 版本信息:
   Image Tag: <TAG>
   Branch:    <BRANCH>
   Commit:    <COMMIT>
   Build:     <server-build|hub-pull>
   Deployed:  <TIMESTAMP>
   By:        <DEV_NAME>

🧪 测试结果:
   Smoke:        ✅ 6/6
   Functional:   ✅ 3/3
   Connectivity: ✅ 3/3

🔧 ENV 来源:
   API Keys:  从本地 .env 读取
   基础设施:   自动生成

🛠 常用命令 (SSH 到服务器后):
   cd /opt/vi-agent/instances/<DEV_NAME>
   docker compose logs -f           # 查看日志
   docker compose restart           # 重启
   docker compose down              # 停止
```

## 错误处理

- SSH 连接失败: 检查 `~/.ssh/gcp_ssh_key` 是否存在
- gcloud 命令失败: 提示用户运行 `gcloud auth login`
- 端口冲突: 从 registry 重新分配 slot
- 资源不足: 当前机器最多 3-4 个实例，建议升级到 e2-standard-8
- Docker Hub push 失败 (insufficient scopes): 需要 Read+Write 权限的 token
- 本地 .env 缺少 API keys: 提示用户先配置本地 `.env`，参考 `.env.example`
- 镜像构建失败: 检查 `build-and-push.sh` 输出，确认 Dockerfile 语法正确
- 测试失败: 检查具体哪层失败，查看 `docker compose logs` 排查

## 关键注意事项（从部署实践中总结）

1. **DATABASE_URL 必须显式设置**: api-server 读取 `DATABASE_URL` 环境变量，不会自动拼接。格式:
   ```
   DATABASE_URL=postgresql+asyncpg://vi:${POSTGRES_PASSWORD}@postgres:5432/vi_${DEV_NAME}
   ```

2. **Frontend 使用相对 API URL**: `VITE_API_URL=""` 使前端通过 nginx proxy 访问 `/api/*`，不再写死绝对 URL。这样同一个 frontend 镜像可以跑在任何实例上。LiveKit URL 通过 `/api/config` 端点在运行时获取。

3. **镜像必须在服务器上构建**: 不要在本地 Mac 构建 (ARM→AMD64 问题)。流程:
   ```
   本地: commit → push → tag → push tags
   服务器: git fetch → checkout tag → docker build → docker push to Hub
   ```

4. **Tag 命名规范**: `dev-YYYYMMDD-COMMIT`，如 `dev-20260302-abc1234`。用于 git tag 和 Docker image tag，一一对应。

5. **Healthcheck**: postgres 的 healthcheck 需指定 `-d vi_${DEV_NAME}`

6. **服务器已登录 Docker Hub**: 服务器上已执行 `docker login`，可以直接 push。如果 push 失败，检查 token 权限。
