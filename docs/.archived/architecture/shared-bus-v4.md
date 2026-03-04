# V4 架构：Shared Event Bus（LiveKit + NanoClaw Coordination）

## 概述

用 **Redis Stream Shared Event Bus** + **Redis Hash Blackboard** 替换当前 LiveKit Agent 与 Gateway/NanoClaw 之间的点对点 RPC dispatch。所有 Agent（LiveKit、NanoClaw、Gateway）向同一个 per-session bus publish 和 read event。每条 message 携带 metadata tag（sender、visibility、priority、log_level），控制 routing、interrupt behavior 和 context projection。

这解决了 LiveKit 作为 "blind orchestrator" 的根本问题，实现自然、non-blocking 的语音进度播报。

---

## 核心问题诊断

### 当前架构（V3）的三个关键 Pain Point

**1. Context Fragmentation — LiveKit 对 NanoClaw 的工作内容一无所知**

表现：
- 用户上传照片到 NanoClaw，LiveKit 只知道有 URL，不知道照片里是什么
- LiveKit 只能说 "Working on it..." 这种套话，无法描述具体在做什么
- NanoClaw 返回的结果，LiveKit 只拿到一行 summary（通过 `rpcG2BSendReply`），无法深入讨论

根因：LiveKit 和 NanoClaw 之间没有 shared state。唯一通道是 Gateway 的 RPC callback，只传一句话。

**2. Conversation Blocking — 后台 task monitoring 与语音对话互斥**

表现：
- 如果 LiveKit 用 heartbeat polling NanoClaw progress，每次 poll 会 interrupt 当前语音生成
- 如果不 poll，LiveKit 完全不知道 NanoClaw 做到哪了
- 用户问 "做到哪了？"，LiveKit 答不出来

根因：当前 RPC 模式是 synchronous 的。LiveKit 发起 `dispatch_task` RPC，要么 block 等结果（最长 60s），要么立即返回但失去对 task 的感知。没有 async event push 机制。

**3. Unidirectional Channel — NanoClaw 执行中无法接收用户 feedback**

表现：
- NanoClaw 在做网页，用户通过语音说 "再加个评论区"
- LiveKit 听到了，但没有办法告诉正在执行中的 NanoClaw
- NanoClaw 做完的结果没有评论区，用户不满意，只能重新来

根因：当前通信是单向的：LiveKit → Gateway → NanoClaw。没有 feedback loop 让用户的新输入到达执行中的 NanoClaw。

---

## System Architecture

```
                                    ┌──────────────────────────────────────────────────────┐
                                    │                     Redis                             │
                                    │                                                      │
                                    │   vi:bus:{sessionId}       ← Stream (Event Log)      │
                                    │   vi:state:{sessionId}     ← Hash (Blackboard)       │
                                    │                                                      │
                                    │   Atomic write via Lua script:                       │
                                    │     XADD to Stream + HSET to Hash + XTRIM            │
                                    │                                                      │
                                    └────┬──────────────┬──────────────┬───────────────────┘
                                         │              │              │
                                    XREAD loop     XREAD loop    XREAD loop
                                         │              │              │
┌──────────────┐   voice/video    ┌──────┴───────┐     │        ┌─────┴──────────┐
│     User     │◄────────────────►│   LiveKit     │     │        │   Gateway /     │
│              │                  │   Agent       │     │        │   NanoClaw      │
│              │    DataChannel   │  (Python)     │     │        │  (TypeScript)   │
│              │◄─────────────────┤              │     │        │                 │
└──────────────┘   html/modules  └──────────────┘     │        └────────┬────────┘
                                                       │                 │
                                                 ┌─────┴──────┐   DataChannel
                                                 │  API Server │   (html streaming)
                                                 │  (Python)   │         │
                                                 │  PostgreSQL │         ▼
                                                 └─────────────┘    Frontend (React)
```

### Data Flow

```
User speaks  ──► LiveKit Agent ──XADD──► Redis Bus ──XREAD──► Gateway/NanoClaw
                                              │
User uploads ──► Frontend/API  ──XADD──► Redis Bus ──XREAD──► LiveKit + NanoClaw
                                              │
NanoClaw     ──► Gateway       ──XADD──► Redis Bus ──XREAD──► LiveKit Agent
progress/result                               │
                                        Blackboard Hash
                                       (State Snapshot)
```

**核心变化**：从「point-to-point RPC」变成「所有人往同一个 Stream 里读写」。每个 Agent 都能看到其他 Agent 的 message 和 state。

### Frontend Streaming（前端实时展示）

NanoClaw/Gateway 的输出通过 **两条独立通道** 同时推送给用户：

