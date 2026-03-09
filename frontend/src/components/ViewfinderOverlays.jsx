/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import MatrixScanOverlay from './MatrixScanOverlay';

/**
 * Hook: manages viewfinder overlay state (scan, emoji rain, UI badge).
 * Extracted from LiveCameraView.
 */
export function useViewfinderOverlays(livekit) {
  const [isScanning, setIsScanning] = useState(false);
  const scanTimerRef = useRef(null);

  const [emojiRain, setEmojiRain] = useState(null);
  const [uiBadge, setUiBadge] = useState(null);
  const overlayTimerRef = useRef(null);

  const [emojiRainParticles, setEmojiRainParticles] = useState([]);
  useEffect(() => {
    if (emojiRain) {
      setEmojiRainParticles(Array.from({ length: 25 }, (_, i) => ({
        x: Math.random() * 90 + 5,
        scale: 0.5 + Math.random(),
        fontSize: 20 + Math.random() * 20,
        delay: Math.random() * 1.5,
        duration: 2 + Math.random() * 2,
        rotate: Math.random() * 360,
        emojiIndex: i % emojiRain.emojis.length,
      })));
    }
  }, [emojiRain]);

  // Trigger scan on connection
  useEffect(() => {
    if (livekit.connectionState === 'connected') {
      setIsScanning(true);
      scanTimerRef.current = setTimeout(() => setIsScanning(false), 2500);
    }
  }, [livekit.connectionState]);

  // Handle agent-driven overlays
  useEffect(() => {
    if (!livekit.viewfinderOverlay) return;
    const overlay = livekit.viewfinderOverlay;

    if (overlay.overlay_type === 'scan') {
      setIsScanning(true);
      scanTimerRef.current = setTimeout(() => setIsScanning(false), overlay.duration || 2000);
    } else if (overlay.overlay_type === 'emoji_rain') {
      setEmojiRain({ emojis: overlay.emojis || ['✨'], duration: overlay.duration || 3000 });
      overlayTimerRef.current = setTimeout(() => setEmojiRain(null), overlay.duration || 3000);
    } else if (overlay.overlay_type === 'ui_badge') {
      setUiBadge({ text: overlay.text, position: overlay.position || 'top-center', color: overlay.color || 'blue' });
      overlayTimerRef.current = setTimeout(() => setUiBadge(null), overlay.duration || 3000);
    }
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [livekit.viewfinderOverlay]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearTimeout(scanTimerRef.current);
      clearTimeout(overlayTimerRef.current);
    };
  }, []);

  return { isScanning, emojiRain, emojiRainParticles, uiBadge };
}

/**
 * Renders all viewfinder overlays: matrix scan, emoji rain, UI badge,
 * capture animation, and action card.
 */
export default function ViewfinderOverlays({
  isScanning,
  emojiRain,
  emojiRainParticles,
  uiBadge,
  showCaptureAnim,
  actionCard,
  onActionCardOption,
  onDismissActionCard,
}) {
  return (
    <>
      {/* AI Matrix Scan Effect */}
      <MatrixScanOverlay active={isScanning} duration={2500} columns={24} />

      {/* Emoji Rain Overlay */}
      <AnimatePresence>
        {emojiRain && (
          <div className="absolute inset-0 z-[25] pointer-events-none overflow-hidden">
            {emojiRainParticles.map((p, i) => (
              <motion.div
                key={`emoji-${emojiRain.emojis.join('')}-${i}`}
                initial={{ y: -50, x: `${p.x}%`, opacity: 1, scale: p.scale }}
                animate={{ y: '110%', rotate: p.rotate }}
                transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
                className="absolute"
                style={{ fontSize: `${p.fontSize}px`, willChange: 'transform' }}
              >
                {emojiRain.emojis[p.emojiIndex]}
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* UI Badge Overlay */}
      <AnimatePresence>
        {uiBadge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: uiBadge.position === 'bottom-center' ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`absolute z-[25] pointer-events-none flex justify-center ${uiBadge.position === 'top-center' ? 'top-4 left-0 right-0' :
              uiBadge.position === 'bottom-center' ? 'bottom-4 left-0 right-0' :
                'top-1/2 left-0 right-0 -translate-y-1/2'
              }`}
          >
            <div className={`px-4 py-1.5 rounded-full backdrop-blur-md border font-semibold tracking-wide shadow-lg ${uiBadge.color === 'purple' ? 'bg-white/[0.12] border-white/20 text-white/80' :
              uiBadge.color === 'green' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 shadow-emerald-500/10' :
                uiBadge.color === 'cyan' ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 shadow-cyan-500/10' :
                  'bg-blue-500/20 border-blue-500/40 text-blue-200 shadow-blue-500/10'
              }`} style={{ fontSize: 'var(--text-sm)' }}>
              {uiBadge.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Capture Genie Animation */}
      <AnimatePresence>
        {showCaptureAnim && (
          <>
            <motion.div
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 bg-white z-50 pointer-events-none"
            />
            <motion.div
              initial={{
                top: '45%', left: '30%', width: '40%', height: '30%',
                borderRadius: '8px', opacity: 1,
              }}
              animate={{
                top: ['45%', '65%', '78%'],
                left: ['30%', '10%', '4%'],
                width: ['40%', '18%', '10%'],
                height: ['30%', '14%', '8%'],
                borderRadius: ['8px', '6px', '4px'],
                opacity: [1, 0.85, 0],
              }}
              transition={{
                duration: 0.55,
                ease: [0.4, 0, 0.2, 1],
                times: [0, 0.6, 1],
              }}
              className="absolute z-40 overflow-hidden shadow-2xl border border-white/30 pointer-events-none bg-neutral-800"
            />
          </>
        )}
      </AnimatePresence>

      {/* Action Card Overlay */}
      <AnimatePresence>
        {actionCard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 z-40 bg-neutral-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-4"
          >
            <p className="text-white/90 font-medium mb-3" style={{ fontSize: 'var(--text-base)' }}>{actionCard.title}</p>
            <div className="flex flex-wrap gap-2">
              {actionCard.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onActionCardOption(opt)}
                  className="px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-white/80 font-medium hover:bg-white/[0.14] transition-colors active:scale-95"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button
              onClick={onDismissActionCard}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X size={12} className="text-white/50" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
