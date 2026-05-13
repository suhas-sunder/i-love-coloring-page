#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, link, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const ROUND_5M_COMMIT = "14272be94f80f367504773019ff49913fa0e01fc";
const CLEAN_BASE = "pipeline/r2-upload-clean";
const CLEAN_COLORING_ROOT = "pipeline/r2-upload-clean/coloring-pages";
const PUBLIC_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_READY_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;
const WEBP_QUALITY = 82;
const CACHE_CONTROL_RECOMMENDATION = "public, max-age=31536000, immutable";
const CORS_REQUIREMENT = "Allow GET/HEAD from https://www.ilovecoloringpage.com, http://localhost:3005, http://127.0.0.1:3005, or use an intentional wildcard for public static assets.";
const BAD_PUBLIC_NAME_PATTERN = /\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|failed?|failure|retry|generated|ai-generated|image|export|download|screenshot|untitled|copy|final-final|temp|draft|pipeline|bakeoff|preview|thumb|thumbnail)\b/i;
const TIMESTAMP_LIKE_PATTERN = /\b(?:20\d{2}[-_.]?\d{2}[-_.]?\d{2}|\d{8,}|\d{4}[-_.]?\d{2}[-_.]?\d{2}[-_.]?\d{2,}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_.]?\d{1,2}[-_.]?20\d{2})\b/i;
const HASH_SUFFIX_PATTERN = /-[a-f0-9]{10}$/i;

const INPUTS = {
  finalMap: "pipeline/manifests/round-5l-final-svg-webp-object-key-map.json",
  proposals: "pipeline/manifests/round-5l-clean-object-key-proposals.json",
  manualReview5l: "pipeline/manifests/round-5l-manual-review-filename-items.json",
  mustReview5m: "pipeline/manifests/round-5m-must-review-candidates.json",
  readiness5m: "pipeline/manifests/round-5m-round-5n-readiness-gate.json",
  ownerTemplate5m: "pipeline/manifests/round-5m-owner-decision-template.json",
  ownerReport5m: "pipeline/reports/round-5m-manual-review-owner-report.md",
  ownerCsv5m: "pipeline/reports/round-5m-manual-review-items.csv",
  webpPreviewAssets: "pipeline/manifests/round-5b-webp-preview-assets.json",
  webpGenerationResults: "pipeline/manifests/round-5b-webp-generation-results.json",
  galleryPreviewSourceMap: "pipeline/manifests/round-5b-gallery-preview-source-map.json",
};

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5n-project-context-check.json",
  workingTree: "pipeline/manifests/round-5n-working-tree-audit.json",
  inputAudit: "pipeline/manifests/round-5n-input-audit.json",
  ownerDecision: "pipeline/manifests/round-5n-owner-decision.json",
  inclusion: "pipeline/manifests/round-5n-clean-upload-inclusion-manifest.json",
  deferred: "pipeline/manifests/round-5n-deferred-manual-review-records.json",
  bundlePlan: "pipeline/manifests/round-5n-clean-upload-bundle-plan.json",
  bundleResults: "pipeline/manifests/round-5n-clean-upload-bundle-results.json",
  integrity: "pipeline/manifests/round-5n-clean-bundle-integrity.json",
  objectKeyMap: "pipeline/manifests/round-5n-clean-upload-object-key-map.json",
  uploadChecklist: "pipeline/manifests/round-5n-manual-upload-checklist.json",
  postUploadPlan: "pipeline/manifests/round-5n-post-upload-verification-plan.json",
  runtimeSwitch: "pipeline/manifests/round-5n-runtime-switch-readiness.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5n-project-context-check.md",
  workingTree: "pipeline/reports/round-5n-working-tree-audit.md",
  inputAudit: "pipeline/reports/round-5n-input-audit.md",
  ownerDecision: "pipeline/reports/round-5n-owner-decision.md",
  inclusion: "pipeline/reports/round-5n-clean-upload-inclusion-report.md",
  deferred: "pipeline/reports/round-5n-deferred-manual-review-records.md",
  bundle: "pipeline/reports/round-5n-clean-upload-bundle-report.md",
  integrity: "pipeline/reports/round-5n-clean-bundle-integrity.md",
  objectKeyMap: "pipeline/reports/round-5n-clean-upload-object-key-map.md",
  uploadGuide: "pipeline/reports/round-5n-manual-upload-guide.md",
  postUploadPlan: "pipeline/reports/round-5n-post-upload-verification-plan.md",
  runtimeSwitch: "pipeline/reports/round-5n-runtime-switch-readiness.md",
};

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const data = await loadData();
  const projectContext = await buildProjectContext();
  const workingTree = buildWorkingTreeAudit();
  const ownerDecision = buildOwnerDecision();
  const inputAudit = await buildInputAudit(data, ownerDecision);
  const inclusion = buildInclusionManifest(data, ownerDecision, args.limit);
  const deferred = buildDeferredManifest(data);
  const bundlePlan = buildBundlePlan(inclusion, deferred, data);

  if (args.clean) await cleanBundleRoot();
  const bundleResults = await buildBundle(inclusion.records, args);
  const integrity = await verifyBundle(inclusion.records, deferred.records, bundleResults, data);
  const objectKeyMap = buildObjectKeyMap(inclusion.records);
  const uploadChecklist = buildUploadChecklist(inclusion, deferred, integrity);
  const postUploadPlan = buildPostUploadVerificationPlan(inclusion, deferred);
  const runtimeSwitch = buildRuntimeSwitchReadiness(integrity);

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.workingTree, workingTree);
  await writeText(REPORTS.workingTree, renderWorkingTreeReport(workingTree));
  await writeJson(OUTPUTS.inputAudit, inputAudit);
  await writeText(REPORTS.inputAudit, renderInputAuditReport(inputAudit));
  await writeJson(OUTPUTS.ownerDecision, ownerDecision);
  await writeText(REPORTS.ownerDecision, renderOwnerDecisionReport(ownerDecision));
  await writeJson(OUTPUTS.inclusion, inclusion);
  await writeText(REPORTS.inclusion, renderInclusionReport(inclusion));
  await writeJson(OUTPUTS.deferred, deferred);
  await writeText(REPORTS.deferred, renderDeferredReport(deferred));
  await writeJson(OUTPUTS.bundlePlan, bundlePlan);
  await writeJson(OUTPUTS.bundleResults, bundleResults);
  await writeText(REPORTS.bundle, renderBundleReport(bundlePlan, bundleResults));
  await writeJson(OUTPUTS.integrity, integrity);
  await writeText(REPORTS.integrity, renderIntegrityReport(integrity));
  await writeJson(OUTPUTS.objectKeyMap, objectKeyMap);
  await writeText(REPORTS.objectKeyMap, renderObjectKeyMapReport(objectKeyMap));
  await writeJson(OUTPUTS.uploadChecklist, uploadChecklist);
  await writeText(REPORTS.uploadGuide, renderUploadGuide(uploadChecklist));
  await writeJson(OUTPUTS.postUploadPlan, postUploadPlan);
  await writeText(REPORTS.postUploadPlan, renderPostUploadPlan(postUploadPlan));
  await writeJson(OUTPUTS.runtimeSwitch, runtimeSwitch);
  await writeText(REPORTS.runtimeSwitch, renderRuntimeSwitchReport(runtimeSwitch));

  console.log(JSON.stringify({
    runId: "round-5n-clean-upload-bundle",
    cleanBundlePath: CLEAN_COLORING_ROOT,
    includedRecords: inclusion.summary.includedRecordCount,
    deferredRecords: deferred.summary.deferredRecordCount,
    svgFiles: integrity.summary.svgFileCount,
    webpFiles: integrity.summary.webpFileCount,
    totalFiles: integrity.summary.totalFileCount,
    totalBytes: integrity.summary.totalBytes,
    hardlinkCount: bundleResults.summary.hardlinkCount,
    copyCount: bundleResults.summary.copyCount,
    generatedWebpCount: bundleResults.summary.generatedWebpCount,
    uploaded: false,
    runtimePathsSwitched: false,
  }, null, 2));
}

