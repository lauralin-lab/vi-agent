# VI Agent Platform — Architecture v5 (Phased)

> **核心原则**: 渐进式架构 — 每个阶段只解决当前阶段的问题，不提前支付复杂度税。
>
> **替代**: architecture-v4.md (过度设计，已废弃)
>
> **最后更新**: 2026-03-02
> **作者**: Casey + System Architect Review

---

## Executive Summary

VI Agent 是一个 To C 的实时 AI 伴侣产品。当前处于 **Demo 阶段**（0 用户，V0.1 未发布）。

本文档定义了从 Demo → 第一批用户 → 规模化增长的**三阶段渐进架构**。每个阶段有明确的触发条件——**不满足条件就不演进**，避免为想象中的问题设计解决方案。

**与 v4 的核心区别**:
- v4 试图一步到位设计 1,000-10,000 并发的架构 → v5 按阶段演进
- v4 在 0 用户时引入 MIG/Cloud SQL HA/RLS → v5 在满足触发条件后才引入
- v4 月成本 $413+ → v5 Phase 0 成本 $70
- v4 没有讨论 Firebase Auth → v5 将 Firebase 作为核心认证方案
- v4 没有分阶段 → v5 每个阶段有明确的进入/退出条件

---

## 1. Phase 0: Ship Demo (现在 → V0.1 发布)

### 1.1 目标

V0.1 的 3 个 Use Case 全链路跑通，给 Demo 用户（<50 人）稳定使用。

### 1.2 架构

```
                        Internet
                           │
                    ┌──────┴──────┐
                    │ GCE vi-agent │  e2-standard-4 (已有)
                    │              │  us-central1-c
                    │ ┌──────────────────────────────┐
                    │ │ docker-compose               │
                    │ │  ├─ nginx        (:80/:443)  │ ← SSL (Let's Encrypt)
                    │ │  ├─ frontend     (:5173 内部) │
                    │ │  ├─ api-server   (:8000 内部) │
                    │ │  ├─ vi-realtime  (LiveKit)   │
                    │ │  ├─ vi-gateway   (:18789内部) │
                    │ │  ├─ postgres     (:5432 内部) │
                    │ │  └─ redis        (:6379 内部) │
                    │ └──────────────────────────────┘
                    └─────────────┘
                          │
                    LiveKit Cloud (SFU)
```

**就是当前的架构。不改。**

### 1.3 环境

| 环境 | 机器 | 用途 | 部署方式 |
|------|------|------|---------|
| Dev | 本地 (`/dev`) | 开发调试 | `./dev.sh` |
| Demo | vi-agent GCE (已有) | Demo 展示 | `deploy.sh` (SSH + docker compose) |

### 1.4 CI/CD

```
开发者 → git push → GitHub Actions (ci.yml)
                        ├─ api-server: ruff + pytest ✓
                        ├─ gateway: type-check + eslint ✓
                        ├─ frontend: eslint + build ✓
                        └─ realtime: pytest ✓

合入 main 后 → 手动: ./deploy/deploy.sh → SSH → docker compose pull && up
```

**Phase 0 不需要自动部署。** 手动 deploy.sh 对 1-2 人团队 + Demo 阶段完全足够。

### 1.5 认证

保持现有自建 JWT（`auth.py`）。Firebase Auth 推迟到 Phase 1。

原因：V0.1 的优先级是 UC 全链路跑通，不是 Auth 重构。Demo 用户可以用邮箱注册。

### 1.6 数据库

- Docker PostgreSQL 16 + Docker Volume 持久化
- **备份**: GCE Daily Snapshot（Terraform `collov-vm` 模块已内置，14 天保留）
- 不需要 Cloud SQL、不需要 RLS、不需要 Memorystore
- 恢复方案：GCE snapshot 恢复 → docker compose up → 5 分钟内恢复

### 1.7 监控

- GCE Ops Agent（已配置）→ Cloud Monitoring 基本 CPU/内存/磁盘
- `docker compose logs -f` 排查问题
- 不需要 OpenTelemetry、不需要 Cloud Trace

### 1.8 成本

