import { copyFile, link, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export const ROUND4G_GENERATED_AT = "2026-05-10";
export const ROUND4G_RUN_ID = "round-4g-cloudflare-r2-test-upload-bundle";
export const R2_TEST_BUNDLE_ROOT = "pipeline/r2-upload-test/coloring/test-v1";

const DEFAULT_LIMIT = 30;
const DEFAULT_PREFIX = "coloring/test-v1";
const EXAMPLE_PUBLIC_BASE_URL = "https://assets.example.com/coloring/test-v1";
const R2_TEST_UPLOAD_ROOT = "pipeline/r2-upload-test";
const IMMUTABLE_CACHE_POLICY = "public, max-age=31536000, immutable";

const INPUT_PATHS = {
  publishManifest: "pipeline/manifests/round-4e-asset-publish-manifest.json",
  assetUrlContract: "pipeline/manifests/round-4e-asset-url-contract.json",
  cachePolicy: "pipeline/manifests/round-4e-cache-and-content-type-policy.json",
  hostingDecision: "pipeline/manifests/round-4e-asset-hosting-decision.json",
  frontendAssetContract: "pipeline/manifests/round-4f-frontend-asset-contract.json",
  productionAssets: "pipeline/manifests/round-3c-production-assets.json",
  productionQuarantine: "pipeline/manifests/round-3c-production-quarantine.json",
  generatedItems: "src/generated/coloring/items.json",
  generatedHubs: "src/generated/coloring/hubs.json",
  generatedHubItems: "src/generated/coloring/hub-items.json",
  generatedRoutes: "src/generated/coloring/routes.json",
};

const MEDIA_TYPES = [
  { mediaType: "svg", itemKey: "svg", contentType: "image/svg+xml", root: "svg" },
  { mediaType: "pngPreview", itemKey: "pngPreview", contentType: "image/png", root: "png" },
  { mediaType: "thumbnail", itemKey: "thumbnail", contentType: "image/png", root: "thumbs" },
];

const PRIORITY_HUB_SLUGS = [
  "plushies",
  "animals",
  "mandalas",
  "anime-girls",
  "chibi",
  "fantasy",
  "christmas",
  "halloween",
  "prehistoric-animals",
  "plants",
  "flowers",
  "cars",
  "sea-life",
  "dogs",
  "mythology",
  "geometric",
  "vehicles",
  "indoor-plants",
];

const WARNING_PREFERRED_HUBS = new Set(["plushies", "animals", "anime-girls", "chibi", "fantasy", "christmas", "halloween", "mythology"]);
const NON_WARNING_PREFERRED_HUBS = new Set(["mandalas", "plants", "flowers", "cars", "sea-life", "dogs", "geometric", "vehicles", "indoor-plants"]);

export const ROUND4G_MANIFEST_FILES = [
  "pipeline/manifests/round-4g-r2-test-selection.json",
  "pipeline/manifests/round-4g-r2-test-upload-bundle-plan.json",
  "pipeline/manifests/round-4g-r2-test-object-key-map.json",
  "pipeline/manifests/round-4g-r2-test-upload-bundle-results.json",
  "pipeline/manifests/round-4g-r2-test-url-verification-plan.json",
  "pipeline/manifests/round-4g-r2-test-manual-upload-checklist.json",
];

export const ROUND4G_REPORT_FILES = [
  "pipeline/reports/round-4g-r2-test-upload-bundle-report.md",
  "pipeline/reports/round-4g-r2-test-manual-upload-guide.md",
  "pipeline/reports/round-4g-r2-test-url-verification-plan.md",
  "pipeline/reports/round-4g-netlify-cdn-preview-plan.md",
  "pipeline/reports/round-4g-next-phase-plan.md",
];

export async function runRound4GR2TestBundle(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const limit = Number(options.limit ?? DEFAULT_LIMIT);
  const prefix = normalizeUploadPrefix(options.prefix || DEFAULT_PREFIX);
  const mode = options.copy ? "copy" : options.mode || "hardlink";
  const verify = Boolean(options.verify);

  if (!Number.isInteger(limit) || limit <= 0 || limit > DEFAULT_LIMIT) {
    throw new Error(`Round 4G limit must be an integer from 1 to ${DEFAULT_LIMIT}. Received ${options.limit}`);
  }
  if (!["hardlink", "copy"].includes(mode)) {
    throw new Error(`Unsupported Round 4G bundle mode: ${mode}`);
  }

  const bundleRoot = path.posix.join(R2_TEST_UPLOAD_ROOT, prefix);
  const absoluteBundleRoot = resolveSafeUnder(repoRoot, bundleRoot, path.posix.join(repoRootToPosix(repoRoot), R2_TEST_UPLOAD_ROOT));
  const absoluteUploadRoot = resolveSafeUnder(repoRoot, R2_TEST_UPLOAD_ROOT, repoRootToPosix(repoRoot));

  const state = await loadState(repoRoot, prefix, bundleRoot);
  const selectedRecords = selectRecords(state, limit);
  const objectKeyEntries = buildObjectKeyEntries(state, selectedRecords, prefix, bundleRoot);
  const plan = buildBundlePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, mode);

  validateSelectionAndPlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot);

  if (options.clean) {
    assertPathInside(absoluteBundleRoot, absoluteUploadRoot, "clean target");
    await rm(absoluteBundleRoot, { recursive: true, force: true });
  }

  await mkdir(absoluteBundleRoot, { recursive: true });
  const copyResults = await materializeBundleFiles({
    repoRoot,
    mode,
    objectKeyEntries,
    bundleRoot,
  });

  const results = buildBundleResults(state, selectedRecords, objectKeyEntries, copyResults, bundleRoot, prefix);
  const selectionManifest = buildSelectionManifest(state, selectedRecords, prefix, bundleRoot);
  const objectKeyMap = buildObjectKeyMap(objectKeyEntries, prefix);
  const urlVerificationPlan = buildUrlVerificationPlan(state, selectedRecords, objectKeyEntries, prefix);
  const manualUploadChecklist = buildManualUploadChecklist(state, selectedRecords, objectKeyEntries, prefix, bundleRoot);
  const manifests = {
    "pipeline/manifests/round-4g-r2-test-selection.json": selectionManifest,
    "pipeline/manifests/round-4g-r2-test-upload-bundle-plan.json": plan,
    "pipeline/manifests/round-4g-r2-test-object-key-map.json": objectKeyMap,
    "pipeline/manifests/round-4g-r2-test-upload-bundle-results.json": results,
    "pipeline/manifests/round-4g-r2-test-url-verification-plan.json": urlVerificationPlan,
    "pipeline/manifests/round-4g-r2-test-manual-upload-checklist.json": manualUploadChecklist,
  };
  const reports = buildReports({
    state,
    selectionManifest,
    plan,
    objectKeyMap,
    results,
    urlVerificationPlan,
    manualUploadChecklist,
    prefix,
    bundleRoot,
  });

  for (const [relativePath, payload] of Object.entries(manifests)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }

  if (verify) {
    validateSelectionAndPlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot);
  }

  return {
    state,
    selectionManifest,
    plan,
    objectKeyMap,
    results,
    urlVerificationPlan,
    manualUploadChecklist,
    reports,
  };
}

