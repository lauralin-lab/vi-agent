#!/bin/bash
# Show status of all dev environment instances
set -e

BASE_DIR="/opt/vi-agent"
REGISTRY="$BASE_DIR/registry.json"

if [ ! -f "$REGISTRY" ]; then
    echo "No registry found. No instances deployed yet."
    exit 0
fi

echo "=== VI-Agent Dev Environment Status ==="
echo ""

# Server info
SERVER_IP=$(python3 -c "import json; print(json.load(open('$REGISTRY'))['server_ip'])")
echo "Server: $SERVER_IP"
echo ""

# Shared services
echo "--- Shared Services ---"
docker compose -f "$BASE_DIR/shared/docker-compose.yml" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  Not running"
echo ""

# Instances
echo "--- Developer Instances ---"
python3 -c "
import json
with open('$REGISTRY') as f: r=json.load(f)
instances = r.get('instances', {})
if not instances:
    print('  No instances deployed.')
else:
    print(f'  {\"Name\":<12} {\"Slot\":<6} {\"Frontend\":<18} {\"API\":<18} {\"Branch\":<12} {\"Commit\":<10} {\"Deployed\":<22} {\"Status\":<10}')
    print('  ' + '-' * 110)
    for name, info in instances.items():
        ip = r['server_ip']
        print(f'  {name:<12} {info[\"slot\"]:<6} http://{ip}:{info[\"ports\"][\"frontend\"]:<6} http://{ip}:{info[\"ports\"][\"api\"]:<6} {info[\"branch\"]:<12} {info[\"commit\"]:<10} {info[\"deployed_at\"]:<22} {info[\"status\"]:<10}')
"
echo ""

# Docker resource usage
echo "--- Resource Usage ---"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -20
echo ""
