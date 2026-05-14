#!/usr/bin/env node

import {
  ASSET_BASE_URL,
  CONTACT_EMAIL,
  EXPECTED_PREDEPLOY_COMMIT,
  EXPECTED_PREDEPLOY_SHORT_COMMIT,
  HTTP_ROUTES,
  SITE_URL,
  absoluteSiteUrl,
  bool,
  buildFinalContextCheck,
  fetchWithRedirects,
  hasForbiddenPublicLeak,
  hasSvgDownloadCopy,
  isSelfRedirect,
  renderTable,
  writeJson,
  writeReport,
} from "./final-live-utils.mjs";

const outputFiles = {
  contextManifest: "pipeline/manifests/final-live-context-check.json",
  contextReport: "pipeline/reports/final-live-context-check.md",
  freshnessManifest: "pipeline/manifests/final-live-deployment-freshness.json",
  freshnessReport: "pipeline/reports/final-live-deployment-freshness.md",
  httpManifest: "pipeline/manifests/final-live-http-results.json",
  httpReport: "pipeline/reports/final-live-http-report.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const context = await buildFinalContextCheck();
  await writeJson(outputFiles.contextManifest, context);
  await writeReport(outputFiles.contextReport, renderContextReport(context));

  const checks = [];
  for (const route of HTTP_ROUTES) {
    checks.push(await checkRoute(route));
  }

  const http = buildHttpResults(checks);
  await writeJson(outputFiles.httpManifest, http);
  await writeReport(outputFiles.httpReport, renderHttpReport(http));

  const freshness = buildFreshnessResults(http);
  await writeJson(outputFiles.freshnessManifest, freshness);
  await writeReport(outputFiles.freshnessReport, renderFreshnessReport(freshness));

  console.log(JSON.stringify({
    contextPassed: context.passed,
    routeCheckPassed: http.summary.routeCheckPassed,
    productionDeployCurrent: freshness.summary.productionDeployCurrent,
    imageSitemapLive: freshness.summary.liveImageSitemapExists,
    robotsReferencesImageSitemap: freshness.summary.liveRobotsReferencesImageSitemap,
    blockers: [...context.blockers, ...http.blockers, ...freshness.blockers],
  }, null, 2));
}