```
                    Redis Bus (backend coordination)
                         │
Gateway/NanoClaw ────────┤
                         │
                    DataChannel "vi-gateway" topic (frontend delivery)
                         │
                         ▼
                    Frontend (React)
                    ├── Progress bar + status text    ← TaskChunk.progress
                    ├── Streaming text response        ← TaskChunk.text_stream
                    ├── Live HTML preview (iframe)     ← TaskChunk.html_stream
                    └── Native module cards            ← TaskChunk.module
```

**两条通道各司其职**：

| Channel | 用途 | Consumer |
|---------|------|----------|
| **Redis Bus** | Backend agent coordination — LiveKit 知道 NanoClaw 在做什么，可以语音播报 | LiveKit Agent, Gateway |
| **DataChannel** | Frontend real-time rendering — 用户直接看到 NanoClaw 的工作成果 | Frontend React app |

**用户同时获得两种反馈**：
1. **耳朵**：LiveKit 通过语音告诉用户 progress（从 Redis Bus 读取）
2. **眼睛**：Frontend 直接 render NanoClaw 的 streaming output（通过 DataChannel）

具体来说，NanoClaw 做网页时：
- NanoClaw 的 **思考过程和回复** 通过 `text_stream` chunk 流式展示在 Frontend 聊天区
- NanoClaw 正在写的 **HTML 网页** 通过 `html_stream` chunk 流式更新到 Frontend 的 live preview iframe
- NanoClaw 的 **progress step** 通过 `progress` chunk 更新 Frontend 的 progress bar
- 同时，每个关键 milestone 的 **summary** publish 到 Redis Bus，让 LiveKit 可以语音播报

这意味着 Gateway `processTaskAsync()` 在 executor streaming loop 中同时做两件事：

```typescript
for await (const chunk of executor.execute(request)) {
  // 1. Frontend delivery — DataChannel (unchanged, existing flow)
  if (chunk.type === 'html_stream' || chunk.type === 'text_stream'
      || chunk.type === 'progress' || chunk.type === 'module') {
    await room.localParticipant.publishData(
      JSON.stringify(chunk), { topic: 'vi-gateway', reliable: true }
    );
  }

  // 2. Backend coordination — Redis Bus (NEW)
  if (chunk.type === 'progress') {
    await bus.publish(sessionId, {
      sender: 'nanoclaw', type: 'task_progress', priority: 'normal',
      content: `Step ${chunk.step}/${chunk.total}: ${chunk.message}`,
      log_level: 'summary',
    }, { field: 'nanoclaw:progress', value: JSON.stringify(chunk) });
  }
}
```

---

## Message Schema

Bus 上每条 message 的结构：

```typescript
interface BusMessage {
  // Identity
  id: string;              // Redis XADD 自动生成（如 "1709420000000-0"）
  sender: "user" | "livekit" | "nanoclaw" | "gateway" | "system";

  // Routing
  visibility: "all" | "livekit" | "nanoclaw" | "system";
  priority: "interrupt" | "normal" | "background";

  // Content
  type: "chat" | "media" | "task_request" | "task_progress"
      | "task_result" | "task_error" | "context_update" | "system_event";
  content: string;         // Human-readable summary（必填，≤500 chars）
  data?: string;           // JSON structured detail（选填）

  // Context Control
  log_level: "essential" | "summary" | "detail" | "debug";

  // Timestamp
  ts: string;              // Unix ms as string
}
```

### Field Semantics

#### `visibility` — 谁应该 consume 这条 message

| Value | Consumer | 示例 |
|-------|----------|------|
| `all` | 所有 Agent 都读 | 用户说话、task result |
| `livekit` | 仅 LiveKit Agent | 只给 voice agent 的 system prompt |
| `nanoclaw` | 仅 NanoClaw/Gateway | executor 内部细节 |
| `system` | 仅 API Server / monitoring | audit log |

#### `priority` — 什么时候处理（LiveKit 侧行为）

| Value | LiveKit Behavior | NanoClaw Behavior | 使用场景 |
|-------|------------------|-------------------|---------|
| `interrupt` | **立即 interrupt 当前语音，马上 respond** | 立即处理 | task complete、task error、紧急通知 |
| `normal` | **queue，在语音 natural pause 时 respond** | 按序处理 | progress milestone、context update |
| `background` | **静默 absorb 到 context，绝不主动提及** | 按序处理 | debug info、NanoClaw 内部细节 |

关键设计：LiveKit 有两个独立 queue — `interrupt_queue` 和 `normal_queue`。interrupt message 立刻触发 speech generation；normal message 等到用户说完话或 LiveKit 说完话后再处理。background message 只更新内部 context，不触发任何语音。

#### `log_level` — LLM context window 应包含多少

