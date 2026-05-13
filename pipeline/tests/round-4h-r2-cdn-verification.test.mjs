import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4H_MANIFEST_FILES,
  ROUND4H_REPORT_FILES,
  ROUND4H_RUN_ID,
  ROUND4H_TEMP_ASSET_BASE_URL,
  buildRound4HFullUploadReadiness,
  validateRound4HAssetBaseUrl,
} from "../scripts/round-4h-r2-cdn-verification.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("Round 4H JSON manifests parse and use the temporary coloring-pages R2 route", async () => {
  for (const manifestPath of ROUND4H_MANIFEST_FILES) {
    const rawManifest = await readText(manifestPath);
    const manifest = JSON.parse(rawManifest);
    assert.equal(manifest.runId, ROUND4H_RUN_ID, manifestPath);
    assert.doesNotMatch(rawManifest, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, manifestPath);
    assert.doesNotMatch(rawManifest, /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|token\s*=\S+|secret\s*=\S+/i, manifestPath);
  }
  for (const reportPath of ROUND4H_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4H/i, reportPath);
    assert.doesNotMatch(text, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, reportPath);
    assert.doesNotMatch(text, /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|token\s*=\S+|secret\s*=\S+/i, reportPath);
  }

  const env = await readJson("pipeline/manifests/round-4h-env-validation.json");
  assert.equal(env.assetBaseUrl, ROUND4H_TEMP_ASSET_BASE_URL);
  assert.equal(env.checks.hasColoringPagesPrefix, true);
  assert.equal(env.checks.temporaryR2DevAllowedForThisRound, true);
  assert.equal(env.checks.finalProductionDomainRecommendation, "custom-asset-domain-required-later");
  assert.equal(env.checks.noPrivateR2Endpoint, true);
  assert.equal(env.checks.noOldTestPrefix, true);
  assert.equal(env.checks.noDoubleColoringPagesPrefix, true);
  assert.equal(env.valid, true);
});

test("environment validation accepts only the Round 4H temporary public asset base shape", () => {
  assert.equal(validateRound4HAssetBaseUrl(ROUND4H_TEMP_ASSET_BASE_URL).valid, true);
  assert.equal(validateRound4HAssetBaseUrl("").valid, false);
  assert.equal(validateRound4HAssetBaseUrl("https://example.com/coloring/test-v1").valid, false);
  assert.equal(validateRound4HAssetBaseUrl("https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring/test-v1").valid, false);
  assert.equal(validateRound4HAssetBaseUrl("https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages/coloring-pages").valid, false);
  assert.equal(validateRound4HAssetBaseUrl("https://account.r2.cloudflarestorage.com/coloring-pages").valid, false);
  assert.equal(validateRound4HAssetBaseUrl("not-a-url").valid, false);
});

