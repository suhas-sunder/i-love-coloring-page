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
  "pipeline/manifests/round-5m-project-context-check.json",
  "pipeline/manifests/round-5m-working-tree-audit.json",
  "pipeline/manifests/round-5m-review-input-audit.json",
  "pipeline/manifests/round-5m-manual-review-groups.json",
  "pipeline/manifests/round-5m-contact-sheet-results.json",
  "pipeline/manifests/round-5m-safe-auto-approval-candidates.json",
  "pipeline/manifests/round-5m-must-review-candidates.json",
  "pipeline/manifests/round-5m-owner-decision-template.json",
  "pipeline/manifests/round-5m-round-5n-readiness-gate.json",
  "pipeline/manifests/round-5m-future-upload-review-dependency.json",
];

test("Round 5M JSON manifests parse and confirm context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5m-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.repoName, "i-love-coloring-page");
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5lCommitExists, true);
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

test("Round 5M review inputs match Round 5L and keep final map unchanged", async () => {
  const input = await readJson("pipeline/manifests/round-5m-review-input-audit.json");
  const final5l = await readJson("pipeline/manifests/round-5l-final-svg-webp-object-key-map.json");
  const final5lRaw = await readText("pipeline/manifests/round-5l-final-svg-webp-object-key-map.json");

  assert.equal(input.summary.manualReviewCount, 205);
  assert.equal(input.summary.finalObjectKeyMapRecords, 6557);
  assert.equal(input.summary.unresolvedCollisions, 0);
  assert.equal(input.summary.pngExcluded, true);
  assert.equal(input.summary.thumbsExcluded, true);
  assert.equal(input.summary.appRuntimePathsUsingFutureCleanKeys, false);
  assert.equal(input.summary.finalObjectKeyMapSha256, await sha256FromText(final5lRaw));
  assert.equal(final5l.summary.totalManualReviewRecords, 205);
  assert.equal(final5l.summary.totalRecords, 6557);
  assert.equal(final5l.summary.appRuntimePathsChanged, false);
});

test("Round 5M owner CSV, owner report, and contact sheet manifests exist", async () => {
  const csv = await readText("pipeline/reports/round-5m-manual-review-items.csv");
  const ownerReport = await readText("pipeline/reports/round-5m-manual-review-owner-report.md");
  const contactSheets = await readJson("pipeline/manifests/round-5m-contact-sheet-results.json");

  assert.match(csv.split(/\r?\n/)[0], /assetId,category,currentFilename,currentSvgPath,currentWebpPath,displayTitle,proposedCleanStem,proposedSvgObjectKey,proposedWebpObjectKey,reasonCodes,confidence,likelyHubPages,ownerDecision,ownerNotes/);
  assert.ok(csv.split(/\r?\n/).length > 200);
  assert.match(ownerReport, /Manual Review Filename Items/);
  assert.match(ownerReport, /No files were renamed/);
  assert.match(ownerReport, /No upload happened/);
  assert.equal(contactSheets.summary.reviewArtifactRootIgnored, true);
  assert.equal(contactSheets.summary.contactSheetGroupsCreated, 7);
  assert.ok(contactSheets.contactSheets.every((sheet) => sheet.path.startsWith("pipeline/review/round-5m/manual-review-contact-sheets/")));
});

test("Round 5M approval manifests separate safe candidates from must-review items", async () => {
  const groups = await readJson("pipeline/manifests/round-5m-manual-review-groups.json");
  const safe = await readJson("pipeline/manifests/round-5m-safe-auto-approval-candidates.json");
  const must = await readJson("pipeline/manifests/round-5m-must-review-candidates.json");
  const gate = await readJson("pipeline/manifests/round-5m-round-5n-readiness-gate.json");
  const template = await readJson("pipeline/manifests/round-5m-owner-decision-template.json");
  const dependency = await readJson("pipeline/manifests/round-5m-future-upload-review-dependency.json");

  assert.equal(groups.summary.totalManualReviewRecords, 205);
  assert.ok(groups.groups.manual_review_required.count >= 205);
  assert.equal(safe.summary.ownerApproved, false);
  assert.equal(safe.summary.finalMapMutated, false);
  assert.equal(must.summary.totalMustReviewCandidates + safe.summary.totalSafeAutoApprovalCandidates <= 205, true);
  assert.equal(gate.ready_to_generate_clean_full_upload_bundle, false);
  assert.equal(gate.ownerDecisionFileRequired, true);
  assert.equal(template.approveAllHighConfidence, false);
  assert.equal(template.approveSafeAutoCandidates, false);
  assert.equal(template.excludeManualReviewFromFirstUpload, false);
  assert.deepEqual(template.itemDecisions, []);
  assert.equal(dependency.summary.finalUploadBundleDependsOnOwnerDecision, true);
  assert.equal(dependency.summary.fullUploadBundleCreated, false);
});

test("Round 5M preserves static export, runtime paths, media boundaries, and deferred launch work", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const uploadPlan = await readJson("pipeline/manifests/round-5l-future-full-upload-plan.json");
  const appPlan = await readJson("pipeline/manifests/round-5l-app-path-mapping-plan.json");
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
  assert.equal(uploadPlan.summary.uploadSvgAndWebpOnly, true);
  assert.equal(uploadPlan.summary.excludePng, true);
  assert.equal(uploadPlan.summary.excludeThumbs, true);
  assert.equal(appPlan.summary.appRuntimePathsChanged, false);
  assert.equal(appPlan.summary.safeToSwitchRuntimeNow, false);
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

async function sha256FromText(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
