# Plan: GCP CI/CD Pipeline
## Contract: .claude/drive/gcp-cicd/contract.md

## Approach Overview

按 architecture-v4.md 的完整设计，搭建从代码提交到生产部署的完整自动化流水线。采用 Terraform 模块化架构管理 GCP 基础设施，GitHub Actions 驱动 CI/CD，Alembic 管理数据库 schema 演进。

核心设计原则：**环境参数化** — 同一套 Terraform 代码和 GitHub Actions workflow 服务 staging 和 production 两个环境，通过变量切换。

## Architecture / Design

```
代码提交 → GitHub Actions
├── api-server workflow    → build Docker → push AR → run Alembic migration → MIG rolling update
├── vi-realtime workflow   → build Docker → push AR → MIG rolling update
├── vi-gateway workflow    → build Docker → push AR → MIG rolling update
└── frontend workflow      → npm build → upload GCS → CDN invalidation

Terraform manages:
├── terraform/modules/
│   ├── networking/     → VPC, subnets, firewall, Cloud NAT
│   ├── database/       → Cloud SQL PostgreSQL (HA)
│   ├── cache/          → Memorystore Redis (HA)
│   ├── compute/        → GCE instance template, MIG, autoscaler
│   ├── loadbalancer/   → Global LB, SSL cert, URL map, CDN
│   ├── storage/        → GCS bucket for frontend, Artifact Registry
│   ├── secrets/        → Secret Manager secrets
│   └── dns/            → Cloud DNS zone and records
└── terraform/environments/
    ├── staging/        → terraform.tfvars for staging
    └── production/     → terraform.tfvars for production
```

## Key Design Decisions

- **Terraform module structure**: Each GCP resource group is a separate module for reusability and clear ownership
- **Environment separation**: terraform/environments/{env}/main.tf references shared modules with different variables
- **GitHub Actions path triggers**: Each workflow only triggers on changes to its service directory
- **Production gate**: GitHub Environment protection rules require manual approval
- **Alembic in CI**: Migration runs as a step in api-server workflow before MIG update (not Cloud Run Job initially — simpler)
- **Startup script**: GCE instances pull latest images from AR on boot via startup script + docker-compose.prod.yml
- **Secret injection**: Startup script fetches secrets from Secret Manager and writes .env before docker-compose up

## Implementation Sequence

### Domain 1: Terraform IaC (largest domain, 8 modules)
1. Project scaffold: terraform/ directory structure, provider config, backend (GCS state)
2. networking module: VPC, subnet, firewall rules, Cloud NAT
3. database module: Cloud SQL PostgreSQL HA
4. cache module: Memorystore Redis HA
5. storage module: GCS frontend bucket, Artifact Registry
6. secrets module: Secret Manager for all API keys
7. compute module: Instance template, MIG, autoscaler, startup script
8. loadbalancer module: Global LB, SSL, URL map, CDN, backend services
9. dns module: Cloud DNS zone and records
10. Environment configs: staging/ and production/ tfvars

### Domain 2: CI/CD Workflows (4 workflows + shared)
1. Shared workflow config: reusable auth/setup steps
2. api-server workflow: test → build → push → migrate → deploy
3. vi-realtime workflow: build → push → deploy
4. vi-gateway workflow: build → push → deploy
5. frontend workflow: build → upload GCS → CDN invalidation

### Domain 3: Alembic + Production Docker
1. Alembic initialization in api-server
2. Generate initial migration from existing SQLAlchemy models
3. docker-compose.prod.yml (no local DB/Redis)
4. GCE startup script (fetch secrets, pull images, compose up)
5. Production nginx.conf adjustments (LB terminates SSL)

## Risk Mitigation
- Terraform validate locally before any deployment
- GitHub Actions workflows tested with act (local runner) or syntax validation
- Alembic migration tested against local PostgreSQL
- Startup script tested in docker context
- All secrets referenced by name, never by value in code

## What This Plan Does NOT Cover
- Actual GCP project creation and API enablement
- Actual DNS domain registration
- GKE migration (Phase 3)
- Detailed monitoring/alerting Terraform (basic health checks only)
- Cloud Armor WAF configuration
