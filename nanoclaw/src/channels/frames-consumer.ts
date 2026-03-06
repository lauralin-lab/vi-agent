import { getSubscriber } from '../redis-client.js';
import { channels, type KeyframeEvent } from './types.js';
import { trackUser } from './active-users.js';

/** Latest keyframe per user */
const latestFrames = new Map<string, KeyframeEvent>();

/** Get the most recently received keyframe for a user (or any user in single-user mode) */
export function getLatestFrame(userId?: string): KeyframeEvent | null {
  if (userId) return latestFrames.get(userId) ?? null;
  // Fallback: return any frame (for backward compat)
  for (const frame of latestFrames.values()) return frame;
  return null;
}

/**
 * Subscribe to vi:frames:* for keyframe events from the Realtime Agent.
 * Uses PSUBSCRIBE so it works with any userId (Firebase dynamic users).
 */
export async function startFramesConsumer(): Promise<void> {
  const sub = getSubscriber();

  sub.on('pmessage', (_pattern: string, ch: string, message: string) => {
    // Guard: only process vi:frames:* channels (shared subscriber fires for all patterns)
    if (!ch.startsWith('vi:frames:')) return;

    const userId = ch.slice('vi:frames:'.length);
    trackUser(userId);

    try {
      const frame = JSON.parse(message) as KeyframeEvent;
      latestFrames.set(userId, frame);
      console.log(`[redis][nanoclaw] Frame received: user=${userId}, scene=${frame.sceneHash}, change=${frame.hasChange}`);
    } catch (err) {
      console.error('[redis][nanoclaw] Failed to parse keyframe:', err);
    }
  });

  const pattern = channels.frames('*');
  await sub.psubscribe(pattern);
  console.log(`[redis][nanoclaw] Frames consumer listening on ${pattern} (pattern subscribe)`);
}
