#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RUN_ID = "round-5f-svg-webp-public-verification";
const PLAN_PATH = "pipeline/manifests/round-5c-svg-webp-url-verification-plan.json";

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5f-project-context-check.json",
  publicBase: "pipeline/manifests/round-5f-public-asset-base-validation.json",
  publicUrls: "pipeline/manifests/round-5f-svg-webp-public-url-results.json",
  cors: "pipeline/manifests/round-5f-svg-cors-results.json",
  downloadReadiness: "pipeline/manifests/round-5f-download-format-readiness.json",
  finalUploadReadiness: "pipeline/manifests/round-5f-final-upload-readiness.json",
  corsGuide: "pipeline/manifests/round-5f-r2-cors-content-type-update.json",
  assetStrategy: "pipeline/manifests/round-5f-asset-strategy-results.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5f-project-context-check.md",
  publicBase: "pipeline/reports/round-5f-public-asset-base-validation.md",
  publicUrls: "pipeline/reports/round-5f-svg-webp-public-url-results.md",
  cors: "pipeline/reports/round-5f-svg-cors-report.md",
  downloadReadiness: "pipeline/reports/round-5f-download-format-readiness.md",
  finalUploadReadiness: "pipeline/reports/round-5f-final-upload-readiness.md",
  corsGuide: "pipeline/reports/round-5f-r2-cors-content-type-update.md",
  assetStrategy: "pipeline/reports/round-5f-asset-strategy-report.md",
  nextPhase: "pipeline/reports/round-5f-next-phase-plan.md",
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await readJson(PLAN_PATH);
  const publicBaseUrl = normalizeBaseUrl(args.publicBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "");
  const projectContext = await buildProjectContext(publicBaseUrl);
  const publicBaseValidation = buildPublicBaseValidation(publicBaseUrl);
  const urlResults = publicBaseValidation.summary.publicVerificationReady
    ? await runUrlChecks(plan, publicBaseUrl, publicBaseValidation)
    : buildNotRunUrlResults(plan, publicBaseUrl, publicBaseValidation);
  const corsResults = buildCorsResults(urlResults, publicBaseValidation);
  const browserQa = await readJsonIfExists("pipeline/manifests/round-5f-browser-svg-webp-public-qa-results.json");
  const downloadReadiness = buildDownloadReadiness(urlResults, corsResults, browserQa);
  const finalUploadReadiness = buildFinalUploadReadiness(urlResults, corsResults, browserQa, publicBaseValidation);
  const corsGuide = buildCorsGuide(urlResults, corsResults, publicBaseValidation);
  const assetStrategy = buildAssetStrategyResults(urlResults, corsResults, browserQa, publicBaseValidation, downloadReadiness, finalUploadReadiness);

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeJson(OUTPUTS.publicBase, publicBaseValidation);
  await writeJson(OUTPUTS.publicUrls, urlResults);
  await writeJson(OUTPUTS.cors, corsResults);
  await writeJson(OUTPUTS.downloadReadiness, downloadReadiness);
  await writeJson(OUTPUTS.finalUploadReadiness, finalUploadReadiness);
  await writeJson(OUTPUTS.corsGuide, corsGuide);
  await writeJson(OUTPUTS.assetStrategy, assetStrategy);

  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeText(REPORTS.publicBase, renderPublicBaseReport(publicBaseValidation));
  await writeText(REPORTS.publicUrls, renderUrlResultsReport(urlResults));
  await writeText(REPORTS.cors, renderCorsReport(corsResults));
  await writeText(REPORTS.downloadReadiness, renderDownloadReadinessReport(downloadReadiness));
  await writeText(REPORTS.finalUploadReadiness, renderFinalUploadReadinessReport(finalUploadReadiness));
  await writeText(REPORTS.corsGuide, renderCorsGuideReport(corsGuide));
  await writeText(REPORTS.assetStrategy, renderAssetStrategyReport(assetStrategy));
  await writeText(REPORTS.nextPhase, renderNextPhasePlan(assetStrategy));

  console.log(JSON.stringify({
    runId: RUN_ID,
    publicBaseUrl: publicBaseValidation.summary.publicBaseUrlRedacted || "",
    publicVerificationReady: publicBaseValidation.summary.publicVerificationReady,
    status: urlResults.summary.status,
    publicUrlVerificationPassed: urlResults.summary.publicUrlVerificationPassed,
    svgCorsPassed: corsResults.summary.svgCorsPassed,
    checkedUrlCount: urlResults.summary.checkedUrlCount,
  }, null, 2));

}

