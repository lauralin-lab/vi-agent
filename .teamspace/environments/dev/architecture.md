# Dev Environment Architecture — 多租户隔离方案

> 设计日期: 2026-03-02
> 设计者: Casey + Claude Architect
> 状态: Approved

## 概述

在共享的 GCP VM (`vi-agent`, e2-standard-4) 上，为每个团队成员启动独立的 vi-agent 实例。
采用 **"共享基座 + 隔离应用"** 架构，在有限资源下最大化并发人数。

## 架构图

```
┌─────────────────── GCP: vi-agent (e2-standard-4, 4vCPU/16GB) ─────────────────┐
│                                                                                 │
│  ┌──────────── 共享基座 (vi-shared) ────────────┐                              │
│  │  postgres:5432  → DB per user (vi_casey, ...) │                              │
│  │  redis:6379     → prefix per user (casey:*)   │                              │
│  │  CPU: 0.75 / RAM: 1.75GB                      │                              │
│  └───────────────────────────────────────────────┘                              │
│       ▲              ▲              ▲                                            │
│  ┌────┴─────┐   ┌────┴─────┐   ┌────┴─────┐                                   │
│  │  casey   │   │  alice   │   │   bob    │                                    │
│  │  :31xx   │   │  :32xx   │   │  :33xx   │   ← compose project per user      │
│  │  main@a1 │   │  main@a1 │   │  feat@b2 │   ← branch@commit                │
│  │  1.5 CPU │   │  1.5 CPU │   │  1.5 CPU │   ← resource limits              │
│  └──────────┘   └──────────┘   └──────────┘                                    │
│                                                                                 │
│  /opt/vi-agent/registry.json   ← 运行时状态                                     │
│  /opt/vi-agent/instances/{name}/ ← 每人的 compose + .env                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 端口分配方案

每个用户分配一个 slot (1-9)，端口 = 3{slot}xx：

| 用户  | Slot | Frontend | API    | Gateway | Realtime |
|-------|------|----------|--------|---------|----------|
| slot1 | 1    | 3100     | 3101   | 3102    | 3103     |
| slot2 | 2    | 3200     | 3201   | 3202    | 3203     |
| slot3 | 3    | 3300     | 3301   | 3302    | 3303     |
| ...   | N    | 3N00     | 3N01   | 3N02    | 3N03     |

## 资源预算

| 组件 | CPU Limit | RAM Limit | 说明 |
|------|-----------|-----------|------|
| **共享 postgres** | 0.5 | 1.25GB | shared_buffers=512MB |
| **共享 redis** | 0.25 | 256MB | maxmemory=200mb |
| **系统/Docker** | — | 1GB | OS + Docker daemon |
| **每人 api-server** | 0.5 | 384MB | FastAPI + uvicorn |
| **每人 frontend** | 0.25 | 192MB | Nginx + static |
| **每人 gateway** | 0.25 | 384MB | Node.js |
| **每人 realtime** | 0.5 | 512MB | LiveKit agent |
| **每人合计** | 1.5 | 1.47GB | |
| **可容纳** | ~3 人 | ~4 人 | 留余量 → 建议最多 3 人 |

> 超过 3 人建议升级到 e2-standard-8 (8 vCPU / 32GB)，可承载 7+ 人。

## SSH 访问管理

### 引导流程

1. `/dev` skill 收集用户姓名和 SSH public key
2. Claude Code 通过管理员 SSH key (`~/.ssh/gcp_ssh_key`) 登录服务器
3. 同时通过两种方式添加 key:
   - `gcloud compute instances add-metadata` → GCP metadata (持久化)
   - 直接写 `~/.ssh/authorized_keys` → 即时生效
4. 用户验证 SSH 登录
5. 无需在 .env 中存储任何 root 密码

### 权限模型

- **管理员** (liyasong): 完整 sudo，可管理所有实例
- **开发者**: 可登录服务器，可管理自己的 compose stack，无 sudo

## Registry 设计

服务器端 `/opt/vi-agent/registry.json`:

```json
{
  "instances": {
    "casey": {
      "slot": 1,
      "ports": {
        "frontend": 3100,
        "api": 3101,
        "gateway": 3102,
        "realtime": 3103
      },
      "branch": "main",
      "commit": "abc1234",
      "version_tag": "",
      "deployed_at": "2026-03-02T15:30:00Z",
      "deployed_by": "casey",
      "status": "running"
    }
  },
  "shared": {
    "postgres_port": 5432,
    "redis_port": 6379,
    "status": "running"
  },
  "next_slot": 2,
  "server_ip": "34.56.23.173",
  "max_slots": 9
}
```

## 部署文件结构

```
/opt/vi-agent/
├── registry.json                    ← 全局注册表
├── repo/                            ← git clone of vi_agent
├── shared/
│   ├── docker-compose.yml           ← postgres + redis
│   └── .env
├── instances/
│   ├── casey/
│   │   ├── docker-compose.yml       ← 4 app services
│   │   └── .env                     ← casey 的 API keys + ports
│   ├── alice/
│   │   ├── docker-compose.yml
│   │   └── .env
│   └── ...
└── scripts/
    ├── setup-shared.sh              ← 初始化共享基座
    ├── create-instance.sh           ← 创建新用户实例
    ├── destroy-instance.sh          ← 销毁用户实例
    └── status.sh                    ← 查看所有实例状态
