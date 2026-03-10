/**
 * WeatherModule — current weather conditions + horizontal scrollable forecast.
 * Uses WeatherIcon from shared.jsx for emoji weather icons.
 */

import { useMemo, useRef } from 'react';
import { Droplets, Wind, MapPin } from 'lucide-react';
import {
  GlassCard, GlassSection, GlassDivider, ModuleHeader,
  WeatherIcon, AccentBar, AnimatedValue,
} from './shared';

function conditionGradient(condition) {
  const c = (condition || '').toLowerCase();
  if (c.includes('rain') || c.includes('drizzle') || c.includes('storm') || c.includes('thunder'))
    return 'from-blue-900/30 to-slate-900/20';
  if (c.includes('snow') || c.includes('hail'))
    return 'from-slate-800/30 to-blue-900/20';
  if (c.includes('cloud') || c.includes('overcast') || c.includes('fog') || c.includes('mist'))
    return 'from-gray-800/30 to-slate-900/20';
  if (c.includes('night'))
    return 'from-indigo-900/30 to-slate-900/20';
  // sunny / clear / default
  return 'from-blue-800/20 to-cyan-900/15';
}

export default function WeatherModule({ data, onAction }) {
  const { location, current, forecast } = data || {};
  const scrollRef = useRef(null);

  const gradient = useMemo(
    () => conditionGradient(current?.condition),
    [current?.condition],
  );

  if (!data) return null;

  return (
    <GlassCard padding={false}>
      {/* Gradient tint overlay */}
      <div className={`bg-gradient-to-br ${gradient} p-4`}>
        <ModuleHeader
          title={location || 'Weather'}
          icon="🌍"
        />

        {/* Current conditions */}
        {current && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <WeatherIcon condition={current.icon || current.condition} size={48} />
              <div>
                <div className="text-black/80 font-light" style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                  <AnimatedValue value={`${Math.round(current.temp)}°`} />
                </div>
                <p className="text-black/40 mt-1" style={{ fontSize: 'var(--text-sm)' }}>
                  {current.condition}{current.unit ? ` · °${current.unit}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Humidity + Wind */}
        {current && (current.humidity != null || current.wind) && (
          <div className="flex gap-4 mb-2">
            {current.humidity != null && (
              <div className="flex items-center gap-1.5 text-black/40" style={{ fontSize: 'var(--text-sm)' }}>
                <Droplets size={14} className="text-blue-400/70" />
                <span>{current.humidity}%</span>
              </div>
            )}
            {current.wind && (
              <div className="flex items-center gap-1.5 text-black/40" style={{ fontSize: 'var(--text-sm)' }}>
                <Wind size={14} className="text-black/30" />
                <span>{current.wind}</span>
              </div>
            )}
          </div>
        )}

        <AccentBar className="mt-2" />
      </div>

      {/* Forecast */}
      {forecast?.length > 0 && (
        <div className="px-4 pb-4 pt-3">
          <p
            className="text-black/30 font-medium uppercase tracking-wider mb-2"
            style={{ fontSize: 'var(--text-xs)' }}
          >
            Forecast
          </p>
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto scrollbar-none pb-1"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {forecast.map((day, i) => (
              <GlassSection
                key={i}
                className="shrink-0 flex flex-col items-center gap-1.5 min-w-[72px]"
              >
                <span className="text-black/40" style={{ fontSize: 'var(--text-xs)' }}>
                  {day.day}
                </span>
                <WeatherIcon condition={day.icon || day.condition} size={24} />
                <div className="flex gap-1.5" style={{ fontSize: 'var(--text-xs)' }}>
                  <span className="text-black/70">{Math.round(day.high)}°</span>
                  <span className="text-black/25">{Math.round(day.low)}°</span>
                </div>
              </GlassSection>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