| Level | 谁的 LLM 会看到 | 示例 |
|-------|----------------|------|
| `essential` | 所有 Agent，始终 include | "用户：帮这条红裙子做个网页（$89）" |
| `summary` | 所有 Agent，空间允许时 include | "NanoClaw：Step 3/5 — 添加商品图片" |
| `detail` | 仅 sender 自己的 LLM | "Fixed CSS grid: grid-template-columns 从 3fr 改为 2fr 1fr" |
| `debug` | 没有 LLM 看到，仅 human debugging | "HTTP 200 from GCS presign, latency 45ms" |

**设计要点**：`visibility` 控制 routing（谁收到），`log_level` 控制认知深度（LLM prompt 里放多少）。两者独立。比如一条 message 可以 `visibility:all, log_level:detail` — 所有 Agent 都收到，但只有 sender 会把它放进 LLM prompt。

---

## Blackboard（State Hash）

Redis Hash `vi:state:{sessionId}` 存储当前 snapshot — O(1) read：

```
vi:state:{sessionId} = {
  // User state
  "user:last_message":       "帮这条裙子做个产品页面",
  "user:photo_urls":         '["https://storage.googleapis.com/vi-uploads/..."]',
  "user:photo_description":  "红色 Zara 亮片鸡尾酒裙，约 $89",

  // LiveKit Agent state
  "livekit:status":          "conversing",    // conversing | speaking | listening | idle
  "livekit:last_spoke":      "正在帮你做页面！",

  // NanoClaw/Gateway state
  "nanoclaw:status":         "working",       // idle | working | error | done
  "nanoclaw:task_id":        "task-abc-123",
  "nanoclaw:task_title":     "Build product webpage for red Zara dress",
  "nanoclaw:progress":       '{"step":3,"total":5,"message":"Adding product images"}',
  "nanoclaw:result_summary": "",

  // Session metadata
  "session:created_at":      "1709420000000",
  "session:updated_at":      "1709420045000"
}
```

**用途**：任何 Agent 在任何时刻可以 `HGET vi:state:{sid} nanoclaw:status` 获得 NanoClaw 当前 state，O(1)，不需要 scan Stream。LiveKit 回答用户 "做到哪了？" 时，直接读 Blackboard 即可。

---

## Atomic Write（Lua Script）

确保 Stream（Event Log）和 Hash（Blackboard）的 consistency。Redis Lua script 是 atomic 执行的 — 不存在 "写了 Stream 但 Hash 没更新" 的中间状态。

```lua
-- vi_bus_publish.lua
-- Atomic: XADD to Stream + HSET to Blackboard Hash + XTRIM
--
-- KEYS[1] = vi:bus:{sessionId}     (Stream)
-- KEYS[2] = vi:state:{sessionId}   (Hash / Blackboard)
--
-- ARGV layout:
--   ARGV[1..N-2] = Stream field/value pairs (sender, type, content, etc.)
--   ARGV[N-1]    = Blackboard hash field to update ("" to skip)
--   ARGV[N]      = Blackboard hash value

local stream_key = KEYS[1]
local state_key  = KEYS[2]
local n = #ARGV

-- 1. XADD to Stream (all args except last two)
local msg_id = redis.call('XADD', stream_key, '*', unpack(ARGV, 1, n - 2))

-- 2. HSET to Blackboard Hash (if field is non-empty)
local state_field = ARGV[n - 1]
local state_value = ARGV[n]
if state_field ~= '' then
  redis.call('HSET', state_key, state_field, state_value)
end

-- 3. Always update timestamp
redis.call('HSET', state_key, 'session:updated_at',
           tostring(redis.call('TIME')[1]) .. tostring(redis.call('TIME')[2]))

-- 4. Trim Stream to ~1000 entries
redis.call('XTRIM', stream_key, 'MAXLEN', '~', 1000)

return msg_id
```

---

## Agent Implementation

### LiveKit Agent（Python）— BusReader

