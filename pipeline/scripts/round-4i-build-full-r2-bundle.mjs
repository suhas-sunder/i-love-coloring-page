import { copyFile, link, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export const ROUND4I_GENERATED_AT = "2026-05-10";
export const ROUND4I_RUN_ID = "round-4i-full-cloudflare-r2-upload-bundle";
export const FULL_R2_BUNDLE_ROOT = "pipeline/r2-upload/coloring-pages";

const DEFAULT_PREFIX = "coloring-pages";
const FULL_R2_UPLOAD_ROOT = "pipeline/r2-upload";
const PRODUCTION_ASSET_ROOT = "pipeline/production/full/assets";
const EXPECTED_IMAGE_RECORD_COUNT = 6557;
const EXPECTED_MEDIA_FILE_COUNT = 19671;
const EXPECTED_TOTAL_BYTES = 3148598669;
const EXAMPLE_PUBLIC_BASE_URL_PATTERN = "https://YOUR-ASSET-DOMAIN.com/coloring-pages";
const TEMPORARY_R2_DEV_BASE_URL = "https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages";
const IMMUTABLE_CACHE_POLICY = "public, max-age=31536000, immutable";

const INPUT_PATHS = {
  publishManifest: "pipeline/manifests/round-4e-asset-publish-manifest.json",
  productionAssets: "pipeline/manifests/round-3c-production-assets.json",
  productionQuarantine: "pipeline/manifests/round-3c-production-quarantine.json",
  fullUploadReadiness: "pipeline/manifests/round-4h-full-upload-readiness.json",
  r2UrlVerificationResults: "pipeline/manifests/round-4h-r2-url-verification-results.json",
  generatedItems: "src/generated/coloring/items.json",
  generatedHubs: "src/generated/coloring/hubs.json",
  generatedHubItems: "src/generated/coloring/hub-items.json",
  generatedRoutes: "src/generated/coloring/routes.json",
};

const MEDIA_TYPES = [
  { mediaType: "svg", root: "svg", contentType: "image/svg+xml" },
  { mediaType: "pngPreview", root: "png", contentType: "image/png" },
  { mediaType: "thumbnail", root: "thumbs", contentType: "image/png" },
];

export const ROUND4I_MANIFEST_FILES = [
  "pipeline/manifests/round-4i-env-safety-check.json",
  "pipeline/manifests/round-4i-full-r2-bundle-plan.json",
  "pipeline/manifests/round-4i-full-r2-object-key-map.json",
  "pipeline/manifests/round-4i-full-r2-bundle-results.json",
  "pipeline/manifests/round-4i-full-r2-url-verification-plan.json",
  "pipeline/manifests/round-4i-full-r2-manual-upload-checklist.json",
];

export const ROUND4I_REPORT_FILES = [
  "pipeline/reports/round-4i-env-safety-report.md",
  "pipeline/reports/round-4i-full-r2-bundle-report.md",
  "pipeline/reports/round-4i-full-r2-manual-upload-guide.md",
  "pipeline/reports/round-4i-full-r2-url-verification-plan.md",
  "pipeline/reports/round-4i-cache-header-production-note.md",
  "pipeline/reports/round-4i-next-phase-plan.md",
];

export async function runRound4IFullR2Bundle(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const prefix = normalizeUploadPrefix(options.prefix || DEFAULT_PREFIX);
  const mode = normalizeMode(options);
  const verify = Boolean(options.verify);
  const category = options.category ? normalizeCategory(options.category) : null;
  const limit = options.limit == null ? null : Number(options.limit);

  if (limit != null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`Round 4I limit must be a positive integer. Received ${options.limit}`);
  }

  const bundleRoot = path.posix.join(FULL_R2_UPLOAD_ROOT, prefix);
  const absoluteUploadRoot = resolveSafeUnder(repoRoot, FULL_R2_UPLOAD_ROOT, repoRoot);
  const absoluteBundleRoot = resolveSafeUnder(repoRoot, bundleRoot, absoluteUploadRoot);

  const state = await loadState(repoRoot, prefix, bundleRoot);
  const envSafety = await buildEnvSafetyCheck(repoRoot);
  validateReadiness(state, envSafety);

  const selectedRecords = selectSuccessfulRecords(state, { category, limit });
  const objectKeyEntries = buildObjectKeyEntries(state, selectedRecords, prefix, bundleRoot);
  validatePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, { category, limit });

  if (options.clean) {
    assertPathInside(absoluteBundleRoot, absoluteUploadRoot, "clean target");
    await rm(absoluteBundleRoot, { recursive: true, force: true });
  }

  await mkdir(absoluteBundleRoot, { recursive: true });
  const materialization = await materializeBundleFiles({
    repoRoot,
    mode,
    objectKeyEntries,
    uploadRoot: FULL_R2_UPLOAD_ROOT,
  });

  const plan = buildBundlePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, mode, { category, limit });
  const objectKeyMap = buildObjectKeyMap(objectKeyEntries, selectedRecords, prefix);
  const results = await buildBundleResults(state, selectedRecords, objectKeyEntries, materialization, prefix, bundleRoot, repoRoot);
  const urlVerificationPlan = buildUrlVerificationPlan(state, selectedRecords, objectKeyEntries, prefix);
  const manualUploadChecklist = buildManualUploadChecklist(objectKeyEntries, urlVerificationPlan, prefix, bundleRoot);

  const manifests = {
    "pipeline/manifests/round-4i-env-safety-check.json": envSafety,
    "pipeline/manifests/round-4i-full-r2-bundle-plan.json": plan,
    "pipeline/manifests/round-4i-full-r2-object-key-map.json": objectKeyMap,
    "pipeline/manifests/round-4i-full-r2-bundle-results.json": results,
    "pipeline/manifests/round-4i-full-r2-url-verification-plan.json": urlVerificationPlan,
    "pipeline/manifests/round-4i-full-r2-manual-upload-checklist.json": manualUploadChecklist,
  };
  const reports = buildReports({ envSafety, plan, objectKeyMap, results, urlVerificationPlan, manualUploadChecklist, prefix, bundleRoot });

  for (const [relativePath, payload] of Object.entries(manifests)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }

  if (verify) {
    validatePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, { category, limit });
  }

  return {
    state,
    envSafety,
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

  const assetById = new Map(inputs.productionAssets.assets.map((asset) => [asset.assetId, asset]));
  const itemById = new Map(inputs.generatedItems.items.map((item) => [item.assetId, item]));
  const quarantinedAssetIds = new Set((inputs.productionQuarantine.entries || []).map((entry) => entry.assetId));
  const hubById = new Map(inputs.generatedHubs.hubs.map((hub) => [hub.hubId, hub]));
  const hubItemsByAssetId = new Map(inputs.generatedHubItems.items.map((entry) => [entry.assetId, entry]));
  const routeByHubId = new Map(inputs.generatedRoutes.routes.map((route) => [route.hubId, route]));

  const candidates = [];
  for (const asset of inputs.productionAssets.assets) {
    if (asset.status !== "passed_production_export") continue;
    if (quarantinedAssetIds.has(asset.assetId)) continue;
    const item = itemById.get(asset.assetId);
    const mediaFiles = publishByAssetId.get(asset.assetId);
    if (!item || !mediaFiles || !MEDIA_TYPES.every((media) => mediaFiles.has(media.mediaType))) continue;
    candidates.push(buildCandidate({ asset, item, mediaFiles, hubItemsByAssetId, hubById, routeByHubId }));
  }
  candidates.sort((a, b) => a.assetId.localeCompare(b.assetId));

  return {
    repoRoot,
    prefix,
    bundleRoot,
    inputs,
    candidates,
    assetById,
    itemById,
    publishByAssetId,
    quarantinedAssetIds,
    hubById,
    hubItemsByAssetId,
    routeByHubId,
  };
}

