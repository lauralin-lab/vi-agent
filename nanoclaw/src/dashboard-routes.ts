import { Router, json, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, unlink, stat, access } from 'node:fs/promises';
import { join } from 'node:path';
import Redis from 'ioredis';
import { getRedis, getSubscriber } from './redis-client.js';
import { getAllManifests } from './skills/skill-loader.js';
import { getAllTemplates } from './packages/template-registry.js';
import { getStoreStats } from './persistence/card-store.js';
import { listPackages, getAllPackages, getPackage } from './packages/package-loader.js';
import { getActiveUserIds } from './channels/active-users.js';
import { channels, type ExecRequest } from './channels/types.js';
import { config } from './config.js';

// Pool mode imports — these are always available since we keep the old files
// for backward compatibility. In container mode they just won't be used at runtime.
import { getPoolStatus } from './pool/process-pool.js';
import { getQueueDepths } from './pool/queue-router.js';

const startedAt = Date.now();

export function createDashboardRouter(): Router {
  const router = Router();
  router.use(json({ limit: '20mb' }));

  // =====================================================================
  // Health / Stats API (existing)
  // =====================================================================

  router.get('/api/dashboard/health', async (_req: Request, res: Response) => {
    try {
      const queueDepths = getQueueDepths ? await getQueueDepths() : null;
      // Count persisted sessions from filesystem
      let persistedSessionCount = 0;
      try {
        const sessionsDir = join(config.userDataDir, 'sessions');
        const dirs = await readdir(sessionsDir);
        for (const d of dirs) {
          if (d === 'active') continue;
          try {
            const st = await stat(join(sessionsDir, d));
            if (st.isDirectory()) persistedSessionCount++;
          } catch { /* skip */ }
        }
      } catch { /* no sessions dir */ }

      res.json({
        status: 'ok',
        service: 'nanoclaw',
        mode: config.containerMode ? 'container' : 'legacy',
        userId: config.userId,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        pool: getPoolStatus ? getPoolStatus() : null,
        queues: queueDepths,
        cardStore: getStoreStats(),
        activeUsers: getActiveUserIds(),
        persistedSessions: persistedSessionCount,
        packages: listPackages().length,
      });
    } catch (err) {
      res.status(500).json({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // =====================================================================
  // Skills API — returns user/shared skill manifests (NOT packages)
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
  // Package Skills API — SKILL.md from packages + shared skill manifests
  // =====================================================================

  router.get('/api/dashboard/package-skills', async (_req: Request, res: Response) => {
    try {
      // Skills from packages (have SKILL.md content)
      const pkgs = getAllPackages();
      const packageSkills = pkgs
        .filter((p) => !!p.instructionPrompt)
        .map((p) => ({
          id: p.manifest.id,
          name: p.manifest.name,
          icon: p.manifest.icon,
          category: p.manifest.category,
          description: p.manifest.description,
          skillContent: p.instructionPrompt,
          source: 'package' as const,
        }));

      // Shared/user skills (from skill-loader manifests)
      const manifests = await getAllManifests();
      const sharedSkills = manifests.map((m) => ({
        id: m.slug || m.name,
        name: m.name,
        icon: m.icon || '📋',
        category: m.category || 'shared',
        description: m.description || '',
        skillContent: null as string | null,
        source: 'shared' as const,
      }));

      // Try to load SKILL.md content for shared skills
      for (const skill of sharedSkills) {
        for (const baseDir of [join(config.userDataDir, 'skills'), config.sharedSkillsDir]) {
          try {
            const content = await readFile(join(baseDir, skill.id, 'SKILL.md'), 'utf-8');
            skill.skillContent = content;
            break;
          } catch {
            // Also try instruction.md fallback
            try {
              const content = await readFile(join(baseDir, skill.id, 'instruction.md'), 'utf-8');
              skill.skillContent = content;
              break;
            } catch { /* not found */ }
          }
        }
      }

      res.json({ skills: [...sharedSkills, ...packageSkills] });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // =====================================================================
  // Native Tools API — built-in tools available to the agent
  // =====================================================================

  router.get('/api/dashboard/native-tools', (_req: Request, res: Response) => {
    const nativeTools = [
      { name: 'file_read', icon: '📖', category: 'filesystem', description: 'Read a file from the user workspace' },
      { name: 'file_write', icon: '✏️', category: 'filesystem', description: 'Write content to a file in the user workspace' },
      { name: 'file_list', icon: '📂', category: 'filesystem', description: 'List files in a user workspace directory' },
      { name: 'file_edit', icon: '🔧', category: 'filesystem', description: 'Replace a string in a file' },
      { name: 'memory_update', icon: '🧠', category: 'memory', description: 'Update user memory (long-term profile or topic category notes)' },
      { name: 'publish_card', icon: '🃏', category: 'cards', description: 'Publish a structured card to the session canvas' },
      { name: 'update_card', icon: '🔄', category: 'cards', description: 'Update an existing card\'s data' },
      { name: 'append_to_card', icon: '➕', category: 'cards', description: 'Append items to an array slot in a card' },
      { name: 'oauth_call', icon: '🔑', category: 'integration', description: 'Make an OAuth-authenticated API call (Google, Notion, Slack)' },
      { name: 'web_search', icon: '🔍', category: 'web', description: 'Search the internet for results' },
      { name: 'web_fetch', icon: '🌐', category: 'web', description: 'Fetch content from a URL' },
      { name: 'bash', icon: '💻', category: 'system', description: 'Execute a shell command sandboxed to workspace' },
      { name: 'search', icon: '🔎', category: 'filesystem', description: 'Grep-like content search within workspace' },
    ];
    res.json({ tools: nativeTools });
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
      const { prompt, skillSlug, mediaUrls, uid: requestUid } = req.body as {
        prompt?: string;
        skillSlug?: string;
        mediaUrls?: string[];
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
        mediaUrls: mediaUrls || undefined,
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

  // List category files in memory/
  router.get('/api/dashboard/memory', async (_req: Request, res: Response) => {
    const dirPath = join(config.userDataDir, 'memory');
    try {
      const files = await readdir(dirPath);
      const fileInfos = await Promise.all(
        files.filter(f => f.endsWith('.md')).map(async (f) => {
          try {
            const st = await stat(join(dirPath, f));
            return { name: f, category: f.replace(/\.md$/, ''), size: st.size, modified: st.mtime.toISOString() };
          } catch {
            return { name: f, category: f.replace(/\.md$/, ''), size: 0, modified: '' };
          }
        }),
      );
      res.json({ files: fileInfos });
    } catch {
      res.json({ files: [] });
    }
  });

  // Read a category file
  router.get('/api/dashboard/memory/:filename', async (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;

    const filePath = join(config.userDataDir, 'memory', safeName);
    try {
      const content = await readFile(filePath, 'utf-8');
      res.json({ category: filename.replace(/\.md$/, ''), filename: safeName, content });
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Write/update a category file
  router.put('/api/dashboard/memory/:filename', async (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;

    const { content } = req.body as { content?: string };
    if (content === undefined) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const dirPath = join(config.userDataDir, 'memory');
    const filePath = join(dirPath, safeName);
    try {
      await mkdir(dirPath, { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      res.json({ status: 'ok', category: filename.replace(/\.md$/, ''), filename: safeName });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Delete a category file
  router.delete('/api/dashboard/memory/:filename', async (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    const safeName = filename.endsWith('.md') ? filename : `${filename}.md`;

    const filePath = join(config.userDataDir, 'memory', safeName);
    try {
      await unlink(filePath);
      res.json({ status: 'deleted', filename: safeName });
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
    const sessionId = req.params.sessionId as string;
    const taskId = req.params.taskId as string;
    const filePath = join(config.userDataDir, 'sessions', sessionId, `${taskId}.json`);
    try {
      const raw = await readFile(filePath, 'utf-8');
      res.json(JSON.parse(raw));
    } catch {
      res.status(404).json({ error: 'Task result not found' });
    }
  });

  // =====================================================================
  // Package Gallery — list and inspect experience packages (T8)
  // =====================================================================

  /** List all loaded packages with their manifests */
  router.get('/api/dashboard/packages', (_req: Request, res: Response) => {
    try {
      const pkgs = getAllPackages();
      res.json({
        packages: pkgs.map((p) => ({
          id: p.manifest.id,
          name: p.manifest.name,
          version: p.manifest.version,
          description: p.manifest.description,
          icon: p.manifest.icon,
          category: p.manifest.category,
          hasAppMode: !!p.manifest.app_mode,
          templateCount: p.templates.length,
          toolCount: p.toolDefinitions.length,
          hasInstructionPrompt: !!p.instructionPrompt,
          resolvedPath: p.resolvedPath,
        })),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /** Get full details of a specific package */
  router.get('/api/dashboard/packages/:packageId', (req: Request, res: Response) => {
    const packageId = req.params.packageId as string;
    const pkg = getPackage(packageId);
    if (!pkg) {
      res.status(404).json({ error: `Package "${packageId}" not found` });
      return;
    }

    res.json({
      manifest: pkg.manifest,
      instructionPrompt: pkg.instructionPrompt,
      templates: pkg.templates,
      toolDefinitions: pkg.toolDefinitions,
      resolvedPath: pkg.resolvedPath,
    });
  });

  /** List examples for a package (from packages/{id}/examples/) */
  router.get('/api/dashboard/packages/:packageId/examples', async (req: Request, res: Response) => {
    const packageId = req.params.packageId as string;
    const pkg = getPackage(packageId);
    if (!pkg) {
      res.status(404).json({ error: `Package "${packageId}" not found` });
      return;
    }

    const examplesDir = join(pkg.resolvedPath, 'examples');
    try {
      await access(examplesDir);
      const files = await readdir(examplesDir);
      const examples = await Promise.all(
        files.filter((f) => f.endsWith('.json')).map(async (f) => {
          try {
            const raw = await readFile(join(examplesDir, f), 'utf-8');
            return { filename: f, ...JSON.parse(raw) };
          } catch {
            return { filename: f, error: 'failed to parse' };
          }
        }),
      );
      res.json({ packageId, examples });
    } catch {
      res.json({ packageId, examples: [] });
    }
  });

  // =====================================================================
  // Live Tester — execute a package skill interactively (T8)
  // =====================================================================

  /** Send a test execution request for a specific package */
  router.post('/api/dashboard/packages/:packageId/test', async (req: Request, res: Response) => {
    try {
      const packageId = req.params.packageId as string;
      const pkg = getPackage(packageId);
      if (!pkg) {
        res.status(404).json({ error: `Package "${packageId}" not found` });
        return;
      }

      const { prompt, mediaUrls, uid: requestUid } = req.body as {
        prompt?: string;
        mediaUrls?: string[];
        uid?: string;
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }

      const uid = requestUid || config.userId;
      const taskId = `test-${packageId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const sessionId = `test-session-${packageId}-${new Date().toISOString().slice(0, 10)}`;

      const execRequest: ExecRequest = {
        taskId,
        sessionId,
        prompt: prompt.trim(),
        skillSlug: packageId,
        mediaUrls: mediaUrls || undefined,
        ts: Date.now(),
        userId: uid,
      };

      const redis = getRedis();
      await redis.publish(channels.exec(uid), JSON.stringify(execRequest));

      res.json({
        status: 'sent',
        taskId,
        sessionId,
        packageId,
        uid,
        message: `Test execution started. Subscribe to SSE at /api/dashboard/sse?uid=${uid} to watch results.`,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // =====================================================================
  // Save as Example — capture a test run result as a package example (T9)
  // =====================================================================

  /** Save a completed test run as an example for a package */
  router.post('/api/dashboard/packages/:packageId/examples', async (req: Request, res: Response) => {
    try {
      const packageId = req.params.packageId as string;
      const pkg = getPackage(packageId);
      if (!pkg) {
        res.status(404).json({ error: `Package "${packageId}" not found` });
        return;
      }

      const { name, description, prompt, mediaUrls, cardState, result } = req.body as {
        name?: string;
        description?: string;
        prompt?: string;
        mediaUrls?: string[];
        cardState?: unknown;
        result?: unknown;
      };

      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      // Build example JSON
      const example = {
        id: `example-${Date.now()}-${randomUUID().slice(0, 8)}`,
        name: name.trim(),
        description: description?.trim() || '',
        prompt: prompt?.trim() || '',
        mediaUrls: mediaUrls || [],
        cardState: cardState || null,
        result: result || null,
        savedAt: new Date().toISOString(),
        savedBy: 'dashboard',
      };

      // Save to packages/{id}/examples/
      const examplesDir = join(pkg.resolvedPath, 'examples');
      await mkdir(examplesDir, { recursive: true });

      const filename = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.json`;
      const filePath = join(examplesDir, filename);

      await writeFile(filePath, JSON.stringify(example, null, 2), 'utf-8');

      res.json({
        status: 'saved',
        packageId,
        filename,
        exampleId: example.id,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /** Delete an example */
  router.delete('/api/dashboard/packages/:packageId/examples/:filename', async (req: Request, res: Response) => {
    const packageId = req.params.packageId as string;
    const filename = req.params.filename as string;
    const pkg = getPackage(packageId);
    if (!pkg) {
      res.status(404).json({ error: `Package "${packageId}" not found` });
      return;
    }

    const filePath = join(pkg.resolvedPath, 'examples', filename);
    try {
      await unlink(filePath);
      res.json({ status: 'deleted', packageId, filename });
    } catch {
      res.status(404).json({ error: 'Example not found' });
    }
  });

  // =====================================================================
  // APIs — list API providers derived from package manifests
  // =====================================================================

  router.get('/api/dashboard/apis', (_req: Request, res: Response) => {
    try {
      const pkgs = getAllPackages();
      const providerMap = new Map<string, {
        provider: string;
        envVar?: string;
        required: boolean;
        packages: string[];
        configured: boolean;
      }>();

      for (const pkg of pkgs) {
        const manifest = pkg.manifest as unknown as Record<string, unknown>;
        const apis = (manifest.apis || manifest.api_keys || []) as Array<{
          provider: string;
          envVar?: string;
          env_var?: string;
          required?: boolean;
        }>;

        for (const api of apis) {
          const key = api.provider;
          const envVar = api.envVar || api.env_var;
          if (!providerMap.has(key)) {
            providerMap.set(key, {
              provider: key,
              envVar,
              required: api.required ?? false,
              packages: [],
              configured: envVar ? !!process.env[envVar] : false,
            });
          }
          providerMap.get(key)!.packages.push(
            (manifest.id as string) || (manifest.name as string) || 'unknown',
          );
        }
      }

      // Also scan environment for common AI API keys
      const commonKeys = [
        { provider: 'OpenAI', envVar: 'OPENAI_API_KEY' },
        { provider: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
        { provider: 'Google AI', envVar: 'GOOGLE_API_KEY' },
        { provider: 'Google AI (alt)', envVar: 'GEMINI_API_KEY' },
      ];
      for (const k of commonKeys) {
        if (!providerMap.has(k.provider)) {
          providerMap.set(k.provider, {
            provider: k.provider,
            envVar: k.envVar,
            required: false,
            packages: [],
            configured: !!process.env[k.envVar],
          });
        }
      }

      res.json({ apis: Array.from(providerMap.values()) });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const ALLOWED_ENV_VARS = new Set([
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'OPENAI_API_KEY',
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
  ]);

  router.put('/api/dashboard/apis/keys', (req: Request, res: Response) => {
    try {
      const { envVar, value } = req.body as { envVar: string; value: string };
      if (!envVar || !value) {
        res.status(400).json({ error: 'envVar and value are required' });
        return;
      }
      if (!ALLOWED_ENV_VARS.has(envVar)) {
        res.status(400).json({ error: 'Environment variable not in allowlist' });
        return;
      }
      process.env[envVar] = value;
      res.json({ status: 'set', envVar });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // =====================================================================
  // File Upload — proxy to API server's GCS presigned URL flow
  // Falls back to local storage if API server is unavailable.
  // =====================================================================

  router.post('/api/dashboard/upload', async (req: Request, res: Response) => {
    try {
      const { dataUrl, filename } = req.body as { dataUrl: string; filename?: string };
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        res.status(400).json({ error: 'dataUrl is required (data:... format)' });
        return;
      }

      // Parse data URL
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        res.status(400).json({ error: 'Invalid data URL format' });
        return;
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';

      // Try GCS via API server presigned URL
      try {
        const uid = config.userId;
        const presignUrl = `${config.apiServerUrl}/api/upload/presign?ext=${ext}&size=${buffer.length}&vi_user_id=${encodeURIComponent(uid)}`;
        const presignRes = await fetch(presignUrl, {
          headers: { 'X-Internal-Token': config.internalApiToken },
        });

        if (presignRes.ok) {
          const { presigned_url, public_url, content_type } = await presignRes.json() as {
            presigned_url: string;
            public_url: string;
            content_type: string;
          };

          // Upload to GCS
          const uploadRes = await fetch(presigned_url, {
            method: 'PUT',
            headers: { 'Content-Type': content_type },
            body: buffer,
          });

          if (uploadRes.ok) {
            res.json({ url: public_url, mimeType, size: buffer.length });
            return;
          }
        }
      } catch {
        // GCS upload failed, fall back to local
      }

      // Fallback: save locally
      const fileId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
      const finalFilename = filename || `upload-${fileId}.${ext}`;
      const uploadsDir = join(config.userDataDir, 'uploads');
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, finalFilename), buffer);
      res.json({ url: `/uploads/${finalFilename}`, mimeType, size: buffer.length });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Error handler — catch body-parser "request aborted" and other middleware errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.use((err: any, _req: Request, res: Response, next: Function) => {
    if (err.type === 'request.aborted' || err.message === 'request aborted') {
      // Client disconnected before body was fully read — not worth logging
      if (!res.headersSent) {
        res.status(400).json({ error: 'Request aborted by client' });
      }
      return;
    }
    next(err);
  });

  return router;
}
