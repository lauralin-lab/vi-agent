import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';

export default function PromotionBlock({ onCameraClick, onOpenProfile }) {
    const [expanded, setExpanded] = useState(true); // start fullscreen

    useEffect(() => {
        // After a short delay, trigger the shrink animation
        const timer = setTimeout(() => setExpanded(false), 400);
        return () => clearTimeout(timer);
    }, []);

    return (
        <motion.div
            initial={{
                marginLeft: 0,
                marginRight: 0,
                marginBottom: 0,
                borderRadius: 0,
                height: '100vh',
            }}
            animate={{
                marginLeft: expanded ? 0 : 20,
                marginRight: expanded ? 0 : 20,
                marginBottom: expanded ? 0 : 24,
                borderRadius: expanded ? 0 : 24,
                height: expanded ? '100vh' : 'auto',
            }}
            transition={{
                duration: 2.6,
                ease: [0.22, 1, 0.36, 1], // smooth ease-out curve
            }}
            className="relative overflow-hidden"
            style={{
                background: 'transparent',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.3)',
            }}
        >
            {/* ═══ Video background — looping ═══ */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: 1 }}
                >
                    <source src="/promo-bg.mov" type="video/quicktime" />
                    <source src="/promo-bg.mp4" type="video/mp4" />
                </video>
            </div>

            {/* ═══ Glass border ═══ */}
            <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ borderRadius: 0 }}
                animate={{ borderRadius: expanded ? 0 : 24 }}
                transition={{ duration: 2.6, ease: [0.22, 1, 0.36, 1] }}
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
                    duration: 2.6,
                    ease: [0.22, 1, 0.36, 1],
                }}
            >
                {/* Greeting */}
                <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                    className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight"
                >
                    Hi Qianhua,
                </motion.p>
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                    className="text-[16px] text-white/80 leading-relaxed font-normal tracking-tight"
                >
                    Here's the recap of your latest explorations and visual tasks.
                </motion.p>

                {/* Profile button — below text, centered */}
                {onOpenProfile && (
                    <motion.button
                        onClick={onOpenProfile}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 3, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                        className="mt-[72px] self-center w-10 h-10 rounded-full bg-white/[0.12] backdrop-blur-sm border border-white/[0.15] flex items-center justify-center hover:bg-white/[0.2] active:scale-90 transition-all"
                    >
                        <User size={17} strokeWidth={1.8} className="text-white/70" />
                    </motion.button>
                )}
            </motion.div>
        </motion.div>
    );
}
