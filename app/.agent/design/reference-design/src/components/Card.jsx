import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { ChevronRight, Eye, Mic, X } from 'lucide-react';

export default function Card({
    isVisible,
    onClick,
    text,
    ctaText = "Deep Dive",
    variant = "normal", // "normal" | "fallback"
    showHint = false,   // show "Not right? Swipe left" hint
    alternatives = [],  // [{label: "..."}] for correction mode
    onAlternativeClick, // callback(label)
    onTextSubmit,       // callback(text) for correction input
    isMicOn = false,    // mic toggle state from CameraView
}) {
    const [displayedText, setDisplayedText] = useState('');
    const prevTextRef = useRef('');
    const streamIntervalRef = useRef(null);
    const [correctionMode, setCorrectionMode] = useState(false);
    const [inputText, setInputText] = useState('');
    const dragX = useMotionValue(0);
    const dragOpacity = useTransform(dragX, [-120, 0], [0.5, 1]);

    // Streaming typewriter effect
    useEffect(() => {
        clearInterval(streamIntervalRef.current);
        const prev = prevTextRef.current;
        const next = text || '';
        let commonLen = 0;
        while (commonLen < prev.length && commonLen < next.length && prev[commonLen] === next[commonLen]) {
            commonLen++;
        }
        if (next.length <= prev.length && commonLen >= next.length) {
            setDisplayedText(next);
            prevTextRef.current = next;
            return;
        }
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
        }, 25);
        return () => clearInterval(streamIntervalRef.current);
    }, [text]);

    // Auto-scale font size
    const fontSize = useMemo(() => {
        const len = (text || '').length;
        if (len < 30) return 'text-[14px]';
        if (len < 60) return 'text-[13px]';
        if (len < 90) return 'text-[12px]';
        return 'text-[11px]';
    }, [text]);

    const isFallback = variant === 'fallback';

    const handleDragEnd = (_, info) => {
        if (info.offset.x < -60) {
            setCorrectionMode(true);
        }
    };

    const handleCorrectionClose = () => {
        setCorrectionMode(false);
        setInputText('');
    };

    const handleInputSubmit = (e) => {
        e.preventDefault();
        if (inputText.trim() && onTextSubmit) {
            onTextSubmit(inputText.trim());
            setCorrectionMode(false);
            setInputText('');
        }
    };

    return (
        <AnimatePresence mode="wait">
            {correctionMode ? (
                /* ═══ Correction Mode ═══ */
                <motion.div
                    key="correction"
                    initial={{ opacity: 0, scale: 0.95, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95, x: -20 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    className="w-full z-50"
                >
                    <div className="
                        bg-black/45 backdrop-blur-2xl
                        border border-white/[0.15]
                        rounded-2xl py-3 px-4
                        shadow-[0_4px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]
                        flex flex-col gap-3
                    ">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <span className="text-white/50 text-[11px] font-medium tracking-wide">What would you like instead?</span>
                            <button
                                onClick={handleCorrectionClose}
                                className="p-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
                            >
                                <X size={12} className="text-white/50" />
                            </button>
                        </div>

                        {/* Alternative tags */}
                        {alternatives.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {alternatives.map((alt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            if (onAlternativeClick) onAlternativeClick(alt.label);
                                            setCorrectionMode(false);
                                        }}
                                        className="
                                            px-3 py-1.5 rounded-full
                                            bg-white/[0.08] backdrop-blur-md
                                            border border-white/[0.12]
                                            text-white/80 text-[11px] font-medium
                                            hover:bg-white/[0.15] hover:border-white/[0.22]
                                            active:scale-95
                                            transition-all duration-200
                                        "
                                    >
                                        {alt.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Text input */}
                        <form onSubmit={handleInputSubmit} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                placeholder="Or tell me what you want..."
                                autoFocus
                                className="
                                    flex-1 bg-white/[0.05] border border-white/[0.08]
                                    rounded-full px-3.5 py-2
                                    text-white/85 text-[12px]
                                    placeholder:text-white/25
                                    focus:outline-none focus:border-white/[0.18] focus:bg-white/[0.08]
                                    transition-all duration-300
                                "
                            />
                            <button
                                type="submit"
                                disabled={!inputText.trim()}
                                className={`
                                    p-2 rounded-full shrink-0 transition-all duration-200
                                    ${inputText.trim()
                                        ? 'bg-white/90 text-black shadow-[0_0_12px_rgba(255,255,255,0.1)]'
                                        : 'bg-white/[0.06] text-white/20'
                                    }
                                `}
                            >
                                <ChevronRight size={14} strokeWidth={2.5} />
                            </button>
                        </form>
                    </div>
                </motion.div>
            ) : (
                /* ═══ Normal Card ═══ */
                <motion.div
                    key="card"
                    initial={{ y: 30, opacity: 0, scale: 0.95 }}
                    animate={{
                        y: isVisible ? 0 : 30,
                        opacity: isVisible ? 1 : 0,
                        scale: isVisible ? 1 : 0.95
                    }}
                    exit={{ opacity: 0, scale: 0.95, x: -30 }}
                    transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 28,
                        delay: 0.05
                    }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.3}
                    onDragEnd={handleDragEnd}
                    style={{ opacity: dragOpacity, x: dragX }}
                    onClick={onClick}
                    className="w-full z-50 cursor-pointer touch-pan-y"
                    whileTap={{ scale: 0.97 }}
                >
                    {/* Frosted glass pill */}
                    <div className={`
                        backdrop-blur-2xl
                        border rounded-2xl py-3 px-4
                        shadow-[0_4px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]
                        flex flex-col gap-2.5
                        group
                        transition-all duration-300
                        ${isFallback
                            ? 'bg-black/25 border-white/[0.08] hover:bg-black/35 hover:border-white/[0.12]'
                            : 'bg-black/35 border-white/[0.12] hover:bg-black/45 hover:border-white/[0.18] active:bg-black/50'
                        }
                    `}>
                        {/* AI Status Label — Viewing / Listening */}
                        {!isFallback && (
                            <div className="flex items-center justify-start gap-1.5 mb-1.5">
                                {isMicOn ? (
                                    <>
                                        {/* Waveform bars */}
                                        <div className="flex gap-[2px] items-end h-2.5">
                                            {[2, 4, 6, 3, 5, 7, 4, 2, 5, 3, 6, 4].map((h, i) => (
                                                <div
                                                    key={i}
                                                    className="w-[1.5px] bg-white/40 rounded-full animate-pulse"
                                                    style={{ height: `${h * 1.2}px`, animationDelay: `${i * 80}ms` }}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-white/40 text-[9px] font-mono font-medium tracking-wider uppercase">Listening...</span>
                                    </>
                                ) : (
                                    <>
                                        <Eye size={10} className="text-white/40 animate-pulse" style={{ animationDuration: '2.5s' }} />
                                        <span className="text-white/40 text-[9px] font-mono font-medium tracking-wider uppercase">AI Viewing...</span>
                                    </>
                                )}
                            </div>
                        )}

                        <span className={`font-medium ${fontSize} leading-snug w-full ${isFallback ? 'text-white/70' : 'text-white/90'}`}>
                            {displayedText}
                            {displayedText !== text && (
                                <span className="inline-block w-[2px] h-[1em] bg-white/70 animate-pulse ml-0.5 align-middle" />
                            )}
                        </span>

                        {/* Fallback: stronger correction prompt */}
                        {isFallback && (
                            <span className="text-white/40 text-[10px] flex items-center gap-1">
                                <span>💡</span> Or say / type what you want
                            </span>
                        )}

                        <div className="flex items-center justify-between">
                            {/* Hint text — only shown for first few cards */}
                            <AnimatePresence>
                                {showHint && !isFallback && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.6, 0.4] }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 1.5 }}
                                        className="text-white/25 text-[9px] tracking-wide"
                                    >
                                        Not right? Swipe left ←
                                    </motion.span>
                                )}
                            </AnimatePresence>

                            {/* CTA pill */}
                            <div className={`
                                self-end ml-auto
                                px-3 py-1.5 rounded-full
                                backdrop-blur-md
                                border
                                flex items-center justify-center gap-1
                                shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]
                                transition-all duration-300
                                ${isFallback
                                    ? 'bg-white/[0.08] border-white/[0.10] group-hover:bg-white/[0.12]'
                                    : 'bg-white/[0.12] border-white/[0.15] group-hover:bg-white/[0.18] group-hover:border-white/[0.25]'
                                }
                            `}>
                                <span className={`text-[11px] font-semibold whitespace-nowrap tracking-wide ${isFallback ? 'text-white/70' : 'text-white/90'}`}>
                                    {ctaText}
                                </span>
                                <ChevronRight className={`w-3 h-3 ${isFallback ? 'text-white/30' : 'text-white/60'}`} />
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
