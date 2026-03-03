# XXL Dev 部署手册

> **本文档替代 `/dev` 命令。** 直接告诉 Claude "部署" 或 "部署 frontend" 即可，Claude 按此文档执行。

## 怎么用

跟 Claude 说：
- `部署` 或 `全量部署` → 执行场景 A
- `部署 frontend` / `部署 gateway` / `部署 api-server` / `部署 realtime` → 执行场景 B
- `重启` / `重启 gateway` → 执行场景 C
- `查日志 realtime` → 运维命令

Claude 会自动判断当前分支、打 tag、构建、部署、验证，全程不需要手动操作。

## 基本信息

| 项目 | 值 |
|------|-----|
| SSH | `ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61` |
| 分支 | `features/xxl_dev` |
| Slot | 6 |
| 实例目录 | `/opt/vi-agent/instances/xxl/` |
| 服务器代码 | `~/vi-agent-repos/xxl/` |
| Docker Hub | **未登录，不要 push** |
| 权限 | xxl 有 sudo；`/opt/vi-agent/` 写操作需 sudo |

### 端口

| 服务 | 端口 | 地址 |
|------|------|------|
| Frontend HTTPS | 3610 | `https://34.172.9.61:3610` (摄像头可用) |
| Frontend HTTP | 3600 | `http://34.172.9.61:3600` |
| API | 3601 | `http://34.172.9.61:3601` |
| API Docs | 3601 | `http://34.172.9.61:3601/docs` |
| Gateway | 3602 | `http://34.172.9.61:3602` |
| Realtime | 3603 | |
| PostgreSQL | 5438 | |
| Redis | 6385 | |

### 服务名 ↔ 代码目录 对照

| docker compose 服务名 | 代码目录 | 镜像名 |
|----------------------|----------|--------|
| `api-server` | `api-server/` | `collov/vi-agent-api-server` |
| `frontend` | `frontend/` | `collov/vi-agent-frontend` |
| `vi-gateway` | `gateway/` | `collov/vi-agent-gateway` |
| `vi-realtime` | `realtime/` | `collov/vi-agent-realtime` |
| `postgres` | — | `postgres:16-alpine` |
| `redis` | — | `redis:7-alpine` |

---

## 场景 A：全量部署（所有服务重新构建）

当多个服务都有改动，或首次部署时使用。

### 0. 本地检查

```bash
git status --porcelain          # 确保干净
git push                        # 确保已推送到 features/xxl_dev
ssh-add -l || ssh-add ~/.ssh/id_rsa   # 确保 SSH agent 有 key
```

### 1. 同步模板（仅 `deploy/dev-environment/` 有改动时需要）

```bash
scp -i ~/.ssh/id_rsa deploy/dev-environment/*.sh deploy/dev-environment/*.tpl \
  xxl@34.172.9.61:~/vi-templates-tmp/
ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61 \
  "sudo cp ~/vi-templates-tmp/* /opt/vi-agent/templates/ && sudo chmod +x /opt/vi-agent/templates/*.sh"
```

> 如果只改了业务代码（frontend/api-server/gateway/realtime），跳过此步。

### 2. 打 Tag

```bash
TAG="dev-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
git tag "$TAG" && git push --tags
```

### 3. 服务器拉代码 + 构建全部镜像

```bash
SSH="ssh -A -i ~/.ssh/id_rsa -o ServerAliveInterval=30 xxl@34.172.9.61"

# 首次：clone（已有则跳过）
$SSH "test -d ~/vi-agent-repos/xxl/.git || git clone git@github.com:flair-home-stylist/vi_agent.git ~/vi-agent-repos/xxl"

# 拉代码，checkout 到 tag
$SSH "cd ~/vi-agent-repos/xxl && git fetch --all --tags && git checkout tags/$TAG"

# 构建 4 个服务
$SSH "cd ~/vi-agent-repos/xxl && docker build -t collov/vi-agent-api-server:$TAG ./api-server"
$SSH "cd ~/vi-agent-repos/xxl && docker build --build-arg VITE_API_URL= --build-arg VITE_LIVEKIT_URL= -t collov/vi-agent-frontend:$TAG ./frontend"
$SSH "cd ~/vi-agent-repos/xxl && docker build -t collov/vi-agent-gateway:$TAG ./gateway"
$SSH "cd ~/vi-agent-repos/xxl && docker build -t collov/vi-agent-realtime:$TAG ./realtime"
```

