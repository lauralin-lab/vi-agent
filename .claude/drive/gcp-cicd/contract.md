# Mission Contract: GCP CI/CD Pipeline
## Created: 2026-03-02

## Success Criteria (must ALL be true for MISSION_COMPLETE):
□ GitHub Actions Workflows: 4 workflow files for api-server, vi-realtime, vi-gateway, frontend — each with lint → test → build → push → deploy pipeline
□ Terraform IaC: Complete GCP infrastructure code covering VPC, Cloud SQL, Memorystore, GCE MIG, Load Balancer, Cloud CDN, Artifact Registry, Secret Manager, Cloud DNS
□ Staging + Production dual environments: Terraform workspace/module parameterization, Production deployment requires GitHub manual approval
□ docker-compose.prod.yml: Production compose file (no local postgres/redis, uses Cloud SQL/Memorystore)
□ Alembic database migrations: Initialize Alembic, generate initial migration from existing models, integrate migration execution in CI/CD
□ GCE instance template + startup script: Instance auto-pulls images and runs docker-compose.prod.yml on boot
□ Rolling update strategy: MIG zero-downtime rolling update (maxUnavailable=0, maxSurge=1)
□ Local verification: terraform validate passes, GitHub Actions workflow syntax correct, Alembic migration testable locally

## Scope Boundaries:
- IN: GitHub Actions workflows, Terraform modules, docker-compose.prod.yml, Alembic setup, GCE startup script, nginx production config, Secret Manager integration
- OUT: Actual GCP deployment execution, GKE Phase 3 migration, Cloud Armor WAF, multi-region deployment, detailed monitoring Terraform (basic only)

## Key Constraints:
- Follow architecture-v4.md design
- Terraform modular design with environment parameterization
- All secrets via Secret Manager, never hardcoded
- Frontend → GCS + CDN, Backend → GCE MIG

## Key Decisions:
- Terraform for IaC (not shell scripts)
- Alembic for database migrations
- GitHub Actions as CI/CD platform
- GCE MIG Phase 1 architecture (not GKE)
