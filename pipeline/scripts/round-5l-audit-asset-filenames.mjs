#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const RUN_ID = "round-5l-asset-filename-audit";
const GENERATED_AT = new Date().toISOString();

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5l-project-context-check.json",
  workingTreeAudit: "pipeline/manifests/round-5l-working-tree-audit.json",
  filenameAudit: "pipeline/manifests/round-5l-current-asset-filename-audit.json",
  taxonomy: "pipeline/manifests/round-5l-filename-cleanup-taxonomy.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5l-project-context-check.md",
  workingTreeAudit: "pipeline/reports/round-5l-working-tree-audit.md",
  filenameAudit: "pipeline/reports/round-5l-current-asset-filename-audit.md",
  taxonomy: "pipeline/reports/round-5l-filename-cleanup-taxonomy.md",
};

const BAD_PATTERNS = [
  { code: "ai_export_name", pattern: /\b(?:chatgpt|chat-gpt|gpt|openai|dalle|dall-e|ai-generated)\b/i },
  { code: "failed_name", pattern: /\b(?:failed|failure|retry)\b/i },
  { code: "generic_name", pattern: /\b(?:image|export|download|screenshot|untitled|copy|final-final|temp|draft)\b/i },
  { code: "timestamp_name", pattern: /\b(?:20\d{2}[-_ ]?\d{1,2}[-_ ]?\d{1,2}|\d{4}[-_ ]?\d{2}[-_ ]?\d{2}|\d{1,2}[-_ ]?\d{1,2}[-_ ]?20\d{2}|\d{1,2}[-_ ]?\d{1,2}[-_ ]?\d{1,2}[-_ ]?(?:am|pm))\b/i },
  { code: "internal_pipeline_term", pattern: /\b(?:pipeline|round|bakeoff|trace|vectorized|preview-output|source-image|r2-upload|object-key|png|jpg|jpeg|webp|svg)\b/i },
];

const SPELLING_ISSUES = [
  { token: "vehiacle", suggestion: "vehicle" },
  { token: "paintaings", suggestion: "paintings" },
  { token: "polarbear", suggestion: "polar-bear" },
  { token: "idoor", suggestion: "indoor" },
];

const GENERIC_TOKENS = new Set([
  "coloring",
  "page",
  "pages",
  "printable",
  "image",
  "picture",
  "design",
  "art",
  "sheet",
  "drawing",
]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const projectContext = await buildProjectContext();
  const workingTreeAudit = await buildWorkingTreeAudit();
  const filenameAudit = await buildFilenameAudit();
  const taxonomy = buildTaxonomy();

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.workingTreeAudit, workingTreeAudit);
  await writeText(REPORTS.workingTreeAudit, renderWorkingTreeReport(workingTreeAudit));
  await writeJson(OUTPUTS.filenameAudit, filenameAudit);
  await writeText(REPORTS.filenameAudit, renderFilenameAuditReport(filenameAudit));
  await writeJson(OUTPUTS.taxonomy, taxonomy);
  await writeText(REPORTS.taxonomy, renderTaxonomyReport(taxonomy));

  console.log(JSON.stringify({
    runId: RUN_ID,
    correctProject: projectContext.summary.correctRepository && projectContext.summary.branch === "version-4",
    svgFiles: filenameAudit.summary.totalSvgFiles,
    currentWebpFiles: filenameAudit.summary.totalCurrentWebpFiles,
    plannedWebpRecords: filenameAudit.summary.totalPlannedWebpRecords,
    plannedSvgWebpPairs: filenameAudit.summary.totalPlannedSvgWebpPairs,
    suspiciousFilenames: filenameAudit.summary.totalSuspiciousFilenames,
    blockers: filenameAudit.blockers,
  }, null, 2));
}

