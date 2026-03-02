#!/bin/bash
# Configure CORS on the GCS upload bucket.
# Allows browsers to PUT objects using presigned URLs.
#
# Usage:
#   ./deploy/setup-gcs-cors.sh                    # uses GCS_BUCKET from .env
#   ./deploy/setup-gcs-cors.sh my-bucket-name     # explicit bucket
#
# Prerequisites:
#   - gcloud CLI authenticated with bucket-admin permissions
#   - Or run on GCE VM with appropriate service account

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORS_FILE="$SCRIPT_DIR/gcs-cors.json"

# Determine bucket name
BUCKET="${1:-${GCS_BUCKET:-}}"
if [ -z "$BUCKET" ]; then
  # Try to read from .env
  if [ -f "$SCRIPT_DIR/../.env" ]; then
    BUCKET=$(grep '^GCS_BUCKET=' "$SCRIPT_DIR/../.env" | cut -d= -f2 | tr -d '"' | tr -d "'")
  fi
fi

if [ -z "$BUCKET" ]; then
  echo "Error: No bucket name. Pass as argument or set GCS_BUCKET in .env"
  exit 1
fi

echo "Setting CORS on gs://$BUCKET ..."
echo "Config: $CORS_FILE"
cat "$CORS_FILE"
echo ""

gcloud storage buckets update "gs://$BUCKET" --cors-file="$CORS_FILE"

echo ""
echo "Verifying CORS config..."
gcloud storage buckets describe "gs://$BUCKET" --format='json(cors_config)'

echo ""
echo "CORS configured successfully on gs://$BUCKET"
