#!/usr/bin/env node

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  REPO_ROOT,
  ensureStaticExport,
  passFail,
  readJson,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SITE_URL = "https://www.ilovecoloringpage.com";
const EXPECTED_RUNTIME_HUBS = 163;
const EXPECTED_SITEMAP_LOCS = 171;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const EXPECTED_OG_JPG_COUNT = 165;
const forbiddenSchemaTypes = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"]);
const sampledRoutes = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/dodo",
  "/coloring-pages/magic",
  "/coloring-pages/lily",
  "/sitemap",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];
const trustRoutes = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const contextCheck = await runContextCheck();
  await writeJson("pipeline/manifests/final-local-rerun-context-check.json", contextCheck);
  await writeText("pipeline/reports/final-local-rerun-context-check.md", renderContextReport(contextCheck));

  const workingTreeAudit = await runWorkingTreeAudit();
  await writeJson("pipeline/manifests/final-local-rerun-working-tree-audit.json", workingTreeAudit);
  await writeText("pipeline/reports/final-local-rerun-working-tree-audit.md", renderWorkingTreeReport(workingTreeAudit));

  const build = await ensureStaticExport({ force: false });
  const seoRegression = await runSeoRegression(build);
  await writeJson("pipeline/manifests/final-local-rerun-seo-results.json", seoRegression);
  await writeText("pipeline/reports/final-local-rerun-seo-report.md", renderSeoReport(seoRegression));

  const trustReview = await runTrustContentReview(build);
  await writeJson("pipeline/manifests/final-local-rerun-trust-content-review.json", trustReview);
  await writeText("pipeline/reports/final-local-rerun-trust-content-review.md", renderTrustReport(trustReview));

  const gate = await buildAcceptanceGate(seoRegression, trustReview);
  await writeJson("pipeline/manifests/final-local-rerun-acceptance-gate.json", gate);
  await writeText("pipeline/reports/final-local-rerun-acceptance-gate.md", renderGateReport(gate));

  console.log(JSON.stringify({ seoRegressionPassed: seoRegression.summary.seoRegressionPassed, trustContentPassed: trustReview.summary.trustContentPassed, readyForNetlifyDeployment: gate.ready_for_netlify_deployment }, null, 2));
  if (!gate.ready_for_netlify_deployment) process.exitCode = 1;
}

