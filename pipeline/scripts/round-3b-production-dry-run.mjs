import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadIloveSvgRuntime,
  runSingleConversion,
} from "./round-2-bakeoff.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND3B_GENERATED_AT = "2026-05-09";
const ROUND3B_RUN_ID = "round-3b-approved-production-dry-run-line-thick";
const DEFAULT_DRY_RUN_ROOT = path.join("pipeline", "production", "dry-run");

const INPUT_PATHS = {
  inventory: "pipeline/manifests/image-inventory.json",
  categorySummary: "pipeline/manifests/category-summary.json",
  policy: "pipeline/manifests/round-2-recommended-policy.json",
  presetInventory: "pipeline/manifests/conversion-preset-inventory.json",
  approved: "pipeline/manifests/round-3a1-approved-source-images.json",
  blocked: "pipeline/manifests/round-3a1-blocked-source-images.json",
  warnings: "pipeline/manifests/round-3a1-warning-source-images.json",
  sample: "pipeline/manifests/round-3a1-approved-production-dry-run-sample.json",
};

export const ROUND3B_PROJECT_MANIFESTS = [
  "pipeline/manifests/round-3b-production-dry-run-results.json",
  "pipeline/manifests/round-3b-production-dry-run-assets.json",
  "pipeline/manifests/round-3b-production-dry-run-quarantine.json",
  "pipeline/manifests/round-3b-production-dry-run-gallery-sample.json",
  "pipeline/manifests/round-3b-production-output-spec.json",
];

const ROUND3B_PROJECT_REPORTS = [
  "pipeline/reports/round-3b-production-dry-run-report.md",
  "pipeline/reports/round-3b-output-spec.md",
  "pipeline/reports/round-3b-quarantine-report.md",
  "pipeline/reports/round-3b-next-phase-plan.md",
];

const DRY_RUN_SUBDIRS = [
  "assets/svg",
  "assets/png",
  "assets/thumbs",
  "manifests",
  "reports",
  "logs",
  "quarantine/conversion-failed",
  "quarantine/qa-failed",
  "quarantine/metadata-failed",
  "quarantine/preview-failed",
  "review/contact-sheets",
  "review/category-sheets",
  "review/quarantine-sheets",
];

const CONVERSION_WRAPPER = {
  modulePath: "pipeline/scripts/round-2-bakeoff.mjs",
  exportName: "runSingleConversion",
  runtimeExportName: "loadIloveSvgRuntime",
  underlyingPath: "ilovesvg/app/shared/tracing/serverFallback.server.ts",
  underlyingFunctions: [
    "runSharedRasterNormalization",
    "runSharedPotraceSvgTrace",
    "annotateSharedSingleTraceSvg",
    "applyTraceSvgOutputSettings",
  ],
};

const DEFAULT_THRESHOLDS = {
  minimumDarkPixelRatio: 0.004,
  maximumDarkPixelRatio: 0.55,
  maximumSvgBytesPreferred: 2_000_000,
  maximumPathCountPreferred: 2_500,
  minimumSvgBytes: 80,
  minimumRasterDimension: 16,
};

