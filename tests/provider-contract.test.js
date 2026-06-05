const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAiProvider } = require("../src/providers/ai-provider.js");
const { createMusicProvider } = require("../src/providers/music-provider.js");
const { createRadioService } = require("../src/radio-service.js");
const { loadEnvFile } = require("../src/env.js");
const {
  composeSystemPrompt,
  composeUserPrompt,
  composeExpressionSystemPrompt,
  composeExpressionUserPrompt,
  composeMusicSystemPrompt,
  composeMusicUserPrompt,
} = require("../src/dj/prompt-composer.js");
const { loadPersonas, resolvePersona } = require("../src/dj/persona-registry.js");

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

test("dj persona registry loads packages and keeps empty defaults explicit", () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "moonlight-empty-personas-"));
  assert.equal(loadPersonas(emptyDir).size, 0);
  assert.equal(resolvePersona(loadPersonas(emptyDir), "missing"), null);

  const bundled = loadPersonas();
  assert.equal(resolvePersona(bundled, "luoyonghao").name, "罗永浩");
  assert.equal(resolvePersona(bundled, "luoyonghao-perspective"), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moonlight-personas-"));
  fs.writeFileSync(path.join(dir, "test-dj.js"), [
    "module.exports = {",
    "  id: 'test-dj',",
    "  name: '测试 DJ',",
    "  description: '测试人格',",
    "  identity: '我是测试 DJ。',",
    "  expression: '短句，直接。',",
    "  musicTaste: { keywords: ['华语 独立'], arrangementStyle: '独立、松弛' },",
    "};",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(dir, "invalid.js"), "module.exports = { name: 'missing id' };\n", "utf8");
  fs.writeFileSync(path.join(dir, "broken.js"), "module.exports = ;\n", "utf8");
  const registry = loadPersonas(dir);
  assert.equal(registry.size, 1);
  assert.equal(resolvePersona(registry, "test-dj").name, "测试 DJ");
});

test("prompt composer combines base protocol and persona music taste", () => {
  const persona = {
    id: "test-dj",
    name: "测试 DJ",
    identity: "我是测试 DJ。",
    expression: "短句，直接。",
    mentalModels: [
      { name: "体面人框架", description: "先判断这事体不体面，再决定怎么说。" },
    ],
    decisionHeuristics: [
      "先判断是否体面，再看是否认真。",
    ],
    expressionDNA: {
      sentenceStyle: "短句为主，结论先行。",
      tone: "高确定性，少铺垫。",
      vocabulary: "体面、认真、别装。",
      rhythm: "先抛核心判断再展开。",
      humor: "克制自嘲。",
    },
    examples: [{ user: "有点累", reply: "先把频道压低一点。" }],
    musicTaste: {
      philosophy: "真诚。",
      preferred: ["华语独立"],
      avoided: ["短视频热歌"],
      keywords: ["华语 独立"],
      arrangementStyle: "独立、松弛",
    },
  };

  const systemPrompt = composeSystemPrompt(persona);
  const userPrompt = JSON.parse(composeUserPrompt({ text: "累", persona }));

  assert.match(systemPrompt, /队列控制规则/);
  assert.match(systemPrompt, /三件事/);
  assert.match(systemPrompt, /作为一个 AI/);
  assert.match(systemPrompt, /reply/);
  assert.match(systemPrompt, /我是测试 DJ/);
  assert.ok(systemPrompt.indexOf("## 你的身份") < systemPrompt.indexOf("Moonlight 私人音乐电台的 DJ 操作系统"));
  assert.match(systemPrompt, /核心思维方式/);
  assert.match(systemPrompt, /体面人框架/);
  assert.match(systemPrompt, /判断原则/);
  assert.match(systemPrompt, /表达 DNA/);
  assert.match(systemPrompt, /当前 DJ 人格约束/);
  assert.match(systemPrompt, /reply、trackIntro、djDirection、searchQueries/);
  assert.match(systemPrompt, /硬性要求：生成 searchQueries 时必须优先使用以上偏好风格中的关键词/);
  assert.match(systemPrompt, /华语独立/);
  assert.deepEqual(userPrompt.musicTaste.keywords, ["华语 独立"]);
  assert.deepEqual(userPrompt.personaStyle.expressionDNA, persona.expressionDNA);
  assert.deepEqual(userPrompt.personaStyle.mentalModels, persona.mentalModels);
  assert.deepEqual(userPrompt.personaStyle.decisionHeuristics, persona.decisionHeuristics);
  assert.deepEqual(userPrompt.personaStyle.examples, persona.examples);
});

