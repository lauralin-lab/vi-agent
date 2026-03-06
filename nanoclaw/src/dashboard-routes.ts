import { Router, type Request, type Response } from 'express';
import { getRedis, getSubscriber } from './redis-client.js';
import { getAllManifests } from './skills/skill-loader.js';
import { getAllTemplates } from './packages/template-registry.js';
import { getStoreStats, getSessionCardState } from './persistence/card-store.js';
import { getPoolStatus } from './pool/process-pool.js';
import { getQueueDepths } from './pool/queue-router.js';
import { channels } from './channels/types.js';
import { config } from './config.js';

const startedAt = Date.now();

export function createDashboardRouter(): Router {
  const router = Router();

  // --- Health / Stats API ---
  router.get('/api/dashboard/health', async (_req: Request, res: Response) => {
    try {
      const queueDepths = await getQueueDepths();
      res.json({
        status: 'ok',
        service: 'nanoclaw',
        userId: config.userId,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        pool: getPoolStatus(),
        queues: queueDepths,
        cardStore: getStoreStats(),
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- Skills API ---
  router.get('/api/dashboard/skills', async (_req: Request, res: Response) => {
    try {
      const manifests = await getAllManifests();
      res.json({ skills: manifests });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- Templates API ---
  router.get('/api/dashboard/templates', (_req: Request, res: Response) => {
    try {
      const templates = getAllTemplates();
      res.json({ templates });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- Tasks / Card Store API ---
  router.get('/api/dashboard/sessions', (_req: Request, res: Response) => {
    try {
      const stats = getStoreStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- SSE Stream (subscribes to vi:stream:{uid}) ---
  router.get('/api/dashboard/sse', (req: Request, res: Response) => {
    const uid = (req.query.uid as string) || config.userId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', uid })}\n\n`);

    const sub = getSubscriber();
    const channel = channels.stream(uid);

    const onMessage = (ch: string, message: string) => {
      if (ch !== channel) return;
      res.write(`data: ${message}\n\n`);
    };

    sub.on('message', onMessage);
    sub.subscribe(channel).catch((err: Error) => {
      console.error('[dashboard] SSE subscribe error:', err);
    });

    // Heartbeat every 15s
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sub.removeListener('message', onMessage);
      sub.unsubscribe(channel).catch(() => {});
    });
  });

  return router;
}
