#!/usr/bin/env node

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  REPO_ROOT,
  countMatches,
  ensureStaticExport,
  readJson,
  readProjectText,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const EXPECTED_COMMIT = "b64aa261bad422c4f070572687ef2f98c8a717be";
const EXPECTED_RUNTIME_HUBS = 163;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const TRUST_ROUTES = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];
const SAMPLED_JSONLD_ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/dodo",
  "/coloring-pages/magic",
  "/sitemap",
  "/about",
  "/contact",
  "/privacy",
];
const FORBIDDEN_SCHEMA_TYPES = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const context = await runContextCheck();
  await writeJson("pipeline/manifests/final-seo-local-acceptance-context-check.json", context);
  await writeText("pipeline/reports/final-seo-local-acceptance-context-check.md", renderContextReport(context));

  const workingTree = runWorkingTreeAudit();
  await writeJson("pipeline/manifests/final-seo-local-acceptance-working-tree-audit.json", workingTree);
  await writeText("pipeline/reports/final-seo-local-acceptance-working-tree-audit.md", renderWorkingTreeReport(workingTree));

  const build = await ensureStaticExport({ force: true });
  const staticExport = await runStaticExportQa(build);
  await writeJson("pipeline/manifests/final-seo-local-static-export-results.json", staticExport);
  await writeText("pipeline/reports/final-seo-local-static-export-report.md", renderStaticExportReport(staticExport));

  const seo = await runSeoRegression(build);
  await writeJson("pipeline/manifests/final-seo-regression-results.json", seo);
  await writeText("pipeline/reports/final-seo-regression-report.md", renderSeoReport(seo));

  const trust = await runTrustContentReview(build);
  await writeJson("pipeline/manifests/final-seo-local-trust-content-review.json", trust);
  await writeText("pipeline/reports/final-seo-local-trust-content-review.md", renderTrustReport(trust));

  const ad = await runAdPlaceholderQa();
  await writeJson("pipeline/manifests/final-seo-local-ad-placeholder-qa.json", ad);
  await writeText("pipeline/reports/final-seo-local-ad-placeholder-qa.md", renderAdReport(ad));

  const gate = await buildAcceptanceGate({ context, workingTree, staticExport, seo, trust, ad });
  await writeJson("pipeline/manifests/final-seo-local-acceptance-gate.json", gate);
  await writeText("pipeline/reports/final-seo-local-acceptance-gate.md", renderGateReport(gate));

  console.log(JSON.stringify({
    static_export_passed: gate.summary.static_export_passed,
    seo_assets_passed: gate.summary.seo_assets_passed,
    trust_content_passed: gate.summary.trust_content_passed,
    ad_placeholders_passed: gate.summary.ad_placeholders_passed,
    ready_for_netlify_deployment: gate.summary.ready_for_netlify_deployment,
  }, null, 2));
  if (!gate.summary.ready_for_netlify_deployment) process.exitCode = 1;
}

