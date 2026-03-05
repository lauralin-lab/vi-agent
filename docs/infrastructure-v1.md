# VI Agent — Infrastructure v1

> **核心原则**: 遵循 architecture-v5 / v7 的 A6 公理 — 不为假想问题付复杂度税。
>
> **替代**: gcp-cicd drive contract (未执行), architecture-v5.md §2.4 gcp-compute-infra 集成 (过时)
>
> **前置文档**: architecture-v5.md (部署架构), architecture-v7.md (应用架构)
>
> **日期**: 2026-03-05
>
> **作者**: Li Ya + Claude Architect Review
>
> **讨论记录**: `_project/sessions/2026-03-05-A.md`

---

## Executive Summary

本文档定义 VI Agent 的基础设施管理方案。将 Terraform IaC 纳入 vi_agent monorepo，修复现有安全漏洞，统一 dev/staging/prod 三环境的部署模式。

**当前阶段**: 共享 VM + 安全加固 + Terraform 基础
**未来演进**: 团队 >8 人或需要弹性扩缩时，迁移到 GKE Autopilot + ArgoCD + Kustomize

**与之前方案的区别**:
- gcp-cicd contract (v4 时期): 8 个 Terraform 模块、Cloud SQL、Memorystore → 从未执行，已废弃
- architecture-v5 §2.4: 依赖外部 `gcp-compute-infra` 仓库 → 改为 monorepo 内置
- 当前 dev.sh: 518 行 shell scripts + SCP 传密钥 → 简化为触发器 + GitHub Actions

---

## 0. 设计公理

继承 architecture-v7 的 A6 公理，并增加基础设施专属原则：

| # | 公理 | 推论 |
|---|------|------|
| **I1** | 基础设施代码和应用代码同仓库 | Terraform 在 `infra/`，和 api-server/ 同一个 PR 可以一起改 |
| **I2** | 一套代码管所有环境 | dev/staging/prod 的差异仅在变量，不在结构 |
| **I3** | Secrets 不经过本地磁盘传输 | GitHub Environment Secrets → CI/CD 注入。不 SCP，不 commit |
| **I4** | Terraform state 必须远程 + 加锁 | GCS backend，任何人 apply 都安全 |
| **I5** | 每个演进必须有触发条件 | K8s 迁移条件明确定义，不满足就不动 |

---

## 1. 现状诊断

### 1.1 安全审计结果 (2026-03-05)

| 严重度 | 数量 | 关键问题 |
|--------|------|---------|
| **CRITICAL** | 5 | `.env` 真实 API keys 已提交 git; SSH agent forwarding (-A); 硬编码 server IP; SCP 明文传密钥; 服务器 .env 明文存储 |
| **HIGH** | 11 | postgres/redis 绑 0.0.0.0 暴露; 弱默认密码 (`vi_shared_dev`); docker group 提权; 无网络隔离; deploy key 暴露 |
| **MEDIUM** | 6 | 无输入验证; 无 secret 轮换; env vars 可 docker inspect 查看 |
| **LOW** | 3 | 未认证 health 端点; admin SQL 注入风险; 无审计日志 |

> **紧急行动**: 轮换所有已泄露的 API keys (LIVEKIT_API_SECRET, GOOGLE_API_KEY, ANTHROPIC_API_KEY)，
> 并用 `git filter-repo` 清除 git 历史中的 `.env` 文件。

### 1.2 基础设施碎片化