async function buildProjectContext(publicBaseUrl) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim();
  const repo = path.basename(repoRoot.replace(/\\/g, "/"));
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const round5eCommitExists = await gitCommitExists("c452677");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src"]);
  const testBundleFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages"));
  const svgFiles = testBundleFiles.filter((file) => file.endsWith(".svg"));
  const webpFiles = testBundleFiles.filter((file) => file.endsWith(".webp"));
  const pngFiles = testBundleFiles.filter((file) => file.endsWith(".png"));
  const thumbFiles = testBundleFiles.filter((file) => normalizePath(file).includes("/thumbs/"));

  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-project-context-check",
    publicBaseUrlSource: publicBaseUrl ? "process-env-or-cli" : "missing",
    summary: {
      correctRepository: repo === "i-love-coloring-page",
      repo,
      branch,
      head,
      round5eCommitExists,
      appApiRoutePresent: appFiles.some((file) => normalizePath(file).includes("/api/")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubSlugRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      testBundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages")),
      testBundleSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "svg")),
      testBundleWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "webp")),
      testBundleSvgCount: svgFiles.length,
      testBundleWebpCount: webpFiles.length,
      testBundlePngCount: pngFiles.length,
      testBundleThumbCount: thumbFiles.length,
      publicGeneratedMediaPresent: publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)),
      sourceImagesUntouched: (await gitStatusFor("images")).trim() === "",
      ilovesvgUntouched: (await gitStatusFor("ilovesvg")).trim() === "",
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(projectText),
      currentPublicDownloadFormats: getPublicDownloadFormats(projectText),
      jpgJpegWebpControlsVisible: /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/i.test(projectText),
      adWellsVisibleByDefault: /Advertisement/.test(projectText) && !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(projectText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
      wrongTaskContextDetected: /image-to-favicon-generator|Vite|SVG wrapper/i.test(projectText),
    },
  };
}

function buildPublicBaseValidation(publicBaseUrl) {
  const result = {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-public-asset-base-validation",
    sourceEnvVar: "NEXT_PUBLIC_COLORING_ASSET_BASE_URL",
    rawValueCaptured: false,
    summary: {
      publicBaseUrlConfigured: Boolean(publicBaseUrl),
      publicBaseUrlRedacted: redactUrl(publicBaseUrl),
      publicVerificationReady: false,
      isHttpOrHttps: false,
      includesColoringPagesPrefix: false,
      isLocalhost: false,
      hasOldTestPrefix: false,
      hasDuplicateColoringPagesPrefix: false,
      privateR2Endpoint: false,
      isR2Dev: false,
      isCustomDomain: false,
      credentialsInUrl: false,
      noCredentialsAppearInUrl: true,
      baseType: "missing",
    },
    blockers: [],
    notes: [],
  };

  if (!publicBaseUrl) {
    result.blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not configured for this shell. Public SVG/WebP verification was not run.");
    return result;
  }

  let url;
  try {
    url = new URL(publicBaseUrl);
  } catch {
    result.summary.baseType = "invalid";
    result.blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not a valid URL.");
    return result;
  }

  const host = url.hostname.toLowerCase();
  result.summary.isHttpOrHttps = url.protocol === "http:" || url.protocol === "https:";
  result.summary.includesColoringPagesPrefix = url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
  result.summary.isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  result.summary.hasOldTestPrefix = url.pathname.includes("/coloring/test-v1");
  result.summary.hasDuplicateColoringPagesPrefix = url.pathname.includes("/coloring-pages/coloring-pages");
  result.summary.privateR2Endpoint = host.includes("r2.cloudflarestorage.com") || host.includes("amazonaws.com");
  result.summary.isR2Dev = host.endsWith(".r2.dev");
  result.summary.isCustomDomain = !result.summary.isR2Dev && !result.summary.privateR2Endpoint && !result.summary.isLocalhost;
  result.summary.credentialsInUrl = Boolean(url.username || url.password || /(?:access|secret|token|key)=/i.test(url.search));
  result.summary.noCredentialsAppearInUrl = !result.summary.credentialsInUrl;
  result.summary.baseType = result.summary.isLocalhost ? "local" : result.summary.isR2Dev ? "r2.dev" : result.summary.isCustomDomain ? "custom-domain" : "candidate-public";

  if (!result.summary.isHttpOrHttps) result.blockers.push("Public asset base must use HTTP or HTTPS.");
  if (!result.summary.includesColoringPagesPrefix) result.blockers.push("Public asset base must include the /coloring-pages prefix.");
  if (result.summary.isLocalhost) result.blockers.push("Localhost is not valid for public R2 verification.");
  if (result.summary.hasOldTestPrefix) result.blockers.push("Public asset base uses the stale /coloring/test-v1 prefix.");
  if (result.summary.hasDuplicateColoringPagesPrefix) result.blockers.push("Public asset base contains duplicate /coloring-pages/coloring-pages.");
  if (result.summary.privateR2Endpoint) result.blockers.push("Public asset base points to a private R2/S3 endpoint.");
  if (result.summary.credentialsInUrl) result.blockers.push("Public asset base URL appears to contain credentials or token-like query parameters.");
  if (result.summary.isR2Dev) result.notes.push("r2.dev is acceptable for this temporary test only; production should use a custom asset domain.");

  result.summary.publicVerificationReady = result.blockers.length === 0;
  return result;
}

