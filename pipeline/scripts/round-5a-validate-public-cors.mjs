import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RUN_ID = "round-5a-public-cors-validation";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const CLOUDFLARE_R2_CORS_DOC = "https://developers.cloudflare.com/r2/buckets/cors/";
const CLOUDFLARE_R2_API_CORS_DOC = "https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/";

await main();

async function main() {
  await mkdir(path.join(REPO_ROOT, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(REPO_ROOT, "pipeline", "reports"), { recursive: true });

  const env = await loadPublicEnv();
  const source = await readProjectSource();
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const assetResolver = await readText("src/lib/coloring/assets.ts");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const round4zConversion = await readJson("pipeline/manifests/round-4z-browser-conversion-qa-results.json");
  const round4zCors = await readJson("pipeline/manifests/round-4z-production-cors-requirements.json");

  const context = buildContext({ packageJson, nextConfig, source, siteConfig });
  const implementationAudit = buildImplementationAudit({ browserDownloads, imageCard, galleryGrid, assetResolver, round4zConversion, round4zCors });
  const assetValidation = buildAssetBaseValidation(env);
  const selection = await buildTestSelection(assetValidation, env);
  const headerResults = assetValidation.public_cors_validation_ready ? await verifyCorsHeaders(selection, assetValidation) : buildSkippedHeaderResults(selection, assetValidation);
  const existingBrowserConversion = await readJsonIfExists("pipeline/manifests/round-5a-browser-public-conversion-results.json");
  const browserConversion = existingBrowserConversion || buildSkippedBrowserConversion(assetValidation);
  const exposureDecision = buildDownloadExposureDecision({ headerResults, browserConversion });
  const corsGuide = buildCorsGuide(env, assetValidation);
  const existingBrowserQa = await readJsonIfExists("pipeline/manifests/round-5a-browser-qa-results.json");
  const browserQa = existingBrowserQa || buildPendingBrowserQa(assetValidation);
  const launchAdjustment = buildLaunchAdjustment({ assetValidation, headerResults, browserConversion, exposureDecision });

  const payloads = new Map([
    ["pipeline/manifests/round-5a-project-context-check.json", context],
    ["pipeline/manifests/round-5a-conversion-implementation-audit.json", implementationAudit],
    ["pipeline/manifests/round-5a-public-asset-base-validation.json", assetValidation],
    ["pipeline/manifests/round-5a-public-cors-test-selection.json", selection],
    ["pipeline/manifests/round-5a-public-cors-header-results.json", headerResults],
    ["pipeline/manifests/round-5a-browser-public-conversion-results.json", browserConversion],
    ["pipeline/manifests/round-5a-download-format-exposure-decision.json", exposureDecision],
    ["pipeline/manifests/round-5a-r2-cors-configuration-guide.json", corsGuide],
    ["pipeline/manifests/round-5a-browser-qa-results.json", browserQa],
    ["pipeline/manifests/round-5a-launch-readiness-adjustment.json", launchAdjustment],
  ]);

  for (const [relativePath, payload] of payloads) await writeJson(relativePath, payload);

  await writeProjectContextReport(context);
  await writeConversionAuditReport(implementationAudit);
  await writeAssetBaseReport(assetValidation);
  await writeTestSelectionReport(selection);
  await writeHeaderReport(headerResults);
  await writeBrowserConversionReport(browserConversion);
  await writeExposureDecisionReport(exposureDecision);
  await writeCorsGuideReport(corsGuide);
  await writeBrowserQaReport(browserQa);
  await writeLaunchAdjustmentReport(launchAdjustment);

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        publicAssetBaseUrl: assetValidation.summary.redactedAssetBaseUrl,
        publicCorsValidationReady: assetValidation.public_cors_validation_ready,
        publicCorsHeadersPass: headerResults.summary.publicCorsHeadersPass,
        browserPublicConversionPass: browserConversion.summary.publicBrowserConversionPass,
        jpgWebpControlsExposed: exposureDecision.summary.jpgJpegWebpControlsExposed,
      },
      null,
      2,
    ),
  );

  if (assetValidation.public_cors_validation_ready && !headerResults.summary.publicCorsHeadersPass) {
    process.exitCode = 1;
  }
}