test("prompt composer splits expression and music prompts by responsibility", () => {
  const persona = {
    id: "split-dj",
    name: "拆分 DJ",
    identity: "我是拆分 DJ。",
    expression: "短句，先说结论。",
    expressionDNA: {
      rhythm: "先给判断，再落到安排。",
      tone: "直接。",
    },
    musicTaste: {
      philosophy: "真诚、有态度。",
      preferred: ["华语独立"],
      avoided: ["短视频热歌"],
      keywords: ["华语 独立", "中文 民谣"],
      arrangementStyle: "先留空间，再推进。",
    },
  };

  const expressionSystem = composeExpressionSystemPrompt(persona);
  const musicSystem = composeMusicSystemPrompt(persona);
  const expressionUser = JSON.parse(composeExpressionUserPrompt({
    text: "有点累",
    currentTrack: { title: "Old Song" },
    context: { channel: "夜间慢放", conversation: [] },
    persona,
  }));
  const musicUser = JSON.parse(composeMusicUserPrompt({
    text: "有点累",
    currentTrack: { title: "Old Song" },
    context: { channel: "夜间慢放", likedTitles: [] },
    persona,
  }));

  assert.match(expressionSystem, /我是拆分 DJ/);
  assert.match(expressionSystem, /表达 DNA/);
  assert.doesNotMatch(expressionSystem, /queueChanged/);
  assert.match(musicSystem, /queueChanged/);
  assert.doesNotMatch(expressionSystem, /音乐审美/);
  assert.doesNotMatch(expressionSystem, /searchQueries/);
  assert.match(musicSystem, /音乐编排引擎/);
  assert.match(musicSystem, /华语 独立/);
  assert.match(musicSystem, /searchQueries/);
  assert.doesNotMatch(musicSystem, /表达 DNA/);
  assert.doesNotMatch(musicSystem, /我是拆分 DJ/);
  assert.equal(expressionUser.userText, "有点累");
  assert.equal(expressionUser.personaStyle.expression, "短句，先说结论。");
  assert.deepEqual(musicUser.musicTaste.keywords, ["华语 独立", "中文 民谣"]);
});

test("mock ai provider adapts copy from generic persona data", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const persona = {
    id: "test-dj",
    name: "测试 DJ",
    expression: "短句，直接。",
    musicTaste: {
      keywords: ["华语 独立"],
      arrangementStyle: "独立、松弛",
    },
  };
  const plan = await ai.plan({
    text: "今天想专注工作，避开太吵的歌",
    currentTrack: { title: "Monday Night Exhale" },
    context: { channel: "深度陪伴" },
    persona,
  });

  assert.match(plan.reply, /测试 DJ/);
  assert.deepEqual(plan.searchQueries.slice(-1), ["华语 独立"]);
  assert.match(plan.djDirection, /独立、松弛/);
  assert.equal(plan.shouldChangeQueue, true);
});

test("mock ai provider uses persona music taste keywords for search queries", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const persona = {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      keywords: [
        "华语 独立 摇滚 态度",
        "中文 民谣 真诚 不煽情",
        "城市 夜晚 独立 华语",
        "华语 创作 低速 有表达",
        "独立 民谣 城市",
      ],
    },
  };

  const plan = await ai.plan({ text: "换一批", persona });

  assert.equal(plan.nextTrackQuery, "华语 独立 摇滚 态度 中文 民谣 真诚 不煽情");
  assert.deepEqual(plan.searchQueries, [
    "换一批",
    "华语 独立 摇滚 态度 中文 民谣 真诚 不煽情",
    "华语 独立 摇滚 态度",
    "中文 民谣 真诚 不煽情",
    "城市 夜晚 独立 华语",
    "华语 创作 低速 有表达",
    "独立 民谣 城市",
  ]);
  assert.equal(plan.searchQueries.length, 7);
});

test("mock ai provider does not expose persona expression dna as user copy", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const persona = {
    id: "meta-dj",
    name: "元指令 DJ",
    expressionDNA: {
      rhythm: "先给核心判断，再解释原因，最后落到具体音乐安排。",
      tone: "高确定性，少铺垫。",
      vocabulary: "体面、认真、别装。",
    },
    musicTaste: {
      philosophy: "真诚但不煽情",
      arrangementStyle: "先留空间，再慢慢推进",
      keywords: ["华语 独立"],
    },
  };

  const plan = await ai.plan({ text: "换一组", persona });

  assert.doesNotMatch(plan.reply, /先给核心判断/);
  assert.doesNotMatch(plan.reply, /高确定性/);
  assert.doesNotMatch(plan.reply, /体面、认真、别装/);
  assert.match(plan.reply, /真诚但不煽情|先留空间/);
});

test("mock ai provider uses persona examples without stiff catchphrase suffixes", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const persona = {
    id: "example-dj",
    name: "示例 DJ",
    catchphrases: "认真、体面、底线。",
    examples: [
      { user: "有点累", reply: "先说结论，歌不用猛。把频道压低一点。" },
    ],
    musicTaste: {
      keywords: ["华语 独立"],
    },
  };

  const plan = await ai.plan({ text: "今天有点累，别太吵", persona });

  assert.match(plan.reply, /先说结论，歌不用猛/);
  assert.doesNotMatch(plan.reply, /认真。$/);
});

