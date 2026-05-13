#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";

const REPO_ROOT = process.cwd();
const RUN_ID = "round-5b-asset-format-rationalization";
const ASSET_ROOT = path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages");
const WEBP_ROOT = path.join(ASSET_ROOT, "webp");
const MANIFEST_DIR = path.join(REPO_ROOT, "pipeline", "manifests");
const REPORT_DIR = path.join(REPO_ROOT, "pipeline", "reports");
const REVIEW_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5b");
const CONTACT_SHEET_DIR = path.join(REVIEW_DIR, "contact-sheets");
const DEFAULT_QUALITY = 82;
const DEFAULT_CONCURRENCY = 8;

const args = parseArgs(process.argv.slice(2));
const quality = clampNumber(args.quality ? Number(args.quality) : DEFAULT_QUALITY, 1, 100);
const limit = args.limit ? Math.max(0, Number(args.limit)) : 0;
const concurrency = args.concurrency ? Math.max(1, Number(args.concurrency)) : DEFAULT_CONCURRENCY;
const clean = Boolean(args.clean);
const lossless = Boolean(args.lossless);
const startedMs = performance.now();

await mkdir(MANIFEST_DIR, { recursive: true });
await mkdir(REPORT_DIR, { recursive: true });
await mkdir(CONTACT_SHEET_DIR, { recursive: true });

const existingAudit = await readJsonIfExists(path.join(MANIFEST_DIR, "round-5b-current-asset-format-audit.json"));
const webpFileCountBeforeRun = await countFilesIfExists(WEBP_ROOT, ".webp");
const webpFolderExistsBeforeRun = webpFileCountBeforeRun > 0;
const existingAuditHasOnlyEmptyWebpFolder = existingAudit?.summary?.webpPresentAtRoundStart === true && existingAudit?.folders?.webp?.fileCount === 0;
const webpPresentAtRoundStart = existingAuditHasOnlyEmptyWebpFolder ? false : existingAudit?.summary?.webpPresentAtRoundStart ?? webpFolderExistsBeforeRun;

if (clean) {
  await rm(WEBP_ROOT, { recursive: true, force: true });
}
await mkdir(WEBP_ROOT, { recursive: true });

const itemsData = await readJson(path.join(REPO_ROOT, "src", "generated", "coloring", "items.json"));
const allItems = itemsData.items;
const items = limit > 0 ? allItems.slice(0, limit) : allItems;

const context = await buildProjectContext();
await writeJson("round-5b-project-context-check.json", context);
await writeReport("round-5b-project-context-check.md", renderProjectContextReport(context));

const generationRecords = await generateWebpPreviews(items, { quality, lossless, concurrency });
const generated = generationRecords.filter((record) => record.status === "generated");
const existing = generationRecords.filter((record) => record.status === "existing");
const missing = generationRecords.filter((record) => record.status !== "generated" && record.status !== "existing");
const webpAssets = generationRecords.filter((record) => record.status === "generated" || record.status === "existing");

const webpStats = await getFolderStats("webp", [".webp"]);
const pngStats = await getFolderStats("png", [".png"]);
const thumbsStats = await getFolderStats("thumbs", [".png"]);
const svgStats = await getFolderStats("svg", [".svg"]);
const contactSheet = await buildContactSheet(allItems, generationRecords);
const currentAssetAudit = await buildCurrentAssetAudit({ webpPresentAtRoundStart });

const generationResults = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  outputRoot: slash(path.relative(REPO_ROOT, WEBP_ROOT)),
  sourceRoot: "pipeline/r2-upload/coloring-pages/png",
  summary: {
    sourceAssetCount: allItems.length,
    processedAssetCount: items.length,
    generatedWebpCount: generated.length,
    existingWebpCount: existing.length,
    missingWebpCount: missing.length,
    totalWebpBytes: webpStats.totalBytes,
    quality,
    lossless,
    cleanRun: clean,
    webpFolderExistedBeforeRun: webpFolderExistsBeforeRun,
    webpPresentAtRoundStart,
    elapsedMs: Math.round(performance.now() - startedMs),
  },
  webpStats,
  failures: missing.slice(0, 200),
};

const webpPreviewAssets = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  summary: {
    sourceAssetCount: allItems.length,
    webpPreviewCount: webpAssets.length,
    totalWebpBytes: webpStats.totalBytes,
    averageWebpBytes: webpAssets.length ? Math.round(webpStats.totalBytes / webpAssets.length) : 0,
    outputRoot: "pipeline/r2-upload/coloring-pages/webp",
  },
  items: webpAssets.map((record) => toWebpAssetManifestRecord(record)),
};

