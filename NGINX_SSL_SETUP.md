# Nginx and SSL Setup Guide

This document explains how nginx reverse proxy and Let's Encrypt SSL are configured in LCCM.

## Architecture

The application uses nginx as a reverse proxy with the following setup:

- **Frontend**: Static files served from `/var/www/html`
- **Backend API**: Proxied through `/api` path to backend on `localhost:8000`
- **SSL/TLS**: Automatic HTTPS with Let's Encrypt certificates

## HTTP to HTTPS Flow

1. **Initial deployment**: Application starts on HTTP (port 80)
2. **DNS configuration**: Point your domain to the server's IP address
3. **SSL setup**: Run `setup_ssl.sh` or configure via Terraform
4. **Certificate obtained**: Let's Encrypt issues certificate
5. **Auto-redirect**: All HTTP traffic redirects to HTTPS

## Automatic SSL Setup (Terraform)

Configure SSL during deployment by setting these variables in `terraform.tfvars`:

```hcl
ssl_domain = "lccm.example.com"
ssl_email  = "admin@example.com"
```

**Requirements:**
- Domain must point to the server before deployment
- Port 80 must be accessible for Let's Encrypt validation

## Manual SSL Setup

If you skip automatic setup, you can configure SSL later:

1. **Point your domain to the server**:
   ```bash
   # Verify DNS resolution
   dig +short lccm.example.com
   ```

2. **SSH into the server**:
   ```bash
   ssh root@your-server-ip
   ```

3. **Run the SSL setup script**:
   ```bash
   sudo setup_ssl.sh lccm.example.com admin@example.com
   ```

The script will:
- Obtain SSL certificate from Let's Encrypt
- Update nginx configuration with your domain
- Enable automatic HTTP to HTTPS redirect
- Configure automatic certificate renewal

## Certificate Renewal

Certificates are automatically renewed by certbot:

- **Renewal frequency**: Certbot runs twice daily via systemd timer
- **Renewal threshold**: Certificates renewed when <30 days until expiration
- **Nginx reload**: Automatic after successful renewal
- **Email notifications**: Sent to the email address you provided

Test renewal manually:
```bash
sudo certbot renew --dry-run
```

## Nginx Configuration

The nginx configuration includes:

### Upstream Backend
```nginx
upstream backend {
    server localhost:8000;
}
```

### HTTP Server (Port 80)
- Serves Let's Encrypt challenges
- Redirects to HTTPS when SSL is configured
- Falls back to HTTP if no certificate exists

### HTTPS Server (Port 443)
- Modern TLS configuration (TLSv1.2, TLSv1.3)
- Security headers (HSTS, X-Frame-Options, etc.)
- Gzip compression
- API proxy to backend
- Frontend SPA routing

### API Proxy Configuration
```nginx
location /api/ {
    proxy_pass http://backend/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # ... additional headers
}
```

## Frontend API Client

The frontend automatically detects the environment:

- **Development**: Connects to `http://localhost:8000`
- **Production**: Uses `/api` path (proxied by nginx)

Override with environment variable:
```bash
VITE_API_BASE=https://api.example.com npm run build
```

## Troubleshooting

### Certificate not obtained

Check that:
1. Domain resolves to server: `dig +short yourdomain.com`
2. Port 80 is open: `curl -I http://yourdomain.com`
3. Nginx is serving challenges: `curl http://yourdomain.com/.well-known/acme-challenge/test`

View certbot logs:
```bash
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### HTTP not redirecting to HTTPS

Check if SSL is enabled:
```bash
test -f /etc/nginx/ssl_enabled && echo "SSL enabled" || echo "SSL not enabled"
```

Verify certificate exists:
```bash
sudo ls -la /etc/letsencrypt/live/
```

### API requests failing

Check nginx logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

Test backend directly:
```bash
curl http://localhost:8000/health
```

Test through proxy:
```bash
curl http://localhost/api/health
```

### Certificate renewal failing

Check certbot timer status:
```bash
sudo systemctl status certbot.timer
```

Test renewal:
```bash
sudo certbot renew --dry-run
```

## Security Best Practices

The nginx configuration includes:

1. **Strong TLS**: TLSv1.2 and TLSv1.3 only
2. **HSTS**: 2-year max-age with includeSubDomains
3. **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
4. **OCSP stapling**: Faster certificate validation
5. **Session caching**: Improved performance

## Custom Domain with Load Balancer

If using a load balancer:

1. Configure load balancer SSL termination at the load balancer level
2. Set `trusted_proxy_count = 1` in `terraform.tfvars`
3. Skip the SSL setup (leave `ssl_domain` and `ssl_email` empty)
4. Configure CORS for your custom domain

## Files

- `/etc/nginx/sites-available/default` - Main nginx configuration
- `/etc/letsencrypt/live/{domain}/` - SSL certificates
- `/var/www/html/` - Frontend static files
- `/var/www/certbot/` - Let's Encrypt challenge directory
- `/usr/local/bin/setup_ssl.sh` - SSL setup script

## Ports

- **80**: HTTP (redirects to HTTPS when SSL configured)
- **443**: HTTPS (only active with valid certificate)
- **8000**: Backend (internal only, not exposed)
