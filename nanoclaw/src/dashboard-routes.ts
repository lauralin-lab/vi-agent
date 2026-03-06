import { Router, json, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import Redis from 'ioredis';
import { getRedis, getSubscriber } from './redis-client.js';
import { getAllManifests } from './skills/skill-loader.js';
import { getAllTemplates } from './packages/template-registry.js';
import { getStoreStats, getSessionCardState } from './persistence/card-store.js';
import { getPoolStatus } from './pool/process-pool.js';
import { getQueueDepths } from './pool/queue-router.js';
import { channels, type ExecRequest } from './channels/types.js';
import { config } from './config.js';

const startedAt = Date.now();

export function createDashboardRouter(): Router {
  const router = Router();
  router.use(json());

  // =====================================================================
  // Health / Stats API (existing)
  // =====================================================================

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

  // =====================================================================
  // Skills API (existing)
  // =====================================================================

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

  // =====================================================================
  // Templates API (existing)
  // =====================================================================

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

  // =====================================================================
  // Card Store API (existing)
  // =====================================================================

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

  // =====================================================================
  // SSE Stream — single channel (existing, vi:stream:{uid})
  // =====================================================================

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

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sub.removeListener('message', onMessage);
      sub.unsubscribe(channel).catch(() => {});
    });
  });

  // =====================================================================
  // SSE Multi-Channel — subscribes to ALL Redis channels for a uid
  // =====================================================================

  router.get('/api/dashboard/sse/all', (req: Request, res: Response) => {
    const uid = (req.query.uid as string) || config.userId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', uid, mode: 'all-channels' })}\n\n`);

    // Create a dedicated subscriber for this connection
    const allSub = new Redis(config.redisUrl, { lazyConnect: false });

    const pubSubChannels = [
      channels.ctx(uid),
      channels.exec(uid),
      channels.stream(uid),
      channels.intent(uid),
      channels.frames(uid),
      channels.media(uid),
      channels.events(uid),
    ];

    const onMessage = (ch: string, message: string) => {
      // Extract channel type from channel name: vi:TYPE:uid -> TYPE
      const channelType = ch.replace(`vi:`, '').replace(`:${uid}`, '');
      try {
        const parsed = JSON.parse(message);
        res.write(`data: ${JSON.stringify({ channel: channelType, ts: Date.now(), data: parsed })}\n\n`);
      } catch {
        res.write(`data: ${JSON.stringify({ channel: channelType, ts: Date.now(), data: message })}\n\n`);
      }
    };

    allSub.on('message', onMessage);

    // Subscribe to all PubSub channels
    allSub.subscribe(...pubSubChannels).catch((err: Error) => {
      console.error('[dashboard] multi-channel subscribe error:', err);
    });

    // Also poll Redis Streams (vi:actions, vi:summary) periodically
    let lastActionsId = '0-0';
    const streamPoll = setInterval(async () => {
      try {
        const redis = getRedis();
        // Poll actions stream
        const entries = await redis.xrange(channels.actions(uid), lastActionsId, '+', 'COUNT', 50);
        for (const [id, fields] of entries) {
          if (id === lastActionsId) continue;
          for (let i = 0; i < fields.length; i += 2) {
            if (fields[i] === 'data') {
              try {
                const parsed = JSON.parse(fields[i + 1]);
                res.write(`data: ${JSON.stringify({ channel: 'actions', ts: Date.now(), data: parsed })}\n\n`);
              } catch { /* skip */ }
            }
          }
          lastActionsId = id;
        }
        // Poll summary KV
        const summaryRaw = await redis.get(channels.summary(uid));
        if (summaryRaw) {
          try {
            const parsed = JSON.parse(summaryRaw);
            res.write(`data: ${JSON.stringify({ channel: 'summary', ts: Date.now(), data: parsed })}\n\n`);
          } catch { /* skip */ }
        }
      } catch { /* skip poll errors */ }
    }, 5000);

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clearInterval(streamPoll);
      allSub.unsubscribe().catch(() => {});
      allSub.disconnect();
    });
  });

  // =====================================================================
  // Chat — send exec request to nanoclaw
  // =====================================================================

  router.post('/api/dashboard/chat', async (req: Request, res: Response) => {
    try {
      const { prompt, skillSlug, uid: requestUid } = req.body as {
        prompt?: string;
        skillSlug?: string;
        uid?: string;
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }

      const uid = requestUid || config.userId;
      const taskId = `dash-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const sessionId = `dash-session-${new Date().toISOString().slice(0, 10)}`;

      const execRequest: ExecRequest = {
        taskId,
        sessionId,
        prompt: prompt.trim(),
        skillSlug: skillSlug || undefined,
        ts: Date.now(),
        userId: uid,
      };

      const redis = getRedis();
      await redis.publish(channels.exec(uid), JSON.stringify(execRequest));

      res.json({
        status: 'sent',
        taskId,
        sessionId,
        uid,
        skillSlug: skillSlug || null,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // =====================================================================
  // Memory — CRUD for memory files
  // =====================================================================

  const VALID_LAYERS = ['identity', 'semantic', 'episodic'] as const;

  function validateLayer(layer: string): layer is (typeof VALID_LAYERS)[number] {
    return VALID_LAYERS.includes(layer as (typeof VALID_LAYERS)[number]);
  }

  // List files in a memory layer
  router.get('/api/dashboard/memory/:layer', async (req: Request, res: Response) => {
    const { layer } = req.params;
    if (!validateLayer(layer)) {
      res.status(400).json({ error: 'Invalid layer. Must be: identity, semantic, or episodic' });
      return;
    }

    const dirPath = join(config.userDataDir, 'memory', layer);
    try {
      const files = await readdir(dirPath);
      const fileInfos = await Promise.all(
        files.filter(f => f.endsWith('.md')).map(async (f) => {
          try {
            const st = await stat(join(dirPath, f));
            return { name: f, size: st.size, modified: st.mtime.toISOString() };
          } catch {
            return { name: f, size: 0, modified: '' };
          }
        }),
      );
      res.json({ layer, files: fileInfos });
    } catch {
      res.json({ layer, files: [] });
    }
  });

  // Read a memory file
  router.get('/api/dashboard/memory/:layer/:filename', async (req: Request, res: Response) => {
    const { layer, filename } = req.params;
    if (!validateLayer(layer)) {
      res.status(400).json({ error: 'Invalid layer' });
      return;
    }
    if (!filename.endsWith('.md')) {
      res.status(400).json({ error: 'Only .md files supported' });
      return;
    }

    const filePath = join(config.userDataDir, 'memory', layer, filename);
    try {
      const content = await readFile(filePath, 'utf-8');
      res.json({ layer, filename, content });
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Write/update a memory file
  router.put('/api/dashboard/memory/:layer/:filename', async (req: Request, res: Response) => {
    const { layer, filename } = req.params;
    if (!validateLayer(layer)) {
      res.status(400).json({ error: 'Invalid layer' });
      return;
    }
    if (!filename.endsWith('.md')) {
      res.status(400).json({ error: 'Only .md files supported' });
      return;
    }

    const { content } = req.body as { content?: string };
    if (content === undefined) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const dirPath = join(config.userDataDir, 'memory', layer);
    const filePath = join(dirPath, filename);
    try {
      await mkdir(dirPath, { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      res.json({ status: 'ok', layer, filename });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Delete a memory file
  router.delete('/api/dashboard/memory/:layer/:filename', async (req: Request, res: Response) => {
    const { layer, filename } = req.params;
    if (!validateLayer(layer)) {
      res.status(400).json({ error: 'Invalid layer' });
      return;
    }

    const filePath = join(config.userDataDir, 'memory', layer, filename);
    try {
      await unlink(filePath);
      res.json({ status: 'deleted', layer, filename });
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // =====================================================================
  // Context Snapshot — live SSE of compiled context from vi:ctx:{uid}
  // =====================================================================

  router.get('/api/dashboard/context', (req: Request, res: Response) => {
    const uid = (req.query.uid as string) || config.userId;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', channel: 'ctx', uid })}\n\n`);

    const sub = getSubscriber();
    const channel = channels.ctx(uid);

    const onMessage = (ch: string, message: string) => {
      if (ch !== channel) return;
      res.write(`data: ${message}\n\n`);
    };

    sub.on('message', onMessage);
    sub.subscribe(channel).catch((err: Error) => {
      console.error('[dashboard] context SSE error:', err);
    });

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sub.removeListener('message', onMessage);
      sub.unsubscribe(channel).catch(() => {});
    });
  });

  // =====================================================================
  // Session History — list and read persisted session results
  // =====================================================================

  router.get('/api/dashboard/sessions/history', async (_req: Request, res: Response) => {
    const sessionsDir = join(config.userDataDir, 'sessions');
    try {
      const sessionDirs = await readdir(sessionsDir);
      const results: Array<{
        sessionId: string;
        taskId: string;
        skillSlug: string;
        prompt: string;
        result: string;
        durationMs: number;
        ts: number;
      }> = [];

      for (const sessionId of sessionDirs) {
        if (sessionId === 'active') continue;
        const sessionPath = join(sessionsDir, sessionId);
        try {
          const st = await stat(sessionPath);
          if (!st.isDirectory()) continue;
          const taskFiles = await readdir(sessionPath);
          for (const taskFile of taskFiles) {
            if (!taskFile.endsWith('.json')) continue;
            try {
              const raw = await readFile(join(sessionPath, taskFile), 'utf-8');
              const parsed = JSON.parse(raw);
              results.push(parsed);
            } catch { /* skip malformed */ }
          }
        } catch { /* skip */ }
      }

      // Sort by timestamp descending
      results.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      res.json({ sessions: results });
    } catch {
      res.json({ sessions: [] });
    }
  });

  // Get specific task result
  router.get('/api/dashboard/sessions/:sessionId/:taskId', async (req: Request, res: Response) => {
    const { sessionId, taskId } = req.params;
    const filePath = join(config.userDataDir, 'sessions', sessionId, `${taskId}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      res.json(JSON.parse(raw));
    } catch {
      res.status(404).json({ error: 'Task result not found' });
    }
  });

  return router;
}
