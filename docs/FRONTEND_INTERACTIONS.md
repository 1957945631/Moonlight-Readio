# Frontend Interactions

This document records the current frontend playback behavior and the regressions that were fixed. Use it before changing `web/app.js`.

## Current Rules

- `web/app.js` has one active bootstrap: the IIFE at the top of the file.
- Do not add a second event-binding block for the same DOM controls.
- The right panel queue is not just display; clicking a row must select that track and resolve its playback source.
- Cloud stream playback uses `<audio id="audioPlayer">` directly.
- External links are only a fallback when the backend cannot provide `stream` or `cli`.

## Playback Source Flow

Initial recommendation:

```text
POST /api/radio/chat
  -> result.currentTrack
  -> result.queue
  -> result.playback
  -> applyRadioResult()
  -> playCurrent()
```

Queue click / previous / next:

```text
selectQueueTrack(index)
  -> setCurrentTrack()
  -> playCurrent()
  -> resolvePlaybackForTrack()
  -> GET /api/music/playback/:id for ncm tracks
  -> stream -> audio.play()
```

## Regressions Fixed

### External-link jumps from playback controls

Symptoms:

- Clicking a queue item opened网易云 in a new tab.
- Previous/next also opened external links.
- Play button could jump out instead of playing in-page.

Causes:

- Queue items carried `externalUrl` but not their resolved `stream` source.
- `playCurrent()` recalculated playback from `externalUrl` and overwrote the backend `stream` response.
- Old and new frontend bootstraps ran together, so stale state could override fixed state.

Current safeguards:

- `resolvePlaybackForTrack()` asks `/api/music/playback/:id` before playing an NCM track.
- `playCurrent()` preserves valid `stream`/`cli` sources for the current track.
- Old bootstrap was removed from runtime code.

### Volume problems

Symptoms:

- Cloud stream mode mixed local CLI volume behavior.
- Volume UI did not reliably reflect actual audio volume.

Current behavior:

- `commitVolume()` always updates local storage, slider UI, and `audio.volume`.
- It only calls `/api/music/volume` when `playback.mode === "cli"`.
- In cloud stream mode, volume is purely frontend `<audio>` volume.

### Status polling problems

Symptoms:

- Cloud stream playback state was overwritten by `/api/music/state` returning idle.

Current behavior:

- `syncCliState()` exits early unless `playback.mode === "cli"`.
- In `stream` mode, it reads `audio.currentTime`, `audio.paused`, and `audio.ended` instead.

## Manual Browser Smoke Test

After frontend interaction changes, verify on the Cloudflare URL:

1. Open `https://moonlightdio.peifengwu622.workers.dev/`.
2. Confirm console has no `error`.
3. Send: `我想听月亮`.
4. Confirm Source shows `真实音频`.
5. Confirm only one browser tab is open.
6. Click the second queue item.
7. Click next.
8. Click previous.
9. Click play/pause twice.
10. Move volume to `30` and confirm `audio.volume` is `0.3`.

Useful Playwright CLI commands:

```powershell
npx --yes --package @playwright/cli playwright-cli open https://moonlightdio.peifengwu622.workers.dev
npx --yes --package @playwright/cli playwright-cli snapshot
npx --yes --package @playwright/cli playwright-cli console error
npx --yes --package @playwright/cli playwright-cli requests
npx --yes --package @playwright/cli playwright-cli tab-list
```