function buildContext({ packageJson, nextConfig, source, siteConfig }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch: safeGit(["branch", "--show-current"]),
      head: safeGit(["rev-parse", "HEAD"]),
      round4zCommitExists: safeGit(["cat-file", "-t", "ec5e730"]) === "commit",
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      r2BundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      publicGeneratedMediaPresent: hasPublicGeneratedMedia(),
      sourceImagesUntouched: safeGit(["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: safeGit(["status", "--short", "--", "ilovesvg"]) === "",
      publicDownloadsPngOnlyBeforeValidation: !/Download JPG|Download JPEG|Download WebP|Download SVG/i.test(source),
      svgUserDownloadExposed: /Download SVG|SVG download|downloadSvg|svgDownload/i.test(source),
      adWellsVisibleByDefault: /data-ad-placeholder/.test(source),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(source),
      contactEmail: /admin@ilovecoloringpage\.com/.test(siteConfig) ? CONTACT_EMAIL : "",
      wrongTaskContextDetected: /image-to-favicon-generator|SVG wrapper route|Vite-specific output/i.test(source),
    },
  };
}

function buildImplementationAudit({ browserDownloads, imageCard, galleryGrid, assetResolver, round4zConversion, round4zCors }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      internalSvgConversionPathPresent: /convertInternalSvgToBlob/.test(browserDownloads),
      pngFallbackPresent: /png-preview-fallback|pngPreviewUrl/.test(browserDownloads),
      printPrefersHighQualitySource: /printFromHighQualitySource/.test(imageCard),
      supportedFormatDetectionPresent: /getSupportedDownloadFormats|getVisibleDownloadFormats/.test(browserDownloads),
      corsFailureHandlingPresent: /canvas-tainted|CORS|crossOrigin/.test(browserDownloads),
      userFacingSvgDownloadHidden: !/Download SVG|downloadSvg|svgDownload/i.test(imageCard + browserDownloads),
      jpgJpegWebpControlsHidden: !/Download JPG|Download JPEG|Download WebP/i.test(imageCard),
      appApiAbsent: !existsSync(path.join(REPO_ROOT, "app", "api")) && !existsSync(path.join(REPO_ROOT, "src", "app", "api")),
      galleryPassesInternalSvgOnlyToActions: /internalSvg:\s*resolvedUrls\.svg/.test(galleryGrid),
      centralizedAssetResolverUsed: /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/.test(assetResolver),
      round4zLocalConversionPassed: round4zConversion.summary?.passed === true,
      round4zProductionCorsRequired: round4zCors.summary?.productionCorsRequiredForFutureJpegWebpUi === true,
    },
    notes: [
      "Print uses the internal SVG as action data for conversion, not as a user-facing download.",
      "PNG remains the only visible public download format until public CORS and browser export are accepted.",
    ],
  };
}

function buildAssetBaseValidation(env) {
  const assetBaseUrl = env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.value;
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.value;
  const status = inspectUrl(assetBaseUrl, { requireColoringPagesPrefix: true });
  const siteStatus = inspectUrl(siteUrl, { requireColoringPagesPrefix: false });
  const blockers = [];

  if (!assetBaseUrl) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not configured in the shell or local public env files.");
  if (assetBaseUrl && !status.isHttpUrl) blockers.push("Asset base URL must be HTTP or HTTPS.");
  if (assetBaseUrl && status.isLocalhost) blockers.push("Asset base URL points to localhost, so it is not a public CORS validation target.");
  if (assetBaseUrl && !status.hasColoringPagesPrefix) blockers.push("Asset base URL must include /coloring-pages.");
  if (status.hasOldTestPrefix) blockers.push("Asset base URL contains the stale /coloring/test-v1 prefix.");
  if (status.hasDuplicateColoringPagesPrefix) blockers.push("Asset base URL contains a duplicate /coloring-pages/coloring-pages prefix.");
  if (status.isPrivateR2Endpoint) blockers.push("Asset base URL points to a private object storage endpoint.");

  const publicCorsReady =
    Boolean(assetBaseUrl) &&
    status.isHttpUrl &&
    !status.isLocalhost &&
    !status.hasOldTestPrefix &&
    !status.hasDuplicateColoringPagesPrefix &&
    !status.isPrivateR2Endpoint &&
    status.hasColoringPagesPrefix;

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    public_cors_validation_ready: publicCorsReady,
    summary: {
      assetBaseUrlConfigured: Boolean(assetBaseUrl),
      assetBaseUrlSource: env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.source,
      redactedAssetBaseUrl: redactUrl(assetBaseUrl),
      isHttpUrl: status.isHttpUrl,
      isLocalhost: status.isLocalhost,
      isR2Dev: status.isR2Dev,
      isTemporaryR2Dev: status.isR2Dev,
      isCustomDomain: publicCorsReady && !status.isR2Dev,
      isPrivateR2Endpoint: status.isPrivateR2Endpoint,
      hasColoringPagesPrefix: status.hasColoringPagesPrefix,
      hasOldTestPrefix: status.hasOldTestPrefix,
      hasDuplicateColoringPagesPrefix: status.hasDuplicateColoringPagesPrefix,
      siteUrlConfigured: Boolean(siteUrl),
      siteUrlReadyForProduction: siteStatus.ready,
      publicValidationBlocked: !publicCorsReady,
    },
    blockers,
    ownerActionItems: publicCorsReady
      ? []
      : [
          "Set NEXT_PUBLIC_COLORING_ASSET_BASE_URL to a public R2/custom-domain asset origin ending in /coloring-pages.",
          "Configure CORS on that asset host, then rerun Round 5A public validation.",
        ],
  };
}

