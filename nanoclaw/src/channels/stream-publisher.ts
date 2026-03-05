import { getRedis } from '../redis-client.js';
import { channels, type StreamEvent } from './types.js';
import { config } from '../config.js';

/**
 * Publish a stream event to vi:stream:{uid}.
 * Used by the skill executor to stream results back to the frontend (via SSE Relay).
 * Accepts both card operations (with `op` field) and lifecycle events (with `type` field).
 */
export async function publishStreamEvent(event: StreamEvent): Promise<void> {
  const redis = getRedis();
  const channel = channels.stream(config.userId);

  // Determine the event identifier for logging
  const eventId = 'op' in event ? event.op : event.type;
  const taskId = 'taskId' in event ? event.taskId : 'n/a';

  try {
    await redis.publish(channel, JSON.stringify(event));
    console.log(`[redis][nanoclaw] Published ${eventId}: taskId=${taskId}`);
  } catch (err) {
    console.error(`[redis][nanoclaw] Failed to publish ${eventId}:`, err);
  }
}
