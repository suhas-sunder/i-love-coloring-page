import { createHash } from "node:crypto";
import { createRequire, registerHooks } from "node:module";
import {
  appendFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ILOVE_SVG_ROOT = path.join(REPO_ROOT, "ilovesvg");
const MANIFEST_DIR = path.join(REPO_ROOT, "pipeline", "manifests");
const REPORT_DIR = path.join(REPO_ROOT, "pipeline", "reports");
const BAKEOFF_ROOT = path.join(REPO_ROOT, "pipeline", "bakeoffs", "round-2");
const REVIEW_ROOT = path.join(REPO_ROOT, "pipeline", "review");

const DEFAULT_SAMPLE_SIZE = 250;
const DEFAULT_CALIBRATION_SIZE = 50;
const DEFAULT_SHORTLIST_SIZE = 16;
const DEFAULT_ADVANCED_COUNT = 4;
const ROUND2_GENERATED_AT = "2026-05-09";

const PRESET_SHORTLIST_PRIORITY = [
  {
    id: "line-clean",
    reason: "Primary line-art baseline with balanced threshold and moderate cleanup.",
  },
  {
    id: "line-smooth",
    reason: "Smoother line-art candidate for polished printable outlines.",
  },
  {
    id: "line-sharp",
    reason: "Sharper line-art candidate for thin or detailed work.",
  },
  {
    id: "line-thin",
    reason: "Thin-line preservation candidate for delicate source art.",
  },
  {
    id: "line-thick",
    reason: "Thicker-line candidate for bold output and weak source outlines.",
  },
  {
    id: "line-low-noise",
    reason: "Noise-reduction line-art candidate for speckles and small islands.",
  },
  {
    id: "drawing-ink",
    reason: "Drawing preset tuned for ink-like coloring page sources.",
  },
  {
    id: "drawing-smooth-ink",
    reason: "Smooth drawing preset for cleaner professional-looking curves.",
  },
  {
    id: "drawing-bold-strokes",
    reason: "Bold drawing preset for heavier outlines and subject readability.",
  },
  {
    id: "sketch-clean-lines",
    reason: "Sketch cleanup preset for edge-assisted line recovery.",
  },
  {
    id: "scan-ink-cleanup",
    reason: "Scan cleanup preset for removing small artifacts.",
  },
  {
    id: "scan-fine-marks",
    reason: "Scan preset that preserves fine marks and internal detail.",
  },
  {
    id: "photo-edge-contour",
    reason: "Edge-contour baseline to test whether edge preprocessing helps complex scenes.",
  },
  {
    id: "stroke-trace-clean-lines",
    reason: "Centerline stroke baseline for clean line drawings.",
  },
  {
    id: "crisp-cartoon-stroke",
    reason: "Centerline cartoon candidate for thick ink and character outlines.",
  },
  {
    id: "fine-pen-centerline",
    reason: "Centerline candidate for very fine linework and internal details.",
  },
  {
    id: "clean-ink-centerline",
    reason: "Centerline ink candidate for thick ink strokes.",
  },
  {
    id: "diagram-technical",
    reason: "Technical line baseline for clean geometric or landmark-style drawings.",
  },
];

const DEFAULT_SETTINGS = {
  traceMode: "single",
  strokeOutputMode: "filled",
  preprocess: "none",
  blurSigma: 0.8,
  edgeBoost: 1,
  threshold: 224,
  turdSize: 2,
  optTolerance: 0.28,
  turnPolicy: "minority",
  lineColor: "#000000",
  transparent: true,
  bgColor: "#ffffff",
  invert: false,
  maxTraceSide: 1200,
  centerlineMaxTraceSide: 900,
  centerlineStrokeWidth: 2,
  centerlineSimplifyTolerance: 1.1,
  centerlineMinPathLength: 5,
};

let runtimePromise = null;
let hooksRegistered = false;

export function buildRound2SampleManifest(candidates, options = {}) {
  const targetSize = Math.min(
    Number(options.targetSize || DEFAULT_SAMPLE_SIZE),
    candidates.length,
  );
  const groups = new Map();
  for (const candidate of candidates) {
    const category = candidate.category;
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(candidate);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => stableHash(a.sourceRelativePath).localeCompare(stableHash(b.sourceRelativePath)));
  }

  const categories = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const allocations = new Map(categories.map((category) => [category, 0]));

  for (const category of categories) {
    if (sumMap(allocations) >= targetSize) break;
    allocations.set(category, 1);
  }

  while (sumMap(allocations) < targetSize) {
    let bestCategory = null;
    let bestScore = -Infinity;
    for (const category of categories) {
      const group = groups.get(category) || [];
      const allocated = allocations.get(category) || 0;
      if (allocated >= group.length) continue;
      const humanWeight = group.some((sample) => sample.likelyHumanAdjacent) ? 2.2 : 1;
      const signalWeight = group.some((sample) =>
        (sample.selectionSignals || []).some((signal) =>
          ["high_detail", "complex_scene", "thin_line_candidate", "thick_line_candidate"].includes(signal),
        ),
      )
        ? 1.15
        : 1;
      const score = (humanWeight * signalWeight * Math.sqrt(group.length)) / (allocated + 1);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    if (!bestCategory) break;
    allocations.set(bestCategory, (allocations.get(bestCategory) || 0) + 1);
  }

  const samples = [];
  for (const category of categories) {
    const picked = pickEvenly(groups.get(category) || [], allocations.get(category) || 0);
    samples.push(...picked);
  }

  const normalized = samples
    .sort((a, b) => Number(a.samplePriority || 0) - Number(b.samplePriority || 0) || a.sourceRelativePath.localeCompare(b.sourceRelativePath))
    .map((sample, index) => ({
      sampleId: buildSampleId(sample, index + 1),
      sampleIndex: index + 1,
      sourceRelativePath: sample.sourceRelativePath,
      workingInputPath: sample.sourceRelativePath,
      copiedToPipelineSamples: false,
      category: sample.category,
      nestedCategory: sample.nestedCategory || null,
      filename: sample.filename,
      fileSizeBytes: sample.fileSizeBytes,
      dimensions: sample.dimensions,
      likelyHumanAdjacent: Boolean(sample.likelyHumanAdjacent),
      selectionSignals: sample.selectionSignals || ["baseline"],
      reviewPriority: sample.likelyHumanAdjacent ? "high" : "normal",
      notes: sample.likelyHumanAdjacent
        ? ["Requires stricter anatomy review after conversion."]
        : ["Conversion quality review sample."],
    }));

  return {
    generatedAt: ROUND2_GENERATED_AT,
    sourceManifest: "pipeline/manifests/sample-candidates.json",
    targetSampleSize: targetSize,
    actualSampleSize: normalized.length,
    strategy:
      "Uses round 1 sample candidates, preserves category coverage, oversamples human-adjacent categories, and does not copy or modify source images.",
    samples: normalized,
  };
}

export function selectCalibrationSubset(samples, targetSize = DEFAULT_CALIBRATION_SIZE) {
  const target = Math.min(targetSize, samples.length);
  const groups = new Map();
  for (const sample of samples) {
    if (!groups.has(sample.category)) groups.set(sample.category, []);
    groups.get(sample.category).push(sample);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => stableHash(a.sampleId).localeCompare(stableHash(b.sampleId)));
  }

  const categories = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const allocations = new Map(categories.map((category) => [category, 0]));
  for (const category of categories) {
    if (sumMap(allocations) >= target) break;
    allocations.set(category, 1);
  }

  while (sumMap(allocations) < target) {
    let bestCategory = null;
    let bestScore = -Infinity;
    for (const category of categories) {
      const group = groups.get(category) || [];
      const allocated = allocations.get(category) || 0;
      if (allocated >= group.length) continue;
      const humanWeight = group.some((sample) => sample.likelyHumanAdjacent) ? 2 : 1;
      const score = (humanWeight * Math.sqrt(group.length)) / (allocated + 1);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    if (!bestCategory) break;
    allocations.set(bestCategory, (allocations.get(bestCategory) || 0) + 1);
  }

  const picked = [];
  for (const category of categories) {
    picked.push(...pickEvenly(groups.get(category) || [], allocations.get(category) || 0));
  }
  return picked.sort((a, b) => a.sampleIndex - b.sampleIndex);
}

export function buildPresetShortlist(inventory, options = {}) {
  const targetSize = Number(options.targetSize || DEFAULT_SHORTLIST_SIZE);
  const presets = Array.isArray(inventory?.presets) ? inventory.presets : [];
  const selected = [];
  const seen = new Set();

  for (const item of PRESET_SHORTLIST_PRIORITY) {
    const preset = presets.find((candidate) => candidate.presetId === item.id);
    if (!preset) continue;
    if (isLayeredPreset(preset)) continue;
    if (seen.has(preset.presetId)) continue;
    seen.add(preset.presetId);
    selected.push({
      ...preset,
      shortlistReason: item.reason,
      presetFamily: inferPresetFamily(preset),
    });
    if (selected.length >= targetSize) break;
  }

  if (selected.length < targetSize) {
    const fallback = presets
      .filter((preset) => preset.appearsSuitableForColoringPageConversion)
      .filter((preset) => !isLayeredPreset(preset))
      .filter((preset) => !seen.has(preset.presetId))
      .sort((a, b) => scorePresetForShortlist(b) - scorePresetForShortlist(a) || a.presetName.localeCompare(b.presetName));
    for (const preset of fallback) {
      seen.add(preset.presetId);
      selected.push({
        ...preset,
        shortlistReason: "Fallback candidate selected from line-art-like inventory scoring.",
        presetFamily: inferPresetFamily(preset),
      });
      if (selected.length >= targetSize) break;
    }
  }

  return {
    generatedAt: ROUND2_GENERATED_AT,
    sourceManifest: "pipeline/manifests/conversion-preset-inventory.json",
    targetShortlistSize: targetSize,
    actualShortlistSize: selected.length,
    selectionRules: [
      "Avoid brute-forcing all likely candidates.",
      "Prefer shared line-art, drawing, scan, sketch, and centerline presets.",
      "Exclude layered color presets from this coloring-page bakeoff shortlist.",
      "Keep the shortlist modest enough for Stage A calibration.",
    ],
    presets: selected.map((preset, index) => ({
      shortlistRank: index + 1,
      presetId: preset.presetId,
      presetName: preset.presetName,
      presetFamily: preset.presetFamily,
      whereDefined: preset.whereDefined,
      relevantParameters: normalizeSettings(preset.relevantParameters),
      commandOrFunctionNeededToInvoke: preset.commandOrFunctionNeededToInvoke,
      shortlistReason: preset.shortlistReason,
      notes: preset.notes || [],
    })),
  };
}

export async function loadIloveSvgRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    registerIloveSvgImportHooks();
    const requireFromIloveSvg = createRequire(path.join(ILOVE_SVG_ROOT, "package.json"));
    const sharp = requireFromIloveSvg("sharp");
    sharp.concurrency?.(1);
    sharp.cache?.({ files: 0, memory: 96 });

    const serverFallback = await importIloveSvgModule("app/shared/tracing/serverFallback.server.ts");
    const converterSettings = await importIloveSvgModule("app/utils/converterSettings.server.ts");
    const centerline = await importIloveSvgModule("app/shared/tracing/centerlineTrace.ts");
    return {
      sharp,
      runSharedRasterNormalization: serverFallback.runSharedRasterNormalization,
      runSharedPotraceSvgTrace: serverFallback.runSharedPotraceSvgTrace,
      annotateSharedSingleTraceSvg: serverFallback.annotateSharedSingleTraceSvg,
      runSharedLayeredColorTrace: serverFallback.runSharedLayeredColorTrace,
      applyTraceSvgOutputSettings: converterSettings.applyTraceSvgOutputSettings,
      traceCenterlineRasterToSvg: centerline.traceCenterlineRasterToSvg,
    };
  })();
  return runtimePromise;
}