```
┌─── 问题: 4 个不协调的层 ─────────────────────────────────────────┐
│                                                                     │
│  1. gcp-compute-infra/       外部 Terraform 仓库 (VM 定义)         │
│     ⛔ vi-agent dev 实例不用 collov-vm 模块 (手写 raw resource)     │
│     ⛔ 9 把 SSH key 硬编码在 main.tf                                │
│     ⛔ 所有 tfstate 本地存储, 无远程后端, 无锁定                     │
│                                                                     │
│  2. google-cloud-infra/      另一个外部 TF 仓库 (内部服务)          │
│     Authentik SSO + NetBird VPN, 和 vi-agent 无直接关系             │
│     同样本地 tfstate                                                │
│                                                                     │
│  3. vi_agent/deploy/         Shell scripts (应用部署)               │
│     dev.sh (518 行), create-instance.sh, setup-new-env.sh          │
│     ⛔ SCP 传 API keys, registry.json 单点状态                      │
│                                                                     │
│  4. vi_agent/.github/        GitHub Actions CI/CD                   │
│     deploy.yml (build → push → SSH deploy)                         │
│     ⛔ staging/prod secrets 未配置, 未实际跑通                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 现有 GCP 资源清单

| 资源 | 实例名 | 规格 | IP | 状态 | Terraform |
|------|--------|------|-----|------|-----------|
| GCE VM | vi-agent | e2-standard-8 | 34.172.9.61 | running (dev) | raw resource (不用模块) |
| GCE VM | vi-agent-staging | e2-standard-2 | 34.68.86.220 | created (未部署应用) | collov-vm 模块 |
| GCE VM | vi-agent-prod | e2-standard-4 | 34.136.53.132 | created (未部署应用) | collov-vm 模块 |
| Static IP | vi-agent-ip | — | 34.172.9.61 | in use | ✅ |
| Static IP | vi-agent-staging-ip | — | 34.68.86.220 | reserved | ✅ |
| Static IP | vi-agent-prod-ip | — | 34.136.53.132 | reserved | ✅ |
| Snapshot Policy | default-schedule-* | daily 15:00, 14d | — | active | collov-vm 模块 |

GCP Project: `excellent-nexus-488404-c8`
Region/Zone: `us-central1` / `us-central1-c`
Service Account: `581281752709-compute@developer.gserviceaccount.com`

---

## 2. Phase 0: 安全加固 + Terraform 基础 (现在)

### 2.1 目标

修复所有 CRITICAL/HIGH 安全漏洞，将 vi-agent 的 Terraform 迁入 monorepo，建立远程 state。

### 2.2 Terraform 目录结构

```
vi_agent/
├── infra/
│   ├── modules/
│   │   └── vi-agent-vm/              # 从 collov-vm 提取，针对 vi-agent 简化
│   │       ├── main.tf               # GCE instance + snapshot + ops agent
│   │       ├── variables.tf
│   │       └── outputs.tf
│   │
│   ├── environments/
│   │   ├── dev/
│   │   │   ├── main.tf               # 1 × e2-standard-8 共享 VM
│   │   │   ├── variables.tf
│   │   │   ├── terraform.tfvars      # dev 专属变量 (NOT committed, .gitignore)
│   │   │   ├── terraform.tfvars.example
│   │   │   └── backend.tf            # GCS remote state
│   │   ├── staging/
│   │   │   ├── main.tf               # 1 × e2-standard-2
│   │   │   ├── variables.tf
│   │   │   ├── terraform.tfvars.example
│   │   │   └── backend.tf
│   │   └── prod/
│   │       ├── main.tf               # 1 × e2-standard-4
│   │       ├── variables.tf
│   │       ├── terraform.tfvars.example
│   │       └── backend.tf
│   │
│   └── shared/
│       └── firewall.tf               # 共享防火墙规则
│
├── api-server/
├── frontend/
├── nanoclaw/
├── realtime/
├── deploy/                           # 保留, 逐步迁移
└── .github/workflows/
    ├── ci.yml                        # 已有
    ├── deploy.yml                    # 已有 → 改进
    └── infra.yml                     # 新增: terraform plan/apply
```

### 2.3 GCS Remote State

```hcl
# infra/environments/dev/backend.tf
terraform {
  backend "gcs" {
    bucket = "vi-agent-tfstate"
    prefix = "dev"
  }
}

# infra/environments/staging/backend.tf
terraform {
  backend "gcs" {
    bucket = "vi-agent-tfstate"
    prefix = "staging"
  }
}

# infra/environments/prod/backend.tf
terraform {
  backend "gcs" {
    bucket = "vi-agent-tfstate"
    prefix = "prod"
  }
}
```

GCS bucket `vi-agent-tfstate`:
- 版本控制 (versioning) 启用 → state 可回滚
- 自动加密 (Google-managed key)
- State locking 由 GCS backend 原生支持
- Bucket 创建用一次性 `gcloud` 命令 (不用 Terraform 管自己的 state bucket)

### 2.4 安全加固 (逐条修复)

#### 2.4.1 SSH Key 管理: 硬编码 → OS Login

**现状**: 9 把 SSH public key 硬编码在 `gcp-compute-infra/instances/vi-agent/main.tf:42-53`

**目标**: 使用 GCP OS Login，IAM 控制谁能 SSH

```hcl
# infra/modules/vi-agent-vm/main.tf
resource "google_compute_instance" "this" {
  # ...
  metadata = {
    enable-osconfig = "TRUE"
    enable-oslogin  = "TRUE"    # ← 关键: 启用 OS Login
  }
  # 不再有 ssh-keys metadata
}

