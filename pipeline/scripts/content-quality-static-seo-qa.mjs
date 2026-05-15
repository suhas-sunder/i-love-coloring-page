#!/usr/bin/env node

import { createRequire } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  REPO_ROOT,
  countMatches,
  ensureStaticExport,
  readJson,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SITE_URL = "https://www.ilovecoloringpage.com";
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const FORBIDDEN_SCHEMA_TYPES = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"]);
const SAMPLED_ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dodo",
  "/coloring-pages/magic",
  "/coloring-pages/orchid",
  "/coloring-pages/salmon",
  "/sitemap",
  "/about",
  "/contact",
  "/privacy",
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const build = await ensureStaticExport({ force: true });
  const seo = await runStaticSeo(build);
  await writeJson("pipeline/manifests/content-quality-static-seo-results.json", seo);
  await writeText("pipeline/reports/content-quality-static-seo-report.md", renderSeoReport(seo));

  const acceptance = await buildAcceptanceGate(seo);
  await writeJson("pipeline/manifests/content-quality-acceptance-gate.json", acceptance);
  await writeText("pipeline/reports/content-quality-acceptance-gate.md", renderGateReport(acceptance));

  console.log(JSON.stringify({ staticSeoPassed: seo.summary.staticSeoPassed, contentAcceptancePassed: acceptance.summary.contentAcceptancePassed }, null, 2));
  if (!seo.summary.staticSeoPassed || !acceptance.summary.contentAcceptancePassed) process.exitCode = 1;
}

