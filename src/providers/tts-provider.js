const JUHE_TTS_ENDPOINT = "https://gpt.juhe.cn/text2speech/generate";
const MAX_TTS_TEXT_LENGTH = 500;

function getRuntimeEnv(config = {}) {
  return config.env || (typeof process !== "undefined" && process.env ? process.env : {});
}

function asCleanString(value) {
  return String(value || "").trim();
}

function createDisabledProvider(provider) {
  return {
    name: provider || "none",
    configured: false,
    enabled: false,
    async speak() {
      return {
        ok: false,
        provider: provider || "none",
        reason: "TTS provider is not enabled.",
      };
    },
  };
}

function createJuheProvider(config = {}) {
  const env = getRuntimeEnv(config);
  const apiKey = asCleanString(config.apiKey || env.JUHE_TTS_KEY);
  const defaultVoice = asCleanString(config.voice || env.JUHE_TTS_VOICE);
  const language = asCleanString(config.language || env.JUHE_TTS_LANGUAGE || "zh");
  const requestFetch = config.fetch || fetch;
  const configured = Boolean(apiKey);

  return {
    name: "juhe",
    configured,
    enabled: configured,
    async speak(input = {}) {
      if (!configured) {
        return {
          ok: false,
          provider: "juhe",
          reason: "Juhe TTS key is not configured.",
        };
      }

      const text = asCleanString(input.text).slice(0, MAX_TTS_TEXT_LENGTH);
      if (!text) {
        return {
          ok: false,
          provider: "juhe",
          reason: "TTS text is empty.",
        };
      }

      const voice = asCleanString(input.voice) || defaultVoice;
      const body = new URLSearchParams();
      body.set("key", apiKey);
      body.set("text", text);
      if (voice) body.set("voice", voice);
      if (language) body.set("language", language);

      try {
        const response = await requestFetch(JUHE_TTS_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });
        if (!response.ok) {
          return {
            ok: false,
            provider: "juhe",
            reason: `Juhe TTS request failed: ${response.status}`,
          };
        }

        const data = await response.json();
        const audioUrl = data && data.result && data.result.audio_url;
        if (Number(data && data.error_code) === 0 && audioUrl) {
          return {
            ok: true,
            provider: "juhe",
            audioUrl: String(audioUrl),
            voice,
            expiresInHours: 24,
          };
        }

        return {
          ok: false,
          provider: "juhe",
          reason: String((data && (data.reason || data.error || data.message)) || `Juhe TTS error ${data && data.error_code}`),
        };
      } catch (error) {
        return {
          ok: false,
          provider: "juhe",
          reason: error.message || "Juhe TTS request failed.",
        };
      }
    },
  };
}

function createTtsProvider(config = {}) {
  const env = getRuntimeEnv(config);
  const provider = config.provider || env.TTS_PROVIDER || (env.JUHE_TTS_KEY ? "juhe" : "none");
  if (provider === "juhe") return createJuheProvider(config);
  return createDisabledProvider(provider);
}

module.exports = {
  createTtsProvider,
  JUHE_TTS_ENDPOINT,
  MAX_TTS_TEXT_LENGTH,
};
