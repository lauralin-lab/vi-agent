import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { normalize, resolve } from 'node:path';
import { config } from '../config.js';
import { publishStreamEvent } from '../channels/stream-publisher.js';
import { readUserFile, writeUserFile, listUserDir } from '../fs/user-fs.js';
import { updateMemory, appendMemory } from '../tools/memory-update.js';
import { oauthCall } from '../tools/oauth-call.js';
import type { ExecRequest, CardOp } from '../channels/types.js';
import type { LoadedSkill } from './types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Card ID generation
// ---------------------------------------------------------------------------

let cardIdCounter = 0;

function genCardId(): string {
  return `card_${Date.now()}_${++cardIdCounter}`;
}

// ---------------------------------------------------------------------------
// Card Protocol helpers — publish card operations to vi:stream:{uid}
// ---------------------------------------------------------------------------

async function publishCardOp(op: CardOp): Promise<void> {
  await publishStreamEvent(op);
}

async function createCard(
  taskId: string,
  cardId: string,
  template: string,
  data: Record<string, unknown> = {},
  position: 'append' | 'prepend' = 'append',
): Promise<void> {
  await publishCardOp({
    op: 'create_card',
    taskId,
    cardId,
    template,
    data,
    position,
    timestamp: new Date().toISOString(),
  });
}

async function streamToCard(
  taskId: string,
  cardId: string,
  slot: string,
  chunk: string,
): Promise<void> {
  await publishCardOp({
    op: 'stream_to_card',
    taskId,
    cardId,
    slot,
    chunk,
    timestamp: new Date().toISOString(),
  });
}

async function finalizeCard(taskId: string, cardId: string): Promise<void> {
  await publishCardOp({
    op: 'finalize_card',
    taskId,
    cardId,
    timestamp: new Date().toISOString(),
  });
}

