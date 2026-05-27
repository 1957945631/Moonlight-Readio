const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAiProvider } = require("../src/providers/ai-provider.js");
const { createMusicProvider } = require("../src/providers/music-provider.js");
const { createRadioService } = require("../src/radio-service.js");
const { loadEnvFile } = require("../src/env.js");

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("mock ai provider returns the radio planning contract", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const plan = await ai.plan({
    text: "今天想专注工作，避开太吵的歌",
    currentTrack: { title: "Monday Night Exhale" },
    context: { channel: "情绪回温" },
  });

  assert.equal(plan.provider, "mock");
  assert.match(plan.djText, /专注工作/);
  assert.match(plan.whyThisSong, /低刺激|专注|稳定/);
  assert.ok(plan.nextTrackQuery.length > 0);
  assert.equal(plan.queueIntent, "continue");
});

test("radio chat can answer conversationally without replacing the queue", async () => {
  let searchCalls = 0;
  const existingQueue = [
    { id: "ncm:old", title: "Old Song", artist: "Old Artist", originalId: "old", encryptedId: "enc-old" },
  ];
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          intent: "chat",
          shouldChangeQueue: false,
          djText: "我在听，你可以慢慢说。歌先不换。",
          whyThisSong: "现在更适合先陪你聊一会儿。",
          moodChannel: "私人聊天",
          strategy: "不打断播放",
          searchQueries: [],
          queueIntent: "keep",
        };
      },
    },
    musicProvider: {
      name: "netease-cli",
      authorized: true,
      async searchTracks() {
        searchCalls += 1;
        return [{ id: "ncm:new", title: "New Song", artist: "New Artist" }];
      },
      async getPlaybackSource() {
        return { mode: "cli", reason: "playable" };
      },
    },
  });

  const result = await radio.chat({
    text: "先别换歌，陪我聊一会儿",
    queue: existingQueue,
    currentTrack: existingQueue[0],
    conversation: [{ role: "dj", text: "我在。" }],
  });

  assert.equal(searchCalls, 0);
  assert.equal(result.queue[0].title, "Old Song");
  assert.equal(result.queueChanged, false);
  assert.equal(result.currentTrack.title, "Old Song");
  assert.match(result.conversation.at(-1).text, /歌先不换/);
});

test("radio chat searches multiple fresh queries and filters recently played tracks", async () => {
  const queries = [];
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          intent: "replace_queue",
          shouldChangeQueue: true,
          djText: "我给你换一批更贴近今晚的歌。",
          whyThisSong: "避开刚刚听过的，找更安静的中文歌。",
          moodChannel: "安静中文",
          strategy: "换一批",
          searchQueries: ["中文 安静 不悲伤", "华语 温柔 低速"],
          queueIntent: "replace",
        };
      },
    },
    musicProvider: {
      name: "netease-cli",
      authorized: true,
      async searchTracks(query) {
        queries.push(query);
        if (query.includes("不悲伤")) {
          return [
            { id: "ncm:played", title: "Played Song", artist: "Old" },
            { id: "ncm:a", title: "Fresh A", artist: "A", originalId: "a", encryptedId: "ea" },
          ];
        }
        return [
          { id: "ncm:a", title: "Fresh A Duplicate", artist: "A" },
          { id: "ncm:b", title: "Fresh B", artist: "B", originalId: "b", encryptedId: "eb" },
        ];
      },
      async getPlaybackSource() {
        return { mode: "cli", reason: "playable" };
      },
    },
  });

  const result = await radio.chat({
    text: "换一批中文安静但不悲伤的歌",
    recentTrackIds: ["ncm:played"],
    queue: [{ id: "ncm:old", title: "Old Song" }],
  });

  assert.deepEqual(queries, ["中文 安静 不悲伤", "华语 温柔 低速"]);
  assert.equal(result.queueChanged, true);
  assert.deepEqual(result.queue.map((track) => track.id), ["ncm:a", "ncm:b"]);
  assert.equal(result.currentTrack.title, "Fresh A");
});