async function buildProjectContext() {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim();
  const repoName = path.basename(repoRoot);
  const branch = (await git(["branch", "--show-current"])).trim();
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src"]);
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      round5kCommitExists: await gitCommitExists("5914a94"),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || appFiles.some((file) => normalizePath(file).includes("/api/")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2UploadColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      r2UploadSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "svg")),
      r2UploadWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
      r2UploadPngExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "png")),
      r2UploadThumbsExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "thumbs")),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${downloadMenu}\n${browserDownloads}`),
      publicDownloadsPngJpgWebp: /label:\s*"PNG"/.test(downloadMenu) && /label:\s*"JPG"/.test(downloadMenu) && /label:\s*"WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /Advertisement/.test(sourceText) && !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(sourceText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      imageSitemapPresent: /image-sitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      wrongContextIndicatorsPresent: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(sourceText),
    },
    notes: [
      "pipeline/r2-upload/coloring-pages/webp is expected for a materialized full WebP upload folder, but Round 5L must not create it.",
      "The future clean WebP map uses Round 5B WebP manifests when the current full WebP media folder is absent.",
    ],
  };
}

async function buildWorkingTreeAudit() {
  const statusShort = await git(["status", "--short"]);
  const diffStat = await git(["diff", "--stat"]);
  const diffNameOnly = await git(["diff", "--name-only"]);
  const entries = statusShort.split(/\r?\n/).filter(Boolean).map((line) => {
    const filePath = line.slice(3).trim();
    return {
      raw: line,
      path: filePath,
      classification: classifyDrift(filePath),
    };
  });
  const risky = entries.filter((entry) => entry.classification === "risky_unrelated_drift");

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-working-tree-audit",
    commands: {
      statusShort: "git status --short",
      diffStat: "git diff --stat",
      diffNameOnly: "git diff --name-only",
    },
    summary: {
      statusEntryCount: entries.length,
      generatedValidationDriftCount: entries.filter((entry) => entry.classification === "generated_validation_drift").length,
      localArtifactDriftCount: entries.filter((entry) => entry.classification === "local_artifact_drift").length,
      intendedRound5LDriftCount: entries.filter((entry) => entry.classification === "intended_round_5l_artifact").length,
      riskyUnrelatedDriftCount: risky.length,
      safeToProceed: risky.length === 0,
      note: entries.length === 0 ? "Working tree was clean at audit generation." : "Only intended Round 5L artifacts or generated/local drift should be committed or ignored.",
    },
    statusShort,
    diffStat,
    diffNameOnly,
    entries,
    riskyUnrelatedDrift: risky,
  };
}

async function buildFilenameAudit() {
  const itemsJson = await readJson("src/generated/coloring/items.json");
  const webpJson = await readJson("pipeline/manifests/round-5b-webp-preview-assets.json");
  const titleOverrides = await readJson("src/generated/coloring/title-overrides.json");
  const hubItemsJson = await readJson("src/generated/coloring/hub-items.json");
  const hubsJson = await readJson("src/generated/coloring/hubs.json");
  const items = itemsJson.items || [];
  const webpItems = new Map((webpJson.items || []).map((item) => [item.assetId, item]));
  const overrideMap = new Map((titleOverrides.overrides || []).map((item) => [item.assetId, item]));
  const hubItems = new Map((hubItemsJson.items || []).map((item) => [item.assetId, item]));
  const hubById = new Map((hubsJson.hubs || []).map((hub) => [hub.hubId, hub]));
  const svgFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "svg"));
  const webpFiles = await listFilesIfExists(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp"));
  const svgSet = new Set(svgFiles.map((file) => toRepoPath(file)));
  const webpSet = new Set(webpFiles.map((file) => toRepoPath(file)));

  const records = [];
  for (const item of items) {
    const webp = webpItems.get(item.assetId) || null;
    const override = overrideMap.get(item.assetId) || null;
    const svgSubpath = item.assetSubpaths?.svg || "";
    const expectedWebpSubpath = webp?.generatedWebpSubpath || svgSubpath.replace(/^svg\//, "webp/").replace(/\.svg$/i, ".webp");
    const svgLocalPath = `pipeline/r2-upload/coloring-pages/${svgSubpath}`;
    const webpLocalPath = `pipeline/r2-upload/coloring-pages/${expectedWebpSubpath}`;
    const currentStem = basenameWithoutExt(svgSubpath);
    const webpStem = basenameWithoutExt(expectedWebpSubpath);
    const issues = detectFilenameIssues({
      stem: currentStem,
      category: item.categorySlug,
      title: override?.cleanTitle || item.title,
      filenameSlug: item.filenameSlug,
    });
    const hubMemberships = (hubItems.get(item.assetId)?.hubIds || []).map((hubId) => {
      const hub = hubById.get(hubId);
      return hub ? { hubId, slug: hub.slug, route: hub.route, title: hub.title } : { hubId, slug: "", route: "", title: "" };
    });

    records.push({
      assetId: item.assetId,
      category: item.categorySlug,
      displayTitle: item.title,
      titleOverride: override?.cleanTitle || null,
      hubMemberships,
      currentSvgRelativePath: svgLocalPath,
      currentWebpRelativePath: webpLocalPath,
      currentPngPreviewRelativePath: item.assetSubpaths?.pngPreview ? `pipeline/r2-upload/coloring-pages/${item.assetSubpaths.pngPreview}` : null,
      currentThumbnailRelativePath: item.assetSubpaths?.thumbnail ? `pipeline/r2-upload/coloring-pages/${item.assetSubpaths.thumbnail}` : null,
      currentFilenameStem: currentStem,
      currentWebpFilenameStem: webpStem,
      svgFileExists: svgSet.has(normalizePath(svgLocalPath)),
      webpFileExists: webpSet.has(normalizePath(webpLocalPath)),
      webpPlannedByRound5B: Boolean(webp),
      webpBytes: webp?.webpBytes || 0,
      filenameStemConsistentBetweenSvgAndWebp: currentStem === webpStem,
      categoryFolderConsistent: svgSubpath.startsWith(`svg/${item.categorySlug}/`) && expectedWebpSubpath.startsWith(`webp/${item.categorySlug}/`),
      issues,
      suspicious: issues.some((issue) => issue.code !== "safe_existing_name"),
    });
  }

  const reasonCounts = countIssueReasons(records);
  const topCategories = topByCount(records.filter((record) => record.suspicious).map((record) => record.category));
  const duplicateStems = findDuplicates(records.map((record) => `${record.category}/${record.currentFilenameStem}`));
  const duplicateFutureRiskStems = findDuplicates(records.map((record) => `${record.category}/${stripHashSuffix(record.currentFilenameStem)}`));
  const missingSvg = records.filter((record) => !record.svgFileExists);
  const missingWebp = records.filter((record) => !record.webpFileExists);
  const metadataPairs = records.filter((record) => record.svgFileExists && record.webpPlannedByRound5B && record.filenameStemConsistentBetweenSvgAndWebp);
  const blockers = [];
  if (missingSvg.length > 0) blockers.push("One or more SVG files referenced by generated item data are missing.");
  if (records.some((record) => !record.webpPlannedByRound5B)) blockers.push("One or more item records lack a Round 5B WebP plan.");

  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-current-asset-filename-audit",
    auditedRoots: {
      svg: "pipeline/r2-upload/coloring-pages/svg",
      webp: "pipeline/r2-upload/coloring-pages/webp",
      webpPlanFallback: "pipeline/manifests/round-5b-webp-preview-assets.json",
      generatedItems: "src/generated/coloring/items.json",
      titleOverrides: "src/generated/coloring/title-overrides.json",
    },
    summary: {
      totalItemRecords: items.length,
      totalSvgFiles: svgFiles.filter((file) => file.endsWith(".svg")).length,
      totalCurrentWebpFiles: webpFiles.filter((file) => file.endsWith(".webp")).length,
      currentWebpFolderExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp")),
      totalPlannedWebpRecords: webpItems.size,
      totalPlannedSvgWebpPairs: metadataPairs.length,
      missingSvgFileCount: missingSvg.length,
      missingCurrentWebpFileCount: missingWebp.length,
      missingWebpPlanCount: records.filter((record) => !record.webpPlannedByRound5B).length,
      totalSuspiciousFilenames: records.filter((record) => record.suspicious).length,
      suspiciousByReason: reasonCounts,
      topCategoriesWithSuspiciousFilenames: topCategories.slice(0, 12),
      duplicateCurrentFilenameStemCount: duplicateStems.length,
      duplicateFutureBaseStemRiskCount: duplicateFutureRiskStems.length,
      svgWebpStemConsistencyIssues: records.filter((record) => !record.filenameStemConsistentBetweenSvgAndWebp).length,
      categoryFolderConsistencyIssues: records.filter((record) => !record.categoryFolderConsistent).length,
      pngPreviewReferenceCount: records.filter((record) => record.currentPngPreviewRelativePath).length,
      thumbnailReferenceCount: records.filter((record) => record.currentThumbnailRelativePath).length,
      note: "Current full WebP media may be absent because Round 5L must not create the final upload bundle. WebP audit uses the Round 5B full WebP path manifest.",
    },
    duplicateCurrentFilenameStems: duplicateStems.slice(0, 200),
    duplicateFutureBaseStemRisks: duplicateFutureRiskStems.slice(0, 200),
    examples: records.filter((record) => record.suspicious).slice(0, 50),
    records,
    blockers,
  };
}

function detectFilenameIssues({ stem, category, title, filenameSlug }) {
  const issues = [];
  const normalized = stem.toLowerCase();
  const base = stripHashSuffix(normalized);
  const tokens = base.split("-").filter(Boolean);

  for (const bad of BAD_PATTERNS) {
    if (bad.pattern.test(base)) issues.push({ code: bad.code, confidence: "high", detail: `Matched ${bad.code} pattern.` });
  }

  const repeated = tokens.filter((token, index) => index > 0 && token === tokens[index - 1]);
  if (repeated.length > 0) issues.push({ code: "duplicate_tokens", confidence: "medium", detail: `Repeated adjacent token: ${repeated[0]}.` });
  if (base.length > 82) issues.push({ code: "overly_long", confidence: "high", detail: `Stem length is ${base.length} before hash suffix.` });
  for (const spelling of SPELLING_ISSUES) {
    if (tokens.includes(spelling.token)) issues.push({ code: "spelling_issue", confidence: "high", detail: `Detected ${spelling.token}; suggested ${spelling.suggestion}.` });
  }

  const descriptiveTokens = tokens.filter((token) => token !== category && !GENERIC_TOKENS.has(token) && !/^\d+$/.test(token));
  if (descriptiveTokens.length === 0) issues.push({ code: "vague_subject", confidence: "manual_review", detail: "Filename has no descriptive subject tokens after removing category and generic words." });
  if (descriptiveTokens.length === 1 && ["collection", "pattern", "scene", "design"].includes(descriptiveTokens[0])) {
    issues.push({ code: "generic_name", confidence: "medium", detail: "Filename subject is generic and may need owner review." });
  }

  if (category && filenameSlug && !filenameSlug.startsWith(category) && !categoryAllowsDifferentPrefix(category, filenameSlug)) {
    issues.push({ code: "category_mismatch", confidence: "low", detail: `Filename slug does not start with category ${category}.` });
  }

  if (issues.length === 0) issues.push({ code: "safe_existing_name", confidence: "high", detail: "Current filename is descriptive enough for public object key use." });
  if (issues.some((issue) => ["ai_export_name", "failed_name", "timestamp_name", "vague_subject", "category_mismatch"].includes(issue.code))) {
    issues.push({ code: "manual_review_required", confidence: "manual_review", detail: "One or more naming issues should be reviewed before full upload if confidence stays low." });
  }

  return dedupeIssues(issues);
}

function categoryAllowsDifferentPrefix(category, filenameSlug) {
  if (category === "anime-girls") return /^anime-girl/.test(filenameSlug);
  if (category === "animals-playing-cards") return /^(animals|cats|dogs|birds|fish|wildlife).*playing-cards/.test(filenameSlug);
  if (category === "holiday") return /^(holiday|christmas|halloween|birthday|easter|thanksgiving|valentine|new-year)/.test(filenameSlug);
  if (category === "mandala-geometry-patterns") return /^(mandala|geometric|pattern|vehicle|cars|trains|planes|bakery)/.test(filenameSlug);
  if (category === "plushie") return /^(plushie|chibi|holiday)/.test(filenameSlug);
  if (category === "christmas") return /^(christmas|holiday-christmas)/.test(filenameSlug);
  if (category === "dinosaurs") return /^(dinosaurs|prehistoric|dinosaur)/.test(filenameSlug);
  if (category === "flowers") return /^(flowers|chibi-flowers|plants|indoor-plants)/.test(filenameSlug);
  return false;
}

function buildTaxonomy() {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5l-filename-cleanup-taxonomy",
    reasonCodes: [
      { code: "ai_export_name", description: "Filename exposes AI tool or generated-export wording such as ChatGPT, GPT, OpenAI, DALL-E, or ai-generated." },
      { code: "failed_name", description: "Filename exposes failed, failure, retry, or similar internal production status language." },
      { code: "timestamp_name", description: "Filename appears to be date or timestamp driven rather than subject driven." },
      { code: "generic_name", description: "Filename is too generic for a durable public object key." },
      { code: "duplicate_tokens", description: "Filename repeats adjacent tokens awkwardly." },
      { code: "category_mismatch", description: "Filename and category folder appear inconsistent and should not be moved automatically in this round." },
      { code: "spelling_issue", description: "Filename contains a safely detectable spelling issue." },
      { code: "overly_long", description: "Filename is longer than needed for a professional public URL." },
      { code: "internal_pipeline_term", description: "Filename exposes internal pipeline, upload, trace, or object-key wording." },
      { code: "vague_subject", description: "Filename does not contain enough subject detail for a confident clean key." },
      { code: "collision_risk", description: "Clean base stem would collide without a stable suffix." },
      { code: "safe_existing_name", description: "Current filename is already acceptable for public use." },
      { code: "manual_review_required", description: "Owner or later cleanup round should review before final upload." },
    ],
    confidenceLevels: [
      { level: "high", description: "The issue or clean name is strongly supported by existing metadata." },
      { level: "medium", description: "The clean name is likely acceptable but should be reviewed if the asset is important." },
      { level: "low", description: "The clean name uses conservative inference and should not be treated as final without review." },
      { level: "manual_review", description: "The item needs owner review or a later visual/name pass before final upload." },
    ],
    actions: [
      { action: "keep", description: "Keep the current public object key stem." },
      { action: "clean_public_object_key", description: "Use a generated clean future object key while leaving current files unchanged." },
      { action: "manual_review_before_full_upload", description: "Review before the final full upload or exclude from that upload." },
      { action: "defer", description: "Do not decide the final name in this round." },
    ],
  };
}

function classifyDrift(filePath) {
  if (/^pipeline\/(?:manifests|reports|scripts|tests)\/round-5l-/i.test(normalizePath(filePath))) return "intended_round_5l_artifact";
  if (/^pipeline\/(?:manifests|reports)\/round-\d/i.test(normalizePath(filePath))) return "generated_validation_drift";
  if (/^(?:out|\.next|test-results|pipeline\/review)\//i.test(normalizePath(filePath))) return "local_artifact_drift";
  if (["AGENTS.md", "package.json"].includes(filePath)) return "intended_round_5l_artifact";
  return "risky_unrelated_drift";
}

function countIssueReasons(records) {
  const counts = {};
  for (const record of records) {
    for (const issue of record.issues) counts[issue.code] = (counts[issue.code] || 0) + 1;
  }
  return counts;
}

function topByCount(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.entries(counts).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function findDuplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function basenameWithoutExt(filePath) {
  return path.basename(filePath).replace(/\.[^.]+$/, "");
}

function stripHashSuffix(stem) {
  return String(stem || "").replace(/-[a-f0-9]{10}$/i, "");
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderProjectContextReport(payload) {
  const s = payload.summary;
  return `# Round 5L Project Context Check