### 4. 更新 compose 镜像 tag

```bash
$SSH "cd /opt/vi-agent/instances/xxl && sudo sed -i \
  's|collov/vi-agent-api-server:[^ ]*|collov/vi-agent-api-server:$TAG|g; \
   s|collov/vi-agent-frontend:[^ ]*|collov/vi-agent-frontend:$TAG|g; \
   s|collov/vi-agent-gateway:[^ ]*|collov/vi-agent-gateway:$TAG|g; \
   s|collov/vi-agent-realtime:[^ ]*|collov/vi-agent-realtime:$TAG|g' docker-compose.yml"
```

### 5. 修复 realtime 内存限制

每次更新 docker-compose.yml 后，realtime 的 memory 会被重置为 512M，必须改回 1536M：

```bash
$SSH "cd /opt/vi-agent/instances/xxl && sudo python3 -c \"
import re
f='/opt/vi-agent/instances/xxl/docker-compose.yml'
c=open(f).read()
# 只改 vi-realtime 段的 512M → 1536M（倒数第一个 512M）
parts=c.rsplit('memory: 512M',1)
if len(parts)==2: c=parts[0]+'memory: 1536M'+parts[1]
open(f,'w').write(c)
print('realtime memory → 1536M')
\""
```

### 6. 启动

```bash
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose down --remove-orphans && sudo docker compose up -d"
```

### 7. 验证

```bash
$SSH "sudo bash /opt/vi-agent/templates/test-instance.sh 34.172.9.61 3600 3601 3602 3610"
```

期望：16/16 passed。

---

## 判断哪些服务需要重建

在部署前，用这个命令看自上次部署以来改了哪些目录：

```bash
# 查看当前部署的 tag
ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61 "grep 'image:.*collov' /opt/vi-agent/instances/xxl/docker-compose.yml | head -1"

# 对比当前 HEAD 和上次部署的 tag（假设上次是 dev-20260303-c819af0）
git diff --stat dev-20260303-c819af0..HEAD -- frontend/ api-server/ gateway/ realtime/
```

- 只有 `frontend/` 有改动 → 场景 B（只部署 frontend）
- 只有 `gateway/` 有改动 → 场景 B（只部署 gateway）
- 多个目录有改动 → 场景 A（全量部署）或多次场景 B
- 没有改动 → 场景 C（只重启）

---

## 场景 B：只更新单个服务

只改了一个服务的代码，不需要全量构建。**这是最常用的操作。**

### 步骤

```bash
# 0. 本地确保推送
git push

# 1. 变量
SSH="ssh -A -i ~/.ssh/id_rsa -o ServerAliveInterval=30 xxl@34.172.9.61"
TAG="dev-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
git tag "$TAG" && git push --tags

# 2. 服务器拉代码
$SSH "cd ~/vi-agent-repos/xxl && git fetch --all --tags && git checkout tags/$TAG"
```

然后根据改动的服务，只执行对应的一段：

#### 只改了 frontend

```bash
$SSH "cd ~/vi-agent-repos/xxl && docker build --build-arg VITE_API_URL= --build-arg VITE_LIVEKIT_URL= -t collov/vi-agent-frontend:$TAG ./frontend"
$SSH "cd /opt/vi-agent/instances/xxl && sudo sed -i 's|collov/vi-agent-frontend:[^ ]*|collov/vi-agent-frontend:$TAG|g' docker-compose.yml"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose up -d --no-deps frontend"
```

#### 只改了 api-server

