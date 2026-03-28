# Linode Cloud Compliance Manager (LCCM)

A cloud compliance and security management platform for Linode (Akamai Cloud) infrastructure. LCCM connects to one or more Linode accounts, syncs all infrastructure resources, evaluates them against built-in compliance rules, and provides a unified dashboard for tracking your security posture over time.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Deployment](#deployment)
5. [Environment Variables Reference](#environment-variables-reference)
6. [First Login & Initial Setup](#first-login--initial-setup)
7. [Updating LCCM](#updating-lccm)
8. [SSL / TLS](#ssl--tls)
9. [Database Migrations](#database-migrations)
10. [Automated Sync Scheduling](#automated-sync-scheduling)
11. [User Roles & Access Control](#user-roles--access-control)
12. [API Reference](#api-reference)
13. [Troubleshooting](#troubleshooting)

---

## Features

- **Multi-account support** — Connect and manage multiple Linode accounts from a single interface
- **Resource inventory** — Linodes, Volumes, Databases, Firewalls, VPCs, LKE Clusters, NodeBalancers, and Object Storage buckets
- **29+ built-in compliance rules** — CIS-inspired checks across compute, network, storage, and database
- **6 compliance profiles** — Foundation, Standard, SOC 2, PCI-DSS, Minimal/Dev, and All Rules
- **Compliance scoring** — Aggregate scores with historical trend charts
- **Acknowledgment workflow** — Acknowledge findings with notes and track remediation progress
- **Config change history** — Snapshot diffs showing what changed on each resource over time
- **Reports** — Generate point-in-time compliance snapshots, exportable to PDF, CSV, and OCSF
- **Role-based access control** — Admin, Power User, and Auditor roles with per-account access grants
- **Events timeline** — Activity feed sourced directly from the Linode API
- **MCP integration** — Model Context Protocol API for AI assistant integrations
- **Two-factor authentication** — TOTP-based 2FA for user accounts
- **Dark mode** — Full dark/light theme support

---

## Architecture

```
                        ┌─────────────────────────────────────────┐
                        │              Nginx (port 80/443)         │
                        │    Static frontend  │  /api/* → :8000    │
                        └─────────────────────────────────────────┘
                                    │                   │
                    ┌───────────────┘                   └──────────────┐
                    ▼                                                   ▼
        ┌───────────────────────┐                      ┌──────────────────────────┐
        │  React + TypeScript   │                      │  FastAPI (Python 3.13)   │
        │  Vite / Tailwind CSS  │                      │  Uvicorn ASGI server     │
        └───────────────────────┘                      └──────────────────────────┘
                                                                    │
                                                        ┌───────────┴────────────┐
                                                        ▼                        ▼
                                             ┌──────────────────┐    ┌───────────────────┐
                                             │  PostgreSQL DB   │    │   Linode API v4   │
                                             │ (Akamai Managed) │    │ api.linode.com    │
                                             └──────────────────┘    └───────────────────┘
```

**Frontend** is a React 18 / TypeScript / Tailwind CSS single-page application built with Vite.

**Backend** is a FastAPI application with JWT authentication, async PostgreSQL access via asyncpg, and a sync engine that polls the Linode API on demand or on a schedule.

**Database** is a Akamai Managed PostgreSQL cluster, provisioned automatically by Terraform.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Terraform | 1.5+ | Infrastructure provisioning |
| A Linode / Akamai Cloud account | — | Required to deploy resources |
| A Linode Personal Access Token | — | Full access required for Terraform |

### Linode API Token — Terraform

Terraform requires a **read-write** token to create infrastructure resources (VMs, databases, VPCs, firewalls). Generate one in the Linode Cloud Manager under **My Profile → API Tokens** with full access.

### Linode API Token — Application

Once LCCM is running, each Linode account you connect to the application only needs a **read-only** token covering:

- Linodes, Volumes, Databases, Firewalls, VPCs, Kubernetes (LKE), NodeBalancers, Object Storage, Events

> LCCM only reads infrastructure data — a read-only token is sufficient and more secure for day-to-day operation.

---

## Deployment

Terraform provisions everything on Akamai Cloud: a VPC, firewall, Ubuntu VM, and managed PostgreSQL cluster. The VM configures itself automatically via `user_data` — it installs Docker, clones the repository, runs database migrations, and starts the application.

### 1. Install Terraform

```bash
# macOS
brew install terraform

# Linux (Debian/Ubuntu)
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

### 2. Configure variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`. The table below describes every available variable — required ones are marked.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `linode_token` | Yes | — | Linode PAT for Terraform (read-write) |
| `vm_root_password` | Yes | — | Root password for the application VM |
| `git_repo_url` | Yes | — | Git URL of this repository |
| `region` | No | `us-mia` | Akamai region to deploy into |
| `env_label` | No | `prod` | Label prefix applied to all resources |
| `vm_type` | No | `g6-standard-2` | VM plan (2 vCPU / 4 GB RAM) |
| `vm_image` | No | `linode/ubuntu22.04` | VM OS image |
| `vm_ssh_keys` | No | `[]` | List of SSH public keys for root login |
| `vpc_subnet_cidr` | No | `10.0.1.0/24` | Private subnet CIDR |
| `db_type` | No | `g6-nanode-1` | Managed DB plan |
| `db_engine` | No | `postgresql/16` | PostgreSQL version |
| `db_cluster_size` | No | `1` | `1` for standalone, `3` for high availability |
| `app_db_name` | No | `appdb` | Application database name |
| `app_db_user` | No | `appuser` | Application database user |
| `jwt_secret` | No | _(auto-generated)_ | JWT signing secret — leave blank to auto-generate |
| `refresh_api_secret` | No | _(auto-generated)_ | Bearer secret for the `/api/refresh` endpoint |
| `token_encryption_key` | No | _(auto-generated)_ | Fernet key for encrypting stored Linode tokens |
| `cors_origins` | No | _(auto-detected)_ | Allowed frontend origins — auto-uses rDNS if empty |
| `allow_registration` | No | `true` | Enable public registration on first boot |
| `initial_admin_email` | No | — | Auto-create an admin account with this email |
| `initial_admin_password` | No | — | Password for the auto-created admin account |
| `trusted_proxy_count` | No | `0` | Proxy hops to trust (`1` if behind a load balancer) |
| `ssl_domain` | No | — | Custom domain for SSL certificate (optional) |
| `ssl_email` | No | — | Contact email — providing this enables automatic Let's Encrypt SSL |

A minimal `terraform.tfvars` example:

```hcl
linode_token     = "your-linode-pat-here"
vm_root_password = "ChangeMe!SuperStr0ng#Password"
git_repo_url     = "https://github.com/your-org/lccm.git"

region    = "us-mia"
env_label = "prod"

vm_ssh_keys = [
  "ssh-ed25519 AAAA... you@machine",
]

initial_admin_email    = "admin@example.com"
initial_admin_password = "ChangeMe!Admin#Password"

# Optional: enable HTTPS automatically
ssl_email  = "admin@example.com"
ssl_domain = "lccm.example.com"   # leave empty to use Linode rDNS hostname
```

### 3. Deploy

```bash
terraform init
terraform plan
terraform apply
```

Provisioning takes approximately 10–15 minutes. The managed PostgreSQL cluster takes the most time to become available.

### 4. Access the application

Terraform prints outputs when the apply completes:

| Output | Description |
|--------|-------------|
| `vm_ip` | Public IP of the application VM |
| `vm_rdns` | Linode rDNS hostname (e.g., `1-2-3-4.ip.linodeusercontent.com`) |
| `db_host` | Managed PostgreSQL hostname |
| `app_url` | Full application URL |

- **Without SSL:** `http://<vm_ip>` or `http://<vm_rdns>`
- **With SSL:** `https://<ssl_domain>` (DNS must point to `vm_ip` before running Terraform)

### 5. Destroy

```bash
terraform destroy
```

This removes all provisioned resources including the VM, database, VPC, and firewall.

---

## Environment Variables Reference

Secrets and configuration are set via `terraform.tfvars` and written automatically to the VM by the provisioning script. They are documented here for reference when rotating values or debugging.

### Backend environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | — | PostgreSQL hostname |
| `DB_PORT` | Yes | `5432` | PostgreSQL port (Akamai Managed DB uses `16409`) |
| `DB_NAME` | Yes | — | Database name |
| `DB_USER` | Yes | — | Database user |
| `DB_PASSWORD` | Yes | — | Database password |
| `DB_SSL` | No | `disable` | SSL mode: `disable`, `require`, or `verify-full` |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens. Min 32 random chars. |
| `JWT_ALGORITHM` | No | `HS256` | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | No | `480` | Session duration in minutes (480 = 8 hours) |
| `LINODE_API_BASE` | No | `https://api.linode.com/v4` | Linode API base URL |
| `REFRESH_API_SECRET` | Yes | — | Bearer secret for the `/api/refresh` cron endpoint |
| `CORS_ORIGINS` | Yes | — | Comma-separated list of allowed frontend origins |
| `TOKEN_ENCRYPTION_KEY` | Yes | — | Fernet key for encrypting stored Linode API tokens |
| `ALLOW_REGISTRATION` | No | `false` | Set to `true` only when creating the first admin account |
| `TRUSTED_PROXY_COUNT` | No | `0` | Proxy hops to trust (`1` if behind a load balancer) |

> **Important:** `TOKEN_ENCRYPTION_KEY` must remain the same for the lifetime of the deployment. Changing it will make all stored Linode API tokens unreadable, requiring you to re-enter them in the application.

To manually generate values if needed:

```bash
# JWT_SECRET and REFRESH_API_SECRET
python3 -c "import secrets; print(secrets.token_hex(32))"

# TOKEN_ENCRYPTION_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Frontend environment

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE` | Yes | Backend API base URL (no trailing slash). E.g., `https://lccm.example.com` |

---

## First Login & Initial Setup

### 1. Register the admin account

If `initial_admin_email` and `initial_admin_password` were set in `terraform.tfvars`, the admin account is created automatically — skip to step 2.

Otherwise, Terraform sets `allow_registration = true` by default on first boot. Navigate to the application URL and register your account. The first account created is automatically assigned the **Admin** role.

After registering, disable open registration by SSH-ing into the VM and setting `ALLOW_REGISTRATION=false` in `/opt/lccm/backend/.env`, then restart the backend:

```bash
sudo systemctl restart lccm-backend
```

### 2. Connect a Linode account

1. Log in to LCCM
2. Navigate to **Accounts**
3. Click **Add Account**
4. Enter a display name and your Linode Personal Access Token (read-only)
5. Click **Save**

### 3. Run your first sync

Navigate to the **Dashboard** and click **Sync Now**. The sync engine will:

1. Fetch all resources from the Linode API
2. Detect configuration changes and create snapshots
3. Evaluate all active compliance rules against each resource
4. Update compliance scores

---

## Updating LCCM

The easiest way to update a running deployment is with the included `updateapp.sh` script. SSH into the VM and run it from the repository root:

```bash
ssh root@<vm_ip>
cd /opt/lccm
sudo bash updateapp.sh
```

The script performs the following steps automatically:

1. **Stashes local changes** (if any) so the pull succeeds cleanly, then restores them afterward
2. **Pulls the latest code** from the configured Git remote (`git pull`)
3. **Rebuilds the frontend** — runs `npm ci` and `npm run build`, producing a fresh `dist/` bundle
4. **Deploys static files** — copies the new `dist/` to `/var/www/html/` for Nginx to serve
5. **Rebuilds the backend Docker image** — runs `docker compose build --pull backend` with no cache for dependencies
6. **Restarts the backend container** — uses `docker compose up -d --no-deps backend` for a zero-downtime swap
7. **Waits for the health check** — polls `/health` until the backend responds or times out after ~60 seconds
8. **Reloads Nginx** — sends a reload signal to pick up any config changes (works for both system-service and Docker-based Nginx)

Database migrations are applied automatically on backend startup, so any schema changes included in the update are handled without manual intervention.

### Manual update steps

If you prefer to run each step individually, or need to update only one component:

**Pull latest code:**
```bash
cd /opt/lccm
git pull
```

**Rebuild frontend only:**
```bash
npm ci
npm run build
sudo cp -r dist/. /var/www/html/
sudo nginx -t && sudo systemctl reload nginx
```

**Rebuild backend only:**
```bash
cd /opt/lccm
docker compose build --pull backend
docker compose up -d --no-deps backend
```

**Apply migrations manually (admin API token required):**
```bash
curl -X POST https://lccm.example.com/api/admin/run-migrations \
  -H "Authorization: Bearer <your-admin-jwt-token>"
```

### Updating environment variables

If a code update introduces new environment variables, add them to `/opt/lccm/backend/.env` before restarting the backend:

```bash
nano /opt/lccm/backend/.env
docker compose restart backend
```

> **Note:** Never change `TOKEN_ENCRYPTION_KEY` on an existing deployment — it will make all stored Linode API tokens unreadable and require re-entry in the Accounts page.

---

## SSL / TLS

### Automatic (via Terraform)

Set `ssl_email` in `terraform.tfvars` before running `terraform apply`. The provisioning script obtains a Let's Encrypt certificate and fully configures Nginx for HTTPS automatically.

```hcl
ssl_email  = "admin@example.com"
ssl_domain = "lccm.example.com"   # your DNS must already point to the VM's IP
```

### Manual (post-deployment)

SSH into the VM and run the included setup script:

```bash
sudo bash /opt/lccm/setup_ssl.sh lccm.example.com admin@example.com
```

This script installs Certbot, obtains a certificate via webroot validation, writes the full Nginx HTTPS configuration, and sets up a systemd timer for automatic renewal.

### Certificate renewal

Renewal is automatic via a systemd timer. To test manually:

```bash
sudo certbot renew --dry-run
```

---

## Database Migrations

Migrations run automatically when the backend starts. They are idempotent — each migration is only applied once regardless of how many times the backend restarts.

To trigger migrations manually via the API (admin role required):

```bash
curl -X POST https://lccm.example.com/api/admin/run-migrations \
  -H "Authorization: Bearer <your-admin-jwt-token>"
```

### Migration history

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Core tables: users, accounts, resources, compliance rules/results/profiles |
| `002_seed_rules_profiles.sql` | 29 built-in compliance rules and 6 default profiles |
| `003_profiles_overrides_improvements.sql` | Per-account rule overrides |
| `004_unique_builtin_rules.sql` | Uniqueness constraints on built-in rules |
| `005_account_rule_configs.sql` | Per-account rule configuration overrides |
| `006_new_compliance_rules.sql` | Additional rule implementations |
| `007_reports.sql` | Reports and compliance snapshot tables |
| `008_seventeen_new_rules.sql` | 17 additional compliance rules |
| `009_new_security_profiles.sql` | Extended security profiles |
| `010_security_schema_fixes.sql` | Schema refinements |
| `011_revoked_tokens.sql` | JWT token revocation tracking |
| `012_sync_schedule.sql` | Sync scheduling metadata |
| `013_vpc_rules.sql` | VPC-specific compliance rules |
| `014_two_factor_auth.sql` | TOTP-based two-factor authentication |
| `015_totp_lockout.sql` | TOTP lockout and rate limiting |
| `016_sync_profile_rule_counts.sql` | Profile rule count statistics |
| `017_per_account_sync_interval.sql` | Per-account sync interval configuration |
| `018_mcp_api_keys.sql` | MCP API key management |

---

## Automated Sync Scheduling

LCCM exposes a protected endpoint for external schedulers. Call it from cron, a Kubernetes CronJob, GitHub Actions, or any other scheduler.

### Endpoint

```
GET  /api/refresh?token=<REFRESH_API_SECRET>
POST /api/refresh
     Authorization: Bearer <REFRESH_API_SECRET>
```

### Cron example (every 6 hours)

```bash
# crontab -e
0 */6 * * * curl -s "https://lccm.example.com/api/refresh?token=your-refresh-secret" >> /var/log/lccm-sync.log 2>&1
```

### Systemd timer example

```ini
# /etc/systemd/system/lccm-sync.timer
[Unit]
Description=LCCM sync trigger

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/lccm-sync.service
[Unit]
Description=LCCM sync

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -s "https://lccm.example.com/api/refresh?token=your-refresh-secret"
```

A ready-made script is also available at `backend/sync_cron.sh`.

---

## User Roles & Access Control

LCCM uses a three-tier RBAC model combined with per-account access grants.

| Role | Description |
|------|-------------|
| **Admin** | Full access to all accounts, users, rules, and settings |
| **Power User** | Can manage accounts, trigger syncs, and view compliance data |
| **Auditor** | Read-only access to accounts they have been explicitly granted |

### Per-account access

Admins can grant users access to individual Linode accounts with optional feature restrictions:

- `can_view_compliance` — allows viewing compliance results
- `can_view_costs` — allows viewing cost-related data

Admins automatically have access to all accounts regardless of explicit grants.

### Password requirements

Passwords must be at least 12 characters and include at least one uppercase letter, one lowercase letter, one digit, and one special character.

---

## API Reference

The full API documentation is in `API.md`. Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Authenticate and receive a JWT token |
| `POST` | `/api/auth/register` | Create an account (only when `ALLOW_REGISTRATION=true`) |
| `GET` | `/api/auth/me` | Get current user info |
| `GET` | `/api/accounts` | List connected Linode accounts |
| `POST` | `/api/accounts` | Add a Linode account |
| `GET` | `/api/resources` | List synced resources |
| `GET` | `/api/compliance/results` | List compliance findings |
| `GET` | `/api/compliance/score` | Get current compliance score |
| `PUT` | `/api/compliance/results/{id}/acknowledge` | Acknowledge a finding |
| `POST` | `/api/refresh` | Trigger a sync and evaluation |
| `GET` | `/api/refresh/stream` | Stream sync progress via Server-Sent Events |
| `GET` | `/api/reports` | List saved reports |
| `POST` | `/api/reports` | Generate a new report snapshot |
| `GET` | `/api/events` | List Linode events |
| `GET` | `/health` | Health check |

All protected endpoints require:

```
Authorization: Bearer <jwt-token>
```

The `/api/refresh` endpoint also accepts `?token=<REFRESH_API_SECRET>` as a query parameter for cron use.

---

## Troubleshooting

### Application not reachable after deploy

The VM provisioning script runs in the background after Terraform completes. Allow 2–3 minutes after `terraform apply` finishes for the application to come online. Check provisioning progress:

```bash
ssh root@<vm_ip>
sudo journalctl -u cloud-final -f
```

### Backend fails to start

**Check:**
- All required environment variables in `/opt/lccm/backend/.env` are set
- `TOKEN_ENCRYPTION_KEY` is a valid Fernet key (44 base64 characters ending in `=`)
- Database is reachable and `DB_SSL=require` is set for Akamai Managed Databases

```bash
ssh root@<vm_ip>
sudo journalctl -u lccm-backend -f
```

### Cannot connect to the database

**Check:**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are correct in `/opt/lccm/backend/.env`
- The VM's private IP is in the database's allowed hosts list (Terraform configures this automatically via the VPC)
- Firewall rules allow TCP on the database port from the VM

### Linode API tokens not working after `TOKEN_ENCRYPTION_KEY` change

Rotating `TOKEN_ENCRYPTION_KEY` makes all stored tokens unreadable. Re-enter each token in the **Accounts** page after changing this value.

### CORS errors in the browser

**Check:**
- `CORS_ORIGINS` includes the exact origin used to access the frontend (e.g., `https://lccm.example.com` — no trailing slash)
- `VITE_API_BASE` in the built frontend matches the backend URL exactly (requires a rebuild if changed)

### Sync returns no resources

**Check:**
- The Linode API token has the correct read permissions (see [Prerequisites](#prerequisites))
- The token belongs to the correct account

### 401 errors after rotating `JWT_SECRET`

All active sessions are invalidated when `JWT_SECRET` changes. All users must log in again.

---

## Additional Documentation

| File | Contents |
|------|----------|
| `API.md` | Full API reference with request/response examples |
| `USER_GUIDE.md` | End-user guide for all application features |
| `NGINX_SSL_SETUP.md` | Detailed Nginx and SSL/TLS configuration guide |
| `summary.md` | Technical specification: database schema and rule evaluation logic |
| `backend/openapi.yaml` | OpenAPI 3.0 specification |

---

## Security Notes

- Never commit `terraform.tfvars` to version control — it contains secrets. It is listed in `.gitignore` by default.
- Rotate `JWT_SECRET` and `REFRESH_API_SECRET` periodically. Rotating `JWT_SECRET` invalidates all active sessions.
- Keep `ALLOW_REGISTRATION=false` at all times except when explicitly creating a new user account.
- Use a dedicated read-only Linode API token for each connected account.
- Enable 2FA on your LCCM admin account after first login.