async function runUrlChecks(plan, publicBaseUrl, publicBaseValidation) {
  const origins = getOriginCandidates();
  const checks = [];
  for (const entry of plan.allUrls) {
    checks.push(await checkUrl(entry, publicBaseUrl, origins));
  }

  const svgChecks = checks.filter((check) => check.mediaType === "svg");
  const webpChecks = checks.filter((check) => check.mediaType === "webp");
  const publicUrlResolutionPassed =
    checks.length === plan.summary.plannedUrlCount &&
    checks.every((check) =>
      check.getStatusOk &&
      check.contentTypeOk &&
      check.nonZeroBytes &&
      !check.privateEndpointRedirect &&
      !check.accessDeniedXml &&
      !check.cloudflareErrorHtml &&
      !check.oldPrefix &&
      !check.doubleColoringPagesPrefix &&
      !check.localFilesystemPathLeak
    );

  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-svg-webp-public-url-results",
    sourcePlan: PLAN_PATH,
    publicBaseValidationSummary: publicBaseValidation.summary,
    summary: {
      status: "completed",
      publicBaseUrlConfigured: true,
      publicBaseUrlRedacted: publicBaseValidation.summary.publicBaseUrlRedacted,
      baseType: publicBaseValidation.summary.baseType,
      publicUrlResolutionPassed,
      publicUrlVerificationPassed: publicUrlResolutionPassed,
      contentTypesPassed: svgChecks.every((check) => check.contentTypeOk) && webpChecks.every((check) => check.contentTypeOk),
      plannedUrlCount: plan.summary.plannedUrlCount,
      plannedSvgUrlCount: plan.summary.svgUrlCount,
      plannedWebpUrlCount: plan.summary.webpUrlCount,
      checkedUrlCount: checks.length,
      svgCheckedCount: svgChecks.length,
      webpCheckedCount: webpChecks.length,
      http200Count: checks.filter((check) => check.getStatusOk).length,
      headOkCount: checks.filter((check) => check.headStatusOk).length,
      svgContentTypePassCount: svgChecks.filter((check) => check.contentTypeOk).length,
      webpContentTypePassCount: webpChecks.filter((check) => check.contentTypeOk).length,
      nonZeroByteCount: checks.filter((check) => check.nonZeroBytes).length,
      svgCorsPassCount: svgChecks.filter((check) => check.corsOk).length,
      noAccessDeniedXml: checks.every((check) => !check.accessDeniedXml),
      noCloudflareErrorHtml: checks.every((check) => !check.cloudflareErrorHtml),
      noPrivateEndpointRedirect: checks.every((check) => !check.privateEndpointRedirect),
      noOldTestPrefix: checks.every((check) => !check.oldPrefix),
      noDoubleColoringPagesPrefix: checks.every((check) => !check.doubleColoringPagesPrefix),
      noLocalFilesystemPathLeak: checks.every((check) => !check.localFilesystemPathLeak),
      cacheHeadersObserved: [...new Set(checks.map((check) => check.cacheControl).filter(Boolean))],
    },
    checks,
    blockers: publicUrlResolutionPassed ? [] : ["One or more public SVG/WebP URL checks failed. Fix upload placement, content types, object keys, or cache/object settings before proceeding."],
  };
}

async function checkUrl(entry, publicBaseUrl, origins) {
  const url = buildPublicUrl(publicBaseUrl, entry.r2ObjectKey);
  const origin = origins[0];
  const result = {
    assetId: entry.assetId,
    displayTitle: entry.displayTitle,
    mediaType: entry.mediaType,
    r2ObjectKey: entry.r2ObjectKey,
    url,
    expectedContentType: entry.expectedContentType,
    expectedCorsRequired: entry.expectedCorsRequired,
    getStatus: 0,
    getStatusOk: false,
    headStatus: 0,
    headStatusOk: false,
    contentType: "",
    contentTypeOk: false,
    cacheControl: "",
    accessControlAllowOrigin: "",
    accessControlAllowCredentials: "",
    corsHeaderPresent: false,
    corsOk: false,
    credentialsRequired: false,
    nonZeroBytes: false,
    byteLength: 0,
    privateEndpointRedirect: false,
    accessDeniedXml: false,
    cloudflareErrorHtml: false,
    oldPrefix: url.includes("/coloring/test-v1"),
    doubleColoringPagesPrefix: url.includes("/coloring-pages/coloring-pages"),
    localFilesystemPathLeak: /[A-Z]:\\|file:\/\//i.test(url),
    error: "",
  };

  try {
    const response = await fetch(url, { method: "GET", headers: { Origin: origin } });
    const body = await response.arrayBuffer();
    const textSample = Buffer.from(body).toString("utf8", 0, Math.min(1200, body.byteLength));
    result.getStatus = response.status;
    result.getStatusOk = response.status === entry.expectedHttpStatus;
    result.contentType = response.headers.get("content-type") || "";
    result.contentTypeOk = isAcceptableContentType(entry.mediaType, result.contentType, entry.expectedContentType);
    result.cacheControl = response.headers.get("cache-control") || "";
    result.accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    result.accessControlAllowCredentials = response.headers.get("access-control-allow-credentials") || "";
    result.corsHeaderPresent = Boolean(result.accessControlAllowOrigin);
    result.corsOk = entry.mediaType !== "svg" || allowsOrigin(result.accessControlAllowOrigin, origins);
    result.credentialsRequired = result.accessControlAllowCredentials.toLowerCase() === "true";
    result.byteLength = body.byteLength;
    result.nonZeroBytes = body.byteLength > 0;
    result.privateEndpointRedirect = /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(response.url || url);
    result.accessDeniedXml = /<Error>|AccessDenied|Access Denied/i.test(textSample);
    result.cloudflareErrorHtml = result.contentType.includes("text/html") && /Cloudflare|R2|Error/i.test(textSample);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const head = await fetch(url, { method: "HEAD", headers: { Origin: origin } });
    result.headStatus = head.status;
    result.headStatusOk = head.ok;
  } catch {
    result.headStatus = 0;
    result.headStatusOk = false;
  }

  return result;
}

