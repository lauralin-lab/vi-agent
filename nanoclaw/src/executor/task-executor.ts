import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { loadSkill } from '../skills/skill-loader.js';
import { executeSkill } from '../skills/skill-executor.js';
import { syncToCloud } from '../fs/cloud-sync.js';
import { readFileOrNull } from '../fs/user-fs.js';
import { config } from '../config.js';
import { requestContext } from '../channels/request-context.js';
import { getSessionCardState } from '../persistence/card-store.js';
import type { ExecRequest } from '../channels/types.js';

/**
 * Main task execution entry point.
 * On receiving an ExecRequest:
 * 1. Load skill (if skillSlug provided)
 * 2. Read user persona (CLAUDE.md)
 * 3. Execute via Claude SDK with streaming
 * 4. Publish results to vi:stream:{uid}
 * 5. Persist result to /workspace/sessions/
 */
export async function executeTask(request: ExecRequest): Promise<void> {
  console.log(`[task-executor] starting task ${request.taskId}`);
  const startTime = Date.now();

  try {
    // Read user persona
    const persona = await readFileOrNull(join(config.userDataDir, 'CLAUDE.md'));

    let result: string;

    // Load skill — explicit slug → auto-route for photos → generic fallback
    let skillSlug = request.skillSlug;

    // Auto-route: no skill specified + photo attached → try style-advisor as default photo skill
    if (!skillSlug && request.mediaUrls?.length) {
      const prompt = (request.prompt || '').toLowerCase();
      if (/food|meal|eat|dish|cook|recipe|calori|nutri/i.test(prompt)) {
        skillSlug = 'recipe-analyzer';
      } else if (/document|receipt|scan|ocr|text|card|form|letter/i.test(prompt)) {
        skillSlug = 'document-scanner';
      } else {
        skillSlug = 'style-advisor'; // default photo skill
      }
      console.log(`[task-executor] auto-routed photo to skill: ${skillSlug}`);
    }

    if (skillSlug) {
      const skill = await loadSkill(skillSlug);
      if (skill) {
        result = await executeSkill(request, skill, persona);
      } else {
        // Skill not found — fall through to generic with photo-aware config
        console.warn(`[task-executor] skill not found: ${skillSlug}, using generic`);
        result = await executeSkill(request, buildGenericSkill(request), persona);
      }
    } else {
      result = await executeSkill(request, buildGenericSkill(request), persona);
    }

    // Persist result to /workspace/sessions/
    await persistResult(request, result, Date.now() - startTime);

    // Sync changed files back to remote storage
    const userId = requestContext.getStore()?.userId ?? config.userId;
    const changedFiles = await collectChangedFiles(request.sessionId, request.taskId);
    syncToCloud(changedFiles, userId).catch((err) => {
      console.error('[task-executor] post-task sync failed:', err);
    });

    console.log(`[task-executor] completed task ${request.taskId} (${Date.now() - startTime}ms)`);
  } catch (err) {
    console.error(`[task-executor] failed task ${request.taskId}:`, err);
    // exec_error already published by skill-executor on failure
  }
}

/** Persist task result to the sessions directory */
async function persistResult(
  request: ExecRequest,
  result: string,
  durationMs: number,
): Promise<void> {
  try {
    const resultPath = join(
      config.userDataDir,
      'sessions',
      request.sessionId,
      `${request.taskId}.json`,
    );
    await mkdir(dirname(resultPath), { recursive: true });

    // Collect card final state from in-memory card store
    const cardState = getSessionCardState(request.sessionId);
    const cards: Record<string, unknown> = {};
    for (const [cardId, state] of Object.entries(cardState.finalState)) {
      if (state.status !== 'removed') {
        cards[cardId] = { template: state.template, data: state.data, status: state.status };
      }
    }

    await writeFile(
      resultPath,
      JSON.stringify({
        taskId: request.taskId,
        sessionId: request.sessionId,
        skillSlug: request.skillSlug || 'agent:main',
        prompt: request.prompt,
        mediaUrls: request.mediaUrls || [],
        result: result.slice(0, 10000),
        cards: Object.keys(cards).length > 0 ? cards : undefined,
        durationMs,
        ts: Date.now(),
      }),
      'utf-8',
    );
  } catch (err) {
    console.error(`[task-executor] failed to persist result:`, err);
  }
}

/** Collect files that may have changed during task execution (session + memory dirs). */
async function collectChangedFiles(sessionId: string, taskId: string): Promise<string[]> {
  const files: string[] = [];
  // Always sync the session result file
  files.push(join('sessions', sessionId, `${taskId}.json`));
  // Sync memory dirs that skills commonly write to
  for (const dir of ['memory/identity', 'memory/semantic', 'memory/episodic']) {
    try {
      const entries = await readdir(join(config.userDataDir, dir));
      for (const entry of entries) {
        files.push(join(dir, entry));
      }
    } catch {
      // directory may not exist
    }
  }
  return files;
}

/** Build a generic skill with photo-aware thinking/output config */
function buildGenericSkill(request: ExecRequest) {
  const hasMedia = !!request.mediaUrls?.length;
  return {
    manifest: {
      name: 'Main Agent',
      slug: 'agent:main',
      icon: '🤖',
      description: 'General-purpose assistant',
      category: 'general' as const,
      version: '1.0.0',
      ...(hasMedia && {
        thinking: {
          title: 'Analyzing Photo',
          steps: [
            { label: 'Processing image', content: 'Examining the photo' },
            { label: 'Generating analysis', content: 'Preparing results' },
          ],
        },
        output: { template: 'image-analysis' },
      }),
    },
    promptContent: hasMedia
      ? 'You are a helpful AI assistant with vision capabilities. Analyze the user\'s photo and provide detailed, structured observations.'
      : 'You are a helpful AI assistant. Answer the user\'s request clearly and concisely.',
    resolvedPath: '',
    isUserSkill: false,
  };
}