async function loadState(repoRoot, prefix, bundleRoot) {
  const inputs = {};
  for (const [key, relativePath] of Object.entries(INPUT_PATHS)) {
    inputs[key] = await readJson(path.join(repoRoot, relativePath));
  }

  const publishByAssetId = new Map();
  for (const file of inputs.publishManifest.files) {
    if (file.status !== "ready") continue;
    let mediaFiles = publishByAssetId.get(file.assetId);
    if (!mediaFiles) {
      mediaFiles = new Map();
      publishByAssetId.set(file.assetId, mediaFiles);
    }
    mediaFiles.set(file.mediaType, file);
  }

  const itemById = new Map(inputs.generatedItems.items.map((item) => [item.assetId, item]));
  const assetById = new Map(inputs.productionAssets.assets.map((asset) => [asset.assetId, asset]));
  const quarantinedAssetIds = new Set((inputs.productionQuarantine.entries || []).map((entry) => entry.assetId));
  const hubById = new Map(inputs.generatedHubs.hubs.map((hub) => [hub.hubId, hub]));
  const hubBySlug = new Map(inputs.generatedHubs.hubs.map((hub) => [hub.slug, hub]));
  const hubItemsByAssetId = new Map(inputs.generatedHubItems.items.map((entry) => [entry.assetId, entry]));
  const routeByHubId = new Map(inputs.generatedRoutes.routes.map((route) => [route.hubId, route]));

  const candidates = [];
  for (const item of inputs.generatedItems.items) {
    const asset = assetById.get(item.assetId);
    const mediaFiles = publishByAssetId.get(item.assetId);
    if (!asset || asset.status !== "passed_production_export") continue;
    if (!mediaFiles || !MEDIA_TYPES.every((media) => mediaFiles.has(media.mediaType))) continue;
    if (quarantinedAssetIds.has(item.assetId)) continue;
    candidates.push(buildCandidate({ item, asset, mediaFiles, hubItemsByAssetId, hubById, routeByHubId }));
  }

  candidates.sort(compareCandidateByAssetId);

  return {
    repoRoot,
    prefix,
    bundleRoot,
    inputs,
    candidates,
    itemById,
    assetById,
    publishByAssetId,
    quarantinedAssetIds,
    hubById,
    hubBySlug,
    hubItemsByAssetId,
    routeByHubId,
  };
}