| 组件 | 月成本 |
|------|--------|
| GCE e2-standard-4 | $70 |
| GCE Snapshot (100GB) | $2 |
| LiveKit Cloud (Demo 用量) | $10-50 |
| LLM API (Demo 用量) | $50-200 |
| **总计** | **~$130-320/月** |

### 1.9 退出条件 → 进入 Phase 1

满足 **任一** 条件时开始 Phase 1 规划：

- [ ] V0.1 发布，准备接入真实用户（非 Demo）
- [ ] 需要 staging 环境做上线前验证
- [ ] 移动端 App 开发启动（需要 Firebase Auth + FCM 推送）
- [ ] 团队人数 > 2，需要更规范的部署流程

---

## 2. Phase 1: 第一批真实用户 (V0.1 → V0.2)

### 2.1 目标

支持 50-500 真实用户稳定使用。Staging + Production 双环境。Firebase Auth 集成。

### 2.2 架构

```
                        Internet
                           │
              ┌────────────┴────────────┐
              │                         │
     ┌────────┴────────┐      ┌────────┴────────┐
     │ GCE vi-agent     │      │ GCE vi-agent     │
     │ -staging         │      │ -production      │
     │ e2-standard-2    │      │ e2-standard-4    │
     │                  │      │                  │
     │ docker-compose   │      │ docker-compose   │
     │ (全栈, 独立 DB)   │      │ (全栈, 独立 DB)   │
     └─────────────────┘      └─────────────────┘
              │                         │
              └────────────┬────────────┘
                           │
                    LiveKit Cloud (SFU)
```

**两台独立 GCE，各自跑完整 docker-compose 栈（含 postgres/redis）。最简单的环境隔离。**

### 2.3 环境

| 环境 | 机器 | 规格 | 用途 | 部署触发 |
|------|------|------|------|---------|
| Dev | 本地 | — | 开发 | `./dev.sh` |
| Staging | vi-agent-staging | e2-standard-2 | 上线前验证 | 合入 main 自动部署 |
| Production | vi-agent-production | e2-standard-4 | 真实用户 | 手动审批后部署 |

### 2.4 gcp-compute-infra 集成

在 `gcp-compute-infra` 项目中用 `collov-vm` 模块创建两台实例：

```
gcp-compute-infra/
├── modules/collov-vm/          # 已有，复用
├── instances/
│   ├── vi-agent/               # 已有 → 改名为 vi-agent-production
│   ├── vi-agent-staging/       # 新增
│   │   ├── main.tf             # 用 collov-vm 模块
│   │   ├── outputs.tf
│   │   └── versions.tf
│   ├── nginx-service/          # 已有，不动
│   └── agentone-backend/       # 已有，不动
```

**Staging 实例配置**:

```hcl
module "vi-agent-staging" {
  source = "../../modules/collov-vm"

  project_id    = "excellent-nexus-488404-c8"
  instance_name = "vi-agent-staging"
  machine_type  = "e2-standard-2"    # 比 production 小
  disk_size_gb  = 50                 # 比 production 小
  environment   = "staging"
  zone          = "us-central1-c"
  # ... 其他配置
}
```

### 2.5 CI/CD Pipeline

**一条 workflow，两个环境**:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    # ... 现有 ci.yml 的测试步骤

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Build all images
      - run: |
          docker compose build

      # Push to Artifact Registry
      - run: |
          for svc in api-server vi-realtime vi-gateway frontend; do
            docker tag vi_agent-$svc $REGISTRY/$svc:${{ github.sha }}
            docker push $REGISTRY/$svc:${{ github.sha }}
          done

      # Deploy to staging via SSH
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: deploy
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/vi-agent
            export IMAGE_TAG=${{ github.sha }}
            docker compose pull
            docker compose up -d
            sleep 10
            curl -f http://localhost:8000/health

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production          # ← GitHub Environment (需要手动审批)
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PRODUCTION_HOST }}
          username: deploy
          key: ${{ secrets.PRODUCTION_SSH_KEY }}
          script: |
            cd /opt/vi-agent
            export IMAGE_TAG=${{ github.sha }}
            docker compose pull
            docker compose up -d
            sleep 10
            curl -f http://localhost:8000/health
