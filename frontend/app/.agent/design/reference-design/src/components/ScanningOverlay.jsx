import { useRef, useEffect } from 'react';

/**
 * ScanningOverlay — Canvas-based dot grid with optional sweeping scan line.
 *
 * Renders a uniform grid of semi-transparent dots over the camera feed.
 * When `scanning` is true, a horizontal band sweeps top→bottom,
 * boosting dots to full opacity with a trailing glow.
 *
 * Inspired by Ryoji Ikeda / Figma frame-279 style.
 */
export default function ScanningOverlay({ scanning = false, duration = 2500 }) {
    const canvasRef = useRef(null);
    const animFrameRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // ── Grid config ──
        const DOT_RADIUS = 2.2;      // px radius
        const GAP = 16;              // px centre-to-centre
        const BASE_ALPHA = 0.08;     // resting opacity (subtle, ~10%)
        const PEAK_ALPHA = 1.0;      // scan-line peak (full brightness)
        const TRAIL_ROWS = 8;        // rows that fade behind the band
        const DOT_COLOR = '255,255,255';

        let startTime = null;

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        resize();
        window.addEventListener('resize', resize);

        const draw = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;

            const w = canvas.width / dpr;
            const h = canvas.height / dpr;

            ctx.clearRect(0, 0, w, h);

            // Calculate grid
            const cols = Math.ceil(w / GAP) + 1;
            const rows = Math.ceil(h / GAP) + 1;
            const offsetX = (w - (cols - 1) * GAP) / 2;
            const offsetY = (h - (rows - 1) * GAP) / 2;

            // Scan position (loops, only active when scanning)
            const totalSweepRows = rows + TRAIL_ROWS;
            const progress = scanning ? (elapsed % duration) / duration : -1;
            const scanRow = progress >= 0 ? progress * totalSweepRows : -999;

            for (let r = 0; r < rows; r++) {
                let alpha = BASE_ALPHA;

                if (scanning) {
                    const dist = scanRow - r;

                    if (dist >= 0 && dist < 1) {
                        // Active scan row — full brightness
                        alpha = PEAK_ALPHA;
                    } else if (dist >= 1 && dist < 1 + TRAIL_ROWS) {
                        // Trail: linear lerp from peak to base
                        const t = (dist - 1) / TRAIL_ROWS;
                        alpha = PEAK_ALPHA + (BASE_ALPHA - PEAK_ALPHA) * t;
                    }
                }

                ctx.fillStyle = `rgba(${DOT_COLOR}, ${alpha})`;

                for (let c = 0; c < cols; c++) {
                    const x = offsetX + c * GAP;
                    const y = offsetY + r * GAP;
                    ctx.beginPath();
                    ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            animFrameRef.current = requestAnimationFrame(draw);
        };

        animFrameRef.current = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            window.removeEventListener('resize', resize);
        };
    }, [scanning, duration]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
        />
    );
}
