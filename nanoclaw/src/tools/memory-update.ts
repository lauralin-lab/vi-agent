import { writeUserFile, readUserFile, listUserDir } from '../fs/user-fs.js';
import { config } from '../config.js';
import { requestContext } from '../channels/request-context.js';

/**
 * Two-layer memory model:
 *
 *   MEMORY.md              — 长期身份记忆（你是谁），用户可见可编辑
 *   memory/{category}.md   — 主题记忆（聊过什么），AI 自动管理
 *
 * MEMORY.md synced to api-server for frontend display.
 * Category files synced to api-server for persistence.
 */

// ── Layer 1: MEMORY.md (long-term identity) ──

/**
 * Write long-term memory (MEMORY.md).
 * Replaces entire file, then syncs to api-server DB.
 */
export async function writeMemory(content: string): Promise<void> {
  await writeUserFile('MEMORY.md', content);
  console.log(`[memory] MEMORY.md updated (${content.length} chars)`);
  syncToApi('MEMORY.md', content, 'long_term').catch((err) => {
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

// ── Layer 2: Category files (topic-based notes) ──

/**
 * Write a category file (memory/{category}.md).
 * AI outputs the complete updated content after intelligent merge.
 * Creates the file if it doesn't exist.
 */
export async function writeCategoryFile(category: string, content: string): Promise<void> {
  const path = `memory/${category}.md`;
  await writeUserFile(path, content);
  console.log(`[memory] category updated: ${path} (${content.length} chars)`);
  syncToApi(path, content, 'category').catch((err) => {
    console.warn(`[memory] API sync for ${path} failed:`, err);
  });
}

/**
 * Read a category file. Returns empty string if not exists.
 */
export async function readCategoryFile(category: string): Promise<string> {
  try {
    return await readUserFile(`memory/${category}.md`);
  } catch {
    return '';
  }
}

/**
 * List all category names (filenames without .md extension).
 */
export async function listCategories(): Promise<string[]> {
  const entries = await listUserDir('memory');
  return entries
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

/**
 * Read all category files. Returns a map of category → content.
 */
export async function readAllCategories(): Promise<Map<string, string>> {
  const categories = await listCategories();
  const result = new Map<string, string>();
  for (const cat of categories) {
    const content = await readCategoryFile(cat);
    if (content) {
      result.set(cat, content);
    }
  }
  return result;
}

// ── API sync ──

async function syncToApi(filename: string, content: string, category: string): Promise<void> {
  const userId = requestContext.getStore()?.userId ?? config.userId;
  const resp = await fetch(`${config.apiServerUrl}/api/internal/memories/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': config.internalApiToken,
    },
    body: JSON.stringify({
      vi_user_id: userId,
      filename,
      content,
      category,
      source: 'nanoclaw',
    }),
  });
  if (!resp.ok) {
    console.warn(`[memory] API sync failed for ${filename} (${resp.status})`);
  }
}
