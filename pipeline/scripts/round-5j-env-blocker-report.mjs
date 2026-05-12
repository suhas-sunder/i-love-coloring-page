#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const RUN_ID = "round-5j-env-blocker-report";

const EXPECTED_ENV = {
  NEXT_PUBLIC_SITE_URL: "https://www.ilovecoloringpage.com",
  NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "https://assets.ilovecoloringpage.com/coloring-pages",
  NEXT_PUBLIC_CONTACT_EMAIL: "admin@ilovecoloringpage.com",
};

const CLEANED_GENERATED_DRIFT = [
  "pipeline/manifests/round-4j-real-media-preview-audit.json",
  "pipeline/manifests/round-4k-browser-regression-results.json",
  "pipeline/manifests/round-4k-color-token-rules.json",
  "pipeline/manifests/round-4k-download-action-audit.json",
  "pipeline/manifests/round-4k-display-title-cleanup.json",
  "pipeline/manifests/round-4k-gallery-card-fixes.json",
  "pipeline/manifests/round-4k-gallery-ui-cleanup-results.json",
  "pipeline/manifests/round-4k-post-build-scan.json",
  "pipeline/manifests/round-4k-project-context-check.json",
  "pipeline/manifests/round-4k-preview-url-strategy.json",
  "pipeline/manifests/round-4k-sample-asset-browser-audit.json",
  "pipeline/manifests/round-4k-static-export-results.json",
  "pipeline/manifests/round-4k-typography-audit.json",
  "pipeline/manifests/round-4k-ui-problem-audit.json",
  "pipeline/manifests/round-4l-broken-preview-root-cause.json",
  "pipeline/manifests/round-4l-browser-visual-qa.json",
  "pipeline/manifests/round-4l-preview-rendering-fix-results.json",
  "pipeline/manifests/round-4l-preview-url-audit.json",
  "pipeline/manifests/round-4l-preview-url-fixtures.json",
  "pipeline/manifests/round-4l-project-context-check.json",
  "pipeline/manifests/round-4m-ad-placeholder-implementation.json",
  "pipeline/manifests/round-4m-ad-placeholder-results.json",
  "pipeline/manifests/round-4m-ad-slot-map.json",
  "pipeline/manifests/round-4m-adsense-placement-rules.json",
  "pipeline/manifests/round-4m-browser-qa-results.json",
  "pipeline/manifests/round-4m-navigation-update.json",
  "pipeline/manifests/round-4m-project-context-check.json",
  "pipeline/manifests/round-4m-route-nav-audit.json",
  "pipeline/manifests/round-4m-static-export-results.json",
  "pipeline/manifests/round-4m-visual-polish-results.json",
  "pipeline/manifests/round-4n-ad-affiliate-guard-results.json",
  "pipeline/manifests/round-4n-browser-download-format-plan.json",
  "pipeline/manifests/round-4n-browser-qa-results.json",
  "pipeline/manifests/round-4n-download-readiness-decision.json",
  "pipeline/manifests/round-4n-download-ux-results.json",
  "pipeline/manifests/round-4n-mobile-nav-implementation.json",
  "pipeline/manifests/round-4n-nav-download-audit.json",
  "pipeline/manifests/round-4n-nav-route-map.json",
  "pipeline/manifests/round-4n-nav-route-audit.json",
  "pipeline/manifests/round-4n-navigation-results.json",
  "pipeline/manifests/round-4n-project-context-check.json",
  "pipeline/manifests/round-4n-static-export-results.json",
  "pipeline/manifests/round-4o-browser-conversion-test-results.json",
  "pipeline/manifests/round-4o-browser-download-format-rules.json",
  "pipeline/manifests/round-4o-browser-preview-test-results.json",
  "pipeline/manifests/round-4o-download-format-decision.json",
  "pipeline/manifests/round-4o-download-implementation-audit.json",
  "pipeline/manifests/round-4o-download-ui-results.json",
  "pipeline/manifests/round-4o-project-context-check.json",
  "pipeline/reports/round-4j-real-media-preview-audit.md",
  "pipeline/reports/round-4l-broken-preview-root-cause.md",
  "pipeline/reports/round-4l-preview-url-audit.md",
  "pipeline/reports/round-4o-browser-conversion-test-results.md",
  "pipeline/reports/round-4o-download-implementation-audit.md",
  "src/generated/coloring/search-index.json",
  "src/generated/coloring/title-overrides.json",
];

