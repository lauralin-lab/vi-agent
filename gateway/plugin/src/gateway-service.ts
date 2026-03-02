/**
 * GatewayService — Standalone LiveKit Room participant (V3).
 *
 * Self-contained service that:
 *   1. Joins a LiveKit Room as "gateway-{ts}" (Lazy Join with idle timeout)
 *   2. Registers RPC handlers: dispatch_task, cancel_task
 *   3. Routes tasks via ExecutorSelector to adapters (GeminiFlash, NanoClaw, etc.)
 *   4. Streams results to Frontend via DataChannel topic "vi-gateway"
 *
 * Uses @livekit/rtc-node and livekit-server-sdk directly.
 */

import {
  Room,
  RoomEvent,
  RpcInvocationData,
  type RemoteParticipant,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import type { TaskRequest } from './executors/types.js';
import { VALID_MODULE_TYPES } from './executors/types.js';
import { ExecutorSelector } from './executors/executor-selector.js';

// API Server URL for memory persistence (Docker internal network)
const API_BASE_URL = process.env.API_BASE_URL || 'http://api-server:8000';

// ---------------------------------------------------------------------------
// Module Detection — structured JSON output for native rendering
// ---------------------------------------------------------------------------

/** Strip markdown code fences (```json ... ```) from LLM output. */
function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    // Remove opening fence (```json or ```)
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline === -1) return trimmed;
    let inner = trimmed.slice(firstNewline + 1);
    // Remove closing fence
    if (inner.trimEnd().endsWith('```')) {
      inner = inner.trimEnd().slice(0, -3).trimEnd();
    }
    return inner;
  }
  return trimmed;
}

