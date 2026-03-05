import { getSubscriber } from '../redis-client.js';
import { channels, type ExecRequest } from './types.js';
import { publishStreamEvent } from './stream-publisher.js';
import { executeTask } from '../executor/task-executor.js';
import { config } from '../config.js';
import { requestContext } from './request-context.js';

const MAX_QUEUE_SIZE = 5;
const taskQueue: ExecRequest[] = [];
let running = false;

/**
 * Process the next task in the queue.
 * Runs sequentially: one task at a time, dequeues next on completion.
 * Each task runs inside a requestContext so stream-publisher routes to the correct user.
 */
async function processNext(): Promise<void> {
  if (running || taskQueue.length === 0) return;

  running = true;
  const request = taskQueue.shift()!;
  const userId = request.userId ?? config.userId;

  try {
    console.log(`[redis][nanoclaw] Executing task ${request.taskId} for user ${userId} (queue: ${taskQueue.length} remaining)`);
    await requestContext.run({ userId }, () => executeTask(request));
  } catch (err) {
    console.error(`[redis][nanoclaw] unhandled error for task ${request.taskId}:`, err);
  } finally {
    running = false;
    // Process next queued task
    if (taskQueue.length > 0) {
      processNext().catch((err) => {
        console.error('[redis][nanoclaw] queue processing error:', err);
      });
    }
  }
}

/**
 * Subscribe to vi:exec:* (pattern) and dispatch incoming execution requests
 * to the skill executor via a bounded task queue.
 *
 * Uses PSUBSCRIBE so NanoClaw doesn't need a pre-configured USER_ID to
 * receive tasks. The userId is extracted from the channel name and carried
 * through the execution chain via AsyncLocalStorage.
 */
export async function startExecHandler(): Promise<void> {
  const sub = getSubscriber();

  sub.on('pmessage', (_pattern: string, ch: string, message: string) => {
    // Extract userId from channel: vi:exec:{userId} → userId
    const userId = ch.slice('vi:exec:'.length);

    try {
      const request: ExecRequest = JSON.parse(message);
      // Ensure userId is on the request (may already be set by API server)
      if (!request.userId) {
        request.userId = userId;
      }

      console.log(`[redis][nanoclaw] Received task ${request.taskId}: skill=${request.skillSlug || 'none'}, user=${userId}, prompt=${request.prompt?.substring(0, 80)}`);

      if (taskQueue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[redis][nanoclaw] queue full (${MAX_QUEUE_SIZE}), rejecting task ${request.taskId}`);
        requestContext.run({ userId }, () =>
          publishStreamEvent({
            type: 'exec_error',
            taskId: request.taskId,
            error: 'Task queue full. Please wait for current tasks to complete.',
            recoverable: true,
          }),
        ).catch((err) => {
          console.error('[redis][nanoclaw] failed to publish queue-full error:', err);
        });
        return;
      }

      taskQueue.push(request);
      processNext().catch((err) => {
        console.error('[redis][nanoclaw] queue processing error:', err);
      });
    } catch (err) {
      console.error('[redis][nanoclaw] failed to parse exec request:', err);
    }
  });

  const pattern = channels.exec('*');
  await sub.psubscribe(pattern);
  console.log(`[redis][nanoclaw] listening on ${pattern} (pattern subscribe)`);
}