const OUTPUTS = {
  contextManifest: "pipeline/manifests/round-5j-project-context-check.json",
  contextReport: "pipeline/reports/round-5j-project-context-check.md",
  driftManifest: "pipeline/manifests/round-5j-drift-cleanup-results.json",
  driftReport: "pipeline/reports/round-5j-drift-cleanup-report.md",
  envManifest: "pipeline/manifests/round-5j-production-env-validation.json",
  envReport: "pipeline/reports/round-5j-production-env-validation.md",
  readinessManifest: "pipeline/manifests/round-5j-readiness-decision.json",
  readinessReport: "pipeline/reports/round-5j-readiness-decision.md",
  blockerManifest: "pipeline/manifests/round-5j-blocker-report.json",
  blockerReport: "pipeline/reports/round-5j-blocker-report.md",
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const generatedAt = new Date().toISOString();
  const context = await buildProjectContext(generatedAt);
  const drift = await buildDriftCleanup(generatedAt);
  const env = await buildEnvValidation(generatedAt);
  const readiness = buildReadinessDecision(generatedAt, context, drift, env);
  const blocker = buildBlockerReport(generatedAt, context, drift, env, readiness);

  await writeJson(OUTPUTS.contextManifest, context);
  await writeText(OUTPUTS.contextReport, renderContextReport(context));
  await writeJson(OUTPUTS.driftManifest, drift);
  await writeText(OUTPUTS.driftReport, renderDriftReport(drift));
  await writeJson(OUTPUTS.envManifest, env);
  await writeText(OUTPUTS.envReport, renderEnvReport(env));
  await writeJson(OUTPUTS.readinessManifest, readiness);
  await writeText(OUTPUTS.readinessReport, renderReadinessReport(readiness));
  await writeJson(OUTPUTS.blockerManifest, blocker);
  await writeText(OUTPUTS.blockerReport, renderBlockerReport(blocker));

  console.log(JSON.stringify({
    runId: RUN_ID,
    correctProject: context.summary.correctRepository && context.summary.branch === "version-4",
    generatedDriftCleaned: drift.summary.safeGeneratedValidationDriftCleaned,
    productionEnvReady: env.summary.production_env_ready,
    customDomainVerificationStatus: readiness.custom_domain_verification_status,
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
  const browserDownloads = await readTextIfExists("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readTextIfExists("src/components/coloring/DownloadMenu.tsx");
  const imageCard = await readTextIfExists("src/components/coloring/ImageCard.tsx");
  const testBundleFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages"));
  const downloadSource = `${browserDownloads}\n${downloadMenu}\n${imageCard}`;

  return {
    generatedAt,
    runId: "round-5j-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      head,
      round5iCommitExists: await gitCommitExists("981efbc"),
      appApiRoutePresent: appFiles.some((file) => normalizePath(file).includes("/api/")) || existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readTextIfExists("next.config.mjs")),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      testBundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages")),
      testBundleSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "svg")),
      testBundleWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "webp")),
      testBundleSvgCount: testBundleFiles.filter((file) => file.endsWith(".svg")).length,
      testBundleWebpCount: testBundleFiles.filter((file) => file.endsWith(".webp")).length,
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      pipelineProductionFullStatusClean: (await gitStatusFor("pipeline/production/full")).trim() === "",
      trackedR2UploadMediaCount: countLines(await git(["ls-files", "pipeline/r2-upload"])),
      trackedTestBundleMediaCount: countLines(await git(["ls-files", "pipeline/r2-upload-test-svg-webp"])),
      currentPublicDownloadFormats: getPublicDownloadFormats(downloadSource),
      pngJpgWebpControlsPresent: /label:\s*"PNG"/.test(downloadMenu) && /label:\s*"JPG"/.test(downloadMenu) && /label:\s*"WebP"/.test(downloadMenu),
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(downloadSource),
      printUsesInternalSvg: /printFromHighQualitySource/.test(imageCard) && /convertInternalSvgToBlob/.test(browserDownloads),
      adWellsVisibleByDefault: /Advertisement/.test(sourceText) && !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(sourceText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      imageSitemapGenerated: /image-sitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      jsonLdExpansionPresent: /application\/ld\+json/i.test(sourceText),
      fullUploadCommandRunByCodex: false,
    },
    wrongContext: {
      checked: true,
      actualWrongRoutesFound: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText),
      note: "Wrong-context guards are checked against app and src source, not historical pipeline notes.",
    },
  };
}

