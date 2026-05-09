import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  assertNoApprovedBlockedOverlap,
  buildApprovedProductionDryRunSample,
  buildRound3AManifests,
  countByReasonCode,
  inferHumanAdjacentCategory,
} from "../scripts/round-3a-source-qa.mjs";

test("round 2 flagged paths are always blocked and never approved", () => {
  const inventory = {
    generatedAt: "2026-05-09",
    sourceRoot: "images",
    totalFiles: 3,
    totalPngImages: 3,
    entries: [
      pngEntry("images/animals/a.png", "animals"),
      pngEntry("images/anime-girls/b.png", "anime-girls", { likelyHumanAdjacent: true }),
      pngEntry("images/flowers/c.png", "flowers"),
    ],
  };
  const round2Flags = {
    images: [
      {
        sourceRelativePath: "images/animals/a.png",
        category: "animals",
        flags: ["heavy_ink_coverage"],
      },
    ],
  };

  const result = buildRound3AManifests({
    inventory,
    round2Flags,
    imageAnalyses: new Map([
      ["images/animals/a.png", goodImageAnalysis()],
      ["images/anime-girls/b.png", goodImageAnalysis()],
      ["images/flowers/c.png", goodImageAnalysis()],
    ]),
    presentFiles: new Map(inventory.entries.map((entry) => [entry.sourceRelativePath, entry.fileSizeBytes])),
  });

  assert.ok(result.blocked.entries.some((entry) => entry.sourceRelativePath === "images/animals/a.png"));
  assert.ok(
    result.blocked.entries
      .find((entry) => entry.sourceRelativePath === "images/animals/a.png")
      .reasonCodes.includes("round2_flagged_conversion_or_anatomy"),
  );
  assert.equal(
    result.approved.entries.some((entry) => entry.sourceRelativePath === "images/animals/a.png"),
    false,
  );
  assertNoApprovedBlockedOverlap(result.approved, result.blocked);
});

test("human-adjacent categories are rejected for now without explicit approval", () => {
  assert.equal(inferHumanAdjacentCategory("anime-girls"), true);
  assert.equal(inferHumanAdjacentCategory("chibi"), true);
  assert.equal(inferHumanAdjacentCategory("people"), true);
  assert.equal(inferHumanAdjacentCategory("flowers"), false);

  const inventory = {
    entries: [
      pngEntry("images/chibi/chibi-a.png", "chibi", { likelyHumanAdjacent: true }),
      pngEntry("images/dogs/dog-a.png", "dogs"),
    ],
  };
  const result = buildRound3AManifests({
    inventory,
    round2Flags: { images: [] },
    imageAnalyses: new Map([
      ["images/chibi/chibi-a.png", goodImageAnalysis()],
      ["images/dogs/dog-a.png", goodImageAnalysis()],
    ]),
    presentFiles: new Map(inventory.entries.map((entry) => [entry.sourceRelativePath, entry.fileSizeBytes])),
  });

  assert.equal(result.approved.entries.length, 1);
  assert.equal(result.approved.entries[0].sourceRelativePath, "images/dogs/dog-a.png");
  const blocked = result.blocked.entries.find((entry) => entry.sourceRelativePath === "images/chibi/chibi-a.png");
  assert.equal(blocked.status, "needs_manual_review_but_rejected_for_now");
  assert.ok(blocked.reasonCodes.includes("manual_review_uncertain_reject_for_now"));
});

test("source QA rejects non-PNG, duplicates, crop risk, dense detail, and unreadable files", () => {
  const inventory = {
    entries: [
      pngEntry("images/animals/shared.png", "animals"),
      pngEntry("images/birds/shared.png", "birds"),
      pngEntry("images/flowers/crop.png", "flowers"),
      pngEntry("images/flowers/dense.png", "flowers"),
      { ...pngEntry("images/flowers/not-png.jpeg", "flowers"), extension: ".jpeg", isPng: false },
      { ...pngEntry("images/flowers/unreadable.png", "flowers"), appearsReadable: false },
    ],
  };
  const result = buildRound3AManifests({
    inventory,
    round2Flags: { images: [] },
    imageAnalyses: new Map([
      ["images/animals/shared.png", goodImageAnalysis()],
      ["images/birds/shared.png", goodImageAnalysis()],
      ["images/flowers/crop.png", { ...goodImageAnalysis(), borderDarkRatio: 0.34 }],
      ["images/flowers/dense.png", { ...goodImageAnalysis(), darkPixelRatio: 0.51, componentCount: 1200 }],
      ["images/flowers/not-png.jpeg", goodImageAnalysis()],
      ["images/flowers/unreadable.png", goodImageAnalysis()],
    ]),
    presentFiles: new Map(inventory.entries.map((entry) => [entry.sourceRelativePath, entry.fileSizeBytes])),
  });

  assert.equal(result.approved.entries.length, 0);
  const reasonCounts = countByReasonCode(result.blocked.entries);
  assert.equal(reasonCounts.duplicate_filename_review, 2);
  assert.equal(reasonCounts.subject_too_close_to_edge, 1);
  assert.equal(reasonCounts.over_dense_detail, 1);
  assert.equal(reasonCounts.non_png, 1);
  assert.equal(reasonCounts.unreadable_file, 1);
});

test("approved-only dry-run sample uses approved paths and preserves category coverage", () => {
  const approved = {
    entries: [
      ...Array.from({ length: 10 }, (_, index) =>
        approvedEntry(`images/animals/${index}.png`, "animals"),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        approvedEntry(`images/flowers/${index}.png`, "flowers"),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        approvedEntry(`images/birds/${index}.png`, "birds"),
      ),
    ],
  };
  const sample = buildApprovedProductionDryRunSample(approved, { targetSize: 12 });
  assert.equal(sample.samples.length, 12);
  assert.deepEqual(
    [...new Set(sample.samples.map((entry) => entry.category))].sort(),
    ["animals", "birds", "flowers"],
  );
  assert.equal(sample.samples.some((entry) => entry.status !== "approved_candidate"), false);
});

test("round 3a script does not glob images directly for production-style inputs", async () => {
  const script = await readFile("pipeline/scripts/round-3a-source-qa.mjs", "utf8");
  assert.doesNotMatch(script, /glob\([^)]*images/i);
  assert.doesNotMatch(script, /readdir(?:Sync)?\([^)]*images/i);
  assert.match(script, /image-inventory\.json/);
});

function pngEntry(sourceRelativePath, category, overrides = {}) {
  return {
    sourceRelativePath,
    category,
    nestedCategory: null,
    filename: sourceRelativePath.split("/").at(-1),
    extension: ".png",
    isPng: true,
    fileSizeBytes: 12345,
    dimensions: { width: 1024, height: 1536 },
    appearsReadable: true,
    likelyHumanAdjacent: false,
    warnings: [],
    notes: [],
    ...overrides,
  };
}

function approvedEntry(sourceRelativePath, category) {
  return {
    sourceRelativePath,
    category,
    status: "approved_candidate",
    fileSizeBytes: 12345,
    dimensions: { width: 1024, height: 1536 },
    reasonCodes: [],
    notes: [],
  };
}

function goodImageAnalysis() {
  return {
    inspected: true,
    readable: true,
    darkPixelRatio: 0.16,
    borderDarkRatio: 0.08,
    componentCount: 120,
    smallComponentRatio: 0.18,
    boundingBoxCoverage: 0.72,
    width: 1024,
    height: 1536,
  };
}
