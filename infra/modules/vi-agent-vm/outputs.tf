output "instance_id" {
  description = "The instance ID"
  value       = google_compute_instance.this.instance_id
}

output "instance_name" {
  description = "The instance name"
  value       = google_compute_instance.this.name
}

output "external_ip" {
  description = "The external IP address"
  value       = google_compute_address.this.address
}

output "self_link" {
  description = "The self link of the instance"
  value       = google_compute_instance.this.self_link
}
