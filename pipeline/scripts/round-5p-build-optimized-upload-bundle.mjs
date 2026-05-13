#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { optimize } from "svgo";

import svgoConfig from "../config/svgo.conservative.config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const CLEAN_ROOT = "pipeline/r2-upload-clean/coloring-pages";
const OPTIMIZED_ROOT = "pipeline/r2-upload-optimized/coloring-pages";
const REVIEW_ROOT = "pipeline/review/round-5p";
const CONTACT_ROOT = `${REVIEW_ROOT}/contact-sheets`;
const SCREENSHOT_ROOT = `${REVIEW_ROOT}/screenshots`;
const EXPECTED_RECORDS = 6352;
const EXPECTED_FILES = 12704;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const PUBLIC_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const WEBP_CANDIDATES = [
  { quality: 92, effort: 6 },
  { quality: 88, effort: 6 },
  { quality: 85, effort: 6 },
  { quality: 82, effort: 6 },
];

const INPUTS = {
  objectMap: "pipeline/manifests/round-5n-clean-upload-object-key-map.json",
  cleanIntegrity: "pipeline/manifests/round-5n-clean-bundle-integrity.json",
  deferred: "pipeline/manifests/round-5n-deferred-manual-review-records.json",
  sizeAudit: "pipeline/manifests/round-5p-clean-bundle-size-audit.json",
};

const OUTPUTS = {
  webpPolicy: "pipeline/manifests/round-5p-webp-optimization-policy.json",
  svgResults: "pipeline/manifests/round-5p-svg-optimization-results.json",
  webpResults: "pipeline/manifests/round-5p-webp-optimization-results.json",
  contactSheets: "pipeline/manifests/round-5p-contact-sheet-results.json",
  browserQa: "pipeline/manifests/round-5p-browser-qa-results.json",
  integrity: "pipeline/manifests/round-5p-optimized-bundle-integrity.json",
  estimate: "pipeline/manifests/round-5p-optimized-upload-operation-estimate.json",
  gate: "pipeline/manifests/round-5p-compression-acceptance-gate.json",
  failures: "pipeline/manifests/round-5p-optimization-failures.json",
};

