#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const ROUND_5O_COMMIT = "587e215";
const CLEAN_ROOT = "pipeline/r2-upload-clean/coloring-pages";
const OPTIMIZED_ROOT = "pipeline/r2-upload-optimized";
const EXPECTED_SVG = 6352;
const EXPECTED_WEBP = 6352;
const EXPECTED_TOTAL = 12704;

const OUTPUTS = {
  projectContext: "pipeline/manifests/round-5p-project-context-check.json",
  workingTree: "pipeline/manifests/round-5p-working-tree-audit.json",
  sizeAudit: "pipeline/manifests/round-5p-clean-bundle-size-audit.json",
  strategy: "pipeline/manifests/round-5p-compression-strategy.json",
};

const REPORTS = {
  projectContext: "pipeline/reports/round-5p-project-context-check.md",
  workingTree: "pipeline/reports/round-5p-working-tree-audit.md",
  sizeAudit: "pipeline/reports/round-5p-clean-bundle-size-audit.md",
  strategy: "pipeline/reports/round-5p-compression-strategy.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const projectContext = await buildProjectContext();
  const workingTree = buildWorkingTreeAudit();
  const sizeAudit = await buildSizeAudit();
  const strategy = buildCompressionStrategy();

  await writeJson(OUTPUTS.projectContext, projectContext);
  await writeText(REPORTS.projectContext, renderProjectContextReport(projectContext));
  await writeJson(OUTPUTS.workingTree, workingTree);
  await writeText(REPORTS.workingTree, renderWorkingTreeReport(workingTree));
  await writeJson(OUTPUTS.sizeAudit, sizeAudit);
  await writeText(REPORTS.sizeAudit, renderSizeAuditReport(sizeAudit));
  await writeJson(OUTPUTS.strategy, strategy);
  await writeText(REPORTS.strategy, renderStrategyReport(strategy));

  if (sizeAudit.summary.svgFileCount !== EXPECTED_SVG || sizeAudit.summary.webpFileCount !== EXPECTED_WEBP || sizeAudit.summary.totalFileCount !== EXPECTED_TOTAL) {
    throw new Error(`Clean bundle count blocker: expected ${EXPECTED_TOTAL} files, got ${sizeAudit.summary.totalFileCount}.`);
  }

  console.log(JSON.stringify({
    runId: "round-5p-clean-bundle-size-audit",
    svgFiles: sizeAudit.summary.svgFileCount,
    webpFiles: sizeAudit.summary.webpFileCount,
    totalFiles: sizeAudit.summary.totalFileCount,
    totalBundleBytes: sizeAudit.summary.totalBundleBytes,
  }, null, 2));
}

