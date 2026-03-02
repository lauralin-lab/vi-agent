# VI Agent

> **Personal Intelligence in Your Camera** — 一个视觉 AI 智能体，住在你的相机里，看见你所看见的，预测你所需要的，并在数秒内交付结构化内容。

## 产品概述

VI Agent 是一个以**相机为入口**的全栈 AI 助手。核心交互范式是 **"会说话的相机"**：用户无需打字描述需求，只需将相机对准任何事物，AI 即可通过实时语音 + 视觉理解，预测用户意图并主动交付丰富的内容产物（HTML 页面、信息卡片、清单等）。

**核心交互循环：**
```
输入 [视觉 + 意图]  →  Agent 理解  →  输出 [结构化产物]  →  成长 [记忆 + 技能]
```

**设计理念：**
- **预测，不询问** — 总是先给出具体的预测结果，而非问"你想做什么？"
- **确认，不选择** — 用户只需说"对/不对"，而非从一堆选项中选择
- **相机时间 = 思考时间** — 用户看相机的时间就是 AI 处理的时间

---

## 系统架构

### 三脑系统（受认知科学启发）

| 系统 | 类人脑类比 | 实现 | 响应速度 |
|------|-----------|------|---------|
| **System 1** 直觉反应 | 快速直觉 | Gemini Live 实时语音+视觉 (`vi-realtime`) | 毫秒级 |
| **System 2** 深度思考 | 深度推理 | 多模型执行引擎 (`vi-gateway`) | 秒到分钟 |
| **System 3** 长期记忆 | 长期记忆 | 三层记忆金字塔 (`api-server`) | 跨会话持久 |

### 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Frontend (React/Vite)                      │
│              Camera / Session / History / Memory 四视图              │
└──────┬────────────────────┬────────────────────┬─────────────────┘
       │ WebRTC (LiveKit)   │ REST API           │ SSE (Redis)
       ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  vi-realtime │    │  api-server  │    │    Redis 7   │
│ (Gemini Live)│    │  (FastAPI)   │◄──►│   Pub/Sub    │
└──────┬───────┘    └──────┬───────┘    └──────────────┘
       │ LiveKit RPC        │
       ▼                    ▼
