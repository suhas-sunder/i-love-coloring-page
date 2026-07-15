#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");

export const PRINTABLE_INPUTS = Object.freeze({
  available: "src/generated/coloring/runtime-available-items.json",
  deferred: "src/generated/coloring/runtime-deferred-items.json",
  hubs: "src/generated/coloring/runtime-hubs.json",
  hubItems: "src/generated/coloring/runtime-hub-items.json",
  assetPaths: "src/generated/coloring/runtime-asset-paths.json",
  searchIndex: "src/generated/coloring/runtime-search-index.json",
  titleOverrides: "src/generated/coloring/title-overrides.json",
});

export const PRINTABLE_OUTPUTS = Object.freeze({
  routeManifest: "pipeline/manifests/runtime-printable-route-manifest.json",
  printables: "src/generated/coloring/runtime-printables.json",
  routeIndex: "src/generated/coloring/runtime-printable-route-index.json",
  titleReviewReport: "pipeline/reports/runtime-printable-title-review.md",
  relatedReport: "pipeline/reports/runtime-printable-related-data.md",
});

const STABLE_ID_PATTERN = /^[a-f0-9]{10}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INTERNAL_TERM_PATTERN = /(?:chatgpt|failed|pipeline|export[-_ ]?(?:\d|timestamp)|timestamp)/i;
const LOCAL_OR_PRIVATE_PATTERN = /(?:localhost|127\.0\.0\.1|[A-Za-z]:\\|file:\/\/|r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com|coloring-pages\/coloring-pages)/i;

