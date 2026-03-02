# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-02
**Type:** VI Gateway — Standalone LiveKit Task Execution Service (V3)

## OVERVIEW

VI Gateway is a standalone service that joins LiveKit rooms as a participant and executes AI tasks (HTML generation, research, analysis) on behalf of the realtime agent. It routes tasks through configurable executor adapters (Gemini Flash, NanoClaw/Claude) and streams results to the frontend via DataChannel.

## STRUCTURE

```
./
├── src/
│   ├── main.ts                  # V3 entry point — Express HTTP + GatewayService
│   ├── gateway-service.ts       # Core service: room join, RPC handlers, task execution
│   ├── langfuse.ts              # Optional Langfuse LLM tracing (fetch interceptor)
│   ├── executors/
│   │   ├── types.ts             # ExecutionAdapter, TaskRequest, TaskChunk interfaces
│   │   ├── executor-selector.ts # Priority/hint-based adapter selection
│   │   ├── gemini-flash-executor.ts  # Google Gemini Flash adapter
│   │   ├── nanoclaw-executor.ts      # Anthropic Claude adapter
│   │   └── index.ts             # Executor module exports + createDefaultSelector
├── tsconfig.json
├── package.json
└── snapshot/                    # Workspace template files (design system)
```

## WHERE TO LOOK

| Task                     | Location                          | Notes                                      |
| ------------------------ | --------------------------------- | ------------------------------------------ |
| Service startup          | `src/main.ts`                     | Express server, selector init, gateway init |
| Room join & RPC          | `src/gateway-service.ts`          | GatewayService class, RoomSession class     |
| Task routing             | `src/executors/executor-selector.ts` | Priority/hint/env-var based selection     |
| Executor types           | `src/executors/types.ts`          | TaskRequest, TaskChunk, ExecutionAdapter    |
| Gemini Flash executor    | `src/executors/gemini-flash-executor.ts` | Fast HTML generation              |
| Claude executor          | `src/executors/nanoclaw-executor.ts`     | Thorough tasks                    |
| LLM tracing              | `src/langfuse.ts`                 | Optional, auto-installs fetch interceptor  |

## CODE MAP

| Symbol                | Type      | Location                    | Role                                    |
| --------------------- | --------- | --------------------------- | --------------------------------------- |
| GatewayService        | class     | gateway-service.ts          | Core service: room join, RPC, execution |
| RoomSession           | class     | gateway-service.ts          | Per-room state, idle check, task tracking |
| ExecutorSelector      | class     | executors/executor-selector.ts | Select adapter by priority/hint/env   |
| GeminiFlashAdapter    | class     | executors/gemini-flash-executor.ts | Gemini Flash executor             |
| NanoClawAdapter       | class     | executors/nanoclaw-executor.ts     | Claude executor                   |
| ExecutionAdapter      | interface | executors/types.ts          | Executor contract (V3)                  |
| TaskRequest           | interface | executors/types.ts          | Incoming task payload                   |
| TaskChunk             | type      | executors/types.ts          | Streamed result piece from executor     |
| createDefaultSelector | function  | executors/index.ts          | Factory for configured ExecutorSelector |

## CONVENTIONS

**Code Style:**

- TypeScript strict mode, ES2022 target, ESM modules
- 2-space indentation
- Exported classes/interfaces: PascalCase
- Exported functions: camelCase

**Error Handling:**

- `try/catch` for all async operations
- Log with structured format: `[Component] message`
- Executors yield `{ type: 'error' }` chunks on failure
- GatewayService has automatic executor fallback on error

**Executor Selection Cascade:**

1. `request.executorHint` — explicit adapter request
2. `request.priority` mapping via config (`fast`/`thorough`/`code`)
3. `VI_DEFAULT_EXECUTOR` env var override
4. Fallback: first online adapter

**Task Execution Flow:**

1. Realtime agent sends HTTP POST to `/join` to get gateway into the room
2. Gateway joins LiveKit room, registers RPC handlers (`dispatch_task`, `cancel_task`)
3. Agent calls `dispatch_task` RPC with TaskRequest payload
4. Gateway selects executor, streams TaskChunks to frontend via DataChannel topic `vi-gateway`
5. On completion, gateway sends `rpcG2BSendReply` RPC back to agent
6. Room auto-disconnects after idle timeout (default 5 min)

**Environment Variables:**

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — required
- `GOOGLE_API_KEY` — enables Gemini Flash adapter
- `ANTHROPIC_API_KEY` — enables NanoClaw adapter
- `VI_DEFAULT_EXECUTOR` — runtime override for all priorities
- `VI_DEFAULT_FAST_EXECUTOR`, `VI_DEFAULT_THOROUGH_EXECUTOR`, `VI_DEFAULT_CODE_EXECUTOR`
- `GATEWAY_HTTP_PORT` (default: 18789), `GATEWAY_IDLE_TIMEOUT_MS` (default: 300000)

## COMMANDS

```bash
# Install dependencies
npm install

# Run the gateway (V3 standalone)
npx tsx src/main.ts

# Type-check
npx tsc --noEmit
```

## ANTI-PATTERNS

- Don't create multiple gateway participants for the same room
- Don't hardcode API keys
- Don't call `this.selector.select()` when executorName is already known — use `this.selector.get()`
- Don't suppress type errors with `@ts-ignore`