# IAM: 授权团队成员 SSH 访问
resource "google_project_iam_member" "os_login" {
  for_each = toset(var.ssh_users)

  project = var.project_id
  role    = "roles/compute.osLogin"
  member  = each.value    # "user:casey@collov.com"
}
```

**效果**:
- `gcloud compute ssh vi-agent --zone=us-central1-c` 即可登录
- 离职 → 从 IAM 移除 → 立即失去访问
- 不需要在 Terraform 里管理 SSH 公钥

#### 2.4.2 Secrets 管理: SCP → GitHub Environment Secrets

**现状**: dev.sh 第 442-446 行从本地 `.env` SCP 到服务器

**目标**: Secrets 存在 GitHub Environment Settings，CI/CD 注入

```
GitHub Settings → Environments:
  dev       → LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
               GOOGLE_API_KEY, ANTHROPIC_API_KEY, GCS_BUCKET,
               POSTGRES_PASSWORD, JWT_SECRET, REDIS_PASSWORD
  staging   → (同上, 不同值)
  prod      → (同上, 不同值)
```

**deploy.yml 注入流程**:
```yaml
- name: Deploy via SSH
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ${{ secrets.DEPLOY_USER }}
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    script: |
      cd /opt/vi-agent
      # 写 .env (值来自 GitHub Secrets, 不经过本地)
      cat > .env << 'ENVEOF'
      LIVEKIT_URL=${{ secrets.LIVEKIT_URL }}
      LIVEKIT_API_KEY=${{ secrets.LIVEKIT_API_KEY }}
      LIVEKIT_API_SECRET=${{ secrets.LIVEKIT_API_SECRET }}
      GOOGLE_API_KEY=${{ secrets.GOOGLE_API_KEY }}
      ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
      # ... 其他 keys
      ENVEOF
      chmod 600 .env
      docker compose pull
      docker compose up -d
```

**Dev 环境特殊处理**: 共享一套 dev API keys (GitHub Environment `dev`)。新人 `/dev` 不需要配任何 key。

#### 2.4.3 网络暴露: 0.0.0.0 → 127.0.0.1 + Terraform 防火墙

**现状**:
- `docker-compose.shared.yml:10-11`: postgres `"5432:5432"`, redis `"6379:6379"` 绑 0.0.0.0
- GCE 标签 `http-server, https-server` → GCP 默认防火墙放行

**修复**:

```yaml
# docker-compose.shared.yml (修复)
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"    # ← 只绑本地
  redis:
    ports:
      - "127.0.0.1:6379:6379"    # ← 只绑本地
```

```hcl
# infra/shared/firewall.tf
resource "google_compute_firewall" "vi_agent_allow_web" {
  name    = "vi-agent-allow-web"
  network = "default"
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["vi-agent"]
}

resource "google_compute_firewall" "vi_agent_allow_dev_ports" {
  name    = "vi-agent-allow-dev-ports"
  network = "default"
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["3100-3903"]       # dev 实例端口范围
  }
  source_ranges = ["0.0.0.0/0"]   # dev 环境开放 (可改为 VPN only)
  target_tags   = ["vi-agent-dev"]
}