test("URL verification plan and results cover 30 SVG, PNG preview, and thumbnail trios", async () => {
  const plan = await readJson("pipeline/manifests/round-4h-r2-url-verification-plan.json");
  const results = await readJson("pipeline/manifests/round-4h-r2-url-verification-results.json");

  assert.equal(plan.publicBaseUrl, ROUND4H_TEMP_ASSET_BASE_URL);
  assert.equal(plan.summary.selectedImageRecordCount, 30);
  assert.equal(plan.summary.plannedUrlCount, 90);
  assert.equal(plan.summary.totalSvgUrls, 30);
  assert.equal(plan.summary.totalPngPreviewUrls, 30);
  assert.equal(plan.summary.totalThumbnailUrls, 30);
  assert.equal(results.summary.urlsPlanned, 90);
  assert.equal(results.summary.urlsChecked, 90);

  for (const entry of plan.urls) {
    assert.match(entry.relativeAssetPath, /^(?:svg|png|thumbs)\//, entry.relativeAssetPath);
    assert.match(entry.uploadedObjectKey, /^coloring-pages\/(?:svg|png|thumbs)\//, entry.uploadedObjectKey);
    assert.equal(entry.expectedPublicUrl, `${ROUND4H_TEMP_ASSET_BASE_URL}/${entry.relativeAssetPath}`);
    assert.doesNotMatch(entry.expectedPublicUrl, /coloring\/test-v1|coloring-pages\/coloring-pages|[A-Za-z]:\\/i);
    if (entry.mediaType === "svg") assert.equal(entry.expectedContentType, "image/svg+xml");
    if (entry.mediaType === "pngPreview" || entry.mediaType === "thumbnail") assert.equal(entry.expectedContentType, "image/png");
    assert.ok(entry.expectedByteSizeRange.min > 0);
    assert.ok(entry.expectedByteSizeRange.max >= entry.expectedByteSizeRange.min);
    assert.ok(entry.likelyPages.length > 0, entry.assetId);
  }
});

test("URL verification results classify media success, content types, cache headers, and URL safety", async () => {
  const results = await readJson("pipeline/manifests/round-4h-r2-url-verification-results.json");

  assert.equal(results.status, results.summary.failed === 0 ? "passed" : "failed");
  assert.equal(results.summary.svg.total, 30);
  assert.equal(results.summary.pngPreview.total, 30);
  assert.equal(results.summary.thumbnail.total, 30);
  assert.equal(results.summary.doublePrefixFailures, 0);
  assert.equal(results.summary.oldPrefixFailures, 0);
  assert.equal(results.summary.privateEndpointRedirects, 0);
  assert.equal(results.summary.localPathLeaks, 0);
  assert.equal(results.summary.accessDeniedResponses, 0);
  assert.equal(results.summary.r2ErrorHtmlResponses, 0);

  for (const entry of results.entries) {
    assert.match(entry.url, /^https:\/\/pub-1bf18626e66c4e4aa3093fb370122f11\.r2\.dev\/coloring-pages\/(?:svg|png|thumbs)\//);
    assert.doesNotMatch(entry.url, /coloring\/test-v1|coloring-pages\/coloring-pages|[A-Za-z]:\\/);
    if (entry.httpStatus === 200) {
      assert.ok(entry.byteLength > 0, entry.url);
      assert.equal(entry.contentTypeAccepted, true, entry.url);
    }
  }
});

test("readiness gates full upload on successful URL verification and static preview", () => {
  const failed = buildRound4HFullUploadReadiness({
    urlVerificationResults: { status: "failed", summary: { failed: 1, urlsChecked: 90 } },
    staticPreviewResults: { status: "passed" },
  });
  assert.equal(failed.full_upload_bundle_ready, false);

  const passed = buildRound4HFullUploadReadiness({
    urlVerificationResults: { status: "passed", summary: { failed: 0, urlsChecked: 90 } },
    staticPreviewResults: { status: "passed" },
  });
  assert.equal(passed.full_upload_bundle_ready, true);
  assert.equal(passed.recommendedNextRound, "round-4i-generate-full-r2-upload-bundle");
});

test("static preview results preserve frontend-only routing and generated filenames", async () => {
  const preview = await readJson("pipeline/manifests/round-4h-static-cdn-preview-results.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const selection = await readJson("pipeline/manifests/round-4g-r2-test-selection.json");

  assert.equal(preview.status, "passed");
  assert.equal(preview.assetBaseUrl, ROUND4H_TEMP_ASSET_BASE_URL);
  assert.equal(preview.staticExportConfigured, true);
  assert.equal(preview.noAppApiRoute, true);
  assert.equal(preview.noBackendRequired, true);
  assert.equal(preview.noOldPrefixFound, true);
  assert.equal(preview.noDoublePrefixFound, true);
  assert.equal(preview.generatedFilenamesPreserved, true);
  assert.ok(preview.pagesInspected.length >= 8);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);

  for (const record of selection.records) {
    for (const media of Object.values(record.media)) {
      const filename = media.cdnRelativePath.split("/").at(-1);
      assert.ok(preview.generatedFilenames.includes(filename), filename);
    }
  }
});

test("repo safety checks preserve ignored media, source images, static export, and local env privacy", async () => {
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const gitStatusImages = await gitStatusFor("images");
  const gitStatusIlovesvg = await gitStatusFor("ilovesvg");
  const gitStatusProductionFull = await gitStatusFor("pipeline/production/full");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload-test");
  const envIgnore = await gitCheckIgnore(".env.local");
  const round4hScript = await readText("pipeline/scripts/round-4h-r2-cdn-verification.mjs");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => /[\\/]api[\\/]/.test(file)), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(publicFiles.some((file) => /pipeline[\\/]+production/i.test(file)), false);
  assert.equal(gitStatusImages.trim(), "");
  assert.equal(gitStatusIlovesvg.trim(), "");
  assert.equal(gitStatusProductionFull.trim(), "");
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(envIgnore.trim(), ".env.local");
  assert.doesNotMatch(round4hScript, /wrangler\s+r2|aws\s+s3|curl\s+-T|delete-object|purge/i);
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
