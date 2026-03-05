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

# Allow HTTP/HTTPS for all vi-agent instances
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

# Allow dev instance port range (slot-based: 3100-3903)
resource "google_compute_firewall" "vi_agent_allow_dev_ports" {
  name    = "vi-agent-allow-dev-ports"
  network = "default"
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["3100-3903"]
  }
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["vi-agent-dev"]
}

# Deny external access to databases (high priority)
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
  target_tags   = ["vi-agent"]
}
