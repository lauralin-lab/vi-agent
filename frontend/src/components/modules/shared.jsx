/**
 * Shared glassmorphism primitives for module components.
 *
 * Design system: enhanced glassmorphism on black background.
 * - Frosted glass containers with subtle borders
 * - Purple accent gradients
 * - Opacity-based text hierarchy (white/90, white/60, white/40)
 * - Mobile portrait optimized (~390px)
 */

import { motion } from 'framer-motion';

// ── Glass Card ──
// Primary container for module content
export function GlassCard({ children, className = '', padding = true, animate = true }) {
  const Wrapper = animate ? motion.div : 'div';
  const animProps = animate ? {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  } : {};

  return (
    <Wrapper
      {...animProps}
      className={`
        bg-white/[0.05] backdrop-blur-xl
        border border-white/[0.08]
        rounded-2xl overflow-hidden
        ${padding ? 'p-4' : ''}
        ${className}
      `}
    >
      {children}
    </Wrapper>
  );
}

// ── Glass Section ──
// Inner section within a card (no border, lighter bg)
export function GlassSection({ children, className = '' }) {
  return (
    <div className={`bg-white/[0.03] rounded-xl p-3 ${className}`}>
      {children}
    </div>
  );
}

// ── Glass Chip ──
// Tag / badge / label
export function GlassChip({ children, color = 'default', className = '' }) {
  const colors = {
    default: 'bg-white/[0.08] text-white/70 border-white/[0.06]',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/20',
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    red: 'bg-red-500/15 text-red-300 border-red-500/20',
    blue: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-2.5 py-0.5 rounded-full border
        font-medium
        ${colors[color] || colors.default}
        ${className}
      `}
      style={{ fontSize: 'var(--text-xs)' }}
    >
      {children}
    </span>
  );
}

// ── Glass Button ──
// Action button with hover/press states
export function GlassButton({ children, onClick, icon: Icon, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-white/[0.06] hover:bg-white/[0.10] border-white/[0.08] text-white/80',
    primary: 'bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/25 text-purple-200',
    ghost: 'bg-transparent hover:bg-white/[0.06] border-transparent text-white/60',
  };

  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center justify-center gap-2
        px-4 py-2.5 rounded-xl border
        font-medium transition-all duration-200
        active:scale-[0.97]
        ${variants[variant] || variants.default}
        ${className}
      `}
      style={{ fontSize: 'var(--text-sm)' }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

// ── Glass Divider ──
export function GlassDivider({ className = '' }) {
  return <div className={`h-px bg-white/[0.06] my-3 ${className}`} />;
}

// ── Module Header ──
// Title + optional subtitle + optional icon
export function ModuleHeader({ title, subtitle, icon, children }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {icon && <span style={{ fontSize: 'var(--text-lg)' }}>{icon}</span>}
          <h3
            className="text-white/90 font-semibold truncate"
            style={{ fontSize: 'var(--text-lg)' }}
          >
            {title}
          </h3>
        </div>
        {subtitle && (
          <p
            className="text-white/50 mt-0.5 truncate"
            style={{ fontSize: 'var(--text-sm)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Star Rating ──
// Renders 0-5 stars with half-star support
export function StarRating({ rating, max = 5, size = 14 }) {
  const stars = [];
  for (let i = 1; i <= max; i++) {
    if (rating >= i) {
      stars.push(<span key={i} className="text-amber-400">★</span>);
    } else if (rating >= i - 0.5) {
      stars.push(
        <span key={i} className="relative inline-block" style={{ width: `${size}px` }}>
          <span className="text-white/20">★</span>
          <span className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
            <span className="text-amber-400">★</span>
          </span>
        </span>
      );
    } else {
      stars.push(<span key={i} className="text-white/20">★</span>);
    }
  }

  return (
    <span className="inline-flex items-center gap-px" style={{ fontSize: `${size}px` }}>
      {stars}
      {rating > 0 && (
        <span className="text-white/50 ml-1.5" style={{ fontSize: 'var(--text-xs)' }}>
          {rating.toFixed(1)}
        </span>
      )}
    </span>
  );
}

// ── Price Level ──
// Renders $-$$$$ indicator
export function PriceLevel({ level }) {
  if (!level) return null;
  const count = typeof level === 'number' ? level : level.length;
  const max = 4;

  return (
    <span style={{ fontSize: 'var(--text-sm)' }}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? 'text-emerald-400' : 'text-white/15'}>$</span>
      ))}
    </span>
  );
}

// ── Animated Number ──
export function AnimatedValue({ value, className = '' }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      {value}
    </motion.span>
  );
}

// ── Checkbox Item ──
export function CheckboxItem({ checked, onToggle, children, strikethrough = true }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-start gap-3 w-full text-left py-1.5 group"
    >
      <span className={`
        mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0
        transition-all duration-200
        ${checked
          ? 'bg-purple-500/30 border-purple-500/50 text-purple-300'
          : 'bg-white/[0.04] border-white/[0.12] text-transparent group-hover:border-white/20'
        }
      `}>
        {checked && (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            width="10" height="10" viewBox="0 0 10 10"
          >
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </motion.svg>
        )}
      </span>
      <span
        className={`transition-all duration-200 ${checked && strikethrough ? 'text-white/30 line-through' : 'text-white/80'}`}
        style={{ fontSize: 'var(--text-sm)' }}
      >
        {children}
      </span>
    </button>
  );
}

// ── Weather Icon Mapping ──
export function WeatherIcon({ condition, size = 32 }) {
  const iconMap = {
    'sunny': '☀️', 'clear': '☀️',
    'partly_cloudy': '⛅', 'partly cloudy': '⛅',
    'cloudy': '☁️', 'overcast': '☁️',
    'rain': '🌧️', 'rainy': '🌧️', 'drizzle': '🌦️',
    'thunderstorm': '⛈️', 'storm': '⛈️',
    'snow': '🌨️', 'snowy': '🌨️',
    'fog': '🌫️', 'foggy': '🌫️', 'mist': '🌫️',
    'wind': '💨', 'windy': '💨',
    'hail': '🧊',
    'night_clear': '🌙', 'night clear': '🌙',
    'night_cloudy': '🌙☁️',
  };

  const key = (condition || '').toLowerCase();
  const emoji = iconMap[key] || '🌤️';

  return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>{emoji}</span>;
}

// ── Gradient Accent Bar ──
export function AccentBar({ className = '' }) {
  return (
    <div
      className={`h-[2px] rounded-full bg-gradient-to-r from-purple-500/60 via-blue-500/40 to-transparent ${className}`}
    />
  );
}

// ── Module Error Boundary ──
// Wraps individual modules to prevent crashes from taking down the whole view
export function ModuleErrorFallback({ module_type, data }) {
  return (
    <GlassCard>
      <div className="text-white/40 space-y-2">
        <p style={{ fontSize: 'var(--text-sm)' }}>
          Could not render <span className="text-white/60 font-medium">{module_type}</span> module
        </p>
        <pre
          className="bg-white/[0.03] rounded-lg p-3 overflow-x-auto text-white/30"
          style={{ fontSize: 'var(--text-xs)' }}
        >
          {JSON.stringify(data, null, 2).slice(0, 500)}
        </pre>
      </div>
    </GlassCard>
  );
}
