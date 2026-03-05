"""Tests for MemoryCenter V3 — three-layer memory pyramid with importance scoring."""

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.models import AgentMemory, User
from app.services.memory_center import (
    ImportanceScorer,
    MemoryCenter,
    infer_layer_category,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(vi_user_id: str = "vi-test0000000001") -> User:
    u = User()
    u.id = str(uuid.uuid4())
    u.email = f"{vi_user_id}@test.com"
    u.password_hash = "fakehash"
    u.vi_user_id = vi_user_id
    return u


VI_USER_ID = "vi-test0000000001"


@pytest_asyncio.fixture
async def user(db_session):
    """Create and persist a test user, return vi_user_id."""
    u = _make_user(VI_USER_ID)
    db_session.add(u)
    await db_session.commit()
    return u


@pytest.fixture
def mc():
    return MemoryCenter()


# =========================================================================
# 1. ImportanceScorer
# =========================================================================


class TestImportanceScorer:
    def setup_method(self):
        self.scorer = ImportanceScorer()
        self.now = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)

    def _mem(self, **kwargs):
        defaults = {
            "layer": "semantic",
            "source": "agent",
            "access_count": 0,
            "created_at": self.now,
            "last_accessed_at": None,
        }
        defaults.update(kwargs)
        return SimpleNamespace(**defaults)

    def test_identity_scores_higher_than_episodic(self):
        identity = self._mem(layer="identity")
        episodic = self._mem(layer="episodic")
        assert self.scorer.compute(identity, self.now) > self.scorer.compute(episodic, self.now)

    def test_identity_scores_higher_than_semantic(self):
        identity = self._mem(layer="identity")
        semantic = self._mem(layer="semantic")
        assert self.scorer.compute(identity, self.now) > self.scorer.compute(semantic, self.now)

    def test_semantic_scores_higher_than_episodic(self):
        semantic = self._mem(layer="semantic")
        episodic = self._mem(layer="episodic")
        assert self.scorer.compute(semantic, self.now) > self.scorer.compute(episodic, self.now)

    def test_recent_memory_scores_higher_than_old(self):
        recent = self._mem(created_at=self.now - timedelta(hours=1))
        old = self._mem(created_at=self.now - timedelta(days=30))
        assert self.scorer.compute(recent, self.now) > self.scorer.compute(old, self.now)

    def test_high_access_count_scores_higher(self):
        high = self._mem(access_count=20)
        low = self._mem(access_count=0)
        assert self.scorer.compute(high, self.now) > self.scorer.compute(low, self.now)

    def test_user_source_scores_higher_than_system(self):
        user_src = self._mem(source="user")
        system_src = self._mem(source="system")
        assert self.scorer.compute(user_src, self.now) > self.scorer.compute(system_src, self.now)

    def test_user_source_scores_higher_than_agent(self):
        user_src = self._mem(source="user")
        agent_src = self._mem(source="agent")
        assert self.scorer.compute(user_src, self.now) > self.scorer.compute(agent_src, self.now)

    def test_score_between_zero_and_one(self):
        mem = self._mem(layer="identity", source="user", access_count=100)
        score = self.scorer.compute(mem, self.now)
        assert 0.0 <= score <= 1.0

    def test_score_with_no_timestamps(self):
        mem = self._mem(created_at=None, last_accessed_at=None)
        score = self.scorer.compute(mem, self.now)
        assert 0.0 <= score <= 1.0

    def test_last_accessed_at_used_over_created_at(self):
        """When last_accessed_at is set, it should be used for recency calc."""
        mem_recently_accessed = self._mem(
            created_at=self.now - timedelta(days=30),
            last_accessed_at=self.now - timedelta(hours=1),
        )
        mem_never_accessed = self._mem(
            created_at=self.now - timedelta(days=30),
            last_accessed_at=None,
        )
        assert self.scorer.compute(mem_recently_accessed, self.now) > self.scorer.compute(
            mem_never_accessed, self.now
        )


# =========================================================================
# 2. infer_layer_category
# =========================================================================


