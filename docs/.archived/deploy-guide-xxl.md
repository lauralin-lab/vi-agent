# XXL Dev 部署手册

> **日常部署**：告诉 Claude "部署" 或 "使用xxl.md部署" 即可。
> Claude 会自动判断改动范围，通过 GitHub Actions 完成部署，并输出访问地址。

## 基本信息

| 项目 | 值 |
|------|-----|
| GitHub 用户 | `xxLe` |
| Slot | 6 |
| Server | `34.172.9.61` |
| SSH | `ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61` |
| 实例目录 | `/opt/vi-agent/instances/xxLe/` |

### 访问地址

| 服务 | 端口 | 地址 |
|------|------|------|
| Frontend HTTPS | 3610 | `https://34.172.9.61:3610` (摄像头可用) |
| Frontend HTTP | 3600 | `http://34.172.9.61:3600` |
| API | 3601 | `http://34.172.9.61:3601` |
| API Docs | 3601 | `http://34.172.9.61:3601/docs` |
| NanoClaw | 3602 | `http://34.172.9.61:3602` |
| Realtime | 3603 | (内部) |
| PostgreSQL | 5438 | (内部) |
| Redis | 6385 | (内部) |

---

## 怎么用

跟 Claude 说：
- `部署` / `使用xxl.md部署` → 自动判断改动范围 + 部署
- `查状态` → 查看实例状态
- `查日志 vi-realtime` → 查看服务日志
- `销毁` → 销毁实例

---

## 部署策略（Claude 自动判断）

服务器使用 **image pull 模式**（Docker Hub 镜像），不是源码 build。

**Claude 根据 git diff 涉及的目录自动判断改动范围：**

| 改动目录 | 影响服务 | 部署方式 |
|---------|---------|---------|
| 仅 `frontend/` | frontend | GitHub Actions 全量 |
| 仅 `api-server/` | api-server | GitHub Actions 全量 |
| 仅 `nanoclaw/` | nanoclaw | GitHub Actions 全量 |
| 仅 `realtime/` | vi-realtime | GitHub Actions 全量 |
| 多个服务 / `deploy/` | 全部 | GitHub Actions 全量 |

> 当前 workflow 总是构建全部 4 个镜像（~5-8min），无单服务构建选项。
> 部署完成后 Claude 会标注本次实际影响了哪个服务。

**部署完成后 Claude 必须输出：**
```
部署完成 (改动: frontend)
- Frontend: http://34.172.9.61:3600 | https://34.172.9.61:3610
- API: http://34.172.9.61:3601
- NanoClaw: http://34.172.9.61:3602
```

---

## 场景 A：全量部署

最常用。代码改了，推送后执行。**始终基于当前分支部署，不要硬编码分支名。**

### 步骤

```bash
# 1. 推送当前分支
CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH"

# 2. 触发 GitHub Actions 部署
gh workflow run deploy-dev.yml --ref "$CURRENT_BRANCH" \
  -f developer="xxLe" \
  -f ref="$CURRENT_BRANCH" \
  -f action=deploy

# 3. 等待完成（约 5-8 分钟）
# 用 gh run view <run-id> --json status,conclusion 轮询
```

GitHub Actions 会：
1. 从当前分支构建 4 个 Docker 镜像并推送到 Docker Hub
2. SSH 到服务器执行 `deploy-instance.sh`
3. 拉取镜像、启动容器、运行数据库迁移、健康检查

---

## 场景 B：查看日志

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="xxLe" \
  -f action=logs \
  -f service="vi-realtime" \
  -f lines="100"
```

服务名：`api-server` / `frontend` / `nanoclaw` / `vi-realtime`（注意 realtime 的服务名是 `vi-realtime`）

---

## 场景 C：查看状态

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="xxLe" \
  -f action=status
```

查看所有开发者实例：

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="_all" \
  -f action=status
```

---

## 场景 D：销毁实例

```bash
gh workflow run deploy-dev.yml --ref pre-launch \
  -f developer="xxLe" \
  -f action=destroy
```

> 销毁会删除容器、volumes（数据库）和实例目录。重新部署需要用户清除浏览器 localStorage 重新注册。

---

## 已知问题速查

| 问题 | 症状 | 解决 |
|------|------|------|
| **端口冲突** | `Bind for ... failed: port is already allocated` | 先 destroy 旧实例，再重新 deploy |
| **数据库空表** | API 500 + SQLAlchemy 错误 | Dockerfile 已修复（启动时自动跑 alembic migrate） |
| **SSE 401** | 浏览器 `401 Unauthorized` on `/api/users/events` | 浏览器控制台执行 `localStorage.clear(); location.reload()` |
| **9 slot 全满** | `No available slots` | 联系 admin 销毁不用的实例 |
| **workflow not found** | `could not create workflow dispatch` | 确保 `--ref pre-launch`，workflow 文件在该分支上 |

---

## SSH 直接操作（排查问题用）

```bash
# 登录
ssh -A -i ~/.ssh/id_rsa xxl@34.172.9.61

# 查看容器状态
sudo docker compose -f /opt/vi-agent/instances/xxLe/docker-compose.yml ps

# 查看某服务日志
sudo docker compose -f /opt/vi-agent/instances/xxLe/docker-compose.yml logs --tail=100 frontend

# 重启单个服务（不换镜像）
sudo docker compose -f /opt/vi-agent/instances/xxLe/docker-compose.yml restart frontend

# 查看注册表（所有开发者实例）
cat /opt/vi-agent/registry.json | python3 -m json.tool
```

---

## .env 管理

API Keys（LiveKit / Google / Anthropic / GCS）由 **GitHub Environment Secrets** 管理，不需要本地 `.env` 上传。

如需更新 API Key，联系 admin 修改 GitHub repo 的 `dev` environment secrets。
