# VI Agent System V4 Architecture

> 文档日期: 2026-03-03
> 状态: Design Complete — 待实施

---

## 0. V3 → V4 核心变化

| 维度 | V3 | V4 | 变化原因 |
|------|----|----|---------|
| **执行引擎** | vi-gateway (无状态, 纯文本流) | NanoClaw (有状态, Claude Agent SDK + 工具) | Agent 需要文件操作、持久记忆、工具调用 |
| **用户数据** | PostgreSQL 集中存储 | 文件系统 (S3 + 本地缓存) + PostgreSQL | 每用户独立 workspace，Agent 直接读写文件 |
| **通信模型** | LiveKit RPC + DataChannel (紧耦合) | Redis 事件总线 (松耦合) | NanoClaw 不加入 LiveKit 房间，纯 Redis 通信 |
| **结果推送** | DataChannel → Frontend | Redis → SSE → Frontend | 解耦 NanoClaw 与 LiveKit |
| **Context 管理** | 被动 (Agent 启动时拉取) | 主动 (每30秒编译推送) | Realtime Agent 持续获得最新 context |
| **用户映射** | 无固定绑定 | 1:1 固定 (10用户/VPS) | 专属 Agent，持久化 workspace |
| **密度** | 1 gateway 服务所有用户 | 10 NanoClaw 容器/VPS | 性价比优化 |
| **Token 管理** | 仅 JWT + 设备认证 | + OAuth 第三方集成 | Agent 代用户操作外部服务 |

---

## 1. 系统概览

### 1.1 架构总览

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         VPS ($50/month, 10 users)                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ┌─────────────┐     WebRTC (voice+video)      ┌──────────────────────┐     ║
║  │  Frontend    │◄────────────────────────────►│  LiveKit Cloud        │     ║
║  │  (nginx)     │     SSE (results+events)      └──────────┬───────────┘     ║
║  │              │◄──────────────┐                          │                 ║
║  └──────┬───────┘               │                          │                 ║
║         │ HTTP                  │                          ▼                 ║
║         ▼                       │               ┌──────────────────────┐     ║
║  ┌──────────────────┐     ┌────┴─────┐         │  Realtime Agent x10  │     ║
║  │   API Server     │◄───►│  Redis   │◄───────►│  (LiveKit SDK)       │     ║
║  │   (FastAPI)      │     │  (7.x)   │         │  • Gemini 实时语音视觉 │     ║
║  │                  │     │          │         │  • 30秒 context 订阅  │     ║
║  │  Auth Center     │     │ Channels:│         │  • 事件发布          │     ║
║  │  Token Center    │     │ vi:ctx   │         └──────────────────────┘     ║
║  │  Memory V3       │     │ vi:exec  │                                      ║
║  │  Session Mgmt    │     │ vi:stream│                                      ║
║  │  SSE Relay       │     │ vi:events│                                      ║
║  │  FS Proxy        │     │ vi:act   │                                      ║
║  └──────────────────┘     └────┬─────┘                                      ║
║         │                      │                                             ║
║         │ HTTP (internal)      │ Redis pub/sub + Streams                     ║
║         ▼                      ▼                                             ║
║  ┌────────────────────────────────────────────────────────────────────────┐  ║
║  │              NanoClaw Execution Agent (Docker x10, 1:1 per user)       │  ║
║  │  ┌──────────┐ ┌──────────┐ ┌──────────┐          ┌──────────┐        │  ║
║  │  │ Agent-1  │ │ Agent-2  │ │ Agent-3  │   ...    │ Agent-10 │        │  ║
║  │  │ user-001 │ │ user-002 │ │ user-003 │          │ user-010 │        │  ║
║  │  │ Claude   │ │ Claude   │ │ Claude   │          │ Claude   │        │  ║
║  │  │ AgentSDK │ │ AgentSDK │ │ AgentSDK │          │ AgentSDK │        │  ║
║  │  │ +Tools   │ │ +Tools   │ │ +Tools   │          │ +Tools   │        │  ║
║  │  └────┬─────┘ └────┬─────┘ └────┬─────┘          └────┬─────┘        │  ║
║  │       ▼             ▼             ▼                    ▼              │  ║
║  │  ┌────────────────────────────────────────────────────────────────┐   │  ║
║  │  │            Local FS Cache (/data/users/{uid}/)                 │   │  ║
║  │  └────────────────────────────────────────────────────────────────┘   │  ║
║  └────────────────────────────────────────────────────────────────────────┘  ║
║         │                                                                    ║
║         │ async sync                                                         ║
║         ▼                      ▼                                             ║
║  ┌──────────────┐     ┌──────────────┐                                      ║
║  │  PostgreSQL  │     │   S3 / GCS   │                                      ║
║  │  (metadata)  │     │  (user FS)   │                                      ║
║  └──────────────┘     └──────────────┘                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 1.2 设计哲学演进：从"三个系统"到"三层架构"

**V3: 三个系统 (System 1/2/3)**

功能正确但耦合度高 — Gateway 必须加入 LiveKit 房间，通过 DataChannel 推流，与 LiveKit 协议紧密绑定。

**V4: 三层解耦架构**

| 层 | 职责 | 服务 | 通信 |
|----|------|------|------|
| **交互层 (Interaction)** | 实时语音/视觉，低延迟 | Realtime Agent + Frontend | LiveKit WebRTC |
| **执行层 (Execution)** | 深度推理，工具调用，文件操作 | NanoClaw Agent | Redis (纯解耦) |
| **状态层 (State)** | 持久化，事件总线，认证 | API Server + Redis + S3 + PostgreSQL | HTTP + Redis |

