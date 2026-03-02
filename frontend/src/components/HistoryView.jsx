import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, User, Loader2, AlertCircle, Sparkles, Mic, MicOff, Upload, Brain, ListTodo, Play, Eye } from 'lucide-react';
import useSound from '../hooks/useSound';
import { api } from '../services/api';
import { getShortTitle } from '../utils/text';

const POLL_INTERVAL = 10000;
const POLL_INTERVAL_SSE_ACTIVE = 30000;

const STATUS_CONFIG = {
    pending: {
        emoji: '⏳',
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
        emoji: '✅',
        label: 'Complete',
        color: 'text-green-400',
        bgGlow: 'from-green-500/20 to-transparent',
    },
    error: {
        emoji: '❌',
        label: 'Error',
        color: 'text-red-400',
        bgGlow: 'from-red-500/20 to-transparent',
    },
};

const SUB_STATE_CONFIG = {
    uploading: { icon: Upload,   label: 'Uploading', color: 'text-blue-400'   },
    analyzing: { icon: Brain,    label: 'Analyzing', color: 'text-purple-400' },
    planning:  { icon: ListTodo, label: 'Planning',  color: 'text-cyan-400'   },
    executing: { icon: Play,     label: 'Executing', color: 'text-green-400'  },
};

function StatusIndicator({ status, session }) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const progressMsg = session?.context?.progress_message?.toLowerCase();

    if (status === 'progress' && progressMsg) {
        const subKey = Object.keys(SUB_STATE_CONFIG).find(k => progressMsg.includes(k));
        if (subKey) {
            const SubIcon = SUB_STATE_CONFIG[subKey].icon;
            return <SubIcon size={13} className={`${SUB_STATE_CONFIG[subKey].color} animate-pulse`} />;
        }
    }

    if (status === 'pending') {
        return (
            <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                style={{ fontSize: '13px' }}
            >
                {config.emoji}
            </motion.span>
        );
    }

    if (status === 'progress') {
        return <Loader2 size={13} className="text-cyan-400 animate-spin" />;
    }

    return <span style={{ fontSize: '13px' }}>{config.emoji}</span>;
}

function extractPhotos(session) {
    const photos = [];
    if (session.context?.photos) {
        if (Array.isArray(session.context.photos)) {
            photos.push(...session.context.photos);
        } else if (typeof session.context.photos === 'string') {
            const urls = session.context.photos.match(/https?:\/\/[^\s]+/g);
            if (urls) photos.push(...urls);
        }
    }
    if (photos.length === 0 && session.prompt) {
        const urls = session.prompt.match(/https:\/\/storage\.googleapis\.com\/[^\s]+/g);
        if (urls) photos.push(...urls);
    }
    return photos;
}