async function buildTestSelection(assetValidation, env) {
  const items = (await readJson("src/generated/coloring/items.json")).items;
  const assetBaseUrl = env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.value;
  const specs = [
    { id: "animals-alligator", route: "/coloring-pages/animals", match: /animals alligator/i },
    { id: "geometric-or-mandala", route: "/coloring-pages/geometric", match: /geometric|mandala/i },
    { id: "anime-girls", route: "/coloring-pages/anime-girls", match: /anime girl/i },
    { id: "christmas", route: "/coloring-pages/christmas", match: /christmas/i },
    { id: "high-detail", route: "/coloring-pages/mandalas", match: /mandala|detailed|dragon|fantasy/i },
  ];
  const selected = specs.map((spec) => {
    const item = items.find((candidate) => spec.match.test(`${candidate.title} ${candidate.categorySlug} ${candidate.filenameSlug}`));
    if (!item) throw new Error(`Could not find Round 5A sample for ${spec.id}`);
    return {
      sampleId: spec.id,
      route: spec.route,
      assetId: item.assetId,
      title: item.title,
      sourceHub: item.categorySlug,
      svg: buildAssetRecord(assetBaseUrl, item.assetSubpaths.svg, "image/svg+xml"),
      pngPreview: buildAssetRecord(assetBaseUrl, item.assetSubpaths.pngPreview, "image/png"),
      thumbnail: buildAssetRecord(assetBaseUrl, item.assetSubpaths.thumbnail, "image/png"),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    assetBaseUrl: redactUrl(assetBaseUrl),
    publicAssetBaseReady: assetValidation.public_cors_validation_ready,
    selectedCount: selected.length,
    publicSubsetAssumption: assetValidation.public_cors_validation_ready
      ? "Selected records are representative public CORS probes. They do not require the full media corpus to be uploaded."
      : "Selection is prepared from generated metadata, but public CORS probing is blocked until a public asset base URL is configured.",
    records: selected,
  };
}

async function verifyCorsHeaders(selection, assetValidation) {
  const originCandidates = getOriginCandidates();
  const checks = [];
  for (const record of selection.records) {
    for (const [kind, asset] of Object.entries({ svg: record.svg, pngPreview: record.pngPreview, thumbnail: record.thumbnail })) {
      checks.push(await verifyOneAsset(record, kind, asset, originCandidates));
    }
  }
  const publicCorsHeadersPass = checks.length > 0 && checks.every((check) => check.pass);
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    assetBaseUrl: selection.assetBaseUrl,
    publicAssetBaseReady: assetValidation.public_cors_validation_ready,
    originsTested: originCandidates,
    checks,
    summary: {
      publicCorsHeadersPass,
      totalAssetsChecked: checks.length,
      status200Count: checks.filter((check) => check.statusOk).length,
      contentTypeOkCount: checks.filter((check) => check.contentTypeOk).length,
      accessControlAllowOriginOkCount: checks.filter((check) => check.accessControlAllowOriginOk).length,
      cacheHeaderDocumentedCount: checks.filter((check) => Boolean(check.cacheControl)).length,
      noXmlAccessDenied: checks.every((check) => !check.xmlAccessDenied),
      noR2ErrorHtml: checks.every((check) => !check.r2ErrorHtml),
      noPrivateEndpointRedirect: checks.every((check) => !check.privateEndpointRedirect),
      noStaleOldPrefix: checks.every((check) => !check.url.includes("/coloring/test-v1")),
      noDoubleColoringPagesPrefix: checks.every((check) => !check.url.includes("/coloring-pages/coloring-pages")),
    },
  };
}

function buildSkippedHeaderResults(selection, assetValidation) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    assetBaseUrl: selection.assetBaseUrl,
    publicAssetBaseReady: assetValidation.public_cors_validation_ready,
    originsTested: getOriginCandidates(),
    checks: [],
    skipped: true,
    skippedReason: assetValidation.blockers.join(" ") || "Public asset base URL is not ready for validation.",
    summary: {
      publicCorsHeadersPass: false,
      totalAssetsChecked: 0,
      status200Count: 0,
      contentTypeOkCount: 0,
      accessControlAllowOriginOkCount: 0,
      cacheHeaderDocumentedCount: 0,
      noXmlAccessDenied: true,
      noR2ErrorHtml: true,
      noPrivateEndpointRedirect: true,
      noStaleOldPrefix: true,
      noDoubleColoringPagesPrefix: true,
    },
  };
}

