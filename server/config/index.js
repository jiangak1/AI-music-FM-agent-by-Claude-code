const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaults = {
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    apiBase: process.env.AI_API_BASE || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o',
  },
  port: parseInt(process.env.PORT, 10) || 3000,
  musicDir: process.env.MUSIC_DIR || '',
  dj: {
    enabled: true,
    frequency: 'every_track',
    voice: 'zh-CN-XiaoxiaoNeural',
  },
  tts: {
    apiKey: process.env.TTS_API_KEY || '',
    apiBase: process.env.TTS_API_BASE || '',
    voice: process.env.TTS_VOICE || 'mimo_default',
    model: process.env.TTS_MODEL || 'mimo-v2.5-tts',
  },
  openweather: {
    apiKey: process.env.OPENWEATHER_API_KEY || '',
    city: process.env.OPENWEATHER_CITY || 'Beijing',
  },
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...defaults, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('读取设置文件失败，使用默认配置');
  }
  return { ...defaults };
}

function save(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

module.exports = { load, save, SETTINGS_FILE, defaults };
