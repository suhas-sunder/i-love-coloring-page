import { createHash } from "node:crypto";
import {
  appendFile,
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

const ROUND3C_GENERATED_AT = "2026-05-09";
const ROUND3C_RUN_ID = "round-3c-approved-production-export-line-thick";
const DEFAULT_FULL_ROOT = path.join("pipeline", "production", "full");
const DEFAULT_BATCH_SIZE = 250;

const INPUT_PATHS = {
  inventory: "pipeline/manifests/image-inventory.json",
  categorySummary: "pipeline/manifests/category-summary.json",
  policy: "pipeline/manifests/round-2-recommended-policy.json",
  presetInventory: "pipeline/manifests/conversion-preset-inventory.json",
  approved: "pipeline/manifests/round-3a1-approved-source-images.json",
  blocked: "pipeline/manifests/round-3a1-blocked-source-images.json",
  warnings: "pipeline/manifests/round-3a1-warning-source-images.json",
  outputSpec: "pipeline/manifests/round-3b-production-output-spec.json",
};

export const ROUND3C_PROJECT_MANIFESTS = [
  "pipeline/manifests/round-3c-production-export-results.json",
  "pipeline/manifests/round-3c-production-assets.json",
  "pipeline/manifests/round-3c-production-quarantine.json",
  "pipeline/manifests/round-3c-production-gallery-data.json",
  "pipeline/manifests/round-3c-production-category-data.json",
  "pipeline/manifests/round-3c-production-warning-assets.json",
  "pipeline/manifests/round-3c-production-export-resume-state.json",
  "pipeline/manifests/round-3c-nextjs-data-contract.json",
];

const ROUND3C_PROJECT_REPORTS = [
  "pipeline/reports/round-3c-production-export-report.md",
  "pipeline/reports/round-3c-quarantine-report.md",
  "pipeline/reports/round-3c-gallery-data-report.md",
  "pipeline/reports/round-3c-nextjs-data-contract.md",
  "pipeline/reports/round-3c-next-phase-plan.md",
];

const FULL_SUBDIRS = [
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
  "quarantine/thumbnail-failed",
  "quarantine/source-mismatch",
  "review/contact-sheets",
  "review/category-sheets",
  "review/warning-sheets",
  "review/quarantine-sheets",
  "review/sample-sheets",
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

const HIGH_VALUE_CATEGORY_SLUGS = new Set([
  "anime-girls",
  "chibi",
  "fantasy",
  "mythology",
  "horror",
  "midieval",
]);

export async function loadRound3CInputState({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const manifests = {
    inventory: await readJson(path.join(repoRoot, INPUT_PATHS.inventory)),
    categorySummary: await readJson(path.join(repoRoot, INPUT_PATHS.categorySummary)),
    policy: await readJson(path.join(repoRoot, INPUT_PATHS.policy)),
    presetInventory: await readJson(path.join(repoRoot, INPUT_PATHS.presetInventory)),
    approved: await readJson(path.join(repoRoot, INPUT_PATHS.approved)),
    blocked: await readJson(path.join(repoRoot, INPUT_PATHS.blocked)),
    warnings: await readJson(path.join(repoRoot, INPUT_PATHS.warnings)),
    outputSpec: await readJson(path.join(repoRoot, INPUT_PATHS.outputSpec)),
  };
  const preset = findPolicyPreset(manifests.policy, manifests.presetInventory, manifests.outputSpec);
  return buildInputStateFromManifests({ repoRoot, manifests: { ...manifests, preset } });
}

export async function validateApprovedCorpusInputs({ repoRoot, approved, blocked, warnings, inventory }) {
  const approvedEntries = approved?.entries || [];
  const blockedSet = new Set((blocked?.entries || []).map((entry) => entry.sourceRelativePath));
  const warningSet = new Set((warnings?.entries || []).map((entry) => entry.sourceRelativePath));
  const inventoryByPath = new Map((inventory?.entries || []).map((entry) => [entry.sourceRelativePath, entry]));
  const approvedBlockedOverlap = [];
  const sourceProblems = [];
  const warningApprovedPaths = [];
  const duplicateOutputPaths = [];
  const seenOutputPaths = new Map();

  for (const entry of approvedEntries) {
    if (blockedSet.has(entry.sourceRelativePath)) approvedBlockedOverlap.push(entry.sourceRelativePath);
    if (warningSet.has(entry.sourceRelativePath)) warningApprovedPaths.push(entry.sourceRelativePath);
    const inventoryEntry = inventoryByPath.get(entry.sourceRelativePath);
    if (!inventoryEntry) {
      sourceProblems.push({ sourceRelativePath: entry.sourceRelativePath, issue: "missing_round_1_inventory_entry" });
    } else {
      const current = await stat(path.join(repoRoot, ...entry.sourceRelativePath.split("/"))).catch(() => null);
      if (!current) {
        sourceProblems.push({ sourceRelativePath: entry.sourceRelativePath, issue: "missing_source_file" });
      } else if (Number(current.size) !== Number(inventoryEntry.fileSizeBytes)) {
        sourceProblems.push({
          sourceRelativePath: entry.sourceRelativePath,
          issue: "source_file_size_mismatch",
          expected: inventoryEntry.fileSizeBytes,
          actual: current.size,
        });
      }
    }

    const identity = buildProductionAssetIdentity(entry);
    for (const outputPath of [identity.svgRelativePath, identity.pngRelativePath, identity.thumbRelativePath]) {
      const existing = seenOutputPaths.get(outputPath);
      if (existing && existing !== entry.sourceRelativePath) {
        duplicateOutputPaths.push({
          outputPath,
          firstSourcePath: existing,
          secondSourcePath: entry.sourceRelativePath,
        });
      }
      seenOutputPaths.set(outputPath, entry.sourceRelativePath);
    }
  }

  return {
    isValid: approvedBlockedOverlap.length === 0 && sourceProblems.length === 0 && duplicateOutputPaths.length === 0,
    approvedBlockedOverlap: approvedBlockedOverlap.sort(),
    sourceProblems,
    duplicateOutputPaths,
    warningApprovedPaths: warningApprovedPaths.sort(),
  };
}

export function buildProductionAssetIdentity(entry) {
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
    svgRelativePath: slash(path.posix.join(DEFAULT_FULL_ROOT, "assets", "svg", categorySlug, `${outputBase}.svg`)),
    pngRelativePath: slash(path.posix.join(DEFAULT_FULL_ROOT, "assets", "png", categorySlug, `${outputBase}.png`)),
    thumbRelativePath: slash(path.posix.join(DEFAULT_FULL_ROOT, "assets", "thumbs", categorySlug, `${outputBase}-thumb.png`)),
  };
}

export async function runRound3CProductionExport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const fullRoot = path.resolve(repoRoot, options.outputRoot || DEFAULT_FULL_ROOT);
  assertInside(repoRoot, fullRoot);

  const inputState = options.manifests
    ? await buildInputStateFromManifests({ repoRoot, manifests: options.manifests })
    : await loadRound3CInputState({ repoRoot });

  if (!inputState.validation.isValid) {
    throw new Error(`Round 3C blocker: invalid input state ${JSON.stringify({
      overlap: inputState.validation.approvedBlockedOverlap.length,
      sourceProblems: inputState.validation.sourceProblems.length,
      duplicateOutputPaths: inputState.validation.duplicateOutputPaths.length,
    })}`);
  }

  const cli = normalizeRunOptions(options);
  if (cli.resetOutputRoot && !cli.resume && !cli.dryRun) {
    await rm(fullRoot, { recursive: true, force: true });
  }
  await prepareFullFolders(fullRoot);

  const previousState = cli.resume || !cli.force
    ? await loadExistingRound3CState(repoRoot)
    : emptyExistingState();
  const logPath = path.join(fullRoot, "logs", "round-3c-production-export.jsonl");
  await appendJsonLog(logPath, {
    event: "run_start",
    runId: ROUND3C_RUN_ID,
    generatedAt: ROUND3C_GENERATED_AT,
    options: cli.publicOptions,
  });

  const approvedEntries = selectApprovedEntries(inputState.manifests.approved.entries || [], cli);
  const approvedByPath = mapByPath(inputState.manifests.approved.entries || []);
  const warningByPath = mapByPath(inputState.manifests.warnings.entries || []);
  const inventoryByPath = mapByPath(inputState.manifests.inventory.entries || []);
  const preset = inputState.manifests.preset;
  const thresholds = getThresholds(inputState.manifests.policy);
  const runtime = options.runtime || (options.converter || cli.dryRun ? null : await loadIloveSvgRuntime());

  const passedAssets = [];
  const quarantineEntries = [];
  const skippedEntries = [];
  const processedRecords = [];
  let processedNowCount = 0;
  let reusedSuccessCount = 0;
  let reusedQuarantineCount = 0;
  let reusedSkippedCount = 0;
  let lastProcessedIndex = null;

  for (let offset = 0; offset < approvedEntries.length; offset += 1) {
    const source = approvedEntries[offset];
    const sourceIndex = Number(source.__round3cSourceIndex);
    lastProcessedIndex = sourceIndex;
    const warningEntry = warningByPath.get(source.sourceRelativePath);
    const inventoryEntry = inventoryByPath.get(source.sourceRelativePath);
    const identity = buildProductionAssetIdentity(source);
    const outputPaths = buildOutputPaths({ repoRoot, identity });

    const previousAsset = previousState.assetsByPath.get(source.sourceRelativePath);
    if (!cli.force && previousAsset && await reusableAssetOutputsExist(previousAsset, repoRoot)) {
      passedAssets.push(previousAsset);
      processedRecords.push(previousAsset);
      reusedSuccessCount += 1;
      continue;
    }

    const previousQuarantine = previousState.quarantineByPath.get(source.sourceRelativePath);
    if (cli.resume && !cli.force && previousQuarantine) {
      quarantineEntries.push(previousQuarantine);
      processedRecords.push(previousQuarantine);
      reusedQuarantineCount += 1;
      continue;
    }

    if (cli.dryRun) {
      const skipped = buildSkippedEntry({
        source,
        warningEntry,
        identity,
        outputPaths,
        reasonCode: "dry_run_plan_only",
        summary: "Dry-run planning mode did not convert this source.",
      });
      skippedEntries.push(skipped);
      processedRecords.push(skipped);
      reusedSkippedCount += 1;
      continue;
    }

    const started = performance.now();
    try {
      const sourceAbsolutePath = path.join(repoRoot, ...source.sourceRelativePath.split("/"));
      const sourceStatBefore = await stat(sourceAbsolutePath).catch(() => null);
      if (!sourceStatBefore) {
        throw stagedError("source-mismatch", "missing_source_file", "Source file is missing.");
      }
      if (inventoryEntry && Number(sourceStatBefore.size) !== Number(inventoryEntry.fileSizeBytes)) {
        throw stagedError("source-mismatch", "source_file_size_mismatch", "Source file size differs from Round 1 inventory.");
      }

      await mkdir(path.dirname(outputPaths.svgAbsolutePath), { recursive: true });
      await mkdir(path.dirname(outputPaths.pngAbsolutePath), { recursive: true });
      await mkdir(path.dirname(outputPaths.thumbAbsolutePath), { recursive: true });

      const conversionRecord = await (options.converter || defaultConverter)({
        repoRoot,
        runtime,
        inputPath: sourceAbsolutePath,
        preset,
        source: enrichSourceForConversion(source, warningEntry, identity),
        outputPaths,
        logPath,
      });

      await (options.createThumbnail || createThumbnail)({ runtime, outputPaths });

      const timingMs = Math.round(performance.now() - started);
      const validation = await validateOutputFiles({
        sourceEntry: source,
        conversionRecord,
        outputPaths,
        runtime,
        thresholds,
        inspectPng: options.inspectPng || inspectPng,
        measurePng: options.measurePng || measurePng,
      });
      const sourceStatAfter = await stat(sourceAbsolutePath).catch(() => null);
      if (!sourceStatAfter || Number(sourceStatAfter.size) !== Number(sourceStatBefore.size) || Number(sourceStatAfter.mtimeMs) !== Number(sourceStatBefore.mtimeMs)) {
        validation.reasonCodes.push("source_image_modified_during_export");
        validation.failureStage = "source-mismatch";
      }

      processedNowCount += 1;
      if (validation.reasonCodes.length) {
        const entry = buildQuarantineEntry({
          source,
          warningEntry,
          identity,
          outputPaths,
          stage: validation.failureStage,
          reasonCodes: validation.reasonCodes,
          errorSummary: validation.errorSummary,
          timingMs,
        });
        await writeQuarantineMarker({ fullRoot, entry });
        quarantineEntries.push(entry);
        processedRecords.push(entry);
        await appendJsonLog(logPath, { event: "quarantined", sourceIndex, sourceRelativePath: source.sourceRelativePath, reasonCodes: entry.reasonCodes });
      } else {
        const asset = buildAssetRecord({
          source,
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
        await appendJsonLog(logPath, { event: "passed", sourceIndex, sourceRelativePath: source.sourceRelativePath, assetId: asset.assetId });
      }
    } catch (error) {
      const timingMs = Math.round(performance.now() - started);
      const entry = buildQuarantineEntry({
        source,
        warningEntry,
        identity,
        outputPaths,
        stage: classifyErrorStage(error),
        reasonCodes: [reasonCodeFromError(error)],
        errorSummary: String(error?.message || error),
        timingMs,
      });
      await writeQuarantineMarker({ fullRoot, entry });
      quarantineEntries.push(entry);
      processedRecords.push(entry);
      processedNowCount += 1;
      await appendJsonLog(logPath, { event: "quarantined", sourceIndex, sourceRelativePath: source.sourceRelativePath, reasonCodes: entry.reasonCodes });
    }

    const completedInBatch = offset + 1;
    if (completedInBatch % cli.batchSize === 0) {
      await appendJsonLog(logPath, {
        event: "batch_checkpoint",
        processedInSelection: completedInBatch,
        lastProcessedIndex,
        passed: passedAssets.length,
        quarantined: quarantineEntries.length,
        skipped: skippedEntries.length,
      });
    }
  }

  passedAssets.sort(compareByAssetId);
  quarantineEntries.sort(compareBySourcePath);
  skippedEntries.sort(compareBySourcePath);

  const resumeState = buildResumeState({
    cli,
    inputState,
    selectedEntries: approvedEntries,
    passedAssets,
    quarantineEntries,
    skippedEntries,
    processedNowCount,
    reusedSuccessCount,
    reusedQuarantineCount,
    reusedSkippedCount,
    lastProcessedIndex,
  });
  const results = buildResultsManifest({
    inputState,
    selectedEntries: approvedEntries,
    passedAssets,
    quarantineEntries,
    skippedEntries,
    processedRecords,
    preset,
    fullRoot,
    resumeState,
  });
  const assets = buildAssetsManifest({ inputState, passedAssets, preset });
  const quarantine = buildQuarantineManifest({ quarantineEntries, skippedEntries, preset });
  const categoryData = buildCategoryDataManifest({ assets: passedAssets, categorySummary: inputState.manifests.categorySummary });
  const gallery = buildGalleryDataManifest({ assets: passedAssets, categoryData });
  const warningAssets = buildWarningAssetsManifest({ assets: passedAssets, warningSources: inputState.manifests.warnings.entries || [] });
  const nextjsDataContract = buildNextjsDataContractManifest({ categoryData, gallery });

  await writeRound3CManifests({
    repoRoot,
    fullRoot,
    manifests: { results, assets, quarantine, gallery, categoryData, warningAssets, resumeState, nextjsDataContract },
  });
  await writeReviewArtifacts({
    repoRoot,
    fullRoot,
    assets: passedAssets,
    quarantineEntries,
    skippedEntries,
    processedRecords,
  });
  await writeRound3CReports({
    repoRoot,
    fullRoot,
    manifests: { results, assets, quarantine, gallery, categoryData, warningAssets, resumeState, nextjsDataContract },
  });

  await appendJsonLog(logPath, {
    event: "run_complete",
    totalPassed: results.totalPassed,
    totalQuarantined: results.totalQuarantined,
    totalSkipped: results.totalSkipped,
    lastProcessedIndex,
  });

  return { results, assets, quarantine, gallery, categoryData, warningAssets, resumeState, nextjsDataContract };
}

async function buildInputStateFromManifests({ repoRoot, manifests }) {
  const preset = manifests.preset || findPolicyPreset(manifests.policy, manifests.presetInventory, manifests.outputSpec);
  if (!preset?.presetId) {
    throw new Error("Round 3C blocker: recommended line-thick preset is missing.");
  }
  if (manifests.policy?.defaultPreset?.presetId !== "line-thick" || preset.presetId !== "line-thick") {
    throw new Error("Round 3C blocker: recommended policy is not line-thick.");
  }
  if (manifests.outputSpec?.conversionPolicy?.presetId && manifests.outputSpec.conversionPolicy.presetId !== "line-thick") {
    throw new Error("Round 3C blocker: Round 3B output spec does not use line-thick.");
  }

  const validation = await validateApprovedCorpusInputs({
    repoRoot,
    approved: manifests.approved,
    blocked: manifests.blocked,
    warnings: manifests.warnings,
    inventory: manifests.inventory,
  });
  return {
    repoRoot,
    manifests: { ...manifests, preset },
    validation,
    counts: {
      approvedRequested: manifests.approved?.entries?.length || 0,
      blockedSources: manifests.blocked?.entries?.length || 0,
      warningSources: manifests.warnings?.entries?.length || 0,
      warningApproved: validation.warningApprovedPaths.length,
    },
    policy: manifests.policy,
    outputSpec: manifests.outputSpec,
    conversionWrapper: CONVERSION_WRAPPER,
  };
}

function findPolicyPreset(policy, presetInventory, outputSpec) {
  const presetId = policy?.defaultPreset?.presetId || outputSpec?.conversionPolicy?.presetId;
  const preset = (presetInventory?.presets || []).find((candidate) => candidate.presetId === presetId);
  if (preset) return preset;
  if (presetId === "line-thick") {
    return {
      presetId: "line-thick",
      presetName: policy?.defaultPreset?.presetName || outputSpec?.conversionPolicy?.presetName || "Lineart - Thick",
      relevantParameters: outputSpec?.conversionPolicy?.relevantParameters || {
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

function normalizeRunOptions(options) {
  const resume = Boolean(options.resume);
  const force = Boolean(options.force);
  const dryRun = Boolean(options.dryRun);
  const batchSize = Math.max(1, Number(options.batchSize || DEFAULT_BATCH_SIZE));
  const startIndex = Math.max(0, Number(options.startIndex || 0));
  const limit = options.limit == null || options.limit === false ? null : Math.max(0, Number(options.limit));
  const category = options.category ? String(options.category) : null;
  return {
    resume,
    force,
    dryRun,
    batchSize,
    startIndex,
    limit,
    category,
    resetOutputRoot: options.resetOutputRoot ?? (!resume && !force),
    publicOptions: { resume, force, dryRun, batchSize, startIndex, limit, category },
  };
}

function selectApprovedEntries(entries, cli) {
  let selected = entries.map((entry, index) => ({ ...entry, __round3cSourceIndex: index }));
  if (cli.category) {
    const categoryNeedle = slug(cli.category);
    selected = selected.filter((entry) => slug(entry.category) === categoryNeedle || entry.category === cli.category);
  }
  if (cli.startIndex > 0) selected = selected.filter((entry) => entry.__round3cSourceIndex >= cli.startIndex);
  if (cli.limit != null) selected = selected.slice(0, cli.limit);
  return selected;
}

async function prepareFullFolders(fullRoot) {
  for (const subdir of FULL_SUBDIRS) {
    await mkdir(path.join(fullRoot, ...subdir.split("/")), { recursive: true });
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

async function defaultConverter({ inputPath, preset, source, outputPaths, logPath, runtime }) {
  const result = await runSingleConversion({
    inputPath,
    preset,
    outputSvgPath: outputPaths.svgAbsolutePath,
    outputPreviewPath: outputPaths.pngAbsolutePath,
    logPath,
    runtime,
    sample: {
      sampleId: source.assetId,
      sourceRelativePath: source.sourceRelativePath,
      category: source.category,
      likelyHumanAdjacent: Boolean(source.highRiskCategory),
    },
    stage: "round-3c-production-export",
  });
  if (result.status !== "success") {
    throw stagedError("conversion", "conversion_failed", result.error || "conversion failed");
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
    throw stagedError("thumbnail", "thumbnail_failed", String(error?.message || error));
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
    failureStage = "thumbnail";
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

  const uniqueReasons = unique(reasonCodes);
  return {
    reasonCodes: uniqueReasons,
    failureStage,
    errorSummary: errorSummary || uniqueReasons.join(", "),
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
  return { darkPixelRatio: round(dark / Math.max(1, raw.data.length), 5) };
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

function enrichSourceForConversion(source, warningEntry, identity) {
  return {
    ...source,
    assetId: identity.assetId,
    sampleId: identity.assetId,
    likelyHumanAdjacent: Boolean(source.highRiskCategory),
    warningCodes: warningEntry?.warningCodes || source.warningCodes || [],
  };
}

function buildAssetRecord({
  source,
  warningEntry,
  identity,
  outputPaths,
  preset,
  conversionRecord,
  validation,
  timingMs,
}) {
  const title = buildTitleCandidate(source);
  return {
    assetId: identity.assetId,
    sourceRelativePath: source.sourceRelativePath,
    originalCategory: source.category,
    categorySlug: identity.categorySlug,
    titleCandidate: title,
    displayNameCandidate: title,
    altTextCandidate: `${title} coloring page`,
    filenameSlug: identity.filenameSlug,
    svgPath: outputPaths.svgRelativePath,
    pngPreviewPath: outputPaths.pngRelativePath,
    thumbnailPath: outputPaths.thumbRelativePath,
    sourceDimensions: source.dimensions || null,
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
    round3a1WarningFlags: warningEntry?.warningCodes || source.warningCodes || [],
    round3a1Status: source.status,
    status: "passed_production_export",
  };
}

function buildQuarantineEntry({ source, warningEntry, identity, outputPaths, stage, reasonCodes, errorSummary, timingMs }) {
  return {
    sourceRelativePath: source.sourceRelativePath,
    category: source.category,
    assetId: identity.assetId,
    attemptedOutputPaths: {
      svgPath: outputPaths.svgRelativePath,
      pngPreviewPath: outputPaths.pngRelativePath,
      thumbnailPath: outputPaths.thumbRelativePath,
    },
    failureStage: stage,
    reasonCodes: unique(reasonCodes),
    errorSummary: String(errorSummary || unique(reasonCodes).join(", ")).slice(0, 800),
    round3a1WarningFlags: warningEntry?.warningCodes || source.warningCodes || [],
    conversionTimingMs: timingMs,
    status: "quarantined_for_now",
  };
}

function buildSkippedEntry({ source, warningEntry, identity, outputPaths, reasonCode, summary }) {
  return {
    sourceRelativePath: source.sourceRelativePath,
    category: source.category,
    assetId: identity.assetId,
    attemptedOutputPaths: {
      svgPath: outputPaths.svgRelativePath,
      pngPreviewPath: outputPaths.pngRelativePath,
      thumbnailPath: outputPaths.thumbRelativePath,
    },
    failureStage: "input-validation",
    reasonCodes: [reasonCode],
    errorSummary: summary,
    round3a1WarningFlags: warningEntry?.warningCodes || source.warningCodes || [],
    status: "skipped",
  };
}

async function writeQuarantineMarker({ fullRoot, entry }) {
  const stageFolder = {
    conversion: "conversion-failed",
    qa: "qa-failed",
    metadata: "metadata-failed",
    preview: "preview-failed",
    thumbnail: "thumbnail-failed",
    "source-mismatch": "source-mismatch",
    "input-validation": "metadata-failed",
  }[entry.failureStage] || "qa-failed";
  await writeJson(path.join(fullRoot, "quarantine", stageFolder, `${entry.assetId}.json`), entry);
}

function buildResumeState({
  cli,
  inputState,
  selectedEntries,
  passedAssets,
  quarantineEntries,
  skippedEntries,
  processedNowCount,
  reusedSuccessCount,
  reusedQuarantineCount,
  reusedSkippedCount,
  lastProcessedIndex,
}) {
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    approvedManifest: INPUT_PATHS.approved,
    totalApprovedRequested: inputState.counts.approvedRequested,
    selectedCount: selectedEntries.length,
    lastProcessedIndex,
    batchSize: cli.batchSize,
    startIndex: cli.startIndex,
    limit: cli.limit,
    category: cli.category,
    resume: cli.resume,
    force: cli.force,
    dryRun: cli.dryRun,
    processedNowCount,
    reusedSuccessCount,
    reusedQuarantineCount,
    reusedSkippedCount,
    successfulAssetCount: passedAssets.length,
    quarantineCount: quarantineEntries.length,
    skippedCount: skippedEntries.length,
    interrupted: false,
    nextResumeCommand:
      "node pipeline\\scripts\\round-3c-production-export.mjs --batch-size 250 --resume",
  };
}

function buildResultsManifest({
  inputState,
  selectedEntries,
  passedAssets,
  quarantineEntries,
  skippedEntries,
  processedRecords,
  preset,
  fullRoot,
  resumeState,
}) {
  const selectedWarningCount = selectedEntries.filter((entry) => (entry.warningCodes || []).length || entry.status === "approved_with_warning").length;
  const warningAssets = passedAssets.filter((asset) => (asset.round3a1WarningFlags || []).length);
  const quarantinedWarningCount = quarantineEntries.filter((entry) => (entry.round3a1WarningFlags || []).length).length;
  const allFailures = [...quarantineEntries, ...skippedEntries];
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    fullApprovedCorpusProcessed: selectedEntries.length === inputState.counts.approvedRequested,
    sourceManifest: INPUT_PATHS.approved,
    blockedManifest: INPUT_PATHS.blocked,
    warningManifest: INPUT_PATHS.warnings,
    round3bOutputSpec: INPUT_PATHS.outputSpec,
    totalApprovedRequested: selectedEntries.length,
    totalApprovedManifestCount: inputState.counts.approvedRequested,
    totalBlockedSourceCount: inputState.counts.blockedSources,
    totalWarningSourceCount: inputState.counts.warningSources,
    totalProcessed: passedAssets.length + quarantineEntries.length + skippedEntries.length,
    totalPassed: passedAssets.length,
    totalQuarantined: quarantineEntries.length,
    totalSkipped: skippedEntries.length,
    warningImageCount: selectedWarningCount,
    countsByCategory: buildCategoryCounts(selectedEntries, passedAssets, quarantineEntries, skippedEntries),
    countsByWarningStatus: {
      withWarnings: selectedWarningCount,
      withoutWarnings: selectedEntries.length - selectedWarningCount,
      passedWithWarnings: warningAssets.length,
      quarantinedWithWarnings: quarantinedWarningCount,
    },
    countsByFailureReason: countValues(allFailures.flatMap((entry) => entry.reasonCodes || [])),
    presetPolicyUsed: {
      recommendationType: inputState.manifests.policy.recommendationType,
      presetId: preset.presetId,
      presetName: preset.presetName,
      relevantParameters: preset.relevantParameters || {},
    },
    conversionWrapperUsed: CONVERSION_WRAPPER,
    outputRoot: slash(path.relative(inputState.repoRoot, fullRoot)),
    resumeState,
    validation: inputState.validation,
    representativeOutputExamples: passedAssets.slice(0, 12).map((asset) => ({
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
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    sourceManifest: INPUT_PATHS.approved,
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

function buildQuarantineManifest({ quarantineEntries, skippedEntries, preset }) {
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    sourceManifest: INPUT_PATHS.approved,
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
    note: "Quarantine is an automated export gate only. It is not a final human aesthetic review.",
  };
}

function buildCategoryDataManifest({ assets, categorySummary }) {
  const sourceCategories = new Map((categorySummary?.categories || []).map((category) => [
    category.categorySlug || slug(category.categoryName),
    category,
  ]));
  const groups = groupBy(assets, (asset) => asset.categorySlug);
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    categories: [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([categorySlug, items]) => {
        const sourceCategory = sourceCategories.get(categorySlug);
        return {
          category: items[0]?.originalCategory || sourceCategory?.categoryName || categorySlug,
          categorySlug,
          categoryTitle: titleCase(sourceCategory?.categoryName || items[0]?.originalCategory || categorySlug),
          categoryDescriptionCandidate: `${titleCase(sourceCategory?.categoryName || items[0]?.originalCategory || categorySlug)} coloring pages ready for gallery review.`,
          imageCount: items.length,
          warningImageCount: items.filter((item) => (item.round3a1WarningFlags || []).length).length,
          assetIds: items.map((item) => item.assetId),
          sampleAssetIds: deterministicSample(items, 12).map((item) => item.assetId),
          likelyPublicHubCandidate: sourceCategory?.likelyPublicHubCandidate ?? true,
          humanAdjacentRisk: sourceCategory?.humanAdjacentRisk ?? HIGH_VALUE_CATEGORY_SLUGS.has(categorySlug),
        };
      }),
  };
}

function buildGalleryDataManifest({ assets, categoryData }) {
  const assetsByCategory = groupBy(assets, (asset) => asset.categorySlug);
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    noIndexablePerImageRoutes: true,
    intendedConsumer: "future Next.js category hub and gallery data, not per-image HTML pages",
    categories: categoryData.categories.map((category) => ({
      category: category.category,
      categorySlug: category.categorySlug,
      categoryTitle: category.categoryTitle,
      categoryDescriptionCandidate: category.categoryDescriptionCandidate,
      imageCount: category.imageCount,
      assetIds: category.assetIds,
      items: (assetsByCategory.get(category.categorySlug) || []).map((asset) => ({
        assetId: asset.assetId,
        sourceRelativePath: asset.sourceRelativePath,
        assetPaths: {
          svg: asset.svgPath,
          pngPreview: asset.pngPreviewPath,
          thumbnail: asset.thumbnailPath,
        },
        altTextCandidate: asset.altTextCandidate,
        titleCandidate: asset.titleCandidate,
        downloadAvailable: true,
        printAvailable: true,
        indexablePerImageRoute: false,
        warningFlags: asset.round3a1WarningFlags || [],
      })),
    })),
  };
}

function buildWarningAssetsManifest({ assets, warningSources }) {
  const warningSourceSet = new Set(warningSources.map((entry) => entry.sourceRelativePath));
  const warningAssets = assets
    .filter((asset) => warningSourceSet.has(asset.sourceRelativePath) || (asset.round3a1WarningFlags || []).length)
    .map((asset) => ({
      assetId: asset.assetId,
      sourceRelativePath: asset.sourceRelativePath,
      category: asset.originalCategory,
      categorySlug: asset.categorySlug,
      warningFlags: asset.round3a1WarningFlags || [],
      svgPath: asset.svgPath,
      pngPreviewPath: asset.pngPreviewPath,
      thumbnailPath: asset.thumbnailPath,
      status: asset.status,
    }));
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    warningManifest: INPUT_PATHS.warnings,
    totalWarningAssets: warningAssets.length,
    warningAssets,
  };
}

function buildNextjsDataContractManifest({ categoryData, gallery }) {
  return {
    generatedAt: ROUND3C_GENERATED_AT,
    runId: ROUND3C_RUN_ID,
    noPerImageIndexPages: true,
    websiteBuildShouldConsume: [
      "pipeline/manifests/round-3c-production-gallery-data.json",
      "pipeline/manifests/round-3c-production-category-data.json",
      "pipeline/manifests/round-3c-production-assets.json",
    ],
    categoryListShape: {
      category: "string",
      categorySlug: "string",
      categoryTitle: "string",
      categoryDescriptionCandidate: "string",
      imageCount: "number",
      assetIds: "string[]",
      sampleAssetIds: "string[]",
      likelyPublicHubCandidate: "boolean",
    },
    galleryItemShape: {
      assetId: "string",
      sourceRelativePath: "string internal traceability field",
      assetPaths: {
        svg: "string",
        pngPreview: "string",
        thumbnail: "string",
      },
      altTextCandidate: "string",
      titleCandidate: "string",
      downloadAvailable: "boolean",
      printAvailable: "boolean",
      indexablePerImageRoute: "false",
      warningFlags: "string[] internal field",
    },
    seoHubPageFields: {
      route: "/coloring-pages/[categorySlug]",
      title: "categoryTitle + coloring pages",
      description: "categoryDescriptionCandidate",
      noPerImageRoutes: true,
    },
    downloadPrintFields: ["assetPaths.svg", "assetPaths.pngPreview", "downloadAvailable", "printAvailable"],
    internalWarningFields: ["warningFlags", "sourceRelativePath"],
    futureColoringDashboardFields: [
      "assetId",
      "svgPath",
      "pngPreviewPath",
      "thumbnailPath",
      "categorySlug",
    ],
    summary: {
      categoryCount: categoryData.categories.length,
      galleryCategoryCount: gallery.categories.length,
    },
  };
}

async function writeRound3CManifests({ repoRoot, fullRoot, manifests }) {
  const pairs = [
    [ROUND3C_PROJECT_MANIFESTS[0], manifests.results],
    [ROUND3C_PROJECT_MANIFESTS[1], manifests.assets],
    [ROUND3C_PROJECT_MANIFESTS[2], manifests.quarantine],
    [ROUND3C_PROJECT_MANIFESTS[3], manifests.gallery],
    [ROUND3C_PROJECT_MANIFESTS[4], manifests.categoryData],
    [ROUND3C_PROJECT_MANIFESTS[5], manifests.warningAssets],
    [ROUND3C_PROJECT_MANIFESTS[6], manifests.resumeState],
    [ROUND3C_PROJECT_MANIFESTS[7], manifests.nextjsDataContract],
  ];
  for (const [repoRelativePath, data] of pairs) {
    await writeJson(path.join(repoRoot, ...repoRelativePath.split("/")), data);
    await writeJson(path.join(fullRoot, "manifests", path.basename(repoRelativePath)), data);
  }
}

async function writeRound3CReports({ repoRoot, fullRoot, manifests }) {
  const reports = [
    [ROUND3C_PROJECT_REPORTS[0], buildProductionExportReport(manifests)],
    [ROUND3C_PROJECT_REPORTS[1], buildQuarantineReport(manifests)],
    [ROUND3C_PROJECT_REPORTS[2], buildGalleryDataReport(manifests)],
    [ROUND3C_PROJECT_REPORTS[3], buildNextjsDataContractReport(manifests.nextjsDataContract)],
    [ROUND3C_PROJECT_REPORTS[4], buildNextPhasePlan(manifests)],
  ];
  for (const [repoRelativePath, content] of reports) {
    await writeText(path.join(repoRoot, ...repoRelativePath.split("/")), content);
    await writeText(path.join(fullRoot, "reports", path.basename(repoRelativePath)), content);
  }
}

async function writeReviewArtifacts({ repoRoot, fullRoot, assets, quarantineEntries, skippedEntries, processedRecords }) {
  const contactDir = path.join(fullRoot, "review", "contact-sheets");
  const categoryDir = path.join(fullRoot, "review", "category-sheets");
  const warningDir = path.join(fullRoot, "review", "warning-sheets");
  const quarantineDir = path.join(fullRoot, "review", "quarantine-sheets");
  const sampleDir = path.join(fullRoot, "review", "sample-sheets");

  const overallSample = deterministicSample(assets, 160);
  await writeText(
    path.join(contactDir, "round-3c-overall-sample.html"),
    buildAssetSheetHtml({ title: "Round 3C Overall Sample", repoRoot, fromDir: contactDir, assets: overallSample }),
  );
  await writeText(
    path.join(contactDir, "round-3c-random-approved-sample.html"),
    buildAssetSheetHtml({ title: "Round 3C Random Approved Sample", repoRoot, fromDir: contactDir, assets: deterministicSample(assets, 120, "random-approved") }),
  );
  await writeText(
    path.join(sampleDir, "round-3c-largest-output-sample.html"),
    buildAssetSheetHtml({ title: "Round 3C Largest Output Sample", repoRoot, fromDir: sampleDir, assets: topBy(assets, (asset) => asset.svgFileSizeBytes, 120) }),
  );
  await writeText(
    path.join(sampleDir, "round-3c-highest-complexity-sample.html"),
    buildAssetSheetHtml({ title: "Round 3C Highest Complexity Sample", repoRoot, fromDir: sampleDir, assets: topBy(assets, (asset) => asset.pathCount || 0, 120) }),
  );

  const warningRecords = assets.filter((asset) => (asset.round3a1WarningFlags || []).length);
  await writeText(
    path.join(warningDir, "round-3c-warning-sample.html"),
    buildAssetSheetHtml({ title: "Round 3C Warning Image Sample", repoRoot, fromDir: warningDir, assets: deterministicSample(warningRecords, 160, "warnings") }),
  );

  for (const [categorySlug, items] of groupBy(assets, (asset) => asset.categorySlug).entries()) {
    const limit = HIGH_VALUE_CATEGORY_SLUGS.has(categorySlug) ? 160 : 80;
    await writeText(
      path.join(categoryDir, `${categorySlug}.html`),
      buildAssetSheetHtml({
        title: `Round 3C Category Sheet: ${titleCase(categorySlug)}`,
        repoRoot,
        fromDir: categoryDir,
        assets: deterministicSample(items, limit, categorySlug),
      }),
    );
  }

  await writeText(
    path.join(quarantineDir, "round-3c-quarantine.html"),
    buildQuarantineSheetHtml({ repoRoot, fromDir: quarantineDir, quarantineEntries, skippedEntries }),
  );

  await writeText(
    path.join(contactDir, "round-3c-pass-quarantine-summary.html"),
    buildPassQuarantineHtml({ repoRoot, fromDir: contactDir, assets: overallSample, quarantineEntries, skippedEntries, processedRecords }),
  );
}

function buildProductionExportReport({ results, assets, quarantine, categoryData }) {
  const topReasons = Object.entries(results.countsByFailureReason || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  return `# Round 3C Production Export Report

Generated: ${ROUND3C_GENERATED_AT}

## Inputs

- Approved manifest used: \`${results.sourceManifest}\`
- Blocked manifest used: \`${results.blockedManifest}\`
- Warning manifest used: \`${results.warningManifest}\`
- Round 3B output spec used: \`${results.round3bOutputSpec}\`

## Conversion Policy

- Recommendation type: \`${results.presetPolicyUsed.recommendationType}\`
- Preset used: \`${results.presetPolicyUsed.presetId}\` (${results.presetPolicyUsed.presetName})
- Reusable conversion path: \`${results.conversionWrapperUsed.modulePath}#${results.conversionWrapperUsed.exportName}\`
- Underlying I Love SVG path: \`${results.conversionWrapperUsed.underlyingPath}\`
- Underlying functions: ${results.conversionWrapperUsed.underlyingFunctions.map((item) => `\`${item}()\``).join(", ")}

## Results

- Total approved requested: ${results.totalApprovedRequested}
- Processed: ${results.totalProcessed}
- Passed: ${results.totalPassed}
- Quarantined: ${results.totalQuarantined}
- Skipped: ${results.totalSkipped}
- Warning-image count: ${results.warningImageCount}

## Pass And Quarantine Counts By Category

${categoryCountsTable(results.countsByCategory)}

## Top Quarantine Reasons

${topReasons.length ? topReasons.map(([reason, count]) => `- ${reason}: ${count}`).join("\n") : "- None"}

## Output Folder Structure

- \`pipeline/production/full/assets/svg/\`
- \`pipeline/production/full/assets/png/\`
- \`pipeline/production/full/assets/thumbs/\`
- \`pipeline/production/full/manifests/\`
- \`pipeline/production/full/reports/\`
- \`pipeline/production/full/logs/\`
- \`pipeline/production/full/quarantine/\`
- \`pipeline/production/full/review/contact-sheets/\`
- \`pipeline/production/full/review/category-sheets/\`
- \`pipeline/production/full/review/warning-sheets/\`
- \`pipeline/production/full/review/quarantine-sheets/\`
- \`pipeline/production/full/review/sample-sheets/\`

## Asset Naming Convention

\`category-slug/source-slug-stableid.svg\`, \`category-slug/source-slug-stableid.png\`, and \`category-slug/source-slug-stableid-thumb.png\`, with stable IDs derived from source path instead of filename alone.

## Gallery Data Structure

- Category data: \`pipeline/manifests/round-3c-production-category-data.json\`
- Gallery data: \`pipeline/manifests/round-3c-production-gallery-data.json\`
- Successful asset metadata: \`pipeline/manifests/round-3c-production-assets.json\`
- Categories emitted: ${categoryData.categories.length}
- Assets emitted: ${assets.totalAssets}

## Website Build Readiness

The production export is ready as a data and asset input for a Round 4 website build if the local review sheets are accepted. Generated assets remain local and ignored. Round 4 should decide the public/CDN asset strategy before copying anything into a web app public folder.

## Exact Rerun Commands

\`\`\`powershell
node --test pipeline\\tests\\round-3c-production-export.test.mjs
node pipeline\\scripts\\round-3c-production-export.mjs --batch-size 250 --resume
\`\`\`
`;
}

function buildQuarantineReport({ results, quarantine }) {
  return `# Round 3C Quarantine Report

Generated: ${ROUND3C_GENERATED_AT}

- Quarantined: ${quarantine.totalQuarantined}
- Skipped: ${quarantine.totalSkipped}

## Counts By Failure Reason

${Object.entries(quarantine.countsByFailureReason || {}).length ? Object.entries(quarantine.countsByFailureReason).sort(([, a], [, b]) => b - a).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") : "- None"}

## Quarantined Sources

${quarantine.entries.length ? quarantine.entries.slice(0, 200).map((entry) => `- ${entry.sourceRelativePath}: ${entry.reasonCodes.join(", ")} (${entry.failureStage})`).join("\n") : "- None"}

## Category Summary

${categoryCountsTable(results.countsByCategory)}

This report is an automated production export gate. It is not a final human aesthetic review.
`;
}

function buildGalleryDataReport({ categoryData, gallery, warningAssets }) {
  return `# Round 3C Gallery Data Report

Generated: ${ROUND3C_GENERATED_AT}

- Gallery categories: ${gallery.categories.length}
- Category records: ${categoryData.categories.length}
- Warning assets retained: ${warningAssets.totalWarningAssets}

## Data Files

- \`pipeline/manifests/round-3c-production-gallery-data.json\`
- \`pipeline/manifests/round-3c-production-category-data.json\`
- \`pipeline/manifests/round-3c-production-assets.json\`
- \`pipeline/manifests/round-3c-production-warning-assets.json\`

## Category Counts

${categoryData.categories.map((category) => `- ${category.categorySlug}: ${category.imageCount}`).join("\n")}

Individual images are assets and metadata records. The future public site should index category and hub pages, not per-image pages.
`;
}

function buildNextjsDataContractReport(contract) {
  return `# Round 3C Next.js Data Contract

Generated: ${ROUND3C_GENERATED_AT}

## Files To Consume

${contract.websiteBuildShouldConsume.map((item) => `- \`${item}\``).join("\n")}

## Category List Shape

\`\`\`json
${JSON.stringify(contract.categoryListShape, null, 2)}
\`\`\`

## Gallery Item Shape

\`\`\`json
${JSON.stringify(contract.galleryItemShape, null, 2)}
\`\`\`

## SEO Hub/Page Fields

\`\`\`json
${JSON.stringify(contract.seoHubPageFields, null, 2)}
\`\`\`

## Rules

- Category and gallery pages may be indexable.
- Individual image pages must not be indexable pages.
- The website should consume metadata/data files instead of importing thousands of image files directly into React components.
- Warning fields are internal review metadata.
`;
}

function buildNextPhasePlan({ results }) {
  return `# Round 3C Next Phase Plan

Generated: ${ROUND3C_GENERATED_AT}

## Current State

- Total approved requested: ${results.totalApprovedRequested}
- Passed: ${results.totalPassed}
- Quarantined: ${results.totalQuarantined}
- Skipped: ${results.totalSkipped}
- Warning-image count: ${results.warningImageCount}

## Round 4 Recommendation

Build the Next.js gallery only after reviewing the Round 3C sample, warning, high-value category, and quarantine sheets. Round 4 should consume \`pipeline/manifests/round-3c-production-gallery-data.json\`, \`pipeline/manifests/round-3c-production-category-data.json\`, and \`pipeline/manifests/round-3c-production-assets.json\`. It should create indexable hub/category pages, avoid per-image indexable routes, preserve internal warning metadata outside public copy, and decide whether assets are copied to public or referenced through a CDN path mapping.

## Exact Commands

\`\`\`powershell
node --test pipeline\\tests\\round-3c-production-export.test.mjs
node pipeline\\scripts\\round-3c-production-export.mjs --batch-size 250 --resume
\`\`\`
`;
}

function buildAssetSheetHtml({ title, repoRoot, fromDir, assets }) {
  const rows = assets.map((asset) => `
<tr>
  <th><div>${escapeHtml(asset.assetId)}</div><div>${escapeHtml(asset.originalCategory)}</div><div>${escapeHtml(asset.sourceRelativePath)}</div></th>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.sourceRelativePath))}" alt=""></td>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.svgPath))}" alt=""></td>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.pngPreviewPath))}" alt=""></td>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.thumbnailPath))}" alt=""></td>
  <td>${escapeHtml((asset.round3a1WarningFlags || []).join(", "))}</td>
  <td>${asset.svgFileSizeBytes}</td>
  <td>${asset.pathCount ?? ""}</td>
</tr>`).join("\n");
  return htmlPage(title, `
<table>
<thead><tr><th>Item</th><th>Source</th><th>SVG Render</th><th>PNG Preview</th><th>Thumbnail</th><th>Warnings</th><th>SVG bytes</th><th>Paths</th></tr></thead>
<tbody>${rows}</tbody>
</table>`);
}

function buildQuarantineSheetHtml({ repoRoot, fromDir, quarantineEntries, skippedEntries }) {
  const rows = [...quarantineEntries, ...skippedEntries].map((entry) => `
<tr>
  <th><div>${escapeHtml(entry.assetId)}</div><div>${escapeHtml(entry.sourceRelativePath)}</div></th>
  <td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, entry.sourceRelativePath))}" alt=""></td>
  <td>${escapeHtml(entry.failureStage)}</td>
  <td>${escapeHtml((entry.reasonCodes || []).join(", "))}</td>
  <td>${escapeHtml(entry.errorSummary)}</td>
</tr>`).join("\n");
  return htmlPage("Round 3C Quarantine", `<table><tbody>${rows}</tbody></table>`);
}

function buildPassQuarantineHtml({ repoRoot, fromDir, assets, quarantineEntries, skippedEntries }) {
  const passRows = assets.map((asset) => `
<tr><td>pass</td><td>${escapeHtml(asset.assetId)}</td><td>${escapeHtml(asset.sourceRelativePath)}</td><td><img src="${escapeHtml(relativeFrom(fromDir, repoRoot, asset.pngPreviewPath))}" alt=""></td><td>${escapeHtml((asset.round3a1WarningFlags || []).join(", "))}</td></tr>`).join("\n");
  const failRows = [...quarantineEntries, ...skippedEntries].map((entry) => `
<tr><td>${escapeHtml(entry.status)}</td><td>${escapeHtml(entry.assetId)}</td><td>${escapeHtml(entry.sourceRelativePath)}</td><td>${escapeHtml((entry.reasonCodes || []).join(", "))}</td><td>${escapeHtml((entry.round3a1WarningFlags || []).join(", "))}</td></tr>`).join("\n");
  return htmlPage("Round 3C Pass Quarantine Summary", `
<h2>Passed Sample</h2>
<table><tbody>${passRows}</tbody></table>
<h2>Quarantined Or Skipped</h2>
<table><tbody>${failRows}</tbody></table>`);
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

function buildCategoryCounts(selectedEntries, passedAssets, quarantineEntries, skippedEntries) {
  const categories = new Map();
  for (const source of selectedEntries) {
    const category = source.category || "uncategorized";
    if (!categories.has(category)) {
      categories.set(category, { requested: 0, processed: 0, passed: 0, quarantined: 0, skipped: 0, warningImages: 0 });
    }
    const counts = categories.get(category);
    counts.requested += 1;
    if ((source.warningCodes || []).length || source.status === "approved_with_warning") counts.warningImages += 1;
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
  if (!categories.has(key)) categories.set(key, { requested: 0, processed: 0, passed: 0, quarantined: 0, skipped: 0, warningImages: 0 });
  return categories.get(key);
}

async function loadExistingRound3CState(repoRoot) {
  const assets = await readJson(path.join(repoRoot, ROUND3C_PROJECT_MANIFESTS[1])).catch(() => ({ assets: [] }));
  const quarantine = await readJson(path.join(repoRoot, ROUND3C_PROJECT_MANIFESTS[2])).catch(() => ({ entries: [], skipped: [] }));
  return {
    assetsByPath: mapByPath(assets.assets || []),
    quarantineByPath: mapByPath(quarantine.entries || []),
    skippedByPath: mapByPath(quarantine.skipped || []),
  };
}

function emptyExistingState() {
  return { assetsByPath: new Map(), quarantineByPath: new Map(), skippedByPath: new Map() };
}

async function reusableAssetOutputsExist(asset, repoRoot) {
  for (const repoRelativePath of [asset.svgPath, asset.pngPreviewPath, asset.thumbnailPath]) {
    const s = await stat(path.join(repoRoot, ...repoRelativePath.split("/"))).catch(() => null);
    if (!s || s.size <= 0) return false;
  }
  return true;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function appendJsonLog(logPath, record) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

function mapByPath(entries = []) {
  return new Map(entries.map((entry) => [entry.sourceRelativePath, entry]));
}

function getThresholds(policy) {
  return { ...DEFAULT_THRESHOLDS, ...(policy?.productionReadyOutputSpec?.passThresholds || {}) };
}

function stagedError(stage, reasonCode, message) {
  const error = new Error(message);
  error.stage = stage;
  error.reasonCode = reasonCode;
  return error;
}

function classifyErrorStage(error) {
  return error?.stage || "conversion";
}

function reasonCodeFromError(error) {
  return error?.reasonCode || (classifyErrorStage(error) === "thumbnail" ? "thumbnail_failed" : classifyErrorStage(error) === "preview" ? "preview_failed" : "conversion_failed");
}

function buildTitleCandidate(entry) {
  const base = path.posix.basename(String(entry.filename || entry.sourceRelativePath || "coloring page"), path.posix.extname(entry.filename || entry.sourceRelativePath || ""));
  return titleCase(base.replace(/[-_]+/g, " "));
}

function deterministicSample(items, limit, salt = "sample") {
  return [...items]
    .sort((a, b) => stableHash(`${salt}:${a.assetId || a.sourceRelativePath}`).localeCompare(stableHash(`${salt}:${b.assetId || b.sourceRelativePath}`)))
    .slice(0, limit)
    .sort(compareByAssetId);
}

function topBy(items, scoreFn, limit) {
  return [...items]
    .sort((a, b) => Number(scoreFn(b) || 0) - Number(scoreFn(a) || 0) || compareByAssetId(a, b))
    .slice(0, limit);
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const group of groups.values()) group.sort(compareByAssetId);
  return groups;
}

function countValues(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
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
      options[key] = Number.isFinite(Number(next)) ? Number(next) : next;
      index += 1;
    }
  }
  return options;
}

if (process.argv[1] === __filename) {
  runRound3CProductionExport(parseArgs(process.argv.slice(2)))
    .then(({ results, resumeState }) => {
      console.log(JSON.stringify({
        runId: results.runId,
        totalApprovedRequested: results.totalApprovedRequested,
        totalProcessed: results.totalProcessed,
        totalPassed: results.totalPassed,
        totalQuarantined: results.totalQuarantined,
        totalSkipped: results.totalSkipped,
        warningImageCount: results.warningImageCount,
        processedNowCount: resumeState.processedNowCount,
        reusedSuccessCount: resumeState.reusedSuccessCount,
        reusedQuarantineCount: resumeState.reusedQuarantineCount,
        preset: results.presetPolicyUsed.presetId,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
