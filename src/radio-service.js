const {
  TRACKS,
  getInitialState,
  routeMoodInput,
  selectTrack,
} = require("./moonlight-core.js");
const { resolvePersona } = require("./dj/persona-registry.js");

const CHANNELS = [
  {
    id: "warm",
    label: "情绪回温",
    query: "中文 安静 温柔 治愈",
    description: "给刚醒来的脑子一点缓冲，低速、柔软、带空气感。",
  },
  {
    id: "deep",
    label: "深度陪伴",
    query: "专注 工作 安静 氛围",
    description: "适合写东西、整理思绪，保持专注但不紧绷。",
  },
  {
    id: "night",
    label: "夜间慢放",
    query: "夜晚 慢歌 安静 中文",
    description: "减少刺激，像有人在旁边轻声把一天收起来。",
  },
  {
    id: "private",
    label: "私人 DJ",
    query: "私人电台 温柔 中文",
    description: "按你刚刚说的话临时调频。",
  },
  {
    id: "breathe",
    label: "低速呼吸",
    query: "低速 安静 放松",
    description: "把节奏降下来，先让身体松一点。",
  },
  {
    id: "alone",
    label: "中文独立",
    query: "中文 独立 温柔",
    description: "更靠近人声和故事，但不把情绪推得太满。",
  },
  {
    id: "rain",
    label: "雨夜房间",
    query: "雨夜 安静 房间 中文",
    description: "适合夜里独处，保留一点陪伴感。",
  },
];

function resolveTrackId(index) {
  const track = TRACKS[index] || TRACKS[0];
  return track.id || track.neteaseId || `local-${index + 1}`;
}

function findChannel(value) {
  const text = String(value || "").trim();
  return CHANNELS.find((channel) => channel.id === text || channel.label === text)
    || CHANNELS.find((channel) => text && channel.label.includes(text))
    || CHANNELS[0];
}

function platformText(provider) {
  if (provider.name === "netease") return provider.authorized ? "网易云 API 已配置" : "网易云 API 未配置";
  if (provider.name === "netease-cli") return "网易云 CLI 已接入";
  return "本地授权曲库";
}

function aiStatusText(plan) {
  if (plan.provider === "openai" && plan.status === "ready") return "AI 已连接";
  if (plan.status === "fallback") return "AI 请求失败，已回退本地规则";
  if (plan.provider === "mock") return "AI 模拟中";
  return "AI 适配器待配置";
}

function playbackText(playback) {
  if (playback.mode === "stream") return "真实音频";
  if (playback.mode === "cli") return "网易云 CLI 播放";
  if (playback.mode === "external") return "外部平台打开";
  return "无播放权限";
}

function sourceLabel(provider) {
  if (provider.name === "netease-cli") return "网易云 CLI";
  if (provider.name === "netease") return provider.authorized ? "网易云推荐" : "网易云外链";
  return "本地曲库";
}

