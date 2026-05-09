import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_DIR = path.join(REPO_ROOT, "pipeline", "manifests");
const REPORT_DIR = path.join(REPO_ROOT, "pipeline", "reports");
const REVIEW_ROOT = path.join(REPO_ROOT, "pipeline", "review", "source-qa");
const ILOVE_SVG_ROOT = path.join(REPO_ROOT, "ilovesvg");

const ROUND3A_GENERATED_AT = "2026-05-09";
const DEFAULT_DRY_RUN_SAMPLE_SIZE = 125;
const HUMAN_ADJACENT_KEYWORDS = [
  "anime",
  "girl",
  "boy",
  "chibi",
  "people",
  "person",
  "princess",
  "fairy",
  "mermaid",
  "superhero",
  "fantasy",
  "horror",
  "medieval",
  "midieval",
  "mythology",
  "knight",
  "wizard",
  "witch",
  "human",
];

const SOURCE_QA_THRESHOLDS = {
  faintDarkPixelRatio: 0.012,
  overDenseDarkPixelRatio: 0.47,
  cropBorderDarkRatio: 0.32,
  highComponentCount: 950,
  highSmallComponentRatio: 0.62,
  highBoundingBoxCoverage: 0.96,
  lowDimension: 512,
};

export function inferHumanAdjacentCategory(...parts) {
  const haystack = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return HUMAN_ADJACENT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function buildRound3AManifests({
  inventory,
  round2Flags,
  imageAnalyses = new Map(),
  presentFiles = new Map(),
  generatedAt = ROUND3A_GENERATED_AT,
} = {}) {
  const entries = [...(inventory?.entries || [])].sort((a, b) =>
    a.sourceRelativePath.localeCompare(b.sourceRelativePath),
  );
  const round2Flagged = extractRound2FlaggedPaths(round2Flags);
  const duplicateFilenames = buildDuplicateFilenameSet(entries);
  const approvedEntries = [];
  const blockedEntries = [];

  for (const entry of entries) {
    const classification = classifySourceEntry({
      entry,
      analysis: imageAnalyses.get(entry.sourceRelativePath),
      presentSize: presentFiles.get(entry.sourceRelativePath),
      round2Flag: round2Flagged.get(entry.sourceRelativePath),
      duplicateFilename: duplicateFilenames.has(normalizeFilename(entry.filename)),
    });

    if (classification.status === "approved_candidate") {
      approvedEntries.push(toApprovedEntry(entry, classification));
    } else {
      blockedEntries.push(toBlockedEntry(entry, classification));
    }
  }

  const approved = {
    generatedAt,
    sourceManifest: "pipeline/manifests/image-inventory.json",
    policy:
      "Approved-source manifest for future production-style processing. Future scripts must consume this or a later approved-source manifest, not raw source folders.",
    totalApprovedCandidates: approvedEntries.length,
    sourcePngsConsidered: entries.filter((entry) => entry.isPng).length,
    entries: approvedEntries,
  };
  const round2BlockedCount = blockedEntries.filter((entry) =>
    entry.rejectionSources.includes("round-2-bakeoff"),
  ).length;
  const newRound3aRejectedCount = blockedEntries.filter((entry) =>
    entry.rejectionSources.includes("round-3a-source-qa") &&
    !entry.rejectionSources.includes("round-2-bakeoff"),
  ).length;
  const blocked = {
    generatedAt,
    sourceManifest: "pipeline/manifests/image-inventory.json",
    round2FlaggedManifest: "pipeline/manifests/round-2-flagged-images.json",
    statusMeaning:
      "All entries are rejected for now and excluded from approved production inputs unless restored by an explicit future approval/update manifest.",
    totalBlocked: blockedEntries.length,
    round2BlockedCount,
    newRound3aRejectedCount,
    round3aRejectedIncludingRound2Overlap: blockedEntries.filter((entry) =>
      entry.rejectionSources.includes("round-3a-source-qa"),
    ).length,
    rejectedByCategory: countBy(blockedEntries, "category"),
    rejectedByReasonCode: countByReasonCode(blockedEntries),
    entries: blockedEntries,
  };

  assertNoApprovedBlockedOverlap(approved, blocked);
  return { approved, blocked };
}

export function classifySourceEntry({
  entry,
  analysis,
  presentSize,
  round2Flag,
  duplicateFilename,
}) {
  const reasonCodes = new Set();
  const rejectionSources = new Set();
  const notes = [];
  const humanAdjacent = Boolean(entry.likelyHumanAdjacent) ||
    inferHumanAdjacentCategory(entry.category, entry.nestedCategory, entry.filename);

  if (round2Flag) {
    reasonCodes.add("round2_flagged_conversion_or_anatomy");
    rejectionSources.add("round-2-bakeoff");
    notes.push("Blocked because Round 2 flagged this source for conversion or manual anatomy review.");
  }

  if (presentSize === undefined) {
    reasonCodes.add("missing_source_file");
    reasonCodes.add("unreadable_file");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Source path from the Round 1 inventory is no longer present.");
  } else if (entry.fileSizeBytes !== undefined && presentSize !== entry.fileSizeBytes) {
    reasonCodes.add("inventory_size_mismatch");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Current source file size does not match the Round 1 inventory.");
  }

  if (!entry.isPng || String(entry.extension || "").toLowerCase() !== ".png") {
    reasonCodes.add("non_png");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Only readable PNG files may enter the approved-source manifest.");
  }

  if (!entry.appearsReadable) {
    reasonCodes.add("unreadable_file");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Round 1 marked this source as unreadable or unrecognized.");
  }

  if (duplicateFilename) {
    reasonCodes.add("duplicate_filename_review");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Filename appears in multiple source paths and is blocked until naming/canonicalization is explicitly approved.");
  }

  if (humanAdjacent) {
    reasonCodes.add("manual_review_uncertain_reject_for_now");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Human-adjacent imagery cannot be automatically approved for anatomy quality in Round 3A.");
  }

  if (analysis) {
    applyAnalysisReasons({ analysis, reasonCodes, rejectionSources, notes });
  } else if (entry.isPng && entry.appearsReadable && presentSize !== undefined) {
    reasonCodes.add("manual_review_uncertain_reject_for_now");
    rejectionSources.add("round-3a-source-qa");
    notes.push("No source QA analysis was available for this readable PNG.");
  }

  const sortedReasons = [...reasonCodes].sort((a, b) => a.localeCompare(b));
  const status = sortedReasons.length === 0
    ? "approved_candidate"
    : sortedReasons.includes("manual_review_uncertain_reject_for_now")
      ? "needs_manual_review_but_rejected_for_now"
      : "rejected_for_now";

  return {
    status,
    humanAdjacent,
    reasonCodes: sortedReasons,
    rejectionSources: [...rejectionSources].sort((a, b) => a.localeCompare(b)),
    notes: [...new Set(notes)].sort((a, b) => a.localeCompare(b)),
    qaMetrics: analysis ? normalizeAnalysis(analysis) : null,
  };
}

export function applyAnalysisReasons({ analysis, reasonCodes, rejectionSources, notes }) {
  if (analysis.readable === false) {
    reasonCodes.add("unreadable_file");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Image inspection failed or the image could not be decoded.");
    return;
  }

  if (analysis.darkPixelRatio < SOURCE_QA_THRESHOLDS.faintDarkPixelRatio) {
    reasonCodes.add("poor_coloring_page_fit");
    reasonCodes.add("unreadable_subject");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Very low detected line density suggests faint, missing, or unreadable line art.");
  }

  if (analysis.darkPixelRatio > SOURCE_QA_THRESHOLDS.overDenseDarkPixelRatio) {
    reasonCodes.add("over_dense_detail");
    reasonCodes.add("poor_coloring_page_fit");
    rejectionSources.add("round-3a-source-qa");
    notes.push("High detected ink density may leave too little clean white coloring space.");
  }

  if (analysis.borderDarkRatio > SOURCE_QA_THRESHOLDS.cropBorderDarkRatio) {
    reasonCodes.add("subject_too_close_to_edge");
    reasonCodes.add("awkward_crop");
    rejectionSources.add("round-3a-source-qa");
    notes.push("A high share of linework touches the page border, suggesting crop or margin risk.");
  }

  if (
    analysis.boundingBoxCoverage > SOURCE_QA_THRESHOLDS.highBoundingBoxCoverage &&
    analysis.borderDarkRatio > 0.17
  ) {
    reasonCodes.add("awkward_crop");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Detected linework occupies nearly the full canvas, leaving little safe margin.");
  }

  if (
    analysis.componentCount > SOURCE_QA_THRESHOLDS.highComponentCount ||
    analysis.smallComponentRatio > SOURCE_QA_THRESHOLDS.highSmallComponentRatio
  ) {
    reasonCodes.add("tangled_linework");
    reasonCodes.add("over_dense_detail");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Many small line components suggest speckling, clutter, or tiny color regions.");
  }

  if (
    analysis.width < SOURCE_QA_THRESHOLDS.lowDimension ||
    analysis.height < SOURCE_QA_THRESHOLDS.lowDimension
  ) {
    reasonCodes.add("poor_coloring_page_fit");
    rejectionSources.add("round-3a-source-qa");
    notes.push("Image dimensions are below the minimum expected source size.");
  }
}

export function assertNoApprovedBlockedOverlap(approved, blocked) {
  const approvedPaths = new Set((approved.entries || []).map((entry) => entry.sourceRelativePath));
  const overlap = (blocked.entries || [])
    .map((entry) => entry.sourceRelativePath)
    .filter((sourceRelativePath) => approvedPaths.has(sourceRelativePath));
  if (overlap.length) {
    throw new Error(`Approved and blocked manifests overlap: ${overlap.slice(0, 10).join(", ")}`);
  }
}

export function buildApprovedProductionDryRunSample(approved, options = {}) {
  const targetSize = Math.min(
    Number(options.targetSize || DEFAULT_DRY_RUN_SAMPLE_SIZE),
    approved.entries.length,
  );
  const groups = new Map();
  for (const entry of approved.entries) {
    if (entry.status !== "approved_candidate") continue;
    if (!groups.has(entry.category)) groups.set(entry.category, []);
    groups.get(entry.category).push(entry);
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
      const score = Math.sqrt(group.length) / (allocated + 1);
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
    samples.push(...pickEvenly(groups.get(category) || [], allocations.get(category) || 0));
  }

  const normalized = samples
    .sort((a, b) => a.category.localeCompare(b.category) || a.sourceRelativePath.localeCompare(b.sourceRelativePath))
    .map((entry, index) => ({
      dryRunSampleId: buildDryRunSampleId(entry, index + 1),
      sampleIndex: index + 1,
      sourceRelativePath: entry.sourceRelativePath,
      category: entry.category,
      nestedCategory: entry.nestedCategory || null,
      filename: entry.filename,
      fileSizeBytes: entry.fileSizeBytes,
      dimensions: entry.dimensions,
      status: entry.status,
      futurePolicyPresetId: "line-thick",
      notes: ["Approved-source dry-run candidate only. Do not process full corpus in Round 3A."],
    }));

  return {
    generatedAt: ROUND3A_GENERATED_AT,
    sourceManifest: "pipeline/manifests/round-3a-approved-source-images.json",
    policyManifest: "pipeline/manifests/round-2-recommended-policy.json",
    targetSampleSize: targetSize,
    actualSampleSize: normalized.length,
    selectionStrategy:
      "Approved-source only, preserves category coverage where possible, excludes Round 2 and Round 3A blocked paths.",
    samples: normalized,
  };
}

export function countByReasonCode(entries) {
  const counts = {};
  for (const entry of entries) {
    for (const reasonCode of entry.reasonCodes || []) {
      counts[reasonCode] = (counts[reasonCode] || 0) + 1;
    }
  }
  return sortObject(counts);
}

async function runRound3ASourceQa() {
  const inventory = await readJson(path.join(MANIFEST_DIR, "image-inventory.json"));
  const categorySummary = await readJson(path.join(MANIFEST_DIR, "category-summary.json"));
  const round2Flags = await readJson(path.join(MANIFEST_DIR, "round-2-flagged-images.json"));
  const policy = await readJson(path.join(MANIFEST_DIR, "round-2-recommended-policy.json"));
  const taxonomy = await readJson(path.join(MANIFEST_DIR, "round-3a-ai-error-taxonomy.json"));
  const entries = [...inventory.entries].sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath));
  const presentFiles = await collectPresentFiles(entries);
  const imageAnalyses = await analyzeInventoryImages(entries);
  const manifests = buildRound3AManifests({
    inventory,
    round2Flags,
    imageAnalyses,
    presentFiles,
  });
  const dryRunSample = buildApprovedProductionDryRunSample(manifests.approved);

  await writeJson(path.join(MANIFEST_DIR, "round-3a-blocked-source-images.json"), manifests.blocked);
  await writeJson(path.join(MANIFEST_DIR, "round-3a-approved-source-images.json"), manifests.approved);
  await writeJson(path.join(MANIFEST_DIR, "round-3a-approved-production-dry-run-sample.json"), dryRunSample);

  await materializeReviewArtifacts({
    blocked: manifests.blocked,
    approvedSample: dryRunSample,
    taxonomy,
  });

  await writeRound3AReports({
    inventory,
    categorySummary,
    round2Flags,
    policy,
    taxonomy,
    approved: manifests.approved,
    blocked: manifests.blocked,
    dryRunSample,
  });

  console.log(
    JSON.stringify(
      {
        totalPngsConsidered: manifests.approved.sourcePngsConsidered,
        round2BlockedCount: extractRound2FlaggedPaths(round2Flags).size,
        newRound3aRejectedCount: manifests.blocked.entries.filter((entry) =>
          entry.rejectionSources.includes("round-3a-source-qa") &&
          !entry.rejectionSources.includes("round-2-bakeoff"),
        ).length,
        finalApprovedCandidateCount: manifests.approved.totalApprovedCandidates,
        dryRunSampleSize: dryRunSample.actualSampleSize,
        blockedOverlap: 0,
      },
      null,
      2,
    ),
  );
}

