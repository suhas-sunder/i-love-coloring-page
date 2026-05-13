#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  EXPECTED_R2_BUCKET,
  EXPECTED_R2_FILE_COUNT,
  EXPECTED_R2_PREFIX,
  MAX_SAFE_R2_CONCURRENCY,
  buildR2UploadConfig,
  normalizeR2Prefix,
  parsePositiveInteger,
  redactSecrets,
} from "../lib/r2-upload-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const ROUND_5N_COMMIT = "13e04ed";
const CLEAN_BUNDLE_ROOT = "pipeline/r2-upload-clean/coloring-pages";
const CLEAN_BUNDLE_ABSOLUTE = path.resolve(REPO_ROOT, CLEAN_BUNDLE_ROOT);
const PUBLIC_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const EXPECTED_INCLUDED_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;
const EXPECTED_SVG_FILES = 6352;
const EXPECTED_WEBP_FILES = 6352;
const EXPECTED_TOTAL_BYTES = 2089425709;
const BYTE_TOLERANCE = 1024 * 1024 * 20;
const DRY_RUN_SAMPLE_LIMIT = 200;

const INPUTS = {
  objectKeyMap: "pipeline/manifests/round-5n-clean-upload-object-key-map.json",
  bundleResults: "pipeline/manifests/round-5n-clean-upload-bundle-results.json",
  bundleIntegrity: "pipeline/manifests/round-5n-clean-bundle-integrity.json",
  deferredManualReview: "pipeline/manifests/round-5n-deferred-manual-review-records.json",
};

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5o-project-context-check.json",
  workingTree: "pipeline/manifests/round-5o-working-tree-audit.json",
  bundleAudit: "pipeline/manifests/round-5o-clean-bundle-upload-audit.json",
  dryRun: "pipeline/manifests/round-5o-upload-dry-run-results.json",
  failures: "pipeline/manifests/round-5o-upload-failures.json",
  estimate: "pipeline/manifests/round-5o-upload-operation-estimate.json",
  verifierPlan: "pipeline/manifests/round-5o-post-upload-verifier-plan.json",
  lifecycle: "pipeline/manifests/round-5o-local-uploader-lifecycle.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5o-project-context-check.md",
  workingTree: "pipeline/reports/round-5o-working-tree-audit.md",
  bundleAudit: "pipeline/reports/round-5o-clean-bundle-upload-audit.md",
  dryRun: "pipeline/reports/round-5o-upload-dry-run-report.md",
  estimate: "pipeline/reports/round-5o-upload-operation-estimate.md",
  verifierPlan: "pipeline/reports/round-5o-post-upload-verifier-plan.md",
  ownerRunbook: "pipeline/reports/round-5o-owner-upload-runbook.md",
  lifecycle: "pipeline/reports/round-5o-local-uploader-lifecycle.md",
};

const args = parseArgs(process.argv.slice(2));
const executeRequested = args.execute === true;
const mode = executeRequested ? "execute" : "dry-run";

main().catch((error) => {
  console.error(redactSecrets(error?.stack || error?.message || String(error)));
  process.exitCode = 1;
});

