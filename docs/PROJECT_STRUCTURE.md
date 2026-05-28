# Project Structure

Moonlight 使用“静态前端 + 本地/Worker API + Provider 适配器”的结构。前端永远只访问 `/api/*`，AI key、网易云配置和播放源解析都留在后端侧。

## Runtime Flow

```text
Browser UI
  -> /api/*
    -> src/api-handler.js
      -> src/radio-service.js
        -> src/providers/ai-provider.js
        -> src/providers/music-provider.js
          -> Vercel NetEase API (cloud)
          -> ncm-cli + mpv (local only)
```

Cloudflare 部署：

```text
worker/index.js
  -> createApiServices(env)
  -> handleApiRequest(request, services)
  -> env.ASSETS.fetch(request) for web/*
```

本地部署：

```text
server.js
  -> load .env
  -> serve web/* and allowed project static files
  -> handle /api/*
```

## Directory Map

| Path | Purpose |
| --- | --- |
| `web/index.html` | Single page UI markup. |
| `web/styles.css` | Frontend styles. |
| `web/app.js` | Active browser interaction logic. Keep one active bootstrap only. |
| `web/moonlight-core.js` | Browser-served copy of `src/moonlight-core.js` for Cloudflare assets. |
| `src/moonlight-core.js` | Default fallback tracks, schedule, mood routing, state helpers. |
| `src/api-handler.js` | HTTP API routing shared by local server and Worker. |
| `src/radio-service.js` | Intent detection, DJ plan orchestration, queue generation, playable filtering. |
| `src/providers/ai-provider.js` | Mock and OpenAI-compatible AI provider. |
| `src/providers/music-provider.js` | Local, NetEase API, and NetEase CLI providers. |
| `worker/index.js` | Cloudflare Worker entry. |
| `server.js` | Local Node server entry. |
| `tests/` | Plain Node tests. |
| `docs/` | Maintainer documentation. |
| `data/` | Taste/routine/playlist context for future personalization. |
| `tools/mpv/` | Local mpv support files. `mpv.exe` is ignored due GitHub size limits. |

## Structure Decisions

- `web/app.js` was cleaned so only the newer IIFE controls UI state. Do not add a second bootstrap.
- `web/moonlight-core.js` exists because Cloudflare assets serve only `web/`. If `src/moonlight-core.js` changes, keep the browser copy in sync.
- Cloud and local backends share `src/api-handler.js`, so API changes should be tested once and work in both runtimes.
- Cloud playback is HTTP stream based. Local CLI playback is a separate mode and should not leak into cloud behavior.

## Common Change Areas

| Task | Files |
| --- | --- |
| AI provider or model | `wrangler.jsonc`, `.env.example`, `src/providers/ai-provider.js` |
| Music source behavior | `src/providers/music-provider.js`, `src/radio-service.js` |
| Queue or chat behavior | `src/radio-service.js`, `tests/provider-contract.test.js` |
| Frontend playback controls | `web/app.js`, `docs/FRONTEND_INTERACTIONS.md` |
| Cloudflare deployment | `worker/index.js`, `wrangler.jsonc`, `docs/CLOUD_DEPLOYMENT.md` |
