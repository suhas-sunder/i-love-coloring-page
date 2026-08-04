#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const PLAN_PATH = "pipeline/manifests/round-5c-svg-webp-url-verification-plan.json";
const EXPECTED_SITE_URL = "https://www.ilovecoloringpage.com";
const EXPECTED_ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const LOCAL_ORIGINS = ["http://localhost:3005", "http://127.0.0.1:3005"];
const OPTIONAL_APEX_ORIGIN = "https://ilovecoloringpage.com";

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5k-project-context-check.json",
  envValidation: "pipeline/manifests/round-5k-env-validation.json",
  urlResults: "pipeline/manifests/round-5k-custom-domain-url-results.json",
  corsResults: "pipeline/manifests/round-5k-origin-cors-results.json",
  cacheResults: "pipeline/manifests/round-5k-cache-content-type-results.json",
  staticExport: "pipeline/manifests/round-5k-production-static-export-results.json",
  browserQa: "pipeline/manifests/round-5k-browser-custom-domain-qa-results.json",
  readiness: "pipeline/manifests/round-5k-download-production-readiness.json",
  guidance: "pipeline/manifests/round-5k-final-upload-guidance.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5k-project-context-check.md",
  envValidation: "pipeline/reports/round-5k-env-validation.md",
  urlResults: "pipeline/reports/round-5k-custom-domain-url-results.md",
  corsResults: "pipeline/reports/round-5k-origin-cors-report.md",
  cacheResults: "pipeline/reports/round-5k-cache-content-type-report.md",
  staticExport: "pipeline/reports/round-5k-production-static-export-report.md",
  browserQa: "pipeline/reports/round-5k-browser-custom-domain-qa-report.md",
  readiness: "pipeline/reports/round-5k-download-production-readiness.md",
  guidance: "pipeline/reports/round-5k-final-upload-guidance.md",
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const plan = await readJson(PLAN_PATH);
  const publicEnv = await loadPublicEnv(args);
  const projectContext = await buildProjectContext(generatedAt);
  const envValidation = buildEnvValidation(generatedAt, publicEnv);
  const urlResults = envValidation.summary.production_env_ready
    ? await runUrlChecks(generatedAt, plan, publicEnv.assetBaseUrl)
    : buildNotRunUrlResults(generatedAt, plan, envValidation);
  const corsResults = envValidation.summary.production_env_ready
    ? await runCorsChecks(generatedAt, plan, publicEnv.assetBaseUrl, envValidation.summary.siteOrigin)
    : buildNotRunCorsResults(generatedAt, plan, envValidation);
  const cacheResults = envValidation.summary.production_env_ready
    ? buildCacheContentTypeResults(generatedAt, urlResults)
    : buildNotRunCacheResults(generatedAt, plan, envValidation);
  const staticExport = envValidation.summary.production_env_ready && !args.skipStaticBuild
    ? await runStaticExportCheck(generatedAt, publicEnv)
    : buildNotRunStaticExport(generatedAt, envValidation, args.skipStaticBuild);
  const browserQa = buildInitialBrowserQa(generatedAt, publicEnv.assetBaseUrl, envValidation, urlResults, corsResults);
  const readiness = buildReadiness(generatedAt, envValidation, urlResults, corsResults, cacheResults, staticExport, browserQa);
  const guidance = buildGuidance(generatedAt, publicEnv, readiness, urlResults, corsResults, cacheResults);

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.envValidation, envValidation);
  await writeText(REPORTS.envValidation, renderEnvReport(envValidation));
  await writeJson(OUTPUTS.urlResults, urlResults);
  await writeText(REPORTS.urlResults, renderUrlReport(urlResults));
  await writeJson(OUTPUTS.corsResults, corsResults);
  await writeText(REPORTS.corsResults, renderCorsReport(corsResults));
  await writeJson(OUTPUTS.cacheResults, cacheResults);
  await writeText(REPORTS.cacheResults, renderCacheReport(cacheResults));
  await writeJson(OUTPUTS.staticExport, staticExport);
  await writeText(REPORTS.staticExport, renderStaticExportReport(staticExport));
  await writeJson(OUTPUTS.browserQa, browserQa);
  await writeText(REPORTS.browserQa, renderBrowserQaReport(browserQa));
  await writeJson(OUTPUTS.readiness, readiness);
  await writeText(REPORTS.readiness, renderReadinessReport(readiness));
  await writeJson(OUTPUTS.guidance, guidance);
  await writeText(REPORTS.guidance, renderGuidanceReport(guidance));

  await mkdir(path.join(REPO_ROOT, "pipeline", "review", "round-5k", "screenshots"), { recursive: true });

  console.log(JSON.stringify({
    runId: "round-5k-custom-domain-verification",
    productionEnvReady: envValidation.summary.production_env_ready,
    urlStatus: urlResults.summary.status,
    svgUrlsPassed: urlResults.summary.svg_urls_passed,
    webpUrlsPassed: urlResults.summary.webp_urls_passed,
    svgCorsPassed: corsResults.summary.svg_cors_passed,
    cacheHeadersAcceptable: cacheResults.summary.cache_headers_acceptable,
    staticExportStatus: staticExport.summary.status,
    readyForFullUpload: readiness.ready_for_full_upload,
    blockers: readiness.blockers,
  }, null, 2));
}

async function buildProjectContext(generatedAt) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim();
  const repoName = path.basename(repoRoot);
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "--short", "HEAD"])).trim();
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const testBundleFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages"));
  const downloadSource = `${browserDownloads}\n${downloadMenu}\n${imageCard}`;

  return {
    generatedAt,
    runId: "round-5k-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      head,
      round5jCommitExists: await gitCommitExists("48bfa80"),
      appApiRoutePresent: appFiles.some((file) => normalizePath(file).includes("/api/")) || existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      testBundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages")),
      testBundleSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "svg")),
      testBundleWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "webp")),
      testBundleSvgCount: testBundleFiles.filter((file) => file.endsWith(".svg")).length,
      testBundleWebpCount: testBundleFiles.filter((file) => file.endsWith(".webp")).length,
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      publicDirectoryExists: existsSync(path.join(REPO_ROOT, "public")),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      pipelineProductionFullStatusClean: (await gitStatusFor("pipeline/production/full")).trim() === "",
      trackedR2UploadMediaCount: countLines(await git(["ls-files", "pipeline/r2-upload"])),
      trackedTestBundleMediaCount: countLines(await git(["ls-files", "pipeline/r2-upload-test-svg-webp"])),
      currentPublicDownloadFormats: getPublicDownloadFormats(downloadSource),
      pngJpgWebpControlsPresent: /label:\s*"PNG"/.test(downloadMenu) && /label:\s*"JPG"/.test(downloadMenu) && /label:\s*"WebP"/.test(downloadMenu),
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(downloadSource),
      printUsesInternalSvg: /printFromHighQualitySource/.test(imageCard) && /convertInternalSvgToBlob/.test(browserDownloads),
      adWellsVisibleByDefault: /Advertisement/.test(sourceText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      imageSitemapGenerated: /image-sitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      jsonLdExpansionPresent: /application\/ld\+json/i.test(sourceText),
      uploadCommandRunByCodex: false,
    },
    wrongContext: {
      checked: true,
      actualWrongRoutesFound: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText),
      note: "Wrong-context guards are checked against app and src source, not historical pipeline notes.",
    },
  };
}