async function main() {
  const config = await buildR2UploadConfig({
    repoRoot: REPO_ROOT,
    execute: executeRequested,
    confirmBucket: args.confirmBucket,
    confirmPrefix: args.confirmPrefix,
    confirmFileCount: args.confirmFileCount,
    concurrency: args.concurrency,
    allowDangerousBucketOverride: args.allowDangerousBucketOverride,
    allowHighConcurrency: args.allowHighConcurrency,
  });

  const data = await loadInputs();
  const projectContext = await buildProjectContext();
  const workingTree = buildWorkingTreeAudit();
  const allUploads = await buildUploadPlan(data.objectKeyMap.records, data.deferredManualReview.records);
  const resumeUploads = args.resumeFromManifest ? await applyResumeManifest(allUploads, args.resumeFromManifest) : allUploads;
  const plannedUploads = applyUploadFilters(resumeUploads, config, args);
  validateUploadPlan(plannedUploads, allUploads, data, args);
  const bundleAudit = await buildBundleAudit(data, allUploads);
  const estimate = buildOperationEstimate(allUploads);
  const verifierPlan = buildVerifierPlan(allUploads);
  const lifecycle = buildLifecycle();

  const failures = [];
  let executionSummary = null;
  if (executeRequested) {
    executionSummary = await executeUploads(plannedUploads, config, failures);
  }

  const dryRunManifest = buildDryRunManifest({ plannedUploads, allUploads, config, executionSummary, failures });
  const failuresManifest = {
    generatedAt: GENERATED_AT,
    runId: "round-5o-upload-failures",
    uploadExecuted: executeRequested,
    failureCount: failures.length,
    failures,
  };

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.workingTree, workingTree);
  await writeText(REPORTS.workingTree, renderWorkingTreeReport(workingTree));
  await writeJson(OUTPUTS.bundleAudit, bundleAudit);
  await writeText(REPORTS.bundleAudit, renderBundleAuditReport(bundleAudit));
  await writeJson(OUTPUTS.dryRun, dryRunManifest);
  await writeJson(OUTPUTS.failures, failuresManifest);
  await writeText(REPORTS.dryRun, renderDryRunReport(dryRunManifest));
  await writeJson(OUTPUTS.estimate, estimate);
  await writeText(REPORTS.estimate, renderOperationEstimateReport(estimate));
  await writeJson(OUTPUTS.verifierPlan, verifierPlan);
  await writeText(REPORTS.verifierPlan, renderVerifierPlanReport(verifierPlan));
  await writeText(REPORTS.ownerRunbook, renderOwnerRunbook());
  await writeJson(OUTPUTS.lifecycle, lifecycle);
  await writeText(REPORTS.lifecycle, renderLifecycleReport(lifecycle));

  console.log(JSON.stringify({
    runId: "round-5o-upload-clean-bundle-to-r2",
    mode,
    uploadPerformed: Boolean(executionSummary),
    bucket: config.bucket,
    prefix: config.prefix,
    plannedFiles: plannedUploads.length,
    svgFiles: plannedUploads.filter((entry) => entry.kind === "svg").length,
    webpFiles: plannedUploads.filter((entry) => entry.kind === "webp").length,
    totalBytes: sumBytes(plannedUploads),
    failures: failures.length,
  }, null, 2));

  if (failures.length > 0) process.exitCode = 1;
}

async function loadInputs() {
  return {
    objectKeyMap: await readJson(INPUTS.objectKeyMap),
    bundleResults: await readJson(INPUTS.bundleResults),
    bundleIntegrity: await readJson(INPUTS.bundleIntegrity),
    deferredManualReview: await readJson(INPUTS.deferredManualReview),
  };
}

async function buildUploadPlan(records, deferredRecords) {
  const deferredIds = new Set(deferredRecords.map((record) => record.assetId));
  const uploads = [];
  for (const record of records) {
    if (deferredIds.has(record.assetId)) {
      throw new Error(`Refusing deferred manual-review asset in upload map: ${record.assetId}`);
    }
    uploads.push(await buildUploadEntry(record, "svg", record.cleanSvgObjectKey, record.localCleanBundleSvgPath));
    uploads.push(await buildUploadEntry(record, "webp", record.cleanWebpObjectKey, record.localCleanBundleWebpPath));
  }
  uploads.sort((left, right) => left.objectKey.localeCompare(right.objectKey) || left.assetId.localeCompare(right.assetId));
  return uploads;
}

async function buildUploadEntry(record, kind, objectKey, localPath) {
  const absolutePath = path.resolve(REPO_ROOT, localPath);
  assertLocalBundlePath(absolutePath);
  assertSafeObjectKey(objectKey, kind);
  if (!existsSync(absolutePath)) throw new Error(`Missing local upload file: ${localPath}`);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new Error(`Upload path is not a file: ${localPath}`);
  return {
    assetId: record.assetId,
    category: record.category,
    kind,
    objectKey,
    localPath,
    bytes: fileStat.size,
    contentType: kind === "svg" ? "image/svg+xml" : "image/webp",
    cacheControl: CACHE_CONTROL,
  };
}

