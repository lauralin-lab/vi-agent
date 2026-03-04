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

  // ── constants matching the Flutter painter ──
  const DOT_RADIUS = 3;
  const BASE_ALPHA = 0.04;
  const PEAK_ALPHA = 0.9;
  const TRAIL_ROWS = 8;

  const draw = useCallback(
    (timestamp) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      if (!width || !height) return;

      // Elapsed progress [0..1]  (-1 when idle)
      let progress = -1;
      if (startRef.current !== null) {
        const elapsed = timestamp - startRef.current;
        progress = Math.min(elapsed / duration, 1);
        if (progress >= 1) {
          startRef.current = null; // sweep done
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

        alpha = Math.max(0, Math.min(1, alpha));

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

        for (let c = 0; c < columns; c++) {
          const x = padding + c * gap;
          const y = padding + r * gap;
          ctx.beginPath();
          ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Keep looping while sweep is running OR dots are visible
      if (isScanning) {
        rafRef.current = requestAnimationFrame(draw);
      }
      // When idle we stop the loop — the last frame already drew base-alpha dots
    },
    [duration, columns],
  );

  // ── Resize canvas to match container ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.getContext('2d').scale(dpr, dpr);
      // Redraw at idle state after resize
      requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [draw]);

  // ── Trigger sweep when `active` flips to true ──
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
      className="absolute inset-0 z-20 pointer-events-none"
    />
  );
}
