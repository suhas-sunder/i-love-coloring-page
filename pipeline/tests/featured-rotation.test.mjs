import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import ts from "typescript";

const ROOT = new URL("../../", import.meta.url);
const utilityPath = new URL("../../src/lib/coloring/featuredRotation.ts", import.meta.url);
const rotatingGridPath = new URL("../../src/components/coloring/RotatingFeaturedGrid.tsx", import.meta.url);
const homePagePath = new URL("../../app/page.tsx", import.meta.url);
const coloringPagesPath = new URL("../../app/coloring-pages/page.tsx", import.meta.url);
const hubPageContentPath = new URL("../../src/components/coloring/HubPageContent.tsx", import.meta.url);
const dataPath = new URL("../../src/lib/coloring/data.ts", import.meta.url);
const sitemapPath = new URL("../../public/image-sitemap.xml", import.meta.url);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, ROOT), "utf8"));
}

function readText(url) {
  return fs.readFileSync(url, "utf8");
}

async function importFeaturedRotation() {
  assert.ok(fs.existsSync(utilityPath), "rotation utility should exist");
  const source = readText(utilityPath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  });
  const tempPath = new URL("../../.tmp-featured-rotation-test.mjs", import.meta.url);
  fs.writeFileSync(tempPath, transpiled.outputText);
  try {
    return await import(`${tempPath.href}?v=${Date.now()}`);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

test("featured rotation utility provides deterministic three-day helpers", async () => {
  const rotation = await importFeaturedRotation();
  const currentWindow = rotation.getThreeDayWindowKey(new Date("2026-05-13T12:00:00Z"));
  const sameWindow = rotation.getThreeDayWindowKey(new Date("2026-05-15T23:59:00Z"));
  const nextWindow = rotation.getThreeDayWindowKey(new Date("2026-05-16T00:01:00Z"));

  assert.equal(currentWindow, sameWindow);
  assert.notEqual(currentWindow, nextWindow);
  assert.deepEqual(rotation.seededShuffle([1, 2, 3, 4, 5], "hub-a"), rotation.seededShuffle([1, 2, 3, 4, 5], "hub-a"));
  assert.notDeepEqual(rotation.seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], "hub-a"), rotation.seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], "hub-b"));
});

test("featured rotation selection keeps fallback stable, unique, and seed-driven", async () => {
  const rotation = await importFeaturedRotation();
  const candidates = Array.from({ length: 20 }, (_, index) => ({ assetId: `asset-${index + 1}` }));
  const fallback = candidates.slice(0, 8);

  const first = rotation.getRotatingFeaturedItems({
    candidates,
    fallbackItems: fallback,
    count: 8,
    seed: "dragons:window-1",
    keyFn: (item) => item.assetId,
  });
  const repeat = rotation.getRotatingFeaturedItems({
    candidates,
    fallbackItems: fallback,
    count: 8,
    seed: "dragons:window-1",
    keyFn: (item) => item.assetId,
  });
  const next = rotation.getRotatingFeaturedItems({
    candidates,
    fallbackItems: fallback,
    count: 8,
    seed: "dragons:window-2",
    keyFn: (item) => item.assetId,
  });

  assert.deepEqual(first, repeat);
  assert.equal(new Set(first.map((item) => item.assetId)).size, first.length);
  assert.notDeepEqual(first.map((item) => item.assetId), next.map((item) => item.assetId));
  assert.deepEqual(
    rotation.getRotatingFeaturedItems({
      candidates: [],
      fallbackItems: fallback,
      count: 8,
      seed: "empty",
      keyFn: (item) => item.assetId,
    }),
    fallback,
  );
});