async function checkRoute(route) {
  const url = absoluteSiteUrl(route);
  const result = await fetchWithRedirects(url);
  const body = result.bodyText || "";
  const expectedMarker = getExpectedMarker(route);
  const staleSignals = getStaleSignals(route, body, result);
  return {
    route,
    url,
    status: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    bodySize: result.bodySize,
    redirectCount: result.redirects.length,
    redirects: result.redirects,
    selfRedirectDetected: isSelfRedirect(result),
    expectedMarker,
    expectedMarkerPresent: expectedMarker ? body.includes(expectedMarker) : true,
    containsRuntimeCount6352: /6,352|6352/.test(body),
    containsAssetBase: body.includes(ASSET_BASE_URL),
    containsJsonLd: /application\/ld\+json/i.test(body),
    containsOgImage: /property=["']og:image["']|property=og:image/i.test(body),
    containsFinalPrintBehaviorMarker: /Printable PDF is ready|Preparing printable PDF|Print controls|Download JPG|Download WebP|printOnePagePdf/i.test(body),
    containsRobotsRegularSitemap: body.includes(`${SITE_URL}/sitemap.xml`),
    containsRobotsImageSitemap: body.includes(`${SITE_URL}/image-sitemap.xml`),
    containsImageSitemapXml: /<image:image>|<image:loc>/i.test(body),
    containsWebpImageEntries: /\/webp\/.+\.webp/i.test(body),
    containsSvgDownload: hasSvgDownloadCopy(body),
    forbiddenLeakPresent: hasForbiddenPublicLeak(body),
    appApiReferencePresent: /\/api\//i.test(body),
    staleSignals,
    staleOrBlocked: result.status !== 200 || isSelfRedirect(result) || staleSignals.length > 0,
    error: result.error,
  };
}

function buildHttpResults(checks) {
  const root = checks.find((check) => check.route === "/");
  const nonAssetPages = checks.filter((check) => !["/sitemap.xml", "/image-sitemap.xml", "/robots.txt"].includes(check.route));
  const sitemap = checks.find((check) => check.route === "/sitemap.xml");
  const imageSitemap = checks.find((check) => check.route === "/image-sitemap.xml");
  const robots = checks.find((check) => check.route === "/robots.txt");
  const blockerChecks = checks.filter((check) => check.staleOrBlocked);
  const summary = {
    checkedUrlCount: checks.length,
    productionSiteReachable: root?.status === 200,
    allRequestedRoutesReachable: checks.every((check) => check.status === 200),
    nonAssetPagesReachable: nonAssetPages.every((check) => check.status === 200),
    routeMarkersPresent: nonAssetPages.every((check) => check.expectedMarkerPresent),
    selfRedirectDetected: checks.some((check) => check.selfRedirectDetected),
    selfRedirectUrls: checks.filter((check) => check.selfRedirectDetected).map((check) => check.url),
    forbiddenLeakPresent: checks.some((check) => check.forbiddenLeakPresent),
    appApiReferencePresent: checks.some((check) => check.appApiReferencePresent),
    svgDownloadLabelOrLinkPresent: checks.some((check) => check.containsSvgDownload),
    sitemapReachable: sitemap?.status === 200,
    imageSitemapReachable: imageSitemap?.status === 200 && imageSitemap.containsImageSitemapXml,
    robotsReachable: robots?.status === 200,
    robotsReferencesRegularSitemap: robots?.containsRobotsRegularSitemap === true,
    robotsReferencesImageSitemap: robots?.containsRobotsImageSitemap === true,
    livePagesContainRuntime6352: nonAssetPages.some((check) => check.containsRuntimeCount6352),
    livePagesUseCustomAssetBase: nonAssetPages.some((check) => check.containsAssetBase),
    livePagesIncludeJsonLd: nonAssetPages.some((check) => check.containsJsonLd),
    livePagesIncludeOgImageMetadata: nonAssetPages.some((check) => check.containsOgImage),
    livePagesIncludeFinalPrintDownloadUx: nonAssetPages.some((check) => check.containsFinalPrintBehaviorMarker),
    staleOrBlockedUrls: blockerChecks.map((check) => check.url),
  };
  summary.routeCheckPassed = [
    summary.productionSiteReachable,
    summary.nonAssetPagesReachable,
    summary.routeMarkersPresent,
    !summary.selfRedirectDetected,
    !summary.forbiddenLeakPresent,
    !summary.appApiReferencePresent,
    !summary.svgDownloadLabelOrLinkPresent,
  ].every(Boolean);

  const blockers = [];
  if (!summary.productionSiteReachable) blockers.push("Production root is not reachable.");
  if (!summary.nonAssetPagesReachable) blockers.push("One or more production pages failed HTTP 200.");
  if (!summary.routeMarkersPresent) blockers.push("One or more production pages did not contain expected route markers.");
  if (summary.selfRedirectDetected) blockers.push(`Self-redirects detected: ${summary.selfRedirectUrls.join(", ")}.`);
  if (summary.forbiddenLeakPresent) blockers.push("Live response includes localhost, r2.dev, or private storage leakage.");
  if (summary.appApiReferencePresent) blockers.push("Live response includes app/api references.");
  if (summary.svgDownloadLabelOrLinkPresent) blockers.push("Live response exposes SVG download copy.");

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-http-results",
    siteUrl: SITE_URL,
    expectedPredeployCommit: EXPECTED_PREDEPLOY_COMMIT,
    checkedRoutes: HTTP_ROUTES,
    checks,
    summary,
    blockers,
  };
}

