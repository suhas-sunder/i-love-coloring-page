import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildStaticSearchData } from "../scripts/build-static-search-data.mjs";

const ROOT = process.cwd();
const available = await readJson("src/generated/coloring/runtime-available-items.json");
const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const rootPayload = await readJson("public/search-data/all.json");

test("root static search data contains every available record and no deferred record", () => {
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  assert.equal(rootPayload.count, available.items.length);
  assert.equal(rootPayload.items.length, available.items.length);
  assert.equal(new Set(rootPayload.items.map((item) => item.id)).size, available.items.length);
  assert.equal(rootPayload.items.every((item) => availableIds.has(item.id)), true);
  assert.equal(rootPayload.items.some((item) => deferredIds.has(item.id)), false);
});

test("compact records contain canonical routes and only active asset fields", () => {
  for (const item of rootPayload.items) {
    assert.match(item.path, /^\/printables\/[a-z0-9-]+\/[a-z0-9-]+-[a-f0-9]{10}$/);
    assert.match(item.webp, /^webp\/.+\.webp$/);
    assert.match(item.svg, /^svg\/.+\.svg$/);
    assert.equal(typeof item.primary, "string");
    assert.equal(Array.isArray(item.tags), true);
    assert.equal(typeof item.text, "string");
  }
  const text = JSON.stringify(rootPayload);
  assert.doesNotMatch(text, /sourceRelativePath|warningFlags|manualReview|pngPreview|thumbnail/i);
  assert.doesNotMatch(text, /localhost|127\.0\.0\.1|[A-Za-z]:\\|r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com/i);
});

test("every non-root hub owns a scoped index with no unrelated records", async () => {
  const expectedHubFiles = hubs.hubs.filter((hub) => hub.route !== "/coloring-pages");
  for (const hub of expectedHubFiles) {
    const payload = await readJson(`public/search-data/hubs/${hub.slug}.json`);
    assert.equal(payload.scope, hub.slug);
    assert.equal(payload.count, hub.assetIds.length);
    assert.deepEqual(payload.items.map((item) => item.id), hub.assetIds);
  }
});

test("search generator is deterministic and generated files have no drift", async () => {
  const first = await buildStaticSearchData({ repoRoot: ROOT, write: false });
  const second = await buildStaticSearchData({ repoRoot: ROOT, write: false });
  assert.equal(hashMap(first.files), hashMap(second.files));
  for (const [relativePath, content] of first.files) {
    assert.equal(await readFile(path.join(ROOT, "public", "search-data", relativePath), "utf8"), content, relativePath);
  }
  assert.deepEqual(await readJson("pipeline/manifests/static-search-data-manifest.json"), first.manifest);
});

test("navigation search data is a dedicated compact printable and collection index", async () => {
  const payload = await readJson("public/search-data/navigation.json");
  const text = JSON.stringify(payload);
  assert.equal(payload.v, 2);
  assert.equal(payload.p.length, available.items.length);
  assert.equal(payload.c.length, hubs.hubs.length);
  assert.equal(payload.p.every((record) => record.length === 6 && /^webp\/.+\.webp$/.test(record[3])), true);
  assert.equal(payload.c.every((record) => record.length === 5 && /^\/coloring-pages(?:\/|$)/.test(record[2])), true);
  assert.doesNotMatch(text, /\.svg\b|sourceRelativePath|warningFlags|manualReview|localhost|r2\.dev/i);
  assert.ok(Buffer.byteLength(`${JSON.stringify(payload)}\n`) < 2_500_000);
});

test("gallery loads full indexes on demand and suspends pagination only for interactive results", async () => {
  const source = await readFile(path.join(ROOT, "src/components/coloring/GallerySearch.tsx"), "utf8");
  const hubPage = await readFile(path.join(ROOT, "src/components/coloring/HubPageContent.tsx"), "utf8");
  const landing = await readFile(path.join(ROOT, "app/coloring-pages/page.tsx"), "utf8");
  assert.match(source, /fetch\(searchDataPath/);
  assert.match(source, /Loading matching coloring pages/);
  assert.match(source, /Search could not be completed/);
  assert.match(source, />Try again</);
  assert.match(source, /INTERACTIVE_RESULT_BATCH_SIZE = 48/);
  assert.match(source, />Show more</);
  assert.match(source, /isStaticPageView && pagination/);
  assert.match(hubPage, /searchDataPath={`\/search-data\/hubs\/\$\{hub\.slug\}\.json`}/);
  assert.match(landing, /searchDataPath="\/search-data\/all\.json"/);
  assert.doesNotMatch(`${hubPage}\n${landing}`, /allItems=|searchEntries=/);
});

function hashMap(files) {
  const hash = createHash("sha256");
  for (const [relativePath, content] of files) hash.update(relativePath).update("\0").update(content);
  return hash.digest("hex");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}
