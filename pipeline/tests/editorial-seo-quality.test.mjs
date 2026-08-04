import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { analyzeHubEditorialQuality } from "../lib/editorial-seo-quality.mjs";
import { getGeneratedTitleQualityFlags } from "../lib/printable-title-quality.mjs";

const ROOT = process.cwd();
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const policy = await readJson("src/config/taxonomy-promotion-policy.json");
const titleManifest = await readJson("pipeline/manifests/printable-title-manifest.json");
const imageSitemapData = await readJson("pipeline/manifests/image-sitemap-data.json");
const imageSitemapXml = await readText("public/image-sitemap.xml");
const recordByAssetId = new Map(printables.records.map((record) => [record.assetId, record]));
const indexableHubs = hubs.hubs.filter((hub) => hub.indexable);

test("generated titles remove confirmed defects and keep uncertain wording in review", () => {
  assert.equal(printables.records.length, 6352);
  assert.equal(new Set(printables.records.map((record) => record.displayTitle)).size, 6352);
  for (const record of printables.records) {
    assert.doesNotMatch(record.displayTitle, /\b(?:Midieval|Bakini|Aligator|Dalmation|Celetbrating)\b/i, record.stableId);
    assert.doesNotMatch(record.displayTitle, /\b(?:Holiday Christmas Holiday|Christmas Holiday Christmas)\b/i, record.stableId);
    assert.doesNotMatch(record.displayTitle, /\bcoloring page(?:\s*: Design \d+)?$/i, record.stableId);
    assert.equal(getGeneratedTitleQualityFlags(record.displayTitle).filter((flag) => !["long-title-review", "numeric-suffix-review", "uncertain-term-review"].includes(flag)).length, 0, record.stableId);
  }
  assert.ok(titleManifest.summary.editorialReviewRecordCount >= 122);
  assert.ok(titleManifest.entries.some((entry) => entry.qualityFlags.includes("uncertain-spelling")));
  assert.ok(titleManifest.entries.some((entry) => entry.qualityFlags.includes("brand-or-model-name-review")));
});

test("hub intros are distinct, inventory-grounded, and small hubs remain individually reviewed", () => {
  const analysis = analyzeHubEditorialQuality(indexableHubs.map((hub) => ({
    ...hub,
    memberTitles: hub.assetIds.map((assetId) => recordByAssetId.get(assetId)?.displayTitle).filter(Boolean),
  })));
  assert.equal(analysis.summary.exactDuplicateIntroGroupCount, 0);
  assert.equal(analysis.summary.nearDuplicateIntroPairCount, 0);
  assert.equal(analysis.summary.unsupportedClaimCount, 0);
  assert.equal(analysis.summary.internalLeakageCount, 0);
  assert.equal(analysis.summary.inventoryMismatchCount, 0);
  const smallHubs = indexableHubs.filter((hub) => hub.assetCount < 12);
  assert.equal(smallHubs.length, 23);
  assert.equal(smallHubs.every((hub) => hub.editorial?.reviewStatus === "reviewed"), true);
  assert.equal(smallHubs.every((hub) => hub.intro.length >= 55), true);
});

test("dinosaurs and prehistoric animals explain distinct inventory scopes without contract changes", () => {
  const dinosaurs = hubs.hubs.find((hub) => hub.hubId === "hub_dinosaurs");
  const prehistoric = hubs.hubs.find((hub) => hub.hubId === "hub_prehistoric_animals");
  assert.match(dinosaurs.intro, /dinosaur-only/i);
  assert.match(dinosaurs.editorial.distinction, /mammoths.*saber-toothed.*megalodon.*dodos/i);
  assert.match(prehistoric.intro, /broader extinct-animal/i);
  assert.match(prehistoric.intro, /non-dinosaur/i);
  assert.notEqual(dinosaurs.intro, prehistoric.intro);
  assert.ok(prehistoric.assetCount > dinosaurs.assetCount);
});

test("metadata stays unique, useful, bounded, and synchronized with visible titles", async () => {
  const descriptions = printables.records.map((record) => `Print ${record.displayTitle}, or download a printable-page PNG or JPG and an artwork-only WebP.`);
  assert.equal(new Set(printables.records.map((record) => record.metadataTitle)).size, 6352);
  assert.equal(new Set(descriptions).size, 6352);
  assert.equal(descriptions.every((description) => description.length <= 210), true);
  assert.equal(descriptions.every((description) => !/all ages|difficulty|therapy|educational outcome|\ba4\b|commercial use/i.test(description)), true);
  assert.equal(printables.records.every((record) => (record.metadataTitle.match(/I Love Coloring Page/g) || []).length === 0), true);

  const metadataSource = await readText("src/lib/coloring/printableMetadata.ts");
  const jsonLdSource = await readText("src/lib/seo/printableJsonLd.ts");
  assert.match(metadataSource, /buildPrintableDescription\(printable\)/);
  assert.match(jsonLdSource, /name: titleModel\.displayTitle/);
  assert.match(jsonLdSource, /resolvePrintableAssetSources\(printable\)/);
  assert.match(jsonLdSource, /assetSources\.principalPreview\.url/);
});

test("gallery order, canonical routes, memberships, and image sitemap associations remain protected", async () => {
  assert.equal(hashRouteFields(printables.records), policy.preservationBaseline.canonicalRouteFieldsSha256);
  assert.equal(hashMembership(hubs.hubs), policy.preservationBaseline.hubMembershipSha256);
  assert.equal(imageSitemapData.imageEntries.length, 6352);
  assert.equal(imageSitemapData.imageEntries.every((entry) => entry.imageUrl.endsWith(".webp")), true);
  assert.equal(imageSitemapXml.includes(".svg"), false);
  assert.equal((imageSitemapXml.match(/<image:loc>/g) || []).length, 6352);

  const hubPageSource = await readText("src/components/coloring/HubPageContent.tsx");
  assert.ok(hubPageSource.indexOf('data-page-section="gallery"') < hubPageSource.indexOf('data-page-section="collection-scope"'));
});

function hashRouteFields(records) {
  return sha256(records.map(({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath }) => ({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath })));
}

function hashMembership(records) {
  return sha256(records.map(({ hubId, assetIds }) => ({ hubId, assetIds })));
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
