import { getRedis } from '../redis-client.js';
import { channels, type ExecRequest } from '../channels/types.js';

// ---------------------------------------------------------------------------
// Queue Router — manages the vi:queue task queue for competing consumers
//
// In V5, NanoClaw runs as a pool of stateless workers instead of one process
// per user. Tasks are enqueued into vi:queue (a Redis list) and workers
// BRPOP from it. This gives us:
//   - Fair scheduling across all users
//   - Horizontal scaling by adding more workers
//   - No per-user process overhead
//
// Queue structure:
//   vi:queue           — main task queue (normal + thorough priority)
//   vi:queue:fast      — fast-path queue (polled first for lower latency)
// ---------------------------------------------------------------------------

const FAST_QUEUE = 'vi:queue:fast';
const MAIN_QUEUE = channels.queue;

/**
 * Dequeue the next task from the queue.
 * Checks the fast queue first, then falls back to the main queue.
 *
 * Uses BRPOP with a timeout so workers can check for shutdown signals.
 *
 * @param timeoutSeconds - How long to block waiting for a task (default: 5)
 * @returns The dequeued ExecRequest, or null if timeout elapsed
 */
export async function dequeueTask(
  timeoutSeconds: number = 5,
): Promise<ExecRequest | null> {
  const redis = getRedis();

  // BRPOP checks queues in order: fast queue first, then main queue
  // This gives fast-priority tasks lower latency
  const result = await redis.brpop(FAST_QUEUE, MAIN_QUEUE, timeoutSeconds);

  if (!result) {
    return null; // timeout — no tasks available
  }

  const [queue, payload] = result;

  try {
    const execRequest = JSON.parse(payload) as ExecRequest;
    console.log(
      `[queue-router] dequeued task ${execRequest.taskId} from ${queue} (session=${execRequest.sessionId})`,
    );
    return execRequest;
  } catch (err) {
    console.error(`[queue-router] failed to parse task from ${queue}:`, err);
    return null;
  }
}

/**
 * Get the current queue depths (for monitoring/health checks).
 */
export async function getQueueDepths(): Promise<{
  fast: number;
  main: number;
  total: number;
}> {
  const redis = getRedis();
  const [fast, main] = await Promise.all([
    redis.llen(FAST_QUEUE),
    redis.llen(MAIN_QUEUE),
  ]);
  return { fast, main, total: fast + main };
}
