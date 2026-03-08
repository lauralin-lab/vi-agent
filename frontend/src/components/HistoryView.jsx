import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Loader2, AlertCircle, Mic, MicOff, Eye, LayoutGrid, CalendarDays, Search } from 'lucide-react';
import useSound from '../hooks/useSound';
import { useImagePreloader } from '../hooks/useImagePreloader';
import { api } from '../services/api';
import { getShortTitle } from '../utils/text';
import PromotionBlock from './PromotionBlock';
import { IOS_SPRING } from '../constants';



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
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(timer);
    }, []);

    const elapsed = session.created_at ? now - new Date(session.created_at).getTime() : 0;
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
    onBack, onOpenCamera, onSelectSession, onProfileTap, onClearSessionCache, onOpenAllTasks,
    isAuthenticated, user, isHome, livekit, onNotification,
    sseEvents = [], sseConnected = false,
}) {
    const { play } = useSound();
    const [liveSessions, setLiveSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

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
                    status: s.status === 'completed' || s.status === 'ended' ? 'complete'
                        : s.status === 'dispatched' || s.status === 'created' ? 'pending'
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

    // Initial fetch only (no polling — SSE handles live updates)
    useEffect(() => {
        mountedRef.current = true;
        fetchSessions(true);
        return () => {
            mountedRef.current = false;
        };
    }, [fetchSessions]);

    // Re-fetch when LiveKit sessionId becomes available
    const prevSessionIdRef = useRef(null);
    useEffect(() => {
        if (livekit?.sessionId && livekit.sessionId !== prevSessionIdRef.current) {
            prevSessionIdRef.current = livekit.sessionId;
            fetchSessions(liveSessions.length === 0);
        }
    }, [livekit?.sessionId, fetchSessions, liveSessions.length]);

    // LiveKit DataChannel task events — process ALL unprocessed events
    const lastProcessedTaskEventIdx = useRef(0);
    useEffect(() => {
        if (!livekit?.taskEvents || livekit.taskEvents.length === 0) return;
        const events = livekit.taskEvents;
        const startIdx = lastProcessedTaskEventIdx.current;
        if (startIdx >= events.length) return;
        lastProcessedTaskEventIdx.current = events.length;

        let needsFetch = false;
        for (let i = startIdx; i < events.length; i++) {
            const ev = events[i];
            if (!ev) continue;

            if (ev.type === 'task_started') {
                setLiveSessions(prev => {
                    if (prev.some(t => t.id === ev.task_id)) return prev;
                    return [{ id: ev.task_id, prompt: ev.description, status: 'pending', created_at: new Date().toISOString() }, ...prev];
                });
            } else if (ev.type === 'task_progress') {
                setLiveSessions(prev => prev.map(t => t.id === ev.task_id ? { ...t, status: 'progress' } : t));
            } else if (ev.type === 'task_result') {
                setLiveSessions(prev => prev.map(t =>
                    t.id === ev.task_id ? { ...t, status: ev.status || 'complete', result: ev.result } : t
                ));
                needsFetch = true;
            }
        }
        if (needsFetch) fetchSessions(false);
    }, [livekit?.taskEvents, fetchSessions]);

    // SSE real-time events
    const lastSseEventRef = useRef(0);
    useEffect(() => {
        if (sseEvents.length === 0) return;
        const latest = sseEvents[sseEvents.length - 1];
        if (!latest || latest._ts <= lastSseEventRef.current) return;
        lastSseEventRef.current = latest._ts;

        if (latest.type === 'exec_start') {
            // New exec started — add session entry with photos for immediate display
            const { taskId, prompt, mediaUrls } = latest;
            if (!taskId) return;
            setLiveSessions(prev => {
                if (prev.some(t => t.id === taskId)) return prev;
                const context = {};
                if (mediaUrls && mediaUrls.length > 0) context.photos = mediaUrls;
                return [{ id: taskId, prompt: prompt || '', status: 'pending', created_at: new Date().toISOString(), context }, ...prev];
            });
            // Also fetch from DB to get the persisted session with proper ID
            fetchSessions(false);
        } else if (latest.type === 'exec_result') {
            // Execution completed — update matching session to complete
            const { taskId, summary } = latest;
            setLiveSessions(prev => {
                const updated = prev.map(t => {
                    if (t.id === taskId) return { ...t, status: 'complete', result: { summary } };
                    return t;
                });
                return updated;
            });
            onNotification?.({ type: 'session_complete', sessionId: taskId });
            // Re-fetch to get DB-persisted data
            fetchSessions(false);
        } else if (latest.type === 'exec_error') {
            // Execution failed — update matching session to error
            const { taskId } = latest;
            setLiveSessions(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: 'error' } : t
            ));
            onNotification?.({ type: 'session_failed', sessionId: taskId });
            fetchSessions(false);
        } else if (latest.type === 'exec_progress') {
            // Update progress on matching session
            const { taskId, message } = latest;
            setLiveSessions(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: 'progress', context: { ...t.context, progress_message: message } } : t
            ));
        } else if (latest.type === 'session_update') {
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

    // ── View mode state ──
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'gallery'
    const calendarScrollRef = useRef(null);

    // ── Calendar helpers ──
    const getCalendarDateKey = (dateStr) => {
        if (!dateStr) return 'unknown';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'unknown';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatTimestamp = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const activeSessions = liveSessions.filter(t => t.status === 'pending' || t.status === 'progress');
    const completedSessions = liveSessions.filter(t => t.status === 'complete' || t.status === 'error');

    // Map: dateKey -> sessions[] for calendar cell lookup
    const sessionsByDateKey = useMemo(() => {
        const map = {};
        completedSessions.forEach(session => {
            const key = getCalendarDateKey(session.created_at);
            if (!map[key]) map[key] = [];
            map[key].push(session);
        });
        return map;
    }, [completedSessions]);

    // Build calendar month grids (oldest first so newest is at scroll bottom)
    const allCalendarMonths = useMemo(() => {
        const monthSet = new Set();
        const now = new Date();
        monthSet.add(`${now.getFullYear()}-${now.getMonth()}`);
        completedSessions.forEach(session => {
            const d = new Date(session.created_at);
            if (!isNaN(d.getTime())) {
                monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
            }
        });
        const sorted = Array.from(monthSet).sort((a, b) => {
            const [ya, ma] = a.split('-').map(Number);
            const [yb, mb] = b.split('-').map(Number);
            return ya !== yb ? ya - yb : ma - mb;
        });
        return sorted.map(key => {
            const [year, month] = key.split('-').map(Number);
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const rows = [];
            let week = new Array(firstDay).fill(null);
            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                week.push({ day: d, dateKey });
                if (week.length === 7) { rows.push(week); week = []; }
            }
            if (week.length > 0) {
                while (week.length < 7) week.push(null);
                rows.push(week);
            }
            const label = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            return { year, month, label, rows };
        });
    }, [completedSessions]);

    const todayKey = useMemo(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }, []);

    // Auto-scroll calendar to bottom (most recent month) on initial mount only
    const hasAutoScrolled = useRef(false);
    useEffect(() => {
        if (viewMode === 'calendar' && calendarScrollRef.current && allCalendarMonths.length > 0 && !hasAutoScrolled.current) {
            hasAutoScrolled.current = true;
            // Use rAF to ensure DOM has rendered before scrolling
            requestAnimationFrame(() => {
                if (calendarScrollRef.current) {
                    calendarScrollRef.current.scrollTop = calendarScrollRef.current.scrollHeight;
                }
            });
        }
    }, [allCalendarMonths, viewMode]);

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
            {/* ═══ Single page-level scroll container ═══ */}
            <div
                ref={calendarScrollRef}
                className="w-full h-full"
                style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            >

                {/* ═══ Promotion Block — scrolls with page ═══ */}
                <PromotionBlock
                    onOpenCamera={onOpenCamera}
                    onOpenProfile={() => { play('nav.forward'); onProfileTap?.(); }}
                    user={user}
                    isAuthenticated={isAuthenticated}
                />

                {/* ═══ Main content ═══ */}
                <div className="px-3 space-y-4" style={{ paddingBottom: 120 }}>

                    {/* Loading */}
                    {loading && (
                        <div className="flex items-center justify-center py-14">
                            <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(0,0,0,0.2)' }} />
                        </div>
                    )}

                    {!loading && liveSessions.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                            className="overflow-hidden"
                            style={{
                                borderRadius: 24,
                                background: '#F7F7F9',
                                border: '1px solid rgba(0,0,0,0.04)',
                            }}
                        >
                            {/* ═══ MY TASKS — Sticky header ═══ */}
                            <div className="flex items-center justify-between px-4 pt-4 pb-2" style={{ flexShrink: 0 }}>
                                <span className="font-medium" style={{ fontSize: 14, color: '#000', letterSpacing: '-0.01em' }}>
                                    MY TASKS
                                </span>
                                <div className="flex items-center gap-1">
                                    {completedSessions.length > 0 && (
                                        <button
                                            onClick={() => {
                                                play('nav.forward');
                                                setViewMode(v => v === 'calendar' ? 'gallery' : 'calendar');
                                            }}
                                            className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
                                            title={viewMode === 'calendar' ? 'Gallery view' : 'Calendar view'}
                                        >
                                            {viewMode === 'calendar'
                                                ? <LayoutGrid size={16} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.4)' }} />
                                                : <CalendarDays size={16} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.4)' }} />
                                            }
                                        </button>
                                    )}
                                    {completedSessions.length > 0 && (
                                        <button
                                            onClick={() => { play('nav.forward'); onOpenAllTasks?.(); }}
                                            className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform"
                                        >
                                            <Search size={16} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.4)' }} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ═══ Content area — active + completed (no nested scroll) ═══ */}
                            <div>
                                {/* Active sessions — inside scroll */}
                                <AnimatePresence>
                                    {activeSessions.length > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.3 }}
                                            className="px-4 pb-4"
                                        >
                                            {activeSessions.map((session, i) => (
                                                <div
                                                    key={session.id}
                                                    style={{ marginTop: i > 0 ? 10 : 0 }}
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

                                            {/* Divider between active and completed */}
                                            {completedSessions.length > 0 && (
                                                <div className="mt-4 mx-2" style={{ height: 1, background: 'rgba(0,0,0,0.06)', borderRadius: 1 }} />
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Completed sessions — calendar or gallery */}
                                {completedSessions.length > 0 && (
                                    <AnimatePresence initial={false}>
                                        {viewMode === 'calendar' ? (
                                            <motion.div
                                                key="calendar-view"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.15 }}
                                                className="px-5"
                                            >
                                                {/* Day labels — part of calendar, scrolls with content */}
                                                <div className="grid grid-cols-7 pt-1 pb-3">
                                                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                                                        <div key={d} className="flex items-center justify-center">
                                                            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.3)', fontWeight: 500 }}>{d}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {allCalendarMonths.map((monthData, mi) => (
                                                    <div key={`${monthData.year}-${monthData.month}`} className={mi > 0 ? 'mt-8' : ''}>
                                                        {allCalendarMonths.length > 1 && (
                                                            <div className="text-center mb-2">
                                                                <span className="font-medium" style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)' }}>
                                                                    {monthData.label}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {monthData.rows.map((week, wi) => (
                                                            <div key={wi} className="grid grid-cols-7 gap-[12px] mb-[12px]">
                                                                {week.map((cell, ci) => {
                                                                    if (!cell) return <div key={`empty-${ci}`} />;
                                                                    const sessions = sessionsByDateKey[cell.dateKey] || [];
                                                                    const hasHistory = sessions.length > 0;
                                                                    const heroImg = hasHistory ? extractPhotos(sessions[0])[0] : null;
                                                                    const isToday = cell.dateKey === todayKey;
                                                                    const isPast = cell.dateKey < todayKey;
                                                                    return (
                                                                        <motion.button
                                                                            key={cell.dateKey}
                                                                            whileTap={{ scale: 0.9 }}
                                                                            onClick={() => hasHistory ? (() => { play('nav.forward'); sessions.length === 1 ? handleSessionClick(sessions[0]) : onOpenAllTasks?.(cell.dateKey); })() : null}
                                                                            className="relative overflow-hidden flex items-center justify-center"
                                                                            style={{
                                                                                aspectRatio: '1',
                                                                                borderRadius: 10,
                                                                                background: isToday ? '#000' : (isPast && !hasHistory) ? '#EEEEF0' : 'transparent',
                                                                                cursor: hasHistory ? 'pointer' : 'default',
                                                                            }}
                                                                        >
                                                                            {heroImg && (
                                                                                <img src={heroImg} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ borderRadius: 10 }} />
                                                                            )}
                                                                            {heroImg && (
                                                                                <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10 }} />
                                                                            )}
                                                                            {hasHistory && !heroImg && (
                                                                                <div className="absolute inset-0" style={{ background: '#E5E5EA', borderRadius: 10 }} />
                                                                            )}
                                                                            <span
                                                                                className="relative z-10 font-semibold"
                                                                                style={{
                                                                                    fontSize: 13,
                                                                                    color: isToday || heroImg ? '#fff'
                                                                                        : isPast ? 'rgba(0,0,0,0.35)'
                                                                                            : 'rgba(0,0,0,0.8)',
                                                                                }}
                                                                            >
                                                                                {cell.day}
                                                                            </span>
                                                                        </motion.button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="gallery-view"
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.15 }}
                                                className="px-3"
                                            >
                                                <div className="space-y-2.5">
                                                    {completedSessions.map((session) => {
                                                        const photos = extractPhotos(session);
                                                        const heroImg = photos[0] || null;
                                                        return (
                                                            <div
                                                                key={session.id}
                                                                onClick={() => handleSessionClick(session)}
                                                                onPointerDown={e => handlePointerDown(session, e)}
                                                                onPointerMove={handlePointerMove}
                                                                onPointerUp={handlePointerUp}
                                                                onPointerLeave={handlePointerUp}
                                                                className="flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-all"
                                                                style={{
                                                                    borderRadius: 16,
                                                                    background: '#fff',
                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.04)',
                                                                }}
                                                            >
                                                                {heroImg && (
                                                                    <div
                                                                        className="w-14 h-14 overflow-hidden flex-shrink-0"
                                                                        style={{ borderRadius: 12 }}
                                                                    >
                                                                        <img
                                                                            src={heroImg}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p
                                                                        className="line-clamp-2"
                                                                        style={{
                                                                            fontSize: 14,
                                                                            fontWeight: 500,
                                                                            color: '#000',
                                                                            lineHeight: 1.35,
                                                                            letterSpacing: '-0.01em',
                                                                            margin: 0,
                                                                        }}
                                                                    >
                                                                        {getShortTitle(session.prompt)}
                                                                    </p>
                                                                    <span
                                                                        style={{
                                                                            fontSize: 10,
                                                                            color: 'rgba(0,0,0,0.3)',
                                                                            marginTop: 4,
                                                                            display: 'block',
                                                                        }}
                                                                    >
                                                                        {formatTimestamp(session.created_at)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                )}
                            </div>
                        </motion.div>
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
