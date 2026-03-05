import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useNanoClawResults — Card Template Protocol event processor.
 *
 * Replaces the legacy flat-event model (exec_html_stream, exec_text_stream, etc.)
 * with a card-centric model that processes card operations:
 *   create_card, stream_to_card, update_card, append_to_card,
 *   replace_card, finalize_card, remove_card, html_stream
 *
 * Also handles task lifecycle events (exec_start, exec_progress, exec_result, exec_error)
 * and intention_update.
 *
 * @returns {{
 *   cards: Object.<string, CardState>,
 *   orderedCardIds: string[],
 *   tasks: Object.<string, TaskState>,
 *   intentions: Array,
 *   processEvent: function,
 *   removeCard: function,
 *   clearTask: function,
 * }}
 */
export function useNanoClawResults() {
  // Card states keyed by cardId
  const [cards, setCards] = useState({});
  // Ordered card IDs for canvas rendering (insertion order)
  const [orderedCardIds, setOrderedCardIds] = useState([]);
  // Task lifecycle states keyed by taskId
  const [tasks, setTasks] = useState({});
  // Intention predictions
  const [intentions, setIntentions] = useState([]);

  // Streaming slot accumulators (avoids re-renders per chunk)
  const slotAccRef = useRef({}); // cardId:slot → accumulated string

  // Timeout refs for orphaned task cleanup (5-minute TTL)
  const taskTimeoutsRef = useRef({});

  /**
   * Set or clear a 5-minute orphan timeout for a task.
   */
  const resetTaskTimeout = useCallback((taskId) => {
    if (taskTimeoutsRef.current[taskId]) {
      clearTimeout(taskTimeoutsRef.current[taskId]);
    }
    taskTimeoutsRef.current[taskId] = setTimeout(() => {
      delete taskTimeoutsRef.current[taskId];
      setTasks((prev) => {
        const existing = prev[taskId];
        if (!existing) return prev;
        const next = { ...prev };
        next[taskId] = { ...existing, status: 'error', error: 'Task timed out after 5 minutes' };
        return next;
      });
    }, 5 * 60 * 1000);
  }, []);

  const clearTaskTimeout = useCallback((taskId) => {
    if (taskTimeoutsRef.current[taskId]) {
      clearTimeout(taskTimeoutsRef.current[taskId]);
      delete taskTimeoutsRef.current[taskId];
    }
  }, []);

  /**
   * Insert a cardId into the ordered list at the correct position.
   */
  const insertCardId = useCallback((cardId, position) => {
    setOrderedCardIds((prev) => {
      if (prev.includes(cardId)) return prev;
      if (position === 'prepend') return [cardId, ...prev];
      if (typeof position === 'string' && position.startsWith('after:')) {
        const afterId = position.slice(6);
        const idx = prev.indexOf(afterId);
        if (idx >= 0) {
          const next = [...prev];
          next.splice(idx + 1, 0, cardId);
          return next;
        }
      }
      // Default: append
      return [...prev, cardId];
    });
  }, []);

  /**
   * Process a single SSE event from the NanoClaw stream.
   * Handles both new card operations (op field) and lifecycle events (type field).
   */
  const processEvent = useCallback(
    (event) => {
      if (!event) return;

      // Card operations have 'op' field; lifecycle events have 'type' field
      const opOrType = event.op || event.type;
      if (!opOrType) return;

      switch (opOrType) {
        // ============================================================
        // Card Operations (V5 Card Template Protocol)
        // ============================================================

        case 'create_card': {
          const { taskId, cardId, template, data = {}, position } = event;
          if (!cardId) return;

          setCards((prev) => ({
            ...prev,
            [cardId]: {
              cardId,
              taskId,
              template,
              data: { ...data },
              status: 'streaming',
              htmlContent: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          }));

          insertCardId(cardId, position);

          // Track cardId in task state
          if (taskId) {
            setTasks((prev) => {
              const existing = prev[taskId];
              if (!existing) return prev;
              return {
                ...prev,
                [taskId]: {
                  ...existing,
                  status: 'streaming',
                  cardIds: [...(existing.cardIds || []), cardId],
                  _ts: Date.now(),
                },
              };
            });
          }
          break;
        }

        case 'stream_to_card': {
          const { cardId, slot, chunk } = event;
          if (!cardId || !slot) return;

          // Accumulate in ref to avoid per-chunk re-renders
          const accKey = `${cardId}:${slot}`;
          slotAccRef.current[accKey] = (slotAccRef.current[accKey] || '') + (chunk || '');
          const accumulated = slotAccRef.current[accKey];

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            return {
              ...prev,
              [cardId]: {
                ...card,
                data: { ...card.data, [slot]: accumulated },
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'update_card': {
          const { cardId, updates } = event;
          if (!cardId || !updates) return;

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            return {
              ...prev,
              [cardId]: {
                ...card,
                data: { ...card.data, ...updates },
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'append_to_card': {
          const { cardId, slot, items } = event;
          if (!cardId || !slot || !Array.isArray(items)) return;

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            const existing = Array.isArray(card.data[slot]) ? card.data[slot] : [];
            return {
              ...prev,
              [cardId]: {
                ...card,
                data: { ...card.data, [slot]: [...existing, ...items] },
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'replace_card': {
          const { cardId, template, data = {} } = event;
          if (!cardId) return;

          // Clear any slot accumulators for this card
          Object.keys(slotAccRef.current).forEach((key) => {
            if (key.startsWith(`${cardId}:`)) {
              delete slotAccRef.current[key];
            }
          });

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            return {
              ...prev,
              [cardId]: {
                ...card,
                template,
                data: { ...data },
                htmlContent: '',
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'finalize_card': {
          const { cardId } = event;
          if (!cardId) return;

          // Clean up slot accumulators
          Object.keys(slotAccRef.current).forEach((key) => {
            if (key.startsWith(`${cardId}:`)) {
              delete slotAccRef.current[key];
            }
          });

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            return {
              ...prev,
              [cardId]: {
                ...card,
                status: 'finalized',
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'remove_card': {
          const { cardId } = event;
          if (!cardId) return;

          // Clean up accumulators
          Object.keys(slotAccRef.current).forEach((key) => {
            if (key.startsWith(`${cardId}:`)) {
              delete slotAccRef.current[key];
            }
          });

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            return {
              ...prev,
              [cardId]: { ...card, status: 'removed', updatedAt: Date.now() },
            };
          });

          setOrderedCardIds((prev) => prev.filter((id) => id !== cardId));
          break;
        }

        case 'html_stream': {
          const { cardId, chunk, done } = event;
          if (!cardId) return;

          setCards((prev) => {
            const card = prev[cardId];
            if (!card) return prev;
            return {
              ...prev,
              [cardId]: {
                ...card,
                htmlContent: (card.htmlContent || '') + (chunk || ''),
                status: done ? 'finalized' : 'streaming',
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        // ============================================================
        // Task Lifecycle Events
        // ============================================================

        case 'exec_start': {
          const { taskId, executor } = event;
          if (!taskId) return;

          resetTaskTimeout(taskId);

          setTasks((prev) => ({
            ...prev,
            [taskId]: {
              taskId,
              executor: executor || '',
              status: 'loading',
              progress: null,
              error: null,
              summary: null,
              cardIds: [],
              _ts: Date.now(),
            },
          }));
          break;
        }

        case 'exec_progress': {
          const { taskId, step, total, message } = event;
          if (!taskId) return;

          setTasks((prev) => {
            const existing = prev[taskId];
            if (!existing) return prev;
            return {
              ...prev,
              [taskId]: {
                ...existing,
                progress: { step, total, message },
                _ts: Date.now(),
              },
            };
          });
          break;
        }

        case 'exec_result': {
          const { taskId, summary } = event;
          if (!taskId) return;

          clearTaskTimeout(taskId);

          setTasks((prev) => {
            const existing = prev[taskId];
            if (!existing) return prev;
            return {
              ...prev,
              [taskId]: {
                ...existing,
                status: 'done',
                summary: summary || '',
                _ts: Date.now(),
              },
            };
          });
          break;
        }

        case 'exec_error': {
          const { taskId, error, recoverable } = event;
          if (!taskId) return;

          clearTaskTimeout(taskId);

          setTasks((prev) => {
            const existing = prev[taskId];
            if (!existing) return prev;
            return {
              ...prev,
              [taskId]: {
                ...existing,
                status: 'error',
                error: error || 'Unknown error',
                recoverable: !!recoverable,
                _ts: Date.now(),
              },
            };
          });
          break;
        }

        // ============================================================
        // Legacy event compat — translate old type-based events to card ops.
        // NanoClaw no longer produces these (V5 uses card ops exclusively).
        // Kept as a safety net for any external/cached events.
        // ============================================================

        case 'exec_html_stream': {
          const { taskId, chunk, done } = event;
          if (!taskId) return;
          const cardId = `legacy_html_${taskId}`;
          // Auto-create card on first chunk
          setCards((prev) => {
            if (!prev[cardId]) {
              insertCardId(cardId, 'append');
              return {
                ...prev,
                [cardId]: {
                  cardId,
                  taskId,
                  template: 'freeform-html',
                  data: {},
                  status: 'streaming',
                  htmlContent: chunk || '',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              };
            }
            return {
              ...prev,
              [cardId]: {
                ...prev[cardId],
                htmlContent: (prev[cardId].htmlContent || '') + (chunk || ''),
                status: done ? 'finalized' : 'streaming',
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'exec_text_stream': {
          const { taskId, chunk, done } = event;
          if (!taskId) return;
          const cardId = `legacy_text_${taskId}`;
          setCards((prev) => {
            if (!prev[cardId]) {
              insertCardId(cardId, 'append');
              return {
                ...prev,
                [cardId]: {
                  cardId,
                  taskId,
                  template: 'thinking-process',
                  data: { conclusion: chunk || '' },
                  status: 'streaming',
                  htmlContent: '',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              };
            }
            const existing = prev[cardId];
            return {
              ...prev,
              [cardId]: {
                ...existing,
                data: {
                  ...existing.data,
                  conclusion: (existing.data.conclusion || '') + (chunk || ''),
                },
                status: done ? 'finalized' : 'streaming',
                updatedAt: Date.now(),
              },
            };
          });
          break;
        }

        case 'exec_module': {
          const { taskId, moduleType, data } = event;
          if (!taskId) return;
          const templateMap = {
            place_card: 'map-pins',
            checklist: 'shopping-list',
            weather: 'hero-image',
            comparison: 'comparison-table',
            recipe: 'hero-image',
            steps_guide: 'thinking-process',
            info_card: 'hero-image',
            image_gallery: 'hero-image',
          };
          const template = templateMap[moduleType] || moduleType || 'freeform-html';
          const cardId = `legacy_module_${taskId}_${Date.now()}`;

          const cardData = typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return { content: data }; } })() : (data || {});

          setCards((prev) => ({
            ...prev,
            [cardId]: {
              cardId,
              taskId,
              template,
              data: cardData,
              status: 'finalized',
              htmlContent: '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          }));
          insertCardId(cardId, 'append');
          break;
        }

        case 'exec_intermediate': {
          // Legacy intermediate steps — ignored in V5 card model
          break;
        }

        // ============================================================
        // Intention Updates
        // ============================================================

        case 'intention_update': {
          const { intentions: newIntentions } = event;
          if (Array.isArray(newIntentions)) {
            setIntentions(newIntentions);
          }
          break;
        }

        default:
          break;
      }
    },
    [insertCardId, resetTaskTimeout, clearTaskTimeout],
  );

  /**
   * Remove a specific card from the canvas.
   */
  const removeCard = useCallback((cardId) => {
    Object.keys(slotAccRef.current).forEach((key) => {
      if (key.startsWith(`${cardId}:`)) {
        delete slotAccRef.current[key];
      }
    });
    setCards((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    setOrderedCardIds((prev) => prev.filter((id) => id !== cardId));
  }, []);

  /**
   * Clear a task and all its associated cards.
   */
  const clearTask = useCallback(
    (taskId) => {
      clearTaskTimeout(taskId);

      setTasks((prev) => {
        const existing = prev[taskId];
        // Remove associated cards
        if (existing?.cardIds?.length) {
          existing.cardIds.forEach((cid) => removeCard(cid));
        }
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    },
    [clearTaskTimeout, removeCard],
  );

  // Clean up all timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(taskTimeoutsRef.current).forEach(clearTimeout);
      taskTimeoutsRef.current = {};
    };
  }, []);

  return {
    cards,
    orderedCardIds,
    tasks,
    intentions,
    processEvent,
    removeCard,
    clearTask,
  };
}
