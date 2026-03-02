import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import HistoryView from './components/HistoryView';
import DeviceFrame from './components/DeviceFrame';

import LiveCameraView from './components/LiveCameraView';
import LiveSessionView from './components/LiveSessionView';
import MemoryView from './components/MemoryView';

import { useAuth } from './hooks/useAuth';
import { useLiveKit } from './hooks/useLiveKit';
import { useRealtimeEvents } from './hooks/useRealtimeEvents';
import { api } from './services/api';

// ── Toast notification types ──
const TOAST_CONFIG = {
  session_complete: { dot: 'bg-green-400', label: 'Session complete' },
  session_failed: { dot: 'bg-red-400', label: 'Session failed' },
  memory_update: { dot: 'bg-purple-400', label: 'Memory updated' },
  agent_message: { dot: 'bg-blue-400', label: 'Agent message' },
};

const MAX_TOASTS = 3;
const TOAST_DURATION = 3000;

// ── Single toast item ──
function ToastItem({ toast, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.agent_message;

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-lg min-w-[200px] max-w-[300px] overflow-hidden"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
      <span className="text-white/80 truncate flex-1" style={{ fontSize: '13px' }}>
        {toast.message || config.label}
      </span>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
        <div
          className="h-full bg-white/20 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}

// ── Toast container ──
function NotificationManager({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.slice(0, MAX_TOASTS).map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function App() {
  // Auth state (optional — not required for live mode)
  const auth = useAuth();

  // LiveKit state
  const livekit = useLiveKit();

  // View state
  const [viewState, setViewState] = useState(() => {
    const path = window.location.pathname;
    if (path === '/memories' || path === '/memory') return 'memory';
    if (path === '/home' || path === '/history') return 'home';
    return 'camera';
  });
  const [sessionData, setSessionData] = useState(null);
  const [liveResult, setLiveResult] = useState(null);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [lastIntention, setLastIntention] = useState('');

  // ── Badge state ──
  const [badges, setBadges] = useState({ home: 0, memory: 0 });

  // ── Toast state ──
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((type, message) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [{ id, type, message, _ts: Date.now() }, ...prev].slice(0, MAX_TOASTS));
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Unified notification handler ──
  const handleNotification = useCallback((notification) => {
    if (!notification || !notification.type) return;

    if (notification.type === 'session_complete') {
      setBadges(b => ({ ...b, home: b.home + 1 }));
      addToast('session_complete', notification.message || 'Session complete');
    } else if (notification.type === 'session_failed') {
      setBadges(b => ({ ...b, home: b.home + 1 }));
      addToast('session_failed', notification.message || 'Session failed');
    } else if (notification.type === 'memory_update') {
      setBadges(b => ({ ...b, memory: b.memory + 1 }));
      addToast('memory_update', notification.preview || 'Memory updated');
    } else if (notification.type === 'agent_message') {
      addToast('agent_message', notification.message || 'New message');
    }
  }, [addToast]);

  // ── Badge reset on navigation ──
  useEffect(() => {
    if (viewState === 'home') {
      setBadges(b => b.home === 0 ? b : { ...b, home: 0 });
    } else if (viewState === 'memory') {
      setBadges(b => b.memory === 0 ? b : { ...b, memory: 0 });
    }
  }, [viewState]);

  // ── Wire DataChannel memory_updated events to notifications ──
  useEffect(() => {
    if (!livekit.memoryUpdatedAt) return;
    handleNotification({ type: 'memory_update' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livekit.memoryUpdatedAt]);

  // ── SSE real-time events (global — active on ALL pages when LiveKit is disconnected) ──
  const viUserId = api.getViUserId();
  const livekitConnected = livekit.connectionState === 'connected';
  const { events: sseEvents, sseConnected } = useRealtimeEvents(viUserId, livekitConnected);

  // Process SSE events for global toast/badge notifications
  const lastSseRef = useRef(0);
  useEffect(() => {
    if (sseEvents.length === 0) return;
    const latest = sseEvents[sseEvents.length - 1];
    if (!latest || latest._ts <= lastSseRef.current) return;
    lastSseRef.current = latest._ts;

    if (latest.type === 'session_update') {
      const { status, result_summary } = latest;
      if (status === 'completed' || status === 'complete') {
        handleNotification({ type: 'session_complete', message: result_summary || 'Session complete' });
      } else if (status === 'failed' || status === 'error') {
        handleNotification({ type: 'session_failed', message: result_summary || 'Session failed' });
      }
    } else if (latest.type === 'memory_update') {
      handleNotification({ type: 'memory_update', preview: latest.preview || latest.filename });
    }
  }, [sseEvents, handleNotification]);

  // Pending session return (for "Take More Photos" flow)
  const pendingSessionRef = useRef(null);

  // Session cache for preserving state across Home<->Session navigation
  // Key: sessionId, Value: { result, photos, intention, sessionData, blocks }
  const SESSION_CACHE_MAX = 10;
  const sessionCacheRef = useRef(new Map());

  // --- Auto-connect LiveKit on mount ---
  useEffect(() => {
    if (livekit.connectionState === 'disconnected') {
      livekit.connectAnonymous();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentional: only on mount

  // --- Camera enable/disable based on view ---
  useEffect(() => {
    if (!livekit.setCameraEnabled) return;
    if (viewState === 'camera') {
      livekit.setCameraEnabled(true);
    } else {
      livekit.setCameraEnabled(false);
    }
  }, [viewState, livekit.setCameraEnabled]);

  // D.1: Send page context to agent when view changes
  useEffect(() => {
    if (livekit.connectionState === 'connected' && livekit.sendPageContext) {
      livekit.sendPageContext(viewState);
    }
  }, [viewState, livekit.connectionState]);

  // D.3: Register navigation callback so agent can navigate user
  const handleAgentNavigate = useCallback((page) => {
    const validPages = ['camera', 'history', 'home', 'live-session', 'memory'];
    if (validPages.includes(page)) {
      setViewState(page);
    }
  }, []);

  useEffect(() => {
    if (livekit.setNavigateCallback) {
      livekit.setNavigateCallback(handleAgentNavigate);
    }
  }, [livekit.setNavigateCallback, handleAgentNavigate]);

  // --- Handlers ---
  const handleBackToHistory = () => {
    // Cache current session state before navigating away
    const cacheKey = sessionData?.sessionId;
    if (cacheKey) {
      sessionCacheRef.current.set(cacheKey, {
        result: liveResult,
        photos: capturedPhotos,
        intention: lastIntention,
        sessionData,
        _ts: Date.now(),
      });
      // Evict oldest entries if cache exceeds max
      if (sessionCacheRef.current.size > SESSION_CACHE_MAX) {
        let oldestKey = null;
        let oldestTs = Infinity;
        for (const [key, val] of sessionCacheRef.current) {
          if ((val._ts || 0) < oldestTs) {
            oldestTs = val._ts || 0;
            oldestKey = key;
          }
        }
        if (oldestKey) sessionCacheRef.current.delete(oldestKey);
      }
    }
    setViewState('home');
  };

  const handleOpenCamera = () => {
    setViewState('camera');
  };

  const handleOpenHistory = () => {
    setViewState('home');
  };

  const handleSelectSession = (useCaseData) => {
    const cacheKey = useCaseData.sessionId;
    // Restore from cache if available (preserves intermediate state including blocks)
    const cached = cacheKey ? sessionCacheRef.current.get(cacheKey) : null;
    if (cached) {
      setLiveResult(cached.result);
      setCapturedPhotos(cached.photos || []);
      setLastIntention(cached.intention || '');
      setSessionData(cached.sessionData);
    } else {
      setLiveResult(useCaseData.result || null);
      setCapturedPhotos(useCaseData.photos || []);
      setLastIntention(useCaseData.prompt || useCaseData.title || '');
      setSessionData({ ...useCaseData, fromHome: true });
    }
    setViewState('live-session');
  };

  // Called immediately when user clicks Done (result may be null — loading state)
  const handleViewResult = (result, photos, intention) => {
    // If returning from a "take more photos" flow, merge photos into existing session
    if (pendingSessionRef.current) {
      const pending = pendingSessionRef.current;
      pendingSessionRef.current = null;
      const mergedPhotos = [...(pending.photos || []), ...(photos || [])];
      setLiveResult(pending.result || result);
      setCapturedPhotos(mergedPhotos);
      setLastIntention(pending.intention || intention || '');
      setSessionData(pending.sessionData || null);
      setViewState('live-session');
      return;
    }
    setLiveResult(result);
    setCapturedPhotos(photos || []);
    setLastIntention(intention || '');
    setSessionData(null);
    setViewState('live-session');
  };

  // Clear a session from the cache (e.g., when deleted)
  const handleClearSessionCache = useCallback((sessionId) => {
    sessionCacheRef.current.delete(sessionId);
  }, []);

  // Called from session to take more photos and return to same session
  const handleAddPhotoToSession = useCallback(() => {
    pendingSessionRef.current = {
      result: liveResult,
      photos: capturedPhotos,
      intention: lastIntention,
      sessionData,
    };
    setViewState('camera');
  }, [liveResult, capturedPhotos, lastIntention, sessionData]);

  const handleProfileTap = () => {
    setViewState('memory');
  };

  return (
    <div className="flex flex-col items-center h-full overflow-hidden bg-black">
      <DeviceFrame>
        <div className="relative w-full h-full bg-black font-sans select-none">
          <AnimatePresence mode="wait">
            {viewState === 'camera' && (
              <LiveCameraView
                key="live-camera"
                livekit={livekit}
                onOpenHistory={handleOpenHistory}
                onViewResult={handleViewResult}
              />
            )}

            {viewState === 'live-session' && (
              <LiveSessionView
                key="live-session"
                result={liveResult}
                photos={capturedPhotos}
                intention={lastIntention}
                onBack={handleBackToHistory}
                livekit={livekit}
                sessionData={sessionData}
                onAddPhoto={handleAddPhotoToSession}
                sessionCacheRef={sessionCacheRef}
              />
            )}

            {viewState === 'home' && (
              <HistoryView
                key="home"
                isHome={true}
                onBack={handleBackToHistory}
                onOpenCamera={handleOpenCamera}
                onSelectSession={handleSelectSession}
                onProfileTap={handleProfileTap}
                onClearSessionCache={handleClearSessionCache}
                isAuthenticated={auth.isAuthenticated}
                user={auth.user}
                livekit={livekit}
                onNotification={handleNotification}
                memoryBadge={badges.memory}
                sseEvents={sseEvents}
                sseConnected={sseConnected}
              />
            )}

            {viewState === 'history' && (
              <HistoryView
                key="history"
                onOpenCamera={handleOpenCamera}
                onSelectSession={handleSelectSession}
                onProfileTap={handleProfileTap}
                onClearSessionCache={handleClearSessionCache}
                isAuthenticated={auth.isAuthenticated}
                user={auth.user}
                livekit={livekit}
                onNotification={handleNotification}
                memoryBadge={badges.memory}
                sseEvents={sseEvents}
                sseConnected={sseConnected}
              />
            )}

            {viewState === 'memory' && (
              <MemoryView
                key="memory"
                onBack={handleBackToHistory}
                livekit={livekit}
              />
            )}
          </AnimatePresence>

          {/* Global toast notifications */}
          <NotificationManager toasts={toasts} onDismiss={dismissToast} />
        </div>
      </DeviceFrame>
    </div>
  );
}

export default App;
