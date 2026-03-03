/**
 * GeminiFlashAdapter — fast task executor using Google Gemini Flash.
 *
 * Handles 'fast' priority tasks:
 *  - HTML generation (dark theme, mobile-first, Tailwind CDN)
 *  - Summaries and plans
 *  - Quick text generation
 *
 * Uses @google/generative-ai SDK with streaming (generateContentStream).
 * Implements ExecutionAdapter interface (V3).
 */

import { GoogleGenerativeAI, type GenerativeModel, type Part } from '@google/generative-ai';
import type { ExecutionAdapter, ExecutorCapabilities, ExecutorStatus, TaskRequest, TaskChunk } from './types.js';

const MODEL_NAME = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';

/** System prompt guiding Gemini to produce body-only HTML content or structured module JSON. */
const HTML_SYSTEM_PROMPT = `You are an expert mobile UI designer. You can produce either structured JSON modules or HTML body content.

STRUCTURED MODULE OUTPUT (PREFERRED for matching content):
When the user's request clearly maps to one of these module types, output ONLY a raw JSON object (starting with {). The frontend renders modules as high-quality native components.

Module types:
1. place_card — A place, restaurant, or venue
   {"module":"place_card","data":{"name":"...","address":"...","rating":4.5,"price_level":2,"type":"restaurant","phone":"...","hours":"...","description":"...","photos":["url"]}}

2. checklist — A task list, shopping list, or packing list
   {"module":"checklist","data":{"title":"...","items":[{"text":"...","checked":false}]}}

3. weather — Weather information
   {"module":"weather","data":{"location":"...","current":{"temp":72,"unit":"F","condition":"sunny","humidity":45,"wind":"5 mph"},"forecast":[{"day":"Mon","high":75,"low":60,"condition":"sunny"}]}}

4. comparison — Comparing options side by side
   {"module":"comparison","data":{"title":"...","items":[{"name":"...","pros":["..."],"cons":["..."],"rating":4.2,"price":"$20"}]}}

5. recipe — A recipe with ingredients and steps
   {"module":"recipe","data":{"title":"...","servings":4,"prep_time":"15 min","cook_time":"30 min","ingredients":["..."],"steps":["..."]}}

6. steps_guide — A how-to guide with numbered steps
   {"module":"steps_guide","data":{"title":"...","steps":[{"title":"Step 1","description":"...","tip":"..."}]}}

7. info_card — General structured information
   {"module":"info_card","data":{"title":"...","subtitle":"...","icon":"emoji","sections":[{"label":"...","value":"..."}]}}

8. image_gallery — A collection of images
   {"module":"image_gallery","data":{"title":"...","images":[{"url":"...","caption":"..."}]}}

MODULE RULES:
- Output the JSON object directly starting with { — no markdown fences, no extra text.
- Use a module ONLY when content clearly fits one type.
- For complex, multi-section, narrative, or mixed content — use HTML instead.

HTML OUTPUT (for everything else):
Generate HTML body content ONLY.

RENDERING CONTEXT:
- Content renders inside a transparent iframe on a mobile phone (portrait, ~390px wide).
- Background is BLACK. All text must be light/white.
- Tailwind CSS v4 is pre-loaded. A design system with CSS variables is also available:
  --text-xs/sm/base/lg/xl/2xl for responsive font sizes.
  .vi-card, .vi-section, .vi-chip, .vi-btn, .vi-btn-primary, .vi-accent-bar utility classes.
- Do NOT include <!DOCTYPE>, <html>, <head>, <body>, or <script> tags.

LAYOUT RULES:
- Max width: 100%. NEVER use fixed widths > 360px. No horizontal scroll.
- Use w-full, max-w-full. NO max-w-md or max-w-lg.
- Padding: px-0 on outer container. Images: w-full rounded-xl object-cover, max-h-64.
- Tables: overflow-x-auto wrapper. Prefer card layouts on mobile.

VISUAL DESIGN:
- Dark glassmorphism: .vi-card containers with backdrop blur, border-white/[0.08].
- Text hierarchy: text-white/90 body, text-white/60 secondary, text-white/40 tertiary.
- Purple accent: from-purple-500/20 gradients, .vi-accent-bar dividers.
- Rounded corners: rounded-xl or rounded-2xl. Spacing: space-y-4.
- Buttons: use .vi-btn or .vi-btn-primary, or data-action with bg-white/10.
- Icons: emoji or inline SVG only.

Output ONLY the content (JSON or HTML). No markdown, no code fences, no explanation.`;

export class GeminiFlashAdapter implements ExecutionAdapter {
  readonly id = 'gemini-flash';
  readonly name = 'Gemini Flash';
  readonly location = 'cloud' as const;
  readonly capabilities: ExecutorCapabilities = {
    canUseTools: false,
    canAccessInternet: false,
    canRunCode: false,
    maxContextLength: 1_000_000,
    supportsStreaming: true,
    estimatedLatency: 'fast',
  };

