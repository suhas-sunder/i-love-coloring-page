import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4B_GENERATED_DATA_FILES,
  ROUND4B_PROJECT_MANIFESTS,
  ROUND4B_PROJECT_REPORTS,
  runRound4BNextGalleryBuild,
} from "../scripts/round-4b-build-next-gallery-data.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const LARGE_HUB_PAGE_SIZE_MAX = 60;

test("generated Next gallery JSON parses and uses Phase 1 hubs only for indexable routes", async () => {
  const generated = await readGeneratedData();
  const phase1 = await readJson("pipeline/manifests/round-4a-phase-1-hubs.json");
  const phase2 = await readJson("pipeline/manifests/round-4a-phase-2-hub-backlog.json");
  const sectionOnly = await readJson("pipeline/manifests/round-4a-section-only-topics.json");
  const rejected = await readJson("pipeline/manifests/round-4a-rejected-hub-candidates.json");

  const phase1Slugs = new Set(phase1.hubs.map((hub) => hub.slug).filter(Boolean));
  const routeSlugs = new Set(generated.routes.routes.map((route) => route.slug).filter(Boolean));
  const routeHubIds = new Set(generated.routes.routes.map((route) => route.hubId));

  assert.equal(generated.routes.routes.some((route) => route.path === "/coloring-pages"), true);
  assert.deepEqual([...routeSlugs].sort(), [...phase1Slugs].sort());
  assert.equal(generated.routes.routes.every((route) => route.indexable === true), true);
  assertNoOverlap(routeSlugs, phase2.hubs.map((hub) => hub.slug), "Phase 2 hub routed");
  assertNoOverlap(routeSlugs, sectionOnly.topics.map((topic) => topic.slug), "section-only topic routed");
  assertNoOverlap(routeHubIds, rejected.candidates.map((candidate) => candidate.hubId), "rejected candidate routed");
});

test("gallery items reference only successful Round 3C assets and exclude quarantined assets", async () => {
  const generated = await readGeneratedData();
  const round3cAssets = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");
  const successfulAssetIds = new Set(round3cAssets.assets.map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set(quarantine.entries.map((entry) => entry.assetId));

  assert.equal(generated.items.items.length, 6557);
  for (const item of generated.items.items) {
    assert.equal(successfulAssetIds.has(item.assetId), true, item.assetId);
    assert.equal(quarantinedAssetIds.has(item.assetId), false, item.assetId);
    assert.equal(item.indexablePerImageRoute, false, item.assetId);
    assert.equal("sourceRelativePath" in item, false, item.assetId);
    assert.doesNotMatch(JSON.stringify(item), /(?:^|["/\\])images[\\/]/i, item.assetId);
  }
});

test("one image may belong to multiple hubs without creating image routes", async () => {
  const generated = await readGeneratedData();
  const multiHub = generated.hubItems.items.find((item) => item.hubIds.length > 2);

  assert.ok(multiHub, "expected at least one image with multiple hub assignments");
  assert.equal(generated.routes.noPerImageRoutes, true);
  assert.equal(generated.routes.routes.some((route) => route.path.includes("[assetId]")), false);
  assert.equal(generated.routes.routes.some((route) => route.path.includes("/image/")), false);
});

test("sitemap contains only the root gallery and Phase 1 hub routes", async () => {
  const generated = await readGeneratedData();
  const phase1 = await readJson("pipeline/manifests/round-4a-phase-1-hubs.json");
  const expectedPaths = new Set([
    "/coloring-pages",
    ...phase1.hubs.map((hub) => hub.route).filter((route) => route !== "/coloring-pages"),
  ]);
  const actualPaths = new Set(generated.siteMap.entries.map((entry) => entry.path));

  assert.deepEqual([...actualPaths].sort(), [...expectedPaths].sort());
  assert.equal(generated.siteMap.entries.length, 65);
  assert.equal([...actualPaths].some((route) => /\/image\//.test(route)), false);
});

test("asset resolver plan does not expose local filesystem paths to client data", async () => {
  const generated = await readGeneratedData();
  const plan = await readJson("pipeline/manifests/round-4b-asset-resolution-plan.json");
  const resolverSource = await readFile(path.join(REPO_ROOT, "src", "lib", "coloring", "assets.ts"), "utf8");

  assert.equal(plan.assetBaseUrlEnvironmentVariable, "NEXT_PUBLIC_COLORING_ASSET_BASE_URL");
  assert.equal(plan.localProxyEnvironmentVariable, "COLORING_ENABLE_LOCAL_ASSET_PROXY");
  assert.equal(plan.localProxyAllowsPathTraversal, false);
  assert.equal(plan.productionAssetsCopiedToPublic, false);
  assert.doesNotMatch(JSON.stringify(generated.items), /D:\\|sourceRelativePath|pipeline\/production\/full/i);
  assert.doesNotMatch(resolverSource, /D:\\|C:\\|sourceRelativePath/);
  assert.match(resolverSource, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/);
});

test("duplicate hub slugs are absent and large hubs render a limited first page", async () => {
  const generated = await readGeneratedData();
  const slugs = generated.hubs.hubs.map((hub) => hub.slug);
  assert.equal(new Set(slugs).size, slugs.length);

  const largeHub = generated.hubs.hubs.find((hub) => hub.assetCount > 500);
  assert.ok(largeHub);
  assert.ok(largeHub.galleryPageSize <= LARGE_HUB_PAGE_SIZE_MAX);
  assert.ok(largeHub.previewAssetIds.length <= largeHub.galleryPageSize);
  assert.ok(largeHub.assetCount > largeHub.previewAssetIds.length);
});

test("source images are unchanged and production assets are not moved into public", async () => {
  const inventory = await readJson("pipeline/manifests/image-inventory.json");
  for (const entry of inventory.entries.slice(0, 200)) {
    const sourceStat = await stat(path.join(REPO_ROOT, ...entry.sourceRelativePath.split("/")));
    assert.equal(Number(sourceStat.size), Number(entry.fileSizeBytes), entry.sourceRelativePath);
  }

  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production|assets[\\/]+(?:svg|png|thumbs)/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /\.(?:png|svg)$/i.test(file)), false);
});

test("deterministic rerun produces the same Round 4B data, manifest, and report hashes", async () => {
  await runRound4BNextGalleryBuild({ repoRoot: REPO_ROOT });
  const first = await hashRound4BOutputs();
  await runRound4BNextGalleryBuild({ repoRoot: REPO_ROOT });
  const second = await hashRound4BOutputs();

  assert.deepEqual(second, first);
});

async function readGeneratedData() {
  const parsed = {};
  for (const relativePath of ROUND4B_GENERATED_DATA_FILES) {
    const key = path.basename(relativePath, ".json").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = await readJson(relativePath);
    assert.ok(parsed[key].generatedAt, relativePath);
  }
  return parsed;
}

async function hashRound4BOutputs() {
  const hashes = {};
  for (const relativePath of [
    ...ROUND4B_GENERATED_DATA_FILES,
    ...ROUND4B_PROJECT_MANIFESTS,
    ...ROUND4B_PROJECT_REPORTS,
  ]) {
    hashes[relativePath] = createHash("sha256")
      .update(await readFile(path.join(REPO_ROOT, relativePath), "utf8"))
      .digest("hex");
  }
  return hashes;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

function assertNoOverlap(routeSlugs, slugs, message) {
  const overlap = slugs.filter((slug) => slug && routeSlugs.has(slug));
  assert.deepEqual(overlap, [], message);
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
      else results.push(path.relative(root, entryPath));
    }
  }
  await walk(root);
  return results;
}
