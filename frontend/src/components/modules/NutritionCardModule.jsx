/**
 * NutritionCardModule — food nutrition card with macro ring chart and daily % bars.
 * Slots: food_name, photo_url, calories, protein_g, carbs_g, fat_g, fiber_g,
 *        serving_size, health_score (0-10), recommendation, daily_percent
 */

import {
  GlassCard, GlassSection, GlassChip, GlassDivider,
  ModuleHeader, AccentBar,
} from './shared';

// Macro color palette
const MACRO_COLORS = {
  protein: { ring: '#3b82f6', bg: 'bg-blue-500', label: 'Protein' },
  carbs: { ring: '#eab308', bg: 'bg-yellow-500', label: 'Carbs' },
  fat: { ring: '#ef4444', bg: 'bg-red-500', label: 'Fat' },
};

function MacroRing({ protein, carbs, fat, calories }) {
  const total = (protein || 0) + (carbs || 0) + (fat || 0);
  if (total === 0) return null;

  const proteinPct = ((protein || 0) / total) * 100;
  const carbsPct = ((carbs || 0) / total) * 100;
  const fatPct = ((fat || 0) / total) * 100;

  // SVG circular chart
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = [
    { pct: proteinPct, color: MACRO_COLORS.protein.ring },
    { pct: carbsPct, color: MACRO_COLORS.carbs.ring },
    { pct: fatPct, color: MACRO_COLORS.fat.ring },
  ];

  return (
    <div className="flex items-center justify-center">
      <div className="relative" style={{ width: 100, height: 100 }}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          {segments.map((seg, i) => {
            const dashLength = (seg.pct / 100) * circumference;
            const dashOffset = -(offset / 100) * circumference;
            const el = (
              <circle
                key={i}
                cx="50" cy="50" r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="8"
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ opacity: 0.8 }}
              />
            );
            offset += seg.pct;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white/90 font-bold" style={{ fontSize: 'var(--text-lg)' }}>
            {calories}
          </span>
          <span className="text-white/40" style={{ fontSize: 'var(--text-xs)' }}>
            kcal
          </span>
        </div>
      </div>
    </div>
  );
}

function DailyBar({ label, percent, color }) {
  const clamped = Math.min(100, Math.max(0, percent || 0));
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/50 w-14 shrink-0 text-right" style={{ fontSize: 'var(--text-xs)' }}>
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${clamped}%`, opacity: 0.7 }}
        />
      </div>
      <span className="text-white/40 w-8 shrink-0" style={{ fontSize: 'var(--text-xs)' }}>
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

function HealthScoreBadge({ score }) {
  if (score == null) return null;
  const clamped = Math.min(10, Math.max(0, score));
  let color = 'green';
  if (clamped < 4) color = 'red';
  else if (clamped < 7) color = 'amber';

  return (
    <GlassChip color={color}>
      Health Score: {clamped}/10
    </GlassChip>
  );
}

export default function NutritionCardModule({ data, onAction }) {
  if (!data) return null;

  const {
    food_name, photo_url, calories, protein_g, carbs_g, fat_g,
    fiber_g, serving_size, health_score, recommendation, daily_percent,
  } = data;

  return (
    <GlassCard padding={false}>
      {/* Photo banner */}
      {photo_url && (
        <div className="relative h-[140px] overflow-hidden">
          <img src={photo_url} alt={food_name || 'Food'} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      <div className="p-4">
        <ModuleHeader
          title={food_name || 'Nutrition Info'}
          subtitle={serving_size ? `Serving: ${serving_size}` : null}
          icon="🍽️"
        >
          <HealthScoreBadge score={health_score} />
        </ModuleHeader>

        {/* Macro ring chart */}
        <MacroRing protein={protein_g} carbs={carbs_g} fat={fat_g} calories={calories} />

        {/* Macro legend */}
        <div className="flex justify-center gap-4 mt-3 mb-4">
          {[
            { key: 'protein', value: protein_g },
            { key: 'carbs', value: carbs_g },
            { key: 'fat', value: fat_g },
          ].map(({ key, value }) => value != null && (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${MACRO_COLORS[key].bg}`} style={{ opacity: 0.8 }} />
              <span className="text-white/50" style={{ fontSize: 'var(--text-xs)' }}>
                {MACRO_COLORS[key].label} {value}g
              </span>
            </div>
          ))}
        </div>

        {fiber_g != null && (
          <div className="text-center text-white/40 mb-3" style={{ fontSize: 'var(--text-xs)' }}>
            Fiber: {fiber_g}g
          </div>
        )}

        {/* Daily % bars */}
        {daily_percent && (
          <>
            <AccentBar className="mb-3" />
            <GlassSection>
              <p className="text-white/40 font-medium uppercase tracking-wider mb-2" style={{ fontSize: 'var(--text-xs)' }}>
                Daily Value
              </p>
              <div className="space-y-2">
                {daily_percent.calories != null && (
                  <DailyBar label="Calories" percent={daily_percent.calories} color="bg-white/40" />
                )}
                {daily_percent.protein != null && (
                  <DailyBar label="Protein" percent={daily_percent.protein} color="bg-blue-500" />
                )}
                {daily_percent.carbs != null && (
                  <DailyBar label="Carbs" percent={daily_percent.carbs} color="bg-yellow-500" />
                )}
                {daily_percent.fat != null && (
                  <DailyBar label="Fat" percent={daily_percent.fat} color="bg-red-500" />
                )}
              </div>
            </GlassSection>
          </>
        )}

        {/* Recommendation */}
        {recommendation && (
          <>
            <GlassDivider />
            <p className="text-white/60" style={{ fontSize: 'var(--text-sm)' }}>
              {recommendation}
            </p>
          </>
        )}
      </div>
    </GlassCard>
  );
}