export async function loadRound3BInputState({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const manifests = {
    inventory: await readJson(path.join(repoRoot, INPUT_PATHS.inventory)),
    categorySummary: await readJson(path.join(repoRoot, INPUT_PATHS.categorySummary)),
    policy: await readJson(path.join(repoRoot, INPUT_PATHS.policy)),
    presetInventory: await readJson(path.join(repoRoot, INPUT_PATHS.presetInventory)),
    approved: await readJson(path.join(repoRoot, INPUT_PATHS.approved)),
    blocked: await readJson(path.join(repoRoot, INPUT_PATHS.blocked)),
    warnings: await readJson(path.join(repoRoot, INPUT_PATHS.warnings)),
    sample: await readJson(path.join(repoRoot, INPUT_PATHS.sample)),
  };
  const preset = findPolicyPreset(manifests.policy, manifests.presetInventory);
  return buildInputStateFromManifests({ repoRoot, manifests: { ...manifests, preset } });
}

export function validateDryRunSamples({ sample, approved, blocked, warnings }) {
  const approvedSet = new Set((approved?.entries || []).map((entry) => entry.sourceRelativePath));
  const blockedSet = new Set((blocked?.entries || []).map((entry) => entry.sourceRelativePath));
  const warningSet = new Set((warnings?.entries || []).map((entry) => entry.sourceRelativePath));
  const sampleEntries = sample?.samples || [];

  const missingApprovedPaths = [];
  const blockedSamplePaths = [];
  const warningApprovedPaths = [];
  const duplicateSamplePaths = [];
  const seen = new Set();

  for (const item of sampleEntries) {
    const sourcePath = item.sourceRelativePath;
    if (seen.has(sourcePath)) duplicateSamplePaths.push(sourcePath);
    seen.add(sourcePath);
    if (blockedSet.has(sourcePath)) {
      blockedSamplePaths.push(sourcePath);
    } else if (!approvedSet.has(sourcePath)) {
      missingApprovedPaths.push(sourcePath);
    }
    if (approvedSet.has(sourcePath) && warningSet.has(sourcePath)) warningApprovedPaths.push(sourcePath);
  }

  return {
    isValid: missingApprovedPaths.length === 0 && blockedSamplePaths.length === 0 && duplicateSamplePaths.length === 0,
    totalSamples: sampleEntries.length,
    approvedSampleCount: sampleEntries.filter((entry) => approvedSet.has(entry.sourceRelativePath)).length,
    blockedSamplePaths,
    missingApprovedPaths,
    duplicateSamplePaths,
    warningApprovedPaths,
  };
}

export function buildAssetIdentity(entry) {
  const categorySlug = slug(entry.category || "uncategorized");
  const filenameBase = path.posix.basename(
    String(entry.filename || entry.sourceRelativePath || "source").replace(/\\/g, "/"),
    path.posix.extname(entry.filename || entry.sourceRelativePath || ""),
  );
  const filenameSlug = slug(filenameBase) || "source";
  const stableId = stableHash(entry.sourceRelativePath || `${entry.category}/${entry.filename}`).slice(0, 10);
  const assetId = `${categorySlug}__${filenameSlug}__${stableId}`;
  const outputBase = `${filenameSlug}-${stableId}`;

  return {
    assetId,
    stableId,
    categorySlug,
    filenameSlug,
    outputBase,
    svgRelativePath: slash(path.posix.join(DEFAULT_DRY_RUN_ROOT, "assets", "svg", categorySlug, `${outputBase}.svg`)),
    pngRelativePath: slash(path.posix.join(DEFAULT_DRY_RUN_ROOT, "assets", "png", categorySlug, `${outputBase}.png`)),
    thumbRelativePath: slash(path.posix.join(DEFAULT_DRY_RUN_ROOT, "assets", "thumbs", categorySlug, `${outputBase}-thumb.png`)),
  };
}

export async function runRound3BProductionDryRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const dryRunRoot = path.resolve(repoRoot, options.outputRoot || DEFAULT_DRY_RUN_ROOT);
  assertInside(repoRoot, dryRunRoot);

  const inputState = options.manifests
    ? buildInputStateFromManifests({ repoRoot, manifests: options.manifests })
    : await loadRound3BInputState({ repoRoot });

  const resetOutputRoot = options.resetOutputRoot !== false;
  await prepareDryRunFolders({ dryRunRoot, resetOutputRoot });

  const runtime = options.runtime || (options.converter ? null : await loadIloveSvgRuntime());
  const logPath = path.join(dryRunRoot, "logs", "round-3b-production-dry-run.jsonl");
  await writeFile(logPath, "", "utf8");

  const approvedByPath = mapByPath(inputState.manifests.approved.entries);
  const blockedByPath = mapByPath(inputState.manifests.blocked.entries);
  const warningByPath = mapByPath(inputState.manifests.warnings.entries);
  const sampleEntries = inputState.manifests.sample.samples || [];
  const preset = inputState.manifests.preset;
  const thresholds = getThresholds(inputState.manifests.policy);

  const passedAssets = [];
  const quarantineEntries = [];
  const skippedEntries = [];
  const processedRecords = [];

  for (const sample of sampleEntries) {
    const sourcePath = sample.sourceRelativePath;
    const approvedEntry = approvedByPath.get(sourcePath);
    const blockedEntry = blockedByPath.get(sourcePath);
    const warningEntry = warningByPath.get(sourcePath);
    const identity = buildAssetIdentity(approvedEntry || sample);
    const outputPaths = buildOutputPaths({ repoRoot, identity });

    if (blockedEntry) {
      const skipped = buildSkippedEntry({
        sample,
        approvedEntry,
        blockedEntry,
        warningEntry,
        identity,
        outputPaths,
        reasonCode: "blocked_source_in_dry_run_sample",
      });
      skippedEntries.push(skipped);
      processedRecords.push({ ...skipped, status: "skipped" });
      continue;
    }

    if (!approvedEntry) {
      const skipped = buildSkippedEntry({
        sample,
        approvedEntry,
        blockedEntry,
        warningEntry,
        identity,
        outputPaths,
        reasonCode: "not_in_approved_source_manifest",
      });
      skippedEntries.push(skipped);
      processedRecords.push({ ...skipped, status: "skipped" });
      continue;
    }

    const started = performance.now();
    const sourceAbsolutePath = path.join(repoRoot, ...sourcePath.split("/"));
    let sourceStatBefore = null;
    try {
      sourceStatBefore = await stat(sourceAbsolutePath);
      await mkdir(path.dirname(outputPaths.svgAbsolutePath), { recursive: true });
      await mkdir(path.dirname(outputPaths.pngAbsolutePath), { recursive: true });
      await mkdir(path.dirname(outputPaths.thumbAbsolutePath), { recursive: true });

      const conversionRecord = await (options.converter || defaultConverter)({
        repoRoot,
        runtime,
        inputPath: sourceAbsolutePath,
        preset,
        sample: enrichSampleForConversion(sample, approvedEntry, warningEntry, identity),
        outputPaths,
        logPath,
      });

      await (options.createThumbnail || createThumbnail)({
        runtime,
        outputPaths,
      });

      const timingMs = Math.round(performance.now() - started);
      const validation = await validateOutputFiles({
        sourceEntry: approvedEntry,
        conversionRecord,
        outputPaths,
        runtime,
        thresholds,
        inspectPng: options.inspectPng || inspectPng,
        measurePng: options.measurePng || measurePng,
      });
      const sourceStatAfter = await stat(sourceAbsolutePath);
      if (sourceStatBefore.size !== sourceStatAfter.size || Number(sourceStatBefore.mtimeMs) !== Number(sourceStatAfter.mtimeMs)) {
        validation.reasonCodes.push("source_image_modified_during_dry_run");
      }

      if (validation.reasonCodes.length) {
        const entry = buildQuarantineEntry({
          sample,
          approvedEntry,
          warningEntry,
          identity,
          outputPaths,
          stage: validation.failureStage,
          reasonCodes: validation.reasonCodes,
          errorSummary: validation.errorSummary,
          timingMs,
        });
        await writeQuarantineMarker({ dryRunRoot, entry });
        quarantineEntries.push(entry);
        processedRecords.push({ ...entry, status: "quarantined_for_now" });
        continue;
      }

      const asset = buildAssetRecord({
        sample,
        approvedEntry,
        warningEntry,
        identity,
        outputPaths,
        preset,
        conversionRecord,
        validation,
        timingMs,
      });
      passedAssets.push(asset);
      processedRecords.push(asset);
    } catch (error) {
      const timingMs = Math.round(performance.now() - started);
      const entry = buildQuarantineEntry({
        sample,
        approvedEntry,
        warningEntry,
        identity,
        outputPaths,
        stage: classifyErrorStage(error),
        reasonCodes: [reasonCodeFromError(error)],
        errorSummary: String(error?.message || error),
        timingMs,
      });
      await writeQuarantineMarker({ dryRunRoot, entry });
      quarantineEntries.push(entry);
      processedRecords.push({ ...entry, status: "quarantined_for_now" });
    }
  }

  passedAssets.sort(compareByAssetId);
  quarantineEntries.sort(compareBySourcePath);
  skippedEntries.sort(compareBySourcePath);

  const results = buildResultsManifest({
    inputState,
    passedAssets,
    quarantineEntries,
    skippedEntries,
    processedRecords,
    preset,
  });
  const assets = buildAssetsManifest({ inputState, passedAssets, preset });
  const quarantine = buildQuarantineManifest({ inputState, quarantineEntries, skippedEntries, preset });
  const gallery = buildGallerySampleManifest({ assets: passedAssets, categorySummary: inputState.manifests.categorySummary });
  const outputSpec = buildOutputSpecManifest({ inputState, preset });

  await writeRound3BManifests({
    repoRoot,
    dryRunRoot,
    manifests: { results, assets, quarantine, gallery, outputSpec },
  });
  await writeReviewArtifacts({
    repoRoot,
    dryRunRoot,
    assets: passedAssets,
    quarantineEntries,
    skippedEntries,
    processedRecords,
  });
  await writeRound3BReports({
    repoRoot,
    dryRunRoot,
    manifests: { results, assets, quarantine, gallery, outputSpec },
  });

  return { results, assets, quarantine, gallery, outputSpec };
}

function buildInputStateFromManifests({ repoRoot, manifests }) {
  const preset = manifests.preset || findPolicyPreset(manifests.policy, manifests.presetInventory);
  if (!preset?.presetId) {
    throw new Error("Round 3B blocker: recommended line-thick preset is missing.");
  }
  if (manifests.policy?.defaultPreset?.presetId !== "line-thick" || preset.presetId !== "line-thick") {
    throw new Error("Round 3B blocker: recommended policy is not line-thick.");
  }

  const validation = validateDryRunSamples({
    sample: manifests.sample,
    approved: manifests.approved,
    blocked: manifests.blocked,
    warnings: manifests.warnings,
  });

  const sampleEntries = manifests.sample?.samples || [];
  return {
    repoRoot,
    manifests: { ...manifests, preset },
    validation,
    counts: {
      approvedCandidates: manifests.approved?.entries?.length || 0,
      blockedSources: manifests.blocked?.entries?.length || 0,
      warningSources: manifests.warnings?.entries?.length || 0,
      dryRunSampleSize: sampleEntries.length,
      warningDryRunImages: validation.warningApprovedPaths.length,
    },
    policy: manifests.policy,
    conversionWrapper: CONVERSION_WRAPPER,
  };
}

