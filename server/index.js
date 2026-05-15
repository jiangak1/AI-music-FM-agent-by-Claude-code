require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes/api');

const app = express();
const settings = config.load();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = settings.port;
const NCM_PORT = parseInt(process.env.NCM_PORT, 10) || 4000;

async function start() {
  // 启动网易云音乐 API 服务
  try {
    const { server: ncmServer } = require('NeteaseCloudMusicApi');
    await ncmServer.serveNcmApi({
      port: NCM_PORT,
      host: '127.0.0.1',
      checkVersion: false,
    });
    console.log(`  网易云音乐 API: http://127.0.0.1:${NCM_PORT}`);

    // 尝试从本地恢复登录状态
    try {
      const neteaseService = require('./services/netease');
      const restored = neteaseService.loadCookieFromDisk();
      if (restored) {
        // Verify the cookie is still valid
        const status = await neteaseService.getLoginStatus();
        if (status?.account) {
          console.log(`  网易云已登录（本地恢复）: ${status.account.userName || status.profile?.nickname || '(未知)'}`);
        } else {
          console.log('  本地 Cookie 已失效，需要重新登录');
        }
      } else {
        const status = await neteaseService.getLoginStatus();
        if (status?.account) {
          console.log(`  网易云已登录: ${status.account.userName || status.profile?.nickname || '(未知)'}`);
        } else {
          console.log('  网易云未登录，部分歌曲可能仅返回 30s 试听');
        }
      }
    } catch (e) {
      // ignore
    }
  } catch (e) {
    console.warn(`  网易云音乐 API 启动失败: ${e.message}`);
    console.warn(`  网易云功能将不可用`);
  }

  app.listen(PORT, () => {
    console.log(`\n  AI 电台服务器已启动`);
    console.log(`  本地地址: http://localhost:${PORT}\n`);

    const { spawn } = require('child_process');
    const platform = process.platform;
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', `http://localhost:${PORT}`]);
    } else if (platform === 'darwin') {
      spawn('open', [`http://localhost:${PORT}`]);
    } else {
      spawn('xdg-open', [`http://localhost:${PORT}`]);
    }
  });
}

start().catch((e) => {
  console.error('启动失败:', e.message);
  process.exit(1);
});
