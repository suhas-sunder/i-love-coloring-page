#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const ASSET_BASE_TEMPLATE = "${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}";

const INPUTS = {
  audit: "pipeline/manifests/round-5l-current-asset-filename-audit.json",
  taxonomy: "pipeline/manifests/round-5l-filename-cleanup-taxonomy.json",
  items: "src/generated/coloring/items.json",
  titleOverrides: "src/generated/coloring/title-overrides.json",
  hubItems: "src/generated/coloring/hub-items.json",
  hubs: "src/generated/coloring/hubs.json",
  webpPreviewAssets: "pipeline/manifests/round-5b-webp-preview-assets.json",
};

const OUTPUTS = {
  proposals: "pipeline/manifests/round-5l-clean-object-key-proposals.json",
  collisions: "pipeline/manifests/round-5l-clean-object-key-collisions.json",
  manualReview: "pipeline/manifests/round-5l-manual-review-filename-items.json",
  finalMap: "pipeline/manifests/round-5l-final-svg-webp-object-key-map.json",
  appPathPlan: "pipeline/manifests/round-5l-app-path-mapping-plan.json",
  futureUploadPlan: "pipeline/manifests/round-5l-future-full-upload-plan.json",
  samplePreview: "pipeline/manifests/round-5l-sample-clean-key-preview.json",
};

const REPORTS = {
  proposals: "pipeline/reports/round-5l-clean-object-key-proposals.md",
  collisions: "pipeline/reports/round-5l-clean-object-key-collisions.md",
  manualReview: "pipeline/reports/round-5l-manual-review-filename-items.md",
  finalMap: "pipeline/reports/round-5l-final-svg-webp-object-key-map.md",
  appPathPlan: "pipeline/reports/round-5l-app-path-mapping-plan.md",
  futureUploadPlan: "pipeline/reports/round-5l-future-full-upload-plan.md",
  samplePreview: "pipeline/reports/round-5l-sample-clean-key-preview.md",
};

const BAD_KEY_PATTERN = /\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|failed|failure|retry|generated|ai-generated|image|export|download|screenshot|untitled|copy|final-final|temp|draft|pipeline|bakeoff|trace|r2-upload)\b/i;
const BAD_FILENAME_STEM_PATTERN = /\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|failed|failure|retry|generated|ai-generated|image|export|download|screenshot|untitled|copy|final-final|temp|draft|pipeline|bakeoff|trace|r2-upload|png|jpg|jpeg|webp|svg)\b/i;
const HASH_SUFFIX_PATTERN = /-([a-f0-9]{10})$/i;
const TIMESTAMP_LIKE_PATTERN = /\b(?:20\d{2}[-_.]?\d{2}[-_.]?\d{2}|\d{8,}|\d{4}[-_.]?\d{2}[-_.]?\d{2}[-_.]?\d{2,}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_.]?\d{1,2}[-_.]?20\d{2})\b/i;
const SPELLING_FIXES = new Map([
  ["vehiacle", "vehicle"],
  ["paintaings", "paintings"],
  ["polarbear", "polar-bear"],
  ["idoor", "indoor"],
]);
const GENERIC_STEMS = new Set(["coloring-page", "coloring-pages", "geometric-pattern", "printable-page", "design", "image", "picture", "art"]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const data = await loadData();
  const proposals = buildProposals(data);
  const collisions = resolveCollisions(proposals.records);
  const manualReview = buildManualReview(collisions.records);
  const finalMap = buildFinalMap(collisions.records, data);
  const appPathPlan = buildAppPathPlan(finalMap);
  const futureUploadPlan = buildFutureUploadPlan(finalMap);
  const samplePreview = buildSamplePreview(collisions.records);

  await writeJson(OUTPUTS.proposals, proposals);
  await writeText(REPORTS.proposals, renderProposalsReport(proposals));
  await writeJson(OUTPUTS.collisions, collisions);
  await writeText(REPORTS.collisions, renderCollisionsReport(collisions));
  await writeJson(OUTPUTS.manualReview, manualReview);
  await writeText(REPORTS.manualReview, renderManualReviewReport(manualReview));
  await writeJson(OUTPUTS.finalMap, finalMap);
  await writeText(REPORTS.finalMap, renderFinalMapReport(finalMap));
  await writeJson(OUTPUTS.appPathPlan, appPathPlan);
  await writeText(REPORTS.appPathPlan, renderAppPathPlanReport(appPathPlan));
  await writeJson(OUTPUTS.futureUploadPlan, futureUploadPlan);
  await writeText(REPORTS.futureUploadPlan, renderFutureUploadPlanReport(futureUploadPlan));
  await writeJson(OUTPUTS.samplePreview, samplePreview);
  await writeText(REPORTS.samplePreview, renderSamplePreviewReport(samplePreview));

  console.log(JSON.stringify({
    runId: "round-5l-clean-object-key-map",
    proposals: proposals.summary.totalRecords,
    finalMapRecords: finalMap.summary.totalRecords,
    manualReviewRecords: manualReview.summary.totalManualReviewRecords,
    svgKeyCollisionsResolved: collisions.summary.svgCollisionsResolved,
    webpKeyCollisionsResolved: collisions.summary.webpCollisionsResolved,
    pngExcluded: finalMap.summary.pngExcluded,
    thumbsExcluded: finalMap.summary.thumbsExcluded,
    appRuntimePathsChanged: appPathPlan.summary.appRuntimePathsChanged,
    blockers: finalMap.summary.blockers,
  }, null, 2));
}