function buildCandidate({ asset, item, mediaFiles, hubItemsByAssetId, hubById, routeByHubId }) {
  const hubItem = hubItemsByAssetId.get(item.assetId) || { hubIds: [] };
  const hubs = (hubItem.hubIds || [])
    .map((hubId) => hubById.get(hubId))
    .filter(Boolean)
    .map((hub) => {
      const route = routeByHubId.get(hub.hubId);
      return {
        hubId: hub.hubId,
        slug: hub.slug,
        title: hub.title,
        route: route?.path || hub.route || `/coloring-pages/${hub.slug}`,
        assetCount: hub.assetCount,
        firstPageIndex: Array.isArray(hub.assetIds) ? hub.assetIds.indexOf(item.assetId) : -1,
      };
    })
    .sort((a, b) => a.route.localeCompare(b.route));

  const likelyPages = hubs
    .filter((hub) => hub.firstPageIndex >= 0 && hub.firstPageIndex < 48)
    .slice(0, 8)
    .map((hub) => ({
      path: hub.route,
      title: hub.title,
      reason: "appears early in this generated hub gallery",
    }));
  if (!likelyPages.some((page) => page.path === "/coloring-pages")) {
    likelyPages.unshift({
      path: "/coloring-pages",
      title: "Coloring Pages",
      reason: "part of the approved production gallery data",
    });
  }

  const warningFlags = [...new Set([...(item.warningFlags || []), ...(asset.round3a1WarningFlags || [])])].sort();

  return {
    assetId: item.assetId,
    displayTitle: item.title,
    category: item.categorySlug,
    filenameSlug: item.filenameSlug,
    warningFlags,
    hubs,
    likelyPages,
    mediaFiles,
    asset,
    item,
  };
}

async function buildEnvSafetyCheck(repoRoot) {
  const envLocalTracked = (await gitOutput(repoRoot, ["ls-files", "--", ".env.local"])).trim().length > 0;
  const envLocalIgnore = (await gitOutput(repoRoot, ["check-ignore", ".env.local"])).trim();
  const envIgnore = (await gitOutput(repoRoot, ["check-ignore", ".env"])).trim();
  const envDevelopmentLocalIgnore = (await gitOutput(repoRoot, ["check-ignore", ".env.development.local"])).trim();
  const envProductionLocalIgnore = (await gitOutput(repoRoot, ["check-ignore", ".env.production.local"])).trim();
  const gitignore = await readFile(path.join(repoRoot, ".gitignore"), "utf8");

  return {
    generatedAt: ROUND4I_GENERATED_AT,
    runId: ROUND4I_RUN_ID,
    checks: {
      envLocalTracked,
      envLocalIgnored: envLocalIgnore === ".env.local",
      envIgnored: envIgnore === ".env",
      envDevelopmentLocalIgnored: envDevelopmentLocalIgnore === ".env.development.local",
      envProductionLocalIgnored: envProductionLocalIgnore === ".env.production.local",
      gitignoreKeepsEnvPrivate: /^\.env$/m.test(gitignore) && /^\.env\*\.local$/m.test(gitignore),
      noCredentialsRequiredForThisRound: true,
      credentialsPrinted: false,
      credentialsWritten: false,
    },
    valid:
      !envLocalTracked &&
      envLocalIgnore === ".env.local" &&
      envIgnore === ".env" &&
      envDevelopmentLocalIgnore === ".env.development.local" &&
      envProductionLocalIgnore === ".env.production.local" &&
      /^\.env$/m.test(gitignore) &&
      /^\.env\*\.local$/m.test(gitignore),
    remediation: envLocalTracked
      ? "Remove .env.local from Git tracking without deleting the local file before committing."
      : "No action required. .env.local is ignored and untracked.",
  };
}

