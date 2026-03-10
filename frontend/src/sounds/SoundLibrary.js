/**
 * SoundLibrary — Event-to-sound mapping & playback manager
 *
 * Maps VI interaction events to ryos sound files.
 * Sound files from: https://github.com/ryokun6/ryos
 *
 * Usage:
 *   import { soundLibrary } from './sounds';
 *   soundLibrary.play('camera.shutter');
 */
import { playFile, prefetch } from './SoundEngine';

// ─── Event → Sound File Mapping ──────────────────────────────────────────────
// Each event maps to { file, volume?, playbackRate? }

const SOUND_MAP = {
  // Camera View
  'app.connect': { file: 'WindowFocus.mp3', volume: 0.35 },
  'camera.scan': { file: 'WindowMoveMoving.mp3', volume: 0.2, playbackRate: 1.3 },
  'camera.shutter': { file: 'PhotoShutter.mp3', volume: 0.6 },
  'camera.recordStart': { file: 'VideoTapeIn.mp3', volume: 0.5 },
  'camera.recordStop': { file: 'WindowMoveStop.mp3', volume: 0.4 },

  // Mic
  'mic.on': { file: 'MenuOpen.mp3', volume: 0.5 },
  'mic.off': { file: 'MenuClose.mp3', volume: 0.5 },

  // Card
  'card.update': { file: 'MenuItemHover.mp3', volume: 0.15 },
  'card.appear': { file: 'WindowFocus.mp3', volume: 0.4 },

  // Signal / Connection Status
  'signal.connected': { file: 'Beep.mp3', volume: 0.3 },
  'signal.weak': { file: 'AlertBonk.mp3', volume: 0.3 },
  'signal.disconnected': { file: 'Thump.mp3', volume: 0.3 },

  // Camera Controls
  'camera.flash': { file: 'Volume.mp3', volume: 0.3 },
  'camera.flip': { file: 'WindowControlClickUp.mp3', volume: 0.35 },

  // Media Stack
  'media.delete': { file: 'Thump.mp3', volume: 0.25, playbackRate: 1.2 },

  // Session View
  'session.enter': { file: 'WindowOpen.mp3', volume: 0.4 },
  'session.send': { file: 'EmailMailSent.mp3', volume: 0.45 },

  // Content Reveal
  'section.reveal': { file: 'WindowExpand.mp3', volume: 0.3 },

  // TODO Execution
  'todo.start': { file: 'Click.mp3', volume: 0.3 },
  'todo.substep': { file: 'InputRadioClickDown.mp3', volume: 0.08 },
  'todo.complete': { file: 'ButtonClickUp.mp3', volume: 0.4 },

  // Artifact
  'artifact.reveal': { file: 'WindowZoomMaximize.mp3', volume: 0.5 },
  'artifact.toggle': { file: 'MenuItemClick.mp3', volume: 0.4 },

  // Navigation
  'nav.forward': { file: 'WindowOpen.mp3', volume: 0.35 },
  'nav.back': { file: 'WindowClose.mp3', volume: 0.35 },
  'nav.history': { file: 'WindowCollapse.mp3', volume: 0.35 },
};

const MUTED_KEY = 'vi-sound-muted';

class SoundLibrary {
  constructor() {
    this.muted = this._loadMuted();
    // Prefetch all sound files on init
    const files = [...new Set(Object.values(SOUND_MAP).map(s => s.file))];
    prefetch(files);
  }

  play(eventName) {
    if (this.muted) return;
    const entry = SOUND_MAP[eventName];
    if (!entry) return;
    playFile(entry.file, {
      volume: entry.volume ?? 0.5,
      playbackRate: entry.playbackRate ?? 1,
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTED_KEY, String(this.muted)); } catch { /* ignored */ }
    return this.muted;
  }

  setMuted(val) {
    this.muted = !!val;
    try { localStorage.setItem(MUTED_KEY, String(this.muted)); } catch { /* ignored */ }
  }

  get eventNames() {
    return Object.keys(SOUND_MAP);
  }

  get soundMap() {
    return { ...SOUND_MAP };
  }

  _loadMuted() {
    try { return localStorage.getItem(MUTED_KEY) === 'true'; } catch { return false; }
  }
}

export const soundLibrary = new SoundLibrary();
