/**
 * Container runtime abstraction for VI Agent NanoClaw.
 * All runtime-specific logic lives here so swapping runtimes means changing one file.
 *
 * Adapted from reference nanoclaw container-runtime.ts for VI Agent context.
 */
import { execSync } from 'node:child_process';

/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'docker';

/** Default container image for agent execution. */
export const CONTAINER_IMAGE =
  process.env.AGENT_CONTAINER_IMAGE || 'nanoclaw-agent:latest';

/** Container timeout in ms (default 5 minutes). */
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);

/** Max concurrent containers (default 4). */
export const MAX_CONCURRENT_CONTAINERS = parseInt(
  process.env.MAX_CONCURRENT_CONTAINERS || '4',
  10,
);

/** Max output size from container stdout (default 10MB). */
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
);

/** Idle timeout — kill container after this long with no output (default 2 min). */
export const IDLE_TIMEOUT = parseInt(
  process.env.CONTAINER_IDLE_TIMEOUT || '120000',
  10,
);

/** Returns CLI args for a readonly bind mount. */
export function readonlyMountArgs(
  hostPath: string,
  containerPath: string,
): string[] {
  return ['-v', `${hostPath}:${containerPath}:ro`];
}

/** Returns the shell command to stop a container by name. */
export function stopContainer(name: string): string {
  return `${CONTAINER_RUNTIME_BIN} stop ${name}`;
}

/** Ensure the container runtime is running, starting it if needed. */
export function ensureContainerRuntimeRunning(): void {
  try {
    execSync(`${CONTAINER_RUNTIME_BIN} info`, {
      stdio: 'pipe',
      timeout: 10000,
    });
    console.log('[container-runtime] Docker runtime available');
  } catch (err) {
    console.error('[container-runtime] FATAL: Docker runtime not available');
    console.error(
      '[container-runtime] Ensure Docker socket is mounted: -v /var/run/docker.sock:/var/run/docker.sock',
    );
    throw new Error('Container runtime is required but failed to start');
  }
}

/** Kill orphaned NanoClaw agent containers from previous runs.
 *  Only targets containers spawned by the container-runner (prefix: vi-agent-test- or vi-agent-exec-).
 *  Never touches compose-managed containers (vi-agent-szj-*, vi-agent-xxl-*, etc.). */
export function cleanupOrphans(): void {
  try {
    // Only match agent execution containers, not compose service containers
    const output = execSync(
      `${CONTAINER_RUNTIME_BIN} ps -a --filter name=vi-agent-test- --filter name=vi-agent-exec- --format '{{.Names}}'`,
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
    );
    const orphans = output.trim().split('\n').filter(Boolean);
    for (const name of orphans) {
      try {
        execSync(`${CONTAINER_RUNTIME_BIN} rm -f ${name}`, { stdio: 'pipe' });
      } catch {
        /* already removed */
      }
    }
    if (orphans.length > 0) {
      console.log(
        `[container-runtime] cleaned up ${orphans.length} orphaned containers`,
      );
    }
  } catch {
    // No orphans or Docker not available
  }
}