class TestInferLayerCategory:
    def test_soul_md(self):
        assert infer_layer_category("SOUL.md") == ("identity", "soul")

    def test_user_md(self):
        assert infer_layer_category("USER.md") == ("identity", "user_profile")

    def test_memory_md(self):
        assert infer_layer_category("MEMORY.md") == ("semantic", "long_term")

    def test_heartbeat_md(self):
        assert infer_layer_category("HEARTBEAT.md") == ("semantic", "heartbeat_config")

    def test_daily_log_pattern(self):
        assert infer_layer_category("memory/2026-02-28.md") == ("episodic", "daily_log")

    def test_daily_log_other_date(self):
        assert infer_layer_category("memory/2025-01-15.md") == ("episodic", "daily_log")

    def test_preference_category_hint(self):
        assert infer_layer_category("preferences.md", category="preference") == (
            "semantic",
            "preference",
        )

    def test_session_summary_category_hint(self):
        assert infer_layer_category("session-summary.md", category="session_summary") == (
            "episodic",
            "session_summary",
        )

    def test_agent_category_hint(self):
        assert infer_layer_category("agent-notes.md", category="agent") == (
            "semantic",
            "agent",
        )

    def test_preference_filename_heuristic(self):
        assert infer_layer_category("my-preferences.md") == ("semantic", "preference")

    def test_session_filename_heuristic(self):
        assert infer_layer_category("session-summary.md") == ("episodic", "session_summary")

    def test_agent_filename_heuristic(self):
        assert infer_layer_category("agent-notes.md") == ("semantic", "agent")

    def test_generic_fallback(self):
        assert infer_layer_category("random.md") == ("semantic", "general")

    def test_unknown_file_with_general_category(self):
        assert infer_layer_category("notes.md", category="general") == ("semantic", "general")


# =========================================================================
# 3. MemoryCenter CRUD (async, using DB session)
# =========================================================================


@pytest.mark.asyncio
class TestMemoryCenterUpsert:

    async def test_upsert_creates_new_memory(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "I am Vi.")
        mem = await mc.get_memory(db_session, VI_USER_ID, "SOUL.md")
        assert mem is not None
        assert mem["content"] == "I am Vi."
        assert mem["layer"] == "identity"
        assert mem["category"] == "soul"

    async def test_upsert_updates_existing_memory(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "Version 1")
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "Version 2")
        mem = await mc.get_memory(db_session, VI_USER_ID, "SOUL.md")
        assert mem["content"] == "Version 2"

    async def test_upsert_infers_layer_from_filename(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "memory/2026-03-01.md", "Today")
        mem = await mc.get_memory(db_session, VI_USER_ID, "memory/2026-03-01.md")
        assert mem["layer"] == "episodic"
        assert mem["category"] == "daily_log"

    async def test_upsert_explicit_layer_overrides_inference(self, db_session, user, mc):
        await mc.upsert_memory(
            db_session, VI_USER_ID, "custom.md", "data",
            layer="identity", category="custom",
        )
        mem = await mc.get_memory(db_session, VI_USER_ID, "custom.md")
        assert mem["layer"] == "identity"
        assert mem["category"] == "custom"

    async def test_upsert_invalid_layer_falls_back_to_semantic(self, db_session, user, mc):
        await mc.upsert_memory(
            db_session, VI_USER_ID, "file.md", "content",
            layer="invalid_layer",
        )
        mem = await mc.get_memory(db_session, VI_USER_ID, "file.md")
        assert mem["layer"] == "semantic"

    async def test_upsert_with_source_session_id(self, db_session, user, mc):
        sid = str(uuid.uuid4())
        await mc.upsert_memory(
            db_session, VI_USER_ID, "test.md", "content",
            source_session_id=sid,
        )
        mem = await mc.get_memory(db_session, VI_USER_ID, "test.md")
        assert mem is not None

    async def test_upsert_invalid_vi_user_id_raises(self, db_session, user, mc):
        with pytest.raises(ValueError, match="No user found"):
            await mc.upsert_memory(db_session, "vi-nonexistent", "f.md", "c")


@pytest.mark.asyncio
class TestMemoryCenterAppend:

    async def test_append_creates_new_memory(self, db_session, user, mc):
        await mc.append_memory(db_session, VI_USER_ID, "log.md", "First entry")
        mem = await mc.get_memory(db_session, VI_USER_ID, "log.md")
        assert mem is not None
        assert mem["content"] == "First entry"

    async def test_append_to_existing_memory(self, db_session, user, mc):
        await mc.append_memory(db_session, VI_USER_ID, "log.md", "First")
        await mc.append_memory(db_session, VI_USER_ID, "log.md", "Second")
        mem = await mc.get_memory(db_session, VI_USER_ID, "log.md")
        assert "First" in mem["content"]
        assert "Second" in mem["content"]
        # Content is joined with double newline
        assert "\n\n" in mem["content"]


