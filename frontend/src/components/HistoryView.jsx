import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, User, Loader2, Clock, CheckCircle2, AlertCircle, Sparkles, Mic, MicOff, Upload, Brain, ListTodo, Play } from 'lucide-react';
import useSound from '../hooks/useSound';
import { api } from '../services/api';
import { getShortTitle } from '../utils/text';

const POLL_INTERVAL = 10000;
const POLL_INTERVAL_SSE_ACTIVE = 30000; // Slow polling when SSE is active

// Status config for consistent rendering
const STATUS_CONFIG = {
    pending: {
        emoji: '\u23F3',
        label: 'Pending',
        color: 'text-yellow-400',
        bgGlow: 'from-yellow-500/20 to-transparent',
    },
    progress: {
        emoji: '',
        label: 'Processing',
        color: 'text-cyan-400',
        bgGlow: 'from-cyan-500/20 to-transparent',
    },
    complete: {
        emoji: '\u2705',
        label: 'Complete',
        color: 'text-green-400',
        bgGlow: 'from-green-500/20 to-transparent',
    },
    error: {
        emoji: '\u274C',
        label: 'Error',
        color: 'text-red-400',
        bgGlow: 'from-red-500/20 to-transparent',
    },
};

// Sub-state config for granular progress display
const SUB_STATE_CONFIG = {
    uploading: { icon: Upload, label: 'Uploading', color: 'text-blue-400' },
    analyzing: { icon: Brain, label: 'Analyzing', color: 'text-purple-400' },
    planning: { icon: ListTodo, label: 'Planning', color: 'text-cyan-400' },
    executing: { icon: Play, label: 'Executing', color: 'text-green-400' },
};

// Animated status indicator component
function StatusIndicator({ status, session }) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

    // Check for granular sub-state from session context
    const progressMsg = session?.context?.progress_message?.toLowerCase();
    if (status === 'progress' && progressMsg) {
        const subKey = Object.keys(SUB_STATE_CONFIG).find(k => progressMsg.includes(k));
        if (subKey) {
            const SubIcon = SUB_STATE_CONFIG[subKey].icon;
            return <SubIcon size={16} className={`${SUB_STATE_CONFIG[subKey].color} animate-pulse`} />;
        }
    }

    if (status === 'pending') {
        return (
            <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className=""
                style={{ fontSize: 'var(--text-base)' }}
            >
                {config.emoji}
            </motion.span>
        );
    }

    if (status === 'progress') {
        return (
            <Loader2 size={16} className="text-cyan-400 animate-spin" />
        );
    }

    return <span style={{ fontSize: 'var(--text-base)' }}>{config.emoji}</span>;
}

// Extract photo URLs from session context or prompt
function extractPhotos(session) {
    const photos = [];
    // Check context.photos array (set by agent_common.py)
    if (session.context?.photos) {
        if (Array.isArray(session.context.photos)) {
            photos.push(...session.context.photos);
        } else if (typeof session.context.photos === 'string') {
            const urls = session.context.photos.match(/https?:\/\/[^\s]+/g);
            if (urls) photos.push(...urls);
        }
    }
    // Fallback: extract S3 URLs from prompt text
    if (photos.length === 0 && session.prompt) {
        const urls = session.prompt.match(/https:\/\/storage\.googleapis\.com\/[^\s]+/g);
        if (urls) photos.push(...urls);
    }
    return photos;
}