test("mock ai provider explains song choice from persona music taste", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const persona = {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      philosophy: "好音乐要真诚、有态度，不能只有流量感。",
      arrangementStyle: "有态度的华语独立和民谣为主。",
      keywords: ["华语 独立"],
    },
  };

  const plan = await ai.plan({ text: "我想听摇滚", persona });

  assert.match(plan.whyThisSong, /品味 DJ/);
  assert.match(plan.whyThisSong, /真诚、有态度/);
  assert.doesNotMatch(plan.whyThisSong, /Moonlight/);
  assert.doesNotMatch(plan.whyThisSong, /低刺激、情绪稳定、不过度煽情/);
});

test("mock ai provider varies fallback copy by generic persona fields", async () => {
  const ai = createAiProvider({ provider: "mock" });
  const directPersona = {
    id: "direct-dj",
    name: "直接 DJ",
    decisionHeuristics: ["先给判断，再解释原因。"],
    expressionDNA: {
      rhythm: "先说结论，再落到具体安排。",
      tone: "直接，少铺垫。",
      vocabulary: "判断、具体、别绕。",
    },
    musicTaste: {
      philosophy: "好音乐要有判断和骨头。",
      keywords: ["独立 摇滚"],
    },
  };
  const softPersona = {
    id: "soft-dj",
    name: "柔和 DJ",
    decisionHeuristics: ["先接住情绪，再慢慢解释。"],
    expressionDNA: {
      rhythm: "先安放情绪，再轻轻推进。",
      tone: "柔和，留白。",
      vocabulary: "安静、缓慢、陪伴。",
    },
    musicTaste: {
      philosophy: "好音乐要轻柔、有空间。",
      keywords: ["氛围 民谣"],
    },
  };

  const direct = await ai.plan({ text: "我想听点新的", persona: directPersona });
  const soft = await ai.plan({ text: "我想听点新的", persona: softPersona });

  assert.notEqual(direct.reply, soft.reply);
  assert.match(direct.reply, /先说结论|先给判断|判断/);
  assert.match(soft.reply, /先接住情绪|安放情绪|柔和/);
  assert.notDeepEqual(direct.searchQueries, soft.searchQueries);
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

test("radio chat asks expression stage for conversational replies without replacing the queue", async () => {
  let searchCalls = 0;
  let expressionInput = null;
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
          intent: "chat_only",
          musicIntent: "chat_only",
          shouldChangeQueue: false,
          queueChanged: false,
          reply: "Received draft text that should not be shown.",
          djText: "Received draft text that should not be shown.",
          moodChannel: "私人聊天",
          strategy: "只聊天，不换歌",
          searchQueries: [],
          queueIntent: "keep",
        };
      },
      async express(input) {
        expressionInput = input;
        return {
          provider: "mock",
          status: "ready",
          reply: "我喜欢真诚、有表达的音乐，不是糊弄耳朵的东西。",
          djText: "我喜欢真诚、有表达的音乐，不是糊弄耳朵的东西。",
          whyThisSong: "",
          mood: "私人聊天",
          moodChannel: "私人聊天",
          djDirection: "只聊天，不换歌",
          strategy: "只聊天，不换歌",
          hostQuestion: "你想按这个方向听几首吗？",
          trackIntro: "",
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
    text: "你喜欢什么音乐",
    queue: existingQueue,
    currentTrack: existingQueue[0],
  });

  assert.equal(searchCalls, 0);
  assert.ok(expressionInput);
  assert.equal(expressionInput.plan.musicIntent, "chat_only");
  assert.equal(expressionInput.queue[0].title, "Old Song");
  assert.equal(result.queueChanged, false);
  assert.equal(result.queue[0].title, "Old Song");
  assert.match(result.dj.text, /真诚、有表达/);
  assert.doesNotMatch(result.dj.text, /Received draft/);
  assert.match(result.conversation.at(-1).text, /真诚、有表达/);
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

test("radio service hides local startup tracks from remote ai context", async () => {
  let receivedInput;
  const startupQueue = [
    { id: "local-1", title: "Monday Night Exhale", artist: "Moonlight" },
    { id: "local-2", title: "Fade Into You", artist: "Mazzy Star" },
  ];
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan(input) {
        receivedInput = input;
        return {
          provider: "mock",
          status: "ready",
          intent: "chat",
          shouldChangeQueue: false,
          djText: "我喜欢认真、有表达的音乐。",
          whyThisSong: "这只是聊天，不应该引用启动占位曲库。",
          moodChannel: "私人聊天",
          strategy: "不换歌",
          searchQueries: [],
          queueIntent: "keep",
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [];
      },
      async getPlaybackSource() {
        return { mode: "unavailable", reason: "没有真实播放目标" };
      },
    },
  });

  const result = await radio.chat({
    text: "你喜欢什么音乐",
    queue: startupQueue,
    currentTrack: startupQueue[0],
  });

  assert.equal(receivedInput.currentTrack, null);
  assert.deepEqual(receivedInput.context.queue, []);
  assert.deepEqual(result.queue, []);
  assert.equal(result.currentTrack, null);
  assert.equal(result.playback.mode, "unavailable");
});

