import express from 'express';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connectRedis, disconnectRedis } from './redis-client.js';
import { startFramesConsumer } from './channels/frames-consumer.js';
import { startMediaConsumer } from './channels/media-consumer.js';
import { startContextCompiler } from './context/context-compiler.js';
import { syncFromCloud } from './fs/cloud-sync.js';
import { getStoreStats } from './persistence/card-store.js';
import { loadPackages } from './packages/package-loader.js';
import { config } from './config.js';
import { createDashboardRouter } from './dashboard-routes.js';

// Container mode imports (v5.2)
import { startExecChannel, stopExecChannel, getUserQueue } from './container/exec-channel.js';
import {
  ensureContainerRuntimeRunning,
  cleanupOrphans,
} from './container/container-runtime.js';

// Legacy mode imports (pre-v5.2, kept for backward compat)
import { startExecHandler } from './channels/exec-handler.js';
import { startPool, stopPool, getPoolStatus } from './pool/process-pool.js';
import { getQueueDepths } from './pool/queue-router.js';

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isPoolMode = args.includes('--pool');
const isContainerMode = args.includes('--container') || config.containerMode;
const poolConcurrency = (() => {
  const idx = args.indexOf('--concurrency');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  }
  return parseInt(process.env.POOL_CONCURRENCY ?? '4', 10);
})();

// ---------------------------------------------------------------------------
// Container mode (V5.2: container-isolated agent execution)
// ---------------------------------------------------------------------------

async function startContainerMode(): Promise<void> {
  console.log(`[nanoclaw] starting container execution mode`);

  // 1. Connect to Redis
  await connectRedis();

  // 2. Verify Docker runtime
  try {
    ensureContainerRuntimeRunning();
    cleanupOrphans();
  } catch (err) {
    console.warn('[nanoclaw] Docker runtime not available — container execution will fail at runtime');
    console.warn('[nanoclaw] Continuing startup for context compiler and dashboard...');
  }

  // 3. Load experience packages
  await loadPackages(config.packagesDir);

  // 4. Sync user files from remote storage
  if (process.env.USER_ID) {
    await syncFromCloud(config.userId);
  } else {
    console.log('[nanoclaw] no USER_ID configured — skipping startup sync');
  }

  // 5. Start container execution channel (replaces exec-handler + process-pool)
  await startExecChannel();

  // 6. Start context-related channel subscriptions
  await startFramesConsumer();
  await startMediaConsumer();

  // 7. Start context compiler loop (30s interval)
  await startContextCompiler();

  // 8. Health endpoint + dashboard
  const app = express();
  app.get('/health', (_req, res) => {
    const queue = getUserQueue();
    res.json({
      status: 'ok',
      service: 'nanoclaw',
      mode: 'container',
      userId: config.userId,
      queue: queue.getStatus(),
      cardStore: getStoreStats(),
    });
  });
  mountDashboard(app);
  listenWithHttps(app);

  console.log('[nanoclaw] container execution mode ready');
}

// ---------------------------------------------------------------------------
// Single-user mode (legacy: one NanoClaw per user, in-process execution)
// ---------------------------------------------------------------------------

async function startSingleUser(): Promise<void> {
  console.log(`[nanoclaw] starting single-user mode for user ${config.userId}`);

  // 1. Connect to Redis
  await connectRedis();

  // 2. Sync user files from remote storage (skip if no real userId configured)
  if (process.env.USER_ID) {
    await syncFromCloud(config.userId);
  } else {
    console.log('[nanoclaw] no USER_ID configured — skipping startup sync (will sync per-task)');
  }

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
  listenWithHttps(app);

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
  listenWithHttps(app);

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
// HTTPS + HTTP listener
// ---------------------------------------------------------------------------

function listenWithHttps(app: express.Express): void {
  // Always start HTTP
  app.listen(config.healthPort, () => {
    console.log(`[nanoclaw] HTTP on :${config.healthPort}`);
  });

  // Start HTTPS if SSL certs are available
  const sslDir = process.env.SSL_DIR || '/etc/nginx/ssl';
  const certPath = join(sslDir, 'cert.pem');
  const keyPath = join(sslDir, 'key.pem');

  if (existsSync(certPath) && existsSync(keyPath)) {
    try {
      const httpsServer = createHttpsServer(
        {
          cert: readFileSync(certPath),
          key: readFileSync(keyPath),
        },
        app,
      );
      const httpsPort = config.healthPort + 1; // 3101 inside container
      httpsServer.listen(httpsPort, () => {
        console.log(`[nanoclaw] HTTPS on :${httpsPort}`);
      });
    } catch (err) {
      console.warn('[nanoclaw] Failed to start HTTPS:', err);
    }
  } else {
    console.log('[nanoclaw] No SSL certs found, HTTPS disabled');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (isContainerMode) {
    await startContainerMode();
  } else if (isPoolMode) {
    await startPoolMode();
  } else {
    await startSingleUser();
  }
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('[nanoclaw] shutting down...');
  if (isContainerMode) {
    await stopExecChannel();
  } else if (isPoolMode) {
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