```bash
$SSH "cd ~/vi-agent-repos/xxl && docker build -t collov/vi-agent-api-server:$TAG ./api-server"
$SSH "cd /opt/vi-agent/instances/xxl && sudo sed -i 's|collov/vi-agent-api-server:[^ ]*|collov/vi-agent-api-server:$TAG|g' docker-compose.yml"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose up -d --no-deps api-server"
```

#### 只改了 gateway

```bash
$SSH "cd ~/vi-agent-repos/xxl && docker build -t collov/vi-agent-gateway:$TAG ./gateway"
$SSH "cd /opt/vi-agent/instances/xxl && sudo sed -i 's|collov/vi-agent-gateway:[^ ]*|collov/vi-agent-gateway:$TAG|g' docker-compose.yml"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose up -d --no-deps vi-gateway"
```

#### 只改了 realtime

```bash
$SSH "cd ~/vi-agent-repos/xxl && docker build -t collov/vi-agent-realtime:$TAG ./realtime"
$SSH "cd /opt/vi-agent/instances/xxl && sudo sed -i 's|collov/vi-agent-realtime:[^ ]*|collov/vi-agent-realtime:$TAG|g' docker-compose.yml"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose up -d --no-deps vi-realtime"
```

> **`--no-deps`** 表示只重启该服务，不连带重启依赖的 postgres/redis 等。

---

## 场景 C：不改代码，只重启

代码没变，只是服务挂了或需要刷新配置。

```bash
SSH="ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61"

# 重启所有服务
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose restart"

# 只重启某个服务
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose restart vi-gateway"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose restart vi-realtime"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose restart api-server"
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose restart frontend"
```

---

## 日常运维命令

```bash
SSH="ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61"

# 查看所有容器状态
$SSH "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep xxl"

# 查看内存/CPU
$SSH "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' | grep xxl"

# 查看日志（所有）
$SSH "cd /opt/vi-agent/instances/xxl && docker compose logs --tail=50"

# 查看某个服务日志
$SSH "cd /opt/vi-agent/instances/xxl && docker compose logs --tail=100 vi-realtime"
$SSH "cd /opt/vi-agent/instances/xxl && docker compose logs --tail=100 vi-gateway"
$SSH "cd /opt/vi-agent/instances/xxl && docker compose logs --tail=100 api-server"

# 实时跟踪日志
$SSH "cd /opt/vi-agent/instances/xxl && docker compose logs -f vi-gateway"

# 停止所有
$SSH "cd /opt/vi-agent/instances/xxl && sudo docker compose down"

# 查看当前用的镜像 tag
$SSH "grep 'image:.*collov' /opt/vi-agent/instances/xxl/docker-compose.yml"

# 查看服务器上已有的镜像
$SSH "docker images | grep dev- | head -20"

# 清理旧镜像（释放磁盘）
$SSH "docker image prune -f"
```

---

## 已知问题速查

| 问题 | 症状 | 解决 |
|------|------|------|
| **realtime OOM** | 日志 `exit code -9`，进程反复重启 | `sudo sed -i '/vi-realtime/,/memory:/{s/memory: 512M/memory: 1536M/}' docker-compose.yml` 后 `docker compose up -d vi-realtime` |
| **Hub push 失败** | `push access denied` | 不 push，只用本地镜像（本文档标准流程） |
| **SSH Agent 失败** | `git@github.com: Permission denied` | 本地 `ssh-add ~/.ssh/id_rsa` |
| **templates 写失败** | `scp: Permission denied` | 先传到 `~/vi-templates-tmp/`，再 `sudo cp` |
| **repo 权限错** | `cannot open .git/FETCH_HEAD` | `sudo chown -R xxl:xxl ~/vi-agent-repos/xxl` |
| **compose pull 失败** | `not found` on docker.io | 不要用 `create-instance.sh`，直接 `docker compose up -d` |

---

## .env（一般不改）

路径：`/opt/vi-agent/instances/xxl/.env`

包含 LiveKit / Google / Anthropic API Keys + 自动生成的 DB/Redis/JWT 密钥。

如需更新：
```bash
ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61 "sudo vi /opt/vi-agent/instances/xxl/.env"
```
