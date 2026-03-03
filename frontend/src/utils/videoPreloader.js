/**
 * Global video preloader — creates a SINGLE persistent <video> element
 * that starts buffering at app boot and is reused across page navigations.
 *
 * PromotionBlock attaches this element to its DOM container instead of
 * creating a new <video> each time — no re-buffering, no re-decoding.
 */

let ready = false;
const listeners = new Set();

// Single persistent video element — lives for the entire app lifetime
const el = document.createElement('video');
el.autoplay = true;
el.loop = true;
el.muted = true;
el.playsInline = true;
el.preload = 'auto';
el.src = '/promo-bg.mp4';
el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';

el.addEventListener('canplaythrough', () => {
  ready = true;
  listeners.forEach(fn => fn());
  listeners.clear();
}, { once: true });

/** Is the promo video fully buffered and ready to paint? */
export function isVideoReady() {
  return ready;
}

/** Call `fn` when video is ready (immediately if already cached) */
export function onVideoReady(fn) {
  if (ready) fn();
  else listeners.add(fn);
}

/** Get the persistent video element — attach to DOM, don't create a new one */
export function getVideoElement() {
  return el;
}
