const { composeSystemPrompt, composeUserPrompt } = require("../dj/prompt-composer.js");

const DEFAULT_MODEL = "gpt-4.1-mini";

function getRuntimeEnv(config = {}) {
  return config.env || (typeof process !== "undefined" && process.env ? process.env : {});
}

function normalizePlan(raw, fallbackText, provider, status) {
  const queueChanged = typeof raw.queueChanged === "boolean"
    ? raw.queueChanged
    : typeof raw.shouldChangeQueue === "boolean"
      ? raw.shouldChangeQueue
      : typeof raw.should_change_queue === "boolean"
        ? raw.should_change_queue
        : undefined;
  const musicIntent = String(raw.musicIntent || raw.music_intent || raw.intent || "refresh_queue");
  const reply = String(raw.reply || raw.djText || raw.dj_text || `收到：“${fallbackText}”。我会先把声音放轻一点。`);
  const mood = String(raw.mood || raw.moodChannel || raw.mood_channel || "情绪回温");
  const djDirection = String(raw.djDirection || raw.dj_direction || raw.strategy || "先放慢，再进入今天");
  const searchQueries = Array.isArray(raw.searchQueries)
    ? raw.searchQueries
    : Array.isArray(raw.search_queries)
      ? raw.search_queries
      : raw.nextTrackQuery || raw.next_track_query
        ? [raw.nextTrackQuery || raw.next_track_query]
        : [fallbackText || "安静 温柔"];
  return {
    provider,
    status,
    reply,
    djText: reply,
    whyThisSong: String(raw.whyThisSong || raw.why_this_song || "这首更接近低刺激、稳定、不过度煽情的方向。"),
    mood,
    moodChannel: mood,
    djDirection,
    strategy: djDirection,
    nextTrackQuery: String(raw.nextTrackQuery || raw.next_track_query || fallbackText || "安静 温柔"),
    queueIntent: raw.queueIntent || raw.queue_intent || "continue",
    musicIntent,
    intent: musicIntent,
    queueChanged,
    shouldChangeQueue: queueChanged,
    searchQueries: searchQueries.map((query) => String(query || "").trim()).filter(Boolean).slice(0, 5),
    hostQuestion: String(raw.hostQuestion || raw.host_question || ""),
    avoidRules: Array.isArray(raw.avoidRules || raw.avoid_rules) ? (raw.avoidRules || raw.avoid_rules) : [],
    trackIntro: String(raw.trackIntro || raw.track_intro || ""),
    persona: raw.persona || "",
  };
}

function createMockPlan(input, status = "ready") {
  const text = input.text || "默认播出";
  const persona = input.persona || null;
  const focus = /工作|专注|代码/.test(text);
  const night = /睡|夜|慢/.test(text);
  const chinese = /中文|熟悉/.test(text);
  const mood = focus ? "深度工作" : night ? "夜间慢放" : chinese ? "温柔中文" : "情绪回温";
  const taste = persona && persona.musicTaste ? persona.musicTaste : {};
  const tasteKeywords = Array.isArray(taste.keywords) ? taste.keywords : [];
  const nextTrackQuery = tasteKeywords.length >= 2
    ? tasteKeywords.slice(0, 2).join(" ")
    : tasteKeywords[0] || (focus ? "电子 低干扰 专注" : night ? "夜间 慢速 柔和" : chinese ? "中文 温柔 人声" : "安静 低刺激 温柔");
  const wantsNoChange = /别换|不要换|先不换|聊会|聊天|为什么|解释/.test(text);
  const personaPrefix = persona && persona.name ? `${persona.name}：` : "";
  const arrangement = taste.arrangementStyle || (focus ? "保留节奏，减少打扰" : "先放慢，再贴近你的状态");
  const exampleReply = findExampleReply(persona, text);
  const baseReply = exampleReply || (wantsNoChange
    ? `我在听：“${text}”。歌先不换，你慢慢说。`
    : `收到：“${text}”。我会按这个状态重新排一段，先不让音乐抢走注意力。`);
  const reply = `${personaPrefix}${baseReply}`;
  const selectorName = persona && persona.name ? persona.name : "Moonlight";
  const tasteReason = taste.philosophy || taste.arrangementStyle || "低刺激、情绪稳定、不过度煽情的声音";

  return {
    provider: "mock",
    status,
    reply,
    djText: reply,
    whyThisSong: `因为你提到“${text}”，${selectorName} 会优先选择${tasteReason}。`,
    mood,
    moodChannel: mood,
    djDirection: arrangement,
    strategy: arrangement,
    nextTrackQuery,
    queueIntent: wantsNoChange ? "keep" : "continue",
    musicIntent: wantsNoChange ? "chat_only" : "refresh_queue",
    intent: wantsNoChange ? "chat_only" : "refresh_queue",
    queueChanged: !wantsNoChange,
    shouldChangeQueue: !wantsNoChange,
    searchQueries: [text, nextTrackQuery, ...tasteKeywords].filter(Boolean).slice(0, 5),
    hostQuestion: wantsNoChange ? "想继续聊刚才那件事，还是我轻轻陪你听着？" : "",
    avoidRules: [],
    trackIntro: "",
    persona: persona ? persona.id : "",
  };
}

