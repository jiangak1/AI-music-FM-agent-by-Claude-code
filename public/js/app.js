(function () {
  'use strict';

  // ===== State =====
  let queue = [];
  let currentIndex = -1;
  let aiPlaylist = [];
  let recommendedTracks = [];
  let library = [];

  // ===== Audio Visualizer (Web Audio API) =====
  let _audioCtx = null;
  let _analyser = null;
  let _source = null;
  let _vizAnimId = null;

  function initAudioContext() {
    if (_audioCtx) return;
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 256;
      _analyser.smoothingTimeConstant = 0.85;
    } catch (e) {
      console.warn('Web Audio API 不可用:', e.message);
    }
  }

  function connectAudioSource(audioEl) {
    if (!_analyser || !audioEl) return;
    try {
      if (_source) {
        _source.disconnect();
        _source = null;
      }
      _source = _audioCtx.createMediaElementSource(audioEl);
      _source.connect(_analyser);
      _analyser.connect(_audioCtx.destination);
    } catch (e) {
      // May fail if already connected from a previous play
    }
  }

  function avgRange(arr, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += arr[i];
    return sum / (end - start);
  }

  function startAudioVisualizer(audioEl) {
    stopAudioVisualizer();
    initAudioContext();
    connectAudioSource(audioEl);

    const bgEl = $('#ambientBg');
    if (!bgEl) return;
    bgEl.classList.add('active');

    const freqData = new Uint8Array(_analyser ? _analyser.frequencyBinCount : 128);
    const bgImage = $('#bgImage');

    function visualize() {
      if (!bgEl) { _vizAnimId = null; return; }
      const audio = window._audio;
      const playing = audio && !audio.paused && !audio.ended;
      if (!playing) {
        _vizAnimId = requestAnimationFrame(visualize);
        return;
      }

      if (_analyser) {
        _analyser.getByteFrequencyData(freqData);
      }

      const bass = _analyser ? avgRange(freqData, 0, 8) : 0;
      const mid  = _analyser ? avgRange(freqData, 8, 40) : 0;
      const high = _analyser ? avgRange(freqData, 40, 128) : 0;
      const totalEnergy = (bass * 0.5 + mid * 0.3 + high * 0.2) / 255;

      const scale = 1 + totalEnergy * 0.08;
      const bright = 0.08 + totalEnergy * 0.18;
      const saturation = 0.3 + totalEnergy * 0.7;
      const hueBase = 0;
      const hueShift = (bass / 255) * 25 - 10;

      bgEl.style.transform = `scale(${scale})`;
      bgEl.style.opacity = Math.min(1, 0.25 + totalEnergy * 1.5);
      bgEl.style.background = `
        radial-gradient(ellipse at 50% 40%, hsla(${hueBase + hueShift}, 80%, ${40 + mid / 255 * 20}%, ${0.08 + totalEnergy * 0.15}) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 60%, hsla(${(hueBase + 30 + hueShift) % 360}, 60%, ${35 + high / 255 * 15}%, ${0.04 + totalEnergy * 0.1}) 0%, transparent 50%)
      `;

      if (bgImage) {
        bgImage.style.filter = `saturate(${saturation}) brightness(${0.8 + totalEnergy * 0.4})`;
      }

      _vizAnimId = requestAnimationFrame(visualize);
    }
    _vizAnimId = requestAnimationFrame(visualize);
  }

  function stopAudioVisualizer() {
    if (_vizAnimId) {
      cancelAnimationFrame(_vizAnimId);
      _vizAnimId = null;
    }
    const bgEl = $('#ambientBg');
    if (bgEl) {
      bgEl.classList.remove('active');
      bgEl.style.transform = 'scale(1)';
      bgEl.style.opacity = '';
      bgEl.style.background = '';
    }
    const bgImage = $('#bgImage');
    if (bgImage) {
      bgImage.style.filter = '';
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

  // ===== Data loading =====
  async function loadStatus() {
    try {
      const s = await API.getStatus();
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
      const w = await API.getWeather();
      UI.setWeatherMini(w);
    } catch (e) {
      console.warn('天气加载失败:', e.message);
    }
  }

  async function fetchCoverForTrack(track) {
    if (track.cover) return;
    try {
      const kw = `${track.title} ${track.artist}`;
      const result = await API.searchNetease(kw, 1);
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

      const data = await API.getLyrics(track);
      if (data.parsed && data.parsed.length > 0) {
        UI.setLyrics(data.parsed);
      }
    } catch (e) {
      console.warn('歌词获取失败:', e.message);
    }
  }

  async function updateLikeButton(track) {
    try {
      const data = await API.getLiked();
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
      await API.recordPlay(track);
    } catch (e) {
      // silent
    }
  }

  async function toggleLikeCurrent() {
    if (currentIndex < 0 || currentIndex >= queue.length) return;
    try {
      const result = await API.toggleLike(queue[currentIndex]);
      $('#btnLike').textContent = result.isLiked ? '♥' : '♡';
    } catch (e) {
      console.warn('喜欢操作失败:', e.message);
    }
  }

  async function loadSettings() {
    try {
      const s = await API.getSettings();
      UI.fillSettings(s);
    } catch (e) {
      console.warn('加载设置失败:', e.message);
    }
  }

  async function loadLibrary() {
    try {
      const data = await API.getLibrary();
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

    startAudioVisualizer(audio);

    // Fetch cover & lyrics
    fetchCoverForTrack(track);
    fetchLyrics(track);
  }

  function getTrackUrl(track) {
    if (track.source === 'local' || track.filePath) {
      return API.getLibraryStreamUrl(track.filePath);
    }
    if (track.url) return track.url;
    return '';
  }

  function resumeAudio() {
    if (window._audio) {
      window._audio.play().catch(() => {});
      UI.setPlaying(true);
      startAudioVisualizer(window._audio);
    }
  }

  function pauseAudio() {
    if (window._audio) {
      window._audio.pause();
      UI.setPlaying(false);
    }
  }

  function stopAudio() {
    stopAudioVisualizer();
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
      const s = await API.getSettings();
      const djEnabled = s.dj?.enabled !== false;
      const freq = s.dj?.frequency || 'every_track';

      if (djEnabled && shouldPlayDJ(currentIndex, queue.length, freq)) {
        const nextTrack = currentIndex + 1 < queue.length ? queue[currentIndex + 1] : null;
        if (nextTrack) {
          const dj = await API.getDJSegue(queue[currentIndex], nextTrack);
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
      API.addToQueue(aiPlaylist)
        .then(() => { loadStatus(); showToast(`已加入 ${aiPlaylist.length} 首`); });
    });

    // AI result list: play/add
    $('#aiPlaylistEl').addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.track-item')?.dataset.index, 10);
      if (isNaN(idx)) return;
      const track = aiPlaylist[idx];
      API.addToQueue(track)
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
        const data = await API.scanLibrary(dir);
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
      API.addToQueue(library[idx])
        .then(() => { loadStatus(); showToast('已加入队列'); });
    });

    // Clear queue
    $('#btnClearQueue').addEventListener('click', async () => {
      stopAudio();
      currentIndex = -1;
      await API.clearQueue();
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
        const data = await API.generateWeatherPlaylist();
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
        const data = await API.updatePersona(tracks, 'ai-generate');
        alert('品味画像已保存到本地记忆');
      } catch (e) {
        alert('保存失败: ' + e.message);
      }
    });

    // Save settings
    $('#btnSaveSettings').addEventListener('click', async () => {
      UI.setSaving(true);
      try {
        await API.saveSettings(UI.readSettings());
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
      const data = await API.generatePlaylist(form);
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
      await API.removeFromQueue(index);
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
        const data = await API.getSongIntro(track);
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
      const data = await API.getRecommended();
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
    await API.setRecommended(tracks);
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
        introData = await API.getSongIntro(track);
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
      await API.addToQueue(track, true);
      await loadStatus();
      playTrack(0);

      // Remove from recommended
      recommendedTracks.splice(index, 1);
      await API.setRecommended(recommendedTracks);
      renderRecommended();

      // Pre-fetch next track's intro
      if (recommendedTracks.length > 0) {
        prefetchIntros(0, 1);
      }
    } catch (e) {
      hideIntroBubble();
      console.warn('推荐播放失败:', e.message);
      await API.addToQueue(track);
      loadStatus();
      showToast('已加入队列');
    } finally {
      _introPlaying = false;
    }
  }

  async function addRecommendedToQueue(index) {
    const track = recommendedTracks[index];
    if (!track) return;
    await API.addToQueue(track);
    loadStatus();
    showToast('已加入队列');
  }

  async function addAllRecommendedToQueue() {
    if (recommendedTracks.length === 0) return;
    await API.addToQueue(recommendedTracks);
    loadStatus();
    showToast(`已加入 ${recommendedTracks.length} 首`);
  }

  async function removeRecommendedTrack(index) {
    const track = recommendedTracks[index];
    recommendedTracks.splice(index, 1);
    await API.setRecommended(recommendedTracks);
    renderRecommended();
    // Clear cached intro for removed track
    const key = _cacheKey(track);
    if (_introCache.has(key)) _introCache.delete(key);
  }

  async function clearRecommended() {
    recommendedTracks = [];
    await API.clearRecommended();
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
