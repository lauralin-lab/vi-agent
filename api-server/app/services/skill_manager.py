"""Skill Manager — CRUD for shared and user skills."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

SHARED_SKILLS_DIR = os.getenv("SHARED_SKILLS_DIR", "./data/shared/skills")
USER_DATA_DIR = os.getenv("USER_DATA_DIR", "./data/users")

_SLUG_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


def _safe_slug(slug: str) -> str:
    """Validate slug to prevent path traversal. Returns the slug if valid, raises ValueError otherwise."""
    if not slug or not _SLUG_RE.match(slug):
        raise ValueError(
            f"Invalid skill slug: {slug!r}. "
            "Only alphanumeric characters, hyphens, and underscores are allowed."
        )
    return slug


def _shared_skills_root() -> Path:
    return Path(SHARED_SKILLS_DIR)


def _user_skills_root(uid: str) -> Path:
    return Path(USER_DATA_DIR) / uid / "skills"


def _load_manifest(skill_dir: Path) -> dict | None:
    """Load manifest.json from a skill directory."""
    manifest_path = skill_dir / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text())
    except Exception:
        logger.warning("Failed to read manifest: %s", manifest_path)
        return None


def _load_skill_md(skill_dir: Path) -> str | None:
    """Load skill.md content from a skill directory."""
    md_path = skill_dir / "skill.md"
    if not md_path.exists():
        return None
    return md_path.read_text()


def _sync_list_skills(uid: str) -> list[dict]:
    skills = []
    shared_root = _shared_skills_root()
    if shared_root.exists():
        for d in sorted(shared_root.iterdir()):
            if d.is_dir():
                manifest = _load_manifest(d)
                if manifest:
                    skills.append({**manifest, "source": "shared", "enabled": True})
    user_root = _user_skills_root(uid)
    if user_root.exists():
        for d in sorted(user_root.iterdir()):
            if d.is_dir():
                manifest = _load_manifest(d)
                if manifest:
                    disabled_marker = d / ".disabled"
                    skills.append({
                        **manifest,
                        "source": "user",
                        "enabled": not disabled_marker.exists(),
                    })
    return skills


async def list_skills(uid: str) -> list[dict]:
    """List all available skills (shared + user)."""
    return await asyncio.to_thread(_sync_list_skills, uid)


def _sync_get_skill(uid: str, slug: str) -> dict | None:
    user_dir = _user_skills_root(uid) / slug
    shared_dir = _shared_skills_root() / slug
    skill_dir = user_dir if user_dir.exists() else shared_dir
    if not skill_dir.exists():
        return None
    manifest = _load_manifest(skill_dir)
    if not manifest:
        return None
    description = _load_skill_md(skill_dir)
    disabled_marker = skill_dir / ".disabled"
    source = "user" if skill_dir == user_dir else "shared"
    return {
        **manifest,
        "description_md": description,
        "source": source,
        "enabled": not disabled_marker.exists(),
    }


async def get_skill(uid: str, slug: str) -> dict | None:
    """Get skill detail including manifest and description."""
    slug = _safe_slug(slug)
    return await asyncio.to_thread(_sync_get_skill, uid, slug)


def _sync_create_skill(uid: str, slug: str, manifest: dict, skill_md: str = ""):
    skill_dir = _user_skills_root(uid) / slug
    if skill_dir.exists():
        raise FileExistsError(f"Skill already exists: {slug}")
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    if skill_md:
        (skill_dir / "skill.md").write_text(skill_md)


async def create_skill(uid: str, slug: str, manifest: dict, skill_md: str = ""):
    """Create a new user skill."""
    slug = _safe_slug(slug)
    await asyncio.to_thread(_sync_create_skill, uid, slug, manifest, skill_md)


def _sync_update_skill(uid: str, slug: str, manifest: dict | None = None, skill_md: str | None = None):
    skill_dir = _user_skills_root(uid) / slug
    if not skill_dir.exists():
        raise FileNotFoundError(f"Skill not found: {slug}")
    if manifest is not None:
        existing = _load_manifest(skill_dir) or {}
        existing.update(manifest)
        (skill_dir / "manifest.json").write_text(json.dumps(existing, indent=2))
    if skill_md is not None:
        (skill_dir / "skill.md").write_text(skill_md)


async def update_skill(uid: str, slug: str, manifest: dict | None = None, skill_md: str | None = None):
    """Update an existing user skill."""
    slug = _safe_slug(slug)
    await asyncio.to_thread(_sync_update_skill, uid, slug, manifest, skill_md)


def _sync_delete_skill(uid: str, slug: str):
    skill_dir = _user_skills_root(uid) / slug
    if not skill_dir.exists():
        raise FileNotFoundError(f"Skill not found: {slug}")
    shutil.rmtree(skill_dir)


async def delete_skill(uid: str, slug: str):
    """Delete a user skill."""
    slug = _safe_slug(slug)
    await asyncio.to_thread(_sync_delete_skill, uid, slug)


def _sync_enable_skill(uid: str, slug: str):
    skill_dir = _user_skills_root(uid) / slug
    if not skill_dir.exists():
        raise FileNotFoundError(f"Skill not found: {slug}")
    (skill_dir / ".disabled").unlink(missing_ok=True)


async def enable_skill(uid: str, slug: str):
    """Enable a skill by removing .disabled marker."""
    slug = _safe_slug(slug)
    await asyncio.to_thread(_sync_enable_skill, uid, slug)


def _sync_disable_skill(uid: str, slug: str):
    skill_dir = _user_skills_root(uid) / slug
    if not skill_dir.exists():
        raise FileNotFoundError(f"Skill not found: {slug}")
    (skill_dir / ".disabled").touch()


async def disable_skill(uid: str, slug: str):
    """Disable a skill by creating .disabled marker."""
    slug = _safe_slug(slug)
    await asyncio.to_thread(_sync_disable_skill, uid, slug)


async def get_skill_stats(uid: str, slug: str, redis=None) -> dict:
    """Get execution statistics for a skill."""
    slug = _safe_slug(slug)
    stats = {"slug": slug, "total_executions": 0, "last_executed": None}
    if redis:
        try:
            key = f"skill:stats:{uid}:{slug}"
            data = await redis.hgetall(key)
            if data:
                stats["total_executions"] = int(data.get("total_executions", 0))
                stats["last_executed"] = data.get("last_executed")
        except Exception:
            pass
    return stats