function durationToSeconds(duration) {
  if (typeof duration === "number" && Number.isFinite(duration)) return duration > 1000 ? Math.round(duration / 1000) : duration;
  const match = String(duration || "").match(/^(\d+):(\d{1,2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function enrichTrack(track, provider, index) {
  const fallback = TRACKS[index % TRACKS.length] || TRACKS[0];
  const merged = { ...fallback, ...track };
  const id = merged.id || resolveTrackId(index);
  return {
    ...merged,
    id,
    durationSeconds: durationToSeconds(merged.duration),
    sourceLabel: merged.sourceLabel || sourceLabel(provider),
  };
}

function usesRemoteCatalog(provider) {
  return provider && (provider.name === "netease" || provider.name === "netease-cli");
}

function trackNameKey(track) {
  return `${String(track && track.title || "").trim().toLowerCase()}::${String(track && track.artist || "").trim().toLowerCase()}`;
}

const LOCAL_LIBRARY_KEYS = new Set(TRACKS.map(trackNameKey));

function isLocalLibraryTrack(track) {
  if (!track) return false;
  const id = String(track.id || "");
  if (id.startsWith("local-")) return true;
  if (String(track.sourceLabel || "") === "本地曲库") return true;
  return !id.startsWith("ncm:") && LOCAL_LIBRARY_KEYS.has(trackNameKey(track));
}

function inferIntent(text) {
  const value = String(text || "");
  if (/别换|不要换|先不换|聊会|聊一会|陪我聊|为什么|解释/.test(value)) return "chat";
  if (/换一批|重新|来点|想听|不要|避开|换歌|切到|频道|歌单|播放/.test(value)) return "replace_queue";
  return "chat";
}

function shouldChangeQueue(aiPlan, text) {
  const intent = aiPlan.musicIntent || aiPlan.intent || inferIntent(text);
  const inferred = inferIntent(text);
  if (inferred === "replace_queue") return true;
  if (typeof aiPlan.queueChanged === "boolean") return aiPlan.queueChanged;
  if (typeof aiPlan.shouldChangeQueue === "boolean") return aiPlan.shouldChangeQueue;
  if (intent === "chat" || intent === "chat_only" || intent === "keep_current" || intent === "explain_current" || intent === "request_preference") return false;
  if (aiPlan.queueIntent === "keep") return false;
  return intent === "replace_queue" || intent === "refresh_queue" || intent === "change_channel" || intent === "adjust_mood" || intent === "specific_search" || intent === "refine_queue" || intent === "tune" || aiPlan.queueIntent === "replace";
}

function normalizeQueries(aiPlan, text, channel) {
  const explicit = Array.isArray(aiPlan.searchQueries)
    ? aiPlan.searchQueries
    : typeof aiPlan.searchQueries === "string"
      ? [aiPlan.searchQueries]
      : [];
  const queries = explicit.length ? explicit : [aiPlan.nextTrackQuery, /[\u4e00-\u9fff]/.test(text) ? text : "", channel.query];
  return [...new Set(queries.map((query) => String(query || "").trim()).filter(Boolean))].slice(0, 8);
}

function personaTasteQueries(persona) {
  if (!persona || !persona.musicTaste) return [];
  const taste = persona.musicTaste;
  const queries = [
    ...(Array.isArray(taste.keywords) ? taste.keywords : []),
    ...(Array.isArray(taste.preferred) ? taste.preferred : []),
    taste.arrangementStyle,
  ];
  return [...new Set(queries.map((query) => String(query || "").trim()).filter(Boolean))];
}

function queriesWithPersonaTaste(aiPlan, text, channel, persona) {
  const baseQueries = normalizeQueries(aiPlan, text, channel);
  const tasteQueries = personaTasteQueries(persona);
  const constraints = extractRecommendationConstraints(text);
  if (constraints.hasConstraints) {
    const constraintQueries = buildConstraintQueries(constraints);
    const compatibleTaste = tasteQueries.filter((query) => queryMatchesConstraints(query, constraints));
    const compatibleBase = baseQueries.filter((query) => queryMatchesConstraints(query, constraints));
    return [...new Set([...constraintQueries, ...compatibleTaste, ...compatibleBase])].slice(0, 12);
  }
  if (!tasteQueries.length) return baseQueries;
  const userText = String(text || "").trim();
  const combinedQueries = userText ? tasteQueries.map((query) => `${userText} ${query}`) : [];
  return [...new Set([...combinedQueries, ...tasteQueries, ...baseQueries])].slice(0, 12);
}

function normalizeExistingQueue(payload, provider) {
  return (Array.isArray(payload.queue) ? payload.queue : [])
    .filter(Boolean)
    .filter((track) => !(usesRemoteCatalog(provider) && isLocalLibraryTrack(track)))
    .map((track, index) => enrichTrack(track, provider, index));
}

function trackDedupeKey(track) {
  return `${String(track.title || "").trim().toLowerCase()}::${String(track.artist || "").trim().toLowerCase()}`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRequestedArtists(text) {
  const value = String(text || "");
  const artists = [];
  const patterns = [
    /(?:放|听|来点|来一组|一组|想听|播放)\s*(?:一组|一些|几首)?\s*([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9 .&'!-]{0,30})\s*(?:乐队|樂隊|band)\b/ig,
    /([A-Za-z][A-Za-z0-9 .&'!-]{1,40})\s*(?:乐队|樂隊|band)\b/ig,
    /(?:放|听|来点|来一组|一组|想听|播放)\s*(?:一组|一些|几首)?\s*([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9 .&'!-]{0,30})\s*(?:的歌|歌曲|作品)/ig,
    /(?:放|听|来点|来一组|一组|想听|播放)\s*([A-Za-z][A-Za-z0-9 .&'!-]{1,40})\s*(?:的歌|歌曲|作品|歌)?/ig,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(value))) {
      const artist = normalizeSearchText(match[1]);
      if (artist && !/^(song|music|rock|band)$/.test(artist)) artists.push(artist);
    }
  }
  return [...new Set(artists)];
}

function matchesRequestedArtist(track, requestedArtists) {
  if (!requestedArtists.length) return true;
  const artist = normalizeSearchText(track && track.artist);
  if (!artist) return false;
  return requestedArtists.some((requested) => {
    const paddedArtist = ` ${artist} `;
    const paddedRequested = ` ${requested} `;
    return paddedArtist.includes(paddedRequested) || paddedRequested.includes(paddedArtist);
  });
}

const STYLE_RULES = [
  {
    id: "rock",
    triggers: ["摇滚", "搖滾", "rock"],
    querySeeds: ["摇滚 乐队", "独立摇滚", "华语 摇滚 乐队"],
    evidence: ["摇滚", "搖滾", "rock", "乐队", "樂隊", "band", "punk", "metal", "grunge"],
  },
  {
    id: "folk",
    triggers: ["民谣", "民謠", "folk"],
    querySeeds: ["民谣", "中文 民谣", "folk"],
    evidence: ["民谣", "民謠", "folk"],
  },
  {
    id: "electronic",
    triggers: ["电子", "電音", "electronic", "techno", "ambient"],
    querySeeds: ["电子 音乐", "ambient electronic", "techno"],
    evidence: ["电子", "電音", "electronic", "techno", "ambient", "synth"],
  },
  {
    id: "jazz",
    triggers: ["爵士", "jazz"],
    querySeeds: ["爵士", "jazz"],
    evidence: ["爵士", "jazz"],
  },
  {
    id: "rap",
    triggers: ["说唱", "嘻哈", "rap", "hip hop", "hiphop"],
    querySeeds: ["说唱", "中文 说唱", "hip hop"],
    evidence: ["说唱", "嘻哈", "rap", "hip hop", "hiphop"],
  },
];

function extractRequestedStyles(text) {
  const value = normalizeSearchText(text);
  if (!value) return [];
  return STYLE_RULES.filter((rule) => rule.triggers.some((trigger) => value.includes(normalizeSearchText(trigger))));
}

function extractRecommendationConstraints(text) {
  const artists = extractRequestedArtists(text);
  const styles = extractRequestedStyles(text);
  return {
    artists,
    styles,
    hasConstraints: artists.length > 0 || styles.length > 0,
  };
}

function queryMatchesRequestedArtists(query, artists) {
  if (!artists.length) return true;
  const value = normalizeSearchText(query);
  return artists.some((artist) => value.includes(artist));
}

function queryMatchesRequestedStyles(query, styles) {
  if (!styles.length) return true;
  const value = normalizeSearchText(query);
  return styles.some((style) => style.evidence.some((term) => value.includes(normalizeSearchText(term))));
}

function queryMatchesConstraints(query, constraints) {
  return queryMatchesRequestedArtists(query, constraints.artists)
    && queryMatchesRequestedStyles(query, constraints.styles);
}

function buildConstraintQueries(constraints) {
  const artistQueries = constraints.artists.flatMap((artist) => [
    artist,
    `${artist} 乐队`,
    `${artist} songs`,
  ]);
  const styleQueries = constraints.styles.flatMap((style) => style.querySeeds);
  return [...new Set([...artistQueries, ...styleQueries].map((query) => String(query || "").trim()).filter(Boolean))];
}

function trackMatchesRequestedStyles(track, styles) {
  if (!styles.length) return true;
  const metadata = normalizeSearchText([
    track && track.title,
    track && track.artist,
    track && track.album,
    track && track.mood,
    track && track.sourceLabel,
  ].filter(Boolean).join(" "));
  return styles.some((style) => style.evidence.some((term) => metadata.includes(normalizeSearchText(term))));
}

function matchesRecommendationConstraints(track, constraints) {
  return matchesRequestedArtist(track, constraints.artists)
    && trackMatchesRequestedStyles(track, constraints.styles);
}

function mergeConversation(existing, userText, reply, whyThisSong, options = {}) {
  const conversation = Array.isArray(existing) ? existing.slice(-16) : [];
  if (userText) conversation.push({ role: "user", text: userText });
  let text = reply || "我在。你慢慢说。";
  if (whyThisSong && options.includeReason !== false) {
    text = `${text} 我先放这首，是因为${String(whyThisSong).replace(/^因为/, "")}`;
  }
  conversation.push({ role: "dj", text });
  return conversation.slice(-18);
}

function formatTrackName(track) {
  if (!track) return "";
  const title = String(track.title || "").trim();
  const artist = String(track.artist || "").trim();
  if (!title) return "";
  return artist ? `《${title}》 - ${artist}` : `《${title}》`;
}

function buildQueueAlignedDjText(aiPlan, queue, userText) {
  if (!Array.isArray(queue) || !queue.length) return aiPlan.reply || aiPlan.djText;
  const first = formatTrackName(queue[0]);
  const next = queue.slice(1, 3).map(formatTrackName).filter(Boolean);
  const direction = aiPlan.djDirection || aiPlan.strategy || "保持这一组声音的方向";
  const userLine = userText ? `你说“${userText}”，` : "";
  const nextLine = next.length ? `后面接 ${next.join("、")}。` : "";
  return `先说结论：${userLine}这次我按真实可播放队列来接，先放${first}。${nextLine}${direction}。`;
}

function buildQueueAlignedTrackIntro(track, aiPlan) {
  const name = formatTrackName(track);
  if (!name) return aiPlan.trackIntro || "";
  const direction = aiPlan.djDirection || aiPlan.strategy || "";
  return direction ? `${name}。这一首先落在“${direction}”这个方向上。` : `${name}。`;
}

async function buildExpressionPlan({ aiProvider, aiPlan, text, currentTrack, queue, context, persona }) {
  const fallback = {
    ...aiPlan,
    reply: buildQueueAlignedDjText(aiPlan, queue, text),
    djText: buildQueueAlignedDjText(aiPlan, queue, text),
    whyThisSong: "",
    trackIntro: buildQueueAlignedTrackIntro(currentTrack, aiPlan),
  };
  if (typeof aiProvider.express !== "function") return fallback;
  try {
    const expression = await aiProvider.express({
      text,
      currentTrack,
      queue,
      context,
      persona,
      plan: aiPlan,
    });
    return {
      ...aiPlan,
      ...expression,
      searchQueries: aiPlan.searchQueries,
      avoidRules: aiPlan.avoidRules,
      queueChanged: aiPlan.queueChanged,
      shouldChangeQueue: aiPlan.shouldChangeQueue,
      musicIntent: aiPlan.musicIntent,
      intent: aiPlan.intent,
    };
  } catch (error) {
    return {
      ...fallback,
      status: "fallback",
      error: error.message,
    };
  }
}

function buildState(localState, aiPlan, channel, text) {
  return {
    ...localState,
    signal: {
      channel: aiPlan.mood || aiPlan.moodChannel || channel.label || localState.signal.channel,
      source: text ? "你的输入 + 当前频道 + 网易云候选" : "当前频道 + 网易云候选",
      strategy: aiPlan.djDirection || aiPlan.strategy || localState.signal.strategy,
    },
    djLine: aiPlan.reply || aiPlan.djText,
    reason: aiPlan.whyThisSong,
    next: aiPlan.hostQuestion || "",
  };
}

function buildPersonaOpeningCopy(persona) {
  if (persona && persona.openingLine) return String(persona.openingLine).trim();
  const name = persona && persona.name ? persona.name : "月亮 DJ";
  return `我是${name}，今天由我来为你推荐音乐。先把频道打开，声音放稳一点，这段我陪你慢慢听。`;
}

function resolveFinalIntent(aiPlan, text, changeQueue) {
  const aiIntent = aiPlan.musicIntent || aiPlan.intent || inferIntent(text);
  const localIntent = inferIntent(text);
  if (changeQueue && (aiIntent === "chat" || aiIntent === "chat_only" || aiIntent === "keep_current")) {
    return localIntent === "replace_queue" ? "refresh_queue" : "refresh_queue";
  }
  return aiIntent;
}

async function collectQueue({ aiPlan, text, channel, payload, provider, persona }) {
  const queries = queriesWithPersonaTaste(aiPlan, text, channel, persona);
  const constraints = extractRecommendationConstraints(text);
  const recent = new Set([
    ...(payload.recentTrackIds || []),
    ...(payload.blockedTrackIds || []),
    ...normalizeExistingQueue(payload, provider).map((track) => track.id),
  ]);
  const seen = new Set();
  const seenNames = new Set(normalizeExistingQueue(payload, provider).map(trackDedupeKey));
  const tracks = [];
  for (const query of queries) {
    const results = await provider.searchTracks(query, aiPlan.mood || aiPlan.moodChannel);
    for (const rawTrack of results || []) {
      const track = enrichTrack(rawTrack, provider, tracks.length);
      if (!matchesRecommendationConstraints(track, constraints)) continue;
      const nameKey = trackDedupeKey(track);
      if (!track.id || seen.has(track.id) || recent.has(track.id) || seenNames.has(nameKey)) continue;
      const playback = await provider.getPlaybackSource(track.id);
      if (!playback || !["cli", "stream"].includes(playback.mode)) continue;
      seen.add(track.id);
      seenNames.add(nameKey);
      tracks.push(track);
      if (tracks.length >= 15) break;
    }
    if (tracks.length >= 15) break;
  }
  return tracks;
}

function createRadioService({ aiProvider, musicProvider, personaRegistry }) {
  async function buildPlan(payload = {}, options = {}) {
    const text = String(payload.text || "").trim() || "此时此刻，适合什么。";
    const channel = findChannel(payload.channel || payload.channelId || payload.channelLabel || "");
    const persona = resolvePersona(personaRegistry, payload.personaId);
    const previousState = payload.state && Number.isInteger(payload.state.current)
      ? selectTrack({ ...getInitialState(), ...payload.state }, payload.state.current)
      : getInitialState();
    const localState = routeMoodInput(previousState, text || channel.query);
    const existingQueue = normalizeExistingQueue(payload, musicProvider);
    const payloadCurrentTrack = payload.currentTrack && !(usesRemoteCatalog(musicProvider) && isLocalLibraryTrack(payload.currentTrack))
      ? payload.currentTrack
      : null;
    const currentTrack = payloadCurrentTrack || existingQueue[0] || (usesRemoteCatalog(musicProvider) ? null : TRACKS[localState.current]);
    const aiPlan = await aiProvider.plan({
      text,
      currentTrack,
      context: {
        channel: channel.label || localState.signal.channel,
        source: localState.signal.source,
        strategy: localState.signal.strategy,
        likedTitles: localState.likedTitles || [],
        conversation: Array.isArray(payload.conversation) ? payload.conversation.slice(-8) : [],
        queue: existingQueue.slice(0, 8),
      },
      persona,
    });

    const changeQueue = options.forceQueueChange || shouldChangeQueue(aiPlan, text);
    const searchQueries = changeQueue ? queriesWithPersonaTaste(aiPlan, text, channel, persona) : [];
    const finalIntent = resolveFinalIntent(aiPlan, text, changeQueue);
    const queue = changeQueue
      ? await collectQueue({ aiPlan, text, channel, payload, provider: musicProvider, persona })
      : (existingQueue.length ? existingQueue : (currentTrack ? [enrichTrack(currentTrack, musicProvider, 0)] : []));
    const recommendedTrack = queue[0] || (currentTrack ? enrichTrack(currentTrack, musicProvider, 0) : null);
    const playback = recommendedTrack
      ? await musicProvider.getPlaybackSource(recommendedTrack.id)
      : { mode: "unavailable", reason: "当前没有真实可播放队列" };
    const expressionContext = {
      channel: channel.label || localState.signal.channel,
      source: localState.signal.source,
      strategy: localState.signal.strategy,
      likedTitles: localState.likedTitles || [],
      conversation: Array.isArray(payload.conversation) ? payload.conversation.slice(-8) : [],
      queue: queue.slice(0, 8),
    };
    const shouldUseExpression = typeof aiProvider.express === "function" && (queue.length || !changeQueue);
    const finalAiPlan = shouldUseExpression
      ? await buildExpressionPlan({
        aiProvider,
        aiPlan,
        text,
        currentTrack: recommendedTrack,
        queue,
        context: expressionContext,
        persona,
      })
      : aiPlan;
    const state = buildState(localState, finalAiPlan, channel, text);
    const conversation = mergeConversation(payload.conversation, payload.text || "", finalAiPlan.reply || finalAiPlan.djText, finalAiPlan.whyThisSong, {
      includeReason: changeQueue && !(changeQueue && queue.length),
    });

    return {
      ai: {
        provider: finalAiPlan.provider || aiPlan.provider,
        status: finalAiPlan.status || aiPlan.status,
        error: finalAiPlan.error || aiPlan.error || "",
      },
      music: {
        provider: musicProvider.name,
        authorized: Boolean(musicProvider.authorized),
      },
      playback,
      currentTrack: recommendedTrack,
      track: recommendedTrack,
      queue,
      queueChanged: Boolean(changeQueue),
      intent: finalIntent,
      searchQueries,
      conversation,
      channel: {
        id: channel.id,
        label: finalAiPlan.mood || finalAiPlan.moodChannel || channel.label,
        description: channel.description,
      },
      dj: {
        text: finalAiPlan.reply || finalAiPlan.djText,
        reason: finalAiPlan.whyThisSong,
        question: finalAiPlan.hostQuestion || "",
        strategy: finalAiPlan.djDirection || finalAiPlan.strategy || "",
        trackIntro: finalAiPlan.trackIntro || "",
        persona: persona ? {
          id: persona.id,
          name: persona.name,
          description: persona.description || "",
        } : null,
      },
      state,
      ui: {
        statusText: aiStatusText(aiPlan),
        platformText: platformText(musicProvider),
        playbackText: playbackText(playback),
      },
    };
  }

  async function buildAside(payload = {}) {
      const text = String(payload.text || "").trim() || "刚才有几首歌没有接上，请用一句自然的电台过渡陪用户继续听，不解释技术细节，不主动换歌单。";
      const channel = findChannel(payload.channel || payload.channelId || payload.channelLabel || "");
      const persona = resolvePersona(personaRegistry, payload.personaId);
      const localState = { ...getInitialState(), ...(payload.state || {}) };
      const existingQueue = normalizeExistingQueue(payload, musicProvider);
      const payloadCurrentTrack = payload.currentTrack && !(usesRemoteCatalog(musicProvider) && isLocalLibraryTrack(payload.currentTrack))
        ? payload.currentTrack
        : null;
      const currentTrack = payloadCurrentTrack
        ? enrichTrack(payloadCurrentTrack, musicProvider, 0)
        : existingQueue[0] || (usesRemoteCatalog(musicProvider) ? null : enrichTrack(TRACKS[localState.current] || TRACKS[0], musicProvider, 0));
      const queue = existingQueue.length ? existingQueue : (currentTrack ? [currentTrack] : []);
      const playback = payload.playback && payload.playback.mode
        ? payload.playback
        : { mode: "unavailable", reason: "上一首播放失败，已交给 DJ 过渡" };
      const aiPlan = await aiProvider.plan({
        text,
        currentTrack,
        context: {
          channel: channel.label || localState.signal.channel,
          source: payload.systemEvent === "playback_failure" ? "系统播放失败事件 + 当前队列" : "系统过渡事件 + 当前队列",
          strategy: "只生成一句自然过渡文案，不换队列，不解释技术细节，不承诺绕过版权。",
          likedTitles: localState.likedTitles || [],
          conversation: Array.isArray(payload.conversation) ? payload.conversation.slice(-8) : [],
          queue: queue.slice(0, 8),
          systemEvent: payload.systemEvent || "",
          responseMode: "aside",
        },
        persona,
      });
      const reply = aiPlan.status === "fallback" ? "" : String(aiPlan.reply || aiPlan.djText || "").trim();
      const conversation = (Array.isArray(payload.conversation) ? payload.conversation.slice(-17) : []);
      if (reply) conversation.push({ role: "dj", text: reply });
      const state = buildState(localState, {
        ...aiPlan,
        musicIntent: "chat_only",
        intent: "chat_only",
        queueChanged: false,
        shouldChangeQueue: false,
      }, channel, "");

    return {
      ai: {
        provider: aiPlan.provider,
        status: aiPlan.status,
        error: aiPlan.error || "",
      },
      music: {
        provider: musicProvider.name,
        authorized: Boolean(musicProvider.authorized),
      },
      playback,
      currentTrack,
      track: currentTrack,
      queue,
      queueChanged: false,
      intent: "chat_only",
      searchQueries: [],
      conversation,
      channel: {
        id: channel.id,
        label: aiPlan.mood || aiPlan.moodChannel || channel.label,
        description: channel.description,
      },
      dj: {
        text: reply,
        reason: aiPlan.whyThisSong,
        question: aiPlan.hostQuestion || "",
        strategy: aiPlan.djDirection || aiPlan.strategy || "",
        trackIntro: aiPlan.trackIntro || "",
        persona: persona ? {
          id: persona.id,
          name: persona.name,
          description: persona.description || "",
        } : null,
      },
      state,
      ui: {
        statusText: aiStatusText(aiPlan),
        platformText: platformText(musicProvider),
        playbackText: playbackText(playback),
      },
    };
  }

  async function buildOpening(payload = {}) {
    const channel = findChannel(payload.channel || payload.channelId || payload.channelLabel || "");
    const persona = resolvePersona(personaRegistry, payload.personaId);
    const localState = { ...getInitialState(), ...(payload.state || {}) };
    const existingQueue = normalizeExistingQueue(payload, musicProvider);
    const payloadCurrentTrack = payload.currentTrack && !(usesRemoteCatalog(musicProvider) && isLocalLibraryTrack(payload.currentTrack))
      ? payload.currentTrack
      : null;
    const currentTrack = payloadCurrentTrack
      ? enrichTrack(payloadCurrentTrack, musicProvider, 0)
      : existingQueue[0] || null;
    const reply = buildPersonaOpeningCopy(persona);
    const conversation = [{ role: "dj", text: reply }];

    return {
      ai: {
        provider: aiProvider.name,
        status: "static",
        error: "",
      },
      music: {
        provider: musicProvider.name,
        authorized: Boolean(musicProvider.authorized),
      },
      playback: payload.playback || { mode: "idle", reason: "" },
      currentTrack,
      track: currentTrack,
      queue: existingQueue,
      queueChanged: false,
      intent: "opening",
      searchQueries: [],
      conversation,
      channel: {
        id: channel.id,
        label: channel.label,
        description: channel.description,
      },
      dj: {
        text: reply,
        reason: "",
        question: "",
        strategy: "",
        trackIntro: "",
        persona: persona ? {
          id: persona.id,
          name: persona.name,
          description: persona.description || "",
        } : null,
      },
      state: {
        ...localState,
        signal: {
          ...localState.signal,
          channel: channel.label || localState.signal.channel,
          source: localState.signal.source,
          strategy: localState.signal.strategy,
        },
        djLine: reply,
        reason: "",
        next: "",
      },
      ui: {
        statusText: aiProvider.name === "openai" ? "AI 已连接" : "AI 模拟中",
        platformText: platformText(musicProvider),
        playbackText: payload.playback ? playbackText(payload.playback) : "",
      },
    };
  }

  return {
    plan(payload = {}) {
      return buildPlan(payload, { forceQueueChange: true });
    },

    chat(payload = {}) {
      if (payload.responseMode === "opening") return buildOpening(payload);
      if (payload.responseMode === "aside") return buildAside(payload);
      return buildPlan(payload);
    },

    channel(payload = {}) {
      const channel = findChannel(payload.channel || payload.channelId || payload.label);
      return buildPlan({
        ...payload,
        channel: channel.id,
        text: payload.text || `切到${channel.label}，按这个频道重新排歌。`,
      }, { forceQueueChange: true });
    },

    async next(payload = {}) {
      const queue = Array.isArray(payload.queue) ? payload.queue : [];
      const currentIndex = Number.isInteger(payload.currentIndex) ? payload.currentIndex : 0;
      const nextTrack = queue[currentIndex + 1];
      if (nextTrack) {
        const playback = await musicProvider.getPlaybackSource(nextTrack.id);
        return {
          currentTrack: nextTrack,
          track: nextTrack,
          queue,
          currentIndex: currentIndex + 1,
          queueChanged: false,
          playback,
          ui: {
            playbackText: playbackText(playback),
            platformText: platformText(musicProvider),
          },
        };
      }
      const nextState = selectTrack(payload.state || getInitialState(), ((payload.state && payload.state.current) || 0) + 1);
      return buildPlan({
        text: nextState.lastInput || "继续播放",
        state: nextState,
        conversation: payload.conversation,
        personaId: payload.personaId,
      }, { forceQueueChange: true });
    },
  };
}

module.exports = {
  CHANNELS,
  createRadioService,
  resolveTrackId,
  inferIntent,
  normalizeQueries,
  queriesWithPersonaTaste,
  personaTasteQueries,
  resolveFinalIntent,
};
