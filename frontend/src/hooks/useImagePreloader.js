import { useEffect, useRef } from 'react';

/**
 * Global image preload cache.
 * Uses `new Image()` to warm the browser's HTTP cache.
 * Once loaded, the browser serves it from disk/memory cache on subsequent requests.
 */
const loadedUrls = new Set();
const loadingUrls = new Set();

/** Preload a single image URL into browser cache */
function preloadImage(url) {
  if (!url || loadedUrls.has(url) || loadingUrls.has(url)) return;
  loadingUrls.add(url);
  const img = new Image();
  img.onload = () => {
    loadedUrls.add(url);
    loadingUrls.delete(url);
  };
  img.onerror = () => {
    loadingUrls.delete(url);
  };
  img.src = url;
}

/** Check if an image URL is already cached */
export function isImageCached(url) {
  return loadedUrls.has(url);
}

/**
 * Hook: preload an array of image URLs in the background.
 * Call this in HistoryView after fetching sessions to warm the cache.
 */
export function useImagePreloader(urls) {
  const prevRef = useRef([]);

  useEffect(() => {
    if (!urls || urls.length === 0) return;
    // Only preload new URLs not already queued
    const newUrls = urls.filter(u => u && !loadedUrls.has(u));
    if (newUrls.length === 0) return;
    // Avoid redundant work on same array
    const key = newUrls.join(',');
    const prevKey = prevRef.current.join(',');
    if (key === prevKey) return;
    prevRef.current = newUrls;

    // Stagger preloads to avoid blocking the main thread
    newUrls.forEach((url, i) => {
      setTimeout(() => preloadImage(url), i * 50);
    });
  }, [urls]);
}

export default useImagePreloader;
