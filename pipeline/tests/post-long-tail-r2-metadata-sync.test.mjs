import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const PROMOTED_COUNT = 32;
const EXPECTED_RUNTIME_HUB_COUNT = 163;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_IMAGE_SITEMAP_ENTRIES = 6352;
const forbiddenSchemaTypes = new Set(["Review", "AggregateRating", "Product", "Offer", "FAQPage", "SearchAction"]);

const requiredManifestPaths = [
  "pipeline/manifests/post-long-tail-r2-context-check.json",
  "pipeline/manifests/post-long-tail-r2-promoted-hub-audit.json",
  "pipeline/manifests/post-long-tail-r2-sitemap-sync.json",
  "pipeline/manifests/post-long-tail-r2-image-sitemap-sync.json",
  "pipeline/manifests/post-long-tail-r2-og-sync.json",
  "pipeline/manifests/post-long-tail-r2-jsonld-sync.json",
  "pipeline/manifests/post-long-tail-r2-navigation-search-audit.json",
  "pipeline/manifests/post-long-tail-r2-browser-qa-results.json",
  "pipeline/manifests/post-long-tail-r2-sampled-url-check-results.json",
  "pipeline/manifests/post-long-tail-r2-acceptance-gate.json",
];

const requiredReportPaths = [
  "pipeline/reports/post-long-tail-r2-context-check.md",
  "pipeline/reports/post-long-tail-r2-promoted-hub-audit.md",
  "pipeline/reports/post-long-tail-r2-sitemap-sync-report.md",
  "pipeline/reports/post-long-tail-r2-image-sitemap-sync-report.md",
  "pipeline/reports/post-long-tail-r2-og-sync-report.md",
  "pipeline/reports/post-long-tail-r2-jsonld-sync-report.md",
  "pipeline/reports/post-long-tail-r2-navigation-search-audit.md",
  "pipeline/reports/post-long-tail-r2-browser-qa-report.md",
  "pipeline/reports/post-long-tail-r2-sampled-url-check-report.md",
  "pipeline/reports/post-long-tail-r2-acceptance-gate.md",
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function pathExists(relativePath) {
  return existsSync(path.join(repoRoot, relativePath));
}

function gitStatus(...paths) {
  return execFileSync("git", ["status", "--short", "--", ...paths], { cwd: repoRoot, encoding: "utf8" }).trim();
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

test("post-R2 metadata sync manifests and reports exist and parse", () => {
  for (const manifestPath of requiredManifestPaths) {
    assert.ok(pathExists(manifestPath), `${manifestPath} should exist`);
    assert.doesNotThrow(() => readJson(manifestPath), `${manifestPath} should parse`);
  }

  for (const reportPath of requiredReportPaths) {
    assert.ok(pathExists(reportPath), `${reportPath} should exist`);
    assert.ok(readText(reportPath).trim().length > 40, `${reportPath} should not be empty`);
  }
});

test("the 32 promoted hubs are route-ready and metadata-synchronized", () => {
  const promoted = readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json").hubs;
  const audit = readJson("pipeline/manifests/post-long-tail-r2-promoted-hub-audit.json");
  const runtimeHubs = readJson("src/generated/coloring/runtime-hubs.json").hubs;
  const runtimeRoutes = readJson("src/generated/coloring/runtime-routes.json").routes;
  const runtimeSiteMap = readJson("src/generated/coloring/runtime-site-map.json").entries;
  const ogImages = readJson("src/generated/coloring/og-images.json");
  const jsonLdRoutes = readJson("pipeline/manifests/jsonld-route-data.json").routes;

  assert.equal(promoted.length, PROMOTED_COUNT);
  assert.equal(audit.summary.promotedHubCount, PROMOTED_COUNT);
  assert.equal(audit.summary.allPromotedHubsPassed, true);

  const hubBySlug = new Map(runtimeHubs.map((hub) => [hub.slug, hub]));
  const routeByPath = new Map(runtimeRoutes.map((route) => [route.path, route]));
  const sitemapPaths = new Set(runtimeSiteMap.map((entry) => entry.path));
  const jsonLdByPath = new Map(jsonLdRoutes.map((entry) => [entry.path, entry]));

  for (const promotedHub of promoted) {
    const routePath = `/coloring-pages/${promotedHub.slug}`;
    const hub = hubBySlug.get(promotedHub.slug);
    const route = routeByPath.get(routePath);
    const og = ogImages.metadataByPath[routePath];
    const jsonLd = jsonLdByPath.get(routePath);

    assert.ok(hub, `${promotedHub.slug} hub should exist`);
    assert.equal(hub.title, promotedHub.title);
    assert.equal(hub.assetCount, promotedHub.assetCount);
    assert.equal(hub.route, routePath);
    assert.ok(hub.assetIds.length >= promotedHub.assetCount);
    assert.ok(route, `${routePath} route should exist`);
    assert.equal(route.indexable, true);
    assert.equal(route.sitemap, true);
    assert.ok(sitemapPaths.has(routePath), `${routePath} should be in runtime sitemap`);
    assert.ok(og, `${routePath} should have OG metadata`);
    assert.match(og.ogImagePath, new RegExp(`^/og/hubs/${promotedHub.slug}\\.jpg$`));
    assert.ok(pathExists(`public/og/hubs/${promotedHub.slug}.jpg`), `${promotedHub.slug} OG image should exist`);
    assert.equal(og.width, 1200);
    assert.equal(og.height, 630);
    assert.ok(jsonLd, `${routePath} should have JSON-LD route data`);
    assert.ok(jsonLd.schemaTypes.includes("CollectionPage"));
    assert.ok(jsonLd.schemaTypes.includes("BreadcrumbList"));
    assert.ok(jsonLd.schemaTypes.includes("ItemList"));
    assert.ok(jsonLd.itemListItems.length <= 8);
  }
});

test("regular and image sitemaps include promoted hubs without unsafe routes or media URLs", () => {
  const sitemapSync = readJson("pipeline/manifests/post-long-tail-r2-sitemap-sync.json");
  const imageSync = readJson("pipeline/manifests/post-long-tail-r2-image-sitemap-sync.json");
  const promoted = readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json").hubs;
  const runtimeSiteMap = readJson("src/generated/coloring/runtime-site-map.json").entries;
  const imageSitemap = readText("public/image-sitemap.xml");

  assert.equal(sitemapSync.summary.regularSitemapPassed, true);
  assert.equal(sitemapSync.summary.locCount, EXPECTED_RUNTIME_HUB_COUNT);
  assert.equal(imageSync.summary.imageSitemapPassed, true);
  assert.equal(imageSync.summary.imageEntryCount, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.equal((imageSitemap.match(/<image:loc>/g) || []).length, EXPECTED_IMAGE_SITEMAP_ENTRIES);
  assert.doesNotMatch(imageSitemap, /\/svg\/|\.svg(?:<|$)|\/png\/|\/thumbs\/|localhost|127\.0\.0\.1|r2\.dev|coloring-pages\/coloring-pages/i);

  const sitemapPaths = new Set(runtimeSiteMap.map((entry) => entry.path));
  for (const hub of promoted) assert.ok(sitemapPaths.has(`/coloring-pages/${hub.slug}`), `${hub.slug} missing from sitemap`);

  const manualReview = readJson("pipeline/manifests/long-tail-round-2-manual-review-candidates.json").candidates;
  const backlog = readJson("pipeline/manifests/long-tail-round-2-backlog-candidates.json").candidates;
  for (const candidate of [...manualReview, ...backlog]) {
    assert.equal(sitemapPaths.has(`/coloring-pages/${candidate.slug}`), false, `${candidate.slug} should not be in sitemap`);
  }
});

test("OG metadata and JSON-LD are synchronized for promoted hubs", () => {
  const ogSync = readJson("pipeline/manifests/post-long-tail-r2-og-sync.json");
  const jsonLdSync = readJson("pipeline/manifests/post-long-tail-r2-jsonld-sync.json");
  const jsonLdData = readJson("pipeline/manifests/jsonld-route-data.json");
  const ogImages = readJson("src/generated/coloring/og-images.json");
  const promoted = readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json").hubs;

  assert.equal(ogSync.summary.ogImagesPassed, true);
  assert.equal(ogSync.summary.promotedHubOgImagesPresent, PROMOTED_COUNT);
  assert.equal(jsonLdSync.summary.jsonldPassed, true);
  assert.equal(jsonLdSync.summary.promotedHubJsonLdPresent, PROMOTED_COUNT);
  assert.equal(jsonLdData.summary.hubPagesWithJsonLd, EXPECTED_RUNTIME_HUB_COUNT);
  assert.equal(jsonLdData.summary.maxItemListItems <= 8, true);

  const schemaTypes = flattenTypes(jsonLdData.routes);
  for (const forbidden of forbiddenSchemaTypes) assert.equal(schemaTypes.includes(forbidden), false, `${forbidden} schema should be absent`);
  assert.doesNotMatch(JSON.stringify(jsonLdData.routes), /\.svg|\/svg\/|localhost|127\.0\.0\.1|r2\.dev/i);

  for (const hub of promoted) {
    const routePath = `/coloring-pages/${hub.slug}`;
    const og = ogImages.metadataByPath[routePath];
    assert.ok(og?.ogImageUrl.startsWith(`${SITE_URL}/og/hubs/`));
    assert.match(og.ogImageUrl, /\.jpg$/);
  }
});

test("browser QA, sampled URL QA, and final acceptance gate pass", () => {
  const browserQa = readJson("pipeline/manifests/post-long-tail-r2-browser-qa-results.json");
  const sampledUrl = readJson("pipeline/manifests/post-long-tail-r2-sampled-url-check-results.json");
  const acceptance = readJson("pipeline/manifests/post-long-tail-r2-acceptance-gate.json");

  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.promotedRoutesChecked, PROMOTED_COUNT);
  assert.equal(sampledUrl.summary.sampledUrlCheckPassed, true);
  assert.equal(sampledUrl.summary.recordsChecked >= 200, true);
  assert.equal(acceptance.promoted_hub_count, PROMOTED_COUNT);
  assert.equal(acceptance.runtime_hub_count, EXPECTED_RUNTIME_HUB_COUNT);
  assert.equal(acceptance.ready_for_final_local_acceptance, true);
  assert.deepEqual(acceptance.blockers, []);
});

test("static export, download, ad, and protected media boundaries remain intact", () => {
  const packageJson = readJson("package.json");
  const nextConfig = readText("next.config.mjs");
  const browserDownloads = readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = readText("src/components/coloring/DownloadMenu.tsx");
  const appSrcPublic = [
    readText("src/lib/coloring/browserDownloads.ts"),
    readText("src/components/coloring/DownloadMenu.tsx"),
    readText("src/components/coloring/ImageCard.tsx"),
  ].join("\n");

  assert.equal(packageJson.name, "i-love-coloring-page");
  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.equal(pathExists("app/api"), false);
  assert.equal(readJson("src/generated/coloring/runtime-available-items.json").items.length, EXPECTED_AVAILABLE_RECORDS);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(appSrcPublic, /Download PNG/);
  assert.match(appSrcPublic, /Download JPG/);
  assert.match(appSrcPublic, /Download WebP/);
  assert.doesNotMatch(readText("src/lib/coloring/metadata.ts"), /adsbygoogle|pagead2|googlesyndication|ca-pub-|data-ad-client/i);
  assert.equal(gitStatus("images", "ilovesvg"), "");

  const publicMedia = execFileSync("git", ["ls-files", "public"], { cwd: repoRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => /\.(?:svg|png|jpe?g|webp|gif|xml)$/i.test(file));
  const disallowed = publicMedia.filter((file) => file !== "public/image-sitemap.xml" && !/^public\/og\/.+\.jpg$/i.test(file));
  assert.deepEqual(disallowed, []);
});
