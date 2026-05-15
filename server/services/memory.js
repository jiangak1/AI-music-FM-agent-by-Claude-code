const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON(filename) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.warn(`读取 ${filename} 失败, 重建`);
  }
  return null;
}

function writeJSON(filename, data) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ===== 播放历史 =====
const HISTORY_FILE = 'play_history.json';
const MAX_HISTORY = 500;

function getHistory() {
  return readJSON(HISTORY_FILE) || [];
}

function addToHistory(track) {
  const history = getHistory();
  history.unshift({
    title: track.title || track.name || '未知',
    artist: track.artist || (track.ar || []).map((a) => a.name).join('/') || '未知',
    source: track.source || 'unknown',
    ncmId: track.ncmId || null,
    playedAt: new Date().toISOString(),
  });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  writeJSON(HISTORY_FILE, history);

  // Auto-trigger persona update every 20 plays
  const shouldUpdatePersona = history.length % 20 === 0;
  return { history, shouldUpdatePersona };
}

// ===== 喜欢的歌曲 =====
const LIKES_FILE = 'liked_tracks.json';

function getLiked() {
  return readJSON(LIKES_FILE) || [];
}

function toggleLike(track) {
  const liked = getLiked();
  const key = track.ncmId || track.id || `${track.title}-${track.artist}`;
  const idx = liked.findIndex((t) => (t.ncmId || t.id) === key);
  if (idx >= 0) {
    liked.splice(idx, 1);
  } else {
    liked.unshift({
      id: key,
      title: track.title || '未知',
      artist: track.artist || '未知',
      ncmId: track.ncmId || null,
      source: track.source || 'unknown',
      likedAt: new Date().toISOString(),
    });
  }
  writeJSON(LIKES_FILE, liked);

  // Auto-trigger persona update every 5 likes
  const shouldUpdatePersona = liked.length > 0 && liked.length % 5 === 0;
  return { liked, shouldUpdatePersona };
}

function isLiked(track) {
  const liked = getLiked();
  const key = track.ncmId || track.id || `${track.title}-${track.artist}`;
  return liked.some((t) => (t.ncmId || t.id) === key);
}

// ===== 品味分析快照 =====
const TASTE_FILE = 'taste_snapshots.json';
const MAX_TASTES = 20;

function getTasteSnapshots() {
  return readJSON(TASTE_FILE) || [];
}

function saveTasteSnapshot(analysis, source) {
  const snapshots = getTasteSnapshots();
  snapshots.unshift({
    id: Date.now().toString(36),
    analysis,
    source: source || 'unknown',
    savedAt: new Date().toISOString(),
  });
  if (snapshots.length > MAX_TASTES) snapshots.length = MAX_TASTES;
  writeJSON(TASTE_FILE, snapshots);
  return snapshots;
}

function getLatestTaste() {
  const snapshots = getTasteSnapshots();
  return snapshots.length > 0 ? snapshots[0].analysis : null;
}

// ===== 生成的歌单保存 =====
const PLAYLIST_FILE = 'saved_playlists.json';
const MAX_PLAYLISTS = 30;

function getSavedPlaylists() {
  return readJSON(PLAYLIST_FILE) || [];
}

function savePlaylist(playlist, source) {
  const saved = getSavedPlaylists();
  saved.unshift({
    id: Date.now().toString(36),
    tracks: playlist,
    source: source || 'ai-generated',
    savedAt: new Date().toISOString(),
  });
  if (saved.length > MAX_PLAYLISTS) saved.length = MAX_PLAYLISTS;
  writeJSON(PLAYLIST_FILE, saved);
  return saved;
}

// ===== 品味画像 (加权置信度模型) =====
const PROFILE_FILE = 'taste_profile.json';

function emptyProfile() {
  return {
    genres: [],
    preferredLanguages: [],
    eraPreference: [],
    moodProfile: [],
    totalPlays: 0,
    totalLikes: 0,
    totalAnalyses: 0,
    lastUpdated: null,
  };
}

function getTasteProfile() {
  const raw = readJSON(PROFILE_FILE);
  if (!raw || !raw.lastUpdated) return emptyProfile();

  // Migrate old format: string arrays → weighted objects
  const profile = emptyProfile();
  profile.totalPlays = raw.totalPlays || 0;
  profile.totalLikes = raw.totalLikes || 0;
  profile.totalAnalyses = raw.totalAnalyses || 0;
  profile.lastUpdated = raw.lastUpdated || null;
  profile.genres = migrateList(raw.genres || []);
  profile.preferredLanguages = migrateList(raw.preferredLanguages || []);
  profile.eraPreference = migrateList(raw.eraPreference || []);
  profile.moodProfile = migrateList(raw.moodProfile || []);

  // Apply decay before returning
  return decayProfile(profile);
}

function migrateList(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (typeof item === 'string') {
      return { name: item, confidence: 0.3, count: 1, lastSeen: new Date().toISOString() };
    }
    return {
      name: item.name || '',
      confidence: item.confidence || 0.3,
      count: item.count || 1,
      lastSeen: item.lastSeen || new Date().toISOString(),
    };
  });
}

