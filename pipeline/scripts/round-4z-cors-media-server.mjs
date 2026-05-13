import { createReadStream, existsSync, statSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

const CONTENT_TYPES = new Map([
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".png", "image/png"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

const options = parseArgs(process.argv.slice(2));
const requestedRoot = path.resolve(REPO_ROOT, options.root || "pipeline/r2-upload");
const port = Number(options.port || 4176);
const host = options.host || "127.0.0.1";

if (!existsSync(requestedRoot) || !statSync(requestedRoot).isDirectory()) {
  console.error(`Media root does not exist: ${path.relative(REPO_ROOT, requestedRoot) || requestedRoot}`);
  process.exit(1);
}

const root = await realpath(requestedRoot);

const server = createServer(async (request, response) => {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, OPTIONS" });
    response.end("Method not allowed");
    return;
  }

  const target = await resolveSafeTarget(request.url || "/");
  if (!target.ok) {
    response.writeHead(target.status);
    response.end(target.message);
    return;
  }

  const contentType = CONTENT_TYPES.get(path.extname(target.filePath).toLowerCase()) || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": target.size,
    "Cache-Control": "no-store",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(target.filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Round 4Z CORS media server listening at http://${host}:${port}/`);
  console.log(`Serving ${path.relative(REPO_ROOT, root) || root}`);
});

async function resolveSafeTarget(requestUrl) {
  let pathname = "/";
  try {
    pathname = new URL(requestUrl, `http://${host}:${port}`).pathname;
  } catch {
    return { ok: false, status: 400, message: "Bad request" };
  }

  let decoded = "";
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { ok: false, status: 400, message: "Bad path encoding" };
  }

  const relativePath = decoded.replace(/^\/+/, "");
  if (!relativePath || relativePath.includes("\0")) {
    return { ok: false, status: 404, message: "Not found" };
  }

  const candidate = path.resolve(root, relativePath);
  if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) {
    return { ok: false, status: 403, message: "Blocked path traversal" };
  }

  try {
    const actualPath = await realpath(candidate);
    if (!actualPath.startsWith(`${root}${path.sep}`)) {
      return { ok: false, status: 403, message: "Blocked path traversal" };
    }
    const fileStat = statSync(actualPath);
    if (!fileStat.isFile()) return { ok: false, status: 404, message: "Not found" };
    return { ok: true, filePath: actualPath, size: fileStat.size };
  } catch {
    return { ok: false, status: 404, message: "Not found" };
  }
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin || "";
  if (LOCAL_ORIGIN_PATTERN.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Origin, Range");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") parsed.root = args[++index];
    else if (arg === "--port") parsed.port = args[++index];
    else if (arg === "--host") parsed.host = args[++index];
  }
  return parsed;
}