async function buildProjectContext() {
  const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
  const repoName = path.basename(repoRoot);
  const branch = git(["branch", "--show-current"]).trim();
  const nextConfig = await readText("next.config.mjs");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const projectText = await readProjectText(["app", "src", "package.json", "next.config.mjs"]);
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      round5oCommitExists: commandSucceeds("git", ["cat-file", "-e", `${ROUND_5O_COMMIT}^{commit}`]),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      cleanBundleExists: existsSync(path.join(REPO_ROOT, CLEAN_ROOT)),
      cleanBundleSvgExists: existsSync(path.join(REPO_ROOT, CLEAN_ROOT, "svg")),
      cleanBundleWebpExists: existsSync(path.join(REPO_ROOT, CLEAN_ROOT, "webp")),
      optimizedBundleExistsBeforeRound: existsSync(path.join(REPO_ROOT, OPTIMIZED_ROOT)),
      publicContainsGeneratedProductionMedia: publicFiles.some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
      ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}`),
      publicDownloadsPngJpgWebp: /label: "PNG"/.test(downloadMenu) && /label: "JPG"/.test(downloadMenu) && /label: "WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /Advertisement/.test(adsConfig),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
      imageSitemapPresent: /image-sitemap|ImageSitemap/i.test(projectText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(projectText),
      wrongContextIndicatorsPresent: /image-to-favicon-generator|routeManifestClientAssets|routeMetaBytes|createManifestMeta|SVG wrapper route|Vite-specific output/i.test(projectText),
    },
  };
}

function buildWorkingTreeAudit() {
  const statusShort = git(["status", "--short"]);
  const diffStat = git(["diff", "--stat"]);
  const diffNameOnly = git(["diff", "--name-only"]);
  const entries = statusShort.split(/\r?\n/).filter(Boolean).map((raw) => {
    const pathName = raw.slice(3).trim();
    return { raw, path: pathName, classification: classifyWorkingTreePath(pathName) };
  });
  const riskyUnrelatedDrift = entries.filter((entry) => entry.classification === "risky_unrelated_drift");
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-working-tree-audit",
    summary: {
      statusEntryCount: entries.length,
      intendedRound5PCount: entries.filter((entry) => entry.classification === "intended_round_5p_artifact").length,
      generatedValidationDriftCount: entries.filter((entry) => entry.classification === "generated_validation_drift").length,
      localArtifactDriftCount: entries.filter((entry) => entry.classification === "local_artifact_drift").length,
      riskyUnrelatedDriftCount: riskyUnrelatedDrift.length,
      safeToProceed: riskyUnrelatedDrift.length === 0,
    },
    commands: {
      statusShort: "git status --short",
      diffStat: "git diff --stat",
      diffNameOnly: "git diff --name-only",
    },
    statusShort,
    diffStat,
    diffNameOnly,
    entries,
    riskyUnrelatedDrift,
  };
}

async function buildSizeAudit() {
  const files = await listFilesIfExists(path.join(REPO_ROOT, CLEAN_ROOT));
  const records = [];
  for (const file of files) {
    const fileStat = await stat(path.join(REPO_ROOT, file));
    const type = file.endsWith(".svg") ? "svg" : file.endsWith(".webp") ? "webp" : "other";
    const parts = slash(file).split("/");
    const category = parts[parts.indexOf(type) + 1] || "unknown";
    records.push({ file, type, category, bytes: fileStat.size });
  }
  const svg = records.filter((record) => record.type === "svg");
  const webp = records.filter((record) => record.type === "webp");
  const byCategory = new Map();
  for (const record of records) {
    const current = byCategory.get(record.category) || { category: record.category, totalBytes: 0, svgBytes: 0, webpBytes: 0, fileCount: 0 };
    current.totalBytes += record.bytes;
    current.fileCount += 1;
    if (record.type === "svg") current.svgBytes += record.bytes;
    if (record.type === "webp") current.webpBytes += record.bytes;
    byCategory.set(record.category, current);
  }
  const totalSvgBytes = sumBytes(svg);
  const totalWebpBytes = sumBytes(webp);
  const totalBundleBytes = totalSvgBytes + totalWebpBytes;
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-clean-bundle-size-audit",
    root: CLEAN_ROOT,
    summary: {
      svgFileCount: svg.length,
      webpFileCount: webp.length,
      totalFileCount: svg.length + webp.length,
      totalSvgBytes,
      totalWebpBytes,
      totalBundleBytes,
      averageSvgSize: Math.round(totalSvgBytes / Math.max(1, svg.length)),
      averageWebpSize: Math.round(totalWebpBytes / Math.max(1, webp.length)),
      expectedUploadOperationCount: svg.length + webp.length,
      estimatedStorageGB: Number((totalBundleBytes / 1_000_000_000).toFixed(3)),
      estimatedTransferImpactGB: Number((totalBundleBytes / 1_000_000_000).toFixed(3)),
    },
    largestSvgFiles: svg.sort((a, b) => b.bytes - a.bytes).slice(0, 25),
    largestWebpFiles: webp.sort((a, b) => b.bytes - a.bytes).slice(0, 25),
    largestCategories: [...byCategory.values()].sort((a, b) => b.totalBytes - a.totalBytes).slice(0, 25),
  };
}

function buildCompressionStrategy() {
  return {
    generatedAt: GENERATED_AT,
    runId: "round-5p-compression-strategy",
    summary: {
      conservative: true,
      svgRemainsSourceOfTruth: true,
      webpPreviewOnly: true,
      removeViewBoxAllowed: false,
      pathSimplificationAggressive: false,
      idRemovalAggressive: false,
      rasterizesSvg: false,
      rollbackUsesOriginalCleanBundle: true,
    },
    svgApproach: [
      "Use SVGO only for conservative metadata/comment cleanup and safe numeric cleanup.",
      "Preserve viewBox, dimensions, strokes, fills, styles, paths, and IDs.",
      "Disable removeViewBox, cleanupIds, mergePaths, aggressive convertPathData, and style-altering plugins.",
    ],
    webpApproach: [
      "Use Sharp to test conservative WebP quality candidates on a representative sample.",
      "Default to the safest candidate that saves bytes without reducing gallery readability.",
      "Use original WebP when optimized output is larger or fails decode validation.",
    ],
    dangerousSvgPluginsToAvoid: [
      "removeViewBox",
      "cleanupIds aggressive removal/minification",
      "mergePaths",
      "convertPathData aggressive simplification",
      "removeUnknownsAndDefaults when it may affect line art",
      "style inlining/minification when it may affect rendering",
    ],
    qualityThresholds: {
      svgMustParse: true,
      svgMustKeepViewBoxOrDimensions: true,
      svgMustNotBeEmpty: true,
      webpMustDecode: true,
      webpDimensionsMustMatch: true,
      visualContactSheetsRequired: true,
      browserQaRequired: true,
    },
    expectedSavings: {
      ownerSvgSampleSavingsPercent: 30,
      ownerWebpSampleSavingsPercent: 14,
      actualSavingsMeasuredByRound5P: true,
    },
  };
}

function renderProjectContextReport(payload) {
  return `# Round 5P Project Context Check

