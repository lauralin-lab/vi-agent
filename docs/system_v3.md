# VI Agent System V3 — The Always-On AI Colleague

> 文档版本: V3 Revised | 日期: 2026-02-28
> 基于 System V2 架构演进 | 经过系统性 Review 简化后的版本
>
> **V3 Review Note**: 本文档经过 2026-02-28 的系统性 Review。核心原则：**只构建当前需要的，让扩展变得容易**。原始设计中的 Channel Layer、Proactive Engine 保留为 P2/P3 aspirational 设计，不在 P0/P1 实现。Skills System 合并到 Agent Core。详见各 spec 的 V3 Review Notes。

---

## 0. V2 → V3 演进总览

### 0.1 V2 回顾

System V2 实现了一个**以 LiveKit Room 为核心的视觉 Agent**：

- **Realtime Agent** (Python): Gemini Live 驱动的实时语音 + 视觉感知
- **Gateway** (Node.js): NanoClaw/Gemini Flash 执行引擎
- **API Server** (Python): 用户、Session、Memory CRUD
- **Frontend** (React): Camera → Session → Home 三视图

**V2 的局限：**

| 局限 | 影响 |
|------|------|
| 单一通道 (LiveKit only) | 只能通过 App 交互，无法 Slack/Telegram/邮件 |
| 无持久记忆 | Agent 每次见面都要重新了解用户 |
| 执行引擎固定 | 无法使用本地 Claude Code 或切换 Executor |
| 无主动性 | Agent 只被动响应，不会主动关心用户 |

### 0.2 V3 新增能力 (按优先级分层)

```
V2 已有                        V3 P0/P1 (Now)                     V3 P2/P3 (When Needed)
┌──────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
│ System 1: 感知与响应  │      │ ① Agent Core 模块化      │      │ ④ Multi-Channel Layer    │
│ • Gemini Live 实时    │      │   拆分 monolith          │      │   Slack / Telegram / ... │
│ • LiveKit WebRTC     │      │   ToolRegistry           │      │   UMP 统一消息协议       │
│                      │      │   Skills 集成             │      │                          │
│ System 2: 推理与执行  │      │                          │      │ ⑤ Proactive Engine       │
│ • NanoClaw           │      │ ② System 3: Memory       │      │   Cron → Heartbeat       │
│ • Gemini Flash       │      │   三层记忆金字塔          │      │   → Event Triggers       │
│                      │      │   Importance Scoring      │      │                          │
│                      │      │                          │      │                          │
│                      │      │ ③ Execution Registry     │      │                          │
│                      │      │   Adapter 接口统一        │      │                          │
│                      │      │   2-3 executor 清理       │      │                          │
│                      │      │                          │      │                          │
│                      │      │ ⓪ Bug Fixes (P0)        │      │                          │
│                      │      │   12 前端 Bug 修复        │      │                          │
└──────────────────────┘      └──────────────────────────┘      └──────────────────────────┘
```

### 0.3 设计哲学：三个系统

| 系统 | 人类类比 | Agent 类比 | 特性 |
|------|---------|-----------|------|
| **System 1** | 直觉反应 | Realtime Agent (Gemini Live) | 毫秒级，流式，感知驱动 |
| **System 2** | 深度思考 | Execution Engine (可切换) | 秒~分钟级，工具使用，多步推理 |
| **System 3** | 长期记忆 + 潜意识 | Persistent Memory + Proactive Engine | 跨会话，自主运行，主动触发 |

**核心洞见**：V2 只有 System 1 + System 2。缺少 System 3 意味着 Agent 是"失忆症患者"——每次见面都要重新介绍自己，不会主动关心你，不会在你不说话的时候为你工作。

**V3 简化原则**：先补上 System 3 的记忆层（P0），清理 Agent Core 和 Execution 层的技术债（P0/P1），然后才扩展通道和主动性（P2/P3）。不为尚不存在的 text channel 构建抽象层。

---

## 1. 整体模块架构

### 1.1 模块总览图 (P0/P1 实际构建范围)

```
┌─────────────────────────────────────────────────────────────┐
│  LiveKit (V2 existing — 唯一活跃渠道)                         │
│  WebRTC audio/video + DataChannel + RPC                      │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────────┐
          │              │                  │
   ┌──────▼──────┐  ┌───▼────────┐         │
   │ Agent Core  │  │  Memory    │         │
   │ (重构)      │◀▶│  Center    │         │
   │             │  │ (System 3) │         │
   │ • ToolReg.  │  │            │         │
   │ • Context   │  │ • Identity │         │
   │ • Skills    │  │ • Semantic │         │
   │   (集成)    │  │ • Episodic │         │
   └──────┬──────┘  │ • Working  │         │
          │         │   (选择)    │         │
          │         └────────────┘         │
   ┌──────▼───────────────────────────────┐│
   │        Execution Registry            ││
   │                                      ││
   │  ┌────────────┐ ┌──────────┐        ││
   │  │Gemini Flash│ │ NanoClaw │        ││
   │  │ (fast)     │ │(thorough)│        ││
   │  └────────────┘ └──────────┘        ││
   │  ┌───────────────────┐ (optional)   ││
   │  │ Claude Code Cloud │              ││
   │  │ (code, P1)        │              ││
   │  └───────────────────┘              ││
   └──────────────────────────────────────┘│
          │                                │
   ┌──────▼────────────────────────────────▼──┐
   │            Infrastructure Layer            │
   │  PostgreSQL │ Redis │ S3 │ LiveKit Cloud   │
   └───────────────────────────────────────────┘
```

> **P2/P3 模块 (当前不构建)**:
> - Channel Layer: 当有 text channel 需求时构建 (Slack/Telegram/...)
> - Proactive Engine: 先作为 api-server 背景 worker 实现 Cron，后续独立
> - 详见各 spec 文档中的 "V3 Review Notes" → "What's Deferred"

### 1.2 模块职责矩阵

| 模块 | 职责 | 技术栈 | 状态 | 优先级 |
|------|------|--------|------|--------|
| **Agent Core** | 拆分 monolith, ToolRegistry, Skills 集成 | Python | 🔄 重构 | **P0** |
| **Memory Center** | 三层记忆, Importance Scoring, Context 注入 | Python + PostgreSQL | 🔄 扩展 | **P0** |
| **Bug Fixes** | 12 前端 Bug, agentIdentity 修复 | React/JS | 🔧 修复 | **P0** |
| **Execution Registry** | Adapter 接口统一, Selector 路由 | Node.js/TypeScript | 🔄 重构 | **P1** |
| **API Server** | Memory API 扩展, 路由增加 | Python FastAPI | 🔄 扩展 | P0/P1 |
| **Frontend** | Bug fixes, Memory View | React | 🔄 扩展 | P0/P1 |
| ~~Channel Layer~~ | ~~渠道适配, UMP 协议~~ | ~~Node.js~~ | ⏸️ 推迟 | **P2** |
| ~~Proactive Engine~~ | ~~Heartbeat, Cron, Events~~ | ~~Python~~ | ⏸️ 推迟 | **P3** |

### 1.3 V2 组件在 V3 中的映射

