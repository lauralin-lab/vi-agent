import { getRedis } from '../redis-client.js';
import { channels, type ActionEvent } from './types.js';

/** In-memory buffer of recent actions per user */
const recentActionsMap = new Map<string, ActionEvent[]>();

/** Track last-read stream ID per user */
const lastReadIds = new Map<string, string>();

/** Get recent actions for a user and clear buffer */
export function consumeRecentActions(userId: string): ActionEvent[] {
  const actions = recentActionsMap.get(userId) || [];
  recentActionsMap.delete(userId);
  return actions;
}

/**
 * Poll vi:actions:{uid} Redis Stream for new user action events.
 * Called periodically by the context compiler loop.
 * Uses lastReadId to only read entries not yet processed.
 */
export async function pollActions(userId: string): Promise<ActionEvent[]> {
  const redis = getRedis();
  const streamKey = channels.actions(userId);
  const lastReadId = lastReadIds.get(userId) || '0-0';

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
      lastReadIds.set(userId, id);
    }

    if (actions.length > 0) {
      for (const a of actions) {
        console.log(`[redis][nanoclaw] Action received: user=${userId}, ${a.type}: ${String(a.data?.text || a.data?.page || '').substring(0, 80)}`);
      }
    }
    recentActionsMap.set(userId, actions);
    return actions;
  } catch (err) {
    console.error('[redis][nanoclaw] Failed to poll actions:', err);
    return [];
  }
}
