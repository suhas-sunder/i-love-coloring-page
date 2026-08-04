#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPrintableTitleAssignments } from "../lib/printable-title-quality.mjs";
import {
  buildHubTokenProfile,
  countTokenOverlap,
  getDiscoveryTokenProfile,
  scoreHubInventoryTokenMatch,
} from "../lib/gallery-discovery-quality.mjs";
import { selectClusteredHubIds } from "../lib/taxonomy-promotion-policy.mjs";

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
  taxonomyPolicy: "src/config/taxonomy-promotion-policy.json",
  attributePolicy: "src/config/printable-attribute-policy.json",
  productionAssets: "pipeline/manifests/round-3c-production-assets.json",
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
const TITLE_MANIFEST_PATH = "pipeline/manifests/printable-title-manifest.json";
const INTERNAL_TERM_PATTERN = /(?:chatgpt|failed|pipeline|export[-_ ]?(?:\d|timestamp)|timestamp)/i;
const LOCAL_OR_PRIVATE_PATTERN = /(?:localhost|127\.0\.0\.1|[A-Za-z]:\\|file:\/\/|r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com|coloring-pages\/coloring-pages)/i;

export async function buildRuntimePrintables({ repoRoot = DEFAULT_ROOT, write = true } = {}) {
  const input = await readInputs(repoRoot);
  const previous = await readPreviousManifest(repoRoot);
  const previousTitleManifest = await readPreviousTitleManifest(repoRoot);
  const outputs = buildOutputs(input, previous, previousTitleManifest);
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

function buildOutputs(input, previousManifest, previousTitleManifest) {
  const generatedAt = latestGeneratedAt(input);
  const hubById = new Map(input.hubs.hubs.map((hub) => [hub.hubId, hub]));
  const membershipByAssetId = new Map(input.hubItems.items.map((entry) => [entry.assetId, entry]));
  const pathByAssetId = new Map(input.assetPaths.records.map((entry) => [entry.assetId, entry]));
  const searchByAssetId = new Map(input.searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const overrideByAssetId = new Map((input.titleOverrides.overrides || []).map((entry) => [entry.assetId, entry]));
  const previousByAssetId = new Map((previousManifest?.routes || []).map((entry) => [entry.assetId, entry]));
  const productionAssetById = new Map(input.productionAssets.assets.map((entry) => [entry.assetId, entry]));
  const deferredIds = new Set(input.deferred.records.map((entry) => entry.assetId));
  const normalizations = [];

  const records = input.available.items.map((item) => {
    const stableId = getStableId(item.assetId);
    const membership = required(membershipByAssetId.get(item.assetId), `Missing hub membership for ${item.assetId}`);
    const assetPath = required(pathByAssetId.get(item.assetId), `Missing runtime asset paths for ${item.assetId}`);
    const search = required(searchByAssetId.get(item.assetId), `Missing runtime search entry for ${item.assetId}`);
    const override = overrideByAssetId.get(item.assetId);
    const productionAsset = required(productionAssetById.get(item.assetId), `Missing production asset dimensions for ${item.assetId}`);
    const reviewedTitle = override?.cleanTitle || item.title;
    const publicTitle = normalizePublicTitle(reviewedTitle, item.assetId, normalizations);
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
      webpPath: assetPath.webpPreviewSubpath,
      svgPath: assetPath.internalSvgSubpath,
      width: numberOrNull(dimensions?.width),
      height: numberOrNull(dimensions?.height),
      previewWidth: numberOrNull(productionAsset.outputDimensions?.pngPreview?.width),
      previewHeight: numberOrNull(productionAsset.outputDimensions?.pngPreview?.height),
      artworkWidth: numberOrNull(productionAsset.outputDimensions?.svg?.width),
      artworkHeight: numberOrNull(productionAsset.outputDimensions?.svg?.height),
      hubIds: [...membership.hubIds],
      publicAvailabilityStatus: "available",
    };
  });

  records.sort((left, right) => left.assetId.localeCompare(right.assetId));
  const titleAssignments = buildPrintableTitleAssignments(records, { previousManifest: previousTitleManifest });
  const recordsWithTitles = records.map((record) => {
    const title = required(titleAssignments.get(record.assetId), `Missing title assignment for ${record.assetId}`);
    return {
      ...record,
      displayTitle: title.displayTitle,
      metadataTitle: title.metadataTitle,
      designNumber: title.designNumber,
      altText: title.altText,
    };
  });
  const recordsWithAttributes = recordsWithTitles.map((record) => ({
    ...record,
    attributes: buildPrintableAttributes(record, input.hubs.hubs, input.attributePolicy),
  }));
  const recordsWithRelated = addRelatedData(recordsWithAttributes, input.hubs.hubs, input.taxonomyPolicy);
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
        relatedPrintableRule: "verified-specific-subjects-rank-first; direct-shared-membership-and-strong-title-token-overlap-next; then style-season-pattern-parent signals; canonical-destination-deduplication; deterministic-pair-hash-final-tie-break; maximum-12",
        relatedHubRule: "direct-membership-first; strong-hub-title-or-member-title-evidence-may-add-routed-candidates; broad inventory size is not a positive signal; thin-hubs-require-direct-membership; promotion-cluster-cap-1; stable-score-and-hubId-tie-break; maximum-6",
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

function addRelatedData(records, hubs, taxonomyPolicy) {
  const ROOT_HUB_ID = "hub_coloring_pages";
  const recordByAssetId = new Map(records.map((record) => [record.assetId, record]));
  const publicHubById = new Map(
    hubs
      .filter((hub) => hub.hubId !== ROOT_HUB_ID && hub.route)
      .map((hub) => [hub.hubId, hub]),
  );
  const eligibleHubById = new Map(
    hubs
      .filter((hub) => hub.hubId !== ROOT_HUB_ID && hub.route && hub.indexable === true && hub.sitemap === true)
      .map((hub) => [hub.hubId, hub]),
  );
  const availableAssetIdsByHub = new Map();
  const thinExposureByHubId = new Map();
  const tokenProfileByAssetId = new Map(records.map((record) => [record.assetId, getDiscoveryTokenProfile(record.publicTitle)]));

  for (const [hubId, hub] of publicHubById) {
    availableAssetIdsByHub.set(
      hubId,
      [...new Set((hub.assetIds || []).filter((assetId) => recordByAssetId.has(assetId)))].sort(),
    );
  }

  const hubTokenProfileById = new Map(
    [...eligibleHubById].map(([hubId, hub]) => [hubId, {
      inventory: buildHubTokenProfile(availableAssetIdsByHub.get(hubId) || [], recordByAssetId),
      title: getDiscoveryTokenProfile(hubLabel(hub)),
    }]),
  );
  const hubIdsByStrongMemberToken = new Map();
  const hubIdsByStrongTitleToken = new Map();
  for (const [hubId, profile] of hubTokenProfileById) {
    for (const token of profile.inventory.strongMemberCounts.keys()) addMapSetValue(hubIdsByStrongMemberToken, token, hubId);
    for (const token of profile.title.strongTokens) addMapSetValue(hubIdsByStrongTitleToken, token, hubId);
  }
  const discoveryContext = {
    hubIdsByStrongMemberToken,
    hubIdsByStrongTitleToken,
    hubTokenProfileById,
    tokenProfileByAssetId,
  };

  return records.map((record) => {
    const primaryHub = required(publicHubById.get(record.primaryHubId), `Missing public primary hub for ${record.assetId}`);
    const relatedHubIds = selectRelatedHubIds(
      record,
      primaryHub,
      eligibleHubById,
      availableAssetIdsByHub,
      taxonomyPolicy,
      thinExposureByHubId,
      discoveryContext,
    );
    for (const hubId of relatedHubIds) {
      const hub = eligibleHubById.get(hubId);
      if (hub && hub.assetCount <= taxonomyPolicy.thinHubMaximumAssets) {
        thinExposureByHubId.set(hubId, (thinExposureByHubId.get(hubId) || 0) + 1);
      }
    }
    const relatedAssetIds = selectRelatedAssetIds(
      record,
      relatedHubIds,
      recordByAssetId,
      eligibleHubById,
      availableAssetIdsByHub,
      discoveryContext,
    );
    return { ...record, relatedAssetIds, relatedHubIds };
  });
}

function selectRelatedHubIds(record, primaryHub, eligibleHubById, availableAssetIdsByHub, taxonomyPolicy, thinExposureByHubId, discoveryContext) {
  const directMembership = new Set(record.hubIds.filter((hubId) => eligibleHubById.has(hubId)));
  const explicitRelated = new Set((primaryHub.relatedHubIds || []).filter((hubId) => eligibleHubById.has(hubId)));
  const internalTargets = new Set((primaryHub.internalLinkingTargets || []).filter((hubId) => eligibleHubById.has(hubId)));
  const family = new Set(
    [primaryHub.parentHubId, ...(primaryHub.childHubIds || [])].filter((hubId) => hubId && eligibleHubById.has(hubId)),
  );
  const candidates = new Set([...directMembership, ...explicitRelated, ...internalTargets, ...family]);
  const recordTokenProfile = discoveryContext.tokenProfileByAssetId.get(record.assetId) || getDiscoveryTokenProfile(record.publicTitle);
  const discoveredHubIds = new Set(recordTokenProfile.strongTokens.flatMap((token) => [
    ...(discoveryContext.hubIdsByStrongMemberToken.get(token) || []),
    ...(discoveryContext.hubIdsByStrongTitleToken.get(token) || []),
  ]));
  for (const hubId of discoveredHubIds) {
    if (hubId === record.primaryHubId) continue;
    const hubTokenProfile = discoveryContext.hubTokenProfileById.get(hubId);
    if (!hubTokenProfile) continue;
    const titleOverlap = countTokenOverlap(recordTokenProfile, hubTokenProfile.title);
    const inventoryMatch = scoreHubInventoryTokenMatch(
      recordTokenProfile,
      hubTokenProfile.inventory,
      (availableAssetIdsByHub.get(hubId) || []).length,
    );
    const requiredInventoryTokenMatches = Math.min(2, recordTokenProfile.strongTokens.length);
    const hasStrongInventoryEvidence = requiredInventoryTokenMatches > 0
      && inventoryMatch.matchedStrongMembers >= 2
      && inventoryMatch.matchedStrongTokenCount >= requiredInventoryTokenMatches;
    if (titleOverlap.strong > 0 || hasStrongInventoryEvidence) candidates.add(hubId);
  }
  candidates.delete(record.primaryHubId);

  const primaryAssets = new Set(availableAssetIdsByHub.get(record.primaryHubId) || []);
  const scored = [...candidates]
    .map((hubId) => {
      const sharedPrimaryMembers = (availableAssetIdsByHub.get(hubId) || []).reduce(
        (count, assetId) => count + Number(primaryAssets.has(assetId)),
        0,
      );
      const hasVerifiedSemanticRelationship = directMembership.has(hubId) || explicitRelated.has(hubId) || internalTargets.has(hubId);
      const hasSupportedFamilyRelationship = family.has(hubId) && sharedPrimaryMembers > 0;
      const hubTokenProfile = discoveryContext.hubTokenProfileById.get(hubId);
      const titleOverlap = hubTokenProfile ? countTokenOverlap(recordTokenProfile, hubTokenProfile.title) : { strong: 0, broad: 0 };
      const inventoryMatch = hubTokenProfile
        ? scoreHubInventoryTokenMatch(recordTokenProfile, hubTokenProfile.inventory, (availableAssetIdsByHub.get(hubId) || []).length)
        : { matchedStrongMembers: 0, matchedStrongTokenCount: 0, score: 0 };
      const requiredInventoryTokenMatches = Math.min(2, recordTokenProfile.strongTokens.length);
      const hasStrongInventoryEvidence = requiredInventoryTokenMatches > 0
        && inventoryMatch.matchedStrongMembers >= 2
        && inventoryMatch.matchedStrongTokenCount >= requiredInventoryTokenMatches;
      const hasStrongSubjectEvidence = titleOverlap.strong > 0 || hasStrongInventoryEvidence;
      const score =
        Number(directMembership.has(hubId)) * 10_000_000 +
        titleOverlap.strong * 1_200_000 +
        inventoryMatch.score +
        Number(explicitRelated.has(hubId)) * 100_000 +
        Number(internalTargets.has(hubId)) * 50_000 +
        Number(hasSupportedFamilyRelationship) * 25_000 +
        titleOverlap.broad * 5_000 +
        Math.min(sharedPrimaryMembers, 100) * 100;
      return { hubId, score, hasVerifiedSemanticRelationship, hasSupportedFamilyRelationship, hasStrongSubjectEvidence };
    })
    .filter((entry) => entry.hasVerifiedSemanticRelationship || entry.hasSupportedFamilyRelationship || entry.hasStrongSubjectEvidence)
    .filter((entry) => {
      const hubAssetCount = (availableAssetIdsByHub.get(entry.hubId) || []).length;
      return hubAssetCount > taxonomyPolicy.thinHubMaximumAssets || directMembership.has(entry.hubId);
    })
    .sort((left, right) => right.score - left.score || left.hubId.localeCompare(right.hubId))
  const scoreByHubId = new Map(scored.map((entry) => [entry.hubId, entry.score]));
  const clustered = selectClusteredHubIds(scored.map((entry) => entry.hubId), {
    currentHubId: record.primaryHubId,
    policy: taxonomyPolicy,
  }).sort((left, right) => (scoreByHubId.get(right) || 0) - (scoreByHubId.get(left) || 0) || left.localeCompare(right));

  const selected = [];
  let thinHubCount = 0;
  for (const hubId of clustered) {
    const hub = eligibleHubById.get(hubId);
    const isThin = (availableAssetIdsByHub.get(hubId) || []).length <= taxonomyPolicy.thinHubMaximumAssets;
    if (isThin && thinHubCount >= taxonomyPolicy.maximumThinHubsPerRelatedList) continue;
    if (isThin) {
      const baseline = taxonomyPolicy.thinHubExposureBaseline[hub?.slug];
      if (Number.isInteger(baseline) && (thinExposureByHubId.get(hubId) || 0) >= baseline) continue;
    }
    selected.push(hubId);
    if (isThin) thinHubCount += 1;
    if (selected.length === 6) break;
  }
  return selected;
}

function selectRelatedAssetIds(record, relatedHubIds, recordByAssetId, eligibleHubById, availableAssetIdsByHub, discoveryContext) {
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
  const subjectProfile = getDiscoveryTokenProfile(
    [record.attributes.narrowSubjectCategory, record.attributes.primarySubject].filter(Boolean).join(" "),
  );
  const styles = new Set(record.attributes.styles);
  const seasons = new Set(record.attributes.seasonalClassifications);
  const recordTitleProfile = discoveryContext.tokenProfileByAssetId.get(record.assetId) || getDiscoveryTokenProfile(record.publicTitle);
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
      const candidateSubjectProfile = getDiscoveryTokenProfile(
        [candidate.attributes.narrowSubjectCategory, candidate.attributes.primarySubject].filter(Boolean).join(" "),
      );
      const sharedSubjectCount = countTokenOverlap(subjectProfile, candidateSubjectProfile).strong;
      const candidateTitleProfile = discoveryContext.tokenProfileByAssetId.get(candidate.assetId) || getDiscoveryTokenProfile(candidate.publicTitle);
      const titleOverlap = countTokenOverlap(recordTitleProfile, candidateTitleProfile);
      const sharedStyleCount = [...styles].filter((value) => candidate.attributes.styles.includes(value)).length;
      const sharedSeasonCount = [...seasons].filter((value) => candidate.attributes.seasonalClassifications.includes(value)).length;
      const sharedPattern = record.attributes.patternFocused === true && candidate.attributes.patternFocused === true;
      const requiredStrongTitleMatches = Math.min(2, recordTitleProfile.strongTokens.length);
      const hasStrongCompoundTitleMatch = requiredStrongTitleMatches > 0 && titleOverlap.strong >= requiredStrongTitleMatches;
      const strongTitleScore = titleOverlap.strong * (hasStrongCompoundTitleMatch ? 900_000 : 700_000);
      const score =
        sharedSubjectCount * 2_500_000 +
        additionalSharedHubCount * 300_000 +
        strongTitleScore +
        Number(hasStrongCompoundTitleMatch) * 250_000 +
        sharedStyleCount * 350_000 +
        sharedSeasonCount * 300_000 +
        Number(sharedPattern) * 200_000 +
        Number(candidateHubs.has(record.primaryHubId)) * 75_000 +
        relatedHubScore +
        titleOverlap.broad * 10_000 +
        Number(record.attributes.orientation === candidate.attributes.orientation) * 500;
      return { candidate, score, tieBreak: stablePairTieBreak(record.assetId, candidate.assetId) };
    })
    .sort((left, right) => right.score - left.score || left.tieBreak.localeCompare(right.tieBreak) || left.candidate.assetId.localeCompare(right.candidate.assetId));

  const selected = [];
  const selectedIds = new Set();
  const selectedTitles = new Set();
  const selectedCanonicalPaths = new Set();
  for (const entry of scored) {
    const titleKey = entry.candidate.publicTitle.trim().toLowerCase();
    if (selectedTitles.has(titleKey) || selectedCanonicalPaths.has(entry.candidate.canonicalPath)) continue;
    selected.push(entry.candidate.assetId);
    selectedIds.add(entry.candidate.assetId);
    selectedTitles.add(titleKey);
    selectedCanonicalPaths.add(entry.candidate.canonicalPath);
    if (selected.length === 12) return selected;
  }
  for (const entry of scored) {
    if (selectedIds.has(entry.candidate.assetId) || selectedCanonicalPaths.has(entry.candidate.canonicalPath)) continue;
    selected.push(entry.candidate.assetId);
    selectedCanonicalPaths.add(entry.candidate.canonicalPath);
    if (selected.length === 12) break;
  }
  return selected;
}

