/**
 * Container Runner for VI Agent NanoClaw
 *
 * Spawns Claude Code agent containers for skill execution.
 * Parses stdout for CARD_OP markers and OUTPUT markers.
 *
 * Adapted from reference nanoclaw container-runner.ts.
 *
 * Protocol:
 *   stdin  → JSON: { prompt, userId, sessionId, skillSlug, mediaUrls, ... }
 *   stdout → CARD_OP::{json}\n — card operations (create_card, stream_to_card, etc.)
 *            ---NANOCLAW_OUTPUT_START---\n{json}\n---NANOCLAW_OUTPUT_END---  — final result
 *   ipc    → /workspace/ipc/{messages,tasks,input}/ — filesystem-based IPC
 */
import { type ChildProcess, exec, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { ExecRequest, StreamEvent, CardOp } from '../channels/types.js';
import {
  CONTAINER_RUNTIME_BIN,
  CONTAINER_IMAGE,
  CONTAINER_TIMEOUT,
  CONTAINER_MAX_OUTPUT_SIZE,
  IDLE_TIMEOUT,
  readonlyMountArgs,
  stopContainer,
} from './container-runtime.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Marker protocol (must match agent-runner inside container)
// ---------------------------------------------------------------------------

/** Card operation marker prefix — each line starting with this is a CardOp JSON */
const CARD_OP_MARKER = 'CARD_OP::';

/** Final output markers (wraps the overall result) */
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerInput {
  prompt: string;
  userId: string;
  sessionId?: string;
  taskId: string;
  skillSlug?: string;
  mediaUrls?: string[];
  context?: Record<string, unknown>;
  /** Skill prompt content (from package SKILL.md) */
  skillPrompt?: string;
  /** Package manifest for the skill */
  packageId?: string;
  /** API keys passed via stdin (never on disk) */
  secrets?: Record<string, string>;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

// ---------------------------------------------------------------------------
// Volume mounts
// ---------------------------------------------------------------------------

function buildVolumeMounts(input: ContainerInput): VolumeMount[] {
  const mounts: VolumeMount[] = [];

  // 1. User data directory (memory, sessions) — writable
  const userDataDir = config.userDataDir;
  if (fs.existsSync(userDataDir)) {
    mounts.push({
      hostPath: userDataDir,
      containerPath: '/workspace/user-data',
      readonly: false,
    });
  }

  // 2. Shared skills directory — read-only
  const skillsDir = config.sharedSkillsDir;
  if (fs.existsSync(skillsDir)) {
    mounts.push({
      hostPath: skillsDir,
      containerPath: '/workspace/skills',
      readonly: true,
    });
  }

  // 3. Packages directory — read-only (templates, manifests)
  const packagesDir = config.packagesDir;
  if (fs.existsSync(packagesDir)) {
    mounts.push({
      hostPath: packagesDir,
      containerPath: '/workspace/packages',
      readonly: true,
    });
  }

  // 4. IPC directory — writable (per-task namespace)
  const ipcDir = path.join(config.userDataDir, 'ipc', input.taskId);
  fs.mkdirSync(path.join(ipcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(ipcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: ipcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // 5. Working directory for the agent — writable
  const workDir = path.join(config.userDataDir, 'workspace', input.taskId);
  fs.mkdirSync(workDir, { recursive: true });
  mounts.push({
    hostPath: workDir,
    containerPath: '/workspace/group',
    readonly: false,
  });

  return mounts;
}

function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Pass host timezone
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  args.push('-e', `TZ=${tz}`);

  // Run as current user for bind mount permissions
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push('--user', `${hostUid}:${hostGid}`);
    args.push('-e', 'HOME=/home/node');
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

function readSecrets(): Record<string, string> {
  const secrets: Record<string, string> = {};
  const keys = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN',
  ];
  for (const key of keys) {
    if (process.env[key]) {
      secrets[key] = process.env[key]!;
    }
  }
  return secrets;
}

// ---------------------------------------------------------------------------
// Container execution
// ---------------------------------------------------------------------------

export async function runContainerAgent(
  request: ExecRequest & { skillPrompt?: string; packageId?: string },
  onCardOp: (op: CardOp) => Promise<void>,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  // Convert local /uploads/ URLs to container-accessible paths
  // Local uploads are stored at {userDataDir}/uploads/ and mounted at /workspace/user-data/
  const resolvedMediaUrls = request.mediaUrls?.map((url) => {
    if (url.startsWith('/uploads/')) {
      return `/workspace/user-data${url}`;
    }
    return url;
  });

  const containerInput: ContainerInput = {
    prompt: request.prompt,
    userId: request.userId ?? config.userId,
    sessionId: request.sessionId,
    taskId: request.taskId,
    skillSlug: request.skillSlug,
    mediaUrls: resolvedMediaUrls,
    context: request.context,
    skillPrompt: request.skillPrompt,
    packageId: request.packageId,
    secrets: readSecrets(),
  };

  const mounts = buildVolumeMounts(containerInput);
  const safeName = containerInput.taskId.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `vi-agent-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  console.log(
    `[container-runner] spawning ${containerName} for task ${request.taskId} (${mounts.length} mounts)`,
  );

  return new Promise((resolve) => {
    const container = spawn(CONTAINER_RUNTIME_BIN, containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;

    // Pass input via stdin (secrets included, never on disk)
    container.stdin.write(JSON.stringify(containerInput));
    container.stdin.end();

    // Clear secrets from memory
    containerInput.secrets = undefined;

    // Streaming stdout parser
    let parseBuffer = '';
    let hadOutput = false;
    let outputChain = Promise.resolve();

    container.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();

      // Accumulate for logging (with size limit)
      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
        } else {
          stdout += chunk;
        }
      }

      // Parse for CARD_OP markers (line-based) and OUTPUT markers (block-based)
      parseBuffer += chunk;

      // 1. Extract complete OUTPUT blocks first (they span multiple lines)
      //    Must happen BEFORE line-splitting to avoid consuming marker lines.
      let startIdx: number;
      while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
        const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
        if (endIdx === -1) break; // Incomplete pair — wait for more data

        const jsonStr = parseBuffer
          .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
          .trim();
        // Remove the entire block from the buffer
        parseBuffer =
          parseBuffer.slice(0, startIdx) +
          parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

        try {
          const parsed: ContainerOutput = JSON.parse(jsonStr);
          hadOutput = true;
          resetTimeout();
          if (onOutput) {
            outputChain = outputChain.then(() => onOutput(parsed));
          }
        } catch (err) {
          console.warn(
            `[container-runner] failed to parse OUTPUT marker: ${jsonStr.slice(0, 200)}`,
          );
        }
      }

      // 2. Process complete lines for CARD_OP markers
      const lines = parseBuffer.split('\n');
      // Keep incomplete last line in buffer
      parseBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith(CARD_OP_MARKER)) {
          const jsonStr = trimmed.slice(CARD_OP_MARKER.length);
          try {
            const op: CardOp = JSON.parse(jsonStr);
            hadOutput = true;
            resetTimeout();
            outputChain = outputChain.then(() => onCardOp(op));
          } catch (err) {
            console.warn(
              `[container-runner] failed to parse CARD_OP: ${jsonStr.slice(0, 200)}`,
            );
          }
        }
      }
    });

    container.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      // Log stderr lines at debug level
      for (const line of chunk.trim().split('\n')) {
        if (line) console.log(`[container:${safeName}] ${line}`);
      }
      stderr += chunk;
    });

    // Timeout management
    let timedOut = false;
    const timeoutMs = Math.max(CONTAINER_TIMEOUT, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      console.error(
        `[container-runner] timeout for ${containerName}, stopping`,
      );
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          container.kill('SIGKILL');
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        if (hadOutput) {
          console.log(
            `[container-runner] ${containerName} timed out after output (idle cleanup, ${duration}ms)`,
          );
          outputChain.then(() =>
            resolve({ status: 'success', result: null }),
          );
          return;
        }

        console.error(
          `[container-runner] ${containerName} timed out with no output (${duration}ms)`,
        );
        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${CONTAINER_TIMEOUT}ms`,
        });
        return;
      }

      if (code !== 0) {
        console.error(
          `[container-runner] ${containerName} exited with code ${code} (${duration}ms)`,
        );
        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      // Success — wait for output chain to settle
      outputChain.then(() => {
        console.log(
          `[container-runner] ${containerName} completed (${duration}ms)`,
        );
        resolve({ status: 'success', result: null });
      });
    });

    container.on('error', (err) => {
      clearTimeout(timeout);
      console.error(
        `[container-runner] spawn error for ${containerName}:`,
        err,
      );
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}
