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
  const services = createApiServices({
    AI_PROVIDER: "mock",
    MUSIC_PROVIDER: "netease",
    NETEASE_API_BASE: "https://api.example.test",
  }, {
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
