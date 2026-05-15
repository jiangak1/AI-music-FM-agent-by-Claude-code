const OpenAI = require('openai');
const config = require('../config');

let client = null;

function getClient() {
  const s = config.load();
  if (!client) {
    const apiKey = s.ai.apiKey;
    const apiBase = s.ai.apiBase || 'https://api.openai.com/v1';
    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    client = new OpenAI({ apiKey, baseURL: apiBase });
  }
  return client;
}

function configure(opts) {
  client = null;
  const s = config.load();
  if (opts.apiKey) s.ai.apiKey = opts.apiKey;
  if (opts.apiBase) s.ai.apiBase = opts.apiBase;
  if (opts.model) s.ai.model = opts.model;
  config.save(s);
}

async function chat(messages, maxTokens = 1024) {
  const s = config.load();
  const c = getClient();
  const res = await c.chat.completions.create({
    model: s.ai.model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.9,
  });
  return res.choices[0].message.content.trim();
}

async function generatePlaylist({ mood, genre, era, count, persona }) {
  const prompt = `你是一个温柔俏皮的电台 DJ "小电"，请为听众生成一个播放列表。
${mood ? `- 心情/氛围：${mood}` : ''}
${genre ? `- 音乐风格：${genre}` : ''}
${era ? `- 年代：${era}` : ''}
- 数量：${count || 10} 首
${persona ? `\n这位听众的音乐品味画像：${persona}\n请结合画像推荐，让歌单更贴合 TA 的偏好。` : ''}

请返回 JSON 数组，每个元素包含 title（歌名）和 artist（艺术家）和 note（一句话推荐理由，语气温柔可爱，像朋友推荐歌给你一样）。
只返回 JSON 数组，不要其他文字。

格式示例：
[{"title":"歌名","artist":"艺术家","note":"推荐理由"}]`;

  const raw = await chat([{ role: 'user', content: prompt }], 2048);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const matches = raw.match(/\[[\s\S]*\]/);
    if (matches) return JSON.parse(matches[0]);
    throw new Error('AI 返回格式解析失败，请重试');
  }
}

async function generateDJScript(currentTrack, nextTrack, persona) {
  const prompt = `你是一个电台 DJ，名叫"小电"，性格温柔又有点俏皮，像一个懂音乐的好朋友。当前刚播完一首歌，马上要播下一首。
刚播完：《${currentTrack?.title || '未知'}》— ${currentTrack?.artist || '未知'}
下一首：《${nextTrack?.title || '未知'}》— ${nextTrack?.artist || '未知'}
${persona ? `\n这位听众的音乐品味：${persona}\n如果合适的话可以在串场中自然地提及，让听众觉得你真的了解 TA。` : ''}

请用中文写一段 2-3 句话的串场词，温柔俏皮地介绍刚播完的歌并预告下一首。
像朋友聊天一样自然温暖，可以加一点可爱的小语气词，不要正式。`;

  return await chat([{ role: 'user', content: prompt }], 512);
}

async function generateIntro() {
  const now = new Date();
  const hour = now.getHours();
  const timeDesc = hour < 6 ? '深夜' : hour < 9 ? '清晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 21 ? '傍晚' : '深夜';

  const prompt = `你是一个电台 DJ，名叫"小电"，性格温柔又带点俏皮。现在是${timeDesc}，你要开场今天的节目。
请用中文写一段 3-5 句话的电台开场白，语气温柔可爱，像朋友一样欢迎听众收听 AI 电台。
可以加一点点俏皮的语气词和温暖的问候，让听众觉得放松和开心。`;

  return await chat([{ role: 'user', content: prompt }], 512);
}

