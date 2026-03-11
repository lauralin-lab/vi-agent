# VI Agent K8s 生产架构文档

> **版本**: v2.0
> **日期**: 2026-03-11
> **状态**: 内阁审议通过
> **参与者**: Infrastructure Architect, Security & Ops, Developer Experience Lead
> **决策方法**: 9 轮架构讨论 + 内阁 Battle 投票
> **编译来源**: 3 份内阁草案 (infra 50KB + security 48KB + dev-exp 44KB) + Battle 记录 + verbatim 01-09

---

## 1. 概述

### 1.1 项目简介

VI Agent 是一个 AI 编程助手平台，采用 4 服务单体仓库 (monorepo) 架构。用户通过语音/视频与 AI 实时交互，AI 在隔离沙箱中执行编程任务，结果实时流式返回给用户。

| 服务 | 技术栈 | 职责 |
|------|--------|------|
| **api-server** | Python / FastAPI | 用户 API、会话管理、PostgreSQL 数据持久化、SSE/WebSocket 事件推送 |
| **vi-realtime** | Python / LiveKit Agent | WebRTC 语音/视频通信、Gemini Native Audio 实时语音识别与合成 |
| **nanoclaw** | TypeScript | AI 编程编排器 (Orchestrator)、沙箱管理、Claude Code SDK 集成、技能/包解析 |
| **frontend** | React / Vite | 用户界面、实时预览、项目管理 |

四个服务通过 Redis PUB/SUB 实现异步事件驱动通信，PostgreSQL 存储用户数据与会话历史，GCS 持久化用户项目文件。当前部署方式为 docker-compose，本文档规划其向 GKE Autopilot 的完整迁移路径。

### 1.2 架构演进目标

从单机 docker-compose 部署演进到 GKE Autopilot 集群，分三个阶段按用户规模递进，每个阶段都是可独立运行的生产系统：

```
docker-compose (当前)
    │
    │  Phase 1: 基础迁移
    │  ─ 无状态服务容器化
    │  ─ 托管数据库 (Cloud SQL + Memorystore)
    │  ─ Sandbox Scheduler + API Key Proxy (Day 1)
    │  ─ 基础安全层就位
    ▼
GKE Autopilot — Phase 1: <=50 用户 (小规模生产验证)
    │
    │  Phase 2: 规模化
    │  ─ HPA 全面启用
    │  ─ Warm Pool 预热
    │  ─ Redis 拆分 (Realtime / State)
    │  ─ vi-realtime 蓝绿部署
    │  ─ External Secrets Manager
    ▼
GKE Autopilot — Phase 2: ~1,000 用户 (水平扩展验证)
    │
    │  Phase 3: 优化
    │  ─ Spot VM 全面应用
    │  ─ Canary 发布
    │  ─ 异常检测自动化
    │  ─ 全 Namespace NetworkPolicy
    │  ─ Cloud Armor WAF
    ▼
GKE Autopilot — Phase 3: ~10,000 用户 (万人级生产系统)
```

**并发模型参考** (按 30 万 DAU, 按需连接 20 分钟计算):
- 平均并发 ~4,200 会话
- 峰值 ~12,000-20,000 会话

各阶段的实际规模远小于此上限，三阶段的目标是在逐步验证的过程中建立扩展能力。

**成本结构核心洞察**: AI API (Anthropic + Gemini) 占总成本 50-87%，远超基础设施。这意味着基础设施优化的 ROI 有限，真正的成本杠杆在于 prompt caching、模型选择和任务调度优化。这也是 ADR #14 "Spot VM >> Go/Rust 重写" 的核心依据。

### 1.3 AI Coding 加速前提

本架构文档的所有时间估算都基于 AI 辅助编程 (Claude Code / Cursor / Copilot) 的加速效果。这不是"万能加速器"——其效果高度依赖任务类型。以下是 Developer Experience Lead 基于实证分析的完整加速倍率表：

| 任务类型 | 传统估时 | AI 辅助估时 | 加速倍率 | 原因 |
|---------|---------|-----------|---------|------|
| k8s Deployment/Service YAML | 2 天 | 0.5 天 | 4x | 纯模板化，AI 生成后微调 |
| Terraform 基础设施代码 | 3 天 | 1 天 | 3x | GKE、Cloud SQL、Memorystore 配置模式化 |
| GitHub Actions CI/CD | 2 天 | 0.5 天 | 4x | Pipeline 逻辑高度模板化 |
| Sandbox Scheduler HTTP API | 5 天 | 2 天 | 2.5x | 业务逻辑简单但需要 k8s client 集成 |
| Sandbox Scheduler Pod 生命周期 | 8 天 | 4 天 | 2x | 状态机逻辑 AI 能写，但边界条件多 |
| Warm Pool 管理器 | 5 天 | 2.5 天 | 2x | 后台 job 逻辑，需要测试不同场景 |
| task-server (Pod 内 HTTP) | 3 天 | 1 天 | 3x | 薄层 HTTP wrapper，逻辑简单 |
| agent-runner stdin->HTTP 重构 | 2 天 | 0.5 天 | 4x | 直接替换输入源，核心逻辑不变 |
| NanoClaw Docker->HTTP 重构 | 5 天 | 2 天 | 2.5x | 需要移除 Docker SDK、改调用链 |
| container-runtime.ts 替换 | 1 天 | 0.25 天 | 4x | 删除文件 + 新增 Scheduler client |
| API Key Proxy | 3 天 | 1 天 | 3x | 标准 reverse proxy + auth middleware |
| NetworkPolicy YAML | 1 天 | 0.25 天 | 4x | 声明式配置 |
| cloud-sync 优化 | 3 天 | 1.5 天 | 2x | 已有基础，增量改进 |
| _task_session_map Redis 迁移 | 1 天 | 0.25 天 | 4x | 简单的 dict->Redis hash 替换 |
| Preview 路由 (Gateway API) | 3 天 | 1 天 | 3x | k8s Gateway + HTTPRoute 配置 |
| 单元测试 | 按功能估 | 原时间 x 0.3 | 3x | AI 擅长生成测试用例 |
| 集成测试 | 按功能估 | 原时间 x 0.5 | 2x | 测试框架 AI 能写，但 mock 需要人审 |
| 分布式系统调试 | 不可预估 | 不可预估 | 1x | AI 无法替代观察 + 推理循环 |
| 压力测试 + 调优 | 5 天/轮 | 4 天/轮 | 1.25x | 测试脚本 AI 写，分析结果人做 |
| 监控/告警配置 | 3 天 | 1 天 | 3x | Prometheus rules + Grafana JSON |

**综合加权平均加速倍率: ~2.3x**

按任务类型权重分布计算:
- **配置/样板类** (占总工作量 ~25%): 平均 3.5x 加速
- **业务逻辑重构** (占总工作量 ~35%): 平均 2.5x 加速
- **测试编写** (占总工作量 ~15%): 平均 2.5x 加速
- **调试/调优/运维** (占总工作量 ~25%): 平均 1.2x 加速

传统估算 38 人周 -> AI 辅助估算 **~17 人周** (约 4 人月)

**AI 擅长加速的任务**:
- YAML/配置文件生成 (k8s manifests、Terraform、GitHub Actions)
- 样板代码 (HTTP server、middleware、CRUD 接口)
- 代码搬运/重构 (把 Docker API 调用替换为 HTTP 调用)
- 测试编写 (unit tests、integration tests)
- 文档和注释

**AI 无法显著加速的任务**:
- 架构决策本身 (我们已经花了 9 轮讨论才锁定 18 项决策)
- 分布式系统调试 (Pod 间通信故障、网络策略冲突、竞态条件)
- GKE/云服务配置调优 (需要实际运行 + 监控反馈循环)
- 安全审计 (攻击面分析需要人工判断)
- 性能调优 (需要压测数据 + 迭代)

> **警告**: 这个估算假设开发者已经熟悉 k8s 基础概念。如果团队没有 k8s 经验，需要额外 1-2 周学习期，AI 在这个阶段帮助有限。

### 1.4 本文档阅读指南

本文档按以下结构组织，读者可根据角色选择性阅读：

- **第 1 章 概述** — 所有人必读。理解项目背景、演进目标和 AI 加速前提。
- **第 2 章 架构决策记录 (ADR)** — 架构师和技术负责人必读。18 项锁定决策 + 4 项争议裁决，每项包含结论、理由和被否决的备选方案。
- **第 3 章 终局架构全景图** — 所有人推荐阅读。Phase 3 的完整架构图、服务间通信流程、数据流向和安全层次。这是全文的"地图"，后续章节是地图上各区域的详细说明。
- **后续章节** (分阶段详细设计、部署策略、存储架构、监控、成本管理等) — 按需阅读，实施具体阶段时参考。

**约定**:
- 中文描述 + 英文技术术语
- ASCII 图示内的标注使用中文
- 所有成本数据为月度估算 (USD)，基于 2026 年 GCP 定价
- "Phase N" 指的是用户规模阶段，不是开发时间阶段

---

## 2. 架构决策记录 (ADR)

### 2.1 已锁定决策 (18 项)

以下 18 项决策经过 9 轮架构讨论和内阁 Battle 投票锁定。每项决策包含结论、详细理由和被否决的备选方案，以便未来回溯决策上下文。

| # | 决策领域 | 结论 | 理由 | 备选方案 (被否决) |
|---|---------|------|------|-------------------|
| 1 | NanoClaw 部署模型 | 共享无状态 Orchestrator + Per-Session Sandbox Pod | NanoClaw v5.2 已将编排逻辑 (Orchestrator) 与执行逻辑 (container-runner) 分离。Orchestrator 变成纯路由——"谁的任务发到哪个 Pod"，不触碰用户数据。Per-Session Pod 提供物理隔离（独立文件系统、网络栈、gVisor 沙箱），消除了多租户共享进程空间的所有隔离缺陷（如 intention-predictor.ts 的全局变量泄漏、card-store 的共享 Map OOM 连锁等）。 | 单体部署（Orchestrator + 执行在同一进程）、Per-User 长期 Pod（资源浪费严重） |
| 2 | 存储方案 | emptyDir (SSD) + GCS cloud-sync，无 PVC | AI 编程项目体积小（典型 <1GB），生命周期短（分钟到小时级）。emptyDir 提供本地 SSD 级 IOPS (100K+ random read)，cloud-sync 提供持久化保障（已有 `cloud-sync.ts` 实现）。PVC 的动态 provisioning 延迟（10-30s 创建 PD）对于按需创建的 Sandbox Pod 不可接受，且 PVC 需要在同一 Zone，限制了调度灵活性。 | PVC (Persistent Volume Claim)、NFS (Filestore) |
| 3 | Docker 依赖 | 移除，改用 k8s API (通过 Scheduler) | GKE Autopilot 强制 gVisor，Docker-in-container (DinD/DooD) 在 gVisor 下无法运行。即使不用 Autopilot，运行 Docker daemon 需要特权容器，破坏安全隔离。通过 Sandbox Scheduler 调用 k8s API 创建 Pod 是 k8s 原生方案，与集群能力对齐。 | Sysbox (rootless container runtime)、在 VM 上保留 Docker |
| 4 | Pod 生命周期 | Per-Session (与 Realtime 会话对齐) | 一次实时交互 = 一个 session = 一个 Pod。用户连接 Realtime 时创建 Pod（或从 Warm Pool 分配），断开后 idle timeout -> cloud-sync -> 销毁。冷启动只发生一次（会话开始时），会话内所有任务复用同一 Pod，避免重复 cloud-sync 和上下文编译。架构天然限制 1 user = 0 或 1 active Pod（Realtime 单通道 LiveKit room = userId、Redis channel per-user `vi:exec:{userId}`、UserQueue per-user 串行）。 | Per-Task Pod (每个任务创建/销毁一个 Pod，冷启动太频繁)、长期 Pod (空闲浪费) |
| 5 | Pod 通信 | Plan C: Pod 内 HTTP task-server + Redis 直发结果 | NanoClaw Orchestrator 通过 HTTP POST 将任务发送到 Pod 的 task-server (:8080)，Pod 执行完成后通过 Redis PUBLISH 将结果直接发送到 `vi:stream:{userId}`。这实现了低延迟（HTTP 直连）+ 解耦（结果不经过 Orchestrator，减少单点瓶颈）。替代了原有的 stdin/stdout + CARD_OP:: 标记解析协议。 | Plan A (纯 Redis 双向通信，延迟高)、Plan B (gRPC streaming，实现复杂) |
| 6 | 沙箱隔离 | gVisor RuntimeClass (GKE 原生) | GKE Autopilot 默认对所有工作负载启用 gVisor sandbox。零配置成本、零额外资源开销。gVisor 在内核层拦截系统调用，提供比传统容器更强的隔离，防止 Sandbox Pod 中的恶意代码逃逸到宿主机。 | Kata Containers (更重量级，Phase 3 作为备选评估)、Firecracker (需要自管理) |
| 7 | 集群类型 | GKE Autopilot | 小团队 (1-2 人 + AI) 运维的最佳选择：自动节点管理、自动 gVisor、自动安全补丁、按 Pod 计费（不为空闲节点付费）。Phase 3 (10K 用户) 切到 Standard 每月只省 ~$500（详见 Battle 决议 #2），不值得引入的运维复杂度。 | GKE Standard (需手动管理 node pool、gVisor RuntimeClass、节点升级)、EKS/AKS |
| 8 | k8s 抽象 | Sandbox Scheduler 新服务 | NanoClaw Orchestrator 不应直接调用 k8s API（职责混淆、测试困难）。Sandbox Scheduler 封装所有 k8s 交互（Pod CRUD、Warm Pool、idle timeout），对外暴露简洁的 HTTP API（POST/GET/DELETE /sessions）。NanoClaw 只需要知道"请求一个 sandbox"和"往哪个 IP 发任务"。 | NanoClaw 直接集成 k8s client (耦合过紧)、k8s Operator CRD (过度工程化) |
| 9 | 预览路由 | k8s Gateway API + 子域名 | 用户在 Sandbox Pod 中运行的 web 应用需要通过浏览器预览。通配符 DNS `*.preview.domain.com` 指向 GKE Gateway，Gateway 根据 Host header 路由到对应 Sandbox Pod:3000。Phase 1 先用路径前缀方案简化，Phase 2 升级到子域名。预创建 HTTPRoute 池配合 Warm Pool 可将 preview 可用延迟从 ~30s 降到 ~1-2s。 | 自建 reverse proxy (开发维护成本高)、Cloudflare Tunnel (外部依赖) |
| 10 | API Key 安全 | API Key Proxy，Pod 内零 key | 真实 AI API key (ANTHROPIC_API_KEY, GEMINI_API_KEY) 仅存储在 api-key-proxy 的 k8s Secret 中。Sandbox Pod 只持有临时 session token（crypto-random 128-bit，不可预测，不是 JWT）。Pod 通过 `ANTHROPIC_BASE_URL=http://api-key-proxy/v1` 发起请求，Proxy 验证 session token + 来源 IP 后替换为真实 key 转发。即使 prompt injection 让 Claude 打印 env 变量，拿到的也是无法在集群外使用的 session token。用户数据 (GCS) 中也不含任何 key。 | 直接注入 key 到 Pod env (泄露风险)、Vault sidecar (资源开销大) |
| 11 | NanoClaw 预热 | 不需要 (无状态，启动 ~1-2s) | NanoClaw Orchestrator 改造后是纯无状态服务，标准 HPA 即可处理扩缩容。启动时间 ~1-2s (Node.js cold start)，不需要额外预热机制。 | 预创建 Orchestrator Pod 池 (不必要) |
| 12 | Sandbox 预热 | Warm Pool (Scheduler 管理) | Sandbox Pod 冷启动需要 ~30s (镜像拉取 + Node.js 启动 + cloud-sync from GCS + context 编译)。Warm Pool 预创建已完成基础初始化的 Pod，分配给用户时只需注入 session token + cloud-sync 用户数据（~5s）。Warm Pool 大小由 Scheduler 动态管理: `max(5, activeSessions * 0.10, creationRate * 2)`。Phase 1 不启用（10 并发可容忍 30s），Phase 2 启用。 | 无预热 (30s 冷启动不可接受 at scale)、固定大小预热池 (低谷浪费/高峰不足) |
| 13 | Redis | Memorystore (托管)，后期拆分 Realtime/State | 零运维托管 Redis。Phase 1 单实例混合使用 (PUB/SUB + KV + Cache)。Phase 2 拆分为两个实例: Redis-Realtime (Basic tier, 无 replica, PUB/SUB 高吞吐不需持久化) + Redis-State (Standard tier, 有 replica, session registry 丢失=所有活跃 Pod 失联)。拆分时机是 200 并发时 PUB/SUB 的 CPU 消耗与 KV 操作开始竞争。 | 自建 Redis (运维负担)、Redis Cluster (Phase 3 规模不需要) |
| 14 | 成本优化 | Spot VM >> Go/Rust 重写 | 数据验证: Sandbox Pod 使用 Spot VM 每月省 ~$22K (60-70% 计算成本)；Go/Rust 重写 NanoClaw 假设省 50% 内存，每月省 ~$6.7K。Spot 的 ROI (投入 ~1 天配置 vs 节省 $22K/月) 远高于重写 (投入 ~3 个月 vs 节省 $6.7K/月)。AI API 占总成本 50-87%，基础设施优化上限有限。 | 重写核心服务为 Go/Rust (ROI 低) |
| 15 | 模型锁定 | 不锁死，task-server 层预留扩展点 | Claude Code SDK 开源，但未来可能需要支持其他 AI SDK 或本地模型。task-server 作为 Pod 内的 HTTP 接口层，可以封装不同的 AI backend 实现。API Key Proxy 也预留多 provider 路由能力（按 session config 路由到不同上游）。 | 深度绑定 Claude Code SDK (灵活性差) |
| 16 | 租户隔离模型 | Orchestrator 纯路由 + Per-Session Pod 物理隔离 | 5 层防御模型: (1) Redis Channel 逻辑隔离 (2) Sandbox Pod 物理隔离 (3) gVisor 系统调用隔离 (4) NetworkPolicy 网络隔离 (5) API Key Proxy 密钥隔离。Orchestrator 只做 "谁的任务发到哪个 Pod" 路由决策，不触碰用户代码/数据。代码审查发现的 3 个隔离缺陷 (intention-predictor.ts 全局变量、共享 userDataDir、进程内全局 Maps) 在 Per-Session Pod 架构下自动消失。 | 进程级隔离 (不够强)、VM 级隔离 (成本太高) |
| 17 | Pod 与用户关系 | 1 user = 0 或 1 active Pod | session != 项目。用户有 5 个项目 -> 全在 GCS，零成本。用户此刻编辑 Project C -> 1 个 Pod。离开 -> idle timeout -> cloud-sync -> Pod 销毁 -> 0 Pod。回来 -> Warm Pool 5s / 冷启动 30s -> 加载 GCS -> 继续。1000 注册用户 -> 实际 ~50 活跃 Pod + ~30 idle Pod + ~20 Warm Pool = ~100 Pod (不是 5000)。 | 1 user = N Pod (一个项目一个 Pod，资源浪费)、多用户共享 Pod (隔离不足) |
| 18 | API Key 存储位置 | 仅在 api-key-proxy 的 k8s Secret 中 | 用户数据 (GCS) 里只有 memory 文件、session 历史、项目代码，零 API key。Pod 内的 Claude Code SDK 配置为 `ANTHROPIC_API_KEY=tok-session-abc123` (session token，非真 key) + `ANTHROPIC_BASE_URL=http://api-key-proxy/v1`。即使 Pod 被入侵或 prompt injection 让 Claude 打印 env，攻击者拿到的 session token 无法在集群外使用，且生命周期 = Pod (Pod 销毁即失效)。 | Key 存在用户数据中 (泄露面太大)、Key 注入 Pod env (Pod 被入侵即泄露) |

### 2.2 Battle 决议

内阁三位成员 (Infrastructure Architect, Security & Ops, Developer Experience Lead) 在以下 4 项议题上存在分歧，通过 Battle 投票裁决。

---

#### Battle 1: Phase 1 是否包含 NanoClaw 改造？

**分歧描述**: Phase 1 (<=50 用户) 是只做基础设施迁移 (api-server/frontend/vi-realtime 上 k8s)，还是同时改造 NanoClaw + 引入 Sandbox Scheduler + API Key Proxy？

**各方立场**:

- **Infrastructure Architect**: Phase 1 就引入 Sandbox Scheduler + API Key Proxy
  - GKE Autopilot 强制 gVisor，Docker-in-container 无法运行。没有 Scheduler = 没有沙箱执行能力，NanoClaw 的核心功能直接瘫痪
  - API Key Proxy 开发量极小 (~200 行代码)，安全不能分阶段——从 Day 1 起 Pod 内必须零 key

- **Developer Experience Lead**: Phase 1 不改 NanoClaw，保留 Docker
  - 降低 Phase 1 风险，先验证 k8s 基础设施的稳定性
  - NanoClaw 暂留 VM 或用 Sysbox/DinD 运行，指向 k8s 上的 Redis
  - 避免在一个阶段内做太多变更导致排查困难

- **Security & Ops**: API Key Proxy 必须 Day 1
  - 安全不分阶段。任何一天 Pod 内有真实 API key，就是一天的攻击窗口

**投票结果**: 2:1 通过 (infra + security vs dev-exp)

**裁决理由**:
1. GKE Autopilot 决策已锁定 -> Docker 在 Autopilot 上不工作 -> Scheduler 是刚需，不是可选项
2. dev-experience 的 "NanoClaw 留 VM" 方案可行但产生混合架构债务 (k8s + VM 共存)
3. 用户要求 "AI coding 大幅提速" -> Scheduler + Proxy 只需 ~3 天 AI 辅助开发
4. 安全确实不能分阶段 (security-ops 支持 infra-architect)

**折中措施**: Phase 1 的 Scheduler 是最简版本（无 Warm Pool、无高级调度），只实现 Pod CRUD + session registry。Warm Pool 推到 Phase 2。

---

#### Battle 2: GKE Autopilot 是否贯穿全部三个阶段？

**分歧描述**: Phase 3 (10,000 用户) 是否需要切换到 GKE Standard 以节省成本？

**各方立场**:

- **Infrastructure Architect**: Phase 1-3 全程 Autopilot
  - 10K 用户切 Standard 每月只省 ~$500 (详细计算: Standard 看似省 $11K，但 Node 管理运维 ~$7.5K 人力 + 利用率损失 ~$3K = 净省仅 $500)
  - Autopilot bin-packing 比手动 node pool 更高效
  - Node autoscaling 响应延迟: Standard 新 Node 启动 ~2-4 min vs Autopilot 秒级

- **Developer Experience Lead**: 未明确表态

- **Security & Ops**: 支持 Autopilot，强制 gVisor 是安全优势
  - Standard 模式下需要手动管理 gVisor RuntimeClass，有配置遗漏风险

**投票结果**: 2:0 通过 (infra + security，dev-exp 弃权)

**裁决理由**: 成本差异极小 (<1% 总成本)，运维简化的价值远大于微小的成本节省。除非出现 Autopilot 功能限制（如需要 GPU Node Pool、自定义 DaemonSet、超大 Pod >16 vCPU、或月度计算成本 >$100K 且有专职 SRE 团队 >3 人），否则不切换。

---

#### Battle 3: 原始 4 阶段 vs 用户要求的 3 阶段

**分歧描述**: 内部讨论产生了 4 个内部子阶段的划分，但用户要求按用户规模 (50/1000/10000) 划分为 3 个阶段。如何映射？

**各方立场**:

- **Infrastructure Architect**: 4 个内部子阶段映射到 3 个用户可见阶段
  - Phase 1 = Foundation + 基本 NanoClaw 改造
  - Phase 2 = HPA + Redis 分离 + Warm Pool + 高级监控
  - Phase 3 = 多区域 + 高级调度 + 成本优化

- **Developer Experience Lead**: 合并原始 Phase 1-2 为新 Phase 1
  - 无状态服务 + Realtime 的 k8s 化可以并行且复杂度低
  - NanoClaw 改造才是真正的架构变革，应作为独立阶段

**投票结果**: 3:0 综合方案通过

**裁决理由**: 用户的 3 阶段划分按用户规模 (50/1000/10000)，各成员的内容按以下映射：
- **Phase 1 (<=50)**: 全部基础设施 + NanoClaw 改造 + 基本安全 (采纳 infra-architect 方案)
- **Phase 2 (~1,000)**: 规模化 + Warm Pool + Redis 分离 + 高级监控
- **Phase 3 (~10,000)**: 优化 + 多区域评估 + 高级调度 + 成本优化

---

#### Battle 4: API Key Proxy 实现方式

**分歧描述**: API Key Proxy 用零代码的 Envoy + Lua filter，还是用自定义服务？

**各方立场**:

- **Security & Ops**: Envoy + Lua filter (零自定义代码)
  - API Key Proxy 的核心功能（请求转发 + header 注入 + rate limit）是 Envoy 的强项
  - 不需要写代码就能获得生产级 HTTP proxy 性能和可靠性
  - Envoy 的 metrics 直接接入 Prometheus，零额外开发

- **Developer Experience Lead**: 自定义 Go/Node.js 服务
  - Envoy + Lua 需要学习 Envoy 配置语法，团队可能不熟悉
  - 150-300 行 Node.js/Go 代码更好维护、更好调试
  - 未来需要复杂的 per-user billing 逻辑时更灵活

**投票结果**: 裁决通过 (Team Lead 裁决)

**裁决理由**: Phase 1 用自定义 Node.js (简单直接，团队熟悉)，Phase 2 评估是否需要迁移到 Envoy。150-300 行代码的维护成本可接受。如果性能瓶颈再考虑 Envoy。Security & Ops 的 Envoy 方案技术上更优，但团队熟悉度和调试便利性在小团队场景下更重要。

---

**Battle 表决总结**:

| 议题 | infra | security | dev-exp | 结果 |
|------|-------|----------|---------|------|
| Phase 1 含 Scheduler | ✅ | ✅ | ❌ | 2:1 通过 |
| 全程 Autopilot | ✅ | ✅ | -- | 2:0 通过 |
| 3 阶段划分 | ✅ | ✅ | ✅ | 3:0 通过 |
| Proxy 用 Node.js | -- | ❌ | ✅ | 裁决通过 |

---

## 3. 终局架构全景图

### 3.1 全服务架构图 (Phase 3 终态)

以下是 Phase 3 (~10,000 用户) 的完整服务架构图，展示所有服务、连接关系和扩展参数：

```
                                    Internet
                                       |
                                       v
                            +---------------------+
                            |    Cloud Armor WAF   |
                            |  (DDoS + L7 防护)    |
                            +----------+----------+
                                       |
                            +----------+----------+
                            |      Cloud CDN       |
                            | (frontend 静态资源    |
                            |  全球边缘缓存)       |
                            +----------+----------+
                                       |
                            +----------+----------+
                            |  GKE Gateway API     |
                            |  (外部 Application   |
                            |   Load Balancer)     |
                            |                      |
                            | api.domain.com/*     |
                            | app.domain.com/*     |
                            | ws.domain.com/*      |
                            | *.preview.domain.com |
                            | + TLS termination    |
                            +----------+----------+
                                       |
          +----------+---------+-------+-------+---------+----------+
          |          |         |               |         |          |
   +------+---+ +---+------+  |        +------+------+  |   +------+------+
   | frontend | |api-server|  |        | vi-realtime |  |   | HTTPRoute   |
   | Deploy   | | HPA 5-15 |  |        | HPA 10-40  |  |   | (preview    |
   | x2       | |          |  |        | PDB 10%    |  |   |  子域名路由) |
   | (CDN扛   | | FastAPI  |  |        | LiveKit    |  |   |             |
   |  流量)   | | + SSE/WS |  |        | Agent      |  |   | *.preview.  |
   +----------+ +---+------+  |        +------+------+  |   | domain.com  |
                    |          |               |         |   +------+------+
                    |   +------+--------+      |         |          |
                    |   | Redis-Realtime |      |         |          |
                    |   | (Basic 5GB)    |      |         |          |
                    |   | PUB/SUB 专用   |      |         |          |
                    |   +------+--------+      |         |          |
                    |          |               |         |          |
                    |   +------+--------+      |         |          |
                    +-->| Redis-State   |<-----+         |          |
                        | (Std 5GB+HA)  |                |          |
                        | Session Reg   |                |          |
                        +------+--------+                |          |
                               |                         |          |
                        +------+--------+                |          |
                        | nanoclaw-orch |                |          |
                        | HPA 5-15     |                |          |
                        | (纯路由,     |                |          |
                        |  不碰数据)   |                |          |
                        +------+--------+                |          |
                               |                         |          |
                          HTTP POST                      |          |
                          /sessions                      |          |
                               |                         |          |
                        +------+--------+                |          |
                        | sandbox-sched |                |          |
                        | HPA 2-5      |                |          |
                        | (k8s API     |                |          |
                        |  Pod CRUD)   |                |          |
                        +------+--------+                |          |
                               |                         |          |
                          k8s API                        |          |
                          创建/管理                       |          |
                               |                         |          |
                  +------------+------------+            |          |
                  |                         |            |          |
           +------+--------+        +------+--------+   |          |
           | sandbox-pod   |        | warm pool     |   |          |
           | 动态 0-2000   |        | ~70-200 pods  |   |          |
           | (Spot 优先)   |        | (Spot, 预热)  |   |          |
           |               |        |               |   |          |
           | Per-Session   |        | 已初始化,     |   |          |
           | 物理隔离      |        | 待分配        |   |          |
           | emptyDir+GCS  |        +---------------+   |          |
           | gVisor 沙箱   +----------------------------+          |
           +------+--------+   preview :3000 通过 Gateway          |
                  |                                                 |
                  |  AI API 调用                                    |
                  |  (session token)                                |
                  v                                                 |
           +------+--------+                                       |
           | api-key-proxy |                                       |
           | HPA 2-5      |                                       |
           | (验证token,  |                                       |
           |  注入真key,  |                                       |
           |  rate limit) |                                       |
           +------+--------+                                       |
                  |                                                 |
                  | HTTPS (真实 API Key)                            |
                  v                                                 |
           +---------------+                                       |
           | External AI   |     +---------------+                 |
           | Anthropic API |     | anomaly-      |                 |
           | Gemini API    |     | detector x2   |                 |
           +---------------+     | (ML异常检测)  |                 |
                                 +---------------+                 |
                                                                   |
                                 +---------------+                 |
                                 | Cloud SQL HA  |-----------------+
                                 | 4vCPU/16GB    |
                                 | + replica     |
                                 +---------------+
```

**Namespace 划分**:
```
vi-agent-cluster
  |
  +-- namespace: vi-core
  |     api-server, nanoclaw-orchestrator, sandbox-scheduler,
  |     api-key-proxy, anomaly-detector
  |
  +-- namespace: vi-realtime
  |     vi-realtime (独立 namespace: 独立 HPA 策略 + PDB)
  |
  +-- namespace: vi-sandbox
  |     sandbox-pod (动态创建)
  |     (独立 namespace: NetworkPolicy 隔离 + ResourceQuota 限制 + RBAC 最小权限)
  |
  +-- namespace: vi-frontend
  |     frontend
  |
  +-- namespace: vi-system
        GKE 系统组件, monitoring agents
```

### 3.2 服务间通信流程

#### 核心任务执行流程 (用户语音指令 -> AI 编程 -> 结果返回)