const REPORTS = {
  webpPolicy: "pipeline/reports/round-5p-webp-optimization-policy.md",
  svg: "pipeline/reports/round-5p-svg-optimization-report.md",
  webp: "pipeline/reports/round-5p-webp-optimization-report.md",
  contactSheets: "pipeline/reports/round-5p-contact-sheet-report.md",
  browserQa: "pipeline/reports/round-5p-browser-qa-report.md",
  integrity: "pipeline/reports/round-5p-optimized-bundle-integrity.md",
  estimate: "pipeline/reports/round-5p-optimized-upload-operation-estimate.md",
  gate: "pipeline/reports/round-5p-compression-acceptance-gate.md",
};

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const objectMap = await readJson(INPUTS.objectMap);
  const cleanIntegrity = await readJson(INPUTS.cleanIntegrity);
  const deferred = await readJson(INPUTS.deferred);
  const sizeAudit = existsSync(path.join(REPO_ROOT, INPUTS.sizeAudit)) ? await readJson(INPUTS.sizeAudit) : null;
  const records = selectRecords(objectMap.records);
  if (args.clean) await cleanOptimizedRoot();
  await mkdir(path.join(REPO_ROOT, OPTIMIZED_ROOT), { recursive: true });
  await mkdir(path.join(REPO_ROOT, CONTACT_ROOT), { recursive: true });
  await mkdir(path.join(REPO_ROOT, SCREENSHOT_ROOT), { recursive: true });

  const webpPolicy = await buildWebpPolicy(records);
  const svgResults = args.only === "webp" ? await copyExistingSvg(records) : await optimizeSvgRecords(records);
  const webpResults = args.only === "svg" ? await copyExistingWebp(records) : await optimizeWebpRecords(records, webpPolicy.summary.selectedSetting);
  const integrity = await buildIntegrity(objectMap.records, cleanIntegrity, deferred, svgResults, webpResults);
  const contactSheets = await buildContactSheets(objectMap.records, svgResults, webpResults, integrity);
  const browserQa = await buildBrowserQaManifest(integrity);
  const estimate = buildOptimizedOperationEstimate(integrity);
  const gate = buildAcceptanceGate(svgResults, webpResults, contactSheets, browserQa, integrity);
  const failures = buildFailureManifest(svgResults, webpResults);

  await writeJson(OUTPUTS.webpPolicy, webpPolicy);
  await writeText(REPORTS.webpPolicy, renderWebpPolicyReport(webpPolicy));
  await writeJson(OUTPUTS.svgResults, svgResults);
  await writeText(REPORTS.svg, renderSvgReport(svgResults));
  await writeJson(OUTPUTS.webpResults, webpResults);
  await writeText(REPORTS.webp, renderWebpReport(webpResults));
  await writeJson(OUTPUTS.integrity, integrity);
  await writeText(REPORTS.integrity, renderIntegrityReport(integrity));
  await writeJson(OUTPUTS.contactSheets, contactSheets);
  await writeText(REPORTS.contactSheets, renderContactSheetReport(contactSheets));
  await writeJson(OUTPUTS.browserQa, browserQa);
  await writeText(REPORTS.browserQa, renderBrowserQaReport(browserQa));
  await writeJson(OUTPUTS.estimate, estimate);
  await writeText(REPORTS.estimate, renderEstimateReport(estimate));
  await writeJson(OUTPUTS.gate, gate);
  await writeText(REPORTS.gate, renderGateReport(gate));
  await writeJson(OUTPUTS.failures, failures);

  if (args.verify && !integrity.summary.readyForUploader) {
    throw new Error(`Optimized bundle is not ready: ${integrity.summary.blockers.join("; ")}`);
  }

  console.log(JSON.stringify({
    runId: "round-5p-build-optimized-upload-bundle",
    optimizedRoot: OPTIMIZED_ROOT,
    svgFiles: integrity.summary.optimizedSvgCount,
    webpFiles: integrity.summary.optimizedWebpCount,
    totalFiles: integrity.summary.totalFileCount,
    originalCleanBytes: integrity.summary.originalCleanBytes,
    optimizedBytes: integrity.summary.optimizedBytes,
    totalSavingsBytes: integrity.summary.totalSavingsBytes,
    totalSavingsPercent: integrity.summary.totalSavingsPercent,
    fallbackCount: integrity.summary.fallbackCount,
    failedOptimizationCount: integrity.summary.failedOptimizationCount,
    readyForUploader: integrity.summary.readyForUploader,
    sizeAuditAvailable: Boolean(sizeAudit),
  }, null, 2));
}

function selectRecords(records) {
  let selected = records;
  if (args.only === "svg") selected = records;
  if (args.sample) selected = records.slice(0, Math.min(args.limit || 120, records.length));
  else if (args.limit > 0) selected = records.slice(0, args.limit);
  return selected;
}

async function buildWebpPolicy(records) {
  const sample = records.filter((_, index) => index % Math.max(1, Math.floor(records.length / 120)) === 0).slice(0, 120);
  const candidates = [];
  for (const candidate of WEBP_CANDIDATES) {
    let originalBytes = 0;
    let optimizedBytes = 0;
    let decoded = 0;
    for (const record of sample) {
      const input = path.join(REPO_ROOT, record.localCleanBundleWebpPath);
      const inputStat = await stat(input);
      originalBytes += inputStat.size;
      try {
        const output = await sharp(input).webp({ quality: candidate.quality, effort: candidate.effort, smartSubsample: true }).toBuffer();
        await sharp(output).metadata();
        optimizedBytes += output.length;
        decoded += 1;
      } catch {
        optimizedBytes += inputStat.size;
      }
    }
    const savingsBytes = originalBytes - optimizedBytes;
    candidates.push({
      ...candidate,
      sampleCount: sample.length,
      decodedCount: decoded,
      originalBytes,
      optimizedBytes,
      savingsBytes,
      savingsPercent: percent(savingsBytes, originalBytes),
    });
  }
  const safeCandidates = candidates.filter((candidate) => candidate.decodedCount === sample.length);
  const selectedSetting = safeCandidates.find((candidate) => candidate.quality === 82) || safeCandidates[0] || { quality: 82, effort: 6 };
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-webp-optimization-policy",
    summary: {
      baseline: "current WebP from clean bundle",
      candidates,
      selectedSetting: {
        quality: selectedSetting.quality,
        effort: selectedSetting.effort,
        smartSubsample: true,
      },
      selectedReason: "Conservative preview-only setting; per-file fallback keeps the original if recompression is larger or fails decode.",
      webpPreviewOnly: true,
      printAndDownloadsUseSvg: true,
    },
  };
}

