#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const RUN_ID = "post-long-tail-r2-metadata-sync";
const REQUIRED_COMMIT = "3359ace5a766726e2bdf439230fb86bf8a46b3a7";
const EXPECTED_BRANCH = "ver-5-deployed-may-13-2026";
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_RUNTIME_HUB_COUNT = 163;
const EXPECTED_RUNTIME_ROUTE_COUNT = 163;
const EXPECTED_PROMOTED_COUNT = 32;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const TRUST_PAGE_COUNT = 6;
const FORBIDDEN_SCHEMA_TYPES = ["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"];

const OUTPUTS = {
  context: ["pipeline/manifests/post-long-tail-r2-context-check.json", "pipeline/reports/post-long-tail-r2-context-check.md"],
  hubAudit: ["pipeline/manifests/post-long-tail-r2-promoted-hub-audit.json", "pipeline/reports/post-long-tail-r2-promoted-hub-audit.md"],
  sitemap: ["pipeline/manifests/post-long-tail-r2-sitemap-sync.json", "pipeline/reports/post-long-tail-r2-sitemap-sync-report.md"],
  imageSitemap: ["pipeline/manifests/post-long-tail-r2-image-sitemap-sync.json", "pipeline/reports/post-long-tail-r2-image-sitemap-sync-report.md"],
  og: ["pipeline/manifests/post-long-tail-r2-og-sync.json", "pipeline/reports/post-long-tail-r2-og-sync-report.md"],
  jsonld: ["pipeline/manifests/post-long-tail-r2-jsonld-sync.json", "pipeline/reports/post-long-tail-r2-jsonld-sync-report.md"],
  nav: ["pipeline/manifests/post-long-tail-r2-navigation-search-audit.json", "pipeline/reports/post-long-tail-r2-navigation-search-audit.md"],
  acceptance: ["pipeline/manifests/post-long-tail-r2-acceptance-gate.json", "pipeline/reports/post-long-tail-r2-acceptance-gate.md"],
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const state = await loadState();
  const context = await buildContextCheck(state);
  const hubAudit = await buildPromotedHubAudit(state);
  const sitemap = buildSitemapSync(state);
  const imageSitemap = buildImageSitemapSync(state);
  const og = await buildOgSync(state);
  const jsonld = buildJsonLdSync(state);
  const nav = buildNavigationSearchAudit(state);
  const acceptance = buildAcceptanceGate({ context, hubAudit, sitemap, imageSitemap, og, jsonld, nav });

  await writePair(OUTPUTS.context, context, renderSummaryReport("Post Long-Tail R2 Context Check", context.summary, context.blockers));
  await writePair(OUTPUTS.hubAudit, hubAudit, renderHubAuditReport(hubAudit));
  await writePair(OUTPUTS.sitemap, sitemap, renderSummaryReport("Post Long-Tail R2 Sitemap Sync", sitemap.summary, sitemap.blockers));
  await writePair(OUTPUTS.imageSitemap, imageSitemap, renderSummaryReport("Post Long-Tail R2 Image Sitemap Sync", imageSitemap.summary, imageSitemap.blockers));
  await writePair(OUTPUTS.og, og, renderSummaryReport("Post Long-Tail R2 OG Sync", og.summary, og.blockers));
  await writePair(OUTPUTS.jsonld, jsonld, renderSummaryReport("Post Long-Tail R2 JSON-LD Sync", jsonld.summary, jsonld.blockers));
  await writePair(OUTPUTS.nav, nav, renderNavigationReport(nav));
  await writePair(OUTPUTS.acceptance, acceptance, renderAcceptanceReport(acceptance));

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        promotedHubCount: hubAudit.summary.promotedHubCount,
        regularSitemapPassed: sitemap.summary.regularSitemapPassed,
        imageSitemapPassed: imageSitemap.summary.imageSitemapPassed,
        ogImagesPassed: og.summary.ogImagesPassed,
        jsonldPassed: jsonld.summary.jsonldPassed,
        navigationSearchPassed: nav.summary.navigationSearchPassed,
        blockers: acceptance.blockers,
      },
      null,
      2,
    ),
  );

  if (acceptance.blockers.length > 0) process.exitCode = 1;
}

