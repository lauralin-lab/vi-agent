/**
 * Execution Channel — Redis subscriber for vi:exec:{uid}
 *
 * Routes exec requests to persistent per-user containers via filesystem IPC.
 *
 * Flow:
 *   Redis vi:exec:{uid} → parse ExecRequest → container-manager.getOrStartContainer()
 *     → write task to IPC: /workspace/ipc/{userId}/tasks/{taskId}.json
 *     → poll for result: /workspace/ipc/{userId}/results/{taskId}.json
 *     → publish exec_result/exec_error to Redis vi:stream:{uid}
 *
 * Card operations are published directly by agent-runner inside the container
 * to Redis vi:stream:{uid} — exec-channel does NOT handle card ops.
 */
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { getSubscriber } from '../redis-client.js';
import { channels, type ExecRequest, type CardOp, type StreamEvent } from '../channels/types.js';
import { publishStreamEvent } from '../channels/stream-publisher.js';
import { requestContext } from '../channels/request-context.js';
import { trackUser } from '../channels/active-users.js';
import { runContainerAgent, type ContainerOutput } from './container-runner.js';
import { getContainerManager } from './container-manager.js';
import { UserQueue } from './user-queue.js';
import { config } from '../config.js';
import { cardMiddleware } from '../persistence/card-middleware.js';
import { getSessionCardState } from '../persistence/card-store.js';

// ---------------------------------------------------------------------------
// Singleton queue (kept for backward compat and per-user serialization)
// ---------------------------------------------------------------------------

let userQueue: UserQueue | null = null;

export function getUserQueue(): UserQueue {
  if (!userQueue) {
    userQueue = new UserQueue();
  }
  return userQueue;
}

// ---------------------------------------------------------------------------
// Persistent container exec handler (new)
// ---------------------------------------------------------------------------

/** Result polling interval and timeout */
const RESULT_POLL_MS = 300;
const RESULT_TIMEOUT_MS = 300_000; // 5 minutes
const CARDOPS_POLL_MS = 200;

/**
 * Relay card ops from IPC JSONL file to Redis stream.
 * Agent-runner appends card ops as JSON lines; we tail-read and publish.
 * Returns a handle with stop() to terminate polling.
 */
