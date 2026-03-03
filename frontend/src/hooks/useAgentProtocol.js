import { useState, useEffect, useCallback, useRef } from 'react';
import { RoomEvent } from 'livekit-client';
import { api } from '../services/api';

import { CANVAS_WIDTH, CANVAS_HEIGHT, JPEG_QUALITY } from '../constants';
const CAPTURE_FALLBACK_TIMEOUT_MS = 500;
const TRANSCRIPT_BUFFER_LIMIT = 200;
const RESULT_BUFFER_LIMIT = 50;
// Gateway DataChannel events use 'task_*' naming for historical reasons.
// The task_id in these events corresponds to a session UUID in the backend.
// We preserve this naming in the event buffer to match the wire protocol.
const TASK_EVENT_BUFFER_LIMIT = 50;

/**
 * Filter out tool call syntax and code-like content from agent transcript text.
 * Gemini sometimes speaks function calls instead of executing them.
 * Returns cleaned text, or null if the entire text is tool call noise.
 */
function filterToolCallSyntax(text) {
  if (!text) return null;

  let cleaned = text.replace(/\b\w+\s*\([^)]*\)\s*/g, '');
  // Also strip partial tool calls (opening paren without closing paren)
  cleaned = cleaned.replace(/\b\w+\s*\([^)]*$/g, '');
  cleaned = cleaned.replace(/<\/?[a-z_]+[^>]*>/gi, '');
  cleaned = cleaned.replace(/\b\w+\s*=\s*["'][^"']*["']\s*;?/g, '');
  cleaned = cleaned.replace(/\{\s*["']?\w+["']?\s*:\s*["'][^"']*["']\s*\}/g, '');
  cleaned = cleaned.replace(/\bdef\s+\w+\s*\([^)]*\)\s*:/g, '');
  cleaned = cleaned.replace(/\bprint\s*\([^)]*\)/g, '');
  // Filter Gemini tool call leaks (our specific tool names and parameter names)
  cleaned = cleaned.replace(/\b(update_intention|suggest_action|execute_task|push_bubble|update_memory|update_info_bar|publish_info_bar)\b/gi, '');
  cleaned = cleaned.replace(/\b(intention_text|task_description|action_type)\s*[:=]/gi, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`]+`/g, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
}

/**
 * Detect user intent from agent transcript text.
 * Returns an intent key like 'search', 'create', 'shop', etc. or null.
 */
function detectIntentFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const patterns = [
    { intent: 'shop', words: ['price', 'buy', 'shop', 'purchase', 'cost', 'order', 'deal', 'discount', 'amazon', 'product'] },
    { intent: 'translate', words: ['translat', 'language', 'chinese', 'spanish', 'french', 'japanese', 'korean', 'german'] },
    { intent: 'receipt', words: ['receipt', 'invoice', 'bill', 'expense', 'total', 'payment'] },
    { intent: 'create', words: ['create', 'generat', 'design', 'build', 'make', 'write', 'compos', 'draft'] },
    { intent: 'search', words: ['search', 'research', 'find', 'look up', 'looking up', 'investigat', 'explor'] },
    { intent: 'analyze', words: ['analyz', 'examin', 'inspect', 'review', 'evaluat', 'assess', 'study', 'compar'] },
    { intent: 'identify', words: ['identify', 'recogniz', 'detect', 'what is', "what's this", 'this is', 'i see', 'i can see', 'looks like'] },
    { intent: 'scan', words: ['scan', 'read', 'ocr', 'text', 'document', 'barcode', 'qr'] },
  ];

  for (const { intent, words } of patterns) {
    for (const w of words) {
      if (lower.includes(w)) return intent;
    }
  }
  return null;
}

/**
 * Parse XML-style tags from agent data channel messages.
 */