```
用户浏览器
    |
    | (1) WebRTC 语音连接
    v
vi-realtime (LiveKit Agent)
    |
    | (2) 语音识别 (Gemini Native Audio)
    |     转换为文本指令
    |
    | (3) Redis PUBLISH vi:exec:{userId}
    |     { prompt, userId, sessionId, taskId, ... }
    v
Redis-Realtime (PUB/SUB)
    |
    | (4) SUBSCRIBE vi:exec:{userId}
    v
nanoclaw-orchestrator (纯路由)
    |
    | (5) HTTP POST http://sandbox-scheduler:8000/sessions
    |     { userId, tier, timeout }
    |     ← 响应: { sessionId, podEndpoint: "10.0.1.5:8080", status: "ready" }
    |
    | (6) HTTP POST http://10.0.1.5:8080/task
    |     { prompt, userId, taskId, skillSlug, context, ... }
    |     ← 响应: { ok: true, taskId }  (任务已接收, 异步执行)
    v
sandbox-pod (task-server :8080)
    |
    | (7) 编译上下文 (context-compiler)
    |     读取 /workspace/memory/ 下的用户记忆
    |
    | (8) Claude Code SDK 执行编程任务
    |     发起 AI API 调用:
    |     POST https://api-key-proxy.vi-core.svc/v1/messages
    |     Headers: x-api-key: sess-{sessionId}
    v
api-key-proxy
    |
    | (9) 验证 session token (Redis lookup)
    |     验证来源 IP (sandbox Pod CIDR)
    |     检查 rate limit (per-user)
    |     替换 header: sess-xxx → sk-ant-real-key-xxx
    |
    | (10) 转发到 api.anthropic.com
    |      记录 usage (Redis INCRBY)
    v
Anthropic API / Gemini API
    |
    | (11) AI 响应返回
    v
sandbox-pod (继续执行)
    |
    | (12) 执行完成, Redis PUBLISH vi:stream:{userId}
    |      { type: "exec_result", taskId, result }
    v
Redis-Realtime (PUB/SUB)
    |
    | (13) SUBSCRIBE vi:stream:{userId}
    v
api-server (SSE/WebSocket)
    |
    | (14) 推送结果到用户浏览器
    v
用户浏览器 (显示编程结果)
```

#### 预览访问流程 (用户浏览器直接访问 Sandbox Pod 中的 Web 应用)

```
用户浏览器
    |
    | (1) HTTPS https://{sessionId}.preview.domain.com
    v
GKE Gateway API
    |
    | (2) 根据 Host header 匹配 HTTPRoute
    |     {sessionId}.preview.domain.com → sandbox-pod:3000
    v
sandbox-pod :3000 (用户的 web 应用预览端口)
    |
    | (3) 返回 HTML/JS/CSS
    v
用户浏览器 (显示预览)
```

#### 通信协议总结

```
+--------------------+-------------------+------------------+
| 通信路径            | 协议              | 说明             |
+--------------------+-------------------+------------------+
| 浏览器 → Gateway   | HTTPS / WSS       | TLS 终止在 GW    |
| Gateway → 服务     | HTTP / WebSocket  | 集群内明文(短距) |
| vi-realtime ↔ Redis| Redis PUB/SUB     | 异步事件驱动     |
| nanoclaw → Sched   | HTTP POST         | 同步请求/响应    |
| nanoclaw → Pod     | HTTP POST         | 同步请求/响应    |
| Pod → Redis        | Redis PUBLISH     | 结果直发(解耦)   |
| Pod → api-key-proxy| HTTPS             | session token    |
| api-key-proxy → AI | HTTPS             | 真实 API key     |
| 浏览器 → Pod预览   | HTTPS via Gateway | 子域名路由       |
| Scheduler → k8s    | k8s API (HTTPS)   | Pod CRUD         |
+--------------------+-------------------+------------------+
```

### 3.3 数据流向

#### 写路径 (数据产生 → 存储)

```
+------------------+-------------------+-------------------+---------------------------+
| 数据类型          | 产生位置           | 存储位置           | 写入方式                   |
+------------------+-------------------+-------------------+---------------------------+
| 用户项目代码      | sandbox-pod       | emptyDir → GCS    | cloud-sync (SHA-256 增量) |
|                  | /workspace/       | gs://vi-agent-    | 触发: 每5min + 会话结束   |
|                  |                   | data/{uid}/{pid}/ | + Pod 销毁前 (preStop)    |
+------------------+-------------------+-------------------+---------------------------+
| 用户记忆          | sandbox-pod       | emptyDir → GCS    | 同上 (memory/ 子目录)     |
| (identity/       | /workspace/       |                   |                           |
|  semantic/       | memory/           |                   |                           |
|  episodic)       |                   |                   |                           |
+------------------+-------------------+-------------------+---------------------------+
| 会话状态          | sandbox-scheduler | Redis-State       | HSET sandbox:sessions:    |
| (session         |                   |                   | {userId} → {sessionId,    |
|  registry)       |                   |                   |  podIP, status,           |
|                  |                   |                   |  lastActivity}            |
+------------------+-------------------+-------------------+---------------------------+
| 实时消息          | sandbox-pod /     | Redis-Realtime    | PUBLISH vi:stream:{uid}   |
| (执行结果/       | vi-realtime /     | (PUB/SUB,         | PUBLISH vi:exec:{uid}     |
|  任务指令)       | nanoclaw          |  不持久化)         | PUBLISH vi:ctx:{uid}      |
+------------------+-------------------+-------------------+---------------------------+
| 用户账号/配置     | api-server        | Cloud SQL         | SQL INSERT/UPDATE         |
|                  |                   | (PostgreSQL)      |                           |
+------------------+-------------------+-------------------+---------------------------+
| AI API 使用量     | api-key-proxy     | Redis → PG        | Redis INCRBY (实时)       |
| (tokens/cost)    |                   |                   | → CronJob 聚合到 PG      |
+------------------+-------------------+-------------------+---------------------------+
| 对话/任务历史     | api-server        | Cloud SQL         | SQL INSERT                |
|                  |                   | (PostgreSQL)      |                           |
+------------------+-------------------+-------------------+---------------------------+
```

#### 读路径 (存储 → 数据消费)

```
+------------------+-------------------+-------------------+---------------------------+
| 数据类型          | 消费位置           | 存储位置           | 读取方式                   |
+------------------+-------------------+-------------------+---------------------------+
| 用户项目代码      | sandbox-pod       | GCS → emptyDir    | cloud-sync (Pod 启动时    |
|                  | /workspace/       |                   |  增量下载)                |
+------------------+-------------------+-------------------+---------------------------+
| 用户记忆          | sandbox-pod       | GCS → emptyDir    | cloud-sync → context-     |
|                  | context-compiler  |                   | compiler 编译为 prompt    |
+------------------+-------------------+-------------------+---------------------------+
| 会话状态          | nanoclaw-orch /   | Redis-State       | HGET sandbox:sessions:    |
|                  | sandbox-scheduler |                   | {userId}                  |
+------------------+-------------------+-------------------+---------------------------+
| 实时消息          | api-server        | Redis-Realtime    | SUBSCRIBE vi:stream:{uid} |
|                  | (→ 推送给浏览器)  | (PUB/SUB)         |                           |
+------------------+-------------------+-------------------+---------------------------+
| Session token    | api-key-proxy     | Redis-State       | GET session:{token}       |
| 验证             |                   |                   | → {userId, tier, podIP}   |
+------------------+-------------------+-------------------+---------------------------+
| 用户账号/配置     | api-server /      | Cloud SQL         | SQL SELECT                |
|                  | nanoclaw          | (PostgreSQL)      |                           |
+------------------+-------------------+-------------------+---------------------------+
```

#### 三层存储模型

```
+------------------------------------------------------------------------+
|                          存储层次架构                                    |
|                                                                        |
|  HOT: emptyDir (Pod-local SSD)                                         |
|  +------------------------------------------------------------------+  |
|  | 生命周期 = Pod                                                    |  |
|  | 性能: 本地 SSD IOPS (100K+ random read)                          |  |
|  | 内容: node_modules, 编译缓存, 运行时文件, 工作区项目文件           |  |
|  | 大小限制: 10GB per pod (LimitRange enforced)                      |  |
|  | 数据丢失: Pod 销毁时消失 → 必须先 cloud-sync to GCS              |  |
|  +------------------------------------------------------------------+  |
|                           |                                            |
|                           | cloud-sync (SHA-256 增量, 每 5 分钟)       |
|                           v                                            |
|  WARM: 共享缓存 (Phase 2+, 可选)                                      |
|  +------------------------------------------------------------------+  |
|  | 类型: GCS Fuse + 本地缓存 (Phase 2) 或 Filestore NFS (Phase 3)   |  |
|  | 内容: npm 包缓存, 常用项目模板 (React, Next.js, Vue scaffolding)  |  |
|  | 访问模式: ReadOnlyMany (所有 sandbox pods 共享读取)               |  |
|  | 作用: 避免每个 Pod 重新 npm install react 全家桶                  |  |
|  |       典型项目 npm install: 无缓存 ~30-60s → 有缓存 ~3-5s        |  |
|  | Phase 1: 不需要 (10 并发各自 npm install 可接受)                  |  |
|  | Phase 2+: 200 并发 Pod 同时 npm install → registry 压力 + 时间   |  |
|  +------------------------------------------------------------------+  |
|                           |                                            |
|                           v                                            |
|  COLD: GCS (对象存储, 无限容量)                                        |
|  +------------------------------------------------------------------+  |
|  | 路径: gs://vi-agent-data/{userId}/{projectId}/                    |  |
|  | 内容:                                                             |  |
|  |   - 用户项目文件 (代码、配置)                                     |  |
|  |   - 用户 memory (identity/semantic/episodic)                      |  |
|  |   - 历史项目存档                                                  |  |
|  | 同步机制: cloud-sync.ts (已有)                                    |  |
|  |   - 启动: GCS → emptyDir (增量下载)                               |  |
|  |   - 完成: emptyDir → GCS (增量上传)                               |  |
|  |   - 中间检查点: 每 5 分钟自动 sync (防 Node 故障丢数据)           |  |
|  | 成本: $0.02/GB/月 (Standard) 或 $0.01/GB/月 (Nearline 归档)      |  |
|  +------------------------------------------------------------------+  |
+------------------------------------------------------------------------+
```

### 3.4 安全架构概览

VI Agent 采用 5 层纵深防御 (Defense in Depth) 架构，从逻辑隔离到物理隔离层层递进，确保任何单一层被突破都不会导致整体安全失效：

```
+========================================================================+
|                        5 层纵深防御架构                                  |
+========================================================================+
|                                                                        |
|  Layer 5 (最外层): API Key Proxy — 密钥隔离                            |
|  +------------------------------------------------------------------+  |
|  | 真实 AI API key 仅存在于 api-key-proxy 的 k8s Secret 中           |  |
|  | Sandbox Pod 只持有临时 session token (crypto-random 128-bit)      |  |
|  | Session token 绑定 Pod IP + 生命周期 = Pod                        |  |
|  | 即使 Pod 被入侵, 攻击者拿到的 token 集群外无法使用                |  |
|  | Per-user rate limiting 防止 token 消耗失控                        |  |
|  |                                                                    |  |
|  | 防御目标: API key 泄露、token 消耗失控、未授权 AI API 调用        |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Layer 4: NetworkPolicy — 网络隔离                                     |
|  +------------------------------------------------------------------+  |
|  | Sandbox Pod 出站仅允许:                                            |  |
|  |   ✅ api-key-proxy (AI API 调用, port 443)                        |  |
|  |   ✅ Redis (结果发布, port 6379)                                  |  |
|  |   ✅ 外部 HTTPS (npm install 等, port 443, 排除内网 CIDR)        |  |
|  |   ✅ DNS (port 53)                                                |  |
|  |   ❌ 集群内网 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)       |  |
|  |   ❌ 其他 Sandbox Pod (Pod 间零通信)                              |  |
|  |   ❌ k8s API Server                                               |  |
|  |                                                                    |  |
|  | Sandbox Pod 入站仅允许:                                            |  |
|  |   ✅ nanoclaw-orchestrator (任务下发, port 8080)                  |  |
|  |   ✅ Gateway (预览访问, port 3000)                                |  |
|  |   ❌ 其他所有来源                                                  |  |
|  |                                                                    |  |
|  | 演进: Phase 1 仅 sandbox namespace → Phase 2 扩展到               |  |
|  |       vi-realtime → Phase 3 全 namespace default deny             |  |
|  |                                                                    |  |
|  | 防御目标: 横向移动、内网扫描、Pod 间攻击                          |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Layer 3: gVisor RuntimeClass — 系统调用隔离                           |
|  +------------------------------------------------------------------+  |
|  | GKE Autopilot 默认对所有工作负载强制启用 gVisor sandbox            |  |
|  | gVisor 在用户空间实现 Linux 内核接口, 拦截所有系统调用             |  |
|  | 即使同一 Node 上的多个 Pod, 也无法通过内核漏洞互相访问             |  |
|  | 零配置成本 (Autopilot 默认) + 零额外资源开销                      |  |
|  |                                                                    |  |
|  | 防御目标: 容器逃逸、内核漏洞利用、提权攻击                        |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Layer 2: Sandbox Pod — 物理隔离                                       |
|  +------------------------------------------------------------------+  |
|  | Per-Session Pod: 每用户独占 Pod, 不与其他用户共享任何进程空间      |  |
|  | 独立文件系统: emptyDir (Pod 销毁 = 数据物理消失)                   |  |
|  | 独立网络栈: 每个 Pod 有自己的 IP 和网络命名空间                    |  |
|  | 独立 session token: 一个 Pod = 一个 Token = 一个用户               |  |
|  | RBAC: sandbox-pod ServiceAccount 无任何 k8s 权限                   |  |
|  |                                                                    |  |
|  | 防御目标: 多租户数据泄露、用户间干扰、共享状态攻击                |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  Layer 1 (最内层): Redis Channel — 逻辑隔离                            |
|  +------------------------------------------------------------------+  |
|  | Redis channel 命名空间: vi:exec:{userId}, vi:stream:{userId}      |  |
|  | Pod 只能 PUBLISH 到分配给自己的 channel                            |  |
|  | Phase 2+: Redis ACL 强制限制 (per-pod channel 权限)               |  |
|  | AsyncLocalStorage 请求上下文绑定 { userId, sessionId }            |  |
|  | UserQueue per-user 串行, 跨用户并行                                |  |
|  |                                                                    |  |
|  | 防御目标: 消息伪造、跨用户数据注入、channel 劫持                  |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+========================================================================+
```

**安全层叠加效果**: 即使攻击者突破了一层，仍然被后续层阻止：

```
攻击场景 1: Prompt injection 让 Claude 读取 env
  → Layer 5 阻止: env 中只有 session token, 非真实 key
  → 即使拿到 token, Layer 4 阻止: 无法从集群外使用

攻击场景 2: Sandbox Pod 中的恶意代码尝试访问其他 Pod
  → Layer 4 阻止: NetworkPolicy deny pod-to-pod
  → Layer 3 阻止: gVisor 拦截非法系统调用
  → Layer 2 阻止: 独立网络命名空间, 无法发现其他 Pod

攻击场景 3: 恶意用户发送伪造 Redis 消息到其他用户 channel
  → Layer 1 阻止: Redis ACL 限制 Pod 只能操作自己的 channel
  → Layer 4 阻止: Pod 只能连接指定 Redis, 无法直连其他服务

攻击场景 4: 容器逃逸尝试
  → Layer 3 阻止: gVisor 拦截系统调用, 不直接接触宿主内核
  → Layer 2 阻止: Pod 的 ServiceAccount 无 k8s 权限
  → Layer 4 阻止: 即使逃逸, 无法访问内网
```

**各阶段安全层部署时间线**:

| 安全层 | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Redis Channel 隔离 | ✅ 已有 | ✅ + Redis ACL | ✅ 强化 |
| Sandbox Pod 物理隔离 | ✅ Day 1 | ✅ | ✅ |
| gVisor RuntimeClass | ✅ Autopilot 默认 | ✅ | ✅ 评估 Kata |
| NetworkPolicy | ✅ 基础 (sandbox only) | ✅ 细化 (per-namespace) | ✅ 全 namespace default deny + L7 (Cilium) |
| API Key Proxy | ✅ Day 1 (基础) | ✅ 增强 (rate limit + 异常检测) | ✅ HA + 多区域 |
| Secret 管理 | k8s Secrets | External Secrets (GCP SM) | Workload Identity |
| 审计日志 | GKE Audit (默认) | + BigQuery export | + SIEM 集成 |
| 异常检测 | 手动告警 | Prometheus 规则 (阈值) | ML-based (per-user baseline) |
| DDoS 防护 | -- | 评估 | Cloud Armor WAF |
| 渗透测试 | 手动 | 自动化检查 (CI/CD) | 季度第三方审计 |

---

## 4. Phase 1: 小规模生产 (<=50 用户)

**目标**: 从 docker-compose 过渡到 GKE Autopilot，验证端到端流程可用，建立 k8s 化的安全基线。

**并发模型**: 50 DAU, ~5-10 并发会话

**关键决策**: Phase 1 **必须**包含 Sandbox Scheduler + API Key Proxy（Battle 裁决 #1, 2:1 通过）。理由: GKE Autopilot 强制 gVisor，Docker-in-container 无法运行，没有 Scheduler = 没有沙箱执行能力；安全不能分阶段，从 Day 1 起 Pod 内零 API key。折中方案: Phase 1 的 Scheduler 是最简版本（无 Warm Pool、无高级调度），只实现 Pod CRUD + session registry。

---

### 4.1 架构图

```
                         Internet (用户浏览器)
                              |
                              v
                    +-----------------------+
                    |    GKE Gateway API    |
                    |  *.yourdomain.com     |
                    |  *.preview.domain.com |
                    |  (TLS termination)    |
                    +----------+------------+
                               |
              +----------------+----------------+
              |                |                |
        +-----+------+  +-----+------+  +------+-----+
        | frontend   |  | api-server |  | HTTPRoute  |
        | Deploy x2  |  | Deploy x2  |  | (preview   |
        | (静态+SSR) |  | (FastAPI)  |  |  路径路由) |
        +------------+  +-----+------+  +------+-----+
                              |                |
                    +---------+---------+      |
                    |  Memorystore Redis |      |
                    |  (Basic, 1GB)     |      |
                    +---------+---------+      |
                              |                |
        +-----+------+  +----+----------+     |
        | vi-realtime |  | nanoclaw-orch |     |
        | Deploy x2   |  | Deploy x2     |     |
        | (LiveKit    |  | (纯调度器,   |     |
        |  Agent)     |  |  无 Docker)  |     |
        +-------------+  +----+----------+     |
                               |               |
                          HTTP POST            |
                               |               |
                        +------+--------+      |
                        | sandbox-sched |      |
                        | Deploy x1     |      |
                        +------+--------+      |
                               | k8s API       |
                        +------+--------+      |
                        | sandbox-pod   |      |
                        | (动态 0-10)   +------+
                        | gVisor 隔离   |  (preview :3000)
                        | emptyDir+GCS  |
                        +------+--------+
                               |
                        +------+--------+
                        | api-key-proxy |
                        | Deploy x1     |
                        | (session      |
                        |  token→真key) |
                        +------+--------+
                               |
                     +---------+---------+
                     |                   |
              +------+--------+   +------+--------+
              | Cloud SQL     |   | 外部 AI API   |
              | (db-f1-micro) |   | (Anthropic,   |
              |               |   |  Google)      |
              +---------------+   +---------------+
```

**服务间通信流**:

```
用户浏览器 --WebRTC--> vi-realtime --Redis PUB/SUB--> nanoclaw-orch
                                                          |
                                                     HTTP POST
                                                     /sessions
                                                          |
                                                          v
                                                   sandbox-scheduler
                                                          |
                                                     k8s API
                                                     (创建 Pod)
                                                          |
                                                          v
                                                     sandbox-pod
                                                          |
                                              +-----------+-----------+
                                              |                       |
                                         Redis PUBLISH          HTTP (preview)
                                         vi:stream:{uid}        :3000
                                              |                       |
                                              v                       v
                                         api-server              Gateway API
                                              |                  HTTPRoute
                                              v
                                         用户浏览器 (SSE/WS)
```

---

### 4.2 服务清单

| 服务 | k8s 资源类型 | Replicas | CPU Req/Limit | Mem Req/Limit | 引入理由 |
|------|-------------|----------|---------------|---------------|---------|
| frontend | Deployment | 2 | 0.1/0.5 vCPU | 128Mi/512Mi | Day 1 核心，静态资源 + Vite SSR |
| api-server | Deployment | 2 | 0.25/1 vCPU | 256Mi/1Gi | Day 1 核心，用户 API + 会话管理 + PostgreSQL |
| vi-realtime | Deployment | 2 | 0.5/2 vCPU | 512Mi/2Gi | Day 1 核心，WebRTC 语音/视频 + Gemini Native Audio |
| nanoclaw-orchestrator | Deployment | 2 | 0.25/1 vCPU | 256Mi/1Gi | Day 1 核心，任务调度（改造后无状态，不再管理 Docker） |
| sandbox-scheduler | Deployment | 1 | 0.25/0.5 vCPU | 256Mi/512Mi | **Phase 1 新增**，Pod 生命周期管理（Battle 裁决必须引入） |
| api-key-proxy | Deployment | 1 | 0.1/0.25 vCPU | 64Mi/128Mi | **Phase 1 新增**，Zero Trust key 管理（安全不分阶段） |
| sandbox-pod | Pod (动态) | 0-10 | 1/2 vCPU | 1Gi/4Gi | 动态创建，Per-Session，gVisor 隔离 |
| Cloud SQL (PostgreSQL) | Managed | 1 (db-f1-micro) | - | - | 托管，单实例足够 50 用户 CRUD |
| Memorystore (Redis) | Managed | 1 (Basic, 1GB) | - | - | 托管，PUB/SUB + State 混合使用 |
| GCS Bucket | Managed | - | - | - | 用户项目持久化，路径隔离 gs://bucket/{userId}/ |

**Phase 1 新增服务说明**:

- **sandbox-scheduler**: 这是整个 k8s 化的核心新服务。即使 50 用户也需要它，因为 GKE Autopilot 强制使用 gVisor sandbox 环境，Docker-in-container 模式无法在 Autopilot 上运行。NanoClaw 不再直接管理 Docker，必须通过 Scheduler 创建 Pod。没有 Scheduler = 没有沙箱执行能力。开发量约 ~3 天（AI 辅助），核心只需实现 Pod CRUD + session registry。

- **api-key-proxy**: 安全不能分阶段（security-ops 在 Battle 中支持 infra-architect）。从 Day 1 起 sandbox Pod 内零 API key。实现简单（~200 行代码的 HTTP reverse proxy），但消除了整个 key 泄露攻击面。即使 prompt injection 让 Claude Code 打印环境变量，拿到的也是无法在集群外使用的 session token。

**不在 Phase 1 引入的服务及理由**:

| 不引入的服务 | 理由 |
|-------------|------|
| Warm Pool | 10 个并发 sandbox 不需要预热，冷启动 30s 在 50 用户场景可接受。用户数少，等待时间可容忍。引入 Warm Pool 增加 Scheduler 复杂度（需要后台 replenisher + 动态调整算法），Phase 1 应聚焦架构验证而非性能优化。 |
| Redis 拆分 (Realtime vs State) | 单实例 Redis 1GB 足够支撑 50 用户。PUB/SUB 通道 ~10 个 + session state ~10 条 + 任务状态，总内存使用 <100MB。拆分的触发点是 200 并发时 PUB/SUB CPU 消耗与 KV 操作竞争。 |
| 独立监控栈 (Prometheus/Grafana) | GKE 内置 Cloud Monitoring + Cloud Logging 零额外部署，对 50 用户规模完全够用。自建监控栈需要 2-3 个额外 Pod，增加运维负担和成本。当需要自定义 metrics 和深度排查时（Phase 2, 1000 用户）再引入。 |
| CDN | 50 用户的前端流量极小，Gateway 直接 serve 即可。CDN 在 1000 用户时才有意义（减少 Gateway 负载 + 全球加速）。 |
| Service Mesh (Istio/Linkerd) | 核心服务只有 6 个 + sandbox pods，通信主要通过 Redis PUB/SUB（异步），不是直接 HTTP 调用链。Service Mesh 的 sidecar 对 sandbox pods 资源开销不可接受。 |

---

### 4.3 新增服务详解

#### 4.3.1 Sandbox Scheduler（最简版）

**定位**: k8s 化的核心新服务。NanoClaw Orchestrator 不再直接管理 Docker 容器，所有 Pod 生命周期操作统一通过 Scheduler HTTP API。Scheduler 是 NanoClaw 与 k8s 之间的抽象层——NanoClaw 不感知 k8s API，只知道 HTTP 接口。

**技术栈**: TypeScript（与 NanoClaw 统一技术栈，便于共享类型和工具链），使用 `@kubernetes/client-node` 操作 k8s API。

**Phase 1 功能范围**:
- Pod CRUD（创建、查询、删除）
- Session Registry（Redis-backed，userId → podIP 映射）
- Idle Reaper（超时 Pod 自动清理）
- Health check（暴露系统状态）
- **不包含**: Warm Pool、高级调度、Spot 处理、分片

**代码位置**: `sandbox-scheduler/` (新目录)

```
sandbox-scheduler/
├── src/
│   ├── index.ts              # HTTP server 入口
│   ├── api/
│   │   ├── sessions.ts       # POST/GET/DELETE /sessions
│   │   └── health.ts         # GET /health
│   ├── core/
│   │   ├── session-registry.ts   # Redis-backed session registry
│   │   ├── pod-manager.ts        # k8s API: create/delete/watch Pod
│   │   └── idle-reaper.ts        # 超时 Pod 清理
│   ├── k8s/
│   │   ├── client.ts             # @kubernetes/client-node 封装
│   │   └── pod-template.ts       # Pod spec 构建器
│   └── types.ts
├── Dockerfile
├── package.json
└── tsconfig.json
```

**API 合约**（已在架构讨论 Part 6 中锁定）:

```typescript
// POST /sessions — 创建或获取用户 sandbox
interface CreateSessionRequest {
  userId: string;
  projectId?: string;
  tier: 'free' | 'pro' | 'enterprise';
  timeout?: number;  // idle timeout, 秒, 默认 300
}

interface CreateSessionResponse {
  sessionId: string;
  podEndpoint: string;  // "10.0.1.5:8080" — Pod 内部 IP + task-server 端口
  status: 'starting' | 'ready' | 'active';
  ttl: number;  // 剩余空闲超时, 秒
}

// GET /sessions/:sessionId — 查询会话状态
interface GetSessionResponse {
  sessionId: string;
  userId: string;
  podEndpoint: string;
  status: 'starting' | 'ready' | 'active' | 'idle' | 'draining';
  createdAt: string;
  lastActivity: string;
  ttl: number;
}

// DELETE /sessions/:sessionId — 释放会话, 触发 cloud-sync + Pod 销毁
// POST /sessions/:sessionId/keepalive — 延长 idle timeout
// GET /health — 健康检查 + 系统状态 (活跃 Pod 数, 空闲 Pod 数)
```

**Pod 生命周期状态机**:

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    v                                              │
              +-----------+    cloud-sync     +----------+        │
  POST        | STARTING  | ──完成恢复────>  | READY    |        │
  /sessions   | (Pod 创建 |                  | (等待    |        │
  ──────────> |  中, cloud|                  |  任务)   |        │
              |  -sync    |                  +----+-----+        │
              |  下载中)  |                       |              │
              +-----+-----+                  POST /task          │
                    |                             |              │
                    | Pod 创建                    v              │
                    | 失败              +---------+--------+    │
                    v                   | ACTIVE           |    │
              +-----------+             | (正在执行编程    |    │ 新任务
              | DELETED   |             |  任务, 用户     |    │ 到达
              | (清理完成)|             |  在线交互中)    |    │
              +-----------+             +---------+--------+    │
                    ^                             |              │
                    |                        任务完成            │
                    |                        无新任务            │
                    |                             |              │
                    |                             v              │
                    |                   +---------+--------+    │
                    |                   | IDLE             |────┘
                    |                   | (空闲等待中,     |
                    |                   |  倒计时 timeout) |
                    |                   +---------+--------+
                    |                             |
                    |                        超过 idle
                    |                        timeout
                    |                             |
                    |                             v
                    |                   +---------+--------+
                    +───────────────────| DRAINING         |
                       cloud-sync      | (正在上传用户    |
                       完成 +          |  数据到 GCS,    |
                       Pod 销毁        |  不接受新任务)  |
                                       +------------------+
```

**各状态转换详解**:

| 转换 | 触发条件 | 操作 | 说明 |
|------|---------|------|------|
| → STARTING | `POST /sessions` 请求到达 | Scheduler 通过 k8s API 创建 Pod，Pod 内 task-server 启动并执行 cloud-sync 从 GCS 下载用户项目数据 | 冷启动约 30s（含镜像拉取 + cloud-sync），Phase 1 可接受 |
| STARTING → READY | task-server `/health` 返回 200 且 cloud-sync 完成 | Scheduler 更新 session registry 状态为 ready，返回 podEndpoint 给调用方 | Scheduler 使用 k8s Pod readinessProbe 判断 Pod 就绪 |
| STARTING → DELETED | Pod 创建失败（镜像拉取错误、资源不足、gVisor 不可用） | 清理残留资源，返回错误给调用方 | 记录失败原因到监控告警 |
| READY → ACTIVE | NanoClaw Orchestrator 通过 `HTTP POST pod:8080/task` 发送编程任务 | task-server 开始执行 Claude Code SDK，结果通过 Redis 直发给 api-server | 一个 Pod 同一时间只执行一个任务（单通道） |
| ACTIVE → IDLE | 任务完成且无新任务到达 | Idle Reaper 开始计时（默认 300s） | lastActivity 时间戳更新 |
| IDLE → ACTIVE | 新任务到达（`POST /sessions/:id/keepalive` 或新的 `/task`） | 重置 idle timeout，继续执行 | 用户在同一会话中发起新的编程请求 |
| IDLE → DRAINING | 超过 idle timeout（Idle Reaper 每 30s 扫描一次） | 触发 cloud-sync 上传用户数据到 GCS，停止接受新任务 | 通知 session registry 标记为 draining |
| DRAINING → DELETED | cloud-sync 完成 | Scheduler 通过 k8s API 删除 Pod，清理 session registry，删除 session token | Pod 物理销毁，emptyDir 数据消失 |

**Session Registry 实现**:

```typescript
// Redis Hash 存储
// Key: sandbox:sessions:{userId}
// Fields: sessionId, podIP, status, lastActivity, tier, podName

// 示例:
// HSET sandbox:sessions:user-123 sessionId sess-abc podIP 10.0.1.5
//   status active lastActivity 1710100000 tier pro podName sandbox-user-123-abc
```

**Idle Reaper 逻辑**:

```typescript
// 每 30 秒扫描一次所有 session
// 检查 lastActivity + timeout < now
// 超时的 session 触发 DRAINING 流程
setInterval(async () => {
  const sessions = await getAllSessions();
  for (const session of sessions) {
    if (session.status === 'idle' && Date.now() - session.lastActivity > session.timeout * 1000) {
      await drainSession(session.sessionId);
    }
  }
}, 30_000);
```

#### 4.3.2 API Key Proxy

**定位**: Zero Trust 安全核心组件。Sandbox Pod 内永远不持有真实的 AI API key。所有到外部 AI API（Anthropic、Google）的请求都经过 Proxy，Proxy 验证 session token 后注入真实 key。

**技术栈**: Node.js（Battle 裁决 #4: Phase 1 用自定义 Node.js，简单直接，150-300 行代码。Envoy + Lua 需要学习 Envoy 配置语法，团队不熟悉。）

**完整请求流**:

```
                                        外部 AI API
                                     (api.anthropic.com)
                                            ^
                                            | Step 3: HTTPS
                                            | x-api-key: sk-ant-真实key
                                            |
+-------------------------------------------+------------------------------------------+
|                    API Key Proxy (Node.js)                                            |
|                    Namespace: vi-core                                                 |
|                    Replicas: 1 (Phase 1)                                              |
|                                                                                       |
|  Step 2: 请求处理流水线                                                               |
|                                                                                       |
|  +--------------+   +--------------+   +--------------+   +-------------------+      |
|  | 2a. 验证     |   | 2b. 验证     |   | 2c. 替换     |   | 2d. 记录          |      |
|  | 来源 IP      |-->| session      |-->| Auth header  |-->| usage 到          |      |
|  | (sandbox     |   | token        |   | (注入真实    |   | Redis             |      |
|  |  CIDR 内)    |   | (Redis GET)  |   |  API key)    |   | (审计+成本追踪)   |      |
|  +--------------+   +--------------+   +--------------+   +-------------------+      |
|                                                                                       |
|  Step 4: 响应回传                                                                     |
|  +--------------+   +--------------+                                                  |
|  | 4a. 解析     |   | 4b. 记录     |                                                  |
|  | usage 字段   |-->| token 消耗   |                                                  |
|  | (tokens)     |   | (Redis INCR) |                                                  |
|  +--------------+   +--------------+                                                  |
+-------------------------------------------+------------------------------------------+
                                            ^
                                            | Step 1: HTTPS
                                            | x-api-key: sess-abc123 (session token)
                                            |
