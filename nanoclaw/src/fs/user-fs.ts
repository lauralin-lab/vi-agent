import { readFile, writeFile, readdir, mkdir, rm, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { config } from '../config.js';

/**
 * User filesystem manager.
 * Provides read/write access to the user's workspace directory.
 * In Docker: /workspace maps to /data/users/{uid}/
 * In dev: ./data/dev/user/
 */

function resolvePath(relativePath: string): string {
  // Prevent directory traversal
  const resolved = join(config.userDataDir, relativePath);
  if (!resolved.startsWith(config.userDataDir)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

export async function readUserFile(relativePath: string): Promise<string> {
  const fullPath = resolvePath(relativePath);
  return readFile(fullPath, 'utf-8');
}

export async function writeUserFile(
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = resolvePath(relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf-8');
}

export async function listUserDir(relativePath: string): Promise<string[]> {
  const fullPath = resolvePath(relativePath);
  try {
    const entries = await readdir(fullPath, { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? e.name + '/' : e.name));
  } catch {
    return [];
  }
}

export async function deleteUserFile(relativePath: string): Promise<void> {
  const fullPath = resolvePath(relativePath);
  await rm(fullPath, { recursive: true, force: true });
}

export async function userFileExists(relativePath: string): Promise<boolean> {
  try {
    await stat(resolvePath(relativePath));
    return true;
  } catch {
    return false;
  }
}