async function loadState() {
  const [
    packageJson,
    runtimeAvailable,
    runtimeDeferred,
    runtimeHubs,
    runtimeRoutes,
    runtimeSiteMap,
    runtimeHubItems,
    runtimeSeoPages,
    runtimeHubSeoContent,
    runtimeSearchIndex,
    runtimeSocialMetadata,
    internalLinking,
    promotedHubs,
    manualReview,
    backlog,
    rejected,
    ogImages,
    jsonLdRouteData,
    imageSitemapData,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("src/generated/coloring/runtime-available-items.json"),
    readJson("src/generated/coloring/runtime-deferred-items.json"),
    readJson("src/generated/coloring/runtime-hubs.json"),
    readJson("src/generated/coloring/runtime-routes.json"),
    readJson("src/generated/coloring/runtime-site-map.json"),
    readJson("src/generated/coloring/runtime-hub-items.json"),
    readJson("src/generated/coloring/runtime-seo-pages.json"),
    readJson("src/generated/coloring/runtime-hub-seo-content.json"),
    readJson("src/generated/coloring/runtime-search-index.json"),
    readJson("src/generated/coloring/runtime-social-metadata.json"),
    readJson("src/generated/coloring/internal-linking.json"),
    readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json"),
    readJson("pipeline/manifests/long-tail-round-2-manual-review-candidates.json"),
    readJson("pipeline/manifests/long-tail-round-2-backlog-candidates.json"),
    readJson("pipeline/manifests/long-tail-round-2-rejected-candidates.json"),
    readJson("src/generated/coloring/og-images.json"),
    readJson("pipeline/manifests/jsonld-route-data.json"),
    readJson("pipeline/manifests/image-sitemap-data.json"),
  ]);

  const nextConfig = await readText("next.config.mjs");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const imageSitemapXml = await readText("public/image-sitemap.xml");
  const outSitemapXml = existsSync(path.join(REPO_ROOT, "out", "sitemap.xml")) ? await readText("out/sitemap.xml") : "";
  const appAndSrcText = await readProjectText(["app", "src"], { excludeGenerated: true });

  return {
    packageJson,
    runtimeAvailable,
    runtimeDeferred,
    runtimeHubs,
    runtimeRoutes,
    runtimeSiteMap,
    runtimeHubItems,
    runtimeSeoPages,
    runtimeHubSeoContent,
    runtimeSearchIndex,
    runtimeSocialMetadata,
    internalLinking,
    promotedHubs,
    manualReview,
    backlog,
    rejected,
    ogImages,
    jsonLdRouteData,
    imageSitemapData,
    nextConfig,
    browserDownloads,
    downloadMenu,
    siteConfig,
    siteNav,
    imageSitemapXml,
    outSitemapXml,
    appAndSrcText,
    itemById: new Map((runtimeAvailable.items || []).map((item) => [item.assetId, item])),
    deferredAssetIds: new Set((runtimeDeferred.records || runtimeDeferred.items || []).map((record) => record.assetId)),
    hubBySlug: new Map((runtimeHubs.hubs || []).map((hub) => [hub.slug, hub])),
    hubById: new Map((runtimeHubs.hubs || []).map((hub) => [hub.hubId, hub])),
    routeByPath: new Map((runtimeRoutes.routes || []).map((route) => [route.path, route])),
    siteMapPathSet: new Set((runtimeSiteMap.entries || []).map((entry) => entry.path)),
    seoPageByPath: new Map((runtimeSeoPages.pages || []).map((page) => [page.path, page])),
    hubSeoById: new Map((runtimeHubSeoContent.hubs || []).map((entry) => [entry.hubId, entry])),
    internalLinksByPath: new Map((internalLinking.pages || []).map((page) => [page.path, page])),
    jsonLdByPath: new Map((jsonLdRouteData.routes || []).map((entry) => [entry.path, entry])),
    imageSitemapPageBySlug: new Map((imageSitemapData.pages || []).map((page) => [page.hubSlug, page])),
  };
}