async function loadData() {
  const audit = await readJson(INPUTS.audit);
  const taxonomy = await readJson(INPUTS.taxonomy);
  const itemsJson = await readJson(INPUTS.items);
  const titleOverridesJson = await readJson(INPUTS.titleOverrides);
  const hubItemsJson = await readJson(INPUTS.hubItems);
  const hubsJson = await readJson(INPUTS.hubs);
  const webpJson = await readJson(INPUTS.webpPreviewAssets);

  return {
    audit,
    taxonomy,
    items: itemsJson.items || [],
    auditByAssetId: new Map((audit.records || []).map((record) => [record.assetId, record])),
    titleOverrideByAssetId: new Map((titleOverridesJson.overrides || []).map((record) => [record.assetId, record])),
    hubItemsByAssetId: new Map((hubItemsJson.items || []).map((record) => [record.assetId, record])),
    hubById: new Map((hubsJson.hubs || []).map((hub) => [hub.hubId, hub])),
    webpByAssetId: new Map((webpJson.items || []).map((record) => [record.assetId, record])),
  };
}

function buildProposals(data) {
  const records = data.items.map((item) => {
    const audit = data.auditByAssetId.get(item.assetId);
    const override = data.titleOverrideByAssetId.get(item.assetId) || null;
    const webp = data.webpByAssetId.get(item.assetId) || null;
    const currentStem = audit?.currentFilenameStem || basenameWithoutExt(item.assetSubpaths?.svg || "");
    const currentBaseStem = stripHashSuffix(currentStem);
    const hashSuffix = getHashSuffix(item.assetId, currentStem);
    const issueCodes = (audit?.issues || []).map((issue) => issue.code);
    const sourceTitle = override?.cleanTitle || item.title || currentBaseStem;
    const proposedBaseStem = buildCleanBaseStem({
      sourceTitle,
      currentBaseStem,
      category: item.categorySlug,
      issueCodes,
    });
    const proposedCleanStem = `${proposedBaseStem}-${hashSuffix}`;
    const proposedSvgObjectKey = `coloring-pages/svg/${item.categorySlug}/${proposedCleanStem}.svg`;
    const proposedWebpObjectKey = `coloring-pages/webp/${item.categorySlug}/${proposedCleanStem}.webp`;
    const confidence = classifyConfidence({ issueCodes, override, proposedBaseStem });
    const manualReviewRequired = confidence === "manual_review" || issueCodes.includes("manual_review_required");
    const currentNameCanBeKept = issueCodes.length === 1 && issueCodes[0] === "safe_existing_name" && currentStem === proposedCleanStem;
    const action = manualReviewRequired ? "manual_review_before_full_upload" : currentNameCanBeKept ? "keep" : "clean_public_object_key";
    const hubMemberships = (data.hubItemsByAssetId.get(item.assetId)?.hubIds || []).map((hubId) => {
      const hub = data.hubById.get(hubId);
      return hub ? { hubId, slug: hub.slug, route: hub.route, title: hub.title } : { hubId, slug: "", route: "", title: "" };
    });

    return {
      assetId: item.assetId,
      currentCategory: item.categorySlug,
      currentSvgRelativePath: `pipeline/r2-upload/coloring-pages/${item.assetSubpaths?.svg || ""}`,
      currentWebpRelativePath: webp?.generatedWebpPath || `pipeline/r2-upload/coloring-pages/${(item.assetSubpaths?.svg || "").replace(/^svg\//, "webp/").replace(/\.svg$/i, ".webp")}`,
      currentPngPreviewRelativePath: item.assetSubpaths?.pngPreview ? `pipeline/r2-upload/coloring-pages/${item.assetSubpaths.pngPreview}` : null,
      currentThumbnailRelativePath: item.assetSubpaths?.thumbnail ? `pipeline/r2-upload/coloring-pages/${item.assetSubpaths.thumbnail}` : null,
      currentFilenameStem: currentStem,
      displayTitle: item.title,
      titleOverride: override?.cleanTitle || null,
      hubMemberships,
      detectedFilenameIssues: audit?.issues || [],
      proposedCleanStem,
      proposedSvgObjectKey,
      proposedWebpObjectKey,
      confidence,
      action,
      collisionGroup: null,
      manualReviewRequired,
      currentNameCanBeKept,
      hashSuffix,
      reason: summarizeReason({ issueCodes, currentNameCanBeKept, manualReviewRequired, override }),
      webpPlannedByRound5B: Boolean(webp),
      svgFileExists: audit?.svgFileExists === true,
      webpFileExistsInCurrentFullBundle: audit?.webpFileExists === true,
      webpBytes: webp?.webpBytes || 0,
      status: manualReviewRequired ? "manual_review_before_full_upload" : "ready_for_clean_bundle_generation",
    };
  });

  const reasonCounts = countBy(records.flatMap((record) => record.detectedFilenameIssues.map((issue) => issue.code)));
  const confidenceCounts = countBy(records.map((record) => record.confidence));

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-clean-object-key-proposals",
    source: {
      currentFilenameAudit: INPUTS.audit,
      generatedItems: INPUTS.items,
      titleOverrides: INPUTS.titleOverrides,
      webpPlan: INPUTS.webpPreviewAssets,
    },
    summary: {
      totalRecords: records.length,
      currentNamesKept: records.filter((record) => record.currentNameCanBeKept).length,
      cleanPublicObjectKeyActions: records.filter((record) => record.action === "clean_public_object_key").length,
      manualReviewActions: records.filter((record) => record.manualReviewRequired).length,
      highConfidenceCount: records.filter((record) => record.confidence === "high").length,
      mediumConfidenceCount: records.filter((record) => record.confidence === "medium").length,
      lowConfidenceCount: records.filter((record) => record.confidence === "low").length,
      manualReviewConfidenceCount: records.filter((record) => record.confidence === "manual_review").length,
      issueReasonCounts: reasonCounts,
      confidenceCounts,
      appRuntimePathsChanged: false,
      localGeneratedMediaRenamed: false,
      sourceFilesRenamed: false,
    },
    records,
  };
}