function parseAgentXml(raw) {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);

  const transcriptMatch = text.match(/<transcript\s+type="([^"]+)">([\s\S]*?)<\/transcript>/);
  if (transcriptMatch) {
    return { kind: 'transcript', type: transcriptMatch[1], content: transcriptMatch[2] };
  }

  const resultMatch = text.match(/<show_result\s+type="([^"]+)">([\s\S]*?)<\/show_result>/);
  if (resultMatch) {
    return { kind: 'result', type: resultMatch[1], content: resultMatch[2] };
  }

  const infoBarMatch = text.match(/<info_bar\s+status="([^"]+)">([\s\S]*?)<\/info_bar>/);
  if (infoBarMatch) {
    return { kind: 'info_bar', status: infoBarMatch[1], message: infoBarMatch[2] };
  }

  const actionMatch = text.match(/<action_suggestion\s+action="([^"]+)"\s+icon="([^"]+)"(?:\s+label="([^"]*)")?>([\s\S]*?)<\/action_suggestion>/);
  if (actionMatch) {
    return { kind: 'action_suggestion', action: actionMatch[1], icon: actionMatch[2], label: actionMatch[3] || actionMatch[4] };
  }

  return null;
}

/**
 * Agent protocol: RPC methods, data channel message handling, protocol state,
 * photo capture, messaging, navigation/camera callbacks.
 * Accepts shared refs from the composition hook.
 *
 * NAMING NOTE (V2→V3 migration):
 * Gateway DataChannel events use "task_*" naming for historical reasons
 * (task_started, task_progress, task_result). The task_id in these events
 * corresponds to a session UUID in the backend's Session model. The "task"
 * concept was removed from the backend in V3, but the gateway wire protocol
 * retains these names. Do NOT rename them without coordinating with
 * gateway-service.ts and room-client.ts.
 *
 * Similarly, `sendDispatch` sends a [USER_DISPATCH] message to the agent,
 * which triggers session persistence — not a separate "task" entity.
 */