| V2 组件 | V3 P0/P1 演进 |
|---------|--------------|
| `realtime/src/agent_common.py` | 拆分 → `realtime/src/core/` 模块化 (AgentCore, ToolRegistry, types) |
| `realtime/agent.py` (root) | 🗑️ 删除 (dead code, 与 src/ 重复) |
| `realtime/task_dispatcher.py` | 🗑️ 删除 (dead code) |
| `gateway/` | 保持 → Execution Registry 的 NanoClaw + Gemini Flash Executor |
| `api-server/` | 扩展 → Memory V2 API + agent_memories 表 |
| `frontend/` | 修复 → 12 Bug Fixes + Memory View 扩展 |
| `prompts/vi-livekit-agent.md` | 提取通用部分 → Agent Core System Prompt |

---

## 2. Module 1: Channel Layer（多渠道通信）— ⏸️ P2 Deferred

> **Status: ASPIRATIONAL DESIGN** — 以下设计保留为 P2 实现目标。当前 P0/P1 阶段不构建。
> 触发条件: (1) 有具体的 text channel 用例需求 (2) Agent Core + Memory Center 稳定合并
> 详见 `docs/specs/04-channel-layer-spec.md` V3 Review Notes

### 2.1 Unified Message Protocol (UMP)

所有渠道的消息都归一化为 UMP 格式，Agent Core 只处理 UMP：

```typescript
// ===== 入站消息 (任意渠道 → Agent Core) =====
interface InboundMessage {
  id: string;                        // 消息唯一 ID
  timestamp: number;
  
  // 来源
  channel: ChannelType;              // 'livekit' | 'slack' | 'telegram' | 'feishu' | 'email' | 'sms' | 'webchat'
  channelMessageId: string;          // 渠道原始消息 ID
  channelUserId: string;             // 渠道内用户标识
  channelMetadata: Record<string, any>; // 渠道特有信息 (thread_ts, chat_id...)
  
  // 已解析的用户 (Channel Router 填充)
  userId: string;                    // VI 统一用户 ID
  conversationId: string;            // 跨渠道会话 ID
  
  // 内容 (归一化)
  content: {
    text?: string;                   // 文本内容
    audio?: { url: string; duration: number; transcription?: string };  // 语音
    images?: { url: string; caption?: string }[];                      // 图片
    files?: { url: string; filename: string; mimeType: string }[];     // 文件
    location?: { lat: number; lng: number };                           // 位置
    replyTo?: string;                // 回复的消息 ID
  };
  
  // 意图提示 (可选, 渠道层预解析)
  hints?: {
    isCommand?: boolean;             // 是否是 /command
    command?: string;                // 命令名
    executorHint?: string;           // 用户指定的 executor
    priority?: 'fast' | 'thorough';
  };
}

// ===== 出站消息 (Agent Core → 任意渠道) =====
interface OutboundMessage {
  conversationId: string;
  targetChannel: ChannelType;
  targetChannelUserId: string;
  
  content: {
    text?: string;                   // 纯文本 (所有渠道都支持)
    markdown?: string;               // Markdown (Telegram/Slack/飞书)
    html?: string;                   // HTML (Email / Web)
    blocks?: SlackBlock[];           // Slack Block Kit
    card?: FeishuCard;               // 飞书消息卡片
    buttons?: { label: string; action: string; url?: string }[];
    attachments?: { url: string; filename: string }[];
  };
  
  // 渠道行为控制
  behavior?: {
    replyToMessageId?: string;       // 回复特定消息
    threadId?: string;               // 在线程中回复 (Slack/飞书)
    ephemeral?: boolean;             // 仅自己可见 (Slack)
    silent?: boolean;                // 不推送通知
  };
}
```

### 2.2 Channel Adapter 接口

```typescript
interface ChannelAdapter {
  readonly channelType: ChannelType;
  
  // 生命周期
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<boolean>;
  
  // 入站: 渠道消息 → UMP
  onMessage(handler: (raw: any) => Promise<void>): void;
  normalize(raw: any): InboundMessage;
  
  // 出站: UMP → 渠道格式
  send(message: OutboundMessage): Promise<string>;  // 返回渠道消息 ID
  
  // 能力声明
  capabilities(): ChannelCapabilities;
}

interface ChannelCapabilities {
  supportsMarkdown: boolean;
  supportsHtml: boolean;
  supportsButtons: boolean;
  supportsThreads: boolean;
  supportsReactions: boolean;
  supportsVoice: boolean;
  supportsVideo: boolean;
  supportsFiles: boolean;
  maxTextLength: number;           // SMS=160, Telegram=4096, Email=unlimited
  maxFileSize: number;
  supportedMediaTypes: string[];
}
```

### 2.3 各渠道角色定位

每个渠道不只是"多一个通道"，而是有其**最适合的交互模式**：

| Channel | 最佳场景 | Agent 响应风格 | LLM 选择 |
|---------|---------|---------------|---------|
| **LiveKit** | 实时协作、brainstorming、视觉感知 | 流式语音 + DataChannel HTML | Gemini Live |
| **Slack** | 异步工作指令、团队协作 | Block Kit 卡片 + 线程回复 | Claude Sonnet |
| **Telegram** | 移动端快速交互 | Markdown + Inline Keyboard | Gemini Flash |
| **飞书** | 企业协作、审批流 | 消息卡片 + Interactive | Claude Sonnet |
| **Email** | 正式报告、长文档 | HTML 邮件 + 附件 | Claude Sonnet |
| **SMS** | 紧急通知、简单确认 | 纯文本 160字 + 链接 | Gemini Flash |
| **Web Chat** | 网页端嵌入式对话 | Markdown + 图片 | Gemini Flash |

### 2.4 Channel Router

```typescript
class ChannelRouter {
  private adapters: Map<ChannelType, ChannelAdapter>;
  private agentCore: AgentCoreClient;   // gRPC/HTTP → Python Agent Core
  private memoryCenter: MemoryCenterClient;
  
  async handleInbound(channel: ChannelType, rawMessage: any): Promise<void> {
    const adapter = this.adapters.get(channel)!;
    
    // 1. 归一化
    const inbound: InboundMessage = adapter.normalize(rawMessage);
    
    // 2. 用户身份解析
    inbound.userId = await this.resolveUserId(channel, inbound.channelUserId);
    
    // 3. 会话解析 (跨渠道关联)
    inbound.conversationId = await this.resolveConversation(inbound);
    
    // 4. 加载记忆上下文
    const memoryContext = await this.memoryCenter.getContextForAgent(inbound.userId);
    
    // 5. 选择 LLM (基于渠道 + 消息类型)
    const llmConfig = this.selectLLM(channel, inbound);
    
    // 6. Agent Core 处理
    const response = await this.agentCore.process({
      message: inbound,
      memoryContext,
      llmConfig,
    });
    
    // 7. 格式化响应 (基于渠道能力)
    const outbound = this.formatResponse(response, adapter.capabilities());
    
    // 8. 发送
    await adapter.send(outbound);
    
    // 9. 持久化消息记录
    await this.persistMessage(inbound, outbound);
  }
}
```

### 2.5 跨渠道用户身份统一

