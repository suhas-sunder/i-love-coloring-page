import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;

const RUNTIME_JSON = [
  "src/generated/coloring/runtime-available-items.json",
  "src/generated/coloring/runtime-asset-paths.json",
  "src/generated/coloring/runtime-deferred-items.json",
  "src/generated/coloring/runtime-hub-items.json",
  "src/generated/coloring/runtime-hubs.json",
  "src/generated/coloring/runtime-routes.json",
  "src/generated/coloring/runtime-search-index.json",
  "src/generated/coloring/runtime-hub-featured-items.json",
  "src/generated/coloring/runtime-hub-filter-tags.json",
  "src/generated/coloring/runtime-seo-pages.json",
];

test("runtime clean asset switch data exists and exposes only uploaded records", async () => {
  for (const relativePath of RUNTIME_JSON) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const searchIndex = await readJson("src/generated/coloring/runtime-search-index.json");
  const countDiff = await readJson("pipeline/manifests/runtime-switch-count-diff.json");

  assert.equal(available.summary.itemCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(available.items.length, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(deferred.summary.deferredRecordCount, EXPECTED_DEFERRED_RECORDS);
  assert.equal(deferred.records.length, EXPECTED_DEFERRED_RECORDS);
  assert.equal(assetPaths.summary.recordCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(hubItems.summary.assetCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(searchIndex.summary.entryCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(routes.routes.find((route) => route.path === "/coloring-pages")?.assetCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(hubs.hubs.find((hub) => hub.route === "/coloring-pages")?.assetCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(countDiff.summary.previousRootCount, 6557);
  assert.equal(countDiff.summary.runtimeRootCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(countDiff.summary.deferredRecordsHidden, EXPECTED_DEFERRED_RECORDS);

  const deferredIds = new Set(deferred.records.map((record) => record.assetId));
  assert.equal(available.items.some((item) => deferredIds.has(item.assetId)), false);
  assert.equal(searchIndex.entries.some((entry) => deferredIds.has(entry.assetId)), false);
  assert.equal(hubItems.items.some((entry) => deferredIds.has(entry.assetId)), false);

  for (const item of available.items) {
    assert.match(item.assetSubpaths.webpPreview || "", /^webp\/[^/]+\/[^/]+\.webp$/);
    assert.match(item.assetSubpaths.svg || "", /^svg\/[^/]+\/[^/]+\.svg$/);
    assert.equal(item.assetSubpaths.pngPreview, null);
    assert.equal(item.assetSubpaths.thumbnail, null);
  }

  for (const record of assetPaths.records) {
    assert.match(record.webpPreviewSubpath, /^webp\/[^/]+\/[^/]+\.webp$/);
    assert.match(record.internalSvgSubpath, /^svg\/[^/]+\/[^/]+\.svg$/);
    assert.doesNotMatch(`${record.webpPreviewSubpath}\n${record.internalSvgSubpath}`, /(?:^|\/)(?:png|thumbs)\//i);
  }
});

test("runtime data layer uses clean runtime manifests without exposing SVG downloads", async () => {
  const dataSource = await readText("src/lib/coloring/data.ts");
  const assetsSource = await readText("src/lib/coloring/assets.ts");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.match(dataSource, /runtime-available-items\.json/);
  assert.match(dataSource, /runtime-hubs\.json/);
  assert.match(dataSource, /runtime-routes\.json/);
  assert.match(dataSource, /runtime-search-index\.json/);
  assert.match(assetsSource, /webp/);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
});

test("runtime switch preserves source and deferred production boundaries", async () => {
  const readiness = await readJson("pipeline/manifests/runtime-switch-readiness.json");
  const sampledUrls = await readJson("pipeline/manifests/runtime-switch-sampled-url-check-results.json");
  const browserQa = await readJson("pipeline/manifests/runtime-switch-browser-qa-results.json");
  const projectText = await readProjectText(["app", "src", "package.json", "next.config.mjs"]);

  assert.equal(readiness.runtime_paths_switched, true);
  assert.equal(readiness.available_records, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(readiness.deferred_records, EXPECTED_DEFERRED_RECORDS);
  assert.equal(readiness.ready_for_live_ads, false);
  assert.equal(sampledUrls.summary.fullVerificationSkipped, true);
  assert.equal(sampledUrls.summary.pngSubstituteUsed, false);
  assert.equal(sampledUrls.summary.sampledRecords >= 100, true);
  assert.equal(sampledUrls.summary.catsPlayingCardsIncluded, true);
  assert.equal(browserQa.summary.appApiRoutePresent, false);
  assert.equal(browserQa.summary.svgUserDownloadAbsent, true);
  assert.equal(await gitStatusFor("images"), "");
  assert.equal(await gitStatusFor("ilovesvg"), "");
  assert.doesNotMatch(projectText, /google_ad_client|NEXT_PUBLIC_ADSENSE_PUBLISHER_ID|NEXT_PUBLIC_ADSENSE_SLOTS_JSON/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results.map((file) => file.replace(/\\/g, "/"));
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout.trim();
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFilesIfExists(root)) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}
