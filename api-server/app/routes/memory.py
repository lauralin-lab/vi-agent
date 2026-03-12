"""Memory CRUD API endpoints — V3 three-layer memory pyramid.

Provides:
- V3 UUID-based endpoints: /memories, /memories/{id}
- V2 filename-based endpoints: /memory, /memory/{filename} (backward compat)
- Device-based (anonymous) endpoints: /memory/by-device/*
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..deps import get_db, get_firebase_user, get_redis, verify_device_ownership
from ..models import User
from ..services.memory_center import memory_center

router = APIRouter()


# --- Response models (V3) ---


class MemoryFileInfo(BaseModel):
    id: str = ""
    filename: str
    layer: str = "semantic"
    category: str = "general"
    source: str = "agent"
    importance: float = 0.5
    preview: str = ""
    updated_at: str = ""
    created_at: str | None = None


class MemoryFileContent(BaseModel):
    id: str = ""
    filename: str
    content: str
    layer: str = "semantic"
    category: str = "general"
    source: str = "agent"
    importance: float = 0.5
    access_count: int = 0
    updated_at: str = ""
    created_at: str | None = None


class MemoryFileUpdate(BaseModel):
    content: str
    category: str | None = None
    layer: str | None = None


class MemoryContextResponse(BaseModel):
    context: str
    char_count: int


# --- V3 UUID-based endpoints ---


@router.get("/memories", response_model=list[MemoryFileInfo])
async def list_memories_v3(
    layer: str | None = Query(None, description="Filter by layer: identity|semantic|episodic"),
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """List all memories for the authenticated user, optionally filtered by layer."""
    memories = await memory_center.get_user_memories(db, user.vi_user_id, layer=layer)
    return [MemoryFileInfo(**m) for m in memories]


@router.get("/memories/context", response_model=MemoryContextResponse)
async def get_memory_context(
    max_chars: int = Query(3000, ge=100, le=10000),
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """Debug: view computed working memory (importance-scored context)."""
    context = await memory_center.get_context_for_agent(
        db, user.vi_user_id, max_chars=max_chars,
    )
    return MemoryContextResponse(context=context, char_count=len(context))


@router.get("/memories/{memory_id}", response_model=MemoryFileContent)
async def get_memory_by_uuid(
    memory_id: str,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single memory by UUID."""
    mem = await memory_center.get_memory_by_id(db, memory_id, vi_user_id=user.vi_user_id)
    if mem is None:
        raise HTTPException(404, "Memory not found")
    return MemoryFileContent(**mem)


