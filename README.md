# Moonlight Radio

Moonlight 是一个 AI 私人音乐电台原型。用户和“月亮 DJ”聊天，后端根据用户状态生成可播放队列，前端负责播放、切歌、音量、收藏和状态展示。

当前项目同时支持本地运行和 Cloudflare Workers 云端部署。云端主音乐源是你部署在 Vercel 的网易云 API，AI 使用 OpenAI 兼容接口，当前配置为 DeepSeek。

## 当前状态

- 公开地址：`https://moonlightdio.peifengwu622.workers.dev/`
- 默认分支：`main`
- 云端 AI：`OPENAI_BASE_URL=https://api.deepseek.com`，`OPENAI_MODEL=deepseek-v4-flash`
- 云端音乐：`MUSIC_PROVIDER=netease`，`NETEASE_API_BASE=https://api-enhanced-umber-ten.vercel.app`
- 前端入口：`web/index.html` + `web/app.js` + `web/styles.css`
- Worker 入口：`worker/index.js`
- 后端 API 合约：`src/api-handler.js`、`src/radio-service.js`、`src/providers/*`

## 快速运行

```powershell
npm install
npm start
```

打开：

```text
http://localhost:8787/
```

运行测试：

```powershell
npm test
node --check web\app.js
```

## 本地环境变量

复制示例文件：

```powershell
Copy-Item .env.example .env
```

最小本地 mock：

```env
AI_PROVIDER=mock
MUSIC_PROVIDER=local
```

本地使用 DeepSeek：

```env
AI_PROVIDER=openai
OPENAI_API_KEY=你的 DeepSeek API key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_STYLE=chat
OPENAI_MODEL=deepseek-v4-flash
```

本地使用网易云 API：

```env
MUSIC_PROVIDER=netease
NETEASE_API_BASE=https://api-enhanced-umber-ten.vercel.app
NETEASE_REAL_IP=116.25.146.177
NETEASE_AUDIO_LEVEL=standard
```

不要提交 `.env`、API key、Cookie、Cloudflare token 或任何私钥。

## Cloudflare 配置

非敏感配置在 `wrangler.jsonc`：

```jsonc
{
  "vars": {
    "AI_PROVIDER": "openai",
    "OPENAI_BASE_URL": "https://api.deepseek.com",
    "OPENAI_MODEL": "deepseek-v4-flash",
    "OPENAI_API_STYLE": "chat",
    "MUSIC_PROVIDER": "netease",
    "NETEASE_API_BASE": "https://api-enhanced-umber-ten.vercel.app",
    "NETEASE_REAL_IP": "116.25.146.177",
    "NETEASE_AUDIO_LEVEL": "standard"
  }
}
```

DeepSeek key 只填到 Cloudflare Secret：

```text
OPENAI_API_KEY
```

Cloudflare 控制台路径：`Workers 和 Pages` -> `moonlightdio` -> `设置` -> `变量和机密` -> 编辑 `OPENAI_API_KEY`。

## API

前端只能访问后端 `/api/*`，不能直接调用 AI 服务、网易云 API 或携带密钥。

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/status` | 查看 AI、音乐源、网易云可达性和播放能力 |
| `POST` | `/api/radio/chat` | DJ 对话；按意图保持或替换队列 |
| `POST` | `/api/radio/channel` | 切换频道并重新排队 |
| `POST` | `/api/radio/next` | 获取下一首 |
| `GET` | `/api/music/search?q=...` | 搜索音乐 |
| `GET` | `/api/music/playback/:trackId` | 查询单曲播放源 |
| `GET` | `/api/music/state` | 本地 CLI 播放状态 |
| `POST` | `/api/music/play` | 本地 CLI 播放 |
| `POST` | `/api/music/stop` | 停止本地 CLI 播放 |
| `POST` | `/api/music/seek` | 本地 CLI 或 stream 进度 |
| `POST` | `/api/music/volume` | 本地 CLI 音量 |

云端 HTTP stream 播放不走 `/api/music/play`，而是前端拿 `/api/music/playback/:id` 返回的 `stream` URL 直接交给 `<audio>`。

## 关键行为规则

- 普通聊天不能换队列、不能重播、不能重置进度、不能停止音乐。
- 只有明确“推荐、换歌、调频、切频道、想听某类歌”等意图时，才允许 `queueChanged=true`。
- 可见推荐队列只能包含 `cli` 或 `stream` 可播放项。
- `external` 和 `unavailable` 不能进入可见推荐队列。
- 云端不能使用本地 `netease-cli` 或 `mpv.exe`，只能使用网易云 API 返回的 HTTP URL。
- 如果某首歌 `/song/url` 返回空，只能外链或不可播，不能伪装成站内播放。

## 文档索引

- [项目结构](docs/PROJECT_STRUCTURE.md)
- [Cloudflare 部署与配置](docs/CLOUD_DEPLOYMENT.md)
- [前端播放交互排查](docs/FRONTEND_INTERACTIONS.md)
- [Agent 开发指南](AGENTS.md)

## 提交前检查

```powershell
git status --short
npm test
node --check web\app.js
```