resource "google_compute_firewall" "vi_agent_deny_db" {
  name     = "vi-agent-deny-db"
  network  = "default"
  project  = var.project_id
  priority = 900                   # 高优先级拒绝

  deny {
    protocol = "tcp"
    ports    = ["5432", "6379"]    # postgres, redis
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["vi-agent"]
}
```

#### 2.4.4 紧急: 轮换已泄露 API Keys

```bash
# 步骤 1: 轮换所有 keys (在各平台的 dashboard)
# - LiveKit: https://cloud.livekit.io → API Keys → Revoke + Create new
# - Anthropic: https://console.anthropic.com → API Keys → Revoke + Create new
# - Google: https://console.cloud.google.com → APIs → Credentials → Regenerate

# 步骤 2: 从 git 历史中清除 .env
pip install git-filter-repo
git filter-repo --path .env --invert-paths

# 步骤 3: 确保 .gitignore 包含
echo ".env" >> .gitignore
echo "*.tfvars" >> .gitignore
echo ".terraform/" >> .gitignore
echo "terraform.tfstate*" >> .gitignore

# 步骤 4: 新 keys 写入 GitHub Environment Secrets (不再本地存储)
```

#### 2.4.5 其他加固

| 项目 | 修复 |
|------|------|
| SSH agent forwarding | dev.sh 移除 `-A` 标志 |
| 弱默认密码 | `POSTGRES_ADMIN_PASSWORD` 改为 `openssl rand -hex 24` 生成 |
| Docker group 提权 | dev 用户不加入 docker group，改用 `sudo docker` 或 rootless |
| Self-signed SSL | 使用 Let's Encrypt + certbot (dev 环境可选) |
| registry.json | 迁移为 Terraform output 或 GitHub Actions artifact |

### 2.5 GitHub Actions: Terraform Workflow

```yaml
# .github/workflows/infra.yml
name: Infrastructure

on:
  pull_request:
    paths: ['infra/**']
  push:
    branches: [pre-launch]
    paths: ['infra/**']
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [dev, staging, prod]
      action:
        type: choice
        options: [plan, apply]

permissions:
  contents: read
  pull-requests: write
  id-token: write              # Workload Identity Federation

jobs:
  terraform:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment || 'dev' }}
    defaults:
      run:
        working-directory: infra/environments/${{ inputs.environment || 'dev' }}
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - run: terraform init

      - id: plan
        run: terraform plan -no-color -out=tfplan
        continue-on-error: true

      # PR 上显示 plan 结果
      - uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const output = `#### Terraform Plan 📖
            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\`
            *Environment: \`${{ inputs.environment || 'dev' }}\`*`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            })

      # merge 到 pre-launch 或手动 dispatch 时 apply
      - if: >
          (github.event_name == 'push' && github.ref == 'refs/heads/pre-launch') ||
          (github.event_name == 'workflow_dispatch' && inputs.action == 'apply')
        run: terraform apply -auto-approve tfplan
```

### 2.6 迁移步骤 (从 gcp-compute-infra 迁入)

```bash
# 1. 创建 GCS state bucket
gcloud storage buckets create gs://vi-agent-tfstate \
  --project=excellent-nexus-488404-c8 \
  --location=us-central1 \
  --uniform-bucket-level-access

gcloud storage buckets update gs://vi-agent-tfstate --versioning

# 2. 在 vi_agent/infra/ 写好 Terraform 代码 (参考 §2.2 结构)

# 3. terraform import 现有资源 (不中断服务)
cd vi_agent/infra/environments/dev
terraform init
terraform import google_compute_instance.vi_agent_dev vi-agent
terraform import google_compute_address.vi_agent_dev vi-agent-ip

cd ../staging
terraform init
terraform import module.vi_agent_staging.google_compute_instance.this vi-agent-staging
terraform import google_compute_address.vi_agent_staging vi-agent-staging-ip

cd ../prod
terraform init
terraform import module.vi_agent_prod.google_compute_instance.this vi-agent-prod
terraform import google_compute_address.vi_agent_prod vi-agent-prod-ip