function buildPrintableAttributes(record, hubs, policy) {
  const hubById = new Map(hubs.map((hub) => [hub.hubId, hub]));
  const memberships = record.hubIds.map((hubId) => hubById.get(hubId)).filter(Boolean);
  const seasonalIds = new Set(policy.seasonalHubIds);
  const audienceIds = new Set(policy.unapprovedAudienceHubIds);
  const detailIds = new Set(policy.unapprovedDetailHubIds);
  const pureStyleIds = new Set(policy.pureStyleHubIds);
  const excludedSubjects = new Set([...policy.rootHubIds, ...seasonalIds, ...audienceIds, ...detailIds, ...pureStyleIds]);
  const subjects = memberships
    .filter((hub) => !excludedSubjects.has(hub.hubId))
    .sort((left, right) => left.assetCount - right.assetCount || left.hubId.localeCompare(right.hubId));
  const leafSubjects = subjects.filter((hub) => !hub.childHubIds?.some((childId) => record.hubIds.includes(childId)));
  const narrowSubject = leafSubjects[0] || null;
  const styles = [...new Set(memberships.flatMap((hub) => {
    const rule = policy.styleHubRules.find((entry) => hub.hubId.startsWith(entry.prefix));
    return rule ? [rule.value] : [];
  }))].sort();
  const seasonal = memberships.filter((hub) => seasonalIds.has(hub.hubId)).map(hubLabel).sort();
  const audienceCandidates = memberships.filter((hub) => audienceIds.has(hub.hubId)).map(hubLabel).sort();
  const detailCandidates = memberships.filter((hub) => detailIds.has(hub.hubId)).map(hubLabel).sort();
  const primaryHub = required(hubById.get(record.primaryHubId), `Missing primary hub for attributes: ${record.assetId}`);
  const additionalCollections = memberships
    .filter((hub) => hub.hubId !== policy.rootHubIds[0] && hub.hubId !== record.primaryHubId)
    .map((hub) => ({ hubId: hub.hubId, title: hub.title, route: hub.route }));
  const orientation = record.width && record.height
    ? record.width > record.height ? "landscape" : record.width < record.height ? "portrait" : "square"
    : null;
  const patternFocused = memberships.some((hub) => policy.patternHubIds.includes(hub.hubId)) ? true : null;
  const primarySubject = subjects[0] ? hubLabel(subjects[0]) : null;
  const narrowSubjectCategory = narrowSubject ? hubLabel(narrowSubject) : null;
  const hasMeaningfulSummaryEvidence = Boolean(
    narrowSubjectCategory || patternFocused || styles.length || seasonal.length,
  );
  const summary = hasMeaningfulSummaryEvidence
    ? buildAttributeSummary({ orientation, subject: narrowSubjectCategory || primarySubject, styles, patternFocused, seasonal })
    : null;
  const metadataReviewRequired = audienceCandidates.length > 0 || detailCandidates.length > 0;
  return {
    primarySubject,
    secondarySubjects: subjects.slice(1).map(hubLabel),
    narrowSubjectCategory,
    styles,
    patternFocused,
    seasonalClassifications: seasonal,
    orientation,
    sourceDimensions: record.width && record.height ? { width: record.width, height: record.height } : null,
    artworkDimensions: record.artworkWidth && record.artworkHeight ? { width: record.artworkWidth, height: record.artworkHeight } : null,
    printLayout: { ...policy.printLayout },
    detailClassification: null,
    audienceClassification: null,
    unapprovedDetailCandidates: detailCandidates,
    unapprovedAudienceCandidates: audienceCandidates,
    primaryCollection: { hubId: primaryHub.hubId, title: primaryHub.title, route: primaryHub.route },
    additionalCollections,
    serverAvailableFormats: [...policy.serverAdvertisedFormats],
    browserConditionalFormats: [...policy.browserConditionalFormats],
    principalImageRole: "public-webp-preview",
    editorialReviewStatus: metadataReviewRequired ? "metadata-review-required" : "verified-attributes-only",
    summary,
    provenance: {
      ...(primarySubject ? { primarySubject: ["explicit_collection_assignment", "approved_taxonomy_rule"] } : {}),
      ...(subjects.length > 1 ? { secondarySubjects: ["explicit_collection_assignment", "approved_taxonomy_rule"] } : {}),
      ...(narrowSubjectCategory ? { narrowSubjectCategory: ["explicit_collection_assignment", "approved_taxonomy_rule"] } : {}),
      ...(styles.length ? { styles: ["explicit_collection_assignment", "approved_taxonomy_rule"] } : {}),
      ...(patternFocused ? { patternFocused: ["explicit_collection_assignment", "approved_taxonomy_rule"] } : {}),
      ...(seasonal.length ? { seasonalClassifications: ["explicit_collection_assignment", "approved_taxonomy_rule"] } : {}),
      ...(orientation ? { orientation: "computed_file_dimensions" } : {}),
      ...(record.width && record.height ? { sourceDimensions: "computed_file_dimensions" } : {}),
      ...(record.artworkWidth && record.artworkHeight ? { artworkDimensions: "verified_asset_capability" } : {}),
      printLayout: "verified_asset_capability",
      primaryCollection: "explicit_collection_assignment",
      ...(additionalCollections.length ? { additionalCollections: "explicit_collection_assignment" } : {}),
      serverAvailableFormats: "verified_asset_capability",
      browserConditionalFormats: "verified_asset_capability",
      principalImageRole: "verified_asset_capability",
      ...(summary ? { summary: ["explicit_collection_assignment", "approved_taxonomy_rule", "computed_file_dimensions"] } : {}),
    },
  };
}

