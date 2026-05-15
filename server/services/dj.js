const config = require('../config');
const aiService = require('./ai');
const ttsService = require('./tts');

let djBusy = false;
let pendingSegues = [];

async function createSegue(currentTrack, nextTrack) {
  if (djBusy) return null;

  const s = config.load();
  if (!s.dj.enabled) return null;

  djBusy = true;
  try {
    const script = await aiService.generateDJScript(currentTrack, nextTrack);
    const voice = s.dj.voice || 'zh-CN-XiaoxiaoNeural';
    const audioUrl = await ttsService.synthesize(script, voice);
    return { script, audioUrl, timestamp: Date.now() };
  } catch (e) {
    console.error('DJ 串场生成失败:', e.message);
    return null;
  } finally {
    djBusy = false;
  }
}

function shouldPlayDJ(currentIndex, totalTracks) {
  const s = config.load();
  if (!s.dj.enabled) return false;

  switch (s.dj.frequency) {
    case 'every_track':
      return true;
    case 'every_3':
      return (currentIndex + 1) % 3 === 0;
    case 'every_5':
      return (currentIndex + 1) % 5 === 0;
    case 'first_only':
      return currentIndex === 0;
    default:
      return true;
  }
}

module.exports = { createSegue, shouldPlayDJ };
