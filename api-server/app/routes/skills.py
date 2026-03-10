"""Skill Manager routes — CRUD + enable/disable + stats."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..deps import get_current_user_or_device, get_redis
from ..models import User
from ..services.skill_manager import (
    create_skill,
    delete_skill,
    disable_skill,
    enable_skill,
    get_skill,
    get_skill_stats,
    list_skills,
    update_skill,
)

router = APIRouter()


class CreateSkillRequest(BaseModel):
    slug: str
    name: str
    icon: str = ""
    description: str = ""
    category: str = "general"
    version: str = "1.0.0"
    skill_md: str = ""
    tags: list[str] = []


class UpdateSkillRequest(BaseModel):
    name: str | None = None
    icon: str | None = None
    description: str | None = None
    category: str | None = None
    version: str | None = None
    skill_md: str | None = None
    tags: list[str] | None = None


@router.get("")
async def list_all_skills(
    user: User = Depends(get_current_user_or_device),
):
    """List all available skills (shared + user)."""
    skills = await list_skills(user.vi_user_id)
    return {"skills": skills}


@router.get("/{slug}")
async def get_skill_detail(
    slug: str,
    user: User = Depends(get_current_user_or_device),
):
    """Get skill detail including manifest and description."""
    try:
        skill = await get_skill(user.vi_user_id, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill not found: {slug}")
    return skill


@router.post("")
async def create_new_skill(
    req: CreateSkillRequest,
    user: User = Depends(get_current_user_or_device),
):
    """Create a new user custom skill."""
    manifest = {
        "name": req.name,
        "slug": req.slug,
        "icon": req.icon,
        "description": req.description,
        "category": req.category,
        "version": req.version,
        "tags": req.tags,
    }
    try:
        await create_skill(user.vi_user_id, req.slug, manifest, req.skill_md)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "slug": req.slug}


@router.put("/{slug}")
async def update_existing_skill(
    slug: str,
    req: UpdateSkillRequest,
    user: User = Depends(get_current_user_or_device),
):
    """Update a user skill."""
    updates = req.model_dump(exclude_none=True)
    skill_md = updates.pop("skill_md", None)

    manifest = updates if updates else None
    try:
        await update_skill(user.vi_user_id, slug, manifest=manifest, skill_md=skill_md)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "slug": slug}


@router.delete("/{slug}")
async def delete_existing_skill(
    slug: str,
    user: User = Depends(get_current_user_or_device),
):
    """Delete a user skill."""
    try:
        await delete_skill(user.vi_user_id, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "slug": slug}


@router.get("/{slug}/stats")
async def skill_stats(
    slug: str,
    user: User = Depends(get_current_user_or_device),
    redis=Depends(get_redis),
):
    """Get execution statistics for a skill."""
    try:
        stats = await get_skill_stats(user.vi_user_id, slug, redis=redis)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return stats


@router.post("/{slug}/enable")
async def enable_existing_skill(
    slug: str,
    user: User = Depends(get_current_user_or_device),
):
    """Enable a skill."""
    try:
        await enable_skill(user.vi_user_id, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "slug": slug, "enabled": True}


@router.post("/{slug}/disable")
async def disable_existing_skill(
    slug: str,
    user: User = Depends(get_current_user_or_device),
):
    """Disable a skill."""
    try:
        await disable_skill(user.vi_user_id, slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"ok": True, "slug": slug, "enabled": False}
