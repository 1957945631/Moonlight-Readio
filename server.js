const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("./src/env.js");
const { createAiProvider } = require("./src/providers/ai-provider.js");
const { createMusicProvider } = require("./src/providers/music-provider.js");
const { createRadioService } = require("./src/radio-service.js");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const WEB_ROOT = path.join(ROOT, "web");
const PROJECT_MPV_DIR = path.join(ROOT, "tools", "mpv");
if (fs.existsSync(path.join(PROJECT_MPV_DIR, "mpv.exe"))) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "PATH";
  process.env[pathKey] = `${PROJECT_MPV_DIR};${process.env[pathKey] || ""}`;
}

const aiProvider = createAiProvider({
  provider: process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "mock"),
});
const musicProvider = createMusicProvider({
  provider: process.env.MUSIC_PROVIDER || "netease",
});
const radio = createRadioService({ aiProvider, musicProvider });

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStaticPath(pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const webPath = path.resolve(WEB_ROOT, requested);
  if (isInside(webPath, WEB_ROOT) && fs.existsSync(webPath)) {
    return webPath;
  }

  const rootPath = path.resolve(ROOT, requested);
  if (isInside(rootPath, ROOT) && fs.existsSync(rootPath)) {
    return rootPath;
  }

  return isInside(webPath, WEB_ROOT) || isInside(rootPath, ROOT) ? webPath : null;
}

function serveStatic(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store, max-age=0",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      const musicStatus = typeof musicProvider.checkStatus === "function"
        ? await musicProvider.checkStatus()
        : {};
      return sendJson(res, 200, {
        ai: {
          provider: aiProvider.name,
          configured: aiProvider.name !== "openai" || Boolean(process.env.OPENAI_API_KEY),
        },
        music: {
          provider: musicProvider.name,
          authorized: Boolean(musicProvider.authorized),
          configured: musicStatus.configured,
          loggedIn: musicStatus.loggedIn,
          playerReady: musicStatus.playerReady,
          supportsSearch: musicStatus.supportsSearch,
          message: musicStatus.message,
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/radio/plan") {
      return sendJson(res, 200, await radio.plan(await readJson(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/radio/next") {
      return sendJson(res, 200, await radio.next(await readJson(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/radio/chat") {
      return sendJson(res, 200, await radio.chat(await readJson(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/radio/channel") {
      return sendJson(res, 200, await radio.channel(await readJson(req)));
    }

    if (req.method === "GET" && url.pathname === "/api/music/state") {
      if (typeof musicProvider.getPlaybackState !== "function") {
        return sendJson(res, 200, { ok: true, status: "idle", position: 0, duration: 0, volume: 64 });
      }
      return sendJson(res, 200, await musicProvider.getPlaybackState());
    }

    if (req.method === "GET" && url.pathname === "/api/music/search") {
      return sendJson(res, 200, {
        tracks: await musicProvider.searchTracks(url.searchParams.get("q") || ""),
      });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/music/playback/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/music/playback/", ""));
      return sendJson(res, 200, await musicProvider.getPlaybackSource(id));
    }

    if (req.method === "POST" && url.pathname === "/api/music/play") {
      if (typeof musicProvider.playTrack !== "function") {
        return sendJson(res, 400, { ok: false, reason: "Current music provider does not support direct CLI playback." });
      }
      return sendJson(res, 200, await musicProvider.playTrack(await readJson(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/music/stop") {
      if (typeof musicProvider.stopPlayback !== "function") {
        return sendJson(res, 400, { ok: false, reason: "Current music provider does not support direct CLI stop." });
      }
      return sendJson(res, 200, await musicProvider.stopPlayback());
    }

    if (req.method === "POST" && url.pathname === "/api/music/seek") {
      if (typeof musicProvider.seekPlayback !== "function") {
        return sendJson(res, 400, { ok: false, reason: "Current music provider does not support seek." });
      }
      const body = await readJson(req);
      return sendJson(res, 200, await musicProvider.seekPlayback(body.seconds));
    }

    if (req.method === "POST" && url.pathname === "/api/music/volume") {
      if (typeof musicProvider.setVolume !== "function") {
        return sendJson(res, 400, { ok: false, reason: "Current music provider does not support volume." });
      }
      const body = await readJson(req);
      return sendJson(res, 200, await musicProvider.setVolume(body.volume));
    }

    if (req.method === "POST" && url.pathname === "/api/favorites") {
      return sendJson(res, 200, { ok: true, storage: "localStorage", note: "第一版收藏由浏览器本地保存" });
    }

    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Moonlight server listening at http://localhost:${PORT}`);
});

module.exports = { server };