function resolveCollisions(records) {
  const svgGroups = groupBy(records, (record) => record.proposedSvgObjectKey);
  const webpGroups = groupBy(records, (record) => record.proposedWebpObjectKey);
  const collisionKeys = new Set([
    ...[...svgGroups.entries()].filter(([, group]) => group.length > 1).map(([key]) => key),
    ...[...webpGroups.entries()].filter(([, group]) => group.length > 1).map(([key]) => key),
  ]);
  const beforeCollisionCount = collisionKeys.size;
  const recordsById = new Map(records.map((record) => [record.assetId, { ...record }]));
  const collisionGroups = [];

  for (const [key, group] of [...svgGroups.entries()].filter(([, group]) => group.length > 1)) {
    const sorted = [...group].sort((a, b) => a.assetId.localeCompare(b.assetId));
    collisionGroups.push({ mediaType: "svg", originalKey: key, assetIds: sorted.map((record) => record.assetId) });
    for (const record of sorted) applyCollisionSuffix(recordsById.get(record.assetId), `svg-${stableHash(record.assetId, 6)}`);
  }

  for (const [key, group] of [...webpGroups.entries()].filter(([, group]) => group.length > 1)) {
    const sorted = [...group].sort((a, b) => a.assetId.localeCompare(b.assetId));
    collisionGroups.push({ mediaType: "webp", originalKey: key, assetIds: sorted.map((record) => record.assetId) });
    for (const record of sorted) applyCollisionSuffix(recordsById.get(record.assetId), `webp-${stableHash(record.assetId, 6)}`);
  }

  const resolved = [...recordsById.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const finalSvgDuplicates = findDuplicateKeys(resolved.map((record) => record.proposedSvgObjectKey));
  const finalWebpDuplicates = findDuplicateKeys(resolved.map((record) => record.proposedWebpObjectKey));

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-clean-object-key-collisions",
    summary: {
      proposedRecordCount: records.length,
      collisionGroupsBeforeResolution: beforeCollisionCount,
      svgCollisionGroupsBeforeResolution: [...svgGroups.values()].filter((group) => group.length > 1).length,
      webpCollisionGroupsBeforeResolution: [...webpGroups.values()].filter((group) => group.length > 1).length,
      svgCollisionsResolved: [...svgGroups.values()].filter((group) => group.length > 1).reduce((sum, group) => sum + group.length, 0),
      webpCollisionsResolved: [...webpGroups.values()].filter((group) => group.length > 1).reduce((sum, group) => sum + group.length, 0),
      finalDuplicateSvgObjectKeys: finalSvgDuplicates.length,
      finalDuplicateWebpObjectKeys: finalWebpDuplicates.length,
      deterministicOrdering: true,
      randomSuffixesUsed: false,
      blockers: [...finalSvgDuplicates, ...finalWebpDuplicates].length ? ["Duplicate future object keys remain after collision resolution."] : [],
    },
    collisionGroups,
    finalDuplicateSvgObjectKeys: finalSvgDuplicates,
    finalDuplicateWebpObjectKeys: finalWebpDuplicates,
    records: resolved,
  };
}

