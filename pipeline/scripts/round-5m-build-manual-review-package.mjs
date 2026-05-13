#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const ROUND_5L_COMMIT = "fadf96b1b55976f606dc5d08229f41d543e4bfd1";
const REVIEW_ROOT = "pipeline/review/round-5m/manual-review-contact-sheets";

const INPUTS = {
  manualReview: "pipeline/manifests/round-5l-manual-review-filename-items.json",
  finalMap: "pipeline/manifests/round-5l-final-svg-webp-object-key-map.json",
  proposals: "pipeline/manifests/round-5l-clean-object-key-proposals.json",
  collisions: "pipeline/manifests/round-5l-clean-object-key-collisions.json",
  manualReviewReport: "pipeline/reports/round-5l-manual-review-filename-items.md",
  titleOverrides: "src/generated/coloring/title-overrides.json",
  items: "src/generated/coloring/items.json",
  hubs: "src/generated/coloring/hubs.json",
  hubItems: "src/generated/coloring/hub-items.json",
  routes: "src/generated/coloring/routes.json",
};

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5m-project-context-check.json",
  workingTree: "pipeline/manifests/round-5m-working-tree-audit.json",
  reviewInput: "pipeline/manifests/round-5m-review-input-audit.json",
  groups: "pipeline/manifests/round-5m-manual-review-groups.json",
  contactSheets: "pipeline/manifests/round-5m-contact-sheet-results.json",
  safeAuto: "pipeline/manifests/round-5m-safe-auto-approval-candidates.json",
  mustReview: "pipeline/manifests/round-5m-must-review-candidates.json",
  ownerTemplate: "pipeline/manifests/round-5m-owner-decision-template.json",
  readinessGate: "pipeline/manifests/round-5m-round-5n-readiness-gate.json",
  futureDependency: "pipeline/manifests/round-5m-future-upload-review-dependency.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5m-project-context-check.md",
  workingTree: "pipeline/reports/round-5m-working-tree-audit.md",
  reviewInput: "pipeline/reports/round-5m-review-input-audit.md",
  groups: "pipeline/reports/round-5m-manual-review-groups.md",
  csv: "pipeline/reports/round-5m-manual-review-items.csv",
  owner: "pipeline/reports/round-5m-manual-review-owner-report.md",
  contactSheets: "pipeline/reports/round-5m-contact-sheet-report.md",
  safeAuto: "pipeline/reports/round-5m-safe-auto-approval-candidates.md",
  mustReview: "pipeline/reports/round-5m-must-review-candidates.md",
  ownerTemplate: "pipeline/reports/round-5m-owner-decision-template.md",
  readinessGate: "pipeline/reports/round-5m-round-5n-readiness-gate.md",
  futureDependency: "pipeline/reports/round-5m-future-upload-review-dependency.md",
};

const GROUP_KEYS = [
  "category_mismatch",
  "spelling_issue",
  "ai_export_name",
  "failed_name",
  "timestamp_name",
  "generic_name",
  "duplicate_tokens",
  "vague_subject",
  "low_confidence_subject",
  "collision_risk",
  "manual_review_required",
  "other",
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const data = await loadData();
  const context = await buildProjectContext();
  const workingTree = buildWorkingTreeAudit();
  const reviewInput = await buildReviewInputAudit(data);
  const groups = buildManualReviewGroups(data);
  const csv = buildOwnerCsv(data.records);
  const safeAuto = buildSafeAutoApprovalCandidates(data.records);
  const mustReview = buildMustReviewCandidates(data.records, safeAuto.records);
  const contactSheets = await buildContactSheets(data.records);
  const ownerTemplate = buildOwnerDecisionTemplate();
  const readinessGate = buildReadinessGate(data, safeAuto, mustReview);
  const futureDependency = buildFutureUploadReviewDependency(data, safeAuto, mustReview);

  await writeJson(OUTPUTS.projectContext, context);
  await writeText(REPORTS.projectContext, renderProjectContextReport(context));
  await writeJson(OUTPUTS.workingTree, workingTree);
  await writeText(REPORTS.workingTree, renderWorkingTreeReport(workingTree));
  await writeJson(OUTPUTS.reviewInput, reviewInput);
  await writeText(REPORTS.reviewInput, renderReviewInputReport(reviewInput));
  await writeJson(OUTPUTS.groups, groups);
  await writeText(REPORTS.groups, renderGroupsReport(groups));
  await writeText(REPORTS.csv, csv);
  await writeText(REPORTS.owner, renderOwnerReport(data.records, groups, safeAuto, mustReview, contactSheets));
  await writeJson(OUTPUTS.contactSheets, contactSheets);
  await writeText(REPORTS.contactSheets, renderContactSheetReport(contactSheets));
  await writeJson(OUTPUTS.safeAuto, safeAuto);
  await writeText(REPORTS.safeAuto, renderSafeAutoReport(safeAuto));
  await writeJson(OUTPUTS.mustReview, mustReview);
  await writeText(REPORTS.mustReview, renderMustReviewReport(mustReview));
  await writeJson(OUTPUTS.ownerTemplate, ownerTemplate);
  await writeText(REPORTS.ownerTemplate, renderOwnerTemplateReport(ownerTemplate));
  await writeJson(OUTPUTS.readinessGate, readinessGate);
  await writeText(REPORTS.readinessGate, renderReadinessGateReport(readinessGate));
  await writeJson(OUTPUTS.futureDependency, futureDependency);
  await writeText(REPORTS.futureDependency, renderFutureDependencyReport(futureDependency));

  console.log(JSON.stringify({
    runId: "round-5m-manual-review-package",
    manualReviewRecords: data.records.length,
    safeAutoApprovalCandidates: safeAuto.summary.totalSafeAutoApprovalCandidates,
    mustReviewCandidates: mustReview.summary.totalMustReviewCandidates,
    contactSheetGroups: contactSheets.summary.contactSheetGroupsCreated,
    readyForRound5N: readinessGate.ready_to_generate_clean_full_upload_bundle,
  }, null, 2));
}