@router.put("/memories/{memory_id}", response_model=MemoryFileContent)
async def update_memory_by_uuid(
    memory_id: str,
    body: MemoryFileUpdate,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Update a memory by UUID."""
    updates = {}
    if body.content is not None:
        updates["content"] = body.content
    if body.layer is not None:
        updates["layer"] = body.layer
    if body.category is not None:
        updates["category"] = body.category

    mem = await memory_center.update_memory_by_id(
        db, memory_id, updates, redis=redis, vi_user_id=user.vi_user_id,
    )
    if mem is None:
        raise HTTPException(404, "Memory not found")
    return MemoryFileContent(**mem)


@router.delete("/memories/{memory_id}")
async def delete_memory_by_uuid(
    memory_id: str,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Delete a memory by UUID."""
    deleted = await memory_center.delete_memory_by_id(
        db, memory_id, redis=redis, vi_user_id=user.vi_user_id,
    )
    if not deleted:
        raise HTTPException(404, "Memory not found")
    return {"ok": True}


# --- V2 filename-based endpoints (backward compat) ---


def _infer_category(filename: str) -> str:
    """Infer memory category from filename when not explicitly set."""
    name = filename.lower()
    if "preference" in name:
        return "preference"
    if "agent" in name:
        return "agent"
    if "session" in name or "summary" in name:
        return "session_summary"
    return "general"


def _memory_dict_to_content_response(mem_dict: dict) -> MemoryFileContent:
    """Convert a memory dict from MemoryCenter to a MemoryFileContent response."""
    return MemoryFileContent(
        id=mem_dict.get("id", ""),
        filename=mem_dict["filename"],
        content=mem_dict.get("content", ""),
        layer=mem_dict.get("layer", "semantic"),
        category=mem_dict.get("category", "general"),
        source=mem_dict.get("source", "agent"),
        importance=mem_dict.get("importance", 0.5),
        access_count=mem_dict.get("access_count", 0),
        updated_at=mem_dict.get("updated_at", ""),
        created_at=mem_dict.get("created_at"),
    )


# --- By-device endpoints (anonymous auth) ---


@router.get("/memory/by-device", response_model=list[MemoryFileInfo])
async def list_memory_by_device(
    layer: str | None = Query(None),
    user: User = Depends(verify_device_ownership),
    db: AsyncSession = Depends(get_db),
):
    try:
        memories = await memory_center.get_user_memories(db, user.vi_user_id, layer=layer)
    except ValueError:
        return []
    return [MemoryFileInfo(**m) for m in memories]


@router.get("/memory/by-device/{filename:path}", response_model=MemoryFileContent)
async def get_memory_by_device(
    filename: str,
    user: User = Depends(verify_device_ownership),
    db: AsyncSession = Depends(get_db),
):
    mem = await memory_center.get_memory(db, user.vi_user_id, filename)
    if mem is None:
        raise HTTPException(404, "Memory file not found")
    return _memory_dict_to_content_response(mem)


@router.put("/memory/by-device/{filename:path}", response_model=MemoryFileContent)
async def upsert_memory_by_device(
    filename: str,
    body: MemoryFileUpdate,
    user: User = Depends(verify_device_ownership),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    category = body.category or _infer_category(filename)
    await memory_center.upsert_memory(
        db, user.vi_user_id, filename, body.content,
        category=category, source="user", redis=redis,
    )
    mem = await memory_center.get_memory(db, user.vi_user_id, filename)
    if mem is None:
        raise HTTPException(500, "Failed to create memory")
    return _memory_dict_to_content_response(mem)


@router.delete("/memory/by-device/{filename:path}")
async def delete_memory_by_device(
    filename: str,
    user: User = Depends(verify_device_ownership),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    await memory_center.delete_memory(db, user.vi_user_id, filename, redis=redis)
    return {"ok": True}


# --- JWT-authenticated filename endpoints ---


@router.get("/memory", response_model=list[MemoryFileInfo])
async def list_memory(
    layer: str | None = Query(None),
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    memories = await memory_center.get_user_memories(db, user.vi_user_id, layer=layer)
    return [MemoryFileInfo(**m) for m in memories]


@router.get("/memory/{filename:path}", response_model=MemoryFileContent)
async def get_memory_file(
    filename: str,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
):
    mem = await memory_center.get_memory(db, user.vi_user_id, filename)
    if mem is None:
        raise HTTPException(404, "Memory file not found")
    return _memory_dict_to_content_response(mem)


@router.put("/memory/{filename:path}", response_model=MemoryFileContent)
async def upsert_memory_file(
    filename: str,
    body: MemoryFileUpdate,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    category = body.category or _infer_category(filename)
    await memory_center.upsert_memory(
        db, user.vi_user_id, filename, body.content,
        category=category, source="user", redis=redis,
    )
    mem = await memory_center.get_memory(db, user.vi_user_id, filename)
    if mem is None:
        raise HTTPException(500, "Failed to create memory")
    return _memory_dict_to_content_response(mem)


@router.delete("/memory/{filename:path}")
async def delete_memory_file(
    filename: str,
    user: User = Depends(get_firebase_user),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    await memory_center.delete_memory(db, user.vi_user_id, filename, redis=redis)
    return {"ok": True}