┌──────────────┐    ┌──────────────┐
│  vi-gateway  │    │ PostgreSQL 16│
│ (Claude/     │    │   用户/会话   │
│  Gemini)     │    │   /记忆存储   │
└──────────────┘    └──────────────┘
```

### 四个服务

| 服务 | 技术栈 | 职责 | 端口 |
|------|--------|------|------|
| **api-server** | Python / FastAPI / SQLAlchemy | 用户认证、会话管理、三层记忆系统、文件存储、SSE 事件流 | 8000 |
| **vi-realtime** | Python / LiveKit Agents SDK | 实时语音+视觉 AI 代理，工具调用，前端控制 | — (LiveKit) |
| **vi-gateway** | TypeScript / Node.js / Express | 复杂任务执行，LLM 路由（Claude / Gemini），HTML/模块流式输出 | 18789 |
| **frontend** | React 19 / Vite 7 / Tailwind 4 | 相机/会话/历史/记忆四视图界面，LiveKit 客户端 | 5173 (dev) |

### 通信协议

| 源 → 目标 | 协议 | 用途 |
|-----------|------|------|
| Frontend ↔ vi-realtime | LiveKit RPC + DataChannel | 实时双向交互（语音、视频、RPC 调用） |
| Frontend ↔ vi-gateway | LiveKit DataChannel | 任务结果流式传输（HTML/模块） |
| Frontend → api-server | HTTP REST | 认证、会话 CRUD、记忆管理 |
| Frontend ← api-server | SSE (Redis Pub/Sub) | 实时事件推送（会话更新、记忆变更） |
| vi-realtime → vi-gateway | HTTP + LiveKit RPC | 邀请 gateway 加入房间，派发任务 |
| vi-realtime → api-server | HTTP REST (Internal API) | 会话持久化、记忆写入 |
| vi-gateway → api-server | HTTP REST (Internal API) | 记忆批量更新 |

---

## 项目结构

```
vi-agent-team-version/
│
├── api-server/                    # 后端 API 服务
│   ├── app/
│   │   ├── main.py                #   FastAPI 入口，lifespan 管理
│   │   ├── config.py              #   配置（环境变量）
│   │   ├── models.py              #   SQLAlchemy 模型（User, Session, AgentMemory）
│   │   ├── deps.py                #   依赖注入（认证、数据库、Redis）
│   │   ├── routes/
│   │   │   ├── auth.py            #     /api/auth — 注册、登录、用户信息
│   │   │   ├── users.py           #     /api/users — 会话 CRUD
│   │   │   ├── memory.py          #     /api/users — 记忆管理（V2 + V3）
│   │   │   ├── events.py          #     /api/users/events — SSE 事件流
│   │   │   ├── livekit.py         #     /api/livekit — 房间管理、Token 生成
│   │   │   ├── upload.py          #     /api/upload — GCS 签名 URL 上传
│   │   │   └── internal.py        #     /api/internal — 服务间内部 API
│   │   └── services/
│   │       ├── memory_center.py   #     三层记忆 CRUD + 重要性评分
│   │       ├── session_center.py  #     会话生命周期管理
│   │       ├── token_service.py   #     JWT Token 编解码
│   │       ├── user_center.py     #     用户管理、密码哈希
│   │       ├── events.py          #     Redis Pub/Sub 事件发布
│   │       └── gcs_service.py     #     Google Cloud Storage 服务
│   ├── tests/                     #   55+ 自动化测试（内存 SQLite）
│   ├── Dockerfile
│   └── requirements.txt
│
├── realtime/                      # 实时语音+视觉 Agent
│   ├── src/
│   │   ├── agent.py               #   入口（Pipeline 选择）
│   │   ├── agent_common.py        #   核心 Assistant 类（1700+ 行，30+ 工具）
│   │   ├── agent_gemini.py        #   Pipeline 1: Gemini Realtime（原生音视频）
│   │   ├── agent_llm.py           #   Pipeline 2: STT→LLM→TTS
│   │   └── base.md                #   系统提示词
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
│
├── gateway/                       # AI 任务执行网关
│   └── plugin/
│       ├── src/
│       │   ├── main.ts            #   Express HTTP 服务 + GatewayService 初始化
│       │   ├── gateway-service.ts #   核心：房间管理、RPC 处理、任务执行（960 行）
│       │   └── executors/
│       │       ├── types.ts       #     接口定义（TaskRequest, TaskChunk, ExecutionAdapter）
│       │       ├── executor-selector.ts  # 执行器选择（优先级/提示/降级）
│       │       ├── gemini-flash-executor.ts  # Gemini 2.5 Flash（快速 HTML 生成）
│       │       └── nanoclaw-executor.ts      # Claude Sonnet（深度分析）
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
│
├── frontend/                      # React 前端应用
│   ├── src/
│   │   ├── App.jsx                #   根组件（视图状态机、认证、通知）
│   │   ├── components/
│   │   │   ├── LiveCameraView.jsx #     相机视图（实时 AI 观察卡）
│   │   │   ├── LiveSessionView.jsx#     会话视图（画布优先产物展示）
│   │   │   ├── HistoryView.jsx    #     历史视图（会话网格 + 搜索）
│   │   │   ├── MemoryView.jsx     #     记忆视图（三层记忆管理）
│   │   │   ├── PersistentHtmlRenderer.jsx  # 流式 HTML iframe 渲染器
│   │   │   └── modules/           #     8 个原生模块渲染器
│   │   ├── hooks/
│   │   │   ├── useAgentProtocol.js#     LiveKit RPC + DataChannel 协议（800 行）
│   │   │   ├── useRoomConnection.js#    LiveKit 房间连接管理
│   │   │   ├── useAuth.js         #     JWT + 设备认证
│   │   │   └── useRealtimeEvents.js#    SSE 事件处理
│   │   ├── services/
│   │   │   └── api.js             #     API 客户端（双认证、重试）
│   │   └── sounds/                #     音效引擎
│   ├── public/sounds/             #   30+ MP3 音效文件
│   ├── vite.config.js
│   ├── nginx.conf                 #   生产环境反向代理配置
│   └── Dockerfile
│
├── deploy/                        # GCE 部署脚本
│   ├── setup-gce.sh               #   GCE VM 初始化
│   ├── deploy.sh                  #   构建 + 部署
│   ├── setup-ssl.sh               #   Let's Encrypt SSL
│   └── setup-domain.sh            #   域名配置
│
├── tests/                         # QA 测试系统
│   ├── qa/                        #   Agent 驱动的 QA 测试文档
│   │   ├── backend-qa.md          #     后端 API 全量测试（38 端点，9 套件）
│   │   ├── browser-qa.md          #     浏览器 UI 全量测试（54 测试，10 套件）
│   │   ├── agent-realtime-qa.md   #     实时 Agent E2E 测试
│   │   ├── agent-gemini-flash-qa.md#    Gemini Flash 执行器 E2E
│   │   └── agent-nanoclaw-qa.md   #     NanoClaw 执行器 E2E
│   └── reports/                   #   测试报告输出
│
├── prompts/                       # Agent 系统提示词（便于迭代）
│   └── vi-livekit-agent.md        #   LiveKit Agent 完整提示词
│
├── docs/                          # 产品与系统文档
│   ├── product.md                 #   产品文档（愿景、设计原则、用户旅程）
│   └── system_v3.md               #   V3 系统架构文档
│
├── docker-compose.yml             # 全栈 Docker 编排（6 个服务）
├── dev.sh                         # 本地一键启动脚本
├── .env.example                   # 环境变量模板
├── SETUP.md                       # 详细配置指南
└── CONTRIBUTING.md                # 贡献指南
```

---

## 快速开始

### 前置条件

| 工具 | 版本要求 | 安装方式 |
|------|---------|---------|
| Python | 3.11+ | `brew install python@3.11` |
| Node.js | 20+ | `brew install node` |
| uv | 最新 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| PostgreSQL | 16 | `brew install postgresql@16` |
| Redis | 7+ | `brew install redis` |
| Docker (可选) | 最新 | [docker.com](https://www.docker.com) |

### 获取 API Keys

| Key | 服务 | 获取地址 | 必须？ |
|-----|------|---------|--------|
| `LIVEKIT_API_KEY` + `SECRET` | LiveKit Cloud | [cloud.livekit.io](https://cloud.livekit.io) → 项目设置 → Keys | 是 |
| `LIVEKIT_URL` | LiveKit Cloud | 项目页面上的 WebSocket URL | 是 |
| `GOOGLE_API_KEY` | Google AI Studio | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | 是 |
| `ANTHROPIC_API_KEY` | Anthropic Console | [console.anthropic.com](https://console.anthropic.com/settings/keys) | 是 |
| `JWT_SECRET` | 自行生成 | `openssl rand -hex 32` | 是（生产） |

### 方式一：本地开发（推荐）

```bash
# 1. 克隆仓库
git clone <repo-url> && cd vi-agent-team-version

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入上面获取的 API Keys

