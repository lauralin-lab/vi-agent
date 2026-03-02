/**
 * ExecutorSelector — V3 replacement for TaskRouter.
 *
 * Selection cascade:
 *   1. request.executorHint → check status → use if online
 *   2. request.priority mapping:
 *        'fast'     → config.defaultFastExecutor
 *        'thorough' → config.defaultThoroughExecutor
 *        'code'     → config.defaultCodeExecutor
 *   3. env var VI_DEFAULT_EXECUTOR override (runtime swap)
 *   4. Fallback: iterate all adapters, pick first online one
 *
 * Returns null if no adapter is available.
 */

import type { ExecutionAdapter, ExecutorSelectorConfig, TaskRequest } from './types.js';

export class ExecutorSelector {
  private adapters = new Map<string, ExecutionAdapter>();
  private config: ExecutorSelectorConfig;

  constructor(config: ExecutorSelectorConfig) {
    this.config = config;
  }

  /** Register an adapter. Replaces any existing adapter with the same id. */
  register(adapter: ExecutionAdapter): void {
    this.adapters.set(adapter.id, adapter);
    console.log(`[ExecutorSelector] Registered adapter: ${adapter.id} (${adapter.name})`);
  }

  /** Unregister an adapter by id. */
  unregister(id: string): void {
    this.adapters.delete(id);
    console.log(`[ExecutorSelector] Unregistered adapter: ${id}`);
  }

  /** Get a specific adapter by id. */
  get(id: string): ExecutionAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Return all registered adapters. */
  listAll(): ExecutionAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Return all registered adapter ids. */
  listExecutors(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Select the best executor for a request.
   *
   * Selection cascade:
   *   1. request.executorHint → check status → use if online
   *   2. request.priority mapping via config defaults
   *   3. env var VI_DEFAULT_EXECUTOR override
   *   4. Fallback: first online adapter
   */
  async select(request: TaskRequest): Promise<ExecutionAdapter | null> {
    // 1. Executor hint — explicit user/agent request
    if (request.executorHint) {
      const hinted = this.adapters.get(request.executorHint);
      if (hinted) {
        const st = await hinted.status();
        if (st === 'online') {
          console.log(
            `[ExecutorSelector] Hint match: task=${request.taskId} → ${hinted.id} (hint=${request.executorHint})`,
          );
          return hinted;
        }
        console.log(
          `[ExecutorSelector] Hint ${request.executorHint} is ${st}, falling through`,
        );
      }
    }

    // 2. Priority-based mapping
    const priorityMap: Record<string, string> = {
      fast: this.config.defaultFastExecutor,
      thorough: this.config.defaultThoroughExecutor,
      code: this.config.defaultCodeExecutor,
    };
    const preferredId = priorityMap[request.priority];

    // 3. Env var override
    const envOverride = process.env.VI_DEFAULT_EXECUTOR;
    const targetId = envOverride || preferredId;

    if (targetId) {
      const preferred = this.adapters.get(targetId);
      if (preferred) {
        const st = await preferred.status();
        if (st === 'online') {
          console.log(
            `[ExecutorSelector] Selected: task=${request.taskId} priority=${request.priority} → ${preferred.id}`,
          );
          return preferred;
        }
        console.log(
          `[ExecutorSelector] Preferred ${targetId} is ${st}, falling through to fallback`,
        );
      }
    }

    // 4. Fallback: first online adapter
    for (const adapter of this.adapters.values()) {
      const st = await adapter.status();
      if (st === 'online') {
        console.log(
          `[ExecutorSelector] Fallback: task=${request.taskId} priority=${request.priority} → ${adapter.id}`,
        );
        return adapter;
      }
    }

    console.warn(
      `[ExecutorSelector] No adapter available for task=${request.taskId} priority=${request.priority}`,
    );
    return null;
  }

  /** Gracefully close all adapters. */
  async closeAll(): Promise<void> {
    const ids = Array.from(this.adapters.keys());
    console.log(`[ExecutorSelector] Closing ${ids.length} adapter(s): ${ids.join(', ')}`);
    await Promise.allSettled(
      Array.from(this.adapters.values()).map((a) => a.close()),
    );
    this.adapters.clear();
  }
}