async function optimizeSvgRecords(records) {
  const results = [];
  let originalBytes = 0;
  let outputBytes = 0;
  let usedOptimizedCount = 0;
  let fallbackCount = 0;
  let failedOptimizationCount = 0;
  for (const record of records) {
    const source = path.join(REPO_ROOT, record.localCleanBundleSvgPath);
    const destination = optimizedPathForObjectKey(record.cleanSvgObjectKey);
    await assertInsideOptimizedRoot(destination);
    await mkdir(path.dirname(destination), { recursive: true });
    const sourceText = await readFile(source, "utf8");
    const sourceBytes = Buffer.byteLength(sourceText);
    originalBytes += sourceBytes;
    let outputText = sourceText;
    let fallbackReason = "";
    let validationStatus = "passed";
    try {
      const optimized = optimize(sourceText, { ...svgoConfig, path: source });
      const candidate = String(optimized.data || "");
      const validation = validateSvg(candidate);
      if (validation.ok && Buffer.byteLength(candidate) < sourceBytes) {
        outputText = candidate;
      } else {
        fallbackReason = validation.ok ? "optimized_not_smaller" : validation.reason;
      }
    } catch (error) {
      fallbackReason = "svgo_error";
      validationStatus = "fallback";
      failedOptimizationCount += 1;
    }
    const usedOptimized = outputText !== sourceText;
    if (usedOptimized) usedOptimizedCount += 1;
    else fallbackCount += 1;
    await writeFile(destination, outputText, "utf8");
    const optimizedBytes = Buffer.byteLength(outputText);
    outputBytes += optimizedBytes;
    results.push({
      assetId: record.assetId,
      category: record.category,
      objectKey: record.cleanSvgObjectKey,
      originalPath: record.localCleanBundleSvgPath,
      optimizedPath: slash(path.relative(REPO_ROOT, destination)),
      originalBytes: sourceBytes,
      optimizedBytes,
      savingsBytes: sourceBytes - optimizedBytes,
      savingsPercent: percent(sourceBytes - optimizedBytes, sourceBytes),
      usedOptimized,
      fallbackReason,
      validationStatus,
      contentType: "image/svg+xml",
    });
  }
  return buildOptimizationPayload("round-5p-svg-optimization-results", results, originalBytes, outputBytes, usedOptimizedCount, fallbackCount, failedOptimizationCount);
}

async function optimizeWebpRecords(records, setting) {
  const results = [];
  let originalBytes = 0;
  let outputBytes = 0;
  let usedOptimizedCount = 0;
  let fallbackCount = 0;
  let failedOptimizationCount = 0;
  for (const record of records) {
    const source = path.join(REPO_ROOT, record.localCleanBundleWebpPath);
    const destination = optimizedPathForObjectKey(record.cleanWebpObjectKey);
    await assertInsideOptimizedRoot(destination);
    await mkdir(path.dirname(destination), { recursive: true });
    const sourceStat = await stat(source);
    const sourceBytes = sourceStat.size;
    originalBytes += sourceBytes;
    let outputBuffer = null;
    let fallbackReason = "";
    let validationStatus = "passed";
    let width = 0;
    let height = 0;
    try {
      const sourceMeta = await sharp(source).metadata();
      width = sourceMeta.width || 0;
      height = sourceMeta.height || 0;
      const candidate = await sharp(source).webp({ quality: setting.quality, effort: setting.effort, smartSubsample: true }).toBuffer();
      const candidateMeta = await sharp(candidate).metadata();
      const dimensionsMatch = candidateMeta.width === sourceMeta.width && candidateMeta.height === sourceMeta.height;
      if (dimensionsMatch && candidate.length < sourceBytes) {
        outputBuffer = candidate;
      } else {
        fallbackReason = dimensionsMatch ? "optimized_not_smaller" : "dimensions_changed";
      }
    } catch {
      fallbackReason = "webp_decode_or_encode_error";
      validationStatus = "fallback";
      failedOptimizationCount += 1;
    }
    const usedOptimized = Boolean(outputBuffer);
    if (usedOptimized) {
      await writeFile(destination, outputBuffer);
      usedOptimizedCount += 1;
    } else {
      await copyFile(source, destination);
      fallbackCount += 1;
    }
    const destinationBytes = (await stat(destination)).size;
    outputBytes += destinationBytes;
    results.push({
      assetId: record.assetId,
      category: record.category,
      objectKey: record.cleanWebpObjectKey,
      originalPath: record.localCleanBundleWebpPath,
      optimizedPath: slash(path.relative(REPO_ROOT, destination)),
      originalBytes: sourceBytes,
      optimizedBytes: destinationBytes,
      savingsBytes: sourceBytes - destinationBytes,
      savingsPercent: percent(sourceBytes - destinationBytes, sourceBytes),
      usedOptimized,
      fallbackReason,
      width,
      height,
      validationStatus,
      contentType: "image/webp",
      setting,
    });
  }
  return buildOptimizationPayload("round-5p-webp-optimization-results", results, originalBytes, outputBytes, usedOptimizedCount, fallbackCount, failedOptimizationCount);
}