+-------------------------------------------+------------------------------------------+
|  Sandbox Pod                                                                          |
|  环境变量:                                                                            |
|    ANTHROPIC_BASE_URL = https://api-key-proxy.vi-core.svc:443                        |
|    ANTHROPIC_API_KEY  = sess-abc123def  (临时 session token, 非真 key)               |
|                                                                                       |
|  Claude Code SDK 原生支持 ANTHROPIC_BASE_URL, 零代码修改                             |
+-----------------------------------------------------------------------------------+
```

**Step-by-step 请求流程**:

```
Step 1: Claude Code SDK 发起 API 调用
   Sandbox Pod → HTTPS POST https://api-key-proxy.vi-core.svc/v1/messages
   Headers:
     x-api-key: sess-abc123def  (session token, 不是真 key)
     anthropic-version: 2023-06-01
     content-type: application/json
   Body: { model: "claude-sonnet-4-6-20250514", messages: [...] }

Step 2a: 验证来源 IP
   Proxy 检查 source IP 是否在 sandbox Pod CIDR 范围内 (10.x.x.x/16)
   → 不在范围 → 403 Forbidden + 立即告警（可能是攻击尝试）
   → 在范围 → 继续

Step 2b: 验证 session token
   提取 x-api-key header 中的 session token: "sess-abc123def"
   Redis GET session:abc123def
   → 不存在 → 401 Unauthorized + 告警（token 过期或伪造）
   → 存在 → 获取 {userId, tier, podIP, createdAt}
   额外验证: session 中记录的 podIP 是否与请求来源 IP 匹配
   → 不匹配 → 401 + 严重告警（可能的 token 窃取）

Step 2c: 替换 Auth header
   移除原始 x-api-key header (session token)
   注入真实 key: x-api-key: sk-ant-api03-real-key-xxx
   真实 key 来源: k8s Secret（启动时加载到内存，不写磁盘）

Step 2d: 记录 usage
   Redis INCR ratelimit:{userId}:{minute}  (rate limiting)
   → 超限 → 429 Too Many Requests

Step 3: 转发请求到上游
   → api.anthropic.com/v1/messages
   Headers: x-api-key: sk-ant-api03-real-key-xxx (真实 key)
   使用 HTTP 反向代理转发（保持 streaming 支持）

Step 4a: 上游响应回传
   Proxy 收到 200 OK + streaming response
   解析 response headers: 提取 x-ratelimit-* headers
   从 usage 字段提取 input_tokens / output_tokens

Step 4b: 记录 token 消耗
   Redis INCRBY usage:{userId}:{date}:input {input_tokens}
   Redis INCRBY usage:{userId}:{date}:output {output_tokens}
   Redis INCRBY usage:{userId}:{date}:requests 1

Step 5: Sandbox Pod 接收响应
   Claude Code SDK 正常处理，完全不感知 Proxy 的存在
   从 SDK 角度看, 它以为自己在直接调用 api.anthropic.com
```

**Session Token 生命周期**:

```
创建 (Scheduler 创建 Pod 时):
  1. Scheduler 生成 crypto-random session token (128-bit, 不可预测)
  2. Redis HSET session:{token} userId {uid} tier {tier} podIP {ip} createdAt {ts}
  3. Token 注入 Pod 环境变量: ANTHROPIC_API_KEY=sess-{token}
  4. Redis EXPIRE session:{token} {idle_timeout + 300}  (TTL = idle超时 + 5分钟buffer)

续期 (每次 API 调用时):
  Proxy 自动 EXPIRE session:{token} {ttl}
  → 只要 Pod 活跃(有 API 调用), token 不过期

失效 — 正常流程:
  Pod 进入 DRAINING → Scheduler 通知 → Redis DEL session:{token}
  → 后续使用该 token 的请求立即 401

失效 — 异常流程:
  Pod 异常退出 → Redis TTL 自然过期 (5 分钟后)
  → 期间该 token 的请求被接受但无法到达 Pod
  → Proxy 检测到 upstream 不可达 → 503 + token 标记无效
```

**Session Token 安全保证**:

- **不可预测**: Token 是 crypto-random（128-bit），使用 `crypto.randomBytes(16).toString('hex')`，暴力破解需要 2^128 次尝试
- **不可解码**: Token 不是 JWT，不包含任何用户信息，无法从 token 反推 userId 或 tier
- **不可持久化**: Token 只存在于 Redis 内存中，不写入磁盘、不存入数据库、不出现在日志中
- **绑定 Pod**: 一个 Pod = 一个 Token = 一个用户。Token 与 Pod IP 绑定，Proxy 验证 source IP 与 token 中记录的 podIP 匹配
- **生命周期有限**: Token 生命周期 = Pod 生命周期。Pod 销毁后 token 最多存活 5 分钟（Redis TTL buffer）
- **集群内有效**: Token 只在 api-key-proxy 集群内部 Service 上有效，在集群外部（如 api.anthropic.com）完全无意义
- **即使泄露也安全**: 即使 prompt injection 让 Claude Code 打印 `ANTHROPIC_API_KEY` 环境变量，拿到的是 `sess-abc123def`，不是真实 key

---

### 4.4 部署策略

**策略**: 所有服务使用 k8s 默认的 Rolling Update。

**为什么 Phase 1 只用 Rolling Update**: 50 用户，中断几秒可以接受。Rolling Update 零额外成本、零额外复杂度。蓝绿部署需要双倍资源（同时运行两套），Canary 需要流量分割配置，对 50 用户规模都是过度设计。

```yaml
# 所有 Deployment 的默认策略
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
```

**各服务部署配置**:

| 服务 | 策略 | maxUnavailable | maxSurge | 特殊处理 |
|------|------|---------------|----------|---------|
| frontend | Rolling | 0 | 1 | 零停机: 先起新 Pod 再杀旧 Pod。静态资源有缓存，切换无感知 |
| api-server | Rolling | 1 | 1 | preStop hook: 等待活跃 HTTP 请求完成（gracePeriod: 30s） |
| vi-realtime | Rolling | 0 | 1 | **preStop: 优雅断连**（标记 draining，不接新连接，等现有会话结束） |
| nanoclaw-orch | Rolling | 1 | 1 | 无状态，标准滚动更新即可 |
| sandbox-scheduler | Rolling | 0 | 1 | 零停机: Scheduler 不可中断，否则新 Pod 创建请求会失败 |
| api-key-proxy | Rolling | 0 | 1 | 零停机: 中断 = 所有 AI 功能不可用 |

**vi-realtime 的特殊 preStop 处理**:

```yaml
spec:
  terminationGracePeriodSeconds: 1800  # 30分钟, 等待活跃 WebRTC 会话结束
  containers:
  - name: vi-realtime
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "touch /tmp/draining && sleep 1800"]
```

```
preStop 流程:
  1. 标记 Pod 为 draining (创建 /tmp/draining 文件, 应用检测后不接新连接)
  2. LiveKit 自动将新用户路由到其他 Agent Pod
  3. 等待现有会话自然结束 (terminationGracePeriodSeconds: 1800, 最长 30 分钟)
  4. 超时强制关闭 (SIGKILL, 通知客户端重连)
```

**为什么 vi-realtime 需要特殊处理**: WebRTC 连接是有状态的长连接。如果直接 kill Pod，正在进行的语音对话会被打断——用户正在和 AI 说话，突然断线，体验极差。即使 50 用户规模，也要保证优雅断连。

**Rollback 流程**:

```bash
# 查看部署历史
kubectl rollout history deployment/api-server

# 回滚到上一个版本
kubectl rollout undo deployment/api-server

# 回滚到指定版本
kubectl rollout undo deployment/api-server --to-revision=3

# 查看回滚状态
kubectl rollout status deployment/api-server
```

Phase 1 不需要更复杂的回滚机制（如 Canary 回滚、蓝绿切换）。`kubectl rollout undo` 足够快（秒级），50 用户的影响范围小。

---

### 4.5 GKE 配置

#### GKE Autopilot 集群 Terraform 配置

```hcl
# infra/terraform/main.tf

# VPC 网络 (私有集群)
resource "google_compute_network" "vpc" {
  name                    = "vi-agent-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "vi-agent-subnet"
  ip_cidr_range = "10.0.0.0/16"
  region        = "us-central1"
  network       = google_compute_network.vpc.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

# GKE Autopilot 集群
resource "google_container_cluster" "vi_agent" {
  name     = "vi-agent-prod"
  location = "us-central1"

  # Autopilot 模式: 自动管理节点, 强制 gVisor sandbox, 自动升级
  enable_autopilot = true

  # Release channel: REGULAR (平衡稳定性和功能)
  release_channel {
    channel = "REGULAR"
  }

  # 私有集群配置
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # 网络配置
  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.subnet.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
}

# Cloud SQL (PostgreSQL)
resource "google_sql_database_instance" "postgres" {
  name             = "vi-agent-postgres"
  database_version = "POSTGRES_16"
  region           = "us-central1"

  settings {
    tier              = "db-f1-micro"  # Phase 1 最小规格, ~$10/月
    availability_type = "ZONAL"        # Phase 1 不需要 HA

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled = true
    }
  }
}

# Memorystore (Redis)
resource "google_redis_instance" "redis" {
  name           = "vi-agent-redis"
  tier           = "BASIC"       # Phase 1 无需 HA (Standard 有 replica)
  memory_size_gb = 1             # 50 用户足够
  region         = "us-central1"

  authorized_network = google_compute_network.vpc.id

  redis_version = "REDIS_7_0"
}
```

**为什么选择 Autopilot 而非 Standard** (成本分析):

Autopilot 的核心优势在于: 零节点管理 + 强制 gVisor（免费获得沙箱隔离）+ 自动升级。对于小团队来说，省下的运维时间远大于可能多出的成本。

Battle 裁决 #2: Phase 1-3 全程 Autopilot（2:0 通过）。切换到 Standard 的真正时机是: (1) 需要 GPU Node Pool, (2) 需要自定义 DaemonSet, (3) 月度计算成本 >$100K 且有专职 SRE 团队。Phase 3 (10K 用户) 切到 Standard 每月只省约 $500，不值得运维成本。

#### Namespace 设计

```
vi-agent-cluster
  |
  +-- namespace: vi-core
  |     api-server          — 用户 API + 会话管理
  |     nanoclaw-orchestrator — 任务调度 (无状态)
  |     sandbox-scheduler   — Pod 生命周期管理
  |     api-key-proxy       — AI API key 代理
  |
  +-- namespace: vi-realtime
  |     vi-realtime         — WebRTC 语音/视频
  |     (独立 namespace: 需要独立的 HPA 策略和 PDB,
  |      terminationGracePeriod 与其他服务不同)
  |
  +-- namespace: vi-sandbox
  |     sandbox-pod (动态创建, 0-10 个)
  |     (独立 namespace: NetworkPolicy 隔离 + ResourceQuota 限制)
  |
  +-- namespace: vi-frontend
  |     frontend            — React/Vite 前端
  |
  +-- namespace: vi-system
        GKE 系统组件, Gateway controller
```

**为什么 sandbox 独立 namespace** (这是安全架构的关键设计):

1. **NetworkPolicy 隔离**: sandbox pods 只能访问 Redis 和 api-key-proxy，不能访问 api-server、nanoclaw-orchestrator、Cloud SQL 等服务。独立 namespace 让 NetworkPolicy 规则更简洁、更安全（default deny + 白名单）
2. **ResourceQuota 限制**: 限制 vi-sandbox namespace 的总资源使用量，防止 sandbox pods 雪崩式增长耗尽集群资源。即使 Scheduler 出 bug 疯狂创建 Pod，也不会影响核心服务
3. **RBAC 最小权限**: sandbox-scheduler 的 ServiceAccount 只需要 vi-sandbox namespace 的 Pod CRUD 权限，不能操作其他 namespace 的资源
4. **审计追踪**: 独立 namespace 方便追踪 sandbox 相关的资源消耗和事件。GKE Audit Log 可以按 namespace 过滤

#### ResourceQuota YAML

```yaml
# vi-sandbox namespace — Phase 1
apiVersion: v1
kind: ResourceQuota
metadata:
  name: sandbox-quota
  namespace: vi-sandbox
spec:
  hard:
    requests.cpu: "20"          # 最多 10 pods x 2 vCPU
    requests.memory: "40Gi"     # 最多 10 pods x 4Gi
    limits.cpu: "20"            # CPU limits 与 requests 对齐
    limits.memory: "40Gi"       # Memory limits 与 requests 对齐
    pods: "15"                  # 10 active + 5 buffer (防止创建/销毁竞态)
    ephemeral-storage: "100Gi"  # 10 pods x 10Gi emptyDir
```

**为什么设置这些值**: Phase 1 最多 50 用户，按 20% 同时在线率 = ~10 并发会话。每个 sandbox Pod 需要 2 vCPU + 4Gi（AI 编程任务是 CPU 和内存密集型）。ResourceQuota 的 pods: 15 留了 5 个 buffer，用于 Pod 创建/销毁过程中的竞态（旧 Pod 还在 DRAINING，新 Pod 已经 STARTING）。

#### LimitRange YAML

```yaml
# vi-sandbox namespace — 每个 sandbox Pod 的默认限制
apiVersion: v1
kind: LimitRange
metadata:
  name: sandbox-limits
  namespace: vi-sandbox
spec:
  limits:
  - type: Pod
    max:
      cpu: "2"                    # 单 Pod 最大 2 vCPU
      memory: "4Gi"               # 单 Pod 最大 4Gi
      ephemeral-storage: "10Gi"   # 单 Pod 最大 10Gi emptyDir
    min:
      cpu: "500m"                 # 单 Pod 最小 0.5 vCPU
      memory: "1Gi"               # 单 Pod 最小 1Gi
  - type: Container
    default:
      cpu: "1"                    # 容器默认 1 vCPU
      memory: "2Gi"               # 容器默认 2Gi
    defaultRequest:
      cpu: "1"                    # 容器默认请求 1 vCPU
      memory: "2Gi"               # 容器默认请求 2Gi
```

**为什么需要 LimitRange**: 防止单个 sandbox Pod 请求过多资源（比如 bug 导致 memory request 设为 100Gi），也防止过少（0.1 vCPU 跑不动 Claude Code SDK）。LimitRange 是 ResourceQuota 的补充——前者限制单个 Pod，后者限制整个 namespace。

#### Autopilot 特定配置

```yaml
# Sandbox Pod 模板中的 Autopilot 特定配置

# 1. Spot Pod (Phase 1 全部 Spot, 50 用户容忍偶尔中断)
spec:
  nodeSelector:
    cloud.google.com/gke-spot: "true"
  tolerations:
  - key: cloud.google.com/gke-spot
    operator: Equal
    value: "true"
    effect: NoSchedule

# 2. Compute Class (Autopilot 特有, 影响底层硬件选择)
spec:
  nodeSelector:
    cloud.google.com/compute-class: "Scale-Out"  # sandbox pods: 高密度, 低成本
    # 常驻服务使用 "General-Purpose": 平衡性能和成本

# 3. gVisor 在 Autopilot 中的配置
# Autopilot 默认对所有工作负载启用 gVisor sandbox
# 无需额外 RuntimeClass 配置 — 这是 Autopilot 的核心安全优势
# 不需要写任何 RuntimeClass YAML, 不需要手动配置 Node Pool
```

**为什么 Phase 1 就用 Spot**: sandbox pods 是临时的（生命周期 = 用户会话），有 cloud-sync 保底（数据在 GCS 中持久化）。Spot 被回收时，25s 内触发 cloud-sync 上传，数据不丢失。50 用户场景下 Spot 被回收的概率本身就低（Google 通常在高峰时段回收），即使回收，用户等待新 Pod 重建 + cloud-sync 恢复 ~35s，可接受。

---

### 4.6 网络

#### Gateway API 配置

```yaml
# Gateway 资源定义
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: vi-gateway
  namespace: vi-system
  annotations:
    networking.gke.io/certmap: vi-cert-map  # Google-managed TLS certs
spec:
  gatewayClassName: gke-l7-global-external-managed
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      options:
        networking.gke.io/cert-manager-certs: vi-wildcard-cert
  - name: http-redirect
    protocol: HTTP
    port: 80
    # 自动 redirect to HTTPS
---
# api-server 路由
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: vi-core
spec:
  parentRefs:
  - name: vi-gateway
    namespace: vi-system
  hostnames:
  - "api.yourdomain.com"
  rules:
  - backendRefs:
    - name: api-server
      port: 8000
---
# frontend 路由
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: frontend-route
  namespace: vi-frontend
spec:
  parentRefs:
  - name: vi-gateway
    namespace: vi-system
  hostnames:
  - "app.yourdomain.com"
  rules:
  - backendRefs:
    - name: frontend
      port: 80
---
# vi-realtime WebSocket 路由
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: realtime-route
  namespace: vi-realtime
spec:
  parentRefs:
  - name: vi-gateway
    namespace: vi-system
  hostnames:
  - "ws.yourdomain.com"
  rules:
  - backendRefs:
    - name: vi-realtime
      port: 7880
