/**
 * ComparisonModule — stacked product/item comparison cards.
 * Mobile-optimized: cards stacked vertically, not side-by-side.
 */

import { GlassCard, GlassSection, GlassChip, GlassDivider, ModuleHeader, AccentBar } from './shared';

function AttributeRow({ label, value }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-1.5">
      <span className="text-black/30 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
        {label}
      </span>
      <span className="text-black/70 text-right" style={{ fontSize: 'var(--text-sm)' }}>
        {String(value)}
      </span>
    </div>
  );
}

function ComparisonItem({ item, index }) {
  const { name, image_url, attributes, verdict, highlight, pros, cons, rating, price } = item;

  // Merge explicit pros/cons/rating/price into attributes-style display
  const mergedAttrs = { ...attributes };
  if (rating != null && !mergedAttrs.Rating) mergedAttrs.Rating = String(rating);
  if (price != null && !mergedAttrs.Price) mergedAttrs.Price = String(price);

  return (
    <GlassSection
      className={`${highlight ? 'ring-1 ring-purple-500/30' : ''}`}
    >
      {highlight && <AccentBar className="mb-3" />}

      <div className="flex items-start gap-3">
        {image_url && (
          <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-black/[0.06]">
            <img src={image_url} alt={name || ''} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full bg-black/[0.08] flex items-center justify-center shrink-0 text-black/30"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              {index + 1}
            </span>
            <h4 className="text-black/80 font-medium truncate" style={{ fontSize: 'var(--text-sm)' }}>
              {name}
            </h4>
          </div>
          {verdict && (
            <div className="mt-1.5">
              <GlassChip color={highlight ? 'purple' : 'green'}>{verdict}</GlassChip>
            </div>
          )}
        </div>
      </div>

      {/* Pros / Cons */}
      {(pros?.length > 0 || cons?.length > 0) && (
        <div className="mt-3 border-t border-black/[0.05] pt-2 space-y-1.5">
          {pros?.map((p, i) => (
            <div key={`p${i}`} className="flex items-start gap-2" style={{ fontSize: 'var(--text-sm)' }}>
              <span className="text-emerald-400 shrink-0">+</span>
              <span className="text-black/60">{p}</span>
            </div>
          ))}
          {cons?.map((c, i) => (
            <div key={`c${i}`} className="flex items-start gap-2" style={{ fontSize: 'var(--text-sm)' }}>
              <span className="text-red-400 shrink-0">−</span>
              <span className="text-black/60">{c}</span>
            </div>
          ))}
        </div>
      )}

      {/* Key-value attributes */}
      {Object.keys(mergedAttrs).length > 0 && (
        <div className={`${pros?.length || cons?.length ? 'mt-2' : 'mt-3'} border-t border-black/[0.05] pt-2`}>
          {Object.entries(mergedAttrs).map(([key, val]) => (
            <AttributeRow key={key} label={key} value={val} />
          ))}
        </div>
      )}
    </GlassSection>
  );
}

export default function ComparisonModule({ data, onAction }) {
  if (!data) return null;

  const { title, items = [] } = data;

  return (
    <GlassCard>
      <ModuleHeader title={title || 'Comparison'} icon="⚖️" subtitle={`${items.length} items`} />

      <div className="space-y-3">
        {items.map((item, i) => (
          <ComparisonItem key={i} item={item} index={i} />
        ))}
      </div>
    </GlassCard>
  );
}
