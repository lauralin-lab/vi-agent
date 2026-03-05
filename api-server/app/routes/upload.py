"""GCS signed URL endpoints for photo/video upload."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ..deps import get_current_user_or_device, get_redis
from ..limiter import limiter
from ..models import User
from ..services.gcs_service import get_gcs_bucket, get_signing_kwargs

logger = logging.getLogger(__name__)

router = APIRouter()

GCS_PREFIX = os.getenv("GCS_PREFIX", "photos/")
VIDEO_PREFIX = os.getenv("VIDEO_PREFIX", "videos/")

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100 MB

ALLOWED_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
}

VIDEO_EXTENSIONS = {"mp4", "webm"}


@router.get("/presign")
@limiter.limit("20/minute")
async def get_presigned_upload_url(
    request: Request,
    ext: str = Query(default="jpg", pattern="^(jpg|jpeg|png|webp|mp4|webm)$"),
    content_length: int = Query(default=0, ge=0, le=MAX_VIDEO_SIZE, alias="size"),
    _user=Depends(get_current_user_or_device),
):
    """Generate a signed GCS PUT URL for direct browser upload.
    Returns the signed URL and the final public URL.
    Validates file size and content type. Videos allow up to 100MB.
    """
    is_video = ext in VIDEO_EXTENSIONS
    max_size = MAX_VIDEO_SIZE if is_video else MAX_UPLOAD_SIZE

    if content_length > max_size:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {max_size // (1024*1024)}MB")

    content_type = ALLOWED_CONTENT_TYPES.get(ext)
    if not content_type:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    try:
        bucket = get_gcs_bucket()
        file_id = uuid.uuid4().hex[:12]
        date_prefix = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        prefix = VIDEO_PREFIX if is_video else GCS_PREFIX
        key = f"{prefix}{date_prefix}/{file_id}.{ext}"

        blob = bucket.blob(key)
        signing = get_signing_kwargs()

        presigned_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15 if is_video else 5),
            method="PUT",
            content_type=content_type,
            **signing,
        )

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
            "media_type": "video" if is_video else "image",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate signed URL: {str(e)}")


class UploadCompleteRequest(BaseModel):
    key: str
    media_type: str = "image"  # image | video
    media_url: str
    thumbnail: str | None = None
    duration: float | None = None
    width: int | None = None
    height: int | None = None


@router.post("/complete")
async def upload_complete(
    req: UploadCompleteRequest,
    user: User = Depends(get_current_user_or_device),
    redis=Depends(get_redis),
):
    """Confirm upload completion and publish vi:media event."""
    media_event = {
        "type": "media_captured",
        "mediaType": req.media_type,
        "mediaUrl": req.media_url,
        "thumbnail": req.thumbnail,
        "duration": req.duration,
        "dimensions": {
            "w": req.width or 0,
            "h": req.height or 0,
        },
    }

    # Publish to vi:media:{uid} for NanoClaw consumption
    if redis:
        await redis.publish(
            f"vi:media:{user.vi_user_id}",
            json.dumps(media_event),
        )
        logger.info("[redis][api] Media published: %s: %s", req.media_type, req.media_url)

    return {"ok": True, "media_type": req.media_type, "key": req.key}