# 3. 一键启动所有服务
./dev.sh
```

启动后访问：

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| API 服务器 | http://localhost:8000 |
| API 文档 (Swagger) | http://localhost:8000/docs |

### 方式二：手动逐服务启动

```bash
# 1. 基础设施
brew services start redis
brew services start postgresql@16
createdb vi_db 2>/dev/null

# 2. API 服务器（终端 1）
cd api-server
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 3. vi-realtime（终端 2）
cd realtime
uv sync
uv run python src/agent.py dev

# 4. vi-gateway（终端 3）
cd gateway/plugin
npm install
npm run start

# 5. 前端（终端 4）
cd frontend
npm install
npx vite --host
```

### 方式三：Docker Compose

```bash
# 确保 .env 已配置
docker compose up --build
```

Docker 模式下端口：前端 `80`/`443`，API `8000`，PostgreSQL `5432`，Redis `6379`。

---

## 技术栈速查

### 后端 (api-server)

| 层 | 技术 |
|----|------|
| Web 框架 | FastAPI 0.115 |
| ASGI 服务器 | Uvicorn |
| 数据库 | PostgreSQL 16 (asyncpg) |
| ORM | SQLAlchemy 2.0 (async) |
| 认证 | PyJWT (HS256) + 设备匿名认证 |
| 缓存/消息 | Redis 7 (Pub/Sub, 缓存) |
| 限流 | slowapi |
| 文件存储 | Google Cloud Storage (签名 URL) |
| 数据校验 | Pydantic 2.10 |

### 实时服务 (realtime)

| 层 | 技术 |
|----|------|
| Agent 框架 | LiveKit Agents SDK 1.3 |
| Pipeline 1 (主) | Gemini Live 2.5 Flash（原生音视频） |
| Pipeline 2 (备) | Deepgram STT → OpenAI GPT → Cartesia TTS |
| 噪音消除 | Silero VAD + LiveKit 噪音消除插件 |
| 包管理 | uv |

### 执行网关 (gateway)

| 层 | 技术 |
|----|------|
| 运行时 | Node.js 22 + tsx |
| HTTP 框架 | Express 4.18 |
| 执行器 1 | Gemini 2.5 Flash（快速 HTML 生成） |
| 执行器 2 | Claude Sonnet 4.6（深度分析） |
| 实时通信 | @livekit/rtc-node |
| 语言 | TypeScript (strict mode) |

### 前端 (frontend)

| 层 | 技术 |
|----|------|
| UI 框架 | React 19 (JSX, 无 TypeScript) |
| 构建工具 | Vite 7.3 |
| CSS | Tailwind CSS 4 |
| 动画 | Framer Motion 12 |
| 图标 | Lucide React |
| 实时通信 | LiveKit Client SDK |
| 状态管理 | React Hooks (无外部库) |
| 路由 | 手动视图状态机（无 router 库） |

---

## 核心概念

### 数据模型

**三个核心模型（`api-server/app/models.py`）：**

- **User** — 用户账户，支持邮箱注册 + 设备匿名认证
- **Session** — 一次 AI 交互会话，包含提示词、意图、执行器、结果产物、时间线
- **AgentMemory** — 三层记忆金字塔：
  - `identity` — 身份层（SOUL.md, USER.md），权重 2.0
  - `semantic` — 语义层（偏好、知识），权重 1.5
  - `episodic` — 情景层（每日会话摘要），权重 1.0

### 产物系统

Agent 有两种输出路径：

1. **HTML 产物** — 通过 `PersistentHtmlRenderer` 组件流式渲染，预热 iframe + Tailwind CSS
2. **原生模块** — 8 种结构化 React 组件，具有一致的毛玻璃设计风格：

| 模块 | 用途 |
|------|------|
| `place_card` | 餐厅/地点卡片 |
| `weather` | 天气预报 |
| `checklist` | 交互式待办清单 |
| `comparison` | 并排对比 |
| `recipe` | 烹饪步骤 |
| `steps_guide` | 分步指南 |
| `info_card` | 信息卡片 |
| `image_gallery` | 图片集 |

### 认证系统

双重认证机制：

1. **JWT Bearer Token** — 邮箱注册/登录后获取，24h 有效期
2. **设备匿名认证** — 通过 `X-Device-Id` 头和 `vi_user_id` 参数，自动创建匿名用户

内部服务间通信使用 `X-Internal-Token` 头认证。

### Gateway 执行器选择

任务路由到合适的 LLM 通过四步级联：

```
executorHint（显式指定）→ priority 映射（fast/thorough/code）→ 环境变量默认值 → 第一个在线执行器
```

---

## API 端点概览

### 公开端点

| 路径 | 方法 | 用途 |
|------|------|------|
| `/api/auth/signup` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/livekit/token` | POST | 获取 LiveKit Token（已认证） |
| `/api/livekit/anonymous` | POST | 获取 LiveKit Token（匿名） |
| `/api/upload/presign` | GET | 获取 GCS 签名上传 URL |
| `/api/users/sessions` | GET | 列出用户会话 |
| `/api/users/sessions/{id}` | DELETE | 删除会话 |
| `/api/users/memories` | GET | 列出所有记忆（可按 layer 过滤） |
| `/api/users/memories/{id}` | GET/PUT/DELETE | 记忆 CRUD |
| `/api/users/memories/context` | GET | 获取计算后的工作记忆 |
| `/api/users/events` | GET | SSE 事件流 |
| `/health` | GET | 健康检查 |