test("runtime data supports available-only featured rotation", () => {
  const available = readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubs = readJson("src/generated/coloring/runtime-hubs.json");
  const rootHub = hubs.hubs.find((hub) => hub.route === "/coloring-pages");
  const tRexHub = hubs.hubs.find((hub) => hub.slug === "t-rex");
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));

  assert.equal(available.items.length, available.summary.itemCount);
  assert.equal(deferred.records.length, deferred.summary.deferredRecordCount);
  assert.equal(hubs.hubs.length, hubs.summary.hubCount);
  assert.ok(rootHub);
  assert.ok(tRexHub);
  assert.equal(tRexHub.assetCount, 18);

  for (const hub of [rootHub, tRexHub]) {
    assert.ok(hub.assetIds.every((assetId) => availableIds.has(assetId)));
    assert.ok(hub.assetIds.every((assetId) => !deferredIds.has(assetId)));
  }

  assert.ok(available.items.every((item) => item.assetSubpaths.webpPreview?.startsWith("webp/")));
  assert.ok(available.items.every((item) => item.assetSubpaths.svg?.startsWith("svg/")));
});

test("homepage and hub pages use client-safe rotating featured grids", () => {
  assert.ok(fs.existsSync(rotatingGridPath), "RotatingFeaturedGrid should exist");
  const componentSource = readText(rotatingGridPath);
  const homeSource = readText(homePagePath);
  const coloringPagesSource = readText(coloringPagesPath);
  const hubSource = readText(hubPageContentPath);
  const dataSource = readText(dataPath);

  assert.match(componentSource, /"use client"/);
  assert.match(componentSource, /useEffect/);
  assert.match(componentSource, /homepage-random/);
  assert.match(componentSource, /hub-three-day/);
  assert.match(componentSource, /fallbackItems/);
  assert.match(componentSource, /getHomepageReloadSeed/);
  assert.match(componentSource, /getHubRotationSeed/);
  assert.doesNotMatch(componentSource, /Math\.random\(\)\s*\)/, "randomness should be wrapped by the utility");

  assert.match(homeSource, /RotatingFeaturedGrid/);
  assert.match(homeSource, /mode="homepage-random"/);
  assert.match(coloringPagesSource, /RotatingFeaturedGrid/);
  assert.match(coloringPagesSource, /mode="hub-three-day"/);
  assert.match(hubSource, /RotatingFeaturedGrid/);
  assert.match(hubSource, /mode="hub-three-day"/);
  assert.match(dataSource, /getFeaturedRotationCandidateItems/);
});

test("rotation stays within static-export and deferred-feature boundaries", () => {
  const nextConfig = readText(new URL("../../next.config.mjs", import.meta.url));
  const imageCardSource = readText(new URL("../../src/components/coloring/ImageCard.tsx", import.meta.url));
  const downloadSource = readText(new URL("../../src/components/coloring/DownloadMenu.tsx", import.meta.url));
  const publicEntries = listPublicFiles(new URL("../../public/", import.meta.url));

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(fs.existsSync(new URL("../../app/api", import.meta.url)), false);
  assert.ok(fs.existsSync(sitemapPath), "image sitemap should remain present if already generated");
  assert.doesNotMatch(readText(sitemapPath), /\.svg</);
  assert.doesNotMatch(readText(new URL("../../src/generated/coloring/runtime-social-metadata.json", import.meta.url)), /og:image/i);
  assert.doesNotMatch(`${imageCardSource}\n${downloadSource}`, />\s*SVG\s*</i);
  assert.match(`${imageCardSource}\n${downloadSource}`, /PNG/);
  assert.match(`${imageCardSource}\n${downloadSource}`, /JPG|JPEG/);
  assert.match(`${imageCardSource}\n${downloadSource}`, /WebP/);
  assert.ok(
    publicEntries.every((entry) => entry === "image-sitemap.xml" || /^og\/.+\.jpg$/i.test(entry) || /^search-data\/.+\.json$/i.test(entry)),
    "public should contain only approved XML, route-level OG, and static search files",
  );
});

function listPublicFiles(root) {
  const files = [];
  function walk(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, directory), `${relative}/`);
      else files.push(relative);
    }
  }
  walk(root);
  return files.sort();
}
