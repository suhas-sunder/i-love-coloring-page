#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const SAFE_URL_LIMIT = 45_000;
const SAFE_BYTE_LIMIT = 45 * 1024 * 1024;
const MANIFEST_PATH = "pipeline/manifests/crawl-indexation-validation.json";
const REPORT_PATH = "pipeline/reports/crawl-indexation-validation.md";

if (!existsSync(OUT)) {
  console.error("Crawl/indexation validation not_run: out/ does not exist.");
  process.exit(2);
}

const runtime = readJson("src/generated/coloring/runtime-printables.json");
const frozen = readJson("pipeline/manifests/runtime-printable-route-manifest.json");
const hubs = readJson("src/generated/coloring/runtime-hubs.json");
const publicRoutes = readJson("src/generated/coloring/runtime-routes.json");
const deferred = readJson("src/generated/coloring/runtime-deferred-items.json");
const imageData = readJson("pipeline/manifests/image-sitemap-data.json");
const trustPaths = parseTrustPaths(readText("src/lib/trust/trustPages.ts"));
const printablePaths = new Set(runtime.records.map((record) => record.canonicalPath));
const deferredIds = new Set(deferred.records.map((record) => record.assetId));
const paginationPaths = hubs.hubs
  .filter((hub) => hub.route !== "/coloring-pages" && hub.indexable && hub.sitemap)
  .flatMap((hub) => Array.from(
    { length: Math.max(0, Math.ceil(hub.assetIds.length / hub.galleryPageSize) - 1) },
    (_, index) => `${hub.route}/page/${index + 2}`,
  ));
const expectedRegularPaths = [
  "/",
  ...publicRoutes.routes.filter((route) => route.indexable && route.sitemap).map((route) => route.path),
  ...runtime.records.map((record) => record.canonicalPath),
  ...trustPaths,
  "/sitemap",
];
const expectedRegularUrls = expectedRegularPaths.map(absoluteUrl);

const sitemapPath = path.join(OUT, "sitemap.xml");
const imageSitemapPath = path.join(OUT, "image-sitemap.xml");
const robotsPath = path.join(OUT, "robots.txt");
const sitemapXml = readFileSync(sitemapPath, "utf8");
const imageSitemapXml = readFileSync(imageSitemapPath, "utf8");
const robots = readFileSync(robotsPath, "utf8");
const regularUrls = extractLocs(sitemapXml);
const imagePairs = parseImagePairs(imageSitemapXml);
const regularSet = new Set(regularUrls);
const imagePairByPage = new Map(imagePairs.map((entry) => [entry.pageUrl, entry]));
const expectedImageByPage = new Map(imageData.imageEntries.map((entry) => [entry.pageUrl, entry]));

const mismatches = [];
const internalLinkFindings = [];
let printableHtmlCount = 0;
let internalPrintableLinkCount = 0;