# 4. terraform plan → 确认无变更 (import 成功)
# 5. 从 gcp-compute-infra 删除 vi-agent 相关 stacks
# 6. PR 合入 pre-launch
```

### 2.7 退出条件 → 进入 Phase 1

满足 **任一** 条件时开始 Phase 1 规划：

- [ ] Phase 0 所有安全加固完成
- [ ] Terraform 迁移完成，staging/prod 可通过 GitHub Actions deploy
- [ ] 团队需要 staging 环境做上线前验证

---

## 3. Phase 1: Dev 环境重新设计 + Staging/Prod 上线

### 3.1 目标

- Dev 环境: `/dev` skill 简化为触发器，GitHub 账号即身份
- Staging: 合入 pre-launch 自动部署
- Production: 手动审批后部署

### 3.2 Dev 环境架构

```
┌─── 共享 VM 架构 (Phase 1) ──────────────────────────────────────┐
│                                                                    │
│  GCE: vi-agent-dev (e2-standard-8, Terraform 管理)                │
│  IP: 34.172.9.61                                                  │
│                                                                    │
│  ┌────────── 共享基座 ──────────┐                                 │
│  │  postgres:5432 (127.0.0.1)  │  每人独立 database               │
│  │  redis:6379 (127.0.0.1)     │  prefix 隔离                    │
│  └─────────────────────────────┘                                  │
│       ▲        ▲        ▲                                         │
│  ┌────┴───┐ ┌──┴───┐ ┌──┴───┐                                   │
│  │ casey  │ │ liya │ │ bob  │   ← compose project per user      │
│  │ :31xx  │ │ :32xx│ │ :33xx│   ← 端口隔离                      │
│  └────────┘ └──────┘ └──────┘                                    │
│                                                                    │
│  Secrets: GitHub Environment "dev" (共享 API keys)                │
│  部署: GitHub Actions workflow (SSH → docker compose)             │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 /dev Skill 重设计

**原则**: Skill 只是触发器，不做重活。

```
/dev [version]

  version 选项:
    HEAD        → pre-launch 分支最新 (默认)
    release     → 最新 git tag (v0.1.0 等)
    rc          → 最新 rc/* 分支
    <branch>    → 任意分支名

  流程:
    1. gh api user → 获取 GitHub 用户名 (身份)
    2. gh workflow run deploy-dev.yml \
         -f developer=${username} \
         -f ref=${version} \
         -f action=deploy
    3. 等待 workflow 完成
    4. 输出: "Your dev instance: http://34.172.9.61:3{slot}00"
```

**deploy-dev.yml workflow** (GitHub Actions):
```yaml
name: Deploy Dev Instance

on:
  workflow_dispatch:
    inputs:
      developer:
        description: 'Developer GitHub username'
        required: true
      ref:
        description: 'Git ref to deploy'
        default: 'pre-launch'
      action:
        type: choice
        options: [deploy, destroy, status]

env:
  SERVER_IP: 34.172.9.61

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}

      - name: Deploy instance
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ env.SERVER_IP }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            # 分配 slot (基于用户名 hash, 或顺序分配)
            # 生成 .env (从 GitHub Secrets 注入)
            # docker compose -p ${{ inputs.developer }} up -d
```

### 3.4 三环境部署流水线

```
代码流:
  mission/* branch → PR → pre-launch → RC → product

部署流:
  /dev HEAD          → deploy-dev.yml  → dev VM (:31xx-39xx)
  merge to pre-launch → deploy.yml     → staging VM (:80)     自动
  /team-rc promote   → deploy.yml     → prod VM (:80)         手动审批
```

### 3.5 环境配置对比

| 配置 | Dev | Staging | Prod |
|------|-----|---------|------|
| **VM** | e2-standard-8 (共享) | e2-standard-2 | e2-standard-4 |
| **DB** | Docker postgres (共享) | Docker postgres (独立) | Docker postgres (独立) |
| **Redis** | Docker redis (共享) | Docker redis (独立) | Docker redis (独立) |
| **Secrets** | GitHub Env: `dev` | GitHub Env: `staging` | GitHub Env: `prod` |
| **部署** | /dev skill 手动 | 合入 pre-launch 自动 | 手动审批 |
| **备份** | GCE Snapshot (14d) | GCE Snapshot (14d) | GCE Snapshot (14d) |
| **监控** | Ops Agent 基础 | Ops Agent 基础 | Ops Agent + alerts |
| **SSL** | 可选 | Let's Encrypt | Let's Encrypt |
| **域名** | IP:port 直连 | staging.vi-agent.collov.ai | vi-agent.collov.ai |

### 3.6 成本 (Phase 1)

| 组件 | 月成本 |
|------|--------|
| GCE dev (e2-standard-8) | $190 |
| GCE staging (e2-standard-2) | $48 |
| GCE prod (e2-standard-4) | $95 |
| GCE Snapshot (3 × 100GB) | $6 |
| GCS tfstate bucket | $0.02 |
| LiveKit Cloud | $10-50 |
| LLM API | $50-200 |
| **总计** | **~$400-590/月** |