async function loadData() {
  const finalMapRaw = await readText(INPUTS.finalMap);
  const finalMap = JSON.parse(finalMapRaw);
  const proposals = await readJson(INPUTS.proposals);
  const manualReview5l = await readJson(INPUTS.manualReview5l);
  const mustReview5m = await readJson(INPUTS.mustReview5m);
  const readiness5m = await readJson(INPUTS.readiness5m);
  const ownerTemplate5m = await readJson(INPUTS.ownerTemplate5m);
  const webpPreviewAssets = await readJson(INPUTS.webpPreviewAssets);
  const webpGenerationResults = await readJson(INPUTS.webpGenerationResults);
  const galleryPreviewSourceMap = await readJson(INPUTS.galleryPreviewSourceMap);
  const ownerReport5mPresent = existsSync(path.join(REPO_ROOT, INPUTS.ownerReport5m));
  const ownerCsv5mPresent = existsSync(path.join(REPO_ROOT, INPUTS.ownerCsv5m));
  const webpByAssetId = new Map((webpPreviewAssets.items || []).map((record) => [record.assetId, record]));
  const manualReviewIds = new Set((manualReview5l.records || []).map((record) => record.assetId));
  const included = finalMap.records.filter((record) => record.manualReviewRequired !== true && record.status === "ready_for_clean_bundle_generation");
  const deferred = finalMap.records.filter((record) => manualReviewIds.has(record.assetId));

  return {
    finalMapRaw,
    finalMap,
    proposals,
    manualReview5l,
    mustReview5m,
    readiness5m,
    ownerTemplate5m,
    webpPreviewAssets,
    webpGenerationResults,
    galleryPreviewSourceMap,
    ownerReport5mPresent,
    ownerCsv5mPresent,
    webpByAssetId,
    manualReviewIds,
    included,
    deferred,
  };
}