完整 API 文档启动服务后访问 http://localhost:8000/docs (Swagger UI)。

---

## 测试

### API 服务器单元测试（55+ 测试）

```bash
cd api-server

# 首次设置
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install pytest pytest-asyncio httpx aiosqlite

# 运行全部测试
.venv/bin/python -m pytest tests/ -v

# 运行特定类别
.venv/bin/python -m pytest tests/test_auth.py -v            # 认证测试（12）
.venv/bin/python -m pytest tests/test_integration.py -v      # 集成测试（14）
.venv/bin/python -m pytest tests/test_memory_center.py -v    # 记忆中心测试
```

测试使用内存 SQLite，**无需** PostgreSQL 或 Redis。

### 实时服务测试

```bash
cd realtime
uv sync
uv run python -m pytest tests/ -v
```

测试 mock 所有 LiveKit 依赖，**无需**外部服务。

### QA 测试系统

`tests/qa/` 目录包含 Agent 驱动的全量 QA 测试文档，由 Claude Code 读取并执行：

| 文件 | 覆盖范围 |
|------|---------|
| `backend-qa.md` | 后端 38 个端点、9 个测试套件 |
| `browser-qa.md` | 浏览器 54 个测试、10 个套件 |
| `agent-realtime-qa.md` | 实时 Agent E2E |
| `agent-gemini-flash-qa.md` | Gemini Flash 执行器 E2E |
| `agent-nanoclaw-qa.md` | NanoClaw 执行器 E2E |

---

## 环境变量参考

### 必需变量

| 变量 | 用于 | 说明 |
|------|------|------|
| `LIVEKIT_URL` | 全部 | LiveKit WebSocket URL (`wss://...`) |
| `LIVEKIT_API_KEY` | 全部 | LiveKit API Key |
| `LIVEKIT_API_SECRET` | 全部 | LiveKit API Secret |
| `GOOGLE_API_KEY` | realtime, gateway | Gemini API Key |
| `ANTHROPIC_API_KEY` | gateway | Claude API Key |