function applyCollisionSuffix(record, suffix) {
  if (!record) return;
  if (record.collisionGroup) return;
  const cleanStemWithoutHash = stripHashSuffix(record.proposedCleanStem);
  record.proposedCleanStem = `${cleanStemWithoutHash}-${suffix}-${record.hashSuffix}`;
  record.proposedSvgObjectKey = `coloring-pages/svg/${record.currentCategory}/${record.proposedCleanStem}.svg`;
  record.proposedWebpObjectKey = `coloring-pages/webp/${record.currentCategory}/${record.proposedCleanStem}.webp`;
  record.collisionGroup = suffix;
  record.reason = `${record.reason}; deterministic collision suffix added`;
}

function buildManualReview(records) {
  const manualRecords = records
    .filter((record) => record.manualReviewRequired || record.confidence === "low" || record.confidence === "manual_review")
    .map((record) => ({
      assetId: record.assetId,
      currentSvgRelativePath: record.currentSvgRelativePath,
      currentWebpRelativePath: record.currentWebpRelativePath,
      currentDisplayTitle: record.displayTitle,
      proposedTitle: record.titleOverride || record.displayTitle,
      proposedCleanStem: record.proposedCleanStem,
      proposedSvgObjectKey: record.proposedSvgObjectKey,
      proposedWebpObjectKey: record.proposedWebpObjectKey,
      reason: record.reason,
      confidence: record.confidence,
      manualReviewRequired: record.manualReviewRequired,
      detectedFilenameIssues: record.detectedFilenameIssues,
      likelyHubPages: record.hubMemberships.map((hub) => hub.route).filter(Boolean),
      localPreviewPath: record.currentPngPreviewRelativePath,
    }));

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-manual-review-filename-items",
    summary: {
      totalManualReviewRecords: manualRecords.length,
      lowConfidenceRecords: manualRecords.filter((record) => record.confidence === "low").length,
      manualReviewConfidenceRecords: manualRecords.filter((record) => record.confidence === "manual_review").length,
      highConfidenceMappingsNotBlocked: true,
      finalUploadMayExcludeManualReviewItems: true,
    },
    records: manualRecords,
  };
}

function buildFinalMap(records, data) {
  const webpByAssetId = data.webpByAssetId;
  const finalRecords = records.map((record) => {
    const webp = webpByAssetId.get(record.assetId);
    const svgSize = fileSizeOrZero(record.currentSvgRelativePath);
    const webpBytes = webp?.webpBytes || record.webpBytes || 0;
    return {
      assetId: record.assetId,
      category: record.currentCategory,
      currentLocalSvgPath: record.currentSvgRelativePath,
      currentLocalWebpPath: record.currentWebpRelativePath,
      futureSvgObjectKey: record.proposedSvgObjectKey,
      futureWebpObjectKey: record.proposedWebpObjectKey,
      futureSvgPublicUrlTemplate: `${ASSET_BASE_TEMPLATE}/${record.proposedSvgObjectKey.replace(/^coloring-pages\//, "")}`,
      futureWebpPublicUrlTemplate: `${ASSET_BASE_TEMPLATE}/${record.proposedWebpObjectKey.replace(/^coloring-pages\//, "")}`,
      displayTitle: record.titleOverride || record.displayTitle,
      originalDisplayTitle: record.displayTitle,
      cleanFilenameStem: record.proposedCleanStem,
      hashSuffix: record.hashSuffix,
      confidence: record.confidence,
      manualReviewRequired: record.manualReviewRequired,
      status: record.status,
      svgBytes: svgSize,
      webpBytes,
      expectedUploadBytes: svgSize + webpBytes,
    };
  });

  const duplicateSvg = findDuplicateKeys(finalRecords.map((record) => record.futureSvgObjectKey));
  const duplicateWebp = findDuplicateKeys(finalRecords.map((record) => record.futureWebpObjectKey));
  const blockers = [];
  if (duplicateSvg.length) blockers.push("Duplicate future SVG object keys remain.");
  if (duplicateWebp.length) blockers.push("Duplicate future WebP object keys remain.");
  if (finalRecords.some((record) => BAD_KEY_PATTERN.test(record.futureSvgObjectKey) || BAD_KEY_PATTERN.test(record.futureWebpObjectKey) || BAD_FILENAME_STEM_PATTERN.test(stripHashSuffix(record.cleanFilenameStem)))) blockers.push("One or more future filename stems still contain forbidden AI, export, failure, format, or pipeline terms.");

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-final-svg-webp-object-key-map",
    publicBaseUrlTemplate: ASSET_BASE_TEMPLATE,
    summary: {
      totalRecords: finalRecords.length,
      totalReadyRecords: finalRecords.filter((record) => !record.manualReviewRequired).length,
      totalManualReviewRecords: finalRecords.filter((record) => record.manualReviewRequired).length,
      totalSvgFiles: finalRecords.length,
      totalWebpFiles: finalRecords.length,
      totalExpectedUploadFiles: finalRecords.length * 2,
      totalExpectedUploadBytes: finalRecords.reduce((sum, record) => sum + record.expectedUploadBytes, 0),
      pngExcluded: true,
      thumbsExcluded: true,
      collisionsResolved: duplicateSvg.length === 0 && duplicateWebp.length === 0,
      duplicateSvgObjectKeys: duplicateSvg.length,
      duplicateWebpObjectKeys: duplicateWebp.length,
      sourceFilesRenamed: false,
      generatedMediaRenamed: false,
      appRuntimePathsChanged: false,
      fullUploadBundleCreated: false,
      blockers,
    },
    records: finalRecords,
  };
}

