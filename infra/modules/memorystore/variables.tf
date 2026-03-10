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

variable "tier" {
  type    = string
  default = "BASIC"
}

variable "memory_size_gb" {
  type    = number
  default = 1
}

variable "redis_version" {
  type    = string
  default = "REDIS_7_2"
}

variable "network" {
  type    = string
  default = "projects/excellent-nexus-488404-c8/global/networks/default"
}

variable "vpc_peering_connection_id" {
  description = "VPC peering connection ID (dependency)"
  type        = string
  default     = ""
}
