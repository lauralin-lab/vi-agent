"""Shared Google Cloud Storage client and configuration constants."""
import logging
import os

import google.auth
import google.auth.compute_engine
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import storage

logger = logging.getLogger(__name__)

GCS_BUCKET = os.getenv("GCS_BUCKET", "vi-uploads")

_credentials = None


def _get_credentials():
    """Get and cache default credentials, refreshing if expired."""
    global _credentials
    if _credentials is None:
        _credentials, _ = google.auth.default()
    if not _credentials.valid:
        _credentials.refresh(AuthRequest())
    return _credentials


def get_gcs_client():
    return storage.Client()


def get_gcs_bucket():
    client = get_gcs_client()
    return client.bucket(GCS_BUCKET)


def get_signing_kwargs():
    """Return extra kwargs for blob.generate_signed_url() on Compute Engine.

    Compute Engine default credentials have no private key, so signed URL
    generation fails. Passing service_account_email + access_token makes
    the library use the IAM signBlob API instead.

    Requires the service account to have roles/iam.serviceAccountTokenCreator
    on itself.
    """
    creds = _get_credentials()
    if isinstance(creds, google.auth.compute_engine.Credentials):
        return {
            "service_account_email": creds.service_account_email,
            "access_token": creds.token,
        }
    return {}