function buildAppPathPlan(finalMap) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-app-path-mapping-plan",
    summary: {
      appRuntimePathsChanged: false,
      cleanUploadBundleExists: false,
      safeToSwitchRuntimeNow: false,
      finalMapRecords: finalMap.summary.totalRecords,
      imageSitemapDeferred: true,
      openGraphImagesDeferred: true,
    },
    currentState: [
      "Current app runtime paths continue to use the existing generated item data.",
      "Round 5L does not change app pages, asset resolver, download behavior, print behavior, metadata, or generated runtime asset paths.",
      "The clean object-key map is a future upload source of truth only.",
    ],
    migrationSteps: [
      "Generate clean key map.",
      "Generate clean SVG plus WebP upload bundle from existing local media without renaming source files.",
      "Upload clean bundle after explicit approval.",
      "Verify clean public URLs, content types, CORS, and cache headers.",
      "Switch app generated data to clean public keys only after files exist in R2.",
      "Rebuild static site.",
      "Run browser QA for WebP gallery rendering, SVG conversion, Print, and PNG/JPG/WebP downloads.",
      "Then consider image sitemap and Open Graph images.",
    ],
    blockers: ["Do not point the app at clean keys until the matching clean files exist on the custom asset domain."],
  };
}

function buildFutureUploadPlan(finalMap) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-future-full-upload-plan",
    summary: {
      useCleanObjectKeys: true,
      uploadSvgAndWebpOnly: true,
      excludePng: true,
      excludeThumbs: true,
      sourceFilesRemainUnchanged: true,
      generatedLocalMediaRemainUnchangedUntilCleanBundleGeneration: true,
      fullUploadFinalStageOnly: true,
      explicitApprovalRequired: true,
      imageSitemapDeferredUntilCleanPublicUrlsVerified: true,
      openGraphImagesDeferredUntilCleanPublicUrlsVerified: true,
      liveAdsSeparate: true,
      expectedRecords: finalMap.summary.totalRecords,
      expectedUploadFiles: finalMap.summary.totalExpectedUploadFiles,
      expectedUploadBytes: finalMap.summary.totalExpectedUploadBytes,
    },
    uploadFolders: ["coloring-pages/svg", "coloring-pages/webp"],
    excludedFolders: ["coloring-pages/png", "coloring-pages/thumbs"],
    checklist: [
      "Review manual-review naming items or approve conservative fallback names.",
      "Generate a clean upload bundle using round-5l-final-svg-webp-object-key-map.json.",
      "Verify bundle contains exactly SVG and WebP files.",
      "Upload only after explicit owner approval.",
      "Run URL, CORS, cache, static export, and browser QA before any sitemap, OG, JSON-LD image expansion, or live ad work.",
    ],
  };
}