@pytest.mark.asyncio
class TestMemoryCenterGet:

    async def test_get_memory_returns_dict_with_v3_fields(self, db_session, user, mc):
        await mc.upsert_memory(
            db_session, VI_USER_ID, "SOUL.md", "Identity content",
            source="user",
        )
        mem = await mc.get_memory(db_session, VI_USER_ID, "SOUL.md")
        assert isinstance(mem, dict)
        expected_keys = {
            "id", "filename", "content", "layer", "category",
            "source", "importance", "access_count", "updated_at", "created_at",
        }
        assert expected_keys == set(mem.keys())
        assert mem["filename"] == "SOUL.md"
        assert mem["source"] == "user"
        assert isinstance(mem["importance"], float)
        assert isinstance(mem["access_count"], int)

    async def test_get_memory_returns_none_for_missing(self, db_session, user, mc):
        result = await mc.get_memory(db_session, VI_USER_ID, "nonexistent.md")
        assert result is None

    async def test_get_user_memories_returns_list(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "soul")
        await mc.upsert_memory(db_session, VI_USER_ID, "prefs.md", "prefs", layer="semantic")
        await mc.upsert_memory(db_session, VI_USER_ID, "memory/2026-01-01.md", "ep")

        all_mems = await mc.get_user_memories(db_session, VI_USER_ID)
        assert len(all_mems) == 3

    async def test_get_user_memories_filtered_by_layer(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "soul")
        await mc.upsert_memory(db_session, VI_USER_ID, "USER.md", "user")
        await mc.upsert_memory(db_session, VI_USER_ID, "notes.md", "notes", layer="semantic")

        identity_mems = await mc.get_user_memories(db_session, VI_USER_ID, layer="identity")
        assert len(identity_mems) == 2
        assert all(m["layer"] == "identity" for m in identity_mems)

    async def test_get_user_memories_has_preview(self, db_session, user, mc):
        long_content = "A" * 200
        await mc.upsert_memory(db_session, VI_USER_ID, "long.md", long_content, layer="semantic")
        mems = await mc.get_user_memories(db_session, VI_USER_ID)
        assert len(mems) == 1
        assert len(mems[0]["preview"]) == 100  # truncated to 100 chars


@pytest.mark.asyncio
class TestMemoryCenterDelete:

    async def test_delete_memory_removes_record(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "temp.md", "temp content")
        assert await mc.get_memory(db_session, VI_USER_ID, "temp.md") is not None
        await mc.delete_memory(db_session, VI_USER_ID, "temp.md")
        assert await mc.get_memory(db_session, VI_USER_ID, "temp.md") is None

    async def test_delete_memory_no_op_if_missing(self, db_session, user, mc):
        # Should not raise
        await mc.delete_memory(db_session, VI_USER_ID, "nonexistent.md")

    async def test_delete_memory_by_id(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "to-delete.md", "bye")
        mem = await mc.get_memory(db_session, VI_USER_ID, "to-delete.md")
        result = await mc.delete_memory_by_id(db_session, mem["id"])
        assert result is True
        assert await mc.get_memory(db_session, VI_USER_ID, "to-delete.md") is None

    async def test_delete_memory_by_id_returns_false_for_missing(self, db_session, user, mc):
        result = await mc.delete_memory_by_id(db_session, str(uuid.uuid4()))
        assert result is False

    async def test_delete_memory_by_id_returns_false_for_invalid_uuid(self, db_session, user, mc):
        result = await mc.delete_memory_by_id(db_session, "not-a-uuid")
        assert result is False


