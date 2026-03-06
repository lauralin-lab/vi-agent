/**
 * Cloud sync module — uses API Server as proxy to GCS.
 * On startup: pull files from remote to local /workspace/.
 * After task completion: push changed files back.
 * Tracks sync state in /workspace/.cache/sync-state.json.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { config } from '../config.js';

/** Build API URL with vi_user_id query param for internal auth */
function apiUrl(path: string, userId: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${config.apiServerUrl}${path}${sep}vi_user_id=${encodeURIComponent(userId)}`;
}

interface SyncState {
  files: Record<string, { hash: string; ts: number }>;
}

const SYNC_STATE_PATH = join(config.userDataDir, '.cache', 'sync-state.json');

async function loadSyncState(): Promise<SyncState> {
  try {
    const raw = await readFile(SYNC_STATE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { files: {} };
  }
}

async function saveSyncState(state: SyncState): Promise<void> {
  await mkdir(dirname(SYNC_STATE_PATH), { recursive: true });
  await writeFile(SYNC_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function fileHash(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function apiHeaders(): Record<string, string> {
  return { 'X-Internal-Token': config.internalApiToken };
}

/**
 * Sync files from API Server (GCS proxy) to local workspace on startup.
 */
export async function syncFromCloud(uid: string): Promise<void> {
  console.log(`[cloud-sync] syncing from remote for user ${uid}`);

  try {
    // List remote files
    const listRes = await fetch(
      apiUrl('/api/fs/?prefix=', uid),
      { headers: apiHeaders() },
    );
    if (!listRes.ok) {
      console.warn(`[cloud-sync] failed to list remote files: ${listRes.status}`);
      return;
    }

    const { entries } = (await listRes.json()) as {
      entries: Array<{ name: string; type: string }>;
    };

    const state = await loadSyncState();
    let downloaded = 0;

    for (const entry of entries) {
      if (entry.type === 'directory') continue;

      try {
        const fileRes = await fetch(
          apiUrl(`/api/fs/${entry.name}`, uid),
          { headers: apiHeaders() },
        );
        if (!fileRes.ok) continue;

        const content = Buffer.from(await fileRes.arrayBuffer());
        const hash = fileHash(content);

        // Skip if local file is already up-to-date
        if (state.files[entry.name]?.hash === hash) continue;

        const localPath = join(config.userDataDir, entry.name);
        await mkdir(dirname(localPath), { recursive: true });
        await writeFile(localPath, content);

        state.files[entry.name] = { hash, ts: Date.now() };
        downloaded++;
      } catch (err) {
        console.warn(`[cloud-sync] failed to download ${entry.name}:`, err);
      }
    }

    await saveSyncState(state);
    console.log(`[cloud-sync] downloaded ${downloaded} files`);
  } catch (err) {
    console.error('[cloud-sync] syncFromCloud failed:', err);
  }
}

/**
 * Sync changed local files back to API Server (GCS proxy) after task completion.
 */
export async function syncToCloud(files: string[], userId: string): Promise<void> {
  if (files.length === 0) return;

  console.log(`[cloud-sync] uploading ${files.length} files for user ${userId}`);
  const state = await loadSyncState();
  let uploaded = 0;

  for (const relativePath of files) {
    try {
      const localPath = join(config.userDataDir, relativePath);
      const content = await readFile(localPath);
      const hash = fileHash(content);

      // Skip if unchanged
      if (state.files[relativePath]?.hash === hash) continue;

      const res = await fetch(
        apiUrl(`/api/fs/${relativePath}`, userId),
        {
          method: 'PUT',
          headers: {
            ...apiHeaders(),
            'Content-Type': 'application/octet-stream',
          },
          body: content,
        },
      );

      if (!res.ok) {
        console.warn(`[cloud-sync] failed to upload ${relativePath}: ${res.status}`);
        continue;
      }

      state.files[relativePath] = { hash, ts: Date.now() };
      uploaded++;
    } catch (err) {
      console.warn(`[cloud-sync] failed to upload ${relativePath}:`, err);
    }
  }

  await saveSyncState(state);
  console.log(`[cloud-sync] uploaded ${uploaded} files`);
}