test("radio service does not fall back to local library when remote search has no playable queue", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          intent: "replace_queue",
          shouldChangeQueue: true,
          djText: "我重新找一组。",
          whyThisSong: "必须来自远端可播放结果。",
          moodChannel: "私人电台",
          strategy: "搜索真实音源",
          searchQueries: ["不存在的歌"],
          queueIntent: "replace",
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [];
      },
      async getPlaybackSource() {
        return { mode: "unavailable", reason: "没有真实播放目标" };
      },
    },
  });

  const result = await radio.chat({
    text: "可以那给我推荐一些",
    queue: [{ id: "local-1", title: "Monday Night Exhale", artist: "Moonlight" }],
    currentTrack: { id: "local-1", title: "Monday Night Exhale", artist: "Moonlight" },
  });

  assert.equal(result.queueChanged, true);
  assert.deepEqual(result.queue, []);
  assert.equal(result.currentTrack, null);
  assert.equal(result.playback.mode, "unavailable");
});

test("radio service asks the expression stage to write from the final playable queue", async () => {
  let expressionInput = null;
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          intent: "replace_queue",
          shouldChangeQueue: true,
          djText: "I will play Wrong Song first.",
          reply: "I will play Wrong Song first.",
          whyThisSong: "Wrong Song was the first draft.",
          moodChannel: "认真深沉",
          strategy: "继续保持人声和叙事感，不要突然切节奏",
          searchQueries: ["认真 人声"],
          queueIntent: "replace",
          trackIntro: "Wrong Song, from the first draft.",
        };
      },
      async express(input) {
        expressionInput = input;
        return {
          provider: "mock",
          status: "ready",
          reply: `Now playing ${input.queue[0].title}, then ${input.queue[1].title}.`,
          djText: `Now playing ${input.queue[0].title}, then ${input.queue[1].title}.`,
          whyThisSong: "",
          mood: input.plan.mood || input.plan.moodChannel,
          moodChannel: input.plan.mood || input.plan.moodChannel,
          djDirection: input.plan.djDirection || input.plan.strategy,
          strategy: input.plan.djDirection || input.plan.strategy,
          hostQuestion: "",
          trackIntro: `Intro for ${input.currentTrack.title}.`,
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [
          { id: "ncm:real-1", title: "Real Song", artist: "Real Artist", duration: "3:46" },
          { id: "ncm:real-2", title: "Second Real Song", artist: "Real Artist", duration: "1:27" },
        ];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/real.mp3", reason: "playable" };
      },
    },
  });

  const result = await radio.chat({ text: "可以那给我推荐一些" });

  assert.ok(expressionInput);
  assert.equal(expressionInput.queue[0].title, "Real Song");
  assert.equal(expressionInput.currentTrack.title, "Real Song");
  assert.equal(expressionInput.plan.reply, "I will play Wrong Song first.");
  assert.equal(result.currentTrack.title, "Real Song");
  assert.match(result.dj.text, /Real Song/);
  assert.doesNotMatch(result.dj.text, /Wrong Song/);
  assert.match(result.dj.trackIntro, /Real Song/);
  assert.doesNotMatch(result.dj.trackIntro, /Wrong Song/);
  assert.match(result.conversation.at(-1).text, /Real Song/);
  assert.doesNotMatch(result.conversation.at(-1).text, /Wrong Song/);
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
      const body = JSON.parse(options.body);
      const isMusic = /音乐编排引擎/.test(body.messages[0].content);
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(isMusic
                ? {
                  searchQueries: ["安静 人声"],
                  avoidRules: ["避开太吵"],
                }
                : {
                  reply: "真实反代 DJ 文案",
                  queueChanged: true,
                  musicIntent: "refresh_queue",
                  mood: "情绪回温",
                  djDirection: "先降噪",
                  hostQuestion: "",
                  trackIntro: "",
                  persona: "",
                }),
            },
          }],
        }),
      };
    },
  });

  const plan = await ai.plan({ text: "累", currentTrack: {}, context: {} });

  assert.equal(requests[0].url, "http://16.176.195.43:3000/v1/chat/completions");
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].options.body).model, "claude-sonnet-4.5");
  assert.match(JSON.parse(requests[0].options.body).messages[0].content, /音乐编排引擎/);
  assert.equal(plan.provider, "openai");
  assert.deepEqual(plan.searchQueries, ["安静 人声"]);

  const expression = await ai.express({
    text: "累",
    currentTrack: { title: "安静的歌" },
    queue: [{ title: "安静的歌" }],
    context: {},
    plan,
  });

  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[1].options.body).model, "claude-sonnet-4.5");
  assert.equal(expression.djText, "真实反代 DJ 文案");
});