async function buildDriftCleanup(generatedAt) {
  const rawStatus = await gitStatus();
  const relevantStatus = rawStatus
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !isRound5jArtifactStatus(line));

  return {
    generatedAt,
    runId: "round-5j-drift-cleanup-results",
    summary: {
      initialDirtyStateObserved: true,
      safeGeneratedValidationDriftCleaned: relevantStatus.length === 0,
      remainingRelevantWorkingTreeStatus: relevantStatus,
      riskyUnrelatedDriftFound: false,
      riskyUnrelatedDriftPaths: [],
      mediaDriftFound: false,
      sourceImagesChanged: (await gitStatusFor("images")).trim() !== "",
      ilovesvgChanged: (await gitStatusFor("ilovesvg")).trim() !== "",
      screenshotsStagedOrTracked: (await git(["ls-files", "pipeline/review/round-5j"])).trim() !== "",
      generatedMediaStagedOrTracked: (await git(["ls-files", "pipeline/r2-upload", "pipeline/r2-upload-test-svg-webp"])).trim() !== "",
    },
    classification: {
      generatedValidationDrift: CLEANED_GENERATED_DRIFT,
      localArtifactDrift: [],
      riskyUnrelatedDrift: [],
    },
    actions: [
      "Restored safe Round 4 generated manifest/report churn.",
      "Restored generated coloring search index and title override churn.",
      "Restored report line-ending churn after confirming no substantive diff.",
    ],
    rawStatusAtReportGeneration: rawStatus.split(/\r?\n/).filter(Boolean),
  };
}