async function buildProjectContext() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const repoName = path.basename(repoRoot);
  const branch = git(["branch", "--show-current"]).trim();
  const sourceText = await readProjectText(["app", "src", "package.json", "next.config.mjs"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const nextConfig = await readText("next.config.mjs");

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      round5mCommitExists: commandSucceeds("git", ["cat-file", "-e", `${ROUND_5M_COMMIT}^{commit}`]),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      r2UploadSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "svg")),
      r2UploadWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
      webpSourceFallbackUsesRound5bManifest: !existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
      ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}`),
      publicDownloadsPngJpgWebp: /label: "PNG"/.test(downloadMenu) && /label: "JPG"/.test(downloadMenu) && /label: "WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /Advertisement/.test(adsConfig),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      imageSitemapPresent: /image-sitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      wrongContextIndicatorsPresent: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText),
    },
    notes: [
      "Round 5N creates a local clean upload bundle only.",
      "The runtime app remains on existing paths until upload and public verification pass.",
    ],
  };
}

function buildWorkingTreeAudit() {
  const statusShort = git(["status", "--short"]);
  const diffStat = git(["diff", "--stat"]);
  const diffNameOnly = git(["diff", "--name-only"]);
  const entries = statusShort.split(/\r?\n/).filter(Boolean).map((raw) => {
    const pathName = raw.slice(3).trim();
    return { raw, path: pathName, classification: classifyWorkingTreePath(pathName) };
  });
  const riskyUnrelatedDrift = entries.filter((entry) => entry.classification === "risky_unrelated_drift");
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-working-tree-audit",
    commands: {
      statusShort: "git status --short",
      diffStat: "git diff --stat",
      diffNameOnly: "git diff --name-only",
    },
    summary: {
      statusEntryCount: entries.length,
      generatedValidationDriftCount: entries.filter((entry) => entry.classification === "generated_validation_drift").length,
      localArtifactDriftCount: entries.filter((entry) => entry.classification === "local_artifact_drift").length,
      intendedRound5NDriftCount: entries.filter((entry) => entry.classification === "intended_round_5n_artifact").length,
      riskyUnrelatedDriftCount: riskyUnrelatedDrift.length,
      safeToProceed: riskyUnrelatedDrift.length === 0,
    },
    statusShort,
    diffStat,
    diffNameOnly,
    entries,
    riskyUnrelatedDrift,
  };
}

async function buildInputAudit(data, ownerDecision) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-input-audit",
    inputs: {
      ...INPUTS,
      round5mManualReviewFilenameItems: {
        path: "pipeline/manifests/round-5m-manual-review-filename-items.json",
        exists: existsSync(path.join(REPO_ROOT, "pipeline/manifests/round-5m-manual-review-filename-items.json")),
        note: "Round 5M produced must-review and owner-facing artifacts; Round 5N uses the Round 5L manual-review source plus Round 5M must-review/readiness data.",
      },
    },
    summary: {
      finalObjectKeyMapRecords: data.finalMap.records.length,
      manualReviewCount: data.manualReview5l.records.length,
      readyCount: data.included.length,
      ownerDecisionDefersAllManualReviewRecords: ownerDecision.excludeManualReviewFromFirstUpload === true && ownerDecision.includeManualReviewRecords === false,
      unresolvedCollisions: Number(data.finalMap.summary.duplicateSvgObjectKeys || 0) + Number(data.finalMap.summary.duplicateWebpObjectKeys || 0),
      finalUploadModel: "SVG + WebP only",
      pngExcluded: data.finalMap.summary.pngExcluded === true,
      thumbsExcluded: data.finalMap.summary.thumbsExcluded === true,
      round5mReadinessGateWasFalse: data.readiness5m.ready_to_generate_clean_full_upload_bundle === false,
      round5mOwnerTemplatePresent: Boolean(data.ownerTemplate5m),
      round5mOwnerReportPresent: data.ownerReport5mPresent,
      round5mOwnerCsvPresent: data.ownerCsv5mPresent,
      webpManifestRecords: data.webpPreviewAssets.items.length,
      webpGenerationQuality: data.webpGenerationResults.summary.quality,
      webpSourceFolderCurrentlyExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
    },
  };
}

function buildOwnerDecision() {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-owner-decision",
    source: "Owner instruction in Round 5N prompt",
    excludeManualReviewFromFirstUpload: true,
    approveAllReadyRecords: true,
    approveSafeAutoCandidates: false,
    includeManualReviewRecords: false,
    manualReviewDecision: "defer",
    totalReadyRecordsExpected: EXPECTED_READY_RECORDS,
    totalDeferredManualReviewExpected: EXPECTED_DEFERRED_RECORDS,
    effects: {
      deletesDeferredAssets: false,
      preventsFutureUploadOfDeferredAssets: false,
      switchesRuntimePaths: false,
      uploadsAssets: false,
    },
    notes: [
      "Deferred manual-review assets remain in the source manifests and can be handled in a later review/upload round.",
      "The first clean upload bundle is lower-risk because it contains ready records only.",
    ],
  };
}

function buildInclusionManifest(data, ownerDecision, limit) {
  const ready = data.included.filter((record) => record.manualReviewRequired !== true);
  const selected = limit > 0 ? ready.slice(0, limit) : ready;
  const records = selected.map((record) => toIncludedRecord(record, data.webpByAssetId.get(record.assetId)));
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-clean-upload-inclusion-manifest",
    ownerDecision: {
      excludeManualReviewFromFirstUpload: ownerDecision.excludeManualReviewFromFirstUpload,
      approveAllReadyRecords: ownerDecision.approveAllReadyRecords,
      includeManualReviewRecords: ownerDecision.includeManualReviewRecords,
    },
    summary: {
      includedRecordCount: records.length,
      expectedIncludedRecordCount: EXPECTED_READY_RECORDS,
      limitedRun: limit > 0,
      manualReviewRecordsExcluded: true,
      svgFilesExpected: records.length,
      webpFilesExpected: records.length,
      totalFilesExpected: records.length * 2,
      pngExcluded: true,
      thumbsExcluded: true,
    },
    records,
  };
}

function toIncludedRecord(record, webpRecord) {
  return {
    assetId: record.assetId,
    category: record.category,
    currentSvgLocalPath: record.currentLocalSvgPath,
    currentWebpLocalPath: webpRecord?.generatedWebpPath || record.currentLocalWebpPath,
    webpSourcePngPreviewPath: webpRecord?.sourcePngPreviewPath || null,
    futureSvgObjectKey: record.futureSvgObjectKey,
    futureWebpObjectKey: record.futureWebpObjectKey,
    displayTitle: record.displayTitle,
    cleanFilenameStem: record.cleanFilenameStem,
    status: "included_first_upload",
    svgBytes: record.svgBytes,
    webpBytesFromRound5B: webpRecord?.webpBytes || record.webpBytes || 0,
  };
}

function buildDeferredManifest(data) {
  const proposalByAssetId = new Map((data.proposals.records || []).map((record) => [record.assetId, record]));
  const manualByAssetId = new Map((data.manualReview5l.records || []).map((record) => [record.assetId, record]));
  const records = data.deferred.map((record) => {
    const proposal = proposalByAssetId.get(record.assetId) || {};
    const manual = manualByAssetId.get(record.assetId) || {};
    return {
      assetId: record.assetId,
      category: record.category,
      currentSvgLocalPath: record.currentLocalSvgPath,
      currentWebpLocalPath: record.currentLocalWebpPath,
      proposedFutureSvgObjectKey: record.futureSvgObjectKey,
      proposedFutureWebpObjectKey: record.futureWebpObjectKey,
      reasonCodes: (manual.detectedFilenameIssues || proposal.detectedFilenameIssues || []).map((issue) => issue.code),
      confidence: record.confidence,
      status: "deferred_manual_review",
    };
  });
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-deferred-manual-review-records",
    summary: {
      deferredRecordCount: records.length,
      expectedDeferredRecordCount: EXPECTED_DEFERRED_RECORDS,
      deferredNotDeleted: true,
      deferredCanBeUploadedLater: true,
    },
    records,
  };
}

function buildBundlePlan(inclusion, deferred, data) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-clean-upload-bundle-plan",
    bundleRoot: CLEAN_COLORING_ROOT,
    cleanOptionUsed: Boolean(args.clean),
    verifyOptionUsed: Boolean(args.verify),
    limit: args.limit || 0,
    summary: {
      includedRecordCount: inclusion.summary.includedRecordCount,
      deferredRecordCount: deferred.summary.deferredRecordCount,
      expectedSvgFiles: inclusion.summary.svgFilesExpected,
      expectedWebpFiles: inclusion.summary.webpFilesExpected,
      expectedTotalFiles: inclusion.summary.totalFilesExpected,
      svgAndWebpOnly: true,
      noPng: true,
      noThumbs: true,
      noManualReviewRecords: true,
      webpSourceFolderExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
      webpFallbackSource: "Round 5B WebP manifest with PNG preview regeneration when full WebP source files are absent",
      finalObjectKeyMapSha256: sha256(data.finalMapRaw),
    },
  };
}

async function buildBundle(records) {
  const startedAt = Date.now();
  const operations = [];
  let hardlinkCount = 0;
  let copyCount = 0;
  let generatedWebpCount = 0;
  let skippedExistingCount = 0;
  const failures = [];

  for (const record of records) {
    const svgDestination = localPathForObjectKey(record.futureSvgObjectKey);
    const webpDestination = localPathForObjectKey(record.futureWebpObjectKey);
    const svgResult = await linkOrCopyFile(record.currentSvgLocalPath, svgDestination, "svg", record.assetId);
    hardlinkCount += svgResult.method === "hardlink" ? 1 : 0;
    copyCount += svgResult.method === "copy" ? 1 : 0;
    skippedExistingCount += svgResult.method === "existing" ? 1 : 0;
    if (svgResult.status !== "ok") failures.push(svgResult);
    operations.push(svgResult);

    const webpSourceExists = record.currentWebpLocalPath && existsSync(path.join(REPO_ROOT, record.currentWebpLocalPath));
    if (webpSourceExists) {
      const webpResult = await linkOrCopyFile(record.currentWebpLocalPath, webpDestination, "webp", record.assetId);
      hardlinkCount += webpResult.method === "hardlink" ? 1 : 0;
      copyCount += webpResult.method === "copy" ? 1 : 0;
      skippedExistingCount += webpResult.method === "existing" ? 1 : 0;
      if (webpResult.status !== "ok") failures.push(webpResult);
      operations.push(webpResult);
    } else {
      const generated = await generateWebpFromPng(record, webpDestination);
      generatedWebpCount += generated.status === "ok" ? 1 : 0;
      if (generated.status !== "ok") failures.push(generated);
      operations.push(generated);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-clean-upload-bundle-results",
    summary: {
      bundleRoot: CLEAN_COLORING_ROOT,
      processedRecordCount: records.length,
      expectedFileCount: records.length * 2,
      hardlinkCount,
      copyCount,
      generatedWebpCount,
      skippedExistingCount,
      failureCount: failures.length,
      cleanOptionUsed: Boolean(args.clean),
      verifyOptionUsed: Boolean(args.verify),
      elapsedMs,
      uploadPerformed: false,
      runtimePathsChanged: false,
      currentR2UploadModified: false,
      sourceMediaModified: false,
    },
    operations: operations.slice(0, 200),
    failures,
  };
}

async function linkOrCopyFile(sourceRelativePath, destinationRelativePath, type, assetId) {
  const source = path.join(REPO_ROOT, sourceRelativePath || "");
  const destination = path.join(REPO_ROOT, destinationRelativePath);
  if (!sourceRelativePath || !existsSync(source)) {
    return { assetId, type, sourceRelativePath, destinationRelativePath, status: "failed", method: "missing", error: "source_missing" };
  }
  await assertInsideCleanBundle(destination);
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) await unlink(destination);
  try {
    await link(source, destination);
    return { assetId, type, sourceRelativePath, destinationRelativePath, status: "ok", method: "hardlink" };
  } catch (error) {
    try {
      await copyFile(source, destination);
      return { assetId, type, sourceRelativePath, destinationRelativePath, status: "ok", method: "copy", hardlinkError: String(error?.message || error) };
    } catch (copyError) {
      return { assetId, type, sourceRelativePath, destinationRelativePath, status: "failed", method: "copy", error: String(copyError?.message || copyError) };
    }
  }
}

async function generateWebpFromPng(record, destinationRelativePath) {
  const sourceRelativePath = record.webpSourcePngPreviewPath;
  const source = path.join(REPO_ROOT, sourceRelativePath || "");
  const destination = path.join(REPO_ROOT, destinationRelativePath);
  if (!sourceRelativePath || !existsSync(source)) {
    return { assetId: record.assetId, type: "webp", sourceRelativePath, destinationRelativePath, status: "failed", method: "generate", error: "png_source_missing" };
  }
  await assertInsideCleanBundle(destination);
  await mkdir(path.dirname(destination), { recursive: true });
  if (existsSync(destination)) await unlink(destination);
  try {
    await sharp(source).webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(destination);
    return { assetId: record.assetId, type: "webp", sourceRelativePath, destinationRelativePath, status: "ok", method: "generate-from-png" };
  } catch (error) {
    return { assetId: record.assetId, type: "webp", sourceRelativePath, destinationRelativePath, status: "failed", method: "generate-from-png", error: String(error?.message || error) };
  }
}

async function verifyBundle(includedRecords, deferredRecords, bundleResults, data) {
  const files = await listFilesIfExists(path.join(REPO_ROOT, CLEAN_COLORING_ROOT));
  const svgFiles = files.filter((file) => file.endsWith(".svg"));
  const webpFiles = files.filter((file) => file.endsWith(".webp"));
  const pngFiles = files.filter((file) => file.endsWith(".png"));
  const thumbsFiles = files.filter((file) => /(?:^|[\\/])thumbs[\\/]/i.test(file) || /-thumb\./i.test(file));
  const fileStats = await Promise.all(files.map(async (file) => {
    const fileStat = await stat(path.join(REPO_ROOT, file));
    return { file, bytes: fileStat.size };
  }));
  const svgKeys = includedRecords.map((record) => record.futureSvgObjectKey);
  const webpKeys = includedRecords.map((record) => record.futureWebpObjectKey);
  const duplicateKeys = duplicateValues([...svgKeys, ...webpKeys]);
  const deferredIds = new Set(deferredRecords.map((record) => record.assetId));
  const manualReviewAssetIdsIncluded = includedRecords.filter((record) => deferredIds.has(record.assetId)).map((record) => record.assetId);
  const missingSvg = includedRecords.filter((record) => !existsSync(path.join(REPO_ROOT, localPathForObjectKey(record.futureSvgObjectKey)))).map((record) => record.assetId);
  const missingWebp = includedRecords.filter((record) => !existsSync(path.join(REPO_ROOT, localPathForObjectKey(record.futureWebpObjectKey)))).map((record) => record.assetId);
  const badPublicKeys = includedRecords.filter((record) => hasBadCleanKey(record.futureSvgObjectKey) || hasBadCleanKey(record.futureWebpObjectKey)).map((record) => ({
    assetId: record.assetId,
    svg: record.futureSvgObjectKey,
    webp: record.futureWebpObjectKey,
  }));
  const badPathFormat = includedRecords.filter((record) => !/^coloring-pages\/svg\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}\.svg$/.test(record.futureSvgObjectKey)
    || !/^coloring-pages\/webp\/[^/]+\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{10}\.webp$/.test(record.futureWebpObjectKey));
  const totalBytes = fileStats.reduce((sum, item) => sum + item.bytes, 0);
  const blockers = [];
  if (includedRecords.length !== EXPECTED_READY_RECORDS && !args.limit) blockers.push("Included record count does not match 6,352.");
  if (deferredRecords.length !== EXPECTED_DEFERRED_RECORDS) blockers.push("Deferred manual-review count does not match 205.");
  if (svgFiles.length !== includedRecords.length) blockers.push("SVG file count does not match included records.");
  if (webpFiles.length !== includedRecords.length) blockers.push("WebP file count does not match included records.");
  if (pngFiles.length) blockers.push("PNG files are present in clean bundle.");
  if (thumbsFiles.length) blockers.push("Thumb files are present in clean bundle.");
  if (manualReviewAssetIdsIncluded.length) blockers.push("Manual-review asset IDs are included.");
  if (missingSvg.length) blockers.push("Missing SVG files in clean bundle.");
  if (missingWebp.length) blockers.push("Missing WebP files in clean bundle.");
  if (duplicateKeys.length) blockers.push("Duplicate object keys remain.");
  if (badPublicKeys.length) blockers.push("Bad public key terms remain in included records.");
  if (badPathFormat.length) blockers.push("One or more clean object key paths do not match the required format.");
  if (bundleResults.summary.failureCount > 0) blockers.push("Bundle build failures were reported.");

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-clean-bundle-integrity",
    summary: {
      includedRecordCount: includedRecords.length,
      deferredRecordCount: deferredRecords.length,
      svgFileCount: svgFiles.length,
      webpFileCount: webpFiles.length,
      totalFileCount: files.length,
      expectedTotalFileCount: includedRecords.length * 2,
      pngFileCount: pngFiles.length,
      thumbsFileCount: thumbsFiles.length,
      manualReviewAssetIdsIncluded: manualReviewAssetIdsIncluded.length,
      missingSvgFiles: missingSvg.length,
      missingWebpFiles: missingWebp.length,
      duplicateObjectKeys: duplicateKeys.length,
      badPublicKeyCount: badPublicKeys.length,
      badPathFormatCount: badPathFormat.length,
      unresolvedCollisions: Number(data.finalMap.summary.duplicateSvgObjectKeys || 0) + Number(data.finalMap.summary.duplicateWebpObjectKeys || 0),
      totalBytes,
      hardlinkCount: bundleResults.summary.hardlinkCount,
      copyCount: bundleResults.summary.copyCount,
      generatedWebpCount: bundleResults.summary.generatedWebpCount,
      cleanObjectKeyPathFormatValid: badPathFormat.length === 0,
      uploadPerformed: false,
      runtimePathsChanged: false,
      blockers,
    },
    sampleFiles: files.slice(0, 40),
    missingSvg: missingSvg.slice(0, 50),
    missingWebp: missingWebp.slice(0, 50),
    duplicateKeys,
    badPublicKeys: badPublicKeys.slice(0, 50),
  };
}

function buildObjectKeyMap(records) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-clean-upload-object-key-map",
    publicBaseUrl: PUBLIC_ASSET_BASE,
    summary: {
      recordCount: records.length,
      svgObjectCount: records.length,
      webpObjectCount: records.length,
      pngExcluded: true,
      thumbsExcluded: true,
    },
    records: records.map((record) => ({
      assetId: record.assetId,
      category: record.category,
      cleanSvgObjectKey: record.futureSvgObjectKey,
      cleanWebpObjectKey: record.futureWebpObjectKey,
      localCleanBundleSvgPath: localPathForObjectKey(record.futureSvgObjectKey),
      localCleanBundleWebpPath: localPathForObjectKey(record.futureWebpObjectKey),
      expectedPublicSvgUrl: `${PUBLIC_ASSET_BASE}/${record.futureSvgObjectKey.replace(/^coloring-pages\//, "")}`,
      expectedPublicWebpUrl: `${PUBLIC_ASSET_BASE}/${record.futureWebpObjectKey.replace(/^coloring-pages\//, "")}`,
      contentTypes: { svg: "image/svg+xml", webp: "image/webp" },
      cacheRecommendation: CACHE_CONTROL_RECOMMENDATION,
      corsRequirement: CORS_REQUIREMENT,
      status: "ready_for_manual_upload",
    })),
  };
}

