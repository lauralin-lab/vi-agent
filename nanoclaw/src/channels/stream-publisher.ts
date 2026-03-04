import { getRedis } from '../redis-client.js';
import { channels, type StreamEvent } from './types.js';
import { config } from '../config.js';

/**
 * Publish a stream event to vi:stream:{uid}.
 * Used by the skill executor to stream results back to the frontend (via SSE Relay).
 */
export async function publishStreamEvent(event: StreamEvent): Promise<void> {
  const redis = getRedis();
  const channel = channels.stream(config.userId);

  try {
    await redis.publish(channel, JSON.stringify(event));
    console.log(`[redis][nanoclaw] Published ${event.type}: taskId=${'taskId' in event ? event.taskId : 'n/a'}`);
  } catch (err) {
    console.error(`[redis][nanoclaw] Failed to publish ${event.type}:`, err);
  }
}