async function loadPublicEnv(args) {
  const fileValues = {};
  const fileSources = {};
  for (const envPath of [".env", ".env.local"]) {
    const absolute = path.join(REPO_ROOT, envPath);
    if (!existsSync(absolute)) continue;
    const parsed = parseEnvFile(await readFile(absolute, "utf8"));
    for (const key of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_COLORING_ASSET_BASE_URL", "NEXT_PUBLIC_CONTACT_EMAIL"]) {
      if (parsed[key] != null) {
        fileValues[key] = parsed[key];
        fileSources[key] = envPath;
      }
    }
  }

  return {
    siteUrl: normalizeUrl(args.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || fileValues.NEXT_PUBLIC_SITE_URL || ""),
    assetBaseUrl: normalizeUrl(args.publicBaseUrl || args.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || fileValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || ""),
    contactEmail: String(args.contactEmail || process.env.NEXT_PUBLIC_CONTACT_EMAIL || fileValues.NEXT_PUBLIC_CONTACT_EMAIL || "").trim(),
    valueSources: {
      siteUrl: args.siteUrl ? "cli" : process.env.NEXT_PUBLIC_SITE_URL ? "process" : fileValues.NEXT_PUBLIC_SITE_URL ? fileSources.NEXT_PUBLIC_SITE_URL : "missing",
      assetBaseUrl: args.publicBaseUrl || args.assetBaseUrl ? "cli" : process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL ? "process" : fileValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL ? fileSources.NEXT_PUBLIC_COLORING_ASSET_BASE_URL : "missing",
      contactEmail: args.contactEmail ? "cli" : process.env.NEXT_PUBLIC_CONTACT_EMAIL ? "process" : fileValues.NEXT_PUBLIC_CONTACT_EMAIL ? fileSources.NEXT_PUBLIC_CONTACT_EMAIL : "missing",
    },
  };
}