function buildNotRunUrlResults(plan, publicBaseUrl, publicBaseValidation) {
  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-svg-webp-public-url-results",
    sourcePlan: PLAN_PATH,
    publicBaseValidationSummary: publicBaseValidation.summary,
    summary: {
      status: "not_run",
      publicBaseUrlConfigured: Boolean(publicBaseUrl),
      publicBaseUrlRedacted: publicBaseValidation.summary.publicBaseUrlRedacted,
      baseType: publicBaseValidation.summary.baseType,
      publicUrlResolutionPassed: false,
      publicUrlVerificationPassed: false,
      contentTypesPassed: false,
      plannedUrlCount: plan.summary.plannedUrlCount,
      plannedSvgUrlCount: plan.summary.svgUrlCount,
      plannedWebpUrlCount: plan.summary.webpUrlCount,
      checkedUrlCount: 0,
      svgCheckedCount: 0,
      webpCheckedCount: 0,
      http200Count: 0,
      headOkCount: 0,
      svgContentTypePassCount: 0,
      webpContentTypePassCount: 0,
      nonZeroByteCount: 0,
      svgCorsPassCount: 0,
      noAccessDeniedXml: true,
      noCloudflareErrorHtml: true,
      noPrivateEndpointRedirect: true,
      noOldTestPrefix: !publicBaseValidation.summary.hasOldTestPrefix,
      noDoubleColoringPagesPrefix: !publicBaseValidation.summary.hasDuplicateColoringPagesPrefix,
      noLocalFilesystemPathLeak: true,
      cacheHeadersObserved: [],
    },
    checks: [],
    blockers: publicBaseValidation.blockers,
  };
}

function buildCorsResults(urlResults, publicBaseValidation) {
  const svgChecks = urlResults.checks.filter((check) => check.mediaType === "svg");
  const status = urlResults.summary.status === "completed" ? "completed" : "not_run";
  const svgCorsPassed =
    status === "completed" &&
    svgChecks.length === 30 &&
    svgChecks.every((check) => check.getStatusOk && check.corsOk && !check.credentialsRequired);

  const missingHeaders = svgChecks
    .filter((check) => !check.corsOk)
    .map((check) => ({
      assetId: check.assetId,
      r2ObjectKey: check.r2ObjectKey,
      observedAccessControlAllowOrigin: check.accessControlAllowOrigin || "",
      observedAccessControlAllowCredentials: check.accessControlAllowCredentials || "",
      problem: check.corsHeaderPresent ? "origin-not-allowed" : "missing-access-control-allow-origin",
    }));

  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-svg-cors-results",
    summary: {
      status,
      svgCorsPassed,
      svgUrlCount: 30,
      svgCheckedCount: svgChecks.length,
      svgGetPassCount: svgChecks.filter((check) => check.getStatusOk).length,
      svgHeadPassCount: svgChecks.filter((check) => check.headStatusOk).length,
      svgCorsHeaderPassCount: svgChecks.filter((check) => check.corsOk).length,
      credentialsRequiredCount: svgChecks.filter((check) => check.credentialsRequired).length,
      browserCanLoadCrossOriginAnonymous: svgCorsPassed,
      canvasUntaintedVerifiedInBrowser: false,
      publicBaseType: publicBaseValidation.summary.baseType,
    },
    allowedOriginsChecked: getOriginCandidates(),
    missingOrWrongHeaders: missingHeaders,
    blockers: svgCorsPassed
      ? []
      : status === "not_run"
        ? publicBaseValidation.blockers
        : ["SVG CORS did not pass for every uploaded test SVG. Canvas conversion must remain gated."],
  };
}

function buildDownloadReadiness(urlResults, corsResults, browserQa) {
  const browserCanvasExportPassed = Boolean(browserQa?.summary?.browserCanvasExportPassed);
  const browserConversionReady =
    urlResults.summary.publicUrlVerificationPassed &&
    corsResults.summary.svgCorsPassed &&
    browserCanvasExportPassed;
  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-download-format-readiness",
    summary: {
      browserConversionReady,
      publicWebpUrlsPassed: urlResults.summary.webpContentTypePassCount === 30,
      publicSvgUrlsPassed: urlResults.summary.svgContentTypePassCount === 30,
      svgCorsPassed: corsResults.summary.svgCorsPassed,
      browserCanvasExportPassed,
      jpgJpegWebpControlsReadyForOwnerApproval: browserConversionReady,
      jpgJpegWebpControlsRemainHidden: !browserConversionReady,
      svgUserDownloadExposed: false,
      currentPublicDownloadFormats: ["PNG"],
      publicDownloadsRemainPngOnly: true,
    },
    decision: browserConversionReady
      ? "Public conversion is technically ready for owner review, but controls remain hidden in this round by default."
      : "Keep public downloads PNG-only. Do not expose JPG, JPEG, or WebP controls until public SVG CORS and browser canvas export both pass.",
    blockers: browserConversionReady ? [] : [...new Set([...urlResults.blockers, ...corsResults.blockers, "Browser canvas export has not passed against the public test asset base."])],
  };
}