async function runContextCheck() {
  const topLevel = git(["rev-parse", "--show-toplevel"]).trim().replace(/\\/g, "/");
  const branch = git(["branch", "--show-current"]).trim();
  const runtimeItems = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const quality = await readJson("src/generated/coloring/hub-content-quality.json");
  const imageSitemap = await readText("public/image-sitemap.xml");
  const jsonLdData = await readJson("pipeline/manifests/jsonld-route-data.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const downloadSurface = [
    await readText("src/components/coloring/DownloadMenu.tsx"),
    await readText("src/components/coloring/ImageCard.tsx"),
    await readText("src/lib/coloring/browserDownloads.ts"),
  ].join("\n");
  const appSource = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const ogJpgCount = await countFiles(path.join(REPO_ROOT, "public", "og"), /\.jpg$/i);
  const checks = {
    correctRepo: path.basename(topLevel) === "i-love-coloring-page",
    branchIsVer6Seo: branch === "ver-6-seo",
    expectedCommitExists: commandSucceeds("git", ["cat-file", "-e", `${EXPECTED_COMMIT}^{commit}`]),
    appApiAbsent: !fs.existsSync(path.join(REPO_ROOT, "app", "api")),
    staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
    runtimeAvailableRecords: runtimeItems.items.length === EXPECTED_AVAILABLE_RECORDS,
    runtimeHubCount: runtimeHubs.hubs.length === EXPECTED_RUNTIME_HUBS,
    hubContentQualityExists: quality.hubs?.length === EXPECTED_RUNTIME_HUBS,
    htmlSitemapPageExists: fs.existsSync(path.join(REPO_ROOT, "app", "sitemap", "page.tsx")),
    xmlSitemapExists: fs.existsSync(path.join(REPO_ROOT, "app", "sitemap.ts")),
    imageSitemapExists: fs.existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>/g) === EXPECTED_IMAGE_SITEMAP_ENTRIES,
    ogImagesExist: ogJpgCount >= EXPECTED_RUNTIME_HUBS,
    jsonLdExists: jsonLdData.summary?.hubPagesWithJsonLd === EXPECTED_RUNTIME_HUBS,
    publicSafeDefaults: siteConfig.includes(SITE_URL) && siteConfig.includes(ASSET_BASE_URL) && siteConfig.includes(CONTACT_EMAIL),
    pngJpgWebpDownloads: /Download PNG/.test(downloadSurface) && /Download JPG/.test(downloadSurface) && /Download WebP/.test(downloadSurface),
    svgInternalOnly: !/Download SVG|downloadSvg\b|svgDownload/i.test(downloadSurface),
    liveAdsenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(appSource),
    imagesUntouched: git(["status", "--short", "--", "images"]).trim() === "",
    ilovesvgUntouched: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
  };
  const blockers = failedChecks(checks);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-local-acceptance-context-check",
    repo: { topLevel, branch, expectedCommit: EXPECTED_COMMIT },
    counts: {
      availableRecords: runtimeItems.items.length,
      runtimeHubs: runtimeHubs.hubs.length,
      qualityRecords: quality.hubs?.length || 0,
      imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>/g),
      ogJpgCount,
    },
    checks,
    summary: { context_check_passed: blockers.length === 0, blockers },
  };
}

function runWorkingTreeAudit() {
  const statusShort = git(["status", "--short"]);
  const diffStat = git(["diff", "--stat"]);
  const diffNameOnly = git(["diff", "--name-only"]);
  const files = statusShort
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[AMDRCU? ]+\s+/, "").replace(/\\/g, "/"))
    .filter(Boolean);
  const allowed = [
    "AGENTS.md",
    "pipeline/scripts/final-seo-content-acceptance-check.mjs",
    "pipeline/scripts/final-seo-local-browser-qa-runner.cjs",
    "pipeline/scripts/final-seo-local-print-qa-runner.cjs",
    "pipeline/scripts/final-seo-regression-qa.mjs",
    "pipeline/tests/final-seo-local-acceptance.test.mjs",
  ];
  const allowedPrefixes = ["pipeline/manifests/final-seo-", "pipeline/reports/final-seo-"];
  const unrelatedFiles = files.filter((file) => !allowed.includes(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)));
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-local-acceptance-working-tree-audit",
    statusShort,
    diffStat,
    diffNameOnly,
    summary: {
      unrelated_drift_found: unrelatedFiles.length > 0,
      unrelated_files: unrelatedFiles,
      working_tree_audit_passed: unrelatedFiles.length === 0,
      blockers: unrelatedFiles.map((file) => `Unrelated working tree drift: ${file}`),
    },
  };
}

async function runStaticExportQa(build) {
  const files = await listFiles(build.outDir);
  const textFiles = files.filter((file) => /\.(?:html|xml|txt|js|css|json)$/i.test(file));
  const scan = await scanTextFiles(textFiles);
  const checks = {
    buildSucceeded: build.buildRan === true && fs.existsSync(path.join(build.outDir, "index.html")),
    sitemapPageExists: fs.existsSync(path.join(build.outDir, "sitemap.html")) || fs.existsSync(path.join(build.outDir, "sitemap", "index.html")),
    sitemapXmlExists: fs.existsSync(path.join(build.outDir, "sitemap.xml")),
    imageSitemapXmlExists: fs.existsSync(path.join(build.outDir, "image-sitemap.xml")) || fs.existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    robotsTxtExists: fs.existsSync(path.join(build.outDir, "robots.txt")),
    noLocalhost: scan.localhostRefs.length === 0,
    noR2Dev: scan.r2DevRefs.length === 0,
    noPrivateR2Endpoint: scan.privateR2Refs.length === 0,
    noAppApiRefs: scan.appApiRefs.length === 0,
    noDownloadSvgText: scan.downloadSvgRefs.length === 0,
    noLiveAdsense: scan.liveAdsRefs.length === 0,
  };
  const blockers = failedChecks(checks);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-local-static-export",
    build,
    generatedFileCount: files.length,
    scan,
    checks,
    summary: { static_export_passed: blockers.length === 0, blockers },
  };
}

