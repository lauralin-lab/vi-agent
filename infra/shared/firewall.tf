terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "vi-agent-tfstate"
    prefix = "shared"
  }
}

provider "google" {
  project = var.project_id
  region  = "us-central1"
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

# --- Existing rules (import these, don't recreate) ---
# default-allow-http, default-allow-https, default-allow-ssh, default-allow-icmp,
# default-allow-rdp, default-allow-internal are GCP default VPC rules.
# "server" rule (tcp:3000-10000, tags: http-server,https-server) already exists.
# We do NOT manage those here to avoid conflicts.

# --- Deny external access to databases on staging/prod ---
# Staging runs Postgres/Redis in Docker; block external access.
# Prod uses managed services (private IP), but this is defense-in-depth.
resource "google_compute_firewall" "vi_agent_deny_db" {
  name     = "vi-agent-deny-db"
  network  = "default"
  project  = var.project_id
  priority = 900

  deny {
    protocol = "tcp"
    ports    = ["5432", "6379"]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server"]
}
