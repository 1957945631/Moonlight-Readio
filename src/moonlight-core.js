(function attachMoonlightCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MoonlightCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createMoonlightCore() {
  const USER_PROFILE = {
    taste: ["低刺激", "温柔人声", "电子纹理", "中文独立", "夜间慢放"],
    routines: ["早晨回温", "下午专注", "夜间整理"],
    avoid: ["太吵", "突然强节奏", "过度煽情"],
  };

  const SCHEDULE = [
    { time: "09:00-11:00", name: "情绪回温", fit: "适合刚醒来、低能量、需要缓冲的状态。" },
    { time: "14:00-16:00", name: "深度陪伴", fit: "适合写东西、整理思绪、进入专注。" },
    { time: "22:00-00:00", name: "夜间慢放", fit: "适合收尾、复盘、睡前降噪。" },
  ];

  const TRACKS = [
    {
      title: "Monday Night Exhale",
      artist: "If · Bread",
      duration: "3:14",
      mood: "低速呼吸",
      channel: "情绪回温频道 · low-speed breath",
      channelShort: "情绪回温",
      strategy: "先放慢，再进入今天",
      source: "当前时段 + 默认口味",
      reason: "木吉他和低速人声不会抢走注意力，适合从杂乱状态里慢慢回到自己。",
      next: "下一段会把节奏再压低一点，接到一首更适合夜间整理的歌。",
    },
    {
      title: "Fade Into You",
      artist: "Mazzy Star",
      duration: "4:55",
      mood: "夜间慢放",
      channel: "夜间慢放频道 · soft afterglow",
      channelShort: "夜间慢放",
      strategy: "减少刺激，留一点余温",
      source: "夜间节目 + 慢速偏好",
      reason: "朦胧的吉他和拖慢的鼓点适合晚一点听，让情绪停在柔软的位置。",
      next: "月亮 DJ 会把灯光调暗，继续留在安静但不悲伤的范围里。",
    },
    {
      title: "Open Eye Signal",
      artist: "Jon Hopkins",
      duration: "5:18",
      mood: "深度工作",
      channel: "深度工作频道 · focus lane",
      channelShort: "深度工作",
      strategy: "保留节奏，减少打扰",
      source: "专注输入 + 电子纹理",
      reason: "重复推进的电子纹理适合把注意力拉直，进入一段更稳定的专注时间。",
      next: "后面会减少人声，保留节奏和空间感，帮你持续工作。",
    },
    {
      title: "Moon Room",
      artist: "Yerin Baek",
      duration: "3:42",
      mood: "轻微失重",
      channel: "月光房间频道 · floating room",
      channelShort: "轻微失重",
      strategy: "先松开肩膀，再继续",
      source: "情绪输入 + 柔和人声",
      reason: "这首有漂浮感，但不会太空，适合把自己从紧绷里松开一点。",
      next: "下一段会转入更轻的旋律，像把窗户打开一条缝。",
    },
    {
      title: "On the Nature of Daylight",
      artist: "Max Richter",
      duration: "6:13",
      mood: "沉静整理",
      channel: "沉静整理频道 · quiet archive",
      channelShort: "沉静整理",
      strategy: "适合收尾、复盘和独处",
      source: "低刺激偏好 + 弦乐",
      reason: "弦乐会把情绪铺平，适合收尾、复盘，或者安静地待一会儿。",
      next: "月亮 DJ 会少说话，让音乐自己把空间填满。",
    },
    {
      title: "分分钟需要你",
      artist: "林忆莲",
      duration: "3:36",
      mood: "温柔中文",
      channel: "温柔中文频道 · familiar voice",
      channelShort: "温柔中文",
      strategy: "用熟悉的声音陪你一下",
      source: "中文偏好 + 温柔人声",
      reason: "中文旋律更贴近生活感，适合需要一点熟悉和陪伴的时候。",
      next: "后面会继续保持温柔人声，不突然切到强节奏。",
    },
  ];

  function getInitialState(likedTitles) {
    return selectTrack({
      current: 0,
      lastInput: "默认播出",
      flowInput: "当前时段",
      likedTitles: [...(likedTitles || [])],
      moodCard: "当前摘要：还没有新的输入，Moonlight 正在按当前时段和默认口味播出。",
    }, 0, { preserveInput: true });
  }

  function trackSignal(track, sourceOverride) {
    return {
      channel: track.channelShort,
      source: sourceOverride || track.source,
      strategy: track.strategy,
    };
  }

  function selectTrack(state, index, options) {
    const current = (index + TRACKS.length) % TRACKS.length;
    const track = TRACKS[current];
    const lastInput = state.lastInput || "默认播出";
    const flowInput = lastInput === "默认播出" ? "当前时段" : "心情输入";
    return {
      ...state,
      current,
      lastInput,
      flowInput,
      signal: trackSignal(track),
      djLine: options && options.preserveInput
        ? "这首适合放在你刚开始整理思绪的时候。它不会催你，只是把房间里的空气慢慢调亮一点。"
        : `现在切到《${track.title}》。这首歌属于${track.mood}，我会把接下来的几分钟放慢一点。`,
      reason: track.reason,
      next: track.next,
    };
  }

  function routeMoodInput(state, input) {
    const text = input.trim();
    let index = 3;
    if (text.includes("累") || text.includes("安静") || text.includes("不悲伤")) index = 0;
    if (text.includes("工作") || text.includes("专注") || text.includes("代码")) index = 2;
    if (text.includes("睡") || text.includes("夜") || text.includes("慢")) index = 1;
    if (text.includes("中文") || text.includes("熟悉")) index = 5;

    const nextState = selectTrack({ ...state, lastInput: text }, index);
    const track = TRACKS[nextState.current];
    return {
      ...nextState,
      flowInput: "心情输入",
      signal: trackSignal(track, "用户输入 + 本地情绪规则"),
      moodCard: `你说：“${text}”。DJ 已调整为 ${track.mood}，下一段会更贴近你的状态。`,
      djLine: `收到。你现在不需要很用力地进入状态，我先给你一首《${track.title}》，让情绪慢慢落地。`,
      reason: `因为你提到“${text}”，Moonlight 会优先选择低刺激、情绪稳定、不过度煽情的声音。`,
      next: "如果这首合适，下一首会继续沿着同一种情绪密度往下排。",
    };
  }

  function toggleFavorite(state) {
    const title = TRACKS[state.current].title;
    const liked = new Set(state.likedTitles || []);
    if (liked.has(title)) liked.delete(title);
    else liked.add(title);
    return { ...state, likedTitles: [...liked] };
  }

  function buildContextUsed(state, clockText) {
    const playbackSource = getPlaybackSource(TRACKS[state.current]);
    return [
      { label: "时间", value: clockText || "当前时段" },
      { label: "频道", value: TRACKS[state.current].channelShort },
      { label: "收藏偏好", value: state.likedTitles.length ? `${state.likedTitles.length} 首收藏` : "暂无收藏" },
      { label: "最近输入", value: state.lastInput || "默认播出" },
      { label: "播放源", value: playbackSource.mode === "audio" ? "真实音频" : "模拟播放" },
    ];
  }

  function getPlaybackSource(track) {
    return track && track.audioUrl
      ? { mode: "audio", url: track.audioUrl }
      : { mode: "simulation", url: "" };
  }

  return {
    USER_PROFILE,
    SCHEDULE,
    TRACKS,
    getInitialState,
    routeMoodInput,
    selectTrack,
    toggleFavorite,
    buildContextUsed,
    getPlaybackSource,
  };
});