function decayProfile(profile) {
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const MIN_CONFIDENCE = 0.15;

  const decay = (list) => {
    return list
      .map((item) => {
        const age = now - new Date(item.lastSeen).getTime();
        if (age > SEVEN_DAYS) {
          return { ...item, confidence: Math.round(item.confidence * 0.8 * 100) / 100 };
        }
        return item;
      })
      .filter((item) => item.confidence >= MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence);
  };

  profile.genres = decay(profile.genres);
  profile.preferredLanguages = decay(profile.preferredLanguages);
  profile.eraPreference = decay(profile.eraPreference);
  profile.moodProfile = decay(profile.moodProfile);

  return profile;
}

function mergeWeighted(existingList, newItems, weight = 1.0) {
  const now = new Date().toISOString();
  const map = new Map();
  for (const item of existingList) {
    map.set(item.name.toLowerCase(), { ...item });
  }

  for (const raw of newItems) {
    const name = typeof raw === 'string' ? raw : raw.name;
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += weight;
      existing.confidence = Math.min(0.95, Math.round((0.3 + existing.count * 0.08) * 100) / 100);
      existing.lastSeen = now;
    } else {
      map.set(key, {
        name,
        confidence: Math.round(0.3 * weight * 100) / 100,
        count: weight,
        lastSeen: now,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.confidence - a.confidence);
}

function updateTasteProfile(analysis, weight = 1.0) {
  const profile = getTasteProfile();

  profile.genres = mergeWeighted(profile.genres, analysis.genres || [], weight);
  profile.preferredLanguages = mergeWeighted(profile.preferredLanguages, analysis.preferredLanguages || [], weight);

  // eraPreference: handle both old string format and new array format
  const eraItems = [];
  if (typeof analysis.eraPreference === 'string' && analysis.eraPreference) {
    eraItems.push(analysis.eraPreference);
  } else if (Array.isArray(analysis.eraPreference)) {
    eraItems.push(...analysis.eraPreference);
  }
  profile.eraPreference = mergeWeighted(profile.eraPreference, eraItems, weight);

  // moodProfile: handle both old string and new array
  const moodItems = [];
  if (typeof analysis.moodProfile === 'string' && analysis.moodProfile) {
    moodItems.push(analysis.moodProfile);
  } else if (Array.isArray(analysis.moodProfile)) {
    moodItems.push(...analysis.moodProfile);
  }
  profile.moodProfile = mergeWeighted(profile.moodProfile, moodItems, weight);

  profile.totalAnalyses += 1;
  profile.lastUpdated = new Date().toISOString();

  writeJSON(PROFILE_FILE, profile);
  return profile;
}

function getPersonaSummary() {
  const profile = getTasteProfile();

  const top = (list, n = 3) =>
    list.slice(0, n).map((i) => i.name);

  const parts = [];
  if (profile.genres.length > 0) {
    parts.push(`偏好风格: ${top(profile.genres).join('、')}`);
  }
  if (profile.preferredLanguages.length > 0) {
    parts.push(`语言偏好: ${top(profile.preferredLanguages).join('、')}`);
  }
  if (profile.eraPreference.length > 0) {
    parts.push(`年代偏好: ${top(profile.eraPreference).join('、')}`);
  }
  if (profile.moodProfile.length > 0) {
    parts.push(`心情画像: ${top(profile.moodProfile).join('、')}`);
  }

  if (parts.length === 0) return '（尚未建立用户画像）';
  return parts.join('；');
}

// ===== 导出品味摘要（供 AI 使用）=====
function getTasteContext() {
  const profile = getTasteProfile();
  const liked = getLiked();
  const history = getHistory().slice(0, 30);

  let context = '';

  const persona = getPersonaSummary();
  if (!persona.includes('尚未建立')) {
    context += `\n用户人物画像：${persona}\n`;
  }

  if (liked.length > 0) {
    const recent = liked.slice(0, 10);
    context += `\n最近喜欢的歌曲：${recent.map((t) => `${t.title}—${t.artist}`).join('、')}\n`;
  }

  if (history.length > 0) {
    const recent = history.slice(0, 10);
    context += `\n最近播放：${recent.map((t) => `${t.title}—${t.artist}`).join('、')}\n`;
  }

  return context;
}

// ===== 聊天历史 =====
const CHAT_FILE = 'chat_history.json';
const MAX_CHAT = 200;

function getChatHistory() {
  return readJSON(CHAT_FILE) || [];
}

function addChatMessage(role, content, songs) {
  const messages = getChatHistory();
  messages.push({
    role,
    content,
    songs: songs || [],
    timestamp: new Date().toISOString(),
  });
  if (messages.length > MAX_CHAT) messages.splice(0, messages.length - MAX_CHAT);
  writeJSON(CHAT_FILE, messages);
  return messages;
}

function clearChatHistory() {
  writeJSON(CHAT_FILE, []);
  return [];
}

module.exports = {
  getHistory, addToHistory,
  getLiked, toggleLike, isLiked,
  getTasteSnapshots, saveTasteSnapshot, getLatestTaste,
  getSavedPlaylists, savePlaylist,
  getTasteProfile, updateTasteProfile,
  getTasteContext, getPersonaSummary,
  getChatHistory, addChatMessage, clearChatHistory,
};
