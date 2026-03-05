import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Mic, MicOff, Wifi, WifiOff,
  Loader2, Upload, Check, ScanLine, CheckCircle2, X, Edit3,
  Search, Languages, Eye, Sparkles, Receipt, ShoppingBag,
  RefreshCw
} from 'lucide-react';
import MatrixScanOverlay from './MatrixScanOverlay';

// Map detected intent → icon component for dynamic shutter
const INTENT_ICONS = {
  search: Search,
  analyze: Search,
  scan: ScanLine,
  create: Sparkles,
  shop: ShoppingBag,
  identify: Eye,
  translate: Languages,
  receipt: Receipt,
};

// Map detected intent → color classes for shutter glow
const INTENT_COLORS = {
  search: 'text-blue-400',
  analyze: 'text-blue-400',
  scan: 'text-cyan-400',
  create: 'text-white/70',
  shop: 'text-yellow-400',
  identify: 'text-emerald-400',
  translate: 'text-indigo-400',
  receipt: 'text-orange-400',
};

// Map agent action → border color + glow for shutter ring
const ACTION_GLOW = {
  dispatch: { border: 'border-green-400/60', shadow: '0 0 25px rgba(34,197,94,0.4)' },
  ready: { border: 'border-green-400/60', shadow: '0 0 25px rgba(34,197,94,0.4)' },
  done: { border: 'border-green-400/60', shadow: '0 0 25px rgba(34,197,94,0.4)' },
  capture: { border: 'border-cyan-400/60', shadow: '0 0 25px rgba(34,211,238,0.4)' },
  scan: { border: 'border-cyan-400/60', shadow: '0 0 25px rgba(34,211,238,0.4)' },
  search: { border: 'border-blue-400/60', shadow: '0 0 25px rgba(96,165,250,0.4)' },
};
import Card, { computeAgentStatus } from './Card';
import GalleryView from './GalleryView';
import useSound from '../hooks/useSound';
import { api } from '../services/api';

