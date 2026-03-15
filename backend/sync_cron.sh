#!/bin/bash
set -euo pipefail

LOCK_FILE="/var/lock/ccm_sync.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] sync_cron: previous sync still running, skipping." >&2
  exit 0
fi

ENV_FILE="$(dirname "$0")/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

REFRESH_API_SECRET=""
while IFS='=' read -r key value; do
  key="${key%%#*}"
  key="${key//[[:space:]]/}"
  value="${value%%#*}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [ "$key" = "REFRESH_API_SECRET" ]; then
    REFRESH_API_SECRET="$value"
    break
  fi
done < "$ENV_FILE"

if [ -z "$REFRESH_API_SECRET" ]; then
  echo "ERROR: REFRESH_API_SECRET not set in $ENV_FILE" >&2
  exit 1
fi

BACKEND_URL="http://localhost:8000/api/refresh/scheduled"

RESPONSE=$(curl -sf --max-time 300 \
  -H "Authorization: Bearer $REFRESH_API_SECRET" \
  "$BACKEND_URL" 2>&1) || {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] sync_cron: curl failed: $RESPONSE" >&2
  exit 1
}

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] sync_cron: $RESPONSE"
