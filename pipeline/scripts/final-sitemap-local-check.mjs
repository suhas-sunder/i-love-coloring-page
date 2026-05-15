#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  REPO_ROOT,
  ensureStaticExport,
  execFileLogged,
  gitStatusFor,
  normalizePath,
  passFail,
  readJson,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SITE_URL = "https://www.ilovecoloringpage.com";
const EXPECTED_COMMIT = "9f9802cbc661b12c966fc78a0c91a4ccfc0073b6";
const EXPECTED_BRANCH = "ver-5-deployed-may-13-2026";
const EXPECTED_RUNTIME_HUBS = 163;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const build = await ensureStaticExport({ force: true });
  const context = await buildContextCheck();
  const related = await buildRelatedFix();
  const moreWays = await buildMoreWaysAudit();
  const htmlSitemap = await buildHtmlSitemapResults(build);
  const metadata = await buildHtmlSitemapMetadata(build);
  const localCheck = await buildSitemapLocalCheck(build);

  await writeJson("pipeline/manifests/final-sitemap-related-context-check.json", context);
  await writeText("pipeline/reports/final-sitemap-related-context-check.md", renderContextReport(context));
  await writeJson("pipeline/manifests/final-related-collections-fix.json", related);
  await writeText("pipeline/reports/final-related-collections-fix-report.md", renderRelatedReport(related));
  await writeJson("pipeline/manifests/final-more-ways-audit.json", moreWays);
  await writeText("pipeline/reports/final-more-ways-audit-report.md", renderMoreWaysReport(moreWays));
  await writeJson("pipeline/manifests/final-html-sitemap-results.json", htmlSitemap);
  await writeText("pipeline/reports/final-html-sitemap-report.md", renderHtmlSitemapReport(htmlSitemap));
  await writeJson("pipeline/manifests/final-html-sitemap-metadata-results.json", metadata);
  await writeText("pipeline/reports/final-html-sitemap-metadata-report.md", renderMetadataReport(metadata));
  await writeJson("pipeline/manifests/final-sitemap-local-check-results.json", localCheck);
  await writeText("pipeline/reports/final-sitemap-local-check-report.md", renderLocalCheckReport(localCheck));

  console.log(JSON.stringify({
    contextPassed: context.summary.contextPassed,
    relatedCollectionsPassed: related.summary.relatedCollectionsPassed,
    htmlSitemapPassed: htmlSitemap.summary.htmlSitemapPassed,
    sitemapLocalCheckPassed: localCheck.summary.sitemapLocalCheckPassed,
  }, null, 2));

  if (!context.summary.contextPassed || !related.summary.relatedCollectionsPassed || !htmlSitemap.summary.htmlSitemapPassed || !metadata.summary.metadataPassed || !localCheck.summary.sitemapLocalCheckPassed) {
    process.exitCode = 1;
  }
}