function selectSuccessfulRecords(state, { category, limit }) {
  let records = state.candidates;
  if (category) records = records.filter((record) => record.category === category);
  if (limit != null) records = records.slice(0, limit);
  return records;
}

function buildObjectKeyEntries(state, selectedRecords, prefix, bundleRoot) {
  const entries = [];
  const recordByAssetId = new Map(selectedRecords.map((record) => [record.assetId, record]));
  for (const record of selectedRecords) {
    const mediaFiles = state.publishByAssetId.get(record.assetId);
    for (const media of MEDIA_TYPES) {
      const publishFile = mediaFiles.get(media.mediaType);
      const cdnRelativePath = normalizePosixPath(publishFile.cdnRelativePath);
      const sourceLocalRelativePath = normalizePosixPath(publishFile.localRelativePath);
      const r2ObjectKey = path.posix.join(prefix, cdnRelativePath);
      const uploadBundleRelativePath = path.posix.join(FULL_R2_UPLOAD_ROOT, r2ObjectKey);
      const sourceFilename = sourceLocalRelativePath.split("/").at(-1);
      const targetFilename = uploadBundleRelativePath.split("/").at(-1);

      entries.push({
        assetId: record.assetId,
        displayTitle: record.displayTitle,
        category: record.category,
        mediaType: media.mediaType,
        sourceLocalRelativePath,
        uploadBundleRelativePath,
        r2ObjectKey,
        cdnRelativePath,
        expectedPublicUrlPattern: `\${NEXT_PUBLIC_COLORING_ASSET_BASE_URL}/${cdnRelativePath}`,
        contentType: publishFile.contentType || media.contentType,
        recommendedCacheControl: publishFile.cachePolicy || IMMUTABLE_CACHE_POLICY,
        fileSize: publishFile.fileSize,
        sha256: publishFile.sha256,
        status: "ready",
        filenamePreserved: sourceFilename === targetFilename,
      });
    }
  }
  return entries.sort((a, b) => {
    const aRecord = recordByAssetId.get(a.assetId);
    const bRecord = recordByAssetId.get(b.assetId);
    if (aRecord.category !== bRecord.category) return aRecord.category.localeCompare(bRecord.category);
    if (a.assetId !== b.assetId) return a.assetId.localeCompare(b.assetId);
    return mediaTypeOrder(a.mediaType) - mediaTypeOrder(b.mediaType);
  });
}

function buildBundlePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, mode, filters) {
  const counts = countMediaTypes(objectKeyEntries);
  const expectedFullRun = !filters.category && filters.limit == null;
  return {
    generatedAt: ROUND4I_GENERATED_AT,
    runId: ROUND4I_RUN_ID,
    uploadBundleRoot: bundleRoot,
    uploadPrefix: prefix,
    expectedPublicBaseUrlPattern: EXAMPLE_PUBLIC_BASE_URL_PATTERN,
    temporaryTestBaseUrl: TEMPORARY_R2_DEV_BASE_URL,
    r2DevProductionRecommendation: "temporary-test-only",
    hardlinkOrCopyModeUsed: mode,
    sourceManifest: INPUT_PATHS.publishManifest,
    readinessSource: INPUT_PATHS.fullUploadReadiness,
    filters: {
      category: filters.category || null,
      limit: filters.limit || null,
      fullRun: expectedFullRun,
    },
    expectedFullBundle: {
      imageRecordCount: EXPECTED_IMAGE_RECORD_COUNT,
      mediaFileCount: EXPECTED_MEDIA_FILE_COUNT,
      svgFileCount: EXPECTED_IMAGE_RECORD_COUNT,
      pngPreviewFileCount: EXPECTED_IMAGE_RECORD_COUNT,
      thumbnailFileCount: EXPECTED_IMAGE_RECORD_COUNT,
      totalBytesRepresented: EXPECTED_TOTAL_BYTES,
    },
    summary: {
      totalImageRecordsPlanned: selectedRecords.length,
      totalMediaFilesPlanned: objectKeyEntries.length,
      totalBytesRepresented: sumFileSizes(objectKeyEntries),
      totalSvgFiles: counts.svg,
      totalPngPreviewFiles: counts.pngPreview,
      totalThumbnailFiles: counts.thumbnail,
      skippedFiles: [],
      invalidFiles: [],
      successfulProductionAssetsIncluded: selectedRecords.length,
      quarantinedAssetsIncluded: 0,
      sourceImagesIncluded: 0,
      oldPrefixIncluded: false,
      filenamesPreserved: objectKeyEntries.every((entry) => entry.filenamePreserved),
    },
    safetyChecks: {
      writesOnlyUnder: FULL_R2_UPLOAD_ROOT,
      deletesOnlyUnder: bundleRoot,
      sourceAssetRootReadOnly: PRODUCTION_ASSET_ROOT,
      publicFolderExcluded: true,
      noUploadPerformed: true,
      noCredentialsRequired: true,
    },
  };
}