// Active session card shown prominently at the top
function ActiveSessionCard({ session, onClick, onDismiss, formatDate }) {
    const photos = extractPhotos(session);
    const [, forceUpdate] = useState(0);

    // Timer to trigger re-render for timeout detection
    useEffect(() => {
        const timer = setInterval(() => forceUpdate(n => n + 1), 15000);
        return () => clearInterval(timer);
    }, []);

    const elapsed = session.created_at ? Date.now() - new Date(session.created_at).getTime() : 0;
    const isSlow = elapsed > 120000;   // > 2 minutes
    const isStale = elapsed > 600000;  // > 10 minutes

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={onClick}
            className="relative cursor-pointer active:scale-[0.98] transition-transform"
        >
            {/* Animated glow border */}
            <motion.div
                className="absolute -inset-[1px] rounded-2xl opacity-60"
                style={{
                    background: 'linear-gradient(135deg, rgba(6,182,212,0.4), rgba(147,51,234,0.4), rgba(6,182,212,0.4))',
                    backgroundSize: '200% 200%',
                }}
                animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />

            <div className="relative rounded-2xl bg-black/90 border border-white/10 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={14} className="text-cyan-400" />
                    <span className="font-semibold uppercase tracking-widest text-cyan-400" style={{ fontSize: 'var(--text-xs)' }}>
                        {session.status === 'pending' ? 'Queued' : 'Processing Now'}
                    </span>
                </div>

                {/* Photo thumbnails */}
                {photos.length > 0 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
                        {photos.slice(0, 4).map((url, i) => (
                            <div key={i} className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10">
                                <img src={url} alt="" className="w-full h-full object-cover" />
                            </div>
                        ))}
                    </div>
                )}

                <p className="text-white/90 font-medium leading-snug mb-2 line-clamp-2" style={{ fontSize: 'var(--text-base)' }}>
                    {getShortTitle(session.prompt) || 'Working on your request...'}
                </p>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <StatusIndicator status={session.status} session={session} />
                        <span className="text-white/40 line-clamp-1" style={{ fontSize: 'var(--text-xs)' }}>
                            {session.context?.progress_message || STATUS_CONFIG[session.status]?.label || 'Processing'}
                        </span>
                    </div>
                    <span className="text-white/25" style={{ fontSize: 'var(--text-xs)' }}>{formatDate(session.created_at)}</span>
                </div>

                {/* Progress bar for in-progress sessions */}
                {session.status === 'progress' && (
                    <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full"
                            initial={{ width: '0%' }}
                            animate={{ width: ['10%', '60%', '30%', '80%', '45%'] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    </div>
                )}

                {/* Timeout warnings */}
                {isStale && (
                    <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={12} className="text-red-400 shrink-0" />
                            <span className="text-red-300/80" style={{ fontSize: 'var(--text-xs)' }}>This session may have failed</span>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDismiss?.(session); }}
                            className="font-medium text-red-300 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                            style={{ fontSize: 'var(--text-xs)' }}
                        >
                            Dismiss
                        </button>
                    </div>
                )}
                {isSlow && !isStale && (
                    <p className="mt-2 text-yellow-400/60" style={{ fontSize: 'var(--text-xs)' }}>Taking longer than expected...</p>
                )}
            </div>
        </motion.div>
    );
}