### 3.7 退出条件 → 进入 Phase 2

满足 **任一** 条件时开始 Phase 2 规划：

- [ ] Dev 环境并发用户 >5 人，VM 资源紧张
- [ ] 团队规模 >8 人，需要更好的隔离
- [ ] 需要自动扩缩 (scale-to-zero) 降低成本
- [ ] 部署频率 >10 次/天，需要更快的 rollout/rollback

---

## 4. Phase 2: GKE Autopilot + GitOps (未来)

> **触发条件**: Phase 1 §3.7 任一条件满足时启动。
> **预计时间**: 团队规模到 8-12 人时。

### 4.1 为什么 K8s

| 当前痛点 (在 Phase 1 后期会出现) | K8s 解决方式 |
|----------------------------------|-------------|
| 共享 VM 5 人天花板 | Namespace 隔离，无上限 |
| 端口偏移管理 (slot 1-9) | Ingress 路由 (域名区分) |
| 无弹性，VM 7×24 收费 | scale-to-zero (KEDA) |
| dev/staging/prod 部署不一致 | 同一套 Kustomize base + overlay |
| 手动 docker compose 管理 | ArgoCD GitOps 自动 sync |
| registry.json 状态文件 | K8s 自身就是状态 (kubectl get) |

### 4.2 目标架构

```
┌─── GKE Autopilot Cluster ────────────────────────────────────────┐
│                                                                    │
│  Namespace: argocd          → ArgoCD 控制平面                     │
│  Namespace: ingress         → Ingress Controller                  │
│  Namespace: shared          → postgres, redis (共享 dev 用)       │
│                                                                    │
│  Namespace: dev-casey       → 4 app pods (from overlays/dev)      │
│  Namespace: dev-liya        → 4 app pods                          │
│  Namespace: dev-bob         → 4 app pods                          │
│  ...                        → 最多 N 个 (无上限)                   │
│                                                                    │
│  Namespace: staging         → 4 app pods + 独立 DB (overlays/stg) │
│  Namespace: prod            → 4 app pods + 独立 DB (overlays/prod)│
│  (或: prod 独立集群)                                               │
│                                                                    │
│  域名:                                                             │
│    casey.dev.vi-agent.collov.ai  → dev-casey/frontend              │
│    staging.vi-agent.collov.ai    → staging/frontend                │
│    vi-agent.collov.ai            → prod/frontend                   │
└────────────────────────────────────────────────────────────────────┘
```

### 4.3 Kustomize 结构

```
vi_agent/
├── k8s/
│   ├── base/                          # 所有环境共享
│   │   ├── kustomization.yaml
│   │   ├── api-server/
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   ├── frontend/
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   ├── nanoclaw/
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   └── realtime/
│   │       ├── deployment.yaml
│   │       └── service.yaml
│   │
│   ├── overlays/
│   │   ├── dev/                       # 小资源, 共享 DB
│   │   │   ├── kustomization.yaml
│   │   │   └── resource-patch.yaml
│   │   ├── staging/                   # 中等资源, 独立 DB
│   │   │   ├── kustomization.yaml
│   │   │   ├── postgres.yaml
│   │   │   └── ingress.yaml
│   │   └── prod/                      # 大资源, HPA
│   │       ├── kustomization.yaml
│   │       ├── postgres.yaml
│   │       ├── ingress.yaml
│   │       └── hpa.yaml
│   │
│   └── argocd/
│       ├── project.yaml
│       └── applications/
│           ├── dev-template.yaml      # ApplicationSet (动态生成 dev 实例)
│           ├── staging.yaml
│           └── prod.yaml
```

### 4.4 /dev Skill (K8s 版本)

```
/dev HEAD 流程:
  1. gh api user → "casey"
  2. 生成 ArgoCD Application YAML (targetRevision: pre-launch)
  3. git commit + push → ArgoCD auto-sync
  4. 30 秒后 pods 启动
  5. 返回 URL: https://casey.dev.vi-agent.collov.ai

版本切换:
  /dev HEAD       → targetRevision: pre-launch
  /dev release    → targetRevision: v0.1.0
  /dev rc         → targetRevision: rc/v0.1.0
  /dev feat/xxx   → targetRevision: feat/xxx

ArgoCD 检测 git 变化 → auto-sync → 新版本上线
```