- Correct repository: ${s.correctRepository}
- Repository: ${s.repoName}
- Branch: ${s.branch}
- Round 5K commit exists: ${s.round5kCommitExists}
- app/api route present: ${s.appApiRoutePresent}
- Static export configured: ${s.staticExportConfigured}
- Coloring pages route exists: ${s.coloringPagesRouteExists}
- Hub route exists: ${s.hubRouteExists}
- R2 upload coloring-pages exists: ${s.r2UploadColoringPagesExists}
- R2 upload SVG folder exists: ${s.r2UploadSvgExists}
- R2 upload WebP folder exists: ${s.r2UploadWebpExists}
- Public contains generated production media: ${s.publicContainsGeneratedProductionMedia}
- images clean: ${s.imagesStatusClean}
- ilovesvg clean: ${s.ilovesvgStatusClean}
- SVG internal only: ${s.svgInternalOnly}
- Public downloads PNG/JPG/WebP: ${s.publicDownloadsPngJpgWebp}
- Ad wells visible by default: ${s.adWellsVisibleByDefault}
- Live AdSense code present: ${s.liveAdSenseCodePresent}
- Image sitemap present: ${s.imageSitemapPresent}
- OG image generation present: ${s.openGraphImageGenerationPresent}
- Wrong context indicators present: ${s.wrongContextIndicatorsPresent}

