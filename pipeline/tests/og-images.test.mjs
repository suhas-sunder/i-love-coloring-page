import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_RUNTIME_HUBS = 131;
const EXPECTED_ROUTE_LEVEL_IMAGES = 133;
const EXPECTED_WIDTH = 1200;
const EXPECTED_HEIGHT = 630;

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/og-image-context-check.json",
  "pipeline/manifests/og-image-requirements.json",
  "pipeline/manifests/og-image-current-metadata-audit.json",
  "pipeline/manifests/og-image-design-system.json",
  "pipeline/manifests/og-image-data.json",
  "pipeline/manifests/og-image-build-results.json",
  "pipeline/manifests/og-image-validation-results.json",
  "pipeline/manifests/og-image-metadata-results.json",
  "pipeline/manifests/og-image-static-export-qa-results.json",
  "pipeline/manifests/og-image-browser-qa-results.json",
  "pipeline/manifests/og-image-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/og-image-context-check.md",
  "pipeline/reports/og-image-requirements.md",
  "pipeline/reports/og-image-current-metadata-audit.md",
  "pipeline/reports/og-image-design-system.md",
  "pipeline/reports/og-image-data-report.md",
  "pipeline/reports/og-image-build-report.md",
  "pipeline/reports/og-image-validation-report.md",
  "pipeline/reports/og-image-metadata-report.md",
  "pipeline/reports/og-image-static-export-qa-report.md",
  "pipeline/reports/og-image-browser-qa-report.md",
  "pipeline/reports/og-image-acceptance-gate.md",
];

test("OG image manifests and reports exist and parse", async () => {
  for (const relativePath of [...REQUIRED_MANIFESTS, ...REQUIRED_REPORTS]) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }
});

test("context keeps the static export and deferred scopes intact", async () => {
  const context = await readJson("pipeline/manifests/og-image-context-check.json");
  const sourceText = await readProjectText(["app", "src"]);

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.currentBranch, "ver-5-deployed-may-13-2026");
  assert.equal(context.summary.commitDfba4f6Exists, true);
  assert.equal(context.summary.commitAf716a5Exists, true);
  assert.equal(context.summary.commit10161e3Exists, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.runtimeAvailableRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(context.summary.runtimeIndexableHubs, EXPECTED_RUNTIME_HUBS);
  assert.equal(context.summary.imageSitemapPresent, true);
  assert.equal(context.summary.imageSitemapUsesWebpPreviewUrls, true);
  assert.equal(context.summary.siteUrl, SITE_URL);
  assert.equal(context.summary.publicAssetBaseUrl, ASSET_BASE_URL);
  assert.equal(context.summary.contactEmail, "admin@ilovecoloringpage.com");
  assert.equal(context.summary.svgInternalOnly, true);
  assert.deepEqual(context.summary.publicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.liveAdsenseCodePresent, false);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(sourceText, /"@type":\s*"(?:FAQPage|Review|AggregateRating|Product|Offer)"/i);
});

