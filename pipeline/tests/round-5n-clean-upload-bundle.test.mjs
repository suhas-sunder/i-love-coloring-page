import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const EXPECTED_INCLUDED = 6352;
const EXPECTED_DEFERRED = 205;
const EXPECTED_FILE_COUNT = EXPECTED_INCLUDED * 2;
const CLEAN_BUNDLE_ROOT = "pipeline/r2-upload-clean/coloring-pages";
const REQUIRED_JSON = [
  "pipeline/manifests/round-5n-project-context-check.json",
  "pipeline/manifests/round-5n-working-tree-audit.json",
  "pipeline/manifests/round-5n-input-audit.json",
  "pipeline/manifests/round-5n-owner-decision.json",
  "pipeline/manifests/round-5n-clean-upload-inclusion-manifest.json",
  "pipeline/manifests/round-5n-deferred-manual-review-records.json",
  "pipeline/manifests/round-5n-clean-upload-bundle-plan.json",
  "pipeline/manifests/round-5n-clean-upload-bundle-results.json",
  "pipeline/manifests/round-5n-clean-bundle-integrity.json",
  "pipeline/manifests/round-5n-clean-upload-object-key-map.json",
  "pipeline/manifests/round-5n-manual-upload-checklist.json",
  "pipeline/manifests/round-5n-post-upload-verification-plan.json",
  "pipeline/manifests/round-5n-runtime-switch-readiness.json",
];

const BAD_PUBLIC_NAME_PATTERN =
  /\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|failed?|failure|retry|generated|ai-generated|image|export|download|screenshot|untitled|copy|final-final|temp|draft|pipeline|bakeoff|preview|thumb|thumbnail)\b/i;
const TIMESTAMP_LIKE_PATTERN = /\b(?:20\d{2}[-_.]?\d{2}[-_.]?\d{2}|\d{8,}|\d{4}[-_.]?\d{2}[-_.]?\d{2}[-_.]?\d{2,})\b/;
const HASH_SUFFIX_PATTERN = /-[a-f0-9]{10}$/i;

test("Round 5N JSON manifests parse and confirm project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5n-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5mCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.coloringPagesRouteExists, true);
  assert.equal(context.summary.hubRouteExists, true);
  assert.equal(context.summary.r2UploadColoringPagesExists, true);
  assert.equal(context.summary.r2UploadSvgExists, true);
  assert.equal(context.summary.publicContainsGeneratedProductionMedia, false);
  assert.equal(context.summary.imagesStatusClean, true);
  assert.equal(context.summary.ilovesvgStatusClean, true);
  assert.equal(context.summary.svgInternalOnly, true);
  assert.equal(context.summary.publicDownloadsPngJpgWebp, true);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
  assert.equal(context.summary.imageSitemapPresent, false);
  assert.equal(context.summary.openGraphImageGenerationPresent, false);
  assert.equal(context.summary.wrongContextIndicatorsPresent, false);
});

test("Round 5N input audit and owner decision defer all manual-review records", async () => {
  const input = await readJson("pipeline/manifests/round-5n-input-audit.json");
  const ownerDecision = await readJson("pipeline/manifests/round-5n-owner-decision.json");
  const inclusion = await readJson("pipeline/manifests/round-5n-clean-upload-inclusion-manifest.json");
  const deferred = await readJson("pipeline/manifests/round-5n-deferred-manual-review-records.json");

  assert.equal(input.summary.finalObjectKeyMapRecords, 6557);
  assert.equal(input.summary.manualReviewCount, EXPECTED_DEFERRED);
  assert.equal(input.summary.readyCount, EXPECTED_INCLUDED);
  assert.equal(input.summary.ownerDecisionDefersAllManualReviewRecords, true);
  assert.equal(input.summary.unresolvedCollisions, 0);
  assert.equal(input.summary.finalUploadModel, "SVG + WebP only");
  assert.equal(input.summary.pngExcluded, true);
  assert.equal(input.summary.thumbsExcluded, true);
  assert.equal(ownerDecision.excludeManualReviewFromFirstUpload, true);
  assert.equal(ownerDecision.approveAllReadyRecords, true);
  assert.equal(ownerDecision.approveSafeAutoCandidates, false);
  assert.equal(ownerDecision.includeManualReviewRecords, false);
  assert.equal(ownerDecision.manualReviewDecision, "defer");
  assert.equal(ownerDecision.effects.deletesDeferredAssets, false);
  assert.equal(ownerDecision.effects.preventsFutureUploadOfDeferredAssets, false);
  assert.equal(ownerDecision.effects.switchesRuntimePaths, false);
  assert.equal(ownerDecision.effects.uploadsAssets, false);
  assert.equal(inclusion.summary.includedRecordCount, EXPECTED_INCLUDED);
  assert.equal(inclusion.summary.manualReviewRecordsExcluded, true);
  assert.equal(deferred.summary.deferredRecordCount, EXPECTED_DEFERRED);
  assert.ok(deferred.records.every((record) => record.status === "deferred_manual_review"));
});

