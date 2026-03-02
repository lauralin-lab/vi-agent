/**
 * StepsGuideModule — vertical timeline layout with numbered steps.
 * Purple circles with connecting lines, optional images per step.
 */

import { GlassCard, GlassSection, ModuleHeader, AccentBar } from './shared';

export default function StepsGuideModule({ data, onAction }) {
  if (!data) return null;

  const { title, steps = [] } = data;

  return (
    <GlassCard>
      <ModuleHeader title={title || 'Guide'} icon="📋" subtitle={`${steps.length} step${steps.length !== 1 ? 's' : ''}`} />
      <AccentBar className="mb-4" />

      <div className="relative">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;

          return (
            <div key={i} className="flex gap-3 relative">
              {/* Timeline column */}
              <div className="flex flex-col items-center shrink-0">
                <span
                  className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-semibold z-10"
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {i + 1}
                </span>
                {!isLast && (
                  <div className="w-px flex-1 bg-gradient-to-b from-purple-500/30 to-white/[0.05] min-h-[24px]" />
                )}
              </div>

              {/* Content */}
              <div className={`pb-${isLast ? '0' : '5'} min-w-0 flex-1`}>
                <h4 className="text-white/85 font-medium mb-1" style={{ fontSize: 'var(--text-sm)' }}>
                  {step.title}
                </h4>
                {step.description && (
                  <p className="text-white/50 leading-relaxed" style={{ fontSize: 'var(--text-sm)' }}>
                    {step.description}
                  </p>
                )}
                {step.tip && (
                  <p className="text-purple-300/60 mt-1" style={{ fontSize: 'var(--text-xs)' }}>
                    💡 {step.tip}
                  </p>
                )}
                {step.image_url && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-white/[0.06]">
                    <img
                      src={step.image_url}
                      alt={step.title || `Step ${i + 1}`}
                      className="w-full h-[120px] object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