function buildObjectKeyMap(objectKeyEntries, selectedRecords, prefix) {
  return {
    generatedAt: ROUND4I_GENERATED_AT,
    runId: ROUND4I_RUN_ID,
    uploadPrefix: prefix,
    summary: {
      imageRecordCount: selectedRecords.length,
      mediaFileCount: objectKeyEntries.length,
      totalBytesRepresented: sumFileSizes(objectKeyEntries),
      svgFileCount: objectKeyEntries.filter((entry) => entry.mediaType === "svg").length,
      pngPreviewFileCount: objectKeyEntries.filter((entry) => entry.mediaType === "pngPreview").length,
      thumbnailFileCount: objectKeyEntries.filter((entry) => entry.mediaType === "thumbnail").length,
    },
    entries: objectKeyEntries,
  };
}

async function buildBundleResults(state, selectedRecords, objectKeyEntries, materialization, prefix, bundleRoot, repoRoot) {
  const publicFolderHasProductionMedia = await publicFolderHasGeneratedMedia(repoRoot);
  const gitStatuses = {
    images: await gitOutput(repoRoot, ["status", "--short", "--", "images"]),
    productionFull: await gitOutput(repoRoot, ["status", "--short", "--", "pipeline/production/full"]),
  };
  const counts = countMediaTypes(objectKeyEntries);
  return {
    generatedAt: ROUND4I_GENERATED_AT,
    runId: ROUND4I_RUN_ID,
    uploadBundleRoot: bundleRoot,
    uploadPrefix: prefix,
    summary: {
      imageRecordCount: selectedRecords.length,
      createdMediaFileCount: materialization.linkedFileCount + materialization.copiedFileCount,
      linkedFileCount: materialization.linkedFileCount,
      copiedFileCount: materialization.copiedFileCount,
      failedFileCount: materialization.failedFiles.length,
      totalBundleBytesRepresented: sumFileSizes(objectKeyEntries),
      totalSvgFiles: counts.svg,
      totalPngPreviewFiles: counts.pngPreview,
      totalThumbnailFiles: counts.thumbnail,
      materializationModeRequested: materialization.modeRequested,
      materializationModeObserved: materialization.copiedFileCount > 0 ? "copy" : "hardlink",
    },
    failedFiles: materialization.failedFiles,
    safetyChecks: {
      sourceAssetImmutabilityConfirmed: gitStatuses.productionFull.trim() === "",
      sourceImagesUnchangedConfirmed: gitStatuses.images.trim() === "",
      publicFolderExclusionConfirmed: !publicFolderHasProductionMedia,
      oldPrefixExcluded: objectKeyEntries.every((entry) => !entry.r2ObjectKey.includes("test-v1")),
      filenamePreservationConfirmed: objectKeyEntries.every((entry) => entry.filenamePreserved),
      sourceImagesIncluded: false,
      remoteUploadPerformed: false,
      credentialsRequired: false,
    },
  };
}

function buildUrlVerificationPlan(state, selectedRecords, objectKeyEntries, prefix) {
  const recordByAssetId = new Map(selectedRecords.map((record) => [record.assetId, record]));
  const entryByAssetId = groupEntriesByAssetId(objectKeyEntries);
  const selectedForVerification = selectVerificationRecords(state, selectedRecords);
  const urls = [];
  for (const record of selectedForVerification) {
    const entries = entryByAssetId.get(record.assetId) || [];
    for (const entry of entries) {
      urls.push(verificationEntry(entry, record));
    }
  }

  return {
    generatedAt: ROUND4I_GENERATED_AT,
    runId: ROUND4I_RUN_ID,
    purpose: "Representative public URL checks to run after the full R2 bundle is manually uploaded.",
    uploadPrefix: prefix,
    expectedPublicBaseUrlPattern: EXAMPLE_PUBLIC_BASE_URL_PATTERN,
    expectedStatus: 200,
    expectedNoPrivateEndpointRedirects: true,
    cacheHeaderProductionRequirement: IMMUTABLE_CACHE_POLICY,
    summary: {
      representativeTriosPlanned: selectedForVerification.length,
      plannedUrlCount: urls.length,
      totalSvgUrls: urls.filter((entry) => entry.mediaType === "svg").length,
      totalPngPreviewUrls: urls.filter((entry) => entry.mediaType === "pngPreview").length,
      totalThumbnailUrls: urls.filter((entry) => entry.mediaType === "thumbnail").length,
      representativeCategories: [...new Set(selectedForVerification.map((record) => record.category))].sort(),
      representativeHubSlugs: [...new Set(selectedForVerification.flatMap((record) => record.hubs.map((hub) => hub.slug || "root")))].sort(),
      warningAssetCount: selectedForVerification.filter((record) => record.warningFlags.length > 0).length,
    },
    representativeTrios: selectedForVerification.map((record) => ({
      assetId: record.assetId,
      displayTitle: record.displayTitle,
      category: record.category,
      warningFlags: record.warningFlags,
      hubs: record.hubs.map((hub) => ({ slug: hub.slug, route: hub.route, title: hub.title })),
      likelyPages: record.likelyPages,
      urls: (entryByAssetId.get(record.assetId) || []).map((entry) => verificationEntry(entry, record)),
    })),
    urls,
    allPlannedRecordCount: recordByAssetId.size,
  };
}

