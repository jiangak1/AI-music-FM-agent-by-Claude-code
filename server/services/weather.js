const config = require('../config');

// Weather → mood mapping
function weatherToMood(weather) {
  const id = weather.weather[0].id;
  const main = weather.weather[0].main.toLowerCase();

  if (id >= 200 && id < 300) return { mood: '深沉', desc: '雷雨交加', icon: 'thunderstorm' };
  if (id >= 300 && id < 400) return { mood: '安静', desc: '细雨绵绵', icon: 'drizzle' };
  if (id >= 500 && id < 600) return { mood: '沉浸', desc: '雨天氛围', icon: 'rain' };
  if (id >= 600 && id < 700) return { mood: '纯净', desc: '雪花纷飞', icon: 'snow' };
  if (id >= 700 && id < 800) return { mood: '朦胧', desc: '雾气弥漫', icon: 'mist' };
  if (id === 800) return { mood: '活力', desc: '晴空万里', icon: 'clear' };
  if (id > 800) return { mood: '轻松', desc: '多云天气', icon: 'clouds' };
  return { mood: '舒适', desc: '天气宜人', icon: 'default' };
}

function seasonToTag() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return '春天';
  if (m >= 6 && m <= 8) return '夏天';
  if (m >= 9 && m <= 11) return '秋天';
  return '冬天';
}

function timeToTag() {
  const h = new Date().getHours();
  if (h < 6) return '深夜';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 14) return '午后';
  if (h < 18) return '下午';
  if (h < 21) return '傍晚';
  return '夜晚';
}

async function getWeather(city = null) {
  const s = config.load();
  const apiKey = s.openweather?.apiKey || process.env.OPENWEATHER_API_KEY || '';
  const defaultCity = city || s.openweather?.city || process.env.OPENWEATHER_CITY || 'Beijing';

  if (!apiKey) {
    console.warn('Weather: OpenWeather API Key 未配置，使用默认天气');
    return getDefaultWeather();
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(defaultCity)}&appid=${apiKey}&units=metric&lang=zh_cn`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`Weather API 错误 ${res.status}, 使用默认天气`);
      return getDefaultWeather();
    }

    const data = await res.json();
    const mood = weatherToMood(data);

    return {
      city: data.name,
      country: data.sys?.country || '',
      temperature: Math.round(data.main?.temp),
      feelsLike: Math.round(data.main?.feels_like),
      humidity: data.main?.humidity,
      description: data.weather[0]?.description || '',
      mood: mood.mood,
      moodDesc: mood.desc,
      icon: mood.icon,
      weatherCode: data.weather[0]?.icon || '',
      windSpeed: data.wind?.speed || 0,
      season: seasonToTag(),
      timeOfDay: timeToTag(),
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('Weather 请求失败:', e.message);
    return getDefaultWeather();
  }
}

function getDefaultWeather() {
  return {
    city: '未知',
    temperature: 20,
    feelsLike: 20,
    humidity: 50,
    description: '未知',
    mood: '舒适',
    moodDesc: '天气宜人',
    icon: 'default',
    weatherCode: '',
    windSpeed: 0,
    season: seasonToTag(),
    timeOfDay: timeToTag(),
    timestamp: new Date().toISOString(),
  };
}

// 生成天气+品味结合的 AI 提示词
function buildWeatherTastePrompt(weather, tasteContext) {
  return `
当前天气：${weather.city} ${weather.description}，${weather.temperature}°C，体感 ${weather.feelsLike}°C
天气心情映射：${weather.moodDesc} → 适合"${weather.mood}"氛围的音乐
季节：${weather.season} | 时段：${weather.timeOfDay}

${tasteContext}`;
}

module.exports = { getWeather, weatherToMood, buildWeatherTastePrompt };