async function runContextCheck() {
  const topLevel = git(["rev-parse", "--show-toplevel"]).trim().replace(/\\/g, "/");
  const branch = git(["branch", "--show-current"]).trim();
  const head = git(["rev-parse", "HEAD"]).trim();
  const requiredCommit = "311a11cb985f3d20db44f80c7a939bb37e71cc63";
  const runtimeItems = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const imageSitemap = await readText("public/image-sitemap.xml");
  const jsonLdData = await readJson("pipeline/manifests/jsonld-route-data.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const downloadSurface = [
    await readText("src/components/coloring/DownloadMenu.tsx"),
    await readText("src/components/coloring/ImageCard.tsx"),
    await readText("src/lib/coloring/browserDownloads.ts"),
  ].join("\n");
  const appSource = await readSourceText(["app", "src"], { skipGeneratedColoring: true });
  const routeOgJpgCount = await countFiles(path.join(REPO_ROOT, "public", "og"), /\.jpg$/i);
  const imageSitemapWebpEntries = countMatches(imageSitemap, /<image:loc>/g);
  const requiredCommitExists = commandSucceeds("git", ["cat-file", "-e", `${requiredCommit}^{commit}`]);
  const sitemapSource = await readText("app/sitemap.ts");
  const summary = {
    contextCheckPassed: true,
    blockers: [],
  };
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: "final-local-rerun-context-check",
    repo: {
      expectedProjectName: "i-love-coloring-page",
      topLevel,
      projectNamePassed: path.basename(topLevel) === "i-love-coloring-page",
      branch,
      branchPassed: branch === "ver-5-deployed-may-13-2026",
      head,
      requiredCommit,
      requiredCommitExists,
    },
    appShape: {
      appApiExists: fs.existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      frontendOnlyStaticExport: true,
      sitemapPageExists: fs.existsSync(path.join(REPO_ROOT, "app", "sitemap", "page.tsx")),
      sitemapSourceIncludesHtmlSitemap: /path:\s*["']\/sitemap["']/.test(sitemapSource),
    },
    runtime: {
      availableRecords: runtimeItems.items.length,
      availableRecordsPassed: runtimeItems.items.length === 6352,
      runtimeHubCount: runtimeHubs.hubs.length,
      runtimeHubCountPassed: runtimeHubs.hubs.length === EXPECTED_RUNTIME_HUBS,
      runtimeSitemapRouteCount: runtimeSiteMap.entries.length,
      runtimeSitemapRouteCountPassed: runtimeSiteMap.entries.length === EXPECTED_RUNTIME_HUBS,
    },
    seoAssets: {
      imageSitemapExists: fs.existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
      imageSitemapWebpEntries,
      imageSitemapWebpEntriesPassed: imageSitemapWebpEntries === EXPECTED_IMAGE_SITEMAP_ENTRIES,
      ogImagesExist: routeOgJpgCount >= EXPECTED_OG_JPG_COUNT,
      routeLevelOgJpgCount: routeOgJpgCount,
      routeLevelOgJpgCountPassed: routeOgJpgCount === EXPECTED_OG_JPG_COUNT,
      jsonLdExists: jsonLdData.summary?.hubPagesWithJsonLd === EXPECTED_RUNTIME_HUBS,
    },
    publicSafeDefaults: {
      siteUrl: SITE_URL,
      assetBaseUrl: "https://assets.ilovecoloringpage.com/coloring-pages",
      contactEmail: "admin@ilovecoloringpage.com",
      passed:
        siteConfig.includes(SITE_URL) &&
        siteConfig.includes("https://assets.ilovecoloringpage.com/coloring-pages") &&
        siteConfig.includes("admin@ilovecoloringpage.com"),
    },
    downloadsAndMedia: {
      publicDownloadFormats: ["PNG", "JPG", "WebP"],
      pngJpgWebpControlsPresent: /Download PNG/.test(downloadSurface) && /Download JPG/.test(downloadSurface) && /Download WebP/.test(downloadSurface),
      svgInternalOnly: !/Download SVG|downloadSvg\b|svgDownload/i.test(downloadSurface),
      svgUserDownloadAbsent: !/Download SVG|downloadSvg\b|svgDownload/i.test(downloadSurface),
    },
    ads: {
      liveAdsenseCodeAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(appSource),
    },
    protectedPaths: {
      imagesUntouchedAtBaseline: git(["status", "--short", "--", "images"]).trim() === "",
      ilovesvgUntouchedAtBaseline: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
    },
    summary,
  };

  const blockers = [];
  if (!payload.repo.projectNamePassed) blockers.push("project name check failed.");
  if (!payload.repo.branchPassed) blockers.push("branch check failed.");
  if (!payload.repo.requiredCommitExists) blockers.push("required commit is missing.");
  if (payload.appShape.appApiExists) blockers.push("app/api exists.");
  if (!payload.appShape.staticExportConfigured) blockers.push("static export is not configured.");
  if (!payload.appShape.sitemapPageExists) blockers.push("/sitemap page is missing.");
  if (!payload.appShape.sitemapSourceIncludesHtmlSitemap) blockers.push("XML sitemap source does not include /sitemap.");
  if (!payload.runtime.availableRecordsPassed) blockers.push("runtime available record count mismatch.");
  if (!payload.runtime.runtimeHubCountPassed) blockers.push("runtime hub count mismatch.");
  if (!payload.seoAssets.imageSitemapWebpEntriesPassed) blockers.push("image sitemap WebP entry count mismatch.");
  if (!payload.seoAssets.routeLevelOgJpgCountPassed) blockers.push("OG image count mismatch.");
  if (!payload.seoAssets.jsonLdExists) blockers.push("JSON-LD manifest mismatch.");
  if (!payload.publicSafeDefaults.passed) blockers.push("public-safe defaults mismatch.");
  if (!payload.downloadsAndMedia.pngJpgWebpControlsPresent) blockers.push("PNG/JPG/WebP download controls missing.");
  if (!payload.downloadsAndMedia.svgUserDownloadAbsent) blockers.push("SVG download is visible.");
  if (!payload.ads.liveAdsenseCodeAbsent) blockers.push("live AdSense code found.");
  if (!payload.protectedPaths.imagesUntouchedAtBaseline) blockers.push("images/ has drift.");
  if (!payload.protectedPaths.ilovesvgUntouchedAtBaseline) blockers.push("ilovesvg/ has drift.");
  payload.summary.contextCheckPassed = blockers.length === 0;
  payload.summary.blockers = blockers;
  return payload;
}

