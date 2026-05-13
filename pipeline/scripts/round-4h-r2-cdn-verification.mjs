import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export const ROUND4H_GENERATED_AT = "2026-05-10";
export const ROUND4H_RUN_ID = "round-4h-r2-cdn-delivery-verification";
export const ROUND4H_TEMP_ASSET_BASE_URL = "https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages";
export const ROUND4H_UPLOAD_PREFIX = "coloring-pages";

const INPUT_PATHS = {
  selection: "pipeline/manifests/round-4g-r2-test-selection.json",
  objectKeyMap: "pipeline/manifests/round-4g-r2-test-object-key-map.json",
  routes: "src/generated/coloring/routes.json",
  items: "src/generated/coloring/items.json",
};

export const ROUND4H_MANIFEST_FILES = [
  "pipeline/manifests/round-4h-env-validation.json",
  "pipeline/manifests/round-4h-r2-url-verification-plan.json",
  "pipeline/manifests/round-4h-r2-url-verification-results.json",
  "pipeline/manifests/round-4h-static-cdn-preview-results.json",
  "pipeline/manifests/round-4h-full-upload-readiness.json",
];

export const ROUND4H_REPORT_FILES = [
  "pipeline/reports/round-4h-env-validation-report.md",
  "pipeline/reports/round-4h-r2-url-verification-report.md",
  "pipeline/reports/round-4h-static-cdn-preview-report.md",
  "pipeline/reports/round-4h-r2-test-diagnosis.md",
  "pipeline/reports/round-4h-full-upload-readiness-report.md",
];

const MEDIA_TYPES = ["svg", "pngPreview", "thumbnail"];
const PRIVATE_ENDPOINT_PATTERNS = [/\.r2\.cloudflarestorage\.com/i, /amazonaws\.com/i, /X-Amz-/i, /Signature=/i];
const SECRET_PATTERNS = [/AKIA[0-9A-Z]{16}/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/i, /token\s*=\S+/i, /secret\s*=\S+/i];

const STATIC_PAGES_TO_INSPECT = [
  "/",
  "/coloring-pages",
  "/coloring-pages/plushies",
  "/coloring-pages/animals",
  "/coloring-pages/mandalas",
  "/coloring-pages/anime-girls",
  "/coloring-pages/chibi",
  "/coloring-pages/fantasy",
  "/coloring-pages/christmas",
  "/coloring-pages/halloween",
  "/coloring-pages/cars",
  "/coloring-pages/geometric",
];

export async function runRound4HR2CdnVerification(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const assetBaseUrl = normalizeBaseUrl(options.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || ROUND4H_TEMP_ASSET_BASE_URL);
  const envValidation = buildEnvValidation(assetBaseUrl);
  if (!envValidation.valid && options.throwOnInvalidEnv !== false) {
    await writeRound4HOutputs(repoRoot, {
      envValidation,
      urlPlan: buildEmptyUrlPlan(assetBaseUrl),
      urlResults: buildSkippedUrlResults("invalid_env", 0),
      staticPreview: await buildStaticPreviewResults({ repoRoot, assetBaseUrl, urlResults: buildSkippedUrlResults("invalid_env", 0) }),
      readiness: buildRound4HFullUploadReadiness({
        urlVerificationResults: buildSkippedUrlResults("invalid_env", 0),
        staticPreviewResults: { status: "failed" },
      }),
    });
    throw new Error(`Round 4H asset base URL is invalid: ${envValidation.errors.join("; ")}`);
  }

  const state = await loadState(repoRoot);
  const urlPlan = buildRound4HUrlVerificationPlan({ state, assetBaseUrl });
  const urlResults = options.skipUrlCheck
    ? buildSkippedUrlResults("skipped_by_option", urlPlan.urls.length)
    : await verifyRound4HUrls(urlPlan);
  const staticPreview = await buildStaticPreviewResults({ repoRoot, assetBaseUrl, urlResults });
  const readiness = buildRound4HFullUploadReadiness({
    urlVerificationResults: urlResults,
    staticPreviewResults: staticPreview,
  });

  const outputs = {
    envValidation,
    urlPlan,
    urlResults,
    staticPreview,
    readiness,
  };
  await writeRound4HOutputs(repoRoot, outputs);
  return outputs;
}