```sql
CREATE TABLE user_channel_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    channel_type VARCHAR(20) NOT NULL,      -- 'slack' | 'telegram' | 'feishu' | ...
    channel_user_id VARCHAR(255) NOT NULL,  -- 渠道内用户标识
    channel_workspace VARCHAR(255),         -- Slack workspace / 飞书 tenant
    
    display_name VARCHAR(100),
    is_primary BOOLEAN DEFAULT false,       -- 主渠道标记
    verified_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_type, channel_user_id, channel_workspace)
);

-- 绑定命令: 用户在渠道中发送 /bind <token>
-- token 由 Frontend 或 API Server 生成, 有效期 5 分钟
CREATE TABLE binding_tokens (
    token VARCHAR(64) PRIMARY KEY,
    user_id UUID REFERENCES users(id) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
```

### 2.6 跨渠道会话连续性

```sql
-- 跨渠道会话 (不同于 V2 的 sessions 表, 这里是对话线程级别)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    title VARCHAR(255),
    started_on_channel VARCHAR(20) NOT NULL,        -- 发起渠道
    active_channels VARCHAR(20)[] DEFAULT '{}',     -- 当前活跃渠道
    
    -- 关联 V2 Session (如果对话触发了执行)
    session_id UUID REFERENCES sessions(id),
    
    status VARCHAR(20) DEFAULT 'active',            -- 'active' | 'archived'
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 统一消息存储
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) NOT NULL,
    
    direction VARCHAR(10) NOT NULL,                 -- 'inbound' | 'outbound'
    channel VARCHAR(20) NOT NULL,
    channel_message_id VARCHAR(255),
    
    -- 归一化内容
    content_text TEXT,
    content_media JSONB DEFAULT '[]',               -- [{type, url, caption}]
    
    -- Agent 处理元数据
    llm_used VARCHAR(50),
    executor_used VARCHAR(50),
    tokens_used INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
```

### 2.7 "拉 Claude Code 开会" 的具体实现

```typescript
// 用户在任意渠道触发 "开会"
async function startMeeting(userId: string, sourceChannel: ChannelType): Promise<void> {
  // 1. 创建 LiveKit Room
  const room = await livekit.createRoom({ name: `meeting-${Date.now()}` });
  
  // 2. 生成用户 join token
  const userToken = await livekit.generateToken(room.name, userId);
  
  // 3. 通知用户加入 (通过原始渠道发送链接)
  const adapter = channelRouter.getAdapter(sourceChannel);
  await adapter.send({
    targetChannel: sourceChannel,
    targetChannelUserId: userId,
    content: {
      text: "会议室已创建，点击加入 👇",
      buttons: [{ 
        label: "加入会议", 
        action: "join_meeting",
        url: `https://vi.app/room/${room.name}?token=${userToken}` 
      }]
    }
  });
  
  // 4. Agent 以 Gemini Live 加入 Room
  await realtimeAgent.joinRoom(room.name, { mode: 'meeting' });
  
  // 5. 会后自动处理 (通过 Proactive Engine)
  // → 会议结束时自动生成纪要 → 发到 Slack
  // → 设置 cron reminder → 跟进 Action Items
}
```

### 2.8 LiveKit Adapter (V2 → V3 改造)

V2 的 `realtime/agent.py` 拆分为：

```
V2:  agent.py = LiveKit 通信 + LLM 推理 + 工具调用 + Context 管理 (all-in-one)

V3:  LiveKitAdapter = LiveKit 通信 + 消息归一化 + DataChannel 管理
     AgentCore      = LLM 推理 + 工具调用 + Context 管理 (渠道无关)
```

```python
# V3: LiveKit Adapter (Python, 保持在 realtime/ 中)
class LiveKitAdapter(ChannelAdapter):
    """LiveKit 渠道适配器 — 处理 WebRTC 连接和 DataChannel"""
    
    channel_type = "livekit"
    
    async def normalize(self, raw_event) -> InboundMessage:
        """将 LiveKit 事件归一化为 UMP"""
        if raw_event.type == "audio":
            # Gemini Live STT 已处理, 直接获取文本
            return InboundMessage(
                channel="livekit",
                content={"text": raw_event.transcription, "audio": raw_event.audio_url}
            )
        elif raw_event.type == "rpc_message":
            # F2B RPC: 前端发来的文字消息
            return InboundMessage(
                channel="livekit",
                content={"text": raw_event.payload}
            )
        elif raw_event.type == "data_channel":
            # DataChannel: dispatch, 照片等
            return self._normalize_data_channel(raw_event)
    
    async def send(self, message: OutboundMessage) -> str:
        """发送消息到 LiveKit Room"""
        if message.content.get("audio"):
            # TTS → LiveKit Audio Track
            await self.agent.say(message.content["text"])
        if message.content.get("html"):
            # HTML → DataChannel "vi-agent"
            await self.room.local_participant.publish_data(
                json.dumps({"type": "html_stream", "content": message.content["html"]}),
                topic="vi-agent"
            )
        return str(uuid4())
    
    def capabilities(self) -> ChannelCapabilities:
        return ChannelCapabilities(
            supportsVoice=True, supportsVideo=True,
            supportsHtml=True, supportsMarkdown=True,
            supportsFiles=True, supportsButtons=False,
            supportsThreads=False, supportsReactions=False,
            maxTextLength=float('inf'), maxFileSize=50_000_000,
        )
```

---

## 3. Module 2: Memory Center（持久记忆 — System 3）

### 3.1 记忆层次（三层存储 + Working Memory 选择算法）

> **V3 Review 变更**: 原设计为"四层金字塔"含 procedural 层。Review 后简化为三层存储 + Working Memory 选择算法。`procedural` 层从未被填充且没有明确用例，已删除。Working Memory 不是一个存储层，而是从上三层动态选取的算法。

```
            ┌───────────────────┐
            │  Identity Layer    │  ← 用户是谁, Agent 是谁
            │  SOUL.md / USER.md │     极少变化, importance 最高
            └─────────┬─────────┘
                      │
         ┌────────────▼────────────┐
         │   Semantic Memory        │  ← 提炼的知识和偏好
         │   "用户偏好深色主题"     │     从 Episodic 提炼
         │   "用户是产品经理"       │     周期更新
         └────────────┬────────────┘
                      │
    ┌─────────────────▼─────────────────┐
    │       Episodic Memory              │  ← 发生了什么
    │   memory/YYYY-MM-DD.md             │     每次 Session 自动产生
    │   + session summaries              │     自动摘要
    └─────────────────┬─────────────────┘
                      │
  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ▼ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  │    Working Memory (computed, 不存储)    │  ← ImportanceScorer.select_for_context()
  │    从上三层按 importance 排序选取       │     每次推理前计算
  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

### 3.2 记忆数据库 Schema

