/**
 * Executor module entry point — V3.
 *
 * Creates and configures an ExecutorSelector with the available adapters.
 * Default executors are configurable via env vars:
 *   VI_DEFAULT_FAST_EXECUTOR     (default: gemini-flash)
 *   VI_DEFAULT_THOROUGH_EXECUTOR (default: gemini-flash)
 *   VI_DEFAULT_CODE_EXECUTOR     (default: gemini-flash)
 *   VI_DEFAULT_EXECUTOR          (runtime override for all priorities)
 */

export type {
  TaskRequest,
  TaskChunk,
  ExecutionAdapter,
  ExecutorCapabilities,
  ExecutorSelectorConfig,
  ExecutorStatus,
} from './types.js';
export { ExecutorSelector } from './executor-selector.js';
export { GeminiFlashAdapter } from './gemini-flash-executor.js';
export { NanoClawAdapter } from './nanoclaw-executor.js';
