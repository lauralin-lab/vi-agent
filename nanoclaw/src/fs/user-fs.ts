import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { config } from '../config.js';

/**
 * Per-User Data Volume Filesystem (V5)
 *
 * Each user's data lives under: /users/{uid}/
 * In Docker: USER_DATA_DIR maps to /workspace (which is /data/users/{uid}/)
 * In dev: ./data/dev/user/
 */

// ---------------------------------------------------------------------------
// Path resolution with traversal guard
// ---------------------------------------------------------------------------

function resolvePath(relativePath: string): string {
  const resolved = join(config.userDataDir, relativePath);
  if (!resolved.startsWith(config.userDataDir)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Core filesystem operations
// ---------------------------------------------------------------------------

export async function readUserFile(relativePath: string): Promise<string> {
  return readFile(resolvePath(relativePath), 'utf-8');
}

export async function writeUserFile(relativePath: string, content: string): Promise<void> {
  const fullPath = resolvePath(relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function listUserDir(relativePath: string): Promise<string[]> {
  try {
    const entries = await readdir(resolvePath(relativePath), { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? e.name + '/' : e.name));
  } catch {
    return [];
  }
}