```python
import asyncio
import json
import redis.asyncio as aioredis

class BusReader:
    """Non-blocking Redis Stream reader for LiveKit Agent."""

    def __init__(self, redis_client, session_id, agent_id="livekit"):
        self.redis = redis_client
        self.stream_key = f"vi:bus:{session_id}"
        self.state_key = f"vi:state:{session_id}"
        self.agent_id = agent_id
        self.last_id = "$"                       # Only new messages
        self.interrupt_queue = asyncio.Queue()    # Priority: interrupt
        self.normal_queue = asyncio.Queue()       # Priority: normal

    async def read_loop(self):
        """Background task: read Stream, route by priority."""
        while True:
            try:
                result = await self.redis.xread(
                    {self.stream_key: self.last_id},
                    count=10,
                    block=2000,   # 2s block, yields control regularly
                )
                if not result:
                    continue

                for stream_name, entries in result:
                    for msg_id, fields in entries:
                        self.last_id = msg_id
                        msg = {k.decode(): v.decode() for k, v in fields.items()}

                        # Skip own messages
                        if msg.get("sender") == self.agent_id:
                            continue

                        # Skip messages not visible to us
                        vis = msg.get("visibility", "all")
                        if vis not in ("all", self.agent_id):
                            continue

                        # Route by priority
                        prio = msg.get("priority", "normal")
                        if prio == "interrupt":
                            await self.interrupt_queue.put(msg)
                        elif prio == "normal":
                            await self.normal_queue.put(msg)
                        # background: silently absorbed, available via get_context_for_llm

            except Exception as e:
                logger.error(f"[BusReader] Error: {e}")
                await asyncio.sleep(1)

    async def get_state(self, field: str) -> str | None:
        """O(1) read from Blackboard Hash."""
        val = await self.redis.hget(self.state_key, field)
        return val.decode() if val else None

    async def get_context_for_llm(self, max_entries=20) -> str:
        """Pull recent essential + summary messages for LLM context injection."""
        entries = await self.redis.xrevrange(self.stream_key, count=100)
        lines = []
        for msg_id, fields in entries:
            msg = {k.decode(): v.decode() for k, v in fields.items()}
            level = msg.get("log_level", "detail")
            vis = msg.get("visibility", "all")
            if level in ("essential", "summary") and vis in ("all", self.agent_id):
                lines.append(f"[{msg.get('sender', '?')}] {msg.get('content', '')}")
            if len(lines) >= max_entries:
                break
        return "\n".join(reversed(lines))
```

### LiveKit Agent — Interrupt & Normal Handler

```python
# Integrated into agent_common.py

async def _start_bus(self):
    """Initialize BusReader and handlers."""
    self.bus = BusReader(self._redis, self._session_id)
    asyncio.create_task(self.bus.read_loop())
    asyncio.create_task(self._handle_interrupts())
    asyncio.create_task(self._handle_normals())

async def _handle_interrupts(self):
    """Process interrupt-priority messages — respond immediately."""
    while True:
        msg = await self.bus.interrupt_queue.get()

        if msg["type"] == "task_result":
            summary = msg.get("content", "Task completed")
            ctx = await self.bus.get_context_for_llm(max_entries=5)
            self._agent_session.generate_reply(
                user_input=f"[SYSTEM: Background task completed! Result: {summary}. "
                           f"Recent context:\n{ctx}\n"
                           f"Tell the user the result enthusiastically. Be specific.]"
            )
        elif msg["type"] == "task_error":
            self._agent_session.generate_reply(
                user_input=f"[SYSTEM: Task failed: {msg.get('content')}. "
                           f"Apologize and suggest what to try next.]"
            )

async def _handle_normals(self):
    """Process normal-priority messages — respond at natural voice pause."""
    while True:
        msg = await self.bus.normal_queue.get()

        # Wait for natural pause (not mid-speech)
        while self._is_speaking:
            await asyncio.sleep(0.3)

        if msg["type"] == "task_progress":
            # Skip stale progress, use latest only
            latest = msg
            while not self.bus.normal_queue.empty():
                try:
                    next_msg = self.bus.normal_queue.get_nowait()
                    if next_msg["type"] == "task_progress":
                        latest = next_msg   # Use newer progress
                    else:
                        await self.bus.normal_queue.put(next_msg)
                        break
                except asyncio.QueueEmpty:
                    break

            self._agent_session.generate_reply(
                user_input=f"[SYSTEM: Progress update: {latest.get('content')}. "
                           f"Briefly mention if natural. Don't force it.]"
            )
        elif msg["type"] == "context_update":
            # Photo description, user preference, etc. — absorbed into context
            pass
        elif msg["type"] == "media":
            self._agent_session.generate_reply(
                user_input=f"[SYSTEM: User just uploaded media. "
                           f"Acknowledge it: '{msg.get('content')}']"
            )
```

### Gateway/NanoClaw — BusWriter