// ─── Active session card ────────────────────────────────────────────────────
function ActiveSessionCard({ session, onClick, onDismiss, formatDate }) {
    const photos = extractPhotos(session);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => forceUpdate(n => n + 1), 15000);
        return () => clearInterval(timer);
    }, []);

    const elapsed = session.created_at ? Date.now() - new Date(session.created_at).getTime() : 0;
    const isSlow  = elapsed > 120000;
    const isStale = elapsed > 600000;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={onClick}
            className="relative cursor-pointer active:scale-[0.98] transition-transform"
        >
            {/* Animated gradient glow border */}
            <motion.div
                className="absolute -inset-[1px] rounded-2xl"
                style={{
                    background: 'linear-gradient(135deg, rgba(6,182,212,0.5), rgba(147,51,234,0.5), rgba(6,182,212,0.5))',
                    backgroundSize: '200% 200%',
                    opacity: 0.65,
                }}
                animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />

            <div
                className="relative rounded-2xl overflow-hidden"
                style={{ background: 'rgba(10,10,10,0.96)', backdropFilter: 'blur(20px)' }}
            >
                {/* Hero photo strip */}
                {photos.length > 0 && (
                    <div className="relative h-24 overflow-hidden">
                        <img
                            src={photos[0]}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover opacity-45"
                        />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 20%, rgba(10,10,10,0.9) 100%)' }} />
                        {photos.length > 1 && (
                            <div className="absolute bottom-2 right-2 flex gap-1">
                                {photos.slice(1, 4).map((url, i) => (
                                    <div key={i} className="w-7 h-7 rounded-lg overflow-hidden border border-white/10">
                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="p-3">
                    {/* Badge */}
                    <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles size={11} className="text-cyan-400" />
                        <span
                            className="font-mono font-semibold uppercase tracking-[0.14em] text-cyan-400"
                            style={{ fontSize: '9px' }}
                        >
                            {session.status === 'pending' ? 'Queued' : 'Processing Now'}
                        </span>
                    </div>

                    <p className="text-white/90 font-medium leading-snug mb-2.5 line-clamp-2" style={{ fontSize: '13px' }}>
                        {getShortTitle(session.prompt) || 'Working on your request...'}
                    </p>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <StatusIndicator status={session.status} session={session} />
                            <span className="text-white/40 line-clamp-1 font-mono" style={{ fontSize: '10px' }}>
                                {session.context?.progress_message || STATUS_CONFIG[session.status]?.label || 'Processing'}
                            </span>
                        </div>
                        <span className="text-white/25 font-mono" style={{ fontSize: '10px' }}>
                            {formatDate(session.created_at)}
                        </span>
                    </div>

                    {/* Progress bar */}
                    {session.status === 'progress' && (
                        <div className="mt-2.5 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <motion.div
                                className="h-full rounded-full"
                                style={{ background: 'linear-gradient(90deg, #06b6d4, #a855f7)' }}
                                initial={{ width: '0%' }}
                                animate={{ width: ['10%', '60%', '30%', '80%', '45%'] }}
                                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </div>
                    )}

                    {/* Timeout warnings */}
                    {isStale && (
                        <div className="mt-2.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
                            <div className="flex items-center gap-1.5">
                                <AlertCircle size={11} className="text-red-400 shrink-0" />
                                <span className="text-red-300/80" style={{ fontSize: '10px' }}>Session may have failed</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDismiss?.(session); }}
                                className="font-medium text-red-300 px-2 py-0.5 rounded-full hover:bg-red-500/20 transition-colors"
                                style={{ fontSize: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}
                            >
                                Dismiss
                            </button>
                        </div>
                    )}
                    {isSlow && !isStale && (
                        <p className="mt-2 text-yellow-400/60" style={{ fontSize: '10px' }}>
                            Taking longer than expected...
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function HistoryView({
    onBack, onOpenCamera, onSelectSession, onProfileTap, onClearSessionCache,
    isAuthenticated, user, isHome, livekit, onNotification, memoryBadge,
    sseEvents = [], sseConnected = false,
}) {
    const { play } = useSound();
    const [liveSessions, setLiveSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const pollRef            = useRef(null);
    const mountedRef         = useRef(true);
    const longPressTimerRef  = useRef(null);
    const longPressStartRef  = useRef(null);

    // ── Long-press handlers ──
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

    const confirmDeleteSession = useCallback(async () => {
        if (!deleteTarget) return;
        play('media.delete');
        const sessionId = deleteTarget.id;
        setLiveSessions(prev => prev.filter(t => t.id !== sessionId));
        setDeleteTarget(null);
        onClearSessionCache?.(sessionId);
        try { await api.deleteSession(sessionId); } catch (err) { console.error('Delete failed:', err); }
    }, [deleteTarget, play, onClearSessionCache]);

    // ── Fetch sessions ──
    const fetchSessions = useCallback(async (isInitial = false) => {
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
                        : s.status === 'dispatched'  ? 'pending'
                        : s.status === 'failed'       ? 'error'
                        : s.status || 'pending',
                    result:     s.result || null,
                    created_at: s.started_at || s.dispatched_at || s.created_at,
                    context:    { ...s.context, progress_message: s.progress_message },
                    title:        s.title,
                    result_html:  s.result_html,
                    result_summary: s.result_summary,
                    timeline:   s.timeline || [],
                }));
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

    // Initial fetch + adaptive polling
    useEffect(() => {
        mountedRef.current = true;
        fetchSessions(true);
        const interval = sseConnected ? POLL_INTERVAL_SSE_ACTIVE : POLL_INTERVAL;
        pollRef.current = setInterval(() => fetchSessions(false), interval);
        return () => {
            mountedRef.current = false;
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
    }, [fetchSessions, sseConnected]);

    // Re-fetch when LiveKit sessionId becomes available
    const prevSessionIdRef = useRef(null);
    useEffect(() => {
        if (livekit?.sessionId && livekit.sessionId !== prevSessionIdRef.current) {
            prevSessionIdRef.current = livekit.sessionId;
            fetchSessions(liveSessions.length === 0);
        }
    }, [livekit?.sessionId, fetchSessions, liveSessions.length]);

    // LiveKit DataChannel task events
    useEffect(() => {
        if (!livekit?.taskEvents || livekit.taskEvents.length === 0) return;
        const latest = livekit.taskEvents[livekit.taskEvents.length - 1];
        if (!latest) return;

        if (latest.type === 'task_started') {
            setLiveSessions(prev => {
                if (prev.some(t => t.id === latest.task_id)) return prev;
                return [{ id: latest.task_id, prompt: latest.description, status: 'pending', created_at: new Date().toISOString() }, ...prev];
            });
        } else if (latest.type === 'task_progress') {
            setLiveSessions(prev => prev.map(t => t.id === latest.task_id ? { ...t, status: 'progress' } : t));
        } else if (latest.type === 'task_result') {
            setLiveSessions(prev => prev.map(t =>
                t.id === latest.task_id ? { ...t, status: latest.status || 'complete', result: latest.result } : t
            ));
        }
    }, [livekit?.taskEvents]);

    // SSE real-time events
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
                if (idx === -1) { fetchSessions(false); return prev; }
                const updated = [...prev];
                const entry   = { ...updated[idx] };
                if (status === 'dispatched' || status === 'pending') {
                    entry.status = 'pending';
                } else if (status === 'progress' || status === 'processing') {
                    entry.status = 'progress';
                    if (progress_message) entry.context = { ...entry.context, progress_message };
                } else if (status === 'completed' || status === 'complete') {
                    entry.status = 'complete';
                    if (result_summary) entry.result = entry.result || { summary: result_summary };
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

    // ── Helpers ──
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const now  = new Date();
        const diff = now - d;
        if (diff < 60000)    return 'Just now';
        if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const handleSessionClick = (session) => {
        play('nav.forward');
        const photos = extractPhotos(session);
        onSelectSession({
            title:      getShortTitle(session.prompt),
            prompt:     session.prompt || '',
            sessionId:  session.id,
            fromHome:   true,
            result:     session.result || null,
            result_html: session.result_html || null,
            timeline:   session.timeline || [],
            status:     session.status,
            photos:     photos.map(url => ({ type: 'photo', src: url })),
            context:    session.context || null,
            created_at: session.created_at,
        });
    };

    const activeSessions    = liveSessions.filter(t => t.status === 'pending' || t.status === 'progress');
    const completedSessions = liveSessions.filter(t => t.status === 'complete' || t.status === 'error');

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <motion.div
            initial={isHome ? { opacity: 0 } : { x: '-100%' }}
            animate={isHome ? { opacity: 1 } : { x: 0 }}
            exit={isHome   ? { opacity: 0 } : { x: '-100%' }}
            transition={isHome
                ? { duration: 0.35, ease: [0.23, 1, 0.32, 1] }
                : { type: 'spring', stiffness: 300, damping: 30 }}
            className="w-full h-full text-white relative z-40 texture-grain overflow-hidden"
            style={{ background: '#0a0a0a' }}
        >
            {/* ═══ Scrollable content ═══ */}
            <div className="w-full h-full overflow-y-auto precision-scroll pb-32">

                {/* ═══ Hero Header ═══ */}
                <div className="relative px-5 overflow-hidden">
                    {/* Ambient radial glow */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: 'radial-gradient(ellipse at 25% 0%, rgba(147,51,234,0.11) 0%, transparent 60%), radial-gradient(ellipse at 85% 30%, rgba(6,182,212,0.07) 0%, transparent 55%)',
                        }}
                    />

                    <div
                        className="relative flex items-end justify-between pb-5"
                        style={{ paddingTop: 'max(3.5rem, calc(env(safe-area-inset-top, 0px) + 2rem))' }}
                    >
                        <div>
                            <p className="font-mono font-semibold text-white/25 tracking-[0.25em] uppercase mb-1.5" style={{ fontSize: '9px' }}>
                                Visual Intelligence
                            </p>
                            <h1
                                className="font-bold tracking-tight leading-none"
                                style={{
                                    fontSize: '26px',
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.55))',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                }}
                            >
                                {isHome ? 'Sessions' : 'History'}
                            </h1>
                        </div>

                        {/* Profile button */}
                        <button
                            onClick={() => { play('nav.forward'); onProfileTap?.(); }}
                            className="relative w-10 h-10 rounded-full flex items-center justify-center border border-white/[0.10] active:scale-90 transition-all hover:border-white/[0.18]"
                            style={{
                                background: isAuthenticated
                                    ? 'linear-gradient(135deg, rgba(147,51,234,0.32), rgba(6,182,212,0.28))'
                                    : 'rgba(255,255,255,0.06)',
                            }}
                        >
                            {isAuthenticated && user?.displayName ? (
                                <span className="text-white font-semibold" style={{ fontSize: '13px' }}>
                                    {user.displayName.charAt(0).toUpperCase()}
                                </span>
                            ) : (
                                <User size={17} strokeWidth={1.8} className="text-white/60" />
                            )}
                            {memoryBadge > 0 && (
                                <span
                                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-purple-500 text-white font-bold border-2 px-0.5"
                                    style={{ fontSize: '9px', borderColor: '#0a0a0a' }}
                                >
                                    {memoryBadge > 9 ? '9+' : memoryBadge}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Subtle divider */}
                    <div className="h-px mb-5" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02), transparent)' }} />
                </div>

                {/* ═══ Main content ═══ */}
                <div className="px-5 space-y-6">

                    {/* Loading */}
                    {loading && (
                        <div className="flex items-center justify-center py-14">
                            <Loader2 size={20} className="text-white/20 animate-spin" />
                        </div>
                    )}

                    {!loading && liveSessions.length > 0 && (
                        <>
                            {/* Active sessions */}
                            <AnimatePresence>
                                {activeSessions.length > 0 && (
                                    <div className="space-y-3">
                                        <span
                                            className="font-mono font-semibold text-white/30 tracking-[0.2em] uppercase px-0.5"
                                            style={{ fontSize: '9px' }}
                                        >
                                            Active · {activeSessions.length}
                                        </span>
                                        {activeSessions.map(session => (
                                            <div
                                                key={session.id}
                                                onPointerDown={e => handlePointerDown(session, e)}
                                                onPointerMove={handlePointerMove}
                                                onPointerUp={handlePointerUp}
                                                onPointerLeave={handlePointerUp}
                                            >
                                                <ActiveSessionCard
                                                    session={session}
                                                    onClick={() => handleSessionClick(session)}
                                                    onDismiss={s => {
                                                        play('media.delete');
                                                        setLiveSessions(prev => prev.filter(item => item.id !== s.id));
                                                        onClearSessionCache?.(s.id);
                                                        api.deleteSession(s.id).catch(err => console.error('Delete failed:', err));
                                                    }}
                                                    formatDate={formatDate}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </AnimatePresence>

                            {/* Completed sessions — 2-column image grid */}
                            {completedSessions.length > 0 && (
                                <div>
                                    <span
                                        className="font-mono font-semibold text-white/30 tracking-[0.2em] uppercase px-0.5 mb-3 block"
                                        style={{ fontSize: '9px' }}
                                    >
                                        Recent · {completedSessions.length}
                                    </span>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {completedSessions.map((session, index) => {
                                            const photos  = extractPhotos(session);
                                            const heroImg = photos[0] || null;
                                            return (
                                                <motion.div
                                                    key={session.id}
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.85 }}
                                                    transition={{ delay: index * 0.04, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                                                    onClick={() => handleSessionClick(session)}
                                                    onPointerDown={e => handlePointerDown(session, e)}
                                                    onPointerMove={handlePointerMove}
                                                    onPointerUp={handlePointerUp}
                                                    onPointerLeave={handlePointerUp}
                                                    className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer active:scale-[0.97] transition-all duration-200"
                                                    style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                                                >
                                                    {heroImg ? (
                                                        <img
                                                            src={heroImg}
                                                            alt=""
                                                            loading="lazy"
                                                            className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-300"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0" style={{
                                                            background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                                                        }} />
                                                    )}
                                                    {/* Dark gradient overlay */}
                                                    <div className="absolute inset-0" style={{
                                                        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 30%, rgba(0,0,0,0.15) 70%, transparent 100%)',
                                                    }} />
                                                    {/* Subtle inner border */}
                                                    <div className="absolute inset-0 rounded-2xl" style={{ border: '1px solid rgba(255,255,255,0.04)' }} />

                                                    {!heroImg && (
                                                        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-25" style={{ fontSize: '26px' }}>
                                                            {STATUS_CONFIG[session.status]?.emoji || ''}
                                                        </div>
                                                    )}
                                                    <div className="absolute bottom-2.5 left-2.5 right-2.5">
                                                        <p
                                                            className="text-white/90 font-medium leading-snug line-clamp-2 tracking-tight"
                                                            style={{ fontSize: '12px', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}
                                                        >
                                                            {getShortTitle(session.prompt)}
                                                        </p>
                                                        <div className="flex items-center gap-1 mt-1.5">
                                                            {session.status === 'error' && (
                                                                <AlertCircle size={9} className="text-red-400/80" />
                                                            )}
                                                            <span className="text-white/35 font-mono" style={{ fontSize: '9px' }}>
                                                                {formatDate(session.created_at)}
                                                            </span>
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

                    {/* ═══ Empty state ═══ */}
                    {!loading && liveSessions.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.8, delay: 0.15 }}
                            className="flex flex-col items-center justify-center px-6 pt-8 pb-10 relative"
                        >
                            {/* Ambient glow */}
                            <motion.div
                                className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full pointer-events-none"
                                style={{ background: 'radial-gradient(circle, rgba(100,60,255,0.05) 0%, transparent 70%)' }}
                                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
                                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                            />

                            {/* Animated eye icon */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.3 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3, type: 'spring', stiffness: 180, damping: 18 }}
                                className="relative mb-8"
                            >
                                {/* Outer ring */}
                                <motion.div
                                    className="absolute rounded-full"
                                    style={{ inset: '-20px', border: '1px solid rgba(140,120,255,0.07)' }}
                                    animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                {/* Middle ring */}
                                <motion.div
                                    className="absolute rounded-full"
                                    style={{ inset: '-10px', border: '1px solid rgba(140,120,255,0.12)' }}
                                    animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.8, 0.4] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                                />
                                {/* Core circle */}
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(145deg, rgba(120,90,255,0.08), rgba(60,40,150,0.04))',
                                        border: '1px solid rgba(140,120,255,0.12)',
                                        boxShadow: '0 0 30px rgba(100,60,255,0.06), inset 0 0 20px rgba(100,60,255,0.03)',
                                    }}
                                >
                                    <motion.div
                                        animate={{ scale: [1, 1.1, 1] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                        <Eye size={30} strokeWidth={1} className="text-purple-300/25" />
                                    </motion.div>
                                </div>
                                {/* Orbiting dot 1 */}
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                                    className="absolute"
                                    style={{ inset: '-14px' }}
                                >
                                    <motion.div
                                        className="w-1.5 h-1.5 rounded-full absolute top-0 left-1/2 -translate-x-1/2"
                                        style={{
                                            background: 'radial-gradient(circle, rgba(140,120,255,0.6), transparent)',
                                            boxShadow: '0 0 6px rgba(140,120,255,0.3)',
                                        }}
                                        animate={{ opacity: [0.4, 1, 0.4] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                    />
                                </motion.div>
                                {/* Orbiting dot 2 — counter-rotate */}
                                <motion.div
                                    animate={{ rotate: -360 }}
                                    transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                                    className="absolute"
                                    style={{ inset: '-24px' }}
                                >
                                    <motion.div
                                        className="w-1 h-1 rounded-full absolute bottom-0 left-1/2 -translate-x-1/2"
                                        style={{
                                            background: 'radial-gradient(circle, rgba(80,160,255,0.5), transparent)',
                                            boxShadow: '0 0 4px rgba(80,160,255,0.2)',
                                        }}
                                        animate={{ opacity: [0.3, 0.8, 0.3] }}
                                        transition={{ duration: 3, repeat: Infinity }}
                                    />
                                </motion.div>
                            </motion.div>

                            {/* Text + CTA */}
                            {!api.getViUserId() ? (
                                <>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.45 }}
                                        className="font-semibold text-center leading-snug tracking-tight mb-2"
                                        style={{
                                            fontSize: '16px',
                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.5), rgba(180,170,255,0.35))',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                        }}
                                    >
                                        Connecting...
                                    </motion.p>
                                    <p className="text-white/20 text-center font-light leading-relaxed" style={{ fontSize: '11px' }}>
                                        Your sessions will appear here
                                    </p>
                                </>
                            ) : (
                                <>
                                    <motion.p
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.45, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                                        className="font-bold text-center leading-snug tracking-tight max-w-[230px] mb-2"
                                        style={{
                                            fontSize: '17px',
                                            background: 'linear-gradient(145deg, rgba(255,255,255,0.60), rgba(180,170,255,0.40), rgba(255,255,255,0.35))',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                        }}
                                    >
                                        The AI That Sees For You
                                    </motion.p>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.55, duration: 0.6 }}
                                        className="text-white/22 text-center font-light leading-relaxed max-w-[210px] mb-8"
                                        style={{ fontSize: '11px' }}
                                    >
                                        Point your camera at something to begin your first AI visual session
                                    </motion.p>
                                    <motion.button
                                        onClick={() => { play('nav.forward'); onOpenCamera?.(); }}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.65, type: 'spring', stiffness: 200, damping: 18 }}
                                        whileTap={{ scale: 0.90 }}
                                        whileHover={{ scale: 1.04 }}
                                        className="flex items-center gap-2.5 px-5 py-2.5 rounded-full relative overflow-hidden"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(120,90,255,0.12), rgba(60,140,255,0.08))',
                                            border: '1px solid rgba(140,120,255,0.18)',
                                            boxShadow: '0 4px 20px rgba(100,60,255,0.08)',
                                        }}
                                    >
                                        {/* Shimmer sweep */}
                                        <motion.div
                                            className="absolute inset-0"
                                            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)' }}
                                            animate={{ x: ['-100%', '200%'] }}
                                            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
                                        />
                                        <Camera size={14} strokeWidth={1.8} className="text-purple-300/60 relative z-10" />
                                        <span className="font-medium text-purple-200/60 tracking-wide relative z-10" style={{ fontSize: '12px' }}>
                                            Start exploring
                                        </span>
                                    </motion.button>
                                </>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>

            {/* ═══ Bottom fade ═══ */}
            <div
                className="absolute bottom-0 left-0 right-0 h-28 pointer-events-none z-40"
                style={{ background: 'linear-gradient(to top, #0a0a0a 30%, transparent)' }}
            />

            {/* ═══ Mic FAB ═══ */}
            <div className="absolute z-50" style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))', left: '1.25rem' }}>
                <motion.button
                    onClick={() => {
                        livekit?.ensureAudioContext?.();
                        play(livekit?.isMicEnabled ? 'mic.off' : 'mic.on');
                        livekit?.toggleMic?.();
                    }}
                    whileTap={{ scale: 0.85 }}
                    className="w-14 h-14 rounded-full flex items-center justify-center border transition-all"
                    style={{
                        background: livekit?.isMicEnabled ? 'rgba(255,255,255,0.07)' : 'rgba(239,68,68,0.12)',
                        borderColor: livekit?.isMicEnabled ? 'rgba(255,255,255,0.10)' : 'rgba(239,68,68,0.22)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    }}
                >
                    {livekit?.isMicEnabled
                        ? <Mic    size={20} strokeWidth={1.8} className="text-white/55" />
                        : <MicOff size={20} strokeWidth={1.8} className="text-red-400"  />
                    }
                </motion.button>
            </div>

            {/* ═══ Camera FAB ═══ */}
            <div className="absolute z-50" style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))', right: '1.25rem' }}>
                <motion.button
                    onClick={() => {
                        livekit?.ensureAudioContext?.();
                        play('nav.forward');
                        onOpenCamera ? onOpenCamera() : onBack?.();
                    }}
                    whileTap={{ scale: 0.85 }}
                    whileHover={{ scale: 1.06 }}
                    className="w-16 h-16 rounded-full flex items-center justify-center transition-all"
                    style={{
                        background: 'rgba(255,255,255,0.92)',
                        color: '#0a0a0a',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.10)',
                    }}
                >
                    <Camera size={24} strokeWidth={1.8} />
                </motion.button>
            </div>

            {/* ═══ Delete confirmation bottom sheet ═══ */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-end justify-center"
                        style={{ background: 'rgba(0,0,0,0.65)' }}
                        onClick={() => setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm mx-4 mb-8 rounded-2xl overflow-hidden"
                            style={{
                                background: '#111111',
                                border: '1px solid rgba(255,255,255,0.08)',
                                boxShadow: '0 -4px 30px rgba(0,0,0,0.5)',
                            }}
                        >
                            <div className="p-4">
                                <p className="text-white/85 font-semibold mb-3 text-center" style={{ fontSize: '14px' }}>
                                    Delete this session?
                                </p>
                                <div
                                    className="flex items-center gap-3 rounded-xl p-3"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                    {(() => {
                                        const photos = extractPhotos(deleteTarget);
                                        return photos[0] ? (
                                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                                                <img src={photos[0]} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ) : null;
                                    })()}
                                    <p className="text-white/50 line-clamp-2 leading-snug" style={{ fontSize: '12px' }}>
                                        {getShortTitle(deleteTarget.prompt)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    className="flex-1 py-3.5 text-white/50 font-medium hover:bg-white/[0.04] transition-colors"
                                    style={{ fontSize: '13px' }}
                                >
                                    Cancel
                                </button>
                                <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)' }} />
                                <button
                                    onClick={confirmDeleteSession}
                                    className="flex-1 py-3.5 text-red-400 font-medium hover:bg-red-500/[0.07] transition-colors"
                                    style={{ fontSize: '13px' }}
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
