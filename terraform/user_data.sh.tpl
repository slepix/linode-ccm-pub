#!/bin/bash
set -euo pipefail
exec > /var/log/user_data.log 2>&1

# ─── System packages ──────────────────────────────────────────────────────────
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git curl ca-certificates gnupg \
  python3 python3-pip python3-venv \

curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh ./get-docker.sh

systemctl enable --now docker

# ─── Clone application ────────────────────────────────────────────────────────
APP_DIR="/opt/app"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "${git_repo_url}" "$APP_DIR"
fi
cd "$APP_DIR"

# ─── Resolve CORS origins ─────────────────────────────────────────────────────
# If cors_origins was left empty, derive the Linode rDNS hostname from the
# instance's public IP via the metadata service (no circular Terraform dep).
# API: PUT /v1/token → token, then GET /v1/network → ipv4.public[0]
CORS_ORIGINS_VALUE="${cors_origins}"
if [ -z "$CORS_ORIGINS_VALUE" ]; then
  META_TOKEN=$(curl -sf --connect-timeout 5 -X PUT \
    -H "Metadata-Token-Expiry-Seconds: 60" \
    http://169.254.169.254/v1/token 2>/dev/null || true)
  if [ -n "$META_TOKEN" ]; then
    PUBLIC_IP=$(curl -sf --connect-timeout 5 \
      -H "Metadata-Token: $META_TOKEN" \
      -H "Accept: application/json" \
      http://169.254.169.254/v1/network 2>/dev/null \
      | grep -oP '"public":\s*\["\K[^"]+' | head -1 || true)
  fi
  if [ -z "$${PUBLIC_IP:-}" ]; then
    PUBLIC_IP=$(hostname -I | awk '{print $1}')
  fi
  IP_DASHES=$(echo "$PUBLIC_IP" | tr '.' '-')
  CORS_ORIGINS_VALUE="http://$${IP_DASHES}.ip.linodeusercontent.com"
  echo "Auto-derived CORS origin: $CORS_ORIGINS_VALUE"
fi

# ─── Write backend/.env ───────────────────────────────────────────────────────
cat > "$APP_DIR/backend/.env" <<'ENVEOF'
DB_HOST=${db_host}
DB_PORT=${db_port}
DB_NAME=${db_name}
DB_USER=${app_db_user}
DB_SSL=require

JWT_SECRET=${jwt_secret}
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=${jwt_expire_minutes}

LINODE_API_BASE=https://api.linode.com/v4
REFRESH_API_SECRET=${refresh_api_secret}

TOKEN_ENCRYPTION_KEY=${token_encryption_key}

CORS_ORIGINS=CORS_PLACEHOLDER
ALLOW_REGISTRATION=${allow_registration}
TRUSTED_PROXY_COUNT=${trusted_proxy_count}
ENVEOF

# Replace CORS placeholder with actual value (after heredoc to avoid bash expansion)
sed -i "s|CORS_PLACEHOLDER|$CORS_ORIGINS_VALUE|g" "$APP_DIR/backend/.env"
chmod 600 "$APP_DIR/backend/.env"

# ─── Run setup_db.py (creates app db/user + runs migrations) ──────────────────
python3 -m venv /opt/venv
/opt/venv/bin/pip install --quiet psycopg2-binary

/opt/venv/bin/python "$APP_DIR/backend/setup_db.py" \
  --host "${db_host}" \
  --port "${db_port}" \
  --root-user "${db_root_user}" \
  --root-password "${db_root_password}" \
  --admin-db defaultdb \
  --db-name "${db_name}" \
  --app-user "${app_db_user}" \
  --ssl-mode require \
  --write-env

# ─── Start application via Docker Compose ────────────────────────────────────
docker compose -f "$APP_DIR/docker-compose.yml" up -d --build

# ─── Wait for backend to become healthy ───────────────────────────────────────
echo "Waiting for backend to be ready..."
BACKEND_URL="http://localhost:8000/health"
for i in $(seq 1 60); do
  if curl -sf "$BACKEND_URL" > /dev/null 2>&1; then
    echo "Backend is healthy after $${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: Backend did not become healthy within 60 seconds"
    docker compose -f "$APP_DIR/docker-compose.yml" logs backend
    exit 1
  fi
  sleep 5
done

# ─── Create initial admin account (if credentials provided) ───────────────────
%{ if initial_admin_email != "" && initial_admin_password != "" }
echo "Creating initial admin account: ${initial_admin_email}"
REGISTER_RESPONSE=$(curl -sf -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${initial_admin_email}\",\"password\":\"${initial_admin_password}\"}" \
  2>&1) && echo "Admin account created: $REGISTER_RESPONSE" \
         || echo "Admin account creation failed (may already exist): $REGISTER_RESPONSE"

# Disable registration after first admin is created
sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' "$APP_DIR/backend/.env"
docker compose -f "$APP_DIR/docker-compose.yml" restart backend

echo "Registration endpoint disabled."
%{ endif }

echo "Bootstrap complete at $(date -u)"