async function runSeoRegression(build) {
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const sitemap = await fsp.readFile(path.join(build.outDir, "sitemap.xml"), "utf8");
  const imageSitemapPath = fs.existsSync(path.join(build.outDir, "image-sitemap.xml"))
    ? path.join(build.outDir, "image-sitemap.xml")
    : path.join(REPO_ROOT, "public", "image-sitemap.xml");
  const imageSitemap = await fsp.readFile(imageSitemapPath, "utf8");
  const robots = await fsp.readFile(path.join(build.outDir, "robots.txt"), "utf8");
  const sitemapLocs = extractLocs(sitemap);
  const sitemapText = sitemapLocs.join("\n");
  const hubUrls = runtimeHubs.hubs.map((hub) => `${SITE_URL}${hub.route}`);
  const sampled = await Promise.all(SAMPLED_JSONLD_ROUTES.map((route) => inspectRouteMetadata(build.outDir, route)));
  const jsonLdTypes = sampled.flatMap((entry) => entry.jsonLdTypes);
  const hubRoutesNeedingHubOg = runtimeHubs.hubs.filter((hub) => hub.route !== "/coloring-pages");
  const ogMissing = hubRoutesNeedingHubOg.filter((hub) => !fs.existsSync(path.join(REPO_ROOT, "public", "og", "hubs", `${hub.slug}.jpg`)));
  const checks = {
    sitemapXmlExists: fs.existsSync(path.join(build.outDir, "sitemap.xml")),
    sitemapLocCountCurrent: sitemapLocs.length >= EXPECTED_RUNTIME_HUBS + TRUST_ROUTES.length + 1,
    htmlSitemapIncluded: sitemapText.includes(`${SITE_URL}/sitemap`),
    all163HubRoutesIncluded: hubUrls.every((url) => sitemapText.includes(url)),
    trustPagesIncluded: TRUST_ROUTES.every((route) => sitemapText.includes(`${SITE_URL}${route}`)),
    noPerImageRoutes: !/\/coloring-pages\/[^/\s<]+\/[^/\s<]+/.test(sitemapText),
    noManualReviewBacklogRoutes: !/manual-review|backlog|rejected/i.test(sitemapText),
    imageSitemapExists: fs.existsSync(imageSitemapPath),
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>[^<]+\.webp<\/image:loc>/g) === EXPECTED_IMAGE_SITEMAP_ENTRIES,
    imageSitemapExcludesSvgPngThumbs: !/\.svg<\/image:loc>|\.png<\/image:loc>|\/thumbs\//i.test(imageSitemap),
    robotsReferencesBothSitemaps: robots.includes(`${SITE_URL}/sitemap.xml`) && robots.includes(`${SITE_URL}/image-sitemap.xml`),
    ogImagesExistForRouteLevelPages: ogMissing.length === 0,
    jsonLdExistsForSampledPages: sampled.every((entry) => entry.jsonLdCount > 0 && entry.jsonLdParses),
    noForbiddenSchemaTypes: jsonLdTypes.every((type) => !FORBIDDEN_SCHEMA_TYPES.has(type)),
    canonicalUrlsUseWww: sampled.every((entry) => entry.canonicalWwwDomain),
    noUnsafeEndpoints: !/localhost|127\.0\.0\.1|r2\.dev|r2\.cloudflarestorage\.com/i.test(`${sitemap}\n${imageSitemap}\n${robots}`),
  };
  const blockers = failedChecks(checks);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-regression",
    sitemapLocCount: sitemapLocs.length,
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>[^<]+\.webp<\/image:loc>/g),
    sampledRoutes: sampled,
    ogMissing,
    checks,
    summary: { seo_assets_passed: blockers.length === 0, blockers },
  };
}