@pytest.mark.asyncio
class TestMemoryCenterById:

    async def test_get_memory_by_id(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "byid.md", "found it")
        mem = await mc.get_memory(db_session, VI_USER_ID, "byid.md")
        by_id = await mc.get_memory_by_id(db_session, mem["id"])
        assert by_id is not None
        assert by_id["content"] == "found it"
        assert by_id["filename"] == "byid.md"

    async def test_get_memory_by_id_returns_none_for_missing(self, db_session, user, mc):
        result = await mc.get_memory_by_id(db_session, str(uuid.uuid4()))
        assert result is None

    async def test_get_memory_by_id_returns_none_for_invalid_uuid(self, db_session, user, mc):
        result = await mc.get_memory_by_id(db_session, "bad-uuid")
        assert result is None

    async def test_update_memory_by_id(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "updatable.md", "original")
        mem = await mc.get_memory(db_session, VI_USER_ID, "updatable.md")
        updated = await mc.update_memory_by_id(
            db_session, mem["id"], {"content": "modified", "layer": "identity"}
        )
        assert updated is not None
        assert updated["content"] == "modified"
        assert updated["layer"] == "identity"

    async def test_update_memory_by_id_ignores_disallowed_fields(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "safe.md", "content")
        mem = await mc.get_memory(db_session, VI_USER_ID, "safe.md")
        updated = await mc.update_memory_by_id(
            db_session, mem["id"], {"importance": 999.0, "access_count": 999}
        )
        assert updated is not None
        # importance and access_count are not in allowed fields
        assert updated["importance"] != 999.0
        assert updated["access_count"] != 999

    async def test_update_memory_by_id_returns_none_for_missing(self, db_session, user, mc):
        result = await mc.update_memory_by_id(db_session, str(uuid.uuid4()), {"content": "x"})
        assert result is None

    async def test_update_memory_by_id_returns_none_for_invalid_uuid(self, db_session, user, mc):
        result = await mc.update_memory_by_id(db_session, "bad", {"content": "x"})
        assert result is None


# =========================================================================
# 4. Context Generation (Working Memory)
# =========================================================================


@pytest.mark.asyncio
class TestGetContextForAgent:

    async def test_returns_importance_sorted_text(self, db_session, user, mc):
        # Identity should appear before episodic
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "Who I am")
        await mc.upsert_memory(db_session, VI_USER_ID, "memory/2026-02-28.md", "Yesterday log")
        await mc.upsert_memory(db_session, VI_USER_ID, "prefs.md", "User prefs", layer="semantic")

        ctx = await mc.get_context_for_agent(db_session, VI_USER_ID, max_chars=5000)
        assert "## Identity Memory" in ctx
        assert "### SOUL.md" in ctx
        assert "Who I am" in ctx
        # Identity section should come before Episodic section
        identity_pos = ctx.index("## Identity Memory")
        episodic_pos = ctx.index("## Episodic Memory")
        assert identity_pos < episodic_pos

    async def test_empty_for_no_memories(self, db_session, user, mc):
        ctx = await mc.get_context_for_agent(db_session, VI_USER_ID)
        assert ctx == ""

    async def test_respects_char_budget(self, db_session, user, mc):
        # Create memories that exceed a small budget
        await mc.upsert_memory(db_session, VI_USER_ID, "big1.md", "A" * 500, layer="semantic")
        await mc.upsert_memory(db_session, VI_USER_ID, "big2.md", "B" * 500, layer="semantic")
        await mc.upsert_memory(db_session, VI_USER_ID, "big3.md", "C" * 500, layer="semantic")

        ctx = await mc.get_context_for_agent(db_session, VI_USER_ID, max_chars=600)
        # Should not include all three full memories
        assert len(ctx) <= 800  # some overhead for headers, but bounded

    async def test_groups_by_layer_sections(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "SOUL.md", "soul", layer="identity")
        await mc.upsert_memory(db_session, VI_USER_ID, "notes.md", "notes", layer="semantic")

        ctx = await mc.get_context_for_agent(db_session, VI_USER_ID, max_chars=5000)
        assert "## Identity Memory" in ctx
        assert "## Semantic Memory" in ctx

    async def test_excludes_expired_memories(self, db_session, user, mc):
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        await mc.upsert_memory(
            db_session, VI_USER_ID, "expired.md", "old",
            layer="semantic", expires_at=past,
        )
        await mc.upsert_memory(db_session, VI_USER_ID, "active.md", "fresh", layer="semantic")

        ctx = await mc.get_context_for_agent(db_session, VI_USER_ID, max_chars=5000)
        assert "fresh" in ctx
        assert "old" not in ctx


# =========================================================================
# 5. Session End Processing
# =========================================================================


