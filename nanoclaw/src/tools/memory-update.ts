import { writeUserFile, readUserFile } from '../fs/user-fs.js';

/**
 * Update user memory files in /workspace/memory/.
 * Called by skills when they detect new user preferences or knowledge.
 */
export async function updateMemory(
  category: 'identity' | 'semantic' | 'episodic',
  filename: string,
  content: string,
): Promise<void> {
  const path = `memory/${category}/${filename}`;
  await writeUserFile(path, content);
  console.log(`[memory-update] updated ${path}`);
}

/**
 * Append to an existing memory file (for episodic logs).
 */
export async function appendMemory(
  category: 'identity' | 'semantic' | 'episodic',
  filename: string,
  content: string,
): Promise<void> {
  const path = `memory/${category}/${filename}`;
  let existing = '';
  try {
    existing = await readUserFile(path);
  } catch {
    // file doesn't exist yet
  }
  await writeUserFile(path, existing + '\n' + content);
  console.log(`[memory-update] appended to ${path}`);
}