async function runStaticSeo(build) {
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const qualityData = await readJson("src/generated/coloring/hub-content-quality.json");
  const sitemapPath = path.join(build.outDir, "sitemap.xml");
  const imageSitemapPath = path.join(build.outDir, "image-sitemap.xml");
  const robotsPath = path.join(build.outDir, "robots.txt");
  const sitemapHtmlPath = findStaticHtmlPath(build.outDir, "/sitemap");
  const sitemap = await readFileIfExists(sitemapPath);
  const imageSitemap = await readFileIfExists(imageSitemapPath) || await readText("public/image-sitemap.xml");
  const robots = await readFileIfExists(robotsPath);
  const outputScan = await scanOutputText(build.outDir);
  const sitemapLocs = extractLocs(sitemap);
  const hubUrls = runtimeHubs.hubs.map((hub) => `${SITE_URL}${hub.route}`);
  const routeUrls = runtimeSiteMap.entries.map((entry) => `${SITE_URL}${entry.path === "/" ? "" : entry.path}`);
  const sampled = await Promise.all(SAMPLED_ROUTES.map((route) => inspectRouteHtml(build.outDir, route)));
  const jsonLdTypes = sampled.flatMap((entry) => entry.jsonLdTypes);
  const forbiddenSchemaTypesFound = jsonLdTypes.filter((type) => FORBIDDEN_SCHEMA_TYPES.has(type));
  const ogImages = await listFiles(path.join(REPO_ROOT, "public", "og"), /\.jpg$/i);
  const hubOgMissing = runtimeHubs.hubs.filter((hub) => !fs.existsSync(path.join(REPO_ROOT, "public", "og", "hubs", `${hub.slug || "coloring-pages"}.jpg`)));

  const summary = {
    buildPassed: true,
    sitemapExists: Boolean(sitemap),
    sitemapLocCount: sitemapLocs.length,
    sitemapIncludesCurrentRouteSet: routeUrls.every((url) => sitemap.includes(url)),
    sitemapIncludesHtmlSitemap: sitemap.includes(`${SITE_URL}/sitemap`),
    sitemapIncludesAllHubs: hubUrls.every((url) => sitemap.includes(url)),
    sitemapExcludesPerImageRoutes: !/\/coloring-pages\/[^/\s<]+\/[^/\s<]+/i.test(sitemap),
    sitemapExcludesManualBacklog: !/manual-review|backlog|rejected/i.test(sitemap),
    imageSitemapExists: Boolean(imageSitemap),
    imageSitemapWebpEntries: countMatches(imageSitemap, /<image:loc>[^<]+\.webp<\/image:loc>/g),
    imageSitemapWebpEntriesPassed: countMatches(imageSitemap, /<image:loc>[^<]+\.webp<\/image:loc>/g) === EXPECTED_IMAGE_SITEMAP_ENTRIES,
    imageSitemapExcludesSvgPngThumbs: !/<image:loc>[^<]+\.(?:svg|png)<\/image:loc>|thumbs?\//i.test(imageSitemap),
    robotsExists: Boolean(robots),
    robotsReferencesBothSitemaps: robots.includes(`${SITE_URL}/sitemap.xml`) && robots.includes(`${SITE_URL}/image-sitemap.xml`),
    htmlSitemapExists: Boolean(sitemapHtmlPath && fs.existsSync(sitemapHtmlPath)),
    ogImagesExist: ogImages.length > 0,
    hubOgImagesExist: hubOgMissing.length === 0,
    jsonLdExistsForSampledRoutes: sampled.every((entry) => entry.jsonLdCount > 0),
    jsonLdParses: sampled.every((entry) => entry.jsonLdParses),
    noForbiddenSchemaTypes: forbiddenSchemaTypesFound.length === 0,
    canonicalWwwDomain: sampled.every((entry) => entry.canonicalWwwDomain),
    noPerImageRoutes: !(await hasPerImageStaticRoutes(build.outDir)),
    noAppApi: !fs.existsSync(path.join(REPO_ROOT, "app", "api")) && outputScan.appApiMatches === 0,
    noLocalhostR2DevPrivateEndpoints: outputScan.privateEndpointMatches === 0,
    noSvgDownload: outputScan.svgDownloadMatches === 0,
    hubContentRecords: qualityData.hubs.length,
    allHubsHaveContent: qualityData.hubs.length === runtimeHubs.hubs.length,
  };
  summary.staticSeoPassed =
    summary.sitemapExists &&
    summary.sitemapIncludesCurrentRouteSet &&
    summary.sitemapIncludesHtmlSitemap &&
    summary.sitemapIncludesAllHubs &&
    summary.sitemapExcludesPerImageRoutes &&
    summary.sitemapExcludesManualBacklog &&
    summary.imageSitemapExists &&
    summary.imageSitemapWebpEntriesPassed &&
    summary.imageSitemapExcludesSvgPngThumbs &&
    summary.robotsExists &&
    summary.robotsReferencesBothSitemaps &&
    summary.htmlSitemapExists &&
    summary.ogImagesExist &&
    summary.hubOgImagesExist &&
    summary.jsonLdExistsForSampledRoutes &&
    summary.jsonLdParses &&
    summary.noForbiddenSchemaTypes &&
    summary.canonicalWwwDomain &&
    summary.noPerImageRoutes &&
    summary.noAppApi &&
    summary.noLocalhostR2DevPrivateEndpoints &&
    summary.noSvgDownload &&
    summary.allHubsHaveContent;

  return {
    generatedAt: new Date().toISOString(),
    runId: "content-quality-static-seo",
    build,
    sampledRoutes: sampled,
    sitemapLocCount: sitemapLocs.length,
    routeCountExpected: runtimeSiteMap.entries.length,
    hubCountExpected: runtimeHubs.hubs.length,
    ogJpgCount: ogImages.length,
    outputScan,
    hubOgMissing: hubOgMissing.map((hub) => hub.route),
    forbiddenSchemaTypesFound,
    summary,
    blockers: buildSeoBlockers(summary, hubOgMissing, forbiddenSchemaTypesFound),
  };
}