## Notes

${payload.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function renderWorkingTreeReport(payload) {
  return `# Round 5L Working Tree Audit

- Status entries: ${payload.summary.statusEntryCount}
- Generated validation drift: ${payload.summary.generatedValidationDriftCount}
- Local artifact drift: ${payload.summary.localArtifactDriftCount}
- Intended Round 5L drift: ${payload.summary.intendedRound5LDriftCount}
- Risky unrelated drift: ${payload.summary.riskyUnrelatedDriftCount}
- Safe to proceed: ${payload.summary.safeToProceed}

## Status

\`\`\`
${payload.statusShort || "(clean)"}
\`\`\`

## Diff Stat

\`\`\`
${payload.diffStat || "(none)"}
\`\`\`
`;
}

function renderFilenameAuditReport(payload) {
  const s = payload.summary;
  return `# Round 5L Current Asset Filename Audit

- Total item records: ${s.totalItemRecords}
- Total SVG files: ${s.totalSvgFiles}
- Total current WebP files: ${s.totalCurrentWebpFiles}
- Current WebP folder exists: ${s.currentWebpFolderExists}
- Total planned WebP records: ${s.totalPlannedWebpRecords}
- Total planned SVG/WebP pairs: ${s.totalPlannedSvgWebpPairs}
- Missing SVG files: ${s.missingSvgFileCount}
- Missing current WebP files: ${s.missingCurrentWebpFileCount}
- Missing WebP plan records: ${s.missingWebpPlanCount}
- Suspicious filenames: ${s.totalSuspiciousFilenames}
- SVG/WebP stem consistency issues: ${s.svgWebpStemConsistencyIssues}
- Category folder consistency issues: ${s.categoryFolderConsistencyIssues}
- Duplicate current filename stems: ${s.duplicateCurrentFilenameStemCount}
- Duplicate future base stem risks: ${s.duplicateFutureBaseStemRiskCount}
- PNG preview references audited only as fallback: ${s.pngPreviewReferenceCount}
- Thumbnail references audited only as fallback: ${s.thumbnailReferenceCount}

## Suspicious By Reason

${Object.entries(s.suspiciousByReason).map(([reason, count]) => `- ${reason}: ${count}`).join("\n") || "- none"}

## Top Categories

${s.topCategoriesWithSuspiciousFilenames.map((item) => `- ${item.value}: ${item.count}`).join("\n") || "- none"}

## Examples

${payload.examples.slice(0, 20).map((record) => `- ${record.assetId}: ${record.currentFilenameStem} (${record.issues.map((issue) => issue.code).join(", ")})`).join("\n") || "- none"}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No filename-audit blockers found.\n"}
`;
}

function renderTaxonomyReport(payload) {
  return `# Round 5L Filename Cleanup Taxonomy

## Reason Codes

${payload.reasonCodes.map((item) => `- ${item.code}: ${item.description}`).join("\n")}

## Confidence Levels

${payload.confidenceLevels.map((item) => `- ${item.level}: ${item.description}`).join("\n")}

## Actions

${payload.actions.map((item) => `- ${item.action}: ${item.description}`).join("\n")}
`;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const absoluteFile of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(absoluteFile)) continue;
      if (normalizePath(absoluteFile).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(absoluteFile, "utf8"));
    }
  }
  return chunks.join("\n");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(absolute);
    }
  }
  await walk(root);
  return results;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${String(text).replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 30 });
  return stdout;
}

async function gitStatusFor(relativePath) {
  return git(["status", "--short", "--", relativePath]);
}

async function gitCommitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

function normalizePath(filePath) {
  const normalizedRoot = String(REPO_ROOT || "").replace(/\\/g, "/");
  return String(filePath || "").replace(/\\/g, "/").replace(`${normalizedRoot}/`, "");
}

function toRepoPath(filePath) {
  return normalizePath(path.relative(REPO_ROOT, filePath));
}
