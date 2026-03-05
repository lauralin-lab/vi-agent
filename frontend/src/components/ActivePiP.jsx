/**
 * ActivePiP — Picture-in-Picture camera overlay for Session view.
 *
 * Renders the local camera video track in a draggable, resizable overlay
 * that sits above the Session Canvas. Supports three states:
 *   - collapsed: small thumbnail (120×160) in a corner
 *   - expanded: larger preview (240×320) with shutter button
 *   - hidden: not visible (e.g., during non-session views)
 *
 * Interactions:
 *   - Tap collapsed → expanded
 *   - Double-tap expanded → return to full camera view
 *   - Tap outside expanded → collapse
 *   - Drag → snap to nearest corner
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera } from 'lucide-react';
import { PIP_SIZE, PIP_EXPANDED_SIZE, PIP_MARGIN, PIP_SPRING } from '../constants';

// Corner positions for snap
const CORNERS = {
  'top-right': { top: PIP_MARGIN, right: PIP_MARGIN },
  'top-left': { top: PIP_MARGIN, left: PIP_MARGIN },
  'bottom-right': { bottom: PIP_MARGIN, right: PIP_MARGIN },
  'bottom-left': { bottom: PIP_MARGIN, left: PIP_MARGIN },
};

export default function ActivePiP({
  localVideoTrack,
  onReturnToCamera,
  onCapture,
  visible = true,
}) {
  const [pipState, setPipState] = useState('collapsed'); // collapsed | expanded
  const [corner, setCorner] = useState('top-right');
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const lastTapRef = useRef(0);

  // Attach video track to the video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !localVideoTrack) return;

    // LiveKit track — attach returns the media element
    const mediaTrack = localVideoTrack.mediaStreamTrack || localVideoTrack;
    if (mediaTrack instanceof MediaStreamTrack) {
      const stream = new MediaStream([mediaTrack]);
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
    } else if (localVideoTrack.attach) {
      localVideoTrack.attach(videoEl);
    }

    return () => {
      videoEl.srcObject = null;
      if (localVideoTrack.detach) {
        localVideoTrack.detach(videoEl);
      }
    };
  }, [localVideoTrack]);

  // Click outside to collapse
  useEffect(() => {
    if (pipState !== 'expanded') return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setPipState('collapsed');
      }
    };
    // Delay to prevent the expansion tap from immediately collapsing
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handler);
    };
  }, [pipState]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;

    if (isDoubleTap && pipState === 'expanded') {
      // Double-tap in expanded → return to full camera
      onReturnToCamera?.();
      return;
    }

    if (pipState === 'collapsed') {
      setPipState('expanded');
    }
  }, [pipState, onReturnToCamera]);

  const handleDragEnd = useCallback((event, info) => {
    // Snap to nearest corner based on drag position
    const el = containerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const centerX = info.point.x - rect.left;
    const centerY = info.point.y - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;

    const newCorner =
      centerY < midY
        ? centerX < midX ? 'top-left' : 'top-right'
        : centerX < midX ? 'bottom-left' : 'bottom-right';

    setCorner(newCorner);
  }, []);

  if (!visible || !localVideoTrack) return null;

  const isExpanded = pipState === 'expanded';
  const size = isExpanded ? PIP_EXPANDED_SIZE : PIP_SIZE;
  const pos = CORNERS[corner];

  // Build position style
  const positionStyle = {
    ...pos,
    position: 'absolute',
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        layout
        drag
        dragMomentum={false}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
        style={positionStyle}
        animate={{
          width: size.width,
          height: size.height,
        }}
        transition={PIP_SPRING}
        className="z-[100] cursor-grab active:cursor-grabbing touch-none"
      >
        {/* Video container */}
        <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />

          {/* Expanded overlay: shutter button */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-end justify-center pb-4"
              >
                {/* Capture button */}
                {onCapture && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCapture();
                    }}
                    className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                  >
                    <Camera size={24} className="text-black" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Double-tap hint in expanded mode */}
          {isExpanded && (
            <div className="absolute top-2 left-0 right-0 flex justify-center">
              <span className="text-[10px] text-white/50 bg-black/40 px-2 py-0.5 rounded-full">
                Double-tap to return
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
