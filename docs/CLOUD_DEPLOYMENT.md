# Cloudflare Deployment

Cloudflare Worker name: `moonlightdio`

Public URL:

```text
https://moonlightdio.peifengwu622.workers.dev/
```

GitHub repo deploys from `main`.

## Files Involved

- `worker/index.js`: Worker entry, routes `/api/*`, serves assets.
- `wrangler.jsonc`: Worker name, entry, asset directory, compatibility flags, non-secret vars.
- `web/`: Cloudflare static asset directory.
- `src/`: Bundled API/service/provider code.

## Current Non-Secret Vars

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

## Required Secret

Set this in Cloudflare Dashboard only:

```text
OPENAI_API_KEY=<DeepSeek API key>
```

Path:

```text
Workers 和 Pages -> moonlightdio -> 设置 -> 变量和机密 -> OPENAI_API_KEY
```

Do not put the key into GitHub, `.env.example`, `wrangler.jsonc`, README, or chat logs when avoidable.

## Deploy Flow

1. Commit to local `main`.
2. Push `main` to GitHub.
3. Cloudflare Git integration deploys automatically.
4. Check `/api/status`.
5. Run a browser smoke test.

## Smoke Checks

```powershell
curl.exe -x http://127.0.0.1:3067 -sS https://moonlightdio.peifengwu622.workers.dev/api/status
```

Expected shape:

```json
{
  "ai": { "provider": "openai", "configured": true },
  "music": {
    "provider": "netease",
    "configured": true,
    "reachable": true,
    "supportsSearch": true,
    "supportsPlaybackUrl": true
  }
}
```

Playback source check:

```text
GET /api/music/playback/ncm:212412
```

Expected playable result when网易云 returns a URL:

```json
{ "mode": "stream", "url": "http...mp3" }
```

## Known Deployment Notes

- Cloudflare cannot run local `netease-cli` or `mpv.exe`.
- Cloud playback must use HTTP stream URLs from the Vercel NetEase API.
- Some songs may still be unavailable because网易云 does not return a playable URL. That is expected and must not be bypassed.
- Earlier OpenAI-compatible IP endpoint `http://16.176.195.43:3000` worked locally but failed from Cloudflare with `403 error code: 1003`; DeepSeek is now configured instead.
