import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BLOCKING_REASON_CODES,
  WARNING_REASON_CODES,
  assertRound3A1Integrity,
  buildRound3A1Manifests,
  buildRound3A1ProductionDryRunSample,
  inferHighRiskCategory,
} from "../scripts/round-3a1-source-qa.mjs";

test("high-risk category membership creates warnings but does not block passable images", () => {
  const inventory = inventoryOf([
    pngEntry("images/anime-girls/a.png", "anime-girls", { likelyHumanAdjacent: true }),
    pngEntry("images/chibi/b.png", "chibi", { likelyHumanAdjacent: true }),
    pngEntry("images/fantasy/c.png", "fantasy", { likelyHumanAdjacent: true }),
    pngEntry("images/mythology/d.png", "mythology", { likelyHumanAdjacent: true }),
    pngEntry("images/flowers/e.png", "flowers"),
  ]);

  const result = buildRound3A1Manifests({
    inventory,
    round2Flags: { images: [] },
    oldRound3aBlocked: { entries: [] },
    oldRound3aApproved: { entries: [] },
    imageAnalyses: new Map(inventory.entries.map((entry) => [entry.sourceRelativePath, goodImageAnalysis()])),
    presentFiles: presentFilesFor(inventory.entries),
  });

  assert.equal(result.blocked.entries.length, 0);
  assert.equal(result.approved.entries.length, 5);
  assert.equal(result.warnings.entries.filter((entry) => entry.highRiskCategory).length, 4);
  assert.ok(result.approved.entries.some((entry) => entry.category === "anime-girls"));
  assert.ok(result.warnings.entries.every((entry) => entry.status === "approved_with_warning"));
  assert.ok(
    result.warnings.entries
      .filter((entry) => entry.highRiskCategory)
      .every((entry) => entry.warningCodes.includes("soft_warning_human_adjacent")),
  );
  assertRound3A1Integrity(result);
});

test("round 2 flagged images remain blocked and warning-only reasons never block", () => {
  const inventory = inventoryOf([
    pngEntry("images/animals/round2.png", "animals"),
    pngEntry("images/anime-girls/passable.png", "anime-girls", { likelyHumanAdjacent: true }),
  ]);

  const result = buildRound3A1Manifests({
    inventory,
    round2Flags: {
      images: [{ sourceRelativePath: "images/animals/round2.png", category: "animals" }],
    },
    oldRound3aBlocked: { entries: [] },
    oldRound3aApproved: { entries: [] },
    imageAnalyses: new Map(inventory.entries.map((entry) => [entry.sourceRelativePath, goodImageAnalysis()])),
    presentFiles: presentFilesFor(inventory.entries),
  });

  const blocked = result.blocked.entries.map((entry) => entry.sourceRelativePath);
  assert.deepEqual(blocked, ["images/animals/round2.png"]);
  assert.ok(result.approved.entries.some((entry) => entry.sourceRelativePath === "images/anime-girls/passable.png"));
  assert.equal(
    result.blocked.entries.some((entry) =>
      entry.reasonCodes.some((code) => WARNING_REASON_CODES.has(code)),
    ),
    false,
  );
});

test("duplicate filenames are kept when content differs and exact content duplicates are blocked", () => {
  const inventory = inventoryOf([
    pngEntry("images/animals/shared.png", "animals"),
    pngEntry("images/birds/shared.png", "birds"),
    pngEntry("images/dogs/exact-a.png", "dogs"),
    pngEntry("images/dogs/exact-b.png", "dogs"),
    pngEntry("images/holiday/dense-but-usable.png", "holiday"),
  ]);
  const result = buildRound3A1Manifests({
    inventory,
    round2Flags: { images: [] },
    oldRound3aBlocked: { entries: [] },
    oldRound3aApproved: { entries: [] },
    imageAnalyses: new Map([
      ["images/animals/shared.png", goodImageAnalysis()],
      ["images/birds/shared.png", goodImageAnalysis()],
      ["images/dogs/exact-a.png", goodImageAnalysis()],
      ["images/dogs/exact-b.png", goodImageAnalysis()],
      [
        "images/holiday/dense-but-usable.png",
        { ...goodImageAnalysis(), darkPixelRatio: 0.52, componentCount: 1100, smallComponentRatio: 0.66 },
      ],
    ]),
    sourceHashes: new Map([
      ["images/animals/shared.png", "hash-a"],
      ["images/birds/shared.png", "hash-b"],
      ["images/dogs/exact-a.png", "hash-exact"],
      ["images/dogs/exact-b.png", "hash-exact"],
      ["images/holiday/dense-but-usable.png", "hash-dense"],
    ]),
    presentFiles: presentFilesFor(inventory.entries),
  });

  assert.equal(result.blocked.entries.length, 1);
  assert.equal(result.blocked.entries[0].sourceRelativePath, "images/dogs/exact-b.png");
  assert.ok(result.blocked.entries[0].reasonCodes.includes("duplicate_image_exact_content"));
  assert.equal(result.approved.entries.length, 4);
  assert.ok(result.approved.entries.some((entry) => entry.sourceRelativePath === "images/animals/shared.png"));
  assert.ok(result.approved.entries.some((entry) => entry.sourceRelativePath === "images/birds/shared.png"));
  assert.equal(result.warnings.entries.length, 3);
  assert.equal(
    result.warnings.entries.filter((entry) =>
      entry.warningCodes.includes("soft_warning_duplicate_filename_collision_handled"),
    ).length,
    2,
  );
  assert.ok(
    result.warnings.entries
      .find((entry) => entry.sourceRelativePath.includes("dense-but-usable"))
      .warningCodes.includes("soft_warning_possible_complexity"),
  );
  assert.ok(
    result.approved.entries
      .filter((entry) => entry.filename === "shared.png")
      .every((entry) => entry.recommendedOutputId && entry.recommendedOutputId.includes("__")),
  );
});