核心变化：**执行层通过 Redis 与其他层完全解耦。** NanoClaw 不需要知道 LiveKit 的存在，Realtime Agent 不需要知道 NanoClaw 的存在。Redis 是唯一的粘合剂。

### 1.3 服务职责矩阵

| 服务 | 语言 | 实例数 | 核心职责 |
|------|------|--------|---------|
| **Realtime Agent** | Python | 10 (1/用户) | 实时语音/视觉 (Gemini)，Redis context 订阅，事件发布 |
| **NanoClaw Agent** | Node.js | 10 (1/用户, Docker) | 深度执行 (Claude SDK + tools)，用户 FS 管理，context 编译，结果流 |
| **API Server** | Python | 1 | 认证 (JWT + Device + OAuth)，Memory V3，Session 管理，SSE 中继，FS Proxy |
| **Redis** | — | 1 | 事件总线，context 缓存，流式数据，pub/sub |
| **PostgreSQL** | — | 1 | 用户元数据，session 记录，索引 |
| **S3/GCS** | — | External | 用户文件系统持久化备份 |
| **Frontend** | React | 1 (nginx) | UI，SSE 接收，LiveKit WebRTC |

---

## 2. NanoClaw Execution Agent

### 2.1 设计来源

基于开源 [NanoClaw](https://github.com/qwibitai/nanoclaw) 框架 fork + extend。NanoClaw 的核心优势：
- Claude Agent SDK 集成（完整工具层：文件编辑、bash、搜索）
- Docker 容器隔离（OS 级安全）
- 文件系统 IPC（简单、透明）
- 代码量小（~35k tokens），易于理解和修改

### 2.2 V4 扩展点（相对于开源 NanoClaw）

| 扩展 | 说明 |
|------|------|
| **Redis Channel** | 新增 Redis 作为输入/输出通道（替代原有的 Telegram/Slack/WhatsApp） |
| **Context Compiler** | 每 30 秒编译用户 context snapshot，publish 到 Redis |
| **S3 Filesystem Sync** | 本地 FS ↔ S3 双向异步同步 |
| **OAuth Token Access** | 容器内挂载加密 OAuth tokens，Agent 可代用户操作第三方服务 |
| **Streaming Results** | 通过 Redis pub/sub 流式推送 HTML/module/text 结果 |
| **LiveKit 无关** | 完全不依赖 LiveKit SDK — 纯 Redis 通信 |

### 2.3 容器规格

```yaml
# docker-compose.nanoclaw.yml (per-user container)
services:
  nanoclaw-{uid}:
    image: vi-nanoclaw:latest
    container_name: nanoclaw-{uid}
    restart: unless-stopped
    resources:
      limits:
        memory: 512M      # Claude SDK + Node.js + file ops
        cpus: '0.5'        # IO-bound (大部分时间等待 API 响应)
    volumes:
      - /data/users/{uid}:/workspace           # 用户持久化 FS (本地缓存)
      - /data/shared/skills:/skills:ro          # 共享 skill 库 (只读)
      - /data/shared/prompts:/prompts:ro        # 共享 prompt 模板 (只读)
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - REDIS_URL=redis://redis:6379
      - API_SERVER_URL=http://api-server:8000
      - USER_ID={uid}
      - S3_BUCKET=${S3_BUCKET}
      - S3_PREFIX=users/{uid}/
      - INTERNAL_API_TOKEN=${INTERNAL_API_TOKEN}
    networks:
      - vi-network
    depends_on:
      redis:
        condition: service_healthy

# 资源总计 (10 containers):
# RAM:  10 × 512MB = 5GB  (8GB VPS 有余量)
# CPU:  10 × 0.5   = 5 核 (4 核 VPS 可用, IO-bound 可超卖)
```

### 2.4 Agent 生命周期

```
Container Start
  │
  ├── 1. 加载用户 FS (/workspace/)
  │   └── 如果本地为空 → 从 S3 拉取
  │
  ├── 2. 连接 Redis
  │   ├── Subscribe: vi:exec:{uid} (任务派发)
  │   ├── Subscribe: vi:actions:{uid} (用户事件摘要)
  │   └── Publish: vi:ctx:{uid} (context snapshot)
  │
  ├── 3. 启动 Context Compiler (每 30 秒)
  │   └── 读取 /workspace/ + Redis 事件 → 编译 context → publish
  │
  ├── 4. 进入事件循环
  │   ├── 收到 vi:exec:{uid} 任务 → 启动 Claude Agent SDK session
  │   │   └── Agent 工具可读写 /workspace/
  │   │   └── 结果流式写入 vi:stream:{uid}
  │   │   └── 任务完成 → 更新 /workspace/sessions/
  │   │
  │   ├── 收到 vi:actions:{uid} 摘要 → 更新内部 awareness
  │   │
  │   └── 每 30 秒 → Context Compiler tick
  │
  └── Container Stop
      └── 本地 FS 变更 → 异步同步到 S3
```

### 2.5 NanoClaw 工具层

NanoClaw (fork) 的 Claude Agent SDK 提供以下内置工具：

| 工具 | 功能 | 操作范围 |
|------|------|---------|
| **File Read** | 读取用户文件 | /workspace/ (用户 FS) |
| **File Write** | 写入/创建文件 | /workspace/ |
| **File Edit** | 编辑文件片段 | /workspace/ |
| **Bash** | 执行 shell 命令 | 容器内 (受限) |
| **Search/Grep** | 搜索文件内容 | /workspace/ |
| **Web Search** | 搜索互联网 | 外部 |
| **Web Fetch** | 获取网页内容 | 外部 |

V4 扩展工具：

| 工具 | 功能 | 说明 |
|------|------|------|
| **OAuth Call** | 代用户调用第三方 API | 读取 /workspace/tokens/ 中的加密 token |
| **Memory Update** | 更新持久化记忆 | 写入 /workspace/memory/ + 通知 API Server |
| **Publish Result** | 推送结果到前端 | Redis vi:stream:{uid} |
| **Publish Context** | 更新 Realtime Agent context | Redis vi:ctx:{uid} |

---

## 3. Realtime Agent (V4 升级)

### 3.1 V3 → V4 变化

| 维度 | V3 | V4 |
|------|----|----|
| **Gateway 交互** | HTTP /join + LiveKit RPC dispatch | Redis vi:exec:{uid} publish |
| **Context 来源** | 启动时拉取 Redis + API | 持续订阅 Redis vi:ctx:{uid} |
| **事件发布** | 仅 DataChannel 推送前端 | + Redis vi:actions:{uid} 发布给 NanoClaw |
| **Gateway 感知** | 需要知道 Gateway URL | 无需知道 NanoClaw 存在 |

### 3.2 Context Subscription（核心新机制）

```python
# agent_common.py — V4 新增

class Assistant(livekit.agents.Agent):
    def __init__(self, ...):
        self._context_subscription = None
        self._latest_context = ""

    async def _start_context_subscription(self):
        """订阅 NanoClaw 编译的 context snapshot"""
        redis = await _get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"vi:ctx:{self._vi_user_id}")

        async for message in pubsub.listen():
            if message['type'] == 'message':
                context_data = json.loads(message['data'])
                self._latest_context = context_data['snapshot']

                # 更新 Gemini 系统指令
                await self._update_agent_instructions(
                    base_instructions=AGENT_INSTRUCTIONS_CORE,
                    context=self._latest_context,
                    page_context=self._current_page_prompt
                )

    async def _publish_user_event(self, event_type: str, data: dict):
        """发布用户事件到 Redis，供 NanoClaw 感知"""
        redis = await _get_redis()
        event = {
            "type": event_type,
            "ts": time.time(),
            "user_id": self._vi_user_id,
            **data
        }
        # 全量写入 Stream (持久化)
        await redis.xadd(
            f"vi:actions:{self._vi_user_id}",
            {"data": json.dumps(event)},
            maxlen=1000  # 保留最近 1000 条
        )
```

### 3.3 任务派发（V4 方式）

```python
# V3: HTTP + LiveKit RPC
async def _dispatch_via_gateway(self, task):
    await self._invite_gateway()  # HTTP /join
    result = await self.room.local_participant.perform_rpc(
        destination_identity="gateway", method="dispatch_task", payload=json.dumps(task)
    )

# V4: 纯 Redis publish
async def _dispatch_via_nanoclaw(self, task):
    redis = await _get_redis()
    await redis.publish(
        f"vi:exec:{self._vi_user_id}",
        json.dumps({
            "taskId": task["taskId"],
            "sessionId": task["sessionId"],
            "prompt": task["prompt"],
            "context": task["context"],
            "priority": task["priority"],
            "ts": time.time()
        })
    )
    # 结果通过 Redis vi:stream 异步返回
    # Realtime Agent 不需要等待 — 前端直接通过 SSE 接收
```

### 3.4 不变部分

以下 V3 能力完整保留：
- Gemini Realtime Pipeline (native audio + video)
- STT-LLM-TTS 备选 Pipeline
- 前端 RPC 控制 (take_photo, navigate, action_card 等)
- DataChannel 推送 (transcript, info_bar, action 等)
- Session 生命周期管理
- Heartbeat (10 秒) + 自动关闭
- 重复 Agent 检测

---

## 4. User Persistent File System

### 4.1 目录结构

```
/data/users/{uid}/
├── CLAUDE.md              # 用户人格 + 偏好 (= V3 的 SOUL.md + USER.md)
│                           # NanoClaw 读取此文件获取用户个性化指令
│
├── memory/
│   ├── identity/           # 身份层 (权重 2.0)
│   │   ├── soul.md         # 核心人格定义
│   │   └── profile.md      # 用户基本信息
│   │
│   ├── semantic/           # 语义层 (权重 1.5)
│   │   ├── preferences.md  # 偏好 (食物、风格、习惯)
│   │   ├── knowledge.md    # 用户特有知识
│   │   └── routines.md     # 日常习惯
│   │
│   └── episodic/           # 情景层 (权重 1.0)
│       ├── 2026-03-01.md   # 每日摘要
│       ├── 2026-03-02.md
│       └── 2026-03-03.md
│
├── skills/                 # 用户自定义 skills
│   ├── morning-briefing.md # 早间简报
│   ├── shopping-helper.md  # 购物助手
│   └── recipe-finder.md    # 食谱搜索
│
├── sessions/
│   ├── active/             # 当前活跃 session 上下文
│   │   └── current.json    # 进行中的 session 状态
│   │
│   └── history/            # 历史 session 摘要
│       ├── 2026-03-01_photo-analysis.json
│       └── 2026-03-02_recipe-search.json
│
├── tokens/
│   └── oauth.enc.json      # 加密的 OAuth tokens
│                            # {google: {access_token, refresh_token, expires_at},
│                            #  notion: {...}, slack: {...}}
│
├── artifacts/              # Agent 生成的产物
│   ├── reports/            # HTML 报告
│   ├── documents/          # 文档
│   └── images/             # 处理过的图片
│
└── .cache/
    ├── context.json        # 最新编译的 context snapshot
    └── sync-state.json     # S3 同步状态 (文件哈希 + 时间戳)
```

### 4.2 存储层设计

```
┌─────────────────────────────────────────────┐
│         NanoClaw Agent (容器内)              │
│                                              │
│  直接读写 /workspace/ (= /data/users/{uid}/) │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────▼─────────┐
         │  Local FS Cache   │  ← VPS 本地磁盘 /data/users/
         │  (SSD, 低延迟)     │     每用户 ~100MB-1GB
         └─────────┬─────────┘
                   │ async sync (每 60 秒 or 文件变更触发)
                   │
         ┌─────────▼─────────┐
         │    S3 / GCS       │  ← 持久化备份，跨 VPS 可迁移
         │  s3://bucket/     │     同步策略: 增量, 基于文件哈希
         │  users/{uid}/     │     保留版本历史 (S3 versioning)
         └───────────────────┘
```

**同步策略:**
- **Local → S3**: 文件写入后 debounce 60 秒触发同步，或 NanoClaw 任务完成时立即同步
- **S3 → Local**: 容器启动时拉取，或 API Server 通知有外部修改时拉取
- **冲突解决**: Last-Writer-Wins (同一用户只有一个 NanoClaw Agent，无并发冲突)
- **状态追踪**: `.cache/sync-state.json` 记录每个文件的 hash + last_synced_at

### 4.3 FS Proxy (API Server 扩展)

API Server 提供 HTTP 接口代理访问用户 FS，供前端 Memory/Session 管理使用：

```
GET    /api/fs/{path}           # 读取文件
PUT    /api/fs/{path}           # 写入文件
DELETE /api/fs/{path}           # 删除文件
GET    /api/fs/?prefix={dir}    # 列出目录

# 实现: API Server 读写 S3，NanoClaw 读写本地 + 同步到 S3
# 前端通过此接口管理 memory、skills 等文件
```

---

## 5. Redis Event Bus

### 5.1 Channel Schema

| Channel | 类型 | 发布者 | 订阅者 | TTL/MaxLen | 用途 |
|---------|------|--------|--------|------------|------|
| `vi:ctx:{uid}` | Pub/Sub | NanoClaw | Realtime Agent | — | Context snapshot (每 30 秒) |
| `vi:exec:{uid}` | Pub/Sub | Realtime Agent | NanoClaw | — | 任务派发 |
| `vi:stream:{uid}` | Pub/Sub | NanoClaw | API Server (SSE relay) | — | 流式结果推送 |
| `vi:events:{uid}` | Pub/Sub | API Server | Frontend (SSE) | — | SSE 中继 (已有, 扩展) |
| `vi:actions:{uid}` | Stream | Realtime Agent + Frontend | NanoClaw + API Server | maxlen=1000 | 全量用户操作日志 |
| `vi:summary:{uid}` | Key-Value | API Server | NanoClaw | 5 分钟 | 聚合用户活动摘要 |

### 5.2 事件分层设计

```
                    全量事件                         摘要事件
               ┌──────────────┐              ┌──────────────┐
               │ vi:actions   │              │ vi:summary   │
               │ (Redis Stream)│              │ (Redis KV)   │
               │              │              │              │
 Realtime ────►│ 每个操作一条  │   API Server │ 每 10 秒聚合  │
 Agent         │ 语音转录      │──── 聚合 ───►│ "用户在讨论   │
               │ 拍照事件      │              │  X 话题,      │
 Frontend ────►│ 页面导航      │              │  拍了 3 张照, │
               │ 模块交互      │              │  正在看 Y"    │
               │ 文本消息      │              └──────┬───────┘
               └──────┬───────┘                      │
                      │                              │
                      │ 回溯查询                      │ 日常消费
                      ▼                              ▼
               NanoClaw Agent                 NanoClaw Agent
               (深度分析时)                   (Context Compiler)
```

**全量事件格式 (vi:actions):**
```json
{
  "type": "voice_transcript",
  "ts": 1709420400.123,
  "user_id": "vi-dev-abc123",
  "data": {
    "text": "帮我找一下附近的意大利餐厅",
    "lang": "zh",
    "confidence": 0.95
  }
}
```

**事件类型枚举:**
```
voice_transcript    # 语音转录文本
text_message        # 文本消息
photo_taken         # 拍照事件 (含 URL)
photo_uploaded      # 照片上传完成
page_navigate       # 页面导航 (camera/session/home/memory)
module_interact     # 模块交互 (checklist check, card click)
task_dispatched     # 任务派发
task_completed      # 任务完成
task_failed         # 任务失败
memory_updated      # 记忆更新
session_started     # 会话开始
session_ended       # 会话结束
```

**摘要格式 (vi:summary):**
```json
{
  "ts": 1709420400,
  "period_seconds": 10,
  "summary": "用户正在寻找附近意大利餐厅，拍了一张街景照片",
  "active_topics": ["restaurant", "italian", "nearby"],
  "recent_actions": ["voice_transcript x3", "photo_taken x1"],
  "current_page": "camera",
  "session_active": true
}
```

### 5.3 事件聚合器 (API Server 新增)

```python
# api-server/app/services/event_aggregator.py

class EventAggregator:
    """每 10 秒从 vi:actions Stream 读取最新事件，生成摘要"""

    async def aggregate(self, uid: str) -> dict:
        # 1. 读取最近 10 秒的 actions
        events = await redis.xrange(
            f"vi:actions:{uid}",
            min=f"{int(time.time() - 10) * 1000}-0",
            max="+"
        )

        # 2. 提取关键信息 (不用 LLM, 用规则)
        topics = extract_topics(events)
        action_counts = count_by_type(events)
        current_page = get_latest_navigate(events)

        # 3. 生成结构化摘要
        summary = {
            "ts": time.time(),
            "period_seconds": 10,
            "summary": format_summary(events),
            "active_topics": topics,
            "recent_actions": action_counts,
            "current_page": current_page,
            "session_active": len(events) > 0
        }

        # 4. 写入 Redis KV (供 NanoClaw 读取)
        await redis.set(
            f"vi:summary:{uid}",
            json.dumps(summary),
            ex=300  # 5 分钟过期
        )
        return summary
```

---

## 6. Context Refresh 机制

### 6.1 Context Compiler（NanoClaw 内部模块）

每 30 秒运行一次，编译用户的完整上下文快照：

```
Context Compiler (NanoClaw, 每 30 秒)
  │
  ├── 1. 读取用户记忆 (/workspace/memory/)
  │   ├── identity/ → 全部包含 (权重最高)
  │   ├── semantic/ → 按重要性选取 top-N
  │   └── episodic/ → 最近 3 天
  │
  ├── 2. 读取当前 session (/workspace/sessions/active/)
  │   └── 进行中的任务、上下文、结果
  │
  ├── 3. 读取 Redis 摘要 (vi:summary:{uid})
  │   └── 最新的用户活动概况
  │
  ├── 4. 编译 Context Snapshot (≤ 2000 chars)
  │   ├── [User Identity] 用户核心信息
  │   ├── [Memory] 关键偏好和知识
  │   ├── [Recent Activity] 最近在做什么
  │   ├── [Active Task] 正在执行的任务 (如有)
  │   └── [Conversation Hints] 对话建议
  │
  └── 5. Publish → Redis vi:ctx:{uid}
```

**Context Snapshot 格式:**
```json
{
  "version": 4,
  "ts": 1709420400,
  "uid": "vi-dev-abc123",
  "snapshot": "[User Identity]\n张三, 30岁, 上海, 产品经理...\n\n[Memory]\n偏好: 意大利菜, 健康饮食...\n\n[Recent Activity]\n正在寻找附近餐厅，拍了街景照...\n\n[Active Task]\n无\n\n[Hints]\n用户可能需要餐厅推荐，准备好 place_card 模块",
  "char_count": 1850,
  "memory_version": 42,
  "session_active": true
}
```

### 6.2 Realtime Agent Context 应用

```python
# Realtime Agent 接收 context 后的处理

async def _on_context_update(self, context_data: dict):
    snapshot = context_data['snapshot']

    # 方式 1: 更新 Gemini 系统指令 (instruction update)
    # Gemini Realtime API 支持动态更新 system instruction
    new_instructions = f"{AGENT_INSTRUCTIONS_CORE}\n\n{snapshot}"
    await self._realtime_session.update(instructions=new_instructions)

    # 方式 2: 注入为 "silent context" 到对话历史
    # (当 Gemini 不支持 instruction update 时的 fallback)
    # self._inject_system_context(snapshot)
```

### 6.3 关键事件即时推送

30 秒批次 + 关键事件即时触发的混合模式：

```
常规 context: 每 30 秒 batch update
  │
  + 即时触发事件:
    ├── task_completed  → 立即推送新 context (含任务结果摘要)
    ├── memory_updated  → 立即推送新 context (含新记忆)
    └── user_reconnect  → 立即推送完整 context (断线重连)
```

---

## 7. OAuth Token Center

### 7.1 架构位置

OAuth Token Center 集成在 API Server 中，管理用户授权的第三方服务 token。

```
┌──────────────────────────────────────────────────────────┐
│                    API Server                             │
│  ┌───────────────────────────────────────────────────┐   │
│  │              OAuth Token Center                    │   │
│  │                                                    │   │
│  │  /api/tokens/connect/{provider}  ← 发起 OAuth 流  │   │
│  │  /api/tokens/callback/{provider} ← OAuth 回调     │   │
│  │  /api/tokens/{provider}/status   ← 检查有效性     │   │
│  │  /api/tokens/{provider}/refresh  ← 刷新 token     │   │
│  │  DELETE /api/tokens/{provider}   ← 撤销授权       │   │
│  │                                                    │   │
│  │  存储: 加密写入 S3 users/{uid}/tokens/oauth.enc    │   │
│  │  同步: NanoClaw 容器挂载 /workspace/tokens/        │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 7.2 支持的 OAuth Provider (Phase 1)

| Provider | 权限范围 | Agent 可执行操作 |
|----------|---------|------------------|
| **Google** | Calendar (read/write), Drive (read), Gmail (read) | 查看日程、读取文件、搜索邮件 |
| **Notion** | Pages (read/write), Databases (read) | 读写页面、查询数据库 |
| **Slack** | Channels (read), Messages (write) | 读取频道、发送消息 |

### 7.3 Token 安全模型

```
1. 用户在前端发起 OAuth → API Server 生成 authorization URL
2. 用户在浏览器完成授权 → OAuth callback → API Server
3. API Server:
   a. 加密 token (AES-256-GCM, key 从 JWT_SECRET 派生)
   b. 写入 S3: users/{uid}/tokens/oauth.enc.json
   c. 触发 S3 → 本地同步 → NanoClaw 容器可读
4. NanoClaw Agent:
   a. 读取 /workspace/tokens/oauth.enc.json
   b. 用同一密钥解密
   c. 使用 token 调用第三方 API
   d. Token 过期 → 通过 API Server 刷新

安全措施:
- Token 文件加密存储，非明文
- NanoClaw 容器只读 tokens/ 目录 (不可写)
- Token refresh 只能通过 API Server (有 rate limit)
- 每个 provider 有独立的 scope 限制
```

### 7.4 NanoClaw OAuth Tool

```typescript
// NanoClaw 扩展工具: OAuth API 调用

interface OAuthCallParams {
  provider: 'google' | 'notion' | 'slack';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;    // e.g., "/calendar/v3/events"
  body?: object;
}

// 示例: Agent 帮用户查日程
await oauthCall({
  provider: 'google',
  method: 'GET',
  endpoint: '/calendar/v3/calendars/primary/events',
  query: { timeMin: '2026-03-03T00:00:00Z', maxResults: 10 }
});

// 示例: Agent 帮用户发 Slack 消息
await oauthCall({
  provider: 'slack',
  method: 'POST',
  endpoint: '/api/chat.postMessage',
  body: { channel: '#general', text: 'AI 帮我发的消息' }
});
```

---

## 8. Frontend 变更 (V4)

### 8.1 SSE 扩展（替代 DataChannel 接收 NanoClaw 结果）

```
V3: Gateway → DataChannel ("vi-gateway" topic) → Frontend useAgentProtocol.js
V4: NanoClaw → Redis → API Server SSE → Frontend useRealtimeEvents.js (扩展)
```

**新增 SSE 事件类型:**

| 事件类型 | 数据 | 说明 |
|----------|------|------|
| `exec_start` | `{taskId, executor}` | NanoClaw 开始执行任务 |
| `exec_progress` | `{taskId, step, total, message}` | 任务进度 |
| `exec_html_stream` | `{taskId, chunk}` | HTML 流式片段 |
| `exec_text_stream` | `{taskId, chunk}` | 文本流式片段 |
| `exec_module` | `{taskId, moduleType, data}` | 结构化模块 |
| `exec_result` | `{taskId, summary}` | 任务完成 |
| `exec_error` | `{taskId, error, recoverable}` | 任务错误 |
| `memory_update` | `{layer, filename, action}` | 记忆变更 (已有) |
| `session_update` | `{sessionId, status}` | Session 变更 (已有) |

### 8.2 前端接收流程

```javascript
// useNanoClawResults.js — 新 Hook

function useNanoClawResults() {
  const [activeStreams, setActiveStreams] = useState({});

  // 复用现有 SSE 连接，监听新事件类型
  useRealtimeEvents({
    onEvent: (event) => {
      switch (event.type) {
        case 'exec_html_stream':
          // 复用 PersistentHtmlRenderer，追加 HTML 片段
          appendHtmlChunk(event.taskId, event.chunk);
          break;
        case 'exec_module':
          // 复用现有 Module 组件 (PlaceCard, Checklist 等)
          renderModule(event.taskId, event.moduleType, event.data);
          break;
        case 'exec_result':
          markTaskComplete(event.taskId);
          break;
      }
    }
  });
}
```

### 8.3 Token Management UI（新增）

```
MemoryView → 新增 "Connections" Tab

┌─────────────────────────────────────────────┐
│  Connections                                 │
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ 🔗 Google   │  │ 🔗 Notion   │           │
│  │ Connected ✅ │  │ Connect     │           │
│  │ Calendar,    │  │             │           │
│  │ Drive        │  │             │           │
│  │ [Disconnect] │  │ [Connect]   │           │
│  └─────────────┘  └─────────────┘           │
│                                              │
│  ┌─────────────┐                             │
│  │ 🔗 Slack    │                             │
│  │ Connected ✅ │                             │
│  │ #general     │                             │
│  │ [Disconnect] │                             │
│  └─────────────┘                             │
└─────────────────────────────────────────────┘
```

---

## 9. API Server 扩展

### 9.1 新增模块

| 模块 | 路由前缀 | 功能 |
|------|---------|------|
| **Token Center** | `/api/tokens/` | OAuth 流程、token CRUD、刷新 |
| **FS Proxy** | `/api/fs/` | 用户文件系统读写 (代理 S3) |
| **Event Aggregator** | (内部 cron) | 每 10 秒聚合 vi:actions → vi:summary |
| **SSE Relay 扩展** | `/api/users/events` | 新增 exec_* 事件类型 |

### 9.2 SSE Relay 扩展

```python
# api-server/app/routes/events.py — V4 扩展

# V3: 只订阅 vi:events:{uid}
# V4: 额外订阅 vi:stream:{uid} (NanoClaw 结果流)

async def sse_endpoint(uid: str, redis: Redis):
    pubsub = redis.pubsub()
    await pubsub.subscribe(
        f"vi:events:{uid}",     # 已有: memory_update, session_update
        f"vi:stream:{uid}"      # 新增: exec_* 事件
    )

    async def event_generator():
        async for msg in pubsub.listen():
            if msg['type'] == 'message':
                yield f"data: {msg['data']}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

### 9.3 数据库扩展

```sql
-- 新增表: oauth_tokens (元数据, 实际 token 加密在 S3)
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    provider VARCHAR(50) NOT NULL,       -- 'google', 'notion', 'slack'
    scopes TEXT[],                        -- ['calendar.read', 'drive.read']
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'expired', 'revoked'
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_refreshed_at TIMESTAMPTZ,
    UNIQUE(user_id, provider)
);
```

---

## 10. 数据流总览

### 10.1 Flow 1: 实时语音交互 (System 1, <1s)

```
用户说话 → LiveKit → Realtime Agent (Gemini)
                           │
                           ├── 1. Gemini 实时回应 (语音)
                           │
                           ├── 2. 发布事件 → Redis vi:actions:{uid}
                           │   └── {type: "voice_transcript", text: "..."}
                           │
                           └── 3. (如需深度处理) → Redis vi:exec:{uid}
                               └── NanoClaw 异步处理
```

### 10.2 Flow 2: 深度执行 (System 2, seconds~minutes)

```
Realtime Agent 判断需要深度处理
  │
  ▼
Redis vi:exec:{uid} ← 任务请求
  │
  ▼
NanoClaw Agent 收到任务
  ├── 读取 /workspace/ (用户记忆, skills, context)
  ├── 启动 Claude Agent SDK session
  │   ├── 可能读写文件
  │   ├── 可能搜索互联网
  │   ├── 可能调用 OAuth API (代用户操作)
  │   └── 流式生成结果
  │
  ├── 流式推送 → Redis vi:stream:{uid}
  │   ├── {type: "exec_html_stream", chunk: "..."}
  │   ├── {type: "exec_module", moduleType: "place_card", data: {...}}
  │   └── {type: "exec_result", summary: "..."}
  │
  └── 更新 /workspace/sessions/ + /workspace/memory/
      └── 触发 S3 同步

Redis vi:stream:{uid}
  │
  ├── → API Server SSE → Frontend (渲染结果)
  │
  └── → (Realtime Agent 可选订阅, 用于语音确认)
```

### 10.3 Flow 3: Context Refresh (每 30 秒)

```
NanoClaw Context Compiler (every 30s):
  ├── 读取 /workspace/memory/ (三层记忆)
  ├── 读取 /workspace/sessions/active/
  ├── 读取 Redis vi:summary:{uid} (最新用户活动)
  │
  ├── 编译 context snapshot (≤ 2000 chars)
  │
  └── Publish → Redis vi:ctx:{uid}
                    │
                    ▼
              Realtime Agent:
              └── 更新 Gemini system instructions
                  └── 下一轮对话使用新 context
```

### 10.4 Flow 4: 用户操作事件

```
Frontend:                              Realtime Agent:
├── 拍照                               ├── 语音转录
├── 页面导航                            ├── 任务派发
├── 文本消息          ──── 全部推入 ────►  Redis Stream vi:actions:{uid}
├── 模块交互                            ├── Session 事件
└── ...                                └── ...

                    │
                    │ 每 10 秒
                    ▼
             API Server Event Aggregator
                    │
                    │ 聚合摘要
                    ▼
             Redis vi:summary:{uid}
                    │
                    ▼
             NanoClaw Context Compiler (消费)
```

---

## 11. 部署拓扑

### 11.1 单 VPS 部署

```yaml
# docker-compose.v4.yml

services:
  # === 基础设施 ===
  postgres:
    image: postgres:16-alpine
    volumes: [pg_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb
    volumes: [redis_data:/data]

  # === 应用服务 ===
  api-server:
    build: ./api-server
    ports: ["8000:8000"]
    depends_on: [postgres, redis]

  frontend:
    build: ./frontend
    ports: ["80:80", "443:443"]

  # === Realtime Agents (10 个, 由 LiveKit 调度) ===
  # LiveKit Cloud 自动 dispatch agent 到对应 room
  # 使用 LiveKit Agents SDK 的 worker 模式
  realtime-worker:
    build: ./realtime
    deploy:
      replicas: 2        # 2 个 worker 进程, 每个处理 ~5 个并发 room
    depends_on: [redis, api-server]

  # === NanoClaw Agents (10 个, 1:1 per user) ===
  # 由 Orchestrator 管理生命周期
  nanoclaw-orchestrator:
    build: ./nanoclaw-orchestrator
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # 管理子容器
      - /data/users:/data/users
    depends_on: [redis, api-server]

volumes:
  pg_data:
  redis_data:
```

### 11.2 NanoClaw Orchestrator

负责管理 10 个 NanoClaw 容器的生命周期：

```
Orchestrator 职责:
  1. 用户注册/绑定时 → 创建 NanoClaw 容器
  2. 用户删除时 → 销毁容器 + 清理 FS
  3. 容器崩溃 → 自动重启
  4. 健康检查 → 每 30 秒 ping 每个容器
  5. 资源监控 → 内存/CPU 使用率上报
  6. 用户离线 → 容器降低优先级 (但不销毁, 保留 scheduled tasks)
```

### 11.3 资源预算

| 服务 | RAM | CPU | 说明 |
|------|-----|-----|------|
| PostgreSQL | 512MB | 0.5 | 10 用户, 数据量小 |
| Redis | 512MB | 0.25 | 事件 + 缓存 |
| API Server | 256MB | 0.5 | FastAPI, 轻量 |
| Frontend (nginx) | 64MB | 0.1 | 静态文件 |
| Realtime Workers x2 | 1GB | 1.0 | LiveKit Agent, Gemini |
| NanoClaw x10 | 5GB | 5.0 | Claude Agent SDK (IO-bound, 可超卖) |
| Orchestrator | 128MB | 0.25 | Docker 管理 |
| **合计** | **~7.5GB** | **~7.5** | **8GB/8core VPS 可运行** |

**推荐 VPS 规格:**
- CPU: 8 vCPU (NanoClaw IO-bound, CPU 可超卖)
- RAM: 8-16 GB
- SSD: 100 GB (10 用户 × 1GB FS + DB + 缓冲)
- 带宽: 不限 (主要是 API 调用, 非媒体流)
- 估算月费: $40-80 (Hetzner/Contabo/DigitalOcean)

---

## 12. V3 → V4 迁移路径

### 12.1 迁移阶段

```
Phase 1: 基础设施
  ├── Fork NanoClaw, 添加 Redis channel
  ├── API Server 添加 Token Center + FS Proxy + Event Aggregator
  ├── Redis Schema 扩展 (新 channels)
  └── PostgreSQL Schema 扩展 (oauth_tokens 表)

Phase 2: NanoClaw 集成
  ├── 实现 Context Compiler
  ├── 实现流式结果 → Redis → SSE
  ├── 实现 S3 FS 同步
  └── 实现 NanoClaw Orchestrator

Phase 3: Realtime Agent 升级
  ├── 添加 Redis context subscription
  ├── 任务派发改为 Redis (替代 LiveKit RPC)
  ├── 添加 user event publishing
  └── 保留 Gateway fallback (过渡期)

Phase 4: Frontend 适配
  ├── SSE 接收 NanoClaw 结果 (新 Hook)
  ├── Token Management UI
  └── 逐步切换: DataChannel → SSE

Phase 5: 清理
  ├── 移除 vi-gateway 服务
  ├── 移除 DataChannel 结果流 (保留 RPC + transcript 等)
  ├── 数据迁移: PostgreSQL memories → User FS
  └── 文档更新
```

### 12.2 并行运行期

Phase 3-4 期间, vi-gateway 和 NanoClaw 可以并行运行:
- executorHint: 'nanoclaw-v4' → 走 Redis → NanoClaw
- executorHint: 'gemini-flash' → 走 LiveKit RPC → vi-gateway (旧路径)
- 逐步验证后切换默认值

---

## 13. 通信矩阵 (V4)

```
                Realtime    NanoClaw    API Server   Frontend    Redis
Realtime        ---         Redis       HTTP         DC+RPC      Pub/Sub
NanoClaw        Redis       ---         HTTP         ---         Pub/Sub+Stream
API Server      ---         ---         ---          REST+SSE    Pub/Sub+Stream
Frontend        DC+RPC      ---         REST+SSE     ---         ---
Redis           ---         ---         ---          ---         ---
```

**关键变化 vs V3:**
- NanoClaw ↔ Realtime: 纯 Redis (V3 是 LiveKit RPC)
- NanoClaw ↔ Frontend: 通过 API Server SSE 中继 (V3 是 DataChannel)
- NanoClaw ↔ API Server: HTTP (与 V3 的 gateway↔api-server 类似)
- **NanoClaw 不直接与 Frontend 通信** — 完全通过 Redis + SSE 解耦

---

## 14. 关键设计权衡

### 14.1 SSE vs WebSocket (前端结果通道)

**选择: SSE**

| 维度 | SSE | WebSocket | 决策理由 |
|------|-----|-----------|---------|
| 方向 | 单向 (server→client) | 双向 | NanoClaw 结果是单向推送 |
| 基础设施 | 已有 (events.py) | 需要新建 | 减少工作量 |
| 连接限制 | 6/域名 | 无 | 10 用户只需 1 SSE/用户 |
| 重连 | 浏览器自动 | 需要自己实现 | 更简单 |
| 二进制 | 不支持 | 支持 | HTML/JSON 文本够用 |
| 复杂度 | 低 | 中 | 10 用户不需要 WebSocket |

### 14.2 1:1 固定 vs 动态分配 (Agent-User 映射)

**选择: 1:1 固定**

| 维度 | 1:1 固定 | 动态分配 | 决策理由 |
|------|---------|---------|---------|
| 复杂度 | 低 | 高 | 无需 context 热切换 |
| FS 管理 | 简单 (容器直接挂载) | 需要动态挂载 | 启动即可用 |
| 启动延迟 | 零 (容器常驻) | 秒级 (拉取 FS) | 用户体验更好 |
| 资源利用 | 中 (闲时浪费) | 高 | 10 用户容器成本低 |
| 后台任务 | 支持 (Agent 常驻) | 不支持 | scheduled jobs 需要 |
| 上限 | 10 用户/VPS | 50-100 用户/VPS | 够用, 可横向扩展 |

### 14.3 保留 API Server vs 合并到 NanoClaw

**选择: 保留并扩展**

- API Server (Python/FastAPI) 已有完整的 auth/memory/session 能力
- 合并到 NanoClaw (Node.js) = 重写，不值得
- 10 用户规模不需要微服务拆分
- 自然扩展: +OAuth Token Center, +FS Proxy, +Event Aggregator

---

## 15. 未来扩展方向

| 方向 | 说明 | 触发条件 |
|------|------|---------|
| **横向扩展** | 多 VPS, 用户路由到对应 VPS | >10 用户 |
| **动态 Agent 分配** | 从 1:1 升级为 N:M 动态分配 | 需要 >100 用户/VPS |
| **Agent Swarm** | NanoClaw 内置多 agent 协作 | 复杂任务需要并行处理 |
| **更多 OAuth** | GitHub, Linear, 飞书, 企业微信 | 用户需求驱动 |
| **向量搜索** | pgvector 语义检索记忆 | 单用户记忆 >1000 条 |
| **Scheduled Tasks** | Agent 定时执行任务 (晨报, 日报) | 用户需求驱动 |
| **Multi-modal FS** | 用户 FS 支持图片、音频、视频 | Agent 需要处理媒体 |

---

*VI Agent System V4 Architecture | 2026-03-03 | Design by KC + Claude*
