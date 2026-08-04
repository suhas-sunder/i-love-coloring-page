import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { countTokenOverlap, getDiscoveryTokenProfile } from "../lib/gallery-discovery-quality.mjs";

const ROOT = process.cwd();
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const printableById = new Map(printables.records.map((record) => [record.assetId, record]));
const hubById = new Map(hubs.hubs.map((hub) => [hub.hubId, hub]));

test("gallery cards keep canonical links first and expose Print as a quiet secondary utility", async () => {
  const card = await readText("src/components/coloring/ImageCard.tsx");
  const actions = await readText("src/components/coloring/PrintableCardActions.tsx");
  const styles = await readText("src/styles/components.css");
  const imageLink = card.indexOf('className="gallery-item-media-link"');
  const titleLink = card.indexOf('className="item-title-link"');
  const printAction = card.indexOf("<PrintableCardActions");

  assert.ok(imageLink >= 0 && titleLink > imageLink && printAction > titleLink);
  assert.match(card, /href=\{itemHref\}/);
  assert.equal((card.match(/href=\{itemHref\}/g) || []).length, 2);
  assert.match(actions, /button button-ghost button-small gallery-print-button/);
  assert.doesNotMatch(actions, /buttonClassName \|\| "button button-primary/);
  assert.match(actions, /aria-haspopup="dialog"/);
  assert.match(styles, /\.gallery-actions \.gallery-print-button \{[\s\S]*min-height: 44px;[\s\S]*flex: 0 0 auto;/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.gallery-grid \{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(styles, /@media \(max-width: 640px\)[\s\S]*\.gallery-actions \.button-small \{[\s\S]{0,120}flex: 1/);
  assert.doesNotMatch(card, /<Link[\s\S]{0,500}<button/);
});

test("first-batch presentation is deterministic, bounded, and membership-preserving", async () => {
  const moduleUrl = `${pathToFileURL(path.join(ROOT, "src/lib/coloring/galleryPresentation.ts")).href}?test=gallery-discovery`;
  const { diversifyGalleryPresentation, getPresentationGroup } = await import(moduleUrl);
  const titles = [
    "Anime Girl Cat One",
    "Anime Girl Cat Two",
    "Anime Girl Cat Three",
    "Anime Girl Cat Four",
    "Flowers Rose",
    "Animals Alligator",
  ];
  const items = titles.map((title, index) => ({
    assetId: `item-${index}`,
    title,
    altText: title,
    downloadBaseName: title,
    canonicalPath: `/printables/example/item-${index}`,
    assetSubpaths: { svg: null, pngPreview: null, thumbnail: null },
  }));
  const first = diversifyGalleryPresentation(items);
  const second = diversifyGalleryPresentation(items);

  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.map((item) => item.assetId)), new Set(items.map((item) => item.assetId)));
  assert.equal(first.length, items.length);
  assert.equal(new Set(first.map((item) => item.assetId)).size, items.length);
  const groups = first.map((item) => getPresentationGroup(item.title));
  assert.equal(groups.some((group, index) => group === groups[index + 1] && group === groups[index + 2]), false);
});

test("static diversity does not replace complete search, filter, Show More, or pagination paths", async () => {
  const search = await readText("src/components/coloring/GallerySearch.tsx");
  const paginated = await readText("src/components/coloring/PaginatedGalleryGrid.tsx");
  const pagination = await readText("src/components/coloring/Pagination.tsx");

  assert.match(search, /presentedPageItems = useMemo\(\(\) => diversifyGalleryPresentation\(pageItems\)/);
  assert.match(search, /resultEntries\.slice\(0, visibleCount\)/);
  assert.match(search, /setVisibleCount\(\(count\) => count \+ INTERACTIVE_RESULT_BATCH_SIZE\)/);
  assert.match(search, /fetch\(searchDataPath/);
  assert.match(search, /resultItems = presentedPageItems/);
  assert.match(search, /rankSearchItems/);
  assert.match(paginated, /diversifyGalleryPresentation\(items\)/);
  assert.match(pagination, /href=\{pageHref\(basePath, previousPage\)\}/);
  assert.match(pagination, /href=\{pageHref\(basePath, nextPage\)\}/);
});

test("token normalization removes generic terms, normalizes plurals, and downweights broad words", () => {
  const alligator = getDiscoveryTokenProfile("Free Animals Alligators Coloring Pages: Design 2");
  assert.deepEqual(alligator.strongTokens, ["alligator"]);
  assert.deepEqual(alligator.broadTokens, ["animal"]);
  const overlap = countTokenOverlap(alligator, getDiscoveryTokenProfile("Animal Alligator Printable"));
  assert.deepEqual(overlap, { strong: 1, broad: 1 });
});

test("related printable benchmarks prioritize useful subject evidence", () => {
  assertBenchmark("4feec8505a", /alligator/i, 7, 8);
  assertBenchmark("3794ff8eaa", /\bcat\b|\bkitten\b/i, 6, 8);
  assertBenchmark("8dda1f7ef2", /dinosaur|\bdino\b|stegasaurus/i, 6, 8);
  assertBenchmark("a1245c4617", /christmas/i, 6, 8);
  assertBenchmark("c6343aeefe", /flower|tulip|bird of paradise/i, 6, 8);
  assertBenchmark("d462b8fcc6", /centaur/i, 7, 8);
  assertBenchmark("bc7c2e01c7", /forget me not/i, 5, 5);
  assertBenchmark("1f6b5be7bc", /balloon/i, 2, 2);
});

test("related collection benchmarks favor direct or specific collections over unrelated broad fallbacks", () => {
  assert.equal(relatedHubTitles("4feec8505a")[0], "Reptiles Coloring Pages");
  assert.deepEqual(relatedHubTitles("3794ff8eaa").slice(0, 2), ["Cats Coloring Pages", "Anime Girls Coloring Pages"]);
  assert.equal(relatedHubTitles("8dda1f7ef2")[0], "Dinosaurs Coloring Pages");
  assert.equal(relatedHubTitles("a1245c4617")[0], "Holidays Coloring Pages");
  assert.equal(relatedHubTitles("c6343aeefe")[0], "Flowers Coloring Pages");
  assert.equal(relatedHubTitles("d462b8fcc6")[0], "Fantasy Coloring Pages");
  assert.equal(relatedHubTitles("bc7c2e01c7")[0], "Forget-Me-Not Coloring Pages");

  for (const record of printables.records) {
    assert.equal(new Set(record.relatedAssetIds).size, record.relatedAssetIds.length, record.assetId);
    assert.equal(new Set(record.relatedHubIds).size, record.relatedHubIds.length, record.assetId);
    assert.equal(record.relatedAssetIds.includes(record.assetId), false, record.assetId);
    assert.equal(record.relatedHubIds.includes(record.primaryHubId), false, record.assetId);
    const relatedPaths = record.relatedAssetIds.map((assetId) => printableById.get(assetId)?.canonicalPath);
    assert.equal(new Set(relatedPaths).size, relatedPaths.length, record.assetId);
  }
});

test("related scoring remains build-time deterministic and avoids popularity or randomness", async () => {
  const generator = await readText("pipeline/scripts/build-runtime-printables.mjs");
  const scoring = await readText("pipeline/lib/gallery-discovery-quality.mjs");
  assert.match(generator, /stablePairTieBreak/);
  assert.match(generator, /left\.hubId\.localeCompare\(right\.hubId\)/);
  assert.doesNotMatch(`${generator}\n${scoring}`, /Math\.random|Date\.now|assetCount\s*\*/);
  assert.match(generator, /canonicalPath/);
  assert.match(generator, /selectedCanonicalPaths/);
});

test("paginated framing retains orientation once without repeated generated phrasing", async () => {
  const content = await readText("src/components/coloring/HubPageContent.tsx");
  const pagination = await readText("src/components/coloring/Pagination.tsx");
  assert.match(content, /Continue browsing/);
  assert.match(content, /<h2 className="section-title" id="page-gallery-title">More \{collectionName\(hub\)\}<\/h2>/);
  assert.match(content, /Showing \{\(\(\(pagedGallery\.currentPage - 1\)/);
  assert.doesNotMatch(content, /Printables on page|Showing page \$\{page/);
  assert.match(pagination, /Page \{currentPage\.toLocaleString\(\)\} of \{totalPages\.toLocaleString\(\)\}/);
  assert.match(pagination, />\s*Previous\s*</);
  assert.match(pagination, />\s*Next\s*</);
});

function assertBenchmark(stableId, pattern, minimumMatches, inspectedCount) {
  const record = recordByStableId(stableId);
  const titles = record.relatedAssetIds.slice(0, inspectedCount).map((assetId) => printableById.get(assetId)?.displayTitle || "");
  assert.ok(titles.filter((title) => pattern.test(title)).length >= minimumMatches, `${record.displayTitle}: ${titles.join(" | ")}`);
}

function relatedHubTitles(stableId) {
  return recordByStableId(stableId).relatedHubIds.map((hubId) => hubById.get(hubId)?.title || hubId);
}

function recordByStableId(stableId) {
  const record = printables.records.find((entry) => entry.stableId === stableId);
  assert.ok(record, stableId);
  return record;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
