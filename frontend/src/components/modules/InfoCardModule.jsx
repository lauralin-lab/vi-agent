/**
 * InfoCardModule — structured info card with key-value fields.
 * Supports custom accent color, highlighted fields, and footer.
 */

import { GlassCard, GlassSection, GlassDivider, ModuleHeader, AccentBar } from './shared';

export default function InfoCardModule({ data, onAction }) {
  if (!data) return null;

  const { title, subtitle, icon, fields, sections, footer, accent_color } = data;
  // Accept both "fields" and "sections" — LLM prompts use "sections"
  const items = fields || sections || [];

  const accentStyle = accent_color
    ? { borderLeft: `3px solid ${accent_color}` }
    : {};

  return (
    <GlassCard>
      {/* Accent left border if custom color */}
      <div style={accentStyle} className={accent_color ? 'pl-3 -ml-1' : ''}>
        <ModuleHeader title={title || 'Info'} subtitle={subtitle} icon={icon || 'ℹ️'} />

        {!accent_color && <AccentBar className="mb-4" />}

        {/* Fields */}
        {items.length > 0 && (
          <div className="space-y-1.5">
            {items.map((field, i) => (
              <div
                key={i}
                className={`
                  flex justify-between items-baseline gap-3 py-2 px-2.5 rounded-lg
                  ${field.highlight ? 'bg-purple-500/10 border border-purple-500/15' : 'bg-white/[0.02]'}
                `}
              >
                <span
                  className={`shrink-0 ${field.highlight ? 'text-purple-300/80' : 'text-white/40'}`}
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {field.label}
                </span>
                <span
                  className={`text-right ${field.highlight ? 'text-purple-200 font-medium' : 'text-white/80'}`}
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {footer && (
          <>
            <GlassDivider />
            <p className="text-white/35" style={{ fontSize: 'var(--text-xs)' }}>
              {footer}
            </p>
          </>
        )}
      </div>
    </GlassCard>
  );
}
