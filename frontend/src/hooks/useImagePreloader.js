import { useEffect, useRef } from 'react';

/**
 * Image cache with two strategies:
 * 1. Cache API + blob URL (best: persistent, instant render)
 * 2. Fallback: new Image() to warm HTTP cache (works everywhere)
 *
 * GCS signed URLs change on every API call, so we normalize the URL
 * (strip query params) as the cache key to avoid duplicate fetches.
 */

const CACHE_NAME = 'vi-image-cache-v1';
const isCacheApiAvailable = typeof caches !== 'undefined';

// In-memory: normalizedUrl → blobUrl
const blobUrlMap = new Map();
// Track in-flight operations
const pendingOps = new Set();

/** Normalize URL: strip query params for stable cache key */
function getCacheKey(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

/** Get cached blob URL, or null */
export function getCachedUrl(url) {
  if (!url) return null;
  return blobUrlMap.get(getCacheKey(url)) || null;
}

/** Check if cached */
export function isImageCached(url) {
  if (!url) return false;
  return blobUrlMap.has(getCacheKey(url));
}

/** Warm a single image into cache */
async function warmImage(url) {
  if (!url) return;
  const key = getCacheKey(url);
  if (blobUrlMap.has(key) || pendingOps.has(key)) return;
  pendingOps.add(key);

  try {
    // Strategy 1: Cache API + blob URL (persistent)
    if (isCacheApiAvailable) {
      try {
        const cache = await caches.open(CACHE_NAME);
        let resp = await cache.match(key);

        if (!resp) {
          resp = await fetch(url, { mode: 'cors' });
          if (resp.ok) {
            try { await cache.put(key, resp.clone()); } catch { /* storage full */ }
          } else {
            resp = null;
          }
        }

        if (resp) {
          const blob = await resp.blob();
          if (blob.size > 0) {
            blobUrlMap.set(key, URL.createObjectURL(blob));
            pendingOps.delete(key);
            return; // success
          }
        }
      } catch {
        // Cache API failed, fall through to Image() fallback
      }
    }

    // Strategy 2: new Image() to warm browser HTTP cache
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { blobUrlMap.set(key, url); resolve(); }; // store original URL as "cached"
      img.onerror = resolve;
      img.src = url;
    });
  } catch {
    // Silent fail
  } finally {
    pendingOps.delete(key);
  }
}

/**
 * Hook: preload array of image URLs.
 * No subscriber pattern — just warms cache in background.
 */
export function useImagePreloader(urls) {
  const prevRef = useRef('');

  useEffect(() => {
    if (!urls || urls.length === 0) return;

    const newUrls = urls.filter(u => u && !blobUrlMap.has(getCacheKey(u)) && !pendingOps.has(getCacheKey(u)));
    if (newUrls.length === 0) return;

    const sig = newUrls.map(getCacheKey).join(',');
    if (sig === prevRef.current) return;
    prevRef.current = sig;

    newUrls.forEach((url, i) => {
      setTimeout(() => warmImage(url), i * 30);
    });
  }, [urls]);
}

export default useImagePreloader;
