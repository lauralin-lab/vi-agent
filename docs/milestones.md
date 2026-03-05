# VI Agent — Milestone Roadmap

> **Last Updated:** 2026-03-04
> **Target Architecture:** System V4 (docs/system_v4.md)
> **Product Vision:** product.md
> **V4 代码状态:** `system_v4` 分支已实现 ~95% 的 V4 架构代码

---

## Overview

```
V0.1 ──→ V0.2 ──→ V0.3 ──→ V0.4 ──→ V1.0
 │         │         │         │         │
V3验证    V4合并    集成验证   缺口补齐   生产就绪
(30 MCs)  (~6)     (~8)      (~8)      (~8)
```

每个 milestone 对应一个 GitHub Milestone，Mission Contract Issues 归属到对应 milestone。
进度查看: `gh issue list --milestone "V0.2 — V4 合并与基础验证"`

### 背景: V4 代码审计 (2026-03-04)

`system_v4` 分支（commit `42a730b`）已包含 V4 架构的大部分实现：

| 服务 | 完成度 | 说明 |
|------|--------|------|
| NanoClaw (主脑) | 95% | Context Compiler, Intention Predictor, Skill Executor, S3 Sync 全部实现 |
| Realtime (代言人) | 100% | vi:ctx 订阅, keyframe sampling, vi:exec 派发, vi:actions 发布 |
| API Server | 98% | FS Proxy, Skill Manager, OAuth Token Center, Event Aggregator |
| Frontend | 98% | useNanoClawResults, IntentionCard, SkillsView, ConnectionsView, 视频录制 |

**已知缺口:**

| 缺口 | 严重度 | 位置 |
|------|--------|------|
| 视频处理 stub | 高 | `nanoclaw/src/channels/media-consumer.ts` — video 分支只有 console.log |
| 缺 Whisper 转录 | 高 | `nanoclaw/src/executor/media-processor.ts` — 无 analyzeVideo() 编排器 |
| OAuth 架构不匹配 | 高 | `nanoclaw/src/tools/oauth-call.ts` 调 API 但接口不返回 access_token |
| web_search 工具 | 中 | `nanoclaw/src/skills/skill-executor.ts` — 返回空结果 |
| 测试覆盖为零 | 中 | NanoClaw 无测试, OAuth routes/service 无测试 |
| 生产编排缺失 | 低 | docker-compose 只有 1 个 NanoClaw 实例 |

因此 milestone 从"从零实现"调整为"合并→集成验证→缺口补齐→生产化"。

### 与 V4 技术阶段的映射

| V4 Migration Phase (system_v4.md §15) | 代码状态 | Milestone |
|---|---|---|
| Phase 1: 基础设施 (Redis + API 扩展) | ✅ 已实现 | V0.2 合并 |
| Phase 2: NanoClaw 集成 (Context Compiler + S3) | ✅ 已实现 | V0.2 合并 |
| Phase 3: Realtime Agent 升级 (Context 订阅 + Keyframe) | ✅ 已实现 | V0.3 集成验证 |
| Phase 4: 意图预测 (Claude Haiku + Intention Cards) | ✅ 已实现 | V0.3 集成验证 |
| Phase 5: Frontend 适配 (Intention Cards + 视频) | ⚠️ 视频 stub | V0.3 + V0.4 |
| Phase 6: 清理 (移除 gateway) | ✅ gateway 已删 | V0.2 合并时完成 |

---

## M0: V0.1 — AI Camera Pipeline 全链路验证

> **GitHub Milestone**: `V0.1 — AI Camera Pipeline 全链路验证`
> **架构**: V3 (gateway-based)
> **状态**: Current (30 MCs)

### 目标

V3 架构下 3 个 Use Case 端到端跑通 + Quality Gate 达标。

### 测试矩阵

| # | 场景 | 通过标准 |
|---|------|---------|
| 1 | 拍苹果→卡路里卡片 | 名称+热量±30%+卡片美观+语音+retrieve |
| 2 | 拍龟背竹→植物探测卡片 | 名称+毒性警告+养护三要素+语音+retrieve |
| 3 | 拍手绘登录页→可交互demo | 布局≥60%+按钮可点击+输入框+语音+retrieve |