function buildUploadChecklist(inclusion, deferred, integrity) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-manual-upload-checklist",
    localFolderToUpload: CLEAN_COLORING_ROOT,
    uploadDestination: "bucket root",
    expectedObjectKeyPrefixes: ["coloring-pages/svg/", "coloring-pages/webp/"],
    warnings: [
      "Do not upload the parent pipeline/r2-upload-clean folder.",
      "Avoid duplicate prefix coloring-pages/coloring-pages.",
      "Do not upload png/.",
      "Do not upload thumbs/.",
      "Do not upload deferred manual-review items.",
      "Do not switch runtime app paths until public verification passes.",
    ],
    expectedCounts: {
      records: inclusion.summary.includedRecordCount,
      deferredRecords: deferred.summary.deferredRecordCount,
      svgFiles: integrity.summary.svgFileCount,
      webpFiles: integrity.summary.webpFileCount,
      totalFiles: integrity.summary.totalFileCount,
      totalBytes: integrity.summary.totalBytes,
    },
    contentTypes: {
      svg: "image/svg+xml",
      webp: "image/webp",
    },
    cacheControl: CACHE_CONTROL_RECOMMENDATION,
    cors: CORS_REQUIREMENT,
    verificationCommandAfterUpload: "node pipeline/scripts/round-5k-verify-custom-domain-assets.mjs --public-base-url https://assets.ilovecoloringpage.com/coloring-pages",
    uploadPerformedByCodex: false,
  };
}