test("openai provider separates planning and expression chat payloads", async () => {
  const requests = [];
  const persona = {
    id: "test-dj",
    name: "测试 DJ",
    identity: "我是测试 DJ。",
    expression: "短句，直接。",
    musicTaste: { keywords: ["华语 独立"], arrangementStyle: "独立、松弛" },
  };
  const ai = createAiProvider({
    provider: "openai",
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    baseUrl: "https://api.example.test",
    apiStyle: "chat",
    fetch: async (url, options) => {
      requests.push({ url, options });
      const body = JSON.parse(options.body);
      const isMusic = /音乐编排引擎/.test(body.messages[0].content);
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(isMusic
                ? {
                  searchQueries: ["华语 独立", "独立、松弛"],
                  avoidRules: ["短视频热歌"],
                }
                : {
                  reply: "歌不用换。",
                  queueChanged: false,
                  musicIntent: "chat_only",
                  mood: "私人聊天",
                  djDirection: "不换歌",
                  hostQuestion: "",
                  trackIntro: "",
                  persona: "test-dj",
                }),
            },
          }],
        }),
      };
    },
  });

  const plan = await ai.plan({
    text: "先别换歌",
    currentTrack: {},
    context: {},
    persona,
  });
  await ai.express({
    text: "先别换歌",
    currentTrack: { title: "Old Song" },
    queue: [{ title: "Old Song" }],
    context: {},
    persona,
    plan,
  });

  const musicBody = JSON.parse(requests[0].options.body);
  const expressionBody = JSON.parse(requests[1].options.body);
  assert.equal(requests.length, 2);
  assert.match(musicBody.messages[0].content, /音乐编排引擎/);
  assert.match(musicBody.messages[0].content, /华语 独立/);
  assert.match(musicBody.messages[0].content, /queueChanged/);
  assert.match(expressionBody.messages[0].content, /我是测试 DJ/);
  assert.match(expressionBody.messages[0].content, /reply/);
  assert.doesNotMatch(expressionBody.messages[0].content, /queueChanged/);
  assert.doesNotMatch(expressionBody.messages[0].content, /音乐审美/);
  assert.deepEqual(musicBody.response_format, { type: "json_object" });
  assert.deepEqual(expressionBody.response_format, { type: "json_object" });
});

test("openai provider express falls back without discarding successful music queries", async () => {
  const persona = {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      keywords: ["华语 独立", "中文 民谣"],
      arrangementStyle: "真诚、不煽情",
    },
  };
  const ai = createAiProvider({
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://api.example.test",
    apiStyle: "chat",
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (!/音乐编排引擎/.test(body.messages[0].content)) {
        return {
          ok: false,
          status: 502,
          text: async () => "expression down",
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                searchQueries: ["华语 独立", "中文 民谣"],
                avoidRules: ["避开吵闹"],
              }),
            },
          }],
        }),
      };
    },
  });

  const plan = await ai.plan({ text: "有点累，别太吵", currentTrack: {}, context: {}, persona });
  const expression = await ai.express({
    text: "有点累，别太吵",
    currentTrack: { title: "安静的歌" },
    queue: [{ title: "安静的歌" }],
    context: {},
    persona,
    plan,
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.searchQueries, ["华语 独立", "中文 民谣"]);
  assert.equal(expression.status, "fallback");
  assert.match(expression.reply, /品味 DJ/);
  assert.deepEqual(expression.searchQueries, ["华语 独立", "中文 民谣"]);
  assert.match(expression.error, /expression/);
});

test("openai provider falls back music planning queries to persona taste", async () => {
  const persona = {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      keywords: ["华语 独立", "中文 民谣"],
      arrangementStyle: "真诚、不煽情",
    },
  };
  const ai = createAiProvider({
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://api.example.test",
    apiStyle: "chat",
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (/音乐编排引擎/.test(body.messages[0].content)) {
        return {
          ok: false,
          status: 504,
          text: async () => "music down",
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                reply: "先说结论：别上强刺激。",
                queueChanged: true,
                musicIntent: "refresh_queue",
                mood: "低刺激",
                djDirection: "先降噪",
                hostQuestion: "",
                trackIntro: "",
                persona: "taste-dj",
              }),
            },
          }],
        }),
      };
    },
  });

  const plan = await ai.plan({ text: "有点累，别太吵", currentTrack: {}, context: {}, persona });

  assert.equal(plan.status, "fallback");
  assert.deepEqual(plan.searchQueries, ["华语 独立", "中文 民谣", "真诚、不煽情"]);
  assert.match(plan.error, /music/);
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

  assert.equal(requests[0], "https://api.example.test/search?keywords=%E6%A2%81%E5%8D%9A%20%E6%97%A5%E8%90%BD%E5%A4%A7%E9%81%93&type=1&limit=20");
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
  assert.equal(result.playback.mode, "unavailable");
  assert.deepEqual(result.queue, []);
  assert.equal(result.currentTrack, null);
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

