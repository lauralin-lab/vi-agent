# V4 / V6 / V7 三文档全面对比分析

> **日期**: 2026-03-04
>
> **目的**: 对 system_v4.md、architecture-v6-brainstorm.md、architecture-v7.md 进行全面对比, 理解继承/冲突/融合关系
>
> **阅读顺序建议**: V7 (理解决策) → V4 (实施参考) → V6 (远景储备)

---

## 1. 文档定位与谱系

```
                        时间线
    ─────────────────────────────────────────►

    V4 (2026-03-03)          V6 (2026-03-03)          V7 (2026-03-04)
    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
    │ 实施级设计规格 │         │ 头脑风暴草案  │         │ 正式架构文档  │
    │ <50 用户/VPS  │         │ 百万用户畅想  │         │ 统一替代 V4+V6│
    │ 2026 行       │         │ 1020 行       │         │ 1482 行       │
    │ Design Comp.  │         │ Draft         │         │ Formal        │
    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
           │                        │                        │
           │ 实践智慧                │ 规模概念                │
           └────────────────┬───────┘                        │
                            │                                │
                            └── V7 = 融合 + 批判性取舍 ───────┘
```

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **定位** | 实施级设计 (Implementation Spec) | 头脑风暴 (Brainstorm) | 统一架构文档 (Formal Architecture) |
| **目标用户规模** | 10 用户/VPS (<50) | 百万用户 (DAU 10万) | 0→50→500→5000→50000 (渐进) |
| **哲学倾向** | 深度优先 — 每个模块写到代码级 | 广度优先 — 覆盖终态全貌 | 判断优先 — 什么阶段做什么 |
| **决策风格** | 确定性 (一种方案, 写死) | 对比性 (多方案比较, 推荐) | 判决性 (接受/拒绝, 给理由) |
| **代码示例** | 大量 TypeScript/Python 代码 | 伪代码 + gRPC 定义 | 无代码, 纯架构描述 |
| **前置文档** | V3 | V5 (渐进架构) + mobile-app | V4 + V5 + V6 |

---

## 2. 核心哲学对比

```
V4 🧠 "Video Call with Your Claude Code"
   主脑-代言人 = CEO ↔ 新闻发言人
   价值创造 (Claude) ≠ 价值传递 (Gemini)
   ↕
V6 🏗️ "平台化支撑百万用户"
   三层分流 = 轻量/标准/重量
   Agent Router = 智能路由器
   ↕
V7 ⚖️ "渐进式演进 + 不为假想问题付税"
   V4 哲学 + V5 纪律 + V6 概念(按需)
   每阶段是完整系统, 不是半成品
```

| 哲学维度 | V4 | V6 | V7 |
|---------|----|----|-----|
| **核心隐喻** | CEO ↔ 新闻发言人 | 智能路由器 + 容器工厂 | 钟表匠 (稳定中间形态) |
| **主脑-代言人** | 首创, 完整阐述 | 未明确提及此概念 | 完整保留, 声明为 "系统灵魂" |
| **架构公理** | 无显式公理 | 无显式公理 | 6 条设计公理 (A1-A6) |
| **A6 (元公理)** | — | — | "不为假想问题付复杂度税" |
| **思想家引用** | 无 | 无 | Euclid, Simon, Dijkstra, Knuth, Von Neumann, 老子 |

### 批判性评价

**V4 的哲学贡献**: 主脑-代言人是真正的架构创新。V4 首次明确了 Claude = 价值创造、Gemini = 价值传递的分离。这不只是技术决策, 是产品灵魂。

**V6 的哲学缺陷**: V6 没有继承 V4 的主脑-代言人概念, 而是把注意力放在了路由和容器管理上。它回答了 "怎么服务百万人", 但忽略了 "服务什么"。

**V7 的哲学整合**: V7 正确地把 V4 的哲学放在核心, 然后用 V6 的技术手段按需引入。但 V7 的 A6 公理可能过于保守 — 有些 V6 的前瞻性思考 (如容器池) 不是 "假想问题", 而是可预见的工程挑战。

---

## 3. 服务拓扑对比