```typescript
// gateway-service.ts — 用 bus publish 替代 RPC callback

class BusWriter {
  private redis: Redis;
  private luaSha: string;     // EVALSHA 缓存

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async publish(
    sessionId: string,
    message: Partial<BusMessage>,
    stateUpdate?: { field: string; value: string }
  ): Promise<string> {
    const fields = {
      sender: message.sender ?? 'gateway',
      type: message.type ?? 'system_event',
      visibility: message.visibility ?? 'all',
      priority: message.priority ?? 'normal',
      content: message.content ?? '',
      data: message.data ? JSON.stringify(message.data) : '',
      log_level: message.log_level ?? 'summary',
      ts: String(Date.now()),
    };

    const streamArgs = Object.entries(fields).flat();
    const stateField = stateUpdate?.field ?? '';
    const stateValue = stateUpdate?.value ?? '';

    return this.redis.evalsha(
      this.luaSha, 2,
      `vi:bus:${sessionId}`, `vi:state:${sessionId}`,
      ...streamArgs, stateField, stateValue,
    );
  }
}

// 在 processTaskAsync() 中使用：
async function processTaskAsync(session, request, executorId) {
  const bus = new BusWriter(redis);

  // 1. Task accepted
  await bus.publish(request.sessionId, {
    sender: 'nanoclaw',
    type: 'task_progress',
    priority: 'normal',
    content: `Starting: ${request.prompt.slice(0, 100)}`,
    log_level: 'summary',
  }, { field: 'nanoclaw:status', value: 'working' });

  // 2. Streaming execution
  for await (const chunk of executor.execute(request)) {
    if (chunk.type === 'progress') {
      await bus.publish(request.sessionId, {
        sender: 'nanoclaw',
        type: 'task_progress',
        priority: 'normal',
        content: `Step ${chunk.step}/${chunk.total}: ${chunk.message}`,
        log_level: 'summary',
      }, { field: 'nanoclaw:progress', value: JSON.stringify(chunk) });
    }
    // HTML streaming to frontend via DataChannel (unchanged)
    if (chunk.type === 'html_stream') {
      await publishData(room, chunk);
    }
  }

  // 3. Task complete — interrupt priority, LiveKit will tell user immediately!
  await bus.publish(request.sessionId, {
    sender: 'nanoclaw',
    type: 'task_result',
    priority: 'interrupt',
    content: 'Product page is ready!',
    data: { summary: '...', html_url: '...' },
    log_level: 'essential',
  }, { field: 'nanoclaw:status', value: 'done' });

  // No more rpcG2BSendReply! LiveKit reads from bus.
}
```

---

## User Flow 示例 — Sequence Diagram + Before/After

### Flow 1：Upload Photo → Auto Analyze → Proactive Description

**Before（当前 V3）**：用户上传照片 → LiveKit 不知道内容 → 用户主动问才能触发分析 → 5-10s 等待 → 一行 summary

**After（V4 Event Bus）**：

```
User          Frontend       Redis Bus          LiveKit Agent    Gateway/NanoClaw
 │               │               │                   │                │
 │──拍照─────────►│               │                   │                │
 │               │──presign───►API Server             │                │
 │               │◄──signed URL──│                   │                │
 │               │──PUT to GCS──►│                   │                │
 │               │               │                   │                │
 │               │──XADD────────►│                   │                │
 │               │  sender:user  │                   │                │
 │               │  type:media   │                   │                │
 │               │  priority:    │                   │                │
 │               │   normal      │                   │                │
 │               │  log_level:   │                   │                │
 │               │   essential   │                   │                │
 │               │               │                   │                │
 │               │               │──XREAD────────────►│               │
 │               │               │                   │  (sees media)  │
 │◄──语音："我来看看你分享的照片！"──────────────────│               │
 │               │               │                   │                │
 │               │               │──XREAD───────────────────────────►│
 │               │               │                   │   (sees media) │
 │               │               │                   │   auto VLM...  │
 │               │               │                   │                │
 │               │◄──DataChannel: text_stream "这是一条红色Zara裙..."─│
 │               │  (Frontend 聊天区展示 NanoClaw 的分析文字)          │
 │               │               │                   │                │
 │               │               │◄──XADD────────────────────────────│
 │               │               │  sender:nanoclaw                  │
 │               │               │  type:context_update              │
 │               │               │  priority:normal                  │
 │               │               │  content:"Red Zara sequin         │
 │               │               │   cocktail dress, ~$89"           │
 │               │               │  log_level:essential              │
 │               │               │                   │                │
 │               │               │──XREAD────────────►│               │
 │               │               │                   │(sees VLM result)
 │◄──语音："这是一条很漂亮的红色 Zara 鸡尾酒裙，─────│               │
 │   大约 89 美金。要不要我帮你做个产品页面？"        │               │
```

用户同时通过 **两个通道** 获得反馈：
- **眼睛** 👁️：Frontend 聊天区流式展示 NanoClaw 的文字分析结果（DataChannel `text_stream`）
- **耳朵** 👂：LiveKit 语音播报照片内容和建议（从 Redis Bus 读取 `context_update`）

**体验提升**：从「被动 + 5s delay + minimal info」→「proactive + real-time + rich context」

---

### Flow 2：Build Webpage + Streaming Preview + Concurrent Conversation

