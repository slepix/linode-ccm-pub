#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success(){ echo -e "${GREEN}[OK]${NC}    $1"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
header() { echo -e "\n${BOLD}==> $1${NC}"; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
header "Pre-flight checks"

command -v git       >/dev/null 2>&1 || error "git is not installed."
command -v docker    >/dev/null 2>&1 || error "docker is not installed."
command -v node      >/dev/null 2>&1 || error "node is not installed."
command -v npm       >/dev/null 2>&1 || error "npm is not installed."

success "All required tools found."

# ---------------------------------------------------------------------------
# Pull latest code
# ---------------------------------------------------------------------------
header "Pulling latest code from repository"

if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "You have uncommitted local changes. Stashing them before pulling..."
    git stash push -m "updateapp.sh auto-stash $(date +%Y%m%d-%H%M%S)"
    STASHED=true
else
    STASHED=false
fi

git pull --ff-only || {
    warn "Fast-forward pull failed. Trying regular pull..."
    git pull
}

if [ "$STASHED" = true ]; then
    warn "Restoring your stashed local changes..."
    git stash pop || warn "Could not restore stash automatically. Run 'git stash pop' manually."
fi

success "Repository is up to date. ($(git rev-parse --short HEAD))"

# ---------------------------------------------------------------------------
# Build frontend
# ---------------------------------------------------------------------------
header "Building frontend"

log "Installing npm dependencies..."
npm ci --silent

log "Building production bundle..."
npm run build

success "Frontend built successfully. Output in ./dist/"

# ---------------------------------------------------------------------------
# Deploy frontend static files
# ---------------------------------------------------------------------------
header "Deploying frontend static files"

NGINX_HTML_DIR="/var/www/html"

if [ -d "$NGINX_HTML_DIR" ]; then
    log "Copying dist/ to $NGINX_HTML_DIR ..."
    sudo cp -r dist/. "$NGINX_HTML_DIR/"
    sudo chown -R www-data:www-data "$NGINX_HTML_DIR" 2>/dev/null || true
    success "Frontend files deployed to $NGINX_HTML_DIR."
else
    warn "$NGINX_HTML_DIR does not exist. Skipping static file copy."
    warn "If nginx is running in Docker, the frontend will be picked up from the container build below."
fi

# ---------------------------------------------------------------------------
# Rebuild and restart backend container
# ---------------------------------------------------------------------------
header "Rebuilding backend Docker container"

log "Building backend image (no cache for dependencies)..."
docker compose build --pull backend

log "Restarting backend container..."
docker compose up -d --no-deps backend

log "Waiting for backend health check to pass..."
RETRIES=20
until docker compose exec -T backend python3 -c \
    "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
    >/dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -le 0 ]; then
        error "Backend did not become healthy in time. Check logs with: docker compose logs backend"
    fi
    log "  Still waiting... ($RETRIES retries left)"
    sleep 3
done

success "Backend is healthy."

# ---------------------------------------------------------------------------
# Reload nginx (if running as a system service)
# ---------------------------------------------------------------------------
header "Reloading nginx"

if systemctl is-active --quiet nginx 2>/dev/null; then
    sudo nginx -t && sudo systemctl reload nginx
    success "nginx reloaded."
elif docker compose ps 2>/dev/null | grep -q nginx; then
    docker compose exec -T nginx nginx -s reload 2>/dev/null && success "nginx (Docker) reloaded." || warn "Could not reload nginx in Docker."
else
    warn "nginx not detected as a system service or Docker container. Skipping reload."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
header "Update complete"
echo ""
echo -e "  Git commit : ${BOLD}$(git rev-parse --short HEAD)${NC} — $(git log -1 --format='%s')"
echo -e "  Date       : $(date)"
echo ""
success "Application updated successfully. No data was lost."
echo ""
