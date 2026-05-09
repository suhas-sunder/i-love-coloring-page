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
const REVIEW_ROOT = path.join(REPO_ROOT, "pipeline", "review", "source-qa-round-3a1");
const ILOVE_SVG_ROOT = path.join(REPO_ROOT, "ilovesvg");

const ROUND3A1_GENERATED_AT = "2026-05-09";
const DEFAULT_REJECTION_GUARD_LIMIT = 500;
const DEFAULT_DRY_RUN_SAMPLE_SIZE = 125;

const HIGH_RISK_CATEGORY_KEYWORDS = [
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

const HIGH_VALUE_CATEGORY_NAMES = new Set([
  "anime-girls",
  "chibi",
  "fantasy",
  "horror",
  "midieval",
  "mythology",
  "mandala-geometry-patterns",
  "animals",
  "holiday",
  "flowers",
]);

export const BLOCKING_REASON_CODES = new Set([
  "round2_flagged_conversion_or_anatomy",
  "unreadable_file",
  "non_png",
  "missing_source_file",
  "inventory_size_mismatch",
  "likely_malformed_hands",
  "likely_extra_fingers",
  "likely_missing_fingers",
  "likely_fused_fingers",
  "likely_malformed_feet",
  "likely_extra_limb",
  "likely_missing_limb",
  "likely_disconnected_limb",
  "likely_malformed_face",
  "likely_malformed_animal",
  "likely_object_merging",
  "broken_silhouette",
  "duplicate_image_exact_content",
  "tangled_linework_severe",
  "pseudo_text_or_garbled_letters",
  "watermark_or_signature_artifact",
  "awkward_crop_severe",
  "subject_cut_off_severe",
  "unreadable_subject",
  "over_dense_detail_severe",
  "poor_coloring_page_fit_clear",
  "duplicate_filename_requires_review_only_if_collision_affects_output",
]);

export const WARNING_REASON_CODES = new Set([
  "soft_warning_human_adjacent",
  "soft_warning_high_detail",
  "soft_warning_needs_spot_check",
  "soft_warning_possible_complexity",
  "soft_warning_duplicate_filename_collision_handled",
  "soft_warning_category_high_value_spot_check",
  "soft_warning_restored_from_round_3a_blocked",
  "soft_warning_border_margin_review",
]);

const SEVERE_THRESHOLDS = {
  tooFaintDarkPixelRatio: 0.004,
  severeOverDenseDarkPixelRatio: 0.74,
  severeClutterComponentCount: 2600,
  severeClutterSmallComponentRatio: 0.78,
  severeCropBorderDarkRatio: 0.42,
  severeCropBoundingBoxCoverage: 0.97,
  minimumDimension: 384,
};

const WARNING_THRESHOLDS = {
  possibleDenseDarkPixelRatio: 0.45,
  highComponentCount: 900,
  highSmallComponentRatio: 0.62,
  borderMarginReviewRatio: 0.26,
};

export function inferHighRiskCategory(...parts) {
  const haystack = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return HIGH_RISK_CATEGORY_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function buildRound3A1Manifests({
  inventory,
  round2Flags,
  oldRound3aBlocked,
  oldRound3aApproved,
  imageAnalyses = new Map(),
  presentFiles = new Map(),
  sourceHashes = new Map(),
  rejectionGuardLimit = DEFAULT_REJECTION_GUARD_LIMIT,
  generatedAt = ROUND3A1_GENERATED_AT,
} = {}) {
  const entries = [...(inventory?.entries || [])].sort((a, b) =>
    a.sourceRelativePath.localeCompare(b.sourceRelativePath),
  );
  const round2Flagged = extractRound2FlaggedPaths(round2Flags);
  const duplicateFilenames = buildDuplicateFilenameSet(entries);
  const exactDuplicateContent = buildExactDuplicateContentMap(entries, sourceHashes);
  const oldBlockedMap = mapByPath(oldRound3aBlocked?.entries || []);
  const oldApprovedMap = mapByPath(oldRound3aApproved?.entries || []);
  const approvedEntries = [];
  const blockedEntries = [];
  const warningEntries = [];
  const reclassifiedEntries = [];

  for (const entry of entries) {
    const classification = classifyRound3A1SourceEntry({
      entry,
      analysis: imageAnalyses.get(entry.sourceRelativePath),
      presentSize: presentFiles.get(entry.sourceRelativePath),
      round2Flag: round2Flagged.get(entry.sourceRelativePath),
      duplicateFilename: duplicateFilenames.has(normalizeFilename(entry.filename)),
      exactDuplicateOf: exactDuplicateContent.get(entry.sourceRelativePath),
      oldRound3aBlocked: oldBlockedMap.get(entry.sourceRelativePath),
    });

    const oldStatus = oldBlockedMap.has(entry.sourceRelativePath)
      ? "blocked_in_round_3a"
      : oldApprovedMap.has(entry.sourceRelativePath)
        ? "approved_in_round_3a"
        : "not_classified_in_round_3a";
    const newStatus = classification.blockingReasonCodes.length
      ? "rejected_for_now"
      : classification.warningCodes.length
        ? "approved_with_warning"
        : "approved_candidate";

    if (classification.blockingReasonCodes.length) {
      blockedEntries.push(toBlockedEntry(entry, classification, generatedAt));
    } else {
      const approvedEntry = toApprovedEntry(entry, classification, generatedAt);
      approvedEntries.push(approvedEntry);
      if (classification.warningCodes.length) {
        warningEntries.push(toWarningEntry(entry, classification, generatedAt));
      }
    }

    if (oldStatus !== newStatus) {
      reclassifiedEntries.push({
        sourceRelativePath: entry.sourceRelativePath,
        category: entry.category,
        oldRound3aStatus: oldStatus,
        newRound3a1Status: newStatus,
        oldRound3aReasonCodes: oldBlockedMap.get(entry.sourceRelativePath)?.reasonCodes || [],
        newBlockingReasonCodes: classification.blockingReasonCodes,
        newWarningCodes: classification.warningCodes,
      });
    }
  }

  const round2BlockedCount = blockedEntries.filter((entry) =>
    entry.rejectionSources.includes("round-2-bakeoff"),
  ).length;
  const newRound3a1RejectedCount = blockedEntries.filter((entry) =>
    !entry.rejectionSources.includes("round-2-bakeoff"),
  ).length;
  const diagnosticFailure = newRound3a1RejectedCount > rejectionGuardLimit;

  const approved = {
    generatedAt,
    status: diagnosticFailure ? "diagnostic_failure_if_rejection_guard_exceeded" : "ready_for_round_3b_dry_run",
    sourceManifest: "pipeline/manifests/image-inventory.json",
    replacesInvalidManifest: "pipeline/manifests/round-3a-approved-source-images.json",
    policy:
      "Corrected approved-source manifest. Category membership may create warnings but does not block images without concrete image-level evidence.",
    totalApprovedCandidates: diagnosticFailure ? 0 : approvedEntries.length,
    approvedWithoutWarningsCount: diagnosticFailure
      ? 0
      : approvedEntries.filter((entry) => entry.status === "approved_candidate").length,
    approvedWithWarningsCount: diagnosticFailure ? 0 : warningEntries.length,
    sourcePngsConsidered: entries.filter((entry) => entry.isPng).length,
    entries: diagnosticFailure ? [] : approvedEntries,
  };

  const blocked = {
    generatedAt,
    status: diagnosticFailure ? "diagnostic_failure_if_rejection_guard_exceeded" : "ready_for_round_3b_dry_run",
    sourceManifest: "pipeline/manifests/image-inventory.json",
    round2FlaggedManifest: "pipeline/manifests/round-2-flagged-images.json",
    replacesInvalidManifest: "pipeline/manifests/round-3a-blocked-source-images.json",
    rejectionGuardLimit,
    diagnosticFailure,
    totalBlocked: blockedEntries.length,
    round2BlockedCount,
    newRound3a1RejectedCount,
    rejectedByCategory: countBy(blockedEntries, "category"),
    rejectedByReasonCode: countByReasonCode(blockedEntries, "reasonCodes"),
    entries: blockedEntries,
  };

  const warnings = {
    generatedAt,
    status: diagnosticFailure ? "diagnostic_failure_if_rejection_guard_exceeded" : "ready_for_round_3b_dry_run",
    sourceManifest: "pipeline/manifests/image-inventory.json",
    policy:
      "Warning entries remain approved unless they also have concrete blocking reasons. Warning does not mean rejected.",
    totalWarningImages: diagnosticFailure ? 0 : warningEntries.length,
    warningOnlyApprovedCount: diagnosticFailure ? 0 : warningEntries.length,
    warningByCategory: diagnosticFailure ? {} : countBy(warningEntries, "category"),
    warningByReasonCode: diagnosticFailure ? {} : countByReasonCode(warningEntries, "warningCodes"),
    entries: diagnosticFailure ? [] : warningEntries,
  };

  const reclassified = buildReclassificationManifest({
    generatedAt,
    oldRound3aBlocked,
    oldRound3aApproved,
    approved,
    blocked,
    warnings,
    reclassifiedEntries,
    diagnosticFailure,
  });

  const manifests = {
    approved,
    blocked,
    warnings,
    reclassified,
    diagnosticFailure,
  };
  assertRound3A1Integrity(manifests);
  return manifests;
}

export function classifyRound3A1SourceEntry({
  entry,
  analysis,
  presentSize,
  round2Flag,
  duplicateFilename,
  exactDuplicateOf,
  oldRound3aBlocked,
}) {
  const blockingReasonCodes = new Set();
  const warningCodes = new Set();
  const rejectionSources = new Set();
  const notes = new Set();
  const highRiskCategory = Boolean(entry.likelyHumanAdjacent) ||
    inferHighRiskCategory(entry.category, entry.nestedCategory, entry.filename);
  const highValueCategory = HIGH_VALUE_CATEGORY_NAMES.has(entry.category);

  if (round2Flag) {
    blockingReasonCodes.add("round2_flagged_conversion_or_anatomy");
    rejectionSources.add("round-2-bakeoff");
    notes.add("Blocked because Round 2 flagged this source image.");
  }

  if (presentSize === undefined) {
    blockingReasonCodes.add("missing_source_file");
    blockingReasonCodes.add("unreadable_file");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Source path from Round 1 inventory is no longer present.");
  } else if (entry.fileSizeBytes !== undefined && presentSize !== entry.fileSizeBytes) {
    blockingReasonCodes.add("inventory_size_mismatch");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Current source file size does not match the Round 1 inventory.");
  }

  if (!entry.isPng || String(entry.extension || "").toLowerCase() !== ".png") {
    blockingReasonCodes.add("non_png");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Only readable PNG files may enter the approved-source manifest.");
  }

  if (!entry.appearsReadable) {
    blockingReasonCodes.add("unreadable_file");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Round 1 marked this source as unreadable or unrecognized.");
  }

  if (duplicateFilename) {
    warningCodes.add("soft_warning_duplicate_filename_collision_handled");
    notes.add("Duplicate filename is warning-only because future output IDs include category and source-path hash.");
  }

  if (exactDuplicateOf) {
    blockingReasonCodes.add("duplicate_image_exact_content");
    rejectionSources.add("round-3a1-source-qa");
    notes.add(`Exact source image duplicate of ${exactDuplicateOf}. Keep the canonical source path and exclude this duplicate from future processing.`);
  }

  if (highRiskCategory) {
    warningCodes.add("soft_warning_human_adjacent");
    warningCodes.add("soft_warning_needs_spot_check");
    notes.add("High-risk category receives stricter later spot-checking but is not blocked by category membership.");
  }

  if (highValueCategory) {
    warningCodes.add("soft_warning_category_high_value_spot_check");
    notes.add("High-value category is prioritized for representative review samples.");
  }

  if (oldRound3aBlocked && !round2Flag) {
    warningCodes.add("soft_warning_restored_from_round_3a_blocked");
    notes.add("Restored from invalid Round 3A blocked list unless concrete image-level blocking evidence remains.");
  }

  if (analysis) {
    applyImageSpecificRules({ analysis, blockingReasonCodes, warningCodes, rejectionSources, notes });
  } else if (entry.isPng && entry.appearsReadable && presentSize !== undefined) {
    warningCodes.add("soft_warning_needs_spot_check");
    notes.add("No source QA metrics were available, but absence of analysis is not a rejection reason.");
  }

  for (const code of analysis?.rejectionCodes || analysis?.concreteDefects || []) {
    if (BLOCKING_REASON_CODES.has(code)) {
      blockingReasonCodes.add(code);
      rejectionSources.add("round-3a1-source-qa");
      notes.add("Blocked by explicit image-specific defect code.");
    }
  }
  for (const code of analysis?.warningCodes || []) {
    if (WARNING_REASON_CODES.has(code)) warningCodes.add(code);
  }

  const blocking = [...blockingReasonCodes].sort((a, b) => a.localeCompare(b));
  const warnings = [...warningCodes].filter((code) => !blocking.includes(code)).sort((a, b) => a.localeCompare(b));
  const status = blocking.length
    ? "rejected_for_now"
    : warnings.length
      ? "approved_with_warning"
      : "approved_candidate";

  return {
    status,
    highRiskCategory,
    highValueCategory,
    blockingReasonCodes: blocking,
    warningCodes: warnings,
    rejectionSources: [...rejectionSources].sort((a, b) => a.localeCompare(b)),
    notes: [...notes].sort((a, b) => a.localeCompare(b)),
    qaMetrics: analysis ? normalizeAnalysis(analysis) : null,
  };
}

export function applyImageSpecificRules({
  analysis,
  blockingReasonCodes,
  warningCodes,
  rejectionSources,
  notes,
}) {
  if (analysis.readable === false) {
    blockingReasonCodes.add("unreadable_file");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Image inspection failed or the image could not be decoded.");
    return;
  }

  if (analysis.darkPixelRatio < SEVERE_THRESHOLDS.tooFaintDarkPixelRatio) {
    blockingReasonCodes.add("unreadable_subject");
    blockingReasonCodes.add("poor_coloring_page_fit_clear");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Image-specific metrics show almost no visible linework.");
  }

  if (
    analysis.darkPixelRatio > SEVERE_THRESHOLDS.severeOverDenseDarkPixelRatio ||
    (
      analysis.darkPixelRatio > 0.66 &&
      analysis.componentCount > 1800 &&
      analysis.smallComponentRatio > 0.72
    )
  ) {
    blockingReasonCodes.add("over_dense_detail_severe");
    blockingReasonCodes.add("poor_coloring_page_fit_clear");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Image-specific metrics show severe ink density likely to be uncolorable.");
  } else if (
    analysis.darkPixelRatio > WARNING_THRESHOLDS.possibleDenseDarkPixelRatio ||
    analysis.componentCount > WARNING_THRESHOLDS.highComponentCount ||
    analysis.smallComponentRatio > WARNING_THRESHOLDS.highSmallComponentRatio
  ) {
    warningCodes.add("soft_warning_possible_complexity");
    warningCodes.add("soft_warning_high_detail");
    notes.add("Image has high detail or density but no concrete rejection-level failure.");
  }

  if (
    analysis.componentCount > SEVERE_THRESHOLDS.severeClutterComponentCount &&
    analysis.smallComponentRatio > SEVERE_THRESHOLDS.severeClutterSmallComponentRatio
  ) {
    blockingReasonCodes.add("tangled_linework_severe");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Image-specific metrics show severe tiny-component clutter.");
  }

  if (
    analysis.borderDarkRatio > SEVERE_THRESHOLDS.severeCropBorderDarkRatio &&
    analysis.boundingBoxCoverage > SEVERE_THRESHOLDS.severeCropBoundingBoxCoverage
  ) {
    blockingReasonCodes.add("awkward_crop_severe");
    blockingReasonCodes.add("subject_cut_off_severe");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Image-specific metrics show severe edge contact consistent with cut-off subject risk.");
  } else if (analysis.borderDarkRatio > WARNING_THRESHOLDS.borderMarginReviewRatio) {
    warningCodes.add("soft_warning_border_margin_review");
    warningCodes.add("soft_warning_needs_spot_check");
    notes.add("Image has elevated border contact but not enough evidence for rejection.");
  }

  if (
    analysis.width < SEVERE_THRESHOLDS.minimumDimension ||
    analysis.height < SEVERE_THRESHOLDS.minimumDimension
  ) {
    blockingReasonCodes.add("poor_coloring_page_fit_clear");
    rejectionSources.add("round-3a1-source-qa");
    notes.add("Source dimensions are below the minimum expected image size.");
  }
}

export function assertRound3A1Integrity(result) {
  const approvedEntries = result.approved?.entries || [];
  const blockedEntries = result.blocked?.entries || [];
  const warningEntries = result.warnings?.entries || [];
  const approvedPaths = new Set(approvedEntries.map((entry) => entry.sourceRelativePath));
  const blockedPaths = new Set(blockedEntries.map((entry) => entry.sourceRelativePath));
  const warningPaths = new Set(warningEntries.map((entry) => entry.sourceRelativePath));
  const approvedBlockedOverlap = [...approvedPaths].filter((sourcePath) => blockedPaths.has(sourcePath));
  const warningBlockedOverlap = [...warningPaths].filter((sourcePath) => blockedPaths.has(sourcePath));
  const warningsMissingFromApproved = [...warningPaths].filter((sourcePath) => !approvedPaths.has(sourcePath));

  if (approvedBlockedOverlap.length) {
    throw new Error(`Round 3A.1 approved and blocked overlap: ${approvedBlockedOverlap.slice(0, 10).join(", ")}`);
  }
  if (warningBlockedOverlap.length) {
    throw new Error(`Round 3A.1 warning and blocked overlap: ${warningBlockedOverlap.slice(0, 10).join(", ")}`);
  }
  if (warningsMissingFromApproved.length) {
    throw new Error(`Round 3A.1 warning paths missing from approved manifest: ${warningsMissingFromApproved.slice(0, 10).join(", ")}`);
  }

  for (const entry of blockedEntries) {
    if ((entry.reasonCodes || []).length === 0) {
      throw new Error(`Blocked entry has no concrete reason: ${entry.sourceRelativePath}`);
    }
    if ((entry.reasonCodes || []).some((code) => WARNING_REASON_CODES.has(code))) {
      throw new Error(`Warning code used as blocking reason: ${entry.sourceRelativePath}`);
    }
    if ((entry.reasonCodes || []).some((code) => !BLOCKING_REASON_CODES.has(code))) {
      throw new Error(`Unknown or non-concrete blocking reason on ${entry.sourceRelativePath}`);
    }
  }
}

export function buildRound3A1ProductionDryRunSample({ approved, blocked }, options = {}) {
  const targetSize = Math.min(Number(options.targetSize || DEFAULT_DRY_RUN_SAMPLE_SIZE), approved.entries.length);
  const blockedPaths = new Set((blocked.entries || []).map((entry) => entry.sourceRelativePath));
  const eligible = (approved.entries || [])
    .filter((entry) => !blockedPaths.has(entry.sourceRelativePath))
    .sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath));
  const groups = new Map();
  for (const entry of eligible) {
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
      const highValueWeight = HIGH_VALUE_CATEGORY_NAMES.has(category) ? 1.4 : 1;
      const score = (highValueWeight * Math.sqrt(group.length)) / (allocated + 1);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    if (!bestCategory) break;
    allocations.set(bestCategory, (allocations.get(bestCategory) || 0) + 1);
  }

  const warningBudget = Math.max(8, Math.ceil(targetSize * 0.35));
  let warningsUsed = 0;
  const selected = [];
  for (const category of categories) {
    const group = groups.get(category) || [];
    const count = allocations.get(category) || 0;
    if (!count) continue;
    const warnings = group.filter((entry) => entry.status === "approved_with_warning");
    const clean = group.filter((entry) => entry.status !== "approved_with_warning");
    const picked = [];
    if (HIGH_VALUE_CATEGORY_NAMES.has(category) && warnings.length && warningsUsed < warningBudget) {
      picked.push(warnings[0]);
      warningsUsed += 1;
    }
    const cleanNeed = count - picked.length;
    picked.push(...pickEvenly(clean.length ? clean : group, cleanNeed));
    while (picked.length < count && warningsUsed < warningBudget && warnings.length) {
      const candidate = warnings[picked.length % warnings.length];
      if (!picked.some((entry) => entry.sourceRelativePath === candidate.sourceRelativePath)) {
        picked.push(candidate);
        warningsUsed += 1;
      } else {
        break;
      }
    }
    selected.push(...picked.slice(0, count));
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of selected) {
    if (seen.has(entry.sourceRelativePath)) continue;
    seen.add(entry.sourceRelativePath);
    deduped.push(entry);
  }
  for (const entry of eligible) {
    if (deduped.length >= targetSize) break;
    if (seen.has(entry.sourceRelativePath)) continue;
    deduped.push(entry);
    seen.add(entry.sourceRelativePath);
  }

  const samples = deduped
    .slice(0, targetSize)
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
      warningCodes: entry.warningCodes || [],
      futurePolicyPresetId: "line-thick",
      notes: ["Approved-source dry-run candidate only. Do not process full corpus in Round 3A.1."],
    }));

  return {
    generatedAt: ROUND3A1_GENERATED_AT,
    sourceManifest: "pipeline/manifests/round-3a1-approved-source-images.json",
    blockedManifest: "pipeline/manifests/round-3a1-blocked-source-images.json",
    policyManifest: "pipeline/manifests/round-2-recommended-policy.json",
    targetSampleSize: targetSize,
    actualSampleSize: samples.length,
    warningSampleCount: samples.filter((entry) => entry.status === "approved_with_warning").length,
    selectionStrategy:
      "Approved-source only, includes every category where possible, prioritizes high-value categories without allowing warnings to dominate the sample.",
    samples,
  };
}