async function analyzeMusicTaste(tracks) {
  if (!tracks || tracks.length === 0) {
    throw new Error('歌单为空，无法分析');
  }

  // 取样最多 100 首用于分析
  const sample = tracks.slice(0, 100).map((t) => ({
    name: t.name || t.title || '未知',
    artist: (t.ar || []).map((a) => a.name).join('/') || t.artist || '未知',
  }));

  const prompt = `你是一位资深音乐品味分析师。请分析以下歌单中的歌曲，推断这位听众的音乐品味。

歌单样本（共 ${tracks.length} 首，取样 ${sample.length} 首）：
${sample.map((s, i) => `${i + 1}. ${s.name} — ${s.artist}`).join('\n')}

请返回 JSON 格式的分析结果（只返回 JSON，不要其他文字）：
{
  "genres": ["主要音乐风格1", "风格2"],
  "preferredLanguages": ["语言偏好1", "语言偏好2"],
  "eraPreference": "年代偏好描述",
  "moodProfile": "心情画像描述",
  "tasteSummary": "一段 50 字以内的品味总结",
  "keywords": ["关键词1", "关键词2", ...]  // 用于搜索的关键词，5-8个
}`;

  const raw = await chat([{ role: 'user', content: prompt }], 1500);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const matches = raw.match(/\{[\s\S]*\}/);
    if (matches) return JSON.parse(matches[0]);
    throw new Error('AI 品味分析结果解析失败，请重试');
  }
}

async function generatePlaylistFromTaste(taste, count = 20) {
  const prompt = `你是一个资深音乐推荐 DJ。根据以下听众的音乐品味，推荐一个歌单。

品味分析：
- 偏好风格：${(taste.genres || []).join('、')}
- 语言偏好：${(taste.preferredLanguages || []).join('、')}
- 年代偏好：${taste.eraPreference || '不限'}
- 心情画像：${taste.moodProfile || '未知'}
- 品味总结：${taste.tasteSummary || ''}
- 搜索关键词：${(taste.keywords || []).join('、')}

请推荐 ${count} 首歌，要求：
1. 风格和品味与用户的音乐偏好吻合
2. 包含一些用户可能没听过但会喜欢的冷门好歌
3. 歌曲真实存在（知名歌曲）

返回 JSON 数组（只返回 JSON，不要其他文字）：
[{"title":"歌名","artist":"艺术家","note":"一句话推荐理由"}]`;

  const raw = await chat([{ role: 'user', content: prompt }], 3000);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const matches = raw.match(/\[[\s\S]*\]/);
    if (matches) return JSON.parse(matches[0]);
    throw new Error('AI 推荐歌单解析失败，请重试');
  }
}

async function generateWeatherPlaylist(weather, tasteContext, count = 15) {
  const prompt = `你是一个温柔俏皮的电台 DJ "小电"。请根据当前的天气状况和听众的音乐品味，推荐一个应景的歌单。

天气信息：
- 城市：${weather.city}，${weather.description}
- 温度：${weather.temperature}°C（体感 ${weather.feelsLike}°C）
- 天气心情：${weather.moodDesc} → 适合"${weather.mood}"氛围
- 季节：${weather.season}
- 时段：${weather.timeOfDay}

${tasteContext || '（暂无听众品味数据）'}

请推荐 ${count} 首歌，要求：
1. 歌曲氛围与当前天气匹配
2. 考虑温度和季节的适配性（如夏天推荐清爽曲风，冬天推荐温暖曲风）
3. 结合时段（如深夜推荐安静曲风，清晨推荐清新曲风）
4. ${tasteContext ? '尽量匹配听众的音乐品味偏好' : '推荐适合该天气的经典好歌'}
5. 歌曲真实存在

返回 JSON 数组（只返回 JSON，不要其他文字）：
[{"title":"歌名","artist":"艺术家","note":"一句话推荐理由（温暖俏皮地说明为什么适合当前天气）"}]`;

  const raw = await chat([{ role: 'user', content: prompt }], 3000);
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const matches = raw.match(/\[[\s\S]*\]/);
    if (matches) return JSON.parse(matches[0]);
    throw new Error('AI 天气歌单解析失败，请重试');
  }
}

module.exports = {
  configure,
  generatePlaylist,
  generateDJScript,
  generateIntro,
  chat,
  analyzeMusicTaste,
  generatePlaylistFromTaste,
  generateWeatherPlaylist,
};
