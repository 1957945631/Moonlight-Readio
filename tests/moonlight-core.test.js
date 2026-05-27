const assert = require("node:assert/strict");
const {
  TRACKS,
  getInitialState,
  routeMoodInput,
  selectTrack,
  toggleFavorite,
  buildContextUsed,
  getPlaybackSource,
} = require("../src/moonlight-core.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test("routes focus input to the deep work channel", () => {
  const state = getInitialState();
  const next = routeMoodInput(state, "今天想专注工作，避开太吵的歌");

  assert.equal(TRACKS[next.current].title, "Open Eye Signal");
  assert.equal(next.signal.channel, "深度工作");
  assert.equal(next.signal.source, "用户输入 + 本地情绪规则");
  assert.equal(next.flowInput, "心情输入");
  assert.match(next.reason, /低刺激/);
  assert.match(next.djLine, /Open Eye Signal/);
});

test("selecting a track updates recommendation context", () => {
  const state = selectTrack(getInitialState(), 3);

  assert.equal(TRACKS[state.current].title, "Moon Room");
  assert.equal(state.signal.channel, "轻微失重");
  assert.equal(state.flowInput, "当前时段");
  assert.match(state.reason, /漂浮感/);
});

test("favorites persist in derived context", () => {
  let state = getInitialState();
  state = toggleFavorite(state);
  const context = buildContextUsed(state, "13:30");

  assert.equal(state.likedTitles.length, 1);
  assert.equal(context.find((row) => row.label === "收藏偏好").value, "1 首收藏");
  assert.equal(context.find((row) => row.label === "播放源").value, "模拟播放");
});

test("playback source uses audio url when present and simulation otherwise", () => {
  assert.deepEqual(getPlaybackSource({ title: "No file" }), { mode: "simulation", url: "" });
  assert.deepEqual(getPlaybackSource({ title: "With file", audioUrl: "audio/track.mp3" }), {
    mode: "audio",
    url: "audio/track.mp3",
  });
});
