# Yijia 部署手册

> 从本地改代码到线上生效的完整流程。不需要每次都跑 `/dev`。

## 环境信息

| 项目 | 值 |
|------|----|
| 服务器 | `34.172.9.61` |
| SSH 用户 | `yijiazhou` |
| SSH Key | `~/.ssh/id_ed25519` |
| 实例名 | `yijia` (slot 2) |
| Frontend (HTTPS) | https://34.172.9.61:3210 |
| Frontend (HTTP) | http://34.172.9.61:3200 |
| API | http://34.172.9.61:3201 |
| API Docs | http://34.172.9.61:3201/docs |
| Gateway | http://34.172.9.61:3202 |
| Docker Hub Org | `collov` |
| 服务器代码目录 | `~/vi-agent-repos/yijia/` |
| 实例目录 | `/opt/vi-agent/instances/yijia/` |

## 快速参考（复制粘贴版）

改完代码后，依次执行这 4 步：

```bash
# 1. 提交并推送
git add -A && git commit -m "feat(scope): 描述"
git push

# 2. 打 tag 并推送
TAG="dev-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
git tag $TAG && git push --tags
echo "Tag: $TAG"

# 3. SSH 到服务器构建镜像（约 2-5 分钟）
ssh -A -i ~/.ssh/id_ed25519 yijiazhou@34.172.9.61 \
  "REPO_DIR=~/vi-agent-repos/yijia bash /opt/vi-agent/templates/build-and-push.sh $TAG"

# 4. 部署新镜像（约 30 秒）
ssh -A -i ~/.ssh/id_ed25519 yijiazhou@34.172.9.61 \
  "sudo bash /opt/vi-agent/templates/create-instance.sh yijia main \$(echo $TAG | grep -o '[^-]*$') image $TAG"
```

完成后访问 https://34.172.9.61:3210 验证。

---

## 详细步骤说明

### Step 1: 本地提交代码

```bash
# 查看改了什么
git status
git diff

# 提交（遵循 Conventional Commits）
git add -A
git commit -m "feat(api): add upload endpoint"
# 或 fix(frontend): fix camera permission
# 或 refactor(gateway): simplify routing

# 推送到远程
git push
```

> 为什么要推送？服务器通过 SSH Agent Forwarding 从 GitHub 拉取代码，所以代码必须先到 GitHub。

### Step 2: 打 Tag

镜像版本通过 git tag 管理，格式为 `dev-YYYYMMDD-COMMIT`。

```bash
# 生成 tag 名（自动包含日期和 commit hash）
TAG="dev-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
echo $TAG
# 输出类似: dev-20260303-ad8a03a

# 创建并推送 tag
git tag $TAG
git push --tags
```

### Step 3: 服务器上构建镜像

> 构建在服务器上执行（Linux AMD64），不在本地 Mac 构建（避免 ARM 交叉编译问题）。

```bash
ssh -A -i ~/.ssh/id_ed25519 yijiazhou@34.172.9.61 \
  "REPO_DIR=~/vi-agent-repos/yijia bash /opt/vi-agent/templates/build-and-push.sh $TAG"
```

这个命令会：
1. `git fetch --all --tags` 拉取最新代码
2. `git checkout tags/$TAG` 切到你的 tag
3. 逐个构建 4 个服务镜像：`api-server`, `frontend`, `gateway`, `realtime`
4. 推送到 Docker Hub (`collov/vi-agent-*:$TAG`)

预计耗时 2-5 分钟（取决于改动范围，Docker 有层缓存）。

**构建完成后会输出：**
```
=== All images built and pushed ===
  Tag:    dev-20260303-ad8a03a
  Commit: ad8a03a
  Images:
    collov/vi-agent-api-server:dev-20260303-ad8a03a
    collov/vi-agent-frontend:dev-20260303-ad8a03a
    collov/vi-agent-gateway:dev-20260303-ad8a03a
    collov/vi-agent-realtime:dev-20260303-ad8a03a
```

### Step 4: 部署新镜像

```bash
ssh -A -i ~/.ssh/id_ed25519 yijiazhou@34.172.9.61 \
  "sudo bash /opt/vi-agent/templates/create-instance.sh yijia main $(echo $TAG | grep -o '[^-]*$') image $TAG"
```