/** Try to parse accumulated text as a module JSON. Returns parsed module or null. */
function tryParseModule(text: string): { module_type: string; data: Record<string, unknown> } | null {
  try {
    const cleaned = stripJsonFences(text);
    if (!cleaned.startsWith('{')) return null;
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.module === 'string' &&
      VALID_MODULE_TYPES.has(parsed.module) &&
      parsed.data &&
      typeof parsed.data === 'object'
    ) {
      return { module_type: parsed.module, data: parsed.data };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTML Sanitization Helpers
// ---------------------------------------------------------------------------

/** Strip full-page boilerplate, extracting only <body> inner content. */
function stripBoilerplate(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : html;
}

/** Remove all <script> tags and their content for XSS prevention. */
function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

// ---------------------------------------------------------------------------
// Content Extraction
// ---------------------------------------------------------------------------

interface ContentSummary {
  text: string;        // Plain text summary, <=500 chars
  headings: string[];  // All h1-h6 text
  key_data: string[];  // Table data, list items
  media: string[];     // img alt text
  interactive: string[]; // data-action button text
}

/** Extract a structured content summary from accumulated HTML for agent context. */
function extractContentSummary(html: string): ContentSummary {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  const headings = [...html.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, ''));
  const key_data = [
    ...html.matchAll(/<td[^>]*>(.*?)<\/td>/gi),
    ...html.matchAll(/<li[^>]*>(.*?)<\/li>/gi),
  ].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const media = [...html.matchAll(/<img[^>]*alt="([^"]*)"[^>]*>/gi)].map(m => m[1]);
  const interactive = [...html.matchAll(/data-action="[^"]*"[^>]*>(.*?)</gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim());
  return { text, headings, key_data: key_data.slice(0, 20), media, interactive };
}

// ---------------------------------------------------------------------------
// Media Optimization
// ---------------------------------------------------------------------------

/** Create a stateful media optimizer that tracks image count across chunks. */
function createMediaOptimizer() {
  let imageCount = 0;

  return {
    optimizeChunk(html: string): string {
      // Optimize images
      let result = html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
        imageCount++;
        const priorityAttrs = imageCount <= 2
          ? 'fetchpriority="high" decoding="async"'
          : 'loading="lazy" decoding="async" fetchpriority="low"';
        const styleAttr = 'style="background:#1a1a1a;border-radius:0.5rem;max-width:100%;height:auto"';
        const errorAttr = 'onerror="this.style.display=\'none\'"';

        // Remove existing conflicting attributes
        let cleanAttrs = attrs
          .replace(/\s*(fetchpriority|decoding|loading|onerror)="[^"]*"/gi, '')
          .trim();

        // Merge style: append to existing or add new
        const existingStyle = cleanAttrs.match(/style="([^"]*)"/i);
        if (existingStyle) {
          cleanAttrs = cleanAttrs.replace(
            /style="([^"]*)"/i,
            `style="${existingStyle[1]};background:#1a1a1a;border-radius:0.5rem;max-width:100%;height:auto"`,
          );
          return `<img ${cleanAttrs} ${priorityAttrs} ${errorAttr}>`;
        }
        return `<img ${cleanAttrs} ${priorityAttrs} ${styleAttr} ${errorAttr}>`;
      });

      // Optimize videos
      result = result.replace(/<video\b([^>]*)>/gi, (_match, attrs: string) => {
        let cleanAttrs = attrs
          .replace(/\s*(playsinline|preload|controls|muted)\b(="[^"]*")?/gi, '')
          .trim();
        return `<video ${cleanAttrs} playsinline preload="metadata" controls muted>`;
      });

      // Convert gs:// protocol references to HTTPS format
      result = result.replace(/gs:\/\/([^/]+)\/([^"'\s<>]+)/gi, (_match, bucket: string, key: string) => {
        console.log(`[MediaOptimizer] Detected GCS URL: gs://${bucket}/${key}`);
        return `https://storage.googleapis.com/${bucket}/${key}`;
      });

      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GatewayServiceConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** Idle timeout before auto-disconnect (ms). Default: 5 minutes. */
  idleTimeoutMs?: number;
  /** Check interval for idle detection (ms). Default: 30 seconds. */
  idleCheckIntervalMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_IDLE_CHECK_MS = 30 * 1000; // 30 seconds

// ---------------------------------------------------------------------------
// Active task tracking (for cancel support)
// ---------------------------------------------------------------------------

interface ActiveTask {
  taskId: string;
  abortController: AbortController;
  startedAt: number;
}

// ---------------------------------------------------------------------------
// GatewayService
// ---------------------------------------------------------------------------

export class GatewayService {
  private config: GatewayServiceConfig;
  private selector: ExecutorSelector;

  /** roomName → RoomSession */
  private rooms = new Map<string, RoomSession>();
  /** Prevent duplicate concurrent joins */
  private pendingJoins = new Set<string>();

  constructor(config: GatewayServiceConfig, selector: ExecutorSelector) {
    this.config = config;
    this.selector = selector;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Lazy Join: connect to a room if not already connected.
   *  If force=true, disconnect existing session and rejoin with new identity.
   */
  async joinRoom(roomName: string, force: boolean = false): Promise<{ ok: boolean; participantName: string; error?: string }> {
    // Already connected
    const existing = this.rooms.get(roomName);
    if (existing && !force) {
      existing.touchActivity();
      console.log(`[GatewayService] Already in room=${roomName} as=${existing.participantName}`);
      return { ok: true, participantName: existing.participantName };
    }

    // Force rejoin: disconnect existing session first
    if (existing && force) {
      console.log(`[GatewayService] Force rejoin: disconnecting existing session in room=${roomName} (was ${existing.participantName})`);
      try {
        await existing.disconnect();
      } catch (err) {
        console.warn(`[GatewayService] Error disconnecting existing session: ${err}`);
      }
      this.rooms.delete(roomName);
    }

    // Join in progress
    if (this.pendingJoins.has(roomName)) {
      console.log(`[GatewayService] Join already in progress for room=${roomName}`);
      return { ok: true, participantName: 'joining...' };
    }

    this.pendingJoins.add(roomName);
    const participantName = `gateway-${Date.now()}`;

    try {
      const token = new AccessToken(this.config.livekitApiKey, this.config.livekitApiSecret, {
        identity: participantName,
        name: 'VI Gateway',
      });
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: false,
        canPublishData: true,
        canSubscribe: true,
      });
      const jwt = await token.toJwt();

      const room = new Room();
      const session = new RoomSession(room, roomName, participantName, this);

      // Wire up room events
      room.on(RoomEvent.Connected, () => {
        console.log(`[GatewayService] Connected room=${roomName} as=${participantName}`);
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log(`[GatewayService] Disconnected room=${roomName}`);
        session.cleanup();
        this.rooms.delete(roomName);
      });

      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        console.log(`[GatewayService] Participant joined: ${p.identity} room=${roomName}`);
        if (p.identity.startsWith('user-')) {
          session.touchActivity();
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        console.log(`[GatewayService] Participant left: ${p.identity} room=${roomName}`);
      });

      // Connect
      console.log(`[GatewayService] Connecting to room=${roomName} as=${participantName}`);
      await room.connect(this.config.livekitUrl, jwt);

      // Register RPC handlers
      this.registerRpcHandlers(session);

      // Start idle check
      session.startIdleCheck(
        this.config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
        this.config.idleCheckIntervalMs ?? DEFAULT_IDLE_CHECK_MS,
      );

      this.rooms.set(roomName, session);
      this.pendingJoins.delete(roomName);

      console.log(`[GatewayService] Joined room=${roomName} successfully`);
      return { ok: true, participantName };
    } catch (err) {
      this.pendingJoins.delete(roomName);
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[GatewayService] Failed to join room=${roomName}: ${msg}`);
      return { ok: false, participantName: 'error', error: msg };
    }
  }

  /** Leave a specific room. */
  async leaveRoom(roomName: string): Promise<void> {
    const session = this.rooms.get(roomName);
    if (session) {
      await session.disconnect();
      this.rooms.delete(roomName);
    }
  }

  /** Graceful shutdown: leave all rooms and close all executors. */
  async shutdown(): Promise<void> {
    console.log(`[GatewayService] Shutting down (${this.rooms.size} rooms)`);
    const sessions = Array.from(this.rooms.values());
    await Promise.allSettled(sessions.map((s) => s.disconnect()));
    this.rooms.clear();
    await this.selector.closeAll();
    console.log('[GatewayService] Shutdown complete');
  }

  /** Get the ExecutorSelector (for external registration of adapters). */
  getSelector(): ExecutorSelector {
    return this.selector;
  }

  // -----------------------------------------------------------------------
  // RPC Handlers
  // -----------------------------------------------------------------------

  private registerRpcHandlers(session: RoomSession): void {
    const { room, roomName } = session;

    // RPC: dispatch_task
    const registerMethod = (
      method: string,
      handler: (data: RpcInvocationData) => Promise<string>,
    ) => {
      if (!room.localParticipant) {
        console.warn(`[registerRpcHandlers] localParticipant not available, skipping ${method} for room=${roomName}`);
        return;
      }
      try {
        room.localParticipant.registerRpcMethod(method, handler);
        console.log(`[GatewayService] Registered RPC: ${method} for room=${roomName}`);
      } catch (err) {
        console.warn(`[GatewayService] Failed to register RPC ${method}:`, err);
      }
    };

    registerMethod('dispatch_task', async (data: RpcInvocationData) => {
      let request: TaskRequest;
      try {
        request = JSON.parse(data.payload) as TaskRequest;
      } catch {
        return JSON.stringify({ ok: false, error: 'Invalid JSON payload' });
      }

      session.touchActivity();

      // Validate required fields
      if (!request.taskId || !request.prompt) {
        return JSON.stringify({ ok: false, error: 'Missing taskId or prompt' });
      }

      // Default priority (V2 backwards compat: 'fast' | 'thorough' only from old agents)
      if (!request.priority) {
        request.priority = 'thorough';
      }

      // Default userId for V2 backwards compat
      if (!request.userId) {
        request.userId = '';
      }

      console.log(
        `[dispatch_task] task=${request.taskId} priority=${request.priority} session=${request.sessionId} room=${roomName}`,
      );

      // Dedup: if this task is already being processed, skip duplicate execution
      if (session.hasActiveTask(request.taskId)) {
        console.log(`[dispatch_task] DEDUP: task=${request.taskId} already active, skipping`);
        return JSON.stringify({
          ok: true,
          taskId: request.taskId,
          status: 'already_processing',
          message: 'Task is already being processed',
        });
      }

      // Select executor (async — checks status)
      const executor = await this.selector.select(request);
      if (!executor) {
        return JSON.stringify({
          ok: false,
          error: 'No executor available for this request',
        });
      }

      // Accept immediately, process async
      this.processTaskAsync(session, request, executor.id, data.callerIdentity).catch(
        (err) => {
          console.error(
            `[dispatch_task] Async processing failed task=${request.taskId}:`,
            err,
          );
        },
      );

      return JSON.stringify({
        ok: true,
        taskId: request.taskId,
        executor: executor.id,
        status: 'processing',
      });
    });

    registerMethod('cancel_task', async (data: RpcInvocationData) => {
      let payload: { taskId?: string } = {};
      try {
        payload = JSON.parse(data.payload);
      } catch {
        return JSON.stringify({ ok: false, error: 'Invalid JSON payload' });
      }

      const { taskId } = payload;
      if (!taskId) {
        return JSON.stringify({ ok: false, error: 'Missing taskId' });
      }

      const cancelled = session.cancelTask(taskId);

      // Also abort at the executor level
      if (cancelled) {
        for (const adapter of this.selector.listAll()) {
          await adapter.abort(taskId).catch(() => { });
        }
      }

      console.log(`[cancel_task] task=${taskId} cancelled=${cancelled} room=${roomName}`);

      return JSON.stringify({ ok: cancelled, taskId });
    });

    console.log(`[GatewayService] RPC handlers registered for room=${roomName}`);
  }

  // -----------------------------------------------------------------------
  // Async Task Processing
  // -----------------------------------------------------------------------

  private async processTaskAsync(
    session: RoomSession,
    request: TaskRequest,
    executorName: string,
    callerIdentity: string,
  ): Promise<void> {
    const { room } = session;
    const { taskId } = request;

    console.log(`[processTask] START task=${taskId} executor=${executorName} caller=${callerIdentity}`);

    const executor = this.selector.get(executorName);
    if (!executor) {
      console.error(`[processTask] No executor found for task=${taskId} name=${executorName}`);
      await this.publishData(room, { type: 'error', taskId, message: `No executor available for ${executorName}`, recoverable: false });
      return;
    }

    // Register active task for cancellation support
    const abortController = new AbortController();
    session.registerTask({
      taskId,
      abortController,
      startedAt: Date.now(),
    });

    try {
      // Publish start event
      console.log(`[processTask] Publishing start event for task=${taskId}`);
      await this.publishData(room, { type: 'start', taskId, executor: executorName });

      // --- Execute with automatic fallback ---
      // If the primary executor fails (yields an error chunk), retry with an
      // alternative adapter. This handles scenarios like API credit exhaustion
      // (Anthropic 400) by transparently falling back to Gemini Flash.
      let resultData: Record<string, unknown> | null = null;
      let accumulatedHtml = '';
      let moduleDelivered = false;  // true if a structured module was emitted
      let executionError: string | null = null;
      let usedExecutor = executor;

      const executeWithAdapter = async (adapter: typeof executor): Promise<boolean> => {
        console.log(`[processTask] Creating executor generator for task=${taskId} adapter=${adapter.id}`);
        const generator = adapter.execute(request);
        const mediaOptimizer = createMediaOptimizer();
        let chunkIdx = 0;
        let hadError = false;

        // Module detection state: buffer initial chunks to detect JSON module output
        let moduleDetectionPhase = true;  // true until we decide: module or HTML
        let moduleBuffer = '';            // accumulates text during detection
        let isModuleOutput = false;       // once decided: is this a module?

        console.log(`[processTask] Starting generator iteration for task=${taskId}`);
        for await (const chunk of generator) {
          chunkIdx++;
          // Check if cancelled
          if (abortController.signal.aborted) {
            console.log(`[processTask] Task cancelled: task=${taskId}`);
            await this.publishData(room, {
              type: 'error',
              taskId,
              message: 'Task cancelled',
              recoverable: false,
            });
            return false;
          }

          // Detect error chunks — these indicate executor failure
          if (chunk.type === 'error') {
            hadError = true;
            executionError = (chunk as Record<string, unknown>).message as string || 'Unknown executor error';
            console.warn(`[processTask] Executor ${adapter.id} error: ${executionError} task=${taskId}`);
            break;
          }

          // Capture result chunk data for post-processing
          if (chunk.type === 'result' && chunk.data) {
            resultData = chunk.data as Record<string, unknown>;
          }

          if (chunkIdx <= 3) {
            console.log(`[processTask] Chunk #${chunkIdx}: type=${chunk.type} task=${taskId}`);
          }

          // Handle html_stream chunks with module detection
          if (chunk.type === 'html_stream' && chunk.content) {
            // --- Module detection phase ---
            if (moduleDetectionPhase) {
              moduleBuffer += chunk.content;

              // Check if we can decide now
              const trimmed = moduleBuffer.trimStart();
              if (trimmed.startsWith('{') || trimmed.startsWith('```json') || trimmed.startsWith('```\n{')) {
                // Looks like JSON — continue buffering
                isModuleOutput = true;

                if (chunk.done) {
                  // Stream complete — try parsing as module
                  moduleDetectionPhase = false;
                  const moduleResult = tryParseModule(moduleBuffer);
                  if (moduleResult) {
                    console.log(`[processTask] MODULE DETECTED: type=${moduleResult.module_type} task=${taskId}`);
                    moduleDelivered = true;
                    await this.publishData(room, {
                      type: 'module',
                      taskId,
                      module_type: moduleResult.module_type,
                      data: moduleResult.data,
                    });
                  } else {
                    // JSON parse failed — fall back to HTML
                    console.log(`[processTask] Module parse failed, falling back to HTML task=${taskId}`);
                    isModuleOutput = false;
                    let sanitized = stripBoilerplate(moduleBuffer);
                    sanitized = stripScripts(sanitized);
                    sanitized = mediaOptimizer.optimizeChunk(sanitized);
                    accumulatedHtml += sanitized;
                    await this.publishData(room, { type: 'html_stream', taskId, content: sanitized, done: true });
                  }
                }
                // Not done yet — keep buffering
                continue;
              } else if (trimmed.length > 0) {
                // Starts with non-JSON — it's HTML
                moduleDetectionPhase = false;
                isModuleOutput = false;
                // Flush buffer as HTML
                let sanitized = stripBoilerplate(moduleBuffer);
                sanitized = stripScripts(sanitized);
                sanitized = mediaOptimizer.optimizeChunk(sanitized);
                accumulatedHtml += sanitized;
                await this.publishData(room, { type: 'html_stream', taskId, content: sanitized, done: chunk.done });
                continue;
              }
              // Buffer is only whitespace so far — keep waiting
              continue;
            }

            // --- Post-detection: module buffering mode ---
            if (isModuleOutput) {
              moduleBuffer += chunk.content;
              if (chunk.done) {
                const moduleResult = tryParseModule(moduleBuffer);
                if (moduleResult) {
                  console.log(`[processTask] MODULE DETECTED: type=${moduleResult.module_type} task=${taskId}`);
                  await this.publishData(room, {
                    type: 'module',
                    taskId,
                    module_type: moduleResult.module_type,
                    data: moduleResult.data,
                  });
                } else {
                  // Fallback to HTML
                  console.log(`[processTask] Module parse failed at end, falling back to HTML task=${taskId}`);
                  let sanitized = stripBoilerplate(moduleBuffer);
                  sanitized = stripScripts(sanitized);
                  sanitized = mediaOptimizer.optimizeChunk(sanitized);
                  accumulatedHtml += sanitized;
                  await this.publishData(room, { type: 'html_stream', taskId, content: sanitized, done: true });
                }
              }
              continue;
            }

            // --- Post-detection: HTML streaming mode (existing path) ---
            let sanitized = stripBoilerplate(chunk.content as string);
            sanitized = stripScripts(sanitized);
            sanitized = mediaOptimizer.optimizeChunk(sanitized);
            accumulatedHtml += sanitized;
            await this.publishData(room, { ...chunk, taskId, content: sanitized });
          } else {
            // Publish non-HTML chunks as-is (progress, etc.)
            await this.publishData(room, { ...chunk, taskId });
          }
        }

        return !hadError;
      };

      // Try primary executor
      let success = await executeWithAdapter(usedExecutor);

      // If primary failed — try fallback executors
      if (!success && !abortController.signal.aborted) {
        console.log(`[processTask] Primary executor ${usedExecutor.id} failed, attempting fallback for task=${taskId}`);
        const allAdapters = this.selector.listAll();
        for (const fallback of allAdapters) {
          if (fallback.id === usedExecutor.id) continue; // skip the failed one
          const st = await fallback.status();
          if (st !== 'online') continue;

          console.log(`[processTask] FALLBACK: trying ${fallback.id} for task=${taskId}`);
          await this.publishData(room, { type: 'progress', taskId, message: `Retrying with ${fallback.name}...` });

          // Reset state for new executor attempt
          accumulatedHtml = '';
          resultData = null;
          executionError = null;
          usedExecutor = fallback;

          success = await executeWithAdapter(fallback);
          if (success) {
            console.log(`[processTask] FALLBACK SUCCESS: ${fallback.id} for task=${taskId}`);
            break;
          }
        }
      }

      // If all executors failed, publish the error to frontend
      if (!success && !abortController.signal.aborted) {
        console.error(`[processTask] All executors failed for task=${taskId}: ${executionError}`);
        await this.publishData(room, {
          type: 'error',
          taskId,
          message: executionError || 'All executors failed',
          recoverable: false,
        });
      }

      // Publish end event (unless cancelled)
      if (!abortController.signal.aborted) {
        await this.publishData(room, { type: 'end', taskId });

        // Persist memory_updates from result (fire-and-forget)
        const memUpdates = resultData?.['memory_updates'];
        if (memUpdates && Array.isArray(memUpdates)) {
          this.persistMemoryUpdates(request, memUpdates as Array<Record<string, string>>, room).catch(
            (err) => console.warn(`[processTask] memory_updates persistence failed: ${err}`),
          );
        }
      }

      // Notify agent that task is complete via RPC callback
      // CRITICAL: The realtime agent's handle_g2b_send_reply expects:
      //   - text: string (reply content)
      //   - error: string | null
      //   - isHtmlStream: boolean (skips text processing, just speaks confirmation)
      try {
        const allRemote = Array.from(room.remoteParticipants.values());
        const agent = allRemote.find((p: RemoteParticipant) => p.identity === callerIdentity);
        if (agent) {
          let rpcPayload: Record<string, unknown>;
          if (abortController.signal.aborted) {
            rpcPayload = {
              taskId,
              text: `[CANCELLED] Task ${taskId} was cancelled.`,
              error: null,
              isHtmlStream: false,
              timestamp: Date.now(),
            };
          } else if (!success) {
            // All executors failed — report error to agent
            rpcPayload = {
              taskId,
              text: executionError || 'Task execution failed — all executors returned errors.',
              error: executionError || 'All executors failed',
              isHtmlStream: false,
              timestamp: Date.now(),
            };
          } else if (moduleDelivered) {
            // Module output: structured JSON was already delivered to frontend.
            // Tell the agent it was a visual result so it just speaks a brief confirmation.
            rpcPayload = {
              taskId,
              text: 'Visual result displayed successfully.',
              error: null,
              isHtmlStream: true,  // reuse flag — agent just speaks confirmation
              timestamp: Date.now(),
            };
          } else if (accumulatedHtml) {
            // HTML streaming task: HTML was already delivered to frontend via data channel.
            // Tell the agent it was an HTML stream so it just speaks a brief confirmation.
            const summary = extractContentSummary(accumulatedHtml);
            rpcPayload = {
              taskId,
              text: summary.text || 'Website generated successfully.',
              error: null,
              isHtmlStream: true,
              timestamp: Date.now(),
            };
          } else {
            // Non-HTML task: send the text result for agent to process/speak
            rpcPayload = {
              taskId,
              text: 'Task completed successfully.',
              error: null,
              isHtmlStream: false,
              timestamp: Date.now(),
            };
          }
          console.log(`[processTask] Sending rpcG2BSendReply: task=${taskId} isHtmlStream=${rpcPayload.isHtmlStream} textLen=${(rpcPayload.text as string)?.length || 0}`);
          if (!room.localParticipant) {
            console.warn(`[processTask] localParticipant not available, skipping rpcG2BSendReply for task=${taskId}`);
          } else {
            await room.localParticipant.performRpc({
              destinationIdentity: callerIdentity,
              method: 'rpcG2BSendReply',
              payload: JSON.stringify(rpcPayload),
            });
            console.log(`[processTask] rpcG2BSendReply sent successfully task=${taskId}`);
          }
        } else {
          console.warn(`[processTask] Agent ${callerIdentity} not found in room, cannot send reply`);
        }
      } catch (rpcErr) {
        console.warn(`[processTask] Failed to notify agent: ${rpcErr}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      console.error(`[processTask] Error task=${taskId}: ${msg}\n${stack}`);

      await this.publishData(room, {
        type: 'error',
        taskId,
        message: msg,
        recoverable: false,
      });
    } finally {
      session.unregisterTask(taskId);
    }
  }

  /**
   * Persist memory_updates from executor result via API Server batch endpoint.
   * Also notifies frontend via DataChannel 'memory_updated'.
   */
  private async persistMemoryUpdates(
    request: TaskRequest,
    memoryUpdates: Array<Record<string, string>>,
    room: Room,
  ): Promise<void> {
    // The agent passes vi_user_id in context, or we can derive from the request
    // For now, use a simple heuristic: extract from room participants or sessionId
    // The batch endpoint needs vi_user_id — the agent includes it in task context
    const viUserId = (request.context as Record<string, unknown>)?.viUserId as string;
    if (!viUserId) {
      console.warn('[persistMemoryUpdates] No viUserId in task context, skipping');
      return;
    }

    const updates = memoryUpdates.map((u) => ({
      filename: u.filename || 'agent-memory.md',
      content: u.content || '',
      category: u.category || 'general',
      mode: u.mode || 'append',
    }));

    try {
      const resp = await fetch(`${API_BASE_URL}/api/internal/memories/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vi_user_id: viUserId, updates }),
      });
      if (resp.ok) {
        console.log(`[persistMemoryUpdates] Persisted ${updates.length} memory updates`);
        // Notify frontend on dedicated 'memory_updated' topic (matching frontend listener)
        if (!room.localParticipant) {
          console.warn('[persistMemoryUpdates] localParticipant not available, skipping frontend notification');
        } else {
          try {
            const encoder = new TextEncoder();
            await room.localParticipant.publishData(
              encoder.encode(JSON.stringify({
                type: 'memory_updated',
                filenames: updates.map((u) => u.filename),
              })),
              { reliable: true, topic: 'memory_updated' },
            );
          } catch (pubErr) {
            console.warn('[persistMemoryUpdates] Failed to notify frontend:', pubErr);
          }
        }
      } else {
        console.warn(`[persistMemoryUpdates] API returned ${resp.status}`);
      }
    } catch (err) {
      console.warn(`[persistMemoryUpdates] Failed: ${err}`);
    }
  }

  /** Publish JSON data on DataChannel topic "vi-gateway". */
  private async publishData(room: Room, data: Record<string, unknown>): Promise<void> {
    if (!room.localParticipant) {
      console.warn('[publishData] localParticipant not available, skipping');
      return;
    }
    try {
      const encoder = new TextEncoder();
      await room.localParticipant.publishData(
        encoder.encode(JSON.stringify(data)),
        { reliable: true, topic: 'vi-gateway' },
      );
    } catch (err) {
      console.warn('[GatewayService] publishData failed:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// RoomSession — per-room state holder
// ---------------------------------------------------------------------------

class RoomSession {
  readonly room: Room;
  readonly roomName: string;
  readonly participantName: string;

  private lastActivityAt: number;
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private activeTasks = new Map<string, ActiveTask>();

  constructor(room: Room, roomName: string, participantName: string, _gateway: GatewayService) {
    this.room = room;
    this.roomName = roomName;
    this.participantName = participantName;
    this.lastActivityAt = Date.now();
  }

  touchActivity(): void {
    this.lastActivityAt = Date.now();
  }

  startIdleCheck(timeoutMs: number, intervalMs: number): void {
    this.idleCheckInterval = setInterval(() => {
      const idleMs = Date.now() - this.lastActivityAt;
      if (idleMs >= timeoutMs) {
        // Don't disconnect if there are active tasks running
        if (this.activeTasks.size > 0) {
          console.log(
            `[GatewayService] Room idle for ${Math.round(idleMs / 1000)}s but ${this.activeTasks.size} active tasks, staying connected room=${this.roomName}`,
          );
          return;
        }

        // Don't disconnect if there are active agent/user participants
        const remoteParticipants = Array.from(this.room.remoteParticipants.values());
        const hasActiveParticipants = remoteParticipants.some(
          (p: RemoteParticipant) => p.identity.startsWith('agent-') || p.identity.startsWith('user-'),
        );
        if (hasActiveParticipants) {
          console.log(
            `[GatewayService] Room idle for ${Math.round(idleMs / 1000)}s but has active participants, staying connected room=${this.roomName}`,
          );
          return;
        }

        console.log(
          `[GatewayService] Room idle for ${Math.round(idleMs / 1000)}s, no tasks or participants, disconnecting room=${this.roomName}`,
        );
        this.disconnect().catch((err) =>
          console.error(`[GatewayService] Idle disconnect error:`, err),
        );
      }
    }, intervalMs);
  }

  registerTask(task: ActiveTask): void {
    this.activeTasks.set(task.taskId, task);
  }

  hasActiveTask(taskId: string): boolean {
    return this.activeTasks.has(taskId);
  }

  unregisterTask(taskId: string): void {
    this.activeTasks.delete(taskId);
  }

  cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.abortController.abort();
      return true;
    }
    return false;
  }

  cleanup(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    // Abort all running tasks
    for (const task of this.activeTasks.values()) {
      task.abortController.abort();
    }
    this.activeTasks.clear();
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    try {
      await this.room.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}