```

## 环境分层规划

| 环境 | 机器 | 策略 | 版本 |
|------|------|------|------|
| **dev** | vi-agent (当前) | 每人一个实例 | 任意分支 |
| **staging** | 另开 GCP 实例 | 多版本共存 | beta tags only |
| **production** | 独立 GCP 实例 | 单一稳定版 | release tags |

> staging 和 production 的多版本共存方案与 dev 类似，但不需要 SSH key 管理，
> 通过 CI/CD 自动部署。

## 关键决策记录

### ADR-001: 共享 postgres 而非独立实例
- **选择**: 共享 postgres，每人独立 database
- **拒绝**: 每人独立 postgres 容器
- **原因**: 每个 postgres 实例消耗 250-350MB，4 人 = 1.4GB；共享仅需 1.25GB 总计，省 40%

### ADR-002: 端口偏移而非反向代理
- **选择**: 固定端口偏移 (3{slot}xx)
- **拒绝**: Traefik/Nginx 反向代理 + subdomain
- **原因**: dev 环境不需要域名，端口直连最简单直接

### ADR-003: 管理员代添加 SSH key
- **选择**: Claude Code 通过现有 SSH key 添加
- **拒绝**: .env 中存 root 密码、自助注册服务、OS Login
- **原因**: 无需额外基础设施，安全性好，管理员有完整审计能力

### ADR-004: Docker Hub 镜像管理
- **选择**: Docker Hub (`collov/vi-agent-*`)
- **拒绝**: GCP Artifact Registry, GitHub Container Registry
- **原因**: 最通用，团队已有 Docker Hub 账号

### ADR-005: 镜像构建位置 — 可选
- **默认**: 从 Docker Hub 拉取预构建镜像（最快部署）
- **备选 A**: 在目标机器构建（首次部署/快速迭代），构建后自动 push 到 Hub
- **备选 B**: 本地构建 + push（需 `--platform linux/amd64` 交叉编译）
- **原因**: 不同场景需要不同策略。拉取最快，本地迭代时服务器构建最方便，正式版本可 CI 构建

### ADR-006: .env 中的 API Keys 来自用户本地
- **选择**: `/dev` 从用户本地项目 `.env` 读取 API keys，自动注入到服务器实例
- **拒绝**: 服务器共享 API keys、每次手动输入、密钥管理服务
- **原因**: 开发者本地 `.env` 已有全部 API keys（用于本地开发），直接复用最自然
- **安全**: 基础设施密钥（JWT_SECRET, POSTGRES_PASSWORD 等）自动生成，不从本地复制

### ADR-007: 版本标签策略
- **选择**: 开发阶段 branch-commit (如 `main-abc1234`)，发布用 semver (如 `v1.0.0`)
- **原因**: branch-commit 提供完整可追溯性，semver 用于正式版本管理