function findPolicyPreset(policy, presetInventory) {
  const presetId = policy?.defaultPreset?.presetId;
  const preset = (presetInventory?.presets || []).find((candidate) => candidate.presetId === presetId);
  if (preset) return preset;
  if (presetId === "line-thick") {
    return {
      presetId: "line-thick",
      presetName: policy.defaultPreset.presetName || "Lineart - Thick",
      relevantParameters: {
        traceMode: "single",
        preprocess: "none",
        threshold: 206,
        turdSize: 4,
        optTolerance: 0.44,
        turnPolicy: "black",
      },
    };
  }
  return null;
}

async function prepareDryRunFolders({ dryRunRoot, resetOutputRoot }) {
  if (resetOutputRoot) {
    await rm(dryRunRoot, { recursive: true, force: true });
  }
  for (const subdir of DRY_RUN_SUBDIRS) {
    await mkdir(path.join(dryRunRoot, ...subdir.split("/")), { recursive: true });
  }
}

function buildOutputPaths({ repoRoot, identity }) {
  return {
    svgRelativePath: identity.svgRelativePath,
    pngRelativePath: identity.pngRelativePath,
    thumbRelativePath: identity.thumbRelativePath,
    svgAbsolutePath: path.join(repoRoot, ...identity.svgRelativePath.split("/")),
    pngAbsolutePath: path.join(repoRoot, ...identity.pngRelativePath.split("/")),
    thumbAbsolutePath: path.join(repoRoot, ...identity.thumbRelativePath.split("/")),
  };
}

async function defaultConverter({ inputPath, preset, sample, outputPaths, logPath, runtime }) {
  const result = await runSingleConversion({
    inputPath,
    preset,
    outputSvgPath: outputPaths.svgAbsolutePath,
    outputPreviewPath: outputPaths.pngAbsolutePath,
    logPath,
    runtime,
    sample,
    stage: "round-3b-production-dry-run",
  });
  if (result.status !== "success") {
    const error = new Error(result.error || "conversion failed");
    error.stage = "conversion";
    error.reasonCode = "conversion_failed";
    throw error;
  }
  return result;
}