export default function HistoryView({ onBack, onOpenCamera, onSelectSession, onProfileTap, onClearSessionCache, isAuthenticated, user, isHome, livekit, onNotification, memoryBadge, sseEvents = [], sseConnected = false }) {
    const { play } = useSound();
    const [liveSessions, setLiveSessions] = useState([]);
    const [loading, setLoading] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null); // session to confirm delete
    const pollRef = useRef(null);
    const mountedRef = useRef(true);
    const longPressTimerRef = useRef(null);
    const longPressStartRef = useRef(null);

    // Long-press handlers
    const handlePointerDown = useCallback((session, e) => {
        longPressStartRef.current = { x: e.clientX, y: e.clientY };
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            navigator.vibrate?.(50);
            setDeleteTarget(session);
        }, 500);
    }, []);

    const handlePointerMove = useCallback((e) => {
        if (!longPressTimerRef.current || !longPressStartRef.current) return;
        const dx = e.clientX - longPressStartRef.current.x;
        const dy = e.clientY - longPressStartRef.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handlePointerUp = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // Confirm delete from bottom sheet
    const confirmDeleteSession = useCallback(async () => {
        if (!deleteTarget) return;
        play('media.delete');
        const sessionId = deleteTarget.id;
        setLiveSessions(prev => prev.filter(t => t.id !== sessionId));
        setDeleteTarget(null);
        onClearSessionCache?.(sessionId);
        try { await api.deleteSession(sessionId); } catch (err) { console.error('Delete failed:', err); }
    }, [deleteTarget, play, onClearSessionCache]);

    // Fetch sessions (V3: unified — sessions are the single source of truth)
    const fetchSessions = useCallback(async (isInitial = false) => {
        // Guard: if not authenticated and no viUserId yet, defer
        const viUserId = api.getViUserId();
        if (!isAuthenticated && !api.getToken() && !viUserId) {
            if (isInitial) setLoading(true);
            return;
        }

        if (isInitial) setLoading(true);

        try {
            const sessions = await api.getSessions().catch(() => []);

            if (mountedRef.current) {
                const normalized = (sessions || []).map(s => ({
                    id: s.id,
                    prompt: s.prompt || s.title || s.intention || '',
                    status: s.status === 'completed' ? 'complete'
                        : s.status === 'dispatched' ? 'pending'
                            : s.status === 'failed' ? 'error'
                                : s.status || 'pending',
                    result: s.result || null,
                    created_at: s.started_at || s.dispatched_at || s.created_at,
                    context: { ...s.context, progress_message: s.progress_message },
                    title: s.title,
                    result_html: s.result_html,
                    result_summary: s.result_summary,
                    timeline: s.timeline || [],
                }));

                // Sort by created_at descending
                normalized.sort((a, b) => {
                    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return tb - ta;
                });
                setLiveSessions(normalized);
            }
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
            if (mountedRef.current && isInitial) setLiveSessions([]);
        } finally {
            if (mountedRef.current && isInitial) setLoading(false);
        }
    }, [isAuthenticated]);

    // Initial fetch + adaptive polling (slow when SSE active, normal otherwise)
    useEffect(() => {
        mountedRef.current = true;

        // Initial fetch
        fetchSessions(true);

        // Adaptive polling: 30s when SSE is active, 10s otherwise
        const interval = sseConnected ? POLL_INTERVAL_SSE_ACTIVE : POLL_INTERVAL;
        pollRef.current = setInterval(() => {
            fetchSessions(false);
        }, interval);

        return () => {
            mountedRef.current = false;
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [fetchSessions, sseConnected]);

    // Re-fetch when LiveKit connects and viUserId becomes available
    const prevSessionIdRef = useRef(null);
    useEffect(() => {
        if (livekit?.sessionId && livekit.sessionId !== prevSessionIdRef.current) {
            prevSessionIdRef.current = livekit.sessionId;
            // viUserId is now set — fetch sessions
            fetchSessions(liveSessions.length === 0);
        }
    }, [livekit?.sessionId, fetchSessions, liveSessions.length]);

    // Listen for real-time session events from LiveKit data channel
    // Note: Gateway DataChannel events use 'task_*' naming for historical reasons.
    // The task_id in these events corresponds to a session UUID in the backend.
    useEffect(() => {
        if (!livekit?.taskEvents || livekit.taskEvents.length === 0) return;

        const latest = livekit.taskEvents[livekit.taskEvents.length - 1];
        if (!latest) return;

        if (latest.type === 'task_started') {
            setLiveSessions(prev => {
                const exists = prev.some(t => t.id === latest.task_id);
                if (exists) return prev;
                return [{
                    id: latest.task_id,
                    prompt: latest.description,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                }, ...prev];
            });
        } else if (latest.type === 'task_progress') {
            setLiveSessions(prev => prev.map(t =>
                t.id === latest.task_id ? { ...t, status: 'progress' } : t
            ));
        } else if (latest.type === 'task_result') {
            setLiveSessions(prev => prev.map(t =>
                t.id === latest.task_id ? { ...t, status: latest.status || 'complete', result: latest.result } : t
            ));
        }
    }, [livekit?.taskEvents]);

    // Listen for SSE real-time events (when LiveKit is not connected)
    const lastSseEventRef = useRef(0);
    useEffect(() => {
        if (sseEvents.length === 0) return;
        const latest = sseEvents[sseEvents.length - 1];
        if (!latest || latest._ts <= lastSseEventRef.current) return;
        lastSseEventRef.current = latest._ts;

        if (latest.type === 'session_update') {
            const { session_id, status, progress_message, result_summary } = latest;
            if (!session_id) return;

            setLiveSessions(prev => {
                const idx = prev.findIndex(t => t.id === session_id);
                if (idx === -1) {
                    // New session we don't know about — fetch fresh
                    fetchSessions(false);
                    return prev;
                }
                const updated = [...prev];
                const entry = { ...updated[idx] };
                if (status === 'dispatched' || status === 'pending') {
                    entry.status = 'pending';
                } else if (status === 'progress' || status === 'processing') {
                    entry.status = 'progress';
                    if (progress_message) {
                        entry.context = { ...entry.context, progress_message };
                    }
                } else if (status === 'completed' || status === 'complete') {
                    entry.status = 'complete';
                    if (result_summary) {
                        entry.result = entry.result || { summary: result_summary };
                    }
                    onNotification?.({ type: 'session_complete', sessionId: session_id });
                } else if (status === 'failed' || status === 'error') {
                    entry.status = 'error';
                    onNotification?.({ type: 'session_failed', sessionId: session_id });
                }
                updated[idx] = entry;
                return updated;
            });
        } else if (latest.type === 'memory_update') {
            onNotification?.({ type: 'memory_update', ...latest });
        }
    }, [sseEvents, fetchSessions, onNotification]);

    // Format date
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    // Truncate result summary for preview
    const getResultPreview = (session) => {
        if (!session.result) return null;
        let text;
        if (typeof session.result === 'string') {
            text = session.result;
        } else if (session.result.type === 'html') {
            text = `Website generated (${(session.result.chars / 1000).toFixed(1)}k chars)`;
        } else if (session.result.summary) {
            text = session.result.summary;
        } else if (session.result.content) {
            text = typeof session.result.content === 'string' ? session.result.content : JSON.stringify(session.result.content);
        } else if (session.result.raw) {
            text = session.result.raw;
        } else if (session.result.text) {
            text = session.result.text;
        } else if (session.result.type === 'text' && session.result.summary) {
            text = session.result.summary;
        } else {
            text = JSON.stringify(session.result);
        }
        // Clean up code-like content
        text = text.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim();
        return text.length > 60 ? text.slice(0, 60) + '...' : text;
    };

    const filtered = liveSessions;

    // Separate active sessions (pending/progress) from completed
    const activeSessions = filtered.filter(t => t.status === 'pending' || t.status === 'progress');
    const completedSessions = filtered.filter(t => t.status === 'complete' || t.status === 'error');

    // Handle session click — pass full session data for LiveSessionView navigation
    const handleSessionClick = (session) => {
        play('nav.forward');
        const photos = extractPhotos(session);
        onSelectSession({
            title: getShortTitle(session.prompt),
            prompt: session.prompt || '',
            sessionId: session.id,
            fromHome: true,
            result: session.result || null,
            result_html: session.result_html || null,
            timeline: session.timeline || [],
            status: session.status,
            photos: photos.map(url => ({ type: 'photo', src: url })),
            context: session.context || null,
            created_at: session.created_at,
        });
    };

    return (
        <motion.div
            initial={isHome ? { opacity: 0 } : { x: '-100%' }}
            animate={isHome ? { opacity: 1 } : { x: 0 }}
            exit={isHome ? { opacity: 0 } : { x: '-100%' }}
            transition={isHome ? { duration: 0.3 } : { type: "spring", stiffness: 300, damping: 30 }}
            className="safe-area-top w-full h-full bg-black text-white p-6 relative z-40"
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent" style={{ fontSize: 'var(--text-2xl)' }}>{isHome ? 'Home' : 'History'}</h1>
                <button
                    onClick={() => { play('nav.forward'); onProfileTap?.(); }}
                    className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 hover:ring-2 hover:ring-white/20"
                    style={{
                        background: isAuthenticated
                            ? 'linear-gradient(135deg, rgba(147,51,234,0.5), rgba(6,182,212,0.5))'
                            : 'rgba(255,255,255,0.1)',
                    }}
                >
                    {isAuthenticated && user?.displayName ? (
                        <span className="text-white font-semibold" style={{ fontSize: 'var(--text-base)' }}>
                            {user.displayName.charAt(0).toUpperCase()}
                        </span>
                    ) : (
                        <User size={20} className="text-white/80" />
                    )}
                    {memoryBadge > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-purple-500 text-white font-bold px-1 border-2 border-black" style={{ fontSize: '10px' }}>
                            {memoryBadge > 9 ? '9+' : memoryBadge}
                        </span>
                    )}
                </button>
            </div>



            {/* Content */}
            <div className="pb-20 overflow-y-auto overflow-x-hidden max-h-[72vh] no-scrollbar"
                style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
                {loading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={24} className="text-white/30 animate-spin" />
                    </div>
                )}

                {!loading && liveSessions.length > 0 && (
                    <>
                        {/* Current Session section — active sessions at the top */}
                        <AnimatePresence>
                            {activeSessions.length > 0 && (
                                <div className="mb-2">
                                    <h2 className="text-white/40 font-semibold uppercase tracking-widest mb-3" style={{ fontSize: 'var(--text-sm)' }}>
                                        Current {activeSessions.length === 1 ? 'Session' : 'Sessions'}
                                    </h2>
                                    <div className="grid grid-cols-2 gap-3">
                                        {activeSessions.map((session) => (
                                            <div
                                                key={session.id}
                                                onPointerDown={(e) => handlePointerDown(session, e)}
                                                onPointerMove={handlePointerMove}
                                                onPointerUp={handlePointerUp}
                                                onPointerLeave={handlePointerUp}
                                            >
                                                <ActiveSessionCard
                                                    session={session}
                                                    onClick={() => handleSessionClick(session)}
                                                    onDismiss={(s) => {
                                                        play('media.delete');
                                                        setLiveSessions(prev => prev.filter(item => item.id !== s.id));
                                                        onClearSessionCache?.(s.id);
                                                        api.deleteSession(s.id).catch(err =>
                                                            console.error('Delete failed:', err)
                                                        );
                                                    }}
                                                    formatDate={formatDate}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </AnimatePresence>

                        {/* Completed / Error sessions — dual-column image cards */}
                        {completedSessions.length > 0 && (
                            <div className="mb-6">
                                <h2 className="text-white/40 font-semibold uppercase tracking-widest mb-3" style={{ fontSize: 'var(--text-sm)' }}>
                                    Recent Sessions
                                </h2>
                                <div className="grid grid-cols-2 gap-3">
                                    {completedSessions.map((session, index) => {
                                        const photos = extractPhotos(session);
                                        const heroImg = photos[0] || null;
                                        return (
                                            <motion.div
                                                key={session.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.8 }}
                                                transition={{ delay: index * 0.04 }}
                                                onClick={() => handleSessionClick(session)}
                                                onPointerDown={(e) => handlePointerDown(session, e)}
                                                onPointerMove={handlePointerMove}
                                                onPointerUp={handlePointerUp}
                                                onPointerLeave={handlePointerUp}
                                                className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all cursor-pointer active:scale-[0.97]"
                                            >
                                                {heroImg ? (
                                                    <img src={heroImg} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                                                ) : (
                                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-transparent" />
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                                                {!heroImg && (
                                                    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40" style={{ fontSize: 'var(--text-3xl)' }}>
                                                        {STATUS_CONFIG[session.status]?.emoji || ''}
                                                    </div>
                                                )}
                                                <div className="absolute bottom-3 left-3 right-3">
                                                    <p className="text-white font-semibold leading-snug line-clamp-2" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.8)', fontSize: 'var(--text-base)' }}>
                                                        {getShortTitle(session.prompt)}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 mt-1.5">
                                                        {session.status === 'error' && <AlertCircle size={10} className="text-red-400/80" />}
                                                        <span className="text-white/40" style={{ fontSize: 'var(--text-xs)' }}>{formatDate(session.created_at)}</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}



                {!loading && liveSessions.length === 0 && (
                    <div className="text-center py-8">
                        {!api.getViUserId() ? (
                            <>
                                <Loader2 size={24} className="text-white/20 animate-spin mx-auto mb-3" />
                                <p className="text-white/30" style={{ fontSize: 'var(--text-base)' }}>Connecting...</p>
                                <p className="text-white/20 mt-1" style={{ fontSize: 'var(--text-sm)' }}>Your sessions will appear here</p>
                            </>
                        ) : (
                            <>
                                <p className="text-white/30" style={{ fontSize: 'var(--text-base)' }}>No sessions yet</p>
                                <p className="text-white/20 mt-1" style={{ fontSize: 'var(--text-sm)' }}>Point your camera at something to get started</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Mic Toggle FAB */}
            <button
                onClick={() => { livekit?.ensureAudioContext?.(); play(livekit?.isMicEnabled ? 'mic.off' : 'mic.on'); livekit?.toggleMic?.(); }}
                className={`absolute bottom-4 md:bottom-8 left-6 w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 z-50 ${livekit?.isMicEnabled ? 'bg-white/10 border border-white/20 text-white/80' : 'bg-red-500/80 text-white border border-red-400/40'}`}
            >
                {livekit?.isMicEnabled ? <Mic size={24} /> : <MicOff size={24} />}
            </button>

            {/* Camera FAB */}
            <button
                onClick={() => { livekit?.ensureAudioContext?.(); play('nav.forward'); onOpenCamera ? onOpenCamera() : onBack?.(); }}
                className="absolute bottom-4 md:bottom-8 right-6 w-[4.5rem] h-[4.5rem] rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all z-50"
            >
                <Camera size={32} />
            </button>

            {/* Delete Confirmation Bottom Sheet */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
                        onClick={() => setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm mx-4 mb-8 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden"
                        >
                            <div className="p-4">
                                <p className="text-white/90 font-semibold mb-3 text-center" style={{ fontSize: 'var(--text-base)' }}>
                                    Delete this session?
                                </p>
                                <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                                    {(() => {
                                        const photos = extractPhotos(deleteTarget);
                                        return photos[0] ? (
                                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10">
                                                <img src={photos[0]} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ) : null;
                                    })()}
                                    <p className="text-white/60 line-clamp-2 leading-snug" style={{ fontSize: 'var(--text-sm)' }}>
                                        {getShortTitle(deleteTarget.prompt)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex border-t border-white/10">
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    className="flex-1 py-3 text-white/60 font-medium hover:bg-white/5 transition-colors"
                                    style={{ fontSize: 'var(--text-base)' }}
                                >
                                    Cancel
                                </button>
                                <div className="w-px bg-white/10" />
                                <button
                                    onClick={confirmDeleteSession}
                                    className="flex-1 py-3 text-red-400 font-medium hover:bg-red-500/10 transition-colors"
                                    style={{ fontSize: 'var(--text-base)' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
