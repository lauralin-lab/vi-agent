# OpenClaw Gateway 通讯协议规范

> 版本: Protocol Version 3  
> 最后更新: 2026-02-04

---

## 目录

1. [概述](#1-概述)
2. [传输层](#2-传输层)
3. [消息帧结构](#3-消息帧结构)
4. [连接握手流程](#4-连接握手流程)
5. [RPC 方法](#5-rpc-方法)
6. [事件类型](#6-事件类型)
7. [数据模型](#7-数据模型)
8. [错误处理](#8-错误处理)
9. [安全机制](#9-安全机制)
10. [心跳与重连](#10-心跳与重连)

---

## 1. 概述

OpenClaw Gateway 是一个基于 WebSocket 的双向通讯协议，用于客户端（iOS、Android、macOS、Web等）与 Gateway 服务器之间的实时通信。协议采用 JSON 格式进行数据交换，支持 RPC 调用和服务器推送事件。

### 1.1 核心特性

- **双向通信**: 支持客户端请求和服务器推送
- **RPC 模式**: 请求-响应模式的远程过程调用
- **事件推送**: 服务器主动推送事件通知
- **设备认证**: 基于公私钥的设备身份验证
- **心跳保活**: 定期心跳检测连接状态
- **断线重连**: 自动重连与指数退避

### 1.2 协议版本

```
PROTOCOL_VERSION = 3
```

客户端在连接时声明支持的协议版本范围，服务器选择双方都支持的版本。

---

## 2. 传输层

### 2.1 连接地址

| 协议 | 默认端口 | 说明 |
|------|----------|------|
| `ws://` | 18789 | 非加密连接（仅限本地） |
| `wss://` | 18789 | TLS加密连接 |

### 2.2 连接配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| maxPayload | 25 MB | 单条消息最大尺寸 |
| maxBufferedBytes | 由服务器配置 | 最大缓冲字节数 |
| tickIntervalMs | 30000 | 心跳间隔（毫秒） |

### 2.3 TLS 指纹验证

对于 `wss://` 连接，客户端可配置 TLS 证书指纹进行额外验证：

```
指纹格式: SHA256 十六进制字符串（去除冒号分隔符）
```

---

## 3. 消息帧结构

所有消息均为 JSON 格式，通过 `type` 字段区分消息类型。

### 3.1 消息类型概览

| type 值 | 名称 | 方向 | 说明 |
|---------|------|------|------|
| `"req"` | RequestFrame | Client → Server | RPC 请求 |
| `"res"` | ResponseFrame | Server → Client | RPC 响应 |
| `"event"` | EventFrame | Server → Client | 事件推送 |

### 3.2 RequestFrame（请求帧）

客户端向服务器发起的 RPC 请求。

```json
{
  "type": "req",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "agent",
  "params": {
    "message": "Hello",
    "sessionKey": "main",
    "idempotencyKey": "unique-key-123"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | ✓ | 固定值 `"req"` |
| id | string | ✓ | 请求唯一标识符（UUID） |
| method | string | ✓ | RPC 方法名 |
| params | object | ✗ | 方法参数 |

### 3.3 ResponseFrame（响应帧）

服务器对 RPC 请求的响应。

**成功响应:**
```json
{
  "type": "res",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ok": true,
  "payload": {
    "runId": "run-abc-123",
    "status": "completed"
  }
}
```

**错误响应:**
```json
{
  "type": "res",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing required parameter: sessionKey",
    "retryable": false
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | ✓ | 固定值 `"res"` |
| id | string | ✓ | 对应请求的 ID |
| ok | boolean | ✓ | 请求是否成功 |
| payload | any | ✗ | 成功时的返回数据 |
| error | ErrorShape | ✗ | 失败时的错误信息 |

### 3.4 EventFrame（事件帧）

服务器主动推送的事件。

```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-abc-123",
    "seq": 5,
    "stream": "output",
    "ts": 1706947200000,
    "data": {
      "type": "text",
      "content": "Hello! How can I help you?"
    }
  },
  "seq": 42,
  "stateVersion": {
    "presence": 15,
    "health": 8
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | ✓ | 固定值 `"event"` |
| event | string | ✓ | 事件名称 |
| payload | any | ✗ | 事件数据 |
| seq | integer | ✗ | 全局事件序列号 |
| stateVersion | StateVersion | ✗ | 状态版本信息 |

---

## 4. 连接握手流程

### 4.1 握手时序图

```
┌──────────┐                              ┌──────────┐
│  Client  │                              │  Gateway │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  1. WebSocket 连接建立                   │
     ├────────────────────────────────────────>│
     │                                         │
     │  2. connect.challenge 事件              │
     │     (仅非回环地址连接)                   │
     │<────────────────────────────────────────┤
     │  { "type": "event",                     │
     │    "event": "connect.challenge",        │
     │    "payload": { "nonce": "xxx" } }      │
     │                                         │
     │  3. connect RPC 请求                    │
     ├────────────────────────────────────────>│
     │  { "type": "req",                       │
     │    "method": "connect",                 │
     │    "params": { ConnectParams } }        │
     │                                         │
     │  4. hello-ok 响应                       │
     │<────────────────────────────────────────┤
     │  { "type": "res", "ok": true,           │
     │    "payload": { HelloOk } }             │
     │                                         │
     │  5. 周期性 tick 事件                    │
     │<────────────────────────────────────────┤
     │  { "type": "event",                     │
     │    "event": "tick",                     │
     │    "payload": { "ts": 1706947200000 } } │
     │                                         │
```

### 4.2 握手超时

- 挑战等待超时: 2000ms（仅非回环地址）
- 连接请求超时: 8000ms
- 如果 750ms 内未收到挑战，客户端应直接发送 connect 请求

### 4.3 ConnectParams（连接参数）

```typescript
interface ConnectParams {
  // 协议版本
  minProtocol: number;          // 最低支持版本
  maxProtocol: number;          // 最高支持版本
  
  // 客户端信息
  client: {
    id: string;                 // 客户端标识符
    displayName?: string;       // 显示名称
    version: string;            // 客户端版本
    platform: string;           // 平台标识
    mode: ClientMode;           // 客户端模式
    instanceId?: string;        // 实例ID
    deviceFamily?: string;      // 设备系列
    modelIdentifier?: string;   // 设备型号
  };
  
  // 能力声明
  caps?: string[];              // 客户端能力列表
  commands?: string[];          // 支持的命令列表
  permissions?: Record<string, boolean>;  // 权限声明
  pathEnv?: string;             // PATH 环境变量
  
  // 认证信息
  role?: string;                // 角色（如 "operator", "viewer"）
  scopes?: string[];            // 权限范围
  device?: DeviceAuth;          // 设备认证
  auth?: {
    token?: string;             // 认证令牌
    password?: string;          // 密码
  };
  
  // 其他
  locale?: string;              // 语言区域
  userAgent?: string;           // User-Agent
}
```

#### 客户端模式 (ClientMode)

| 值 | 说明 |
|-----|------|
| `"ui"` | 用户界面客户端 |
| `"backend"` | 后端服务 |
| `"probe"` | 探测/检查工具 |
| `"node"` | 远程节点 |

#### 客户端标识符 (Client ID)

| 值 | 说明 |
|-----|------|
| `"android"` | Android 应用 |
| `"ios"` | iOS 应用 |
| `"macos"` | macOS 应用 |
| `"web"` | Web 应用 |
| `"tui"` | 终端界面 |
| `"gateway-client"` | 网关客户端库 |

### 4.4 HelloOk（握手成功响应）

```typescript
interface HelloOk {
  type: "hello-ok";
  protocol: number;             // 协商后的协议版本
  
  server: {
    version: string;            // 服务器版本
    commit?: string;            // Git commit
    host?: string;              // 主机名
    connId: string;             // 连接ID
  };
  
  features: {
    methods: string[];          // 支持的 RPC 方法列表
    events: string[];           // 支持的事件类型列表
  };
  
  snapshot: Snapshot;           // 当前状态快照
  canvasHostUrl?: string;       // Canvas 服务地址
  
  auth?: {
    deviceToken: string;        // 设备令牌
    role: string;               // 角色
    scopes: string[];           // 权限范围
    issuedAtMs?: number;        // 签发时间
  };
  
  policy: {
    maxPayload: number;         // 最大消息尺寸（字节）
    maxBufferedBytes: number;   // 最大缓冲字节数
    tickIntervalMs: number;     // 心跳间隔（毫秒）
  };
}
```

### 4.5 Snapshot（状态快照）

```typescript
interface Snapshot {
  presence: PresenceEntry[];    // 在线客户端列表
  health: any;                  // 健康状态
  stateVersion: StateVersion;   // 状态版本
  uptimeMs: number;             // 服务器运行时间
  configPath?: string;          // 配置文件路径
  stateDir?: string;            // 状态目录路径
  sessionDefaults?: {
    defaultAgentId: string;     // 默认 Agent ID
    mainKey: string;            // 主键
    mainSessionKey: string;     // 主会话键
    scope?: string;             // 范围
  };
}

interface PresenceEntry {
  host?: string;                // 主机名
  ip?: string;                  // IP 地址
  version?: string;             // 版本
  platform?: string;            // 平台
  deviceFamily?: string;        // 设备类型
  modelIdentifier?: string;     // 设备型号
  mode?: string;                // 客户端模式
  lastInputSeconds?: number;    // 最后输入距今秒数
  reason?: string;              // 连接原因
  tags?: string[];              // 标签
  text?: string;                // 状态文本
  ts: number;                   // 时间戳
  deviceId?: string;            // 设备ID
  roles?: string[];             // 角色列表
  scopes?: string[];            // 权限范围
  instanceId?: string;          // 实例ID
}

interface StateVersion {
  presence: number;             // presence 版本号
  health: number;               // health 版本号
}
```

---

## 5. RPC 方法

### 5.1 方法分类概览

| 分类 | 方法数量 | 说明 |
|------|----------|------|
| 核心 | 3 | 连接、健康检查、状态 |
| Agent | 4 | AI Agent 交互 |
| Chat | 4 | WebSocket 聊天 |
| Session | 6 | 会话管理 |
| Config | 5 | 配置管理 |
| Node | 9 | 远程节点 |
| Device | 5 | 设备配对 |
| Cron | 7 | 定时任务 |
| Channels | 3 | 通讯渠道 |
| Skills | 4 | 技能管理 |
| Wizard | 4 | 配置向导 |
| Exec | 6 | 执行审批 |
| Others | 10+ | 其他功能 |

### 5.2 核心方法

#### `connect`
建立连接并进行握手认证。

**参数:** `ConnectParams`  
**返回:** `HelloOk`

#### `health`
获取服务健康状态。

**参数:** 无  
**返回:** 健康状态对象

#### `status`
获取服务状态信息。

**参数:** 无  
**返回:** 状态对象

### 5.3 Agent 方法

#### `agent`
向 AI Agent 发送消息并获取响应。

```typescript
interface AgentParams {
  message: string;              // 消息内容
  agentId?: string;             // Agent ID
  to?: string;                  // 目标
  replyTo?: string;             // 回复对象
  sessionId?: string;           // 会话 ID
  sessionKey?: string;          // 会话键
  thinking?: string;            // 思考模式
  deliver?: boolean;            // 是否发送
  attachments?: any[];          // 附件
  channel?: string;             // 渠道
  replyChannel?: string;        // 回复渠道
  accountId?: string;           // 账户 ID
  replyAccountId?: string;      // 回复账户 ID
  threadId?: string;            // 线程 ID
  groupId?: string;             // 群组 ID
  groupChannel?: string;        // 群组渠道
  groupSpace?: string;          // 群组空间
  timeout?: number;             // 超时时间
  lane?: string;                // 通道
  extraSystemPrompt?: string;   // 额外系统提示
  idempotencyKey: string;       // 幂等键
  label?: string;               // 标签
  spawnedBy?: string;           // 触发者
}
```

**返回:** 响应确认，实际内容通过 `agent` 事件推送

#### `agent.identity.get`
获取 Agent 身份信息。

```typescript
interface AgentIdentityParams {
  agentId?: string;
  sessionKey?: string;
}

interface AgentIdentityResult {
  agentId: string;
  name?: string;
  avatar?: string;
  emoji?: string;
}
```

#### `agent.wait`
等待 Agent 运行完成。

```typescript
interface AgentWaitParams {
  runId: string;                // 运行 ID
  timeoutMs?: number;           // 超时时间
}
```

#### `wake`
唤醒 Agent。

```typescript
interface WakeParams {
  mode: "now" | "next-heartbeat";
  text: string;
}
```

### 5.4 Chat 方法（WebSocket 原生聊天）

#### `chat.history`
获取聊天历史。

```typescript
interface ChatHistoryParams {
  sessionKey: string;
  limit?: number;               // 1-1000
}
```

#### `chat.send`
发送聊天消息。

```typescript
interface ChatSendParams {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  attachments?: any[];
  timeoutMs?: number;
  idempotencyKey: string;
}
```

#### `chat.abort`
中止聊天请求。

```typescript
interface ChatAbortParams {
  sessionKey: string;
  runId?: string;
}
```

#### `chat.inject`
注入系统消息。

```typescript
interface ChatInjectParams {
  sessionKey: string;
  message: string;
  label?: string;
}
```

### 5.5 Session 方法

| 方法 | 说明 |
|------|------|
| `sessions.list` | 列出所有会话 |
| `sessions.preview` | 预览会话内容 |
| `sessions.resolve` | 解析会话 |
| `sessions.patch` | 更新会话 |
| `sessions.reset` | 重置会话 |
| `sessions.delete` | 删除会话 |
| `sessions.compact` | 压缩会话 |

### 5.6 Config 方法

| 方法 | 说明 |
|------|------|
| `config.get` | 获取配置 |
| `config.set` | 设置配置 |
| `config.apply` | 应用配置 |
| `config.patch` | 补丁更新配置 |
| `config.schema` | 获取配置 Schema |

### 5.7 Node 方法（远程节点）

#### `node.list`
列出所有已配对的节点。

```typescript
interface NodeListParams {}
```

#### `node.describe`
获取节点详细信息。

```typescript
interface NodeDescribeParams {
  nodeId: string;
}
```

#### `node.invoke`
调用远程节点命令。

```typescript
interface NodeInvokeParams {
  nodeId: string;               // 节点 ID
  command: string;              // 命令名称
  params?: any;                 // 命令参数
  timeoutMs?: number;           // 超时时间
  idempotencyKey: string;       // 幂等键
}
```

#### `node.invoke.result`
返回命令执行结果（由节点发送）。

```typescript
interface NodeInvokeResultParams {
  id: string;                   // 请求 ID
  nodeId: string;               // 节点 ID
  ok: boolean;                  // 是否成功
  payload?: any;                // 结果数据
  payloadJSON?: string;         // JSON 格式结果
  error?: {
    code?: string;
    message?: string;
  };
}
```

#### `node.event`
发送节点事件（由节点发送）。

```typescript
interface NodeEventParams {
  event: string;
  payload?: any;
  payloadJSON?: string;
}
```

#### 节点配对方法

| 方法 | 说明 |
|------|------|
| `node.pair.request` | 请求配对 |
| `node.pair.list` | 列出待处理配对请求 |
| `node.pair.approve` | 批准配对 |
| `node.pair.reject` | 拒绝配对 |
| `node.pair.verify` | 验证配对 |
| `node.rename` | 重命名节点 |

### 5.8 Device 方法（设备管理）

| 方法 | 说明 |
|------|------|
| `device.pair.list` | 列出待处理设备配对请求 |
| `device.pair.approve` | 批准设备配对 |
| `device.pair.reject` | 拒绝设备配对 |
| `device.token.rotate` | 轮换设备令牌 |
| `device.token.revoke` | 撤销设备令牌 |

### 5.9 Cron 方法（定时任务）

| 方法 | 说明 |
|------|------|
| `cron.list` | 列出所有定时任务 |
| `cron.status` | 获取任务状态 |
| `cron.add` | 添加定时任务 |
| `cron.update` | 更新定时任务 |
| `cron.remove` | 删除定时任务 |
| `cron.run` | 立即执行任务 |
| `cron.runs` | 获取执行历史 |

### 5.10 其他方法

| 方法 | 说明 |
|------|------|
| `send` | 发送消息到外部渠道 |
| `channels.status` | 获取渠道状态 |
| `channels.logout` | 登出渠道 |
| `models.list` | 列出可用模型 |
| `agents.list` | 列出所有 Agent |
| `skills.status` | 获取技能状态 |
| `skills.install` | 安装技能 |
| `logs.tail` | 获取日志 |
| `wizard.start` | 启动配置向导 |
| `wizard.next` | 向导下一步 |
| `browser.request` | 浏览器请求 |
| `update.run` | 运行更新 |

---

## 6. 事件类型

### 6.1 事件列表

| 事件名 | 说明 | Payload 类型 |
|--------|------|--------------|
| `connect.challenge` | 连接挑战 | `{ nonce: string }` |
| `agent` | Agent 输出流 | `AgentEvent` |
| `chat` | 聊天消息 | `ChatEvent` |
| `presence` | 在线状态变更 | `PresenceEntry[]` |
| `tick` | 心跳事件 | `{ ts: number }` |
| `shutdown` | 服务器关闭 | `ShutdownEvent` |
| `health` | 健康状态变更 | 健康状态对象 |
| `heartbeat` | 心跳 | - |
| `cron` | 定时任务事件 | - |
| `node.pair.requested` | 节点配对请求 | 配对请求信息 |
| `node.pair.resolved` | 节点配对结果 | 配对结果 |
| `node.invoke.request` | 远程命令调用 | `NodeInvokeRequestEvent` |
| `device.pair.requested` | 设备配对请求 | 配对请求信息 |
| `device.pair.resolved` | 设备配对结果 | 配对结果 |
| `talk.mode` | 对话模式变更 | - |
| `voicewake.changed` | 语音唤醒变更 | - |
| `exec.approval.requested` | 执行审批请求 | 审批请求信息 |
| `exec.approval.resolved` | 执行审批结果 | 审批结果 |

### 6.2 AgentEvent

```typescript
interface AgentEvent {
  runId: string;                // 运行 ID
  seq: number;                  // 序列号
  stream: string;               // 流名称
  ts: number;                   // 时间戳
  data: Record<string, any>;    // 事件数据
}
```

### 6.3 ChatEvent

```typescript
interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: any;
  errorMessage?: string;
  usage?: any;
  stopReason?: string;
}
```

### 6.4 ShutdownEvent

```typescript
interface ShutdownEvent {
  reason: string;               // 关闭原因
  restartExpectedMs?: number;   // 预计重启时间
}
```

### 6.5 NodeInvokeRequestEvent

```typescript
interface NodeInvokeRequestEvent {
  id: string;                   // 请求 ID
  nodeId: string;               // 节点 ID
  command: string;              // 命令名称
  paramsJSON?: string;          // JSON 格式参数
  timeoutMs?: number;           // 超时时间
  idempotencyKey?: string;      // 幂等键
}
```

---

## 7. 数据模型

### 7.1 基础类型

```typescript
// 非空字符串
type NonEmptyString = string;   // minLength: 1

// 会话标签（最大100字符）
type SessionLabelString = string;

// 客户端ID
type GatewayClientId = 
  | "android" | "ios" | "macos" | "web" 
  | "tui" | "gateway-client" | string;

// 客户端模式
type GatewayClientMode = "ui" | "backend" | "probe" | "node";
```

### 7.2 设备认证

```typescript
interface DeviceAuth {
  id: string;                   // 设备 ID
  publicKey: string;            // 公钥（Base64URL）
  signature: string;            // 签名
  signedAt: number;             // 签名时间戳
  nonce?: string;               // 随机数
}
```

### 7.3 CronJob

```typescript
interface CronJob {
  id: string;
  name: string;
  schedule: string;             // Cron 表达式
  enabled: boolean;
  message: string;
  agentId?: string;
  sessionKey?: string;
  delivery?: {
    mode: "none" | "channel" | "webhook";
    channel?: string;
    to?: string;
    webhookUrl?: string;
  };
  lastRun?: number;
  nextRun?: number;
}
```

---

## 8. 错误处理

### 8.1 ErrorShape

```typescript
interface ErrorShape {
  code: string;                 // 错误码
  message: string;              // 错误描述
  details?: any;                // 详细信息
  retryable?: boolean;          // 是否可重试
  retryAfterMs?: number;        // 建议重试延迟
}
```

### 8.2 标准错误码

| 错误码 | 说明 |
|--------|------|
| `NOT_LINKED` | 未链接/未配置 |
| `NOT_PAIRED` | 未配对 |
| `AGENT_TIMEOUT` | Agent 超时 |
| `INVALID_REQUEST` | 无效请求 |
| `UNAVAILABLE` | 服务不可用 |

### 8.3 错误处理建议

1. **可重试错误**: 检查 `retryable` 字段，使用 `retryAfterMs` 延迟重试
2. **认证错误**: 清除缓存令牌，重新认证
3. **超时错误**: 增加超时时间或拆分请求
4. **版本不匹配**: 检查协议版本兼容性

---

## 9. 安全机制

### 9.1 设备身份验证

每个设备生成唯一的公私钥对，用于签名认证。

#### 签名 Payload 格式

**Version 1（无 nonce）:**
```
v1|{deviceId}|{clientId}|{clientMode}|{role}|{scopes}|{signedAtMs}|{token}
```

**Version 2（有 nonce）:**
```
v2|{deviceId}|{clientId}|{clientMode}|{role}|{scopes}|{signedAtMs}|{token}|{nonce}
```

#### 签名算法

1. 使用设备私钥对 payload 进行 ECDSA P-256 签名
2. 签名结果 Base64URL 编码
3. 公钥以 Base64URL 编码的原始格式发送

### 9.2 令牌管理

- **设备令牌**: 连接成功后服务器颁发，用于后续认证
- **令牌存储**: 按 `deviceId + role` 存储
- **令牌轮换**: 使用 `device.token.rotate` 方法
- **令牌撤销**: 使用 `device.token.revoke` 方法

### 9.3 角色与权限

| 角色 | 说明 |
|------|------|
| `operator` | 操作员（完整权限） |
| `viewer` | 查看者（只读权限） |

权限通过 `scopes` 数组定义，例如:
- `operator.admin`: 管理员权限
- `operator.read`: 读取权限
- `operator.write`: 写入权限

---

## 10. 心跳与重连

### 10.1 心跳机制

1. 服务器定期发送 `tick` 事件（默认30秒）
2. 客户端记录最后收到 tick 的时间
3. 如果超过 2 倍间隔未收到 tick，关闭连接并重连

```typescript
const tickIntervalMs = helloOk.policy.tickIntervalMs;  // 通常 30000
const timeoutMs = tickIntervalMs * 2;                   // 60000

if (Date.now() - lastTickTs > timeoutMs) {
  socket.close(4000, "tick timeout");
  reconnect();
}
```

### 10.2 断线重连

使用指数退避算法进行重连:

```typescript
// 初始延迟
let backoffMs = 1000;

function scheduleReconnect() {
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, 30000);  // 最大30秒
  setTimeout(() => connect(), delay);
}

// 连接成功后重置
function onConnected() {
  backoffMs = 1000;
}
```

### 10.3 序列号检测

客户端应检测事件序列号的连续性，发现跳跃时触发回调:

```typescript
let lastSeq: number | null = null;

function onEvent(event: EventFrame) {
  if (typeof event.seq === 'number') {
    if (lastSeq !== null && event.seq > lastSeq + 1) {
      onGap({ expected: lastSeq + 1, received: event.seq });
    }
    lastSeq = event.seq;
  }
}
```

---

## 附录 A: 完整方法列表

```
health
logs.tail
channels.status
channels.logout
status
usage.status
usage.cost
tts.status
tts.providers
tts.enable
tts.disable
tts.convert
tts.setProvider
config.get
config.set
config.apply
config.patch
config.schema
exec.approvals.get
exec.approvals.set
exec.approvals.node.get
exec.approvals.node.set
exec.approval.request
exec.approval.resolve
wizard.start
wizard.next
wizard.cancel
wizard.status
talk.mode
models.list
agents.list
agents.files.list
agents.files.get
agents.files.set
skills.status
skills.bins
skills.install
skills.update
update.run
voicewake.get
voicewake.set
sessions.list
sessions.preview
sessions.patch
sessions.reset
sessions.delete
sessions.compact
last-heartbeat
set-heartbeats
wake
node.pair.request
node.pair.list
node.pair.approve
node.pair.reject
node.pair.verify
device.pair.list
device.pair.approve
device.pair.reject
device.token.rotate
device.token.revoke
node.rename
node.list
node.describe
node.invoke
node.invoke.result
node.event
cron.list
cron.status
cron.add
cron.update
cron.remove
cron.run
cron.runs
system-presence
system-event
send
agent
agent.identity.get
agent.wait
browser.request
chat.history
chat.abort
chat.send
```

---

## 附录 B: 参考实现

### TypeScript 客户端
`src/gateway/client.ts`

### Kotlin (Android) 客户端
`apps/android/app/src/main/java/ai/openclaw/android/gateway/GatewaySession.kt`

### Swift (iOS/macOS) 客户端
`apps/macos/Sources/OpenClawProtocol/GatewayModels.swift`

---

## 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 3 | 2026-02-04 | 当前版本 |