async function createThumbnail({ runtime, outputPaths }) {
  try {
    const buffer = await runtime.sharp(outputPaths.pngAbsolutePath, { limitInputPixels: false })
      .flatten({ background: "#ffffff" })
      .resize({
        width: 320,
        height: 320,
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
    await mkdir(path.dirname(outputPaths.thumbAbsolutePath), { recursive: true });
    await writeFile(outputPaths.thumbAbsolutePath, buffer);
  } catch (error) {
    error.stage = "preview";
    error.reasonCode = "thumbnail_failed";
    throw error;
  }
}

async function validateOutputFiles({
  sourceEntry,
  conversionRecord,
  outputPaths,
  runtime,
  thresholds,
  inspectPng: inspectPngFn,
  measurePng: measurePngFn,
}) {
  const reasonCodes = [];
  let failureStage = "qa";
  let errorSummary = "";
  const svgText = await readFile(outputPaths.svgAbsolutePath, "utf8").catch(() => null);
  const svgStat = await stat(outputPaths.svgAbsolutePath).catch(() => null);
  const pngStat = await stat(outputPaths.pngAbsolutePath).catch(() => null);
  const thumbStat = await stat(outputPaths.thumbAbsolutePath).catch(() => null);

  if (!svgStat) reasonCodes.push("svg_missing");
  if (svgStat && svgStat.size <= 0) reasonCodes.push("svg_empty");
  if (svgStat && svgStat.size > 0 && svgStat.size < thresholds.minimumSvgBytes) reasonCodes.push("svg_tiny");
  if (!pngStat) reasonCodes.push("png_preview_missing");
  if (pngStat && pngStat.size <= 0) reasonCodes.push("png_preview_empty");
  if (!thumbStat) reasonCodes.push("thumbnail_missing");
  if (thumbStat && thumbStat.size <= 0) reasonCodes.push("thumbnail_empty");

  let svgInfo = null;
  if (svgText) {
    svgInfo = inspectSvg(svgText);
    if (!svgInfo.isSvg) reasonCodes.push("svg_not_parseable");
    if (!svgInfo.hasDimensions) reasonCodes.push("svg_missing_dimensions");
    if (svgInfo.width && svgInfo.width < thresholds.minimumRasterDimension) reasonCodes.push("output_dimensions_invalid");
    if (svgInfo.height && svgInfo.height < thresholds.minimumRasterDimension) reasonCodes.push("output_dimensions_invalid");
  }

  let pngInfo = null;
  let thumbInfo = null;
  let pngStats = null;
  try {
    pngInfo = await inspectPngFn(outputPaths.pngAbsolutePath, runtime);
    pngStats = await measurePngFn(outputPaths.pngAbsolutePath, runtime);
  } catch (error) {
    reasonCodes.push("png_preview_unreadable");
    failureStage = "preview";
    errorSummary = String(error?.message || error);
  }
  try {
    thumbInfo = await inspectPngFn(outputPaths.thumbAbsolutePath, runtime);
  } catch (error) {
    reasonCodes.push("thumbnail_unreadable");
    failureStage = "preview";
    errorSummary ||= String(error?.message || error);
  }

  if (pngInfo && (!pngInfo.width || !pngInfo.height || pngInfo.width < thresholds.minimumRasterDimension || pngInfo.height < thresholds.minimumRasterDimension)) {
    reasonCodes.push("png_preview_dimensions_invalid");
  }
  if (thumbInfo && (!thumbInfo.width || !thumbInfo.height || thumbInfo.width < thresholds.minimumRasterDimension || thumbInfo.height < thresholds.minimumRasterDimension)) {
    reasonCodes.push("thumbnail_dimensions_invalid");
  }

  const darkPixelRatio = Number(pngStats?.darkPixelRatio ?? conversionRecord?.metrics?.darkPixelRatio ?? 0);
  const pathCount = Number(svgInfo?.pathCount ?? conversionRecord?.metrics?.pathCount ?? 0);
  const svgBytes = Number(svgStat?.size || conversionRecord?.metrics?.svgBytes || 0);
  if (darkPixelRatio < thresholds.minimumDarkPixelRatio) reasonCodes.push("blank_or_nearly_blank_output");
  if (darkPixelRatio > thresholds.maximumDarkPixelRatio) reasonCodes.push("overfilled_or_overly_dark_output");
  if (pathCount > thresholds.maximumPathCountPreferred || svgBytes > thresholds.maximumSvgBytesPreferred) {
    reasonCodes.push("excessive_svg_complexity");
  }
  if (pathCount > Math.round(thresholds.maximumPathCountPreferred * 0.9) && darkPixelRatio > 0.24) {
    reasonCodes.push("too_noisy_or_speckled_heuristic");
  }
  if (
    sourceEntry?.fileSizeBytes &&
    svgBytes > thresholds.maximumSvgBytesPreferred &&
    svgBytes > Number(sourceEntry.fileSizeBytes) * 3
  ) {
    reasonCodes.push("output_extremely_large_relative_to_source");
  }

  const criticalScoreFlags = new Set([
    "render_failed",
    "blank_or_missing_subject",
    "overfilled_or_blobbed_output",
    "excessive_svg_complexity",
  ]);
  for (const flag of conversionRecord?.score?.flags || []) {
    if (criticalScoreFlags.has(flag)) reasonCodes.push(flag);
  }

  return {
    reasonCodes: unique(reasonCodes),
    failureStage,
    errorSummary: errorSummary || unique(reasonCodes).join(", "),
    svgInfo,
    pngInfo,
    thumbInfo,
    pngStats,
    svgFileSizeBytes: svgStat?.size || 0,
    pngFileSizeBytes: pngStat?.size || 0,
    thumbnailFileSizeBytes: thumbStat?.size || 0,
  };
}

async function inspectPng(filePath, runtime) {
  const info = await runtime.sharp(filePath, { limitInputPixels: false }).metadata();
  return {
    width: Number(info.width || 0),
    height: Number(info.height || 0),
    format: info.format || null,
    sizeBytes: (await stat(filePath)).size,
  };
}

async function measurePng(filePath, runtime) {
  const raw = await runtime.sharp(filePath, { limitInputPixels: false })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (const value of raw.data) {
    if (value < 190) dark += 1;
  }
  return {
    darkPixelRatio: round(dark / Math.max(1, raw.data.length), 5),
  };
}

function inspectSvg(svgText) {
  const viewBoxMatch = svgText.match(/\bviewBox=["']([^"']+)["']/i);
  const widthMatch = svgText.match(/\bwidth=["']([0-9.]+)/i);
  const heightMatch = svgText.match(/\bheight=["']([0-9.]+)/i);
  let width = widthMatch ? Number(widthMatch[1]) : null;
  let height = heightMatch ? Number(heightMatch[1]) : null;
  if ((!width || !height) && viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4) {
      width = parts[2];
      height = parts[3];
    }
  }
  return {
    isSvg: /<svg[\s>]/i.test(svgText),
    hasDimensions: Boolean(viewBoxMatch || (width && height)),
    width,
    height,
    viewBox: viewBoxMatch?.[1] || null,
    pathCount: (svgText.match(/<path\b/gi) || []).length,
  };
}

function enrichSampleForConversion(sample, approvedEntry, warningEntry, identity) {
  return {
    ...sample,
    ...approvedEntry,
    sampleId: sample.dryRunSampleId || identity.assetId,
    likelyHumanAdjacent: Boolean(approvedEntry.highRiskCategory || sample.highRiskCategory),
    warningCodes: warningEntry?.warningCodes || approvedEntry.warningCodes || sample.warningCodes || [],
  };
}

function buildAssetRecord({
  sample,
  approvedEntry,
  warningEntry,
  identity,
  outputPaths,
  preset,
  conversionRecord,
  validation,
  timingMs,
}) {
  const title = buildTitleCandidate(approvedEntry || sample);
  return {
    assetId: identity.assetId,
    sourceRelativePath: approvedEntry.sourceRelativePath,
    originalCategory: approvedEntry.category,
    categorySlug: identity.categorySlug,
    titleCandidate: title,
    displayNameCandidate: title,
    altTextCandidate: `${title} coloring page`,
    filenameSlug: identity.filenameSlug,
    svgPath: outputPaths.svgRelativePath,
    pngPreviewPath: outputPaths.pngRelativePath,
    thumbnailPath: outputPaths.thumbRelativePath,
    sourceDimensions: approvedEntry.dimensions || null,
    outputDimensions: {
      svg: {
        width: validation.svgInfo?.width || conversionRecord?.metrics?.width || null,
        height: validation.svgInfo?.height || conversionRecord?.metrics?.height || null,
        viewBox: validation.svgInfo?.viewBox || null,
      },
      pngPreview: {
        width: validation.pngInfo?.width || null,
        height: validation.pngInfo?.height || null,
      },
      thumbnail: {
        width: validation.thumbInfo?.width || null,
        height: validation.thumbInfo?.height || null,
      },
    },
    svgFileSizeBytes: validation.svgFileSizeBytes,
    pngPreviewFileSizeBytes: validation.pngFileSizeBytes,
    thumbnailFileSizeBytes: validation.thumbnailFileSizeBytes,
    pathCount: validation.svgInfo?.pathCount ?? conversionRecord?.metrics?.pathCount ?? null,
    darkPixelRatio: validation.pngStats?.darkPixelRatio ?? conversionRecord?.metrics?.darkPixelRatio ?? null,
    conversionTimingMs: timingMs,
    presetPolicyUsed: {
      presetId: preset.presetId,
      presetName: preset.presetName,
      recommendationType: "single_default_preset",
    },
    round3a1WarningFlags: warningEntry?.warningCodes || approvedEntry.warningCodes || [],
    round3a1Status: approvedEntry.status,
    status: "passed_dry_run",
  };
}

function buildQuarantineEntry({
  sample,
  approvedEntry,
  warningEntry,
  identity,
  outputPaths,
  stage,
  reasonCodes,
  errorSummary,
  timingMs,
}) {
  return {
    sourceRelativePath: sample.sourceRelativePath,
    category: sample.category,
    assetId: identity.assetId,
    attemptedOutputPaths: {
      svgPath: outputPaths.svgRelativePath,
      pngPreviewPath: outputPaths.pngRelativePath,
      thumbnailPath: outputPaths.thumbRelativePath,
    },
    failureStage: stage,
    reasonCodes: unique(reasonCodes),
    errorSummary: String(errorSummary || unique(reasonCodes).join(", ")).slice(0, 600),
    round3a1WarningFlags: warningEntry?.warningCodes || approvedEntry?.warningCodes || sample.warningCodes || [],
    conversionTimingMs: timingMs,
    status: "quarantined_for_now",
  };
}

function buildSkippedEntry({
  sample,
  approvedEntry,
  blockedEntry,
  warningEntry,
  identity,
  outputPaths,
  reasonCode,
}) {
  return {
    sourceRelativePath: sample.sourceRelativePath,
    category: sample.category,
    assetId: identity.assetId,
    attemptedOutputPaths: {
      svgPath: outputPaths.svgRelativePath,
      pngPreviewPath: outputPaths.pngRelativePath,
      thumbnailPath: outputPaths.thumbRelativePath,
    },
    failureStage: "input-validation",
    reasonCodes: [reasonCode],
    errorSummary: blockedEntry
      ? "Dry-run source appears in the blocked-source manifest and was skipped."
      : "Dry-run source is not present in the approved-source manifest and was skipped.",
    round3a1WarningFlags: warningEntry?.warningCodes || approvedEntry?.warningCodes || sample.warningCodes || [],
    status: "skipped",
  };
}

async function writeQuarantineMarker({ dryRunRoot, entry }) {
  const stageFolder = {
    conversion: "conversion-failed",
    qa: "qa-failed",
    metadata: "metadata-failed",
    preview: "preview-failed",
    "input-validation": "metadata-failed",
  }[entry.failureStage] || "qa-failed";
  const markerPath = path.join(dryRunRoot, "quarantine", stageFolder, `${entry.assetId}.json`);
  await writeJson(markerPath, entry);
}

function buildResultsManifest({
  inputState,
  passedAssets,
  quarantineEntries,
  skippedEntries,
  processedRecords,
  preset,
}) {
  const sampleEntries = inputState.manifests.sample.samples || [];
  const allFailures = [...quarantineEntries, ...skippedEntries];
  return {
    generatedAt: ROUND3B_GENERATED_AT,
    runId: ROUND3B_RUN_ID,
    dryRunOnly: true,
    fullApprovedCorpusProcessed: false,
    sourceManifest: INPUT_PATHS.approved,
    blockedManifest: INPUT_PATHS.blocked,
    warningManifest: INPUT_PATHS.warnings,
    dryRunSampleManifest: INPUT_PATHS.sample,
    totalApprovedCandidateCount: inputState.counts.approvedCandidates,
    totalBlockedSourceCount: inputState.counts.blockedSources,
    totalWarningSourceCount: inputState.counts.warningSources,
    totalRequested: sampleEntries.length,
    totalProcessed: passedAssets.length + quarantineEntries.length,
    totalPassed: passedAssets.length,
    totalQuarantined: quarantineEntries.length,
    totalSkipped: skippedEntries.length,
    warningImageCount: inputState.counts.warningDryRunImages,
    countsByCategory: buildCategoryCounts(sampleEntries, passedAssets, quarantineEntries, skippedEntries),
    countsByFailureReason: countValues(allFailures.flatMap((entry) => entry.reasonCodes || [])),
    presetPolicyUsed: {
      recommendationType: inputState.manifests.policy.recommendationType,
      presetId: preset.presetId,
      presetName: preset.presetName,
      relevantParameters: preset.relevantParameters || {},
    },
    conversionWrapperUsed: CONVERSION_WRAPPER,
    validation: inputState.validation,
    representativeOutputExamples: passedAssets.slice(0, 8).map((asset) => ({
      assetId: asset.assetId,
      category: asset.originalCategory,
      svgPath: asset.svgPath,
      pngPreviewPath: asset.pngPreviewPath,
      thumbnailPath: asset.thumbnailPath,
    })),
    records: processedRecords.map((record) => ({
      sourceRelativePath: record.sourceRelativePath,
      category: record.originalCategory || record.category,
      assetId: record.assetId,
      status: record.status,
      reasonCodes: record.reasonCodes || [],
      warningFlags: record.round3a1WarningFlags || [],
    })),
  };
}

function buildAssetsManifest({ inputState, passedAssets, preset }) {
  return {
    generatedAt: ROUND3B_GENERATED_AT,
    runId: ROUND3B_RUN_ID,
    sourceManifest: INPUT_PATHS.sample,
    approvedManifest: INPUT_PATHS.approved,
    blockedManifest: INPUT_PATHS.blocked,
    warningManifest: INPUT_PATHS.warnings,
    namingConvention: "category-slug/source-slug-stableid.ext with assetId category-slug__source-slug__stableid",
    presetPolicyUsed: {
      recommendationType: inputState.manifests.policy.recommendationType,
      presetId: preset.presetId,
      presetName: preset.presetName,
      relevantParameters: preset.relevantParameters || {},
    },
    totalAssets: passedAssets.length,
    assets: passedAssets,
  };
}

function buildQuarantineManifest({ inputState, quarantineEntries, skippedEntries, preset }) {
  return {
    generatedAt: ROUND3B_GENERATED_AT,
    runId: ROUND3B_RUN_ID,
    sourceManifest: INPUT_PATHS.sample,
    approvedManifest: INPUT_PATHS.approved,
    blockedManifest: INPUT_PATHS.blocked,
    warningManifest: INPUT_PATHS.warnings,
    presetPolicyUsed: {
      presetId: preset.presetId,
      presetName: preset.presetName,
    },
    totalQuarantined: quarantineEntries.length,
    totalSkipped: skippedEntries.length,
    countsByFailureReason: countValues([...quarantineEntries, ...skippedEntries].flatMap((entry) => entry.reasonCodes || [])),
    entries: quarantineEntries,
    skipped: skippedEntries,
    note:
      "Quarantine is an automated dry-run gate only. It is not a final human aesthetic review.",
  };
}

function buildGallerySampleManifest({ assets, categorySummary }) {
  const categoryTitles = new Map(
    (categorySummary?.categories || []).map((category) => [
      category.categorySlug || slug(category.categoryName),
      category.categoryName,
    ]),
  );
  const groups = groupBy(assets, (asset) => asset.categorySlug);
  return {
    generatedAt: ROUND3B_GENERATED_AT,
    runId: ROUND3B_RUN_ID,
    noIndexablePerImageRoutes: true,
    intendedConsumer: "future Next.js hub and gallery data, not per-image HTML pages",
    categories: [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categorySlug, items]) => ({
        category: items[0]?.originalCategory || categoryTitles.get(categorySlug) || categorySlug,
        categorySlug,
        categoryTitle: titleCase(categoryTitles.get(categorySlug) || items[0]?.originalCategory || categorySlug),
        imageCount: items.length,
        sampleItemIds: items.map((item) => item.assetId),
        items: items.map((item) => ({
          assetId: item.assetId,
          sourceRelativePath: item.sourceRelativePath,
          assetPaths: {
            svg: item.svgPath,
            pngPreview: item.pngPreviewPath,
            thumbnail: item.thumbnailPath,
          },
          altTextCandidate: item.altTextCandidate,
          titleCandidate: item.titleCandidate,
          downloadAvailable: true,
          printAvailable: true,
          indexablePerImageRoute: false,
          warningFlags: item.round3a1WarningFlags || [],
        })),
      })),
  };
}

function buildOutputSpecManifest({ inputState, preset }) {
  const policySpec = inputState.manifests.policy.productionReadyOutputSpec || {};
  return {
    generatedAt: ROUND3B_GENERATED_AT,
    runId: ROUND3B_RUN_ID,
    sourceManifestRequirement:
      "Production exporters must consume the latest approved-source manifest, currently pipeline/manifests/round-3a1-approved-source-images.json or a later explicit replacement.",
    blockedManifestExclusion:
      "Any source path in the latest blocked-source manifest, currently pipeline/manifests/round-3a1-blocked-source-images.json, must be excluded unless restored by a later explicit approval manifest.",
    warningPolicy:
      "Warning images remain eligible when they are present in the approved-source manifest. Warning flags must be preserved in metadata and review sheets.",
    dryRunInputRequirement:
      "Round 3B uses only pipeline/manifests/round-3a1-approved-production-dry-run-sample.json. It must not process the full approved corpus.",
    conversionPolicy: {
      recommendationType: inputState.manifests.policy.recommendationType,
      presetId: preset.presetId,
      presetName: preset.presetName,
      relevantParameters: preset.relevantParameters || {},
      wrapper: CONVERSION_WRAPPER,
    },
    svgExpectations: policySpec.svgExpectations || [
      "Valid SVG with viewBox or width and height.",
      "Black or near-black linework on transparent or white background.",
      "Readable subject with no blank or overfilled output.",
      "Manageable file size and path count for gallery use.",
    ],
    pngPreviewExpectations: policySpec.pngPreviewExpectations || [
      "White-background PNG preview rendered from the SVG.",
      "Preview should match normalized SVG bounds.",
    ],
    thumbnailExpectations: [
      "Readable PNG thumbnail generated from the preview.",
      "Stable path beside the preview under pipeline/production/dry-run/assets/thumbs/ for dry runs.",
    ],
    namingConvention: {
      assetId: "category-slug__source-slug__10-char-source-path-sha256",
      svg: "pipeline/production/dry-run/assets/svg/category-slug/source-slug-stableid.svg",
      pngPreview: "pipeline/production/dry-run/assets/png/category-slug/source-slug-stableid.png",
      thumbnail: "pipeline/production/dry-run/assets/thumbs/category-slug/source-slug-stableid-thumb.png",
      collisionHandling:
        "Stable IDs derive from source path, not original filename alone. Duplicate filenames with different content produce unique output paths.",
    },
    metadataFields: [
      "assetId",
      "sourceRelativePath",
      "originalCategory",
      "categorySlug",
      "titleCandidate",
      "filenameSlug",
      "svgPath",
      "pngPreviewPath",
      "thumbnailPath",
      "sourceDimensions",
      "outputDimensions",
      "file sizes",
      "presetPolicyUsed",
      "round3a1WarningFlags",
      "status",
    ],
    galleryDataFields: [
      "categories",
      "categorySlug",
      "categoryTitle",
      "imageCount",
      "sampleItemIds",
      "assetPaths",
      "altTextCandidate",
      "titleCandidate",
      "downloadAvailable",
      "printAvailable",
      "warningFlags",
      "indexablePerImageRoute=false",
    ],
    quarantineCriteria: [
      "conversion_failed",
      "svg_missing",
      "svg_empty",
      "svg_tiny",
      "svg_not_parseable",
      "svg_missing_dimensions",
      "png_preview_missing",
      "png_preview_unreadable",
      "thumbnail_missing",
      "thumbnail_unreadable",
      "output_dimensions_invalid",
      "blank_or_nearly_blank_output",
      "overfilled_or_overly_dark_output",
      "excessive_svg_complexity",
      "too_noisy_or_speckled_heuristic",
      "output_extremely_large_relative_to_source",
      "metadata_failed",
    ],
    rerunResumeBehavior:
      "The dry run clears and rewrites only pipeline/production/dry-run generated folders, then writes deterministic asset paths and manifests. Source images are read-only.",
    manualReviewBeforeFullProduction: [
      "Inspect before/after, category, quarantine, and warning contact sheets.",
      "Confirm line-thick output quality on human-adjacent and high-detail categories.",
      "Review any quarantined reasons and adjust thresholds or preset policy before a full approved-corpus export.",
      "Approve CDN/final asset storage policy before copying anything into a public web app.",
    ],
  };
}

async function writeRound3BManifests({ repoRoot, dryRunRoot, manifests }) {
  const pairs = [
    [ROUND3B_PROJECT_MANIFESTS[0], manifests.results],
    [ROUND3B_PROJECT_MANIFESTS[1], manifests.assets],
    [ROUND3B_PROJECT_MANIFESTS[2], manifests.quarantine],
    [ROUND3B_PROJECT_MANIFESTS[3], manifests.gallery],
    [ROUND3B_PROJECT_MANIFESTS[4], manifests.outputSpec],
  ];
  for (const [repoRelativePath, data] of pairs) {
    await writeJson(path.join(repoRoot, ...repoRelativePath.split("/")), data);
    await writeJson(path.join(dryRunRoot, "manifests", path.basename(repoRelativePath)), data);
  }
}

async function writeRound3BReports({ repoRoot, dryRunRoot, manifests }) {
  const reports = [
    [ROUND3B_PROJECT_REPORTS[0], buildDryRunReport(manifests)],
    [ROUND3B_PROJECT_REPORTS[1], buildOutputSpecReport(manifests.outputSpec)],
    [ROUND3B_PROJECT_REPORTS[2], buildQuarantineReport(manifests)],
    [ROUND3B_PROJECT_REPORTS[3], buildNextPhasePlan(manifests)],
  ];
  for (const [repoRelativePath, content] of reports) {
    await writeText(path.join(repoRoot, ...repoRelativePath.split("/")), content);
    await writeText(path.join(dryRunRoot, "reports", path.basename(repoRelativePath)), content);
  }
}

async function writeReviewArtifacts({ repoRoot, dryRunRoot, assets, quarantineEntries, skippedEntries, processedRecords }) {
  const contactDir = path.join(dryRunRoot, "review", "contact-sheets");
  const categoryDir = path.join(dryRunRoot, "review", "category-sheets");
  const quarantineDir = path.join(dryRunRoot, "review", "quarantine-sheets");

  await writeText(
    path.join(contactDir, "round-3b-before-after.html"),
    buildBeforeAfterHtml({ title: "Round 3B Before And After", repoRoot, fromDir: contactDir, assets }),
  );
  await writeText(
    path.join(contactDir, "round-3b-pass-fail.html"),
    buildPassFailHtml({ repoRoot, fromDir: contactDir, assets, quarantineEntries, skippedEntries }),
  );
  await writeText(
    path.join(contactDir, "round-3b-warning-images.html"),
    buildWarningHtml({
      repoRoot,
      fromDir: contactDir,
      records: processedRecords.filter((record) => (record.round3a1WarningFlags || []).length),
    }),
  );

  for (const [categorySlug, items] of groupBy(assets, (asset) => asset.categorySlug).entries()) {
    await writeText(
      path.join(categoryDir, `${categorySlug}.html`),
      buildBeforeAfterHtml({
        title: `Round 3B Category Sheet: ${titleCase(categorySlug)}`,
        repoRoot,
        fromDir: categoryDir,
        assets: items,
      }),
    );
  }

  await writeText(
    path.join(quarantineDir, "round-3b-quarantine.html"),
    buildQuarantineHtml({ repoRoot, fromDir: quarantineDir, quarantineEntries, skippedEntries }),
  );
}

function buildDryRunReport({ results, assets, quarantine, outputSpec }) {
  const topReasons = Object.entries(results.countsByFailureReason || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  return `# Round 3B Production Dry Run Report

Generated: ${ROUND3B_GENERATED_AT}

## Inputs

- Approved manifest used: \`${results.sourceManifest}\`
- Blocked manifest used: \`${results.blockedManifest}\`
- Warning manifest used: \`${results.warningManifest}\`
- Dry-run sample manifest used: \`${results.dryRunSampleManifest}\`
- Input sample size: ${results.totalRequested}
- Approved source count: ${results.totalApprovedCandidateCount}
- Blocked source count: ${results.totalBlockedSourceCount}
- Warning source count: ${results.totalWarningSourceCount}

## Conversion Policy

- Recommendation type: \`${results.presetPolicyUsed.recommendationType}\`
- Preset used: \`${results.presetPolicyUsed.presetId}\` (${results.presetPolicyUsed.presetName})
- Reusable conversion path: \`${results.conversionWrapperUsed.modulePath}#${results.conversionWrapperUsed.exportName}\`
- Underlying I Love SVG path: \`${results.conversionWrapperUsed.underlyingPath}\`
- Underlying functions: ${results.conversionWrapperUsed.underlyingFunctions.map((item) => `\`${item}()\``).join(", ")}

## Output Folder Structure

- \`pipeline/production/dry-run/assets/svg/\`
- \`pipeline/production/dry-run/assets/png/\`
- \`pipeline/production/dry-run/assets/thumbs/\`
- \`pipeline/production/dry-run/manifests/\`
- \`pipeline/production/dry-run/reports/\`
- \`pipeline/production/dry-run/logs/\`
- \`pipeline/production/dry-run/quarantine/\`
- \`pipeline/production/dry-run/review/contact-sheets/\`
- \`pipeline/production/dry-run/review/category-sheets/\`
- \`pipeline/production/dry-run/review/quarantine-sheets/\`

## Results

- Requested: ${results.totalRequested}
- Processed: ${results.totalProcessed}
- Passed: ${results.totalPassed}
- Quarantined: ${results.totalQuarantined}
- Skipped: ${results.totalSkipped}
- Warning-image count: ${results.warningImageCount}

## Pass And Quarantine Counts By Category

${categoryCountsTable(results.countsByCategory)}

## Top Quarantine Reasons

${topReasons.length ? topReasons.map(([reason, count]) => `- ${reason}: ${count}`).join("\n") : "- None"}

## Representative Output Examples

${results.representativeOutputExamples.length ? results.representativeOutputExamples.map((item) => `- ${item.assetId}: \`${item.svgPath}\`, \`${item.pngPreviewPath}\`, \`${item.thumbnailPath}\``).join("\n") : "- None"}

## Quality Readiness

This dry-run gate is automated and intentionally limited. It validates parseability, dimensions, preview readability, simple blank/overfilled heuristics, complexity, and deterministic metadata. It does not replace human aesthetic or anatomy review.

Recommendation: ${results.totalPassed > 0 && results.totalQuarantined === 0 ? "the sample passed the automated dry-run gate, but contact sheets still need human review before full-corpus export." : "review quarantined outputs and contact sheets before full-corpus export."}

## Review Artifacts

- \`pipeline/production/dry-run/review/contact-sheets/round-3b-before-after.html\`
- \`pipeline/production/dry-run/review/contact-sheets/round-3b-pass-fail.html\`
- \`pipeline/production/dry-run/review/contact-sheets/round-3b-warning-images.html\`
- \`pipeline/production/dry-run/review/category-sheets/\`
- \`pipeline/production/dry-run/review/quarantine-sheets/round-3b-quarantine.html\`

## Exact Rerun Commands

\`\`\`powershell
node --test pipeline\\tests\\round-3b-production-dry-run.test.mjs
node pipeline\\scripts\\round-3b-production-dry-run.mjs
\`\`\`

## Round 3C Recommendation

${buildRound3CRecommendation(results, assets, quarantine, outputSpec)}
`;
}

