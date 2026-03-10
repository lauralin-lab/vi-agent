import { getRedis } from '../redis-client.js';
import { channels, type ActionEvent } from './types.js';
import { config } from '../config.js';

/** In-memory buffer of recent actions for the context compiler */
let recentActions: ActionEvent[] = [];

/** Track last-read stream ID to avoid processing duplicates */
let lastReadId = '0-0';

/** Get recent actions and clear buffer */
export function consumeRecentActions(): ActionEvent[] {
  const actions = recentActions;
  recentActions = [];
  return actions;
}

/**
 * Poll vi:actions:{uid} Redis Stream for new user action events.
 * Called periodically by the context compiler loop.
 * Uses lastReadId to only read entries not yet processed.
 */
export async function pollActions(): Promise<ActionEvent[]> {
  const redis = getRedis();
  const streamKey = channels.actions(config.userId);

  try {
    // Read up to 50 new entries since lastReadId
    const entries = await redis.xrange(streamKey, lastReadId, '+', 'COUNT', 50);
    const actions: ActionEvent[] = [];

    for (const [id, fields] of entries) {
      // Skip the entry matching lastReadId (xrange min is inclusive)
      if (id === lastReadId) continue;

      // Fields come as [key, value, key, value, ...]
      for (let i = 0; i < fields.length; i += 2) {
        if (fields[i] === 'data') {
          try {
            actions.push(JSON.parse(fields[i + 1]) as ActionEvent);
          } catch {
            // skip malformed entries
          }
        }
      }
      lastReadId = id;
    }

    if (actions.length > 0) {
      for (const a of actions) {
        console.log(`[redis][nanoclaw] Action received: ${a.type}: ${String(a.data?.text || a.data?.page || '').substring(0, 80)}`);
      }
    }
    recentActions = actions;
    return actions;
  } catch (err) {
    console.error('[redis][nanoclaw] Failed to poll actions:', err);
    return [];
  }
}
