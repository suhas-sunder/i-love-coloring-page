import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;
const EXPECTED_RUNTIME_HUBS = 131;
const EXPECTED_REGULAR_SITEMAP_LOCS = 138;
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/image-sitemap-context-check.json",
  "pipeline/manifests/image-sitemap-requirements.json",
  "pipeline/manifests/image-sitemap-architecture.json",
  "pipeline/manifests/image-sitemap-data.json",
  "pipeline/manifests/image-sitemap-build-results.json",
  "pipeline/manifests/image-sitemap-build-integration.json",
  "pipeline/manifests/image-sitemap-sampled-url-check-results.json",
  "pipeline/manifests/image-sitemap-xml-validation.json",
  "pipeline/manifests/image-sitemap-static-export-qa-results.json",
  "pipeline/manifests/image-sitemap-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/image-sitemap-context-check.md",
  "pipeline/reports/image-sitemap-requirements.md",
  "pipeline/reports/image-sitemap-architecture.md",
  "pipeline/reports/image-sitemap-data-report.md",
  "pipeline/reports/image-sitemap-build-report.md",
  "pipeline/reports/image-sitemap-build-integration-report.md",
  "pipeline/reports/image-sitemap-sampled-url-check-report.md",
  "pipeline/reports/image-sitemap-xml-validation-report.md",
  "pipeline/reports/image-sitemap-static-export-qa-report.md",
  "pipeline/reports/image-sitemap-acceptance-gate.md",
];

test("image sitemap artifacts exist and parse", async () => {
  for (const relativePath of [...REQUIRED_MANIFESTS, ...REQUIRED_REPORTS]) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }
});

test("context preserves the runtime, static export, and deferred scopes", async () => {
  const context = await readJson("pipeline/manifests/image-sitemap-context-check.json");
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const sourceText = await readProjectText(["app", "src"]);

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.currentBranch, "ver-5-deployed-may-13-2026");
  assert.equal(context.summary.commitE2f1dd1Exists, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.deferredManualReviewRecords, EXPECTED_DEFERRED_RECORDS);
  assert.equal(context.summary.runtimeIndexableHubs, EXPECTED_RUNTIME_HUBS);
  assert.equal(context.summary.regularSitemapLocCountBeforeRound, EXPECTED_REGULAR_SITEMAP_LOCS);
  assert.equal(context.summary.siteUrl, SITE_URL);
  assert.equal(context.summary.publicAssetBaseUrl, ASSET_BASE_URL);
  assert.equal(context.summary.contactEmail, "admin@ilovecoloringpage.com");
  assert.equal(context.summary.svgInternalOnly, true);
  assert.deepEqual(context.summary.publicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.liveAdsenseCodePresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.jsonLdExpansionDeferred, true);
  assert.equal(context.summary.imageSitemapPresentBeforeRound, false);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(sourceText, /opengraph-image|twitter-image|ImageResponse/i);
});

