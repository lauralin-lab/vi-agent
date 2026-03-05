variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-c"
}

variable "instance_name" {
  description = "Name of the GCE instance"
  type        = string
}

variable "machine_type" {
  description = "GCE machine type"
  type        = string
}

variable "boot_image" {
  description = "Boot disk image (use exact image path for existing VMs to avoid recreation)"
  type        = string
  default     = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 100
}

variable "static_ip" {
  description = "Pre-allocated static IP address"
  type        = string
}

variable "network_tags" {
  description = "Network tags for firewall rules"
  type        = list(string)
  default     = ["vi-agent"]
}

variable "service_account_email" {
  description = "Service account email for the instance"
  type        = string
}

variable "ssh_users" {
  description = "List of IAM members for OS Login SSH access (e.g. user:casey@collov.com)"
  type        = list(string)
  default     = []
}

variable "snapshot_policy_name" {
  description = "Name of the snapshot policy (for importing existing policies with different names)"
  type        = string
  default     = ""
}

variable "snapshot_retention_days" {
  description = "Number of days to retain snapshots"
  type        = number
  default     = 14
}
