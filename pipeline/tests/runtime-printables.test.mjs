import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRuntimePrintables,
  PRINTABLE_INPUTS,
  PRINTABLE_OUTPUTS,
} from "../scripts/build-runtime-printables.mjs";

const ROOT = process.cwd();
const available = await readJson(ROOT, PRINTABLE_INPUTS.available);
const deferred = await readJson(ROOT, PRINTABLE_INPUTS.deferred);
const hubs = await readJson(ROOT, PRINTABLE_INPUTS.hubs);
const assetPaths = await readJson(ROOT, PRINTABLE_INPUTS.assetPaths);
const printables = await readJson(ROOT, PRINTABLE_OUTPUTS.printables);
const routeManifest = await readJson(ROOT, PRINTABLE_OUTPUTS.routeManifest);
const routeIndex = await readJson(ROOT, PRINTABLE_OUTPUTS.routeIndex);

test("one available record maps to one printable and deferred records are excluded", () => {
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  assert.equal(printables.records.length, available.items.length);
  assert.equal(printables.summary.recordCount, available.items.length);
  assert.equal(printables.records.every((record) => availableIds.has(record.assetId)), true);
  assert.equal(printables.records.some((record) => deferredIds.has(record.assetId)), false);
  assert.equal(printables.records.every((record) => record.publicAvailabilityStatus === "available"), true);
});

test("stable IDs and canonical paths are valid and unique", () => {
  const stableIds = printables.records.map((record) => record.stableId);
  const paths = printables.records.map((record) => record.canonicalPath);
  assert.equal(new Set(stableIds).size, stableIds.length);
  assert.equal(new Set(paths).size, paths.length);
  for (const record of printables.records) {
    assert.match(record.stableId, /^[a-f0-9]{10}$/);
    assert.equal(record.assetId.endsWith(record.stableId), true);
    assert.match(record.canonicalSlug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(record.canonicalSlug.endsWith(record.stableId), false);
    assert.equal(record.slugAndId, `${record.canonicalSlug}-${record.stableId}`);
    assert.equal(record.canonicalPath, `/printables/${record.primaryCategorySlug}/${record.slugAndId}`);
  }
});

test("primary categories are routed public hubs and active paths match the asset registry", () => {
  const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
  const pathById = new Map(assetPaths.records.map((record) => [record.assetId, record]));
  for (const record of printables.records) {
    const hub = hubById.get(record.primaryHubId);
    assert.ok(hub, record.assetId);
    assert.equal(hub.slug, record.primaryCategorySlug);
    assert.notEqual(hub.route, "/coloring-pages");
    assert.equal(hub.indexable, true);
    assert.equal(hub.sitemap, true);
    assert.equal(record.webpPath, pathById.get(record.assetId)?.webpPreviewSubpath);
    assert.equal(record.svgPath, pathById.get(record.assetId)?.internalSvgSubpath);
    assert.match(record.webpPath, /^webp\/.+\.webp$/);
    assert.match(record.svgPath, /^svg\/.+\.svg$/);
  }
});

test("printable records contain no private, local, obsolete, or public SVG-download fields", () => {
  const text = JSON.stringify(printables);
  assert.doesNotMatch(text, /localhost|127\.0\.0\.1|[A-Za-z]:\\|file:\/\/|r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com/i);
  assert.doesNotMatch(text, /coloring-pages\/coloring-pages/i);
  assert.doesNotMatch(text, /"(?:sourcePath|localPath|pngPath|thumbnailPath|svgDownload)"/i);
});

test("route index is a compact direct stable-ID lookup", () => {
  assert.equal(Object.keys(routeIndex.index).length, printables.records.length);
  printables.records.forEach((record, index) => assert.equal(routeIndex.index[record.stableId], index));
});

test("related printable IDs are deterministic, available, unique, and self-excluding", () => {
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  for (const record of printables.records) {
    assert.equal(record.relatedAssetIds.length, 12, record.assetId);
    assert.equal(new Set(record.relatedAssetIds).size, record.relatedAssetIds.length, record.assetId);
    assert.equal(record.relatedAssetIds.includes(record.assetId), false, record.assetId);
    assert.equal(record.relatedAssetIds.every((assetId) => availableIds.has(assetId) && !deferredIds.has(assetId)), true, record.assetId);
  }
});

test("related hubs are routed public relationships, unique, and exclude primary and root hubs", () => {
  const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));
  for (const record of printables.records) {
    assert.ok(record.relatedHubIds.length <= 6, record.assetId);
    assert.equal(new Set(record.relatedHubIds).size, record.relatedHubIds.length, record.assetId);
    assert.equal(record.relatedHubIds.includes(record.primaryHubId), false, record.assetId);
    for (const hubId of record.relatedHubIds) {
      const hub = hubById.get(hubId);
      assert.ok(hub, `${record.assetId}: ${hubId}`);
      assert.notEqual(hub.route, "/coloring-pages");
      assert.equal(hub.indexable, true);
      assert.equal(hub.sitemap, true);
    }
  }
});

