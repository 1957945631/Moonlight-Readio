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

function composeSystemPrompt(persona) {
  const base = buildBaseProtocol();
  const expression = persona ? [
    persona.identity ? `## 你的身份\n${persona.identity}` : "",
    persona.expression ? `## 表达风格\n${persona.expression}` : "",
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
    persona.musicTaste.arrangementStyle ? `编排倾向：${persona.musicTaste.arrangementStyle}` : "",
  ].filter(Boolean).join("\n") : "";
  return [base, expression, taste, buildOutputSchema()].filter(Boolean).join("\n\n---\n\n");
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
};
