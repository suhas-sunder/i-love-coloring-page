#!/usr/bin/env node

import {
  ASSET_BASE_URL,
  EXPECTED_RUNTIME_RECORDS,
  SITE_URL,
  absoluteSiteUrl,
  bool,
  extractImageLocs,
  extractXmlLocs,
  fetchWithRedirects,
  hasForbiddenPublicLeak,
  normalizeComparableUrl,
  readJson,
  renderTable,
  writeJson,
  writeReport,
} from "./final-live-utils.mjs";

const outputFiles = {
  manifest: "pipeline/manifests/final-live-sitemap-gsc-results.json",
  report: "pipeline/reports/final-live-sitemap-gsc-report.md",
  readinessManifest: "pipeline/manifests/final-gsc-submission-readiness.json",
  guide: "pipeline/reports/final-gsc-submission-guide.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const sitemap = await fetchWithRedirects(`${SITE_URL}/sitemap.xml`, { accept: "application/xml,text/xml,*/*" });
  const imageSitemap = await fetchWithRedirects(`${SITE_URL}/image-sitemap.xml`, { accept: "application/xml,text/xml,*/*" });
  const robots = await fetchWithRedirects(`${SITE_URL}/robots.txt`, { accept: "text/plain,*/*" });
  const results = await buildResults(sitemap, imageSitemap, robots);
  await writeJson(outputFiles.manifest, results);
  await writeReport(outputFiles.report, renderReport(results));

  const readiness = buildReadiness(results);
  await writeJson(outputFiles.readinessManifest, readiness);
  await writeReport(outputFiles.guide, renderGuide(readiness));

  console.log(JSON.stringify({
    regularSitemapPassed: results.summary.regularSitemapPassed,
    imageSitemapPassed: results.summary.imageSitemapPassed,
    robotsPassed: results.summary.robotsPassed,
    readyForOwnerGscSubmission: readiness.ready_for_owner_gsc_submission,
    blockers: readiness.blockers,
  }, null, 2));
}