function buildEnvValidation(generatedAt, publicEnv) {
  const site = inspectUrl(publicEnv.siteUrl, false);
  const asset = inspectUrl(publicEnv.assetBaseUrl, true);
  const blockers = [];
  const notes = [];

  if (!publicEnv.siteUrl) blockers.push("NEXT_PUBLIC_SITE_URL is not set.");
  if (publicEnv.siteUrl && publicEnv.siteUrl !== EXPECTED_SITE_URL) notes.push("NEXT_PUBLIC_SITE_URL is not the primary expected URL. Treat it as production-equivalent only if documented by the owner.");
  if (publicEnv.siteUrl && publicEnv.siteUrl !== EXPECTED_SITE_URL) blockers.push("NEXT_PUBLIC_SITE_URL must be https://www.ilovecoloringpage.com for Round 5K unless an equivalent production URL is documented.");
  if (!site.valid) blockers.push("NEXT_PUBLIC_SITE_URL is not a valid URL.");
  if (!site.https) blockers.push("NEXT_PUBLIC_SITE_URL must be HTTPS.");
  if (site.localhost) blockers.push("NEXT_PUBLIC_SITE_URL must not be localhost or loopback.");
  if (site.placeholder) blockers.push("NEXT_PUBLIC_SITE_URL must not be a placeholder domain.");

  if (!publicEnv.assetBaseUrl) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not set.");
  if (publicEnv.assetBaseUrl && publicEnv.assetBaseUrl !== EXPECTED_ASSET_BASE_URL) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must normalize to https://assets.ilovecoloringpage.com/coloring-pages.");
  if (!asset.valid) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not a valid URL.");
  if (!asset.https) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.");
  if (!asset.hasColoringPagesPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must include /coloring-pages.");
  if (asset.localhost) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.");
  if (asset.r2Dev) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not use r2.dev.");
  if (asset.privateR2Endpoint) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not point at a private R2 or S3 endpoint.");
  if (asset.oldTestPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not include /coloring/test-v1.");
  if (asset.duplicateColoringPagesPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not include duplicate /coloring-pages/coloring-pages.");
  if (asset.placeholder) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be a placeholder domain.");

  if (!publicEnv.contactEmail) blockers.push("NEXT_PUBLIC_CONTACT_EMAIL is not set.");
  if (publicEnv.contactEmail && publicEnv.contactEmail !== EXPECTED_CONTACT_EMAIL) blockers.push("NEXT_PUBLIC_CONTACT_EMAIL must be admin@ilovecoloringpage.com unless the owner approves another public contact.");

  const noCredentials = !site.credentialsInUrl && !asset.credentialsInUrl && !containsCredentialLikeValue(publicEnv.contactEmail);
  if (!noCredentials) blockers.push("One or more public env values appear to contain credentials or token-like values.");

  return {
    generatedAt,
    runId: "round-5k-env-validation",
    expected: {
      NEXT_PUBLIC_SITE_URL: EXPECTED_SITE_URL,
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: EXPECTED_ASSET_BASE_URL,
      NEXT_PUBLIC_CONTACT_EMAIL: EXPECTED_CONTACT_EMAIL,
    },
    rawValueCaptured: false,
    valueSources: publicEnv.valueSources,
    values: {
      siteUrl: redactPublicValue(publicEnv.siteUrl),
      assetBaseUrl: redactPublicValue(publicEnv.assetBaseUrl),
      contactEmail: redactPublicValue(publicEnv.contactEmail),
    },
    summary: {
      siteUrlSet: Boolean(publicEnv.siteUrl),
      siteUrlMatchesExpected: publicEnv.siteUrl === EXPECTED_SITE_URL,
      siteUrlHttps: site.https,
      siteUrlNotLocalhost: !site.localhost,
      siteOrigin: site.url?.origin || "",
      assetBaseSet: Boolean(publicEnv.assetBaseUrl),
      assetBaseMatchesExpected: publicEnv.assetBaseUrl === EXPECTED_ASSET_BASE_URL,
      assetBaseHttps: asset.https,
      assetBaseHasColoringPagesPrefix: asset.hasColoringPagesPrefix,
      assetBaseNotLocalhost: !asset.localhost,
      assetBaseNotR2Dev: !asset.r2Dev,
      assetBaseNotPrivateR2Endpoint: !asset.privateR2Endpoint,
      assetBaseHasNoOldTestPrefix: !asset.oldTestPrefix,
      assetBaseHasNoDuplicateColoringPagesPrefix: !asset.duplicateColoringPagesPrefix,
      assetBaseCustomDomain: asset.valid && asset.https && !asset.r2Dev && !asset.privateR2Endpoint && !asset.localhost && !asset.placeholder,
      contactEmailSet: Boolean(publicEnv.contactEmail),
      contactEmailMatchesExpected: publicEnv.contactEmail === EXPECTED_CONTACT_EMAIL,
      noPublicEnvCredentials: noCredentials,
      r2DevIsProductionReady: false,
      production_env_ready: blockers.length === 0,
      production_asset_domain_ready: blockers.length === 0,
    },
    blockers,
    notes,
  };
}

async function runUrlChecks(generatedAt, plan, assetBaseUrl) {
  const allUrls = getPlanUrls(plan);
  const checks = [];
  for (const entry of allUrls) checks.push(await checkPublicUrl(entry, assetBaseUrl, null));
  const svgChecks = checks.filter((check) => check.mediaType === "svg");
  const webpChecks = checks.filter((check) => check.mediaType === "webp");
  const allPassed = checks.length === allUrls.length && checks.every((check) => check.passed);
  const webpFailedSvgPassed = svgChecks.every((check) => check.passed) && webpChecks.some((check) => !check.passed);

  return {
    generatedAt,
    runId: "round-5k-custom-domain-url-results",
    sourcePlan: PLAN_PATH,
    assetBaseUrl: redactPublicValue(assetBaseUrl),
    summary: {
      status: "completed",
      plannedUrlCount: allUrls.length,
      plannedSvgUrlCount: svgChecks.length,
      plannedWebpUrlCount: webpChecks.length,
      checkedUrlCount: checks.length,
      http200Count: checks.filter((check) => check.getStatusOk).length,
      headOkCount: checks.filter((check) => check.headStatusOk).length,
      svgContentTypePassCount: svgChecks.filter((check) => check.contentTypeOk).length,
      webpContentTypePassCount: webpChecks.filter((check) => check.contentTypeOk).length,
      nonZeroByteCount: checks.filter((check) => check.nonZeroBytes).length,
      noAccessDeniedXml: checks.every((check) => !check.accessDeniedXml),
      noCloudflareR2ErrorHtml: checks.every((check) => !check.cloudflareOrR2ErrorHtml),
      noPrivateEndpointRedirect: checks.every((check) => !check.privateEndpointRedirect),
      noR2DevUrl: checks.every((check) => !check.r2DevUrl),
      noOldTestPrefix: checks.every((check) => !check.oldPrefix),
      noDuplicateColoringPagesPrefix: checks.every((check) => !check.duplicateColoringPagesPrefix),
      noLocalFilesystemPathLeak: checks.every((check) => !check.localFilesystemPathLeak),
      noPngSubstituteUsedForWebp: checks.every((check) => check.mediaType !== "webp" || !check.url.includes("/png/")),
      cacheHeadersObserved: [...new Set(checks.map((check) => check.cacheControl).filter(Boolean))],
      corsHeadersObserved: [...new Set(checks.map((check) => check.accessControlAllowOrigin).filter(Boolean))],
      svg_urls_passed: svgChecks.length === 30 && svgChecks.every((check) => check.passed),
      webp_urls_passed: webpChecks.length === 30 && webpChecks.every((check) => check.passed),
      customDomainUrlVerificationPassed: allPassed,
      webpFailedSvgPassed,
    },
    checks,
    blockers: allPassed
      ? []
      : [
          "One or more custom-domain SVG/WebP URL checks failed. Fix upload paths, content types, object visibility, or the asset base URL before proceeding.",
          ...(webpFailedSvgPassed ? ["SVG passed but WebP failed, which points to a likely WebP upload path or content-type issue. PNG was not used as a substitute."] : []),
        ],
  };
}

function buildNotRunUrlResults(generatedAt, plan, envValidation) {
  const allUrls = getPlanUrls(plan);
  return {
    generatedAt,
    runId: "round-5k-custom-domain-url-results",
    sourcePlan: PLAN_PATH,
    summary: {
      status: "not_run",
      plannedUrlCount: allUrls.length,
      plannedSvgUrlCount: allUrls.filter((entry) => entry.mediaType === "svg").length,
      plannedWebpUrlCount: allUrls.filter((entry) => entry.mediaType === "webp").length,
      checkedUrlCount: 0,
      http200Count: 0,
      headOkCount: 0,
      svgContentTypePassCount: 0,
      webpContentTypePassCount: 0,
      nonZeroByteCount: 0,
      noAccessDeniedXml: null,
      noCloudflareR2ErrorHtml: null,
      noPrivateEndpointRedirect: null,
      noR2DevUrl: null,
      noOldTestPrefix: envValidation.summary.assetBaseHasNoOldTestPrefix,
      noDuplicateColoringPagesPrefix: envValidation.summary.assetBaseHasNoDuplicateColoringPagesPrefix,
      noLocalFilesystemPathLeak: null,
      noPngSubstituteUsedForWebp: true,
      cacheHeadersObserved: [],
      corsHeadersObserved: [],
      svg_urls_passed: false,
      webp_urls_passed: false,
      customDomainUrlVerificationPassed: false,
      webpFailedSvgPassed: false,
    },
    checks: [],
    blockers: ["Custom-domain URL verification was not run because Round 5K env validation failed.", ...envValidation.blockers],
  };
}

async function checkPublicUrl(entry, assetBaseUrl, origin) {
  const url = buildPublicAssetUrl(assetBaseUrl, entry);
  const result = {
    assetId: entry.assetId,
    displayTitle: entry.displayTitle,
    mediaType: entry.mediaType,
    r2ObjectKey: entry.r2ObjectKey,
    url: redactPublicValue(url),
    origin: origin || "",
    expectedContentType: entry.expectedContentType,
    getStatus: null,
    headStatus: null,
    finalUrl: "",
    contentType: "",
    contentLength: null,
    byteLength: 0,
    cacheControl: "",
    etag: "",
    lastModified: "",
    accessControlAllowOrigin: "",
    accessControlAllowCredentials: "",
    vary: "",
    getStatusOk: false,
    headStatusOk: false,
    contentTypeOk: false,
    nonZeroBytes: false,
    corsOk: null,
    credentialsRequired: false,
    accessDeniedXml: false,
    cloudflareOrR2ErrorHtml: false,
    privateEndpointRedirect: false,
    r2DevUrl: false,
    oldPrefix: false,
    duplicateColoringPagesPrefix: false,
    localFilesystemPathLeak: false,
    passed: false,
    error: "",
  };

  const headers = origin ? { Origin: origin } : {};
  try {
    const headResponse = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
    result.headStatus = headResponse.status;
    result.headStatusOk = headResponse.ok;
  } catch {
    result.headStatus = null;
  }

  try {
    const response = await fetch(url, { method: "GET", headers, redirect: "follow" });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const snippet = bytesToTextSnippet(bytes);
    const final = new URL(response.url);
    const contentType = response.headers.get("content-type") || "";
    const acaOrigin = response.headers.get("access-control-allow-origin") || "";
    const acaCredentials = response.headers.get("access-control-allow-credentials") || "";

    result.getStatus = response.status;
    result.finalUrl = redactPublicValue(response.url);
    result.contentType = contentType;
    result.contentLength = Number(response.headers.get("content-length")) || null;
    result.byteLength = bytes.byteLength;
    result.cacheControl = response.headers.get("cache-control") || "";
    result.etag = response.headers.get("etag") || "";
    result.lastModified = response.headers.get("last-modified") || "";
    result.accessControlAllowOrigin = acaOrigin;
    result.accessControlAllowCredentials = acaCredentials;
    result.vary = response.headers.get("vary") || "";
    result.getStatusOk = response.status === 200;
    result.contentTypeOk = contentTypeAcceptable(contentType, entry.expectedContentType);
    result.nonZeroBytes = bytes.byteLength > 0;
    result.corsOk = origin ? corsAllowsOrigin(acaOrigin, origin) : null;
    result.credentialsRequired = /^true$/i.test(acaCredentials);
    result.accessDeniedXml = /<Error>[\s\S]*AccessDenied|<Code>AccessDenied<\/Code>/i.test(snippet);
    result.cloudflareOrR2ErrorHtml = /<html[\s\S]*(cloudflare|r2|access denied|not found|error)/i.test(snippet);
    result.privateEndpointRedirect = /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(final.hostname);
    result.r2DevUrl = final.hostname.endsWith(".r2.dev") || /\.r2\.dev\//i.test(url);
    result.oldPrefix = url.includes("/coloring/test-v1");
    result.duplicateColoringPagesPrefix = url.includes("/coloring-pages/coloring-pages");
    const bodyTextToScan = isTextualResponse(entry.mediaType, contentType) ? snippet : "";
    result.localFilesystemPathLeak = /[A-Za-z]:\\|\/Users\/|\/home\/|D:\/PROJECTS|ilovesvg/i.test(bodyTextToScan) || /[A-Za-z]:\\|\/Users\/|\/home\/|D:\/PROJECTS|ilovesvg/i.test(url);
    result.passed = Boolean(
      result.getStatusOk &&
        result.headStatusOk &&
        result.contentTypeOk &&
        result.nonZeroBytes &&
        !result.accessDeniedXml &&
        !result.cloudflareOrR2ErrorHtml &&
        !result.privateEndpointRedirect &&
        !result.r2DevUrl &&
        !result.oldPrefix &&
        !result.duplicateColoringPagesPrefix &&
        !result.localFilesystemPathLeak &&
        (origin ? result.corsOk && !result.credentialsRequired : true),
    );
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

async function runCorsChecks(generatedAt, plan, assetBaseUrl, siteOrigin) {
  const allUrls = getPlanUrls(plan);
  const svgEntries = allUrls.filter((entry) => entry.mediaType === "svg");
  const webpEntries = allUrls.filter((entry) => entry.mediaType === "webp");
  const requiredOrigins = [...LOCAL_ORIGINS, siteOrigin].filter(Boolean).filter(uniqueFilter);
  const optionalOrigins = [OPTIONAL_APEX_ORIGIN].filter((origin) => !requiredOrigins.includes(origin));
  const svgChecks = [];
  const webpChecks = [];

  for (const origin of [...requiredOrigins, ...optionalOrigins]) {
    for (const entry of svgEntries) svgChecks.push(await checkPublicUrl(entry, assetBaseUrl, origin));
    for (const entry of webpEntries) webpChecks.push(await checkPublicUrl(entry, assetBaseUrl, origin));
  }

  const requiredSvgChecks = svgChecks.filter((check) => requiredOrigins.includes(check.origin));
  const optionalSvgChecks = svgChecks.filter((check) => optionalOrigins.includes(check.origin));
  const requiredWebpChecks = webpChecks.filter((check) => requiredOrigins.includes(check.origin));
  const requiredSvgPassed = requiredSvgChecks.length === svgEntries.length * requiredOrigins.length && requiredSvgChecks.every((check) => check.passed);
  const webpContentTypePassed = requiredWebpChecks.length === webpEntries.length * requiredOrigins.length && requiredWebpChecks.every((check) => check.getStatusOk && check.contentTypeOk && check.nonZeroBytes);

  return {
    generatedAt,
    runId: "round-5k-origin-cors-results",
    sourcePlan: PLAN_PATH,
    origins: {
      required: requiredOrigins,
      optional: optionalOrigins,
    },
    summary: {
      status: "completed",
      svgUrlCount: svgEntries.length,
      webpUrlCount: webpEntries.length,
      originsChecked: [...requiredOrigins, ...optionalOrigins],
      requiredOriginsChecked: requiredOrigins,
      optionalOriginsChecked: optionalOrigins,
      checkedSvgRequestCount: svgChecks.length,
      checkedWebpRequestCount: webpChecks.length,
      svgGetOkCount: svgChecks.filter((check) => check.getStatusOk).length,
      svgHeadOkCount: svgChecks.filter((check) => check.headStatusOk).length,
      svgCorsOkCount: svgChecks.filter((check) => check.corsOk).length,
      svgNoCredentialsRequired: svgChecks.every((check) => !check.credentialsRequired),
      svg_cors_passed: requiredSvgPassed,
      optionalApexSvgCorsPassed: optionalSvgChecks.length > 0 ? optionalSvgChecks.every((check) => check.passed) : null,
      webpCorsHeadersDocumented: webpChecks.length > 0,
      webpContentTypePassed,
      browserCrossOriginAnonymousReady: requiredSvgPassed,
      staleCachedResponseMissingHeaders: requiredSvgChecks.some((check) => !check.accessControlAllowOrigin),
    },
    svgChecks,
    webpChecks,
    blockers: requiredSvgPassed
      ? []
      : ["SVG Origin-aware CORS failed for one or more required origins. Configure the asset domain to return Access-Control-Allow-Origin for localhost preview and https://www.ilovecoloringpage.com, allow GET and HEAD, and purge cached stale responses if headers were recently changed."],
  };
}

function buildNotRunCorsResults(generatedAt, plan, envValidation) {
  const allUrls = getPlanUrls(plan);
  return {
    generatedAt,
    runId: "round-5k-origin-cors-results",
    sourcePlan: PLAN_PATH,
    origins: {
      required: [...LOCAL_ORIGINS, EXPECTED_SITE_URL],
      optional: [OPTIONAL_APEX_ORIGIN],
    },
    summary: {
      status: "not_run",
      svgUrlCount: allUrls.filter((entry) => entry.mediaType === "svg").length,
      webpUrlCount: allUrls.filter((entry) => entry.mediaType === "webp").length,
      originsChecked: [],
      requiredOriginsChecked: [],
      optionalOriginsChecked: [],
      checkedSvgRequestCount: 0,
      checkedWebpRequestCount: 0,
      svgGetOkCount: 0,
      svgHeadOkCount: 0,
      svgCorsOkCount: 0,
      svgNoCredentialsRequired: null,
      svg_cors_passed: false,
      optionalApexSvgCorsPassed: null,
      webpCorsHeadersDocumented: false,
      webpContentTypePassed: false,
      browserCrossOriginAnonymousReady: false,
      staleCachedResponseMissingHeaders: null,
    },
    svgChecks: [],
    webpChecks: [],
    blockers: ["Origin-aware CORS verification was not run because Round 5K env validation failed.", ...envValidation.blockers],
  };
}

function buildCacheContentTypeResults(generatedAt, urlResults) {
  const checks = urlResults.checks || [];
  const svgChecks = checks.filter((check) => check.mediaType === "svg");
  const webpChecks = checks.filter((check) => check.mediaType === "webp");
  const allCachePresent = checks.length > 0 && checks.every((check) => Boolean(check.cacheControl));
  const validationHeaderPresentCount = checks.filter((check) => Boolean(check.etag || check.lastModified)).length;
  const longLivedCount = checks.filter((check) => cacheHasLongLivedMaxAge(check.cacheControl)).length;
  const versionedAssetKeys = checks.every((check) => /-[a-f0-9]{10}\.(?:svg|webp)$/i.test(check.r2ObjectKey));
  const launchTasks = [];

  if (!allCachePresent) launchTasks.push("Add Cache-Control headers to every SVG and WebP object before production launch.");
  if (longLivedCount !== checks.length) launchTasks.push("Consider public, max-age=31536000, immutable for hash-versioned SVG and WebP object keys.");
  if (validationHeaderPresentCount !== checks.length) launchTasks.push("Keep ETag or Last-Modified available for validation and troubleshooting.");

  return {
    generatedAt,
    runId: "round-5k-cache-content-type-results",
    summary: {
      status: "completed",
      checkedUrlCount: checks.length,
      svgContentTypeOk: svgChecks.length === 30 && svgChecks.every((check) => check.contentTypeOk),
      webpContentTypeOk: webpChecks.length === 30 && webpChecks.every((check) => check.contentTypeOk),
      cacheHeadersPresentCount: checks.filter((check) => Boolean(check.cacheControl)).length,
      cacheHeadersObserved: [...new Set(checks.map((check) => check.cacheControl).filter(Boolean))],
      validationHeaderPresentCount,
      validationHeadersObserved: [...new Set(checks.flatMap((check) => [check.etag ? "ETag" : "", check.lastModified ? "Last-Modified" : ""]).filter(Boolean))],
      versionedAssetKeys,
      longLivedCachingSafeForVersionedFilenames: versionedAssetKeys,
      longLivedCacheHeaderCount: longLivedCount,
      cache_headers_acceptable: allCachePresent,
      cache_readiness: allCachePresent && longLivedCount === checks.length ? "ready" : allCachePresent ? "partial" : "blocked",
      content_type_behavior_acceptable: svgChecks.every((check) => check.contentTypeOk) && webpChecks.every((check) => check.contentTypeOk),
      cachePurgeOrObjectKeyVersioningNeeded: longLivedCount !== checks.length ? "Use object key versioning or purge if cache policy changes after upload." : "Object keys include hashes, so long-lived immutable caching is safe.",
    },
    checks: checks.map((check) => ({
      assetId: check.assetId,
      mediaType: check.mediaType,
      r2ObjectKey: check.r2ObjectKey,
      contentType: check.contentType,
      cacheControl: check.cacheControl,
      etagPresent: Boolean(check.etag),
      lastModifiedPresent: Boolean(check.lastModified),
    })),
    launchTasks,
  };
}

function buildNotRunCacheResults(generatedAt, plan, envValidation) {
  const allUrls = getPlanUrls(plan);
  return {
    generatedAt,
    runId: "round-5k-cache-content-type-results",
    summary: {
      status: "not_run",
      checkedUrlCount: 0,
      plannedUrlCount: allUrls.length,
      svgContentTypeOk: false,
      webpContentTypeOk: false,
      cacheHeadersPresentCount: 0,
      cacheHeadersObserved: [],
      validationHeaderPresentCount: 0,
      validationHeadersObserved: [],
      versionedAssetKeys: null,
      longLivedCachingSafeForVersionedFilenames: null,
      longLivedCacheHeaderCount: 0,
      cache_headers_acceptable: false,
      cache_readiness: "not_run",
      content_type_behavior_acceptable: false,
      cachePurgeOrObjectKeyVersioningNeeded: "Not assessed.",
    },
    checks: [],
    launchTasks: ["Run Round 5K URL verification after env validation passes."],
    blockers: ["Cache and content-type checks were not run because Round 5K env validation failed.", ...envValidation.blockers],
  };
}

async function runStaticExportCheck(generatedAt, publicEnv) {
  await rm(path.join(REPO_ROOT, "out"), { recursive: true, force: true });
  const env = {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: publicEnv.siteUrl,
    NEXT_PUBLIC_COLORING_ASSET_BASE_URL: publicEnv.assetBaseUrl,
    NEXT_PUBLIC_CONTACT_EMAIL: publicEnv.contactEmail,
  };
  const build = await runNpmScript("build", { env, timeout: 600_000 });
  const outFiles = await listFilesIfExists(path.join(REPO_ROOT, "out"));
  const textFiles = outFiles.filter((file) => /\.(?:html|js|css|json|txt|xml|svg)$/.test(file));
  const outScan = await scanStaticTextFiles(textFiles, publicEnv.contactEmail);
  const sitemapText = existsSync(path.join(REPO_ROOT, "out", "sitemap.xml")) ? await readFile(path.join(REPO_ROOT, "out", "sitemap.xml"), "utf8") : "";
  const canonicalUrls = outScan.canonicalUrls;
  const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1]);
  const badCanonicalUrls = canonicalUrls.filter((url) => !url.startsWith(publicEnv.siteUrl));
  const badSitemapUrls = sitemapUrls.filter((url) => !url.startsWith(publicEnv.siteUrl));

  const summary = {
    status: "completed",
    buildExitCode: build.exitCode,
    staticExportWorks: build.exitCode === 0 && existsSync(path.join(REPO_ROOT, "out")),
    outFileCount: outFiles.length,
    localhostLeakagePresent: outScan.localhostLeakagePresent,
    r2DevLeakagePresent: outScan.r2DevLeakagePresent,
    privateR2EndpointLeakagePresent: outScan.privateR2EndpointLeakagePresent,
    sourceFilePathLeakagePresent: outScan.sourceFilePathLeakagePresent,
    oldTestPrefixPresent: outScan.oldTestPrefixPresent,
    duplicateColoringPagesPrefixPresent: outScan.duplicateColoringPagesPrefixPresent,
    downloadSvgLabelsOrLinksPresent: outScan.downloadSvgLabelsOrLinksPresent,
    appApiRouteReferencesPresent: outScan.appApiRouteReferencesPresent,
    liveAdSenseCodePresent: outScan.liveAdSenseCodePresent,
    badCanonicalUrlsPresent: badCanonicalUrls.length > 0,
    badSitemapUrlsPresent: badSitemapUrls.length > 0,
    contactEmailPresent: outScan.contactEmailPresent,
    wrongContactEmailPresent: outScan.wrongContactEmailPresent,
  };

  const blockers = [];
  if (!summary.staticExportWorks) blockers.push("Production-like static export failed.");
  if (summary.localhostLeakagePresent) blockers.push("Static export contains localhost or loopback leakage.");
  if (summary.r2DevLeakagePresent) blockers.push("Static export contains r2.dev leakage.");
  if (summary.privateR2EndpointLeakagePresent) blockers.push("Static export contains private R2 or S3 endpoint leakage.");
  if (summary.sourceFilePathLeakagePresent) blockers.push("Static export contains source file path leakage.");
  if (summary.oldTestPrefixPresent) blockers.push("Static export contains old coloring/test-v1 prefix.");
  if (summary.duplicateColoringPagesPrefixPresent) blockers.push("Static export contains duplicate coloring-pages/coloring-pages prefix.");
  if (summary.downloadSvgLabelsOrLinksPresent) blockers.push("Static export contains user-facing SVG download text or links.");
  if (summary.appApiRouteReferencesPresent) blockers.push("Static export contains app/api route references.");
  if (summary.liveAdSenseCodePresent) blockers.push("Static export contains live AdSense code or IDs.");
  if (summary.badCanonicalUrlsPresent) blockers.push("Static export contains canonical URLs outside the expected site URL.");
  if (summary.badSitemapUrlsPresent) blockers.push("Static export contains sitemap URLs outside the expected site URL.");
  if (!summary.contactEmailPresent) blockers.push("Static export does not contain the expected public contact email.");

  return {
    generatedAt,
    runId: "round-5k-production-static-export-results",
    command: "npm run build",
    env: {
      NEXT_PUBLIC_SITE_URL: publicEnv.siteUrl,
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: publicEnv.assetBaseUrl,
      NEXT_PUBLIC_CONTACT_EMAIL: publicEnv.contactEmail,
    },
    summary,
    badCanonicalUrls,
    badSitemapUrls,
    stdoutTail: tail(build.stdout),
    stderrTail: tail(build.stderr),
    blockers,
  };
}

function buildNotRunStaticExport(generatedAt, envValidation, skipped) {
  return {
    generatedAt,
    runId: "round-5k-production-static-export-results",
    command: "npm run build",
    summary: {
      status: "not_run",
      buildExitCode: null,
      staticExportWorks: false,
      localhostLeakagePresent: null,
      r2DevLeakagePresent: null,
      privateR2EndpointLeakagePresent: null,
      sourceFilePathLeakagePresent: null,
      oldTestPrefixPresent: null,
      duplicateColoringPagesPrefixPresent: null,
      downloadSvgLabelsOrLinksPresent: null,
      appApiRouteReferencesPresent: null,
      liveAdSenseCodePresent: null,
      badCanonicalUrlsPresent: null,
      badSitemapUrlsPresent: null,
      contactEmailPresent: null,
      wrongContactEmailPresent: null,
    },
    badCanonicalUrls: [],
    badSitemapUrls: [],
    stdoutTail: "",
    stderrTail: "",
    blockers: [skipped ? "Static export check was skipped by CLI flag." : "Static export was not run because Round 5K env validation failed.", ...envValidation.blockers],
  };
}

function buildInitialBrowserQa(generatedAt, assetBaseUrl, envValidation, urlResults, corsResults) {
  return {
    generatedAt,
    runId: "round-5k-browser-custom-domain-qa",
    appUrl: "http://127.0.0.1:3005",
    publicBaseUrl: redactPublicValue(assetBaseUrl),
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
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      contactEmailAppearsCorrectly: false,
    },
    pages: [],
    conversionResult: {
      attempted: false,
      passed: false,
      details: "Browser QA has not run yet. Run pipeline/scripts/round-5k-browser-custom-domain-qa-runner.cjs after URL and CORS checks pass.",
    },
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: [
      ...(envValidation.summary.production_env_ready ? [] : envValidation.blockers),
      ...(urlResults.summary.customDomainUrlVerificationPassed ? [] : ["Custom-domain URL verification is not ready."]),
      ...(corsResults.summary.svg_cors_passed ? [] : ["SVG Origin-aware CORS verification is not ready."]),
      "Browser QA has not run yet.",
    ].filter(uniqueFilter),
  };
}

function buildReadiness(generatedAt, envValidation, urlResults, corsResults, cacheResults, staticExport, browserQa) {
  const blockers = [
    ...envValidation.blockers,
    ...(urlResults.blockers || []),
    ...(corsResults.blockers || []),
    ...(cacheResults.blockers || []),
    ...(staticExport.blockers || []),
    ...(browserQa.blockers || []),
  ].filter(uniqueFilter);
  const customDomainVerified = Boolean(envValidation.summary.production_env_ready && urlResults.summary.customDomainUrlVerificationPassed && corsResults.summary.svg_cors_passed);
  const browserCanvasExportPassed = Boolean(browserQa.summary.browserCanvasExportPassed);

  return {
    generatedAt,
    runId: "round-5k-download-production-readiness",
    custom_domain_verified: customDomainVerified,
    svg_urls_passed: Boolean(urlResults.summary.svg_urls_passed),
    webp_urls_passed: Boolean(urlResults.summary.webp_urls_passed),
    svg_cors_passed: Boolean(corsResults.summary.svg_cors_passed),
    browser_canvas_export_passed: browserCanvasExportPassed,
    print_ready: Boolean(browserQa.summary.printWorks && browserCanvasExportPassed),
    png_download_ready: Boolean(browserQa.summary.pngDownloadWorks && browserCanvasExportPassed),
    jpg_download_ready: Boolean(browserQa.summary.jpgDownloadWorks && browserCanvasExportPassed),
    webp_download_ready: Boolean(browserQa.summary.webpDownloadWorks && browserCanvasExportPassed),
    svg_user_download_absent: Boolean(browserQa.summary.svgDownloadAbsent),
    cache_headers_acceptable: Boolean(cacheResults.summary.cache_headers_acceptable),
    ready_for_full_upload: Boolean(
      customDomainVerified &&
        urlResults.summary.svg_urls_passed &&
        urlResults.summary.webp_urls_passed &&
        corsResults.summary.svg_cors_passed &&
        browserCanvasExportPassed &&
        cacheResults.summary.cache_headers_acceptable &&
        staticExport.summary.staticExportWorks &&
        blockers.length === 0,
    ),
    ready_for_image_sitemap: false,
    ready_for_og_images: false,
    live_ads_in_scope: false,
    blockers,
    decision: blockers.length === 0
      ? "Round 5K custom asset-domain checks passed for the 30-record SVG plus WebP test bundle. Full upload still requires explicit approval."
      : "Round 5K production download readiness is blocked or partial until the listed checks pass.",
  };
}

function buildGuidance(generatedAt, publicEnv, readiness, urlResults, corsResults, cacheResults) {
  return {
    generatedAt,
    runId: "round-5k-final-upload-guidance",
    summary: {
      finalSvgWebpModelConfirmed: Boolean(readiness.custom_domain_verified && readiness.svg_urls_passed && readiness.webp_urls_passed),
      pngThumbsCanRemainExcluded: Boolean(readiness.webp_urls_passed),
      svgInternalOnly: true,
      fullUploadStillFinalStage: true,
      explicitApprovalRequiredBeforeFullUpload: true,
      imageSitemapDeferred: true,
      openGraphImagesDeferred: true,
      liveAdSenseDeferred: true,
      pngNotUsedAsWebpSubstitute: Boolean(urlResults.summary.noPngSubstituteUsedForWebp),
    },
    objectKeyPattern: "coloring-pages/{svg|webp}/{category}/{deterministic-file-name-with-hash}.{svg|webp}",
    customAssetDomainPattern: `${publicEnv.assetBaseUrl || EXPECTED_ASSET_BASE_URL}/{svg|webp}/{category}/{filename}`,
    requiredContentTypes: {
      svg: "image/svg+xml",
      webp: "image/webp",
    },
    requiredCors: {
      origins: [...LOCAL_ORIGINS, publicEnv.siteUrl || EXPECTED_SITE_URL],
      optionalOrigins: [OPTIONAL_APEX_ORIGIN],
      methods: ["GET", "HEAD", "OPTIONS"],
      credentialsRequired: false,
      note: "SVG must allow anonymous cross-origin browser image loading so canvas export remains untainted.",
    },
    cacheHeaderRecommendation: {
      cacheControl: "public, max-age=31536000, immutable for hash-versioned SVG and WebP object keys",
      etagOrLastModifiedRecommended: true,
      purgeNeededAfterHeaderChange: cacheResults.summary.cache_readiness === "ready" ? false : true,
    },
    fullUploadChecklist: [
      "Confirm Round 5K URL, CORS, cache, static export, and browser QA pass on the custom domain.",
      "Upload only svg/ and webp/ folders under coloring-pages/ after explicit approval.",
      "Do not include png/ or thumbs/ in the new upload plan unless a later blocker reverses the SVG plus WebP model.",
      "Do not expose SVG as a user-facing download.",
      "Do not add image sitemap, Open Graph image generation, JSON-LD expansion, live ads, backend routes, or app/api.",
      "After full upload, rerun URL, CORS, static export, and browser QA checks against the same custom asset base.",
    ],
    verificationCommandsAfterFullUpload: [
      "node pipeline/scripts/round-5k-verify-custom-domain-assets.mjs --public-base-url https://assets.ilovecoloringpage.com/coloring-pages --site-url https://www.ilovecoloringpage.com --contact-email admin@ilovecoloringpage.com",
      "node pipeline/scripts/round-5k-browser-custom-domain-qa-runner.cjs --serve-out --app-url http://127.0.0.1:3005 --asset-base-url https://assets.ilovecoloringpage.com/coloring-pages",
      "node --test pipeline/tests/round-5k-custom-asset-domain.test.mjs",
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

function getPlanUrls(plan) {
  const urls = plan.allUrls || plan.records?.flatMap((record) => record.urls || []) || [];
  return urls.filter((entry) => entry.mediaType === "svg" || entry.mediaType === "webp");
}

function buildPublicAssetUrl(assetBaseUrl, entry) {
  const relativeKey = entry.r2ObjectKey.replace(/^coloring-pages\//, "");
  return `${assetBaseUrl.replace(/\/+$/, "")}/${relativeKey.split("/").map(encodeURIComponent).join("/")}`;
}

function contentTypeAcceptable(actual, expected) {
  const normalizedActual = String(actual || "").toLowerCase().split(";")[0].trim();
  const normalizedExpected = String(expected || "").toLowerCase();
  if (normalizedExpected === "image/svg+xml") {
    return ["image/svg+xml", "application/svg+xml", "text/xml", "application/xml"].includes(normalizedActual);
  }
  return normalizedActual === normalizedExpected;
}

function isTextualResponse(mediaType, contentType) {
  if (mediaType === "svg") return true;
  return /(?:text|xml|json|html|javascript|css|svg)/i.test(String(contentType || ""));
}

function corsAllowsOrigin(allowedOrigin, testedOrigin) {
  return allowedOrigin === "*" || allowedOrigin === testedOrigin;
}

function cacheHasLongLivedMaxAge(cacheControl) {
  const match = /max-age=(\d+)/i.exec(cacheControl || "");
  return Boolean(match && Number(match[1]) >= 31_536_000);
}

function inspectUrl(value, requireColoringPagesPrefix) {
  const result = {
    valid: false,
    url: null,
    https: false,
    localhost: false,
    placeholder: false,
    hasColoringPagesPrefix: !requireColoringPagesPrefix,
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
    result.placeholder = /example\.com|example\.org|your-|yourdomain|placeholder/i.test(host);
    result.hasColoringPagesPrefix = !requireColoringPagesPrefix || url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
    result.oldTestPrefix = url.pathname.includes("/coloring/test-v1");
    result.duplicateColoringPagesPrefix = url.pathname.includes("/coloring-pages/coloring-pages");
    result.r2Dev = host.endsWith(".r2.dev");
    result.privateR2Endpoint = host.includes("r2.cloudflarestorage.com") || host.includes("amazonaws.com");
    result.credentialsInUrl = Boolean(url.username || url.password || containsCredentialLikeValue(url.search));
  } catch {
    return result;
  }
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--public-base-url" || arg === "--asset-base-url") args.publicBaseUrl = argv[++index];
    else if (arg === "--site-url") args.siteUrl = argv[++index];
    else if (arg === "--contact-email") args.contactEmail = argv[++index];
    else if (arg === "--skip-static-build") args.skipStaticBuild = true;
  }
  return args;
}

function parseEnvFile(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function getPublicDownloadFormats(source) {
  const formats = [];
  if (/label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/.test(source)) formats.push("PNG");
  if (/label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/.test(source)) formats.push("JPG");
  if (/label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/.test(source)) formats.push("WebP");
  return formats;
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function redactPublicValue(value) {
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
    return containsCredentialLikeValue(value) ? "[redacted]" : String(value);
  }
}

function containsCredentialLikeValue(value) {
  return /(?:access|secret|token|key|signature|credential|password)=/i.test(String(value || ""));
}

function bytesToTextSnippet(bytes) {
  return Buffer.from(bytes.slice(0, 4096)).toString("utf8");
}

function tail(value, lines = 60) {
  return String(value || "").split(/\r?\n/).slice(-lines).join("\n");
}

async function execFileCapture(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: REPO_ROOT,
      maxBuffer: 1024 * 1024 * 30,
      timeout: options.timeout || 120_000,
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

async function runNpmScript(scriptName, options = {}) {
  if (process.platform === "win32") {
    return execFileCapture("cmd.exe", ["/d", "/s", "/c", "npm", "run", scriptName], options);
  }
  return execFileCapture("npm", ["run", scriptName], options);
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readTextFromFiles(files) {
  const chunks = [];
  let totalSize = 0;
  for (const file of files) {
    try {
      const info = await stat(file);
      if (info.size > 4_000_000) continue;
      if (totalSize + info.size > 30_000_000) continue;
      chunks.push(await readFile(file, "utf8"));
      totalSize += info.size;
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

async function scanStaticTextFiles(files, contactEmail) {
  const result = {
    canonicalUrls: [],
    localhostLeakagePresent: false,
    r2DevLeakagePresent: false,
    privateR2EndpointLeakagePresent: false,
    sourceFilePathLeakagePresent: false,
    oldTestPrefixPresent: false,
    duplicateColoringPagesPrefixPresent: false,
    downloadSvgLabelsOrLinksPresent: false,
    appApiRouteReferencesPresent: false,
    liveAdSenseCodePresent: false,
    contactEmailPresent: false,
    wrongContactEmailPresent: false,
  };

  for (const file of files) {
    try {
      const info = await stat(file);
      if (info.size > 4_000_000) continue;
      const text = await readFile(file, "utf8");
      result.localhostLeakagePresent ||= /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\b|\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(text);
      result.r2DevLeakagePresent ||= /\.r2\.dev/i.test(text);
      result.privateR2EndpointLeakagePresent ||= /r2\.cloudflarestorage\.com|amazonaws\.com/i.test(text);
      result.sourceFilePathLeakagePresent ||= /(?<![A-Za-z])[A-Za-z]:[\\/][A-Za-z0-9_.-]|(?<!:)\/(?:Users|home)\/[A-Za-z0-9_.-]+\/|(?:^|[\\/"'(:])ilovesvg[\\/]/i.test(text);
      result.oldTestPrefixPresent ||= /coloring\/test-v1/i.test(text);
      result.duplicateColoringPagesPrefixPresent ||= /coloring-pages\/coloring-pages/i.test(text);
      result.downloadSvgLabelsOrLinksPresent ||= /Download SVG|downloadSvg|svgDownload/i.test(text);
      result.appApiRouteReferencesPresent ||= /\/api\//i.test(text);
      result.liveAdSenseCodePresent ||= /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(text);
      result.contactEmailPresent ||= Boolean(contactEmail && text.includes(contactEmail));
      result.wrongContactEmailPresent ||= /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(contactEmail ? text.replaceAll(contactEmail, "") : text);
      result.canonicalUrls.push(...[...text.matchAll(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]));
    } catch {
      continue;
    }
  }

  return result;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const absoluteFile of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(absoluteFile)) continue;
      if (normalizePath(absoluteFile).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(absoluteFile, "utf8"));
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
  await writeFile(absolute, `${String(text).replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 20 });
  return stdout;
}

async function gitStatusFor(relativePath) {
  return git(["status", "--short", "--", relativePath]);
}

async function gitCommitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

function normalizePath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function countLines(value) {
  return String(value || "").split(/\r?\n/).filter(Boolean).length;
}

function uniqueFilter(value, index, array) {
  return array.indexOf(value) === index;
}

function renderProjectContextReport(payload) {
  return `# Round 5K Project Context Check

- Correct repository: ${payload.summary.correctRepository}
- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- HEAD: ${payload.summary.head}
- Round 5J commit exists: ${payload.summary.round5jCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- /coloring-pages route exists: ${payload.summary.coloringPagesRouteExists}
- /coloring-pages/[hubSlug] route exists: ${payload.summary.hubRouteExists}
- SVG/WebP test bundle counts: ${payload.summary.testBundleSvgCount} / ${payload.summary.testBundleWebpCount}
- Public contains generated production media: ${payload.summary.publicContainsGeneratedProductionMedia}
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

function renderEnvReport(payload) {
  return `# Round 5K Env Validation

- NEXT_PUBLIC_SITE_URL set: ${payload.summary.siteUrlSet}
- Site URL: ${payload.values.siteUrl || "missing"}
- Site URL matches expected: ${payload.summary.siteUrlMatchesExpected}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL set: ${payload.summary.assetBaseSet}
- Asset base URL: ${payload.values.assetBaseUrl || "missing"}
- Asset base matches expected: ${payload.summary.assetBaseMatchesExpected}
- Asset base includes /coloring-pages: ${payload.summary.assetBaseHasColoringPagesPrefix}
- Asset base not r2.dev: ${payload.summary.assetBaseNotR2Dev}
- Asset base not private R2 endpoint: ${payload.summary.assetBaseNotPrivateR2Endpoint}
- NEXT_PUBLIC_CONTACT_EMAIL set: ${payload.summary.contactEmailSet}
- Contact email: ${payload.values.contactEmail || "missing"}
- Contact email matches expected: ${payload.summary.contactEmailMatchesExpected}
- No public env credentials: ${payload.summary.noPublicEnvCredentials}
- Production env ready: ${payload.summary.production_env_ready}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No env blockers found.\n"}
`;
}

function renderUrlReport(payload) {
  return `# Round 5K Custom Domain URL Results

- Status: ${payload.summary.status}
- Planned URLs: ${payload.summary.plannedUrlCount}
- Checked URLs: ${payload.summary.checkedUrlCount}
- HTTP 200 count: ${payload.summary.http200Count}
- SVG content type pass count: ${payload.summary.svgContentTypePassCount}
- WebP content type pass count: ${payload.summary.webpContentTypePassCount}
- SVG URLs passed: ${payload.summary.svg_urls_passed}
- WebP URLs passed: ${payload.summary.webp_urls_passed}
- No PNG substitute used for WebP: ${payload.summary.noPngSubstituteUsedForWebp}
- Custom-domain URL verification passed: ${payload.summary.customDomainUrlVerificationPassed}
- Cache headers observed: ${(payload.summary.cacheHeadersObserved || []).join(" | ") || "none"}
- CORS headers observed without Origin: ${(payload.summary.corsHeadersObserved || []).join(" | ") || "none"}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No URL blockers found.\n"}
`;
}

function renderCorsReport(payload) {
  return `# Round 5K Origin-Aware CORS Report

- Status: ${payload.summary.status}
- Required origins checked: ${payload.summary.requiredOriginsChecked.join(", ") || "none"}
- Optional origins checked: ${payload.summary.optionalOriginsChecked.join(", ") || "none"}
- SVG request count: ${payload.summary.checkedSvgRequestCount}
- SVG GET OK count: ${payload.summary.svgGetOkCount}
- SVG HEAD OK count: ${payload.summary.svgHeadOkCount}
- SVG CORS OK count: ${payload.summary.svgCorsOkCount}
- SVG credentials required: ${payload.summary.svgNoCredentialsRequired === null ? "not_run" : !payload.summary.svgNoCredentialsRequired}
- SVG CORS passed: ${payload.summary.svg_cors_passed}
- Optional apex SVG CORS passed: ${payload.summary.optionalApexSvgCorsPassed}
- WebP CORS headers documented: ${payload.summary.webpCorsHeadersDocumented}
- WebP content type passed: ${payload.summary.webpContentTypePassed}
- Browser crossOrigin anonymous ready: ${payload.summary.browserCrossOriginAnonymousReady}
- Stale cached response missing headers: ${payload.summary.staleCachedResponseMissingHeaders}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No CORS blockers found.\n"}
`;
}

function renderCacheReport(payload) {
  return `# Round 5K Cache And Content-Type Report

- Status: ${payload.summary.status}
- Checked URLs: ${payload.summary.checkedUrlCount}
- SVG content type OK: ${payload.summary.svgContentTypeOk}
- WebP content type OK: ${payload.summary.webpContentTypeOk}
- Cache headers present count: ${payload.summary.cacheHeadersPresentCount}
- Cache headers observed: ${(payload.summary.cacheHeadersObserved || []).join(" | ") || "none"}
- Validation header present count: ${payload.summary.validationHeaderPresentCount}
- Versioned asset keys: ${payload.summary.versionedAssetKeys}
- Long-lived caching safe for versioned filenames: ${payload.summary.longLivedCachingSafeForVersionedFilenames}
- Long-lived cache header count: ${payload.summary.longLivedCacheHeaderCount}
- Cache headers acceptable: ${payload.summary.cache_headers_acceptable}
- Cache readiness: ${payload.summary.cache_readiness}
- Content type behavior acceptable: ${payload.summary.content_type_behavior_acceptable}
- Cache purge or object key versioning: ${payload.summary.cachePurgeOrObjectKeyVersioningNeeded}

${payload.launchTasks?.length ? `## Launch Tasks\n\n${payload.launchTasks.map((task) => `- ${task}`).join("\n")}\n` : ""}
`;
}

function renderStaticExportReport(payload) {
  return `# Round 5K Production Static Export Report

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
- Contact email present: ${payload.summary.contactEmailPresent}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No static export blockers found.\n"}
`;
}

function renderBrowserQaReport(payload) {
  return `# Round 5K Browser Custom Domain QA Report

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
- Print uses generated output: ${payload.summary.printUsesGeneratedOutput}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Ad density matches Round 4U: ${payload.summary.adDensityMatchesRound4U}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}
- app/api present: ${payload.summary.appApiRoutePresent}
- Contact email appears correctly: ${payload.summary.contactEmailAppearsCorrectly}
- Screenshots: ${payload.screenshotPaths.length}

${payload.screenshotPaths.length ? `## Screenshots\n\n${payload.screenshotPaths.map((screenshot) => `- ${screenshot}`).join("\n")}\n` : ""}
${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderReadinessReport(payload) {
  return `# Round 5K Download Production Readiness

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

function renderGuidanceReport(payload) {
  return `# Round 5K Final Upload Guidance

- Final SVG plus WebP model confirmed: ${payload.summary.finalSvgWebpModelConfirmed}
- PNG/thumbs can remain excluded: ${payload.summary.pngThumbsCanRemainExcluded}
- SVG internal only: ${payload.summary.svgInternalOnly}
- Full upload still final stage: ${payload.summary.fullUploadStillFinalStage}
- Explicit approval required before full upload: ${payload.summary.explicitApprovalRequiredBeforeFullUpload}
- Image sitemap deferred: ${payload.summary.imageSitemapDeferred}
- Open Graph images deferred: ${payload.summary.openGraphImagesDeferred}
- Live AdSense deferred: ${payload.summary.liveAdSenseDeferred}
- PNG not used as WebP substitute: ${payload.summary.pngNotUsedAsWebpSubstitute}

## Object Key Pattern

${payload.objectKeyPattern}

## Custom Asset Domain Pattern

${payload.customAssetDomainPattern}

## Required Content Types

- SVG: ${payload.requiredContentTypes.svg}
- WebP: ${payload.requiredContentTypes.webp}

## Required CORS

- Origins: ${payload.requiredCors.origins.join(", ")}
- Optional origins: ${payload.requiredCors.optionalOrigins.join(", ")}
- Methods: ${payload.requiredCors.methods.join(", ")}
- Credentials required: ${payload.requiredCors.credentialsRequired}
- Note: ${payload.requiredCors.note}

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