test("Round 5N clean bundle plan, results, and integrity match the included records", async () => {
  const plan = await readJson("pipeline/manifests/round-5n-clean-upload-bundle-plan.json");
  const results = await readJson("pipeline/manifests/round-5n-clean-upload-bundle-results.json");
  const integrity = await readJson("pipeline/manifests/round-5n-clean-bundle-integrity.json");
  const objectMap = await readJson("pipeline/manifests/round-5n-clean-upload-object-key-map.json");

  assert.equal(plan.summary.includedRecordCount, EXPECTED_INCLUDED);
  assert.equal(plan.summary.deferredRecordCount, EXPECTED_DEFERRED);
  assert.equal(plan.summary.expectedSvgFiles, EXPECTED_INCLUDED);
  assert.equal(plan.summary.expectedWebpFiles, EXPECTED_INCLUDED);
  assert.equal(plan.summary.expectedTotalFiles, EXPECTED_FILE_COUNT);
  assert.equal(plan.summary.svgAndWebpOnly, true);
  assert.equal(plan.summary.noPng, true);
  assert.equal(plan.summary.noThumbs, true);
  assert.equal(plan.summary.noManualReviewRecords, true);

  assert.equal(results.summary.processedRecordCount, EXPECTED_INCLUDED);
  assert.equal(results.summary.expectedFileCount, EXPECTED_FILE_COUNT);
  assert.equal(results.summary.failureCount, 0);
  assert.equal(results.summary.uploadPerformed, false);
  assert.equal(results.summary.runtimePathsChanged, false);
  assert.equal(results.summary.currentR2UploadModified, false);
  assert.equal(results.summary.sourceMediaModified, false);
  assert.equal(results.summary.hardlinkCount + results.summary.copyCount + results.summary.generatedWebpCount + results.summary.skippedExistingCount, EXPECTED_FILE_COUNT);

  assert.equal(integrity.summary.includedRecordCount, EXPECTED_INCLUDED);
  assert.equal(integrity.summary.deferredRecordCount, EXPECTED_DEFERRED);
  assert.equal(integrity.summary.svgFileCount, EXPECTED_INCLUDED);
  assert.equal(integrity.summary.webpFileCount, EXPECTED_INCLUDED);
  assert.equal(integrity.summary.totalFileCount, EXPECTED_FILE_COUNT);
  assert.equal(integrity.summary.expectedTotalFileCount, EXPECTED_FILE_COUNT);
  assert.equal(integrity.summary.pngFileCount, 0);
  assert.equal(integrity.summary.thumbsFileCount, 0);
  assert.equal(integrity.summary.manualReviewAssetIdsIncluded, 0);
  assert.equal(integrity.summary.missingSvgFiles, 0);
  assert.equal(integrity.summary.missingWebpFiles, 0);
  assert.equal(integrity.summary.duplicateObjectKeys, 0);
  assert.equal(integrity.summary.badPublicKeyCount, 0);
  assert.equal(integrity.summary.badPathFormatCount, 0);
  assert.equal(integrity.summary.unresolvedCollisions, 0);
  assert.equal(integrity.summary.cleanObjectKeyPathFormatValid, true);
  assert.equal(integrity.summary.uploadPerformed, false);
  assert.equal(integrity.summary.runtimePathsChanged, false);
  assert.deepEqual(integrity.summary.blockers, []);

  assert.equal(objectMap.summary.recordCount, EXPECTED_INCLUDED);
  assert.equal(objectMap.summary.svgObjectCount, EXPECTED_INCLUDED);
  assert.equal(objectMap.summary.webpObjectCount, EXPECTED_INCLUDED);
  assert.equal(objectMap.summary.pngExcluded, true);
  assert.equal(objectMap.summary.thumbsExcluded, true);
});