```

```
流程:
  git push main → test → deploy staging (自动)
                              ↓
                       staging 验证通过
                              ↓
                  deploy production (手动审批 via GitHub Environment)
```

### 2.6 Firebase Auth 集成

#### 2.6.1 为什么现在做

- 移动端 App 需要 Firebase Cloud Messaging (FCM) 做推送通知
- Firebase SDK 已在客户端 → Firebase Auth 是零额外依赖
- 自建 auth 不支持 Google/Apple 社交登录，对 To C 产品是短板
- 自建密码管理（bcrypt hash, 密码重置）是维护负担

#### 2.6.2 架构

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│  Mobile App   │     │  Firebase       │     │  api-server       │
│               │     │                 │     │                   │
│ Firebase SDK  │────►│  Auth           │     │  deps.py:         │
│ (Auth + FCM)  │     │  (Google/Apple/ │     │  verify_id_token()│
│               │     │   Email/Phone/  │     │                   │
│               │◄────│   Anonymous)    │     │                   │
│               │     └────────────────┘     │                   │
│               │                             │                   │
│               │──── Firebase ID Token ─────►│  → firebase_uid   │
│               │                             │  → lookup users   │
│               │◄─── API Response ──────────│  → auto-create    │
│               │                             │                   │
│               │     ┌────────────────┐     │                   │
│               │◄────│  FCM            │◄────│  firebase_admin   │
│  Push通知     │     │  (Push)         │     │  .messaging.send()│
└──────────────┘     └────────────────┘     └──────────────────┘
```

#### 2.6.3 代码变更

**删除**:
- `api-server/app/routes/auth.py` — signup/login 端点（Firebase 处理）
- `api-server/app/services/user_center.py` — `hash_password()`, `verify_password()`
- `PyJWT` 依赖（token 验证改用 firebase_admin）
- `bcrypt` / `passlib` 依赖

**新增**:
- `firebase_admin` 依赖
- `api-server/app/services/firebase_auth.py` — Firebase token 验证

**修改**:
- `api-server/app/deps.py`:

```python
# 之前 (自建 JWT):
async def get_current_user(credentials, db) -> User:
    payload = decode_access_token(token)      # PyJWT 解码
    user_id = payload.get("sub")              # UUID
    user = await db.get(User, user_id)
    return user

# 之后 (Firebase Auth):
import firebase_admin.auth as firebase_auth

async def get_current_user(credentials, db) -> User:
    decoded = firebase_auth.verify_id_token(token)  # Firebase 验证
    firebase_uid = decoded["uid"]                     # Firebase UID
    user = await get_or_create_user(db, firebase_uid, decoded)
    return user

async def get_or_create_user(db, firebase_uid, decoded_token) -> User:
    """查找或自动创建用户。首次 Firebase 登录自动建 PostgreSQL 记录。"""
    result = await db.execute(
        select(User).where(User.firebase_uid == firebase_uid)
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    # 首次登录，自动创建
    user = User(
        firebase_uid=firebase_uid,
        email=decoded_token.get("email", ""),
        display_name=decoded_token.get("name", ""),
        vi_user_id=generate_vi_user_id(),
    )
    db.add(user)
    await db.commit()
    return user
```

- `api-server/app/models.py` — User 模型:

```python
class User(Base):
    __tablename__ = "users"

    id = Column(UUID, primary_key=True, default=uuid.uuid4)
    firebase_uid = Column(String(128), unique=True, index=True)  # 新增
    email = Column(String(255), index=True)                      # 保留，不再 unique+notnull
    # password_hash 删除
    vi_user_id = Column(String(64), unique=True, nullable=False, index=True)
    display_name = Column(String(100))
    fcm_token = Column(String(255))                              # 新增: 推送 token
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime)
    is_active = Column(Boolean, default=True)
```

- `api-server/app/routes/auth.py` — 简化为:

