---
issue: 70
url: https://github.com/flair-home-stylist/vi_agent/issues/70
title: "feat: implement System V4 — Master-Spokesperson architecture with NanoClaw agent-per-user model"
assignee: initialneil
priority: P0
labels: [mission-contract, priority:P0, domain:global, size:XL, status:wip]
branch: system_v4
milestone: none
version: "V0.1"
claimed: 2026-03-04T20:00:00+08:00
issue_content_hash: "70-system-v4-claimed"
---

# MISSION-70: feat: implement System V4 — Master-Spokesperson architecture with NanoClaw agent-per-user model

## Objective

Replace the single-gateway model (V3) with a NanoClaw-based agent-per-user architecture coordinated via a Redis Shared Event Bus, adopting the Master-Spokesperson pattern (NanoClaw = brain, LiveKit = voice).

## Sub-tasks

- [ ] Add NanoClaw service (index, config, channels, executor, context, fs, skills, tools, redis-client, Docker)
- [ ] Implement Redis Event Bus schema and channel wiring
- [ ] Refactor realtime agent into `assistant/` modules (base, context, dispatch, heartbeat, tools)
- [ ] Add `redis_events.py` for realtime → Redis publishing
- [ ] API: add OAuth token routes + `token_center` service + DB migration
- [ ] API: add skills routes + `skill_manager` service
- [ ] API: add filesystem proxy routes + `fs_proxy` + `gcs_service`
- [ ] API: add event aggregator + enhanced internal routes
- [ ] Frontend: rewrite LiveSessionView for V4 three-brain display
- [ ] Frontend: add HistoryView, MemoryView, SkillsView, ConnectionsView, IntentionCard
- [ ] Frontend: add hooks (useNanoClawResults, useImagePreloader, enhanced useAgentProtocol)
- [ ] Frontend: update styling (index.css design system, iframeDesignSystem)
- [ ] Remove gateway service and all related files
- [ ] Update docker-compose with nanoclaw service, new env vars
- [ ] Update documentation (system_v4.md, shared-bus-v4.md, product.md)

## Acceptance Criteria

- NanoClaw service builds and runs in Docker (per-user container)
- Redis Event Bus operational (5 channels, pub/sub between services)
- LiveKit realtime agent refactored to Spokesperson role (no direct task execution)
- API Server new routes functional (tokens, skills, fs, events, internal)
- Frontend renders NanoClaw thinking + progress + streaming HTML + module cards
- Gateway service fully removed from docker-compose
- OAuth token flow works end-to-end (connect/refresh/revoke)
- Skill system loads and executes skills via Claude Agent SDK
- Context Compiler delivers 30s snapshots to LiveKit agent
- DB migration for `oauth_tokens` table applies cleanly
- All existing tests pass, deployment tests 16/16

## Context Files

### NanoClaw (NEW service)
- `nanoclaw/src/index.ts` — Main entry, Redis connect, channel subscriptions
- `nanoclaw/src/config.ts` — Per-user configuration
- `nanoclaw/src/channels/` — Event consumers (exec, frames, media, actions, stream)
- `nanoclaw/src/executor/` — Task executor and media processor
- `nanoclaw/src/context/` — Context compiler (30s loop), intention predictor
- `nanoclaw/src/fs/` — User filesystem (S3 sync)
- `nanoclaw/src/skills/` — Skill loader and executor
- `nanoclaw/src/tools/` — RPC tools (memory, OAuth, publish)
- `nanoclaw/src/redis-client.ts` — Redis connection
- `nanoclaw/Dockerfile` — Multi-stage build

### Realtime (refactored)
- `realtime/src/assistant/base.py` — Core Assistant class
- `realtime/src/assistant/context.py` — Context management
- `realtime/src/assistant/dispatch.py` — RPC dispatch to NanoClaw
- `realtime/src/assistant/heartbeat.py` — Connection monitoring
- `realtime/src/assistant/tools.py` — RPC method definitions
- `realtime/src/redis_events.py` — Redis event publishing

### API Server (enhanced)
- `api-server/app/routes/tokens.py` — OAuth token CRUD
- `api-server/app/routes/skills.py` — Skill management
- `api-server/app/routes/fs.py` — Filesystem proxy
- `api-server/app/routes/events.py` — Event streaming + history
- `api-server/app/routes/internal.py` — Context, intentions, dispatch
- `api-server/app/services/token_center.py` — OAuth lifecycle
- `api-server/app/services/skill_manager.py` — Skill CRUD
- `api-server/app/services/fs_proxy.py` — S3 proxy
- `api-server/app/services/event_aggregator.py` — Event aggregation
- `api-server/app/models.py` — OAuthToken model, updated User
- `api-server/app/schemas/redis_events.py` — Event message types

### Frontend (overhauled)
- `frontend/src/components/LiveSessionView.jsx` — V4 three-brain display
- `frontend/src/components/HistoryView.jsx` — Session history
- `frontend/src/components/MemoryView.jsx` — Memory layers
- `frontend/src/components/SkillsView.jsx` — Skill management UI
- `frontend/src/components/ConnectionsView.jsx` — OAuth connections
- `frontend/src/components/IntentionCard.jsx` — Intention predictions
- `frontend/src/hooks/useNanoClawResults.js` — Streaming results
- `frontend/src/hooks/useImagePreloader.js` — Image preloading
- `frontend/src/services/api.js` — New API endpoints

### Infrastructure
- `docker-compose.yml` — New nanoclaw service, removed gateway
- `docs/system_v4.md` — V4 architecture spec
- `docs/architecture/shared-bus-v4.md` — Redis bus design

## Test Command

```bash
# Build all services
docker compose build

# Deploy and test
/dev
# Expect: 16/16 tests passed
```

## AI Notes

- Branch: `system_v4` (already in development, commit 42a730b)
- Code changes already committed, deployed to szj dev instance
- 252 files changed, +30,299 / -17,522 vs main
- **NanoClaw user ID mismatch fixed (Option A)**: Set `NANOCLAW_USER_ID=vi-dev-c2573b758144` in szj dev .env. No code changes needed — the config pipeline (`docker-compose.yml` → `USER_ID` env → `config.ts`) was already correct. The default `dev-user` didn't match the dynamically generated `vi-dev-c2573b758144`. Option B (psubscribe wildcard) was rejected as it violates V4's fixed 1:1 user-NanoClaw binding.
- **Deployment note**: After user signup, `NANOCLAW_USER_ID` must be set to the actual `vi_user_id` from the database. This is a deployment-time configuration step, not a code issue.
