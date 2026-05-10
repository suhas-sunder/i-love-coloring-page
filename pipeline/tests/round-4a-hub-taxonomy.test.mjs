import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4A_PROJECT_MANIFESTS,
  ROUND4A_PROJECT_REPORTS,
  runRound4AHubTaxonomy,
} from "../scripts/round-4a-hub-taxonomy.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("Round 4A JSON manifests parse and preserve production input state", async () => {
  const parsed = await readRound4AManifests();
  const assets = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");

  assert.equal(assets.assets.length, 6557);
  assert.equal(parsed["pipeline/manifests/round-4a-filename-token-analysis.json"].summary.successfulAssetsAnalyzed, 6557);
  assert.equal(parsed["pipeline/manifests/round-4a-approved-hub-taxonomy.json"].summary.successfulAssetsAnalyzed, 6557);
  assert.equal(parsed["pipeline/manifests/round-4a-approved-hub-taxonomy.json"].summary.quarantinedAssetsExcluded, quarantine.entries.length);
  assert.equal(parsed["pipeline/manifests/round-4a-nextjs-gallery-data-contract.json"].noPerImageIndexPages, true);
  assert.equal(parsed["pipeline/manifests/round-4a-nextjs-gallery-data-contract.json"].warningMetadataPolicy, "internal_metadata_only");
});

test("hub maps exclude quarantined assets and reference only successful Round 3C assets", async () => {
  const parsed = await readRound4AManifests();
  const assets = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");
  const successfulAssetIds = new Set(assets.assets.map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set(quarantine.entries.map((entry) => entry.assetId));
  const imageToHubMap = parsed["pipeline/manifests/round-4a-image-to-hub-map.json"];

  assert.equal(imageToHubMap.summary.assetCount, 6557);

  for (const image of imageToHubMap.images) {
    assert.equal(successfulAssetIds.has(image.assetId), true, image.assetId);
    assert.equal(quarantinedAssetIds.has(image.assetId), false, image.assetId);
    assert.equal(Array.isArray(image.hubIds), true);
    assert.ok(image.hubIds.length > 0, image.assetId);
  }
});

test("Phase 1 hubs have assets, unique slugs, and documented thresholds", async () => {
  const parsed = await readRound4AManifests();
  const phase1 = parsed["pipeline/manifests/round-4a-phase-1-hubs.json"];
  const slugs = new Set();
  const normalizedSlugs = new Set();

  assert.ok(phase1.hubs.length > 0);

  for (const hub of phase1.hubs) {
    assert.ok(hub.assetIds.length > 0, hub.hubId);
    assert.equal(slugs.has(hub.slug), false, hub.slug);
    assert.equal(normalizedSlugs.has(hub.normalizedSlug), false, hub.normalizedSlug);
    slugs.add(hub.slug);
    normalizedSlugs.add(hub.normalizedSlug);
    assert.equal(hub.indexabilityRecommendation, "indexable");
    if (hub.assetCount < 20) {
      assert.ok(hub.thresholdException?.reason, `${hub.hubId} needs a threshold exception`);
    }
  }
});

test("hub candidates include filename evidence and rejected candidates explain rejection", async () => {
  const parsed = await readRound4AManifests();
  const candidates = parsed["pipeline/manifests/round-4a-hub-candidates.json"];
  const rejected = parsed["pipeline/manifests/round-4a-rejected-hub-candidates.json"];

  assert.ok(candidates.candidates.length > 0);
  assert.ok(rejected.candidates.length > 0);

  for (const candidate of candidates.candidates) {
    assert.ok(candidate.sourceEvidence.exampleFilenames.length > 0, candidate.hubId);
    assert.ok(candidate.sourceEvidence.exampleSourcePaths.length > 0, candidate.hubId);
  }

  for (const candidate of rejected.candidates) {
    assert.ok(candidate.rejectionReasons.length > 0, candidate.hubId);
  }
});

test("section-only topics are not indexable and per-image routes are not created", async () => {
  const parsed = await readRound4AManifests();
  const sectionOnly = parsed["pipeline/manifests/round-4a-section-only-topics.json"];
  const routePlan = parsed["pipeline/manifests/round-4a-hub-route-plan.json"];

  for (const topic of sectionOnly.topics) {
    assert.equal(topic.indexabilityRecommendation, "section_only");
    assert.equal(topic.sitemapRecommendation, "exclude");
  }

  assert.equal(routePlan.noPerImageRoutes, true);
  assert.equal(routePlan.routes.some((route) => route.route.includes("[assetId]")), false);
  assert.equal(routePlan.routes.some((route) => route.route.includes("/image/")), false);
});

test("route plan uses the approved /coloring-pages/[hubSlug] format", async () => {
  const parsed = await readRound4AManifests();
  const routePlan = parsed["pipeline/manifests/round-4a-hub-route-plan.json"];

  assert.equal(routePlan.baseRoute.route, "/coloring-pages");
  for (const route of routePlan.routes) {
    if (route.route === "/coloring-pages") continue;
    assert.match(route.route, /^\/coloring-pages\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(route.route, `/coloring-pages/${route.hubSlug}`);
  }
});

test("deterministic rerun produces the same Round 4A manifest and report hashes", async () => {
  await runRound4AHubTaxonomy({ repoRoot: REPO_ROOT });
  const first = await hashRound4AOutputs();
  await runRound4AHubTaxonomy({ repoRoot: REPO_ROOT });
  const second = await hashRound4AOutputs();

  assert.deepEqual(second, first);
});

async function readRound4AManifests() {
  const parsed = {};
  for (const manifestPath of ROUND4A_PROJECT_MANIFESTS) {
    parsed[manifestPath] = await readJson(manifestPath);
    assert.ok(parsed[manifestPath].generatedAt, manifestPath);
  }
  return parsed;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function hashRound4AOutputs() {
  const hashes = {};
  for (const relativePath of [...ROUND4A_PROJECT_MANIFESTS, ...ROUND4A_PROJECT_REPORTS]) {
    hashes[relativePath] = createHash("sha256")
      .update(await readFile(path.join(REPO_ROOT, relativePath), "utf8"))
      .digest("hex");
  }
  return hashes;
}
