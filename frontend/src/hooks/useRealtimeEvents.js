import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * All V4 SSE event types that this hook listens for.
 * Existing: session_update, memory_update
 * V4 NanoClaw execution: exec_start, exec_progress, exec_html_stream,
 *   exec_text_stream, exec_module, exec_intermediate, exec_result, exec_error
 * V4 intention: intention_update
 * V4 skill: skill_status
 */
const V4_EVENT_TYPES = [
  'session_update',
  'memory_update',
  'exec_start',
  'exec_progress',
  'exec_html_stream',
  'exec_text_stream',
  'exec_module',
  'exec_intermediate',
  'exec_result',
  'exec_error',
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
 * When LiveKit is connected, this hook does nothing (skips SSE).
 * When LiveKit disconnects, it opens an EventSource to the SSE endpoint.
 *
 * Events handled:
 *   V3 (existing):
 *   - session_update: { session_id, status, progress_message, result_summary }
 *   - memory_update: { filename, action, preview }
 *
 *   V4 (NanoClaw execution via vi:stream and vi:intent):
 *   - exec_start: { taskId, executor }
 *   - exec_progress: { taskId, step, total, message }
 *   - exec_html_stream: { taskId, chunk, done? }
 *   - exec_text_stream: { taskId, chunk, done? }
 *   - exec_module: { taskId, moduleType, data }
 *   - exec_intermediate: { taskId, step, label, data }
 *   - exec_result: { taskId, summary }
 *   - exec_error: { taskId, error, recoverable }
 *   - intention_update: { intentions: PredictedIntention[] }
 *   - skill_status: { slug, status, ... }
 *
 * @param {string} viUserId - The VI user ID for the SSE channel
 * @param {boolean} livekitConnected - Whether LiveKit DataChannel is active
 * @param {function} [onNanoClawEvent] - Optional callback for NanoClaw events (exec_*, intention_*, skill_*)
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
  onNanoClawEventRef.current = onNanoClawEvent;

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
    setSseConnected(false);
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

    // Generic handler factory for all event types
    const handleEvent = (eventType) => (e) => {
      try {
        const data = JSON.parse(e.data);
        const event = { type: eventType, ...data, _ts: Date.now() };

        // Add to general events list
        setEvents(prev => [...prev.slice(-49), event]);

        // Route NanoClaw events to the dedicated callback
        if (eventType.startsWith('exec_') || eventType === 'intention_update' || eventType === 'skill_status') {
          console.log(`[redis][frontend] SSE ${eventType}:`, data.taskId || data.slug || '');
          onNanoClawEventRef.current?.(event);
        }
      } catch (err) {
        console.error(`[redis][frontend] SSE parse error ${eventType}:`, err);
      }
    };

    // Register listeners for all V4 event types
    for (const eventType of V4_EVENT_TYPES) {
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
