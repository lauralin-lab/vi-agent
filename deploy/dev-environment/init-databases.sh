#!/bin/bash
# Initialize shared PostgreSQL with extension support
# Individual databases are created dynamically by create-instance.sh
set -e

echo "=== Shared PostgreSQL initialized ==="
echo "Individual dev databases will be created by create-instance.sh"
