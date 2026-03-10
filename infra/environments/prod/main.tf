terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --- Auto-generated secrets (never in git) ---
resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "internal_api_token" {
  length  = 32
  special = false
}

# --- Secret Manager ---
# Auto-generated secrets (Terraform manages value)
locals {
  auto_secrets = {
    "vi-agent-prod-db-password"         = random_password.db_password.result
    "vi-agent-prod-jwt-secret"          = random_password.jwt_secret.result
    "vi-agent-prod-internal-api-token"  = random_password.internal_api_token.result
    "vi-agent-prod-redis-auth"          = module.memorystore.auth_string
  }

  # Infra-derived config (not secret, but managed by Terraform)
  infra_secrets = {
    "vi-agent-prod-db-host"    = module.cloud_sql.private_ip
    "vi-agent-prod-redis-host" = module.memorystore.host
  }

  # External API keys (Terraform creates the container, user fills in the value via console/gcloud)
  external_secrets = toset([
    "vi-agent-prod-livekit-url",
    "vi-agent-prod-livekit-api-key",
    "vi-agent-prod-livekit-api-secret",
    "vi-agent-prod-google-api-key",
    "vi-agent-prod-anthropic-api-key",
  ])
}

# Secrets with auto-generated values
resource "google_secret_manager_secret" "auto" {
  for_each  = local.auto_secrets
  secret_id = each.key
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "auto" {
  for_each    = local.auto_secrets
  secret      = google_secret_manager_secret.auto[each.key].id
  secret_data = each.value
}

# Secrets with infra-derived values
resource "google_secret_manager_secret" "infra" {
  for_each  = local.infra_secrets
  secret_id = each.key
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "infra" {
  for_each    = local.infra_secrets
  secret      = google_secret_manager_secret.infra[each.key].id
  secret_data = each.value
}

# External API keys — empty containers, user fills via:
#   gcloud secrets versions add vi-agent-prod-anthropic-api-key --data-file=-
resource "google_secret_manager_secret" "external" {
  for_each  = local.external_secrets
  secret_id = each.value
  project   = var.project_id
  replication {
    auto {}
  }
}

# --- IAM: VM service account can read secrets ---
resource "google_project_iam_member" "vm_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${var.service_account_email}"
}

# --- VPC Private Services Access (for Cloud SQL + Memorystore) ---
module "vpc_peering" {
  source = "../../modules/vpc-peering"

  project_id = var.project_id
  name       = "vi-agent-prod-private"
  network    = "projects/${var.project_id}/global/networks/default"
}

# --- GCE VM ---
module "vi_agent_prod" {
  source = "../../modules/vi-agent-vm"

  project_id            = var.project_id
  region                = var.region
  zone                  = var.zone
  instance_name         = "vi-agent-prod"
  machine_type          = "e2-standard-4"
  boot_image            = "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20260218"
  static_ip             = "34.136.53.132"
  network_tags          = ["http-server", "https-server"]
  service_account_email = var.service_account_email
  ssh_users             = var.ssh_users
  snapshot_policy_name  = "default-schedule-prod-vi-agent-prod"
}

# --- Cloud SQL (Postgres 16) ---
module "cloud_sql" {
  source = "../../modules/cloud-sql"

  project_id    = var.project_id
  region        = var.region
  instance_name = "vi-agent-prod-pg"
  tier          = "db-f1-micro"
  disk_size_gb  = 10
  network       = "projects/${var.project_id}/global/networks/default"
  database_name = "vi_agent"
  db_user       = "vi_agent"
  db_password   = random_password.db_password.result

  vpc_peering_connection_id = module.vpc_peering.connection_id
}

# --- Memorystore (Redis 7) ---
module "memorystore" {
  source = "../../modules/memorystore"

  project_id    = var.project_id
  region        = var.region
  instance_name = "vi-agent-prod-redis"
  tier          = "BASIC"
  memory_size_gb = 1
  network       = "projects/${var.project_id}/global/networks/default"

  vpc_peering_connection_id = module.vpc_peering.connection_id
}
