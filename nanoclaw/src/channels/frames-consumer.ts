import { getSubscriber } from '../redis-client.js';
import { channels, type KeyframeEvent } from './types.js';
import { config } from '../config.js';

/** Latest keyframe received from the Realtime Agent */
let latestFrame: KeyframeEvent | null = null;

/** Get the most recently received keyframe */
export function getLatestFrame(): KeyframeEvent | null {
  return latestFrame;
}

/**
 * Subscribe to vi:frames:{uid} for keyframe events from the Realtime Agent.
 * Stores only the latest frame in memory.
 */
export async function startFramesConsumer(): Promise<void> {
  const sub = getSubscriber();
  const channel = channels.frames(config.userId);

  sub.on('message', (ch: string, message: string) => {
    if (ch !== channel) return;

    try {
      latestFrame = JSON.parse(message) as KeyframeEvent;
      console.log(`[redis][nanoclaw] Frame received: scene=${latestFrame.sceneHash}, change=${latestFrame.hasChange}`);
    } catch (err) {
      console.error('[redis][nanoclaw] Failed to parse keyframe:', err);
    }
  });

  await sub.subscribe(channel);
  console.log(`[redis][nanoclaw] Frames consumer listening on ${channel}`);
}
