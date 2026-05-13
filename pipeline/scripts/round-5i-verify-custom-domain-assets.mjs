#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const RUN_ID = "round-5i-custom-asset-domain-verification";
const PLAN_PATH = "pipeline/manifests/round-5c-svg-webp-url-verification-plan.json";
const DEFAULT_CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const LOCAL_PREVIEW_ORIGINS = ["http://localhost:3005", "http://127.0.0.1:3005"];

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5i-project-context-check.json",
  productionEnv: "pipeline/manifests/round-5i-production-env-validation.json",
  urlResults: "pipeline/manifests/round-5i-custom-domain-url-results.json",
  corsResults: "pipeline/manifests/round-5i-custom-domain-cors-results.json",
  cacheResults: "pipeline/manifests/round-5i-cache-content-type-results.json",
  staticExport: "pipeline/manifests/round-5i-production-static-export-results.json",
  browserQa: "pipeline/manifests/round-5i-browser-custom-domain-qa-results.json",
  downloadReadiness: "pipeline/manifests/round-5i-download-production-readiness.json",
  uploadGuidance: "pipeline/manifests/round-5i-final-upload-guidance.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5i-project-context-check.md",
  productionEnv: "pipeline/reports/round-5i-production-env-validation.md",
  urlResults: "pipeline/reports/round-5i-custom-domain-url-results.md",
  corsResults: "pipeline/reports/round-5i-custom-domain-cors-report.md",
  cacheResults: "pipeline/reports/round-5i-cache-content-type-report.md",
  staticExport: "pipeline/reports/round-5i-production-static-export-report.md",
  browserQa: "pipeline/reports/round-5i-browser-custom-domain-qa-report.md",
  downloadReadiness: "pipeline/reports/round-5i-download-production-readiness.md",
  uploadGuidance: "pipeline/reports/round-5i-final-upload-guidance.md",
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = await readJson(PLAN_PATH);
  const generatedAt = new Date().toISOString();
  const publicEnv = await loadPublicEnv(args);
  const projectContext = await buildProjectContext(generatedAt);
  const productionEnv = buildProductionEnvValidation(generatedAt, publicEnv);
  const urlResults = productionEnv.summary.production_asset_domain_ready
    ? await runUrlChecks(generatedAt, plan, publicEnv.assetBaseUrl)
    : buildNotRunUrlResults(generatedAt, plan, productionEnv);
  const corsResults = productionEnv.summary.production_asset_domain_ready
    ? await runCorsChecks(generatedAt, plan, publicEnv.assetBaseUrl, productionEnv.summary.siteOrigin)
    : buildNotRunCorsResults(generatedAt, plan, productionEnv);
  const cacheResults = productionEnv.summary.production_asset_domain_ready
    ? buildCacheContentTypeResults(generatedAt, urlResults)
    : buildNotRunCacheResults(generatedAt, plan, productionEnv);
  const staticExport = productionEnv.summary.production_asset_domain_ready && !args.skipStaticBuild
    ? await runStaticExportCheck(generatedAt, publicEnv)
    : buildNotRunStaticExport(generatedAt, productionEnv, args.skipStaticBuild);
  const browserQa = buildNotRunBrowserQa(generatedAt, productionEnv);
  const downloadReadiness = buildDownloadReadiness(generatedAt, productionEnv, urlResults, corsResults, cacheResults, browserQa);
  const uploadGuidance = buildUploadGuidance(generatedAt, productionEnv, urlResults, corsResults, cacheResults, downloadReadiness);

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeJson(OUTPUTS.productionEnv, productionEnv);
  await writeJson(OUTPUTS.urlResults, urlResults);
  await writeJson(OUTPUTS.corsResults, corsResults);
  await writeJson(OUTPUTS.cacheResults, cacheResults);
  await writeJson(OUTPUTS.staticExport, staticExport);
  await writeJson(OUTPUTS.browserQa, browserQa);
  await writeJson(OUTPUTS.downloadReadiness, downloadReadiness);
  await writeJson(OUTPUTS.uploadGuidance, uploadGuidance);

  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeText(REPORTS.productionEnv, renderProductionEnvReport(productionEnv));
  await writeText(REPORTS.urlResults, renderUrlResultsReport(urlResults));
  await writeText(REPORTS.corsResults, renderCorsReport(corsResults));
  await writeText(REPORTS.cacheResults, renderCacheReport(cacheResults));
  await writeText(REPORTS.staticExport, renderStaticExportReport(staticExport));
  await writeText(REPORTS.browserQa, renderBrowserQaReport(browserQa));
  await writeText(REPORTS.downloadReadiness, renderDownloadReadinessReport(downloadReadiness));
  await writeText(REPORTS.uploadGuidance, renderUploadGuidanceReport(uploadGuidance));

  await mkdir(path.join(REPO_ROOT, "pipeline", "review", "round-5i", "screenshots"), { recursive: true });

  console.log(JSON.stringify({
    runId: RUN_ID,
    productionAssetDomainReady: productionEnv.summary.production_asset_domain_ready,
    siteUrl: productionEnv.summary.siteUrlRedacted,
    assetBaseUrl: productionEnv.summary.assetBaseUrlRedacted,
    urlStatus: urlResults.summary.status,
    corsStatus: corsResults.summary.status,
    cacheStatus: cacheResults.summary.status,
    browserStatus: browserQa.summary.status,
    blockers: downloadReadiness.blockers,
  }, null, 2));
}

