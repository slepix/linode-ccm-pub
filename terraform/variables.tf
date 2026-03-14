# ─── Auth ─────────────────────────────────────────────────────────────────────

variable "linode_token" {
  description = "Linode API personal access token."
  type        = string
  sensitive   = true
}

# ─── Shared ───────────────────────────────────────────────────────────────────

variable "region" {
  description = "Linode region for all resources (e.g. us-mia, us-east, eu-west)."
  type        = string
  default     = "us-mia"
}

variable "env_label" {
  description = "Short environment label used as a name prefix (e.g. prod, staging, dev)."
  type        = string
  default     = "prod"
}

# ─── VM ───────────────────────────────────────────────────────────────────────

variable "vm_type" {
  description = "Linode plan type for the application VM."
  type        = string
  default     = "g6-standard-2"
}

variable "vm_image" {
  description = "Linode image for the application VM."
  type        = string
  default     = "linode/ubuntu22.04"
}

variable "vm_root_password" {
  description = "Root password for the VM. Use a strong, randomly generated value."
  type        = string
  sensitive   = true
}

variable "vm_ssh_keys" {
  description = "List of SSH public keys (or Linode-stored key labels) to authorise on the VM."
  type        = list(string)
  default     = []
}

variable "vm_tags" {
  description = "Additional tags to apply to the VM."
  type        = list(string)
  default     = []
}

# ─── VPC / Networking ─────────────────────────────────────────────────────────

variable "vpc_subnet_cidr" {
  description = "IPv4 CIDR block for the VPC subnet (e.g. 10.0.1.0/24). Must be a private RFC-1918 range."
  type        = string
  default     = "10.0.1.0/24"
}

# ─── Managed PostgreSQL ───────────────────────────────────────────────────────

variable "db_type" {
  description = "Linode plan type for the managed PostgreSQL nodes."
  type        = string
  default     = "g6-nanode-1"
}

variable "db_engine" {
  description = "PostgreSQL engine version identifier."
  type        = string
  default     = "postgresql/16"
}

variable "db_cluster_size" {
  description = "Number of nodes in the managed database cluster (1 or 3)."
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 3], var.db_cluster_size)
    error_message = "db_cluster_size must be 1 (standalone) or 3 (high-availability)."
  }
}

variable "db_updates_day_of_week" {
  description = "Day of the week for managed DB maintenance window (1=Monday … 7=Sunday)."
  type        = number
  default     = 7
}

variable "db_updates_hour_of_day" {
  description = "UTC hour to begin the managed DB maintenance window (0–23)."
  type        = number
  default     = 3
}

# ─── Application ──────────────────────────────────────────────────────────────

variable "app_db_name" {
  description = "Application database name created by setup_db.py after provisioning."
  type        = string
  default     = "appdb"
}

variable "app_db_user" {
  description = "Application database username created by setup_db.py after provisioning."
  type        = string
  default     = "appuser"
}

variable "jwt_secret" {
  description = "JWT signing secret for the backend API. Leave empty to auto-generate."
  type        = string
  sensitive   = true
  default     = ""
}

variable "cors_origins" {
  description = "Comma-separated list of allowed CORS origins for the backend API. Leave empty to automatically use the VM's Linode rDNS hostname (e.g. http://172-239-242-132.ip.linodeusercontent.com). Set to your domain when using a custom DNS name."
  type        = string
  default     = ""
}

variable "refresh_api_secret" {
  description = "Bearer secret that protects the /api/refresh endpoint. Leave empty to auto-generate."
  type        = string
  sensitive   = true
  default     = ""
}

variable "token_encryption_key" {
  description = "Fernet key used to encrypt Linode API tokens at rest. Leave empty to auto-generate."
  type        = string
  sensitive   = true
  default     = ""
}

variable "git_repo_url" {
  description = "HTTPS URL of the Git repository to clone onto the VM (e.g. https://github.com/org/repo.git)."
  type        = string
}

variable "allow_registration" {
  description = "Enable the public /api/auth/register endpoint on first boot to create the initial admin account. Automatically disabled after first use via cloud-init."
  type        = bool
  default     = true
}

variable "initial_admin_email" {
  description = "Email address for the initial admin account created on first boot."
  type        = string
  default     = ""
}

variable "initial_admin_password" {
  description = "Password for the initial admin account created on first boot. Leave empty to skip auto-creation."
  type        = string
  sensitive   = true
  default     = ""
}

variable "trusted_proxy_count" {
  description = "Number of reverse proxy hops to trust for X-Forwarded-For IP detection. Set to 1 if using a load balancer."
  type        = number
  default     = 0
}

variable "jwt_expire_minutes" {
  description = "How long JWT tokens remain valid, in minutes. Default is 1440 (24 hours)."
  type        = number
  default     = 1440
}