async function buildContextCheck() {
  const [topLevel, branch, commitExists] = await Promise.all([
    execFileLogged("git", ["rev-parse", "--show-toplevel"]).then((result) => normalizePath(result.stdout.trim())),
    execFileLogged("git", ["branch", "--show-current"]).then((result) => result.stdout.trim()),
    execFileLogged("git", ["cat-file", "-e", `${EXPECTED_COMMIT}^{commit}`]).then(() => true, () => false),
  ]);
  const runtimeItems = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const imageSitemap = await readText("public/image-sitemap.xml");
  const jsonLd = await readJson("pipeline/manifests/jsonld-route-data.json");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const downloadSource = [
    await readText("src/components/coloring/DownloadMenu.tsx"),
    await readText("src/components/coloring/ImageCard.tsx"),
    await readText("src/lib/coloring/browserDownloads.ts"),
  ].join("\n");
  const appAndSrcSource = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const ogJpgCount = await countFiles(path.join(REPO_ROOT, "public", "og"), /\.jpg$/i);
  const publicFiles = await listFiles(path.join(REPO_ROOT, "public"));

  const summary = {
    correctRepo: topLevel.endsWith("/i-love-coloring-page"),
    correctBranch: branch === EXPECTED_BRANCH,
    latestFinalLocalAcceptanceCommitExists: commitExists,
    appApiAbsent: !fs.existsSync(path.join(REPO_ROOT, "app", "api")),
    staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
    runtimeGeneratedDataExists: fs.existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
    runtimeAvailableRecords: runtimeItems.items.length,
    runtimeAvailableRecordsPassed: runtimeItems.items.length === EXPECTED_AVAILABLE_RECORDS,
    runtimeHubCount: runtimeHubs.hubs.length,
    runtimeHubCountPassed: runtimeHubs.hubs.length === EXPECTED_RUNTIME_HUBS,
    imageSitemapExists: fs.existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")),
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>/g),
    ogImagesExist: ogJpgCount > 0,
    ogJpgCount,
    jsonLdExists: jsonLd.summary?.hubPagesWithJsonLd === EXPECTED_RUNTIME_HUBS,
    publicSafeDefaultsExist:
      siteConfig.includes("https://www.ilovecoloringpage.com") &&
      siteConfig.includes("https://assets.ilovecoloringpage.com/coloring-pages") &&
      siteConfig.includes("admin@ilovecoloringpage.com"),
    svgRemainsInternalOnly: !/Download SVG|downloadSvg\b|svgDownload/i.test(downloadSource),
    publicDownloadsArePngJpgWebp: /Download PNG/.test(downloadSource) && /Download JPG/.test(downloadSource) && /Download WebP/.test(downloadSource),
    liveAdsenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(appAndSrcSource),
    noDisallowedPublicMedia: publicFiles.filter(isDisallowedPublicMedia).length === 0,
    imagesUntouched: (await gitStatusFor("images")).trim() === "",
    ilovesvgUntouched: (await gitStatusFor("ilovesvg")).trim() === "",
  };
  summary.contextPassed =
    summary.correctRepo &&
    summary.correctBranch &&
    summary.latestFinalLocalAcceptanceCommitExists &&
    summary.appApiAbsent &&
    summary.staticExportConfigured &&
    summary.runtimeGeneratedDataExists &&
    summary.runtimeAvailableRecordsPassed &&
    summary.runtimeHubCountPassed &&
    summary.imageSitemapExists &&
    summary.imageSitemapWebpEntries === EXPECTED_IMAGE_SITEMAP_ENTRIES &&
    summary.ogImagesExist &&
    summary.jsonLdExists &&
    summary.publicSafeDefaultsExist &&
    summary.svgRemainsInternalOnly &&
    summary.publicDownloadsArePngJpgWebp &&
    summary.liveAdsenseAbsent &&
    summary.noDisallowedPublicMedia &&
    summary.imagesUntouched &&
    summary.ilovesvgUntouched;

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-sitemap-related-context-check",
    topLevel,
    branch,
    expectedCommit: EXPECTED_COMMIT,
    summary,
    blockers: blockersFromSummary(summary, "contextPassed"),
  };
}

async function buildRelatedFix() {
  const css = await readText("src/styles/components.css");
  const seoContent = await readText("src/components/coloring/SeoContentSection.tsx");
  const relatedHubs = await readText("src/components/coloring/RelatedHubs.tsx");
  const seoListBlock = cssBlock(css, ".seo-related-link-list");
  const seoLinkBlock = cssBlock(css, ".seo-related-link");
  const seoCountBlock = cssBlock(css, ".seo-related-link-count");
  const relatedCountBlock = cssBlock(css, ".related-link-count");
  const seoLabelBlock = cssBlock(css, ".seo-related-link-label");
  const relatedLabelBlock = cssBlock(css, ".related-link-label");
  const summary = {
    relatedComponentHasSeparatedLabelAndCount: /related-link-label/.test(relatedHubs) && /related-link-count/.test(relatedHubs),
    seoRelatedComponentHasSeparatedLabelAndCount: /seo-related-link-label/.test(seoContent) && /seo-related-link-count/.test(seoContent),
    seoRelatedListUsesGrid: /display:\s*grid/.test(seoListBlock) && !/display:\s*flex/.test(seoListBlock),
    seoRelatedLinkUsesAlignedColumns: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/.test(seoLinkBlock),
    noCrampedPillDump: !/radius-pill|inline-flex/.test(seoLinkBlock),
    countsAlignedSeparately: /text-align:\s*right/.test(seoCountBlock) && /text-align:\s*right/.test(relatedCountBlock),
    importantLabelsNotEllipsized: !/text-overflow:\s*ellipsis|white-space:\s*nowrap/.test(`${seoLabelBlock}\n${relatedLabelBlock}`),
    noHeavyBordersShadowsGradients: !/box-shadow|linear-gradient|border:\s*\d/.test(`${seoListBlock}\n${seoLinkBlock}`),
  };
  summary.relatedCollectionsPassed = Object.values(summary).every(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-related-collections-fix",
    summary,
    implementation: {
      changedSection: "SeoContentSection related collections now use a grid list with labels and counts in separate columns.",
      relatedHubsSection: "Bottom RelatedHubs section already uses an aligned grid and remains in that pattern.",
    },
    blockers: blockersFromSummary(summary, "relatedCollectionsPassed"),
  };
}

