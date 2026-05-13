import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-5k-project-context-check.json",
  "pipeline/manifests/round-5k-env-validation.json",
  "pipeline/manifests/round-5k-custom-domain-url-results.json",
  "pipeline/manifests/round-5k-origin-cors-results.json",
  "pipeline/manifests/round-5k-cache-content-type-results.json",
  "pipeline/manifests/round-5k-production-static-export-results.json",
  "pipeline/manifests/round-5k-browser-custom-domain-qa-results.json",
  "pipeline/manifests/round-5k-download-production-readiness.json",
  "pipeline/manifests/round-5k-final-upload-guidance.json",
];

test("Round 5K JSON manifests parse and confirm the expected project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5k-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5jCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.coloringPagesRouteExists, true);
  assert.equal(context.summary.hubRouteExists, true);
  assert.equal(context.summary.r2UploadColoringPagesExists, true);
  assert.equal(context.summary.testBundleSvgExists, true);
  assert.equal(context.summary.testBundleWebpExists, true);
  assert.equal(context.summary.testBundleSvgCount, 30);
  assert.equal(context.summary.testBundleWebpCount, 30);
  assert.equal(context.summary.publicContainsGeneratedProductionMedia, false);
  assert.equal(context.summary.imagesStatusClean, true);
  assert.equal(context.summary.ilovesvgStatusClean, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.pngJpgWebpControlsPresent, true);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
  assert.equal(context.wrongContext.actualWrongRoutesFound, false);
});

test("Round 5K production env validation rejects r2.dev and requires the custom HTTPS asset domain", async () => {
  const env = await readJson("pipeline/manifests/round-5k-env-validation.json");

  assert.equal(env.summary.r2DevIsProductionReady, false);
  assert.equal(env.summary.assetBaseNotR2Dev, true);
  assert.equal(env.summary.assetBaseNotPrivateR2Endpoint, true);
  assert.equal(env.summary.assetBaseHasNoOldTestPrefix, true);
  assert.equal(env.summary.assetBaseHasNoDuplicateColoringPagesPrefix, true);
  assert.equal(env.summary.noPublicEnvCredentials, true);

  if (env.summary.production_env_ready) {
    assert.equal(env.values.siteUrl, "https://www.ilovecoloringpage.com");
    assert.equal(env.values.assetBaseUrl, "https://assets.ilovecoloringpage.com/coloring-pages");
    assert.equal(env.values.contactEmail, "admin@ilovecoloringpage.com");
    assert.equal(env.summary.siteUrlHttps, true);
    assert.equal(env.summary.assetBaseHttps, true);
    assert.equal(env.summary.assetBaseCustomDomain, true);
  } else {
    assert.ok(env.blockers.length > 0);
  }
});

