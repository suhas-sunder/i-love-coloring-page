import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import {
  buildPrintableAltText,
  buildPrintableTitleAssignments,
  getPublicTitleSafetyFlags,
  normalizeExactTitle,
} from "../lib/printable-title-quality.mjs";
import { buildPrintableTitleQuality } from "../scripts/build-printable-title-quality.mjs";
import { buildRuntimePrintables } from "../scripts/build-runtime-printables.mjs";

const ROOT = process.cwd();
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const titleManifest = await readJson("pipeline/manifests/printable-title-manifest.json");
const routeManifest = await readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const taxonomyPolicy = await readJson("src/config/taxonomy-promotion-policy.json");
const searchPayload = await readJson("public/search-data/all.json");
const navigationPayload = await readJson("public/search-data/navigation.json");
const imageSitemapData = await readJson("pipeline/manifests/image-sitemap-data.json");
const entryByStableId = new Map(titleManifest.entries.map((entry) => [entry.stableId, entry]));
const recordByStableId = new Map(printables.records.map((record) => [record.stableId, record]));

test("generation model preserves reviewed bases, frozen routes, and one unique title model per printable", () => {
  assert.equal(printables.records.length, 6352);
  assert.equal(titleManifest.entries.length, printables.records.length);
  assert.equal(new Set(printables.records.map((record) => record.displayTitle)).size, printables.records.length);
  assert.equal(new Set(printables.records.map((record) => record.metadataTitle)).size, printables.records.length);
  assert.equal(hashRouteFields(printables.records), taxonomyPolicy.preservationBaseline.canonicalRouteFieldsSha256);
  for (const record of printables.records) {
    const entry = entryByStableId.get(record.stableId);
    assert.ok(entry, record.stableId);
    assert.equal(entry.baseTitle, record.publicTitle);
    assert.equal(entry.displayTitle, record.displayTitle);
    assert.equal(entry.canonicalPath, record.canonicalPath);
    assert.equal(routeManifest.routes.find((route) => route.stableId === record.stableId)?.canonicalPath, record.canonicalPath);
    assert.ok(record.metadataTitle.includes(record.displayTitle), record.stableId);
  }
});

test("duplicate-title handling uses consistent stable Design N numbering and does not suffix unique titles", () => {
  assert.equal(titleManifest.summary.duplicateGroupCount, 69);
  assert.equal(titleManifest.summary.duplicateRecordCount, 138);
  assert.deepEqual(titleManifest.summary.duplicateGroupSizeDistribution, { 2: 69 });
  for (const group of titleManifest.duplicateGroups) {
    const ordered = [...group.records].sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath) || left.stableId.localeCompare(right.stableId));
    assert.deepEqual(ordered.map((record) => Number(record.displayTitle.match(/Design (\d+)$/)?.[1])), [1, 2]);
    assert.equal(new Set(ordered.map((record) => record.displayTitle)).size, ordered.length);
    assert.equal(ordered.every((record) => !/Design \d+.*Design \d+/i.test(record.displayTitle)), true);
  }
  for (const entry of titleManifest.entries) {
    assert.equal(entry.duplicateGroupSize === 1, entry.designNumber == null, entry.stableId);
    assert.equal(entry.duplicateGroupSize > 1, / — Design \d+$/.test(entry.displayTitle), entry.stableId);
  }

  const first = buildPrintableTitleAssignments([
    fixture("alpha-a", "aaaaaaaaaa", "/printables/test/alpha-a", "Apple Blossom"),
    fixture("alpha-z", "zzzzzzzzzz", "/printables/test/alpha-z", "Apple Blossom"),
    fixture("train", "1111111111", "/printables/test/train", "Train"),
  ]);
  const previousManifest = { entries: [...first.values()].map((assignment, index) => ({
    stableId: ["aaaaaaaaaa", "zzzzzzzzzz", "1111111111"][index],
    baseTitle: ["Apple Blossom", "Apple Blossom", "Train"][index],
    designNumber: assignment.designNumber,
  })) };
  const second = buildPrintableTitleAssignments([
    fixture("alpha-a", "aaaaaaaaaa", "/printables/test/alpha-a", "Apple Blossom"),
    fixture("alpha-z", "zzzzzzzzzz", "/printables/test/alpha-z", "Apple Blossom"),
    fixture("alpha-new", "0000000000", "/printables/test/alpha-0", "Apple Blossom"),
    fixture("train", "1111111111", "/printables/test/train", "Train"),
  ], { previousManifest });
  assert.equal(second.get("alpha-a").designNumber, 1);
  assert.equal(second.get("alpha-z").designNumber, 2);
  assert.equal(second.get("alpha-new").designNumber, 3);
  assert.equal(second.get("train").designNumber, null);
});

