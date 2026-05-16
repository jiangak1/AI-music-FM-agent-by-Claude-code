const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const aiService = require('../services/ai');
const djService = require('../services/dj');
const ttsService = require('../services/tts');
const playerService = require('../services/player');
const libraryService = require('../services/library');
const neteaseService = require('../services/netease');
const memoryService = require('../services/memory');
const weatherService = require('../services/weather');

const router = Router();

// GET /api/status — 服务器状态
router.get('/status', (req, res) => {
  const s = config.load();
  res.json({
    running: true,
    djEnabled: s.dj.enabled,
    musicDir: s.musicDir,
    model: s.ai.model,
    hasApiKey: !!s.ai.apiKey,
    queue: playerService.getQueue(),
    current: playerService.getCurrent(),
  });
});

// GET /api/settings
router.get('/settings', (req, res) => {
  const s = config.load();
  res.json({
    ai: { apiKey: s.ai.apiKey, apiBase: s.ai.apiBase, model: s.ai.model },
    musicDir: s.musicDir,
    dj: s.dj,
    tts: s.tts || {},
    openweather: s.openweather ? { city: s.openweather.city, hasApiKey: !!s.openweather.apiKey } : {},
  });
});

// POST /api/settings
router.post('/settings', (req, res) => {
  const current = config.load();
  const merged = { ...current, ...req.body };
  config.save(merged);

  const { ai, dj, musicDir } = merged;
  aiService.configure({ apiKey: ai.apiKey, apiBase: ai.apiBase, model: ai.model });
  res.json({ success: true });
});

