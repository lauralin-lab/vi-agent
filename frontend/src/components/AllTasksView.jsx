import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import useSound from '../hooks/useSound';
import { api } from '../services/api';
import { getShortTitle } from '../utils/text';
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

const formatTimestamp = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getCalendarDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getCalendarDateKey = (dateStr) => {
    if (!dateStr) return 'unknown';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'unknown';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AllTasksView({ onBack, onSelectSession, scrollToDateKey = null, isAuthenticated }) {
    const { play } = useSound();
    const [sessions, setSessions] = useState([]);
    const scrollRef = useRef(null);
    const dateRefs = useRef({});

    // Fetch sessions
    useEffect(() => {
        const viUserId = api.getViUserId();
        if (!isAuthenticated && !api.getToken() && !viUserId) return;
        api.getSessions().then(raw => {
            const normalized = (raw || [])
                .map(s => ({
                    id: s.id,
                    prompt: s.prompt || s.title || s.intention || '',
                    status: s.status === 'completed' || s.status === 'ended' ? 'complete'
                        : s.status === 'dispatched' ? 'pending'
                            : s.status === 'failed' ? 'error'
                                : s.status || 'pending',
                    created_at: s.started_at || s.dispatched_at || s.created_at,
                    context: s.context,
                    title: s.title,
                    result_html: s.result_html,
                    result_summary: s.result_summary,
                    timeline: s.timeline || [],
                }))
                .filter(s => s.status === 'complete' || s.status === 'error')
                .sort((a, b) => {
                    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return tb - ta;
                });
            setSessions(normalized);
        }).catch(() => {});
    }, [isAuthenticated]);

    // Group by date (newest first)
    const dateGroups = useMemo(() => {
        const groups = {};
        sessions.forEach(session => {
            const key = getCalendarDateKey(session.created_at);
            if (!groups[key]) groups[key] = { key, label: getCalendarDate(session.created_at) || 'Unknown', sessions: [] };
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
        const photos = extractPhotos(session);
        onSelectSession?.({
            sessionId: session.id,
            prompt: session.prompt,
            result: session.result_html || session.result_summary || null,
            photos,
            title: session.title || session.prompt,
            timeline: session.timeline,
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
                                    const photos = extractPhotos(session);
                                    const heroImg = photos[0] || null;
                                    return (
                                        <div
                                            key={session.id}
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
                                                    {formatTimestamp(session.created_at)}
                                                </span>
                                                <p className="font-medium leading-snug line-clamp-2" style={{ fontSize: 14, color: '#000', letterSpacing: '-0.01em' }}>
                                                    {getShortTitle(session.prompt)}
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
