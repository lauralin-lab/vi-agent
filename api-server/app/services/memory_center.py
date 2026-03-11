"""MemoryCenter V3 — three-layer memory pyramid with importance scoring.

Replaces V2 flat CRUD with:
- Three stored layers: identity, semantic, episodic
- ImportanceScorer for context window selection (Working Memory)
- Session-end processing for automatic episodic memory creation
- Heartbeat maintenance for score recomputation and cleanup
"""

import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AgentMemory
from ..utils import resolve_user_id, to_iso
from .events import publish_event


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_LAYERS = ("identity", "semantic", "episodic")
VALID_SOURCES = ("agent", "user", "system", "cron")

# Layer inference from filename (for backward compatibility + NanoClaw sync)
FILENAME_LAYER_MAP = {
    "SOUL.md": ("identity", "soul"),
    "USER.md": ("identity", "user_profile"),
    "MEMORY.md": ("semantic", "long_term"),
    "HEARTBEAT.md": ("semantic", "heartbeat_config"),
}


def infer_layer_category(filename: str, category: str = "general") -> tuple[str, str]:
    """Infer layer and category from filename for backward compatibility.

    Args:
        filename: Memory filename (e.g. "preferences.md", "memory/2026-02-28.md").
        category: Existing V2 category hint.

    Returns:
        Tuple of (layer, category).
    """
    # Exact match first
    if filename in FILENAME_LAYER_MAP:
        return FILENAME_LAYER_MAP[filename]

    # Episodic: memory/YYYY-MM-DD.md pattern
    if filename.startswith("memory/") and filename.endswith(".md"):
        return ("episodic", "daily_log")

    # Category-based inference (V2 backward compat)
    if category == "preference":
        return ("semantic", "preference")
    if category == "session_summary":
        return ("episodic", "session_summary")
    if category == "agent":
        return ("semantic", "agent")

    # Filename-based heuristics
    name_lower = filename.lower()
    if "preference" in name_lower:
        return ("semantic", "preference")
    if "session" in name_lower or "summary" in name_lower:
        return ("episodic", "session_summary")
    if "agent" in name_lower:
        return ("semantic", "agent")

    return ("semantic", "general")


# ---------------------------------------------------------------------------
# ImportanceScorer
# ---------------------------------------------------------------------------

class ImportanceScorer:
    """Compute importance scores for memory context window selection.

    Score = layer_weight * 0.40 + recency * 0.30 + frequency * 0.15 + source * 0.15

    Layer weight dominates because identity memories (who the user is)
    are always more relevant than episodic memories (what happened Tuesday).
    """

    LAYER_WEIGHT = 0.40
    RECENCY_WEIGHT = 0.30
    FREQUENCY_WEIGHT = 0.15
    SOURCE_WEIGHT = 0.15

    # Recency half-life: 168 hours = 1 week
    RECENCY_HALF_LIFE_HOURS = 168

    SOURCE_WEIGHTS = {
        "user": 1.5,
        "agent": 1.0,
        "cron": 0.8,
        "system": 0.6,
    }

    LAYER_WEIGHTS = {
        "identity": 2.0,
        "semantic": 1.5,
        "episodic": 1.0,
    }

    FREQUENCY_CAP = 20

    def compute(self, memory, now: datetime | None = None) -> float:
        """Compute importance score for a single memory.

        Args:
            memory: AgentMemory instance (or any object with the required attrs).
            now: Current time (defaults to utcnow).

        Returns:
            Float between 0.0 and 1.0.
        """
        if now is None:
            now = datetime.now(timezone.utc)

        # Factor 1: Recency — exponential decay
        ref_time = getattr(memory, "last_accessed_at", None) or getattr(memory, "created_at", None)
        if ref_time:
            # Normalize naive datetimes (e.g. from SQLite) to UTC
            if ref_time.tzinfo is None:
                ref_time = ref_time.replace(tzinfo=timezone.utc)
            hours_since = max(0, (now - ref_time).total_seconds() / 3600)
        else:
            hours_since = 0
        recency = 0.5 ** (hours_since / self.RECENCY_HALF_LIFE_HOURS)

        # Factor 2: Frequency — linear, capped
        frequency = min((getattr(memory, "access_count", 0) or 0) / self.FREQUENCY_CAP, 1.0)

        # Factor 3: Source weight — normalized to 0-1 range
        raw_source = self.SOURCE_WEIGHTS.get(getattr(memory, "source", "agent") or "agent", 1.0)
        source_norm = raw_source / max(self.SOURCE_WEIGHTS.values())

        # Factor 4: Layer weight — normalized to 0-1 range
        raw_layer = self.LAYER_WEIGHTS.get(getattr(memory, "layer", "semantic") or "semantic", 1.0)
        layer_norm = raw_layer / max(self.LAYER_WEIGHTS.values())

        score = (
            recency * self.RECENCY_WEIGHT
            + frequency * self.FREQUENCY_WEIGHT
            + source_norm * self.SOURCE_WEIGHT
            + layer_norm * self.LAYER_WEIGHT
        )
        return min(1.0, max(0.0, score))