function buildSkippedBrowserConversion(assetValidation) {
  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5a-browser-public-conversion",
    publicAssetBaseReady: assetValidation.public_cors_validation_ready,
    skipped: true,
    skippedReason: assetValidation.blockers.join(" ") || "Public asset base URL is not ready for browser conversion QA.",
    samples: [],
    printFlow: {
      publicPrintFlowTested: false,
      usesGeneratedOutput: false,
      fallbackExpectedIfCorsMissing: true,
    },
    summary: {
      publicBrowserConversionPass: false,
      publicInternalSvgLoads: false,
      publicCanvasTainted: null,
      publicPngBlobExportSucceeded: false,
      publicJpegBlobExportSucceeded: false,
      publicWebpBlobExportSucceeded: false,
      printFlowUsesGeneratedOutput: false,
      localCorsRegressionPass: null,
      fallbackWorksWhenCorsUnavailable: true,
      svgUserDownloadAbsent: true,
      visibleJpegWebpControlsRemainHidden: true,
    },
  };
}

function buildDownloadExposureDecision({ headerResults, browserConversion }) {
  const publicCorsPass = headerResults.summary.publicCorsHeadersPass === true;
  const browserPass = browserConversion.summary.publicBrowserConversionPass === true;
  const canExpose = publicCorsPass && browserPass;
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      publicCorsHeadersPass: publicCorsPass,
      publicBrowserConversionPass: browserPass,
      technicallySafeToExposeJpgJpegWebp: canExpose,
      jpgJpegWebpControlsExposed: false,
      currentPublicDownloadFormats: ["PNG"],
      svgInternalOnly: true,
      defaultDecision: canExpose
        ? "Public conversion is technically ready, but controls stay hidden until owner accepts a small UI exposure round."
        : "Keep public downloads PNG-only because public CORS/browser conversion is not verified.",
    },
    blockers: canExpose
      ? ["Owner acceptance is still needed before exposing additional download controls."]
      : ["Public asset CORS and browser canvas export must pass before JPG/JPEG/WebP controls can be shown."],
  };
}

function buildCorsGuide(env, assetValidation) {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.value;
  const localOrigins = ["http://localhost:3005", "http://127.0.0.1:3005"];
  const productionOrigins = siteUrl && !inspectUrl(siteUrl, { requireColoringPagesPrefix: false }).isLocalhost ? [new URL(siteUrl).origin] : [];
  const allowedOrigins = [...new Set([...localOrigins, ...productionOrigins])];
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    officialSources: [CLOUDFLARE_R2_CORS_DOC, CLOUDFLARE_R2_API_CORS_DOC],
    requiredOrigins: allowedOrigins,
    requiredMethods: ["GET", "HEAD"],
    requiredHeaders: ["Origin", "Range"],
    exposeHeaders: ["Content-Type", "Content-Length", "Cache-Control", "ETag"],
    maxAgeSeconds: 3600,
    requiredContentTypes: ["image/svg+xml", "image/png"],
    examplePolicy: [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ["GET", "HEAD"],
        AllowedHeaders: ["Origin", "Range"],
        ExposeHeaders: ["Content-Type", "Content-Length", "Cache-Control", "ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
    notes: [
      "Access-Control-Allow-Origin must be present on browser requests that include an Origin header.",
      "No credentials are needed for public static image reads.",
      "SVG remains internal action data and must not be exposed as a user download.",
      "Full asset upload remains a final-stage production task.",
      assetValidation.summary.isR2Dev ? "The configured r2.dev URL is temporary testing only." : "A custom asset domain is preferred for production.",
    ],
  };
}

function buildPendingBrowserQa(assetValidation) {
  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5a-browser-qa",
    skipped: true,
    skippedReason: "Browser QA runner has not been run yet for Round 5A.",
    publicAssetBaseReady: assetValidation.public_cors_validation_ready,
    pagesInspected: [],
    screenshots: [],
    summary: {
      realMediaRenders: false,
      printUsesHighQualityConversionIfCorsWorks: false,
      printFallbackCleanIfCorsMissing: true,
      pngDownloadWorks: false,
      svgDownloadAbsent: true,
      jpegWebpControlsAbsent: true,
      adDensityMatchesRound4U: false,
      noHorizontalOverflow: false,
      appApiRouteAdded: false,
    },
  };
}