async function analyzeInventoryImages(entries) {
  const sharp = loadSharp();
  const result = new Map();
  for (const entry of entries) {
    if (!entry.isPng || !entry.appearsReadable) continue;
    const absolutePath = path.join(REPO_ROOT, entry.sourceRelativePath);
    if (!fs.existsSync(absolutePath)) continue;
    result.set(entry.sourceRelativePath, await analyzeImageWithSharp(sharp, absolutePath));
  }
  return result;
}

async function analyzeImageWithSharp(sharp, absolutePath) {
  try {
    const metadata = await sharp(absolutePath, { failOn: "none", limitInputPixels: false }).metadata();
    const rendered = await sharp(absolutePath, { failOn: "none", limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = rendered;
    return {
      inspected: true,
      readable: true,
      width: Number(metadata.width || info.width),
      height: Number(metadata.height || info.height),
      ...measureLineArt(data, info.width, info.height),
    };
  } catch (error) {
    return {
      inspected: true,
      readable: false,
      error: String(error?.message || error),
      width: 0,
      height: 0,
      darkPixelRatio: 0,
      borderDarkRatio: 0,
      componentCount: 0,
      smallComponentRatio: 0,
      boundingBoxCoverage: 0,
    };
  }
}

function measureLineArt(data, width, height) {
  const total = width * height;
  const dark = new Uint8Array(total);
  let darkCount = 0;
  let borderDarkCount = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const border = Math.max(3, Math.floor(Math.min(width, height) * 0.055));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (data[index] < 218) {
        dark[index] = 1;
        darkCount += 1;
        if (x < border || y < border || x >= width - border || y >= height - border) {
          borderDarkCount += 1;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const components = countComponents(dark, width, height);
  const smallComponents = components.filter((size) => size <= 3).length;
  const bboxArea = darkCount
    ? ((maxX - minX + 1) * (maxY - minY + 1)) / total
    : 0;

  return {
    darkPixelRatio: roundMetric(darkCount / total),
    borderDarkRatio: roundMetric(darkCount ? borderDarkCount / darkCount : 0),
    componentCount: components.length,
    smallComponentRatio: roundMetric(components.length ? smallComponents / components.length : 0),
    boundingBoxCoverage: roundMetric(bboxArea),
  };
}

function countComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const stack = [];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let size = 0;
    visited[start] = 1;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      size += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    components.push(size);
  }
  return components;
}

async function collectPresentFiles(entries) {
  const present = new Map();
  for (const entry of entries) {
    const absolutePath = path.join(REPO_ROOT, entry.sourceRelativePath);
    try {
      const fileStat = await stat(absolutePath);
      if (fileStat.isFile()) present.set(entry.sourceRelativePath, fileStat.size);
    } catch {
      // Missing files are handled by the classifier.
    }
  }
  return present;
}

async function materializeReviewArtifacts({ blocked, approvedSample, taxonomy }) {
  await rm(REVIEW_ROOT, { recursive: true, force: true });
  await mkdir(path.join(REVIEW_ROOT, "rejected", "by-category"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "rejected", "contact-sheets"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "rejected", "reason-groups"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "approved-samples"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "reports"), { recursive: true });

  const sharp = loadSharp();
  const enrichedBlocked = [];
  for (const entry of blocked.entries) {
    const reviewPath = buildRejectedReviewPath(entry);
    const absoluteSource = path.join(REPO_ROOT, entry.sourceRelativePath);
    const absoluteReview = path.join(REPO_ROOT, reviewPath);
    await mkdir(path.dirname(absoluteReview), { recursive: true });
    if (fs.existsSync(absoluteSource)) {
      await createReviewImage({ sharp, sourcePath: absoluteSource, outputPath: absoluteReview });
    }
    enrichedBlocked.push({ ...entry, reviewArtifactPath: reviewPath });
  }

  const approvedReviewEntries = [];
  for (const sample of approvedSample.samples.slice(0, 150)) {
    const reviewPath = buildApprovedReviewPath(sample);
    const absoluteSource = path.join(REPO_ROOT, sample.sourceRelativePath);
    const absoluteReview = path.join(REPO_ROOT, reviewPath);
    await mkdir(path.dirname(absoluteReview), { recursive: true });
    if (fs.existsSync(absoluteSource)) {
      await createReviewImage({ sharp, sourcePath: absoluteSource, outputPath: absoluteReview });
    }
    approvedReviewEntries.push({ ...sample, reviewArtifactPath: reviewPath });
  }

  await writeContactSheets({ blocked: enrichedBlocked, approvedSamples: approvedReviewEntries, taxonomy });
}

async function createReviewImage({ sharp, sourcePath, outputPath }) {
  try {
    await sharp(sourcePath, { failOn: "none", limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 520, height: 520, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(outputPath);
  } catch {
    await copyFile(sourcePath, outputPath);
  }
}

async function writeContactSheets({ blocked, approvedSamples, taxonomy }) {
  const byCategory = groupBy(blocked, "category");
  const categoryIndex = [];
  for (const [category, entries] of Object.entries(byCategory)) {
    const filename = `${slugify(category)}.html`;
    const out = path.join(REVIEW_ROOT, "rejected", "contact-sheets", filename);
    await writeFile(
      out,
      renderContactSheetHtml({
        title: `Rejected Source QA - ${category}`,
        entries,
        taxonomy,
      }),
      "utf8",
    );
    categoryIndex.push({ label: category, href: filename, count: entries.length });
  }

  await writeFile(
    path.join(REVIEW_ROOT, "rejected", "contact-sheets", "rejected-by-category.html"),
    renderIndexHtml("Rejected Source QA By Category", categoryIndex),
    "utf8",
  );

  const reasonIndex = [];
  const reasons = new Set(blocked.flatMap((entry) => entry.reasonCodes || []));
  for (const reason of [...reasons].sort((a, b) => a.localeCompare(b))) {
    const entries = blocked.filter((entry) => (entry.reasonCodes || []).includes(reason));
    const filename = `${slugify(reason)}.html`;
    await writeFile(
      path.join(REVIEW_ROOT, "rejected", "reason-groups", filename),
      renderContactSheetHtml({
        title: `Rejected Source QA - ${reason}`,
        entries,
        taxonomy,
      }),
      "utf8",
    );
    reasonIndex.push({ label: reason, href: `../reason-groups/${filename}`, count: entries.length });
  }
  await writeFile(
    path.join(REVIEW_ROOT, "rejected", "contact-sheets", "rejected-by-reason.html"),
    renderIndexHtml("Rejected Source QA By Reason", reasonIndex),
    "utf8",
  );

  const highRisk = blocked.filter((entry) => entry.likelyHumanAdjacent);
  await writeFile(
    path.join(REVIEW_ROOT, "rejected", "contact-sheets", "high-risk-human-adjacent-rejects.html"),
    renderContactSheetHtml({
      title: "High-Risk Human-Adjacent Rejects",
      entries: highRisk,
      taxonomy,
    }),
    "utf8",
  );

  await writeFile(
    path.join(REVIEW_ROOT, "approved-samples", "approved-sample-contact-sheet.html"),
    renderContactSheetHtml({
      title: "Approved Source Sanity Sample",
      entries: approvedSamples,
      taxonomy,
    }),
    "utf8",
  );
}

function renderContactSheetHtml({ title, entries, taxonomy }) {
  const cards = entries
    .map((entry) => {
      const src = entry.reviewArtifactPath
        ? path.relative(path.dirname(path.join(REVIEW_ROOT, "x.html")), path.join(REPO_ROOT, entry.reviewArtifactPath)).replace(/\\/g, "/")
        : "";
      return `<article><img src="${escapeHtml(src)}" alt=""><h2>${escapeHtml(entry.category)}</h2><p>${escapeHtml(entry.sourceRelativePath)}</p><p>${escapeHtml((entry.reasonCodes || []).join(", "))}</p></article>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;background:#f7f7f7;color:#111}
.meta{max-width:900px;line-height:1.45}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
article{background:white;border:1px solid #d8d8d8;border-radius:6px;padding:10px}
img{width:100%;height:180px;object-fit:contain;background:white;border:1px solid #eee}
h1{font-size:24px}h2{font-size:14px;margin:8px 0 4px}p{font-size:12px;line-height:1.35;overflow-wrap:anywhere}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta"><p>Generated ${ROUND3A_GENERATED_AT}. Automatic QA is conservative and not authoritative. Uncertain images are rejected for now.</p><p>Taxonomy families: ${escapeHtml((taxonomy.issueFamilies || []).map((family) => family.family).join(", "))}</p></div>
<div class="grid">
${cards}
</div>
</body>
</html>
`;
}

function renderIndexHtml(title, rows) {
  const links = rows
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((row) => `<li><a href="${escapeHtml(row.href)}">${escapeHtml(row.label)}</a> (${row.count})</li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body><h1>${escapeHtml(title)}</h1><ul>${links}</ul></body></html>
`;
}

async function writeRound3AReports({
  inventory,
  categorySummary,
  round2Flags,
  policy,
  taxonomy,
  approved,
  blocked,
  dryRunSample,
}) {
  const totalPngs = inventory.totalPngImages;
  const round2Blocked = extractRound2FlaggedPaths(round2Flags).size;
  const newRound3aRejected = blocked.entries.filter((entry) =>
    entry.rejectionSources.includes("round-3a-source-qa") &&
    !entry.rejectionSources.includes("round-2-bakeoff"),
  ).length;
  const highRiskCategories = (categorySummary.categories || [])
    .filter((category) => category.humanAdjacentRisk)
    .map((category) => category.categoryName);
  const highRiskBlocked = blocked.entries.filter((entry) => entry.likelyHumanAdjacent).length;
  const rejectedByCategoryRows = tableRows(blocked.rejectedByCategory);
  const rejectedByReasonRows = tableRows(blocked.rejectedByReasonCode);

  await writeFile(
    path.join(REPORT_DIR, "round-3a-source-qa-report.md"),
    `# Round 3A Source QA Report

Generated: ${ROUND3A_GENERATED_AT}

## Summary

- Total source PNGs considered: ${totalPngs}
- Round 2 blocked count: ${round2Blocked}
- New Round 3A rejected count: ${newRound3aRejected}
- Final approved candidate count: ${approved.totalApprovedCandidates}
- Approved dry-run sample size: ${dryRunSample.actualSampleSize}
- Default future conversion policy: \`${policy.defaultPreset?.presetId || "line-thick"}\`

## Gate Rule

Future production, export, gallery, sitemap, and metadata scripts must consume \`pipeline/manifests/round-3a-approved-source-images.json\` or a later approved-source manifest. They must not directly use the raw source image folder for production-style inputs.

## Rejected Counts By Category

| Category | Rejected |
| --- | ---: |
${rejectedByCategoryRows}

## Rejected Counts By Reason Code

| Reason code | Count |
| --- | ---: |
${rejectedByReasonRows}

## High-Risk Category Handling

Human-adjacent categories are blocked for now because this round does not include manual anatomy review. High-risk categories: ${highRiskCategories.join(", ")}.

- High-risk rejected images: ${highRiskBlocked}
- High-risk approved images: 0

## Examples Of Rejection Logic

- Round 2 flagged paths are blocked with \`round2_flagged_conversion_or_anatomy\`.
- Human-adjacent paths are blocked with \`manual_review_uncertain_reject_for_now\`.
- Duplicate filenames are blocked with \`duplicate_filename_review\`.
- Dense or cluttered line art is blocked with \`over_dense_detail\`, \`tangled_linework\`, or \`poor_coloring_page_fit\`.
- Crop and margin risks are blocked with \`awkward_crop\` and \`subject_too_close_to_edge\`.

## Limitations

This is a conservative automated sweep, not a perfect anatomy detector. It cannot reliably identify extra fingers, malformed hands, broken joints, strange mouths, or subtle AI-art errors. Anything uncertain is rejected for now and must be restored only by a future explicit approval/update manifest.

## Exact Commands

\`\`\`powershell
node --test pipeline\\tests\\round-3a-source-qa.test.mjs
node pipeline\\scripts\\round-3a-source-qa.mjs
\`\`\`
`,
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-3a-rejection-summary.md"),
    `# Round 3A Rejection Summary

Generated: ${ROUND3A_GENERATED_AT}

## Counts

- Total blocked source images/files: ${blocked.totalBlocked}
- Round 2 blocked paths: ${round2Blocked}
- Newly rejected by Round 3A source QA: ${newRound3aRejected}
- Approved candidates remaining: ${approved.totalApprovedCandidates}

## Top Rejection Reason Codes

| Reason code | Count |
| --- | ---: |
${rejectedByReasonRows}

## Review Artifacts

- \`pipeline/review/source-qa/rejected/by-category/\`
- \`pipeline/review/source-qa/rejected/contact-sheets/rejected-by-category.html\`
- \`pipeline/review/source-qa/rejected/contact-sheets/rejected-by-reason.html\`
- \`pipeline/review/source-qa/rejected/contact-sheets/high-risk-human-adjacent-rejects.html\`
- \`pipeline/review/source-qa/approved-samples/approved-sample-contact-sheet.html\`

Review artifacts are local and intentionally ignored by Git.
`,
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-3a-next-phase-plan.md"),
    `# Round 3A Next Phase Plan

Generated: ${ROUND3A_GENERATED_AT}

## Current Gate

- Approved-source manifest: \`pipeline/manifests/round-3a-approved-source-images.json\`
- Blocked-source manifest: \`pipeline/manifests/round-3a-blocked-source-images.json\`
- Future conversion preset policy: \`${policy.defaultPreset?.presetId || "line-thick"}\`

## Round 3B Recommendation

Use only \`pipeline/manifests/round-3a-approved-source-images.json\`. Run a small approved-only production dry run using the \`line-thick\` policy and the dry-run sample in \`pipeline/manifests/round-3a-approved-production-dry-run-sample.json\`. Generate final-format SVG and PNG preview candidates only for that sample, write outputs outside the Next.js public folder, and produce QA manifests for pass/fail/quarantine decisions.

Do not process the full approved corpus until the dry-run output spec, CDN path policy, and review thresholds are approved.
`,
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-3a-production-dry-run-plan.md"),
    `# Round 3A Approved-Only Production Dry-Run Plan

Generated: ${ROUND3A_GENERATED_AT}

## Purpose

Prepare the next round without processing the full corpus.

## Inputs

- Approved source manifest: \`pipeline/manifests/round-3a-approved-source-images.json\`
- Dry-run sample manifest: \`pipeline/manifests/round-3a-approved-production-dry-run-sample.json\`
- Conversion policy: \`${policy.defaultPreset?.presetId || "line-thick"}\`

## Dry-Run Sample

- Target size: ${dryRunSample.targetSampleSize}
- Actual size: ${dryRunSample.actualSampleSize}
- Uses only approved source paths: yes
- Includes Round 2 flagged paths: no
- Includes Round 3A rejected paths: no

## Next Command Pattern

\`\`\`powershell
node --test pipeline\\tests\\round-3a-source-qa.test.mjs
node pipeline\\scripts\\round-3a-source-qa.mjs
\`\`\`

The next round should add a production dry-run exporter that reads \`pipeline/manifests/round-3a-approved-production-dry-run-sample.json\` directly. It should not reuse Round 2 sample selection for production inputs.
`,
    "utf8",
  );

  await writeFile(
    path.join(REVIEW_ROOT, "reports", "round-3a-review-index.md"),
    `# Round 3A Source QA Review Index

Generated: ${ROUND3A_GENERATED_AT}

- Blocked source entries: ${blocked.totalBlocked}
- Approved candidates: ${approved.totalApprovedCandidates}
- Taxonomy families: ${(taxonomy.issueFamilies || []).map((family) => family.family).join(", ")}

Open the HTML contact sheets under \`pipeline/review/source-qa/\` for local review.
`,
    "utf8",
  );
}

function toApprovedEntry(entry, classification) {
  return {
    sourceRelativePath: entry.sourceRelativePath,
    category: entry.category,
    nestedCategory: entry.nestedCategory || null,
    filename: entry.filename,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    dimensions: entry.dimensions,
    status: "approved_candidate",
    likelyHumanAdjacent: false,
    reasonCodes: [],
    qaMetrics: classification.qaMetrics,
    notes: ["Approved candidate after Round 3A source gate. Use only through approved-source manifests."],
  };
}

function toBlockedEntry(entry, classification) {
  return {
    sourceRelativePath: entry.sourceRelativePath,
    category: entry.category,
    nestedCategory: entry.nestedCategory || null,
    filename: entry.filename,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    dimensions: entry.dimensions,
    status: classification.status,
    likelyHumanAdjacent: classification.humanAdjacent,
    reasonCodes: classification.reasonCodes,
    rejectionSources: classification.rejectionSources,
    qaMetrics: classification.qaMetrics,
    reviewArtifactPath: buildRejectedReviewPath({
      sourceRelativePath: entry.sourceRelativePath,
      category: entry.category,
      filename: entry.filename,
    }),
    notes: classification.notes,
  };
}

function extractRound2FlaggedPaths(round2Flags) {
  const result = new Map();
  for (const item of round2Flags?.images || []) {
    result.set(item.sourceRelativePath, item);
  }
  return result;
}

function buildDuplicateFilenameSet(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const key = normalizeFilename(entry.filename);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
}

function normalizeFilename(filename) {
  return String(filename || "").toLowerCase();
}

function normalizeAnalysis(analysis) {
  return {
    inspected: Boolean(analysis.inspected),
    readable: Boolean(analysis.readable),
    width: Number(analysis.width || 0),
    height: Number(analysis.height || 0),
    darkPixelRatio: roundMetric(Number(analysis.darkPixelRatio || 0)),
    borderDarkRatio: roundMetric(Number(analysis.borderDarkRatio || 0)),
    componentCount: Number(analysis.componentCount || 0),
    smallComponentRatio: roundMetric(Number(analysis.smallComponentRatio || 0)),
    boundingBoxCoverage: roundMetric(Number(analysis.boundingBoxCoverage || 0)),
  };
}

function loadSharp() {
  const requireFromIloveSvg = createRequire(path.join(ILOVE_SVG_ROOT, "package.json"));
  return requireFromIloveSvg("sharp");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy(entries, key) {
  const counts = {};
  for (const entry of entries) {
    const value = entry[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return sortObject(counts);
}

function groupBy(entries, key) {
  const groups = {};
  for (const entry of entries) {
    const value = entry[key] || "unknown";
    if (!groups[value]) groups[value] = [];
    groups[value].push(entry);
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath));
  }
  return sortObject(groups);
}

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function pickEvenly(items, count) {
  if (count <= 0) return [];
  if (count >= items.length) return [...items];
  if (count === 1) return [items[0]];
  const picked = [];
  const maxIndex = items.length - 1;
  for (let index = 0; index < count; index += 1) {
    picked.push(items[Math.round((index * maxIndex) / (count - 1))]);
  }
  return picked;
}

function sumMap(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function buildDryRunSampleId(entry, index) {
  const filename = entry.filename || path.basename(entry.sourceRelativePath);
  return `r3a-dryrun-${String(index).padStart(3, "0")}-${slugify(entry.category)}-${slugify(path.parse(filename).name)}-${stableHash(entry.sourceRelativePath).slice(0, 8)}`;
}

function buildRejectedReviewPath(entry) {
  const basename = slugify(path.parse(entry.filename).name).slice(0, 48);
  return path.join(
    "pipeline",
    "review",
    "source-qa",
    "rejected",
    "by-category",
    slugify(entry.category),
    `${slugify(entry.category)}__${stableHash(entry.sourceRelativePath).slice(0, 10)}__${basename}.jpg`,
  );
}

function buildApprovedReviewPath(entry) {
  const basename = slugify(path.parse(entry.filename).name).slice(0, 48);
  return path.join(
    "pipeline",
    "review",
    "source-qa",
    "approved-samples",
    "images",
    `${slugify(entry.category)}__${stableHash(entry.sourceRelativePath).slice(0, 10)}__${basename}.jpg`,
  );
}

function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function slugify(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "unknown";
}

function roundMetric(value) {
  return Number(value.toFixed(5));
}

function tableRows(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `| ${key} | ${count} |`)
    .join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound3ASourceQa().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
