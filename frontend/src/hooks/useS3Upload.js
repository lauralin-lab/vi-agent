import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';

/**
 * Manages S3 upload orchestration and promise tracking for media items.
 * Extracted from LiveCameraView.
 */
export function useS3Upload() {
  const uploadPromisesRef = useRef([]);
  const [stackStatus, setStackStatus] = useState('IDLE');

  const uploadToS3 = useCallback(async (dataUrl) => {
    const promise = (async () => {
      try {
        setStackStatus('UPLOADING');
        const publicUrl = await api.uploadDataUrl(dataUrl);
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

  const uploadVideoToS3 = useCallback(async (blob, ext, _thumbnailSrc) => {
    const promise = (async () => {
      try {
        setStackStatus('UPLOADING');
        const publicUrl = await api.uploadBlob(blob, ext);
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

  return {
    uploadToS3,
    uploadVideoToS3,
    uploadPromisesRef,
    stackStatus,
  };
}