```
═══ V4: 4 服务 + NanoClaw 容器 (单 VPS) ═══

Frontend ──REST+SSE──► API Server ◄──HTTP──► NanoClaw ×10
    │                      │                    │
    │ LiveKit WebRTC       │                    │ Redis Pub/Sub
    ▼                      │                    ▼
Realtime Agent ×10 ◄══════╪══════ Redis ═══════╝
                           │
                    PostgreSQL + S3

═══ V6: 6 服务 + VI-Brain Cluster (GKE) ═══

Frontend ──HTTPS──► API Server ×3-10
    │                    │
    │ WebRTC             │ gRPC/HTTP
    ▼                    ▼
LiveKit Cloud       Agent Router ×3-5 ──gRPC──► VI-Brain Cluster
    │                                           ├── Standard Pool
    ▼                                           ├── Dedicated Pool
vi-realtime ×N ──LiveKit RPC──► Agent Router    └── Skill Registry
                                                     │
                                              OverlayFS Manager
                                                     │
                                    PostgreSQL + Redis Cluster + GCS

+ Push Gateway ×2-3 (新增)

═══ V7: 4+1 服务 + NanoClaw 容器 (渐进扩展) ═══

Frontend ──REST+SSE──► API Server ◄──HTTP──► NanoClaw ×N
    │                      │                    │
    │ LiveKit WebRTC       │                    │ Redis Pub/Sub
    ▼                      │                    ▼
Realtime Agent ×N ◄═══════╪══════ Redis ═══════╝
                           │
    vi-gateway (保留, 过渡/演进)
                           │
                    PostgreSQL + S3/GCS
```

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **服务数量** | 4 (api, realtime, gateway, nanoclaw) | 6+ (api, realtime, agent-router, vi-brain, push-gw, ...) | 4+1 (api, realtime, gateway保留, nanoclaw, orchestrator) |
| **新增服务** | NanoClaw Orchestrator | Agent Router, VI-Brain, Push Gateway | NanoClaw Orchestrator (V4同) |
| **vi-gateway** | 被 NanoClaw 替代 (Phase 6 移除) | 被 Agent Router 替代 | 保留并演进 (加路由逻辑) |
| **容器运行时** | Docker | gVisor (GKE Sandbox) | Docker (阶段1-2), 需要时升级 |
| **K8s** | 不需要 | GKE 必需 | 阶段2+ 可选 |

---

## 4. NanoClaw 使用策略 — 三文档核心分歧

```
V4:  NanoClaw = Fork + Extend (保留 3900 行精华, 加 Redis/S3/OAuth)
     ┌────────────────────────────────────┐
     │ NanoClaw Fork                      │
     │ + Redis Channel Adapter            │
     │ + Context Compiler                 │
     │ + S3 FS Sync                       │
     │ + OAuth Token Access               │
     │ + Streaming Results                │
     │ 保留: container-runner, ipc,       │
     │       group-queue, Agent SDK       │
     └────────────────────────────────────┘

V6:  NanoClaw = 提取精华重写 "VI-Brain" (3900行→全新服务)
     ┌────────────────────────────────────┐
     │ VI-Brain (全新)                     │
     │ + gRPC API (新增)                  │
     │ + Container Pool Manager           │
     │ + Skill Registry (独立服务)        │
     │ + OverlayFS Manager                │
     │ + PostgreSQL/Redis (替代SQLite)    │
     │ + Prometheus Metrics               │
     │ 保留概念: container-runner, ipc    │
     │ 重写: 一切                         │
     └────────────────────────────────────┘

V7:  NanoClaw = Fork + Extend (同 V4, 拒绝 V6 重写)
     (同 V4 方案, 明确拒绝 V6 的 VI-Brain 重写)
     理由: "3900 行代码 fork+extend 更务实"
```

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **方案选择** | B: Fork + 增量改造 | C: 提取精华重写 | 同 V4 (Fork + Extend) |
| **Skill 系统** | .md + manifest.json, 注入 system prompt | Skill Registry 独立服务 + 版本管理 | 同 V4, 阶段3引入 Registry |
| **Skill 安装** | 文件系统级 (/skills/) | 注入式 (CLAUDE.md 动态组装) | 同 V4 (文件+注入) |
| **V6 的 "改源码" 批判** | 未提及 | 首次提出问题+解决方案 | 采纳 V6 洞察 (注入式) |
| **容器池** | 无 (1:1固定) | Standard + Dedicated Pool | 阶段3引入 (同V6概念, 延后) |

### 批判性评价

