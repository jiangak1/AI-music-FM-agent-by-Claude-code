let audio = null;
let djAudio = null;
let isPlaying = false;
let currentAudioSource = null;
let state = {
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  volume: 80,
};

function initAudio() {
  if (!audio) {
    audio = new Audio();
    audio.volume = state.volume / 100;
    audio.addEventListener('ended', onTrackEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('error', (e) => {
      console.warn('音频播放出错:', e);
      onTrackEnded();
    });
  }
  if (!djAudio) {
    djAudio = new Audio();
    djAudio.volume = state.volume / 100;
  }
}

function getAudioUrl(track) {
  if (!track) return null;
  if (track.source === 'local') {
    return `/api/library/stream?path=${encodeURIComponent(track.filePath)}`;
  }
  if (track.url) return track.url;
  return `/api/library/stream?path=${encodeURIComponent(track.filePath || '')}`;
}

function play(track) {
  initAudio();
  state.currentTrack = track;
  const url = getAudioUrl(track);
  if (!url) return;
  audio.src = url;
  audio.play().catch(e => console.warn('播放被阻止:', e));
  isPlaying = true;
  currentAudioSource = url;
}

function resume() {
  if (audio) {
    audio.play();
    isPlaying = true;
  }
}

function pause() {
  if (audio) {
    audio.pause();
    isPlaying = false;
  }
}

function togglePlay() {
  if (isPlaying) pause(); else resume();
}

function setVolume(v) {
  state.volume = v;
  if (audio) audio.volume = v / 100;
  if (djAudio) djAudio.volume = v / 100;
}

function seek(percent) {
  if (audio && audio.duration) {
    audio.currentTime = (percent / 100) * audio.duration;
  }
}

function playDJAudio(url) {
  if (!djAudio || !url) return;
  return new Promise((resolve) => {
    djAudio.src = url;
    djAudio.onended = resolve;
    djAudio.onerror = resolve;
    djAudio.play().catch(resolve);
  });
}

function onTrackEnded() {
  if (typeof onTrackEnd === 'function') onTrackEnd();
}

function onTimeUpdate() {
  if (typeof onProgress === 'function' && audio) {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    onProgress(pct, audio.currentTime, audio.duration);
  }
}

function onLoaded() {
  if (typeof onTrackLoaded === 'function' && audio) {
    onTrackLoaded(audio.duration);
  }
}

// Callbacks set by app.js
let onTrackEnd = null;
let onProgress = null;
let onTrackLoaded = null;

function getState() { return state; }
function getIsPlaying() { return isPlaying; }

window.Player = {
  initAudio, play, resume, pause, togglePlay, setVolume, seek,
  playDJAudio, getState, getIsPlaying,
  setOnTrackEnd(fn) { onTrackEnd = fn; },
  setOnProgress(fn) { onProgress = fn; },
  setOnTrackLoaded(fn) { onTrackLoaded = fn; },
};
