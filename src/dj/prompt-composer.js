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

function composeSystemPrompt(persona) {
  const base = buildBaseProtocol();
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
  return [personaIntro, base, personaDepth, taste, buildOutputSchema()].filter(Boolean).join("\n\n---\n\n");
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
    musicTaste,
  });
}

module.exports = {
  composeSystemPrompt,
  composeUserPrompt,
  formatExamples,
  formatMentalModels,
  formatDecisionHeuristics,
  formatExpressionDna,
};