function buildPostUploadVerificationPlan(inclusion, deferred) {
  const categories = [...new Set(inclusion.records.map((record) => record.category))].sort();
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-post-upload-verification-plan",
    summary: {
      includedRecordCount: inclusion.summary.includedRecordCount,
      deferredManualReviewRecords: deferred.summary.deferredRecordCount,
      recommendedUrlVerificationSampleSize: Math.min(300, inclusion.summary.includedRecordCount),
      allIncludedCategoriesRepresented: true,
      appRuntimeSwitchDeferred: true,
    },
    categoriesRepresented: categories,
    checks: [
      "Verify SVG HTTP 200 and image/svg+xml content type.",
      "Verify WebP HTTP 200 and image/webp content type.",
      "Verify CORS with https://www.ilovecoloringpage.com, http://localhost:3005, and http://127.0.0.1:3005.",
      "Verify Cache-Control and ETag or equivalent validation headers.",
      "Verify browser gallery rendering from custom asset domain.",
      "Verify SVG-to-canvas conversion, Print, and PNG/JPG/WebP downloads.",
      "Verify no broken images.",
      "Do not expect deferred manual-review records to resolve yet.",
      "Do not switch app runtime paths until all public checks pass.",
    ],
  };
}

function buildRuntimeSwitchReadiness(integrity) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5n-runtime-switch-readiness",
    clean_bundle_created: integrity.summary.blockers.length === 0,
    clean_bundle_uploaded: false,
    public_urls_verified: false,
    app_runtime_paths_switched: false,
    ready_to_switch_runtime_paths: false,
    blockers: [
      "Clean bundle has not been uploaded.",
      "Public URLs have not been verified.",
      "CORS, content-type, cache, and browser QA have not been rerun against uploaded clean keys.",
    ],
  };
}

