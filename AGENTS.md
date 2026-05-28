# Moonlight Agent 指南

这份文档给后续参与 Moonlight 的 coding agent 使用。目标是快速理解项目边界、关键文件、近期决策和容易踩坑的地方。

## 项目目标

Moonlight 是一个 AI 私人音乐电台原型。用户像和老朋友聊天一样与“月亮 DJ”交流，DJ 理解状态、生成可播放队列、介绍歌曲，并通过后端保护 AI key、音乐源配置和播放能力。

当前同时支持：

- 本地 Web 应用：`http://localhost:8787/`
- Cloudflare Worker 公开部署：`https://moonlightdio.peifengwu622.workers.dev/`
- AI：OpenAI 兼容接口，当前云端配置 DeepSeek。
- 音乐：云端使用 Vercel 网易云 API；本地可使用 local 或 netease-cli。

## 当前云端配置

非密钥变量在 `wrangler.jsonc`：

```text
AI_PROVIDER=openai
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
OPENAI_API_STYLE=chat
MUSIC_PROVIDER=netease
NETEASE_API_BASE=https://api-enhanced-umber-ten.vercel.app
NETEASE_REAL_IP=116.25.146.177
NETEASE_AUDIO_LEVEL=standard
```

密钥只在 Cloudflare Secret：

```text
OPENAI_API_KEY
```

不要把 API key、Cookie、token、PrivateKey 写进 Git。

## 关键文件

```text
web/index.html              单页 UI 结构
web/styles.css              前端样式
web/app.js                  当前唯一活跃的前端交互入口
web/moonlight-core.js       给 Cloudflare 静态资源使用的浏览器版 core 副本
src/moonlight-core.js       本地默认曲库、节目单、状态辅助函数
src/api-handler.js          /api 路由分发
src/radio-service.js        意图判断、队列生成、DJ 回复、可播放过滤
src/providers/ai-provider.js
src/providers/music-provider.js
server.js                   本地 Node HTTP 服务
worker/index.js             Cloudflare Worker 入口
wrangler.jsonc              Cloudflare 非敏感配置
```

## 前端交互注意事项

`web/app.js` 现在只保留一个活跃 IIFE。不要重新引入旧版 bootstrap 或重复绑定同一批 DOM 事件。

云端播放链路：

1. `/api/radio/chat` 返回队列和当前首歌的 `playback`。
2. 自动播放当前首歌时保留后端返回的 `stream`。
3. 用户点今日播控台、上一首、下一首时，前端必须调用 `/api/music/playback/:id` 重新解析该歌曲播放源。
4. `stream` 交给 `<audio>` 播放；不要用 `externalUrl` 覆盖 `stream`。
5. `stream` 模式只更新 `<audio>.volume/currentTime`，不要轮询 CLI `/api/music/state`。
6. `external` 只用于不可站内播放的兜底，不应该出现在可见推荐队列。

最近修过的回归点：

- 今日播控台点歌、上一首、下一首、播放按钮曾经因为只拿 `externalUrl` 而跳网易云外链。
- 音量滑块曾经在云端 stream 模式下混用 CLI 音量接口。
- 旧版和新版前端逻辑曾经同时运行，导致状态互相覆盖。

改前端播放交互后，必须用浏览器实际验证：

- 生成网易云队列。
- 点今日播控台第 2 首。
- 点上一首、下一首。
- 点播放/暂停。
- 调整音量。
- 确认没有打开外部标签页，控制台没有 error。

## Provider 合约

AI Provider 归一化输出：

- `djText`
- `whyThisSong`
- `moodChannel`
- `strategy`
- `searchQueries`
- `intent`
- `shouldChangeQueue`
- `queueIntent`
- `hostQuestion`
- `avoidRules`
- `trackIntro`

Music Provider 暴露：

- `searchTracks(query, mood)`
- `getTrackDetail(id)`
- `getPlaybackSource(id)`
- `playTrack(track)`
- `stopPlayback()`
- `getPlaybackState()`
- `seekPlayback(seconds)`
- `setVolume(level)`

可进入推荐队列的播放模式只有：

- `cli`
- `stream`

## 行为规则

- 普通聊天不能换队列、不能重播、不能重置进度、不能停止音乐。
- 只有明确“推荐、换歌、调频、切频道、想听某类歌”等意图时，才允许 `queueChanged=true`。
- 不可播放歌曲不能留在右侧可见歌单里。
- 云端不能依赖本地 `netease-cli`、`mpv.exe` 或本机 PATH。
- 不绕过网易云版权、授权或播放限制。

## 运行与验证

```powershell
npm start
npm test
node --check web\app.js
Invoke-RestMethod http://localhost:8787/api/status
```

公网接口检查：

```text
GET https://moonlightdio.peifengwu622.workers.dev/api/status
GET https://moonlightdio.peifengwu622.workers.dev/api/music/search?q=月亮
GET https://moonlightdio.peifengwu622.workers.dev/api/music/playback/ncm:212412
POST https://moonlightdio.peifengwu622.workers.dev/api/radio/chat
```

## 文档维护

结构和部署变化时同步更新：

- `README.md`
- `AGENTS.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/CLOUD_DEPLOYMENT.md`
- `docs/FRONTEND_INTERACTIONS.md`
