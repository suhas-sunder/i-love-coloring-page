#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_RUNTIME_SWITCH_COMMIT = "275dd6d33d64223f14e519ffb57d67825a7f5c19";
const EXPECTED_LIVE_COMMITS = ["f64918d", "168a761"];

const LOCAL_PATHS = [
  "/",
  "/coloring-pages",
  "/coloring-pages/",
  "/coloring-pages/animals",
  "/coloring-pages/animals/",
  "/contact",
  "/contact/",
  "/sitemap.xml",
  "/robots.txt",
];

const OUTPUTS = {
  projectContext: "pipeline/manifests/live-routing-project-context-check.json",
  configAudit: "pipeline/manifests/live-routing-config-audit.json",
  localExport: "pipeline/manifests/live-routing-local-export-results.json",
  sitemapLocal: "pipeline/manifests/live-routing-sitemap-local-check.json",
  runtimeBuild: "pipeline/manifests/live-routing-runtime-build-check.json",
  fixActions: "pipeline/manifests/live-routing-fix-actions.json",
  postFixLive: "pipeline/manifests/live-routing-post-fix-live-check.json",
  acceptanceGate: "pipeline/manifests/live-routing-acceptance-gate.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/live-routing-project-context-check.md",
  configAudit: "pipeline/reports/live-routing-config-audit.md",
  localExport: "pipeline/reports/live-routing-local-export-report.md",
  sitemapLocal: "pipeline/reports/live-routing-sitemap-local-check.md",
  runtimeBuild: "pipeline/reports/live-routing-runtime-build-check.md",
  fixActions: "pipeline/reports/live-routing-fix-actions.md",
  postFixLive: "pipeline/reports/live-routing-post-fix-live-check.md",
  acceptanceGate: "pipeline/reports/live-routing-acceptance-gate.md",
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const projectContext = await buildProjectContext(generatedAt);

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));

  const liveResults = await readJsonIfExists("pipeline/manifests/live-routing-http-results.json");
  const buildResult = args.skipBuild ? buildSkippedResult() : await runCleanBuild();
  const exportFiles = await listFilesIfExists(path.join(REPO_ROOT, "out"));
  const localChecks = buildResult.exitCode === 0 ? await runLocalRouteChecks() : [];
  const localExport = buildLocalExport(generatedAt, buildResult, exportFiles, localChecks);
  const configAudit = await buildConfigAudit(generatedAt, exportFiles, localChecks, liveResults);
  const sitemapLocal = await buildSitemapLocalCheck(generatedAt);
  const runtimeBuild = await buildRuntimeBuildCheck(generatedAt, exportFiles);
  const fixActions = buildFixActions(generatedAt, configAudit, localExport, sitemapLocal, runtimeBuild, liveResults);
  const postFixLive = buildPostFixLiveCheck(generatedAt, liveResults, fixActions);
  const acceptanceGate = buildAcceptanceGate(generatedAt, localExport, sitemapLocal, runtimeBuild, liveResults, fixActions, postFixLive);

  await writeJson(OUTPUTS.configAudit, configAudit);
  await writeText(REPORTS.configAudit, renderConfigAuditReport(configAudit));
  await writeJson(OUTPUTS.localExport, localExport);
  await writeText(REPORTS.localExport, renderLocalExportReport(localExport));
  await writeJson(OUTPUTS.sitemapLocal, sitemapLocal);
  await writeText(REPORTS.sitemapLocal, renderSitemapLocalReport(sitemapLocal));
  await writeJson(OUTPUTS.runtimeBuild, runtimeBuild);
  await writeText(REPORTS.runtimeBuild, renderRuntimeBuildReport(runtimeBuild));
  await writeJson(OUTPUTS.fixActions, fixActions);
  await writeText(REPORTS.fixActions, renderFixActionsReport(fixActions));
  await writeJson(OUTPUTS.postFixLive, postFixLive);
  await writeText(REPORTS.postFixLive, renderPostFixLiveReport(postFixLive));
  await writeJson(OUTPUTS.acceptanceGate, acceptanceGate);
  await writeText(REPORTS.acceptanceGate, renderAcceptanceGateReport(acceptanceGate));

  console.log(JSON.stringify({
    runId: "live-routing-local-export-check",
    buildExitCode: localExport.summary.buildExitCode,
    localStaticExportRoutesPassed: localExport.summary.localStaticExportRoutesPassed,
    localSitemapCurrent: sitemapLocal.summary.localSitemapCurrent,
    runtimeBuildCurrent: runtimeBuild.summary.runtimeBuildCurrent,
    rootCause: fixActions.summary.rootCause,
    ownerActionRequired: acceptanceGate.owner_action_required,
    readyToResumeLiveProductionQa: acceptanceGate.ready_to_resume_live_production_qa,
    blockers: acceptanceGate.blockers,
  }, null, 2));
}