test("radio service passes persona to ai and returns persona metadata", async () => {
  let receivedPersona;
  const registry = new Map([["test-dj", {
    id: "test-dj",
    name: "测试 DJ",
    description: "测试人格",
    musicTaste: { keywords: ["华语 独立"] },
  }]]);
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan(input) {
        receivedPersona = input.persona;
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "chat_only",
          queueChanged: false,
          reply: "歌不用换。",
          whyThisSong: "先聊清楚。",
          mood: "私人聊天",
          djDirection: "不换歌",
          searchQueries: [],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
    personaRegistry: registry,
  });

  const result = await radio.chat({
    text: "先别换歌",
    personaId: "test-dj",
    queue: [{ id: "ncm:old", title: "Old Song", artist: "Old Artist" }],
  });

  assert.equal(receivedPersona.id, "test-dj");
  assert.equal(result.dj.persona.id, "test-dj");
  assert.equal(result.queueChanged, false);
});

test("radio service injects persona music taste keywords into actual search", async () => {
  const searchQueries = [];
  const registry = new Map([["taste-dj", {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      keywords: ["华语 独立 摇滚 态度", "中文 民谣 真诚 不煽情"],
    },
  }]]);
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan(input) {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "换一组。",
          whyThisSong: "按你的状态重新排。",
          mood: "私人电台",
          djDirection: "带一点态度。",
          searchQueries: ["通用 安静"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks(query) {
        searchQueries.push(query);
        return [{
          id: `ncm:${searchQueries.length}`,
          title: `Song ${searchQueries.length}`,
          artist: "Artist",
        }];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
    personaRegistry: registry,
  });

  const result = await radio.chat({
    text: "我想听有态度的音乐，别太温柔",
    personaId: "taste-dj",
  });

  assert.deepEqual(searchQueries, [
    "我想听有态度的音乐，别太温柔 华语 独立 摇滚 态度",
    "我想听有态度的音乐，别太温柔 中文 民谣 真诚 不煽情",
    "华语 独立 摇滚 态度",
    "中文 民谣 真诚 不煽情",
    "通用 安静",
  ]);
  assert.deepEqual(result.searchQueries, searchQueries);
});

test("radio service aside mode appends persona reply without changing queue", async () => {
  const queue = [
    { id: "ncm:old-1", title: "Old Song 1", artist: "Old Artist" },
    { id: "ncm:old-2", title: "Old Song 2", artist: "Old Artist" },
  ];
  const registry = new Map([["late-night", {
    id: "late-night",
    name: "夜间 DJ",
    description: "低声过渡",
  }]]);
  let receivedInput;
  let playbackCalls = 0;
  let searchCalls = 0;
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan(input) {
        receivedInput = input;
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "夜间 DJ：刚才这段没接稳，我把声音轻轻带过去。",
          whyThisSong: "系统过渡，不重新排歌。",
          mood: "私人电台",
          djDirection: "自然过渡",
          searchQueries: ["不应该搜索"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        searchCalls += 1;
        return [];
      },
      async getPlaybackSource() {
        playbackCalls += 1;
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
    personaRegistry: registry,
  });

  const result = await radio.chat({
    responseMode: "aside",
    systemEvent: "playback_failure",
    text: "播放失败过渡",
    personaId: "late-night",
    conversation: [{ role: "user", text: "先听着" }],
    queue,
    currentTrack: queue[0],
    playback: { mode: "unavailable", reason: "上一首播放失败" },
  });

  assert.equal(receivedInput.persona.id, "late-night");
  assert.equal(result.queueChanged, false);
  assert.deepEqual(result.queue.map((track) => track.id), ["ncm:old-1", "ncm:old-2"]);
  assert.equal(result.currentTrack.id, "ncm:old-1");
  assert.equal(result.playback.reason, "上一首播放失败");
  assert.equal(result.conversation.at(-1).role, "dj");
  assert.match(result.conversation.at(-1).text, /没接稳/);
  assert.equal(playbackCalls, 0);
  assert.equal(searchCalls, 0);
});

test("radio service opening mode uses configured persona line without touching ai, playback, or queue", async () => {
  const queue = [
    { id: "ncm:old-1", title: "Old Song 1", artist: "Old Artist" },
  ];
  const registry = new Map([["opening-dj", {
    id: "opening-dj",
    name: "Opening DJ",
    description: "Direct opening host",
    openingLine: "我是 Opening DJ，今天由我来为你推荐音乐。先把频道打开，声音放稳一点。",
  }]]);
  let playbackCalls = 0;
  let searchCalls = 0;
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        throw new Error("opening should not call ai");
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        searchCalls += 1;
        return [];
      },
      async getPlaybackSource() {
        playbackCalls += 1;
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
    personaRegistry: registry,
  });

  const result = await radio.chat({
    responseMode: "opening",
    personaId: "opening-dj",
    conversation: [],
    queue,
    currentTrack: queue[0],
  });

  assert.equal(result.ai.status, "static");
  assert.equal(result.queueChanged, false);
  assert.equal(result.currentTrack.id, "ncm:old-1");
  assert.deepEqual(result.queue.map((track) => track.id), ["ncm:old-1"]);
  assert.deepEqual(result.conversation, [{ role: "dj", text: "我是 Opening DJ，今天由我来为你推荐音乐。先把频道打开，声音放稳一点。" }]);
  assert.equal(result.dj.text, "我是 Opening DJ，今天由我来为你推荐音乐。先把频道打开，声音放稳一点。");
  assert.equal(result.searchQueries.length, 0);
  assert.equal(playbackCalls, 0);
  assert.equal(searchCalls, 0);
});

