/**
 * Media processing utilities for photo/video analysis.
 * Uses Claude Vision for image analysis.
 * Video keyframe extraction via ffmpeg.
 */

import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../config.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/**
 * Analyze an image using Claude Vision.
 * Returns a text description of the image.
 */
export async function analyzeImage(
  imageUrl: string,
  prompt: string = 'Describe this image in detail.',
): Promise<string> {
  const response = await getClient().messages.create({
    model: config.executorModel,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  return response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('');
}

/** Check if ffmpeg is available */
async function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('ffmpeg -version', { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Extract keyframes from a video URL using ffmpeg.
 * Downloads the video to a temp file, extracts frames at 0.5 fps,
 * and returns an array of frame file paths.
 * Gracefully degrades if ffmpeg is not available.
 */
export async function extractVideoKeyframes(
  videoUrl: string,
): Promise<string[]> {
  if (!(await ffmpegAvailable())) {
    console.warn('[media-processor] ffmpeg not available, skipping keyframe extraction');
    return [];
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'nanoclaw-frames-'));

  try {
    // Download video to temp file
    const videoPath = join(tempDir, 'input.mp4');
    const videoRes = await fetch(videoUrl, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!videoRes.ok) {
      console.warn(`[media-processor] failed to download video: ${videoRes.status}`);
      return [];
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await writeFile(videoPath, videoBuffer);

    // Extract keyframes at 0.5 fps (1 frame every 2 seconds)
    const framePattern = join(tempDir, 'frame_%03d.jpg');
    await new Promise<void>((resolve, reject) => {
      exec(
        `ffmpeg -i ${JSON.stringify(videoPath)} -vf "fps=0.5" -q:v 2 ${JSON.stringify(framePattern)}`,
        { timeout: 120_000 },
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    // Collect frame paths
    const entries = await readdir(tempDir);
    const framePaths = entries
      .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort()
      .map((f) => join(tempDir, f));

    console.log(`[media-processor] extracted ${framePaths.length} keyframes`);
    return framePaths;
  } catch (err) {
    console.error('[media-processor] keyframe extraction failed:', err);
    return [];
  }
}

/**
 * Clean up temporary frame files after processing.
 */
export async function cleanupFrames(framePaths: string[]): Promise<void> {
  if (framePaths.length === 0) return;
  // All frames are in the same temp dir
  const tempDir = join(framePaths[0], '..');
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}
