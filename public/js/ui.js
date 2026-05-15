const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const UI = {
  // Track info
  setTrack(title, artist, cover) {
    $('#trackTitle').textContent = title || '未知曲目';
    $('#trackArtist').textContent = artist || '未知艺术家';
    $('#artworkTitle').textContent = title || 'AI Radio';
    $('#artworkSubtitle').textContent = artist || 'FM 102.4';

    const artwork = $('#artwork');
    const img = $('#artworkImg');
    const inner = $('#artworkInner');

    if (cover) {
      img.src = cover;
      img.style.display = 'block';
      img.onload = function () {
        artwork.classList.add('has-cover');
        inner.style.opacity = '0';
      };
      img.onerror = function () {
        // Fallback: hide img, show inner
        img.style.display = 'none';
        artwork.classList.remove('has-cover');
        inner.style.opacity = '1';
      };
    } else {
      img.src = '';
      img.style.display = 'none';
      artwork.classList.remove('has-cover');
      inner.style.opacity = '1';
    }
  },

  // DJ message
  showDJMessage(text) {
    const el = $('#djMessage');
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 8000);
  },

  hideDJMessage() {
    $('#djMessage').style.display = 'none';
  },

  // Play state
  setPlaying(playing) {
    const btn = $('#btnPlay');
    btn.textContent = playing ? '⏸' : '▶';
    const artwork = $('#artwork');
    if (playing) {
      artwork.classList.add('playing');
    } else {
      artwork.classList.remove('playing');
    }
    // Enable/disable progress bar
    this.setProgressEnabled(playing);
  },

  // Lyrics
  setLyrics(lyricLines) {
    this._lyrics = lyricLines || [];
    this._lastLyricIdx = -1;
    this.updateLyricDisplay(0);
  },

  updateLyricDisplay(currentTime) {
    if (!this._lyrics || this._lyrics.length === 0) {
      $('#lyricLine0').textContent = '';
      $('#lyricLine1').textContent = '';
      $('#lyricLine2').textContent = '纯音乐 · 享受旋律';
      $('#lyricLine3').textContent = '';
      $('#lyricLine4').textContent = '';
      return;
    }

    // Find current lyric line
    let activeIdx = -1;
    for (let i = this._lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= this._lyrics[i].time) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx !== this._lastLyricIdx) {
      this._lastLyricIdx = activeIdx;
      this._renderLyricLines(activeIdx);
    }
  },

  _renderLyricLines(activeIdx) {
    const lines = this._lyrics;
    // Show 2 lines before, current, 2 lines after
    const slots = [
      { el: 'lyricLine0', cls: 'prev', idx: activeIdx - 2 },
      { el: 'lyricLine1', cls: 'prev', idx: activeIdx - 1 },
      { el: 'lyricLine2', cls: 'active', idx: activeIdx },
      { el: 'lyricLine3', cls: '', idx: activeIdx + 1 },
      { el: 'lyricLine4', cls: '', idx: activeIdx + 2 },
    ];

    for (const slot of slots) {
      const el = $('#' + slot.el);
      if (slot.idx >= 0 && slot.idx < lines.length) {
        el.textContent = lines[slot.idx].text;
        el.className = 'lyric-line ' + slot.cls;
      } else {
        el.textContent = '';
        el.className = 'lyric-line';
      }
    }
  },

  clearLyrics() {
    this._lyrics = [];
    this._lastLyricIdx = -1;
    $('#lyricLine0').textContent = '';
    $('#lyricLine1').textContent = '';
    $('#lyricLine2').textContent = '等待音乐...';
    $('#lyricLine3').textContent = '';
    $('#lyricLine4').textContent = '';
  },

  // Progress
  setProgress(pct, current, total) {
    const bar = $('#progressBar');
    bar.value = pct;
    $('#currentTime').textContent = formatTime(current);
    $('#totalTime').textContent = formatTime(total);
  },

  setProgressEnabled(enabled) {
    const bar = $('#progressBar');
    if (enabled) {
      bar.disabled = false;
      bar.value = 0;
    } else {
      bar.disabled = true;
      bar.value = 0;
      $('#currentTime').textContent = '00:00';
      $('#totalTime').textContent = '00:00';
    }
  },

  // Frequency display
  setFrequency(v) {
    $('#freqDisplay').textContent = v;
  },

  // Clock
  setTime(t) {
    $('#timeDisplay').textContent = t;
  },

  // Mood tag
  setMood(tag) {
    $('#moodTag').textContent = tag;
  },

  // Weather
  setWeatherMini(w) {
    if (w && w.city) {
      $('#weatherMini').textContent = `${w.city} ${w.temperature}° ${w.description}`;
    } else {
      $('#weatherMini').textContent = '';
    }
  },

  // Render track list
  renderList(containerId, tracks, currentIndex, showActions = true) {
    const el = $(containerId);
    if (!el) return;
    el.innerHTML = tracks.map((t, i) => `
      <li class="track-item${i === currentIndex ? ' playing' : ''}" data-index="${i}">
        <span class="track-num">${i + 1}</span>
        <div class="track-meta">
          <div class="track-name">${escHtml(t.title || '未知')}</div>
          <div class="track-art">${escHtml(t.artist || '未知')}</div>
          ${t.note ? `<div class="track-note">${escHtml(t.note)}</div>` : ''}
        </div>
        ${t.duration ? `<span class="track-dur">${formatTime(t.duration)}</span>` : ''}
        ${showActions ? `
        <div class="track-actions">
          <button class="btn-sm-icon" data-action="play" data-index="${i}" title="播放">▶</button>
          <button class="btn-sm-icon" data-action="remove" data-index="${i}" title="移除">✕</button>
        </div>` : ''}
      </li>
    `).join('');
  },

  // Nav / Drawer
  _activeNav: null,

  switchNav(name) {
    const drawer = $('#panelDrawer');
    const isSame = this._activeNav === name;
    const wasOpen = drawer.classList.contains('open');

    if (isSame && wasOpen) {
      // Close drawer
      drawer.classList.remove('open');
      $$('.nav-entry').forEach(n => n.classList.remove('active'));
      this._activeNav = null;
      return;
    }

    // Open drawer & switch panel
    $$('.nav-entry').forEach(n => n.classList.toggle('active', n.dataset.nav === name));
    $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    drawer.classList.add('open');
    this._activeNav = name;
  },

  closeDrawer() {
    const drawer = $('#panelDrawer');
    drawer.classList.remove('open');
    $$('.nav-entry').forEach(n => n.classList.remove('active'));
    this._activeNav = null;
  },

  // Scan status
  setScanStatus(text, isError = false) {
    const el = $('#scanStatus');
    el.textContent = text;
    el.style.color = isError ? '#e43f5a' : '';
  },

  // Queue count
  setQueueCount(n) {
    $('#queueCount').textContent = `共 ${n} 首`;
  },

  // Settings form
  fillSettings(s) {
    $('#settingApiKey').value = s.ai?.apiKey || '';
    $('#settingApiBase').value = s.ai?.apiBase || 'https://api.openai.com/v1';
    $('#settingModel').value = s.ai?.model || 'gpt-4o';
    $('#settingDJVoice').value = s.tts?.voice || s.dj?.voice || 'mimo_default';
    $('#settingDJFreq').value = s.dj?.frequency || 'every_track';
    $('#settingDJEnabled').checked = s.dj?.enabled !== false;
    $('#musicDirInput').value = s.musicDir || '';
    $('#settingTTSKey').value = s.tts?.apiKey || '';
    $('#settingTTSApiBase').value = s.tts?.apiBase || '';
    $('#settingTTSModel').value = s.tts?.model || 'mimo-v2.5-tts';
    $('#settingTTSVoice').value = s.tts?.voice || 'mimo_default';
    $('#settingWeatherKey').value = s.openweather?.apiKey || '';
    $('#settingWeatherCity').value = s.openweather?.city || '';
  },

  readSettings() {
    return {
      ai: {
        apiKey: $('#settingApiKey').value.trim(),
        apiBase: $('#settingApiBase').value.trim(),
        model: $('#settingModel').value.trim(),
      },
      dj: {
        enabled: $('#settingDJEnabled').checked,
        voice: $('#settingDJVoice').value,
        frequency: $('#settingDJFreq').value,
      },
      musicDir: $('#musicDirInput').value.trim(),
      tts: {
        apiKey: $('#settingTTSKey').value.trim(),
        apiBase: $('#settingTTSApiBase').value.trim(),
        model: $('#settingTTSModel').value.trim() || 'mimo-v2.5-tts',
        voice: $('#settingTTSVoice').value.trim() || 'mimo_default',
      },
      openweather: {
        apiKey: $('#settingWeatherKey').value.trim(),
        city: $('#settingWeatherCity').value.trim(),
      },
    };
  },

  // AI form
  readAIForm() {
    return {
      mood: $('#aiMood').value.trim(),
      genre: $('#aiGenre').value.trim(),
      era: $('#aiEra').value.trim(),
      count: parseInt($('#aiCount').value, 10) || 10,
    };
  },

  showAIResult(show) {
    $('#aiResult').style.display = show ? 'block' : 'none';
  },

  // Disable/enable generate button
  setGenerating(loading) {
    const btn = $('#btnGenerate');
    btn.disabled = loading;
    btn.textContent = loading ? '生成中...' : 'AI 生成歌单';
  },

  setSaving(loading) {
    const btn = $('#btnSaveSettings');
    btn.disabled = loading;
    btn.textContent = loading ? '保存中...' : '保存设置';
  },
};

window.UI = UI;

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

let _toastTimer = null;
function showToast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 1800);
}
