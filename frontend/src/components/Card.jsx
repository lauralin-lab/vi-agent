import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Highlight keywords: capitalised words, quoted phrases, question marks context
function renderHighlightedText(text, isMicOn) {
    if (!text) return null;
    const parts = text.split(/(\b[A-Z][a-zA-Z]{2,}\b|"[^"]+"|'[^']+'|\S+\?)/g);
    return parts.map((part, i) => {
        const isQuoted = /^["'][^"']+["']$/.test(part);
        const isCapitalized = /^[A-Z][a-zA-Z]{2,}$/.test(part);
        const isQuestion = /\S+\?$/.test(part);

        if (isQuoted || isCapitalized || isQuestion) {
            const highlightColor = isMicOn
                ? 'text-purple-200 font-semibold'
                : 'text-cyan-200 font-semibold';
            return (
                <span key={i} className={highlightColor}>
                    {part}
                </span>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

// ── Agent Status State Machine ──
// 7 states: offline, weak_connection, connecting, listening, thinking, viewing, waiting
const AGENT_STATUS_CONFIG = {
    offline: { emoji: '', label: 'Offline', dotColor: 'bg-red-400/80', textColor: 'text-red-400/80', glowColor: 'rgba(248,113,113,0.3)' },
    weak_connection: { emoji: '', label: 'Weak Signal', dotColor: 'bg-yellow-400/80', textColor: 'text-yellow-400/80', glowColor: 'rgba(250,204,21,0.3)' },
    connecting: { emoji: '', label: 'Connecting', dotColor: 'bg-blue-400/80', textColor: 'text-blue-400/80', glowColor: 'rgba(96,165,250,0.3)', pulse: true },
    listening: { emoji: '🎧', label: 'Listening', dotColor: 'bg-purple-400/80', textColor: 'text-purple-400/80', glowColor: 'rgba(192,132,252,0.3)' },
    thinking: { emoji: '🧠', label: 'Thinking', dotColor: 'bg-cyan-400/80', textColor: 'text-cyan-400/80', glowColor: 'rgba(34,211,238,0.3)', pulse: true },
    viewing: { emoji: '👁️', label: 'Viewing', dotColor: 'bg-cyan-400/80', textColor: 'text-cyan-400/80', glowColor: 'rgba(34,211,238,0.3)' },
    waiting: { emoji: '✨', label: 'Ready', dotColor: 'bg-green-400/80', textColor: 'text-green-400/80', glowColor: 'rgba(74,222,128,0.3)' },
};

export function computeAgentStatus({ agentIdentity, greetingReceived, userSpeaking, agentGenerating, cameraActive, connectionQuality }) {
    if (!agentIdentity) return 'offline';
    if (connectionQuality === 'lost') return 'weak_connection';
    if (!greetingReceived) return 'connecting';
    if (userSpeaking) return 'listening';
    if (agentGenerating) return 'thinking';
    if (cameraActive) return 'viewing';
    return 'waiting';
}

function Card({ isVisible, text, isMicOn = false, agentStatus = null, hasAgent = true, computedStatus = null }) {
    const [displayedText, setDisplayedText] = useState('');
    const prevTextRef = useRef('');
    const streamIntervalRef = useRef(null);

    // Streaming typewriter effect: when text changes, stream in new characters
    useEffect(() => {
        clearInterval(streamIntervalRef.current);

        const prev = prevTextRef.current;
        const next = text || '';

        // Find common prefix length
        let commonLen = 0;
        while (commonLen < prev.length && commonLen < next.length && prev[commonLen] === next[commonLen]) {
            commonLen++;
        }

        // If shrinking or same, snap immediately
        if (next.length <= prev.length && commonLen >= next.length) {
            setDisplayedText(next);
            prevTextRef.current = next;
            return;
        }

        // Stream in from common prefix
        let currentIdx = commonLen;
        setDisplayedText(next.slice(0, commonLen));

        streamIntervalRef.current = setInterval(() => {
            currentIdx++;
            if (currentIdx >= next.length) {
                setDisplayedText(next);
                prevTextRef.current = next;
                clearInterval(streamIntervalRef.current);
            } else {
                setDisplayedText(next.slice(0, currentIdx));
            }
        }, 25); // ~40 chars/sec

        return () => clearInterval(streamIntervalRef.current);
    }, [text]);

    const fontSize = 'var(--text-base)';
    const isStreaming = displayedText !== text;

    // Determine status to display: prefer computedStatus (state machine), fall back to legacy
    const status = computedStatus || (hasAgent ? (isMicOn ? 'listening' : 'viewing') : 'offline');
    const statusConfig = AGENT_STATUS_CONFIG[status] || AGENT_STATUS_CONFIG.viewing;

    return (
        <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{
                y: isVisible ? 0 : 30,
                opacity: isVisible ? 1 : 0,
            }}
            transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
                delay: 0.1
            }}
            className="relative w-auto max-w-[90%] z-50"
        >
            <div className="bg-black/30 backdrop-blur-2xl rounded-2xl px-4 py-3 text-center">
                {/* Status label — state machine driven */}
                <div className="flex items-center justify-center gap-1.5 mb-2">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={status}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-1.5"
                        >
                            {statusConfig.emoji ? (
                                <span
                                    className={statusConfig.pulse ? 'animate-pulse' : ''}
                                    style={{ animationDuration: '2.5s', fontSize: 'var(--text-base)' }}
                                >
                                    {statusConfig.emoji}
                                </span>
                            ) : (
                                <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                            )}
                            <span
                                className={`${statusConfig.textColor} font-medium tracking-wide uppercase`}
                                style={{ fontSize: 'var(--text-xs)', filter: `drop-shadow(0 0 3px ${statusConfig.glowColor})` }}
                            >
                                {statusConfig.label}
                            </span>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Floating text with keyword highlights */}
                <p className="text-white/90 font-medium leading-relaxed line-clamp-3"
                    style={{
                        fontSize,
                        textShadow: '0 1px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)',
                    }}>
                    {renderHighlightedText(displayedText, isMicOn)}
                    {isStreaming && (
                        <span className="inline-block w-[2px] h-[1em] bg-white/80 animate-pulse ml-0.5 align-middle" />
                    )}
                </p>
            </div>
        </motion.div>
    );
}

export default memo(Card);