function relayCardOps(
  cardOpsFile: string,
  userId: string,
  sessionId: string,
  startOffset: number = 0,
): { stop: () => Promise<void> } {
  let stopped = false;
  let bytesRead = startOffset;

  /** Read new lines from the JSONL file and publish them */
  const flush = async () => {
    try {
      if (!fs.existsSync(cardOpsFile)) return;
      const stat = fs.statSync(cardOpsFile);

      // Detect file truncation (agent container restart truncates the file)
      if (stat.size < bytesRead) {
        console.log(`[cardops-relay] file truncated: was ${bytesRead} bytes, now ${stat.size} — resetting offset`);
        bytesRead = 0;
      }

      if (stat.size <= bytesRead) return;

      // Read only the new bytes using a file descriptor for precise byte control
      const fd = fs.openSync(cardOpsFile, 'r');
      const newBytes = stat.size - bytesRead;
      const buf = Buffer.alloc(newBytes);
      fs.readSync(fd, buf, 0, buf.length, bytesRead);
      fs.closeSync(fd);
      const newData = buf.toString('utf-8');

      // Find complete lines (ending with \n). Don't process the last chunk
      // if it doesn't end with \n — it might be a partial write.
      const endsWithNewline = newData.endsWith('\n');
      const lines = newData.split('\n');

      // If data ends with \n, last element is empty string — remove it
      // If not, last element is an incomplete line — don't process it
      if (endsWithNewline) {
        lines.pop(); // Remove trailing empty string
      }
      const completeLines = endsWithNewline ? lines : lines.slice(0, -1);

      let processedAll = true;
      let consumedBytes = 0;

      for (const line of completeLines) {
        const lineBytes = Buffer.byteLength(line, 'utf-8') + 1; // +1 for \n

        const trimmed = line.trim();
        if (!trimmed) {
          consumedBytes += lineBytes;
          continue;
        }
        try {
          const op = JSON.parse(trimmed);
          await requestContext.run({ userId, sessionId }, () =>
            publishStreamEvent(op as StreamEvent),
          );
          consumedBytes += lineBytes;
        } catch (err) {
          console.warn(`[cardops-relay] JSON parse error (${trimmed.length} chars): ${err}`);
          // Skip this malformed line and continue with the next
          consumedBytes += lineBytes;
        }
      }

      bytesRead += consumedBytes;
    } catch (err) {
      // File not ready yet — only log if unexpected
      if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[cardops-relay] flush error:`, err);
      }
    }
  };

  const poll = async () => {
    while (!stopped) {
      await flush();
      await new Promise((r) => setTimeout(r, CARDOPS_POLL_MS));
    }
  };

  poll(); // Fire and forget

  return {
    /** Stop polling and do one final flush to catch any trailing card ops */
    stop: async () => {
      stopped = true;
      // Small delay to let agent-runner finish writing card ops after result
      await new Promise((r) => setTimeout(r, 500));
      await flush();
    },
  };
}

async function handleExecRequestPersistent(
  request: ExecRequest,
  userId: string,
): Promise<void> {
  const taskId = request.taskId;
  const sessionId = request.sessionId;
  const startTime = Date.now();
  const manager = getContainerManager();

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
    // Ensure persistent container is running for this user
    await manager.getOrStartContainer(userId);
    manager.resetIdleTimer(userId);

    // Resolve media URLs (local uploads → container paths)
    const resolvedMediaUrls = request.mediaUrls?.map((url) => {
      if (url.startsWith('/uploads/')) {
        return `/workspace/user-data${url}`;
      }
      return url;
    });

    // Skills are handled inside the container by Claude auto-discovery via .claude/skills/.
    // The host just passes the raw prompt — no skill routing or prompt injection needed.
    if (request.skillSlug) {
      console.log(`[exec-channel] skill hint: ${request.skillSlug} for task ${taskId}`);
    }

    // Write task to IPC
    const tasksDir = manager.getIpcTasksDir(userId);
    const taskInput = {
      prompt: request.prompt,
      userId,
      sessionId,
      taskId,
      skillSlug: request.skillSlug,
      mediaUrls: resolvedMediaUrls,
      context: request.context,
    };

    // Atomic write: .tmp → rename to .json
    const taskPath = join(tasksDir, `${taskId}.json`);
    const tmpPath = taskPath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(taskInput));
    fs.renameSync(tmpPath, taskPath);

    console.log(`[exec-channel] task ${taskId} written to IPC for user ${userId}`);

    // Poll for result file AND relay card ops from IPC
    const resultsDir = manager.getIpcResultsDir(userId);
    const resultPath = join(resultsDir, `${taskId}.json`);
    const cardOpsFile = join(config.userDataDir, 'ipc', userId, 'cardops', 'stream.jsonl');

    // Note current file size so relay only reads NEW card ops (not stale from previous tasks)
    let cardOpsOffset = 0;
    try {
      if (fs.existsSync(cardOpsFile)) {
        cardOpsOffset = fs.statSync(cardOpsFile).size;
      }
    } catch { /* file doesn't exist yet */ }

    // Start card ops relay (runs concurrently, stops when result arrives)
    const cardOpsRelay = relayCardOps(cardOpsFile, userId, sessionId, cardOpsOffset);

    const result = await pollForResult(resultPath, RESULT_TIMEOUT_MS);

    // Stop card ops relay (final flush catches replace_card/finalize_card)
    await cardOpsRelay.stop();

    if (result) {
      // Collect finalized card state for persistence in VI Agent session
      const cardState = getSessionCardState(sessionId);
      const cards: Record<string, { template: string; data: Record<string, unknown>; status: string }> = {};
      for (const [cardId, state] of Object.entries(cardState.finalState)) {
        if (state.status !== 'removed') {
          cards[cardId] = { template: state.template, data: state.data, status: state.status };
        }
      }
      const hasCards = Object.keys(cards).length > 0;

      // Publish completion event
      if (result.status === 'success') {
        await requestContext.run({ userId, sessionId }, () =>
          publishStreamEvent({
            type: 'exec_result',
            taskId,
            summary: result.result || 'Task completed',
            ...(hasCards ? { cards } : {}),
          }),
        );
      } else {
        await requestContext.run({ userId, sessionId }, () =>
          publishStreamEvent({
            type: 'exec_error',
            taskId,
            error: result.error || 'Task failed',
            recoverable: true,
          }),
        );
      }
    } else {
      // Timeout waiting for result
      await requestContext.run({ userId, sessionId }, () =>
        publishStreamEvent({
          type: 'exec_error',
          taskId,
          error: 'Timeout waiting for container result',
          recoverable: false,
        }),
      );
    }

    // Persist result
    await persistContainerResult(request, result || { status: 'error', result: null, error: 'Timeout' }, Date.now() - startTime);

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

/**
 * Poll for a result file to appear. Returns parsed result or null on timeout.
 */
async function pollForResult(
  resultPath: string,
  timeoutMs: number,
): Promise<ContainerOutput | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(resultPath)) {
        const raw = await readFile(resultPath, 'utf-8');
        const result: ContainerOutput = JSON.parse(raw);
        // Clean up result file
        try { await unlink(resultPath); } catch { /* ignore */ }
        return result;
      }
    } catch (err) {
      // File might be partially written, retry
    }

    await new Promise((resolve) => setTimeout(resolve, RESULT_POLL_MS));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Legacy one-shot exec handler (backward compat)
// ---------------------------------------------------------------------------

async function handleExecRequestLegacy(
  request: ExecRequest,
  userId: string,
): Promise<void> {
  const taskId = request.taskId;
  const sessionId = request.sessionId;
  const startTime = Date.now();

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
    const augmentedRequest = { ...request, userId };

    let hadOutputMarker = false;
    const result = await runContainerAgent(
      augmentedRequest,
      async (op: CardOp) => {
        if (!op.taskId) op.taskId = taskId;
        await requestContext.run({ userId, sessionId }, () =>
          publishStreamEvent(op as StreamEvent),
        );
      },
      async (output: ContainerOutput) => {
        hadOutputMarker = true;
        if (output.status === 'success' && output.result) {
          await requestContext.run({ userId, sessionId }, () =>
            publishStreamEvent({ type: 'exec_result', taskId, summary: output.result! }),
          );
        } else if (output.status === 'error' && output.error) {
          await requestContext.run({ userId, sessionId }, () =>
            publishStreamEvent({ type: 'exec_error', taskId, error: output.error!, recoverable: true }),
          );
        }
      },
    );

    if (!hadOutputMarker) {
      if (result.status === 'success') {
        await requestContext.run({ userId, sessionId }, () =>
          publishStreamEvent({ type: 'exec_result', taskId, summary: 'Task completed' }),
        );
      } else if (result.status === 'error') {
        await requestContext.run({ userId, sessionId }, () =>
          publishStreamEvent({
            type: 'exec_error', taskId,
            error: result.error || 'Container execution failed',
            recoverable: false,
          }),
        );
      }
    }

    await persistContainerResult(request, result, Date.now() - startTime);
  } catch (err) {
    console.error(`[exec-channel] task ${taskId} failed:`, err);
    await requestContext.run({ userId, sessionId }, () =>
      publishStreamEvent({
        type: 'exec_error', taskId,
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
 * to container execution (persistent or legacy mode).
 */
export async function startExecChannel(): Promise<void> {
  const queue = getUserQueue();
  const sub = getSubscriber();

  // Use persistent container mode by default
  const usePersistentContainers = process.env.PERSISTENT_CONTAINERS !== 'false';

  if (usePersistentContainers) {
    console.log('[exec-channel] using PERSISTENT container mode');
  } else {
    console.log('[exec-channel] using LEGACY (one-shot) container mode');
  }

  sub.on('pmessage', (_pattern: string, ch: string, message: string) => {
    if (!ch.startsWith('vi:exec:')) return;

    const userId = ch.slice('vi:exec:'.length);
    trackUser(userId);

    try {
      const request: ExecRequest = JSON.parse(message);
      if (!request.userId) {
        request.userId = userId;
      }

      console.log(
        `[exec-channel] received task ${request.taskId}: skill=${request.skillSlug || 'none'}, user=${userId}, prompt=${request.prompt?.substring(0, 80)}`,
      );

      const handler = usePersistentContainers
        ? handleExecRequestPersistent
        : handleExecRequestLegacy;

      queue.enqueueTask(userId, request.taskId, () =>
        handler(request, userId),
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
 * Graceful shutdown — stop accepting new tasks, stop all persistent containers.
 */
export async function stopExecChannel(): Promise<void> {
  if (userQueue) {
    await userQueue.shutdown();
  }

  // Stop all persistent containers
  const manager = getContainerManager();
  await manager.stopAll();
}

// ---------------------------------------------------------------------------
// Result persistence
// ---------------------------------------------------------------------------

async function persistContainerResult(
  request: ExecRequest,
  result: ContainerOutput,
  durationMs: number,
): Promise<void> {
  try {
    const resultPath = join(
      config.userDataDir,
      'sessions',
      request.sessionId,
      `${request.taskId}.json`,
    );
    await mkdir(dirname(resultPath), { recursive: true });

    const cardState = getSessionCardState(request.sessionId);
    const cards: Record<string, unknown> = {};
    for (const [cardId, state] of Object.entries(cardState.finalState)) {
      if (state.status !== 'removed') {
        cards[cardId] = { template: state.template, data: state.data, status: state.status };
      }
    }

    await writeFile(
      resultPath,
      JSON.stringify({
        taskId: request.taskId,
        sessionId: request.sessionId,
        skillSlug: request.skillSlug || 'agent:main',
        prompt: request.prompt,
        mediaUrls: request.mediaUrls || [],
        result: result.result?.slice(0, 10000) || '',
        cards: Object.keys(cards).length > 0 ? cards : undefined,
        durationMs,
        ts: Date.now(),
      }),
      'utf-8',
    );
  } catch (err) {
    console.error(`[exec-channel] failed to persist result:`, err);
  }
}
