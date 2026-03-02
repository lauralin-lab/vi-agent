# VI Agent System Architecture

> 文档日期: 2026-03-02

---

## 1. 系统概览

VI Agent 是一个以实时语音视觉为核心交互方式的 AI 助手系统。采用四服务架构，通过 LiveKit WebRTC 实现毫秒级实时交互，通过 Gateway 执行引擎完成复杂推理任务，通过三层记忆系统实现跨会话持久化。

### 1.1 架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React/Vite)                       │
│                                                                     │
│   LiveCameraView ─── LiveSessionView ─── HistoryView ─── MemoryView│
└───────┬───────────────────┬──────────────────────────┬──────────────┘
        │ WebRTC + DC + RPC │ DataChannel              │ REST + SSE
        │                   │                          │
   ┌────▼────┐        ┌────▼─────┐              ┌─────▼──────┐
   │vi-realtime│◄─RPC─►│vi-gateway │              │ api-server  │
   │ (Python)  │       │ (Node.js) │──── HTTP ───►│ (FastAPI)   │
   │           │───────►│           │              │             │
   └─────┬─────┘ HTTP  └───────────┘              └──────┬──────┘
         │                                               │
         └───────────── HTTP ───────────────────────────►│
                                                         │
┌────────────────────────────────────────────────────────┼──────────┐
│                    Infrastructure                      │          │
│   PostgreSQL 16  │  Redis 7  │  LiveKit Cloud  │  AWS S3         │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 设计哲学：三个系统

| 系统 | 人类类比 | Agent 实现 | 特性 |
|------|---------|-----------|------|
| **System 1** | 直觉反应 | Gemini Live 实时语音视觉 (vi-realtime) | 毫秒级，流式，感知驱动 |
| **System 2** | 深度思考 | Gateway 执行引擎 (vi-gateway) | 秒~分钟级，多步推理，结构化输出 |
| **System 3** | 长期记忆 | Memory Center (api-server) | 跨会话，持久化，重要性评分 |

### 1.3 四服务职责

| 服务 | 技术栈 | 核心职责 |
|------|--------|---------|
| **vi-realtime** | Python, LiveKit Agents SDK | 实时语音/视觉 Agent，工具调用，前端控制 |
| **vi-gateway** | TypeScript/Node.js | 复杂任务执行，LLM 路由，流式 HTML/模块输出 |
| **api-server** | Python, FastAPI | 用户认证，Session 管理，记忆系统，文件存储 |
| **Frontend** | React/Vite | Camera/Session/History/Memory 四视图，WebRTC 交互 |

---

## 2. vi-realtime：实时 Agent

### 2.1 核心文件

- **入口**: `realtime/src/agent.py` — 通过 `AGENT_PIPELINE` 环境变量选择 pipeline
- **主体**: `realtime/src/agent_common.py` (~1700 行) — 单一 `Assistant` 类
- **System Prompt**: `realtime/src/base.md` (155 行) — 含页面模式 (camera/session/home)

### 2.2 双 Pipeline 架构

**Pipeline 1: Gemini Realtime (主力)**

`agent_gemini.py` — 原生音频 + 视频流

- 模型: `gemini-2.5-flash-native-audio`
- 特性: 端到端语音理解，无需 STT/TTS 管线
- Session 恢复: Redis 缓存 Gemini session token，断线重连时恢复上下文

**Pipeline 2: STT-LLM-TTS (备选)**

`agent_llm.py` — 分段管线

- STT: Deepgram Nova-3
- LLM: OpenAI GPT-4o-mini
- TTS: Cartesia Sonic-3
- 手动帧采样处理视频输入

### 2.3 架构设计

单一 `Assistant` 类继承 `livekit.agents.Agent`，所有工具通过 `@function_tool` 装饰器内联定义。未做模块化拆分——所有逻辑集中在 `agent_common.py` 中。

### 2.4 工具列表

**前端控制 (RPC 调用用户端)**

| 工具 | 功能 |
|------|------|
| `rpc_b2f_take_photo()` | 拍照 |
| `rpc_b2f_capture_and_upload()` | 拍照并上传 S3 |
| `rpc_b2f_set_chat_text(text)` | 设置聊天文本 |
| `rpc_b2f_get_chat_content()` | 获取聊天内容 |
| `rpc_b2f_show_action_card(title, options)` | 显示可点击选项卡 |
| `rpc_b2f_show_result(result_type, content)` | 展示富内容 |
| `rpc_b2f_navigate_to(page)` | 页面导航 |
| `rpc_b2f_zoom(level)` | 缩放控制 |
| `rpc_b2f_switch_camera(camera)` | 切换摄像头 |

