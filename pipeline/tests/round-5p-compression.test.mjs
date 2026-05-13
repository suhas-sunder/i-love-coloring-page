import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const EXPECTED_RECORDS = 6352;
const EXPECTED_FILES = 12704;
const REQUIRED_JSON = [
  "pipeline/manifests/round-5p-project-context-check.json",
  "pipeline/manifests/round-5p-working-tree-audit.json",
  "pipeline/manifests/round-5p-clean-bundle-size-audit.json",
  "pipeline/manifests/round-5p-compression-strategy.json",
  "pipeline/manifests/round-5p-webp-optimization-policy.json",
  "pipeline/manifests/round-5p-svg-optimization-results.json",
  "pipeline/manifests/round-5p-webp-optimization-results.json",
  "pipeline/manifests/round-5p-contact-sheet-results.json",
  "pipeline/manifests/round-5p-browser-qa-results.json",
  "pipeline/manifests/round-5p-optimized-bundle-integrity.json",
  "pipeline/manifests/round-5p-optimized-upload-operation-estimate.json",
  "pipeline/manifests/round-5p-compression-acceptance-gate.json",
  "pipeline/manifests/round-5p-optimization-failures.json",
];

test("Round 5P manifests parse and confirm the correct project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /R2_SECRET_ACCESS_KEY\s*=\s*\S+|AKIA[0-9A-Z]{16}|Authorization:\s*AWS|ca-pub-|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5p-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5oCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.cleanBundleExists, true);
  assert.equal(context.summary.cleanBundleSvgExists, true);
  assert.equal(context.summary.cleanBundleWebpExists, true);
  assert.equal(context.summary.publicContainsGeneratedProductionMedia, false);
  assert.equal(context.summary.imagesStatusClean, true);
  assert.equal(context.summary.ilovesvgStatusClean, true);
  assert.equal(context.summary.svgInternalOnly, true);
  assert.equal(context.summary.publicDownloadsPngJpgWebp, true);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
  assert.equal(context.summary.imageSitemapPresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.wrongContextIndicatorsPresent, false);
});

test("Round 5P clean bundle audit and strategy document conservative compression", async () => {
  const audit = await readJson("pipeline/manifests/round-5p-clean-bundle-size-audit.json");
  const strategy = await readJson("pipeline/manifests/round-5p-compression-strategy.json");
  const webpPolicy = await readJson("pipeline/manifests/round-5p-webp-optimization-policy.json");
  const svgoConfig = await readText("pipeline/config/svgo.conservative.config.mjs");

  assert.equal(audit.summary.svgFileCount, EXPECTED_RECORDS);
  assert.equal(audit.summary.webpFileCount, EXPECTED_RECORDS);
  assert.equal(audit.summary.totalFileCount, EXPECTED_FILES);
  assert.ok(audit.summary.totalBundleBytes > 2_000_000_000);
  assert.equal(audit.summary.expectedUploadOperationCount, EXPECTED_FILES);
  assert.ok(audit.largestSvgFiles.length > 0);
  assert.ok(audit.largestWebpFiles.length > 0);

  assert.equal(strategy.summary.conservative, true);
  assert.equal(strategy.summary.svgRemainsSourceOfTruth, true);
  assert.equal(strategy.summary.webpPreviewOnly, true);
  assert.equal(strategy.summary.removeViewBoxAllowed, false);
  assert.equal(strategy.summary.pathSimplificationAggressive, false);
  assert.equal(strategy.summary.rasterizesSvg, false);
  assert.equal(webpPolicy.summary.selectedSetting.quality <= 92, true);
  assert.equal(webpPolicy.summary.selectedSetting.effort, 6);
  assert.match(svgoConfig, /removeViewBox:\s*false/);
  assert.match(svgoConfig, /cleanupIds:\s*false/);
  assert.match(svgoConfig, /mergePaths:\s*false/);
  assert.match(svgoConfig, /convertPathData:\s*false/);
});

