const DEFAULT_MODEL = "gpt-4.1-mini";

function normalizePlan(raw, fallbackText, provider, status) {
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
    djText: String(raw.djText || raw.dj_text || `收到：“${fallbackText}”。我会先把声音放轻一点。`),
    whyThisSong: String(raw.whyThisSong || raw.why_this_song || "这首更接近低刺激、稳定、不过度煽情的方向。"),
    moodChannel: String(raw.moodChannel || raw.mood_channel || "情绪回温"),
    strategy: String(raw.strategy || "先放慢，再进入今天"),
    nextTrackQuery: String(raw.nextTrackQuery || raw.next_track_query || fallbackText || "安静 温柔"),
    queueIntent: raw.queueIntent || raw.queue_intent || "continue",
    intent: raw.intent || "replace_queue",
    shouldChangeQueue: typeof raw.shouldChangeQueue === "boolean"
      ? raw.shouldChangeQueue
      : typeof raw.should_change_queue === "boolean"
        ? raw.should_change_queue
        : undefined,
    searchQueries: searchQueries.map((query) => String(query || "").trim()).filter(Boolean).slice(0, 5),
    hostQuestion: String(raw.hostQuestion || raw.host_question || ""),
    avoidRules: Array.isArray(raw.avoidRules || raw.avoid_rules) ? (raw.avoidRules || raw.avoid_rules) : [],
    trackIntro: String(raw.trackIntro || raw.track_intro || ""),
  };
}

function createMockPlan(input, status = "ready") {
  const text = input.text || "默认播出";
  const focus = /工作|专注|代码/.test(text);
  const night = /睡|夜|慢/.test(text);
  const chinese = /中文|熟悉/.test(text);
  const moodChannel = focus ? "深度工作" : night ? "夜间慢放" : chinese ? "温柔中文" : "情绪回温";
  const nextTrackQuery = focus ? "电子 低干扰 专注" : night ? "夜间 慢速 柔和" : chinese ? "中文 温柔 人声" : "安静 低刺激 温柔";
  const wantsNoChange = /别换|不要换|先不换|聊会|聊天|为什么|解释/.test(text);

  return {
    provider: "mock",
    status,
    djText: wantsNoChange
      ? `我在听：“${text}”。歌先不换，你慢慢说。`
      : `收到：“${text}”。我会按你的状态重新排一段，先不让音乐抢走注意力。`,
    whyThisSong: `因为你提到“${text}”，Moonlight 会优先选择低刺激、情绪稳定、不过度煽情的声音。`,
    moodChannel,
    strategy: focus ? "保留节奏，减少打扰" : "先放慢，再贴近你的状态",
    nextTrackQuery,
    queueIntent: wantsNoChange ? "keep" : "continue",
    intent: wantsNoChange ? "chat" : "replace_queue",
    shouldChangeQueue: !wantsNoChange,
    searchQueries: [text, nextTrackQuery].filter(Boolean),
    hostQuestion: wantsNoChange ? "想继续聊刚才那件事，还是我轻轻陪你听着？" : "",
    avoidRules: [],
    trackIntro: "",
  };
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
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  const baseUrl = (config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, "");
  const apiStyle = config.apiStyle || process.env.OPENAI_API_STYLE || "responses";
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
      const model = config.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
      const systemPrompt = [
        "你是 Moonlight 私人音乐电台女 DJ，像熟悉的老朋友一样和用户说话。",
        "你不是机械歌单生成器。先判断用户意图：普通聊天、解释当前歌、补充状态、换歌单、点歌、避开某类音乐。",
        "普通聊天或用户明确说别换歌时，不要换队列，shouldChangeQueue=false，intent=chat。",
        "只有用户想听某类歌、换一批、避开某类歌、切频道或点歌时，才 shouldChangeQueue=true。",
        "需要换歌时，searchQueries 必须给 3-5 个短中文搜索词，优先保留用户原始中文，不要全部改英文。",
        "回复要自然、温柔、克制，不要分条说明。",
        "只返回 JSON，不要 Markdown。",
        "字段：intent, shouldChangeQueue, djText, whyThisSong, moodChannel, strategy, searchQueries, nextTrackQuery, queueIntent, hostQuestion, avoidRules, trackIntro。",
      ].join("\n");
      const userPrompt = JSON.stringify({
        userText: input.text,
        currentTrack: input.currentTrack,
        context: input.context,
      });
      const responsesPayload = {
        model: config.model || process.env.OPENAI_MODEL || DEFAULT_MODEL,
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
              required: ["intent", "shouldChangeQueue", "djText", "whyThisSong", "moodChannel", "strategy", "searchQueries", "nextTrackQuery", "queueIntent", "hostQuestion", "avoidRules", "trackIntro"],
              properties: {
                intent: { type: "string" },
                shouldChangeQueue: { type: "boolean" },
                djText: { type: "string" },
                whyThisSong: { type: "string" },
                moodChannel: { type: "string" },
                strategy: { type: "string" },
                searchQueries: { type: "array", items: { type: "string" } },
                nextTrackQuery: { type: "string" },
                queueIntent: { type: "string" },
                hostQuestion: { type: "string" },
                avoidRules: { type: "array", items: { type: "string" } },
                trackIntro: { type: "string" },
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
        if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
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
  const provider = config.provider || process.env.AI_PROVIDER || "mock";
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
