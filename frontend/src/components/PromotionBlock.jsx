import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { isVideoReady, onVideoReady, getVideoElement } from '../utils/videoPreloader';

export default function PromotionBlock({ onOpenCamera, onOpenProfile, user, isAuthenticated }) {
    const [expanded, setExpanded] = useState(true);
    const [videoVisible, setVideoVisible] = useState(isVideoReady());
    const videoContainerRef = useRef(null);

    // Attach the shared persistent video element to our container
    useEffect(() => {
        const video = getVideoElement();
        const container = videoContainerRef.current;
        if (container) {
            container.appendChild(video);
        }
        // On unmount: detach but don't destroy — keeps buffered & playing
        return () => { video.remove(); };
    }, []);

    // Sync video ready state
    useEffect(() => {
        if (videoVisible) {
            setExpanded(false);
            return;
        }
        onVideoReady(() => {
            setVideoVisible(true);
            setExpanded(false);
        });
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
        <motion.div
            initial={{
                marginTop: 0,
                marginLeft: 0,
                marginRight: 0,
                marginBottom: 0,
                borderRadius: 0,
                height: '100vh',
            }}
            animate={{
                marginTop: expanded ? 0 : 6,
                marginLeft: expanded ? 0 : 6,
                marginRight: expanded ? 0 : 6,
                marginBottom: expanded ? 0 : 12,
                borderRadius: expanded ? 0 : 48,
                height: expanded ? '100vh' : 'auto',
            }}
            transition={{
                type: 'spring',
                stiffness: 60,
                damping: 18,
            }}
            className="relative overflow-hidden"
            style={{
                background: '#0f1628',
                willChange: 'height, border-radius',
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
            <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ borderRadius: 0 }}
                animate={{ borderRadius: expanded ? 0 : 48 }}
                transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                style={{
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(255, 255, 255, 0.02)',
                }}
            />

            {/* ═══ Content ═══ */}
            <motion.div
                className="relative px-6 flex flex-col items-start text-left"
                initial={{ paddingTop: '45vh', paddingBottom: 48 }}
                animate={{
                    paddingTop: expanded ? '45vh' : 106,
                    paddingBottom: expanded ? 48 : 22,
                }}
                transition={{
                    type: 'spring',
                    stiffness: 60,
                    damping: 18,
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
            </motion.div>
        </motion.div>
    );
}