test("Round 5P optimized bundle exists with matching object keys and SVG plus WebP only", async () => {
  const cleanObjectMap = await readJson("pipeline/manifests/round-5n-clean-upload-object-key-map.json");
  const integrity = await readJson("pipeline/manifests/round-5p-optimized-bundle-integrity.json");
  const optimizedFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline/r2-upload-optimized/coloring-pages"));
  const cleanSvgKeys = new Set(cleanObjectMap.records.map((record) => `pipeline/r2-upload-optimized/${record.cleanSvgObjectKey}`));
  const cleanWebpKeys = new Set(cleanObjectMap.records.map((record) => `pipeline/r2-upload-optimized/${record.cleanWebpObjectKey}`));

  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/r2-upload-optimized/coloring-pages")), true);
  assert.equal(integrity.summary.optimizedSvgCount, EXPECTED_RECORDS);
  assert.equal(integrity.summary.optimizedWebpCount, EXPECTED_RECORDS);
  assert.equal(integrity.summary.totalFileCount, EXPECTED_FILES);
  assert.equal(integrity.summary.pngFileCount, 0);
  assert.equal(integrity.summary.thumbFileCount, 0);
  assert.equal(integrity.summary.manualReviewAssetIdsIncluded, 0);
  assert.equal(integrity.summary.missingFiles, 0);
  assert.equal(integrity.summary.duplicateObjectKeys, 0);
  assert.equal(integrity.summary.sameObjectKeyPathsAsCleanBundle, true);
  assert.equal(integrity.summary.readyForUploader, true);
  assert.equal(optimizedFiles.length, EXPECTED_FILES);
  assert.equal(optimizedFiles.filter((file) => file.endsWith(".svg")).length, EXPECTED_RECORDS);
  assert.equal(optimizedFiles.filter((file) => file.endsWith(".webp")).length, EXPECTED_RECORDS);
  assert.equal(optimizedFiles.some((file) => file.endsWith(".png") || /(?:^|\/)thumbs\//.test(file)), false);

  for (const file of optimizedFiles.slice(0, 100)) {
    if (file.endsWith(".svg")) assert.equal(cleanSvgKeys.has(normalizePath(file)), true, file);
    if (file.endsWith(".webp")) assert.equal(cleanWebpKeys.has(normalizePath(file)), true, file);
  }
});

test("Round 5P optimization results record savings, fallbacks, and validation status", async () => {
  const svg = await readJson("pipeline/manifests/round-5p-svg-optimization-results.json");
  const webp = await readJson("pipeline/manifests/round-5p-webp-optimization-results.json");
  const integrity = await readJson("pipeline/manifests/round-5p-optimized-bundle-integrity.json");
  const gate = await readJson("pipeline/manifests/round-5p-compression-acceptance-gate.json");
  const failures = await readJson("pipeline/manifests/round-5p-optimization-failures.json");

  assert.equal(svg.summary.totalRecords, EXPECTED_RECORDS);
  assert.equal(webp.summary.totalRecords, EXPECTED_RECORDS);
  assert.equal(svg.summary.failedOptimizationCount, 0);
  assert.equal(webp.summary.failedOptimizationCount, 0);
  assert.ok(svg.records.every((record) => record.validationStatus === "passed" || record.usedOptimized === false));
  assert.ok(webp.records.every((record) => record.validationStatus === "passed" || record.usedOptimized === false));
  assert.equal(integrity.summary.originalCleanBytes > 0, true);
  assert.equal(integrity.summary.optimizedBytes > 0, true);
  assert.equal(integrity.summary.totalSavingsBytes >= 0, true);
  assert.equal(integrity.summary.fallbackCount, svg.summary.fallbackCount + webp.summary.fallbackCount);
  assert.equal(integrity.summary.failedOptimizationCount, 0);
  assert.equal(gate.svg_optimization_passed, true);
  assert.equal(gate.webp_optimization_passed, true);
  assert.equal(gate.optimized_bundle_ready_for_upload, true);
  assert.equal(gate.use_optimized_bundle_for_upload, true);
  assert.equal(failures.failedOptimizationCount, 0);
});

test("Round 5P visual QA, browser QA, and upload estimate target the optimized bundle", async () => {
  const contact = await readJson("pipeline/manifests/round-5p-contact-sheet-results.json");
  const browserQa = await readJson("pipeline/manifests/round-5p-browser-qa-results.json");
  const estimate = await readJson("pipeline/manifests/round-5p-optimized-upload-operation-estimate.json");
  const uploader = await readText("pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs");
  const runbook = await readText("pipeline/reports/round-5o-owner-upload-runbook.md");

  assert.equal(contact.summary.contactSheetRoot, "pipeline/review/round-5p/contact-sheets");
  assert.equal(contact.summary.reviewArtifactsIgnored, true);
  assert.ok(contact.contactSheets.length >= 6);
  assert.equal(browserQa.summary.mediaRoot, "pipeline/r2-upload-optimized");
  assert.equal(browserQa.summary.pagesInspected.length >= 6, true);
  assert.equal(browserQa.summary.galleryWebpPreviewsRender, true);
  assert.equal(browserQa.summary.noBrokenPreviews, true);
  assert.equal(browserQa.summary.printReady, true);
  assert.equal(browserQa.summary.downloadsPngJpgWebpReady, true);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(browserQa.summary.appApiRoutePresent, false);
  assert.equal(estimate.summary.putObjectOperations, EXPECTED_FILES);
  assert.equal(estimate.summary.headObjectOperationsWithSkipExisting, EXPECTED_FILES);
  assert.equal(estimate.summary.deleteOperations, 0);
  assert.equal(estimate.summary.operationCountsUnchanged, true);
  assert.match(uploader, /pipeline\/r2-upload-optimized\/coloring-pages/);
  assert.match(runbook, /r2-upload-optimized\/coloring-pages/);
});

test("Round 5P preserves runtime boundaries and does not execute upload", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const generatedItems = await readText("src/generated/coloring/items.json");
  const projectText = await readProjectText(["app", "src"]);
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusR2Upload = await gitStatusFor("pipeline/r2-upload");
  const statusR2UploadClean = await gitStatusFor("pipeline/r2-upload-clean");
  const statusR2UploadOptimized = await gitStatusFor("pipeline/r2-upload-optimized");
  const statusPublic = await gitStatusFor("public");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)), false);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(generatedItems, /round-5p|r2-upload-optimized|optimizedSvgObjectKey|optimizedWebpObjectKey/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /image-sitemap|ImageSitemap|opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(existsSync(path.join(REPO_ROOT, "pipeline/manifests/round-5o-upload-execute-results.json")), false);
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusR2Upload.trim(), "");
  assert.equal(statusR2UploadClean.trim(), "");
  assert.equal(statusR2UploadOptimized.trim(), "");
  assert.equal(statusPublic.trim(), "");
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
  return results.map(normalizePath);
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
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
