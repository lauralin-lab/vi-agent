# VI Agent — Architecture V7

> **状态**: 正式架构文档 — 替代 system_v4.md (实施细节) + architecture-v6-brainstorm.md (规模畅想)
>
> **核心原则**: 渐进式演进 + 主脑-代言人哲学 + 每阶段只解决当前问题
>
> **前置文档**: architecture-v5.md (部署阶段), system_v4.md (V4 设计), architecture-v6-brainstorm.md (规模畅想)
>
> **日期**: 2026-03-04
>
> **作者**: Casey + Li Ya + System Architect Review

---

## 0. 设计公理 — V7 的不可违背原则

> *"欧几里得用 5 条公设推导了 13 卷几何原本。好的架构也应该从最小公理集推导出所有行为。"*

| # | 公理 | 推论 |
|---|------|------|
| **A1** | 用户通过实时音视频与 AI 交互 | Gemini Live 原生管道不可替代; LiveKit 是传输层 |
| **A2** | 深度任务由 Claude Agent SDK 执行 | NanoClaw/Claude Code 是执行引擎; 需要工具链和文件系统 |
| **A3** | AI 跨会话记住用户 | 持久化记忆是核心能力, 不是附加功能 |
| **A4** | Skill 是价值交付的原子单位 | 每个 Skill = 一个可独立交付的用户场景 |
| **A5** | NanoClaw 是主脑, Gemini 是代言人 | 价值创造 (Claude) 和价值传递 (Gemini) 分离 |
| **A6** | 不为假想问题付复杂度税 | 每个演进必须有真实触发条件, 不满足就不动 |

**A6 是元公理 — 它约束所有其他设计决策。** 任何违反 A6 的设计, 无论多优雅, 都是错误的。

---

## 1. 当前现实 — 知己知彼

> *"孙子曰: 知己知彼, 百战不殆。在动手设计之前, 先看清自己有什么。"*

### 1.1 实际已实现的

```
vi_agent/ (monorepo)
├── api-server/     Python/FastAPI — 认证, Memory V3, Session, SSE, 上传
├── realtime/       Python/LiveKit Agent — Gemini Live 音视频, RPC, Context
├── gateway/        TypeScript/Node — Claude/Gemini 执行器, LiveKit DataChannel
├── frontend/       React 19/Vite — UI, SSE, LiveKit WebRTC
├── app/            Flutter — iOS/Android 移动端 (WebView + Native)
├── deploy/         部署脚本, docker-compose
└── docs/           架构文档
```

### 1.2 实际通信模式 (代码级事实)

```
Frontend ──── REST + SSE ────► api-server
    │                              │
    │ LiveKit WebRTC               │ HTTP (internal)
    │                              │
    ▼                              ▼
vi-realtime ◄── LiveKit RPC ──► vi-gateway
    │           dispatch_task       │
    │           rpcG2BSendReply     │
    │                              │
    │ HTTP Lazy Join (/join)       │ HTTP (fetch)
    └──────────────────────────────┘

Redis 实际使用 (仅两处):
  1. vi:events:{uid}     — api-server Pub/Sub → Frontend SSE
  2. vi:ctx:{uid}        — vi-realtime KV 缓存 (catch-up context)
  3. vi:gemini:resume    — vi-realtime KV 缓存 (Gemini 恢复)

⚠️ vi-gateway 完全不用 Redis
⚠️ NanoClaw 目前是 gateway 内的 Claude API 薄封装, 不是独立容器框架
```

### 1.3 当前痛点 (按严重度排序, 基于实际代码)

| # | 痛点 | 严重度 | 影响 | 来源 |
|---|------|--------|------|------|
| P1 | 单机部署, 无法横向扩展 | 高 | 用户增长即拉胯 | 当前架构 |
| P2 | api-server 代理 gateway (多余一跳) | 中 | 延迟增加, 代码冗余 | `routes/internal.py:423` |
| P3 | gateway 无状态, 任务崩溃丢结果 | 高 | 用户体验差 | gateway 设计 |
| P4 | gateway 既是路由又是执行器, 职责不清 | 中 | 扩展困难 | gateway 代码结构 |
| P5 | gateway NanoClaw adapter 图片全转 base64 | 高 | 大图 OOM 风险 | `nanoclaw-executor.ts` |
| P6 | 前端无 TypeScript (800 行协议层) | 中 | 维护风险 | `useAgentProtocol.js` |
| P7 | 无 Agent 文件系统 (无法 coding 等场景) | 中 | 功能受限 | 当前架构 |

---

## 2. 主脑-代言人架构 (V4 精华, V7 核心)

> *这是 V4 最重要的架构贡献, V7 完整保留。*

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  NanoClaw (Claude Code)              Realtime Agent (Gemini)   │
│  ══════════════════════              ═══════════════════════    │
│  🧠 主脑 / Master Brain             🎤 代言人 / Spokesperson   │
│                                                                 │
│  • 深度推理, 工具调用                • 实时语音, 视觉感知       │
│  • 记忆, 偏好, 用户画像              • 自然语言表达             │
│  • Skill 执行                       • 即兴对话, 情感回应        │
│  • 意图预测                         • 感官数据采集              │
│  • 文件操作, OAuth, 工具链           • 前端交互控制             │
│                                                                 │
│  ── 控制流 (context + instructions) ──────────────────────►    │
│  ◄── 感知流 (events + frames) ────────────────────────────     │
│                                                                 │
│  用户价值来源 = Claude Code + Skills                            │
│  用户交互界面 = 代言人 (Gemini 实时语音)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**类比**: NanoClaw 是 CEO (制定战略), Realtime Agent 是新闻发言人 (表达执行)。

**为什么这是正确的分离:**
- Gemini 没有工具层、没有持久记忆、没有 Skill — 它不能是主脑
- Claude Code 有完整 Agent SDK + 工具链 + 持久化 — 它天然是执行中心
- 用户价值 100% 来自 Claude + Skills, 体验 100% 通过 Gemini 语音传递
- **价值创造和价值传递分离** — V7 架构的灵魂

---

## 3. 演进路线 — 四阶段渐进

> *"赫伯特·西蒙的钟表匠寓言: 复杂系统从简单系统通过稳定中间形态演化而来。每个阶段必须是一个稳定可用的系统。"*

```
阶段 0        阶段 1          阶段 2           阶段 3
现在→V0.1      V0.1→V0.2       500+用户          5000+用户
<50 用户       50-500 用户      横向扩展          平台化

┌────────┐   ┌────────────┐  ┌──────────────┐  ┌──────────────────┐
│单机     │   │ NanoClaw   │  │ MIG +        │  │ 容器池 +         │
│docker   │──►│ 容器 +     │──►│ Cloud SQL + │──►│ Agent Router +  │
│compose  │   │ Redis 总线 │  │ 执行层解耦   │  │ 分层执行         │
└────────┘   └────────────┘  └──────────────┘  └──────────────────┘
  $130/月      $200-500/月      $500-2K/月        $2K-10K/月

触发: V0.1    触发: 产品验证   触发: 单机CPU     触发: 用户>5000
      发布          成功       持续>70%          或需要平台化
```

---

## 4. 阶段 0: 现在 → V0.1 发布 (<50 用户)

**原则: 不改架构, 只修痛点。** 与 V5 Phase 0 一致。

### 4.1 架构 (保持不变)

```
GCE e2-standard-8 — docker-compose
├── nginx        (:80/:443)
├── frontend     (:5173)
├── api-server   (:8000)
├── vi-realtime  (LiveKit)
├── vi-gateway   (:18789)
├── postgres     (:5432)
└── redis        (:6379)
```

### 4.2 可修的痛点 (不影响架构)

| 修复 | 工作量 | 影响 |
|------|--------|------|
| P2: 去掉 api-server 对 gateway 的代理 | 小 | 减少一跳 |
| P5: 图片改用 URL 引用, 不转 base64 | 中 | 消除 OOM 风险 |
| P6: 前端协议层迁移 TypeScript | 中 | 提高可维护性 |

### 4.3 退出条件 (任一触发阶段 1 规划)

- V0.1 发布, 准备接入真实用户
- 移动端 App 上线需要 Firebase Auth
- 需要 NanoClaw 容器化 (真正的 Agent 能力)

---

## 5. 阶段 1: V0.1 → V0.2 (50-500 用户) — V4 核心实施

> *这是 V7 最关键的阶段 — 引入 NanoClaw 真正的容器化 Agent + Redis 事件总线。*
> *本阶段实施的就是 V4 system_v4.md 的核心设计, 但做了关键简化。*

### 5.1 架构总览