test("OG image data covers homepage, gallery landing, and all hub routes", async () => {
  const data = await readJson("pipeline/manifests/og-image-data.json");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const availableIds = new Set(available.items.map((item) => item.assetId));
  const deferredIds = new Set(deferred.records.map((record) => record.assetId));
  const routePaths = new Set(["/", "/coloring-pages", ...routes.routes.map((route) => route.path)]);

  assert.equal(data.summary.availableRuntimeRecords, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(data.summary.runtimeHubCount, EXPECTED_RUNTIME_HUBS);
  assert.equal(data.summary.expectedImageCount, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(data.summary.routeCount, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(data.summary.deferredRecordsExcluded, true);
  assert.equal(data.summary.svgSourcesExcludedFromSocialImages, true);
  assert.equal(data.summary.perImageRoutesCreated, false);
  assert.equal(data.summary.outputFormat, "jpg");
  assert.equal(data.summary.width, EXPECTED_WIDTH);
  assert.equal(data.summary.height, EXPECTED_HEIGHT);

  for (const route of data.routes) {
    assert.equal(routePaths.has(route.path), true, `${route.path} should be an existing public route or controlled root image`);
    assert.equal(route.ogImagePath.startsWith("/og/"), true);
    assert.match(route.ogImagePath, /\.jpg$/);
    assert.doesNotMatch(route.ogImagePath, /\.svg$/i);
    assert.equal(route.previewItems.length >= 1, true, `${route.path} should have preview material`);
    assert.equal(route.previewItems.length <= 5, true, `${route.path} should not become a dense collage`);
    assert.equal(new Set(route.previewItems.map((item) => item.assetId)).size, route.previewItems.length, `${route.path} should not repeat preview images`);

    for (const item of route.previewItems) {
      assert.equal(availableIds.has(item.assetId), true, `${item.assetId} should be runtime-available`);
      assert.equal(deferredIds.has(item.assetId), false, `${item.assetId} should not be deferred`);
      assert.equal(item.webpUrl.startsWith(`${ASSET_BASE_URL}/webp/`), true);
      assert.match(item.webpUrl, /\.webp(?:$|\?)/);
      assert.doesNotMatch(item.webpUrl, /\/svg\/|\/png\/|\/thumbs\/|localhost|r2\.dev|coloring-pages\/coloring-pages/i);
    }
  }
});

test("generated OG images exist under public/og with expected dimensions", async () => {
  const build = await readJson("pipeline/manifests/og-image-build-results.json");
  const validation = await readJson("pipeline/manifests/og-image-validation-results.json");
  const generated = await readJson("src/generated/coloring/og-images.json");
  const publicOgFiles = await listFilesIfExists(path.join(REPO_ROOT, "public", "og"));
  const sharp = (await import("sharp")).default;

  assert.equal(build.summary.ogImagesCreated, true);
  assert.equal(build.summary.generatedImageCount, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(build.summary.outputFormat, "jpg");
  assert.equal(build.summary.width, EXPECTED_WIDTH);
  assert.equal(build.summary.height, EXPECTED_HEIGHT);
  assert.equal(build.summary.failedRouteCount, 0);
  assert.equal(validation.summary.validationPassed, true);
  assert.equal(validation.summary.generatedImageCount, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(validation.summary.missingImageCount, 0);
  assert.equal(validation.summary.invalidImageCount, 0);
  assert.equal(validation.summary.noSvgOutput, true);
  assert.equal(validation.summary.noLocalhostReferences, true);
  assert.equal(validation.summary.noR2DevReferences, true);
  assert.equal(validation.summary.noGeneratedImageCountExplosion, true);
  assert.equal(generated.summary.generatedImageCount, EXPECTED_ROUTE_LEVEL_IMAGES);

  assert.equal(publicOgFiles.some((file) => normalizePath(file) === "public/og/home.jpg"), true);
  assert.equal(publicOgFiles.some((file) => normalizePath(file) === "public/og/coloring-pages.jpg"), true);
  assert.equal(publicOgFiles.some((file) => normalizePath(file) === "public/og/hubs/t-rex.jpg"), true);
  assert.equal(publicOgFiles.length, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(publicOgFiles.every((file) => normalizePath(file).startsWith("public/og/")), true);
  assert.equal(publicOgFiles.every((file) => /\.jpg$/i.test(file)), true);

  for (const relativePath of publicOgFiles.slice(0, 12)) {
    const metadata = await sharp(path.join(REPO_ROOT, relativePath)).metadata();
    assert.equal(metadata.width, EXPECTED_WIDTH, `${relativePath} width`);
    assert.equal(metadata.height, EXPECTED_HEIGHT, `${relativePath} height`);
    assert.equal(metadata.format, "jpeg", `${relativePath} should be JPEG`);
    assert.equal((await stat(path.join(REPO_ROOT, relativePath))).size > 0, true, `${relativePath} should not be empty`);
  }
});

test("route metadata references canonical OG images and social tags", async () => {
  const metadataSource = await readText("src/lib/coloring/metadata.ts");
  const ogManifest = await readJson("src/generated/coloring/og-images.json");
  const metadataResults = await readJson("pipeline/manifests/og-image-metadata-results.json");

  assert.equal(metadataResults.summary.metadataUpdated, true);
  assert.equal(metadataResults.summary.homepageReferencesOgImage, true);
  assert.equal(metadataResults.summary.coloringPagesReferencesOgImage, true);
  assert.equal(metadataResults.summary.allHubRoutesReferenceOgImages, true);
  assert.equal(metadataResults.summary.twitterLargeImageCardConfigured, true);
  assert.equal(metadataResults.summary.noLocalhostInMetadata, true);
  assert.equal(metadataResults.summary.noR2DevInMetadata, true);
  assert.equal(metadataResults.summary.noSvgImageReferences, true);
  assert.match(metadataSource, /ogImagesJson/);
  assert.match(metadataSource, /summary_large_image/);
  assert.match(metadataSource, /width:\s*1200/);
  assert.match(metadataSource, /height:\s*630/);

  for (const entry of ogManifest.routes) {
    assert.equal(entry.canonicalUrl.startsWith(SITE_URL), true);
    assert.equal(entry.ogImageUrl.startsWith(`${SITE_URL}/og/`), true);
    assert.match(entry.ogImageUrl, /\.jpg$/);
    assert.doesNotMatch(entry.ogImageUrl, /localhost|r2\.dev|\.svg/i);
  }
});

test("static export, browser metadata QA, and acceptance gate pass", async () => {
  const staticQa = await readJson("pipeline/manifests/og-image-static-export-qa-results.json");
  const browserQa = await readJson("pipeline/manifests/og-image-browser-qa-results.json");
  const gate = await readJson("pipeline/manifests/og-image-acceptance-gate.json");

  assert.equal(staticQa.summary.staticExportPassed, true);
  assert.equal(staticQa.summary.homeOgImageAccessible, true);
  assert.equal(staticQa.summary.coloringPagesOgImageAccessible, true);
  assert.equal(staticQa.summary.sampleHubOgImagesAccessible, true);
  assert.equal(staticQa.summary.homeHtmlIncludesOgImage, true);
  assert.equal(staticQa.summary.coloringPagesHtmlIncludesOgImage, true);
  assert.equal(staticQa.summary.sampleHubHtmlIncludesOgImage, true);
  assert.equal(staticQa.summary.twitterImagePresent, true);
  assert.equal(staticQa.summary.ogImageDimensionsPresent, true);
  assert.equal(staticQa.summary.regularSitemapStillWorks, true);
  assert.equal(staticQa.summary.imageSitemapStillWorks, true);
  assert.equal(staticQa.summary.appApiRoutePresent, false);

  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.pagesRenderedNormally, true);
  assert.equal(browserQa.summary.galleryWebpRendered, true);
  assert.equal(browserQa.summary.printDownloadControlsStillWork, true);
  assert.equal(browserQa.summary.headMetadataIncludesExpectedTags, true);
  assert.equal(browserQa.summary.ogImageUrlsReturn200, true);
  assert.equal(browserQa.summary.imageSitemapRegression, false);
  assert.equal(browserQa.summary.adLayoutRegression, false);

  assert.equal(gate.summary.og_images_created, true);
  assert.equal(gate.summary.expected_image_count, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(gate.summary.generated_image_count, EXPECTED_ROUTE_LEVEL_IMAGES);
  assert.equal(gate.summary.missing_image_count, 0);
  assert.equal(gate.summary.invalid_image_count, 0);
  assert.equal(gate.summary.metadata_updated, true);
  assert.equal(gate.summary.static_export_passed, true);
  assert.equal(gate.summary.browser_qa_passed, true);
  assert.equal(gate.summary.regular_sitemap_still_valid, true);
  assert.equal(gate.summary.image_sitemap_still_valid, true);
  assert.equal(gate.summary.ready_for_jsonld_round, true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.deepEqual(gate.summary.blockers, []);
});

test("deferred features, source folders, and public download controls remain unchanged", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appSource = await readProjectText(["app", "src"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")), true);
  assert.doesNotMatch(appSource, /"@type":\s*"(?:FAQPage|Review|AggregateRating|Product|Offer)"/i);
  assert.doesNotMatch(appSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.equal(publicFiles.every((file) => /^public\/(?:image-sitemap\.xml|og\/.+\.jpg)$/.test(normalizePath(file))), true);
  assert.equal((await gitStatusFor("images")).trim(), "");
  assert.equal((await gitStatusFor("ilovesvg")).trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
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
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