function applyUploadFilters(allUploads, config, parsedArgs) {
  let planned = allUploads;
  if (parsedArgs.only !== "all") {
    planned = planned.filter((entry) => entry.kind === parsedArgs.only);
  }
  const maxFiles = parsedArgs.limit || parsedArgs.maxFiles || config.maxFiles || 0;
  if (maxFiles > 0) planned = planned.slice(0, maxFiles);
  const maxBytes = parsedArgs.maxBytes || config.maxBytes || 0;
  if (maxBytes > 0) {
    const filtered = [];
    let bytes = 0;
    for (const entry of planned) {
      if (bytes + entry.bytes > maxBytes) break;
      filtered.push(entry);
      bytes += entry.bytes;
    }
    planned = filtered;
  }
  return planned;
}

async function applyResumeManifest(allUploads, manifestPath) {
  const absolutePath = path.resolve(REPO_ROOT, manifestPath);
  const manifest = JSON.parse(await readFile(absolutePath, "utf8"));
  const retryKeys = new Set((manifest.failures || manifest.records || manifest.plannedUploads || [])
    .map((entry) => entry.objectKey)
    .filter(Boolean));
  if (!retryKeys.size) throw new Error(`Resume manifest has no object keys: ${manifestPath}`);
  const filtered = allUploads.filter((entry) => retryKeys.has(entry.objectKey));
  if (!filtered.length) throw new Error(`Resume manifest did not match upload plan: ${manifestPath}`);
  return filtered;
}

function validateUploadPlan(plannedUploads, allUploads, data, parsedArgs) {
  if (allUploads.length !== EXPECTED_R2_FILE_COUNT) {
    throw new Error(`Refusing upload map with ${allUploads.length} files. Expected ${EXPECTED_R2_FILE_COUNT}.`);
  }
  if (allUploads.length > EXPECTED_R2_FILE_COUNT) throw new Error("Refusing upload map with more files than expected.");
  if (sumBytes(allUploads) > EXPECTED_TOTAL_BYTES + BYTE_TOLERANCE) {
    throw new Error("Refusing upload map because bytes exceed expected total plus tolerance.");
  }
  if (plannedUploads.length === 0) throw new Error("Refusing empty upload list.");
  if (data.bundleIntegrity.summary.pngFileCount !== 0 || data.bundleIntegrity.summary.thumbsFileCount !== 0) {
    throw new Error("Refusing bundle integrity with PNG or thumb files.");
  }
  if (data.bundleIntegrity.summary.manualReviewAssetIdsIncluded !== 0) {
    throw new Error("Refusing bundle integrity with manual-review assets.");
  }
  if (data.bundleIntegrity.summary.missingSvgFiles !== 0 || data.bundleIntegrity.summary.missingWebpFiles !== 0) {
    throw new Error("Refusing bundle integrity with missing files.");
  }
  if (data.deferredManualReview.summary.deferredRecordCount !== EXPECTED_DEFERRED_RECORDS) {
    throw new Error("Refusing upload because deferred manual-review count changed.");
  }
  if (parsedArgs.execute && parsedArgs.confirmFileCount !== EXPECTED_R2_FILE_COUNT) {
    throw new Error(`Execute requires --confirm-file-count ${EXPECTED_R2_FILE_COUNT}.`);
  }
}

async function executeUploads(plannedUploads, config, failures) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: config.credentials,
    forcePathStyle: true,
    maxAttempts: 3,
  });
  const startedAt = Date.now();
  let uploadedCount = 0;
  let skippedExistingCount = 0;
  let uploadedBytes = 0;

  await runPool(plannedUploads, config.concurrency, async (entry, index) => {
    try {
      if (args.skipExisting || config.skipExisting) {
        const existing = await headObject(client, config.bucket, entry);
        if (existing && Number(existing.ContentLength || 0) === entry.bytes) {
          skippedExistingCount += 1;
          return;
        }
      }
      await putObjectWithRetry(client, config.bucket, entry);
      uploadedCount += 1;
      uploadedBytes += entry.bytes;
      if (uploadedCount % 100 === 0) {
        console.log(`Uploaded ${uploadedCount}/${plannedUploads.length} files`);
      }
    } catch (error) {
      failures.push({
        assetId: entry.assetId,
        kind: entry.kind,
        objectKey: entry.objectKey,
        localPath: entry.localPath,
        error: redactSecrets(error?.message || String(error)),
      });
    }
    if (index % 500 === 0 && index > 0) {
      console.log(`Processed ${index}/${plannedUploads.length} files`);
    }
  });

  return {
    uploadedCount,
    skippedExistingCount,
    uploadedBytes,
    elapsedMs: Date.now() - startedAt,
  };
}