### Quality Gate

- 性能: T1≤3s T2≤8s T3无白屏 T4≤1.5s T5≤2s T6≤2s
- 能耗: E1≤50K tokens E2≤15s E3≤$0.05 E4 CPU≤15%
- 稳定性: S1≥85% S2≥3次 S3≥2轮 S4优雅失败

### Exit Criteria

- 3 项测试矩阵全部通过
- Quality Gate 全部达标
- QA 验收通过 → `git tag v0.1.0`

### 产品价值

证明 "AI Camera" 基本可用——拍照→语音→处理→结果→检索

---

## M1: V0.2 — V4 合并与基础验证

> **GitHub Milestone**: `V0.2 — V4 合并与基础验证`
> **前提**: V0.1 完成 (V3 验证通过)
> **预计 Mission Contracts**: ~6

### 目标

将 `system_v4` 分支合并到 main，解决所有冲突，4 个服务全部启动并通过健康检查。

### 关键交付

| # | 任务 | Domain | Size |
|---|------|--------|------|
| 1 | Merge `system_v4` → main，解决所有冲突 | global | L |
| 2 | docker-compose up 全服务启动验证 | infra | M |
| 3 | NanoClaw 健康检查 + Redis 连通性验证 | nanoclaw | S |
| 4 | API Server 新路由基础验证 (fs, skills, tokens, events) | api-server | M |
| 5 | Frontend 编译 + 新组件渲染验证 | frontend | M |
| 6 | Realtime Agent 重构后启动验证 (assistant/ package) | realtime | M |

### Exit Criteria

- `docker-compose up` 全部 4 服务 healthy
- NanoClaw 容器接收 vi:exec 消息、返回 vi:stream 响应
- API Server `/api/fs/`, `/api/skills/`, `/api/tokens/` 路由可访问
- Frontend 编译无错误，新组件 (IntentionCard, SkillsView 等) 可渲染
- Realtime Agent `assistant/` 包正常启动，连接 LiveKit
- Gateway 已移除 (system_v4 已删除 gateway/)

### 产品价值

V4 代码正式进入 main，团队统一在 V4 架构上开发

---

## M2: V0.3 — 集成验证 + Skill/意图系统

> **GitHub Milestone**: `V0.3 — 集成验证 + Skill/意图系统`
> **预计 Mission Contracts**: ~8
> **★ 核心验证 milestone — 证明 V4 架构真正工作**

### 目标

7 条数据流端到端跑通。Skill 系统可执行。意图预测产出 Intention Cards。双脑循环闭环。

### 关键交付

| # | 任务 | Domain | Size |
|---|------|--------|------|
| 1 | Data Flow 验证: Realtime→vi:actions→Event Aggregator→vi:summary | global | M |
| 2 | Data Flow 验证: Context Compiler→vi:ctx→Realtime→Gemini injection | global | M |
| 3 | Data Flow 验证: Keyframe→S3→vi:frames→Context Compiler | global | M |
| 4 | Skill 执行 E2E: recipe-analyzer 拍食物→执行→结果展示 | nanoclaw + frontend | L |
| 5 | Skill 执行 E2E: document-scanner + style-advisor | nanoclaw + frontend | M |
| 6 | 意图预测 E2E: Context→Claude Haiku→vi:intent→SSE→IntentionCard | nanoclaw + frontend | L |
| 7 | 双脑循环验证: 主脑 context injection → 代言人行为改变 → 用户可感知 | realtime + nanoclaw | L |
| 8 | Session View 三区布局 + 结果展示验证 | frontend | M |

### Exit Criteria

- 3 个预装 Skill 通过 Intention Card 一键执行
- 拍照后 AI 自动预测 3-5 个意图 (含 confidence %)
- Gemini 语音主动建议 (>80% confidence)
- Realtime Agent 行为明确由 NanoClaw context 驱动
- 7 条 V4 数据流全部 E2E 验证通过

### 产品价值

**产品质变** — "Predict, Don't Ask"。V4 双脑+Skill+意图预测 = 完整的 AI Camera 体验

---

## M3: V0.4 — 视频处理 + OAuth + 测试覆盖

