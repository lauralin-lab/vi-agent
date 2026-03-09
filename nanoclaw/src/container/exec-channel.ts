/**
 * Execution Channel — Redis subscriber for vi:exec:{uid}
 *
 * Replaces the old exec-handler.ts + process-pool.ts + queue-router.ts.
 * Subscribes to exec requests via Redis PSUBSCRIBE, routes them to
 * container execution via UserQueue.
 *
 * Flow:
 *   Redis vi:exec:{uid} → parse ExecRequest → UserQueue.enqueueTask()
 *     → runContainerAgent() → stdout CARD_OP/OUTPUT parsing
 *     → publishStreamEvent() → Redis vi:stream:{uid}
 */
import { getSubscriber } from '../redis-client.js';
import { channels, type ExecRequest, type CardOp, type StreamEvent } from '../channels/types.js';
import { publishStreamEvent } from '../channels/stream-publisher.js';
import { requestContext } from '../channels/request-context.js';
import { trackUser } from '../channels/active-users.js';
import { runContainerAgent, type ContainerOutput } from './container-runner.js';
import { UserQueue } from './user-queue.js';
import { config } from '../config.js';
import { getPackage } from '../packages/package-loader.js';
import { cardMiddleware } from '../persistence/card-middleware.js';

// ---------------------------------------------------------------------------
// Singleton queue
// ---------------------------------------------------------------------------

let userQueue: UserQueue | null = null;

export function getUserQueue(): UserQueue {
  if (!userQueue) {
    userQueue = new UserQueue();
  }
  return userQueue;
}

// ---------------------------------------------------------------------------
// Exec request handler
// ---------------------------------------------------------------------------

async function handleExecRequest(
  request: ExecRequest,
  userId: string,
): Promise<void> {
  const taskId = request.taskId;
  const sessionId = request.sessionId;

  // Publish exec_start event
  await requestContext.run({ userId, sessionId }, () =>
    publishStreamEvent({
      type: 'exec_start',
      taskId,
      executor: 'container',
      prompt: request.prompt,
      mediaUrls: request.mediaUrls,
    }),
  );

  try {
    // If a package/skill is specified, load its prompt
    let skillPrompt: string | undefined;
    if (request.skillSlug) {
      const pkg = getPackage(request.skillSlug);
      if (pkg) {
        skillPrompt = pkg.skillPrompt;
        console.log(
          `[exec-channel] using package "${pkg.manifest.id}" for task ${taskId}`,
        );
      }
    }

    // Augment request with skill prompt and userId
    const augmentedRequest = { ...request, userId, skillPrompt };

    // Run in container
    const result = await runContainerAgent(
      augmentedRequest,
      // onCardOp — called for each CARD_OP marker in stdout
      async (op: CardOp) => {
        // Ensure taskId is set on the card op
        if (!op.taskId) {
          op.taskId = taskId;
        }

        // Publish through card middleware (records to card store) and Redis
        await requestContext.run({ userId, sessionId }, () =>
          publishStreamEvent(op as StreamEvent),
        );
      },
      // onOutput — called for each OUTPUT marker (final result)
      async (output: ContainerOutput) => {
        if (output.status === 'success' && output.result) {
          await requestContext.run({ userId, sessionId }, () =>
            publishStreamEvent({
              type: 'exec_result',
              taskId,
              summary: output.result!,
            }),
          );
        } else if (output.status === 'error' && output.error) {
          await requestContext.run({ userId, sessionId }, () =>
            publishStreamEvent({
              type: 'exec_error',
              taskId,
              error: output.error!,
              recoverable: true,
            }),
          );
        }
      },
    );

    // If no explicit result was emitted via OUTPUT markers, publish completion
    if (result.status === 'success') {
      await requestContext.run({ userId, sessionId }, () =>
        publishStreamEvent({
          type: 'exec_result',
          taskId,
          summary: 'Task completed',
        }),
      );
    } else if (result.status === 'error') {
      await requestContext.run({ userId, sessionId }, () =>
        publishStreamEvent({
          type: 'exec_error',
          taskId,
          error: result.error || 'Container execution failed',
          recoverable: false,
        }),
      );
    }
  } catch (err) {
    console.error(`[exec-channel] task ${taskId} failed:`, err);

    await requestContext.run({ userId, sessionId }, () =>
      publishStreamEvent({
        type: 'exec_error',
        taskId,
        error: err instanceof Error ? err.message : String(err),
        recoverable: false,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Start subscription
// ---------------------------------------------------------------------------

/**
 * Subscribe to vi:exec:* and route requests through the UserQueue
 * to container execution.
 */
export async function startExecChannel(): Promise<void> {
  const queue = getUserQueue();
  const sub = getSubscriber();

  sub.on('pmessage', (_pattern: string, ch: string, message: string) => {
    // Guard: only process vi:exec:* channels
    if (!ch.startsWith('vi:exec:')) return;

    // Extract userId from channel: vi:exec:{userId}
    const userId = ch.slice('vi:exec:'.length);
    trackUser(userId);

    try {
      const request: ExecRequest = JSON.parse(message);
      // Ensure userId is on the request
      if (!request.userId) {
        request.userId = userId;
      }

      console.log(
        `[exec-channel] received task ${request.taskId}: skill=${request.skillSlug || 'none'}, user=${userId}, prompt=${request.prompt?.substring(0, 80)}`,
      );

      // Enqueue for container execution
      queue.enqueueTask(userId, request.taskId, () =>
        handleExecRequest(request, userId),
      );
    } catch (err) {
      console.error('[exec-channel] failed to parse exec request:', err);
    }
  });

  const pattern = channels.exec('*');
  await sub.psubscribe(pattern);
  console.log(`[exec-channel] listening on ${pattern} (container execution mode)`);
}

/**
 * Graceful shutdown — stop accepting new tasks, let running containers finish.
 */
export async function stopExecChannel(): Promise<void> {
  if (userQueue) {
    await userQueue.shutdown();
  }
}
