#!/bin/bash
# Setup Let's Encrypt SSL for VI-Agent Staging
# Run ON the staging VM: sudo bash setup-staging-ssl.sh [domain]
set -euo pipefail

DOMAIN="${1:-staging.internal.collov.ai}"
APP_DIR="/opt/vi-agent"
SSL_DIR="${APP_DIR}/ssl"
COMPOSE_FILE="${APP_DIR}/docker-compose.staging.yml"

echo "=== SSL Setup for ${DOMAIN} ==="

# 1. Verify DNS points here
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | tail -1)
MY_IP=$(curl -sf http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H "Metadata-Flavor: Google" 2>/dev/null || curl -sf ifconfig.me)
if [ "$RESOLVED_IP" != "$MY_IP" ]; then
    echo "ERROR: ${DOMAIN} resolves to ${RESOLVED_IP}, but this VM is ${MY_IP}"
    echo "Update DNS A record first, then re-run."
    exit 1
fi
echo "DNS OK: ${DOMAIN} → ${MY_IP}"

# 2. Install certbot
if ! command -v certbot &>/dev/null; then
    echo "Installing certbot..."
    apt-get update -qq && apt-get install -y -qq certbot
fi

# 3. Stop frontend to free ports 80/443
echo "Stopping frontend..."
cd "$APP_DIR"
docker compose -f "$COMPOSE_FILE" stop frontend

# 4. Get certificate
echo "Requesting certificate..."
certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email admin@collov.ai \
    --key-type ecdsa

# 5. Link certs to where frontend nginx expects them
echo "Linking certificates..."
ln -sf "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "${SSL_DIR}/cert.pem"
ln -sf "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"   "${SSL_DIR}/key.pem"
chmod 644 "${SSL_DIR}/cert.pem"
chmod 644 "${SSL_DIR}/key.pem"

# 6. Restart frontend
echo "Restarting frontend..."
docker compose -f "$COMPOSE_FILE" up -d frontend

# 7. Setup auto-renewal cron
cat > /etc/cron.d/vi-agent-ssl-renew << CRON
# Renew SSL cert weekly at 3am Monday. Stop frontend briefly for standalone mode.
0 3 * * 1 root cd ${APP_DIR} && docker compose -f ${COMPOSE_FILE} stop frontend && certbot renew --quiet && docker compose -f ${COMPOSE_FILE} up -d frontend
CRON
chmod 644 /etc/cron.d/vi-agent-ssl-renew

# 8. Verify
echo ""
echo "=== Verifying ==="
sleep 3
if curl -sf "https://${DOMAIN}/health" >/dev/null 2>&1; then
    echo "HTTPS OK: https://${DOMAIN}"
else
    echo "WARN: https://${DOMAIN}/health not responding yet (may need a moment)"
    echo "Check: curl -v https://${DOMAIN}/health"
fi

echo ""
echo "=== SSL Setup Complete ==="
echo "  Domain:  https://${DOMAIN}"
echo "  Cert:    /etc/letsencrypt/live/${DOMAIN}/"
echo "  Renewal: weekly via /etc/cron.d/vi-agent-ssl-renew"