@pytest.mark.asyncio
class TestProcessSessionEnd:

    async def test_creates_episodic_memory(self, db_session, user, mc):
        session_id = str(uuid.uuid4())
        await mc.process_session_end(
            db_session, session_id, VI_USER_ID, summary="We talked about cats."
        )
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mem = await mc.get_memory(db_session, VI_USER_ID, f"memory/{today}.md")
        assert mem is not None
        assert mem["layer"] == "episodic"
        assert mem["category"] == "daily_log"
        assert "cats" in mem["content"]
        assert session_id[:8] in mem["content"]

    async def test_appends_to_existing_daily_log(self, db_session, user, mc):
        sid1 = str(uuid.uuid4())
        sid2 = str(uuid.uuid4())
        await mc.process_session_end(db_session, sid1, VI_USER_ID, summary="Session 1")
        await mc.process_session_end(db_session, sid2, VI_USER_ID, summary="Session 2")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mem = await mc.get_memory(db_session, VI_USER_ID, f"memory/{today}.md")
        assert "Session 1" in mem["content"]
        assert "Session 2" in mem["content"]

    async def test_default_summary_when_none(self, db_session, user, mc):
        session_id = str(uuid.uuid4())
        await mc.process_session_end(db_session, session_id, VI_USER_ID)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        mem = await mc.get_memory(db_session, VI_USER_ID, f"memory/{today}.md")
        assert "ended" in mem["content"].lower()


# =========================================================================
# 6. Heartbeat Maintenance
# =========================================================================


@pytest.mark.asyncio
class TestHeartbeatMaintenance:

    async def test_recomputes_scores(self, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "a.md", "aaa", layer="semantic")
        await mc.upsert_memory(db_session, VI_USER_ID, "b.md", "bbb", layer="identity")

        result = await mc.heartbeat_maintenance(db_session, VI_USER_ID)
        assert result["recomputed"] == 2
        assert result["expired_deleted"] == 0

    async def test_deletes_expired_memories(self, db_session, user, mc):
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        await mc.upsert_memory(
            db_session, VI_USER_ID, "expired.md", "bye",
            layer="episodic", expires_at=past,
        )
        await mc.upsert_memory(db_session, VI_USER_ID, "active.md", "keep", layer="semantic")

        result = await mc.heartbeat_maintenance(db_session, VI_USER_ID)
        assert result["expired_deleted"] == 1
        assert result["recomputed"] == 2

        # Verify expired is gone
        assert await mc.get_memory(db_session, VI_USER_ID, "expired.md") is None
        assert await mc.get_memory(db_session, VI_USER_ID, "active.md") is not None

    async def test_no_memories_returns_zero_counts(self, db_session, user, mc):
        result = await mc.heartbeat_maintenance(db_session, VI_USER_ID)
        assert result["recomputed"] == 0
        assert result["expired_deleted"] == 0


# =========================================================================
# 7. Event publishing integration
# =========================================================================


@pytest.mark.asyncio
class TestEventPublishing:

    @patch("app.services.memory_center.publish_event", new_callable=AsyncMock)
    async def test_upsert_publishes_event(self, mock_publish, db_session, user, mc):
        await mc.upsert_memory(
            db_session, VI_USER_ID, "SOUL.md", "content", redis="fake"
        )
        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][1] == VI_USER_ID
        event = call_args[0][2]
        assert event["type"] == "memory_update"
        assert event["action"] == "upsert"

    @patch("app.services.memory_center.publish_event", new_callable=AsyncMock)
    async def test_append_publishes_event(self, mock_publish, db_session, user, mc):
        await mc.append_memory(
            db_session, VI_USER_ID, "log.md", "entry", redis="fake"
        )
        mock_publish.assert_called_once()
        event = mock_publish.call_args[0][2]
        assert event["action"] == "append"

    @patch("app.services.memory_center.publish_event", new_callable=AsyncMock)
    async def test_delete_publishes_event(self, mock_publish, db_session, user, mc):
        await mc.upsert_memory(db_session, VI_USER_ID, "del.md", "c")
        mock_publish.reset_mock()
        await mc.delete_memory(db_session, VI_USER_ID, "del.md", redis="fake")
        mock_publish.assert_called_once()
        event = mock_publish.call_args[0][2]
        assert event["action"] == "delete"

    @patch("app.services.memory_center.publish_event", new_callable=AsyncMock)
    async def test_no_event_when_redis_is_none(self, mock_publish, db_session, user, mc):
        """When redis=None, publish_event is still called but it's a no-op."""
        await mc.upsert_memory(db_session, VI_USER_ID, "x.md", "c")
        # publish_event is called with redis=None (first arg)
        assert mock_publish.call_args[0][0] is None