function verificationEntry(entry, record) {
  const tolerance = Math.max(512, Math.ceil(entry.fileSize * 0.05));
  return {
    assetId: entry.assetId,
    displayTitle: entry.displayTitle,
    category: entry.category,
    mediaType: entry.mediaType,
    relativeAssetPath: entry.cdnRelativePath,
    r2ObjectKey: entry.r2ObjectKey,
    expectedPublicUrlPattern: entry.expectedPublicUrlPattern,
    expectedHttpStatus: 200,
    expectedContentType: entry.contentType,
    expectedCacheControl: entry.recommendedCacheControl,
    expectedByteSizeRange: {
      min: Math.max(1, entry.fileSize - tolerance),
      max: entry.fileSize + tolerance,
    },
    likelyPages: record.likelyPages.map((page) => page.path),
  };
}

function buildManualUploadChecklist(objectKeyEntries, urlVerificationPlan, prefix, bundleRoot) {
  const examples = objectKeyEntries.slice(0, 9).map((entry) => ({
    mediaType: entry.mediaType,
    localFile: entry.uploadBundleRelativePath,
    expectedR2ObjectKey: entry.r2ObjectKey,
    expectedPublicUrlPattern: entry.expectedPublicUrlPattern,
    contentType: entry.contentType,
    recommendedCacheControl: entry.recommendedCacheControl,
  }));

  return {
    generatedAt: ROUND4I_GENERATED_AT,
    runId: ROUND4I_RUN_ID,
    title: "Round 4I Full Cloudflare R2 Manual Upload Checklist",
    exactLocalFolderToUpload: bundleRoot,
    targetR2BucketPrefix: prefix,
    expectedNextPublicAssetBaseUrlPattern: EXAMPLE_PUBLIC_BASE_URL_PATTERN,
    uploadFolderChoice: {
      recommended: "Upload the coloring-pages folder to the bucket object-key root.",
      result: "Final object keys begin with coloring-pages/svg, coloring-pages/png, and coloring-pages/thumbs.",
      alternative: "If the dashboard or tool is already positioned inside a coloring-pages prefix, upload the contents of the local coloring-pages folder.",
    },
    doNotUpload: [
      "Do not upload the local folder into a destination that already creates the same parent prefix.",
      "Do not copy generated media into public/.",
      "Do not treat the temporary r2.dev route as the final production asset URL.",
      "Do not commit generated upload bundle media.",
      "Do not add credentials to the repository.",
    ],
    commonMistakesToAvoid: [
      "Creating a repeated coloring-pages parent in object keys.",
      "Uploading svg, png, and thumbs without the coloring-pages parent when the app base URL includes that prefix.",
      "Leaving cache headers or equivalent Cloudflare caching behavior unset for production.",
      "Using the temporary r2.dev host as the final production media domain.",
    ],
    finalObjectKeyExamples: examples,
    verificationUrls: urlVerificationPlan.urls.slice(0, 30).map((entry) => ({
      mediaType: entry.mediaType,
      expectedPublicUrlPattern: entry.expectedPublicUrlPattern,
      expectedContentType: entry.expectedContentType,
    })),
    previewCommands: {
      build: "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://YOUR-ASSET-DOMAIN.com/coloring-pages'; npm run build",
      staticPreview: "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://YOUR-ASSET-DOMAIN.com/coloring-pages'; npm run build; npx serve out -l 3005",
    },
    pagesToOpenAfterUpload: buildPagesToOpen(urlVerificationPlan.representativeTrios),
  };
}