**状态推送 (DataChannel 异步)**

| 工具 | 功能 |
|------|------|
| `update_info_bar(status, message)` | Agent 状态指示器 |
| `suggest_action(icon, label)` | 快门按钮建议 |
| `send_conversation_summary(summary)` | 预发布会话摘要 |
| `send_intention_prompt(intention)` | 意图展示 |

**Gateway 委托 (RPC 调用 Gateway)**

| 工具 | 功能 |
|------|------|
| `rpc_b2g_dispatch_message(text, action, reply_hint)` | 通用任务派发 |
| `rpc_b2g_deep_research(query)` | 多源深度研究 |
| `rpc_b2g_create_websites(prompt)` | 生成完整 HTML 网站 |
| `rpc_b2g_create_docs(prompt)` | 生成文档/报告 |
| `rpc_b2g_create_slides(prompt)` | 生成演示文稿 |
| `rpc_b2g_create_sheets(prompt)` | 生成电子表格 |
| `rpc_b2g_query_task(query)` | 查询任务状态 |
| `rpc_b2g_update_memory(memory)` | 静默更新记忆 |

### 2.5 Session 生命周期

**Room 命名**: `vi-room-{vi_user_id}` — 每个用户一个房间

**连接流程**:
1. 用户连接 LiveKit Room
2. Agent 加入，从 Redis 加载缓存 context 实现快速问候 (~500ms)
3. Gateway 按需邀请 — 通过 HTTP `/join` 接口

**Heartbeat (每 10 秒)**:
- 修剪对话历史 (最多 20 轮)
- 检测过期任务
- 触发空闲关闭检测

**自动关闭**:
- 5 分钟无用户活动
- 10 分钟 Agent 无输出
- 30 分钟总时长上限

### 2.6 通信通道

**DataChannel Topics**:

| Topic | 用途 |
|-------|------|
| `agent_info_bar` | Agent 状态条 |
| `agent_transcript` | 转录文本 |
| `agent_result` | 结果推送 |
| `agent_summary` | 会话摘要 |
| `agent_intention` | 意图显示 |
| `agent_action` | 操作建议 |
| `session_header` | Session 头信息 |
| `task_events` | 任务事件 |
| `vi-gateway` | Gateway 数据流 |

**RPC 接口**:
- `rpcF2BSendMessage` — 前端 -> Agent 的文本消息
- `rpcG2BSendReply` — Gateway -> Agent 的回复

---

## 3. vi-gateway：执行引擎

### 3.1 核心文件

`gateway/plugin/src/` 目录下 7 个文件:
- `gateway-service.ts` — 主服务，LiveKit Room 管理，任务路由
- `executor-selector.ts` — Executor 选择策略
- `executors/types.ts` — Adapter 接口定义
- `executors/gemini-flash-executor.ts` — Gemini Flash 适配器
- `executors/nanoclaw-executor.ts` — NanoClaw (Claude) 适配器
- `executors/index.ts` — Executor 注册

### 3.2 ExecutionAdapter 接口

```typescript
interface ExecutionAdapter {
  id: string;              // 'gemini-flash' | 'nanoclaw'
  name: string;
  location: 'cloud';
  capabilities: ExecutorCapabilities;
  status(): Promise<ExecutorStatus>;
  execute(request: TaskRequest): AsyncGenerator<TaskChunk>;
  abort(taskId: string): Promise<void>;
}
```

### 3.3 两个 Executor

| Executor | 模型 | Context | 延迟 | 擅长 |
|----------|------|---------|------|------|
| **GeminiFlashAdapter** | `gemini-2.5-flash` | 1M tokens | 快 | HTML 生成，格式化，总结 |
| **NanoClawAdapter** | `claude-sonnet-4-6` | 200K tokens | 中 | 深度分析，研究，多步推理 |

### 3.4 Executor 选择策略

`ExecutorSelector` 采用级联路由:

1. **executorHint** — 用户/Agent 明确指定
2. **priority 映射** — `fast` -> Gemini Flash, `thorough`/`code` -> NanoClaw
3. **环境变量** — `VI_DEFAULT_EXECUTOR` 覆盖默认值
4. **Fallback** — 选择第一个在线的 Executor

### 3.5 GatewayService 行为

**Room 管理**:
- 按需懒加入 LiveKit Room
- 5 分钟空闲自动断开

**RPC 入口**: `dispatch_task` — 接收 `TaskRequest`，路由到 Executor，流式返回 chunks