### 4.5 成本预估 (12 人)

| 组件 | 月成本 |
|------|--------|
| GKE Autopilot 集群管理费 | $0 (免费额度 $74.40 覆盖) |
| 共享 infra (postgres, redis, ArgoCD, ingress) | $70 |
| 12 dev namespaces (8h/天, KEDA scale-to-zero) | $205 |
| staging namespace (always-on) | $50 |
| prod namespace (always-on) | $80 |
| **总计** | **~$405/月** |

对比 Phase 1 (GCE 3 台 VM): ~$400-590/月 → **成本持平或略低，但弹性和隔离性大幅提升**。

### 4.6 迁移路径 (GCE → GKE)

```
1. 创建 GKE Autopilot 集群 (Terraform)
2. 安装 ArgoCD + Ingress Controller
3. 编写 K8s manifests (base + overlays)
4. 先迁移 dev 环境 (低风险验证)
5. 验证 2 周 → 迁移 staging
6. staging 验证 1 周 → 迁移 prod
7. 删除旧 GCE VM (Terraform destroy)
```

### 4.7 K8s 特殊考虑

| 组件 | 注意事项 |
|------|---------|
| **LiveKit realtime** | 长连接, 需 `terminationGracePeriodSeconds: 300` + preStop drain |
| **Postgres** | Dev: StatefulSet in-cluster; Prod: 可考虑 Cloud SQL |
| **Secrets** | Sealed Secrets 或 External Secrets Operator → git 安全存储 |
| **Autopilot 限制** | 每 pod 最低 250m CPU / 512Mi; 不支持 DaemonSet |
| **ArgoCD + Autopilot** | 早期有 MutatingWebhookConfiguration 问题, 2024+ 已修复 |

---

## 5. 关键决策记录 (ADR)

### ADR-001: Terraform 代码放在 vi_agent monorepo 内

- **选择**: `vi_agent/infra/` 目录
- **拒绝**: 继续用外部 `gcp-compute-infra` 仓库
- **原因**: App 和 infra 同 PR 可以一起改; 一个 CI pipeline; 应用开发者可以看到基础设施; 不需要跨仓库协调
- **影响**: `gcp-compute-infra` 中的 vi-agent 相关代码需要迁出

### ADR-002: GitHub Actions 执行 Terraform (不用 Spacelift)

- **选择**: GitHub Actions + GCS remote state
- **拒绝**: Spacelift ($250/月), Atlantis (自建), 本地手动 apply
- **原因**: 零额外成本; 和现有 CI/CD 统一; ~5 个 stacks 不需要编排平台; GCS backend 原生提供 locking
- **重新评估条件**: stacks >15 或需要 drift detection / OPA policies 时考虑 Spacelift

### ADR-003: GitHub Environment Secrets 管理密钥 (不用 Secret Manager)

- **选择**: GitHub Environment Secrets + CI/CD 注入
- **拒绝**: GCP Secret Manager, SOPS, 继续 SCP
- **原因**: v5 极简原则; CI/CD 已在用 GitHub; 免费; 不引入新依赖; dev 环境共享一套 keys
- **重新评估条件**: 需要运行时动态拉取 secrets 或 secret rotation 时考虑 Secret Manager

### ADR-004: OS Login 替代硬编码 SSH Keys

- **选择**: GCP OS Login + IAM
- **拒绝**: 继续在 Terraform metadata 硬编码 SSH 公钥
- **原因**: IAM 集中管理; 人员变动即时生效; 不需要改 Terraform; 审计日志

### ADR-005: 共享 VM 用于 Dev (Phase 1), K8s 用于未来 (Phase 2)

- **选择**: 分阶段演进
- **拒绝**: 立即上 GKE Autopilot
- **原因**: 当前团队规模 <8 人, A6 公理不允许为未到达的规模付复杂度税; 共享 VM 安全加固后足够使用; K8s 迁移条件明确 (§3.7)
- **重新评估条件**: 见 §3.7 退出条件

### ADR-006: Dev 环境共享 API Keys

- **选择**: 一个 GitHub Environment `dev` 存团队共享的 dev API keys
- **拒绝**: per-developer GitHub Environment, GCP Secret Manager per-developer
- **原因**: dev 数据是假的; API keys 是测试账号; 新人零配置即可开始; 简单
- **重新评估条件**: 需要 per-developer API 用量审计时改为 per-developer environment