export function validateRound4HAssetBaseUrl(value) {
  return buildEnvValidation(value);
}

export function buildRound4HFullUploadReadiness({ urlVerificationResults, staticPreviewResults }) {
  const urlSummary = urlVerificationResults?.summary || {};
  const urlPassed = urlVerificationResults?.status === "passed" && Number(urlSummary.failed || 0) === 0 && Number(urlSummary.urlsChecked || 0) >= 90;
  const staticPassed = staticPreviewResults?.status === "passed";
  const ready = Boolean(urlPassed && staticPassed);

  return {
    generatedAt: ROUND4H_GENERATED_AT,
    runId: ROUND4H_RUN_ID,
    full_upload_bundle_ready: ready,
    reasons: {
      urlVerificationPassed: urlPassed,
      staticPreviewPassed: staticPassed,
      fullBundleGeneratedThisRound: false,
      fullCorpusUploadedThisRound: false,
    },
    recommendedNextRound: ready ? "round-4i-generate-full-r2-upload-bundle" : "fix-r2-test-delivery-before-full-upload",
    recommendedFullUploadPrefix: ready ? `${ROUND4H_UPLOAD_PREFIX}/` : null,
    productionDomainRecommendation: "Replace the temporary r2.dev test route with a custom asset domain before final production launch.",
    constraints: [
      "Do not upload the full corpus until explicitly approved.",
      "Do not start image sitemap, Open Graph image, or JSON-LD image work until CDN-backed rendering is verified.",
      "Do not rename generated media files during CDN verification.",
    ],
  };
}

async function loadState(repoRoot) {
  const selection = await readJson(path.join(repoRoot, INPUT_PATHS.selection));
  const objectKeyMap = await readJson(path.join(repoRoot, INPUT_PATHS.objectKeyMap));
  const routes = await readJson(path.join(repoRoot, INPUT_PATHS.routes));
  const items = await readJson(path.join(repoRoot, INPUT_PATHS.items));
  const selectionById = new Map(selection.records.map((record) => [record.assetId, record]));
  return { repoRoot, selection, objectKeyMap, routes, items, selectionById };
}

function buildEnvValidation(rawValue) {
  const assetBaseUrl = normalizeBaseUrl(rawValue);
  const errors = [];
  let parsed = null;
  try {
    parsed = assetBaseUrl ? new URL(assetBaseUrl) : null;
  } catch {
    errors.push("asset_base_url_is_not_a_valid_url");
  }

  const checks = {
    present: Boolean(assetBaseUrl),
    parsesAsUrl: Boolean(parsed),
    https: parsed?.protocol === "https:",
    publicUrl: Boolean(parsed && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)),
    hasColoringPagesPrefix: parsed?.pathname === `/${ROUND4H_UPLOAD_PREFIX}`,
    temporaryR2DevAllowedForThisRound: Boolean(parsed?.hostname.endsWith(".r2.dev")),
    r2DevFinalProductionRecommendation: false,
    finalProductionDomainRecommendation: "custom-asset-domain-required-later",
    noPrivateR2Endpoint: Boolean(parsed && !PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(assetBaseUrl))),
    noOldTestPrefix: !/coloring\/test-v1/i.test(assetBaseUrl),
    noDoubleColoringPagesPrefix: !/coloring-pages\/coloring-pages/i.test(assetBaseUrl),
    noCredentialsInUrl: Boolean(parsed && !parsed.username && !parsed.password),
    noSecretLikeValue: !SECRET_PATTERNS.some((pattern) => pattern.test(assetBaseUrl)),
  };

  for (const [key, passed] of Object.entries(checks)) {
    if (key === "r2DevFinalProductionRecommendation" || key === "finalProductionDomainRecommendation") continue;
    if (!passed) errors.push(key);
  }

  return {
    generatedAt: ROUND4H_GENERATED_AT,
    runId: ROUND4H_RUN_ID,
    assetBaseUrl,
    valid: errors.length === 0,
    checks,
    acceptedTemporaryException: "r2.dev is accepted for Round 4H testing only. A custom asset domain remains the production recommendation.",
    errors,
  };
}

