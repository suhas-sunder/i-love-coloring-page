#!/usr/bin/env node

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const printables = JSON.parse(readFileSync(path.join(ROOT, "src/generated/coloring/runtime-printables.json"), "utf8"));
const hubs = JSON.parse(readFileSync(path.join(ROOT, "src/generated/coloring/runtime-hubs.json"), "utf8"));

if (!existsSync(OUT)) {
  console.error("Static route validation not_run: out/ does not exist.");
  process.exit(2);
}

const records = printables.records;
const titleCounts = new Map();
for (const record of records) titleCounts.set(record.publicTitle, (titleCounts.get(record.publicTitle) || 0) + 1);
const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
const nonRootHubs = hubs.hubs.filter((hub) => hub.route !== "/coloring-pages");
const smallestHub = [...nonRootHubs].sort((a, b) => a.assetCount - b.assetCount || a.hubId.localeCompare(b.hubId))[0];
const representatives = uniqueByPath([
  records.find((record) => record.primaryCategorySlug === "animals"),
  records.find((record) => /mandala/i.test(record.publicTitle)),
  records.find((record) => record.primaryCategorySlug === "anime-girls"),
  records.find((record) => /christmas|halloween|easter|thanksgiving/i.test(record.publicTitle)),
  [...records].sort((a, b) => b.displayTitle.length - a.displayTitle.length || a.assetId.localeCompare(b.assetId))[0],
  records.find((record) => titleCounts.get(record.publicTitle) > 1),
  records.find((record) => record.primaryHubId === smallestHub?.hubId),
  [...records].sort((a, b) => b.hubIds.length - a.hubIds.length || a.assetId.localeCompare(b.assetId))[0],
].filter(Boolean));

const server = createServer((request, response) => serveStatic(request, response));
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

try {
  const results = [];
  for (const printable of representatives) {
    const response = await fetch(`${origin}${printable.canonicalPath}`);
    const html = await response.text();
    const primaryHub = hubById.get(printable.primaryHubId);
    const expectedTitle = printable.displayTitle;
    const checks = {
      status: response.status === 200,
      h1: html.includes(`<h1`) && html.includes(escapeHtml(expectedTitle)),
      canonical: html.includes(`rel="canonical" href="https://www.ilovecoloringpage.com${printable.canonicalPath}"`),
      webp: html.includes(`https://assets.ilovecoloringpage.com/coloring-pages/${printable.webpPath}`),
      breadcrumbs: html.includes("Breadcrumb") && html.includes(primaryHub.route),
      actions: html.includes(">Print<") && html.includes(">Download<"),
      related: html.includes("Related printable pages") && html.includes("Related Collections"),
      metadata: /<meta name="robots" content="index, follow"/.test(html) && /property="og:image" content="https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\/webp\//.test(html),
      structuredData: html.includes('"@type":"WebPage"') && html.includes('"@type":"BreadcrumbList"') && html.includes('"@type":"ImageObject"'),
      safe: !/localhost|r2\.dev|cloudflarestorage|amazonaws|Download SVG|href="(?:https?:\/\/[^\"]+\/coloring-pages\/svg\/|\/coloring-pages\/svg\/)[^"]*\.svg/i.test(html),
    };
    results.push({ canonicalPath: printable.canonicalPath, status: response.status, checks });
  }

  const known = records[0];
  const invalidPaths = [
    "/printables/animals/unknown-0000000000",
    `/printables/wrong/${known.slugAndId}`,
    `/printables/${known.primaryCategorySlug}/wrong-${known.stableId}`,
    `/printables/${known.primaryCategorySlug}/missing-id`,
    `/printables/${known.primaryCategorySlug}`,
    `/printables/${known.primaryCategorySlug}/${known.canonicalSlug}-zzzzzzzzzz`,
    `/printables/${known.primaryCategorySlug}/${known.canonicalSlug}-${known.stableId.slice(1)}`,
    `/printables/${known.primaryCategorySlug}/${known.canonicalSlug}-0${known.stableId}`,
  ];
  const invalidResults = [];
  for (const invalidPath of invalidPaths) {
    const response = await fetch(`${origin}${invalidPath}`);
    invalidResults.push({ path: invalidPath, status: response.status, absent: response.status === 404 });
  }
  const passed = results.every((entry) => Object.values(entry.checks).every(Boolean)) && invalidResults.every((entry) => entry.absent);
  console.log(JSON.stringify({ passed, origin, representativeCount: results.length, results, invalidResults }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}

function serveStatic(request, response) {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidates = [relative, `${relative}.html`, path.join(relative, "index.html")];
  const target = candidates.map((candidate) => path.resolve(OUT, candidate)).find((candidate) => candidate.startsWith(OUT + path.sep) && existsSync(candidate) && statSync(candidate).isFile());
  if (!target) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Not found"); return; }
  response.writeHead(200, { "content-type": target.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
  response.end(readFileSync(target));
}

function uniqueByPath(items) {
  const seen = new Set();
  return items.filter((item) => !seen.has(item.canonicalPath) && seen.add(item.canonicalPath));
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