test("printable helper uses the compact index and exact terminal canonical parameters", async () => {
  const helper = await readFile(path.join(ROOT, "src/lib/coloring/printables.ts"), "utf8");
  assert.match(helper, /printableIndex\.index\[stableId\]/);
  assert.match(helper, /\^\(\.\+\)-\(\[a-f0-9\]\{10\}\)\$/);
  assert.match(helper, /printable\.primaryCategorySlug !== primaryCategory/);
  assert.match(helper, /printable\.slugAndId !== slugAndId/);
  assert.doesNotMatch(helper, /\.find\([^\n]*stableId/);
});

test("route fields remain frozen when title, clean-key, and membership order change", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-printables-"));
  try {
    for (const relativePath of Object.values(PRINTABLE_INPUTS)) {
      const target = path.join(fixtureRoot, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(ROOT, relativePath), target);
    }
    await buildRuntimePrintables({ repoRoot: fixtureRoot, write: true });
    const first = await readJson(fixtureRoot, PRINTABLE_OUTPUTS.printables);
    const targetRecord = first.records[0];
    const firstRoute = pickRoute(targetRecord);

    const fixtureItems = await readJson(fixtureRoot, PRINTABLE_INPUTS.available);
    fixtureItems.items.find((item) => item.assetId === targetRecord.assetId).title = "Changed Editorial Title";
    await writeJson(fixtureRoot, PRINTABLE_INPUTS.available, fixtureItems);

    const fixtureMembership = await readJson(fixtureRoot, PRINTABLE_INPUTS.hubItems);
    fixtureMembership.items.find((item) => item.assetId === targetRecord.assetId).hubIds.reverse();
    await writeJson(fixtureRoot, PRINTABLE_INPUTS.hubItems, fixtureMembership);

    const fixturePaths = await readJson(fixtureRoot, PRINTABLE_INPUTS.assetPaths);
    const pathRecord = fixturePaths.records.find((record) => record.assetId === targetRecord.assetId);
    pathRecord.cleanWebpObjectKey = pathRecord.cleanWebpObjectKey.replace(targetRecord.canonicalSlug, "changed-reviewed-slug");
    await writeJson(fixtureRoot, PRINTABLE_INPUTS.assetPaths, fixturePaths);

    await buildRuntimePrintables({ repoRoot: fixtureRoot, write: true });
    const second = await readJson(fixtureRoot, PRINTABLE_OUTPUTS.printables);
    assert.deepEqual(pickRoute(second.records.find((record) => record.assetId === targetRecord.assetId)), firstRoute);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("identical inputs produce deterministic output and tracked generated data has no drift", async () => {
  const first = await buildRuntimePrintables({ repoRoot: ROOT, write: false });
  const second = await buildRuntimePrintables({ repoRoot: ROOT, write: false });
  assert.equal(hash(first), hash(second));
  assert.deepEqual(first.printables, printables);
  assert.deepEqual(first.routeManifest, routeManifest);
  assert.deepEqual(first.routeIndex, routeIndex);
});

test("title review reports technical normalization without broad rewriting", () => {
  assert.equal(routeManifest.summary.fallbackCount, 0);
  assert.equal(routeManifest.titleReview.summary.broadTitleRewriteApplied, false);
  assert.equal(routeManifest.titleReview.summary.fileExtensionLeakCount >= 1, true);
  assert.equal(routeManifest.titleReview.summary.internalPipelineWordingCount, 0);
});

function pickRoute(record) {
  return {
    canonicalSlug: record.canonicalSlug,
    primaryHubId: record.primaryHubId,
    primaryCategorySlug: record.primaryCategorySlug,
    slugAndId: record.slugAndId,
    canonicalPath: record.canonicalPath,
  };
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function writeJson(root, relativePath, value) {
  await writeFile(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