async function loadData() {
  const manualReviewRaw = await readText(INPUTS.manualReview);
  const finalMapRaw = await readText(INPUTS.finalMap);
  const manualReview = JSON.parse(manualReviewRaw);
  const finalMap = JSON.parse(finalMapRaw);
  const proposals = await readJson(INPUTS.proposals);
  const collisions = await readJson(INPUTS.collisions);
  const titleOverrides = existsSync(path.join(REPO_ROOT, INPUTS.titleOverrides)) ? await readJson(INPUTS.titleOverrides) : { overrides: [] };
  const items = await readJson(INPUTS.items);
  const hubs = await readJson(INPUTS.hubs);
  const hubItems = await readJson(INPUTS.hubItems);
  const routes = await readJson(INPUTS.routes);
  const manualReportText = await readText(INPUTS.manualReviewReport);
  const proposalByAssetId = new Map((proposals.records || []).map((record) => [record.assetId, record]));
  const finalByAssetId = new Map((finalMap.records || []).map((record) => [record.assetId, record]));
  const itemByAssetId = new Map((items.items || []).map((record) => [record.assetId, record]));
  const enrichedRecords = (manualReview.records || []).map((record) => enrichManualRecord(record, {
    proposal: proposalByAssetId.get(record.assetId),
    final: finalByAssetId.get(record.assetId),
    item: itemByAssetId.get(record.assetId),
  }));

  return {
    manualReviewRaw,
    finalMapRaw,
    manualReview,
    finalMap,
    proposals,
    collisions,
    titleOverrides,
    items,
    hubs,
    hubItems,
    routes,
    manualReportText,
    records: enrichedRecords,
  };
}

function enrichManualRecord(record, lookups) {
  const proposal = lookups.proposal || {};
  const final = lookups.final || {};
  const item = lookups.item || {};
  const category = proposal.currentCategory || final.category || item.categorySlug || categoryFromPath(record.currentSvgRelativePath);
  const currentFilename = path.basename(record.currentSvgRelativePath || "");
  const reasonCodes = (record.detectedFilenameIssues || []).map((issue) => issue.code);
  return {
    ...record,
    assetId: record.assetId,
    category,
    currentFilename,
    currentSvgPath: record.currentSvgRelativePath,
    currentWebpPath: record.currentWebpRelativePath,
    displayTitle: record.currentDisplayTitle || final.displayTitle || item.title || "",
    proposedCleanStem: record.proposedCleanStem,
    proposedSvgObjectKey: record.proposedSvgObjectKey,
    proposedWebpObjectKey: record.proposedWebpObjectKey,
    reasonCodes,
    issueDetails: record.detectedFilenameIssues || [],
    likelyHubPages: record.likelyHubPages || [],
    localPreviewPath: record.localPreviewPath || previewFromSvg(record.currentSvgRelativePath),
    finalStatus: final.status || "",
    currentNameCanBeKept: proposal.currentNameCanBeKept === true,
    titleOverride: proposal.titleOverride || null,
  };
}