```sql
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- 记忆分层 (3 stored layers)
    layer VARCHAR(20) NOT NULL,           -- 'identity' | 'semantic' | 'episodic'
    category VARCHAR(50) NOT NULL,        -- 'user_profile' | 'preference' | 'session_summary' | 'relationship'
    
    -- 内容
    filename VARCHAR(255) NOT NULL,       -- 逻辑文件名 (兼容 NanoClaw MEMORY.md)
    content TEXT NOT NULL,
    
    -- 记忆元数据 (Importance Scoring 输入)
    importance FLOAT DEFAULT 0.5,         -- 0-1, context window 优先级
    access_count INTEGER DEFAULT 0,       -- 被加载次数
    last_accessed_at TIMESTAMPTZ,
    source VARCHAR(50) DEFAULT 'agent',   -- 'agent' | 'user' | 'system' | 'cron'
    source_channel VARCHAR(20),           -- 产生记忆的渠道
    source_session_id UUID,              -- 产生记忆的 session
    
    -- 向量检索 (P2 — 当记忆量增长到需要语义搜索时再加)
    -- embedding VECTOR(1536),           -- text-embedding-3-small (deferred)

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,              -- 临时记忆自动过期
    
    UNIQUE(user_id, filename)
);

CREATE INDEX idx_memories_user_layer ON agent_memories(user_id, layer);
CREATE INDEX idx_memories_importance ON agent_memories(user_id, importance DESC);
CREATE INDEX idx_memories_accessed ON agent_memories(user_id, last_accessed_at DESC);
```

### 3.3 Importance Scoring 算法

> **V3 Review 变更**: 原设计等权重 (4×0.25) 无经验基础。Review 后改为 layer_weight 主导 (0.40)，因为 identity 记忆始终比 episodic 重要，不应被 recency 等因素稀释。

```python
class ImportanceScorer:
    """决定哪些记忆被注入 Working Memory"""

    def compute_importance(self, memory: AgentMemory) -> float:
        """综合打分, 用于 context window 优先级排序"""

        # 因子 1: 层级权重 — 主导因子 (Identity 永远比 Episodic 重要)
        layer_weight = {
            'identity': 2.0,    # SOUL.md, USER.md — 几乎永远需要
            'semantic': 1.5,    # 提炼的知识 — 高价值
            'episodic': 1.0,    # 日志 — 有时效性
        }.get(memory.layer, 1.0)

        # 因子 2: 时间衰减 (越近越重要, 但 identity 不受时间影响)
        hours_since_access = (now() - memory.last_accessed_at).total_seconds() / 3600
        recency = math.exp(-hours_since_access / 168)  # 一周衰减到 ~37%

        # 因子 3: 访问频率 (越常被用到越重要)
        frequency = min(memory.access_count / 20, 1.0)  # 20次封顶

        # 因子 4: 来源权重 (用户明确要求记住的更重要)
        source_weight = {
            'user': 1.5,     # 用户主动说 "记住这个"
            'agent': 1.0,    # Agent 自己提炼的
            'cron': 0.8,     # 定时任务产出的
            'system': 0.6,   # 系统自动生成的
        }.get(memory.source, 1.0)

        # 加权组合 — layer 主导
        return min(1.0, (
            layer_weight * 0.40 +   # 层级是最重要的信号
            recency * 0.30 +        # 时效性次之
            frequency * 0.15 +      # 使用频率辅助
            source_weight * 0.15    # 来源辅助
        ))
    
    async def select_for_context(
        self, user_id: str, max_chars: int = 3000
    ) -> list[AgentMemory]:
        """选择注入 context window 的记忆, 按 importance 排序"""
        all_memories = await self.db.get_user_memories(user_id)
        
        # 1. 计算所有记忆的 importance
        for m in all_memories:
            m.importance = self.compute_importance(m)
        
        # 2. 按 importance 降序排列
        all_memories.sort(key=lambda m: m.importance, reverse=True)
        
        # 3. 贪心选择, 直到字符预算用完
        selected = []
        chars_used = 0
        for m in all_memories:
            if chars_used + len(m.content) > max_chars:
                continue
            selected.append(m)
            chars_used += len(m.content)
            # 更新访问计数
            await self.db.increment_access_count(m.id)
        
        return selected
```

### 3.4 记忆生命周期

```
用户交互 (任意渠道)
  │
  ▼
Session 结束 → 自动生成 Session Summary
  │               → Episodic Memory (memory/YYYY-MM-DD.md)
  │
  ▼
Heartbeat (每数小时)
  │  → 扫描近期 Episodic Memory
  │  → 提炼 Semantic Memory ("用户最近在评估竞品")
  │  → 清理过期的临时记忆
  │  → 更新 Importance Score
  │
  ▼
重大发现时 → 更新 Identity Layer
  │            ("用户换了新工作: CTO at StartupX")
  │
  ▼
每次推理前 → Working Memory 注入
               ImportanceScorer.select_for_context()
               按 importance 排序, 贪心填充 context window
```

### 3.5 NanoClaw 文件记忆同步

> **V3 Review 变更**: 原设计包含 `MemorySyncAdapter` 做双向文件↔DB 同步。Review 后移除：同步逻辑应由 NanoClaw executor 自己负责，不是 Memory Center 的职责。Memory Center 提供 CRUD API，NanoClaw 在任务开始/结束时调用 API 同步即可。
>
> NanoClaw 的 `update_memory` tool 已经通过 HTTP API 写入数据库。无需额外 sync adapter。

### 3.6 Memory Center API

```python
class MemoryCenter:
    """V3 Memory Center — 统一记忆管理"""
    
    async def get_context_for_agent(
        self, user_id: str, 
        channel: ChannelType = None,
        max_chars: int = 3000
    ) -> str:
        """获取注入 Agent context 的记忆文本"""
        
        # 1. Importance Scoring 选择记忆
        selected = await self.scorer.select_for_context(user_id, max_chars)
        
        # 2. 格式化为 Agent 可读文本
        sections = []
        for layer in ['identity', 'semantic', 'episodic']:
            layer_memories = [m for m in selected if m.layer == layer]
            if layer_memories:
                sections.append(f"## {layer.title()} Memory")
                for m in layer_memories:
                    sections.append(f"### {m.filename}\n{m.content}")
        
        return "\n\n".join(sections)
    
    async def process_session_end(self, session_id: str, user_id: str):
        """Session 结束时自动处理记忆"""
        
        # 1. 获取 Session 对话历史
        messages = await self.db.get_session_messages(session_id)
        
        # 2. LLM 生成 Session Summary
        summary = await self.llm.summarize_session(messages)
        
        # 3. 写入 Episodic Memory
        today = datetime.now().strftime('%Y-%m-%d')
        await self.db.upsert_memory(
            user_id=user_id,
            filename=f"memory/{today}.md",
            layer='episodic',
            category='session_summary',
            content=f"## Session {session_id[:8]}\n{summary}",
            source='system',
            source_session_id=session_id,
        )
    
    async def heartbeat_maintenance(self, user_id: str):
        """Heartbeat 周期性记忆维护"""
        
        # 1. 读取近期 Episodic 记忆
        recent_episodes = await self.db.get_recent_episodic(user_id, days=7)
        
        # 2. LLM 提炼 Semantic 记忆
        insights = await self.llm.extract_semantic_insights(recent_episodes)
        
        # 3. 更新 Semantic Memory
        for insight in insights:
            await self.db.upsert_memory(
                user_id=user_id,
                filename=f"semantic/{insight.category}.md",
                layer='semantic',
                category=insight.category,
                content=insight.content,
                source='cron',
            )
        
        # 4. 重新计算所有记忆的 Importance Score
        all_memories = await self.db.get_user_memories(user_id)
        for m in all_memories:
            m.importance = self.scorer.compute_importance(m)
            await self.db.update_importance(m.id, m.importance)
        
        # 5. 清理过期记忆
        await self.db.delete_expired_memories(user_id)
```

