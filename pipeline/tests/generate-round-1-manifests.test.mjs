import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  detectHumanAdjacentCategory,
  formatCategorySlug,
  inferSampleSignals,
  readPngDimensionsFromBuffer,
  selectSampleCandidates,
} from "../scripts/generate-round-1-manifests.mjs";

const png2x3 = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000200000003080200000000000000",
  "hex",
);

test("reads PNG dimensions from the IHDR header", () => {
  assert.deepEqual(readPngDimensionsFromBuffer(png2x3), {
    width: 2,
    height: 3,
  });
  assert.equal(readPngDimensionsFromBuffer(Buffer.from("not a png")), null);
});

test("normalizes category names and flags human-adjacent categories", () => {
  assert.equal(formatCategorySlug("Animals playing cards"), "animals-playing-cards");
  assert.equal(formatCategorySlug("anime-girls"), "anime-girls");
  assert.equal(detectHumanAdjacentCategory("anime-girls"), true);
  assert.equal(detectHumanAdjacentCategory("sea-life"), false);
});

test("infers simple deterministic sample signals from metadata", () => {
  assert.deepEqual(
    inferSampleSignals({
      sourceRelativePath: "images/chibi/inked-detailed-001.png",
      fileSizeBytes: 3_500_000,
      dimensions: { width: 2400, height: 2400 },
    }),
    ["complex_scene", "high_detail", "thick_line_candidate"],
  );
  assert.deepEqual(
    inferSampleSignals({
      sourceRelativePath: "images/flowers/simple-thin-outline.png",
      fileSizeBytes: 35_000,
      dimensions: { width: 600, height: 600 },
    }),
    ["simple_scene", "thin_line_candidate"],
  );
});

test("sample selection includes every category and oversamples human-adjacent categories", () => {
  const entries = [
    ...makeEntries("animals", false, 12),
    ...makeEntries("anime-girls", true, 12),
    ...makeEntries("flowers", false, 12),
  ];

  const sample = selectSampleCandidates(entries, 12);
  const categories = new Set(sample.map((entry) => entry.category));
  assert.deepEqual([...categories].sort(), ["animals", "anime-girls", "flowers"]);

  const counts = countBy(sample, "category");
  assert.ok(counts.get("anime-girls") > counts.get("animals"));
  assert.ok(counts.get("anime-girls") > counts.get("flowers"));
});

test("test fixtures clean up after themselves", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "round-1-test-"));
  await writeFile(path.join(dir, "fixture.png"), png2x3);
  await rm(dir, { recursive: true, force: true });
});

function makeEntries(category, humanAdjacent, count) {
  return Array.from({ length: count }, (_, index) => ({
    sourceRelativePath: `images/${category}/${String(index).padStart(3, "0")}.png`,
    category,
    nestedCategory: null,
    filename: `${String(index).padStart(3, "0")}.png`,
    extension: ".png",
    fileSizeBytes: 100_000 + index,
    dimensions: { width: 1024, height: 1024 },
    appearsReadable: true,
    likelyHumanAdjacent: humanAdjacent,
    warnings: [],
    notes: [],
  }));
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  }
  return counts;
}
