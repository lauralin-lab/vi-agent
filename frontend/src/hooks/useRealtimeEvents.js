import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SSE event types this hook listens for.
 *
 * V5 Card operations (op-based): create_card, stream_to_card, update_card,
 *   append_to_card, replace_card, finalize_card, remove_card, html_stream
 * Task lifecycle: exec_start, exec_progress, exec_result, exec_error
 * Legacy (backward compat): exec_html_stream, exec_text_stream, exec_module, exec_intermediate
 * Existing: session_update, memory_update
 * Intention: intention_update
 * Skill: skill_status
 */
const SSE_EVENT_TYPES = [
  // V5 Card Template Protocol operations
  'create_card',
  'stream_to_card',
  'update_card',
  'append_to_card',
  'replace_card',
  'finalize_card',
  'remove_card',
  'html_stream',
  // Task lifecycle
  'exec_start',
  'exec_progress',
  'exec_result',
  'exec_error',
  // Legacy (backward compat)
  'exec_html_stream',
  'exec_text_stream',
  'exec_module',
  'exec_intermediate',
  // Other
  'session_update',
  'memory_update',
  'intention_update',
  'skill_status',
];

/**
 * useRealtimeEvents — SSE hook for real-time events.
 *
 * Transport priority:
 *   1. LiveKit DataChannel (in-session, lowest latency) — handled by useAgentProtocol
 *   2. SSE /api/users/events (always-on, Redis-backed) — THIS HOOK
 *   3. HTTP REST polling (fallback) — handled by caller
 *
 * SSE is always active regardless of LiveKit state. LiveKit handles voice
 * transcripts/overlays; SSE handles NanoClaw card operations and results.
 *
 * Events handled (see SSE_EVENT_TYPES above):
 *   V5 Card Protocol: create_card, stream_to_card, update_card, etc.
 *   Task lifecycle: exec_start, exec_progress, exec_result, exec_error
 *   Other: session_update, memory_update, intention_update, skill_status
 *   Legacy (deprecated): exec_html_stream, exec_text_stream, exec_module, exec_intermediate
 *
 * @param {string} viUserId - The VI user ID for the SSE channel
 * @param {boolean} livekitConnected - Whether LiveKit DataChannel is active
 * @param {function} [onNanoClawEvent] - Callback for NanoClaw events (card ops, exec_*, intention_*)
 * @returns {{ events: Array, sseConnected: boolean }}
 */
export function useRealtimeEvents(viUserId, livekitConnected, onNanoClawEvent) {
  const [events, setEvents] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const eventSourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  // Stable ref for the callback to avoid effect re-runs
  const onNanoClawEventRef = useRef(onNanoClawEvent);
  useEffect(() => { onNanoClawEventRef.current = onNanoClawEvent; }, [onNanoClawEvent]);

  // Close existing EventSource
  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    queueMicrotask(() => setSseConnected(false));
  }, []);

  useEffect(() => {
    // SSE always stays active for NanoClaw events (exec_*, intention_*, skill_*).
    // LiveKit DataChannel handles transcripts/overlays; SSE handles NanoClaw results.
    if (!viUserId) {
      closeEventSource();
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || '';
    const url = `${apiUrl}/api/users/events?vi_user_id=${encodeURIComponent(viUserId)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      reconnectAttemptRef.current = 0;
      setSseConnected(true);
    };

    // V5 card operation event types (use 'op' field instead of 'type')
    const CARD_OPS = new Set([
      'create_card', 'stream_to_card', 'update_card', 'append_to_card',
      'replace_card', 'finalize_card', 'remove_card', 'html_stream',
    ]);

    // Generic handler factory for all event types
    const handleEvent = (eventType) => (e) => {
      try {
        const data = JSON.parse(e.data);
        // Card ops use 'op' field; lifecycle/legacy use 'type' field
        const event = CARD_OPS.has(eventType)
          ? { op: eventType, ...data, _ts: Date.now() }
          : { type: eventType, ...data, _ts: Date.now() };

        // Add to general events list
        setEvents(prev => [...prev.slice(-49), event]);

        // Route NanoClaw events to the dedicated callback
        if (CARD_OPS.has(eventType) || eventType.startsWith('exec_') || eventType === 'intention_update' || eventType === 'skill_status') {
          onNanoClawEventRef.current?.(event);
        }
      } catch (err) {
        console.error(`[redis][frontend] SSE parse error ${eventType}:`, err);
      }
    };

    // Register listeners for all event types
    for (const eventType of SSE_EVENT_TYPES) {
      es.addEventListener(eventType, handleEvent(eventType));
    }

    // Heartbeat — just confirms connection is alive, no action needed
    es.addEventListener('heartbeat', () => {
      // No-op, keeps connection alive
    });

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setSseConnected(false);
      // Auto-reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectAttemptRef.current++;
        setReconnectTrigger(prev => prev + 1);
      }, delay);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setSseConnected(false);
    };
  }, [viUserId, closeEventSource, reconnectTrigger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => closeEventSource();
  }, [closeEventSource]);

  return { events, sseConnected };
}