---

## 4. Module 3: Execution Registry（可切换执行引擎）

### 4.1 ExecutionAdapter 接口

核心抽象：**任何能接受 prompt + context、返回流式结果的东西，都是 Executor。**

```typescript
interface ExecutionAdapter {
  id: string;                    // 'nanoclaw' | 'gemini-flash' | 'claude-code-local' | 'claude-code-cloud'
  name: string;
  location: 'local' | 'cloud';
  
  capabilities: {
    canUseTools: boolean;
    canAccessFilesystem: boolean;
    canAccessInternet: boolean;
    canRunCode: boolean;
    maxContextLength: number;
    supportsStreaming: boolean;
    estimatedLatency: 'fast' | 'medium' | 'slow';
  };
  
  status(): Promise<'online' | 'offline' | 'busy'>;
  execute(request: TaskRequest): AsyncGenerator<TaskChunk>;
  abort(taskId: string): Promise<void>;
}

interface TaskRequest {
  taskId: string;
  sessionId: string;
  userId: string;
  prompt: string;
  context: {
    photoUrls?: string[];
    visualObservation?: string;
    memoryContext?: string;
    previousResults?: string[];
    conversationHistory?: Message[];
  };
  priority: 'fast' | 'thorough' | 'code';
  executorHint?: string;           // 用户指定的 executor
}

interface TaskChunk {
  type: 'progress' | 'text_stream' | 'html_stream' | 'result' | 'error';
  taskId: string;
  content: string;
  metadata?: {
    step?: number;
    total?: number;
    executor?: string;
    done?: boolean;
  };
}
```

### 4.2 内置 Executors

> **V3 Review 变更**: 从 5 个 Executor 简化到 2+1。Claude Code Local (隧道) 和 Custom Plugin 推迟到 P3。

| Executor | 位置 | 延迟 | 最佳场景 | 技术 | 优先级 |
|----------|------|------|---------|------|--------|
| **Gemini Flash** | Cloud | Fast | HTML 生成、总结、格式化 | @google/generative-ai SDK | **P1** (已有) |
| **NanoClaw** | Cloud | Medium | 深度分析、研究、多工具协作 | Claude Agent SDK in Container | **P1** (已有) |
| **Claude Code Cloud** | Cloud | Slow | 代码生成、多文件编辑 | Claude API + Tool Use | P1 (可选) |
| ~~Claude Code Local~~ | ~~Local~~ | | ~~本地开发、文件系统操作~~ | ~~隧道~~ | ⏸️ P3 |
| ~~Custom Plugin~~ | ~~Varies~~ | | ~~用户自定义~~ | ~~Plugin Protocol~~ | ⏸️ P3 |

### 4.3 Executor 选择策略

```typescript
class ExecutorSelector {
  select(task: TaskRequest, userPrefs: UserPreferences): ExecutionAdapter {
    // 1. 用户在消息中明确指定
    if (task.executorHint) {
      const executor = this.registry.get(task.executorHint);
      if (executor && executor.status() === 'online') return executor;
      // 指定的不可用 → fallback
    }
    
    // 2. 需要本地文件系统 → 优先本地 Claude Code
    if (task.context.requiresLocalFilesystem) {
      const local = this.registry.getLocal();
      if (local?.status() === 'online') return local;
    }
    
    // 3. 按 priority 路由
    switch (task.priority) {
      case 'fast':     return this.registry.get('gemini-flash');
      case 'thorough': return this.registry.get('nanoclaw');
      case 'code':     return this.registry.get('claude-code-cloud');
    }
    
    // 4. 默认策略
    return this.registry.getDefault(userPrefs);
  }
}
```

### 4.4 本地 Claude Code 作为 Executor — ⏸️ P3 Deferred

> **V3 Review**: 本地隧道架构 (WebSocket/Cloudflare Tunnel + 权限管理 + 本地 Agent) 是一个完整的产品特性，远超 infrastructure 改动。推迟到 P3。以下设计保留为参考。

**这是 V3 最核心的创新点**：用户可以将本地 Claude Code 注册为远程 Executor。

#### 架构

```
                          ┌──────────────────────────┐
                          │       Cloud Agent         │
                          │    (Channel Router +      │
                          │     Agent Core)           │
                          └────────────┬─────────────┘
                                       │ Task Request (encrypted)
                                       │ Task Result  (encrypted)
                                  ┌────▼────┐
                                  │ Tunnel  │  ← WebSocket / Cloudflare
                                  │ Bridge  │     Tunnel / Tailscale
                                  └────┬────┘
                                       │
                          ┌────────────▼─────────────┐
                          │   User's Local Machine    │
                          │                           │
                          │  ┌─────────────────────┐  │
                          │  │   VI Local Agent    │  │
                          │  │                     │  │
                          │  │ • 接收 TaskRequest  │  │
                          │  │ • 调用 claude CLI   │  │
                          │  │ • 流式返回 chunks   │  │
                          │  │ • 访问本地文件系统  │  │
                          │  └──────────┬──────────┘  │
                          │             │              │
                          │  ┌──────────▼──────────┐  │
                          │  │ Claude Code Process  │  │
                          │  │ (claude --api ...)   │  │
                          │  └─────────────────────┘  │
                          └───────────────────────────┘
```

#### 注册与使用流程

```bash
# 1. 安装
npm install -g @vi-agent/local-agent

# 2. 注册 (获取 agent_id + secret)
vi-agent register --user-token <your-token>
# → Registered: local-executor (id: abc123)

# 3. 启动 (建立隧道)
vi-agent start
# → Connected to VI cloud via WebSocket
# → Local executor registered
# → Listening for tasks...

# 4. 在任意渠道使用
# Slack: "用我本地的 Claude Code 来重构 api-server 的 auth 模块"
# → Agent Core → ExecutorSelector → local-claude-code → 隧道 → 本地执行
```

#### 安全模型

```typescript
interface LocalExecutorConfig {
  // 权限白名单
  allowedOperations: {
    readFiles: boolean;
    writeFiles: boolean;
    executeCommands: boolean;
    networkAccess: boolean;
    installPackages: boolean;
  };
  
  // 路径限制
  workingDirectory: string;         // 默认工作目录
  allowedPaths: string[];           // 白名单路径
  blockedPaths: string[];           // 黑名单 (/, /etc, ~/.ssh 等)
  
  // 确认策略
  confirmDestructive: boolean;      // rm, 格式化等需要本地确认
  autoApprovePatterns: string[];    // 自动批准的安全命令 (ls, cat, git status)
}
```

#### 本地 Agent 实现

