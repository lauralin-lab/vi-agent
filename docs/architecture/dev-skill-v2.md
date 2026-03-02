# /dev Skill V2 — Architecture Design

> 日期: 2026-03-02
> 状态: Draft — 待 Review

---

## Executive Summary

当前 `/dev` skill 的部署流程存在 4 个核心问题：Frontend Dockerfile 的 VITE_* 变量构建时写死导致镜像无法复用、Instance 模板只有 build 模式缺少 image pull 模式、缺乏 tag 版本管理机制、部署后无功能性验证。

本设计方案通过 **4 个改动** 解决全部问题：
1. Frontend 改用相对 API URL + 运行时 config 注入 → 镜像通用化
2. Instance 模板支持 image/build 双模式 → Hub pull 秒级部署
3. 标准化 commit→push→tag→服务器构建→Hub push 流程 → 可追溯可回滚
4. 部署后自动运行分层测试 → smoke → functional → connectivity

---

## 1. Frontend 运行时配置注入

### 问题

Vite 在 `npm run build` 时将 `VITE_*` 环境变量烘焙进 JS bundle。当前：
- `frontend/Dockerfile` 默认值: `VITE_API_URL=http://localhost:8000`
- `instance.yml.tpl` 构建时传: `VITE_API_URL=http://${SERVER_IP}:__API_PORT__`
- 每个 dev 实例的 API 端口不同，所以每次都要重新 build

### 方案

**两层策略**:

| 变量 | 策略 | 原因 |
|------|------|------|
| `VITE_API_URL` | 设为空 `""` (相对路径) | nginx 已配置 `/api/` → api-server:8000 proxy，Docker 内部 DNS 始终正确 |
| `VITE_LIVEKIT_URL` | 运行时注入 via `/api/config` endpoint | LiveKit 是外部 WebSocket 地址，不能走 nginx proxy |

#### 1a. Frontend Dockerfile 修改

```dockerfile
# 删除默认值，强制构建时传入或使用空字符串
ARG VITE_API_URL=""
ARG VITE_LIVEKIT_URL=""
```

构建时只需要知道 LIVEKIT_URL，而且这个值对所有实例相同（同一个 LiveKit Cloud 项目）。

#### 1b. 添加 `/api/config` endpoint

在 api-server 添加一个公开的配置端点:

```python
# api-server/app/routers/config.py
@router.get("/api/config")
async def get_client_config():
    return {
        "livekit_url": settings.LIVEKIT_URL,
        "version": settings.APP_VERSION,  # 来自环境变量或 git info
    }
```

Frontend 在初始化时从 `/api/config` 获取运行时配置，而非依赖构建时烘焙的值。

#### 1c. Frontend 代码修改

```typescript
// src/config.ts
let _config: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (_config) return _config;

  // 优先使用构建时注入的值（本地开发），否则从 API 获取
  const buildTimeUrl = import.meta.env.VITE_LIVEKIT_URL;
  if (buildTimeUrl) {
    _config = { livekitUrl: buildTimeUrl, version: 'dev' };
    return _config;
  }

  const res = await fetch('/api/config');
  _config = await res.json();
  return _config;
}
```

#### 结果

一次 build → 同一个 image 可以跑在任何实例上。`VITE_API_URL=""` + nginx proxy 解决 API 路由，`/api/config` 解决 LiveKit URL 注入。

---

## 2. Instance 模板双模式

### 当前问题

`docker-compose.instance.yml.tpl` 只有 `build:` context，不支持 `image:` 模式。

### 方案

拆分为两个模板:

#### 2a. docker-compose.instance-image.yml.tpl (Mode A: Hub Pull)

```yaml
services:
  api-server:
    image: collov/vi-agent-api-server:__IMAGE_TAG__
    # ... (无 build section)

  frontend:
    image: collov/vi-agent-frontend:__IMAGE_TAG__
    # ... (无 build section, 无 build args)

  vi-gateway:
    image: collov/vi-agent-gateway:__IMAGE_TAG__

  vi-realtime:
    image: collov/vi-agent-realtime:__IMAGE_TAG__
```

