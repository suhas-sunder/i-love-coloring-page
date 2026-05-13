import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  FULL_R2_BUNDLE_ROOT,
  ROUND4I_MANIFEST_FILES,
  ROUND4I_REPORT_FILES,
  ROUND4I_RUN_ID,
  runRound4IFullR2Bundle,
} from "../scripts/round-4i-build-full-r2-bundle.mjs";
import { runRound4IFullR2UrlVerification } from "../scripts/round-4i-verify-full-r2-urls.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FULL_PREFIX = "coloring-pages";
const EXPECTED_IMAGE_RECORD_COUNT = 6557;
const EXPECTED_MEDIA_FILE_COUNT = 19671;
const EXPECTED_TOTAL_BYTES = 3148598669;

test("Round 4I builder creates deterministic full R2 bundle manifests and files", async () => {
  await runRound4IFullR2Bundle({
    repoRoot: REPO_ROOT,
    clean: true,
    prefix: FULL_PREFIX,
    verify: true,
  });

  for (const manifestPath of ROUND4I_MANIFEST_FILES) {
    const raw = await readText(manifestPath);
    const manifest = JSON.parse(raw);
    assert.equal(manifest.runId, ROUND4I_RUN_ID, manifestPath);
    assert.doesNotMatch(raw, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, manifestPath);
  }
  for (const reportPath of ROUND4I_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4I/i, reportPath);
    assert.doesNotMatch(text, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  const plan = await readJson("pipeline/manifests/round-4i-full-r2-bundle-plan.json");
  const results = await readJson("pipeline/manifests/round-4i-full-r2-bundle-results.json");

  assert.equal(plan.uploadBundleRoot, FULL_R2_BUNDLE_ROOT);
  assert.equal(plan.uploadPrefix, FULL_PREFIX);
  assert.equal(plan.summary.totalImageRecordsPlanned, EXPECTED_IMAGE_RECORD_COUNT);
  assert.equal(plan.summary.totalMediaFilesPlanned, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(plan.summary.totalSvgFiles, EXPECTED_IMAGE_RECORD_COUNT);
  assert.equal(plan.summary.totalPngPreviewFiles, EXPECTED_IMAGE_RECORD_COUNT);
  assert.equal(plan.summary.totalThumbnailFiles, EXPECTED_IMAGE_RECORD_COUNT);
  assert.equal(plan.summary.totalBytesRepresented, EXPECTED_TOTAL_BYTES);
  assert.equal(plan.summary.invalidFiles.length, 0);
  assert.equal(plan.summary.skippedFiles.length, 0);
  assert.equal(plan.hardlinkOrCopyModeUsed, "hardlink");
  assert.equal(plan.expectedPublicBaseUrlPattern, "https://YOUR-ASSET-DOMAIN.com/coloring-pages");

  assert.equal(results.summary.imageRecordCount, EXPECTED_IMAGE_RECORD_COUNT);
  assert.equal(results.summary.createdMediaFileCount, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(results.summary.linkedFileCount, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(results.summary.copiedFileCount, 0);
  assert.equal(results.summary.failedFileCount, 0);
  assert.equal(results.summary.totalBundleBytesRepresented, EXPECTED_TOTAL_BYTES);
  assert.equal(results.safetyChecks.publicFolderExclusionConfirmed, true);
  assert.equal(results.safetyChecks.sourceAssetImmutabilityConfirmed, true);
  assert.equal(results.safetyChecks.oldPrefixExcluded, true);
  assert.equal(results.safetyChecks.filenamePreservationConfirmed, true);
});

test("full object key map covers only successful non-quarantined production assets", async () => {
  const objectMap = await readJson("pipeline/manifests/round-4i-full-r2-object-key-map.json");
  const publish = await readJson("pipeline/manifests/round-4e-asset-publish-manifest.json");
  const production = await readJson("pipeline/manifests/round-3c-production-assets.json");
  const quarantine = await readJson("pipeline/manifests/round-3c-production-quarantine.json");
  const generatedItems = await readJson("src/generated/coloring/items.json");

  const readyPublishAssetIds = new Set(publish.files.filter((file) => file.status === "ready").map((file) => file.assetId));
  const successfulAssetIds = new Set(production.assets.filter((asset) => asset.status === "passed_production_export").map((asset) => asset.assetId));
  const quarantinedAssetIds = new Set((quarantine.entries || []).map((entry) => entry.assetId));
  const generatedItemIds = new Set(generatedItems.items.map((item) => item.assetId));
  const seenByAsset = new Map();

  assert.equal(objectMap.entries.length, EXPECTED_MEDIA_FILE_COUNT);
  assert.equal(objectMap.summary.imageRecordCount, EXPECTED_IMAGE_RECORD_COUNT);
  assert.equal(objectMap.summary.mediaFileCount, EXPECTED_MEDIA_FILE_COUNT);

  for (const entry of objectMap.entries) {
    assert.equal(entry.status, "ready");
    assert.equal(readyPublishAssetIds.has(entry.assetId), true, entry.assetId);
    assert.equal(successfulAssetIds.has(entry.assetId), true, entry.assetId);
    assert.equal(generatedItemIds.has(entry.assetId), true, entry.assetId);
    assert.equal(quarantinedAssetIds.has(entry.assetId), false, entry.assetId);
    assert.match(entry.sourceLocalRelativePath, /^pipeline\/production\/full\/assets\/(?:svg|png|thumbs)\//);
    assert.match(entry.uploadBundleRelativePath, /^pipeline\/r2-upload\/coloring-pages\/(?:svg|png|thumbs)\//);
    assert.match(entry.r2ObjectKey, /^coloring-pages\/(?:svg|png|thumbs)\//);
    assert.equal(entry.cdnRelativePath, entry.r2ObjectKey.replace(/^coloring-pages\//, ""));
    assert.match(entry.expectedPublicUrlPattern, /^\$\{NEXT_PUBLIC_COLORING_ASSET_BASE_URL\}\/(?:svg|png|thumbs)\//);
    assert.doesNotMatch(JSON.stringify(entry), /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i);
    assertSafeRelativePath(entry.sourceLocalRelativePath);
    assertSafeRelativePath(entry.uploadBundleRelativePath);
    assertSafeRelativePath(entry.r2ObjectKey);
    assert.ok(entry.fileSize > 0, entry.r2ObjectKey);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.match(entry.recommendedCacheControl, /max-age=31536000/);

    if (entry.mediaType === "svg") assert.equal(entry.contentType, "image/svg+xml");
    if (entry.mediaType === "pngPreview" || entry.mediaType === "thumbnail") assert.equal(entry.contentType, "image/png");

    const mediaTypes = seenByAsset.get(entry.assetId) || new Set();
    mediaTypes.add(entry.mediaType);
    seenByAsset.set(entry.assetId, mediaTypes);
  }

  assert.equal(seenByAsset.size, EXPECTED_IMAGE_RECORD_COUNT);
  for (const [assetId, mediaTypes] of seenByAsset) {
    assert.deepEqual([...mediaTypes].sort(), ["pngPreview", "svg", "thumbnail"], assetId);
  }
});

test("upload bundle contains each SVG, PNG preview, and thumbnail trio without renaming", async () => {
  const objectMap = await readJson("pipeline/manifests/round-4i-full-r2-object-key-map.json");
  let representedBytes = 0;

  for (const entry of objectMap.entries) {
    const sourceFileName = entry.sourceLocalRelativePath.split("/").at(-1);
    const targetFileName = entry.uploadBundleRelativePath.split("/").at(-1);
    const cdnFileName = entry.cdnRelativePath.split("/").at(-1);
    assert.equal(targetFileName, sourceFileName, entry.r2ObjectKey);
    assert.equal(cdnFileName, sourceFileName, entry.r2ObjectKey);

    const bundleFilePath = path.join(REPO_ROOT, ...entry.uploadBundleRelativePath.split("/"));
    const sourceFilePath = path.join(REPO_ROOT, ...entry.sourceLocalRelativePath.split("/"));
    const bundleStat = await stat(bundleFilePath);
    const sourceStat = await stat(sourceFilePath);
    assert.equal(bundleStat.size, entry.fileSize, entry.uploadBundleRelativePath);
    assert.equal(sourceStat.size, entry.fileSize, entry.sourceLocalRelativePath);
    representedBytes += entry.fileSize;
  }

  assert.equal(representedBytes, EXPECTED_TOTAL_BYTES);
});

test("full URL verifier is safe before manual upload", async () => {
  const results = await runRound4IFullR2UrlVerification({
    repoRoot: REPO_ROOT,
    dryRun: true,
  });
  const persisted = await readJson("pipeline/manifests/round-4i-full-r2-url-verification-results.json");
  const plan = await readJson("pipeline/manifests/round-4i-full-r2-url-verification-plan.json");

  assert.equal(results.runId, ROUND4I_RUN_ID);
  assert.equal(results.status, "not_run");
  assert.equal(results.reason, "dry_run_full_upload_not_completed");
  assert.equal(persisted.status, "not_run");
  assert.equal(persisted.summary.urlsChecked, 0);
  assert.equal(plan.summary.representativeTriosPlanned >= 100, true);
  assert.equal(plan.summary.plannedUrlCount, plan.summary.representativeTriosPlanned * 3);
  for (const entry of plan.urls) {
    assert.match(entry.r2ObjectKey, /^coloring-pages\/(?:svg|png|thumbs)\//);
    assert.doesNotMatch(entry.expectedPublicUrlPattern, /coloring\/test-v1|coloring-pages\/coloring-pages|[A-Za-z]:\\/i);
    assert.ok(entry.expectedByteSizeRange.min > 0);
  }
});

test("repo safety keeps env local private, generated media ignored, and frontend static", async () => {
  const packageJson = await readJson("package.json");
  const nextConfig = await readText("next.config.mjs");
  const netlify = await readText("netlify.toml");
  const assetResolver = await readText("src/lib/coloring/assets.ts");
  const envExample = await readText(".env.example");
  const gitignore = await readText(".gitignore");
  const routes = await readJson("src/generated/coloring/routes.json");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedEnvLocal = await gitLsFiles(".env.local");
  const envIgnore = await gitCheckIgnore(".env.local");
  const gitStatusImages = await gitStatusFor("images");
  const gitStatusIlovesvg = await gitStatusFor("ilovesvg");
  const gitStatusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.match(packageJson.scripts.dev, /next dev/);
  assert.match(packageJson.scripts.dev, /(?:--hostname|-H)\s+localhost/);
  assert.match(packageJson.scripts.dev, /(?:--port|-p)\s+3005/);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(netlify, /publish\s*=\s*"out"/);
  assert.match(assetResolver, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL/);
  assert.doesNotMatch(assetResolver, /\/api\/coloring-assets|NEXT_PUBLIC_COLORING_USE_LOCAL_ASSET_PROXY/);
  assert.match(envExample, /NEXT_PUBLIC_SITE_URL=http:\/\/localhost:3005/);
  assert.match(envExample, /NEXT_PUBLIC_COLORING_ASSET_BASE_URL=https:\/\/assets\.example\.com\/coloring-pages/);
  assert.match(gitignore, /^pipeline\/r2-upload\//m);
  assert.match(gitignore, /^pipeline\/r2-upload-test\//m);
  assert.match(gitignore, /^pipeline\/review\//m);
  assert.match(gitignore, /^pipeline\/production\//m);
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\*\.local$/m);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => /[\\/]api[\\/]/.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production/i.test(file)), false);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedEnvLocal.trim(), "");
  assert.equal(envIgnore.trim(), ".env.local");
  assert.equal(gitStatusImages.trim(), "");
  assert.equal(gitStatusIlovesvg.trim(), "");
  assert.equal(gitStatusProductionFull.trim(), "");
});

test("Round 4I outputs do not contain credentials or upload commands", async () => {
  const files = [...ROUND4I_MANIFEST_FILES, ...ROUND4I_REPORT_FILES, "pipeline/scripts/round-4i-build-full-r2-bundle.mjs"];
  for (const relativePath of files) {
    const text = await readText(relativePath);
    assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|token\s*=\S+|secret\s*=\S+/i, relativePath);
    assert.doesNotMatch(text, /wrangler\s+r2|aws\s+s3|curl\s+-T|delete-object|purge/i, relativePath);
  }
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

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitCheckIgnore(relativePath) {
  const { stdout } = await execFileAsync("git", ["check-ignore", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function assertSafeRelativePath(value) {
  assert.equal(path.isAbsolute(value), false, value);
  assert.doesNotMatch(value, /(?:^|\/)\.\.?(?:\/|$)|\\|:|^\/|\/\//, value);
}