async function buildAcceptanceGate(seo) {
  const generated = await readJson("pipeline/manifests/content-quality-generated-data.json");
  const score = await readJson("pipeline/manifests/content-quality-score-results.json");
  const metadata = await readJson("pipeline/manifests/content-quality-metadata-results.json");
  const jsonld = await readJson("pipeline/manifests/content-quality-jsonld-regression.json");
  const adsense = await readJson("pipeline/manifests/content-quality-adsense-readiness.json");
  const browser = await readJson("pipeline/manifests/content-quality-browser-qa-results.json");
  const summary = {
    hubs_checked: generated.summary.hubsChecked,
    hubs_updated: generated.summary.hubsUpdated,
    uniqueness_passed: score.summary.uniquenessPassed,
    boilerplate_risk_passed: score.summary.boilerplateRiskPassed,
    helpfulness_passed: score.summary.helpfulnessPassed,
    gallery_first_passed: score.summary.galleryFirstPassed && browser.summary.galleryStillAppearsEarly,
    metadata_passed: metadata.summary.descriptionsUnique && metadata.summary.titlesNatural && metadata.summary.noSvgClaims && metadata.summary.noOnlineColoringClaims,
    jsonld_regression_passed: jsonld.summary.collectionPagePresent && jsonld.summary.breadcrumbListPresent && jsonld.summary.noFaqSchema && jsonld.summary.noSvgUrls,
    browser_qa_passed: browser.summary.browserQaPassed,
    static_export_passed: seo.summary.buildPassed,
    static_seo_passed: seo.summary.staticSeoPassed,
    adsense_readiness_improved: adsense.summary.uniqueRelevantContentImproved && adsense.summary.clearNavigationPresent && adsense.summary.noMisleadingContent,
    ready_for_final_local_acceptance_rerun: false,
    ready_for_netlify_deployment: false,
    ready_for_live_ads_round: false,
    blockers: [],
  };
  summary.ready_for_final_local_acceptance_rerun =
    summary.uniqueness_passed &&
    summary.boilerplate_risk_passed &&
    summary.helpfulness_passed &&
    summary.gallery_first_passed &&
    summary.metadata_passed &&
    summary.jsonld_regression_passed &&
    summary.browser_qa_passed &&
    summary.static_export_passed &&
    summary.static_seo_passed &&
    summary.adsense_readiness_improved;
  summary.ready_for_netlify_deployment = summary.ready_for_final_local_acceptance_rerun;
  summary.ready_for_live_ads_round = false;
  summary.contentAcceptancePassed = summary.ready_for_final_local_acceptance_rerun && !summary.ready_for_live_ads_round;
  summary.blockers = buildGateBlockers(summary);
  return {
    generatedAt: new Date().toISOString(),
    runId: "content-quality-acceptance-gate",
    summary,
  };
}

