// Unified API client — single source of truth for all backend calls.
// Detects Tauri (desktop) vs browser mode and adjusts base URL accordingly.
(function () {
  'use strict';

  const API_BASE = (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__))
    ? 'http://localhost:3000'
    : '';

  const API = {
    async _fetch(method, endpoint, data) {
      const opts = { method };
      if (data !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(data);
      }
      let res;
      try {
        res = await fetch(API_BASE + endpoint, opts);
      } catch (e) {
        throw new Error('无法连接到服务器，请确认 AI 电台已启动');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    },

    get(endpoint)     { return this._fetch('GET', endpoint); },
    post(endpoint, d) { return this._fetch('POST', endpoint, d); },
    del(endpoint)     { return this._fetch('DELETE', endpoint); },

    // === Status ===
    getStatus() { return this.get('/api/status'); },

    // === Settings ===
    getSettings()  { return this.get('/api/settings'); },
    saveSettings(d) { return this.post('/api/settings', d); },

    // === Queue ===
    getQueue()           { return this.get('/api/queue'); },
    addToQueue(track, toFront) { return this.post('/api/queue/add', { track, toFront }); },
    removeFromQueue(idx) { return this.del(`/api/queue/${idx}`); },
    nextTrack()          { return this.post('/api/queue/next'); },
    clearQueue()         { return this.post('/api/queue/clear'); },

    // === Playlist / AI ===
    generatePlaylist(opts)       { return this.post('/api/playlist/generate', opts); },
    generateWeatherPlaylist()    { return this.post('/api/playlist/weather', {}); },

    // === DJ ===
    getDJIntro()                         { return this.post('/api/dj/intro'); },
    getDJSegue(currentTrack, nextTrack)  { return this.post('/api/dj/segue', { currentTrack, nextTrack }); },
    getSongIntro(track)                  { return this.post('/api/dj/song-intro', { track }); },

    // === Library ===
    getLibrary()    { return this.get('/api/library'); },
    scanLibrary(dir) { return this.post('/api/library/scan', { dir }); },

    // === Netease ===
    getNeteaseStatus()        { return this.get('/api/netease/status'); },
    getNeteaseQRKey()         { return this.get('/api/netease/qr/key'); },
    getNeteaseQRCode(key)     { return this.get(`/api/netease/qr/create?key=${encodeURIComponent(key)}`); },
    checkNeteaseQR(key)       { return this.get(`/api/netease/qr/check?key=${encodeURIComponent(key)}`); },
    getNeteasePlaylists(uid)  { return this.get(`/api/netease/playlists?uid=${encodeURIComponent(uid)}`); },
    getNeteasePlaylistTracks(id) { return this.get(`/api/netease/playlist/${id}/tracks`); },
    getNeteaseSongUrl(id)     { return this.get(`/api/netease/song/url/${id}`); },
    searchNetease(keyword, limit) { return this.get(`/api/netease/search?keyword=${encodeURIComponent(keyword)}&limit=${limit || 20}`); },
    generateNeteaseTaste(id, count) { return this.post('/api/netease/playlist/generate', { playlistId: id, count: count || 20 }); },

    // === Memory ===
    getLiked()                { return this.get('/api/memory/liked'); },
    toggleLike(track)         { return this.post('/api/memory/like', { track }); },
    recordPlay(track)         { return this.post('/api/memory/history', { track }); },
    updatePersona(tracks, src) { return this.post('/api/memory/update-persona', { tracks, source: src }); },

    // === Recommended ===
    getRecommended()          { return this.get('/api/recommended'); },
    setRecommended(tracks)    { return this.post('/api/recommended/set', { tracks }); },
    clearRecommended()        { return this.post('/api/recommended/clear'); },
    addToRecommended(track)   { return this.post('/api/recommended/add', { track }); },

    // === Chat ===
    getGreeting()             { return this.get('/api/chat/greeting'); },
    sendChat(message)         { return this.post('/api/chat/send', { message }); },
    getChatHistory(limit)     { return this.get(`/api/chat/history?limit=${limit || 50}`); },

    // === Weather ===
    getWeather(city)          { return this.get(`/api/weather${city ? '?city=' + encodeURIComponent(city) : ''}`); },

    // === Lyrics ===
    getLyrics(track) {
      const params = [];
      if (track.ncmId) params.push(`ncmId=${track.ncmId}`);
      if (track.filePath) params.push(`filePath=${encodeURIComponent(track.filePath)}`);
      return params.length ? this.get(`/api/lyrics?${params.join('&')}`) : Promise.resolve({ source: null, raw: '', parsed: [] });
    },

    // === Netease stream (for audio src) ===
    getNeteaseStreamUrl(id)   { return API_BASE + `/api/netease/stream/${id}`; },
    getLibraryStreamUrl(path) { return API_BASE + `/api/library/stream?path=${encodeURIComponent(path)}`; },
  };

  window.API = API;
})();