test("radio chat filters external and unavailable tracks out of generated queues", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          intent: "replace_queue",
          shouldChangeQueue: true,
          djText: "我给你换一组能直接播放的。",
          whyThisSong: "只保留站内可播的歌。",
          moodChannel: "可播放队列",
          strategy: "过滤不可播",
          searchQueries: ["安静 中文"],
          queueIntent: "replace",
        };
      },
    },
    musicProvider: {
      name: "netease-cli",
      authorized: true,
      async searchTracks() {
        return [
          { id: "ncm:external", title: "External Only", artist: "A" },
          { id: "ncm:bad", title: "No Rights", artist: "B" },
          { id: "ncm:ok", title: "Playable", artist: "C", originalId: "ok", encryptedId: "enc-ok" },
        ];
      },
      async getPlaybackSource(id) {
        if (id === "ncm:external") return { mode: "external", reason: "external" };
        if (id === "ncm:bad") return { mode: "unavailable", reason: "unavailable" };
        return { mode: "cli", reason: "playable" };
      },
    },
  });

  const result = await radio.chat({ text: "换一批能播放的安静中文歌" });

  assert.equal(result.queueChanged, true);
  assert.deepEqual(result.queue.map((track) => track.title), ["Playable"]);
  assert.equal(result.currentTrack.title, "Playable");
  assert.equal(result.playback.mode, "cli");
});

test("radio chat removes duplicate title and artist results from generated queues", async () => {
  const radio = createRadioService({
    aiProvider: {
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          intent: "replace_queue",
          shouldChangeQueue: true,
          djText: "我给你换一组不重复的。",
          whyThisSong: "避免同一首歌连续出现。",
          moodChannel: "去重队列",
          strategy: "同名同歌手去重",
          searchQueries: ["温柔 陪伴"],
          queueIntent: "replace",
        };
      },
    },
    musicProvider: {
      name: "netease-cli",
      authorized: true,
      async searchTracks() {
        return [
          { id: "ncm:1", title: "温柔陪伴", artist: "A", originalId: "1", encryptedId: "e1" },
          { id: "ncm:2", title: "温柔陪伴", artist: "A", originalId: "2", encryptedId: "e2" },
          { id: "ncm:3", title: "下一首", artist: "B", originalId: "3", encryptedId: "e3" },
        ];
      },
      async getPlaybackSource() {
        return { mode: "cli", reason: "playable" };
      },
    },
  });

  const result = await radio.chat({ text: "换一批温柔陪伴的歌" });

  assert.equal(result.queueChanged, true);
  assert.deepEqual(result.queue.map((track) => `${track.title}-${track.artist}`), ["温柔陪伴-A", "下一首-B"]);
});

test("openai provider falls back to mock when api key is missing", async () => {
  const ai = createAiProvider({ provider: "openai", apiKey: "" });
  const plan = await ai.plan({ text: "累，想安静一点", currentTrack: {}, context: {} });

  assert.equal(plan.provider, "mock");
  assert.equal(plan.status, "fallback");
  assert.match(plan.djText, /累/);
});

test("openai provider can use a custom chat-compatible reverse proxy", async () => {
  const requests = [];
  const ai = createAiProvider({
    provider: "openai",
    apiKey: "test-key",
    model: "claude-sonnet-4.5",
    baseUrl: "http://16.176.195.43:3000",
    apiStyle: "chat",
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                djText: "真实反代 DJ 文案",
                whyThisSong: "因为它更安静。",
                moodChannel: "情绪回温",
                strategy: "先降噪",
                nextTrackQuery: "安静 人声",
                queueIntent: "continue",
              }),
            },
          }],
        }),
      };
    },
  });

  const plan = await ai.plan({ text: "累", currentTrack: {}, context: {} });

  assert.equal(requests[0].url, "http://16.176.195.43:3000/v1/chat/completions");
  assert.equal(JSON.parse(requests[0].options.body).model, "claude-sonnet-4.5");
  assert.equal(plan.provider, "openai");
  assert.equal(plan.djText, "真实反代 DJ 文案");
});

