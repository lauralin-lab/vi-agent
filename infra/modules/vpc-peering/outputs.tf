output "connection_id" {
  value = google_service_networking_connection.private_vpc.id
}

output "private_ip_range" {
  value = google_compute_global_address.private_ip_range.address
}
