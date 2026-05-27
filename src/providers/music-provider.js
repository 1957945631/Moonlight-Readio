const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { TRACKS } = require("../moonlight-core.js");

function stripAnsi(value) {
  return String(value || "").replace(/\x1b\[[0-9;]*m/g, "");
}

function normalizeTrack(track, index, options = {}) {
  const id = track.id || track.neteaseId || `local-${index + 1}`;
  const generatedExternalUrl = options.generateExternalUrl
    ? `https://music.163.com/#/search/m/?s=${encodeURIComponent(`${track.title} ${track.artist || ""}`.trim())}`
    : "";
  return {
    id,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
    mood: track.mood,
    audioUrl: track.audioUrl || "",
    externalUrl: track.externalUrl || generatedExternalUrl,
    sourceLabel: track.sourceLabel || "本地曲库",
    originalId: track.originalId || "",
    encryptedId: track.encryptedId || "",
  };
}

function createLocalProvider(config = {}) {
  const tracks = (config.tracks || TRACKS).map((track, index) => normalizeTrack(track, index, {
    generateExternalUrl: Boolean(config.generateExternalUrl),
  }));
  return {
    name: "local",
    authorized: true,
    async searchTracks(query) {
      const text = String(query || "").toLowerCase();
      const matched = tracks.filter((track) =>
        `${track.title} ${track.artist} ${track.mood}`.toLowerCase().includes(text)
      );
      return matched.length ? matched : tracks.slice(0, 6);
    },
    async getTrackDetail(id) {
      return tracks.find((track) => track.id === id) || null;
    },
    async getPlaybackSource(id) {
      const track = tracks.find((item) => item.id === id);
      if (!track) return { mode: "unavailable", url: "", reason: "没有找到这首歌" };
      if (track.audioUrl) return { mode: "stream", url: track.audioUrl, reason: "本地授权音频可直接播放" };
      if (track.externalUrl) {
        return {
          mode: "external",
          url: track.externalUrl,
          reason: "当前只有外部平台链接，不能在站内直接播放",
        };
      }
      return { mode: "unavailable", url: "", reason: "没有可播放授权音频" };
    },
    async getExternalUrl(id) {
      const track = tracks.find((item) => item.id === id);
      return track ? track.externalUrl : "";
    },
    async getPlaylistSeeds() {
      return tracks.slice(0, 6);
    },
  };
}

function createNeteaseProvider(config = {}) {
  const local = createLocalProvider({ tracks: config.tracks || TRACKS, generateExternalUrl: true });
  const authorized = Boolean(config.authorized || process.env.NETEASE_AUTHORIZED === "true");
  const apiBase = config.apiBase || process.env.NETEASE_API_BASE || "";
  const apiKey = config.apiKey || process.env.NETEASE_API_KEY || "";

  async function officialRequest(pathname, init) {
    if (!authorized || !apiBase) return null;
    const response = await fetch(`${apiBase}${pathname}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(init && init.headers ? init.headers : {}),
      },
    });
    if (!response.ok) throw new Error(`NetEase request failed: ${response.status}`);
    return response.json();
  }

  return {
    name: "netease",
    authorized,
    async searchTracks(query, mood) {
      const official = await officialRequest(`/search?q=${encodeURIComponent(query || mood || "")}`).catch(() => null);
      if (official && Array.isArray(official.tracks)) {
        return official.tracks.map((track, index) => normalizeTrack({ ...track, sourceLabel: "网易云推荐" }, index, {
          generateExternalUrl: true,
        }));
      }
      const localTracks = await local.searchTracks(query || mood);
      return localTracks.map((track) => ({ ...track, sourceLabel: authorized ? "网易云候选" : "网易云外链" }));
    },
    async getTrackDetail(id) {
      const official = await officialRequest(`/tracks/${encodeURIComponent(id)}`).catch(() => null);
      return official && official.track
        ? normalizeTrack({ ...official.track, sourceLabel: "网易云推荐" }, 0, { generateExternalUrl: true })
        : local.getTrackDetail(id);
    },
    async getPlaybackSource(id) {
      const official = await officialRequest(`/playback/${encodeURIComponent(id)}`).catch(() => null);
      if (official && official.url) return { mode: "stream", url: official.url, reason: "网易云授权音频可直接播放" };
      const external = await local.getExternalUrl(id);
      return {
        mode: external ? "external" : "unavailable",
        url: external || "",
        reason: authorized ? "当前授权未返回站内播放地址" : "未配置网易云官方播放授权，只提供外部打开",
      };
    },
    async getExternalUrl(id) {
      return local.getExternalUrl(id);
    },
    async getPlaylistSeeds(profile) {
      return local.getPlaylistSeeds(profile);
    },
  };
}

function defaultCliScript() {
  return path.resolve(process.cwd(), "node_modules", "@music163", "ncm-cli", "dist", "index.js");
}

function createCliRunner(config = {}) {
  if (config.runner) return config.runner;
  const cliPath = config.cliPath || process.env.NETEASE_CLI_PATH || defaultCliScript();
  const scriptPath = cliPath.endsWith(".js") ? cliPath : defaultCliScript();
  const useNodeScript = fs.existsSync(scriptPath);
  const command = useNodeScript ? process.execPath : cliPath;
  const prefixArgs = useNodeScript ? [scriptPath] : [];

  return (args) => new Promise((resolve) => {
    childProcess.execFile(command, [...prefixArgs, ...args], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: Number(config.timeoutMs || process.env.NETEASE_CLI_TIMEOUT_MS || 20000),
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
        error: error ? error.message : "",
      });
    });
  });
}

function looksUnconfigured(result) {
  const text = `${result.stdout || ""}\n${result.stderr || ""}\n${result.error || ""}`;
  return /API key|未设置|尚未配置/i.test(text)
    || /appId:\s*\(未配置\)/i.test(text)
    || /privateKey:\s*\(未配置\)/i.test(text);
}

function parseConfigStatus(value) {
  const text = String(value || "");
  return {
    hasAppId: /appId:\s*(?!\(未配置\))\S+/i.test(text),
    hasPrivateKey: /privateKey:\s*(?!\(未配置\))\S+/i.test(text),
    hasPlayer: /player:\s*(?!\(未配置\))\S+/i.test(text),
  };
}

function parseLoginStatus(value) {
  try {
    const parsed = JSON.parse(value);
    return Boolean(parsed.success);
  } catch {
    return /已登录|success/i.test(value) && !/未登录/.test(value);
  }
}

function parseJsonTracks(value) {
  try {
    const raw = String(value || "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(jsonText);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed.tracks
        || parsed.songs
        || (parsed.data && (parsed.data.songs || parsed.data.records || parsed.data.tracks || parsed.data.resources))
        || (parsed.result && (parsed.result.songs || parsed.result.tracks));
    return Array.isArray(list) ? list : [];
  } catch {
    return null;
  }
}

function parseTextTracks(value) {
  return stripAnsi(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/搜索|keyword|Usage|Options|^\[/.test(line))
    .slice(0, 8)
    .map((line, index) => {
      const originalId = (line.match(/(?:original-id|原始id|songId|id)[\s:=：]+([0-9]+)/i) || [])[1] || "";
      const encryptedId = (line.match(/(?:encrypted-id|加密id|encryptedId)[\s:=：]+([A-Za-z0-9+/=._-]+)/i) || [])[1] || "";
      const cleaned = line
        .replace(/(?:original-id|原始id|songId|id)[\s:=：]+[0-9]+/ig, "")
        .replace(/(?:encrypted-id|加密id|encryptedId)[\s:=：]+[A-Za-z0-9+/=._-]+/ig, "")
        .replace(/^\d+[\).、\s-]*/, "")
        .trim();
      const [title, artist] = cleaned.split(/\s[-|｜]\s/);
      return {
        id: originalId ? `ncm:${originalId}` : `ncm-text-${index + 1}`,
        title: title || cleaned || `NetEase Track ${index + 1}`,
        artist: artist || "NetEase Cloud Music",
        originalId,
        encryptedId,
        externalUrl: originalId ? `https://music.163.com/#/song?id=${originalId}` : "",
        sourceLabel: "网易云 CLI",
      };
    });
}

