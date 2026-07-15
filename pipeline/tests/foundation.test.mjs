import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

const available = readJson("src/generated/coloring/runtime-available-items.json");
const deferred = readJson("src/generated/coloring/runtime-deferred-items.json");
const hubs = readJson("src/generated/coloring/runtime-hubs.json");
const hubItems = readJson("src/generated/coloring/runtime-hub-items.json");
const assetPaths = readJson("src/generated/coloring/runtime-asset-paths.json");
const searchIndex = readJson("src/generated/coloring/runtime-search-index.json");
const routes = readJson("src/generated/coloring/runtime-routes.json");
const siteMap = readJson("src/generated/coloring/runtime-site-map.json");
const ogImages = readJson("src/generated/coloring/og-images.json");

test("authoritative runtime manifests agree on the available inventory", () => {
  const availableIds = available.items.map((item) => item.assetId);
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  const expectedCount = available.summary.itemCount;

  assert.equal(available.items.length, expectedCount);
  assert.equal(assetPaths.records.length, expectedCount);
  assert.equal(searchIndex.entries.length, expectedCount);
  assert.equal(hubItems.items.length, expectedCount);
  assert.equal(new Set(availableIds).size, expectedCount);
  assert.equal(availableIds.some((assetId) => deferredIds.has(assetId)), false);
  assert.equal(deferred.records.length, deferred.summary.deferredRecordCount);
});

test("runtime routes, hubs, sitemap inputs, and pagination are derived consistently", () => {
  const routedHubIds = new Set(routes.routes.map((route) => route.hubId));
  const sitemapPaths = new Set(siteMap.entries.map((entry) => entry.path));
  const paginatedRouteCount = hubs.hubs.reduce(
    (count, hub) => count + Math.max(0, Math.ceil(hub.assetIds.length / hub.galleryPageSize) - 1),
    0,
  );

  assert.equal(hubs.hubs.length, hubs.summary.hubCount);
  assert.equal(routes.routes.length, routes.summary.routeCount);
  assert.equal(siteMap.entries.length, hubs.hubs.length);
  assert.equal(paginatedRouteCount > 0, true);
  assert.equal(new Set(routes.routes.map((route) => route.path)).size, routes.routes.length);
  assert.equal(new Set(siteMap.entries.map((entry) => entry.path)).size, siteMap.entries.length);
  for (const hub of hubs.hubs) assert.equal(routedHubIds.has(hub.hubId), true, hub.hubId);
  for (const route of routes.routes) assert.equal(sitemapPaths.has(route.path), true, route.path);
});

test("runtime hub membership and search data exclude deferred records", () => {
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));

  for (const membership of hubItems.items) {
    assert.equal(availableIds.has(membership.assetId), true, membership.assetId);
    assert.equal(deferredIds.has(membership.assetId), false, membership.assetId);
    for (const hubId of membership.hubIds) assert.equal(hubById.has(hubId), true, `${membership.assetId}:${hubId}`);
  }
  for (const entry of searchIndex.entries) {
    assert.equal(availableIds.has(entry.assetId), true, entry.assetId);
    assert.equal(deferredIds.has(entry.assetId), false, entry.assetId);
  }
});

test("active SVG and WebP paths are complete and public-safe", () => {
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const forbidden = /localhost|127\.0\.0\.1|[A-Za-z]:\\|r2\.dev|r2\.cloudflarestorage\.com|coloring-pages\/coloring-pages/i;

  for (const record of assetPaths.records) {
    assert.equal(availableIds.has(record.assetId), true, record.assetId);
    assert.match(record.webpPreviewSubpath, /^webp\/.+\.webp$/);
    assert.match(record.internalSvgSubpath, /^svg\/.+\.svg$/);
    assert.doesNotMatch(JSON.stringify(record), forbidden);
  }
});

test("route-level Open Graph inventory derives from the current hub registry", () => {
  const expectedRouteLevelImages = hubs.hubs.length + 2;
  assert.equal(ogImages.routes.length, expectedRouteLevelImages);
  assert.equal(ogImages.summary.generatedImageCount, expectedRouteLevelImages);
});

test("foundation stays static-export-only and does not expose backend routes", () => {
  const config = readText("next.config.mjs");
  const projectText = [
    readText("src/lib/coloring/assets.ts"),
    readText("src/components/coloring/DownloadMenu.tsx"),
  ].join("\n");

  assert.match(config, /output:\s*"export"/);
  assert.equal(existsSync(path.join(ROOT, "app", "api")), false);
  assert.doesNotMatch(projectText, /Download SVG|downloadSvg|svgDownload/i);
});

test("archived local-media prerequisite is reported explicitly", (context) => {
  if (!existsSync(path.join(ROOT, "images"))) {
    context.skip("not_run: local source-image corpus is intentionally absent");
    return;
  }
  assert.equal(existsSync(path.join(ROOT, "images")), true);
});

test("foundation tests do not invoke write-producing generators", () => {
  const packageJson = readJson("package.json");
  assert.doesNotMatch(packageJson.scripts["test:foundation"], /pipeline\/scripts|build-runtime|round-4[ab]-build/i);
  assert.equal(gitStatusFor("images"), "");
  assert.equal(gitStatusFor("ilovesvg"), "");
});

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function gitStatusFor(relativePath) {
  return execFileSync("git", ["status", "--short", "--", relativePath], { cwd: ROOT, encoding: "utf8" }).trim();
}
