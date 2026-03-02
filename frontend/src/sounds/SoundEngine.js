/**
 * SoundEngine — MP3 audio playback engine
 *
 * Uses ryos sound library (https://github.com/ryokun6/ryos).
 * Manages AudioContext, caching, and concurrent playback.
 * Stops previous sounds when a new sound plays.
 */

let audioCtx = null;
const bufferCache = new Map();
const pendingLoads = new Map();

// Track all active sources so we can stop them
const activeSources = new Set();

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(e => console.debug('[audio] AudioContext resume blocked:', e.message));
  }
  return audioCtx;
}

async function loadBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  if (pendingLoads.has(url)) return pendingLoads.get(url);

  const promise = fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => getCtx().decodeAudioData(buf))
    .then(decoded => {
      bufferCache.set(url, decoded);
      pendingLoads.delete(url);
      return decoded;
    })
    .catch(() => {
      pendingLoads.delete(url);
      return null;
    });

  pendingLoads.set(url, promise);
  return promise;
}

/**
 * Stop all currently playing sounds immediately.
 */
export function stopAll() {
  activeSources.forEach(({ source, gain }) => {
    try {
      // Quick fade-out to avoid click (5ms)
      gain.gain.setValueAtTime(gain.gain.value, getCtx().currentTime);
      gain.gain.linearRampToValueAtTime(0, getCtx().currentTime + 0.005);
      source.stop(getCtx().currentTime + 0.006);
    } catch { /* already stopped */ }
  });
  activeSources.clear();
}

/**
 * Play a sound file from /sounds/ directory.
 * Stops any currently playing sounds first.
 * @param {string} filename - e.g. "PhotoShutter.mp3"
 * @param {object} opts - { volume: 0-1, playbackRate: 0.5-2 }
 */
export async function playFile(filename, { volume = 0.5, playbackRate = 1 } = {}) {
  const ctx = getCtx();
  const url = `/sounds/${filename}`;
  const buffer = await loadBuffer(url);
  if (!buffer) return;

  // If context is still suspended (no user interaction yet), skip silently
  if (ctx.state === 'suspended') return;

  // Stop all previous sounds before playing new one
  stopAll();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain).connect(ctx.destination);

  const entry = { source, gain };
  activeSources.add(entry);

  // Auto-remove when finished
  source.onended = () => {
    activeSources.delete(entry);
  };

  source.start(0);
}

/**
 * Prefetch sound files into cache for instant playback.
 */
export function prefetch(filenames) {
  filenames.forEach(f => loadBuffer(`/sounds/${f}`));
}