async function buildMoreWaysAudit() {
  const hubPageContent = await readText("src/components/coloring/HubPageContent.tsx");
  const css = await readText("src/styles/components.css");
  const summary = {
    moreWaysToBrowseAbsent: !/More ways to browse/i.test(hubPageContent),
    narrowerWaysToBrowseDistinct: /Narrower ways to browse/.test(hubPageContent) && /specific subcollection or repeated theme/.test(hubPageContent),
    noDuplicateRelatedHeading: countMatches(hubPageContent, /Related collections/g) <= 2,
    supportingBrowseUsesGroupedLayout: /supporting-browse-grid/.test(hubPageContent) && /supporting-browse-grid/.test(css),
    countsAlignedInThemeList: /section-list[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content/.test(css),
  };
  summary.moreWaysAuditPassed = Object.values(summary).every(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-more-ways-audit",
    summary,
    decision: "The old More ways to browse wording is absent. The remaining Narrower ways to browse section has a distinct subcollection and repeated-theme purpose.",
    blockers: blockersFromSummary(summary, "moreWaysAuditPassed"),
  };
}

async function buildHtmlSitemapResults(build) {
  const html = await readOutRouteHtml(build.outDir, "/sitemap");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeRoutes = await readJson("src/generated/coloring/runtime-routes.json");
  const runtimeHubRoutes = runtimeHubs.hubs.map((hub) => hub.route);
  const hrefs = extractHrefs(html);
  const missingHubRoutes = runtimeHubRoutes.filter((route) => !hrefs.includes(route));
  const source = await readText("app/sitemap/page.tsx");
  const summary = {
    routePath: "/sitemap",
    routeRendersInStaticExport: html.length > 0,
    groupedReadableLayout: /html-sitemap-grid/.test(html) && /Main pages/.test(html) && /More Collections/.test(html),
    publicHubRoutesIncluded: runtimeHubRoutes.length - missingHubRoutes.length,
    expectedPublicHubRoutes: EXPECTED_RUNTIME_HUBS,
    allPublicHubRoutesIncluded: missingHubRoutes.length === 0,
    includesMajorTrustPages: ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"].every((route) => hrefs.includes(route)),
    noPerImageRoutes: !hrefs.some(isPerImageRoute),
    noManualReviewBacklogRejectedRoutes: !/manual-review|backlog|rejected/i.test(`${html}\n${runtimeRoutes.routes.map((route) => route.path).join("\n")}`),
    noApiRoutes: !hrefs.some((href) => href.startsWith("/api/")),
    noHugeUnstructuredDump: /sitemapHubGroups/.test(source) && !/phase1HubLinks\.map/.test(source),
    noCrampedPills: /html-sitemap-link/.test(source) && !/radius-pill|inline-flex/.test(cssBlock(await readText("src/styles/components.css"), ".html-sitemap-link")),
  };
  summary.htmlSitemapPassed =
    summary.routeRendersInStaticExport &&
    summary.groupedReadableLayout &&
    summary.publicHubRoutesIncluded === EXPECTED_RUNTIME_HUBS &&
    summary.allPublicHubRoutesIncluded &&
    summary.includesMajorTrustPages &&
    summary.noPerImageRoutes &&
    summary.noManualReviewBacklogRejectedRoutes &&
    summary.noApiRoutes &&
    summary.noHugeUnstructuredDump &&
    summary.noCrampedPills;

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-html-sitemap-results",
    summary,
    missingHubRoutes,
    groups: extractHeadingText(html),
    blockers: blockersFromSummary(summary, "htmlSitemapPassed"),
  };
}