---

## 6. 实施路线图

### Phase 0 任务分解

| # | 任务 | 依赖 | 紧急度 |
|---|------|------|--------|
| 0.1 | **轮换所有已泄露 API keys** | — | 🔴 立即 |
| 0.2 | git filter-repo 清除 .env 历史 | 0.1 | 🔴 立即 |
| 0.3 | 创建 GCS state bucket | — | 🟡 |
| 0.4 | 编写 `infra/` Terraform 代码 | — | 🟡 |
| 0.5 | terraform import 现有 3 台 VM | 0.3, 0.4 | 🟡 |
| 0.6 | 启用 OS Login, 移除硬编码 SSH keys | 0.5 | 🟡 |
| 0.7 | 配置 GitHub Environment Secrets (dev/staging/prod) | 0.1 | 🟡 |
| 0.8 | 修复 docker-compose: 端口绑 127.0.0.1 | — | 🟡 |
| 0.9 | 添加 Terraform 防火墙规则 | 0.5 | 🟡 |
| 0.10 | 编写 `.github/workflows/infra.yml` | 0.5 | 🟢 |
| 0.11 | dev.sh 移除 `-A` 标志 + SCP | 0.7 | 🟢 |
| 0.12 | 从 gcp-compute-infra 删除 vi-agent stacks | 0.5 | 🟢 |

### Phase 1 任务分解

| # | 任务 | 依赖 |
|---|------|------|
| 1.1 | 改进 deploy.yml: staging 自动 + prod 审批 | Phase 0 |
| 1.2 | 编写 deploy-dev.yml workflow | Phase 0 |
| 1.3 | 重写 /dev skill (触发器模式) | 1.2 |
| 1.4 | 配置 staging/prod 域名 + SSL | Phase 0 |
| 1.5 | 首次 staging 部署验证 | 1.1, 1.4 |
| 1.6 | 首次 prod 部署 | 1.5 |

### Phase 2 (K8s, 未来)

| # | 任务 |
|---|------|
| 2.1 | GKE Autopilot 集群 (Terraform) |
| 2.2 | ArgoCD + Ingress 安装 |
| 2.3 | K8s manifests (base + overlays) |
| 2.4 | Sealed Secrets 配置 |
| 2.5 | Dev 环境迁移 + KEDA scale-to-zero |
| 2.6 | Staging 迁移 |
| 2.7 | Prod 迁移 |
| 2.8 | 旧 GCE VM 下线 |

---

## 7. 文件变更清单

### 新增

| 文件 | 用途 |
|------|------|
| `infra/modules/vi-agent-vm/main.tf` | VM 模块 |
| `infra/modules/vi-agent-vm/variables.tf` | 模块变量 |
| `infra/modules/vi-agent-vm/outputs.tf` | 模块输出 |
| `infra/environments/{dev,staging,prod}/main.tf` | 各环境配置 |
| `infra/environments/{dev,staging,prod}/backend.tf` | GCS 远程 state |
| `infra/environments/{dev,staging,prod}/terraform.tfvars.example` | 变量示例 |
| `infra/shared/firewall.tf` | 防火墙规则 |
| `.github/workflows/infra.yml` | Terraform CI/CD |
| `.github/workflows/deploy-dev.yml` | Dev 实例部署 |

### 修改

| 文件 | 变更 |
|------|------|
| `.github/workflows/deploy.yml` | 添加 GitHub Secrets 注入, 移除 SCP |
| `deploy/dev-environment/docker-compose.shared.yml` | 端口绑 127.0.0.1 |
| `deploy/dev-environment/dev.sh` | 移除 `-A`, 移除 SCP .env |
| `.gitignore` | 添加 `*.tfvars`, `.terraform/`, `terraform.tfstate*` |

### 删除 (从 gcp-compute-infra, 迁移完成后)

| 文件 | 原因 |
|------|------|
| `gcp-compute-infra/instances/vi-agent/` | 迁入 vi_agent/infra/ |
| `gcp-compute-infra/instances/vi-agent-staging/` | 迁入 vi_agent/infra/ |
| `gcp-compute-infra/instances/vi-agent-prod/` | 迁入 vi_agent/infra/ |
