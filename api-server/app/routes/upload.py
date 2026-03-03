"""GCS signed URL endpoints for photo upload."""
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..deps import get_current_user_or_device
from ..limiter import limiter
from ..services.gcs_service import GCS_BUCKET, get_gcs_bucket, get_signing_kwargs

router = APIRouter()

GCS_PREFIX = os.getenv("GCS_PREFIX", "photos/")


MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
}


@router.get("/presign")
@limiter.limit("20/minute")
async def get_presigned_upload_url(
    request: Request,
    ext: str = Query(default="jpg", pattern="^(jpg|jpeg|png|webp|mp4|webm)$"),
    content_length: int = Query(default=0, ge=0, le=MAX_UPLOAD_SIZE, alias="size"),
    _user=Depends(get_current_user_or_device),
):
    """Generate a signed GCS PUT URL for direct browser upload.
    Returns the signed URL and the final public URL.
    Validates file size (max 10MB) and content type.
    """
    if content_length > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE // (1024*1024)}MB")

    content_type = ALLOWED_CONTENT_TYPES.get(ext)
    if not content_type:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    try:
        bucket = get_gcs_bucket()
        file_id = uuid.uuid4().hex[:12]
        date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        key = f"{GCS_PREFIX}{date_prefix}/{file_id}.{ext}"

        blob = bucket.blob(key)
        signing = get_signing_kwargs()

        presigned_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=5),
            method="PUT",
            content_type=content_type,
            **signing,
        )

        # Generate a signed GET URL so the object is accessible without
        # public-read bucket policy.  7-day expiry covers any single session
        # and prevents 403 errors when gateway/agent fetch the image later.
        public_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(days=7),
            method="GET",
            **signing,
        )

        return {
            "presigned_url": presigned_url,
            "public_url": public_url,
            "key": key,
            "content_type": content_type,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate signed URL: {str(e)}")