```typescript
// @vi-agent/local-agent 核心实现
class LocalAgent {
  private ws: WebSocket;
  private config: LocalExecutorConfig;
  
  async connect(cloudUrl: string, credentials: Credentials): Promise<void> {
    this.ws = new WebSocket(cloudUrl, { headers: { Authorization: `Bearer ${credentials.token}` } });
    
    this.ws.on('message', async (data) => {
      const request: TaskRequest = JSON.parse(data);
      await this.handleTask(request);
    });
  }
  
  async handleTask(request: TaskRequest): Promise<void> {
    // 1. 权限检查
    if (!this.checkPermissions(request)) {
      this.sendChunk({ type: 'error', taskId: request.taskId, content: 'Permission denied' });
      return;
    }
    
    // 2. 启动 Claude Code CLI
    const process = spawn('claude', [
      '--api',
      '--model', 'claude-sonnet-4-20250514',
      '--max-turns', '50',
      '--cwd', this.config.workingDirectory,
    ]);
    
    // 3. 发送 prompt
    process.stdin.write(JSON.stringify({
      prompt: request.prompt,
      context: request.context,
    }));
    
    // 4. 流式转发结果
    process.stdout.on('data', (chunk) => {
      this.sendChunk({
        type: 'text_stream',
        taskId: request.taskId,
        content: chunk.toString(),
        metadata: { done: false },
      });
    });
    
    process.on('close', () => {
      this.sendChunk({
        type: 'result',
        taskId: request.taskId,
        content: 'Task completed',
        metadata: { done: true },
      });
    });
  }
  
  private sendChunk(chunk: TaskChunk): void {
    this.ws.send(JSON.stringify(chunk));
  }
}
```

### 4.5 Executor 热切换

用户可以在对话中随时切换 Executor：

```
用户 (Slack): "帮我分析这个竞品"
→ ExecutorSelector: priority=thorough → NanoClaw
→ NanoClaw: 执行深度分析...

用户 (Slack): "太慢了, 用 fast 版本"
→ Agent Core: abort(taskId) → NanoClaw 中止
→ ExecutorSelector: priority=fast → Gemini Flash
→ Gemini Flash: 快速生成结果

用户 (Slack): "用我本地的 Claude Code 来改代码"
→ ExecutorSelector: executorHint='claude-code-local' → 检查状态 → online
→ Local Agent: 通过隧道接收任务 → 本地 Claude Code 执行
→ 流式返回 diff → Slack 渲染代码变更
```

### 4.6 与 V2 Gateway 的关系

V2 的 Gateway 作为 Room 参与者处理 `dispatch_task` RPC：

```
V2:  Agent → RPC dispatch_task → Gateway → NanoClaw / Gemini Flash

V3:  Agent Core → Execution Registry → select executor
       ├── Gemini Flash Executor (内嵌, V2 已有)
       ├── NanoClaw Executor (内嵌, 兼容 V2 Gateway)
       └── Claude Code Cloud Executor (P1, 可选)
       # P3: Claude Code Local (隧道), Custom Plugin
```

V2 的 Gateway 可以保持运行并作为 NanoClaw Executor 的实现。新的 Executor 注册进 Registry 即可。

---

## 5. Module 4: Proactive Engine（主动性引擎 — System 3）— ⏸️ P3 Deferred

> **Status: ASPIRATIONAL DESIGN** — 以下设计保留为 P3 实现目标。
> 推荐分阶段实现: Phase 3a (Cron, api-server 内) → Phase 3b (Heartbeat) → Phase 3c (Events)
> 详见 `docs/specs/05-proactive-engine-spec.md` V3 Review Notes

### 5.1 三种触发机制

```
┌─────────────────────────────────────────────────────────┐
│                    Proactive Engine                       │
│                                                          │
│  ┌──────────────────┐  ┌────────────────────┐           │
│  │   Heartbeat       │  │   Cron Scheduler   │           │
│  │                   │  │                    │           │
│  │ • 30min 轮询      │  │ • 精确 cron 表达式 │           │
│  │ • 批量检查        │  │ • 独立 session     │           │
│  │ • 上下文感知      │  │ • 可选不同 LLM     │           │
│  │ • 记忆维护        │  │ • 结果直送渠道     │           │
│  └──────────────────┘  └────────────────────┘           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Event Triggers                      │   │
│  │                                                   │   │
│  │  事件源: Email | GitHub | Calendar | Webhook      │   │
│  │  条件匹配 → 触发 Action → 输出到指定渠道          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Heartbeat 系统

沿用 NanoClaw 的 `HEARTBEAT.md` 机制，云端统一管理：

```typescript
interface HeartbeatConfig {
  userId: string;
  intervalMinutes: number;            // 默认 30
  quietHours: { start: number; end: number }; // 23:00-08:00
  checklist: HeartbeatCheck[];
  notifyChannel: ChannelType;         // 默认通知渠道
  urgentChannel: ChannelType;         // 紧急通知渠道
}

interface HeartbeatCheck {
  id: string;
  name: string;                       // 'email' | 'calendar' | 'github' | 'custom'
  frequency: 'every' | 'daily' | 'weekly';
  lastCheckedAt: number;
  action: string;                     // 检查逻辑描述
  notifyIf: string;                   // 通知条件
}
```

**Heartbeat 循环：**

```python
class HeartbeatRunner:
    async def run_heartbeat(self, user_id: str):
        config = await self.db.get_heartbeat_config(user_id)
        
        # 1. 安静时间检查
        if self.is_quiet_hours(config):
            return  # 除非有紧急项
        
        # 2. 遍历检查清单
        notifications = []
        for check in config.checklist:
            if not self.should_run(check):
                continue
                
            result = await self.run_check(check)
            if result.should_notify:
                channel = config.urgentChannel if result.urgent else config.notifyChannel
                notifications.append((channel, result.message))
            
            check.lastCheckedAt = now()
        
        # 3. 记忆维护 (每次 heartbeat 都做)
        await self.memory_center.heartbeat_maintenance(user_id)
        
        # 4. 发送通知
        for channel, message in notifications:
            await self.channel_router.send(channel, user_id, message)
        
        # 5. 更新状态
        await self.db.save_heartbeat_state(user_id, config)
```

#### Heartbeat vs Cron 使用原则

| 用 Heartbeat | 用 Cron |
|-------------|---------|
| 多项检查可以批量合并 | 精确时间点执行 |
| 需要近期对话上下文 | 任务需要独立 session |
| 时间可以有漂移 (±5min) | 需要不同的 LLM 或 thinking level |
| 减少 API 调用 | 一次性提醒 |

### 5.3 Cron Scheduler

```sql
CREATE TABLE cron_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    -- 调度
    name VARCHAR(100) NOT NULL,
    cron_expression VARCHAR(50) NOT NULL,     -- '0 9 * * 1' = 每周一9点
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- 任务
    task_prompt TEXT NOT NULL,
    executor_hint VARCHAR(50),                -- 指定 executor
    context JSONB DEFAULT '{}',
    
    -- 输出
    output_channel VARCHAR(20) NOT NULL,
    output_format VARCHAR(20) DEFAULT 'text',
    
    -- 状态
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_result JSONB,
    run_count INTEGER DEFAULT 0,
    
    -- 一次性任务 (设置 max_runs=1)
    max_runs INTEGER,                         -- NULL = 无限
    
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cron_next_run ON cron_jobs(next_run_at) WHERE enabled = true;
```

**Cron 场景示例：**

```yaml
每日晨报:
  cron: "0 8 * * *"
  prompt: "检查邮件、日历和 GitHub 通知, 生成简短晨报"
  output_channel: slack
  executor: gemini-flash