> **GitHub Milestone**: `V0.4 — 视频处理 + OAuth + 测试覆盖`
> **预计 Mission Contracts**: ~8

### 目标

补齐 V4 已知缺口：视频处理完整实现、OAuth 架构修复、关键路径测试覆盖。

### 关键交付

| # | 任务 | Domain | Size |
|---|------|--------|------|
| 1 | NanoClaw: 视频处理完整实现 (media-consumer → ffmpeg → Whisper → Claude 多帧) | nanoclaw | L |
| 2 | NanoClaw: analyzeVideo() 编排器 (keyframes + transcript + multi-frame reasoning) | nanoclaw | L |
| 3 | OAuth 架构修复: NanoClaw 读取本地加密 token 文件 (替代 API 调用) | nanoclaw + api-server | M |
| 4 | web_search 工具实现 (替代空结果 stub) | nanoclaw | M |
| 5 | NanoClaw 测试: Skill Executor, Context Compiler, Intention Predictor | nanoclaw | L |
| 6 | API Server 测试: OAuth routes + Token Center | api-server | M |
| 7 | 视频 E2E: 录视频→上传→NanoClaw 处理→结果展示 | global | L |
| 8 | OAuth E2E: Google OAuth connect→Agent 使用→token 刷新 | global | M |

### Exit Criteria

- 用户录制 ≤30s 视频 → NanoClaw 完整处理 (关键帧 + 转录 + 多帧推理)
- OAuth 完整链路: connect → Agent 使用 → 自动刷新
- NanoClaw CI 有 `npm test` 步骤且通过
- OAuth routes + Token Center 有测试覆盖
- web_search 工具返回真实搜索结果

### 产品价值

AI 不仅看一张照片，还能理解一段过程 + 代用户操作外部服务 + 质量保障

---

## M4: V1.0 — 生产就绪

> **GitHub Milestone**: `V1.0 — 完整 V4 发布`
> **预计 Mission Contracts**: ~8

### 目标

生产就绪的 V4 部署 + 全面 QA。

### 关键交付

| # | 任务 | Domain | Size |
|---|------|--------|------|
| 1 | NanoClaw Orchestrator (容器生命周期管理, 1:1 user mapping) | infra | L |
| 2 | docker-compose.v4.yml 生产部署 | infra | M |
| 3 | 意图预测成本优化 (≤$0.50/user/day) | nanoclaw | M |
| 4 | 性能验证 (T1-T6 指标 + Token/延迟/吞吐量) | global | M |
| 5 | 资源预算验证 (8GB VPS, 10 用户并发) | infra | M |
| 6 | 6 个 Pre-installed Skills 全部验证 | global | L |
| 7 | V1.0 全面 QA (7 个 Data Flow + 3 Use Cases) | global | L |
| 8 | 文档更新 (API docs, deployment guide, architecture) | global | M |

### Exit Criteria

- 10 用户并发运行在单 VPS ($50/month)
- 所有 6 个预装 Skill 可执行
- 所有 7 个 Data Flow 验证通过
- 性能 Quality Gate 全部达标
- `git tag v1.0.0`

### 产品价值

"Video Call with Your Claude Code" 完整上线

---

## Team Domain Matrix

| Milestone | casey (Lead) | liyasong (Infra) | yuang-yang (Backend) | szj (Realtime) | xxLe (Frontend) | yijia (Agent) |
|---|---|---|---|---|---|---|
| V0.1 | 协调 | 部署 | API | Realtime | Frontend | Agent 调试 |
| V0.2 | Merge + 验证 | Docker 验证 | API 路由验证 | Realtime 启动 | 编译验证 | NanoClaw 验证 |
| V0.3 | E2E + Skill | — | Event Aggregator | 双脑循环 | Intention Cards | Skill + 意图 |
| V0.4 | OAuth E2E | CI 测试 | OAuth 修复 | — | 视频 UI | 视频处理 + 测试 |
| V1.0 | 全面 QA | Orchestrator | 性能验证 | — | — | 成本优化 |

---

*VI Agent Milestone Roadmap | 2026-03-04 | Revised after V4 code audit*
