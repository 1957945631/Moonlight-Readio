const assert = require("node:assert/strict");
const { createApiServices, handleApiRequest } = require("../src/api-handler.js");

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

test("api handler reports status using env-backed providers", async () => {
  const personaRegistry = new Map([["test-dj", {
    id: "test-dj",
    name: "测试 DJ",
    description: "测试人格",
  }]]);
  const services = createApiServices({
    AI_PROVIDER: "mock",
    MUSIC_PROVIDER: "netease",
    NETEASE_API_BASE: "https://api.example.test",
    TTS_PROVIDER: "juhe",
    JUHE_TTS_KEY: "tts-secret",
  }, {
    personaRegistry,
    musicFetch: async (url) => ({
      ok: true,
      json: async () => {
        if (url.includes("/login/status")) return { data: { account: null, profile: null } };
        if (url.includes("/search")) return { result: { songs: [{ id: 212412, name: "Moon" }] } };
        return { data: [{ id: 212412, url: null, code: 404 }] };
      },
    }),
  });

  const response = await handleApiRequest(new Request("https://moonlight.test/api/status"), services);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ai.provider, "mock");
  assert.equal(body.music.provider, "netease");
  assert.equal(body.music.authorized, true);
  assert.equal(body.music.configured, true);
  assert.equal(body.music.reachable, true);
  assert.equal(body.music.loggedIn, false);
  assert.equal(body.music.supportsSearch, true);
  assert.equal(body.music.supportsPlaybackUrl, false);
  assert.deepEqual(body.tts, {
    provider: "juhe",
    configured: true,
    enabled: true,
  });
  assert.deepEqual(body.dj.personas, [{
    id: "test-dj",
    name: "测试 DJ",
    description: "测试人格",
  }]);
});

test("api handler can synthesize dj speech through tts route", async () => {
  let requestedBody = "";
  const personaRegistry = new Map([["test-dj", {
    id: "test-dj",
    name: "Test DJ",
    description: "Test persona",
    voice: { ttsVoice: "persona-voice" },
  }]]);
  const services = createApiServices({
    AI_PROVIDER: "mock",
    MUSIC_PROVIDER: "local",
    TTS_PROVIDER: "juhe",
    JUHE_TTS_KEY: "tts-secret",
  }, {
    personaRegistry,
    ttsFetch: async (url, options) => {
      requestedBody = String(options.body);
      return {
        ok: true,
        json: async () => ({
          error_code: 0,
          result: { audio_url: "https://audio.example/dj.mp3" },
        }),
      };
    },
  });

  const response = await handleApiRequest(new Request("https://moonlight.test/api/tts/speak", {
    method: "POST",
    body: JSON.stringify({ text: "hello", personaId: "test-dj" }),
  }), services);
  const body = await response.json();
  const form = new URLSearchParams(requestedBody);

  assert.equal(response.status, 200);
  assert.equal(form.get("voice"), "persona-voice");
  assert.deepEqual(body, {
    ok: true,
    provider: "juhe",
    audioUrl: "https://audio.example/dj.mp3",
    voice: "persona-voice",
    expiresInHours: 24,
  });
});

test("api handler returns structured tts failure when key is missing", async () => {
  const services = createApiServices({
    AI_PROVIDER: "mock",
    MUSIC_PROVIDER: "local",
    TTS_PROVIDER: "juhe",
    JUHE_TTS_KEY: "",
  });

  const response = await handleApiRequest(new Request("https://moonlight.test/api/tts/speak", {
    method: "POST",
    body: JSON.stringify({ text: "hello" }),
  }), services);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.provider, "juhe");
  assert.match(body.reason, /not configured/);
});

test("api handler returns null for non-api routes", async () => {
  const services = createApiServices({ AI_PROVIDER: "mock", MUSIC_PROVIDER: "local" });

  const response = await handleApiRequest(new Request("https://moonlight.test/"), services);

  assert.equal(response, null);
});

test("api handler can return NetEase API search results through music search route", async () => {
  const services = createApiServices({
    AI_PROVIDER: "mock",
    MUSIC_PROVIDER: "netease",
    NETEASE_API_BASE: "https://api.example.test",
  }, {
    musicFetch: async () => ({
      ok: true,
      json: async () => ({
        result: {
          songs: [{
            id: 212412,
            name: "月亮",
            duration: 281893,
            artists: [{ name: "陈慧娴" }],
            album: { name: "归来吧" },
          }],
        },
      }),
    }),
  });

  const response = await handleApiRequest(new Request("https://moonlight.test/api/music/search?q=%E6%9C%88%E4%BA%AE"), services);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.tracks[0].id, "ncm:212412");
  assert.equal(body.tracks[0].title, "月亮");
});
