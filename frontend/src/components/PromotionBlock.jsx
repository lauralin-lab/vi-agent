import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { isVideoReady, onVideoReady, getVideoElement } from '../utils/videoPreloader';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION = '1.4s';

export default function PromotionBlock({ onOpenCamera, onOpenProfile, user, isAuthenticated }) {
    const [expanded, setExpanded] = useState(true);
    const [videoVisible, setVideoVisible] = useState(isVideoReady());
    const videoContainerRef = useRef(null);
    const containerRef = useRef(null);
    const contentRef = useRef(null);
    const isFirstRender = useRef(true);

    // FLIP height animation: measure auto → animate from current → settle to auto
    const animateCollapse = useCallback(() => {
        const el = containerRef.current;
        const contentEl = contentRef.current;
        if (!el || !contentEl) return;

        // 1. Capture current rendered height
        const fromHeight = el.getBoundingClientRect().height;

        // 2. Apply target styles instantly to measure
        el.style.transition = 'none';
        contentEl.style.transition = 'none';
        el.style.height = 'auto';
        el.style.borderRadius = '48px';
        el.style.margin = '6px 6px 12px 6px';
        contentEl.style.paddingTop = '106px';
        contentEl.style.paddingBottom = '22px';

        // 3. Read target height (browser calculates auto)
        const toHeight = el.getBoundingClientRect().height;

        // 4. Snap back to start
        el.style.height = `${fromHeight}px`;
        el.style.borderRadius = '0px';
        el.style.margin = '0';
        contentEl.style.paddingTop = '45vh';
        contentEl.style.paddingBottom = '48px';

        // 5. Force reflow so browser registers the "from" state
        el.getBoundingClientRect();

        // 6. Animate to target
        const t = `height ${DURATION} ${EASE}, border-radius ${DURATION} ${EASE}, margin ${DURATION} ${EASE}`;
        el.style.transition = t;
        contentEl.style.transition = `padding-top ${DURATION} ${EASE}, padding-bottom ${DURATION} ${EASE}`;

        el.style.height = `${toHeight}px`;
        el.style.borderRadius = '48px';
        el.style.margin = '6px 6px 12px 6px';
        contentEl.style.paddingTop = '106px';
        contentEl.style.paddingBottom = '22px';

        // 7. After animation ends, switch height to auto for flexibility
        const tid = setTimeout(() => {
            el.style.transition = 'none';
            el.style.height = 'auto';
        }, 1450);

        return () => clearTimeout(tid);
    }, []);

    // Drive collapse animation when expanded changes
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (!expanded) {
            return animateCollapse();
        }
    }, [expanded, animateCollapse]);

    // Attach the shared persistent video element to our container
    useEffect(() => {
        const video = getVideoElement();
        const container = videoContainerRef.current;
        if (container) {
            container.appendChild(video);
            video.play().catch(() => {});
        }
        return () => { video.remove(); };
    }, []);

    // Sync video ready state — collapse when video becomes visible
    useEffect(() => {
        if (videoVisible) return;
        onVideoReady(() => {
            setVideoVisible(true);
        });
    }, [videoVisible]);

    // Collapse when video becomes visible
    useEffect(() => {
        if (videoVisible) queueMicrotask(() => setExpanded(false));
    }, [videoVisible]);

    useEffect(() => {
        // Fallback: shrink after 1.5s even if video still buffering
        if (isVideoReady()) return;
        const t = setTimeout(() => setExpanded(false), 1500);
        return () => clearTimeout(t);
    }, []);

    const firstName = user?.displayName?.split(' ')[0] || null;
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';

    return (
        <div
            ref={containerRef}
            className="relative overflow-hidden"
            style={{
                height: '100vh',
                borderRadius: 0,
                margin: 0,
                background: '#0f1628',
                willChange: 'height, border-radius, margin',
            }}
        >
            {/* ═══ Shimmer placeholder — visible while video buffers ═══ */}
            {!videoVisible && (
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'linear-gradient(110deg, #0f1628 30%, #1a2540 50%, #0f1628 70%)',
                        backgroundSize: '200% 100%',
                        animation: 'promo-shimmer 1.8s ease-in-out infinite',
                    }}
                />
            )}

            {/* ═══ Video background — shared persistent element ═══ */}
            <div
                ref={videoContainerRef}
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ opacity: videoVisible ? 1 : 0, transition: 'opacity 0.5s ease' }}
            />

            {/* ═══ Glass border ═══ */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    borderRadius: 'inherit',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(255, 255, 255, 0.02)',
                }}
            />

            {/* ═══ Content ═══ */}
            <div
                ref={contentRef}
                className="relative px-6 flex flex-col items-start text-left"
                style={{
                    paddingTop: '45vh',
                    paddingBottom: 48,
                    willChange: 'padding-top, padding-bottom',
                }}
            >
                <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                    className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight"
                >
                    {greeting}
                </motion.p>
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                    className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight"
                >
                    Here's the recap of your latest explorations and visual tasks.
                </motion.p>

                {/* Profile / Memory button */}
                {onOpenProfile && (
                    <motion.button
                        onClick={onOpenProfile}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 3, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                        className="mt-[72px] self-center w-10 h-10 rounded-full bg-white/[0.12] backdrop-blur-sm border border-white/[0.15] flex items-center justify-center hover:bg-white/[0.2] active:scale-90 transition-all"
                    >
                        {isAuthenticated && user?.displayName ? (
                            <span className="text-white font-semibold" style={{ fontSize: '13px' }}>
                                {user.displayName.charAt(0).toUpperCase()}
                            </span>
                        ) : (
                            <User size={17} strokeWidth={1.8} className="text-white/70" />
                        )}
                    </motion.button>
                )}
            </div>
        </div>
    );
}
