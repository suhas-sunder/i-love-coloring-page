import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const TEST_BUNDLE_ROOT = "pipeline/r2-upload-test-svg-webp/coloring-pages";

const REQUIRED_JSON = [
  "pipeline/manifests/round-5c-project-context-check.json",
  "pipeline/manifests/round-5c-svg-webp-readiness-audit.json",
  "pipeline/manifests/round-5c-svg-webp-test-selection.json",
  "pipeline/manifests/round-5c-svg-webp-test-bundle-plan.json",
  "pipeline/manifests/round-5c-svg-webp-test-bundle-results.json",
  "pipeline/manifests/round-5c-svg-webp-manual-upload-checklist.json",
  "pipeline/manifests/round-5c-svg-webp-url-verification-plan.json",
  "pipeline/manifests/round-5c-svg-webp-public-url-results.json",
  "pipeline/manifests/round-5c-browser-svg-webp-qa-results.json",
  "pipeline/manifests/round-5c-future-full-upload-plan.json",
  "pipeline/manifests/round-5c-r2-cors-content-type-guide.json",
  "pipeline/manifests/round-5c-asset-strategy-results.json",
  "pipeline/manifests/round-5c-browser-qa-results.json",
];

test("Round 5C JSON manifests parse and confirm the expected project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5c-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5bCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.localSvgFolderExists, true);
  assert.equal(context.summary.localWebpFolderExists, true);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.jpgJpegWebpControlsVisible, false);
});

test("SVG plus WebP readiness is complete for the current 6557-record model", async () => {
  const audit = await readJson("pipeline/manifests/round-5c-svg-webp-readiness-audit.json");

  assert.equal(audit.summary.successfulRecordCount, 6557);
  assert.equal(audit.summary.svgCount, 6557);
  assert.equal(audit.summary.webpCount, 6557);
  assert.equal(audit.summary.missingSvgRecords, 0);
  assert.equal(audit.summary.missingWebpRecords, 0);
  assert.equal(audit.summary.svgWebpCompleteForAllRecords, true);
  assert.equal(audit.summary.pngStillReferencedForFallback, true);
  assert.equal(audit.summary.thumbsStillReferencedForLastResortFallback, true);
  assert.ok(audit.summary.svgTotalBytes > 0);
  assert.ok(audit.summary.webpTotalBytes > 0);
});

test("test selection contains exactly 30 valid records with SVG and WebP object keys", async () => {
  const selection = await readJson("pipeline/manifests/round-5c-svg-webp-test-selection.json");

  assert.equal(selection.summary.selectedRecordCount, 30);
  assert.equal(selection.summary.expectedMediaFileCount, 60);
  assert.equal(selection.summary.svgFileCount, 30);
  assert.equal(selection.summary.webpFileCount, 30);
  assert.equal(selection.summary.pngFileCount, 0);
  assert.equal(selection.summary.thumbFileCount, 0);
  assert.equal(selection.summary.quarantinedAssetsIncluded, 0);
  assert.ok(selection.summary.warningRecordCount >= 3);

  const requiredHubCoverage = ["animals", "anime-girls", "chibi", "fantasy", "christmas", "halloween", "geometric", "plushies"];
  for (const slug of requiredHubCoverage) {
    assert.equal(selection.summary.coveredHubSlugs.includes(slug), true, `missing hub coverage: ${slug}`);
  }

  for (const record of selection.records) {
    assert.match(record.targetR2ObjectKeySvg, /^coloring-pages\/svg\/.+\.svg$/);
    assert.match(record.targetR2ObjectKeyWebp, /^coloring-pages\/webp\/.+\.webp$/);
    assert.match(record.localSvgPath, /^pipeline\/r2-upload\/coloring-pages\/svg\//);
    assert.match(record.localWebpPath, /^pipeline\/r2-upload\/coloring-pages\/webp\//);
    assert.doesNotMatch(record.targetR2ObjectKeySvg + record.targetR2ObjectKeyWebp, /\/png\/|\/thumbs\//);
  }
});

test("local test bundle contains SVG and WebP only with no PNG or thumbnail directories", async () => {
  const results = await readJson("pipeline/manifests/round-5c-svg-webp-test-bundle-results.json");
  const plan = await readJson("pipeline/manifests/round-5c-svg-webp-test-bundle-plan.json");

  assert.equal(plan.summary.selectedRecordCount, 30);
  assert.equal(plan.summary.expectedMediaFileCount, 60);
  assert.deepEqual(plan.includedFolders, ["svg", "webp"]);
  assert.deepEqual(plan.excludedFolders, ["png", "thumbs"]);
  assert.equal(results.summary.createdMediaFileCount, 60);
  assert.equal(results.summary.totalSvgFiles, 30);
  assert.equal(results.summary.totalWebpFiles, 30);
  assert.equal(results.summary.totalPngFiles, 0);
  assert.equal(results.summary.totalThumbFiles, 0);
  assert.ok(results.summary.totalBundleBytesRepresented > 0);

  assert.equal(existsSync(path.join(REPO_ROOT, TEST_BUNDLE_ROOT, "svg")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, TEST_BUNDLE_ROOT, "webp")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, TEST_BUNDLE_ROOT, "png")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, TEST_BUNDLE_ROOT, "thumbs")), false);

  const files = await listFilesIfExists(path.join(REPO_ROOT, TEST_BUNDLE_ROOT));
  assert.equal(files.length, 60);
  assert.equal(files.every((file) => /\.(svg|webp)$/i.test(file)), true);
});