```
╔═══════════════════════════════════════════════════════════════════╗
║                    VPS ($50-80/月, 10-50 用户)                    ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  ┌───────────┐    WebRTC        ┌──────────────────────┐         ║
║  │ Frontend  │◄───────────────►│  LiveKit Cloud        │         ║
║  │ (nginx)   │    SSE           └──────────┬───────────┘         ║
║  │           │◄──────────┐                 │                     ║
║  └─────┬─────┘           │                 ▼                     ║
║        │ HTTP            │      ┌──────────────────────┐         ║
║        ▼                 │      │  Realtime Agent ×N   │         ║
║  ┌────────────────┐  ┌───┴────┐│  (代言人, Gemini)     │         ║
║  │  API Server    │◄►│ Redis  │◄►                      │         ║
║  │  (FastAPI)     │  │ (7.x)  ││  订阅 vi:ctx          │         ║
║  │                │  │        ││  发布 vi:actions       │         ║
║  │  Auth Center   │  │ vi:ctx ││  发布 vi:frames       │         ║
║  │  Memory V3     │  │ vi:exec│└──────────────────────┘         ║
║  │  Token Center  │  │ vi:str │                                  ║
║  │  SSE Relay     │  │ vi:act │                                  ║
║  │  FS Proxy      │  └───┬────┘                                  ║
║  └────────────────┘      │                                       ║
║                          │ Redis Pub/Sub + Stream                 ║
║                          ▼                                       ║
║  ┌────────────────────────────────────────────────────────────┐  ║
║  │         NanoClaw Agent (主脑, Docker ×N, 1:1 per user)     │  ║
║  │  ┌──────────┐ ┌──────────┐        ┌──────────┐            │  ║
║  │  │ Agent-1  │ │ Agent-2  │  ...   │ Agent-N  │            │  ║
║  │  │ user-001 │ │ user-002 │        │ user-00N │            │  ║
║  │  │ Claude   │ │ Claude   │        │ Claude   │            │  ║
║  │  │ AgentSDK │ │ AgentSDK │        │ AgentSDK │            │  ║
║  │  └────┬─────┘ └────┬─────┘        └────┬─────┘            │  ║
║  │       └─────────────┴──── /workspace/ ──┘                  │  ║
║  └────────────────────────────────────────────────────────────┘  ║
║         │                          │                             ║
║  ┌──────▼──────┐           ┌──────▼───────┐                     ║
║  │ PostgreSQL  │           │   S3 / GCS   │                     ║
║  │ (metadata)  │           │ (user FS)    │                     ║
║  └─────────────┘           └──────────────┘                     ║
╚═══════════════════════════════════════════════════════════════════╝
```

### 5.2 关键变化: vi-gateway → NanoClaw Agent

```
阶段 0 (现在):                        阶段 1:
vi-gateway = 无状态 Claude API 封装    NanoClaw Agent = 有状态 Claude Agent SDK
  • 纯文本流                            • 工具调用 (文件, bash, 搜索)
  • 无文件系统                           • 持久 /workspace/ 文件系统
  • 无记忆                               • CLAUDE.md 用户人格 + 记忆
  • 任务崩溃丢结果                       • 本地持久化 + S3 同步
  • LiveKit DataChannel 输出             • Redis → SSE 输出
```

### 5.3 通信架构: Redis 事件总线 (来自 V4, 保留)

**为什么 Redis 而不是 gRPC:**

| 维度 | Redis Pub/Sub (V7 选择) | gRPC (V6 方案, 拒绝) |
|------|-------------------------|---------------------|
| 复杂度 | 极低 (已有 Redis) | 高 (新协议, 新依赖, protobuf) |
| 耦合度 | 零 (发布者不知道订阅者) | 中 (需要知道目标地址) |
| 学习成本 | 团队已掌握 | 需要学 |
| 当前规模适配 | 完美 (50-500 用户) | 杀鸡用牛刀 |
| 未来迁移 | Redis → Redis Cluster 无缝 | — |
| 调试 | redis-cli monitor | 需要额外工具 |

> *"Dijkstra: Simplicity is a prerequisite for reliability." Redis 比 gRPC 简单一个数量级。*

**Channel Schema (来自 V4, 精简):**

| Channel | 类型 | 发布者 | 订阅者 | 用途 |
|---------|------|--------|--------|------|
| `vi:ctx:{uid}` | Pub/Sub | NanoClaw | Realtime | 主脑→代言人: context + 意图预测 |
| `vi:exec:{uid}` | Pub/Sub | Realtime + Frontend | NanoClaw | 代言人→主脑: 任务派发 |
| `vi:stream:{uid}` | Pub/Sub | NanoClaw | API Server (SSE) | 流式结果推送 |
| `vi:actions:{uid}` | Stream | Realtime + Frontend | NanoClaw | 全量用户事件 |
| `vi:frames:{uid}` | Pub/Sub | Realtime | NanoClaw | LiveKit 关键帧 |
| `vi:events:{uid}` | Pub/Sub | API Server | Frontend (SSE) | SSE 事件中继 (已有) |
| `vi:intent:{uid}` | Pub/Sub | NanoClaw | API Server (SSE) | 意图卡片 |

### 5.4 NanoClaw 容器设计

**来自 V4, 保留 1:1 固定绑定。**

为什么 1:1 而不是池化 (V6 方案):

| 维度 | 1:1 固定 (V7) | 池化 (V6, 拒绝) |
|------|--------------|----------------|
| 复杂度 | 低 | 高 (池管理, 热切换, 快照恢复) |
| 文件系统 | 直接挂载, 零延迟 | OverlayFS + 快照, 2-5s 冷启动 |
| 后台任务 | 支持 (Agent 常驻) | 不支持 (容器回收即丢失) |
| 资源效率 | 中 (闲时浪费) | 高 |
| 适合规模 | 10-50 用户/VPS | 1000+ 用户 |
| 当前需要 | 是 (50-500 用户) | 否 |

> *池化是阶段 3 的事。现在做 = 为想象中的问题付真实的复杂度税。*

**容器规格 (来自 V4):**

```yaml
nanoclaw-{uid}:
  image: vi-nanoclaw:latest
  resources:
    limits: { memory: 512M, cpus: '0.5' }  # IO-bound, 可超卖
  volumes:
    - /data/users/{uid}:/workspace           # 持久 FS
    - /data/shared/skills:/skills:ro          # 共享 Skill (只读)
  environment:
    - ANTHROPIC_API_KEY
    - REDIS_URL=redis://redis:6379
    - USER_ID={uid}
```

### 5.5 Context Compiler + 意图预测 (来自 V4, 保留)

```
Context Compiler (每 30 秒)
  │
  ├── 读取 /workspace/memory/ (三层记忆金字塔)
  ├── 读取 /workspace/sessions/active/
  ├── 读取 Redis vi:summary (用户活动摘要)
  ├── 读取 vi:frames (最新关键帧 URL)
  │
  ├── 编译 context snapshot (≤ 2000 chars)
  ├── Claude Haiku 意图预测 (~$0.002/次)
  │
  ├── Publish → vi:ctx:{uid} (代言人接收)
  └── Publish → vi:intent:{uid} (前端意图卡片)
```

**V7 对 V4 的简化:**
- 去掉 Event Aggregator (API Server 内部模块) — 直接让 Context Compiler 从 vi:actions Stream 读取, 不需要中间聚合层
- 意图预测频率自适应: 场景不变 → 跳过, 用户空闲 → 降频

### 5.6 Skill 系统 (来自 V4, 保留)

```
Skill 加载优先级:
  1. /workspace/skills/{slug}/  — 用户自定义 (优先)
  2. /skills/{slug}/            — 预装共享 (fallback)

每个 Skill = skill.md + manifest.json
NanoClaw 启动 Agent SDK session 时: CLAUDE.md + skill.md → system prompt
```

> *V6 提出的 "Skill Registry" + 版本管理是好概念, 但在 50 个用户、6 个 Skill 的阶段不需要。
> 等 Skill 数量 > 20 或需要第三方 Skill 时再引入。*

### 5.7 用户文件系统 (来自 V4, 保留)

```
/data/users/{uid}/
├── CLAUDE.md              # 用户人格 + 偏好
├── memory/                # 三层记忆 (identity/semantic/episodic)
├── skills/                # 用户自定义 Skill
├── media/                 # 照片/视频
├── sessions/              # Session 历史
├── tokens/                # 加密 OAuth tokens
├── artifacts/             # Agent 产出物
└── .cache/                # context 缓存, 同步状态
```

**存储策略: 本地 SSD + S3 异步同步 (来自 V4)**

```
NanoClaw 容器 → /workspace/ (直接挂载) → Local SSD
                                            │
                                            │ async sync (60s debounce)
                                            ▼
                                         S3 / GCS (持久备份)
```

> *V6 的 OverlayFS + 快照方案在这里是过度设计。直接挂载 + S3 同步够用到 5000 用户。*

### 5.8 阶段 1 成本估算