function buildFinalUploadReadiness(urlResults, corsResults, browserQa, publicBaseValidation) {
  const browserCanvasExportPassed = Boolean(browserQa?.summary?.browserCanvasExportPassed);
  const svgWebpTestPassed = urlResults.summary.publicUrlVerificationPassed && corsResults.summary.svgCorsPassed && browserCanvasExportPassed;
  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-final-upload-readiness",
    finalR2Folders: ["svg", "webp"],
    excludedFolders: ["png", "thumbs"],
    summary: {
      svgWebpTestPassed,
      svgWebpOnlyModelStillValid: true,
      pngThumbsCanStayExcluded: true,
      contentTypesCorrect: urlResults.summary.svgContentTypePassCount === 30 && urlResults.summary.webpContentTypePassCount === 30,
      corsCorrect: corsResults.summary.svgCorsPassed,
      cacheHeadersAcceptable: urlResults.summary.cacheHeadersObserved.length > 0,
      finalCustomDomainStillNeeded: !publicBaseValidation.summary.isCustomDomain,
      fullUploadDeferred: true,
      readyForFullUpload: false,
      imageSitemapDeferred: true,
      openGraphImagesDeferred: true,
      liveAdsDeferred: true,
    },
    beforeFullUpload: [
      "Upload only after the owner approves the public SVG plus WebP test results.",
      "Configure SVG as image/svg+xml and WebP as image/webp.",
      "Configure R2/custom-domain CORS for SVG conversion.",
      "Use a final custom asset domain before image sitemap or Open Graph image work.",
      "Do not include png/ or thumbs/ unless a later blocker explicitly reverses the SVG plus WebP plan.",
    ],
  };
}

function buildCorsGuide(urlResults, corsResults, publicBaseValidation) {
  const observedSvgHeaders = urlResults.checks
    .filter((check) => check.mediaType === "svg")
    .slice(0, 5)
    .map((check) => ({
      r2ObjectKey: check.r2ObjectKey,
      contentType: check.contentType,
      cacheControl: check.cacheControl,
      accessControlAllowOrigin: check.accessControlAllowOrigin,
      accessControlAllowCredentials: check.accessControlAllowCredentials,
    }));
  const observedWebpHeaders = urlResults.checks
    .filter((check) => check.mediaType === "webp")
    .slice(0, 5)
    .map((check) => ({
      r2ObjectKey: check.r2ObjectKey,
      contentType: check.contentType,
      cacheControl: check.cacheControl,
      accessControlAllowOrigin: check.accessControlAllowOrigin,
    }));
  const allowedOrigins = getOriginCandidates();

  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-r2-cors-content-type-update",
    source: "Round 5F observed public SVG/WebP test headers",
    summary: {
      publicBaseType: publicBaseValidation.summary.baseType,
      publicVerificationReady: publicBaseValidation.summary.publicVerificationReady,
      svgCorsPassed: corsResults.summary.svgCorsPassed,
      svgInternalOnly: true,
      webpPublicGalleryPreview: true,
      jpgJpegWebpControlsRemainHidden: !corsResults.summary.svgCorsPassed,
    },
    expectedContentTypes: {
      svg: "image/svg+xml",
      webp: "image/webp",
    },
    observedHeaders: {
      svg: observedSvgHeaders,
      webp: observedWebpHeaders,
    },
    recommendedCorsPolicy: [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ["GET", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["Content-Type", "Cache-Control", "Content-Length"],
        MaxAgeSeconds: 86400,
      },
    ],
    requiredCorrections: corsResults.summary.svgCorsPassed
      ? []
      : ["Set Access-Control-Allow-Origin for the production origin and local preview origin, or use wildcard for public static assets."],
    cacheGuidance: "Use long-lived immutable cache headers for versioned generated assets after final upload.",
    verificationCommand: "node pipeline/scripts/round-5f-verify-svg-webp-public-urls.mjs --public-base-url https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages",
    notUserFacing: ["SVG remains internal-only and must not be shown as a visible download option."],
  };
}