function normalizeCliTrack(track, index) {
  const originalId = String(track.originalId || track.id || track.songId || "").replace(/^ncm:/, "");
  const encryptedId = String(track.encryptedId || track.encrypted_id || track.encrypted || (track.originalId ? track.id : "") || "");
  const artists = Array.isArray(track.artists) || Array.isArray(track.fullArtists)
    ? (track.artists || track.fullArtists).map((artist) => artist.name).filter(Boolean).join(" / ")
    : track.artists;
  return normalizeTrack({
    id: originalId ? `ncm:${originalId}` : `ncm-cli-${index + 1}`,
    title: track.title || track.name || `NetEase Track ${index + 1}`,
    artist: track.artist || artists || track.singer || "NetEase Cloud Music",
    duration: track.durationText || (Number.isFinite(track.duration) ? `${Math.floor(track.duration / 60000)}:${String(Math.floor((track.duration % 60000) / 1000)).padStart(2, "0")}` : "--"),
    mood: track.mood || "网易云音乐",
    externalUrl: track.externalUrl || (originalId ? `https://music.163.com/#/song?id=${originalId}` : ""),
    sourceLabel: "网易云 CLI",
    originalId,
    encryptedId,
  }, index, { generateExternalUrl: true });
}

function normalizeNeteaseKeyword(value) {
  const text = String(value || "").trim();
  if (!text) return "月亮";
  const preferredWords = ["月亮", "月光", "安静", "中文", "工作", "专注", "睡前", "夜晚"];
  const matched = preferredWords.filter((word) => text.includes(word));
  if (matched.includes("月亮")) return "月亮";
  if (matched.includes("月光")) return "月光";
  if (matched.length) return matched.join(" ");
  return text;
}

