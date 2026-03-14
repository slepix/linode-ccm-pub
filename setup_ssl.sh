#!/bin/bash
set -euo pipefail

# Setup SSL with Let's Encrypt for LCCM
# This script configures certbot and obtains SSL certificates

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 lccm.example.com admin@example.com"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo "Email address is required for Let's Encrypt notifications"
    exit 1
fi

echo "Setting up SSL for domain: $DOMAIN"
echo "Contact email: $EMAIL"

# Create certbot webroot directory
mkdir -p /var/www/certbot

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Obtain certificate
echo "Obtaining SSL certificate..."
certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive

if [ $? -eq 0 ]; then
    echo "SSL certificate obtained successfully"

    # Update nginx configuration with actual domain
    sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/default

    # Enable SSL redirect
    touch /etc/nginx/ssl_enabled

    # Test nginx configuration
    nginx -t

    # Reload nginx
    systemctl reload nginx

    # Setup automatic renewal
    echo "Setting up automatic certificate renewal..."

    # Create renewal hook to reload nginx
    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
systemctl reload nginx
EOF
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

    # Test renewal process
    certbot renew --dry-run

    echo "SSL setup complete! Your site is now available at https://$DOMAIN"
else
    echo "Failed to obtain SSL certificate"
    echo "Make sure:"
    echo "  1. Domain $DOMAIN points to this server's IP address"
    echo "  2. Port 80 is open and accessible from the internet"
    echo "  3. Nginx is running and serving the .well-known/acme-challenge path"
    exit 1
fi