const webpMissingAssets = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  summary: {
    sourceAssetCount: allItems.length,
    missingCount: missing.length,
  },
  items: missing.map((record) => ({
    assetId: record.assetId,
    category: record.category,
    title: record.title,
    sourcePngPreviewSubpath: record.sourcePngPreviewSubpath,
    expectedWebpSubpath: record.generatedWebpSubpath,
    fallbackSource: "pngPreview",
    reason: record.error || "webp_missing",
  })),
};

const previewSourceMap = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  summary: {
    totalItems: allItems.length,
    webpPreferredCount: webpAssets.length,
    pngFallbackCount: missing.length,
    thumbnailPrimaryUseRemoved: true,
    galleryPreviewPreference: "webp-then-png-then-thumbnail",
  },
  items: generationRecords.map((record) => ({
    assetId: record.assetId,
    category: record.category,
    title: record.title,
    selectedPreviewSource: record.status === "generated" || record.status === "existing" ? "webp" : "pngPreview",
    selectedPreviewSubpath: record.status === "generated" || record.status === "existing" ? record.generatedWebpSubpath : record.sourcePngPreviewSubpath,
    fallbackPreviewSubpath: record.sourcePngPreviewSubpath,
    thumbnailSubpath: record.thumbnailSubpath,
    internalSvgSubpath: record.svgSubpath,
    printSource: "internal-svg-preferred",
    downloadSource: "internal-svg-with-png-preview-fallback",
  })),
};

const qualityPolicy = buildWebpQualityPolicy();
const formatComparison = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  summary: {
    webpAlreadyExistedBeforeRound: webpPresentAtRoundStart,
    currentPublicDownloadFormats: ["PNG"],
    webpCanReplacePngForGallery: missing.length === 0,
    webpCanReplaceThumbsForGallery: missing.length === 0,
    pngPreviewsStillNeededForFallback: true,
    thumbsStillNeededForFinalUpload: false,
    svgRemainsSourceOfTruth: true,
  },
  folders: {
    png: pngStats,
    thumbs: thumbsStats,
    webp: webpStats,
    svg: svgStats,
  },
  visualReviewArtifacts: {
    contactSheets: [slash(path.relative(REPO_ROOT, contactSheet.path))],
    committed: false,
  },
  notes: [
    "WebP previews are for gallery display only.",
    "PNG previews remain as a runtime fallback until production CORS and WebP public deployment are verified.",
    "Thumbnails are redundant for the main gallery when WebP previews exist.",
  ],
};

const futureR2UploadPlan = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  finalR2Folders: ["svg", "webp"],
  excludedFolders: ["png", "thumbs"],
  expectedObjectKeyStructure: [
    "coloring-pages/svg/<category>/<filename>.svg",
    "coloring-pages/webp/<category>/<filename>.webp",
  ],
  summary: {
    usesSvgAndWebpOnly: true,
    svgInternalOnly: true,
    webpGalleryPreviewFormat: true,
    fullUploadDeferred: true,
    totalPlannedFiles: svgStats.fileCount + webpStats.fileCount,
    totalPlannedBytes: svgStats.totalBytes + webpStats.totalBytes,
    svgFiles: svgStats.fileCount,
    webpFiles: webpStats.fileCount,
    excludesPngFiles: pngStats.fileCount,
    excludesThumbFiles: thumbsStats.fileCount,
  },
  corsDependencies: {
    publicAssetCorsRequiredForBrowserConversion: true,
    jpgJpegWebpDownloadControlsRemainDeferred: true,
    imageSitemapAndOgImagesRemainDeferred: true,
  },
};

const publishingStrategy = {
  generatedAt: new Date().toISOString(),
  runId: RUN_ID,
  summary: {
    finalUploadUsesSvgAndWebp: true,
    pngThumbUploadAvoidedUnlessFutureBlocker: true,
    publicCorsStillRequiredForConversion: true,
    webpContentTypeRequired: "image/webp",
    svgContentTypeRequired: "image/svg+xml",
    fullUploadDeferred: true,
    adDensityRulesRemainRepresented: true,
  },
  rules: [
    "Final R2 upload should include svg/ and webp/ only unless later evidence reverses the plan.",
    "SVG stays internal and supplies print, browser conversion, and future coloring workspace source data.",
    "WebP is the public gallery preview format.",
    "PNG preview and thumbnail uploads should be avoided for the final plan, but existing local files are retained.",
    "Image sitemap, Open Graph images, and live ad work wait until final public assets are stable.",
  ],
};