export async function runSingleConversion({
  inputPath,
  preset,
  outputSvgPath,
  outputPreviewPath,
  logPath,
  runtime,
  sample = null,
  stage = "single",
}) {
  const resolvedRuntime = runtime || (await loadIloveSvgRuntime());
  const settings = normalizeSettings(preset.relevantParameters || preset.settings || {});
  const recordBase = {
    stage,
    sampleId: sample?.sampleId || null,
    sourceRelativePath: sample?.sourceRelativePath || toRepoRelative(inputPath),
    presetId: preset.presetId,
    presetName: preset.presetName,
    outputSvgPath: outputSvgPath ? toRepoRelative(outputSvgPath) : null,
    outputPreviewPath: outputPreviewPath ? toRepoRelative(outputPreviewPath) : null,
  };

  try {
    const input = await readFile(inputPath);
    const inputMetadata = await resolvedRuntime.sharp(input, { limitInputPixels: false }).metadata();
    const result = await convertPngToSvg({
      input,
      settings,
      runtime: resolvedRuntime,
      inputMetadata,
    });

    await mkdir(path.dirname(outputSvgPath), { recursive: true });
    await writeFile(outputSvgPath, result.svg, "utf8");

    const preview = await renderSvgPreview({
      svg: result.svg,
      outputPreviewPath,
      sharp: resolvedRuntime.sharp,
    });

    const metrics = {
      renderSucceeded: preview.renderSucceeded,
      darkPixelRatio: preview.darkPixelRatio,
      svgBytes: Buffer.byteLength(result.svg),
      pathCount: countSvgPaths(result.svg),
      width: result.width,
      height: result.height,
      engineUsed: result.engineUsed,
    };
    const score = scoreConversionMetrics({
      ...metrics,
      humanAdjacent: Boolean(sample?.likelyHumanAdjacent),
    });

    const record = {
      ...recordBase,
      status: "success",
      metrics,
      score,
    };
    await appendJsonLog(logPath, record);
    return record;
  } catch (error) {
    const record = {
      ...recordBase,
      status: "error",
      error: String(error?.message || error),
      metrics: null,
      score: scoreConversionMetrics({
        renderSucceeded: false,
        darkPixelRatio: 0,
        svgBytes: 0,
        pathCount: 0,
        humanAdjacent: Boolean(sample?.likelyHumanAdjacent),
      }),
    };
    await appendJsonLog(logPath, record);
    return record;
  }
}