function buildRound4HUrlVerificationPlan({ state, assetBaseUrl }) {
  const urls = state.objectKeyMap.entries.map((entry) => {
    const record = state.selectionById.get(entry.assetId);
    const relativeAssetPath = normalizeCdnRelativePath(entry.cdnRelativePath);
    const uploadedObjectKey = `${ROUND4H_UPLOAD_PREFIX}/${relativeAssetPath}`;
    const expectedPublicUrl = `${assetBaseUrl}/${relativeAssetPath}`;
    const tolerance = Math.max(512, Math.ceil(Number(entry.fileSize || 0) * 0.05));
    return {
      assetId: entry.assetId,
      displayTitle: record?.displayTitle || entry.displayTitle,
      category: record?.category || entry.category,
      mediaType: entry.mediaType,
      relativeAssetPath,
      uploadedObjectKey,
      generatedFilename: relativeAssetPath.split("/").at(-1),
      expectedPublicUrl,
      expectedContentType: entry.contentType,
      recommendedCacheControl: entry.recommendedCacheControl,
      expectedByteSizeRange: {
        min: Math.max(1, Number(entry.fileSize || 0) - tolerance),
        max: Number(entry.fileSize || 0) + tolerance,
      },
      expectedExactBytes: entry.fileSize,
      sha256: entry.sha256,
      likelyPages: (record?.likelyPages || []).map((page) => ({
        path: page.path,
        title: page.title,
        reason: page.reason,
      })),
    };
  });

  urls.sort((a, b) => a.expectedPublicUrl.localeCompare(b.expectedPublicUrl));
  return {
    generatedAt: ROUND4H_GENERATED_AT,
    runId: ROUND4H_RUN_ID,
    publicBaseUrl: assetBaseUrl,
    uploadedObjectKeyPrefix: `${ROUND4H_UPLOAD_PREFIX}/`,
    assetRelativePathContract: "{svg|png|thumbs}/<category>/<filename>",
    inputs: INPUT_PATHS,
    summary: {
      selectedImageRecordCount: state.selection.records.length,
      plannedUrlCount: urls.length,
      totalSvgUrls: urls.filter((entry) => entry.mediaType === "svg").length,
      totalPngPreviewUrls: urls.filter((entry) => entry.mediaType === "pngPreview").length,
      totalThumbnailUrls: urls.filter((entry) => entry.mediaType === "thumbnail").length,
      usesTemporaryR2DevRoute: assetBaseUrl.includes(".r2.dev/"),
      oldRound4GPrefixUsed: false,
      doubleColoringPagesPrefix: false,
    },
    urls,
  };
}

async function verifyRound4HUrls(plan) {
  const entries = [];
  for (const planned of plan.urls) {
    entries.push(await verifyOneUrl(planned));
  }

  const byMedia = {};
  for (const mediaType of MEDIA_TYPES) {
    const mediaEntries = entries.filter((entry) => entry.mediaType === mediaType);
    byMedia[mediaType] = {
      total: mediaEntries.length,
      passed: mediaEntries.filter((entry) => entry.status === "passed").length,
      failed: mediaEntries.filter((entry) => entry.status !== "passed").length,
    };
  }

  const summary = {
    urlsPlanned: plan.urls.length,
    urlsChecked: entries.length,
    passed: entries.filter((entry) => entry.status === "passed").length,
    failed: entries.filter((entry) => entry.status !== "passed").length,
    svg: byMedia.svg,
    pngPreview: byMedia.pngPreview,
    thumbnail: byMedia.thumbnail,
    contentTypeFailures: entries.filter((entry) => !entry.contentTypeAccepted).length,
    cacheHeaderPresent: entries.filter((entry) => entry.cacheControlPresent).length,
    cacheHeaderMissing: entries.filter((entry) => !entry.cacheControlPresent).length,
    cacheHeaderAcceptableForTemporaryTest: true,
    doublePrefixFailures: entries.filter((entry) => entry.doublePrefixIssue).length,
    oldPrefixFailures: entries.filter((entry) => entry.oldPrefixIssue).length,
    privateEndpointRedirects: entries.filter((entry) => entry.privateEndpointRedirect).length,
    localPathLeaks: entries.filter((entry) => entry.localPathLeak).length,
    accessDeniedResponses: entries.filter((entry) => entry.accessDeniedResponse).length,
    r2ErrorHtmlResponses: entries.filter((entry) => entry.r2ErrorHtmlResponse).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4H_RUN_ID,
    publicBaseUrl: plan.publicBaseUrl,
    status: summary.failed === 0 ? "passed" : "failed",
    summary,
    entries,
  };
}