async function htmlStreamOp(
  taskId: string,
  cardId: string,
  chunk: string,
  done = false,
): Promise<void> {
  await publishCardOp({
    op: 'html_stream',
    taskId,
    cardId,
    chunk,
    done,
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Tool Definitions (Anthropic API format)
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'file_read',
    description:
      'Read a file from the user workspace. Path is relative to /workspace/.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative path (e.g. "memory/semantic/preferences.md")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description:
      'Write content to a file in the user workspace. Creates directories as needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to write',
        },
        content: {
          type: 'string',
          description: 'File content to write',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file_list',
    description: 'List files in a user workspace directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative directory path (e.g. "memory/semantic/")',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'memory_update',
    description:
      'Update user memory. Use this when you learn new preferences, facts, or daily events about the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['identity', 'semantic', 'episodic'],
          description:
            'Memory layer: identity (who they are), semantic (knowledge/preferences), episodic (daily events)',
        },
        filename: {
          type: 'string',
          description: 'Filename (e.g. "preferences.md", "2026-03-04.md")',
        },
        content: { type: 'string', description: 'Content to write' },
        mode: {
          type: 'string',
          enum: ['replace', 'append'],
          description: 'Replace entire file or append to existing',
        },
      },
      required: ['category', 'filename', 'content'],
    },
  },
  {
    name: 'oauth_call',
    description:
      "Make an OAuth-authenticated API call on behalf of the user. Requires the user to have connected the provider.",
    input_schema: {
      type: 'object' as const,
      properties: {
        provider: {
          type: 'string',
          enum: ['google', 'notion', 'slack'],
          description: 'OAuth provider',
        },
        endpoint: {
          type: 'string',
          description: 'Full API endpoint URL',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method',
        },
        body: {
          type: 'object',
          description: 'Request body (for POST/PUT)',
        },
      },
      required: ['provider', 'endpoint'],
    },
  },
  {
    name: 'publish_card',
    description:
      'Publish a card to the user\'s session canvas. Use a template from the registry (e.g. "nutrition-card", "shopping-list", "comparison-table") with structured JSON data matching the template\'s slot schema. For freeform HTML, use template "freeform-html".',
    input_schema: {
      type: 'object' as const,
      properties: {
        template: {
          type: 'string',
          description:
            'Template ID from the registry (e.g. "nutrition-card", "hero-image", "checklist", "comparison-table", "freeform-html")',
        },
        data: {
          type: 'object',
          description:
            'Card data matching the template\'s slot schema. Each key is a slot name.',
        },
      },
      required: ['template', 'data'],
    },
  },
  {
    name: 'update_card',
    description:
      'Update an existing card\'s data. Only works on mutable cards. Use dot-notation paths for nested updates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: {
          type: 'string',
          description: 'The cardId of the card to update',
        },
        updates: {
          type: 'object',
          description: 'Key-value pairs to update. Use dot-notation for nested paths (e.g. "items.2.checked": true)',
        },
      },
      required: ['card_id', 'updates'],
    },
  },
  {
    name: 'append_to_card',
    description:
      'Append items to an array slot in an existing card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: {
          type: 'string',
          description: 'The cardId of the card',
        },
        slot: {
          type: 'string',
          description: 'The array slot name to append to',
        },
        items: {
          type: 'array',
          description: 'Items to append to the array slot',
          items: { type: 'object' },
        },
      },
      required: ['card_id', 'slot', 'items'],
    },
  },
  {
    name: 'bash',
    description:
      'Execute a shell command sandboxed to /workspace/. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'file_edit',
    description:
      'Replace the first occurrence of a string in a file. Path is relative to /workspace/.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path',
        },
        old_string: {
          type: 'string',
          description: 'String to find',
        },
        new_string: {
          type: 'string',
          description: 'Replacement string',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'search',
    description:
      'Grep-like content search within /workspace/. Returns matching lines with file and line number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (regex)',
        },
        path: {
          type: 'string',
          description: 'Relative directory or file path to search in (default: entire workspace)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the internet. Returns a list of results with title, URL, and snippet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description:
      'Fetch content from a URL. Returns the text content (truncated to 10000 chars).',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'URL to fetch',
        },
      },
      required: ['url'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  taskId: string,
): Promise<string> {
  try {
    switch (name) {
      case 'file_read': {
        const content = await readUserFile(input.path as string);
        return content;
      }
      case 'file_write': {
        await writeUserFile(input.path as string, input.content as string);
        return `File written: ${input.path}`;
      }
      case 'file_list': {
        const entries = await listUserDir(input.path as string);
        return entries.join('\n') || '(empty directory)';
      }
      case 'memory_update': {
        const category = input.category as 'identity' | 'semantic' | 'episodic';
        const filename = input.filename as string;
        const content = input.content as string;
        const mode = (input.mode as string) || 'replace';
        if (mode === 'append') {
          await appendMemory(category, filename, content);
        } else {
          await updateMemory(category, filename, content);
        }
        return `Memory updated: ${category}/${filename}`;
      }
      case 'oauth_call': {
        const result = await oauthCall(
          input.provider as string,
          input.endpoint as string,
          {
            method: (input.method as string) || 'GET',
            body: input.body,
          },
        );
        return JSON.stringify(result);
      }
      case 'publish_card': {
        const template = input.template as string;
        const data = (input.data as Record<string, unknown>) || {};
        const cardId = genCardId();

        if (template === 'freeform-html') {
          // Freeform HTML: create card + stream HTML content
          await createCard(taskId, cardId, 'freeform-html', {});
          const htmlContent = (data.html as string) || (data.content as string) || '';
          await htmlStreamOp(taskId, cardId, htmlContent, true);
          await finalizeCard(taskId, cardId);
        } else {
          // Structured template card
          await createCard(taskId, cardId, template, data);
          await finalizeCard(taskId, cardId);
        }

        return JSON.stringify({ cardId, template, status: 'published' });
      }
      case 'update_card': {
        const cardId = input.card_id as string;
        const updates = input.updates as Record<string, unknown>;
        await publishCardOp({
          op: 'update_card',
          taskId,
          cardId,
          updates,
          timestamp: new Date().toISOString(),
        });
        return JSON.stringify({ cardId, updated: Object.keys(updates) });
      }
      case 'append_to_card': {
        const cardId = input.card_id as string;
        const slot = input.slot as string;
        const items = input.items as unknown[];
        await publishCardOp({
          op: 'append_to_card',
          taskId,
          cardId,
          slot,
          items,
          timestamp: new Date().toISOString(),
        });
        return JSON.stringify({ cardId, slot, appended: items.length });
      }
      case 'bash': {
        const command = input.command as string;
        const dangerous = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'fork bomb'];
        if (dangerous.some((d) => command.includes(d))) {
          return 'Error: command rejected for safety';
        }
        return await new Promise<string>((res) => {
          exec(
            command,
            { cwd: config.userDataDir, timeout: 30_000, maxBuffer: 1024 * 1024 },
            (err, stdout, stderr) => {
              const exitCode = err?.code ?? 0;
              res(
                JSON.stringify({
                  stdout: stdout.slice(0, 5000),
                  stderr: stderr.slice(0, 2000),
                  exitCode,
                }),
              );
            },
          );
        });
      }
      case 'file_edit': {
        const filePath = resolve(config.userDataDir, normalize(input.path as string));
        if (!filePath.startsWith(config.userDataDir)) {
          return 'Error: path escapes workspace';
        }
        const fileContent = await readFile(filePath, 'utf-8');
        const oldStr = input.old_string as string;
        const newStr = input.new_string as string;
        if (!fileContent.includes(oldStr)) {
          return 'Error: old_string not found in file';
        }
        const updated = fileContent.replace(oldStr, newStr);
        await writeFile(filePath, updated, 'utf-8');
        return JSON.stringify({ success: true, message: `Edited ${input.path}` });
      }
      case 'search': {
        const pattern = input.pattern as string;
        const searchPath = (input.path as string) || '.';
        return await new Promise<string>((res) => {
          exec(
            `grep -rn --include='*' ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)}`,
            { cwd: config.userDataDir, timeout: 15_000, maxBuffer: 1024 * 1024 },
            (err, stdout) => {
              if (!stdout) {
                res(JSON.stringify({ matches: [] }));
                return;
              }
              const lines = stdout.trim().split('\n').slice(0, 50);
              const matches = lines.map((line) => {
                const match = line.match(/^(.+?):(\d+):(.*)$/);
                return match
                  ? { file: match[1], line: parseInt(match[2], 10), content: match[3] }
                  : { file: '', line: 0, content: line };
              });
              res(JSON.stringify({ matches }));
            },
          );
        });
      }
      case 'web_search': {
        return JSON.stringify({
          results: [],
          message: 'Web search not available (no search API configured)',
        });
      }
      case 'web_fetch': {
        const url = input.url as string;
        const fetchRes = await fetch(url, {
          headers: { 'User-Agent': 'NanoClaw/1.0' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!fetchRes.ok) {
          return `Error: fetch failed with status ${fetchRes.status}`;
        }
        const text = await fetchRes.text();
        return JSON.stringify({
          content: text.slice(0, 10_000),
          status: fetchRes.status,
        });
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[skill-executor] tool ${name} error:`, msg);
    return `Error: ${msg}`;
  }
}

// ---------------------------------------------------------------------------
// HTML Auto-Detection
// ---------------------------------------------------------------------------

const HTML_INDICATORS = [
  '<!doctype', '<html', '<head', '<body', '<div', '<style',
  '<table', '<section', '<article', '<nav', '<header', '<footer',
  '<main', '<p class', '<span class', '<ul', '<ol', '<h1', '<h2', '<h3',
];

function detectHtml(text: string): boolean {
  const lower = text.toLowerCase().slice(0, 500);
  return HTML_INDICATORS.some((tag) => lower.includes(tag));
}

// ---------------------------------------------------------------------------
// Main Executor — Card Protocol Streaming with Agentic Loop
// ---------------------------------------------------------------------------

/**
 * Execute a skill using Claude SDK with Card Template Protocol.
 *
 * The executor now emits card operations instead of flat exec_* events:
 * 1. Creates a thinking-process card at start (streams reasoning)
 * 2. Text output streams to thinking card or creates freeform-html card
 * 3. Tool calls (publish_card) create structured template cards
 * 4. All cards are finalized on completion
 *
 * Returns the full generated text for persistence.
 */
export async function executeSkill(
  request: ExecRequest,
  skill: LoadedSkill,
  userPersona: string | null,
): Promise<string> {
  const systemParts: string[] = [];

  if (userPersona) {
    systemParts.push(userPersona);
  }

  systemParts.push(skill.promptContent);

  // Add template registry context so the AI knows available templates
  systemParts.push(`\n---\n\nAvailable card templates for publish_card tool:
PERCEIVE: image-analysis, text-extraction, nutrition-card, plant-animal-id, label-read, landmark-id, document-scan, barcode-scan, color-palette, handwriting-ocr, face-analysis, scene-description, object-detection
THINK: thinking-process, comparison-table, pros-cons, decision-tree, timeline, summary, fact-check, translation, explanation, estimation, sentiment-analysis
ACT: map-pins, shopping-list, recipe, nutrition-card, calendar-event, reminder, booking, price-comparison, step-guide, checklist, itinerary, weather-forecast, workout-plan, budget-tracker, file-download, link-preview, contact-card, code-snippet
INTERACT: quiz, poll-vote, rating-review, swipe-cards, form-input, draw-canvas, conversation, sorting-game, memory-game, drag-arrange, before-after, ar-overlay
PRESENT: hero-image, image-gallery, video-player, slideshow, document, infographic, chart-data, social-post, markdown-render, webpage-preview, story-card, 3d-model-viewer, music-player, pdf-viewer

Use "freeform-html" template for content that no template covers. Prefer structured templates over freeform HTML.`);

  // Add output instructions if skill specifies a preferred result template
  if (skill.manifest.output?.template) {
    const photoHint = request.mediaUrls?.length
      ? `\nInclude photo_url: "${request.mediaUrls[0]}" in the card data.`
      : '';
    systemParts.push(`\n---\n\n## Result Card Output
After completing your analysis, you MUST call the publish_card tool to present your findings as a structured card.
Use the "${skill.manifest.output.template}" template.${photoHint}
This is critical — present results as a structured card, not plain text in your response.`);
  }

  const system = systemParts.join('\n\n---\n\n');
  const model = skill.manifest.model || config.executorModel;
  const taskId = request.taskId;

  // --- Card state for this execution ---
  let thinkingCardId: string | null = null;
  let contentCardId: string | null = null;
  let resultCardPublished = false;

  // --- Manifest-driven thinking config ---
  const thinkingTitle = skill.manifest.thinking?.title
    || skill.manifest.ui?.preview_template
    || 'Thinking...';
  const predefinedSteps = skill.manifest.thinking?.steps || [];
  let stepIndex = 0;

  // Publish exec_start (include prompt + media so dashboard can display them)
  await publishStreamEvent({
    type: 'exec_start',
    taskId,
    executor: `nanoclaw:${skill.manifest.slug}`,
    prompt: request.prompt,
    mediaUrls: request.mediaUrls,
  });

  // Progress step 1: Preparing
  await publishStreamEvent({
    type: 'exec_progress',
    taskId,
    step: 1,
    total: 4,
    message: 'Preparing context...',
  });

  // Create thinking-process card at start (dynamic title from manifest)
  thinkingCardId = genCardId();
  await createCard(taskId, thinkingCardId, 'thinking-process', {
    title: thinkingTitle,
    steps: [],
  });

  // Build initial user message (with media if present)
  const userContent: Anthropic.ContentBlockParam[] = [];

  if (request.mediaUrls && request.mediaUrls.length > 0) {
    for (const url of request.mediaUrls) {
      userContent.push({
        type: 'image',
        source: { type: 'url', url },
      });
    }
  }

  userContent.push({ type: 'text', text: request.prompt });

  // Determine which tools to offer
  const tools =
    skill.manifest.requirements?.tools &&
    skill.manifest.requirements.tools.length > 0
      ? TOOL_DEFINITIONS.filter((t) =>
          skill.manifest.requirements!.tools!.includes(t.name),
        )
      : TOOL_DEFINITIONS;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userContent },
  ];

  let fullText = '';
  let htmlDetected = false;
  let detectionDone = false;
  let textBuffer = '';
  let turnCount = 0;
  const MAX_TURNS = 10;

  try {
    // --- Agentic Loop ---
    while (turnCount < MAX_TURNS) {
      turnCount++;

      // Progress: advance to next manifest-defined step (or generic fallback)
      {
        const progressStep = turnCount === 1 ? 2 : 3;
        const progressMsg = stepIndex < predefinedSteps.length
          ? predefinedSteps[stepIndex].label
          : turnCount === 1 ? 'Analyzing...' : `Processing (step ${turnCount})...`;

        await publishStreamEvent({
          type: 'exec_progress',
          taskId,
          step: progressStep,
          total: 4,
          message: progressMsg,
        });

        // Emit thinking step from manifest or generic fallback
        if (stepIndex < predefinedSteps.length) {
          const step = predefinedSteps[stepIndex];
          await streamToCard(taskId, thinkingCardId!, 'steps', JSON.stringify({
            label: step.label,
            content: step.content || '',
            status: 'active',
          }));
          stepIndex++;
        } else {
          await streamToCard(taskId, thinkingCardId!, 'steps', JSON.stringify({
            label: turnCount === 1 ? 'Analyzing' : `Processing (step ${turnCount})`,
            content: '',
            status: 'active',
          }));
        }
      }

      const stream = getClient().messages.stream({
        model,
        max_tokens: 16384,
        system,
        messages,
        tools,
      });

      let turnText = '';

      stream.on('text', async (text) => {
        turnText += text;
        fullText += text;

        // HTML auto-detection: buffer first 300 chars
        if (!detectionDone) {
          textBuffer += text;
          if (textBuffer.length >= 300) {
            detectionDone = true;
            htmlDetected = detectHtml(textBuffer);

            if (htmlDetected) {
              // Create a freeform-html card for HTML content
              contentCardId = genCardId();
              await createCard(taskId, contentCardId, 'freeform-html', {});
              await htmlStreamOp(taskId, contentCardId, textBuffer);
            } else {
              // Stream text to thinking card's conclusion slot
              await streamToCard(taskId, thinkingCardId!, 'conclusion', textBuffer);
            }
            textBuffer = '';
          }
        } else {
          // Detection done — stream to appropriate card
          if (htmlDetected && contentCardId) {
            await htmlStreamOp(taskId, contentCardId, text);
          } else {
            await streamToCard(taskId, thinkingCardId!, 'conclusion', text);
          }
        }
      });

      const finalMessage = await stream.finalMessage();

      // Flush remaining detection buffer
      if (!detectionDone && textBuffer.length > 0) {
        detectionDone = true;
        htmlDetected = detectHtml(textBuffer);

        if (htmlDetected) {
          contentCardId = genCardId();
          await createCard(taskId, contentCardId, 'freeform-html', {});
          await htmlStreamOp(taskId, contentCardId, textBuffer);
        } else if (textBuffer.trim()) {
          await streamToCard(taskId, thinkingCardId!, 'conclusion', textBuffer);
        }
        textBuffer = '';
      }

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
        break;
      }

      // Execute tools and build tool_result messages
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(
          `[skill-executor] tool call: ${toolUse.name}`,
          JSON.stringify(toolUse.input).slice(0, 200),
        );

        // Track if Claude publishes a result card
        if (toolUse.name === 'publish_card') {
          resultCardPublished = true;
        }

        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          taskId,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: 'assistant', content: finalMessage.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // --- Finalization ---

    // Finalize thinking card — mark remaining pre-defined steps as done
    if (thinkingCardId) {
      // Emit any remaining pre-defined steps as "done"
      while (stepIndex < predefinedSteps.length) {
        const step = predefinedSteps[stepIndex];
        await streamToCard(taskId, thinkingCardId, 'steps', JSON.stringify({
          label: step.label,
          content: step.content || '',
          status: 'done',
        }));
        stepIndex++;
      }

      // Final completion step
      await streamToCard(taskId, thinkingCardId, 'steps', JSON.stringify({
        label: 'Complete',
        content: 'Analysis finished.',
        status: 'done',
      }));
      await finalizeCard(taskId, thinkingCardId);
    }

    // Finalize freeform HTML card if one was created
    if (contentCardId) {
      await htmlStreamOp(taskId, contentCardId, '', true);
      await finalizeCard(taskId, contentCardId);
    }

    // Auto-publish fallback: only for skills with explicit output config where Claude didn't call publish_card
    if (!resultCardPublished && skill.manifest.output && skill.manifest.output.auto_publish !== false && fullText.trim()) {
      const fallbackTemplate = request.mediaUrls?.length
        ? 'image-analysis'
        : 'hero-image';
      const fallbackCardId = genCardId();
      const fallbackData: Record<string, unknown> = request.mediaUrls?.length
        ? {
            photo_url: request.mediaUrls[0],
            title: thinkingTitle !== 'Thinking...' ? thinkingTitle : 'Analysis Result',
            description: fullText.slice(0, 2000),
            detected_objects: [],
            tags: [],
          }
        : {
            title: thinkingTitle !== 'Thinking...' ? thinkingTitle : 'Result',
            description: fullText.slice(0, 2000),
          };

      await createCard(taskId, fallbackCardId, fallbackTemplate, fallbackData);
      await finalizeCard(taskId, fallbackCardId);
    }

    // Progress step 4: Done
    await publishStreamEvent({
      type: 'exec_progress',
      taskId,
      step: 4,
      total: 4,
      message: 'Complete',
    });

    // Publish completion
    const summary =
      fullText.length > 200 ? fullText.slice(0, 200) + '...' : fullText;

    await publishStreamEvent({
      type: 'exec_result',
      taskId,
      summary,
    });

    return fullText;
  } catch (err) {
    // Finalize any open cards before error
    if (thinkingCardId) {
      try { await finalizeCard(taskId, thinkingCardId); } catch (e) { console.warn('[skill-executor] finalize cleanup failed:', e); }
    }
    if (contentCardId) {
      try { await finalizeCard(taskId, contentCardId); } catch (e) { console.warn('[skill-executor] finalize cleanup failed:', e); }
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    await publishStreamEvent({
      type: 'exec_error',
      taskId,
      error: errorMsg,
      recoverable: false,
    });
    throw err;
  }
}