#### 2b. docker-compose.instance-build.yml.tpl (Mode B: 服务器构建)

保留现有 `build:` 模板，但删除 frontend 的 `VITE_API_URL` build arg（改为空）:

```yaml
  frontend:
    build:
      context: /opt/vi-agent/repo/frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_URL=            # 空，用相对路径
        - VITE_LIVEKIT_URL=${LIVEKIT_URL}
```

#### 2c. create-instance.sh 支持双模式

```bash
BUILD_MODE="${4:-image}"  # image 或 build
IMAGE_TAG="${5:-latest}"

if [ "$BUILD_MODE" = "image" ]; then
    TEMPLATE="docker-compose.instance-image.yml.tpl"
    # 额外替换 __IMAGE_TAG__
else
    TEMPLATE="docker-compose.instance-build.yml.tpl"
fi
```

---

## 3. Tag 版本管理 + 服务器构建流程

### 目标流程

```
开发者本地:
  git commit → git push → git tag dev-YYYYMMDD-COMMIT → git push --tags

/dev skill:
  ① 提醒用户 commit + push + tag
  ② SSH 到服务器
  ③ git fetch --tags → checkout tag
  ④ docker compose build
  ⑤ docker tag + docker push to Hub
  ⑥ 部署实例 (image: mode)
  ⑦ 运行测试
```

### 3a. Tag 命名规范

```
格式:  dev-{YYYYMMDD}-{short-commit}
示例:  dev-20260302-abc1234

用途:
  - git tag: dev-20260302-abc1234
  - Docker image tag: collov/vi-agent-api-server:dev-20260302-abc1234
  - Registry 记录: image_tag: dev-20260302-abc1234
```

为什么用这个格式:
- 日期排序直观
- commit hash 可追溯
- `dev-` 前缀区分环境
- 不用手动管理版本号

### 3b. /dev Skill 中的 Pre-flight Check

在 Step 1（收集信息）之前，先检查代码状态:

```
🔍 Pre-flight Check:
   ✅ Working tree clean (no uncommitted changes)
   ✅ Branch pushed to remote
   ❌ No tag found — 需要打 tag

💡 请执行以下命令:
   git tag dev-20260302-$(git rev-parse --short HEAD)
   git push --tags

   完成后输入 tag 名称继续部署。
```

### 3c. 服务器构建 + Push 脚本

新增 `deploy/dev-environment/build-and-push.sh`:

```bash
#!/bin/bash
# 在服务器上构建镜像并推送到 Docker Hub
# Usage: ./build-and-push.sh <tag>

TAG="$1"
REPO_DIR="/opt/vi-agent/repo"

cd "$REPO_DIR"
git fetch --all --tags
git checkout "tags/$TAG"

# 构建 4 个服务镜像
for svc in api-server frontend gateway realtime; do
    echo "Building collov/vi-agent-${svc}:${TAG}..."

    BUILD_ARGS=""
    if [ "$svc" = "frontend" ]; then
        BUILD_ARGS="--build-arg VITE_API_URL= --build-arg VITE_LIVEKIT_URL="
    fi

    docker build $BUILD_ARGS \
        -t "collov/vi-agent-${svc}:${TAG}" \
        -t "collov/vi-agent-${svc}:latest" \
        "./${svc}"

    # Push 到 Docker Hub
    docker push "collov/vi-agent-${svc}:${TAG}"
    docker push "collov/vi-agent-${svc}:latest"
done

echo "✅ All images built and pushed with tag: ${TAG}"
```

### 3d. Docker Hub 镜像命名

```
collov/vi-agent-api-server:{tag}
collov/vi-agent-frontend:{tag}
collov/vi-agent-gateway:{tag}
collov/vi-agent-realtime:{tag}

Tags:
  latest          — 最新构建
  dev-YYYYMMDD-*  — dev 环境版本
  v0.1.0          — 正式发布 (未来)
```

