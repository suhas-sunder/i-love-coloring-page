#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getEditorialQualityFlags,
  getGeneratedTitleQualityFlags,
  getPublicTitleSafetyFlags,
  mechanicallyCorrectTitle,
  normalizeExactTitle,
  normalizePunctuationInsensitiveTitle,
  sha256Json,
} from "../lib/printable-title-quality.mjs";

const EDITORIAL_REVIEW_FLAGS = new Set([
  "source-context-required",
  "ambiguous-numeric-suffix",
  "uncertain-spelling",
  "brand-or-model-name-review",
  "long-title-review",
  "numeric-suffix-review",
  "uncertain-term-review",
]);

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
export const TITLE_QUALITY_INPUTS = Object.freeze({
  printables: "src/generated/coloring/runtime-printables.json",
  hubs: "src/generated/coloring/runtime-hubs.json",
  routes: "pipeline/manifests/runtime-printable-route-manifest.json",
  titleOverrides: "src/generated/coloring/title-overrides.json",
});
export const TITLE_QUALITY_OUTPUTS = Object.freeze({
  manifest: "pipeline/manifests/printable-title-manifest.json",
  report: "pipeline/reports/printable-title-quality.md",
});

export async function buildPrintableTitleQuality({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const input = await readInputs(repoRoot);
  const output = buildOutput(input);
  validateOutput(input, output);
  const report = renderReport(output);

  if (write) {
    await writeText(repoRoot, TITLE_QUALITY_OUTPUTS.manifest, `${JSON.stringify(output, null, 2)}\n`);
    await writeText(repoRoot, TITLE_QUALITY_OUTPUTS.report, report);
  }
  return { manifest: output, report };
}

function buildOutput(input) {
  const manualReviewAssetIds = new Set((input.titleOverrides.overrides || []).filter((entry) => entry.manualReviewRequired).map((entry) => entry.assetId));
  const correctedByAssetId = new Map(input.printables.records.map((record) => [record.assetId, mechanicallyCorrectTitle(record.publicTitle)]));
  const groups = groupBy(input.printables.records, (record) => normalizeExactTitle(correctedByAssetId.get(record.assetId).title));
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1).sort((left, right) => left[0].publicTitle.localeCompare(right[0].publicTitle));
  const punctuationGroups = groupBy(input.printables.records, (record) => normalizePunctuationInsensitiveTitle(correctedByAssetId.get(record.assetId).title));
  const punctuationOnlyGroups = [...punctuationGroups.values()].filter((group) => group.length > 1 && new Set(group.map((record) => normalizeExactTitle(correctedByAssetId.get(record.assetId).title))).size > 1);
  const hubById = new Map(input.hubs.hubs.map((hub) => [hub.hubId, hub]));

  const entries = input.printables.records
    .map((record) => {
      const correction = correctedByAssetId.get(record.assetId);
      const groupSize = groups.get(normalizeExactTitle(correction.title)).length;
      const publicSafetyFlags = [
        ...getPublicTitleSafetyFlags(record.displayTitle, record),
        ...getPublicTitleSafetyFlags(record.metadataTitle, record),
        ...getPublicTitleSafetyFlags(record.altText, record),
      ];
      const qualityFlags = [
        ...correction.flags,
        ...(groupSize > 1 ? ["valid-duplicate-base-title"] : []),
        ...getEditorialQualityFlags(record, { manualReviewAssetIds }),
        ...getGeneratedTitleQualityFlags(record.displayTitle),
        ...publicSafetyFlags,
      ];
      return {
        stableId: record.stableId,
        canonicalPath: record.canonicalPath,
        baseTitle: record.publicTitle,
        displayTitle: record.displayTitle,
        duplicateGroupSize: groupSize,
        designNumber: record.designNumber,
        primaryCategory: record.primaryCategorySlug,
        qualityFlags: [...new Set(qualityFlags)],
      };
    })
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath) || left.stableId.localeCompare(right.stableId));

  const correctionFlagCounts = countFlags(entries, (flag) => flag.startsWith("corrected-"));
  const editorialFlagCounts = countFlags(entries, (flag) => EDITORIAL_REVIEW_FLAGS.has(flag));
  const publicSafetyFlagCounts = countFlags(entries, (flag) => !flag.startsWith("corrected-") && !flag.startsWith("valid-") && !EDITORIAL_REVIEW_FLAGS.has(flag));
  const duplicateGroupDetails = duplicateGroups.map((group) => {
    const ordered = [...group].sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath) || left.stableId.localeCompare(right.stableId));
    const hubUnion = new Set(ordered.flatMap((record) => record.hubIds));
    return {
      baseTitle: ordered[0].publicTitle,
      correctedBaseTitle: correctedByAssetId.get(ordered[0].assetId).title,
      size: ordered.length,
      hubUnionCount: hubUnion.size,
      sameHubMembership: ordered.every((record) => sameValues(record.hubIds, ordered[0].hubIds)),
      primaryCategoryCount: new Set(ordered.map((record) => record.primaryCategorySlug)).size,
      distinctWebpPathCount: new Set(ordered.map((record) => record.webpPath)).size,
      records: ordered.map((record) => ({
        stableId: record.stableId,
        canonicalPath: record.canonicalPath,
        primaryCategory: record.primaryCategorySlug,
        hubIds: record.hubIds,
        displayTitle: record.displayTitle,
        metadataTitle: record.metadataTitle,
      })),
    };
  });
  const groupSizes = Object.fromEntries([...new Set(duplicateGroups.map((group) => group.length))].sort((a, b) => a - b).map((size) => [String(size), duplicateGroups.filter((group) => group.length === size).length]));
  const approvedHubIntroPattern = /^Browse [\d,]+ printable pages (?:in the .+ collection|in the full collection), then search or filter the available designs\.$/;
  const hubInternalPattern = /(?:descriptive filenames|approved production metadata|runtime assets|pipeline|taxonomy)/i;
  const hubContent = {
    hubCount: input.hubs.hubs.length,
    h1MismatchCount: input.hubs.hubs.filter((hub) => hub.h1 !== hub.title).length,
    inaccurateCountCount: input.hubs.hubs.filter((hub) => hub.assetCount !== hub.assetIds.length).length,
    internalWordingCount: input.hubs.hubs.filter((hub) => hubInternalPattern.test(hub.intro)).length,
    qualityControlledIntroCount: input.hubs.hubs.filter((hub) => approvedHubIntroPattern.test(hub.intro)).length,
    exactDuplicateIntroGroupCount: [...groupBy(input.hubs.hubs, (hub) => normalizeExactTitle(hub.intro)).values()].filter((group) => group.length > 1).length,
  };

  return {
    generatedAt: input.printables.generatedAt,
    runId: "printable-title-quality-v1",
    sources: Object.values(TITLE_QUALITY_INPUTS),
    policy: {
      baseTitle: "reviewed runtime publicTitle; never overwritten by generated design numbering",
      exactGrouping: "Unicode NFKC, case folding, whitespace, apostrophe, and hyphen normalization after high-confidence mechanical corrections",
      duplicateSuffix: "all exact duplicate groups use an em dash followed by Design N",
      duplicateOrdering: "preserve valid prior manifest design numbers; otherwise frozen canonicalPath ascending, then stableId ascending",
      metadataTitleMaximumCharacters: 128,
      visibleTitleTruncation: false,
      canonicalRoutesAffected: false,
    },
    summary: {
      printableCount: entries.length,
      uniqueBaseTitleCount: groups.size,
      duplicateGroupCount: duplicateGroups.length,
      duplicateRecordCount: duplicateGroups.reduce((count, group) => count + group.length, 0),
      largestDuplicateGroupSize: Math.max(0, ...duplicateGroups.map((group) => group.length)),
      duplicateGroupSizeDistribution: groupSizes,
      duplicateGroupsWithOneHubInUnion: duplicateGroupDetails.filter((group) => group.hubUnionCount === 1).length,
      duplicateGroupsWithSeveralHubsInUnion: duplicateGroupDetails.filter((group) => group.hubUnionCount > 1).length,
      duplicateGroupsWithDifferentHubMembership: duplicateGroupDetails.filter((group) => !group.sameHubMembership).length,
      duplicateGroupsAcrossPrimaryCategories: duplicateGroupDetails.filter((group) => group.primaryCategoryCount > 1).length,
      duplicateGroupsWithDistinctRuntimeWebpPaths: duplicateGroupDetails.filter((group) => group.distinctWebpPathCount === group.size).length,
      duplicateGroupsWithRepeatedRuntimeWebpPaths: duplicateGroupDetails.filter((group) => group.distinctWebpPathCount < group.size).length,
      punctuationOnlyNearDuplicateGroupCount: punctuationOnlyGroups.length,
      uniqueDisplayTitleCount: new Set(entries.map((entry) => entry.displayTitle)).size,
      uniqueMetadataTitleCount: new Set(input.printables.records.map((record) => record.metadataTitle)).size,
      uniqueAltTextCount: new Set(input.printables.records.map((record) => record.altText)).size,
      mechanicallyCorrectedRecordCount: entries.filter((entry) => entry.qualityFlags.some((flag) => flag.startsWith("corrected-"))).length,
      editorialReviewRecordCount: entries.filter((entry) => entry.qualityFlags.some((flag) => Object.hasOwn(editorialFlagCounts, flag))).length,
      publicSafetyFindingCount: Object.values(publicSafetyFlagCounts).reduce((total, count) => total + count, 0),
      entrySha256: sha256Json(entries),
    },
    correctionFlagCounts,
    editorialFlagCounts,
    publicSafetyFlagCounts,
    hubContent,
    duplicateGroups: duplicateGroupDetails,
    entries,
  };
}

