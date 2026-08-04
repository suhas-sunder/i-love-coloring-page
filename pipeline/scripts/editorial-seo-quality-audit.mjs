#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeHubEditorialQuality } from "../lib/editorial-seo-quality.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const REVIEW_ROOT = path.join(ROOT, "pipeline/review/editorial-seo");
const label = readArgument("--label") || "snapshot";
const printables = await readJson("src/generated/coloring/runtime-printables.json");
const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
const editorial = await readJson("src/config/hub-editorial-content.json");
const runtimeRoutes = await readJson("src/generated/coloring/runtime-routes.json");
const routeManifest = await readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const titleManifest = await readJson("pipeline/manifests/printable-title-manifest.json");
const imageSitemapXml = await readText("public/image-sitemap.xml");

const printableInventory = printables.records.map((record) => ({
  assetId: record.assetId,
  stableId: record.stableId,
  canonicalSlug: record.canonicalSlug,
  canonicalPath: record.canonicalPath,
  primaryHubId: record.primaryHubId,
  primaryCategorySlug: record.primaryCategorySlug,
  hubIds: record.hubIds,
  relatedAssetIds: record.relatedAssetIds,
  relatedHubIds: record.relatedHubIds,
  webpPath: record.webpPath,
  svgPath: record.svgPath,
  publicTitle: record.publicTitle,
  displayTitle: record.displayTitle,
  metadataTitle: record.metadataTitle,
  metadataDescription: buildPrintableDescription(record),
  altText: record.altText,
  indexable: true,
}));

const hubInventory = hubs.hubs.map((hub) => ({
  hubId: hub.hubId,
  route: hub.route,
  title: hub.title,
  h1: hub.h1,
  metaTitle: hub.metaTitle,
  metaDescription: hub.metaDescription,
  intro: hub.intro,
  editorial: editorial.hubs[hub.hubId],
  assetCount: hub.assetCount,
  assetIds: hub.assetIds,
  indexable: hub.indexable,
  sitemap: hub.sitemap,
}));

const indexableHubs = hubInventory.filter((hub) => hub.indexable);
const hubParagraphs = hubInventory.flatMap((hub) => Object.entries(hub.editorial || {})
  .filter(([key, value]) => ["introduction", "scope", "distinction", "selectionGuidance"].includes(key) && typeof value === "string")
  .map(([field, text]) => ({ hubId: hub.hubId, route: hub.route, field, text })));
const exactTitleGroups = duplicateGroups(printableInventory, (entry) => normalize(entry.displayTitle));
const normalizedTitleGroups = duplicateGroups(printableInventory, (entry) => normalizeTitleForSimilarity(entry.displayTitle));
const exactDescriptionGroups = duplicateGroups(printableInventory, (entry) => normalize(entry.metadataDescription));
const exactHubParagraphGroups = duplicateGroups(hubParagraphs, (entry) => normalize(entry.text));
const nearHubParagraphPairs = findNearPairs(hubParagraphs, 0.76);
const exactHubIntroGroups = duplicateGroups(indexableHubs, (hub) => normalize(hub.intro));
const nearHubIntroPairs = findNearPairs(indexableHubs.map((hub) => ({ ...hub, text: hub.intro })), 0.68);
const metadataDescriptions = printableInventory.map((entry) => entry.metadataDescription);
const metadataTitles = printableInventory.map((entry) => entry.metadataTitle);
const titleDefects = collectTitleDefects(printableInventory);
const smallHubReviews = indexableHubs
  .filter((hub) => hub.assetCount < 20)
  .sort((left, right) => left.assetCount - right.assetCount || left.route.localeCompare(right.route))
  .map((hub) => buildSmallHubReview(hub, printables.records));