function buildReports({ envSafety, plan, objectKeyMap, results, urlVerificationPlan, manualUploadChecklist, prefix, bundleRoot }) {
  const examples = manualUploadChecklist.finalObjectKeyExamples
    .slice(0, 6)
    .map((example) => `- \`${example.expectedR2ObjectKey}\` (${example.contentType})`)
    .join("\n");
  const pages = manualUploadChecklist.pagesToOpenAfterUpload
    .slice(0, 18)
    .map((page) => `- \`${page.path}\` - ${page.reason}`)
    .join("\n");
  const sampleUrls = urlVerificationPlan.urls
    .slice(0, 12)
    .map((entry) => `- \`${entry.expectedPublicUrlPattern}\` (${entry.expectedContentType})`)
    .join("\n");

  return {
    "pipeline/reports/round-4i-env-safety-report.md": `# Round 4I Env Safety Report

Generated: ${ROUND4I_GENERATED_AT}

## Result

- .env.local tracked by Git: ${envSafety.checks.envLocalTracked}
- .env.local ignored: ${envSafety.checks.envLocalIgnored}
- .env ignored: ${envSafety.checks.envIgnored}
- .env*.local ignored: ${envSafety.checks.envDevelopmentLocalIgnored && envSafety.checks.envProductionLocalIgnored}
- Credentials required for this round: false
- Credentials written: false

${envSafety.remediation}
`,
    "pipeline/reports/round-4i-full-r2-bundle-report.md": `# Round 4I Full R2 Bundle Report

Generated: ${ROUND4I_GENERATED_AT}

## Scope

Round 4I prepares the complete Cloudflare R2 upload folder after the 30-record Round 4H public URL test passed. It does not upload files, does not rename generated media, and does not copy production media into \`public/\`.

## Bundle

- Local folder: \`${bundleRoot}\`
- Upload prefix: \`${prefix}\`
- Image records: ${plan.summary.totalImageRecordsPlanned}
- Media files: ${plan.summary.totalMediaFilesPlanned}
- SVG files: ${plan.summary.totalSvgFiles}
- PNG preview files: ${plan.summary.totalPngPreviewFiles}
- Thumbnail files: ${plan.summary.totalThumbnailFiles}
- Total bytes represented: ${plan.summary.totalBytesRepresented}
- Requested mode: ${results.summary.materializationModeRequested}
- Linked files: ${results.summary.linkedFileCount}
- Copied files: ${results.summary.copiedFileCount}
- Failed files: ${results.summary.failedFileCount}

## Folder Structure

\`\`\`text
pipeline/r2-upload/coloring-pages/
  svg/
  png/
  thumbs/
\`\`\`

## Object Keys

${examples}

Public URL pattern:

\`\`\`text
https://YOUR-ASSET-DOMAIN.com/coloring-pages/{svg|png|thumbs}/<category>/<filename>
\`\`\`

Set \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages\` after manual upload to a production custom asset domain. The temporary r2.dev route remains acceptable only for testing.
`,
    "pipeline/reports/round-4i-full-r2-manual-upload-guide.md": `# Round 4I Full R2 Manual Upload Guide

Generated: ${ROUND4I_GENERATED_AT}

## What To Upload

Upload:

\`\`\`text
${bundleRoot}
\`\`\`

The final R2 object keys must begin with:

\`\`\`text
${prefix}/
\`\`\`

Recommended layout: upload the local \`coloring-pages\` folder to the object-key root so the bucket contains \`coloring-pages/svg\`, \`coloring-pages/png\`, and \`coloring-pages/thumbs\`.

If your upload UI is already positioned inside a \`coloring-pages\` destination prefix, upload only the contents of the local \`coloring-pages\` folder. This avoids a repeated parent prefix.

## Environment Value

\`\`\`bash
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages
\`\`\`

Use a custom asset domain for production. The temporary r2.dev route is not the production recommendation.

## Preview After Upload

\`\`\`powershell
$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='https://YOUR-ASSET-DOMAIN.com/coloring-pages'; npm run build; npx serve out -l 3005
\`\`\`

Open the representative pages below and verify previews, PNG downloads, SVG downloads, and print behavior.

${pages}
`,
    "pipeline/reports/round-4i-full-r2-url-verification-plan.md": `# Round 4I Full R2 URL Verification Plan

Generated: ${ROUND4I_GENERATED_AT}

## Purpose

After the full manual upload, verify public URLs only. No R2 credentials are required. The plan includes ${urlVerificationPlan.summary.representativeTriosPlanned} representative SVG, PNG preview, and thumbnail trios, for ${urlVerificationPlan.summary.plannedUrlCount} URLs.

## Sample URL Patterns

${sampleUrls}

## Expected Results

- HTTP status: 200
- SVG content type: \`image/svg+xml\`
- PNG content type: \`image/png\`
- Recommended cache header: \`${IMMUTABLE_CACHE_POLICY}\`
- No private endpoint redirects
- No repeated upload prefix

Run:

\`\`\`powershell
node pipeline\\scripts\\round-4i-verify-full-r2-urls.mjs --live
\`\`\`

Before upload, run without \`--live\` to record a safe \`not_run\` result.
`,
    "pipeline/reports/round-4i-cache-header-production-note.md": `# Round 4I Cache Header Production Note

Generated: ${ROUND4I_GENERATED_AT}

Round 4H verified the temporary R2 public route, but those temporary test URLs did not return cache headers. That was acceptable for delivery verification.

Before production launch, configure cache headers or equivalent Cloudflare caching behavior for generated media and verify the public responses. The recommended policy for immutable generated files is:

\`\`\`text
${IMMUTABLE_CACHE_POLICY}
\`\`\`

This check must pass before SEO image sitemap or Open Graph image work starts.
`,
    "pipeline/reports/round-4i-next-phase-plan.md": `# Round 4I Next Phase Plan

Generated: ${ROUND4I_GENERATED_AT}

## Round 4J Recommendation

Round 4J should manually upload the prepared full bundle or explicitly approve a scripted upload, then verify a representative public URL sample from \`pipeline/manifests/round-4i-full-r2-url-verification-plan.json\`.

Do not begin image sitemap, Open Graph image, or JSON-LD image work until the full uploaded media set is verified against public URLs and cache behavior is confirmed.

Production should use a custom asset domain with:

\`\`\`bash
NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https://YOUR-ASSET-DOMAIN.com/coloring-pages
\`\`\`

Generated filenames were preserved in this round. Any naming cleanup should be a separate future round.
`,
  };
}

