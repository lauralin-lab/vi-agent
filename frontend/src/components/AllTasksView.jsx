import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import useSound from '../hooks/useSound';
import { getShortTitle } from '../utils/text';
import { IOS_SPRING } from '../constants';

// ── NanoClaw API (same as PlaygroundView) ──

async function fetchSessionHistory() {
    const res = await fetch('/nanoclaw/api/dashboard/sessions/history');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.sessions || [];
}

// ── Group flat task list into sessions (same logic as PlaygroundView) ──

function groupIntoSessions(tasks) {
    const map = {};
    for (const t of tasks) {
        const sid = t.sessionId || 'unknown';
        if (!map[sid]) map[sid] = { sessionId: sid, tasks: [], latestTs: 0 };
        map[sid].tasks.push(t);
        if ((t.ts || 0) > map[sid].latestTs) map[sid].latestTs = t.ts || 0;
    }
    return Object.values(map).sort((a, b) => b.latestTs - a.latestTs);
}

// ── Extract photos from task mediaUrls ──

function extractSessionPhotos(session) {
    const photos = [];
    for (const task of session.tasks) {
        if (task.mediaUrls?.length) {
            for (const url of task.mediaUrls) {
                if (!photos.includes(url)) photos.push(url);
            }
        }
    }
    return photos;
}

// ── Get session display title from first task prompt ──

function getSessionTitle(session) {
    const firstTask = session.tasks[0];
    return firstTask?.prompt || '(no prompt)';
}

// ── Get latest result text from session tasks ──

function getSessionResult(session) {
    // Look through tasks in reverse order for the last result
    for (let i = session.tasks.length - 1; i >= 0; i--) {
        const t = session.tasks[i];
        if (t.result) return t.result;
    }
    return null;
}

const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getCalendarDate = (ts) => {
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getCalendarDateKey = (ts) => {
    if (!ts) return 'unknown';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'unknown';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AllTasksView({ onBack, onSelectSession, scrollToDateKey = null, isAuthenticated }) {
    const { play } = useSound();
    const [sessions, setSessions] = useState([]);
    const scrollRef = useRef(null);
    const dateRefs = useRef({});

    // Fetch sessions from NanoClaw session history API
    useEffect(() => {
        fetchSessionHistory()
            .then(tasks => {
                const grouped = groupIntoSessions(tasks);
                setSessions(grouped);
            })
            .catch(err => {
                console.error('AllTasksView: failed to fetch session history:', err);
            });
    }, [isAuthenticated]);

    // Group by date (newest first)
    const dateGroups = useMemo(() => {
        const groups = {};
        sessions.forEach(session => {
            const key = getCalendarDateKey(session.latestTs);
            if (!groups[key]) groups[key] = { key, label: getCalendarDate(session.latestTs) || 'Unknown', sessions: [] };
            groups[key].sessions.push(session);
        });
        return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
    }, [sessions]);

    // Scroll to target date after render
    useEffect(() => {
        if (scrollToDateKey && dateRefs.current[scrollToDateKey]) {
            setTimeout(() => {
                dateRefs.current[scrollToDateKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 350);
        }
    }, [scrollToDateKey, dateGroups]);

    const handleSessionClick = useCallback((session) => {
        play('nav.forward');
        const photos = extractSessionPhotos(session);
        const title = getSessionTitle(session);
        const result = getSessionResult(session);
        onSelectSession?.({
            sessionId: session.sessionId,
            prompt: title,
            result: result,
            photos,
            title: title,
        });
    }, [play, onSelectSession]);

    return (
        <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={IOS_SPRING}
            className="w-full h-full relative z-50 flex flex-col overflow-hidden"
            style={{ background: '#F2F2F7' }}
        >
            {/* Header — fixed at top */}
            <div
                className="flex-shrink-0 flex items-center gap-3 px-4"
                style={{
                    paddingTop: 'max(60px, calc(env(safe-area-inset-top, 16px) + 44px))',
                    paddingBottom: 12,
                    background: '#F2F2F7',
                }}
            >
                <motion.button
                    onClick={() => { play('nav.back'); onBack?.(); }}
                    whileTap={{ scale: 0.85 }}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.05)' }}
                >
                    <ChevronLeft size={18} strokeWidth={2} style={{ color: 'rgba(0,0,0,0.5)' }} />
                </motion.button>
                <span className="font-semibold" style={{ fontSize: 17, color: '#000' }}>All Tasks</span>
            </div>

            {/* Scrollable timeline */}
            <div
                ref={scrollRef}
                className="w-full flex-1 min-h-0 overflow-y-auto px-4"
                style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 120 }}
            >
                {dateGroups.map((group, gi) => (
                    <div
                        key={group.key}
                        ref={el => { dateRefs.current[group.key] = el; }}
                        className="flex gap-4 mb-0"
                    >
                        {/* Left: timeline dot + dashed line */}
                        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
                            <div
                                className="w-[10px] h-[10px] rounded-full flex-shrink-0 mt-1"
                                style={{ background: '#000' }}
                            />
                            {gi < dateGroups.length - 1 && (
                                <div className="flex-1" style={{ width: 0, borderLeft: '1.5px dashed rgba(0,0,0,0.12)', minHeight: 40 }} />
                            )}
                        </div>

                        {/* Right: date label + session cards */}
                        <div className="flex-1 min-w-0 pb-6">
                            <span
                                className="font-medium block mb-3"
                                style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}
                            >
                                {group.label}
                            </span>

                            <div className="space-y-2.5">
                                {group.sessions.map((session) => {
                                    const photos = extractSessionPhotos(session);
                                    const heroImg = photos[0] || null;
                                    const title = getSessionTitle(session);
                                    return (
                                        <div
                                            key={session.sessionId}
                                            onClick={() => handleSessionClick(session)}
                                            className="flex items-center gap-3 p-3 cursor-pointer active:scale-[0.98] transition-all group"
                                            style={{
                                                borderRadius: 18,
                                                background: '#fff',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.03)',
                                            }}
                                        >
                                            {/* Text */}
                                            <div className="flex-1 min-w-0">
                                                <span
                                                    className="block mb-1"
                                                    style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.02em' }}
                                                >
                                                    {formatTimestamp(session.latestTs)}
                                                </span>
                                                <p className="font-medium leading-snug line-clamp-2" style={{ fontSize: 14, color: '#000', letterSpacing: '-0.01em' }}>
                                                    {getShortTitle(title)}
                                                </p>
                                            </div>

                                            {/* Thumbnail */}
                                            {heroImg && (
                                                <div
                                                    className="w-14 h-14 overflow-hidden flex-shrink-0"
                                                    style={{ borderRadius: 14 }}
                                                >
                                                    <img
                                                        src={heroImg}
                                                        alt=""
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom fade gradient */}
            <div
                className="absolute bottom-0 left-0 right-0 h-28 pointer-events-none z-40"
                style={{ background: 'linear-gradient(to top, #F2F2F7 30%, transparent)' }}
            />
        </motion.div>
    );
}