async function runRound3A1SourceQa() {
  const inventory = await readJson(path.join(MANIFEST_DIR, "image-inventory.json"));
  const categorySummary = await readJson(path.join(MANIFEST_DIR, "category-summary.json"));
  const round2Flags = await readJson(path.join(MANIFEST_DIR, "round-2-flagged-images.json"));
  const oldRound3aBlocked = await readJson(path.join(MANIFEST_DIR, "round-3a-blocked-source-images.json"));
  const oldRound3aApproved = await readJson(path.join(MANIFEST_DIR, "round-3a-approved-source-images.json"));
  const taxonomy = await readJson(path.join(MANIFEST_DIR, "round-3a-ai-error-taxonomy.json"));
  const entries = [...inventory.entries].sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath));
  const presentFiles = await collectPresentFiles(entries);
  const sourceHashes = await collectSourceHashes(entries);
  const imageAnalyses = await analyzeInventoryImages(entries);
  const manifests = buildRound3A1Manifests({
    inventory,
    round2Flags,
    oldRound3aBlocked,
    oldRound3aApproved,
    imageAnalyses,
    presentFiles,
    sourceHashes,
  });
  const dryRunSample = manifests.diagnosticFailure
    ? buildDiagnosticDryRunSample()
    : buildRound3A1ProductionDryRunSample({
      approved: manifests.approved,
      blocked: manifests.blocked,
    });

  await writeJson(path.join(MANIFEST_DIR, "round-3a1-blocked-source-images.json"), manifests.blocked);
  await writeJson(path.join(MANIFEST_DIR, "round-3a1-approved-source-images.json"), manifests.approved);
  await writeJson(path.join(MANIFEST_DIR, "round-3a1-warning-source-images.json"), manifests.warnings);
  await writeJson(path.join(MANIFEST_DIR, "round-3a1-reclassified-from-round-3a.json"), manifests.reclassified);
  await writeJson(path.join(MANIFEST_DIR, "round-3a1-approved-production-dry-run-sample.json"), dryRunSample);

  await materializeReviewArtifacts({
    blocked: manifests.blocked,
    warnings: manifests.warnings,
    approved: manifests.approved,
    dryRunSample,
    taxonomy,
  });

  await writeRound3A1Reports({
    inventory,
    categorySummary,
    round2Flags,
    oldRound3aBlocked,
    oldRound3aApproved,
    taxonomy,
    approved: manifests.approved,
    blocked: manifests.blocked,
    warnings: manifests.warnings,
    reclassified: manifests.reclassified,
    dryRunSample,
  });

  console.log(
    JSON.stringify(
      {
        totalPngsConsidered: inventory.totalPngImages,
        oldRound3aApprovedCount: oldRound3aApproved.totalApprovedCandidates,
        oldRound3aBlockedCount: oldRound3aBlocked.totalBlocked,
        correctedApprovedCount: manifests.approved.totalApprovedCandidates,
        correctedBlockedCount: manifests.blocked.totalBlocked,
        newRound3a1RejectedCount: manifests.blocked.newRound3a1RejectedCount,
        rejectionGuardLimit: manifests.blocked.rejectionGuardLimit,
        diagnosticFailure: manifests.diagnosticFailure,
        warningCount: manifests.warnings.totalWarningImages,
        dryRunSampleSize: dryRunSample.actualSampleSize,
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
      // Missing files are represented by absence from the map.
    }
  }
  return present;
}