test("openai provider includes upstream error body when falling back", async () => {
  const ai = createAiProvider({
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "http://16.176.195.43:3000",
    apiStyle: "chat",
    fetch: async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: "channel forbidden" } }),
    }),
  });

  const plan = await ai.plan({ text: "test", currentTrack: {}, context: {} });

  assert.equal(plan.status, "fallback");
  assert.match(plan.error, /403/);
  assert.match(plan.error, /channel forbidden/);
});

test("openai provider accepts fenced json returned by chat-compatible models", async () => {
  const ai = createAiProvider({
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "http://16.176.195.43:3000",
    apiStyle: "chat",
    fetch: async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: "```json\n{\"djText\":\"代码块 DJ\",\"whyThisSong\":\"安静。\",\"moodChannel\":\"夜间慢放\",\"strategy\":\"降噪\",\"nextTrackQuery\":\"夜晚 安静\",\"queueIntent\":\"continue\"}\n```",
          },
        }],
      }),
    }),
  });

  const plan = await ai.plan({ text: "夜晚", currentTrack: {}, context: {} });

  assert.equal(plan.provider, "openai");
  assert.equal(plan.status, "ready");
  assert.equal(plan.djText, "代码块 DJ");
});

test("env loader reads .env values without overriding existing variables", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moonlight-env-"));
  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, "AI_PROVIDER=openai\nOPENAI_MODEL=claude-sonnet-4.5\nEXISTING=from-file\n", "utf8");
  const target = { EXISTING: "already-set" };

  loadEnvFile(envPath, target);

  assert.equal(target.AI_PROVIDER, "openai");
  assert.equal(target.OPENAI_MODEL, "claude-sonnet-4.5");
  assert.equal(target.EXISTING, "already-set");
});

test("music provider exposes unavailable, external, and stream playback modes", async () => {
  const local = createMusicProvider({
    provider: "local",
    tracks: [
      { id: "stream-1", title: "Owned Track", audioUrl: "audio/owned.mp3" },
      { id: "external-1", title: "Linked Track", externalUrl: "https://music.163.com/#/song?id=1" },
      { id: "silent-1", title: "Metadata Only" },
    ],
  });

  assert.deepEqual(await local.getPlaybackSource("stream-1"), {
    mode: "stream",
    url: "audio/owned.mp3",
    reason: "本地授权音频可直接播放",
  });
  assert.deepEqual(await local.getPlaybackSource("external-1"), {
    mode: "external",
    url: "https://music.163.com/#/song?id=1",
    reason: "当前只有外部平台链接，不能在站内直接播放",
  });
  assert.deepEqual(await local.getPlaybackSource("silent-1"), {
    mode: "unavailable",
    url: "",
    reason: "没有可播放授权音频",
  });
});

test("netease provider normalizes Vercel API search results", async () => {
  const requests = [];
  const provider = createMusicProvider({
    provider: "netease",
    apiBase: "https://api.example.test",
    fetch: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          result: {
            songs: [{
              id: 36392029,
              name: "日落大道",
              duration: 275434,
              artists: [{ name: "梁博" }],
              album: {
                name: "迷藏",
                picUrl: "https://image.example/cover.jpg",
              },
            }],
          },
        }),
      };
    },
  });

  const tracks = await provider.searchTracks("梁博 日落大道");

  assert.equal(requests[0], "https://api.example.test/search?keywords=%E6%A2%81%E5%8D%9A%20%E6%97%A5%E8%90%BD%E5%A4%A7%E9%81%93&type=1&limit=8");
  assert.deepEqual(tracks, [{
    id: "ncm:36392029",
    title: "日落大道",
    artist: "梁博",
    duration: "4:35",
    mood: "网易云音乐",
    audioUrl: "",
    externalUrl: "https://music.163.com/#/song?id=36392029",
    sourceLabel: "网易云推荐",
    originalId: "36392029",
    encryptedId: "",
    album: "迷藏",
    coverUrl: "https://image.example/cover.jpg",
  }]);
});