test("Round 5N clean bundle contains SVG and WebP only with no manual-review records", async () => {
  const files = await listFilesIfExists(path.join(REPO_ROOT, CLEAN_BUNDLE_ROOT));
  const inclusion = await readJson("pipeline/manifests/round-5n-clean-upload-inclusion-manifest.json");
  const deferred = await readJson("pipeline/manifests/round-5n-deferred-manual-review-records.json");
  const objectMap = await readJson("pipeline/manifests/round-5n-clean-upload-object-key-map.json");
  const finalMap = await readJson("pipeline/manifests/round-5l-final-svg-webp-object-key-map.json");
  const deferredIds = new Set(deferred.records.map((record) => record.assetId));
  const includedIds = new Set(inclusion.records.map((record) => record.assetId));

  assert.equal(files.length, EXPECTED_FILE_COUNT);
  assert.equal(files.filter((file) => file.endsWith(".svg")).length, EXPECTED_INCLUDED);
  assert.equal(files.filter((file) => file.endsWith(".webp")).length, EXPECTED_INCLUDED);
  assert.equal(files.some((file) => file.endsWith(".png")), false);
  assert.equal(files.some((file) => /(?:^|[\\/])thumbs[\\/]|-thumb\./i.test(file)), false);
  assert.ok(inclusion.records.every((record) => !deferredIds.has(record.assetId)));
  assert.ok(deferred.records.every((record) => !includedIds.has(record.assetId)));
  assert.equal(inclusion.records.length + deferred.records.length, finalMap.summary.totalRecords);

  for (const record of objectMap.records) {
    assert.equal(deferredIds.has(record.assetId), false, record.assetId);
    assert.match(record.cleanSvgObjectKey, /^coloring-pages\/svg\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}\.svg$/);
    assert.match(record.cleanWebpObjectKey, /^coloring-pages\/webp\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}\.webp$/);
    assert.doesNotMatch(record.cleanSvgObjectKey, /\/(?:png|thumbs)\//i);
    assert.doesNotMatch(record.cleanWebpObjectKey, /\/(?:png|thumbs)\//i);
    assert.equal(existsSync(path.join(REPO_ROOT, record.localCleanBundleSvgPath)), true);
    assert.equal(existsSync(path.join(REPO_ROOT, record.localCleanBundleWebpPath)), true);
    assert.equal(record.status, "ready_for_manual_upload");
    assert.equal(record.contentTypes.svg, "image/svg+xml");
    assert.equal(record.contentTypes.webp, "image/webp");
    const svgStem = path.basename(record.cleanSvgObjectKey, ".svg").replace(HASH_SUFFIX_PATTERN, "");
    const webpStem = path.basename(record.cleanWebpObjectKey, ".webp").replace(HASH_SUFFIX_PATTERN, "");
    assert.doesNotMatch(svgStem, BAD_PUBLIC_NAME_PATTERN, record.cleanSvgObjectKey);
    assert.doesNotMatch(webpStem, BAD_PUBLIC_NAME_PATTERN, record.cleanWebpObjectKey);
    assert.doesNotMatch(svgStem, TIMESTAMP_LIKE_PATTERN, record.cleanSvgObjectKey);
    assert.doesNotMatch(webpStem, TIMESTAMP_LIKE_PATTERN, record.cleanWebpObjectKey);
  }

  const ignored = await gitCheckIgnore("pipeline/r2-upload-clean/coloring-pages/svg");
  assert.equal(ignored.trim().length > 0, true);
});