**Before（当前 V3）**：用户说 "做个网页" → LiveKit block 等 RPC 60s → 对话中断 → 最终一句 "做好了"

**After（V4 Event Bus）**：

```
User          Frontend       Redis Bus          LiveKit Agent    Gateway/NanoClaw
 │               │               │                   │                │
 │──语音："帮我做个产品网页"──────────────────────────►│               │
 │               │               │                   │                │
 │               │               │◄──XADD────────────│                │
 │               │               │  sender:livekit   │                │
 │               │               │  type:task_request │                │
 │               │               │  priority:normal   │                │
 │               │               │  content:"Build product page       │
 │               │               │   for red Zara dress"              │
 │               │               │  log_level:essential               │
 │               │               │                   │                │
 │◄──语音："好的！我来帮你做，做好会告诉你。"─────────│                │
 │               │               │                   │                │
 │               │               │──XREAD───────────────────────────►│
 │               │               │                   │  (sees request)│
 │               │               │                   │  start execute │
 │               │               │                   │                │
 │               │               │◄──XADD────────────────────────────│
 │               │               │  type:task_progress               │
 │               │               │  priority:normal                  │
 │               │               │  content:"Step 1/5: Analyzing     │
 │               │               │   product details"                │
 │               │               │  log_level:summary                │
 │               │               │                   │                │
 │               │◄──DataChannel: progress {step:1, total:5}─────────│
 │               │  [Frontend: progress bar 更新 20%]                 │
 │               │               │                   │                │
 │               │◄──DataChannel: text_stream "正在分析商品信息..."───│
 │               │  [Frontend: 聊天区流式显示 NanoClaw 回复]           │
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream "<header>Red Zara..."──│
 │               │  [Frontend: live preview iframe 开始渲染网页]       │
 │               │               │                   │                │
 │               │               │◄──XADD (background)───────────────│
 │               │               │  content:"Fixed CSS grid issue"   │
 │               │               │  log_level:detail                 │
 │               │               │  (LiveKit 不会播报这条)            │
 │               │               │                   │                │
 │──语音："今天天气怎么样？"──────────────────────────►│               │
 │               │               │                   │ (non-blocking!)│
 │◄──语音："72 度，晴天！"───────────────────────────│               │
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream "...<img src=dress>"───│
 │               │  [Frontend: 网页 preview 实时更新，图片出现]        │
 │               │               │                   │                │
 │               │               │◄──XADD────────────────────────────│
 │               │               │  type:task_progress               │
 │               │               │  priority:normal                  │
 │               │               │  content:"Step 3/5: Adding        │
 │               │               │   product images"                 │
 │               │               │                   │                │
 │               │◄──DataChannel: progress {step:3, total:5}─────────│
 │               │  [Frontend: progress bar 更新 60%]                 │
 │               │               │                   │                │
 │               │               │──XREAD────────────►│               │
 │               │               │                   │(normal, waits  │
 │               │               │                   │ for pause)     │
 │◄──语音："对了，网页快好了，正在加商品图片，Step 3。"│               │
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream "...<div>$89</div>"────│
 │               │  [Frontend: 网页持续流式更新，价格出现]             │
 │               │               │                   │                │
 │               │               │◄──XADD────────────────────────────│
 │               │               │  type:task_result                 │
 │               │               │  priority:interrupt               │
 │               │               │  content:"Product page ready!"    │
 │               │               │  log_level:essential              │
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream {done:true}────────────│
 │               │  [Frontend: 网页 preview 完整渲染]                  │
 │               │◄──DataChannel: progress {step:5, total:5}─────────│
 │               │  [Frontend: progress bar 100%, 完成状态]            │
 │               │               │                   │                │
 │               │               │──XREAD────────────►│               │
 │               │               │                   │(interrupt!)    │
 │◄──语音："你的产品页面做好了！有裙子图片、─────────│               │
 │   $89 定价，还有评论区。快看看！"                  │               │
```

**用户的三通道体验**：
- **眼睛-文字** 👁️：Frontend 聊天区流式显示 NanoClaw 的回复文字
- **眼睛-网页** 👁️：Frontend live preview iframe 实时渲染正在构建的 HTML 网页
- **耳朵** 👂：LiveKit 语音播报 milestone progress + 完成通知

**体验提升**：从「conversation blocked + zero awareness」→「concurrent conversation + visual streaming + voice narration」

---

### Flow 3：Mid-Task User Feedback（执行中追加需求）

**Before（当前 V3）**：NanoClaw 执行中无法收到用户新输入 → 结果不符合预期 → 重做

**After（V4 Event Bus）**：

