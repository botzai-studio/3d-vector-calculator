import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(ROOT, "public");
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const DEFAULT_PORT = 4100;
const FILES = new Map([
  ["index.html", "index.html"],
  ["app.js", "app.js"],
  ["math.js", "math.js"],
  ["scene.js", "scene.js"],
  ["storage.js", "storage.js"],
  ["styles.css", "styles.css"],
  ["demo.js", "demo.js"],
]);

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

function listenPort() {
  const raw = process.env.PORT;
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return DEFAULT_PORT;
  return port;
}

export function bindHost() {
  return process.env.HOST === "::1" ? "::1" : "127.0.0.1";
}

const reads = new Map();

function allowRead(ip) {
  const key = ip || "local";
  const now = Date.now();
  const bucket = reads.get(key) ?? { start: now, count: 0 };
  if (now - bucket.start > 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  reads.set(key, bucket);
  return bucket.count <= 600;
}

function requestTarget(rawUrl) {
  const raw = String(rawUrl ?? "/");
  const stop = ["?", "#"].reduce((end, mark) => {
    const index = raw.indexOf(mark);
    return index === -1 ? end : Math.min(end, index);
  }, raw.length);
  return raw.slice(0, stop);
}

function publicName(rawUrl) {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(requestTarget(rawUrl), "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("\\") || pathname.includes("..")) return null;
  const requested = pathname === "/" ? "index.html" : pathname.split("/").filter(Boolean).map((part) => path.basename(part)).join("/");
  return FILES.has(requested) ? requested : null;
}

function loadPublic() {
  const root = path.resolve(PUBLIC_DIR);
  const out = new Map();
  for (const name of FILES.keys()) {
    const leaf = path.basename(name);
    const file = path.resolve(root, leaf);
    if (!file.startsWith(root + path.sep)) continue;
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2_000_000) continue;
    out.set(leaf, fs.readFileSync(file));
  }
  return out;
}

function cached(files, name) {
  switch (name) {
    case "index.html": return files.get("index.html");
    case "app.js": return files.get("app.js");
    case "math.js": return files.get("math.js");
    case "scene.js": return files.get("scene.js");
    case "storage.js": return files.get("storage.js");
    case "styles.css": return files.get("styles.css");
    case "demo.js": return files.get("demo.js");
    default: return undefined;
  }
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  const payload = body ?? "";
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(payload),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups; base-uri 'none'; object-src 'none'",
  });
  res.end(payload);
}

export function createServer() {
  const files = loadPublic();
  return http.createServer((req, res) => {
    if (!allowRead(req.socket.remoteAddress)) {
      send(res, 429, req.method === "HEAD" ? "" : "Too many requests");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": 0,
      });
      res.end();
      return;
    }
    const name = publicName(req.url);
    const body = name ? cached(files, name) : undefined;
    if (!body) {
      send(res, 404, req.method === "HEAD" ? "" : "Not found");
      return;
    }
    const type = MIME_TYPES.get(path.extname(name).toLowerCase()) ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body.length,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups; base-uri 'none'; object-src 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });
}

if (isDirectRun()) {
  const port = listenPort();
  const host = bindHost();
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`3D Vector Calculator serving public/ on http://${host}:${port}`);
  });
}
