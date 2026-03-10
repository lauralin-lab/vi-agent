import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '../firebase';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [adminInfo, setAdminInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Validate admin status against backend
  const validateAdmin = useCallback(async (firebaseUser) => {
    try {
      const token = await firebaseUser.getIdToken();
      const res = await client.post('/auth/login', null, {
        headers: {
          'id-token': token,
          'package-name':
            import.meta.env.VITE_FIREBASE_PACKAGE_NAME || 'com.viapp.web',
        },
      });
      setAdminInfo(res.data);
      setError(null);
      return true;
    } catch (err) {
      const code = err.response?.data?.detail?.code || err.response?.data?.code;
      if (code === 'not_admin') {
        setError('not_admin');
      } else if (code === 'user_not_found') {
        setError('user_not_found');
      } else {
        setError('login_failed');
      }
      // Sign out the Firebase user since they are not a valid admin
      if (auth) {
        await signOut(auth);
      }
      setAdminInfo(null);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      setError('firebase_not_configured');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await validateAdmin(firebaseUser);
      } else {
        setAdminInfo(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [validateAdmin]);

  const login = useCallback(async () => {
    if (!isConfigured || !auth) {
      setError('firebase_not_configured');
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const success = await validateAdmin(result.user);
      if (!success) {
        return false;
      }
      return true;
    } catch (err) {
      setError('login_failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, [validateAdmin]);

  const logout = useCallback(async () => {
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    setAdminInfo(null);
  }, []);

  const value = {
    user,
    adminInfo,
    loading,
    error,
    isAuthenticated: !!adminInfo,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
