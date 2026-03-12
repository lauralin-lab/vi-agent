import type {
  CardOp,
  CardEventLogEntry,
  CardFinalState,
  SessionCardState,
} from '../channels/types.js';

// ---------------------------------------------------------------------------
// In-memory card event store, keyed by sessionId
// ---------------------------------------------------------------------------

/** Event log for each session: ordered list of card operations */
const eventLogs = new Map<string, CardEventLogEntry[]>();

/** Final state of each card within each session */
const finalStates = new Map<string, Map<string, CardFinalState>>();

/** Media URLs referenced in each session */
const sessionMedia = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a card operation into the session event log and update final state.
 */
export function recordCardEvent(sessionId: string, cardOp: CardOp): void {
  // --- Append to event log ---
  if (!eventLogs.has(sessionId)) {
    eventLogs.set(sessionId, []);
  }
  const log = eventLogs.get(sessionId)!;
  const entry: CardEventLogEntry = {
    index: log.length,
    op: cardOp,
    timestamp: cardOp.timestamp ?? new Date().toISOString(),
  };
  log.push(entry);

  // --- Update final state ---
  if (!finalStates.has(sessionId)) {
    finalStates.set(sessionId, new Map());
  }
  const cards = finalStates.get(sessionId)!;

  switch (cardOp.op) {
    case 'create_card': {
      cards.set(cardOp.cardId, {
        cardId: cardOp.cardId,
        template: cardOp.template,
        data: { ...cardOp.data },
        status: 'streaming',
      });
      break;
    }
    case 'stream_to_card': {
      const card = cards.get(cardOp.cardId);
      if (card) {
        // Accumulate streamed chunks into the slot
        const prev = (card.data[cardOp.slot] as string) ?? '';
        card.data[cardOp.slot] = prev + cardOp.chunk;
      }
      break;
    }
    case 'update_card': {
      const card = cards.get(cardOp.cardId);
      if (card) {
        for (const [key, value] of Object.entries(cardOp.updates)) {
          setNestedValue(card.data, key, value);
        }
      }
      break;
    }
    case 'append_to_card': {
      const card = cards.get(cardOp.cardId);
      if (card) {
        const existing = card.data[cardOp.slot];
        if (Array.isArray(existing)) {
          existing.push(...cardOp.items);
        } else {
          card.data[cardOp.slot] = [...cardOp.items];
        }
      }
      break;
    }
    case 'replace_card': {
      cards.set(cardOp.cardId, {
        cardId: cardOp.cardId,
        template: cardOp.template,
        data: { ...cardOp.data },
        status: 'streaming',
      });
      break;
    }
    case 'finalize_card': {
      const card = cards.get(cardOp.cardId);
      if (card) {
        card.status = 'finalized';
      }
      break;
    }
    case 'remove_card': {
      const card = cards.get(cardOp.cardId);
      if (card) {
        card.status = 'removed';
      }
      break;
    }
    case 'html_stream': {
      const card = cards.get(cardOp.cardId);
      if (card) {
        const prev = (card.data['html'] as string) ?? '';
        card.data['html'] = prev + cardOp.chunk;
        if (cardOp.done) {
          card.status = 'finalized';
        }
      }
      break;
    }
  }
}

/**
 * Record a media URL associated with a session.
 */
export function recordSessionMedia(sessionId: string, mediaUrl: string): void {
  if (!sessionMedia.has(sessionId)) {
    sessionMedia.set(sessionId, new Set());
  }
  sessionMedia.get(sessionId)!.add(mediaUrl);
}

/**
 * Return the complete session card state for persistence or API response.
 */
export function getSessionCardState(sessionId: string): SessionCardState {
  const cardEvents = eventLogs.get(sessionId) ?? [];
  const cardsMap = finalStates.get(sessionId);
  const media = sessionMedia.get(sessionId);

  const finalState: Record<string, CardFinalState> = {};
  if (cardsMap) {
    for (const [cardId, state] of cardsMap) {
      finalState[cardId] = state;
    }
  }

  return {
    sessionId,
    cardEvents,
    finalState,
    media: media ? Array.from(media) : [],
  };
}

/**
 * Get stats for monitoring.
 */
export function getStoreStats(): {
  sessionCount: number;
  totalEvents: number;
  totalCards: number;
} {
  let totalEvents = 0;
  let totalCards = 0;
  for (const log of eventLogs.values()) {
    totalEvents += log.length;
  }
  for (const cards of finalStates.values()) {
    totalCards += cards.size;
  }
  return {
    sessionCount: eventLogs.size,
    totalEvents,
    totalCards,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Set a value at a dot-notation path in an object.
 * e.g. setNestedValue(obj, "items.2.checked", true)
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] === undefined || current[key] === null) {
      // Auto-create intermediate objects or arrays
      const nextKey = parts[i + 1];
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = parts[parts.length - 1];
  current[lastKey] = value;
}
