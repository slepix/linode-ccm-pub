# ─── VPC ──────────────────────────────────────────────────────────────────────

output "vpc_id" {
  description = "ID of the VPC."
  value       = linode_vpc.app.id
}

output "vpc_subnet_id" {
  description = "ID of the VPC subnet."
  value       = linode_vpc_subnet.app.id
}

output "vpc_subnet_cidr" {
  description = "IPv4 CIDR block of the VPC subnet."
  value       = linode_vpc_subnet.app.ipv4
}

# ─── VM ───────────────────────────────────────────────────────────────────────

output "vm_id" {
  description = "Linode instance ID of the application VM."
  value       = linode_instance.app.id
}

output "vm_label" {
  description = "Label of the application VM."
  value       = linode_instance.app.label
}

output "vm_public_ip" {
  description = "Public IPv4 address of the application VM."
  value       = local.vm_public_ip
}

output "vm_ipv6" {
  description = "Public IPv6 address of the application VM."
  value       = linode_instance.app.ipv6
}

# ─── Managed PostgreSQL ───────────────────────────────────────────────────────

output "db_id" {
  description = "Managed database instance ID."
  value       = linode_database_postgresql_v2.app.id
}

output "db_label" {
  description = "Label of the managed database cluster."
  value       = linode_database_postgresql_v2.app.label
}

output "db_host_primary" {
  description = "Primary hostname for the managed database."
  value       = linode_database_postgresql_v2.app.host_primary
}

output "db_port" {
  description = "Port for the managed database."
  value       = linode_database_postgresql_v2.app.port
}

output "db_root_username" {
  description = "Root username for the managed database."
  value       = linode_database_postgresql_v2.app.root_username
  sensitive   = true
}

output "db_root_password" {
  description = "Root password for the managed database."
  value       = linode_database_postgresql_v2.app.root_password
  sensitive   = true
}

output "db_version" {
  description = "PostgreSQL engine version."
  value       = linode_database_postgresql_v2.app.version
}

output "db_status" {
  description = "Operating status of the managed database."
  value       = linode_database_postgresql_v2.app.status
}

# ─── Application ──────────────────────────────────────────────────────────────

output "jwt_secret" {
  description = "JWT signing secret used by the backend API."
  value       = local.jwt_secret
  sensitive   = true
}

output "refresh_api_secret" {
  description = "Bearer secret protecting the /api/refresh endpoint."
  value       = local.refresh_api_secret
  sensitive   = true
}

output "setup_db_command" {
  description = "Ready-to-run setup_db.py command using the managed DB root credentials."
  value = join(" ", [
    "python backend/setup_db.py",
    "--host", linode_database_postgresql_v2.app.host_primary,
    "--port", tostring(linode_database_postgresql_v2.app.port),
    "--root-user", linode_database_postgresql_v2.app.root_username,
    "--root-password", "'<see: terraform output -raw db_root_password>'",
    "--admin-db defaultdb",
    "--db-name", var.app_db_name,
    "--app-user", var.app_db_user,
    "--ssl-mode require",
    "--write-env",
  ])
  sensitive = true
}

output "backend_env_path" {
  description = "Path to the auto-generated backend/.env file."
  value       = local_file.backend_env.filename
}

output "token_encryption_key" {
  description = "Fernet key used to encrypt Linode API tokens at rest."
  value       = local.token_encryption_key
  sensitive   = true
}

output "app_url" {
  description = "Public URL of the frontend application."
  value       = "http://${local.vm_public_ip}"
}

output "api_url" {
  description = "Public URL of the backend API."
  value       = "http://${local.vm_public_ip}:8000"
}

output "rdns_hostname" {
  description = "Linode default rDNS hostname for the VM (usable immediately without custom DNS)."
  value       = "${replace(local.vm_public_ip, ".", "-")}.ip.linodeusercontent.com"
}

output "cors_origins" {
  description = "Effective CORS origin(s) configured for the backend API."
  value       = var.cors_origins != "" ? var.cors_origins : "http://${replace(local.vm_public_ip, ".", "-")}.ip.linodeusercontent.com"
}

output "bootstrap_log_command" {
  description = "SSH command to tail the bootstrap log on the VM."
  value       = "ssh root@${local.vm_public_ip} tail -f /var/log/user_data.log"
}