export async function buildRuntimePrintables({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const input = await readInputs(repoRoot);
  const previous = await readPreviousManifest(repoRoot);
  const outputs = buildOutputs(input, previous);
  validateOutputs(input, outputs);

  if (write) {
    await writeJson(repoRoot, PRINTABLE_OUTPUTS.routeManifest, outputs.routeManifest);
    await writeJson(repoRoot, PRINTABLE_OUTPUTS.printables, outputs.printables);
    await writeJson(repoRoot, PRINTABLE_OUTPUTS.routeIndex, outputs.routeIndex);
    await writeText(repoRoot, PRINTABLE_OUTPUTS.titleReviewReport, renderTitleReview(outputs.routeManifest));
    await writeText(repoRoot, PRINTABLE_OUTPUTS.relatedReport, renderRelatedReport(outputs.routeManifest));
  }

  return outputs;
}

function buildOutputs(input, previousManifest) {
  const generatedAt = latestGeneratedAt(input);
  const hubById = new Map(input.hubs.hubs.map((hub) => [hub.hubId, hub]));
  const membershipByAssetId = new Map(input.hubItems.items.map((entry) => [entry.assetId, entry]));
  const pathByAssetId = new Map(input.assetPaths.records.map((entry) => [entry.assetId, entry]));
  const searchByAssetId = new Map(input.searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const overrideByAssetId = new Map((input.titleOverrides.overrides || []).map((entry) => [entry.assetId, entry]));
  const previousByAssetId = new Map((previousManifest?.routes || []).map((entry) => [entry.assetId, entry]));
  const deferredIds = new Set(input.deferred.records.map((entry) => entry.assetId));
  const normalizations = [];

  const records = input.available.items.map((item) => {
    const stableId = getStableId(item.assetId);
    const membership = required(membershipByAssetId.get(item.assetId), `Missing hub membership for ${item.assetId}`);
    const assetPath = required(pathByAssetId.get(item.assetId), `Missing runtime asset paths for ${item.assetId}`);
    const search = required(searchByAssetId.get(item.assetId), `Missing runtime search entry for ${item.assetId}`);
    const override = overrideByAssetId.get(item.assetId);
    const reviewedTitle = override?.cleanTitle || item.title;
    const publicTitle = normalizePublicTitle(reviewedTitle, item.assetId, normalizations);
    const altText = normalizeAltText(override?.cleanAltText || item.altText, publicTitle);
    const previous = previousByAssetId.get(item.assetId);

    let canonicalSlug;
    let primaryHubId;
    let primaryCategorySlug;
    let slugAndId;
    let canonicalPath;

    if (previous) {
      ({ canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath } = previous);
    } else {
      const primaryHub = membership.hubIds
        .map((hubId) => hubById.get(hubId))
        .find((hub) => hub && hub.route !== "/coloring-pages" && hub.indexable === true && hub.sitemap === true);
      if (!primaryHub) throw new Error(`No eligible routed non-root public hub for ${item.assetId}`);

      canonicalSlug = getCanonicalSlug(assetPath.cleanWebpObjectKey, stableId, item.assetId);
      primaryHubId = primaryHub.hubId;
      primaryCategorySlug = primaryHub.slug;
      slugAndId = `${canonicalSlug}-${stableId}`;
      canonicalPath = `/printables/${primaryCategorySlug}/${slugAndId}`;
    }

    const dimensions = item.dimensions?.source || item.dimensions?.svg || null;
    return {
      assetId: item.assetId,
      stableId,
      publicTitle,
      canonicalSlug,
      primaryHubId,
      primaryCategorySlug,
      slugAndId,
      canonicalPath,
      altText,
      webpPath: assetPath.webpPreviewSubpath,
      svgPath: assetPath.internalSvgSubpath,
      width: numberOrNull(dimensions?.width),
      height: numberOrNull(dimensions?.height),
      hubIds: [...membership.hubIds],
      publicAvailabilityStatus: "available",
    };
  });

  records.sort((left, right) => left.assetId.localeCompare(right.assetId));
  const recordsWithRelated = addRelatedData(records, input.hubs.hubs);
  const titleReview = buildTitleReview(recordsWithRelated, normalizations);
  const routes = recordsWithRelated.map(({ assetId, stableId, canonicalSlug, primaryHubId, primaryCategorySlug, slugAndId, canonicalPath }) => ({
    assetId,
    stableId,
    canonicalSlug,
    primaryHubId,
    primaryCategorySlug,
    slugAndId,
    canonicalPath,
  }));
  const index = Object.fromEntries(recordsWithRelated.map((record, recordIndex) => [record.stableId, recordIndex]));
  const recordHash = hashJson(recordsWithRelated);

  return {
    routeManifest: {
      generatedAt,
      runId: "runtime-printable-contract-v1",
      sources: Object.values(PRINTABLE_INPUTS),
      summary: {
        routeCount: routes.length,
        availableInputCount: input.available.items.length,
        deferredExcludedCount: input.deferred.records.length,
        stableIdRule: "terminal-10-character-lowercase-hex-from-assetId",
        frozenRouteCount: routes.length,
        newRouteCount: 0,
        fallbackCount: 0,
        exceptionalNormalizationCount: normalizations.length,
        titleReviewItemCount: titleReview.reviewItemCount,
        recordSha256: recordHash,
        relatedPrintableRule: "candidate-union-from-shared-routed-hubs-and-primary-hub-existing-relations; score=1000000-primary-hub-share+100000-per-additional-shared-hub+10000-per-ranked-related-hub; unique-title-first; assetId-ascending-final-tie-break; maximum-12",
        relatedHubRule: "existing-membership-or-routed-hub-relationship-only; score=1000000-direct-membership+100000-relatedHubIds+50000-internalLinkingTargets+25000-parent-or-child+100-shared-primary-members; hubId-ascending-final-tie-break; maximum-6",
      },
      titleReview,
      routes,
    },
    printables: {
      generatedAt,
      runId: "runtime-printable-contract-v1",
      summary: {
        recordCount: recordsWithRelated.length,
        deferredRecordCount: 0,
        publicAvailabilityStatus: "available",
        recordSha256: recordHash,
      },
      records: recordsWithRelated,
    },
    routeIndex: {
      generatedAt,
      runId: "runtime-printable-contract-v1",
      summary: {
        entryCount: records.length,
        value: "zero-based-index-into-runtime-printables.records",
        recordSha256: recordHash,
      },
      index,
    },
  };
}

function addRelatedData(records, hubs) {
  const ROOT_HUB_ID = "hub_coloring_pages";
  const recordByAssetId = new Map(records.map((record) => [record.assetId, record]));
  const eligibleHubById = new Map(
    hubs
      .filter((hub) => hub.hubId !== ROOT_HUB_ID && hub.route && hub.indexable === true && hub.sitemap === true)
      .map((hub) => [hub.hubId, hub]),
  );
  const availableAssetIdsByHub = new Map();

  for (const [hubId, hub] of eligibleHubById) {
    availableAssetIdsByHub.set(
      hubId,
      [...new Set((hub.assetIds || []).filter((assetId) => recordByAssetId.has(assetId)))].sort(),
    );
  }

  return records.map((record) => {
    const primaryHub = required(eligibleHubById.get(record.primaryHubId), `Missing eligible primary hub for ${record.assetId}`);
    const relatedHubIds = selectRelatedHubIds(record, primaryHub, eligibleHubById, availableAssetIdsByHub);
    const relatedAssetIds = selectRelatedAssetIds(
      record,
      relatedHubIds,
      recordByAssetId,
      eligibleHubById,
      availableAssetIdsByHub,
    );
    return { ...record, relatedAssetIds, relatedHubIds };
  });
}

function selectRelatedHubIds(record, primaryHub, eligibleHubById, availableAssetIdsByHub) {
  const directMembership = new Set(record.hubIds.filter((hubId) => eligibleHubById.has(hubId)));
  const explicitRelated = new Set((primaryHub.relatedHubIds || []).filter((hubId) => eligibleHubById.has(hubId)));
  const internalTargets = new Set((primaryHub.internalLinkingTargets || []).filter((hubId) => eligibleHubById.has(hubId)));
  const family = new Set(
    [primaryHub.parentHubId, ...(primaryHub.childHubIds || [])].filter((hubId) => hubId && eligibleHubById.has(hubId)),
  );
  const candidates = new Set([...directMembership, ...explicitRelated, ...internalTargets, ...family]);
  candidates.delete(record.primaryHubId);

  const primaryAssets = new Set(availableAssetIdsByHub.get(record.primaryHubId) || []);
  return [...candidates]
    .map((hubId) => {
      const sharedPrimaryMembers = (availableAssetIdsByHub.get(hubId) || []).reduce(
        (count, assetId) => count + Number(primaryAssets.has(assetId)),
        0,
      );
      const score =
        Number(directMembership.has(hubId)) * 1_000_000 +
        Number(explicitRelated.has(hubId)) * 100_000 +
        Number(internalTargets.has(hubId)) * 50_000 +
        Number(family.has(hubId)) * 25_000 +
        sharedPrimaryMembers * 100;
      return { hubId, score };
    })
    .sort((left, right) => right.score - left.score || left.hubId.localeCompare(right.hubId))
    .slice(0, 6)
    .map((entry) => entry.hubId);
}

function selectRelatedAssetIds(record, relatedHubIds, recordByAssetId, eligibleHubById, availableAssetIdsByHub) {
  const sourceHubIds = [...new Set([
    ...record.hubIds.filter((hubId) => eligibleHubById.has(hubId)),
    ...relatedHubIds,
  ])].sort();
  const candidateIds = new Set();
  for (const hubId of sourceHubIds) {
    for (const assetId of availableAssetIdsByHub.get(hubId) || []) candidateIds.add(assetId);
  }
  candidateIds.delete(record.assetId);

  const meaningfulHubIds = new Set(record.hubIds.filter((hubId) => eligibleHubById.has(hubId)));
  const relatedRankByHubId = new Map(relatedHubIds.map((hubId, index) => [hubId, relatedHubIds.length - index]));
  const scored = [...candidateIds]
    .map((assetId) => {
      const candidate = required(recordByAssetId.get(assetId), `Missing related candidate ${assetId}`);
      const candidateHubs = new Set(candidate.hubIds.filter((hubId) => eligibleHubById.has(hubId)));
      const additionalSharedHubCount = [...meaningfulHubIds].filter(
        (hubId) => hubId !== record.primaryHubId && candidateHubs.has(hubId),
      ).length;
      const relatedHubScore = [...candidateHubs].reduce(
        (score, hubId) => score + (relatedRankByHubId.get(hubId) || 0) * 10_000,
        0,
      );
      const score =
        Number(candidateHubs.has(record.primaryHubId)) * 1_000_000 +
        additionalSharedHubCount * 100_000 +
        relatedHubScore;
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.candidate.assetId.localeCompare(right.candidate.assetId));

  const selected = [];
  const selectedIds = new Set();
  const selectedTitles = new Set();
  for (const entry of scored) {
    const titleKey = entry.candidate.publicTitle.trim().toLowerCase();
    if (selectedTitles.has(titleKey)) continue;
    selected.push(entry.candidate.assetId);
    selectedIds.add(entry.candidate.assetId);
    selectedTitles.add(titleKey);
    if (selected.length === 12) return selected;
  }
  for (const entry of scored) {
    if (selectedIds.has(entry.candidate.assetId)) continue;
    selected.push(entry.candidate.assetId);
    if (selected.length === 12) break;
  }
  return selected;
}

function validateOutputs(input, outputs) {
  const { records } = outputs.printables;
  const deferredIds = new Set(input.deferred.records.map((entry) => entry.assetId));
  const availableIds = new Set(input.available.items.map((entry) => entry.assetId));
  const routedHubById = new Map(input.hubs.hubs.map((hub) => [hub.hubId, hub]));
  const assetPathById = new Map(input.assetPaths.records.map((entry) => [entry.assetId, entry]));

  if (records.length !== input.available.items.length) throw new Error("Printable count does not equal runtime-available count");
  assertUnique(records.map((record) => record.assetId), "assetId");
  assertUnique(records.map((record) => record.stableId), "stableId");
  assertUnique(records.map((record) => record.canonicalPath), "canonicalPath");
  assertUnique(records.map((record) => `${record.primaryCategorySlug}/${record.slugAndId}`), "category slugAndId");

  for (const record of records) {
    if (!availableIds.has(record.assetId)) throw new Error(`Unknown printable assetId: ${record.assetId}`);
    if (deferredIds.has(record.assetId)) throw new Error(`Deferred record leaked: ${record.assetId}`);
    if (!STABLE_ID_PATTERN.test(record.stableId)) throw new Error(`Invalid stableId: ${record.assetId}`);
    if (!record.assetId.endsWith(record.stableId)) throw new Error(`stableId does not match assetId: ${record.assetId}`);
    if (!SLUG_PATTERN.test(record.canonicalSlug) || record.canonicalSlug.endsWith(record.stableId)) throw new Error(`Invalid canonical slug: ${record.assetId}`);
    if (INTERNAL_TERM_PATTERN.test(record.canonicalSlug)) throw new Error(`Internal term in canonical slug: ${record.assetId}`);
    if (record.slugAndId !== `${record.canonicalSlug}-${record.stableId}`) throw new Error(`Invalid slugAndId: ${record.assetId}`);
    if (record.canonicalPath !== `/printables/${record.primaryCategorySlug}/${record.slugAndId}`) throw new Error(`Invalid canonicalPath: ${record.assetId}`);
    const hub = routedHubById.get(record.primaryHubId);
    if (!hub || hub.slug !== record.primaryCategorySlug || hub.route === "/coloring-pages" || !hub.indexable || !hub.sitemap) {
      throw new Error(`Invalid primary category: ${record.assetId}`);
    }
    const sourcePaths = assetPathById.get(record.assetId);
    if (record.webpPath !== sourcePaths?.webpPreviewSubpath || !/^webp\/.+\.webp$/.test(record.webpPath)) throw new Error(`Invalid WebP path: ${record.assetId}`);
    if (record.svgPath !== sourcePaths?.internalSvgSubpath || !/^svg\/.+\.svg$/.test(record.svgPath)) throw new Error(`Invalid SVG path: ${record.assetId}`);
    const serialized = JSON.stringify(record);
    if (LOCAL_OR_PRIVATE_PATTERN.test(serialized)) throw new Error(`Unsafe path leakage: ${record.assetId}`);
    if (/"(?:pngPath|thumbnailPath|sourcePath|localPath|svgDownload)"/.test(serialized)) throw new Error(`Browser-irrelevant field leaked: ${record.assetId}`);
    if (record.publicAvailabilityStatus !== "available") throw new Error(`Invalid availability: ${record.assetId}`);
    if (!Array.isArray(record.relatedAssetIds) || record.relatedAssetIds.length > 12) throw new Error(`Invalid related printable list: ${record.assetId}`);
    if (!Array.isArray(record.relatedHubIds) || record.relatedHubIds.length > 6) throw new Error(`Invalid related hub list: ${record.assetId}`);
    assertUnique(record.relatedAssetIds, `related printable for ${record.assetId}`);
    assertUnique(record.relatedHubIds, `related hub for ${record.assetId}`);
    if (record.relatedAssetIds.includes(record.assetId)) throw new Error(`Self-related printable: ${record.assetId}`);
    for (const relatedAssetId of record.relatedAssetIds) {
      if (!availableIds.has(relatedAssetId) || deferredIds.has(relatedAssetId)) throw new Error(`Unavailable related printable: ${record.assetId}`);
    }
    for (const relatedHubId of record.relatedHubIds) {
      const relatedHub = routedHubById.get(relatedHubId);
      if (!relatedHub || relatedHubId === record.primaryHubId || relatedHub.route === "/coloring-pages" || !relatedHub.indexable || !relatedHub.sitemap) {
        throw new Error(`Invalid related hub: ${record.assetId}`);
      }
    }
  }

  if (Object.keys(outputs.routeIndex.index).length !== records.length) throw new Error("Route index count mismatch");
  records.forEach((record, index) => {
    if (outputs.routeIndex.index[record.stableId] !== index) throw new Error(`Route index mismatch: ${record.stableId}`);
  });
}

function renderRelatedReport(routeManifest) {
  return `# Runtime Printable Related Data\n\nGenerated: ${routeManifest.generatedAt}\n\n- Printable records: ${routeManifest.summary.routeCount.toLocaleString("en-US")}\n- Related printables per record: up to 12\n- Related hubs per record: up to 6\n\n## Related printable scoring\n\nCandidates are the deterministic union of available records in the printable's routed public hub memberships and its generated related hubs. The current item is removed. Candidates receive 1,000,000 points for sharing the primary hub, 100,000 points for every additional shared public hub, and 10,000 points multiplied by the inverse rank of each generated related hub they belong to. Higher scores sort first; asset ID ascending is the final tie-break. Selection takes unique normalized public titles first, then fills remaining slots without duplicate asset IDs, up to 12.\n\n## Related hub scoring\n\nCandidates must already exist as a direct printable membership, a primary-hub relatedHubId, an internal-linking target, or a parent/child relationship. Root, non-routed, non-indexable, and non-sitemap hubs are excluded. Direct membership receives 1,000,000 points; relatedHubIds receive 100,000; internal targets receive 50,000; family relationships receive 25,000; and every available member shared with the primary hub adds 100. Higher scores sort first; hub ID ascending is the final tie-break. The list is capped at six.\n\nCanonical route fields remain frozen and do not participate in either score. Runtime randomness, build-time randomness, and external keyword data are not used.\n`;
}

function buildTitleReview(records, normalizations) {
  const redundantSuffix = records.filter((record) => /\bColoring Page$/i.test(record.publicTitle)).map(toTitleReviewItem);
  const extensionLeak = normalizations.map((entry) => ({ assetId: entry.assetId, title: entry.before, normalizedTitle: entry.after }));
  const internalWording = records.filter((record) => INTERNAL_TERM_PATTERN.test(record.publicTitle)).map(toTitleReviewItem);
  const groups = new Map();
  for (const record of records) {
    const key = record.publicTitle.toLowerCase();
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }
  const duplicateTitleGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ title: group[0].publicTitle, assetIds: group.map((record) => record.assetId) }))
    .sort((left, right) => left.title.localeCompare(right.title));
  return {
    summary: {
      redundantColoringPageSuffixCount: redundantSuffix.length,
      duplicateTitleGroupCount: duplicateTitleGroups.length,
      fileExtensionLeakCount: extensionLeak.length,
      internalPipelineWordingCount: internalWording.length,
      broadTitleRewriteApplied: false,
    },
    reviewItemCount: redundantSuffix.length + duplicateTitleGroups.reduce((count, group) => count + group.assetIds.length, 0) + extensionLeak.length + internalWording.length,
    exceptionalNormalizations: normalizations,
    redundantColoringPageSuffix: redundantSuffix,
    duplicateTitleGroups,
    fileExtensionLeak: extensionLeak,
    internalPipelineWording: internalWording,
  };
}

