#!/bin/bash
# SSL Certificate Setup for VI-Agent
# Usage: sudo ./setup-ssl.sh <domain>
# Example: sudo ./setup-ssl.sh app.vi-agent.com

DOMAIN="${1:?Usage: $0 <domain>}"

echo "=== Setting up SSL for $DOMAIN ==="

# Install certbot if needed
if ! command -v certbot &>/dev/null; then
    echo "Installing certbot..."
    apt-get update && apt-get install -y certbot python3-certbot-nginx
fi

# Get certificate
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@$DOMAIN

# Set up auto-renewal
echo "0 0 * * * root certbot renew --quiet" > /etc/cron.d/certbot-renew

echo "=== SSL setup complete for $DOMAIN ==="
echo "Certificate will auto-renew via cron."