test("netease provider returns stream when Vercel API exposes a playable URL", async () => {
  const requests = [];
  const provider = createMusicProvider({
    provider: "netease",
    apiBase: "https://api.example.test/",
    realIP: "116.25.146.177",
    fetch: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          code: 200,
          data: [{
            id: 36392029,
            url: "https://m701.music.126.net/song.mp3",
            br: 128000,
            type: "mp3",
          }],
        }),
      };
    },
  });

  assert.deepEqual(await provider.getPlaybackSource("ncm:36392029"), {
    mode: "stream",
    url: "https://m701.music.126.net/song.mp3",
    reason: "网易云 API 返回可播放音频地址",
    originalId: "36392029",
    bitrate: 128000,
    type: "mp3",
  });
  assert.deepEqual(requests, [
    "https://api.example.test/song/url/v1?id=36392029&level=standard&realIP=116.25.146.177",
  ]);
});

test("netease provider falls back to external link when Vercel API returns null playback URL", async () => {
  const requests = [];
  const provider = createMusicProvider({
    provider: "netease",
    apiBase: "https://api.example.test",
    realIP: "116.25.146.177",
    fetch: async () => ({
      ok: true,
      json: async () => ({
        code: 200,
        data: [{ id: 212412, url: null, code: 404 }],
      }),
    }),
  });

  assert.deepEqual(await provider.getPlaybackSource("ncm:212412"), {
    mode: "external",
    url: "https://music.163.com/#/song?id=212412",
    reason: "网易云 API 未返回可播放地址，已降级为平台外链",
    originalId: "212412",
  });
});

test("netease provider uses match endpoint when v1 playback URL is empty", async () => {
  const requests = [];
  const provider = createMusicProvider({
    provider: "netease",
    apiBase: "https://api.example.test",
    realIP: "116.25.146.177",
    fetch: async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => {
          if (url.includes("/song/url/v1")) return { data: [{ id: 212412, url: null, code: 404 }] };
          return {
            code: 200,
            data: "https://m801.music.126.net/unblocked.flac",
            proxyUrl: "",
          };
        },
      };
    },
  });

  assert.deepEqual(await provider.getPlaybackSource("ncm:212412"), {
    mode: "stream",
    url: "https://m801.music.126.net/unblocked.flac",
    reason: "网易云 API 解灰接口返回可播放音频地址",
    originalId: "212412",
  });
  assert.deepEqual(requests, [
    "https://api.example.test/song/url/v1?id=212412&level=standard&realIP=116.25.146.177",
    "https://api.example.test/song/url/match?id=212412&level=standard&randomCNIP=true",
  ]);
});

test("netease provider preserves local fallback playback links for non-ncm tracks", async () => {
  const provider = createMusicProvider({
    provider: "netease",
    apiBase: "https://api.example.test",
    tracks: [
      {
        id: "local-fallback",
        title: "Fallback Song",
        artist: "Fallback Artist",
        externalUrl: "https://music.163.com/#/search/m/?s=Fallback%20Song",
      },
    ],
    fetch: async () => ({
      ok: true,
      json: async () => ({ result: { songs: [] } }),
    }),
  });

  const tracks = await provider.searchTracks("missing");

  assert.equal(tracks[0].id, "local-fallback");
  assert.deepEqual(await provider.getPlaybackSource(tracks[0].id), {
    mode: "external",
    url: "https://music.163.com/#/search/m/?s=Fallback%20Song",
    reason: "当前只有外部平台链接，不能在站内直接播放",
  });
});

test("netease provider reports API reachability, login, search, and playback status", async () => {
  const provider = createMusicProvider({
    provider: "netease",
    apiBase: "https://api.example.test",
    realIP: "116.25.146.177",
    fetch: async (url) => ({
      ok: true,
      json: async () => {
        if (url.includes("/login/status")) return { data: { account: null, profile: null } };
        if (url.includes("/search")) return { result: { songs: [{ id: 212412, name: "Moon" }] } };
        return { data: [{ id: 212412, url: null, code: 404 }] };
      },
    }),
  });

  const status = await provider.checkStatus();

  assert.equal(status.configured, true);
  assert.equal(status.reachable, true);
  assert.equal(status.loggedIn, false);
  assert.equal(status.supportsSearch, true);
  assert.equal(status.supportsPlaybackUrl, false);
  assert.equal(status.playerReady, false);
  assert.match(status.message, /search works/);
});