| 项目 | 月成本 |
|------|--------|
| VPS (8GB/4core) | $50-80 |
| LiveKit Cloud | $100-500 |
| Claude API | $200-2,000 |
| Gemini API | $50-500 |
| S3/GCS | $5-20 |
| Firebase Auth | $0 |
| **总计** | **$405-3,100** |
| **每用户/月 (100 用户)** | **$4-31** |

### 5.9 退出条件

- VPS CPU 持续 > 70%
- PostgreSQL 连接数 > 80 或 p99 延迟 > 500ms
- 用户数 > 500, 需要横向扩展
- 安全审计要求更强隔离

---

## 6. 阶段 2: 横向扩展 (500-5000 用户) — 选择性引入 V6 思路

> *这是 V5 Phase 2 和 V6 ideas 的融合。只引入真正需要的, 拒绝还不需要的。*

### 6.1 架构变化

```
阶段 1 → 阶段 2 的关键变化:

  ┌────────────────────────────────────────────────────────────────┐
  │                       GKE / MIG 集群                           │
  │                                                                │
  │   ┌────────────────┐    ┌────────────────┐                    │
  │   │  API Server    │    │  vi-realtime   │                    │
  │   │  Pod ×2-3      │    │  Pod ×N        │                    │
  │   └────────┬───────┘    └───────┬────────┘                    │
  │            │                    │                              │
  │   ┌────────▼────────────────────▼────────┐                    │
  │   │          Redis Cluster               │ ← 从单实例升级      │
  │   │          (Memorystore)               │                    │
  │   └────────┬────────────────────┬────────┘                    │
  │            │                    │                              │
  │   ┌────────▼───────┐    ┌──────▼─────────────────────────┐    │
  │   │  vi-gateway    │    │  NanoClaw Nodes               │    │
  │   │  (演进版)       │    │  Node-1: Agent ×10            │    │
  │   │  Pod ×2-3      │    │  Node-2: Agent ×10            │    │
  │   │  + 路由逻辑     │    │  ...                          │    │
  │   └────────────────┘    └────────────────────────────────┘    │
  │                                                                │
  └────────────────────────────────────────────────────────────────┘
          │                          │
  ┌───────▼───────┐          ┌──────▼───────┐
  │  Cloud SQL    │          │   GCS        │
  │  PostgreSQL   │          │  (user FS)   │
  └───────────────┘          └──────────────┘
```

### 6.2 引入的 V6 概念

| 概念 | V6 原版 | V7 阶段 2 简化版 | 为什么简化 |
|------|---------|-----------------|-----------|
| **Agent Router** | 独立新服务, gRPC | vi-gateway 演进: 加入路由逻辑, 保留现有协议 | 不新建服务, 演进已有的 |
| **容器池** | Standard Pool + Dedicated Pool + OverlayFS | 多 VPS Node, 每 Node 10 NanoClaw, 用户路由到固定 Node | 1:1 保持, 只加机器 |
| **Cloud SQL** | Cloud SQL HA | Cloud SQL 非 HA (单实例起步, 需要时开 HA) | 不提前付 HA 成本 |
| **Redis Cluster** | Memorystore | Memorystore 单节点 (需要时升 Cluster) | 同上 |
| **pgvector** | 即时引入 | 当记忆 > 1000 条/用户时引入 | 不提前付向量搜索成本 |

### 6.3 vi-gateway 演进 (而非替换)

> *V6 提出用 Agent Router 替换 vi-gateway。这是错误的边界划分。*
>
> *正确做法: vi-gateway 演进, 加入路由逻辑, 但保留现有接口。*

```
阶段 1 vi-gateway:              阶段 2 vi-gateway (演进):
├── 接收 dispatch_task RPC       ├── 接收 dispatch_task RPC (不变)
├── 直接执行 (NanoClaw executor) ├── 路由决策:
└── 返回结果 (DataChannel/RPC)   │   ├── 轻量任务 → Claude API 直调
                                 │   └── 深度任务 → Redis vi:exec → NanoClaw
                                 └── 流式转发结果
```

**为什么演进而非替换:**
1. vi-gateway 已有 LiveKit 房间管理、RPC 处理、DataChannel 推送 — 这些代码有价值
2. 新建 Agent Router = 重写这些能力 + 维护两份代码
3. 加入路由逻辑只需要 ~200 行代码, 不需要新服务

### 6.4 用户路由: Node Affinity (而非池化)

```
用户注册时:
  hash(user_id) % N → 分配到 Node-K

Node-K:
  /data/users/{uid}/ → 本地 SSD (该用户的 workspace)
  NanoClaw-{uid} 容器 → 挂载该 workspace

用户请求:
  Load Balancer → 任意 API Server Pod → 查询 Redis (用户→Node 映射) → 路由到 Node-K
```

**为什么不是 V6 的池化:**
- 池化需要: 容器回收/分配、OverlayFS 挂载/卸载、快照上传/下载
- Node Affinity 只需要: 一个路由表 (Redis Hash)
- 效果相同: 用户和其 Agent 共定位
- 复杂度差: 一个数量级

### 6.5 阶段 2 成本估算

| 项目 | 月成本 |
|------|--------|
| GKE / MIG (3-5 节点) | $200-500 |
| NanoClaw Nodes (2-5 台) | $100-400 |
| Cloud SQL | $65-200 |
| Redis (Memorystore) | $35-100 |
| LiveKit Cloud | $500-2,000 |
| Claude API | $1,000-5,000 |
| Gemini API | $300-1,500 |
| GCS | $20-100 |
| LB + CDN | $30-100 |
| **总计** | **$2,250-9,900** |
| **每用户/月 (2000 用户)** | **$1.1-5.0** |

### 6.6 退出条件

- 用户数 > 5,000, 节点管理成本上升
- 需要真正的多租户 (B2B 企业客户)
- 需要 Skill 商店 / 第三方 Skill
- NanoClaw 1:1 模型成本过高 (闲置率 > 80%)

---

## 7. 阶段 3: 平台化 (5000+ 用户) — V6 精华落地

> *只有当阶段 2 的触发条件真正满足时, 才进入这个阶段。*
> *这是 V6 brainstorm 中值得保留的概念, 但以更务实的方式实施。*

### 7.1 此阶段引入的 V6 概念

| 概念 | 现在引入的理由 |
|------|---------------|
| **容器池 (Standard Pool)** | 闲置率 > 80% — 1:1 模型不再经济 |
| **轻量/标准/重量分层** | 5000+ 用户, 80% 请求不需要 NanoClaw |
| **Skill Registry** | Skill 数量 > 20, 需要版本管理 + 动态加载 |
| **pgvector** | 用户记忆大量增长, grep 不够用 |

### 7.2 分层执行 (来自 V6, 保留概念, 简化实现)

```
vi-gateway (已演进为路由器)
    │
    ├── 轻量任务 (~70%)
    │   └── Claude API 直调 (Haiku/Sonnet)
    │       无需 NanoClaw, 无状态
    │
    ├── 标准任务 (~25%)
    │   └── NanoClaw Pool (预热容器池)
    │       用完归还, tmpfs, 无持久 FS
    │
    └── 重量任务 (~5%)
        └── NanoClaw Dedicated (1:1 独占)
            持久 FS, coding 等场景
```

### 7.3 V7 对 V6 分层方案的修正

| V6 原版 | V7 修正 | 理由 |
|---------|---------|------|
| 80/15/5 流量分配 | 70/25/5 (待验证) | 80% 轻量是假设, 需要阶段 2 的数据验证 |
| OverlayFS + GCS 快照 | 标准层: tmpfs; 重量层: 保留 1:1 本地 FS | OverlayFS 增加运维复杂度, 本地 FS + S3 同步够用 |
| gRPC 容器通信 | 保留 Redis | 一致性: 整个系统统一使用 Redis, 不引入第二种 RPC |
| Container Pool Manager (新组件) | NanoClaw Orchestrator 扩展 | 演进已有组件, 不新建 |
| Skill Registry (独立服务) | Skill 目录 + 版本文件 (文件系统级) | 不需要独立服务, 文件系统 + Redis 缓存够用 |

### 7.4 成本估算 (5000-50000 用户)

| 项目 | 月成本 |
|------|--------|
| 基础设施 (GKE + DB + Redis + LB) | $1,000-3,000 |
| NanoClaw 节点 | $500-2,000 |
| Claude API | $3,000-15,000 |
| Gemini API | $1,000-5,000 |
| 存储 (GCS) | $50-200 |
| **总计** | **$5,550-25,200** |
| **每用户/月 (20000 用户)** | **$0.28-1.26** |

---

## 8. 阶段 3+: 百万用户 — 远景, 不是设计

> *V6 的百万用户架构是有价值的思考练习, 但不是现在要做的设计。*
> *"Knuth: Premature optimization is the root of all evil."*
> *以下只列方向, 不做详细设计, 因为到那时技术栈和产品形态可能已经完全不同。*