async function buildResults(sitemapResponse, imageSitemapResponse, robotsResponse) {
  const runtimeRoutes = await readJson("src/generated/coloring/runtime-routes.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const sitemapLocs = extractXmlLocs(sitemapResponse.bodyText || "");
  const imageLocs = extractImageLocs(imageSitemapResponse.bodyText || "");
  const normalizedSitemapLocs = new Set(sitemapLocs.map(normalizeComparableUrl));
  const expectedRoutes = [
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/t-rex",
    "/coloring-pages/dragons",
    "/coloring-pages/christmas",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/affiliate-disclosure",
    "/editorial-policy",
  ];
  const missingExpectedRoutes = expectedRoutes.filter((route) => !normalizedSitemapLocs.has(normalizeComparableUrl(absoluteSiteUrl(route))));
  const expectedRuntimeRouteMisses = (runtimeRoutes.routes || [])
    .filter((route) => route.sitemap)
    .filter((route) => !normalizedSitemapLocs.has(normalizeComparableUrl(absoluteSiteUrl(route.path))))
    .map((route) => route.path);
  const backlogRoutesIncluded = (runtimeHubs.backlogHubs || [])
    .map((hub) => `/coloring-pages/${hub.slug}`)
    .filter((route) => normalizedSitemapLocs.has(normalizeComparableUrl(absoluteSiteUrl(route))));
  const sectionOnlyRoutesIncluded = (runtimeHubs.sectionOnlyTopics || [])
    .map((topic) => `/coloring-pages/${topic.slug}`)
    .filter((route) => normalizedSitemapLocs.has(normalizeComparableUrl(absoluteSiteUrl(route))));
  const perImageRouteLocs = sitemapLocs.filter((loc) => /\/coloring-pages\/[^/]+\/(?!page\/)[^/]+/i.test(new URL(loc).pathname));
  const deferredWebpSubpaths = (deferred.records || [])
    .map((record) => record.proposedFutureWebpObjectKey || record.currentWebpLocalPath || "")
    .filter(Boolean)
    .map((value) => value.replace(/^.*coloring-pages\//, ""));
  const deferredImageLocs = deferredWebpSubpaths.filter((subpath) => imageLocs.some((loc) => loc.includes(subpath)));
  const duplicatePrefixLocs = [...sitemapLocs, ...imageLocs].filter((loc) => /coloring-pages\/coloring-pages/i.test(loc));

  const summary = {
    sitemapStatus: sitemapResponse.status,
    imageSitemapStatus: imageSitemapResponse.status,
    robotsStatus: robotsResponse.status,
    sitemapLocCount: sitemapLocs.length,
    imageSitemapImageLocCount: imageLocs.length,
    imageSitemapWebpEntryCount: imageLocs.filter((loc) => /\/webp\/.+\.webp(?:$|\?)/i.test(loc)).length,
    imageSitemapSvgUrlCount: imageLocs.filter((loc) => /\.svg(?:$|\?)/i.test(loc)).length,
    imageSitemapPngOrThumbUrlCount: imageLocs.filter((loc) => /\/(?:png|thumbs)\//i.test(loc) || /\.(?:png|jpg|jpeg)(?:$|\?)/i.test(loc)).length,
    regularSitemapLoads: sitemapResponse.status === 200 && /xml/i.test(sitemapResponse.contentType) && sitemapLocs.length > 0,
    imageSitemapLoads: imageSitemapResponse.status === 200 && /xml/i.test(imageSitemapResponse.contentType) && imageLocs.length > 0,
    robotsLoads: robotsResponse.status === 200 && /text|plain/i.test(robotsResponse.contentType),
    robotsReferencesRegularSitemap: robotsResponse.bodyText.includes(`${SITE_URL}/sitemap.xml`),
    robotsReferencesImageSitemap: robotsResponse.bodyText.includes(`${SITE_URL}/image-sitemap.xml`),
    regularSitemapContainsExpectedPublicRoutes: missingExpectedRoutes.length === 0,
    regularSitemapIncludesTrustPages: ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"].every((route) =>
      normalizedSitemapLocs.has(normalizeComparableUrl(absoluteSiteUrl(route))),
    ),
    regularSitemapExcludesPerImageRoutes: perImageRouteLocs.length === 0,
    regularSitemapExcludesPhase2BacklogRoutes: backlogRoutesIncluded.length === 0,
    regularSitemapExcludesSectionOnlyRoutes: sectionOnlyRoutesIncluded.length === 0,
    runtimeSitemapRoutesPresent: expectedRuntimeRouteMisses.length === 0,
    imageSitemapHasExpectedWebpCount: imageLocs.filter((loc) => /\/webp\/.+\.webp(?:$|\?)/i.test(loc)).length === EXPECTED_RUNTIME_RECORDS,
    imageSitemapExcludesSvgUrls: imageLocs.every((loc) => !/\.svg(?:$|\?)/i.test(loc)),
    imageSitemapExcludesPngAndThumbUrls: imageLocs.every((loc) => !/\/(?:png|thumbs)\//i.test(loc) && !/\.(?:png|jpg|jpeg)(?:$|\?)/i.test(loc)),
    imageSitemapUsesAssetBase: imageLocs.length > 0 && imageLocs.every((loc) => loc.startsWith(`${ASSET_BASE_URL}/webp/`)),
    imageSitemapExcludesDeferredRecords: deferredImageLocs.length === 0,
    noLocalhostR2DevOrPrivateStorage: !hasForbiddenPublicLeak(`${sitemapResponse.bodyText}\n${imageSitemapResponse.bodyText}\n${robotsResponse.bodyText}`),
    noDuplicateColoringPagesPrefix: duplicatePrefixLocs.length === 0,
  };
  summary.regularSitemapPassed = [
    summary.regularSitemapLoads,
    summary.regularSitemapContainsExpectedPublicRoutes,
    summary.regularSitemapIncludesTrustPages,
    summary.regularSitemapExcludesPerImageRoutes,
    summary.regularSitemapExcludesPhase2BacklogRoutes,
    summary.regularSitemapExcludesSectionOnlyRoutes,
    summary.runtimeSitemapRoutesPresent,
    summary.noLocalhostR2DevOrPrivateStorage,
    summary.noDuplicateColoringPagesPrefix,
  ].every(Boolean);
  summary.imageSitemapPassed = [
    summary.imageSitemapLoads,
    summary.imageSitemapHasExpectedWebpCount,
    summary.imageSitemapExcludesSvgUrls,
    summary.imageSitemapExcludesPngAndThumbUrls,
    summary.imageSitemapUsesAssetBase,
    summary.imageSitemapExcludesDeferredRecords,
    summary.noLocalhostR2DevOrPrivateStorage,
    summary.noDuplicateColoringPagesPrefix,
  ].every(Boolean);
  summary.robotsPassed = [
    summary.robotsLoads,
    summary.robotsReferencesRegularSitemap,
    summary.robotsReferencesImageSitemap,
    summary.noLocalhostR2DevOrPrivateStorage,
  ].every(Boolean);

  const blockers = [];
  if (!summary.regularSitemapPassed) blockers.push("Live regular sitemap is not GSC-ready.");
  if (!summary.imageSitemapPassed) blockers.push("Live image sitemap is not GSC-ready.");
  if (!summary.robotsPassed) blockers.push("Live robots.txt is not GSC-ready.");

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-sitemap-gsc-results",
    urls: {
      sitemap: `${SITE_URL}/sitemap.xml`,
      imageSitemap: `${SITE_URL}/image-sitemap.xml`,
      robots: `${SITE_URL}/robots.txt`,
    },
    summary,
    missingExpectedRoutes,
    expectedRuntimeRouteMisses: expectedRuntimeRouteMisses.slice(0, 50),
    expectedRuntimeRouteMissCount: expectedRuntimeRouteMisses.length,
    backlogRoutesIncluded,
    sectionOnlyRoutesIncluded,
    perImageRouteLocs,
    deferredImageLocs: deferredImageLocs.slice(0, 20),
    duplicatePrefixLocs,
    blockers,
  };
}

function buildReadiness(results) {
  const blockers = [...results.blockers];
  const readiness = {
    generatedAt: new Date().toISOString(),
    runId: "final-gsc-submission-readiness",
    regular_sitemap_ready: results.summary.regularSitemapPassed,
    image_sitemap_ready: results.summary.imageSitemapPassed,
    robots_ready: results.summary.robotsPassed,
    canonicals_ready: false,
    no_per_image_routes: results.summary.regularSitemapExcludesPerImageRoutes,
    trust_pages_ready_for_owner_review: results.summary.regularSitemapIncludesTrustPages,
    ready_for_owner_gsc_submission: false,
    blockers,
    manualSubmissionUrls: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/image-sitemap.xml`,
    ],
  };
  readiness.ready_for_owner_gsc_submission = [
    readiness.regular_sitemap_ready,
    readiness.image_sitemap_ready,
    readiness.robots_ready,
    readiness.no_per_image_routes,
  ].every(Boolean);
  if (!readiness.ready_for_owner_gsc_submission && blockers.length === 0) blockers.push("One or more GSC readiness fields is false.");
  return readiness;
}

function renderReport(payload) {
  return [
    "# Final Live Sitemap And GSC Check",
    "",
    renderTable([
      ["Regular sitemap status", String(payload.summary.sitemapStatus)],
      ["Image sitemap status", String(payload.summary.imageSitemapStatus)],
      ["Robots status", String(payload.summary.robotsStatus)],
      ["Regular sitemap URL count", String(payload.summary.sitemapLocCount)],
      ["Image sitemap WebP entries", String(payload.summary.imageSitemapWebpEntryCount)],
      ["Robots references /sitemap.xml", bool(payload.summary.robotsReferencesRegularSitemap)],
      ["Robots references /image-sitemap.xml", bool(payload.summary.robotsReferencesImageSitemap)],
      ["Expected public routes present", bool(payload.summary.regularSitemapContainsExpectedPublicRoutes)],
      ["Trust pages included", bool(payload.summary.regularSitemapIncludesTrustPages)],
      ["Per-image routes excluded", bool(payload.summary.regularSitemapExcludesPerImageRoutes)],
      ["Backlog routes excluded", bool(payload.summary.regularSitemapExcludesPhase2BacklogRoutes)],
      ["Section-only routes excluded", bool(payload.summary.regularSitemapExcludesSectionOnlyRoutes)],
      ["Image sitemap excludes SVG", bool(payload.summary.imageSitemapExcludesSvgUrls)],
      ["Image sitemap excludes PNG/thumb", bool(payload.summary.imageSitemapExcludesPngAndThumbUrls)],
      ["No localhost/r2/private URLs", bool(payload.summary.noLocalhostR2DevOrPrivateStorage)],
      ["Regular sitemap passed", bool(payload.summary.regularSitemapPassed)],
      ["Image sitemap passed", bool(payload.summary.imageSitemapPassed)],
      ["Robots passed", bool(payload.summary.robotsPassed)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}

function renderGuide(readiness) {
  const canSubmit = readiness.ready_for_owner_gsc_submission;
  return [
    "# Final GSC Submission Guide",
    "",
    `Status: ${canSubmit ? "ready for owner manual submission" : "blocked, do not submit yet"}.`,
    "",
    "Manual steps for the owner:",
    "",
    "1. Confirm the Google Search Console property exists for `https://www.ilovecoloringpage.com`.",
    "2. Submit `https://www.ilovecoloringpage.com/sitemap.xml`.",
    "3. Submit `https://www.ilovecoloringpage.com/image-sitemap.xml`.",
    "4. Keep both sitemaps submitted. Do not submit per-image pages.",
    "5. Inspect key URLs after submission: `/`, `/coloring-pages`, `/coloring-pages/animals`, `/coloring-pages/t-rex`, and `/coloring-pages/christmas`.",
    "6. Monitor indexing, image indexing, crawl errors, duplicate canonical warnings, and blocked resources.",
    "7. Do not expect instant indexing. Recheck after several days.",
    "",
    `Blockers: ${readiness.blockers.length ? readiness.blockers.join(" ") : "none"}`,
  ].join("\n");
}