function buildAssetStrategyResults(urlResults, corsResults, browserQa, publicBaseValidation, downloadReadiness, finalUploadReadiness) {
  const browserCanvasExportPassed = Boolean(browserQa?.summary?.browserCanvasExportPassed);
  const publicWebpGalleryRenderingPassed = Boolean(browserQa?.summary?.publicWebpRenders);
  const publicVerificationRan = urlResults.summary.status === "completed";
  const svgUrlsPassed = publicVerificationRan && urlResults.summary.svgContentTypePassCount === 30;
  const webpUrlsPassed = publicVerificationRan && urlResults.summary.webpContentTypePassCount === 30;
  const blockers = [
    ...publicBaseValidation.blockers,
    ...urlResults.blockers,
    ...corsResults.blockers,
    ...(browserCanvasExportPassed ? [] : ["Browser canvas export has not passed against the public SVG + WebP test base."]),
  ].filter(Boolean);
  const recommendation = !publicBaseValidation.summary.publicVerificationReady
    ? "Round 5G should configure NEXT_PUBLIC_COLORING_ASSET_BASE_URL for the uploaded 30-record test bundle and rerun public URL, CORS, and browser conversion verification."
    : !urlResults.summary.publicUrlVerificationPassed
      ? "Round 5G should fix the SVG/WebP object keys, upload placement, or content types, then rerun public verification."
      : !corsResults.summary.svgCorsPassed
        ? "Round 5G should configure R2/custom-domain CORS for SVG responses, then rerun browser canvas conversion and print QA before exposing JPG/JPEG/WebP controls."
        : !browserCanvasExportPassed
          ? "Round 5G should investigate browser SVG-to-canvas conversion against the public base before exposing JPG/JPEG/WebP controls."
          : "Round 5G can prepare an owner-review plan for JPG/JPEG/WebP download controls, while keeping r2.dev temporary and full upload deferred.";

  return {
    generatedAt: new Date().toISOString(),
    runId: "round-5f-asset-strategy-results",
    summary: {
      publicAssetBaseTested: publicBaseValidation.summary.publicVerificationReady && publicVerificationRan,
      publicBaseType: publicBaseValidation.summary.baseType,
      publicAssetBaseConfigured: publicBaseValidation.summary.publicBaseUrlConfigured,
      publicVerificationReady: publicBaseValidation.summary.publicVerificationReady,
      svgUrlVerificationPassed: svgUrlsPassed,
      webpUrlVerificationPassed: webpUrlsPassed,
      svgContentTypeCorrect: svgUrlsPassed,
      webpContentTypeCorrect: webpUrlsPassed,
      svgCorsPassed: corsResults.summary.svgCorsPassed,
      browserCanvasExportPassed,
      webpGalleryPublicRenderingPassed: publicWebpGalleryRenderingPassed,
      printConversionReadyOnPublicBase: downloadReadiness.summary.browserConversionReady,
      jpgJpegWebpControlsRemainDeferred: true,
      jpgJpegWebpControlsReadyForOwnerApproval: downloadReadiness.summary.jpgJpegWebpControlsReadyForOwnerApproval,
      currentPublicDownloadFormats: ["PNG"],
      svgInternalOnly: true,
      finalUploadModel: "svg-plus-webp-only",
      finalUploadFolders: ["svg", "webp"],
      excludedUploadFolders: ["png", "thumbs"],
      fullUploadDeferred: finalUploadReadiness.summary.fullUploadDeferred,
      imageSitemapDeferred: true,
      openGraphImagesDeferred: true,
      liveAdsDeferred: true,
    },
    decisions: [
      "Keep SVG internal-only and public-addressable only for app internals.",
      "Keep WebP as the gallery preview format.",
      "Keep public downloads PNG-only in this round.",
      "Do not expose JPG, JPEG, or WebP download controls until public SVG CORS and browser canvas export pass and the owner approves the UI change.",
      "Keep the final full upload plan SVG + WebP only.",
    ],
    blockers: [...new Set(blockers)],
    recommendation,
  };
}

function isAcceptableContentType(mediaType, observed, expected) {
  const lower = observed.toLowerCase();
  if (lower.startsWith(expected.toLowerCase())) return true;
  if (mediaType === "svg") return lower.startsWith("application/svg+xml");
  return false;
}

function allowsOrigin(header, origins) {
  if (!header) return false;
  const trimmed = header.trim();
  return trimmed === "*" || origins.includes(trimmed);
}

function buildPublicUrl(publicBaseUrl, r2ObjectKey) {
  const keyWithoutPrefix = r2ObjectKey.replace(/^coloring-pages\//, "");
  return `${publicBaseUrl.replace(/\/+$/, "")}/${keyWithoutPrefix.split("/").map(encodeURIComponent).join("/")}`;
}

function getOriginCandidates() {
  const origins = ["http://localhost:3005", "http://127.0.0.1:3005"];
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
      if (!origins.includes(origin)) origins.push(origin);
    } catch {
      // Ignore invalid production site URL here. Round 4Y owns launch URL readiness.
    }
  }
  return origins;
}

function getPublicDownloadFormats(projectText) {
  const formats = [];
  if (/Download PNG/i.test(projectText)) formats.push("PNG");
  if (/Download JPG/i.test(projectText)) formats.push("JPG");
  if (/Download JPEG/i.test(projectText)) formats.push("JPEG");
  if (/Download WebP/i.test(projectText)) formats.push("WebP");
  return formats.length ? formats : ["PNG"];
}

