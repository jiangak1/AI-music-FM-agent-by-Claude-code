(function () {
  'use strict';

  // ===== State =====
  let queue = [];
  let currentIndex = -1;
  let aiPlaylist = [];
  let recommendedTracks = [];
  let library = [];

  // Ambient background (procedural animation, no Web Audio API)
  let _pulseAnimId = null;
  let _pulsePhase = 0;

  function startAmbientPulse() {
    stopAmbientPulse();
    const bg = $('#ambientBg');
    if (!bg) return;
    bg.classList.add('active');

    function pulse(ts) {
      const bgEl = $('#ambientBg');
      if (!bgEl) { _pulseAnimId = null; return; }
      const audio = window._audio;
      const playing = audio && !audio.paused && !audio.ended;
      if (playing) {
        _pulsePhase += 0.016; // ~60fps increment
        const t = _pulsePhase;
        const scale = 1 + Math.sin(t * 0.6) * 0.03 + Math.sin(t * 1.3) * 0.02;
        const bright = 0.05 + Math.sin(t * 0.45) * 0.05 + Math.sin(t * 0.9) * 0.03;
        const hueShift = Math.sin(t * 0.35) * 25;
        bgEl.style.transform = `scale(${scale})`;
        bgEl.style.filter = `brightness(${bright})`;
        bgEl.style.background = `
          radial-gradient(ellipse at ${50 + Math.sin(t * 0.5) * 8}% ${40 + Math.cos(t * 0.4) * 8}%, hsla(${260 + hueShift},60%,35%,0.22) 0%, transparent 50%),
          radial-gradient(ellipse at ${70 + Math.cos(t * 0.55) * 8}% ${60 + Math.sin(t * 0.45) * 8}%, hsla(${320 + hueShift},50%,25%,0.16) 0%, transparent 50%)
        `;
      }
      _pulseAnimId = requestAnimationFrame(pulse);
    }
    _pulseAnimId = requestAnimationFrame(pulse);
  }

  function stopAmbientPulse() {
    if (_pulseAnimId) {
      cancelAnimationFrame(_pulseAnimId);
      _pulseAnimId = null;
    }
    const bg = $('#ambientBg');
    if (bg) {
      bg.classList.remove('active');
      bg.style.transform = 'scale(1)';
      bg.style.filter = 'brightness(0.08)';
      bg.style.background = '';
    }
  }

  // ===== Init =====
  function init() {
    // Audio callbacks
    window.PlayerModule = {
      onTrackEnd: handleTrackEnd,
      onProgress: handleProgress,
      onTrackLoaded: handleLoaded,
    };

    bindEvents();
    updateClock();
    setInterval(updateClock, 1000);
    randomizeFrequency();

    // Disable progress bar until music is loaded
    UI.setProgressEnabled(false);

    // Load initial data
    loadStatus();
    loadRecommended();
    loadSettings();
    loadWeather();
  }

  // ===== API helpers (inline to avoid module issues) =====
  const APPBASE = (typeof window !== 'undefined' && window.__TAURI__) ? 'http://localhost:3000' : '';

  async function api(endpoint, opts = {}) {
    const res = await fetch(APPBASE + endpoint, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ===== Data loading =====
  async function loadStatus() {
    try {
      const s = await api('/api/status');
      queue = s.queue || [];
      currentIndex = s.current ? queue.findIndex(t => t.id === s.current.id) : -1;
      UI.setQueueCount(queue.length);
      UI.renderList('#playlistEl', queue, currentIndex);
    } catch (e) {
      console.warn('加载状态失败:', e.message);
    }
  }

  async function loadWeather() {
    try {
      const w = await api('/api/weather');
      UI.setWeatherMini(w);
    } catch (e) {
      console.warn('天气加载失败:', e.message);
    }
  }

  async function fetchCoverForTrack(track) {
    if (track.cover) return;
    try {
      const kw = `${track.title} ${track.artist}`;
      const result = await api(`/api/netease/search?keyword=${encodeURIComponent(kw)}&limit=1`);
      const songs = result?.songs;
      if (songs && songs.length > 0 && songs[0].al?.picUrl) {
        track.cover = songs[0].al.picUrl;
        UI.setTrack(track.title, track.artist, track.cover);
      }
    } catch (e) {
      // silent
    }
  }

  async function fetchLyrics(track) {
    UI.clearLyrics();
    try {
      const params = [];
      if (track.ncmId) params.push(`ncmId=${track.ncmId}`);
      if (track.filePath) params.push(`filePath=${encodeURIComponent(track.filePath)}`);
      if (params.length === 0) return;

      const data = await api(`/api/lyrics?${params.join('&')}`);
      if (data.parsed && data.parsed.length > 0) {
        UI.setLyrics(data.parsed);
      }
    } catch (e) {
      console.warn('歌词获取失败:', e.message);
    }
  }

  async function updateLikeButton(track) {
    try {
      const data = await api('/api/memory/liked');
      const liked = data.liked || [];
      const key = track.ncmId || track.id || `${track.title}-${track.artist}`;
      const isLiked = liked.some((t) => (t.ncmId || t.id) === key);
      $('#btnLike').textContent = isLiked ? '♥' : '♡';
      if (isLiked) $('#btnLike').classList.add('liked');
      else $('#btnLike').classList.remove('liked');
    } catch (e) {
      // silent
    }
  }

  async function recordPlayHistory(track) {
    try {
      await api('/api/memory/history', { method: 'POST', body: { track } });
    } catch (e) {
      // silent
    }
  }

  async function toggleLikeCurrent() {
    if (currentIndex < 0 || currentIndex >= queue.length) return;
    try {
      const result = await api('/api/memory/like', { method: 'POST', body: { track: queue[currentIndex] } });
      $('#btnLike').textContent = result.isLiked ? '♥' : '♡';
    } catch (e) {
      console.warn('喜欢操作失败:', e.message);
    }
  }

  async function loadSettings() {
    try {
      const s = await api('/api/settings');
      UI.fillSettings(s);
    } catch (e) {
      console.warn('加载设置失败:', e.message);
    }
  }

  async function loadLibrary() {
    try {
      const data = await api('/api/library');
      library = data.tracks || [];
      UI.renderList('#libraryEl', library, -1, false);
    } catch (e) {
      UI.setScanStatus('加载失败: ' + e.message, true);
    }
  }

  // ===== Playback =====
  let _playGen = 0; // generation counter to ignore stale events

  function playTrack(index) {
    if (index < 0 || index >= queue.length) return;
    currentIndex = index;
    const track = queue[index];

    // Clean up previous audio & stale events
    stopAudio();
    const gen = ++_playGen;

    UI.setProgressEnabled(true);
    UI.setProgress(0, 0, 0);
    UI.setTrack(track.title, track.artist, track.cover || null);
    UI.setPlaying(true);
    UI.renderList('#playlistEl', queue, currentIndex);

    // Like button state
    updateLikeButton(track);
    recordPlayHistory(track);

    // Use same-origin proxy (supports Range for seeking, works with Web Audio API)
    const url = getTrackUrl(track);
    if (!url) {
      console.warn('无法获取播放地址');
      return;
    }

    const audio = new Audio();
    audio.volume = parseFloat($('#volumeSlider').value || 80) / 100;
    window._audio = audio;

    audio.addEventListener('ended', () => { if (gen === _playGen) handleTrackEnd(); });
    audio.addEventListener('timeupdate', () => {
      if (gen !== _playGen || !audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      UI.setProgress(pct, audio.currentTime, audio.duration);
      UI.updateLyricDisplay(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => {
      if (gen === _playGen) UI.setProgress(0, 0, audio.duration);
    });
    audio.addEventListener('error', () => {
      if (gen !== _playGen) return;
      console.warn('播放出错，跳到下一首');
      handleTrackEnd();
    });

    audio.src = url;
    audio.play().catch(e => console.warn('播放失败:', e));

    startAmbientPulse();

    // Fetch cover & lyrics
    fetchCoverForTrack(track);
    fetchLyrics(track);
  }

  function getTrackUrl(track) {
    if (track.source === 'local' || track.filePath) {
      return `/api/library/stream?path=${encodeURIComponent(track.filePath)}`;
    }
    if (track.url) return track.url;
    return '';
  }

  function resumeAudio() {
    if (window._audio) {
      window._audio.play().catch(() => {});
      UI.setPlaying(true);
      startAmbientPulse();
    }
  }

  function pauseAudio() {
    if (window._audio) {
      window._audio.pause();
      UI.setPlaying(false);
    }
  }

  function stopAudio() {
    stopAmbientPulse();
    UI.clearLyrics();
    stopIntroAudio();
    hideIntroBubble();
    _introPlaying = false;
    if (window._audio) {
      window._audio.pause();
      window._audio = null;
    }
  }

  async function handleTrackEnd() {
    // Skip DJ segue if this track already had a recommended intro
    if (_skipNextSegue) {
      _skipNextSegue = false;
      // Fall through to auto-play next without segue
      if (currentIndex + 1 < queue.length) {
        playTrack(currentIndex + 1);
      } else {
        stopAudio();
        currentIndex = -1;
        UI.setPlaying(false);
        UI.setTrack('播放完毕', 'AI 电台');
      }
      return;
    }

    // Check for DJ segue
    try {
      const s = await api('/api/settings');
      const djEnabled = s.dj?.enabled !== false;
      const freq = s.dj?.frequency || 'every_track';

      if (djEnabled && shouldPlayDJ(currentIndex, queue.length, freq)) {
        const nextTrack = currentIndex + 1 < queue.length ? queue[currentIndex + 1] : null;
        if (nextTrack) {
          const dj = await api('/api/dj/segue', {
            method: 'POST',
            body: { currentTrack: queue[currentIndex], nextTrack },
          });
          if (dj.script) {
            UI.showDJMessage(dj.script);
          }
          if (dj.audioUrl) {
            await playDJAudio(dj.audioUrl);
          }
          UI.hideDJMessage();
        }
      }
    } catch (e) {
      // DJ segue failed, continue
    }

    // Auto-play next
    if (currentIndex + 1 < queue.length) {
      playTrack(currentIndex + 1);
    } else {
      stopAudio();
      currentIndex = -1;
      UI.setPlaying(false);
      UI.setTrack('播放完毕', 'AI 电台');
    }
  }

  function shouldPlayDJ(idx, total, freq) {
    switch (freq) {
      case 'every_track': return true;
      case 'every_3': return (idx + 1) % 3 === 0;
      case 'every_5': return (idx + 1) % 5 === 0;
      case 'first_only': return idx === 0;
      default: return true;
    }
  }

  let _introAudio = null;

  function playDJAudio(url) {
    return new Promise((resolve) => {
      stopIntroAudio();
      const a = new Audio();
      a.volume = parseFloat($('#volumeSlider').value || 80) / 100;
      a.src = url;
      a.onended = () => { _introAudio = null; resolve(); };
      a.onerror = () => { _introAudio = null; resolve(); };
      a.play().catch(() => { _introAudio = null; resolve(); });
      _introAudio = a;
    });
  }

  function stopIntroAudio() {
    if (_introAudio) {
      _introAudio.pause();
      _introAudio = null;
    }
  }

  function handleProgress(pct, current, total) {
    UI.setProgress(pct, current, total);
  }

  function handleLoaded(duration) {
    UI.setProgress(0, 0, duration);
  }

  // ===== Events =====
  function bindEvents() {
    // Play controls
    $('#btnPlay').addEventListener('click', () => {
      if (window._audio && !window._audio.paused) {
        pauseAudio();
      } else if (window._audio && window._audio.paused && !window._audio.ended) {
        resumeAudio();
      } else if (queue.length > 0) {
        playTrack(currentIndex >= 0 ? currentIndex : 0);
      }
    });

    $('#btnNext').addEventListener('click', () => {
      if (currentIndex + 1 < queue.length) {
        stopAudio();
        playTrack(currentIndex + 1);
      }
    });

    $('#btnPrev').addEventListener('click', () => {
      if (currentIndex > 0) {
        stopAudio();
        playTrack(currentIndex - 1);
      }
    });

    // Volume
    $('#volumeSlider').addEventListener('input', function () {
      if (window._audio) window._audio.volume = this.value / 100;
    });

    // Progress seek (drag + click)
    function seekAudio(value) {
      if (window._audio && window._audio.duration && isFinite(window._audio.duration)) {
        window._audio.currentTime = (value / 100) * window._audio.duration;
      }
    }
    $('#progressBar').addEventListener('input', function () {
      seekAudio(this.value);
    });
    $('#progressBar').addEventListener('change', function () {
      seekAudio(this.value);
    });

    // Nav sidebar entries (exclude chat — handled by chat.js)
    $$('.nav-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        if (entry.dataset.nav === 'chat') return;
        UI.switchNav(entry.dataset.nav);
        if (entry.dataset.nav === 'library') loadLibrary();
      });
    });

    // Playlist: click track to play
    $('#playlistEl').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) {
        const item = e.target.closest('.track-item');
        if (item) playTrack(parseInt(item.dataset.index, 10));
        return;
      }
      const idx = parseInt(btn.dataset.index, 10);
      if (btn.dataset.action === 'play') playTrack(idx);
      if (btn.dataset.action === 'remove') removeFromQueue(idx);
    });

    // AI generate
    $('#btnGenerate').addEventListener('click', generatePlaylist);

    // Add all AI to queue
    $('#btnAddAllAI').addEventListener('click', () => {
      api('/api/queue/add', { method: 'POST', body: { track: aiPlaylist } })
        .then(() => { loadStatus(); showToast(`已加入 ${aiPlaylist.length} 首`); });
    });

    // AI result list: play/add
    $('#aiPlaylistEl').addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.track-item')?.dataset.index, 10);
      if (isNaN(idx)) return;
      const track = aiPlaylist[idx];
      api('/api/queue/add', { method: 'POST', body: { track } })
        .then(() => { loadStatus(); showToast('已加入队列'); });
    });

    // Scan library
    $('#btnScan').addEventListener('click', async () => {
      const dir = $('#musicDirInput').value.trim();
      if (!dir) {
        UI.setScanStatus('请输入音乐目录路径', true);
        return;
      }
      UI.setScanStatus('扫描中...');
      try {
        const data = await api('/api/library/scan', { method: 'POST', body: { dir } });
        library = data.tracks || [];
        UI.renderList('#libraryEl', library, -1, false);
        UI.setScanStatus(`扫描完成，找到 ${library.length} 首曲目`);
      } catch (e) {
        UI.setScanStatus('扫描失败: ' + e.message, true);
      }
    });

    // Library: click to add to queue
    $('#libraryEl').addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.track-item')?.dataset.index, 10);
      if (isNaN(idx)) return;
      api('/api/queue/add', { method: 'POST', body: { track: library[idx] } })
        .then(() => { loadStatus(); showToast('已加入队列'); });
    });

    // Clear queue
    $('#btnClearQueue').addEventListener('click', async () => {
      stopAudio();
      currentIndex = -1;
      await api('/api/queue/clear', { method: 'POST' });
      UI.renderList('#playlistEl', [], -1);
      UI.setQueueCount(0);
      UI.setTrack('准备开始', 'AI 电台');
      UI.setPlaying(false);
    });

    // Like button
    $('#btnLike').addEventListener('click', toggleLikeCurrent);

    // Weather playlist
    $('#btnWeather').addEventListener('click', async () => {
      UI.setGenerating(true);
      try {
        const data = await api('/api/playlist/weather', { method: 'POST', body: {} });
        if (data.weather) {
          UI.setMood(`${data.weather.description} ${data.weather.temperature}°`);
          UI.setWeatherMini(data.weather);
        }
        const playlist = data.playlist || [];
        aiPlaylist = playlist;
        UI.renderList('#aiPlaylistEl', aiPlaylist, -1, false);
        UI.showAIResult(true);
        await setRecommended(aiPlaylist);
      } catch (e) {
        alert('天气歌单生成失败: ' + e.message);
      }
      UI.setGenerating(false);
    });

    // Save taste snapshot
    // Recommended panel events
    $('#recommendedEl').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      if (btn.dataset.action === 'play-rec') playRecommendedTrack(idx);
      if (btn.dataset.action === 'add-rec') addRecommendedToQueue(idx);
      if (btn.dataset.action === 'remove-rec') removeRecommendedTrack(idx);
    });

    $('#btnAddAllRecommended').addEventListener('click', addAllRecommendedToQueue);
    $('#btnClearRecommended').addEventListener('click', clearRecommended);

    $('#btnSaveTaste').addEventListener('click', async () => {
      if (aiPlaylist.length === 0) {
        alert('请先生成歌单');
        return;
      }
      try {
        // Use real AI analysis on generated playlist to build persona
        const tracks = aiPlaylist.map((t) => ({ name: t.title, artist: t.artist }));
        const data = await api('/api/memory/update-persona', {
          method: 'POST',
          body: { tracks, source: 'ai-generate' },
        });
        alert('品味画像已保存到本地记忆');
      } catch (e) {
        alert('保存失败: ' + e.message);
      }
    });

    // Save settings
    $('#btnSaveSettings').addEventListener('click', async () => {
      UI.setSaving(true);
      try {
        await api('/api/settings', { method: 'POST', body: UI.readSettings() });
        alert('设置已保存');
      } catch (e) {
        alert('保存失败: ' + e.message);
      }
      UI.setSaving(false);
    });
  }

  async function generatePlaylist() {
    UI.setGenerating(true);
    UI.showAIResult(false);
    try {
      const form = UI.readAIForm();
      const data = await api('/api/playlist/generate', { method: 'POST', body: form });
      aiPlaylist = data.playlist || [];
      UI.renderList('#aiPlaylistEl', aiPlaylist, -1, false);
      UI.showAIResult(true);
      if (form.mood) UI.setMood(form.mood);
      // Also set as recommended playlist
      await setRecommended(aiPlaylist);
    } catch (e) {
      alert('生成失败: ' + e.message);
    }
    UI.setGenerating(false);
  }

  async function removeFromQueue(index) {
    try {
      await api(`/api/queue/${index}`, { method: 'DELETE' });
      await loadStatus();
    } catch (e) {
      console.warn('移除失败:', e.message);
    }
  }

  // ===== Recommended Playlist =====
  const _introCache = new Map(); // key: "title|artist" → {script, audioUrl}
  let _introPlaying = false; // guard against double-click
  let _skipNextSegue = false; // skip DJ segue after recommended track intro
  let _bubblePosTimer = null; // timer to update bubble position when drawer toggles

  function _cacheKey(track) {
    return `${track.title || ''}|${track.artist || ''}`;
  }

  async function prefetchIntros(startIdx = 0, count = 2) {
    for (let i = startIdx; i < Math.min(startIdx + count, recommendedTracks.length); i++) {
      const track = recommendedTracks[i];
      const key = _cacheKey(track);
      if (_introCache.has(key)) continue;
      try {
        const data = await api('/api/dj/song-intro', { method: 'POST', body: { track } });
        if (data.script || data.audioUrl) {
          _introCache.set(key, data);
        }
      } catch (e) {
        // silent — prefetch is best-effort
      }
    }
  }

  async function loadRecommended() {
    try {
      const data = await api('/api/recommended');
      recommendedTracks = data.tracks || [];
      renderRecommended();
      // Pre-fetch intro for first track in background
      if (recommendedTracks.length > 0) {
        prefetchIntros(0, 1);
      }
    } catch (e) {
      // silent
    }
  }

  async function setRecommended(tracks) {
    recommendedTracks = tracks;
    await api('/api/recommended/set', { method: 'POST', body: { tracks } });
    renderRecommended();
    // Pre-fetch intro for first track
    if (recommendedTracks.length > 0) {
      prefetchIntros(0, 1);
    }
  }

  function renderRecommended() {
    const el = $('#recommendedEl');
    if (!el) return;
    $('#recommendedCount').textContent = `推荐歌单 · ${recommendedTracks.length} 首`;
    el.innerHTML = recommendedTracks.map((t, i) => `
      <li class="track-item" data-index="${i}">
        <span class="track-num">${i + 1}</span>
        <div class="track-meta">
          <div class="track-name">${escHtml(t.title || '未知')}</div>
          <div class="track-art">${escHtml(t.artist || '未知')}</div>
          ${t.note ? `<div class="track-note">${escHtml(t.note)}</div>` : ''}
        </div>
        ${t.duration ? `<span class="track-dur">${formatTime(t.duration)}</span>` : ''}
        <div class="track-actions">
          <button class="btn-sm-icon" data-action="play-rec" data-index="${i}" title="${_introCache.has(_cacheKey(t)) ? 'DJ介绍后播放（已缓存）' : 'DJ介绍后播放'}">▶</button>
          <button class="btn-sm-icon" data-action="add-rec" data-index="${i}" title="加入列表">+</button>
          <button class="btn-sm-icon" data-action="remove-rec" data-index="${i}" title="移除">✕</button>
        </div>
      </li>
    `).join('');
  }

  async function playRecommendedTrack(index) {
    if (_introPlaying) return; // guard against concurrent calls
    const track = recommendedTracks[index];
    if (!track) return;

    // Stop any current playback (including intro if playing)
    stopAudio();
    _introPlaying = true;
    try {
      const key = _cacheKey(track);

      // Show text bubble immediately if we have cached intro
      let introData = _introCache.get(key);
      if (introData) {
        _introCache.delete(key); // use once
        if (introData.script) {
          showIntroBubble(introData.script);
        }
      } else {
        // Fetch on-demand (slower path)
        introData = await api('/api/dj/song-intro', { method: 'POST', body: { track } });
        if (introData.script) {
          showIntroBubble(introData.script);
        }
      }

      if (introData.audioUrl) {
        await playDJAudio(introData.audioUrl);
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Abort if user switched tracks during intro
      if (!_introPlaying) return;

      hideIntroBubble();

      // Skip DJ segue for this track since we just played an intro
      _skipNextSegue = true;

      // Add to front of queue and play
      await api('/api/queue/add', { method: 'POST', body: { track, toFront: true } });
      await loadStatus();
      playTrack(0);

      // Remove from recommended
      recommendedTracks.splice(index, 1);
      await api('/api/recommended/set', { method: 'POST', body: { tracks: recommendedTracks } });
      renderRecommended();

      // Pre-fetch next track's intro
      if (recommendedTracks.length > 0) {
        prefetchIntros(0, 1);
      }
    } catch (e) {
      hideIntroBubble();
      console.warn('推荐播放失败:', e.message);
      await api('/api/queue/add', { method: 'POST', body: { track } });
      loadStatus();
      showToast('已加入队列');
    } finally {
      _introPlaying = false;
    }
  }

  async function addRecommendedToQueue(index) {
    const track = recommendedTracks[index];
    if (!track) return;
    await api('/api/queue/add', { method: 'POST', body: { track } });
    loadStatus();
    showToast('已加入队列');
  }

  async function addAllRecommendedToQueue() {
    if (recommendedTracks.length === 0) return;
    await api('/api/queue/add', { method: 'POST', body: { track: recommendedTracks } });
    loadStatus();
    showToast(`已加入 ${recommendedTracks.length} 首`);
  }

  async function removeRecommendedTrack(index) {
    const track = recommendedTracks[index];
    recommendedTracks.splice(index, 1);
    await api('/api/recommended/set', { method: 'POST', body: { tracks: recommendedTracks } });
    renderRecommended();
    // Clear cached intro for removed track
    const key = _cacheKey(track);
    if (_introCache.has(key)) _introCache.delete(key);
  }

  async function clearRecommended() {
    recommendedTracks = [];
    await api('/api/recommended/clear', { method: 'POST' });
    renderRecommended();
  }

  function getBubbleLeft() {
    const styles = getComputedStyle(document.documentElement);
    const navWidth = parseFloat(styles.getPropertyValue('--nav-width')) || 56;
    const playerMax = parseFloat(styles.getPropertyValue('--player-max')) || 570;
    const vw = window.innerWidth;
    const bubbleWidth = 280;
    const gap = 20; // gap between bubble right edge and player left edge

    const drawerOpen = $('#panelDrawer').classList.contains('open');
    if (drawerOpen) {
      // Bubble sits just right of drawer, right edge near player left
      const drawerWidth = (parseFloat(styles.getPropertyValue('--drawer-width')) / 100) * vw;
      return (navWidth + drawerWidth + 8) + 'px';
    } else {
      // Player is centered in remaining space (no drawer)
      const playerLeft = navWidth + (vw - navWidth - playerMax) / 2;
      return (playerLeft - bubbleWidth - gap) + 'px';
    }
  }

  function showIntroBubble(text) {
    const bubble = $('#djIntroBubble');
    const textEl = $('#djIntroText');
    if (bubble && textEl) {
      bubble.style.left = getBubbleLeft();
      textEl.textContent = text;
      bubble.classList.add('visible');

      // Keep position updated if drawer toggles while bubble is visible
      _bubblePosTimer = setInterval(() => {
        if (!bubble.classList.contains('visible')) {
          clearInterval(_bubblePosTimer);
          _bubblePosTimer = null;
          return;
        }
        bubble.style.left = getBubbleLeft();
      }, 100);
    }
  }

  function hideIntroBubble() {
    const bubble = $('#djIntroBubble');
    if (bubble) bubble.classList.remove('visible');
    if (_bubblePosTimer) {
      clearInterval(_bubblePosTimer);
      _bubblePosTimer = null;
    }
  }

  // Expose for netease.js
  window.playTrack = playTrack;
  window.loadStatus = loadStatus;
  window.refreshRecommended = loadRecommended;

  // ===== Clock =====
  function updateClock() {
    const now = new Date();
    UI.setTime(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  }

  // ===== Frequency =====
  function randomizeFrequency() {
    const freq = (87.5 + Math.random() * 20.5).toFixed(1);
    UI.setFrequency(freq);
  }

  // ===== Start =====
  document.addEventListener('DOMContentLoaded', function () {
    init();
    if (typeof initNeteaseEvents === 'function') {
      initNeteaseEvents();
    }
    if (typeof Chat !== 'undefined' && Chat.init) {
      Chat.init();
    }
  });
})();
