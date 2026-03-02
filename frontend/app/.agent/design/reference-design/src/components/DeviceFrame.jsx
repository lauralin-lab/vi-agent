import { motion } from 'framer-motion';

export default function DeviceFrame({ children }) {
    return (
        <div className="flex items-center justify-center min-h-screen bg-[#080808] p-4 font-sans">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className="
                    relative w-[393px] h-[852px]
                    bg-[#0c0c0c] rounded-[55px]
                    border-[7px] border-[#1c1c1e]
                    overflow-hidden
                    ring-1 ring-white/[0.06]
                    shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_60px_-10px_rgba(0,0,0,0.8),0_0_100px_-20px_rgba(0,0,0,0.5)]
                "
            >
                {/* Dynamic Island — precision-cut */}
                <div className="absolute top-0 left-0 right-0 h-14 z-50 flex justify-center items-end pb-2 pointer-events-none">
                    <div className="w-[120px] h-[35px] bg-black rounded-full absolute top-[11px] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.05)]" />
                </div>

                {/* Screen Content */}
                <div className="w-full h-full relative overflow-hidden rounded-[48px] bg-[#0a0a0a]">
                    {children}
                </div>

                {/* Home Indicator — brushed metal feel */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white/80 rounded-full z-50 mix-blend-difference pointer-events-none shadow-[0_0_10px_rgba(255,255,255,0.1)]" />
            </motion.div>
        </div>
    );
}
