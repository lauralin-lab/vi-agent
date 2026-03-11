/**
 * Container Manager — Per-user persistent container lifecycle.
 *
 * Manages one container per user:
 * - On-demand start (first task triggers container creation)
 * - Subsequent tasks route to existing container via filesystem IPC
 * - 5-minute idle timeout auto-stops container
 * - Claude session state persists on volume across container restarts
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONTAINER_RUNTIME_BIN, CONTAINER_IMAGE, MAX_CONCURRENT_CONTAINERS } from './container-runtime.js';
import { config } from '../config.js';

/** Default idle timeout: 5 minutes */
const IDLE_TIMEOUT_MS = parseInt(process.env.CONTAINER_IDLE_TIMEOUT_PERSISTENT || '300000', 10);

interface ContainerState {
  containerName: string;
  userId: string;
  startedAt: number;
  idleTimer: ReturnType<typeof setTimeout>;
  activeTasks: number;
}

// ---------------------------------------------------------------------------
// Volume mount helpers (copied from container-runner.ts to avoid circular deps)
// ---------------------------------------------------------------------------

function toHostPath(containerPath: string): string {
  if (config.hostWorkspaceDir && containerPath.startsWith(config.userDataDir)) {
    return containerPath.replace(config.userDataDir, config.hostWorkspaceDir);
  }
  if (config.hostProjectDir) {
    if (containerPath === config.packagesDir || containerPath.startsWith(config.packagesDir + '/')) {
      return containerPath.replace(config.packagesDir, path.join(config.hostProjectDir, 'packages'));
    }
    if (containerPath === config.sharedSkillsDir || containerPath.startsWith(config.sharedSkillsDir + '/')) {
      return containerPath.replace(config.sharedSkillsDir, path.join(config.hostProjectDir, 'nanoclaw/data/shared/skills'));
    }
  }
  return containerPath;
}

// ---------------------------------------------------------------------------
// Container Manager
// ---------------------------------------------------------------------------

class ContainerManager {
  private containers = new Map<string, ContainerState>();
  private shuttingDown = false;

  /**
   * Get or start a persistent container for the given user.
   * Returns the container name.
   */
  async getOrStartContainer(userId: string): Promise<string> {
    if (this.shuttingDown) {
      throw new Error('Container manager is shutting down');
    }

    // Check if we have a tracked container
    const existing = this.containers.get(userId);
    if (existing) {
      // Verify it's still running
      if (this.isContainerRunning(existing.containerName)) {
        this.resetIdleTimer(userId);
        return existing.containerName;
      }
      // Container died — clean up tracking and start a new one
      console.log(`[container-manager] container ${existing.containerName} for ${userId} is no longer running, restarting`);
      clearTimeout(existing.idleTimer);
      this.containers.delete(userId);
    }

    // Check concurrency limit
    if (this.containers.size >= MAX_CONCURRENT_CONTAINERS) {
      throw new Error(`At capacity: ${this.containers.size}/${MAX_CONCURRENT_CONTAINERS} containers running`);
    }

    // Start new persistent container
    const containerName = `vi-agent-${this.sanitizeUserId(userId)}`;

    // Remove any stale container with the same name
    try {
      execSync(`${CONTAINER_RUNTIME_BIN} rm -f ${containerName}`, { stdio: 'pipe' });
    } catch { /* doesn't exist, fine */ }

    // Ensure IPC directories exist
    const ipcDir = path.join(config.userDataDir, 'ipc', userId);
    const tasksDir = path.join(ipcDir, 'tasks');
    const resultsDir = path.join(ipcDir, 'results');
    const cardopsDir = path.join(ipcDir, 'cardops');
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(cardopsDir, { recursive: true });

    // Ensure shared workspace exists (per-user, not per-task)
    const workDir = path.join(config.userDataDir, 'workspace', userId);
    fs.mkdirSync(workDir, { recursive: true });
    fs.chmodSync(workDir, 0o777);

    // Ensure Claude state directory exists
    const claudeStateDir = path.join(config.userDataDir, 'claude-state', userId);
    fs.mkdirSync(claudeStateDir, { recursive: true });
    fs.chmodSync(claudeStateDir, 0o777);

    // Build docker run command
    const args = this.buildDockerArgs(containerName, userId, ipcDir, workDir, claudeStateDir);
    const cmd = `${CONTAINER_RUNTIME_BIN} ${args.join(' ')}`;
    console.log(`[container-manager] starting persistent container for ${userId}: ${containerName}`);

    try {
      execSync(cmd, { stdio: 'pipe', timeout: 30000 });
    } catch (err) {
      throw new Error(`Failed to start container ${containerName}: ${err}`);
    }

    // Track the container
    const state: ContainerState = {
      containerName,
      userId,
      startedAt: Date.now(),
      idleTimer: setTimeout(() => this.onIdleTimeout(userId), IDLE_TIMEOUT_MS),
      activeTasks: 0,
    };
    this.containers.set(userId, state);

    console.log(`[container-manager] container ${containerName} started for ${userId} (${this.containers.size}/${MAX_CONCURRENT_CONTAINERS})`);
    return containerName;
  }