async function materializeBundleFiles({ repoRoot, mode, objectKeyEntries, uploadRoot }) {
  let linkedFileCount = 0;
  let copiedFileCount = 0;
  const failedFiles = [];

  for (const entry of objectKeyEntries) {
    const sourceAbsolutePath = path.resolve(repoRoot, ...entry.sourceLocalRelativePath.split("/"));
    const targetAbsolutePath = path.resolve(repoRoot, ...entry.uploadBundleRelativePath.split("/"));
    assertPathInside(sourceAbsolutePath, path.resolve(repoRoot, PRODUCTION_ASSET_ROOT), "source asset");
    assertPathInside(targetAbsolutePath, path.resolve(repoRoot, uploadRoot), "bundle target");
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
      failedFiles.push({
        assetId: entry.assetId,
        mediaType: entry.mediaType,
        sourceLocalRelativePath: entry.sourceLocalRelativePath,
        uploadBundleRelativePath: entry.uploadBundleRelativePath,
        error: error.message,
      });
      break;
    }
  }

  if (failedFiles.length && mode === "hardlink") {
    throw new Error("Hardlink materialization failed. Re-run with --copy only if you explicitly want to duplicate the selected media files.");
  }

  return {
    modeRequested: mode,
    linkedFileCount,
    copiedFileCount,
    failedFiles,
  };
}

function validateReadiness(state, envSafety) {
  const readiness = state.inputs.fullUploadReadiness;
  const verification = state.inputs.r2UrlVerificationResults;
  if (!envSafety.valid) throw new Error("Round 4I env safety check failed.");
  if (readiness.full_upload_bundle_ready !== true) throw new Error("Round 4H did not mark full_upload_bundle_ready true.");
  if (readiness.recommendedFullUploadPrefix !== "coloring-pages/") throw new Error("Round 4H did not recommend the coloring-pages prefix.");
  if (verification.status !== "passed") throw new Error("Round 4H URL verification did not pass.");
  if (verification.summary?.failed !== 0 || verification.summary?.passed !== 90) throw new Error("Round 4H URL verification counts are not the expected 90 passed and 0 failed.");
  if (verification.summary?.oldPrefixFailures !== 0) throw new Error("Round 4H verification still contains old prefix failures.");
  if (state.inputs.generatedRoutes.routes.length !== 65) throw new Error("Sitemap route count changed before Round 4I.");
}

function validatePlan(state, selectedRecords, objectKeyEntries, prefix, bundleRoot, filters) {
  if (!filters.category && filters.limit == null) {
    if (selectedRecords.length !== EXPECTED_IMAGE_RECORD_COUNT) {
      throw new Error(`Expected ${EXPECTED_IMAGE_RECORD_COUNT} image records, found ${selectedRecords.length}`);
    }
    if (objectKeyEntries.length !== EXPECTED_MEDIA_FILE_COUNT) {
      throw new Error(`Expected ${EXPECTED_MEDIA_FILE_COUNT} media files, found ${objectKeyEntries.length}`);
    }
    if (sumFileSizes(objectKeyEntries) !== EXPECTED_TOTAL_BYTES) {
      throw new Error(`Expected ${EXPECTED_TOTAL_BYTES} bytes represented, found ${sumFileSizes(objectKeyEntries)}`);
    }
  }

  const seenByAsset = new Map();
  for (const record of selectedRecords) {
    if (state.quarantinedAssetIds.has(record.assetId)) throw new Error(`Quarantined asset included: ${record.assetId}`);
    const asset = state.assetById.get(record.assetId);
    if (!asset || asset.status !== "passed_production_export") throw new Error(`Non-successful asset included: ${record.assetId}`);
  }

  for (const entry of objectKeyEntries) {
    assertSafeRelativePath(entry.sourceLocalRelativePath);
    assertSafeRelativePath(entry.uploadBundleRelativePath);
    assertSafeRelativePath(entry.r2ObjectKey);
    assertSafeRelativePath(entry.cdnRelativePath);
    if (!entry.sourceLocalRelativePath.startsWith(`${PRODUCTION_ASSET_ROOT}/`)) throw new Error(`Invalid source path: ${entry.sourceLocalRelativePath}`);
    if (!entry.uploadBundleRelativePath.startsWith(`${bundleRoot}/`)) throw new Error(`Invalid bundle path: ${entry.uploadBundleRelativePath}`);
    if (!entry.r2ObjectKey.startsWith(`${prefix}/`)) throw new Error(`Invalid R2 prefix: ${entry.r2ObjectKey}`);
    if (entry.r2ObjectKey.includes("test-v1")) throw new Error(`Old test prefix appeared in ${entry.r2ObjectKey}`);
    if (entry.r2ObjectKey.includes("coloring-pages/coloring-pages")) throw new Error(`Repeated prefix appeared in ${entry.r2ObjectKey}`);
    if (!["image/svg+xml", "image/png"].includes(entry.contentType)) throw new Error(`Unexpected content type ${entry.contentType}`);
    if (!entry.recommendedCacheControl) throw new Error(`Missing cache control for ${entry.r2ObjectKey}`);
    if (!entry.fileSize || entry.fileSize <= 0) throw new Error(`Missing file size for ${entry.r2ObjectKey}`);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error(`Missing sha256 for ${entry.r2ObjectKey}`);
    if (!entry.filenamePreserved) throw new Error(`Filename was not preserved for ${entry.r2ObjectKey}`);

    const mediaTypes = seenByAsset.get(entry.assetId) || new Set();
    mediaTypes.add(entry.mediaType);
    seenByAsset.set(entry.assetId, mediaTypes);
  }

  for (const [assetId, mediaTypes] of seenByAsset) {
    if (!MEDIA_TYPES.every((media) => mediaTypes.has(media.mediaType))) {
      throw new Error(`Asset is missing a media trio: ${assetId}`);
    }
  }
}