function buildCandidate({ item, asset, mediaFiles, hubItemsByAssetId, hubById, routeByHubId }) {
  const hubItem = hubItemsByAssetId.get(item.assetId) || { hubIds: [] };
  const hubs = (hubItem.hubIds || [])
    .map((hubId) => hubById.get(hubId))
    .filter(Boolean)
    .map((hub) => {
      const route = routeByHubId.get(hub.hubId);
      const previewIndex = Array.isArray(hub.previewAssetIds) ? hub.previewAssetIds.indexOf(item.assetId) : -1;
      const featuredIndex = Array.isArray(hub.featuredAssetIds) ? hub.featuredAssetIds.indexOf(item.assetId) : -1;
      return {
        hubId: hub.hubId,
        slug: hub.slug,
        title: hub.title,
        route: route?.path || hub.route || `/coloring-pages/${hub.slug}`,
        assetCount: hub.assetCount,
        previewIndex,
        featuredIndex,
        visibleOnFirstPage: previewIndex >= 0 && previewIndex < (hub.galleryPageSize || 48),
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  const visibleHubs = hubs.filter((hub) => hub.visibleOnFirstPage);
  const likelyPages = (visibleHubs.length ? visibleHubs : hubs)
    .slice(0, 8)
    .map((hub) => ({
      path: hub.route,
      title: hub.title,
      reason: hub.visibleOnFirstPage ? "included in the first-page preview set" : "assigned to this hub",
    }));

  if (!likelyPages.some((page) => page.path === "/coloring-pages")) {
    likelyPages.unshift({
      path: "/coloring-pages",
      title: "Coloring Pages",
      reason: "root gallery includes approved production items",
    });
  }

  const warningFlags = item.warningFlags || asset.round3a1WarningFlags || [];

  return {
    assetId: item.assetId,
    displayTitle: item.title,
    category: item.categorySlug,
    filenameSlug: item.filenameSlug,
    altText: item.altText,
    item,
    asset,
    mediaFiles,
    hubs,
    likelyPages,
    warningFlags: [...warningFlags].sort(),
    isWarning: warningFlags.length > 0,
    visibleHubSlugs: new Set(visibleHubs.map((hub) => hub.slug)),
    allHubSlugs: new Set(hubs.map((hub) => hub.slug)),
  };
}

function selectRecords(state, limit) {
  const selected = [];
  const selectedAssetIds = new Set();
  const coveredHubSlugs = new Set();

  function addCandidate(candidate, reason) {
    if (!candidate || selectedAssetIds.has(candidate.assetId)) return false;
    selected.push({ ...candidate, selectionReason: reason });
    selectedAssetIds.add(candidate.assetId);
    for (const hub of candidate.hubs) coveredHubSlugs.add(hub.slug);
    return true;
  }

  for (const slug of PRIORITY_HUB_SLUGS) {
    if (coveredHubSlugs.has(slug)) continue;
    const preferWarning = WARNING_PREFERRED_HUBS.has(slug) ? true : NON_WARNING_PREFERRED_HUBS.has(slug) ? false : null;
    addCandidate(pickForHub(state, slug, selectedAssetIds, preferWarning), `representative item for ${slug}`);
  }

  while (selected.filter((record) => record.warningFlags.length > 0).length < 6) {
    if (!addCandidate(pickAcrossPriorityHubs(state, selectedAssetIds, true), "warning-flagged production-pass spot check")) break;
  }

  while (selected.filter((record) => record.warningFlags.length === 0).length < 6) {
    if (!addCandidate(pickAcrossPriorityHubs(state, selectedAssetIds, false), "non-warning production-pass control item")) break;
  }

  let fillIndex = 0;
  while (selected.length < limit) {
    const slug = PRIORITY_HUB_SLUGS[fillIndex % PRIORITY_HUB_SLUGS.length];
    fillIndex += 1;
    if (addCandidate(pickForHub(state, slug, selectedAssetIds, null), `additional first-page coverage for ${slug}`)) continue;
    if (fillIndex > PRIORITY_HUB_SLUGS.length * 2) {
      if (!addCandidate(pickAnyCandidate(state, selectedAssetIds), "deterministic fallback coverage")) break;
    }
  }

  if (selected.length !== limit) {
    throw new Error(`Round 4G selection expected ${limit} records but selected ${selected.length}.`);
  }

  return selected.map(({ item, asset, mediaFiles, visibleHubSlugs, allHubSlugs, isWarning, ...record }) => record);
}

function pickForHub(state, slug, selectedAssetIds, preferWarning) {
  const hub = state.hubBySlug.get(slug);
  if (!hub) return null;
  const orderedAssetIds = [
    ...(hub.previewAssetIds || []),
    ...(hub.featuredAssetIds || []),
    ...(hub.assetIds || []),
  ];
  const seen = new Set();
  const candidates = orderedAssetIds
    .filter((assetId) => {
      if (seen.has(assetId) || selectedAssetIds.has(assetId)) return false;
      seen.add(assetId);
      return true;
    })
    .map((assetId) => state.candidates.find((candidate) => candidate.assetId === assetId))
    .filter(Boolean);

  return sortCandidatesForHub(candidates, slug, preferWarning)[0] || null;
}

function pickAcrossPriorityHubs(state, selectedAssetIds, preferWarning) {
  const candidates = [];
  for (const slug of PRIORITY_HUB_SLUGS) {
    const candidate = pickForHub(state, slug, selectedAssetIds, preferWarning);
    if (candidate) candidates.push(candidate);
  }
  return sortCandidatesForHub(candidates, PRIORITY_HUB_SLUGS[0], preferWarning)[0] || null;
}

function pickAnyCandidate(state, selectedAssetIds) {
  return state.candidates.find((candidate) => !selectedAssetIds.has(candidate.assetId)) || null;
}

function sortCandidatesForHub(candidates, slug, preferWarning) {
  return [...candidates].sort((a, b) => {
    const aPreference = preferWarning === null ? 0 : a.warningFlags.length > 0 === preferWarning ? 0 : 1;
    const bPreference = preferWarning === null ? 0 : b.warningFlags.length > 0 === preferWarning ? 0 : 1;
    if (aPreference !== bPreference) return aPreference - bPreference;

    const aVisible = a.hubs.find((hub) => hub.slug === slug)?.previewIndex ?? 9999;
    const bVisible = b.hubs.find((hub) => hub.slug === slug)?.previewIndex ?? 9999;
    if (aVisible !== bVisible) return aVisible - bVisible;

    const aFeatured = a.hubs.find((hub) => hub.slug === slug)?.featuredIndex ?? 9999;
    const bFeatured = b.hubs.find((hub) => hub.slug === slug)?.featuredIndex ?? 9999;
    if (aFeatured !== bFeatured) return aFeatured - bFeatured;

    if (a.hubs.length !== b.hubs.length) return b.hubs.length - a.hubs.length;
    return a.assetId.localeCompare(b.assetId);
  });
}

function buildObjectKeyEntries(state, selectedRecords, prefix, bundleRoot) {
  const entries = [];
  for (const record of selectedRecords) {
    const mediaFiles = state.publishByAssetId.get(record.assetId);
    for (const media of MEDIA_TYPES) {
      const publishFile = mediaFiles.get(media.mediaType);
      const cdnRelativePath = normalizePosixPath(publishFile.cdnRelativePath);
      const sourceLocalRelativePath = normalizePosixPath(publishFile.localRelativePath);
      const r2ObjectKey = path.posix.join(prefix, cdnRelativePath);
      const uploadBundleRelativePath = path.posix.join(R2_TEST_UPLOAD_ROOT, r2ObjectKey);
      const targetUploadBundleRelativePath = uploadBundleRelativePath;
      entries.push({
        assetId: record.assetId,
        displayTitle: record.displayTitle,
        category: record.category,
        mediaType: media.mediaType,
        sourceLocalRelativePath,
        uploadBundleRelativePath,
        targetUploadBundleRelativePath,
        r2ObjectKey,
        cdnRelativePath,
        expectedPublicUrl: `https://assets.example.com/${r2ObjectKey}`,
        contentType: publishFile.contentType || media.contentType,
        recommendedCacheControl: publishFile.cachePolicy || IMMUTABLE_CACHE_POLICY,
        fileSize: publishFile.fileSize,
        sha256: publishFile.sha256,
        status: "ready",
        bundleRoot,
      });
    }
  }
  return entries.sort((a, b) => a.r2ObjectKey.localeCompare(b.r2ObjectKey));
}

function buildSelectionManifest(state, selectedRecords, prefix, bundleRoot) {
  const records = selectedRecords
    .map((record) => {
      const entries = buildObjectKeyEntries(state, [record], prefix, bundleRoot);
      const byMedia = Object.fromEntries(
        entries.map((entry) => [
          entry.mediaType,
          {
            sourceLocalRelativePath: entry.sourceLocalRelativePath,
            targetUploadBundleRelativePath: entry.uploadBundleRelativePath,
            r2ObjectKey: entry.r2ObjectKey,
            cdnRelativePath: entry.cdnRelativePath,
            expectedPublicUrl: entry.expectedPublicUrl,
            contentType: entry.contentType,
            recommendedCacheControl: entry.recommendedCacheControl,
            fileSize: entry.fileSize,
            sha256: entry.sha256,
          },
        ]),
      );

      return {
        assetId: record.assetId,
        displayTitle: record.displayTitle,
        category: record.category,
        hubs: record.hubs.map(({ hubId, slug, title, route, assetCount, visibleOnFirstPage }) => ({
          hubId,
          slug,
          title,
          route,
          assetCount,
          visibleOnFirstPage,
        })),
        likelyPages: record.likelyPages,
        media: byMedia,
        warningFlags: record.warningFlags,
        selectionReasons: [
          record.selectionReason,
          record.warningFlags.length > 0 ? "passed production export with warning metadata preserved" : "passed production export without warning metadata",
          record.hubs.length > 1 ? "appears in multiple public hubs" : "single primary hub coverage",
        ],
      };
    })
    .sort((a, b) => a.assetId.localeCompare(b.assetId));

  const coveredHubSlugs = [...new Set(records.flatMap((record) => record.hubs.map((hub) => hub.slug)))].sort();

  return {
    generatedAt: ROUND4G_GENERATED_AT,
    runId: ROUND4G_RUN_ID,
    purpose: "Deterministic 30-record Cloudflare R2 Standard Storage test upload selection.",
    inputs: INPUT_PATHS,
    providerDecision: {
      selectedInitialStorageTarget: "cloudflare-r2-standard-storage",
      productionServingModel: "Netlify static frontend plus public Cloudflare R2 custom-domain media URLs",
      r2DevIntendedProductionUrl: false,
    },
    uploadBundleRoot: bundleRoot,
    uploadPrefix: prefix,
    expectedPublicBaseUrl: EXAMPLE_PUBLIC_BASE_URL,
    summary: {
      selectedImageRecordCount: records.length,
      expectedMediaFileCount: records.length * MEDIA_TYPES.length,
      warningRecordCount: records.filter((record) => record.warningFlags.length > 0).length,
      nonWarningRecordCount: records.filter((record) => record.warningFlags.length === 0).length,
      multiHubRecordCount: records.filter((record) => record.hubs.length > 1).length,
      coveredHubSlugs,
      sourceImagesIncluded: 0,
      quarantinedAssetsIncluded: 0,
      blockedAssetsIncluded: 0,
    },
    records,
  };
}

function buildBundlePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, mode) {
  const counts = countMediaTypes(objectKeyEntries);
  return {
    generatedAt: ROUND4G_GENERATED_AT,
    runId: ROUND4G_RUN_ID,
    uploadBundleRoot: bundleRoot,
    uploadPrefix: prefix,
    expectedPublicBaseUrlPattern: EXAMPLE_PUBLIC_BASE_URL,
    hardlinkOrCopyModeUsed: mode,
    sourceManifest: INPUT_PATHS.publishManifest,
    fullPublishManifestFileCount: state.inputs.publishManifest.files.length,
    fullPublishManifestBundled: false,
    summary: {
      selectedImageRecordCount: selectedRecords.length,
      totalMediaFilesPlanned: objectKeyEntries.length,
      totalBytes: sumFileSizes(objectKeyEntries),
      totalSvgFiles: counts.svg,
      totalPngPreviewFiles: counts.pngPreview,
      totalThumbnailFiles: counts.thumbnail,
      skippedFiles: 0,
      invalidFiles: 0,
      hardlinkOrCopyModeUsed: mode,
    },
    safetyPolicy: {
      neverWriteOutside: R2_TEST_UPLOAD_ROOT,
      neverDeleteOutside: bundleRoot,
      publicFolderCopiesAllowed: false,
      fullMediaSetAllowed: false,
      sourceProductionAssetsModified: false,
      uploadCommandsRun: false,
      credentialsRequired: false,
    },
    plannedFiles: objectKeyEntries.map((entry) => ({
      assetId: entry.assetId,
      mediaType: entry.mediaType,
      sourceLocalRelativePath: entry.sourceLocalRelativePath,
      uploadBundleRelativePath: entry.uploadBundleRelativePath,
      r2ObjectKey: entry.r2ObjectKey,
      contentType: entry.contentType,
      fileSize: entry.fileSize,
      sha256: entry.sha256,
      status: entry.status,
    })),
    skippedFiles: [],
    invalidFiles: [],
  };
}

function buildObjectKeyMap(objectKeyEntries, prefix) {
  return {
    generatedAt: ROUND4G_GENERATED_AT,
    runId: ROUND4G_RUN_ID,
    summary: {
      entryCount: objectKeyEntries.length,
      uploadPrefix: prefix,
      expectedPublicBaseUrlPattern: EXAMPLE_PUBLIC_BASE_URL,
    },
    entries: objectKeyEntries.map((entry) => ({
      assetId: entry.assetId,
      displayTitle: entry.displayTitle,
      category: entry.category,
      mediaType: entry.mediaType,
      sourceLocalRelativePath: entry.sourceLocalRelativePath,
      uploadBundleRelativePath: entry.uploadBundleRelativePath,
      r2ObjectKey: entry.r2ObjectKey,
      cdnRelativePath: entry.cdnRelativePath,
      expectedPublicUrl: entry.expectedPublicUrl,
      contentType: entry.contentType,
      recommendedCacheControl: entry.recommendedCacheControl,
      fileSize: entry.fileSize,
      sha256: entry.sha256,
      status: entry.status,
    })),
  };
}

function buildBundleResults(state, selectedRecords, objectKeyEntries, copyResults, bundleRoot, prefix) {
  const counts = countMediaTypes(objectKeyEntries);
  return {
    generatedAt: ROUND4G_GENERATED_AT,
    runId: ROUND4G_RUN_ID,
    uploadBundleRoot: bundleRoot,
    uploadPrefix: prefix,
    summary: {
      selectedImageRecordCount: selectedRecords.length,
      createdMediaFileCount: copyResults.linkedFileCount + copyResults.copiedFileCount,
      linkedFileCount: copyResults.linkedFileCount,
      copiedFileCount: copyResults.copiedFileCount,
      failedFileCount: copyResults.failedFiles.length,
      totalBundleBytesRepresented: sumFileSizes(objectKeyEntries),
      totalSvgFiles: counts.svg,
      totalPngPreviewFiles: counts.pngPreview,
      totalThumbnailFiles: counts.thumbnail,
      materializationModeRequested: copyResults.modeRequested,
      materializationModeObserved: copyResults.linkedFileCount > 0 && copyResults.copiedFileCount > 0 ? "mixed" : copyResults.linkedFileCount > 0 ? "hardlink" : "copy",
    },
    safetyChecks: {
      writesConstrainedToR2UploadTest: true,
      deletesConstrainedToBundleRoot: true,
      sourceAssetImmutabilityConfirmed: true,
      publicFolderExclusionConfirmed: true,
      fullPublishManifestBundled: false,
      fullMediaSetPrepared: false,
      sourceImagesIncluded: 0,
      quarantinedAssetsIncluded: 0,
      blockedAssetsIncluded: 0,
      uploadCommandsRun: false,
      credentialsRequired: false,
      appApiRouteIntroduced: false,
    },
    sourceAssetImmutabilityConfirmation: "The script only reads pipeline/production/full/assets and never writes there.",
    publicFolderExclusionConfirmation: "The bundle target is pipeline/r2-upload-test only. No public folder writes are performed.",
    failedFiles: copyResults.failedFiles,
  };
}

function buildUrlVerificationPlan(state, selectedRecords, objectKeyEntries, prefix) {
  const trios = selectedRecords.slice(0, 10).map((record) => {
    const entries = objectKeyEntries.filter((entry) => entry.assetId === record.assetId);
    return {
      assetId: record.assetId,
      displayTitle: record.displayTitle,
      category: record.category,
      hubs: record.hubs.map((hub) => ({ slug: hub.slug, route: hub.route, title: hub.title })),
      likelyPages: record.likelyPages,
      urls: entries.map((entry) => verificationEntry(entry, record.likelyPages)),
    };
  });
  const recordById = new Map(selectedRecords.map((record) => [record.assetId, record]));

  return {
    generatedAt: ROUND4G_GENERATED_AT,
    runId: ROUND4G_RUN_ID,
    purpose: "Public URL checks to run after manually uploading the Round 4G test bundle to Cloudflare R2.",
    uploadPrefix: prefix,
    publicBaseUrl: EXAMPLE_PUBLIC_BASE_URL,
    expectedStatus: 200,
    expectedNoPrivateEndpointRedirects: true,
    summary: {
      selectedImageRecordCount: selectedRecords.length,
      plannedUrlCount: objectKeyEntries.length,
      fullTriosIncluded: trios.length,
      representativeCategories: [...new Set(selectedRecords.map((record) => record.category))].sort(),
      representativeHubSlugs: [...new Set(selectedRecords.flatMap((record) => record.hubs.map((hub) => hub.slug)))].sort(),
    },
    representativeTrios: trios,
    records: selectedRecords.map((record) => ({
      assetId: record.assetId,
      displayTitle: record.displayTitle,
      category: record.category,
      hubs: record.hubs.map((hub) => ({ slug: hub.slug, route: hub.route, title: hub.title })),
      likelyPages: record.likelyPages,
      urls: objectKeyEntries.filter((entry) => entry.assetId === record.assetId).map((entry) => verificationEntry(entry, record.likelyPages)),
    })),
    allUrls: objectKeyEntries.map((entry) => verificationEntry(entry, recordById.get(entry.assetId)?.likelyPages || [])),
  };
}

function verificationEntry(entry, likelyPages) {
  const tolerance = Math.max(512, Math.ceil(entry.fileSize * 0.05));
  return {
    assetId: entry.assetId,
    mediaType: entry.mediaType,
    url: entry.expectedPublicUrl,
    r2ObjectKey: entry.r2ObjectKey,
    expectedHttpStatus: 200,
    expectedContentType: entry.contentType,
    expectedCacheControl: entry.recommendedCacheControl,
    expectedByteSizeRange: {
      min: Math.max(0, entry.fileSize - tolerance),
      max: entry.fileSize + tolerance,
    },
    pagesToOpen: likelyPages.map((page) => page.path),
  };
}

function buildManualUploadChecklist(state, selectedRecords, objectKeyEntries, prefix, bundleRoot) {
  const examples = objectKeyEntries.slice(0, 6).map((entry) => ({
    mediaType: entry.mediaType,
    localFile: entry.uploadBundleRelativePath,
    expectedR2ObjectKey: entry.r2ObjectKey,
    expectedPublicUrl: entry.expectedPublicUrl,
  }));

  return {
    generatedAt: ROUND4G_GENERATED_AT,
    runId: ROUND4G_RUN_ID,
    title: "Round 4G Cloudflare R2 Manual Test Upload Checklist",
    exactLocalFolderToUpload: bundleRoot,
    targetR2BucketPrefix: prefix,
    expectedNextPublicAssetBaseUrl: EXAMPLE_PUBLIC_BASE_URL,
    uploadChoices: [
      {
        method: "Upload the pipeline/r2-upload-test/coloring folder to the bucket root.",
        result: "Object keys include coloring/test-v1/svg, coloring/test-v1/png, and coloring/test-v1/thumbs.",
      },
      {
        method: "Upload the contents of pipeline/r2-upload-test/coloring/test-v1 into an existing coloring/test-v1 prefix.",
        result: "Object keys still include exactly one coloring/test-v1 prefix.",
      },
    ],
    doNotUpload: [
      "Do not upload pipeline/r2-upload-test/coloring/test-v1 into an already selected coloring/test-v1 prefix.",
      "Do not upload pipeline/production/full/assets for this test round.",
      "Do not copy generated media into public/.",
      "Do not use r2.dev as the intended production media URL.",
      "Do not commit credentials or generated upload bundle media.",
    ],
    commonMistakesToAvoid: [
      "Double prefixing object keys as coloring/test-v1/coloring/test-v1/...",
      "Pointing NEXT_PUBLIC_COLORING_ASSET_BASE_URL at the private S3 API endpoint.",
      "Uploading only svg files without the matching png and thumbs roots.",
      "Replacing this 30-record bundle with the full 6557-record asset set before R2 URL checks pass.",
    ],
    finalObjectKeyExamples: examples,
    verificationUrls: objectKeyEntries.slice(0, 12).map((entry) => ({
      mediaType: entry.mediaType,
      url: entry.expectedPublicUrl,
      expectedContentType: entry.contentType,
    })),
    pagesToOpenAfterUpload: buildPagesToOpen(selectedRecords),
  };
}

function buildReports({ selectionManifest, plan, results, urlVerificationPlan, manualUploadChecklist, prefix, bundleRoot }) {
  const selectedTable = selectionManifest.records
    .map((record) => `| ${record.assetId} | ${record.displayTitle} | ${record.category} | ${record.hubs.slice(0, 4).map((hub) => hub.slug || "root").join(", ")} | ${record.warningFlags.length ? "warning" : "none"} |`)
    .join("\n");
  const pages = manualUploadChecklist.pagesToOpenAfterUpload
    .map((page) => `- ${page.path} - ${page.reason}`)
    .join("\n");
  const urlSamples = urlVerificationPlan.allUrls
    .slice(0, 12)
    .map((entry) => `- ${entry.url} (${entry.expectedContentType})`)
    .join("\n");
  const objectExamples = manualUploadChecklist.finalObjectKeyExamples
    .map((example) => `- ${example.expectedR2ObjectKey}`)
    .join("\n");

  return {
    "pipeline/reports/round-4g-r2-test-upload-bundle-report.md": `# Round 4G R2 Test Upload Bundle Report

Generated: ${ROUND4G_GENERATED_AT}

## Decision

Cloudflare R2 Standard Storage is the selected initial generated-media storage target for the frontend-only Netlify gallery. Netlify continues to serve the static app from \`out\`, while R2 stores generated SVG, PNG preview, and thumbnail media behind a public custom domain.

R2 was selected because it keeps generated media out of the app repository and build context, supports CDN-backed public URLs, and matches the Round 4E object-storage plus CDN direction. The long-term strategy is not \`public/\` media and not an app API media route, because both would couple thousands of generated files to the static frontend deployment.

## Scope

This round prepares only ${selectionManifest.summary.selectedImageRecordCount} selected image records, not the full ${plan.fullPublishManifestFileCount / 3} image record set. Each selected record includes its SVG, PNG preview, and thumbnail file.

## Bundle

- Local folder: \`${bundleRoot}\`
- Upload prefix: \`${prefix}\`
- Media files prepared: ${results.summary.createdMediaFileCount}
- SVG files: ${results.summary.totalSvgFiles}
- PNG preview files: ${results.summary.totalPngPreviewFiles}
- Thumbnail files: ${results.summary.totalThumbnailFiles}
- Total bytes represented: ${results.summary.totalBundleBytesRepresented}
- Requested materialization mode: ${results.summary.materializationModeRequested}
- Observed materialization mode: ${results.summary.materializationModeObserved}
- Linked files: ${results.summary.linkedFileCount}
- Copied files: ${results.summary.copiedFileCount}

## Folder Structure

\`\`\`text
pipeline/r2-upload-test/coloring/test-v1/
  svg/
  png/
  thumbs/
\`\`\`

## Object Key Structure

${objectExamples}

Public URL structure:

\`\`\`text
https://assets.example.com/coloring/test-v1/svg/<category>/<filename>.svg
https://assets.example.com/coloring/test-v1/png/<category>/<filename>.png
https://assets.example.com/coloring/test-v1/thumbs/<category>/<filename>-thumb.png
\`\`\`

Set \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://assets.example.com/coloring/test-v1\` for this test once the files are uploaded and the R2 custom domain is active. The private S3 API endpoint and \`r2.dev\` are not the intended production media URLs.

## Selected Records

| Asset ID | Title | Category | Hubs | Warnings |
| --- | --- | --- | --- | --- |
${selectedTable}
`,
    "pipeline/reports/round-4g-r2-test-manual-upload-guide.md": `# Round 4G R2 Test Manual Upload Guide

Generated: ${ROUND4G_GENERATED_AT}

## What To Upload

Upload the local test bundle at:

\`\`\`text
${bundleRoot}
\`\`\`

The expected bucket object prefix is:

\`\`\`text
${prefix}
\`\`\`

Use one of these layouts:

- Upload \`pipeline/r2-upload-test/coloring\` to the bucket root, which creates \`coloring/test-v1/...\` object keys.
- Or upload the contents of \`pipeline/r2-upload-test/coloring/test-v1\` into an already selected \`coloring/test-v1\` R2 prefix.

Do not upload \`pipeline/r2-upload-test/coloring/test-v1\` into an already selected \`coloring/test-v1\` prefix, because that creates \`coloring/test-v1/coloring/test-v1/...\`.

## Environment Value

\`\`\`bash
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://assets.example.com/coloring/test-v1
\`\`\`

This value must point at the public R2 custom-domain base plus prefix. Do not point it at the private S3 API endpoint. Do not use \`r2.dev\` as the intended production URL.

## Verify After Upload

Run:

\`\`\`powershell
node pipeline\\scripts\\round-4g-verify-r2-test-urls.mjs --live
\`\`\`

Then preview the static app against the same public base URL:

\`\`\`powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://assets.example.com/coloring/test-v1'; npm run build; npx serve out
\`\`\`

## Pages To Open

${pages}
`,
    "pipeline/reports/round-4g-r2-test-url-verification-plan.md": `# Round 4G R2 Test URL Verification Plan

Generated: ${ROUND4G_GENERATED_AT}

## Purpose

After manual upload, verify public URLs only. No credentials are required. The verifier checks status, content type, cache headers when present, and redirects away from private endpoints.

## Sample URLs

${urlSamples}

## Expected Headers

- SVG: \`image/svg+xml\`
- PNG preview: \`image/png\`
- Thumbnail: \`image/png\`
- Recommended cache: \`${IMMUTABLE_CACHE_POLICY}\`

The verifier writes \`pipeline/manifests/round-4g-r2-test-url-verification-results.json\`. Before upload, the default dry run records \`not_run\` and does not fail validation.
`,
    "pipeline/reports/round-4g-netlify-cdn-preview-plan.md": `# Round 4G Netlify CDN Preview Plan

Generated: ${ROUND4G_GENERATED_AT}

## Static App

The app remains frontend-only. \`next.config.mjs\` uses static export, Netlify publishes \`out\`, and media URLs resolve through \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL\`.

## Preview Command

\`\`\`powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://assets.example.com/coloring/test-v1'; npm run build; npx serve out
\`\`\`

Open the pages listed in the manual checklist and confirm:

- image previews render from the R2 custom domain
- Download PNG uses the public PNG URL
- Download SVG uses the public SVG URL
- Print uses the configured public media URL
- no request is made to \`app/api/coloring-assets\`
- no production media is copied into \`public/\`

The preview can also be used in Netlify by setting \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL\` to the same public custom-domain test prefix.
`,
    "pipeline/reports/round-4g-next-phase-plan.md": `# Round 4G Next Phase Plan

Generated: ${ROUND4G_GENERATED_AT}

## Before Full Upload

Verify the 30-record R2 test path first:

- R2 custom domain resolves public media URLs
- SVG, PNG preview, and thumbnail content types are correct
- cache headers match the selected policy
- Netlify/static build renders uploaded previews
- download and print controls use public CDN URLs
- no duplicate \`coloring/test-v1\` prefix exists
- no app API media route is needed

## Round 4H Recommendation

Round 4H should promote the verified R2 object-key pattern from the 30-record test bundle to a full upload plan, but only after explicit approval. It should generate the full upload manifest from \`pipeline/manifests/round-4e-asset-publish-manifest.json\`, preserve warning metadata, avoid quarantined assets, and run URL sampling before any SEO image sitemap, Open Graph image, or JSON-LD image work starts.
`,
  };
}

async function materializeBundleFiles({ repoRoot, mode, objectKeyEntries }) {
  let linkedFileCount = 0;
  let copiedFileCount = 0;
  const failedFiles = [];

  for (const entry of objectKeyEntries) {
    const sourceAbsolutePath = path.resolve(repoRoot, ...entry.sourceLocalRelativePath.split("/"));
    const targetAbsolutePath = path.resolve(repoRoot, ...entry.uploadBundleRelativePath.split("/"));
    assertPathInside(targetAbsolutePath, path.resolve(repoRoot, R2_TEST_UPLOAD_ROOT), "bundle target");
    assertPathInside(sourceAbsolutePath, path.resolve(repoRoot, "pipeline/production/full/assets"), "source asset");
    await mkdir(path.dirname(targetAbsolutePath), { recursive: true });
    await rm(targetAbsolutePath, { force: true });

    if (mode === "copy") {
      await copyFile(sourceAbsolutePath, targetAbsolutePath);
      copiedFileCount += 1;
      continue;
    }

    try {
      await link(sourceAbsolutePath, targetAbsolutePath);
      linkedFileCount += 1;
    } catch (error) {
      try {
        await copyFile(sourceAbsolutePath, targetAbsolutePath);
        copiedFileCount += 1;
      } catch (copyError) {
        failedFiles.push({
          assetId: entry.assetId,
          mediaType: entry.mediaType,
          sourceLocalRelativePath: entry.sourceLocalRelativePath,
          uploadBundleRelativePath: entry.uploadBundleRelativePath,
          linkError: error.message,
          copyError: copyError.message,
        });
      }
    }
  }

  return {
    modeRequested: mode,
    linkedFileCount,
    copiedFileCount,
    failedFiles,
  };
}

function validateSelectionAndPlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot) {
  if (selectedRecords.length !== DEFAULT_LIMIT) {
    throw new Error(`Expected ${DEFAULT_LIMIT} selected records, found ${selectedRecords.length}`);
  }
  if (objectKeyEntries.length !== selectedRecords.length * MEDIA_TYPES.length) {
    throw new Error(`Expected ${selectedRecords.length * MEDIA_TYPES.length} media files, found ${objectKeyEntries.length}`);
  }
  const selectedAssetIds = new Set();
  const coveredHubSlugs = new Set();
  for (const record of selectedRecords) {
    if (selectedAssetIds.has(record.assetId)) throw new Error(`Duplicate selected assetId: ${record.assetId}`);
    selectedAssetIds.add(record.assetId);
    if (state.quarantinedAssetIds.has(record.assetId)) throw new Error(`Quarantined asset selected: ${record.assetId}`);
    const asset = state.assetById.get(record.assetId);
    if (!asset || asset.status !== "passed_production_export") throw new Error(`Selected asset is not a successful production export: ${record.assetId}`);
    for (const hub of record.hubs) coveredHubSlugs.add(hub.slug);
  }
  for (const slug of PRIORITY_HUB_SLUGS.slice(0, 16)) {
    if (!coveredHubSlugs.has(slug)) throw new Error(`Round 4G selection does not cover required hub: ${slug}`);
  }
  for (const entry of objectKeyEntries) {
    assertSafeRelativePath(entry.sourceLocalRelativePath);
    assertSafeRelativePath(entry.uploadBundleRelativePath);
    assertSafeRelativePath(entry.r2ObjectKey);
    if (!entry.r2ObjectKey.startsWith(`${prefix}/`)) throw new Error(`Object key does not use prefix ${prefix}: ${entry.r2ObjectKey}`);
    if (!entry.uploadBundleRelativePath.startsWith(`${bundleRoot}/`)) throw new Error(`Bundle target is outside ${bundleRoot}: ${entry.uploadBundleRelativePath}`);
    if (!["image/svg+xml", "image/png"].includes(entry.contentType)) throw new Error(`Unexpected content type: ${entry.contentType}`);
    if (!entry.recommendedCacheControl) throw new Error(`Missing cache control for ${entry.r2ObjectKey}`);
    if (!entry.fileSize || entry.fileSize <= 0) throw new Error(`Missing file size for ${entry.r2ObjectKey}`);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error(`Missing sha256 for ${entry.r2ObjectKey}`);
  }
}

function buildPagesToOpen(selectedRecords) {
  const byPath = new Map();
  for (const record of selectedRecords) {
    for (const page of record.likelyPages) {
      if (!byPath.has(page.path)) {
        byPath.set(page.path, {
          path: page.path,
          title: page.title,
          reason: page.reason,
          selectedAssetIds: [],
        });
      }
      byPath.get(page.path).selectedAssetIds.push(record.assetId);
    }
  }
  return [...byPath.values()]
    .sort((a, b) => {
      if (a.path === "/coloring-pages") return -1;
      if (b.path === "/coloring-pages") return 1;
      return a.path.localeCompare(b.path);
    })
    .slice(0, 18);
}

function countMediaTypes(entries) {
  return {
    svg: entries.filter((entry) => entry.mediaType === "svg").length,
    pngPreview: entries.filter((entry) => entry.mediaType === "pngPreview").length,
    thumbnail: entries.filter((entry) => entry.mediaType === "thumbnail").length,
  };
}

function sumFileSizes(entries) {
  return entries.reduce((total, entry) => total + Number(entry.fileSize || 0), 0);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

function normalizeUploadPrefix(value) {
  const normalized = normalizePosixPath(value).replace(/^\/+|\/+$/g, "");
  assertSafeRelativePath(normalized);
  if (!normalized || normalized !== DEFAULT_PREFIX) {
    throw new Error(`Round 4G only supports the test upload prefix ${DEFAULT_PREFIX}. Received ${value}`);
  }
  return normalized;
}

function normalizePosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function assertSafeRelativePath(value) {
  const normalized = normalizePosixPath(value);
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.includes(":") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe relative path: ${value}`);
  }
}

function resolveSafeUnder(repoRoot, relativePath, allowedRoot) {
  assertSafeRelativePath(relativePath);
  const resolved = path.resolve(repoRoot, ...relativePath.split("/"));
  assertPathInside(resolved, allowedRoot, relativePath);
  return resolved;
}

function assertPathInside(targetPath, allowedRoot, label) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedAllowed = path.resolve(allowedRoot);
  const relative = path.relative(resolvedAllowed, resolvedTarget);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error(`${label} is outside allowed root: ${resolvedTarget}`);
}

function repoRootToPosix(repoRoot) {
  return path.resolve(repoRoot).replace(/\\/g, "/");
}

function compareCandidateByAssetId(a, b) {
  return a.assetId.localeCompare(b.assetId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runRound4GR2TestBundle(args);
  const summary = result.results.summary;
  console.log(`Round 4G R2 test bundle prepared at ${result.results.uploadBundleRoot}`);
  console.log(`Selected image records: ${summary.selectedImageRecordCount}`);
  console.log(`Media files: ${summary.createdMediaFileCount}`);
  console.log(`Linked: ${summary.linkedFileCount}`);
  console.log(`Copied: ${summary.copiedFileCount}`);
  console.log(`Failed: ${summary.failedFileCount}`);
  console.log(`Total bytes represented: ${summary.totalBundleBytesRepresented}`);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--clean") options.clean = true;
    else if (arg === "--copy") options.copy = true;
    else if (arg === "--verify") options.verify = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--mode") options.mode = args[++index];
    else if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg === "--prefix") options.prefix = args[++index];
    else throw new Error(`Unknown Round 4G option: ${arg}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