```python
@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    """获取当前用户信息。认证由 Firebase ID Token 处理。"""
    return UserResponse(...)

@router.post("/fcm-token")
async def update_fcm_token(
    req: FCMTokenRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """客户端注册/更新 FCM 推送 token。"""
    user.fcm_token = req.token
    await db.commit()
```

#### 2.6.4 设备匿名认证

Firebase 内置 Anonymous Auth，替代当前的 `X-Device-Id` 方案：

```
当前:   X-Device-Id: abc123 → vi-{abc123[:16]} → 自动创建匿名用户
Firebase: Firebase Anonymous Auth → firebase_uid → 自动创建匿名用户
         后续可以 "升级" 为 Email/Google 账号 (Firebase 内置支持)
```

#### 2.6.5 服务间认证

**不变**。`X-Internal-Token` 保持用于 vi-realtime → api-server、vi-gateway → api-server 的内部通信。Firebase Auth 只负责用户端认证。

```
用户端:    Firebase ID Token → api-server (verify_id_token)
服务间:    X-Internal-Token → api-server (verify_internal_token)
```

### 2.7 数据库

- 仍然是 Docker PostgreSQL（每台 GCE 独立实例）
- Staging 和 Production 数据完全隔离（不同机器，不同 Docker volume）
- **新增**: Alembic migration（完成 T-053，Phase 1 必须）
- **新增**: 基本索引

```sql
-- Phase 1 必须的索引
CREATE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_memories_user_layer ON agent_memories (user_id, layer);
CREATE INDEX idx_sessions_user_created ON sessions (user_id, created_at DESC);
```

- 备份: GCE Daily Snapshot（Terraform 自动配置）
- 不需要 Cloud SQL、不需要 RLS

### 2.8 监控

- Cloud Monitoring（Ops Agent 已有）— CPU / 内存 / 磁盘
- Cloud Logging — 结构化日志（JSON 格式）
- **新增**: 简单告警

```
Alert: GCE CPU > 80% 持续 5 分钟 → Slack 通知
Alert: /health 返回非 200 → Slack 通知
Alert: 日 LLM API 费用 > $50 → Slack 通知
```

- 不需要 OpenTelemetry、Cloud Trace、自定义 Dashboard

### 2.9 成本

| 组件 | 月成本 |
|------|--------|
| GCE Production (e2-standard-4) | $70 |
| GCE Staging (e2-standard-2) | $35 |
| GCE Snapshots | $4 |
| Artifact Registry (~5GB) | $3 |
| LiveKit Cloud (50-500 用户) | $100-500 |
| LLM API (50-500 用户) | $500-5,000 |
| Firebase (Auth + FCM, 免费层) | $0 |
| **基础设施总计** | **~$112/月** |
| **含 API 总计** | **~$712-5,612/月** |

### 2.10 退出条件 → 进入 Phase 2

满足 **任一** 条件时开始 Phase 2 规划：

- [ ] Production GCE CPU 持续 > 70%（单机到顶了）
- [ ] PostgreSQL 连接数 > 80 或查询延迟 p99 > 500ms
- [ ] 需要多实例水平扩展（用户 > 500）
- [ ] 数据量要求独立数据库管理（备份/恢复/扩容）
- [ ] 安全审计要求 RLS 或更强的隔离

---

## 3. Phase 2: 规模化增长 (>500 用户)

### 3.1 目标

支持 500-5,000 用户。水平扩展。托管数据库。

### 3.2 架构