test("consumer consistency uses generated display titles in cards, detail pages, search, JSON-LD, and image sitemap", async () => {
  const sources = await readSources([
    "src/lib/coloring/data.ts",
    "src/components/coloring/PrintableDetailPage.tsx",
    "src/lib/coloring/printableMetadata.ts",
    "src/lib/seo/printableJsonLd.ts",
    "pipeline/scripts/build-static-search-data.mjs",
    "pipeline/scripts/build-image-sitemap-data.mjs",
  ]);
  assert.match(sources[0], /title: titleModel\.displayTitle/);
  assert.match(sources[1], /<h1[^>]*>\{displayTitle\}<\/h1>/);
  assert.match(sources[1], /\{ label: displayTitle \}/);
  assert.match(sources[2], /titleModel\.metadataTitle/);
  assert.match(sources[3], /name: titleModel\.displayTitle/);
  assert.match(sources[3], /caption: titleModel\.shortAccessibleTitle/);
  assert.match(sources[4], /title: printable\.displayTitle/);
  assert.match(sources[5], /record\.displayTitle/);

  const searchById = new Map(searchPayload.items.map((entry) => [entry.id, entry]));
  const imageByStableId = new Map(imageSitemapData.imageEntries.map((entry) => [entry.assetId.slice(-10), entry]));
  for (const record of printables.records) {
    assert.equal(searchById.get(record.assetId)?.title, record.displayTitle, record.stableId);
    assert.equal(searchById.get(record.assetId)?.alt, record.altText, record.stableId);
    assert.equal(imageByStableId.get(record.stableId)?.imageTitle, record.displayTitle, record.stableId);
  }
});

test("metadata uniqueness is global, bounded, display-title aligned, and description-safe", () => {
  const titles = printables.records.map((record) => record.metadataTitle);
  const descriptions = printables.records.map((record) => `Print ${record.displayTitle} or download this coloring page as PNG, JPG, or WebP.`);
  assert.equal(new Set(titles).size, printables.records.length);
  assert.equal(new Set(descriptions).size, printables.records.length);
  for (const record of printables.records) {
    assert.ok(record.metadataTitle.includes(record.displayTitle), record.stableId);
    assert.ok(record.metadataTitle.length <= 128, record.stableId);
    assert.match(record.metadataTitle, / \| Free Printable$/);
  }
  assert.equal(descriptions.every((description, index) => description.endsWith(" or download this coloring page as PNG, JPG, or WebP.") && description.startsWith(`Print ${printables.records[index].displayTitle}`)), true);
});

test("image-alt quality is unique, concise, nonempty, and avoids redundant coloring-page wording", () => {
  const values = printables.records.map((record) => record.altText);
  assert.equal(new Set(values).size, printables.records.length);
  for (const record of printables.records) {
    assert.equal(record.altText, buildPrintableAltText(record.displayTitle), record.stableId);
    assert.ok(record.altText.length > 0 && record.altText.length <= 120, record.stableId);
    assert.doesNotMatch(record.altText, /coloring page\s+coloring page|\.(?:svg|png|webp|jpe?g)\b|\bimage of\b/i);
    assert.doesNotMatch(record.altText, new RegExp(record.stableId, "i"));
  }
});