async function collectSourceHashes(entries) {
  const hashes = new Map();
  for (const entry of entries) {
    if (!entry.isPng || !entry.appearsReadable) continue;
    const absolutePath = path.join(REPO_ROOT, entry.sourceRelativePath);
    if (!fs.existsSync(absolutePath)) continue;
    hashes.set(entry.sourceRelativePath, await hashFile(absolutePath));
  }
  return hashes;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function materializeReviewArtifacts({ blocked, warnings, approved, dryRunSample, taxonomy }) {
  await rm(REVIEW_ROOT, { recursive: true, force: true });
  await mkdir(path.join(REVIEW_ROOT, "rejected", "by-category"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "rejected", "contact-sheets"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "rejected", "reason-groups"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "warnings", "by-category"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "warnings", "contact-sheets"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "approved-samples"), { recursive: true });
  await mkdir(path.join(REVIEW_ROOT, "reports"), { recursive: true });

  const sharp = loadSharp();
  const rejectedWithArtifacts = [];
  for (const entry of blocked.entries || []) {
    const reviewArtifactPath = buildReviewPath(entry, ["rejected", "by-category", slugify(entry.category)]);
    await writeReviewImage({ sharp, entry, reviewArtifactPath });
    rejectedWithArtifacts.push({ ...entry, reviewArtifactPath });
  }

  const warningsWithArtifacts = [];
  for (const entry of warnings.entries || []) {
    const reviewArtifactPath = buildReviewPath(entry, ["warnings", "by-category", slugify(entry.category)]);
    await writeReviewImage({ sharp, entry, reviewArtifactPath });
    warningsWithArtifacts.push({ ...entry, reviewArtifactPath });
  }

  const approvedSampleEntries = [];
  const approvedOverall = selectReviewSample(approved.entries || [], 160);
  const approvedHighRisk = selectReviewSample((approved.entries || []).filter((entry) => entry.highRiskCategory), 160);
  const approvedHighDetail = selectReviewSample(
    (approved.entries || []).filter((entry) => (entry.warningCodes || []).includes("soft_warning_high_detail")),
    160,
  );
  await writeApprovedSampleImages({ sharp, entries: approvedOverall, folder: "overall-approved", output: approvedSampleEntries });
  await writeApprovedSampleImages({ sharp, entries: approvedHighRisk, folder: "approved-high-risk", output: approvedSampleEntries });
  await writeApprovedSampleImages({ sharp, entries: approvedHighDetail, folder: "approved-high-detail", output: approvedSampleEntries });

  await writeContactSheets({
    rejected: rejectedWithArtifacts,
    warnings: warningsWithArtifacts,
    approvedSamples: approvedSampleEntries,
    dryRunSample,
    taxonomy,
  });
}

async function writeApprovedSampleImages({ sharp, entries, folder, output }) {
  for (const entry of entries) {
    const reviewArtifactPath = buildReviewPath(entry, ["approved-samples", folder]);
    await writeReviewImage({ sharp, entry, reviewArtifactPath });
    output.push({ ...entry, reviewArtifactPath, sampleGroup: folder });
  }
}

async function writeReviewImage({ sharp, entry, reviewArtifactPath }) {
  const absoluteSource = path.join(REPO_ROOT, entry.sourceRelativePath);
  const absoluteReview = path.join(REPO_ROOT, reviewArtifactPath);
  await mkdir(path.dirname(absoluteReview), { recursive: true });
  if (!fs.existsSync(absoluteSource)) return;
  try {
    await sharp(absoluteSource, { failOn: "none", limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 520, height: 520, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(absoluteReview);
  } catch {
    await copyFile(absoluteSource, absoluteReview);
  }
}

async function writeContactSheets({ rejected, warnings, approvedSamples, dryRunSample, taxonomy }) {
  await writeGroupedSheets({
    entries: rejected,
    groupKey: "category",
    root: path.join(REVIEW_ROOT, "rejected", "contact-sheets"),
    titlePrefix: "Round 3A.1 Rejected",
    taxonomy,
  });
  await writeReasonSheets({
    entries: rejected,
    root: path.join(REVIEW_ROOT, "rejected", "reason-groups"),
    titlePrefix: "Round 3A.1 Rejected Reason",
    reasonField: "reasonCodes",
    taxonomy,
  });
  await writeGroupedSheets({
    entries: warnings,
    groupKey: "category",
    root: path.join(REVIEW_ROOT, "warnings", "contact-sheets"),
    titlePrefix: "Round 3A.1 Warning",
    taxonomy,
  });

  await writeFile(
    path.join(REVIEW_ROOT, "warnings", "contact-sheets", "high-risk-warning-spot-check.html"),
    renderContactSheetHtml({
      title: "Round 3A.1 High-Risk Approved Warning Spot Check",
      entries: warnings.filter((entry) => entry.highRiskCategory),
      taxonomy,
      reasonField: "warningCodes",
    }),
    "utf8",
  );

  await writeFile(
    path.join(REVIEW_ROOT, "approved-samples", "overall-approved-sample.html"),
    renderContactSheetHtml({
      title: "Round 3A.1 Overall Approved Sample",
      entries: approvedSamples.filter((entry) => entry.sampleGroup === "overall-approved"),
      taxonomy,
      reasonField: "warningCodes",
    }),
    "utf8",
  );
  await writeFile(
    path.join(REVIEW_ROOT, "approved-samples", "approved-high-risk-sample.html"),
    renderContactSheetHtml({
      title: "Round 3A.1 Approved High-Risk Sample",
      entries: approvedSamples.filter((entry) => entry.sampleGroup === "approved-high-risk"),
      taxonomy,
      reasonField: "warningCodes",
    }),
    "utf8",
  );
  await writeFile(
    path.join(REVIEW_ROOT, "approved-samples", "approved-high-detail-sample.html"),
    renderContactSheetHtml({
      title: "Round 3A.1 Approved High-Detail Sample",
      entries: approvedSamples.filter((entry) => entry.sampleGroup === "approved-high-detail"),
      taxonomy,
      reasonField: "warningCodes",
    }),
    "utf8",
  );
  await writeFile(
    path.join(REVIEW_ROOT, "approved-samples", "approved-dry-run-sample.html"),
    renderContactSheetHtml({
      title: "Round 3A.1 Approved Dry-Run Sample",
      entries: dryRunSample.samples || [],
      taxonomy,
      reasonField: "warningCodes",
    }),
    "utf8",
  );
}

async function writeGroupedSheets({ entries, groupKey, root, titlePrefix, taxonomy }) {
  const groups = groupBy(entries, groupKey);
  const indexRows = [];
  for (const [group, groupEntries] of Object.entries(groups)) {
    const filename = `${slugify(group)}.html`;
    await writeFile(
      path.join(root, filename),
      renderContactSheetHtml({
        title: `${titlePrefix} - ${group}`,
        entries: groupEntries,
        taxonomy,
        reasonField: groupEntries[0]?.reasonCodes ? "reasonCodes" : "warningCodes",
      }),
      "utf8",
    );
    indexRows.push({ label: group, href: filename, count: groupEntries.length });
  }
  await writeFile(path.join(root, "index.html"), renderIndexHtml(`${titlePrefix} Index`, indexRows), "utf8");
}

async function writeReasonSheets({ entries, root, titlePrefix, reasonField, taxonomy }) {
  const reasons = new Set(entries.flatMap((entry) => entry[reasonField] || []));
  const indexRows = [];
  for (const reason of [...reasons].sort((a, b) => a.localeCompare(b))) {
    const reasonEntries = entries.filter((entry) => (entry[reasonField] || []).includes(reason));
    const filename = `${slugify(reason)}.html`;
    await writeFile(
      path.join(root, filename),
      renderContactSheetHtml({
        title: `${titlePrefix} - ${reason}`,
        entries: reasonEntries,
        taxonomy,
        reasonField,
      }),
      "utf8",
    );
    indexRows.push({ label: reason, href: filename, count: reasonEntries.length });
  }
  await writeFile(path.join(root, "index.html"), renderIndexHtml(`${titlePrefix} Index`, indexRows), "utf8");
}

async function writeRound3A1Reports({
  inventory,
  categorySummary,
  round2Flags,
  oldRound3aBlocked,
  oldRound3aApproved,
  approved,
  blocked,
  warnings,
  reclassified,
  dryRunSample,
}) {
  const highRiskCategories = (categorySummary.categories || [])
    .filter((category) => category.humanAdjacentRisk)
    .map((category) => category.categoryName);
  const highRiskCounts = buildHighRiskCounts({ approved, blocked, warnings, highRiskCategories });
  const warningOnlyApproved = warnings.warningOnlyApprovedCount || 0;
  const restored = reclassified.restoredFromOldRound3aBlockedCount || 0;

  await writeFile(
    path.join(REPORT_DIR, "round-3a1-correction-report.md"),
    `# Round 3A.1 Correction Report

Generated: ${ROUND3A1_GENERATED_AT}

## What Went Wrong In Round 3A

Round 3A treated high-risk category membership as a blocking condition. The old script added the legacy uncertainty rejection reason to every human-adjacent source path, blocked duplicate filenames, and treated moderate density or clutter metrics as rejection-level failures. That produced zero approved images in high-value human-adjacent categories.

## Logic Changed

- Category membership now creates warning flags and review priority only.
- Human-adjacent and high-value categories remain eligible when the individual image has no concrete blocking defect.
- Duplicate filenames are warning-only because deterministic output IDs include category and source-path hash.
- Same-name images with different content are kept and assigned collision-safe recommended output IDs.
- Exact duplicate image content is blocked for the duplicate copy only, while the canonical source path stays eligible.
- Moderate density, complexity, and border contact are warning-only.
- Only Round 2 flags, unreadable/non-PNG files, missing/changed files, and severe image-specific failures block an image.
- New non-Round 2 rejection counts above ${DEFAULT_REJECTION_GUARD_LIMIT} trigger diagnostic-failure mode.

## Counts

- Old Round 3A approved count: ${oldRound3aApproved.totalApprovedCandidates}
- Old Round 3A blocked count: ${oldRound3aBlocked.totalBlocked}
- Corrected Round 3A.1 approved count: ${approved.totalApprovedCandidates}
- Corrected Round 3A.1 blocked count: ${blocked.totalBlocked}
- Corrected Round 3A.1 new rejection count excluding Round 2 blocked images: ${blocked.newRound3a1RejectedCount}
- Rejection count stayed under ${blocked.rejectionGuardLimit}: ${blocked.newRound3a1RejectedCount <= blocked.rejectionGuardLimit ? "yes" : "no"}
- Diagnostic-failure mode triggered: ${blocked.diagnosticFailure ? "yes" : "no"}
- Warning count: ${warnings.totalWarningImages}
- Warning-only and still approved: ${warningOnlyApproved}
- Restored from old Round 3A blocked list: ${restored}
- Round 2 flagged paths still blocked: ${round2Flags.images.length}

## High-Risk Category Counts

${highRiskTable(highRiskCounts)}

## Top Concrete Rejection Reasons

${tableFromObject(blocked.rejectedByReasonCode)}

## Top Warning Reasons

${tableFromObject(warnings.warningByReasonCode)}

## Wholesale Category Rejection Check

No category is rejected solely because of folder name. High-risk category membership appears only in warning metadata and review artifacts.

## Rerun Commands

\`\`\`powershell
node --test pipeline\\tests\\round-3a1-source-qa.test.mjs
node pipeline\\scripts\\round-3a1-source-qa.mjs
\`\`\`
`,
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-3a1-reclassification-summary.md"),
    `# Round 3A.1 Reclassification Summary

Generated: ${ROUND3A1_GENERATED_AT}

- Old Round 3A approved: ${oldRound3aApproved.totalApprovedCandidates}
- Old Round 3A blocked: ${oldRound3aBlocked.totalBlocked}
- Corrected approved: ${approved.totalApprovedCandidates}
- Corrected blocked: ${blocked.totalBlocked}
- Warning images: ${warnings.totalWarningImages}
- Restored from old Round 3A blocked: ${restored}
- Warning-only and still approved: ${warningOnlyApproved}

## Approved By Category

${tableFromObject(countBy(approved.entries, "category"))}

## Blocked By Category

${tableFromObject(blocked.rejectedByCategory)}

## Warning By Category

${tableFromObject(warnings.warningByCategory)}
`,
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-3a1-rejection-guard-report.md"),
    `# Round 3A.1 Rejection Guard Report

Generated: ${ROUND3A1_GENERATED_AT}

- Guard limit for new non-Round 2 rejections: ${blocked.rejectionGuardLimit}
- Actual new non-Round 2 rejections: ${blocked.newRound3a1RejectedCount}
- Diagnostic-failure mode triggered: ${blocked.diagnosticFailure ? "yes" : "no"}

## Rule Attribution

${tableFromObject(blocked.rejectedByReasonCode)}

The corrected run stayed under the guard when \`diagnostic-failure mode triggered\` is no. If this flips to yes in a future run, do not consume approved/blocked outputs for production planning until the spike is diagnosed.
`,
    "utf8",
  );

  await writeFile(
    path.join(REPORT_DIR, "round-3a1-next-phase-plan.md"),
    `# Round 3A.1 Next Phase Plan

Generated: ${ROUND3A1_GENERATED_AT}

## Current Inputs For Round 3B

- Approved source manifest: \`pipeline/manifests/round-3a1-approved-source-images.json\`
- Blocked source manifest: \`pipeline/manifests/round-3a1-blocked-source-images.json\`
- Warning source manifest: \`pipeline/manifests/round-3a1-warning-source-images.json\`
- Dry-run sample: \`pipeline/manifests/round-3a1-approved-production-dry-run-sample.json\`
- Conversion preset policy: \`line-thick\`

## Recommendation

Round 3B is ready only for an approved-only dry run. It should convert the 125-image dry-run sample using \`line-thick\`, write final-format candidate assets outside the Next.js public folder, and produce pass/fail/quarantine QA manifests. It must not process the full approved corpus yet.
`,
    "utf8",
  );

  await writeFile(
    path.join(REVIEW_ROOT, "reports", "round-3a1-review-index.md"),
    `# Round 3A.1 Review Index

Generated: ${ROUND3A1_GENERATED_AT}

- Rejected images/files: ${blocked.totalBlocked}
- Warning images: ${warnings.totalWarningImages}
- Approved candidates: ${approved.totalApprovedCandidates}
- Dry-run sample: ${dryRunSample.actualSampleSize}

Review artifacts under this folder are local and intentionally ignored by Git.
`,
    "utf8",
  );
}

function buildReclassificationManifest({
  generatedAt,
  oldRound3aBlocked,
  oldRound3aApproved,
  approved,
  blocked,
  warnings,
  reclassifiedEntries,
  diagnosticFailure,
}) {
  const oldBlockedPaths = new Set((oldRound3aBlocked?.entries || []).map((entry) => entry.sourceRelativePath));
  const newBlockedPaths = new Set((blocked.entries || []).map((entry) => entry.sourceRelativePath));
  const restored = [...oldBlockedPaths].filter((sourcePath) => !newBlockedPaths.has(sourcePath)).length;
  return {
    generatedAt,
    status: diagnosticFailure ? "diagnostic_failure_if_rejection_guard_exceeded" : "ready_for_round_3b_dry_run",
    oldRound3aApprovedCount: oldRound3aApproved?.totalApprovedCandidates || 0,
    oldRound3aBlockedCount: oldRound3aBlocked?.totalBlocked || 0,
    correctedApprovedCount: approved.totalApprovedCandidates,
    correctedBlockedCount: blocked.totalBlocked,
    correctedWarningCount: warnings.totalWarningImages,
    restoredFromOldRound3aBlockedCount: restored,
    changedClassificationCount: reclassifiedEntries.length,
    entries: reclassifiedEntries.sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath)),
  };
}

function toApprovedEntry(entry, classification, generatedAt) {
  return {
    sourceRelativePath: entry.sourceRelativePath,
    category: entry.category,
    nestedCategory: entry.nestedCategory || null,
    filename: entry.filename,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    dimensions: entry.dimensions,
    status: classification.status,
    highRiskCategory: classification.highRiskCategory,
    highValueCategory: classification.highValueCategory,
    recommendedOutputId: buildRecommendedOutputId(entry),
    recommendedOutputFilenameBase: buildRecommendedOutputId(entry),
    reasonCodes: [],
    warningCodes: classification.warningCodes,
    qaMetrics: classification.qaMetrics,
    approvedAt: generatedAt,
    notes: classification.notes,
  };
}

function toWarningEntry(entry, classification, generatedAt) {
  return {
    sourceRelativePath: entry.sourceRelativePath,
    category: entry.category,
    nestedCategory: entry.nestedCategory || null,
    filename: entry.filename,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    dimensions: entry.dimensions,
    status: "approved_with_warning",
    highRiskCategory: classification.highRiskCategory,
    highValueCategory: classification.highValueCategory,
    recommendedOutputId: buildRecommendedOutputId(entry),
    recommendedOutputFilenameBase: buildRecommendedOutputId(entry),
    warningCodes: classification.warningCodes,
    qaMetrics: classification.qaMetrics,
    approvedManifest: "pipeline/manifests/round-3a1-approved-source-images.json",
    warningAt: generatedAt,
    notes: classification.notes,
  };
}

function toBlockedEntry(entry, classification, generatedAt) {
  return {
    sourceRelativePath: entry.sourceRelativePath,
    category: entry.category,
    nestedCategory: entry.nestedCategory || null,
    filename: entry.filename,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    dimensions: entry.dimensions,
    status: "rejected_for_now",
    highRiskCategory: classification.highRiskCategory,
    highValueCategory: classification.highValueCategory,
    recommendedOutputId: buildRecommendedOutputId(entry),
    recommendedOutputFilenameBase: buildRecommendedOutputId(entry),
    reasonCodes: classification.blockingReasonCodes,
    warningCodes: [],
    rejectionSources: classification.rejectionSources,
    qaMetrics: classification.qaMetrics,
    reviewArtifactPath: buildReviewPath(entry, ["rejected", "by-category", slugify(entry.category)]),
    rejectedAt: generatedAt,
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

function buildExactDuplicateContentMap(entries, sourceHashes) {
  const byHash = new Map();
  for (const entry of entries) {
    const hash = sourceHashes.get(entry.sourceRelativePath);
    if (!hash) continue;
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(entry.sourceRelativePath);
  }
  const duplicates = new Map();
  for (const paths of byHash.values()) {
    if (paths.length < 2) continue;
    paths.sort((a, b) => a.localeCompare(b));
    const canonical = paths[0];
    for (const duplicate of paths.slice(1)) {
      duplicates.set(duplicate, canonical);
    }
  }
  return duplicates;
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

function mapByPath(entries) {
  return new Map(entries.map((entry) => [entry.sourceRelativePath, entry]));
}

function countBy(entries, key) {
  const counts = {};
  for (const entry of entries || []) {
    const value = entry[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return sortObject(counts);
}

function countByReasonCode(entries, key = "reasonCodes") {
  const counts = {};
  for (const entry of entries || []) {
    for (const code of entry[key] || []) {
      counts[code] = (counts[code] || 0) + 1;
    }
  }
  return sortObject(counts);
}

function groupBy(entries, key) {
  const groups = {};
  for (const entry of entries || []) {
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

function sumMap(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
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

function selectReviewSample(entries, target) {
  const sorted = [...entries].sort((a, b) => stableHash(a.sourceRelativePath).localeCompare(stableHash(b.sourceRelativePath)));
  return pickEvenly(sorted, Math.min(target, sorted.length));
}

function buildDryRunSampleId(entry, index) {
  const filename = entry.filename || path.basename(entry.sourceRelativePath);
  return `r3a1-dryrun-${String(index).padStart(3, "0")}-${slugify(entry.category)}-${slugify(path.parse(filename).name)}-${stableHash(entry.sourceRelativePath).slice(0, 8)}`;
}

function buildRecommendedOutputId(entry) {
  const filename = entry.filename || path.basename(entry.sourceRelativePath);
  return `${slugify(entry.category)}__${slugify(path.parse(filename).name)}__${stableHash(entry.sourceRelativePath).slice(0, 10)}`;
}

function buildReviewPath(entry, parts) {
  const filename = entry.filename || path.basename(entry.sourceRelativePath);
  const basename = slugify(path.parse(filename).name).slice(0, 48);
  return path.join(
    "pipeline",
    "review",
    "source-qa-round-3a1",
    ...parts,
    `${slugify(entry.category)}__${stableHash(entry.sourceRelativePath).slice(0, 10)}__${basename}.jpg`,
  );
}

function renderContactSheetHtml({ title, entries, taxonomy, reasonField }) {
  const cards = entries
    .map((entry) => {
      const src = entry.reviewArtifactPath
        ? path.relative(REVIEW_ROOT, path.join(REPO_ROOT, entry.reviewArtifactPath)).replace(/\\/g, "/")
        : "";
      const codes = (entry[reasonField] || []).join(", ");
      return `<article><img src="${escapeHtml(src)}" alt=""><h2>${escapeHtml(entry.category)}</h2><p>${escapeHtml(entry.sourceRelativePath)}</p><p>${escapeHtml(codes)}</p></article>`;
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
<div class="meta"><p>Generated ${ROUND3A1_GENERATED_AT}. Category membership creates review priority, not rejection.</p><p>Taxonomy families: ${escapeHtml((taxonomy.issueFamilies || []).map((family) => family.family).join(", "))}</p></div>
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

function tableFromObject(object) {
  const rows = Object.entries(object || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `| ${key} | ${count} |`)
    .join("\n");
  return `| Item | Count |\n| --- | ---: |\n${rows || "| none | 0 |"}`;
}

function buildHighRiskCounts({ approved, blocked, warnings, highRiskCategories }) {
  const rows = {};
  for (const category of highRiskCategories) {
    rows[category] = {
      approved: (approved.entries || []).filter((entry) => entry.category === category).length,
      blocked: (blocked.entries || []).filter((entry) => entry.category === category).length,
      warnings: (warnings.entries || []).filter((entry) => entry.category === category).length,
    };
  }
  return rows;
}

function highRiskTable(rows) {
  const lines = Object.entries(rows)
    .map(([category, counts]) => `| ${category} | ${counts.approved} | ${counts.warnings} | ${counts.blocked} |`)
    .join("\n");
  return `| Category | Approved | Warnings | Blocked |\n| --- | ---: | ---: | ---: |\n${lines}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildDiagnosticDryRunSample() {
  return {
    generatedAt: ROUND3A1_GENERATED_AT,
    status: "diagnostic_failure_if_rejection_guard_exceeded",
    sourceManifest: "pipeline/manifests/round-3a1-approved-source-images.json",
    targetSampleSize: 0,
    actualSampleSize: 0,
    warningSampleCount: 0,
    samples: [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound3A1SourceQa().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
