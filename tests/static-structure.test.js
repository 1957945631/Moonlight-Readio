const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const root = path.resolve(__dirname, "..");
const webIndexPath = path.join(root, "web", "index.html");
const webCssPath = path.join(root, "web", "styles.css");
const webAppPath = path.join(root, "web", "app.js");
const webCorePath = path.join(root, "web", "moonlight-core.js");

test("frontend assets live under web with external css and script files", () => {
  assert.equal(fs.existsSync(webIndexPath), true);
  assert.equal(fs.existsSync(webCssPath), true);
  assert.equal(fs.existsSync(webAppPath), true);
  assert.equal(fs.existsSync(webCorePath), true);

  const html = fs.readFileSync(webIndexPath, "utf8");
  assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
  assert.match(html, /<script src="moonlight-core\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
  assert.doesNotMatch(html, /<style>/);
  assert.doesNotMatch(html, /<script>\s*const API_BASE/);
});

test("server serves the web directory as the static app root", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /const WEB_ROOT = path\.join\(ROOT, "web"\);/);
  assert.match(server, /pathname === "\/" \? "index\.html"/);
});

test("server updates the inherited path variable without creating Windows duplicates", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /pathKey = Object\.keys\(process\.env\)/);
  assert.doesNotMatch(server, /process\.env\.Path\s*=/);
  assert.doesNotMatch(server, /process\.env\.PATH\s*=/);
});

test("frontend playback guards stream resume and failed track recovery", () => {
  const app = fs.readFileSync(webAppPath, "utf8");
  assert.match(app, /moonlight-blocked-tracks/);
  assert.match(app, /function blockTrack\(track\)/);
  assert.match(app, /async function skipToNextAfterFailure\(failedTrack, reason\)/);
  assert.match(app, /const streamUrl = new URL\(playback\.url, location\.href\)\.href;/);
  assert.match(app, /if \(ui\.audio\.src !== streamUrl\) ui\.audio\.src = playback\.url;/);
  assert.match(app, /await skipToNextAfterFailure\(currentTrack,/);
});

test("frontend schedule starts from real time and avoids technical DJ status copy", () => {
  const app = fs.readFileSync(webAppPath, "utf8");
  assert.match(app, /function resolveScheduleFromTime\(now = new Date\(\)\)/);
  assert.match(app, /let channel = resolveScheduleFromTime\(\);/);
  assert.doesNotMatch(app, /正在生成 DJ 串场/);
  assert.doesNotMatch(app, /月亮 DJ 正在说话/);
});

test("frontend exposes persistent dj persona selection", () => {
  const html = fs.readFileSync(webIndexPath, "utf8");
  const app = fs.readFileSync(webAppPath, "utf8");

  assert.match(html, /id="personaSwitch"/);
  assert.match(html, /data-persona-id="moonlight"/);
  assert.match(html, /data-persona-id="luoyonghao-perspective"/);
  assert.match(app, /moonlight-dj-persona/);
  assert.match(app, /let personaId = resolvePersonaId\(localStorage\.getItem\(PERSONA_KEY\)\);/);
  assert.match(app, /personaId,/);
  assert.match(app, /function setPersona\(nextPersonaId\)/);
});
