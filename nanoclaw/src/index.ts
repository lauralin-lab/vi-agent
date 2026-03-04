import express from 'express';
import { connectRedis, disconnectRedis } from './redis-client.js';
import { startExecHandler } from './channels/exec-handler.js';
import { startFramesConsumer } from './channels/frames-consumer.js';
import { startMediaConsumer } from './channels/media-consumer.js';
import { startContextCompiler } from './context/context-compiler.js';
import { syncFromS3 } from './fs/s3-sync.js';
import { config } from './config.js';

async function main(): Promise<void> {
  console.log(`[nanoclaw] starting for user ${config.userId}`);

  // 1. Connect to Redis
  await connectRedis();

  // 2. Sync user files from remote storage
  await syncFromS3(config.userId);

  // 3. Start channel subscriptions
  await startExecHandler();
  await startFramesConsumer();
  await startMediaConsumer();

  // 4. Start context compiler loop (30s interval)
  await startContextCompiler();

  // 5. Health endpoint
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nanoclaw', userId: config.userId });
  });
  app.listen(config.healthPort, () => {
    console.log(`[nanoclaw] health endpoint on :${config.healthPort}`);
  });

  console.log('[nanoclaw] ready');
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('[nanoclaw] shutting down...');
  await disconnectRedis();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[nanoclaw] fatal error:', err);
  process.exit(1);
});
