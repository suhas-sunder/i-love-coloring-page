import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4G_MANIFEST_FILES,
  ROUND4G_REPORT_FILES,
  ROUND4G_RUN_ID,
  R2_TEST_BUNDLE_ROOT,
  runRound4GR2TestBundle,
} from "../scripts/round-4g-build-r2-test-bundle.mjs";
import { runRound4GR2UrlVerification } from "../scripts/round-4g-verify-r2-test-urls.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEST_PREFIX = "coloring/test-v1";
const EXPECTED_SELECTION_COUNT = 30;
const EXPECTED_MEDIA_FILE_COUNT = EXPECTED_SELECTION_COUNT * 3;

test("Round 4G builder creates deterministic manifests and a 30-record R2 test bundle", async () => {
  await runRound4GR2TestBundle({
    repoRoot: REPO_ROOT,
    clean: true,
    limit: EXPECTED_SELECTION_COUNT,
    prefix: TEST_PREFIX,
    verify: true,
  });

  for (const manifestPath of ROUND4G_MANIFEST_FILES) {
    const manifest = await readJson(manifestPath);
    assert.equal(manifest.runId, ROUND4G_RUN_ID, manifestPath);
  }
  for (const reportPath of ROUND4G_REPORT_FILES) {
    assert.match(await readText(reportPath), /Round 4G/i, reportPath);
  }

  const selection = await readJson("pipeline/manifests/round-4g-r2-test-selection.json");
  const plan = await readJson("pipeline/manifests/round-4g-r2-test-upload-bundle-plan.json");
  const results = await readJson("pipeline/manifests/round-4g-r2-test-upload-bundle-results.json");

  assert.equal(selection.summary.selectedImageRecordCount, EXPECTED_SELECTION_COUNT);
  assert.equal(selection.records.length, EXPECTED_SELECTION_COUNT);
  assert.equal(plan.summary.selectedImageRecordCount, EXPECTED_SELECTION_COUNT);
  assert.equal(plan.summary.totalMediaFilesPlanned, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(plan.summary.totalSvgFiles, EXPECTED_SELECTION_COUNT);
  assert.equal(plan.summary.totalPngPreviewFiles, EXPECTED_SELECTION_COUNT);
  assert.equal(plan.summary.totalThumbnailFiles, EXPECTED_SELECTION_COUNT);
  assert.equal(plan.uploadPrefix, TEST_PREFIX);
  assert.equal(plan.uploadBundleRoot, R2_TEST_BUNDLE_ROOT);
  assert.equal(plan.expectedPublicBaseUrlPattern, "https://assets.example.com/coloring/test-v1");
  assert.equal(results.summary.createdMediaFileCount, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(results.summary.failedFileCount, 0);
  assert.equal(results.safetyChecks.publicFolderExclusionConfirmed, true);
  assert.equal(results.safetyChecks.sourceAssetImmutabilityConfirmed, true);
});

test("selection contains only successful non-quarantined image records with safe public metadata", async () => {
  const selection = await readJson("pipeline/manifests/round-4g-r2-test-selection.json");
  const publish = await readJson("pipeline/manifests/round-4e-asset-publish-manifest.json");
  const production = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");
  const blocked = await readJson("pipeline/manifests/round-3a1-blocked-source-images.json");
  const generatedItems = await readJson("src/generated/coloring/items.json");
  const generatedRoutes = await readJson("src/generated/coloring/routes.json");

  const readyPublishAssetIds = new Set(publish.files.filter((file) => file.status === "ready").map((file) => file.assetId));
  const successfulAssets = production.assets.filter((asset) => asset.status === "passed_production_export");
  const successfulAssetIds = new Set(successfulAssets.map((asset) => asset.assetId));
  const sourcePathByAssetId = new Map(successfulAssets.map((asset) => [asset.assetId, asset.sourceRelativePath]));
  const blockedSourcePaths = new Set((blocked.entries || []).map((entry) => entry.sourceRelativePath));
  const quarantinedAssetIds = new Set((quarantine.entries || []).map((entry) => entry.assetId));
  const clientItemIds = new Set(generatedItems.items.map((item) => item.assetId));

  assert.equal(generatedRoutes.routes.length, 65);
  assert.equal(generatedRoutes.noPerImageRoutes, true);

  const seenAssetIds = new Set();
  let warningCount = 0;
  let nonWarningCount = 0;
  let multiHubCount = 0;
  const requiredHubSlugs = new Set([
    "plushies",
    "animals",
    "mandalas",
    "anime-girls",
    "chibi",
    "fantasy",
    "christmas",
    "halloween",
    "prehistoric-animals",
    "plants",
    "flowers",
    "cars",
    "sea-life",
    "dogs",
    "mythology",
    "geometric",
  ]);
  const coveredHubSlugs = new Set();

  for (const record of selection.records) {
    assert.equal(seenAssetIds.has(record.assetId), false, record.assetId);
    seenAssetIds.add(record.assetId);
    assert.equal(successfulAssetIds.has(record.assetId), true, record.assetId);
    assert.equal(readyPublishAssetIds.has(record.assetId), true, record.assetId);
    assert.equal(clientItemIds.has(record.assetId), true, record.assetId);
    assert.equal(quarantinedAssetIds.has(record.assetId), false, record.assetId);
    assert.equal(blockedSourcePaths.has(sourcePathByAssetId.get(record.assetId)), false, record.assetId);
    assert.equal(record.sourceImagePath, undefined);
    assert.doesNotMatch(JSON.stringify(record), /[A-Za-z]:\\|(?:^|")images\/|ilovesvg\//i);

    if (record.warningFlags.length > 0) warningCount += 1;
    if (record.warningFlags.length === 0) nonWarningCount += 1;
    if (record.hubs.length > 1) multiHubCount += 1;
    for (const hub of record.hubs) coveredHubSlugs.add(hub.slug);

    for (const key of ["svg", "pngPreview", "thumbnail"]) {
      const sourcePath = record.media[key].sourceLocalRelativePath;
      const targetPath = record.media[key].targetUploadBundleRelativePath;
      assert.match(sourcePath, /^pipeline\/production\/full\/assets\/(?:svg|png|thumbs)\//);
      assert.match(targetPath, /^pipeline\/r2-upload-test\/coloring\/test-v1\/(?:svg|png|thumbs)\//);
      assert.match(record.media[key].r2ObjectKey, /^coloring\/test-v1\/(?:svg|png|thumbs)\//);
      assert.match(record.media[key].expectedPublicUrl, /^https:\/\/assets\.example\.com\/coloring\/test-v1\/(?:svg|png|thumbs)\//);
      assertSafeRelativePath(sourcePath);
      assertSafeRelativePath(targetPath);
      assertSafeRelativePath(record.media[key].r2ObjectKey);
    }
  }

  assert.ok(warningCount >= 6, `expected several warning records, got ${warningCount}`);
  assert.ok(nonWarningCount >= 6, `expected several non-warning records, got ${nonWarningCount}`);
  assert.ok(multiHubCount >= 3, `expected records in multiple hubs, got ${multiHubCount}`);
  for (const slug of requiredHubSlugs) {
    assert.equal(coveredHubSlugs.has(slug), true, slug);
  }
});

test("object key map and bundle files preserve SVG, PNG preview, and thumbnail trios", async () => {
  const selection = await readJson("pipeline/manifests/round-4g-r2-test-selection.json");
  const objectKeyMap = await readJson("pipeline/manifests/round-4g-r2-test-object-key-map.json");
  const results = await readJson("pipeline/manifests/round-4g-r2-test-upload-bundle-results.json");

  assert.equal(objectKeyMap.entries.length, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(results.summary.createdMediaFileCount, EXPECTED_MEDIA_FILE_COUNT);

  const expectedByAsset = new Map(selection.records.map((record) => [record.assetId, new Set(["svg", "pngPreview", "thumbnail"])]));
  let representedBytes = 0;

  for (const entry of objectKeyMap.entries) {
    assert.equal(entry.status, "ready");
    assert.match(entry.r2ObjectKey, /^coloring\/test-v1\/(?:svg|png|thumbs)\//);
    assert.equal(entry.cdnRelativePath, entry.r2ObjectKey.replace(/^coloring\/test-v1\//, ""));
    assert.equal(entry.expectedPublicUrl, `https://assets.example.com/${entry.r2ObjectKey}`);
    assert.match(entry.recommendedCacheControl, /max-age=31536000/);
    assert.ok(entry.fileSize > 0, entry.r2ObjectKey);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);

    if (entry.mediaType === "svg") assert.equal(entry.contentType, "image/svg+xml");
    if (entry.mediaType === "pngPreview" || entry.mediaType === "thumbnail") assert.equal(entry.contentType, "image/png");

    const expectedTypes = expectedByAsset.get(entry.assetId);
    assert.ok(expectedTypes, entry.assetId);
    assert.equal(expectedTypes.delete(entry.mediaType), true, `${entry.assetId} ${entry.mediaType}`);

    const bundleFilePath = path.join(REPO_ROOT, ...entry.uploadBundleRelativePath.split("/"));
    const bundleStat = await stat(bundleFilePath);
    assert.equal(bundleStat.size, entry.fileSize, entry.uploadBundleRelativePath);
    representedBytes += entry.fileSize;
  }

  for (const [assetId, remainingTypes] of expectedByAsset) {
    assert.deepEqual([...remainingTypes], [], assetId);
  }
  assert.equal(results.summary.totalBundleBytesRepresented, representedBytes);
});

test("bundle safety checks exclude full media, public copies, app API routes, and tracked generated media", async () => {
  const bundleFiles = await listFiles(path.join(REPO_ROOT, "pipeline", "r2-upload-test"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const trackedBundleMedia = await gitLsFiles("pipeline/r2-upload-test");
  const gitStatusImages = await gitStatusFor("images");
  const gitStatusIlovesvg = await gitStatusFor("ilovesvg");
  const gitStatusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.equal(bundleFiles.length, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(bundleFiles.some((file) => /round-4e-asset-publish-manifest\.json$/.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production/i.test(file)), false);
  assert.equal(appFiles.some((file) => /[\\/]api[\\/]/.test(file)), false);
  assert.equal(trackedBundleMedia.trim(), "");
  assert.equal(gitStatusImages.trim(), "");
  assert.equal(gitStatusIlovesvg.trim(), "");
  assert.equal(gitStatusProductionFull.trim(), "");

  const nextConfig = await readText("next.config.mjs");
  const netlify = await readText("netlify.toml");
  const assetResolver = await readText("src/lib/coloring/assets.ts");
  const envExample = await readText(".env.example");
  const bundleScript = await readText("pipeline/scripts/round-4g-build-r2-test-bundle.mjs");
  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(netlify, /publish\s*=\s*"out"/);
  assert.match(assetResolver, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/);
  assert.doesNotMatch(assetResolver, /\/api\/coloring-assets|NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY/);
  assert.match(envExample, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https:\/\/assets\.example\.com\/coloring\/test-v1/);
  assert.match(envExample, /^CLOUDFLARE_R2_SECRET_ACCESS_KEY=$/m);
  assert.match(envExample, /^CLOUDFLARE_R2_UPLOAD_PREFIX=coloring\/test-v1$/m);
  assert.doesNotMatch(envExample, /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|token\s*=\S+/i);
  assert.doesNotMatch(bundleScript, /wrangler\s+r2|aws\s+s3|curl\s+-T|delete-object|purge/i);
});

test("URL verification can run before upload without failing normal validation", async () => {
  const results = await runRound4GR2UrlVerification({
    repoRoot: REPO_ROOT,
    dryRun: true,
  });
  const persisted = await readJson("pipeline/manifests/round-4g-r2-test-url-verification-results.json");

  assert.equal(results.runId, ROUND4G_RUN_ID);
  assert.equal(results.status, "not_run");
  assert.equal(results.reason, "dry_run_no_public_upload_yet");
  assert.equal(persisted.status, "not_run");
  assert.equal(persisted.summary.urlsChecked, 0);
  assert.ok(persisted.summary.urlsPlanned >= 30);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFiles(root) {
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results;
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }
  return listFiles(root);
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function assertSafeRelativePath(value) {
  assert.equal(path.isAbsolute(value), false, value);
  assert.doesNotMatch(value, /(?:^|\/)\.\.?(?:\/|$)|\\|:|^\/|\/\//, value);
}
