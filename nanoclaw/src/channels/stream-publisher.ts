import { getRedis } from '../redis-client.js';
import { channels, type StreamEvent } from './types.js';
import { config } from '../config.js';
import { requestContext } from './request-context.js';
import { cardMiddleware } from '../persistence/card-middleware.js';

/**
 * Publish a stream event to vi:stream:{uid}.
 * Used by the skill executor to stream results back to the frontend (via SSE Relay).
 * Accepts both card operations (with `op` field) and lifecycle events (with `type` field).
 *
 * userId resolution: requestContext (per-request) > config.userId (env fallback).
 */
export async function publishStreamEvent(event: StreamEvent): Promise<void> {
  const redis = getRedis();
  const store = requestContext.getStore();
  const uid = store?.userId ?? config.userId;
  const channel = channels.stream(uid);

  // Record card operations to in-memory store for persistence
  if (store?.sessionId) {
    cardMiddleware(store.sessionId, event);
  }

  // Determine the event identifier for logging
  const eventId = 'op' in event ? event.op : event.type;
  const taskId = 'taskId' in event ? event.taskId : 'n/a';

  // Build a meaningful log line with content preview
  let logDetail = `${eventId}: taskId=${taskId}`;
  if ('op' in event) {
    const op = event as unknown as Record<string, unknown>;
    if (op.op === 'create_card') logDetail += ` template=${op.template} cardId=${op.cardId}`;
    else if (op.op === 'stream_to_card') logDetail += ` cardId=${op.cardId} slot=${op.slot} +${String(op.chunk || '').length}ch`;
    else if (op.op === 'html_stream') logDetail += ` cardId=${op.cardId} +${String(op.chunk || '').length}ch done=${op.done}`;
    else if (op.op === 'finalize_card') logDetail += ` cardId=${op.cardId}`;
  } else {
    const ev = event as unknown as Record<string, unknown>;
    if (ev.type === 'exec_start') logDetail += ` prompt="${String(ev.prompt || '').slice(0, 60)}"`;
    else if (ev.type === 'exec_progress') logDetail += ` msg="${String(ev.message || '').slice(0, 80)}"`;
    else if (ev.type === 'exec_result') logDetail += ` summary="${String(ev.summary || '').slice(0, 80)}"`;
    else if (ev.type === 'exec_error') logDetail += ` error="${String(ev.error || '').slice(0, 80)}"`;
  }

  try {
    await redis.publish(channel, JSON.stringify(event));
    console.log(`[stream] ${logDetail}`);
  } catch (err) {
    console.error(`[stream] FAIL ${logDetail}:`, err);
  }
}
