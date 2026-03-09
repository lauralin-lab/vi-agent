import { writeUserFile, readUserFile } from '../fs/user-fs.js';
import { config } from '../config.js';
import { requestContext } from '../channels/request-context.js';

/**
 * Two-layer memory model (per memory-system-spec.md):
 *
 *   MEMORY.md          — 长期记忆，用户可见可编辑的认知档案
 *   memory/YYYY-MM-DD.md — 日记，当天所有对话的摘要
 *
 * Both written to local /workspace/, and MEMORY.md is synced to api-server
 * so the frontend Profile page can display it.
 */

/**
 * Write long-term memory (MEMORY.md).
 * Replaces entire file, then syncs to api-server DB.
 */
export async function writeMemory(content: string): Promise<void> {
  await writeUserFile('MEMORY.md', content);
  console.log(`[memory] MEMORY.md updated (${content.length} chars)`);
  // Sync to api-server so frontend can display it
  syncMemoryToApi(content).catch((err) => {
    console.warn('[memory] API sync failed:', err);
  });
}

/**
 * Read current MEMORY.md. Returns empty string if not exists.
 */
export async function readMemory(): Promise<string> {
  try {
    return await readUserFile('MEMORY.md');
  } catch {
    return '';
  }
}

/**
 * Append to today's diary (memory/YYYY-MM-DD.md).
 */
export async function appendDiary(content: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const path = `memory/${today}.md`;
  let existing = '';
  try {
    existing = await readUserFile(path);
  } catch {
    // First entry today — add date header
    existing = `# ${today}`;
  }
  await writeUserFile(path, existing + '\n\n' + content);
  console.log(`[memory] diary appended: ${path}`);
}

/**
 * Read today's diary. Returns empty string if not exists.
 */
export async function readDiary(date?: string): Promise<string> {
  const d = date || new Date().toISOString().slice(0, 10);
  try {
    return await readUserFile(`memory/${d}.md`);
  } catch {
    return '';
  }
}

// ── Legacy compatibility ──
// The skill-executor's memory_update tool still calls these.
// Route to the two-layer model.

export async function updateMemory(
  category: 'identity' | 'semantic' | 'episodic',
  filename: string,
  content: string,
): Promise<void> {
  if (category === 'episodic') {
    await appendDiary(content);
  } else {
    // identity/semantic → write to MEMORY.md via merge
    // Read current, append the new fact, write back
    const current = await readMemory();
    if (current) {
      await writeMemory(current + '\n' + content);
    } else {
      await writeMemory(content);
    }
  }
}

export async function appendMemory(
  category: 'identity' | 'semantic' | 'episodic',
  filename: string,
  content: string,
): Promise<void> {
  if (category === 'episodic') {
    await appendDiary(content);
  } else {
    const current = await readMemory();
    await writeMemory(current ? current + '\n' + content : content);
  }
}

// ── API sync ──

async function syncMemoryToApi(content: string): Promise<void> {
  const userId = requestContext.getStore()?.userId ?? config.userId;
  const resp = await fetch(`${config.apiServerUrl}/api/internal/memories/MEMORY.md`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': config.internalApiToken,
    },
    body: JSON.stringify({
      vi_user_id: userId,
      filename: 'MEMORY.md',
      content,
      category: 'long_term',
      source: 'nanoclaw',
    }),
  });
  if (!resp.ok) {
    console.warn(`[memory] API sync failed (${resp.status})`);
  }
}
