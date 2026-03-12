import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getRedis } from '../redis-client.js';
import { channels, type ContextSnapshot, type ActivitySummary } from '../channels/types.js';
import { readFileOrNull } from '../fs/user-fs.js';
import { getLatestFrame } from '../channels/frames-consumer.js';
import { predictIntentions, updateSceneHash } from './intention-predictor.js';
import { consumeRecentActions, pollActions } from '../channels/actions-consumer.js';
import { getAllManifests } from '../skills/skill-loader.js';
import { getActiveUserIds } from '../channels/active-users.js';
import { config } from '../config.js';

const memoryVersions = new Map<string, number>();

// ---------------------------------------------------------------------------
// Efficiency tracking — avoid wasting tokens/CPU when nothing changed
// ---------------------------------------------------------------------------

/** Cached memory file mtimes per directory — skip re-reading if unchanged */
const memoryMtimes = new Map<string, Map<string, number>>(); // dir → (file → mtime)

/** Last published snapshot hash per user — skip Redis publish if identical */
const lastSnapshotHash = new Map<string, string>();

/** Last activity timestamp per user — for idle detection */
const lastUserActivity = new Map<string, number>();

/** Cached memory content per directory — reuse when mtimes unchanged */
const memoryCache = new Map<string, string | null>();

/** Consecutive idle ticks per user (no changes detected) */
const idleTicks = new Map<string, number>();

/** Idle threshold: after this many consecutive idle ticks, reduce frequency */
const IDLE_TICK_THRESHOLD = 10; // 10 ticks × 30s = 5 minutes

/**
 * Start the 30-second context compilation loop.
 * Reads user memory, activity summary, latest frame, and compiles
 * a <=2000 char context snapshot for all active users.
 *
 * Efficiency rules:
 * - No active users → skip entirely (no reads, no API calls)
 * - Memory files unchanged (mtime) → reuse cached content
 * - Compiled snapshot identical to last → skip Redis publish
 * - User idle >5 min → skip every other tick (effective 60s interval)
 * - Intention predictor only called when scene or actions changed
 */
export async function startContextCompiler(): Promise<void> {
  console.log(`[context-compiler] starting (interval: ${config.contextIntervalMs}ms)`);

  let tickCount = 0;

  const tick = async () => {
    tickCount++;
    try {
      await compileForActiveUsers(tickCount);
    } catch (err) {
      console.error('[context-compiler] tick error:', err);
    }
  };

  // First tick immediately
  await tick();
  setInterval(tick, config.contextIntervalMs);
}

async function compileForActiveUsers(tickCount: number): Promise<void> {
  const userIds = getActiveUserIds();

  // No active users → skip entirely
  if (userIds.length === 0) {
    return;
  }

  for (const uid of userIds) {
    // Idle detection: if user has been idle, skip every other tick
    const userIdleTicks = idleTicks.get(uid) ?? 0;
    if (userIdleTicks >= IDLE_TICK_THRESHOLD && tickCount % 2 !== 0) {
      continue; // Skip this tick for idle users (effective 60s interval)
    }

    try {
      await compileAndPublish(uid);
    } catch (err) {
      console.error(`[context-compiler] compile error for user ${uid}:`, err);
    }
  }
}

