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
                ? 'text-white font-semibold'
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
// SVG icon for observation/viewing states (matches V2 design)
const ObservationIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
    </svg>
);

const AGENT_STATUS_CONFIG = {
    offline: { label: 'Offline', dotColor: 'bg-red-400/80', textColor: 'text-red-400/80', glowColor: 'rgba(248,113,113,0.3)' },
    weak_connection: { label: 'Weak Signal', dotColor: 'bg-yellow-400/80', textColor: 'text-yellow-400/80', glowColor: 'rgba(250,204,21,0.3)' },
    connecting: { label: 'Connecting', dotColor: 'bg-blue-400/80', textColor: 'text-blue-400/80', glowColor: 'rgba(96,165,250,0.3)', pulse: true },
    listening: { label: 'Listening', icon: true, textColor: 'text-white/70', glowColor: 'rgba(255,255,255,0.2)' },
    thinking: { label: 'Thinking', dotColor: 'bg-cyan-400/80', textColor: 'text-cyan-400/80', glowColor: 'rgba(34,211,238,0.3)', pulse: true },
    viewing: { label: 'AI Observation', icon: true, textColor: 'text-white/50', glowColor: 'rgba(34,211,238,0.3)' },
    waiting: { label: 'Ready', dotColor: 'bg-green-400/80', textColor: 'text-green-400/80', glowColor: 'rgba(74,222,128,0.3)' },
};

// eslint-disable-next-line react-refresh/only-export-components
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
            initial={{ opacity: 0, y: 10 }}
            animate={{
                y: isVisible ? 0 : 10,
                opacity: isVisible ? 1 : 0,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.1 }}
            className="relative w-full z-50"
        >
            {/* Layered frosted glass — outer glow + inner glass */}
            <div
                className="relative rounded-2xl overflow-hidden"
                style={{
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
                }}
            >
                {/* Background blur layer */}
                <div
                    className="absolute inset-0 rounded-2xl"
                    style={{
                        backdropFilter: 'blur(24px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                    }}
                />
                {/* Inner frosted overlay for depth */}
                <div
                    className="absolute inset-0 rounded-2xl"
                    style={{
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)',
                        border: '1px solid rgba(255,255,255,0.12)',
                    }}
                />
                {/* Top highlight edge — liquid glass feel */}
                <div
                    className="absolute top-0 left-[10%] right-[10%] h-px"
                    style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                    }}
                />
                {/* Content */}
                <div className="relative px-4 py-3">
                {/* Status label — left aligned, V2 observation style */}
                <div className="flex items-center gap-1.5 mb-1">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={status}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center gap-1"
                        >
                            {statusConfig.icon ? (
                                <span className={`${statusConfig.textColor} ${statusConfig.pulse ? 'animate-pulse' : ''}`}>
                                    <ObservationIcon />
                                </span>
                            ) : (
                                <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} ${statusConfig.pulse ? 'animate-pulse' : ''}`} />
                            )}
                            <span
                                className={`${statusConfig.textColor} font-mono font-semibold tracking-[0.06em] uppercase`}
                                style={{ fontSize: '11px' }}
                            >
                                {statusConfig.label}
                            </span>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Streaming text — left aligned */}
                <p
                    className="text-white/90 font-medium leading-relaxed line-clamp-4"
                    style={{ fontSize, textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}
                >
                    {renderHighlightedText(displayedText, isMicOn)}
                    {isStreaming && (
                        <span className="inline-block w-[2px] h-[1em] bg-white/50 animate-pulse ml-0.5 align-middle" style={{ opacity: 0.5 }} />
                    )}
                </p>
                </div>
            </div>
        </motion.div>
    );
}

export default memo(Card);