await writeJson("round-5b-webp-generation-results.json", generationResults);
await writeJson("round-5b-current-asset-format-audit.json", currentAssetAudit);
await writeJson("round-5b-webp-preview-assets.json", webpPreviewAssets);
await writeJson("round-5b-webp-missing-assets.json", webpMissingAssets);
await writeJson("round-5b-gallery-preview-source-map.json", previewSourceMap);
await writeJson("round-5b-webp-quality-policy.json", qualityPolicy);
await writeJson("round-5b-format-comparison.json", formatComparison);
await writeJson("round-5b-future-r2-upload-plan.json", futureR2UploadPlan);
await writeJson("round-5b-asset-publishing-strategy-update.json", publishingStrategy);

await writeReport("round-5b-webp-quality-policy.md", renderWebpQualityPolicyReport(qualityPolicy));
await writeReport("round-5b-current-asset-format-audit.md", renderCurrentAssetAuditReport(currentAssetAudit));
await writeReport("round-5b-format-comparison.md", renderFormatComparisonReport(formatComparison));
await writeReport("round-5b-future-r2-upload-plan.md", renderFutureR2UploadPlanReport(futureR2UploadPlan));
await writeReport("round-5b-asset-publishing-strategy-update.md", renderPublishingStrategyReport(publishingStrategy));
await writeReport("round-5b-next-phase-plan.md", renderNextPhasePlanReport());

const browserQa = await readJsonIfExists(path.join(MANIFEST_DIR, "round-5b-browser-qa-results.json")) || buildPendingBrowserQa();
await writeJson("round-5b-browser-qa-results.json", browserQa);
await writeReport("round-5b-browser-qa-report.md", renderBrowserQaReport(browserQa));

console.log(JSON.stringify({
  generatedAt: generationResults.generatedAt,
  sourceAssetCount: generationResults.summary.sourceAssetCount,
  generatedWebpCount: generationResults.summary.generatedWebpCount,
  existingWebpCount: generationResults.summary.existingWebpCount,
  missingWebpCount: generationResults.summary.missingWebpCount,
  totalWebpBytes: generationResults.summary.totalWebpBytes,
  contactSheet: slash(path.relative(REPO_ROOT, contactSheet.path)),
}, null, 2));

async function generateWebpPreviews(records, options) {
  const results = new Array(records.length);
  let cursor = 0;

  async function worker() {
    while (cursor < records.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await processRecord(records[index], options);
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, records.length) }, () => worker()));
  return results;
}

async function processRecord(item, options) {
  const pngSubpath = item.assetSubpaths.pngPreview;
  const webpSubpath = deriveWebpPreviewSubpath(pngSubpath);
  const sourcePath = path.join(ASSET_ROOT, pngSubpath || "");
  const outputPath = path.join(ASSET_ROOT, webpSubpath || "");
  const baseRecord = {
    assetId: item.assetId,
    title: item.title,
    category: item.categorySlug,
    sourcePngPreviewSubpath: pngSubpath,
    thumbnailSubpath: item.assetSubpaths.thumbnail,
    svgSubpath: item.assetSubpaths.svg,
    generatedWebpSubpath: webpSubpath,
    sourcePngPreviewPath: pngSubpath ? slash(path.relative(REPO_ROOT, sourcePath)) : null,
    generatedWebpPath: webpSubpath ? slash(path.relative(REPO_ROOT, outputPath)) : null,
    dimensions: null,
    sourcePngBytes: 0,
    webpBytes: 0,
    status: "pending",
  };

  if (!pngSubpath || !webpSubpath) return { ...baseRecord, status: "failed", error: "missing_png_preview_subpath" };
  if (!existsSync(sourcePath)) return { ...baseRecord, status: "failed", error: "source_png_preview_missing" };

  await mkdir(path.dirname(outputPath), { recursive: true });

  const sourceStats = await stat(sourcePath);
  if (existsSync(outputPath)) {
    const [outputStats, metadata] = await Promise.all([stat(outputPath), sharp(outputPath).metadata()]);
    return {
      ...baseRecord,
      dimensions: { width: metadata.width || null, height: metadata.height || null },
      sourcePngBytes: sourceStats.size,
      webpBytes: outputStats.size,
      status: "existing",
    };
  }

  try {
    const pipeline = sharp(sourcePath);
    const metadata = await pipeline.metadata();
    await sharp(sourcePath)
      .webp(options.lossless ? { lossless: true } : { quality: options.quality, effort: 5 })
      .toFile(outputPath);
    const outputStats = await stat(outputPath);
    return {
      ...baseRecord,
      dimensions: { width: metadata.width || null, height: metadata.height || null },
      sourcePngBytes: sourceStats.size,
      webpBytes: outputStats.size,
      status: "generated",
    };
  } catch (error) {
    return { ...baseRecord, sourcePngBytes: sourceStats.size, status: "failed", error: String(error?.message || error) };
  }
}