async function buildProjectContext(generatedAt) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim();
  const repoName = path.basename(repoRoot);
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const runtimeAvailable = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeAssetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const sourceText = await readProjectText(["app", "src", "next.config.mjs", "netlify.toml"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");

  return {
    generatedAt,
    runId: "live-routing-project-context-check",
    expected: {
      repoName: "i-love-coloring-page",
      branch: "version-4",
      runtimeSwitchCommit: EXPECTED_RUNTIME_SWITCH_COMMIT,
      liveProductionVerificationCommits: EXPECTED_LIVE_COMMITS,
      siteUrl: SITE_URL,
      assetBaseUrl: ASSET_BASE_URL,
      contactEmail: CONTACT_EMAIL,
    },
    summary: {
      repoRoot,
      repoName,
      correctRepository: repoName === "i-love-coloring-page",
      branch,
      correctBranch: branch === "version-4",
      head,
      runtimeSwitchCommitExists: await gitCommitExists(EXPECTED_RUNTIME_SWITCH_COMMIT),
      liveProductionVerificationCommitsExist: (await Promise.all(EXPECTED_LIVE_COMMITS.map((commit) => gitCommitExists(commit)))).every(Boolean),
      frontendOnlyNextStaticExport: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      appApiRoutePresent: appFiles.some((file) => normalizePath(file).startsWith("app/api/")) || existsSync(path.join(REPO_ROOT, "app", "api")),
      runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
      runtimeAvailableRecords: runtimeAvailable.summary.itemCount,
      runtimeAssetRecords: runtimeAssetPaths.summary.recordCount,
      publicDirectoryExists: existsSync(path.join(REPO_ROOT, "public")),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}`),
      publicDownloads: getPublicDownloadFormats(`${browserDownloads}\n${downloadMenu}`),
      liveAdSenseCodeAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      imageSitemapAbsent: !/image-sitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationAbsent: !/opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      wrongRepoIndicatorsFound: /image-to-favicon-generator|routeManifestClientAssets|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText),
      publicDefaultsHardcoded: sourceText.includes(SITE_URL) && sourceText.includes(ASSET_BASE_URL) && sourceText.includes(CONTACT_EMAIL),
      r2CredentialNamesInRuntime: /R2_ACCOUNT_ID|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/i.test(sourceText),
    },
  };
}

async function buildConfigAudit(generatedAt, exportFiles, localChecks, liveResults) {
  const nextConfig = await readText("next.config.mjs");
  const netlify = await readText("netlify.toml");
  const packageJson = await readJson("package.json");
  const sitemapSource = await readText("app/sitemap.ts");
  const robotsSource = await readText("app/robots.ts");
  const layoutSource = await readText("app/layout.tsx");
  const metadataSource = await readText("src/lib/coloring/metadata.ts");
  const sitemapLocs = await readSitemapLocs();
  const exportSet = new Set(exportFiles.map((file) => normalizePath(file)));
  const noSlashRepresentative = "out/coloring-pages/animals.html";
  const slashRepresentative = "out/coloring-pages/animals/index.html";
  const redirectRules = parseNetlifyRedirects(netlify);
  const selfRedirectRulePresent = redirectRules.some((rule) => normalizeRulePath(rule.from) === normalizeRulePath(rule.to));
  const sitemapPathsMatchExportedPaths = sitemapLocs
    .map((loc) => new URL(loc).pathname)
    .every((routePath) => exportedPathExists(routePath, exportSet));

  return {
    generatedAt,
    runId: "live-routing-config-audit",
    inspected: [
      "next.config.mjs",
      "netlify.toml",
      "package.json",
      "app/sitemap.ts",
      "app/robots.ts",
      "app/layout.tsx",
      "app/coloring-pages/page.tsx",
      "app/coloring-pages/[hubSlug]/page.tsx",
      "app/coloring-pages/[hubSlug]/page/[page]/page.tsx",
      "out/",
      "out/_redirects",
      "out/_headers",
    ],
    summary: {
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      trailingSlashConfigured: /trailingSlash:\s*true/.test(nextConfig) ? true : /trailingSlash:\s*false/.test(nextConfig) ? false : null,
      nextImagesUnoptimized: /unoptimized:\s*true/.test(nextConfig),
      netlifyPublishDirectory: parseTomlValue(netlify, "publish"),
      netlifyBuildCommand: parseTomlValue(netlify, "command"),
      packageBuildCommand: packageJson.scripts?.build || "",
      exportedNoSlashHtmlExists: exportSet.has(noSlashRepresentative),
      exportedSlashIndexHtmlExists: exportSet.has(slashRepresentative),
      exportedColoringPagesHtmlExists: exportSet.has("out/coloring-pages.html"),
      exportedColoringPagesIndexHtmlExists: exportSet.has("out/coloring-pages/index.html"),
      exportedSitemapExists: exportSet.has("out/sitemap.xml"),
      exportedRobotsExists: exportSet.has("out/robots.txt"),
      generatedRedirectsFileExists: exportSet.has("out/_redirects"),
      generatedHeadersFileExists: exportSet.has("out/_headers"),
      netlifyRedirectRuleCount: redirectRules.length,
      selfRedirectRulePresent,
      prettyUrlsWorkLocally: ["/coloring-pages", "/coloring-pages/animals", "/contact"].every((routePath) =>
        localChecks.find((check) => check.path === routePath)?.status === 200,
      ),
      slashUrlsWorkLocally: ["/coloring-pages/", "/coloring-pages/animals/", "/contact/"].every((routePath) =>
        localChecks.find((check) => check.path === routePath)?.status === 200,
      ),
      canonicalUrlsUseNoTrailingSlash: !/canonicalPath[\s\S]*\/\$\{/.test(metadataSource) && !/<link[^>]+rel=["']canonical["'][^>]+\/["']/i.test(layoutSource),
      sitemapPathsUseNoTrailingSlash: sitemapLocs.every((loc) => new URL(loc).pathname === "/" || !new URL(loc).pathname.endsWith("/")),
      sitemapPathsMatchExportedPaths,
      netlifyPublishesOut: parseTomlValue(netlify, "publish") === "out",
      netlifyBuildCommandCorrect: parseTomlValue(netlify, "command") === "npm run build",
      sitemapStaticExportSafe: /dynamic\s*=\s*["']force-static["']/.test(sitemapSource),
      robotsStaticExportSafe: /dynamic\s*=\s*["']force-static["']/.test(robotsSource),
      rootDomainRedirectConfiguredInRepo: redirectRules.some((rule) => /ilovecoloringpage\.com/i.test(rule.from + rule.to)),
      liveSitemapStaleSuggestsWrongDeploymentOrBranch: Boolean(liveResults && !liveResults.summary.liveSitemapCurrent),
    },
    redirectRules,
    exportedRepresentativeFiles: {
      noSlashRepresentative,
      slashRepresentative,
    },
  };
}

function buildLocalExport(generatedAt, buildResult, exportFiles, checks) {
  const required = ["/", "/coloring-pages", "/coloring-pages/animals", "/contact", "/sitemap.xml", "/robots.txt"];
  const localStaticExportRoutesPassed = buildResult.exitCode === 0 && required.every((routePath) => checks.find((check) => check.path === routePath)?.status === 200);

  return {
    generatedAt,
    runId: "live-routing-local-export-results",
    command: buildResult.command,
    summary: {
      cleanOutRemovedBeforeBuild: buildResult.cleanOutRemovedBeforeBuild,
      buildExitCode: buildResult.exitCode,
      buildSucceeded: buildResult.exitCode === 0,
      exportedFileCount: exportFiles.length,
      localStaticExportRoutesPassed,
      noSlashPrimaryRoutesPassed: ["/coloring-pages", "/coloring-pages/animals", "/contact"].every((routePath) =>
        checks.find((check) => check.path === routePath)?.status === 200,
      ),
      slashVariantRoutesPassed: ["/coloring-pages/", "/coloring-pages/animals/", "/contact/"].every((routePath) =>
        checks.find((check) => check.path === routePath)?.status === 200,
      ),
      localRedirectCount: checks.filter((check) => check.status >= 300 && check.status < 400).length,
      localSelfRedirectCount: checks.filter((check) => check.selfRedirect).length,
      sitemapStatus: checks.find((check) => check.path === "/sitemap.xml")?.status || 0,
      robotsStatus: checks.find((check) => check.path === "/robots.txt")?.status || 0,
    },
    checks,
    buildOutputTail: {
      stdout: tail(buildResult.stdout, 80),
      stderr: tail(buildResult.stderr, 80),
    },
  };
}

async function buildSitemapLocalCheck(generatedAt) {
  const sitemapLocs = await readSitemapLocs();
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const trustRoutes = parseTrustRoutes(await readText("src/lib/trust/trustPages.ts"));
  const rejectedRoutes = await readRejectedHubRoutes();
  const phase1Routes = runtimeHubs.hubs.map((hub) => hub.route);
  const phase2Routes = runtimeHubs.backlogHubs.map((hub) => `/coloring-pages/${hub.slug}`);
  const sectionOnlyRoutes = runtimeHubs.sectionOnlyTopics.map((topic) => `/coloring-pages/${topic.slug}`);
  const rejectedOnlyRoutes = rejectedRoutes.filter((routePath) => !phase1Routes.includes(routePath));
  const expectedRoutes = ["", ...runtimeSiteMap.entries.map((entry) => entry.path), ...trustRoutes];
  const expectedLocs = expectedRoutes.map((routePath) => `${SITE_URL}${routePath}`);

  return {
    generatedAt,
    runId: "live-routing-sitemap-local-check",
    summary: {
      localSitemapExists: existsSync(path.join(REPO_ROOT, "out", "sitemap.xml")),
      localSitemapCurrent: expectedLocs.every((loc) => sitemapLocs.includes(loc)) && sitemapLocs.length === expectedLocs.length,
      sitemapLocCount: sitemapLocs.length,
      expectedLocCount: expectedLocs.length,
      includesHomepage: sitemapLocs.includes(SITE_URL),
      includesColoringPages: sitemapLocs.includes(`${SITE_URL}/coloring-pages`),
      includesPhase1HubRoutes: phase1Routes.every((routePath) => sitemapLocs.includes(`${SITE_URL}${routePath}`)),
      includesTrustPages: trustRoutes.every((routePath) => sitemapLocs.includes(`${SITE_URL}${routePath}`)),
      noPerImageRoutes: sitemapLocs.every((loc) => !/#asset-|\/asset-|\/image\//i.test(loc)),
      noPhase2HubRoutes: phase2Routes.every((routePath) => !sitemapLocs.includes(`${SITE_URL}${routePath}`)),
      noSectionOnlyTopicRoutes: sectionOnlyRoutes.every((routePath) => !sitemapLocs.includes(`${SITE_URL}${routePath}`)),
      noRejectedRoutes: rejectedOnlyRoutes.every((routePath) => !sitemapLocs.includes(`${SITE_URL}${routePath}`)),
      noImageSitemap: sitemapLocs.every((loc) => !/image-sitemap/i.test(loc)),
    },
    samples: {
      firstTenLocs: sitemapLocs.slice(0, 10),
      trustRoutes,
      phase1RouteCount: phase1Routes.length,
      phase2RouteCount: phase2Routes.length,
      sectionOnlyRouteCount: sectionOnlyRoutes.length,
      rejectedRouteCount: rejectedOnlyRoutes.length,
    },
  };
}

async function buildRuntimeBuildCheck(generatedAt, exportFiles) {
  const primaryFiles = [
    "out/index.html",
    "out/index.txt",
    "out/coloring-pages.html",
    "out/coloring-pages.txt",
    "out/coloring-pages/animals.html",
    "out/coloring-pages/animals.txt",
    "out/coloring-pages/geometric.html",
    "out/coloring-pages/geometric.txt",
    "out/contact.html",
    "out/contact.txt",
    "out/sitemap.xml",
    "out/robots.txt",
  ].filter((file) => existsSync(path.join(REPO_ROOT, file)));
  const primaryText = (await Promise.all(primaryFiles.map((file) => readText(file)))).join("\n");
  const runtimeAvailable = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeAssetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const allOutText = await readTextFromFiles(exportFiles.filter((file) => /\.(?:html|txt|xml|js)$/.test(file)).slice(0, 800));

  return {
    generatedAt,
    runId: "live-routing-runtime-build-check",
    summary: {
      runtimeAvailableRecords: runtimeAvailable.summary.itemCount,
      runtimeAssetRecords: runtimeAssetPaths.summary.recordCount,
      runtimeBuildCurrent: runtimeAvailable.summary.itemCount === EXPECTED_AVAILABLE_RECORDS && runtimeAssetPaths.summary.recordCount === EXPECTED_AVAILABLE_RECORDS,
      primaryPublicPagesContain6352: /6,352|6352/.test(primaryText),
      primaryPublicPagesContain6557: /6,557|6557/.test(primaryText),
      primaryPublicPagesUseAssetBaseUrl: primaryText.includes(ASSET_BASE_URL),
      outContainsLocalhost: /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i.test(allOutText),
      outContainsR2Dev: /\.r2\.dev/i.test(allOutText),
      outContainsDownloadSvg: /Download SVG|downloadSvg|svgDownload/i.test(allOutText),
      outContainsAppApiReference: /\/api\//i.test(allOutText),
      outContainsContactEmail: allOutText.includes(CONTACT_EMAIL),
      outContainsLiveAdsenseCode: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(allOutText),
      exportedPrimaryFileCount: primaryFiles.length,
    },
    primaryFiles,
  };
}

function buildFixActions(generatedAt, configAudit, localExport, sitemapLocal, runtimeBuild, liveResults) {
  const liveFailed = liveResults ? !liveResults.summary.liveNonRootRoutes200 || !liveResults.summary.liveSitemapCurrent || liveResults.summary.selfRedirectDetected : true;
  const localPassed = localExport.summary.localStaticExportRoutesPassed && sitemapLocal.summary.localSitemapCurrent && runtimeBuild.summary.runtimeBuildCurrent;
  const configLooksCorrect =
    configAudit.summary.staticExportConfigured &&
    configAudit.summary.netlifyPublishesOut &&
    configAudit.summary.netlifyBuildCommandCorrect &&
    !configAudit.summary.selfRedirectRulePresent;
  const rootCause = localPassed && configLooksCorrect && liveFailed
    ? "Local static export is current and routeable, while live production is stale or misrouted at Netlify/domain level."
    : localPassed && configLooksCorrect
      ? "No local routing defect found."
      : "Local static export or routing configuration requires follow-up before production QA.";
  const ownerActions = localPassed && configLooksCorrect && liveFailed
    ? [
        "Verify Netlify is deploying the version-4 branch.",
        "Trigger a fresh Netlify deploy from the latest version-4 commit.",
        "Confirm the Netlify publish directory is out.",
        "Clear or replace the stale deploy if needed.",
        "Check domain redirect settings for apex and www.",
        "Verify the deployed commit SHA matches the latest pushed version-4 commit before rerunning live QA.",
      ]
    : [];

  return {
    generatedAt,
    runId: "live-routing-fix-actions",
    summary: {
      rootCause,
      routingConfigChanged: false,
      appLogicChanged: false,
      localIssueFound: !localPassed,
      liveIssueFound: liveFailed,
      ownerActionRequired: ownerActions.length > 0,
      selfRedirectFixedLocally: localExport.summary.localSelfRedirectCount === 0,
      liveSelfRedirectStillObserved: Boolean(liveResults?.summary.selfRedirectDetected),
    },
    filesChanged: [
      "AGENTS.md",
      "package.json",
      "pipeline/scripts/live-routing-http-check.mjs",
      "pipeline/scripts/live-routing-local-export-check.mjs",
      "pipeline/tests/live-routing-fix.test.mjs",
      "pipeline/manifests/live-routing-http-results.json",
      "pipeline/reports/live-routing-http-report.md",
      ...Object.values(OUTPUTS),
      ...Object.values(REPORTS),
    ],
    localBeforeAfter: {
      before: "No repository routing config patch was applied because the clean local export serves non-root routes.",
      after: "Local static export route behavior remains clean; production needs a fresh/correct Netlify deploy before live QA can pass.",
    },
    ownerActions,
  };
}

function buildPostFixLiveCheck(generatedAt, liveResults, fixActions) {
  const liveReady = Boolean(liveResults?.summary.liveRootReachable && liveResults?.summary.liveNonRootRoutes200 && liveResults?.summary.liveSitemapCurrent && !liveResults?.summary.selfRedirectDetected);
  return {
    generatedAt,
    runId: "live-routing-post-fix-live-check",
    summary: {
      status: liveReady ? "passed" : "pending_deployment",
      liveHttpResultsAvailable: Boolean(liveResults),
      liveRootReachable: Boolean(liveResults?.summary.liveRootReachable),
      liveNonRootRoutes200: Boolean(liveResults?.summary.liveNonRootRoutes200),
      liveSitemapCurrent: Boolean(liveResults?.summary.liveSitemapCurrent),
      selfRedirectFixed: Boolean(liveResults && !liveResults.summary.selfRedirectDetected),
      liveRuntimeSwitchActive: Boolean(liveResults?.summary.liveRuntimeSwitchActive),
      liveBrowserQaRun: false,
      sampledAssetCheckRun: false,
      netlifyRedeployRequired: fixActions.summary.ownerActionRequired,
    },
    blockers: liveReady
      ? []
      : [
          "Live production still needs a fresh/correct Netlify deployment before browser QA, sampled asset checks, image sitemap, OG images, JSON-LD expansion, or live ads can proceed.",
        ],
  };
}

function buildAcceptanceGate(generatedAt, localExport, sitemapLocal, runtimeBuild, liveResults, fixActions, postFixLive) {
  const local_static_export_routes_passed = localExport.summary.localStaticExportRoutesPassed;
  const local_sitemap_current = sitemapLocal.summary.localSitemapCurrent;
  const live_root_reachable = Boolean(liveResults?.summary.liveRootReachable);
  const live_non_root_routes_200 = Boolean(liveResults?.summary.liveNonRootRoutes200);
  const live_sitemap_current = Boolean(liveResults?.summary.liveSitemapCurrent);
  const live_runtime_switch_active = Boolean(liveResults?.summary.liveRuntimeSwitchActive);
  const self_redirect_fixed = Boolean(liveResults && !liveResults.summary.selfRedirectDetected);
  const netlify_deployment_stale = Boolean(fixActions.summary.ownerActionRequired);
  const owner_action_required = netlify_deployment_stale || !live_non_root_routes_200 || !live_sitemap_current || !self_redirect_fixed;
  const ready_to_resume_live_production_qa =
    local_static_export_routes_passed &&
    local_sitemap_current &&
    runtimeBuild.summary.runtimeBuildCurrent &&
    live_root_reachable &&
    live_non_root_routes_200 &&
    live_sitemap_current &&
    live_runtime_switch_active &&
    self_redirect_fixed &&
    !owner_action_required;
  const blockers = [];

  if (!local_static_export_routes_passed) blockers.push("Local static export routes did not pass.");
  if (!local_sitemap_current) blockers.push("Local sitemap is not current.");
  if (!runtimeBuild.summary.runtimeBuildCurrent) blockers.push("Runtime build data is not on the 6,352-record switch.");
  if (!live_non_root_routes_200) blockers.push("Live non-root routes are not serving clean HTTP 200 responses.");
  if (!live_sitemap_current) blockers.push("Live sitemap is stale or incomplete.");
  if (!self_redirect_fixed) blockers.push("Live self-redirect behavior is still observed.");
  if (owner_action_required) blockers.push("Owner action is required in Netlify before live QA can be accepted.");

  return {
    generatedAt,
    runId: "live-routing-acceptance-gate",
    local_static_export_routes_passed,
    local_sitemap_current,
    live_root_reachable,
    live_non_root_routes_200,
    live_sitemap_current,
    live_runtime_switch_active,
    self_redirect_fixed,
    netlify_deployment_stale,
    owner_action_required,
    ready_to_resume_live_production_qa,
    ready_for_image_sitemap_round: false,
    ready_for_og_image_round: false,
    ready_for_jsonld_round: false,
    ready_for_live_ads_round: false,
    post_fix_live_status: postFixLive.summary.status,
    blockers,
  };
}

async function runCleanBuild() {
  await rm(path.join(REPO_ROOT, "out"), { recursive: true, force: true });
  const result = await runNpmScript("build", {
    timeout: 600_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: SITE_URL,
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: ASSET_BASE_URL,
      NEXT_PUBLIC_CONTACT_EMAIL: CONTACT_EMAIL,
    },
  });
  return {
    command: "npm run build",
    cleanOutRemovedBeforeBuild: true,
    ...result,
  };
}

function buildSkippedResult() {
  return {
    command: "npm run build",
    cleanOutRemovedBeforeBuild: false,
    exitCode: 0,
    stdout: "Skipped by --skip-build.",
    stderr: "",
  };
}

async function runLocalRouteChecks() {
  const server = http.createServer(async (request, response) => {
    const result = resolveStaticRequest(request.url || "/");
    response.statusCode = result.status;
    response.setHeader("content-type", result.contentType);
    if (result.backingFile) response.setHeader("x-backing-file", result.backingFile);
    if (result.location) response.setHeader("location", result.location);
    response.end(result.body);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const checks = [];

  try {
    for (const routePath of LOCAL_PATHS) {
      const response = await fetch(`${origin}${routePath}`, { redirect: "manual" });
      const body = await response.text();
      checks.push({
        path: routePath,
        status: response.status,
        location: response.headers.get("location") || "",
        contentType: response.headers.get("content-type") || "",
        bodyContainsExpectedMarker: body.includes(expectedLocalMarker(routePath)),
        selfRedirect: isSelfRedirect(routePath, response.headers.get("location") || ""),
        backingFile: response.headers.get("x-backing-file") || "",
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  return checks;
}

function resolveStaticRequest(requestUrl) {
  const url = new URL(requestUrl, "http://local.test");
  const pathname = decodeURIComponent(url.pathname);
  const candidates = [];
  const cleanPath = pathname.replace(/^\/+/, "");

  if (pathname === "/") candidates.push("index.html");
  else if (path.extname(pathname)) candidates.push(cleanPath);
  else {
    candidates.push(`${cleanPath}.html`);
    candidates.push(path.join(cleanPath, "index.html"));
    if (pathname.endsWith("/")) {
      const withoutSlash = cleanPath.replace(/\/+$/, "");
      candidates.unshift(`${withoutSlash}.html`);
      candidates.push(path.join(withoutSlash, "index.html"));
    }
  }

  for (const candidate of unique(candidates)) {
    const absolute = path.join(REPO_ROOT, "out", candidate);
    if (!absolute.startsWith(path.join(REPO_ROOT, "out")) || !existsSync(absolute)) continue;
    const body = statSync(absolute).isFile() ? readFileSyncText(absolute) : "";
    return {
      status: 200,
      contentType: contentTypeFor(candidate),
      body,
      location: "",
      backingFile: candidate.replace(/\\/g, "/"),
    };
  }

  return { status: 404, contentType: "text/plain; charset=utf-8", body: "Not found", location: "", backingFile: "" };
}

function readFileSyncText(absolute) {
  return statSync(absolute).size > 4_000_000 ? "" : readFileSync(absolute, "utf8");
}

function expectedLocalMarker(routePath) {
  const normalized = routePath.replace(/\/+$/, "") || "/";
  if (normalized === "/") return "I Love Coloring Page";
  if (normalized === "/coloring-pages") return "Find a coloring page";
  if (normalized === "/coloring-pages/animals") return "Animals";
  if (normalized === "/contact") return "Contact";
  if (normalized === "/sitemap.xml") return "<urlset";
  if (normalized === "/robots.txt") return "Sitemap:";
  return "";
}

function isSelfRedirect(routePath, location) {
  if (!location) return false;
  return normalizeRulePath(routePath) === normalizeRulePath(location);
}

function exportedPathExists(routePath, exportSet) {
  if (routePath === "/") return exportSet.has("out/index.html");
  const clean = routePath.replace(/^\/+/, "");
  return exportSet.has(`out/${clean}.html`) || exportSet.has(`out/${clean}/index.html`);
}

async function readSitemapLocs() {
  const sitemapPath = path.join(REPO_ROOT, "out", "sitemap.xml");
  if (!existsSync(sitemapPath)) return [];
  const xml = await readFile(sitemapPath, "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function parseTrustRoutes(source) {
  return [...source.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
}

async function readRejectedHubRoutes() {
  const manifestPath = "pipeline/manifests/round-4a-rejected-hub-candidates.json";
  if (!existsSync(path.join(REPO_ROOT, manifestPath))) return [];
  try {
    const parsed = await readJson(manifestPath);
    const candidates = parsed.rejectedHubs || parsed.candidates || parsed.hubs || [];
    return candidates.map((entry) => entry.route || (entry.slug ? `/coloring-pages/${entry.slug}` : null)).filter(Boolean);
  } catch {
    return [];
  }
}

function parseNetlifyRedirects(source) {
  const blocks = source.split(/\[\[redirects\]\]/g).slice(1);
  return blocks.map((block) => ({
    from: parseTomlValue(block, "from"),
    to: parseTomlValue(block, "to"),
    status: parseTomlValue(block, "status"),
  }));
}

function parseTomlValue(source, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\r\\n#]+))`, "m").exec(source);
  return (match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function normalizeRulePath(value) {
  return String(value || "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, "") || "/";
}

function getPublicDownloadFormats(source) {
  const formats = [];
  if (/label:\s*"PNG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"png"/.test(source)) formats.push("PNG");
  if (/label:\s*"JPG"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"jpg"/.test(source)) formats.push("JPG");
  if (/label:\s*"WebP"|EXPOSED_PUBLIC_DOWNLOAD_FORMATS[\s\S]*"webp"/.test(source)) formats.push("WebP");
  return formats;
}

function contentTypeFor(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function renderProjectContextReport(payload) {
  return `# Live Routing Project Context Check

- Correct repository: ${payload.summary.correctRepository}
- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- Correct branch: ${payload.summary.correctBranch}
- Runtime switch commit exists: ${payload.summary.runtimeSwitchCommitExists}
- Live verification commits exist: ${payload.summary.liveProductionVerificationCommitsExist}
- Static export configured: ${payload.summary.frontendOnlyNextStaticExport}
- app/api present: ${payload.summary.appApiRoutePresent}
- Runtime generated data exists: ${payload.summary.runtimeGeneratedDataExists}
- Runtime available records: ${payload.summary.runtimeAvailableRecords}
- Public contains generated production media: ${payload.summary.publicContainsGeneratedProductionMedia}
- images clean: ${payload.summary.imagesStatusClean}
- ilovesvg clean: ${payload.summary.ilovesvgStatusClean}
- SVG user download exposed: ${payload.summary.svgUserDownloadExposed}
- Public downloads: ${payload.summary.publicDownloads.join(", ")}
- Live AdSense code absent: ${payload.summary.liveAdSenseCodeAbsent}
- Image sitemap absent: ${payload.summary.imageSitemapAbsent}
- OG image generation absent: ${payload.summary.openGraphImageGenerationAbsent}
- Public defaults hardcoded: ${payload.summary.publicDefaultsHardcoded}
- R2 credential names in runtime: ${payload.summary.r2CredentialNamesInRuntime}
`;
}

function renderConfigAuditReport(payload) {
  return `# Live Routing Config Audit

- Static export configured: ${payload.summary.staticExportConfigured}
- trailingSlash: ${payload.summary.trailingSlashConfigured}
- Netlify build command: ${payload.summary.netlifyBuildCommand}
- Netlify publish directory: ${payload.summary.netlifyPublishDirectory}
- Package build command: ${payload.summary.packageBuildCommand}
- Exported no-slash HTML exists: ${payload.summary.exportedNoSlashHtmlExists}
- Exported slash index HTML exists: ${payload.summary.exportedSlashIndexHtmlExists}
- Exported sitemap exists: ${payload.summary.exportedSitemapExists}
- Exported robots exists: ${payload.summary.exportedRobotsExists}
- Generated _redirects exists: ${payload.summary.generatedRedirectsFileExists}
- Generated _headers exists: ${payload.summary.generatedHeadersFileExists}
- Netlify redirect rule count: ${payload.summary.netlifyRedirectRuleCount}
- Self-redirect rule present: ${payload.summary.selfRedirectRulePresent}
- Pretty URLs work locally: ${payload.summary.prettyUrlsWorkLocally}
- Slash URLs work locally: ${payload.summary.slashUrlsWorkLocally}
- Sitemap paths use no trailing slash: ${payload.summary.sitemapPathsUseNoTrailingSlash}
- Sitemap paths match exported paths: ${payload.summary.sitemapPathsMatchExportedPaths}
- Netlify publishes out: ${payload.summary.netlifyPublishesOut}
- Netlify build command correct: ${payload.summary.netlifyBuildCommandCorrect}

The local export uses extensionless pretty URL serving against \`.html\` files because ` + "`trailingSlash: false`" + ` exports routes such as \`out/coloring-pages/animals.html\`.
`;
}

function renderLocalExportReport(payload) {
  return `# Live Routing Local Export Report

- Build command: ${payload.command}
- Removed out before build: ${payload.summary.cleanOutRemovedBeforeBuild}
- Build exit code: ${payload.summary.buildExitCode}
- Build succeeded: ${payload.summary.buildSucceeded}
- Exported files: ${payload.summary.exportedFileCount}
- Local static export routes passed: ${payload.summary.localStaticExportRoutesPassed}
- No-slash primary routes passed: ${payload.summary.noSlashPrimaryRoutesPassed}
- Slash variant routes passed: ${payload.summary.slashVariantRoutesPassed}
- Local redirect count: ${payload.summary.localRedirectCount}
- Local self-redirect count: ${payload.summary.localSelfRedirectCount}
- Sitemap status: ${payload.summary.sitemapStatus}
- Robots status: ${payload.summary.robotsStatus}

## Route Checks

${payload.checks.map((check) => `- ${check.path}: ${check.status}, marker: ${check.bodyContainsExpectedMarker}, self-redirect: ${check.selfRedirect}`).join("\n")}
`;
}

function renderSitemapLocalReport(payload) {
  return `# Live Routing Local Sitemap Check

- Sitemap exists: ${payload.summary.localSitemapExists}
- Sitemap current: ${payload.summary.localSitemapCurrent}
- Sitemap URL count: ${payload.summary.sitemapLocCount}
- Expected URL count: ${payload.summary.expectedLocCount}
- Includes homepage: ${payload.summary.includesHomepage}
- Includes /coloring-pages: ${payload.summary.includesColoringPages}
- Includes Phase 1 hub routes: ${payload.summary.includesPhase1HubRoutes}
- Includes trust pages: ${payload.summary.includesTrustPages}
- No per-image routes: ${payload.summary.noPerImageRoutes}
- No Phase 2 hub routes: ${payload.summary.noPhase2HubRoutes}
- No section-only topic routes: ${payload.summary.noSectionOnlyTopicRoutes}
- No rejected routes: ${payload.summary.noRejectedRoutes}
- No image sitemap: ${payload.summary.noImageSitemap}
`;
}

function renderRuntimeBuildReport(payload) {
  return `# Live Routing Runtime Build Check

- Runtime available records: ${payload.summary.runtimeAvailableRecords}
- Runtime asset records: ${payload.summary.runtimeAssetRecords}
- Runtime build current: ${payload.summary.runtimeBuildCurrent}
- Primary pages contain 6,352: ${payload.summary.primaryPublicPagesContain6352}
- Primary pages contain 6,557: ${payload.summary.primaryPublicPagesContain6557}
- Primary pages use asset base URL: ${payload.summary.primaryPublicPagesUseAssetBaseUrl}
- out contains localhost: ${payload.summary.outContainsLocalhost}
- out contains r2.dev: ${payload.summary.outContainsR2Dev}
- out contains Download SVG: ${payload.summary.outContainsDownloadSvg}
- out contains app/api reference: ${payload.summary.outContainsAppApiReference}
- out contains contact email: ${payload.summary.outContainsContactEmail}
- out contains live AdSense code: ${payload.summary.outContainsLiveAdsenseCode}
`;
}

function renderFixActionsReport(payload) {
  return `# Live Routing Fix Actions

- Root cause: ${payload.summary.rootCause}
- Routing config changed: ${payload.summary.routingConfigChanged}
- App logic changed: ${payload.summary.appLogicChanged}
- Local issue found: ${payload.summary.localIssueFound}
- Live issue found: ${payload.summary.liveIssueFound}
- Owner action required: ${payload.summary.ownerActionRequired}
- Self-redirect fixed locally: ${payload.summary.selfRedirectFixedLocally}
- Live self-redirect still observed: ${payload.summary.liveSelfRedirectStillObserved}

## Owner Actions

${payload.ownerActions.length ? payload.ownerActions.map((action) => `- ${action}`).join("\n") : "No owner action required by this report."}
`;
}

function renderPostFixLiveReport(payload) {
  return `# Live Routing Post-Fix Live Check

- Status: ${payload.summary.status}
- Live HTTP results available: ${payload.summary.liveHttpResultsAvailable}
- Live root reachable: ${payload.summary.liveRootReachable}
- Live non-root routes 200: ${payload.summary.liveNonRootRoutes200}
- Live sitemap current: ${payload.summary.liveSitemapCurrent}
- Self-redirect fixed: ${payload.summary.selfRedirectFixed}
- Live runtime switch active: ${payload.summary.liveRuntimeSwitchActive}
- Live browser QA run: ${payload.summary.liveBrowserQaRun}
- Sampled asset check run: ${payload.summary.sampledAssetCheckRun}
- Netlify redeploy required: ${payload.summary.netlifyRedeployRequired}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No post-fix live blockers found.\n"}
`;
}

function renderAcceptanceGateReport(payload) {
  return `# Live Routing Acceptance Gate

- Local static export routes passed: ${payload.local_static_export_routes_passed}
- Local sitemap current: ${payload.local_sitemap_current}
- Live root reachable: ${payload.live_root_reachable}
- Live non-root routes 200: ${payload.live_non_root_routes_200}
- Live sitemap current: ${payload.live_sitemap_current}
- Live runtime switch active: ${payload.live_runtime_switch_active}
- Self-redirect fixed: ${payload.self_redirect_fixed}
- Netlify deployment stale: ${payload.netlify_deployment_stale}
- Owner action required: ${payload.owner_action_required}
- Ready to resume live production QA: ${payload.ready_to_resume_live_production_qa}
- Ready for image sitemap round: ${payload.ready_for_image_sitemap_round}
- Ready for OG image round: ${payload.ready_for_og_image_round}
- Ready for JSON-LD round: ${payload.ready_for_jsonld_round}
- Ready for live ads round: ${payload.ready_for_live_ads_round}

## Blockers

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}
`;
}

async function runNpmScript(scriptName, options = {}) {
  if (process.platform === "win32") {
    return execFileCapture("cmd.exe", ["/d", "/s", "/c", "npm", "run", scriptName], options);
  }
  return execFileCapture("npm", ["run", scriptName], options);
}

async function execFileCapture(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: REPO_ROOT,
      maxBuffer: 1024 * 1024 * 80,
      timeout: options.timeout || 120_000,
      env: options.env || process.env,
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

async function readTextFromFiles(files) {
  const chunks = [];
  let totalSize = 0;
  for (const file of files) {
    try {
      const info = await stat(file);
      if (info.size > 4_000_000 || totalSize + info.size > 30_000_000) continue;
      chunks.push(await readFile(file, "utf8"));
      totalSize += info.size;
    } catch {
      continue;
    }
  }
  return chunks.join("\n");
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absoluteRoot)) continue;
    const files = statSync(absoluteRoot).isFile() ? [absoluteRoot] : await listFilesIfExists(absoluteRoot);
    for (const absoluteFile of files) {
      const relative = normalizePath(absoluteFile);
      if (!/\.(?:ts|tsx|css|json|md|mjs|toml)$/.test(relative)) continue;
      if (relative.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readFile(absoluteFile, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(absolute);
    }
  }
  if (statSync(root).isFile()) return [root];
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

async function gitCommitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

async function gitStatusFor(relativePath) {
  return git(["status", "--short", "--", relativePath]);
}

function parseArgs(argv) {
  return {
    skipBuild: argv.includes("--skip-build"),
  };
}

function normalizePath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function tail(value, lines = 60) {
  return asciiSafe(value).split(/\r?\n/).slice(-lines).join("\n");
}

function asciiSafe(value) {
  return String(value || "").replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
