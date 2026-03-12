import { dequeueTask } from './queue-router.js';
import { executeTask } from '../executor/task-executor.js';
import { publishStreamEvent } from '../channels/stream-publisher.js';
import { requestContext } from '../channels/request-context.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Process Pool — competing consumer workers for vi:queue
//
// In V5 multi-user mode, the pool replaces the per-user PubSub exec handler.
// Each worker loops: BRPOP task from queue -> execute -> loop.
// Workers are stateless — any worker can serve any user's task.
//
// Lifecycle:
//   startPool(concurrency) — start N workers
//   stopPool()             — graceful shutdown (finish current tasks, stop looping)
//
// SIGTERM handling: the pool sets a shutdown flag so workers finish their
// current task before exiting, preventing abandoned tasks.
// ---------------------------------------------------------------------------

/** Whether the pool is running */
let poolRunning = false;

/** Set to true on shutdown signal — workers will stop after current task */
let shutdownRequested = false;

/** Active worker promises (for awaiting graceful shutdown) */
const activeWorkers: Promise<void>[] = [];

/** Count of currently executing tasks (for health checks) */
let activeTasks = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a pool of concurrent workers that consume from vi:queue.
 *
 * @param concurrency - Number of workers to run in parallel
 */
export function startPool(concurrency: number): void {
  if (poolRunning) {
    console.warn('[process-pool] pool already running');
    return;
  }

  poolRunning = true;
  shutdownRequested = false;
  activeTasks = 0;

  console.log(`[process-pool] starting ${concurrency} workers`);

  for (let i = 0; i < concurrency; i++) {
    const workerPromise = runWorker(i);
    activeWorkers.push(workerPromise);
  }

}

/**
 * Gracefully stop the pool.
 * Workers finish their current task, then exit.
 *
 * @returns Promise that resolves when all workers have stopped
 */
export async function stopPool(): Promise<void> {
  if (!poolRunning) return;

  console.log('[process-pool] stopping pool (waiting for active tasks to finish)...');
  shutdownRequested = true;

  // Wait for all workers to finish
  await Promise.allSettled(activeWorkers);
  activeWorkers.length = 0;

  poolRunning = false;
  console.log('[process-pool] pool stopped');
}

/**
 * Get pool status for health checks.
 */
export function getPoolStatus(): {
  running: boolean;
  shutdownRequested: boolean;
  workerCount: number;
  activeTasks: number;
} {
  return {
    running: poolRunning,
    shutdownRequested,
    workerCount: activeWorkers.length,
    activeTasks,
  };
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

async function runWorker(workerId: number): Promise<void> {
  console.log(`[process-pool] worker-${workerId} started`);

  while (!shutdownRequested) {
    try {
      // Block waiting for a task (5s timeout so we can check shutdown flag)
      const task = await dequeueTask(5);

      if (!task) {
        // Timeout — no tasks available; loop to check shutdown flag
        continue;
      }

      // Execute the task inside request context so stream-publisher routes correctly
      const userId = task.userId ?? config.userId;
      activeTasks++;
      try {
        console.log(
          `[process-pool] worker-${workerId} executing task ${task.taskId} for user ${userId} (session=${task.sessionId})`,
        );
        await requestContext.run({ userId, sessionId: task.sessionId }, () => executeTask(task));
        console.log(
          `[process-pool] worker-${workerId} completed task ${task.taskId}`,
        );
      } catch (err) {
        console.error(
          `[process-pool] worker-${workerId} task ${task.taskId} failed:`,
          err,
        );

        // Publish error event so the client knows the task failed
        try {
          await requestContext.run({ userId }, () =>
            publishStreamEvent({
              type: 'exec_error',
              taskId: task.taskId,
              error: err instanceof Error ? err.message : String(err),
              recoverable: false,
            }),
          );
        } catch (publishErr) {
          console.error(
            `[process-pool] worker-${workerId} failed to publish error:`,
            publishErr,
          );
        }
      } finally {
        activeTasks--;
      }
    } catch (err) {
      // Unexpected error in the worker loop itself (e.g. Redis disconnect)
      console.error(`[process-pool] worker-${workerId} loop error:`, err);

      // Brief backoff before retrying to avoid tight error loops
      if (!shutdownRequested) {
        await sleep(1000);
      }
    }
  }

  console.log(`[process-pool] worker-${workerId} stopped`);
}

// ---------------------------------------------------------------------------
// Shutdown handler
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