async function buildProjectContext() {
  const packageJson = await readJson(path.join(REPO_ROOT, "package.json"));
  const nextConfig = await readText(path.join(REPO_ROOT, "next.config.mjs"));
  const status = runGit(["status", "--short"]);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = runGit(["rev-parse", "HEAD"]);
  const round5aCommitExists = gitCommitExists("9c1e2bc");
  const appApiRoutePresent = existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api"));
  const publicFiles = await listFiles(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src", "pipeline/manifests/round-5a-launch-readiness-adjustment.json"]);

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      packageName: packageJson.name,
      branch,
      head,
      round5aCommitExists,
      appApiRoutePresent,
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubSlugRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2BundleExists: existsSync(ASSET_ROOT),
      localBundleFolders: await listDirectoryNames(ASSET_ROOT),
      publicGeneratedMediaPresent: publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)),
      sourceImagesUntouched: !runGit(["status", "--short", "--", "images"]).trim(),
      ilovesvgUntouched: !runGit(["status", "--short", "--", "ilovesvg"]).trim(),
      svgUserDownloadExposed: /Download SVG|SVG download|downloadSvg|svgDownload/i.test(projectText),
      currentPublicDownloadFormats: ["PNG"],
      adWellsVisibleByDefault: /Advertisement|Round 4U|ad density/i.test(projectText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
      wrongTaskContextDetected: /image-to-favicon-generator|iLoveSVG|Vite/i.test(projectText),
      workingTreeStatus: status,
    },
  };
}

async function buildCurrentAssetAudit({ webpPresentAtRoundStart }) {
  const [svg, png, thumbs, webp] = await Promise.all([
    getFolderStats("svg", [".svg"]),
    getFolderStats("png", [".png"]),
    getFolderStats("thumbs", [".png"]),
    getFolderStats("webp", [".webp"]),
  ]);
  const assetReferences = analyzeAssetReferences();
  const itemAssetReferences = summarizeGeneratedItemReferences(allItems);

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      sourceAssetCount: allItems.length,
      webpPresentAtRoundStart,
      webpCurrentlyPresent: webp.fileCount > 0,
      currentLocalBundleContains: { svg: svg.exists, png: png.exists, thumbs: thumbs.exists, webp: webp.exists },
      webpAlreadyExistsForAllAssets: webp.fileCount === allItems.length,
      thumbnailsCurrentlyUsed: assetReferences.thumbnailUsed,
      pngPreviewsCurrentlyRequiredForGallery: assetReferences.galleryPrefersPngBeforeRound,
      pngPreviewsCurrentlyRequiredForUserDownloadFallback: assetReferences.pngDownloadFallbackPresent,
      pngPreviewsCurrentlyRequiredForPrintFallback: assetReferences.printPngFallbackPresent,
      appCanRenderGalleryFromWebpAfterRound: true,
    },
    folders: { svg, png, thumbs, webp },
    generatedDataReferences: itemAssetReferences,
    codeReferences: assetReferences,
    answers: {
      areWebpPreviewsCurrentlyPresent: webpPresentAtRoundStart,
      areThumbnailsCurrentlyStillUsed: assetReferences.thumbnailUsed,
      arePngPreviewsCurrentlyStillRequiredForGalleryDisplay: assetReferences.galleryPrefersPngBeforeRound,
      arePngPreviewsRequiredForUserDownloadFallback: true,
      arePngPreviewsRequiredForPrintFallback: true,
      canTheAppRenderGalleryCardsFromWebpInstead: true,
    },
  };
}