- Repository: ${payload.summary.repoName}
- Branch: ${payload.summary.branch}
- Round 5O commit exists: ${payload.summary.round5oCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- Clean bundle present: ${payload.summary.cleanBundleExists}
- SVG remains internal-only: ${payload.summary.svgInternalOnly}
- Public downloads PNG/JPG/WebP: ${payload.summary.publicDownloadsPngJpgWebp}
- Wrong context indicators present: ${payload.summary.wrongContextIndicatorsPresent}
`;
}

function renderWorkingTreeReport(payload) {
  return `# Round 5P Working Tree Audit

- Status entries: ${payload.summary.statusEntryCount}
- Intended Round 5P entries: ${payload.summary.intendedRound5PCount}
- Generated validation drift: ${payload.summary.generatedValidationDriftCount}
- Local artifact drift: ${payload.summary.localArtifactDriftCount}
- Risky unrelated drift: ${payload.summary.riskyUnrelatedDriftCount}
- Safe to proceed: ${payload.summary.safeToProceed}

${payload.entries.map((entry) => `- ${entry.raw}: ${entry.classification}`).join("\n") || "- none"}
`;
}

function renderSizeAuditReport(payload) {
  return `# Round 5P Clean Bundle Size Audit

- SVG files: ${payload.summary.svgFileCount}
- WebP files: ${payload.summary.webpFileCount}
- Total files: ${payload.summary.totalFileCount}
- SVG bytes: ${payload.summary.totalSvgBytes}
- WebP bytes: ${payload.summary.totalWebpBytes}
- Total bytes: ${payload.summary.totalBundleBytes}
- Average SVG size: ${payload.summary.averageSvgSize}
- Average WebP size: ${payload.summary.averageWebpSize}
- Expected upload operations: ${payload.summary.expectedUploadOperationCount}
- Estimated storage GB: ${payload.summary.estimatedStorageGB}
`;
}

function renderStrategyReport(payload) {
  return `# Round 5P Compression Strategy

Compression is conservative and deterministic. SVG remains the source of truth for print, download conversion, and future coloring/editing. WebP optimization is preview-only.

Risky SVG changes are disabled: removeViewBox, aggressive cleanupIds, mergePaths, aggressive convertPathData, and style-altering cleanup. Byte savings must not override visual correctness.

Fallback strategy: if optimized output is larger, fails validation, or raises visual risk, the optimized bundle receives the original clean file for that asset.
`;
}

function classifyWorkingTreePath(pathName) {
  if (!pathName) return "unknown";
  if (pathName === ".gitignore" || pathName === "AGENTS.md" || pathName === "package.json" || pathName === "package-lock.json") return "intended_round_5p_artifact";
  if (/^pipeline\/(?:scripts|tests|manifests|reports)\/round-5p/.test(pathName)) return "intended_round_5p_artifact";
  if (/^pipeline\/config\/(?:$|svgo\.conservative\.config\.mjs$)/.test(pathName)) return "intended_round_5p_artifact";
  if (/^pipeline\/(?:scripts|tests|manifests|reports)\/round-5o/.test(pathName)) return "intended_round_5p_artifact";
  if (pathName === "pipeline/scripts/round-4z-cors-media-server.mjs") return "intended_round_5p_artifact";
  if (/^pipeline\/r2-upload-optimized\//.test(pathName) || /^pipeline\/review\/round-5p\//.test(pathName)) return "local_artifact_drift";
  if (/^pipeline\/manifests\/round-4|^pipeline\/reports\/round-4|^src\/generated\/coloring\//.test(pathName)) return "generated_validation_drift";
  return "risky_unrelated_drift";
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
  await writeFile(absolutePath, String(value).replace(/[ \t]+\n/g, "\n"), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = statSync(root);
  if (rootStat.isFile()) return [slash(path.relative(REPO_ROOT, root))];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(slash(path.relative(REPO_ROOT, absolute)));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function git(commandArgs) {
  try {
    return execFileSync("git", commandArgs, { cwd: REPO_ROOT, encoding: "utf8" });
  } catch {
    return "";
  }
}

function commandSucceeds(command, commandArgs) {
  try {
    execFileSync(command, commandArgs, { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sumBytes(records) {
  return records.reduce((sum, record) => sum + record.bytes, 0);
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}
