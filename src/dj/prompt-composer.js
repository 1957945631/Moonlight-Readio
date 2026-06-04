const { buildBaseProtocol, buildOutputSchema } = require("./base-protocol.js");

function formatExamples(examples) {
  return (Array.isArray(examples) ? examples : [])
    .map((example) => {
      const user = example && example.user ? `用户：${example.user}` : "";
      const reply = example && example.reply ? `DJ：${example.reply}` : "";
      return [user, reply].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function formatMentalModels(models) {
  return (Array.isArray(models) ? models : [])
    .map((model) => {
      if (!model || (!model.name && !model.description)) return "";
      const name = model.name ? `### [${model.name}]` : "### [未命名模型]";
      return [name, model.description || ""].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function formatDecisionHeuristics(heuristics) {
  return (Array.isArray(heuristics) ? heuristics : [])
    .map((heuristic) => String(heuristic || "").trim())
    .filter(Boolean)
    .map((heuristic) => `- ${heuristic}`)
    .join("\n");
}

function formatExpressionDna(dna) {
  if (!dna) return "";
  return [
    dna.sentenceStyle ? `句式：${dna.sentenceStyle}` : "",
    dna.tone ? `语气：${dna.tone}` : "",
    dna.vocabulary ? `高频词：${dna.vocabulary}` : "",
    dna.rhythm ? `节奏：${dna.rhythm}` : "",
    dna.humor ? `幽默：${dna.humor}` : "",
  ].filter(Boolean).join("\n");
}

function buildPersonaOutputConstraint(persona) {
  if (!persona) return "";
  return [
    "## 当前 DJ 人格约束",
    "你必须让 reply、trackIntro、djDirection、searchQueries 体现当前 DJ 的人格和音乐审美。",
    "reply 和 trackIntro 要遵守 identity、expression、expressionDNA、decisionHeuristics 和 examples 的表达规则。",
    "djDirection 要体现当前 DJ 的判断方式和编排倾向。",
    "searchQueries 要优先使用当前 DJ 的 musicTaste、preferred、keywords 和 arrangementStyle，不要先回到通用 Moonlight 频道词。",
    "不要冒充真实人物；只使用 persona 声明的公开风格参考和边界。",
  ].join("\n");
}

function composeSystemPrompt(persona) {
  const base = buildBaseProtocol();
  const mentalModels = persona ? formatMentalModels(persona.mentalModels) : "";
  const decisionHeuristics = persona ? formatDecisionHeuristics(persona.decisionHeuristics) : "";
  const expressionDna = persona ? formatExpressionDna(persona.expressionDNA) : "";
  const personaConstraint = buildPersonaOutputConstraint(persona);
  const personaIntro = persona ? [
    persona.identity ? `## 你的身份\n${persona.identity}` : "",
    persona.expression ? `## 表达风格\n${persona.expression}` : "",
  ].filter(Boolean).join("\n\n") : "";
  const personaDepth = persona ? [
    mentalModels ? `## 核心思维方式\n${mentalModels}` : "",
    decisionHeuristics ? `## 判断原则\n${decisionHeuristics}` : "",
    expressionDna ? `## 表达 DNA\n${expressionDna}` : "",
    persona.values ? `## 价值观\n${persona.values}` : "",
    persona.antiPatterns ? `## 反模式\n${persona.antiPatterns}` : "",
    persona.catchphrases ? `## 可使用的表达记忆点\n${persona.catchphrases}` : "",
    persona.taboos ? `## 额外禁用词\n${persona.taboos}` : "",
    persona.examples ? `## 正确示例\n${formatExamples(persona.examples)}` : "",
  ].filter(Boolean).join("\n\n") : "";
  const taste = persona && persona.musicTaste ? [
    "## 音乐审美",
    persona.musicTaste.philosophy ? `好音乐的标准：${persona.musicTaste.philosophy}` : "",
    Array.isArray(persona.musicTaste.preferred) && persona.musicTaste.preferred.length
      ? `偏好风格：${persona.musicTaste.preferred.join("、")}`
      : "",
    Array.isArray(persona.musicTaste.avoided) && persona.musicTaste.avoided.length
      ? `避开类型：${persona.musicTaste.avoided.join("、")}`
      : "",
    Array.isArray(persona.musicTaste.keywords) && persona.musicTaste.keywords.length
      ? `关键词：${persona.musicTaste.keywords.join("、")}`
      : "",
    persona.musicTaste.arrangementStyle ? `编排倾向：${persona.musicTaste.arrangementStyle}` : "",
    "**硬性要求：生成 searchQueries 时必须优先使用以上偏好风格中的关键词，至少 2 个搜索词必须来自偏好风格和关键词列表。避开类型中的风格绝对不能出现在 searchQueries 中。**",
  ].filter(Boolean).join("\n") : "";
  return [personaIntro, base, personaDepth, taste, personaConstraint, buildOutputSchema()].filter(Boolean).join("\n\n---\n\n");
}

function composeUserPrompt(input = {}) {
  const persona = input.persona || null;
  const musicTaste = persona && persona.musicTaste ? {
    keywords: Array.isArray(persona.musicTaste.keywords) ? persona.musicTaste.keywords : [],
    arrangementStyle: persona.musicTaste.arrangementStyle || "",
    preferred: Array.isArray(persona.musicTaste.preferred) ? persona.musicTaste.preferred : [],
    avoided: Array.isArray(persona.musicTaste.avoided) ? persona.musicTaste.avoided : [],
  } : null;
  return JSON.stringify({
    userText: input.text,
    currentTrack: input.currentTrack,
    context: input.context,
    persona: persona ? {
      id: persona.id,
      name: persona.name,
      description: persona.description || "",
    } : null,
    personaStyle: persona ? {
      identity: persona.identity || "",
      expression: persona.expression || "",
      mentalModels: Array.isArray(persona.mentalModels) ? persona.mentalModels : [],
      decisionHeuristics: Array.isArray(persona.decisionHeuristics) ? persona.decisionHeuristics : [],
      expressionDNA: persona.expressionDNA || null,
      examples: Array.isArray(persona.examples) ? persona.examples : [],
      catchphrases: persona.catchphrases || "",
      values: persona.values || "",
      antiPatterns: persona.antiPatterns || "",
      taboos: persona.taboos || "",
    } : null,
    musicTaste,
  });
}

function composeExpressionSystemPrompt(persona) {
  const mentalModels = persona ? formatMentalModels(persona.mentalModels) : "";
  const decisionHeuristics = persona ? formatDecisionHeuristics(persona.decisionHeuristics) : "";
  const expressionDna = persona ? formatExpressionDna(persona.expressionDNA) : "";
  const personaIntro = persona ? [
    persona.identity ? `## 你的身份\n${persona.identity}` : "",
    persona.expression ? `## 表达风格\n${persona.expression}` : "",
  ].filter(Boolean).join("\n\n") : "";
  const personaDepth = persona ? [
    mentalModels ? `## 核心思维方式\n${mentalModels}` : "",
    decisionHeuristics ? `## 判断原则\n${decisionHeuristics}` : "",
    expressionDna ? `## 表达 DNA\n${expressionDna}` : "",
    persona.values ? `## 价值观\n${persona.values}` : "",
    persona.antiPatterns ? `## 反模式\n${persona.antiPatterns}` : "",
    persona.catchphrases ? `## 可使用的表达记忆点\n${persona.catchphrases}` : "",
    persona.taboos ? `## 额外禁用词\n${persona.taboos}` : "",
    persona.examples ? `## 正确示例\n${formatExamples(persona.examples)}` : "",
  ].filter(Boolean).join("\n\n") : "";
  const rules = [
    "你是 Moonlight 私人音乐电台的 DJ 表达引擎。只负责根据后端已经解析出的真实可播放队列，写给用户看的 DJ 文案。",
    "不要自行决定换队列，不要生成新的歌曲名单，不要承诺播放队列里不存在的歌曲。",
    "如果输入里有 queue，只能提及 queue 里的歌曲；不要提及搜索关键词、草稿歌名或你记忆里的候选歌曲。",
    "不要解释生成过程，不要说“作为一个 AI”“根据算法”“为你生成歌单”。",
  ].join("\n");
  const schema = [
    "## 输出 schema",
    "只返回 JSON，不要 Markdown。",
    "reply: 给用户看的 DJ 文案。",
    "trackIntro: 当前歌曲介绍，没有就空字符串。",
    "hostQuestion: 一句短问题，没有就空字符串。",
    "mood: 当前情绪氛围短词。",
    "djDirection: 给音乐编排用的简短方向。",
    "persona: 当前人格 id 或空字符串。",
  ].join("\n");
  return [personaIntro, personaDepth, rules, schema].filter(Boolean).join("\n\n---\n\n");
}

function composeMusicSystemPrompt(persona) {
  const taste = persona && persona.musicTaste ? [
    "## 音乐审美",
    persona.musicTaste.philosophy ? `好音乐的标准：${persona.musicTaste.philosophy}` : "",
    Array.isArray(persona.musicTaste.preferred) && persona.musicTaste.preferred.length
      ? `偏好风格：${persona.musicTaste.preferred.join("、")}`
      : "",
    Array.isArray(persona.musicTaste.avoided) && persona.musicTaste.avoided.length
      ? `避开类型：${persona.musicTaste.avoided.join("、")}`
      : "",
    Array.isArray(persona.musicTaste.keywords) && persona.musicTaste.keywords.length
      ? `关键词：${persona.musicTaste.keywords.join("、")}`
      : "",
    persona.musicTaste.arrangementStyle ? `编排倾向：${persona.musicTaste.arrangementStyle}` : "",
  ].filter(Boolean).join("\n") : "";
  const rules = [
    "你是 Moonlight 的音乐编排引擎。只负责判断是否需要换队列、生成音乐搜索关键词和避规，不写给用户看的 DJ 对话。",
    "如果用户只是聊天、吐槽、问问题、解释感受，queueChanged 必须为 false。",
    "只有用户明确要求推荐、换歌、调频、切频道、调整风格或想听某类歌时，queueChanged 才能为 true。",
    "队列要有情绪曲线：第一首贴合当前状态，后续保持统一审美，不突然跳风格。",
    "深夜、学习、放空场景优先不打断思绪；低落时不要立刻塞励志、燃、开心的歌。",
    "硬性要求：searchQueries 必须优先使用当前 DJ 的偏好风格和关键词，至少 3 个 searchQueries 来自偏好风格、关键词或编排倾向。",
    "避开类型中的风格不能出现在 searchQueries 中。",
    "不要输出具体推荐文案，不要在 reply 里承诺某一首歌；真实歌名必须等后端搜索后由表达阶段生成。",
  ].join("\n");
  const schema = [
    "## 输出 schema",
    "只返回 JSON，不要 Markdown。",
    "queueChanged: 布尔值。",
    "musicIntent: chat_only | keep_current | refresh_queue | change_channel | adjust_mood | specific_search。",
    "mood: 当前情绪氛围短词。",
    "djDirection: 给音乐编排用的简短方向。",
    "searchQueries: 字符串数组，给音乐搜索服务使用。",
    "avoidRules: 字符串数组，描述当前应避开的音乐规则。",
  ].join("\n");
  return [rules, taste, schema].filter(Boolean).join("\n\n---\n\n");
}

function composeExpressionUserPrompt(input = {}) {
  const persona = input.persona || null;
  return JSON.stringify({
    userText: input.text,
    currentTrack: input.currentTrack,
    queue: Array.isArray(input.queue) ? input.queue : [],
    plan: input.plan || null,
    context: input.context,
    persona: persona ? {
      id: persona.id,
      name: persona.name,
      description: persona.description || "",
    } : null,
    personaStyle: persona ? {
      identity: persona.identity || "",
      expression: persona.expression || "",
      mentalModels: Array.isArray(persona.mentalModels) ? persona.mentalModels : [],
      decisionHeuristics: Array.isArray(persona.decisionHeuristics) ? persona.decisionHeuristics : [],
      expressionDNA: persona.expressionDNA || null,
      examples: Array.isArray(persona.examples) ? persona.examples : [],
      catchphrases: persona.catchphrases || "",
      values: persona.values || "",
      antiPatterns: persona.antiPatterns || "",
      taboos: persona.taboos || "",
    } : null,
  });
}

function composeMusicUserPrompt(input = {}) {
  const persona = input.persona || null;
  const taste = persona && persona.musicTaste ? persona.musicTaste : {};
  return JSON.stringify({
    userText: input.text,
    currentTrack: input.currentTrack,
    context: {
      channel: input.context && input.context.channel,
      likedTitles: input.context && input.context.likedTitles,
      conversation: input.context && input.context.conversation,
    },
    musicTaste: persona ? {
      philosophy: taste.philosophy || "",
      preferred: Array.isArray(taste.preferred) ? taste.preferred : [],
      avoided: Array.isArray(taste.avoided) ? taste.avoided : [],
      keywords: Array.isArray(taste.keywords) ? taste.keywords : [],
      arrangementStyle: taste.arrangementStyle || "",
    } : null,
  });
}

module.exports = {
  composeSystemPrompt,
  composeUserPrompt,
  composeExpressionSystemPrompt,
  composeExpressionUserPrompt,
  composeMusicSystemPrompt,
  composeMusicUserPrompt,
  formatExamples,
  formatMentalModels,
  formatDecisionHeuristics,
  formatExpressionDna,
  buildPersonaOutputConstraint,
};