**V6 对 NanoClaw 的分析最深入**: V6 Section 3 对 NanoClaw 做了最详细的剖析 (3.1-3.4), 明确指出了 "Skill = 改源码" 的致命问题, 并提出了 "注入式" 替代方案 — 这个洞察被 V7 完整采纳。

**V7 在 Fork vs 重写上可能过于保守**: V7 选择 Fork+Extend 而非重写, 理由是 "3900 行代码量小"。但 V6 的 VI-Brain 重写方案并非重写 3900 行, 而是用 3900 行的精华构建一个多租户可扩展服务。V7 的 Fork+Extend 在阶段 1 是对的, 但到阶段 3 可能还是需要类似 VI-Brain 的改造。

---

## 5. 通信架构对比

```
═══ V4: Redis 事件总线 (9 channels) ═══

vi:ctx      NanoClaw ──publish──► Realtime (context+意图)
vi:exec     Realtime/Frontend ──publish──► NanoClaw (任务派发)
vi:stream   NanoClaw ──publish──► API Server → SSE (结果流)
vi:events   API Server ──publish──► Frontend SSE (已有)
vi:actions  Realtime/Frontend ──xadd──► NanoClaw (全量事件, Stream)
vi:summary  API Server ──set──► NanoClaw (聚合摘要, KV)
vi:frames   Realtime ──publish──► NanoClaw (关键帧)
vi:intent   NanoClaw ──publish──► API Server → SSE (意图卡片)
vi:media    API Server ──publish──► NanoClaw (媒体上传通知)

═══ V6: LiveKit RPC + gRPC 双向流 ═══

vi-realtime ──LiveKit RPC──► Agent Router
Agent Router ──gRPC Execute()──► NanoClaw 容器 (stream 返回)
NanoClaw ──gRPC Callback()──► Agent Router ──LiveKit RPC──► vi-realtime
Redis: 仅用于缓存和 Pub/Sub (非主通信)

═══ V7: Redis 事件总线 (7 channels, 精简 V4) ═══

vi:ctx      NanoClaw → Realtime
vi:exec     Realtime/Frontend → NanoClaw
vi:stream   NanoClaw → API Server → SSE
vi:actions  Realtime/Frontend → NanoClaw (Stream)
vi:frames   Realtime → NanoClaw
vi:events   API Server → Frontend SSE (已有)
vi:intent   NanoClaw → API Server → SSE

变化: 去掉 vi:summary (Context Compiler 直接读 vi:actions Stream)
      去掉 vi:media (合并到 vi:actions)
```

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **主通信** | Redis Pub/Sub + Stream | LiveKit RPC + gRPC | Redis Pub/Sub + Stream |
| **Channel 数量** | 9 | — (RPC + gRPC) | 7 (精简V4) |
| **Agent Router ↔ NanoClaw** | — | gRPC 双向流 (新协议) | Redis (拒绝gRPC) |
| **事件聚合** | Event Aggregator (API Server 模块) | — | 去掉, Context Compiler 直接读 Stream |
| **二进制传输** | 永不过 Redis, S3 URL 引用 | gRPC 可传二进制 | 同 V4 (S3 URL) |

### 批判性评价

**V4 的 vi:summary 是过度设计**: V7 正确地去掉了 vi:summary。Event Aggregator 每 10 秒生成摘要 → 写 Redis KV → NanoClaw 读取, 这条链路完全多余。Context Compiler 直接读 vi:actions Stream 更简单。

**V6 的 gRPC 是过度引入**: 在当前规模下, 为了 Agent Router ↔ NanoClaw 通信引入一整套 gRPC (protobuf 编译, 双向流管理, 新的错误处理), 不值得。V7 拒绝得对。

**但 V7 未解决的问题**: 当 NanoClaw 在不同 Node 上运行时 (阶段 2+), Redis Pub/Sub 的跨节点性能需要 Redis Cluster 或 Sentinel。V7 提到了这一点但没有详细设计。

---

## 6. 数据存储对比