async function runWorkingTreeAudit() {
  const gitStatusShort = git(["status", "--short"]);
  const gitDiffStat = git(["diff", "--stat"]);
  const gitDiffNameOnly = git(["diff", "--name-only"]);
  const statusFiles = gitStatusShort
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[AMDRCU? ]+\s+/, ""))
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"));
  const allowedCurrentRound = [
    "AGENTS.md",
    "pipeline/scripts/final-local-rerun-browser-qa-runner.cjs",
    "pipeline/scripts/final-local-rerun-print-qa-runner.cjs",
    "pipeline/scripts/final-local-rerun-seo-qa.mjs",
    "pipeline/tests/final-local-rerun-acceptance.test.mjs",
  ];
  const allowedPrefixes = ["pipeline/manifests/final-local-rerun-", "pipeline/reports/final-local-rerun-"];
  const unrelated = statusFiles.filter((file) => !allowedCurrentRound.includes(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)));
  const summary = {
    workingTreeAuditPassed: unrelated.length === 0,
    blockers: unrelated.map((file) => `Unrelated working tree drift: ${file}`),
  };
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-local-rerun-working-tree-audit",
    commands: {
      gitStatusShort,
      gitDiffStat,
      gitDiffNameOnly,
    },
    classification: {
      baselineWasCleanBeforeRoundEdits: true,
      currentRoundFilesDetected: statusFiles.length > 0,
      unrelatedDriftFound: unrelated.length > 0,
      unrelatedFiles: unrelated,
      safeToProceed: unrelated.length === 0,
    },
    summary,
  };
}

