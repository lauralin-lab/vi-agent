/**
 * PlaceCardModule — restaurant/business/place card with rich details.
 * Renders hero image, rating, price level, address, phone, hours, tags, and actions.
 */

import { useState } from 'react';
import { MapPin, Phone, Clock, Navigation, Globe, ExternalLink } from 'lucide-react';
import {
  GlassCard, GlassSection, GlassChip, GlassButton,
  GlassDivider, ModuleHeader, StarRating, PriceLevel, AccentBar,
} from './shared';

function StaticMap({ lat, lng }) {
  const [failed, setFailed] = useState(false);
  if (failed || lat == null || lng == null) return null;

  const src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&scale=2&maptype=roadmap&style=feature:all|element:geometry|color:0x242f3e&style=feature:all|element:labels.text.fill|color:0x746855&markers=color:0xa855f7|${lat},${lng}&key=`;

  return (
    <div className="rounded-xl overflow-hidden mt-3 border border-white/[0.06]">
      <img
        src={src}
        alt="Map"
        className="w-full h-[100px] object-cover opacity-60"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function PlaceCardModule({ data, onAction }) {
  if (!data) return null;

  const {
    name, category, rating, price_level,
    address, phone, hours, image_url,
    coordinates, tags, url,
  } = data;

  const lat = coordinates?.lat;
  const lng = coordinates?.lng;

  return (
    <GlassCard padding={false}>
      {/* Hero Image */}
      {image_url && (
        <div className="relative h-[160px] overflow-hidden">
          <img
            src={image_url}
            alt={name || 'Place'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          {category && (
            <div className="absolute top-3 left-3">
              <GlassChip color="purple">{category}</GlassChip>
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Title */}
        <ModuleHeader title={name || 'Place'} subtitle={!image_url ? category : null} icon="📍" />

        {/* Rating + Price Row */}
        {(rating != null || price_level) && (
          <div className="flex items-center gap-3 mb-3">
            {rating != null && <StarRating rating={rating} />}
            {price_level && <PriceLevel level={price_level} />}
          </div>
        )}

        <AccentBar className="mb-3" />

        {/* Details */}
        <div className="space-y-2.5">
          {address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 text-white/70 hover:text-white/90 transition-colors"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-purple-400" />
              <span>{address}</span>
            </a>
          )}

          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2.5 text-white/70 hover:text-white/90 transition-colors"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              <Phone size={14} className="shrink-0 text-purple-400" />
              <span>{phone}</span>
            </a>
          )}

          {hours && (
            <div
              className="flex items-center gap-2.5 text-white/60"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              <Clock size={14} className="shrink-0 text-white/40" />
              <span>{hours}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map((tag, i) => (
              <GlassChip key={i}>{tag}</GlassChip>
            ))}
          </div>
        )}

        {/* Static Map */}
        <StaticMap lat={lat} lng={lng} />

        <GlassDivider />

        {/* Action Buttons */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {lat != null && lng != null && (
            <GlassButton
              icon={Navigation}
              variant="primary"
              onClick={() => {
                window.open(`https://maps.google.com/?daddr=${lat},${lng}`, '_blank');
                onAction?.({ type: 'directions' });
              }}
              className="shrink-0"
            >
              Directions
            </GlassButton>
          )}

          {phone && (
            <GlassButton
              icon={Phone}
              onClick={() => {
                window.open(`tel:${phone}`);
                onAction?.({ type: 'call' });
              }}
              className="shrink-0"
            >
              Call
            </GlassButton>
          )}

          {url && (
            <GlassButton
              icon={Globe}
              onClick={() => {
                window.open(url, '_blank');
                onAction?.({ type: 'website' });
              }}
              className="shrink-0"
            >
              Website
            </GlassButton>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