function buildOutputSpecReport(outputSpec) {
  return `# Round 3B Output Spec

Generated: ${ROUND3B_GENERATED_AT}

## Source Inputs

- ${outputSpec.sourceManifestRequirement}
- ${outputSpec.blockedManifestExclusion}
- ${outputSpec.warningPolicy}
- ${outputSpec.dryRunInputRequirement}

## Conversion Standard

- Preset: \`${outputSpec.conversionPolicy.presetId}\` (${outputSpec.conversionPolicy.presetName})
- Wrapper: \`${outputSpec.conversionPolicy.wrapper.modulePath}#${outputSpec.conversionPolicy.wrapper.exportName}\`
- Parameters: \`${JSON.stringify(outputSpec.conversionPolicy.relevantParameters)}\`

## SVG Expectations

${outputSpec.svgExpectations.map((item) => `- ${item}`).join("\n")}

## PNG Preview Expectations

${outputSpec.pngPreviewExpectations.map((item) => `- ${item}`).join("\n")}

## Thumbnail Expectations

${outputSpec.thumbnailExpectations.map((item) => `- ${item}`).join("\n")}

## Naming Convention

- Asset ID: \`${outputSpec.namingConvention.assetId}\`
- SVG path: \`${outputSpec.namingConvention.svg}\`
- PNG preview path: \`${outputSpec.namingConvention.pngPreview}\`
- Thumbnail path: \`${outputSpec.namingConvention.thumbnail}\`
- Collision handling: ${outputSpec.namingConvention.collisionHandling}

## Metadata Fields

${outputSpec.metadataFields.map((item) => `- ${item}`).join("\n")}

## Gallery Data Fields

${outputSpec.galleryDataFields.map((item) => `- ${item}`).join("\n")}

## Quarantine Criteria

${outputSpec.quarantineCriteria.map((item) => `- ${item}`).join("\n")}

## Rerun Behavior

${outputSpec.rerunResumeBehavior}

## Manual Review Before Full Production

${outputSpec.manualReviewBeforeFullProduction.map((item) => `- ${item}`).join("\n")}
`;
}