# Module-level scorer instance
importance_scorer = ImportanceScorer()


# ---------------------------------------------------------------------------
# MemoryCenter V3
# ---------------------------------------------------------------------------

class MemoryCenter:
    """V3 Memory Center — three-layer memory management with importance scoring."""

    def __init__(self):
        self.scorer = importance_scorer

    # -- User ID resolution --

    async def _resolve_user_id(
        self, db: AsyncSession, vi_user_id: str, *, auto_create: bool = False,
    ):
        """Resolve vi_user_id -> internal UUID. Auto-creates stub user when requested."""
        return await resolve_user_id(db, vi_user_id, auto_create=auto_create)

    # ------------------------------------------------------------------
    # CRUD Operations
    # ------------------------------------------------------------------

    async def get_user_memories(
        self,
        db: AsyncSession,
        vi_user_id: str,
        layer: str | None = None,
    ) -> list[dict]:
        """List all memory files for a user, optionally filtered by layer."""
        user_id = await self._resolve_user_id(db, vi_user_id)
        query = select(AgentMemory).where(AgentMemory.user_id == user_id)
        if layer:
            query = query.where(AgentMemory.layer == layer)
        query = query.order_by(AgentMemory.importance.desc(), AgentMemory.updated_at.desc())

        result = await db.execute(query)
        memories = result.scalars().all()
        return [
            {
                "id": str(m.id),
                "filename": m.filename,
                "layer": m.layer,
                "category": m.category or "general",
                "source": m.source or "agent",
                "importance": round(m.importance or 0.5, 3),
                "preview": m.content[:100] if m.content else "",
                "updated_at": to_iso(m.updated_at),
                "created_at": to_iso(m.created_at),
            }
            for m in memories
        ]

    async def get_memory(
        self, db: AsyncSession, vi_user_id: str, filename: str
    ) -> dict | None:
        """Get a single memory by filename. Returns full dict or None."""
        user_id = await self._resolve_user_id(db, vi_user_id)
        result = await db.execute(
            select(AgentMemory).where(
                AgentMemory.user_id == user_id, AgentMemory.filename == filename
            )
        )
        memory = result.scalar_one_or_none()
        if not memory:
            return None
        return self._to_dict(memory)

    async def get_memory_by_id(
        self, db: AsyncSession, memory_id: str,
        vi_user_id: str | None = None,
    ) -> dict | None:
        """Get a single memory by UUID. Returns full dict or None.

        If vi_user_id is provided, verifies ownership (prevents IDOR).
        """
        try:
            mid = str(_uuid.UUID(memory_id))
        except ValueError:
            return None
        memory = await db.get(AgentMemory, mid)
        if not memory:
            return None
        # Ownership check: if vi_user_id provided, verify the memory belongs to this user
        if vi_user_id is not None:
            user_id = await self._resolve_user_id(db, vi_user_id)
            if memory.user_id != user_id:
                return None
        return self._to_dict(memory)

    async def upsert_memory(
        self,
        db: AsyncSession,
        vi_user_id: str,
        filename: str,
        content: str,
        layer: str | None = None,
        category: str = "general",
        source: str = "agent",
        source_channel: str | None = None,
        source_session_id: str | None = None,
        expires_at: datetime | None = None,
        redis=None,
    ) -> None:
        """Create or replace a memory file.

        If layer is not provided, it is inferred from filename and category.
        """
        user_id = await self._resolve_user_id(db, vi_user_id, auto_create=True)

        # Infer layer if not explicitly provided
        if not layer:
            layer, category = infer_layer_category(filename, category)

        # Validate layer
        if layer not in VALID_LAYERS:
            layer = "semantic"

        result = await db.execute(
            select(AgentMemory).where(
                AgentMemory.user_id == user_id, AgentMemory.filename == filename
            )
        )
        memory = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)

        if memory:
            memory.content = content
            memory.layer = layer
            memory.category = category
            memory.source = source
            memory.source_channel = source_channel
            memory.updated_at = now
            if expires_at:
                memory.expires_at = expires_at
            memory.importance = self.scorer.compute(memory, now)
        else:
            session_uuid = None
            if source_session_id:
                try:
                    session_uuid = str(_uuid.UUID(source_session_id))
                except ValueError:
                    pass

            memory = AgentMemory(
                user_id=user_id,
                filename=filename,
                content=content,
                layer=layer,
                category=category,
                source=source,
                source_channel=source_channel,
                source_session_id=session_uuid,
                expires_at=expires_at,
                importance=0.5,
            )
            db.add(memory)

        await db.commit()
        await publish_event(redis, vi_user_id, {
            "type": "memory_update",
            "filename": filename,
            "layer": layer,
            "action": "upsert",
            "preview": content[:50] if content else "",
        })

    async def append_memory(
        self,
        db: AsyncSession,
        vi_user_id: str,
        filename: str,
        content: str,
        layer: str | None = None,
        category: str = "general",
        source: str = "agent",
        redis=None,
    ) -> None:
        """Append content to an existing memory file, or create it."""
        user_id = await self._resolve_user_id(db, vi_user_id, auto_create=True)

        if not layer:
            layer, category = infer_layer_category(filename, category)

        result = await db.execute(
            select(AgentMemory).where(
                AgentMemory.user_id == user_id, AgentMemory.filename == filename
            )
        )
        memory = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if memory:
            memory.content = (memory.content or "") + "\n\n" + content.strip()
            memory.layer = layer
            memory.category = category
            memory.source = source
            memory.updated_at = now
            memory.importance = self.scorer.compute(memory, now)
        else:
            memory = AgentMemory(
                user_id=user_id,
                filename=filename,
                content=content.strip(),
                layer=layer,
                category=category,
                source=source,
            )
            db.add(memory)

        await db.commit()
        await publish_event(redis, vi_user_id, {
            "type": "memory_update",
            "filename": filename,
            "layer": layer,
            "action": "append",
            "preview": content[:50] if content else "",
        })

    async def update_memory_by_id(
        self,
        db: AsyncSession,
        memory_id: str,
        updates: dict,
        redis=None,
        vi_user_id: str | None = None,
    ) -> dict | None:
        """Update specific fields of a memory by UUID.

        Allowed fields: content, layer, category, filename.
        Returns updated memory dict or None.
        """
        try:
            mid = str(_uuid.UUID(memory_id))
        except ValueError:
            return None

        memory = await db.get(AgentMemory, mid)
        if not memory:
            return None

        # Ownership check: if vi_user_id provided, verify the memory belongs to this user
        if vi_user_id is not None:
            user_id = await self._resolve_user_id(db, vi_user_id)
            if memory.user_id != user_id:
                return None

        allowed = {"content", "layer", "category", "filename"}
        for key, val in updates.items():
            if key in allowed and val is not None:
                setattr(memory, key, val)

        memory.updated_at = datetime.now(timezone.utc)
        memory.importance = self.scorer.compute(memory)
        await db.commit()

        if redis and vi_user_id:
            await publish_event(redis, vi_user_id, {
                "type": "memory_update",
                "filename": memory.filename,
                "layer": memory.layer,
                "action": "update",
            })

        return self._to_dict(memory)

    async def delete_memory(
        self, db: AsyncSession, vi_user_id: str, filename: str,
        redis=None,
    ) -> None:
        """Delete a memory file by filename. No-op if not found."""
        user_id = await self._resolve_user_id(db, vi_user_id)
        result = await db.execute(
            select(AgentMemory).where(
                AgentMemory.user_id == user_id, AgentMemory.filename == filename
            )
        )
        memory = result.scalar_one_or_none()
        if memory:
            await db.delete(memory)
            await db.commit()
            await publish_event(redis, vi_user_id, {
                "type": "memory_update",
                "filename": filename,
                "action": "delete",
            })

    async def delete_memory_by_id(
        self, db: AsyncSession, memory_id: str,
        redis=None, vi_user_id: str | None = None,
    ) -> bool:
        """Delete a memory by UUID. Returns True if deleted."""
        try:
            mid = str(_uuid.UUID(memory_id))
        except ValueError:
            return False
        memory = await db.get(AgentMemory, mid)
        if not memory:
            return False
        # Ownership check: if vi_user_id provided, verify the memory belongs to this user
        if vi_user_id is not None:
            user_id = await self._resolve_user_id(db, vi_user_id)
            if memory.user_id != user_id:
                return False
        filename = memory.filename
        await db.delete(memory)
        await db.commit()
        if redis and vi_user_id:
            await publish_event(redis, vi_user_id, {
                "type": "memory_update",
                "filename": filename,
                "action": "delete",
            })
        return True

    # ------------------------------------------------------------------
    # Context Generation (Working Memory)
    # ------------------------------------------------------------------

    async def get_context_for_agent(
        self,
        db: AsyncSession,
        vi_user_id: str,
        channel: str | None = None,
        max_chars: int = 3000,
    ) -> str:
        """Build importance-scored context string for agent injection.

        This is the Working Memory: dynamically selected from identity,
        semantic, and episodic layers, ranked by importance score.
        """
        try:
            user_id = await self._resolve_user_id(db, vi_user_id)
        except ValueError:
            # Unknown user — return empty context gracefully
            return ""
        now = datetime.now(timezone.utc)

        # Fetch all non-expired memories
        query = (
            select(AgentMemory)
            .where(
                AgentMemory.user_id == user_id,
                (AgentMemory.expires_at.is_(None)) | (AgentMemory.expires_at > now),
            )
        )
        result = await db.execute(query)
        all_memories = result.scalars().all()

        if not all_memories:
            return ""

        # Recompute importance scores
        for m in all_memories:
            m.importance = self.scorer.compute(m, now)

        # Sort by importance descending
        all_memories.sort(key=lambda m: m.importance, reverse=True)

        # Greedy selection within character budget
        selected: list = []
        chars_used = 0
        for m in all_memories:
            block_len = len(m.filename) + len(m.content or "") + 10
            if chars_used + block_len > max_chars:
                remaining = max_chars - chars_used
                if remaining > 50:
                    truncated_content = (m.content or "")[:remaining - len(m.filename) - 10]
                    if truncated_content:
                        m._truncated_content = truncated_content
                        selected.append(m)
                break
            selected.append(m)
            chars_used += block_len + 2

        # Update access counts
        memory_ids = [m.id for m in selected]
        if memory_ids:
            await db.execute(
                update(AgentMemory)
                .where(AgentMemory.id.in_(memory_ids))
                .values(
                    access_count=AgentMemory.access_count + 1,
                    last_accessed_at=now,
                )
            )
            await db.commit()

        # Format output grouped by layer
        layer_order = ["identity", "semantic", "episodic"]
        sections = []

        for layer in layer_order:
            layer_memories = [m for m in selected if m.layer == layer]
            if not layer_memories:
                continue
            sections.append(f"## {layer.title()} Memory")
            for m in layer_memories:
                content = getattr(m, "_truncated_content", None) or m.content or ""
                sections.append(f"### {m.filename}\n{content}")

        return "\n\n".join(sections)

    # ------------------------------------------------------------------
    # Session End Processing
    # ------------------------------------------------------------------

    async def process_session_end(
        self,
        db: AsyncSession,
        session_id: str,
        vi_user_id: str,
        summary: str | None = None,
        redis=None,
    ) -> None:
        """Auto-generate episodic memory at session end."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filename = f"memory/{today}.md"

        if not summary:
            summary = f"Session {session_id[:8]} ended."

        content = f"## Session {session_id[:8]}\n{summary}"

        await self.append_memory(
            db, vi_user_id, filename, content,
            layer="episodic",
            category="daily_log",
            source="system",
            redis=redis,
        )

    # ------------------------------------------------------------------
    # Heartbeat Maintenance (called by Proactive Engine)
    # ------------------------------------------------------------------

    async def heartbeat_maintenance(
        self,
        db: AsyncSession,
        vi_user_id: str,
        redis=None,
    ) -> dict:
        """Periodic memory maintenance: recompute scores, delete expired."""
        try:
            user_id = await self._resolve_user_id(db, vi_user_id)
        except ValueError:
            return {"recomputed": 0, "expired_deleted": 0}
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(AgentMemory).where(AgentMemory.user_id == user_id)
        )
        all_memories = result.scalars().all()

        # Recompute importance
        for m in all_memories:
            m.importance = self.scorer.compute(m, now)

        # Delete expired
        expired_count = 0
        for m in all_memories:
            exp = m.expires_at
            if exp and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp and exp < now:
                await db.delete(m)
                expired_count += 1

        await db.commit()

        return {
            "recomputed": len(all_memories),
            "expired_deleted": expired_count,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_dict(memory: AgentMemory) -> dict:
        return {
            "id": str(memory.id),
            "filename": memory.filename,
            "content": memory.content,
            "layer": memory.layer,
            "category": memory.category,
            "source": memory.source,
            "importance": round(memory.importance or 0.5, 3),
            "access_count": memory.access_count or 0,
            "updated_at": to_iso(memory.updated_at),
            "created_at": to_iso(memory.created_at),
        }


# Module-level singleton
memory_center = MemoryCenter()
