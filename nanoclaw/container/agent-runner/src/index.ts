/**
 * VI Agent Agent Runner
 * Runs inside a container. Supports two modes:
 *
 * 1. ONE-SHOT (default): Receives exec request via stdin, processes, exits.
 * 2. PERSISTENT (AGENT_MODE=persistent): Task loop — polls IPC dir for tasks,
 *    processes them, writes results. Container stays alive.
 *
 * In persistent mode:
 * - Writes CARD_OPs to IPC file (host polls and relays to Redis)
 * - Supports Claude CLI --session-id (new session) and --resume (continue session)
 * - Setup (CLAUDE.md, skills, git) happens once at startup
 *
 * Output protocol (one-shot mode only):
 *   stdout: CARD_OP::{json}\n  — card operations
 *           ---NANOCLAW_OUTPUT_START---\n{json}\n---NANOCLAW_OUTPUT_END---  — final result
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';

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
  manifestOutput?: {
    template: string;
    slots: Record<string, unknown>;
  };
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Output protocol
// ---------------------------------------------------------------------------

const CARD_OP_MARKER = 'CARD_OP::';
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

/**
 * Extract structured card data from Claude output.
 * Looks for ```card-data or ```json blocks containing valid JSON.
 */
function extractCardData(text: string): Record<string, unknown> | null {
  // Try ```card-data first (explicit marker)
  const cardDataMatch = text.match(/```card-data\s*\n([\s\S]*?)\n```/);
  if (cardDataMatch) {
    try {
      return JSON.parse(cardDataMatch[1].trim());
    } catch { /* parse failed */ }
  }

  // Fall back to last ```json block
  const jsonBlocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  for (let i = jsonBlocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(jsonBlocks[i][1].trim());
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch { /* try previous block */ }
  }

  return null;
}