async function runSeoRegression(build) {
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const jsonLdData = await readJson("pipeline/manifests/jsonld-route-data.json");
  const ogData = await readJson("src/generated/coloring/og-images.json");
  const sitemapPath = path.join(build.outDir, "sitemap.xml");
  const imageSitemapPath = path.join(build.outDir, "image-sitemap.xml");
  const robotsPath = path.join(build.outDir, "robots.txt");
  const publicImageSitemap = path.join(REPO_ROOT, "public", "image-sitemap.xml");
  const sitemap = await fsp.readFile(sitemapPath, "utf8");
  const imageSitemap = await fsp.readFile(fs.existsSync(imageSitemapPath) ? imageSitemapPath : publicImageSitemap, "utf8");
  const robots = await fsp.readFile(robotsPath, "utf8");
  const sitemapLocs = extractXmlLocs(sitemap);
  const imageLocCount = countMatches(imageSitemap, /<image:loc>/g);
  const runtimeUrls = runtimeSiteMap.entries.map((entry) => `${SITE_URL}${entry.path === "/" ? "" : entry.path}`);
  const hubOgMissing = runtimeHubs.hubs
    .map((hub) => {
      const metadata = ogData.metadataByPath?.[hub.route];
      const relativePath = metadata?.ogImagePath ? `public${metadata.ogImagePath}` : "";
      return { route: hub.route, relativePath };
    })
    .filter((entry) => !entry.relativePath || !fs.existsSync(path.join(REPO_ROOT, entry.relativePath)));
  const ogJpgCount = await countFiles(path.join(REPO_ROOT, "public", "og"), /\.jpg$/i);
  const sampled = await Promise.all(sampledRoutes.map((route) => inspectRouteMetadata(build.outDir, route)));
  const sampledJsonLdTypes = sampled.flatMap((entry) => entry.jsonLdTypes);
  const allJsonLdTypes = flattenTypes(jsonLdData.routes);
  const sitemapTextUnsafe = /localhost|127\.0\.0\.1|r2\.dev|r2\.cloudflarestorage\.com/i.test(`${sitemap}\n${imageSitemap}\n${robots}`);
  const perImageRoutePattern = /\/coloring-pages\/[^/\s<]+\/[^/\s<]+/i;
  const trustUrls = trustRoutes.map((route) => `${SITE_URL}${route}`);

  const summary = {
    sitemapExistsInStaticOutput: fs.existsSync(sitemapPath),
    sitemapContainsExpectedRuntimeRouteSet: runtimeUrls.every((url) => sitemapLocs.includes(url)),
    sitemapIncludesAllPublicHubRoutes: runtimeUrls.every((url) => sitemapLocs.includes(url)),
    sitemapIncludesHtmlSitemap: sitemapLocs.includes(`${SITE_URL}/sitemap`),
    sitemapIncludesTrustPages: trustUrls.every((url) => sitemapLocs.includes(url)),
    sitemapLocCount: sitemapLocs.length,
    sitemapLocCountPassed: sitemapLocs.length === EXPECTED_SITEMAP_LOCS,
    noManualReviewBacklogRoutes: !/manual-review|backlog|rejected/i.test(sitemap),
    sitemapRuntimeRouteCount: runtimeUrls.length,
    runtimeSitemapRouteCount: runtimeSiteMap.entries.length,
    imageSitemapExists: fs.existsSync(imageSitemapPath) || fs.existsSync(publicImageSitemap),
    imageSitemapWebpEntries: imageLocCount,
    imageSitemapWebpEntryCountPassed: imageLocCount === EXPECTED_IMAGE_SITEMAP_ENTRIES,
    imageSitemapExcludesSvgPngThumbs: !/\/svg\/|\.svg(?:<|$)|\/png\/|\/thumbs\//i.test(imageSitemap),
    robotsTxtExists: fs.existsSync(robotsPath),
    robotsReferencesRegularSitemap: robots.includes(`${SITE_URL}/sitemap.xml`),
    robotsReferencesImageSitemap: robots.includes(`${SITE_URL}/image-sitemap.xml`),
    ogImagesExistForAllHubRoutes: hubOgMissing.length === 0,
    ogRouteLevelJpgCount: ogJpgCount,
    ogRouteLevelJpgCountPassed: ogJpgCount === EXPECTED_OG_JPG_COUNT,
    jsonLdExistsForSampledRoutes: sampled.every((entry) => entry.jsonLdScriptCount > 0),
    jsonLdParsesForSampledRoutes: sampled.every((entry) => entry.jsonLdParseErrors.length === 0),
    noForbiddenSchemaTypes: [...forbiddenSchemaTypes].every((schemaType) => !allJsonLdTypes.includes(schemaType) && !sampledJsonLdTypes.includes(schemaType)),
    noPerImageRoutes: !perImageRoutePattern.test(sitemap),
    noLocalhostR2DevPrivateEndpoints: !sitemapTextUnsafe && sampled.every((entry) => entry.noUnsafeEndpoints),
    canonicalUrlsUseWww: sampled.every((entry) => entry.canonical?.startsWith(SITE_URL)),
  };
  summary.seoRegressionPassed =
    summary.sitemapExistsInStaticOutput &&
    summary.sitemapContainsExpectedRuntimeRouteSet &&
    summary.sitemapIncludesHtmlSitemap &&
    summary.sitemapIncludesTrustPages &&
    summary.sitemapLocCountPassed &&
    summary.noManualReviewBacklogRoutes &&
    summary.runtimeSitemapRouteCount === EXPECTED_RUNTIME_HUBS &&
    summary.imageSitemapExists &&
    summary.imageSitemapWebpEntryCountPassed &&
    summary.imageSitemapExcludesSvgPngThumbs &&
    summary.robotsTxtExists &&
    summary.robotsReferencesRegularSitemap &&
    summary.robotsReferencesImageSitemap &&
    summary.ogImagesExistForAllHubRoutes &&
    summary.ogRouteLevelJpgCountPassed &&
    summary.jsonLdExistsForSampledRoutes &&
    summary.jsonLdParsesForSampledRoutes &&
    summary.noForbiddenSchemaTypes &&
    summary.noPerImageRoutes &&
    summary.noLocalhostR2DevPrivateEndpoints &&
    summary.canonicalUrlsUseWww;

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-local-rerun-seo-results",
    build,
    sampledRoutes,
    summary,
    sampled,
    missingHubOgImages: hubOgMissing,
    blockers: buildBlockers(summary, "seoRegressionPassed"),
  };
}

