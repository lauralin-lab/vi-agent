import { useEffect, useRef, useCallback } from 'react';

/**
 * Matrix dot-grid scanning overlay.
 * Renders a grid of dots on a <canvas>; a bright "scan line" sweeps
 * top→bottom with a fading trail, then all dots settle at base opacity.
 *
 * Ported from collov-camera ScanningOverlay (Flutter CustomPainter).
 *
 * @param {boolean} active  – start / re-trigger the sweep
 * @param {number}  duration – sweep duration in ms (default 2500)
 * @param {number}  columns  – dot columns (default 24)
 */
export default function MatrixScanOverlay({
  active,
  duration = 2500,
  columns = 24,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  const DOT_RADIUS = 3;
  const BASE_ALPHA = 0.04;
  const PEAK_ALPHA = 0.9;
  const TRAIL_ROWS = 8;

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // Read the CSS-laid-out size of the canvas itself (driven by inset-0 + w-full h-full)
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === sizeRef.current.w && h === sizeRef.current.h) return;
    // Only set the rendering buffer — do NOT touch style.width/height
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    sizeRef.current = { w, h };
  }, []);

  const draw = useCallback(
    (timestamp) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Re-sync size every frame in case layout changed
      syncSize();

      const dpr = window.devicePixelRatio || 1;
      const { w: width, h: height } = sizeRef.current;
      if (!width || !height) return;

      const ctx = canvas.getContext('2d');
      // Reset transform then apply DPR scale — draw in logical (CSS) pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let progress = -1;
      if (startRef.current !== null) {
        const elapsed = timestamp - startRef.current;
        progress = Math.min(elapsed / duration, 1);
        if (progress >= 1) {
          startRef.current = null;
          progress = -1;
        }
      }

      ctx.clearRect(0, 0, width, height);

      const padding = DOT_RADIUS;
      const gap = (width - padding * 2) / (columns - 1);
      const rows = Math.ceil((height - padding * 2) / gap) + 1;
      const totalSweepRows = rows + TRAIL_ROWS;
      const scanRow = progress >= 0 ? progress * totalSweepRows : -999;
      const isScanning = progress >= 0;

      for (let r = 0; r < rows; r++) {
        let alpha = BASE_ALPHA;

        if (isScanning) {
          const dist = scanRow - r;
          if (dist >= 0 && dist < 1) {
            alpha = PEAK_ALPHA;
          } else if (dist >= 1 && dist < 1 + TRAIL_ROWS) {
            const t = (dist - 1) / TRAIL_ROWS;
            alpha = PEAK_ALPHA + (BASE_ALPHA - PEAK_ALPHA) * t;
          }
        }

        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, alpha))})`;

        for (let c = 0; c < columns; c++) {
          const x = padding + c * gap;
          const y = padding + r * gap;
          ctx.beginPath();
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isScanning) {
        rafRef.current = requestAnimationFrame(draw);
      }
    },
    [duration, columns, syncSize],
  );

  // Resize observer — just sync buffer size + redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      syncSize();
      requestAnimationFrame(draw);
    };

    // Initial sync
    onResize();

    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, syncSize]);

  // Trigger sweep when `active` flips to true
  useEffect(() => {
    if (active) {
      startRef.current = performance.now();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, draw]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-20 pointer-events-none"
    />
  );
}
