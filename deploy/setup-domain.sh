#!/bin/bash
# Domain Setup for VI-Agent
# Usage: ./setup-domain.sh <domain> <server-ip>

DOMAIN="${1:?Usage: $0 <domain> <server-ip>}"
SERVER_IP="${2:?Usage: $0 <domain> <server-ip>}"

echo "=== Domain Setup Checklist ==="
echo ""
echo "1. DNS Configuration (do this in your DNS provider):"
echo "   Add A record: $DOMAIN → $SERVER_IP"
echo ""
echo "2. Updating nginx config..."
# Update server_name in nginx.conf
sed -i "s/server_name .*;/server_name $DOMAIN;/g" ../frontend/nginx.conf
echo "   ✓ Updated frontend/nginx.conf server_name to $DOMAIN"
echo ""
echo "3. Updating .env CORS_ORIGINS..."
if [ -f ../.env ]; then
    sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN|" ../.env
    echo "   ✓ Updated .env CORS_ORIGINS"
fi
echo ""
echo "4. Next steps:"
echo "   - Run: sudo ./setup-ssl.sh $DOMAIN"
echo "   - Rebuild: docker compose up --build -d"
echo "   - Verify: curl https://$DOMAIN"
