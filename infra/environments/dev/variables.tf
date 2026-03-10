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

variable "service_account_email" {
  description = "Service account email"
  type        = string
}

variable "ssh_users" {
  description = "IAM members for OS Login SSH access"
  type        = list(string)
  default     = []
}
