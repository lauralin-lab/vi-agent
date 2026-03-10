#!/bin/bash
# Ensure the application user and database exist.
# This script runs on first init (empty volume) via /docker-entrypoint-initdb.d/.
# If the volume was previously initialized with a different user, delete it:
#   docker compose down -v && docker compose up -d

set -e

# POSTGRES_USER and POSTGRES_DB are set by docker-compose environment
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Grant all privileges (the user is already created by the Docker entrypoint)
    GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DB" TO "$POSTGRES_USER";
EOSQL