### API 服务器

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `postgresql+asyncpg://localhost:5432/vi_db` | PostgreSQL 连接字符串 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接字符串 |
| `JWT_SECRET` | `change-this-...` | JWT 签名密钥（**生产必须修改**） |
| `JWT_ALGORITHM` | `HS256` | JWT 签名算法 |
| `JWT_EXPIRE_MINUTES` | `1440` | Token 有效期（分钟） |
| `CORS_ORIGINS` | `http://localhost:5173,...` | 允许的跨域来源 |
| `INTERNAL_API_TOKEN` | `vi-internal-dev-token` | 内部 API 认证 Token |
| `GCS_BUCKET` | `vi-uploads` | GCS 存储桶名 |

### 前端

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_URL` | `http://localhost:8000` | API 服务器地址 |
| `VITE_LIVEKIT_URL` | — | LiveKit WebSocket URL |

### Docker Compose 额外变量

| 变量 | 说明 |
|------|------|
| `POSTGRES_USER` | PostgreSQL 用户名 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 |
| `POSTGRES_DB` | 数据库名 |
| `REDIS_PASSWORD` | Redis 密码 |

完整变量模板见 `.env.example`。

---

## 部署

### Docker Compose 生产部署

```bash
# 1. 配置 .env（使用强密码和正式 API Keys）
cp .env.example .env
vim .env

# 2. 构建并启动
docker compose up --build -d

# 3. 检查健康
curl http://localhost:8000/health
```

### GCE 部署

详见 `deploy/README.md`。核心步骤：

```bash
# VM 初始化
./deploy/setup-gce.sh

# 部署应用
./deploy/deploy.sh

# 配置 SSL
./deploy/setup-ssl.sh

# 配置域名
./deploy/setup-domain.sh
```

预估成本：GCE e2-medium ~$25/月 + LiveKit ~$0.01/分钟 + API 调用费用。

---

## 开发工作流

### 分支策略

- `main` — 稳定主分支
- `feature/*` — 功能开发分支
- `fix/*` — Bug 修复分支

### 代码规范

- **Python**: PEP 8, ruff 格式化（line-length 88）
- **TypeScript**: strict mode, ESLint
- **React/JSX**: ESLint + React Hooks 规则
- **CSS**: Tailwind CSS 工具类优先

### 提交前检查

```bash
# API Server
cd api-server && .venv/bin/python -m pytest tests/ -v

# Frontend
cd frontend && npm run lint

# Gateway
cd gateway/plugin && npm run type-check
```

详细贡献指南见 `CONTRIBUTING.md`。

---

## 文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| 配置指南 | `SETUP.md` | API Keys 获取、本地/Docker 启动、测试、环境变量、故障排除 |
| 贡献指南 | `CONTRIBUTING.md` | 分支策略、Worktree 工作流、PR 流程、代码规范 |
| 产品文档 | `docs/product.md` | 产品愿景、设计原则、用户旅程、产物系统、经济模型 |
| 系统架构 | `docs/system_v3.md` | V3 四服务架构、通信矩阵、完整环境变量、典型用户流 |
| 部署指南 | `deploy/README.md` | GCE 部署、SSL、域名配置 |
| Gateway 详解 | `gateway/plugin/AGENTS.md` | Gateway 项目知识库（执行器、协议、代码细节） |
| QA 测试系统 | `tests/qa/README.md` | QA 架构、测试执行方法、评判标准 |
| 提示词管理 | `prompts/README.md` | Agent 提示词索引和同步方法 |

---

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| `GOOGLE_API_KEY not set` → vi-realtime 跳过 | 确认 `.env` 中有 `GOOGLE_API_KEY`，可用 `curl` 验证 Key |
| 登录提示 `Invalid credentials` | 确认 PostgreSQL 运行中且 `vi_db` 已创建 |
| LiveKit Token 错误 | 检查 `LIVEKIT_API_KEY` 和 `LIVEKIT_API_SECRET` 是否来自同一项目 |
| 前端无法连接 API | 检查 `VITE_API_URL`，dev 模式下 Vite 代理 `/api` 到 `localhost:8000` |
| vi-gateway 不处理任务 | 确认 `ANTHROPIC_API_KEY` 和 `GOOGLE_API_KEY` 已设置，检查 gateway 日志 |
| SSE 事件不推送 | 确认 Redis 运行中；Redis 不可用时 SSE 自动降级但 API 仍可用 |