这个命令会：
1. 检测到 yijia 实例已存在 → 复用 slot 2（端口不变）
2. 拉取新镜像
3. 停掉旧容器
4. 用新镜像启动
5. 等待 health check
6. 运行测试套件

**期望输出：**
```
=== Instance Ready ===
  Developer:  yijia
  Frontend:   https://34.172.9.61:3210
  API:        http://34.172.9.61:3201
  ...

Results: 16/16 passed, 0 failed
✅ All tests passed
```

---

## 只改了一个服务？单独构建更快

如果你只改了 api-server，不需要重新构建全部 4 个服务：

```bash
# SSH 到服务器
ssh -A -i ~/.ssh/id_ed25519 yijiazhou@34.172.9.61

# 进入代码目录，拉取最新
cd ~/vi-agent-repos/yijia
git fetch --all --tags && git checkout tags/$TAG

# 只构建 api-server
docker build -t collov/vi-agent-api-server:$TAG ./api-server
docker push collov/vi-agent-api-server:$TAG

# 只重启 api-server（不动其他服务）
cd /opt/vi-agent/instances/yijia
sudo docker compose pull api-server
sudo docker compose up -d api-server
```

对应关系：

| 改了什么 | 构建目录 | 镜像名 | compose 服务名 |
|----------|----------|--------|----------------|
| Python API | `./api-server` | `collov/vi-agent-api-server` | `api-server` |
| React 前端 | `./frontend` | `collov/vi-agent-frontend` | `frontend` |
| Node Gateway | `./gateway` | `collov/vi-agent-gateway` | `vi-gateway` |
| LiveKit Agent | `./realtime` | `collov/vi-agent-realtime` | `vi-realtime` |

---

## 常用运维命令

所有命令在 SSH 到服务器后执行，或加 SSH 前缀在本地执行。

```bash
# SSH 快捷方式（可以加到 ~/.zshrc）
alias vi-ssh="ssh -A -i ~/.ssh/id_ed25519 yijiazhou@34.172.9.61"
```

### 查看日志

```bash
# 所有服务日志
cd /opt/vi-agent/instances/yijia && sudo docker compose logs -f

# 只看某个服务
sudo docker compose logs -f api-server
sudo docker compose logs -f frontend
sudo docker compose logs -f vi-gateway
```

### 重启服务

```bash
cd /opt/vi-agent/instances/yijia

# 重启全部
sudo docker compose restart

# 只重启 api-server
sudo docker compose restart api-server
```

### 停止/启动

```bash
cd /opt/vi-agent/instances/yijia

# 停止（保留数据）
sudo docker compose down

# 启动
sudo docker compose up -d
```

### 查看容器状态

```bash
cd /opt/vi-agent/instances/yijia && sudo docker compose ps
```

### 数据库操作

```bash
# 进入 PostgreSQL
cd /opt/vi-agent/instances/yijia
sudo docker compose exec postgres psql -U vi -d vi_db

# 运行迁移
sudo docker compose exec api-server alembic upgrade head
```

### 运行测试

```bash
bash /opt/vi-agent/templates/test-instance.sh 34.172.9.61 3200 3201 3202 3210
```

---

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| SSH `Permission denied` | key 没加到服务器 | 联系管理员 liyasong |
| `git fetch` 失败 `Permission denied (publickey)` | 本地没开 SSH Agent | 确保用 `ssh -A`，本地 `ssh-add ~/.ssh/id_ed25519` |
| Docker build 失败 | 代码有 bug 或 Dockerfile 问题 | 看报错信息，本地先测 |
| 容器启动失败 | .env 缺 key 或端口冲突 | `docker compose logs` 查日志 |
| API 500 `relation not exist` | 数据库没迁移 | `docker compose exec api-server alembic upgrade head` |
| Frontend 白屏 | API 地址配错 | 检查 nginx proxy 配置 |
| `port already allocated` | 旧容器没清理 | `docker compose down` 再重启 |

---

## 什么时候需要跑 /dev？

大多数情况**不需要**。只有以下场景才用 `/dev`：

- 首次创建实例（已经做过了）
- 服务器 IP 变了，需要更新 registry 和 .env
- 需要更新 .env 中的 API keys
- 需要更新服务器上的部署脚本模板
- 忘记端口号了想查一下（或直接看本文档）