test("radio service combines ai plan with music provider status", async () => {
  const radio = createRadioService({
    aiProvider: createAiProvider({ provider: "mock" }),
    musicProvider: createMusicProvider({ provider: "netease", authorized: false }),
  });

  const result = await radio.plan({
    text: "累，想安静但不悲伤",
    state: { current: 0, likedTitles: [] },
  });

  assert.equal(result.ai.status, "ready");
  assert.equal(result.music.provider, "netease");
  assert.equal(result.music.authorized, false);
  assert.equal(result.playback.mode, "external");
  assert.match(result.ui.statusText, /AI 模拟中/);
  assert.match(result.ui.platformText, /网易云/);
});

test("radio service exposes ai fallback error for diagnostics", async () => {
  const radio = createRadioService({
    aiProvider: {
      async plan() {
        return {
          provider: "mock",
          status: "fallback",
          error: "JSON parse failed",
          djText: "fallback text",
          whyThisSong: "fallback reason",
          moodChannel: "情绪回温",
          strategy: "回退策略",
          nextTrackQuery: "安静",
        };
      },
    },
    musicProvider: createMusicProvider({ provider: "netease", authorized: false }),
  });

  const result = await radio.plan({ text: "安静", state: { current: 0, likedTitles: [] } });

  assert.equal(result.ai.error, "JSON parse failed");
});

test("netease cli provider exposes playback state, seek, and volume controls", async () => {
  const calls = [];
  const provider = createMusicProvider({
    provider: "netease-cli",
    runner: async (args) => {
      calls.push(args);
      if (args[0] === "state") {
        return {
          ok: true,
          stdout: JSON.stringify({
            state: {
              status: "playing",
              position: 42,
              duration: 180,
              volume: 63,
              title: "Moon Song",
              artist: "Moon Artist",
            },
          }),
          stderr: "",
          error: "",
        };
      }
      return { ok: true, stdout: "", stderr: "", error: "" };
    },
  });

  assert.equal(typeof provider.getPlaybackState, "function");
  assert.equal(typeof provider.seekPlayback, "function");
  assert.equal(typeof provider.setVolume, "function");

  assert.deepEqual(await provider.getPlaybackState(), {
    ok: true,
    status: "playing",
    position: 42,
    duration: 180,
    volume: 63,
    title: "Moon Song",
    artist: "Moon Artist",
    error: "",
  });

  await provider.seekPlayback(75);
  await provider.setVolume(28);

  assert.deepEqual(calls.at(-2), ["seek", "75"]);
  assert.deepEqual(calls.at(-1), ["volume", "28"]);
});

test("radio chat returns a conversational dj response with a real queue", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          djText: "我听见你今天很累了，先给你放一段安静但不下沉的中文歌。",
          whyThisSong: "先避开太重的情绪，用低速人声陪你缓一下。",
          moodChannel: "情绪回温",
          strategy: "安静中文，不悲伤",
          nextTrackQuery: "中文 安静 温柔",
          queueIntent: "replace",
        };
      },
    },
    musicProvider: {
      name: "netease-cli",
      authorized: true,
      async searchTracks() {
        return [
          {
            id: "ncm:1",
            title: "Moon Song",
            artist: "Moon Artist",
            originalId: "1",
            encryptedId: "encrypted",
            sourceLabel: "NetEase CLI",
          },
        ];
      },
      async getPlaybackSource() {
        return { mode: "cli", originalId: "1", encryptedId: "encrypted", reason: "playable" };
      },
    },
  });

  assert.equal(typeof radio.chat, "function");
  const result = await radio.chat({
    text: "我今天很累，想听中文、安静、不悲伤",
    conversation: [{ role: "dj", text: "晚上好，我在。" }],
  });

  assert.equal(result.currentTrack.title, "Moon Song");
  assert.equal(result.queue.length, 1);
  assert.equal(result.conversation.at(-2).role, "user");
  assert.equal(result.conversation.at(-1).role, "dj");
  assert.match(result.conversation.at(-1).text, /很累/);
  assert.equal(result.channel.label, "情绪回温");
});
