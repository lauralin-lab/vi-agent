import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getMe()
        .then(userData => {
          setUser(userData);
          setLoading(false);
        })
        .catch(() => {
          api.setToken(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email, password, displayName) => {
    setError(null);
    try {
      const data = await api.signup(email, password, displayName);
      setUser({
        user_id: data.user_id,
        vi_user_id: data.vi_user_id,
        email: data.email,
        display_name: data.display_name,
      });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const data = await api.login(email, password);
      setUser({
        user_id: data.user_id,
        vi_user_id: data.vi_user_id,
        email: data.email,
        display_name: data.display_name,
      });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    signup,
    login,
    logout,
  };
}