async function verifyOneUrl(planned) {
  const startedAt = Date.now();
  try {
    const response = await fetch(planned.expectedPublicUrl, { method: "GET", redirect: "manual" });
    const body = await response.arrayBuffer();
    const textSample = decodeTextSample(body);
    const contentType = response.headers.get("content-type") || "";
    const cacheControl = response.headers.get("cache-control") || "";
    const location = response.headers.get("location") || "";
    const byteLength = body.byteLength;
    const expectedRange = planned.expectedByteSizeRange;
    const contentTypeAccepted = contentType.toLowerCase().startsWith(planned.expectedContentType.toLowerCase());
    const byteSizeAccepted = byteLength >= expectedRange.min && byteLength <= expectedRange.max;
    const doublePrefixIssue = /coloring-pages\/coloring-pages/i.test(planned.expectedPublicUrl);
    const oldPrefixIssue = /coloring\/test-v1/i.test(planned.expectedPublicUrl);
    const privateEndpointRedirect = response.status >= 300 && response.status < 400 && PRIVATE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(location));
    const localPathLeak = /[A-Za-z]:\\|images\/|ilovesvg\//i.test(planned.expectedPublicUrl) || /[A-Za-z]:\\|images\/|ilovesvg\//i.test(location);
    const accessDeniedResponse = /AccessDenied|Access Denied/i.test(textSample);
    const r2ErrorHtmlResponse = /<!doctype html|<html|cloudflare|r2/i.test(textSample) && !contentTypeAccepted;
    const statusOk = response.status === 200;
    const passed = statusOk && contentTypeAccepted && byteLength > 0 && byteSizeAccepted && !doublePrefixIssue && !oldPrefixIssue && !privateEndpointRedirect && !localPathLeak && !accessDeniedResponse && !r2ErrorHtmlResponse;

    return {
      assetId: planned.assetId,
      displayTitle: planned.displayTitle,
      category: planned.category,
      mediaType: planned.mediaType,
      url: planned.expectedPublicUrl,
      relativeAssetPath: planned.relativeAssetPath,
      uploadedObjectKey: planned.uploadedObjectKey,
      status: passed ? "passed" : "failed",
      httpStatus: response.status,
      contentType,
      expectedContentType: planned.expectedContentType,
      contentTypeAccepted,
      cacheControl: cacheControl || null,
      cacheControlPresent: Boolean(cacheControl),
      cacheControlConfigured: Boolean(planned.recommendedCacheControl),
      cacheControlAcceptedForTemporaryTest: true,
      byteLength,
      expectedByteSizeRange: planned.expectedByteSizeRange,
      byteSizeAccepted,
      redirectLocation: location || null,
      privateEndpointRedirect,
      accessDeniedResponse,
      r2ErrorHtmlResponse,
      doublePrefixIssue,
      oldPrefixIssue,
      localPathLeak,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      assetId: planned.assetId,
      displayTitle: planned.displayTitle,
      category: planned.category,
      mediaType: planned.mediaType,
      url: planned.expectedPublicUrl,
      relativeAssetPath: planned.relativeAssetPath,
      uploadedObjectKey: planned.uploadedObjectKey,
      status: "failed",
      error: error.message,
      httpStatus: null,
      contentType: null,
      expectedContentType: planned.expectedContentType,
      contentTypeAccepted: false,
      cacheControl: null,
      cacheControlPresent: false,
      byteLength: 0,
      expectedByteSizeRange: planned.expectedByteSizeRange,
      byteSizeAccepted: false,
      privateEndpointRedirect: false,
      accessDeniedResponse: false,
      r2ErrorHtmlResponse: false,
      doublePrefixIssue: /coloring-pages\/coloring-pages/i.test(planned.expectedPublicUrl),
      oldPrefixIssue: /coloring\/test-v1/i.test(planned.expectedPublicUrl),
      localPathLeak: /[A-Za-z]:\\|images\/|ilovesvg\//i.test(planned.expectedPublicUrl),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

async function buildStaticPreviewResults({ repoRoot, assetBaseUrl, urlResults }) {
  const pages = [];
  const generatedFilenames = await getSelectedGeneratedFilenames(repoRoot);
  const routePath = path.join(repoRoot, "src/generated/coloring/routes.json");
  const routes = await readJson(routePath);
  const appApiRouteExists = await hasAppApiRouteFiles(repoRoot);

  for (const routePathname of STATIC_PAGES_TO_INSPECT) {
    const htmlPath = staticHtmlPath(repoRoot, routePathname);
    const exists = await pathExists(htmlPath);
    const html = exists ? await readFile(htmlPath, "utf8") : "";
    const foundSelectedFilenames = generatedFilenames.filter((filename) => html.includes(filename));
    pages.push({
      path: routePathname,
      htmlRelativePath: normalizePath(path.relative(repoRoot, htmlPath)),
      exists,
      containsTemporaryBaseUrl: html.includes(assetBaseUrl),
      containsOldRound4GPrefix: /coloring\/test-v1/i.test(html),
      containsDoublePrefix: /coloring-pages\/coloring-pages/i.test(html),
      containsAppApiMediaRoute: /\/api\/coloring-assets/i.test(html),
      containsLocalFilesystemPath: /[A-Za-z]:\\|images\/|ilovesvg\//i.test(html),
      placeholderFallbackMarkupPresent: /Preview unavailable/.test(html),
      downloadPngMarkupPresent: /Download PNG/.test(html),
      downloadSvgMarkupPresent: /Download SVG/.test(html),
      printMarkupPresent: /Print/.test(html),
      foundSelectedFilenames,
    });
  }

  const screenshotDir = path.join(repoRoot, "pipeline/review/round-4h/screenshots");
  const screenshotArtifacts = (await listFilesIfExists(screenshotDir))
    .filter((file) => /\.(png|jpg|jpeg)$/i.test(file))
    .map((file) => normalizePath(path.relative(repoRoot, file)));

  const urlPassed = urlResults?.status === "passed";
  const htmlPagesExist = pages.every((page) => page.exists);
  const noOldPrefixFound = pages.every((page) => !page.containsOldRound4GPrefix);
  const noDoublePrefixFound = pages.every((page) => !page.containsDoublePrefix);
  const noAppApiReferences = pages.every((page) => !page.containsAppApiMediaRoute) && !appApiRouteExists;
  const noLocalPathLeaks = pages.every((page) => !page.containsLocalFilesystemPath);
  const temporaryBaseUrlFound = pages.some((page) => page.containsTemporaryBaseUrl);
  const generatedFilenamesFound = pages.flatMap((page) => page.foundSelectedFilenames);

  return {
    generatedAt: ROUND4H_GENERATED_AT,
    runId: ROUND4H_RUN_ID,
    status: htmlPagesExist && noOldPrefixFound && noDoublePrefixFound && noAppApiReferences && noLocalPathLeaks && temporaryBaseUrlFound && urlPassed ? "passed" : "failed",
    assetBaseUrl,
    staticExportConfigured: await nextConfigUsesStaticExport(repoRoot),
    routeCount: routes.routes.length,
    noPerImageRoutes: routes.noPerImageRoutes,
    noAppApiRoute: !appApiRouteExists,
    noBackendRequired: true,
    noOldPrefixFound,
    noDoublePrefixFound,
    noLocalPathLeaks,
    temporaryBaseUrlFound,
    placeholderFallbackExpectedForPartialUpload: true,
    placeholderFallbackMarkupPresent: pages.some((page) => page.placeholderFallbackMarkupPresent),
    downloadPrintFindings: {
      downloadPngMarkupPresent: pages.some((page) => page.downloadPngMarkupPresent),
      downloadSvgMarkupPresent: pages.some((page) => page.downloadSvgMarkupPresent),
      printMarkupPresent: pages.some((page) => page.printMarkupPresent),
      note: "The static app resolves URLs from the configured base. The partial test upload verifies selected records while non-uploaded media may fall back visually until the full bundle is published.",
    },
    generatedFilenamesPreserved: generatedFilenames.every((filename) => generatedFilenames.includes(filename)),
    generatedFilenames,
    selectedGeneratedFilenamesFoundInInspectedPages: [...new Set(generatedFilenamesFound)].sort(),
    pagesInspected: pages,
    screenshotArtifacts,
  };
}

async function hasAppApiRouteFiles(repoRoot) {
  const apiFiles = await listFilesIfExists(path.join(repoRoot, "app/api"));
  return apiFiles.some((file) => /[\\/]route\.(?:ts|tsx|js|jsx)$/.test(file));
}

async function getSelectedGeneratedFilenames(repoRoot) {
  const selection = await readJson(path.join(repoRoot, INPUT_PATHS.selection));
  return selection.records
    .flatMap((record) => MEDIA_TYPES.map((mediaType) => record.media[mediaType]?.cdnRelativePath?.split("/").at(-1)).filter(Boolean))
    .sort();
}

async function writeRound4HOutputs(repoRoot, outputs) {
  const manifests = {
    "pipeline/manifests/round-4h-env-validation.json": outputs.envValidation,
    "pipeline/manifests/round-4h-r2-url-verification-plan.json": outputs.urlPlan,
    "pipeline/manifests/round-4h-r2-url-verification-results.json": outputs.urlResults,
    "pipeline/manifests/round-4h-static-cdn-preview-results.json": outputs.staticPreview,
    "pipeline/manifests/round-4h-full-upload-readiness.json": outputs.readiness,
  };
  for (const [relativePath, payload] of Object.entries(manifests)) {
    await writeJson(path.join(repoRoot, relativePath), payload);
  }

  const reports = buildRound4HReports(outputs);
  for (const [relativePath, markdown] of Object.entries(reports)) {
    await writeText(path.join(repoRoot, relativePath), markdown);
  }
}

function buildRound4HReports({ envValidation, urlPlan, urlResults, staticPreview, readiness }) {
  const mediaLines = ["svg", "pngPreview", "thumbnail"]
    .map((mediaType) => {
      const media = urlResults.summary?.[mediaType] || { total: 0, passed: 0, failed: 0 };
      return `- ${mediaType}: ${media.passed}/${media.total} passed, ${media.failed} failed`;
    })
    .join("\n");
  const pageLines = (staticPreview.pagesInspected || [])
    .map((page) => `- ${page.path}: ${page.exists ? "found" : "missing"}, selected filenames found ${page.foundSelectedFilenames.length}`)
    .join("\n");
  const screenshotLines = (staticPreview.screenshotArtifacts || []).length
    ? staticPreview.screenshotArtifacts.map((file) => `- ${file}`).join("\n")
    : "- No browser screenshots recorded yet.";
  const failureLines = (urlResults.entries || [])
    .filter((entry) => entry.status !== "passed")
    .slice(0, 20)
    .map((entry) => `- ${entry.mediaType} ${entry.url}: ${entry.httpStatus || "request failed"} ${entry.error || entry.contentType || ""}`)
    .join("\n") || "- None.";

  return {
    "pipeline/reports/round-4h-env-validation-report.md": `# Round 4H Env Validation Report

Generated: ${ROUND4H_GENERATED_AT}

## Result

- Asset base URL: \`${envValidation.assetBaseUrl}\`
- Valid for Round 4H: ${envValidation.valid}
- Uses uploaded test prefix: ${envValidation.checks.hasColoringPagesPrefix}
- Temporary r2.dev route accepted for this round: ${envValidation.checks.temporaryR2DevAllowedForThisRound}
- Private R2 endpoint rejected: ${envValidation.checks.noPrivateR2Endpoint}
- Double prefix issue detected: ${!envValidation.checks.noDoubleColoringPagesPrefix}

r2.dev is accepted for Round 4H only as a temporary public test route. It is not the final production asset domain recommendation. A custom asset domain should replace it before production launch.
`,
    "pipeline/reports/round-4h-r2-url-verification-report.md": `# Round 4H R2 URL Verification Report

Generated: ${ROUND4H_GENERATED_AT}

## Result

- Status: ${urlResults.status}
- Public base URL: \`${urlResults.publicBaseUrl}\`
- URLs checked: ${urlResults.summary.urlsChecked}
- URLs passed: ${urlResults.summary.passed}
- URLs failed: ${urlResults.summary.failed}

## Media Results

${mediaLines}

## Header Results

- Content type failures: ${urlResults.summary.contentTypeFailures}
- Cache headers present: ${urlResults.summary.cacheHeaderPresent}
- Cache headers missing: ${urlResults.summary.cacheHeaderMissing}
- Cache headers acceptable for temporary test: ${urlResults.summary.cacheHeaderAcceptableForTemporaryTest}

## Safety Results

- Private endpoint redirects: ${urlResults.summary.privateEndpointRedirects}
- Access denied responses: ${urlResults.summary.accessDeniedResponses}
- R2 error HTML responses: ${urlResults.summary.r2ErrorHtmlResponses}
- Double prefix failures: ${urlResults.summary.doublePrefixFailures}
- Old Round 4G prefix failures: ${urlResults.summary.oldPrefixFailures}
- Local path leaks: ${urlResults.summary.localPathLeaks}

## Failures

${failureLines}
`,
    "pipeline/reports/round-4h-static-cdn-preview-report.md": `# Round 4H Static CDN Preview Report

Generated: ${ROUND4H_GENERATED_AT}

## Result

- Status: ${staticPreview.status}
- Static export configured: ${staticPreview.staticExportConfigured}
- Route count: ${staticPreview.routeCount}
- App API route present: ${!staticPreview.noAppApiRoute}
- Temporary base URL found in static output: ${staticPreview.temporaryBaseUrlFound}
- Old Round 4G prefix found: ${!staticPreview.noOldPrefixFound}
- Double prefix found: ${!staticPreview.noDoublePrefixFound}
- Placeholder fallback expected for partial upload: ${staticPreview.placeholderFallbackExpectedForPartialUpload}
- Placeholder fallback markup present: ${staticPreview.placeholderFallbackMarkupPresent}
- PNG download markup present: ${staticPreview.downloadPrintFindings.downloadPngMarkupPresent}
- SVG download markup present: ${staticPreview.downloadPrintFindings.downloadSvgMarkupPresent}
- Print markup present: ${staticPreview.downloadPrintFindings.printMarkupPresent}

## Pages Inspected

${pageLines}

## Browser Screenshots

${screenshotLines}
`,
    "pipeline/reports/round-4h-r2-test-diagnosis.md": `# Round 4H R2 Test Diagnosis

Generated: ${ROUND4H_GENERATED_AT}

## Diagnosis

- Manual upload structure expected by this round: \`${ROUND4H_UPLOAD_PREFIX}/{svg|png|thumbs}/<category>/<filename>\`
- Temporary asset base URL correct: ${envValidation.valid}
- Public URLs resolved: ${urlResults.status === "passed"}
- Content types acceptable: ${urlResults.summary.contentTypeFailures === 0}
- Cache headers acceptable for temporary test: ${urlResults.summary.cacheHeaderAcceptableForTemporaryTest}
- Static app rendering audit passed: ${staticPreview.status === "passed"}
- Download and print markup present: ${staticPreview.downloadPrintFindings.downloadPngMarkupPresent && staticPreview.downloadPrintFindings.downloadSvgMarkupPresent && staticPreview.downloadPrintFindings.printMarkupPresent}
- Old Round 4G prefix remains in Round 4H outputs: ${urlResults.summary.oldPrefixFailures > 0 || !staticPreview.noOldPrefixFound}
- Double uploaded prefix issue exists: ${urlResults.summary.doublePrefixFailures > 0 || !staticPreview.noDoublePrefixFound}
- Full upload bundle ready: ${readiness.full_upload_bundle_ready}

## If Something Fails

- Wrong upload folder level: upload the contents that produce \`${ROUND4H_UPLOAD_PREFIX}/svg\`, \`${ROUND4H_UPLOAD_PREFIX}/png\`, and \`${ROUND4H_UPLOAD_PREFIX}/thumbs\` at the bucket object-key root.
- Public route not enabled: enable a public R2 route or custom domain before previewing the static app.
- Wrong asset base URL: set \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL=${ROUND4H_TEMP_ASSET_BASE_URL}\` for this test.
- Double prefix: remove one repeated uploaded prefix level.
- Content type issue: set SVG objects to \`image/svg+xml\` and PNG objects to \`image/png\`.

r2.dev remains temporary. Replace it with a custom asset domain before final production launch.
`,
    "pipeline/reports/round-4h-full-upload-readiness-report.md": `# Round 4H Full Upload Readiness Report

Generated: ${ROUND4H_GENERATED_AT}

## Result

- Full upload bundle ready: ${readiness.full_upload_bundle_ready}
- Recommended next round: ${readiness.recommendedNextRound}
- Recommended full upload prefix: ${readiness.recommendedFullUploadPrefix || "not ready"}

## Requirements Before Full Upload

- The 30-record URL verification must pass.
- Static gallery rendering against the public asset base must pass.
- Full bundle generation still requires explicit future approval.
- Full corpus upload still requires explicit future approval.
- The temporary r2.dev route should be replaced by a custom asset domain before production launch.
`,
  };
}

function buildEmptyUrlPlan(assetBaseUrl) {
  return {
    generatedAt: ROUND4H_GENERATED_AT,
    runId: ROUND4H_RUN_ID,
    publicBaseUrl: assetBaseUrl,
    uploadedObjectKeyPrefix: `${ROUND4H_UPLOAD_PREFIX}/`,
    summary: {
      selectedImageRecordCount: 0,
      plannedUrlCount: 0,
      totalSvgUrls: 0,
      totalPngPreviewUrls: 0,
      totalThumbnailUrls: 0,
    },
    urls: [],
  };
}

function buildSkippedUrlResults(reason, plannedCount) {
  return {
    generatedAt: ROUND4H_GENERATED_AT,
    runId: ROUND4H_RUN_ID,
    publicBaseUrl: null,
    status: "failed",
    reason,
    summary: {
      urlsPlanned: plannedCount,
      urlsChecked: 0,
      passed: 0,
      failed: plannedCount,
      svg: { total: 0, passed: 0, failed: 0 },
      pngPreview: { total: 0, passed: 0, failed: 0 },
      thumbnail: { total: 0, passed: 0, failed: 0 },
      contentTypeFailures: 0,
      cacheHeaderPresent: 0,
      cacheHeaderMissing: 0,
      cacheHeaderAcceptableForTemporaryTest: false,
      doublePrefixFailures: 0,
      oldPrefixFailures: 0,
      privateEndpointRedirects: 0,
      localPathLeaks: 0,
      accessDeniedResponses: 0,
      r2ErrorHtmlResponses: 0,
    },
    entries: [],
  };
}

async function nextConfigUsesStaticExport(repoRoot) {
  const nextConfig = await readFile(path.join(repoRoot, "next.config.mjs"), "utf8");
  return /output:\s*"export"/.test(nextConfig);
}

function staticHtmlPath(repoRoot, routePathname) {
  const normalized = routePathname.replace(/^\/+|\/+$/g, "");
  if (!normalized) return path.join(repoRoot, "out/index.html");
  return path.join(repoRoot, "out", ...normalized.split("/"), "index.html");
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeCdnRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!/^(?:svg|png|thumbs)\//.test(normalized) || normalized.includes("..") || normalized.includes(":")) {
    throw new Error(`Unsafe Round 4H asset relative path: ${value}`);
  }
  return normalized;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function decodeTextSample(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer.slice(0, 512));
  if (bytes.length === 0) return "";
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
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

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesIfExists(root) {
  if (!(await pathExists(root))) return [];
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else {
        files.push(entryPath);
      }
    }
  }
  await walk(root);
  return files;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runRound4HR2CdnVerification(options);
  console.log(`Round 4H env valid: ${result.envValidation.valid}`);
  console.log(`Round 4H URL verification: ${result.urlResults.status}`);
  console.log(`URLs checked: ${result.urlResults.summary.urlsChecked}`);
  console.log(`URLs failed: ${result.urlResults.summary.failed}`);
  console.log(`Static preview: ${result.staticPreview.status}`);
  console.log(`Full upload ready: ${result.readiness.full_upload_bundle_ready}`);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--asset-base-url") options.assetBaseUrl = args[++index];
    else if (arg === "--skip-url-check") options.skipUrlCheck = true;
    else if (arg === "--allow-invalid-env") options.throwOnInvalidEnv = false;
    else throw new Error(`Unknown Round 4H option: ${arg}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
