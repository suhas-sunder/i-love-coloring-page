#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.cwd(), "out");
const port = Number(process.argv[2] || 3005);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".svg": "image/svg+xml" };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = [relative, `${relative}.html`, path.join(relative, "index.html")]
    .map((candidate) => path.resolve(root, candidate))
    .find((candidate) => candidate.startsWith(root + path.sep) && existsSync(candidate) && statSync(candidate).isFile());
  if (!target) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Not found"); return; }
  response.writeHead(200, { "content-type": types[path.extname(target).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  createReadStream(target).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`Static export available at http://127.0.0.1:${port}`));