function selectVerificationRecords(state, selectedRecords) {
  const selected = [];
  const selectedAssetIds = new Set();
  const candidateById = new Map(selectedRecords.map((record) => [record.assetId, record]));

  function add(record) {
    if (!record || selectedAssetIds.has(record.assetId)) return;
    selected.push(record);
    selectedAssetIds.add(record.assetId);
  }

  const hubsByVolume = [...state.inputs.generatedHubs.hubs].sort((a, b) => {
    if (b.assetCount !== a.assetCount) return b.assetCount - a.assetCount;
    return a.slug.localeCompare(b.slug);
  });
  for (const hub of hubsByVolume) {
    const assetId = (hub.assetIds || []).find((id) => candidateById.has(id) && !selectedAssetIds.has(id));
    add(candidateById.get(assetId));
  }

  for (const record of selectedRecords.filter((record) => record.warningFlags.length > 0)) add(record);
  for (const record of selectedRecords) add(record);

  return selected.slice(0, 100);
}

function buildPagesToOpen(representativeTrios) {
  const byPath = new Map();
  for (const record of representativeTrios) {
    for (const page of record.likelyPages) {
      if (!byPath.has(page.path)) {
        byPath.set(page.path, {
          path: page.path,
          title: page.title,
          reason: page.reason,
          assetIds: [],
        });
      }
      byPath.get(page.path).assetIds.push(record.assetId);
    }
  }
  return [...byPath.values()].sort((a, b) => {
    if (a.path === "/coloring-pages") return -1;
    if (b.path === "/coloring-pages") return 1;
    return a.path.localeCompare(b.path);
  });
}

function groupEntriesByAssetId(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const assetEntries = grouped.get(entry.assetId) || [];
    assetEntries.push(entry);
    grouped.set(entry.assetId, assetEntries);
  }
  for (const assetEntries of grouped.values()) {
    assetEntries.sort((a, b) => mediaTypeOrder(a.mediaType) - mediaTypeOrder(b.mediaType));
  }
  return grouped;
}

function countMediaTypes(entries) {
  return {
    svg: entries.filter((entry) => entry.mediaType === "svg").length,
    pngPreview: entries.filter((entry) => entry.mediaType === "pngPreview").length,
    thumbnail: entries.filter((entry) => entry.mediaType === "thumbnail").length,
  };
}

function sumFileSizes(entries) {
  return entries.reduce((sum, entry) => sum + Number(entry.fileSize || 0), 0);
}

function mediaTypeOrder(mediaType) {
  return MEDIA_TYPES.findIndex((media) => media.mediaType === mediaType);
}

async function publicFolderHasGeneratedMedia(repoRoot) {
  const publicRoot = path.join(repoRoot, "public");
  const files = await listFilesIfExists(publicRoot);
  return files.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(path.relative(publicRoot, file)));
}

async function listFilesIfExists(root) {
  try {
    await stat(root);
  } catch {
    return [];
  }
  const results = [];
  async function walk(directory) {
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(directory, { withFileTypes: true }));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(entryPath);
    }
  }
  await walk(root);
  return results;
}

async function gitOutput(repoRoot, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
    return stdout;
  } catch (error) {
    if (error.stdout) return error.stdout;
    return "";
  }
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

function normalizeMode(options) {
  if (options.copy) return "copy";
  const mode = options.mode || "hardlink";
  if (mode !== "hardlink") {
    throw new Error("Round 4I defaults to hardlink mode. Use --copy to explicitly allow file copies.");
  }
  return "hardlink";
}

function normalizeUploadPrefix(value) {
  const normalized = normalizePosixPath(value).replace(/^\/+|\/+$/g, "");
  assertSafeRelativePath(normalized);
  if (normalized !== DEFAULT_PREFIX) {
    throw new Error(`Round 4I only supports the verified upload prefix ${DEFAULT_PREFIX}. Received ${value}`);
  }
  return normalized;
}

function normalizeCategory(value) {
  const normalized = normalizePosixPath(value).replace(/^\/+|\/+$/g, "");
  assertSafeRelativePath(normalized);
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

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--clean") options.clean = true;
    else if (arg === "--copy") options.copy = true;
    else if (arg === "--verify") options.verify = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--mode") options.mode = args[++index];
    else if (arg === "--prefix") options.prefix = args[++index];
    else if (arg === "--limit") options.limit = Number(args[++index]);
    else if (arg === "--category") options.category = args[++index];
    else throw new Error(`Unknown Round 4I option: ${arg}`);
  }
  return options;
}

async function main() {
  const result = await runRound4IFullR2Bundle(parseArgs(process.argv.slice(2)));
  const summary = result.results.summary;
  console.log(`Round 4I full R2 bundle prepared at ${result.results.uploadBundleRoot}`);
  console.log(`Image records: ${summary.imageRecordCount}`);
  console.log(`Media files: ${summary.createdMediaFileCount}`);
  console.log(`Linked: ${summary.linkedFileCount}`);
  console.log(`Copied: ${summary.copiedFileCount}`);
  console.log(`Failed: ${summary.failedFileCount}`);
  console.log(`Total bytes represented: ${summary.totalBundleBytesRepresented}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