  private client: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private activeRequests = new Map<string, AbortController>();

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
      this.model = this.client.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: HTML_SYSTEM_PROMPT,
      });
      console.log(`[GeminiFlashAdapter] Initialized with model=${MODEL_NAME}`);
    } else {
      console.warn('[GeminiFlashAdapter] No GOOGLE_API_KEY — executor disabled');
    }
  }

  async status(): Promise<ExecutorStatus> {
    return this.model ? 'online' : 'offline';
  }

  async abort(taskId: string): Promise<void> {
    const controller = this.activeRequests.get(taskId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(taskId);
      console.log(`[GeminiFlashAdapter] Aborted task=${taskId}`);
    }
  }

  async *execute(request: TaskRequest): AsyncGenerator<TaskChunk> {
    if (!this.model) {
      yield { type: 'error', message: 'Gemini Flash not configured (missing GOOGLE_API_KEY)', recoverable: false };
      return;
    }

    const abortController = new AbortController();
    this.activeRequests.set(request.taskId, abortController);

    // Build prompt with context
    const textParts: string[] = [];

    if (request.context.visualObservation) {
      textParts.push(`[Visual Context]\n${request.context.visualObservation}`);
    }
    if (request.context.userMemory) {
      textParts.push(`[User Memory]\n${request.context.userMemory}`);
    }
    if (request.context.conversationSummary) {
      textParts.push(`[Conversation Summary]\n${request.context.conversationSummary}`);
    }
    if (request.context.memoryContext) {
      textParts.push(`[Memory Context]\n${request.context.memoryContext}`);
    }

    textParts.push(`[Task]\n${request.prompt}`);

    const fullPrompt = textParts.join('\n\n');

    // Build content parts: text + optional images
    // Images must be passed as inlineData (base64) — fileData.fileUri only accepts
    // gs:// protocol URIs, not signed HTTPS GCS URLs.
    const contentParts: Part[] = [];

    if (request.context.photoUrls && request.context.photoUrls.length > 0) {
      for (const url of request.context.photoUrls) {
        try {
          console.log(`[GeminiFlashAdapter] Fetching image: ${url.slice(0, 80)}...`);
          const resp = await fetch(url);
          if (!resp.ok) {
            console.warn(`[GeminiFlashAdapter] Image fetch failed (${resp.status}): ${url.slice(0, 80)}`);
            continue;
          }
          const buffer = Buffer.from(await resp.arrayBuffer());
          const base64Data = buffer.toString('base64');
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
          contentParts.push({ inlineData: { mimeType, data: base64Data } });
          console.log(`[GeminiFlashAdapter] Image loaded: ${base64Data.length} base64 chars, type=${mimeType}`);
        } catch (err) {
          console.warn(`[GeminiFlashAdapter] Failed to load image URL: ${url}`, err);
        }
      }
    }

    contentParts.push({ text: fullPrompt });

    yield { type: 'progress', step: 1, total: 3, message: 'Thinking...' };

    try {
      console.log(`[GeminiFlashAdapter] Calling generateContentStream for task=${request.taskId} parts=${contentParts.length}`);
      const result = await this.model.generateContentStream(contentParts);
      console.log(`[GeminiFlashAdapter] Stream started for task=${request.taskId}`);

      yield { type: 'progress', step: 2, total: 3, message: 'Generating HTML...' };

      let chunkCount = 0;
      let totalLength = 0;

      for await (const chunk of result.stream) {
        if (abortController.signal.aborted) break;

        const text = chunk.text();
        if (text) {
          chunkCount++;
          totalLength += text.length;
          if (chunkCount === 1) {
            console.log(`[GeminiFlashAdapter] First chunk (${text.length} chars) task=${request.taskId}`);
          }
          yield { type: 'html_stream', content: text, done: false };
        }
      }

      if (abortController.signal.aborted) return;

      console.log(`[GeminiFlashAdapter] Stream complete: ${chunkCount} chunks, ${totalLength} chars, task=${request.taskId}`);

      // Signal stream complete
      yield { type: 'html_stream', content: '', done: true };

      yield {
        type: 'progress',
        step: 3,
        total: 3,
        message: `Complete (${chunkCount} chunks, ${totalLength} chars)`,
      };

      yield {
        type: 'result',
        summary: `Generated HTML (${totalLength} chars)`,
        data: { chunkCount, totalLength, model: MODEL_NAME },
      };
    } catch (err) {
      if (abortController.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      console.error(`[GeminiFlashAdapter] Error task=${request.taskId}: ${msg}\n${stack}`);
      yield { type: 'error', message: msg, recoverable: true };
    } finally {
      this.activeRequests.delete(request.taskId);
    }
  }

  async close(): Promise<void> {
    // Abort all active requests
    for (const [taskId, controller] of this.activeRequests) {
      controller.abort();
      console.log(`[GeminiFlashAdapter] Aborted active task=${taskId} during close`);
    }
    this.activeRequests.clear();
    this.client = null;
    this.model = null;
    console.log('[GeminiFlashAdapter] Closed');
  }
}
