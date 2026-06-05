const assert = require("node:assert/strict");
const { createTtsProvider } = require("../src/providers/tts-provider.js");

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

test("juhe tts provider reports unconfigured without a key", async () => {
  const provider = createTtsProvider({ env: { TTS_PROVIDER: "juhe", JUHE_TTS_KEY: "" } });

  assert.equal(provider.name, "juhe");
  assert.equal(provider.configured, false);
  assert.equal(provider.enabled, false);
  assert.deepEqual(await provider.speak({ text: "hello" }), {
    ok: false,
    provider: "juhe",
    reason: "Juhe TTS key is not configured.",
  });
});

test("juhe tts provider posts form data and returns audio url", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const longText = "a".repeat(510);
  const provider = createTtsProvider({
    env: {
      TTS_PROVIDER: "juhe",
      JUHE_TTS_KEY: "secret-key",
      JUHE_TTS_VOICE: "global-voice",
      JUHE_TTS_LANGUAGE: "zh",
    },
    fetch: async (url, options) => {
      requestedUrl = url;
      requestedBody = String(options.body);
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
      return {
        ok: true,
        json: async () => ({
          error_code: 0,
          result: { audio_url: "https://audio.example/dj.mp3" },
        }),
      };
    },
  });

  const result = await provider.speak({ text: longText, voice: "persona-voice" });
  const form = new URLSearchParams(requestedBody);

  assert.equal(requestedUrl, "https://gpt.juhe.cn/text2speech/generate");
  assert.equal(form.get("key"), "secret-key");
  assert.equal(form.get("text").length, 500);
  assert.equal(form.get("voice"), "persona-voice");
  assert.equal(form.get("language"), "zh");
  assert.deepEqual(result, {
    ok: true,
    provider: "juhe",
    audioUrl: "https://audio.example/dj.mp3",
    voice: "persona-voice",
    expiresInHours: 24,
  });
});

test("juhe tts provider returns structured failures", async () => {
  const provider = createTtsProvider({
    env: { TTS_PROVIDER: "juhe", JUHE_TTS_KEY: "secret-key" },
    fetch: async () => ({
      ok: true,
      json: async () => ({ error_code: 10001, reason: "bad key" }),
    }),
  });

  const result = await provider.speak({ text: "hello" });

  assert.equal(result.ok, false);
  assert.equal(result.provider, "juhe");
  assert.match(result.reason, /bad key|10001/);
});