async function buildContextCheck(state) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim().replace(/\\/g, "/");
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const requiredCommitExists = await commitExists(REQUIRED_COMMIT);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const publicMediaOutsideApproved = publicFiles.filter((file) => {
    const normalized = normalizePath(path.relative(REPO_ROOT, file));
    if (normalized === "public/image-sitemap.xml") return false;
    if (/^public\/og\/.+\.jpe?g$/i.test(normalized)) return false;
    return /\.(?:svg|png|jpe?g|webp|gif|xml)$/i.test(normalized);
  });
  const publicDownloadFormats = getPublicDownloadFormats(`${state.browserDownloads}\n${state.downloadMenu}`);
  const imageSitemapEntryCount = countMatches(state.imageSitemapXml, /<image:loc>/g);
  const summary = {
    correctRepository: path.basename(repoRoot) === "i-love-coloring-page" && state.packageJson.name === "i-love-coloring-page",
    repoRoot,
    currentBranch: branch,
    branchCorrect: branch === EXPECTED_BRANCH,
    head,
    requiredCommit: REQUIRED_COMMIT,
    requiredCommitExists,
    appApiAbsent: !existsSync(path.join(REPO_ROOT, "app", "api")),
    staticExportConfigured: /output:\s*["']export["']/.test(state.nextConfig),
    runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
    runtimeAvailableRecords: state.runtimeAvailable.items.length,
    runtimeHubCount: state.runtimeHubs.hubs.length,
    runtimeSitemapRouteCount: state.runtimeSiteMap.entries.length,
    imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    imageSitemapWebpEntries: imageSitemapEntryCount,
    ogImagesExist: existsSync(path.join(REPO_ROOT, "public", "og", "home.jpg")) && existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "og-images.json")),
    jsonLdExists: existsSync(path.join(REPO_ROOT, "src", "lib", "seo", "jsonLd.ts")) && existsSync(path.join(REPO_ROOT, "pipeline", "manifests", "jsonld-route-data.json")),
    siteUrlDefaultPresent: state.siteConfig.includes(SITE_URL),
    assetBaseUrlDefaultPresent: state.siteConfig.includes(ASSET_BASE_URL),
    contactEmailDefaultPresent: state.siteConfig.includes(CONTACT_EMAIL),
    svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${state.browserDownloads}\n${state.downloadMenu}`),
    publicDownloads: publicDownloadFormats,
    liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(state.appAndSrcText),
    imagesStatus: await gitStatusFor("images"),
    ilovesvgStatus: await gitStatusFor("ilovesvg"),
    publicMediaOutsideApproved,
  };
  const blockers = [];
  if (!summary.correctRepository) blockers.push("Repository identity mismatch.");
  if (!summary.branchCorrect) blockers.push("Unexpected branch.");
  if (!summary.requiredCommitExists) blockers.push("Required Long-Tail Round 2 commit was not found.");
  if (!summary.appApiAbsent) blockers.push("app/api exists.");
  if (!summary.staticExportConfigured) blockers.push("Static export is not configured.");
  if (summary.runtimeAvailableRecords !== EXPECTED_AVAILABLE_RECORDS) blockers.push("Runtime available record count changed.");
  if (summary.runtimeHubCount !== EXPECTED_RUNTIME_HUB_COUNT) blockers.push("Runtime hub count is not 163.");
  if (summary.runtimeSitemapRouteCount !== EXPECTED_RUNTIME_ROUTE_COUNT) blockers.push("Runtime sitemap route count is not 163.");
  if (summary.imageSitemapWebpEntries !== EXPECTED_IMAGE_SITEMAP_ENTRIES) blockers.push("Image sitemap does not have 6,352 image entries.");
  if (!summary.ogImagesExist) blockers.push("OG image metadata or files are missing.");
  if (!summary.jsonLdExists) blockers.push("JSON-LD integration artifacts are missing.");
  if (!summary.siteUrlDefaultPresent || !summary.assetBaseUrlDefaultPresent || !summary.contactEmailDefaultPresent) blockers.push("Public-safe defaults are missing.");
  if (!summary.svgInternalOnly) blockers.push("SVG appears to be exposed as a user-facing download.");
  if (!["PNG", "JPG", "WebP"].every((format) => summary.publicDownloads.includes(format))) blockers.push("PNG/JPG/WebP download controls are not all present.");
  if (summary.liveAdsenseCodePresent) blockers.push("Live AdSense code appears present.");
  if (summary.imagesStatus || summary.ilovesvgStatus) blockers.push("images/ or ilovesvg/ has git status drift.");
  if (summary.publicMediaOutsideApproved.length > 0) blockers.push("Public media outside approved XML/OG assets exists.");
  return { generatedAt: now(), runId: "post-long-tail-r2-context-check", summary, blockers };
}

async function buildPromotedHubAudit(state) {
  const rows = [];
  for (const promoted of state.promotedHubs.hubs) {
    const slug = promoted.slug;
    const routePath = `/coloring-pages/${slug}`;
    const hub = state.hubBySlug.get(slug);
    const route = state.routeByPath.get(routePath);
    const hubItemMappedCount = hub ? countHubItemMappings(state, hub.hubId) : 0;
    const seoPage = state.seoPageByPath.get(routePath);
    const seoContent = hub ? state.hubSeoById.get(hub.hubId) : null;
    const internalLinks = state.internalLinksByPath.get(routePath);
    const og = state.ogImages.metadataByPath?.[routePath];
    const jsonLd = state.jsonLdByPath.get(routePath);
    const imageSitemapPage = state.imageSitemapPageBySlug.get(slug);
    const ogPath = og?.ogImagePath ? og.ogImagePath.replace(/^\//, "public/") : "";
    const checks = {
      routeExists: Boolean(route),
      slugCorrect: hub?.slug === slug,
      titleClean: Boolean(hub?.title) && !/chatgpt|failed|timestamp|^untitled/i.test(hub.title),
      assetCountCorrect: hub?.assetCount === promoted.assetCount && hub?.assetIds?.length === promoted.assetCount,
      hubItemMappingExists: hubItemMappedCount === promoted.assetCount,
      routeMetadataExists: Boolean(seoPage),
      seoContentExists: Boolean(seoContent),
      internalLinksExist: Boolean(internalLinks && internalLinks.links?.length > 0),
      moreMenuSearchCanFind: Boolean(hub && route),
      sitemapIncludes: state.siteMapPathSet.has(routePath),
      imageSitemapReferencesHubUrl: Boolean(imageSitemapPage && imageSitemapPage.imageCount > 0),
      ogImageExists: Boolean(og && ogPath && existsSync(path.join(REPO_ROOT, ogPath))),
      jsonLdExists: Boolean(jsonLd),
      jsonLdCanonicalCorrect: Boolean(jsonLd && jsonLd.jsonLd && JSON.stringify(jsonLd.jsonLd).includes(`${SITE_URL}${routePath}`)),
      noPerImageRoute: routePath.split("/").length === 3 && !/asset-|__|#/.test(routePath),
      noDeferredRecords: Boolean(hub) && hub.assetIds.every((assetId) => !state.deferredAssetIds.has(assetId)),
      noSvgDownload: !/Download SVG|downloadSvg|svgDownload/i.test(`${state.browserDownloads}\n${state.downloadMenu}`),
    };
    rows.push({
      slug,
      title: hub?.title || promoted.title,
      route: routePath,
      assetCount: hub?.assetCount ?? promoted.assetCount,
      promotedAssetCount: promoted.assetCount,
      hubItemMappedCount,
      imageSitemapImageCount: imageSitemapPage?.imageCount || 0,
      ogImagePath: og?.ogImagePath || null,
      jsonLdSchemaTypes: jsonLd?.schemaTypes || [],
      internalLinkCount: internalLinks?.links?.length || 0,
      checks,
      passed: Object.values(checks).every(Boolean),
    });
  }
  const summary = {
    promotedHubCount: state.promotedHubs.hubs.length,
    passedHubCount: rows.filter((row) => row.passed).length,
    failedHubCount: rows.filter((row) => !row.passed).length,
    allPromotedHubsPassed: rows.every((row) => row.passed),
  };
  const blockers = rows.filter((row) => !row.passed).map((row) => `${row.slug} failed promoted hub audit.`);
  return { generatedAt: now(), runId: "post-long-tail-r2-promoted-hub-audit", summary, hubs: rows, blockers };
}

function buildSitemapSync(state) {
  const promotedPaths = state.promotedHubs.hubs.map((hub) => `/coloring-pages/${hub.slug}`);
  const runtimePaths = state.runtimeSiteMap.entries.map((entry) => entry.path);
  const runtimePathSet = new Set(runtimePaths);
  const routePaths = state.runtimeRoutes.routes.map((route) => route.path);
  const manualRoutes = state.manualReview.candidates.map((candidate) => `/coloring-pages/${candidate.slug}`);
  const backlogRoutes = state.backlog.candidates.map((candidate) => `/coloring-pages/${candidate.slug}`);
  const rejectedRoutedCandidates = state.rejected.candidates.filter((candidate) => runtimePathSet.has(`/coloring-pages/${candidate.slug}`));
  const rejectedRouteLeaks = rejectedRoutedCandidates.filter(
    (candidate) => !/existing hub duplicate|reordered duplicate/i.test(candidate.reason || ""),
  );
  const outLocs = [...state.outSitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const summary = {
    promotedHubCount: state.promotedHubs.hubs.length,
    promotedRoutesIncluded: promotedPaths.every((routePath) => runtimePathSet.has(routePath)),
    locCount: runtimePaths.length,
    expectedRuntimeLocCount: EXPECTED_RUNTIME_ROUTE_COUNT,
    expectedStaticExportLocCount: 1 + EXPECTED_RUNTIME_ROUTE_COUNT + TRUST_PAGE_COUNT,
    outSitemapLocCount: outLocs.length || null,
    outSitemapIncludesPromotedRoutes: outLocs.length ? promotedPaths.every((routePath) => outLocs.includes(`${SITE_URL}${routePath}`)) : null,
    manualReviewRoutesIncludedCount: manualRoutes.filter((routePath) => runtimePathSet.has(routePath)).length,
    backlogRoutesIncludedCount: backlogRoutes.filter((routePath) => runtimePathSet.has(routePath)).length,
    rejectedRoutesIncludedCount: rejectedRoutedCandidates.length,
    rejectedRouteLeakCount: rejectedRouteLeaks.length,
    rejectedRoutedExistingDuplicateCount: rejectedRoutedCandidates.length - rejectedRouteLeaks.length,
    noManualReviewRoutes: manualRoutes.every((routePath) => !runtimePathSet.has(routePath)),
    noBacklogRoutes: backlogRoutes.every((routePath) => !runtimePathSet.has(routePath)),
    noRejectedRoutes: rejectedRouteLeaks.length === 0,
    noPerImageRoutes: routePaths.every((routePath) => /^\/coloring-pages(?:\/[a-z0-9-]+)?$/.test(routePath)),
    noDuplicateRoutes: new Set(runtimePaths).size === runtimePaths.length,
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(JSON.stringify(state.runtimeSiteMap)),
    noR2Dev: !/r2\.dev/i.test(JSON.stringify(state.runtimeSiteMap)),
    canonicalWwwUrls: outLocs.length ? outLocs.every((url) => url.startsWith(SITE_URL)) : true,
  };
  summary.regularSitemapPassed =
    summary.promotedRoutesIncluded &&
    summary.locCount === EXPECTED_RUNTIME_ROUTE_COUNT &&
    summary.noManualReviewRoutes &&
    summary.noBacklogRoutes &&
    summary.noRejectedRoutes &&
    summary.noPerImageRoutes &&
    summary.noDuplicateRoutes &&
    summary.noLocalhost &&
    summary.noR2Dev &&
    summary.canonicalWwwUrls;
  const blockers = blockersFromSummary(summary, "regularSitemapPassed");
  return { generatedAt: now(), runId: "post-long-tail-r2-sitemap-sync", promotedPaths, summary, blockers };
}

function buildImageSitemapSync(state) {
  const text = state.imageSitemapXml;
  const promotedPages = state.promotedHubs.hubs.map((hub) => {
    const page = state.imageSitemapPageBySlug.get(hub.slug);
    const pageUrl = `${SITE_URL}/coloring-pages/${hub.slug}`;
    return {
      slug: hub.slug,
      pageUrl,
      imageCount: page?.imageCount || 0,
      pagePresent: Boolean(page) && text.includes(`<loc>${pageUrl}</loc>`),
    };
  });
  const summary = {
    imageSitemapExists: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    imageEntryCount: countMatches(text, /<image:loc>/g),
    promotedHubPagesPresent: promotedPages.filter((entry) => entry.pagePresent).length,
    promotedHubPagesWithImages: promotedPages.filter((entry) => entry.imageCount > 0).length,
    noDeferredRecords: !containsAny(text, [...state.deferredAssetIds]),
    noSvgImageUrls: !/\/svg\/|\.svg(?:<|$)/i.test(text),
    noPngThumbUrls: !/\/png\/|\/thumbs\/|\.png(?:<|$)/i.test(text),
    noLocalhostR2Dev: !/localhost|127\.0\.0\.1|r2\.dev/i.test(text),
    noDuplicatePrefix: !/coloring-pages\/coloring-pages/i.test(text),
    xmlHasUrlset: /<urlset\b/.test(text) && /<\/urlset>/.test(text),
    imageSitemapDataPageCount: state.imageSitemapData.pages.length,
  };
  summary.imageSitemapPassed =
    summary.imageSitemapExists &&
    summary.imageEntryCount === EXPECTED_IMAGE_SITEMAP_ENTRIES &&
    summary.promotedHubPagesPresent === EXPECTED_PROMOTED_COUNT &&
    summary.promotedHubPagesWithImages === EXPECTED_PROMOTED_COUNT &&
    summary.noDeferredRecords &&
    summary.noSvgImageUrls &&
    summary.noPngThumbUrls &&
    summary.noLocalhostR2Dev &&
    summary.noDuplicatePrefix &&
    summary.xmlHasUrlset;
  const blockers = blockersFromSummary(summary, "imageSitemapPassed");
  return { generatedAt: now(), runId: "post-long-tail-r2-image-sitemap-sync", promotedPages, summary, blockers };
}

async function buildOgSync(state) {
  const promoted = [];
  for (const hub of state.promotedHubs.hubs) {
    const routePath = `/coloring-pages/${hub.slug}`;
    const metadata = state.ogImages.metadataByPath?.[routePath] || null;
    const publicPath = metadata?.ogImagePath ? metadata.ogImagePath.replace(/^\//, "public/") : "";
    const absolutePath = publicPath ? path.join(REPO_ROOT, publicPath) : "";
    const imageMetadata = existsSync(absolutePath) ? await sharp(absolutePath).metadata() : null;
    const checks = {
      metadataExists: Boolean(metadata),
      publicFileExists: Boolean(absolutePath && existsSync(absolutePath)),
      dimensions1200x630: imageMetadata?.width === 1200 && imageMetadata?.height === 630,
      formatJpg: /^jpeg$/i.test(imageMetadata?.format || "") && /\.jpg$/i.test(publicPath),
      pathUnderPublicOgHubs: publicPath === `public/og/hubs/${hub.slug}.jpg`,
      metadataReferencesCorrectPath: metadata?.ogImagePath === `/og/hubs/${hub.slug}.jpg`,
      noSvgOgImage: !/\.svg|\/svg\//i.test(`${metadata?.ogImagePath || ""}\n${metadata?.ogImageUrl || ""}`),
      noLocalhostR2Dev: !/localhost|127\.0\.0\.1|r2\.dev/i.test(`${metadata?.ogImageUrl || ""}`),
    };
    promoted.push({ slug: hub.slug, routePath, publicPath, bytes: imageMetadata ? (await stat(absolutePath)).size : 0, width: imageMetadata?.width || null, height: imageMetadata?.height || null, format: imageMetadata?.format || null, checks, passed: Object.values(checks).every(Boolean) });
  }
  const summary = {
    promotedHubCount: state.promotedHubs.hubs.length,
    promotedHubOgImagesPresent: promoted.filter((entry) => entry.checks.publicFileExists).length,
    promotedHubMetadataPresent: promoted.filter((entry) => entry.checks.metadataExists).length,
    promotedOgImagesPassed: promoted.filter((entry) => entry.passed).length,
    metadataRouteCount: Object.keys(state.ogImages.metadataByPath || {}).length,
    generatedImageCount: state.ogImages.summary?.generatedImageCount || null,
    publicOgFileCount: state.ogImages.summary?.publicOgFileCount || null,
    dimensions1200x630: promoted.every((entry) => entry.checks.dimensions1200x630),
    formatJpg: promoted.every((entry) => entry.checks.formatJpg),
    noSvgOgImages: promoted.every((entry) => entry.checks.noSvgOgImage),
    noLocalhostR2Dev: promoted.every((entry) => entry.checks.noLocalhostR2Dev),
    noPerImageOgPages: !Object.keys(state.ogImages.metadataByPath || {}).some((routePath) => /#asset-|__/.test(routePath)),
  };
  summary.ogImagesPassed =
    summary.promotedHubOgImagesPresent === EXPECTED_PROMOTED_COUNT &&
    summary.promotedHubMetadataPresent === EXPECTED_PROMOTED_COUNT &&
    summary.promotedOgImagesPassed === EXPECTED_PROMOTED_COUNT &&
    summary.dimensions1200x630 &&
    summary.formatJpg &&
    summary.noSvgOgImages &&
    summary.noLocalhostR2Dev &&
    summary.noPerImageOgPages;
  const blockers = blockersFromSummary(summary, "ogImagesPassed");
  return { generatedAt: now(), runId: "post-long-tail-r2-og-sync", summary, promoted, blockers };
}

function buildJsonLdSync(state) {
  const text = JSON.stringify(state.jsonLdRouteData.routes || []);
  const promoted = state.promotedHubs.hubs.map((hub) => {
    const routePath = `/coloring-pages/${hub.slug}`;
    const entry = state.jsonLdByPath.get(routePath);
    const schemaTypes = entry?.schemaTypes || [];
    const checks = {
      jsonLdExists: Boolean(entry),
      hasCollectionPage: schemaTypes.includes("CollectionPage"),
      hasBreadcrumbList: schemaTypes.includes("BreadcrumbList"),
      hasItemList: schemaTypes.includes("ItemList"),
      itemListCapped: (entry?.itemListItems?.length || 0) <= 8,
      canonicalWww: Boolean(entry && JSON.stringify(entry.jsonLd).includes(`${SITE_URL}${routePath}`)),
      noSvgUrls: entry ? !/\.svg|\/svg\//i.test(JSON.stringify(entry.jsonLd)) : false,
      noDeferredRecords: entry ? !containsAny(JSON.stringify(entry.jsonLd), [...state.deferredAssetIds]) : false,
    };
    return { slug: hub.slug, routePath, schemaTypes, itemListCount: entry?.itemListItems?.length || 0, checks, passed: Object.values(checks).every(Boolean) };
  });
  const allSchemaTypes = flattenTypes(state.jsonLdRouteData.routes || []);
  const summary = {
    routeCount: state.jsonLdRouteData.summary?.routeCount || 0,
    promotedHubJsonLdPresent: promoted.filter((entry) => entry.checks.jsonLdExists).length,
    promotedHubJsonLdPassed: promoted.filter((entry) => entry.passed).length,
    hubPagesWithJsonLd: state.jsonLdRouteData.summary?.hubPagesWithJsonLd || 0,
    maxItemListItems: state.jsonLdRouteData.summary?.maxItemListItems || 0,
    noForbiddenSchemaTypes: FORBIDDEN_SCHEMA_TYPES.every((type) => !allSchemaTypes.includes(type)),
    noSvgUrls: !/\.svg|\/svg\//i.test(text),
    noDeferredRecords: !containsAny(text, [...state.deferredAssetIds]),
    noLocalhostR2Dev: !/localhost|127\.0\.0\.1|r2\.dev/i.test(text),
    canonicalWwwRoutes: promoted.every((entry) => entry.checks.canonicalWww),
  };
  summary.jsonldPassed =
    summary.promotedHubJsonLdPresent === EXPECTED_PROMOTED_COUNT &&
    summary.promotedHubJsonLdPassed === EXPECTED_PROMOTED_COUNT &&
    summary.hubPagesWithJsonLd === EXPECTED_RUNTIME_HUB_COUNT &&
    summary.maxItemListItems <= 8 &&
    summary.noForbiddenSchemaTypes &&
    summary.noSvgUrls &&
    summary.noDeferredRecords &&
    summary.noLocalhostR2Dev &&
    summary.canonicalWwwRoutes;
  const blockers = blockersFromSummary(summary, "jsonldPassed");
  return { generatedAt: now(), runId: "post-long-tail-r2-jsonld-sync", summary, promoted, blockers };
}

function buildNavigationSearchAudit(state) {
  const routePaths = new Set(state.runtimeRoutes.routes.map((route) => route.path));
  const groupedSectionNames = ["Popular", "Seasonal", "Animals & Nature", "Dinosaurs & Prehistoric", "Fantasy & Characters", "Food & Cute Objects", "Vehicles & Places", "Patterns & Detailed", "Kids & Easy", "More Specific Collections"];
  const promoted = state.promotedHubs.hubs.map((hub) => {
    const runtimeHub = state.hubBySlug.get(hub.slug);
    const routePath = `/coloring-pages/${hub.slug}`;
    const internalLinks = state.internalLinksByPath.get(routePath);
    const relatedLinksValid = (runtimeHub?.relatedHubIds || []).every((hubId) => {
      const related = state.hubById.get(hubId);
      return related && routePaths.has(related.route);
    });
    const checks = {
      routePresent: routePaths.has(routePath),
      titleAvailableForMenuSearch: Boolean(runtimeHub?.title && runtimeHub.title.length > 0),
      searchTextAvailable: Boolean(runtimeHub?.searchKeywords?.length || runtimeHub?.title),
      internalLinksValid: Boolean(internalLinks && internalLinks.links?.every((link) => routePaths.has(link.href) || link.href === "/coloring-pages")),
      relatedLinksValid,
      noManualBacklogLink: !isManualOrBacklogRoute(routePath, state),
    };
    return { slug: hub.slug, title: runtimeHub?.title || hub.title, routePath, internalLinkCount: internalLinks?.links?.length || 0, relatedHubCount: runtimeHub?.relatedHubIds?.length || 0, checks, passed: Object.values(checks).every(Boolean) };
  });
  const summary = {
    promotedHubCount: promoted.length,
    promotedMenuSearchCandidates: promoted.filter((entry) => entry.checks.titleAvailableForMenuSearch).length,
    promotedInternalLinksValid: promoted.every((entry) => entry.checks.internalLinksValid),
    promotedRelatedLinksValid: promoted.every((entry) => entry.checks.relatedLinksValid),
    groupedSectionsRemain: groupedSectionNames.every((name) => state.siteNav.includes(name)),
    moreMenuUsesRuntimeHubs: /getMoreHubGroups|HubNavGroup|More Specific Collections/.test(state.siteNav),
    noEllipsisRuleRegression: !/text-overflow:\s*ellipsis/.test(state.siteNav),
    noManualBacklogRoutesLinked: promoted.every((entry) => entry.checks.noManualBacklogLink),
    mobileNavSearchPresent: existsSync(path.join(REPO_ROOT, "src", "components", "site", "MobileNav.tsx")),
  };
  summary.navigationSearchPassed =
    summary.promotedMenuSearchCandidates === EXPECTED_PROMOTED_COUNT &&
    summary.promotedInternalLinksValid &&
    summary.promotedRelatedLinksValid &&
    summary.groupedSectionsRemain &&
    summary.moreMenuUsesRuntimeHubs &&
    summary.noManualBacklogRoutesLinked &&
    summary.mobileNavSearchPresent;
  const blockers = blockersFromSummary(summary, "navigationSearchPassed");
  return { generatedAt: now(), runId: "post-long-tail-r2-navigation-search-audit", summary, promoted, blockers };
}

function buildAcceptanceGate(results) {
  const browserQa = readJsonIfExistsSync("pipeline/manifests/post-long-tail-r2-browser-qa-results.json");
  const sampledUrl = readJsonIfExistsSync("pipeline/manifests/post-long-tail-r2-sampled-url-check-results.json");
  const acceptance = {
    generatedAt: now(),
    runId: "post-long-tail-r2-acceptance-gate",
    promoted_hub_count: results.hubAudit.summary.promotedHubCount,
    runtime_hub_count: results.context.summary.runtimeHubCount,
    regular_sitemap_passed: results.sitemap.summary.regularSitemapPassed,
    image_sitemap_passed: results.imageSitemap.summary.imageSitemapPassed,
    og_images_passed: results.og.summary.ogImagesPassed,
    jsonld_passed: results.jsonld.summary.jsonldPassed,
    navigation_search_passed: results.nav.summary.navigationSearchPassed,
    browser_qa_passed: browserQa?.summary?.browserQaPassed === true,
    sampled_url_check_passed: sampledUrl?.summary?.sampledUrlCheckPassed === true,
    no_manual_review_routes: results.sitemap.summary.noManualReviewRoutes,
    no_backlog_routes: results.sitemap.summary.noBacklogRoutes,
    no_per_image_routes: results.sitemap.summary.noPerImageRoutes,
    ready_for_final_local_acceptance: false,
    blockers: [],
  };
  for (const result of Object.values(results)) acceptance.blockers.push(...(result.blockers || []));
  if (!acceptance.browser_qa_passed) acceptance.blockers.push("Post Long-Tail R2 browser QA has not passed.");
  if (!acceptance.sampled_url_check_passed) acceptance.blockers.push("Post Long-Tail R2 sampled URL check has not passed.");
  acceptance.blockers = [...new Set(acceptance.blockers)];
  acceptance.ready_for_final_local_acceptance = acceptance.blockers.length === 0;
  return acceptance;
}

function countHubItemMappings(state, hubId) {
  return state.runtimeHubItems.items.filter((entry) => (entry.hubIds || []).includes(hubId)).length;
}

function isManualOrBacklogRoute(routePath, state) {
  return [...state.manualReview.candidates, ...state.backlog.candidates].some((candidate) => routePath === `/coloring-pages/${candidate.slug}`);
}

function getPublicDownloadFormats(text) {
  const formats = [];
  if (/Download PNG/.test(text)) formats.push("PNG");
  if (/Download JPG/.test(text)) formats.push("JPG");
  if (/Download WebP/.test(text)) formats.push("WebP");
  return formats;
}

function blockersFromSummary(summary, passKey) {
  const blockers = [];
  for (const [key, value] of Object.entries(summary)) {
    if (key === passKey) continue;
    if (typeof value === "boolean" && value !== true) blockers.push(`${key} failed.`);
  }
  if (summary[passKey] !== true) blockers.push(`${passKey} failed.`);
  return blockers;
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

function countMatches(text, regex) {
  return (text.match(regex) || []).length;
}

function containsAny(text, values) {
  return values.some((value) => value && text.includes(value));
}

function readJsonIfExistsSync(relativePath) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

async function readProjectText(roots, options = {}) {
  const chunks = [];
  for (const root of roots) {
    const absoluteRoot = path.join(REPO_ROOT, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const file of await listFilesIfExists(absoluteRoot)) {
      if (!/\.(?:ts|tsx|js|jsx|css|mjs|json)$/.test(file)) continue;
      const normalized = normalizePath(path.relative(REPO_ROOT, file));
      if (options.excludeGenerated && normalized.startsWith("src/generated/")) continue;
      chunks.push(await readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

async function git(args) {
  try {
    const result = await execFileAsync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
    return result.stdout;
  } catch {
    return "";
  }
}

async function commitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

async function gitStatusFor(target) {
  try {
    const result = await execFileAsync("git", ["status", "--short", "--", target], { cwd: REPO_ROOT, encoding: "utf8" });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writePair([manifestPath, reportPath], data, report) {
  await writeJson(manifestPath, data);
  await writeTextFile(reportPath, report);
}

async function writeJson(relativePath, value) {
  await writeTextFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextFile(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, value, "utf8");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function now() {
  return new Date().toISOString();
}

function renderSummaryReport(title, summary, blockers) {
  const rows = Object.entries(summary)
    .map(([key, value]) => `| ${key} | ${Array.isArray(value) ? value.join(", ") : String(value)} |`)
    .join("\n");
  return `# ${title}