**方向清单 (不是设计):**
- GKE 多区域部署
- 容器运行时升级 (gVisor / Firecracker)
- 数据库分片 / Cloud Spanner
- 独立 Push Gateway
- Skill 商店 + 第三方生态
- 用户端 Agent (Edge computing)
- 向量数据库独立部署 (Qdrant/Pinecone)

**为什么不现在设计:**
1. 当前 0 用户, 百万用户的假设可能永远不成立
2. 12 个月后 LLM 生态会有根本性变化 (模型能力, 价格, API 形态)
3. 产品形态可能 pivot — 为确定的终态做架构是赌博
4. 设计文档在 12 个月后会过时 — 投入产出比极低

> *Simon 的有限理性: 满意即可 (satisfice), 不追求最优。到那个阶段再设计。*

---

## 9. 组件演进路线图

```
组件              阶段 0         阶段 1          阶段 2         阶段 3
═══════════       ══════         ══════          ══════         ══════
执行引擎          vi-gateway     NanoClaw 1:1    NanoClaw 1:1   Pool + Dedicated
                  (Claude API)   (Agent SDK)     + 路由分层

路由              无             vi-gateway      vi-gateway     vi-gateway
                                 (直接执行)      (路由+直调)    (完整路由器)

通信              HTTP + RPC     Redis 事件总线   Redis Cluster  Redis Cluster

数据库            Docker PG      Docker PG       Cloud SQL      Cloud SQL HA

缓存              Docker Redis   Docker Redis    Memorystore    Redis Cluster

文件系统          无             本地 SSD + S3    多 Node + S3   Pool:tmpfs
                                                               Ded:本地+S3

Skill             硬编码         .md + manifest  同上           + Registry
                                                               + 版本管理

记忆检索          API 查询       文件 grep        grep + 索引    pgvector

认证              自建 JWT       Firebase Auth   Firebase Auth  Firebase Auth

部署              docker-compose docker-compose  MIG/GKE        GKE

监控              docker logs    Cloud Logging   + Prometheus   + 全链路
```

---

## 10. 关键设计决策记录

### D1: 为什么保留 Redis 而不是引入 gRPC (拒绝 V6)

**决策**: 全栈 Redis 通信, 不引入 gRPC。

**推理**:
- Redis Pub/Sub 在 50K 消息/秒级别性能充足
- 团队已掌握 Redis, gRPC 有学习成本
- 引入第二种 RPC 协议 = 两套序列化, 两套错误处理, 两套监控
- 当 Redis 成为瓶颈时, 升级 Redis Cluster 比引入 gRPC 简单
- **一个通用机制优于两个专用机制** (庄子 "齐物")

**风险**: Redis 单点故障 → 缓解: Sentinel (阶段 1), Memorystore (阶段 2)

### D2: 为什么 vi-gateway 演进而不是 Agent Router 替换 (拒绝 V6)

**决策**: vi-gateway 加入路由逻辑, 不新建 Agent Router 服务。

**推理**:
- vi-gateway 已有: LiveKit 房间管理, RPC 处理, DataChannel 推送, 执行器调度
- Agent Router = 重写所有这些 + 新的 gRPC 层
- 演进只需加 ~200 行路由逻辑
- **Torvalds 原则: 从工作的单体出发, 随理解深入再模块化**

### D3: 为什么 1:1 固定映射而不是容器池 (拒绝 V6 Phase 1-2)

**决策**: 阶段 1-2 保持 1:1 用户-容器固定映射。阶段 3 再引入池化。

**推理**:
- 1:1 = 零冷启动, 零上下文切换, 文件系统直接挂载
- 池化需要: OverlayFS, 快照管理, 上下文注入, 容器生命周期管理
- 50-5000 用户, 每用户一个 512MB 容器, 需要 5-50 台 VPS, 月成本 $250-2500
- 这个成本在产品验证阶段完全可接受
- **不为 5000 用户之后的问题付现在的复杂度税**

### D4: 为什么不现在设计百万用户架构 (拒绝 V6 终态)

**决策**: 百万用户架构只列方向, 不做详细设计。

**推理**:
- 当前 0 用户 → 百万用户之间有 4-5 个数量级
- 每个数量级的瓶颈不同, 无法提前预测
- 12 个月后的 LLM 技术栈可能根本不同
- **设计的保质期 = 到下一个阶段触发条件满足为止**
- 投入写百万用户架构文档的时间, 不如投入写代码验证产品

### D5: Skill 系统 — 注入式, 不是源码修改 (采纳 V6 核心洞察)

**决策**: Skill 作为 context 注入到 Claude Agent SDK, 不修改 NanoClaw 源码。

**推理**:
- V6 的核心洞察是正确的: "整个代码库放进 context window" 是天才设计, 但 "让 Claude 改源码" 不可平台化
- 注入式: CLAUDE.md + skill.md → system prompt, 代码不变
- 这在阶段 1-3 都通用, 不需要改变
- **Von Neumann: 分离机制 (NanoClaw 运行时) 和内容 (Skill 定义)**

### D6: 通信总线统一性

**决策**: Redis 是唯一的服务间通信粘合剂 (NanoClaw 不直连 LiveKit)。

**推理**:
- NanoClaw 直连 LiveKit = 每个容器都要管理 WebRTC 连接
- 通过 Redis 中继: NanoClaw 只需要知道 Redis, 完全解耦
- 多 5-10ms 延迟对非实时任务无影响
- V4 和 V6 在这个决策上一致, V7 保留

---

## 11. V4/V6 精华取舍清单

### 来自 V4 — 保留

| 精华 | 保留理由 |
|------|---------|
| 主脑-代言人哲学 | 系统灵魂, 不可替代 |
| Redis 事件总线 | 简单正确, 规模够用 |
| Context Compiler + 意图预测 | 产品核心差异化 |
| 1:1 用户绑定 | 阶段 1-2 正确选择 |
| Skill .md + manifest.json | 实用, 与 Claude SDK 兼容 |
| 用户文件系统 (/workspace/) | NanoClaw 运行基础 |
| SSE 结果推送 | 简单可靠 |
| S3 URL 引用 (不传二进制) | 正确模式 |
| 多模态管道 (photo/video/keyframe) | 设计完整 |
| OAuth Token Center | 真实产品需要 |
| 三层记忆金字塔 | 记忆质量的保障 |

### 来自 V4 — 修正

| 项目 | V4 | V7 修正 | 理由 |
|------|-----|---------|------|
| Event Aggregator | API Server 内部模块 | 去掉, Context Compiler 直接读 Stream | 减少一层抽象 |
| 代言人推送意图卡 | Realtime Agent → DataChannel | 保留 SSE 通道统一推送 | 不需要两条推送通道 |

### 来自 V6 — 采纳 (未来阶段)

| 精华 | 引入阶段 | 触发条件 |
|------|---------|---------|
| 分层执行 (轻量/标准/重量) | 阶段 3 | 用户 > 5000, 1:1 闲置率 > 80% |
| Skill Registry + 版本管理 | 阶段 3 | Skill 数量 > 20 |
| pgvector 记忆搜索 | 阶段 2-3 | 单用户记忆 > 1000 条 |
| Cloud SQL HA | 阶段 3 | 可用性 SLA 要求 |
| Prometheus 监控 | 阶段 2 | 需要容器级别指标 |

### 来自 V6 — 拒绝

| 概念 | 拒绝理由 |
|------|---------|
| **Agent Router (新服务)** | vi-gateway 演进即可, 新服务 = 重写 + 多维护 |
| **gRPC 双向流** | Redis 够用, 不引入第二种 RPC |
| **VI-Brain 完全重写** | 3900 行代码 fork + extend 更务实 |
| **OverlayFS + GCS 快照** | 本地 FS + S3 同步更简单, 同样效果 |
| **Container Pool Manager** | NanoClaw Orchestrator 扩展即可 |
| **百万用户终态设计** | 过早, 保质期有限, 到时再设计 |
| **Push Gateway (独立服务)** | API Server 内 Firebase FCM 调用即可 |
| **Firecracker / gVisor** | 当前 Docker 隔离够用, 安全审计要求时再升级 |
| **金丝雀发布 / Rolling Update 细节** | GKE 内置, 不需要在架构文档中详细设计 |
| **Canary 路由策略** | 运维层面, 非架构层面 |

---

## 12. 风险登记