function buildLaunchAdjustment({ assetValidation, headerResults, browserConversion, exposureDecision }) {
  const publicAssetCorsReady = headerResults.summary.publicCorsHeadersPass && browserConversion.summary.publicBrowserConversionPass;
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    public_asset_cors_ready: publicAssetCorsReady,
    jpg_webp_downloads_ready: exposureDecision.summary.technicallySafeToExposeJpgJpegWebp,
    print_quality_ready: browserConversion.summary.publicBrowserConversionPass || browserConversion.summary.localCorsRegressionPass === true,
    ready_for_full_asset_upload: false,
    ready_for_image_sitemap: false,
    ready_for_og_images: false,
    ready_for_live_ads: false,
    summary: {
      publicAssetBaseReady: assetValidation.public_cors_validation_ready,
      publicCorsHeadersPass: headerResults.summary.publicCorsHeadersPass,
      publicBrowserConversionPass: browserConversion.summary.publicBrowserConversionPass,
      round4uAdDensityStillRequired: true,
      adDensityPolicy: "Round 4U ad density remains in force during public CORS validation.",
      fullAssetUploadDeferred: true,
      imageSitemapDeferred: true,
      openGraphImageDeferred: true,
      liveAdsDeferred: true,
    },
    blockers: [
      ...assetValidation.blockers,
      ...(publicAssetCorsReady ? [] : ["Public asset-domain CORS and browser canvas export are not fully verified."]),
      "Full asset upload remains deferred until final production staging.",
      "Image sitemap, Open Graph images, and live AdSense remain deferred.",
    ],
    ownerActionItems: [
      "Provide or confirm the final public asset domain ending in /coloring-pages.",
      "Configure R2/custom-domain CORS for the local preview and final site origins.",
      "Rerun Round 5A against the public asset base before exposing JPG/WebP downloads.",
    ],
  };
}

