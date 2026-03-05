variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "instance_name" {
  type = string
}

variable "database_version" {
  type    = string
  default = "POSTGRES_16"
}

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "availability_type" {
  type    = string
  default = "ZONAL"
}

variable "disk_size_gb" {
  type    = number
  default = 10
}

variable "network" {
  type = string
}

variable "database_name" {
  type    = string
  default = "vi_agent"
}

variable "db_user" {
  type    = string
  default = "vi_agent"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "backup_enabled" {
  type    = bool
  default = true
}

variable "max_connections" {
  type    = string
  default = "100"
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "vpc_peering_connection_id" {
  description = "VPC peering connection ID (dependency)"
  type        = string
  default     = ""
}