export function scoreConversionMetrics(metrics) {
  const flags = [];
  const humanReviewFlags = [];
  let qualityScore = 100;
  const dark = Number(metrics.darkPixelRatio || 0);
  const svgBytes = Number(metrics.svgBytes || 0);
  const pathCount = Number(metrics.pathCount || 0);

  if (!metrics.renderSucceeded) {
    flags.push("render_failed");
    qualityScore -= 70;
  }
  if (dark < 0.004) {
    flags.push("blank_or_missing_subject");
    qualityScore -= 45;
  }
  if (dark > 0.55) {
    flags.push("overfilled_or_blobbed_output");
    qualityScore -= 42;
  }
  if (dark > 0.35 && dark <= 0.55) {
    flags.push("heavy_ink_coverage");
    qualityScore -= 18;
  }
  if (dark > 0.004 && dark < 0.012) {
    flags.push("thin_or_faint_output");
    qualityScore -= 16;
  }
  if (svgBytes > 2_000_000 || pathCount > 2_500) {
    flags.push("excessive_svg_complexity");
    qualityScore -= 24;
  } else if (svgBytes > 1_000_000 || pathCount > 1_200) {
    flags.push("high_svg_complexity");
    qualityScore -= 10;
  }
  if (pathCount <= 0 && metrics.renderSucceeded) {
    flags.push("no_svg_paths_detected");
    qualityScore -= 35;
  }
  if (pathCount > 0 && pathCount < 2 && svgBytes < 10_000 && dark > 0.02) {
    flags.push("possible_hollow_or_merged_subject");
    qualityScore -= 12;
  }

  if (metrics.humanAdjacent) {
    humanReviewFlags.push("requires_manual_anatomy_review");
    if (flags.length) {
      humanReviewFlags.push("conversion_issue_on_human_adjacent_image");
    }
  }

  const printableColoringPageCandidate =
    metrics.renderSucceeded &&
    dark >= 0.004 &&
    dark <= 0.55 &&
    !flags.includes("excessive_svg_complexity") &&
    !flags.includes("blank_or_missing_subject") &&
    !flags.includes("overfilled_or_blobbed_output");

  return {
    qualityScore: clamp(Math.round(qualityScore), 0, 100),
    printableColoringPageCandidate,
    flags,
    humanReviewFlags,
    uncertainty:
      metrics.humanAdjacent
        ? "Anatomy cannot be verified automatically. Manual review is required."
        : "Automated scoring is heuristic and should be sampled manually.",
  };
}

