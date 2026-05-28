    const {
      TRACKS: tracks,
      getInitialState,
      routeMoodInput,
      selectTrack: coreSelectTrack,
      toggleFavorite,
      buildContextUsed,
      getPlaybackSource,
    } = window.MoonlightCore;

    let playing = false;
    let elapsedSeconds = 86;
    const likedTracks = new Set(JSON.parse(localStorage.getItem("moonlight-liked") || "[]"));
    let radioState = getInitialState(likedTracks);

    const title = document.getElementById("trackTitle");
    const artist = document.getElementById("trackArtist");
    const trackList = document.getElementById("trackList");
    const playBtn = document.getElementById("playBtn");
    const favBtn = document.getElementById("favBtn");
    const djLine = document.getElementById("djLine");
    const moodCard = document.getElementById("moodCard");
    const progressBar = document.getElementById("progressBar");
    const reasonCopy = document.getElementById("reasonCopy");
    const nextCopy = document.getElementById("nextCopy");
    const channelName = document.getElementById("channelName");
    const signalChannel = document.getElementById("signalChannel");
    const signalSource = document.getElementById("signalSource");
    const signalStrategy = document.getElementById("signalStrategy");
    const flowInput = document.getElementById("flowInput");
    const djReasonInline = document.getElementById("djReasonInline");
    const contextCopy = document.getElementById("contextCopy");
    const likedCount = document.getElementById("likedCount");
    const elapsed = document.getElementById("elapsed");
    const duration = document.getElementById("duration");
    const audioPlayer = document.getElementById("audioPlayer");
    const aiStatus = document.getElementById("aiStatus");
    const musicStatus = document.getElementById("musicStatus");
    const playbackStatus = document.getElementById("playbackStatus");
    const liveStatus = document.getElementById("liveStatus");
    const sendBtn = document.getElementById("sendBtn");
    const API_BASE = location.protocol === "file:" ? "http://localhost:8787" : "";
    let playbackMode = "simulation";
    let currentPlayback = { mode: "simulation", url: "", reason: "本地模拟播放" };
    let visibleQueue = tracks.map((track) => ({ ...track, sourceLabel: "本地曲库" }));

    function escapeHtml(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char]));
    }

    function secondsFromDuration(value) {
      const [minutes, seconds] = value.split(":").map(Number);
      return minutes * 60 + seconds;
    }

    function formatTime(totalSeconds) {
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      return `${minutes}:${seconds}`;
    }

    function saveLikedTracks() {
      localStorage.setItem("moonlight-liked", JSON.stringify(radioState.likedTitles));
    }

    function updatePlaybackUi() {
      const track = tracks[radioState.current];
      const total = secondsFromDuration(track.duration);
      const percent = Math.min(100, Math.max(0, (elapsedSeconds / total) * 100));
      elapsed.textContent = formatTime(elapsedSeconds);
      duration.textContent = track.duration;
      progressBar.style.width = `${percent}%`;
      playBtn.textContent = playing ? "Ⅱ" : "▶";
      const liked = radioState.likedTitles.includes(track.title);
      favBtn.textContent = liked ? "♥" : "♡";
      favBtn.style.color = liked ? "var(--green)" : "var(--text)";
      likedCount.textContent = radioState.likedTitles.length;
    }

    function setIntegrationStatus(status) {
      if (!status) return;
      if (status.ai) aiStatus.textContent = status.ai;
      if (status.music) musicStatus.textContent = status.music;
      if (status.playback) playbackStatus.textContent = status.playback;
    }

    function describeNeteaseStatus(music) {
      if (!music || !music.configured) return "网易云 API 未配置";
      if (music.reachable === false) return "网易云 API 不可达";
      if (!music.supportsSearch) return "网易云搜索不可用";
      if (!music.loggedIn && !music.supportsPlaybackUrl) return "搜索可用，未登录/播放受限";
      if (!music.supportsPlaybackUrl) return "搜索可用，播放受限";
      if (!music.loggedIn) return "API 可用，未登录";
      return "网易云 API 已就绪";
    }

    function syncPlaybackSource(sourceOverride) {
      const localSource = getPlaybackSource(tracks[radioState.current]);
      const source = sourceOverride || localSource;
      currentPlayback = source;
      playbackMode = source.mode === "stream" ? "audio" : source.mode;
      if ((source.mode === "audio" || source.mode === "stream") && audioPlayer.src !== source.url) {
        audioPlayer.src = source.url;
      }
      if (source.mode === "simulation" || source.mode === "external" || source.mode === "unavailable") {
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
      }
      const playbackLabel = source.mode === "stream" || source.mode === "audio"
        ? "真实音频"
        : source.mode === "cli"
          ? "网易云 CLI 播放"
        : source.mode === "external"
          ? "外部平台打开"
          : source.mode === "unavailable"
            ? "无播放授权"
            : "模拟播放";
      setIntegrationStatus({ playback: playbackLabel });
    }

    function playCurrentSource() {
      if (playbackMode === "audio") {
        audioPlayer.play().catch(() => {
          playbackMode = "simulation";
          setIntegrationStatus({ playback: "音频失败，回退模拟" });
        });
        return;
      }
      if (playbackMode === "cli") {
        fetch(`${API_BASE}/api/music/play`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentPlayback),
        })
          .then((response) => response.json())
          .then((result) => {
            playing = Boolean(result.ok);
            liveStatus.textContent = result.reason || (result.ok ? "网易云 CLI 正在播放" : "网易云 CLI 播放失败");
            setIntegrationStatus({ playback: result.ok ? "网易云 CLI 播放中" : "CLI 播放失败" });
            updatePlaybackUi();
          })
          .catch(() => {
            playing = false;
            liveStatus.textContent = "网易云 CLI 播放失败";
            setIntegrationStatus({ playback: "CLI 播放失败" });
            updatePlaybackUi();
          });
        return;
      }
      if (playbackMode === "external" && currentPlayback.url) {
        window.open(currentPlayback.url, "_blank", "noopener");
        playing = false;
        liveStatus.textContent = "这首需要在网易云外部打开";
        return;
      }
      if (playbackMode === "unavailable") {
        playing = false;
        liveStatus.textContent = currentPlayback.reason || "当前没有可播放授权";
      }
    }

    function stopCurrentSource() {
      if (playbackMode === "cli") {
        fetch(`${API_BASE}/api/music/stop`, { method: "POST" })
          .then((response) => response.json())
          .then((result) => {
            liveStatus.textContent = result.reason || "网易云 CLI 已停止播放";
            setIntegrationStatus({ playback: "网易云 CLI 已停止" });
          })
          .catch(() => {
            liveStatus.textContent = "网易云 CLI 停止失败";
          });
        return;
      }
      audioPlayer.pause();
    }

    function renderContext() {
      const contextRows = buildContextUsed(radioState, document.getElementById("clock").textContent);
      if (currentPlayback.mode && currentPlayback.mode !== "simulation") {
        const sourceRow = contextRows.find((row) => row.label === "播放源");
        if (sourceRow) sourceRow.value = playbackStatus.textContent;
      }
      contextCopy.innerHTML = contextRows.map((row) =>
        `<div><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`
      ).join("");
    }

    function updateSignal() {
      signalChannel.textContent = radioState.signal.channel;
      signalSource.textContent = radioState.signal.source;
      signalStrategy.textContent = radioState.signal.strategy;
      flowInput.textContent = radioState.flowInput;
      renderContext();
    }

    function renderQueue() {
      trackList.innerHTML = visibleQueue.map((track, index) => `
        <div class="track ${index === radioState.current ? "active" : ""}" data-index="${index}">
          <div class="track-index">${index === radioState.current ? "▶" : String(index + 1).padStart(2, "0")}</div>
          <div>
            <div class="track-name">${escapeHtml(track.title)}</div>
            <div class="artist">${escapeHtml(track.artist)} · ${escapeHtml(track.mood || "Moonlight")}</div>
            <span class="source-badge">${escapeHtml(track.sourceLabel || "本地曲库")}</span>
          </div>
          <div class="duration">${escapeHtml(track.duration || "--")}</div>
        </div>
      `).join("");
    }

    function applyRadioPlan(result, text) {
      if (!result || !result.state) return false;
      radioState = result.state;
      const track = tracks[radioState.current];
      visibleQueue = Array.isArray(result.queue) && result.queue.length
        ? result.queue.map((item, index) => ({
          ...tracks[index % tracks.length],
          ...item,
          sourceLabel: item.sourceLabel || (result.music && result.music.provider === "netease" ? "网易云推荐" : "本地曲库"),
        }))
        : tracks.map((item) => ({ ...item, sourceLabel: "本地曲库" }));
      visibleQueue[radioState.current] = {
        ...visibleQueue[radioState.current],
        ...track,
        sourceLabel: result.track && result.track.sourceLabel ? result.track.sourceLabel : visibleQueue[radioState.current].sourceLabel,
      };
      elapsedSeconds = Math.floor(secondsFromDuration(track.duration) * 0.18);
      syncPlaybackSource(result.playback);
      if (playing) playCurrentSource();
      title.textContent = track.title;
      artist.textContent = track.artist;
      channelName.textContent = track.channel;
      moodCard.textContent = `你说：“${text}”。${result.ui.statusText}，${result.ui.platformText}。`;
      djLine.textContent = radioState.djLine;
      reasonCopy.textContent = radioState.reason;
      djReasonInline.textContent = radioState.reason;
      nextCopy.textContent = radioState.next;
      setIntegrationStatus({
        ai: result.ui.statusText,
        music: result.ui.platformText,
        playback: result.ui.playbackText,
      });
      liveStatus.textContent = result.ui.statusText === "AI 已连接" ? "真实 AI DJ is speaking..." : "月亮 DJ is speaking...";
      updateSignal();
      updatePlaybackUi();
      renderQueue();
      return true;
    }

    async function requestRadioPlan(text) {
      const response = await fetch(`${API_BASE}/api/radio/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          state: {
            current: radioState.current,
            likedTitles: radioState.likedTitles,
            lastInput: radioState.lastInput,
          },
        }),
      });
      if (!response.ok) throw new Error(`Radio plan failed: ${response.status}`);
      return response.json();
    }

    function selectTrack(index) {
      if (playbackMode === "cli" && playing) {
        fetch(`${API_BASE}/api/music/stop`, { method: "POST" }).catch(() => {});
      }
      radioState = coreSelectTrack(radioState, index);
      const track = tracks[radioState.current];
      title.textContent = track.title;
      artist.textContent = track.artist;
      channelName.textContent = track.channel;
      elapsedSeconds = Math.floor(secondsFromDuration(track.duration) * 0.18);
      syncPlaybackSource();
      djLine.textContent = radioState.djLine;
      reasonCopy.textContent = radioState.reason;
      djReasonInline.textContent = radioState.reason;
      nextCopy.textContent = radioState.next;
      updateSignal();
      updatePlaybackUi();
      renderQueue();
      if (playing) playCurrentSource();
    }

    trackList.addEventListener("click", (event) => {
      const row = event.target.closest(".track");
      if (!row) return;
      selectTrack(Number(row.dataset.index));
    });

    document.getElementById("prevBtn").addEventListener("click", () => selectTrack(radioState.current - 1));
    document.getElementById("nextBtn").addEventListener("click", () => selectTrack(radioState.current + 1));

    playBtn.addEventListener("click", () => {
      playing = !playing;
      if (playing) {
        playCurrentSource();
      } else {
        stopCurrentSource();
      }
      if (playbackMode === "external" || playbackMode === "unavailable") {
        updatePlaybackUi();
        return;
      }
      updatePlaybackUi();
      djLine.textContent = playing
        ? "我会继续放着。你不用马上回应，让这首歌先替你把情绪接住。"
        : "暂停也可以。电台会在这里等你，等你准备好再继续。";
    });

    favBtn.addEventListener("click", () => {
      radioState = toggleFavorite(radioState);
      saveLikedTracks();
      updatePlaybackUi();
      renderContext();
    });

    sendBtn.addEventListener("click", async () => {
      const input = document.getElementById("moodInput");
      const text = input.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      sendBtn.textContent = "调频中";
      liveStatus.textContent = "正在生成 DJ 串场...";
      setIntegrationStatus({ ai: "AI 生成中" });
      try {
        const result = await requestRadioPlan(text);
        if (applyRadioPlan(result, text)) {
          input.value = "";
          return;
        }
      } catch (error) {
        setIntegrationStatus({ ai: "本地规则回退", music: "后端未连接" });
        liveStatus.textContent = "后端未连接，使用本地规则";
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "发送给 DJ";
      }
      radioState = routeMoodInput(radioState, text);
      const track = tracks[radioState.current];
      elapsedSeconds = Math.floor(secondsFromDuration(track.duration) * 0.18);
      syncPlaybackSource();
      if (playing) playCurrentSource();
      title.textContent = track.title;
      artist.textContent = track.artist;
      channelName.textContent = track.channel;
      moodCard.textContent = radioState.moodCard;
      djLine.textContent = radioState.djLine;
      reasonCopy.textContent = radioState.reason;
      djReasonInline.textContent = radioState.reason;
      nextCopy.textContent = radioState.next;
      updateSignal();
      updatePlaybackUi();
      renderQueue();
      input.value = "";
    });

    document.getElementById("moodInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("sendBtn").click();
      }
    });

    setInterval(() => {
      if (!playing) return;
      if (playbackMode === "audio" && Number.isFinite(audioPlayer.duration)) {
        elapsedSeconds = Math.floor(audioPlayer.currentTime);
        if (audioPlayer.ended) {
          selectTrack(radioState.current + 1);
          playing = true;
          playCurrentSource();
        }
        updatePlaybackUi();
        return;
      }
      const total = secondsFromDuration(tracks[radioState.current].duration);
      elapsedSeconds += 1;
      if (elapsedSeconds >= total) {
        selectTrack(radioState.current + 1);
        playing = true;
      }
      updatePlaybackUi();
    }, 1000);

    function tickClock() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      document.getElementById("clock").textContent = `${h}:${m}`;
    }

    function syncRecommendationPanel() {
      const panel = document.querySelector(".insight-stack");
      if (!panel) return;
      panel.open = window.innerWidth > 820;
    }

    async function hydrateBackendStatus() {
      try {
        const response = await fetch(API_BASE + "/api/status");
        if (!response.ok) throw new Error("status unavailable");
        const status = await response.json();
        let musicText = "本地曲库";
        if (status.music.provider === "netease-cli") {
          if (!status.music.configured) musicText = "网易云 CLI 未配置";
          else if (!status.music.loggedIn) musicText = "网易云 CLI 未登录";
          else if (!status.music.playerReady) musicText = "网易云 CLI 缺少播放器";
          else if (!status.music.supportsSearch) musicText = "网易云 CLI 无搜索命令";
          else musicText = "网易云 CLI 已就绪";
        } else if (status.music.provider === "netease") {
          musicText = describeNeteaseStatus(status.music);
        }
        setIntegrationStatus({
          ai: status.ai.provider === "openai" && status.ai.configured ? "AI 已连接" : "AI 模拟中",
          music: musicText,
        });
      } catch (error) {
        setIntegrationStatus({ ai: "本地规则", music: "后端未连接", playback: "模拟播放" });
      }
    }

    renderQueue();
    updateSignal();
    syncPlaybackSource();
    updatePlaybackUi();
    syncRecommendationPanel();
    hydrateBackendStatus();
    window.addEventListener("resize", syncRecommendationPanel);
    tickClock();
    setInterval(tickClock, 1000);

    (() => {
      const core = window.MoonlightCore;
      const apiBase = location.protocol === "file:" ? "http://localhost:8787" : "";
      const $ = (selector) => document.querySelector(selector);
      const byId = (id) => document.getElementById(id);
      const resetNode = (id) => {
        const node = byId(id);
        const clone = node.cloneNode(true);
        node.replaceWith(clone);
        return clone;
      };

      const ui = {
        trackList: resetNode("trackList"),
        queueCount: $(".queue .count"),
        playBtn: resetNode("playBtn"),
        prevBtn: resetNode("prevBtn"),
        nextBtn: resetNode("nextBtn"),
        favBtn: resetNode("favBtn"),
        sendBtn: resetNode("sendBtn"),
        moodInput: resetNode("moodInput"),
        title: byId("trackTitle"),
        artist: byId("trackArtist"),
        channelName: byId("channelName"),
        liveStatus: byId("liveStatus"),
        progress: $(".progress"),
        progressBar: byId("progressBar"),
        elapsed: byId("elapsed"),
        duration: byId("duration"),
        volumeSlider: byId("volumeSlider"),
        volumeValue: byId("volumeValue"),
        audio: byId("audioPlayer"),
        aiStatus: byId("aiStatus"),
        musicStatus: byId("musicStatus"),
        playbackStatus: byId("playbackStatus"),
        moodCard: byId("moodCard"),
        reasonCopy: byId("reasonCopy"),
        nextCopy: byId("nextCopy"),
        signalChannel: byId("signalChannel"),
        signalSource: byId("signalSource"),
        signalStrategy: byId("signalStrategy"),
        flowInput: byId("flowInput"),
        contextCopy: byId("contextCopy"),
        likedCount: byId("likedCount"),
        djCard: $(".dj-card"),
      };

      const scheduleChannels = [
        { id: "warm", label: "情绪回温" },
        { id: "deep", label: "深度陪伴" },
        { id: "night", label: "夜间慢放" },
      ];
      const libraryChannels = [
        { id: "private", label: "私人 DJ" },
        { id: "breathe", label: "低速呼吸" },
        { id: "night", label: "夜间慢放" },
        { id: "deep", label: "深度工作" },
        { id: "alone", label: "中文独立" },
        { id: "rain", label: "雨夜房间" },
      ];

      const html = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char]));
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const secondsFromDuration = (value) => {
        if (typeof value === "number" && Number.isFinite(value)) return value > 1000 ? Math.round(value / 1000) : value;
        const match = String(value || "").match(/^(\d+):(\d{1,2})$/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
      };
      const formatTime = (value) => {
        const seconds = Math.max(0, Math.floor(Number(value) || 0));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      };

      const liked = new Set(JSON.parse(localStorage.getItem("moonlight-liked") || "[]"));
      let state = core.getInitialState(liked);
      let queue = core.TRACKS.map((track, index) => normalizeTrack(track, index));
      let currentIndex = 0;
      let currentTrack = queue[0];
      let playback = { mode: "simulation", reason: "本地模拟播放" };
      let playingNow = false;
      let elapsedNow = 0;
      let volumeNow = clamp(Number(localStorage.getItem("moonlight-volume") || 64), 0, 100);
      let channel = { id: "warm", label: "情绪回温" };
      let conversation = [];
      let recentTrackIds = JSON.parse(localStorage.getItem("moonlight-recent-tracks") || "[]");
      let blockedTrackIds = [];
      let lastIntroducedTrackId = "";
      let autoAdvancing = false;

      function normalizeTrack(track, index) {
        const fallback = core.TRACKS[index % core.TRACKS.length] || core.TRACKS[0];
        const merged = { ...fallback, ...track };
        return {
          ...merged,
          id: merged.id || `local-${index + 1}`,
          durationSeconds: merged.durationSeconds || secondsFromDuration(merged.duration),
          sourceLabel: merged.sourceLabel || "本地曲库",
        };
      }

      function saveConversation() {
        conversation = conversation.slice(-24);
      }

      function rememberTrack(track) {
        if (!track || !track.id) return;
        recentTrackIds = [track.id, ...recentTrackIds.filter((id) => id !== track.id)].slice(0, 24);
        localStorage.setItem("moonlight-recent-tracks", JSON.stringify(recentTrackIds));
      }

      function statusText(mode) {
        if (mode === "cli") return "网易云 CLI 播放";
        if (mode === "stream" || mode === "audio") return "真实音频";
        if (mode === "external") return "外部打开";
        if (mode === "unavailable") return "无播放权限";
        return "模拟播放";
      }

      function playbackFromTrack(track) {
        if (track.originalId && track.encryptedId) return { ...track, mode: "cli", reason: "网易云 CLI 将通过项目内 mpv 播放" };
        if (track.audioUrl) return { mode: "stream", url: track.audioUrl, reason: "本地授权音频" };
        if (track.externalUrl) return { mode: "external", url: track.externalUrl, reason: "这首需要在网易云外部打开" };
        return { mode: "unavailable", reason: "当前没有可播放音源" };
      }

      function setStatuses(values) {
        if (values.ai) ui.aiStatus.textContent = values.ai;
        if (values.music) ui.musicStatus.textContent = values.music;
        if (values.playback) ui.playbackStatus.textContent = values.playback;
      }

      function renderPlayer() {
        const total = currentTrack.durationSeconds || secondsFromDuration(currentTrack.duration) || 1;
        ui.title.textContent = currentTrack.title || "Moonlight";
        ui.artist.textContent = currentTrack.artist || "Moonlight";
        ui.channelName.textContent = `${state.signal.channel || channel.label} · ${currentTrack.sourceLabel || "Moonlight"}`;
        ui.elapsed.textContent = formatTime(elapsedNow);
        ui.duration.textContent = currentTrack.duration || formatTime(total);
        ui.progressBar.style.width = `${clamp((elapsedNow / total) * 100, 0, 100)}%`;
        ui.playBtn.textContent = playingNow ? "Ⅱ" : "▶";
        const isLiked = state.likedTitles.includes(currentTrack.title);
        ui.favBtn.textContent = isLiked ? "♥" : "♡";
        ui.favBtn.style.color = isLiked ? "var(--green)" : "var(--text)";
        ui.likedCount.textContent = state.likedTitles.length;
        ui.volumeSlider.value = String(volumeNow);
        ui.volumeSlider.style.background = `linear-gradient(90deg, var(--green) ${volumeNow}%, #343741 ${volumeNow}%)`;
        ui.volumeValue.textContent = String(volumeNow);
      }

      function commitVolume(level) {
        volumeNow = clamp(Math.round(level), 0, 100);
        localStorage.setItem("moonlight-volume", String(volumeNow));
        renderPlayer();
        if (playback.mode === "cli") {
          fetch(`${apiBase}/api/music/volume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volume: volumeNow }),
          }).catch(() => {});
        }
        ui.audio.volume = volumeNow / 100;
      }

      function renderQueue() {
        ui.queueCount.textContent = `${queue.length} TRACKS`;
        ui.trackList.innerHTML = queue.map((track, index) => `
          <div class="track ${index === currentIndex ? "active" : ""}" data-index="${index}">
            <div class="track-index">${index === currentIndex ? "▶" : String(index + 1).padStart(2, "0")}</div>
            <div>
              <div class="track-name">${html(track.title)}</div>
              <div class="artist">${html(track.artist)} · ${html(track.unavailable ? (track.unavailableReason || "无播放权限") : (track.mood || "Moonlight"))}</div>
              <span class="source-badge">${html(track.sourceLabel || "本地曲库")}</span>
            </div>
            <div class="duration">${html(track.duration || "--")}</div>
          </div>
        `).join("");
      }

      function renderConversation() {
        const messages = conversation.length ? conversation : [
          { role: "dj", text: "晚上好，我在。你可以直接和我说今天发生了什么、想避开什么声音，或者点左边频道让我先帮你开一段。" },
        ];
        ui.djCard.innerHTML = `
          <div class="dj-section-label">月亮 DJ</div>
          <div class="dj-history">
            ${messages.map((message) => `
              <p class="dj-message ${message.role === "user" ? "user" : "dj"}">${html(message.role === "user" ? `你：${message.text}` : `月亮：${message.text}`)}</p>
            `).join("")}
          </div>
        `;
        const history = ui.djCard.querySelector(".dj-history");
        if (history) history.scrollTop = history.scrollHeight;
      }

      function describeTrackForDj(track) {
        const title = track.title || "这首歌";
        const artist = track.artist || "这位音乐人";
        const mood = track.mood || track.channelShort || channel.label || "当前频道";
        const source = track.sourceLabel || "当前歌单";
        const reason = track.reason || state.reason || "它和你刚才给我的状态比较贴近，能把节奏放稳，不会突然把情绪推得太满。";
        const duration = track.duration ? `，时长 ${track.duration}` : "";
        return `现在开始放《${title}》。这首来自 ${artist}${duration}，我把它放在「${mood}」这一段里。${reason} 如果你愿意，可以边听边告诉我它给你的感觉，我会继续顺着你的状态往下排。`;
      }

      function introduceCurrentTrack() {
        if (!currentTrack || !currentTrack.title) return;
        const introKey = currentTrack.id || `${currentTrack.title}-${currentTrack.artist}`;
        if (introKey && introKey === lastIntroducedTrackId) return;
        lastIntroducedTrackId = introKey;
        conversation.push({
          role: "dj",
          text: describeTrackForDj(currentTrack),
        });
        saveConversation();
        renderConversation();
        ui.reasonCopy.textContent = currentTrack.reason || state.reason || ui.reasonCopy.textContent;
        ui.nextCopy.textContent = currentTrack.next || "我会听着这首的走向，继续把下一首接得自然一点。";
      }

      function renderSignal() {
        ui.signalChannel.textContent = state.signal.channel || channel.label;
        ui.signalSource.textContent = state.signal.source || "你的输入 + 网易云候选";
        ui.signalStrategy.textContent = state.signal.strategy || "按当前状态重新排队";
        ui.flowInput.textContent = state.flowInput || "心情输入";
        const rows = core.buildContextUsed(state, byId("clock").textContent);
        ui.contextCopy.innerHTML = rows.map((row) =>
          `<div><span>${html(row.label)}</span><strong>${html(row.value)}</strong></div>`
        ).join("");
      }

      function markActiveChannel() {
        document.querySelectorAll(".schedule-item").forEach((item, index) => {
          item.classList.toggle("active", scheduleChannels[index] && scheduleChannels[index].id === channel.id);
        });
        document.querySelectorAll(".chip").forEach((item, index) => {
          item.classList.toggle("active", libraryChannels[index] && libraryChannels[index].id === channel.id);
        });
      }

      function setCurrentTrack(track, index) {
        currentIndex = clamp(index, 0, Math.max(queue.length - 1, 0));
        currentTrack = normalizeTrack(track || queue[currentIndex] || core.TRACKS[0], currentIndex);
        queue[currentIndex] = currentTrack;
        playback = playbackFromTrack(currentTrack);
        elapsedNow = 0;
        state = { ...state, current: currentIndex };
        setStatuses({ playback: statusText(playback.mode) });
        renderPlayer();
        renderQueue();
      }

      async function stopPlayback() {
        if (playback.mode === "cli") {
          try {
            const response = await fetch(`${apiBase}/api/music/stop`, { method: "POST" });
            const result = await response.json();
            ui.liveStatus.textContent = result.reason || "网易云 CLI 已停止播放";
          } catch {
            ui.liveStatus.textContent = "网易云 CLI 停止失败";
          }
        } else {
          ui.audio.pause();
        }
      }

      async function playCurrent() {
        const keepsCurrentPlayback = playback
          && ["cli", "stream"].includes(playback.mode)
          && (!playback.originalId || !currentTrack.originalId || String(playback.originalId) === String(currentTrack.originalId));
        playback = keepsCurrentPlayback ? playback : playbackFromTrack(currentTrack);
        setStatuses({ playback: statusText(playback.mode) });
        if (playback.mode === "stream") {
          ui.audio.src = playback.url;
          await ui.audio.play().then(() => {
            playingNow = true;
            introduceCurrentTrack();
          }).catch(() => {
            playingNow = false;
            ui.liveStatus.textContent = "音频播放失败";
          });
          return;
        }
        if (playback.mode === "cli") {
          try {
            const response = await fetch(`${apiBase}/api/music/play`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...currentTrack, ...playback }),
            });
            const result = await response.json();
            playingNow = Boolean(result.ok);
            ui.liveStatus.textContent = result.reason || (result.ok ? "网易云 CLI 正在播放" : "网易云 CLI 播放失败");
            setStatuses({ playback: result.ok ? "网易云 CLI 播放中" : "CLI 播放失败" });
            if (result.ok && volumeNow > 0) {
              fetch(`${apiBase}/api/music/volume`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ volume: volumeNow }),
              }).catch(() => {});
            }
            if (result.ok) introduceCurrentTrack();
            if (!result.ok) {
              if (currentTrack.id && !blockedTrackIds.includes(currentTrack.id)) blockedTrackIds.push(currentTrack.id);
              const failedTitle = currentTrack.title;
              queue = queue.filter((track) => track.id !== currentTrack.id);
              conversation.push({
                role: "dj",
                text: `《${failedTitle}》这首暂时播不了，我把它从这次歌单里拿掉，直接换下一首。`,
              });
              saveConversation();
              renderConversation();
              if (queue.length) {
                const nextIndex = clamp(currentIndex, 0, queue.length - 1);
                renderQueue();
                await selectQueueTrack(nextIndex);
              } else {
                currentTrack = normalizeTrack(core.TRACKS[0], 0);
                currentIndex = 0;
                playback = { mode: "unavailable", reason: result.reason || "当前歌单没有可播放音源" };
                renderQueue();
                renderPlayer();
              }
            }
          } catch {
            playingNow = false;
            ui.liveStatus.textContent = "网易云 CLI 播放失败";
            setStatuses({ playback: "CLI 播放失败" });
          }
          renderPlayer();
          return;
        }
        if (playback.mode === "external" && playback.url) {
          playingNow = false;
          window.open(playback.url, "_blank", "noopener");
          ui.liveStatus.textContent = "这首需要在网易云外部打开";
          renderPlayer();
          return;
        }
        playingNow = false;
        ui.liveStatus.textContent = playback.reason || "当前没有可播放音源";
        renderPlayer();
      }

      async function selectQueueTrack(index, shouldPlay = true) {
        if (!queue.length) return;
        if (playingNow) await stopPlayback();
        const nextIndex = (index + queue.length) % queue.length;
        setCurrentTrack(queue[nextIndex], nextIndex);
        rememberTrack(currentTrack);
        ui.reasonCopy.textContent = `我把队列切到《${currentTrack.title}》。如果它没有版权或音源，我会直接告诉你。`;
        ui.nextCopy.textContent = "下一首会继续按你刚才的状态往下走。";
        if (shouldPlay) {
          playingNow = true;
          await playCurrent();
        }
        renderPlayer();
      }

      async function advanceToNextTrack(reason = "自然接到下一首") {
        if (autoAdvancing || !queue.length) return;
        autoAdvancing = true;
        try {
          const nextIndex = currentIndex + 1;
          if (nextIndex >= queue.length) {
            playingNow = false;
            ui.liveStatus.textContent = "这组歌单已经播完了。你可以继续告诉我现在想听什么，我再给你接一组。";
            conversation.push({
              role: "dj",
              text: "这组歌单已经播完了。我先把声音收住，你想继续安静一点，还是换个更有陪伴感的方向？",
            });
            saveConversation();
            renderConversation();
            renderPlayer();
            return;
          }
          ui.liveStatus.textContent = reason;
          await selectQueueTrack(nextIndex);
        } finally {
          autoAdvancing = false;
        }
      }

      async function applyRadioResult(result, userText) {
        if (!result || !result.state) return;
        state = result.state;
        channel = result.channel || channel;
        const queueChanged = Boolean(result.queueChanged);
        if (queueChanged) {
          queue = (Array.isArray(result.queue) && result.queue.length ? result.queue : queue).map(normalizeTrack);
          currentIndex = 0;
          currentTrack = normalizeTrack(result.currentTrack || result.track || queue[0], 0);
          queue[0] = currentTrack;
          playback = result.playback && ["cli", "stream"].includes(result.playback.mode)
            ? result.playback
            : playbackFromTrack(currentTrack);
          elapsedNow = 0;
        }
        conversation = Array.isArray(result.conversation) ? result.conversation : conversation;
        saveConversation();
        ui.moodCard.textContent = userText
          ? queueChanged
            ? `你说：“${userText}”。月亮 DJ 已换成一组新的候选。`
            : `你说：“${userText}”。月亮 DJ 先陪你聊，歌单不打断。`
          : `当前频道：${channel.label || state.signal.channel}`;
        ui.reasonCopy.textContent = state.reason || (result.dj && result.dj.reason) || "";
        ui.nextCopy.textContent = state.next || "我会继续听你的状态调整下一首。";
        setStatuses({
          ai: result.ui && result.ui.statusText,
          music: result.ui && result.ui.platformText,
          playback: result.ui && result.ui.playbackText,
        });
        if (result.ai && result.ai.status === "fallback") {
          const detail = result.ai.error ? `：${result.ai.error}` : "";
          setStatuses({ ai: result.ai.error ? `AI 失败：${result.ai.error}` : "AI 请求失败，已回退本地规则" });
          ui.liveStatus.textContent = `AI 临时失败，已用本地 DJ 规则接上${detail}`;
          ui.moodCard.textContent = `${ui.moodCard.textContent} AI 本次没有成功返回，页面先用本地规则继续。`;
        } else {
          ui.liveStatus.textContent = "月亮 DJ 正在说话...";
        }
        renderSignal();
        renderConversation();
        renderPlayer();
        renderQueue();
        markActiveChannel();
        if (queueChanged) {
          rememberTrack(currentTrack);
          playingNow = true;
          await playCurrent();
        }
      }

      async function sendToDj(text) {
        ui.sendBtn.disabled = true;
        ui.sendBtn.textContent = "调频中";
        ui.liveStatus.textContent = "正在生成 DJ 串场...";
        setStatuses({ ai: "AI 生成中" });
        try {
          const response = await fetch(`${apiBase}/api/radio/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              channel: channel.id,
              conversation,
              queue,
              currentTrack,
              recentTrackIds,
              blockedTrackIds,
              state: {
                current: currentIndex,
                likedTitles: state.likedTitles,
                lastInput: state.lastInput,
              },
            }),
          });
          if (!response.ok) throw new Error(`chat failed ${response.status}`);
          await applyRadioResult(await response.json(), text);
        } catch (error) {
          console.error("Moonlight chat request failed", error);
          conversation.push({ role: "user", text }, { role: "dj", text: "我这边刚刚没接上后端，但我还在。歌先不动，你继续说。" });
          saveConversation();
          setStatuses({ ai: "后端请求失败，本地规则回退" });
          ui.liveStatus.textContent = `请求后端失败：${error.message || "unknown error"}`;
          renderSignal();
          renderConversation();
          renderPlayer();
          renderQueue();
        } finally {
          ui.sendBtn.disabled = false;
          ui.sendBtn.textContent = "发送给 DJ";
        }
      }

      async function tuneChannel(nextChannel) {
        channel = nextChannel;
        markActiveChannel();
        ui.liveStatus.textContent = `正在切到${nextChannel.label}...`;
        try {
          const response = await fetch(`${apiBase}/api/radio/channel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: nextChannel.id, conversation, state }),
          });
          if (!response.ok) throw new Error(`channel failed ${response.status}`);
          await applyRadioResult(await response.json(), `切到${nextChannel.label}`);
        } catch {
          await sendToDj(`切到${nextChannel.label}`);
        }
      }

      async function syncCliState() {
        try {
          const response = await fetch(`${apiBase}/api/music/state`);
          if (!response.ok) return;
          const result = await response.json();
          if (Number.isFinite(result.position) && result.position > 0) elapsedNow = result.position;
          if (Number.isFinite(result.duration) && result.duration > 0) currentTrack.durationSeconds = result.duration;
          if (Number.isFinite(result.volume)) {
            const cliVolume = clamp(Math.round(result.volume), 0, 100);
            if (cliVolume > 0 || volumeNow === 0) {
              volumeNow = cliVolume;
              localStorage.setItem("moonlight-volume", String(volumeNow));
            }
          }
          const wasPlaying = playingNow;
          if (result.status === "playing") playingNow = true;
          if (result.status === "paused") playingNow = false;
          if (result.status === "stopped" || result.status === "idle") {
            playingNow = false;
            if (wasPlaying && playback.mode === "cli") {
              await advanceToNextTrack("上一首播完了，Moonlight 正在接下一首。");
              return;
            }
          }
          renderPlayer();
        } catch {}
      }

      async function seekByEvent(event) {
        const rect = ui.progress.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const total = currentTrack.durationSeconds || secondsFromDuration(currentTrack.duration) || 1;
        elapsedNow = Math.round(total * ratio);
        renderPlayer();
        if (playback.mode === "cli") {
          fetch(`${apiBase}/api/music/seek`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds: elapsedNow }),
          }).catch(() => {});
        } else if (playback.mode === "stream" && Number.isFinite(ui.audio.duration)) {
          ui.audio.currentTime = elapsedNow;
        }
      }

      function setVolumeByEvent() {
        commitVolume(Number(ui.volumeSlider.value));
      }

      ui.trackList.addEventListener("click", (event) => {
        const row = event.target.closest(".track");
        if (row) selectQueueTrack(Number(row.dataset.index));
      });
      ui.prevBtn.addEventListener("click", () => selectQueueTrack(currentIndex - 1));
      ui.nextBtn.addEventListener("click", () => selectQueueTrack(currentIndex + 1));
      ui.playBtn.addEventListener("click", async () => {
        playingNow = !playingNow;
        if (playingNow) await playCurrent();
        else await stopPlayback();
        conversation.push({ role: "dj", text: playingNow ? "我继续放着，你慢慢听。" : "暂停也可以。我在这里等你。" });
        saveConversation();
        renderConversation();
        renderPlayer();
      });
      ui.favBtn.addEventListener("click", () => {
        state = core.toggleFavorite({ ...state, current: currentIndex });
        localStorage.setItem("moonlight-liked", JSON.stringify(state.likedTitles));
        renderPlayer();
        renderSignal();
      });
      ui.sendBtn.addEventListener("click", async () => {
        const text = ui.moodInput.value.trim();
        if (!text) return;
        ui.moodInput.value = "";
        await sendToDj(text);
      });
      ui.moodInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          ui.sendBtn.click();
        }
      });
      ui.progress.addEventListener("click", seekByEvent);
      ui.volumeSlider.addEventListener("input", setVolumeByEvent);
      ui.volumeSlider.addEventListener("change", setVolumeByEvent);
      ui.audio.addEventListener("ended", () => {
        advanceToNextTrack("上一首播完了，Moonlight 正在接下一首。");
      });
      document.querySelectorAll(".schedule-item").forEach((item, index) => {
        item.addEventListener("click", () => tuneChannel(scheduleChannels[index]));
      });
      document.querySelectorAll(".chip").forEach((item, index) => {
        item.addEventListener("click", () => tuneChannel(libraryChannels[index]));
      });

      hydrateBackendStatus();
      setCurrentTrack(currentTrack, 0);
      commitVolume(volumeNow);
      renderConversation();
      renderSignal();
      markActiveChannel();
      setInterval(syncCliState, 2000);
    })();
