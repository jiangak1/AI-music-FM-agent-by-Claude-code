const http = require('http');
const https = require('https');

const NCM_HOST = process.env.NCM_HOST || '127.0.0.1';
const NCM_PORT = parseInt(process.env.NCM_PORT, 10) || 4000;

const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, '..', 'data', 'netease_cookie.json');
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

let ncmCookie = '';   // HTTP Cookie header (set-cookie from NCM server)
let neteaseCookie = ''; // Netease MUSIC_U cookie (from response body)

function saveCookieToDisk() {
  if (neteaseCookie) {
    try {
      const dir = path.dirname(COOKIE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(COOKIE_FILE, JSON.stringify({
        cookie: neteaseCookie,
        savedAt: new Date().toISOString(),
      }), 'utf-8');
      console.log('[Netease] Cookie 已保存到本地');
    } catch (e) {
      console.warn('[Netease] Cookie 保存失败:', e.message);
    }
  }
}

function loadCookieFromDisk() {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      if (data.cookie && data.savedAt) {
        const age = Date.now() - new Date(data.savedAt).getTime();
        if (age < COOKIE_MAX_AGE) {
          neteaseCookie = data.cookie;
          ncmCookie = data.cookie;
          const daysLeft = Math.ceil((COOKIE_MAX_AGE - age) / (24 * 60 * 60 * 1000));
          console.log(`[Netease] 已恢复本地 Cookie（剩余 ${daysLeft} 天有效）`);
          return true;
        } else {
          console.log('[Netease] 本地 Cookie 已过期（超过7天），将重新登录');
          fs.unlinkSync(COOKIE_FILE);
        }
      }
    }
  } catch (e) {
    console.warn('[Netease] Cookie 读取失败:', e.message);
  }
  return false;
}

function setCookie(c) {
  ncmCookie = c || '';
  // Extract MUSIC_U from cookie string if present
  const m = (c || '').match(/MUSIC_U=([^;]+)/);
  if (m) {
    neteaseCookie = c;
    saveCookieToDisk();
  }
}