async function buildEnvValidation(generatedAt) {
  const envValues = await loadConfiguredPublicEnv();
  const site = inspectUrl(envValues.NEXT_PUBLIC_SITE_URL.value);
  const asset = inspectUrl(envValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.value);
  const contact = envValues.NEXT_PUBLIC_CONTACT_EMAIL;
  const blockers = [];

  if (!envValues.NEXT_PUBLIC_SITE_URL.configured) blockers.push("NEXT_PUBLIC_SITE_URL is not configured in process env, .env, or .env.local.");
  if (envValues.NEXT_PUBLIC_SITE_URL.value !== EXPECTED_ENV.NEXT_PUBLIC_SITE_URL) blockers.push("NEXT_PUBLIC_SITE_URL does not match https://www.ilovecoloringpage.com.");
  if (!site.valid) blockers.push("NEXT_PUBLIC_SITE_URL is not a valid URL.");
  if (!site.https) blockers.push("NEXT_PUBLIC_SITE_URL must be HTTPS.");
  if (site.localhost) blockers.push("NEXT_PUBLIC_SITE_URL must not be localhost or loopback.");
  if (site.placeholder) blockers.push("NEXT_PUBLIC_SITE_URL must not be a placeholder domain.");

  if (!envValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.configured) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not configured in process env, .env, or .env.local.");
  if (envValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.value !== EXPECTED_ENV.NEXT_PUBLIC_COLORING_ASSET_BASE_URL) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL does not match https://assets.ilovecoloringpage.com/coloring-pages.");
  if (!asset.valid) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL is not a valid URL.");
  if (!asset.https) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must be HTTPS.");
  if (!asset.hasColoringPagesPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must include /coloring-pages.");
  if (asset.localhost) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be localhost or loopback.");
  if (asset.r2Dev) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not use r2.dev for production readiness.");
  if (asset.privateR2Endpoint) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not point to a private R2 or S3 endpoint.");
  if (asset.oldTestPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not contain /coloring/test-v1.");
  if (asset.duplicateColoringPagesPrefix) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not contain duplicate /coloring-pages/coloring-pages.");
  if (asset.placeholder) blockers.push("NEXT_PUBLIC_COLORING_ASSET_BASE_URL must not be a placeholder domain.");

  if (!contact.configured) blockers.push("NEXT_PUBLIC_CONTACT_EMAIL is not configured in process env, .env, or .env.local.");
  if (contact.value !== EXPECTED_ENV.NEXT_PUBLIC_CONTACT_EMAIL) blockers.push("NEXT_PUBLIC_CONTACT_EMAIL does not match admin@ilovecoloringpage.com.");

  const noCredentials = !site.credentialsInUrl && !asset.credentialsInUrl && !containsCredentialLikeValue(contact.value);
  if (!noCredentials) blockers.push("One or more public env values appear to contain credentials or token-like values.");

  return {
    generatedAt,
    runId: "round-5j-production-env-validation",
    expectedEnv: EXPECTED_ENV,
    rawValueCaptured: false,
    values: {
      NEXT_PUBLIC_SITE_URL: summarizeEnvValue("NEXT_PUBLIC_SITE_URL", envValues.NEXT_PUBLIC_SITE_URL),
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: summarizeEnvValue("NEXT_PUBLIC_COLORING_ASSET_BASE_URL", envValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL),
      NEXT_PUBLIC_CONTACT_EMAIL: summarizeEnvValue("NEXT_PUBLIC_CONTACT_EMAIL", envValues.NEXT_PUBLIC_CONTACT_EMAIL),
    },
    summary: {
      siteUrlConfigured: envValues.NEXT_PUBLIC_SITE_URL.configured,
      siteUrlMatchesExpected: envValues.NEXT_PUBLIC_SITE_URL.value === EXPECTED_ENV.NEXT_PUBLIC_SITE_URL,
      siteUrlHttps: site.https,
      siteUrlNotLocalhost: !site.localhost,
      siteUrlNotPlaceholder: !site.placeholder,
      siteOrigin: site.url?.origin || "",
      assetBaseConfigured: envValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.configured,
      assetBaseMatchesExpected: envValues.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.value === EXPECTED_ENV.NEXT_PUBLIC_COLORING_ASSET_BASE_URL,
      assetBaseHttps: asset.https,
      assetBaseHasColoringPagesPrefix: asset.hasColoringPagesPrefix,
      assetBaseNotLocalhost: !asset.localhost,
      assetBaseNotR2Dev: !asset.r2Dev,
      assetBaseNotPrivateR2Endpoint: !asset.privateR2Endpoint,
      assetBaseHasNoOldTestPrefix: !asset.oldTestPrefix,
      assetBaseHasNoDuplicateColoringPagesPrefix: !asset.duplicateColoringPagesPrefix,
      assetBaseCustomDomain: asset.valid && asset.https && !asset.localhost && !asset.r2Dev && !asset.privateR2Endpoint && !asset.placeholder,
      contactEmailConfigured: contact.configured,
      contactEmailMatchesExpected: contact.value === EXPECTED_ENV.NEXT_PUBLIC_CONTACT_EMAIL,
      noPublicEnvCredentials: noCredentials,
      r2DevIsProductionReady: false,
      production_env_ready: blockers.length === 0,
      production_asset_domain_ready: blockers.length === 0,
    },
    blockers,
    stopReason: blockers.length
      ? "Required Round 5J production-like env values are not configured, so custom-domain URL, CORS, browser, print, and download verification were not run."
      : "",
  };
}

function buildReadinessDecision(generatedAt, context, drift, env) {
  const blockers = [
    ...env.blockers,
    ...(context.summary.appApiRoutePresent ? ["app/api is present."] : []),
    ...(context.summary.publicContainsGeneratedProductionMedia ? ["Generated production media was found under public/."] : []),
    ...(context.summary.liveAdSenseCodePresent ? ["Live AdSense code is present."] : []),
    ...(context.wrongContext.actualWrongRoutesFound ? ["Wrong repo indicators were found in app/src."] : []),
    ...(drift.summary.safeGeneratedValidationDriftCleaned ? [] : ["Relevant working tree drift remains after cleanup."]),
  ];

  return {
    generatedAt,
    runId: "round-5j-readiness-decision",
    custom_domain_verification_status: env.summary.production_env_ready ? "ready_to_run" : "blocked_not_run",
    custom_asset_domain_tested: false,
    public_site_url_tested: false,
    svg_url_result: "not_run",
    webp_url_result: "not_run",
    svg_cors_result: "not_run",
    cache_header_result: "not_run",
    webp_gallery_rendering_result: "not_run",
    browser_canvas_export_result: "not_run",
    print_result: "not_run",
    png_download_result: "not_run",
    jpg_download_result: "not_run",
    webp_download_result: "not_run",
    svg_user_download_absent: !context.summary.svgUserDownloadExposed,
    no_app_api_route: !context.summary.appApiRoutePresent,
    no_public_media_copy: !context.summary.publicContainsGeneratedProductionMedia,
    no_full_upload_run: true,
    no_live_ads: !context.summary.liveAdSenseCodePresent,
    no_image_sitemap: !context.summary.imageSitemapGenerated,
    no_og_image_generation: !context.summary.openGraphImageGenerationPresent,
    source_images_changed: !context.summary.imagesStatusClean,
    ilovesvg_changed: !context.summary.ilovesvgStatusClean,
    filenames_renamed: false,
    ready_for_full_upload: false,
    ready_for_image_sitemap: false,
    ready_for_og_images: false,
    ready_for_live_ads: false,
    decision: env.summary.production_env_ready
      ? "Round 5J env values are ready for custom-domain verification, but this blocker report did not run network or browser checks."
      : "Round 5J is blocked until the required production-like env values are configured outside .env.example.",
    blockers: blockers.filter(uniqueFilter),
    recommendationForRound5K: "Configure NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_COLORING_ASSET_BASE_URL, and NEXT_PUBLIC_CONTACT_EMAIL to the exact Round 5J required values, then rerun custom-domain URL, CORS, cache, static export, and browser download QA without uploading the full library.",
  };
}

function buildBlockerReport(generatedAt, context, drift, env, readiness) {
  return {
    generatedAt,
    runId: RUN_ID,
    projectContext: context.summary,
    driftCleanup: drift.summary,
    envValidation: env.summary,
    verification: {
      customDomainTested: readiness.custom_asset_domain_tested,
      publicSiteUrlTested: readiness.public_site_url_tested,
      svgUrlResult: readiness.svg_url_result,
      webpUrlResult: readiness.webp_url_result,
      svgCorsResult: readiness.svg_cors_result,
      browserCanvasExportResult: readiness.browser_canvas_export_result,
      pngDownloadResult: readiness.png_download_result,
      jpgDownloadResult: readiness.jpg_download_result,
      webpDownloadResult: readiness.webp_download_result,
      printResult: readiness.print_result,
    },
    readiness,
    blockers: readiness.blockers,
  };
}

async function loadConfiguredPublicEnv() {
  const fileValues = {};
  const fileSources = {};

  for (const envPath of [".env", ".env.local"]) {
    const absolute = path.join(REPO_ROOT, envPath);
    if (!existsSync(absolute)) continue;
    const parsed = parseEnvFile(await readFile(absolute, "utf8"));
    for (const key of Object.keys(EXPECTED_ENV)) {
      if (Object.hasOwn(parsed, key)) {
        fileValues[key] = parsed[key];
        fileSources[key] = envPath;
      }
    }
  }

  const result = {};
  for (const key of Object.keys(EXPECTED_ENV)) {
    const processValue = process.env[key];
    const fileValue = fileValues[key];
    const value = processValue != null ? processValue.trim() : fileValue != null ? String(fileValue).trim() : "";
    result[key] = {
      configured: value.length > 0,
      source: processValue != null ? "process" : fileValue != null ? fileSources[key] : "missing",
      value: key.endsWith("_URL") ? value.replace(/\/+$/, "") : value,
    };
  }
  return result;
}

function inspectUrl(value) {
  const result = {
    valid: false,
    url: null,
    https: false,
    localhost: false,
    placeholder: false,
    hasColoringPagesPrefix: false,
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
    result.hasColoringPagesPrefix = url.pathname === "/coloring-pages" || url.pathname.endsWith("/coloring-pages");
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

function summarizeEnvValue(key, value) {
  return {
    configured: value.configured,
    source: value.source,
    redactedValue: redactPublicValue(value.value),
    matchesExpected: value.value === EXPECTED_ENV[key],
  };
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
    return containsCredentialLikeValue(value) ? "[redacted]" : value;
  }
}

function containsCredentialLikeValue(value) {
  return /(?:access|secret|token|key|signature|credential|password)=/i.test(String(value || ""));
}

function parseEnvFile(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function renderContextReport(payload) {
  return `# Round 5J Project Context Check

- Correct repository: ${payload.summary.correctRepository}
- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- HEAD at report creation: ${payload.summary.head}
- Round 5I commit exists: ${payload.summary.round5iCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- /coloring-pages route exists: ${payload.summary.coloringPagesRouteExists}
- /coloring-pages/[hubSlug] route exists: ${payload.summary.hubRouteExists}
- pipeline/r2-upload/coloring-pages exists: ${payload.summary.r2UploadColoringPagesExists}
- SVG/WebP test bundle counts: ${payload.summary.testBundleSvgCount} / ${payload.summary.testBundleWebpCount}
- Public contains generated production media: ${payload.summary.publicContainsGeneratedProductionMedia}
- Source images clean: ${payload.summary.imagesStatusClean}
- ilovesvg clean: ${payload.summary.ilovesvgStatusClean}
- Public download formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- PNG/JPG/WebP controls present: ${payload.summary.pngJpgWebpControlsPresent}
- SVG user download exposed: ${payload.summary.svgUserDownloadExposed}
- Ad wells visible by default: ${payload.summary.adWellsVisibleByDefault}
- Live AdSense code present: ${payload.summary.liveAdSenseCodePresent}
- Wrong repo indicators found: ${payload.wrongContext.actualWrongRoutesFound}

${payload.wrongContext.note}
`;
}

function renderDriftReport(payload) {
  return `# Round 5J Drift Cleanup Report

- Initial dirty state observed: ${payload.summary.initialDirtyStateObserved}
- Safe generated validation drift cleaned: ${payload.summary.safeGeneratedValidationDriftCleaned}
- Risky unrelated drift found: ${payload.summary.riskyUnrelatedDriftFound}
- Media drift found: ${payload.summary.mediaDriftFound}
- Source images changed: ${payload.summary.sourceImagesChanged}
- ilovesvg changed: ${payload.summary.ilovesvgChanged}
- Generated media staged or tracked: ${payload.summary.generatedMediaStagedOrTracked}
- Remaining relevant working tree status: ${payload.summary.remainingRelevantWorkingTreeStatus.length ? payload.summary.remainingRelevantWorkingTreeStatus.join("; ") : "clean"}

## Cleaned Generated Validation Drift

${payload.classification.generatedValidationDrift.map((file) => `- ${file}`).join("\n")}

## Actions

${payload.actions.map((action) => `- ${action}`).join("\n")}
`;
}

function renderEnvReport(payload) {
  return `# Round 5J Production Env Validation

- NEXT_PUBLIC_SITE_URL configured: ${payload.summary.siteUrlConfigured}
- NEXT_PUBLIC_SITE_URL value: ${payload.values.NEXT_PUBLIC_SITE_URL.redactedValue || "missing"}
- NEXT_PUBLIC_SITE_URL source: ${payload.values.NEXT_PUBLIC_SITE_URL.source}
- NEXT_PUBLIC_SITE_URL matches expected: ${payload.summary.siteUrlMatchesExpected}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL configured: ${payload.summary.assetBaseConfigured}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL value: ${payload.values.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.redactedValue || "missing"}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL source: ${payload.values.NEXT_PUBLIC_COLORING_ASSET_BASE_URL.source}
- NEXT_PUBLIC_COLORING_ASSET_BASE_URL matches expected: ${payload.summary.assetBaseMatchesExpected}
- NEXT_PUBLIC_CONTACT_EMAIL configured: ${payload.summary.contactEmailConfigured}
- NEXT_PUBLIC_CONTACT_EMAIL value: ${payload.values.NEXT_PUBLIC_CONTACT_EMAIL.redactedValue || "missing"}
- NEXT_PUBLIC_CONTACT_EMAIL source: ${payload.values.NEXT_PUBLIC_CONTACT_EMAIL.source}
- NEXT_PUBLIC_CONTACT_EMAIL matches expected: ${payload.summary.contactEmailMatchesExpected}
- Asset base is HTTPS: ${payload.summary.assetBaseHttps}
- Asset base includes /coloring-pages: ${payload.summary.assetBaseHasColoringPagesPrefix}
- Asset base not r2.dev: ${payload.summary.assetBaseNotR2Dev}
- Asset base not private R2 endpoint: ${payload.summary.assetBaseNotPrivateR2Endpoint}
- No public env credentials: ${payload.summary.noPublicEnvCredentials}
- Production env ready: ${payload.summary.production_env_ready}

## Blockers

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}
`;
}

function renderReadinessReport(payload) {
  return `# Round 5J Readiness Decision

- Custom domain verification status: ${payload.custom_domain_verification_status}
- Custom asset domain tested: ${payload.custom_asset_domain_tested}
- Public site URL tested: ${payload.public_site_url_tested}
- SVG URL result: ${payload.svg_url_result}
- WebP URL result: ${payload.webp_url_result}
- SVG CORS result: ${payload.svg_cors_result}
- Cache header result: ${payload.cache_header_result}
- WebP gallery rendering result: ${payload.webp_gallery_rendering_result}
- Browser canvas export result: ${payload.browser_canvas_export_result}
- Print result: ${payload.print_result}
- PNG download result: ${payload.png_download_result}
- JPG download result: ${payload.jpg_download_result}
- WebP download result: ${payload.webp_download_result}
- SVG user download absent: ${payload.svg_user_download_absent}
- No app/api route: ${payload.no_app_api_route}
- No public media copy: ${payload.no_public_media_copy}
- No full upload run: ${payload.no_full_upload_run}
- No live ads: ${payload.no_live_ads}
- Ready for full upload: ${payload.ready_for_full_upload}
- Ready for image sitemap: ${payload.ready_for_image_sitemap}
- Ready for OG images: ${payload.ready_for_og_images}

## Decision

${payload.decision}

## Blockers

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}

## Round 5K Recommendation

${payload.recommendationForRound5K}
`;
}

function renderBlockerReport(payload) {
  return `# Round 5J Blocker Report

Round 5J stopped before public custom-domain verification because the required production-like env values are not configured.

- Drift cleanup complete: ${payload.driftCleanup.safeGeneratedValidationDriftCleaned}
- Production env ready: ${payload.envValidation.production_env_ready}
- Custom asset domain tested: ${payload.verification.customDomainTested}
- SVG/WebP URL verification: ${payload.verification.svgUrlResult} / ${payload.verification.webpUrlResult}
- SVG CORS verification: ${payload.verification.svgCorsResult}
- Browser canvas export: ${payload.verification.browserCanvasExportResult}
- PNG/JPG/WebP downloads: ${payload.verification.pngDownloadResult} / ${payload.verification.jpgDownloadResult} / ${payload.verification.webpDownloadResult}
- Print: ${payload.verification.printResult}
- Full upload ready: ${payload.readiness.ready_for_full_upload}
- Image sitemap ready: ${payload.readiness.ready_for_image_sitemap}
- OG images ready: ${payload.readiness.ready_for_og_images}

## Blockers

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}

## Round 5K Recommendation

${payload.readiness.recommendationForRound5K}
`;
}

function isRound5jArtifactStatus(line) {
  const file = line.replace(/^.. ?/, "").replace(/\\/g, "/");
  return file === "package.json" || /^pipeline\/(?:scripts|tests|manifests|reports)\/round-5j-/.test(file);
}

function getPublicDownloadFormats(source) {
  const formats = [];
  if (/label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/.test(source)) formats.push("PNG");
  if (/label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/.test(source)) formats.push("JPG");
  if (/label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/.test(source)) formats.push("WebP");
  return formats;
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

async function readTextIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) return "";
  return readFile(absolute, "utf8");
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

async function gitStatus() {
  return git(["status", "--short"]);
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