```
                              Internet
                                 │
                    ┌────────────┴────────────┐
                    │  Global Load Balancer    │
                    │  + Cloud CDN (前端)       │
                    │  + Google-managed SSL    │
                    └──┬────────┬─────────────┘
                       │        │
              /static/* │  /api/* │
                       ▼        ▼
               ┌──────────┐ ┌──────────────────────────────────┐
               │ GCS      │ │  GCE Managed Instance Group     │
               │ Bucket   │ │  2-N x e2-standard-4             │
               │ (React)  │ │  ┌─────────────────────────────┐ │
               └──────────┘ │  │ docker-compose (无 DB)       │ │
                            │  │  ├─ api-server (:8000)      │ │
                            │  │  ├─ vi-gateway (:18789)     │ │
                            │  │  ├─ vi-realtime (worker)    │ │
                            │  │  └─ nginx (reverse proxy)   │ │
                            │  └──────┬──────────┬───────────┘ │
                            └─────────┼──────────┼─────────────┘
                                      │          │
                         ┌────────────┘          └──────────────┐
                         ▼                                       ▼
                  ┌──────────────┐                       ┌──────────────┐
                  │ Cloud SQL    │                       │ Memorystore  │
                  │ PostgreSQL   │                       │ Redis        │
                  │ (Private IP) │                       │ (Private IP) │
                  └──────────────┘                       └──────────────┘
```

### 3.3 Phase 2 新增内容

| 组件 | Phase 1 | Phase 2 | 触发条件 |
|------|---------|---------|---------|
| 数据库 | Docker PostgreSQL | Cloud SQL | 连接数/延迟到顶 |
| 缓存 | Docker Redis | Memorystore | 需要跨实例共享 |
| 计算 | 单台 GCE | MIG (2-N 台) | CPU > 70% |
| 前端 | Nginx container | GCS + CDN | 有海外用户 |
| SSL | Let's Encrypt | Google-managed | 用 Load Balancer 时自动 |
| 部署 | SSH deploy | MIG rolling update | 有 MIG 后自然切换 |
| DB 安全 | WHERE user_id = ? | + PostgreSQL RLS | 安全审计要求 |
| 速率限制 | per-IP (slowapi) | per-user (tenant key) | 有付费/免费区分 |
| 成本控制 | — | per-user LLM 日限额 | 用户量大，需要控成本 |
| 密钥管理 | .env 文件 | GCP Secret Manager | 多实例共享密钥 |
| 网络 | 默认 VPC | 自定义 VPC + 防火墙 | Cloud SQL 要求 |

### 3.4 数据库迁移路径 (Docker → Cloud SQL)

```
1. gcp-compute-infra 中创建 Cloud SQL 实例 (Terraform)
2. pg_dump 从 Docker PostgreSQL 导出
3. pg_restore 到 Cloud SQL
4. 修改 docker-compose: 删除 postgres service, DATABASE_URL 指向 Cloud SQL
5. 验证 → 切换 DNS/流量
6. 回滚方案: DATABASE_URL 改回 Docker PostgreSQL
```

### 3.5 MIG 迁移路径 (单台 GCE → MIG)

```
1. docker-compose.yml 删除 postgres/redis (已迁移到托管服务)
2. 创建 GCE Instance Template (包含 startup script)
3. 创建 MIG (min=2, max=N, autoscaler CPU target=70%)
4. 创建 Load Balancer, 指向 MIG
5. 配置 health check (/health 端点)
6. 切换 DNS
7. 删除原单台 GCE
```

### 3.6 成本估算

| 组件 | 月成本 |
|------|--------|
| GCE MIG (2 台 baseline) | $140 |
| Cloud SQL (non-HA 起步) | $65 |
| Memorystore (1GB) | $35 |
| Load Balancer + CDN | $30 |
| GCS (前端) | $2 |
| Artifact Registry | $5 |
| Secret Manager | $1 |
| Cloud NAT | $15 |
| 监控 | $20 |
| **基础设施总计** | **~$313/月** |

---

## 4. 认证架构 (跨阶段)

### 4.1 演进路线

```
Phase 0 (Demo):     自建 JWT (PyJWT + bcrypt)
                     ↓  V0.1 发布后
Phase 1 (用户):     Firebase Auth (替代自建 JWT)
                     + Firebase Anonymous Auth (替代 X-Device-Id)
                     + Firebase Cloud Messaging (推送通知)
                     ↓  不变
Phase 2 (规模化):   Firebase Auth (不变)
                     + 可选: Firebase App Check (防滥用)
```

### 4.2 认证矩阵