| Field | Value |
| --- | --- |
${rows}

Blockers:
${blockers.length ? blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

function renderHubAuditReport(audit) {
  const rows = audit.hubs
    .map((hub) => `| ${hub.slug} | ${hub.title} | ${hub.assetCount} | ${hub.imageSitemapImageCount} | ${hub.internalLinkCount} | ${hub.passed} |`)
    .join("\n");
  return `# Post Long-Tail R2 Promoted Hub Audit

| Metric | Value |
| --- | ---: |
| promotedHubCount | ${audit.summary.promotedHubCount} |
| passedHubCount | ${audit.summary.passedHubCount} |
| failedHubCount | ${audit.summary.failedHubCount} |

| Slug | Title | Assets | Image Sitemap Images | Internal Links | Passed |
| --- | --- | ---: | ---: | ---: | --- |
${rows}

Blockers:
${audit.blockers.length ? audit.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

function renderNavigationReport(nav) {
  const rows = nav.promoted
    .map((entry) => `| ${entry.slug} | ${entry.title} | ${entry.internalLinkCount} | ${entry.relatedHubCount} | ${entry.passed} |`)
    .join("\n");
  return `# Post Long-Tail R2 Navigation Search Audit

| Check | Result |
| --- | --- |
${Object.entries(nav.summary).map(([key, value]) => `| ${key} | ${String(value)} |`).join("\n")}

| Slug | Title | Internal Links | Related Hubs | Passed |
| --- | --- | ---: | ---: | --- |
${rows}

Blockers:
${nav.blockers.length ? nav.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

function renderAcceptanceReport(acceptance) {
  const rows = Object.entries(acceptance)
    .filter(([key]) => !["generatedAt", "runId", "blockers"].includes(key))
    .map(([key, value]) => `| ${key} | ${String(value)} |`)
    .join("\n");
  return `# Post Long-Tail R2 Acceptance Gate

| Field | Value |
| --- | --- |
${rows}

Blockers:
${acceptance.blockers.length ? acceptance.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}
