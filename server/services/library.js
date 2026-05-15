const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

let library = [];

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma']);

function getLibrary() {
  return library;
}

async function scan(dir) {
  if (!dir || !fs.existsSync(dir)) {
    throw new Error(`目录不存在: ${dir}`);
  }

  library = [];
  await scanDir(dir);
  return library;
}

async function scanDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath);
    } else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
      try {
        const meta = await mm.parseFile(fullPath, { duration: true });
        library.push({
          id: Buffer.from(fullPath).toString('base64'),
          title: meta.common.title || path.basename(entry.name, path.extname(entry.name)),
          artist: meta.common.artist || '未知艺术家',
          album: meta.common.album || '',
          duration: Math.round(meta.format.duration || 0),
          filePath: fullPath,
          source: 'local',
        });
      } catch {
        library.push({
          id: Buffer.from(fullPath).toString('base64'),
          title: path.basename(entry.name, path.extname(entry.name)),
          artist: '未知艺术家',
          album: '',
          duration: 0,
          filePath: fullPath,
          source: 'local',
        });
      }
    }
  }
}

module.exports = { getLibrary, scan };
