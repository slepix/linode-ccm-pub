# Linode Cloud Compliance Manager (LCCM)

A cloud compliance and security management platform for Linode (Akamai Cloud) infrastructure. LCCM connects to one or more Linode accounts, syncs all infrastructure resources, evaluates them against built-in compliance rules, and provides a unified dashboard for tracking your security posture over time.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Deployment Options](#deployment-options)
   - [Option A: Terraform (Recommended)](#option-a-terraform-recommended)
   - [Option B: Docker Compose (Self-Managed Server)](#option-b-docker-compose-self-managed-server)
   - [Option C: Manual / Local Development](#option-c-manual--local-development)
5. [Environment Variables Reference](#environment-variables-reference)
6. [First Login & Initial Setup](#first-login--initial-setup)
7. [SSL / TLS](#ssl--tls)
8. [Database Migrations](#database-migrations)
9. [Automated Sync Scheduling](#automated-sync-scheduling)
10. [User Roles & Access Control](#user-roles--access-control)
11. [API Reference](#api-reference)
12. [Nixpacks / PaaS Deployment](#nixpacks--paas-deployment)
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
                                             │ (Managed or self)│    │ api.linode.com    │
                                             └──────────────────┘    └───────────────────┘
```

**Frontend** is a React 18 / TypeScript / Tailwind CSS single-page application built with Vite.

**Backend** is a FastAPI application with JWT authentication, async PostgreSQL access via asyncpg, and a sync engine that polls the Linode API on demand or on a schedule.

**Database** is PostgreSQL (Akamai Managed Database recommended for production).

---

## Prerequisites

| Tool | Version | Required For |
|------|---------|--------------|
| Docker + Docker Compose | 24+ | Option B |
| Terraform | 1.5+ | Option A |
| Python | 3.13 | Option C (backend) |
| Node.js | 22+ | Option C (frontend) |
| A Linode account | — | All |
| A Linode Personal Access Token | — | All |

### Linode API Token Permissions

When creating a Personal Access Token in the Linode Cloud Manager, grant **read-only** access to the following:

- Linodes
- Volumes
- Databases
- Firewalls
- VPCs
- Kubernetes (LKE)
- NodeBalancers
- Object Storage
- Events

> You can use a read-write token, but LCCM only reads data — read-only is sufficient and more secure.

---

## Deployment Options

### Option A: Terraform (Recommended)

Terraform provisions everything on Akamai Cloud: a VPC, firewall, Ubuntu VM, and managed PostgreSQL cluster. The VM is configured automatically via `user_data` — it installs Docker, clones the repository, creates the database, and starts the application.

#### 1. Install Terraform

```bash
# macOS
brew install terraform

# Linux
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt-get update && sudo apt-get install terraform
```

#### 2. Configure variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values. Required fields are marked below — see the full [Environment Variables Reference](#environment-variables-reference) for details on each setting.

```hcl
# REQUIRED
linode_token     = "your-linode-pat-here"
vm_root_password = "ChangeMe!SuperStr0ng#Password"
git_repo_url     = "https://github.com/your-org/lccm.git"

# Recommended
region    = "us-mia"   # us-east, us-central, eu-west, ap-south, etc.
env_label = "prod"

# SSH access (add your public key to log in as root)
vm_ssh_keys = [
  "ssh-ed25519 AAAA... you@machine",
]

# VM sizing
vm_type = "g6-standard-2"   # 2 vCPU, 4 GB RAM
vm_image = "linode/ubuntu22.04"

# Managed PostgreSQL
db_type         = "g6-nanode-1"   # use g6-standard-2 for higher load
db_cluster_size = 1               # set to 3 for high availability

# First admin account (created automatically on first boot)
initial_admin_email    = "admin@example.com"
initial_admin_password = "ChangeMe!Admin#Password"

# SSL — provide ssl_email to enable automatic Let's Encrypt HTTPS
ssl_domain = ""                    # optional custom domain
ssl_email  = "admin@example.com"   # set this to enable SSL
```

#### 3. Deploy

```bash
terraform init
terraform plan
terraform apply
```

Terraform will output the VM's public IP address and the database host. Provisioning takes approximately 5–10 minutes (the managed database takes the most time).

#### 4. Access the application

Once provisioning completes, the frontend is available at:

- Without SSL: `http://<vm-ip>` (or the Linode rDNS hostname shown in the output)
- With SSL: `https://<your-domain>` (if `ssl_email` was set)

#### Terraform Outputs

| Output | Description |
|--------|-------------|
| `vm_ip` | Public IP of the application VM |
| `vm_rdns` | Linode rDNS hostname (e.g., `1-2-3-4.ip.linodeusercontent.com`) |
| `db_host` | Managed PostgreSQL hostname |
| `app_url` | Full application URL |

---

### Option B: Docker Compose (Self-Managed Server)

Use this option when you already have a server (any Linux host with Docker installed).

#### 1. Clone the repository

```bash
git clone https://github.com/your-org/lccm.git
cd lccm
```

#### 2. Configure the backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in all required values. See the [Environment Variables Reference](#environment-variables-reference).

Generate the required secrets:

```bash
# JWT secret
python3 -c "import secrets; print(secrets.token_hex(32))"

# Refresh API secret
python3 -c "import secrets; print(secrets.token_hex(32))"

# Token encryption key (Fernet)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

#### 3. Configure the frontend environment

Create a `.env` file in the project root:

```bash
VITE_API_BASE=http://your-server-ip-or-domain
```

If you will be running behind SSL, use `https://`.

#### 4. Build and start

```bash
# Build and start backend
docker compose up -d --build

# Build the frontend
npm ci
npm run build
```

The frontend static files are served by Nginx. See [SSL / TLS](#ssl--tls) for HTTPS setup.

#### 5. Enable registration and create the first admin

Set `ALLOW_REGISTRATION=true` in `backend/.env`, then restart the backend:

```bash
docker compose restart backend
```

Open the application URL and register your admin account. After registering, set `ALLOW_REGISTRATION=false` and restart the backend again.

---

### Option C: Manual / Local Development

#### Backend

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Edit .env with your database and secret values

# Run database migrations and start the server
./start.sh

# Or step by step:
python -m app.migrations.run_migrations
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.

#### Frontend

```bash
# In the project root
npm install

# Create environment file
echo "VITE_API_BASE=http://localhost:8000" > .env

# Start the development server
npm run dev
```

The UI will be available at `http://localhost:5173`.

---

## Environment Variables Reference

### Backend (`backend/.env`)

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
| `REFRESH_API_SECRET` | Yes | — | Bearer secret for the `/api/refresh` endpoint used by cron jobs |
| `CORS_ORIGINS` | Yes | — | Comma-separated list of allowed frontend origins |
| `TOKEN_ENCRYPTION_KEY` | Yes | — | Fernet key for encrypting stored Linode API tokens |
| `ALLOW_REGISTRATION` | No | `false` | Set to `true` only when creating the first admin account |
| `TRUSTED_PROXY_COUNT` | No | `0` | Number of trusted reverse proxy hops (set to `1` if behind a load balancer) |

#### Generating secrets

```bash
# JWT_SECRET and REFRESH_API_SECRET
python3 -c "import secrets; print(secrets.token_hex(32))"

# TOKEN_ENCRYPTION_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

> **Important:** `TOKEN_ENCRYPTION_KEY` must remain the same for the lifetime of the deployment. Changing it will make all stored Linode API tokens unreadable, requiring you to re-enter them in the application.

### Frontend (`.env` in project root)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE` | Yes | — | Backend API base URL (no trailing slash). E.g., `https://lccm.example.com` |

---

## First Login & Initial Setup

### 1. Enable registration

Set `ALLOW_REGISTRATION=true` in `backend/.env` and restart the backend (or set `initial_admin_email` / `initial_admin_password` in `terraform.tfvars` for automatic creation).

### 2. Register the admin account

Navigate to the application URL. You will be presented with a registration screen. The first account created is automatically assigned the **Admin** role.

### 3. Disable registration

After creating your admin account, set `ALLOW_REGISTRATION=false` in `backend/.env` and restart the backend. This closes the public registration endpoint.

```bash
# Docker Compose
docker compose restart backend

# Systemd
sudo systemctl restart lccm-backend
```

### 4. Connect a Linode account

1. Log in to LCCM
2. Navigate to **Accounts**
3. Click **Add Account**
4. Enter a display name and your Linode Personal Access Token
5. Click **Save**

### 5. Run your first sync

Navigate to the **Dashboard** and click **Sync Now**, or navigate to any account and trigger a sync from there. The sync engine will:

1. Fetch all resources from the Linode API
2. Detect configuration changes and create snapshots
3. Evaluate all active compliance rules against each resource
4. Update compliance scores

---

## SSL / TLS

### Automatic SSL (Terraform)

Set `ssl_email` in `terraform.tfvars` before running `terraform apply`. The provisioning script will automatically obtain a Let's Encrypt certificate and configure Nginx for HTTPS.

```hcl
ssl_email  = "admin@example.com"   # enables automatic SSL
ssl_domain = "lccm.example.com"    # optional; uses rDNS hostname if empty
```

### Manual SSL Setup

After deployment, run the included setup script:

```bash
sudo bash setup_ssl.sh lccm.example.com admin@example.com
```

This script will:
1. Install Certbot if not present
2. Obtain a Let's Encrypt certificate via webroot validation
3. Write a full Nginx HTTPS configuration
4. Set up automatic certificate renewal via systemd timer

### Certificate Renewal

Certificates are renewed automatically via a systemd timer created by the setup script. To test renewal manually:

```bash
sudo certbot renew --dry-run
```

---

## Database Migrations

Migrations run automatically at backend startup via `backend/start.sh`. They are also available on demand via the admin API endpoint.

### Automatic (on startup)

The backend runs all pending migrations in order before starting Uvicorn. This is safe to run repeatedly — each migration is only applied once.

### Manual trigger

```bash
# Via the API (admin role required)
curl -X POST http://localhost:8000/api/admin/run-migrations \
  -H "Authorization: Bearer <your-admin-jwt-token>"

# Directly with Python
cd backend
python -m app.migrations.run_migrations
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

LCCM does not include a built-in scheduler daemon. Instead, it exposes a protected endpoint that can be called by any external scheduler (cron, Kubernetes CronJob, GitHub Actions, etc.).

### Endpoint

```
GET /api/refresh?token=<REFRESH_API_SECRET>
POST /api/refresh
  Authorization: Bearer <REFRESH_API_SECRET>
```

### Cron example (every 6 hours)

```bash
# Edit with: crontab -e
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

The `backend/sync_cron.sh` script in the repository provides a ready-made example.

---

## User Roles & Access Control

LCCM uses a three-tier RBAC model combined with per-account access grants.

| Role | Description |
|------|-------------|
| **Admin** | Full access to all accounts, users, rules, and settings |
| **Power User** | Can manage accounts, trigger syncs, and view compliance data |
| **Auditor** | Read-only access to accounts they have been explicitly granted |

### Per-account access

Admins can grant specific users access to individual Linode accounts with optional feature restrictions:

- `can_view_compliance` — allows viewing compliance results
- `can_view_costs` — allows viewing cost-related data

Admins automatically have access to all accounts regardless of explicit grants.

### Password requirements

Passwords must be at least 12 characters and include at least one uppercase letter, one lowercase letter, one digit, and one special character.

---

## API Reference

The full API documentation is available in `API.md`. A brief summary of key endpoints:

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

The `/api/refresh` endpoint also accepts `?token=<REFRESH_API_SECRET>` as a query parameter for cron job use.

---

## Nixpacks / PaaS Deployment

The project includes Nixpacks configuration files for deployment on platforms like Railway, Render, or any Nixpacks-compatible host.

### Frontend (`nixpacks.toml` in project root)

```toml
[phases.setup]
nixPkgs = ["nodejs_22"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npx serve -s dist -l $PORT"
```

### Backend (`backend/nixpacks.toml`)

```toml
[phases.setup]
nixPkgs = ["python313", "postgresql"]

[phases.install]
cmds = [
  "python -m ensurepip --upgrade",
  "python -m pip install --upgrade pip",
  "python -m pip install -r requirements.txt"
]

[start]
cmd = "uvicorn main:app --host 0.0.0.0 --port $PORT"
```

Set all backend environment variables in your platform's secret/environment configuration. The `PORT` variable is set automatically by most PaaS platforms.

---

## Troubleshooting

### Backend fails to start

**Symptom:** `uvicorn` exits immediately with a configuration error.

**Check:**
- All required environment variables in `backend/.env` are set
- `TOKEN_ENCRYPTION_KEY` is a valid Fernet key (44 base64 characters ending in `=`)
- Database connection details are correct and the database is reachable
- `DB_SSL=require` if using Akamai Managed Databases

### Cannot connect to the database

**Symptom:** `asyncpg.exceptions.ConnectionDoesNotExistError` or similar.

**Check:**
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are all correct
- If using Akamai Managed Database, the VM's private IP is in the database's allowed hosts list (Terraform configures this automatically)
- Firewall rules allow TCP on the database port from the application server

### Linode API tokens not working after `TOKEN_ENCRYPTION_KEY` change

If you rotate `TOKEN_ENCRYPTION_KEY`, all stored Linode API tokens become unreadable. You must re-enter each token in the **Accounts** page after changing this key.

### CORS errors in the browser

**Check:**
- `CORS_ORIGINS` in `backend/.env` includes the exact origin used to access the frontend (e.g., `https://lccm.example.com` — no trailing slash)
- `VITE_API_BASE` in the frontend `.env` matches the backend URL exactly

### Sync returns no resources

**Check:**
- The Linode API token has the correct read permissions (see [Prerequisites](#prerequisites))
- The token is for the correct account and region
- The account actually has resources in the selected region

### 401 errors after password / secret changes

JWT tokens are invalidated when `JWT_SECRET` changes. All users must log in again after rotating this secret.

### Viewing backend logs

```bash
# Docker Compose
docker compose logs -f backend

# Systemd
sudo journalctl -u lccm-backend -f
```

---

## Additional Documentation

| File | Contents |
|------|----------|
| `API.md` | Full API reference with request/response examples |
| `USER_GUIDE.md` | End-user guide for all application features |
| `NGINX_SSL_SETUP.md` | Detailed Nginx and SSL/TLS configuration guide |
| `summary.md` | Technical specification including database schema and rule logic |
| `backend/openapi.yaml` | OpenAPI 3.0 specification for the backend API |

---

## Security Notes

- Never commit `backend/.env`, `terraform.tfvars`, or any file containing secrets to version control. Both files are listed in `.gitignore` by default.
- Rotate `JWT_SECRET` and `REFRESH_API_SECRET` periodically. Note that rotating `JWT_SECRET` invalidates all active sessions.
- Keep `ALLOW_REGISTRATION=false` at all times except when explicitly creating a new account.
- Use a dedicated read-only Linode API token for LCCM rather than a full-access token.
- Enable 2FA on your LCCM admin account after first login.
