import { useState, useEffect, useCallback } from 'react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from '../services/firebase';
import { api } from '../services/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.isAnonymous) {
        await signOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const response = await fetch(`${api.baseUrl}/api/auth/firebase`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'id-token': idToken,
              'package-name': api.packageName,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setUser({
              ...data,
              firebaseUser,
            });
            api.setViUserId(data.vi_user_id);

            reportWebDevice().catch(() => {});
          } else {
            console.error('API auth sync failed:', response.status);
            setError('Failed to sync with server');
          }
        } catch (e) {
          console.error('Failed to sync with API server:', e);
          setError(e.message);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Sign out failed:', e);
    }
    setUser(null);
    api.setViUserId(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    loginWithGoogle,
    logout,
  };
}

async function reportWebDevice() {
  const deviceId = api.getDeviceId();
  await api.reportDevice({
    device_id: deviceId,
    device_token: null,
    store: 'web',
    version: import.meta.env.VITE_APP_VERSION || '1.0.0',
    timezone: new Date().getTimezoneOffset() * -1,
    user_agent: navigator.userAgent,
  });
}