const introFrameCounts = countIntroFrames(indexableHubs);
const printableByAssetId = new Map(printables.records.map((record) => [record.assetId, record]));
const formulaicContent = analyzeHubEditorialQuality(indexableHubs.map((hub) => ({
  ...hub,
  memberTitles: hub.assetIds.map((assetId) => printableByAssetId.get(assetId)?.displayTitle).filter(Boolean),
})));
const internalLeakPattern = /(?:chatgpt|\bfailed\b|pipeline|asset[ -]?id|stable[ -]?id|source filename|r2\.dev|cloudflarestorage|amazonaws|file:\/\/|localhost|127\.0\.0\.1|\.(?:svg|png|webp|jpe?g)\s*$)/i;

const result = {
  generatedAt: new Date().toISOString(),
  label,
  sources: [
    "src/generated/coloring/runtime-printables.json",
    "src/generated/coloring/runtime-hubs.json",
    "src/config/hub-editorial-content.json",
    "src/generated/coloring/runtime-routes.json",
    "pipeline/manifests/runtime-printable-route-manifest.json",
    "pipeline/manifests/printable-title-manifest.json",
    "public/image-sitemap.xml",
  ],
  summary: {
    printableCount: printableInventory.length,
    routeManifestCount: routeManifest.routes.length,
    publicHubCount: hubInventory.length,
    indexableHubCount: indexableHubs.length,
    sitemapHubCount: indexableHubs.filter((hub) => hub.sitemap).length,
    hubBelow12Count: indexableHubs.filter((hub) => hub.assetCount < 12).length,
    hubBelow20Count: indexableHubs.filter((hub) => hub.assetCount < 20).length,
    introOnlyHubCount: hubInventory.filter((hub) => !hub.editorial?.scope && !hub.editorial?.distinction && !hub.editorial?.selectionGuidance).length,
    exactDuplicateDisplayTitleGroupCount: exactTitleGroups.length,
    normalizedNearDuplicateTitleGroupCount: normalizedTitleGroups.length,
    exactDuplicateMetadataTitleGroupCount: duplicateGroups(printableInventory, (entry) => normalize(entry.metadataTitle)).length,
    exactDuplicateMetadataDescriptionGroupCount: exactDescriptionGroups.length,
    exactDuplicateHubIntroGroupCount: exactHubIntroGroups.length,
    nearDuplicateHubIntroPairCount: nearHubIntroPairs.length,
    exactDuplicateHubParagraphGroupCount: exactHubParagraphGroups.length,
    nearDuplicateHubParagraphPairCount: nearHubParagraphPairs.length,
    metadataTitleOver70Count: metadataTitles.filter((value) => value.length > 70).length,
    metadataTitleOver128Count: metadataTitles.filter((value) => value.length > 128).length,
    metadataDescriptionMissingCount: metadataDescriptions.filter((value) => !value.trim()).length,
    metadataDescriptionOver210Count: metadataDescriptions.filter((value) => value.length > 210).length,
    genericPrintableDescriptionCount: metadataDescriptions.filter((value) => /\. A portrait printable in the .+ collection\.$/i.test(value)).length,
    unsupportedClaimCount: formulaicContent.summary.unsupportedClaimCount,
    internalLeakCount: printableInventory.filter((entry) => internalLeakPattern.test(`${entry.displayTitle}\n${entry.metadataTitle}\n${entry.altText}`)).length,
    sitemapHubRouteCount: runtimeRoutes.routes.filter((route) => route.indexable && route.sitemap).length,
    imageSitemapPageLocCount: countOccurrences(imageSitemapXml, "<url>"),
    imageSitemapImageLocCount: countOccurrences(imageSitemapXml, "<image:loc>"),
    ...titleDefects.counts,
    ...introFrameCounts,
    formulaicNearDuplicateIntroPairCount: formulaicContent.summary.nearDuplicateIntroPairCount,
    formulaicRepeatedOpeningGroupCount: formulaicContent.summary.repeatedOpeningGroupCount,
    formulaicVaguePhraseFindingCount: formulaicContent.summary.vaguePhraseFindingCount,
    formulaicInventoryMismatchCount: formulaicContent.summary.inventoryMismatchCount,
  },
  hashes: {
    protectedPrintableContract: sha256(printableInventory.map(protectedPrintableFields)),
    printableDisplayMetadata: sha256(printableInventory.map(({ stableId, displayTitle, metadataTitle, metadataDescription, altText }) => ({ stableId, displayTitle, metadataTitle, metadataDescription, altText }))),
    protectedHubContract: sha256(hubInventory.map(protectedHubFields)),
    hubEditorialMetadata: sha256(hubInventory.map(({ hubId, intro, editorial: hubEditorial, metaTitle, metaDescription }) => ({ hubId, intro, editorial: hubEditorial, metaTitle, metaDescription }))),
    sitemapRouteContract: sha256(runtimeRoutes.routes.map(({ path: routePath, indexable, sitemap }) => ({ path: routePath, indexable, sitemap }))),
    imageSitemapXml: sha256(imageSitemapXml),
  },
  titleDefects,
  titleQualityManifest: {
    summary: titleManifest.summary,
    correctionFlagCounts: titleManifest.correctionFlagCounts,
    editorialFlagCounts: titleManifest.editorialFlagCounts,
  },
  introFrameCounts,
  formulaicContent,
  exactTitleGroups,
  normalizedTitleGroups,
  exactDescriptionGroups,
  exactHubIntroGroups,
  nearHubIntroPairs,
  exactHubParagraphGroups,
  nearHubParagraphPairs,
  smallHubReviews,
  printables: printableInventory,
  hubs: hubInventory,
};