async function verifyOneAsset(record, kind, asset, origins) {
  const result = {
    sampleId: record.sampleId,
    title: record.title,
    kind,
    url: asset.url,
    expectedContentType: asset.expectedContentType,
    status: 0,
    statusOk: false,
    contentType: "",
    contentTypeOk: false,
    accessControlAllowOrigin: "",
    accessControlAllowOriginOk: false,
    cacheControl: "",
    privateEndpointRedirect: false,
    xmlAccessDenied: false,
    r2ErrorHtml: false,
    pass: false,
    error: "",
  };
  if (!asset.url) {
    result.error = "missing-url";
    return result;
  }

  try {
    const origin = origins[0] || "http://localhost:3005";
    const response = await fetch(asset.url, { method: "GET", headers: { Origin: origin } });
    const text = await response.clone().text().catch(() => "");
    const finalUrl = response.url || asset.url;
    const contentType = response.headers.get("content-type") || "";
    const accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    result.status = response.status;
    result.statusOk = response.status === 200;
    result.contentType = contentType;
    result.contentTypeOk = contentType.toLowerCase().startsWith(asset.expectedContentType);
    result.accessControlAllowOrigin = accessControlAllowOrigin;
    result.accessControlAllowOriginOk = accessControlAllowOrigin === "*" || origins.includes(accessControlAllowOrigin);
    result.cacheControl = response.headers.get("cache-control") || "";
    result.privateEndpointRedirect = /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(finalUrl);
    result.xmlAccessDenied = /<Error>|AccessDenied|Access Denied/i.test(text.slice(0, 1000));
    result.r2ErrorHtml = /Cloudflare|R2|Error/i.test(text.slice(0, 1000)) && contentType.includes("text/html");
    result.pass =
      result.statusOk &&
      result.contentTypeOk &&
      result.accessControlAllowOriginOk &&
      !result.privateEndpointRedirect &&
      !result.xmlAccessDenied &&
      !result.r2ErrorHtml &&
      !asset.url.includes("/coloring/test-v1") &&
      !asset.url.includes("/coloring-pages/coloring-pages");
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

async function writeProjectContextReport(context) {
  await writeReport("pipeline/reports/round-5a-project-context-check.md", "Round 5A Project Context Check", [
    `Correct repository: ${context.summary.correctRepository}`,
    `Branch: ${context.summary.branch}`,
    `Round 4Z revised commit present: ${context.summary.round4zCommitExists}`,
    `Static export configured: ${context.summary.staticExportConfigured}`,
    `API route present: ${context.summary.appApiRoutePresent}`,
    `Public downloads PNG-only before validation: ${context.summary.publicDownloadsPngOnlyBeforeValidation}`,
    `SVG user download exposed: ${context.summary.svgUserDownloadExposed}`,
    `Contact email: ${context.summary.contactEmail}`,
  ]);
}

async function writeConversionAuditReport(audit) {
  await writeReport("pipeline/reports/round-5a-conversion-implementation-audit.md", "Round 5A Conversion Implementation Audit", [
    `Internal SVG conversion path present: ${audit.summary.internalSvgConversionPathPresent}`,
    `PNG fallback present: ${audit.summary.pngFallbackPresent}`,
    `Print prefers high-quality source: ${audit.summary.printPrefersHighQualitySource}`,
    `CORS failure handling present: ${audit.summary.corsFailureHandlingPresent}`,
    `SVG remains hidden from user downloads: ${audit.summary.userFacingSvgDownloadHidden}`,
    `JPG/JPEG/WebP controls hidden: ${audit.summary.jpgJpegWebpControlsHidden}`,
    `Round 4Z local conversion passed: ${audit.summary.round4zLocalConversionPassed}`,
  ]);
}

async function writeAssetBaseReport(validation) {
  await writeReport("pipeline/reports/round-5a-public-asset-base-validation.md", "Round 5A Public Asset Base Validation", [
    `Asset base URL configured: ${validation.summary.assetBaseUrlConfigured}`,
    `Asset base URL source: ${validation.summary.assetBaseUrlSource}`,
    `Asset base URL tested: ${validation.summary.redactedAssetBaseUrl || "(missing)"}`,
    `Public CORS validation ready: ${validation.public_cors_validation_ready}`,
    `Custom domain: ${validation.summary.isCustomDomain}`,
    `r2.dev temporary test URL: ${validation.summary.isTemporaryR2Dev}`,
    `Localhost URL: ${validation.summary.isLocalhost}`,
    `Private R2 endpoint: ${validation.summary.isPrivateR2Endpoint}`,
    `Blockers: ${validation.blockers.length ? validation.blockers.join(" ") : "none"}`,
  ]);
}

async function writeTestSelectionReport(selection) {
  await writeReport("pipeline/reports/round-5a-public-cors-test-selection.md", "Round 5A Public CORS Test Selection", [
    `Public asset base ready: ${selection.publicAssetBaseReady}`,
    `Selected records: ${selection.selectedCount}`,
    selection.publicSubsetAssumption,
    ...selection.records.map((record) => `${record.sampleId}: ${record.title}, ${record.route}`),
  ]);
}

async function writeHeaderReport(results) {
  await writeReport("pipeline/reports/round-5a-public-cors-header-report.md", "Round 5A Public CORS Header Report", [
    `Public asset base ready: ${results.publicAssetBaseReady}`,
    `Skipped: ${Boolean(results.skipped)}`,
    `Public CORS headers pass: ${results.summary.publicCorsHeadersPass}`,
    `Assets checked: ${results.summary.totalAssetsChecked}`,
    `Status 200 count: ${results.summary.status200Count}`,
    `Content-Type OK count: ${results.summary.contentTypeOkCount}`,
    `Access-Control-Allow-Origin OK count: ${results.summary.accessControlAllowOriginOkCount}`,
    `No XML access denied: ${results.summary.noXmlAccessDenied}`,
    `No R2 error HTML: ${results.summary.noR2ErrorHtml}`,
    results.skipped ? `Skipped reason: ${results.skippedReason}` : "Header checks completed against selected public records.",
  ]);
}

async function writeBrowserConversionReport(results) {
  await writeReport("pipeline/reports/round-5a-browser-public-conversion-report.md", "Round 5A Browser Public Conversion Report", [
    `Public browser conversion pass: ${results.summary.publicBrowserConversionPass}`,
    `Public internal SVG loads: ${results.summary.publicInternalSvgLoads}`,
    `Public canvas tainted: ${results.summary.publicCanvasTainted}`,
    `Public PNG blob export succeeded: ${results.summary.publicPngBlobExportSucceeded}`,
    `Public JPEG blob export succeeded: ${results.summary.publicJpegBlobExportSucceeded}`,
    `Public WebP blob export succeeded: ${results.summary.publicWebpBlobExportSucceeded}`,
    `Print flow uses generated output: ${results.summary.printFlowUsesGeneratedOutput}`,
    `Local CORS regression pass: ${results.summary.localCorsRegressionPass}`,
    `JPG/WebP controls remain hidden: ${results.summary.visibleJpegWebpControlsRemainHidden}`,
    results.skipped ? `Skipped reason: ${results.skippedReason}` : "Browser conversion QA completed.",
  ]);
}

async function writeExposureDecisionReport(decision) {
  await writeReport("pipeline/reports/round-5a-download-format-exposure-decision.md", "Round 5A Download Format Exposure Decision", [
    `Public CORS headers pass: ${decision.summary.publicCorsHeadersPass}`,
    `Public browser conversion pass: ${decision.summary.publicBrowserConversionPass}`,
    `Technically safe to expose JPG/JPEG/WebP: ${decision.summary.technicallySafeToExposeJpgJpegWebp}`,
    `JPG/JPEG/WebP controls exposed: ${decision.summary.jpgJpegWebpControlsExposed}`,
    `Current public download formats: ${decision.summary.currentPublicDownloadFormats.join(", ")}`,
    `SVG internal only: ${decision.summary.svgInternalOnly}`,
    decision.summary.defaultDecision,
  ]);
}

async function writeCorsGuideReport(guide) {
  const policy = JSON.stringify(guide.examplePolicy, null, 2);
  await writeReport("pipeline/reports/round-5a-r2-cors-configuration-guide.md", "Round 5A R2 CORS Configuration Guide", [
    `Official Cloudflare R2 CORS docs: ${CLOUDFLARE_R2_CORS_DOC}`,
    `Official Cloudflare R2 CORS API reference: ${CLOUDFLARE_R2_API_CORS_DOC}`,
    `Allowed origins: ${guide.requiredOrigins.join(", ")}`,
    `Allowed methods: ${guide.requiredMethods.join(", ")}`,
    `Allowed headers: ${guide.requiredHeaders.join(", ")}`,
    `Expose headers: ${guide.exposeHeaders.join(", ")}`,
    `Max age seconds: ${guide.maxAgeSeconds}`,
    "Access-Control-Allow-Origin must be returned for browser requests from the local preview origin and final production origin.",
    "SVG and PNG both need CORS because canvas export must stay origin-clean.",
    "No credentials are needed for public static image reads.",
    "Full asset upload remains final-stage.",
    "Example policy:",
    "```json",
    policy,
    "```",
  ]);
}

async function writeBrowserQaReport(results) {
  await writeReport("pipeline/reports/round-5a-browser-qa-report.md", "Round 5A Browser QA Report", [
    `Skipped: ${Boolean(results.skipped)}`,
    `Real media renders: ${results.summary.realMediaRenders}`,
    `Print uses high-quality conversion if CORS works: ${results.summary.printUsesHighQualityConversionIfCorsWorks}`,
    `Print fallback clean if CORS missing: ${results.summary.printFallbackCleanIfCorsMissing}`,
    `PNG download works: ${results.summary.pngDownloadWorks}`,
    `SVG download absent: ${results.summary.svgDownloadAbsent}`,
    `JPG/WebP controls absent: ${results.summary.jpegWebpControlsAbsent}`,
    `Ad density matches Round 4U: ${results.summary.adDensityMatchesRound4U}`,
    `No horizontal overflow: ${results.summary.noHorizontalOverflow}`,
    "Screenshots:",
    ...(results.screenshots || []).map((shot) => `- ${typeof shot === "string" ? shot : shot.path}`),
  ]);
}

async function writeLaunchAdjustmentReport(launch) {
  await writeReport("pipeline/reports/round-5a-launch-readiness-adjustment.md", "Round 5A Launch Readiness Adjustment", [
    `Public asset CORS ready: ${launch.public_asset_cors_ready}`,
    `JPG/WebP downloads ready: ${launch.jpg_webp_downloads_ready}`,
    `Print quality ready: ${launch.print_quality_ready}`,
    `Ready for full asset upload: ${launch.ready_for_full_asset_upload}`,
    `Ready for image sitemap: ${launch.ready_for_image_sitemap}`,
    `Ready for OG images: ${launch.ready_for_og_images}`,
    `Ready for live ads: ${launch.ready_for_live_ads}`,
    "Full asset upload remains deferred.",
    `Blockers: ${launch.blockers.join(" ")}`,
    "Round 5B recommendation: configure and verify a final public asset custom domain with CORS, then expose JPG/WebP only after owner acceptance.",
  ]);
}

async function loadPublicEnv() {
  const localEnv = await parseEnvFile(".env.local");
  const envExample = await parseEnvFile(".env.example");
  const keys = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_COLORING_ASSET_BASE_URL", "NEXT_PUBLIC_CONTACT_EMAIL"];
  const result = {};
  for (const key of keys) {
    if (process.env[key]) result[key] = { value: process.env[key], source: "process.env" };
    else if (localEnv[key]) result[key] = { value: localEnv[key], source: ".env.local" };
    else if (envExample[key]) result[key] = { value: "", source: "missing_runtime_env" };
    else result[key] = { value: "", source: "missing" };
  }
  return result;
}

async function parseEnvFile(relativePath) {
  if (!existsSync(path.join(REPO_ROOT, relativePath))) return {};
  const text = await readText(relativePath);
  const entries = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key.startsWith("NEXT_PUBLIC_")) continue;
    entries[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
  return entries;
}

function getPublicEnvValue(key) {
  return process.env[key] || "";
}

function inspectUrl(value, options) {
  const status = {
    configured: Boolean(value),
    isHttpUrl: false,
    isLocalhost: false,
    isR2Dev: false,
    isPrivateR2Endpoint: false,
    hasColoringPagesPrefix: false,
    hasOldTestPrefix: false,
    hasDuplicateColoringPagesPrefix: false,
    ready: false,
  };
  if (!value) return status;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    status.isHttpUrl = url.protocol === "http:" || url.protocol === "https:";
    status.isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    status.isR2Dev = host.endsWith(".r2.dev");
    status.isPrivateR2Endpoint = host.includes("r2.cloudflarestorage.com") || host.includes("amazonaws.com");
    status.hasColoringPagesPrefix = url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
    status.hasOldTestPrefix = url.pathname.includes("/coloring/test-v1");
    status.hasDuplicateColoringPagesPrefix = url.pathname.includes("/coloring-pages/coloring-pages");
    status.ready =
      status.isHttpUrl &&
      !status.isLocalhost &&
      !status.isPrivateR2Endpoint &&
      !status.hasOldTestPrefix &&
      !status.hasDuplicateColoringPagesPrefix &&
      (!options.requireColoringPagesPrefix || status.hasColoringPagesPrefix);
  } catch {
    return status;
  }
  return status;
}

function getOriginCandidates() {
  const origins = ["http://localhost:3005", "http://127.0.0.1:3005"];
  const siteUrl = getPublicEnvValue("NEXT_PUBLIC_SITE_URL");
  if (siteUrl) {
    try {
      const origin = new URL(siteUrl).origin;
      if (!origins.includes(origin)) origins.push(origin);
    } catch {
      // Ignore invalid site URL for CORS probing.
    }
  }
  return origins;
}

function buildAssetRecord(assetBaseUrl, subpath, expectedContentType) {
  return {
    subpath,
    expectedContentType,
    url: assetBaseUrl ? `${assetBaseUrl.replace(/\/+$/, "")}/${encodeAssetSubpath(subpath)}` : "",
  };
}

function encodeAssetSubpath(assetSubpath) {
  return assetSubpath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return value;
  }
}

async function readProjectSource() {
  const chunks = [];
  for (const relativeRoot of ["app", "src/components", "src/lib"]) {
    for (const file of await listFiles(relativeRoot)) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFiles(relativeRoot) {
  const root = path.join(REPO_ROOT, relativeRoot);
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replaceAll("\\", "/"));
    }
  }
  await walk(root);
  return results.sort();
}

function hasPublicGeneratedMedia() {
  return ["png", "svg", "thumbs", "coloring-pages"].some((folder) => existsSync(path.join(REPO_ROOT, "public", folder)));
}

async function readJsonIfExists(relativePath) {
  if (!existsSync(path.join(REPO_ROOT, relativePath))) return null;
  return readJson(relativePath);
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeReport(relativePath, title, bullets) {
  const body = [`# ${title}`, "", ...bullets.map((item) => (item.startsWith("```") ? item : `- ${item}`)), ""].join("\n");
  await writeFile(path.join(REPO_ROOT, relativePath), body);
}

function safeGit(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
