# 📋 Team Board

> AI-Native Agile Operating System
> Last sync: 2026-03-02 by casey

---

## 🎯 Current Version: V0.1 — "AI Camera Pipeline 全链路验证"

> **Spec**: `.claude/drive/v0.1-definition/v0.1-spec.md`
> **Status**: dev
> **Goal**: 3 个 Use Case 全链路跑通 + Quality Gate 达标 → QA → Release
>
> 当下方所有 V0.1 任务 Done → **Feature Freeze** → QA 环节 → `git tag v0.1.0`

### V0.1 测试矩阵 (3 项，全部通过即达标)

| # | 场景 | 通过标准 | Status |
|---|------|---------|--------|
| 1 | 拍苹果→卡路里卡片 | 名称+热量±30%+卡片美观+语音+retrieve | ⬜ |
| 2 | 拍龟背竹→植物探测卡片 | 名称+毒性警告+养护三要素+语音+retrieve | ⬜ |
| 3 | 拍手绘登录页→可交互demo | 布局≥60%+按钮可点击+输入框+语音+retrieve | ⬜ |

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

| ID | Task | Priority | Est | Tags | Version | Notes |
|----|------|----------|-----|------|---------|-------|
| T-056 | UC-1: 食物→卡路里卡片全链路 | P0 | L | `feature` `realtime` `gateway` `frontend` | V0.1 | Camera→语音→Gateway→HTML卡片→Home retrieve |
| T-057 | UC-2: 植物→探测卡片全链路 | P0 | M | `feature` `realtime` `gateway` `frontend` | V0.1 | 共享 UC-1 pipeline，不同 prompt/模板 |
| T-058 | UC-3a: 手绘UI→可交互Demo | P0 | L | `feature` `realtime` `gateway` `frontend` | V0.1 | 拍照纸上手绘→AI识别→生成HTML/CSS/JS |
| T-059 | UC-3b: 手绘脑图→可视化脑图 | P0 | L | `feature` `realtime` `gateway` `frontend` | V0.1 | 拍照纸上脑图→AI识别→结构化脑图 |
| T-060 | 核心 Loop 性能达标 | P0 | M | `enhance` `global` | V0.1 | T1≤3s T2≤8s T3无白屏 T4≤1.5s T5≤2s T6≤2s |
| T-061 | 能耗指标达标 | P1 | M | `enhance` `global` | V0.1 | E1≤50K tokens E2≤15s E3≤$0.05 E4 CPU≤15% |
| T-062 | 稳定性达标 | P1 | M | `test` `global` | V0.1 | S1≥85% S2≥3次 S3≥2轮 S4优雅失败 |
| T-063 | V0.1 QA 验收 | P0 | M | `test` `global` | V0.1 | 3项测试矩阵 + Quality Gate 全量验证 |
| T-050 | GitHub Actions CI pipeline | P2 | L | `infra` `global` | — | CONTRIBUTING.md I003 |
| T-051 | Frontend test infrastructure | P2 | M | `infra` `frontend` | — | CONTRIBUTING.md I001 |
| T-052 | Gateway test infrastructure | P2 | M | `infra` `gateway` | — | CONTRIBUTING.md I002 |

## 💡 Backlog

| ID | Task | Priority | Tags | Version | Notes |
|----|------|----------|------|---------|-------|
| T-053 | Alembic migration setup | P2 | `infra` `api-server` | — | CONTRIBUTING.md E001 |
| T-054 | ESLint + Prettier for gateway | P3 | `infra` `gateway` | — | CONTRIBUTING.md I008 |
| T-055 | Full-stack smoke test script | P3 | `test` `global` | — | CONTRIBUTING.md B005 |

## ✅ Done (Recent)

| ID | Task | Owner | Completed | Branch | Drive? |
|----|------|-------|-----------|--------|--------|
| T-048 | Comprehensive project README | casey | 03-02 | `main` | |
| T-049 | Claude Code skill system setup | casey | 03-02 | `main` | |

---

## 📊 Stats

- **Active**: 0 WIP, 0 blocked, 0 review
- **Queued**: 11 tasks (6 P0, 2 P1, 3 P2) — **8 tasks for V0.1**
- **Backlog**: 3 tasks
- **Done this month**: 2 tasks
- **V0.1 progress**: 0/8 tasks done

### 🏆 Merge Count (合入 main 的数目 — 核心指标)

| Role | Merged | Current MC |
|------|--------|------------|
| casey | 2 | — |

## 📝 Conventions

- **Task ID**: `T-{三位数字}`, 递增, 下一个可用: T-064
- **Est**: `S`=1-2h, `M`=半天-1天, `L`=2-3天, `XL`=需拆分
- **Drive?**: 通过 `/drive` 执行的任务标记 ✅
- **Version**: 任务归属的版本号，无版本号的是基础设施任务
- **更新频率**: 每人每天至少更新一次自己的任务状态
- **归档**: Done 超过 30 天的任务移到 `archive/YYYY-MM.md`
- **Worktree**: WIP 任务应有对应 worktree (`../vi-wt-{slug}`)
- **分支**: 遵循 CONTRIBUTING.md 命名规范 (`{type}/{task-id}-{slug}`)
