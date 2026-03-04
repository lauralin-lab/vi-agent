import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useNanoClawResults — processes NanoClaw execution results from SSE events.
 *
 * This hook manages:
 *   - activeStreams: keyed by taskId, tracks in-progress executions
 *   - intentions: predicted intention cards from NanoClaw context compiler
 *   - completedResults: finished execution results
 *
 * SSE event types handled:
 *   exec_start, exec_progress, exec_html_stream, exec_text_stream,
 *   exec_module, exec_intermediate, exec_result, exec_error,
 *   intention_update, skill_status
 *
 * @returns {{ activeStreams, intentions, completedResults, processEvent, clearStream }}
 */
export function useNanoClawResults() {
  const [activeStreams, setActiveStreams] = useState({});
  const [intentions, setIntentions] = useState([]);
  const [completedResults, setCompletedResults] = useState([]);

  // Accumulator refs for streaming content (avoids re-renders on every chunk)
  const htmlAccRef = useRef({});   // taskId → accumulated HTML string
  const textAccRef = useRef({});   // taskId → accumulated text string

  // Timeout refs for orphaned stream cleanup (5-minute TTL)
  const streamTimeoutsRef = useRef({});

  /**
   * Process a single SSE event from the NanoClaw stream.
   * Called by useRealtimeEvents when it receives exec_*, intention_*, or skill_* events.
   */
  const processEvent = useCallback((event) => {
    if (!event || !event.type) return;

    const { type } = event;

    switch (type) {
      case 'exec_start': {
        const { taskId, executor } = event;
        if (!taskId) return;
        htmlAccRef.current[taskId] = '';
        textAccRef.current[taskId] = '';
        // Clear any previous timeout for this taskId
        if (streamTimeoutsRef.current[taskId]) {
          clearTimeout(streamTimeoutsRef.current[taskId]);
        }
        // Set a 5-minute timeout to clean up orphaned streams
        streamTimeoutsRef.current[taskId] = setTimeout(() => {
          delete streamTimeoutsRef.current[taskId];
          delete htmlAccRef.current[taskId];
          delete textAccRef.current[taskId];
          setActiveStreams(prev => {
            const existing = prev[taskId];
            if (!existing) return prev;
            const timeoutEntry = {
              taskId,
              error: 'Stream timed out after 5 minutes',
              recoverable: false,
              content: existing.content || '',
              contentType: existing.contentType || 'text',
              _ts: Date.now(),
            };
            setTimeout(() => {
              setCompletedResults(r => [...r.slice(-49), timeoutEntry]);
            }, 0);
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
        }, 5 * 60 * 1000);
        setActiveStreams(prev => ({
          ...prev,
          [taskId]: {
            taskId,
            executor: executor || '',
            status: 'loading',
            content: '',
            contentType: null,
            progress: null,
            intermediates: [],
            _ts: Date.now(),
          },
        }));
        break;
      }

      case 'exec_progress': {
        const { taskId, step, total, message } = event;
        if (!taskId) return;
        setActiveStreams(prev => {
          const existing = prev[taskId];
          if (!existing) return prev;
          return {
            ...prev,
            [taskId]: {
              ...existing,
              status: 'loading',
              progress: { step, total, message },
              _ts: Date.now(),
            },
          };
        });
        break;
      }

      case 'exec_html_stream': {
        const { taskId, chunk, done } = event;
        if (!taskId) return;
        const acc = (htmlAccRef.current[taskId] || '') + (chunk || '');
        htmlAccRef.current[taskId] = acc;
        setActiveStreams(prev => {
          const existing = prev[taskId];
          if (!existing) return prev;
          return {
            ...prev,
            [taskId]: {
              ...existing,
              status: done ? 'done' : 'streaming',
              content: acc,
              contentType: 'html',
              _ts: Date.now(),
            },
          };
        });
        break;
      }

      case 'exec_text_stream': {
        const { taskId, chunk, done } = event;
        if (!taskId) return;
        const acc = (textAccRef.current[taskId] || '') + (chunk || '');
        textAccRef.current[taskId] = acc;
        setActiveStreams(prev => {
          const existing = prev[taskId];
          if (!existing) return prev;
          return {
            ...prev,
            [taskId]: {
              ...existing,
              status: done ? 'done' : 'streaming',
              content: acc,
              contentType: 'text',
              _ts: Date.now(),
            },
          };
        });
        break;
      }

      case 'exec_module': {
        const { taskId, moduleType, data } = event;
        if (!taskId) return;
        setActiveStreams(prev => {
          const existing = prev[taskId];
          if (!existing) return prev;
          return {
            ...prev,
            [taskId]: {
              ...existing,
              status: 'done',
              content: '',
              contentType: 'module',
              moduleType,
              moduleData: data,
              _ts: Date.now(),
            },
          };
        });
        break;
      }

      case 'exec_intermediate': {
        const { taskId, step, label, data } = event;
        if (!taskId) return;
        setActiveStreams(prev => {
          const existing = prev[taskId];
          if (!existing) return prev;
          return {
            ...prev,
            [taskId]: {
              ...existing,
              intermediates: [
                ...existing.intermediates,
                { step, label, data, _ts: Date.now() },
              ],
              _ts: Date.now(),
            },
          };
        });
        break;
      }

      case 'exec_result': {
        const { taskId, summary } = event;
        if (!taskId) return;
        // Clear orphan timeout
        if (streamTimeoutsRef.current[taskId]) {
          clearTimeout(streamTimeoutsRef.current[taskId]);
          delete streamTimeoutsRef.current[taskId];
        }
        // Finalize the stream and move to completed results
        setActiveStreams(prev => {
          const existing = prev[taskId];
          const finalContent = htmlAccRef.current[taskId]
            || textAccRef.current[taskId]
            || existing?.content
            || '';
          const finalContentType = existing?.contentType || 'text';
          const completedEntry = {
            taskId,
            summary: summary || '',
            content: finalContent,
            contentType: finalContentType,
            moduleType: existing?.moduleType,
            moduleData: existing?.moduleData,
            intermediates: existing?.intermediates || [],
            _ts: Date.now(),
          };

          // Clean up accumulators
          delete htmlAccRef.current[taskId];
          delete textAccRef.current[taskId];

          // Schedule completed result addition (avoid setState during setState)
          setTimeout(() => {
            setCompletedResults(r => [...r.slice(-49), completedEntry]);
          }, 0);

          // Remove from active streams
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        break;
      }

      case 'exec_error': {
        const { taskId, error, recoverable } = event;
        if (!taskId) return;
        // Clear orphan timeout
        if (streamTimeoutsRef.current[taskId]) {
          clearTimeout(streamTimeoutsRef.current[taskId]);
          delete streamTimeoutsRef.current[taskId];
        }
        setActiveStreams(prev => {
          const existing = prev[taskId];
          const errorEntry = {
            taskId,
            error: error || 'Unknown error',
            recoverable: !!recoverable,
            content: existing?.content || '',
            contentType: existing?.contentType || 'text',
            _ts: Date.now(),
          };

          // Clean up accumulators
          delete htmlAccRef.current[taskId];
          delete textAccRef.current[taskId];

          setTimeout(() => {
            setCompletedResults(r => [...r.slice(-49), errorEntry]);
          }, 0);

          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        break;
      }

      case 'intention_update': {
        const { intentions: newIntentions } = event;
        if (Array.isArray(newIntentions)) {
          setIntentions(newIntentions);
        }
        break;
      }

      case 'skill_status': {
        // Skill enable/disable/install status updates
        // Currently a no-op — SkillsView will poll or use its own state
        break;
      }

      default:
        break;
    }
  }, []);

  /**
   * Clear a specific stream (e.g., when user dismisses an error).
   */
  const clearStream = useCallback((taskId) => {
    if (streamTimeoutsRef.current[taskId]) {
      clearTimeout(streamTimeoutsRef.current[taskId]);
      delete streamTimeoutsRef.current[taskId];
    }
    delete htmlAccRef.current[taskId];
    delete textAccRef.current[taskId];
    setActiveStreams(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  // Clean up all timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(streamTimeoutsRef.current).forEach(clearTimeout);
      streamTimeoutsRef.current = {};
    };
  }, []);

  return {
    activeStreams,
    intentions,
    completedResults,
    processEvent,
    clearStream,
  };
}
