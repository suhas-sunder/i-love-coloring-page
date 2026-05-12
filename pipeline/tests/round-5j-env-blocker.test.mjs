import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/round-5j-project-context-check.json",
  "pipeline/manifests/round-5j-drift-cleanup-results.json",
  "pipeline/manifests/round-5j-production-env-validation.json",
  "pipeline/manifests/round-5j-readiness-decision.json",
  "pipeline/manifests/round-5j-blocker-report.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/round-5j-project-context-check.md",
  "pipeline/reports/round-5j-drift-cleanup-report.md",
  "pipeline/reports/round-5j-production-env-validation.md",
  "pipeline/reports/round-5j-readiness-decision.md",
  "pipeline/reports/round-5j-blocker-report.md",
];

test("Round 5J blocker manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  for (const relativePath of REQUIRED_REPORTS) {
    const raw = await readText(relativePath);
    assert.match(raw, /Round 5J/);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
  }
});

test("Round 5J confirms the correct project context and no backend route", async () => {
  const context = await readJson("pipeline/manifests/round-5j-project-context-check.json");

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5iCommitExists, true);
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
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
});

test("Round 5J drift cleanup records only safe generated validation drift", async () => {
  const drift = await readJson("pipeline/manifests/round-5j-drift-cleanup-results.json");

  assert.equal(drift.summary.initialDirtyStateObserved, true);
  assert.equal(drift.summary.safeGeneratedValidationDriftCleaned, true);
  assert.equal(drift.summary.riskyUnrelatedDriftFound, false);
  assert.equal(drift.summary.mediaDriftFound, false);
  assert.equal(drift.summary.sourceImagesChanged, false);
  assert.equal(drift.summary.ilovesvgChanged, false);
  assert.equal(drift.summary.generatedMediaStagedOrTracked, false);
  assert.deepEqual(drift.summary.remainingRelevantWorkingTreeStatus, []);
  assert.ok(drift.classification.generatedValidationDrift.includes("src/generated/coloring/search-index.json"));
  assert.ok(drift.classification.generatedValidationDrift.includes("pipeline/manifests/round-4o-browser-conversion-test-results.json"));
  assert.deepEqual(drift.classification.riskyUnrelatedDrift, []);
});

test("Round 5J env validation blocks missing or local production values", async () => {
  const env = await readJson("pipeline/manifests/round-5j-production-env-validation.json");

  assert.equal(env.expectedEnv.NEXT_PUBLIC_SITE_URL, "https://www.ilovecoloringpage.com");
  assert.equal(env.expectedEnv.NEXT_PUBLIC_COLORING_ASSET_BASE_URL, "https://assets.ilovecoloringpage.com/coloring-pages");
  assert.equal(env.expectedEnv.NEXT_PUBLIC_CONTACT_EMAIL, "admin@ilovecoloringpage.com");
  assert.equal(env.summary.r2DevIsProductionReady, false);
  assert.equal(env.summary.production_env_ready, false);
  assert.equal(env.summary.production_asset_domain_ready, false);
  assert.equal(env.summary.noPublicEnvCredentials, true);
  assert.equal(env.summary.assetBaseNotR2Dev, true);
  assert.equal(env.summary.assetBaseNotPrivateR2Endpoint, true);
  assert.equal(env.summary.assetBaseHasNoDuplicateColoringPagesPrefix, true);
  assert.ok(env.blockers.length > 0);
  assert.ok(env.blockers.some((blocker) => blocker.includes("NEXT_PUBLIC_SITE_URL")));
  assert.ok(env.blockers.some((blocker) => blocker.includes("NEXT_PUBLIC_COLORING_ASSET_BASE_URL")));
});

test("Round 5J readiness stays blocked and does not fake custom-domain/browser results", async () => {
  const readiness = await readJson("pipeline/manifests/round-5j-readiness-decision.json");
  const blocker = await readJson("pipeline/manifests/round-5j-blocker-report.json");

  assert.equal(readiness.custom_domain_verification_status, "blocked_not_run");
  assert.equal(readiness.custom_asset_domain_tested, false);
  assert.equal(readiness.public_site_url_tested, false);
  assert.equal(readiness.svg_url_result, "not_run");
  assert.equal(readiness.webp_url_result, "not_run");
  assert.equal(readiness.svg_cors_result, "not_run");
  assert.equal(readiness.cache_header_result, "not_run");
  assert.equal(readiness.webp_gallery_rendering_result, "not_run");
  assert.equal(readiness.browser_canvas_export_result, "not_run");
  assert.equal(readiness.print_result, "not_run");
  assert.equal(readiness.png_download_result, "not_run");
  assert.equal(readiness.jpg_download_result, "not_run");
  assert.equal(readiness.webp_download_result, "not_run");
  assert.equal(readiness.svg_user_download_absent, true);
  assert.equal(readiness.no_app_api_route, true);
  assert.equal(readiness.no_public_media_copy, true);
  assert.equal(readiness.no_full_upload_run, true);
  assert.equal(readiness.no_live_ads, true);
  assert.equal(readiness.ready_for_full_upload, false);
  assert.equal(readiness.ready_for_image_sitemap, false);
  assert.equal(readiness.ready_for_og_images, false);
  assert.equal(blocker.verification.customDomainTested, false);
});

test("Round 5J preserves media boundaries, SVG hidden status, and deferred launch work", async () => {
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const projectText = await readProjectText(["app", "src"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedTestBundleMedia = await gitLsFiles("pipeline/r2-upload-test-svg-webp");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /image-sitemap|ImageSitemap|opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedTestBundleMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
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

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