await mkdir(REVIEW_ROOT, { recursive: true });
const outputPath = path.join(REVIEW_ROOT, `${label}-inventory.json`);
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath: path.relative(ROOT, outputPath).replaceAll(path.sep, "/"), summary: result.summary, hashes: result.hashes }, null, 2));

function collectTitleDefects(inventory) {
  const definitions = [
    ["midievalCount", /\bMidieval\b/i],
    ["bakiniCount", /\bBakini\b/i],
    ["aligatorCount", /\bAligator\b/i],
    ["dalmationCount", /\bDalmation\b/i],
    ["celetbratingCount", /\bCeletbrating\b/i],
    ["holidayChristmasHolidayCount", /\bHoliday Christmas Holiday\b/i],
    ["christmasHolidayChristmasCount", /\bChristmas Holiday Christmas\b/i],
    ["terminalColoringPageCount", /\bColoring Page(?:\s*: Design \d+)?$/i],
    ["repeatedColoringPageCount", /\bcoloring page\s+coloring page\b/i],
    ["adjacentRepeatedWordCount", /\b([a-z][a-z'-]*)\s+\1\b/i],
  ];
  const counts = {};
  const findings = {};
  for (const [name, pattern] of definitions) {
    const matches = inventory.filter((entry) => pattern.test(entry.displayTitle));
    counts[name] = matches.length;
    findings[name] = matches.map(({ stableId, canonicalPath, publicTitle, displayTitle }) => ({ stableId, canonicalPath, publicTitle, displayTitle }));
  }
  counts.emptyOrShortTitleCount = inventory.filter((entry) => entry.displayTitle.trim().split(/\s+/).length < 2).length;
  counts.displayTitleOver80Count = inventory.filter((entry) => entry.displayTitle.length > 80).length;
  counts.metadataTitleMissingSubjectCount = inventory.filter((entry) => !normalize(entry.metadataTitle).includes(normalize(entry.displayTitle))).length;
  counts.numericSuffixReviewCount = inventory.filter((entry) => /\s\d+$/.test(entry.publicTitle) && !/: Design \d+$/.test(entry.displayTitle)).length;
  return { counts, findings };
}

function buildSmallHubReview(hub, records) {
  const memberRecords = new Map(records.map((record) => [record.assetId, record]));
  const members = hub.assetIds.map((assetId) => memberRecords.get(assetId)).filter(Boolean);
  const portraitCount = members.filter((record) => record.attributes?.orientation === "portrait").length;
  return {
    hubId: hub.hubId,
    route: hub.route,
    title: hub.title,
    assetCount: hub.assetCount,
    intro: hub.intro,
    portraitCount,
    displayTitles: members.map((record) => record.displayTitle),
    reviewStatus: hub.editorial?.reviewStatus || null,
  };
}

function countIntroFrames(values) {
  const frames = {
    introsContainingAppearCount: 0,
    introsContainingDesignsShowCount: 0,
    introsContainingThisCollectionIncludesCount: 0,
    introsContainingPerfectForCount: 0,
    introsContainingGreatForCount: 0,
    numberLedIntroCount: 0,
  };
  const numberWord = /^(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
  for (const hub of values) {
    if (/\bappear\b/i.test(hub.intro)) frames.introsContainingAppearCount += 1;
    if (/\bdesigns show\b/i.test(hub.intro)) frames.introsContainingDesignsShowCount += 1;
    if (/\bthis collection includes\b/i.test(hub.intro)) frames.introsContainingThisCollectionIncludesCount += 1;
    if (/\bperfect for\b/i.test(hub.intro)) frames.introsContainingPerfectForCount += 1;
    if (/\bgreat for\b/i.test(hub.intro)) frames.introsContainingGreatForCount += 1;
    if (numberWord.test(hub.intro)) frames.numberLedIntroCount += 1;
  }
  return frames;
}

function findNearPairs(entries, threshold) {
  const tokenSets = entries.map((entry) => new Set(tokenize(entry.text)));
  const pairs = [];
  for (let left = 0; left < entries.length; left += 1) {
    if (tokenSets[left].size < 6) continue;
    for (let right = left + 1; right < entries.length; right += 1) {
      if (tokenSets[right].size < 6) continue;
      const similarity = jaccard(tokenSets[left], tokenSets[right]);
      if (similarity < threshold) continue;
      pairs.push({
        left: summarizeEntry(entries[left]),
        right: summarizeEntry(entries[right]),
        similarity: Number(similarity.toFixed(4)),
      });
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity || JSON.stringify(a.left).localeCompare(JSON.stringify(b.left)));
}

function duplicateGroups(entries, keyFor) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFor(entry);
    const group = groups.get(key) || [];
    group.push(summarizeEntry(entry));
    groups.set(key, group);
  }
  return [...groups.entries()].filter(([, group]) => group.length > 1).map(([value, group]) => ({ value, entries: group }));
}

function summarizeEntry(entry) {
  return {
    ...(entry.stableId ? { stableId: entry.stableId } : {}),
    ...(entry.hubId ? { hubId: entry.hubId } : {}),
    ...(entry.route ? { route: entry.route } : {}),
    ...(entry.field ? { field: entry.field } : {}),
    ...(entry.displayTitle ? { displayTitle: entry.displayTitle } : {}),
    ...(entry.text ? { text: entry.text } : {}),
  };
}

function protectedPrintableFields(entry) {
  return {
    assetId: entry.assetId,
    stableId: entry.stableId,
    canonicalSlug: entry.canonicalSlug,
    canonicalPath: entry.canonicalPath,
    primaryHubId: entry.primaryHubId,
    primaryCategorySlug: entry.primaryCategorySlug,
    hubIds: entry.hubIds,
    relatedAssetIds: entry.relatedAssetIds,
    relatedHubIds: entry.relatedHubIds,
    webpPath: entry.webpPath,
    svgPath: entry.svgPath,
    indexable: entry.indexable,
  };
}

function protectedHubFields(hub) {
  return {
    hubId: hub.hubId,
    route: hub.route,
    title: hub.title,
    h1: hub.h1,
    assetCount: hub.assetCount,
    assetIds: hub.assetIds,
    indexable: hub.indexable,
    sitemap: hub.sitemap,
  };
}

function buildPrintableDescription(record) {
  return `Print ${record.displayTitle}, or download a printable-page PNG or JPG and an artwork-only WebP.`;
}

function normalizeTitleForSimilarity(value) {
  return normalize(value)
    .replace(/\s*: design \d+$/, "")
    .replace(/\s+coloring page$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value).replace(/[^a-z0-9'-]+/g, " ").split(/\s+/).filter(Boolean);
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

function jaccard(left, right) {
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection || 1);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
