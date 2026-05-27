const {
  TRACKS,
  getInitialState,
  routeMoodInput,
  selectTrack,
} = require("./moonlight-core.js");

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
  if (provider.name === "netease-cli") return "网易云 CLI 已接入";
  if (provider.name === "netease") return provider.authorized ? "网易云已授权" : "网易云未授权，仅可外部打开";
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

function inferIntent(text) {
  const value = String(text || "");
  if (/别换|不要换|先不换|聊会|聊一会|陪我聊|为什么|解释/.test(value)) return "chat";
  if (/换一批|重新|来点|想听|不要|避开|换歌|切到|频道|歌单|播放/.test(value)) return "replace_queue";
  return "chat";
}

function shouldChangeQueue(aiPlan, text) {
  const intent = aiPlan.intent || inferIntent(text);
  const inferred = inferIntent(text);
  if (inferred === "replace_queue") return true;
  if (typeof aiPlan.shouldChangeQueue === "boolean") return aiPlan.shouldChangeQueue;
  if (intent === "chat" || intent === "explain_current" || intent === "request_preference") return false;
  if (aiPlan.queueIntent === "keep") return false;
  return intent === "replace_queue" || intent === "refine_queue" || intent === "tune" || aiPlan.queueIntent === "replace";
}

function normalizeQueries(aiPlan, text, channel) {
  const explicit = Array.isArray(aiPlan.searchQueries)
    ? aiPlan.searchQueries
    : typeof aiPlan.searchQueries === "string"
      ? [aiPlan.searchQueries]
      : [];
  const queries = explicit.length ? explicit : [aiPlan.nextTrackQuery, /[\u4e00-\u9fff]/.test(text) ? text : "", channel.query];
  return [...new Set(queries.map((query) => String(query || "").trim()).filter(Boolean))].slice(0, 5);
}

function normalizeExistingQueue(payload, provider) {
  return (Array.isArray(payload.queue) ? payload.queue : [])
    .filter(Boolean)
    .map((track, index) => enrichTrack(track, provider, index));
}

function trackDedupeKey(track) {
  return `${String(track.title || "").trim().toLowerCase()}::${String(track.artist || "").trim().toLowerCase()}`;
}

function mergeConversation(existing, userText, djText, whyThisSong, options = {}) {
  const conversation = Array.isArray(existing) ? existing.slice(-16) : [];
  if (userText) conversation.push({ role: "user", text: userText });
  let text = djText || "我在。你慢慢说。";
  if (whyThisSong && options.includeReason !== false) {
    text = `${text} 我先放这首，是因为${String(whyThisSong).replace(/^因为/, "")}`;
  }
  conversation.push({ role: "dj", text });
  return conversation.slice(-18);
}

function buildState(localState, aiPlan, channel, text) {
  return {
    ...localState,
    signal: {
      channel: aiPlan.moodChannel || channel.label || localState.signal.channel,
      source: text ? "你的输入 + 当前频道 + 网易云候选" : "当前频道 + 网易云候选",
      strategy: aiPlan.strategy || localState.signal.strategy,
    },
    djLine: aiPlan.djText,
    reason: aiPlan.whyThisSong,
    next: aiPlan.hostQuestion || `我会继续听你的状态调整下一首。`,
  };
}

async function collectQueue({ aiPlan, text, channel, payload, provider }) {
  const queries = normalizeQueries(aiPlan, text, channel);
  const recent = new Set([
    ...(payload.recentTrackIds || []),
    ...(payload.blockedTrackIds || []),
    ...normalizeExistingQueue(payload, provider).map((track) => track.id),
  ]);
  const seen = new Set();
  const seenNames = new Set(normalizeExistingQueue(payload, provider).map(trackDedupeKey));
  const tracks = [];
  for (const query of queries) {
    const results = await provider.searchTracks(query, aiPlan.moodChannel);
    for (const rawTrack of results || []) {
      const track = enrichTrack(rawTrack, provider, tracks.length);
      const nameKey = trackDedupeKey(track);
      if (!track.id || seen.has(track.id) || recent.has(track.id) || seenNames.has(nameKey)) continue;
      const playback = await provider.getPlaybackSource(track.id);
      if (!playback || !["cli", "stream"].includes(playback.mode)) continue;
      seen.add(track.id);
      seenNames.add(nameKey);
      tracks.push(track);
      if (tracks.length >= 8) break;
    }
    if (tracks.length >= 8) break;
  }
  return tracks;
}

function createRadioService({ aiProvider, musicProvider }) {
  async function buildPlan(payload = {}, options = {}) {
    const text = String(payload.text || "").trim() || "此时此刻，适合什么。";
    const channel = findChannel(payload.channel || payload.channelId || payload.channelLabel || "");
    const previousState = payload.state && Number.isInteger(payload.state.current)
      ? selectTrack({ ...getInitialState(), ...payload.state }, payload.state.current)
      : getInitialState();
    const localState = routeMoodInput(previousState, text || channel.query);
    const currentTrack = payload.currentTrack || TRACKS[localState.current];
    const existingQueue = normalizeExistingQueue(payload, musicProvider);
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
    });

    const changeQueue = options.forceQueueChange || shouldChangeQueue(aiPlan, text);
    const queue = changeQueue
      ? await collectQueue({ aiPlan, text, channel, payload, provider: musicProvider })
      : (existingQueue.length ? existingQueue : [enrichTrack(currentTrack, musicProvider, 0)]);
    const recommendedTrack = queue[0] || enrichTrack(currentTrack, musicProvider, 0);
    const playback = await musicProvider.getPlaybackSource(recommendedTrack.id);
    const state = buildState(localState, aiPlan, channel, text);
    const conversation = mergeConversation(payload.conversation, payload.text || "", aiPlan.djText, aiPlan.whyThisSong, {
      includeReason: changeQueue,
    });

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
      currentTrack: recommendedTrack,
      track: recommendedTrack,
      queue,
      queueChanged: Boolean(changeQueue),
      intent: aiPlan.intent || inferIntent(text),
      searchQueries: changeQueue ? normalizeQueries(aiPlan, text, channel) : [],
      conversation,
      channel: {
        id: channel.id,
        label: aiPlan.moodChannel || channel.label,
        description: channel.description,
      },
      dj: {
        text: aiPlan.djText,
        reason: aiPlan.whyThisSong,
        question: aiPlan.hostQuestion || "",
        strategy: aiPlan.strategy || "",
        trackIntro: aiPlan.trackIntro || "",
      },
      state,
      ui: {
        statusText: aiStatusText(aiPlan),
        platformText: platformText(musicProvider),
        playbackText: playbackText(playback),
      },
    };
  }

  return {
    plan(payload = {}) {
      return buildPlan(payload, { forceQueueChange: true });
    },

    chat(payload = {}) {
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
      return buildPlan({ text: nextState.lastInput || "继续播放", state: nextState, conversation: payload.conversation }, { forceQueueChange: true });
    },
  };
}

module.exports = {
  CHANNELS,
  createRadioService,
  resolveTrackId,
  inferIntent,
  normalizeQueries,
};