export async function runRound2Bakeoff(options = {}) {
  const sampleSize = Number(options.sampleSize || DEFAULT_SAMPLE_SIZE);
  const calibrationSize = Number(options.calibrationSize || DEFAULT_CALIBRATION_SIZE);
  const shortlistSize = Number(options.shortlistSize || DEFAULT_SHORTLIST_SIZE);
  const advancedCount = Number(options.advancedCount || DEFAULT_ADVANCED_COUNT);

  await mkdir(MANIFEST_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
  await rm(BAKEOFF_ROOT, { recursive: true, force: true });
  await mkdir(BAKEOFF_ROOT, { recursive: true });

  const sampleCandidates = await readJson(path.join(MANIFEST_DIR, "sample-candidates.json"));
  const presetInventory = await readJson(path.join(MANIFEST_DIR, "conversion-preset-inventory.json"));
  const categorySummary = await readJson(path.join(MANIFEST_DIR, "category-summary.json"));
  const assumptions = await readJson(path.join(MANIFEST_DIR, "pipeline-assumptions.json"));

  const sampleManifest = buildRound2SampleManifest(sampleCandidates.candidates, {
    targetSize: sampleSize,
  });
  await writeJson(path.join(MANIFEST_DIR, "round-2-sample-manifest.json"), sampleManifest);

  const shortlist = buildPresetShortlist(presetInventory, { targetSize: shortlistSize });
  await writeJson(path.join(MANIFEST_DIR, "round-2-preset-shortlist.json"), shortlist);

  const calibrationSamples = selectCalibrationSubset(sampleManifest.samples, calibrationSize);
  const runtime = await loadIloveSvgRuntime();

  const stageAResults = await runStage({
    stage: "stage-a",
    samples: calibrationSamples,
    presets: shortlist.presets,
    runtime,
  });
  const stageAAggregates = aggregatePresetResults(stageAResults);
  const advancedPresets = chooseAdvancedPresets(shortlist.presets, stageAAggregates, advancedCount);
  const calibrationManifest = {
    generatedAt: ROUND2_GENERATED_AT,
    stage: "calibration",
    calibrationSubsetSize: calibrationSamples.length,
    presetShortlistSize: shortlist.presets.length,
    advancedPresetCount: advancedPresets.length,
    advancedPresetIds: advancedPresets.map((preset) => preset.presetId),
    aggregates: stageAAggregates,
    results: stageAResults,
  };
  await writeJson(path.join(MANIFEST_DIR, "round-2-calibration-results.json"), calibrationManifest);

  const stageBResults = await runStage({
    stage: "stage-b",
    samples: sampleManifest.samples,
    presets: advancedPresets,
    runtime,
  });
  const stageBAggregates = aggregatePresetResults(stageBResults);
  const bakeoffManifest = {
    generatedAt: ROUND2_GENERATED_AT,
    stage: "main-bakeoff",
    sampleSize: sampleManifest.samples.length,
    presetCount: advancedPresets.length,
    presetIds: advancedPresets.map((preset) => preset.presetId),
    aggregates: stageBAggregates,
    results: stageBResults,
  };
  await writeJson(path.join(MANIFEST_DIR, "round-2-bakeoff-results.json"), bakeoffManifest);

  const policy = deriveRecommendedPolicy({
    samples: sampleManifest.samples,
    stageBAggregates,
    stageBResults,
    advancedPresets,
  });
  await writeJson(path.join(MANIFEST_DIR, "round-2-recommended-policy.json"), policy);

  const flagged = buildFlaggedImages({
    samples: sampleManifest.samples,
    stageBResults,
    policy,
  });
  await writeJson(path.join(MANIFEST_DIR, "round-2-flagged-images.json"), flagged);

  await writeReviewArtifacts({
    sampleManifest,
    calibrationSamples,
    shortlist,
    advancedPresets,
    stageAResults,
    stageBResults,
    flagged,
  });

  await writeFile(
    path.join(REPORT_DIR, "round-2-bakeoff-report.md"),
    buildBakeoffReport({
      sampleManifest,
      shortlist,
      calibrationManifest,
      bakeoffManifest,
      policy,
      assumptions,
      categorySummary,
    }),
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-2-qa-findings.md"),
    buildQaReport({ flagged, policy, categorySummary }),
    "utf8",
  );

  return {
    sampleManifest,
    shortlist,
    calibrationManifest,
    bakeoffManifest,
    flagged,
    policy,
  };
}

async function runStage({ stage, samples, presets, runtime }) {
  const results = [];
  const logPath = path.join(BAKEOFF_ROOT, "logs", `${stage}.jsonl`);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, "", "utf8");

  for (const preset of presets) {
    for (const sample of samples) {
      const inputPath = path.join(REPO_ROOT, sample.sourceRelativePath);
      const outputBase = path.join(BAKEOFF_ROOT, stage, preset.presetId, sample.sampleId);
      const result = await runSingleConversion({
        inputPath,
        preset,
        outputSvgPath: `${outputBase}.svg`,
        outputPreviewPath: `${outputBase}.png`,
        logPath,
        runtime,
        sample,
        stage,
      });
      results.push(result);
    }
  }

  return results.sort(compareResultStable);
}