**输出处理**:
- 模块检测: 缓冲初始 chunks，检测 JSON 结构，输出结构化模块或 HTML
- HTML 清理: 剥离 script 标签，优化媒体加载 (前 2 张图片高优先级，其余 lazy-load)
- S3 URL 转换: `s3://bucket/key` -> `https://bucket.s3.amazonaws.com/key`
- 自动 Fallback: 主 Executor 失败时尝试其他适配器

**记忆持久化**: 提取输出中的 `memory_updates`，POST 到 api-server `/api/internal/memories/batch`

### 3.6 输出类型 (TaskChunk)

| type | 说明 |
|------|------|
| `progress` | 进度 (step/total/message) |
| `html_stream` | 流式 HTML 内容 |
| `text_stream` | 流式文本 |
| `module` | 结构化 JSON (8 种原生模块) |
| `result` | 最终摘要 |
| `error` | 错误 (含 recoverable 标志) |

### 3.7 HTTP 端点

| 端点 | 用途 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /executors` | 列出可用 Executor |
| `POST /join` | 加入 LiveKit Room |
| `POST /leave` | 离开 Room |

---

## 4. api-server：数据与记忆

### 4.1 数据库模型

**User**:
- `email`, `password_hash` — 邮箱密码登录
- `vi_user_id` — VI 统一用户 ID
- `display_name` — 显示名

**Session**:
- `room_name` — LiveKit 房间名
- `prompt`, `title`, `intention` — 任务描述
- `executor` — 使用的执行器
- `status` — 状态 (dispatched/completed/failed)
- `result`, `result_html` — 结果内容
- `timeline`, `artifacts` — 时间线与产物
- `memory_updates` — 关联的记忆更新

**AgentMemory**:
- `layer` — identity / semantic / episodic
- `category` — 分类标签
- `filename` — 逻辑文件名
- `content` — 记忆内容
- `importance` — 重要性评分 (0-1)
- `access_count` — 被加载次数
- `source` — 来源 (agent/user/system/cron)

### 4.2 认证机制

**双模式认证**:

1. **JWT 模式**: 邮箱+密码注册/登录，返回 JWT token
2. **设备模式**: 匿名访问，通过 `X-Device-Id` header 自动创建用户 (`vi-{device_id[:16]}`)

### 4.3 路由结构

**公开路由**:

| 路由 | 功能 |
|------|------|
| `/api/auth` | signup, login, /me |
| `/api/users` | Session CRUD (JWT + 设备认证) |
| `/api/livekit` | Room 管理 |
| `/api/upload` | S3 文件上传 |
| `/api/events` | SSE 流 (Redis pub/sub) |

**内部路由** (`/api/internal`, `X-Internal-Token` 保护):

| 路由 | 功能 |
|------|------|
| Session 生命周期 | create, dispatch, complete, fail, update, end |
| Memory 管理 | create, upsert, batch, context, session-end, heartbeat |
| Gateway 代理 | /gateway/join |
| S3 预签名 | /s3/presign-get |

### 4.4 三层记忆金字塔

```
            ┌───────────────────┐
            │  Identity Layer    │  ← SOUL.md, USER.md
            │  权重: 2.0         │     极少变化, 始终最重要
            └─────────┬─────────┘
                      │
         ┌────────────▼────────────┐
         │   Semantic Memory        │  ← MEMORY.md, 偏好
         │   权重: 1.5              │     提炼的知识
         └────────────┬────────────┘
                      │
    ┌─────────────────▼─────────────────┐
    │       Episodic Memory              │  ← memory/YYYY-MM-DD.md
    │       权重: 1.0                     │     Session 摘要, 日志
    └─────────────────┬─────────────────┘
                      │
  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ▼ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  │    Working Memory (不存储, 动态计算)    │  ← 每次推理前按重要性选取
  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

### 4.5 ImportanceScorer 算法

```python
score = layer_weight × 0.40 + recency × 0.30 + frequency × 0.15 + source_weight × 0.15
```

各因子:
- **layer_weight**: identity=2.0, semantic=1.5, episodic=1.0
- **recency**: 指数衰减，168 小时 (一周) 半衰期
- **frequency**: `access_count / 20`，封顶 1.0
- **source_weight**: user=1.5, agent=1.0, cron=0.8, system=0.6

### 4.6 Working Memory 计算

`get_context_for_agent(user_id, max_chars=3000)`:

1. 获取用户所有记忆
2. 计算每条记忆的 importance 评分
3. 按 importance 降序排列
4. 贪心填充字符预算 (默认 3000 字符)
5. 格式化为 Agent 可读文本，按 layer 分节

Working Memory 不是存储层——是每次推理前从三层记忆中动态选取的结果。

### 4.7 记忆生命周期

