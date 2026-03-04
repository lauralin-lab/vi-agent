import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';
import { config } from '../config.js';
import { publishStreamEvent } from '../channels/stream-publisher.js';
import { readUserFile, writeUserFile, listUserDir } from '../fs/user-fs.js';
import { updateMemory, appendMemory } from '../tools/memory-update.js';
import { oauthCall } from '../tools/oauth-call.js';
import { publishResult } from '../tools/publish-result.js';
import type { ExecRequest } from '../channels/types.js';
import type { LoadedSkill } from './types.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
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
    name: 'publish_result',
    description:
      'Publish a structured result to the frontend. Use type "html" for rich HTML content, "text" for plain text, "module" for structured UI modules.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['html', 'text', 'module'],
          description: 'Result type',
        },
        content: { type: 'string', description: 'Result content' },
        module_type: {
          type: 'string',
          description:
            'Module type (when type="module"): place_card, checklist, weather, comparison, recipe, steps_guide, info_card, image_gallery',
        },
      },
      required: ['type', 'content'],
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
      case 'publish_result': {
        await publishResult(taskId, {
          type: input.type as 'html' | 'text' | 'module',
          content: input.content as string,
          moduleType: input.module_type as string | undefined,
        });
        return `Result published (${input.type})`;
      }
      case 'bash': {
        const command = input.command as string;
        // Block dangerous commands
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
        // Stub — no search API configured
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
  '<!doctype',
  '<html',
  '<head',
  '<body',
  '<div',
  '<style',
  '<table',
  '<section',
  '<article',
  '<nav',
  '<header',
  '<footer',
  '<main',
  '<p class',
  '<span class',
  '<ul',
  '<ol',
  '<h1',
  '<h2',
  '<h3',
];

function detectHtml(text: string): boolean {
  const lower = text.toLowerCase().slice(0, 500);
  return HTML_INDICATORS.some((tag) => lower.includes(tag));
}

// ---------------------------------------------------------------------------
// Main Executor — Agentic Loop with Streaming + Tools
// ---------------------------------------------------------------------------

/**
 * Execute a skill using Claude SDK with tools and streaming.
 *
 * Features:
 * - Agentic loop: Claude can call tools (file, memory, oauth, publish) and continue
 * - Streaming: Text chunks are published to vi:stream in real-time
 * - HTML auto-detection: First 300 chars buffered to detect HTML vs text
 * - Progress events: exec_progress emitted at key stages
 * - Media support: mediaUrls in request become image_url content blocks
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

  const system = systemParts.join('\n\n---\n\n');
  const model = skill.manifest.model || config.executorModel;
  const taskId = request.taskId;

  // Publish exec_start
  await publishStreamEvent({
    type: 'exec_start',
    taskId,
    executor: `nanoclaw:${skill.manifest.slug}`,
  });

  // Progress step 1: Preparing
  await publishStreamEvent({
    type: 'exec_progress',
    taskId,
    step: 1,
    total: 4,
    message: 'Preparing context...',
  });

  // Build initial user message (with media if present)
  const userContent: Anthropic.ContentBlockParam[] = [];

  // Add images from mediaUrls
  if (request.mediaUrls && request.mediaUrls.length > 0) {
    for (const url of request.mediaUrls) {
      userContent.push({
        type: 'image',
        source: { type: 'url', url },
      });
    }
  }

  // Add text prompt
  userContent.push({ type: 'text', text: request.prompt });

  // Determine which tools to offer based on skill requirements
  const tools =
    skill.manifest.requirements?.tools &&
    skill.manifest.requirements.tools.length > 0
      ? TOOL_DEFINITIONS.filter((t) =>
          skill.manifest.requirements!.tools!.includes(t.name),
        )
      : TOOL_DEFINITIONS; // default: all tools

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userContent },
  ];

  let fullText = '';
  let htmlDetected = false;
  let detectionDone = false;
  let textBuffer = '';
  let turnCount = 0;
  const MAX_TURNS = 10; // prevent infinite tool loops

  try {
    // --- Agentic Loop ---
    while (turnCount < MAX_TURNS) {
      turnCount++;

      // Progress: Thinking (on first turn) or Executing tools (subsequent)
      if (turnCount === 1) {
        await publishStreamEvent({
          type: 'exec_progress',
          taskId,
          step: 2,
          total: 4,
          message: 'Thinking...',
        });
      } else {
        await publishStreamEvent({
          type: 'exec_progress',
          taskId,
          step: 3,
          total: 4,
          message: `Executing tools (turn ${turnCount})...`,
        });
      }

      const stream = getClient().messages.stream({
        model,
        max_tokens: 16384,
        system,
        messages,
        tools,
      });

      // Collect text from this turn
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
            // Flush the entire buffer as the detected type
            const streamType = htmlDetected
              ? 'exec_html_stream'
              : 'exec_text_stream';
            await publishStreamEvent({
              type: streamType,
              taskId,
              chunk: textBuffer,
            });
            textBuffer = '';
          }
        } else {
          // Detection already done — stream immediately
          const streamType = htmlDetected
            ? 'exec_html_stream'
            : 'exec_text_stream';
          await publishStreamEvent({
            type: streamType,
            taskId,
            chunk: text,
          });
        }
      });

      const finalMessage = await stream.finalMessage();

      // If detection buffer wasn't flushed yet (short response), flush now
      if (!detectionDone && textBuffer.length > 0) {
        detectionDone = true;
        htmlDetected = detectHtml(textBuffer);
        const streamType = htmlDetected
          ? 'exec_html_stream'
          : 'exec_text_stream';
        await publishStreamEvent({
          type: streamType,
          taskId,
          chunk: textBuffer,
        });
        textBuffer = '';
      }

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
      );

      if (
        toolUseBlocks.length === 0 ||
        finalMessage.stop_reason !== 'tool_use'
      ) {
        // No more tool calls — done
        break;
      }

      // Execute tools and build tool_result messages
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(
          `[skill-executor] tool call: ${toolUse.name}`,
          JSON.stringify(toolUse.input).slice(0, 200),
        );
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

      // Append assistant message and tool results to conversation
      messages.push({ role: 'assistant', content: finalMessage.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // Progress step 4: Done
    await publishStreamEvent({
      type: 'exec_progress',
      taskId,
      step: 4,
      total: 4,
      message: 'Complete',
    });

    // Publish stream done
    const streamType = htmlDetected
      ? 'exec_html_stream'
      : 'exec_text_stream';
    await publishStreamEvent({
      type: streamType,
      taskId,
      chunk: '',
      done: true,
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