function findExampleReply(persona, text) {
  const examples = persona && Array.isArray(persona.examples) ? persona.examples : [];
  const value = String(text || "");
  const matched = examples.find((example) => {
    const user = String((example && example.user) || "").trim();
    return user && (value.includes(user) || user.includes(value));
  }) || examples.find((example) => {
    const user = String((example && example.user) || "").trim();
    if (!user) return false;
    const chars = Array.from(new Set(user.replace(/[，。！？、\s]/g, "")));
    if (!chars.length) return false;
    const hits = chars.filter((char) => value.includes(char)).length;
    return hits / chars.length >= 0.6;
  });
  return matched && matched.reply ? String(matched.reply).trim() : "";
}

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  if (Array.isArray(response.choices)) {
    const content = response.choices[0] && response.choices[0].message && response.choices[0].message.content;
    return typeof content === "string" ? content : "";
  }
  const message = Array.isArray(response.output) ? response.output.find((item) => item.type === "message") : null;
  const textPart = message && Array.isArray(message.content)
    ? message.content.find((part) => part.type === "output_text" || part.type === "text")
    : null;
  return textPart ? textPart.text : "";
}

function parseJsonOutput(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return JSON.parse(fenced[1]);
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw error;
  }
}

function createOpenAiProvider(config) {
  const env = getRuntimeEnv(config);
  const apiKey = config.apiKey || env.OPENAI_API_KEY;
  const baseUrl = (config.baseUrl || env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  const apiStyle = config.apiStyle || env.OPENAI_API_STYLE || "responses";
  const requestFetch = config.fetch || fetch;
  if (!apiKey) {
    return {
      name: "openai",
      async plan(input) {
        return createMockPlan(input, "fallback");
      },
    };
  }

  return {
    name: "openai",
    async plan(input) {
      const model = config.model || env.OPENAI_MODEL || DEFAULT_MODEL;
      const systemPrompt = composeSystemPrompt(input.persona);
      const userPrompt = composeUserPrompt(input);
      const responsesPayload = {
        model: config.model || env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "moonlight_radio_plan",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "queueChanged", "musicIntent", "mood", "djDirection", "searchQueries", "hostQuestion", "avoidRules", "trackIntro", "persona"],
              properties: {
                reply: { type: "string" },
                queueChanged: { type: "boolean" },
                musicIntent: { type: "string" },
                mood: { type: "string" },
                djDirection: { type: "string" },
                searchQueries: { type: "array", items: { type: "string" } },
                hostQuestion: { type: "string" },
                avoidRules: { type: "array", items: { type: "string" } },
                trackIntro: { type: "string" },
                persona: { type: "string" },
              },
            },
          },
        },
      };
      const chatPayload = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };
      const endpoint = apiStyle === "chat" ? "/v1/chat/completions" : "/v1/responses";
      const payload = apiStyle === "chat" ? chatPayload : responsesPayload;

      try {
        const response = await requestFetch(`${baseUrl}${endpoint}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          const details = errorText ? ` ${errorText.slice(0, 300)}` : "";
          throw new Error(`OpenAI request failed: ${response.status}${details}`);
        }
        const data = await response.json();
        const parsed = parseJsonOutput(extractOutputText(data));
        return normalizePlan(parsed, input.text, "openai", "ready");
      } catch (error) {
        const fallback = createMockPlan(input, "fallback");
        return { ...fallback, error: error.message };
      }
    },
  };
}

function createAiProvider(config = {}) {
  const env = getRuntimeEnv(config);
  const provider = config.provider || env.AI_PROVIDER || "mock";
  if (provider === "openai") return createOpenAiProvider(config);
  if (provider === "domestic") {
    return {
      name: "domestic",
      async plan(input) {
        return { ...createMockPlan(input, "fallback"), provider: "domestic" };
      },
    };
  }
  return {
    name: "mock",
    async plan(input) {
      return createMockPlan(input);
    },
  };
}

module.exports = {
  createAiProvider,
  createMockPlan,
  parseJsonOutput,
  normalizePlan,
};