```
用户交互 → Session 进行中
  │
  ▼
Session 结束
  → 自动生成摘要 → Episodic Memory (memory/YYYY-MM-DD.md)
  │
  ▼
Heartbeat 维护
  → 扫描近期 Episodic → 提炼 Semantic Memory
  → 清理过期记忆 → 更新 Importance Score
  │
  ▼
每次推理前
  → Working Memory 注入 (按 importance 贪心选取)
```

### 4.8 服务层

| 服务 | 职责 |
|------|------|
| **SessionCenter** | Session 生命周期管理 |
| **MemoryCenter** | 记忆 CRUD + 重要性评分 |
| **TokenService** | JWT 签发与验证 |
| **UserCenter** | 用户管理，密码哈希 |
| **EventPublisher** | Redis pub/sub SSE 推送 |

---

## 5. Frontend：四视图交互

### 5.1 视图结构

| 视图 | 文件 | 功能 |
|------|------|------|
| **LiveCameraView** | `LiveCameraView.jsx` | 实时摄像头，观察卡片，拍照流程 |
| **LiveSessionView** | `LiveSessionView.jsx` | Canvas 画布优先的产物展示 |
| **HistoryView** | `HistoryView.jsx` | Session 网格，缩略图 |
| **MemoryView** | `MemoryView.jsx` | 记忆管理 UI |

### 5.2 Canvas-First 架构 (LiveSessionView)

核心设计理念：**产物是主角，对话是配角**。

- **产物区域**: HTML 块 + 原生模块占据主视野
- **对话区域**: 浮动气泡，仅显示最近 5 条消息
- **Gateway 块**: 按 `task_id` 追踪生命周期: loading -> streaming -> done/error
- **Session 缓存**: 最多 10 个 Session 条目，跨导航保持状态

### 5.3 PersistentHtmlRenderer — 流式 HTML 渲染

关键创新点：单一预热 iframe，避免重复创建。

- 每个 Session 一个 iframe，Tailwind CDN 预加载
- `postMessage` 桥接实现 O(1) HTML 追加 (无需重新解析)
- `ResizeObserver` 动态调整高度

### 5.4 模块系统

`components/modules/` 目录下 8 种原生 React 模块:

| 模块 | 说明 |
|------|------|
| `place_card` | 地点卡片 |
| `weather` | 天气信息 |
| `checklist` | 清单 |
| `comparison` | 对比表 |
| `recipe` | 食谱 |
| `steps_guide` | 步骤指南 |
| `info_card` | 信息卡片 |
| `image_gallery` | 图片画廊 |

共享 glassmorphism 设计元素 (GlassCard, GlassButton, GlassChip 等)，Suspense 懒加载，每模块独立错误边界。

### 5.5 iframeDesignSystem.js — HTML iframe CSS 令牌

为 LLM 生成的 HTML 提供统一视觉风格:

- 玻璃效果: `rgba(255,255,255,0.04)` 背景, `blur(20px)`
- 主色: 紫色 `#a855f7`
- 响应式排版: `clamp()` 函数
- LLM 可用工具类: `.vi-card`, `.vi-section`, `.vi-chip`, `.vi-btn`

### 5.6 useAgentProtocol.js (808 行) — LiveKit 协议层

**RPC 方法**: `rpcB2F*` 系列 — Agent 调用前端

**DataChannel Topics**:

| Topic | 方向 | 用途 |
|-------|------|------|
| `vi-agent` | Agent -> Frontend | Agent 直接推送 |
| `vi-gateway` | Gateway -> Frontend | Gateway 数据流 |
| `gateway_html_stream` | Gateway -> Frontend | HTML 流 |
| `gateway_text_stream` | Gateway -> Frontend | 文本流 |
| `task_progress` | Gateway -> Frontend | 任务进度 |
| `task_events` | Agent -> Frontend | 任务事件 |
| `session_header` | Agent -> Frontend | Session 信息 |
| `memory_updated` | Agent -> Frontend | 记忆更新通知 |

**工具调用过滤**: 自动剥离 Gemini function call 噪声，保持转录文本干净。

### 5.7 API Client (services/api.js)

- 双模式认证: JWT token + 设备匿名
- S3 上传管线: 3 次重试，指数退避
- Session 和 Memory CRUD 封装

---

## 6. 基础设施

### 6.1 Docker Compose 服务

```
docker-compose.yml
├── frontend         — React SPA (:5173 dev)
├── api-server       — FastAPI (:8000)
├── vi-realtime      — LiveKit Agent (Python)
├── vi-gateway       — Gateway (Node.js)
├── postgres         — PostgreSQL 16 (:5432)
└── redis            — Redis 7 (:6379)
```

