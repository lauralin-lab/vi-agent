import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getRedis } from '../redis-client.js';
import { channels, type ContextSnapshot, type ActivitySummary } from '../channels/types.js';
import { getLatestFrame } from '../channels/frames-consumer.js';
import { predictIntentions, updateSceneHash } from './intention-predictor.js';
import { consumeRecentActions, pollActions } from '../channels/actions-consumer.js';
import { getAllManifests } from '../skills/skill-loader.js';
import { config } from '../config.js';

let memoryVersion = 0;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Start the 30-second context compilation loop.
 * Reads user memory, activity summary, latest frame, and compiles
 * a <=2000 char context snapshot for all consumers.
 */
export async function startContextCompiler(): Promise<void> {
  console.log(`[redis][nanoclaw] starting (interval: ${config.contextIntervalMs}ms)`);

  const tick = async () => {
    try {
      await compileAndPublish();
    } catch (err) {
      console.error('[redis][nanoclaw] tick error:', err);
    }
  };

  // First tick immediately
  await tick();
  setInterval(tick, config.contextIntervalMs);
}

async function compileAndPublish(): Promise<void> {
  const redis = getRedis();
  const uid = config.userId;

  // 1. Read identity memory (all files)
  const identity = await readMemoryDir(join(config.userDataDir, 'memory', 'identity'));

  // 2. Read semantic memory (top entries)
  const semantic = await readMemoryDir(join(config.userDataDir, 'memory', 'semantic'));

  // 3. Read episodic memory (last 3 days only)
  const episodic = await readRecentMemoryDir(
    join(config.userDataDir, 'memory', 'episodic'),
    THREE_DAYS_MS,
  );

  // 4. Read activity summary from Redis
  const summaryRaw = await redis.get(channels.summary(uid));
  const summary: ActivitySummary | null = summaryRaw ? JSON.parse(summaryRaw) : null;

  // 5. Get latest keyframe
  const frame = getLatestFrame();

  // 6. Read active session
  const session = await readFileOrNull(join(config.userDataDir, 'sessions', 'active', 'current.json'));

  // 7. Compile snapshot (max 2000 chars)
  const parts: string[] = [];

  if (identity) {
    parts.push(`[User Identity]\n${truncate(identity, 400)}`);
  }

  if (semantic) {
    parts.push(`[Memory]\n${truncate(semantic, 300)}`);
  }

  if (episodic) {
    parts.push(`[Recent Episodes]\n${truncate(episodic, 200)}`);
  }

  if (frame) {
    parts.push(`[Visual Context]\nLatest frame: ${frame.frameUrl} (scene: ${frame.sceneHash})`);
  }

  if (summary) {
    parts.push(`[Recent Activity]\n${summary.summary}\nTopics: ${summary.active_topics.join(', ')}\nPage: ${summary.current_page}`);
  }

  if (session) {
    try {
      const s = JSON.parse(session);
      parts.push(`[Active Task]\n${JSON.stringify(s).slice(0, 200)}`);
    } catch {
      // skip malformed session
    }
  }

  // Hints for conversation starters
  parts.push('[Hints]\nAsk about what the user sees, suggest relevant skills, offer proactive help based on context.');

  const snapshot = truncate(parts.join('\n\n'), 2000);
  memoryVersion++;

  // 8. Poll actions from Redis Stream, then consume
  await pollActions();
  const sceneChanged = frame ? updateSceneHash(frame.sceneHash) : false;
  const recentActions = consumeRecentActions();
  const hasNewActivity = sceneChanged || recentActions.length > 0;
  const manifests = await getAllManifests();
  // Pass null for snapshot to signal "reuse cached" when no new activity
  const intentions = hasNewActivity
    ? await predictIntentions(snapshot, frame?.frameUrl, manifests)
    : await predictIntentions(null, frame?.frameUrl, manifests);

  // 8. Publish context snapshot
  const ctx: ContextSnapshot = {
    version: 4,
    ts: Date.now(),
    uid,
    snapshot,
    char_count: snapshot.length,
    memory_version: memoryVersion,
    session_active: summary?.session_active ?? false,
    latest_frame_url: frame?.frameUrl,
    predicted_intentions: intentions,
  };

  await redis.publish(channels.ctx(uid), JSON.stringify(ctx));

  // 9. Publish intentions separately
  if (intentions.length > 0) {
    await redis.publish(
      channels.intent(uid),
      JSON.stringify({ type: 'intention_update', ts: Date.now(), intentions }),
    );
  }

  console.log(`[redis][nanoclaw] Context published (${snapshot.length} chars, ${intentions.length} intentions)`);
}

async function readMemoryDir(dirPath: string): Promise<string | null> {
  try {
    const files = await readdir(dirPath);
    const contents: string[] = [];
    for (const f of files.filter((f) => f.endsWith('.md'))) {
      const text = await readFile(join(dirPath, f), 'utf-8');
      contents.push(text.trim());
    }
    return contents.join('\n') || null;
  } catch {
    return null;
  }
}

/** Read only files modified within the given time window */
async function readRecentMemoryDir(dirPath: string, maxAgeMs: number): Promise<string | null> {
  try {
    const files = await readdir(dirPath);
    const now = Date.now();
    const contents: string[] = [];

    for (const f of files.filter((f) => f.endsWith('.md'))) {
      const filePath = join(dirPath, f);
      const fileStat = await stat(filePath);
      if (now - fileStat.mtimeMs <= maxAgeMs) {
        const text = await readFile(filePath, 'utf-8');
        contents.push(text.trim());
      }
    }

    return contents.join('\n') || null;
  } catch {
    return null;
  }
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
