/**
 * Request-scoped context using AsyncLocalStorage.
 * Carries the userId through the execution chain without threading it
 * through every function signature.
 *
 * Usage:
 *   // Set context (exec-handler / process-pool):
 *   requestContext.run({ userId }, () => executeTask(request));
 *
 *   // Read context (stream-publisher, anywhere in the call chain):
 *   const uid = requestContext.getStore()?.userId;
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
  userId: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();