function validateOutput(input, output) {
  const { records } = input.printables;
  if (output.entries.length !== records.length || output.summary.printableCount !== records.length) throw new Error("Title manifest record count mismatch");
  if (output.summary.uniqueDisplayTitleCount !== records.length) throw new Error("Printable display titles are not globally unique");
  if (output.summary.uniqueMetadataTitleCount !== records.length) throw new Error("Printable metadata titles are not globally unique");
  if (output.summary.uniqueAltTextCount !== records.length) throw new Error("Printable alt text is not globally unique");
  if (output.summary.publicSafetyFindingCount !== 0) throw new Error("Public title safety findings remain");
  if (input.routes.routes.length !== records.length) throw new Error("Frozen route count mismatch");
  const frozenByStableId = new Map(input.routes.routes.map((route) => [route.stableId, route.canonicalPath]));
  for (const entry of output.entries) {
    if (frozenByStableId.get(entry.stableId) !== entry.canonicalPath) throw new Error(`Frozen route changed for ${entry.stableId}`);
    if (entry.duplicateGroupSize > 1 && entry.designNumber == null) throw new Error(`Duplicate title missing design number: ${entry.stableId}`);
    if (entry.duplicateGroupSize === 1 && entry.designNumber != null) throw new Error(`Unique title received design number: ${entry.stableId}`);
  }
  const serialized = JSON.stringify(output);
  if (/localhost|127\.0\.0\.1|[A-Za-z]:\\|file:\/\/|r2\.dev|cloudflarestorage|amazonaws/i.test(serialized)) throw new Error("Unsafe location leaked into title manifest");
}