function buildSamplePreview(records) {
  const samples = [
    pickSample(records, "animals", (record) => record.currentCategory === "animals"),
    pickSample(records, "anime-girls", (record) => record.currentCategory === "anime-girls"),
    pickSample(records, "chibi", (record) => record.currentCategory === "chibi"),
    pickSample(records, "fantasy", (record) => record.currentCategory === "fantasy"),
    pickSample(records, "christmas", (record) => record.currentCategory === "christmas" || (record.currentCategory === "holiday" && /christmas/.test(record.currentFilenameStem))),
    pickSample(records, "halloween", (record) => record.currentCategory === "holiday" && /halloween/.test(record.currentFilenameStem)),
    pickSample(records, "geometric-mandalas", (record) => record.currentCategory === "mandala-geometry-patterns" || record.currentCategory === "mandala"),
    pickSample(records, "plushies", (record) => record.currentCategory === "plushie"),
    pickSample(records, "cars-vehicles", (record) => /\b(?:vehicle cars|vehicles|toyota|pagani|sports car|race car)\b/.test(record.currentFilenameStem.replace(/-/g, " "))),
    pickSample(records, "plants-indoor-plants", (record) => record.currentCategory === "indoor-plants"),
  ].filter(Boolean);

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-sample-clean-key-preview",
    summary: {
      requestedSampleGroups: 10,
      sampleCount: samples.length,
    },
    samples,
  };
}

function pickSample(records, group, predicate) {
  const record = records.find(predicate);
  if (!record) return null;
  return {
    group,
    assetId: record.assetId,
    currentFilename: path.basename(record.currentSvgRelativePath),
    proposedCleanFilename: `${record.proposedCleanStem}.svg`,
    reason: record.reason,
    confidence: record.confidence,
    futureSvgObjectKey: record.proposedSvgObjectKey,
    futureWebpObjectKey: record.proposedWebpObjectKey,
  };
}

function buildCleanBaseStem({ sourceTitle, currentBaseStem, category, issueCodes }) {
  let source = sourceTitle || currentBaseStem || category || "coloring-page";
  if (!source || (issueCodes.includes("ai_export_name") && /^chatgpt|^gpt|^openai|^dall/i.test(source))) source = currentBaseStem;
  let slug = slugify(source)
    .replace(/\bcoloring-pages?\b/g, "")
    .replace(/\bprintable\b/g, "")
    .replace(/\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|ai-generated|generated|failed|failure|retry|export|download|screenshot|untitled|copy|final-final|temp|draft|png|jpg|jpeg|webp|svg)\b/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  for (const [bad, good] of SPELLING_FIXES) {
    slug = slug.replace(new RegExp(`\\b${bad}\\b`, "g"), good);
  }

  if (isUnsafeCleanStem(slug)) {
    const currentClean = cleanCandidateStem(currentBaseStem);
    slug = !isUnsafeCleanStem(currentClean) ? currentClean : buildCategoryFallbackStem(category, slug);
  }

  slug = dedupeAdjacentTokens(slug);
  if (slug.length > 72) slug = trimSlug(slug, 72);
  return slug || `${category || "coloring"}-page`;
}

function cleanCandidateStem(value) {
  let slug = slugify(value)
    .replace(/\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|ai-generated|generated|failed|failure|retry|image|export|download|screenshot|untitled|copy|final-final|temp|draft|png|jpg|jpeg|webp|svg)\b/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  for (const [bad, good] of SPELLING_FIXES) {
    slug = slug.replace(new RegExp(`\\b${bad}\\b`, "g"), good);
  }
  return dedupeAdjacentTokens(slug);
}

function isUnsafeCleanStem(slug) {
  return !slug || GENERIC_STEMS.has(slug) || BAD_FILENAME_STEM_PATTERN.test(slug) || TIMESTAMP_LIKE_PATTERN.test(slug);
}

function buildCategoryFallbackStem(category, genericSlug) {
  const categorySlug = cleanCandidateStem(category || "coloring-page");
  const specialCategory = new Map([
    ["mandala-geometry-patterns", "geometric-mandala-pattern"],
    ["animals-playing-cards", "animal-playing-card"],
    ["indoor-plants", "indoor-plant"],
  ]);
  if (specialCategory.has(category)) return specialCategory.get(category);
  if (genericSlug && !GENERIC_STEMS.has(genericSlug)) return `${categorySlug}-${genericSlug}`;
  return categorySlug || "coloring-page";
}

function classifyConfidence({ issueCodes, override, proposedBaseStem }) {
  const issueSet = new Set(issueCodes);
  if (issueSet.has("vague_subject") || issueSet.has("category_mismatch")) return "manual_review";
  if ((issueSet.has("failed_name") || issueSet.has("ai_export_name") || issueSet.has("timestamp_name")) && (!override || GENERIC_STEMS.has(proposedBaseStem))) return "manual_review";
  if (issueSet.has("generic_name") && GENERIC_STEMS.has(proposedBaseStem)) return "low";
  if (issueSet.has("ai_export_name") || issueSet.has("timestamp_name") || issueSet.has("generic_name")) return "medium";
  return "high";
}