  /**
   * Reset the idle timer for a user (called on each task dispatch).
   */
  resetIdleTimer(userId: string): void {
    const state = this.containers.get(userId);
    if (state) {
      clearTimeout(state.idleTimer);
      // Don't start idle timer if tasks are active — it will start when last task finishes
      if (state.activeTasks <= 0) {
        state.idleTimer = setTimeout(() => this.onIdleTimeout(userId), IDLE_TIMEOUT_MS);
      }
    }
  }

  /**
   * Mark a task as active for a user. Pauses idle timeout while tasks are running.
   */
  markTaskActive(userId: string): void {
    const state = this.containers.get(userId);
    if (state) {
      state.activeTasks++;
      clearTimeout(state.idleTimer);
    }
  }

  /**
   * Mark a task as done for a user. Restarts idle timeout when no tasks remain.
   */
  markTaskDone(userId: string): void {
    const state = this.containers.get(userId);
    if (state) {
      state.activeTasks = Math.max(0, state.activeTasks - 1);
      if (state.activeTasks === 0) {
        clearTimeout(state.idleTimer);
        state.idleTimer = setTimeout(() => this.onIdleTimeout(userId), IDLE_TIMEOUT_MS);
      }
    }
  }

  /**
   * Stop a specific user's container.
   */
  async stopContainer(userId: string): Promise<void> {
    const state = this.containers.get(userId);
    if (!state) return;

    clearTimeout(state.idleTimer);
    this.containers.delete(userId);

    try {
      execSync(`${CONTAINER_RUNTIME_BIN} stop ${state.containerName}`, {
        stdio: 'pipe',
        timeout: 15000,
      });
      console.log(`[container-manager] stopped container ${state.containerName} for ${userId}`);
    } catch (err) {
      console.warn(`[container-manager] failed to stop ${state.containerName}: ${err}`);
      // Force remove
      try {
        execSync(`${CONTAINER_RUNTIME_BIN} rm -f ${state.containerName}`, { stdio: 'pipe' });
      } catch { /* already gone */ }
    }
  }

  /**
   * Stop all managed containers (shutdown hook).
   */
  async stopAll(): Promise<void> {
    this.shuttingDown = true;
    const promises = [...this.containers.keys()].map((uid) => this.stopContainer(uid));
    await Promise.allSettled(promises);
    console.log(`[container-manager] all containers stopped`);
  }

  /**
   * Get the IPC tasks directory for a user.
   */
  getIpcTasksDir(userId: string): string {
    return path.join(config.userDataDir, 'ipc', userId, 'tasks');
  }

  /**
   * Get the IPC results directory for a user.
   */
  getIpcResultsDir(userId: string): string {
    return path.join(config.userDataDir, 'ipc', userId, 'results');
  }

