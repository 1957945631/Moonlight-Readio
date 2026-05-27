const { createAiProvider } = require("./providers/ai-provider.js");
const { createMusicProvider } = require("./providers/music-provider.js");
const { createRadioService } = require("./radio-service.js");

function getEnv(env, key) {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) return env[key];
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
}

function createApiServices(env = {}, options = {}) {
  const aiProvider = createAiProvider({
    env,
    provider: getEnv(env, "AI_PROVIDER") || (getEnv(env, "OPENAI_API_KEY") ? "openai" : "mock"),
    fetch: options.aiFetch,
  });
  const musicProvider = createMusicProvider({
    env,
    provider: getEnv(env, "MUSIC_PROVIDER") || "netease",
    fetch: options.musicFetch,
  });
  return {
    env,
    aiProvider,
    musicProvider,
    radio: createRadioService({ aiProvider, musicProvider }),
  };
}

function sendJson(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function handleApiRequest(request, services) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (request.method === "OPTIONS") return sendJson(204, {});

  const { env, aiProvider, musicProvider, radio } = services;
  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      const musicStatus = typeof musicProvider.checkStatus === "function"
        ? await musicProvider.checkStatus()
        : {};
      return sendJson(200, {
        ai: {
          provider: aiProvider.name,
          configured: aiProvider.name !== "openai" || Boolean(getEnv(env, "OPENAI_API_KEY")),
        },
        music: {
          provider: musicProvider.name,
          authorized: Boolean(musicProvider.authorized),
          configured: musicStatus.configured,
          reachable: musicStatus.reachable,
          loggedIn: musicStatus.loggedIn,
          playerReady: musicStatus.playerReady,
          supportsSearch: musicStatus.supportsSearch,
          supportsPlaybackUrl: musicStatus.supportsPlaybackUrl,
          message: musicStatus.message,
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/radio/plan") {
      return sendJson(200, await radio.plan(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/radio/next") {
      return sendJson(200, await radio.next(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/radio/chat") {
      return sendJson(200, await radio.chat(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/radio/channel") {
      return sendJson(200, await radio.channel(await readJson(request)));
    }

    if (request.method === "GET" && url.pathname === "/api/music/state") {
      if (typeof musicProvider.getPlaybackState !== "function") {
        return sendJson(200, { ok: true, status: "idle", position: 0, duration: 0, volume: 64 });
      }
      return sendJson(200, await musicProvider.getPlaybackState());
    }

    if (request.method === "GET" && url.pathname === "/api/music/search") {
      return sendJson(200, {
        tracks: await musicProvider.searchTracks(url.searchParams.get("q") || ""),
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/music/playback/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/music/playback/", ""));
      return sendJson(200, await musicProvider.getPlaybackSource(id));
    }

    if (request.method === "POST" && url.pathname === "/api/music/play") {
      if (typeof musicProvider.playTrack !== "function") {
        return sendJson(400, { ok: false, reason: "Current music provider does not support direct CLI playback." });
      }
      return sendJson(200, await musicProvider.playTrack(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/music/stop") {
      if (typeof musicProvider.stopPlayback !== "function") {
        return sendJson(400, { ok: false, reason: "Current music provider does not support direct CLI stop." });
      }
      return sendJson(200, await musicProvider.stopPlayback());
    }

    if (request.method === "POST" && url.pathname === "/api/music/seek") {
      if (typeof musicProvider.seekPlayback !== "function") {
        return sendJson(400, { ok: false, reason: "Current music provider does not support seek." });
      }
      const body = await readJson(request);
      return sendJson(200, await musicProvider.seekPlayback(body.seconds));
    }

    if (request.method === "POST" && url.pathname === "/api/music/volume") {
      if (typeof musicProvider.setVolume !== "function") {
        return sendJson(400, { ok: false, reason: "Current music provider does not support volume." });
      }
      const body = await readJson(request);
      return sendJson(200, await musicProvider.setVolume(body.volume));
    }

    if (request.method === "POST" && url.pathname === "/api/favorites") {
      return sendJson(200, { ok: true, storage: "localStorage", note: "第一版收藏由浏览器本地保存" });
    }

    return sendJson(404, { error: "Not found" });
  } catch (error) {
    return sendJson(500, { error: error.message });
  }
}

module.exports = {
  createApiServices,
  handleApiRequest,
  sendJson,
};
