import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4J_MANIFEST_FILES,
  ROUND4J_REPORT_FILES,
  ROUND4J_RUN_ID,
  runRound4JGalleryUxData,
} from "../scripts/round-4j-build-gallery-ux-data.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("Round 4J UX data generation creates parseable manifests and generated data", async () => {
  const result = await runRound4JGalleryUxData({ repoRoot: REPO_ROOT });
  assert.equal(result.runId, ROUND4J_RUN_ID);

  for (const relativePath of [
    ...ROUND4J_MANIFEST_FILES,
    "src/generated/coloring/hub-featured-items.json",
    "src/generated/coloring/hub-filter-tags.json",
    "src/generated/coloring/search-index.json",
  ]) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const reportPath of ROUND4J_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4J/i, reportPath);
    assert.doesNotMatch(text, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }
});

test("featured items, filter tags, and search index reference only successful assets", async () => {
  const featured = await readJson("src/generated/coloring/hub-featured-items.json");
  const filters = await readJson("src/generated/coloring/hub-filter-tags.json");
  const search = await readJson("src/generated/coloring/search-index.json");
  const items = await readJson("src/generated/coloring/items.json");
  const hubs = await readJson("src/generated/coloring/hubs.json");
  const publish = await readJson("pipeline/manifests/round-4e-asset-publish-manifest.json");
  const production = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");

  const itemIds = new Set(items.items.map((item) => item.assetId));
  const readyIds = new Set(publish.files.filter((file) => file.status === "ready").map((file) => file.assetId));
  const successfulIds = new Set(production.assets.filter((asset) => asset.status === "passed_production_export").map((asset) => asset.assetId));
  const quarantinedIds = new Set((quarantine.entries || []).map((entry) => entry.assetId));
  const hubIds = new Set(hubs.hubs.map((hub) => hub.hubId));
  const hubAssetIds = new Map(hubs.hubs.map((hub) => [hub.hubId, new Set(hub.assetIds)]));

  assert.equal(featured.runId, ROUND4J_RUN_ID);
  assert.equal(filters.runId, ROUND4J_RUN_ID);
  assert.equal(search.runId, ROUND4J_RUN_ID);
  assert.equal(search.entries.length, items.items.length);

  for (const entry of search.entries) {
    assert.equal(itemIds.has(entry.assetId), true, entry.assetId);
    assert.equal(readyIds.has(entry.assetId), true, entry.assetId);
    assert.equal(successfulIds.has(entry.assetId), true, entry.assetId);
    assert.equal(quarantinedIds.has(entry.assetId), false, entry.assetId);
    assert.ok(entry.searchText.length > entry.title.length, entry.assetId);
    assert.ok(entry.tags.length > 0, entry.assetId);
    assert.equal(entry.sourcePath, undefined);
  }

  const searchById = new Map(search.entries.map((entry) => [entry.assetId, entry]));
  for (const hubEntry of featured.hubs) {
    assert.equal(hubIds.has(hubEntry.hubId), true, hubEntry.hubId);
    assert.ok(hubEntry.assetIds.length > 0, hubEntry.hubId);
    assert.ok(hubEntry.assetIds.length <= 12, hubEntry.hubId);
    const hubAssets = hubAssetIds.get(hubEntry.hubId);
    for (const assetId of hubEntry.assetIds) {
      assert.equal(hubAssets.has(assetId), true, `${hubEntry.hubId} ${assetId}`);
      assert.ok(searchById.has(assetId), assetId);
    }
  }

  for (const hubEntry of filters.hubs) {
    assert.equal(hubIds.has(hubEntry.hubId), true, hubEntry.hubId);
    for (const tag of hubEntry.tags) {
      assert.ok(tag.assetCount > 0, `${hubEntry.hubId} ${tag.id}`);
      const actualCount = [...hubAssetIds.get(hubEntry.hubId)].filter((assetId) => searchById.get(assetId)?.tags.includes(tag.id)).length;
      assert.equal(actualCount, tag.assetCount, `${hubEntry.hubId} ${tag.id}`);
    }
    for (const tab of hubEntry.tabs) {
      assert.ok(tab.assetCount > 0, `${hubEntry.hubId} ${tab.id}`);
    }
  }
});