test("Round 5N upload guide, verification plan, and runtime switch gate keep upload separate", async () => {
  const uploadGuide = await readJson("pipeline/manifests/round-5n-manual-upload-checklist.json");
  const postUploadPlan = await readJson("pipeline/manifests/round-5n-post-upload-verification-plan.json");
  const runtimeSwitch = await readJson("pipeline/manifests/round-5n-runtime-switch-readiness.json");

  assert.equal(uploadGuide.localFolderToUpload, CLEAN_BUNDLE_ROOT);
  assert.equal(uploadGuide.uploadDestination, "bucket root");
  assert.deepEqual(uploadGuide.expectedObjectKeyPrefixes, ["coloring-pages/svg/", "coloring-pages/webp/"]);
  assert.equal(uploadGuide.expectedCounts.records, EXPECTED_INCLUDED);
  assert.equal(uploadGuide.expectedCounts.deferredRecords, EXPECTED_DEFERRED);
  assert.equal(uploadGuide.expectedCounts.svgFiles, EXPECTED_INCLUDED);
  assert.equal(uploadGuide.expectedCounts.webpFiles, EXPECTED_INCLUDED);
  assert.equal(uploadGuide.expectedCounts.totalFiles, EXPECTED_FILE_COUNT);
  assert.equal(uploadGuide.contentTypes.svg, "image/svg+xml");
  assert.equal(uploadGuide.contentTypes.webp, "image/webp");
  assert.equal(uploadGuide.uploadPerformedByCodex, false);
  assert.ok(uploadGuide.warnings.some((warning) => /Do not upload png/.test(warning)));
  assert.ok(uploadGuide.warnings.some((warning) => /Do not upload thumbs/.test(warning)));
  assert.ok(uploadGuide.warnings.some((warning) => /deferred manual-review/i.test(warning)));

  assert.equal(postUploadPlan.summary.includedRecordCount, EXPECTED_INCLUDED);
  assert.equal(postUploadPlan.summary.deferredManualReviewRecords, EXPECTED_DEFERRED);
  assert.equal(postUploadPlan.summary.appRuntimeSwitchDeferred, true);
  assert.ok(postUploadPlan.checks.some((check) => /Do not expect deferred manual-review records/.test(check)));
  assert.ok(postUploadPlan.checks.some((check) => /Do not switch app runtime paths/.test(check)));

  assert.equal(runtimeSwitch.clean_bundle_created, true);
  assert.equal(runtimeSwitch.clean_bundle_uploaded, false);
  assert.equal(runtimeSwitch.public_urls_verified, false);
  assert.equal(runtimeSwitch.app_runtime_paths_switched, false);
  assert.equal(runtimeSwitch.ready_to_switch_runtime_paths, false);
  assert.ok(runtimeSwitch.blockers.length >= 3);
});

test("Round 5N preserves static export, runtime paths, media boundaries, and deferred launch work", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const generatedItems = await readText("src/generated/coloring/items.json");
  const runtimeSwitch = await readJson("pipeline/manifests/round-5n-runtime-switch-readiness.json");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const projectText = await readProjectText(["app", "src"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedR2UploadCleanMedia = await gitLsFiles("pipeline/r2-upload-clean");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const statusPublic = await gitStatusFor("public");
  const statusR2Upload = await gitStatusFor("pipeline/r2-upload");
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
  assert.doesNotMatch(generatedItems, /round-5n-clean-upload-object-key-map|cleanSvgObjectKey|cleanWebpObjectKey/);
  assert.equal(runtimeSwitch.app_runtime_paths_switched, false);
  assert.equal(runtimeSwitch.ready_to_switch_runtime_paths, false);
  assert.match(adsConfig, /Advertisement/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedR2UploadCleanMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.doesNotMatch(statusPublic, /(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i);
  assert.equal(statusR2Upload.trim(), "");
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

async function gitCheckIgnore(relativePath) {
  const { stdout } = await execFileAsync("git", ["check-ignore", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
