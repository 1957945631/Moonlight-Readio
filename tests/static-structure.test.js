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