async function cleanBundleRoot() {
  const absolute = path.resolve(REPO_ROOT, CLEAN_COLORING_ROOT);
  const allowed = path.resolve(REPO_ROOT, CLEAN_BASE);
  if (!absolute.startsWith(`${allowed}${path.sep}`)) {
    throw new Error(`Refusing to clean outside ${CLEAN_BASE}: ${absolute}`);
  }
  await rm(absolute, { recursive: true, force: true });
}

function localPathForObjectKey(objectKey) {
  if (!objectKey.startsWith("coloring-pages/")) throw new Error(`Invalid object key: ${objectKey}`);
  return slash(path.join(CLEAN_BASE, objectKey));
}

async function assertInsideCleanBundle(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const allowed = path.resolve(REPO_ROOT, CLEAN_BASE);
  if (!resolved.startsWith(`${allowed}${path.sep}`)) throw new Error(`Refusing to write outside ${CLEAN_BASE}: ${resolved}`);
}

function hasBadCleanKey(objectKey) {
  const stem = path.basename(objectKey, path.extname(objectKey)).replace(HASH_SUFFIX_PATTERN, "");
  return BAD_PUBLIC_NAME_PATTERN.test(stem) || TIMESTAMP_LIKE_PATTERN.test(stem);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function renderProjectContextReport(payload) {
  return `# Round 5N Project Context Check

- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- Round 5M commit exists: ${payload.summary.round5mCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- SVG source folder present: ${payload.summary.r2UploadSvgExists}
- Full WebP source folder present: ${payload.summary.r2UploadWebpExists}
- WebP fallback uses Round 5B manifest: ${payload.summary.webpSourceFallbackUsesRound5bManifest}
- Public media copied into public/: ${payload.summary.publicContainsGeneratedProductionMedia}
- Wrong task indicators present: ${payload.summary.wrongContextIndicatorsPresent}
`;
}

function renderWorkingTreeReport(payload) {
  return `# Round 5N Working Tree Audit

- Status entries: ${payload.summary.statusEntryCount}
- Intended Round 5N drift: ${payload.summary.intendedRound5NDriftCount}
- Generated validation drift: ${payload.summary.generatedValidationDriftCount}
- Local artifact drift: ${payload.summary.localArtifactDriftCount}
- Risky unrelated drift: ${payload.summary.riskyUnrelatedDriftCount}
- Safe to proceed: ${payload.summary.safeToProceed}

${payload.entries.map((entry) => `- ${entry.raw}: ${entry.classification}`).join("\n") || "- none"}
`;
}

function renderInputAuditReport(payload) {
  return `# Round 5N Input Audit

- Final object-key map records: ${payload.summary.finalObjectKeyMapRecords}
- Manual-review records: ${payload.summary.manualReviewCount}
- Ready records: ${payload.summary.readyCount}
- Owner decision defers all manual-review records: ${payload.summary.ownerDecisionDefersAllManualReviewRecords}
- Unresolved collisions: ${payload.summary.unresolvedCollisions}
- Upload model: ${payload.summary.finalUploadModel}
- PNG excluded: ${payload.summary.pngExcluded}
- Thumbs excluded: ${payload.summary.thumbsExcluded}
- Full WebP source folder currently exists: ${payload.summary.webpSourceFolderCurrentlyExists}
- WebP manifest records: ${payload.summary.webpManifestRecords}
`;
}

function renderOwnerDecisionReport(payload) {
  return `# Round 5N Owner Decision

- Exclude manual-review records from first upload: ${payload.excludeManualReviewFromFirstUpload}
- Approve all ready records: ${payload.approveAllReadyRecords}
- Include manual-review records: ${payload.includeManualReviewRecords}
- Manual-review decision: ${payload.manualReviewDecision}
- Expected ready records: ${payload.totalReadyRecordsExpected}
- Expected deferred manual-review records: ${payload.totalDeferredManualReviewExpected}

This does not delete deferred assets. It does not prevent uploading them later. It keeps the first upload cleaner and lower-risk. Deferred records can be handled in a later review/upload round.
`;
}

function renderInclusionReport(payload) {
  return `# Round 5N Clean Upload Inclusion Report

- Included records: ${payload.summary.includedRecordCount}
- Expected included records: ${payload.summary.expectedIncludedRecordCount}
- Manual-review records excluded: ${payload.summary.manualReviewRecordsExcluded}
- SVG files expected: ${payload.summary.svgFilesExpected}
- WebP files expected: ${payload.summary.webpFilesExpected}
- Total files expected: ${payload.summary.totalFilesExpected}
- PNG excluded: ${payload.summary.pngExcluded}
- Thumbs excluded: ${payload.summary.thumbsExcluded}

Records are marked \`included_first_upload\` and use the Round 5L clean future object keys.
`;
}

function renderDeferredReport(payload) {
  return `# Round 5N Deferred Manual Review Records

- Deferred records: ${payload.summary.deferredRecordCount}
- Expected deferred records: ${payload.summary.expectedDeferredRecordCount}
- Deferred assets deleted: false
- Deferred assets can be uploaded later: ${payload.summary.deferredCanBeUploadedLater}

${payload.records.slice(0, 100).map((record) => `- ${record.assetId}: ${record.reasonCodes.join(", ")} (${record.status})`).join("\n")}
`;
}

function renderBundleReport(plan, results) {
  return `# Round 5N Clean Upload Bundle Report

- Bundle path: ${plan.bundleRoot}
- Included records: ${plan.summary.includedRecordCount}
- Deferred records: ${plan.summary.deferredRecordCount}
- Expected files: ${plan.summary.expectedTotalFiles}
- Hardlinks: ${results.summary.hardlinkCount}
- Copies: ${results.summary.copyCount}
- Generated WebP files: ${results.summary.generatedWebpCount}
- Failures: ${results.summary.failureCount}
- Upload performed: ${results.summary.uploadPerformed}
- Runtime paths changed: ${results.summary.runtimePathsChanged}

The bundle contains SVG plus WebP only. PNG and thumbs are not part of the clean upload bundle.
`;
}

function renderIntegrityReport(payload) {
  return `# Round 5N Clean Bundle Integrity

- Included records: ${payload.summary.includedRecordCount}
- Deferred records: ${payload.summary.deferredRecordCount}
- SVG files: ${payload.summary.svgFileCount}
- WebP files: ${payload.summary.webpFileCount}
- Total files: ${payload.summary.totalFileCount}
- Total bytes: ${payload.summary.totalBytes}
- PNG files: ${payload.summary.pngFileCount}
- Thumb files: ${payload.summary.thumbsFileCount}
- Manual-review asset IDs included: ${payload.summary.manualReviewAssetIdsIncluded}
- Missing SVG files: ${payload.summary.missingSvgFiles}
- Missing WebP files: ${payload.summary.missingWebpFiles}
- Duplicate object keys: ${payload.summary.duplicateObjectKeys}
- Bad public keys: ${payload.summary.badPublicKeyCount}
- Hardlinks: ${payload.summary.hardlinkCount}
- Copies: ${payload.summary.copyCount}
- Generated WebP files: ${payload.summary.generatedWebpCount}
- Blockers: ${payload.summary.blockers.length ? payload.summary.blockers.join("; ") : "none"}
`;
}

function renderObjectKeyMapReport(payload) {
  return `# Round 5N Clean Upload Object-Key Map

- Records: ${payload.summary.recordCount}
- SVG objects: ${payload.summary.svgObjectCount}
- WebP objects: ${payload.summary.webpObjectCount}
- Public base: ${payload.publicBaseUrl}
- PNG excluded: ${payload.summary.pngExcluded}
- Thumbs excluded: ${payload.summary.thumbsExcluded}

Content types: SVG \`image/svg+xml\`, WebP \`image/webp\`.
Cache recommendation: \`${CACHE_CONTROL_RECOMMENDATION}\`.
`;
}

function renderUploadGuide(payload) {
  return `# Round 5N Manual Upload Guide

Upload this local folder:

\`${payload.localFolderToUpload}\`

Upload it to the bucket root so final object keys start with:

- \`coloring-pages/svg/\`
- \`coloring-pages/webp/\`

Do not upload the parent \`pipeline/r2-upload-clean\` folder. Avoid \`coloring-pages/coloring-pages\`. Do not upload \`png/\`, \`thumbs/\`, or deferred manual-review items.

Expected counts:

- Records: ${payload.expectedCounts.records}
- Deferred records: ${payload.expectedCounts.deferredRecords}
- SVG files: ${payload.expectedCounts.svgFiles}
- WebP files: ${payload.expectedCounts.webpFiles}
- Total files: ${payload.expectedCounts.totalFiles}
- Total bytes: ${payload.expectedCounts.totalBytes}

Content types:

- SVG: \`${payload.contentTypes.svg}\`
- WebP: \`${payload.contentTypes.webp}\`

Cache-Control: \`${payload.cacheControl}\`

CORS: ${payload.cors}

After upload, run:

\`${payload.verificationCommandAfterUpload}\`

Do not switch runtime app paths until verification passes.
`;
}

function renderPostUploadPlan(payload) {
  return `# Round 5N Post-Upload Verification Plan

- Included records: ${payload.summary.includedRecordCount}
- Deferred manual-review records: ${payload.summary.deferredManualReviewRecords}
- Recommended URL verification sample size: ${payload.summary.recommendedUrlVerificationSampleSize}
- App runtime switch deferred: ${payload.summary.appRuntimeSwitchDeferred}

Checks:

${payload.checks.map((check) => `- ${check}`).join("\n")}
`;
}

function renderRuntimeSwitchReport(payload) {
  return `# Round 5N Runtime Switch Readiness

- Clean bundle created: ${payload.clean_bundle_created}
- Clean bundle uploaded: ${payload.clean_bundle_uploaded}
- Public URLs verified: ${payload.public_urls_verified}
- App runtime paths switched: ${payload.app_runtime_paths_switched}
- Ready to switch runtime paths: ${payload.ready_to_switch_runtime_paths}

Blockers:

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}
`;
}

function classifyWorkingTreePath(pathName) {
  if (!pathName) return "unknown";
  if (pathName === ".gitignore" || pathName === "AGENTS.md" || pathName === "package.json") return "intended_round_5n_artifact";
  if (/^pipeline\/(?:scripts|tests|manifests|reports)\/round-5n/.test(pathName)) return "intended_round_5n_artifact";
  if (/^pipeline\/r2-upload-clean\//.test(pathName)) return "local_artifact_drift";
  if (/^pipeline\/review\//.test(pathName)) return "local_artifact_drift";
  if (/^pipeline\/manifests\/round-4|^pipeline\/reports\/round-4|^src\/generated\/coloring\//.test(pathName)) return "generated_validation_drift";
  return "risky_unrelated_drift";
}

function parseArgs(rawArgs) {
  const parsed = { clean: false, verify: false, limit: 0 };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--clean") parsed.clean = true;
    else if (arg === "--verify") parsed.verify = true;
    else if (arg === "--limit") parsed.limit = Number(rawArgs[++index] || 0);
    else if (arg.startsWith("--limit=")) parsed.limit = Number(arg.split("=")[1] || 0);
  }
  parsed.limit = Number.isFinite(parsed.limit) && parsed.limit > 0 ? Math.floor(parsed.limit) : 0;
  return parsed;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const normalizedValue = String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{2,}$/g, "\n");
  await writeFile(absolutePath, normalizedValue, "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = statSync(root);
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
  return results.map(slash);
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFilesIfExists(root)) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (slash(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

function commandSucceeds(command, commandArgs) {
  try {
    execFileSync(command, commandArgs, { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}