test("image sitemap data uses available WebP records and existing page URLs only", async () => {
  const data = await readJson("pipeline/manifests/image-sitemap-data.json");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((record) => record.assetId));
  const routePaths = new Set(routes.routes.map((route) => route.path));

  assert.equal(data.summary.availableRuntimeRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(data.summary.deferredRecordsExcluded, EXPECTED_DEFERRED_RECORDS);
  assert.equal(data.summary.runtimeHubCount, EXPECTED_RUNTIME_HUBS);
  assert.equal(data.summary.pageUrlCount, EXPECTED_RUNTIME_HUBS);
  assert.equal(data.summary.uniqueImageUrlCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(data.summary.imageEntryCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(data.summary.maxImagesPerPage <= 1000, true);
  assert.equal(data.summary.svgUrlsExcluded, true);
  assert.equal(data.summary.pngThumbUrlsExcluded, true);
  assert.equal(data.summary.perImageRoutesCreated, false);

  for (const page of data.pages) {
    assert.equal(page.pageUrl.startsWith(`${SITE_URL}/coloring-pages`), true, `${page.pageUrl} should use the canonical site URL`);
    assert.equal(routePaths.has(new URL(page.pageUrl).pathname), true, `${page.pageUrl} should be a generated route`);
    assert.equal(page.images.length > 0, true, `${page.pageUrl} should have at least one image entry`);
  }

  const seenImageUrls = new Set();
  for (const entry of data.imageEntries) {
    assert.equal(availableIds.has(entry.assetId), true, `${entry.assetId} should be available`);
    assert.equal(deferredIds.has(entry.assetId), false, `${entry.assetId} should not be deferred`);
    assert.equal(entry.imageUrl.startsWith(`${ASSET_BASE_URL}/webp/`), true, `${entry.imageUrl} should use the WebP asset base`);
    assert.match(entry.imageUrl, /\.webp(?:$|\?)/);
    assert.doesNotMatch(entry.imageUrl, /\/svg\/|\/png\/|\/thumbs\/|r2\.dev|localhost|coloring-pages\/coloring-pages/i);
    assert.equal(entry.pageUrl.startsWith(`${SITE_URL}/coloring-pages`), true);
    assert.equal(entry.available, true);
    assert.equal(entry.validationStatus, "valid");
    assert.equal(seenImageUrls.has(entry.imageUrl), false, `${entry.imageUrl} should only be assigned once`);
    seenImageUrls.add(entry.imageUrl);
  }
});

test("static image sitemap XML is valid, WebP-only, and referenced by robots", async () => {
  const build = await readJson("pipeline/manifests/image-sitemap-build-results.json");
  const validation = await readJson("pipeline/manifests/image-sitemap-xml-validation.json");
  const integration = await readJson("pipeline/manifests/image-sitemap-build-integration.json");
  const xml = await readText("public/image-sitemap.xml");
  const robotsSource = await readText("app/robots.ts");

  assert.equal(build.summary.imageSitemapCreated, true);
  assert.equal(build.summary.splitCount, 0);
  assert.deepEqual(build.summary.generatedFiles, ["public/image-sitemap.xml"]);
  assert.equal(validation.summary.xmlValidationPassed, true);
  assert.equal(validation.summary.pageUrlCount, EXPECTED_RUNTIME_HUBS);
  assert.equal(validation.summary.imageEntryCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(validation.summary.fileCount, 1);
  assert.equal(validation.summary.noFileExceedsLimits, true);
  assert.equal(validation.summary.noSvgImageUrls, true);
  assert.equal(validation.summary.noPngThumbImageUrls, true);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1">/);
  assert.match(xml, /<image:image>\s*<image:loc>https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\/webp\//);
  assert.doesNotMatch(xml, /<image:title>|<image:caption>|\/svg\/|\/png\/|\/thumbs\/|r2\.dev|localhost|#asset-/i);
  assert.equal(integration.summary.robotsReferencesImageSitemap, true);
  assert.match(robotsSource, /image-sitemap\.xml/);
});

test("sampled URL checks, static export QA, and acceptance gate pass", async () => {
  const sampled = await readJson("pipeline/manifests/image-sitemap-sampled-url-check-results.json");
  const staticQa = await readJson("pipeline/manifests/image-sitemap-static-export-qa-results.json");
  const gate = await readJson("pipeline/manifests/image-sitemap-acceptance-gate.json");

  assert.equal(sampled.summary.sampledUrlCheckPassed, true);
  assert.equal(sampled.summary.recordsChecked >= 200, true);
  assert.equal(sampled.summary.webpHttp200, true);
  assert.equal(sampled.summary.webpContentType, true);
  assert.equal(sampled.summary.noSvgUrls, true);
  assert.equal(sampled.summary.noPngUrls, true);
  assert.equal(sampled.summary.noDeferredRecords, true);
  assert.equal(staticQa.summary.staticExportQaPassed, true);
  assert.equal(staticQa.summary.imageSitemapAccessibleLocally, true);
  assert.equal(staticQa.summary.robotsTxtReferencesImageSitemap, true);
  assert.equal(staticQa.summary.regularSitemapStillAccessible, true);
  assert.equal(staticQa.summary.sampleHubPagesStillWork, true);
  assert.equal(staticQa.summary.galleryImagesStillRender, true);
  assert.equal(staticQa.summary.downloadPrintControlsPresent, true);

  assert.equal(gate.summary.image_sitemap_created, true);
  assert.equal(gate.summary.static_export_compatible, true);
  assert.equal(gate.summary.robots_references_image_sitemap, true);
  assert.equal(gate.summary.regular_sitemap_still_valid, true);
  assert.equal(gate.summary.image_url_sample_passed, true);
  assert.equal(gate.summary.xml_validation_passed, true);
  assert.equal(gate.summary.deferred_records_excluded, true);
  assert.equal(gate.summary.svg_excluded, true);
  assert.equal(gate.summary.png_thumbs_excluded, true);
  assert.equal(gate.summary.per_image_routes_absent, true);
  assert.equal(gate.summary.ready_for_og_image_round, true);
  assert.equal(gate.summary.ready_for_jsonld_round, true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.deepEqual(gate.summary.blockers, []);
});

test("deferred scopes, source media boundaries, and public download controls remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const projectText = await readProjectText(["app", "src"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imagesStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.deepEqual(publicFiles.sort(), ["public/image-sitemap.xml"]);
  assert.equal(imagesStatus.trim(), "");
  assert.equal(ilovesvgStatus.trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results.map((file) => file.replace(/\\/g, "/"));
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
