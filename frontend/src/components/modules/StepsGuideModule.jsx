/**
 * StepsGuideModule — vertical timeline layout with numbered steps.
 * Purple circles with connecting lines, optional images per step.
 *
 * Data slots:
 *   - title: string — card title
 *   - steps: array | JSON-concatenated string — step objects from stream_to_card
 *   - conclusion: string — final text content from Claude (streamed)
 */

import { GlassCard, GlassSection, ModuleHeader, AccentBar } from './shared';

/**
 * Parse steps from various formats:
 * - Array of objects (normal)
 * - Concatenated JSON strings from stream_to_card (e.g., '{"label":"A",...}{"label":"B",...}')
 *
 * Also deduplicates steps that appear multiple times (streaming can cause repeats).
 */
function parseSteps(raw) {
  let steps;
  if (Array.isArray(raw)) {
    steps = raw;
  } else if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  } else {
    // Try parsing as a JSON array first
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        steps = parsed;
      } else {
        steps = [parsed];
      }
    } catch {
      // Split on }{ boundaries, then parse each
      try {
        const parts = raw.replace(/\}\s*\{/g, '}|||{').split('|||');
        steps = parts.map(p => JSON.parse(p)).filter(Boolean);
      } catch {
        return [];
      }
    }
  }

  // Deduplicate steps by label+status (streaming can emit duplicates)
  const seen = new Set();
  return steps.filter(s => {
    const key = `${s.label || s.title || ''}::${s.status || ''}::${s.content || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Deduplicate conclusion text that may have been streamed/concatenated twice.
 */
function dedupeConclusion(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  // Check if the text is exactly doubled
  const half = Math.floor(trimmed.length / 2);
  if (half > 20 && trimmed.slice(0, half) === trimmed.slice(half)) {
    return trimmed.slice(0, half);
  }
  return trimmed;
}

export default function StepsGuideModule({ data, onAction }) {
  if (!data) return null;

  const { title } = data;
  const conclusion = dedupeConclusion(data.conclusion);
  const steps = parseSteps(data.steps);
  // Hide internal "thinking" steps that are just status markers
  const visibleSteps = steps.filter(s => s.content && s.content !== 'Processing your request...');

  return (
    <GlassCard>
      <ModuleHeader title={title || 'Guide'} icon="📋" subtitle={visibleSteps.length > 0 ? `${visibleSteps.length} step${visibleSteps.length !== 1 ? 's' : ''}` : ''} />
      <AccentBar className="mb-4" />

      {visibleSteps.length > 0 && (
        <div className="relative mb-3">
          {visibleSteps.map((step, i) => {
            const isLast = i === visibleSteps.length - 1;

            return (
              <div key={i} className="flex gap-3 relative">
                {/* Timeline column */}
                <div className="flex flex-col items-center shrink-0">
                  <span
                    className="w-7 h-7 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 font-semibold z-10"
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    {i + 1}
                  </span>
                  {!isLast && (
                    <div className="w-px flex-1 bg-gradient-to-b from-purple-500/20 to-black/[0.03] min-h-[24px]" />
                  )}
                </div>

                {/* Content */}
                <div className={`pb-${isLast ? '0' : '5'} min-w-0 flex-1`}>
                  <h4 className="text-black/80 font-medium mb-1" style={{ fontSize: 'var(--text-sm)' }}>
                    {step.title || step.label}
                  </h4>
                  {step.description && (
                    <p className="text-black/45 leading-relaxed" style={{ fontSize: 'var(--text-sm)' }}>
                      {step.description}
                    </p>
                  )}
                  {step.content && step.content !== step.title && step.content !== step.label && (
                    <p className="text-black/45 leading-relaxed" style={{ fontSize: 'var(--text-sm)' }}>
                      {step.content}
                    </p>
                  )}
                  {step.tip && (
                    <p className="text-purple-600/60 mt-1" style={{ fontSize: 'var(--text-xs)' }}>
                      💡 {step.tip}
                    </p>
                  )}
                  {step.image_url && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-black/[0.06]">
                      <img
                        src={step.image_url}
                        alt={step.title || step.label || `Step ${i + 1}`}
                        className="w-full h-[120px] object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conclusion text from Claude */}
      {conclusion && (
        <div className="text-black/60 leading-relaxed whitespace-pre-wrap" style={{ fontSize: 'var(--text-sm)' }}>
          {conclusion}
        </div>
      )}
    </GlassCard>
  );
}