async function runTrustContentReview(build) {
  const pages = {};
  for (const route of TRUST_ROUTES) pages[route] = await readRouteHtml(build.outDir, route);
  const combined = Object.values(pages).join("\n");
  const checks = {
    aboutExists: pages["/about"].length > 0,
    contactExists: pages["/contact"].length > 0,
    privacyExists: pages["/privacy"].length > 0,
    termsExists: pages["/terms"].length > 0,
    affiliateDisclosureExists: pages["/affiliate-disclosure"].length > 0,
    editorialPolicyExists: pages["/editorial-policy"].length > 0,
    contactEmailCorrect: combined.includes(CONTACT_EMAIL),
    noFakeAddress: !/\b\d{2,5}\s+[A-Za-z0-9 .'-]+\s+(Street|St\.|Road|Rd\.|Avenue|Ave\.|Suite|Floor)\b/i.test(combined),
    noFakePhone: !/\+?\d[\d\s().-]{7,}\d/.test(combined.replace(CONTACT_EMAIL, "")),
    noFalseCompanyClaims: !/inc\.|llc|corporation|headquartered|registered company/i.test(combined),
    noPublicSvgDownloadClaims: !/Download SVG|SVG download/i.test(combined),
    noInternalPipelineWording: !/pipeline|runtime|manifest|R2|Cloudflare|manual-review/i.test(stripScripts(combined)),
    legalOwnerReviewRecommended: /legal review|owner review|review/i.test(combined),
  };
  const blockers = failedChecks(checks).filter((item) => item !== "legalOwnerReviewRecommended");
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-local-trust-content-review",
    routes: TRUST_ROUTES,
    checks,
    summary: {
      trust_content_passed: blockers.length === 0,
      legal_owner_review_still_recommended: checks.legalOwnerReviewRecommended,
      blockers,
    },
  };
}

async function runAdPlaceholderQa() {
  const css = await readText("src/styles/components.css");
  const browser = await readOptionalJson("pipeline/manifests/final-seo-local-browser-qa-results.json");
  const appSource = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const forbiddenSurfaces = [
    await readText("src/components/site/SiteHeader.tsx"),
    await readText("src/components/site/MoreHubMenu.tsx"),
    await readText("src/components/site/MobileNav.tsx"),
    await readText("src/components/coloring/ImageCard.tsx"),
    await readText("src/components/coloring/GalleryGrid.tsx"),
    await readText("src/components/coloring/DownloadMenu.tsx"),
  ].join("\n");
  const railResults = browser?.adRailViewportResults || [];
  const byViewport = new Map(railResults.map((result) => [result.viewport, result]));
  const checks = {
    adWellsVisibleByDefault: /data-ad-placeholder/.test(await readText("src/components/ads/AdSlot.tsx")) && /Advertisement/.test(await readText("src/components/ads/AdSlot.tsx")),
    noLiveAdsenseScript: !/adsbygoogle|pagead2\.googlesyndication|google_ad_client/i.test(appSource),
    noAdClientIds: !/ca-pub-|data-ad-client|client-\d+/i.test(appSource),
    compactWideSideRailsVisibleOnlyWhereIntended:
      ["1536", "1600", "1739"].every((label) => (byViewport.get(label)?.visibleRails || 0) === 2) &&
      (byViewport.get("1440")?.visibleRails || 0) === 0 &&
      (byViewport.get("1740")?.visibleRails || 0) === 2,
    wideDesktopDensityCorrect: (byViewport.get("1740")?.visibleAdSlots || 0) >= 3,
    mobileTabletDensityCorrect: browser ? browser.routeResults.filter((route) => ["390", "768"].includes(route.viewport)).every((route) => route.adRailsVisible === 0) : true,
    noAdsInsideNav: !/AdSlot|AdRail|Advertisement|data-ad-placeholder/i.test(forbiddenSurfaces.split("DownloadMenu")[0]),
    noAdsInsideGalleryGrid: !/AdSlot|AdRail|Advertisement|data-ad-placeholder/i.test(await readText("src/components/coloring/GalleryGrid.tsx")),
    noAdsBesidePrintDownloadControls: !/AdSlot|AdRail|Advertisement|data-ad-placeholder/i.test(await readText("src/components/coloring/DownloadMenu.tsx")),
    noOverlap: railResults.every((result) => !result.horizontalOverflow),
    noHorizontalOverflow: Boolean(browser?.summary?.noHorizontalOverflow),
    compactRailBreakpointPresent: /@media \(min-width:\s*1536px\) and \(max-width:\s*1739px\)/.test(css),
  };
  const blockers = failedChecks(checks);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-local-ad-placeholder-qa",
    railResults,
    checks,
    summary: { ad_placeholders_passed: blockers.length === 0, compact_side_rails_passed: checks.compactWideSideRailsVisibleOnlyWhereIntended, blockers },
  };
}

