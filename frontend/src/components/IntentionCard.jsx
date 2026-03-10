import { memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * IntentionCard — a predicted intention from NanoClaw's context compiler.
 *
 * Displays: icon, title, confidence %, estimated time.
 * Tap dispatches the skill execution via REST API → Redis → NanoClaw.
 */
const IntentionCard = memo(function IntentionCard({ intention, onTap, isLoading }) {
  const {
    title,
    description,
    confidence,
    icon,
    card_color,
    estimated_time,
    skill_slug,
  } = intention;

  const confidencePct = Math.round((confidence || 0) * 100);
  const bgColor = card_color || 'rgba(0,0,0,0.03)';

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={() => !isLoading && onTap?.(intention)}
      disabled={isLoading}
      className="shrink-0 flex flex-col gap-1.5 text-left active:opacity-80 transition-opacity relative overflow-hidden"
      style={{
        width: 150,
        padding: '14px 16px',
        borderRadius: 20,
        background: bgColor,
        border: isLoading ? '1px solid rgba(168,85,247,0.2)' : '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 20, zIndex: 1 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: 'rgba(168,85,247,0.7)' }} />
        </div>
      )}
      {/* Icon + confidence */}
      <div className="flex items-center justify-between w-full">
        <span style={{ fontSize: 22 }}>{icon || '...'}</span>
        {confidencePct > 0 && (
          <span
            className="font-medium"
            style={{
              fontSize: 11,
              color: confidencePct >= 80 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)',
            }}
          >
            {confidencePct}%
          </span>
        )}
      </div>

      {/* Title */}
      <p
        className="font-semibold line-clamp-2 leading-snug"
        style={{ fontSize: 14, color: '#000', letterSpacing: '-0.01em' }}
      >
        {title}
      </p>

      {/* Description (optional) */}
      {description && (
        <p
          className="line-clamp-1"
          style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)' }}
        >
          {description}
        </p>
      )}

      {/* Bottom row: estimated time + skill slug */}
      <div className="flex items-center gap-2 mt-0.5">
        {estimated_time && (
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)' }}>
            {estimated_time}
          </span>
        )}
        {skill_slug && !estimated_time && (
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.2)' }}>
            {skill_slug}
          </span>
        )}
      </div>
    </motion.button>
  );
});

/**
 * IntentionCardStrip — horizontal scrollable row of IntentionCards.
 * Placed between the session summary and the output canvas zone.
 */
export function IntentionCardStrip({ intentions, onTapIntention, loadingSlug }) {
  if (!intentions || intentions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="px-4 pb-3"
    >
      <p
        className="font-medium mb-2"
        style={{ fontSize: 12, color: 'rgba(0,0,0,0.25)', letterSpacing: '0.04em' }}
      >
        SUGGESTIONS
      </p>
      <div
        className="flex gap-2.5 overflow-x-auto no-scrollbar"
        style={{
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {intentions.map((intention) => (
          <IntentionCard
            key={intention.id || intention.skill_slug || intention.title}
            intention={intention}
            onTap={onTapIntention}
            isLoading={loadingSlug === (intention.skill_slug || intention.title)}
          />
        ))}
      </div>
    </motion.div>
  );
}

export default IntentionCard;
