import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-5i-project-context-check.json",
  "pipeline/manifests/round-5i-production-env-validation.json",
  "pipeline/manifests/round-5i-custom-domain-url-results.json",
  "pipeline/manifests/round-5i-custom-domain-cors-results.json",
  "pipeline/manifests/round-5i-cache-content-type-results.json",
  "pipeline/manifests/round-5i-production-static-export-results.json",
  "pipeline/manifests/round-5i-browser-custom-domain-qa-results.json",
  "pipeline/manifests/round-5i-download-production-readiness.json",
  "pipeline/manifests/round-5i-final-upload-guidance.json",
];

test("Round 5I JSON manifests parse and confirm the expected project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5i-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5hCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.coloringPagesRouteExists, true);
  assert.equal(context.summary.hubRouteExists, true);
  assert.equal(context.summary.r2UploadColoringPagesExists, true);
  assert.equal(context.summary.testBundleExists, true);
  assert.equal(context.summary.testBundleSvgExists, true);
  assert.equal(context.summary.testBundleWebpExists, true);
  assert.equal(context.summary.testBundleSvgCount, 30);
  assert.equal(context.summary.testBundleWebpCount, 30);
  assert.equal(context.summary.publicContainsGeneratedMedia, false);
  assert.equal(context.summary.imagesStatusClean, true);
  assert.equal(context.summary.ilovesvgStatusClean, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
  assert.equal(context.wrongContext.actualWrongRoutesFound, false);
});

test("production env validation blocks r2.dev, localhost, placeholders, and private endpoints from readiness", async () => {
  const validation = await readJson("pipeline/manifests/round-5i-production-env-validation.json");

  assert.equal(validation.sourceEnvVars.includes("NEXT_PUBLIC_SITE_URL"), true);
  assert.equal(validation.sourceEnvVars.includes("NEXT_PUBLIC_COLORING_ASSET_BASE_URL"), true);
  assert.equal(validation.summary.r2DevIsProductionReady, false);
  assert.equal(typeof validation.summary.production_asset_domain_ready, "boolean");
  assert.equal(validation.summary.assetBaseNotR2Dev || validation.summary.production_asset_domain_ready === false, true);
  assert.equal(validation.summary.assetBaseNotPrivateR2Endpoint || validation.summary.production_asset_domain_ready === false, true);
  assert.equal(validation.summary.assetBaseHasColoringPagesPrefix || validation.summary.production_asset_domain_ready === false, true);
  assert.equal(validation.summary.assetBaseHasNoDuplicateColoringPagesPrefix || validation.summary.production_asset_domain_ready === false, true);
  assert.equal(validation.summary.noPublicEnvCredentials, true);

  if (validation.summary.production_asset_domain_ready) {
    assert.equal(validation.summary.siteUrlHttps, true);
    assert.equal(validation.summary.siteUrlNotLocalhost, true);
    assert.equal(validation.summary.assetBaseHttps, true);
    assert.equal(validation.summary.assetBaseNotR2Dev, true);
    assert.equal(validation.summary.assetBaseNotLocalhost, true);
    assert.equal(validation.summary.assetBaseCustomDomain, true);
  } else {
    assert.ok(validation.blockers.length > 0);
  }
});

test("custom domain URL, CORS, and cache results are present and do not fake readiness", async () => {
  const env = await readJson("pipeline/manifests/round-5i-production-env-validation.json");
  const urls = await readJson("pipeline/manifests/round-5i-custom-domain-url-results.json");
  const cors = await readJson("pipeline/manifests/round-5i-custom-domain-cors-results.json");
  const cache = await readJson("pipeline/manifests/round-5i-cache-content-type-results.json");

  assert.equal(urls.summary.plannedUrlCount, 60);
  assert.equal(urls.summary.plannedSvgUrlCount, 30);
  assert.equal(urls.summary.plannedWebpUrlCount, 30);
  assert.ok(["completed", "not_run"].includes(urls.summary.status));
  assert.ok(["completed", "not_run"].includes(cors.summary.status));
  assert.ok(["completed", "not_run"].includes(cache.summary.status));

  if (!env.summary.production_asset_domain_ready) {
    assert.equal(urls.summary.status, "not_run");
    assert.equal(urls.summary.svg_urls_passed, false);
    assert.equal(urls.summary.webp_urls_passed, false);
    assert.equal(cors.summary.status, "not_run");
    assert.equal(cors.summary.svg_cors_passed, false);
    assert.equal(cache.summary.status, "not_run");
    assert.equal(cache.summary.cache_headers_acceptable, false);
  }
});

test("browser QA and production static export results stay honest when custom domain validation is blocked", async () => {
  const env = await readJson("pipeline/manifests/round-5i-production-env-validation.json");
  const browserQa = await readJson("pipeline/manifests/round-5i-browser-custom-domain-qa-results.json");
  const staticExport = await readJson("pipeline/manifests/round-5i-production-static-export-results.json");

  assert.ok(["completed", "not_run"].includes(browserQa.summary.status));
  assert.ok(["completed", "not_run"].includes(staticExport.summary.status));
  assert.equal(browserQa.summary.appApiRoutePresent, false);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(browserQa.summary.localMediaServerRequired, false);
  assert.equal(staticExport.summary.appApiRouteReferencesPresent, false);
  assert.equal(staticExport.summary.downloadSvgLabelsOrLinksPresent, false);
  assert.equal(staticExport.summary.liveAdSenseCodePresent, false);

  if (!env.summary.production_asset_domain_ready) {
    assert.equal(browserQa.summary.status, "not_run");
    assert.equal(browserQa.summary.browserCanvasExportPassed, false);
    assert.equal(staticExport.summary.status, "not_run");
  }
});

test("download readiness keeps SVG internal and defers full upload, image sitemap, OG images, and live ads as needed", async () => {
  const readiness = await readJson("pipeline/manifests/round-5i-download-production-readiness.json");
  const guidance = await readJson("pipeline/manifests/round-5i-final-upload-guidance.json");

  assert.equal(readiness.svg_user_download_absent, true);
  assert.equal(readiness.png_download_ready, readiness.browser_canvas_export_passed);
  assert.equal(readiness.jpg_download_ready, readiness.browser_canvas_export_passed);
  assert.equal(readiness.webp_download_ready, readiness.browser_canvas_export_passed);
  assert.equal(readiness.ready_for_image_sitemap, false);
  assert.equal(readiness.ready_for_og_images, false);
  assert.equal(readiness.live_ads_in_scope, false);
  assert.equal(guidance.summary.svgInternalOnly, true);
  assert.deepEqual(guidance.finalUploadFolders, ["svg", "webp"]);
  assert.deepEqual(guidance.excludedFolders, ["png", "thumbs"]);
  assert.equal(guidance.requiredContentTypes.svg, "image/svg+xml");
  assert.equal(guidance.requiredContentTypes.webp, "image/webp");
});

test("download controls, static export, media boundaries, ads, and deferred SEO work remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedTestBundleMedia = await gitLsFiles("pipeline/r2-upload-test-svg-webp");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.match(imageCard, /Print/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /ImageResponse|opengraph-image|twitter-image|"@type":\s*"(?:FAQPage|AggregateRating|Product|Offer)"/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedTestBundleMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
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

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