  /**
   * Get status for health endpoint.
   */
  getStatus(): {
    activeContainers: number;
    maxConcurrent: number;
    users: Record<string, { containerName: string; uptime: number }>;
  } {
    const users: Record<string, { containerName: string; uptime: number }> = {};
    for (const [uid, state] of this.containers) {
      users[uid] = {
        containerName: state.containerName,
        uptime: Date.now() - state.startedAt,
      };
    }
    return {
      activeContainers: this.containers.size,
      maxConcurrent: MAX_CONCURRENT_CONTAINERS,
      users,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private isContainerRunning(name: string): boolean {
    try {
      const output = execSync(
        `${CONTAINER_RUNTIME_BIN} inspect --format '{{.State.Running}}' ${name}`,
        { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
      );
      return output.trim() === 'true';
    } catch {
      return false;
    }
  }

  private onIdleTimeout(userId: string): void {
    const state = this.containers.get(userId);
    if (state && state.activeTasks > 0) {
      // Tasks still running — reschedule idle check
      console.log(`[container-manager] idle timeout deferred for ${userId} (${state.activeTasks} active tasks)`);
      state.idleTimer = setTimeout(() => this.onIdleTimeout(userId), IDLE_TIMEOUT_MS);
      return;
    }
    console.log(`[container-manager] idle timeout for ${userId}, stopping container`);
    this.stopContainer(userId).catch((err) =>
      console.error(`[container-manager] error stopping idle container for ${userId}:`, err),
    );
  }

  private sanitizeUserId(userId: string): string {
    return userId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 50);
  }

  private buildDockerArgs(
    containerName: string,
    userId: string,
    ipcDir: string,
    workDir: string,
    claudeStateDir: string,
  ): string[] {
    const args: string[] = [
      'run', '-d',  // detached (persistent)
      '--name', containerName,
      '--label', 'vi-agent-spawned=true',
    ];

    // Timezone
    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    args.push('-e', `TZ=${tz}`);

    // Run as root for bind-mount compatibility
    args.push('--user', 'root');
    args.push('-e', 'HOME=/root');

    // Agent mode: persistent task loop
    args.push('-e', 'AGENT_MODE=persistent');

    // Claude Code CLI requires TOS acceptance — non-interactive mode
    args.push('-e', 'CLAUDE_CODE_ACCEPT_TOS=yes');

    // Pass secrets as env vars (persistent container, no stdin for secrets)
    const secretKeys = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
    ];
    for (const key of secretKeys) {
      if (process.env[key]) {
        args.push('-e', `${key}=${process.env[key]}`);
      }
    }

    // API server access
    if (config.apiServerUrl) {
      args.push('-e', `API_SERVER_URL=${config.apiServerUrl}`);
    }
    if (config.internalApiToken) {
      args.push('-e', `INTERNAL_API_TOKEN=${config.internalApiToken}`);
    }

    // Volume mounts
    // 1. User data (memory, sessions, uploads) — writable
    const userDataHost = toHostPath(config.userDataDir);
    args.push('-v', `${userDataHost}:/workspace/user-data`);

    // 2. Shared skills — read-only
    const skillsHost = toHostPath(config.sharedSkillsDir);
    if (fs.existsSync(config.sharedSkillsDir)) {
      args.push('-v', `${skillsHost}:/workspace/skills:ro`);
    }

    // 3. Packages — read-only
    const packagesHost = toHostPath(config.packagesDir);
    if (fs.existsSync(config.packagesDir)) {
      args.push('-v', `${packagesHost}:/workspace/packages:ro`);
    }

    // 4. IPC directory (per-user) — writable
    const ipcHost = toHostPath(ipcDir);
    args.push('-v', `${ipcHost}:/workspace/ipc`);

    // 5. Shared workspace (per-user, NOT per-task) — writable
    const workHost = toHostPath(workDir);
    args.push('-v', `${workHost}:/workspace/group`);

    // 6. Claude CLI state (conversation history) — writable, persistent
    const claudeHost = toHostPath(claudeStateDir);
    args.push('-v', `${claudeHost}:/root/.claude`);

    // Join the Docker network so container can reach Redis and other services
    const network = process.env.CONTAINER_NETWORK || '';
    if (network) {
      args.push('--network', network);
    }

    // Use the Dockerfile's entrypoint — it checks AGENT_MODE env var
    args.push(CONTAINER_IMAGE);

    return args;
  }
}

// Singleton
let manager: ContainerManager | null = null;

export function getContainerManager(): ContainerManager {
  if (!manager) {
    manager = new ContainerManager();
  }
  return manager;
}