async function buildHtmlSitemapMetadata(build) {
  const html = await readOutRouteHtml(build.outDir, "/sitemap");
  const jsonLdScripts = extractJsonLdScripts(html);
  const parsedJsonLd = [];
  const parseErrors = [];
  for (const script of jsonLdScripts) {
    try {
      parsedJsonLd.push(JSON.parse(script));
    } catch (error) {
      parseErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || "";
  const summary = {
    routePath: "/sitemap",
    titlePresent: /<title>[^<]*Sitemap[^<]*<\/title>/i.test(html),
    descriptionPresent: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/i.test(html),
    canonicalUsesWww: canonical === `${SITE_URL}/sitemap`,
    ogImageFallbackPresent: /property=["']og:image["'][^>]+content=["']https:\/\/www\.ilovecoloringpage\.com\/og\/home\.jpg["']/i.test(html),
    twitterLargeImagePresent: /name=["']twitter:card["'][^>]+content=["']summary_large_image["']/i.test(html),
    jsonLdPresent: jsonLdScripts.length > 0,
    jsonLdParses: parseErrors.length === 0,
    jsonLdUsesAllowedWebPageSchema: flattenTypes(parsedJsonLd).includes("WebPage") && !flattenTypes(parsedJsonLd).some((type) => ["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"].includes(type)),
    noSvgMetadata: !/(?:property=["']og:image["'][^>]+content=["'][^"']+\.svg|name=["']twitter:image["'][^>]+content=["'][^"']+\.svg|"image"\s*:\s*"[^"]+\.svg|\/svg\/)/i.test(html),
  };
  summary.metadataPassed = Object.values(summary).every((value) => value === true || value === "/sitemap");

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-html-sitemap-metadata-results",
    canonical,
    summary,
    jsonLdTypes: flattenTypes(parsedJsonLd),
    parseErrors,
    blockers: blockersFromSummary(summary, "metadataPassed"),
  };
}

async function buildSitemapLocalCheck(build) {
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const sitemapPath = path.join(build.outDir, "sitemap.xml");
  const imageSitemapPath = path.join(build.outDir, "image-sitemap.xml");
  const robotsPath = path.join(build.outDir, "robots.txt");
  const sitemap = await fsp.readFile(sitemapPath, "utf8");
  const imageSitemap = await fsp.readFile(imageSitemapPath, "utf8");
  const robots = await fsp.readFile(robotsPath, "utf8");
  const sitemapLocs = extractXmlLocs(sitemap);
  const expectedHubLocs = runtimeSiteMap.entries.map((entry) => `${SITE_URL}${entry.path}`);
  const backlogSlugs = new Set([
    ...(runtimeHubs.backlogHubs || []).map((hub) => hub.slug),
    ...(runtimeHubs.sectionOnlyTopics || []).map((hub) => hub.slug),
  ]);
  const manualReviewBacklogRoutes = sitemapLocs.filter((loc) => {
    const slug = loc.match(/\/coloring-pages\/([^/<]+)/)?.[1] || "";
    return backlogSlugs.has(slug) || /manual-review|backlog|rejected/i.test(loc);
  });
  const summary = {
    sitemapXmlExistsInOut: fs.existsSync(sitemapPath),
    imageSitemapXmlExistsInOut: fs.existsSync(imageSitemapPath),
    robotsTxtExistsInOut: fs.existsSync(robotsPath),
    robotsReferencesRegularSitemap: robots.includes(`${SITE_URL}/sitemap.xml`),
    robotsReferencesImageSitemap: robots.includes(`${SITE_URL}/image-sitemap.xml`),
    sitemapIncludesHtmlSitemap: sitemapLocs.includes(`${SITE_URL}/sitemap`),
    sitemapIncludesPublicHubRoutes: expectedHubLocs.every((loc) => sitemapLocs.includes(loc)),
    sitemapLocCount: sitemapLocs.length,
    noPerImageRoutes: !sitemapLocs.some(isPerImageRoute),
    noManualReviewBacklogRoutes: manualReviewBacklogRoutes.length === 0,
    noDuplicateRoutes: new Set(sitemapLocs).size === sitemapLocs.length,
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>/g),
    imageSitemapExcludesSvgPngThumbs: !/\/svg\/|\.svg(?:<|$)|\/png\/|\/thumbs\//i.test(imageSitemap),
    noLocalhostOrR2Dev: !/localhost|127\.0\.0\.1|r2\.dev|r2\.cloudflarestorage\.com/i.test(`${sitemap}\n${imageSitemap}\n${robots}`),
    noDuplicateColoringPagesPrefix: !/coloring-pages\/coloring-pages/i.test(`${sitemap}\n${imageSitemap}`),
  };
  summary.sitemapLocalCheckPassed =
    summary.sitemapXmlExistsInOut &&
    summary.imageSitemapXmlExistsInOut &&
    summary.robotsTxtExistsInOut &&
    summary.robotsReferencesRegularSitemap &&
    summary.robotsReferencesImageSitemap &&
    summary.sitemapIncludesHtmlSitemap &&
    summary.sitemapIncludesPublicHubRoutes &&
    summary.noPerImageRoutes &&
    summary.noManualReviewBacklogRoutes &&
    summary.noDuplicateRoutes &&
    summary.imageSitemapWebpEntries === EXPECTED_IMAGE_SITEMAP_ENTRIES &&
    summary.imageSitemapExcludesSvgPngThumbs &&
    summary.noLocalhostOrR2Dev &&
    summary.noDuplicateColoringPagesPrefix;

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-sitemap-local-check-results",
    build,
    summary,
    manualReviewBacklogRoutes,
    blockers: blockersFromSummary(summary, "sitemapLocalCheckPassed"),
  };
}

function renderContextReport(payload) {
  return [
    "# Final Sitemap And Related Context Check",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, renderValue(value)])),
    "",
    `Branch: ${payload.branch}`,
    `Expected commit exists: ${payload.expectedCommit}`,
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderRelatedReport(payload) {
  return [
    "# Final Related Collections Fix",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, renderValue(value)])),
    "",
    payload.implementation.changedSection,
    payload.implementation.relatedHubsSection,
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderMoreWaysReport(payload) {
  return [
    "# Final More Ways Audit",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, renderValue(value)])),
    "",
    payload.decision,
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderHtmlSitemapReport(payload) {
  return [
    "# Final HTML Sitemap Report",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, renderValue(value)])),
    "",
    `Groups: ${payload.groups.join(", ")}`,
    `Missing hub routes: ${payload.missingHubRoutes.length ? payload.missingHubRoutes.join(", ") : "none"}`,
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderMetadataReport(payload) {
  return [
    "# Final HTML Sitemap Metadata Report",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, renderValue(value)])),
    "",
    `Canonical: ${payload.canonical}`,
    `JSON-LD types: ${payload.jsonLdTypes.join(", ")}`,
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderLocalCheckReport(payload) {
  return [
    "# Final Sitemap Local Check Report",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, renderValue(value)])),
    "",
    `Manual review or backlog routes found: ${payload.manualReviewBacklogRoutes.length ? payload.manualReviewBacklogRoutes.join(", ") : "none"}`,
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

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFiles(absoluteRoot)) {
      const normalized = normalizePath(path.relative(REPO_ROOT, file));
      if (!/\.(?:ts|tsx|css|json|md)$/.test(normalized)) continue;
      if (options.skipGeneratedColoring && normalized.startsWith("src/generated/coloring/")) continue;
      chunks.push(await fsp.readFile(file, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFiles(root) {
  if (!fs.existsSync(root)) return [];
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

async function countFiles(root, regex) {
  return (await listFiles(root)).filter((file) => regex.test(file)).length;
}

function extractHrefs(html) {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((href) => href.startsWith("/"))
    .map((href) => href.replace(/\/$/, "") || "/");
}

function extractXmlLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function extractHeadingText(html) {
  return [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => decodeHtml(match[1].trim()));
}

function extractJsonLdScripts(html) {
  return [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => decodeHtml(match[1].trim()));
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

function isPerImageRoute(value) {
  return /\/coloring-pages\/(?!page(?:\/|$))[^/\s<]+\/(?!page(?:\/|$))[^/\s<]+/i.test(value);
}

function isDisallowedPublicMedia(file) {
  const normalized = normalizePath(path.relative(REPO_ROOT, file));
  if (!/\.(?:svg|png|jpe?g|webp|gif|xml|ico)$/i.test(normalized)) return false;
  if (normalized === "public/image-sitemap.xml") return false;
  if (normalized === "public/favicon.ico") return false;
  if (normalized === "public/icon.svg") return false;
  if (/^public\/og\/.+\.jpg$/i.test(normalized)) return false;
  return true;
}

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  return match?.[1] || "";
}

function countMatches(value, regex) {
  return [...value.matchAll(regex)].length;
}

function blockersFromSummary(summary, passKey) {
  return Object.entries(summary)
    .filter(([key, value]) => key !== passKey && key !== "routePath" && typeof value !== "number" && value !== true)
    .map(([key]) => `${key} failed.`);
}

function renderValue(value) {
  if (typeof value === "boolean") return passFail(value);
  return String(value);
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
