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

# --- GCE VM ---
module "vi_agent_staging" {
  source = "../../modules/vi-agent-vm"

  project_id            = var.project_id
  region                = var.region
  zone                  = var.zone
  instance_name         = "vi-agent-staging"
  machine_type          = "e2-standard-2"
  boot_image            = "projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20260218"
  disk_size_gb          = 50
  static_ip             = "34.68.86.220"
  network_tags          = ["http-server", "https-server"]
  service_account_email = var.service_account_email
  ssh_users             = var.ssh_users
  snapshot_policy_name  = "default-schedule-staging-vi-agent-staging"
}

# --- Auto-generated secrets ---
resource "random_password" "postgres_password" {
  length  = 32
  special = false
}

resource "random_password" "redis_password" {
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
locals {
  auto_secrets = {
    "vi-agent-staging-postgres-password"   = random_password.postgres_password.result
    "vi-agent-staging-redis-password"      = random_password.redis_password.result
    "vi-agent-staging-jwt-secret"          = random_password.jwt_secret.result
    "vi-agent-staging-internal-api-token"  = random_password.internal_api_token.result
  }

  external_secrets = toset([
    "vi-agent-staging-livekit-url",
    "vi-agent-staging-livekit-api-key",
    "vi-agent-staging-livekit-api-secret",
    "vi-agent-staging-google-api-key",
    "vi-agent-staging-anthropic-api-key",
  ])
}

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