function getCookie() {
  return neteaseCookie || ncmCookie;
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://${NCM_HOST}:${NCM_PORT}${path}`);
    const bodyStr = body ? JSON.stringify(body) : '';
    const isHTTPS = url.protocol === 'https:';

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Radio/1.0',
      },
      timeout: 30000,
    };

    if (ncmCookie) {
      options.headers['Cookie'] = ncmCookie;
    }

    const client = isHTTPS ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          ncmCookie = setCookie.map((c) => c.split(';')[0]).join('; ');
          // Also check for MUSIC_U in set-cookie headers
          const musicU = setCookie.find((c) => c.includes('MUSIC_U'));
          if (musicU) {
            neteaseCookie = musicU.split(';')[0];
          }
        }
        try {
          const parsed = JSON.parse(data);
          // Capture Netease cookie from response body (login endpoints return it)
          if (parsed && parsed.cookie && parsed.cookie.includes('MUSIC_U')) {
            neteaseCookie = parsed.cookie;
            saveCookieToDisk();
          }
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (e) => reject(new Error(`NCM API 连接失败: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('NCM API 超时')); });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ===== 登录相关 =====

async function getLoginQRKey() {
  const res = await request('GET', '/login/qr/key');
  return res.data?.data?.unikey || null;
}

async function createQRCode(key) {
  const res = await request('GET', `/login/qr/create?key=${key}&qrimg=true`);
  return res.data?.data || null;
}

async function checkQRStatus(key) {
  const res = await request('GET', `/login/qr/check?key=${key}`);
  const body = res.data || {};
  // Capture cookie when login succeeds (code 803)
  if (body.cookie && body.cookie.includes('MUSIC_U')) {
    neteaseCookie = body.cookie;
    saveCookieToDisk();
    console.log('[Netease] QR登录成功，已捕获 MUSIC_U cookie');
  }
  return body;
}

async function getLoginStatus() {
  const res = await request('GET', '/login/status');
  const body = res.data || {};
  // Capture cookie from login status response
  if (body.cookie && body.cookie.includes('MUSIC_U')) {
    neteaseCookie = body.cookie;
    saveCookieToDisk();
  }
  // Return the full data including account/profile
  return body?.data || body?.account || null;
}

// ===== 歌单相关 =====

async function getUserPlaylists(uid) {
  const res = await request('GET', `/user/playlist?uid=${uid}`);
  return res.data?.playlist || [];
}

async function getPlaylistDetail(id) {
  const res = await request('GET', `/playlist/detail?id=${id}`);
  return res.data?.playlist || null;
}

async function getPlaylistTracks(id, limit = 50, offset = 0) {
  const res = await request('GET', `/playlist/track/all?id=${id}&limit=${limit}&offset=${offset}`);
  return res.data?.songs || [];
}

async function getPlaylistAllTracks(id) {
  // 分页获取全部歌曲
  let allSongs = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const res = await request('GET', `/playlist/track/all?id=${id}&limit=${limit}&offset=${offset}`);
    const songs = res.data?.songs || [];
    allSongs = allSongs.concat(songs);

    if (songs.length < limit) hasMore = false;
    else offset += limit;
  }

  return allSongs;
}

// ===== 歌曲相关 =====

async function getSongUrl(id, level = 'standard') {
  let path = `/song/url/v1?id=${id}&level=${level}`;
  // Pass Netease cookie explicitly — required for full-length songs
  if (neteaseCookie) {
    path += `&cookie=${encodeURIComponent(neteaseCookie)}`;
  }
  console.log(`[Netease] getSongUrl id=${id} level=${level} hasCookie=${!!neteaseCookie}`);
  const res = await request('GET', path);
  const data = res.data?.data || [];
  const result = data[0] || null;
  if (result) {
    console.log(`[Netease] getSongUrl result: url=${(result.url || '').slice(0, 80)}... freeTrial=${!!result.freeTrialInfo} br=${result.br}`);
  }
  return result;
}

async function getSongDetail(ids) {
  const idStr = Array.isArray(ids) ? ids.join(',') : ids;
  const res = await request('GET', `/song/detail?ids=${idStr}`);
  const songs = res.data?.songs || [];
  return songs;
}

// ===== 搜索 =====

async function search(keyword, type = '1', limit = 30, offset = 0) {
  const res = await request('GET', `/search?keywords=${encodeURIComponent(keyword)}&type=${type}&limit=${limit}&offset=${offset}`);
  return res.data?.result || null;
}

async function cloudSearch(keyword, type = '1', limit = 30) {
  const res = await request('GET', `/cloudsearch?keywords=${encodeURIComponent(keyword)}&type=${type}&limit=${limit}`);
  return res.data?.result || null;
}

// ===== 歌词 =====

async function getLyric(id) {
  const res = await request('GET', `/lyric?id=${id}`);
  return res.data || null;
}

// ===== 推荐 =====

async function getRecommendSongs() {
  const res = await request('GET', '/recommend/songs');
  return res.data?.data?.dailySongs || [];
}

// ===== 每日推荐歌单 =====

async function getRecommendPlaylists(limit = 20) {
  const res = await request('GET', `/personalized?limit=${limit}`);
  return res.data?.result || [];
}

// 检查 NCM 服务是否运行
async function healthCheck() {
  try {
    const res = await request('GET', '/login/status');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  setCookie, getCookie, loadCookieFromDisk,
  getLoginQRKey, createQRCode, checkQRStatus, getLoginStatus,
  getUserPlaylists, getPlaylistDetail, getPlaylistTracks, getPlaylistAllTracks,
  getSongUrl, getSongDetail, getLyric,
  search, cloudSearch,
  getRecommendSongs, getRecommendPlaylists,
  healthCheck,
  NCM_PORT,
};
