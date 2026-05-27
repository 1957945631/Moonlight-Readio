const fs = require("node:fs");

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath, target = process.env) {
  if (!fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = unquote(trimmed.slice(equalIndex + 1));
    if (key && target[key] === undefined) target[key] = value;
  }
  return true;
}

module.exports = {
  loadEnvFile,
};