function parseCliPlaybackState(value) {
  try {
    const raw = String(value || "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    const state = parsed.state || parsed;
    return {
      ok: true,
      status: String(state.status || state.playback || "idle"),
      position: Number(state.position || state.currentTime || state.elapsed || 0),
      duration: Number(state.duration || state.length || 0),
      volume: Number(state.volume || 0),
      title: String(state.title || state.name || ""),
      artist: String(state.artist || state.singer || ""),
    };
  } catch {
    const text = stripAnsi(value);
    const status = /playing/i.test(text) ? "playing" : /paused/i.test(text) ? "paused" : /stopped/i.test(text) ? "stopped" : "idle";
    return {
      ok: false,
      status,
      position: 0,
      duration: 0,
      volume: 0,
      title: "",
      artist: "",
    };
  }
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function createNeteaseCliProvider(config = {}) {
  const local = createLocalProvider({ tracks: config.tracks || TRACKS, generateExternalUrl: true });
  const runCli = createCliRunner(config);
  const trackCache = new Map();

  return {
    name: "netease-cli",
    authorized: true,
    async checkStatus() {
      const [configResult, loginResult, commandsResult] = await Promise.all([
        runCli(["config", "list"]),
        runCli(["login", "--check"]),
        runCli(["commands"]),
      ]);
      const configStatus = parseConfigStatus(configResult.stdout);
      const supportsSearch = /\bsearch\b/.test(commandsResult.stdout);
      return {
        configured: configResult.ok && configStatus.hasAppId && configStatus.hasPrivateKey,
        loggedIn: parseLoginStatus(loginResult.stdout),
        playerReady: configStatus.hasPlayer,
        supportsSearch,
        message: configResult.ok ? configResult.stdout : (configResult.stderr || configResult.error),
      };
    },
    async searchTracks(query, mood) {
      const keyword = normalizeNeteaseKeyword(query || mood || "月亮");
      const commands = await runCli(["commands"]);
      if (commands.ok && !/\bsearch\b/.test(commands.stdout)) {
        const fallback = await local.searchTracks(keyword);
        return fallback.map((track) => ({ ...track, sourceLabel: "网易云 CLI 无搜索命令" }));
      }
      const result = await runCli(["search", "song", "--keyword", keyword]);
      if (!result.ok || looksUnconfigured(result)) {
        const fallback = await local.searchTracks(keyword);
        return fallback.map((track) => ({
          ...track,
          sourceLabel: looksUnconfigured(result) ? "网易云 CLI 未配置" : "网易云 CLI 不可用",
        }));
      }

      const parsed = parseJsonTracks(result.stdout);
      const tracks = parsed === null ? parseTextTracks(result.stdout).map(normalizeCliTrack) : parsed.map(normalizeCliTrack);
      if (tracks.length) {
        tracks.forEach((track) => trackCache.set(track.id, track));
        return tracks.slice(0, 6);
      }

      const fallback = await local.searchTracks(keyword);
      return fallback.map((track) => ({ ...track, sourceLabel: parsed === null ? "网易云 CLI 结果未解析" : "网易云 CLI 无匹配" }));
    },
    async getTrackDetail(id) {
      return local.getTrackDetail(id);
    },
    async getPlaybackSource(id) {
      if (String(id || "").startsWith("ncm:")) {
        const originalId = String(id).replace("ncm:", "");
        const cached = trackCache.get(id);
        if (cached && cached.encryptedId) {
          return {
            mode: "cli",
            url: `https://music.163.com/#/song?id=${originalId}`,
            originalId,
            encryptedId: cached.encryptedId,
            title: cached.title,
            artist: cached.artist,
            reason: "网易云 CLI 已接入，将通过项目内 mpv 播放。",
          };
        }
        return {
          mode: "external",
          url: `https://music.163.com/#/song?id=${originalId}`,
          reason: "网易云 CLI 已接入；网页内提供网易云打开入口，本地 CLI 播放需要 encrypted-id 后调用 play。",
        };
      }
      return local.getPlaybackSource(id);
    },
    async playTrack(track) {
      if (!track || !track.originalId || !track.encryptedId) {
        return {
          ok: false,
          reason: "CLI 播放需要 encrypted-id 和 original-id；当前搜索结果没有返回完整播放参数。",
        };
      }
      await runCli(["stop"]);
      const result = await runCli([
        "play",
        "--song",
        "--encrypted-id",
        track.encryptedId,
        "--original-id",
        track.originalId,
      ]);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const state = await runCli(["state"]);
      let isPlaying = false;
      try {
        const parsed = JSON.parse(state.stdout);
        isPlaying = parsed && parsed.state && parsed.state.status === "playing";
      } catch {
        isPlaying = /playing/i.test(state.stdout);
      }
      return {
        ok: result.ok && isPlaying,
        reason: result.ok && isPlaying ? "网易云 CLI 正在通过项目内 mpv 播放" : (result.stderr || result.error || "网易云 CLI 未能开始播放，可能是该歌曲无播放权限"),
      };
    },
    async stopPlayback() {
      const result = await runCli(["stop"]);
      return {
        ok: result.ok,
        reason: result.ok ? "网易云 CLI 已停止播放" : (result.stderr || result.error || "网易云 CLI 停止失败"),
      };
    },
    async getPlaybackState() {
      const result = await runCli(["state"]);
      const state = parseCliPlaybackState(result.stdout || result.stderr);
      return {
        ...state,
        ok: result.ok || state.status !== "idle",
        error: result.ok ? "" : (result.stderr || result.error || ""),
      };
    },
    async seekPlayback(seconds) {
      const target = String(Math.round(clampNumber(seconds, 0, 24 * 60 * 60)));
      const result = await runCli(["seek", target]);
      return {
        ok: result.ok,
        position: Number(target),
        reason: result.ok ? "Seek applied" : (result.stderr || result.error || "Seek failed"),
      };
    },
    async setVolume(level) {
      const target = String(Math.round(clampNumber(level, 0, 100)));
      const result = await runCli(["volume", target]);
      return {
        ok: result.ok,
        volume: Number(target),
        reason: result.ok ? "Volume applied" : (result.stderr || result.error || "Volume failed"),
      };
    },
    async getExternalUrl(id) {
      if (String(id || "").startsWith("ncm:")) return `https://music.163.com/#/song?id=${String(id).replace("ncm:", "")}`;
      return local.getExternalUrl(id);
    },
    async getPlaylistSeeds(profile) {
      return this.searchTracks(profile && profile.query ? profile.query : "月亮");
    },
  };
}

function createMusicProvider(config = {}) {
  const provider = config.provider || process.env.MUSIC_PROVIDER || "local";
  if (provider === "netease-cli") return createNeteaseCliProvider(config);
  if (provider === "netease") return createNeteaseProvider(config);
  return createLocalProvider(config);
}

module.exports = {
  createMusicProvider,
  createLocalProvider,
  createNeteaseProvider,
  createNeteaseCliProvider,
  parseTextTracks,
  parseCliPlaybackState,
};
