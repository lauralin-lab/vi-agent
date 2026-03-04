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
| **多模态输入** | 仅拍照 (单张图片) | 拍照 + 录视频 + LiveKit 关键帧采样 | Agent 需要连续视觉理解，不只是静态图片 |
| **Skill 系统** | 硬编码任务类型 | 可插拔 Skill (.md 格式, Claude Code 兼容) | 每个 Skill = 一个可投放的 Use Case |
| **意图预测** | 无 (被动等待指令) | Context Compiler + Claude 主动预测 | "Video Call with Your Claude Code" — 主动推荐而非被动响应 |

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

### 1.2 核心设计哲学：主脑-代言人架构 (Master-Spokesperson)

**V4 最重要的哲学转变：NanoClaw (Claude Code) 是主脑，LiveKit Agent (Gemini) 是代言人。**

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  NanoClaw (Claude Code)                LiveKit Agent (Gemini)       │
│  ══════════════════════                ═════════════════════        │
│  🧠 主脑 / Master Brain               🎤 代言人 / Spokesperson     │
│                                                                     │
│  • 思考、推理、深度分析                 • 实时语音、视觉感知          │
│  • 记忆、偏好、用户画像                 • 自然语言表达               │
│  • 技能执行 (Skill System)             • 即兴对话、情感回应          │
│  • 意图预测                            • 前端交互控制               │
│  • 文件操作、OAuth、工具链              • 感官数据采集               │
│                                                                     │
│  ─── 控制流 ──────────────────────────────────────────────────►     │
│  vi:ctx (context + instructions + predicted_intentions)             │
│                                                                     │
│  ◄─── 感知流 ────────────────────────────────────────────────      │
│  vi:actions + vi:frames (what it sees and hears)                    │
│                                                                     │
│  用户价值来源 = Claude Code + Skills                                │
│  用户交互界面 = 代言人 (Gemini 实时语音)                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**类比：** NanoClaw 是 CEO，制定战略方向。LiveKit Agent 是新闻发言人，面对用户，表达流畅自然，但方向由 CEO 通过 context injection 控制。

**战略控制 vs 战术自主：**

| 维度 | 主脑 (NanoClaw) 控制 | 代言人 (LiveKit) 自主 |
|------|---------------------|---------------------|
| **说什么内容** | context snapshot 定义主题和推荐 | 具体措辞、语气、节奏 |
| **推荐什么 Skill** | predicted_intentions 列表 | 如何口头表达推荐 |
| **用户画像** | memory 系统 + CLAUDE.md | — |
| **实时即兴回应** | — | 用户说话时的即时反应 |
| **深度场景理解** | Claude Vision 多帧分析 | Gemini 实时视觉流 |
| **任务执行** | Claude Agent SDK + 全工具链 | — |
| **意图预测** | Context Compiler + Claude | — |

**为什么是这个关系？**
- Gemini 没有工具层、没有文件系统、没有持久记忆、没有 Skill 系统 — 它不能是主脑
- Claude Code 有完整的 Agent SDK + 工具链 + 持久化 + Skill — 它天然是执行和思考的中心
- 用户的价值 100% 来自 Claude Code + Skills 的执行结果
- 用户的体验 100% 通过代言人 (Gemini 语音) 的自然交互传递
- **价值创造和价值传递分离** — 这是 V4 架构的核心

### 1.3 三层解耦架构

主脑-代言人架构的技术实现通过三层解耦完成：

| 层 | 职责 | 服务 | 角色 |
|----|------|------|------|
| **交互层 (Interaction)** | 实时语音/视觉，低延迟 | Realtime Agent + Frontend | 代言人 — 用户接触面 |
| **执行层 (Execution)** | 深度推理，工具调用，文件操作，意图预测 | NanoClaw Agent | 主脑 — 价值创造 |
| **状态层 (State)** | 持久化，事件总线，认证 | API Server + Redis + S3 + PostgreSQL | 基础设施 |

核心变化：**执行层通过 Redis 与其他层完全解耦。** NanoClaw 不需要知道 LiveKit 的存在，Realtime Agent 不需要知道 NanoClaw 的存在。Redis 是唯一的粘合剂。但控制流是单向的：**主脑 → 代言人**（通过 context injection），感知流是反向的：**代言人 → 主脑**（通过 events + frames）。

### 1.4 服务职责矩阵

| 服务 | 语言 | 实例数 | 角色 | 核心职责 |
|------|------|--------|------|---------|
| **NanoClaw Agent** | Node.js | 10 (1/用户, Docker) | 🧠 主脑 | 深度推理 (Claude SDK + tools)，用户 FS，Skill 执行，意图预测，context 编译 |
| **Realtime Agent** | Python | 10 (1/用户) | 🎤 代言人 | 实时语音/视觉 (Gemini)，接受主脑 context 指导，感知数据采集 |
| **API Server** | Python | 1 | 认证 (JWT + Device + OAuth)，Memory V3，Session 管理，SSE 中继，FS Proxy |
| **Redis** | — | 1 | 事件总线，context 缓存，流式数据，pub/sub |
| **PostgreSQL** | — | 1 | 用户元数据，session 记录，索引 |
| **S3/GCS** | — | External | 用户文件系统持久化备份 |
| **Frontend** | React | 1 (nginx) | UI，SSE 接收，LiveKit WebRTC |

---

## 2. NanoClaw — 主脑 (Master Brain)

> **NanoClaw 是整个系统的 Agent Core。** 用户的全部价值来自 NanoClaw 内部运行的 Claude Code + Skill System。LiveKit Agent 是它的代言人——感知世界并面向用户表达，但战略方向由 NanoClaw 通过 context injection 控制。

### 2.1 设计来源

