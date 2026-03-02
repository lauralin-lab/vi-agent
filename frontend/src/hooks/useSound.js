/**
 * useSound — React hook for VI sound system
 *
 * Usage:
 *   const { play } = useSound();
 *   play('camera.shutter');
 */
import { useCallback } from 'react';
import { soundLibrary } from '../sounds';

export default function useSound() {
  const play = useCallback((eventName) => {
    soundLibrary.play(eventName);
  }, []);

  return { play };
}
