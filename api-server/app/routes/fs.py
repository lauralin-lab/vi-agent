"""FS Proxy routes — read/write/list/delete user files."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from ..deps import get_current_user_or_device
from ..models import User
from ..services.fs_proxy import delete_file, list_directory, read_file, write_file

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def list_dir(
    prefix: str = Query("", description="Directory path to list"),
    user: User = Depends(get_current_user_or_device),
):
    """List files and directories under a prefix."""
    try:
        entries = await list_directory(user.vi_user_id, prefix)
    except NotADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"entries": entries}


@router.get("/{path:path}")
async def read_fs_file(
    path: str,
    user: User = Depends(get_current_user_or_device),
):
    """Read a file from user's directory."""
    try:
        content = await read_file(user.vi_user_id, path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IsADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Try to detect text vs binary
    try:
        text = content.decode("utf-8")
        return Response(content=text, media_type="text/plain")
    except UnicodeDecodeError:
        return Response(content=content, media_type="application/octet-stream")


@router.put("/{path:path}")
async def write_fs_file(
    path: str,
    request: Request,
    user: User = Depends(get_current_user_or_device),
):
    """Write/create a file in user's directory."""
    body = await request.body()
    try:
        await write_file(user.vi_user_id, path, body)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True, "path": path}


@router.delete("/{path:path}")
async def delete_fs_file(
    path: str,
    user: User = Depends(get_current_user_or_device),
):
    """Delete a file from user's directory."""
    try:
        await delete_file(user.vi_user_id, path)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IsADirectoryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True, "path": path}