function buildQuarantineReport({ results, quarantine }) {
  return `# Round 3B Quarantine Report

Generated: ${ROUND3B_GENERATED_AT}

- Quarantined: ${quarantine.totalQuarantined}
- Skipped: ${quarantine.totalSkipped}

## Counts By Failure Reason

${Object.entries(quarantine.countsByFailureReason || {}).length ? Object.entries(quarantine.countsByFailureReason).sort(([, a], [, b]) => b - a).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") : "- None"}

## Quarantined Sources

${quarantine.entries.length ? quarantine.entries.map((entry) => `- ${entry.sourceRelativePath}: ${entry.reasonCodes.join(", ")} (${entry.failureStage})`).join("\n") : "- None"}

## Skipped Sources

${quarantine.skipped.length ? quarantine.skipped.map((entry) => `- ${entry.sourceRelativePath}: ${entry.reasonCodes.join(", ")} (${entry.failureStage})`).join("\n") : "- None"}

## Category Summary

${categoryCountsTable(results.countsByCategory)}

This report is an automated production dry-run gate. It is not a final human aesthetic review.
`;
}

function buildNextPhasePlan({ results }) {
  return `# Round 3B Next Phase Plan

Generated: ${ROUND3B_GENERATED_AT}

## Current State

- Dry-run input count: ${results.totalRequested}
- Passed: ${results.totalPassed}
- Quarantined: ${results.totalQuarantined}
- Skipped: ${results.totalSkipped}
- Warning-image count: ${results.warningImageCount}

## Before Round 3C

1. Review \`pipeline/production/dry-run/review/contact-sheets/round-3b-before-after.html\`.
2. Review category sheets for high-volume and human-adjacent categories.
3. Review warning-image contact sheets and preserve warning metadata in the future gallery data.
4. Review quarantine reasons and decide whether the line-thick thresholds need adjustment.
5. Confirm the final asset storage policy before any public website build or CDN publish step.

## Exact Round 3C Recommendation

${results.totalSkipped === 0 && results.totalQuarantined === 0
    ? "Proceed to a full approved-corpus exporter only after human review of the Round 3B contact sheets. The Round 3C prompt should explicitly consume pipeline/manifests/round-3a1-approved-source-images.json, exclude pipeline/manifests/round-3a1-blocked-source-images.json, preserve warning metadata, use the line-thick policy, write outputs outside public/, and stop on any unexpected blocked overlap."
    : "Do not run the full approved-corpus export yet. First inspect and resolve the Round 3B quarantine or skip reasons, then rerun Round 3B until the sample gate is acceptable."}

## Exact Commands

\`\`\`powershell
node --test pipeline\\tests\\round-3b-production-dry-run.test.mjs
node pipeline\\scripts\\round-3b-production-dry-run.mjs
\`\`\`
`;
}