```
═══ 存储层架构对比 ═══

V4:
  NanoClaw Container ─ /workspace/ ─ Local SSD ── async sync ──► S3/GCS
  PostgreSQL: 用户元数据, session 记录
  Redis: 事件总线, context 缓存

V6:
  Standard Pool: tmpfs (用完即弃, 512MB)
  Dedicated Pool: OverlayFS ─ Base Image (只读) + User Layer (可写) ── snapshot ──► GCS
  Cloud SQL: PostgreSQL HA
  Redis Cluster: Pub/Sub + 缓存
  GCS: 照片 + OverlayFS 快照 + Content Bundle

V7:
  阶段1: 同 V4 (Local SSD + S3 async sync)
  阶段2: 同 V4, 多 Node
  阶段3: Standard(tmpfs) + Dedicated(本地FS+S3) — 选择性V6
```

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **用户 FS** | /data/users/{uid}/ 本地 SSD | OverlayFS + GCS 快照 | 阶段1-2: 同V4; 阶段3: 部分V6 |
| **FS 同步** | 60s debounce + S3 | tar+zstd → GCS (2-5s) | 同 V4 |
| **数据库** | Docker PostgreSQL | Cloud SQL HA | 渐进: Docker PG → Cloud SQL |
| **Redis** | Docker Redis 单实例 | Memorystore Redis Cluster | 渐进: Docker → Sentinel → Memorystore |
| **向量搜索** | 未提及 | pgvector (即时引入) | pgvector (阶段2-3, 按需) |
| **用户 FS 目录** | 11 级详细目录结构 | 概念级 (Base + User Layer) | 同 V4 |

---

## 7. 用户-容器映射策略

```
═══ 关键设计决策对比 ═══

V4: 1:1 固定绑定 (无条件)
    User-A ──── NanoClaw-A (永久绑定)
    User-B ──── NanoClaw-B
    理由: 零冷启动, 后台任务, 10用户不需要池化

V6: 混合三层 (按任务类型路由)
    User-A ──── 轻量层 (80% 请求, 无容器)
          ├──── 标准层 (15%, 预热池, 用完归还)
          └──── 重量层 (5%, 独占, OverlayFS)
    理由: 百万用户, 1:1 不可能

V7: 阶段性渐进
    阶段0-1: 1:1 固定 (同 V4)
    阶段2: 1:1 固定 + 路由分层 (vi-gateway 演进)
    阶段3: Pool + Dedicated (引入 V6 概念)
    理由: 不为 5000 用户之后的问题付现在的复杂度税
```

---

## 8. 阶段演进对比

```
═══ 时间线与规模对比 ═══

V4:  ──────────────────────────────────────────►
     单阶段设计: 10用户/VPS, $50/月
     未来: 横向加 VPS

V6:  ──────────────────────────────────────────►
     单阶段终态: 百万用户, GKE, $12K-33K/月
     前置: V5 Phase 0→1→2, 然后引入 V6

V7:  ──────────────────────────────────────────►
     阶段0        阶段1         阶段2          阶段3         阶段3+
     <50用户      50-500        500-5000       5000-50000    百万
     $130/月      $200-500      $500-2K        $2K-10K       方向,不设计
     docker-comp  docker-comp   MIG/GKE        GKE           ---
     vi-gateway   NanoClaw 1:1  vi-gw演进      Pool+Ded      ---
     (不改架构)   (V4核心)      (选择性V6)     (V6精华)      (到时再说)
```

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **阶段数** | 1 (单阶段实施) | 1 (终态蓝图) + 附录分阶段 | 4 (0-3) + 远景 |
| **触发条件** | 无 (直接实施) | 无 (终态设计) | 每阶段有明确退出条件 |
| **最低月成本** | $50-80/VPS | $12,200-32,800 | $130 (阶段0) |
| **每用户月成本** | $25-258 (10用户) | $0.012-0.033 (百万) | $4-31→$1.1-5→$0.28-1.26 |

---

## 9. 功能模块深度对比

### 9.1 Context Compiler

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **位置** | NanoClaw 内部模块 | 未明确提及 | NanoClaw 内部模块 (同V4) |
| **频率** | 每 30 秒 | — | 每 30 秒 + 自适应降频 |
| **输入** | memory + session + vi:summary + vi:frames | — | memory + session + vi:actions Stream + vi:frames |
| **输出** | context snapshot + predicted_intentions | — | 同 V4, 去掉中间聚合层 |
| **意图预测** | Claude Haiku, ~$0.002/次 | — | 同 V4 |
| **优化** | 场景不变跳过, 空闲降频 | — | 同 V4 + 缓存稳定预测 |
| **代码示例** | 完整 Python + TypeScript | — | 无代码 |