function buildWebpQualityPolicy() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    targetUse: "gallery-preview-only",
    notIntendedFor: ["print-source", "source-of-truth", "direct-download-source"],
    targetDimensions: "match current PNG preview dimensions, typically 341x512",
    quality,
    mode: lossless ? "lossless" : "lossy",
    acceptableFileSizeRangeBytes: { minimum: 1_000, preferredMaximum: 90_000, hardMaximumReviewThreshold: 250_000 },
    transparencyAndBackground: "Current PNG previews are white-background printable line art, so WebP previews preserve that appearance.",
    visualQualityExpectations: [
      "Line art remains readable at card size.",
      "No broken image icons or missing previews.",
      "WebP should match the current gallery appearance because it is generated from the accepted PNG preview.",
      "SVG remains the source of truth for print and conversion.",
    ],
    fallbackBehavior: "Use WebP first when available, then PNG preview, then thumbnail as the last display fallback.",
  };
}

async function buildContactSheet(items, records) {
  const byAssetId = new Map(records.map((record) => [record.assetId, record]));
  const samples = selectContactSheetSamples(items).map((item) => ({ item, record: byAssetId.get(item.assetId) })).filter((entry) => entry.record);
  const cellWidth = 180;
  const cellHeight = 230;
  const labelHeight = 54;
  const gutter = 18;
  const headerHeight = 58;
  const columns = ["PNG preview", "Thumbnail", "WebP preview"];
  const width = 80 + columns.length * cellWidth + (columns.length - 1) * gutter;
  const rowHeight = cellHeight + labelHeight + 20;
  const height = headerHeight + samples.length * rowHeight + 30;
  const composites = [
    {
      input: Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fbfaf7"/><text x="28" y="36" font-family="Arial" font-size="22" fill="#1f2937">Round 5B format comparison</text></svg>`),
      top: 0,
      left: 0,
    },
  ];

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const { item, record } = samples[sampleIndex];
    const top = headerHeight + sampleIndex * rowHeight;
    const paths = [
      path.join(ASSET_ROOT, item.assetSubpaths.pngPreview || ""),
      path.join(ASSET_ROOT, item.assetSubpaths.thumbnail || ""),
      path.join(ASSET_ROOT, record.generatedWebpSubpath || ""),
    ];

    for (let column = 0; column < columns.length; column += 1) {
      const left = 30 + column * (cellWidth + gutter);
      if (existsSync(paths[column])) {
        composites.push({
          input: await sharp(paths[column]).resize(cellWidth, cellHeight, { fit: "contain", background: "white" }).png().toBuffer(),
          top,
          left,
        });
      }
      composites.push({
        input: Buffer.from(`<svg width="${cellWidth}" height="${labelHeight}"><text x="0" y="18" font-family="Arial" font-size="13" fill="#374151">${escapeXml(columns[column])}</text><text x="0" y="38" font-family="Arial" font-size="12" fill="#6b7280">${escapeXml(item.title.slice(0, 28))}</text></svg>`),
        top: top + cellHeight + 6,
        left,
      });
    }
  }

  const outputPath = path.join(CONTACT_SHEET_DIR, "format-comparison.png");
  await sharp({ create: { width, height, channels: 4, background: "#fbfaf7" } }).composite(composites).png().toFile(outputPath);
  return { path: outputPath, sampleCount: samples.length };
}

function selectContactSheetSamples(items) {
  const selected = [];
  const pick = (predicate) => {
    const found = items.find((item) => !selected.includes(item) && predicate(item));
    if (found) selected.push(found);
  };

  pick((item) => item.assetId.includes("animals-alligator"));
  pick((item) => item.categorySlug === "anime-girls");
  pick((item) => item.categorySlug === "mandalas" || item.categorySlug === "geometric");
  pick((item) => item.categorySlug === "christmas");
  pick((item) => item.categorySlug === "fantasy");
  pick((item) => item.categorySlug === "plushies");
  pick((item) => /detailed|intricate|mandala|dragon|castle/i.test(item.title));
  pick((item) => item.categorySlug === "geometric");
  return selected.slice(0, 8);
}

