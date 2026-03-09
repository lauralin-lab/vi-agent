/**
 * VI Agent Agent Runner
 * Runs inside a container, receives exec request via stdin,
 * emits CARD_OP markers on stdout for card operations.
 *
 * Input protocol:
 *   stdin: Full ContainerInput JSON
 *
 * Output protocol:
 *   stdout: CARD_OP::{json}\n  — card operations (parsed by host stream-parser)
 *           ---NANOCLAW_OUTPUT_START---\n{json}\n---NANOCLAW_OUTPUT_END---  — final result
 *   stderr: debug/log output (not parsed)
 */

import fs from 'fs';
import path from 'path';

interface ContainerInput {
  prompt: string;
  userId: string;
  sessionId?: string;
  taskId: string;
  skillSlug?: string;
  mediaUrls?: string[];
  context?: Record<string, unknown>;
  skillPrompt?: string;
  packageId?: string;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Output protocol
// ---------------------------------------------------------------------------

const CARD_OP_MARKER = 'CARD_OP::';
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

/** Emit a card operation to stdout (parsed by host container-runner) */
function emitCardOp(op: Record<string, unknown>): void {
  console.log(`${CARD_OP_MARKER}${JSON.stringify(op)}`);
}

/** Emit the final output result */
function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

/** Log to stderr (not parsed by host) */
function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

// ---------------------------------------------------------------------------
// Stdin reader
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Skill execution via Claude Code SDK
// ---------------------------------------------------------------------------

async function executeWithClaudeCode(input: ContainerInput): Promise<void> {
  // Build SDK env: merge secrets into env for the SDK only
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(input.secrets || {})) {
    sdkEnv[key] = value;
  }

  // Build the prompt with skill context
  let fullPrompt = input.prompt;

  // If a skill prompt is available, prepend it as system context
  if (input.skillPrompt) {
    fullPrompt = `${input.skillPrompt}\n\n---\n\nUser request: ${input.prompt}`;
  }

  // Add media URLs if present
  if (input.mediaUrls && input.mediaUrls.length > 0) {
    fullPrompt += `\n\nMedia URLs:\n${input.mediaUrls.map((url) => `- ${url}`).join('\n')}`;
  }

  // Create a thinking card
  emitCardOp({
    op: 'create_card',
    taskId: input.taskId,
    cardId: `thinking-${input.taskId}`,
    template: 'thinking',
    data: {
      title: input.skillSlug
        ? `Running ${input.skillSlug}...`
        : 'Processing...',
      status: 'thinking',
    },
  });

  try {
    // Try to use Claude Code SDK if available
    let queryFn: typeof import('@anthropic-ai/claude-code').query | null = null;
    try {
      const sdk = await import('@anthropic-ai/claude-code');
      queryFn = sdk.query;
    } catch {
      log('Claude Code SDK not available, using direct API fallback');
    }

    if (queryFn) {
      // Use Claude Code SDK
      let resultText = '';

      for await (const message of queryFn({
        prompt: fullPrompt,
        options: {
          cwd: '/workspace/group',
          env: sdkEnv,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        },
      })) {
        if (message.type === 'assistant' && 'message' in message) {
          const content = (message as { message: { content: Array<{ type: string; text?: string }> } }).message.content;
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              resultText += block.text;

              // Check for CARD_OP markers in the assistant's text output
              // Skills can embed CARD_OP:: markers in their text responses
              for (const line of block.text.split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith(CARD_OP_MARKER)) {
                  // Already formatted as CARD_OP, emit directly
                  console.log(trimmed);
                }
              }
            }
          }
        }

        if (message.type === 'result') {
          const result = 'result' in message
            ? (message as { result?: string }).result
            : null;
          if (result) {
            resultText = result;
          }
        }
      }

      // Finalize thinking card
      emitCardOp({
        op: 'replace_card',
        taskId: input.taskId,
        cardId: `thinking-${input.taskId}`,
        template: 'text-result',
        data: {
          title: input.skillSlug || 'Result',
          content: resultText.slice(0, 4000),
          status: 'complete',
        },
      });

      emitCardOp({
        op: 'finalize_card',
        taskId: input.taskId,
        cardId: `thinking-${input.taskId}`,
      });

      writeOutput({
        status: 'success',
        result: resultText.slice(0, 2000),
      });
    } else {
      // Fallback: no SDK available — report error
      emitCardOp({
        op: 'replace_card',
        taskId: input.taskId,
        cardId: `thinking-${input.taskId}`,
        template: 'text-result',
        data: {
          title: 'Error',
          content: 'Claude Code SDK not available in container',
          status: 'error',
        },
      });

      emitCardOp({
        op: 'finalize_card',
        taskId: input.taskId,
        cardId: `thinking-${input.taskId}`,
      });

      writeOutput({
        status: 'error',
        result: null,
        error: 'Claude Code SDK not available',
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Execution error: ${errorMessage}`);

    emitCardOp({
      op: 'replace_card',
      taskId: input.taskId,
      cardId: `thinking-${input.taskId}`,
      template: 'text-result',
      data: {
        title: 'Error',
        content: errorMessage,
        status: 'error',
      },
    });

    emitCardOp({
      op: 'finalize_card',
      taskId: input.taskId,
      cardId: `thinking-${input.taskId}`,
    });

    writeOutput({
      status: 'error',
      result: null,
      error: errorMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
    // Delete temp file if entrypoint wrote one
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received task ${input.taskId} for user ${input.userId}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  try {
    await executeWithClaudeCode(input);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Fatal error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      error: errorMessage,
    });
    process.exit(1);
  }
}

main();
