/**
 * V3 Gateway Entry Point — standalone service (no OpenClaw dependency).
 *
 * Starts:
 *  1. GatewayService (LiveKit Room participant with Lazy Join)
 *  2. ExecutorSelector with GeminiFlash + NanoClaw adapters
 *  3. Express health/join HTTP server for agent Lazy Join requests
 *
 * Usage: npx tsx src/main.ts
 */

import express from 'express';
import { GatewayService, type GatewayServiceConfig } from './gateway-service.js';
import { ExecutorSelector } from './executors/executor-selector.js';
import { GeminiFlashAdapter } from './executors/gemini-flash-executor.js';
import { NanoClawAdapter } from './executors/nanoclaw-executor.js';

// ---------------------------------------------------------------------------
// Configuration from environment
// ---------------------------------------------------------------------------

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const HTTP_PORT = parseInt(process.env.GATEWAY_HTTP_PORT || '18789', 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.GATEWAY_IDLE_TIMEOUT_MS || '300000', 10); // 5 min

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('[main] Missing required LiveKit environment variables');
  console.error('  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Initialize ExecutorSelector + Adapters
// ---------------------------------------------------------------------------

const selector = new ExecutorSelector({
  defaultFastExecutor: process.env.VI_DEFAULT_FAST_EXECUTOR || 'gemini-flash',
  defaultThoroughExecutor: process.env.VI_DEFAULT_THOROUGH_EXECUTOR || 'gemini-flash',
  defaultCodeExecutor: process.env.VI_DEFAULT_CODE_EXECUTOR || 'gemini-flash',
});

const geminiFlash = new GeminiFlashAdapter();
const nanoClaw = new NanoClawAdapter();

selector.register(geminiFlash);
selector.register(nanoClaw);

console.log(`[main] Registered adapters: ${selector.listExecutors().join(', ')}`);

if (process.env.VI_DEFAULT_EXECUTOR) {
  console.log(`[main] VI_DEFAULT_EXECUTOR override: ${process.env.VI_DEFAULT_EXECUTOR}`);
}

// ---------------------------------------------------------------------------
// Initialize GatewayService
// ---------------------------------------------------------------------------

const gatewayConfig: GatewayServiceConfig = {
  livekitUrl: LIVEKIT_URL,
  livekitApiKey: LIVEKIT_API_KEY,
  livekitApiSecret: LIVEKIT_API_SECRET,
  idleTimeoutMs: IDLE_TIMEOUT_MS,
};

const gateway = new GatewayService(gatewayConfig, selector);

// ---------------------------------------------------------------------------
// HTTP Server — health check + Lazy Join endpoint + executors list
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vi-gateway', executors: selector.listExecutors() });
});

// GET /executors — list all registered adapters and their status
app.get('/executors', async (_req, res) => {
  const adapters = selector.listAll();
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      const st = await adapter.status().catch(() => 'offline' as const);
      return {
        id: adapter.id,
        name: adapter.name,
        location: adapter.location,
        status: st,
        capabilities: adapter.capabilities,
      };
    }),
  );
  res.json({ executors: results });
});

// Lazy Join — called by vi-realtime agent when gateway is needed in a room
app.post('/join', async (req, res) => {
  const { room_name, force } = req.body || {};
  if (!room_name) {
    res.status(400).json({ ok: false, error: 'Missing room_name' });
    return;
  }

  console.log(`[main] Lazy Join request for room=${room_name} force=${!!force}`);
  const result = await gateway.joinRoom(room_name, !!force);
  res.json(result);
});

// Leave a room (for cleanup)
app.post('/leave', async (req, res) => {
  const { room_name } = req.body || {};
  if (!room_name) {
    res.status(400).json({ ok: false, error: 'Missing room_name' });
    return;
  }

  await gateway.leaveRoom(room_name);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[vi-gateway] V3 Gateway started`);
  console.log(`[vi-gateway] HTTP server on port ${HTTP_PORT}`);
  console.log(`[vi-gateway] LiveKit URL: ${LIVEKIT_URL}`);
  console.log(`[vi-gateway] Adapters: ${selector.listExecutors().join(', ')}`);
  console.log(`[vi-gateway] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`[vi-gateway] Received ${signal}, shutting down...`);
  await gateway.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
