import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useRealtimeEvents — SSE hook for real-time events when LiveKit is not connected.
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
 *   - session_update: { session_id, status, progress_message, result_summary }
 *   - memory_update: { filename, action, preview }
 *
 * @param {string} viUserId - The VI user ID for the SSE channel
 * @param {boolean} livekitConnected - Whether LiveKit DataChannel is active
 * @returns {{ events: Array, sseConnected: boolean }}
 */
export function useRealtimeEvents(viUserId, livekitConnected) {
  const [events, setEvents] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const eventSourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);

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
    // If LiveKit is connected, skip SSE entirely
    if (livekitConnected || !viUserId) {
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

    es.addEventListener('session_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-49), { type: 'session_update', ...data, _ts: Date.now() }]);
      } catch (err) {
        console.error('[SSE] Failed to parse session_update:', err);
      }
    });

    es.addEventListener('memory_update', (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-49), { type: 'memory_update', ...data, _ts: Date.now() }]);
      } catch (err) {
        console.error('[SSE] Failed to parse memory_update:', err);
      }
    });

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
  }, [viUserId, livekitConnected, closeEventSource, reconnectTrigger]);

  // Cleanup on unmount
  useEffect(() => {
    return () => closeEventSource();
  }, [closeEventSource]);

  return { events, sseConnected };
}
