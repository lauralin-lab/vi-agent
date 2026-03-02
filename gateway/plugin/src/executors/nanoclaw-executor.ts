/**
 * NanoClawAdapter — thorough task executor using Anthropic Claude.
 *
 * Since the NanoClaw npm package is not published, this is a direct
 * implementation using @anthropic-ai/sdk. It handles:
 *  - Complex/thorough tasks (research, multi-step analysis, content creation)
 *  - Multimodal input (photo URLs converted to base64 image blocks)
 *  - Streaming output via Claude's streaming API
 *  - Rich HTML generation with dark theme / mobile-first Tailwind
 *
 * Implements ExecutionAdapter interface (V3).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ExecutionAdapter, ExecutorCapabilities, ExecutorStatus, TaskRequest, TaskChunk } from './types.js';

const MODEL_NAME = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a thorough expert AI assistant for VI, a camera-first mobile app.
You can produce either structured JSON modules or HTML body content.

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

CONTENT:
- Be thorough and detailed. Structure output with clear sections.
- For analysis tasks, break into sections with headings.
- For research tasks, provide comprehensive coverage with reasoning.
- Use semantic HTML5 elements.

For non-visual tasks, provide detailed text responses.

Output ONLY the content (JSON or HTML). No markdown, no code fences, no explanation.`;

export class NanoClawAdapter implements ExecutionAdapter {
  readonly id = 'nanoclaw';
  readonly name = 'NanoClaw';
  readonly location = 'cloud' as const;
  readonly capabilities: ExecutorCapabilities = {
    canUseTools: false,
    canAccessInternet: false,
    canRunCode: false,
    maxContextLength: 200_000,
    supportsStreaming: true,
    estimatedLatency: 'medium',
  };

  private client: Anthropic | null = null;
  private activeRequests = new Map<string, AbortController>();

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      console.log(`[NanoClawAdapter] Initialized with model=${MODEL_NAME}`);
    } else {
      console.warn('[NanoClawAdapter] No ANTHROPIC_API_KEY — executor disabled');
    }
  }

  async status(): Promise<ExecutorStatus> {
    return this.client ? 'online' : 'offline';
  }

  async abort(taskId: string): Promise<void> {
    const controller = this.activeRequests.get(taskId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(taskId);
      console.log(`[NanoClawAdapter] Aborted task=${taskId}`);
    }
  }

  async *execute(request: TaskRequest): AsyncGenerator<TaskChunk> {
    if (!this.client) {
      yield { type: 'error', message: 'Claude not configured (missing ANTHROPIC_API_KEY)', recoverable: false };
      return;
    }

    const abortController = new AbortController();
    this.activeRequests.set(request.taskId, abortController);

    yield { type: 'progress', step: 1, total: 4, message: 'Preparing context...' };

    // Build message content (multimodal: text + images)
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    // Add images from photo URLs — fetch and convert to base64
    // (Claude URL-based image sources can hang on S3 presigned URLs)
    if (request.context.photoUrls && request.context.photoUrls.length > 0) {
      for (const url of request.context.photoUrls) {
        try {
          console.log(`[NanoClawAdapter] Fetching image: ${url.slice(0, 80)}...`);
          const resp = await fetch(url);
          if (!resp.ok) {
            console.warn(`[NanoClawAdapter] Image fetch failed (${resp.status}): ${url.slice(0, 80)}`);
            continue;
          }
          const buffer = Buffer.from(await resp.arrayBuffer());
          const base64Data = buffer.toString('base64');
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          const mediaType = contentType.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
          console.log(`[NanoClawAdapter] Image fetched: ${base64Data.length} base64 chars, type=${mediaType}`);
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          });
        } catch (err) {
          console.warn(`[NanoClawAdapter] Failed to process image URL: ${url}`, err);
        }
      }
    }

    // Build text prompt with context
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

    contentBlocks.push({ type: 'text', text: textParts.join('\n\n') });

    yield { type: 'progress', step: 2, total: 4, message: 'Thinking...' };

    try {
      console.log(`[NanoClawAdapter] Calling messages.create stream=true model=${MODEL_NAME} blocks=${contentBlocks.length} task=${request.taskId}`);
      const stream = await this.client.messages.create({
        model: MODEL_NAME,
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contentBlocks }],
        stream: true,
      });
      console.log(`[NanoClawAdapter] Stream created for task=${request.taskId}`);

      yield { type: 'progress', step: 3, total: 4, message: 'Generating response...' };

      let totalLength = 0;
      let chunkCount = 0;

      // System prompt mandates HTML output — always stream as html_stream.
      // Buffer the first few chars to strip markdown code fences (```html\n) if present.
      let fenceStripped = false;
      let initialBuffer = '';
      const FENCE_DETECT = 50; // chars to buffer for fence detection

      for await (const event of stream) {
        if (abortController.signal.aborted) break;

        if (chunkCount === 0) {
          console.log(`[NanoClawAdapter] First stream event type=${event.type} task=${request.taskId}`);
        }

        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          let text = event.delta.text;
          chunkCount++;
          totalLength += text.length;

          if (chunkCount <= 3) {
            console.log(`[NanoClawAdapter] Text chunk #${chunkCount} (${text.length} chars) task=${request.taskId}`);
          }

          // Buffer initial content to strip markdown code fences
          if (!fenceStripped && totalLength <= FENCE_DETECT) {
            initialBuffer += text;
            continue;
          }

          // Flush initial buffer on first pass
          if (!fenceStripped) {
            fenceStripped = true;
            let cleaned = initialBuffer + text;
            // Strip opening ```html\n or ```\n
            cleaned = cleaned.replace(/^```(?:html)?\s*\n/, '');
            yield { type: 'html_stream', content: cleaned, done: false };
            continue;
          }

          // Strip closing ``` at end of stream
          const trimmed = text.replace(/\n?```\s*$/, '');
          if (trimmed) {
            yield { type: 'html_stream', content: trimmed, done: false };
          }
        }
      }

      if (abortController.signal.aborted) return;

      // Flush any remaining initial buffer
      if (initialBuffer && !fenceStripped) {
        let cleaned = initialBuffer.replace(/^```(?:html)?\s*\n/, '');
        cleaned = cleaned.replace(/\n?```\s*$/, '');
        if (cleaned) {
          yield { type: 'html_stream', content: cleaned, done: false };
        }
      }

      // Signal stream complete
      yield { type: 'html_stream', content: '', done: true };

      yield {
        type: 'progress',
        step: 4,
        total: 4,
        message: `Complete (${chunkCount} chunks, ${totalLength} chars)`,
      };

      yield {
        type: 'result',
        summary: `Generated HTML (${totalLength} chars)`,
        data: { chunkCount, totalLength, model: MODEL_NAME, isHtml: true },
      };
    } catch (err) {
      if (abortController.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[NanoClawAdapter] Error task=${request.taskId}: ${msg}`);
      yield { type: 'error', message: msg, recoverable: true };
    } finally {
      this.activeRequests.delete(request.taskId);
    }
  }

  async close(): Promise<void> {
    // Abort all active requests
    for (const [taskId, controller] of this.activeRequests) {
      controller.abort();
      console.log(`[NanoClawAdapter] Aborted active task=${taskId} during close`);
    }
    this.activeRequests.clear();
    this.client = null;
    console.log('[NanoClawAdapter] Closed');
  }
}
