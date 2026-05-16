# AI 电台 (AI Radio)//建议下载第一版pwa版本

AI 驱动的智能电台 — 支持 AI 智能歌单生成、AI DJ 主持人串场、本地音乐库播放。前端为 PWA 可安装到桌面，纯本地运行。

## 功能

- **AI 智能歌单**：根据心情、风格、年代自动生成播放列表
- **AI DJ 主持人**：歌曲之间 AI 生成串场词，TTS 语音播报
- **混合音频源**：本地音乐文件 + 在线流媒体(网易云音乐)
- **PWA 支持**：可安装到桌面，离线缓存壳资源
- **复古电台 UI**：黑胶唱片动画、频率刻度、暗色主题
- **纯本地运行**：用户自配 API Key，数据不出本地
## 播放界面
<img width="1920" height="945" alt="503d564d-51e3-4de9-b67d-09cbd17e80f1" src="https://github.com/user-attachments/assets/ec6d941d-34fc-4cb9-94a1-c51ad646a1bf" />






## 快速开始

### 1. 环境要求

- [Node.js](https://nodejs.org/) 18+ （推荐 LTS）
- Windows / macOS / Linux

### 2. 安装与启动（Windows）

```
双击 setup.bat  →  安装依赖
编辑  .env 文件  →  填入 API Key
双击 start.bat  →  启动电台
```

浏览器会自动打开 `http://localhost:3000`

### 3. 手动安装

```bash
cd server
npm install
cp ../.env.example ../.env
# 编辑 ../.env 填入 API Key
node index.js
```

## 配置

编辑项目根目录的 `.env` 文件：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_API_KEY` | OpenAI 兼容 API 的 Key | (必填) |
| `AI_API_BASE` | API 地址 | `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称 | `gpt-4o` |
| `PORT` | 服务器端口 | `3000` |
| `MUSIC_DIR` | 本地音乐目录 | (可选) |

支持任何 OpenAI 兼容 API（如 DeepSeek、通义千问、智谱等）。

## 使用说明

1. **播放列表** — 查看当前播放队列，点击播放
2. **AI 生成** — 选择心情/风格，AI 为你生成歌单
3. **本地音乐** — 扫描本地目录，播放你的音乐文件
4. **设置** — 配置 API Key、DJ 语音、串场频率

## 移植到其他 Windows 设备

1. 复制整个 `ai-radio` 目录到目标设备
2. 确保目标设备已安装 Node.js
3. 双击 `setup.bat`→ 编辑 `.env` → 双击 `start.bat`

## 技术栈

- **前端**：Vanilla HTML/CSS/JS, PWA (Service Worker)
- **后端**：Node.js + Express
- **AI**：OpenAI 兼容 API
- **TTS**：mimo-2.5-TTS (免费)
- **音频**：HTML5 Audio API

## 项目结构

```
ai-radio/
├── server/           # Node.js 后端
│   ├── index.js      # Express 主入口
│   ├── routes/       # API 路由
│   ├── services/     # 业务逻辑 (AI, TTS, DJ, 播放器, 音乐库)
│   └── config/       # 配置管理
├── public/           # PWA 前端
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js         # Service Worker
│   ├── css/style.css
│   └── js/           # app.js, player.js, ui.js, api.js
├── .env.example      # 配置模板
├── setup.bat         # 首次安装
├── start.bat         # 一键启动
└── README.md
```

## License

MIT