test("Round 4J UI components keep search and filters static-export friendly", async () => {
  const gallerySearch = await readText("src/components/coloring/GallerySearch.tsx");
  const galleryFilters = await readText("src/components/coloring/GalleryFilters.tsx");
  const hubPage = await readText("src/components/coloring/HubPageContent.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const data = await readText("src/lib/coloring/data.ts");

  assert.match(gallerySearch, /"use client"/);
  assert.match(gallerySearch, /type="search"/);
  assert.match(gallerySearch, /aria-label="Search this collection"/);
  assert.match(gallerySearch, /MAX_INTERACTIVE_RESULTS\s*=\s*48/);
  assert.doesNotMatch(gallerySearch, /fetch\(|\/api\/|server action|use server/i);
  assert.match(galleryFilters, /"use client"/);
  assert.match(galleryFilters, /aria-pressed/);
  assert.doesNotMatch(galleryFilters, /fetch\(|\/api\/|use server/i);
  assert.match(hubPage, /Browse gallery/);
  assert.match(hubPage, /Featured pages/);
  assert.match(hubPage, /GallerySearch/);
  assert.match(hubPage, /Related collections/);
  assert.match(galleryGrid, /priorityCount/);
  assert.match(data, /hub-featured-items\.json/);
  assert.match(data, /hub-filter-tags\.json/);
  assert.match(data, /search-index\.json/);
});

test("visual system adds controlled creative color without gradients or nested cards", async () => {
  const tokens = await readText("src/styles/tokens.css");
  const components = await readText("src/styles/components.css");
  const layout = await readText("src/styles/layout.css");
  const allCss = `${tokens}\n${components}\n${layout}`;

  for (const token of [
    "--color-creative-plum",
    "--color-creative-rose",
    "--color-creative-coral",
    "--color-creative-sky",
    "--color-creative-mint",
    "--color-creative-yellow",
    "--color-soft-rose-surface",
    "--color-soft-sky-surface",
    "--color-soft-mint-surface",
    "--color-soft-yellow-surface",
  ]) {
    assert.match(tokens, new RegExp(token), token);
  }

  assert.doesNotMatch(allCss, /linear-gradient|radial-gradient|conic-gradient/i);
  assert.doesNotMatch(allCss, /box-shadow:\s*(?!var\(--shadow-button\))/i);
  assert.doesNotMatch(allCss, /\.card\s+\.card|nested-card/i);
  assert.match(allCss, /:focus-visible/);
  assert.match(components, /\.filter-chip\[aria-pressed="true"\]/);
  assert.match(components, /\.gallery-search/);
  assert.match(components, /\.featured-strip/);
});

test("real local media audit and repository safety remain intact", async () => {
  const audit = await readJson("pipeline/manifests/round-4j-real-media-preview-audit.json");
  const browserQa = await readJson("pipeline/manifests/round-4j-browser-qa-results.json");
  const nextConfig = await readText("next.config.mjs");
  const routes = await readJson("src/generated/coloring/routes.json");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const gitStatusImages = await gitStatusFor("images");
  const gitStatusIlovesvg = await gitStatusFor("ilovesvg");
  const gitStatusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.equal(audit.runId, ROUND4J_RUN_ID);
  assert.equal(audit.summary.localBundleExists, true);
  assert.equal(audit.summary.totalMediaFiles, 19671);
  assert.equal(audit.summary.knownPngServed, true);
  assert.equal(audit.summary.staticBuildUsesLocalAssetBase, true);
  assert.equal(browserQa.runId, ROUND4J_RUN_ID);
  assert.ok(browserQa.pagesInspected.length >= 10);
  assert.equal(browserQa.summary.realMediaRendered, true);
  assert.equal(browserQa.summary.appApiRoutePresent, false);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => /[\\/]api[\\/]/.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(gitStatusImages.trim(), "");
  assert.equal(gitStatusIlovesvg.trim(), "");
  assert.equal(gitStatusProductionFull.trim(), "");
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
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(entryPath);
    }
  }
  await walk(root);
  return results;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}
