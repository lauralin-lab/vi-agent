/**
 * ImageGalleryModule — horizontal scrollable gallery with lightbox.
 * Snap scrolling, dot indicators, fullscreen overlay on tap.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, ModuleHeader, AccentBar } from './shared';

function DotIndicator({ count, active }) {
  return (
    <div className="flex justify-center gap-1.5 mt-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`
            w-1.5 h-1.5 rounded-full transition-all duration-200
            ${i === active ? 'bg-purple-400 w-4' : 'bg-white/20'}
          `}
        />
      ))}
    </div>
  );
}

function Lightbox({ images, startIndex, onClose }) {
  const [index, setIndex] = useState(startIndex);

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const next = useCallback(() => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, prev, next]);

  const img = images[index];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-black/50 hover:text-black/80 transition-colors z-10"
      >
        <X size={24} />
      </button>

      {/* Nav arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-black/30 hover:text-black/70 transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-black/30 hover:text-black/70 transition-colors"
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}

      {/* Image */}
      <motion.img
        key={index}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        src={img.url}
        alt={img.alt || img.caption || ''}
        className="max-w-[90vw] max-h-[75vh] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Caption */}
      {img.caption && (
        <p className="text-black/50 mt-3 text-center px-6" style={{ fontSize: 'var(--text-sm)' }}>
          {img.caption}
        </p>
      )}

      {/* Dot indicator */}
      {images.length > 1 && (
        <div className="mt-3">
          <DotIndicator count={images.length} active={index} />
        </div>
      )}
    </motion.div>
  );
}

export default function ImageGalleryModule({ data, onAction }) {
  const { title, images = [] } = data || {};
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const scrollRef = useRef(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const itemWidth = el.firstElementChild?.offsetWidth || 1;
    const gap = 8;
    setActiveIndex(Math.round(scrollLeft / (itemWidth + gap)));
  }, []);

  if (!data || images.length === 0) return null;

  return (
    <GlassCard>
      {title && <ModuleHeader title={title} icon="🖼️" />}

      {/* Scrollable gallery */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {images.map((img, i) => (
          <div
            key={i}
            className="shrink-0 cursor-pointer group"
            style={{ scrollSnapAlign: 'center', width: images.length === 1 ? '100%' : '85%' }}
            onClick={() => setLightboxIndex(i)}
          >
            <div className="rounded-xl overflow-hidden border border-black/[0.06] group-hover:border-black/[0.12] transition-colors">
              <img
                src={img.url}
                alt={img.alt || img.caption || ''}
                className="w-full h-[200px] object-cover"
              />
            </div>
            {img.caption && (
              <p className="text-black/30 mt-1.5 truncate" style={{ fontSize: 'var(--text-xs)' }}>
                {img.caption}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && <DotIndicator count={images.length} active={activeIndex} />}

      {/* Lightbox overlay */}
      <AnimatePresence>
        {lightboxIndex != null && (
          <Lightbox
            images={images}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