### 9.2 Skill 系统

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **格式** | skill.md + manifest.json | YAML + Markdown (注入式) | .md + manifest.json (同V4) |
| **加载** | /workspace/skills (用户) > /skills (共享) | Skill Registry 独立服务 | 同 V4, 阶段3+ Registry |
| **版本管理** | 无 | 独立版本, 可回滚 | 阶段3 按需 |
| **预装 Skill** | 6 个 (含 manifest 代码) | 5 个 (概念级) | 同 V4 |
| **Management API** | 完整 CRUD (7 endpoints) | 未详细设计 | 未提及 (参考 V4) |
| **代码** | 完整 TypeScript loadSkill() | — | 无 |

### 9.3 OAuth Token Center

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **详细程度** | 完整设计 (API + 安全模型 + 代码) | 未提及 | Section 20 (简要, 参考V4) |
| **API** | 5 endpoints 详细定义 | — | 同 V4 |
| **加密** | AES-256-GCM, 密钥从 JWT_SECRET 派生 | — | AES-256-GCM, 密钥从环境变量派生 |
| **Phase 1 Provider** | Google, Notion, Slack | — | Google, Notion, 小红书 |
| **NanoClaw Tool** | 完整 TypeScript interface + 示例 | — | 无代码 |

### 9.4 多模态管道

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **通道数** | 3 (Photo, Video, Keyframe) | 未单独设计 | 3 (同V4, Section 14.4) |
| **视频处理** | ffmpeg 关键帧 + Whisper 转录 → Claude 多帧 | — | 同 V4 |
| **关键帧采样** | 每 5s, 完整代码 (Python) | — | 同 V4, 无代码 |
| **质量门控** | pHash 场景检测 + Laplacian 模糊检测 | — | 同 V4 |
| **前端 UI** | 详细 ASCII 录制 UI 设计 | — | 无 |

### 9.5 前端设计

| 维度 | V4 | V6 | V7 |
|------|----|----|-----|
| **新 Hook** | useNanoClawResults, 含代码 | — | useNanoClawResults + useIntentionCards (概念) |
| **SSE 事件** | 11 种事件类型 + skill_status | — | 8 种事件类型 (精简) |
| **Session View** | 详细 ASCII 设计 + 交互流程 | — | 同 V4 (Section 19.3) |
| **Profile Page** | Skills Tab + Memory Tab + Connections Tab | — | 未提及 |
| **Token Management UI** | 详细 ASCII 设计 | — | 未提及 |

---

## 10. 关键决策清单对比

```
═══ 决策对照表 ═══

D1: 通信协议
    V4: Redis (唯一通信)      V6: gRPC (容器通信)     V7: Redis (拒绝gRPC)

D2: vi-gateway 命运
    V4: 替代 (NanoClaw接管)   V6: 替代 (Agent Router) V7: 演进 (加路由逻辑)

D3: 用户-容器映射
    V4: 1:1 固定              V6: 池化 (标准+重量)    V7: 阶段1-2:1:1, 阶段3:池化

D4: NanoClaw 改造方案
    V4: B (Fork+改造)         V6: C (提取重写VI-Brain) V7: B (同V4, 拒绝重写)

D5: Skill 系统
    V4: .md注入式             V6: .md注入式→插件式    V7: .md注入式 (同V4)

D6: NanoClaw↔LiveKit
    V4: 不直连 (Redis中继)    V6: 不直连 (Agent Router) V7: 不直连 (Redis, 同V4)

D7: 百万用户设计
    V4: 未涉及                V6: 完整终态设计         V7: "方向清单, 不做设计"

D8: 数据库
    V4: Docker PostgreSQL     V6: Cloud SQL HA         V7: 渐进 (Docker→Cloud SQL)

D9: 前端框架
    V4: 未涉及                V6: 保留Flutter+WebView  V7: 未涉及 (参考V6)

D10: API Server 语言
    V4: 保留 Python/FastAPI   V6: 保留, 热路径可Go     V7: 保留 (同V4)
```

---

## 11. 继承关系图 (V4/V6 → V7)

### 来自 V4 — 保留