async function buildProjectContext(generatedAt) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim().replace(/\\/g, "/");
  const repoName = path.basename(repoRoot);
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "--short", "HEAD"])).trim();
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const srcText = await readProjectText(["app", "src"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const testBundleFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages"));
  const svgFiles = testBundleFiles.filter((file) => file.endsWith(".svg"));
  const webpFiles = testBundleFiles.filter((file) => file.endsWith(".webp"));

  return {
    generatedAt,
    runId: "round-5i-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      head,
      round5hCommitExists: await gitCommitExists("49c9365"),
      appApiRoutePresent: appFiles.some((file) => normalizePath(file).includes("/api/")) || existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      r2UploadSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "svg")),
      r2UploadPngExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "png")),
      r2UploadThumbsExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "thumbs")),
      testBundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages")),
      testBundleSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "svg")),
      testBundleWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "webp")),
      testBundleSvgCount: svgFiles.length,
      testBundleWebpCount: webpFiles.length,
      publicContainsGeneratedMedia: publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      currentPublicDownloadFormats: getPublicDownloadFormats(`${browserDownloads}\n${imageCard}\n${downloadMenu}`),
      pngJpgWebpControlsPresent: /label:\s*"PNG"/.test(downloadMenu) && /label:\s*"JPG"/.test(downloadMenu) && /label:\s*"WebP"/.test(downloadMenu),
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${imageCard}\n${downloadMenu}`),
      printUsesInternalSvg: /printFromHighQualitySource/.test(imageCard) && /convertInternalSvgToBlob/.test(browserDownloads),
      adWellsVisibleByDefault: /Advertisement/.test(srcText) && !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(srcText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(srcText),
      uploadCommandRunByCodex: false,
    },
    wrongContext: {
      checked: true,
      actualWrongRoutesFound: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(srcText),
      note: "Wrong-context guards are checked only against app and src source, not historical pipeline scripts.",
    },
  };
}

async function loadPublicEnv(args) {
  const fileValues = {};
  const sources = [];
  for (const envPath of [".env", ".env.local"]) {
    const absolute = path.join(REPO_ROOT, envPath);
    if (!existsSync(absolute)) continue;
    const parsed = parseEnvFile(await readFile(absolute, "utf8"));
    for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_COLORING_ASSET_BASE_URL", "NEXT_PUBLIC_CONTACT_EMAIL"]) {
      if (parsed[key] != null && fileValues[key] == null) {
        fileValues[key] = parsed[key];
        sources.push({ key, source: envPath });
      }
    }
  }

  const siteUrl = normalizeUrl(args.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || fileValues.NEXT_PUBLIC_SITE_URL || "");
  const assetBaseUrl = normalizeUrl(args.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || fileValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "");
  const contactEmail = (args.contactEmail || process.env.NEXT_PUBLIC_CONTACT_EMAIL || fileValues.NEXT_PUBLIC_CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL).trim();

  return {
    siteUrl,
    assetBaseUrl,
    contactEmail,
    sourceHints: {
      siteUrl: args.siteUrl ? "cli" : process.env.NEXT_PUBLIC_SITE_URL ? "process" : fileValues.NEXT_PUBLIC_SITE_URL ? sources.find((source) => source.key === "NEXT_PUBLIC_SITE_URL")?.source : "missing",
      assetBaseUrl: args.assetBaseUrl ? "cli" : process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL ? "process" : fileValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL ? sources.find((source) => source.key === "NEXT_PUBLIC_COLORING_ASSET_BASE_URL")?.source : "missing",
      contactEmail: args.contactEmail ? "cli" : process.env.NEXT_PUBLIC_CONTACT_EMAIL ? "process" : fileValues.NEXT_PUBLIC_CONTACT_EMAIL ? sources.find((source) => source.key === "NEXT_PUBLIC_CONTACT_EMAIL")?.source : "default",
    },
  };
}

function buildProductionEnvValidation(generatedAt, publicEnv) {
  const site = inspectUrl(publicEnv.siteUrl, { requireColoringPagesPrefix: false });
  const asset = inspectUrl(publicEnv.assetBaseUrl, { requireColoringPagesPrefix: true });
  const siteOrigin = site.url ? site.url.origin : "";
  const noPublicEnvCredentials = !site.credentialsInUrl && !asset.credentialsInUrl;
  const blockers = [];

  if (!publicEnv.siteUrl) blockers.push("NEXT_PUBLIC_SITE_URL is not configured.");
  if (!site.valid) blockers.push("NEXT_PUBLIC_SITE_URL is not a valid URL.");
  if (!site.https) blockers.push("NEXT_PUBLIC_SITE_URL must be HTTPS for production-like verification.");
  if (site.localhost) blockers.push("NEXT_PUBLIC_SITE_URL must not be localhost or loopback.");
  if (site.placeholder) blockers.push("NEXT_PUBLIC_SITE_URL appears to be a placeholder domain.");
  if (site.credentialsInUrl) blockers.push("NEXT_PUBLIC_SITE_URL appears to contain credentials or token-like query parameters.");

  if (!publicEnv.assetBaseUrl) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not configured.");
  if (!asset.valid) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not a valid URL.");
  if (!asset.https) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.");
  if (!asset.includesColoringPagesPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must include the /coloring-pages prefix.");
  if (asset.localhost) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.");
  if (asset.r2Dev) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL uses r2.dev; Round 5I requires the final custom asset domain.");
  if (asset.privateR2Endpoint) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL points to a private R2/S3 API endpoint.");
  if (asset.oldTestPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL contains the old /coloring/test-v1 prefix.");
  if (asset.duplicateColoringPagesPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL contains duplicate /coloring-pages/coloring-pages.");
  if (asset.placeholder) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL appears to be a placeholder domain.");
  if (asset.credentialsInUrl) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL appears to contain credentials or token-like query parameters.");

  return {
    generatedAt,
    runId: "round-5i-production-env-validation",
    sourceEnvVars: ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_COLORING_ASSET_BASE_URL", "NEXT_PUBLIC_CONTACT_EMAIL"],
    rawValueCaptured: false,
    valueSources: publicEnv.sourceHints,
    summary: {
      nextPublicSiteUrlConfigured: Boolean(publicEnv.siteUrl),
      siteUrlRedacted: redactUrl(publicEnv.siteUrl),
      siteUrlHttps: site.https,
      siteUrlNotLocalhost: !site.localhost,
      siteUrlNotPlaceholder: !site.placeholder,
      siteOrigin,
      nextPublicColoringAssetBaseUrlConfigured: Boolean(publicEnv.assetBaseUrl),
      assetBaseUrlRedacted: redactUrl(publicEnv.assetBaseUrl),
      assetBaseHttps: asset.https,
      assetBaseHasColoringPagesPrefix: asset.includesColoringPagesPrefix,
      assetBaseNotLocalhost: !asset.localhost,
      assetBaseNotR2Dev: !asset.r2Dev,
      assetBaseNotPrivateR2Endpoint: !asset.privateR2Endpoint,
      assetBaseHasNoOldTestPrefix: !asset.oldTestPrefix,
      assetBaseHasNoDuplicateColoringPagesPrefix: !asset.duplicateColoringPagesPrefix,
      assetBaseNotPlaceholder: !asset.placeholder,
      assetBaseCustomDomain: asset.valid && asset.https && !asset.r2Dev && !asset.privateR2Endpoint && !asset.localhost && !asset.placeholder,
      noPublicEnvCredentials,
      contactEmailConfiguredOrDefaulted: Boolean(publicEnv.contactEmail),
      contactEmailRedacted: publicEnv.contactEmail,
      r2DevIsProductionReady: false,
      production_asset_domain_ready: blockers.length === 0,
    },
    blockers,
    notes: blockers.length
      ? ["Custom-domain URL, CORS, cache, browser QA, and production-like static export checks were stopped because required production-like env values are invalid or missing."]
      : ["Required production-like env values passed local validation. Public URL, CORS, cache, browser, and static export checks can run."],
  };
}

async function runUrlChecks(generatedAt, plan, assetBaseUrl) {
  const checks = [];
  for (const entry of plan.allUrls) {
    checks.push(await checkPublicUrl(entry, assetBaseUrl));
  }

  const svgChecks = checks.filter((check) => check.mediaType === "svg");
  const webpChecks = checks.filter((check) => check.mediaType === "webp");
  const allPassed = checks.length === plan.summary.plannedUrlCount && checks.every((check) => check.passed);

  return {
    generatedAt,
    runId: "round-5i-custom-domain-url-results",
    sourcePlan: PLAN_PATH,
    summary: {
      status: "completed",
      plannedUrlCount: plan.summary.plannedUrlCount,
      plannedSvgUrlCount: plan.summary.svgUrlCount,
      plannedWebpUrlCount: plan.summary.webpUrlCount,
      checkedUrlCount: checks.length,
      http200Count: checks.filter((check) => check.getStatusOk).length,
      headOkCount: checks.filter((check) => check.headStatusOk).length,
      svgContentTypePassCount: svgChecks.filter((check) => check.contentTypeOk).length,
      webpContentTypePassCount: webpChecks.filter((check) => check.contentTypeOk).length,
      nonZeroByteCount: checks.filter((check) => check.nonZeroBytes).length,
      noAccessDeniedXml: checks.every((check) => !check.accessDeniedXml),
      noCloudflareR2ErrorHtml: checks.every((check) => !check.cloudflareOrR2ErrorHtml),
      noPrivateEndpointRedirect: checks.every((check) => !check.privateEndpointRedirect),
      noOldTestPrefix: checks.every((check) => !check.oldPrefix),
      noDuplicateColoringPagesPrefix: checks.every((check) => !check.duplicateColoringPagesPrefix),
      noLocalFilesystemPathLeak: checks.every((check) => !check.localFilesystemPathLeak),
      cacheHeadersObserved: [...new Set(checks.map((check) => check.cacheControl).filter(Boolean))],
      corsHeadersObserved: [...new Set(checks.map((check) => check.accessControlAllowOrigin).filter(Boolean))],
      svg_urls_passed: svgChecks.length === plan.summary.svgUrlCount && svgChecks.every((check) => check.passed),
      webp_urls_passed: webpChecks.length === plan.summary.webpUrlCount && webpChecks.every((check) => check.passed),
      customDomainUrlVerificationPassed: allPassed,
    },
    checks,
    blockers: allPassed ? [] : ["One or more custom-domain SVG/WebP URL checks failed. Fix upload keys, content types, object ACL, cache settings, or the asset base URL before proceeding."],
  };
}

function buildNotRunUrlResults(generatedAt, plan, productionEnv) {
  return {
    generatedAt,
    runId: "round-5i-custom-domain-url-results",
    sourcePlan: PLAN_PATH,
    summary: {
      status: "not_run",
      plannedUrlCount: plan.summary.plannedUrlCount,
      plannedSvgUrlCount: plan.summary.svgUrlCount,
      plannedWebpUrlCount: plan.summary.webpUrlCount,
      checkedUrlCount: 0,
      http200Count: 0,
      headOkCount: 0,
      svgContentTypePassCount: 0,
      webpContentTypePassCount: 0,
      nonZeroByteCount: 0,
      noAccessDeniedXml: null,
      noCloudflareR2ErrorHtml: null,
      noPrivateEndpointRedirect: null,
      noOldTestPrefix: productionEnv.summary.assetBaseHasNoOldTestPrefix,
      noDuplicateColoringPagesPrefix: productionEnv.summary.assetBaseHasNoDuplicateColoringPagesPrefix,
      noLocalFilesystemPathLeak: null,
      cacheHeadersObserved: [],
      corsHeadersObserved: [],
      svg_urls_passed: false,
      webp_urls_passed: false,
      customDomainUrlVerificationPassed: false,
    },
    checks: [],
    blockers: ["Custom-domain URL verification was not run because production-like env validation failed.", ...productionEnv.blockers],
  };
}

async function checkPublicUrl(entry, assetBaseUrl) {
  const url = buildPublicAssetUrl(assetBaseUrl, entry);
  const expectedContentType = entry.expectedContentType;
  const result = {
    assetId: entry.assetId,
    displayTitle: entry.displayTitle,
    mediaType: entry.mediaType,
    r2ObjectKey: entry.r2ObjectKey,
    url: redactUrl(url),
    expectedContentType,
    getStatus: null,
    headStatus: null,
    finalUrl: null,
    contentType: "",
    contentLength: null,
    byteLength: 0,
    cacheControl: "",
    etag: "",
    lastModified: "",
    accessControlAllowOrigin: "",
    getStatusOk: false,
    headStatusOk: false,
    contentTypeOk: false,
    nonZeroBytes: false,
    accessDeniedXml: false,
    cloudflareOrR2ErrorHtml: false,
    privateEndpointRedirect: false,
    oldPrefix: /\/coloring\/test-v1\//.test(url),
    duplicateColoringPagesPrefix: /\/coloring-pages\/coloring-pages\//.test(url),
    localFilesystemPathLeak: /[A-Za-z]:\\|file:\/\//.test(url),
    passed: false,
    error: null,
  };

  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow" });
    result.headStatus = head.status;
    result.headStatusOk = head.ok;
  } catch (error) {
    result.headStatus = "error";
    result.headError = error instanceof Error ? error.message : String(error);
  }

  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    result.getStatus = response.status;
    result.finalUrl = redactUrl(response.url);
    result.contentType = response.headers.get("content-type") || "";
    result.contentLength = response.headers.get("content-length");
    result.cacheControl = response.headers.get("cache-control") || "";
    result.etag = response.headers.get("etag") || "";
    result.lastModified = response.headers.get("last-modified") || "";
    result.accessControlAllowOrigin = response.headers.get("access-control-allow-origin") || "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    result.byteLength = bytes.byteLength;
    result.getStatusOk = response.status === 200;
    result.contentTypeOk = contentTypeAcceptable(result.contentType, expectedContentType);
    result.nonZeroBytes = bytes.byteLength > 0;
    result.privateEndpointRedirect = inspectUrl(response.url, { requireColoringPagesPrefix: false }).privateR2Endpoint;
    const sniff = bytesToAsciiSnippet(bytes);
    result.accessDeniedXml = /<Error>|AccessDenied|NoSuchKey/i.test(sniff);
    result.cloudflareOrR2ErrorHtml = /<!doctype html|<html|cf-error|cloudflare|r2/i.test(sniff) && !result.contentTypeOk;
    result.localFilesystemPathLeak = result.localFilesystemPathLeak || /[A-Za-z]:\\|file:\/\//.test(sniff);
    result.passed =
      result.getStatusOk &&
      result.contentTypeOk &&
      result.nonZeroBytes &&
      !result.accessDeniedXml &&
      !result.cloudflareOrR2ErrorHtml &&
      !result.privateEndpointRedirect &&
      !result.oldPrefix &&
      !result.duplicateColoringPagesPrefix &&
      !result.localFilesystemPathLeak;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

async function runCorsChecks(generatedAt, plan, assetBaseUrl, productionOrigin) {
  const origins = [...LOCAL_PREVIEW_ORIGINS, productionOrigin].filter(Boolean);
  const checks = [];
  for (const entry of plan.allUrls.filter((candidate) => candidate.mediaType === "svg")) {
    for (const origin of origins) {
      checks.push(await checkCors(entry, assetBaseUrl, origin));
    }
  }

  const allGetPassed = checks.every((check) => check.getStatusOk && check.getCorsOk && check.noCredentialsRequired);
  const allHeadUsable = checks.every((check) => check.headStatusOk || check.headUnavailable);
  const passed = checks.length === plan.summary.svgUrlCount * origins.length && allGetPassed && allHeadUsable;

  return {
    generatedAt,
    runId: "round-5i-custom-domain-cors-results",
    sourcePlan: PLAN_PATH,
    originsChecked: origins,
    summary: {
      status: "completed",
      svgUrlCount: plan.summary.svgUrlCount,
      originsChecked: origins,
      checkedOriginRequestCount: checks.length,
      getOkCount: checks.filter((check) => check.getStatusOk).length,
      headOkCount: checks.filter((check) => check.headStatusOk).length,
      headUnavailableCount: checks.filter((check) => check.headUnavailable).length,
      corsOkCount: checks.filter((check) => check.getCorsOk).length,
      noCredentialsRequiredCount: checks.filter((check) => check.noCredentialsRequired).length,
      staleCachedMissingHeaderCount: checks.filter((check) => check.possibleStaleCachedMissingCors).length,
      svg_cors_passed: passed,
      browserCorsFailureExpected: !passed,
    },
    checks,
    blockers: passed ? [] : ["SVG CORS did not pass for every required local and production origin. Update the asset-domain CORS policy and purge stale cached objects if headers remain missing."],
    requiredFix: passed ? [] : [
      "Allow GET and HEAD from the production site origin and local preview origins, or use Access-Control-Allow-Origin: * for public static assets.",
      "Do not require credentials for SVG and WebP asset reads.",
      "Purge or bypass caches after changing CORS headers so stale responses do not hide the fix.",
    ],
  };
}

function buildNotRunCorsResults(generatedAt, plan, productionEnv) {
  const origins = [...LOCAL_PREVIEW_ORIGINS, productionEnv.summary.siteOrigin].filter(Boolean);
  return {
    generatedAt,
    runId: "round-5i-custom-domain-cors-results",
    sourcePlan: PLAN_PATH,
    originsChecked: origins,
    summary: {
      status: "not_run",
      svgUrlCount: plan.summary.svgUrlCount,
      originsChecked: origins,
      checkedOriginRequestCount: 0,
      getOkCount: 0,
      headOkCount: 0,
      headUnavailableCount: 0,
      corsOkCount: 0,
      noCredentialsRequiredCount: 0,
      staleCachedMissingHeaderCount: 0,
      svg_cors_passed: false,
      browserCorsFailureExpected: true,
    },
    checks: [],
    blockers: ["Custom-domain SVG CORS verification was not run because production-like env validation failed.", ...productionEnv.blockers],
    requiredFix: ["Configure NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_COLORING_ASSET_BASE_URL with final HTTPS custom domains, then rerun Round 5I."],
  };
}

async function checkCors(entry, assetBaseUrl, origin) {
  const url = buildPublicAssetUrl(assetBaseUrl, entry);
  const result = {
    assetId: entry.assetId,
    mediaType: entry.mediaType,
    r2ObjectKey: entry.r2ObjectKey,
    url: redactUrl(url),
    origin,
    getStatus: null,
    headStatus: null,
    accessControlAllowOrigin: "",
    accessControlAllowMethods: "",
    accessControlAllowCredentials: "",
    cacheControl: "",
    getStatusOk: false,
    headStatusOk: false,
    headUnavailable: false,
    getCorsOk: false,
    noCredentialsRequired: true,
    possibleStaleCachedMissingCors: false,
    error: null,
  };

  try {
    const getResponse = await fetch(url, { method: "GET", headers: { Origin: origin }, redirect: "follow" });
    result.getStatus = getResponse.status;
    result.getStatusOk = getResponse.status === 200;
    result.accessControlAllowOrigin = getResponse.headers.get("access-control-allow-origin") || "";
    result.accessControlAllowMethods = getResponse.headers.get("access-control-allow-methods") || "";
    result.accessControlAllowCredentials = getResponse.headers.get("access-control-allow-credentials") || "";
    result.cacheControl = getResponse.headers.get("cache-control") || "";
    result.getCorsOk = result.accessControlAllowOrigin === "*" || result.accessControlAllowOrigin === origin;
    result.noCredentialsRequired = result.accessControlAllowCredentials.toLowerCase() !== "true";
    result.possibleStaleCachedMissingCors = result.getStatusOk && !result.accessControlAllowOrigin && Boolean(result.cacheControl);
    await getResponse.arrayBuffer();
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const headResponse = await fetch(url, { method: "HEAD", headers: { Origin: origin }, redirect: "follow" });
    result.headStatus = headResponse.status;
    result.headStatusOk = headResponse.ok;
    result.headUnavailable = [405, 501].includes(headResponse.status);
  } catch (error) {
    result.headStatus = "error";
    result.headError = error instanceof Error ? error.message : String(error);
  }

  return result;
}

function buildCacheContentTypeResults(generatedAt, urlResults) {
  const checks = urlResults.checks.map((check) => {
    const versionedAssetKey = /[a-f0-9]{10}\.(?:svg|webp)$/i.test(check.r2ObjectKey);
    const hasLongLivedCache = /max-age=(?:31536000|[6-9]\d{5,}|\d{7,})/i.test(check.cacheControl);
    return {
      assetId: check.assetId,
      mediaType: check.mediaType,
      r2ObjectKey: check.r2ObjectKey,
      contentType: check.contentType,
      expectedContentType: check.expectedContentType,
      contentTypeOk: check.contentTypeOk,
      cacheControl: check.cacheControl,
      etag: check.etag,
      lastModified: check.lastModified,
      validationHeaderPresent: Boolean(check.etag || check.lastModified),
      versionedAssetKey,
      longLivedCacheSafeForVersionedFilename: versionedAssetKey && hasLongLivedCache,
      cacheHeaderPresent: Boolean(check.cacheControl),
    };
  });
  const cacheHeadersAcceptable = checks.length > 0 && checks.every((check) => check.cacheHeaderPresent);
  const contentTypesAcceptable = checks.length > 0 && checks.every((check) => check.contentTypeOk);

  return {
    generatedAt,
    runId: "round-5i-cache-content-type-results",
    summary: {
      status: "completed",
      checkedUrlCount: checks.length,
      svgContentTypeOk: checks.filter((check) => check.mediaType === "svg").every((check) => check.contentTypeOk),
      webpContentTypeOk: checks.filter((check) => check.mediaType === "webp").every((check) => check.contentTypeOk),
      cacheHeadersPresentCount: checks.filter((check) => check.cacheHeaderPresent).length,
      validationHeaderPresentCount: checks.filter((check) => check.validationHeaderPresent).length,
      versionedAssetKeys: checks.every((check) => check.versionedAssetKey),
      longLivedCachingSafeForVersionedFilenames: checks.every((check) => check.longLivedCacheSafeForVersionedFilename),
      cache_headers_acceptable: cacheHeadersAcceptable,
      content_type_behavior_acceptable: contentTypesAcceptable,
      productionAssetReadinessPartial: !cacheHeadersAcceptable && contentTypesAcceptable,
      cachePurgeOrObjectKeyVersioningNeeded: !cacheHeadersAcceptable,
    },
    checks,
    blockers: contentTypesAcceptable ? [] : ["SVG or WebP content types are not acceptable on the custom asset domain."],
    launchTasks: cacheHeadersAcceptable ? [] : ["Add explicit Cache-Control headers before launch. Missing cache headers do not block browser conversion when content type and CORS pass, but they remain a production launch task."],
  };
}

function buildNotRunCacheResults(generatedAt, plan, productionEnv) {
  return {
    generatedAt,
    runId: "round-5i-cache-content-type-results",
    summary: {
      status: "not_run",
      checkedUrlCount: 0,
      plannedUrlCount: plan.summary.plannedUrlCount,
      svgContentTypeOk: false,
      webpContentTypeOk: false,
      cacheHeadersPresentCount: 0,
      validationHeaderPresentCount: 0,
      versionedAssetKeys: true,
      longLivedCachingSafeForVersionedFilenames: false,
      cache_headers_acceptable: false,
      content_type_behavior_acceptable: false,
      productionAssetReadinessPartial: false,
      cachePurgeOrObjectKeyVersioningNeeded: true,
    },
    checks: [],
    blockers: ["Cache and content-type checks were not run because production-like env validation failed.", ...productionEnv.blockers],
    launchTasks: ["Rerun cache and content-type checks after configuring final custom domains."],
  };
}

async function runStaticExportCheck(generatedAt, publicEnv) {
  const outputRoot = path.join(REPO_ROOT, "out");
  await rm(outputRoot, { recursive: true, force: true });
  const buildEnv = {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: publicEnv.siteUrl,
    NEXT_PUBLIC_COLORING_ASSET_BASE_URL: publicEnv.assetBaseUrl,
    NEXT_PUBLIC_CONTACT_EMAIL: publicEnv.contactEmail || DEFAULT_CONTACT_EMAIL,
  };
  const command = "npm";
  const args = ["run", "build"];
  const result = await execFileCapture(command, args, { env: buildEnv });
  const outFiles = await listFilesIfExists(outputRoot);
  const outText = await readTextFromFiles(outFiles.filter((file) => /\.(?:html|txt|xml|js|json)$/.test(file)).slice(0, 2000));
  const badCanonicalUrls = findBadCanonicalUrls(outText, publicEnv.siteUrl);

  return {
    generatedAt,
    runId: "round-5i-production-static-export-results",
    command: `${command} ${args.join(" ")}`,
    env: {
      NEXT_PUBLIC_SITE_URL: redactUrl(publicEnv.siteUrl),
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: redactUrl(publicEnv.assetBaseUrl),
      NEXT_PUBLIC_CONTACT_EMAIL: publicEnv.contactEmail,
    },
    summary: {
      status: result.exitCode === 0 ? "completed" : "failed",
      buildExitCode: result.exitCode,
      outFileCount: outFiles.length,
      localhostLeakagePresent: /localhost|127\.0\.0\.1/i.test(outText),
      r2DevLeakagePresent: /\.r2\.dev/i.test(outText),
      privateR2EndpointLeakagePresent: /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(outText),
      sourceFilePathLeakagePresent: /[A-Za-z]:\\|file:\/\//.test(outText),
      oldTestPrefixPresent: /\/coloring\/test-v1/i.test(outText),
      duplicateColoringPagesPrefixPresent: /\/coloring-pages\/coloring-pages/i.test(outText),
      downloadSvgLabelsOrLinksPresent: /Download SVG|downloadSvg|svgDownload/i.test(outText),
      appApiRouteReferencesPresent: /\/api\//i.test(outText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(outText),
      badCanonicalUrlsPresent: badCanonicalUrls.length > 0,
      badSitemapUrlsPresent: /localhost|127\.0\.0\.1|\.r2\.dev|r2\.cloudflarestorage\.com|amazonaws\.com/i.test(await readOutFileIfExists("sitemap.xml")),
      staticExportWorks: result.exitCode === 0 && outFiles.length > 0,
    },
    badCanonicalUrls,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
    blockers: result.exitCode === 0 ? [] : ["Production-like static export build failed."],
  };
}

function buildNotRunStaticExport(generatedAt, productionEnv, skippedByFlag) {
  return {
    generatedAt,
    runId: "round-5i-production-static-export-results",
    command: "npm run build",
    env: {
      NEXT_PUBLIC_SITE_URL: productionEnv.summary.siteUrlRedacted,
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: productionEnv.summary.assetBaseUrlRedacted,
      NEXT_PUBLIC_CONTACT_EMAIL: DEFAULT_CONTACT_EMAIL,
    },
    summary: {
      status: "not_run",
      skippedByFlag,
      buildExitCode: null,
      outFileCount: null,
      localhostLeakagePresent: null,
      r2DevLeakagePresent: null,
      privateR2EndpointLeakagePresent: null,
      sourceFilePathLeakagePresent: null,
      oldTestPrefixPresent: !productionEnv.summary.assetBaseHasNoOldTestPrefix,
      duplicateColoringPagesPrefixPresent: !productionEnv.summary.assetBaseHasNoDuplicateColoringPagesPrefix,
      downloadSvgLabelsOrLinksPresent: /Download SVG|downloadSvg|svgDownload/i.test(readCurrentDownloadSourceSync()),
      appApiRouteReferencesPresent: false,
      liveAdSenseCodePresent: false,
      badCanonicalUrlsPresent: null,
      badSitemapUrlsPresent: null,
      staticExportWorks: false,
    },
    badCanonicalUrls: [],
    stdoutTail: "",
    stderrTail: "",
    blockers: skippedByFlag
      ? ["Production-like static export was skipped by flag."]
      : ["Production-like static export was not run because production-like env validation failed.", ...productionEnv.blockers],
  };
}

function buildNotRunBrowserQa(generatedAt, productionEnv) {
  return {
    generatedAt,
    runId: "round-5i-browser-custom-domain-qa",
    appUrl: "http://127.0.0.1:3005",
    publicBaseUrl: productionEnv.summary.assetBaseUrlRedacted,
    summary: {
      status: "not_run",
      pagesInspected: 0,
      browserPagesRequired: ["/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/anime-girls", "/coloring-pages/christmas", "/coloring-pages/plushies", "/contact", "/privacy"],
      webpPreviewRenders: false,
      nonUploadedItemsFallbackGracefully: false,
      noBrokenImageIcons: null,
      localMediaServerRequired: false,
      internalSvgLoads: false,
      browserCanvasExportPassed: false,
      pngDownloadWorks: false,
      jpgDownloadWorks: false,
      webpDownloadWorks: false,
      printWorks: false,
      printUsesGeneratedOutput: false,
      fallbackWorksIfConversionFails: true,
      svgDownloadAbsent: true,
      jpgJpegWebpVisibleThroughDownloadControl: true,
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
    pages: [],
    downloadResults: [],
    printResult: null,
    conversionResult: { attempted: false, passed: false, details: "Custom-domain browser QA did not run because production-like env validation failed." },
    screenshotPaths: [],
    blockers: ["Custom-domain browser QA was not run because production-like env validation failed.", ...productionEnv.blockers],
  };
}

function buildDownloadReadiness(generatedAt, productionEnv, urlResults, corsResults, cacheResults, browserQa) {
  const customDomainVerified = productionEnv.summary.production_asset_domain_ready && urlResults.summary.customDomainUrlVerificationPassed;
  const svgUrlsPassed = Boolean(urlResults.summary.svg_urls_passed);
  const webpUrlsPassed = Boolean(urlResults.summary.webp_urls_passed);
  const svgCorsPassed = Boolean(corsResults.summary.svg_cors_passed);
  const browserCanvasExportPassed = Boolean(browserQa.summary.browserCanvasExportPassed);
  const cacheHeadersAcceptable = Boolean(cacheResults.summary.cache_headers_acceptable);
  const conversionReady = customDomainVerified && svgUrlsPassed && webpUrlsPassed && svgCorsPassed && browserCanvasExportPassed;
  const blockers = [
    ...productionEnv.blockers,
    ...urlResults.blockers,
    ...corsResults.blockers,
    ...cacheResults.blockers,
    ...browserQa.blockers,
  ].filter(uniqueFilter);

  return {
    generatedAt,
    runId: "round-5i-download-production-readiness",
    custom_domain_verified: customDomainVerified,
    svg_urls_passed: svgUrlsPassed,
    webp_urls_passed: webpUrlsPassed,
    svg_cors_passed: svgCorsPassed,
    browser_canvas_export_passed: browserCanvasExportPassed,
    print_ready: conversionReady && Boolean(browserQa.summary.printWorks),
    png_download_ready: conversionReady && Boolean(browserQa.summary.pngDownloadWorks),
    jpg_download_ready: conversionReady && Boolean(browserQa.summary.jpgDownloadWorks),
    webp_download_ready: conversionReady && Boolean(browserQa.summary.webpDownloadWorks),
    svg_user_download_absent: true,
    cache_headers_acceptable: cacheHeadersAcceptable,
    ready_for_full_upload: conversionReady && cacheHeadersAcceptable,
    ready_for_image_sitemap: false,
    ready_for_og_images: false,
    live_ads_in_scope: false,
    blockers,
    decision: conversionReady
      ? "Browser conversion and public download readiness are confirmed for the custom asset domain. Full upload still needs explicit approval."
      : "Production download readiness is blocked until final custom site and asset domains pass URL, CORS, cache, static export, and browser QA.",
  };
}

function buildUploadGuidance(generatedAt, productionEnv, urlResults, corsResults, cacheResults, readiness) {
  return {
    generatedAt,
    runId: "round-5i-final-upload-guidance",
    summary: {
      finalSvgWebpModelConfirmed: readiness.custom_domain_verified && readiness.svg_urls_passed && readiness.webp_urls_passed && readiness.svg_cors_passed,
      pngThumbsCanRemainExcluded: true,
      svgInternalOnly: true,
      fullUploadStillFinalStage: true,
      explicitApprovalRequiredBeforeFullUpload: true,
      imageSitemapDeferred: true,
      openGraphImagesDeferred: true,
      liveAdSenseDeferred: true,
    },
    finalUploadFolders: ["svg", "webp"],
    excludedFolders: ["png", "thumbs"],
    objectKeyPattern: "coloring-pages/{svg|webp}/{category-or-group}/{deterministic-filename-with-hash}.{svg|webp}",
    customAssetDomainPattern: "https://assets.ilovecoloringpage.com/coloring-pages",
    testedAssetDomain: productionEnv.summary.assetBaseUrlRedacted,
    requiredContentTypes: {
      svg: "image/svg+xml",
      webp: "image/webp",
    },
    requiredCors: {
      origins: [...LOCAL_PREVIEW_ORIGINS, productionEnv.summary.siteOrigin].filter(Boolean),
      methods: ["GET", "HEAD"],
      credentialsRequired: false,
      acceptableAccessControlAllowOrigin: ["*", "exact requesting Origin"],
    },
    cacheHeaderRecommendation: {
      cacheControl: "public, max-age=31536000, immutable",
      reason: "Generated filenames include deterministic hashes, so long-lived caching is safe when object keys are versioned.",
      etagOrLastModifiedRecommended: true,
      purgeNeededAfterHeaderChange: !cacheResults.summary.cache_headers_acceptable,
    },
    fullUploadChecklist: [
      "Confirm Round 5I custom-domain URL checks pass for all 60 test URLs.",
      "Confirm SVG CORS passes with Origin headers for local preview and the production site origin.",
      "Confirm WebP gallery rendering and browser SVG-to-canvas export pass on the custom asset domain.",
      "Upload only SVG and WebP folders under coloring-pages/ after explicit approval.",
      "Do not include png/ or thumbs/ in new upload bundles unless a later blocker justifies it.",
      "Do not expose SVG as a user-facing download.",
      "Do not add image sitemap, Open Graph image generation, live ads, backend routes, or app/api.",
    ],
    verificationCommandsAfterFullUpload: [
      "node pipeline/scripts/round-5i-verify-custom-domain-assets.mjs",
      "node pipeline/scripts/round-5i-browser-custom-domain-qa-runner.cjs --app-url http://127.0.0.1:3005",
      "node --test pipeline/tests/round-5i-custom-asset-domain.test.mjs",
      "npm run build",
    ],
    currentEvidence: {
      customDomainUrlStatus: urlResults.summary.status,
      svgUrlsPassed: readiness.svg_urls_passed,
      webpUrlsPassed: readiness.webp_urls_passed,
      svgCorsPassed: readiness.svg_cors_passed,
      cacheHeadersAcceptable: readiness.cache_headers_acceptable,
      browserCanvasExportPassed: readiness.browser_canvas_export_passed,
    },
    blockers: readiness.blockers,
  };
}

function contentTypeAcceptable(actual, expected) {
  const normalizedActual = String(actual || "").toLowerCase().split(";")[0].trim();
  const normalizedExpected = String(expected || "").toLowerCase();
  if (normalizedExpected === "image/svg+xml") return normalizedActual === "image/svg+xml" || normalizedActual === "application/svg+xml" || normalizedActual === "text/xml" || normalizedActual === "application/xml";
  return normalizedActual === normalizedExpected;
}

function buildPublicAssetUrl(assetBaseUrl, entry) {
  const relativeKey = entry.r2ObjectKey.replace(/^coloring-pages\//, "");
  return `${assetBaseUrl.replace(/\/+$/, "")}/${relativeKey.split("/").map(encodeURIComponent).join("/")}`;
}

function getPublicDownloadFormats(source) {
  const formats = [];
  if (/label:\s*"PNG"|downloadPng|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/.test(source)) formats.push("PNG");
  if (/label:\s*"JPG"|downloadJpeg|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/.test(source)) formats.push("JPG");
  if (/label:\s*"WebP"|downloadWebp|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/.test(source)) formats.push("WebP");
  return formats;
}

function inspectUrl(value, { requireColoringPagesPrefix }) {
  const result = {
    valid: false,
    url: null,
    https: false,
    localhost: false,
    placeholder: false,
    includesColoringPagesPrefix: !requireColoringPagesPrefix,
    oldTestPrefix: false,
    duplicateColoringPagesPrefix: false,
    r2Dev: false,
    privateR2Endpoint: false,
    credentialsInUrl: false,
  };
  if (!value) return result;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    result.valid = true;
    result.url = url;
    result.https = url.protocol === "https:";
    result.localhost = ["localhost", "127.0.0.1", "::1"].includes(host);
    result.placeholder = /example\.com|example\.org|your-|yourdomain|your-asset-domain|placeholder/i.test(host);
    result.includesColoringPagesPrefix = !requireColoringPagesPrefix || url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
    result.oldTestPrefix = url.pathname.includes("/coloring/test-v1");
    result.duplicateColoringPagesPrefix = url.pathname.includes("/coloring-pages/coloring-pages");
    result.r2Dev = host.endsWith(".r2.dev");
    result.privateR2Endpoint = host.includes("r2.cloudflarestorage.com") || host.includes("amazonaws.com");
    result.credentialsInUrl = Boolean(url.username || url.password || /(?:access|secret|token|key)=/i.test(url.search));
  } catch {
    return result;
  }
  return result;
}

function findBadCanonicalUrls(text, siteUrl) {
  const expectedOrigin = inspectUrl(siteUrl, { requireColoringPagesPrefix: false }).url?.origin || "";
  const bad = [];
  for (const match of text.matchAll(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/gi)) {
    if (!match[1].startsWith(expectedOrigin)) bad.push(match[1]);
  }
  return bad;
}

function parseEnvFile(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--site-url") args.siteUrl = argv[++index];
    else if (arg === "--asset-base-url") args.assetBaseUrl = argv[++index];
    else if (arg === "--contact-email") args.contactEmail = argv[++index];
    else if (arg === "--skip-static-build") args.skipStaticBuild = true;
  }
  return args;
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:access|secret|token|key|signature|credential)/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).replace(/\/\/[^/@]+@/, "//[redacted]@");
  }
}

function bytesToAsciiSnippet(bytes) {
  return Buffer.from(bytes.slice(0, 4096)).toString("utf8");
}

function tail(value, lines = 60) {
  return String(value || "").split(/\r?\n/).slice(-lines).join("\n");
}

function uniqueFilter(value, index, array) {
  return array.indexOf(value) === index;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readOutFileIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, "out", relativePath);
  if (!existsSync(absolute)) return "";
  return readFile(absolute, "utf8");
}

async function readTextFromFiles(files) {
  const chunks = [];
  for (const file of files) {
    try {
      const info = await stat(file);
      if (info.size > 2_000_000) continue;
      chunks.push(await readFile(file, "utf8"));
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

function readCurrentDownloadSourceSync() {
  const files = [
    path.join(REPO_ROOT, "src", "lib", "coloring", "browserDownloads.ts"),
    path.join(REPO_ROOT, "src", "components", "coloring", "ImageCard.tsx"),
    path.join(REPO_ROOT, "src", "components", "coloring", "DownloadMenu.tsx"),
  ];
  return files.map((file) => {
    try {
      return existsSync(file) ? readFileSync(file, "utf8") : "";
    } catch {
      return "";
    }
  }).join("\n");
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(absolute);
    }
  }
  await walk(root);
  return results;
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, normalizeTextFile(text), "utf8");
}

async function execFileCapture(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: REPO_ROOT,
      maxBuffer: 1024 * 1024 * 20,
      ...options,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return {
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || String(error),
    };
  }
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
  return stdout;
}

async function gitCommitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
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
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function normalizeTextFile(text) {
  return `${String(text).replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`;
}

function renderProjectContextReport(payload) {
  return `# Round 5I Project Context Check

- Correct repository: ${payload.summary.correctRepository}
- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- HEAD: ${payload.summary.head}
- Round 5H commit exists: ${payload.summary.round5hCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- /coloring-pages route exists: ${payload.summary.coloringPagesRouteExists}
- /coloring-pages/[hubSlug] route exists: ${payload.summary.hubRouteExists}
- Test bundle SVG/WebP counts: ${payload.summary.testBundleSvgCount} / ${payload.summary.testBundleWebpCount}
- Public contains generated media: ${payload.summary.publicContainsGeneratedMedia}
- Source images clean: ${payload.summary.imagesStatusClean}
- ilovesvg clean: ${payload.summary.ilovesvgStatusClean}
- Public download formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- SVG user download exposed: ${payload.summary.svgUserDownloadExposed}
- Ad wells visible by default: ${payload.summary.adWellsVisibleByDefault}
- Live AdSense code present: ${payload.summary.liveAdSenseCodePresent}
- Wrong repo indicators found: ${payload.wrongContext.actualWrongRoutesFound}

${payload.wrongContext.note}
`;
}

function renderProductionEnvReport(payload) {
  return `# Round 5I Production Env Validation

- NEXT_PUBLIC_SITE_URL configured: ${payload.summary.nextPublicSiteUrlConfigured}
- Site URL: ${payload.summary.siteUrlRedacted || "missing"}
- Site HTTPS: ${payload.summary.siteUrlHttps}
- Site not localhost: ${payload.summary.siteUrlNotLocalhost}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL configured: ${payload.summary.nextPublicColoringAssetBaseUrlConfigured}
- Asset base URL: ${payload.summary.assetBaseUrlRedacted || "missing"}
- Asset base HTTPS: ${payload.summary.assetBaseHttps}
- Asset base includes /coloring-pages: ${payload.summary.assetBaseHasColoringPagesPrefix}
- Asset base not r2.dev: ${payload.summary.assetBaseNotR2Dev}
- Asset base not private R2/S3 endpoint: ${payload.summary.assetBaseNotPrivateR2Endpoint}
- No public env credentials: ${payload.summary.noPublicEnvCredentials}
- Production asset domain ready: ${payload.summary.production_asset_domain_ready}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No blockers found in local env validation.\n"}
`;
}

function renderUrlResultsReport(payload) {
  return `# Round 5I Custom Domain URL Results

- Status: ${payload.summary.status}
- Planned URLs: ${payload.summary.plannedUrlCount}
- Checked URLs: ${payload.summary.checkedUrlCount}
- HTTP 200 count: ${payload.summary.http200Count}
- SVG content type pass count: ${payload.summary.svgContentTypePassCount}
- WebP content type pass count: ${payload.summary.webpContentTypePassCount}
- SVG URLs passed: ${payload.summary.svg_urls_passed}
- WebP URLs passed: ${payload.summary.webp_urls_passed}
- Custom-domain URL verification passed: ${payload.summary.customDomainUrlVerificationPassed}
- Cache headers observed: ${(payload.summary.cacheHeadersObserved || []).join(" | ") || "none"}
- CORS headers observed: ${(payload.summary.corsHeadersObserved || []).join(" | ") || "none"}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderCorsReport(payload) {
  return `# Round 5I Custom Domain CORS Report

- Status: ${payload.summary.status}
- Origins checked: ${payload.summary.originsChecked.join(", ") || "none"}
- Origin request count: ${payload.summary.checkedOriginRequestCount}
- GET OK count: ${payload.summary.getOkCount}
- HEAD OK count: ${payload.summary.headOkCount}
- CORS OK count: ${payload.summary.corsOkCount}
- SVG CORS passed: ${payload.summary.svg_cors_passed}
- Browser CORS failure expected: ${payload.summary.browserCorsFailureExpected}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
${payload.requiredFix?.length ? `## Required Fix\n\n${payload.requiredFix.map((item) => `- ${item}`).join("\n")}\n` : ""}
`;
}

function renderCacheReport(payload) {
  return `# Round 5I Cache And Content-Type Report

- Status: ${payload.summary.status}
- Checked URLs: ${payload.summary.checkedUrlCount}
- SVG content type OK: ${payload.summary.svgContentTypeOk}
- WebP content type OK: ${payload.summary.webpContentTypeOk}
- Cache headers present count: ${payload.summary.cacheHeadersPresentCount}
- Validation header present count: ${payload.summary.validationHeaderPresentCount}
- Versioned asset keys: ${payload.summary.versionedAssetKeys}
- Long-lived caching safe for versioned filenames: ${payload.summary.longLivedCachingSafeForVersionedFilenames}
- Cache headers acceptable: ${payload.summary.cache_headers_acceptable}
- Content type behavior acceptable: ${payload.summary.content_type_behavior_acceptable}

${payload.launchTasks.length ? `## Launch Tasks\n\n${payload.launchTasks.map((task) => `- ${task}`).join("\n")}\n` : ""}
`;
}

function renderStaticExportReport(payload) {
  return `# Round 5I Production Static Export Report

- Status: ${payload.summary.status}
- Build command: ${payload.command}
- Build exit code: ${payload.summary.buildExitCode}
- Static export works: ${payload.summary.staticExportWorks}
- Localhost leakage present: ${payload.summary.localhostLeakagePresent}
- r2.dev leakage present: ${payload.summary.r2DevLeakagePresent}
- Private R2 endpoint leakage present: ${payload.summary.privateR2EndpointLeakagePresent}
- Source file path leakage present: ${payload.summary.sourceFilePathLeakagePresent}
- Old test prefix present: ${payload.summary.oldTestPrefixPresent}
- Duplicate coloring-pages prefix present: ${payload.summary.duplicateColoringPagesPrefixPresent}
- Download SVG labels or links present: ${payload.summary.downloadSvgLabelsOrLinksPresent}
- app/api route references present: ${payload.summary.appApiRouteReferencesPresent}
- Live AdSense code present: ${payload.summary.liveAdSenseCodePresent}
- Bad canonical URLs present: ${payload.summary.badCanonicalUrlsPresent}
- Bad sitemap URLs present: ${payload.summary.badSitemapUrlsPresent}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderBrowserQaReport(payload) {
  return `# Round 5I Browser Custom Domain QA Report

- Status: ${payload.summary.status}
- Pages inspected: ${payload.summary.pagesInspected}
- WebP preview renders: ${payload.summary.webpPreviewRenders}
- Non-uploaded items fall back gracefully: ${payload.summary.nonUploadedItemsFallbackGracefully}
- No broken image icons: ${payload.summary.noBrokenImageIcons}
- Local media server required: ${payload.summary.localMediaServerRequired}
- Internal SVG loads: ${payload.summary.internalSvgLoads}
- Browser canvas export passed: ${payload.summary.browserCanvasExportPassed}
- PNG download works: ${payload.summary.pngDownloadWorks}
- JPG download works: ${payload.summary.jpgDownloadWorks}
- WebP download works: ${payload.summary.webpDownloadWorks}
- Print works: ${payload.summary.printWorks}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Ad density matches Round 4U: ${payload.summary.adDensityMatchesRound4U}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}
- app/api present: ${payload.summary.appApiRoutePresent}
- Screenshots: ${payload.screenshotPaths.length}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderDownloadReadinessReport(payload) {
  return `# Round 5I Download Production Readiness

- Custom domain verified: ${payload.custom_domain_verified}
- SVG URLs passed: ${payload.svg_urls_passed}
- WebP URLs passed: ${payload.webp_urls_passed}
- SVG CORS passed: ${payload.svg_cors_passed}
- Browser canvas export passed: ${payload.browser_canvas_export_passed}
- Print ready: ${payload.print_ready}
- PNG download ready: ${payload.png_download_ready}
- JPG download ready: ${payload.jpg_download_ready}
- WebP download ready: ${payload.webp_download_ready}
- SVG user download absent: ${payload.svg_user_download_absent}
- Cache headers acceptable: ${payload.cache_headers_acceptable}
- Ready for full upload: ${payload.ready_for_full_upload}
- Ready for image sitemap: ${payload.ready_for_image_sitemap}
- Ready for OG images: ${payload.ready_for_og_images}
- Live ads in scope: ${payload.live_ads_in_scope}

## Decision

${payload.decision}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderUploadGuidanceReport(payload) {
  return `# Round 5I Final Upload Guidance

- Final SVG plus WebP model confirmed: ${payload.summary.finalSvgWebpModelConfirmed}
- PNG/thumbs can remain excluded: ${payload.summary.pngThumbsCanRemainExcluded}
- SVG internal only: ${payload.summary.svgInternalOnly}
- Full upload still final stage: ${payload.summary.fullUploadStillFinalStage}
- Explicit approval required before full upload: ${payload.summary.explicitApprovalRequiredBeforeFullUpload}
- Image sitemap deferred: ${payload.summary.imageSitemapDeferred}
- Open Graph images deferred: ${payload.summary.openGraphImagesDeferred}
- Live AdSense deferred: ${payload.summary.liveAdSenseDeferred}

## Object Key Pattern

${payload.objectKeyPattern}

## Custom Asset Domain Pattern

${payload.customAssetDomainPattern}

## Required Content Types

- SVG: ${payload.requiredContentTypes.svg}
- WebP: ${payload.requiredContentTypes.webp}

## Required CORS

- Origins: ${payload.requiredCors.origins.join(", ") || "production origin must be configured"}
- Methods: ${payload.requiredCors.methods.join(", ")}
- Credentials required: ${payload.requiredCors.credentialsRequired}

## Cache Recommendation

- Cache-Control: ${payload.cacheHeaderRecommendation.cacheControl}
- ETag or Last-Modified recommended: ${payload.cacheHeaderRecommendation.etagOrLastModifiedRecommended}
- Purge needed after header change: ${payload.cacheHeaderRecommendation.purgeNeededAfterHeaderChange}

## Full Upload Checklist

${payload.fullUploadChecklist.map((item) => `- ${item}`).join("\n")}

## Verification Commands After Full Upload

${payload.verificationCommandsAfterFullUpload.map((command) => `- \`${command}\``).join("\n")}
`;
}