function buildRound3CRecommendation(results) {
  if (results.totalSkipped > 0 || results.totalQuarantined > 0) {
    return "Round 3C is not ready. Resolve the skipped or quarantined dry-run items first, then rerun Round 3B.";
  }
  return "Round 3C can be drafted after human review of the dry-run contact sheets. The full export should still process only the approved manifest, exclude the blocked manifest, preserve warnings, and keep generated assets outside the Next.js public folder until the asset policy is approved.";
}

function buildBeforeAfterHtml({ title, repoRoot, fromDir, assets }) {
  const rows = assets.map((asset) => `
<tr>
  <th><div>${escapeHtml(asset.assetId)}</div><div>${escapeHtml(asset.originalCategory)}</div><div>${escapeHtml(asset.sourceRelativePath)}</div></th>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.sourceRelativePath))}" alt=""></td>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.svgPath))}" alt=""></td>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.pngPreviewPath))}" alt=""></td>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.thumbnailPath))}" alt=""></td>
  <td>${escapeHtml((asset.round3a1WarningFlags || []).join(", "))}</td>
</tr>`).join("\n");
  return htmlPage(title, `
<table>
<thead><tr><th>Item</th><th>Source</th><th>SVG Render</th><th>PNG Preview</th><th>Thumbnail</th><th>Warnings</th></tr></thead>
<tbody>${rows}</tbody>
</table>`);
}