---

## 4. 部署后测试流程

### 分层测试设计

```
Layer 0: Infrastructure (已有)     ~5s
├── postgres healthy
├── redis healthy
└── 各服务容器 running

Layer 1: Smoke Test (新增)         ~10s
├── Frontend HTTP 200 (nginx alive)
├── Frontend 返回 HTML (不是 502)
├── API /health 返回 200
├── API /docs 可访问 (FastAPI Swagger)
├── Gateway /health 返回 200
└── API /api/config 返回 LiveKit URL

Layer 2: Functional Test (新增)    ~15s
├── API: POST /api/auth/register → 201
├── API: POST /api/auth/login → 200 + JWT
├── API: GET /api/users/me → 200 (用 JWT)
├── API: POST /api/conversations → 201
├── Gateway: POST /health → 200
└── CORS: OPTIONS /api/ → 正确 headers

Layer 3: Connectivity Test (新增)  ~10s
├── Frontend → API proxy (/api/health 通过 nginx)
├── API → Gateway (内部通信)
├── API → Redis (缓存可用)
└── API → Postgres (查询可用)
```

### 4a. 测试脚本: deploy/dev-environment/test-instance.sh

```bash
#!/bin/bash
# Post-deployment test suite for dev instances
# Usage: ./test-instance.sh <server_ip> <frontend_port> <api_port> <gateway_port>

SERVER_IP="$1"
F_PORT="$2"
A_PORT="$3"
G_PORT="$4"

PASS=0; FAIL=0; TOTAL=0

check() {
    local name="$1" cmd="$2"
    TOTAL=$((TOTAL+1))
    if eval "$cmd" > /dev/null 2>&1; then
        echo "  ✅ $name"
        PASS=$((PASS+1))
    else
        echo "  ❌ $name"
        FAIL=$((FAIL+1))
    fi
}

echo "=== Layer 1: Smoke Test ==="
check "Frontend HTTP 200" \
    "curl -sf -o /dev/null -w '%{http_code}' http://$SERVER_IP:$F_PORT/ | grep -q 200"
check "Frontend returns HTML" \
    "curl -sf http://$SERVER_IP:$F_PORT/ | grep -q '</html>'"
check "API /health" \
    "curl -sf http://$SERVER_IP:$A_PORT/health"
check "API /docs" \
    "curl -sf -o /dev/null http://$SERVER_IP:$A_PORT/docs"
check "Gateway /health" \
    "curl -sf http://$SERVER_IP:$G_PORT/health"

echo ""
echo "=== Layer 2: Functional Test ==="
# 注册测试用户
REG_RESP=$(curl -sf -X POST "http://$SERVER_IP:$A_PORT/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"username":"test_smoke","password":"test1234","email":"smoke@test.dev"}' 2>&1)
check "API register" "echo '$REG_RESP' | grep -qE '(201|already|exists|id)'"

# 登录获取 token
TOKEN=$(curl -sf -X POST "http://$SERVER_IP:$A_PORT/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"test_smoke","password":"test1234"}' | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
check "API login + JWT" "[ -n '$TOKEN' ]"

if [ -n "$TOKEN" ]; then
    check "API /users/me" \
        "curl -sf -H 'Authorization: Bearer $TOKEN' http://$SERVER_IP:$A_PORT/api/users/me"
fi

echo ""
echo "=== Layer 3: Connectivity Test ==="
check "Frontend→API proxy" \
    "curl -sf http://$SERVER_IP:$F_PORT/api/health | grep -qE '(ok|healthy|status)'"
check "CORS headers" \
    "curl -sf -I -X OPTIONS http://$SERVER_IP:$A_PORT/api/health -H 'Origin: http://$SERVER_IP:$F_PORT' | grep -qi 'access-control'"

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

### 4b. 集成到 create-instance.sh

在现有 health check 之后追加:

```bash
# --- Run test suite ---
echo "Running deployment tests..."
"$BASE_DIR/templates/test-instance.sh" "$SERVER_IP" "$FRONTEND_PORT" "$API_PORT" "$GATEWAY_PORT"
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
    echo "⚠️  Some tests failed. Instance is running but may have issues."