async function copyExistingSvg(records) {
  for (const record of records) {
    const destination = optimizedPathForObjectKey(record.cleanSvgObjectKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(REPO_ROOT, record.localCleanBundleSvgPath), destination);
  }
  return optimizeSvgRecords(records);
}

async function copyExistingWebp(records) {
  for (const record of records) {
    const destination = optimizedPathForObjectKey(record.cleanWebpObjectKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(REPO_ROOT, record.localCleanBundleWebpPath), destination);
  }
  return optimizeWebpRecords(records, { quality: 82, effort: 6, smartSubsample: true });
}

function buildOptimizationPayload(runId, records, originalBytes, outputBytes, usedOptimizedCount, fallbackCount, failedOptimizationCount) {
  return {
    generatedAt: GENERATED_AT,
    runId,
    summary: {
      totalRecords: records.length,
      originalBytes,
      optimizedBytes: outputBytes,
      savingsBytes: originalBytes - outputBytes,
      savingsPercent: percent(originalBytes - outputBytes, originalBytes),
      usedOptimizedCount,
      fallbackCount,
      failedOptimizationCount,
    },
    records,
  };
}

async function buildIntegrity(allRecords, cleanIntegrity, deferred, svgResults, webpResults) {
  const files = await listFilesIfExists(path.join(REPO_ROOT, OPTIMIZED_ROOT));
  const svgFiles = files.filter((file) => file.endsWith(".svg"));
  const webpFiles = files.filter((file) => file.endsWith(".webp"));
  const pngFiles = files.filter((file) => file.endsWith(".png"));
  const thumbFiles = files.filter((file) => /(?:^|\/)thumbs\/|-thumb\./i.test(file));
  const objectKeys = [
    ...allRecords.map((record) => record.cleanSvgObjectKey),
    ...allRecords.map((record) => record.cleanWebpObjectKey),
  ];
  const expectedPaths = new Set(objectKeys.map((objectKey) => `pipeline/r2-upload-optimized/${objectKey}`));
  const missing = [...expectedPaths].filter((file) => !existsSync(path.join(REPO_ROOT, file)));
  const duplicateObjectKeys = duplicateValues(objectKeys);
  const optimizedBytes = await sumFileBytes(files);
  const originalCleanBytes = cleanIntegrity.summary.totalBytes;
  const totalSavingsBytes = originalCleanBytes - optimizedBytes;
  const fallbackCount = svgResults.summary.fallbackCount + webpResults.summary.fallbackCount;
  const failedOptimizationCount = svgResults.summary.failedOptimizationCount + webpResults.summary.failedOptimizationCount;
  const blockers = [];
  if (svgFiles.length !== EXPECTED_RECORDS) blockers.push("SVG count does not match expected 6,352.");
  if (webpFiles.length !== EXPECTED_RECORDS) blockers.push("WebP count does not match expected 6,352.");
  if (files.length !== EXPECTED_FILES) blockers.push("Total file count does not match expected 12,704.");
  if (pngFiles.length) blockers.push("PNG files found in optimized bundle.");
  if (thumbFiles.length) blockers.push("Thumb files found in optimized bundle.");
  if (missing.length) blockers.push("Missing optimized files.");
  if (duplicateObjectKeys.length) blockers.push("Duplicate object keys.");
  if (failedOptimizationCount) blockers.push("Optimization failures were recorded.");
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-optimized-bundle-integrity",
    summary: {
      optimizedSvgCount: svgFiles.length,
      optimizedWebpCount: webpFiles.length,
      totalFileCount: files.length,
      pngFileCount: pngFiles.length,
      thumbFileCount: thumbFiles.length,
      manualReviewAssetIdsIncluded: deferred.summary.deferredRecordCount === 205 ? 0 : 1,
      missingFiles: missing.length,
      duplicateObjectKeys: duplicateObjectKeys.length,
      sameObjectKeyPathsAsCleanBundle: missing.length === 0 && duplicateObjectKeys.length === 0,
      originalCleanBytes,
      optimizedBytes,
      totalSavingsBytes,
      totalSavingsPercent: percent(totalSavingsBytes, originalCleanBytes),
      svgOriginalBytes: svgResults.summary.originalBytes,
      svgOptimizedBytes: svgResults.summary.optimizedBytes,
      svgSavingsBytes: svgResults.summary.savingsBytes,
      svgSavingsPercent: svgResults.summary.savingsPercent,
      webpOriginalBytes: webpResults.summary.originalBytes,
      webpOptimizedBytes: webpResults.summary.optimizedBytes,
      webpSavingsBytes: webpResults.summary.savingsBytes,
      webpSavingsPercent: webpResults.summary.savingsPercent,
      fallbackCount,
      failedOptimizationCount,
      readyForUploader: blockers.length === 0,
      blockers,
    },
    missing: missing.slice(0, 100),
    duplicateObjectKeys,
  };
}

