/**
 * UserQueue — Per-user concurrency management for container execution.
 *
 * Adapted from reference nanoclaw GroupQueue. Instead of WhatsApp groups,
 * we manage per-user execution slots for VI Agent exec requests.
 *
 * Key behaviors:
 * - At most MAX_CONCURRENT_CONTAINERS containers running simultaneously
 * - Per-user serialization: one container per user at a time
 * - Fair scheduling: waiting users served in FIFO order when slots free up
 * - Retry with exponential backoff on container failures
 */

import { MAX_CONCURRENT_CONTAINERS } from './container-runtime.js';

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 5000;

interface QueuedTask {
  id: string;
  userId: string;
  fn: () => Promise<void>;
}

interface UserState {
  active: boolean;
  pendingTasks: QueuedTask[];
  retryCount: number;
}

export class UserQueue {
  private users = new Map<string, UserState>();
  private activeCount = 0;
  private waitingUsers: string[] = [];
  private shuttingDown = false;

  private getUser(userId: string): UserState {
    let state = this.users.get(userId);
    if (!state) {
      state = {
        active: false,
        pendingTasks: [],
        retryCount: 0,
      };
      this.users.set(userId, state);
    }
    return state;
  }

  /**
   * Enqueue a task for execution. If the user's slot is free and we're under
   * the concurrency limit, it runs immediately. Otherwise it queues.
   */
  enqueueTask(userId: string, taskId: string, fn: () => Promise<void>): void {
    if (this.shuttingDown) return;

    const state = this.getUser(userId);

    // Prevent double-queuing
    if (state.pendingTasks.some((t) => t.id === taskId)) {
      console.log(`[user-queue] task ${taskId} already queued for ${userId}, skipping`);
      return;
    }

    if (state.active) {
      state.pendingTasks.push({ id: taskId, userId, fn });
      console.log(
        `[user-queue] user ${userId} active, task ${taskId} queued (${state.pendingTasks.length} pending)`,
      );
      return;
    }

    if (this.activeCount >= MAX_CONCURRENT_CONTAINERS) {
      state.pendingTasks.push({ id: taskId, userId, fn });
      if (!this.waitingUsers.includes(userId)) {
        this.waitingUsers.push(userId);
      }
      console.log(
        `[user-queue] at capacity (${this.activeCount}/${MAX_CONCURRENT_CONTAINERS}), task ${taskId} queued`,
      );
      return;
    }

    // Run immediately
    this.runTask(userId, { id: taskId, userId, fn }).catch((err) =>
      console.error(`[user-queue] unhandled error in runTask for ${userId}:`, err),
    );
  }

  private async runTask(userId: string, task: QueuedTask): Promise<void> {
    const state = this.getUser(userId);
    state.active = true;
    this.activeCount++;

    console.log(
      `[user-queue] running task ${task.id} for ${userId} (${this.activeCount}/${MAX_CONCURRENT_CONTAINERS} active)`,
    );

    try {
      await task.fn();
      state.retryCount = 0;
    } catch (err) {
      console.error(`[user-queue] task ${task.id} failed for ${userId}:`, err);
      this.scheduleRetry(userId, state);
    } finally {
      state.active = false;
      this.activeCount--;
      this.drain(userId);
    }
  }

  private scheduleRetry(userId: string, state: UserState): void {
    state.retryCount++;
    if (state.retryCount > MAX_RETRIES) {
      console.error(
        `[user-queue] max retries exceeded for ${userId}, dropping (will retry on next request)`,
      );
      state.retryCount = 0;
      return;
    }

    const delayMs = BASE_RETRY_MS * Math.pow(2, state.retryCount - 1);
    console.log(
      `[user-queue] retry ${state.retryCount}/${MAX_RETRIES} for ${userId} in ${delayMs}ms`,
    );
    setTimeout(() => {
      if (!this.shuttingDown && state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(userId, task).catch((err) =>
          console.error(`[user-queue] retry failed for ${userId}:`, err),
        );
      }
    }, delayMs);
  }

  private drain(userId: string): void {
    if (this.shuttingDown) return;

    const state = this.getUser(userId);

    // Process pending tasks for this user
    if (state.pendingTasks.length > 0) {
      const task = state.pendingTasks.shift()!;
      this.runTask(userId, task).catch((err) =>
        console.error(`[user-queue] drain error for ${userId}:`, err),
      );
      return;
    }

    // Check waiting users for a slot
    this.drainWaiting();
  }

  private drainWaiting(): void {
    while (
      this.waitingUsers.length > 0 &&
      this.activeCount < MAX_CONCURRENT_CONTAINERS
    ) {
      const nextUserId = this.waitingUsers.shift()!;
      const state = this.getUser(nextUserId);

      if (state.pendingTasks.length > 0) {
        const task = state.pendingTasks.shift()!;
        this.runTask(nextUserId, task).catch((err) =>
          console.error(`[user-queue] drain-waiting error for ${nextUserId}:`, err),
        );
      }
    }
  }

  /** Get queue status for health endpoint. */
  getStatus(): {
    activeCount: number;
    maxConcurrent: number;
    waitingUsers: number;
    userStates: Record<string, { active: boolean; pendingCount: number }>;
  } {
    const userStates: Record<string, { active: boolean; pendingCount: number }> = {};
    for (const [userId, state] of this.users) {
      if (state.active || state.pendingTasks.length > 0) {
        userStates[userId] = {
          active: state.active,
          pendingCount: state.pendingTasks.length,
        };
      }
    }

    return {
      activeCount: this.activeCount,
      maxConcurrent: MAX_CONCURRENT_CONTAINERS,
      waitingUsers: this.waitingUsers.length,
      userStates,
    };
  }

  /** Graceful shutdown — let active containers finish. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    console.log(
      `[user-queue] shutting down (${this.activeCount} containers still active, will finish naturally)`,
    );
  }
}