| 场景 | Phase 0 | Phase 1+ |
|------|---------|----------|
| 邮箱注册/登录 | 自建 JWT | Firebase Email/Password |
| 社交登录 | 不支持 | Firebase Google/Apple Sign-In |
| 匿名访问 | X-Device-Id | Firebase Anonymous Auth |
| 手机号登录 | 不支持 | Firebase Phone Auth |
| 服务间通信 | X-Internal-Token | X-Internal-Token (不变) |
| Token 格式 | 自签 JWT (HS256) | Firebase ID Token (RS256) |
| Token 验证 | PyJWT decode | firebase_admin.verify_id_token() |
| 密码存储 | bcrypt in PostgreSQL | Firebase 管理 (不存本地) |
| 推送通知 | 不支持 | FCM (同一 Firebase 项目) |

### 4.3 Firebase 项目配置

```
Firebase Project: vi-agent (或 collov-vi-agent)
├── Authentication
│   ├── Email/Password  ← 启用
│   ├── Google          ← 启用
│   ├── Apple           ← 启用 (iOS App Store 要求)
│   ├── Anonymous       ← 启用 (替代 X-Device-Id)
│   └── Phone           ← 可选
├── Cloud Messaging (FCM)
│   ├── iOS: APNs 证书
│   └── Android: 自动配置
└── (不使用其他 Firebase 服务 — 不用 Firestore/Functions/Hosting)
```

### 4.4 为什么不是 "Firebase + 自建 JWT" 双层

| 方案 | 架构 | 问题 |
|------|------|------|
| ❌ 双层 | Firebase 发 token → api-server 再签自己的 JWT → 用自签 JWT 访问 API | 多此一举。Firebase ID Token 本身就是 JWT。重签一个没有任何额外价值，反而增加延迟和复杂度。 |
| ✅ 直接验证 | Firebase 发 token → api-server 直接验证 Firebase ID Token | 简洁。Firebase ID Token 包含 uid、email、provider 等信息，直接可用。 |

---

## 5. 数据库架构 (跨阶段)

### 5.1 隔离策略

```
Phase 0-1: 共享 PostgreSQL + WHERE user_id = ?
           ← To C 消费产品的标准做法 (ChatGPT/Claude 模式)

Phase 2:   + PostgreSQL RLS (如果安全审计要求)
           + 字段级加密 (如果有敏感数据合规要求)

终态:      如果走 To B 企业版 → Schema-per-tenant
           如果纯 To C → 永远共享 DB + 逻辑隔离
```

### 5.2 为什么不做 "用户独立数据库"

对 To C 产品，database-per-user 是不现实的：

| 维度 | 共享 DB | 用户独立 DB |
|------|---------|------------|
| 500 用户运维 | 1 个数据库 | 500 个数据库 |
| Schema 迁移 | 1 次 `alembic upgrade` | 500 次 |
| 连接池 | 1 个池 | 500 个池 (不可能) |
| 备份恢复 | 1 次操作 | 500 次操作 |
| 成本 | 1 个 Cloud SQL | 500 个 (破产) |
| 隐私保护 | 应用层 + 磁盘加密 | 物理隔离 |

**结论**: 隐私通过 **应用层 access control + Cloud SQL 磁盘加密 + 可选字段加密** 解决。物理隔离只在 B2B 企业版（合规强制要求）时才值得。

### 5.3 Phase 1 Schema 变更

```sql
-- Alembic migration: Firebase Auth 集成
ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) UNIQUE;
ALTER TABLE users ADD COLUMN fcm_token VARCHAR(255);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
-- password_hash 保留字段但不再写入，后续版本删除

CREATE INDEX idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX idx_memories_user_layer ON agent_memories (user_id, layer);
CREATE INDEX idx_sessions_user_created ON sessions (user_id, created_at DESC);
```

---

## 6. 前后端分离 & 平台化

### 6.1 当前状态

api-server 身兼两职：
- **平台职能**: 用户认证、用户管理
- **业务职能**: Session 管理、记忆系统、文件上传、内部 API

### 6.2 策略：代码分层，不拆服务