function summarizeReason({ issueCodes, currentNameCanBeKept, manualReviewRequired, override }) {
  if (currentNameCanBeKept) return "safe existing public filename";
  const relevant = issueCodes.filter((code) => code !== "safe_existing_name");
  if (manualReviewRequired) return `manual review required for ${relevant.join(", ") || "low confidence name"}`;
  if (override) return `cleaned from public title override after ${relevant.join(", ") || "filename cleanup"}`;
  return `cleaned from existing metadata after ${relevant.join(", ") || "filename cleanup"}`;
}

function getHashSuffix(assetId, currentStem) {
  const currentMatch = HASH_SUFFIX_PATTERN.exec(currentStem || "");
  if (currentMatch) return currentMatch[1].toLowerCase();
  const assetMatch = /__([a-f0-9]{10})$/i.exec(assetId || "");
  if (assetMatch) return assetMatch[1].toLowerCase();
  return stableHash(assetId || currentStem || "asset", 10);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function dedupeAdjacentTokens(slug) {
  const output = [];
  for (const token of slug.split("-").filter(Boolean)) {
    if (output[output.length - 1] !== token) output.push(token);
  }
  return output.join("-");
}

function trimSlug(slug, maxLength) {
  const tokens = slug.split("-").filter(Boolean);
  const kept = [];
  for (const token of tokens) {
    const next = [...kept, token].join("-");
    if (next.length > maxLength) break;
    kept.push(token);
  }
  return kept.join("-") || slug.slice(0, maxLength).replace(/-+$/g, "");
}

function stripHashSuffix(stem) {
  return String(stem || "").replace(HASH_SUFFIX_PATTERN, "");
}

function basenameWithoutExt(filePath) {
  return path.basename(filePath || "").replace(/\.[^.]+$/, "");
}

function stableHash(value, length) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, length);
}