async function headObject(client, bucket, entry) {
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket, Key: entry.objectKey }));
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return null;
    throw error;
  }
}

async function putObjectWithRetry(client, bucket, entry) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: entry.objectKey,
        Body: createReadStream(path.join(REPO_ROOT, entry.localPath)),
        ContentType: entry.contentType,
        CacheControl: entry.cacheControl,
      }));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(Math.min(8000, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function buildProjectContext() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const repoName = path.basename(repoRoot);
  const branch = git(["branch", "--show-current"]).trim();
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const projectText = await readProjectText(["app", "src", "package.json", "next.config.mjs"]);
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5o-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      round5nCommitExists: commandSucceeds("git", ["cat-file", "-e", `${ROUND_5N_COMMIT}^{commit}`]),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      cleanBundleExists: existsSync(CLEAN_BUNDLE_ABSOLUTE),
      cleanBundleSvgExists: existsSync(path.join(CLEAN_BUNDLE_ABSOLUTE, "svg")),
      cleanBundleWebpExists: existsSync(path.join(CLEAN_BUNDLE_ABSOLUTE, "webp")),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
      ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}`),
      publicDownloadsPngJpgWebp: /label: "PNG"/.test(downloadMenu) && /label: "JPG"/.test(downloadMenu) && /label: "WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /Advertisement/.test(adsConfig),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
      imageSitemapPresent: /image-sitemap|ImageSitemap/i.test(projectText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(projectText),
      wrongContextIndicatorsPresent: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(projectText),
    },
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
    runId: "round-5o-working-tree-audit",
    summary: {
      statusEntryCount: entries.length,
      intendedRound5OCount: entries.filter((entry) => entry.classification === "intended_round_5o_artifact").length,
      generatedValidationDriftCount: entries.filter((entry) => entry.classification === "generated_validation_drift").length,
      localArtifactDriftCount: entries.filter((entry) => entry.classification === "local_artifact_drift").length,
      riskyUnrelatedDriftCount: riskyUnrelatedDrift.length,
      safeToProceed: riskyUnrelatedDrift.length === 0,
    },
    commands: {
      statusShort: "git status --short",
      diffStat: "git diff --stat",
      diffNameOnly: "git diff --name-only",
    },
    statusShort,
    diffStat,
    diffNameOnly,
    entries,
    riskyUnrelatedDrift,
  };
}

async function buildBundleAudit(data, allUploads) {
  const files = await listFilesIfExists(CLEAN_BUNDLE_ABSOLUTE);
  const svgFiles = files.filter((file) => file.endsWith(".svg"));
  const webpFiles = files.filter((file) => file.endsWith(".webp"));
  const pngFiles = files.filter((file) => file.endsWith(".png"));
  const thumbFiles = files.filter((file) => /(?:^|[\\/])thumbs[\\/]|-thumb\./i.test(file));
  const duplicateObjectKeys = duplicateValues(allUploads.map((entry) => entry.objectKey));
  const missingLocalFiles = allUploads.filter((entry) => !existsSync(path.join(REPO_ROOT, entry.localPath)));
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5o-clean-bundle-upload-audit",
    inputs: INPUTS,
    summary: {
      includedRecords: data.objectKeyMap.summary.recordCount,
      deferredRecords: data.deferredManualReview.summary.deferredRecordCount,
      svgFiles: svgFiles.length,
      webpFiles: webpFiles.length,
      totalFiles: files.length,
      pngFiles: pngFiles.length,
      thumbFiles: thumbFiles.length,
      manualReviewAssetIdsIncluded: data.bundleIntegrity.summary.manualReviewAssetIdsIncluded,
      missingLocalFiles: missingLocalFiles.length,
      objectKeysStartWithExpectedPrefixes: allUploads.every((entry) => /^coloring-pages\/(?:svg|webp)\//.test(entry.objectKey)),
      duplicateObjectKeys: duplicateObjectKeys.length,
      expectedTotalBytes: EXPECTED_TOTAL_BYTES,
      actualTotalBytes: sumBytes(allUploads),
      mediaFilesStagedInGit: git(["status", "--short", "--", "pipeline/r2-upload-clean"]).trim() !== "",
      noPngOrThumbs: pngFiles.length === 0 && thumbFiles.length === 0,
    },
    duplicateObjectKeys,
    missingLocalFiles: missingLocalFiles.slice(0, 50),
  };
}

function buildDryRunManifest({ plannedUploads, allUploads, config, executionSummary, failures }) {
  const svgFileCount = plannedUploads.filter((entry) => entry.kind === "svg").length;
  const webpFileCount = plannedUploads.filter((entry) => entry.kind === "webp").length;
  const pngFileCount = plannedUploads.filter((entry) => entry.objectKey.includes("/png/") || entry.localPath.endsWith(".png")).length;
  const thumbFileCount = plannedUploads.filter((entry) => /(?:^|\/)thumbs\/|-thumb\./i.test(entry.objectKey)).length;
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5o-upload-dry-run-results",
    mode,
    executeRequested,
    uploadPerformed: Boolean(executionSummary),
    deletePerformed: false,
    summary: {
      bucket: config.bucket,
      prefix: config.prefix,
      endpointConfigured: Boolean(config.endpoint),
      credentialsRequiredForExecuteOnly: true,
      plannedFileCount: plannedUploads.length,
      fullBundleFileCount: allUploads.length,
      svgFileCount,
      webpFileCount,
      pngFileCount,
      thumbFileCount,
      manualReviewAssetIdsIncluded: 0,
      duplicateObjectKeys: duplicateValues(plannedUploads.map((entry) => entry.objectKey)).length,
      duplicatePrefixCount: plannedUploads.filter((entry) => entry.objectKey.includes("coloring-pages/coloring-pages")).length,
      oldTestPrefixCount: plannedUploads.filter((entry) => entry.objectKey.includes("coloring/test-v1")).length,
      totalBytes: sumBytes(plannedUploads),
      contentTypes: {
        svg: "image/svg+xml",
        webp: "image/webp",
      },
      cacheControl: CACHE_CONTROL,
      concurrency: config.concurrency,
      skipExisting: Boolean(args.skipExisting || config.skipExisting),
      classAOperationsEstimate: plannedUploads.length,
      classBOperationsEstimate: args.skipExisting || config.skipExisting ? plannedUploads.length : 0,
      readyForOwnerExecuteReview: !executeRequested && plannedUploads.length === EXPECTED_R2_FILE_COUNT && failures.length === 0,
    },
    executionSummary,
    plannedUploads,
    samplePlannedUploads: plannedUploads.slice(0, DRY_RUN_SAMPLE_LIMIT),
  };
}

function buildOperationEstimate(allUploads) {
  const totalUploadBytes = sumBytes(allUploads);
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5o-upload-operation-estimate",
    summary: {
      putObjectOperations: allUploads.length,
      headObjectOperationsWithSkipExisting: allUploads.length,
      totalUploadBytes,
      expectedTotalStorageGB: Number((totalUploadBytes / 1_000_000_000).toFixed(3)),
      classAOperationCountEstimate: allUploads.length,
      classBOperationCountEstimate: allUploads.length,
      deleteOperations: 0,
      repeatedRerunRisk: "Repeated full uploads without --skip-existing can repeat all PutObject operations and transfer the full bundle again.",
      dryRunShouldBeReviewedFirst: true,
      limit10SmokeUploadUsefulOnlyIfOwnerChooses: true,
      noDeleteOperationIncluded: true,
    },
  };
}

function buildVerifierPlan(allUploads) {
  const categories = [...new Set(allUploads.map((entry) => entry.category))].sort();
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5o-post-upload-verifier-plan",
    summary: {
      publicBaseUrl: PUBLIC_ASSET_BASE,
      fullVerificationCount: allUploads.length,
      recommendedSampleSize: Math.min(300, allUploads.length),
      categoriesRepresented: categories.length,
      svgContentType: "image/svg+xml",
      webpContentType: "image/webp",
      cacheControlExpected: CACHE_CONTROL,
      corsOrigins: ["https://www.ilovecoloringpage.com", "http://localhost:3005", "http://127.0.0.1:3005"],
      noPngOrThumbKeys: true,
      noDuplicatePrefix: true,
    },
    commands: {
      full: "node pipeline/scripts/round-5o-verify-clean-upload-r2.mjs --full --public-base-url https://assets.ilovecoloringpage.com/coloring-pages",
      sample: "node pipeline/scripts/round-5o-verify-clean-upload-r2.mjs --sample --public-base-url https://assets.ilovecoloringpage.com/coloring-pages",
    },
  };
}

function buildLifecycle() {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5o-local-uploader-lifecycle",
    summary: {
      localOnlyUtility: true,
      temporaryOneTimeHelper: true,
      usedByAppRuntime: false,
      usedByBuild: false,
      neededForInitialCleanUploadOnly: true,
      safeToRemoveAfterSuccessfulUploadIfOwnerChooses: true,
      invokedAutomatically: false,
      recurringTask: false,
      backgroundWatcher: false,
      deletesRemoteObjects: false,
    },
  };
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex], currentIndex + 1);
    }
  });
  await Promise.all(workers);
}

function assertSafeObjectKey(objectKey, kind) {
  if (!objectKey.startsWith(`coloring-pages/${kind}/`)) throw new Error(`Invalid ${kind} object key: ${objectKey}`);
  if (objectKey.includes("coloring-pages/coloring-pages")) throw new Error(`Duplicate prefix in object key: ${objectKey}`);
  if (objectKey.includes("coloring/test-v1")) throw new Error(`Old test prefix in object key: ${objectKey}`);
  if (/\/(?:png|thumbs)\//i.test(objectKey)) throw new Error(`Forbidden PNG/thumb key: ${objectKey}`);
  if (!objectKey.endsWith(kind === "svg" ? ".svg" : ".webp")) throw new Error(`Unexpected extension in object key: ${objectKey}`);
}

function assertLocalBundlePath(absolutePath) {
  if (!absolutePath.startsWith(`${CLEAN_BUNDLE_ABSOLUTE}${path.sep}`)) {
    throw new Error(`Refusing local path outside ${CLEAN_BUNDLE_ROOT}: ${absolutePath}`);
  }
}

function renderProjectContextReport(payload) {
  return `# Round 5O Project Context Check

- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- Round 5N commit exists: ${payload.summary.round5nCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- Clean bundle present: ${payload.summary.cleanBundleExists}
- Clean SVG folder present: ${payload.summary.cleanBundleSvgExists}
- Clean WebP folder present: ${payload.summary.cleanBundleWebpExists}
- Wrong task indicators present: ${payload.summary.wrongContextIndicatorsPresent}
`;
}

function renderWorkingTreeReport(payload) {
  return `# Round 5O Working Tree Audit

- Status entries: ${payload.summary.statusEntryCount}
- Intended Round 5O entries: ${payload.summary.intendedRound5OCount}
- Generated validation drift: ${payload.summary.generatedValidationDriftCount}
- Local artifact drift: ${payload.summary.localArtifactDriftCount}
- Risky unrelated drift: ${payload.summary.riskyUnrelatedDriftCount}
- Safe to proceed: ${payload.summary.safeToProceed}

${payload.entries.map((entry) => `- ${entry.raw}: ${entry.classification}`).join("\n") || "- none"}
`;
}

function renderBundleAuditReport(payload) {
  return `# Round 5O Clean Bundle Upload Audit

- Included records: ${payload.summary.includedRecords}
- Deferred records: ${payload.summary.deferredRecords}
- SVG files: ${payload.summary.svgFiles}
- WebP files: ${payload.summary.webpFiles}
- Total files: ${payload.summary.totalFiles}
- PNG files: ${payload.summary.pngFiles}
- Thumb files: ${payload.summary.thumbFiles}
- Manual-review asset IDs included: ${payload.summary.manualReviewAssetIdsIncluded}
- Missing local files: ${payload.summary.missingLocalFiles}
- Duplicate object keys: ${payload.summary.duplicateObjectKeys}
- Actual total bytes: ${payload.summary.actualTotalBytes}
- Media files staged in Git: ${payload.summary.mediaFilesStagedInGit}
`;
}

function renderDryRunReport(payload) {
  return `# Round 5O Upload Dry-Run Report

- Mode: ${payload.mode}
- Upload performed: ${payload.uploadPerformed}
- Delete performed: ${payload.deletePerformed}
- Bucket: ${payload.summary.bucket}
- Prefix: ${payload.summary.prefix}
- Planned files: ${payload.summary.plannedFileCount}
- SVG files: ${payload.summary.svgFileCount}
- WebP files: ${payload.summary.webpFileCount}
- Total bytes: ${payload.summary.totalBytes}
- PutObject estimate: ${payload.summary.classAOperationsEstimate}
- HeadObject estimate with skip-existing: ${payload.summary.classBOperationsEstimate}
- Ready for owner execute review: ${payload.summary.readyForOwnerExecuteReview}

No real upload ran in this dry-run.
`;
}

function renderOperationEstimateReport(payload) {
  return `# Round 5O Upload Operation Estimate

- PutObject operations for full execute: ${payload.summary.putObjectOperations}
- HeadObject operations if \`--skip-existing\` is used: ${payload.summary.headObjectOperationsWithSkipExisting}
- Total upload bytes: ${payload.summary.totalUploadBytes}
- Expected storage GB: ${payload.summary.expectedTotalStorageGB}
- Class A estimate: ${payload.summary.classAOperationCountEstimate}
- Class B estimate: ${payload.summary.classBOperationCountEstimate}
- Delete operations: ${payload.summary.deleteOperations}

Review the dry-run first. A \`--limit 10\` smoke upload can be useful only if the owner explicitly chooses it. No delete operation is included.
`;
}

function renderVerifierPlanReport(payload) {
  return `# Round 5O Post-Upload Verifier Plan

- Public base URL: ${payload.summary.publicBaseUrl}
- Full verification count: ${payload.summary.fullVerificationCount}
- Recommended sample size: ${payload.summary.recommendedSampleSize}
- Expected SVG content type: ${payload.summary.svgContentType}
- Expected WebP content type: ${payload.summary.webpContentType}
- Expected cache control: ${payload.summary.cacheControlExpected}

Run after owner upload:

\`${payload.commands.full}\`
`;
}

function renderOwnerRunbook() {
  return `# Round 5O Owner Upload Runbook

## A. When API Details Are Needed

API details are needed only after the dry-run passes and only on the local machine. Never paste keys into ChatGPT. Never commit keys.

## B. Required Local Details

- \`R2_ACCOUNT_ID\`
- \`R2_ACCESS_KEY_ID\`
- \`R2_SECRET_ACCESS_KEY\`
- \`R2_BUCKET=i-love-coloring-page\`
- \`R2_PREFIX=coloring-pages\`

## C. Where To Put Them

Use terminal environment variables, or put them in \`.env.r2-upload.local\`. That file is gitignored.

## D. Dry-Run Command

\`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --dry-run\`

## E. Optional Smoke Upload Command

\`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-file-count 12704 --limit 10 --skip-existing\`

## F. Full Upload Command

\`node pipeline/scripts/round-5o-upload-clean-bundle-to-r2.mjs --execute --confirm-bucket i-love-coloring-page --confirm-prefix coloring-pages --confirm-file-count 12704 --skip-existing\`

## G. Post-Upload Verification Command

\`node pipeline/scripts/round-5o-verify-clean-upload-r2.mjs --full --public-base-url https://assets.ilovecoloringpage.com/coloring-pages\`

## H. Warnings

- Do not rerun the full upload repeatedly without \`--skip-existing\`.
- Do not use dashboard upload for the full bundle.
- Do not delete existing objects unless explicitly planned later.
- Do not upload \`png/\` or \`thumbs/\`.
- Do not upload the parent folder incorrectly. Upload \`pipeline/r2-upload-clean/coloring-pages\` to the bucket root.
`;
}

function renderLifecycleReport(payload) {
  return `# Round 5O Local Uploader Lifecycle

- Local-only utility: ${payload.summary.localOnlyUtility}
- Temporary one-time helper: ${payload.summary.temporaryOneTimeHelper}
- Used by app runtime: ${payload.summary.usedByAppRuntime}
- Used by build: ${payload.summary.usedByBuild}
- Invoked automatically: ${payload.summary.invokedAutomatically}
- Recurring task: ${payload.summary.recurringTask}
- Background watcher: ${payload.summary.backgroundWatcher}
- Deletes remote objects: ${payload.summary.deletesRemoteObjects}

This utility is only for the initial clean SVG plus WebP upload and can be removed later if the owner chooses.
`;
}

function classifyWorkingTreePath(pathName) {
  if (!pathName) return "unknown";
  if (pathName === ".gitignore" || pathName === "AGENTS.md" || pathName === "package.json" || pathName === "package-lock.json" || pathName === ".env.r2-upload.example") return "intended_round_5o_artifact";
  if (/^pipeline\/(?:lib|scripts|tests|manifests|reports)\/round-5o/.test(pathName)) return "intended_round_5o_artifact";
  if (/^pipeline\/r2-upload-clean\//.test(pathName)) return "local_artifact_drift";
  if (/^pipeline\/manifests\/round-4|^pipeline\/reports\/round-4|^src\/generated\/coloring\//.test(pathName)) return "generated_validation_drift";
  return "risky_unrelated_drift";
}

function parseArgs(rawArgs) {
  const parsed = {
    execute: false,
    dryRun: true,
    skipExisting: false,
    verifyAfterUpload: false,
    resumeFromManifest: "",
    limit: 0,
    maxFiles: 0,
    maxBytes: 0,
    only: "all",
    concurrency: 0,
    confirmBucket: "",
    confirmPrefix: "",
    confirmFileCount: 0,
    allowDangerousBucketOverride: false,
    allowHighConcurrency: false,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--execute") parsed.execute = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--skip-existing") parsed.skipExisting = true;
    else if (arg === "--verify-after-upload") parsed.verifyAfterUpload = true;
    else if (arg === "--resume-from-manifest") parsed.resumeFromManifest = rawArgs[++index] || "";
    else if (arg === "--limit") parsed.limit = parsePositiveInteger(rawArgs[++index]);
    else if (arg.startsWith("--limit=")) parsed.limit = parsePositiveInteger(arg.split("=")[1]);
    else if (arg === "--max-files") parsed.maxFiles = parsePositiveInteger(rawArgs[++index]);
    else if (arg === "--max-bytes") parsed.maxBytes = parsePositiveInteger(rawArgs[++index]);
    else if (arg === "--concurrency") parsed.concurrency = parsePositiveInteger(rawArgs[++index]);
    else if (arg === "--only") parsed.only = rawArgs[++index] || "all";
    else if (arg === "--confirm-bucket") parsed.confirmBucket = rawArgs[++index] || "";
    else if (arg === "--confirm-prefix") parsed.confirmPrefix = normalizeR2Prefix(rawArgs[++index] || "");
    else if (arg === "--confirm-file-count") parsed.confirmFileCount = parsePositiveInteger(rawArgs[++index]);
    else if (arg === "--dangerously-allow-bucket-override") parsed.allowDangerousBucketOverride = true;
    else if (arg === "--allow-high-concurrency") parsed.allowHighConcurrency = true;
  }
  if (!["all", "svg", "webp"].includes(parsed.only)) throw new Error(`Invalid --only value: ${parsed.only}`);
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
  await writeFile(absolutePath, String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = statSync(root);
  if (rootStat.isFile()) return [slash(path.relative(REPO_ROOT, root))];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(slash(path.relative(REPO_ROOT, absolute)));
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
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function git(commandArgs) {
  try {
    return execFileSync("git", commandArgs, { cwd: REPO_ROOT, encoding: "utf8" });
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

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sumBytes(records) {
  return records.reduce((sum, entry) => sum + Number(entry.bytes || 0), 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}