test("Round 5K URL verification covers only SVG and WebP and never substitutes PNG for WebP", async () => {
  const urls = await readJson("pipeline/manifests/round-5k-custom-domain-url-results.json");

  assert.equal(urls.summary.plannedUrlCount, 60);
  assert.equal(urls.summary.plannedSvgUrlCount, 30);
  assert.equal(urls.summary.plannedWebpUrlCount, 30);
  assert.equal(urls.summary.noPngSubstituteUsedForWebp, true);
  assert.ok(["completed", "not_run"].includes(urls.summary.status));

  for (const check of urls.checks || []) {
    assert.ok(["svg", "webp"].includes(check.mediaType), check.mediaType);
    assert.doesNotMatch(check.url, /\/png\//, check.url);
    assert.doesNotMatch(check.r2ObjectKey, /^coloring-pages\/png\//, check.r2ObjectKey);
    if (check.mediaType === "webp") {
      assert.match(check.url, /\/webp\//, check.url);
      assert.match(check.r2ObjectKey, /^coloring-pages\/webp\//, check.r2ObjectKey);
    }
  }

  if (urls.summary.status === "completed") {
    assert.equal(urls.checks.length, 60);
    assert.equal(urls.checks.filter((check) => check.mediaType === "svg").length, 30);
    assert.equal(urls.checks.filter((check) => check.mediaType === "webp").length, 30);
  }
});

test("Round 5K CORS, cache, static export, and browser QA results are present and honest", async () => {
  const env = await readJson("pipeline/manifests/round-5k-env-validation.json");
  const urls = await readJson("pipeline/manifests/round-5k-custom-domain-url-results.json");
  const cors = await readJson("pipeline/manifests/round-5k-origin-cors-results.json");
  const cache = await readJson("pipeline/manifests/round-5k-cache-content-type-results.json");
  const staticExport = await readJson("pipeline/manifests/round-5k-production-static-export-results.json");
  const browserQa = await readJson("pipeline/manifests/round-5k-browser-custom-domain-qa-results.json");

  assert.ok(["completed", "not_run"].includes(cors.summary.status));
  assert.ok(["completed", "not_run"].includes(cache.summary.status));
  assert.ok(["completed", "not_run"].includes(staticExport.summary.status));
  assert.ok(["completed", "not_run"].includes(browserQa.summary.status));
  assert.equal(cors.summary.webpContentTypePassed || cors.summary.status === "not_run", true);
  assert.equal(staticExport.summary.appApiRouteReferencesPresent, false);
  assert.equal(staticExport.summary.downloadSvgLabelsOrLinksPresent, false);
  assert.equal(staticExport.summary.liveAdSenseCodePresent, false);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(browserQa.summary.appApiRoutePresent, false);

  if (!env.summary.production_env_ready) {
    assert.equal(urls.summary.status, "not_run");
    assert.equal(cors.summary.status, "not_run");
    assert.equal(cache.summary.status, "not_run");
    assert.equal(staticExport.summary.status, "not_run");
  }

  if (browserQa.summary.status === "completed") {
    assert.equal(browserQa.summary.localMediaServerRequired, true);
    assert.equal(browserQa.summary.adDensityMatchesRound4U, true);
    assert.equal(browserQa.summary.horizontalOverflowDetected, false);
    assert.equal(browserQa.summary.contactEmailAppearsCorrectly, true);
  }
});

test("Round 5K readiness keeps SVG internal and defers full upload, image sitemap, OG images, and live ads", async () => {
  const readiness = await readJson("pipeline/manifests/round-5k-download-production-readiness.json");
  const guidance = await readJson("pipeline/manifests/round-5k-final-upload-guidance.json");

  assert.equal(readiness.svg_user_download_absent, true);
  assert.equal(readiness.ready_for_image_sitemap, false);
  assert.equal(readiness.ready_for_og_images, false);
  assert.equal(readiness.live_ads_in_scope, false);
  assert.equal(guidance.summary.svgInternalOnly, true);
  assert.equal(guidance.summary.fullUploadStillFinalStage, true);
  assert.equal(guidance.summary.explicitApprovalRequiredBeforeFullUpload, true);
  assert.equal(guidance.summary.imageSitemapDeferred, true);
  assert.equal(guidance.summary.openGraphImagesDeferred, true);
  assert.equal(guidance.summary.liveAdSenseDeferred, true);
  assert.equal(guidance.summary.pngNotUsedAsWebpSubstitute, true);
  assert.equal(guidance.requiredContentTypes.svg, "image/svg+xml");
  assert.equal(guidance.requiredContentTypes.webp, "image/webp");
});

test("Round 5K preserves static export, media boundaries, ad density rules, and deferred launch work", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const projectText = await readProjectText(["app", "src"]);
  const adsConfig = await readText("src/lib/ads/config.ts");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedTestBundleMedia = await gitLsFiles("pipeline/r2-upload-test-svg-webp");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const status = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(adsConfig, /Advertisement/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /image-sitemap|ImageSitemap|opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedTestBundleMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(status.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
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
