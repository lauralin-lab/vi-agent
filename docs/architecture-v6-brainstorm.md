# VI Agent v2 — Architecture Brainstorm

> **状态**: 头脑风暴草案，待决策后出正式版
>
> **前置文档**: `architecture-v5.md` (当前 Phase 0-2 渐进架构)、`mobile-app-architecture.md`
>
> **目标**: 设计一套全新的架构，吸取当前系统精华，支撑 iOS 为主的百万用户规模产品
>
> **日期**: 2026-03-03
> **参与**: Casey + Li Ya

---

## 目录

1. [当前架构精华与痛点](#1-当前架构精华与痛点)
2. [新架构核心需求](#2-新架构核心需求)
3. [NanoClaw 深度分析](#3-nanoclaw-深度分析)
4. [核心决策：NanoClaw 部署模式](#4-核心决策nanoclaw-部署模式)
5. [Agent Filesystem 方案](#5-agent-filesystem-方案)
6. [Agent 间通信设计](#6-agent-间通信设计)
7. [NanoClaw 改造 vs 重写](#7-nanoclaw-改造-vs-重写)
8. [版本管理与发布策略](#8-版本管理与发布策略)
9. [完整架构蓝图](#9-完整架构蓝图)
10. [成本模型](#10-成本模型)
11. [待决策清单](#11-待决策清单)
12. [风险登记](#12-风险登记)

---

## 1. 当前架构精华与痛点

### 1.1 当前四服务拓扑

```
iOS App (Flutter + WebView hybrid)
    │
    ├── WebRTC ──► vi-realtime (LiveKit Agent, Gemini 2.5 Flash 原生音视频)
    │                  │
    │                  ├── HTTP ──► api-server (FastAPI, PostgreSQL, Redis)
    │                  └── RPC  ──► vi-gateway (Node.js, Gemini/Claude 执行器)
    │
    └── HTTP/SSE ──► api-server
```

### 1.2 值得保留的精华

| 精华 | 为什么保留 |
|------|-----------|
| **Gemini 2.5 Flash 原生音视频管道** | 零延迟，无需 STT→LLM→TTS 三跳，Gemini 直接处理音频和视频帧 |
| **LiveKit DataChannel + RPC 通信** | 低延迟、双向、有类型的实时通信，比纯 WebSocket 强 |
| **三层记忆金字塔** | identity/semantic/episodic 分层 + 重要度评分，记忆检索质量高 |
| **模块化渲染** | native module（结构化 JSON → 原生 UI）vs iframe HTML，兼顾效果和性能 |
| **Gateway Lazy Join** | 按需加入房间，不常驻，省资源 |
| **Flutter + WebView 混合 App** | 原生相机/音频 + WebView 内容层 + CDN 热更新，兼顾性能和迭代速度 |
| **匿名认证 → 渐进登录** | 用户无需注册即可体验，后续可升级为正式账号 |

### 1.3 当前痛点

| 痛点 | 影响 | 严重度 |
|------|------|--------|
| 单台 GCE VM 部署，无法横向扩展 | 用户量增长立刻拉胯 | 高 |
| api-server 代理 gateway（多余的一跳） | 延迟增加、单点故障 | 中 |
| vi-gateway NanoClaw adapter 图片全转 base64，无内存上限 | 大图可能 OOM | 高 |
| 前端纯 JSX 无 TypeScript（800 行协议层） | 维护风险大，重构困难 | 中 |
| 任务执行无中间持久化（gateway 崩 = 丢结果） | 用户体验差 | 高 |
| 单进程 gateway 无法高并发 | 百万用户不可能 | 高 |
| vi-gateway 既是路由又是执行器，职责不清 | 扩展困难 | 中 |

---

## 2. 新架构核心需求

| # | 需求 | 约束 |
|---|------|------|
| 1 | iOS 为主的手机产品 | Flutter + WebView 混合架构（已有） |
| 2 | 百万用户规模 | DAU 10 万级，峰值同时在线 2 万 |
| 3 | LiveKit 实时音视频 + Gemini Live | 保留现有 Gemini 2.5 Flash 原生管道 |
| 4 | NanoClaw 作为主 Agent 大脑 | 替代 OpenClaw，轻量但需改造 |
| 5 | 成本可控 | 月成本不能随用户数线性增长 |
| 6 | Agent 需要 filesystem（coding 等场景） | 安全隔离 + 持久化 + 高性能 |
| 7 | LiveKit agent ↔ NanoClaw agent 通信 | 实时、低延迟、可靠 |
| 8 | NanoClaw 动态更新版本 | 用户无感知升级 |
| 9 | 平台化支持 | 多用户共享基础设施 |

---

## 3. NanoClaw 深度分析

### 3.1 NanoClaw 是什么

NanoClaw 是 2026 年 1 月发布的轻量级 AI Agent 框架，作为 OpenClaw（43 万行代码）的极简替代：

| 维度 | OpenClaw | NanoClaw |
|------|----------|----------|
| 源文件 | 3,680 | 15 |
| 代码量 | ~434,000 行 | ~3,900 行 |
| 依赖 | 70+ | <10 |
| 配置文件 | 53 | 0 |
| 安全模型 | 应用级（allowlist） | OS 容器隔离 |
| 模型支持 | Claude/GPT/Ollama 等 | 仅 Anthropic Claude |
| 上下文占比 | 多个 context window | Claude 200K 的 ~17% |

### 3.2 NanoClaw 核心架构

```
消息通道 (WhatsApp/Telegram/...)
    │
    ▼
index.ts (编排器: 轮询 + 消息处理 + agent 调度)
    │
    ▼
group-queue.ts (每组 FIFO 队列, 并发限制=3, 指数退避)
    │
    ▼
container-runner.ts (为每组生成隔离 Linux 容器)
    │                          ┌──────────────────┐
    ├── macOS: Docker          │  容器内部：        │
    │   (原本 Apple Container,  │  - Claude Agent SDK │
    │    因 bug 切回 Docker)    │  - 独立 filesystem  │
    │                          │  - IPC 通信文件     │
    └── Linux: Docker          │  - CLAUDE.md 记忆   │
                               └──────────────────┘
    │
    ▼
ipc.ts (容器↔宿主 JSON 文件通信 + 授权验证)
    │
    ▼
db.ts (SQLite: 消息、会话、组、任务)
```

### 3.3 Skill 安装机制 —— "Coding Itself"

NanoClaw 最独特的设计：**零配置，全靠 Claude Code 改写自身源码**

```
用户执行 /add-telegram
    │
    ▼
Claude Code 读取 .claude/skills/add-telegram/SKILL.md
    │ (YAML 前置 + 自然语言指令)
    ▼
Claude Code 理解当前代码库 (3,900 行, 17% context)
    │
    ▼
Claude Code 直接编辑 NanoClaw 源码 (index.ts, 新增 telegram-adapter.ts 等)
    │
    ▼
用户的 NanoClaw fork 现在支持 Telegram 了
```

**优点**: 极度灵活，每个用户的代码只包含自己需要的功能
**缺点**: 百万用户 = 百万份不同的代码，不可能做平台化

### 3.4 NanoClaw 用于平台化的致命问题

| 问题 | 详情 |
|------|------|
| **单用户设计** | 没有多租户概念，一个进程服务一个用户 |
| **Skill = 改源码** | 无法给百万用户各维护一份不同代码 |
| **无 HTTP API** | 无法被外部服务调用 |
| **SQLite** | 单机存储，不支持分布式 |
| **强依赖 Docker** | 每个用户每组一个容器 |
| **仅 Claude** | 不支持其他 LLM |
| **无内存搜索** | 文件型记忆，grep 检索，50+ 文件后体验骤降 |

---

## 4. 核心决策：NanoClaw 部署模式

### 4.1 三种方案对比

#### 方案 A: 一人一个 NanoClaw

```
用户 A → NanoClaw 实例 A (容器) → Claude API
用户 B → NanoClaw 实例 B (容器) → Claude API
用户 C → NanoClaw 实例 C (容器) → Claude API
...
用户 1M → NanoClaw 实例 1M → Claude API   ← 不可能
```

| 优点 | 缺点 |
|------|------|
| 完美隔离，独立 filesystem | 百万用户 = 百万容器，不可能 |
| Skill 可以完全个性化 | 冷启动 3-8s，影响体验 |
| 安全，用户间零干扰 | 资源浪费（大多数时间 idle） |
| 容器崩溃不影响其他用户 | 成本 ~$5-15/用户/月 |

**结论**: 只适合 VIP/付费高级用户或 coding 场景

#### 方案 B: 共享 NanoClaw 池

```
用户 A ─┐
用户 B ─┤→ NanoClaw Pool (N 个实例, N << M)
用户 C ─┘
```

| 优点 | 缺点 |
|------|------|
| 资源利用率高 | filesystem 隔离困难 |
| 成本 ~$0.05-0.2/用户/月 | Skill 个性化丢失 |
| 易于统一版本管理 | 并发争用（一个慢任务阻塞池） |
| 简单的运维 | 用户数据安全风险 |

**结论**: 适合轻量任务（问答、搜索），不适合需要 filesystem 的场景

#### 方案 C: 混合三层架构（推荐）

```
┌─────────────────────────────────────────────────────┐
│                    用户请求                           │
└────────────────────┬────────────────────────────────┘
                     │
           ┌─────────▼──────────┐
           │   Agent Router     │  ← 根据任务类型 + 用户等级路由
           └─────────┬──────────┘
                     │
       ┌─────────────┼──────────────────┐
       ▼             ▼                  ▼
 ┌──────────┐  ┌───────────┐    ┌─────────────┐
 │ 轻量层    │  │ 标准层     │    │ 重量层       │
 │ Stateless │  │ Warm Pool │    │ Dedicated   │
 │           │  │           │    │             │
 │ Claude    │  │ NanoClaw  │    │ NanoClaw    │
 │ API 直调   │  │ 预热容器池  │    │ 独占实例     │
 │           │  │           │    │ + 持久FS    │
 └──────────┘  └───────────┘    └─────────────┘
   ~80%请求       ~15%请求          ~5%请求
   ~$0/次        ~$0.5/次         ~$2-5/次
```

**轻量层 (80% 流量)**

- 场景: 简单问答、信息查询、日常对话、天气查询
- 实现: 直接调 Claude/Gemini API，不需要 NanoClaw
- 无状态，横向无限扩展
- 成本: 仅 API 调用费

**标准层 (15% 流量)**

- 场景: 需要工具调用（搜索、分析、生成 HTML）但不需要持久 filesystem
- 实现: 从预热容器池取一个 NanoClaw 实例，执行完归还
- NanoClaw 容器预装通用 Skill，按需注入用户上下文
- 池大小按 QPS 自动伸缩

**重量层 (5% 流量)**

- 场景: coding、复杂多步骤任务、需要 filesystem 持久化
- 实现: 为用户分配独占 NanoClaw + 持久 OverlayFS 层
- 完成后容器回收，用户层快照保存到对象存储
- 下次使用时恢复快照

### 4.2 为什么推荐方案 C

| 维度 | 方案 A | 方案 B | 方案 C |
|------|--------|--------|--------|
| 百万用户可行性 | 不可能 | 可行 | 可行 |
| Filesystem 支持 | 完美 | 无 | 按需分配 |
| 成本/用户/月 | $5-15 | $0.05-0.2 | ~$0.3-1 |
| 用户体验 | 最好 | 够用 | 分层最优 |
| 运维复杂度 | 极高 | 低 | 中 |
| Skill 个性化 | 完全 | 无 | 标准层通用/重量层可定制 |

---

## 5. Agent Filesystem 方案

### 5.1 为什么 Agent 需要 Filesystem

- **Coding 场景**: Agent 需要创建/编辑文件、运行命令
- **NanoClaw 依赖**: Claude Agent SDK 需要 `$HOME/.claude/` 目录
- **Skill 执行**: 部分 Skill 需要临时文件空间
- **项目上下文**: 用户的项目文件需要在 Agent 容器内可访问

### 5.2 方案对比

| 方案 | 读写性能 | 隔离性 | 持久性 | 容灾 | 成本 | 冷启动 |
|------|----------|--------|--------|------|------|--------|
| **Local PV (本地盘)** | ★★★★★ | ★★★ | ★☆ | ✗ | 低 | 0 |
| **NFS/EFS** | ★★☆ | ★★★★ | ★★★★★ | ✓ | 中高 ($0.3/GB) | 0 |
| **tmpfs (RAM)** | ★★★★★ | ★★★★★ | ✗ | ✗ | 低 (吃 RAM) | 0 |
| **OverlayFS** | ★★★★ | ★★★★★ | ★★★ | 需快照 | 低 | 2-5s |
| **Firecracker microVM** | ★★★★ | ★★★★★ | ★★★ | 需快照 | 中 | 150ms |

### 5.3 推荐方案：OverlayFS + 对象存储快照

```
┌────────────────────────────────────────────────────┐
│                   容器实例                           │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Base Image (只读层, 所有实例共享)              │  │
│  │  - NanoClaw 运行时                            │  │
│  │  - Claude Agent SDK                           │  │
│  │  - 通用工具链 (Node.js, Python, git...)        │  │
│  │  - 通用 Skill 定义                             │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │ OverlayFS                 │
│  ┌──────────────────────▼───────────────────────┐  │
│  │  User Layer (可写层, per-user)                 │  │
│  │  - 用户的 CLAUDE.md (记忆)                     │  │
│  │  - 用户自定义 Skill 配置                       │  │
│  │  - 项目文件 (coding 场景)                      │  │
│  │  - 任务执行中间产物                            │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
                          │
                          │ 定期异步快照 (不阻塞执行)
                          ▼
              ┌───────────────────────┐
              │  GCS / S3             │
              │  user-layers/         │
              │    ├── user-A.tar.zst │  ← zstd 压缩, 通常 <10MB
              │    ├── user-B.tar.zst │
              │    └── ...            │
              └───────────────────────┘
```

**工作流程:**

```
新用户首次使用重量层:
  1. 创建空 User Layer → overlay mount → 即刻可用
  2. 任务完成后 → tar + zstd 压缩 → 上传 GCS (~2-5s)
  3. 容器回收

老用户再次使用重量层:
  1. 从 GCS 下载快照 → 解压 → overlay mount (~2-5s)
  2. 基于上次状态继续工作
  3. 任务完成后 → 增量快照 → 上传 GCS
  4. 容器回收
```

**为什么不选其他方案:**

- **Local PV**: 性能最好但无法容灾，节点挂了数据丢了
- **NFS/EFS**: 性能差（网络延迟），Agent 做文件密集操作时会拉胯
- **tmpfs**: 无法持久化，重启即丢
- **Firecracker**: 隔离性最好（独立内核），但运维复杂度高，且对非 AWS 环境支持有限

### 5.4 标准层 vs 重量层 Filesystem 差异

| | 标准层 | 重量层 |
|---|--------|--------|
| Filesystem | tmpfs (用完即弃) | OverlayFS + GCS 快照 |
| 大小 | 512MB | 10GB |
| 持久化 | 不需要 | GCS 快照 |
| 用途 | 临时文件、工具输出 | 项目文件、代码编辑 |
| 生命周期 | 任务结束即销毁 | 用户会话结束后快照保存 |

---

## 6. Agent 间通信设计

### 6.1 当前通信模式

```
vi-realtime ──HTTP──► api-server ──HTTP proxy──► vi-gateway
    │                                               │
    └──── LiveKit RPC (dispatch_task) ──────────────┘
```

**问题:**
- api-server 做 gateway 代理是多余的一跳
- 通信路径不统一（有些走 HTTP, 有些走 LiveKit RPC）
- NanoClaw 容器内的 Agent 无法主动与 vi-realtime 通信

### 6.2 新通信架构

```
┌───────────────┐                        ┌───────────────┐
│  vi-realtime  │◄══ LiveKit RPC ═══════►│ Agent Router  │
│  (System 1)   │   DataChannel 事件流    │  (新服务)      │
│               │                        │               │
│  Gemini Live  │                        │  任务路由       │
│  音视频处理    │                        │  执行器管理     │
│  记忆检索     │                        │  流式转发       │
└───────────────┘                        └───────┬───────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    ▼            ▼            ▼
                              ┌──────────┐ ┌──────────┐ ┌──────────┐
                              │ Claude   │ │ NanoClaw │ │ NanoClaw │
                              │ API 直调  │ │ Pool     │ │ Dedicated│
                              │ (轻量层)  │ │ (标准层)  │ │ (重量层)  │
                              └──────────┘ └──────────┘ └──────────┘
```

### 6.3 通信协议详细设计

#### vi-realtime → Agent Router

```
# 通过 LiveKit RPC 调用 (保留当前模式, 已验证)
Method: dispatch_task
Payload: {
  "taskId": "uuid",
  "prompt": "分析这张照片里的植物",
  "priority": "fast|thorough|code",
  "context": {
    "visualObservation": "用户正在看一盆绿色植物",
    "photoUrls": ["gs://..."],
    "userMemory": "用户喜欢园艺...",
    "viUserId": "vi-xxx"
  },
  "routing": {
    "preferredTier": "auto",  // auto|light|standard|heavy
    "maxLatency": 10000,       // ms
    "requireFilesystem": false
  }
}
```

#### Agent Router → NanoClaw 容器

```
# 新增: gRPC 双向流 (容器 ↔ Agent Router)
service AgentExecution {
  // 提交任务, 流式返回结果
  rpc Execute (TaskRequest) returns (stream TaskChunk);

  // 容器主动回调 (请求拍照、请求更多信息等)
  rpc Callback (AgentCallback) returns (CallbackResponse);
}
```

#### NanoClaw → vi-realtime (间接通信)

当 NanoClaw 需要让 realtime agent 做某事（如拍照、播报语音）:

```
NanoClaw 容器
    │
    │ gRPC Callback
    ▼
Agent Router
    │
    │ LiveKit RPC (rpcG2BSendReply / 自定义 RPC)
    ▼
vi-realtime
    │
    │ LiveKit RPC (rpcB2FTakePhoto)
    ▼
iOS App
```

### 6.4 为什么不让 NanoClaw 直接连 LiveKit

| 方案 | 优点 | 缺点 |
|------|------|------|
| NanoClaw 加入 LiveKit 房间 | 直接通信，延迟最低 | 每个 NanoClaw 容器都要连 LiveKit；容器池回收时需断开/重连；LiveKit 连接数成本 |
| 通过 Agent Router 中继 | 架构解耦，NanoClaw 无需知道 LiveKit；容器可以自由调度 | 多一跳（+5-10ms） |

**选择**: Agent Router 中继。多 5-10ms 延迟对非实时任务可以接受，架构简洁性和运维便利性更重要。

---

## 7. NanoClaw 改造 vs 重写

### 7.1 四种方案

| 方案 | 工作量 | 风险 | 灵活性 |
|------|--------|------|--------|
| **A: 直接用 NanoClaw** | 小 | 高 (先天不支持多租户) | 低 |
| **B: Fork + 增量改造** | 中 (1-2 月) | 中 (背债) | 中 |
| **C: 提取精华重写 "VI-Brain"** | 大 (2-3 月) | 低 | 高 |
| **D: 不用 NanoClaw, Claude Agent SDK + 自建** | 大 (2-3 月) | 中 | 最高 |

### 7.2 NanoClaw 哪些值得保留，哪些必须重写

```
保留 (经过验证的好设计):               重写 (不适合平台化):
✅ 容器隔离执行模型                     ❌ 单用户 fork-first 模式
✅ Claude Agent SDK 集成                ❌ SQLite 存储
✅ IPC 通信机制 (JSON 文件)             ❌ WhatsApp/消息平台耦合
✅ 任务队列 + 并发控制                   ❌ 无 HTTP/gRPC API
✅ 极简代码量 (~3900 行, 可审计)         ❌ Skill = 改源码
✅ 容器内 CLAUDE.md 记忆                ❌ 无多租户
```

### 7.3 推荐：方案 C — 提取精华重写 "VI-Brain"

**核心思路**: 把 NanoClaw 的容器隔离执行模型和 Claude Agent SDK 集成提取出来，重新包装为一个多租户、有 API、可横向扩展的服务。

```
vi-brain/
├── src/
│   ├── server.ts              # gRPC + HTTP API (新增)
│   │                           # - gRPC: 供 Agent Router 调用
│   │                           # - HTTP: 健康检查、管理接口
│   │
│   ├── container-pool.ts      # 容器池管理 (新增)
│   │                           # - 预热容器: 启动时预创建 N 个 idle 容器
│   │                           # - 按需扩展: QPS 升高时创建新容器
│   │                           # - 回收策略: idle > 5min 的容器销毁
│   │                           # - 容器健康检查: 心跳 + 资源使用监控
│   │
│   ├── container-runner.ts    # ← 来自 NanoClaw, 改造
│   │                           # - 多租户: 同一容器代码, 按用户注入不同配置
│   │                           # - 资源限制: cgroup CPU/内存限制
│   │                           # - 网络隔离: 只允许访问白名单域名
│   │
│   ├── ipc.ts                 # ← 来自 NanoClaw, 增强
│   │                           # - 改为 Unix Socket (比 JSON 文件快)
│   │                           # - 增加回调机制 (容器 → 宿主 → Agent Router)
│   │
│   ├── task-queue.ts          # ← 来自 NanoClaw group-queue, 增强
│   │                           # - 优先级队列 (fast > thorough > code)
│   │                           # - 全局 QPS 限制 + 每用户限额
│   │                           # - 任务超时自动取消
│   │
│   ├── skill-registry.ts     # Skill 注册表 (新增, 替代 fork 模式)
│   │                           # - Skill 定义: YAML + Markdown (类似 NanoClaw)
│   │                           # - 运行时注入: 容器启动时加载 Skill 到 CLAUDE.md
│   │                           # - 版本管理: Skill 独立版本, 可回滚
│   │                           # - 平台 Skill vs 用户自定义 Skill
│   │
│   ├── filesystem-manager.ts  # OverlayFS + 快照管理 (新增)
│   │                           # - 基础镜像管理
│   │                           # - 用户层创建/挂载/卸载
│   │                           # - GCS 快照上传/下载
│   │
│   ├── session-store.ts       # PostgreSQL/Redis (替代 SQLite)
│   │                           # - 任务状态持久化
│   │                           # - 中间结果缓存
│   │
│   └── metrics.ts             # Prometheus 指标
│                               # - 容器池利用率
│                               # - 任务延迟分布
│                               # - 错误率
│
├── skills/                    # 平台 Skill 定义
│   ├── web-search.skill.md    # 搜索类
│   ├── code-gen.skill.md      # 代码生成类
│   ├── image-analysis.skill.md # 图像分析类
│   ├── data-analysis.skill.md # 数据分析类
│   └── html-gen.skill.md      # UI/HTML 生成类
│
└── base-images/               # 容器基础镜像 Dockerfile
    ├── light/                 # 轻量镜像: Node.js + Claude SDK only (~200MB)
    └── full/                  # 完整镜像: + Python + git + 常用工具 (~800MB)
```

### 7.4 Skill 系统改造：从 "改源码" 到 "注入式"

```
NanoClaw 原始模式:                      VI-Brain 新模式:

用户 → /add-telegram                    平台 → API: executeTask(user, task)
  │                                       │
  ▼                                       ▼
Claude 读取 SKILL.md                    读取 Skill Registry
  │                                       │
  ▼                                       ▼
Claude 改写 NanoClaw 源码               组装 CLAUDE.md:
  │                                       - 系统提示词
  ▼                                       - 平台 Skill 定义
用户得到定制 fork                         - 用户自定义 Skill
                                          - 用户记忆上下文
问题: 百万用户 = 百万份代码                │
                                          ▼
                                        注入到容器的 /home/node/.claude/
                                          │
                                          ▼
                                        Claude Agent SDK 执行
                                          │
                                        优点: 代码统一, Skill 动态组装
```

**关键洞察**: NanoClaw 的 "整个代码库放进 context window" 这个设计是天才的。我们保留这个思路，但不是让 Claude 改源码，而是**把 Skill 定义作为 context 的一部分注入**。Claude 不需要改代码，只需要按 Skill 描述的方式使用工具。

---

## 8. 版本管理与发布策略

### 8.1 两层版本

```
┌─────────────────────────────────────────────────────────────┐
│                     版本管理                                  │
│                                                              │
│  Layer 1: Base Image (容器运行时)                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ vi-brain-base:v2.1.0                                 │    │
│  │ - NanoClaw 核心 (container-runner, ipc)              │    │
│  │ - Claude Agent SDK                                   │    │
│  │ - 工具链 (Node.js, Python, git)                      │    │
│  │ - 更新频率: ~每月                                     │    │
│  │ - 更新方式: Rolling update (新容器用新镜像, 旧容器 drain) │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 2: Skill Definitions (动态注入)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ skills/v3.5/                                         │    │
│  │ - web-search.skill.md v2.1                           │    │
│  │ - code-gen.skill.md v1.3                             │    │
│  │ - 更新频率: ~每周                                     │    │
│  │ - 更新方式: 即时生效 (下次任务执行时加载最新 Skill)       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 3: User State (OverlayFS 快照)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ user-layers/user-A.tar.zst                           │    │
│  │ - 用户记忆、自定义配置                                │    │
│  │ - 完全不受 Layer 1/2 更新影响                         │    │
│  │ - 用户自主管理                                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Rolling Update 流程

```
1. CI 构建新 Base Image → push to Container Registry
   vi-brain-base:v2.2.0

2. VI-Brain 服务收到更新通知

3. 容器池渐进替换:
   ┌──────────────────────────────────────────┐
   │ 容器池 (大小=10)                          │
   │                                           │
   │ 时刻 T0: [v2.1] [v2.1] [v2.1] ... (10个)│
   │                                           │
   │ 时刻 T1: 新建 v2.2 容器加入池              │
   │          [v2.1×9] [v2.2×1]                │
   │                                           │
   │ 时刻 T2: v2.1 容器完成当前任务后不再复用    │
   │          [v2.1×5] [v2.2×5]                │
   │                                           │
   │ 时刻 T3: 全部替换完成                      │
   │          [v2.2×10]                        │
   └──────────────────────────────────────────┘

4. 用户完全无感知
```

### 8.3 金丝雀发布

```
# 生产环境容器池: 100 个预热容器
# 金丝雀: 5% 流量走新版本

Agent Router 路由策略:
  if random() < 0.05:
    route to vi-brain-base:v2.2.0-canary
  else:
    route to vi-brain-base:v2.1.0-stable

# 监控金丝雀指标:
# - 任务成功率
# - 平均延迟
# - 容器 OOM/崩溃率
# 全部达标 → 逐步扩大比例 → 全量切换
```

---

## 9. 完整架构蓝图

### 9.1 总体架构图

```
                          ┌──────────────────────────────┐
                          │        iOS App (Flutter)      │
                          │  LiveKit iOS SDK (WebRTC)     │
                          │  Native Camera + Voice        │
                          │  WebView Content Bundle       │
                          └──────────┬───────────────────┘
                                     │
                      WebRTC + HTTPS │
                                     │
                  ┌──────────────────▼───────────────────┐
                  │         Cloud Load Balancer           │
                  │    (GKE Ingress / Cloud LB)          │
                  └──┬──────────┬──────────┬─────────────┘
                     │          │          │
          ┌──────────▼───┐ ┌───▼─────┐ ┌──▼───────────┐
          │  LiveKit     │ │  API    │ │ Push Gateway │
          │  Cloud SFU   │ │ Server  │ │ (APNs/FCM)   │
          │  (托管)      │ │ ×3-10  │ │ ×2-3         │
          └──────┬───────┘ └───┬─────┘ └──────────────┘
                 │             │
      ┌──────────▼───┐        │
      │ vi-realtime  │◄───────┘ (gRPC / HTTP internal)
      │ (Gemini Live)│
      │ K8s Pod ×N   │
      └───────┬──────┘
              │ LiveKit RPC (dispatch_task)
      ┌───────▼──────┐
      │ Agent Router │ ← 替代 vi-gateway, 纯路由 + 流转发
      │ K8s Pod ×3-5 │
      └──┬──────┬────┘
         │      │
    ┌────▼──┐ ┌─▼──────────────────────────┐
    │Claude │ │       VI-Brain Cluster      │
    │API 直调│ │    (NanoClaw 精华重写)       │
    │(轻量层)│ │                             │
    └───────┘ │  ┌────────────────────────┐ │
              │  │ Container Pool Manager │ │
              │  │ 预热池 + 按需扩展        │ │
              │  │                        │ │
              │  │  Standard Pool:        │ │
              │  │  ┌───┐┌───┐┌───┐      │ │
              │  │  │C1 ││C2 ││C3 │ ...  │ │  ← tmpfs, 无状态
              │  │  └───┘└───┘└───┘      │ │
              │  │                        │ │
              │  │  Dedicated Pool:       │ │
              │  │  ┌───┐┌───┐           │ │
              │  │  │D1 ││D2 │ ...       │ │  ← OverlayFS, 有状态
              │  │  └───┘└───┘           │ │
              │  └────────────────────────┘ │
              │                             │
              │  ┌────────────────────────┐ │
              │  │ Skill Registry         │ │
              │  │ 平台 Skill + 版本管理    │ │
              │  └────────────────────────┘ │
              │                             │
              │  ┌────────────────────────┐ │
              │  │ OverlayFS Manager      │ │
              │  │ 用户层 + GCS 快照       │ │
              │  └────────────────────────┘ │
              └─────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │     Data Layer        │
              │                       │
              │  ┌─────────────────┐  │
              │  │  Cloud SQL      │  │  ← PostgreSQL (用户、会话、记忆)
              │  │  (HA, Private)  │  │
              │  └─────────────────┘  │
              │                       │
              │  ┌─────────────────┐  │
              │  │  Redis Cluster  │  │  ← 缓存、Pub/Sub、任务队列
              │  │  (Memorystore)  │  │
              │  └─────────────────┘  │
              │                       │
              │  ┌─────────────────┐  │
              │  │  GCS / S3      │  │  ← 照片、OverlayFS 快照、Content Bundle
              │  └─────────────────┘  │
              └───────────────────────┘
```

### 9.2 服务职责

| 服务 | 语言 | 核心职责 | 扩展单位 | HPA 指标 |
|------|------|----------|----------|----------|
| **iOS App** | Flutter (Dart) | UI、相机、WebRTC、模块渲染 | App Store | N/A |
| **vi-realtime** | Python | Gemini Live 音视频、实时对话、记忆检索 | K8s Pod | LiveKit 房间数 |
| **API Server** | Python (FastAPI) 或 Go | 认证、session、memory CRUD、推送 | K8s Pod | CPU / QPS |
| **Agent Router** | TypeScript | 任务路由、层级选择、流式转发 | K8s Pod | 并发连接数 |
| **VI-Brain** | TypeScript | 容器池、Skill 注入、任务执行 | K8s Node | 容器池利用率 |
| **Push Gateway** | Go | APNs/FCM 离线推送 | K8s Pod | 推送队列深度 |

### 9.3 数据流：典型用户会话

```
1. 用户打开 App
   iOS App → POST /api/livekit/token → API Server
   API Server → Firebase Auth 验证 → 生成 LiveKit JWT
   iOS App ← {token, room_name, livekit_url}

2. 连接实时通道
   iOS App → WebRTC connect → LiveKit Cloud → vi-realtime joins room
   vi-realtime → GET /api/internal/memories/context → API Server
   vi-realtime → Gemini Live session starts (带用户记忆上下文)

3. 用户说话 + 拍照
   iOS App → WebRTC audio+video → vi-realtime → Gemini 2.5 Flash
   Gemini → "这是一盆多肉植物, 我来帮你查养护方法"
   vi-realtime → DataChannel → iOS App (语音 + 字幕)

4. 触发深度任务
   vi-realtime → dispatch_task RPC → Agent Router
   Agent Router 判断: 需要搜索+生成 HTML → 标准层
   Agent Router → 从容器池取 NanoClaw 实例
   Agent Router → 注入 Skill (web-search + html-gen) + 用户上下文
   NanoClaw 执行 → 流式 HTML 结果

5. 结果返回
   NanoClaw → gRPC stream → Agent Router
   Agent Router → DataChannel → iOS App (HTML 流式渲染 in WebView)
   Agent Router → POST /api/internal/sessions → API Server (持久化)
   Agent Router → 归还 NanoClaw 容器到池

6. 会话结束
   vi-realtime → PATCH /api/internal/sessions/{id} → API Server
   API Server → FCM push → iOS App (如果用户离开了)
```

---

## 10. 成本模型

### 10.1 假设

```
注册用户: 1,000,000
DAU: 100,000
峰值同时在线: 20,000
平均每用户每天: 5 次对话, 2 次深度任务
```

### 10.2 成本估算

| 项目 | 月成本 (USD) | 计算方式 |
|------|-------------|---------|
| **LiveKit Cloud** | $3,000-8,000 | 峰值 20K 并发房间, 平均 5min/session |
| **Gemini API (realtime)** | $3,000-8,000 | Flash 价格低; 100K DAU × 5 次/天 × ~$0.001/次 |
| **Claude API (轻量层)** | $2,000-5,000 | 80% 流量 × Haiku/Sonnet 混合 |
| **Claude API (标准/重量层)** | $3,000-10,000 | 20% 流量 × Sonnet, 含容器内 SDK 调用 |
| **GKE 集群** | $2,000-4,000 | 3-5 节点 (e2-standard-8), 自动扩缩 |
| **VI-Brain 容器节点** | $1,000-3,000 | 2-4 节点, 按需扩展 |
| **Cloud SQL** | $500-1,000 | PostgreSQL HA, db-standard-4 |
| **Memorystore Redis** | $200-500 | 5GB 集群 |
| **GCS 存储** | $200-500 | 照片 + OverlayFS 快照 + Content Bundle |
| **CDN + LB** | $300-800 | Cloud CDN + HTTP(S) LB |
| **Push (FCM)** | $0 | Google 免费 |
| **Firebase Auth** | $0 | 免费层 (50K/月认证足够) |
| | | |
| **基础设施小计** | **$4,200-9,800** | |
| **LLM API 小计** | **$8,000-23,000** | |
| **总计** | **$12,200-32,800** | |
| **每用户/月** | **$0.012-0.033** | |

### 10.3 成本优化策略

```
优先级 1: 减少 LLM API 调用 (占总成本 ~65%)
  ├── 结果缓存: 相似问题直接返回缓存 (Redis, TTL 24h)
  ├── 模型分级: 简单任务 → Haiku ($0.25/M), 中等 → Sonnet, 复杂 → Opus
  ├── 提示词优化: 减少 token 消耗, 压缩上下文
  └── 用户限额: 免费用户 20 次/天, 付费用户按套餐

优先级 2: 容器池效率
  ├── 预测性预热: 根据历史流量预热容器数量
  ├── 快速回收: 任务完成立即归还, 不等 idle timeout
  ├── 容器复用: 标准层容器执行完清理 tmpfs 后直接复用
  └── 冷启动优化: 基础镜像精简, 去掉不必要的工具

优先级 3: 基础设施
  ├── Spot/Preemptible VM: VI-Brain 节点用抢占式实例 (省 60-70%)
  ├── 自动缩容: 低谷期缩减容器池和 GKE 节点
  ├── 区域优化: 选择成本最低的 GCP region
  └── Committed Use Discount: 基线负载用 1 年承诺折扣 (省 30%)
```

### 10.4 与当前成本对比

| 阶段 | 用户数 | 月成本 | 每用户 |
|------|--------|--------|--------|
| 当前 (Phase 0) | <50 | ~$130-320 | N/A (Demo) |
| Phase 1 (v5) | 50-500 | ~$712-5,612 | $1.4-11.2 |
| Phase 2 (v5) | 500-5,000 | ~$3,000-15,000 | $0.6-3.0 |
| **v2 (本方案)** | **1,000,000** | **$12K-33K** | **$0.012-0.033** |

规模效应显著——百万用户时每用户成本降到 1-3 美分/月。

---

## 11. 待决策清单

### D1: API Server 语言

| 选项 | 优点 | 缺点 |
|------|------|------|
| **保留 Python/FastAPI** | 团队熟悉; 与 vi-realtime 统一语言; 开发快 | 性能不如 Go (10x); 高并发时 GIL 问题 |
| **切换 Go** | 性能极好; 适合高并发网关; 编译型二进制部署简单; 长期省资源 | 团队需要学; 与 Python AI 生态不同语言 |
| **保留 Python, 热路径用 Go 微服务** | 渐进式; 不阻断开发 | 两种语言维护成本 |

> **倾向**: 保留 Python/FastAPI。百万用户 QPS 下 FastAPI + uvicorn 配合 GKE HPA 足够。Go 的性能优势在 API Server 层不是瓶颈（瓶颈在 LLM API 调用）。

### D2: 容器运行时

| 选项 | 冷启动 | 隔离性 | 运维 | 适用云 |
|------|--------|--------|------|--------|
| **Docker** | 1-3s | 进程级 (共享内核) | 成熟 | 全部 |
| **Firecracker microVM** | 125-150ms | 内核级 (独立内核) | 较复杂 | 主要 AWS |
| **gVisor** | 500ms-1s | 内核系统调用过滤 | 中等 | GKE 原生支持 |
| **Kata Containers** | 1-2s | 轻量 VM | 较复杂 | 全部 |

> **倾向**: GKE + gVisor (Sandbox Pod)。GKE 原生支持, 无需额外运维, 安全性比裸 Docker 好。Firecracker 备选（如果后续迁移 AWS）。

### D3: NanoClaw 改造方案

| 选项 | 工作量 | 建议 |
|------|--------|------|
| **A: 直接用** | 小 | ❌ 不可行, 无多租户 |
| **B: Fork + 改造** | 中 | ⚠️ 可行但背债 |
| **C: 提取精华重写** | 大 | ✅ 推荐, 彻底解决问题 |
| **D: 纯自建** | 大 | ⚠️ 可行但失去 NanoClaw 经验 |

> **倾向**: 方案 C。NanoClaw 代码量小 (3900 行), 重写不是重写 40 万行, 而是把 3900 行的精华提取到我们的架构里。

### D4: Skill 系统设计

| 选项 | 个性化 | 平台化 |
|------|--------|--------|
| **A: 保留 fork-first (每用户一份代码)** | 完美 | 不可能 |
| **B: 注入式 (CLAUDE.md 动态组装)** | 好 | 好 |
| **C: 插件式 (标准 API + Skill 商店)** | 最好 | 最好但最复杂 |

> **倾向**: 先做 B (注入式), 后续可演进到 C (插件式)。注入式够用且实现简单, 插件式是未来目标。

### D5: 数据库

| 选项 | 记忆搜索质量 | 成本 |
|------|-------------|------|
| **PostgreSQL + pgvector** | 好 (向量搜索) | 低 (Cloud SQL 原生) |
| **PostgreSQL + Qdrant** | 更好 | 中 (+$100-300/月) |
| **PostgreSQL + Pinecone** | 最好 (托管) | 高 (+$70-700/月) |

> **倾向**: PostgreSQL + pgvector。先用免费方案验证, 记忆搜索质量不够时再加专门的向量数据库。

### D6: 前端框架 (iOS App)

| 选项 | 建议 |
|------|------|
| **保留 Flutter + WebView 混合** | ✅ 推荐, 已有 80% 完成度, 架构已验证 |
| **纯 Swift Native** | ❌ 成本太高, 内容层无法热更新 |
| **React Native** | ❌ 抛弃现有 Flutter 工作量 |

> **倾向**: 保留 Flutter + WebView。已经验证的方案, 不折腾。

---

## 12. 风险登记

| # | 风险 | 可能性 | 影响 | 缓解措施 |
|---|------|--------|------|---------|
| R1 | NanoClaw 上游破坏性变更 | 中 | 低 | 重写后与上游解耦, 只保留设计理念 |
| R2 | 容器池冷启动影响用户体验 | 中 | 中 | 预热池 + gVisor (比 Docker 快); 轻量层无需容器 |
| R3 | OverlayFS 快照恢复慢 (大文件) | 低 | 中 | 限制用户层大小 (10GB); zstd 压缩; 增量快照 |
| R4 | Claude API 成本超预期 | 高 | 高 | 分级模型 + 缓存 + 用户限额; 备选: 接入开源模型 |
| R5 | 容器逃逸安全风险 | 低 | 极高 | gVisor 内核隔离; 网络白名单; 只读 base image |
| R6 | GKE 成本随规模线性增长 | 中 | 中 | Spot VM + 自动缩容 + CUD 折扣 |
| R7 | LiveKit Cloud 费用随并发增长 | 中 | 中 | 优化房间生命周期; 空闲超时断开; 备选自建 LiveKit |
| R8 | Skill 注入安全问题 (提示词注入) | 中 | 高 | Skill 审核机制; 沙箱执行; 输出过滤 |
| R9 | 百万用户级 PostgreSQL 性能 | 中 | 高 | 读写分离; 分表; 必要时 Cloud Spanner |
| R10 | Flutter WebView 内存泄漏 (长会话) | 中 | 中 | WebView 回收池; 强制 reload; 内存监控 |

---

## 附录 A: 与 v5 架构的关系

```
v5 (渐进式):
  Phase 0: 单机 Docker Compose (现在)
  Phase 1: 双机 Staging/Production
  Phase 2: MIG + Cloud SQL

v2 (本方案):
  目标: 百万用户规模的终态架构
  关系: v2 是 v5 Phase 2 之后的演进, 不是替代

实施路径:
  v5 Phase 0 → Phase 1 → Phase 2 → 逐步引入 v2 组件
                                         │
                                    ┌────┼────────────────┐
                                    ▼    ▼                ▼
                              Agent Router  VI-Brain    Push Gateway
                              (替代gateway) (新增)       (新增)
```

**关键原则: v2 不是推倒重来, 而是在 v5 基础上渐进引入新组件。**

---

## 附录 B: NanoClaw 源码参考

提取重写时需要重点参考的 NanoClaw 源文件:

| 文件 | 行数 | 保留/重写 | 参考价值 |
|------|------|----------|---------|
| `container-runner.ts` | ~400 | 改造 | Docker 容器生命周期管理 |
| `ipc.ts` | ~300 | 改造 | 容器↔宿主安全通信 |
| `group-queue.ts` | ~250 | 改造 | 任务队列、并发控制、退避策略 |
| `index.ts` | ~500 | 重写 | 编排模式参考 |
| `db.ts` | ~200 | 不用 | SQLite → PostgreSQL |
| `task-scheduler.ts` | ~150 | 参考 | Cron/间隔任务 |

## 附录 C: 分阶段实施建议

```
阶段 1 (Month 1-2): 基础
  - Agent Router 服务 (替代 vi-gateway)
  - Claude API 直调 (轻量层)
  - 保留现有 api-server + vi-realtime
  - 目标: 架构解耦, 不影响现有功能

阶段 2 (Month 2-4): VI-Brain MVP
  - VI-Brain 服务 (容器池 + 标准层)
  - Skill 注入式系统
  - 目标: NanoClaw 容器化执行跑通

阶段 3 (Month 4-6): 持久化 + 重量层
  - OverlayFS + GCS 快照
  - 重量层独占容器
  - 目标: coding 场景支持

阶段 4 (Month 6-9): 规模化
  - GKE 集群部署
  - 容器池自动伸缩
  - 监控 + 告警
  - 目标: 承载万级用户

阶段 5 (Month 9-12): 百万用户
  - 全链路压测
  - 成本优化 (Spot VM, CUD)
  - Skill 商店 (如果需要)
  - 目标: 百万用户稳定运行
```

---

*VI Agent v2 Architecture Brainstorm | 2026-03-03*
*此文档为头脑风暴草案, 待关键决策确定后出正式架构文档*
