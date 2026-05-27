const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("./src/env.js");
const { createApiServices, handleApiRequest } = require("./src/api-handler.js");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const WEB_ROOT = path.join(ROOT, "web");
const PROJECT_MPV_DIR = path.join(ROOT, "tools", "mpv");
if (fs.existsSync(path.join(PROJECT_MPV_DIR, "mpv.exe"))) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "PATH";
  process.env[pathKey] = `${PROJECT_MPV_DIR};${process.env[pathKey] || ""}`;
}

const services = createApiServices(process.env);

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveStaticPath(pathname) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const webPath = path.resolve(WEB_ROOT, requested);
  if (isInside(webPath, WEB_ROOT) && fs.existsSync(webPath)) {
    return webPath;
  }

  const rootPath = path.resolve(ROOT, requested);
  if (isInside(rootPath, ROOT) && fs.existsSync(rootPath)) {
    return rootPath;
  }

  return isInside(webPath, WEB_ROOT) || isInside(rootPath, ROOT) ? webPath : null;
}

function serveStatic(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store, max-age=0",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    const apiResponse = await handleApiRequest(new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      duplex: "half",
    }), services);
    if (apiResponse) {
      const headers = Object.fromEntries(apiResponse.headers.entries());
      res.writeHead(apiResponse.status, headers);
      res.end(Buffer.from(await apiResponse.arrayBuffer()));
      return;
    }

    return serveStatic(req, res, url.pathname);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Moonlight server listening at http://localhost:${PORT}`);
});

module.exports = { server };