```

#### Preview 路由策略

**Phase 1 使用路径前缀方案（不是子域名）**:

```
preview.yourdomain.com/{sessionId}/*  -->  sandbox-pod:3000
```

**为什么 Phase 1 用路径前缀而非子域名**:
1. 只有 <10 个并发 sandbox，不需要通配符 DNS + 动态 HTTPRoute
2. 路径前缀方案只需要一条静态 HTTPRoute 规则
3. 子域名方案需要 DNS 通配符 `*.preview.yourdomain.com`，且每个 sandbox 需要动态创建 HTTPRoute（GKE 上 ~10-30s 生效）
4. 某些前端框架对路径前缀不友好，但 50 用户场景可以接受偶发问题
5. Phase 2 升级到子域名路由，配合 Warm Pool 预创建 HTTPRoute 池

```yaml
# Phase 1 Preview 路由 (路径前缀)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: preview-route
  namespace: vi-sandbox
spec:
  parentRefs:
  - name: vi-gateway
    namespace: vi-system
  hostnames:
  - "preview.yourdomain.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /
    backendRefs:
    - name: sandbox-router  # 一个轻量路由服务, 按 URL 中的 sessionId 转发到对应 Pod
      port: 8080
```

#### NetworkPolicy YAML

```yaml
# sandbox-pod-isolation.yaml — Phase 1 完整 NetworkPolicy
# 这是安全架构的核心: 限制 sandbox pod 的所有网络访问
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sandbox-pod-isolation
  namespace: vi-sandbox
spec:
  podSelector: {}  # 应用于 vi-sandbox 命名空间中的所有 Pod
  policyTypes:
  - Ingress       # 控制谁可以连入 sandbox pod
  - Egress        # 控制 sandbox pod 可以连出到哪里

  ingress:
    # 规则 1: 允许 nanoclaw-orchestrator 的 HTTP 调用 (发送编程任务)
    # 为什么: NanoClaw 需要通过 HTTP POST 将任务发送到 sandbox pod 的 task-server
    - from:
      - namespaceSelector:
          matchLabels:
            name: vi-core
        podSelector:
          matchLabels:
            app: nanoclaw-orchestrator
      ports:
      - port: 8080        # task-server 端口
        protocol: TCP

    # 规则 2: 允许 Gateway (preview 访问, 用户浏览器查看编程结果)
    # 为什么: 用户通过 preview.domain.com/{sessionId}/ 查看 sandbox 中运行的 web 应用
    - from:
      - namespaceSelector:
          matchLabels:
            name: vi-system
      ports:
      - port: 3000        # preview 端口 (用户项目的 dev server)
        protocol: TCP

  egress:
    # 规则 1: 允许访问 api-key-proxy (AI API 调用)
    # 为什么: sandbox pod 中的 Claude Code SDK 需要调用 AI API, 通过 Proxy 中转
    - to:
      - namespaceSelector:
          matchLabels:
            name: vi-core
        podSelector:
          matchLabels:
            app: api-key-proxy
      ports:
      - port: 443          # Proxy HTTPS 端口
        protocol: TCP

    # 规则 2: 允许访问 Redis (结果发布)
    # 为什么: sandbox pod 执行完任务后, 通过 Redis PUBLISH 将结果直接发送给 api-server
    # 这是 Plan C 通信方案的核心: Pod 内 HTTP task-server + Redis 直发结果
    - to:
      - ipBlock:
          cidr: 10.0.0.0/8  # Memorystore Redis 在 VPC 内网
      ports:
      - port: 6379
        protocol: TCP

    # 规则 3: 允许外部 HTTPS (npm install, 公共 API 等)
    # 为什么: AI 编程任务需要安装 npm 包、访问公共 API (如 GitHub)
    # 安全考量: 只允许 HTTPS (443), 禁止 HTTP; 禁止访问集群内网 (防止横向移动)
    - to:
      - ipBlock:
          cidr: 0.0.0.0/0
          except:
          - 10.0.0.0/8        # 禁止访问集群内网 (除 Redis 外)
          - 172.16.0.0/12     # 禁止访问 Docker 网络
          - 192.168.0.0/16    # 禁止访问私有网络
      ports:
      - port: 443
        protocol: TCP

    # 规则 4: 允许 DNS 解析
    # 为什么: 没有 DNS 解析, npm install 和所有外部 HTTPS 都无法工作
    - to: []
      ports:
      - port: 53
        protocol: UDP
      - port: 53
        protocol: TCP
```

**NetworkPolicy 的关键安全设计**:

- **默认全部拒绝**: policyTypes 包含 Ingress 和 Egress，未列出的所有连接都被拒绝
- **sandbox pod 不能连接 api-server**: 防止 sandbox 中的恶意代码直接调用用户 API
- **sandbox pod 不能连接 k8s API Server**: 防止容器逃逸后查询或操作集群资源
- **sandbox pod 不能连接其他 sandbox pod**: 防止跨用户横向移动
- **sandbox pod 不能连接集群内网**: except 子句禁止所有 RFC1918 地址（除显式允许的 Redis）
- **只允许 HTTPS 出站**: 禁止 HTTP 明文连接，防止中间人攻击

#### DNS 策略

```
Phase 1 DNS 配置:
  api.yourdomain.com      →  Gateway VIP (A record)
  app.yourdomain.com      →  Gateway VIP (A record)
  ws.yourdomain.com       →  Gateway VIP (A record)
  preview.yourdomain.com  →  Gateway VIP (A record)

  (Phase 2 会增加 *.preview.yourdomain.com 通配符记录)
```

---

### 4.7 安全

| 安全层 | Phase 1 配置 | 详细说明 |
|--------|-------------|---------|
| **gVisor RuntimeClass** | 启用 (Autopilot 默认) | GKE Autopilot 强制对所有工作负载启用 gVisor sandbox。gVisor 在用户空间拦截系统调用，即使 sandbox pod 中的代码尝试执行危险操作（如 `ptrace`、直接文件系统操作），也会被 gVisor 拦截。零配置、零成本。 |
| **API Key Proxy** | 启用 (Day 1) | Node.js 反向代理（~200 行代码），验证 session token + 注入真实 API key。Pod 内环境变量只有 `sess-{token}`，不是真 key。即使 prompt injection 成功读取环境变量，拿到的也是无效 token。 |
| **NetworkPolicy** | 启用 (基础) | Sandbox Pod 只允许出站到: api-key-proxy (443)、Redis (6379)、外部 HTTPS (443)。禁止访问集群内网、k8s API、其他 Pod。详见 4.6 节完整 YAML。 |
| **RBAC (3 个 ServiceAccount)** | 启用 (基础) | **sandbox-scheduler SA**: 只有 vi-sandbox namespace 的 Pod CRUD 权限（create/get/list/watch/delete pods）。**nanoclaw-orchestrator SA**: 只读 ConfigMap/Secret（读取配置）。**sandbox-pod SA**: 无任何 k8s 权限（零权限，最小原则）——sandbox pod 不需要也不应该能操作 k8s API。 |
| **Secret 管理** | k8s Secrets | `ANTHROPIC_API_KEY` 和 `GEMINI_API_KEY` 存储在 k8s Secret 中，只挂载到 API Key Proxy Pod。其他 Pod（包括 sandbox pod）无法读取这些 Secret。k8s Secret 是 base64 编码（不是加密），Phase 2 会迁移到 GCP Secret Manager。 |
| **审计日志** | GKE Audit Logging | 默认启用。重点关注: Pod 创建/删除事件（是否有异常创建）、Secret 访问事件（谁读了 API key Secret）、RBAC 变更事件。Phase 1 使用 Cloud Logging 查询，不需要额外工具。 |
| **用户数据隔离** | GCS 路径隔离 | `gs://vi-agent-data/{userId}/{projectId}/`。50 用户不做 per-user bucket policy（IAM 管理成本太高），靠应用层 userId 路径隔离。Per-Session Pod 确保物理隔离: 用户 A 的 Pod 无法访问用户 B 的 emptyDir 数据。 |

---

### 4.8 监控

**技术栈**: GKE 内置 Cloud Monitoring + Cloud Logging（零额外部署）

**为什么 Phase 1 不用 Prometheus**: Cloud Monitoring 已经覆盖 CPU/Memory/Disk/Network 等基础指标，且零运维。自建 Prometheus + Grafana 需要 2-3 个额外 Pod（Prometheus server、Grafana、Alertmanager），增加运维负担。50 用户场景下，Cloud Monitoring 的 5 条 critical alert 足够发现和定位问题。当需要自定义 metrics（如 per-user token 消耗）和深度排查时（Phase 2, 1000 用户），再引入 Prometheus。

**5 条 Critical 告警**:

| # | 告警名称 | 触发条件 | 动作 | 详细说明 |
|---|---------|---------|------|---------|
| 1 | **Sandbox Pod 创建失败率过高** | `rate(scheduler_pod_create_failures[5m]) / rate(scheduler_pod_create_total[5m]) > 0.1` (超过 10%) | Slack #ops-alerts | 可能原因: Autopilot 扩容慢（通常 2-5 分钟），镜像拉取失败（Artifact Registry 权限/网络），ResourceQuota 超限。如果持续失败，用户将无法执行任何 AI 编程任务。排查: `kubectl get events -n vi-sandbox --sort-by='.lastTimestamp'` |
| 2 | **API Key Proxy 错误率过高** | `rate(proxy_5xx_total[5m]) / rate(proxy_requests_total[5m]) > 0.05` (超过 5%) | Slack #ops-alerts + PagerDuty | Proxy 故障 = 所有 AI 功能不可用。可能原因: Pod OOM（增加内存 limit）、Redis 连接失败（检查 Memorystore）、上游 API 超时导致连接池耗尽。紧急修复: `kubectl rollout restart deploy/api-key-proxy -n vi-core` |
| 3 | **上游 AI API 延迟过高** | P99 延迟 > 30 秒 | Slack #ops-alerts | AI API 延迟直接影响用户体验——用户在等待编程结果。可能原因: Anthropic/Google API 端的限流或故障（检查 status.anthropic.com）、网络问题。如果是 API 端故障，只能等待恢复，同时向用户显示友好提示。 |
| 4 | **Redis 连接异常** | `redis_connected_clients == 0` 或 `redis_memory_used_bytes > redis_memory_max_bytes * 0.9` (内存 > 90%) | Slack #ops-alerts + PagerDuty | Redis 是所有服务间通信的枢纽。连接断开 = PUB/SUB 消息丢失 + session registry 不可用 + 新 Pod 无法创建。内存 > 90% = 即将 OOM，需要排查是否有 key 泄漏（TTL 未设置）。排查: `redis-cli INFO memory` + `redis-cli --bigkeys` |
| 5 | **GCS Cloud-Sync 失败** | `increase(cloud_sync_failures_total[10m]) > 3` (10 分钟内超过 3 次失败) | Slack #ops-alerts | cloud-sync 失败 = 用户数据丢失风险。Pod 销毁后 emptyDir 数据消失，如果 cloud-sync 未成功上传，用户的编程进展会丢失。可能原因: GCS IAM 权限变更、网络问题、磁盘写满。排查: 检查 sandbox pod 日志中的 cloud-sync 错误。 |

---

### 4.9 NanoClaw 改造详解

基于 verbatim-09 的深度代码审查（34 个文件），NanoClaw 在 k8s 化后的职责发生重大变化。核心思想是**冯·诺依曼分离**: 机制（Orchestrator 做路由调度）与内容（用户代码/数据在独立 Pod 中执行）彻底分开。

#### 去掉的职责

| # | 去掉的职责 | 原始位置 | 去掉原因 |
|---|-----------|---------|---------|
| 1 | **UserQueue 并发调度** | `user-queue.ts` | Scheduler 管 Pod 分配，Orchestrator 不再需要维护 per-user 队列。1 user = 0 或 1 active Pod（Realtime 单通道 + Redis per-user channel 天然限制） |
| 2 | **readSecrets() 读 API Key** | `container-runner.ts` | API Key Proxy 处理所有 key 注入。Orchestrator 进程中不再持有 `ANTHROPIC_API_KEY`，消除一个攻击面 |
| 3 | **Docker 容器生命周期管理** | `container-runtime.ts` (整个文件删除) | Scheduler 通过 k8s API 管理 Pod 生命周期。Docker binary 检测、orphan cleanup、stopContainer 等全部不再需要 |
| 4 | **stdin/stdout 协议 (CARD_OP:: 标记)** | `container-runner.ts` | HTTP POST to Pod:8080/task 替代 stdin JSON pipe。结果通过 Redis 直发 api-server，不经过 Orchestrator。CARD_OP_MARKER 协议不再需要 |

#### 保留的职责

| # | 保留的职责 | 文件 | 说明 |
|---|-----------|------|------|
| 1 | **监听 Redis 任务** | `channels/` | 继续订阅 `vi:exec:{userId}` 接收编程任务请求 |
| 2 | **包/技能解析** | `package-loader.ts` | 解析 skill prompt、gallery package 等，构建发给 Pod 的任务 payload |
| 3 | **发布到 Redis** (简化) | `channels/` | 部分场景仍需 Orchestrator 发布消息（如任务 dispatch 确认），但主要结果由 Pod 直接 PUBLISH |
| 4 | **上下文编译** | `context-compiler.ts` | 保留在 Orchestrator 或移入 Pod（决策 B: 移入 Pod，因为 Orchestrator 变成无状态后没有本地文件系统可读） |
| 5 | **意图预测** | `intention-predictor.ts` | 保留但必须改为 per-user (修复全局变量 bug，见下文隔离缺陷) |

#### 新增的职责

| # | 新增的职责 | 说明 |
|---|-----------|------|
| 1 | **HTTP 调用 Scheduler API** | `POST /sessions` 获取或创建用户的 sandbox Pod。取代原来的 `docker run` |
| 2 | **HTTP POST 任务到 Pod** | `POST pod:8080/task` 将编程任务发送到 sandbox pod 的 task-server。取代原来的 stdin JSON pipe |

#### 代码改动量估算

| 类型 | 行数 | 说明 |
|------|------|------|
| 去掉 | ~600 行 | `container-runtime.ts` 全部删除 (~200行), `container-runner.ts` 中 Docker 相关代码 (~300行), UserQueue 调度逻辑 (~100行) |
| 新增 | ~100 行 | `sandbox-client.ts` (HTTP 调用 Scheduler + Pod, ~80行), 配置变更 (~20行) |
| 修改 | ~50 行 | `intention-predictor.ts` 全局变量 → per-user Map, `executor.ts` 路由逻辑, imports 清理 |
| **净减少** | **~500 行** | NanoClaw 变得更简单——从"Docker 容器管理 + 任务调度 + 数据管道"简化为"纯 HTTP 路由器" |

#### 必须修复的隔离缺陷

基于 verbatim-09 代码审查发现的 3 个隔离缺陷，必须在 Phase 1 之前修复:

**缺陷 1: intention-predictor.ts 全局变量** (严重性: 中)

```typescript
// 当前 (有 bug):
let lastSceneHash: string | null = null;    // 全局, 不是 per-user!
let lastIntentions: PredictedIntention[] = []; // 全局!
// 用户 A 的场景 hash 会被用户 B 覆盖 → 多租户 bug

// 修复后:
const sceneCache = new Map<string, {
  hash: string;
  intentions: PredictedIntention[];
}>();
// 每个 userId 独立缓存
```

**缺陷 2: card-store.ts 进程内全局 Map** (严重性: 中)

```typescript
// 当前: 所有 session 的 card 数据在同一个 Map 里
// 风险: 一个用户 OOM 影响所有用户
// 修复: 迁移到 Redis Hash (per-session key), 或在 K8s 后自然解决
//        (每个用户在独立 Pod 中, card-store 天然 per-user)
```

**缺陷 3: 共享 userDataDir 文件系统** (严重性: 低)

```typescript
// 当前: 所有容器挂载同一个 config.userDataDir
// K8s 后自动修复: Per-Session Pod 用独立 emptyDir
// 不需要代码修改, 架构变更自动解决
```

---

### 4.10 代码变更清单

| 操作 | 文件/路径 | 破坏性 | 说明 |
|------|----------|--------|------|
| CREATE | `infra/terraform/main.tf` | 否 | GKE Autopilot + Cloud SQL + Memorystore + VPC Terraform 配置 |
| CREATE | `infra/terraform/variables.tf` | 否 | Terraform 变量定义 |
| CREATE | `sandbox-scheduler/` | 否 | 全新服务: Pod 生命周期管理 (~8.5 天 AI 辅助) |
| CREATE | `api-key-proxy/` | 否 | 全新服务: AI API key 安全代理 (~1 天 AI 辅助) |
| CREATE | `nanoclaw/container/task-server/` | 否 | Pod 内 HTTP 服务: 接收任务、执行 Claude Code、结果发 Redis |
| CREATE | `nanoclaw/src/sandbox/sandbox-client.ts` | 否 | NanoClaw → Scheduler + Pod 的 HTTP client (~80 行) |
| REWRITE | `nanoclaw/src/container/container-runner.ts` | **是** | Docker → HTTP Scheduler + Pod，整个文件逻辑重写 |
| DELETE | `nanoclaw/src/container/container-runtime.ts` | **是** | Docker runtime 不再需要，整个文件删除 (~200 行) |
| REWRITE | `nanoclaw/container/agent-runner/src/index.ts` | **是** | stdin JSON → HTTP task-server，单次执行 → 常驻 HTTP 服务 |
| MODIFY | `nanoclaw/src/context/context-compiler.ts` | **是** | 从 Orchestrator 移入 Sandbox Pod（Orchestrator 无状态，没有本地文件） |
| MODIFY | `nanoclaw/src/fs/cloud-sync.ts` | 否 | 增加中间检查点: 每 5 分钟自动 sync（防 Node 故障丢数据） |
| MODIFY | `nanoclaw/src/intention-predictor.ts` | 否 | 全局变量 → per-user Map（修复多租户隔离缺陷） |
| MODIFY | `api-server/app/routes/events.py` | 否 | `_task_session_map` 从内存 dict → Redis Hash |
| CREATE | `k8s/base/api-server/` | 否 | Deployment + Service + HPA YAML |
| CREATE | `k8s/base/frontend/` | 否 | Deployment + Service YAML |
| CREATE | `k8s/base/vi-realtime/` | 否 | Deployment + Service + HPA + PDB YAML |
| CREATE | `k8s/base/nanoclaw-orchestrator/` | 否 | Deployment + Service YAML |
| CREATE | `k8s/base/sandbox-scheduler/` | 否 | Deployment + Service YAML |
| CREATE | `k8s/base/api-key-proxy/` | 否 | Deployment + Service YAML |
| CREATE | `k8s/base/sandbox-pod-template.yaml` | 否 | Sandbox Pod spec 模板 |
| CREATE | `k8s/base/network-policies/` | 否 | NetworkPolicy YAML (vi-sandbox) |
| CREATE | `.github/workflows/deploy-gke.yml` | 否 | CI/CD pipeline: build images + deploy to GKE |

**关键代码示例: _task_session_map 迁移**

```python
# 修改前 (api-server/app/routes/events.py:31):
_task_session_map: dict[str, str] = {}  # 内存字典, 多副本不一致!

# 修改后:
# Key: "vi:task-sessions" (Redis Hash)
# Field: taskId → sessionId

async def _set_task_session(redis, task_id: str, session_id: str):
    await redis.hset("vi:task-sessions", task_id, session_id)

async def _pop_task_session(redis, task_id: str) -> str | None:
    session_id = await redis.hget("vi:task-sessions", task_id)
    if session_id:
        await redis.hdel("vi:task-sessions", task_id)
        return session_id.decode() if isinstance(session_id, bytes) else session_id
    return None

# 对应修改点:
# events.py:234: _task_session_map[task_id] = session_id
#   → await _set_task_session(redis, task_id, session_id)
# events.py:39: _task_session_map.pop(task_id, None)
#   → await _pop_task_session(redis, task_id)
```

---

### 4.11 迁移步骤

#### Day 1-2: 基础设施准备

```bash
# 1. Terraform 创建 GKE 集群 + 托管服务
cd infra/terraform
terraform init
terraform plan -out=plan.tfplan
terraform apply plan.tfplan
# 输出: cluster endpoint, Cloud SQL connection string, Redis host

# 2. 配置 kubectl 访问
gcloud container clusters get-credentials vi-agent-prod --region=us-central1

# 3. 创建 Namespace
kubectl create namespace vi-core
kubectl create namespace vi-realtime
kubectl create namespace vi-sandbox
kubectl create namespace vi-frontend
kubectl create namespace vi-system

# 4. 添加 Namespace labels (用于 NetworkPolicy selector)
kubectl label namespace vi-core name=vi-core
kubectl label namespace vi-realtime name=vi-realtime
kubectl label namespace vi-sandbox name=vi-sandbox
kubectl label namespace vi-frontend name=vi-frontend
kubectl label namespace vi-system name=vi-system

# 5. 创建 k8s Secrets
kubectl create secret generic vi-secrets -n vi-core \
  --from-literal=anthropic-api-key=sk-ant-xxxxx \
  --from-literal=gemini-api-key=xxxxx \
  --from-literal=database-url=postgresql://... \
  --from-literal=redis-url=redis://...

# 6. 部署 ResourceQuota 和 LimitRange
kubectl apply -f k8s/base/sandbox-quota.yaml
kubectl apply -f k8s/base/sandbox-limits.yaml
```

#### Day 3-5: 服务部署 + 验证

```bash
# 7. 构建并推送容器镜像
for service in api-server frontend nanoclaw vi-realtime sandbox-scheduler api-key-proxy; do
  docker build -t us-central1-docker.pkg.dev/$PROJECT/$REPO/$service:v1 ./$service
  docker push us-central1-docker.pkg.dev/$PROJECT/$REPO/$service:v1
done

# 8. 构建 sandbox pod 基础镜像
docker build -t us-central1-docker.pkg.dev/$PROJECT/$REPO/sandbox:v1 ./nanoclaw/container/
docker push us-central1-docker.pkg.dev/$PROJECT/$REPO/sandbox:v1

# 9. 部署所有服务
kubectl apply -f k8s/base/api-server/
kubectl apply -f k8s/base/frontend/
kubectl apply -f k8s/base/vi-realtime/
kubectl apply -f k8s/base/nanoclaw-orchestrator/
kubectl apply -f k8s/base/sandbox-scheduler/
kubectl apply -f k8s/base/api-key-proxy/

# 10. 部署 NetworkPolicy
kubectl apply -f k8s/base/network-policies/

# 11. 部署 Gateway + HTTPRoutes
kubectl apply -f k8s/base/gateway/

# 12. 验证所有 Pod 就绪
kubectl get pods -A
kubectl rollout status deployment/api-server -n vi-core --timeout=300s
kubectl rollout status deployment/sandbox-scheduler -n vi-core --timeout=300s
```

#### Day 6-7: DNS 切流 + 端到端验证

```bash
# 13. 获取 Gateway 外部 IP
kubectl get gateway vi-gateway -n vi-system -o jsonpath='{.status.addresses[0].value}'

# 14. 更新 DNS 记录
# api.yourdomain.com → Gateway VIP
# app.yourdomain.com → Gateway VIP
# ws.yourdomain.com  → Gateway VIP
# preview.yourdomain.com → Gateway VIP

# 15. 端到端测试 (手动)
# 浏览器打开 app.yourdomain.com → 登录 → 发起语音连接 → AI 编程 → 查看结果

# 16. 监控告警验证
# 人为触发各告警条件, 确认 Slack 通知到达
```

#### Day 8: 老环境下线 + 清理

```bash
# 17. 确认所有流量已切到 k8s
# 检查 VM docker-compose 的日志, 确认无新请求

# 18. 停止 VM docker-compose (保留 1 周作为回退)
ssh vm "cd /app && docker compose stop"

# 19. 1 周后确认无问题, 删除 VM
```

#### 验证清单

- [ ] api-server health check 通过 (`GET /health` → 200)
- [ ] frontend 静态资源正常加载 (无 404, 无 CORS 错误)
- [ ] SSE 事件流正常工作 (`GET /api/users/events` → EventStream)
- [ ] LiveKit Agent 注册成功 (vi-realtime 日志: "Agent registered")
- [ ] WebRTC 语音连接正常 (浏览器 → vi-realtime → 语音通话)
- [ ] Sandbox Pod 创建成功 (Scheduler 日志: "Pod created")
- [ ] AI 编程任务端到端: 语音 → Realtime → NanoClaw → Scheduler → Pod → 结果 → 用户
- [ ] `_task_session_map` Redis 版本工作正常 (多副本 api-server 场景)
- [ ] Preview 路由正常 (preview.yourdomain.com/{sessionId}/ → sandbox dev server)
- [ ] NetworkPolicy 生效: 从 sandbox Pod `curl api-server` → 被拒绝
- [ ] API Key Proxy session token 验证正常 (无效 token → 401)
- [ ] Cloud SQL 连接池正常 (无连接泄漏, `pg_stat_activity` 连接数稳定)
- [ ] Memorystore Redis 延迟 <1ms
- [ ] Cloud-sync 数据完整性: 创建项目 → Pod 销毁 → 新 Pod → 恢复 → 验证数据一致
- [ ] 5 条 critical 告警已配置并测试 (手动触发 → Slack 通知到达)
- [ ] 安全验证: 从 sandbox Pod 内无法读取真实 API key

---

### 4.12 时间线

| 任务 | 传统估时 | AI 辅助估时 | 加速原因 |
|------|---------|-----------|---------|
| Terraform 基础设施 (GKE + Cloud SQL + Redis) | 3 天 | 1 天 | GKE/Cloud SQL/Memorystore 的 Terraform 配置高度模板化，AI 生成 ~80% |
| 容器镜像构建 + CI/CD pipeline | 2 天 | 0.5 天 | GitHub Actions + Docker build 是标准模板 |
| k8s Manifests (6 服务) | 4 天 | 1.5 天 | Deployment/Service/HPA YAML 高度模板化 |
| Sandbox Scheduler HTTP API 骨架 | 1 天 | 0.25 天 | Express/Fastify 样板代码 |
| Sandbox Scheduler Session Registry | 2 天 | 0.75 天 | Redis CRUD + TTL，逻辑简单 |
| Sandbox Scheduler Pod Manager | 5 天 | 2 天 | k8s client create/delete/watch，需要处理边界条件 |
| Sandbox Scheduler Idle Reaper | 1 天 | 0.5 天 | 定时扫描，逻辑简单 |
| API Key Proxy | 3 天 | 1 天 | 标准 reverse proxy + auth middleware，Go/Node.js 有成熟模板 |
| task-server (Pod 内 HTTP) | 3 天 | 1 天 | Express 薄层 HTTP wrapper，核心逻辑已存在 |
| NanoClaw Docker→HTTP 重构 | 5 天 | 2 天 | 移除 Docker SDK、改调用链、清理 imports |
| context-compiler 迁移到 Pod | 3 天 | 1.5 天 | 文件移动 + 启动流程调整 |
| agent-runner stdin→HTTP 重构 | 2 天 | 0.5 天 | 直接替换输入源，核心 Claude Code SDK 逻辑不变 |
| _task_session_map Redis 迁移 | 1 天 | 0.25 天 | 简单的 dict→Redis Hash 替换 |
| intention-predictor 隔离修复 | 0.5 天 | 0.1 天 | 全局变量 → Map<userId, ...> |
| NetworkPolicy 配置 | 1 天 | 0.25 天 | 声明式 YAML，AI 生成后微调 |
| Preview 路由 (Gateway API) | 2 天 | 0.5 天 | HTTPRoute 配置 + 路由逻辑 |
| cloud-sync 增加中间检查点 | 2 天 | 1 天 | 已有基础，增量改进 |
| 单元测试 | 3 天 | 1 天 | AI 擅长生成测试用例和 mock |
| 集成测试 (k8s 端到端) | 5 天 | 3 天 | 需要真实集群测试，AI 无法完全加速 |
| DNS 切流 + 验证 | 3 天 | 2.5 天 | 需要观察和等待，AI 无法加速 |
| 缓冲/修 bug | 3 天 | 2 天 | 预留 |
| **总计** | **~55 天** | **~23 天** | **1-2 人，约 2.5 周** |

> **关键路径**: Sandbox Scheduler (4.5 天) → NanoClaw 重构 (2 天) → 集成测试 (3 天) = ~10 天。其余可并行。

---

### 4.13 月度成本估算

| 项目 | 规格 | 月成本 (USD) |
|------|------|-------------|
| **GKE Autopilot (常驻服务)** | api-server(2) + realtime(2) + nanoclaw(2) + scheduler(1) + proxy(1) + frontend(2), 每 Pod ~0.5 vCPU + 1GB | ~$400 |
| **GKE Autopilot (sandbox pods)** | 峰值 10 pods, 平均 ~5, 2vCPU + 4GB each, Spot pricing | ~$300 |
| **Cloud SQL (PostgreSQL)** | db-f1-micro (共享 vCPU, 614MB RAM, 10GB SSD) | ~$10 |
| **Memorystore (Redis)** | Basic tier, 1GB, 无 HA | ~$35 |
| **GCS** | ~50GB 存储 + 少量操作 | ~$2 |
| **网络 (Gateway + egress)** | 低流量, 外部 Application LB | ~$50 |
| **Cloud Monitoring** | 免费额度内 (GKE 内置) | $0 |
| **基础设施小计** | | **~$800** |
| **AI API (Claude)** | ~50 用户 x 3 任务/天 x 60K tokens/任务, 含 prompt caching | ~$1,350 |
| **AI API (Gemini)** | ~50 用户 x 20 min/天, Native Audio | ~$200 |
| **AI API 小计** | | **~$1,550** |
| **总计** | | **~$2,350/月** |

> **成本结构**: AI API 占 ~66%，基础设施占 ~34%。这验证了 briefing 中"AI API 50-65%"的判断。Phase 1 的基础设施成本几乎可以忽略，重点不是成本优化，而是架构验证。每用户成本 ~$47/月。

---

## 5. Phase 2: 千人规模 (~1,000 用户)

**目标**: 验证水平扩展能力，引入生产级运维工具，从"小作坊"进化为"工程化运营"。

**并发模型**: 1,000 DAU, ~70-200 并发会话（按需连接 20 min, 峰值系数 3x）

**关键升级**: HPA 全面启用、Warm Pool 消除冷启动、Redis 拆分独立伸缩、External Secrets Manager 外部化密钥、Prometheus + Grafana 自定义监控。

**Phase 2 触发信号** (不必等到 50 用户才启动):
- Phase 1 稳定运行 >= 1 周
- 并发会话 > 30（vi-realtime 2 Pod 各处理 15 连接开始吃力）
- ResourceQuota sandbox pods > 8（接近 15 的硬限制）
- Redis 内存 > 700MB 或 CPU > 60%
- 用户投诉冷启动 30s 等待时间

---

### 5.1 架构图 (Phase 1 变更高亮)

```
                        +---------------------------+
                        | ⚡ Cloud CDN (新增)       |
                        |  frontend 静态资源缓存    |
                        +-----------+---------------+
                                    |
                        +-----------+---------------+
                        |      GKE Gateway API      |
                        |  api / ws / preview       |
                        |  ⚡ 通配符子域名路由      |
                        +-----------+---------------+
                                    |
           +------------------------+------------------------+
           |                        |                        |
    +------+-------+        +-------+------+         +-------+------+
    | frontend     |        | api-server   |         | HTTPRoute    |
    | Deploy x2    |        | ⚡ HPA 2-5  |         | ⚡ 子域名    |
    | (CDN 扛流量) |        | (by RPS)     |         | (动态路由)  |
    +-----+--------+        +-------+------+         +-------+------+
          |                         |                        |
          |              +----------+-----------+            |
          |              |                      |            |
          |      +-------+--------+    +--------+-------+   |
          |      | ⚡ Redis-      |    | ⚡ Redis-      |   |
          |      | Realtime       |    | State          |   |
          |      | (Basic 2GB)   |    | (Standard 2GB) |   |
          |      | PUB/SUB only  |    | + replica      |   |
          |      +-------+--------+    +--------+-------+   |
          |              |                      |            |
    +-----+--------+  +--+------------+         |            |
    | vi-realtime  |  | nanoclaw-orch |         |            |
    | ⚡ HPA 3-8  |  | ⚡ HPA 2-5   |         |            |
    | PDB: max 10% |  | (by 队列深度) |         |            |
    | ⚡ 蓝绿部署 |  +------+--------+         |            |
    +--------------+         |                  |            |
                      +------+--------+         |            |
                      | sandbox-sched |         |            |
                      | ⚡ HA x2     |         |            |
                      +------+--------+         |            |
                             | k8s API          |            |
                      +------+--------+         |            |
                      | sandbox-pod   |         |            |
                      | 动态 0-200    +---------+            |
                      | ⚡ Warm Pool  |                      |
                      |   ~20 pods    +----------------------+
                      +------+--------+  (preview 子域名)
                             |
              +--------------+--------------+
              |              |              |
       +------+------+ +----+------+ +-----+--------+
       | api-key-    | | Cloud SQL | | ⚡ External  |
       | proxy ⚡ x2 | | ⚡ 升配  | | Secrets Mgr  |
       | (HA)        | | 2vCPU/8GB | | (GCP Secret  |
       +-------------+ +-----------+ |  Manager)    |
                                      +--------------+
```

**⚡ 标记说明**: 所有带 ⚡ 的组件都是 Phase 1 → Phase 2 的升级点。

---

### 5.2 服务变更表

| 服务 | Phase 1 → Phase 2 变化 | 具体变更 |
|------|----------------------|---------|
| frontend | **不变** (+ CDN) | 静态资源走 Cloud CDN，减少 Gateway 负载。1000 用户开始有意义。 |
| api-server | **升级: HPA** | 2 → 2-5 replicas，按 RPS 自动扩缩。CPU request 从 0.25 提升到 0.5 vCPU。 |
| vi-realtime | **升级: HPA + PDB + 蓝绿部署** | 2 → 3-8 replicas，按连接数扩缩。PDB maxUnavailable 10%。部署改为蓝绿（保护 WebRTC 长连接）。 |
| nanoclaw-orchestrator | **升级: HPA** | 2 → 2-5 replicas，按 Redis 队列深度扩缩。 |
| sandbox-scheduler | **升级: HA x2** | 1 → 2 replicas。Scheduler 成为关键路径，单点不可接受。 |
| api-key-proxy | **升级: HA x2** | 1 → 2 replicas。同上。 |
| sandbox-pod | **升级: Warm Pool** | 0-10 → 0-200。新增 Warm Pool ~20 pods（活跃会话的 10%），冷启动 30s → 5s。 |
| Cloud SQL | **升级** | db-f1-micro → db-custom-2-8192 (2 vCPU, 8GB RAM)。启用 automatic storage increase。 |
| Memorystore Redis | **拆分为 2 实例** | 单实例 1GB → Redis-Realtime (Basic 2GB) + Redis-State (Standard 2GB + replica) |
| GCS Bucket | 不变 | 容量自然增长 |
| **新增: External Secrets** | **新增** | GCP Secret Manager + External Secrets Operator，替代 k8s Secrets |
| **新增: Prometheus + Grafana** | **新增** | 自建可观测性栈，4 个 Dashboard，自定义 metrics |

---

### 5.3 新增/升级服务详解

#### 5.3.1 ⚡ Warm Pool (Scheduler 升级)

**为什么 Phase 2 必须引入 Warm Pool**:

Phase 1 冷启动 30s（镜像拉取 ~10s + cloud-sync ~15s + task-server 启动 ~5s）对 50 用户可接受，但 200 并发时不可接受。每次用户开始新会话都要等 30s = 极差体验。

**Warm Pool 工作原理**:

```
Scheduler 后台维护一批"预热好的" Pod:
  1. Pod 已创建, 镜像已拉取
  2. task-server 已启动, /health 返回 200
  3. 但尚未分配给任何用户 (状态: WARM)
  4. 没有执行 cloud-sync (不知道是哪个用户的)

用户请求到达时:
  1. Scheduler 从 Warm Pool 取一个 Pod (WARM → STARTING)
  2. 注入 userId 环境变量, 执行 cloud-sync 下载用户数据 (~5s)
  3. Pod 准备就绪 (READY), 返回给调用方

冷启动 30s → 热启动 5s (节省了镜像拉取 + task-server 启动时间)
```

**Warm Pool 目标数量算法**:

```typescript
// 动态调整, 不是固定值
warmPoolTarget = max(
  5,                        // 最小保底
  activeSessions * 0.10,    // 活跃会话的 10%
  creationRate * 2           // 最近 5 分钟创建速率的 2 倍
);
// Phase 2 初始: max(5, 70*0.10, rate*2) ≈ 7-20 pods
```

**Warm Pool 补充逻辑**: Scheduler 后台 Replenisher 每 10s 检查 Warm Pool 大小，如果低于 target 则创建新 Pod。新 Pod 自动使用最新镜像 tag（sandbox 镜像更新时无需主动部署）。

#### 5.3.2 ⚡ Redis 拆分 (Realtime vs State)

**为什么 Phase 2 拆分**: 200 并发意味着 200 路 PUB/SUB 通道（`vi:stream:{uid}`, `vi:exec:{uid}`, `vi:ctx:{uid}`, `vi:intent:{uid}`）+ 200 路 session state 查询。PUB/SUB 的 CPU 消耗与 State KV 操作在同一 Redis 实例上竞争。拆分后可独立伸缩。

```
Redis-Realtime (Memorystore Basic, 无 replica, 2GB):
  用途: PUB/SUB + Stream
    - vi:stream:* (实时结果流)
    - vi:exec:*   (任务执行指令)
    - vi:ctx:*    (上下文更新)
    - vi:intent:* (意图预测)
  特点: 高吞吐, 不需要持久化 (消息即时消费)
  成本较低 (Basic tier, 无 replica)

Redis-State (Memorystore Standard, 有 replica, 2GB):
  用途: Hash + Sorted Set + String
    - sandbox:sessions:* (session registry)
    - vi:task-sessions   (task→session 映射)
    - session:*          (API Key Proxy session token)
    - usage:*            (API usage 计数器)
    - ratelimit:*        (rate limiting 计数器)
    - warm-pool          (Sorted Set, Warm Pool 队列)
  特点: 需要持久化 (session registry 丢失 = 所有活跃 Pod 失联)
  HA 保证 (Standard tier, 有 replica, 自动故障转移)
```

**代码变更**: 所有服务需要支持两个 Redis URL: `REDIS_REALTIME_URL` + `REDIS_STATE_URL`。影响: api-server, nanoclaw, sandbox-scheduler, vi-realtime。变更量不大（~50 行/服务），但需要仔细测试确保正确的操作发到正确的 Redis。

#### 5.3.3 ⚡ External Secrets Manager

**为什么从 k8s Secrets 迁移**:

1. k8s Secrets 是 base64 编码，**不是加密**——任何有 RBAC 权限的人可以 `kubectl get secret -o jsonpath` 读取明文
2. Secret 轮换需要手动更新 manifest + 重启 Pod
3. 审计困难——无法追踪"谁在什么时候读了 Secret"

```yaml
# External Secrets Operator + GCP Secret Manager
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: vi-api-keys
  namespace: vi-core
spec:
  refreshInterval: 1h  # 每小时同步一次 (也可配置 webhook 实时)
  secretStoreRef:
    name: gcp-secret-store
    kind: ClusterSecretStore
  target:
    name: vi-secrets    # 生成的 k8s Secret 名称
  data:
  - secretKey: anthropic-api-key
    remoteRef:
      key: projects/PROJECT_ID/secrets/anthropic-api-key
      version: latest
  - secretKey: gemini-api-key
    remoteRef:
      key: projects/PROJECT_ID/secrets/gemini-api-key
      version: latest
```

**优势**: Secret 在 GCP Secret Manager 中 KMS 加密存储，轮换只需更新 GCP Secret Manager（Operator 自动同步），GCP Audit Log 记录所有 Secret 访问。

#### 5.3.4 ⚡ HPA 配置

```yaml
# api-server HPA — 按 CPU 利用率自动扩缩
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
  namespace: vi-core
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
---
# vi-realtime HPA — 按活跃连接数扩缩
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vi-realtime
  namespace: vi-realtime
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vi-realtime
  minReplicas: 3
  maxReplicas: 8
  metrics:
  - type: Pods
    pods:
      metric:
        name: active_sessions_per_pod
      target:
        type: AverageValue
        averageValue: "50"   # 每 Pod 目标 ~50 并发会话
---
# nanoclaw-orchestrator HPA — 按 Redis 队列深度扩缩
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nanoclaw-orchestrator
  namespace: vi-core
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nanoclaw-orchestrator
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

**PodDisruptionBudget (vi-realtime)**:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: vi-realtime-pdb
  namespace: vi-realtime
spec:
  maxUnavailable: "10%"
  selector:
    matchLabels:
      app: vi-realtime
```

---

### 5.4 部署策略升级

| 服务 | Phase 1 策略 | Phase 2 策略 | 变更原因 |
|------|-------------|-------------|---------|
| frontend | Rolling | Rolling | 不变: 静态资源 + CDN 缓存，秒级切换 |
| api-server | Rolling | Rolling | 不变: 无状态 HTTP 服务，Rolling 足够 |
| vi-realtime | Rolling | **蓝绿** | WebRTC 长连接不能中断。1000 用户时 ~70-200 活跃连接，Rolling 替换会打断通话 |
| nanoclaw-orch | Rolling | Rolling | 不变: 无状态，标准滚动 |
| sandbox-scheduler | Rolling | Rolling (maxUnavailable: 0) | 升级为零停机: Scheduler 是关键路径 |
| api-key-proxy | Rolling | Rolling (maxUnavailable: 0) | 升级为零停机: 中断 = AI 功能全部不可用 |
| sandbox-pod | 自然替换 | **自然替换 via Warm Pool** | 新镜像通过 Warm Pool Replenisher 自动使用 |

**vi-realtime 蓝绿部署方案详解**:

```
为什么需要蓝绿:
  - WebRTC 连接是有状态的长连接 (用户正在和 AI 语音通话)
  - Rolling Update 逐个替换 Pod, 被替换的 Pod 上的活跃连接会中断
  - 200 并发 = 200 个正在进行的语音对话, 任何一个中断 = 极差体验

蓝绿部署流程:
  1. 当前 Blue 环境运行中 (接受所有新连接)
  2. 部署新版本到 Green 环境 (独立的 Deployment)
  3. 健康检查通过后, 将新连接路由到 Green
  4. Blue 环境停止接受新连接 (drain mode)
  5. 等待 Blue 上所有会话自然结束 (最长 30 min)
  6. 删除 Blue 环境

         Gateway API
             |
    +--------+--------+
    |                 |
  Blue (v1.2)    Green (v1.3)
  drain mode     active
  (等待会话结束)  (接新连接)

实现方式:
  - 两个 Deployment: vi-realtime-blue, vi-realtime-green
  - 一个 Service 通过 selector 切换指向
  - 或用 Gateway API 的 traffic splitting (weight: 0/100)
```

**sandbox-pod 的"部署"**: sandbox-pod 不走传统部署流程。新版 Agent 镜像发布后: (1) Warm Pool 中的旧版 Pod 逐步替换为新版（Replenisher 创建新 Pod 时用最新镜像）; (2) 已分配的 Pod 等会话结束后自然销毁; (3) 新创建的 Pod 使用新镜像; (4) 无需主动部署操作。

---

### 5.5 扩容配置

**HPA 目标 per service**:

| 服务 | 扩缩指标 | 目标值 | min | max | 说明 |
|------|---------|-------|-----|-----|------|
| api-server | CPU utilization | 70% | 2 | 5 | HTTP API 无状态, CPU 是主要瓶颈 |
| vi-realtime | active_sessions_per_pod | 50 | 3 | 8 | 每 Pod ~50 WebRTC 会话, 按 60MB/session 计算内存 |
| nanoclaw-orchestrator | CPU utilization | 60% | 2 | 5 | 任务调度 CPU bound |
| sandbox-scheduler | 固定 2 replicas | - | 2 | 2 | Phase 2 固定 HA, Phase 3 才需要 HPA |
| api-key-proxy | 固定 2 replicas | - | 2 | 2 | 同上 |

**PodDisruptionBudget**:

```yaml
# vi-realtime PDB — 缩容时至少保留 90% 的 Pod
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: vi-realtime-pdb
  namespace: vi-realtime
spec:
  maxUnavailable: "10%"
  selector:
    matchLabels:
      app: vi-realtime
```

**为什么 vi-realtime 需要 PDB**: HPA 缩容时，如果一次性杀掉多个 Pod，大量 WebRTC 连接同时断开。PDB 限制每次最多杀 10% 的 Pod，给 LiveKit 时间将会话迁移到其他 Pod。

---

### 5.6 安全升级

| 安全层 | Phase 1 → Phase 2 变化 | 具体配置 |
|--------|----------------------|---------|
| gVisor | 不变 | 继续使用 Autopilot 默认 gVisor |
| API Key Proxy | **增强** | 增加 per-user rate limiting (token/min 上限)、cost tracking (Redis 计数器)、异常消耗检测 (单用户 token 消耗 > 10x 平均值 → 自动暂停) |
| NetworkPolicy | **细化** | 按 namespace 独立 policy: vi-sandbox (最严格)、vi-realtime (只能访问 Redis + LiveKit)、vi-core (服务间互通) |
| RBAC | **细化** | 增加 `viewer` role (只读监控面板)、`operator` role (可重启 Pod、查看日志) |
| Secret 管理 | **外部化** | 迁移到 GCP Secret Manager + External Secrets Operator。k8s Secret 变为自动同步的 ExternalSecret |
| 审计日志 | **增强** | API Key Proxy 所有调用写入 BigQuery，支持按用户查询 token 消耗历史 |
| 异常检测 | **新增** | Prometheus 规则: 单用户 token 消耗 > 10x 平均值 → 自动暂停 session + Slack 告警 |
| 容器镜像安全 | **新增** | CI/CD 集成镜像漏洞扫描 (GCR Vulnerability Scanning / Trivy) |
| Redis ACL | **新增** | per-pod channel 隔离: sandbox pod 只能 PUBLISH 到分配给自己的 `vi:stream:{userId}` channel |

**Phase 2 异常检测规则**:

```yaml
groups:
  - name: api-key-security
    rules:
      - alert: AnomalousTokenConsumption
        expr: |
          rate(proxy_tokens_total{direction="output"}[5m])
          > 10 * avg_over_time(proxy_tokens_total{direction="output"}[24h])
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "用户 {{ $labels.user_id }} token 消耗异常暴增 (超过 24h 平均值 10 倍)"
          action: "自动暂停该用户的 session token, 通知 on-call 人员确认"

      - alert: SandboxPodEscapeAttempt
        expr: increase(gvisor_violation_total[5m]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Sandbox Pod {{ $labels.pod }} 检测到 gVisor 违规操作 (可能的逃逸尝试)"
          action: "立即隔离 Pod, 保存日志用于安全分析"
```

---

### 5.7 监控升级 (Prometheus + Grafana)

**技术栈**:
- Metrics: Prometheus (GKE Managed Prometheus 或自建) + Grafana
- Logging: Cloud Logging + Loki (Grafana 统一查询)
- Alerting: Alertmanager → Slack + PagerDuty

**4 个 Grafana Dashboard**:

**Dashboard 1: 系统总览 (System Overview)**
```
Row 1: 集群健康 — Node 数量, Pod 数量, CPU/Memory 整体利用率
Row 2: 流量概览 — API QPS, WebSocket 连接数, 活跃 session 数
Row 3: 错误率 — 各服务 5xx 率, Pod 重启次数
Row 4: 成本 — 今日 AI API 累计成本, 本月趋势
```

**Dashboard 2: Sandbox 生命周期**
```
Row 1: Pod 创建/销毁速率, Warm Pool 大小 vs 目标, 创建延迟 P50/P95/P99
Row 2: Pod 状态分布饼图 (WARM/STARTING/ACTIVE/IDLE/DRAINING)
Row 3: Cloud-sync 性能 — 上传/下载速率, 失败率, P95 延迟
Row 4: 资源使用 — emptyDir 使用量分布, CPU/Memory per Pod
```

**Dashboard 3: AI API 使用**
```
Row 1: 请求量/token 消耗趋势 (by model: Claude Sonnet/Haiku/Gemini)
Row 2: 成本 per user 排名 Top 20
Row 3: 延迟分布 (P50/P95/P99), 按上游 API 分组
Row 4: Rate limit 触发趋势, 429 响应率
```

**Dashboard 4: 安全**
```
Row 1: Session token 验证失败趋势 (正常 ~0, 突增 = 异常)
Row 2: gVisor 违规事件 (正常 = 0)
Row 3: NetworkPolicy 拒绝事件 (正常存在, 但突增 = 异常)
Row 4: 异常检测告警历史
```

**Phase 2 新增告警规则** (在 Phase 1 的 5 条基础上):

```yaml
groups:
  - name: sandbox-lifecycle
    rules:
      - alert: WarmPoolDepleted
        expr: scheduler_warm_pool_size < 2
        for: 1m
        annotations:
          summary: "Warm Pool 即将耗尽, 新用户将经历 30s 冷启动"

      - alert: SandboxPodOOMKilled
        expr: increase(kube_pod_container_status_last_terminated_reason{reason="OOMKilled",namespace="vi-sandbox"}[5m]) > 0
        annotations:
          summary: "Sandbox Pod OOM, 检查是否有异常大项目或内存泄漏"

  - name: cost-alerts
    rules:
      - alert: DailyCostExceedsBudget
        expr: sum(proxy_cost_cents_total) > 500000  # $5,000/天
        annotations:
          summary: "今日 AI API 成本超过 $5,000 预算"

      - alert: SingleUserCostAnomaly
        expr: topk(1, increase(proxy_cost_cents_total[1h])) > 10000
        annotations:
          summary: "单用户 AI 成本异常 (> $100/小时)"
```

---

### 5.8 代码变更清单

| 操作 | 文件/路径 | 破坏性 | 说明 |
|------|----------|--------|------|
| MODIFY | `sandbox-scheduler/src/core/warm-pool.ts` | 否 | 新增 Warm Pool 后台管理器 |
| MODIFY | `sandbox-scheduler/src/core/pod-manager.ts` | 否 | 增加 Warm Pool Pod 创建/分配逻辑 |
| MODIFY | `api-server/app/config.py` | 否 | 支持双 Redis URL (REDIS_REALTIME_URL + REDIS_STATE_URL) |
| MODIFY | `nanoclaw/src/config.ts` | 否 | 同上 |
| MODIFY | `sandbox-scheduler/src/config.ts` | 否 | 同上 |
| MODIFY | `realtime/src/config.py` | 否 | 同上 |
| CREATE | `k8s/base/external-secrets/` | 否 | ExternalSecret + ClusterSecretStore YAML |
| CREATE | `k8s/base/monitoring/` | 否 | Prometheus + Grafana + Alertmanager manifests |
| MODIFY | `k8s/base/vi-realtime/` | 否 | 蓝绿部署配置 (两个 Deployment + Service selector 切换) |
| MODIFY | `k8s/base/sandbox-quota.yaml` | 否 | 提高 ResourceQuota: pods 15→250, CPU 20→500, memory 40Gi→1000Gi |
| CREATE | `k8s/base/hpa/` | 否 | 各服务 HPA + PDB YAML |
| MODIFY | `.github/workflows/` | 否 | 分服务 pipeline (paths 过滤), staging e2e 测试 |

---

### 5.9 迁移步骤 (Phase 1 → Phase 2)

```
Week 1: 基础设施升级
  [ ] Cloud SQL 升配: db-f1-micro → db-custom-2-8192
  [ ] 创建第二个 Memorystore 实例 (Redis-State, Standard 2GB)
  [ ] 部署 External Secrets Operator + 配置 GCP Secret Manager
  [ ] 配置 Cloud CDN (frontend 静态资源)

Week 2: 服务升级
  [ ] 所有服务代码更新: 支持双 Redis URL
  [ ] 启用 HPA (api-server, vi-realtime, nanoclaw-orch)
  [ ] vi-realtime 配置 PDB
  [ ] sandbox-scheduler 扩到 2 副本
  [ ] api-key-proxy 扩到 2 副本
  [ ] 提高 vi-sandbox ResourceQuota

Week 3: Warm Pool + Preview
  [ ] Sandbox Scheduler 增加 Warm Pool 管理器
  [ ] 切换 preview 到子域名路由 (*.preview.yourdomain.com)
  [ ] 配置 vi-realtime 蓝绿部署

Week 4: 监控 + 安全 + 测试
  [ ] 部署 Prometheus + Grafana + 4 个 Dashboard
  [ ] 部署 Alertmanager + PagerDuty 集成
  [ ] 配置 Redis ACL (per-pod channel 隔离)
  [ ] 启用 per-user rate limiting
  [ ] 镜像漏洞扫描集成到 CI/CD
  [ ] 负载测试: 200 并发会话端到端
```

---

### 5.10 Phase 1→2 触发条件

| 指标 | Phase 1 设计上限 | 触发阈值 | 最先崩的 | 说明 |
|------|----------------|---------|---------|------|
| 日活用户 (DAU) | 50 | >80 | - | 综合指标 |
| 并发会话 | ~10 | >30 | **vi-realtime** | 2 Pod 各处理 15 WebRTC 连接开始吃力 (每连接 ~60MB RAM) |
| 并发 sandbox pods | 10 (quota) | >8 | **ResourceQuota** | 硬限制 15 pods，超过直接拒绝新请求 |
| Redis 内存使用 | 1GB | >700MB | Memorystore | OOM 风险，PUB/SUB 消息丢失 |
| Redis CPU | 单核 | >60% | PUB/SUB 阻塞 | KV 操作延迟增大 |
| Sandbox 冷启动 | 30s (可接受) | 用户投诉增多 | 用户体验 | Warm Pool 的引入信号 |
| 单点故障 (scheduler x1) | 可接受 | 出现宕机事故 | 可用性 | HA 的引入信号 |

**最先崩的**: **vi-realtime（并发连接数）** 和 **ResourceQuota（sandbox pod 数量限制）**。当并发超过 30，2 个 vi-realtime Pod 各处理 15 个 WebRTC 连接，每连接 ~60MB RAM，总计 ~900MB 接近 Pod 的 2Gi limit。同时 sandbox quota 的硬限制 15 pods 会直接拒绝新的 Pod 创建请求。

---

### 5.11 时间线

| 任务 | 传统估时 | AI 辅助估时 | 说明 |
|------|---------|-----------|------|
| Redis 拆分 (代码 + 配置) | 5 天 | 2 天 | 配置改双 URL, 逻辑简单但需要仔细测试 |
| Cloud SQL 升配 + 验证 | 1 天 | 0.5 天 | GCP 控制台操作 + 连接测试 |
| External Secrets Operator 部署 | 3 天 | 1 天 | Helm install + GCP Secret Manager 配置 |
| Warm Pool 实现 | 5 天 | 2.5 天 | 后台 job 逻辑, 需要测试不同场景 |
| HPA 配置 + 调优 | 3 天 | 1 天 | YAML + 负载测试验证 |
| vi-realtime 蓝绿部署配置 | 3 天 | 1.5 天 | 两个 Deployment + Service 切换 + 测试 |
| Preview 子域名路由 | 3 天 | 1 天 | 通配符 DNS + 动态 HTTPRoute |
| Cloud CDN 配置 | 1 天 | 0.5 天 | GCP 控制台 + CDN policy |
| Prometheus + Grafana 部署 | 3 天 | 1.5 天 | Helm install + 4 Dashboard JSON |
| Per-user rate limiting | 2 天 | 1 天 | Redis 计数器 + Proxy 逻辑 |
| Redis ACL 配置 | 1 天 | 0.5 天 | Memorystore ACL + 测试 |
| 镜像漏洞扫描 CI/CD 集成 | 1 天 | 0.5 天 | GitHub Actions + Trivy |
| 负载测试 (200 并发) | 3 天 | 2.5 天 | 测试脚本 AI 写, 分析结果人做 |
| 缓冲/修 bug | 3 天 | 2 天 | 预留 |
| **总计** | **37 天** | **~18 天** | **2 人并行, 约 2-2.5 周** |

---

### 5.12 月度成本估算

| 项目 | 规格 | 月成本 (USD) |
|------|------|-------------|
| **GKE Autopilot (常驻服务)** | api-server(5) + realtime(8) + nanoclaw(5) + scheduler(2) + proxy(2) + frontend(2), ~25 vCPU, 20GB RAM | ~$1,500 |
| **GKE Autopilot (sandbox pods, Spot)** | 峰值 200, 平均 70, 2vCPU + 4GB each | ~$4,000 |
| **GKE Autopilot (warm pool, Spot)** | ~20 pods | ~$720 |
| **Cloud SQL** | db-custom-2-8192 (2 vCPU, 8GB RAM) | ~$120 |
| **Memorystore Redis (x2)** | Basic 2GB + Standard 2GB + replica | ~$200 |
| **GCS** | ~2TB 存储 | ~$40 |
| **Cloud CDN** | 中等流量 | ~$50 |
| **网络 (Gateway + egress)** | 中等流量 | ~$200 |
| **Prometheus + Grafana** | 2-3 Pods on GKE | ~$200 |
| **基础设施小计** | | **~$7,030** |
| **AI API (Claude)** | ~1K 用户 x 3 任务/天 x 60K tokens, prompt caching -30% | ~$27,000 |
| **AI API (Gemini)** | ~1K 用户 x 20 min/天 | ~$4,000 |
| **AI API 小计** | | **~$31,000** |
| **总计** | | **~$38,000/月** |

> **成本结构**: AI API 占 ~82%，基础设施占 ~18%。每用户成本 ~$38/月（Phase 1 的 $47 下降到 $38，规模效应初显）。

---

## 6. Phase 3: 万人规模 (~10,000 用户)

**目标**: 万人级生产系统，需要自动化运维、精细成本控制、高可用保障。从"工程化运营"进化为"自动化运营"。

**并发模型**: 10,000 DAU, ~700-2,000 并发会话（峰值 ~6,000）

**关键升级**: Spot VM 全面应用（计算成本 -60~70%）、高级自动扩缩（自定义 metrics HPA）、Canary 发布（渐进验证）、Cloud Armor WAF（DDoS 防护）、异常检测自动化（anomaly-detector 服务）、分布式追踪（全链路 trace）。

**Phase 3 触发信号**:
- DAU > 3,000
- 并发会话 > 500（nanoclaw-orchestrator 调度延迟增大）
- 并发 sandbox pods > 200（Scheduler 固定 2 副本处理不过来）
- Redis-Realtime 内存 > 1.5GB 或 Redis-State 内存 > 1.5GB
- Cloud SQL CPU > 70% 或 连接数 > 80
- 月度基础设施成本 > $15K（需要成本优化）
- 发生安全事件（需要 WAF、高级监控）

---

### 6.1 架构图

```
                             +---------------------------+
                             |      Cloud CDN            |
                             | (global edge caching)     |
                             +-----------+---------------+
                                         |
                             +-----------+---------------+
                             |    GKE Gateway API        |
                             |  api / ws / preview       |
                             |  + TLS termination        |
                             |  ⚡ + Cloud Armor WAF    |
                             +-----------+---------------+
                                         |
           +------------+----------------+----------------+-----------+
           |            |                |                |           |
    +------+---+ +------+------+  +------+------+  +-----+------+   |
    | frontend | | api-server  |  | vi-realtime |  | HTTPRoute  |   |
    | Deploy   | | ⚡ HPA 5-15|  | HPA 10-40   |  | (preview)  |   |
    | x2       | | ⚡ Canary  |  | PDB 10%     |  |            |   |
    | (CDN)    | | 部署       |  | 蓝绿部署     |  |            |   |
    +----------+ +------+------+  +------+------+  +-----+------+   |
                        |                |                |          |
                +-------+---------+------+--------+       |          |
                |  Redis-Realtime |  Redis-State  |       |          |
                |  ⚡ (Basic 5GB)|  ⚡(Std 5GB+HA)|       |          |
                +-------+---------+------+--------+       |          |
                        |                |                |          |
                 +------+--------+       |                |          |
                 | nanoclaw-orch |       |                |          |
                 | ⚡ HPA 5-15 |       |                |          |
                 | ⚡ Canary   |       |                |          |
                 +------+--------+       |                |          |
                        |                |                |          |
                 +------+--------+       |                |          |
                 | sandbox-sched |       |                |          |
                 | ⚡ HPA 2-5  |       |                |          |
                 +------+--------+       |                |          |
                        | k8s API        |                |          |
                        |                |                |          |
             +----------+----------+     |                |          |
             |                     |     |                |          |
      +------+--------+    +------+--------+              |          |
      | sandbox-pod   |    | warm pool     |              |          |
      | 动态 0-2000   +----+ ⚡ ~100 pods +--------------+          |
      | ⚡ Spot 优先  |    | (Spot)        |                         |
      +------+--------+    +---------------+                         |
             |                                                       |
      +------+--------+    +---------------+    +--------------------+
      | api-key-proxy |    | ⚡ anomaly-  |    | Cloud SQL HA       |
      | ⚡ HPA 2-5   |    | detector x2   |    | ⚡ (4vCPU/16GB    |
      +---------------+    +---------------+    |    + replica)      |
                                                +--------------------+
```

---

### 6.2 服务变更表

| 服务 | Phase 2 → Phase 3 变化 | 具体变更 |
|------|----------------------|---------|
| frontend | 不变 | CDN 继续扛流量，Deployment 无变化 |
| api-server | **升级: Canary 部署** | HPA 上限 5→15。部署改为 Canary (5%→25%→100%)，10K 用户时 API 变更需要渐进验证 |
| vi-realtime | **升级: HPA 上限** | HPA 上限 8→40。按 60MB/session 计算: 2000 并发 / 50 sessions/pod = 40 pods |
| nanoclaw-orchestrator | **升级: Canary 部署** | HPA 上限 5→15。调度逻辑变更影响面大，需要 Canary 验证 |
| sandbox-scheduler | **升级: HPA** | 固定 2 → HPA 2-5。并发 Pod 创建/销毁请求可达数百/分钟，成为热点 |
| api-key-proxy | **升级: HPA** | 固定 2 → HPA 2-5。代理请求量随用户增长 |
| sandbox-pod | **升级: Spot 全面应用** | 0-200 → 0-2000。Warm Pool ~20 → ~100。Spot 优先（70% Spot + 30% On-Demand 保底） |
| Cloud SQL | **升级: HA** | db-custom-2-8 → db-custom-4-16384 + HA (自动故障转移到不同 zone)。添加 PgBouncer 连接池。 |
| Redis-Realtime | **升配** | Basic 2GB → Basic 5GB |
| Redis-State | **升配** | Standard 2GB → Standard 5GB + HA |
| GCS | **多区域** | 单区域 → multi-regional (如果用户跨地域分布) |
| **新增: anomaly-detector** | **新增** | 自动化异常检测: API 调用消耗暴增、Pod 异常行为。Phase 1-2 靠人工告警，Phase 3 必须自动化 |
| **新增: Cloud Armor WAF** | **新增** | Gateway 前端 WAF，DDoS 防护，Sandbox Pod 创建 rate limiting |

---

### 6.3 新增/升级详解

#### 6.3.1 ⚡ Spot VM 优化 (70% 成本节省)

**Spot 适用性分析**:

| 服务 | Spot 适用? | 原因 |
|------|-----------|------|
| sandbox-pod | **最适合** | 临时、可中断、有 cloud-sync 保底。用户数据在 GCS，Pod 被回收只损失少量未 sync 进展 |
| warm pool pods | **适合** | 被回收就补充新的，对用户无感知 |
| nanoclaw-orchestrator | **可以** | 无状态，被回收后 k8s 自动恢复，有 HPA 保证 |
| api-key-proxy | **不能** | 关键路径，中断 = AI 功能全部不可用 |
| sandbox-scheduler | **不能** | 管理 Pod 生命周期，中断会导致 Pod 孤儿化 |
| Redis / Cloud SQL | N/A | 托管服务，不涉及 Spot |

**Spot 比例策略**:

```
Phase 1: 100% Spot (50 用户, 容忍偶尔中断)
Phase 2: 70% Spot + 30% On-Demand (保底容量)
Phase 3: 70% Spot + 20% On-Demand + 10% CUD Reserved
```

**Spot 回收处理流程**:

```
1. GKE Autopilot Spot Pod 被回收前有 25s warning (SIGTERM)
2. Sandbox Pod 收到 SIGTERM → 立即触发紧急 cloud-sync to GCS
3. cloud-sync 通常 < 5s (增量上传) → 数据不丢失
4. Scheduler 检测到 Pod 终止 → 检查用户是否仍在线
5. 如果用户在线 → 从 Warm Pool 分配新 Pod (5s)
   → 新 Pod cloud-sync from GCS → 用户几乎无感知 (总中断 ~10s)
6. 如果 Warm Pool 耗尽 → 创建 On-Demand Pod (保底, 30s)
7. 用户端: 短暂 loading → 自动恢复
```

```yaml
# sandbox-pod-template.yaml — Spot 配置
spec:
  nodeSelector:
    cloud.google.com/gke-spot: "true"
  tolerations:
  - key: cloud.google.com/gke-spot
    operator: Equal
    value: "true"
    effect: NoSchedule
  terminationGracePeriodSeconds: 30  # Spot 回收有 25s warning, 留 5s buffer

  containers:
  - name: agent
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "node /app/emergency-sync.js"]
          # 紧急 cloud-sync: 只上传变更文件, 增量, <5s
```

**成本节省计算**:

```
Phase 3 sandbox pods (On-Demand 全价):
  2000 avg pods x 2vCPU x $0.032/hr x 720h = ~$92,160/月

Phase 3 sandbox pods (70% Spot):
  1400 Spot pods x 2vCPU x $0.013/hr x 720h = ~$26,208/月
  600 On-Demand pods x 2vCPU x $0.032/hr x 720h = ~$27,648/月
  总计: ~$53,856/月

节省: $92,160 - $53,856 = ~$38,304/月 (41.6% 节省)
```

#### 6.3.2 ⚡ 高级自动扩缩 (自定义 Metrics HPA)

```yaml
# Sandbox Scheduler HPA — 基于 pending session 请求数 (自定义 metric)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: sandbox-scheduler
  namespace: vi-core
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: sandbox-scheduler
  minReplicas: 2
  maxReplicas: 5
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 30   # 快速扩 (30s 稳定窗口)
    scaleDown:
      stabilizationWindowSeconds: 300  # 慢缩 (5 分钟稳定窗口, 防止抖动)
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

#### 6.3.3 ⚡ Canary 发布 (Gateway API traffic splitting)

**适用场景**: nanoclaw-orchestrator 的调度逻辑变更、sandbox-pod 的 Agent 镜像大版本更新、api-server 的 API 变更。

```yaml
# Gateway API HTTPRoute with traffic splitting
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-server-canary
  namespace: vi-core
spec:
  parentRefs:
  - name: vi-gateway
    namespace: vi-system
  hostnames:
  - "api.yourdomain.com"
  rules:
  - backendRefs:
    - name: api-server-stable
      weight: 95
    - name: api-server-canary
      weight: 5
```

**Canary 发布流程**:

```
1. 部署 canary version (独立 Deployment, 1-2 replicas)
2. Gateway API 切 5% 流量到 canary
3. 观察 1 小时: 检查 error rate, latency, 用户反馈
4. 如果正常 → 提升到 25%
5. 观察 2 小时
6. 如果正常 → 提升到 100% (canary 变成 stable)
7. 删除旧 stable Deployment

Rollback:
  → Gateway API 将 canary weight 设为 0
  → 流量 100% 回到 stable 版本 (秒级回滚)
  → 删除 canary Deployment
  → 调查问题、修复、重新发布
```

**或使用 Flagger 自动 Canary**:

```yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: api-server
  namespace: vi-core
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  progressDeadlineSeconds: 600
  analysis:
    interval: 1m
    threshold: 5        # 5 次失败则自动回滚
    maxWeight: 50        # 最多切 50% 流量
    stepWeight: 10       # 每次增加 10%
    metrics:
    - name: request-success-rate
      thresholdRange:
        min: 99          # 成功率 < 99% → 回滚
    - name: request-duration
      thresholdRange:
        max: 500         # P99 > 500ms → 回滚
```

---

### 6.4 部署策略 (完整 Canary + 蓝绿)

| 服务 | Phase 3 策略 | 理由 |
|------|-------------|------|
| frontend | Rolling | 静态资源 + CDN 缓存，秒级切换，无需复杂策略 |
| api-server | **Canary (5%→25%→100%)** | 10K 用户时 API 变更需要渐进验证。一次性全量发布出问题影响所有用户 |
| vi-realtime | **蓝绿** | WebRTC 长连接不能中断，与 Phase 2 相同 |
| nanoclaw-orch | **Canary (5%→25%→100%)** | 调度逻辑变更影响面大，需要渐进验证 |
| sandbox-scheduler | Rolling (maxUnavailable: 0) | 关键路径但无状态，零停机滚动即可 |
| api-key-proxy | Rolling (maxUnavailable: 0) | 纯代理，无复杂状态 |
| sandbox-pod | **镜像版本渐进替换** | 通过 Warm Pool 自然过渡: Replenisher 创建新 Pod 时使用新镜像，旧 Pod 等会话结束后销毁 |

**Rollback 流程 (Phase 3 各场景)**:

```
场景 1: Canary 发现问题
  1. Gateway API 将 canary weight 设为 0 (秒级)
  2. 流量 100% 回到 stable 版本
  3. 删除 canary Deployment
  4. 调查问题、修复、重新发布

场景 2: 蓝绿部署 (vi-realtime) 发现问题
  1. 将 Service selector 切回 Blue (秒级)
  2. Green 立即停止接收新连接
  3. Green 上的活跃会话继续直到结束
  4. 删除 Green

场景 3: sandbox-pod 新镜像有问题
  1. 更新 Scheduler 配置, 回退到旧 image tag
  2. 标记所有新版 Warm Pool pods 为 DRAINING
  3. 新创建的 Pod 使用旧版镜像
  4. 已分配的新版 Pod 等会话结束后自然销毁
```

---

### 6.5 安全升级

| 安全层 | Phase 2 → Phase 3 变化 | 具体配置 |
|--------|----------------------|---------|
| gVisor | 评估 Kata Containers | 如果出现 gVisor 兼容性问题（某些 npm 包依赖的 syscall），引入 Kata 作为备选 RuntimeClass |
| API Key Proxy | **HA + HPA** | 2 → HPA 2-5，PDB 保证至少 1 replica。支持多 AI provider key 路由（Anthropic + Google） |
| NetworkPolicy | **全 namespace default deny** | 零信任: 所有 namespace 默认拒绝所有通信，每条通信路径必须显式允许。引入 Cilium 考量（L7 policy: HTTP path/method 级别控制） |
| RBAC | **OIDC 集成** | GKE 集群 RBAC 与公司 SSO/OIDC 集成。临时权限用 just-in-time access（时间限制的权限授予） |
| Secret 管理 | **Workload Identity** | Pod 通过 GKE Workload Identity 访问 GCP Secret Manager，不再需要 Service Account Key 文件 |
| 审计日志 | **SIEM 集成** | 所有日志 (GKE Audit + API Proxy + 应用日志) → BigQuery → 实时 SIEM 分析（安全事件关联） |
| 异常检测 | **ML-based** | 从 Phase 2 的阈值告警升级为基于历史模式的异常检测。per-user baseline，不再是全局 10x 阈值 |
| DDoS 防护 | **Cloud Armor WAF 新增** | Gateway 前端部署 Cloud Armor，防止 DDoS 和 Web 攻击。配置 rate limiting、SQL injection 防护、XSS 防护 |
| 渗透测试 | **新增** | 季度渗透测试。重点: Sandbox 逃逸、API Key 泄露、提权攻击、Redis 消息伪造 |
| 容器扫描 | **增强** | 除 CI/CD 漏洞扫描外，增加运行时容器行为监控（如 Falco） |

---

### 6.6 高级监控

#### 分布式追踪 (OpenTelemetry)

全链路 Trace: 用户请求 → api-server → vi-realtime → nanoclaw → scheduler → sandbox pod → AI API → 结果返回

```
[User Browser] ──> [api-server] ──> [vi-realtime] ──> [nanoclaw-orchestrator]
  Trace ID: abc123                                           |
  Span: user_request (total: 45s)                            |
    |-- Span: realtime_session (12s)                         v
    |-- Span: task_dispatch (0.3s)              [sandbox-scheduler]
    |-- Span: pod_acquisition (2.1s)                         |
    |   |-- warm_pool_hit: true                              v
    |   +-- cloud_sync: 1.8s                    [sandbox-pod]
    |-- Span: ai_execution (32s)                             |
    |   |-- context_compile: 2.5s                            |
    |   |-- claude_code_run: 28s                             |
    |   |   +-- api_proxy_call x 5 (total 25s)  [api-key-proxy]
    |   +-- result_publish: 0.5s                             |
    |                                                        v
    +-- Span: result_delivery (0.8s)            [Redis -> api-server -> User]
```

#### Chaos Engineering

```
使用 Litmus Chaos 或 Chaos Mesh 定期注入故障:

1. Pod Kill: 随机杀死 sandbox-scheduler Pod, 验证 HA 切换 < 5s
2. Network Latency: sandbox pod → Redis 延迟 500ms, 验证超时处理
3. Redis 故障: 断开 Redis 连接, 验证降级 (Proxy 本地缓存 token)
4. Spot 回收模拟: 批量终止 20% sandbox pods, 验证 Warm Pool 补充
5. Cloud SQL 故障: 断开数据库, 验证 API 降级响应

频率: 每两周一次 (在 staging 环境)
Phase 3 目标: 所有已知故障场景都有自动恢复或优雅降级
```

#### SLO Dashboard

```
基于 Google SRE 方法论:

SLI (Service Level Indicator):
  - API 成功率: 非 5xx 响应 / 总响应
  - Sandbox 创建延迟: 从请求到 Pod ready 的时间
  - AI 任务完成率: 成功完成 / 总任务数
  - Preview 可用性: preview URL 返回 200 的比率

SLO (Service Level Objective):
  - 99.9% API 可用性 (每月允许 ~43 分钟停机)
  - 95% sandbox 创建 < 10s (含 Warm Pool)
  - 99% AI 任务成功完成
  - 99.5% preview URL 可用

Error Budget:
  - 当 error budget 消耗 > 50% → 暂停新功能开发, 专注稳定性
  - 当 error budget 消耗 > 80% → 冻结非关键变更
```

#### 成本 Dashboard

```
实时成本追踪:
  Row 1: 今日/本周/本月累计成本 (AI API + 基础设施)
  Row 2: Per-user 成本排名 Top 20 (成本异常检测)
  Row 3: 成本趋势图 (是否在预算内)
  Row 4: Spot vs On-Demand 比例 + 节省金额
  Row 5: 预算告警状态 (3 级告警)
```

---

### 6.7 用户 tier 差异化

| 维度 | Free | Pro | Enterprise |
|------|------|-----|-----------|
| **Sandbox CPU** | 1 vCPU | 2 vCPU | 4 vCPU |
| **Sandbox Memory** | 2Gi | 4Gi | 8Gi |
| **Idle Timeout** | 5 min | 15 min | 30 min |
| **Rate Limit (req/min)** | 10 | 100 | 500 |
| **Output Tokens/day** | 50K | 500K | 5M |
| **Warm Pool 优先级** | 低 (冷启动) | 中 (Warm Pool) | 高 (专属 Warm Pod) |
| **Spot/On-Demand** | 100% Spot | 70% Spot | 100% On-Demand |
| **SLA** | Best effort | 99.5% | 99.9% |

**实现**: Scheduler 在 `POST /sessions` 时根据 `tier` 参数选择不同的 Pod template (resource limits) 和 Warm Pool 策略。API Key Proxy 根据 `tier` 应用不同的 rate limit。

---

### 6.8 时间线

| 任务 | 传统估时 | AI 辅助估时 | 说明 |
|------|---------|-----------|------|
| Spot VM 配置 + Scheduler Spot 回收处理 | 5 天 | 2.5 天 | k8s config + 回收事件处理逻辑 |
| Sandbox Scheduler HPA + 高级调度 | 3 天 | 1.5 天 | 自定义 metrics + HPA 调优 |
| API Key Proxy HPA | 1 天 | 0.5 天 | 标准 HPA 配置 |
| Canary 部署配置 (api-server + nanoclaw) | 3 天 | 1 天 | Gateway API traffic splitting 或 Flagger |
| anomaly-detector 服务开发 | 5 天 | 2.5 天 | 异常检测规则 + 自动暂停逻辑 |
| Cloud SQL HA + PgBouncer | 2 天 | 1 天 | GCP 控制台升配 + PgBouncer sidecar |
| Redis 升配 | 1 天 | 0.5 天 | Memorystore 配置变更 |
| 全 namespace NetworkPolicy (default deny) | 3 天 | 1.5 天 | 每个 namespace 独立 policy + 测试 |
| Cloud Armor WAF 部署 | 2 天 | 1 天 | WAF 规则配置 + 测试 |
| OpenTelemetry 分布式追踪 | 5 天 | 2.5 天 | 各服务 SDK 集成 + Trace 后端 |
| SLO Dashboard 建立 | 2 天 | 1 天 | Grafana JSON + Prometheus rules |
| 用户 tier 差异化实现 | 3 天 | 1.5 天 | Scheduler + Proxy 逻辑 |
| GCS 改为 multi-regional | 1 天 | 0.5 天 | GCP 配置 |
| Warm Pool 扩大到 ~100 pods | 1 天 | 0.5 天 | 调整目标参数 |
| Workload Identity 配置 | 2 天 | 1 天 | GKE + IAM 配置 |
| 压力测试 (2000 并发) | 5 天 | 4 天 | 脚本 AI 写, 分析结果人做 |
| 故障注入测试 (Chaos Engineering) | 3 天 | 2 天 | Chaos Mesh 配置 + 场景执行 |
| 缓冲/修 bug | 3 天 | 2 天 | 预留 |
| **总计** | **50 天** | **~27 天** | **2 人并行, 约 3 周** |

---

### 6.9 月度成本估算

#### On-Demand 全价

| 项目 | 规格 | 月成本 (USD) |
|------|------|-------------|
| GKE Autopilot (常驻服务) | api-server(10) + realtime(40) + nanoclaw(10) + scheduler(5) + proxy(3) + anomaly(2) + frontend(2), ~60 vCPU, 60GB RAM | ~$5,000 |
| GKE Autopilot (sandbox pods, On-Demand) | 峰值 2000, 平均 700, 2vCPU + 4GB | ~$66,000 |
| GKE Autopilot (warm pool, On-Demand) | ~100 pods | ~$6,000 |
| Cloud SQL HA | db-custom-4-16384 + replica | ~$500 |
| Memorystore Redis (x2) | Basic 5GB + Standard 5GB + HA | ~$600 |
| GCS (multi-regional) | ~5TB | ~$100 |
| Cloud CDN | 高流量 | ~$300 |
| Networking (Gateway + egress + WAF) | | ~$1,000 |
| Cloud Armor WAF | | ~$500 |
| 可观测性 (Prometheus + Grafana + Loki + OTel) | | ~$1,500 |
| anomaly-detector | 2 pods | ~$100 |
| **基础设施小计 (On-Demand)** | | **~$81,600** |

#### Spot 优化后

| 项目 | 规格 | 月成本 (USD) |
|------|------|-------------|
| GKE Autopilot (常驻服务) | 同上, On-Demand (不能用 Spot) | ~$5,000 |
| GKE Autopilot (sandbox pods, **70% Spot**) | 1400 Spot + 600 On-Demand | ~$54,000 |
| GKE Autopilot (warm pool, **Spot**) | ~100 pods, 全 Spot | ~$3,600 |
| Cloud SQL HA | 同上 | ~$500 |
| Memorystore Redis (x2) | 同上 | ~$600 |
| GCS (multi-regional) | 同上 | ~$100 |
| Cloud CDN | 同上 | ~$300 |
| Networking | 同上 | ~$1,000 |
| Cloud Armor WAF | 同上 | ~$500 |
| 可观测性 | 同上 | ~$1,500 |
| anomaly-detector | 同上 | ~$100 |
| **基础设施小计 (Spot 优化)** | | **~$67,200** |
| **Spot 节省** | | **~$14,400/月** |
| **AI API (Claude)** | ~10K 用户 x 3 任务/天 x 60K tokens, prompt caching + 批量折扣 | ~$190,000 |
| **AI API (Gemini)** | ~10K 用户 x 20 min/天 | ~$35,000 |
| **AI API 小计** | | **~$225,000** |
| **总计 (Spot 优化后)** | | **~$292,000/月** |

> **成本结构**: AI API 占 ~77%，基础设施占 ~23%。每用户成本 ~$29/月（Phase 1 $47 → Phase 2 $38 → Phase 3 $29，规模效应显著）。进一步验证了 briefing 决策 #14: "Spot VM >> Go/Rust 重写"——基础设施优化的上限是 $67K/月，而 AI API 是 $225K/月。真正的成本杠杆是 prompt caching、模型选择、任务调度优化。

---

### 6.10 Phase 2→3 触发条件

| 指标 | Phase 2 设计上限 | 触发阈值 | 最先崩的 | 说明 |
|------|----------------|---------|---------|------|
| 日活用户 (DAU) | 1,000 | >3,000 | - | 综合指标 |
| 并发会话 | ~200 | >500 | **nanoclaw-orch** | 任务调度延迟增大，队列积压 |
| 并发 sandbox pods | 250 (quota) | >200 | **Scheduler** | 2 副本处理 Pod 创建/销毁请求密度不够 |
| Redis-Realtime 内存 | 2GB | >1.5GB | PUB/SUB | 500 路 PUB/SUB 通道内存消耗 |
| Redis-State 内存 | 2GB | >1.5GB | Session registry | 500 session + warm pool 队列 |
| Cloud SQL 连接数 | ~100 | >80 | PgBouncer | 连接池耗尽导致 API 请求阻塞 |
| Cloud SQL CPU | 2 vCPU | >70% | 查询延迟 | 高频 CRUD 导致延迟增大 |
| Gateway HTTPRoute 数量 | ~250 | >200 | 路由延迟 | 动态 HTTPRoute 过多导致 Gateway 配置延迟 |
| 月度基础设施成本 | ~$7K | >$15K | 预算 | 需要 Spot 优化 |
| 安全事件 | 0 | >0 严重 | 信誉 | 需要 WAF + 高级监控 |

**最先崩的**: **Scheduler（Pod 创建/管理请求密度）** 和 **Cloud SQL（连接数 + CPU）**。500 并发意味着 Scheduler 每分钟可能处理 ~50 个 Pod 创建请求（用户陆续加入），2 副本的固定 Scheduler 需要升级为 HPA。Cloud SQL 2 vCPU 在高频查询下成为瓶颈，需要升配 + 连接池。

---

---

## 7. 跨阶段专题

### 7.1 CI/CD Pipeline 演进

CI/CD 是从 docker-compose 迁移到 k8s 后最先感知到变化的开发者体验环节。三个阶段的 pipeline 复杂度递增，但核心目标不变：**代码提交到生产环境的路径必须自动化、可审计、可回滚。**

#### Phase 1: 基础 GitHub Actions — docker build → push → kubectl apply

Phase 1 的 pipeline 追求"能用就行"——单个 workflow 文件，所有服务一起构建部署。50 用户规模下，部署频率低（每天 1-3 次），不需要复杂的变更检测和分服务 pipeline。

**设计理由**:
- 团队刚从 docker-compose 迁移，需要最短路径验证 k8s 部署流程
- 50 用户容忍短暂中断（Rolling Update 足够）
- 单 pipeline 简化调试——出问题只看一个地方

```yaml
# .github/workflows/deploy-gke.yml — Phase 1 完整 workflow
name: Deploy to GKE
on:
  push:
    branches: [pre-launch]

env:
  PROJECT_ID: vi-agent-prod
  REGION: us-central1
  REGISTRY: us-central1-docker.pkg.dev/vi-agent-prod/vi-agent
  CLUSTER: vi-agent-prod

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Auth to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_SA_EMAIL }}

      - name: Setup gcloud
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Build & Push Images
        run: |
          SERVICES="api-server frontend nanoclaw realtime"
          for service in $SERVICES; do
            echo "Building $service..."
            docker build \
              -t ${{ env.REGISTRY }}/$service:${{ github.sha }} \
              -t ${{ env.REGISTRY }}/$service:latest \
              ./$service
            docker push ${{ env.REGISTRY }}/$service:${{ github.sha }}
            docker push ${{ env.REGISTRY }}/$service:latest
          done

      - name: Get GKE Credentials
        uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: ${{ env.CLUSTER }}
          location: ${{ env.REGION }}

      - name: Deploy to GKE
        run: |
          TAG=${{ github.sha }}
          kubectl set image deployment/api-server \
            api-server=${{ env.REGISTRY }}/api-server:$TAG \
            -n vi-core
          kubectl set image deployment/frontend \
            frontend=${{ env.REGISTRY }}/frontend:$TAG \
            -n vi-frontend
          kubectl set image deployment/vi-realtime \
            vi-realtime=${{ env.REGISTRY }}/realtime:$TAG \
            -n vi-realtime
          kubectl set image deployment/nanoclaw-orchestrator \
            nanoclaw=${{ env.REGISTRY }}/nanoclaw:$TAG \
            -n vi-core

      - name: Wait for Rollout
        run: |
          kubectl rollout status deployment/api-server -n vi-core --timeout=300s
          kubectl rollout status deployment/frontend -n vi-frontend --timeout=300s
          kubectl rollout status deployment/vi-realtime -n vi-realtime --timeout=300s
          kubectl rollout status deployment/nanoclaw-orchestrator -n vi-core --timeout=300s

      - name: Smoke Test
        run: |
          API_URL=$(kubectl get svc api-server -n vi-core -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
          curl -f http://$API_URL/health || exit 1
          echo "Smoke test passed"
```

#### Phase 2: 分服务 Pipeline + Staging 环境 + 变更检测

Phase 2 将单一 pipeline 拆分为 per-service pipeline，引入 `paths` 过滤只构建变更的服务。同时增加 staging 环境用于 PR 验证。

**设计理由**:
- 1000 用户规模下部署频率增加（每天 3-10 次），全量构建浪费 CI 时间
- 多服务（含 sandbox-scheduler、api-key-proxy）需要独立发布节奏
- staging 环境验证 PR 变更，避免直接影响生产

```
.github/workflows/
├── deploy-api-server.yml          # api-server/** 变更时触发
├── deploy-frontend.yml            # frontend/** 变更时触发
├── deploy-nanoclaw.yml            # nanoclaw/** 变更时触发
├── deploy-realtime.yml            # realtime/** 变更时触发
├── deploy-sandbox-scheduler.yml   # sandbox-scheduler/** 变更时触发
├── deploy-api-key-proxy.yml       # api-key-proxy/** 变更时触发
├── build-sandbox-image.yml        # nanoclaw/container/** 变更时触发
└── staging-e2e.yml                # 所有 PR 自动部署 staging + e2e
```

**per-service workflow 模板**（以 api-server 为例）:

```yaml
# .github/workflows/deploy-api-server.yml
name: Deploy api-server
on:
  push:
    branches: [pre-launch]
    paths:
      - 'api-server/**'
      - 'k8s/base/api-server/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Run Tests
        run: |
          cd api-server
          pip install -r requirements-dev.txt
          pytest tests/ -v --cov=app --cov-report=xml

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_SA_EMAIL }}
      - name: Build & Push
        run: |
          gcloud auth configure-docker us-central1-docker.pkg.dev
          docker build -t $REGISTRY/api-server:${{ github.sha }} ./api-server
          docker push $REGISTRY/api-server:${{ github.sha }}
      - name: Trivy Vulnerability Scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/api-server:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: 1

  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: vi-agent-prod
          location: us-central1
      - name: Deploy to Staging
        run: |
          kubectl set image deployment/api-server \
            api-server=$REGISTRY/api-server:${{ github.sha }} \
            -n staging
          kubectl rollout status deployment/api-server -n staging --timeout=300s

  e2e-test:
    needs: deploy-staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E Tests against Staging
        run: |
          cd tests/e2e
          npm ci
          STAGING_URL=https://staging.yourdomain.com npx playwright test

  deploy-production:
    needs: e2e-test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: vi-agent-prod
          location: us-central1
      - name: Deploy to Production
        run: |
          kubectl set image deployment/api-server \
            api-server=$REGISTRY/api-server:${{ github.sha }} \
            -n vi-core
          kubectl rollout status deployment/api-server -n vi-core --timeout=300s
```

**Staging 环境配置**: 使用独立 namespace `staging`，replica 数量更少（各服务 1 replica），共享同一 GKE 集群但使用独立 Redis/DB 连接配置。

#### Phase 3: Canary 自动化 + Flagger/Argo Rollouts + 镜像晋升

Phase 3 引入 Canary 自动化，高风险服务（api-server、nanoclaw-orchestrator）的部署不再直接全量发布，而是渐进切流 + 自动回滚。

**设计理由**:
- 10,000 用户规模下任何故障影响面大，必须渐进验证
- Canary 基于 metrics 自动推进/回滚，减少人工干预
- 镜像晋升流程确保只有通过完整验证的镜像才能进入生产

```yaml
# 使用 Flagger 实现自动 Canary
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: api-server
  namespace: vi-core
spec:
  provider: gatewayapi:v1
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  gatewayRefs:
    - name: vi-gateway
      namespace: vi-system
  progressDeadlineSeconds: 600
  service:
    port: 8000
    targetPort: 8000
  analysis:
    # Canary 推进时间表
    interval: 1m           # 每分钟评估一次
    threshold: 5           # 5 次评估失败则回滚
    maxWeight: 50          # 最多切 50% 流量到 canary
    stepWeight: 10         # 每次推进增加 10% 流量
    # Canary 健康指标
    metrics:
      - name: request-success-rate
        templateRef:
          name: request-success-rate
          namespace: vi-system
        thresholdRange:
          min: 99            # 成功率必须 >= 99%
        interval: 1m
      - name: request-duration
        templateRef:
          name: request-duration
          namespace: vi-system
        thresholdRange:
          max: 500           # P99 延迟必须 < 500ms
        interval: 1m
    # 告警（可选，Canary 开始/成功/回滚时通知）
    alerts:
      - name: slack-notification
        severity: info
        providerRef:
          name: slack
          namespace: vi-system
```

**手动 Canary 方案（不使用 Flagger）**:

```yaml
# k8s/overlays/canary/api-server-canary.yaml
# Gateway API HTTPRoute traffic splitting
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-server-canary
  namespace: vi-core
spec:
  parentRefs:
    - name: vi-gateway
      namespace: vi-system
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-server-stable
          port: 8000
          weight: 95
        - name: api-server-canary
          port: 8000
          weight: 5
```

**Phase 3 各服务部署策略总结**:

| 服务 | 策略 | 推进方式 | 回滚方式 |
|------|------|---------|---------|
| frontend | Rolling Update | kubectl set image | kubectl rollout undo |
| api-server | Canary (5% → 25% → 50% → 100%) | Flagger 自动/手动 | canary weight → 0 |
| vi-realtime | 蓝绿部署 | Service selector 切换 | selector 切回旧版 |
| nanoclaw-orch | Canary (5% → 25% → 50% → 100%) | Flagger 自动/手动 | canary weight → 0 |
| sandbox-scheduler | Rolling (maxUnavailable: 0) | kubectl set image | kubectl rollout undo |
| api-key-proxy | Rolling | kubectl set image | kubectl rollout undo |
| sandbox-pod | 镜像版本渐进替换 | Warm Pool 自然过渡 | 回退 image tag |

**镜像晋升流程（Phase 3）**:

```
开发者 push → CI build → Artifact Registry (:sha-xxx)
    ↓
Staging 自动部署 → E2E 测试通过
    ↓
镜像 tag 晋升: :sha-xxx → :staging-approved
    ↓
Production Canary 部署 → Metrics 验证
    ↓
Canary 通过 → 镜像 tag 晋升: → :production
    ↓
/team-rc promote → Main 分支
```

**容器镜像管理策略**:

```
Artifact Registry (us-central1-docker.pkg.dev/vi-agent-prod/vi-agent):
├── api-server
│   ├── :{git-sha}       # 每次构建
│   ├── :staging          # staging 验证通过
│   ├── :production       # 生产环境当前版本
│   └── :v1.2.3           # 语义化版本（release tag）
├── frontend
├── nanoclaw-orchestrator
├── vi-realtime
├── sandbox-scheduler
├── api-key-proxy
└── sandbox              # Sandbox Pod 基础镜像
    ├── :base             # Node.js + Claude Code SDK
    └── :{build-date}     # 定期重建（安全补丁）

镜像清理策略:
- 保留最近 30 个 sha tag
- 保留所有语义化版本 tag（永不删除）
- 30 天以上未使用的 sha tag 自动清理（Artifact Registry lifecycle policy）
```

---

### 7.2 本地开发体验

#### 核心原则

**本地使用 docker-compose，k8s 只用于 staging/production。**

开发者不需要在本地运行 k8s（minikube/kind）。这个设计决策基于以下理由：

1. docker-compose 启动更快（~10s vs minikube ~60s），资源占用更少
2. NanoClaw 的 Docker 容器模式在本地仍然有效（本地开发不需要 k8s 原生隔离）
3. 本地不需要 Sandbox Scheduler、API Key Proxy 等 k8s 专属服务
4. 保持开发体验简单——开发者只需 `docker compose up -d` 即可开始工作

#### 本地 vs 远程的差异处理

```
                    本地 (docker-compose)           远程 (k8s)
──────────────────────────────────────────────────────────────────
api-server          container                     Deployment + HPA
frontend            container (Vite dev)          Deployment + CDN
vi-realtime         container (1 instance)        Deployment + HPA + PDB
nanoclaw            container + Docker socket     Deployment (无状态)
sandbox 执行        Docker 容器 (DooD)             Sandbox Pod (k8s)
Redis               container (单实例)             Memorystore (托管)
PostgreSQL          container                     Cloud SQL (托管)
API Key             env 直传 (.env.local)          API Key Proxy
预览                localhost:3000                 *.preview.domain.com
监控                无 (console 日志)               Prometheus + Grafana
```

#### Dev → Staging → Production 晋升流程

```
开发者本地 (docker-compose)
    │
    │  git push → PR
    ▼
Staging (GKE namespace: staging)
    │  ← 自动部署 + 自动 e2e 测试
    │  ← PR review + CI 通过
    ▼  PR merge → pre-launch
Production (GKE namespace: vi-core / vi-realtime / vi-sandbox)
    │  ← Canary 部署 (Phase 3) 或 Rolling Update (Phase 1-2)
    ▼  /team-rc promote
Main (最终稳定版)
```

#### 开发者工作流

```bash
# 1. 启动本地环境
docker compose up -d

# 2. 开发 (hot reload)
#    api-server: uvicorn --reload
#    frontend: vite dev
#    nanoclaw: tsx watch

# 3. 本地测试
#    单元测试: 各服务内运行 (pytest / vitest)
#    集成测试: 使用本地 docker-compose 的 Redis/PostgreSQL
#    e2e 测试: Playwright 或手动

# 4. 提交 PR
git push origin mission/xxx

# 5. CI 自动部署到 staging (k8s) → 运行 staging e2e 测试

# 6. PR 合入 pre-launch → 自动部署到 production (k8s)
```

#### Sandbox Pod 的本地测试

Phase 2 开发期间，需要在本地测试 task-server。方案：

```bash
# 本地启动 task-server（不需要 k8s）
cd nanoclaw/container/task-server
npm run dev  # 启动 HTTP :8080

# 本地 NanoClaw 通过 feature flag 切换
USE_SANDBOX_SCHEDULER=false  # 使用 Docker（本地默认）
USE_SANDBOX_SCHEDULER=true   # 使用 HTTP（需要先启动 task-server）
```

#### 测试策略

| 测试层 | 运行环境 | 工具 | 频率 |
|--------|---------|------|------|
| 单元测试 | 本地 / CI | pytest / vitest | 每次 commit |
| 集成测试 | 本地 docker-compose | pytest + Redis mock | 每次 PR |
| e2e 测试 (功能) | Staging (k8s) | Playwright | 每次 PR merge |
| e2e 测试 (语音) | Staging (k8s) | 自定义 LiveKit 测试客户端 | 每次 PR merge |
| 负载测试 | Staging (k8s) | k6 / Locust | 每个 Phase 完成后 |
| Chaos 测试 | Staging (k8s) | Chaos Mesh | Phase 2+ |
| 安全渗透测试 | Staging (k8s) | 手动 (Phase 1-2) / 第三方 (Phase 3) | 季度 |

---

### 7.3 存储架构演进

#### 三层存储模型

存储方案的核心决策（briefing #2）: **emptyDir (SSD) + GCS cloud-sync，无 PVC。** 这个决策基于 "AI 生成临时项目" 的使用模式——项目文件体积小（通常 <100 个文件），对话历史才是真正的 "源码"，项目可以从对话重新生成。

```
+========================================================================+
|                        三层存储架构 (Hot / Warm / Cold)                   |
|========================================================================|
|                                                                        |
|  HOT 层: emptyDir (Pod-local SSD)                      [Phase 1+]     |
|  +------------------------------------------------------------------+ |
|  | 生命周期 = Pod                                                    | |
|  | 性能: 本地 SSD IOPS (100K+ random read)                          | |
|  | 内容:                                                             | |
|  |   - node_modules (npm install 产物)                               | |
|  |   - 编译缓存 (.next/, dist/)                                     | |
|  |   - 运行时文件 (dev server 临时文件)                               | |
|  |   - 工作区项目文件 (用户代码、配置)                                | |
|  | 大小限制: 10GB per pod (LimitRange enforced)                      | |
|  | 数据丢失: Pod 销毁时消失 → 必须先 cloud-sync to GCS              | |
|  +------------------------------------------------------------------+ |
|                           |                                            |
|                           | cloud-sync (SHA-256 增量同步)                |
|                           v                                            |
|  WARM 层: 共享缓存 (GCS Fuse ReadOnlyMany)             [Phase 2+]     |
|  +------------------------------------------------------------------+ |
|  | 类型: GCS Fuse CSI Driver + 本地缓存                              | |
|  | 内容:                                                             | |
|  |   - npm 全局缓存 (~2GB)                                          | |
|  |   - 常用项目模板 (React/Next.js/Vue scaffolding)                  | |
|  |   - 工具包预安装 (typescript, eslint, prettier)                   | |
|  | 访问模式: ReadOnlyMany (所有 sandbox pods 共享读取)               | |
|  | 作用: 避免每个 Pod 重新 npm install react 全家桶                  | |
|  |       典型项目 npm install: 无缓存 ~30-60s → 有缓存 ~3-5s        | |
|  | Phase 1: 不引入，10 个并发 Pod 各自 npm install 可接受             | |
|  | Phase 2+: 200 并发 Pod 同时 npm install → registry 压力 + 时间    | |
|  +------------------------------------------------------------------+ |
|                           |                                            |
|                           v                                            |
|  COLD 层: GCS (对象存储, 无限容量)                      [Phase 1+]     |
|  +------------------------------------------------------------------+ |
|  | 路径: gs://vi-agent-data/{userId}/{projectId}/                    | |
|  | 内容:                                                             | |
|  |   - 用户项目文件 (代码、配置、资源文件)                           | |
|  |   - 用户 memory (identity/semantic/episodic)                      | |
|  |   - session 历史存档                                              | |
|  |   - 历史项目存档                                                  | |
|  | 同步机制: cloud-sync.ts (已有，nanoclaw/src/fs/cloud-sync.ts)     | |
|  |   - 启动: GCS → emptyDir (增量下载, SHA-256 哈希比对)            | |
|  |   - 完成: emptyDir → GCS (增量上传)                               | |
|  |   - 中间检查点: 每 5 分钟自动 sync (防 Node 故障丢数据)           | |
|  | 成本: $0.02/GB/月 (Standard) / $0.01/GB/月 (Nearline for archive) | |
|  +------------------------------------------------------------------+ |
+========================================================================+
```

#### 各层引入时机

| 存储层 | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Hot (emptyDir) | 10GB/pod, 15 pods | 10GB/pod, 250 pods | 10GB/pod, 2500 pods |
| Warm (GCS Fuse) | 不引入 | 引入，~2GB 共享缓存 | 扩大，评估 Filestore |
| Cold (GCS) | Standard, <100GB | Standard, <1TB | Multi-regional, ~5TB |

#### Warm Cache (Phase 2+) 实现

```yaml
# GCS Fuse 挂载为只读共享缓存
apiVersion: v1
kind: Pod
metadata:
  annotations:
    gke-gcsfuse/volumes: "true"    # 启用 GCS Fuse sidecar
spec:
  volumes:
    - name: shared-cache
      csi:
        driver: gcsfuse.csi.storage.gke.io
        readOnly: true
        volumeAttributes:
          bucketName: vi-agent-shared-cache
          mountOptions: "implicit-dirs,max-conns-per-host=0"
    - name: workspace
      emptyDir:
        sizeLimit: 10Gi
  containers:
    - name: agent
      volumeMounts:
        - name: shared-cache
          mountPath: /cache
          readOnly: true
        - name: workspace
          mountPath: /workspace
```

**缓存内容预构建**:

```
gs://vi-agent-shared-cache/
├── npm-cache/            # npm 全局缓存 (~2GB)
├── templates/
│   ├── react-vite/       # create-react-app 预构建 (含 node_modules)
│   ├── nextjs/           # create-next-app 预构建
│   └── vue/              # create-vue 预构建
└── tools/
    └── node_modules/     # 常用工具包预安装 (typescript, eslint, etc.)
```

Pod 内 npm 配置: `npm config set cache /cache/npm-cache --global`

**Phase 3 评估**: 如果 GCS Fuse 延迟不可接受（首次读取 ~100-200ms），考虑 Filestore (NFS):
- Basic HDD tier: $0.20/GB/月，1TB = $200/月
- 性能: ~100MB/s 吞吐，连接数限制 10K（Phase 3 的 2000 pods 远未触达）

---

### 7.4 数据库演进

PostgreSQL 存储的数据不包含项目文件（那在 GCS），主要是:
- `agent_memories` 表 (用户记忆，context compiler 读取)
- `agent_sessions` 表 (会话历史)
- `users` 表, 权限, 配置
- `usage_daily` 表 (API 使用量聚合)

#### 三阶段 Cloud SQL 规格

```
Phase 1: Cloud SQL db-f1-micro
  ┌─────────────────────────────────────┐
  │  CPU: 1 shared vCPU                 │
  │  RAM: 614MB                         │
  │  Storage: 10GB SSD (auto-increase)  │
  │  HA: 否 (ZONAL)                    │
  │  连接池: 无需 (直连即可)            │
  │  备份: 每日自动, 保留 7 天           │
  │  月成本: ~$10                       │
  │  支撑: 50 用户 CRUD, 绰绰有余       │
  └─────────────────────────────────────┘

Phase 2: Cloud SQL db-custom-2-8192
  ┌─────────────────────────────────────┐
  │  CPU: 2 vCPU                        │
  │  RAM: 8GB                           │
  │  Storage: 50GB SSD (auto-increase)  │
  │  HA: 否 (ZONAL, Phase 2 尚不需要)  │
  │  连接池: Cloud SQL Auth Proxy       │
  │  备份: 每日自动, 保留 14 天          │
  │  月成本: ~$120                      │
  │  支撑: 1000 用户, ~100 并发连接      │
  └─────────────────────────────────────┘

Phase 3: Cloud SQL db-custom-4-16384 + HA
  ┌─────────────────────────────────────┐
  │  CPU: 4 vCPU                        │
  │  RAM: 16GB                          │
  │  Storage: 100GB SSD (auto-increase) │
  │  HA: 是 (REGIONAL, 自动故障转移)   │
  │  连接池: PgBouncer (sidecar)        │
  │  备份: 每日自动 + PITR, 保留 30 天  │
  │  Read Replica: 按需 (读负载瓶颈时)  │
  │  月成本: ~$500                      │
  │  支撑: 10,000 用户, ~500 并发连接   │
  └─────────────────────────────────────┘
```

#### 连接池策略

Phase 1-2: 各服务直连 Cloud SQL（通过 Cloud SQL Auth Proxy sidecar），连接数足够。

Phase 3: 引入 PgBouncer 连接池（部署为 sidecar 或独立 Deployment），原因:
- 10 个 api-server pod × 10 连接/pod = 100 连接
- 15 个 sandbox-scheduler pod × 5 连接/pod = 75 连接
- 总计 ~175 并发连接，接近 Cloud SQL 4vCPU 的默认 max_connections (~200)
- PgBouncer transaction pooling 可以将 175 逻辑连接复用到 ~30 物理连接

#### 备份与恢复

| 阶段 | 备份策略 | RPO | RTO |
|------|---------|-----|-----|
| Phase 1 | 每日自动快照 | 24h | 1h (快照恢复) |
| Phase 2 | 每日 + PITR | 5min | 30min |
| Phase 3 | 每日 + PITR + HA | 0 (HA 自动切换) | <60s (HA) |

**是否需要分库**: Phase 3 (10K 用户) 不需要。Cloud SQL 单实例 4vCPU/16GB 可以轻松支撑 10K 用户的 CRUD 负载。分库的触发点是 ~50K 并发写入/秒或 >1TB 数据量。

---

### 7.5 Redis 演进

Redis 在 VI Agent 中承担多种角色：PUB/SUB 实时通信、KV 状态存储、Session Registry。随着并发增长，这些角色之间的资源竞争使得拆分成为必要。

#### Phase 1: 单实例混合使用

```
Memorystore Basic, 1GB
┌───────────────────────────────────────────────┐
│                                               │
│  PUB/SUB Channels:                            │
│  ├── vi:stream:{userId}  → 执行结果流          │
│  ├── vi:exec:{userId}    → 任务请求            │
│  ├── vi:ctx:{userId}     → 上下文更新          │
│  └── vi:intent:{userId}  → 意图预测            │
│                                               │
│  KV State:                                    │
│  ├── sandbox:sessions:{userId} → Pod 信息      │
│  ├── vi:task-sessions (Hash) → taskId→sessId  │
│  ├── session:{token} → 验证数据                │
│  └── ratelimit:{userId}:{minute} → 计数器      │
│                                               │
│  月成本: ~$35                                  │
│  支撑: 50 用户, ~10 并发 PUB/SUB 通道          │
└───────────────────────────────────────────────┘
```

#### Phase 2: 拆分 Realtime + State

```
                       ┌──────────────────────────┐
                       │    所有服务连接配置变更     │
                       │  REDIS_REALTIME_URL=...   │
                       │  REDIS_STATE_URL=...      │
                       └──────────┬───────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                                       │
  ┌───────────┴───────────────┐       ┌───────────────┴──────────────┐
  │  Redis-Realtime           │       │  Redis-State                 │
  │  Memorystore Basic, 2GB   │       │  Memorystore Standard, 2GB   │
  │  无 Replica (省成本)      │       │  有 Replica (HA)             │
  │                           │       │                              │
  │  PUB/SUB:                 │       │  Hash:                       │
  │  ├── vi:stream:*          │       │  ├── sandbox:sessions:*      │
  │  ├── vi:exec:*            │       │  ├── vi:task-sessions        │
  │  ├── vi:ctx:*             │       │  ├── session:* (token 验证)  │
  │  └── vi:intent:*          │       │  └── warm-pool (Sorted Set)  │
  │                           │       │                              │
  │  特点:                    │       │  KV:                         │
  │  - 高吞吐 PUB/SUB        │       │  ├── ratelimit:*             │
  │  - 不需要持久化           │       │  ├── usage:*                 │
  │  - 消息即时消费           │       │  └── context-cache:*         │
  │  - 丢失影响: 消息延迟     │       │                              │
  │                           │       │  特点:                       │
  │  月成本: ~$70             │       │  - 需要持久化                │
  │                           │       │  - session registry 丢失 =    │
  └───────────────────────────┘       │    所有活跃 Pod 失联          │
                                      │  - 丢失影响: 服务中断         │
                                      │                              │
                                      │  月成本: ~$130               │
                                      └──────────────────────────────┘
```

**为什么 Phase 2 就拆**: 200 并发意味着 200 路 PUB/SUB 通道 + 200 路 session state 查询。PUB/SUB 的 CPU 消耗（消息分发）与 KV 操作（HGET/HSET）在单实例上竞争，导致 P99 延迟升高。

**代码变更**: 所有服务需要支持两个 Redis URL (`REDIS_REALTIME_URL` + `REDIS_STATE_URL`)。影响: api-server, nanoclaw, sandbox-scheduler, vi-realtime。变更量不大但需仔细测试。

#### Phase 3: 升配 + 评估 Cluster

```
Redis-Realtime: Basic, 5GB
  - 2000 并发 PUB/SUB 通道
  - 每通道 ~1KB/msg × 10msg/s = 20MB/s 吞吐
  - 月成本: ~$175

Redis-State: Standard, 5GB + Replica
  - session registry: 2000 entries × ~1KB = 2MB (很小)
  - 主要内存消耗: 任务状态缓存、用户上下文缓存、rate limit 计数器
  - 月成本: ~$425
```

**Redis Cluster 引入时机**: 当单实例 Redis 的内存或 CPU 不够时。预计 ~5 万并发才会触达。Phase 3 (10K 用户, ~2K 并发) 远不到这个点。

**是否考虑 Dragonfly**: Phase 3 可以评估。Dragonfly 是 Redis 兼容的替代品，多线程架构在同等硬件上性能 25x+，但运维生态不如 Memorystore。

---

### 7.6 Incident Response

#### 各阶段 Top 5 事件完整 Runbook

##### Incident 1: Sandbox Pod 创建失败

```
┌─────────────────────────────────────────────────────────────────┐
│  INCIDENT: Sandbox Pod 创建持续失败                               │
├─────────────────────────────────────────────────────────────────┤
│  症状:                                                          │
│  - scheduler_pod_create_failures 持续上升                       │
│  - 用户报告 "AI 无法执行编程"                                    │
│  - Grafana Dashboard "Sandbox 生命周期" 显示创建成功率下降        │
│                                                                 │
│  严重性: P1 (核心功能不可用)                                     │
│  适用阶段: Phase 1-3                                            │
├─────────────────────────────────────────────────────────────────┤
│  排查步骤:                                                       │
│                                                                 │
│  Step 1: 检查最近 events                                        │
│  $ kubectl get events -n vi-sandbox \                            │
│      --sort-by='.lastTimestamp' | head -20                      │
│                                                                 │
│  Step 2: 检查 Scheduler 日志                                    │
│  $ kubectl logs -n vi-core deploy/sandbox-scheduler \            │
│      --tail=100 --since=10m                                     │
│                                                                 │
│  Step 3: 检查集群资源                                            │
│  $ kubectl describe nodes | grep -A5 "Allocated resources"      │
│                                                                 │
│  Step 4: 检查 Autopilot 扩容状态                                 │
│  $ gcloud container operations list \                            │
│      --filter="status=RUNNING" --format="table(name,status)"    │
│                                                                 │
│  Step 5: 检查 ResourceQuota                                     │
│  $ kubectl describe resourcequota sandbox-quota -n vi-sandbox   │
│                                                                 │
│  Step 6: 检查镜像拉取                                            │
│  $ kubectl get pods -n vi-sandbox \                              │
│      --field-selector=status.phase=Pending -o wide              │
│  $ kubectl describe pod <pending-pod> -n vi-sandbox             │
├─────────────────────────────────────────────────────────────────┤
│  常见原因 + 修复:                                                │
│                                                                 │
│  a) Autopilot 扩容慢 (最常见):                                   │
│     原因: Autopilot 在创建新 Node，通常 2-5 分钟                 │
│     修复: 等待。如果持续 >10 分钟，检查 GKE Operations           │
│     预防: 维持适当大小的 Warm Pool                               │
│                                                                 │
│  b) 镜像拉取失败:                                                │
│     原因: Artifact Registry 权限、镜像 tag 错误、网络问题        │
│     修复:                                                        │
│     $ gcloud artifacts docker images list \                      │
│         us-central1-docker.pkg.dev/PROJECT/REPO/sandbox          │
│     确认镜像存在且 SA 有 artifactregistry.reader 权限            │
│                                                                 │
│  c) ResourceQuota 超限:                                          │
│     原因: 活跃 Pod 数超过 namespace quota                        │
│     修复:                                                        │
│     $ kubectl patch resourcequota sandbox-quota -n vi-sandbox \  │
│         -p '{"spec":{"hard":{"pods":"20"}}}'                    │
│     同时清理 idle Pod:                                           │
│     $ kubectl delete pod -n vi-sandbox -l status=idle            │
│                                                                 │
│  d) gVisor RuntimeClass 不可用:                                  │
│     原因: Autopilot 集群配置问题 (极罕见)                        │
│     修复: 检查 GKE 集群版本，确认 Autopilot 功能正常              │
│     降级: 临时使用标准 RuntimeClass (牺牲隔离性)                  │
├─────────────────────────────────────────────────────────────────┤
│  预防措施:                                                       │
│  - Warm Pool 保持 >= 5 个预热 Pod                                │
│  - ResourceQuota 预留 20% buffer                                │
│  - 告警: pod_create_failure_rate > 10% 持续 5 分钟               │
└─────────────────────────────────────────────────────────────────┘
```

##### Incident 2: API Key Proxy 不可用 (P0)

```
┌─────────────────────────────────────────────────────────────────┐
│  INCIDENT: API Key Proxy 不可用                                  │
├─────────────────────────────────────────────────────────────────┤
│  症状:                                                          │
│  - 所有 AI 编程任务超时                                          │
│  - proxy_requests_total 归零                                    │
│  - Sandbox Pod 日志: "ANTHROPIC_API_KEY invalid" 或超时           │
│                                                                 │
│  严重性: P0 (完全中断 — 所有 AI 功能不可用)                      │
│  适用阶段: Phase 1-3                                            │
├─────────────────────────────────────────────────────────────────┤
│  排查步骤:                                                       │
│                                                                 │
│  Step 1: 检查 Proxy Pod 状态                                    │
│  $ kubectl get pods -n vi-core -l app=api-key-proxy -o wide     │
│                                                                 │
│  Step 2: 检查 Proxy 日志                                        │
│  $ kubectl logs -n vi-core deploy/api-key-proxy \                │
│      --tail=50 --since=5m                                       │
│                                                                 │
│  Step 3: 测试 Redis 连通性                                      │
│  $ kubectl exec -n vi-core deploy/api-key-proxy -- \             │
│      node -e "require('ioredis').default('redis://...')"        │
│      .then(r => r.ping()).then(console.log)"                    │
│                                                                 │
│  Step 4: 测试上游 API 连通性                                     │
│  $ kubectl exec -n vi-core deploy/api-key-proxy -- \             │
│      curl -s -o /dev/null -w "%{http_code}" \                   │
│      https://api.anthropic.com/v1/messages                      │
│                                                                 │
│  Step 5: 检查 k8s Secret                                        │
│  $ kubectl get secret vi-api-keys -n vi-core -o yaml | \         │
│      grep -c "ANTHROPIC_API_KEY"                                │
├─────────────────────────────────────────────────────────────────┤
│  常见原因 + 修复:                                                │
│                                                                 │
│  a) Pod OOM:                                                    │
│     修复: 增加内存限制                                           │
│     $ kubectl patch deploy api-key-proxy -n vi-core \            │
│         -p '{"spec":{"template":{"spec":{"containers":[{        │
│         "name":"api-key-proxy","resources":{"limits":{           │
│         "memory":"256Mi"}}}]}}}}'                                │
│                                                                 │
│  b) Redis 连接失败:                                              │
│     修复: 检查 Memorystore 状态                                  │
│     $ gcloud redis instances describe vi-agent-redis \            │
│         --region=us-central1 --format="value(state)"            │
│                                                                 │
│  c) 上游 API 超时导致连接池耗尽:                                  │
│     修复: 重启 Proxy + 增大超时/连接池                            │
│     $ kubectl rollout restart deploy/api-key-proxy -n vi-core   │
│                                                                 │
│  紧急修复 (如果以上都无效):                                       │
│  1. 扩容: kubectl scale deploy/api-key-proxy -n vi-core \        │
│       --replicas=3                                              │
│  2. 终极回滚 (牺牲安全): 临时将真实 API key 直接注入              │
│     Sandbox Pod env。事后必须清理并追查根因。                     │
│     这打破了 Zero Trust 原则，仅在 P0 且其他方案均失败时使用。    │
├─────────────────────────────────────────────────────────────────┤
│  预防措施:                                                       │
│  - PDB 保证至少 1 replica 存活                                   │
│  - Proxy 本地缓存最近 1000 个 token (LRU, 5min TTL)             │
│  - Phase 2+: 至少 2 replica + 跨 AZ 部署                        │
│  - 告警: proxy_error_rate > 5% 持续 2 分钟 → PagerDuty          │
└─────────────────────────────────────────────────────────────────┘
```

##### Incident 3: 用户数据丢失 (Cloud-Sync)

```
┌─────────────────────────────────────────────────────────────────┐
│  INCIDENT: 用户数据丢失 (Cloud-Sync 失败)                        │
├─────────────────────────────────────────────────────────────────┤
│  症状:                                                          │
│  - 用户报告项目文件消失                                          │
│  - cloud_sync_failures_total 上升                               │
│  - Sandbox Pod 日志有 GCS 相关错误                               │
│                                                                 │
│  严重性: P1 (数据丢失风险)                                       │
├─────────────────────────────────────────────────────────────────┤
│  排查步骤:                                                       │
│                                                                 │
│  Step 1: 检查 Sandbox Pod 日志中的 cloud-sync 错误              │
│  $ kubectl logs -n vi-sandbox <pod-name> | grep -i "cloud-sync" │
│                                                                 │
│  Step 2: 检查 GCS 是否有数据                                    │
│  $ gsutil ls gs://vi-agent-data/{userId}/{projectId}/           │
│                                                                 │
│  Step 3: 检查 GCS 版本历史 (如果开启了 Versioning)              │
│  $ gsutil ls -la gs://vi-agent-data/{userId}/{projectId}/       │
│                                                                 │
│  Step 4: 检查 GCS IAM 权限                                     │
│  $ gcloud storage buckets get-iam-policy gs://vi-agent-data     │
│                                                                 │
│  Step 5: 检查网络连通性                                          │
│  $ kubectl exec -n vi-sandbox <pod-name> -- \                    │
│      curl -s https://storage.googleapis.com                     │
├─────────────────────────────────────────────────────────────────┤
│  常见原因 + 修复:                                                │
│                                                                 │
│  a) GCS IAM 变更导致写入失败:                                    │
│     修复: 恢复 IAM 权限后重新触发 sync                           │
│     $ gcloud storage buckets add-iam-policy-binding \            │
│         gs://vi-agent-data \                                    │
│         --member="serviceAccount:SA@PROJECT.iam" \              │
│         --role="roles/storage.objectUser"                       │
│                                                                 │
│  b) Pod 被 kill 时 cloud-sync 未完成:                            │
│     修复: 增加 terminationGracePeriodSeconds 到 60s             │
│     预防: cloud-sync 增加中间检查点 (每 5 分钟自动 sync)         │
│                                                                 │
│  c) 网络问题导致上传超时:                                        │
│     修复: 检查 VPC/firewall 规则                                 │
│     恢复: 从 GCS 版本历史恢复最近一个有效版本                    │
│     $ gsutil cp gs://vi-agent-data/{userId}/{projectId}/ \       │
│         /tmp/recovery/ -r                                       │
├─────────────────────────────────────────────────────────────────┤
│  预防措施:                                                       │
│  - 开启 GCS Object Versioning                                   │
│  - cloud-sync 增加中间检查点 (每 5 分钟)                         │
│  - terminationGracePeriodSeconds >= 60s                         │
│  - 告警: cloud_sync_failures > 3 次/10 分钟                     │
└─────────────────────────────────────────────────────────────────┘
```

##### Incident 4: Redis 内存耗尽

```
┌─────────────────────────────────────────────────────────────────┐
│  INCIDENT: Redis 内存耗尽                                        │
├─────────────────────────────────────────────────────────────────┤
│  症状:                                                          │
│  - Redis 报错 OOM command not allowed                           │
│  - PUB/SUB 消息丢失, 新 session 创建失败                        │
│  - 应用日志: "Redis connection refused" 或 "ENOMEM"             │
│                                                                 │
│  严重性: P1 (多服务受影响)                                       │
├─────────────────────────────────────────────────────────────────┤
│  排查步骤:                                                       │
│                                                                 │
│  Step 1: 检查内存使用                                            │
│  $ redis-cli -h <REDIS_HOST> INFO memory                        │
│  关注: used_memory_human, maxmemory, mem_fragmentation_ratio    │
│                                                                 │
│  Step 2: 找出最大的 key                                         │
│  $ redis-cli -h <REDIS_HOST> --bigkeys                          │
│                                                                 │
│  Step 3: 检查 key 数量和 TTL 分布                                │
│  $ redis-cli -h <REDIS_HOST> DBSIZE                             │
│  $ redis-cli -h <REDIS_HOST> --scan --pattern "session:*" \     │
│      | head -10 | xargs -I{} redis-cli TTL {}                  │
│                                                                 │
│  Step 4: 检查内存策略                                            │
│  $ redis-cli -h <REDIS_HOST> CONFIG GET maxmemory-policy        │
├─────────────────────────────────────────────────────────────────┤
│  常见原因 + 修复:                                                │
│                                                                 │
│  a) Session token TTL 未设置 (泄漏):                             │
│     修复: 批量为无 TTL 的 key 设置 TTL                           │
│     $ redis-cli --scan --pattern "session:*" | while read key;  │
│       do redis-cli TTL "$key" | grep -q "^-1$" && \             │
│       redis-cli EXPIRE "$key" 3600; done                        │
│                                                                 │
│  b) Usage counters 未清理 (累积):                                │
│     修复: 手动运行 aggregation CronJob                           │
│     $ kubectl create job --from=cronjob/usage-aggregator \       │
│         manual-cleanup -n vi-core                               │
│                                                                 │
│  c) PUB/SUB backpressure (consumer 跟不上):                      │
│     修复: 检查并重启消费者服务                                    │
│     $ kubectl rollout restart deploy/api-server -n vi-core      │
│                                                                 │
│  紧急措施:                                                       │
│  $ gcloud redis instances update vi-agent-redis \                │
│      --region=us-central1 --size=2                              │
│  (升级 Memorystore 实例规格，无需停机)                           │
├─────────────────────────────────────────────────────────────────┤
│  预防措施:                                                       │
│  - 所有 Redis key 必须有 TTL                                     │
│  - maxmemory-policy: volatile-lru                               │
│  - 告警: redis_memory_used > 70% 即触发 warning                 │
│  - 告警: redis_memory_used > 90% 即触发 critical                │
└─────────────────────────────────────────────────────────────────┘
```

##### Incident 5: 上游 AI API 限流/故障

```
┌─────────────────────────────────────────────────────────────────┐
│  INCIDENT: 上游 AI API 限流 / 故障                               │
├─────────────────────────────────────────────────────────────────┤
│  症状:                                                          │
│  - proxy_requests_total{status="429"} 突增 (限流)               │
│  - proxy_requests_total{status="5xx"} 突增 (故障)               │
│  - 用户感知: AI 编程任务卡住或报错                                │
│                                                                 │
│  严重性: P2 (降级但不完全中断)                                   │
├─────────────────────────────────────────────────────────────────┤
│  排查步骤:                                                       │
│                                                                 │
│  Step 1: 检查 Anthropic 状态页                                   │
│  打开 https://status.anthropic.com                              │
│                                                                 │
│  Step 2: 检查 Proxy 上游连接状态                                 │
│  $ kubectl logs -n vi-core deploy/api-key-proxy \                │
│      --tail=50 | grep -E "429|5xx|upstream"                     │
│                                                                 │
│  Step 3: 确认是全局限流还是单 key 限流                            │
│  $ kubectl exec -n vi-core deploy/api-key-proxy -- \             │
│      curl -s https://api.anthropic.com/v1/messages \            │
│      -H "x-api-key: $REAL_KEY" \                                │
│      -H "content-type: application/json" \                      │
│      -d '{"model":"claude-sonnet-4-6-20250514","max_tokens":1,  │
│           "messages":[{"role":"user","content":"hi"}]}'          │
│                                                                 │
│  Step 4: 检查是否有异常用户消耗                                   │
│  $ redis-cli ZRANGEBYSCORE usage:cost:today +inf -inf \          │
│      LIMIT 0 10 WITHSCORES                                      │
├─────────────────────────────────────────────────────────────────┤
│  常见原因 + 修复:                                                │
│                                                                 │
│  a) 全局 API 故障:                                               │
│     修复: 启用排队机制 — 任务暂存 Redis，等恢复后重试            │
│     通知用户: "AI 服务暂时繁忙，请稍后重试"                      │
│     不暴露具体错误信息给用户                                      │
│                                                                 │
│  b) 单 key 被限流:                                               │
│     修复: 检查是否有用户异常消耗 → 暂停该用户                    │
│     如果有备用 API key → 在 Proxy 中切换                         │
│                                                                 │
│  c) 网络层问题:                                                  │
│     修复: 检查 VPC egress 规则, DNS 解析                         │
│     $ kubectl exec -n vi-core deploy/api-key-proxy -- \          │
│         nslookup api.anthropic.com                              │
├─────────────────────────────────────────────────────────────────┤
│  预防措施:                                                       │
│  - API Key Proxy 配置 retry with exponential backoff            │
│  - 备用 API key 预配置，支持自动切换                              │
│  - 用户端显示队列位置和预计等待时间                               │
│  - 告警: upstream_5xx_rate > 10% 持续 2 分钟                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Escalation 路径

```
L0: 自动化 (Alertmanager + Self-healing Scripts)
    能力: Pod restart、Warm Pool 补充、HPA 扩容
    条件: 已知模式 + 明确修复动作
    │
    │  自动修复失败 / 未知模式 / 持续 >5 分钟
    ▼
L1: Primary On-Call (开发者)
    能力: 日志分析、手动修复、临时 workaround
    工具: kubectl, Grafana, Runbook
    时限: 30 分钟内判断是否能自己解决
    │
    │  无法解决 / 涉及架构变更 / P0 事件
    ▼
L2: Secondary On-Call (高级开发者)
    能力: 架构级判断、数据恢复、安全事件处理
    工具: 全部生产环境访问权限
    时限: 1 小时内给出修复方案
    │
    │  数据丢失 / 安全事件 / 需要管理层决策
    ▼
L3: Tech Lead / CTO
    能力: 业务决策 (是否停服、是否回滚大版本)
    通知: 用户公告、合作伙伴通知
```

**各阶段 On-Call 配置**:

| 阶段 | 值班 | 响应 SLA | 工具 |
|------|------|---------|------|
| Phase 1 | 1 人, 仅工作时间 | P0: 4h, P1: 24h | Slack #ops-alerts |
| Phase 2 | 2 人 (主+备), 7x24 | P0: 15min, P1: 1h, P2: 4h | PagerDuty + Slack + Runbook |
| Phase 3 | 3 人梯队, 7x24 | P0: 5min (自动化), P1: 30min, P2: 2h | PagerDuty + 自动修复脚本 |

#### Post-Mortem 流程

**触发条件**:
- 任何 P0 事件
- P1 事件持续 > 1 小时
- 任何数据丢失事件
- 任何安全事件

**流程**:
1. 事件解决后 48 小时内召开 Post-Mortem 会议
2. 撰写 5-Why 根因分析文档: Timeline, Impact, Root Cause, Action Items, Lessons Learned
3. Action Items 进入 Sprint backlog（每项有 owner + deadline）
4. 所有 Post-Mortem 文档归档，季度回顾趋势
5. **文化**: Blameless — 不追责个人，追责系统。每次 P0 必须产出至少 1 个自动化改进。

---

### 7.7 租户隔离模型

> 来源: verbatim-09 第 1 议题

#### 核心设计: 机制与内容分离 (冯·诺依曼分离)

NanoClaw 的租户隔离采用 "冯·诺依曼分离" 原则——**机制（Orchestrator）与内容（用户代码/数据）彻底分开**。Orchestrator 是共享的路由层，只做 "谁的任务发到哪个 Pod"，不触碰用户数据。用户的代码、文件系统、网络栈全部在 Per-Session Pod 中物理隔离。

```
                    ┌──────────────────────────────────┐
                    │  NanoClaw Orchestrator (共享)      │
                    │  HPA 2-15 replicas               │
                    │  只做路由: "谁的任务发到哪个 Pod"  │
                    │  不触碰用户数据                    │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │    Sandbox Scheduler     │
                    │    Pod 生命周期管理       │
                    └────────────┬────────────┘
                                 │ k8s API
            ┌────────────────────┼────────────────────┐
            │                    │                    │
    ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐
    │ User A Pod    │   │ User B Pod    │   │ User C Pod    │
    │               │   │               │   │               │
    │ 独立文件系统  │   │ 独立文件系统  │   │ 独立文件系统  │
    │ (emptyDir)    │   │ (emptyDir)    │   │ (emptyDir)    │
    │               │   │               │   │               │
    │ 独立网络栈    │   │ 独立网络栈    │   │ 独立网络栈    │
    │ (NetworkPolicy)│   │ (NetworkPolicy)│   │ (NetworkPolicy)│
    │               │   │               │   │               │
    │ gVisor 隔离   │   │ gVisor 隔离   │   │ gVisor 隔离   │
    │               │   │               │   │               │
    │ 独立 session  │   │ 独立 session  │   │ 独立 session  │
    │ token         │   │ token         │   │ token         │
    └───────────────┘   └───────────────┘   └───────────────┘
```

#### 5 层防御体系

| Layer | 机制 | 隔离范围 | 引入阶段 |
|-------|------|---------|---------|
| 1 | Redis Channel 命名空间 (`vi:exec:{userId}`, `vi:stream:{userId}`) | 逻辑隔离（消息路由）| Phase 1 (已有) |
| 2 | Per-Session Sandbox Pod (独立 Pod / 文件系统 / 网络栈) | 物理隔离 | Phase 1 |
| 3 | gVisor RuntimeClass (GKE Autopilot 默认强制) | 系统调用隔离 | Phase 1 |
| 4 | NetworkPolicy (Pod 只能访问 api-key-proxy + Redis + HTTPS:443) | 网络隔离 | Phase 1 |
| 5 | API Key Proxy (Pod 内零 key, session token 替代) | 密钥隔离 | Phase 1 |

#### 攻击路径验证 (5 条路径, 每条被阻断)

```
攻击路径 1: Sandbox Pod A 尝试读取 Sandbox Pod B 的文件
  → 阻断: Pod 独立 emptyDir, 无共享存储, NetworkPolicy deny Pod 间通信

攻击路径 2: Sandbox Pod 尝试访问 k8s API Server
  → 阻断: Pod ServiceAccount 无任何 k8s RBAC 权限
           NetworkPolicy 不允许访问 kube-apiserver

攻击路径 3: Claude Code 被 prompt injection 诱导执行 echo $ANTHROPIC_API_KEY
  → 阻断: Pod 内无真实 API key, 只有 session token (sess-abc123)
           即使打印出来, 该 token 在集群外无法使用

攻击路径 4: Sandbox Pod 尝试发布到其他用户的 Redis channel
  → 阻断 (Phase 2+): Redis ACL 限制 Pod 只能 PUBLISH 到分配给自己的 channel
  → Phase 1 缺陷: 无 Redis ACL, 理论上可伪造。影响有限因为 NetworkPolicy
    限制了 Pod 只能访问 Redis 和 Proxy, 但 Phase 2 必须修复。

攻击路径 5: 恶意 npm 包的 postinstall 脚本尝试窃取 API key
  → 阻断: Pod 内无 API key, 只有 session token
           gVisor 限制可执行的系统调用
           NetworkPolicy 限制只能 HTTPS:443 出站 (无法回连攻击者)
```

#### 代码级隔离机制和缺陷

**现有正确的隔离 (3 项)**:
1. Redis Channel 命名空间 — `vi:exec:{userId}`, `vi:stream:{userId}` (channels/types.ts:505-522)
2. AsyncLocalStorage 请求上下文 — 每个请求绑定 `{ userId, sessionId }` (request-context.ts)
3. UserQueue 并发控制 — per-user 串行, 跨用户并行 (user-queue.ts)

**Phase 1 前必须修复的缺陷 (3 项)**:

| 缺陷 | 文件 | 问题 | 修复 |
|------|------|------|------|
| 全局变量泄漏 | `intention-predictor.ts` | `lastSceneHash`, `lastIntentions` 是全局变量, 用户 A 的场景 hash 会被用户 B 覆盖 | 改为 `Map<userId, ...>` |
| 共享文件系统 | `container-runner.ts` | 所有容器挂载同一个 `config.userDataDir` | 整个替换为 HTTP 调用 Scheduler (k8s 后 Per-Session Pod 用独立 emptyDir 自动修复) |
| 进程内全局 Map | `card-store.ts` | 所有 session 的 card 数据在同一个 Map 里, 一个用户 OOM 影响所有用户 | 移除或迁移到 Redis |

#### Pod-to-User 关系: 1 用户 = 0 或 1 个活跃 Pod

```
用户有 5 个项目 → 全在 GCS, 零成本
用户此刻在编辑 Project C → 1 个 Pod 运行
用户离开 → idle timeout → cloud-sync → Pod 销毁 → 0 Pod
用户回来 → 新 Pod (Warm Pool 5s / 冷启动 30s) → 加载 GCS → 继续工作
```

**架构天然限制 1 user = 1 active Pod**:
- Realtime 是单通道（LiveKit room = userId）
- Redis channel 是 per-user: `vi:exec:{userId}`
- UserQueue per-user 串行

#### 资源计算表

| 阶段 | 注册用户 | DAU | 峰值并发会话 | 活跃 Pod | Idle Pod | Warm Pool | 总 Pod |
|------|---------|-----|-------------|---------|---------|-----------|-------|
| Phase 1 | ~200 | 50 | ~10 | ~10 | ~3 | 0 | ~13 |
| Phase 2 | ~5,000 | 1,000 | ~200 | ~100 | ~30 | ~20 | ~150 |
| Phase 3 | ~50,000 | 10,000 | ~2,000 | ~700 | ~200 | ~100 | ~1,000 |

注: 注册用户 >> DAU >> 并发会话 >> 活跃 Pod。不是每个注册用户都每天活跃，不是每个在线用户都同时在编程。

---

### 7.8 NanoClaw K8s 迁移职责变化

> 来源: verbatim-09 第 3 议题

NanoClaw 从 Docker-based 的 "编排+执行一体" 变为 k8s 环境下的 "纯路由调度器"。代码变更净减约 500 行。

#### 去掉的职责 (4 项)

| 原职责 | 原代码 | 替代方案 | 删除理由 |
|--------|--------|---------|---------|
| UserQueue 并发调度 | user-queue.ts | Scheduler 管 Pod 分配, 1 user = 1 Pod 天然串行 | Pod 级别隔离已保证并发控制 |
| readSecrets() 读 API Key | container-runner.ts:168-181 | API Key Proxy 处理, Pod 内零 key | Zero Trust: key 不经过 NanoClaw |
| Docker 容器生命周期 | container-runtime.ts (整个文件) | Scheduler 通过 k8s API 管理 Pod | k8s 原生替代 Docker |
| stdin/stdout 协议 (CARD_OP::) | container-runner.ts:205-230 | HTTP POST to Pod:8080/task, 结果 Pod → Redis 直发 | Pod 间无 stdio 管道 |

#### 保留的职责 (5 项)

| 职责 | 原代码 | 变化 |
|------|--------|------|
| 监听 Redis 任务 (vi:exec:*) | channels/ 目录 | 不变, 核心订阅逻辑保留 |
| 包/技能解析 (package-loader) | package-loader.ts | 不变, 解析 skill 和 package 元数据 |
| 发布到 Redis | channels/ | 简化: 大部分发布由 Pod 直接执行, Orchestrator 只发状态更新 |
| 上下文编译 | context-compiler.ts | 移入 Pod 或保留但从 PostgreSQL/Redis 读取 (不再读本地文件) |
| 意图预测 | intention-predictor.ts | 保留但改为 per-user (修复全局变量缺陷) |

#### 新增的职责 (2 项)

| 新职责 | 实现 |
|--------|------|
| HTTP 调用 Scheduler API | `POST scheduler:8000/sessions {userId, projectId, tier}` → 获取 podEndpoint |
| HTTP POST 任务到 Pod | `POST podEndpoint:8080/task {prompt, userId, taskId, ...}` |

#### 代码变更量化

```
删除:
  - container-runtime.ts: ~200 行 (整个删除)
  - container-runner.ts 中 Docker 相关: ~300 行
  - readSecrets() + stdin pipe 逻辑: ~100 行
  小计: ~600 行删除

新增:
  - sandbox-client.ts (HTTP Scheduler + Pod 调用): ~80 行
  - 配置变更 (Scheduler URL, feature flags): ~20 行
  小计: ~100 行新增

修改:
  - intention-predictor.ts (全局变量 → per-user Map): ~20 行
  - card-store.ts (进程内 Map → Redis): ~30 行
  小计: ~50 行修改

净变化: -600 + 100 + 50 = 约 -450 行 (净减少)
```

**NanoClaw 改造后的调用流程对比**:

```
改造前:
  Redis vi:exec:{uid}
  → 上下文编译 (读本地 /workspace/)
  → readSecrets() 读 API Key
  → docker run -i --rm nanoclaw-agent
  → stdin JSON (含 secrets)
  → stdout pipe → 解析 CARD_OP:: 标记
  → Redis PUBLISH vi:stream:{uid}

改造后:
  Redis vi:exec:{uid}
  → HTTP POST scheduler/sessions {userId} → 获取 podEndpoint
  → HTTP POST podEndpoint:8080/task {prompt, userId, taskId}
  → Pod 内: cloud-sync → 上下文编译 → Claude Code SDK 执行
  → Pod 直接: Redis PUBLISH vi:stream:{uid}
  → NanoClaw 从 Redis 收到完成事件 → 更新任务状态
```

---

### 7.9 API Key 安全完整流向

> 来源: verbatim-09 第 3 议题 + security-ops 草案 §2

#### 当前流向 (docker-compose): API Key 经过多层传递

```
┌─────────────────────────────────────────────────────────────┐
│  当前 API Key 流向 (docker-compose 环境)                     │
│                                                             │
│  ① NanoClaw process.env                                     │
│     ANTHROPIC_API_KEY=sk-ant-api03-xxxxx  (真实 key)        │
│     │                                                       │
│     ▼                                                       │
│  ② readSecrets() 读取 (container-runner.ts:168-181)         │
│     提取: ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL,            │
│           ANTHROPIC_AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN      │
│     │                                                       │
│     ▼                                                       │
│  ③ stdin JSON 传给 Docker 容器 (container-runner.ts:205)    │
│     { "secrets": { "ANTHROPIC_API_KEY": "sk-ant-..." } }    │
│     传完后: containerInput.secrets = undefined (清除)        │
│     │                                                       │
│     ▼                                                       │
│  ④ agent-runner/index.ts:82-85                              │
│     将 secrets 注入 process.env (sdkEnv)                    │
│     │                                                       │
│     ▼                                                       │
│  ⑤ Claude Code SDK 使用 sdkEnv.ANTHROPIC_API_KEY            │
│     直连 api.anthropic.com                                  │
│                                                             │
│  安全措施: stdin 传递 (不走 disk/env/args), 传完清除 ✓       │
│  攻击面: Pod 内 process.env 包含真实 key                     │
│         → echo $ANTHROPIC_API_KEY 即可泄露                   │
│         → 恶意 npm 包 postinstall 可读取 process.env         │
│         → prompt injection 可诱导 Claude 打印 env            │
└─────────────────────────────────────────────────────────────┘
```

#### K8s 目标流向: Pod 内零 Key

```
┌─────────────────────────────────────────────────────────────┐
│  K8s 目标 API Key 流向                                       │
│                                                             │
│  ① k8s Secret (vi-api-keys, namespace: vi-core)             │
│     ANTHROPIC_API_KEY=sk-ant-api03-xxxxx                    │
│     仅挂载到 api-key-proxy Pod                               │
│     │                                                       │
│     ▼                                                       │
│  ② API Key Proxy (唯一持有真实 key 的服务)                   │
│     启动时从 k8s Secret / GCP Secret Manager 加载到内存      │
│     │                                                       │
│     │  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─        │
│     │                                               │       │
│     ▼                                               │       │
│  ③ Sandbox Pod (零 API key)                         │       │
│     env:                                            │       │
│       ANTHROPIC_API_KEY=sess-abc123  (session token) │       │
│       ANTHROPIC_BASE_URL=http://api-key-proxy:443   │       │
│     │                                               │       │
│     ▼                                               │       │
│  ④ Claude Code SDK 发起请求                         │       │
│     POST http://api-key-proxy:443/v1/messages       │       │
│     Header: x-api-key: sess-abc123                  │       │
│     │                                               │       │
│     ▼                                               │       │
│  ⑤ API Key Proxy 处理请求                           │       │
│     a. 验证 source IP (sandbox Pod CIDR)            │       │
│     b. Redis GET session:abc123 → 获取 userId, tier │       │
│     c. 检查 rate limit                               │       │
│     d. 替换 header: sess-abc123 → sk-ant-api03-xxx  │       │
│     e. 转发到 api.anthropic.com                      │       │
│     f. 记录 usage (Redis INCRBY)                    │       │
│     │                                               │       │
│     ▼                                               │       │
│  ⑥ api.anthropic.com 响应                            │       │
│     → Proxy 解析 usage → 记录 tokens                 │       │
│     → 原样转发回 Sandbox Pod ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       │
│                                                             │
│  安全保证:                                                   │
│  - Pod 内 echo $ANTHROPIC_API_KEY → sess-abc123 (无用)      │
│  - 恶意 npm 包读 process.env → 只得到 session token          │
│  - prompt injection → 只能暴露 session token, 非真实 key     │
│  - Session token 在集群外完全无法使用 (见下文 4 个原因)       │
└─────────────────────────────────────────────────────────────┘
```

#### GCS 用户数据内容

**存储在 GCS 的数据** (gs://vi-agent-data/{userId}/{projectId}/):
- 用户 memory 文件 (identity/semantic/episodic)
- session 历史 (对话记录)
- 项目代码、配置、资源文件
- 用户 persona (CLAUDE.md)
- 同步状态 (.cache/sync-state.json)

**不存储在 GCS 的数据**:
- 任何 API key (ANTHROPIC_API_KEY, GEMINI_API_KEY)
- 任何 OAuth token
- 任何 session token
- node_modules (可重建的派生数据)
- 编译缓存 (.next/, dist/)

#### 为什么 Session Token 在集群外无法使用

1. **Token 不是 API key**: Session token 格式为 `sess-{random128bit}`，不是 Anthropic API key 格式，Anthropic API 不认识它
2. **Token 只在 Redis 中有效**: API Key Proxy 通过 Redis 查询验证 token，集群外无法访问 Redis
3. **Token 绑定 Pod IP**: Proxy 验证请求来源 IP 必须在 sandbox Pod CIDR 范围内，集群外 IP 直接 403
4. **Token 生命周期 = Pod**: Pod 销毁后 Redis 中的 token 记录被删除（或 TTL 自然过期），即使拿到 token 也很快失效

---

## 8. 成本总览

### 8.1 三阶段成本对比表

| 阶段 | DAU | 峰值并发 | 基础设施/月 | AI API/月 | 总计/月 | 每用户成本/月 |
|------|-----|---------|------------|----------|--------|-------------|
| Phase 1 (<=50 用户) | 50 | ~10 | ~$540 | ~$2,000-5,000 | ~$2,500-5,500 | ~$50-110 |
| Phase 2 (~1,000 用户) | 1,000 | ~200 | ~$6,800 | ~$20,000-40,000 | ~$27,000-47,000 | ~$27-47 |
| Phase 3 (~10,000 用户) | 10,000 | ~2,000 | ~$29,000 | ~$100,000-200,000 | ~$130,000-230,000 | ~$13-23 |

**规模效应明显**: 每用户成本从 Phase 1 的 ~$80 降到 Phase 3 的 ~$18。主要原因：
- 基础设施固定成本被摊薄（常驻服务成本增长远慢于用户增长）
- AI API 可能获得 volume discount
- Spot VM 大规模使用后折扣效果更显著

### 8.2 成本结构分析

```
Phase 1 成本结构:
  AI API:    ~$3,500 (66%)  ██████████████████████████████████
  基础设施:  ~$540  (10%)   █████
  其中:
    GKE:     ~$460          ████
    Cloud SQL: ~$10         ▏
    Redis:   ~$35           ▏
    GCS:     ~$2            ▏
    网络:    ~$30           ▏

Phase 2 成本结构:
  AI API:    ~$31,000 (79%) ████████████████████████████████████████
  基础设施:  ~$6,800 (17%)  █████████
  其中:
    GKE 常驻: ~$1,500      ████
    GKE sandbox: ~$4,000    ██████████
    GKE warm:  ~$720        ██
    Cloud SQL: ~$120        ▏
    Redis x2:  ~$200        ▏
    CDN+网络:  ~$250        ▏

Phase 3 成本结构:
  AI API:    ~$150,000 (84%)████████████████████████████████████████████
  基础设施:  ~$29,000 (16%) ████████
  其中:
    GKE 常驻: ~$5,000       ██████
    GKE sandbox: ~$18,000   ██████████████████████
    GKE warm:  ~$3,600      ████
    Cloud SQL: ~$500         ▏
    Redis x2:  ~$600         ▏
    CDN+网络+WAF: ~$1,300   ██
```

**核心洞察: AI API = 50-65% (Phase 1) → 79-84% (Phase 2-3) 的总成本。** 这意味着：
- 基础设施优化的上限就是 ~$29K/月（Phase 3）
- AI API 是 $100K-200K/月——prompt caching、模型选择、任务调度优化才是真正的成本杠杆
- **Spot VM 优化的 ROI 远超 Go/Rust 重写**

#### Spot VM 节省 vs Go/Rust 重写节省（具体数字）

```
Spot VM 优化 (零代码改动):
  Phase 3 sandbox pods On-Demand: ~$48,000/月
  Phase 3 sandbox pods Spot:      ~$18,000/月
  月节省: $30,000
  实施时间: 0.5 天 (Pod spec 加 spot toleration)
  ROI: 即时

Go 重写 vi-realtime:
  Python (当前): ~76 pods, Spot ~$10,000/月
  Go (预期):     ~25 pods, Spot ~$3,300/月
  月节省: $6,700
  重写成本: ~5 人月 × $15,000/人月 = $75,000
  回收期: 11 个月

结论: Spot VM 月节省 $30K (即时) vs Go 重写月节省 $6.7K (11 个月回收)
Spot 的 ROI 是 Go 重写的 ~4.5 倍, 且零风险。
```

### 8.3 开发投入总览

| Phase | 范围 | AI 辅助时间 | 传统时间 | 加速倍率 |
|-------|------|-----------|---------|---------|
| Phase 1 | docker-compose → k8s 基础 + Scheduler 最简版 + API Key Proxy | ~8 天 (2 人) | ~18 天 (2 人) | 2.3x |
| Phase 2 | HPA + Redis 拆分 + Warm Pool + 监控 | ~15 天 (2 人) | ~27 天 (2 人) | 1.8x |
| Phase 3 | Canary + Spot + 高级调度 + anomaly-detector | ~15 天 (2 人) | ~27 天 (2 人) | 1.8x |
| **总计** | | **~17 人周 (1 人)** | **~38 人周 (2-3 人)** | **~2.3x** |

**实际日历时间**: ~2.5-3 个月（含阶段间验证期）

**对比**: 传统估算 38 人周 = ~10 人月 = 3 人团队 3-4 个月。AI 辅助下 1-2 个 Role (人 + Claude Code) 在 2.5-3 个月内完成。

**加速倍率不均匀的原因**:
- 配置/样板类（占 ~25%）: 3.5x 加速（k8s YAML, Terraform, GitHub Actions 高度模板化）
- 业务逻辑重构（占 ~35%）: 2.5x 加速（Scheduler 是新服务但逻辑明确）
- 测试编写（占 ~15%）: 2.5x 加速（AI 擅长生成测试用例）
- 调试/调优/运维（占 ~25%）: 1.2x 加速（分布式系统调试 AI 帮不了太多）

### 8.4 成本优化时间线

| 优化措施 | 引入阶段 | 预计节省 | 实施复杂度 | 说明 |
|---------|---------|---------|-----------|------|
| GKE Autopilot Spot Pod | Phase 1+ | 计算 -60~70% | 低 | Pod spec 加 `spot: true` |
| Prompt Caching (Claude) | Phase 1+ | Claude API -30~50% | 低 | SDK 配置 |
| Sandbox Pod 右 Sizing | Phase 2+ | 计算 -20~30% | 中 | 需要 profiling 数据 |
| Warm Pool 动态调整 | Phase 2+ | Warm Pool -40% | 中 | Scheduler 逻辑 |
| IDLE timeout 按用户等级 | Phase 2+ | 计算 -15~20% | 低 | Scheduler 配置 |
| AI 模型路由 (简单任务用小模型) | Phase 3+ | AI API -30~40% | 高 | task-server 路由逻辑 |
| Reserved Capacity (CUD) | Phase 3+ | 计算 -30~50% | 低 | GCP 合同 |
| 多区域部署 + 跟日照走 | Phase 3+ | 计算 -10~15% | 高 | 多集群管理 |

---

## 9. 附录

### 9.1 Terraform 代码示例

以下是 Phase 1 的完整 Terraform 配置，覆盖 GKE Autopilot、Cloud SQL、Memorystore Redis、GCS Bucket 和 VPC Network。

```hcl
# infra/terraform/main.tf

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "vi-agent-terraform-state"
    prefix = "prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ============================================================
# Variables
# ============================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "prod"
}

# ============================================================
# VPC Network
# ============================================================

resource "google_compute_network" "vpc" {
  name                    = "vi-agent-vpc"
  auto_create_subnetworks = false
  description             = "VI Agent production VPC"
}

resource "google_compute_subnetwork" "gke" {
  name                     = "vi-agent-gke-subnet"
  ip_cidr_range            = "10.0.0.0/20"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.4.0.0/14"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.8.0.0/20"
  }
}

# Private Services Access (for Cloud SQL + Memorystore)
resource "google_compute_global_address" "private_ip_range" {
  name          = "vi-agent-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_range.name]
}

# ============================================================
# GKE Autopilot Cluster
# ============================================================

resource "google_container_cluster" "vi_agent" {
  name     = "vi-agent-${var.environment}"
  location = var.region

  # Autopilot 模式 — 自动管理 Node, 默认 gVisor sandbox
  enable_autopilot = true

  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.gke.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  release_channel {
    channel = "REGULAR"
  }

  # 启用 Gateway API
  gateway_api_config {
    channel = "CHANNEL_STANDARD"
  }

  # Workload Identity (推荐的 GCP 认证方式)
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # 私有集群 (Node 无外部 IP)
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # 维护窗口 (UTC 凌晨)
  maintenance_policy {
    recurring_window {
      start_time = "2026-01-01T08:00:00Z"
      end_time   = "2026-01-01T12:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=SA"
    }
  }
}

# ============================================================
# Cloud SQL (PostgreSQL)
# ============================================================

resource "google_sql_database_instance" "postgres" {
  name             = "vi-agent-postgres-${var.environment}"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    # Phase 1: db-f1-micro (~$10/月)
    # Phase 2: 改为 "db-custom-2-8192"
    # Phase 3: 改为 "db-custom-4-16384" + availability_type = "REGIONAL"
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    disk_autoresize   = true
    disk_size         = 10
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = false  # Phase 2+: true
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day  = 7  # Sunday
      hour = 4  # 4 AM UTC
    }
  }

  deletion_protection = true
}

resource "google_sql_database" "vi_db" {
  name     = "vi_agent"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "vi_user" {
  name     = "vi_agent"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password  # 从 Terraform variables 或 Secret Manager 获取
}

variable "db_password" {
  type      = string
  sensitive = true
}

# ============================================================
# Memorystore (Redis)
# ============================================================

resource "google_redis_instance" "redis" {
  name           = "vi-agent-redis-${var.environment}"
  tier           = "BASIC"      # Phase 1: Basic (无 HA)
  memory_size_gb = 1            # Phase 1: 1GB
  region         = var.region

  authorized_network = google_compute_network.vpc.id

  redis_version = "REDIS_7_0"

  # 连接配置
  connect_mode = "PRIVATE_SERVICE_ACCESS"

  depends_on = [google_service_networking_connection.private_vpc]
}

# Phase 2 会拆分为两个实例:
# resource "google_redis_instance" "redis_realtime" { ... tier = "BASIC", 2GB }
# resource "google_redis_instance" "redis_state" { ... tier = "STANDARD_HA", 2GB }

# ============================================================
# GCS Bucket (用户数据持久化)
# ============================================================

resource "google_storage_bucket" "user_data" {
  name          = "vi-agent-data-${var.environment}"
  location      = var.region      # Phase 3: 改为 "US" (multi-regional)
  storage_class = "STANDARD"
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true  # 防止数据丢失, 支持恢复
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3  # 只保留最近 3 个版本
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 365  # 1 年以上的非当前版本删除
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
}

# Phase 2+: 共享缓存 bucket (npm cache, 项目模板)
resource "google_storage_bucket" "shared_cache" {
  name          = "vi-agent-shared-cache-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true
}

# ============================================================
# Outputs
# ============================================================

output "cluster_endpoint" {
  value       = google_container_cluster.vi_agent.endpoint
  description = "GKE cluster endpoint"
  sensitive   = true
}

output "cloud_sql_connection" {
  value       = google_sql_database_instance.postgres.connection_name
  description = "Cloud SQL connection name for proxy"
}

output "redis_host" {
  value       = google_redis_instance.redis.host
  description = "Redis host IP"
}

output "gcs_bucket" {
  value       = google_storage_bucket.user_data.name
  description = "User data GCS bucket"
}
```

---

### 9.2 k8s Manifest 示例

#### api-server Deployment + Service + HPA

```yaml
# k8s/base/api-server/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: vi-core
  labels:
    app: api-server
    version: v1
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
        version: v1
    spec:
      serviceAccountName: api-server-sa
      containers:
        - name: api-server
          image: us-central1-docker.pkg.dev/PROJECT/vi-agent/api-server:TAG
          ports:
            - name: http
              containerPort: 8000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: vi-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: vi-secrets
                  key: redis-url
            - name: ENVIRONMENT
              value: "production"
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
          lifecycle:
            preStop:
              exec:
                command: ["sleep", "5"]  # 等待活跃请求完成
      terminationGracePeriodSeconds: 30
---
# k8s/base/api-server/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-server
  namespace: vi-core
spec:
  selector:
    app: api-server
  ports:
    - name: http
      port: 8000
      targetPort: 8000
  type: ClusterIP
---
# k8s/base/api-server/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
  namespace: vi-core
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 2
  maxReplicas: 15    # Phase 1: 5, Phase 2: 10, Phase 3: 15
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

### 9.3 Prometheus Alert Rules

以下告警规则覆盖 Phase 2+ 的核心监控场景:

```yaml
# k8s/monitoring/prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: vi-agent-alerts
  namespace: vi-system
spec:
  groups:
    # ---- Sandbox 生命周期告警 ----
    - name: sandbox-lifecycle
      rules:
        - alert: SandboxPodCreateFailureRateHigh
          expr: |
            rate(scheduler_pod_create_failures[5m])
            / rate(scheduler_pod_create_total[5m]) > 0.1
          for: 5m
          labels:
            severity: critical
            team: platform
          annotations:
            summary: "Sandbox Pod 创建失败率 > 10%"
            description: "过去 5 分钟 Sandbox Pod 创建失败率为 {{ $value | humanizePercentage }}。影响: 新用户无法启动编程环境。"
            runbook: "检查 kubectl get events -n vi-sandbox; 检查 ResourceQuota; 检查 Autopilot 扩容状态"

        - alert: WarmPoolDepleted
          expr: scheduler_warm_pool_size < 2
          for: 2m
          labels:
            severity: warning
            team: platform
          annotations:
            summary: "Warm Pool 即将耗尽 (当前: {{ $value }})"
            description: "Warm Pool 剩余 {{ $value }} 个 Pod，新用户将经历完整冷启动 (~30s)。"
            runbook: "检查 Scheduler 日志; 临时增大 Warm Pool target"

        - alert: SandboxPodOOMKilled
          expr: |
            increase(kube_pod_container_status_last_terminated_reason{
              reason="OOMKilled", namespace="vi-sandbox"
            }[5m]) > 0
          for: 0m
          labels:
            severity: warning
            team: platform
          annotations:
            summary: "Sandbox Pod OOM Killed"
            description: "Sandbox Pod {{ $labels.pod }} 因 OOM 被终止。检查是否有异常大项目或内存泄漏。"

    # ---- API Key Proxy 告警 ----
    - name: api-key-proxy
      rules:
        - alert: ProxyErrorRateHigh
          expr: |
            rate(proxy_requests_total{status=~"5.."}[5m])
            / rate(proxy_requests_total[5m]) > 0.05
          for: 2m
          labels:
            severity: critical
            team: platform
          annotations:
            summary: "API Key Proxy 错误率 > 5%"
            description: "Proxy 5xx 错误率为 {{ $value | humanizePercentage }}。影响: AI 编程功能部分不可用。"
            runbook: "检查 Proxy 日志; 检查 Redis 连通性; 检查上游 API 状态"

        - alert: AnomalousTokenConsumption
          expr: |
            rate(proxy_tokens_total{direction="output"}[5m])
            > 10 * avg_over_time(proxy_tokens_total{direction="output"}[24h])
          for: 2m
          labels:
            severity: critical
            team: security
          annotations:
            summary: "用户 {{ $labels.user_id }} token 消耗异常暴增"
            description: "当前 5 分钟速率是过去 24 小时平均值的 10 倍以上。可能是滥用或 prompt injection。"
            runbook: "自动暂停该用户 session token; 通知安全团队审查"

    # ---- 成本告警 ----
    - name: cost-alerts
      rules:
        - alert: DailyCostExceedsBudget
          expr: sum(proxy_cost_cents_total) > 500000
          for: 0m
          labels:
            severity: critical
            team: management
          annotations:
            summary: "今日 AI API 成本超过 $5,000 预算"
            description: "今日累计 AI API 成本: ${{ $value | humanize }}。采取措施: 检查是否有异常用户; 降低 Warm Pool。"

    # ---- Cloud Sync 告警 ----
    - name: cloud-sync
      rules:
        - alert: CloudSyncLatencyHigh
          expr: |
            histogram_quantile(0.95,
              rate(sandbox_cloud_sync_duration_seconds_bucket[5m])
            ) > 15
          for: 5m
          labels:
            severity: warning
            team: platform
          annotations:
            summary: "Cloud-sync P95 延迟 > 15s"
            description: "Cloud-sync P95 延迟为 {{ $value }}s。影响: 用户等待时间增加。检查 GCS 连通性和网络带宽。"

    # ---- Redis 告警 ----
    - name: redis
      rules:
        - alert: RedisMemoryHigh
          expr: |
            redis_memory_used_bytes / redis_memory_max_bytes > 0.85
          for: 5m
          labels:
            severity: warning
            team: platform
          annotations:
            summary: "Redis 内存使用率 > 85%"
            description: "Redis {{ $labels.instance }} 内存使用率 {{ $value | humanizePercentage }}。即将触达上限。"
            runbook: "检查 bigkeys; 清理无 TTL 的 key; 考虑升配"
```

---

### 9.4 NetworkPolicy 示例

```yaml
# k8s/base/vi-sandbox/network-policy.yaml
#
# vi-sandbox namespace 的 NetworkPolicy — 严格限制所有 Sandbox Pod 的出入站流量
# 这是租户隔离的核心网络层防御
#
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sandbox-pod-isolation
  namespace: vi-sandbox
spec:
  # 选择所有 sandbox namespace 中的 Pod
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress

  # ============================================================
  # Ingress 规则: 谁可以访问 Sandbox Pod
  # ============================================================
  ingress:
    # 规则 1: 允许 NanoClaw Orchestrator 通过 HTTP 发送任务
    # NanoClaw 位于 vi-core namespace, 通过 HTTP POST :8080/task 发送编程任务
    - from:
        - namespaceSelector:
            matchLabels:
              name: vi-core
          podSelector:
            matchLabels:
              app: nanoclaw-orchestrator
      ports:
        - port: 8080
          protocol: TCP

    # 规则 2: 允许 Gateway (vi-system) 转发 preview 请求
    # 用户通过 {sessionId}.preview.domain.com 访问 dev server
    - from:
        - namespaceSelector:
            matchLabels:
              name: vi-system
      ports:
        - port: 3000
          protocol: TCP

  # ============================================================
  # Egress 规则: Sandbox Pod 可以访问什么
  # ============================================================
  egress:
    # 规则 1: 允许访问 Redis (vi-core namespace)
    # Sandbox Pod 通过 Redis PUBLISH 直接发送执行结果到 vi:stream:{userId}
    - to:
        - namespaceSelector:
            matchLabels:
              name: vi-core
      ports:
        - port: 6379
          protocol: TCP

    # 规则 2: 允许访问 API Key Proxy (vi-core namespace)
    # Sandbox Pod 通过 Proxy 代理 AI API 调用 (HTTPS)
    - to:
        - namespaceSelector:
            matchLabels:
              name: vi-core
          podSelector:
            matchLabels:
              app: api-key-proxy
      ports:
        - port: 443
          protocol: TCP

    # 规则 3: 允许外部 HTTPS 出站 (npm install, 公共 API)
    # 但禁止访问集群内网 (防止横向移动)
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 10.0.0.0/8        # 禁止访问集群内网
              - 172.16.0.0/12     # 禁止访问私有网络
              - 192.168.0.0/16    # 禁止访问私有网络
      ports:
        - port: 443
          protocol: TCP

    # 规则 4: 允许 DNS 解析 (必需)
    - to: []
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP

# ============================================================
# 补充: Default Deny 策略 (Phase 3 全 namespace 启用)
# ============================================================
# Phase 3 在每个 namespace 添加 default deny, 实现零信任网络
# 所有通信必须显式允许
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: vi-sandbox
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  # 无 ingress/egress 规则 = deny all
  # 上面的 sandbox-pod-isolation 策略会覆盖此默认拒绝
```

---

### 9.5 Sandbox Scheduler API Spec

```
Sandbox Scheduler Service
  技术栈: TypeScript (与 NanoClaw 统一)
  端口: 8000
  存储: Redis (session registry, warm pool state)
  权限: k8s ServiceAccount (vi-sandbox namespace Pod CRUD)

─────────────────────────────────────────────────────

POST /sessions
  描述: 创建或获取用户的 sandbox 会话
  行为:
    1. 查 Redis: 用户是否有活跃 session?
       YES → 返回现有 Pod endpoint
       NO  → 从 Warm Pool 分配或创建新 Pod
    2. 设置 session token → Redis
    3. Pod ready 后返回 endpoint

  Request Body:
    {
      "userId": string,         // 必填, 用户唯一标识
      "projectId": string?,     // 可选, 项目 ID (决定 cloud-sync 路径)
      "tier": "free" | "pro" | "enterprise",  // 必填, 决定 Pod 规格和 timeout
      "timeout": number?        // 可选, idle timeout 秒数, 默认按 tier
    }

  Response 200:
    {
      "sessionId": string,      // "sess-abc123def456"
      "podEndpoint": string,    // "10.0.1.5:8080" (Pod ClusterIP + port)
      "status": "starting" | "ready" | "active",
      "sessionToken": string,   // "tok-session-xyz" (注入 Pod env)
      "ttl": number             // 剩余 idle timeout 秒数
    }

  Response 503:
    { "error": "no_capacity", "message": "集群资源不足, 请稍后重试" }

  Response 429:
    { "error": "rate_limited", "message": "用户已有活跃 session" }

─────────────────────────────────────────────────────

DELETE /sessions/:sessionId
  描述: 主动释放会话, 触发 cloud-sync 后销毁 Pod

  Response 200:
    { "status": "draining", "message": "Cloud-sync 进行中, Pod 将在 sync 完成后销毁" }

  Response 404:
    { "error": "not_found" }

─────────────────────────────────────────────────────

GET /sessions/:sessionId
  描述: 查询会话状态

  Response 200:
    {
      "sessionId": "sess-abc123def456",
      "userId": "user-123",
      "status": "warm" | "starting" | "ready" | "active" | "idle" | "draining",
      "podEndpoint": "10.0.1.5:8080",
      "createdAt": "2026-03-11T10:00:00Z",
      "lastActivity": "2026-03-11T10:15:00Z",
      "ttl": 180,
      "resourceUsage": {
        "cpu": "1.2 vCPU",
        "memory": "2.1 GB",
        "emptyDir": "3.5 GB"
      }
    }

─────────────────────────────────────────────────────

POST /sessions/:sessionId/keepalive
  描述: 延长 idle timeout (用户有新活动时调用)

  Response 200:
    { "ttl": 600 }

─────────────────────────────────────────────────────

GET /health
  描述: 健康检查 + 系统状态概览

  Response 200:
    {
      "status": "healthy",
      "warmPoolSize": 10,
      "warmPoolTarget": 15,
      "activeSessions": 42,
      "idleSessions": 8,
      "drainingPods": 2,
      "podCreationLatencyP50": "3.2s",
      "podCreationLatencyP99": "12.5s"
    }

─────────────────────────────────────────────────────

Session 对象 Schema (Redis Hash):

  Key: sandbox:sessions:{userId}
  Fields:
    sessionId: string
    podName: string
    podIP: string
    status: "warm" | "starting" | "ready" | "active" | "idle" | "draining"
    tier: "free" | "pro" | "enterprise"
    projectId: string | null
    sessionToken: string
    createdAt: ISO 8601 timestamp
    lastActivity: ISO 8601 timestamp
    timeout: number (seconds)

─────────────────────────────────────────────────────

Status Codes 汇总:

  200 — 成功
  201 — 新 session 创建成功
  400 — 请求参数错误 (缺少 userId 或 tier)
  404 — Session 不存在
  409 — 冲突 (Pod 已在创建中)
  429 — 限流 (用户已有活跃 session)
  503 — 集群无可用资源
  500 — 内部错误
```

---

### 9.6 API Key Proxy 实现参考

以下是 TypeScript 实现（~150 行），覆盖 session 验证、rate limiting、key 替换和 usage tracking。

```typescript
// api-key-proxy/src/index.ts
// API Key Proxy — Sandbox Pod 的 AI API 代理
// 核心功能: session token 验证 → 真实 key 替换 → 转发上游 → usage 记录

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import Redis from 'ioredis';

// ============================================================
// Configuration
// ============================================================
const PORT = parseInt(process.env.PORT || '443');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const ANTHROPIC_BASE = 'https://api.anthropic.com';
const REDIS_URL = process.env.REDIS_STATE_URL || process.env.REDIS_URL!;
const SANDBOX_CIDR = process.env.SANDBOX_CIDR || '10.4.0.0/14';
const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM || '100');

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

// ============================================================
// Helpers
// ============================================================

function isFromSandboxSubnet(remoteAddr: string): boolean {
  // 简化实现: 检查 IP 是否在 sandbox CIDR 范围内
  // 生产环境应使用 ip-range-check 库
  const [cidrBase] = SANDBOX_CIDR.split('/');
  const baseOctets = cidrBase.split('.').map(Number);
  const addrOctets = remoteAddr.replace('::ffff:', '').split('.').map(Number);
  // 检查前两个 octet (简化, /14 CIDR)
  return addrOctets[0] === baseOctets[0] && addrOctets[1] >= baseOctets[1];
}

async function validateSession(token: string): Promise<{
  valid: boolean;
  userId?: string;
  tier?: string;
}> {
  const sessionKey = `session:${token.replace('sess-', '')}`;
  const data = await redis.hgetall(sessionKey);
  if (!data || !data.userId) {
    return { valid: false };
  }
  // 续期 TTL (只要 Pod 活跃, token 不过期)
  await redis.expire(sessionKey, 600);
  return { valid: true, userId: data.userId, tier: data.tier };
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const key = `ratelimit:${userId}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120); // 2 分钟 TTL
  return count <= RATE_LIMIT_RPM;
}

async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const pipeline = redis.pipeline();
  pipeline.incrby(`usage:${userId}:${date}:input`, inputTokens);
  pipeline.incrby(`usage:${userId}:${date}:output`, outputTokens);
  pipeline.incr(`usage:${userId}:${date}:requests`);
  await pipeline.exec();
}

// ============================================================
// Proxy Handler
// ============================================================

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Metrics endpoint (Prometheus format)
  if (req.url === '/metrics') {
    // TODO: 使用 prom-client 暴露 metrics
    res.writeHead(200);
    res.end('');
    return;
  }

  const remoteAddr = (req.socket.remoteAddress || '').replace('::ffff:', '');

  // Step 1: 验证来源 IP
  if (!isFromSandboxSubnet(remoteAddr)) {
    console.warn(`Rejected request from non-sandbox IP: ${remoteAddr}`);
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden', message: 'Not from sandbox subnet' }));
    return;
  }

  // Step 2: 提取并验证 session token
  const sessionToken = req.headers['x-api-key'] as string;
  if (!sessionToken || !sessionToken.startsWith('sess-')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_session', message: 'Missing or invalid session token' }));
    return;
  }

  const session = await validateSession(sessionToken);
  if (!session.valid) {
    console.warn(`Invalid session token: ${sessionToken.slice(0, 10)}...`);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid_session', message: 'Session token not found or expired' }));
    return;
  }

  // Step 3: Rate limiting
  if (!(await checkRateLimit(session.userId!))) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate_limited', message: `Exceeded ${RATE_LIMIT_RPM} requests/minute` }));
    return;
  }

  // Step 4: 构建上游请求 — 替换 auth header
  const upstreamUrl = new URL(req.url!, ANTHROPIC_BASE);
  const upstreamOptions: https.RequestOptions = {
    hostname: upstreamUrl.hostname,
    port: 443,
    path: upstreamUrl.pathname + upstreamUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      'x-api-key': ANTHROPIC_API_KEY,  // 注入真实 key
      host: upstreamUrl.hostname,
    },
  };
  // 移除原始 session token
  delete upstreamOptions.headers!['x-api-key'];
  (upstreamOptions.headers as Record<string, string>)['x-api-key'] = ANTHROPIC_API_KEY;

  // Step 5: 转发请求到上游
  const proxyReq = https.request(upstreamOptions, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });

    // Step 6: 记录 usage (从 response headers 提取)
    // Anthropic API 在 headers 中返回 usage 信息
    const inputTokens = parseInt(proxyRes.headers['x-usage-input-tokens'] as string || '0');
    const outputTokens = parseInt(proxyRes.headers['x-usage-output-tokens'] as string || '0');
    if (inputTokens > 0 || outputTokens > 0) {
      recordUsage(session.userId!, inputTokens, outputTokens).catch(console.error);
    }
  });

  proxyReq.on('error', (err) => {
    console.error(`Upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream_error', message: 'AI API unreachable' }));
    }
  });

  req.pipe(proxyReq, { end: true });
});

// ============================================================
// Startup
// ============================================================

server.listen(PORT, () => {
  console.log(`[api-key-proxy] listening on :${PORT}`);
  console.log(`[api-key-proxy] upstream: ${ANTHROPIC_BASE}`);
  console.log(`[api-key-proxy] sandbox CIDR: ${SANDBOX_CIDR}`);
  console.log(`[api-key-proxy] rate limit: ${RATE_LIMIT_RPM} rpm`);
});
```

---

### 9.7 架构决策 Battle 记录

> 详细记录见 `tmp/arch-sessions/cabinet/battle-record.md`

#### 决策汇总表

| # | 议题 | infra-architect | security-ops | dev-experience | 裁决结果 | 关键理由 |
|---|------|----------------|-------------|---------------|---------|---------|
| 1 | Phase 1 含 Scheduler? | 必须 | 必须 (API Key Proxy Day 1) | 反对 (先验证基础) | 2:1 通过 | Autopilot 强制 gVisor → Docker 不工作 → Scheduler 是刚需 |
| 2 | 全程 Autopilot? | 全程 | 安全优势 (强制 gVisor) | 未表态 | 2:0 通过 | 10K 用户切 Standard 每月只省 ~$500，不值得运维成本 |
| 3 | 3 阶段划分 | 按用户规模 | 同意 | 同意 | 3:0 通过 | 50/1000/10000 用户规模自然分界 |
| 4 | API Key Proxy 实现 | 未表态 | Envoy + Lua | Node.js | 裁决: Phase 1 Node.js | 150 行 Node.js 更好维护，团队更熟悉 |

**Battle 1 折中方案**: Phase 1 的 Scheduler 是最简版本（无 Warm Pool、无高级调度），只实现 Pod CRUD + session registry。Warm Pool 推到 Phase 2。

**Battle 4 裁决逻辑**: Envoy + Lua 需要学习 Envoy 配置语法，150-300 行 Node.js 代码更好维护。如果 Phase 2+ 出现性能瓶颈再考虑迁移到 Envoy。

#### 7 轮讨论锁定的 18 项决策总表

| # | 决策 | 结论 | 来源 |
|---|------|------|------|
| 1 | NanoClaw 部署模型 | 共享无状态 Orchestrator + Per-Session Sandbox Pod | Round 1-4 |
| 2 | 存储方案 | emptyDir (SSD) + GCS cloud-sync，无 PVC | Round 2 |
| 3 | Docker 依赖 | 移除，改用 k8s API（通过 Scheduler） | Round 6 |
| 4 | Pod 生命周期 | Per-Session（与 Realtime 会话对齐） | Round 3 |
| 5 | Pod 通信 | Plan C: Pod 内 HTTP task-server + Redis 直发结果 | Round 3-4 |
| 6 | 沙箱隔离 | gVisor RuntimeClass（GKE Autopilot 原生） | Round 3 |
| 7 | 集群类型 | GKE Autopilot（Phase 1-3 全程） | Round 6 + Battle |
| 8 | k8s 抽象 | Sandbox Scheduler 新服务 | Round 6 |
| 9 | 预览路由 | k8s Gateway API + 子域名 | Round 4 |
| 10 | API Key 安全 | API Key Proxy，Pod 内零 key | Round 7 |
| 11 | NanoClaw 预热 | 不需要（无状态，启动 ~1-2s） | Round 7 |
| 12 | Sandbox 预热 | Warm Pool（Scheduler 管理） | Round 7 |
| 13 | Redis | Memorystore（托管），Phase 2 拆分 Realtime/State | Round 6 |
| 14 | 成本优化 | Spot VM >> Go/Rust 重写 | Round 6 |
| 15 | 模型锁定 | 不锁死，task-server 层预留扩展点 | Round 4 |
| 16 | 租户隔离模型 | Orchestrator 纯路由 + Per-Session Pod 物理隔离 | Round 9 |
| 17 | Pod 与用户关系 | 1 user = 0 或 1 active Pod | Round 9 |
| 18 | API Key 存储位置 | 仅在 api-key-proxy 的 k8s Secret 中 | Round 9 |

---

*End of Section 7-9*