test("radio service opening mode uses generic static line when persona has no opening line", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        throw new Error("opening should not call ai");
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        throw new Error("should not search");
      },
      async getPlaybackSource() {
        throw new Error("should not resolve playback");
      },
    },
  });

  const result = await radio.chat({ responseMode: "opening", conversation: [] });

  assert.equal(result.queueChanged, false);
  assert.equal(result.conversation.length, 1);
  assert.equal(result.dj.text, "我是月亮 DJ，今天由我来为你推荐音乐。先把频道打开，声音放稳一点，这段我陪你慢慢听。");
});

test("radio service opening mode supports luoyonghao through persona configuration", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        throw new Error("opening should not call ai");
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        throw new Error("should not search");
      },
      async getPlaybackSource() {
        throw new Error("should not resolve playback");
      },
    },
    personaRegistry: new Map([["luoyonghao", {
      id: "luoyonghao",
      name: "罗永浩",
      openingLine: "我是罗永浩，今天由我来为你推荐音乐。先说结论，歌不能瞎放，得认真、有表达、不油腻。咱们把声音放稳，慢慢听。",
    }]]),
  });

  const result = await radio.chat({ responseMode: "opening", personaId: "luoyonghao", conversation: [] });

  assert.equal(result.queueChanged, false);
  assert.doesNotMatch(result.dj.text, /Generate one short|queue|收到/);
  assert.match(result.dj.text, /我是罗永浩/);
  assert.match(result.dj.text, /先说结论/);
  assert.match(result.dj.text, /今天由我来为你推荐音乐/);
  assert.match(result.dj.text, /认真、有表达、不油腻/);
});

test("radio service can collect fifteen playable tracks", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "换一组。",
          whyThisSong: "扩大候选。",
          mood: "私人电台",
          djDirection: "多一点选择。",
          searchQueries: ["候选池"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return Array.from({ length: 20 }, (_, index) => ({
          id: `ncm:${index + 1}`,
          title: `Song ${index + 1}`,
          artist: "Artist",
        }));
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
  });

  const result = await radio.chat({ text: "换一组更丰富的" });

  assert.equal(result.queue.length, 15);
  assert.equal(result.searchQueries.length, 1);
});

test("radio service visible queue filters out external and unavailable tracks", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "换一组。",
          whyThisSong: "只保留可播放。",
          mood: "私人电台",
          djDirection: "过滤不可播放。",
          searchQueries: ["混合结果"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [
          { id: "ncm:external", title: "External", artist: "Artist" },
          { id: "ncm:unavailable", title: "Unavailable", artist: "Artist" },
          { id: "ncm:stream", title: "Stream", artist: "Artist" },
          { id: "ncm:cli", title: "Cli", artist: "Artist" },
        ];
      },
      async getPlaybackSource(id) {
        if (id === "ncm:external") return { mode: "external", url: "https://music.example", reason: "external" };
        if (id === "ncm:unavailable") return { mode: "unavailable", reason: "unavailable" };
        if (id === "ncm:cli") return { mode: "cli", originalId: "1", encryptedId: "encrypted", reason: "cli" };
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "stream" };
      },
    },
  });

  const result = await radio.chat({ text: "换一组可播放的" });

  assert.deepEqual(result.queue.map((track) => track.id), ["ncm:stream", "ncm:cli"]);
});

test("radio service filters artist-specific requests to matching artists", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "放一组 Queen。",
          whyThisSong: "用户指定了乐队。",
          mood: "经典摇滚",
          djDirection: "只保留指定艺人。",
          searchQueries: ["Queen"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [
          { id: "ncm:wrong-title", title: "Queen", artist: "Morgan knight" },
          { id: "ncm:wrong-cn", title: "人质", artist: "张惠妹" },
          { id: "ncm:bohemian", title: "Bohemian Rhapsody", artist: "Queen" },
          { id: "ncm:rock-you", title: "We Will Rock You", artist: "Queen" },
          { id: "ncm:collab", title: "Under Pressure", artist: "Queen / David Bowie" },
        ];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "stream" };
      },
    },
  });

  const result = await radio.chat({ text: "放一组queen乐队的歌" });

  assert.deepEqual(result.queue.map((track) => `${track.title}-${track.artist}`), [
    "Bohemian Rhapsody-Queen",
    "We Will Rock You-Queen",
    "Under Pressure-Queen / David Bowie",
  ]);
});