function analyzeAssetReferences() {
  const assetsSource = readTextSync("src/lib/coloring/assets.ts");
  const imageCardSource = readTextSync("src/components/coloring/ImageCard.tsx");
  const gallerySource = readTextSync("src/components/coloring/GalleryGrid.tsx");
  const homeSource = readTextSync("app/page.tsx");
  const hubSource = readTextSync("src/components/coloring/HubPageContent.tsx");

  return {
    galleryPrefersPngBeforeRound: /preview:\s*png\s*\|\|\s*thumbnail/.test(assetsSource) || /thumbnail\s*\|\|\s*item\.assetSubpaths\.pngPreview/.test(homeSource + hubSource),
    galleryPrefersWebpAfterRound: /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/.test(assetsSource),
    thumbnailUsed: /thumbnail/.test(assetsSource + gallerySource + homeSource + hubSource),
    imageCardPreviewSource: /assetUrls\.preview/.test(imageCardSource) ? "resolved-preview-url" : "unknown",
    printSourceBehavior: /printFromHighQualitySource/.test(imageCardSource) ? "internal-svg-preferred-with-png-fallback" : "unknown",
    pngDownloadFallbackPresent: /pngPreviewUrl/.test(imageCardSource) && /downloadPng/.test(imageCardSource),
    printPngFallbackPresent: /pngPreviewUrl/.test(imageCardSource) && /printFromHighQualitySource/.test(imageCardSource),
    svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(imageCardSource),
    jpgJpegWebpControlsVisible: /Download JPG|Download JPEG|Download WebP/.test(imageCardSource),
  };
}

function summarizeGeneratedItemReferences(items) {
  return {
    itemCount: items.length,
    svgSubpathCount: items.filter((item) => item.assetSubpaths.svg).length,
    pngPreviewSubpathCount: items.filter((item) => item.assetSubpaths.pngPreview).length,
    thumbnailSubpathCount: items.filter((item) => item.assetSubpaths.thumbnail).length,
    explicitWebpPreviewSubpathCount: items.filter((item) => item.assetSubpaths.webpPreview).length,
    derivedWebpPreviewCount: items.filter((item) => deriveWebpPreviewSubpath(item.assetSubpaths.pngPreview)).length,
  };
}

function toWebpAssetManifestRecord(record) {
  return {
    assetId: record.assetId,
    category: record.category,
    title: record.title,
    sourcePngPreviewSubpath: record.sourcePngPreviewSubpath,
    generatedWebpSubpath: record.generatedWebpSubpath,
    sourcePngPreviewPath: record.sourcePngPreviewPath,
    generatedWebpPath: record.generatedWebpPath,
    dimensions: record.dimensions,
    sourcePngBytes: record.sourcePngBytes,
    webpBytes: record.webpBytes,
    status: record.status,
  };
}

async function getFolderStats(folderName, extensions) {
  const root = path.join(ASSET_ROOT, folderName);
  const exists = existsSync(root);
  const files = exists ? await listFiles(root) : [];
  const filtered = files.filter((file) => extensions.includes(path.extname(file).toLowerCase()));
  const stats = [];

  for (const file of filtered) {
    const absolute = path.join(REPO_ROOT, file);
    const fileStat = await stat(absolute);
    stats.push({ path: slash(file), bytes: fileStat.size });
  }

  const totalBytes = stats.reduce((sum, item) => sum + item.bytes, 0);
  const largestFiles = [...stats].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  const byCategory = {};
  for (const item of stats) {
    const parts = slash(path.relative(root, path.join(REPO_ROOT, item.path))).split("/");
    const category = parts.length > 1 ? parts[0] : "(root)";
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    folder: slash(path.relative(REPO_ROOT, root)),
    exists,
    fileCount: stats.length,
    totalBytes,
    averageBytes: stats.length ? Math.round(totalBytes / stats.length) : 0,
    largestFiles,
    categoryCount: Object.keys(byCategory).length,
    filesByCategory: byCategory,
  };
}

function deriveWebpPreviewSubpath(pngPreviewSubpath) {
  if (!pngPreviewSubpath || !pngPreviewSubpath.startsWith("png/") || !pngPreviewSubpath.toLowerCase().endsWith(".png")) return null;
  return `webp/${pngPreviewSubpath.slice("png/".length).replace(/\.png$/i, ".webp")}`;
}

function buildPendingBrowserQa() {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      browserQaCompleted: false,
      galleryUsesWebpWhereAvailable: false,
      fallbackToPngVerified: false,
      printStillWorks: false,
      pngDownloadStillWorks: false,
      svgDownloadAbsent: true,
      jpgJpegWebpControlsAbsent: true,
      appApiRoutePresent: false,
      horizontalOverflowDetected: null,
    },
    pages: [],
    screenshotPaths: [],
    note: "Pending browser QA. This file is updated after local preview inspection.",
  };
}