| V4 设计元素 | V7 去向 | 来源评价 |
|------------|---------|---------|
| 主脑-代言人哲学 | 完整保留 (Section 2) | V4 最重要贡献 |
| Redis 事件总线 | 完整保留, 精简2个channel | 正确选择 |
| Context Compiler | 保留, 去掉 Event Aggregator | V7 简化了 |
| 1:1 用户-容器绑定 | 阶段1-2 保留 | 阶段正确 |
| Skill .md + manifest | 完整保留 | 实用 |
| 用户 FS (/workspace/) | 完整保留 | NanoClaw 基础 |
| SSE 结果推送 | 完整保留 | 简单可靠 |
| S3 URL 引用 | 完整保留 | 正确模式 |
| 多模态管道 | 完整保留 | 设计完整 |
| OAuth Token Center | 保留, 简化描述 | 需要参考V4实施 |
| 意图预测系统 | 保留, 增加自适应优化 | V4 核心创新 |
| 三层记忆金字塔 | 完整保留 | 记忆质量的保障 |

### 来自 V4 — 修正/去掉

| V4 设计元素 | V7 处理 | 理由 |
|------------|---------|------|
| Event Aggregator | 去掉 | Context Compiler 直接读 Stream |
| vi:summary | 去掉 | 多余的中间层 |
| 代言人推意图卡(DataChannel) | 改为 SSE 统一推送 | 不需要两条推送通道 |
| vi:media | 合并到 vi:actions | 减少 channel 数量 |
| Slack Provider (OAuth) | 改为小红书 | 产品调整 |

### 来自 V6 — 采纳 (未来阶段)

| V6 设计元素 | V7 引入阶段 | 触发条件 |
|------------|-----------|---------|
| 三层分流 (轻量/标准/重量) | 阶段 3 | 用户>5000, 1:1闲置率>80% |
| Skill Registry + 版本管理 | 阶段 3 | Skill 数量>20 |
| "Skill注入式"洞察 | 立即采纳 (D5) | V6 最重要贡献 |
| pgvector 记忆搜索 | 阶段 2-3 | 单用户记忆>1000条 |
| Cloud SQL HA | 阶段 3 | 可用性 SLA 要求 |
| Prometheus 监控 | 阶段 2 | 需要容器级别指标 |

### 来自 V6 — 拒绝

| V6 设计元素 | 拒绝理由 |
|------------|---------|
| **Agent Router (新服务)** | vi-gateway 演进即可, 新服务 = 重写 + 多维护 |
| **gRPC 双向流** | Redis 够用, 不引入第二种 RPC |
| **VI-Brain 完全重写** | 3900 行代码 fork + extend 更务实 |
| **OverlayFS + GCS 快照** | 本地 FS + S3 同步更简单, 同样效果 |
| **Container Pool Manager** | NanoClaw Orchestrator 扩展即可 |
| **百万用户终态设计** | 过早, 保质期有限, 到时再设计 |
| **Push Gateway (独立服务)** | API Server 内 Firebase FCM 调用即可 |
| **Firecracker / gVisor** | 当前 Docker 隔离够用, 安全审计要求时再升级 |
| **金丝雀发布 / Rolling Update 细节** | GKE 内置, 不需要在架构文档中详细设计 |

---

## 12. 成本模型对比

```
═══ 月成本对比 (USD) ═══

                    V4              V6                V7
用户规模:           10              1,000,000         渐进
                    ─────           ──────────        ─────

基础设施:           $50-80          $4,200-9,800      阶段0: $130
                    (1 VPS)         (GKE+DB+Redis+LB) 阶段1: $200-500
                                                      阶段2: $500-2K
                                                      阶段3: $2K-10K

LLM API:            $200-2,500      $8,000-23,000     (含在上面)
                    (Claude+Gemini) (Claude+Gemini)

总计:               $250-2,580      $12,200-32,800    $130 → $3K-10K

每用户/月:          $25-258         $0.012-0.033      渐进下降
```

---

## 13. 风险登记对比

| 风险 | V4 | V6 | V7 |
|------|----|----|-----|
| **产品验证失败** | 未提及 | 未提及 | R1, 可能性高, 影响致命 |
| **NanoClaw 复杂度** | 隐含 (扩展风险) | R1 上游破坏性变更 | R2, 中 |
| **Claude API 成本** | 提及优化策略 | R4, 高/高 | R3, 高/高 |
| **Redis 单点** | 未提及 | — | R4, 中/高 |
| **1:1 资源浪费** | 承认但接受 | 方案A缺点 | R5, 阶段3处理 |
| **容器逃逸** | 未提及 | R5, 低/极高 | R6, 低/极高 |
| **Skill 注入安全** | 未提及 | R8, 中/高 | R8, 中/高 |
| **百万用户 PG 性能** | — | R9, 中/高 | — |
| **Flutter WebView 泄漏** | — | R10, 中/中 | — |

