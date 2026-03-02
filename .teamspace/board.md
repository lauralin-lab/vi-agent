# 📋 Team Board

> AI-Native Agile Operating System
> Last sync: 2026-03-02 by casey

---

## 🔴 Blocked

| ID | Task | Owner | Blocker | Since |
|----|------|-------|---------|-------|

## 🟡 In Progress

| ID | Task | Owner | Branch | Worktree | Started | Drive? |
|----|------|-------|--------|----------|---------|--------|

## 🔵 In Review

| ID | Task | Owner | Branch | PR |
|----|------|-------|--------|----|

## 📋 Queued

| ID | Task | Priority | Est | Tags | Notes |
|----|------|----------|-----|------|-------|
| T-050 | GitHub Actions CI pipeline | P2 | L | `infra` `global` | CONTRIBUTING.md I003 |
| T-051 | Frontend test infrastructure | P2 | M | `infra` `frontend` | CONTRIBUTING.md I001 |
| T-052 | Gateway test infrastructure | P2 | M | `infra` `gateway` | CONTRIBUTING.md I002 |

## 💡 Backlog

| ID | Task | Priority | Tags | Notes |
|----|------|----------|------|-------|
| T-053 | Alembic migration setup | P2 | `infra` `api-server` | CONTRIBUTING.md E001 |
| T-054 | ESLint + Prettier for gateway | P3 | `infra` `gateway` | CONTRIBUTING.md I008 |
| T-055 | Full-stack smoke test script | P3 | `test` `global` | CONTRIBUTING.md B005 |

## ✅ Done (Recent)

| ID | Task | Owner | Completed | Branch | Drive? |
|----|------|-------|-----------|--------|--------|
| T-048 | Comprehensive project README | casey | 03-02 | `main` | |
| T-049 | Claude Code skill system setup | casey | 03-02 | `main` | |

---

## 📊 Stats

- **Active**: 0 WIP, 0 blocked, 0 review
- **Queued**: 3 tasks (0 P0, 0 P1, 3 P2)
- **Backlog**: 3 tasks
- **Done this month**: 2 tasks

## 📝 Conventions

- **Task ID**: `T-{三位数字}`, 递增, 下一个可用: T-056
- **Est**: `S`=1-2h, `M`=半天-1天, `L`=2-3天, `XL`=需拆分
- **Drive?**: 通过 `/drive` 执行的任务标记 ✅
- **更新频率**: 每人每天至少更新一次自己的任务状态
- **归档**: Done 超过 30 天的任务移到 `archive/YYYY-MM.md`
- **Worktree**: WIP 任务应有对应 worktree (`../vi-wt-{slug}`)
- **分支**: 遵循 CONTRIBUTING.md 命名规范 (`{type}/{task-id}-{slug}`)
