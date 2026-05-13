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
  "pipeline/manifests/round-5l-project-context-check.json",
  "pipeline/manifests/round-5l-working-tree-audit.json",
  "pipeline/manifests/round-5l-current-asset-filename-audit.json",
  "pipeline/manifests/round-5l-filename-cleanup-taxonomy.json",
  "pipeline/manifests/round-5l-clean-object-key-proposals.json",
  "pipeline/manifests/round-5l-clean-object-key-collisions.json",
  "pipeline/manifests/round-5l-manual-review-filename-items.json",
  "pipeline/manifests/round-5l-final-svg-webp-object-key-map.json",
  "pipeline/manifests/round-5l-app-path-mapping-plan.json",
  "pipeline/manifests/round-5l-future-full-upload-plan.json",
  "pipeline/manifests/round-5l-sample-clean-key-preview.json",
];

const BAD_PUBLIC_NAME_PATTERN =
  /\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|failed?|failure|retry|generated|ai-generated|image|export|download|screenshot|untitled|copy|final-final|temp|draft|pipeline|bakeoff|preview|thumb|thumbnail)\b/i;
const TIMESTAMP_LIKE_PATTERN = /\b(?:20\d{2}[-_.]?\d{2}[-_.]?\d{2}|\d{8,}|\d{4}[-_.]?\d{2}[-_.]?\d{2}[-_.]?\d{2,})\b/;

