# AI 电台 (AI Radio)

AI 驱动的智能电台 — 支持 AI 智能歌单生成、AI DJ 主持人串场、本地音乐库播放。支持 **浏览器 PWA** 和 **Tauri 桌面应用** 两种模式。

## 功能

- **AI 智能歌单**：根据心情、风格、年代自动生成播放列表
- **AI DJ 主持人**：歌曲之间 AI 生成串场词，TTS 语音播报
- **音频可视化**：Web Audio API 驱动的实时频谱背景动画，随音乐律动
- **混合音频源**：本地音乐文件 + 在线流媒体(网易云音乐)
- **PWA 支持**：可安装到桌面，离线缓存壳资源
- **Tauri 桌面应用**：原生 Windows 安装包，系统托盘、隐藏到托盘
- **网易云风格 UI**：红黑配色、圆形旋转唱片封面、现代化播放器布局
- **纯本地运行**：用户自配 API Key，数据不出本地

## 播放界面

<img width="1920" height="945" alt="AI Radio Screenshot" src="https://github.com/user-attachments/assets/ec6d941d-34fc-4cb9-94a1-c51ad646a1bf" />

## 快速开始

### 1. 环境要求

- [Node.js](https://nodejs.org/) 18+ （推荐 LTS）
- Windows / macOS / Linux
- [Rust](https://www.rust-lang.org/) + [VS Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)（仅 Tauri 桌面模式需要）

### 2. 浏览器模式（推荐首次使用）

```
双击 setup.bat  →  安装依赖
编辑  .env 文件  →  填入 API Key
双击 start.bat  →  启动电台
```

浏览器会自动打开 `http://localhost:3000`

### 3. Tauri 桌面模式

```bash
# 安装 Tauri CLI
cargo install tauri-cli --version "^2"

# 开发模式
cd src-tauri
cargo tauri dev

# 构建安装包
cargo tauri build
# 安装包位于: src-tauri/target/release/bundle/nsis/
```

### 4. 手动安装

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
2. **推荐歌单** — AI 每日推荐 + DJ 语音介绍
3. **AI 生成** — 选择心情/风格，AI 为你生成歌单
4. **网易云** — 扫码登录，同步歌单，品味分析
5. **本地音乐** — 扫描本地目录，播放你的音乐文件
6. **设置** — 配置 API Key、DJ 语音、串场频率
7. **AI 聊天** — 和 DJ 小电聊聊音乐，获取推荐

## 移植到其他 Windows 设备

1. 复制整个 `ai-radio` 目录到目标设备
2. 确保目标设备已安装 Node.js
3. 双击 `setup.bat` → 编辑 `.env` → 双击 `start.bat`

或直接运行 Tauri 安装包（`AI 电台_0.1.0_x64-setup.exe`）。

## 技术栈

- **前端**：Vanilla HTML/CSS/JS, PWA
- **后端**：Node.js + Express
- **桌面**：Tauri 2.x (Rust) + WebView2
- **AI**：OpenAI 兼容 API
- **TTS**：mimo-2.5-TTS (免费)
- **音频**：HTML5 Audio API + Web Audio API (实时频谱)
- **可视化**：AnalyserNode + requestAnimationFrame 驱动的背景效果

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
│   ├── css/style.css # 网易云风格样式
│   └── js/           # app.js, player.js, ui.js, api.js, netease.js, chat.js
├── src-tauri/        # Tauri 桌面端 (Rust)
│   ├── src/lib.rs    # 应用逻辑、托盘、窗口管理
│   ├── Cargo.toml    # Rust 依赖
│   └── tauri.conf.json
├── .env.example      # 配置模板
├── setup.bat         # 首次安装
├── start.bat         # 一键启动
└── README.md
```

## License

MIT