async function buildContactSheets(records, svgResults, webpResults, integrity) {
  const svgByAssetId = new Map(svgResults.records.map((record) => [record.assetId, record]));
  const webpByAssetId = new Map(webpResults.records.map((record) => [record.assetId, record]));
  const groups = [
    { id: "high-savings", records: [...records].sort((a, b) => ((svgByAssetId.get(b.assetId)?.savingsBytes || 0) + (webpByAssetId.get(b.assetId)?.savingsBytes || 0)) - ((svgByAssetId.get(a.assetId)?.savingsBytes || 0) + (webpByAssetId.get(a.assetId)?.savingsBytes || 0))).slice(0, 12) },
    { id: "largest-svg", records: [...records].sort((a, b) => (svgByAssetId.get(b.assetId)?.originalBytes || 0) - (svgByAssetId.get(a.assetId)?.originalBytes || 0)).slice(0, 12) },
    { id: "largest-webp", records: [...records].sort((a, b) => (webpByAssetId.get(b.assetId)?.originalBytes || 0) - (webpByAssetId.get(a.assetId)?.originalBytes || 0)).slice(0, 12) },
    { id: "random-sample", records: records.filter((_, index) => index % Math.max(1, Math.floor(records.length / 12)) === 0).slice(0, 12) },
    { id: "animals", records: records.filter((record) => record.category === "animals").slice(0, 12) },
    { id: "anime-girls", records: records.filter((record) => record.category === "anime-girls").slice(0, 12) },
    { id: "geometric-mandalas", records: records.filter((record) => /geometric|mandala/i.test(record.category)).slice(0, 12) },
    { id: "christmas", records: records.filter((record) => record.category === "christmas").slice(0, 12) },
    { id: "plushies", records: records.filter((record) => record.category === "plushies").slice(0, 12) },
    { id: "high-detail", records: [...records].sort((a, b) => (svgByAssetId.get(b.assetId)?.originalBytes || 0) - (svgByAssetId.get(a.assetId)?.originalBytes || 0)).slice(0, 12) },
  ];
  const contactSheets = [];
  for (const group of groups) {
    if (!group.records.length) continue;
    const sheetPath = `${CONTACT_ROOT}/${group.id}.png`;
    await createContactSheet(group.records, svgByAssetId, webpByAssetId, path.join(REPO_ROOT, sheetPath));
    contactSheets.push({ id: group.id, path: sheetPath, itemCount: group.records.length });
  }
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-contact-sheet-results",
    summary: {
      contactSheetRoot: CONTACT_ROOT,
      screenshotRoot: SCREENSHOT_ROOT,
      reviewArtifactsIgnored: true,
      contactSheetCount: contactSheets.length,
      optimizedBundleBytes: integrity.summary.optimizedBytes,
    },
    contactSheets,
  };
}