基于开源 [NanoClaw](https://github.com/qwibitai/nanoclaw) 框架 fork + extend。NanoClaw 的核心优势：
- Claude Agent SDK 集成（完整工具层：文件编辑、bash、搜索）
- Docker 容器隔离（OS 级安全）
- 文件系统 IPC（简单、透明）
- 代码量小（~35k tokens），易于理解和修改

**作为主脑，NanoClaw 独占以下能力（代言人不具备）：**
- 持久记忆和用户画像 (/workspace/memory/)
- Skill 系统（加载、执行、管理）
- 工具调用（文件操作、OAuth API、Web Search）
- 意图预测（Context Compiler + Claude 推理）
- 向代言人注入战略方向（vi:ctx context + instructions）

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

### 2.6 Multimodal Input Processing

NanoClaw 处理三种多模态输入。核心原则：**二进制数据永不经过 Redis，只走 S3 URL 引用。**

| 输入类型 | 来源 | 处理方式 |
|---------|------|---------|
| **照片** | 用户拍摄 (Frontend) | S3 上传 → Redis URL → Claude Vision API |
| **视频片段** | 用户录制 (Frontend, ≤30s) | S3 上传 → ffmpeg 提取关键帧 + Whisper 音频转录 → Claude 多帧推理 |
| **实时关键帧** | Realtime Agent 采样 (LiveKit) | 每 5s 抽帧 → S3 → Redis vi:frames → Context Compiler 消费 |

```typescript
// NanoClaw 多模态处理器
interface MediaEvent {
  type: 'media_captured';
  mediaType: 'image' | 'video';
  mediaUrl: string;          // S3 presigned URL
  thumbnail?: string;        // base64 128px (仅图片)
  duration?: number;         // 秒 (仅视频)
  dimensions: { w: number; h: number };
}

// 视频处理流水线
async function processVideo(event: MediaEvent) {
  // 1. 下载视频
  const video = await downloadFromS3(event.mediaUrl);
  // 2. 提取关键帧 (每 2 秒一帧)
  const frames = await ffmpeg.extractKeyframes(video, { interval: 2 });
  // 3. 提取音频转录
  const transcript = await whisper.transcribe(video);
  // 4. Claude 多帧推理
  return await claude.analyze({
    images: frames,
    text: transcript,
    system: "Analyze this video sequence with audio transcript..."
  });
}
```

### 2.7 Skill Loading System

每个 Skill = 一个 Claude Code 兼容的 `.md` 文件 + `manifest.json`。NanoClaw 启动 Agent SDK session 时动态加载。

```
Skill 解析优先级:
1. /workspace/skills/{slug}/  — 用户自定义 (优先)
2. /skills/{slug}/            — 预装共享 (fallback)
```

```typescript
// NanoClaw Skill Loader
async function loadSkill(slug: string, uid: string) {
  // 1. 解析路径
  const userPath = `/workspace/skills/${slug}/skill.md`;
  const sharedPath = `/skills/${slug}/skill.md`;
  const skillMd = await readFile(userPath).catch(() => readFile(sharedPath));

  // 2. 读取 manifest
  const manifest = await readJson(`manifest.json`);

  // 3. 验证依赖
  if (manifest.requirements?.oauth) {
    for (const provider of manifest.requirements.oauth) {
      const token = await readOAuthToken(provider);
      if (!token) throw new SkillError(`Missing OAuth: ${provider}`);
    }
  }

  // 4. 组装 system prompt
  const userClaudeMd = await readFile('/workspace/CLAUDE.md');
  const systemPrompt = `${userClaudeMd}\n\n---\n\n${skillMd}`;

  // 5. 启动 Claude Agent SDK session
  return claude.start({
    system: systemPrompt,
    tools: manifest.requirements?.tools || DEFAULT_TOOLS,
    model: manifest.model || 'claude-sonnet-4-6'
  });
}
```

**Skill Manifest 格式:**

```json
{
  "name": "小红书自动发布",
  "slug": "xiaohongshu-publish",
  "icon": "📕",
  "description": "拍照 → AI生成文案和标签 → 一键发布到小红书",
  "category": "social-media",
  "version": "1.0.0",
  "requirements": {
    "oauth": ["xiaohongshu"],
    "tools": ["oauth_call", "web_fetch", "file_read"],
    "input_types": ["image", "text"]
  },
  "ui": {
    "card_color": "#FF2442",
    "preview_template": "social-post"
  },
  "tags": ["social", "content-creation", "photo"]
}
```

---

## 3. Realtime Agent — 代言人 (Spokesperson)

> **Realtime Agent 是主脑 (NanoClaw) 的代言人。** 它面向用户进行实时语音交互，但它"说什么"由主脑通过 context injection 控制。它拥有**战术自主权**（措辞、语气、即兴反应），但**战略方向**（推荐什么 Skill、传达什么信息、用户画像）完全来自主脑。
>
> 代言人同时是主脑的**感官**——它通过 vi:actions 和 vi:frames 向主脑汇报用户的所见所闻，供主脑做深度分析和意图预测。

### 3.1 V3 → V4 变化

| 维度 | V3 | V4 |
|------|----|----|
| **Gateway 交互** | HTTP /join + LiveKit RPC dispatch | Redis vi:exec:{uid} publish |
| **Context 来源** | 启动时拉取 Redis + API | 持续订阅 Redis vi:ctx:{uid} |
| **事件发布** | 仅 DataChannel 推送前端 | + Redis vi:actions:{uid} 发布给 NanoClaw |
| **Gateway 感知** | 需要知道 Gateway URL | 无需知道 NanoClaw 存在 |

### 3.2 接受主脑指导：Context Subscription

代言人通过订阅 `vi:ctx:{uid}` 持续接收主脑的战略指令——包括用户画像、推荐话题、意图预测。这些信息注入 Gemini 的 system instructions，**从根本上塑造代言人"说什么"。**

```python
# agent_common.py — V4: 代言人接受主脑指导

class Assistant(livekit.agents.Agent):
    def __init__(self, ...):
        self._context_subscription = None
        self._latest_context = ""

    async def _start_context_subscription(self):
        """订阅主脑 (NanoClaw) 编译的 context + 意图预测"""
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

### 3.3 向主脑发送感知+请求：任务派发（V4 方式）

代言人判断用户需要深度处理时，向主脑发送执行请求。这是代言人唯一的"上行指令"——请求主脑介入。

```python
# V3: HTTP + LiveKit RPC
async def _dispatch_via_gateway(self, task):
    await self._invite_gateway()  # HTTP /join
    result = await self.room.local_participant.perform_rpc(
        destination_identity="gateway", method="dispatch_task", payload=json.dumps(task)
    )

# V4: 代言人向主脑发送执行请求 (纯 Redis)
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

### 3.4 代言人的感官职责：Keyframe Sampling（新机制）

代言人是主脑的**眼睛**。它定期从 LiveKit 视频流中采样关键帧，发送给主脑做深度视觉分析和意图预测：

```python
# agent_common.py — V4 新增

class Assistant(livekit.agents.Agent):
    async def _start_keyframe_sampler(self):
        """每 5 秒从 LiveKit 视频流采样一帧发给 NanoClaw"""
        redis = await _get_redis()
        last_scene_hash = None

        while self._session_active:
            await asyncio.sleep(5)  # 可配置

            # 1. 从远端视频 track 抓帧
            frame = await self._video_track.capture_frame()
            if not frame:
                continue

            # 2. 场景变化检测 (避免重复)
            scene_hash = compute_phash(frame)
            if scene_hash == last_scene_hash:
                continue
            last_scene_hash = scene_hash

            # 3. 模糊检测
            if laplacian_variance(frame) < 100:
                continue

            # 4. 上传 S3 (720p JPEG, ~50KB)
            frame_url = await upload_frame_to_s3(
                frame, f"users/{self._vi_user_id}/frames/{time.time()}.jpg"
            )

            # 5. 发布到 Redis
            await redis.publish(
                f"vi:frames:{self._vi_user_id}",
                json.dumps({
                    "ts": time.time(),
                    "frameUrl": frame_url,
                    "sceneHash": scene_hash,
                    "hasChange": True
                })
            )
```

**采样参数:**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `interval_seconds` | 5 | 采样频率 |
| `max_stored_frames` | 20 | 滚动缓冲区上限 |
| `quality` | 720p | 分辨率 (质量 vs 上传速度) |
| `skip_duplicate` | true | 场景 hash 不变时跳过 |
| `blur_threshold` | 100 | Laplacian 方差阈值 |

### 3.5 不变部分

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
├── skills/                 # 用户自定义 skills (可插拔)
│   ├── my-morning-briefing/
│   │   ├── skill.md        # System prompt + 工具配置
│   │   └── manifest.json   # 元数据 (名称, 图标, 依赖)
│   └── custom-skill-2/
│       ├── skill.md
│       └── manifest.json
│
├── media/                  # 用户捕获的媒体文件
│   ├── 2026-03-03T10-30_photo.jpg
│   ├── 2026-03-03T10-31_video.mp4
│   └── 2026-03-03T10-31_video_meta.json  # 视频元数据 (关键帧, 转录)
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
| `vi:ctx:{uid}` | Pub/Sub | NanoClaw | Realtime Agent | — | Context snapshot + 意图预测 (每 30 秒) |
| `vi:exec:{uid}` | Pub/Sub | Realtime Agent + Frontend | NanoClaw | — | 任务派发 (含 skill_slug) |
| `vi:stream:{uid}` | Pub/Sub | NanoClaw | API Server (SSE relay) | — | 流式结果推送 |
| `vi:events:{uid}` | Pub/Sub | API Server | Frontend (SSE) | — | SSE 中继 (已有, 扩展) |
| `vi:actions:{uid}` | Stream | Realtime Agent + Frontend | NanoClaw + API Server | maxlen=1000 | 全量用户操作日志 |
| `vi:summary:{uid}` | Key-Value | API Server | NanoClaw | 5 分钟 | 聚合用户活动摘要 |
| `vi:frames:{uid}` | Pub/Sub | Realtime Agent | NanoClaw (Context Compiler) | — | LiveKit 关键帧 (每 5 秒, S3 URL) |
| `vi:intent:{uid}` | Pub/Sub | NanoClaw | API Server (SSE relay) | — | 意图预测卡片 → Frontend |
| `vi:media:{uid}` | Pub/Sub | API Server | NanoClaw | — | 媒体上传完成通知 (S3 URL) |

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
video_captured      # 视频录制完成 (含 S3 URL, duration)
media_captured      # 统一媒体捕获事件 (image/video, 含 S3 URL)
keyframe_sampled    # LiveKit 关键帧采样 (含 S3 URL, sceneHash)
page_navigate       # 页面导航 (camera/session/home/memory/profile)
module_interact     # 模块交互 (checklist check, card click)
intent_card_tap     # 用户点击意图预测卡片 (含 skill_slug)
skill_dispatched    # Skill 任务派发
task_dispatched     # 任务派发
task_completed      # 任务完成
task_failed         # 任务失败
memory_updated      # 记忆更新
skill_installed     # Skill 安装/更新
skill_removed       # Skill 移除
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

每 30 秒运行一次，编译用户的完整上下文快照 **+ 意图预测**：

```
Context Compiler (NanoClaw, 每 30 秒) — V4 扩展
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
  ├── 3.5 [NEW] 读取最新关键帧 (vi:frames:{uid})
  │   └── Realtime Agent 采样的最新 LiveKit 视频帧 URL
  │
  ├── 4. 编译 Context Snapshot (≤ 2000 chars)
  │   ├── [User Identity] 用户核心信息
  │   ├── [Memory] 关键偏好和知识
  │   ├── [Visual Context] 最新关键帧描述 (NEW)
  │   ├── [Recent Activity] 最近在做什么
  │   ├── [Active Task] 正在执行的任务 (如有)
  │   └── [Conversation Hints] 对话建议
  │
  ├── 5. [NEW] 意图预测 (Claude Haiku, ~$0.002/次)
  │   ├── Input: context snapshot + 关键帧 + 可用 skill 列表
  │   ├── Claude 快速推理: "基于视觉上下文和用户历史，预测 3-5 个意图"
  │   └── Output: 排序的 predicted_intentions 列表
  │
  ├── 6. Publish Context → Redis vi:ctx:{uid}
  │
  └── 7. [NEW] Publish Intentions → Redis vi:intent:{uid}
      └── 意图卡片数据直接推送到前端 (via SSE)
```

**Context Snapshot 格式 (V4 扩展):**
```json
{
  "version": 4,
  "ts": 1709420400,
  "uid": "vi-dev-abc123",
  "snapshot": "[User Identity]\n张三, 30岁, 上海, 产品经理...\n\n[Memory]\n偏好: 意大利菜, 健康饮食...\n\n[Visual Context]\n当前画面: 一盘意大利面，桌上还有沙拉和红酒...\n\n[Recent Activity]\n拍了 3 张食物照片，录了 1 段视频...\n\n[Active Task]\n无\n\n[Hints]\n用户可能需要营养分析或小红书发布",
  "char_count": 1850,
  "memory_version": 42,
  "session_active": true,
  "latest_frame_url": "s3://bucket/users/vi-dev-abc123/frames/1709420400.jpg",
  "predicted_intentions": [
    {
      "skill_slug": "recipe-analyzer",
      "title": "分析这道菜的营养成分",
      "description": "检测到食物图片，可以分析卡路里和营养素",
      "confidence": 0.85,
      "icon": "📊",
      "params": {"media_urls": ["s3://..."]}
    },
    {
      "skill_slug": "xiaohongshu-publish",
      "title": "发布到小红书",
      "description": "这张美食照适合分享",
      "confidence": 0.6,
      "icon": "📕",
      "params": {"media_urls": ["s3://..."]}
    },
    {
      "skill_slug": "remotion-video",
      "title": "制作美食短视频",
      "description": "用拍摄的照片和视频生成精美短视频",
      "confidence": 0.4,
      "icon": "🎬",
      "params": {"media_urls": ["s3://..."]}
    }
  ]
}
```

### 6.2 主脑指导代言人：Context 注入

这是主脑-代言人架构的**核心控制机制**。主脑每 30 秒向代言人注入 context（含意图预测），直接重写 Gemini 的 system instructions。代言人不知道这些指令来自 NanoClaw——它只是按照 system instructions 行事。

```python
# 代言人接收主脑指导后的处理

async def _on_context_update(self, context_data: dict):
    snapshot = context_data['snapshot']
    intentions = context_data.get('predicted_intentions', [])

    # 主脑的 context snapshot 直接注入 Gemini system instructions
    # 这是"战略控制"的技术实现 — 主脑决定代言人的行为方向
    intent_hints = self._format_intention_hints(intentions)
    new_instructions = f"{AGENT_INSTRUCTIONS_CORE}\n\n{snapshot}\n\n{intent_hints}"
    await self._realtime_session.update(instructions=new_instructions)

    # Gemini 会根据这些 instructions 自然地向用户建议
    # 用户感受: "AI 主动建议了营养分析"
    # 实际发生: 主脑预测 → context injection → 代言人表达
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

## 8. Multimodal Input Pipeline

### 8.1 概览

V4 支持三条多模态输入通道，统一通过 Redis 事件总线汇入 NanoClaw：

```
╔═══════════════════════════════════════════════════════════════════╗
║                    Multimodal Input Pipeline                      ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Channel 1: Photo Capture (用户主动)                              ║
║  Frontend → S3 upload → Redis vi:actions + vi:media → NanoClaw   ║
║                                                                   ║
║  Channel 2: Video Clip (用户主动, ≤30s)                           ║
║  Frontend → S3 upload → Redis vi:actions + vi:media → NanoClaw   ║
║  NanoClaw: ffmpeg 提取关键帧 + Whisper 音频转录 → Claude 多帧推理  ║
║                                                                   ║
║  Channel 3: LiveKit Keyframe Sampling (系统自动, 每5s)            ║
║  Realtime Agent → capture frame → S3 → Redis vi:frames → NanoClaw║
║  用途: Context Compiler 消费，为意图预测提供实时视觉信号           ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

**核心原则：二进制数据永不经过 Redis。** 所有媒体先上传 S3，Redis 只传 URL + 元数据。

### 8.2 Photo Capture Flow

```
User taps shutter
  │
  ├── 1. Frontend: capture frame from LiveKit local video track
  ├── 2. Request presigned URL: POST /api/upload/presign?type=image
  ├── 3. Upload: PUT s3://bucket/users/{uid}/media/{timestamp}.jpg
  ├── 4. Publish to Redis vi:actions:{uid}:
  │     {type: "media_captured", mediaType: "image",
  │      mediaUrl: "s3://...", thumbnail: "base64_128px",
  │      dimensions: {w: 1920, h: 1080}}
  ├── 5. Publish to Redis vi:media:{uid} (dedicated channel):
  │     {mediaUrl: "s3://...", mediaType: "image", ready: true}
  │
  └── 6. NanoClaw receives both events
      ├── vi:actions → 更新 awareness
      └── vi:media → 下载并用 Claude Vision API 处理
```

### 8.3 Video Clip Capture Flow

```
User long-press shutter (recording, max 30s)
  │
  ├── 1. Frontend: MediaRecorder from LiveKit local track
  │     └── Recording indicator + timer
  ├── 2. On stop: upload to S3 as MP4
  │     POST /api/upload/presign?type=video
  │     PUT s3://bucket/users/{uid}/media/{timestamp}.mp4
  ├── 3. Publish to Redis vi:media:{uid}:
  │     {mediaUrl: "s3://...", mediaType: "video",
  │      duration: 15.3, dimensions: {w: 1920, h: 1080}}
  │
  └── 4. NanoClaw video processing pipeline:
      ├── a. Download video from S3
      ├── b. ffmpeg: extract keyframes (every 2s)
      ├── c. Whisper/Gemini: extract audio transcript
      ├── d. Claude Vision API: keyframes + transcript → 多帧推理
      │     "在视频中，用户展示了一道意大利面的制作过程..."
      └── e. Stream results → vi:stream:{uid}
```

### 8.4 LiveKit Keyframe Sampling Flow

```
Realtime Agent (continuous, every 5s)
  │
  ├── 1. Capture frame from participant video track
  ├── 2. Quality gate:
  │     ├── Scene hash (pHash) → skip if unchanged
  │     └── Blur detection (Laplacian) → skip if blurry
  ├── 3. Upload to S3 (JPEG 720p, ~50KB)
  │     PUT s3://bucket/users/{uid}/frames/{timestamp}.jpg
  ├── 4. Publish to Redis vi:frames:{uid}:
  │     {ts, frameUrl: "s3://...", sceneHash, hasChange: true}
  │
  └── NanoClaw Context Compiler consumes:
      └── Latest frame URL → included in context snapshot
          └── Claude uses it for intention prediction:
              "用户正在看一盘意面" → predict "nutritional analysis"
```

### 8.5 Media Storage Schema

```
S3: users/{uid}/
├── media/                          # 用户捕获的媒体 (持久)
│   ├── 2026-03-03T10-30_photo.jpg
│   ├── 2026-03-03T10-31_video.mp4
│   └── 2026-03-03T10-31_video_meta.json
│       {keyframes: ["f1.jpg", "f2.jpg"],
│        transcript: "...", duration: 15.3}
│
└── frames/                         # LiveKit 关键帧缓冲 (滚动, max 20)
    ├── 1709420400.jpg
    ├── 1709420405.jpg
    └── ...  (旧帧自动清理)
```

### 8.6 前端视频录制 UI

```
Camera View — 长按快门录制:

┌───────────────────────────────┐
│                               │
│     (Live Camera Feed)        │
│                               │
│   ┌─────────────────────┐     │
│   │ AI VIEWING...       │     │
│   │ 看起来是一道意面...   │     │
│   └─────────────────────┘     │
│                               │
│    🎤    ⏺ 00:15    ✅        │
│          ▲ recording          │
│    red ring animation         │
└───────────────────────────────┘
```

---

## 9. Pluggable Skill System

### 9.1 设计哲学

> **每个 Skill = 一个 Use Case 的产品化封装。**
> 每个 Skill 就是一个可独立投放的场景。用户看到的是"能力"，系统看到的是"Claude prompt + tools"。

```
Skill 生命周期:
Install → Available → User Taps Intent Card → Dispatch → Execute → Result
                                                            ↓
                                                    Feedback → Memory
                                              (改进未来的意图预测和执行质量)
```

### 9.2 Skill 目录结构

```
/data/shared/skills/                  # 预装 skills (只读, 所有用户共享)
├── xiaohongshu-publish/
│   ├── skill.md                      # System prompt (Claude Code 兼容格式)
│   ├── manifest.json                 # 元数据 + 依赖声明
│   └── examples/                     # 示例 (用于 few-shot 和展示)
│       ├── food-post.md
│       └── travel-post.md
│
├── remotion-video/
│   ├── skill.md
│   ├── manifest.json
│   └── templates/                    # Remotion 视频模板
│       ├── slideshow.tsx
│       └── highlight-reel.tsx
│
├── recipe-analyzer/
│   ├── skill.md
│   └── manifest.json
│
├── document-scanner/
│   ├── skill.md
│   └── manifest.json
│
├── travel-planner/
│   ├── skill.md
│   └── manifest.json
│
└── style-advisor/
    ├── skill.md
    └── manifest.json

/data/users/{uid}/skills/             # 用户自定义 skills
├── my-custom-skill/
│   ├── skill.md
│   └── manifest.json
└── ...
```

### 9.3 Skill .md 格式 (Claude Code 兼容)

```markdown
# Xiaohongshu Auto-Publisher

You are a Xiaohongshu content creation specialist.
The user will provide photos and optional text.
Your job is to create engaging Xiaohongshu posts.

## Tools Available
- `oauth_call`: Call Xiaohongshu API to publish posts
- `web_fetch`: Research trending topics and hashtags
- `file_read`: Read user's style preferences from memory

## Workflow
1. Analyze the provided photo(s) using vision
2. Generate a compelling caption (150-300 chars, casual tone)
3. Select 5-10 relevant hashtags (mix popular + niche)
4. Preview the post for user confirmation
5. Publish via Xiaohongshu API

## Style Guide
- Use emojis naturally (1-3 per paragraph)
- Write in first person
- Include a hook in the first line
- End with a question to encourage comments

## Output Format
Return a module: {type: "social_post_preview", data: {title, body, hashtags, images}}
```

### 9.4 Pre-installed Skills (Phase 1)

| Skill | 描述 | 输入 | 输出 | OAuth | 预估 Cost/次 |
|-------|------|------|------|-------|-------------|
| **xiaohongshu-publish** | 拍照→AI文案→发布小红书 | 📷 图片 + 文字 | 社交帖子预览 | Xiaohongshu | ~$0.05 |
| **remotion-video** | 照片/文字→生成短视频 | 📷🎬 图片/视频 | MP4 视频 | — | ~$0.10 |
| **recipe-analyzer** | 拍食物→营养分析+食谱 | 📷 食物图片 | 营养表+食谱 | — | ~$0.03 |
| **document-scanner** | 拍文件→OCR+结构化 | 📷 文档图片 | 结构化文本 | — | ~$0.02 |
| **travel-planner** | 拍景点→旅行计划 | 📷 景点图片 | 行程卡片 | Google Cal | ~$0.05 |
| **style-advisor** | 拍穿搭→搭配建议 | 📷 衣物图片 | 搭配方案 | — | ~$0.04 |

### 9.5 Skill 执行在 NanoClaw 中的完整流程

```
1. 意图卡片点击 or 语音指令 → vi:exec:{uid}
   {taskId, sessionId, skillSlug: "xiaohongshu-publish",
    prompt: "帮我发布到小红书", mediaUrls: ["s3://..."]}
                    │
2. NanoClaw Skill Loader:
   ├── 解析路径: /workspace/skills/ (优先) → /skills/ (fallback)
   ├── 读取 manifest.json → 验证 OAuth + tools 依赖
   ├── 读取 skill.md
   └── 组装 system prompt: CLAUDE.md (用户人格) + skill.md
                    │
3. Claude Agent SDK Session:
   ├── system: assembled_prompt
   ├── tools: manifest.requirements.tools
   ├── model: manifest.model || "claude-sonnet-4-6"
   ├── images: mediaUrls → Claude Vision
   └── Execute → 流式结果
                    │
4. 结果输出:
   ├── 流式: vi:stream:{uid} → SSE → Frontend
   │   ├── exec_progress (步骤进度)
   │   ├── exec_module (结构化模块, e.g. social_post_preview)
   │   └── exec_result (最终结果)
   ├── 持久化: /workspace/sessions/{sessionId}.json
   └── 记忆更新: /workspace/memory/ (如有新偏好)
```

### 9.6 Skill Management API (API Server)

```
GET    /api/skills                    # 列出所有可用 skills (shared + user)
GET    /api/skills/{slug}             # 获取 skill 详情
POST   /api/skills                    # 创建用户自定义 skill
PUT    /api/skills/{slug}             # 更新 skill
DELETE /api/skills/{slug}             # 删除用户自定义 skill
GET    /api/skills/{slug}/stats       # Skill 执行统计
POST   /api/skills/{slug}/enable      # 启用 skill
POST   /api/skills/{slug}/disable     # 禁用 skill
```

### 9.7 前端 Profile 页面 (Skills + Memory)

```
Profile Page (替代原 Memory View 入口)
├── 📎 Skills Tab
│   ├── "My Skills" section
│   │   ├── [Installed Skill Card] × N
│   │   │   ├── Icon + Name + Description
│   │   │   ├── Usage stats ("Used 12 times")
│   │   │   └── [Disable] / [Configure]
│   │   └── [+ Create Custom Skill]
│   │
│   └── "Available Skills" section
│       ├── [Pre-installed Skill Card] × N
│       │   ├── Icon + Name + Description
│       │   ├── Required: [OAuth badges]
│       │   └── [Install] / [Preview]
│       └── (Future: Skill marketplace)
│
└── 🧠 Memory Tab (现有 MemoryView 内容)
    ├── Identity
    ├── Semantic
    └── Episodic
```

---

## 10. Intention Prediction System

### 10.1 产品定位："Video Call with Your Claude Code"

> 用户在和自己的 Claude Code 视频通话。
> Claude Code (主脑) 通过代言人的眼睛看到你看到的一切，
> 用自己的记忆理解你，用 Skills 预测你需要什么，
> 然后通过代言人的嘴巴说："要不要帮你做X？"

意图预测是主脑最核心的能力——它体现了"主脑控制代言人"的架构哲学。主脑预测用户意图，然后通过 context injection 让代言人自然地向用户表达这些建议。用户感觉是在和一个懂自己的 AI 对话，实际上是 Claude Code 在幕后驱动一切。

### 10.2 Prediction Pipeline

意图预测嵌入 Context Compiler 的 30 秒循环中：

```
Context Compiler (每 30 秒)
  │
  ├── [Step 1-4] 编译 context snapshot (已有)
  │
  └── [Step 5] 意图预测 (NEW)
      │
      ├── Gather signals:
      │   ├── Latest keyframe URL (from vi:frames)
      │   ├── Recent actions summary (from vi:summary)
      │   ├── User memory highlights (from /workspace/memory/)
      │   ├── Available skill list (from /skills/ manifests)
      │   └── Current session state
      │
      ├── Claude Haiku reasoning (~$0.002/call):
      │   System: "You are an intention predictor. Given the user's
      │            visual context, recent actions, memory, and
      │            available skills, predict 3-5 most likely intentions.
      │            Each intention MUST map to an available skill.
      │            Rank by expected value (probability × user value)."
      │
      │   Input: {frame_description, recent_actions, memory_summary,
      │           available_skills: [{slug, name, description, input_types}]}
      │
      │   Output: [
      │     {skill_slug, title, description, confidence, icon, params},
      │     ...
      │   ]
      │
      └── Publish:
          ├── vi:ctx:{uid} → Realtime Agent (含 predicted_intentions)
          └── vi:intent:{uid} → API Server SSE → Frontend (意图卡片)
```

### 10.3 Intention Card 数据格式

```json
{
  "type": "intention_update",
  "ts": 1709420400,
  "intentions": [
    {
      "id": "int_001",
      "skill_slug": "recipe-analyzer",
      "title": "分析营养成分",
      "description": "检测到食物图片，分析卡路里和营养素",
      "confidence": 0.85,
      "icon": "📊",
      "card_color": "#22c55e",
      "params": {
        "media_urls": ["s3://bucket/users/uid/media/photo1.jpg"],
        "context": "italian pasta dish"
      },
      "estimated_time": "~10s",
      "estimated_cost": "$0.03"
    }
  ]
}
```

### 10.4 Session View 重新设计

```
┌──────────────────────────────────────────┐
│ 📋 Session Summary                       │
│ "拍摄了一盘意大利面，正在分析中..."          │
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
│  tap = 直接 dispatch skill execution     │
│                                          │
├──────────────────────────────────────────┤
│ 📦 Output + Intermediate Results         │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ [Progress: Analyzing nutrition...]   │ │
│ │ Step 1: Image recognition ✅         │ │
│ │ Step 2: Nutrient lookup ⏳           │ │
│ │ Step 3: Calculate totals ○           │ │
│ │ ████████████░░░░░░░ 65%              │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ [Intermediate: OCR Result]           │ │
│ │ Detected: Spaghetti Carbonara        │ │
│ │ Ingredients: pasta, egg, pecorino... │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ [Final: Nutrition Module]            │ │
│ │ ┌──────────────────────────────────┐ │ │
│ │ │ Calories: 650 kcal               │ │ │
│ │ │ Protein: 25g | Carbs: 78g        │ │ │
│ │ │ Fat: 28g | Fiber: 3g             │ │ │
│ │ │ [Compare to daily target →]      │ │ │
│ │ └──────────────────────────────────┘ │ │
│ └──────────────────────────────────────┘ │
│                                          │
├──────────────────────────────────────────┤
│ 💬 Chat + Voice Input                    │
│ [Type or speak to refine...]             │
└──────────────────────────────────────────┘
```

### 10.5 Intention Card 交互流程

```
User taps Intention Card (e.g. "Nutrition Analysis")
  │
  ├── 1. Card → "executing..." state (spinner)
  │
  ├── 2. Frontend dispatches to NanoClaw:
  │     POST /api/exec or Redis vi:exec:{uid}
  │     {taskId, sessionId, skillSlug: "recipe-analyzer",
  │      prompt: auto-generated from intention,
  │      mediaUrls: [session photos/videos],
  │      params: from prediction}
  │
  ├── 3. NanoClaw loads skill → executes → streams results
  │     └── Results appear in Output zone below cards
  │
  ├── 4. Intermediate results appear as they stream:
  │     ├── exec_progress → Progress bar
  │     ├── exec_intermediate → Intermediate result cards
  │     └── exec_result → Final result module
  │
  └── 5. Post-execution:
        ├── Executed card → "✅ Complete" + mini result preview
        ├── Remaining cards may re-rank (new context available)
        └── Memory update (if new preference learned)
```

### 10.6 Realtime Agent 意图集成

Realtime Agent 收到包含 `predicted_intentions` 的 context 后：

```python
async def _on_context_update(self, context_data: dict):
    snapshot = context_data['snapshot']
    intentions = context_data.get('predicted_intentions', [])

    # 1. 更新 Gemini 系统指令 (含意图提示)
    intent_hints = format_intention_hints(intentions)
    new_instructions = f"{AGENT_INSTRUCTIONS_CORE}\n\n{snapshot}\n\n{intent_hints}"
    await self._realtime_session.update(instructions=new_instructions)

    # 2. 推送意图卡片到前端 (via DataChannel)
    if intentions:
        await self._push_to_frontend(
            topic="vi-agent",
            data={"type": "intention_update", "intentions": intentions}
        )

    # 3. 主动语音建议 (可选, 当 confidence > 0.8)
    top_intent = intentions[0] if intentions else None
    if top_intent and top_intent['confidence'] > 0.8:
        # Gemini 会自然地将意图融入对话:
        # "I notice you're looking at pasta. Want me to analyze the nutrition?"
        pass  # 已通过 system instruction 引导 Gemini
```

### 10.7 意图预测成本优化

```
基础成本: ~$0.002/prediction × every 30s = $0.24/hour/user

优化策略:
  1. 场景不变跳过: keyframe hash 不变 → 复用上次预测
  2. 用户空闲降频: idle 60s → 120s → 300s interval
  3. 缓存稳定预测: 同一场景不重复调用 Claude
  4. 批量预测: 多个信号变化时合并一次预测调用

优化后预估:
  活跃用户: ~$0.50/day (8h, 平均 40% 活跃时间)
  10 用户/VPS: ~$5/day
```

---

## 11. Frontend 变更 (V4)

### 11.1 SSE 扩展（替代 DataChannel 接收 NanoClaw 结果）

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
| `exec_intermediate` | `{taskId, step, label, data}` | 中间结果 (NEW) |
| `exec_result` | `{taskId, summary}` | 任务完成 |
| `exec_error` | `{taskId, error, recoverable}` | 任务错误 |
| `intention_update` | `{intentions: [...]}` | 意图预测卡片 (NEW) |
| `skill_status` | `{slug, status, stats}` | Skill 状态变更 (NEW) |
| `memory_update` | `{layer, filename, action}` | 记忆变更 (已有) |
| `session_update` | `{sessionId, status}` | Session 变更 (已有) |

### 11.2 前端接收流程

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

### 11.3 Token Management UI（新增）

```
ProfileView (原 MemoryView) → "Connections" Tab

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

## 12. API Server 扩展

### 12.1 新增模块

| 模块 | 路由前缀 | 功能 |
|------|---------|------|
| **Token Center** | `/api/tokens/` | OAuth 流程、token CRUD、刷新 |
| **FS Proxy** | `/api/fs/` | 用户文件系统读写 (代理 S3) |
| **Skill Manager** | `/api/skills/` | Skill CRUD、安装、统计 |
| **Media Upload** | `/api/upload/` | Presigned URL 生成、媒体元数据 |
| **Event Aggregator** | (内部 cron) | 每 10 秒聚合 vi:actions → vi:summary |
| **SSE Relay 扩展** | `/api/users/events` | 新增 exec_* + intention_* 事件类型 |

### 12.2 SSE Relay 扩展

```python
# api-server/app/routes/events.py — V4 扩展

# V3: 只订阅 vi:events:{uid}
# V4: 额外订阅 vi:stream:{uid} (NanoClaw 结果流)

async def sse_endpoint(uid: str, redis: Redis):
    pubsub = redis.pubsub()
    await pubsub.subscribe(
        f"vi:events:{uid}",     # 已有: memory_update, session_update
        f"vi:stream:{uid}",     # 新增: exec_* 事件
        f"vi:intent:{uid}"      # 新增: intention_update 事件
    )

    async def event_generator():
        async for msg in pubsub.listen():
            if msg['type'] == 'message':
                yield f"data: {msg['data']}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

### 12.3 数据库扩展

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

## 13. 数据流总览

### 13.1 Flow 1: 实时语音交互 (System 1, <1s)

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

### 13.2 Flow 2: 深度执行 via Skill (System 2, seconds~minutes)

```
Intention Card 点击 or Realtime Agent 判断需要深度处理
  │
  ▼
Redis vi:exec:{uid} ← {taskId, skillSlug, mediaUrls, prompt}
  │
  ▼
NanoClaw Agent 收到任务
  ├── Skill Loader: 加载 skill.md + manifest.json
  ├── 组装 system prompt: CLAUDE.md + skill.md
  ├── 启动 Claude Agent SDK session (with skill context)
  │   ├── Claude Vision: 处理 mediaUrls (照片/视频关键帧)
  │   ├── 可能读写文件
  │   ├── 可能搜索互联网
  │   ├── 可能调用 OAuth API (代用户操作)
  │   └── 流式生成结果
  │
  ├── 流式推送 → Redis vi:stream:{uid}
  │   ├── {type: "exec_progress", step: 1, total: 3, message: "Analyzing image..."}
  │   ├── {type: "exec_intermediate", label: "OCR Result", data: {...}}
  │   ├── {type: "exec_module", moduleType: "nutrition_card", data: {...}}
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

### 13.3 Flow 3: Context Refresh + Intention Prediction (每 30 秒)

```
NanoClaw Context Compiler (every 30s):
  ├── 读取 /workspace/memory/ (三层记忆)
  ├── 读取 /workspace/sessions/active/
  ├── 读取 Redis vi:summary:{uid} (最新用户活动)
  ├── 读取 Redis vi:frames:{uid} (最新关键帧 URL) ← NEW
  │
  ├── 编译 context snapshot (≤ 2000 chars)
  │
  ├── 意图预测 (Claude Haiku, ~$0.002) ← NEW
  │   └── 输入: context + 关键帧 + skill 列表
  │   └── 输出: 3-5 个 predicted_intentions
  │
  ├── Publish → Redis vi:ctx:{uid} (context + intentions)
  │                   │
  │                   ▼
  │             Realtime Agent:
  │             ├── 更新 Gemini system instructions (含意图提示)
  │             └── 推送 intention cards → Frontend (DataChannel)
  │
  └── Publish → Redis vi:intent:{uid} (intentions only) ← NEW
                      │
                      ▼
                API Server SSE → Frontend:
                └── 渲染 Intention Cards on Session View
```

### 13.4 Flow 4: 多模态输入 (NEW)

```
Channel 1 — Photo/Video Capture:
Frontend 拍照/录视频
  │
  ├── S3 Upload (presigned URL)
  │   └── s3://bucket/users/{uid}/media/{timestamp}.{jpg|mp4}
  │
  ├── Redis vi:actions:{uid} ← {type: "media_captured", mediaUrl, mediaType}
  │
  └── Redis vi:media:{uid} ← {mediaUrl, mediaType, ready: true}
      │
      ├── NanoClaw: 下载 → Claude Vision / 视频处理
      │   └── 视频: ffmpeg 关键帧 + Whisper 转录 → 多帧推理
      │
      └── Context Compiler: 更新 visual context
          └── 触发意图预测更新


Channel 3 — LiveKit Keyframe Sampling:
Realtime Agent (every 5s)
  │
  ├── capture frame → quality gate (scene change + blur)
  ├── S3 Upload (720p JPEG, ~50KB)
  └── Redis vi:frames:{uid} ← {frameUrl, sceneHash, ts}
      │
      └── NanoClaw Context Compiler:
          ├── 最新帧 URL → 纳入 context snapshot
          └── Claude Haiku: 帧 + 上下文 → 意图预测
```

### 13.5 Flow 5: Skill 执行 (NEW)

```
Intention Card 点击 or 用户语音指令
  │
  ├── Frontend/Realtime Agent → Redis vi:exec:{uid}
  │   {taskId, skillSlug, mediaUrls, prompt, params}
  │
  ├── NanoClaw:
  │   ├── Skill Loader: skill.md + manifest.json
  │   ├── Claude Agent SDK: CLAUDE.md + skill.md + media
  │   ├── Execute with tools (OAuth, web, files)
  │   └── Stream results → vi:stream:{uid}
  │       ├── exec_progress (步骤进度)
  │       ├── exec_intermediate (中间结果)
  │       ├── exec_module (结构化模块)
  │       └── exec_result (最终结果)
  │
  └── Frontend:
      ├── Session Summary 更新
      ├── Output zone: 渲染流式结果
      └── Intention Cards 重新排序
```

### 13.6 Flow 6: 意图预测循环 (NEW)

```
NanoClaw Context Compiler (every 30s)
  │
  ├── 采集信号:
  │   ├── 最新关键帧 (vi:frames)
  │   ├── 用户活动摘要 (vi:summary)
  │   ├── 用户记忆 (/workspace/memory/)
  │   └── 可用 Skill 列表 (/skills/ manifests)
  │
  ├── Claude Haiku 推理 (~$0.002):
  │   └── "预测用户接下来最可能需要的 3-5 个操作"
  │
  ├── 输出: predicted_intentions
  │
  ├── → vi:ctx:{uid} (Realtime Agent 消费)
  │   ├── 更新 Gemini instructions (含意图提示)
  │   ├── 语音建议: "I notice pasta — want nutrition analysis?"
  │   └── DataChannel → Frontend (observation card 更新)
  │
  └── → vi:intent:{uid} (Frontend 直接消费)
      └── SSE → Session View Intention Cards
          └── 用户点击 → dispatch skill → 回到 Flow 5
```

### 13.7 Flow 7: 用户操作事件

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

## 14. 部署拓扑

### 14.1 单 VPS 部署

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

### 14.2 NanoClaw Orchestrator

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

### 14.3 资源预算

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

## 15. V3 → V4 迁移路径

### 15.1 迁移阶段

```
Phase 1: 基础设施
  ├── Fork NanoClaw, 添加 Redis channel
  ├── API Server 添加 Token Center + FS Proxy + Event Aggregator
  ├── API Server 添加 Skill Manager + Media Upload
  ├── Redis Schema 扩展 (新 channels: vi:frames, vi:intent, vi:media)
  └── PostgreSQL Schema 扩展 (oauth_tokens 表)

Phase 2: NanoClaw 集成
  ├── 实现 Context Compiler
  ├── 实现 Skill Loader (skill.md + manifest.json)
  ├── 实现多模态输入处理 (Claude Vision + 视频处理)
  ├── 实现流式结果 → Redis → SSE
  ├── 实现 S3 FS 同步
  └── 实现 NanoClaw Orchestrator

Phase 3: Realtime Agent 升级
  ├── 添加 Redis context subscription
  ├── 添加 LiveKit keyframe sampling → vi:frames
  ├── 任务派发改为 Redis (替代 LiveKit RPC)
  ├── 添加 user event publishing
  └── 保留 Gateway fallback (过渡期)

Phase 4: 意图预测
  ├── Context Compiler 扩展: Claude Haiku 意图预测
  ├── vi:intent channel → SSE → Frontend
  ├── Realtime Agent 意图集成 (Gemini instructions + 语音建议)
  └── 预装 Skill 集开发 (Phase 1 的 6 个 skills)

Phase 5: Frontend 适配
  ├── SSE 接收 NanoClaw 结果 (新 Hook)
  ├── Session View 重设计: Summary → Intention Cards → Output
  ├── Profile 页面: Skills Tab + Memory Tab
  ├── Camera View: 视频录制 (长按快门)
  ├── Token Management UI
  └── 逐步切换: DataChannel → SSE

Phase 6: 清理
  ├── 移除 vi-gateway 服务
  ├── 移除 DataChannel 结果流 (保留 RPC + transcript 等)
  ├── 数据迁移: PostgreSQL memories → User FS
  └── 文档更新
```

### 15.2 并行运行期

Phase 3-4 期间, vi-gateway 和 NanoClaw 可以并行运行:
- executorHint: 'nanoclaw-v4' → 走 Redis → NanoClaw
- executorHint: 'gemini-flash' → 走 LiveKit RPC → vi-gateway (旧路径)
- 逐步验证后切换默认值

---

## 16. 通信矩阵 (V4)

```
                Realtime    NanoClaw    API Server   Frontend    Redis
Realtime        ---         Redis       HTTP         DC+RPC      Pub/Sub
NanoClaw        Redis       ---         HTTP         ---         Pub/Sub+Stream
API Server      ---         ---         ---          REST+SSE    Pub/Sub+Stream
Frontend        DC+RPC      ---         REST+SSE     ---         ---
Redis           ---         ---         ---          ---         ---
```

**关键变化 vs V3:**
- NanoClaw → Realtime (主脑→代言人): vi:ctx 单向控制流 — 战略指导
- Realtime → NanoClaw (代言人→主脑): vi:actions + vi:frames 感知流 — 感官数据
- NanoClaw ↔ Frontend: 通过 API Server SSE 中继 (V3 是 DataChannel)
- NanoClaw ↔ API Server: HTTP (与 V3 的 gateway↔api-server 类似)
- **NanoClaw 不直接与 Frontend 通信** — 完全通过 Redis + SSE 解耦
- **主从关系体现在通信方向:** 主脑推 context，代言人推 events — 控制是单向的

---

## 17. 关键设计权衡

### 17.1 SSE vs WebSocket (前端结果通道)

**选择: SSE**

| 维度 | SSE | WebSocket | 决策理由 |
|------|-----|-----------|---------|
| 方向 | 单向 (server→client) | 双向 | NanoClaw 结果是单向推送 |
| 基础设施 | 已有 (events.py) | 需要新建 | 减少工作量 |
| 连接限制 | 6/域名 | 无 | 10 用户只需 1 SSE/用户 |
| 重连 | 浏览器自动 | 需要自己实现 | 更简单 |
| 二进制 | 不支持 | 支持 | HTML/JSON 文本够用 |
| 复杂度 | 低 | 中 | 10 用户不需要 WebSocket |

### 17.2 1:1 固定 vs 动态分配 (Agent-User 映射)

**选择: 1:1 固定**

| 维度 | 1:1 固定 | 动态分配 | 决策理由 |
|------|---------|---------|---------|
| 复杂度 | 低 | 高 | 无需 context 热切换 |
| FS 管理 | 简单 (容器直接挂载) | 需要动态挂载 | 启动即可用 |
| 启动延迟 | 零 (容器常驻) | 秒级 (拉取 FS) | 用户体验更好 |
| 资源利用 | 中 (闲时浪费) | 高 | 10 用户容器成本低 |
| 后台任务 | 支持 (Agent 常驻) | 不支持 | scheduled jobs 需要 |
| 上限 | 10 用户/VPS | 50-100 用户/VPS | 够用, 可横向扩展 |

### 17.3 保留 API Server vs 合并到 NanoClaw

**选择: 保留并扩展**

- API Server (Python/FastAPI) 已有完整的 auth/memory/session 能力
- 合并到 NanoClaw (Node.js) = 重写，不值得
- 10 用户规模不需要微服务拆分
- 自然扩展: +OAuth Token Center, +FS Proxy, +Event Aggregator

---

## 18. 未来扩展方向

| 方向 | 说明 | 触发条件 |
|------|------|---------|
| **横向扩展** | 多 VPS, 用户路由到对应 VPS | >10 用户 |
| **动态 Agent 分配** | 从 1:1 升级为 N:M 动态分配 | 需要 >100 用户/VPS |
| **Agent Swarm** | NanoClaw 内置多 agent 协作 | 复杂任务需要并行处理 |
| **更多 OAuth** | GitHub, Linear, 飞书, 企业微信, 小红书, 抖音 | 用户需求驱动 |
| **向量搜索** | pgvector 语义检索记忆 | 单用户记忆 >1000 条 |
| **Scheduled Tasks** | Agent 定时执行任务 (晨报, 日报) | 用户需求驱动 |
| **Skill Marketplace** | 用户创建/共享 Skill，社区驱动 | Skill 数量 >20 |
| **Intention Learning** | 基于用户反馈优化意图预测模型 | 用户行为数据积累 |
| **Multi-Agent Skills** | 一个 Skill 调度多个 Agent 并行 | 复杂 workflow (如视频制作) |
| **AR Overlay** | 意图预测结果叠加到 camera AR 层 | 硬件支持 (ARKit/ARCore) |

---

*VI Agent System V4 Architecture | 2026-03-03 | Design by KC + Claude*
