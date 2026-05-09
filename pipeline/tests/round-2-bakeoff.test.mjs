import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildPresetShortlist,
  buildRound2SampleManifest,
  loadIloveSvgRuntime,
  runSingleConversion,
  scoreConversionMetrics,
  selectCalibrationSubset,
} from "../scripts/round-2-bakeoff.mjs";

test("round 2 sample manifest preserves category coverage and human-adjacent oversampling", () => {
  const candidates = [
    ...makeCandidates("animals", false, 12),
    ...makeCandidates("anime-girls", true, 12),
    ...makeCandidates("flowers", false, 12),
  ];

  const manifest = buildRound2SampleManifest(candidates, { targetSize: 15 });
  assert.equal(manifest.samples.length, 15);
  assert.deepEqual(
    [...new Set(manifest.samples.map((sample) => sample.category))].sort(),
    ["animals", "anime-girls", "flowers"],
  );

  const counts = countBy(manifest.samples, "category");
  assert.ok(counts.get("anime-girls") > counts.get("animals"));
  assert.ok(counts.get("anime-girls") > counts.get("flowers"));
});

test("calibration subset is deterministic and keeps every category represented when possible", () => {
  const candidates = [
    ...makeCandidates("animals", false, 10),
    ...makeCandidates("anime-girls", true, 10),
    ...makeCandidates("flowers", false, 10),
  ];
  const manifest = buildRound2SampleManifest(candidates, { targetSize: 24 });
  const first = selectCalibrationSubset(manifest.samples, 9);
  const second = selectCalibrationSubset(manifest.samples, 9);
  assert.deepEqual(first, second);
  assert.deepEqual(
    [...new Set(first.map((sample) => sample.category))].sort(),
    ["animals", "anime-girls", "flowers"],
  );
});

test("preset shortlist stays modest and includes real line-art families", () => {
  const inventory = {
    presets: [
      preset("line-clean", "Lineart - Clean", "lineart"),
      preset("line-low-noise", "Lineart - Low Noise", "lineart"),
      preset("drawing-ink", "Drawing - Ink", "lineart"),
      preset("scan-ink-cleanup", "Scan - Ink Cleanup", "scan"),
      preset("fine-pen-centerline", "Fine Pen Centerline", "stroke", {
        strokeOutputMode: "centerline",
      }),
      preset("poster-soft-8-color", "Poster Soft 8 Color", "layered", {
        traceMode: "layered",
      }),
    ],
  };

  const shortlist = buildPresetShortlist(inventory, { targetSize: 5 });
  assert.equal(shortlist.presets.length, 5);
  assert.ok(shortlist.presets.some((item) => item.presetId === "line-clean"));
  assert.ok(shortlist.presets.some((item) => item.presetId === "fine-pen-centerline"));
  assert.equal(
    shortlist.presets.some((item) => item.presetId === "poster-soft-8-color"),
    false,
  );
});

test("scoring flags blank, overfilled, and excessive-complexity outputs", () => {
  const blank = scoreConversionMetrics({
    renderSucceeded: true,
    darkPixelRatio: 0.001,
    svgBytes: 5_000,
    pathCount: 4,
    humanAdjacent: false,
  });
  assert.ok(blank.flags.includes("blank_or_missing_subject"));
  assert.equal(blank.printableColoringPageCandidate, false);

  const overfilled = scoreConversionMetrics({
    renderSucceeded: true,
    darkPixelRatio: 0.72,
    svgBytes: 100_000,
    pathCount: 80,
    humanAdjacent: true,
  });
  assert.ok(overfilled.flags.includes("overfilled_or_blobbed_output"));
  assert.ok(overfilled.humanReviewFlags.includes("requires_manual_anatomy_review"));

  const complex = scoreConversionMetrics({
    renderSucceeded: true,
    darkPixelRatio: 0.08,
    svgBytes: 2_400_000,
    pathCount: 3_200,
    humanAdjacent: false,
  });
  assert.ok(complex.flags.includes("excessive_svg_complexity"));
});

test("single conversion can run on a tiny fixture and failure logging does not throw", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "round-2-bakeoff-"));
  try {
    const runtime = await loadIloveSvgRuntime();
    const inputPath = path.join(tempDir, "input.png");
    const outputSvgPath = path.join(tempDir, "output.svg");
    const outputPreviewPath = path.join(tempDir, "output.png");
    const logPath = path.join(tempDir, "conversion-log.jsonl");

    await runtime.sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="64" height="64"><path d="M8 8 H56 V56 H8 Z M18 18 H46 V46 H18 Z" fill="none" stroke="black" stroke-width="4"/></svg>',
          ),
        },
      ])
      .png()
      .toFile(inputPath);

    const success = await runSingleConversion({
      inputPath,
      preset: {
        presetId: "line-clean",
        presetName: "Lineart - Clean",
        relevantParameters: {
          traceMode: "single",
          preprocess: "none",
          threshold: 224,
          turdSize: 2,
          optTolerance: 0.34,
          turnPolicy: "majority",
        },
      },
      outputSvgPath,
      outputPreviewPath,
      logPath,
      runtime,
    });

    assert.equal(success.status, "success");
    assert.ok((await stat(outputSvgPath)).size > 0);
    assert.ok((await stat(outputPreviewPath)).size > 0);

    const failure = await runSingleConversion({
      inputPath: path.join(tempDir, "missing.png"),
      preset: {
        presetId: "line-clean",
        presetName: "Lineart - Clean",
        relevantParameters: {},
      },
      outputSvgPath: path.join(tempDir, "missing.svg"),
      logPath,
      runtime,
    });

    assert.equal(failure.status, "error");
    const log = await readFile(logPath, "utf8");
    assert.match(log, /"status":"success"/);
    assert.match(log, /"status":"error"/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function makeCandidates(category, likelyHumanAdjacent, count) {
  return Array.from({ length: count }, (_, index) => ({
    sourceRelativePath: `images/${category}/${String(index).padStart(3, "0")}.png`,
    category,
    nestedCategory: null,
    filename: `${String(index).padStart(3, "0")}.png`,
    fileSizeBytes: 100_000 + index,
    dimensions: { width: 1024, height: 1536 },
    likelyHumanAdjacent,
    selectionSignals: index % 2 ? ["high_detail"] : ["simple_scene"],
    samplePriority: index + 1,
  }));
}

function preset(presetId, presetName, category, relevantParameters = {}) {
  return {
    presetId,
    presetName,
    category,
    relevantParameters: {
      traceMode: "single",
      preprocess: "none",
      threshold: 224,
      turdSize: 2,
      optTolerance: 0.34,
      turnPolicy: "majority",
      ...relevantParameters,
    },
    appearsSuitableForColoringPageConversion: category !== "layered",
    whereDefined: {
      file: "ilovesvg/app/client/lib/converter/presetAdditions.ts",
      line: 1,
      arrayName: "TRACE_PRESET_ADDITIONS",
    },
  };
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  return counts;
}