| # | 风险 | 可能性 | 影响 | 缓解措施 | 相关阶段 |
|---|------|--------|------|---------|---------|
| R1 | 产品验证失败 (无人用) | 高 | 致命 | 快速发布 V0.1, 收集反馈, 不做过度架构 | 0-1 |
| R2 | NanoClaw 容器化引入复杂度 | 中 | 中 | 先做最小可用容器, 逐步完善 | 1 |
| R3 | Claude API 成本超预期 | 高 | 高 | 模型分级 (Haiku/Sonnet), 缓存, 用户限额 | 1+ |
| R4 | Redis 单点故障 | 中 | 高 | 阶段 1: Sentinel; 阶段 2: Memorystore | 1-2 |
| R5 | 1:1 模型在 1000+ 用户时资源浪费 | 中 | 中 | 阶段 3 引入池化; 但先验证是否真的浪费 | 3 |
| R6 | 容器逃逸安全风险 | 低 | 极高 | Docker 资源限制 + 网络隔离; 需要时升级 gVisor | 1+ |
| R7 | NanoClaw 上游变更 | 中 | 低 | Fork 后独立维护; 代码量小 (3900行) 可审计 | 1+ |
| R8 | Skill 提示词注入 | 中 | 高 | Skill 审核 + 输出过滤 + 沙箱执行 | 1+ |

---

## 13. 总结 — V7 架构灵魂

```
V7 = V4 的实践智慧 + V5 的渐进纪律 + V6 的最佳概念 (按需引入)
     - V6 的过早优化 - V6 的不必要复杂度
```

**五个核心信念:**

1. **主脑-代言人是正确的分离** — NanoClaw (Claude) 创造价值, Gemini 传递价值
2. **Redis 是够用的粘合剂** — 不引入 gRPC, 不引入新协议, 一种通信方式走到底
3. **演进优于替换** — vi-gateway 加路由逻辑, 不新建 Agent Router
4. **1:1 绑定是阶段 1-2 的正确选择** — 池化是阶段 3 的事, 不提前付税
5. **百万用户不是现在的问题** — 先服务好 50 个用户, 再谈百万

> *"老子: 道法自然。顺着产品发展的自然节奏演进架构, 不对抗, 不超前。"*
>
> *"Simon 的钟表匠: 每次 merge 到 main 都是一个稳定的中间形态。架构也一样 — 每个阶段都是一个完整可用的系统, 不是通往终态的半成品。"*

---

## 附录 A: 文档关系

```
architecture-v5.md   → 部署阶段 (Phase 0/1/2), 运维视角
system_v4.md         → NanoClaw 详细实施设计 (V7 阶段 1 的参考)
arch-v6-brainstorm   → 规模化畅想 (V7 阶段 3+ 的灵感来源)
architecture-v7.md   → 统一架构文档 (本文档, 替代 V4 和 V6)

建议: 保留 V5 (部署阶段) + V7 (架构设计) 作为活跃文档
      V4 和 V6 降级为历史参考
```

## 附录 B: V4 → V7 实施优先级

阶段 1 实施时, 以下是按优先级排序的工作项:

```
P0 (必须, 阶段 1 前置):
  1. NanoClaw Fork + Redis Channel 适配
  2. NanoClaw 容器化 (Docker, 1 个用户先跑通)
  3. Redis Channel Schema 实施

P1 (核心, 阶段 1 主体):
  4. Context Compiler (每 30 秒编译 + publish)
  5. Skill Loader (skill.md + manifest.json)
  6. Realtime Agent 改造 (订阅 vi:ctx, 发布 vi:actions)
  7. SSE Relay 扩展 (vi:stream → Frontend)
  8. 用户 FS 设计 + S3 同步

P2 (增强, 阶段 1 完善):
  9. 意图预测 (Claude Haiku)
  10. 多模态输入管道 (photo/video/keyframe)
  11. OAuth Token Center
  12. NanoClaw Orchestrator (管理 N 个容器)

P3 (延后, 阶段 2 才做):
  13. Cloud SQL 迁移
  14. vi-gateway 路由逻辑
  15. 多 Node 用户路由
  16. Prometheus 监控
```

---

## 14. 数据流详细设计 (阶段 1)

> *以下数据流对应阶段 1 架构, 即引入 NanoClaw 容器 + Redis 事件总线后的系统。*

### 14.1 Flow 1: 实时语音交互 (System 1, <1s)

```
用户说话
  │
  ▼
iOS App (LiveKit SDK) ── WebRTC audio+video ──► LiveKit Cloud
                                                    │
                                                    ▼
                                             Realtime Agent (代言人)
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼               ▼               ▼
                             Gemini 实时回应    发布用户事件      (如需深度处理)
                             (语音+字幕)      vi:actions:{uid}   vi:exec:{uid}
                                    │               │               │
                                    ▼               ▼               ▼
                             DataChannel       Redis Stream     NanoClaw 异步处理
                             → iOS App         (持久化)          → 结果通过 vi:stream
```

**延迟**: Gemini 回应 < 500ms | 事件发布 < 5ms | 深度任务派发 < 10ms

### 14.2 Flow 2: 深度 Skill 执行 (System 2, seconds~minutes)

```
触发: 意图卡片点击 / Realtime Agent 判断需要深度处理 / 用户语音指令
  │
  ▼
Redis vi:exec:{uid}
  │  {taskId, skillSlug, mediaUrls, prompt, params}
  │
  ▼
NanoClaw Agent 收到任务
  │
  ├── 1. Skill Loader
  │   ├── 解析路径: /workspace/skills/ (优先) → /skills/ (fallback)
  │   ├── 读取 skill.md + manifest.json
  │   ├── 验证依赖 (OAuth tokens, tools)
  │   └── 组装 system prompt: CLAUDE.md (用户人格) + skill.md
  │
  ├── 2. Claude Agent SDK Session
  │   ├── system: assembled_prompt
  │   ├── tools: manifest.requirements.tools
  │   ├── model: manifest.model || "claude-sonnet-4-6"
  │   ├── images: mediaUrls → Claude Vision
  │   └── 流式执行 (工具调用、文件操作、搜索等)
  │
  ├── 3. 流式推送 → Redis vi:stream:{uid}
  │   ├── {type: "exec_progress", step: 1, total: 3, message: "Analyzing..."}
  │   ├── {type: "exec_intermediate", label: "OCR Result", data: {...}}
  │   ├── {type: "exec_module", moduleType: "nutrition_card", data: {...}}
  │   └── {type: "exec_result", summary: "..."}
  │
  └── 4. 持久化
      ├── /workspace/sessions/{sessionId}.json
      ├── /workspace/memory/ (如有新偏好)
      └── 触发 S3 同步

Redis vi:stream:{uid}
  │
  ├── → API Server SSE relay → Frontend (渲染结果)
  └── → Realtime Agent (可选订阅, 用于语音确认)
```

### 14.3 Flow 3: Context Refresh + 意图预测 (每 30 秒)

```
NanoClaw Context Compiler (every 30s)
  │
  ├── 采集信号:
  │   ├── /workspace/memory/ (三层记忆)
  │   ├── /workspace/sessions/active/ (当前会话)
  │   ├── Redis vi:actions:{uid} Stream (最近 30s 事件, 直接读取)
  │   └── Redis vi:frames:{uid} (最新关键帧 URL)
  │
  ├── 编译 context snapshot (≤ 2000 chars):
  │   ├── [User Identity] 用户核心信息
  │   ├── [Memory] 关键偏好和知识
  │   ├── [Visual Context] 最新关键帧描述
  │   ├── [Recent Activity] 最近在做什么
  │   ├── [Active Task] 正在执行的任务
  │   └── [Conversation Hints] 对话建议
  │
  ├── 意图预测 (Claude Haiku, ~$0.002/次):
  │   ├── Input: context + 关键帧 + 可用 skill 列表
  │   ├── Output: 3-5 个 predicted_intentions
  │   └── 优化: 场景不变跳过, 空闲降频, 缓存稳定预测
  │
  ├── Publish → vi:ctx:{uid}
  │   │         ┌──────────────────────────┐
  │   └────────►│ Realtime Agent:          │
  │             │ 更新 Gemini instructions │
  │             │ (含意图提示)              │
  │             └──────────────────────────┘
  │
  └── Publish → vi:intent:{uid}
                │
                ▼
          API Server SSE → Frontend: 渲染 Intention Cards
```

### 14.4 Flow 4: 多模态输入

```
═══ Channel 1: Photo/Video Capture (用户主动) ═══

Frontend 拍照/录视频
  │
  ├── 1. 请求 presigned URL: POST /api/upload/presign
  ├── 2. S3 上传: PUT s3://bucket/users/{uid}/media/{ts}.{jpg|mp4}
  ├── 3. Redis vi:actions:{uid} ← {type: "media_captured", mediaUrl, mediaType}
  │
  └── NanoClaw 收到事件:
      ├── 图片: Claude Vision API 处理
      └── 视频: ffmpeg 关键帧 + Whisper 转录 → Claude 多帧推理

═══ Channel 2: LiveKit Keyframe Sampling (系统自动, 每 5s) ═══

Realtime Agent
  │
  ├── 1. 从 LiveKit 视频 track 抓帧
  ├── 2. 质量门控: 场景 hash 不变 → 跳过 | 模糊 → 跳过
  ├── 3. S3 上传 (720p JPEG, ~50KB)
  └── 4. Redis vi:frames:{uid} ← {ts, frameUrl, sceneHash}
      │
      └── NanoClaw Context Compiler 消费:
          └── 最新帧 URL → 纳入 context → 意图预测信号

核心原则: 二进制数据永不经过 Redis, 只走 S3 URL 引用
```

