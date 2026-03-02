/**
 * API client for VI API Server.
 * Handles auth headers and base URL configuration.
 */

// In dev mode with Vite proxy, use relative URLs (proxy handles /api → localhost:8000)
// In production, use the configured API URL
const API_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.baseUrl = API_URL;
    this.token = sessionStorage.getItem('vi-token');
    this._viUserId = localStorage.getItem('vi-user-id');
  }

  // --- Device ID management ---

  getDeviceId() {
    let deviceId = localStorage.getItem('vi-device-id');
    if (!deviceId) {
      const uuid = crypto.randomUUID();
      deviceId = 'dev-' + uuid.replace(/-/g, '').slice(0, 16);
      localStorage.setItem('vi-device-id', deviceId);
    }
    return deviceId;
  }

  getViUserId() {
    return this._viUserId;
  }

  setViUserId(id) {
    this._viUserId = id;
    if (id) {
      localStorage.setItem('vi-user-id', id);
    } else {
      localStorage.removeItem('vi-user-id');
    }
  }

  // --- Auth token management ---

  setToken(token) {
    this.token = token;
    if (token) {
      sessionStorage.setItem('vi-token', token);
    } else {
      sessionStorage.removeItem('vi-token');
    }
  }

  getToken() {
    return this.token;
  }

  async request(path, options = {}, { retries = 2, backoff = 500 } = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else {
      // For anonymous users, always include the X-Device-Id header
      // so device-based auth endpoints can verify ownership.
      headers['X-Device-Id'] = this.getDeviceId();
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });

        if (response.status === 401) {
          this.setToken(null);
          throw new Error('Unauthorized');
        }

        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || `Request failed: ${response.status}`);
        }

        // Retry server errors (5xx)
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : null;
      } catch (err) {
        lastError = err;
        // Don't retry auth errors or client errors
        if (err.message === 'Unauthorized' || err.message.startsWith('Request failed:')) {
          throw err;
        }
        // Retry on network errors and server errors
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt)));
          continue;
        }
      }
    }
    throw lastError;
  }

  // Auth endpoints
  async signup(email, password, displayName) {
    const data = await this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    this.setToken(data.token);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // LiveKit endpoints
  async getLiveKitToken() {
    return this.request('/api/livekit/token', { method: 'POST' });
  }

  async getAnonymousLiveKitToken() {
    const deviceId = this.getDeviceId();
    const data = await this.request('/api/livekit/anonymous', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId }),
    });
    this.setViUserId(data.vi_user_id);
    return data;
  }

  // Session endpoints
  async getSessions() {
    if (this.token) {
      const data = await this.request('/api/users/sessions');
      return data.sessions || [];
    }
    return this.getSessionsByDevice();
  }

  async deleteSession(sessionId) {
    if (this.token) {
      return this.request(`/api/users/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    }
    const viUserId = this.getViUserId();
    if (!viUserId) throw new Error('No user identity');
    return this.request(
      `/api/users/sessions/by-device/${encodeURIComponent(sessionId)}?vi_user_id=${encodeURIComponent(viUserId)}`,
      { method: 'DELETE' },
    );
  }

  async getSessionsByDevice(viUserId) {
    const id = viUserId || this.getViUserId();
    if (!id) return [];
    const data = await this.request(`/api/users/sessions/by-device?vi_user_id=${encodeURIComponent(id)}`);
    return data.sessions || data || [];
  }

  // Memory endpoints

  async listMemory(layer = null) {
    const params = new URLSearchParams();
    if (this.token) {
      if (layer) params.set('layer', layer);
      const qs = params.toString();
      return this.request(`/api/users/memories${qs ? '?' + qs : ''}`);
    }
    const viUserId = this.getViUserId();
    if (!viUserId) return [];
    params.set('vi_user_id', viUserId);
    if (layer) params.set('layer', layer);
    return this.request(`/api/users/memory/by-device?${params.toString()}`);
  }

  async getMemory(filenameOrId) {
    if (this.token) {
      // V3: try UUID-based endpoint first, fallback to filename
      return this.request(`/api/users/memory/${encodeURIComponent(filenameOrId)}`);
    }
    const viUserId = this.getViUserId();
    if (!viUserId) throw new Error('No user identity');
    return this.request(
      `/api/users/memory/by-device/${encodeURIComponent(filenameOrId)}?vi_user_id=${encodeURIComponent(viUserId)}`,
    );
  }

  async upsertMemory(filename, content, layer = null) {
    const body = { content };
    if (layer) body.layer = layer;
    const opts = { method: 'PUT', body: JSON.stringify(body) };
    if (this.token) {
      return this.request(`/api/users/memory/${encodeURIComponent(filename)}`, opts);
    }
    const viUserId = this.getViUserId();
    if (!viUserId) throw new Error('No user identity');
    return this.request(
      `/api/users/memory/by-device/${encodeURIComponent(filename)}?vi_user_id=${encodeURIComponent(viUserId)}`,
      opts,
    );
  }

  async deleteMemory(filename) {
    if (this.token) {
      return this.request(`/api/users/memory/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    }
    const viUserId = this.getViUserId();
    if (!viUserId) throw new Error('No user identity');
    return this.request(
      `/api/users/memory/by-device/${encodeURIComponent(filename)}?vi_user_id=${encodeURIComponent(viUserId)}`,
      { method: 'DELETE' },
    );
  }

  async getMemoryContext() {
    return this.request('/api/users/memories/context');
  }

  // S3 Upload endpoints
  async getPresignedUploadUrl(ext = 'jpg') {
    const params = new URLSearchParams({ ext });
    // For anonymous users (no JWT), attach vi_user_id so the backend
    // can authenticate via device-based auth.
    if (!this.token) {
      const viUserId = this.getViUserId();
      if (viUserId) params.set('vi_user_id', viUserId);
    }
    return this.request(`/api/upload/presign?${params.toString()}`);
  }

  /**
   * Upload a blob to S3 via presigned URL with retry.
   * Returns the public S3 URL.
   */
  async _uploadToS3(blob, ext) {
    const { presigned_url, public_url, content_type } = await this.getPresignedUploadUrl(ext);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const uploadResp = await fetch(presigned_url, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': content_type },
        });
        if (!uploadResp.ok) throw new Error(`S3 upload failed: ${uploadResp.status}`);
        return public_url;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastErr;
  }

  async uploadDataUrl(dataUrl) {
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    return this._uploadToS3(blob, ext);
  }

  async uploadBlob(blob, ext = 'webm') {
    return this._uploadToS3(blob, ext);
  }

  logout() {
    this.setToken(null);
  }
}

export const api = new ApiClient();