function buildFreshnessResults(http) {
  const summary = {
    siteUrl: SITE_URL,
    expectedPredeployCommit: EXPECTED_PREDEPLOY_COMMIT,
    expectedPredeployShortCommit: EXPECTED_PREDEPLOY_SHORT_COMMIT,
    productionSiteReachable: http.summary.productionSiteReachable,
    liveAppearsToIncludeCommitBehavior: http.summary.livePagesContainRuntime6352 && http.summary.livePagesUseCustomAssetBase && http.summary.livePagesIncludeFinalPrintDownloadUx,
    livePagesIncludeFinalPrintDownloadUx: http.summary.livePagesIncludeFinalPrintDownloadUx,
    livePagesIncludeJsonLd: http.summary.livePagesIncludeJsonLd,
    livePagesIncludeOgImageMetadata: http.summary.livePagesIncludeOgImageMetadata,
    liveRobotsReferencesRegularSitemap: http.summary.robotsReferencesRegularSitemap,
    liveRobotsReferencesImageSitemap: http.summary.robotsReferencesImageSitemap,
    liveImageSitemapExists: http.summary.imageSitemapReachable,
    liveRegularSitemapExists: http.summary.sitemapReachable,
    noLocalhostLeakage: !http.summary.forbiddenLeakPresent,
    noR2DevOrPrivateStorageLeakage: !http.summary.forbiddenLeakPresent,
    noAppApiReferences: !http.summary.appApiReferencePresent,
    noDownloadSvgLabelsOrLinks: !http.summary.svgDownloadLabelOrLinkPresent,
  };
  summary.productionDeployCurrent = [
    summary.productionSiteReachable,
    summary.liveAppearsToIncludeCommitBehavior,
    summary.livePagesIncludeJsonLd,
    summary.livePagesIncludeOgImageMetadata,
    summary.liveRobotsReferencesRegularSitemap,
    summary.liveRobotsReferencesImageSitemap,
    summary.liveImageSitemapExists,
    summary.liveRegularSitemapExists,
    summary.noLocalhostLeakage,
    summary.noR2DevOrPrivateStorageLeakage,
    summary.noAppApiReferences,
    summary.noDownloadSvgLabelsOrLinks,
  ].every(Boolean);

  const blockers = [];
  if (!summary.productionDeployCurrent) blockers.push(`Production does not appear to fully serve commit ${EXPECTED_PREDEPLOY_SHORT_COMMIT} behavior.`);
  if (!summary.liveImageSitemapExists) blockers.push("Live /image-sitemap.xml is missing or not serving XML.");
  if (!summary.liveRobotsReferencesImageSitemap) blockers.push("Live robots.txt does not reference /image-sitemap.xml.");
  if (!summary.livePagesIncludeJsonLd) blockers.push("Live sampled pages do not include JSON-LD script tags.");
  if (!summary.livePagesIncludeOgImageMetadata) blockers.push("Live sampled pages do not include OG image metadata.");
  if (!summary.livePagesIncludeFinalPrintDownloadUx) blockers.push("Live pages do not expose final print/download UX markers.");
  if (blockers.length) blockers.push(`Owner action: trigger a fresh Netlify deploy from commit ${EXPECTED_PREDEPLOY_COMMIT} before GSC submission.`);

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-deployment-freshness",
    summary,
    blockers,
  };
}

function getExpectedMarker(route) {
  if (route === "/") return "I Love Coloring Page";
  if (route === "/coloring-pages") return "Coloring Pages";
  if (route === "/coloring-pages/animals") return "Animals";
  if (route === "/coloring-pages/t-rex") return "T-Rex";
  if (route === "/coloring-pages/dragons") return "Dragons";
  if (route === "/coloring-pages/christmas") return "Christmas";
  if (route === "/about") return "About";
  if (route === "/contact") return CONTACT_EMAIL;
  if (route === "/privacy") return "Privacy";
  if (route === "/terms") return "Terms";
  if (route === "/affiliate-disclosure") return "Affiliate";
  if (route === "/editorial-policy") return "Editorial";
  if (route === "/sitemap.xml") return "<urlset";
  if (route === "/image-sitemap.xml") return "<urlset";
  if (route === "/robots.txt") return "Sitemap:";
  return "";
}

function getStaleSignals(route, body, result) {
  const signals = [];
  if (result.status !== 200) signals.push(`status-${result.status}`);
  if (/I Love SVG|image-to-favicon-generator|routeManifestClientAssets|Vite-specific/i.test(body)) signals.push("wrong-project-text");
  if (/6,557|6557/.test(body) && !/6,352|6352/.test(body)) signals.push("old-runtime-count-6557");
  if (route === "/robots.txt" && !body.includes(`${SITE_URL}/image-sitemap.xml`)) signals.push("robots-missing-image-sitemap");
  if (route === "/image-sitemap.xml" && !/<image:image>|<image:loc>/i.test(body)) signals.push("image-sitemap-missing-image-entries");
  if (route !== "/image-sitemap.xml" && route !== "/sitemap.xml" && route !== "/robots.txt" && /Preview unavailable/i.test(body)) signals.push("preview-unavailable-visible");
  return signals;
}