/** Strip the card-data/json block from output text for display */
function stripCardDataBlock(text: string): string {
  return text
    .replace(/```card-data\s*\n[\s\S]*?\n```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalize card data to match template slot names.
 * Handles common AI output variations (e.g., "title" → "food_name",
 * "protein" → "protein_g", nested "totals" → flat fields).
 */
function normalizeCardData(
  data: Record<string, unknown>,
  template: string,
): Record<string, unknown> {
  if (template !== 'nutrition-card') return data;

  const result = { ...data };

  // Flatten nested "totals" object to top-level fields
  if (result.totals && typeof result.totals === 'object') {
    const totals = result.totals as Record<string, unknown>;
    if (totals.calories != null && result.calories == null) result.calories = totals.calories;
    if (totals.protein != null && result.protein_g == null) result.protein_g = totals.protein;
    if (totals.carbs != null && result.carbs_g == null) result.carbs_g = totals.carbs;
    if (totals.fat != null && result.fat_g == null) result.fat_g = totals.fat;
    if (totals.fiber != null && result.fiber_g == null) result.fiber_g = totals.fiber;
    delete result.totals;
  }

  // Rename common field name variations
  if (result.title && !result.food_name) { result.food_name = result.title; delete result.title; }
  if (result.name && !result.food_name) { result.food_name = result.name; delete result.name; }
  if (result.protein != null && result.protein_g == null) { result.protein_g = result.protein; delete result.protein; }
  if (result.carbs != null && result.carbs_g == null) { result.carbs_g = result.carbs; delete result.carbs; }
  if (result.fat != null && result.fat_g == null) { result.fat_g = result.fat; delete result.fat; }
  if (result.fiber != null && result.fiber_g == null) { result.fiber_g = result.fiber; delete result.fiber; }

  // Remove non-slot fields that would clutter the card
  delete result.items;

  return result;
}

/** IPC card ops file path (persistent mode) — append-only JSONL */
const IPC_CARDOPS_DIR = '/workspace/ipc/cardops';
let ipcCardOpsFile: string | null = null;

/** Emit a card operation — routes to IPC file (persistent) or stdout (one-shot) */
function emitCardOp(op: Record<string, unknown>): void {
  if (ipcCardOpsFile) {
    // Persistent mode: append to IPC JSONL file (host polls and relays to Redis)
    try {
      const data = JSON.stringify(op) + '\n';
      const fd = fs.openSync(ipcCardOpsFile, 'a');
      fs.writeSync(fd, data);
      fs.fdatasyncSync(fd);
      fs.closeSync(fd);
      log(`Card op written: ${op.op} cardId=${op.cardId} (${data.length} bytes)`);
    } catch (err) {
      log(`Failed to write card op to IPC: ${err}`);
    }
  } else {
    // One-shot mode: emit to stdout for host parsing
    console.log(`${CARD_OP_MARKER}${JSON.stringify(op)}`);
  }
}

/** Initialize IPC card ops file for persistent mode */
function initCardOpsIpc(): void {
  fs.mkdirSync(IPC_CARDOPS_DIR, { recursive: true });
  ipcCardOpsFile = path.join(IPC_CARDOPS_DIR, 'stream.jsonl');
  // Truncate on startup — host should have consumed previous entries
  fs.writeFileSync(ipcCardOpsFile, '');
  log(`Card ops IPC initialized: ${ipcCardOpsFile}`);
}

/** Emit the final output result (one-shot mode only) */
function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

/** Log to stderr (not parsed by host) */
function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

// (Redis removed — card ops go through IPC, host relays to Redis)

// ---------------------------------------------------------------------------
// Stdin reader (one-shot mode)
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
// Hooks
// ---------------------------------------------------------------------------

const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'API_SERVER_URL', 'INTERNAL_API_TOKEN'];

function createSanitizeBashHook() {
  return async (input: Record<string, unknown>) => {
    const toolInput = input.tool_input as { command?: string } | undefined;
    const command = toolInput?.command;
    if (!command) return {};
    const unsetPrefix = `unset ${SECRET_ENV_VARS.join(' ')} 2>/dev/null; `;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { ...toolInput, command: unsetPrefix + command },
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Skills setup
// ---------------------------------------------------------------------------

function setupSkills(): void {
  const packagesDir = '/workspace/packages';
  const skillsDir = '/workspace/group/.claude/skills';
  if (!fs.existsSync(packagesDir)) {
    log('No packages directory found, skipping skills setup');
    return;
  }
  fs.mkdirSync(skillsDir, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(packagesDir)) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const pkgDir = path.join(packagesDir, entry);
    if (!fs.statSync(pkgDir).isDirectory()) continue;
    let skillFile = path.join(pkgDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      skillFile = path.join(pkgDir, 'instruction.md');
      if (!fs.existsSync(skillFile)) continue;
    }
    const destDir = path.join(skillsDir, entry);
    try {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(skillFile, path.join(destDir, 'SKILL.md'));
      count++;
    } catch (err) {
      try {
        fs.writeFileSync(path.join(destDir, 'SKILL.md'), fs.readFileSync(skillFile, 'utf-8'));
        count++;
      } catch {
        log(`Could not copy skill ${entry}: ${err}`);
      }
    }
  }
  log(`Set up ${count} skills from packages`);
}

// ---------------------------------------------------------------------------
// CLAUDE.md setup
// ---------------------------------------------------------------------------

function setupClaudeMd(): void {
  const destPath = '/workspace/group/CLAUDE.md';
  const srcPath = '/app/CLAUDE.md';
  if (!fs.existsSync(srcPath)) {
    log('No base CLAUDE.md found in container image');
    return;
  }
  // Always overwrite — ensures updates to CLAUDE.md take effect
  // even on persistent volumes with stale copies
  try {
    fs.copyFileSync(srcPath, destPath);
    log('Copied base CLAUDE.md to workspace');
  } catch (err) {
    try {
      fs.writeFileSync(destPath, fs.readFileSync(srcPath, 'utf-8'));
      log('Wrote base CLAUDE.md to workspace (fallback)');
    } catch {
      log(`Could not set up CLAUDE.md: ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Git setup
// ---------------------------------------------------------------------------

function setupGit(): void {
  const groupDir = '/workspace/group';
  if (!fs.existsSync(path.join(groupDir, '.git'))) {
    log('Initializing git repo in workspace');
    execSync([
      'git init',
      'git config user.email "agent@vi.local"',
      'git config user.name "VI Agent"',
      'git config --global --add safe.directory /workspace/group',
    ].join(' && '), { cwd: groupDir, stdio: 'ignore' });
  } else {
    try {
      execSync('git config --global --add safe.directory /workspace/group', { stdio: 'ignore' });
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// #tag detection
// ---------------------------------------------------------------------------

function processHashTags(prompt: string): { cleanPrompt: string; activatedSkills: string[] } {
  const tagPattern = /#([a-zA-Z0-9_-]+)/g;
  const activatedSkills: string[] = [];
  let cleanPrompt = prompt;

  let match;
  while ((match = tagPattern.exec(prompt)) !== null) {
    const tag = match[1];
    const skillDir = `/workspace/group/.claude/skills/${tag}`;
    if (fs.existsSync(skillDir)) {
      activatedSkills.push(tag);
    }
  }

  if (activatedSkills.length > 0) {
    cleanPrompt = prompt.replace(/#([a-zA-Z0-9_-]+)/g, (match, tag) => {
      return activatedSkills.includes(tag) ? '' : match;
    }).trim();
    const prefill = activatedSkills.map((skill) => `[skill ${skill} — phase: start]`).join(' ');
    cleanPrompt = `${cleanPrompt}\n\n${prefill}`;
    log(`Activated skills via #tag: ${activatedSkills.join(', ')}`);
  }

  return { cleanPrompt, activatedSkills };
}

// ---------------------------------------------------------------------------
// Session ID normalization
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map non-UUID session IDs to deterministic UUIDs */
const sessionIdMap = new Map<string, string>();

/**
 * Ensure sessionId is a valid UUID for Claude CLI.
 * If it's already a UUID, return as-is. Otherwise, generate a deterministic
 * UUID v5 (SHA-1 based) from the original ID so the same session always maps
 * to the same UUID.
 */
function toClaudeSessionId(sessionId: string): string {
  if (UUID_RE.test(sessionId)) return sessionId;

  // Check cache
  const cached = sessionIdMap.get(sessionId);
  if (cached) return cached;

  // Generate deterministic UUID v5-style from SHA-1 hash
  const hash = crypto.createHash('sha1').update(sessionId).digest('hex');
  const uuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),  // version 5
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');

  sessionIdMap.set(sessionId, uuid);
  log(`Mapped session "${sessionId}" → UUID "${uuid}"`);
  return uuid;
}

// ---------------------------------------------------------------------------
// Session tracking (persistent mode)
// ---------------------------------------------------------------------------

/** Track which sessions have been started (so we know --session-id vs --resume) */
const startedSessions = new Set<string>();

/**
 * Check if a Claude CLI session already exists on disk.
 * Used to recover session tracking after container restart.
 * Claude stores sessions in ~/.claude/projects/ as JSON files.
 */
function isSessionOnDisk(sessionId: string): boolean {
  try {
    const claudeDir = path.join(process.env.HOME || '/root', '.claude');
    if (!fs.existsSync(claudeDir)) return false;

    // Claude CLI stores sessions in projects dir — search recursively for session ID
    // This is a best-effort check; if we can't find it, we start fresh
    const projectsDir = path.join(claudeDir, 'projects');
    if (!fs.existsSync(projectsDir)) return false;

    // Walk the projects directory looking for session files containing this ID
    const searchDir = (dir: string): boolean => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (searchDir(path.join(dir, entry.name))) return true;
          } else if (entry.name.endsWith('.jsonl') || entry.name.includes(sessionId)) {
            // Check filename match
            if (entry.name.includes(sessionId)) return true;
          }
        }
      } catch { /* permission error, skip */ }
      return false;
    };

    return searchDir(projectsDir);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Claude CLI runner
// ---------------------------------------------------------------------------

async function runClaudeCli(
  prompt: string,
  input: ContainerInput,
  env: Record<string, string | undefined>,
): Promise<string> {
  const groupDir = '/workspace/group';

  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--output-format', 'text',
      '--max-turns', '30',
      '--allowedTools', 'Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,TodoWrite,ToolSearch',
      '--add-dir', '/workspace/media',
      '--add-dir', '/workspace/user-data',
    ];

    // Session continuity: use --session-id for new sessions, --resume for follow-ups
    if (input.sessionId) {
      // Ensure session ID is a valid UUID (Claude CLI requirement)
      const claudeSessionId = toClaudeSessionId(input.sessionId);

      const knownSession = startedSessions.has(claudeSessionId);
      const sessionOnDisk = !knownSession && isSessionOnDisk(claudeSessionId);

      if (knownSession || sessionOnDisk) {
        // Continue existing session (in-memory or recovered from disk after restart)
        args.push('--resume', claudeSessionId);
        if (sessionOnDisk && !knownSession) {
          startedSessions.add(claudeSessionId);
          log(`Recovered session ${claudeSessionId} from disk, resuming`);
        } else {
          log(`Resuming session ${claudeSessionId}`);
        }
      } else {
        // Start new session with explicit ID
        args.push('--session-id', claudeSessionId);
        startedSessions.add(claudeSessionId);
        log(`Starting new session ${claudeSessionId}`);
      }
    }

    log(`Spawning claude CLI with ${args.length} args (prompt: ${prompt.length} chars)`);

    const child = spawn('claude', args, {
      cwd: groupDir,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;

      // In one-shot mode, forward CARD_OP markers from Claude CLI stdout
      if (!ipcCardOpsFile) {
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith(CARD_OP_MARKER)) {
            console.log(trimmed);
          }
        }
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      for (const line of chunk.trim().split('\n')) {
        if (line) log(`[claude-cli] ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`Claude CLI completed successfully (${stdout.length} chars output)`);
        resolve(stdout.trim());
      } else {
        log(`Claude CLI exited with code ${code}`);
        log(`stderr tail: ${stderr.slice(-500)}`);

        // If --resume failed, it might be because session doesn't exist yet
        // (e.g., container restarted and startedSessions was lost)
        // Retry with --session-id
        if (code !== 0 && input.sessionId) {
          const claudeSid = toClaudeSessionId(input.sessionId);
          if (startedSessions.has(claudeSid)) {
            log(`Resume might have failed for session ${claudeSid}, will use --session-id on retry`);
            startedSessions.delete(claudeSid);
          }
        }

        if (stdout.trim().length > 0) {
          log(`Using partial output despite non-zero exit code`);
          resolve(stdout.trim());
        } else {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(-300)}`));
        }
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Task execution (shared between one-shot and persistent modes)
// ---------------------------------------------------------------------------

async function executeTask(input: ContainerInput): Promise<ContainerOutput> {
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(input.secrets || {})) {
    sdkEnv[key] = value;
  }

  const { cleanPrompt, activatedSkills } = processHashTags(input.prompt);
  let fullPrompt = cleanPrompt;

  // Skills are loaded via .claude/skills/ — Claude auto-discovers and invokes them.
  // No need to inject skill prompts or structured output instructions here.

  // Download media files
  if (input.mediaUrls && input.mediaUrls.length > 0) {
    const mediaDir = '/workspace/media';
    fs.mkdirSync(mediaDir, { recursive: true });
    const localPaths: string[] = [];

    for (const url of input.mediaUrls) {
      try {
        if (url.startsWith('/workspace/')) {
          localPaths.push(url);
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
          const ext = url.split('?')[0].split('.').pop()?.slice(0, 5) || 'jpg';
          const filename = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const filePath = path.join(mediaDir, filename);
          const response = await fetch(url);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            localPaths.push(filePath);
            log(`Downloaded media: ${url} → ${filePath} (${buffer.length} bytes)`);
          } else {
            log(`Failed to download media: ${url} (${response.status})`);
            localPaths.push(url);
          }
        } else {
          localPaths.push(url);
        }
      } catch (err) {
        log(`Error downloading media ${url}: ${err}`);
        localPaths.push(url);
      }
    }

    fullPrompt += `\n\nThe user attached ${localPaths.length} media file(s). Use the Read tool to view them:\n${localPaths.map((p) => `- ${p}`).join('\n')}`;
  }

  // Thinking card
  const skillLabel = activatedSkills.length > 0
    ? activatedSkills.join(', ')
    : input.skillSlug;
  emitCardOp({
    op: 'create_card',
    taskId: input.taskId,
    cardId: `thinking-${input.taskId}`,
    template: 'thinking',
    data: {
      title: skillLabel ? `Running ${skillLabel}...` : 'Processing...',
      status: 'thinking',
    },
  });

  try {
    const resultText = await runClaudeCli(fullPrompt, input, sdkEnv);

    // Extract structured card data from Claude's output (card-data JSON block with _template)
    let templateCardCreated = false;
    const cardData = extractCardData(resultText);
    if (cardData && cardData._template) {
      const templateName = String(cardData._template);
      delete cardData._template; // Don't pass meta-field to the card renderer
      // Normalize field names to match template slots (safety net for AI variations)
      const normalizedData = normalizeCardData(cardData, templateName);
      // Create the structured template card
      const cardId = `card-${input.taskId}-${Date.now()}`;
      emitCardOp({
        op: 'create_card',
        taskId: input.taskId,
        cardId,
        template: templateName,
        data: normalizedData,
      });
      emitCardOp({
        op: 'finalize_card',
        taskId: input.taskId,
        cardId,
      });
      templateCardCreated = true;
      log(`Created template card: ${templateName} from _template field`);
    } else if (cardData) {
      // Card data without _template — check manifestOutput fallback
      const fallbackTemplate = input.manifestOutput?.template;
      if (fallbackTemplate) {
        const normalizedData = normalizeCardData(cardData, fallbackTemplate);
        const cardId = `card-${input.taskId}-${Date.now()}`;
        emitCardOp({
          op: 'create_card',
          taskId: input.taskId,
          cardId,
          template: fallbackTemplate,
          data: normalizedData,
        });
        emitCardOp({
          op: 'finalize_card',
          taskId: input.taskId,
          cardId,
        });
        templateCardCreated = true;
        log(`Created template card: ${fallbackTemplate} from manifestOutput fallback`);
      }
    }

    // Replace thinking card with text-result (analysis text)
    const displayText = templateCardCreated
      ? stripCardDataBlock(resultText).slice(0, 4000)
      : resultText.slice(0, 4000);

    emitCardOp({
      op: 'replace_card',
      taskId: input.taskId,
      cardId: `thinking-${input.taskId}`,
      template: 'text-result',
      data: {
        title: skillLabel || 'Result',
        content: displayText,
        status: 'complete',
      },
    });

    emitCardOp({
      op: 'finalize_card',
      taskId: input.taskId,
      cardId: `thinking-${input.taskId}`,
    });

    return {
      status: 'success',
      result: resultText.slice(0, 2000),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Execution error: ${errorMessage}`);

    emitCardOp({
      op: 'replace_card',
      taskId: input.taskId,
      cardId: `thinking-${input.taskId}`,
      template: 'text-result',
      data: { title: 'Error', content: errorMessage, status: 'error' },
    });

    emitCardOp({
      op: 'finalize_card',
      taskId: input.taskId,
      cardId: `thinking-${input.taskId}`,
    });

    return {
      status: 'error',
      result: null,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// Persistent mode: task loop
// ---------------------------------------------------------------------------

async function taskLoop(): Promise<void> {
  const tasksDir = '/workspace/ipc/tasks';
  const resultsDir = '/workspace/ipc/results';

  // Ensure dirs exist
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  log('Starting persistent task loop...');

  // One-time setup
  try { setupClaudeMd(); } catch (err) { log(`setupClaudeMd failed (non-fatal): ${err}`); }
  try { setupSkills(); } catch (err) { log(`setupSkills failed (non-fatal): ${err}`); }
  try { setupGit(); } catch (err) { log(`setupGit failed (non-fatal): ${err}`); }

  // Init IPC card ops file (host polls and relays to Redis)
  initCardOpsIpc();

  // Poll loop
  while (true) {
    try {
      const files = fs.readdirSync(tasksDir)
        .filter((f) => f.endsWith('.json'))
        .sort(); // Process in order

      for (const file of files) {
        const taskPath = path.join(tasksDir, file);
        let input: ContainerInput;

        try {
          const raw = fs.readFileSync(taskPath, 'utf-8');
          input = JSON.parse(raw);
          // Delete task file immediately to prevent re-processing
          fs.unlinkSync(taskPath);
        } catch (err) {
          log(`Failed to read task file ${file}: ${err}`);
          try { fs.unlinkSync(taskPath); } catch { /* ignore */ }
          continue;
        }

        log(`Processing task ${input.taskId} (session: ${input.sessionId || 'none'})`);

        // Note: exec_start is published by exec-channel on the host side.
        // Do NOT publish it here to avoid duplicate events.

        // Execute the task
        const result = await executeTask(input);

        // Write result to IPC
        const resultPath = path.join(resultsDir, `${input.taskId}.json`);
        const tmpPath = resultPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(result));
        fs.renameSync(tmpPath, resultPath); // Atomic rename

        log(`Task ${input.taskId} completed: ${result.status}`);
      }
    } catch (err) {
      log(`Task loop error: ${err}`);
    }

    // Sleep 500ms between polls
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// ---------------------------------------------------------------------------
// One-shot mode (backward compat)
// ---------------------------------------------------------------------------

async function oneShotMain(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
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

  // One-time setup per container run
  try { setupClaudeMd(); } catch (err) { log(`setupClaudeMd failed (non-fatal): ${err}`); }
  try { setupSkills(); } catch (err) { log(`setupSkills failed (non-fatal): ${err}`); }
  try { setupGit(); } catch (err) { log(`setupGit failed (non-fatal): ${err}`); }

  try {
    const result = await executeTask(input);
    writeOutput(result);
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

// ---------------------------------------------------------------------------
// Main — select mode based on AGENT_MODE env var
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = process.env.AGENT_MODE || 'oneshot';

  if (mode === 'persistent') {
    log('Starting in PERSISTENT mode (task loop)');
    // Handle shutdown gracefully
    process.on('SIGTERM', () => {
      log('Received SIGTERM, shutting down...');
      process.exit(0);
    });
    process.on('SIGINT', () => {
      log('Received SIGINT, shutting down...');
      process.exit(0);
    });
    await taskLoop();
  } else {
    log('Starting in ONE-SHOT mode (stdin)');
    await oneShotMain();
  }
}

main();