function renderReport(output) {
  const correctionRows = Object.entries(output.correctionFlagCounts).map(([flag, count]) => `| ${flag} | ${count.toLocaleString("en-US")} |`).join("\n") || "| none | 0 |";
  const editorialRows = output.entries
    .filter((entry) => entry.qualityFlags.some((flag) => Object.hasOwn(output.editorialFlagCounts, flag)))
    .map((entry) => `| ${escapeTable(entry.baseTitle)} | \`${entry.stableId}\` | \`${entry.canonicalPath}\` | ${entry.qualityFlags.filter((flag) => Object.hasOwn(output.editorialFlagCounts, flag)).join(", ")} |`)
    .join("\n") || "| none | - | - | - |";
  const duplicateSections = output.duplicateGroups.map((group) => `### ${group.correctedBaseTitle}\n\n- Group size: ${group.size}\n- Hub union: ${group.hubUnionCount}\n- Same hub membership: ${group.sameHubMembership ? "yes" : "no"}\n- Primary categories: ${group.primaryCategoryCount}\n- Distinct runtime WebP paths: ${group.distinctWebpPathCount}\n\n| Design | Stable ID | Frozen canonical path | Primary category | Hub IDs | Metadata title |\n|---:|---|---|---|---|---|\n${group.records.map((record) => `| ${record.displayTitle.match(/Design (\d+)$/)?.[1] || "-"} | \`${record.stableId}\` | \`${record.canonicalPath}\` | ${record.primaryCategory} | ${record.hubIds.join(", ")} | ${escapeTable(record.metadataTitle)} |`).join("\n")}`).join("\n\n");
  return `# Printable Title Quality\n\nGenerated: ${output.generatedAt}\n\n## Summary\n\n| Metric | Value |\n|---|---:|\n| Runtime printables | ${output.summary.printableCount.toLocaleString("en-US")} |\n| Unique reviewed base titles | ${output.summary.uniqueBaseTitleCount.toLocaleString("en-US")} |\n| Exact duplicate groups | ${output.summary.duplicateGroupCount.toLocaleString("en-US")} |\n| Records in duplicate groups | ${output.summary.duplicateRecordCount.toLocaleString("en-US")} |\n| Largest duplicate group | ${output.summary.largestDuplicateGroupSize.toLocaleString("en-US")} |\n| Unique display titles | ${output.summary.uniqueDisplayTitleCount.toLocaleString("en-US")} |\n| Unique metadata titles | ${output.summary.uniqueMetadataTitleCount.toLocaleString("en-US")} |\n| Unique alternative text values | ${output.summary.uniqueAltTextCount.toLocaleString("en-US")} |\n| Mechanically corrected records | ${output.summary.mechanicallyCorrectedRecordCount.toLocaleString("en-US")} |\n| Editorial-review records | ${output.summary.editorialReviewRecordCount.toLocaleString("en-US")} |\n| Public-safety findings | ${output.summary.publicSafetyFindingCount.toLocaleString("en-US")} |\n| Entry SHA-256 | \`${output.summary.entrySha256}\` |\n\nAll duplicate groups contain two separately routed runtime records. Distinct stable IDs and distinct runtime WebP paths support treating them as separate printable pages; original artwork was not inspected. Metadata was already numbered before this pass, while cards, H1s, breadcrumbs, search labels, related labels, and image-sitemap titles were not.\n\n## Mechanical corrections\n\n| Finding | Records |\n|---|---:|\n${correctionRows}\n\nThese corrections affect display and accessibility labels only. The reviewed base title remains available in the runtime record and title manifest.\n\n## Hub content\n\n| Check | Value |\n|---|---:|\n| Public hubs | ${output.hubContent.hubCount} |\n| H1/title mismatches | ${output.hubContent.h1MismatchCount} |\n| Count mismatches | ${output.hubContent.inaccurateCountCount} |\n| Internal wording remaining | ${output.hubContent.internalWordingCount} |\n| Quality-controlled concise intros | ${output.hubContent.qualityControlledIntroCount} |\n| Exact duplicate intro groups | ${output.hubContent.exactDuplicateIntroGroupCount} |\n\nThe quality-controlled introductions intentionally use one concise structure. They were not rewritten merely to manufacture variation. Taxonomy differentiation remains deferred to owner review.\n\n## Editorial review\n\n| Current reviewed base title | Stable ID | Frozen canonical path | Review reason |\n|---|---|---|---|\n${editorialRows}\n\nNo replacement title is asserted for these records without source context or artwork review. Brand and model flags are review prompts, not legal conclusions.\n\n## Exact duplicate groups\n\n${duplicateSections || "None."}\n`;
}

function countFlags(entries, include) {
  const counts = new Map();
  for (const entry of entries) for (const flag of entry.qualityFlags) if (include(flag)) counts.set(flag, (counts.get(flag) || 0) + 1);
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) || [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|");
}

async function readInputs(repoRoot) {
  return Object.fromEntries(await Promise.all(Object.entries(TITLE_QUALITY_INPUTS).map(async ([key, relativePath]) => [key, JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"))])));
}

async function writeText(repoRoot, relativePath, value) {
  const target = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  buildPrintableTitleQuality()
    .then(({ manifest }) => console.log(JSON.stringify(manifest.summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
