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
    this.packageName = import.meta.env.VITE_FIREBASE_PACKAGE_NAME || 'com.viapp.web';
    // viUserId is set by useAuth after Firebase login (api.setViUserId)
    this._viUserId = localStorage.getItem('vi-user-id') || null;
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

  async request(path, options = {}, { retries = 2, backoff = 500 } = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Firebase Auth: attach ID Token if user is signed in
    try {
      const { auth } = await import('./firebase.js');
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        headers['id-token'] = idToken;
        headers['package-name'] = this.packageName;
      } else {
        headers['X-Device-Id'] = this.getDeviceId();
      }
    } catch {
      headers['X-Device-Id'] = this.getDeviceId();
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.status === 401) {
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
    const data = await this.request('/api/users/sessions');
    return data.sessions || [];
  }

  async deleteSession(sessionId) {
    return this.request(`/api/users/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
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
    if (layer) params.set('layer', layer);
    const qs = params.toString();
    return this.request(`/api/users/memories${qs ? '?' + qs : ''}`);
  }

  async getMemory(filenameOrId) {
    return this.request(`/api/users/memory/${encodeURIComponent(filenameOrId)}`);
  }

  async upsertMemory(filename, content, layer = null) {
    const body = { content };
    if (layer) body.layer = layer;
    return this.request(`/api/users/memory/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteMemory(filename) {
    return this.request(`/api/users/memory/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  }

  // S3 Upload endpoints
  async getPresignedUploadUrl(ext = 'jpg') {
    const params = new URLSearchParams({ ext });
    // Always attach vi_user_id for device-based auth fallback
    const viUserId = this.getViUserId();
    if (viUserId) params.set('vi_user_id', viUserId);
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

  /**
   * Notify API server that an upload is complete.
   * This publishes a vi:media:{uid} event to Redis so NanoClaw can auto-trigger.
   */
  async _notifyUploadComplete(publicUrl, key, mediaType) {
    try {
      const viUserId = this.getViUserId();
      const qs = viUserId ? `?vi_user_id=${encodeURIComponent(viUserId)}` : '';
      await this.request(`/api/upload/complete${qs}`, {
        method: 'POST',
        body: JSON.stringify({
          key: key || '',
          media_type: mediaType,
          media_url: publicUrl,
        }),
      });
      console.log(`[redis][frontend] Upload complete notified: ${mediaType}`);
    } catch (err) {
      console.warn('[redis][frontend] Failed to notify upload complete:', err);
    }
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

  /**
   * Dispatch a task to NanoClaw via REST.
   * Use when LiveKit RPC is unavailable (e.g., skill tap without active session).
   * Results stream back via SSE.
   */
  async dispatchExec({ prompt, skillSlug, mediaUrls, sessionId, priority, params } = {}) {
    const viUserId = this.getViUserId();
    const body = { prompt };
    if (skillSlug) body.skill_slug = skillSlug;
    if (mediaUrls) body.media_urls = mediaUrls;
    if (sessionId) body.session_id = sessionId;
    if (priority) body.priority = priority;
    if (params) body.params = params;

    return this.request(`/api/users/exec?vi_user_id=${viUserId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Send a card action upstream to NanoClaw (V5 Card Template Protocol).
   * Used when users interact with living cards (check items, select options, etc.).
   */
  async sendCardAction(cardId, action, payload = {}) {
    const viUserId = this.getViUserId();
    const body = {
      cardId,
      action,
      payload,
      timestamp: new Date().toISOString(),
    };
    return this.request(`/api/users/card-action?vi_user_id=${viUserId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Device endpoints
  async reportDevice(deviceInfo) {
    return this.request('/api/devices', {
      method: 'POST',
      body: JSON.stringify(deviceInfo),
    });
  }

  // OAuth token endpoints

  async getTokenStatus(provider) {
    return this.request(`/api/tokens/${encodeURIComponent(provider)}/status`);
  }

  async connectToken(provider) {
    return this.request(`/api/tokens/connect/${encodeURIComponent(provider)}`, { method: 'POST' });
  }

  async disconnectToken(provider) {
    return this.request(`/api/tokens/${encodeURIComponent(provider)}`, { method: 'DELETE' });
  }

  async logout() {
    try {
      const { auth, signOut } = await import('./firebase.js');
      await signOut(auth);
    } catch {
      // Firebase not initialized or already signed out
    }
  }
}

export const api = new ApiClient();