### V7 新增的最关键风险

**R1: 产品验证失败** — V4 和 V6 都没有把这个列为风险。V7 把它排在第一位, 可能性 "高", 影响 "致命"。这是 V7 最清醒的判断: **在 0 用户的阶段, 最大的风险不是技术, 而是产品方向错误。** 这解释了为什么 V7 拒绝过早设计百万用户架构。

---

## 14. V7 的盲点与改进空间

### 作为架构师的批判性评审

**1. V7 过度依赖 V4 的实施细节 — 但自身缺乏实施深度**

V7 声称 "替代 V4", 但 V4 有完整的代码示例 (TypeScript loadSkill(), Python Context Compiler, EventAggregator), V7 没有任何代码。实施时仍需回看 V4, V7 不是真正的 "替代", 而是 "精简版 V4 + 路线图"。

**建议**: V7 应声明 "V4 降级为实施参考手册", 而非 "被替代"。

**2. vi-gateway "演进" 路径不够清晰**

V7 说 "vi-gateway 演进, 加入路由逻辑", 但现实中 vi-gateway 是 TypeScript, NanoClaw 也是 TypeScript — 两者合并的接口和边界是什么? 阶段 1 两者并行运行时, 请求如何分流?

V4 Section 15.2 "并行运行期" 给出了 executorHint 方案, V7 Section 18 给出了 6 步迁移路径 — 但两者有微妙差异 (V4 用 executorHint, V7 用 percentage-based 切换)。

**3. Event Aggregator 被去掉可能过早**

V7 去掉了 V4 的 Event Aggregator (API Server 每 10 秒聚合 vi:actions → vi:summary), 理由是 "Context Compiler 直接读 Stream"。但:

- Context Compiler 运行在 NanoClaw 容器内
- 如果容器重启, Stream 的消费位点 (consumer group offset) 需要持久化
- 直接读 Stream 的 "最近 30 秒事件" 逻辑, 等于把聚合逻辑移到了 NanoClaw — 并非 "去掉", 而是 "转移"

**4. 阶段 3 的触发条件可能来得比预期早**

V7 阶段 3 触发条件: "用户>5000, 1:1 闲置率>80%"。但如果产品成功, 从 500 到 5000 用户的增长可能非常快, 留给阶段 3 设计的时间窗口可能不够。V6 的前瞻性设计 (虽然过早) 至少提供了一个思路储备。

---

## 15. 总结: 三文档的角色

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│  V4 = 工程师的圣经                                                │
│       "怎么做" — 每一行代码级别的实施指南                          │
│       当你要写 Context Compiler, 打开 V4 Section 6               │
│       当你要写 Skill Loader, 打开 V4 Section 9                    │
│       当你要写 OAuth Tool, 打开 V4 Section 7                      │
│                                                                   │
│  V6 = 思想家的草稿纸                                              │
│       "如果规模化呢" — 百万用户的技术可行性论证                    │
│       当阶段 3 触发时, 回来读 V6 Section 4 (三层分流)             │
│       当 Skill 需要 Registry 时, 读 V6 Section 7.4               │
│       核心洞察: Skill 注入式 > 源码修改                           │
│                                                                   │
│  V7 = 架构师的决策记录                                            │
│       "做什么, 不做什么, 为什么" — 取舍判决书                     │
│       当有人问 "为什么不用 gRPC", 打开 V7 D1                     │
│       当有人问 "为什么不现在做池化", 打开 V7 D3                   │
│       当有人问 "架构路线图", 打开 V7 Section 3                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 推荐文档关系

```
活跃文档:
  V7 (架构决策 + 路线图) — 一级
  V5 (部署阶段) — 一级
  V4 (实施参考手册) — 二级 (不归档, 降级为参考)

归档文档:
  V6 (历史参考, 阶段3+ 灵感来源)
```

---

*VI Agent Architecture Comparison V4/V6/V7 | 2026-03-04*
