import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  LocalAudioTrack,
  ConnectionQuality,
  createLocalTracks,
} from 'livekit-client';
import { api } from '../services/api';
import { CANVAS_WIDTH, CANVAS_HEIGHT, CANVAS_FPS, CAMERA_FPS } from '../constants';

const QUALITY_MAP = {
  [ConnectionQuality.Excellent]: 'excellent',
  [ConnectionQuality.Good]: 'good',
  [ConnectionQuality.Poor]: 'poor',
  [ConnectionQuality.Lost]: 'lost',
  [ConnectionQuality.Unknown]: 'unknown',
};

// Token cache for fast reconnects (30s TTL)
const TOKEN_CACHE_TTL = 30000;
let _tokenCache = null; // { token, room_name, livekit_url, session_id, vi_user_id, _ts }

/**
 * Room connection, lifecycle, local tracks, mic control, audio management.
 * Accepts shared refs from the composition hook and an onRoomSetup callback
 * for the protocol layer to register handlers before connect().
 */
export function useRoomConnection({ onRoomSetup, roomRef, agentIdentityRef, audioContextRef }) {
  const [room, setRoom] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [connectionQuality, setConnectionQuality] = useState('unknown');
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [agentIdentity, setAgentIdentity] = useState(null);

  // Audio unblock tracking (persists across re-renders)
  const audioUnblockedRef = useRef(false);

  // Helper: set agent identity in both state and ref simultaneously
  const updateAgentIdentity = useCallback((identity) => {
    agentIdentityRef.current = identity;
    setAgentIdentity(identity);
  }, [agentIdentityRef]);

  // Fallback: publish canvas video + silent audio when real camera/mic not available
  const publishFallbackTracks = useCallback(async (newRoom) => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    grad.addColorStop(0, '#16213e');
    grad.addColorStop(1, '#0f3460');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#ffffff60';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Camera requires HTTPS', 320, 220);
    ctx.fillStyle = '#ffffff40';
    ctx.font = '14px sans-serif';
    ctx.fillText('Using placeholder video', 320, 250);

    const canvasStream = canvas.captureStream(CANVAS_FPS);
    const videoMediaTrack = canvasStream.getVideoTracks()[0];
    const fakeVideoTrack = new LocalVideoTrack(videoMediaTrack, undefined, false);
    await newRoom.localParticipant.publishTrack(fakeVideoTrack);
    setLocalVideoTrack(fakeVideoTrack);

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      oscillator.connect(gainNode);
      const dest = audioCtx.createMediaStreamDestination();
      gainNode.connect(dest);
      oscillator.start();
      const silentAudioTrack = dest.stream.getAudioTracks()[0];
      const fakeAudioTrack = new LocalAudioTrack(silentAudioTrack, undefined, false);
      await newRoom.localParticipant.publishTrack(fakeAudioTrack);
      setLocalAudioTrack(fakeAudioTrack);
    } catch (audioErr) {
      console.warn('[LiveKit] Could not create silent audio track:', audioErr);
    }
  }, []);

  // Resume AudioContext to allow agent voice playback (Chrome autoplay policy)
  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(e => console.warn('[LiveKit] AudioContext resume failed:', e));
      }
    } catch (e) {
      console.warn('[LiveKit] AudioContext resume failed:', e);
    }
  }, [audioContextRef]);

  const connectToRoom = useCallback(async (token, livekitUrl) => {
    // Clean up stale disconnected room before creating new one
    if (roomRef.current && roomRef.current.state === 'disconnected') {
      console.log('[RoomConnection] Cleaning up stale disconnected room');
      try { await roomRef.current.disconnect(); } catch (e) { /* ignore */ }
      roomRef.current = null;
      setRoom(null);
    }

    const newRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      autoSubscribe: true,
    });

    // Connection lifecycle events
    newRoom.on(RoomEvent.Connected, () => {
      setConnectionState('connected');
      newRoom.startAudio().catch(e => console.warn('[LiveKit] startAudio failed:', e));
    });
    newRoom.on(RoomEvent.Disconnected, () => { setConnectionState('disconnected'); setConnectionQuality('unknown'); });
    newRoom.on(RoomEvent.Reconnecting, () => setConnectionState('reconnecting'));
    newRoom.on(RoomEvent.Reconnected, () => {
      setConnectionState('connected');
      newRoom.startAudio().catch(e => console.warn('[LiveKit] startAudio failed:', e));
    });

    // Track connection quality for local participant
    newRoom.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (participant.isLocal) {
        setConnectionQuality(QUALITY_MAP[quality] || 'unknown');
      }
    });

    // Track agent participant for RPC calls
    newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
      if (participant.identity.startsWith('agent-')) {
        updateAgentIdentity(participant.identity);
      }
    });
    newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (participant.identity.startsWith('agent-')) {
        let remainingAgent = null;
        for (const p of newRoom.remoteParticipants.values()) {
          if (p.identity.startsWith('agent-') && p.identity !== participant.identity) {
            remainingAgent = p.identity;
            break;
          }
        }
        if (remainingAgent) {
          updateAgentIdentity(remainingAgent);
        } else {
          updateAgentIdentity(null);
        }
      }
    });

    // Handle remote audio tracks (agent voice output)
    // Track restart listeners for cleanup
    const trackRestartListeners = new Map();

    newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio && participant.identity.startsWith('agent-')) {
        ensureAudioContext();
        newRoom.startAudio().catch(e => console.warn('[LiveKit] startAudio failed:', e));

        // Deduplicate: if this publication.sid already has an audio element, skip
        const audioId = `agent-audio-${participant.identity}-${publication.sid}`;
        if (document.getElementById(audioId)) {
          console.log('[LiveKit] Audio element already exists for', audioId, '— skipping');
          return;
        }

        try {
          const audioEl = track.attach();
          audioEl.id = audioId;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);

          const tryPlay = () => {
            audioEl.play().then(() => {
              document.querySelectorAll('audio[id^="agent-audio-"]').forEach(el => {
                if (el !== audioEl) {
                  el.pause();
                  el.srcObject = null;
                  el.remove();
                }
              });
            }).catch(() => {
              console.log('[LiveKit] Audio autoplay blocked, will play on user interaction');
            });
          };
          tryPlay();

          // Clean up any previous listener for this track before adding new one
          const prevListener = trackRestartListeners.get(track.sid);
          if (prevListener) {
            track.off('Restarted', prevListener);
          }
          track.on('Restarted', tryPlay);
          trackRestartListeners.set(track.sid, tryPlay);
        } catch (e) {
          console.warn('[LiveKit] Failed to attach agent audio track:', e.message);
        }
      }
    });
    newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio && participant.identity.startsWith('agent-')) {
        // Clean up Restarted listener
        const listener = trackRestartListeners.get(track.sid);
        if (listener) {
          track.off('Restarted', listener);
          trackRestartListeners.delete(track.sid);
        }
        const elements = track.detach();
        elements.forEach(el => { el.pause(); el.srcObject = null; el.remove(); });
      }
    });

    // Allow protocol layer to register RPC methods + DataReceived before connect
    if (onRoomSetup) {
      onRoomSetup(newRoom);
    }

    // Start local track creation in parallel with room connection
    const localTracksPromise = createLocalTracks({
      audio: true,
      video: {
        facingMode: 'environment',
        resolution: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, frameRate: CAMERA_FPS },
      },
    }).catch((err) => {
      console.warn('[LiveKit] Local track creation failed (will use fallback):', err.message);
      return null;
    });

    // Connect with retry
    const MAX_RETRIES = 3;
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await newRoom.connect(livekitUrl, token);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.error(`Connection attempt ${attempt + 1} failed:`, err);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    if (lastError) throw lastError;

    // Check for already-present agent participant
    for (const p of newRoom.remoteParticipants.values()) {
      if (p.identity.startsWith('agent-')) {
        updateAgentIdentity(p.identity);
        break;
      }
    }

    // Await the pre-started local tracks and publish them
    const tracks = await localTracksPromise;
    if (tracks) {
      try {
        for (const track of tracks) {
          await newRoom.localParticipant.publishTrack(track);
          if (track.kind === Track.Kind.Video) {
            setLocalVideoTrack(track);
          } else if (track.kind === Track.Kind.Audio) {
            setLocalAudioTrack(track);
          }
        }
      } catch (publishError) {
        console.warn('[LiveKit] Track publish failed:', publishError.message);
        try {
          await publishFallbackTracks(newRoom);
        } catch (fallbackErr) {
          console.warn('[LiveKit] Fallback tracks also failed:', fallbackErr.message);
        }
      }
    } else {
      // Real tracks failed — use fallback
      try {
        await publishFallbackTracks(newRoom);
      } catch (fallbackErr) {
        console.warn('[LiveKit] Fallback tracks also failed:', fallbackErr.message);
      }
    }

    roomRef.current = newRoom;
    setRoom(newRoom);
    setConnectionState('connected');

    return newRoom;
  }, [onRoomSetup, updateAgentIdentity, ensureAudioContext, publishFallbackTracks, roomRef]);

  // Connect to LiveKit — requires Firebase auth (user must be logged in)
  const connect = useCallback(async () => {
    try {
      setConnectionState('connecting');

      const { auth } = await import('../services/firebase.js');
      if (!auth.currentUser) {
        console.warn('[LiveKit] No authenticated user — cannot connect');
        setConnectionState('disconnected');
        return;
      }

      let tokenData;
      if (_tokenCache && (Date.now() - _tokenCache._ts) < TOKEN_CACHE_TTL) {
        tokenData = _tokenCache;
      } else {
        tokenData = await api.getLiveKitToken();
        _tokenCache = { ...tokenData, _ts: Date.now() };
      }

      const { token, livekit_url, session_id } = tokenData;
      if (session_id) setSessionId(session_id);
      await connectToRoom(token, livekit_url);
    } catch (err) {
      console.error('Failed to connect to LiveKit:', err);
      _tokenCache = null;
      setConnectionState('error');
    }
  }, [connectToRoom]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      setRoom(null);
      setLocalVideoTrack(null);
      setLocalAudioTrack(null);
      setConnectionState('disconnected');
      updateAgentIdentity(null);
    }
  }, [roomRef, updateAgentIdentity]);

  const toggleMic = useCallback(async () => {
    if (roomRef.current) {
      ensureAudioContext();
      roomRef.current.startAudio().catch(e => console.warn('[LiveKit] startAudio failed:', e));
      const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
      setIsMicEnabled(!enabled);
      // Silent mode: mute/unmute agent audio when user toggles mic
      document.querySelectorAll('audio[id^="agent-audio-"]').forEach(el => {
        el.muted = enabled; // mic was enabled → now disabling → mute agent
        if (!enabled && el.paused) {
          el.play().catch(e => console.warn('[LiveKit] Audio play failed:', e));
        }
      });
    }
  }, [roomRef, ensureAudioContext]);

  // Enable/disable camera track
  const setCameraEnabled = useCallback(async (enabled) => {
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setCameraEnabled(enabled);
      } catch (e) {
        console.warn('[LiveKit] setCameraEnabled error:', e.message);
      }
    }
  }, [roomRef]);

  // State for camera facing
  const [facingMode, setFacingMode] = useState('environment');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const facingModeRef = useRef('environment');
  const switchingRef = useRef(false);

  // Switch between front and back camera
  const switchCamera = useCallback(async () => {
    if (!roomRef.current || switchingRef.current) return;
    switchingRef.current = true;
    const newFacing = facingModeRef.current === 'environment' ? 'user' : 'environment';
    try {
      // Stop camera hardware FIRST, then unpublish (release hardware before signaling)
      const currentTrack = roomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
      if (currentTrack?.track) {
        currentTrack.track.stop();
        await roomRef.current.localParticipant.unpublishTrack(currentTrack.track);
      }

      // Wait for mobile camera hardware to fully release
      await new Promise(r => setTimeout(r, 300));

      // Use exact facingMode to force camera switch on mobile
      const [newTrack] = await createLocalTracks({
        audio: false,
        video: {
          facingMode: { exact: newFacing },
          resolution: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, frameRate: CAMERA_FPS },
        },
      });

      // Publish the new track and update state
      await roomRef.current.localParticipant.publishTrack(newTrack);
      setLocalVideoTrack(newTrack);
      facingModeRef.current = newFacing;
      setFacingMode(newFacing);
      setTorchEnabled(false);
    } catch (e) {
      console.warn('[LiveKit] Camera switch (exact) failed, trying ideal:', e.message);
      // exact facingMode may fail on some devices — fall back to ideal constraint
      try {
        const [fallbackTrack] = await createLocalTracks({
          audio: false,
          video: {
            facingMode: newFacing,
            resolution: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, frameRate: CAMERA_FPS },
          },
        });
        await roomRef.current.localParticipant.publishTrack(fallbackTrack);
        setLocalVideoTrack(fallbackTrack);
        facingModeRef.current = newFacing;
        setFacingMode(newFacing);
        setTorchEnabled(false);
      } catch (fallbackErr) {
        console.warn('[LiveKit] Camera switch fallback also failed:', fallbackErr.message);
      }
    } finally {
      switchingRef.current = false;
    }
  }, [roomRef]);

  // Toggle torch (flashlight) — only works on rear camera
  const toggleTorch = useCallback(async () => {
    if (facingModeRef.current !== 'environment') return;
    const currentTrack = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
    const mediaTrack = currentTrack?.track?.mediaStreamTrack;
    if (!mediaTrack) return;
    try {
      const newTorch = !torchEnabled;
      await mediaTrack.applyConstraints({
        advanced: [{ torch: newTorch }],
      });
      setTorchEnabled(newTorch);
    } catch (e) {
      console.warn('[LiveKit] Torch toggle failed:', e.message);
    }
  }, [roomRef, facingMode, torchEnabled]);

  // Unblock audio on user gestures (Chrome/Safari autoplay policy)
  useEffect(() => {
    const unblockAudio = () => {
      if (audioUnblockedRef.current) return; // Already unblocked, skip
      ensureAudioContext();
      if (roomRef.current) {
        roomRef.current.startAudio().then(() => {
          audioUnblockedRef.current = true;
        }).catch(e => console.warn('[LiveKit] startAudio unblock failed:', e));
      }
      document.querySelectorAll('audio[id^="agent-audio-"]').forEach(el => {
        if (el.paused && !el.muted) {
          el.play().then(() => {
            audioUnblockedRef.current = true;
          }).catch(e => console.warn('[LiveKit] Audio play unblock failed:', e));
        }
      });
    };
    document.addEventListener('click', unblockAudio);
    document.addEventListener('touchstart', unblockAudio);
    return () => {
      document.removeEventListener('click', unblockAudio);
      document.removeEventListener('touchstart', unblockAudio);
    };
  }, [ensureAudioContext, roomRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, [roomRef]);

  return {
    room,
    connectionState,
    connectionQuality,
    localVideoTrack,
    localAudioTrack,
    isMicEnabled,
    sessionId,
    agentIdentity,
    connect,
    disconnect,
    toggleMic,
    setCameraEnabled,
    facingMode,
    torchEnabled,
    switchCamera,
    toggleTorch,
    ensureAudioContext,
  };
}