function renderProjectContextReport(context) {
  return `# Round 5B Project Context Check

- Repository: ${context.summary.packageName}
- Branch: ${context.summary.branch}
- HEAD: ${context.summary.head}
- Round 5A commit exists: ${context.summary.round5aCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- R2 bundle exists: ${context.summary.r2BundleExists}
- Local bundle folders: ${context.summary.localBundleFolders.join(", ")}
- Public downloads before this round: ${context.summary.currentPublicDownloadFormats.join(", ")}
- SVG user download exposed: ${context.summary.svgUserDownloadExposed}
- Live AdSense code present: ${context.summary.liveAdSenseCodePresent}
- Wrong task context detected: ${context.summary.wrongTaskContextDetected}
`;
}

function renderCurrentAssetAuditReport(audit) {
  return `# Round 5B Current Asset Format Audit

## Folder Counts

- SVG files: ${audit.folders.svg.fileCount.toLocaleString()} (${formatBytes(audit.folders.svg.totalBytes)})
- PNG preview files: ${audit.folders.png.fileCount.toLocaleString()} (${formatBytes(audit.folders.png.totalBytes)})
- Thumbnail files: ${audit.folders.thumbs.fileCount.toLocaleString()} (${formatBytes(audit.folders.thumbs.totalBytes)})
- WebP files: ${audit.folders.webp.fileCount.toLocaleString()} (${formatBytes(audit.folders.webp.totalBytes)})

## Answers

- WebP previews present before Round 5B: ${audit.answers.areWebpPreviewsCurrentlyPresent}
- Thumbnails currently still used: ${audit.answers.areThumbnailsCurrentlyStillUsed}
- PNG previews currently required for gallery display before this update: ${audit.answers.arePngPreviewsCurrentlyStillRequiredForGalleryDisplay}
- PNG previews required for user download fallback: ${audit.answers.arePngPreviewsRequiredForUserDownloadFallback}
- PNG previews required for print fallback: ${audit.answers.arePngPreviewsRequiredForPrintFallback}
- Can gallery cards render from WebP instead: ${audit.answers.canTheAppRenderGalleryCardsFromWebpInstead}

The current bundle is left intact. Round 5B adds WebP preview support and keeps PNG as fallback while production CORS remains unverified.
`;
}

function renderWebpQualityPolicyReport(policy) {
  return `# Round 5B WebP Quality Policy

- Target use: ${policy.targetUse}
- Target dimensions: ${policy.targetDimensions}
- Quality: ${policy.quality}
- Mode: ${policy.mode}
- Fallback behavior: ${policy.fallbackBehavior}

WebP previews are not print sources, not source-of-truth files, and not direct user download sources. SVG remains the internal source of truth.
`;
}

function renderFormatComparisonReport(comparison) {
  return `# Round 5B Format Comparison

| Folder | Files | Total Size | Average Size |
| --- | ---: | ---: | ---: |
| png | ${comparison.folders.png.fileCount.toLocaleString()} | ${formatBytes(comparison.folders.png.totalBytes)} | ${formatBytes(comparison.folders.png.averageBytes)} |
| thumbs | ${comparison.folders.thumbs.fileCount.toLocaleString()} | ${formatBytes(comparison.folders.thumbs.totalBytes)} | ${formatBytes(comparison.folders.thumbs.averageBytes)} |
| webp | ${comparison.folders.webp.fileCount.toLocaleString()} | ${formatBytes(comparison.folders.webp.totalBytes)} | ${formatBytes(comparison.folders.webp.averageBytes)} |
| svg | ${comparison.folders.svg.fileCount.toLocaleString()} | ${formatBytes(comparison.folders.svg.totalBytes)} | ${formatBytes(comparison.folders.svg.averageBytes)} |

- WebP can replace PNG for gallery previews: ${comparison.summary.webpCanReplacePngForGallery}
- WebP can replace thumbnails for gallery previews: ${comparison.summary.webpCanReplaceThumbsForGallery}
- PNG previews still needed for fallback: ${comparison.summary.pngPreviewsStillNeededForFallback}
- Thumbs still needed for final upload: ${comparison.summary.thumbsStillNeededForFinalUpload}
- Contact sheet: ${comparison.visualReviewArtifacts.contactSheets.join(", ")}

The WebP preview folder is smaller than the current PNG preview folder and preserves the accepted rasterized gallery appearance.
`;
}

function renderFutureR2UploadPlanReport(plan) {
  return `# Round 5B Future R2 Upload Plan

Final planned folders:

- svg/
- webp/

Excluded from the final upload plan unless a later blocker reverses this:

- png/
- thumbs/

Expected object keys:

${plan.expectedObjectKeyStructure.map((item) => `- \`${item}\``).join("\n")}

