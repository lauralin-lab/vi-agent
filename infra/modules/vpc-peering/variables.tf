variable "project_id" {
  type = string
}

variable "name" {
  type    = string
  default = "private-services"
}

variable "network" {
  type    = string
  default = "projects/excellent-nexus-488404-c8/global/networks/default"
}

variable "prefix_length" {
  type    = number
  default = 20
}
