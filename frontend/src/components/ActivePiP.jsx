/**
 * ActivePiP — Picture-in-Picture camera overlay for Session view.
 *
 * Draggable camera thumbnail that snaps to 6 anchor points:
 *   top-left, top-right, middle-left, middle-right, bottom-left, bottom-right
 *
 * Uses absolute pixel coordinates + spring animation for buttery smooth snapping.
 * Double-tap to return to full camera view.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { PIP_SIZE, PIP_MARGIN } from '../constants';

const SNAP_SPRING = { type: 'spring', stiffness: 400, damping: 32, mass: 0.8 };

function getSnapPoints(containerW, containerH, pipW, pipH, margin) {
  const left = margin;
  const right = containerW - pipW - margin;
  const midY = (containerH - pipH) / 2;
  const top = margin;
  const bottom = containerH - pipH - margin;

  return [
    { id: 'top-left',     x: left,  y: top },
    { id: 'top-right',    x: right, y: top },
    { id: 'mid-left',     x: left,  y: midY },
    { id: 'mid-right',    x: right, y: midY },
    { id: 'bottom-left',  x: left,  y: bottom },
    { id: 'bottom-right', x: right, y: bottom },
  ];
}

function findNearest(points, px, py) {
  let best = points[0];
  let bestDist = Infinity;
  for (const p of points) {
    const dx = p.x - px;
    const dy = p.y - py;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

export default function ActivePiP({
  localVideoTrack,
  onReturnToCamera,
  onCapture,
  visible = true,
}) {
  const videoRef = useRef(null);
  const wrapperRef = useRef(null);
  const lastTapRef = useRef(0);
  const isDraggingRef = useRef(false);
  const controls = useAnimationControls();
  const [parentSize, setParentSize] = useState({ w: 0, h: 0 });
  const currentSnapRef = useRef(null);

  // Observe parent size for responsive snap points
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const parent = wrapper.parentElement;
    if (!parent) return;

    const measure = () => {
      const { width, height } = parent.getBoundingClientRect();
      setParentSize({ w: width, h: height });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const snapPoints = useMemo(
    () => parentSize.w > 0
      ? getSnapPoints(parentSize.w, parentSize.h, PIP_SIZE.width, PIP_SIZE.height, PIP_MARGIN)
      : [],
    [parentSize.w, parentSize.h],
  );

  // Set initial position once snap points are available
  useEffect(() => {
    if (snapPoints.length === 0) return;
    const initial = snapPoints.find(p => p.id === 'top-right') || snapPoints[0];
    currentSnapRef.current = initial;
    controls.set({ x: initial.x, y: initial.y });
  }, [snapPoints, controls]);

  // Attach video track
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !localVideoTrack) return;

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

  const handleTap = useCallback(() => {
    if (isDraggingRef.current) return;
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 300;
    lastTapRef.current = now;
    if (isDoubleTap) {
      onReturnToCamera?.();
    }
  }, [onReturnToCamera]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const handleDragEnd = useCallback((event, info) => {
    setTimeout(() => { isDraggingRef.current = false; }, 50);
    if (snapPoints.length === 0) return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const parent = wrapper.parentElement;
    if (!parent) return;

    // Current element position = parent offset + drag point relative to element center
    const parentRect = parent.getBoundingClientRect();
    const elCenterX = info.point.x - parentRect.left - PIP_SIZE.width / 2;
    const elCenterY = info.point.y - parentRect.top - PIP_SIZE.height / 2;

    const nearest = findNearest(snapPoints, elCenterX, elCenterY);
    currentSnapRef.current = nearest;
    controls.start({ x: nearest.x, y: nearest.y, transition: SNAP_SPRING });
  }, [snapPoints, controls]);

  if (!visible || !localVideoTrack) return null;

  return (
    <motion.div
      ref={wrapperRef}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTap={handleTap}
      animate={controls}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: PIP_SIZE.width,
        height: PIP_SIZE.height,
      }}
      className="z-[100] cursor-grab active:cursor-grabbing touch-none"
    >
      <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>
    </motion.div>
  );
}