async function inspectRouteHtml(outDir, route) {
  const html = await readStaticHtml(outDir, route);
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const parsed = [];
  let jsonLdParses = true;
  for (const block of jsonLdBlocks) {
    try {
      parsed.push(JSON.parse(unescapeHtml(block)));
    } catch {
      jsonLdParses = false;
    }
  }
  return {
    route,
    jsonLdCount: jsonLdBlocks.length,
    jsonLdParses,
    jsonLdTypes: flattenTypes(parsed),
    canonicalWwwDomain: new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${escapeRegex(SITE_URL)}`).test(html),
    titlePresent: /<title>[^<]+<\/title>/.test(html),
    descriptionPresent: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']+["']/.test(html),
  };
}

async function readStaticHtml(outDir, route) {
  const safe = route.replace(/^\/+/, "");
  const candidates = safe ? [path.join(outDir, safe, "index.html"), path.join(outDir, `${safe}.html`)] : [path.join(outDir, "index.html")];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fsp.readFile(candidate, "utf8");
  }
  throw new Error(`Missing static HTML for ${route}`);
}

function buildSeoBlockers(summary, hubOgMissing, forbiddenSchemaTypesFound) {
  const blockers = [];
  for (const [key, value] of Object.entries(summary)) {
    if (["sitemapLocCount", "imageSitemapWebpEntries", "hubContentRecords", "staticSeoPassed"].includes(key)) continue;
    if (value !== true) blockers.push(key);
  }
  if (hubOgMissing.length) blockers.push(`Missing hub OG images: ${hubOgMissing.slice(0, 10).map((hub) => hub.route).join(", ")}`);
  if (forbiddenSchemaTypesFound.length) blockers.push(`Forbidden schema types: ${[...new Set(forbiddenSchemaTypesFound)].join(", ")}`);
  return blockers;
}

function buildGateBlockers(summary) {
  const blockers = [];
  for (const [key, value] of Object.entries(summary)) {
    if (["hubs_checked", "hubs_updated", "ready_for_live_ads_round", "ready_for_netlify_deployment", "ready_for_final_local_acceptance_rerun", "contentAcceptancePassed", "blockers"].includes(key)) continue;
    if (value !== true) blockers.push(key);
  }
  return blockers;
}

function renderSeoReport(payload) {
  return `# Content Quality Static SEO QA

${renderTable(Object.entries(payload.summary).map(([key, value]) => [key, value]))}

## Sampled JSON-LD Routes
${payload.sampledRoutes.map((route) => `- ${route.route}: ${route.jsonLdCount} JSON-LD script(s), types ${route.jsonLdTypes.join(", ") || "none"}`).join("\n")}

## Blockers
${payload.blockers.length ? payload.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function renderGateReport(payload) {
  return `# Content Quality Acceptance Gate

${renderTable(Object.entries(payload.summary).filter(([key]) => key !== "blockers").map(([key, value]) => [key, value]))}

## Blockers
${payload.summary.blockers.length ? payload.summary.blockers.map((item) => `- ${item}`).join("\n") : "- None."}

Live ads remain deferred. This local readiness work does not guarantee AdSense approval.
`;
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function flattenTypes(value) {
  const types = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node["@type"]) types.push(node["@type"]);
    for (const child of Object.values(node)) visit(child);
  };
  visit(value);
  return types;
}

async function readFileIfExists(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function scanOutputText(root) {
  const scan = {
    filesScanned: 0,
    perImageRouteMatches: 0,
    appApiMatches: 0,
    privateEndpointMatches: 0,
    svgDownloadMatches: 0,
    samples: [],
  };
  for (const file of await listFiles(root, /\.(?:html|xml|txt|js|css|json)$/i)) {
    const text = await fsp.readFile(file, "utf8");
    scan.filesScanned += 1;
    addMatches(scan, "perImageRouteMatches", file, text, /<loc>[^<]+\/coloring-pages\/[^/<]+\/[^/<]+<\/loc>/gi);
    addMatches(scan, "appApiMatches", file, text, /(?:href|src)=["'][^"']*\/api\/|fetch\(["']\/api\//gi);
    addMatches(scan, "privateEndpointMatches", file, text, /https?:\/\/(?:localhost|127\.0\.0\.1|[^"'\s<>]+r2\.dev|[^"'\s<>]+r2\.cloudflarestorage\.com)/gi);
    addMatches(scan, "svgDownloadMatches", file, text, /Download SVG|downloadSvg\b|svgDownload/gi);
  }
  return scan;
}

function findStaticHtmlPath(outDir, route) {
  const safe = route.replace(/^\/+/, "");
  const candidates = safe ? [path.join(outDir, safe, "index.html"), path.join(outDir, `${safe}.html`)] : [path.join(outDir, "index.html")];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

async function hasPerImageStaticRoutes(outDir) {
  const coloringRoot = path.join(outDir, "coloring-pages");
  if (!fs.existsSync(coloringRoot)) return false;
  const files = await listFiles(coloringRoot, /\.html$/i);
  return files.some((file) => {
    const relative = path.relative(coloringRoot, file).replace(/\\/g, "/");
    if (/^[^/]+\/page\/\d+\.html$/i.test(relative)) return false;
    return relative.split("/").length > 2;
  });
}

function addMatches(scan, key, file, text, regex) {
  const matches = [...text.matchAll(regex)];
  scan[key] += matches.length;
  for (const match of matches.slice(0, 3)) {
    if (scan.samples.length < 20) scan.samples.push({ file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"), key, value: match[0] });
  }
}

async function listFiles(root, pattern) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFiles(absolute, pattern));
    } else if (pattern.test(absolute)) {
      results.push(absolute);
    }
  }
  return results;
}

function unescapeHtml(value) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
