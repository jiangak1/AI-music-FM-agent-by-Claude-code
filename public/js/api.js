// In Tauri production mode, frontend is served from local files,
// so API calls need absolute URLs pointing to the Node.js sidecar.
const API_BASE = (typeof window !== 'undefined' && window.__TAURI__) ? 'http://localhost:3000' : '';

const API = {
  async get(endpoint) {
    const res = await fetch(API_BASE + endpoint);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async post(endpoint, data = {}) {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
  },

  async del(endpoint) {
    const res = await fetch(API_BASE + endpoint, { method: 'DELETE' });
    return res.json();
  },

  // Status
  getStatus() { return this.get('/api/status'); },

  // Settings
  getSettings() { return this.get('/api/settings'); },
  saveSettings(data) { return this.post('/api/settings', data); },

  // Playlist
  generatePlaylist(opts) { return this.post('/api/playlist/generate', opts); },

  // DJ
  getDJIntro() { return this.post('/api/dj/intro'); },
  getDJSegue(current, next) { return this.post('/api/dj/segue', { currentTrack: current, nextTrack: next }); },

  // Library
  getLibrary() { return this.get('/api/library'); },
  scanLibrary(dir) { return this.post('/api/library/scan', { dir }); },

  // Queue
  getQueue() { return this.get('/api/queue'); },
  addToQueue(track, toFront) { return this.post('/api/queue/add', { track, toFront }); },
  removeFromQueue(index) { return this.del(`/api/queue/${index}`); },
  nextTrack() { return this.post('/api/queue/next'); },
  clearQueue() { return this.post('/api/queue/clear'); },
};

window.API = API;
