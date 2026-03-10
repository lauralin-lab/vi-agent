import { useState, useEffect, useCallback, useRef } from 'react';
import { RoomEvent } from 'livekit-client';
import { api } from '../services/api';

import { CANVAS_WIDTH, CANVAS_HEIGHT, JPEG_QUALITY } from '../constants';
const CAPTURE_FALLBACK_TIMEOUT_MS = 500;
const TRANSCRIPT_BUFFER_LIMIT = 200;
const RESULT_BUFFER_LIMIT = 50;
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
 * V4: NanoClaw results arrive via SSE (useNanoClawResults), not DataChannel.
 * This hook retains vi-agent DataChannel handlers (viewfinder_overlay,
 * action_suggestion, etc.).
 *
 * V5: All task dispatch goes through REST API → Redis → NanoClaw.
 * LiveKit is used only for voice/video streaming and DataChannel events.
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
  const [taskEvents, setTaskEvents] = useState([]);

  // Viewfinder overlay state
  const [viewfinderOverlay, setViewfinderOverlay] = useState(null);

  // Session plan & rich text state
  const [sessionPlan, setSessionPlan] = useState([]);
  const [sessionRichText, setSessionRichText] = useState('');

  // Session progress state
  const [taskProgress, setTaskProgress] = useState(null);

  // Session header state
  const [sessionHeader, setSessionHeader] = useState(null);
  const [memoryUpdatedAt, setMemoryUpdatedAt] = useState(0);

  // Agent status state machine signals
  const [greetingReceived, setGreetingReceived] = useState(false);
  const greetingReceivedRef = useRef(false);

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

  // Register DataReceived handler for data channel messages.
  // V4: Execution results arrive via SSE (useNanoClawResults), not DataChannel.
  // Retained: vi-agent topic, session_header, task_events, memory_updated, XML legacy topics.
  const registerDataHandler = useCallback((newRoom) => {
    newRoom.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
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

      // Handle task progress events from agent
      if (topic === 'task_progress') {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          setTaskProgress(data.stage === 'complete' ? null : { stage: data.stage, message: data.message });
        } catch (e) {
          console.error('[LiveKit] Failed to parse task_progress:', e);
        }
        return;
      }

      // Handle memory_updated events from agent
      if (topic === 'memory_updated') {
        setMemoryUpdatedAt(Date.now());
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

  // Send page context to agent via DataChannel (best-effort, non-critical)
  const sendPageContext = useCallback(async (page) => {
    if (!roomRef.current) return;
    try {
      const data = JSON.stringify({ type: 'page_context', page });
      await roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(data),
        { topic: 'vi-user', reliable: true }
      );
    } catch (e) {
      console.warn('[LiveKit] Failed to send page context:', e);
    }
  }, [roomRef]);

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
  useEffect(() => {
    if (lastAgentText && !greetingReceived) {
      queueMicrotask(() => setGreetingReceived(true));
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
    viewfinderOverlay,
    sessionPlan,
    sessionRichText,
    taskEvents,
    taskProgress,
    sessionHeader,
    memoryUpdatedAt,
    greetingReceived,

    // Actions
    sendPageContext,
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