### 14.5 Flow 5: 主脑指导代言人 (控制流核心)

```
NanoClaw (主脑)                              Realtime Agent (代言人)
     │                                              │
     │  每 30 秒 publish                             │
     │  vi:ctx:{uid}                                 │
     │  ┌──────────────────────────┐                 │
     │  │ {                        │                 │
     │  │   "snapshot": "...",     │    subscribe    │
     │  │   "predicted_intentions":│ ───────────────►│
     │  │   [{skill_slug, title,   │                 │
     │  │     confidence, icon}]   │                 │
     │  │ }                        │                 │
     │  └──────────────────────────┘                 │
     │                                               │
     │                               代言人接收后:     │
     │                               ┌───────────────┤
     │                               │ 1. 更新 Gemini │
     │                               │    system     │
     │                               │    instructions│
     │                               │ 2. 推送意图卡片│
     │                               │    → DataCh   │
     │                               │ 3. 语音建议   │
     │                               │    (conf>0.8) │
     │                               └───────────────┤
     │                                               │
     │  代言人感知回传:                                │
     │  ◄──── vi:actions:{uid} ──────────────────────│
     │  ◄──── vi:frames:{uid} ──────────────────────│
     │                                               │
     │  Context Compiler 消费                        │
     │  → 更新 context → 更新意图预测                 │
     │  → 下一个 30s 循环                            │
```

**控制流方向**: 主脑 → 代言人 (单向战略指导)
**感知流方向**: 代言人 → 主脑 (单向感官数据)
**代言人不知道指令来自 NanoClaw — 它只按 system instructions 行事**

---

## 15. 协议与消息格式 (阶段 1)

### 15.1 Context Snapshot 格式

```json
{
  "version": 7,
  "ts": 1709420400,
  "uid": "vi-dev-abc123",
  "snapshot": "[User Identity]\n张三, 30岁, 上海...\n\n[Memory]\n偏好: 意大利菜...\n\n[Visual Context]\n当前画面: 一盘意大利面...\n\n[Recent Activity]\n拍了 3 张照片...\n\n[Active Task]\n无\n\n[Hints]\n用户可能需要营养分析",
  "char_count": 1850,
  "memory_version": 42,
  "session_active": true,
  "latest_frame_url": "s3://bucket/users/uid/frames/1709420400.jpg",
  "predicted_intentions": [
    {
      "skill_slug": "recipe-analyzer",
      "title": "分析营养成分",
      "description": "检测到食物图片",
      "confidence": 0.85,
      "icon": "📊",
      "params": {"media_urls": ["s3://..."]}
    }
  ]
}
```

### 15.2 任务派发格式 (vi:exec)

```json
{
  "taskId": "uuid-v4",
  "sessionId": "session-uuid",
  "skillSlug": "recipe-analyzer",
  "prompt": "分析这张照片里的食物营养成分",
  "mediaUrls": ["s3://bucket/users/uid/media/photo1.jpg"],
  "context": {
    "visualObservation": "用户正在看一盘意大利面",
    "userMemory": "用户偏好健康饮食",
    "viUserId": "vi-dev-abc123"
  },
  "priority": "fast",
  "ts": 1709420400.123
}
```

### 15.3 流式结果格式 (vi:stream)

```json
// 进度
{"type": "exec_progress", "taskId": "...", "step": 1, "total": 3, "message": "Analyzing image..."}

// 中间结果
{"type": "exec_intermediate", "taskId": "...", "label": "OCR Result", "data": {"text": "Spaghetti Carbonara"}}

// 结构化模块
{"type": "exec_module", "taskId": "...", "moduleType": "nutrition_card", "data": {"calories": 650, "protein": "25g"}}

// HTML 流式片段
{"type": "exec_html_stream", "taskId": "...", "chunk": "<div class=\"p-4\">..."}

// 最终结果
{"type": "exec_result", "taskId": "...", "summary": "营养分析完成: 650 kcal"}

// 错误
{"type": "exec_error", "taskId": "...", "error": "Skill not found", "recoverable": true}
```

### 15.4 用户事件格式 (vi:actions)

```json
// 事件类型枚举
voice_transcript    // 语音转录
text_message        // 文本消息
media_captured      // 照片/视频 (含 S3 URL, mediaType)
page_navigate       // 页面切换
module_interact     // 模块交互 (卡片点击等)
intent_card_tap     // 意图卡片点击 (含 skill_slug)
task_dispatched     // 任务派发
task_completed      // 任务完成
task_failed         // 任务失败
session_started     // 会话开始
session_ended       // 会话结束

// 示例
{
  "type": "media_captured",
  "ts": 1709420400.123,
  "user_id": "vi-dev-abc123",
  "data": {
    "mediaType": "image",
    "mediaUrl": "s3://bucket/users/uid/media/photo1.jpg",
    "thumbnail": "base64_128px",
    "dimensions": {"w": 1920, "h": 1080}
  }
}
```

### 15.5 意图卡片格式 (vi:intent)

```json
{
  "type": "intention_update",
  "ts": 1709420400,
  "intentions": [
    {
      "id": "int_001",
      "skill_slug": "recipe-analyzer",
      "title": "分析营养成分",
      "description": "检测到食物图片, 分析卡路里和营养素",
      "confidence": 0.85,
      "icon": "📊",
      "card_color": "#22c55e",
      "params": {"media_urls": ["s3://..."], "context": "italian pasta"},
      "estimated_time": "~10s",
      "estimated_cost": "$0.03"
    }
  ]
}
```

---

## 16. 通信矩阵 (阶段 1)

```
                Realtime    NanoClaw    API Server   Frontend    Redis
Realtime        ---         Redis       HTTP         DC+RPC      Pub/Sub+Stream
NanoClaw        Redis       ---         HTTP         ---         Pub/Sub+Stream
API Server      ---         ---         ---          REST+SSE    Pub/Sub
Frontend        DC+RPC      ---         REST+SSE     ---         ---
Redis           ---         ---         ---          ---         ---
```

**关键特性:**
- NanoClaw ↔ Frontend: **零直接通信**, 全部通过 Redis → API Server SSE 中继
- NanoClaw ↔ Realtime: **零直接通信**, 全部通过 Redis channels
- NanoClaw 不知道 LiveKit 的存在, Realtime 不知道 NanoClaw 的存在
- **Redis 是唯一粘合剂 — 所有服务间解耦的实现**

---

## 17. 部署拓扑详细设计

### 17.1 阶段 1 部署 (单 VPS)

```yaml
# docker-compose.v7-stage1.yml (概念)

services:
  # === 基础设施 ===
  postgres:
    image: postgres:16-alpine
    volumes: [pg_data:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready"], interval: 10s }

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb
    volumes: [redis_data:/data]
    healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: 10s }

  # === 应用服务 ===
  api-server:
    build: ./api-server
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_healthy } }
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - DATABASE_URL=postgresql://...

  frontend:
    build: ./frontend
    ports: ["80:80", "443:443"]

  # === 代言人 (Realtime Agent) ===
  realtime-worker:
    build: ./realtime
    deploy: { replicas: 2 }  # 2 worker, 每个 ~5 并发 room
    depends_on: { redis: { condition: service_healthy }, api-server: { condition: service_started } }
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - API_BASE_URL=http://api-server:8000

  # === 主脑 (NanoClaw Orchestrator) ===
  nanoclaw-orchestrator:
    build: ./nanoclaw-orchestrator
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /data/users:/data/users
      - /data/shared/skills:/data/shared/skills
    depends_on: { redis: { condition: service_healthy }, api-server: { condition: service_started } }
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - MAX_CONTAINERS=10

  # === vi-gateway (过渡期保留) ===
  vi-gateway:
    build: ./gateway
    depends_on: { redis: { condition: service_healthy } }
    healthcheck: { test: ["CMD", "curl", "-f", "http://localhost:18789/health"], interval: 30s }

volumes:
  pg_data:
  redis_data:
```

### 17.2 NanoClaw Orchestrator 职责

