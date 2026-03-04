import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Loader2, AlertCircle, Mic, MicOff, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import useSound from '../hooks/useSound';
import { useImagePreloader } from '../hooks/useImagePreloader';
import { api } from '../services/api';
import { getShortTitle } from '../utils/text';
import PromotionBlock from './PromotionBlock';


const POLL_INTERVAL = 10000;
const POLL_INTERVAL_SSE_ACTIVE = 30000;

// ── iOS spring config ──
const IOS_SPRING = { type: 'spring', stiffness: 340, damping: 32 };

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

// ── Active session card — iOS light ──
function ActiveSessionCard({ session, onClick, onDismiss, formatDate }) {
    const photos = extractPhotos(session);
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => forceUpdate(n => n + 1), 15000);
        return () => clearInterval(timer);
    }, []);

    const elapsed = session.created_at ? Date.now() - new Date(session.created_at).getTime() : 0;
    const isStale = elapsed > 600000;

    const statusLabel = session.status === 'pending' ? 'Queued' : 'Processing';

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={IOS_SPRING}
            onClick={onClick}
            className="cursor-pointer active:scale-[0.98] transition-transform"
            style={{
                background: '#fff',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
            }}
        >
            {/* Hero photo */}
            {photos.length > 0 && (
                <div className="relative" style={{ height: 120 }}>
                    <img
                        src={photos[0]}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ opacity: 0.85 }}
                    />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(255,255,255,0.95) 100%)' }} />
                </div>
            )}

            <div className="px-5 py-4">
                {/* Status pill */}
                <div className="flex items-center gap-2 mb-2">
                    <motion.div
                        className="w-2 h-2 rounded-full"
                        style={{ background: '#000' }}
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <span
                        className="font-semibold tracking-wide uppercase"
                        style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.08em' }}
                    >
                        {statusLabel}
                    </span>
                </div>

                <p className="font-semibold leading-snug line-clamp-2" style={{ fontSize: 15, color: '#000' }}>
                    {getShortTitle(session.prompt) || 'Working on your request…'}
                </p>

                <div className="flex items-center justify-between mt-3">
                    <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)' }}>
                        {formatDate(session.created_at)}
                    </span>
                </div>

                {/* Progress bar */}
                {session.status === 'progress' && (
                    <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                        <motion.div
                            className="h-full rounded-full"
                            style={{ background: '#000' }}
                            initial={{ width: '0%' }}
                            animate={{ width: ['10%', '60%', '30%', '80%', '45%'] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    </div>
                )}

                {/* Stale warning */}
                {isStale && (
                    <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-2xl"
                        style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center gap-1.5">
                            <AlertCircle size={11} className="shrink-0" style={{ color: 'rgba(0,0,0,0.35)' }} />
                            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>Session may have failed</span>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDismiss?.(session); }}
                            className="font-medium px-2.5 py-0.5 rounded-full active:scale-95 transition-transform"
                            style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', background: 'rgba(0,0,0,0.05)' }}
                        >
                            Dismiss
                        </button>
                    </div>
                )}
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

    const pollRef = useRef(null);
    const mountedRef = useRef(true);
    const longPressTimerRef = useRef(null);
    const longPressStartRef = useRef(null);

    // ── Preload all session photos into browser cache ──
    const allPhotoUrls = useMemo(() => {
        return liveSessions.flatMap(s => extractPhotos(s));
    }, [liveSessions]);
    useImagePreloader(allPhotoUrls);

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
            if (isInitial) {
                setLiveSessions([]);
                setLoading(false);
            }
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
                const entry = { ...updated[idx] };
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
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

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

    // ── Timeline grouping ──
    const GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'];
    const getTimelineGroup = (dateStr) => {
        if (!dateStr) return 'Earlier';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Earlier';

        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

        if (d >= startOfToday) return 'Today';
        if (d >= startOfYesterday) return 'Yesterday';
        if (d >= startOfWeek) return 'This Week';
        return 'Earlier';
    };

    const [expandedGroups, setExpandedGroups] = useState({ 'Today': true, 'Yesterday': true });
    const toggleGroup = (groupName) => {
        setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
    };

    const groupedSessions = useMemo(() => {
        const groups = {};
        liveSessions.forEach(session => {
            const group = getTimelineGroup(session.created_at);
            if (!groups[group]) groups[group] = [];
            groups[group].push(session);
        });
        return groups;
    }, [liveSessions]);

    const activeSessions = liveSessions.filter(t => t.status === 'pending' || t.status === 'progress');
    const completedSessions = liveSessions.filter(t => t.status === 'complete' || t.status === 'error');

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <motion.div
            initial={isHome ? { opacity: 0 } : { x: '-100%' }}
            animate={isHome ? { opacity: 1 } : { x: 0 }}
            exit={isHome ? { opacity: 0 } : { x: '-100%' }}
            transition={isHome
                ? { duration: 0.35, ease: [0.23, 1, 0.32, 1] }
                : IOS_SPRING}
            className="w-full h-full relative z-40 overflow-hidden"
            style={{ background: '#F2F2F7' }}
        >
            {/* ═══ Scrollable content ═══ */}
            <div className="w-full h-full overflow-y-auto pb-32" style={{ WebkitOverflowScrolling: 'touch' }}>

                {/* ═══ Promotion Block ═══ */}
                <PromotionBlock
                    onOpenCamera={onOpenCamera}
                    onOpenProfile={() => { play('nav.forward'); onProfileTap?.(); }}
                    user={user}
                    isAuthenticated={isAuthenticated}
                />

                {/* ═══ Main content ═══ */}
                <div className="px-3 space-y-4">

                    {/* Loading */}
                    {loading && (
                        <div className="flex items-center justify-center py-14">
                            <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(0,0,0,0.2)' }} />
                        </div>
                    )}

                    {!loading && liveSessions.length > 0 && (
                        <>
                            {/* Active sessions — still show prominently */}
                            <AnimatePresence>
                                {activeSessions.length > 0 && (
                                    <div className="space-y-3 mb-4">
                                        <span
                                            className="font-semibold tracking-wide uppercase px-1 block"
                                            style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', letterSpacing: '0.06em' }}
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

                            {/* Date-grouped completed sessions */}
                            {completedSessions.length > 0 && (
                                <div className="space-y-3">
                                    <span
                                        className="font-semibold tracking-wide uppercase px-1 block"
                                        style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', letterSpacing: '0.06em' }}
                                    >
                                        History · {completedSessions.length}
                                    </span>

                                    {GROUP_ORDER.map(groupName => {
                                        const items = groupedSessions[groupName];
                                        if (!items || items.length === 0) return null;
                                        // Only show completed sessions in timeline groups
                                        const completedItems = items.filter(s => s.status === 'complete' || s.status === 'error');
                                        if (completedItems.length === 0) return null;

                                        const isExpanded = !!expandedGroups[groupName];

                                        return (
                                            <motion.div
                                                key={groupName}
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                                className="overflow-hidden"
                                                style={{
                                                    borderRadius: 20,
                                                    background: '#fff',
                                                    border: '1px solid rgba(0,0,0,0.04)',
                                                }}
                                            >
                                                {/* Group header */}
                                                <button
                                                    onClick={() => toggleGroup(groupName)}
                                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.01] active:bg-black/[0.02] transition-colors"
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="font-semibold tracking-wide" style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)' }}>
                                                            {groupName}
                                                        </span>
                                                        <span
                                                            className="font-medium px-1.5 py-0.5"
                                                            style={{ fontSize: 10, color: 'rgba(0,0,0,0.2)', background: 'rgba(0,0,0,0.03)', borderRadius: 8 }}
                                                        >
                                                            {completedItems.length}
                                                        </span>
                                                    </div>
                                                    <motion.div
                                                        animate={{ rotate: isExpanded ? 0 : -90 }}
                                                        transition={{ duration: 0.2 }}
                                                    >
                                                        <ChevronDown size={14} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.2)' }} />
                                                    </motion.div>
                                                </button>

                                                {/* Group items */}
                                                <AnimatePresence initial={false}>
                                                    {isExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                                            className="overflow-hidden"
                                                        >
                                                            <div className="px-1 pb-1.5">
                                                                {completedItems.map((session, index) => {
                                                                    const photos = extractPhotos(session);
                                                                    const heroImg = photos[0] || null;
                                                                    return (
                                                                        <motion.div
                                                                            key={session.id}
                                                                            initial={{ opacity: 0, x: -8 }}
                                                                            animate={{ opacity: 1, x: 0 }}
                                                                            transition={{
                                                                                delay: index * 0.04,
                                                                                duration: 0.3,
                                                                                ease: [0.23, 1, 0.32, 1]
                                                                            }}
                                                                            onClick={() => handleSessionClick(session)}
                                                                            onPointerDown={e => handlePointerDown(session, e)}
                                                                            onPointerMove={handlePointerMove}
                                                                            onPointerUp={handlePointerUp}
                                                                            onPointerLeave={handlePointerUp}
                                                                            className="flex items-center gap-3.5 px-3 py-2.5 mx-1 cursor-pointer active:scale-[0.98] transition-all duration-200 group"
                                                                            style={{ borderRadius: 16 }}
                                                                        >
                                                                            {/* Thumbnail */}
                                                                            <div
                                                                                className="w-12 h-12 overflow-hidden flex-shrink-0 relative"
                                                                                style={{ borderRadius: 14, background: 'rgba(0,0,0,0.03)' }}
                                                                            >
                                                                                {heroImg ? (
                                                                                    <img
                                                                                        src={heroImg}
                                                                                        alt={getShortTitle(session.prompt)}
                                                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                                                    />
                                                                                ) : (
                                                                                    <div className="w-full h-full flex items-center justify-center">
                                                                                        <Eye size={18} strokeWidth={1.2} style={{ color: 'rgba(0,0,0,0.12)' }} />
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* Text content */}
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="font-medium truncate leading-tight" style={{ fontSize: 13, color: 'rgba(0,0,0,0.75)' }}>
                                                                                    {getShortTitle(session.prompt)}
                                                                                </p>
                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                    {session.status === 'error' && (
                                                                                        <AlertCircle size={9} style={{ color: 'rgba(255,59,48,0.5)' }} />
                                                                                    )}
                                                                                    <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)' }}>
                                                                                        {formatDate(session.created_at)}
                                                                                    </span>
                                                                                </div>
                                                                            </div>

                                                                            {/* Arrow */}
                                                                            <ChevronRight size={14} strokeWidth={1.8} className="flex-shrink-0 group-hover:opacity-50 transition-opacity" style={{ color: 'rgba(0,0,0,0.12)' }} />
                                                                        </motion.div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* ═══ Empty state ═══ */}
                    {!loading && liveSessions.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="flex flex-col items-center justify-center px-6 pt-10 pb-12"
                        >
                            {/* Simple icon */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3, ...IOS_SPRING }}
                                className="mb-6 w-20 h-20 rounded-full flex items-center justify-center"
                                style={{ background: 'rgba(0,0,0,0.04)' }}
                            >
                                <Eye size={32} strokeWidth={1.2} style={{ color: 'rgba(0,0,0,0.18)' }} />
                            </motion.div>

                            {/* Text + CTA */}
                            {!api.getViUserId() ? (
                                <>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.45 }}
                                        className="font-semibold text-center leading-snug tracking-tight mb-1"
                                        style={{ fontSize: 17, color: 'rgba(0,0,0,0.65)' }}
                                    >
                                        Connecting…
                                    </motion.p>
                                    <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.3)' }} className="text-center">
                                        Your sessions will appear here
                                    </p>
                                </>
                            ) : (
                                <>
                                    <motion.p
                                        initial={{ opacity: 0, y: 14 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.45, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                                        className="font-bold text-center leading-snug tracking-tight max-w-[240px] mb-2"
                                        style={{ fontSize: 20, color: '#000' }}
                                    >
                                        The AI That Sees For You
                                    </motion.p>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.55, duration: 0.5 }}
                                        className="text-center max-w-[220px] mb-8"
                                        style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', lineHeight: 1.5 }}
                                    >
                                        Point your camera at something to begin your first session
                                    </motion.p>
                                    <motion.button
                                        onClick={() => { play('nav.forward'); onOpenCamera?.(); }}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.65, ...IOS_SPRING }}
                                        whileTap={{ scale: 0.92 }}
                                        whileHover={{ scale: 1.03 }}
                                        className="flex items-center gap-2.5 px-6 py-3 rounded-full"
                                        style={{
                                            background: '#000',
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                                        }}
                                    >
                                        <Camera size={16} strokeWidth={2} className="text-white" />
                                        <span className="font-semibold text-white" style={{ fontSize: 14 }}>
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
                style={{ background: 'linear-gradient(to top, #F2F2F7 30%, transparent)' }}
            />

            {/* ═══ Mic FAB ═══ */}
            <div className="absolute z-50" style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))', left: '1.25rem' }}>
                <motion.button
                    onClick={() => {
                        livekit?.ensureAudioContext?.();
                        play(livekit?.isMicEnabled ? 'mic.off' : 'mic.on');
                        livekit?.toggleMic?.();
                    }}
                    whileTap={{ scale: 0.88 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                    style={{
                        background: livekit?.isMicEnabled ? '#fff' : 'rgba(0,0,0,0.06)',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
                    }}
                >
                    {livekit?.isMicEnabled
                        ? <Mic size={18} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.55)' }} />
                        : <MicOff size={18} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.3)' }} />
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
                    whileTap={{ scale: 0.88 }}
                    whileHover={{ scale: 1.04 }}
                    className="w-14 h-14 rounded-full flex items-center justify-center transition-all"
                    style={{
                        background: '#000',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    }}
                >
                    <Camera size={22} strokeWidth={2} className="text-white" />
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
                        style={{ background: 'rgba(0,0,0,0.25)' }}
                        onClick={() => setDeleteTarget(null)}
                    >
                        <motion.div
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            transition={IOS_SPRING}
                            onClick={e => e.stopPropagation()}
                            className="w-full max-w-sm mx-4 mb-8 overflow-hidden"
                            style={{
                                borderRadius: 20,
                                background: '#fff',
                                boxShadow: '0 -4px 40px rgba(0,0,0,0.12)',
                            }}
                        >
                            <div className="p-5">
                                <p className="font-semibold mb-3 text-center" style={{ fontSize: 15, color: '#000' }}>
                                    Delete this session?
                                </p>
                                <div
                                    className="flex items-center gap-3 rounded-2xl p-3"
                                    style={{ background: 'rgba(0,0,0,0.03)' }}
                                >
                                    {(() => {
                                        const photos = extractPhotos(deleteTarget);
                                        return photos[0] ? (
                                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0"
                                                style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
                                                <img src={photos[0]} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ) : null;
                                    })()}
                                    <p className="line-clamp-2 leading-snug" style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)' }}>
                                        {getShortTitle(deleteTarget.prompt)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    className="flex-1 py-3.5 font-medium hover:bg-black/[0.02] transition-colors"
                                    style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}
                                >
                                    Cancel
                                </button>
                                <div style={{ width: 1, background: 'rgba(0,0,0,0.06)' }} />
                                <button
                                    onClick={confirmDeleteSession}
                                    className="flex-1 py-3.5 font-semibold hover:bg-black/[0.02] transition-colors"
                                    style={{ fontSize: 14, color: '#000' }}
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
