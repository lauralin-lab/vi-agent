terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

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