```
Phase 0-1: 代码内模块化 (成本低，效果好)

api-server/app/
├── platform/                    # 平台层 (Phase 1 重构)
│   ├── auth.py                  # Firebase Auth 验证
│   ├── user_service.py          # 用户 CRUD
│   └── push_service.py          # FCM 推送
├── product/                     # 业务层
│   ├── routes/
│   │   ├── sessions.py          # Session CRUD
│   │   ├── memory.py            # 记忆管理
│   │   ├── upload.py            # 文件上传
│   │   └── internal.py          # 服务间 API
│   └── services/
│       ├── memory_center.py     # 记忆系统
│       ├── session_center.py    # Session 生命周期
│       └── events.py            # SSE 事件
├── models.py                    # 所有模型
├── config.py                    # 配置
├── deps.py                      # 依赖注入
└── main.py                      # 入口

Phase 2+: 如果需要多产品共享用户体系 → 拆出 platform 为独立服务
          如果只有 VI Agent 一个产品 → 不拆，保持模块化
```

### 6.3 为什么现在不拆服务

- 团队 1-2 人，管 4 个服务已经够多了，加第 5 个是负担
- 拆服务 = 新的部署 pipeline + 服务发现 + 跨服务事务
- 模块化 = 改目录结构，零运维成本
- **拆服务的信号**: 有第二个产品需要共享 platform 层

---

## 7. 密钥管理 (跨阶段)

| Phase | 方案 | 密钥位置 |
|-------|------|---------|
| 0 | `.env` 文件 | GCE 磁盘上，不进 git |
| 1 | `.env` 文件 (per 环境) | Staging .env / Production .env |
| 2 | GCP Secret Manager | Terraform 管理，Workload Identity 访问 |

Phase 0-1 不需要 Secret Manager。`.env` + `.gitignore` + GCE 磁盘加密已足够。

---

## 8. 决策日志

| # | 决策 | 选择 | 拒绝 | 原因 |
|---|------|------|------|------|
| D1 | 环境隔离 | 独立 GCE (staging/production) | 同机不同端口 / Docker profile | 独立 GCE 隔离最干净，Terraform 管理成本低，crash 互不影响 |
| D2 | 认证 | Firebase Auth (Phase 1) | 继续自建 JWT / Firebase+自建双层 | 已需要 Firebase (FCM 推送)，Auth 是免费附赠。双层方案多此一举 |
| D3 | 数据库隔离 | 共享 DB + 应用层隔离 | DB-per-user / Schema-per-tenant | To C 产品标准做法，500 个独立 DB 不现实 |
| D4 | 前后端分离 | 代码模块化，不拆服务 | 拆出 platform 微服务 | 1-2 人团队已管 4 服务，不加第 5 个。模块化零成本 |
| D5 | CI/CD | 1 条 workflow + SSH deploy | 4 条 pipeline + MIG rolling update | 单机上 rolling update = 重启。不给重启穿 MIG 的外衣 |
| D6 | 数据库 | Docker PostgreSQL + GCE Snapshot | Cloud SQL HA | 0-500 用户 Docker PG 足够，Cloud SQL HA $130/月是为 0 用户付税 |
| D7 | Redis | Docker Redis | Memorystore HA | 本地 Redis 对 context cache + pub/sub 完美运行，无需托管服务 |
| D8 | 前端部署 | Nginx container | GCS + CDN | Demo 用户在同一地理区域，CDN 延迟优化无意义 |
| D9 | 监控 | Ops Agent + Cloud Monitoring | OpenTelemetry + Cloud Trace | 先用 GCP 自带的，够用了。有具体性能问题再加 tracing |
| D10 | IaC | gcp-compute-infra (Terraform) | 手动 GCP Console | 已有 Terraform 基础，复用 collov-vm 模块 |

---

## 9. 风险登记

