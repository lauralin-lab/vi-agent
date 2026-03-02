import { motion } from 'framer-motion';
import { useIsMobile } from '../hooks/useIsMobile';

export default function DeviceFrame({ children }) {
    const isMobile = useIsMobile();

    if (isMobile) {
        // ── Mobile: edge-to-edge full-viewport container ──
        // No padding — Safari toolbar already provides safe area spacing
        return (
            <div
                className="font-sans"
                style={{ width: '100%', height: '100dvh', background: '#000' }}
            >
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100dvh',
                        background: '#000',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                    }}
                >
                    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#000' }}>
                        {children}
                    </div>
                </motion.div>
            </div>
        );
    }

    // ── Desktop: full phone simulator ──
    return (
        <div className="flex items-center justify-center min-h-screen bg-neutral-900 p-4 font-sans">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="relative w-[393px] h-[852px] bg-black rounded-[55px] shadow-2xl border-[8px] border-neutral-800 overflow-hidden ring-1 ring-white/10"
            >
                {/* Dynamic Island */}
                <div className="absolute top-0 left-0 right-0 h-14 z-50 flex justify-center items-end pb-2 pointer-events-none">
                    <div className="w-[120px] h-[35px] bg-black rounded-full absolute top-[11px]" />
                </div>

                {/* Screen Content — pt-2/pb-6 avoids rounded-corner clipping */}
                <div className="w-full h-full relative overflow-hidden rounded-[46px] bg-black pt-2 pb-6">
                    {children}
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white rounded-full z-50 mix-blend-difference pointer-events-none" />
            </motion.div>
        </div>
    );
}

