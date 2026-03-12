import { getRedis, getSubscriber } from '../redis-client.js';
import { channels, type MediaEvent, type ExecRequest } from './types.js';
import { trackUser } from './active-users.js';
import { randomUUID } from 'node:crypto';

/**
 * Subscribe to vi:media:* for auto-analysis of uploaded media.
 * When a user uploads a photo/video, API Server publishes to this channel.
 *
 * V4 flow: media events are debounced (3s window) so multiple photos
 * taken in quick succession are batched into a single exec task.
 * NanoClaw dispatches to itself via vi:exec for full analysis.
 *
 * Uses PSUBSCRIBE so it works with any userId (Firebase dynamic users).
 */

/** Pending media per user, keyed by userId */
const pendingMediaMap = new Map<string, { media: MediaEvent[]; timer: ReturnType<typeof setTimeout> | null }>();
const DEBOUNCE_MS = 3000;

export async function startMediaConsumer(): Promise<void> {
  const sub = getSubscriber();

  sub.on('pmessage', async (_pattern: string, ch: string, message: string) => {
    // Guard: only process vi:media:* channels (shared subscriber fires for all patterns)
    if (!ch.startsWith('vi:media:')) return;

    const userId = ch.slice('vi:media:'.length);
    trackUser(userId);

    try {
      const event: MediaEvent = JSON.parse(message);
      console.log(
        `[redis][nanoclaw] Media received: user=${userId}, ${event.mediaType}: ${event.mediaUrl?.substring(0, 80)}`,
      );

      // Get or create pending state for this user
      let pending = pendingMediaMap.get(userId);
      if (!pending) {
        pending = { media: [], timer: null };
        pendingMediaMap.set(userId, pending);
      }

      pending.media.push(event);

      // Reset debounce timer — wait for more photos
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = setTimeout(() => {
        const batch = [...pending!.media];
        pending!.media = [];
        pending!.timer = null;
        dispatchMediaBatch(batch, userId).catch((err) => {
          console.error('[redis][nanoclaw] media batch dispatch failed:', err);
        });
      }, DEBOUNCE_MS);
    } catch (err) {
      console.error('[redis][nanoclaw] error processing media event:', err);
    }
  });

  const pattern = channels.media('*');
  await sub.psubscribe(pattern);
  console.log(`[redis][nanoclaw] subscribed to ${pattern} (pattern subscribe)`);
}

/**
 * Dispatch a batched media analysis as a full exec task via vi:exec:{userId}.
 */
async function dispatchMediaBatch(batch: MediaEvent[], userId: string): Promise<void> {
  if (batch.length === 0) return;

  const imageUrls = batch
    .filter((e) => e.mediaType === 'image')
    .map((e) => e.mediaUrl);
  const videoUrls = batch
    .filter((e) => e.mediaType === 'video')
    .map((e) => e.mediaUrl);

  const mediaCount = imageUrls.length + videoUrls.length;
  const taskId = `media-${randomUUID().slice(0, 8)}`;

  // Build a prompt that asks NanoClaw to describe AND suggest actions
  const photoRef =
    imageUrls.length === 1
      ? 'the user just took a photo'
      : `the user just took ${imageUrls.length} photos`;
  const videoRef =
    videoUrls.length > 0
      ? ` and ${videoUrls.length} video${videoUrls.length > 1 ? 's' : ''}`
      : '';

  const prompt = [
    `[MEDIA AUTO-ANALYSIS] ${photoRef}${videoRef}.`,
    '',
    'Analyze the captured media. Describe what you see concisely (1-2 sentences).',
    'Then suggest 2-3 actionable things you can do with this content.',
    'Present your suggestions as a numbered list the user can choose from.',
    '',
    'For example:',
    '"I see a restaurant menu. I can:',
    '1. Translate the menu items',
    '2. Find similar dishes nearby',
    '3. Calculate estimated calories"',
    '',
    'Be specific to what you actually see in the photo(s).',
  ].join('\n');

  const allMediaUrls = [...imageUrls, ...videoUrls];

  const execRequest: ExecRequest = {
    taskId,
    sessionId: `media-${Date.now()}`,
    prompt,
    context: {
      source: 'media-consumer',
      mediaCount,
    },
    priority: 'fast',
    mediaUrls: allMediaUrls,
    userId,
    ts: Date.now(),
  };

  try {
    const redis = getRedis();
    const execChannel = channels.exec(userId);
    await redis.publish(execChannel, JSON.stringify(execRequest));
    console.log(
      `[redis][nanoclaw] Media auto-dispatch: ${mediaCount} file(s) -> vi:exec:${userId} as ${taskId}`,
    );
  } catch (err) {
    console.error('[redis][nanoclaw] Failed to dispatch media batch:', err);
  }
}
