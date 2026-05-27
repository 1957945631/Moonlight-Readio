# Moonlight Radio

Moonlight 是一个本地运行的私人 AI 音乐电台原型。它把“月亮 DJ”的对话、歌单生成和本地播放控制放在同一个 Web 应用里：前端负责电台界面，后端负责保护 AI key、音乐平台凭证和播放控制。

当前项目仍是本地原型，不是公开部署版。它不会绕过音乐平台版权、授权或播放限制；不可播放歌曲只会作为不可播放结果处理，不会伪装成站内可播资源。

## 功能概览

- 和“月亮 DJ”聊天，获得温柔、克制、自然的电台式回复。
- 根据用户状态生成推荐队列，并过滤不可播放歌曲。
- 明确区分普通聊天、歌单生成和播放控制；普通聊天不会自动换队列。
- 支持 OpenAI 兼容 AI 接口，也支持本地 mock 回退。
- 支持本地默认曲库、网易云边界适配和网易云音乐 CLI 播放。
- 通过项目内 `tools/mpv/mpv.exe` 配合网易云 CLI 控制本地播放。

## 快速开始

环境要求：

- Node.js 20 或更高版本。
- Windows 环境下可直接使用项目内 `tools/mpv/mpv.exe`。
- 如需真实网易云播放，需要配置并登录 `@music163/ncm-cli`。

安装依赖：

```powershell
npm install
```

启动本地服务：

```powershell
npm start
```

打开应用：

```text
http://localhost:8787/
```

直接打开 `web/index.html` 只能查看静态 UI。AI、网易云 CLI 和播放控制都必须通过本地服务 `8787` 端口运行。

## 配置

复制 `.env.example` 为 `.env`，按需填写本地配置：

```powershell
Copy-Item .env.example .env
```

最小可运行配置使用 mock AI：

```env
AI_PROVIDER=mock
MUSIC_PROVIDER=local
```

OpenAI 兼容接口示例：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com
OPENAI_API_STYLE=responses
OPENAI_MODEL=gpt-4.1-mini
```

网易云 CLI 播放示例：

```env
MUSIC_PROVIDER=netease-cli
NETEASE_CLI_PATH=node_modules/.bin/ncm-cli
PROJECT_MPV_PATH=tools/mpv/mpv.exe
```

不要提交 `.env`、API key、AppSecret、PrivateKey 或任何本地凭证。

## 网易云 CLI

项目依赖官方个人使用 CLI：`@music163/ncm-cli`。

```powershell
npm run ncm -- --version
npm run ncm:config
npm run ncm:login
npm run ncm -- login --check
npm run ncm:tui
```

本地注意事项：

- CLI 需要网易云开放平台应用的 `AppID` 和完整 `PrivateKey`。
- `npm run ncm -- config list` 能看到 `appId` 和 `privateKey` 时，说明凭证已配置。
- 登录是单独步骤：运行 `npm run ncm:login` 扫码，再用 `npm run ncm -- login --check` 验证。
- 播放依赖 `mpv`。服务启动时会把 `tools/mpv/` 加入当前进程 PATH。
- 真实播放仍受网易云版权和账号授权限制。

## 项目结构

```text
.
+-- server.js                   # 本地 HTTP 服务、静态文件、/api 路由
+-- web/
|   +-- index.html              # 单页 UI 结构
|   +-- styles.css              # 前端样式
|   +-- app.js                  # 前端交互逻辑
+-- src/
|   +-- moonlight-core.js        # 本地默认曲库、节目单、状态辅助函数
|   +-- radio-service.js         # 电台编排核心：意图判断、队列、DJ 回复
|   +-- env.js                   # 轻量 .env 加载器
|   +-- providers/
|       +-- ai-provider.js       # AI 适配器和结构化结果归一化
|       +-- music-provider.js    # 本地、网易云、网易云 CLI 音乐适配器
+-- data/                        # 口味、日程、歌单和情绪规则上下文
+-- tests/                       # 核心逻辑和 Provider 合约测试
+-- tools/mpv/                   # 项目内 mpv 播放器
```

更详细的结构说明见 `docs/PROJECT_STRUCTURE.md`。给后续 coding agent 的开发规则见 `AGENTS.md`。

## API

前端只调用后端 `/api/*`，不能直接调用 AI 服务或音乐平台凭证。

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/status` | 查看 AI、音乐 Provider 和播放器状态 |
| `POST` | `/api/radio/chat` | DJ 对话和按意图生成或保持队列 |
| `POST` | `/api/radio/channel` | 切换电台频道 |
| `POST` | `/api/radio/plan` | 生成节目/推荐计划 |
| `POST` | `/api/radio/next` | 获取下一首 |
| `GET` | `/api/music/state` | 读取播放状态 |
| `POST` | `/api/music/play` | 播放指定歌曲 |
| `POST` | `/api/music/stop` | 停止播放 |
| `POST` | `/api/music/seek` | 跳转播放进度 |
| `POST` | `/api/music/volume` | 调整音量 |
| `GET` | `/api/music/search?q=...` | 搜索歌曲 |
| `GET` | `/api/music/playback/:trackId` | 查询歌曲播放来源 |
| `POST` | `/api/favorites` | 收藏占位接口 |

## 开发与测试

运行测试：

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
- 前端静态结构和服务端静态根。

开发约束：

- 用户可见行为变更优先补充测试。
- 不要把 `external` 或 `unavailable` 歌曲放进可见推荐队列。
- 普通聊天不能换队列、重播、重置进度或停止音乐。
- 后端是 AI key、音乐平台凭证和播放控制的唯一边界。

## Cloudflare 部署

项目已提供 Cloudflare Workers 配置，公开部署使用 Worker 代理 `/api/*`，静态资源由 `web/` 目录提供。推荐直接在 Cloudflare 控制台连接 GitHub 仓库部署，不需要在本地配置 Cloudflare API token。

部署路径：

1. 把当前仓库推送到 GitHub。
2. 在 Cloudflare 控制台进入 Workers & Pages。
3. 选择通过 Git 仓库创建/导入项目，并授权访问这个 GitHub 仓库。
4. 项目类型选择 Worker，入口文件使用 `worker/index.js`，静态资源目录使用 `web/`。
5. 环境变量按下面的非敏感配置填写；密钥只在 Cloudflare 控制台的 Secrets 里填写。

Cloudflare 配置中只放非敏感变量：

```env
AI_PROVIDER=mock
MUSIC_PROVIDER=netease
NETEASE_API_BASE=https://api-enhanced-umber-ten.vercel.app
NETEASE_REAL_IP=116.25.146.177
NETEASE_AUDIO_LEVEL=standard
```

如果要在 Cloudflare 上启用真实 AI，把 `AI_PROVIDER` 改成 `openai`，并在 Cloudflare 控制台的 Secrets 里添加 `OPENAI_API_KEY`。不要把 OpenAI key、Cloudflare token 或网易云 Cookie 写进 GitHub。

## GitHub 推送前检查

```powershell
git status --short
npm test
```

确认 `.env`、`node_modules/`、`logs/`、`server*.log`、`tools/_downloads/` 和任何 API token 没有进入提交。
