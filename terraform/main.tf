# ─── Random secrets (used when callers don't supply their own) ────────────────

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

resource "random_password" "refresh_api_secret" {
  length  = 40
  special = false
}

resource "random_bytes" "token_encryption_key" {
  length = 32
}

locals {
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  refresh_api_secret = var.refresh_api_secret != "" ? var.refresh_api_secret : random_password.refresh_api_secret.result

  # Fernet requires URL-safe base64 (RFC 4648) of exactly 32 bytes.
  # random_bytes.base64 uses standard base64 (+/); replace with URL-safe equivalents (-)_).
  _raw_fernet_key      = replace(replace(random_bytes.token_encryption_key.base64, "+", "-"), "/", "_")
  token_encryption_key = var.token_encryption_key != "" ? var.token_encryption_key : local._raw_fernet_key

  vm_label = "${var.env_label}-app"
  db_label = "${var.env_label}-db"

  common_tags = concat(
    [var.env_label, "terraform"],
    var.vm_tags
  )
}

# ─── VPC & Subnet ─────────────────────────────────────────────────────────────

resource "linode_vpc" "app" {
  label       = "${var.env_label}-vpc"
  region      = var.region
  description = "VPC for ${var.env_label} application stack"
}

resource "linode_vpc_subnet" "app" {
  vpc_id = linode_vpc.app.id
  label  = "${var.env_label}-subnet"
  ipv4   = var.vpc_subnet_cidr
}

# ─── Firewall ─────────────────────────────────────────────────────────────────

resource "linode_firewall" "app" {
  label = "${var.env_label}-firewall"
  tags  = local.common_tags

  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"

  inbound {
    label    = "allow-ssh"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "22"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-http"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "80"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-https"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-api"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "8000"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-vpc-postgres"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "5432"
    ipv4     = [var.vpc_subnet_cidr]
  }

  linodes = [linode_instance.app.id]
}

# ─── Application VM ───────────────────────────────────────────────────────────

resource "linode_instance" "app" {
  label           = local.vm_label
  region          = var.region
  type            = var.vm_type
  image           = var.vm_image
  root_pass       = var.vm_root_password
  authorized_keys = var.vm_ssh_keys
  tags            = local.common_tags

  interface {
    purpose   = "public"
  }

  interface {
    purpose   = "vpc"
    subnet_id = linode_vpc_subnet.app.id
  }

  metadata {
    user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
      db_host                = linode_database_postgresql_v2.app.host_primary
      db_port                = linode_database_postgresql_v2.app.port
      db_root_user           = linode_database_postgresql_v2.app.root_username
      db_root_password       = linode_database_postgresql_v2.app.root_password
      db_name                = var.app_db_name
      app_db_user            = var.app_db_user
      jwt_secret             = local.jwt_secret
      jwt_expire_minutes     = var.jwt_expire_minutes
      refresh_api_secret     = local.refresh_api_secret
      token_encryption_key   = local.token_encryption_key
      cors_origins           = var.cors_origins
      trusted_proxy_count    = var.trusted_proxy_count
      allow_registration     = var.allow_registration
      initial_admin_email    = var.initial_admin_email
      initial_admin_password = var.initial_admin_password
      git_repo_url           = var.git_repo_url
    }))
  }

  lifecycle {
    ignore_changes = [metadata]
  }
}

# ─── Managed PostgreSQL ───────────────────────────────────────────────────────

resource "linode_database_postgresql_v2" "app" {
  label     = local.db_label
  engine_id = var.db_engine
  region    = var.region
  type      = var.db_type

  cluster_size = var.db_cluster_size

  allow_list = [var.vpc_subnet_cidr]

  private_network = {
    vpc_id        = linode_vpc.app.id
    subnet_id     = linode_vpc_subnet.app.id
    public_access = false
  }

  updates = {
    frequency   = "weekly"
    day_of_week = var.db_updates_day_of_week
    hour_of_day = var.db_updates_hour_of_day
    duration    = 2
  }
}

# ─── backend/.env file ────────────────────────────────────────────────────────

resource "local_file" "backend_env" {
  filename        = "${path.module}/../backend/.env"
  file_permission = "0600"

  content = templatefile("${path.module}/backend_env.tpl", {
    db_host              = linode_database_postgresql_v2.app.host_primary
    db_port              = linode_database_postgresql_v2.app.port
    db_name              = var.app_db_name
    db_user              = var.app_db_user
    db_root_user         = linode_database_postgresql_v2.app.root_username
    db_root_password     = linode_database_postgresql_v2.app.root_password
    jwt_secret           = local.jwt_secret
    jwt_expire_minutes   = var.jwt_expire_minutes
    refresh_api_secret   = local.refresh_api_secret
    token_encryption_key = local.token_encryption_key
    cors_origins         = var.cors_origins != "" ? var.cors_origins : "http://${replace(linode_instance.app.ip_address, ".", "-")}.ip.linodeusercontent.com"
    trusted_proxy_count  = var.trusted_proxy_count
    allow_registration   = var.allow_registration
  })
}