async function buildAcceptanceGate(parts) {
  const content = await readOptionalJson("pipeline/manifests/final-seo-content-acceptance-results.json");
  const browser = await readOptionalJson("pipeline/manifests/final-seo-local-browser-qa-results.json");
  const print = await readOptionalJson("pipeline/manifests/final-seo-local-print-qa-results.json");
  const blockers = [
    ...(parts.context.summary.blockers || []),
    ...(parts.workingTree.summary.blockers || []),
    ...(parts.staticExport.summary.blockers || []),
    ...(content?.summary?.blockers || ["content acceptance results missing."]),
    ...(browser?.blockers || ["browser QA results missing."]),
    ...(print?.blockers || ["print QA results missing."]),
    ...(parts.seo.summary.blockers || []),
    ...(parts.trust.summary.blockers || []),
    ...(parts.ad.summary.blockers || []),
  ];
  const summary = {
    static_export_passed: parts.staticExport.summary.static_export_passed,
    content_quality_passed: Boolean(content?.summary?.content_quality_passed),
    browser_qa_passed: Boolean(browser?.summary?.browserQaPassed),
    print_pdf_passed: Boolean(print?.summary?.printQaPassed),
    print_one_page_passed: Boolean(print?.summary?.allGeneratedPdfsOnePage),
    print_branding_safe: Boolean(print?.summary?.brandingIntegratedIntoFrame && print?.summary?.brandingDoesNotOverlapArtwork),
    related_collections_passed: Boolean(browser?.summary?.relatedCollectionsClean),
    html_sitemap_passed: Boolean(browser?.summary?.htmlSitemapGrouped && parts.seo.checks.htmlSitemapIncluded),
    more_menu_passed: Boolean(browser?.summary?.moreMenuUsable),
    seo_assets_passed: parts.seo.summary.seo_assets_passed,
    trust_content_passed: parts.trust.summary.trust_content_passed,
    ad_placeholders_passed: parts.ad.summary.ad_placeholders_passed,
    compact_side_rails_passed: Boolean(parts.ad.summary.compact_side_rails_passed && browser?.summary?.compactSideRailsVisible),
    no_app_api: parts.context.checks.appApiAbsent,
    no_svg_download: Boolean(content?.summary?.svg_download_claims === 0 && browser?.summary?.svgDownloadAbsent && print?.summary?.svgDownloadAbsent),
    no_horizontal_overflow: Boolean(browser?.summary?.noHorizontalOverflow && parts.ad.checks.noHorizontalOverflow),
    ready_for_netlify_deployment: false,
    ready_for_gsc_submission_after_live_deploy: false,
    ready_for_live_ads_round: false,
    blockers,
  };
  summary.ready_for_netlify_deployment = blockers.length === 0 &&
    Object.entries(summary)
      .filter(([key]) => !["ready_for_netlify_deployment", "ready_for_gsc_submission_after_live_deploy", "ready_for_live_ads_round", "blockers"].includes(key))
      .every(([, value]) => value === true);
  summary.ready_for_gsc_submission_after_live_deploy = summary.ready_for_netlify_deployment && summary.seo_assets_passed;
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-seo-local-acceptance-gate",
    summary,
  };
}

async function inspectRouteMetadata(outDir, route) {
  const html = await readRouteHtml(outDir, route);
  const jsonLdScripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) =>
    decodeHtml(match[1].trim()),
  );
  const jsonLdTypes = [];
  let jsonLdParses = true;
  for (const script of jsonLdScripts) {
    try {
      collectTypes(JSON.parse(script), jsonLdTypes);
    } catch {
      jsonLdParses = false;
    }
  }
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] || "";
  return {
    route,
    jsonLdCount: jsonLdScripts.length,
    jsonLdParses,
    jsonLdTypes,
    canonicalWwwDomain: canonical.includes(SITE_URL),
  };
}