### 6.2 外部服务

| 服务 | 用途 |
|------|------|
| **LiveKit Cloud** | WebRTC 房间，音视频轨道，DataChannel，RPC |
| **AWS S3** | 照片/文件存储，预签名 URL |
| **Gemini API** | 实时语音视觉 (vi-realtime)，HTML 生成 (vi-gateway) |
| **Anthropic API** | Claude 深度推理 (vi-gateway NanoClaw) |
| **Deepgram** | STT (备选 Pipeline) |
| **Cartesia** | TTS (备选 Pipeline) |

### 6.3 PostgreSQL 核心表

```
users              — 用户信息 (email, vi_user_id, display_name)
sessions           — Session 记录 (room_name, prompt, status, result, timeline)
agent_memories     — 三层记忆 (layer, category, filename, content, importance)
```

### 6.4 Redis 用途

| 用途 | TTL |
|------|-----|
| Session context 缓存 | 30 天 |
| Gemini session resumption token | 会话级 |
| SSE pub/sub (per user) | 实时 |

---

## 7. 通信矩阵

```
               Realtime    Gateway    API Server   Frontend
Realtime       ---         RPC        HTTP         DataChannel + RPC
Gateway        RPC         ---        HTTP         DataChannel
API Server     HTTP        HTTP       ---          REST + SSE
Frontend       DC + RPC    DC         REST + SSE   ---
```

**协议说明**:
- **RPC**: LiveKit RPC，双向，同步请求/响应
- **DataChannel**: LiveKit DataChannel，单向推送，按 topic 分流
- **HTTP**: 标准 REST 调用
- **SSE**: Server-Sent Events，Redis pub/sub 驱动，用于实时事件推送

---

## 8. 关键环境变量

### vi-realtime

| 变量 | 说明 |
|------|------|
| `AGENT_PIPELINE` | Pipeline 选择 (gemini / llm) |
| `AGENT_NAME` | Agent 名称 |
| `GATEWAY_URL` | Gateway HTTP 地址 |
| `REDIS_URL` | Redis 连接 |
| `API_BASE_URL` | API Server 地址 |
| `INTERNAL_API_TOKEN` | 内部 API 认证 token |
| `GEMINI_REALTIME_MODEL` | Gemini 实时模型名 |
| `GEMINI_REALTIME_VOICE` | Gemini 语音选择 |

### vi-gateway

| 变量 | 说明 |
|------|------|
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit 连接 |
| `API_BASE_URL` | API Server 地址 |
| `GOOGLE_API_KEY` | Gemini Flash API |
| `ANTHROPIC_API_KEY` | Claude API |
| `VI_DEFAULT_EXECUTOR` | 默认 Executor |
| `GATEWAY_HTTP_PORT` | HTTP 端口 |
| `GATEWAY_IDLE_TIMEOUT_MS` | 空闲超时 (ms) |

### api-server

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接 |
| `REDIS_URL` | Redis 连接 |
| `JWT_SECRET` | JWT 签名密钥 |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit 连接 |
| `CORS_ORIGINS` | CORS 允许域名 |

---

## 9. 典型用户流程

```
用户打开 App → 连接 LiveKit Room (vi-room-{vi_user_id})
  │
  ▼
vi-realtime 加入 Room
  → Redis 加载缓存 context (~500ms 快速问候)
  → Memory Center 注入记忆: "嗨! 我记得你上次在研究竞品..."
  │
  ▼
用户语音: "帮我把那个分析做成 HTML 报告"
  → Gemini Live 理解意图
  → 调用 rpc_b2g_create_docs(prompt)
  → HTTP /join 邀请 Gateway 进入 Room
  │
  ▼
vi-gateway 接收 dispatch_task
  → ExecutorSelector: priority=fast → Gemini Flash
  → 流式生成 HTML → DataChannel 推送到 Frontend
  → PersistentHtmlRenderer 实时渲染
  │
  ▼
任务完成
  → Gateway 提取 memory_updates → POST /api/internal/memories/batch
  → Session 状态: completed
  │
  ▼
Session 结束
  → api-server 自动生成 Episodic Memory
  → 下次见面时 Agent 记得这次交互
```

---

## 10. 未来方向

以下为潜在扩展方向，目前未实现:

- **多渠道接入**: Slack / Telegram 等文本渠道，需要时构建
- **主动性引擎**: Cron 定时任务、Heartbeat 检查、事件触发器
- **向量搜索**: pgvector 语义检索记忆，当记忆量增长时启用
- **本地 Executor**: Claude Code 本地执行器，通过隧道连接

---

*VI Agent System Architecture | 2026-03-02*