test("public URL verification and browser QA stay honest when public upload is not configured", async () => {
  const urlResults = await readJson("pipeline/manifests/round-5c-svg-webp-public-url-results.json");
  const browserPublicQa = await readJson("pipeline/manifests/round-5c-browser-svg-webp-qa-results.json");

  if (urlResults.summary.publicBaseUrlConfigured && !urlResults.summary.publicBaseUrlIsLocalhost) {
    assert.equal(typeof urlResults.summary.publicUrlVerificationPassed, "boolean");
  } else {
    assert.equal(urlResults.summary.status, "not_run");
    assert.equal(urlResults.summary.publicUrlVerificationPassed, false);
  }

  if (browserPublicQa.summary.publicTestAssetsUploaded) {
    assert.equal(typeof browserPublicQa.summary.publicSvgCanvasConversionPassed, "boolean");
  } else {
    assert.equal(browserPublicQa.summary.publicBrowserQaStatus, "not_run");
    assert.equal(browserPublicQa.summary.publicSvgCanvasConversionPassed, false);
  }
});

test("future full upload plan stays SVG plus WebP and excludes PNG and thumbs", async () => {
  const plan = await readJson("pipeline/manifests/round-5c-future-full-upload-plan.json");
  const strategy = await readJson("pipeline/manifests/round-5c-asset-strategy-results.json");

  assert.deepEqual(plan.finalR2Folders, ["svg", "webp"]);
  assert.deepEqual(plan.excludedFolders, ["png", "thumbs"]);
  assert.equal(plan.summary.usesSvgAndWebpOnly, true);
  assert.equal(plan.summary.fullUploadDeferred, true);
  assert.equal(plan.summary.imageSitemapDeferred, true);
  assert.equal(plan.summary.openGraphImageDeferred, true);
  assert.equal(strategy.summary.svgWebpTestBundleCreated, true);
  assert.equal(strategy.summary.pngThumbsIncludedInTestBundle, false);
  assert.equal(strategy.summary.fullUploadDeferred, true);
});

test("app behavior remains WebP-preview first, SVG-internal only, and PNG-download only", async () => {
  const assetsSource = await readText("src/lib/coloring/assets.ts");
  const imageCardSource = await readText("src/components/coloring/ImageCard.tsx");
  const browserDownloadsSource = await readText("src/lib/coloring/browserDownloads.ts");

  assert.match(assetsSource, /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/);
  assert.match(assetsSource, /previewFallback:\s*png\s*\|\|\s*thumbnail/);
  assert.match(browserDownloadsSource, /VERIFIED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png"\]/);
  assert.match(browserDownloadsSource, /convertInternalSvgToBlob/);
  assert.match(imageCardSource, /Print/);
  assert.match(imageCardSource, /Download PNG/);
  assert.doesNotMatch(imageCardSource + browserDownloadsSource, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(imageCardSource, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/);
});

test("static export, media boundaries, route boundaries, and deferred production work remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src"]);
  const futurePlan = await readJson("pipeline/manifests/round-5c-future-full-upload-plan.json");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedTestBundleMedia = await gitLsFiles("pipeline/r2-upload-test-svg-webp");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /ImageResponse|opengraph-image|twitter-image/i);
  assert.equal(futurePlan.summary.imageSitemapDeferred, true);
  assert.equal(futurePlan.summary.openGraphImageDeferred, true);
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

  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];

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
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFilesIfExists(root)) {
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