function collectTypes(value, out) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, out);
    return;
  }
  if (value["@type"]) out.push(value["@type"]);
  for (const child of Object.values(value)) collectTypes(child, out);
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function readRouteHtml(outDir, route) {
  const relative = route === "/" ? "index.html" : `${route.replace(/^\/+/, "")}.html`;
  const alternate = route === "/" ? "index.html" : path.join(route.replace(/^\/+/, ""), "index.html");
  for (const candidate of [path.join(outDir, relative), path.join(outDir, alternate)]) {
    if (fs.existsSync(candidate)) return fsp.readFile(candidate, "utf8");
  }
  return "";
}

async function listFiles(root) {
  const results = [];
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(absolute);
    }
  }
  await walk(root);
  return results;
}

async function scanTextFiles(files) {
  const scan = {
    localhostRefs: [],
    r2DevRefs: [],
    privateR2Refs: [],
    appApiRefs: [],
    downloadSvgRefs: [],
    liveAdsRefs: [],
  };
  for (const file of files) {
    const text = await fsp.readFile(file, "utf8").catch(() => "");
    const relativePath = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(text)) scan.localhostRefs.push(relativePath);
    if (/https?:\/\/[^"'\s<>]+r2\.dev/i.test(text)) scan.r2DevRefs.push(relativePath);
    if (/https?:\/\/[^"'\s<>]+r2\.cloudflarestorage\.com/i.test(text)) scan.privateR2Refs.push(relativePath);
    if (/(?:href|src)=["'][^"']*\/api\/|fetch\(["']\/api\//i.test(text)) scan.appApiRefs.push(relativePath);
    if (/Download SVG/i.test(text)) scan.downloadSvgRefs.push(relativePath);
    if (/adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(text)) scan.liveAdsRefs.push(relativePath);
  }
  return scan;
}

async function countFiles(root, regex) {
  if (!fs.existsSync(root)) return 0;
  return (await listFiles(root)).filter((file) => regex.test(file)).length;
}

async function readOptionalJson(relativePath) {
  try {
    return await readJson(relativePath);
  } catch {
    return null;
  }
}

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

function decodeHtml(value) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function failedChecks(checks) {
  return Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
}

function commandSucceeds(command, args) {
  try {
    execFileSync(command, args, { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function renderContextReport(payload) {
  return `# Final SEO Local Acceptance Context Check

${renderTable(Object.entries(payload.checks).map(([key, value]) => [key, value]))}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function renderWorkingTreeReport(payload) {
  return `# Final SEO Local Working Tree Audit

${renderTable(Object.entries(payload.summary).filter(([key]) => key !== "blockers" && key !== "unrelated_files").map(([key, value]) => [key, JSON.stringify(value)]))}

## Status
\`\`\`
${payload.statusShort || "(clean)"}
\`\`\`
`;
}

function renderStaticExportReport(payload) {
  return `# Final SEO Local Static Export QA

${renderTable(Object.entries(payload.checks).map(([key, value]) => [key, value]))}

Generated file count: ${payload.generatedFileCount}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function renderSeoReport(payload) {
  return `# Final SEO Regression QA

${renderTable(Object.entries(payload.checks).map(([key, value]) => [key, value]))}

- Sitemap loc count: ${payload.sitemapLocCount}
- Image sitemap WebP entries: ${payload.imageSitemapWebpEntries}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function renderTrustReport(payload) {
  return `# Final SEO Local Trust Content Review

${renderTable(Object.entries(payload.checks).map(([key, value]) => [key, value]))}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function renderAdReport(payload) {
  return `# Final SEO Local Ad Placeholder QA

${renderTable(Object.entries(payload.checks).map(([key, value]) => [key, value]))}

## Rail Results
${renderTable(payload.railResults.map((result) => [result.viewport, `rails=${result.visibleRails}; slots=${result.visibleAdSlots}; overflow=${result.horizontalOverflow}`]))}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function renderGateReport(payload) {
  return `# Final SEO Local Acceptance Gate

${renderTable(Object.entries(payload.summary).filter(([key]) => key !== "blockers").map(([key, value]) => [key, value]))}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}
