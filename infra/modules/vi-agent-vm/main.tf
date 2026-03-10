terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# --- GCE Instance ---
resource "google_compute_instance" "this" {
  name         = var.instance_name
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  tags = var.network_tags

  boot_disk {
    initialize_params {
      image = var.boot_image
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = var.static_ip
    }
  }

  metadata = {
    enable-osconfig = "TRUE"
    enable-oslogin  = "TRUE"
  }

  service_account {
    email  = var.service_account_email
    scopes = ["cloud-platform"]
  }

  scheduling {
    automatic_restart   = true
    on_host_maintenance = "MIGRATE"
  }

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [
      metadata["ssh-keys"],                       # OS Login manages keys via IAM
      boot_disk[0].initialize_params[0].image,    # Don't recreate VM on image drift
    ]
  }
}

# --- Snapshot Schedule ---
resource "google_compute_resource_policy" "snapshot" {
  name    = var.snapshot_policy_name != "" ? var.snapshot_policy_name : "${var.instance_name}-snapshot"
  project = var.project_id
  region  = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "15:00"
      }
    }
    retention_policy {
      max_retention_days    = var.snapshot_retention_days
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
  }

  lifecycle {
    ignore_changes = [snapshot_schedule_policy[0].snapshot_properties]
  }
}

resource "google_compute_disk_resource_policy_attachment" "snapshot" {
  name    = google_compute_resource_policy.snapshot.name
  disk    = google_compute_instance.this.name
  zone    = var.zone
  project = var.project_id
}

# --- OS Login IAM ---
resource "google_project_iam_member" "os_login" {
  for_each = toset(var.ssh_users)

  project = var.project_id
  role    = "roles/compute.osLogin"
  member  = each.value
}

# --- Static IP ---
resource "google_compute_address" "this" {
  name         = "${var.instance_name}-ip"
  project      = var.project_id
  region       = var.region
  address_type = "EXTERNAL"
  address      = var.static_ip
}
