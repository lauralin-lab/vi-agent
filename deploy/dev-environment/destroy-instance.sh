#!/bin/bash
# Destroy a dev environment instance
# Usage: ./destroy-instance.sh <name> [--keep-data]
set -e

DEV_NAME="$1"
KEEP_DATA="$2"

if [ -z "$DEV_NAME" ]; then
    echo "ERROR: Developer name required"
    echo "Usage: $0 <name> [--keep-data]"
    exit 1
fi

BASE_DIR="/opt/vi-agent"
INSTANCE_DIR="$BASE_DIR/instances/$DEV_NAME"
REGISTRY="$BASE_DIR/registry.json"

echo "=== Destroying dev instance: $DEV_NAME ==="

# Stop and remove containers
if [ -d "$INSTANCE_DIR" ]; then
    cd "$INSTANCE_DIR"
    docker compose down --remove-orphans
    echo "Containers stopped."
fi

# Drop database (unless --keep-data)
if [ "$KEEP_DATA" != "--keep-data" ]; then
    echo "Dropping database vi_$DEV_NAME..."
    PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-vi_shared_dev}" psql -h localhost -U vi_admin -d vi_shared -c \
        "DROP DATABASE IF EXISTS vi_$DEV_NAME;" 2>/dev/null || true
    PGPASSWORD="${POSTGRES_ADMIN_PASSWORD:-vi_shared_dev}" psql -h localhost -U vi_admin -d vi_shared -c \
        "DROP ROLE IF EXISTS vi_$DEV_NAME;" 2>/dev/null || true
    echo "Database dropped."
fi

# Remove instance directory
rm -rf "$INSTANCE_DIR"
echo "Instance directory removed."

# Update registry
python3 -c "
import json
with open('$REGISTRY','r') as f: r=json.load(f)
if '$DEV_NAME' in r['instances']:
    del r['instances']['$DEV_NAME']
with open('$REGISTRY','w') as f: json.dump(r,f,indent=2)
"

echo ""
echo "=== Instance '$DEV_NAME' destroyed ==="
