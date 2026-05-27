# Moonlight Radio

Moonlight 是一个本地运行的私人 AI 音乐电台原型。它通过后端统一代理 AI 和音乐平台能力，让前端只负责电台界面、DJ 对话、歌单和播放控制。

## 项目文档

- `AGENTS.md`：给后续 coding agent 和维护者的简明开发指南。
- `docs/PROJECT_STRUCTURE.md`：当前项目结构、运行链路和后续重构建议。

## 运行

```powershell
npm start
```

打开：

```text
http://localhost:8787/
```

直接打开 `web/index.html` 只能查看静态 UI。真实 AI、网易云 CLI 和播放控制必须通过本地服务 `8787` 端口运行。

## 配置

复制 `.env.example` 或直接在本地环境变量里配置：

```powershell
$env:AI_PROVIDER="openai"
$env:OPENAI_API_KEY="sk-..."
$env:OPENAI_MODEL="gpt-4.1-mini"
$env:MUSIC_PROVIDER="netease-cli"
npm start
```

AI Provider：

- `mock`：本地模拟，不发起外部请求。
- `openai`：通过后端调用 OpenAI 兼容接口。
- `domestic`：预留国内模型适配入口。

Music Provider：

- `local`：使用本地默认曲库和授权音频信息。
- `netease`：网易云官方/授权接口边界；没有播放授权时只返回外部链接或不可播放状态。
- `netease-cli`：网易云音乐 CLI 适配器，读取本机 CLI 配置、登录状态、播放器状态和搜索能力。

## 网易云 CLI

项目已本地安装官方个人使用 CLI：`@music163/ncm-cli`。

```powershell
npm run ncm -- --version
npm run ncm:config
npm run ncm:login
npm run ncm -- login --check
npm run ncm:tui
```

CLI 需要网易云开放平台应用的 `AppID` 和完整 `PrivateKey`。不要把 PrivateKey 放进前端代码、截图或公开日志。

本地注意事项：

- `npm run ncm -- config list` 能看到 `appId` 和 `privateKey` 时，说明凭证已配置。
- 登录是单独步骤：运行 `npm run ncm:login` 扫码，再用 `npm run ncm -- login --check` 验证。
- 播放依赖 `mpv`。本项目使用 `tools/mpv/mpv.exe`，服务启动时会把它加入当前进程 PATH。
- 网易云 CLI 的真实播放仍可能受版权限制。不可播放歌曲不能伪装成可播放。

## API

- `GET /api/status`
- `POST /api/radio/chat`
- `POST /api/radio/channel`
- `POST /api/radio/plan`
- `POST /api/radio/next`
- `GET /api/music/state`
- `POST /api/music/play`
- `POST /api/music/stop`
- `POST /api/music/seek`
- `POST /api/music/volume`
- `GET /api/music/search?q=...`
- `GET /api/music/playback/:trackId`
- `POST /api/favorites`

## 测试

```powershell
npm test
```

当前测试覆盖：

- 本地核心状态和情绪路由。
- AI Provider 合约与 fallback。
- 音乐 Provider 播放模式。
- 普通聊天不换队列。
- 推荐歌单过滤不可播放歌曲。
- 网易云 CLI 状态、进度和音量接口。

## 后续建议

当前前端已经拆成：

```text
web/
+-- index.html
+-- styles.css
+-- app.js
```

后续如继续拆 `web/app.js`，应作为单独迁移处理，并保持后端 `/api/*` 合约不变。
