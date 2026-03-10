import axios from 'axios';
import { auth } from '../firebase';

const client = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL || '/admin',
});

// Automatically inject Firebase token on every request
client.interceptors.request.use(async (config) => {
  const user = auth?.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers['id-token'] = token;
    config.headers['package-name'] =
      import.meta.env.VITE_FIREBASE_PACKAGE_NAME || 'com.viapp.web';
  }
  return config;
});

// Redirect to login on 401/403 (skip for auth endpoints)
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthRequest = url.includes('/auth/');
    if (!isAuthRequest && (err.response?.status === 401 || err.response?.status === 403)) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
