import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { publishStreamEvent } from '../channels/stream-publisher.js';
import { loadSkill } from '../skills/skill-loader.js';
import { executeSkill } from '../skills/skill-executor.js';
import { syncToCloud } from '../fs/cloud-sync.js';
import { readFileOrNull } from '../fs/user-fs.js';
import { config } from '../config.js';
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

    // Load skill if specified
    if (request.skillSlug) {
      const skill = await loadSkill(request.skillSlug);
      if (!skill) {
        await publishStreamEvent({
          type: 'exec_error',
          taskId: request.taskId,
          error: `Skill not found: ${request.skillSlug}`,
          recoverable: false,
        });
        return;
      }

      result = await executeSkill(request, skill, persona);
    } else {
      // No skill — execute as generic prompt via skill executor with a default wrapper
      const genericSkill = {
        manifest: {
          name: 'Generic Assistant',
          slug: '_generic',
          icon: '🤖',
          description: 'General-purpose assistant',
          category: 'general',
          version: '1.0.0',
        },
        promptContent:
          'You are a helpful AI assistant. Answer the user\'s request clearly and concisely.',
        resolvedPath: '',
        isUserSkill: false,
      };

      result = await executeSkill(request, genericSkill, persona);
    }

    // Persist result to /workspace/sessions/
    await persistResult(request, result, Date.now() - startTime);

    // Sync changed files back to remote storage
    const changedFiles = await collectChangedFiles(request.sessionId, request.taskId);
    syncToCloud(changedFiles).catch((err) => {
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
    await writeFile(
      resultPath,
      JSON.stringify({
        taskId: request.taskId,
        sessionId: request.sessionId,
        skillSlug: request.skillSlug || '_generic',
        prompt: request.prompt,
        result: result.slice(0, 10000),
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
