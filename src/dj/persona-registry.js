const fs = require("node:fs");
const path = require("node:path");

function normalizePersona(persona) {
  if (!persona || !persona.id) return null;
  return {
    ...persona,
    id: String(persona.id),
    name: String(persona.name || persona.id),
    description: String(persona.description || ""),
  };
}

function loadPersonas(dir = path.join(__dirname, "personas")) {
  if (!fs.existsSync(dir)) return new Map();
  const files = fs.readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .sort();
  const map = new Map();
  for (const file of files) {
    const fullPath = path.join(dir, file);
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