周五周报:
  cron: "0 17 * * 5"
  prompt: "根据本周所有 session 和记忆生成周报"
  output_channel: email
  executor: nanoclaw

代码库健康检查:
  cron: "0 2 * * *"
  prompt: "检查 vi-agent 的 CI 状态、open PRs、stale branches"
  output_channel: slack
  executor: claude-code-local

定时提醒 (一次性):
  cron: "0 14 3 3 *"
  prompt: "提醒用户: 上周讨论的设计方案今天截止反馈"
  output_channel: telegram
  max_runs: 1
```

### 5.4 Event Triggers

```sql
CREATE TABLE event_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    event_source VARCHAR(50) NOT NULL,        -- 'email' | 'github' | 'calendar' | 'webhook'
    condition_description TEXT NOT NULL,       -- 自然语言条件描述
    condition_filter JSONB,                   -- 可选: 结构化过滤条件
    
    action_prompt TEXT NOT NULL,              -- 触发后执行的任务
    output_channel VARCHAR(20) NOT NULL,
    executor_hint VARCHAR(50),
    
    cooldown_minutes INTEGER DEFAULT 5,       -- 防止频繁触发
    last_triggered_at TIMESTAMPTZ,
    
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Event Trigger 示例：**

```typescript
const triggers = [
  {
    eventSource: 'email',
    condition: '收到来自 boss@company.com 的邮件',
    action: '立即通知用户并给出建议回复',
    outputChannel: 'sms',      // 紧急用 SMS
    cooldownMinutes: 0,
  },
  {
    eventSource: 'github',
    condition: 'PR 标记为 ready for review 且 reviewer 是我',
    action: '自动做代码 review 并发送结果',
    outputChannel: 'slack',
    cooldownMinutes: 5,
  },
  {
    eventSource: 'calendar',
    condition: '会议开始前 15 分钟',
    action: '发送提醒并附上会议相关资料摘要',
    outputChannel: 'telegram',
    cooldownMinutes: 0,
  },
];
```

### 5.5 Proactive Engine 状态管理

```sql
-- Heartbeat 状态追踪
CREATE TABLE heartbeat_state (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    last_run_at TIMESTAMPTZ,
    check_states JSONB DEFAULT '{}',      -- {checkId: lastCheckedAt}
    memory_maintenance_at TIMESTAMPTZ,
    config JSONB DEFAULT '{}',            -- HeartbeatConfig
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Agent Core 重构

### 6.1 从 V2 到 V3 的变化

V2 的 `agent.py` 是一个 all-in-one 的 monolith：

```
V2 agent.py:
  LiveKit 连接管理 + Gemini Live 配置 + 工具定义 + Context 管理 + 模式切换
  + Memory Center 交互 + Gateway RPC 调用 + DataChannel 推送
```

V3 将其拆分为职责清晰的模块：

```
V3:
  LiveKitAdapter      → LiveKit 连接 + DataChannel (见 Section 2.8)
  AgentCore           → LLM 推理 + 工具调用 + Context 管理
  MemoryCenter        → 记忆管理 (见 Section 3)
  ExecutionRegistry   → Executor 选择 + 任务调度 (见 Section 4)
  ChannelRouter       → 消息路由 (见 Section 2.4)
```

### 6.2 Agent Core 接口

```python
class AgentCore:
    """渠道无关的 Agent 核心 — 负责推理和工具调用"""
    
    def __init__(self):
        self.memory_center = MemoryCenter()
        self.execution_registry = ExecutionRegistry()
        self.tool_registry = ToolRegistry()
    
    async def process(
        self,
        message: InboundMessage,
        memory_context: str,
        llm_config: LLMConfig,
    ) -> AgentResponse:
        """处理归一化消息, 返回响应"""
        
        # 1. 构建 context
        context = await self._build_context(message, memory_context)
        
        # 2. LLM 推理
        llm_response = await self._reason(context, llm_config)
        
        # 3. 处理工具调用
        if llm_response.tool_calls:
            results = await self._execute_tools(llm_response.tool_calls, message)
            # 递归处理 (工具结果可能触发更多推理)
            return await self.process_with_tool_results(message, results)
        
        # 4. 构建响应
        return AgentResponse(
            text=llm_response.text,
            channel=message.channel,
            metadata=llm_response.metadata,
        )
    
    async def _execute_tools(self, tool_calls, message):
        """执行工具调用"""
        results = []
        for call in tool_calls:
            if call.name == 'execute_task':
                # 委托给 Execution Registry
                result = await self.execution_registry.dispatch(
                    TaskRequest.from_tool_call(call, message)
                )
            elif call.name == 'update_memory':
                result = await self.memory_center.upsert_memory(**call.args)
            else:
                result = await self.tool_registry.execute(call)
            results.append(result)
        return results
```

### 6.3 per-Channel LLM 选择

> **V3 Review 变更**: 原设计硬编码了 7 个 channel 的 LLM 配置。Review 后简化为 livekit + default，并使用环境变量允许 model name 变更。其他渠道的 LLM 配置在 Channel Layer (P2) 实现时添加。

```python
import os

LLM_CHANNEL_MAP = {
    # 实时语音 → Gemini Live (必须, 唯一支持实时语音的)
    'livekit': LLMConfig(
        model=os.getenv('VI_LLM_LIVEKIT', 'gemini-2.0-flash-live'),
        mode='realtime',       # WebSocket 流式
        temperature=0.7,
    ),

    # 默认 fallback (用于未来 text channels)
    'default': LLMConfig(
        model=os.getenv('VI_LLM_DEFAULT', 'claude-sonnet-4-20250514'),
        mode='text',
        temperature=0.5,
        max_output_tokens=4096,
    ),

    # P2: 以下配置在 Channel Layer 实现时添加
    # 'slack': LLMConfig(model='claude-sonnet-4-20250514', ...),
    # 'email': LLMConfig(model='claude-sonnet-4-20250514', ...),
    # 'telegram': LLMConfig(model='gemini-2.5-flash', ...),
    # 'sms': LLMConfig(model='gemini-2.5-flash', max_output_tokens=160, ...),
}
```

---

## 7. 通信协议（V3 P0/P1 范围）

### 7.1 V3 通信矩阵 (P0/P1 — 简化版)

> **V3 Review**: 原矩阵包含 Channel Adapters, Channel Router, Proactive Engine。P0/P1 中这些不存在，通信矩阵简化为 4 个组件。

```
                Agent    Execution  Memory    API      Frontend
                Core     Registry   Center    Server
Agent           —        gRPC       Python    HTTP     DC
Core                     /HTTP      internal           "vi-agent"