async function compileAndPublish(uid: string): Promise<void> {
  const redis = getRedis();

  // 1. Read MEMORY.md (long-term identity)
  const memoryMdPath = join(config.userDataDir, 'MEMORY.md');
  let identity: string | null = null;
  try {
    identity = await readFile(memoryMdPath, 'utf-8');
  } catch { /* no MEMORY.md yet */ }

  // 2. Read category topic files (memory/*.md)
  const categoryDir = join(config.userDataDir, 'memory');
  const categories = await readMemoryDirCached(categoryDir);

  // 4. Read activity summary from Redis
  const summaryRaw = await redis.get(channels.summary(uid));
  const summary: ActivitySummary | null = summaryRaw ? JSON.parse(summaryRaw) : null;

  // 5. Get latest keyframe for this user
  const frame = getLatestFrame(uid);

  // 6. Read active session
  const session = await readFileOrNull(join(config.userDataDir, 'sessions', 'active', 'current.json'));

  // 7. Compile snapshot (max 2000 chars)
  const parts: string[] = [];

  if (identity) {
    parts.push(`[User Identity]\n${truncate(identity, 400)}`);
  }

  if (categories) {
    parts.push(`[Topic Notes]\n${truncate(categories, 400)}`);
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

  // 8. Poll actions from Redis Stream, then consume
  await pollActions(uid);
  const sceneChanged = frame ? updateSceneHash(frame.sceneHash) : false;
  const recentActions = consumeRecentActions(uid);
  const hasNewActivity = sceneChanged || recentActions.length > 0;

  // Track idle state
  if (hasNewActivity) {
    lastUserActivity.set(uid, Date.now());
    idleTicks.set(uid, 0);
  } else {
    idleTicks.set(uid, (idleTicks.get(uid) ?? 0) + 1);
  }

  // 9. Snapshot hash dedup — skip publish if identical to last
  const snapshotHash = createHash('md5').update(snapshot).digest('hex');
  const prevHash = lastSnapshotHash.get(uid);

  if (snapshotHash === prevHash && !hasNewActivity) {
    // Nothing changed — skip Redis publish and intention prediction entirely
    return;
  }

  lastSnapshotHash.set(uid, snapshotHash);

  const version = (memoryVersions.get(uid) ?? 0) + 1;
  memoryVersions.set(uid, version);

  // 10. Predict intentions (only when scene or actions changed)
  const manifests = await getAllManifests();
  const intentions = hasNewActivity
    ? await predictIntentions(snapshot, frame?.frameUrl, manifests)
    : await predictIntentions(null, frame?.frameUrl, manifests);

  // 11. Publish context snapshot
  const ctx: ContextSnapshot = {
    version: 5,
    ts: Date.now(),
    uid,
    snapshot,
    char_count: snapshot.length,
    memory_version: version,
    session_active: summary?.session_active ?? false,
    latest_frame_url: frame?.frameUrl,
    predicted_intentions: intentions,
  };

  await redis.publish(channels.ctx(uid), JSON.stringify(ctx));

  // 12. Publish intentions channel
  if (intentions.length > 0) {
    await redis.publish(
      channels.intent(uid),
      JSON.stringify({ type: 'intention_update', ts: Date.now(), intentions }),
    );
  }

  console.log(`[context-compiler] published for ${uid} (${snapshot.length} chars, ${intentions.length} intentions, idle=${idleTicks.get(uid) ?? 0})`);
}

/**
 * Read a memory directory with mtime-based caching.
 * Only re-reads files whose mtime has changed since last check.
 * Returns cached content when all files are unchanged.
 */
async function readMemoryDirCached(dirPath: string): Promise<string | null> {
  try {
    const files = await readdir(dirPath);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    if (mdFiles.length === 0) return null;

    // Check mtimes against cache
    const cachedMtimes = memoryMtimes.get(dirPath);
    let anyChanged = !cachedMtimes; // first call = always read

    const currentMtimes = new Map<string, number>();
    for (const f of mdFiles) {
      const fileStat = await stat(join(dirPath, f));
      currentMtimes.set(f, fileStat.mtimeMs);
      if (!anyChanged && cachedMtimes) {
        const prevMtime = cachedMtimes.get(f);
        if (prevMtime === undefined || prevMtime !== fileStat.mtimeMs) {
          anyChanged = true;
        }
      }
    }

    // Also check if files were deleted
    if (!anyChanged && cachedMtimes && cachedMtimes.size !== currentMtimes.size) {
      anyChanged = true;
    }

    if (!anyChanged) {
      // All mtimes identical — return cached content
      return memoryCache.get(dirPath) ?? null;
    }

    // Re-read all files and update cache
    const contents: string[] = [];
    for (const f of mdFiles) {
      const text = await readFile(join(dirPath, f), 'utf-8');
      contents.push(text.trim());
    }
    const result = contents.join('\n') || null;

    memoryMtimes.set(dirPath, currentMtimes);
    memoryCache.set(dirPath, result);

    return result;
  } catch {
    return null;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