test("only concrete severe image-level evidence blocks non-round2 images", () => {
  const inventory = inventoryOf([
    pngEntry("images/flowers/blank.png", "flowers"),
    pngEntry("images/flowers/cut-off.png", "flowers"),
    pngEntry("images/flowers/corrupt.png", "flowers"),
    { ...pngEntry("images/flowers/not-png.jpeg", "flowers"), extension: ".jpeg", isPng: false },
  ]);
  const result = buildRound3A1Manifests({
    inventory,
    round2Flags: { images: [] },
    oldRound3aBlocked: { entries: [] },
    oldRound3aApproved: { entries: [] },
    imageAnalyses: new Map([
      ["images/flowers/blank.png", { ...goodImageAnalysis(), darkPixelRatio: 0.002 }],
      ["images/flowers/cut-off.png", { ...goodImageAnalysis(), borderDarkRatio: 0.54, boundingBoxCoverage: 0.99 }],
      ["images/flowers/corrupt.png", { ...goodImageAnalysis(), readable: false }],
      ["images/flowers/not-png.jpeg", goodImageAnalysis()],
    ]),
    presentFiles: presentFilesFor(inventory.entries),
  });

  assert.equal(result.blocked.entries.length, 4);
  assert.ok(result.blocked.entries.every((entry) => entry.reasonCodes.some((code) => BLOCKING_REASON_CODES.has(code))));
  assert.ok(result.blocked.entries.some((entry) => entry.reasonCodes.includes("unreadable_subject")));
  assert.ok(result.blocked.entries.some((entry) => entry.reasonCodes.includes("awkward_crop_severe")));
  assert.ok(result.blocked.entries.some((entry) => entry.reasonCodes.includes("unreadable_file")));
  assert.ok(result.blocked.entries.some((entry) => entry.reasonCodes.includes("non_png")));
});

test("rejection guard triggers diagnostic mode instead of normal manifests", () => {
  const entries = Array.from({ length: 503 }, (_, index) =>
    pngEntry(`images/flowers/${String(index).padStart(3, "0")}.png`, "flowers"),
  );
  const inventory = inventoryOf(entries);
  const result = buildRound3A1Manifests({
    inventory,
    round2Flags: { images: [] },
    oldRound3aBlocked: { entries: [] },
    oldRound3aApproved: { entries: [] },
    imageAnalyses: new Map(entries.map((entry) => [entry.sourceRelativePath, { ...goodImageAnalysis(), darkPixelRatio: 0.001 }])),
    presentFiles: presentFilesFor(entries),
    rejectionGuardLimit: 500,
  });

  assert.equal(result.diagnosticFailure, true);
  assert.equal(result.blocked.status, "diagnostic_failure_if_rejection_guard_exceeded");
  assert.equal(result.approved.status, "diagnostic_failure_if_rejection_guard_exceeded");
  assert.equal(result.blocked.newRound3a1RejectedCount, 503);
});

test("dry-run sample uses approved images, includes warning examples, and avoids blocked paths", () => {
  const approved = {
    entries: [
      ...Array.from({ length: 10 }, (_, index) => approvedEntry(`images/anime-girls/${index}.png`, "anime-girls", "approved_with_warning")),
      ...Array.from({ length: 10 }, (_, index) => approvedEntry(`images/chibi/${index}.png`, "chibi", "approved_with_warning")),
      ...Array.from({ length: 10 }, (_, index) => approvedEntry(`images/flowers/${index}.png`, "flowers")),
    ],
  };
  const blocked = {
    entries: [{ sourceRelativePath: "images/flowers/blocked.png" }],
  };

  const sample = buildRound3A1ProductionDryRunSample({ approved, blocked }, { targetSize: 12 });
  assert.equal(sample.samples.length, 12);
  assert.equal(sample.samples.some((entry) => entry.sourceRelativePath === "images/flowers/blocked.png"), false);
  assert.ok(sample.samples.some((entry) => entry.status === "approved_with_warning"));
  assert.ok(sample.samples.some((entry) => entry.category === "anime-girls"));
  assert.ok(sample.samples.some((entry) => entry.category === "chibi"));
});

test("script and manifests do not preserve category-only rejection policy", async () => {
  assert.equal(inferHighRiskCategory("anime-girls"), true);
  assert.equal(inferHighRiskCategory("flowers"), false);

  const script = await readFile("pipeline/scripts/round-3a1-source-qa.mjs", "utf8");
  assert.doesNotMatch(script, /manual_review_uncertain_reject_for_now/);
  assert.doesNotMatch(script, /category_based_rejection/);
  assert.doesNotMatch(script, /glob\([^)]*images/i);
  assert.match(script, /image-inventory\.json/);
});

function inventoryOf(entries) {
  return {
    generatedAt: "2026-05-09",
    sourceRoot: "images",
    totalFiles: entries.length,
    totalPngImages: entries.filter((entry) => entry.isPng).length,
    entries,
  };
}

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

function approvedEntry(sourceRelativePath, category, status = "approved_candidate") {
  return {
    sourceRelativePath,
    category,
    nestedCategory: null,
    filename: sourceRelativePath.split("/").at(-1),
    extension: ".png",
    fileSizeBytes: 12345,
    dimensions: { width: 1024, height: 1536 },
    status,
    warningCodes: status === "approved_with_warning" ? ["soft_warning_human_adjacent"] : [],
    reasonCodes: [],
  };
}

function presentFilesFor(entries) {
  return new Map(entries.map((entry) => [entry.sourceRelativePath, entry.fileSizeBytes]));
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