async function buildProjectContext() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const repoName = path.basename(repoRoot);
  const branch = git(["branch", "--show-current"]).trim();
  const sourceText = await readProjectText(["app", "src", "package.json", "next.config.mjs"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const nextConfig = await readText("next.config.mjs");
  const round5lCommitExists = commandSucceeds("git", ["cat-file", "-e", `${ROUND_5L_COMMIT}^{commit}`]);
  const imageSitemapPresent = /image-sitemap|ImageSitemap/i.test(sourceText);
  const openGraphImageGenerationPresent = /opengraph-image|twitter-image|ImageResponse/i.test(sourceText);
  const liveAdSenseCodePresent = /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText);
  const wrongContextIndicatorsPresent = /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText);

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      round5lCommitExists,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      r2UploadSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "svg")),
      r2UploadWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: gitStatusFor("images").trim() === "",
      ilovesvgStatusClean: gitStatusFor("ilovesvg").trim() === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}`),
      publicDownloadsPngJpgWebp: /label: "PNG"/.test(downloadMenu) && /label: "JPG"/.test(downloadMenu) && /label: "WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /Advertisement/.test(adsConfig),
      liveAdSenseCodePresent,
      imageSitemapPresent,
      openGraphImageGenerationPresent,
      wrongContextIndicatorsPresent,
    },
    notes: [
      "Round 5M is review packaging only.",
      "The full pipeline/r2-upload/coloring-pages/webp folder may remain absent because the final clean SVG plus WebP upload bundle is deferred.",
    ],
  };
}

function buildWorkingTreeAudit() {
  const statusShort = git(["status", "--short"]);
  const diffStat = git(["diff", "--stat"]);
  const diffNameOnly = git(["diff", "--name-only"]);
  const entries = statusShort.split(/\r?\n/).filter(Boolean).map((raw) => {
    const pathName = raw.slice(3).trim();
    return {
      raw,
      path: pathName,
      classification: classifyWorkingTreePath(pathName),
    };
  });
  const riskyUnrelatedDrift = entries.filter((entry) => entry.classification === "risky_unrelated_drift");
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-working-tree-audit",
    commands: {
      statusShort: "git status --short",
      diffStat: "git diff --stat",
      diffNameOnly: "git diff --name-only",
    },
    summary: {
      statusEntryCount: entries.length,
      generatedValidationDriftCount: entries.filter((entry) => entry.classification === "generated_validation_drift").length,
      localArtifactDriftCount: entries.filter((entry) => entry.classification === "local_artifact_drift").length,
      intendedRound5MDriftCount: entries.filter((entry) => entry.classification === "intended_round_5m_artifact").length,
      riskyUnrelatedDriftCount: riskyUnrelatedDrift.length,
      safeToProceed: riskyUnrelatedDrift.length === 0,
      note: "Only intended Round 5M artifacts should be committed.",
    },
    statusShort,
    diffStat,
    diffNameOnly,
    entries,
    riskyUnrelatedDrift,
  };
}

async function buildReviewInputAudit(data) {
  const generatedItems = await readText("src/generated/coloring/items.json");
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-review-input-audit",
    inputs: INPUTS,
    summary: {
      manualReviewCount: data.records.length,
      expectedManualReviewCount: 205,
      manualReviewCountMatchesExpected: data.records.length === 205,
      finalObjectKeyMapRecords: data.finalMap.records.length,
      cleanObjectKeyProposalRecords: data.proposals.records.length,
      unresolvedCollisions: Number(data.collisions.summary.finalDuplicateSvgObjectKeys || 0) + Number(data.collisions.summary.finalDuplicateWebpObjectKeys || 0),
      pngExcluded: data.finalMap.summary.pngExcluded === true,
      thumbsExcluded: data.finalMap.summary.thumbsExcluded === true,
      appRuntimePathsUsingFutureCleanKeys: /futureSvgObjectKey|futureWebpObjectKey|round-5l-final-svg-webp-object-key-map/.test(generatedItems),
      finalObjectKeyMapSha256: sha256(data.finalMapRaw),
      manualReviewInputSha256: sha256(data.manualReviewRaw),
      titleOverridesPresent: existsSync(path.join(REPO_ROOT, INPUTS.titleOverrides)),
      hubRoutesPresent: Array.isArray(data.routes.routes),
      noRuntimePathSwitch: true,
    },
  };
}

function buildManualReviewGroups(data) {
  const groups = Object.fromEntries(GROUP_KEYS.map((key) => [key, {
    count: 0,
    examples: [],
    likelyFixType: likelyFixTypeForGroup(key),
    ownerReviewRequired: true,
    conservativeAutoApprovalPossible: false,
    excludeFromFullUploadUntilReviewed: key !== "spelling_issue" && key !== "duplicate_tokens",
  }]));

  for (const record of data.records) {
    const matched = new Set(record.reasonCodes.filter((code) => GROUP_KEYS.includes(code)));
    if (record.confidence === "low" || record.confidence === "manual_review") matched.add("low_confidence_subject");
    if (matched.size === 0) matched.add("other");
    for (const key of matched) addGroupExample(groups[key], record);
  }

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-manual-review-groups",
    summary: {
      totalManualReviewRecords: data.records.length,
      groupCount: GROUP_KEYS.length,
      groupsWithItems: Object.values(groups).filter((group) => group.count > 0).length,
    },
    groups,
  };
}

function buildOwnerCsv(records) {
  const header = [
    "assetId",
    "category",
    "currentFilename",
    "currentSvgPath",
    "currentWebpPath",
    "displayTitle",
    "proposedCleanStem",
    "proposedSvgObjectKey",
    "proposedWebpObjectKey",
    "reasonCodes",
    "confidence",
    "likelyHubPages",
    "ownerDecision",
    "ownerNotes",
  ];
  const rows = records.map((record) => [
    record.assetId,
    record.category,
    record.currentFilename,
    record.currentSvgPath,
    record.currentWebpPath,
    record.displayTitle,
    record.proposedCleanStem,
    record.proposedSvgObjectKey,
    record.proposedWebpObjectKey,
    record.reasonCodes.join("|"),
    record.confidence,
    record.likelyHubPages.join("|"),
    "",
    "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function buildSafeAutoApprovalCandidates(records) {
  const safeRecords = records.filter(isSafeAutoApprovalCandidate).map(candidateSummary);
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-safe-auto-approval-candidates",
    summary: {
      totalManualReviewRecords: records.length,
      totalSafeAutoApprovalCandidates: safeRecords.length,
      ownerApproved: false,
      proposedAutoApproveOnly: true,
      finalMapMutated: false,
      criteria: [
        "minor duplicate token or obvious spelling correction",
        "strong title, category, or hub support",
        "no category mismatch",
        "no vague subject issue",
        "no AI, export, failure, or timestamp term remains",
        "no collision risk",
      ],
    },
    records: safeRecords,
  };
}

function buildMustReviewCandidates(records, safeRecords) {
  const safeIds = new Set(safeRecords.map((record) => record.assetId));
  const mustRecords = records.filter((record) => !safeIds.has(record.assetId)).map((record) => ({
    ...candidateSummary(record),
    mustReviewReason: mustReviewReason(record),
  }));
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-must-review-candidates",
    summary: {
      totalManualReviewRecords: records.length,
      totalMustReviewCandidates: mustRecords.length,
      ownerDecisionRequired: mustRecords.length > 0,
      excludeFromFirstUploadUntilReviewed: true,
    },
    records: mustRecords,
  };
}

async function buildContactSheets(records) {
  const groups = [
    ["category_mismatch", records.filter((record) => record.reasonCodes.includes("category_mismatch"))],
    ["spelling_issue", records.filter((record) => record.reasonCodes.includes("spelling_issue"))],
    ["ai_export_name_failed_timestamp", records.filter((record) => ["ai_export_name", "failed_name", "timestamp_name"].some((code) => record.reasonCodes.includes(code)))],
    ["generic_vague", records.filter((record) => ["generic_name", "vague_subject"].some((code) => record.reasonCodes.includes(code)))],
    ["duplicate_tokens", records.filter((record) => record.reasonCodes.includes("duplicate_tokens"))],
    ["mixed_low_confidence", records.filter((record) => record.confidence === "low" || record.confidence === "manual_review")],
    ["random_sample", deterministicSample(records, 36)],
  ];

  await mkdir(path.join(REPO_ROOT, REVIEW_ROOT), { recursive: true });
  const contactSheets = [];
  for (const [group, groupRecords] of groups) {
    const filePath = path.join(REVIEW_ROOT, `${group}.html`).replace(/\\/g, "/");
    const selected = group === "mixed_low_confidence" ? groupRecords.slice(0, 80) : groupRecords;
    await writeText(filePath, renderContactSheetHtml(group, selected));
    contactSheets.push({
      group,
      path: filePath,
      itemCount: groupRecords.length,
      renderedTileCount: selected.length,
      previewSourcePreference: "webp if present, otherwise png fallback",
      committed: false,
    });
  }

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-contact-sheet-results",
    summary: {
      contactSheetRoot: REVIEW_ROOT,
      reviewArtifactRootIgnored: gitCheckIgnore(`${REVIEW_ROOT}/category_mismatch.html`),
      contactSheetGroupsCreated: contactSheets.length,
      contactSheetsCommitted: false,
      usesWebpWhenAvailable: true,
      usesPngFallback: true,
    },
    contactSheets,
  };
}

function buildOwnerDecisionTemplate() {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-owner-decision-template",
    instructions: "Copy this template into a future owner decision manifest and fill itemDecisions before Round 5N generates a clean upload bundle.",
    approveAllHighConfidence: false,
    approveSafeAutoCandidates: false,
    excludeManualReviewFromFirstUpload: false,
    itemDecisions: [],
    itemDecisionShape: {
      assetId: "",
      decision: "approve | revise | exclude | defer",
      revisedCleanStem: "",
      notes: "",
    },
    allowedDecisions: ["approve", "revise", "exclude", "defer"],
  };
}

function buildReadinessGate(data, safeAuto, mustReview) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-round-5n-readiness-gate",
    ready_to_generate_clean_full_upload_bundle: false,
    totalRecords: data.finalMap.summary.totalRecords,
    readyRecords: data.finalMap.summary.totalReadyRecords,
    manualReviewRecords: data.records.length,
    safeAutoApprovalCandidates: safeAuto.summary.totalSafeAutoApprovalCandidates,
    mustReviewCandidates: mustReview.summary.totalMustReviewCandidates,
    unresolvedCollisions: Number(data.collisions.summary.finalDuplicateSvgObjectKeys || 0) + Number(data.collisions.summary.finalDuplicateWebpObjectKeys || 0),
    ownerDecisionFileRequired: true,
    canProceedIfManualReviewExcluded: true,
    recommendedNextAction: "Owner should review the CSV, owner report, and contact sheets, then provide an explicit decision manifest before Round 5N.",
    blockers: ["Owner decision file is not present.", "Round 5M must not generate or upload the final full bundle."],
  };
}

function buildFutureUploadReviewDependency(data, safeAuto, mustReview) {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5m-future-upload-review-dependency",
    summary: {
      finalUploadBundleDependsOnOwnerDecision: true,
      manualReviewRecords: data.records.length,
      safeAutoApprovalCandidates: safeAuto.summary.totalSafeAutoApprovalCandidates,
      mustReviewCandidates: mustReview.summary.totalMustReviewCandidates,
      fullUploadBundleCreated: false,
      uploadPerformed: false,
      runtimePathsChanged: false,
    },
    options: [
      {
        option: "A",
        label: "approve all proposed keys",
        risk: "Fastest path, but owner accepts every manual-review proposal as-is.",
        round5nAction: "Apply approvals, generate clean SVG plus WebP bundle, then verify before switching runtime paths.",
      },
      {
        option: "B",
        label: "approve only safe candidates and defer must-review items",
        risk: "Conservative, but first upload omits some assets and gallery coverage may be partial until later.",
        round5nAction: "Generate a clean bundle for approved items only if the owner explicitly approves exclusion.",
      },
      {
        option: "C",
        label: "revise selected keys",
        risk: "Best public URL quality, but requires exact owner-provided replacements and collision checks.",
        round5nAction: "Validate revised clean stems, regenerate map, then bundle approved records.",
      },
      {
        option: "D",
        label: "exclude manual-review items from first upload",
        risk: "Avoids uncertain filenames, but 205 assets are deferred from the first full public upload.",
        round5nAction: "Bundle 6,352 ready records only after explicit owner approval.",
      },
    ],
  };
}

function isSafeAutoApprovalCandidate(record) {
  const codes = new Set(record.reasonCodes);
  const minor = codes.has("duplicate_tokens") || codes.has("spelling_issue");
  return minor
    && !codes.has("category_mismatch")
    && !codes.has("vague_subject")
    && !codes.has("ai_export_name")
    && !codes.has("failed_name")
    && !codes.has("timestamp_name")
    && !codes.has("generic_name")
    && !codes.has("collision_risk")
    && !/chatgpt|openai|failed|generated|image|export|timestamp|untitled|temp|draft/i.test(record.proposedCleanStem);
}

function mustReviewReason(record) {
  const codes = new Set(record.reasonCodes);
  if (codes.has("category_mismatch")) return "Category mismatch needs owner judgment before publishing the object key.";
  if (codes.has("ai_export_name") || codes.has("failed_name") || codes.has("timestamp_name")) return "AI, failed, or timestamp source name was detected and subject inference needs review.";
  if (codes.has("vague_subject") || codes.has("generic_name")) return "Subject is vague or generic.";
  if (codes.has("spelling_issue")) return "Spelling correction appears with another review risk.";
  if (codes.has("duplicate_tokens")) return "Duplicate token cleanup appears with another review risk.";
  return "Manual review was required by Round 5L.";
}

function candidateSummary(record) {
  return {
    assetId: record.assetId,
    category: record.category,
    currentFilename: record.currentFilename,
    displayTitle: record.displayTitle,
    proposedCleanStem: record.proposedCleanStem,
    proposedSvgObjectKey: record.proposedSvgObjectKey,
    proposedWebpObjectKey: record.proposedWebpObjectKey,
    reasonCodes: record.reasonCodes,
    confidence: record.confidence,
    likelyHubPages: record.likelyHubPages,
  };
}

function addGroupExample(group, record) {
  group.count += 1;
  if (group.examples.length < 12) {
    group.examples.push(candidateSummary(record));
  }
}

function likelyFixTypeForGroup(key) {
  const map = {
    category_mismatch: "Confirm the category folder and public object key should stay as proposed, or revise/exclude.",
    spelling_issue: "Confirm the corrected spelling does not change the subject.",
    ai_export_name: "Confirm the inferred subject because the original name exposes AI/export wording.",
    failed_name: "Confirm the asset should be published at all because the original name used failed/failure wording.",
    timestamp_name: "Replace timestamp-driven naming with a real subject name.",
    generic_name: "Confirm or improve the subject-specific clean key.",
    duplicate_tokens: "Approve duplicate-token cleanup only when the subject remains clear.",
    vague_subject: "Owner must identify or approve the conservative subject.",
    low_confidence_subject: "Owner must approve, revise, exclude, or defer.",
    collision_risk: "Confirm the resolved suffix strategy.",
    manual_review_required: "Owner decision required before final upload.",
    other: "Inspect individually.",
  };
  return map[key] || "Inspect individually.";
}

function renderContactSheetHtml(group, records) {
  const cards = records.map((record) => {
    const preferred = pickPreviewPath(record);
    const src = path.relative(path.join(REPO_ROOT, REVIEW_ROOT), path.join(REPO_ROOT, preferred)).replace(/\\/g, "/");
    return `<article class="tile">
      <img src="${htmlEscape(src)}" alt="${htmlEscape(record.displayTitle)} preview" loading="lazy">
      <div class="meta"><strong>${htmlEscape(record.assetId)}</strong></div>
      <div class="meta">Current: ${htmlEscape(record.currentFilename)}</div>
      <div class="meta">Proposed: ${htmlEscape(record.proposedCleanStem)}</div>
      <div class="meta">Reason: ${htmlEscape(record.reasonCodes.join(", "))}</div>
      <div class="meta">Confidence: ${htmlEscape(record.confidence)}</div>
    </article>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Round 5M ${htmlEscape(group)} contact sheet</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #171717; background: #f7f7f7; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
    .tile { background: white; border: 1px solid #d7d7d7; padding: 10px; break-inside: avoid; }
    img { width: 100%; height: 190px; object-fit: contain; background: white; }
    .meta { font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; margin-top: 6px; }
  </style>
</head>
<body>
  <h1>Round 5M ${htmlEscape(group)} contact sheet</h1>
  <p>${records.length} rendered review items. These files are local ignored review artifacts and are not committed.</p>
  <div class="grid">${cards}</div>
</body>
</html>
`;
}

function pickPreviewPath(record) {
  const webpPath = record.currentWebpPath;
  if (webpPath && existsSync(path.join(REPO_ROOT, webpPath))) return webpPath;
  if (record.localPreviewPath && existsSync(path.join(REPO_ROOT, record.localPreviewPath))) return record.localPreviewPath;
  return previewFromSvg(record.currentSvgPath);
}

function previewFromSvg(svgPath) {
  return String(svgPath || "")
    .replace("pipeline/r2-upload/coloring-pages/svg/", "pipeline/r2-upload/coloring-pages/png/")
    .replace(/\.svg$/i, ".png");
}

function deterministicSample(records, count) {
  return [...records]
    .map((record) => ({ record, hash: sha256(record.assetId) }))
    .sort((a, b) => a.hash.localeCompare(b.hash))
    .slice(0, count)
    .map((entry) => entry.record);
}

function renderProjectContextReport(payload) {
  return `# Round 5M Project Context Check

- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- Round 5L commit exists: ${payload.summary.round5lCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- SVG upload folder present: ${payload.summary.r2UploadSvgExists}
- WebP full upload folder present: ${payload.summary.r2UploadWebpExists}
- Public media copied into public/: ${payload.summary.publicContainsGeneratedProductionMedia}
- Wrong task indicators present: ${payload.summary.wrongContextIndicatorsPresent}

Note: the full WebP folder may remain absent because Round 5M does not create the final upload bundle.
`;
}

function renderWorkingTreeReport(payload) {
  return `# Round 5M Working Tree Audit

- Status entries: ${payload.summary.statusEntryCount}
- Intended Round 5M drift: ${payload.summary.intendedRound5MDriftCount}
- Generated validation drift: ${payload.summary.generatedValidationDriftCount}
- Local artifact drift: ${payload.summary.localArtifactDriftCount}
- Risky unrelated drift: ${payload.summary.riskyUnrelatedDriftCount}
- Safe to proceed: ${payload.summary.safeToProceed}

## Entries
${payload.entries.map((entry) => `- ${entry.raw}: ${entry.classification}`).join("\n") || "- none"}
`;
}

function renderReviewInputReport(payload) {
  return `# Round 5M Review Input Audit

- Manual-review records: ${payload.summary.manualReviewCount}
- Expected manual-review records: ${payload.summary.expectedManualReviewCount}
- Final object-key map records: ${payload.summary.finalObjectKeyMapRecords}
- Clean proposal records: ${payload.summary.cleanObjectKeyProposalRecords}
- Unresolved collisions: ${payload.summary.unresolvedCollisions}
- PNG excluded: ${payload.summary.pngExcluded}
- Thumbs excluded: ${payload.summary.thumbsExcluded}
- App runtime paths using future keys: ${payload.summary.appRuntimePathsUsingFutureCleanKeys}
- Final object-key map SHA-256: ${payload.summary.finalObjectKeyMapSha256}
`;
}

function renderGroupsReport(payload) {
  return `# Round 5M Manual Review Groups

- Manual-review records: ${payload.summary.totalManualReviewRecords}
- Groups with items: ${payload.summary.groupsWithItems}

${Object.entries(payload.groups).map(([key, group]) => `## ${key}

- Count: ${group.count}
- Likely fix type: ${group.likelyFixType}
- Owner review required: ${group.ownerReviewRequired}
- Conservative auto-approval possible: ${group.conservativeAutoApprovalPossible}
- Exclude until reviewed: ${group.excludeFromFullUploadUntilReviewed}

${group.examples.map((record) => `- ${record.assetId}: ${record.currentFilename} -> ${record.proposedCleanStem}`).join("\n") || "- none"}
`).join("\n")}
`;
}

function renderOwnerReport(records, groups, safeAuto, mustReview, contactSheets) {
  const priority = [...records].sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, 40);
  return `# Round 5M Manual Review Filename Items

Round 5M packages ${records.length} manual-review filename/object-key items from Round 5L for owner review before any clean full upload bundle is generated.

No files were renamed. No generated media was renamed. No upload happened. Runtime app paths were not changed.

## Summary

- Manual-review items: ${records.length}
- Safe auto-approval candidates: ${safeAuto.summary.totalSafeAutoApprovalCandidates}
- Must-review candidates: ${mustReview.summary.totalMustReviewCandidates}
- Contact sheet root: ${contactSheets.summary.contactSheetRoot}
- Owner CSV: ${REPORTS.csv}
- Decision template: ${OUTPUTS.ownerTemplate}

## Owner Options

- Approve proposed key.
- Revise proposed key.
- Use conservative fallback key.
- Exclude item from first full upload.

## Groups

${Object.entries(groups.groups).filter(([, group]) => group.count > 0).map(([key, group]) => `- ${key}: ${group.count}`).join("\n")}

## High Priority Items

${priority.map((record) => `- ${record.assetId}: ${record.currentFilename} -> ${record.proposedCleanStem} (${record.reasonCodes.join(", ")})`).join("\n")}

## Before And After Examples

${records.slice(0, 20).map((record) => `- ${record.currentSvgPath} -> ${record.proposedSvgObjectKey}`).join("\n")}
`;
}

function renderContactSheetReport(payload) {
  return `# Round 5M Contact Sheet Report

- Contact sheet root: ${payload.summary.contactSheetRoot}
- Ignored by Git: ${payload.summary.reviewArtifactRootIgnored}
- Groups created: ${payload.summary.contactSheetGroupsCreated}
- Committed: ${payload.summary.contactSheetsCommitted}
- Preview source: WebP when available, otherwise PNG fallback.

${payload.contactSheets.map((sheet) => `- ${sheet.group}: ${sheet.path} (${sheet.renderedTileCount}/${sheet.itemCount} rendered)`).join("\n")}
`;
}

function renderSafeAutoReport(payload) {
  return `# Round 5M Safe Auto-Approval Candidates

- Total candidates: ${payload.summary.totalSafeAutoApprovalCandidates}
- Owner approved: ${payload.summary.ownerApproved}
- Final map mutated: ${payload.summary.finalMapMutated}

No candidates are marked owner-approved in this round.

${payload.records.map((record) => `- ${record.assetId}: ${record.currentFilename} -> ${record.proposedCleanStem}`).join("\n") || "- none"}
`;
}

function renderMustReviewReport(payload) {
  return `# Round 5M Must-Review Candidates

- Total must-review candidates: ${payload.summary.totalMustReviewCandidates}
- Owner decision required: ${payload.summary.ownerDecisionRequired}
- Exclude from first upload until reviewed: ${payload.summary.excludeFromFirstUploadUntilReviewed}

${payload.records.slice(0, 100).map((record) => `- ${record.assetId}: ${record.currentFilename} -> ${record.proposedCleanStem}. ${record.mustReviewReason}`).join("\n")}
`;
}

function renderOwnerTemplateReport(payload) {
  return `# Round 5M Owner Decision Template

Use ${OUTPUTS.ownerTemplate} as the shape for the owner decision file in Round 5N.

- approveAllHighConfidence: ${payload.approveAllHighConfidence}
- approveSafeAutoCandidates: ${payload.approveSafeAutoCandidates}
- excludeManualReviewFromFirstUpload: ${payload.excludeManualReviewFromFirstUpload}
- item decisions: ${payload.itemDecisions.length}

Allowed item decisions: ${payload.allowedDecisions.join(", ")}.
`;
}

function renderReadinessGateReport(payload) {
  return `# Round 5M Round 5N Readiness Gate

- Ready to generate clean full upload bundle: ${payload.ready_to_generate_clean_full_upload_bundle}
- Total records: ${payload.totalRecords}
- Ready records: ${payload.readyRecords}
- Manual-review records: ${payload.manualReviewRecords}
- Safe auto-approval candidates: ${payload.safeAutoApprovalCandidates}
- Must-review candidates: ${payload.mustReviewCandidates}
- Unresolved collisions: ${payload.unresolvedCollisions}
- Owner decision file required: ${payload.ownerDecisionFileRequired}
- Can proceed if manual-review items are excluded: ${payload.canProceedIfManualReviewExcluded}

Recommended next action: ${payload.recommendedNextAction}
`;
}

function renderFutureDependencyReport(payload) {
  return `# Round 5M Future Upload Review Dependency

- Final upload bundle depends on owner decision: ${payload.summary.finalUploadBundleDependsOnOwnerDecision}
- Manual-review records: ${payload.summary.manualReviewRecords}
- Safe auto-approval candidates: ${payload.summary.safeAutoApprovalCandidates}
- Must-review candidates: ${payload.summary.mustReviewCandidates}
- Full upload bundle created: ${payload.summary.fullUploadBundleCreated}
- Upload performed: ${payload.summary.uploadPerformed}
- Runtime paths changed: ${payload.summary.runtimePathsChanged}

${payload.options.map((option) => `## Option ${option.option}: ${option.label}

- Risk: ${option.risk}
- Round 5N action: ${option.round5nAction}
`).join("\n")}
`;
}

function priorityScore(record) {
  const codes = new Set(record.reasonCodes);
  let score = 0;
  if (codes.has("failed_name")) score += 100;
  if (codes.has("ai_export_name")) score += 90;
  if (codes.has("timestamp_name")) score += 80;
  if (codes.has("generic_name")) score += 70;
  if (codes.has("vague_subject")) score += 60;
  if (codes.has("category_mismatch")) score += 30;
  if (codes.has("spelling_issue")) score += 20;
  return score;
}

function classifyWorkingTreePath(pathName) {
  if (!pathName) return "unknown";
  if (pathName === "AGENTS.md" || pathName === "package.json") return "intended_round_5m_artifact";
  if (/^pipeline\/(?:scripts|tests|manifests|reports)\/round-5m/.test(pathName)) return "intended_round_5m_artifact";
  if (/^pipeline\/review\//.test(pathName)) return "local_artifact_drift";
  if (/^pipeline\/manifests\/round-4|^pipeline\/reports\/round-4|^src\/generated\/coloring\//.test(pathName)) return "generated_validation_drift";
  return "risky_unrelated_drift";
}

function categoryFromPath(filePath) {
  const match = /coloring-pages\/svg\/([^/]+)\//.exec(String(filePath || "").replace(/\\/g, "/"));
  return match ? match[1] : "";
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function commandSucceeds(command, args) {
  try {
    execFileSync(command, args, { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitStatusFor(relativePath) {
  return git(["status", "--short", "--", relativePath]);
}

function gitCheckIgnore(relativePath) {
  return commandSucceeds("git", ["check-ignore", relativePath]);
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const normalizedValue = String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{2,}$/g, "\n");
  await writeFile(absolutePath, normalizedValue, "utf8");
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    if (existsSync(path.join(REPO_ROOT, relativeRoot)) && path.extname(relativeRoot)) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (file.replace(/\\/g, "/").startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