function buildAttributeSummary({ orientation, subject, styles, patternFocused, seasonal }) {
  const orientationPrefix = orientation ? `${orientation} ` : "";
  if (patternFocused) return `A ${orientationPrefix}pattern-focused printable${subject ? ` in the ${subject} collection` : ""}.`;
  if (styles.length && subject) return `A ${orientationPrefix}${styles[0].toLowerCase()} printable in the ${subject} collection.`;
  if (seasonal.length && subject) return `A ${orientationPrefix}printable in the ${subject} collection with an explicit ${seasonal[0]} classification.`;
  if (subject) return `A ${orientationPrefix}printable in the ${subject} collection.`;
  if (styles.length) return `A ${orientationPrefix}${styles[0].toLowerCase()} printable.`;
  return null;
}

function hubLabel(hub) {
  return hub.title.replace(/ Coloring Pages$/i, "").trim();
}

function stablePairTieBreak(left, right) {
  const leftId = Number.parseInt(left.slice(-10), 16);
  const rightId = Number.parseInt(right.slice(-10), 16);
  return Math.abs(leftId - rightId).toString(16).padStart(10, "0");
}

function addMapSetValue(map, key, value) {
  const values = map.get(key) || new Set();
  values.add(value);
  map.set(key, values);
}

function validateOutputs(input, outputs) {
  const { records } = outputs.printables;
  const deferredIds = new Set(input.deferred.records.map((entry) => entry.assetId));
  const availableIds = new Set(input.available.items.map((entry) => entry.assetId));
  const routedHubById = new Map(input.hubs.hubs.map((hub) => [hub.hubId, hub]));
  const assetPathById = new Map(input.assetPaths.records.map((entry) => [entry.assetId, entry]));
  const productionAssetById = new Map(input.productionAssets.assets.map((entry) => [entry.assetId, entry]));

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
    if (!hub || hub.slug !== record.primaryCategorySlug || !hub.route || hub.route === "/coloring-pages") {
      throw new Error(`Invalid primary category: ${record.assetId}`);
    }
    const sourcePaths = assetPathById.get(record.assetId);
    if (record.webpPath !== sourcePaths?.webpPreviewSubpath || !/^webp\/.+\.webp$/.test(record.webpPath)) throw new Error(`Invalid WebP path: ${record.assetId}`);
    if (record.svgPath !== sourcePaths?.internalSvgSubpath || !/^svg\/.+\.svg$/.test(record.svgPath)) throw new Error(`Invalid SVG path: ${record.assetId}`);
    const productionAsset = productionAssetById.get(record.assetId);
    if (
      record.previewWidth !== numberOrNull(productionAsset?.outputDimensions?.pngPreview?.width)
      || record.previewHeight !== numberOrNull(productionAsset?.outputDimensions?.pngPreview?.height)
    ) throw new Error(`Invalid WebP preview dimensions: ${record.assetId}`);
    if (
      record.artworkWidth !== numberOrNull(productionAsset?.outputDimensions?.svg?.width)
      || record.artworkHeight !== numberOrNull(productionAsset?.outputDimensions?.svg?.height)
    ) throw new Error(`Invalid SVG artwork dimensions: ${record.assetId}`);
    const serialized = JSON.stringify(record);
    if (LOCAL_OR_PRIVATE_PATTERN.test(serialized)) throw new Error(`Unsafe path leakage: ${record.assetId}`);
    if (/"(?:pngPath|thumbnailPath|sourcePath|localPath|svgDownload)"/.test(serialized)) throw new Error(`Browser-irrelevant field leaked: ${record.assetId}`);
    if (record.publicAvailabilityStatus !== "available") throw new Error(`Invalid availability: ${record.assetId}`);
    if (!record.publicTitle || !record.displayTitle || !record.metadataTitle || !record.altText) throw new Error(`Missing title model: ${record.assetId}`);
    if (record.designNumber !== null && (!Number.isInteger(record.designNumber) || record.designNumber < 1)) throw new Error(`Invalid design number: ${record.assetId}`);
    if (!record.attributes || record.attributes.principalImageRole !== "public-webp-preview") throw new Error(`Missing printable attribute model: ${record.assetId}`);
    if (!record.attributes.provenance?.orientation || !record.attributes.provenance?.primaryCollection) throw new Error(`Missing attribute provenance: ${record.assetId}`);
    if (record.attributes.audienceClassification || record.attributes.detailClassification) throw new Error(`Unapproved audience/detail attribute leaked: ${record.assetId}`);
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
  return `# Runtime Printable Related Data\n\nGenerated: ${routeManifest.generatedAt}\n\n- Printable records: ${routeManifest.summary.routeCount.toLocaleString("en-US")}\n- Related printables per record: up to 12\n- Related hubs per record: up to 6\n\n## Related printable scoring\n\nCandidates are the deterministic union of available records in the printable's routed public hub memberships and its generated related hubs. The current item is removed. Verified specific-subject overlap ranks first, followed by direct shared collection membership and normalized strong title-token overlap. Style, season, pattern, related-hub rank, broad title tokens, shared primary collection, and orientation are progressively weaker signals. Generic terms are removed, common broad terms are downweighted, simple singular/plural forms are normalized, and stable pair distance plus asset ID provide deterministic tie-breaking. Selection excludes duplicate asset IDs and canonical destinations, takes unique normalized public titles first, and fills to 12 when valid candidates exist.\n\n## Related hub scoring\n\nDirect printable memberships rank first. Additional routed candidates require a strong normalized token match in the hub title or balanced repeated hub-member title evidence; inventory coverage rewards specific collections rather than raw collection size. Existing primary-hub relationships and supported family relationships remain weaker signals. Hubs below 12 printables still require direct membership, at most one thin hub may appear, and configured near-duplicate clusters contribute at most one result. The current primary collection is excluded, hub ID is the final deterministic tie-break, and the list remains capped at six.\n\nCanonical route fields remain frozen and do not participate in either score. Runtime randomness, build-time randomness, stale internal-linking output, broad popularity, and external keyword data are not used.\n`;
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
  // Editorial override bookkeeping and dimensional lookup manifests may be
  // regenerated after the authoritative runtime inventory. They must not
  // make otherwise identical printable output volatile.
  return [input.available, input.deferred, input.hubs, input.hubItems, input.assetPaths, input.searchIndex]
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

async function readPreviousTitleManifest(repoRoot) {
  const target = path.join(repoRoot, TITLE_MANIFEST_PATH);
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
