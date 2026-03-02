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
                                        - 选择版本
                                        - 自动部署隔离实例
4. 收到访问信息             ←──      5. 发送给成员:
   - ssh casey@34.56.23.173             - 服务器 IP + 端口
   - http://34.56.23.173:3200           - .env 文件 (如果还没发)
```

---

## 执行流程

### Step 1: 收集信息

使用 AskUserQuestion 收集（一次性问完，减少来回）:

1. **名字** — 用作命名空间（仅小写字母，如 casey, alice, bob）
   - 这个名字将用于: Docker 项目名、数据库名、端口分配、SSH 用户标识

2. **版本** — 部署哪个版本的镜像
   - 先检查 Docker Hub 上有哪些可用 tags:
     ```bash
     # 查询 Docker Hub 可用 tags (取 api-server 为代表)
     curl -s "https://hub.docker.com/v2/repositories/collov/vi-agent-api-server/tags/?page_size=10&ordering=last_updated" | python3 -c "
     import json,sys
     data=json.load(sys.stdin)
     for t in data.get('results',[]): print(f\"  {t['name']:30s} {t['last_updated'][:19]}\")
     " 2>/dev/null || echo "  (Docker Hub 暂无镜像，将在服务器上构建)"
     ```
   - 选项:
     - latest (推荐) — Docker Hub 最新版本
     - 列出 Docker Hub 上可用的 tags (main-xxx, v1.0.0 等)
     - 指定 git 分支 → 服务器上构建

3. **构建模式** — 镜像从哪来
   - **从 Docker Hub 拉取 (推荐)** — 最快，秒级部署。前提是镜像已推送到 Hub
   - **在目标机器上构建** — 从源码构建，构建后自动 push 到 Docker Hub。适合新版本首次部署或快速迭代
   - **本地构建 + push** — 在开发者 Mac 上构建（注意 ARM→AMD64 交叉编译），push 后服务器 pull

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

端口方案: Slot N → frontend=3N00, api=3N01, gateway=3N02, realtime=3N03, postgres=5432+N, redis=6379+N

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

### Step 6: 部署（根据构建模式分支）

#### 模式 A: 从 Docker Hub 拉取（推荐，最快）

生成 docker-compose.yml 使用 `image:` 而非 `build:`:

```yaml
services:
  api-server:
    image: collov/vi-agent-api-server:<TAG>
    # ... (不需要 build context)
```

```bash
ssh ... "cd /opt/vi-agent/instances/<DEV_NAME> && docker compose pull && docker compose up -d"
```

#### 模式 B: 在目标机器上构建

```bash
ssh ... << 'REMOTE_BUILD'
cd /opt/vi-agent
git fetch --all && git checkout <BRANCH> && git pull

cd /opt/vi-agent/instances/<DEV_NAME>
# docker-compose.yml 使用 build: context
docker compose build
docker compose up -d

# 构建完自动 push 到 Docker Hub（后台执行，不阻塞）
COMMIT=$(cd /opt/vi-agent && git rev-parse --short HEAD)
TAG="<BRANCH>-${COMMIT}"
for svc in api-server frontend gateway realtime; do
    docker tag "vi-agent-<DEV_NAME>-${svc}:latest" "collov/vi-agent-${svc}:${TAG}"
    docker tag "vi-agent-<DEV_NAME>-${svc}:latest" "collov/vi-agent-${svc}:latest"
    docker push "collov/vi-agent-${svc}:${TAG}" &
    docker push "collov/vi-agent-${svc}:latest" &
done
wait
echo "Images pushed to Docker Hub with tag: ${TAG}"
REMOTE_BUILD
```

#### 模式 C: 本地构建 + push

```bash
# 本地构建（注意交叉编译！）
cd <项目根目录>
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current)
TAG="${BRANCH}-${COMMIT}"

for svc_dir in api-server frontend gateway realtime; do
    docker buildx build \
        --platform linux/amd64 \
        -t "collov/vi-agent-${svc_dir}:${TAG}" \
        -t "collov/vi-agent-${svc_dir}:latest" \
        --push \
        "./${svc_dir}"
done

# 然后服务器上 pull
ssh ... "cd /opt/vi-agent/instances/<DEV_NAME> && docker compose pull && docker compose up -d"
```

**注意**: 本地构建必须使用 `docker buildx build --platform linux/amd64`，因为开发者 Mac 是 ARM 架构，服务器是 AMD64。

### Step 7: 生成 docker-compose.yml

根据构建模式生成不同的 compose 文件:

**关键区别**: 拉取模式用 `image:`，构建模式用 `build:`

生成 compose 文件时必须包含:
- `DATABASE_URL` 环境变量（api-server 需要显式设置）
- SSL 证书挂载（frontend 需要）
- postgres healthcheck 指定正确的数据库名
- 资源限制 (deploy.resources.limits)

**SSL 证书**: 如果实例目录下没有 ssl/ 目录:
```bash
ssh ... "cd /opt/vi-agent/instances/<DEV_NAME> && mkdir -p ssl && \
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem -subj '/CN=vi-agent-dev' 2>/dev/null"
```

### Step 8: 验证并输出结果

1. 健康检查:
```bash
ssh ... "curl -sf http://localhost:<API_PORT>/health"
```

2. 更新 registry.json（服务器端）

3. 同步更新本地 `.teamspace/environments/dev/registry.yml`

4. 输出部署摘要:

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
   Build:     <remote|local|hub-pull>
   Deployed:  <TIMESTAMP>
   By:        <DEV_NAME>

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
- 本地构建架构不匹配: 确保使用 `--platform linux/amd64`

## 关键注意事项（从部署实践中总结）

1. **DATABASE_URL 必须显式设置**: api-server 读取 `DATABASE_URL` 环境变量，不会自动拼接。格式:
   ```
   DATABASE_URL=postgresql+asyncpg://vi:${POSTGRES_PASSWORD}@postgres:5432/vi_${DEV_NAME}
   ```

2. **SSL 证书**: frontend 的 nginx 需要 `/etc/nginx/ssl/cert.pem`。必须生成自签名证书并挂载。

3. **source .env 会覆盖变量**: 服务器 `.env` 含 `API_PORT=8000`，脚本中先 source 再设置自定义端口。

4. **Healthcheck**: postgres 的 healthcheck 需指定 `-d vi_${DEV_NAME}`

5. **目标机器构建后记得 push**: 在服务器上 build 后，tag 并 push 到 Docker Hub，这样其他人可以直接 pull。

6. **本地构建注意架构**: Mac (ARM) → 服务器 (AMD64)，必须 `docker buildx build --platform linux/amd64`
