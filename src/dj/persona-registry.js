function normalizePersona(persona) {
  if (!persona || !persona.id) return null;
  return {
    ...persona,
    id: String(persona.id),
    name: String(persona.name || persona.id),
    description: String(persona.description || ""),
  };
}

function loadBundledPersonas() {
  try {
    return require("./personas/index.js");
  } catch {
    return [];
  }
}

function mapPersonas(personas) {
  const map = new Map();
  for (const rawPersona of personas || []) {
    const persona = normalizePersona(rawPersona);
    if (persona) map.set(persona.id, persona);
  }
  return map;
}

function loadPersonas(dir) {
  let fs;
  let path;
  try {
    fs = require("node:fs");
    path = require("node:path");
  } catch {
    return mapPersonas(loadBundledPersonas());
  }

  const targetDir = dir || path.join(__dirname, "personas");
  if (!fs.existsSync(targetDir)) return dir ? new Map() : mapPersonas(loadBundledPersonas());
  const files = fs.readdirSync(targetDir)
    .filter((file) => file.endsWith(".js"))
    .filter((file) => file !== "index.js")
    .sort();
  const map = new Map();
  for (const file of files) {
    const fullPath = path.join(targetDir, file);
    try {
      delete require.cache[require.resolve(fullPath)];
      const persona = normalizePersona(require(fullPath));
      if (persona) map.set(persona.id, persona);
    } catch {}
  }
  return map;
}

function resolvePersona(registry, id) {
  if (!registry || !id) return null;
  return registry.get(String(id)) || null;
}

function listPersonas(registry) {
  if (!registry) return [];
  return Array.from(registry.values()).map((persona) => ({
    id: persona.id,
    name: persona.name,
    description: persona.description || "",
  }));
}

module.exports = {
  loadPersonas,
  resolvePersona,
  listPersonas,
};