function renderProjectContextReport(payload) {
  return `# Round 5F Project Context Check

- Correct repository: ${payload.summary.correctRepository}
- Branch: ${payload.summary.branch}
- Round 5E commit exists: ${payload.summary.round5eCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- Test bundle SVG files: ${payload.summary.testBundleSvgCount}
- Test bundle WebP files: ${payload.summary.testBundleWebpCount}
- Test bundle PNG files: ${payload.summary.testBundlePngCount}
- Test bundle thumbnail files: ${payload.summary.testBundleThumbCount}
- Public generated media present: ${payload.summary.publicGeneratedMediaPresent}
- Source images untouched: ${payload.summary.sourceImagesUntouched}
- ilovesvg untouched: ${payload.summary.ilovesvgUntouched}
- SVG user download exposed: ${payload.summary.svgUserDownloadExposed}
- Public download formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- Live AdSense code present: ${payload.summary.liveAdSenseCodePresent}
`;
}

function renderPublicBaseReport(payload) {
  return `# Round 5F Public Asset Base Validation

- Public base configured: ${payload.summary.publicBaseUrlConfigured}
- Public base type: ${payload.summary.baseType}
- Public verification ready: ${payload.summary.publicVerificationReady}
- Uses HTTP/HTTPS: ${payload.summary.isHttpOrHttps}
- Includes /coloring-pages: ${payload.summary.includesColoringPagesPrefix}
- Localhost: ${payload.summary.isLocalhost}
- r2.dev temporary test route: ${payload.summary.isR2Dev}
- Custom domain: ${payload.summary.isCustomDomain}
- Private R2/S3 endpoint: ${payload.summary.privateR2Endpoint}
- Credentials in URL: ${payload.summary.credentialsInUrl}

${renderList("Blockers", payload.blockers)}
${renderList("Notes", payload.notes)}
`;
}

function renderUrlResultsReport(payload) {
  return `# Round 5F SVG + WebP Public URL Results

- Status: ${payload.summary.status}
- Public base type: ${payload.summary.baseType}
- Public URL resolution passed: ${payload.summary.publicUrlResolutionPassed}
- Public URL verification passed: ${payload.summary.publicUrlVerificationPassed}
- Content types passed: ${payload.summary.contentTypesPassed}
- Planned URLs: ${payload.summary.plannedUrlCount}
- Planned SVG URLs: ${payload.summary.plannedSvgUrlCount}
- Planned WebP URLs: ${payload.summary.plannedWebpUrlCount}
- Checked URLs: ${payload.summary.checkedUrlCount}
- HTTP 200 count: ${payload.summary.http200Count}
- SVG content-type pass count: ${payload.summary.svgContentTypePassCount}
- WebP content-type pass count: ${payload.summary.webpContentTypePassCount}
- Non-zero byte count: ${payload.summary.nonZeroByteCount}
- SVG CORS pass count: ${payload.summary.svgCorsPassCount}
- Cache headers observed: ${payload.summary.cacheHeadersObserved.length ? payload.summary.cacheHeadersObserved.join("; ") : "(none)"}

${renderList("Blockers", payload.blockers)}
`;
}

function renderCorsReport(payload) {
  return `# Round 5F SVG CORS Report

- Status: ${payload.summary.status}
- SVG CORS passed: ${payload.summary.svgCorsPassed}
- SVG checked count: ${payload.summary.svgCheckedCount}
- SVG GET pass count: ${payload.summary.svgGetPassCount}
- SVG HEAD pass count: ${payload.summary.svgHeadPassCount}
- SVG CORS header pass count: ${payload.summary.svgCorsHeaderPassCount}
- Credentials required count: ${payload.summary.credentialsRequiredCount}
- Browser crossOrigin anonymous ready: ${payload.summary.browserCanLoadCrossOriginAnonymous}
- Canvas untainted verified in browser: ${payload.summary.canvasUntaintedVerifiedInBrowser}

${renderList("Blockers", payload.blockers)}
`;
}

function renderDownloadReadinessReport(payload) {
  return `# Round 5F Download Format Readiness

- Browser conversion ready: ${payload.summary.browserConversionReady}
- Public WebP URLs passed: ${payload.summary.publicWebpUrlsPassed}
- Public SVG URLs passed: ${payload.summary.publicSvgUrlsPassed}
- SVG CORS passed: ${payload.summary.svgCorsPassed}
- Browser canvas export passed: ${payload.summary.browserCanvasExportPassed}
- JPG/JPEG/WebP controls ready for owner approval: ${payload.summary.jpgJpegWebpControlsReadyForOwnerApproval}
- JPG/JPEG/WebP controls remain hidden: ${payload.summary.jpgJpegWebpControlsRemainHidden}
- Current public download formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- Decision: ${payload.decision}

${renderList("Blockers", payload.blockers)}
`;
}

