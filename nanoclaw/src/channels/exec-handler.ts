import { getSubscriber } from '../redis-client.js';
import { channels, type ExecRequest } from './types.js';
import { publishStreamEvent } from './stream-publisher.js';
import { executeTask } from '../executor/task-executor.js';
import { config } from '../config.js';

const MAX_QUEUE_SIZE = 5;
const taskQueue: ExecRequest[] = [];
let running = false;

/**
 * Process the next task in the queue.
 * Runs sequentially: one task at a time, dequeues next on completion.
 */
async function processNext(): Promise<void> {
  if (running || taskQueue.length === 0) return;

  running = true;
  const request = taskQueue.shift()!;

  try {
    console.log(`[redis][nanoclaw] Executing task ${request.taskId} (queue: ${taskQueue.length} remaining)`);
    await executeTask(request);
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
 * Subscribe to vi:exec:{uid} and dispatch incoming execution requests
 * to the skill executor via a bounded task queue.
 */
export async function startExecHandler(): Promise<void> {
  const sub = getSubscriber();
  const channel = channels.exec(config.userId);

  sub.on('message', (ch: string, message: string) => {
    if (ch !== channel) return;

    try {
      const request: ExecRequest = JSON.parse(message);
      console.log(`[redis][nanoclaw] Received task ${request.taskId}: skill=${request.skillSlug || 'none'}, prompt=${request.prompt?.substring(0, 80)}`);

      if (taskQueue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[redis][nanoclaw] queue full (${MAX_QUEUE_SIZE}), rejecting task ${request.taskId}`);
        publishStreamEvent({
          type: 'exec_error',
          taskId: request.taskId,
          error: 'Task queue full. Please wait for current tasks to complete.',
          recoverable: true,
        }).catch((err) => {
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

  await sub.subscribe(channel);
  console.log(`[redis][nanoclaw] listening on ${channel}`);
}