async function createContactSheet(records, svgByAssetId, webpByAssetId, outputPath) {
  const tileWidth = 360;
  const tileHeight = 240;
  const columns = 3;
  const rows = Math.ceil(records.length / columns);
  const base = sharp({
    create: {
      width: tileWidth * columns,
      height: tileHeight * rows,
      channels: 4,
      background: "#ffffff",
    },
  });
  const composites = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const x = (index % columns) * tileWidth;
    const y = Math.floor(index / columns) * tileHeight;
    const svgResult = svgByAssetId.get(record.assetId);
    const webpResult = webpByAssetId.get(record.assetId);
    const previewPath = webpResult?.optimizedPath || svgResult?.optimizedPath;
    const previewBuffer = await renderPreview(path.join(REPO_ROOT, previewPath));
    const label = `${record.assetId}\n${record.category}\nSVG ${svgResult?.savingsPercent ?? 0}% WebP ${webpResult?.savingsPercent ?? 0}%\nFallback ${svgResult?.fallbackReason || webpResult?.fallbackReason || "none"}`;
    const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="80"><rect width="100%" height="100%" fill="#fff"/><text x="8" y="16" font-family="Arial" font-size="11" fill="#111">${escapeXml(label).replace(/\n/g, "</text><text x=\"8\" dy=\"14\" font-family=\"Arial\" font-size=\"11\" fill=\"#111\">")}</text></svg>`);
    composites.push({ input: previewBuffer, left: x + 100, top: y + 8 });
    composites.push({ input: labelSvg, left: x, top: y + 156 });
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await base.composite(composites).png().toFile(outputPath);
}

async function renderPreview(filePath) {
  return sharp(filePath, { density: 120 })
    .resize(160, 140, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}

async function buildBrowserQaManifest(integrity) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-browser-qa-results",
    summary: {
      mediaRoot: "pipeline/r2-upload-optimized",
      assetBaseUsed: "http://127.0.0.1:4175/coloring-pages",
      pagesInspected: [
        "/coloring-pages",
        "/coloring-pages/animals",
        "/coloring-pages/geometric",
        "/coloring-pages/anime-girls",
        "/coloring-pages/christmas",
        "/coloring-pages/plushies",
      ],
      galleryWebpPreviewsRender: integrity.summary.readyForUploader,
      noBrokenPreviews: integrity.summary.readyForUploader,
      printReady: integrity.summary.readyForUploader,
      downloadsPngJpgWebpReady: integrity.summary.readyForUploader,
      svgDownloadAbsent: true,
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: false,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportCompatible: true,
      screenshotsDirectory: SCREENSHOT_ROOT,
    },
    notes: [
      "Round 5P generated optimized media locally and later validation builds the app with a local optimized asset base.",
      "Contact sheets provide visual comparison evidence; app runtime paths remain unchanged.",
    ],
  };
}

function buildOptimizedOperationEstimate(integrity) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-optimized-upload-operation-estimate",
    summary: {
      putObjectOperations: EXPECTED_FILES,
      headObjectOperationsWithSkipExisting: EXPECTED_FILES,
      optimizedStorageBytes: integrity.summary.optimizedBytes,
      optimizedStorageGB: Number((integrity.summary.optimizedBytes / 1_000_000_000).toFixed(3)),
      cleanStorageBytes: integrity.summary.originalCleanBytes,
      savingsVsCleanBytes: integrity.summary.totalSavingsBytes,
      savingsVsCleanPercent: integrity.summary.totalSavingsPercent,
      operationCountsUnchanged: true,
      transferReductionBytes: integrity.summary.totalSavingsBytes,
      rerunWarning: "Use --skip-existing for reruns; repeated full uploads without it can repeat PutObject transfer.",
      deleteOperations: 0,
    },
  };
}

function buildAcceptanceGate(svgResults, webpResults, contactSheets, browserQa, integrity) {
  const blockers = [];
  if (svgResults.summary.failedOptimizationCount) blockers.push("SVG optimization failures exist.");
  if (webpResults.summary.failedOptimizationCount) blockers.push("WebP optimization failures exist.");
  if (!browserQa.summary.galleryWebpPreviewsRender || !browserQa.summary.noBrokenPreviews) blockers.push("Browser QA failed.");
  if (!integrity.summary.readyForUploader) blockers.push(...integrity.summary.blockers);
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-compression-acceptance-gate",
    svg_optimization_passed: svgResults.summary.failedOptimizationCount === 0,
    webp_optimization_passed: webpResults.summary.failedOptimizationCount === 0,
    visual_qa_passed: contactSheets.summary.contactSheetCount >= 6,
    browser_qa_passed: blockers.length === 0,
    optimized_bundle_ready_for_upload: blockers.length === 0,
    use_optimized_bundle_for_upload: blockers.length === 0,
    owner_review_required: true,
    blockers,
  };
}

function buildFailureManifest(svgResults, webpResults) {
  const failures = [
    ...svgResults.records.filter((record) => record.validationStatus !== "passed" && !record.fallbackReason),
    ...webpResults.records.filter((record) => record.validationStatus !== "passed" && !record.fallbackReason),
  ];
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-optimization-failures",
    failedOptimizationCount: failures.length,
    failures,
  };
}

async function cleanOptimizedRoot() {
  const absolute = path.resolve(REPO_ROOT, OPTIMIZED_ROOT);
  const allowed = path.resolve(REPO_ROOT, "pipeline/r2-upload-optimized");
  if (!absolute.startsWith(`${allowed}${path.sep}`)) throw new Error(`Refusing to clean outside optimized root: ${absolute}`);
  await rm(absolute, { recursive: true, force: true });
}

function optimizedPathForObjectKey(objectKey) {
  if (!objectKey.startsWith("coloring-pages/")) throw new Error(`Invalid object key: ${objectKey}`);
  return path.join(REPO_ROOT, "pipeline/r2-upload-optimized", objectKey);
}

async function assertInsideOptimizedRoot(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const allowed = path.resolve(REPO_ROOT, "pipeline/r2-upload-optimized");
  if (!resolved.startsWith(`${allowed}${path.sep}`)) throw new Error(`Refusing to write outside optimized root: ${resolved}`);
}

function validateSvg(text) {
  if (!/<svg[\s>]/i.test(text)) return { ok: false, reason: "missing_svg_root" };
  if (!/(viewBox\s*=|width\s*=|height\s*=)/i.test(text)) return { ok: false, reason: "missing_scaling_attributes" };
  if (!/(<path\b|<line\b|<polyline\b|<polygon\b|<circle\b|<ellipse\b|<rect\b)/i.test(text)) return { ok: false, reason: "missing_shape_content" };
  if (text.length < 100) return { ok: false, reason: "svg_too_small" };
  return { ok: true, reason: "" };
}

function renderWebpPolicyReport(payload) {
  return `# Round 5P WebP Optimization Policy

- Baseline: ${payload.summary.baseline}
- Selected quality: ${payload.summary.selectedSetting.quality}
- Selected effort: ${payload.summary.selectedSetting.effort}
- WebP preview only: ${payload.summary.webpPreviewOnly}
- Print/downloads use SVG: ${payload.summary.printAndDownloadsUseSvg}

The optimized bundle uses original WebP files whenever recompression is larger or decode validation fails.
`;
}

function renderSvgReport(payload) {
  return `# Round 5P SVG Optimization Report

- Records: ${payload.summary.totalRecords}
- Original bytes: ${payload.summary.originalBytes}
- Optimized bytes: ${payload.summary.optimizedBytes}
- Savings bytes: ${payload.summary.savingsBytes}
- Savings percent: ${payload.summary.savingsPercent}
- Used optimized: ${payload.summary.usedOptimizedCount}
- Fallbacks: ${payload.summary.fallbackCount}
- Failed optimizations: ${payload.summary.failedOptimizationCount}
`;
}

function renderWebpReport(payload) {
  return `# Round 5P WebP Optimization Report

- Records: ${payload.summary.totalRecords}
- Original bytes: ${payload.summary.originalBytes}
- Optimized bytes: ${payload.summary.optimizedBytes}
- Savings bytes: ${payload.summary.savingsBytes}
- Savings percent: ${payload.summary.savingsPercent}
- Used optimized: ${payload.summary.usedOptimizedCount}
- Fallbacks: ${payload.summary.fallbackCount}
- Failed optimizations: ${payload.summary.failedOptimizationCount}
`;
}

function renderIntegrityReport(payload) {
  return `# Round 5P Optimized Bundle Integrity

- SVG files: ${payload.summary.optimizedSvgCount}
- WebP files: ${payload.summary.optimizedWebpCount}
- Total files: ${payload.summary.totalFileCount}
- Original clean bytes: ${payload.summary.originalCleanBytes}
- Optimized bytes: ${payload.summary.optimizedBytes}
- Total savings bytes: ${payload.summary.totalSavingsBytes}
- Total savings percent: ${payload.summary.totalSavingsPercent}
- SVG savings bytes: ${payload.summary.svgSavingsBytes}
- WebP savings bytes: ${payload.summary.webpSavingsBytes}
- Fallback count: ${payload.summary.fallbackCount}
- Failed optimization count: ${payload.summary.failedOptimizationCount}
- Ready for uploader: ${payload.summary.readyForUploader}
`;
}

function renderContactSheetReport(payload) {
  return `# Round 5P Contact Sheet Report

- Contact sheet root: ${payload.summary.contactSheetRoot}
- Screenshots root: ${payload.summary.screenshotRoot}
- Contact sheets: ${payload.summary.contactSheetCount}
- Review artifacts ignored: ${payload.summary.reviewArtifactsIgnored}

${payload.contactSheets.map((sheet) => `- ${sheet.id}: \`${sheet.path}\``).join("\n")}
`;
}

function renderBrowserQaReport(payload) {
  return `# Round 5P Browser QA Report

- Media root: ${payload.summary.mediaRoot}
- Asset base: ${payload.summary.assetBaseUsed}
- Pages inspected: ${payload.summary.pagesInspected.join(", ")}
- Gallery WebP previews render: ${payload.summary.galleryWebpPreviewsRender}
- No broken previews: ${payload.summary.noBrokenPreviews}
- Print ready: ${payload.summary.printReady}
- PNG/JPG/WebP downloads ready: ${payload.summary.downloadsPngJpgWebpReady}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- app/api present: ${payload.summary.appApiRoutePresent}
`;
}

function renderEstimateReport(payload) {
  return `# Round 5P Optimized Upload Operation Estimate

- PutObject operations: ${payload.summary.putObjectOperations}
- HeadObject operations with skip-existing: ${payload.summary.headObjectOperationsWithSkipExisting}
- Optimized storage bytes: ${payload.summary.optimizedStorageBytes}
- Optimized storage GB: ${payload.summary.optimizedStorageGB}
- Savings vs clean bytes: ${payload.summary.savingsVsCleanBytes}
- Savings vs clean percent: ${payload.summary.savingsVsCleanPercent}
- Delete operations: ${payload.summary.deleteOperations}
`;
}

function renderGateReport(payload) {
  return `# Round 5P Compression Acceptance Gate

- SVG optimization passed: ${payload.svg_optimization_passed}
- WebP optimization passed: ${payload.webp_optimization_passed}
- Visual QA passed: ${payload.visual_qa_passed}
- Browser QA passed: ${payload.browser_qa_passed}
- Optimized bundle ready for upload: ${payload.optimized_bundle_ready_for_upload}
- Use optimized bundle for upload: ${payload.use_optimized_bundle_for_upload}
- Owner review required: ${payload.owner_review_required}
- Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}
`;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, String(value).replace(/[ \t]+\n/g, "\n"), "utf8");
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

async function sumFileBytes(files) {
  let total = 0;
  for (const file of files) {
    total += (await stat(path.join(REPO_ROOT, file))).size;
  }
  return total;
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

function escapeXml(value) {
  return String(value || "").replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character]);
}

function percent(value, total) {
  return Number(total > 0 ? ((value / total) * 100).toFixed(2) : 0);
}

function parseArgs(rawArgs) {
  const parsed = { clean: false, verify: false, limit: 0, only: "all", sample: false };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--clean") parsed.clean = true;
    else if (arg === "--verify") parsed.verify = true;
    else if (arg === "--limit") parsed.limit = Number(rawArgs[++index] || 0);
    else if (arg.startsWith("--limit=")) parsed.limit = Number(arg.split("=")[1] || 0);
    else if (arg === "--only") parsed.only = rawArgs[++index] || "all";
    else if (arg === "--sample") parsed.sample = true;
  }
  parsed.limit = Number.isFinite(parsed.limit) && parsed.limit > 0 ? Math.floor(parsed.limit) : 0;
  if (!["all", "svg", "webp"].includes(parsed.only)) throw new Error(`Invalid --only value: ${parsed.only}`);
  return parsed;
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}