async function convertPngToSvg({ input, settings, runtime, inputMetadata }) {
  if (settings.strokeOutputMode === "centerline") {
    const maxSide = clamp(Number(settings.centerlineMaxTraceSide || 900), 64, 1100);
    const raw = await runtime.sharp(input, { limitInputPixels: false })
      .rotate()
      .resize({
        width: maxSide,
        height: maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const traced = runtime.traceCenterlineRasterToSvg(
      {
        data: raw.data,
        width: raw.info.width,
        height: raw.info.height,
      },
      settings,
    );
    return {
      svg: traced.svg,
      width: traced.width,
      height: traced.height,
      engineUsed: "centerline",
    };
  }

  if (settings.traceMode === "layered") {
    const layered = await runtime.runSharedLayeredColorTrace(input, {
      layerCount: Math.round(Number(settings.colorLayerCount || 5)),
      maxTraceSide: clamp(Number(settings.layerMaxTraceSide || settings.maxTraceSide || 1200), 64, 1400),
      minRegionPercent: Number(settings.minRegionPercent || 0.35),
      optTolerance: Number(settings.layerOptTolerance || settings.optTolerance || 0.45),
      turdSize: Math.round(Number(settings.layerTurdSize || settings.turdSize || 4)),
      posterize: settings.posterize !== false,
      removeWhite: Boolean(settings.removeWhite),
      removeTransparent: settings.removeTransparent !== false,
      transparent: settings.transparent !== false,
      bgColor: settings.bgColor || "#ffffff",
      turnPolicy: settings.layerTurnPolicy || settings.turnPolicy || "majority",
    });
    return {
      svg: layered.svg,
      width: layered.width,
      height: layered.height,
      engineUsed: "potrace-layered",
    };
  }

  const prepped = await runtime.runSharedRasterNormalization(input, {
    preprocess: settings.preprocess === "edge" || settings.preprocess === "ink-stroke" ? "edge" : "none",
    blurSigma: Number(settings.blurSigma || 0.8),
    edgeBoost: Number(settings.edgeBoost || 1),
    threshold: Number(settings.threshold || 224),
    maxTraceSide: clamp(Number(settings.maxTraceSide || 1200), 64, 1400),
    brightness: Number(settings.brightness || 0),
    contrast: Number(settings.contrast || 0),
    edgeThreshold: Number(settings.edgeThreshold || 18),
    edgeThickness: Number(settings.edgeThickness || 1),
    noiseReduction: Number(settings.noiseReduction || 0),
    gapCloseStrength: Number(settings.gapCloseStrength || 0),
    minIslandPx: Number(settings.minIslandPx || 0),
    holeFillPx: Number(settings.holeFillPx || 0),
  });

  const rawSvg = await runtime.runSharedPotraceSvgTrace(prepped, {
    color: "#000000",
    threshold: Number(settings.threshold || 224),
    turdSize: Math.round(Number(settings.turdSize || 2)),
    optTolerance: Number(settings.optTolerance || 0.28),
    turnPolicy: settings.turnPolicy || "minority",
    invert: false,
    blackOnWhite: true,
  });

  const dimensions = readSvgDimensions(rawSvg) || {
    width: Number(inputMetadata.width || 1024),
    height: Number(inputMetadata.height || 1024),
  };
  const recolored = recolorSvgPaths(rawSvg, settings.lineColor || "#000000");
  const annotated = runtime.annotateSharedSingleTraceSvg(recolored, settings.lineColor || "#000000");
  const adjusted = runtime.applyTraceSvgOutputSettings(
    annotated.svg,
    {
      fillStrokeWidth: Number(settings.fillStrokeWidth || 0),
      fillStrokeColor: settings.fillStrokeColor || "#020617",
      outputWidth: Number(settings.outputWidth || 0),
      outputHeight: Number(settings.outputHeight || 0),
      preserveAspectRatio: settings.preserveAspectRatio !== false,
    },
    dimensions,
  );

  return {
    svg: adjusted.svg,
    width: adjusted.width,
    height: adjusted.height,
    engineUsed: "potrace",
  };
}

async function renderSvgPreview({ svg, outputPreviewPath, sharp }) {
  try {
    let image = sharp(Buffer.from(svg), { density: 144 })
      .flatten({ background: "#ffffff" })
      .resize({
        width: 512,
        height: 512,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png();
    const buffer = await image.toBuffer();
    if (outputPreviewPath) {
      await mkdir(path.dirname(outputPreviewPath), { recursive: true });
      await writeFile(outputPreviewPath, buffer);
    }
    const darkPixelRatio = await measureDarkPixelRatio(buffer, sharp);
    return {
      renderSucceeded: true,
      darkPixelRatio,
    };
  } catch {
    return {
      renderSucceeded: false,
      darkPixelRatio: 0,
    };
  }
}

async function measureDarkPixelRatio(buffer, sharp) {
  const raw = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (const value of raw.data) {
    if (value < 190) dark += 1;
  }
  return round(dark / Math.max(1, raw.data.length), 5);
}

function aggregatePresetResults(results) {
  const groups = new Map();
  for (const result of results) {
    if (!groups.has(result.presetId)) groups.set(result.presetId, []);
    groups.get(result.presetId).push(result);
  }

  return [...groups.entries()]
    .map(([presetId, presetResults]) => {
      const successes = presetResults.filter((result) => result.status === "success");
      const scores = successes.map((result) => Number(result.score?.qualityScore || 0));
      const allFlags = presetResults.flatMap((result) => result.score?.flags || []);
      return {
        presetId,
        presetName: presetResults[0]?.presetName || presetId,
        totalRuns: presetResults.length,
        successCount: successes.length,
        errorCount: presetResults.length - successes.length,
        successRate: round(successes.length / Math.max(1, presetResults.length), 4),
        averageQualityScore: round(average(scores), 2),
        printableCandidateRate: round(
          successes.filter((result) => result.score?.printableColoringPageCandidate).length /
            Math.max(1, successes.length),
          4,
        ),
        averageDarkPixelRatio: round(
          average(successes.map((result) => Number(result.metrics?.darkPixelRatio || 0))),
          5,
        ),
        averageSvgBytes: Math.round(
          average(successes.map((result) => Number(result.metrics?.svgBytes || 0))),
        ),
        averagePathCount: Math.round(
          average(successes.map((result) => Number(result.metrics?.pathCount || 0))),
        ),
        flagCounts: countValues(allFlags),
      };
    })
    .sort(compareAggregateRank);
}

function chooseAdvancedPresets(shortlistPresets, aggregates, advancedCount) {
  const byId = new Map(shortlistPresets.map((preset) => [preset.presetId, preset]));
  return aggregates
    .filter((aggregate) => aggregate.successCount > 0)
    .slice()
    .sort(compareAggregateRank)
    .slice(0, advancedCount)
    .map((aggregate) => byId.get(aggregate.presetId))
    .filter(Boolean);
}

function deriveRecommendedPolicy({ samples, stageBAggregates, stageBResults, advancedPresets }) {
  const overall = stageBAggregates.slice().sort(compareAggregateRank)[0];
  const byId = new Map(advancedPresets.map((preset) => [preset.presetId, preset]));
  const defaultPreset = byId.get(overall?.presetId) || advancedPresets[0];
  const signalTops = [];

  const highDetailTop = topPresetForSampleFilter(stageBResults, samples, (sample) =>
    (sample.selectionSignals || []).some((signal) =>
      ["high_detail", "complex_scene"].includes(signal),
    ),
  );
  if (
    highDetailTop &&
    defaultPreset &&
    highDetailTop.presetId !== defaultPreset.presetId &&
    highDetailTop.averageQualityScore >= overall.averageQualityScore + 3
  ) {
    signalTops.push({
      when: "selectionSignals include high_detail or complex_scene",
      presetId: highDetailTop.presetId,
      reason: "Scored materially better on high-detail or scene-like samples.",
    });
  }

  const humanTop = topPresetForSampleFilter(stageBResults, samples, (sample) => sample.likelyHumanAdjacent);
  if (
    humanTop &&
    defaultPreset &&
    humanTop.presetId !== defaultPreset.presetId &&
    humanTop.averageQualityScore >= overall.averageQualityScore + 3
  ) {
    signalTops.push({
      when: "likelyHumanAdjacent is true",
      presetId: humanTop.presetId,
      reason: "Scored materially better on human-adjacent samples, still requires manual anatomy review.",
    });
  }

  return {
    generatedAt: ROUND2_GENERATED_AT,
    recommendationType: signalTops.length ? "simple_rule_based_policy" : "single_default_preset",
    defaultPreset: {
      presetId: defaultPreset?.presetId || null,
      presetName: defaultPreset?.presetName || null,
      reason:
        "Highest Stage B aggregate score with successful render rate and manageable complexity.",
    },
    conditionalRules: signalTops,
    manualReviewPolicy: [
      "All human-adjacent images require manual anatomy review before production approval.",
      "Any image with render, blank, overfilled, or excessive-complexity flags is quarantined for manual review.",
      "Automatic anatomy detection is not considered authoritative.",
    ],
    productionReadyOutputSpec: {
      svgExpectations: [
        "Valid SVG with viewBox or width and height.",
        "Black or near-black linework on transparent or white background.",
        "Readable subject with no blank or overfilled output.",
        "Manageable file size and path count for gallery use.",
      ],
      pngPreviewExpectations: [
        "White-background PNG preview rendered from the SVG.",
        "Preview should match the normalized SVG bounds.",
        "Preview is for QA and thumbnails only, not the source of record.",
      ],
      namingConvention:
        "Use deterministic IDs derived from category, original filename, and short source-path hash.",
      metadataConvention:
        "Store category, sourceRelativePath, presetId, conversion status, metrics, flags, review status, and CDN asset paths.",
      quarantineCriteria: [
        "render_failed",
        "blank_or_missing_subject",
        "overfilled_or_blobbed_output",
        "excessive_svg_complexity",
        "human-adjacent images lacking manual signoff",
      ],
      manualReviewTriggers: [
        "human-adjacent category",
        "conversion flags",
        "low Stage B quality score",
        "duplicate filename collision",
      ],
      passThresholds: {
        minimumQualityScore: 70,
        maximumDarkPixelRatio: 0.55,
        minimumDarkPixelRatio: 0.004,
        maximumSvgBytesPreferred: 2_000_000,
        maximumPathCountPreferred: 2500,
      },
    },
  };
}

function topPresetForSampleFilter(results, samples, predicate) {
  const allowed = new Set(samples.filter(predicate).map((sample) => sample.sampleId));
  if (!allowed.size) return null;
  const filtered = results.filter((result) => allowed.has(result.sampleId));
  return aggregatePresetResults(filtered)[0] || null;
}

function buildFlaggedImages({ samples, stageBResults, policy }) {
  const defaultPresetId = policy.defaultPreset.presetId;
  const bySample = new Map(samples.map((sample) => [sample.sampleId, sample]));
  const defaultResults = stageBResults.filter((result) => result.presetId === defaultPresetId);
  const flagged = [];
  for (const result of defaultResults) {
    const sample = bySample.get(result.sampleId);
    if (!sample) continue;
    const flags = result.score?.flags || [];
    const humanReviewFlags = result.score?.humanReviewFlags || [];
    if (!flags.length && !humanReviewFlags.length) continue;
    flagged.push({
      sampleId: sample.sampleId,
      sourceRelativePath: sample.sourceRelativePath,
      category: sample.category,
      likelyHumanAdjacent: sample.likelyHumanAdjacent,
      presetId: result.presetId,
      outputPreviewPath: result.outputPreviewPath,
      outputSvgPath: result.outputSvgPath,
      flags,
      humanReviewFlags,
      recommendedAction: sample.likelyHumanAdjacent
        ? "manual_anatomy_review"
        : "manual_conversion_review",
      uncertainty: result.score?.uncertainty || null,
    });
  }

  const byCategory = {};
  for (const item of flagged) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  }

  return {
    generatedAt: ROUND2_GENERATED_AT,
    policyPresetId: defaultPresetId,
    flaggedImageCount: flagged.length,
    flaggedByCategory: Object.fromEntries(
      Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)),
    ),
    flagsAreHeuristic: true,
    anatomyDetectionLimit:
      "This workflow does not claim reliable anatomy detection. Human-adjacent images are queued for manual review.",
    images: flagged.sort((a, b) => a.category.localeCompare(b.category) || a.sampleId.localeCompare(b.sampleId)),
  };
}

async function writeReviewArtifacts({
  sampleManifest,
  calibrationSamples,
  shortlist,
  advancedPresets,
  stageAResults,
  stageBResults,
  flagged,
}) {
  await mkdir(path.join(REVIEW_ROOT, "conversion"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "anatomy"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "manual-signoff"), { recursive: true });

  await writeFile(
    path.join(REVIEW_ROOT, "conversion", "stage-a-calibration-comparison.html"),
    buildComparisonHtml({
      title: "Round 2 Stage A Calibration Comparison",
      samples: calibrationSamples,
      presets: shortlist.presets,
      results: stageAResults,
      maxRows: calibrationSamples.length,
    }),
    "utf8",
  );

  await writeFile(
    path.join(REVIEW_ROOT, "conversion", "stage-b-winning-preset-comparison.html"),
    buildComparisonHtml({
      title: "Round 2 Stage B Advanced Preset Comparison",
      samples: sampleManifest.samples,
      presets: advancedPresets,
      results: stageBResults,
      maxRows: sampleManifest.samples.length,
    }),
    "utf8",
  );

  const humanSamples = sampleManifest.samples.filter((sample) => sample.likelyHumanAdjacent);
  await writeFile(
    path.join(REVIEW_ROOT, "anatomy", "human-adjacent-review.html"),
    buildComparisonHtml({
      title: "Round 2 Human-Adjacent Anatomy Review",
      samples: humanSamples,
      presets: advancedPresets,
      results: stageBResults,
      maxRows: humanSamples.length,
    }),
    "utf8",
  );

  await writeFile(
    path.join(REVIEW_ROOT, "manual-signoff", "round-2-flagged-signoff.html"),
    buildFlaggedHtml(flagged),
    "utf8",
  );
}

function buildComparisonHtml({ title, samples, presets, results, maxRows }) {
  const resultMap = new Map(results.map((result) => [`${result.sampleId}:${result.presetId}`, result]));
  const rows = samples.slice(0, maxRows).map((sample) => {
    const cells = presets.map((preset) => {
      const result = resultMap.get(`${sample.sampleId}:${preset.presetId}`);
      const preview = result?.outputPreviewPath ? relativeFromReview(result.outputPreviewPath) : "";
      const flags = [...(result?.score?.flags || []), ...(result?.score?.humanReviewFlags || [])].join(", ");
      return `<td><div class="score">${result?.score?.qualityScore ?? "err"}</div>${preview ? `<img src="${escapeHtml(preview)}" alt="">` : ""}<div class="flags">${escapeHtml(flags)}</div></td>`;
    }).join("");
    return `<tr><th><div>${escapeHtml(sample.sampleId)}</div><div>${escapeHtml(sample.category)}</div><img src="${escapeHtml(relativeFromReview(sample.sourceRelativePath))}" alt=""></th>${cells}</tr>`;
  }).join("\n");

  return `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#111827;background:#f8fafc}
table{border-collapse:collapse;width:100%;background:white}
th,td{border:1px solid #d1d5db;vertical-align:top;padding:8px;min-width:150px}
th{position:sticky;left:0;background:#f3f4f6;z-index:1}
img{max-width:140px;max-height:180px;background:white;display:block;margin:6px auto}
.score{font-weight:700}
.flags{font-size:12px;color:#991b1b;max-width:170px}
</style>
<h1>${escapeHtml(title)}</h1>
<table>
<thead><tr><th>Source</th>${presets.map((preset) => `<th>${escapeHtml(preset.presetName)}<br><code>${escapeHtml(preset.presetId)}</code></th>`).join("")}</tr></thead>
<tbody>${rows}</tbody>
</table>`;
}

function buildFlaggedHtml(flagged) {
  const rows = flagged.images.map((item) => {
    const flags = [...item.flags, ...item.humanReviewFlags].join(", ");
    return `<tr><td>${escapeHtml(item.sampleId)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.sourceRelativePath)}</td><td>${escapeHtml(flags)}</td><td>${item.outputPreviewPath ? `<img src="${escapeHtml(relativeFromReview(item.outputPreviewPath))}" alt="">` : ""}</td></tr>`;
  }).join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<title>Round 2 Flagged Signoff Queue</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#111827;background:#f8fafc}
table{border-collapse:collapse;width:100%;background:white}
td,th{border:1px solid #d1d5db;padding:8px;vertical-align:top}
img{max-width:160px;max-height:200px;background:white}
</style>
<h1>Round 2 Flagged Signoff Queue</h1>
<p>Flags are heuristic. Human-adjacent images require manual anatomy review.</p>
<table><thead><tr><th>Sample</th><th>Category</th><th>Source</th><th>Flags</th><th>Preview</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildBakeoffReport({
  sampleManifest,
  shortlist,
  calibrationManifest,
  bakeoffManifest,
  policy,
  assumptions,
}) {
  const stageARows = calibrationManifest.aggregates.map(formatAggregateRow).join("\n");
  const stageBRows = bakeoffManifest.aggregates.map(formatAggregateRow).join("\n");
  return `# Round 2 Bakeoff Report

Generated: ${ROUND2_GENERATED_AT}

## Current State Confirmed

- PNG source images: ${assumptions.imageCorpusFindings.pngImageCount}
- Total files under images: ${assumptions.imageCorpusFindings.totalFiles}
- Categories: ${assumptions.imageCorpusFindings.categoryCount}
- Human-adjacent categories: ${assumptions.imageCorpusFindings.humanAdjacentCategories.join(", ")}
- Duplicate filename groups: ${assumptions.imageCorpusFindings.duplicateFilenameGroupCount}
- No Next.js app root detected yet.

## Reusable I Love SVG Entrypoints

The wrapper uses the real I Love SVG conversion modules through a Node import hook that resolves the repo's TypeScript files and \`~/\` path aliases:

- \`ilovesvg/app/shared/tracing/serverFallback.server.ts\`
- \`runSharedRasterNormalization()\`, backed by \`ilovesvg/app/utils/imagePreprocess.server.ts\`
- \`runSharedPotraceSvgTrace()\`, backed by \`ilovesvg/app/utils/potraceCompat.ts\`
- \`annotateSharedSingleTraceSvg()\`, backed by \`ilovesvg/app/utils/svgLayerTrace.server.ts\`
- \`traceCenterlineRasterToSvg()\` from \`ilovesvg/app/shared/tracing/centerlineTrace.ts\`
- \`applyTraceSvgOutputSettings()\` from \`ilovesvg/app/utils/converterSettings.server.ts\`

No source image files and no files inside \`ilovesvg/\` were modified.

## Sample And Presets

- Round 2 sample size: ${sampleManifest.actualSampleSize}
- Calibration subset size: ${calibrationManifest.calibrationSubsetSize}
- Preset shortlist size: ${shortlist.actualShortlistSize}
- Presets advanced to Stage B: ${bakeoffManifest.presetCount}
- Stage B preset IDs: ${bakeoffManifest.presetIds.join(", ")}

## Stage A Calibration

| Preset | Success | Avg score | Printable rate | Avg ink | Avg SVG bytes | Flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${stageARows}

## Stage B Main Bakeoff

| Preset | Success | Avg score | Printable rate | Avg ink | Avg SVG bytes | Flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
${stageBRows}

## Recommended Policy

- Recommendation type: ${policy.recommendationType}
- Default preset: \`${policy.defaultPreset.presetId}\` (${policy.defaultPreset.presetName})
- Reason: ${policy.defaultPreset.reason}

${policy.conditionalRules.length ? policy.conditionalRules.map((rule) => `- Rule: ${rule.when} -> \`${rule.presetId}\`. ${rule.reason}`).join("\n") : "- No conditional preset rule beat the default by the configured margin."}

## Review Artifacts

- \`pipeline/review/conversion/stage-a-calibration-comparison.html\`
- \`pipeline/review/conversion/stage-b-winning-preset-comparison.html\`
- \`pipeline/review/anatomy/human-adjacent-review.html\`
- \`pipeline/review/manual-signoff/round-2-flagged-signoff.html\`

These files are local review artifacts and are intentionally ignored by Git.

## Rerun Commands

\`\`\`powershell
node --test pipeline\\tests\\round-2-bakeoff.test.mjs
node pipeline\\scripts\\round-2-bakeoff.mjs --sample-size ${sampleManifest.actualSampleSize} --calibration-size ${calibrationManifest.calibrationSubsetSize} --shortlist-size ${shortlist.actualShortlistSize} --advanced-count ${bakeoffManifest.presetCount}
\`\`\`
`;
}

function buildQaReport({ flagged, policy }) {
  const categoryRows = Object.entries(flagged.flaggedByCategory)
    .map(([category, count]) => `| ${escapeMarkdown(category)} | ${count} |`)
    .join("\n");
  return `# Round 2 QA Findings

Generated: ${ROUND2_GENERATED_AT}

## Flagged Images

- Total flagged for manual review: ${flagged.flaggedImageCount}
- Policy preset: \`${flagged.policyPresetId}\`
- Heuristic flags only: ${flagged.flagsAreHeuristic ? "yes" : "no"}

| Category | Flagged images |
| --- | ---: |
${categoryRows || "| None | 0 |"}

## Anatomy Review Limits

${flagged.anatomyDetectionLimit}

All human-adjacent images remain manual-review items even when conversion metrics look acceptable.

## Production Output Spec

- Default preset: \`${policy.defaultPreset.presetId}\`
- SVG: ${policy.productionReadyOutputSpec.svgExpectations.join(" ")}
- PNG preview: ${policy.productionReadyOutputSpec.pngPreviewExpectations.join(" ")}
- Naming: ${policy.productionReadyOutputSpec.namingConvention}
- Metadata: ${policy.productionReadyOutputSpec.metadataConvention}
- Quarantine criteria: ${policy.productionReadyOutputSpec.quarantineCriteria.join(", ")}
- Manual review triggers: ${policy.productionReadyOutputSpec.manualReviewTriggers.join(", ")}
`;
}

function formatAggregateRow(aggregate) {
  const flags = Object.entries(aggregate.flagCounts)
    .map(([flag, count]) => `${flag}:${count}`)
    .join(", ");
  return `| ${escapeMarkdown(aggregate.presetId)} | ${aggregate.successCount}/${aggregate.totalRuns} | ${aggregate.averageQualityScore} | ${aggregate.printableCandidateRate} | ${aggregate.averageDarkPixelRatio} | ${aggregate.averageSvgBytes} | ${escapeMarkdown(flags)} |`;
}

function registerIloveSvgImportHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("~/")) {
        const resolved = resolveExistingFile(path.join(ILOVE_SVG_ROOT, "app", specifier.slice(2)));
        if (resolved) return { url: resolved, shortCircuit: true };
      }
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        context.parentURL?.startsWith("file:")
      ) {
        const parent = path.dirname(fileURLToPath(context.parentURL));
        const resolved = resolveExistingFile(path.resolve(parent, specifier));
        if (resolved) return { url: resolved, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}

function resolveExistingFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.server.ts`,
    `${basePath}.client.ts`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

function importIloveSvgModule(relativePath) {
  return import(pathToFileURL(path.join(ILOVE_SVG_ROOT, relativePath)).href);
}

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    traceMode: settings.traceMode || DEFAULT_SETTINGS.traceMode,
    strokeOutputMode: settings.strokeOutputMode || DEFAULT_SETTINGS.strokeOutputMode,
    preprocess: settings.preprocess || DEFAULT_SETTINGS.preprocess,
    threshold: Number(settings.threshold ?? DEFAULT_SETTINGS.threshold),
    turdSize: Number(settings.turdSize ?? DEFAULT_SETTINGS.turdSize),
    optTolerance: Number(settings.optTolerance ?? DEFAULT_SETTINGS.optTolerance),
    turnPolicy: settings.turnPolicy || DEFAULT_SETTINGS.turnPolicy,
    lineColor: settings.lineColor || DEFAULT_SETTINGS.lineColor,
    transparent: settings.transparent ?? DEFAULT_SETTINGS.transparent,
    bgColor: settings.bgColor || DEFAULT_SETTINGS.bgColor,
    invert: settings.invert ?? DEFAULT_SETTINGS.invert,
  };
}

function isLayeredPreset(preset) {
  const settings = preset.relevantParameters || {};
  return settings.traceMode === "layered" || preset.category === "layered";
}

function inferPresetFamily(preset) {
  const id = `${preset.presetId || ""} ${preset.presetName || ""}`.toLowerCase();
  if (preset.relevantParameters?.strokeOutputMode === "centerline") return "centerline";
  if (id.includes("scan")) return "scan";
  if (id.includes("drawing")) return "drawing";
  if (id.includes("sketch")) return "sketch";
  if (id.includes("photo") || id.includes("edge")) return "edge";
  if (id.includes("diagram")) return "diagram";
  return "lineart";
}

function scorePresetForShortlist(preset) {
  const text = `${preset.presetId || ""} ${preset.presetName || ""}`.toLowerCase();
  let score = 0;
  for (const term of ["line", "lineart", "drawing", "scan", "sketch", "outline", "ink", "stroke"]) {
    if (text.includes(term)) score += 3;
  }
  if (preset.relevantParameters?.strokeOutputMode === "centerline") score += 4;
  if (preset.relevantParameters?.preprocess === "edge") score += 1;
  return score;
}

function buildSampleId(sample, index) {
  const category = slug(sample.category || "sample");
  const base = slug(path.basename(sample.filename || sample.sourceRelativePath || "image", ".png"));
  return `r2-${String(index).padStart(3, "0")}-${category}-${base}-${stableHash(sample.sourceRelativePath).slice(0, 8)}`;
}

function pickEvenly(items, count) {
  if (count <= 0) return [];
  if (count >= items.length) return items.slice();
  if (count === 1) return [items[0]];
  const picked = [];
  const used = new Set();
  for (let index = 0; index < count; index += 1) {
    let target = Math.round((index * (items.length - 1)) / (count - 1));
    while (used.has(target) && target < items.length - 1) target += 1;
    while (used.has(target) && target > 0) target -= 1;
    used.add(target);
    picked.push(items[target]);
  }
  return picked;
}

async function appendJsonLog(logPath, record) {
  if (!logPath) return;
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, `${stableJson(record)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(sortObjectDeep(value), null, 2)}\n`, "utf8");
}

function stableJson(value) {
  return JSON.stringify(sortObjectDeep(value));
}

function sortObjectDeep(value) {
  if (Array.isArray(value)) return value.map(sortObjectDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectDeep(value[key])]),
  );
}

function compareResultStable(a, b) {
  return (
    String(a.stage).localeCompare(String(b.stage)) ||
    String(a.presetId).localeCompare(String(b.presetId)) ||
    String(a.sampleId).localeCompare(String(b.sampleId))
  );
}

function compareAggregateRank(a, b) {
  return (
    b.successRate - a.successRate ||
    b.averageQualityScore - a.averageQualityScore ||
    b.printableCandidateRate - a.printableCandidateRate ||
    a.averageSvgBytes - b.averageSvgBytes ||
    a.presetId.localeCompare(b.presetId)
  );
}

function countSvgPaths(svg) {
  return String(svg || "").match(/<path\b/gi)?.length || 0;
}

function readSvgDimensions(svg) {
  const width = Number(String(svg).match(/\bwidth=["']?([0-9.]+)/i)?.[1] || 0);
  const height = Number(String(svg).match(/\bheight=["']?([0-9.]+)/i)?.[1] || 0);
  if (width > 0 && height > 0) return { width, height };
  const viewBox = String(svg).match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  return null;
}

function recolorSvgPaths(svg, color) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";
  return String(svg).replace(/<path\b([^>]*?)(\s*\/?)>/gi, (_match, attrs = "", selfClose = "") => {
    const nextAttrs = String(attrs)
      .replace(/\sfill=["'][^"']*["']/i, "")
      .replace(/\s\/\s*$/i, "");
    return `<path${nextAttrs} fill="${safeColor}"${selfClose || " /"}>`;
  });
}

function countValues(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function sumMap(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
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
    .slice(0, 64);
}

function toRepoRelative(filePath) {
  if (!filePath) return null;
  return slash(path.relative(REPO_ROOT, filePath));
}

function slash(value) {
  return String(value).replace(/\\/g, "/");
}

function relativeFromReview(repoRelativePath) {
  return slash(path.relative(path.join(REPO_ROOT, "pipeline", "review", "conversion"), path.join(REPO_ROOT, repoRelativePath)));
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
  runRound2Bakeoff(parseArgs(process.argv.slice(2)))
    .then((summary) => {
      console.log(
        JSON.stringify(
          {
            sampleSize: summary.sampleManifest.actualSampleSize,
            presetShortlistSize: summary.shortlist.actualShortlistSize,
            calibrationSubsetSize: summary.calibrationManifest.calibrationSubsetSize,
            advancedPresetCount: summary.calibrationManifest.advancedPresetCount,
            flaggedImageCount: summary.flagged.flaggedImageCount,
            recommendedPreset: summary.policy.defaultPreset.presetId,
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
