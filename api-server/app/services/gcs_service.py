"""Shared Google Cloud Storage client and configuration constants."""
import os

from google.cloud import storage

GCS_BUCKET = os.getenv("GCS_BUCKET", "vi-uploads")


def get_gcs_client():
    return storage.Client()


def get_gcs_bucket():
    client = get_gcs_client()
    return client.bucket(GCS_BUCKET)