test("description quality is unique across designs and makes only verified format and action claims", async () => {
  const source = await readText("src/lib/coloring/printableTitles.ts");
  assert.match(source, /Print \$\{displayTitle\} or download this coloring page as PNG, JPG, or WebP\./);
  const descriptions = printables.records.map((record) => `Print ${record.displayTitle} or download this coloring page as PNG, JPG, or WebP.`);
  assert.equal(new Set(descriptions).size, descriptions.length);
  assert.equal(descriptions.every((description) => description.length >= 40 && description.length <= 180), true);
  assert.equal(descriptions.every((description) => !/SVG|source file|runtime data|conversion pipeline|educational|therapeutic/i.test(description.slice(description.indexOf(" or download")))), true);
});

test("search keeps base-title matching, design-number matching, and deterministic design ordering", async () => {
  const ranking = await importRanking();
  const group = titleManifest.duplicateGroups[0];
  const navigationByStableId = new Map(navigationPayload.p.map((tuple) => [tuple[0], tuple]));
  const items = group.records.map((record) => {
    const tuple = navigationByStableId.get(record.stableId);
    return { title: tuple[1], stableKey: tuple[0], primaryLabel: tuple[4], normalizedText: tuple[5] };
  });
  const baseResults = ranking.rankSearchItems(items, group.correctedBaseTitle);
  assert.deepEqual(baseResults.map((result) => Number(result.item.title.match(/Design (\d+)$/)?.[1])), [1, 2]);
  const designTwo = items.find((item) => /Design 2$/.test(item.title));
  assert.equal(ranking.rankSearchItems(items, designTwo.title)[0].item.stableKey, designTwo.stableKey);

  const correctedUnique = printables.records.find((record) => record.designNumber == null && record.publicTitle !== record.displayTitle);
  const searchEntry = searchPayload.items.find((entry) => entry.id === correctedUnique.assetId);
  assert.ok(ranking.rankSearchItems([{ title: searchEntry.title, stableKey: correctedUnique.stableId, normalizedText: searchEntry.text }], correctedUnique.publicTitle).length > 0);
  assert.equal(navigationPayload.c.length, 163);
});

test("title determinism produces identical runtime, manifest, and report hashes without volatile timestamps", async () => {
  const runtimeGenerated = await buildRuntimePrintables({ repoRoot: ROOT, write: false });
  assert.deepEqual(runtimeGenerated.printables, printables);
  const first = await buildPrintableTitleQuality({ repoRoot: ROOT, write: false });
  const second = await buildPrintableTitleQuality({ repoRoot: ROOT, write: false });
  assert.equal(hash(first.manifest), hash(second.manifest));
  assert.equal(hash(first.report), hash(second.report));
  assert.equal(first.manifest.generatedAt, printables.generatedAt);
  assert.equal(first.report.includes(`Generated: ${printables.generatedAt}`), true);
});

test("public-title safety has zero technical, filename, path, ID, placeholder, or repeated-suffix findings", () => {
  assert.equal(titleManifest.summary.publicSafetyFindingCount, 0);
  assert.equal(titleManifest.hubContent.h1MismatchCount, 0);
  assert.equal(titleManifest.hubContent.inaccurateCountCount, 0);
  assert.equal(titleManifest.hubContent.internalWordingCount, 0);
  for (const record of printables.records) {
    assert.deepEqual(getPublicTitleSafetyFlags(record.displayTitle, record), [], record.stableId);
    assert.deepEqual(getPublicTitleSafetyFlags(record.metadataTitle, record), [], record.stableId);
    assert.deepEqual(getPublicTitleSafetyFlags(record.altText, record), [], record.stableId);
    assert.doesNotMatch(`${record.displayTitle}\n${record.metadataTitle}\n${record.altText}`, /coloring page\s+coloring page/i);
  }
});

function fixture(assetId, stableId, canonicalPath, publicTitle) {
  return { assetId, stableId, canonicalPath, publicTitle };
}

function hashRouteFields(records) {
  return hash(records.map(({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath }) => ({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath })));
}

function hash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

async function importRanking() {
  const source = await readText("src/lib/search/ranking.ts");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

async function readSources(paths) {
  return Promise.all(paths.map(readText));
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}
