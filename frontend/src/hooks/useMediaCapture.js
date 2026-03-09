import { useState, useEffect, useRef, useCallback } from 'react';
import { useS3Upload } from './useS3Upload';

/**
 * Manages media capture (photo/video), recording state, shutter handlers,
 * and S3 upload orchestration. Extracted from LiveCameraView.
 */
export function useMediaCapture({ livekit, play }) {
  // Media capture state
  const [capturedMedia, setCapturedMedia] = useState([]);
  const capturedMediaRef = useRef(capturedMedia);
  useEffect(() => { capturedMediaRef.current = capturedMedia; }, [capturedMedia]);

  // S3 upload
  const { uploadToS3: rawUploadToS3, uploadVideoToS3: rawUploadVideoToS3, uploadPromisesRef, stackStatus } = useS3Upload();

  // Wrap uploads to also update capturedMedia with s3Url
  const uploadToS3 = useCallback(async (dataUrl) => {
    const promise = rawUploadToS3(dataUrl);
    promise.then(publicUrl => {
      if (publicUrl) {
        setCapturedMedia(prev => prev.map(item =>
          item.src === dataUrl ? { ...item, s3Url: publicUrl } : item
        ));
      }
    });
    return promise;
  }, [rawUploadToS3]);

  const uploadVideoToS3 = useCallback(async (blob, ext, thumbnailSrc) => {
    const promise = rawUploadVideoToS3(blob, ext, thumbnailSrc);
    promise.then(publicUrl => {
      if (publicUrl) {
        setCapturedMedia(prev => prev.map(item =>
          item.src === thumbnailSrc ? { ...item, s3Url: publicUrl } : item
        ));
      }
    });
    return promise;
  }, [rawUploadVideoToS3]);

  // Gallery & stack UI state
  const [showGallery, setShowGallery] = useState(false);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const [stackBounce, setStackBounce] = useState(false);

  // Detect front camera (mirror preview)
  const isFrontCamera = (() => {
    const track = livekit.localVideoTrack;
    if (!track) return false;
    const settings = track.mediaStreamTrack?.getSettings?.();
    if (settings?.facingMode) return settings.facingMode === 'user';
    return livekit.facingMode !== 'environment' || !('ontouchstart' in window);
  })();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const isLongPressRef = useRef(false);
  const justStartedRecordingRef = useRef(false);
  const pointerCapturedRef = useRef(false);

  // MediaRecorder
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const autoStopTimerRef = useRef(null);
  const recordedMimeRef = useRef('video/webm');

  // Capture animation
  const [showCaptureAnim, setShowCaptureAnim] = useState(false);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
      return () => clearInterval(recordingTimerRef.current);
    }
    clearInterval(recordingTimerRef.current);
    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(autoStopTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // videoRef is owned by the component (attached to <video>), passed in via parameter
  const videoRef = useRef(null);

  // Helper: draw video frame to canvas, mirror if front camera
  const drawVideoToCanvas = useCallback((video, canvas, ctx) => {
    if (isFrontCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (isFrontCamera) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }, [isFrontCamera]);

  // Photo capture from real video stream
  const capturePhotoFromVideo = useCallback(async () => {
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
      let stream = null;
      if (livekit.localVideoTrack?.mediaStreamTrack) {
        stream = new MediaStream([livekit.localVideoTrack.mediaStreamTrack]);
      } else if (videoRef.current?.srcObject) {
        stream = videoRef.current.srcObject;
      } else if (videoRef.current?.captureStream) {
        stream = videoRef.current.captureStream();
      }
      if (!stream || !window.MediaRecorder) return false;

      const mimeOptions = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'];
      const mime = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || '';
      if (!mime) return false;

      recordedMimeRef.current = mime;
      videoChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.start(500);
      mediaRecorderRef.current = recorder;

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

  // Shutter handlers
  const handleShutterDown = useCallback(() => {
    if (isRecording) return;
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      justStartedRecordingRef.current = true;
      setRecordingSeconds(0);
      setIsRecording(true);
      play('camera.recordStart');
      startMediaRecorder();
    }, 500);
  }, [isRecording, play, startMediaRecorder]);

  const handleShutterUp = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    if (isRecording) return;
    if (!isLongPressRef.current) {
      pointerCapturedRef.current = true;
      play('camera.shutter');
      setShowCaptureAnim(true);
      setTimeout(async () => {
        setShowCaptureAnim(false);
        const photoSrc = await capturePhotoFromVideo();
        if (photoSrc) {
          setCapturedMedia(prev => [{ type: 'photo', src: photoSrc }, ...prev].slice(0, 8));
          setStackBounce(true);
          setTimeout(() => setStackBounce(false), 400);
        }
      }, 600);
    }
    isLongPressRef.current = false;
  }, [isRecording, play, capturePhotoFromVideo]);

  const handleShutterClick = useCallback(() => {
    if (justStartedRecordingRef.current) {
      justStartedRecordingRef.current = false;
      return;
    }
    if (isRecording) {
      play('camera.recordStop');
      setIsRecording(false);
      isLongPressRef.current = false;
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
    if (pointerCapturedRef.current) {
      pointerCapturedRef.current = false;
      return;
    }
    play('camera.shutter');
    setShowCaptureAnim(true);
    setTimeout(async () => {
      setShowCaptureAnim(false);
      const photoSrc = await capturePhotoFromVideo();
      if (photoSrc) {
        setCapturedMedia(prev => [{ type: 'photo', src: photoSrc }, ...prev].slice(0, 8));
        setStackBounce(true);
        setTimeout(() => setStackBounce(false), 400);
      }
    }, 600);
  }, [isRecording, play, stopVideoRecording, capturePhotoFromVideo, uploadVideoToS3, uploadToS3]);

  return {
    // State
    capturedMedia,
    setCapturedMedia,
    capturedMediaRef,
    isFrontCamera,
    isRecording,
    recordingSeconds,
    showCaptureAnim,
    showGallery,
    setShowGallery,
    isStackExpanded,
    setIsStackExpanded,
    stackBounce,
    stackStatus,
    // Refs
    videoRef,
    longPressTimerRef,
    // Upload
    uploadToS3,
    uploadVideoToS3,
    uploadPromisesRef,
    // Handlers
    handleShutterDown,
    handleShutterUp,
    handleShutterClick,
  };
}