function renderTitleReview(routeManifest) {
  const review = routeManifest.titleReview;
  return `# Runtime Printable Title Review

- Printable records: ${routeManifest.summary.routeCount.toLocaleString("en-US")}
- Broad title rewrite applied: no
- Deterministic technical-leak normalizations: ${routeManifest.summary.exceptionalNormalizationCount}
- Titles ending in \`Coloring Page\`: ${review.summary.redundantColoringPageSuffixCount}
- Duplicate title groups: ${review.summary.duplicateTitleGroupCount}
- File-extension leaks found: ${review.summary.fileExtensionLeakCount}
- Internal pipeline wording found: ${review.summary.internalPipelineWordingCount}
- Total review-item references: ${routeManifest.summary.titleReviewItemCount}

## Exceptional Normalizations

${review.exceptionalNormalizations.map((entry) => `- ${entry.assetId}: \`${entry.before}\` -> \`${entry.after}\` (${entry.reason})`).join("\n") || "- none"}

The detailed duplicate and suffix review records remain machine-readable in \`${PRINTABLE_OUTPUTS.routeManifest}\`.
`;
}

function getStableId(assetId) {
  const stableId = String(assetId).match(/([a-f0-9]{10})$/)?.[1];
  if (!stableId || !STABLE_ID_PATTERN.test(stableId)) throw new Error(`Missing valid terminal stable ID: ${assetId}`);
  return stableId;
}