test("Round 5L JSON manifests parse and confirm project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5l-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5kCommitExists, true);
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

test("Round 5L filename audit and cleanup taxonomy are present", async () => {
  const audit = await readJson("pipeline/manifests/round-5l-current-asset-filename-audit.json");
  const taxonomy = await readJson("pipeline/manifests/round-5l-filename-cleanup-taxonomy.json");

  assert.equal(audit.summary.totalSvgFiles, 6557);
  assert.equal(audit.summary.totalPlannedWebpRecords, 6557);
  assert.equal(audit.summary.totalPlannedSvgWebpPairs, 6557);
  assert.equal(audit.summary.missingSvgFileCount, 0);
  assert.ok(audit.summary.totalSuspiciousFilenames >= 0);
  assert.ok(audit.records.length > 0);

  const reasonCodes = new Set(taxonomy.reasonCodes.map((entry) => entry.code));
  const confidenceLevels = taxonomy.confidenceLevels.map((entry) => entry.level);
  const actions = taxonomy.actions.map((entry) => entry.action);

  for (const code of [
    "ai_export_name",
    "failed_name",
    "timestamp_name",
    "generic_name",
    "duplicate_tokens",
    "category_mismatch",
    "spelling_issue",
    "overly_long",
    "internal_pipeline_term",
    "vague_subject",
    "collision_risk",
    "safe_existing_name",
    "manual_review_required",
  ]) {
    assert.equal(reasonCodes.has(code), true, code);
  }
  assert.deepEqual(confidenceLevels, ["high", "medium", "low", "manual_review"]);
  assert.deepEqual(actions, ["keep", "clean_public_object_key", "manual_review_before_full_upload", "defer"]);
});

test("Round 5L proposals and final map produce unique SVG and WebP clean object keys", async () => {
  const proposals = await readJson("pipeline/manifests/round-5l-clean-object-key-proposals.json");
  const finalMap = await readJson("pipeline/manifests/round-5l-final-svg-webp-object-key-map.json");
  const collisions = await readJson("pipeline/manifests/round-5l-clean-object-key-collisions.json");
  const manualReview = await readJson("pipeline/manifests/round-5l-manual-review-filename-items.json");

  assert.equal(proposals.summary.totalRecords, finalMap.summary.totalRecords);
  assert.equal(finalMap.summary.totalRecords, 6557);
  assert.equal(finalMap.summary.totalSvgFiles, 6557);
  assert.equal(finalMap.summary.totalWebpFiles, 6557);
  assert.equal(finalMap.summary.totalExpectedUploadFiles, 13114);
  assert.equal(finalMap.summary.pngExcluded, true);
  assert.equal(finalMap.summary.thumbsExcluded, true);
  assert.equal(finalMap.summary.fullUploadBundleCreated, false);
  assert.equal(finalMap.summary.appRuntimePathsChanged, false);
  assert.equal(finalMap.summary.sourceFilesRenamed, false);
  assert.equal(finalMap.summary.generatedMediaRenamed, false);
  assert.equal(finalMap.summary.totalManualReviewRecords, manualReview.summary.totalManualReviewRecords);
  assert.equal(collisions.summary.finalDuplicateSvgObjectKeys, 0);
  assert.equal(collisions.summary.finalDuplicateWebpObjectKeys, 0);
  assert.equal(collisions.summary.randomSuffixesUsed, false);

  const svgKeys = new Set();
  const webpKeys = new Set();
  for (const record of finalMap.records) {
    assert.ok(record.assetId);
    assert.ok(record.category);
    assert.ok(record.currentLocalSvgPath.endsWith(".svg"));
    assert.ok(record.currentLocalWebpPath.endsWith(".webp"));
    assert.match(record.futureSvgObjectKey, /^coloring-pages\/svg\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}\.svg$/);
    assert.match(record.futureWebpObjectKey, /^coloring-pages\/webp\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}\.webp$/);
    assert.doesNotMatch(record.futureSvgObjectKey, /\/(?:png|thumbs)\//i);
    assert.doesNotMatch(record.futureWebpObjectKey, /\/(?:png|thumbs)\//i);
    assert.ok(record.hashSuffix);
    const subjectStem = record.cleanFilenameStem.replace(new RegExp(`-${record.hashSuffix}$`), "");
    assert.doesNotMatch(subjectStem, BAD_PUBLIC_NAME_PATTERN, record.cleanFilenameStem);
    assert.doesNotMatch(subjectStem, TIMESTAMP_LIKE_PATTERN, record.cleanFilenameStem);
    assert.equal(svgKeys.has(record.futureSvgObjectKey), false, record.futureSvgObjectKey);
    assert.equal(webpKeys.has(record.futureWebpObjectKey), false, record.futureWebpObjectKey);
    svgKeys.add(record.futureSvgObjectKey);
    webpKeys.add(record.futureWebpObjectKey);
  }
});

test("Round 5L app path and upload plans keep runtime paths stable and exclude PNG and thumbs", async () => {
  const appPlan = await readJson("pipeline/manifests/round-5l-app-path-mapping-plan.json");
  const uploadPlan = await readJson("pipeline/manifests/round-5l-future-full-upload-plan.json");
  const generatedItems = await readText("src/generated/coloring/items.json");

  assert.equal(appPlan.summary.appRuntimePathsChanged, false);
  assert.equal(appPlan.summary.cleanUploadBundleExists, false);
  assert.equal(appPlan.summary.safeToSwitchRuntimeNow, false);
  assert.equal(appPlan.summary.imageSitemapDeferred, true);
  assert.equal(appPlan.summary.openGraphImagesDeferred, true);
  assert.equal(uploadPlan.summary.useCleanObjectKeys, true);
  assert.equal(uploadPlan.summary.uploadSvgAndWebpOnly, true);
  assert.equal(uploadPlan.summary.excludePng, true);
  assert.equal(uploadPlan.summary.excludeThumbs, true);
  assert.equal(uploadPlan.summary.sourceFilesRemainUnchanged, true);
  assert.equal(uploadPlan.summary.generatedLocalMediaRemainUnchangedUntilCleanBundleGeneration, true);
  assert.equal(uploadPlan.summary.fullUploadFinalStageOnly, true);
  assert.equal(uploadPlan.summary.explicitApprovalRequired, true);
  assert.equal(uploadPlan.summary.imageSitemapDeferredUntilCleanPublicUrlsVerified, true);
  assert.equal(uploadPlan.summary.openGraphImagesDeferredUntilCleanPublicUrlsVerified, true);
  assert.equal(uploadPlan.summary.liveAdsSeparate, true);
  assert.doesNotMatch(generatedItems, /round-5l-final-svg-webp-object-key-map|futureSvgObjectKey|futureWebpObjectKey/);
});

test("Round 5L preserves SVG internal-only downloads, static export, media boundaries, and deferred launch work", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const projectText = await readProjectText(["app", "src"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
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
  assert.match(adsConfig, /Advertisement/);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /image-sitemap|ImageSitemap|opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
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