| # | 风险 | 可能性 | 影响 | 缓解 | Phase |
|---|------|--------|------|------|-------|
| R1 | 单台 GCE 宕机 | 中 | 中 | GCE auto-restart + SSH 修复 (Demo 可接受 5min 恢复) | 0 |
| R2 | Docker PG 数据丢失 | 低 | 高 | GCE Daily Snapshot (14 天保留) + Volume 持久化 | 0-1 |
| R3 | Firebase Auth 依赖 | 低 | 中 | Firebase Auth 是 Google 核心服务，SLA 99.95%。且可回退自建 JWT | 1 |
| R4 | LLM API 成本失控 | 中 | 中 | Phase 1: 日志监控。Phase 2: per-user 日限额 | 1-2 |
| R5 | 单机性能瓶颈 | 中 | 中 | 监控 CPU/内存，达到阈值触发 Phase 2 (MIG) | 1 |
| R6 | IDOR 漏洞 (跨用户数据) | 中 | 高 | Phase 0: 修复 SessionCenter user_id 验证 (3 行代码) | 0 |

---

## 10. 实施路线图

### Phase 0 任务 (现在 → V0.1)

| 序号 | 任务 | 依赖 | 估时 |
|------|------|------|------|
| 0.1 | 完成 V0.1 的 3 个 UC (T-056, T-057, T-058) | — | L |
| 0.2 | 修复 SessionCenter IDOR 漏洞 | — | S |
| 0.3 | 完成 Alembic migration setup (T-053) | — | S |
| 0.4 | 清理 stale worktree + 垃圾文件 | — | S |

### Phase 1 任务 (V0.1 后)

| 序号 | 任务 | 依赖 | 估时 |
|------|------|------|------|
| 1.1 | gcp-compute-infra: 用 collov-vm 创建 staging 实例 | — | S |
| 1.2 | 配置 staging docker-compose + .env | 1.1 | S |
| 1.3 | GitHub Actions: 1 条 deploy workflow (staging 自动 + prod 审批) | 1.2 | M |
| 1.4 | 创建 Firebase 项目, 配置 Auth providers | — | S |
| 1.5 | api-server: 集成 Firebase Auth (替代自建 JWT) | 1.4 | M |
| 1.6 | api-server: 代码模块化 (platform/ + product/) | 1.5 | M |
| 1.7 | 移动端: 集成 Firebase Auth SDK + FCM | 1.4 | M |
| 1.8 | 添加数据库索引 + Schema migration | 1.5 | S |
| 1.9 | 配置 Cloud Monitoring 告警 (CPU/health/cost) | 1.2 | S |

### Phase 2 任务 (触发条件满足后)

| 序号 | 任务 | 估时 |
|------|------|------|
| 2.1 | 迁移 PostgreSQL → Cloud SQL | M |
| 2.2 | 迁移 Redis → Memorystore | M |
| 2.3 | 创建 MIG + Load Balancer | L |
| 2.4 | 前端迁移到 GCS + CDN | M |
| 2.5 | 密钥迁移到 Secret Manager | S |
| 2.6 | 实现 PostgreSQL RLS | M |
| 2.7 | 实现 per-user LLM 成本控制 | M |

---

## Appendix A: 与 v4 的对照

| 维度 | v4 | v5 | 变化原因 |
|------|-----|-----|---------|
| 方法论 | 一步到位 | 三阶段渐进 | 不为 0 用户设计万人架构 |
| Phase 0 成本 | $413/月 | $70/月 | 省 $343/月 × 直到真正需要 |
| 环境 | Staging + Production (复杂) | Demo 单机 → 双机 → MIG | 按需演进 |
| 认证 | 未讨论 | Firebase Auth 全链路 | 已需要 Firebase (FCM) |
| 数据库 | Cloud SQL HA 起步 | Docker PG → Cloud SQL | 先免费后付费 |
| CI/CD | 4 条 Pipeline | 1 条 → 按需扩展 | 单机上 4 条 Pipeline 无意义 |
| 安全 | RLS + ACL + WAF | 修 IDOR + 应用层隔离 | 解决真实风险而非想象风险 |
| 前端 | GCS + CDN | Nginx container → GCS | 无海外用户不需要 CDN |
| 监控 | Full stack (OTel + Trace) | Ops Agent + 简单告警 | 先解决可观测性基础 |

---

*VI Agent Platform Architecture v5 | 2026-03-02*
*渐进式架构 — 每个阶段只支付当前阶段的复杂度税*
