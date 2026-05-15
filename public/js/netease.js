// ===== 网易云音乐前端逻辑 =====

// Shared API helper (used by netease module)
async function api(endpoint, opts = {}) {
  const res = await fetch(endpoint, {
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

const NeteaseUI = {
  state: {
    loggedIn: false,
    profile: null,
    myPlaylists: [],
    currentPlaylist: null,
    currentTracks: [],
    qrKey: null,
    qrTimer: null,
  },

  async init() {
    this.checkLoginStatus();
  },

  async checkLoginStatus() {
    try {
      const data = await api('/api/netease/status');
      if (data.loggedIn) {
        this.state.loggedIn = true;
        this.state.profile = data.profile;
        this.showLoggedIn();
      }
    } catch (e) {
      console.warn('网易云状态检查失败:', e.message);
    }
  },

  showLoggedIn() {
    document.getElementById('neteaseLogin').style.display = 'none';
    document.getElementById('neteaseContent').style.display = 'block';
    document.getElementById('neteaseLoginStatus').textContent =
      `已登录: ${this.state.profile?.nickname || ''}`;
    this.loadMyPlaylists();
  },

  async startQRLogin() {
    try {
      // Get QR key
      const keyData = await api('/api/netease/qr/key');
      this.state.qrKey = keyData.key;

      // Create QR code
      const qrData = await api(`/api/netease/qr/create?key=${this.state.qrKey}`);
      document.getElementById('neteaseQRImg').src = qrData.qrimg;
      document.getElementById('neteaseQRArea').style.display = 'block';

      // Start polling
      this.startQRPolling();
    } catch (e) {
      alert('扫码登录失败: ' + e.message);
    }
  },

  startQRPolling() {
    if (this.state.qrTimer) clearInterval(this.state.qrTimer);

    this.state.qrTimer = setInterval(async () => {
      try {
        const result = await api(`/api/netease/qr/check?key=${this.state.qrKey}`);
        if (result.code === 800) {
          // Expired
          clearInterval(this.state.qrTimer);
          alert('二维码已过期，请重新获取');
          document.getElementById('neteaseQRArea').style.display = 'none';
        } else if (result.code === 803) {
          // Success
          clearInterval(this.state.qrTimer);
          document.getElementById('neteaseQRArea').style.display = 'none';
          this.checkLoginStatus();
        }
      } catch (e) {
        console.warn('QR 轮询失败:', e.message);
      }
    }, 3000);
  },

  async loadMyPlaylists() {
    try {
      const uid = this.state.profile?.userId;
      if (!uid) return;

      const data = await api(`/api/netease/playlists?uid=${uid}`);
      this.state.myPlaylists = data.playlists || [];
      this.renderPlaylists();
      this.updateTasteSelect();
    } catch (e) {
      console.warn('加载歌单失败:', e.message);
    }
  },

  renderPlaylists() {
    const el = document.getElementById('neteasePlaylistEl');
    el.innerHTML = this.state.myPlaylists.map((pl) => `
      <li class="track-item" data-plid="${pl.id}">
        <img src="${pl.coverImgUrl || ''}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">
        <div class="track-meta">
          <div class="track-name">${escHtml(pl.name)}</div>
          <div class="track-art">${pl.trackCount || 0} 首 · ${escHtml(pl.creator?.nickname || '')}</div>
        </div>
        <button class="btn-sm-icon" data-action="open" data-id="${pl.id}">▶</button>
      </li>
    `).join('');
  },

  updateTasteSelect() {
    const select = document.getElementById('tastePlaylistSelect');
    select.innerHTML = '<option value="">— 选择歌单 —</option>' +
      this.state.myPlaylists.map((pl) =>
        `<option value="${pl.id}">${escHtml(pl.name)} (${pl.trackCount}首)</option>`
      ).join('');
  },

  async openPlaylist(id) {
    try {
      const data = await api(`/api/netease/playlist/${id}/tracks`);
      this.state.currentPlaylist = { id, name: '' };
      this.state.currentTracks = data.tracks || [];

      const plInfo = this.state.myPlaylists.find((p) => String(p.id) === String(id));
      if (plInfo) {
        this.state.currentPlaylist.name = plInfo.name;
      }

      document.getElementById('neteaseDetailTitle').textContent =
        this.state.currentPlaylist.name || '歌单详情';
      this.showSubPanel('playlistDetail');
      this.renderNeteaseTracks();
    } catch (e) {
      alert('加载歌单失败: ' + e.message);
    }
  },

  renderNeteaseTracks() {
    const el = document.getElementById('neteaseTrackEl');
    el.innerHTML = this.state.currentTracks.map((t, i) => `
      <li class="track-item" data-index="${i}">
        <span class="track-num">${i + 1}</span>
        <div class="track-meta">
          <div class="track-name">${escHtml(t.title || '未知')}</div>
          <div class="track-art">${escHtml(t.artist || '未知')}</div>
        </div>
        ${t.duration ? `<span class="track-dur">${formatTime(t.duration)}</span>` : ''}
        <div class="track-actions">
          <button class="btn-sm-icon" data-action="play-ncm" data-index="${i}">▶</button>
          <button class="btn-sm-icon" data-action="add-ncm" data-index="${i}">+</button>
        </div>
      </li>
    `).join('');
  },

  showSubPanel(name) {
    document.querySelectorAll('.netease-panel').forEach((p) => {
      p.style.display = 'none';
    });
    const panelMap = {
      myPlaylists: 'neteaseMyPlaylists',
      playlistDetail: 'neteasePlaylistDetail',
      search: 'neteaseSearch',
      taste: 'neteaseTaste',
    };
    const target = document.getElementById(panelMap[name]);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.netease-subtab').forEach((t) => {
      t.classList.toggle('active', t.dataset.ntab === name);
    });
  },

  async playNeteaseTrack(index) {
    const track = this.state.currentTracks[index];
    if (!track) return;

    try {
      // Get streaming URL
      const urlData = await api(`/api/netease/song/url/${track.ncmId}`);
      if (urlData.url) {
        track.url = urlData.url;
      }
    } catch (e) {
      console.warn('获取歌曲 URL 失败:', e.message);
    }

    // Add to queue and play
    await api('/api/queue/add', { method: 'POST', body: { track } });
    // Play the last item in queue
    const qData = await api('/api/queue');
    const lastIdx = qData.queue.length - 1;
    if (typeof playTrack === 'function') {
      playTrack(lastIdx);
    }
  },

  async addNeteaseToQueue(index) {
    const track = this.state.currentTracks[index];
    if (!track) return;
    await api('/api/queue/add', { method: 'POST', body: { track } });
    if (typeof loadStatus === 'function') loadStatus();
    if (typeof showToast === 'function') showToast('已加入队列');
  },

  async addAllNeteaseToQueue() {
    if (this.state.currentTracks.length === 0) return;
    await api('/api/queue/add', { method: 'POST', body: { track: this.state.currentTracks } });
    if (typeof loadStatus === 'function') loadStatus();
    if (typeof showToast === 'function') showToast(`已加入 ${this.state.currentTracks.length} 首`);
  },

  async search(keyword) {
    try {
      const result = await api(`/api/netease/search?keyword=${encodeURIComponent(keyword)}&limit=30`);
      const songs = result?.songs || [];
      const tracks = songs.map((s) => ({
        id: `ncm_${s.id}`,
        ncmId: s.id,
        title: s.name,
        artist: (s.ar || []).map((a) => a.name).join('/'),
        album: (s.al || {}).name || '',
        duration: Math.round((s.dt || 0) / 1000),
        cover: (s.al || {}).picUrl || '',
        source: 'netease',
      }));

      const el = document.getElementById('neteaseSearchEl');
      el.innerHTML = tracks.map((t, i) => `
        <li class="track-item" data-index="${i}">
          <span class="track-num">${i + 1}</span>
          <div class="track-meta">
            <div class="track-name">${escHtml(t.title)}</div>
            <div class="track-art">${escHtml(t.artist)} — ${escHtml(t.album)}</div>
          </div>
          ${t.duration ? `<span class="track-dur">${formatTime(t.duration)}</span>` : ''}
          <div class="track-actions">
            <button class="btn-sm-icon" data-action="add-search" data-index="${i}">+</button>
          </div>
        </li>
      `).join('');

      // Store for later use
      this._searchResults = tracks;
    } catch (e) {
      alert('搜索失败: ' + e.message);
    }
  },

  async analyzeAndGenerate(playlistId) {
    const resultEl = document.getElementById('tasteAnalysisResult');
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<p style="color:var(--text2);">正在分析品味并生成推荐...</p>';

    try {
      const data = await api('/api/netease/playlist/generate', {
        method: 'POST',
        body: { playlistId, count: 20 },
      });

      const taste = data.taste;
      const recommendations = data.recommendations || [];

      resultEl.innerHTML = `
        <div style="background:var(--surface);padding:12px;border-radius:8px;margin-bottom:12px;">
          <h4 style="color:var(--accent);margin-bottom:8px;">品味分析</h4>
          <p style="font-size:13px;color:var(--text2);margin-bottom:4px;"><strong>主要风格：</strong>${(taste.genres || []).join('、')}</p>
          <p style="font-size:13px;color:var(--text2);margin-bottom:4px;"><strong>语言偏好：</strong>${(taste.preferredLanguages || []).join('、')}</p>
          <p style="font-size:13px;color:var(--text2);margin-bottom:4px;"><strong>年代偏好：</strong>${taste.eraPreference || '-'}</p>
          <p style="font-size:13px;color:var(--text2);margin-bottom:4px;"><strong>心情画像：</strong>${taste.moodProfile || '-'}</p>
          <p style="font-size:13px;color:var(--text2);">${taste.tasteSummary || ''}</p>
        </div>
        <div class="panel-header">
          <span>AI 推荐歌单</span>
          <button class="btn-sm" id="btnAddTasteRecs">全部加入队列</button>
        </div>
      `;

      // Render recommendations
      const recEl = document.getElementById('tasteRecommendEl');
      recEl.innerHTML = recommendations.map((r, i) => `
        <li class="track-item" data-index="${i}">
          <span class="track-num">${i + 1}</span>
          <div class="track-meta">
            <div class="track-name">${escHtml(r.title)}</div>
            <div class="track-art">${escHtml(r.artist)}</div>
            ${r.note ? `<div class="track-note">${escHtml(r.note)}</div>` : ''}
          </div>
          <div class="track-actions">
            <button class="btn-sm-icon" data-action="add-recommend" data-index="${i}">+</button>
          </div>
        </li>
      `).join('');

      this._recommendations = recommendations;
    } catch (e) {
      resultEl.innerHTML = `<p style="color:var(--accent);">分析失败: ${e.message}</p>`;
    }
  },
};

// Helper
function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

// ===== Event bindings (called from app.js) =====
function initNeteaseEvents() {
  // Login button
  document.getElementById('btnNeteaseLogin').addEventListener('click', () => {
    NeteaseUI.startQRLogin();
  });

  // Subtabs
  document.querySelectorAll('.netease-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      NeteaseUI.showSubPanel(tab.dataset.ntab);
    });
  });

  // Playlist click
  document.getElementById('neteasePlaylistEl').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="open"]');
    if (btn) {
      NeteaseUI.openPlaylist(btn.dataset.id);
      return;
    }
  });

  // Track actions in playlist detail
  document.getElementById('neteaseTrackEl').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    if (btn.dataset.action === 'play-ncm') NeteaseUI.playNeteaseTrack(idx);
    if (btn.dataset.action === 'add-ncm') NeteaseUI.addNeteaseToQueue(idx);
  });

  // Back button
  document.getElementById('btnNeteaseBack').addEventListener('click', () => {
    NeteaseUI.showSubPanel('myPlaylists');
  });

  // Add all Netease tracks
  document.getElementById('btnAddAllNetease').addEventListener('click', () => {
    NeteaseUI.addAllNeteaseToQueue();
  });

  // Analyze taste (in playlist detail)
  document.getElementById('btnAnalyzeTaste').addEventListener('click', () => {
    const id = NeteaseUI.state.currentPlaylist?.id;
    if (!id) return;
    NeteaseUI.showSubPanel('taste');
    document.getElementById('tastePlaylistSelect').value = id;
    NeteaseUI.analyzeAndGenerate(id);
  });

  // Search
  document.getElementById('btnNeteaseSearch').addEventListener('click', () => {
    const kw = document.getElementById('neteaseSearchInput').value.trim();
    if (kw) NeteaseUI.search(kw);
  });

  document.getElementById('neteaseSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const kw = e.target.value.trim();
      if (kw) NeteaseUI.search(kw);
    }
  });

  // Search results: add to queue
  document.getElementById('neteaseSearchEl').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="add-search"]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const track = NeteaseUI._searchResults?.[idx];
    if (track) {
      api('/api/queue/add', { method: 'POST', body: { track } })
        .then(() => {
          if (typeof loadStatus === 'function') loadStatus();
          if (typeof showToast === 'function') showToast('已加入队列');
        });
    }
  });

  // Taste analysis
  document.getElementById('btnAnalyzeSelectedPlaylist').addEventListener('click', () => {
    const id = document.getElementById('tastePlaylistSelect').value;
    if (!id) {
      alert('请先选择歌单');
      return;
    }
    NeteaseUI.analyzeAndGenerate(id);
  });

  // Add taste recommendations to queue
  document.getElementById('tasteRecommendEl').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="add-recommend"]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const track = NeteaseUI._recommendations?.[idx];
    if (track) {
      api('/api/queue/add', { method: 'POST', body: { track } })
        .then(() => {
          if (typeof loadStatus === 'function') loadStatus();
          if (typeof showToast === 'function') showToast('已加入队列');
        });
    }
  });

  document.getElementById('tasteAnalysisResult').addEventListener('click', (e) => {
    const btn = e.target.closest('#btnAddTasteRecs');
    if (btn && NeteaseUI._recommendations?.length) {
      api('/api/queue/add', { method: 'POST', body: { track: NeteaseUI._recommendations } })
        .then(() => {
          if (typeof loadStatus === 'function') loadStatus();
          if (typeof showToast === 'function') showToast(`已加入 ${NeteaseUI._recommendations.length} 首`);
        });
    }
  });
}