// POST /api/playlist/generate — AI 生成歌单
router.post('/playlist/generate', async (req, res) => {
  try {
    const { mood, genre, era, count } = req.body;
    const persona = memoryService.getPersonaSummary();
    const raw = await aiService.generatePlaylist({ mood, genre, era, count: count || 10, persona });
    const playlist = await resolveAITracks(raw);
    res.json({ playlist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dj/segue — 获取 DJ 串场词 + TTS
router.post('/dj/segue', async (req, res) => {
  try {
    const { currentTrack, nextTrack } = req.body;
    const persona = memoryService.getPersonaSummary();
    const script = await aiService.generateDJScript(currentTrack, nextTrack, persona);
    const audioUrl = await ttsService.synthesize(script);

    res.json({ script, audioUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dj/intro — 开场白
router.post('/dj/intro', async (req, res) => {
  try {
    const s = config.load();
    const script = await aiService.generateIntro();
    const audioUrl = await ttsService.synthesize(script);

    res.json({ script, audioUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tts/:filename — 获取缓存的 TTS 音频
router.get('/tts/:filename', (req, res) => {
  const filePath = path.join(ttsService.getCacheDir(), req.params.filename);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(req.params.filename).toLowerCase();
    const mime = ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
    res.set('Content-Type', mime);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.status(404).json({ error: '音频文件不存在' });
  }
});

// GET /api/library — 本地音乐列表
router.get('/library', (req, res) => {
  res.json({ tracks: libraryService.getLibrary() });
});

// POST /api/library/scan — 扫描本地目录
router.post('/library/scan', async (req, res) => {
  try {
    const dir = req.body.dir || config.load().musicDir;
    if (!dir) return res.status(400).json({ error: '请提供音乐目录路径' });
    const tracks = await libraryService.scan(dir);

    const s = config.load();
    s.musicDir = dir;
    config.save(s);

    res.json({ tracks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/library/stream — 本地音频流（支持 Range 请求用于 seek）
router.get('/library/stream', (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkSize,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// POST /api/queue/add — 添加到播放队列（自动解析不可播放曲目）
router.post('/queue/add', async (req, res) => {
  try {
    let { track, toFront } = req.body;
    if (!track) return res.status(400).json({ error: '需要 track 参数' });

    // Flatten: if track is an array, resolve all
    const tracks = Array.isArray(track) ? track : [track];
    const resolved = await resolveTracksForQueue(tracks);
    for (const t of resolved) {
      playerService.addToQueue(t, toFront);
    }
    res.json({ queue: playerService.getQueue() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/queue/:index — 移除队列项
router.delete('/queue/:index', (req, res) => {
  playerService.removeFromQueue(parseInt(req.params.index, 10));
  res.json({ queue: playerService.getQueue() });
});

// GET /api/queue — 获取播放队列
router.get('/queue', (req, res) => {
  res.json({ queue: playerService.getQueue(), current: playerService.getCurrent() });
});

// POST /api/queue/next — 切歌 / 标记当前播放完毕
router.post('/queue/next', (req, res) => {
  const next = playerService.next();
  res.json({ current: next, queue: playerService.getQueue() });
});

// POST /api/queue/clear
router.post('/queue/clear', (req, res) => {
  playerService.clearQueue();
  res.json({ queue: [], current: null });
});

// ===== 网易云音乐 API =====

// GET /api/netease/status — 网易云登录状态
router.get('/netease/status', async (req, res) => {
  try {
    const status = await neteaseService.getLoginStatus();
    res.json({ loggedIn: status?.account !== null, profile: status?.profile || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/qr/key
router.get('/netease/qr/key', async (req, res) => {
  try {
    const key = await neteaseService.getLoginQRKey();
    res.json({ key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/qr/create
router.get('/netease/qr/create', async (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: '需要 key 参数' });
    const data = await neteaseService.createQRCode(key);
    res.json({ qrimg: data.qrimg, key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/qr/check
router.get('/netease/qr/check', async (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: '需要 key 参数' });
    const result = await neteaseService.checkQRStatus(key);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/playlists
router.get('/netease/playlists', async (req, res) => {
  try {
    const uid = req.query.uid;
    if (!uid) return res.status(400).json({ error: '需要 uid 参数' });
    const playlists = await neteaseService.getUserPlaylists(uid);
    res.json({ playlists });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/playlist/:id
router.get('/netease/playlist/:id', async (req, res) => {
  try {
    const playlist = await neteaseService.getPlaylistDetail(req.params.id);
    res.json({ playlist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/playlist/:id/tracks
router.get('/netease/playlist/:id/tracks', async (req, res) => {
  try {
    const tracks = await neteaseService.getPlaylistAllTracks(req.params.id);
    res.json({ tracks: tracks.map(formatNeteaseTrack) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/netease/playlist/analyze — AI 分析歌单品味
router.post('/netease/playlist/analyze', async (req, res) => {
  try {
    const { playlistId } = req.body;
    if (!playlistId) return res.status(400).json({ error: '需要 playlistId' });

    const tracks = await neteaseService.getPlaylistAllTracks(playlistId);
    const analysis = await aiService.analyzeMusicTaste(tracks);
    res.json({ analysis, trackCount: tracks.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/netease/playlist/generate — 基于品味分析生成歌单
router.post('/netease/playlist/generate', async (req, res) => {
  try {
    const { playlistId, count } = req.body;
    if (!playlistId) return res.status(400).json({ error: '需要 playlistId' });

    const tracks = await neteaseService.getPlaylistAllTracks(playlistId);
    const taste = await aiService.analyzeMusicTaste(tracks);

    // Save persona with higher weight for manual analysis
    memoryService.updateTasteProfile(taste, 1.5);
    memoryService.saveTasteSnapshot(taste, 'netease-analysis');

    const raw = await aiService.generatePlaylistFromTaste(taste, count || 20);
    const recommendations = await resolveAITracks(raw);

    res.json({ taste, recommendations });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/song/url/:id
router.get('/netease/song/url/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let data = await neteaseService.getSongUrl(id, 'lossless');
    if (!data?.url) data = await neteaseService.getSongUrl(id, 'exhigh');
    if (!data?.url) data = await neteaseService.getSongUrl(id, 'standard');
    // Log freeTrialInfo for debugging 30s limit
    if (data?.freeTrialInfo) {
      console.log(`[Netease] 歌曲 ${id} 仅返回试听片段: ${JSON.stringify(data.freeTrialInfo)}`);
    }
    console.log(`[Netease] 最终返回 URL for ${id}: br=${data?.br} level=${data?.level} hasUrl=${!!data?.url}`);
    res.json(data || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/stream/:id — 代理网易云音频流（支持 Range 请求用于 seek）
router.get('/netease/stream/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let data = await neteaseService.getSongUrl(id, 'lossless');
    if (!data?.url) data = await neteaseService.getSongUrl(id, 'exhigh');
    if (!data?.url) data = await neteaseService.getSongUrl(id, 'standard');
    const streamUrl = data?.url;
    if (!streamUrl) {
      return res.status(404).json({ error: '无法获取音频流地址' });
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    // Forward Range header for seeking
    const range = req.headers.range;
    if (range) {
      headers['Range'] = range;
    }

    const proxyRes = await fetch(streamUrl, { headers });
    if (!proxyRes.ok && proxyRes.status !== 206) {
      return res.status(502).json({ error: '音频流获取失败' });
    }

    const contentType = proxyRes.headers.get('content-type') || 'audio/mpeg';
    const contentLength = proxyRes.headers.get('content-length');

    if (proxyRes.status === 206) {
      res.status(206);
      res.set({
        'Content-Type': contentType,
        'Content-Range': proxyRes.headers.get('content-range') || '',
        'Content-Length': contentLength || '',
        'Accept-Ranges': 'bytes',
      });
    } else {
      res.set({
        'Content-Type': contentType,
        'Content-Length': contentLength || '',
        'Accept-Ranges': 'bytes',
      });
    }

    const reader = proxyRes.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/netease/song/detail
router.post('/netease/song/detail', async (req, res) => {
  try {
    const ids = req.body.ids;
    const songs = await neteaseService.getSongDetail(ids);
    res.json({ songs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/search
router.get('/netease/search', async (req, res) => {
  try {
    const { keyword, type, limit } = req.query;
    const result = await neteaseService.cloudSearch(keyword, type || '1', parseInt(limit, 10) || 20);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/recommend/songs
router.get('/netease/recommend/songs', async (req, res) => {
  try {
    const songs = await neteaseService.getRecommendSongs();
    res.json({ songs: songs.map(formatNeteaseTrack) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/netease/recommend/playlists
router.get('/netease/recommend/playlists', async (req, res) => {
  try {
    const result = await neteaseService.getRecommendPlaylists();
    res.json({ playlists: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 格式化网易云曲目为统一格式
function formatNeteaseTrack(song) {
  return {
    id: `ncm_${song.id}`,
    ncmId: song.id,
    title: song.name,
    artist: (song.ar || []).map((a) => a.name).join('/'),
    album: (song.al || {}).name || '',
    duration: Math.round((song.dt || 0) / 1000),
    cover: (song.al || {}).picUrl || '',
    source: 'netease',
    url: `/api/netease/stream/${song.id}`,
  };
}

// 解析队列中不可播放的曲目（无 url/ncmId/filePath），搜索网易云获取可播放地址
async function resolveTracksForQueue(tracks) {
  return Promise.all(
    tracks.map(async (t) => {
      // Already playable: has direct url, ncmId, or local filePath
      if (t.url || t.ncmId || t.filePath) return t;

      // Needs resolution: search Netease
      try {
        const keyword = `${t.title || ''} ${t.artist || ''}`.trim();
        if (!keyword) return t;
        const result = await neteaseService.cloudSearch(keyword, '1', 3);
        const songs = result?.songs;
        if (songs && songs.length > 0) {
          let best = songs[0];
          for (const s of songs) {
            if (s.name && s.name.toLowerCase() === (t.title || '').toLowerCase()) {
              best = s;
              break;
            }
          }
          const resolved = formatNeteaseTrack(best);
          resolved.note = t.note || '';
          return resolved;
        }
      } catch (e) {
        // search failed, return original
      }
      return t;
    })
  );
}

// 将 AI 生成的歌单（仅有 title/artist）解析为可播放的网易云曲目
async function resolveAITracks(aiTracks) {
  const resolved = await Promise.all(
    aiTracks.map(async (t) => {
      try {
        const keyword = `${t.title} ${t.artist}`;
        const result = await neteaseService.cloudSearch(keyword, '1', 3);
        const songs = result?.songs;
        if (songs && songs.length > 0) {
          // Simple scoring: prefer exact title match, then first result
          let best = songs[0];
          for (const s of songs) {
            if (s.name && s.name.toLowerCase() === (t.title || '').toLowerCase()) {
              best = s;
              break;
            }
          }
          const track = formatNeteaseTrack(best);
          track.note = t.note || '';
          return track;
        }
      } catch (e) {
        // Search failed for this track, continue
      }
      // Fallback: return unresolvable track (won't play but visible in list)
      return {
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: t.title || '未知',
        artist: t.artist || '未知',
        note: t.note || '',
        source: 'unknown',
        url: '',
      };
    })
  );
  return resolved;
}

// ===== 歌词 API =====

// GET /api/lyrics — 获取歌词
router.get('/lyrics', async (req, res) => {
  try {
    const { ncmId, filePath } = req.query;

    // 网易云音乐歌词
    if (ncmId) {
      const lrcRes = await neteaseService.getLyric(ncmId);
      if (lrcRes) {
        return res.json({
          source: 'netease',
          raw: lrcRes.lrc?.lyric || '',
          tlyric: lrcRes.tlyric?.lyric || '', // translated lyric
          parsed: parseLyric(lrcRes.lrc?.lyric || ''),
        });
      }
    }

    // 本地文件歌词 (从 metadata 读取)
    if (filePath) {
      try {
        const mm = require('music-metadata');
        const meta = await mm.parseFile(filePath);
        const lyrics = meta.common.lyrics;
        if (lyrics && lyrics.length > 0) {
          return res.json({
            source: 'local',
            raw: Array.isArray(lyrics) ? lyrics.join('\n') : lyrics,
            parsed: parseLyric(Array.isArray(lyrics) ? lyrics.join('\n') : lyrics),
          });
        }
      } catch {
        // no lyrics in file
      }
    }

    res.json({ source: null, raw: '', parsed: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 解析 LRC 歌词为时间戳数组
function parseLyric(lrc) {
  if (!lrc) return [];
  const lines = lrc.split('\n');
  const parsed = [];
  const timeRe = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const line of lines) {
    const text = line.replace(timeRe, '').trim();
    if (!text) continue;

    let match;
    const times = [];
    while ((match = timeRe.exec(line)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      times.push(min * 60 + sec + ms / 1000);
    }
    timeRe.lastIndex = 0;

    for (const t of times) {
      parsed.push({ time: t, text });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

// ===== 音乐品味记忆 API =====

// GET /api/memory/history
router.get('/memory/history', (req, res) => {
  res.json({ history: memoryService.getHistory() });
});

// POST /api/memory/history — 记录播放
router.post('/memory/history', async (req, res) => {
  const { track } = req.body;
  if (!track) return res.status(400).json({ error: '需要 track 参数' });
  const { history, shouldUpdatePersona } = memoryService.addToHistory(track);

  // Auto-trigger persona update every 20 plays
  if (shouldUpdatePersona) {
    const recentTracks = history.slice(0, 20).map((h) => ({
      name: h.title,
      artist: h.artist,
    }));
    try {
      const analysis = await aiService.analyzeMusicTaste(recentTracks);
      memoryService.updateTasteProfile(analysis, 1.0);
    } catch (e) {
      console.warn('自动画像更新失败(history):', e.message);
    }
  }

  res.json({ history });
});

// GET /api/memory/liked
router.get('/memory/liked', (req, res) => {
  res.json({ liked: memoryService.getLiked() });
});

// POST /api/memory/like — 切换喜欢
router.post('/memory/like', async (req, res) => {
  const { track } = req.body;
  if (!track) return res.status(400).json({ error: '需要 track 参数' });
  const { liked, shouldUpdatePersona } = memoryService.toggleLike(track);

  // Auto-trigger persona update every 5 likes
  if (shouldUpdatePersona) {
    const likeTracks = liked.map((t) => ({
      name: t.title,
      artist: t.artist,
    }));
    try {
      const analysis = await aiService.analyzeMusicTaste(likeTracks);
      memoryService.updateTasteProfile(analysis, 1.0);
    } catch (e) {
      console.warn('自动画像更新失败(likes):', e.message);
    }
  }

  res.json({ liked, isLiked: memoryService.isLiked(track) });
});

// GET /api/memory/taste-profile
router.get('/memory/taste-profile', (req, res) => {
  const profile = memoryService.getTasteProfile();
  const snapshots = memoryService.getTasteSnapshots();
  const liked = memoryService.getLiked();
  const history = memoryService.getHistory();
  res.json({ profile, snapshots, likedCount: liked.length, historyCount: history.length });
});

// POST /api/memory/taste-snapshot — 保存品味快照（由 AI 分析后调用）
router.post('/memory/taste-snapshot', (req, res) => {
  const { analysis, source } = req.body;
  const snapshots = memoryService.saveTasteSnapshot(analysis, source);
  const profile = memoryService.updateTasteProfile(analysis, 1.0);
  res.json({ snapshots, profile });
});

// POST /api/memory/update-persona — 手动/自动触发人物画像更新
router.post('/memory/update-persona', async (req, res) => {
  try {
    const { tracks, source } = req.body;
    if (!tracks || tracks.length === 0) {
      return res.status(400).json({ error: '需要 tracks 参数' });
    }
    const weight = source === 'analysis' ? 1.5 : 1.0;
    const analysis = await aiService.analyzeMusicTaste(tracks);
    const profile = memoryService.updateTasteProfile(analysis, weight);
    memoryService.saveTasteSnapshot(analysis, source || 'manual');
    res.json({ analysis, profile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/memory/saved-playlists
router.get('/memory/saved-playlists', (req, res) => {
  res.json({ playlists: memoryService.getSavedPlaylists() });
});

// POST /api/memory/save-playlist
router.post('/memory/save-playlist', (req, res) => {
  const { playlist, source } = req.body;
  const saved = memoryService.savePlaylist(playlist, source);
  res.json({ playlists: saved });
});

// ===== 天气 API =====

// GET /api/weather
router.get('/weather', async (req, res) => {
  try {
    const weather = await weatherService.getWeather(req.query.city);
    res.json(weather);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/playlist/weather — 基于天气+品味生成歌单
router.post('/playlist/weather', async (req, res) => {
  try {
    const { city } = req.body;
    const weather = await weatherService.getWeather(city);
    const tasteContext = memoryService.getTasteContext();
    const playlist = await aiService.generateWeatherPlaylist(weather, tasteContext, req.body.count || 15);
    const resolved = await resolveAITracks(playlist);

    res.json({ weather, playlist: resolved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Chat API =====

// GET /api/chat/greeting — AI 根据天气+时间生成问候语
router.get('/chat/greeting', async (req, res) => {
  try {
    let weather = null;
    try {
      weather = await weatherService.getWeather();
    } catch (e) {
      // weather is optional
    }

    const now = new Date();
    const hour = now.getHours();
    const timeDesc = hour < 6 ? '深夜' : hour < 9 ? '清晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 21 ? '傍晚' : '深夜';

    const weatherInfo = weather
      ? `当前天气：${weather.city} ${weather.description}，${weather.temperature}°C`
      : '';

    const prompt = `你是一个温柔俏皮的 AI 电台 DJ，名叫"小电"。现在是${timeDesc}。${weatherInfo}
请向听众打一声自然的招呼（1-3句话），可以结合时间和天气，问问对方今天过得怎么样、想听什么歌。
语气要像好朋友聊天一样温柔可爱，可以带一点点俏皮，不要太正式。`;

    const message = await aiService.chat([{ role: 'user', content: prompt }], 300);
    res.json({ message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat/send — 发送消息，获取 AI 回复
router.post('/chat/send', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '需要 message 参数' });

    // Build context (keep it tight to avoid token waste)
    const persona = memoryService.getPersonaSummary();
    const history = memoryService.getHistory().slice(0, 3);
    const chatHistory = memoryService.getChatHistory().slice(-6); // last 3 exchanges

    let weather = null;
    try {
      weather = await weatherService.getWeather();
    } catch (e) { /* optional */ }

    const now = new Date();
    const hour = now.getHours();
    const timeDesc = hour < 6 ? '深夜' : hour < 9 ? '清晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 21 ? '傍晚' : '深夜';

    const contextParts = [
      `你是 AI 电台的 DJ "小电"，性格温柔俏皮，像一个懂音乐的好朋友。回复简洁有温度（控制在3-5句话内），可以带点可爱的语气词。`,
      `现在是${timeDesc}。`,
      weather ? `天气：${weather.city} ${weather.description} ${weather.temperature}°C。` : '',
      persona !== '（尚未建立用户画像）' ? `听众品味：${persona}` : '',
    ].filter(Boolean);

    // Build messages array
    const messages = [
      { role: 'user', content: contextParts.join('\n') + '\n如果听众让你推荐歌曲，请用格式：【推荐】歌名 - 艺人 | 理由。最多推荐3首。闲聊时保持温柔俏皮，像朋友一样推荐歌。' },
    ];

    // Insert recent chat history (truncated to avoid token waste)
    for (const h of chatHistory) {
      const truncated = h.content.length > 400 ? h.content.slice(0, 400) + '...' : h.content;
      messages.push({ role: h.role === 'ai' ? 'assistant' : 'user', content: truncated });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    const reply = await aiService.chat(messages, 1024);

    // Parse song recommendations from reply
    // Supports: 【推荐】歌名 - 艺人 | 理由  OR  【推荐】歌名 - 艺人\n推荐理由：理由
    const songs = [];
    const lines = reply.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Format 1: 【推荐】歌名 - 艺人 | 理由 (all on one line)
      const m1 = line.match(/【推荐】(.+?) - (.+?) \| (.+)/);
      if (m1) {
        songs.push({ title: m1[1].trim(), artist: m1[2].trim(), note: m1[3].trim() });
        continue;
      }
      // Format 2: 【推荐】歌名 - 艺人 (on this line), 推荐理由：... (on next line)
      const m2 = line.match(/【推荐】(.+?) - (.+)/);
      if (m2 && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const reason = nextLine.replace(/^推荐理由[：:]\s*/i, '').trim();
        if (reason) {
          songs.push({ title: m2[1].trim(), artist: m2[2].trim(), note: reason });
          i++;
        }
      }
    }

    // Store messages
    memoryService.addChatMessage('user', message, []);
    memoryService.addChatMessage('ai', reply, songs);

    res.json({ reply, songs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/history — 获取聊天历史
router.get('/chat/history', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const all = memoryService.getChatHistory();
  res.json({ messages: all.slice(-limit) });
});

// DELETE /api/chat/history — 清空聊天历史
router.delete('/chat/history', (req, res) => {
  memoryService.clearChatHistory();
  res.json({ messages: [] });
});

// ===== 推荐列表（品味歌单） =====
let recommendedTracks = [];

// GET /api/recommended — 获取推荐列表
router.get('/recommended', (req, res) => {
  res.json({ tracks: recommendedTracks });
});

// POST /api/recommended/set — 设置推荐列表（AI 生成后调用）
router.post('/recommended/set', (req, res) => {
  const { tracks } = req.body;
  recommendedTracks = tracks || [];
  res.json({ tracks: recommendedTracks });
});

// POST /api/recommended/clear — 清空推荐列表
router.post('/recommended/clear', (req, res) => {
  recommendedTracks = [];
  res.json({ tracks: [] });
});

// POST /api/recommended/add — 添加歌曲到推荐列表
router.post('/recommended/add', (req, res) => {
  const { track } = req.body;
  if (!track) return res.status(400).json({ error: '需要 track 参数' });
  const tracks = Array.isArray(track) ? track : [track];
  recommendedTracks = recommendedTracks.concat(tracks);
  res.json({ tracks: recommendedTracks });
});

// POST /api/dj/song-intro — 为推荐歌曲生成 AI DJ 介绍
router.post('/dj/song-intro', async (req, res) => {
  try {
    const { track } = req.body;
    if (!track) return res.status(400).json({ error: '需要 track 参数' });

    const persona = memoryService.getPersonaSummary();
 const prompt = `你是一个温柔俏皮的电台 DJ "小电"。接下来要为听众播放一首推荐歌曲：
《${track.title || '未知'}》— ${track.artist || '未知'}
${track.note ? `推荐理由：${track.note}` : ''}
${persona !== '（尚未建立用户画像）' ? `\n这位听众的品味：${persona}` : ''}

请用中文写一段 2-3 句话的介绍词，温柔可爱地介绍这首歌，像朋友分享好音乐一样，让听众会心一笑并对这首歌产生期待。可以带一点俏皮的小语气词。
要有 DJ 的感觉，不要太正式。`;

    const script = await aiService.chat([{ role: 'user', content: prompt }], 400);
    const audioUrl = await ttsService.synthesize(script);

    res.json({ script, audioUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