function renderFinalUploadReadinessReport(payload) {
  return `# Round 5F Final Upload Readiness

- SVG + WebP test passed: ${payload.summary.svgWebpTestPassed}
- SVG + WebP model still valid: ${payload.summary.svgWebpOnlyModelStillValid}
- PNG/thumbs can stay excluded: ${payload.summary.pngThumbsCanStayExcluded}
- Content types correct: ${payload.summary.contentTypesCorrect}
- CORS correct: ${payload.summary.corsCorrect}
- Cache headers acceptable: ${payload.summary.cacheHeadersAcceptable}
- Final custom domain still needed: ${payload.summary.finalCustomDomainStillNeeded}
- Full upload deferred: ${payload.summary.fullUploadDeferred}
- Ready for full upload: ${payload.summary.readyForFullUpload}
- Image sitemap deferred: ${payload.summary.imageSitemapDeferred}
- Open Graph images deferred: ${payload.summary.openGraphImagesDeferred}

${renderList("Before Full Upload", payload.beforeFullUpload)}
`;
}

function renderCorsGuideReport(payload) {
  return `# Round 5F R2 CORS And Content-Type Update

- Public base type: ${payload.summary.publicBaseType}
- SVG CORS passed: ${payload.summary.svgCorsPassed}
- SVG internal only: ${payload.summary.svgInternalOnly}
- WebP public gallery preview: ${payload.summary.webpPublicGalleryPreview}
- Expected SVG content type: ${payload.expectedContentTypes.svg}
- Expected WebP content type: ${payload.expectedContentTypes.webp}
- Verification command: \`${payload.verificationCommand}\`

## Recommended CORS JSON

\`\`\`json
${JSON.stringify(payload.recommendedCorsPolicy, null, 2)}
\`\`\`

${renderList("Required Corrections", payload.requiredCorrections)}
${renderList("Do Not Expose", payload.notUserFacing)}
`;
}

function renderAssetStrategyReport(payload) {
  return `# Round 5F Asset Strategy Report

- Public asset base tested: ${payload.summary.publicAssetBaseTested}
- Public base type: ${payload.summary.publicBaseType}
- SVG URL verification passed: ${payload.summary.svgUrlVerificationPassed}
- WebP URL verification passed: ${payload.summary.webpUrlVerificationPassed}
- SVG content type correct: ${payload.summary.svgContentTypeCorrect}
- WebP content type correct: ${payload.summary.webpContentTypeCorrect}
- SVG CORS passed: ${payload.summary.svgCorsPassed}
- Browser canvas export passed: ${payload.summary.browserCanvasExportPassed}
- WebP gallery public rendering passed: ${payload.summary.webpGalleryPublicRenderingPassed}
- Print conversion ready on public base: ${payload.summary.printConversionReadyOnPublicBase}
- Current public download formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- SVG internal only: ${payload.summary.svgInternalOnly}
- JPG/JPEG/WebP controls remain deferred: ${payload.summary.jpgJpegWebpControlsRemainDeferred}
- Final upload model: ${payload.summary.finalUploadModel}
- Full upload deferred: ${payload.summary.fullUploadDeferred}

${renderList("Decisions", payload.decisions)}
${renderList("Blockers", payload.blockers)}

## Recommendation

${payload.recommendation}
`;
}

function renderNextPhasePlan(payload) {
  return `# Round 5F Next Phase Plan

## Recommendation For Round 5G

${payload.recommendation}

## Required Before Retesting

- Keep \`NEXT_PUBLIC_COLORING_ASSET_BASE_URL\` pointed at the uploaded 30-record SVG + WebP test bundle public base ending in \`/coloring-pages\`.
- Configure SVG CORS on the R2/custom-domain asset route before retesting browser canvas conversion.
- Use a custom asset domain for production readiness; r2.dev is only a temporary test route.
- Confirm SVG is served as \`image/svg+xml\` and WebP is served as \`image/webp\`.
- Confirm SVG responses include CORS headers that allow the local preview origin and final production origin.
- Rerun \`node pipeline/scripts/round-5f-verify-svg-webp-public-urls.mjs --public-base-url https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages\`.

## Still Deferred

- Full library upload.
- JPG/JPEG/WebP visible download controls.
- Live AdSense.
- Image sitemap.
- Open Graph image generation.
- Per-image pages.
`;
}

function renderList(title, items) {
  if (!items || !items.length) return `## ${title}\n\n- None\n`;
  return `## ${title}\n\n${items.map((item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n")}\n`;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readJsonIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) return null;
  return JSON.parse(await readFile(absolute, "utf8"));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  const target = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const target = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${text.replace(/\s+$/u, "")}\n`, "utf8");
}

async function listFilesIfExists(root) {
  try {
    const rootStat = await stat(root);
    if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];
  } catch {
    return [];
  }

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(path.join(REPO_ROOT, file), "utf8"));
    }
  }
  return chunks.join("\n");
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
  return stdout;
}

async function gitCommitExists(commit) {
  try {
    await git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "(invalid URL)";
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--public-base-url") parsed.publicBaseUrl = args[++index];
    else if (arg.startsWith("--public-base-url=")) parsed.publicBaseUrl = arg.slice("--public-base-url=".length);
    else throw new Error(`Unknown Round 5F verifier option: ${arg}`);
  }
  return parsed;
}

if (!existsSync(path.join(REPO_ROOT, PLAN_PATH))) {
  console.error(`Missing ${PLAN_PATH}. Run Round 5C bundle generation first.`);
  process.exitCode = 1;
} else if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
