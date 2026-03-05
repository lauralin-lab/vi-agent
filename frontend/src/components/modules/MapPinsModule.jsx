/**
 * MapPinsModule — styled list of locations with ratings and actions.
 * Slots: title, center, zoom, markers[], selected_marker
 * markers[]: { id, lat, lng, label, description, rating, icon }
 */

import { useState, useCallback } from 'react';
import { Navigation } from 'lucide-react';
import {
  GlassCard, GlassButton, ModuleHeader, StarRating,
} from './shared';

export default function MapPinsModule({ data, onAction }) {
  const { title, markers = [], selected_marker: initialSelected } = data || {};
  const [selectedId, setSelectedId] = useState(initialSelected || null);

  const handleMarkerTap = useCallback((markerId) => {
    setSelectedId(markerId);
    onAction?.({ type: 'marker_tapped', markerId });
  }, [onAction]);

  const handleDirections = useCallback((marker) => {
    if (marker.lat != null && marker.lng != null) {
      window.open(`https://maps.google.com/?daddr=${marker.lat},${marker.lng}`, '_blank');
    }
    onAction?.({ type: 'directions', markerId: marker.id });
  }, [onAction]);

  if (!data) return null;

  return (
    <GlassCard>
      <ModuleHeader
        title={title || 'Locations'}
        subtitle={`${markers.length} place${markers.length !== 1 ? 's' : ''}`}
        icon="📍"
      />

      <div className="space-y-2">
        {markers.map((marker) => {
          const isSelected = selectedId === marker.id;
          return (
            <button
              key={marker.id}
              onClick={() => handleMarkerTap(marker.id)}
              className={`
                w-full text-left rounded-xl p-3 transition-all duration-200
                ${isSelected
                  ? 'bg-purple-500/15 border border-purple-500/30 ring-1 ring-purple-500/20'
                  : 'bg-black/[0.03] border border-black/[0.06] hover:bg-black/[0.06]'
                }
              `}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <span
                  className={`
                    w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base
                    ${isSelected ? 'bg-purple-500/20' : 'bg-black/[0.06]'}
                  `}
                >
                  {marker.icon || '📍'}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Label */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium truncate ${isSelected ? 'text-purple-200' : 'text-black/70'}`}
                      style={{ fontSize: 'var(--text-sm)' }}
                    >
                      {marker.label}
                    </span>
                  </div>

                  {/* Description */}
                  {marker.description && (
                    <p className="text-black/30 mt-0.5 line-clamp-2" style={{ fontSize: 'var(--text-xs)' }}>
                      {marker.description}
                    </p>
                  )}

                  {/* Rating */}
                  {marker.rating != null && (
                    <div className="mt-1.5">
                      <StarRating rating={marker.rating} size={12} />
                    </div>
                  )}
                </div>
              </div>

              {/* Directions button (shown for selected marker) */}
              {isSelected && (
                <div className="mt-3 pl-11">
                  <GlassButton
                    icon={Navigation}
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDirections(marker);
                    }}
                    className="w-full"
                  >
                    Get Directions
                  </GlassButton>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}
