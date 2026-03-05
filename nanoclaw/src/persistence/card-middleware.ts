import type { StreamEvent, CardOp } from '../channels/types.js';
import { recordCardEvent, recordSessionMedia } from './card-store.js';

// ---------------------------------------------------------------------------
// Card Persistence Middleware
//
// Intercepts publishStreamEvent calls to record card operations into the
// in-memory card store. This gives us:
//   1. An event log for session replay
//   2. Final state tracking for each card
//   3. Media URL collection for persistence
//
// Usage:
//   Wrap the original publishStreamEvent before calling it:
//     const intercepted = cardMiddleware(sessionId, event);
//     await originalPublish(intercepted);
//
//   Or use the convenience wrapper:
//     const wrappedPublish = wrapPublisher(sessionId, originalPublish);
//     await wrappedPublish(event);
// ---------------------------------------------------------------------------

/** Card operation type guards */
const CARD_OPS = new Set([
  'create_card',
  'stream_to_card',
  'update_card',
  'append_to_card',
  'replace_card',
  'finalize_card',
  'remove_card',
  'html_stream',
]);

function isCardOp(event: StreamEvent): event is CardOp {
  return 'op' in event && CARD_OPS.has((event as CardOp).op);
}

/**
 * Intercept a stream event, recording card operations to the card store.
 * Returns the event unchanged (pass-through).
 */
export function cardMiddleware(sessionId: string, event: StreamEvent): StreamEvent {
  if (isCardOp(event)) {
    recordCardEvent(sessionId, event);

    // Track media URLs from create_card and replace_card data
    if (event.op === 'create_card' || event.op === 'replace_card') {
      extractMediaUrls(sessionId, event.data);
    }
  }

  return event;
}

/**
 * Create a wrapped publisher that automatically records card events.
 *
 * @param sessionId - The session to record events for
 * @param publisher - The original publish function (publishStreamEvent)
 * @returns A wrapped function with the same signature
 */
export function wrapPublisher(
  sessionId: string,
  publisher: (event: StreamEvent) => Promise<void>,
): (event: StreamEvent) => Promise<void> {
  return async (event: StreamEvent): Promise<void> => {
    // Record to card store (synchronous, in-memory)
    cardMiddleware(sessionId, event);
    // Forward to original publisher
    await publisher(event);
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract media URLs from card data for session-level tracking.
 * Looks for common media-related fields.
 */
function extractMediaUrls(
  sessionId: string,
  data: Record<string, unknown>,
): void {
  const mediaKeys = [
    'photo_url',
    'image_url',
    'video_url',
    'media_url',
    'thumbnail',
    'src',
    'url',
    'frameUrl',
  ];

  for (const key of mediaKeys) {
    const value = data[key];
    if (typeof value === 'string' && isUrl(value)) {
      recordSessionMedia(sessionId, value);
    }
  }

  // Also scan arrays (e.g. image_gallery items)
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          extractMediaUrls(sessionId, item as Record<string, unknown>);
        }
      }
    }
  }
}

function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:');
}