```
Orchestrator 核心循环:
  │
  ├── 用户注册/绑定:
  │   ├── 创建 /data/users/{uid}/ 目录结构
  │   ├── 初始化 CLAUDE.md (默认人格模板)
  │   ├── docker run vi-nanoclaw --name nanoclaw-{uid}
  │   │   volumes: /data/users/{uid}:/workspace, /data/shared/skills:/skills:ro
  │   └── 注册到 Redis: HSET vi:containers {uid} {container_id}
  │
  ├── 健康检查 (每 30s):
  │   ├── docker inspect 每个容器
  │   ├── 检查 Redis 心跳 (容器应每 30s 写心跳)
  │   └── 不健康 → docker restart
  │
  ├── 资源监控:
  │   ├── docker stats 每个容器
  │   └── 超限 → 日志告警 (不自动杀, 避免丢任务)
  │
  ├── 用户离线 → 容器降低 CPU 优先级 (但不销毁)
  │   └── 因为 scheduled tasks / Context Compiler 仍需运行
  │
  └── 用户删除 → docker stop + rm + 清理 /data/users/{uid}/
```

### 17.3 阶段 1 资源预算

| 服务 | RAM | CPU | 说明 |
|------|-----|-----|------|
| PostgreSQL | 512MB | 0.5 | 数据量小 |
| Redis | 512MB | 0.25 | 事件 + 缓存 |
| API Server | 256MB | 0.5 | FastAPI, 轻量 |
| Frontend (nginx) | 64MB | 0.1 | 静态文件 |
| Realtime Workers ×2 | 1GB | 1.0 | LiveKit Agent |
| NanoClaw ×10 | 5GB | 5.0 | IO-bound, 可超卖 |
| Orchestrator | 128MB | 0.25 | Docker 管理 |
| **合计** | **~7.5GB** | **~7.5** | **8-16GB VPS 可运行** |

### 17.4 阶段 2 部署 (多 Node)

```
                    ┌────────────────────────────────────┐
                    │        Global Load Balancer         │
                    │     (GKE Ingress / Cloud LB)       │
                    └──────┬────────────┬────────────────┘
                           │            │
              ┌────────────▼──┐   ┌─────▼─────────────┐
              │ API Server    │   │ Frontend (CDN)     │
              │ Pod ×2-3      │   │ GCS + Cloud CDN    │
              └──────┬────────┘   └───────────────────┘
                     │
              ┌──────▼────────┐
              │ Redis Cluster  │ ← Memorystore
              │ (or Sentinel) │
              └──┬──────┬─────┘
                 │      │
    ┌────────────▼──┐ ┌─▼────────────────────────┐
    │ Realtime     │ │ NanoClaw Nodes            │
    │ Worker Pods  │ │                            │
    │ (GKE)       │ │ Node-1 (VPS): Agent ×10   │
    │             │ │ Node-2 (VPS): Agent ×10   │
    │             │ │ Node-3 (VPS): Agent ×10   │
    └─────────────┘ └────────────────────────────┘
                           │
                    ┌──────▼───────┐
                    │ Cloud SQL    │ ← PostgreSQL
                    │ (Private IP) │
                    └──────────────┘

用户路由: hash(uid) % N → Node-K
```

---

## 18. 阶段 1 迁移路径 (vi-gateway → NanoClaw)

### 18.1 并行运行期

阶段 1 初期, vi-gateway 和 NanoClaw 并行运行:

```
Realtime Agent 判断:
  │
  ├── 简单任务 (问答, 信息查询):
  │   └── LiveKit RPC → vi-gateway → Claude API 直调 (现有路径)
  │
  └── 深度任务 (需要 Skill, 需要文件系统):
      └── Redis vi:exec → NanoClaw Agent (新路径)

切换策略:
  Phase A: 10% 任务走 NanoClaw (验证)
  Phase B: 50% (稳定后)
  Phase C: 100% NanoClaw, vi-gateway 降级为轻量直调
  Phase D: vi-gateway 合并路由逻辑, 成为统一入口
```

### 18.2 具体迁移步骤

```
Step 1: NanoClaw 基础 (不影响现有系统)
  ├── Fork NanoClaw, 添加 Redis channel adapter
  ├── 实现最小可用容器 (Claude SDK + Redis + /workspace/)
  ├── 单用户手动测试
  └── 验证: NanoClaw 容器能接收 vi:exec, 执行 Claude SDK, 推送 vi:stream

Step 2: SSE Relay 扩展 (API Server 改动)
  ├── 订阅 vi:stream:{uid} → SSE 推送
  ├── 订阅 vi:intent:{uid} → SSE 推送
  └── 验证: Frontend 能通过 SSE 收到 NanoClaw 结果

Step 3: Realtime Agent 双路派发
  ├── 保留现有 LiveKit RPC → gateway 路径
  ├── 新增 Redis vi:exec 路径
  ├── 通过配置切换 (executorHint)
  └── 验证: 两条路径都能完成任务

Step 4: Context Compiler 上线
  ├── NanoClaw 内部实现 30s 循环
  ├── Realtime Agent 订阅 vi:ctx
  ├── 更新 Gemini system instructions
  └── 验证: 代言人行为受主脑 context 影响

Step 5: Skill System 上线
  ├── 预装 Skill 定义 (/data/shared/skills/)
  ├── Skill Loader 实现
  └── 验证: 意图卡片 → 点击 → Skill 执行 → 结果返回

Step 6: 全量切换 + vi-gateway 清理
  ├── 100% 流量走 NanoClaw
  ├── vi-gateway 保留为轻量直调 (不需要容器的简单任务)
  └── 最终: vi-gateway 演进为路由器 (阶段 2)
```

---

## 19. 前端变更清单 (阶段 1)

### 19.1 新增 SSE 事件类型

| 事件类型 | 数据 | 来源 |
|----------|------|------|
| `exec_start` | `{taskId, executor}` | NanoClaw 开始执行 |
| `exec_progress` | `{taskId, step, total, message}` | 任务进度 |
| `exec_html_stream` | `{taskId, chunk}` | HTML 流式片段 |
| `exec_module` | `{taskId, moduleType, data}` | 结构化模块 |
| `exec_intermediate` | `{taskId, step, label, data}` | 中间结果 |
| `exec_result` | `{taskId, summary}` | 任务完成 |
| `exec_error` | `{taskId, error, recoverable}` | 任务错误 |
| `intention_update` | `{intentions: [...]}` | 意图预测卡片 |

### 19.2 前端架构变更

```
阶段 0 (现在):
  useAgentProtocol.js → DataChannel ("vi-gateway" topic) → 渲染 HTML/模块
  useRealtimeEvents.js → SSE (session_update, memory_update)

阶段 1 (新增):
  useAgentProtocol.js → DataChannel (保留: transcript, action 等实时数据)
  useRealtimeEvents.js → SSE (扩展: + exec_*, intention_update)
  useNanoClawResults.js → 新 Hook, 消费 exec_* 事件, 渲染 NanoClaw 结果
  useIntentionCards.js → 新 Hook, 消费 intention_update, 管理意图卡片状态

路由:
  DataChannel: 低延迟实时数据 (语音字幕, 观察卡片, 前端 RPC)
  SSE: NanoClaw 执行结果 + 意图预测 (非实时, 但需要可靠送达)
```

### 19.3 Session View 重新设计

```
┌──────────────────────────────────────────┐
│ 📋 Session Summary                       │
│ "拍摄了一盘意面, 正在分析中..."             │
│ 3 photos · 1 video · 2 min active        │
├──────────────────────────────────────────┤
│                                          │
│ ✨ Intention Cards (horizontal scroll)   │
│ ┌────────┐ ┌────────┐ ┌────────┐        │
│ │ 📊     │ │ 📕     │ │ 🎬     │        │
│ │Nutrition│ │XiaoHong│ │ Video  │        │
│ │Analysis │ │  Shu   │ │ Create │        │
│ │ 85%    │ │ 60%    │ │ 40%    │        │
│ │ ~10s   │ │ ~30s   │ │ ~60s   │        │
│ └────────┘ └────────┘ └────────┘        │
│  tap = dispatch skill execution          │
│                                          │
├──────────────────────────────────────────┤
│ 📦 Output + Results (scrollable)         │
│ ┌──────────────────────────────────────┐ │
│ │ [Progress: Step 2/3 ⏳]             │ │
│ │ ████████████░░░░░░░ 65%             │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ [Final: Nutrition Card]             │ │
│ │ Calories: 650 kcal | Protein: 25g  │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ 💬 Voice + Chat Input                    │
└──────────────────────────────────────────┘
```

---

## 20. OAuth Token Center (阶段 1)

### 20.1 架构位置

```
API Server 内部模块 (不是独立服务):

  /api/tokens/connect/{provider}    ← 发起 OAuth 流
  /api/tokens/callback/{provider}   ← OAuth 回调
  /api/tokens/{provider}/status     ← 检查有效性
  /api/tokens/{provider}/refresh    ← 刷新 token
  DELETE /api/tokens/{provider}     ← 撤销授权
```

### 20.2 Token 安全模型

