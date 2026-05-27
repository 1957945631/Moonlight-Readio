# Moonlight Project Structure

Moonlight currently uses a simple local Node server plus a static single-page UI. The structure is intentionally small so AI, music, and UI behavior can be tested locally.

## Runtime Flow

```text
Browser UI
  -> server.js /api/*
    -> radio-service.js
      -> ai-provider.js
      -> music-provider.js
        -> @music163/ncm-cli
        -> tools/mpv/mpv.exe
```

## Directory Map

| Path | Purpose |
| --- | --- |
| `web/index.html` | Main UI markup. |
| `web/styles.css` | Browser-side styling. |
| `web/app.js` | Browser-side interaction logic. |
| `server.js` | Local HTTP server, static file serving, API route dispatch. |
| `src/moonlight-core.js` | Shared schedule, fallback tracks, mood routing, state helpers. |
| `src/radio-service.js` | DJ/radio orchestration, intent split, queue generation, playable filtering. |
| `src/providers/ai-provider.js` | AI provider adapters, fallback mock provider, JSON plan normalization. |
| `src/providers/music-provider.js` | Local, NetEase, and NetEase CLI music adapters. |
| `src/env.js` | `.env` loader that does not override existing environment variables. |
| `data/` | Taste, routine, playlist, and mood context files for future personalization. |
| `tests/` | Node-based regression tests for core behavior and provider contracts. |
| `tools/mpv/` | Project-local mpv player used by NetEase CLI playback. |
| `logs/` | Runtime logs. Ignored by git. |

## Current Architecture Notes

- The frontend is split into `web/index.html`, `web/styles.css`, and `web/app.js`.
- Backend code is already split by responsibility and should remain the source of truth for AI/music credentials.
- `radio-service.js` decides whether user input is normal chat or a queue-changing request.
- `music-provider.js` must respect playback restrictions. It should not fake playable streams.
- Tests are plain Node scripts, so no additional test runner is required.

## Suggested Evolution

Short term:

- Keep product fixes scoped to `web/`, `radio-service.js`, and providers.
- Add tests for every user-visible behavior change.
- Keep `AGENTS.md` updated when architecture decisions change.

Medium term:

- Keep API contracts unchanged during future frontend cleanups.
- If `web/app.js` grows further, split it by state, rendering, and playback control in a separate migration.

Long term:

- Add persistent storage for DJ session memory and favorites.
- Add authenticated user profile storage if this becomes a deployed app.
- Replace local-only NetEase CLI behavior with officially authorized playback APIs if public release is required.
