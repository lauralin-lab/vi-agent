import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connectRedis, disconnectRedis } from './redis-client.js';
import { startExecHandler } from './channels/exec-handler.js';
import { startFramesConsumer } from './channels/frames-consumer.js';
import { startMediaConsumer } from './channels/media-consumer.js';
import { startContextCompiler } from './context/context-compiler.js';
import { syncFromCloud } from './fs/cloud-sync.js';
import { startPool, stopPool, getPoolStatus } from './pool/process-pool.js';
import { getQueueDepths } from './pool/queue-router.js';
import { getStoreStats } from './persistence/card-store.js';
import { config } from './config.js';
import { createDashboardRouter } from './dashboard-routes.js';

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isPoolMode = args.includes('--pool');
const poolConcurrency = (() => {
  const idx = args.indexOf('--concurrency');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  }
  return parseInt(process.env.POOL_CONCURRENCY ?? '4', 10);
})();

// ---------------------------------------------------------------------------
// Single-user mode (legacy: one NanoClaw per user)
// ---------------------------------------------------------------------------

async function startSingleUser(): Promise<void> {
  console.log(`[nanoclaw] starting single-user mode for user ${config.userId}`);

  // 1. Connect to Redis
  await connectRedis();

  // 2. Sync user files from remote storage
  await syncFromCloud(config.userId);

  // 3. Start channel subscriptions
  await startExecHandler();
  await startFramesConsumer();
  await startMediaConsumer();

  // 4. Start context compiler loop (30s interval)
  await startContextCompiler();

  // 5. Health endpoint + optional dashboard
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'nanoclaw',
      mode: 'single-user',
      userId: config.userId,
      cardStore: getStoreStats(),
    });
  });
  mountDashboard(app);
  app.listen(config.healthPort, () => {
    console.log(`[nanoclaw] health endpoint on :${config.healthPort}`);
  });

  console.log('[nanoclaw] single-user mode ready');
}

// ---------------------------------------------------------------------------
// Pool mode (V5: multi-user, competing consumers on vi:queue)
// ---------------------------------------------------------------------------

async function startPoolMode(): Promise<void> {
  console.log(`[nanoclaw] starting pool mode (concurrency=${poolConcurrency})`);

  // 1. Connect to Redis
  await connectRedis();

  // 2. Start the worker pool
  startPool(poolConcurrency);

  // 3. Health endpoint with pool and queue stats
  const app = express();
  app.get('/health', async (_req, res) => {
    try {
      const queueDepths = await getQueueDepths();
      res.json({
        status: 'ok',
        service: 'nanoclaw',
        mode: 'pool',
        pool: getPoolStatus(),
        queues: queueDepths,
        cardStore: getStoreStats(),
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        service: 'nanoclaw',
        mode: 'pool',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
  mountDashboard(app);
  app.listen(config.healthPort, () => {
    console.log(`[nanoclaw] health endpoint on :${config.healthPort}`);
  });

  console.log('[nanoclaw] pool mode ready');
}

// ---------------------------------------------------------------------------
// Dashboard (opt-in via DASHBOARD=true)
// ---------------------------------------------------------------------------

function mountDashboard(app: express.Express): void {
  if (!config.dashboardEnabled) return;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const publicDir = join(__dirname, '..', 'public');

  app.use(createDashboardRouter());
  app.use(express.static(publicDir));
  console.log('[nanoclaw] dashboard enabled at /');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (isPoolMode) {
    await startPoolMode();
  } else {
    await startSingleUser();
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('[nanoclaw] shutting down...');
  if (isPoolMode) {
    await stopPool();
  }
  await disconnectRedis();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[nanoclaw] fatal error:', err);
  process.exit(1);
});
