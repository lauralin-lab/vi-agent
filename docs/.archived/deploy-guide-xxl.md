# XXL Dev 部署手册

> **日常部署**：告诉 Claude "部署" 即可，自动通过 GitHub Actions 完成。
> 不需要个人 SSH 账号，不需要服务器登录。

## 基本信息

| 项目 | 值 |
|------|-----|
| GitHub 用户 | `xxLe` |
| 分支 | `features/xxl_dev` |
| Slot | 6 |
| 实例名 | `xxLe`（GitHub Actions 用） |
| 实例目录 | `/opt/vi-agent/instances/xxLe/` |

### 端口

| 服务 | 端口 | 地址 |
|------|------|------|
| Frontend HTTPS | 3610 | `https://34.172.9.61:3610` (摄像头可用) |
| Frontend HTTP | 3600 | `http://34.172.9.61:3600` |
| API | 3601 | `http://34.172.9.61:3601` |
| API Docs | 3601 | `http://34.172.9.61:3601/docs` |
| NanoClaw | 3602 | `http://34.172.9.61:3602` |
| Realtime | 3603 | |
| PostgreSQL | 5438 | |
| Redis | 6385 | |

---

## 怎么用

跟 Claude 说：
- `部署` → 全量部署（GitHub Actions 构建 + 部署）
- `查状态` → 查看实例状态
- `查日志 vi-realtime` → 查看服务日志
- `销毁` → 销毁实例

---

## 场景 A：全量部署

最常用。代码改了，推送后执行。

### 步骤

```bash
# 1. 确保代码已推送
git push origin features/xxl_dev

# 2. 触发 GitHub Actions 部署
gh workflow run deploy-dev.yml \
  --ref pre-launch \
  -f developer="xxLe" \
  -f ref="features/xxl_dev" \
  -f action=deploy

# 3. 等待完成（约 2-3 分钟）
sleep 5
RUN_ID=$(gh run list --workflow=deploy-dev.yml --event=workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

GitHub Actions 会：
1. 从 `features/xxl_dev` 构建 4 个 Docker 镜像并推送到 Docker Hub
2. SSH 到服务器执行 `deploy-instance.sh`
3. 拉取镜像、启动容器、健康检查

### 查看部署结果

```bash
gh run view "$RUN_ID" --log 2>&1 | grep -E "(Instance Ready|Frontend:|API:|NanoClaw:|Image Tag:|Deployed:)"
```

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

## .env 管理

API Keys（LiveKit / Google / Anthropic / GCS）由 **GitHub Environment Secrets** 管理，不需要本地 `.env` 上传。

如需更新 API Key，联系 admin 修改 GitHub repo 的 `dev` environment secrets。