```
User          Frontend       Redis Bus          LiveKit Agent    Gateway/NanoClaw
 │               │               │                   │                │
 │  (NanoClaw 正在 build webpage, Frontend 实时 streaming)            │
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream (持续更新)──────────────│
 │               │  [Frontend: 网页在用户眼前逐步成形]                 │
 │               │               │                   │                │
 │──语音："再加个用户评论区"──────────────────────────►│               │
 │               │               │                   │                │
 │               │               │◄──XADD────────────│                │
 │               │               │  sender:livekit   │                │
 │               │               │  type:chat         │                │
 │               │               │  visibility:all    │                │
 │               │               │  content:"User requests            │
 │               │               │   adding reviews section"          │
 │               │               │  log_level:essential               │
 │               │               │                   │                │
 │◄──语音："好的，我让它加上评论区。"─────────────────│                │
 │               │               │                   │                │
 │               │               │──XREAD───────────────────────────►│
 │               │               │                   │  (sees chat)   │
 │               │               │                   │  adjust plan!  │
 │               │               │                   │                │
 │               │               │◄──XADD────────────────────────────│
 │               │               │  type:task_progress               │
 │               │               │  content:"Adjusting: adding       │
 │               │               │   reviews section per user req"   │
 │               │               │                   │                │
 │               │◄──DataChannel: text_stream "好的，正在加评论区..."─│
 │               │  [Frontend: 聊天区显示 NanoClaw 确认]               │
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream "...<section>Reviews"──│
 │               │  [Frontend: 网页 preview 出现评论区]                │
 │               │               │                   │                │
 │               │               │◄──XADD (result, interrupt)────────│
 │               │               │                   │                │
 │               │◄──DataChannel: html_stream {done:true}────────────│
 │               │  [Frontend: 完整网页包含评论区]                      │
 │               │               │                   │                │
 │◄──语音："页面做好了，评论区也加上了！"──────────────│               │
```

**体验提升**：从「no mid-task communication」→「real-time feedback loop with visual confirmation」

---

### Flow 4：LiveKit Proactive State Awareness

**Before（当前 V3）**：用户问 "做到哪了" → LiveKit 答不出来 → 要重新发 RPC 查

**After（V4 Event Bus）**：

```
User          Frontend       Redis Bus          LiveKit Agent    Gateway/NanoClaw
 │               │               │                   │                │
 │  (NanoClaw 在后台工作，Frontend 持续 streaming)                     │
 │               │               │                   │                │
 │               │◄──DataChannel: progress {step:3}──────────────────│
 │               │  [Frontend: progress bar 60%]                      │
 │               │◄──DataChannel: html_stream (持续)─────────────────│
 │               │  [Frontend: 网页在更新]                             │
 │               │               │                   │                │
 │──语音："做到哪了？"───────────────────────────────►│               │
 │               │               │                   │                │
 │               │               │                   │──HGET──────────►
 │               │               │  Blackboard:      │  vi:state:{sid}
 │               │               │  nanoclaw:progress│  nanoclaw:
 │               │               │  = {"step":3,     │  progress
 │               │               │   "total":5,      │                │
 │               │               │   "message":      │◄──O(1) return──│
 │               │               │   "Adding images"}│                │
 │               │               │                   │                │
 │◄──语音："正在做 Step 3，一共 5 步，────────────────│               │
 │   当前在添加商品图片。你可以在屏幕上看到进度！"    │               │
```

**体验提升**：从「blind + re-query needed」→「O(1) instant answer + visual progress already visible」

---

### Frontend Streaming 体验总结

用户在整个 flow 中始终有 **视觉反馈**，不需要等 LiveKit 语音播报才知道进展：

| Frontend 组件 | 数据来源 | 更新频率 | 展示内容 |
|--------------|---------|---------|---------|
| **Progress bar** | DataChannel `progress` chunk | 每个 step | "Step 3/5: Adding images" + 进度条 |
| **Chat area** | DataChannel `text_stream` chunk | 实时流式 | NanoClaw 的回复文字（"正在分析..."） |
| **Live preview** | DataChannel `html_stream` chunk | 实时流式 | NanoClaw 正在构建的 HTML 网页 |
| **Module cards** | DataChannel `module` chunk | Task 完成时 | place_card, checklist 等 native 组件 |

LiveKit 语音是 **锦上添花** — 在用户不看屏幕时也能感知进度。两者互补，不冲突：
- Frontend streaming = **持续的视觉反馈**（detail level，所有 chunk 都 render）
- LiveKit voice = **关键 milestone 的语音播报**（summary level，只说重要的）

---

## Key Decision Log