test("radio service filters Chinese artist requests to matching artists", async () => {
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "放几首许嵩。",
          whyThisSong: "用户指定了歌手。",
          mood: "指定艺人",
          djDirection: "只保留指定歌手。",
          searchQueries: ["许嵩"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [
          { id: "ncm:wrong", title: "有何不可", artist: "张三" },
          { id: "ncm:xusong-1", title: "有何不可", artist: "许嵩" },
          { id: "ncm:xusong-2", title: "素颜", artist: "许嵩 / 何曼婷" },
        ];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "stream" };
      },
    },
  });

  const result = await radio.chat({ text: "放几首许嵩的歌" });

  assert.deepEqual(result.queue.map((track) => `${track.title}-${track.artist}`), [
    "有何不可-许嵩",
    "素颜-许嵩 / 何曼婷",
  ]);
});

test("radio service treats explicit style requests as hard relevance constraints", async () => {
  const searchQueries = [];
  const registry = new Map([["taste-dj", {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      keywords: ["华语 独立 摇滚 态度", "中文 民谣 真诚 不煽情", "城市 夜晚 独立 华语"],
      arrangementStyle: "有态度的华语独立和民谣为主",
    },
  }]]);
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "refresh_queue",
          queueChanged: true,
          reply: "来点摇滚。",
          whyThisSong: "用户指定了风格。",
          mood: "摇滚",
          djDirection: "摇滚乐队优先。",
          searchQueries: ["通用 华语"],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks(query) {
        searchQueries.push(query);
        return [
          { id: "ncm:pop", title: "红", artist: "罗言", album: "红", duration: "2:41" },
          { id: "ncm:folk", title: "民谣歌", artist: "Folk Singer", album: "民谣", duration: "3:12" },
          { id: "ncm:band", title: "爱是拥有", artist: "SummerVapour乐队", album: "爱是拥有", duration: "3:52" },
          { id: "ncm:album", title: "Bring You Down", artist: "Ships Have Sailed", album: "後院烤肉獨立搖滾樂", duration: "3:22" },
        ];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "stream" };
      },
    },
    personaRegistry: registry,
  });

  const result = await radio.chat({ text: "来点摇滚乐", personaId: "taste-dj" });

  assert.deepEqual(searchQueries.slice(0, 4), [
    "摇滚 乐队",
    "独立摇滚",
    "华语 摇滚 乐队",
    "华语 独立 摇滚 态度",
  ]);
  assert.equal(searchQueries.includes("中文 民谣 真诚 不煽情"), false);
  assert.deepEqual(result.queue.map((track) => `${track.title}-${track.artist}`), [
    "爱是拥有-SummerVapour乐队",
    "Bring You Down-Ships Have Sailed",
  ]);
});

test("radio service overrides ai chat_only when local text clearly asks for tuning", async () => {
  const searchQueries = [];
  const registry = new Map([["taste-dj", {
    id: "taste-dj",
    name: "品味 DJ",
    musicTaste: {
      keywords: ["独立 摇滚 态度"],
    },
  }]]);
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan() {
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "chat_only",
          queueChanged: false,
          reply: "歌先不换。",
          whyThisSong: "先保持当前播放。",
          mood: "私人聊天",
          djDirection: "不换歌",
          searchQueries: [],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks(query) {
        searchQueries.push(query);
        return [{ id: `ncm:${searchQueries.length}`, title: "Song", artist: "测试乐队" }];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
    personaRegistry: registry,
  });

  const result = await radio.chat({
    text: "我想听有态度的摇滚，别太温柔",
    personaId: "taste-dj",
  });

  assert.equal(result.queueChanged, true);
  assert.notEqual(result.intent, "chat_only");
  assert.equal(result.searchQueries[0], "摇滚 乐队");
  assert.ok(result.searchQueries.includes("独立 摇滚 态度"));
});

test("radio service falls back to base protocol when persona is missing", async () => {
  let receivedPersona = "not-called";
  const radio = createRadioService({
    aiProvider: {
      name: "mock",
      async plan(input) {
        receivedPersona = input.persona;
        return {
          provider: "mock",
          status: "ready",
          musicIntent: "chat_only",
          queueChanged: false,
          reply: "我在，歌先不换。",
          whyThisSong: "先保持当前播放。",
          mood: "私人聊天",
          djDirection: "不换歌",
          searchQueries: [],
        };
      },
    },
    musicProvider: {
      name: "netease",
      authorized: true,
      async searchTracks() {
        return [];
      },
      async getPlaybackSource() {
        return { mode: "stream", url: "https://audio.example/song.mp3", reason: "playable" };
      },
    },
    personaRegistry: new Map(),
  });

  const result = await radio.chat({
    text: "先别换歌",
    personaId: "missing",
    queue: [{ id: "ncm:old", title: "Old Song", artist: "Old Artist" }],
  });

  assert.equal(receivedPersona, null);
  assert.equal(result.dj.persona, null);
  assert.equal(result.queueChanged, false);
});