function renderContextReport(payload) {
  return [
    "# Final Live Context Check",
    "",
    renderTable([
      ["Repository", bool(payload.summary.correctRepository)],
      ["Branch", payload.summary.branch],
      ["Expected branch", bool(payload.summary.branchMatchesExpected)],
      ["Predeploy commit exists", bool(payload.summary.expectedPredeployCommitExists)],
      ["Predeploy commit in HEAD history", bool(payload.summary.expectedPredeployCommitAncestorOfHead)],
      ["Static export configured", bool(payload.summary.staticExportConfigured)],
      ["app/api absent", bool(!payload.summary.appApiRoutePresent)],
      ["Runtime records", String(payload.summary.runtimeAvailableRecords)],
      ["Runtime indexable hubs", String(payload.summary.runtimeIndexableHubs)],
      ["Image sitemap exists locally", bool(payload.summary.imageSitemapExists)],
      ["OG images exist locally", `${bool(payload.summary.ogImagesExist)} (${payload.summary.ogImageCount})`],
      ["JSON-LD exists locally", bool(payload.summary.jsonLdExists)],
      ["Predeploy acceptance ready", bool(payload.summary.predeployAcceptanceReadyForDeploy)],
      ["Public defaults exist", bool(payload.summary.publicSafeDefaultsDoNotRequireNetlifyEnv)],
      ["SVG internal-only", bool(payload.summary.svgInternalOnly)],
      ["Public downloads PNG/JPG/WebP", bool(payload.summary.publicDownloadsArePngJpgWebp)],
      ["Live AdSense absent in source", bool(!payload.summary.liveAdSenseCodePresent)],
      ["images/ untouched", bool(payload.summary.imagesUntouched)],
      ["ilovesvg/ untouched", bool(payload.summary.ilovesvgUntouched)],
      ["Result", bool(payload.passed)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}`,
  ].join("\n");
}

function renderHttpReport(payload) {
  return [
    "# Final Live HTTP Report",
    "",
    renderTable([
      ["Checked URLs", String(payload.summary.checkedUrlCount)],
      ["Production site reachable", bool(payload.summary.productionSiteReachable)],
      ["Non-asset pages reachable", bool(payload.summary.nonAssetPagesReachable)],
      ["Route markers present", bool(payload.summary.routeMarkersPresent)],
      ["Self-redirect detected", bool(payload.summary.selfRedirectDetected)],
      ["Regular sitemap reachable", bool(payload.summary.sitemapReachable)],
      ["Image sitemap reachable", bool(payload.summary.imageSitemapReachable)],
      ["Robots reachable", bool(payload.summary.robotsReachable)],
      ["Robots references regular sitemap", bool(payload.summary.robotsReferencesRegularSitemap)],
      ["Robots references image sitemap", bool(payload.summary.robotsReferencesImageSitemap)],
      ["Runtime 6,352 in live pages", bool(payload.summary.livePagesContainRuntime6352)],
      ["Custom asset base in live pages", bool(payload.summary.livePagesUseCustomAssetBase)],
      ["JSON-LD in live pages", bool(payload.summary.livePagesIncludeJsonLd)],
      ["OG image metadata in live pages", bool(payload.summary.livePagesIncludeOgImageMetadata)],
      ["Final print/download UX markers", bool(payload.summary.livePagesIncludeFinalPrintDownloadUx)],
      ["Route check passed", bool(payload.summary.routeCheckPassed)],
    ]),
    "",
    "## Route Results",
    "",
    ...payload.checks.map((check) => `- ${check.url}: status ${check.status}, final ${check.finalUrl}, type ${check.contentType || "none"}, bytes ${check.bodySize}, stale/blocker ${check.staleOrBlocked ? "yes" : "no"}`),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}

function renderFreshnessReport(payload) {
  return [
    "# Final Live Deployment Freshness",
    "",
    renderTable([
      ["Production site reachable", bool(payload.summary.productionSiteReachable)],
      ["Appears to include commit behavior", bool(payload.summary.liveAppearsToIncludeCommitBehavior)],
      ["Final print/download UX visible", bool(payload.summary.livePagesIncludeFinalPrintDownloadUx)],
      ["JSON-LD present", bool(payload.summary.livePagesIncludeJsonLd)],
      ["OG image metadata present", bool(payload.summary.livePagesIncludeOgImageMetadata)],
      ["Robots references /sitemap.xml", bool(payload.summary.liveRobotsReferencesRegularSitemap)],
      ["Robots references /image-sitemap.xml", bool(payload.summary.liveRobotsReferencesImageSitemap)],
      ["Live /image-sitemap.xml exists", bool(payload.summary.liveImageSitemapExists)],
      ["No localhost/r2/private leakage", bool(payload.summary.noLocalhostLeakage && payload.summary.noR2DevOrPrivateStorageLeakage)],
      ["No app/api references", bool(payload.summary.noAppApiReferences)],
      ["No SVG download labels", bool(payload.summary.noDownloadSvgLabelsOrLinks)],
      ["Production deploy current", bool(payload.summary.productionDeployCurrent)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}
