import { getRedis, getSubscriber } from '../redis-client.js';
import { channels, type MediaEvent, type ExecRequest } from './types.js';
import { config } from '../config.js';
import { randomUUID } from 'node:crypto';

/**
 * Subscribe to vi:media:{uid} for auto-analysis of uploaded media.
 * When a user uploads a photo/video, API Server publishes to this channel.
 *
 * V4 flow: media events are debounced (3s window) so multiple photos
 * taken in quick succession are batched into a single exec task.
 * NanoClaw dispatches to itself via vi:exec for full analysis.
 */

/** Pending media URLs collected during the debounce window */
let pendingMedia: MediaEvent[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 3000;

export async function startMediaConsumer(): Promise<void> {
  const sub = getSubscriber();
  const channel = channels.media(config.userId);

  sub.on('message', async (ch: string, message: string) => {
    if (ch !== channel) return;

    try {
      const event: MediaEvent = JSON.parse(message);
      console.log(
        `[redis][nanoclaw] Media received: ${event.mediaType}: ${event.mediaUrl?.substring(0, 80)}`,
      );

      pendingMedia.push(event);

      // Reset debounce timer — wait for more photos
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const batch = [...pendingMedia];
        pendingMedia = [];
        debounceTimer = null;
        dispatchMediaBatch(batch).catch((err) => {
          console.error('[redis][nanoclaw] media batch dispatch failed:', err);
        });
      }, DEBOUNCE_MS);
    } catch (err) {
      console.error('[redis][nanoclaw] error processing media event:', err);
    }
  });

  await sub.subscribe(channel);
  console.log(`[redis][nanoclaw] subscribed to ${channel}`);
}

/**
 * Dispatch a batched media analysis as a full exec task via vi:exec.
 * This goes through the normal exec-handler queue, so NanoClaw uses
 * its full skill executor (Claude with tools) to analyze and suggest actions.
 */
async function dispatchMediaBatch(batch: MediaEvent[]): Promise<void> {
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
    ts: Date.now(),
  };

  try {
    const redis = getRedis();
    const execChannel = channels.exec(config.userId);
    await redis.publish(execChannel, JSON.stringify(execRequest));
    console.log(
      `[redis][nanoclaw] Media auto-dispatch: ${mediaCount} file(s) → vi:exec as ${taskId}`,
    );
  } catch (err) {
    console.error('[redis][nanoclaw] Failed to dispatch media batch:', err);
  }
}