function buildPassFailHtml({ repoRoot, fromDir, assets, quarantineEntries, skippedEntries }) {
  const passRows = assets.map((asset) => `
<tr><td>pass</td><td>${escapeHtml(asset.assetId)}</td><td>${escapeHtml(asset.sourceRelativePath)}</td><td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.pngPreviewPath))}" alt=""></td><td>${escapeHtml((asset.round3a1WarningFlags || []).join(", "))}</td></tr>`).join("\n");
  const failRows = [...quarantineEntries, ...skippedEntries].map((entry) => `
<tr><td>${escapeHtml(entry.status)}</td><td>${escapeHtml(entry.assetId)}</td><td>${escapeHtml(entry.sourceRelativePath)}</td><td>${escapeHtml((entry.reasonCodes || []).join(", "))}</td><td>${escapeHtml((entry.round3a1WarningFlags || []).join(", "))}</td></tr>`).join("\n");
  return htmlPage("Round 3B Pass Fail", `
<h2>Passed</h2>
<table><tbody>${passRows}</tbody></table>
<h2>Quarantined Or Skipped</h2>
<table><tbody>${failRows}</tbody></table>`);
}

function buildWarningHtml({ repoRoot, fromDir, records }) {
  const rows = records.map((record) => {
    const previewPath = record.pngPreviewPath || record.attemptedOutputPaths?.pngPreviewPath || null;
    return `
<tr><td>${escapeHtml(record.status)}</td><td>${escapeHtml(record.assetId)}</td><td>${escapeHtml(record.sourceRelativePath)}</td><td>${previewPath ? `<img src="${escapeHtml(relativeFrom(fromDir, repoRoot, previewPath))}" alt="">` : ""}</td><td>${escapeHtml((record.round3a1WarningFlags || []).join(", "))}</td></tr>`;
  }).join("\n");
  return htmlPage("Round 3B Warning Images", `<table><tbody>${rows}</tbody></table>`);
}

function buildQuarantineHtml({ repoRoot, fromDir, quarantineEntries, skippedEntries }) {
  const rows = [...quarantineEntries, ...skippedEntries].map((entry) => `
<tr>
  <th><div>${escapeHtml(entry.assetId)}</div><div>${escapeHtml(entry.sourceRelativePath)}</div></th>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, entry.sourceRelativePath))}" alt=""></td>
  <td>${escapeHtml(entry.failureStage)}</td>
  <td>${escapeHtml((entry.reasonCodes || []).join(", "))}</td>
  <td>${escapeHtml(entry.errorSummary)}</td>
</tr>`).join("\n");
  return htmlPage("Round 3B Quarantine", `<table><tbody>${rows}</tbody></table>`);
}

function htmlPage(title, body) {
  return `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; font-size: 13px; }
img { max-width: 220px; max-height: 220px; background: #fff; border: 1px solid #e5e7eb; }
h1, h2 { margin: 0 0 16px; }
</style>
<h1>${escapeHtml(title)}</h1>
${body}`;
}

function buildCategoryCounts(sampleEntries, passedAssets, quarantineEntries, skippedEntries) {
  const categories = new Map();
  for (const sample of sampleEntries) {
    const category = sample.category || "uncategorized";
    if (!categories.has(category)) {
      categories.set(category, {
        requested: 0,
        processed: 0,
        passed: 0,
        quarantined: 0,
        skipped: 0,
        warningImages: 0,
      });
    }
    const counts = categories.get(category);
    counts.requested += 1;
    if ((sample.warningCodes || []).length || sample.status === "approved_with_warning") counts.warningImages += 1;
  }
  for (const asset of passedAssets) {
    const counts = ensureCategoryCounts(categories, asset.originalCategory);
    counts.passed += 1;
    counts.processed += 1;
  }
  for (const entry of quarantineEntries) {
    const counts = ensureCategoryCounts(categories, entry.category);
    counts.quarantined += 1;
    counts.processed += 1;
  }
  for (const entry of skippedEntries) {
    const counts = ensureCategoryCounts(categories, entry.category);
    counts.skipped += 1;
  }
  return Object.fromEntries([...categories.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function categoryCountsTable(countsByCategory) {
  const rows = Object.entries(countsByCategory || {});
  if (!rows.length) return "- None";
  return `| Category | Requested | Passed | Quarantined | Skipped | Warnings |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows.map(([category, counts]) => `| ${escapeMarkdown(category)} | ${counts.requested} | ${counts.passed} | ${counts.quarantined} | ${counts.skipped} | ${counts.warningImages} |`).join("\n")}`;
}

function ensureCategoryCounts(categories, category) {
  const key = category || "uncategorized";
  if (!categories.has(key)) {
    categories.set(key, { requested: 0, processed: 0, passed: 0, quarantined: 0, skipped: 0, warningImages: 0 });
  }
  return categories.get(key);
}

function getThresholds(policy) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...(policy?.productionReadyOutputSpec?.passThresholds || {}),
  };
}

function classifyErrorStage(error) {
  return error?.stage || "conversion";
}

function reasonCodeFromError(error) {
  return error?.reasonCode || (classifyErrorStage(error) === "preview" ? "preview_failed" : "conversion_failed");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rm(filePath, { force: true });
  await writeFile(filePath, await readFile(`${filePath}.tmp`, "utf8"), "utf8");
  await rm(`${filePath}.tmp`, { force: true });
}

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function mapByPath(entries = []) {
  return new Map(entries.map((entry) => [entry.sourceRelativePath, entry]));
}

function buildTitleCandidate(entry) {
  const base = path.posix.basename(String(entry.filename || entry.sourceRelativePath || "coloring page"), path.posix.extname(entry.filename || entry.sourceRelativePath || ""));
  return titleCase(base.replace(/[-_]+/g, " "));
}

function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function countValues(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const group of groups.values()) {
    group.sort(compareByAssetId);
  }
  return groups;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function round(value, digits = 5) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function slash(value) {
  return String(value).replace(/\\/g, "/");
}

function relativeFrom(fromDir, repoRoot, repoRelativePath) {
  return slash(path.relative(fromDir, path.join(repoRoot, ...String(repoRelativePath).split("/"))));
}

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside repository: ${child}`);
  }
}

function compareByAssetId(a, b) {
  return String(a.assetId).localeCompare(String(b.assetId));
}

function compareBySourcePath(a, b) {
  return String(a.sourceRelativePath).localeCompare(String(b.sourceRelativePath));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

if (process.argv[1] === __filename) {
  runRound3BProductionDryRun(parseArgs(process.argv.slice(2)))
    .then(({ results }) => {
      console.log(JSON.stringify({
        runId: results.runId,
        totalRequested: results.totalRequested,
        totalProcessed: results.totalProcessed,
        totalPassed: results.totalPassed,
        totalQuarantined: results.totalQuarantined,
        totalSkipped: results.totalSkipped,
        warningImageCount: results.warningImageCount,
        preset: results.presetPolicyUsed.presetId,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