export function useAgentProtocol({ roomRef, videoTrackRef, agentIdentityRef }) {
  // VI agent protocol state
  const [transcripts, setTranscripts] = useState([]);
  const [lastAgentText, setLastAgentText] = useState('');
  const [results, setResults] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [infoBar, setInfoBar] = useState(null);
  const [actionCard, setActionCard] = useState(null);
  const [lastDetectedIntent, setLastDetectedIntent] = useState(null);
  const [actionSuggestion, setActionSuggestion] = useState(null);
  const [intentionText, setIntentionText] = useState('');
  // Gateway DataChannel events — uses "task_*" naming for V2/V3 compat (see module docstring)
  const [taskEvents, setTaskEvents] = useState([]);

  // HTML streaming state
  const [streamingHtml, setStreamingHtml] = useState('');
  const [isHtmlStreaming, setIsHtmlStreaming] = useState(false);
  const streamingHtmlRef = useRef('');

  // Viewfinder overlay state
  const [viewfinderOverlay, setViewfinderOverlay] = useState(null);

  // Session plan & rich text state
  const [sessionPlan, setSessionPlan] = useState([]);
  const [sessionRichText, setSessionRichText] = useState('');

  // Session progress state (gateway uses "task_progress" topic name)
  const [taskProgress, setTaskProgress] = useState(null);

  // Gateway block state (reserved/loading/done lifecycle from agent)
  const [gatewayBlock, setGatewayBlock] = useState(null);

  // vi-gateway DataChannel: per-session gateway blocks (keyed by task_id which IS a session UUID)
  const [gatewayBlocks, setGatewayBlocks] = useState(new Map());
  const gatewayHtmlAccRef = useRef(new Map()); // sessionId (gateway "task_id") → accumulated HTML string

  // Text streaming state
  const [streamedText, setStreamedText] = useState('');
  const [isTextStreaming, setIsTextStreaming] = useState(false);
  const streamedTextRef = useRef('');

  // Session header state
  const [sessionHeader, setSessionHeader] = useState(null);
  const [memoryUpdatedAt, setMemoryUpdatedAt] = useState(0);

  // Agent status state machine signals
  const [greetingReceived, setGreetingReceived] = useState(false);

  // Refs for RPC handler access to current state
  const chatTextRef = useRef('');
  const chatImagesRef = useRef([]);

  // Navigation/camera control callback refs
  const navigateCallbackRef = useRef(null);
  const zoomCallbackRef = useRef(null);
  const switchCameraCallbackRef = useRef(null);

  // Helper: find agent identity from room participants
  const resolveAgentIdentity = useCallback(() => {
    let identity = agentIdentityRef.current;
    if (!identity && roomRef.current) {
      for (const p of roomRef.current.remoteParticipants.values()) {
        if (p.identity.startsWith('agent-')) {
          identity = p.identity;
          agentIdentityRef.current = identity;
          break;
        }
      }
    }
    return identity;
  }, [roomRef, agentIdentityRef]);

  // Internal photo capture (used by RPC handler and public API)
  const capturePhotoInternal = useCallback(async () => {
    const track = videoTrackRef.current;
    if (!track) return null;

    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return null;

    const video = document.createElement('video');
    video.srcObject = new MediaStream([mediaTrack]);
    video.muted = true;

    return new Promise((resolve) => {
      let resolved = false;
      const doCapture = () => {
        if (resolved) return;
        resolved = true;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || CANVAS_WIDTH;
          canvas.height = video.videoHeight || CANVAS_HEIGHT;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          video.srcObject = null;
          resolve(dataUrl);
        } catch {
          video.srcObject = null;
          resolve(null);
        }
      };

      video.onloadeddata = doCapture;
      setTimeout(doCapture, CAPTURE_FALLBACK_TIMEOUT_MS);
      video.play().catch(e => console.debug('[capture] video.play() blocked:', e.message));
    });
  }, [videoTrackRef]);

  // Register RPC methods the agent can call on this frontend participant
  const registerRpcMethods = useCallback((newRoom) => {
    const lp = newRoom.localParticipant;

    // rpcB2FShowResult — agent sends rich content for display
    lp.registerRpcMethod('rpcB2FShowResult', async (data) => {
      try {
        const payload = JSON.parse(data.payload);
        const entry = {
          type: payload.result_type || 'text',
          content: payload.content || '',
          ts: payload.timestamp || Date.now(),
        };
        setResults(prev => [...prev, entry].slice(-RESULT_BUFFER_LIMIT));
        setLastResult(entry);
        return JSON.stringify({ success: true });
      } catch (e) {
        console.error('[RPC] rpcB2FShowResult error:', e);
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FTakePhoto — agent requests a photo capture
    lp.registerRpcMethod('rpcB2FTakePhoto', async () => {
      try {
        const dataUrl = await capturePhotoInternal();
        if (dataUrl) {
          return JSON.stringify({ success: true, photo: dataUrl });
        }
        return JSON.stringify({ success: false, error: 'No video track' });
      } catch (e) {
        console.error('[RPC] rpcB2FTakePhoto error:', e);
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FCaptureAndUpload — agent captures photo AND uploads to S3 in one step
    lp.registerRpcMethod('rpcB2FCaptureAndUpload', async () => {
      try {
        const dataUrl = await capturePhotoInternal();
        if (!dataUrl) {
          return JSON.stringify({ success: false, error: 'No video track available' });
        }
        const s3Url = await api.uploadDataUrl(dataUrl);
        return JSON.stringify({ success: true, url: s3Url });
      } catch (e) {
        console.error('[RPC] rpcB2FCaptureAndUpload error:', e);
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FSetChatText — agent writes text into chat input
    lp.registerRpcMethod('rpcB2FSetChatText', async (data) => {
      try {
        const payload = JSON.parse(data.payload);
        chatTextRef.current = payload.text || '';
        window.dispatchEvent(new CustomEvent('vi-set-chat-text', { detail: payload.text }));
        return JSON.stringify({ success: true });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FGetChatContent — agent reads current chat input
    lp.registerRpcMethod('rpcB2FGetChatContent', async () => {
      return JSON.stringify({
        success: true,
        text: chatTextRef.current,
        images: chatImagesRef.current,
      });
    });

    // rpcB2FShowActionCard — agent shows clickable options
    lp.registerRpcMethod('rpcB2FShowActionCard', async (data) => {
      try {
        const payload = JSON.parse(data.payload);
        setActionCard({
          title: payload.title || '',
          options: (payload.options || []).slice(0, 4),
        });
        return JSON.stringify({ success: true });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FNavigateTo — agent navigates user to a page
    lp.registerRpcMethod('rpcB2FNavigateTo', async (data) => {
      try {
        const payload = JSON.parse(data.payload);
        const page = payload.page || 'camera';
        if (navigateCallbackRef.current) {
          navigateCallbackRef.current(page);
        }
        return JSON.stringify({ success: true, page });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FZoom — agent adjusts camera zoom level
    lp.registerRpcMethod('rpcB2FZoom', async (data) => {
      try {
        const payload = JSON.parse(data.payload);
        const level = payload.level || 1;
        if (zoomCallbackRef.current) {
          zoomCallbackRef.current(level);
        }
        return JSON.stringify({ success: true, level });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    });

    // rpcB2FSwitchCamera — agent switches between front/back camera
    lp.registerRpcMethod('rpcB2FSwitchCamera', async () => {
      try {
        if (switchCameraCallbackRef.current) {
          switchCameraCallbackRef.current();
        }
        return JSON.stringify({ success: true });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    });

  }, [capturePhotoInternal]);

  // Register DataReceived handler for all data channel messages
  const registerDataHandler = useCallback((newRoom) => {
    newRoom.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
      // Handle gateway HTML streaming
      if (topic === 'gateway_html_stream') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data.type === 'start') {
            streamingHtmlRef.current = '';
            setStreamingHtml('');
            setIsHtmlStreaming(true);
          } else if (data.type === 'chunk') {
            streamingHtmlRef.current += data.content;
            setStreamingHtml(streamingHtmlRef.current);
          } else if (data.type === 'end') {
            // Only finalize the streaming state — do NOT push to results or
            // set lastResult.  The streaming_html block in LiveSessionView
            // already displays this content; duplicating it would create a
            // second identical block.
            setIsHtmlStreaming(false);
          }
        } catch (e) {
          console.error('[LiveKit] Failed to parse gateway_html_stream:', e);
        }
        return;
      }

      // Handle task progress events from gateway
      if (topic === 'task_progress') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          setTaskProgress(data.stage === 'complete' ? null : { stage: data.stage, message: data.message });
        } catch (e) {
          console.error('[LiveKit] Failed to parse task_progress:', e);
        }
        return;
      }

      // Handle non-HTML text streaming from gateway
      if (topic === 'gateway_text_stream') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data.type === 'start') {
            streamedTextRef.current = '';
            setStreamedText('');
            setIsTextStreaming(true);
          } else if (data.type === 'chunk') {
            streamedTextRef.current += data.content;
            setStreamedText(streamedTextRef.current);
          } else if (data.type === 'end') {
            setIsTextStreaming(false);
            const finalText = streamedTextRef.current;
            if (finalText) {
              const entry = { type: 'text', content: finalText, ts: Date.now() };
              setResults(prev => [...prev, entry].slice(-RESULT_BUFFER_LIMIT));
              setLastResult(entry);
            }
            streamedTextRef.current = '';
          }
        } catch (e) {
          console.error('[LiveKit] Failed to parse gateway_text_stream:', e);
        }
        return;
      }

      // Handle session header from agent
      if (topic === 'session_header') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          setSessionHeader(data);
        } catch (e) {
          console.error('[LiveKit] Failed to parse session_header:', e);
        }
        return;
      }

      // Handle real-time task lifecycle events from agent
      if (topic === 'task_events') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          setTaskEvents(prev => [...prev, { ...data, _ts: Date.now() }].slice(-TASK_EVENT_BUFFER_LIMIT));
        } catch (e) {
          console.error('[LiveKit] Failed to parse task_events:', e);
        }
        return;
      }

      // Handle memory_updated events from agent/gateway
      if (topic === 'memory_updated') {
        setMemoryUpdatedAt(Date.now());
        return;
      }

      // Handle JSON messages from gateway on "vi-gateway" topic
      if (topic === 'vi-gateway') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          const taskId = data.task_id || data.taskId;
          if (!taskId) return;

          if (data.type === 'task_started' || data.type === 'start') {
            // Create placeholder timeline block
            gatewayHtmlAccRef.current.set(taskId, '');
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              next.set(taskId, { id: taskId, type: 'html', status: 'loading', content: '', description: data.description || '', executor: data.executor || '', _ts: Date.now() });
              return next;
            });
            // Also add to task events for HistoryView
            setTaskEvents(prev => [...prev, { ...data, _ts: Date.now() }].slice(-TASK_EVENT_BUFFER_LIMIT));
          } else if (data.type === 'progress') {
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              const existing = next.get(taskId) || { id: taskId, type: 'html', status: 'loading', content: '' };
              next.set(taskId, { ...existing, status: 'loading', progress: data.message || data.stage || '', _ts: Date.now() });
              return next;
            });
            setTaskProgress(data.stage === 'complete' ? null : { stage: data.stage, message: data.message });
          } else if (data.type === 'html_stream') {
            // Streaming append HTML to block (no flicker — accumulate in ref)
            const acc = (gatewayHtmlAccRef.current.get(taskId) || '') + (data.content || '');
            gatewayHtmlAccRef.current.set(taskId, acc);
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              const existing = next.get(taskId) || { id: taskId, type: 'html', status: 'streaming', content: '' };
              next.set(taskId, { ...existing, status: 'streaming', content: acc, _ts: Date.now() });
              return next;
            });
          } else if (data.type === 'text_stream') {
            // Streaming text — accumulate raw text as block content
            const acc = (gatewayHtmlAccRef.current.get(taskId) || '') + (data.content || '');
            gatewayHtmlAccRef.current.set(taskId, acc);
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              const existing = next.get(taskId) || { id: taskId, type: 'html', status: 'streaming', content: '' };
              next.set(taskId, { ...existing, status: 'streaming', content: acc, _ts: Date.now() });
              return next;
            });
          } else if (data.type === 'module') {
            // Structured module output — render as native React component
            gatewayHtmlAccRef.current.delete(taskId);
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              next.set(taskId, {
                id: taskId,
                type: 'module',
                module_type: data.module_type,
                data: data.data,
                status: 'done',
                content: '',
                _ts: Date.now(),
              });
              return next;
            });
            setIsHtmlStreaming(false);
            setTaskProgress(null);
          } else if (data.type === 'result') {
            // Mark block complete with final content
            const finalContent = data.html || data.content || gatewayHtmlAccRef.current.get(taskId) || '';
            gatewayHtmlAccRef.current.delete(taskId);
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              next.set(taskId, { id: taskId, type: 'html', status: 'done', content: finalContent, _ts: Date.now() });
              return next;
            });
            setIsHtmlStreaming(false);
            setTaskProgress(null);
            setTaskEvents(prev => [...prev, { ...data, _ts: Date.now() }].slice(-TASK_EVENT_BUFFER_LIMIT));
          } else if (data.type === 'end') {
            // Gateway signals task completion — mark block as done
            const finalContent = gatewayHtmlAccRef.current.get(taskId) || '';
            gatewayHtmlAccRef.current.delete(taskId);
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              const existing = next.get(taskId);
              if (existing) {
                // Only transition to done if not already done (result may have arrived first)
                if (existing.status !== 'done') {
                  next.set(taskId, { ...existing, status: 'done', _ts: Date.now() });
                }
              } else {
                next.set(taskId, { id: taskId, type: 'html', status: 'done', content: finalContent, _ts: Date.now() });
              }
              return next;
            });
            setIsHtmlStreaming(false);
            setTaskProgress(null);
            setTaskEvents(prev => [...prev, { ...data, _ts: Date.now() }].slice(-TASK_EVENT_BUFFER_LIMIT));
          } else if (data.type === 'error') {
            gatewayHtmlAccRef.current.delete(taskId);
            setGatewayBlocks(prev => {
              const next = new Map(prev);
              const existing = next.get(taskId) || { id: taskId, type: 'html', status: 'error', content: '' };
              next.set(taskId, { ...existing, status: 'error', error: data.message || 'Session failed', _ts: Date.now() });
              return next;
            });
            setIsHtmlStreaming(false);
            setTaskProgress(null);
            setTaskEvents(prev => [...prev, { ...data, _ts: Date.now() }].slice(-TASK_EVENT_BUFFER_LIMIT));
          }
        } catch (e) {
          console.error('[LiveKit] Failed to parse vi-gateway message:', e);
        }
        return;
      }

      // Handle JSON messages from agent on "vi-agent" topic
      if (topic === 'vi-agent') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (data.type === 'viewfinder_overlay') {
            setViewfinderOverlay({ ...data, _ts: Date.now() });
          } else if (data.type === 'session_plan') {
            setSessionPlan(data.plan || []);
          } else if (data.type === 'session_plan_update') {
            setSessionPlan(prev => prev.map(step =>
              step.id === data.step_id ? { ...step, ...data.updates, status: data.status || step.status } : step
            ));
          } else if (data.type === 'session_rich_text') {
            setSessionRichText(data.content || '');
          } else if (data.type === 'intention') {
            const text = data.text;
            if (text) {
              setIntentionText(text);
              const intent = detectIntentFromText(text);
              if (intent) setLastDetectedIntent(intent);
              // Trigger greeting on first intention (agent is active)
              if (!greetingReceivedRef.current) {
                greetingReceivedRef.current = true;
                setGreetingReceived(true);
              }
            }
          } else if (data.type === 'timeline_block') {
            // Direct block push from agent tools (push_bubble, etc.)
            const content = filterToolCallSyntax(data.content || '');
            if (content) {
              setLastAgentText(content);
            }
          } else if (data.type === 'card') {
            const content = filterToolCallSyntax(data.content || data.title || '');
            if (content) {
              setLastAgentText(content);
            }
          } else if (data.type === 'action_suggestion') {
            setActionSuggestion({ action: data.action, icon: data.icon || 'camera', label: data.label || '' });
          } else if (data.type === 'gateway_block') {
            setGatewayBlock({ id: data.id, status: data.status, html: data.html });
          } else if (data.type === 'task_started' || data.type === 'task_progress' || data.type === 'task_result') {
            setTaskEvents(prev => [...prev, { ...data, _ts: Date.now() }].slice(-TASK_EVENT_BUFFER_LIMIT));
          }
        } catch (e) {
          // Not JSON or not a recognized message — ignore
        }
        return;
      }

      // Handle XML-based agent messages (legacy topics)
      const agentTopics = [
        'agent_transcript', 'agent_result', 'agent_info_bar',
        'agent_action', 'agent_summary', 'agent_intention',
      ];
      if (!agentTopics.includes(topic)) return;

      const parsed = parseAgentXml(payload);
      if (!parsed) return;

      if (parsed.kind === 'transcript') {
        const cleanContent = parsed.type === 'agent' ? filterToolCallSyntax(parsed.content) : parsed.content;
        if (!cleanContent) return;

        const entry = { type: parsed.type, content: cleanContent, ts: Date.now() };
        setTranscripts(prev => [...prev, entry].slice(-TRANSCRIPT_BUFFER_LIMIT));
        if (parsed.type === 'agent') {
          setLastAgentText(cleanContent);
          const intent = detectIntentFromText(cleanContent);
          if (intent) setLastDetectedIntent(intent);
        }
      } else if (parsed.kind === 'result') {
        const entry = { type: parsed.type, content: parsed.content, ts: Date.now() };
        setResults(prev => [...prev, entry].slice(-RESULT_BUFFER_LIMIT));
        setLastResult(entry);
      } else if (parsed.kind === 'info_bar') {
        setInfoBar({ status: parsed.status, message: parsed.message });
      } else if (parsed.kind === 'action_suggestion') {
        setActionSuggestion({ action: parsed.action, icon: parsed.icon, label: parsed.label });
      }
    });
  }, []);

  // Setup function: registers RPC methods + DataReceived handler on room before connect
  const setupProtocol = useCallback((newRoom) => {
    registerRpcMethods(newRoom);
    registerDataHandler(newRoom);
  }, [registerRpcMethods, registerDataHandler]);

  // Send message to agent via RPC
  const sendMessage = useCallback(async (text, images = []) => {
    if (!roomRef.current) {
      console.warn('[LiveKit] Cannot send message: no room');
      return;
    }
    const identity = resolveAgentIdentity();
    if (!identity) {
      console.warn('[LiveKit] Cannot send message: no agent found in room');
      return;
    }
    try {
      const payload = JSON.stringify({ text, images });
      await roomRef.current.localParticipant.performRpc({
        destinationIdentity: identity,
        method: 'rpcF2BSendMessage',
        payload,
      });
    } catch (e) {
      console.error('[LiveKit] Failed to send RPC message:', e);
      try {
        const data = JSON.stringify({ type: 'user_action', text });
        await roomRef.current.localParticipant.publishData(
          new TextEncoder().encode(data),
          { topic: 'vi-user', reliable: true }
        );
      } catch (fallbackErr) {
        console.error('[LiveKit] Fallback data channel also failed:', fallbackErr);
      }
    }
  }, [roomRef, resolveAgentIdentity]);

  // Send page context to agent
  const sendPageContext = useCallback(async (page) => {
    if (!roomRef.current) return;
    const identity = resolveAgentIdentity();
    if (!identity) return;
    try {
      const payload = JSON.stringify({ action: 'page_context', page });
      await roomRef.current.localParticipant.performRpc({
        destinationIdentity: identity,
        method: 'rpcF2BSendMessage',
        payload,
      });
    } catch (e) {
      console.warn('[LiveKit] Failed to send page context:', e);
    }
  }, [roomRef, resolveAgentIdentity]);

  // Send dispatch message to agent via RPC (uses [USER_DISPATCH] prefix)
  const sendDispatch = useCallback(async (intention, photoUrls = []) => {
    if (!roomRef.current) {
      console.warn('[LiveKit] Cannot send dispatch: no room');
      return;
    }
    const identity = resolveAgentIdentity();
    if (!identity) {
      console.warn('[LiveKit] Cannot send dispatch: agent identity not resolved');
      return;
    }
    try {
      // Build [USER_DISPATCH] message that handle_f2b_send_message expects
      let dispatchText = `[USER_DISPATCH] ${intention || 'Process this request'}`;
      if (photoUrls.length > 0) {
        dispatchText += '\n\nPhotos:\n' + photoUrls.map(u => `- ${u}`).join('\n');
      }
      const payload = JSON.stringify({
        text: dispatchText,
        images: photoUrls,
      });
      await roomRef.current.localParticipant.performRpc({
        destinationIdentity: identity,
        method: 'rpcF2BSendMessage',
        payload: payload,
        responseTimeoutMs: 10000,
      });
      console.log('[LiveKit] Dispatch sent via RPC:', { intention: intention?.substring(0, 50), photoCount: photoUrls.length });
    } catch (e) {
      console.error('[LiveKit] Failed to send dispatch:', e);
    }
  }, [roomRef, resolveAgentIdentity]);

  // Allow components to update chat text/images refs
  const setChatTextRef = useCallback((text) => {
    chatTextRef.current = text;
  }, []);

  const setChatImagesRef = useCallback((images) => {
    chatImagesRef.current = images;
  }, []);

  // Navigation/camera callback setters
  const setNavigateCallback = useCallback((cb) => { navigateCallbackRef.current = cb; }, []);
  const setZoomCallback = useCallback((cb) => { zoomCallbackRef.current = cb; }, []);
  const setSwitchCameraCallback = useCallback((cb) => { switchCameraCallbackRef.current = cb; }, []);

  // Dismiss action card
  const dismissActionCard = useCallback(() => {
    setActionCard(null);
  }, []);

  // Clear info bar
  const clearInfoBar = useCallback(() => {
    setInfoBar(null);
  }, []);

  // Clear intention (on camera re-entry)
  const clearIntention = useCallback(() => {
    setIntentionText('');
  }, []);

  // Mark greeting received when agent first speaks
  const greetingReceivedRef = useRef(false);
  useEffect(() => {
    if (lastAgentText && !greetingReceivedRef.current) {
      greetingReceivedRef.current = true;
      if (!greetingReceived) setGreetingReceived(true);
    }
  }, [lastAgentText, greetingReceived]);

  return {
    // Internal (used by composition hook only)
    setupProtocol,

    // Protocol state
    transcripts,
    lastAgentText,
    lastDetectedIntent,
    actionSuggestion,
    intentionText,
    results,
    lastResult,
    infoBar,
    actionCard,
    streamingHtml,
    isHtmlStreaming,
    viewfinderOverlay,
    sessionPlan,
    sessionRichText,
    taskEvents,
    taskProgress,
    streamedText,
    isTextStreaming,
    sessionHeader,
    memoryUpdatedAt,
    gatewayBlock,
    gatewayBlocks,
    greetingReceived,

    // Actions
    sendMessage,
    sendPageContext,
    sendDispatch,
    capturePhoto: capturePhotoInternal,
    dismissActionCard,
    clearInfoBar,
    clearIntention,
    setChatTextRef,
    setChatImagesRef,
    setNavigateCallback,
    setZoomCallback,
    setSwitchCameraCallback,
  };
}