function getCanonicalSlug(cleanWebpObjectKey, stableId, assetId) {
  if (!cleanWebpObjectKey?.startsWith("coloring-pages/webp/") || !cleanWebpObjectKey.endsWith(".webp")) {
    throw new Error(`Missing reviewed clean WebP object key: ${assetId}`);
  }
  const stem = cleanWebpObjectKey.split("/").at(-1).replace(/\.webp$/, "");
  const suffix = `-${stableId}`;
  if (!stem.endsWith(suffix)) throw new Error(`Clean WebP key does not end in stable ID: ${assetId}`);
  const slug = stem.slice(0, -suffix.length);
  if (!slug || !SLUG_PATTERN.test(slug) || INTERNAL_TERM_PATTERN.test(slug)) throw new Error(`Invalid reviewed canonical slug: ${assetId}`);
  return slug;
}

function normalizePublicTitle(title, assetId, normalizations) {
  const original = String(title || "").trim();
  const normalized = original.replace(/\.(?:png|jpe?g|webp|svg)$/i, "").trim();
  if (!normalized) throw new Error(`Empty public title: ${assetId}`);
  if (normalized !== original) normalizations.push({ assetId, before: original, after: normalized, reason: "visible-file-extension-removed" });
  return normalized;
}

function normalizeAltText(altText, publicTitle) {
  const normalized = String(altText || "").replace(/\.(?:png|jpe?g|webp|svg)(?=\s|$)/gi, "").trim();
  return normalized || `${publicTitle} coloring page`;
}

function toTitleReviewItem(record) {
  return { assetId: record.assetId, title: record.publicTitle };
}

function numberOrNull(value) {
  return Number.isFinite(value) && value > 0 ? Number(value) : null;
}

function required(value, message) {
  if (value == null) throw new Error(message);
  return value;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function latestGeneratedAt(input) {
  return Object.values(input)
    .map((value) => value?.generatedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || "1970-01-01T00:00:00.000Z";
}

async function readInputs(repoRoot) {
  return Object.fromEntries(await Promise.all(Object.entries(PRINTABLE_INPUTS).map(async ([key, relativePath]) => [key, await readJson(repoRoot, relativePath)])));
}

async function readPreviousManifest(repoRoot) {
  const target = path.join(repoRoot, PRINTABLE_OUTPUTS.routeManifest);
  return existsSync(target) ? JSON.parse(await readFile(target, "utf8")) : null;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function writeJson(repoRoot, relativePath, value) {
  await writeText(repoRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(repoRoot, relativePath, value) {
  const target = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

if (path.resolve(process.argv[1] || "") === SCRIPT_PATH) {
  buildRuntimePrintables()
    .then(({ routeManifest }) => console.log(JSON.stringify(routeManifest.summary, null, 2)))
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