function groupBy(items, getter) {
  const groups = new Map();
  for (const item of items) {
    const key = getter(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function findDuplicateKeys(keys) {
  return [...groupBy(keys, (key) => key).entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, count: group.length }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function fileSizeOrZero(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath || "");
  if (!existsSync(absolute)) return 0;
  try {
    return Number(statSync(absolute).size) || 0;
  } catch {
    return 0;
  }
}

function renderProposalsReport(payload) {
  const s = payload.summary;
  return `# Round 5L Clean Object-Key Proposals

- Total records: ${s.totalRecords}
- Current names kept: ${s.currentNamesKept}
- Clean public object-key actions: ${s.cleanPublicObjectKeyActions}
- Manual review actions: ${s.manualReviewActions}
- High confidence: ${s.highConfidenceCount}
- Medium confidence: ${s.mediumConfidenceCount}
- Low confidence: ${s.lowConfidenceCount}
- Manual review confidence: ${s.manualReviewConfidenceCount}
- App runtime paths changed: ${s.appRuntimePathsChanged}
- Local generated media renamed: ${s.localGeneratedMediaRenamed}
- Source files renamed: ${s.sourceFilesRenamed}

## Top Issue Reasons

${Object.entries(s.issueReasonCounts).map(([key, count]) => `- ${key}: ${count}`).join("\n") || "- none"}

## Examples

${payload.records.slice(0, 20).map((record) => `- ${record.assetId}: ${record.currentFilenameStem} -> ${record.proposedCleanStem} (${record.confidence})`).join("\n")}
`;
}

function renderCollisionsReport(payload) {
  const s = payload.summary;
  return `# Round 5L Clean Object-Key Collisions

- Proposed records: ${s.proposedRecordCount}
- Collision groups before resolution: ${s.collisionGroupsBeforeResolution}
- SVG collision groups before resolution: ${s.svgCollisionGroupsBeforeResolution}
- WebP collision groups before resolution: ${s.webpCollisionGroupsBeforeResolution}
- SVG collisions resolved: ${s.svgCollisionsResolved}
- WebP collisions resolved: ${s.webpCollisionsResolved}
- Final duplicate SVG object keys: ${s.finalDuplicateSvgObjectKeys}
- Final duplicate WebP object keys: ${s.finalDuplicateWebpObjectKeys}
- Deterministic ordering: ${s.deterministicOrdering}
- Random suffixes used: ${s.randomSuffixesUsed}

${payload.collisionGroups.length ? `## Collision Groups\n\n${payload.collisionGroups.slice(0, 30).map((group) => `- ${group.mediaType}: ${group.originalKey} (${group.assetIds.join(", ")})`).join("\n")}\n` : "No future object-key collisions were found after stable hash suffixing.\n"}
${s.blockers.length ? `## Blockers\n\n${s.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderManualReviewReport(payload) {
  return `# Round 5L Manual Review Filename Items

- Manual review records: ${payload.summary.totalManualReviewRecords}
- Low confidence records: ${payload.summary.lowConfidenceRecords}
- Manual-review confidence records: ${payload.summary.manualReviewConfidenceRecords}
- High-confidence mappings blocked: false
- Final upload may exclude manual-review items: ${payload.summary.finalUploadMayExcludeManualReviewItems}

## Examples

${payload.records.slice(0, 40).map((record) => `- ${record.assetId}: ${record.currentDisplayTitle} -> ${record.proposedCleanStem} (${record.confidence}; ${record.reason})`).join("\n") || "- none"}
`;
}

function renderFinalMapReport(payload) {
  const s = payload.summary;
  return `# Round 5L Final SVG Plus WebP Object-Key Map

- Total records: ${s.totalRecords}
- Ready records: ${s.totalReadyRecords}
- Manual-review records: ${s.totalManualReviewRecords}
- SVG files planned: ${s.totalSvgFiles}
- WebP files planned: ${s.totalWebpFiles}
- Expected upload files: ${s.totalExpectedUploadFiles}
- Expected upload bytes: ${s.totalExpectedUploadBytes}
- PNG excluded: ${s.pngExcluded}
- Thumbs excluded: ${s.thumbsExcluded}
- Collisions resolved: ${s.collisionsResolved}
- Source files renamed: ${s.sourceFilesRenamed}
- Generated media renamed: ${s.generatedMediaRenamed}
- App runtime paths changed: ${s.appRuntimePathsChanged}
- Full upload bundle created: ${s.fullUploadBundleCreated}

${s.blockers.length ? `## Blockers\n\n${s.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No final-map blockers found.\n"}
`;
}

function renderAppPathPlanReport(payload) {
  return `# Round 5L App Path Mapping Plan

- App runtime paths changed: ${payload.summary.appRuntimePathsChanged}
- Clean upload bundle exists: ${payload.summary.cleanUploadBundleExists}
- Safe to switch runtime now: ${payload.summary.safeToSwitchRuntimeNow}
- Final map records: ${payload.summary.finalMapRecords}
- Image sitemap deferred: ${payload.summary.imageSitemapDeferred}
- Open Graph images deferred: ${payload.summary.openGraphImagesDeferred}

## Current State

${payload.currentState.map((item) => `- ${item}`).join("\n")}

## Migration Steps

${payload.migrationSteps.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Blockers

${payload.blockers.map((item) => `- ${item}`).join("\n")}
`;
}

function renderFutureUploadPlanReport(payload) {
  const s = payload.summary;
  return `# Round 5L Future Full Upload Plan

- Use clean object keys: ${s.useCleanObjectKeys}
- Upload SVG and WebP only: ${s.uploadSvgAndWebpOnly}
- Exclude PNG: ${s.excludePng}
- Exclude thumbs: ${s.excludeThumbs}
- Source files remain unchanged: ${s.sourceFilesRemainUnchanged}
- Generated local media remains unchanged until clean bundle generation: ${s.generatedLocalMediaRemainUnchangedUntilCleanBundleGeneration}
- Full upload final-stage only: ${s.fullUploadFinalStageOnly}
- Explicit approval required: ${s.explicitApprovalRequired}
- Image sitemap deferred until clean public URLs verified: ${s.imageSitemapDeferredUntilCleanPublicUrlsVerified}
- Open Graph images deferred until clean public URLs verified: ${s.openGraphImagesDeferredUntilCleanPublicUrlsVerified}
- Live ads separate: ${s.liveAdsSeparate}
- Expected records: ${s.expectedRecords}
- Expected upload files: ${s.expectedUploadFiles}
- Expected upload bytes: ${s.expectedUploadBytes}

## Upload Folders

${payload.uploadFolders.map((folder) => `- ${folder}`).join("\n")}

## Excluded Folders

${payload.excludedFolders.map((folder) => `- ${folder}`).join("\n")}

## Checklist

${payload.checklist.map((item) => `- ${item}`).join("\n")}
`;
}

function renderSamplePreviewReport(payload) {
  return `# Round 5L Sample Clean-Key Preview

- Requested sample groups: ${payload.summary.requestedSampleGroups}
- Samples included: ${payload.summary.sampleCount}

${payload.samples.map((sample) => `## ${sample.group}

- Asset: ${sample.assetId}
- Current filename: ${sample.currentFilename}
- Proposed clean filename: ${sample.proposedCleanFilename}
- Confidence: ${sample.confidence}
- Reason: ${sample.reason}
- Future SVG object key: ${sample.futureSvgObjectKey}
- Future WebP object key: ${sample.futureWebpObjectKey}
`).join("\n")}
`;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${String(text).replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}
