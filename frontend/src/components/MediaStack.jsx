import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ScanLine, Check } from 'lucide-react';

/**
 * Floating media thumbnail stack + expanded strip for captured photos/videos.
 * Extracted from LiveCameraView.
 */
export default function MediaStack({
  capturedMedia,
  setCapturedMedia,
  isStackExpanded,
  setIsStackExpanded,
  stackBounce,
  stackStatus,
  play,
}) {
  return (
    <>
      {/* Collapsed Stack */}
      <AnimatePresence mode="wait">
        {capturedMedia.length > 0 && !isStackExpanded && (
          <motion.div
            key="media-stack"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{
              opacity: 1,
              scale: stackBounce ? [1, 1.15, 0.95, 1.05, 1] : 1,
              y: 0
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            onClick={() => { if (capturedMedia.length > 1) setIsStackExpanded(true); }}
            className="absolute w-11 h-11 cursor-pointer z-30 float-drift"
            style={{ bottom: '130px', left: '1.5rem' }}
          >
            {capturedMedia.slice(0, 4).map((item, index) => (
              <div
                key={index}
                className="absolute top-0 left-0 w-11 h-11 rounded-xl border border-white/20 bg-black/30 backdrop-blur-md overflow-hidden shadow-lg flex items-center justify-center"
                style={{
                  transform: `rotate(${index * 4}deg) scale(${1 - index * 0.05})`,
                  zIndex: 4 - index,
                }}
              >
                <img src={item.src} alt="" className="w-full h-full object-cover opacity-80 absolute inset-0" />
                {item.type === 'video' && (
                  <div className="z-10 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                    <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5" />
                  </div>
                )}
              </div>
            ))}

            {/* Delete button — only show when single item */}
            {capturedMedia.length === 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  play('media.delete');
                  setCapturedMedia([]);
                }}
                className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center z-20 hover:bg-black/80 active:scale-90 transition-all"
              >
                <span className="text-white/80 text-[10px] font-bold leading-none">✕</span>
              </button>
            )}

            {/* Count badge */}
            <motion.div
              key={capturedMedia.length}
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
              className="absolute -bottom-1 -right-1 bg-white text-black font-bold rounded-full flex items-center justify-center z-10 shadow-md border border-black/10"
              style={{ fontSize: '9px', minWidth: '18px', minHeight: '18px', width: '18px', height: '18px' }}
            >
              {capturedMedia.length}
            </motion.div>

            {/* Stack Status Indicator */}
            <AnimatePresence mode="wait">
              {stackStatus === 'UPLOADING' && (
                <motion.div key="uploading" initial={{ opacity: 0, scale: 0.5, rotate: -90 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 400 }}
                  className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/30">
                  <Upload size={10} strokeWidth={3} className="text-black animate-bounce" />
                </motion.div>
              )}
              {stackStatus === 'ANALYZING' && (
                <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 400 }}
                  className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/20">
                  <ScanLine size={10} strokeWidth={3} className="text-black animate-pulse" />
                </motion.div>
              )}
              {stackStatus === 'READY' && (
                <motion.div key="ready" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: [1, 1.3, 1] }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/30">
                  <Check size={10} strokeWidth={3} className="text-black" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Media Strip */}
      <AnimatePresence>
        {isStackExpanded && capturedMedia.length > 0 && (
          <motion.div
            key="expanded-strip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 left-0 z-40 px-5"
            style={{ bottom: '130px' }}
          >
            <div
              className="fixed inset-0 z-[-1]"
              onClick={() => setIsStackExpanded(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex gap-2 overflow-x-auto no-scrollbar pt-3 pb-2 px-2 rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/[0.1]"
            >
              {capturedMedia.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05, type: 'spring', stiffness: 400 }}
                  className="relative shrink-0 w-14 h-14 rounded-xl border border-white/20 bg-black/30"
                >
                  <img src={item.src} alt="" className="w-full h-full object-cover rounded-xl absolute inset-0" />
                  {item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                        <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5" />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      play('media.delete');
                      setCapturedMedia(prev => {
                        const next = prev.filter((_, i) => i !== index);
                        if (next.length <= 1) setIsStackExpanded(false);
                        return next;
                      });
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center z-10 hover:bg-red-500/60 active:scale-90 transition-all"
                  >
                    <span className="text-white/90 text-[9px] font-bold leading-none">✕</span>
                  </button>
                </motion.div>
              ))}
              <button
                onClick={() => setIsStackExpanded(false)}
                className="shrink-0 w-14 h-14 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.1] active:scale-90 transition-all"
              >
                <span className="text-white/50 text-[10px] font-medium">Done</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