export default function LiveCameraView({
  livekit,
  onOpenHistory,
  onViewResult,
}) {
  const { play } = useSound();
  const videoRef = useRef(null);

  // Detect if front camera is active (mirror the preview like native camera)
  const isFrontCamera = (() => {
    const track = livekit.localVideoTrack;
    if (!track) return false;
    // Check actual hardware facingMode from track settings
    const settings = track.mediaStreamTrack?.getSettings?.();
    if (settings?.facingMode) return settings.facingMode === 'user';
    // Fallback: desktop webcams have no facingMode → treat as front camera
    return livekit.facingMode !== 'environment' || !('ontouchstart' in window);
  })();

  // Card state — driven by agent transcripts
  const [showCard, setShowCard] = useState(true);
  const [cardText, setCardText] = useState("Connecting to AI...");
  const [isMicOn, setIsMicOn] = useState(livekit.isMicEnabled !== false);

  // Intention Card state — editable user intention
  const [editedIntention, setEditedIntention] = useState('');
  const [isIntentionEdited, setIsIntentionEdited] = useState(false);
  const intentionInputRef = useRef(null);

  // Clear intention on camera re-entry (component mount)
  useEffect(() => {
    livekit.clearIntention?.();
    setEditedIntention('');
    setIsIntentionEdited(false);
  }, []);

  // Sync agent intention to editedIntention (only when user hasn't manually edited)
  useEffect(() => {
    if (livekit.intentionText && !isIntentionEdited) {
      setEditedIntention(livekit.intentionText);
    }
  }, [livekit.intentionText, isIntentionEdited]);

  // Keep local mic state in sync with LiveKit (fixes mic state after returning from other views)
  useEffect(() => {
    setIsMicOn(livekit.isMicEnabled !== false);
  }, [livekit.isMicEnabled]);

  // Media capture state
  const [capturedMedia, setCapturedMedia] = useState([]);
  const capturedMediaRef = useRef(capturedMedia);
  useEffect(() => { capturedMediaRef.current = capturedMedia; }, [capturedMedia]);
  // Track pending upload promises so handleDone can wait for them
  const uploadPromisesRef = useRef([]);
  const [showGallery, setShowGallery] = useState(false);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const [stackBounce, setStackBounce] = useState(false);
  const stackLongPressRef = useRef(null);

  // ── Agent Status State Machine ──
  const agentComputedStatus = computeAgentStatus({
    agentIdentity: livekit.agentIdentity,
    greetingReceived: livekit.greetingReceived,
    userSpeaking: false, // TODO: wire up actual VAD signal; isMicOn is mic-enabled, not speaking
    agentGenerating: !!livekit.taskProgress,
    cameraActive: !!livekit.localVideoTrack,
    connectionQuality: livekit.connectionQuality,
  });

  // Connection icon — derived from computed status for top bar
  const connectionIcon = (() => {
    const state = livekit.connectionState;
    if (state === 'disconnected' || state === 'error') return 'offline';
    if (state === 'reconnecting') return 'weak';
    if (agentComputedStatus === 'offline') return 'offline';
    if (agentComputedStatus === 'weak_connection') return 'weak';
    if (agentComputedStatus === 'connecting') return 'connecting';
    return 'connected';
  })();

  // Shutter & recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const isLongPressRef = useRef(false);
  const justStartedRecordingRef = useRef(false);
  const pointerCapturedRef = useRef(false); // Track if onPointerUp already triggered photo capture

  // MediaRecorder for real video capture
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const autoStopTimerRef = useRef(null);
  const recordedMimeRef = useRef('video/webm');

  // Capture animation
  const [showCaptureAnim, setShowCaptureAnim] = useState(false);

  // Stack status animation
  const [stackStatus, setStackStatus] = useState('IDLE');

  // Scanning effect
  const [isScanning, setIsScanning] = useState(false);
  const scanTimerRef = useRef(null);

  // Agent-driven viewfinder overlays
  const [emojiRain, setEmojiRain] = useState(null); // {emojis: [...], duration: 3000}
  const [uiBadge, setUiBadge] = useState(null);     // {text, position, color, duration}
  const overlayTimerRef = useRef(null);

  // Pre-compute emoji rain positions/sizes once per rain trigger (avoids re-randomizing on re-render)
  const [emojiRainParticles, setEmojiRainParticles] = useState([]);
  useEffect(() => {
    if (emojiRain) {
      setEmojiRainParticles(Array.from({ length: 25 }, (_, i) => ({
        x: Math.random() * 90 + 5,
        scale: 0.5 + Math.random(),
        fontSize: 20 + Math.random() * 20,
        delay: Math.random() * 1.5,
        duration: 2 + Math.random() * 2,
        rotate: Math.random() * 360,
        emojiIndex: i % emojiRain.emojis.length,
      })));
    }
  }, [emojiRain]);

  // Track the latest card text for dispatch
  const lastCardTextRef = useRef('');
  useEffect(() => { lastCardTextRef.current = cardText; }, [cardText]);

  // ── Attach LiveKit video track to video element ──
  useEffect(() => {
    if (livekit.localVideoTrack && videoRef.current) {
      const videoEl = videoRef.current;
      livekit.localVideoTrack.attach(videoEl);
      return () => {
        livekit.localVideoTrack.detach(videoEl);
      };
    }
  }, [livekit.localVideoTrack]);

  // ── Handle LiveKit connection state → card text + scan effect ──
  useEffect(() => {
    switch (livekit.connectionState) {
      case 'connected':
        setIsScanning(true);
        scanTimerRef.current = setTimeout(() => setIsScanning(false), 2500);
        break;
      case 'connecting':
        if (!livekit.lastAgentText) {
          setCardText("Connecting to AI...");
        }
        break;
      case 'error':
      case 'disconnected':
        setCardText("Offline. Tap to reconnect.");
        break;
    }
  }, [livekit.connectionState]);

  // ── Show status when agent joins/leaves ──
  useEffect(() => {
    if (livekit.connectionState === 'connected' && !livekit.agentIdentity) {
      if (!livekit.lastAgentText) {
        setCardText("Waiting for AI agent...");
      }
    }
  }, [livekit.agentIdentity, livekit.connectionState, livekit.lastAgentText]);

  // ── Show initial greeting when agent joins and is ready ──
  useEffect(() => {
    if (livekit.agentIdentity && livekit.connectionState === 'connected' && !livekit.lastAgentText) {
      setCardText("Point your camera at anything");
      setShowCard(true);
    }
  }, [livekit.agentIdentity, livekit.connectionState, livekit.lastAgentText]);

  // ── Handle agent transcripts → update card text ──
  useEffect(() => {
    if (livekit.lastAgentText && !livekit.lastAgentText.startsWith('[SYSTEM')) {
      setCardText(livekit.lastAgentText);
      setShowCard(true);
    }
  }, [livekit.lastAgentText]);


  // Results are now handled in LiveSessionView (user navigates there immediately on Done)

  // ── Handle agent-driven viewfinder overlays ──
  useEffect(() => {
    if (!livekit.viewfinderOverlay) return;
    const overlay = livekit.viewfinderOverlay;

    if (overlay.overlay_type === 'scan') {
      setIsScanning(true);
      scanTimerRef.current = setTimeout(() => setIsScanning(false), overlay.duration || 2000);
    }
    else if (overlay.overlay_type === 'emoji_rain') {
      setEmojiRain({ emojis: overlay.emojis || ['✨'], duration: overlay.duration || 3000 });
      overlayTimerRef.current = setTimeout(() => setEmojiRain(null), overlay.duration || 3000);
    }
    else if (overlay.overlay_type === 'ui_badge') {
      setUiBadge({ text: overlay.text, position: overlay.position || 'top-center', color: overlay.color || 'blue' });
      overlayTimerRef.current = setTimeout(() => setUiBadge(null), overlay.duration || 3000);
    }
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [livekit.viewfinderOverlay]);

  // ── Recording timer ──
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
    }
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  // Cleanup MediaRecorder and timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(autoStopTimerRef.current);
      clearTimeout(scanTimerRef.current);
      clearTimeout(overlayTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ── Upload photo to S3 and update media entry with public URL ──
  const uploadToS3 = useCallback(async (dataUrl) => {
    const promise = (async () => {
      try {
        setStackStatus('UPLOADING');
        const publicUrl = await api.uploadDataUrl(dataUrl);
        // Update the media entry matching this src with the S3 URL
        setCapturedMedia(prev => prev.map(item =>
          item.src === dataUrl ? { ...item, s3Url: publicUrl } : item
        ));
        setStackStatus('ANALYZING');
        setTimeout(() => {
          setStackStatus('READY');
          setTimeout(() => setStackStatus('IDLE'), 1500);
        }, 1200);
        console.log('[S3] Photo uploaded:', publicUrl);
        return publicUrl;
      } catch (err) {
        console.error('[S3] Upload failed:', err);
        setStackStatus('READY');
        setTimeout(() => setStackStatus('IDLE'), 1500);
        return null;
      }
    })();
    uploadPromisesRef.current.push(promise);
    return promise;
  }, []);

  // ── Upload video blob to S3 ──
  const uploadVideoToS3 = useCallback(async (blob, ext, thumbnailSrc) => {
    const promise = (async () => {
      try {
        setStackStatus('UPLOADING');
        const publicUrl = await api.uploadBlob(blob, ext);
        setCapturedMedia(prev => prev.map(item =>
          item.src === thumbnailSrc ? { ...item, s3Url: publicUrl } : item
        ));
        setStackStatus('ANALYZING');
        setTimeout(() => {
          setStackStatus('READY');
          setTimeout(() => setStackStatus('IDLE'), 1500);
        }, 1200);
        console.log('[S3] Video uploaded:', publicUrl);
        return publicUrl;
      } catch (err) {
        console.error('[S3] Video upload failed:', err);
        setStackStatus('READY');
        setTimeout(() => setStackStatus('IDLE'), 1500);
        return null;
      }
    })();
    uploadPromisesRef.current.push(promise);
    return promise;
  }, []);

  // ── Helper: draw video frame to canvas, mirror if front camera ──
  const drawVideoToCanvas = useCallback((video, canvas, ctx) => {
    if (isFrontCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (isFrontCamera) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
    }
  }, [isFrontCamera]);

  // ── Photo capture from real video stream ──
  const capturePhotoFromVideo = useCallback(async () => {
    // Skip livekit.capturePhoto() — it doesn't mirror for front camera
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      drawVideoToCanvas(videoRef.current, canvas, ctx);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  }, [drawVideoToCanvas]);

  // ── Shutter handlers ──
  const captureVideoThumbnail = useCallback(() => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      drawVideoToCanvas(videoRef.current, canvas, ctx);
      return canvas.toDataURL('image/jpeg', 0.6);
    }
    return null;
  }, [drawVideoToCanvas]);

  const stopVideoRecording = useCallback(() => {
    clearTimeout(autoStopTimerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;

    // Capture thumbnail from live feed before recorder stops
    const thumbnail = captureVideoThumbnail();

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mime = recordedMimeRef.current;
        const blob = new Blob(videoChunksRef.current, { type: mime });
        videoChunksRef.current = [];
        mediaRecorderRef.current = null;
        resolve({ blob, src: thumbnail || URL.createObjectURL(blob), ext: mime.includes('mp4') ? 'mp4' : 'webm' });
      };
      recorder.stop();
    });
  }, [captureVideoThumbnail]);

  const startMediaRecorder = useCallback(() => {
    try {
      // Get stream from video element or livekit track
      let stream = null;
      if (livekit.localVideoTrack?.mediaStreamTrack) {
        stream = new MediaStream([livekit.localVideoTrack.mediaStreamTrack]);
      } else if (videoRef.current?.srcObject) {
        stream = videoRef.current.srcObject;
      } else if (videoRef.current?.captureStream) {
        stream = videoRef.current.captureStream();
      }
      if (!stream || !window.MediaRecorder) return false;

      // Pick best mime type
      const mimeOptions = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || '';
      if (!mime) return false;

      recordedMimeRef.current = mime;
      videoChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.start(500); // collect chunks every 500ms
      mediaRecorderRef.current = recorder;

      // Auto-stop at 30 seconds
      autoStopTimerRef.current = setTimeout(async () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          play('camera.recordStop');
          setIsRecording(false);
          isLongPressRef.current = false;
          const result = await stopVideoRecording();
          if (result) {
            const { blob, src, ext } = result;
            setCapturedMedia(prev => [{ type: 'video', src, blob }, ...prev].slice(0, 8));
            uploadVideoToS3(blob, ext, src);
          }
        }
      }, 30000);

      return true;
    } catch (err) {
      console.warn('[MediaRecorder] Failed to start:', err);
      return false;
    }
  }, [livekit.localVideoTrack, stopVideoRecording, play, uploadVideoToS3]);

  const handleShutterDown = () => {
    if (isRecording) return;
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      justStartedRecordingRef.current = true;
      setIsRecording(true);
      play('camera.recordStart');
      startMediaRecorder();
    }, 500);
  };

  const handleShutterUp = () => {
    clearTimeout(longPressTimerRef.current);
    if (isRecording) return;
    if (!isLongPressRef.current) {
      pointerCapturedRef.current = true; // Mark that pointer event handled the capture
      play('camera.shutter');
      setShowCaptureAnim(true);
      setTimeout(async () => {
        setShowCaptureAnim(false);
        const photoSrc = await capturePhotoFromVideo();
        if (photoSrc) {
          // Use functional update to avoid stale closure over capturedMedia
          setCapturedMedia(prev => [{ type: 'photo', src: photoSrc }, ...prev].slice(0, 8));
          setStackBounce(true);
          setTimeout(() => setStackBounce(false), 400);
          // Upload deferred to handleDone
        }
      }, 600);
    }
    isLongPressRef.current = false;
  };

  const handleShutterClick = () => {
    if (justStartedRecordingRef.current) {
      justStartedRecordingRef.current = false;
      return;
    }
    if (isRecording) {
      play('camera.recordStop');
      setIsRecording(false);
      isLongPressRef.current = false;

      // Stop real video recording if active
      const videoPromise = stopVideoRecording();
      if (videoPromise) {
        videoPromise.then((result) => {
          if (result) {
            const { blob, src, ext } = result;
            setCapturedMedia(prev => [{ type: 'video', src, blob }, ...prev].slice(0, 8));
            uploadVideoToS3(blob, ext, src);
          }
        });
      } else {
        // Fallback: capture still frame if MediaRecorder wasn't running
        setShowCaptureAnim(true);
        setTimeout(async () => {
          setShowCaptureAnim(false);
          const photoSrc = await capturePhotoFromVideo();
          if (photoSrc) {
            setCapturedMedia(prev => [{ type: 'video', src: photoSrc }, ...prev].slice(0, 8));
            uploadToS3(photoSrc);
          }
        }, 600);
      }
      return;
    }
    // Fallback photo capture: if onPointerUp didn't fire (some browsers/touch cases),
    // capture here instead. pointerCapturedRef prevents double-capture.
    if (pointerCapturedRef.current) {
      pointerCapturedRef.current = false;
      return;
    }
    // Not recording, pointer didn't capture — take a photo as fallback
    play('camera.shutter');
    setShowCaptureAnim(true);
    setTimeout(async () => {
      setShowCaptureAnim(false);
      const photoSrc = await capturePhotoFromVideo();
      if (photoSrc) {
        setCapturedMedia(prev => [{ type: 'photo', src: photoSrc }, ...prev].slice(0, 8));
        setStackBounce(true);
        setTimeout(() => setStackBounce(false), 400);
        // Upload deferred to handleDone
      }
    }, 600);
  };

  // ── Done handler: send intention + photo URLs to agent via RPC, navigate immediately ──
  const doneClickedRef = useRef(false);
  // Reset done guard when component mounts (returning from session view)
  useEffect(() => {
    doneClickedRef.current = false;
  }, []);
  const handleDone = async () => {
    if (doneClickedRef.current) return;
    doneClickedRef.current = true;
    play('session.send');

    // User-edited intention takes priority, then agent intention, then card text
    const finalIntention = editedIntention.trim() || livekit.intentionText || (capturedMedia.length > 0 ? 'Analyze this photo' : lastCardTextRef.current);

    // Capture refs before navigation unmounts this component
    const dispatch = livekit.sendDispatch;
    const mediaSnapshot = capturedMediaRef.current.slice();

    // Trigger uploads for any media not yet uploaded
    for (const item of capturedMediaRef.current) {
      if (!item.s3Url && item.src) {
        if (item.type === 'video' && item.blob) {
          uploadVideoToS3(item.blob, 'webm', item.src);
        } else {
          uploadToS3(item.src);
        }
      }
    }

    // Navigate immediately — session view streams content via LiveKit data channel
    play('session.enter');
    onViewResult(null, capturedMedia, finalIntention);

    // Wait for all uploads to complete (max 10s), collect URLs from promises directly
    // (capturedMediaRef won't update after navigation unmounts this component)
    const pendingPromises = [...uploadPromisesRef.current];
    let allUrls = [];
    if (pendingPromises.length > 0) {
      const results = await Promise.race([
        Promise.allSettled(pendingPromises),
        new Promise(resolve => setTimeout(resolve, 10000)),
      ]);
      if (Array.isArray(results)) {
        allUrls = results
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value);
      }
    }

    // Fallback: if promises didn't yield URLs, try the snapshot (which captured refs before unmount)
    if (allUrls.length === 0 && mediaSnapshot.length > 0) {
      allUrls = mediaSnapshot.filter(m => m.s3Url).map(m => m.s3Url);
    }

    // V5: Dispatch exec request via REST → Redis → NanoClaw.
    const prompt = finalIntention || 'Analyze this photo';
    try {
      await api.dispatchExec({
        prompt,
        mediaUrls: allUrls,
        priority: 'thorough',
      });
      console.log('[redis][frontend] Exec dispatched:', prompt, allUrls.length, 'media files');
    } catch (e) {
      console.error('[redis][frontend] Failed to dispatch exec:', e);
    }
  };

  // ── Action card option handler ──
  const handleActionCardOption = (option) => {
    api.dispatchExec({ prompt: option }).catch(e => console.error('[action] dispatch failed:', e));
    livekit.dismissActionCard?.();
  };

  // ── Mic toggle ──
  const handleMicToggle = () => {
    livekit?.ensureAudioContext?.();
    if (isMicOn) {
      play('mic.off');
      livekit.toggleMic();
      setIsMicOn(false);
    } else {
      play('mic.on');
      livekit.toggleMic();
      setIsMicOn(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative w-full h-full flex flex-col bg-black pb-0 md:pb-4"
    >
      <GalleryView
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        onSelect={(photoSrc) => { setShowGallery(false); }}
      />

      {/* Fullscreen Viewfinder */}
      <div className="absolute inset-0 overflow-hidden" style={{ background: '#0a0a0a' }}>
        {livekit.localVideoTrack ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={isFrontCamera ? { transform: 'scaleX(-1)' } : undefined}
          />
        ) : (
          /* ── Beautiful no-camera fallback ── */
          <div className="absolute inset-0 texture-grain">
            {/* Ambient radial glow */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 35% 55%, rgba(255,255,255,0.03) 0%, transparent 55%), radial-gradient(ellipse at 72% 28%, rgba(6,182,212,0.05) 0%, transparent 50%)',
            }} />
            {/* Subtle grid */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.025]" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }} />
            {/* Center icon + status */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
              <motion.div
                animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0.9, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 0 40px rgba(255,255,255,0.03)',
                }}
              >
                <Eye size={32} strokeWidth={1} className="text-white/20" />
              </motion.div>
              <div className="flex flex-col items-center gap-1.5">
                {livekit.connectionState === 'connecting' ? (
                  <>
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="flex items-center gap-2"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400/60 animate-pulse" />
                      <span className="font-mono text-white/30 tracking-[0.2em] uppercase" style={{ fontSize: '9px' }}>
                        Connecting
                      </span>
                    </motion.div>
                  </>
                ) : (
                  <span className="font-mono text-white/20 tracking-[0.2em] uppercase" style={{ fontSize: '9px' }}>
                    Camera unavailable
                  </span>
                )}
              </div>
            </div>
            {/* Shimmer scan line */}
            <motion.div
              className="absolute left-0 right-0 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), rgba(6,182,212,0.2), transparent)' }}
              animate={{ top: ['10%', '90%', '10%'] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        )}

        {/* Image/Video Stack — float + bounce */}
        <AnimatePresence mode="wait">
          {capturedMedia.length > 0 && !isStackExpanded && (
            <motion.div
              key="media-stack"
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{
                opacity: 1,
                scale: stackBounce ? [1, 1.15, 0.95, 1.05, 1] : 1,
                y: 0
              }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={() => { if (capturedMedia.length > 1) setIsStackExpanded(true); }}
              className="absolute w-11 h-11 cursor-pointer z-30 float-drift"
              style={{ bottom: '130px', left: '1.5rem' }}
            >
              {capturedMedia.slice(0, 4).map((item, index) => (
                <div
                  key={index}
                  className="absolute top-0 left-0 w-11 h-11 rounded-xl border border-white/20 bg-black/30 backdrop-blur-md overflow-hidden shadow-lg flex items-center justify-center"
                  style={{
                    transform: `rotate(${index * 4}deg) scale(${1 - index * 0.05})`,
                    zIndex: 4 - index,
                  }}
                >
                  <img src={item.src} alt="" className="w-full h-full object-cover opacity-80 absolute inset-0" />
                  {item.type === 'video' && (
                    <div className="z-10 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                      <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5" />
                    </div>
                  )}
                </div>
              ))}

              {/* Delete button — only show when single item */}
              {capturedMedia.length === 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    play('media.delete');
                    setCapturedMedia([]);
                  }}
                  className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center z-20 hover:bg-black/80 active:scale-90 transition-all"
                >
                  <span className="text-white/80 text-[10px] font-bold leading-none">✕</span>
                </button>
              )}

              {/* Count badge — white bg + black text, spring animation */}
              <motion.div
                key={capturedMedia.length}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
                className="absolute -bottom-1 -right-1 bg-white text-black font-bold rounded-full flex items-center justify-center z-10 shadow-md border border-black/10"
                style={{ fontSize: '9px', minWidth: '18px', minHeight: '18px', width: '18px', height: '18px' }}
              >
                {capturedMedia.length}
              </motion.div>

              {/* Stack Status Indicator */}
              <AnimatePresence mode="wait">
                {stackStatus === 'UPLOADING' && (
                  <motion.div key="uploading" initial={{ opacity: 0, scale: 0.5, rotate: -90 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 400 }}
                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/30">
                    <Upload size={10} strokeWidth={3} className="text-black animate-bounce" />
                  </motion.div>
                )}
                {stackStatus === 'ANALYZING' && (
                  <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 400 }}
                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/50 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/20">
                    <ScanLine size={10} strokeWidth={3} className="text-black animate-pulse" />
                  </motion.div>
                )}
                {stackStatus === 'READY' && (
                  <motion.div key="ready" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: [1, 1.3, 1] }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center z-20 shadow-md border border-white/30">
                    <Check size={10} strokeWidth={3} className="text-black" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expanded Media Strip */}
        <AnimatePresence>
          {isStackExpanded && capturedMedia.length > 0 && (
            <motion.div
              key="expanded-strip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 left-0 z-40 px-5"
              style={{ bottom: '130px' }}
            >
              {/* Backdrop to close */}
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setIsStackExpanded(false)}
              />

              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="flex gap-2 overflow-x-auto no-scrollbar pt-3 pb-2 px-2 rounded-2xl bg-black/50 backdrop-blur-2xl border border-white/[0.1]"
              >
                {capturedMedia.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05, type: 'spring', stiffness: 400 }}
                    className="relative shrink-0 w-14 h-14 rounded-xl border border-white/20 bg-black/30"
                  >
                    <img src={item.src} alt="" className="w-full h-full object-cover rounded-xl absolute inset-0" />
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-[3px] border-t-transparent border-l-[5px] border-l-white border-b-[3px] border-b-transparent ml-0.5" />
                        </div>
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        play('media.delete');
                        setCapturedMedia(prev => {
                          const next = prev.filter((_, i) => i !== index);
                          if (next.length <= 1) setIsStackExpanded(false);
                          return next;
                        });
                      }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center z-10 hover:bg-red-500/60 active:scale-90 transition-all"
                    >
                      <span className="text-white/90 text-[9px] font-bold leading-none">✕</span>
                    </button>
                  </motion.div>
                ))}

                {/* Collapse button */}
                <button
                  onClick={() => setIsStackExpanded(false)}
                  className="shrink-0 w-14 h-14 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center hover:bg-white/[0.1] active:scale-90 transition-all"
                >
                  <span className="text-white/50 text-[10px] font-medium">Done</span>
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording Indicator */}
        {isRecording && (
          <div className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md z-30 below-top-signal ${recordingSeconds >= 25 ? 'bg-red-900/60' : 'bg-black/50'}`} style={{ top: 'calc(env(safe-area-inset-top, 0.75rem) + 48px)' }}>
            <div className={`w-2 h-2 rounded-full bg-red-500 ${recordingSeconds >= 25 ? 'animate-[pulse_0.4s_ease-in-out_infinite]' : 'animate-pulse'}`} />
            <span className={`font-mono ${recordingSeconds >= 25 ? 'text-red-300' : 'text-white'}`} style={{ fontSize: 'var(--text-xs)' }}>
              {recordingSeconds >= 25
                ? `${30 - recordingSeconds}s`
                : `${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')}`
              }
            </span>
          </div>
        )}

        {/* Status text removed — card + top icon already show connection state */}


        {/* AI Matrix Scan Effect */}
        <MatrixScanOverlay active={isScanning} duration={2500} columns={24} />

        {/* Emoji Rain Overlay */}
        <AnimatePresence>
          {emojiRain && (
            <div className="absolute inset-0 z-[25] pointer-events-none overflow-hidden">
              {emojiRainParticles.map((p, i) => (
                <motion.div
                  key={`emoji-${emojiRain.emojis.join('')}-${i}`}
                  initial={{ y: -50, x: `${p.x}%`, opacity: 1, scale: p.scale }}
                  animate={{ y: '110%', rotate: p.rotate }}
                  transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
                  className="absolute"
                  style={{ fontSize: `${p.fontSize}px`, willChange: 'transform' }}
                >
                  {emojiRain.emojis[p.emojiIndex]}
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* UI Badge Overlay */}
        <AnimatePresence>
          {uiBadge && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: uiBadge.position === 'bottom-center' ? 10 : -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`absolute z-[25] pointer-events-none flex justify-center ${uiBadge.position === 'top-center' ? 'top-4 left-0 right-0' :
                uiBadge.position === 'bottom-center' ? 'bottom-4 left-0 right-0' :
                  'top-1/2 left-0 right-0 -translate-y-1/2'
                }`}
            >
              <div className={`px-4 py-1.5 rounded-full backdrop-blur-md border font-semibold tracking-wide shadow-lg ${uiBadge.color === 'purple' ? 'bg-white/[0.12] border-white/20 text-white/80' :
                uiBadge.color === 'green' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 shadow-emerald-500/10' :
                  uiBadge.color === 'cyan' ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-200 shadow-cyan-500/10' :
                    'bg-blue-500/20 border-blue-500/40 text-blue-200 shadow-blue-500/10'
                }`} style={{ fontSize: 'var(--text-sm)' }}>
                {uiBadge.text}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Capture Genie Animation */}
        <AnimatePresence>
          {showCaptureAnim && (
            <>
              <motion.div
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 bg-white z-50 pointer-events-none"
              />
              <motion.div
                initial={{
                  top: '45%', left: '30%', width: '40%', height: '30%',
                  borderRadius: '8px', opacity: 1,
                }}
                animate={{
                  top: ['45%', '65%', '78%'],
                  left: ['30%', '10%', '4%'],
                  width: ['40%', '18%', '10%'],
                  height: ['30%', '14%', '8%'],
                  borderRadius: ['8px', '6px', '4px'],
                  opacity: [1, 0.85, 0],
                }}
                transition={{
                  duration: 0.55,
                  ease: [0.4, 0, 0.2, 1],
                  times: [0, 0.6, 1],
                }}
                className="absolute z-40 overflow-hidden shadow-2xl border border-white/30 pointer-events-none bg-neutral-800"
              />
            </>
          )}
        </AnimatePresence>

        {/* Action Card Overlay */}
        <AnimatePresence>
          {livekit.actionCard && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 left-4 right-4 z-40 bg-neutral-900/90 backdrop-blur-xl rounded-2xl border border-white/10 p-4"
            >
              <p className="text-white/90 font-medium mb-3" style={{ fontSize: 'var(--text-base)' }}>{livekit.actionCard.title}</p>
              <div className="flex flex-wrap gap-2">
                {livekit.actionCard.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleActionCardOption(opt)}
                    className="px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-white/80 font-medium hover:bg-white/[0.14] transition-colors active:scale-95"
                    style={{ fontSize: 'var(--text-sm)' }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <button
                onClick={() => livekit.dismissActionCard()}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X size={12} className="text-white/50" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Controls + AI Card — vertical flex, card always 12px below buttons */}
      <div className="safe-area-top absolute top-0 left-0 right-0 px-4 z-20 pointer-events-none flex flex-col">
        {/* Row 1: Back button + Connection Signal + Flip Camera */}
        <div className="flex justify-between items-center pb-2">
          <button
            onClick={() => { play('nav.history'); onOpenHistory(); }}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-white/[0.10] backdrop-blur-xl active:scale-90 transition-all pointer-events-auto"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <ArrowLeft size={18} strokeWidth={2} className="text-white/80" />
          </button>

          {/* AI Connection Signal — centered */}
          <div className="pointer-events-auto">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-xl border border-white/[0.08]"
              style={{ background: 'rgba(0,0,0,0.35)' }}
            >
              <AnimatePresence mode="wait">
                {connectionIcon === 'connecting' && (
                  <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                    <Loader2 size={11} className="text-blue-400 animate-spin" />
                    <span className="font-mono text-blue-400/80 tracking-[0.12em] uppercase" style={{ fontSize: '9px' }}>Connecting</span>
                  </motion.div>
                )}
                {connectionIcon === 'connected' && (
                  <motion.div key="connected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="font-mono text-green-400/80 tracking-[0.12em] uppercase" style={{ fontSize: '9px' }}>Live</span>
                  </motion.div>
                )}
                {connectionIcon === 'weak' && (
                  <motion.div key="weak" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="font-mono text-yellow-400/80 tracking-[0.12em] uppercase" style={{ fontSize: '9px' }}>Weak</span>
                  </motion.div>
                )}
                {connectionIcon === 'offline' && (
                  <motion.div key="offline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400/60" />
                    <span className="font-mono text-red-400/60 tracking-[0.12em] uppercase" style={{ fontSize: '9px' }}>Offline</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Flip Camera */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => livekit.switchCamera?.()}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-white/[0.08] backdrop-blur-xl active:scale-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <RefreshCw size={16} strokeWidth={1.8} className="text-white/50" />
            </button>
          </div>
        </div>

        {/* Row 2: AI Card — 12px below buttons */}
        <div className="pointer-events-auto" style={{ marginTop: '12px' }}>
          <AnimatePresence mode="wait">
            {livekit.intentionText || editedIntention ? (
              /* ── Intention Card ── */
              <motion.div
                key="intention-card"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="w-full"
              >
                <div
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="absolute inset-0 rounded-2xl" style={{
                    backdropFilter: 'blur(24px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                  }} />
                  <div className="absolute inset-0 rounded-2xl" style={{
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }} />
                  <div className="absolute top-0 left-[10%] right-[10%] h-px" style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                  }} />
                  <div className="relative px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Edit3 size={11} className="text-white/40" />
                      <span className="font-mono font-semibold text-white/50 tracking-[0.06em] uppercase" style={{ fontSize: '11px' }}>
                        Intention
                      </span>
                    </div>
                    <textarea
                      ref={intentionInputRef}
                      value={editedIntention}
                      onChange={(e) => {
                        setEditedIntention(e.target.value);
                        setIsIntentionEdited(true);
                      }}
                      placeholder="What should VI do with your photos?"
                      rows={2}
                      className="w-full bg-transparent text-white/90 font-medium leading-relaxed resize-none outline-none placeholder:text-white/25"
                      style={{ fontSize: 'var(--text-base)', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              /* ── Default Card: AI observation ── */
              <motion.div key="status-card" className="w-full">
                <Card
                  isVisible={showCard}
                  text={cardText}
                  isMicOn={isMicOn}
                  agentStatus={livekit.infoBar?.status}
                  hasAgent={!!livekit.agentIdentity}
                  computedStatus={agentComputedStatus}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom Controls — floating glass overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-30">
        <div className="w-full flex items-center justify-center px-6 py-4 gap-6">
          {/* Mic Toggle */}
          <motion.button
            onClick={handleMicToggle}
            whileTap={{ scale: 0.85 }}
            className="w-14 h-14 rounded-full flex items-center justify-center border transition-all backdrop-blur-xl"
            style={{
              background: isMicOn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
              borderColor: isMicOn ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
              boxShadow: isMicOn ? '0 0 20px rgba(255,255,255,0.08)' : 'none',
            }}
          >
            {isMicOn
              ? <Mic size={20} strokeWidth={1.8} className="text-white/80" />
              : <MicOff size={20} strokeWidth={1.8} className="text-white/35" />
            }
          </motion.button>

          {/* Shutter Button — always captures photo */}
          {(() => {
            const agentAction = livekit.actionSuggestion?.action;
            const glowAction = (agentAction && agentAction !== 'dispatch' && agentAction !== 'ready' && agentAction !== 'done') ? agentAction : null;
            const glow = ACTION_GLOW[glowAction] || null;
            const glowBorder = glow ? glow.border : 'border-white/40';
            const glowShadow = glow ? glow.shadow : 'none';
            const ShutterIcon = (glowAction && INTENT_ICONS[glowAction]) || ScanLine;

            return (
              <div className="relative">
                <button
                  onClick={handleShutterClick}
                  onPointerDown={handleShutterDown}
                  onPointerUp={handleShutterUp}
                  onPointerLeave={() => { if (!isRecording) clearTimeout(longPressTimerRef.current); }}
                  disabled={connectionIcon === 'offline' && !livekit.localVideoTrack}
                  className={`group relative w-[5.5rem] h-[5.5rem] rounded-full border-[5px] flex items-center justify-center transition-all duration-300 ${isRecording ? 'border-red-500/50 scale-110' : glowBorder
                    } active:scale-95 select-none touch-none disabled:opacity-30`}
                  style={{ boxShadow: isRecording ? 'none' : glowShadow }}
                >
                  {isRecording ? (
                    <div className="w-7 h-7 rounded-md bg-red-500 animate-pulse transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
                  ) : (
                    <div className="w-[4.25rem] h-[4.25rem] rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)] bg-white">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={ShutterIcon.displayName || ShutterIcon.name || 'icon'}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.7 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ShutterIcon
                            size={28}
                            strokeWidth={2}
                            className="text-black/70 drop-shadow-sm"
                          />
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  )}
                </button>
              </div>
            );
          })()}

          {/* Done Button — appears only when photos are captured */}
          <AnimatePresence>
            {capturedMedia.length > 0 ? (
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={handleDone}
                whileTap={{ scale: 0.88 }}
                className="w-14 h-14 rounded-full flex items-center justify-center border transition-all backdrop-blur-xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.85))',
                  borderColor: 'rgba(255,255,255,0.25)',
                  boxShadow: '0 0 24px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              >
                <CheckCircle2 size={22} strokeWidth={2} className="text-white drop-shadow-sm" />
              </motion.button>
            ) : (
              <div className="w-14 h-14" />
            )}
          </AnimatePresence>
        </div>
        <div className="w-full h-2 md:h-8 shrink-0" />
      </div>
    </motion.div>
  );
}