fi
```

---

## 5. 完整新流程

```
开发者本地                              GCE Server (34.56.23.173)
────────────                            ────────────────────────

1. 写代码、commit、push
2. git tag dev-YYYYMMDD-COMMIT
3. git push --tags
                                        ┌─────────────────────────┐
管理员运行 /dev ─── SSH ──────────────▶ │                         │
                                        │ 4. git fetch --tags      │
Pre-flight:                             │    checkout tag           │
 ✅ tag 存在                             │                         │
 ✅ 远程有 tag                           │ 5. docker build × 4     │
 ✅ 本地 .env 有效                       │    (服务器上构建)         │
                                        │                         │
                                        │ 6. docker push to Hub    │
                                        │    collov/vi-agent-*:tag │
                                        │                         │
                                        │ 7. 创建实例目录          │
                                        │    生成 compose (image:) │
                                        │    docker compose up -d  │
                                        │                         │
                                        │ 8. 测试流程              │
                                        │    Layer 1: Smoke  ✅    │
                                        │    Layer 2: Func   ✅    │
                                        │    Layer 3: Conn   ✅    │
                                        │                         │
                                        └─────────────────────────┘

输出: 访问地址 + 版本信息 + 测试报告
```

---

## 6. 文件变更清单

| 文件 | 操作 | 内容 |
|------|------|------|
| `frontend/Dockerfile` | 修改 | ARG VITE_API_URL="" (空默认值) |
| `api-server/app/routers/config.py` | 新增 | /api/config 运行时配置端点 |
| `frontend/src/config.ts` | 新增 | 运行时配置加载 |
| `deploy/dev-environment/docker-compose.instance-image.yml.tpl` | 新增 | image: 模式模板 |
| `deploy/dev-environment/docker-compose.instance.yml.tpl` | 修改 | 删除 VITE_API_URL 绝对路径 |
| `deploy/dev-environment/build-and-push.sh` | 新增 | 服务器构建+推送脚本 |
| `deploy/dev-environment/test-instance.sh` | 新增 | 分层测试脚本 |
| `deploy/dev-environment/create-instance.sh` | 修改 | 支持双模式 + 集成测试 |
| `.claude/commands/dev.md` | 修改 | Pre-flight check + tag 流程 + 测试报告 |

---

## 7. 决策日志

| 决策 | 选择 | 否决 | 理由 |
|------|------|------|------|
| Frontend API URL | 相对路径 + nginx proxy | 绝对 URL 构建时写入 | 镜像通用化是核心目标 |
| LiveKit URL 注入 | /api/config 运行时端点 | nginx envsubst in JS | API 端点更灵活、可扩展、不需要改 nginx |
| Tag 格式 | dev-YYYYMMDD-commit | 语义化版本 | dev 环境不需要 semver 复杂度，日期+commit 够用 |
| 构建位置 | 服务器 (标准化) | 本地 (保留但不推荐) | 避免 ARM→AMD64 交叉编译问题，服务器构建更快 |
| 测试策略 | 分层 3 层 | 只做 smoke test | 10s 多检查几项成本极低，但能发现真实问题 |
| 模板方式 | 两个独立模板 | 单模板 if/else | 简单直接，避免 shell 模板逻辑过复杂 |

---

## 8. 风险

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| /api/config 端点延迟导致前端白屏 | 低 | 高 | 加 loading state + fallback 到构建时值 |
| Docker Hub rate limit | 中 | 中 | 服务器本地缓存 + 只在版本变更时 pull |
| 测试脚本误报 (网络抖动) | 中 | 低 | 每个 check 允许 1 次 retry |
| Tag 忘记打 | 高 | 低 | /dev 的 pre-flight 自动检查并提示 |