Execution       gRPC     —          ·         HTTP     DC
Registry        /HTTP                                  "vi-gateway"

Memory          Python   ·          —         HTTP     ·
Center          internal                      (CRUD)

API Server      HTTP     HTTP       SQL       —        REST

Frontend        DC+RPC   DC         ·         REST     —
```

> P2/P3 矩阵变化: 添加 Channel Adapters/Router 行列, 添加 Proactive Engine 行列

### 7.2 新增 API Endpoints (P0/P1)

```
# ===== Memory V2 (P0) =====
GET    /api/memories                    # 列出记忆 (分层显示)
GET    /api/memories/{id}               # 获取单条记忆
PUT    /api/memories/{id}               # 更新记忆
DELETE /api/memories/{id}               # 删除记忆
GET    /api/memories/context            # 获取当前 context 注入 (调试用)

# ===== Execution Registry (P1) =====
GET    /api/executors                   # 列出可用 executor
GET    /api/executors/{id}/status       # executor 状态
```

> **P2/P3 新增 (deferred)**:
> ```
> # Channel Binding (P2)
> POST /api/channels/bind, DELETE /api/channels/{id}, GET /api/channels
>
> # Cron Jobs (P3a)
> POST/GET/PUT/DELETE /api/cron, POST /api/cron/{id}/run
>
> # Event Triggers (P3c)
> POST/GET/PUT/DELETE /api/triggers
>
> # Conversations (P2)
> GET /api/conversations, GET /api/conversations/{id}/messages
>
> # Memory search (P2 — 需要 pgvector)
> POST /api/memories/search
> ```

---

## 8. 数据库 Schema 总览

### 8.1 V2 已有表

```
users              — 用户基本信息
sessions           — V2 Session (Camera → Execute → Result)
session_results    — Session 执行结果
memories           — V2 记忆 (简单 key-value)
devices            — 用户设备 
```

### 8.2 V3 新增表

```
# ═══ P0/P1 (Now) ═══
agent_memories              — 三层记忆 (替代 V2 memories)

# ═══ P2 (Channel Layer) ═══
# user_channel_bindings     — 渠道身份绑定
# binding_tokens            — 绑定验证 token
# conversations             — 跨渠道会话
# messages                  — 统一消息存储

# ═══ P3 (Proactive Engine) ═══
# cron_jobs                 — 定时任务
# event_triggers            — 事件触发器
# heartbeat_state           — 心跳状态

# ═══ P3 (Local Executor) ═══
# executor_registrations    — Executor 注册 (含本地) — 不需要直到有本地隧道
```

> **V3 Review**: V3 新增表从 9 个简化到 P0/P1 阶段仅 1 个 (`agent_memories`)。其余表在对应模块实现时添加。

### 8.3 新增表 DDL (executor_registrations) — ⏸️ P3 Deferred

```sql
CREATE TABLE executor_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    
    executor_type VARCHAR(50) NOT NULL,       -- 'claude-code-local' | 'custom'
    name VARCHAR(100) NOT NULL,               -- 'z-macbook-claude' 
    
    -- 连接信息
    tunnel_url VARCHAR(500),                  -- WebSocket tunnel URL
    tunnel_secret VARCHAR(255),               -- 隧道认证密钥
    
    -- 能力
    capabilities JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',                -- LocalExecutorConfig
    
    -- 状态
    status VARCHAR(20) DEFAULT 'offline',     -- 'online' | 'offline' | 'busy'
    last_heartbeat_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);
```

---

## 9. 部署架构 (V3 P0/P1)

> **V3 Review**: P0/P1 不新增任何服务。V2 的 4 服务架构保持不变，仅内部重构和扩展。

```
Docker Compose (V3 — P0/P1 无新服务)
├── frontend         — React SPA via Nginx (:80, :443)          ← Bug fixes + Memory View
├── api-server       — FastAPI (:8000, nginx proxy)              ← 扩展: Memory V2 API, agent_memories 表
├── vi-realtime      — LiveKit Agent, Python                     ← 重构: monolith → core/ 模块化
├── vi-gateway       — Gateway Node.js                           ← 重构: Execution Registry adapter 接口
├── postgres         — PostgreSQL 16 (:5432)                     ← 扩展: agent_memories 表
├── redis            — Redis 7 (:6379)                           ← 不变
└── (no new services in P0/P1)

外部依赖 (不变):
  vi-realtime         → Gemini Live API, LiveKit Cloud
  vi-gateway          → Gemini Flash API, Claude API
```

> **P2/P3 服务扩展 (deferred)**:
> ```
> # P2: Channel Layer
> + channel-service  — Channel Router + Adapters (:3000)
>   → Slack API, Telegram Bot API, 飞书 API, SendGrid, Twilio
>
> # P3: Proactive Engine
> + proactive-engine — 先作为 api-server 内 APScheduler worker, 后独立
>   → Gmail API, Google Calendar API, GitHub API
>
> # P3: Local Executor Tunnel
> + tunnel-server    — WebSocket Tunnel (:3002)
> ```

### 9.1 服务技术栈 (P0/P1 — 不变, 仅重构)

| 服务 | 语言 | 框架 | V3 变更 |
|------|------|------|---------|
| **vi-realtime** | Python | LiveKit Agents SDK | 拆分 monolith → core/ 模块化 |
| **vi-gateway** | TypeScript | Express | Adapter 接口统一, Selector 路由 |
| **api-server** | Python | FastAPI | Memory V2 API, agent_memories 表 |
| **frontend** | TypeScript | React/Vite | 12 Bug fixes, Memory View 扩展 |

---

## 10. 用户旅程

### 10.1 P0/P1 用户旅程 — LiveKit 增强体验

```
用户打开 VI App → 进入 LiveKit Camera View
  → Agent (Gemini Live) 打招呼: "嗨! 我记得你上次在研究竞品..."  ← Memory Center 注入
  → 用户: "帮我把那个分析做成 HTML 报告"
  → Agent: execute_task(prompt, priority='fast')
  → Execution Registry → Gemini Flash → HTML 生成 → DataChannel 推送
  → 用户在 Session View 看到结果
  → Session 结束 → Memory Center 自动写入 Episodic: "2026-02-28: 竞品分析报告"
  → 下次见面时 Agent 记得这次交互
```

**V3 P0/P1 的核心改善**:
1. Agent 有记忆了 — 不再每次"初次见面"
2. Agent Core 模块化 — 更易维护和扩展
3. Execution Registry 清晰 — 按 priority 选择 executor
4. 12 个前端 Bug 修复 — 核心 UX 流程不再卡顿

### 10.2 P2/P3 愿景 — 跨渠道全天候 (aspirational)

> 以下为 P2/P3 实现后的目标体验。Channel Layer 和 Proactive Engine 就绪后解锁。

```
09:00 [Cron → Slack]
  → 晨报推送
09:30 [Telegram]
  → 用户发图片让 Agent 分析
10:30 [Slack]
  → 跨渠道关联 Telegram 对话
14:00 [LiveKit 会议]
  → 自动会议纪要
17:00 [Heartbeat → 通知]
  → PR review 提醒
```

---

*End of System V3 Design Document (Revised 2026-02-28)*
