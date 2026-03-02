/**
 * Execution Registry types — V3.
 *
 * Core abstractions for gateway task execution pipeline.
 *
 * V3 introduces ExecutionAdapter (replacing TaskExecutor) with:
 *  - Unique ID and capabilities declaration
 *  - Status checking (online/offline/busy)
 *  - Abort support per task
 *  - Hint-based and priority-based routing via ExecutorSelector
 */

// ---------------------------------------------------------------------------
// TaskRequest — what the Realtime Agent sends via RPC
// ---------------------------------------------------------------------------

export interface TaskRequest {
  taskId: string;
  sessionId: string;
  userId: string;
  prompt: string;
  context: {
    photoUrls?: string[];
    visualObservation?: string;
    userMemory?: string;
    conversationSummary?: string;
    memoryContext?: string;
    previousResults?: string[];
    conversationHistory?: Array<{ role: string; content: string }>;
  };
  priority: 'fast' | 'thorough' | 'code';
  executorHint?: string;
}

// ---------------------------------------------------------------------------
// TaskChunk — streamed result pieces from an executor
// ---------------------------------------------------------------------------

export type TaskChunk =
  | { type: 'progress'; step: number; total: number; message: string }
  | { type: 'html_stream'; content: string; done: boolean }
  | { type: 'text_stream'; content: string; done: boolean }
  | { type: 'module'; module_type: ModuleType; data: Record<string, unknown> }
  | { type: 'result'; summary: string; data: unknown }
  | { type: 'error'; message: string; recoverable: boolean };

// ---------------------------------------------------------------------------
// Module types — structured JSON output rendered as native React components
// ---------------------------------------------------------------------------

export type ModuleType =
  | 'place_card'
  | 'checklist'
  | 'weather'
  | 'comparison'
  | 'recipe'
  | 'steps_guide'
  | 'info_card'
  | 'image_gallery';

export const VALID_MODULE_TYPES: ReadonlySet<string> = new Set<ModuleType>([
  'place_card', 'checklist', 'weather', 'comparison',
  'recipe', 'steps_guide', 'info_card', 'image_gallery',
]);

// ---------------------------------------------------------------------------
// ExecutorStatus
// ---------------------------------------------------------------------------

export type ExecutorStatus = 'online' | 'offline' | 'busy';

// ---------------------------------------------------------------------------
// ExecutorCapabilities — declared by each adapter for routing decisions
// ---------------------------------------------------------------------------

export interface ExecutorCapabilities {
  canUseTools: boolean;
  canAccessInternet: boolean;
  canRunCode: boolean;
  maxContextLength: number;
  supportsStreaming: boolean;
  estimatedLatency: 'fast' | 'medium' | 'slow';
}

// ---------------------------------------------------------------------------
// ExecutionAdapter — V3 executor interface (replaces TaskExecutor)
// ---------------------------------------------------------------------------

export interface ExecutionAdapter {
  /** Unique identifier: 'gemini-flash', 'nanoclaw', 'claude-code-cloud', etc. */
  id: string;

  /** Human-readable display name for UI/logging. */
  name: string;

  /** Where this executor runs. */
  location: 'cloud';

  /** Declared capabilities for routing decisions. */
  capabilities: ExecutorCapabilities;

  /** Check whether the executor is ready to accept work. */
  status(): Promise<ExecutorStatus>;

  /** Execute a task request, yielding chunks as they stream in. */
  execute(request: TaskRequest): AsyncGenerator<TaskChunk>;

  /** Abort a running task by taskId. */
  abort(taskId: string): Promise<void>;

  /** Graceful shutdown. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// ExecutorSelectorConfig — configuration for the ExecutorSelector
// ---------------------------------------------------------------------------

export interface ExecutorSelectorConfig {
  defaultFastExecutor: string;
  defaultThoroughExecutor: string;
  defaultCodeExecutor: string;
}