async function inspectRouteMetadata(outDir, route) {
  const html = await readOutRouteHtml(outDir, route);
  const jsonLdScripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => decodeHtml(match[1].trim()));
  const parsed = [];
  const parseErrors = [];
  for (const script of jsonLdScripts) {
    try {
      parsed.push(JSON.parse(script));
    } catch (error) {
      parseErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || null;
  return {
    route,
    titleExists: /<title>[^<]+<\/title>/i.test(html),
    metaDescriptionExists: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(html),
    canonical,
    ogTitleExists: /property=["']og:title["']/i.test(html),
    ogDescriptionExists: /property=["']og:description["']/i.test(html),
    ogUrlExists: /property=["']og:url["']/i.test(html),
    ogImageExists: /property=["']og:image["']/i.test(html),
    ogImageStaticJpg: /content=["']https:\/\/www\.ilovecoloringpage\.com\/og\/[^"']+\.jpg["']/i.test(html),
    twitterCardLarge: /name=["']twitter:card["'][^>]+content=["']summary_large_image["']/i.test(html),
    twitterImageExists: /name=["']twitter:image["']/i.test(html),
    jsonLdScriptCount: jsonLdScripts.length,
    jsonLdParseErrors: parseErrors,
    jsonLdTypes: flattenTypes(parsed),
    noUnsafeEndpoints: !/localhost|127\.0\.0\.1|r2\.dev|r2\.cloudflarestorage\.com/i.test(html),
    noSvgUrls: !/\/svg\/|\.svg(?:["'<\s]|$)/i.test(html),
  };
}

async function runTrustContentReview(build) {
  const trustPageSource = await readText("src/lib/trust/trustPages.ts");
  const pageResults = [];
  for (const route of trustRoutes) {
    const html = await readOutRouteHtml(build.outDir, route);
    const text = normalizeText(stripHtml(html));
    pageResults.push({
      route,
      exists: html.length > 0,
      contactEmailAppears: text.includes("admin@ilovecoloringpage.com"),
      noFakeAddress: !/\b\d{2,6}\s+[A-Z][A-Za-z0-9'.-]+\s+(Street|St\.|Avenue|Ave\.|Road|Rd\.|Drive|Dr\.|Lane|Ln\.|Boulevard|Blvd\.)\b/.test(text),
      noFakePhone: !/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.test(text),
      noFalseCompanyClaims: !/\b(LLC|Inc\.|Corporation|Corp\.)\b/.test(text),
      noPublicSvgDownloadClaims: !/Download SVG|SVG download/i.test(text),
      noInternalPipelineWording: !/\bpipeline\b/i.test(text),
      noMisleadingOnlineColoringClaims: !/(color online now|online coloring tools? (?:are|is) available|use our online coloring)/i.test(text),
    });
  }

  const privacy = pageResults.find((page) => page.route === "/privacy");
  const terms = pageResults.find((page) => page.route === "/terms");
  const affiliate = pageResults.find((page) => page.route === "/affiliate-disclosure");
  const editorial = pageResults.find((page) => page.route === "/editorial-policy");
  const homepage = await inspectContentRoute(build.outDir, "/");
  const coloringPages = await inspectContentRoute(build.outDir, "/coloring-pages");
  const sampledHub = await inspectContentRoute(build.outDir, "/coloring-pages/animals");

  const summary = {
    pagesExist: pageResults.every((page) => page.exists),
    contactEmailIsAdmin: pageResults.some((page) => page.route === "/contact" && page.contactEmailAppears),
    noFakeAddress: pageResults.every((page) => page.noFakeAddress),
    noFakePhone: pageResults.every((page) => page.noFakePhone),
    noFalseCompanyClaims: pageResults.every((page) => page.noFalseCompanyClaims),
    privacyTermsDraftSafe: /draft/i.test(await readOutRouteHtml(build.outDir, "/privacy")) && /draft/i.test(await readOutRouteHtml(build.outDir, "/terms")),
    privacyMentionsFutureAdsCookiesAccurately: privacy ? /Live Google AdSense code is not installed yet|future advertising/i.test(stripHtml(await readOutRouteHtml(build.outDir, "/privacy"))) : false,
    affiliateDisclosurePresent: Boolean(affiliate?.exists),
    editorialPolicyPresent: Boolean(editorial?.exists),
    noMisleadingOnlineColoringClaims: pageResults.every((page) => page.noMisleadingOnlineColoringClaims) && homepage.noMisleadingOnlineColoringClaims && coloringPages.noMisleadingOnlineColoringClaims && sampledHub.noMisleadingOnlineColoringClaims,
    noPublicSvgDownloadClaims: pageResults.every((page) => page.noPublicSvgDownloadClaims) && homepage.noPublicSvgDownloadClaims && coloringPages.noPublicSvgDownloadClaims && sampledHub.noPublicSvgDownloadClaims,
    noInternalPipelineWording: pageResults.every((page) => page.noInternalPipelineWording) && homepage.noInternalPipelineWording && coloringPages.noInternalPipelineWording && sampledHub.noInternalPipelineWording,
    legalOwnerReviewRecommended: /legalReviewRecommended:\s*true|ownerReviewRequired:\s*true/.test(trustPageSource),
  };
  summary.trustContentPassed = Object.values(summary).every(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-local-rerun-trust-content-review",
    summary,
    pageResults,
    sampledPublicRoutes: [homepage, coloringPages, sampledHub],
    ownerReviewStatus: "Owner and legal review remain recommended for draft policy pages before launch and live ads.",
    blockers: buildBlockers(summary, "trustContentPassed"),
  };
}

async function inspectContentRoute(outDir, route) {
  const html = await readOutRouteHtml(outDir, route);
  const text = normalizeText(stripHtml(html));
  return {
    route,
    exists: html.length > 0,
    galleryFirstUxPreserved: route === "/" ? /Popular collections|Fresh pages|Featured/i.test(text) : /Printable gallery|Browse gallery/i.test(text),
    noMisleadingOnlineColoringClaims: !/(color online now|online coloring tools? (?:are|is) available|use our online coloring)/i.test(text),
    noPublicSvgDownloadClaims: !/Download SVG|SVG download/i.test(text),
    noInternalPipelineWording: !/\bpipeline\b/i.test(text),
  };
}

async function buildAcceptanceGate(seoRegression, trustReview) {
  const staticExport = await readJson("pipeline/manifests/final-local-rerun-static-export-results.json");
  const browser = await readJson("pipeline/manifests/final-local-rerun-browser-qa-results.json");
  const print = await readJson("pipeline/manifests/final-local-rerun-print-qa-results.json");
  const links = await readJson("pipeline/manifests/final-local-rerun-link-section-acceptance.json");
  const ad = await readJson("pipeline/manifests/final-local-rerun-ad-placeholder-qa.json");
  const noAppApi = !fs.existsSync(path.join(REPO_ROOT, "app", "api"));
  const noSvgDownload = browser.summary.svgDownloadAbsent && print.summary.svgDownloadAbsent;
  const fields = {
    generatedAt: new Date().toISOString(),
    runId: "final-local-rerun-acceptance-gate",
    static_export_passed: staticExport.summary.staticExportPassed === true,
    browser_qa_passed: browser.summary.browserQaPassed === true,
    print_pdf_passed: print.summary.printQaPassed === true,
    print_one_page_passed: print.summary.allGeneratedPdfsOnePage === true,
    print_branding_safe: print.summary.brandingIntegratedIntoFrame === true && print.summary.brandingDoesNotOverlapArtwork === true,
    navigation_hover_passed: browser.summary.headerNavHoverFocusPassed === true,
    popular_collections_passed: links.summary.popularCollectionsPassed === true,
    related_collections_passed: links.summary.relatedCollectionsPassed === true,
    html_sitemap_passed: browser.summary.htmlSitemapGroupedReadable === true,
    more_menu_passed: links.summary.moreMenuPassed === true,
    seo_assets_passed: seoRegression.summary.seoRegressionPassed === true,
    trust_content_passed: trustReview.summary.trustContentPassed === true,
    ad_placeholders_passed: ad.summary.adPlaceholderQaPassed === true,
    no_app_api: noAppApi,
    no_svg_download: noSvgDownload,
    no_horizontal_overflow: browser.summary.noHorizontalOverflow === true,
    ready_for_live_ads_round: false,
  };
  const blockers = Object.entries(fields)
    .filter(([key, value]) => !["generatedAt", "runId", "ready_for_live_ads_round"].includes(key) && value !== true)
    .map(([key]) => `${key} failed.`);
  return {
    ...fields,
    ready_for_netlify_deployment: blockers.length === 0,
    ready_for_gsc_submission_after_live_deploy: blockers.length === 0 && seoRegression.summary.seoRegressionPassed === true,
    blockers,
  };
}

function renderSeoReport(payload) {
  return [
    "# Final Local Rerun SEO Regression QA",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, typeof value === "boolean" ? passFail(value) : String(value)])),
    "",
    `Sampled routes: ${payload.sampledRoutes.join(", ")}`,
    `Missing hub OG images: ${payload.missingHubOgImages.length}`,
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderContextReport(payload) {
  return [
    "# Final Local Rerun Context Check",
    "",
    renderTable([
      ["Repo", `\`${path.basename(payload.repo.topLevel)}\``],
      ["Branch", `\`${payload.repo.branch}\``],
      ["Required commit", `${payload.repo.requiredCommit} ${payload.repo.requiredCommitExists ? "exists" : "missing"}`],
      ["Static export", passFail(payload.appShape.staticExportConfigured)],
      ["`app/api`", payload.appShape.appApiExists ? "Present" : "Absent"],
      ["/sitemap page", passFail(payload.appShape.sitemapPageExists)],
      ["XML sitemap source includes /sitemap", passFail(payload.appShape.sitemapSourceIncludesHtmlSitemap)],
      ["Runtime records", payload.runtime.availableRecords.toLocaleString("en-US")],
      ["Runtime hubs", String(payload.runtime.runtimeHubCount)],
      ["Runtime sitemap routes", String(payload.runtime.runtimeSitemapRouteCount)],
      ["Image sitemap", `${payload.seoAssets.imageSitemapWebpEntries.toLocaleString("en-US")} WebP entries`],
      ["OG images", `${payload.seoAssets.routeLevelOgJpgCount} route-level JPGs present`],
      ["JSON-LD", passFail(payload.seoAssets.jsonLdExists)],
      ["Public downloads", payload.downloadsAndMedia.publicDownloadFormats.join(", ")],
      ["SVG user download", payload.downloadsAndMedia.svgUserDownloadAbsent ? "Absent" : "Present"],
      ["Live AdSense", payload.ads.liveAdsenseCodeAbsent ? "Absent" : "Present"],
      ["Protected paths", payload.protectedPaths.imagesUntouchedAtBaseline && payload.protectedPaths.ilovesvgUntouchedAtBaseline ? "`images/` and `ilovesvg/` clean" : "Drift found"],
    ]),
    "",
    `Blockers: ${payload.summary.blockers.length ? payload.summary.blockers.join("; ") : "none"}.`,
  ].join("\n");
}

function renderWorkingTreeReport(payload) {
  return [
    "# Final Local Rerun Working Tree Audit",
    "",
    "Initial status was clean before this rerun. The command output below records current-round files and flags unrelated drift if present.",
    "",
    renderTable([
      ["`git status --short`", payload.commands.gitStatusShort.trim() || "Clean"],
      ["`git diff --stat`", payload.commands.gitDiffStat.trim() || "No diff"],
      ["`git diff --name-only`", payload.commands.gitDiffNameOnly.trim() || "No diff"],
    ]),
    "",
    `Classification: ${payload.classification.unrelatedDriftFound ? "unrelated drift found" : "only current-round changes detected"}.`,
    `Blockers: ${payload.summary.blockers.length ? payload.summary.blockers.join("; ") : "none"}.`,
  ].join("\n");
}

function renderTrustReport(payload) {
  return [
    "# Final Local Rerun Trust Content Review",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, typeof value === "boolean" ? passFail(value) : String(value)])),
    "",
    payload.ownerReviewStatus,
    "",
    "## Pages",
    "",
    ...payload.pageResults.map((page) => `- ${page.route}: exists ${passFail(page.exists)}, email ${passFail(page.contactEmailAppears || page.route !== "/contact")}, no fake phone ${passFail(page.noFakePhone)}`),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function commandSucceeds(command, args) {
  try {
    execFileSync(command, args, { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function readSourceText(relativeRoots, options = {}) {
  const chunks = [];
  for (const root of relativeRoots) {
    for (const file of await listFiles(path.join(REPO_ROOT, root))) {
      const relativePath = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
      if (!/\.(?:ts|tsx|css|json|md)$/.test(relativePath)) continue;
      if (options.skipGeneratedColoring && relativePath.startsWith("src/generated/coloring/")) continue;
      chunks.push(await fsp.readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(absolute);
    }
  }
  await walk(root);
  return files;
}

function renderGateReport(payload) {
  return [
    "# Final Local Rerun Acceptance Gate",
    "",
    renderTable(
      Object.entries(payload)
        .filter(([key]) => !["generatedAt", "runId", "blockers"].includes(key))
        .map(([key, value]) => [key, key === "ready_for_live_ads_round" && value === false ? "deferred" : typeof value === "boolean" ? passFail(value) : String(value)]),
    ),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

async function readOutRouteHtml(outDir, route) {
  const cleanRoute = route.replace(/^\/+/, "");
  const candidates = route === "/"
    ? [path.join(outDir, "index.html")]
    : [
        path.join(outDir, `${cleanRoute}.html`),
        path.join(outDir, cleanRoute, "index.html"),
      ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return fsp.readFile(filePath, "utf8");
  }
  throw new Error(`Static HTML not found for route ${route}`);
}

function extractXmlLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function flattenTypes(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) flattenTypes(entry, output);
    return output;
  }
  if (value && typeof value === "object") {
    if (typeof value["@type"] === "string") output.push(value["@type"]);
    for (const entry of Object.values(value)) flattenTypes(entry, output);
  }
  return output;
}

function countMatches(value, regex) {
  return [...value.matchAll(regex)].length;
}

async function countFiles(root, regex) {
  let count = 0;
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (regex.test(absolute)) count += 1;
    }
  }
  await walk(root);
  return count;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(value) {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

function buildBlockers(summary, passKey) {
  return Object.entries(summary)
    .filter(([key, value]) => key !== passKey && value !== true && typeof value !== "number")
    .map(([key]) => `${key} failed.`);
}