for (const record of runtime.records) {
  const pageUrl = absoluteUrl(record.canonicalPath);
  const imageUrl = `${ASSET_BASE_URL}/${record.webpPath}`;
  const htmlPath = outputHtmlPath(record.canonicalPath);
  if (!existsSync(htmlPath)) {
    mismatches.push({ path: record.canonicalPath, system: "static-export", actual: "missing" });
    continue;
  }
  printableHtmlCount += 1;
  const html = readFileSync(htmlPath, "utf8");
  const canonical = extractAttributeTag(html, "link", "rel", "canonical", "href");
  const ogUrl = extractAttributeTag(html, "meta", "property", "og:url", "content");
  const jsonLd = extractJsonLdById(html, "printable-jsonld");
  const webpage = jsonLd.find((entry) => entry?.["@type"] === "WebPage");
  const breadcrumb = jsonLd.find((entry) => entry?.["@type"] === "BreadcrumbList");
  const imageObject = jsonLd.find((entry) => entry?.["@type"] === "ImageObject");
  const breadcrumbFinal = breadcrumb?.itemListElement?.at(-1)?.item;
  const imagePair = imagePairByPage.get(pageUrl);

  compare(record.canonicalPath, "html-canonical", canonical, pageUrl);
  compare(record.canonicalPath, "regular-sitemap", regularSet.has(pageUrl) ? pageUrl : "missing", pageUrl);
  compare(record.canonicalPath, "image-sitemap-page", imagePair?.pageUrl || "missing", pageUrl);
  compare(record.canonicalPath, "open-graph", ogUrl, pageUrl);
  compare(record.canonicalPath, "jsonld-webpage", webpage?.url, pageUrl);
  compare(record.canonicalPath, "jsonld-breadcrumb-final", breadcrumbFinal, pageUrl);
  compare(record.canonicalPath, "jsonld-image-content", imageObject?.contentUrl, imageUrl);
  compare(record.canonicalPath, "image-sitemap-webp", imagePair?.imageUrl, imageUrl);

  const printableLinks = [...html.matchAll(/href="(\/printables\/[^"?#]+)"/g)].map((match) => match[1]);
  internalPrintableLinkCount += printableLinks.length;
  for (const href of printableLinks) {
    if (!printablePaths.has(href)) internalLinkFindings.push({ source: record.canonicalPath, href });
  }
}

function compare(route, system, actual, expected) {
  if (actual !== expected) mismatches.push({ path: route, system, expected, actual: actual ?? "missing" });
}

const indexablePaths = ["/", ...publicRoutes.routes.map((route) => route.path), ...paginationPaths, ...trustPaths, "/sitemap"];
const canonicalPageFindings = [];
for (const routePath of indexablePaths) {
  const htmlPath = outputHtmlPath(routePath);
  if (!existsSync(htmlPath)) {
    canonicalPageFindings.push({ path: routePath, issue: "missing-static-html" });
    continue;
  }
  const canonical = extractAttributeTag(readFileSync(htmlPath, "utf8"), "link", "rel", "canonical", "href");
  if (canonical !== absoluteUrl(routePath)) canonicalPageFindings.push({ path: routePath, issue: "canonical-mismatch", canonical });
}

const sitemapHtml = readFileSync(outputHtmlPath("/sitemap"), "utf8");
const sitemapHtmlLinks = [...sitemapHtml.matchAll(/<a\b[^>]*href="(\/[^"?#]*)"/g)].map((match) => match[1]);
const uniqueHtmlSitemapLinks = [...new Set(sitemapHtmlLinks)];
const brokenHtmlSitemapLinks = uniqueHtmlSitemapLinks.filter((href) => !outputRouteExists(href));
const missingHtmlSitemapHubs = publicRoutes.routes
  .filter((route) => route.indexable && route.sitemap)
  .map((route) => route.path)
  .filter((routePath) => !uniqueHtmlSitemapLinks.includes(routePath));
const missingHtmlSitemapTrust = trustPaths.filter((routePath) => !uniqueHtmlSitemapLinks.includes(routePath));

const structuredItemFindings = [];
for (const routePath of ["/", ...publicRoutes.routes.map((route) => route.path)]) {
  const html = readFileSync(outputHtmlPath(routePath), "utf8");
  for (const script of extractAllJsonLd(html)) {
    for (const item of findItemListEntries(script)) {
      const pathname = safePathname(item?.url || item?.item || "");
      if (pathname?.startsWith("/printables/") && !printablePaths.has(pathname)) structuredItemFindings.push({ routePath, item: pathname });
    }
  }
}

const duplicateRegularUrls = findDuplicates(regularUrls);
const duplicateImagePages = findDuplicates(imagePairs.map((entry) => entry.pageUrl));
const duplicateImageUrls = findDuplicates(imagePairs.map((entry) => entry.imageUrl));
const missingRegularUrls = expectedRegularUrls.filter((url) => !regularSet.has(url));
const unexpectedRegularUrls = regularUrls.filter((url) => !new Set(expectedRegularUrls).has(url));
const imagePairMismatches = imagePairs.filter((entry) => {
  const expected = expectedImageByPage.get(entry.pageUrl);
  return !expected || expected.imageUrl !== entry.imageUrl || expected.imageTitle !== entry.imageTitle;
});

const summary = {
  passed: false,
  runtimePrintableCount: runtime.records.length,
  frozenPrintableCount: frozen.routes.length,
  deferredRuntimeCount: runtime.summary.deferredRecordCount,
  separatelyDeferredCount: deferred.records.length,
  publicHubCount: publicRoutes.routes.length,
  paginationCount: paginationPaths.length,
  trustPageCount: trustPaths.length,
  expectedRegularSitemapCount: expectedRegularUrls.length,
  regularSitemapCount: regularUrls.length,
  regularSitemapBytes: statSync(sitemapPath).size,
  imageSitemapPairCount: imagePairs.length,
  imageSitemapBytes: statSync(imageSitemapPath).size,
  printableHtmlCount,
  htmlSitemapLinkCount: uniqueHtmlSitemapLinks.length,
  internalPrintableLinkCount,
  canonicalMismatchCount: mismatches.length,
  canonicalPageFindingCount: canonicalPageFindings.length,
  internalLinkFindingCount: internalLinkFindings.length,
  structuredItemFindingCount: structuredItemFindings.length,
  duplicateRegularUrlCount: duplicateRegularUrls.length,
  duplicateImagePageCount: duplicateImagePages.length,
  duplicateImageUrlCount: duplicateImageUrls.length,
  imagePairMismatchCount: imagePairMismatches.length,
  missingRegularUrlCount: missingRegularUrls.length,
  unexpectedRegularUrlCount: unexpectedRegularUrls.length,
  brokenHtmlSitemapLinkCount: brokenHtmlSitemapLinks.length,
  missingHtmlSitemapHubCount: missingHtmlSitemapHubs.length,
  missingHtmlSitemapTrustCount: missingHtmlSitemapTrust.length,
  htmlSitemapPrintableLinkCount: uniqueHtmlSitemapLinks.filter((href) => href.startsWith("/printables/")).length,
  regularSitemapUnderSafeUrlThreshold: regularUrls.length < SAFE_URL_LIMIT,
  regularSitemapUnderSafeByteThreshold: statSync(sitemapPath).size < SAFE_BYTE_LIMIT,
  imageSitemapUnderSafeUrlThreshold: imagePairs.length < SAFE_URL_LIMIT,
  imageSitemapUnderSafeByteThreshold: statSync(imageSitemapPath).size < SAFE_BYTE_LIMIT,
  robotsReferencesRegularSitemap: robots.includes(`${SITE_URL}/sitemap.xml`),
  robotsReferencesImageSitemap: robots.includes(`${SITE_URL}/image-sitemap.xml`),
  robotsAllowsPrintables: !/Disallow:\s*\/printables/i.test(robots),
  robotsHasNoCrawlDelay: !/crawl-delay/i.test(robots),
  productionDomainSafe: !/localhost|127\.0\.0\.1|r2\.dev|cloudflarestorage|amazonaws|[A-Za-z]:\\/i.test(`${sitemapXml}\n${imageSitemapXml}\n${robots}`),
  noQueryOrFragmentSitemapUrls: [...regularUrls, ...imagePairs.flatMap((entry) => [entry.pageUrl, entry.imageUrl])].every((url) => !/[?#]/.test(url)),
  noDeferredPrintableRecords: runtime.records.every((record) => !deferredIds.has(record.assetId)),
};

summary.passed = Object.entries(summary)
  .filter(([key, value]) => key !== "passed" && typeof value === "boolean")
  .every(([, value]) => value)
  && summary.runtimePrintableCount === 6352
  && summary.frozenPrintableCount === 6352
  && summary.deferredRuntimeCount === 0
  && summary.publicHubCount === 163
  && summary.paginationCount === 389
  && summary.regularSitemapCount === summary.expectedRegularSitemapCount
  && summary.imageSitemapPairCount === summary.runtimePrintableCount
  && summary.printableHtmlCount === summary.runtimePrintableCount
  && [
    summary.canonicalMismatchCount,
    summary.canonicalPageFindingCount,
    summary.internalLinkFindingCount,
    summary.structuredItemFindingCount,
    summary.duplicateRegularUrlCount,
    summary.duplicateImagePageCount,
    summary.duplicateImageUrlCount,
    summary.imagePairMismatchCount,
    summary.missingRegularUrlCount,
    summary.unexpectedRegularUrlCount,
    summary.brokenHtmlSitemapLinkCount,
    summary.missingHtmlSitemapHubCount,
    summary.missingHtmlSitemapTrustCount,
    summary.htmlSitemapPrintableLinkCount,
  ].every((count) => count === 0);

const result = {
  generatedAt: frozen.generatedAt,
  runId: "canonical-crawl-indexation-validation",
  summary,
  findings: {
    canonicalMismatches: mismatches.slice(0, 50),
    canonicalPages: canonicalPageFindings.slice(0, 50),
    internalLinks: internalLinkFindings.slice(0, 50),
    structuredItems: structuredItemFindings.slice(0, 50),
    duplicateRegularUrls,
    duplicateImagePages,
    duplicateImageUrls,
    imagePairMismatches: imagePairMismatches.slice(0, 50),
    missingRegularUrls: missingRegularUrls.slice(0, 50),
    unexpectedRegularUrls: unexpectedRegularUrls.slice(0, 50),
    brokenHtmlSitemapLinks,
    missingHtmlSitemapHubs,
    missingHtmlSitemapTrust,
  },
};

writeArtifact(MANIFEST_PATH, `${JSON.stringify(result, null, 2)}\n`);
writeArtifact(REPORT_PATH, buildReport(result));
console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exitCode = 1;

function outputHtmlPath(routePath) {
  return routePath === "/" ? path.join(OUT, "index.html") : path.join(OUT, `${routePath.slice(1)}.html`);
}

function outputRouteExists(routePath) {
  return existsSync(outputHtmlPath(routePath));
}

function absoluteUrl(routePath) {
  return routePath === "/" ? SITE_URL : `${SITE_URL}${routePath}`;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => unescapeXml(match[1].trim()));
}

function parseImagePairs(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
    pageUrl: extractTag(match[1], "loc"),
    imageUrl: extractTag(match[1], "image:loc"),
    imageTitle: extractTag(match[1], "image:title"),
  }));
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return unescapeXml(match?.[1]?.trim() || "");
}

function extractAttributeTag(html, tag, identifyingAttribute, identifyingValue, resultAttribute) {
  const matches = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))];
  const target = matches.map((match) => match[0]).find((value) => new RegExp(`${identifyingAttribute}="${escapeRegExp(identifyingValue)}"`, "i").test(value));
  return target?.match(new RegExp(`${resultAttribute}="([^"]*)"`, "i"))?.[1] || "";
}

function extractJsonLdById(html, id) {
  const match = html.match(new RegExp(`<script[^>]*id="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!match) return [];
  const parsed = JSON.parse(match[1]);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function extractAllJsonLd(html) {
  return [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function findItemListEntries(value) {
  const results = [];
  visit(value);
  return results;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node["@type"] === "ItemList" && Array.isArray(node.itemListElement)) results.push(...node.itemListElement);
    for (const child of Object.values(node)) visit(child);
  }
}

function safePathname(value) {
  try { return new URL(value).pathname; } catch { return ""; }
}

function parseTrustPaths(source) {
  return [...source.matchAll(/path:\s*"([^"]+)"[\s\S]*?indexable:\s*true/g)].map((match) => match[1]);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function unescapeXml(value) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function writeArtifact(relativePath, contents) {
  const absolutePath = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
}

function buildReport(result) {
  const rows = Object.entries(result.summary).map(([key, value]) => `| ${key} | ${value} |`).join("\n");
  return `# Crawl and Indexation Validation\n\n| Check | Result |\n| --- | --- |\n${rows}\n\n${result.summary.passed ? "All crawl and canonical consistency gates passed." : "One or more crawl and canonical consistency gates failed."}\n`;
}
