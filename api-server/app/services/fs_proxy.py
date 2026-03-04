"""FS Proxy — local filesystem access with path traversal protection."""

import asyncio
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

USER_DATA_DIR = os.getenv("USER_DATA_DIR", "./data/users")


def _user_root(uid: str) -> Path:
    """Get the root directory for a user."""
    return Path(USER_DATA_DIR) / uid


def _safe_path(uid: str, rel_path: str) -> Path:
    """Resolve path and ensure it's within user's directory."""
    root = _user_root(uid).resolve()
    target = (root / rel_path).resolve()
    if not str(target).startswith(str(root)):
        raise PermissionError("Path traversal detected")
    return target


def _sync_read_file(uid: str, path: str) -> bytes:
    target = _safe_path(uid, path)
    if not target.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if not target.is_file():
        raise IsADirectoryError(f"Path is a directory: {path}")
    return target.read_bytes()


async def read_file(uid: str, path: str) -> bytes:
    """Read a file from user's directory."""
    return await asyncio.to_thread(_sync_read_file, uid, path)


def _sync_write_file(uid: str, path: str, content: bytes):
    target = _safe_path(uid, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


async def write_file(uid: str, path: str, content: bytes):
    """Write a file to user's directory."""
    await asyncio.to_thread(_sync_write_file, uid, path, content)


def _sync_delete_file(uid: str, path: str):
    target = _safe_path(uid, path)
    if not target.exists():
        raise FileNotFoundError(f"File not found: {path}")
    if target.is_dir():
        raise IsADirectoryError(f"Cannot delete directory: {path}")
    target.unlink()


async def delete_file(uid: str, path: str):
    """Delete a file from user's directory."""
    await asyncio.to_thread(_sync_delete_file, uid, path)


def _sync_list_directory(uid: str, prefix: str = "") -> list[dict]:
    root = _user_root(uid)
    target = _safe_path(uid, prefix) if prefix else root.resolve()

    if not target.exists():
        return []
    if not target.is_dir():
        raise NotADirectoryError(f"Not a directory: {prefix}")

    entries = []
    for item in sorted(target.iterdir()):
        rel = item.relative_to(root.resolve())
        entries.append({
            "name": item.name,
            "path": str(rel),
            "type": "directory" if item.is_dir() else "file",
            "size": item.stat().st_size if item.is_file() else None,
        })
    return entries


async def list_directory(uid: str, prefix: str = "") -> list[dict]:
    """List files and directories under a prefix."""
    return await asyncio.to_thread(_sync_list_directory, uid, prefix)