```
1. 用户在前端发起 OAuth → API Server 生成 authorization URL
2. 用户在浏览器完成授权 → OAuth callback → API Server
3. API Server:
   a. 加密 token (AES-256-GCM, key 从环境变量派生)
   b. 写入 S3: users/{uid}/tokens/oauth.enc.json
   c. 同步到 NanoClaw 容器 /workspace/tokens/
4. NanoClaw Agent:
   a. 读取 /workspace/tokens/oauth.enc.json (只读)
   b. 解密 → 使用 token 调用第三方 API
   c. Token 过期 → 通过 API Server 刷新

安全约束:
  - Token 文件加密, 非明文
  - NanoClaw 容器 /workspace/tokens/ 只读挂载
  - 刷新只能通过 API Server (有 rate limit)
```

### 20.3 Phase 1 支持的 Provider

| Provider | 权限 | Agent 操作 |
|----------|------|-----------|
| Google | Calendar (r/w), Drive (r) | 查日程, 读文件 |
| Notion | Pages (r/w) | 读写页面 |
| 小红书 | Content (w) | 发布帖子 |

---

## 21. 设计权衡记录 (补充)

### 21.1 SSE vs WebSocket (前端结果通道)

**选择: SSE**

| 维度 | SSE | WebSocket |
|------|-----|-----------|
| 方向 | 单向 (server→client) | 双向 |
| 基础设施 | 已有 (events.py) | 需要新建 |
| 重连 | 浏览器自动 | 需要自己实现 |
| 二进制 | 不支持 | 支持 |
| 决策理由 | NanoClaw 结果是单向推送, SSE 够用 | — |

### 21.2 NanoClaw 不直连 LiveKit

**选择: 通过 Redis 中继**

| 维度 | 直连 LiveKit | Redis 中继 |
|------|-------------|-----------|
| 延迟 | 最低 | +5-10ms |
| 架构 | 每容器管理 WebRTC 连接 | NanoClaw 只知道 Redis |
| 容器调度 | 受限 (需维护连接) | 自由 (无连接状态) |
| 决策理由 | 5-10ms 对非实时任务无影响, 架构简洁 | ✅ |

### 21.3 保留 API Server vs 合并到 NanoClaw

**选择: 保留 API Server**

- API Server (Python/FastAPI) 已有完整的 auth/memory/session
- 合并到 NanoClaw (Node.js) = 重写, 不值得
- 自然扩展: +Token Center, +FS Proxy, +SSE Relay

---

## 22. 架构审查记录 (2026-03-04)

> *审查方法: 辩证对照 V7 + V4 两份文档, 结合实际代码库验证, 站在架构师角度但约束于产品现实。*

### 22.1 审查结论

**方向正确, 可以推进。** 总体评分:

| 维度 | 评分 | 说明 |
|------|------|------|
| 方向正确性 | 9/10 | 主脑-代言人 + 渐进演进 + Redis 粘合剂 = 正确 |
| 务实程度 | 8/10 | A6 元公理很好, NanoClaw 容器化复杂度略低估 |
| 可实施性 | 7/10 | V7 缺实施细节需依赖 V4, 资源预算偏紧 |
| 风险意识 | 8/10 | 风险登记表覆盖主要风险, 缺运维层面风险 |
| 文档质量 | 9/10 | 结构清晰、引用得当、决策有理有据 |

### 22.2 确认正确的决策

| # | 决策 | 验证理由 |
|---|------|---------|
| ✅ | 主脑-代言人分离 | Gemini 无工具层/持久记忆/Skill, Claude 有完整 Agent SDK — 边界天然 |
| ✅ | Redis 唯一粘合剂, 拒绝 gRPC | 50-500 用户 Redis Pub/Sub 绰绰有余, 一种协议 > 两种 |
| ✅ | vi-gateway 演进, 不新建 Agent Router | 代码验证: gateway 已有 LiveKit 房间管理/RPC/ExecutorSelector/DataChannel, 重写不值得 |
| ✅ | 1:1 绑定 (阶段 1-2) | 零冷启动、直接挂载、支持后台任务, 池化是阶段 3 的事 |
| ✅ | 去掉 Event Aggregator | Context Compiler 直读 Stream, 减少一层抽象, 总 Redis 查询量差距不大 |
| ✅ | 百万用户不做详细设计 | 当前 0 用户, 12 个月后 LLM 生态可能根本不同 |

### 22.3 风险登记补充

| # | 风险 | 严重度 | 详情 | 缓解建议 |
|---|------|--------|------|---------|
| R9 | NanoClaw 容器化复杂度被低估 | 高 | Fork + Redis 适配 + Docker Orchestrator + S3 同步 + Context Compiler, 实际工作量 **4-6 周** | 先做最小 PoC (单用户单容器), 验证后再铺开 |
| R10 | 8GB VPS 内存不够 | 高 | 10×512MB NanoClaw + 基础设施 = 7.5GB, Agent SDK session 可能超 512MB, OOM 风险高 | 阶段 1 资源预算改为 **16GB VPS** ($80-120/月) |
| R11 | 意图预测成本偏乐观 | 中 | 每次 Claude Haiku 含 context+keyframe+skill 列表, input tokens 不少; 10 用户全活跃 = ~$57/天仅意图预测 | 初期频率从 30s **降到 60-90s**, 场景不变跳过从 Day 1 实现 |
| R12 | Context Compiler 与 Agent SDK 互阻塞 | 中 | 两者同在 NanoClaw 容器内, 长任务或 OOM 会导致 Context 停更, 代言人失去方向 | 确保 Context Compiler 在独立线程/进程运行, 与 Agent SDK session 互不阻塞 |
| R13 | 双文档维护负担 | 低 | V7 说"替代 V4", 但 V4 有大量实施细节 (接口定义/代码示例) V7 未复制 | 不降级 V4, 明确定位: V7=架构指南(WHY+WHAT), V4=实施手册(HOW) |

### 22.4 修正决策

#### C1: 意图卡片推送路径统一

**问题**: V4/V7 设计了两条推送意图卡片到前端的路径:
1. `vi:ctx → Realtime Agent → DataChannel → Frontend`
2. `vi:intent → API Server → SSE → Frontend`

同一份数据走两条路 = 状态同步问题。

**修正**: 意图卡片只走 SSE (`vi:intent → API Server → SSE → Frontend`)。`vi:ctx` 只给 Realtime Agent 更新 Gemini instructions 用, **不推卡片到 DataChannel**。

#### C2: 阶段 1 资源预算修正

```
修正前:                               修正后:
VPS (8GB/4core)   $50-80              VPS (16GB/8core)   $80-120
NanoClaw ×10      512MB/each          NanoClaw ×10       512MB-768MB/each
合计 RAM          ~7.5GB (无余量)      合计 RAM           ~9GB (7GB 余量)
```

#### C3: vi-gateway 过渡策略细化

```
迁移顺序 (按风险递增):
  Phase A: 有文件系统需求的深度任务 → NanoClaw (验证核心价值)
  Phase B: 多模态分析任务 → NanoClaw (验证媒体管道)
  Phase C: 简单问答任务 → 最后迁移 (gateway 已经做得很好)

切换判断标准:
  - 成功率 > 95% 且连续 3 天
  - P99 延迟 < 现有 gateway 的 1.5x
  - 无 OOM 或容器崩溃

回滚:
  - NanoClaw 不稳定 → 立即回退到 gateway (通过 executorHint 切换)
  - 回滚不需要重启任何服务
```

### 22.5 文档关系定义

```
实施时的文档使用方式:

architecture-v7.md     → 架构决策 + 阶段规划 + 取舍理由 (WHY + WHAT)
system_v4.md           → 实施细节 + 接口定义 + 代码示例 (HOW)
                         ⚠️ 不降级, 这是实施手册

建议新增:
implementation-tracker.md → 实施进度跟踪 (阶段 1 每个 Step 的状态)
```

### 22.6 推荐行动顺序

```
立即 (阶段 0, 本周):
  1. 修复 P2 (去掉 api-server 代理 gateway 的多余一跳)
  2. 修复 P5 (图片改 URL 引用, 消除 OOM)
  3. 修复 P6 (前端协议层 TypeScript 迁移, 可并行)

并行启动 (阶段 1 预研, 1-2 周):
  4. NanoClaw Fork + Redis channel 适配 PoC (单用户)
  5. 验证 512MB 容器 + Agent SDK session 的内存表现
  6. Context Compiler 30s 循环 PoC (纯 Redis, 不含意图预测)

PoC 通过后 (阶段 1 主体, 4-6 周):
  7. 按 V7 §18.2 的 Step 1-6 实施
  8. 意图预测初期频率 60-90s, 数据驱动降频
```

---

*VI Agent Architecture V7 | 2026-03-04*
*渐进式演进 — 每个阶段是完整的系统, 不是通往终态的半成品*