| # | Decision | Chosen | Rejected | Reason |
|---|----------|--------|----------|--------|
| 1 | Event transport | Redis Streams | Redis Pub/Sub | Streams persistent + replayable；Pub/Sub consumer busy 时丢 message |
| 2 | State access | Redis Hash (Blackboard) | Scan Stream on every read | O(1) HGET vs O(N) XREVRANGE |
| 3 | Consistency | Lua script atomic XADD+HSET | Separate calls | 消除 crash 时 Stream 和 Hash desync 的可能 |
| 4 | Interrupt model | 3-level（interrupt/normal/background） | 2-level | `background` 用于 NanoClaw debug detail，LiveKit 不应播报 |
| 5 | Context projection | Per-message `log_level` field | Separate streams per level | Single stream 更简单；read-time filter 成本低 |
| 6 | Frontend delivery | Keep existing DataChannel | Route through Redis bus | Frontend 已经正常工作，不需要改 |
| 7 | Gateway role | Stays as executor + bus writer | Eliminate Gateway | Gateway 仍管理 executor adapter；bus 只替代 RPC callback |
| 8 | Stream retention | XTRIM ~1000 per session | Time-based TTL | 单 session message 很少超过 100 条；1000 足够且内存可控 |

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Redis down → 所有 coordination 失败 | Low | High | 保留当前 RPC 模式作为 fallback |
| 2 | LiveKit interrupt queue unbounded growth | Low | Medium | Queue cap 100，超出则 drop oldest non-interrupt message |
| 3 | Lua script 与 Redis Cluster 不兼容 | Medium | Medium | 两个 key 使用相同的 hash tag `{sessionId}` |
| 4 | NanoClaw 发送过多 detail message | Medium | Low | Rate limit：每 2s 最多 1 条 detail message |
| 5 | Bus message 撑爆 LLM context window | Medium | Medium | `get_context_for_llm()` hard cap max_entries=20，约 4000 chars |

---

## Implementation Roadmap

### Phase 1：Core Bus（MVP）— ~3 days
1. 创建 Lua script `vi_bus_publish.lua`
2. 创建 Python `BusReader` class
3. 创建 TypeScript `BusWriter` class
4. 将 `BusReader` 集成到 `agent_common.py`：
   - Room join 时启动后台 bus read task
   - 添加 interrupt handler（task_result, task_error）
   - 添加 normal handler（task_progress, context_update）
5. 将 `BusWriter` 集成到 `gateway-service.ts`：
   - 用 bus publish 替代 `rpcG2BSendReply`
   - Publish progress、result、error event
6. 保留现有 RPC dispatch 作为 fallback

### Phase 2：Photo Flow + Context Projection — ~2 days
1. Photo upload 时 publish `media` event
2. Auto-trigger NanoClaw VLM analysis
3. Publish `context_update` 包含 photo description
4. LiveKit Agent 实现 `get_context_for_llm()`
5. 将 bus context inject 到 LiveKit 的 system prompt

### Phase 3：Bidirectional Communication — ~2 days
1. LiveKit publish 用户 voice transcript 到 bus
2. NanoClaw 的 BusReader 接收执行中的用户 feedback
3. NanoClaw 根据新 input 调整 execution
4. Gateway watch bus 上的 `task_request` event（替代 RPC dispatch）

### Phase 4：Polish — ~1 day
1. LiveKit normal handler 中的 stale progress deduplication
2. NanoClaw detail message rate limiting
3. Session end 时 cleanup bus（EXPIRE keys）
4. Monitoring：记录 bus throughput 和 queue depth

### Future
- Consumer Groups 支持 horizontal scaling
- Per-user bus（跨 session memory）
- Frontend 直接通过 SSE 读取 bus（部分替代 DataChannel）

---

## Appendix：Rejected Alternatives

### Redis Pub/Sub
Fire-and-forget semantic 意味着 consumer busy 时 message 丢失。Voice conversation 中，LiveKit Agent 经常处于 "busy" 状态（正在 generating speech）。Pub/Sub 会在说话期间丢失 progress update，导致 narration 不可靠。

### LiveKit DataChannel as Bus
需要 NanoClaw 作为 LiveKit room participant 加入。NanoClaw 是 headless backend service — 加 WebRTC 侵入性大且无必要。DataChannel 无 persistence，reconnect 后无法 replay。

### Gateway-as-Mediator Enhancement
这加剧了当前架构的核心问题：Gateway 作为 information bottleneck。添加更多 RPC method 不能解决 LiveKit 和 NanoClaw 没有 shared state 的根本问题。Bus pattern 去中心化了 coordination。

### PostgreSQL Event Sourcing
PostgreSQL LISTEN/NOTIFY 可以 push event，但 latency 更高（~10-50ms vs Redis ~1ms），且没有内置 consumer group 支持。API Server 已经用 PostgreSQL 做 session persistence — 再把它当 real-time event bus 会职责过载。
