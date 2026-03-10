output "vm_external_ip" {
  value = module.vi_agent_prod.external_ip
}

output "cloud_sql_private_ip" {
  value = module.cloud_sql.private_ip
}

output "cloud_sql_connection_name" {
  value = module.cloud_sql.connection_name
}

output "redis_host" {
  value = module.memorystore.host
}

output "redis_port" {
  value = module.memorystore.port
}

output "secret_names" {
  description = "All Secret Manager secret names for this environment"
  value = concat(
    [for k, _ in local.auto_secrets : k],
    [for k, _ in local.infra_secrets : k],
    tolist(local.external_secrets),
  )
}
