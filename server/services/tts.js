const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'tts-cache');

function getCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  return CACHE_DIR;
}

async function synthesize(text, voice = null) {
  const s = config.load();
  const apiKey = s.tts?.apiKey || s.ai?.apiKey || process.env.TTS_API_KEY || process.env.AI_API_KEY || '';
  const apiBase = s.tts?.apiBase || s.ai?.apiBase || process.env.TTS_API_BASE || process.env.AI_API_BASE || 'https://api.xiaomimimo.com/v1';
  const model = s.tts?.model || process.env.TTS_MODEL || 'mimo-v2.5-tts';
  const voiceId = voice || s.tts?.voice || process.env.TTS_VOICE || 'mimo_default';

  if (!apiKey) {
    console.warn('TTS: API Key 未配置');
    return null;
  }

  const hash = crypto.createHash('md5').update(text + voiceId + model).digest('hex');
  const filename = `${hash}.wav`;
  const filePath = path.join(getCacheDir(), filename);

  if (fs.existsSync(filePath)) {
    return `/api/tts/${filename}`;
  }

  try {
    const body = JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: text },
      ],
      audio: {
        format: 'wav',
        voice: voiceId,
      },
    });

    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`TTS API 错误 ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const b64 = json?.choices?.[0]?.message?.audio?.data;
    if (!b64) {
      throw new Error('TTS 响应中无音频数据');
    }

    const buffer = Buffer.from(b64, 'base64');
    fs.writeFileSync(filePath, buffer);
    return `/api/tts/${filename}`;
  } catch (e) {
    console.error('TTS 合成失败:', e.message);
    return null;
  }
}

module.exports = { synthesize, getCacheDir };
