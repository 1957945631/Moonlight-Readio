# Moonlight Agent 指南

这份文档给后续参与 Moonlight 项目的 coding agent 使用。目标是让接手者快速理解项目边界、文件职责和开发规则。

## 项目目标

Moonlight 是一个本地运行的私人 AI 音乐电台原型。理想体验是：用户可以像和老朋友聊天一样与“月亮 DJ”交流，DJ 会理解用户状态、生成可播放歌单、介绍歌曲，并通过后端控制本地播放。

当前范围：

- 本地 Web 应用：`http://localhost:8787/`。
- 后端负责保护 AI key、音乐平台凭证和播放控制。
- AI 支持 OpenAI 兼容接口，也保留 mock 回退。
- 音乐播放通过网易云音乐 CLI 和项目内 `tools/mpv/mpv.exe` 完成。
- 不绕过音乐平台版权、授权或播放限制。

## 项目结构

```text
.
+-- server.js                   # 本地 HTTP 服务、静态文件、/api 路由
+-- web/
|   +-- index.html              # 当前单页 UI 结构
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
+-- logs/                        # 运行日志，已忽略
+-- .env                         # 本地密钥，已忽略
```

## 运行与验证

```powershell
npm start
npm test
```

打开应用：

```text
http://localhost:8787/
```

常用检查：

```powershell
Invoke-RestMethod http://localhost:8787/api/status
Invoke-RestMethod http://localhost:8787/api/music/state
npm run ncm -- login --check
```

## 关键行为规则

- 普通聊天、歌单生成、播放控制必须解耦。
- 普通聊天不能换队列、不能重播、不能重置进度、不能停止音乐。
- 只有明确“推荐、换歌、调频、切频道”等意图时，才允许 `queueChanged: true`。
- 不可播放歌曲不能留在右侧可见歌单里。
- 如果 CLI 播放某首失败，应从当前队列移除该歌曲，并尝试下一首可播放歌曲。
- 右侧“今日播控台”默认只展示歌曲列表，除非用户明确要求恢复说明卡。
- 月亮 DJ 的语气应温柔、熟悉、克制、自然，避免机械分条回复。

## API 边界

前端只能调用后端 `/api/*`，不能直接调用 AI 服务或音乐平台凭证。

主要接口：

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

## Provider 合约

AI Provider 输出会被归一化为：

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

Music Provider 应暴露：

- `searchTracks(query, mood)`
- `getTrackDetail(id)`
- `getPlaybackSource(id)`
- `playTrack(track)`
- `stopPlayback()`
- `getPlaybackState()`
- `seekPlayback(seconds)`
- `setVolume(level)`

可进入推荐列表的播放模式只有：

- `cli`
- `stream`

不要把 `external` 或 `unavailable` 歌曲放进可见推荐队列。

## 开发注意事项

- 优先做小范围、低风险修改。前端已拆到 `web/index.html`、`web/styles.css`、`web/app.js`；除非明确做前端重构，否则不要继续大拆。
- 后端适配器必须能在没有真实 AI 或真实网易云播放的情况下测试。
- 不要打印或提交 `.env`、API key、AppSecret、PrivateKey。
- 运行产物不要进入源码管理：`node_modules/`、`logs/`、`server*.log`、`tools/_downloads/`。
- 改动用户可见行为时，优先补充 `tests/provider-contract.test.js` 或 `tests/moonlight-core.test.js`。
- 完成前至少运行 `npm test`，并检查 `web/app.js` 能被解析。
后续产品行为修复应继续保持小范围修改，不要和进一步前端模块化混在一起。