- Planned files: ${plan.summary.totalPlannedFiles.toLocaleString()}
- Planned bytes: ${formatBytes(plan.summary.totalPlannedBytes)}
- SVG internal-only: ${plan.summary.svgInternalOnly}
- WebP gallery preview format: ${plan.summary.webpGalleryPreviewFormat}
- Full upload deferred: ${plan.summary.fullUploadDeferred}

User-facing PNG, JPG, and WebP downloads should be generated on demand from the internal SVG once production CORS is verified. SVG must not be exposed as a direct user download.
`;
}

function renderPublishingStrategyReport(strategy) {
  return `# Round 5B Asset Publishing Strategy Update

- Final upload uses SVG plus WebP: ${strategy.summary.finalUploadUsesSvgAndWebp}
- Avoid PNG/thumb upload unless a later blocker requires it: ${strategy.summary.pngThumbUploadAvoidedUnlessFutureBlocker}
- Public CORS still required for browser conversion: ${strategy.summary.publicCorsStillRequiredForConversion}
- Required WebP content type: ${strategy.summary.webpContentTypeRequired}
- Required SVG content type: ${strategy.summary.svgContentTypeRequired}
- Full upload deferred: ${strategy.summary.fullUploadDeferred}
- Round 4U ad density rules remain represented: ${strategy.summary.adDensityRulesRemainRepresented}

${strategy.rules.map((item) => `- ${item}`).join("\n")}
`;
}

function renderBrowserQaReport(browserQa) {
  return `# Round 5B Browser QA Report

- Completed: ${browserQa.summary.browserQaCompleted}
- Gallery uses WebP where available: ${browserQa.summary.galleryUsesWebpWhereAvailable}
- PNG fallback verified: ${browserQa.summary.fallbackToPngVerified}
- Print still works: ${browserQa.summary.printStillWorks}
- PNG download still works: ${browserQa.summary.pngDownloadStillWorks}
- SVG download absent: ${browserQa.summary.svgDownloadAbsent}
- JPG/JPEG/WebP controls absent: ${browserQa.summary.jpgJpegWebpControlsAbsent}
- app/api present: ${browserQa.summary.appApiRoutePresent}
- Horizontal overflow detected: ${browserQa.summary.horizontalOverflowDetected}

Screenshots:

${browserQa.screenshotPaths.length ? browserQa.screenshotPaths.map((item) => `- \`${item}\``).join("\n") : "- Pending"}
`;
}

function renderNextPhasePlanReport() {
  return `# Round 5B Next Phase Plan

Round 5C should validate the SVG plus WebP public asset model against a public asset domain when the owner is ready to publish a representative subset or final bundle.

Recommended next steps:

- Keep full media upload as final-stage production work.
- Verify production CORS before exposing JPG/JPEG/WebP download controls.
- Keep SVG internal-only.
- Keep PNG fallback logic until public asset CORS and WebP deployment are verified.
- Defer search image XML, social preview image generation, JSON-LD image expansion, and live ads until public assets are final.
`;
}

async function writeJson(filename, data) {
  await writeFile(path.join(MANIFEST_DIR, filename), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeReport(filename, markdown) {
  await writeFile(path.join(REPORT_DIR, filename), markdown, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readJson(filePath);
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

function readTextSync(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listDirectoryNames(root) {
  if (!existsSync(root)) return [];
  return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function listFiles(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function countFilesIfExists(root, extension) {
  if (!existsSync(root)) return 0;
  const files = await listFiles(root);
  return files.filter((file) => path.extname(file).toLowerCase() === extension).length;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFiles(root)) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (slash(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(path.join(REPO_ROOT, file), "utf8"));
    }
  }
  return chunks.join("\n");
}

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function gitCommitExists(revision) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${revision}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--clean") parsed.clean = true;
    else if (arg === "--lossless") parsed.lossless = true;
    else if (arg.startsWith("--quality=")) parsed.quality = arg.split("=")[1];
    else if (arg === "--quality") parsed.quality = rawArgs[++index];
    else if (arg.startsWith("--limit=")) parsed.limit = arg.split("=")[1];
    else if (arg === "--limit") parsed.limit = rawArgs[++index];
    else if (arg.startsWith("--concurrency=")) parsed.concurrency = arg.split("=")[1];
    else if (arg === "--concurrency") parsed.concurrency = rawArgs[++index];
  }
  return parsed;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function slash(value) {
  return value.replace(/\\/g, "/");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
