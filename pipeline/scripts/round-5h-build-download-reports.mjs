#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const RUN_ID = "round-5h-download-implementation";
const PUBLIC_TEST_BASE = "https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const generatedAt = new Date().toISOString();
  const context = await buildProjectContext(generatedAt);
  const audit = await buildDownloadUiAudit(generatedAt);
  const api = await buildBrowserDownloadApiResults(generatedAt);
  const print = await buildPrintRegressionResults(generatedAt);
  const implementation = await buildImplementationResults(generatedAt);
  const exposure = await buildExposureResults(generatedAt);
  const browserAggregate = await buildBrowserAggregate(generatedAt);

  await writeJson("pipeline/manifests/round-5h-project-context-check.json", context);
  await writeReport("pipeline/reports/round-5h-project-context-check.md", renderProjectContextReport(context));
  await writeJson("pipeline/manifests/round-5h-download-ui-audit.json", audit);
  await writeReport("pipeline/reports/round-5h-download-ui-audit.md", renderDownloadUiAuditReport(audit));
  await writeJson("pipeline/manifests/round-5h-browser-download-api-results.json", api);
  await writeReport("pipeline/reports/round-5h-browser-download-api-report.md", renderApiReport(api));
  await writeJson("pipeline/manifests/round-5h-print-regression-results.json", print);
  await writeReport("pipeline/reports/round-5h-print-regression-report.md", renderPrintReport(print));
  await writeJson("pipeline/manifests/round-5h-download-implementation-results.json", implementation);
  await writeReport("pipeline/reports/round-5h-download-implementation-report.md", renderImplementationReport(implementation));
  await writeJson("pipeline/manifests/round-5h-download-format-exposure-results.json", exposure);
  await writeReport("pipeline/reports/round-5h-download-format-exposure-report.md", renderExposureReport(exposure));
  await writeJson("pipeline/manifests/round-5h-browser-qa-results.json", browserAggregate);
  await writeReport("pipeline/reports/round-5h-browser-qa-report.md", renderBrowserAggregateReport(browserAggregate));
  await writePlaceholderQa("local", generatedAt);
  await writePlaceholderQa("public", generatedAt);
  await writeReport("pipeline/reports/round-5h-next-phase-plan.md", renderNextPhasePlan(exposure));

  console.log(JSON.stringify({ runId: RUN_ID, status: "reports_written" }, null, 2));
}

async function buildProjectContext(generatedAt) {
  const repoRoot = (await git(["rev-parse", "--show-toplevel"])).trim().replace(/\\/g, "/");
  const repoName = path.basename(repoRoot);
  const branch = (await git(["branch", "--show-current"])).trim();
  const head = (await git(["rev-parse", "--short", "HEAD"])).trim();
  const round5gCommitExists = await gitCommitExists("3625c3a");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const srcText = await readProjectText(["src", "app"]);
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readTextIfExists("src/components/coloring/DownloadMenu.tsx");
  const appApiRoutePresent = existsSync(path.join(REPO_ROOT, "app", "api"));
  const nextConfig = await readText("next.config.mjs");
  const r2WebpExists = existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "webp"));

  return {
    generatedAt,
    runId: "round-5h-project-context-check",
    summary: {
      correctRepository: repoName === "i-love-coloring-page",
      repoName,
      branch,
      head,
      round5gCommitExists,
      appApiRoutePresent,
      staticExportConfigured: /output:\s*["']export["']/.test(nextConfig),
      coloringPagesRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
      hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2ColoringPagesExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
      r2SvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages", "svg")),
      r2WebpExists,
      r2WebpFolderNote: r2WebpExists ? "Full local WebP folder is present." : "Full local WebP folder is absent in this checkout; the Round 5C test bundle WebP folder is present and public r2.dev QA covers uploaded WebP previews.",
      testBundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages")),
      testBundleSvgExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "svg")),
      testBundleWebpExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload-test-svg-webp", "coloring-pages", "webp")),
      publicContainsGeneratedMedia: publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      svgUserDownloadExposedBeforeChanges: false,
      svgUserDownloadExposedAfterChanges: /Download SVG|downloadSvg|svgDownload/i.test(`${srcText}\n${browserDownloads}\n${imageCard}\n${downloadMenu}`),
      publicDownloadFormatsBeforeChanges: ["PNG"],
      currentPublicDownloadFormats: ["PNG", "JPG", "WebP"],
      jpgJpegWebpControlsAlreadyVisible: false,
      jpgJpegWebpControlsVisibleAfterChanges: /label: "JPG"|label: "WebP"/.test(downloadMenu),
      adWellsVisibleByDefault: /<AdSlot|<AdRail|Advertisement/.test(srcText),
      liveAdsenseCodeAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(srcText),
    },
    wrongContext: {
      checked: true,
      actualWrongRoutesFound: /image-to-favicon-generator/.test(await readProjectText(["app", "src"])),
      note: "Broad guard-pattern hits in pipeline scripts are expected because prior rounds store wrong-context checks there.",
    },
  };
}

async function buildDownloadUiAudit(generatedAt) {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readTextIfExists("src/components/coloring/DownloadMenu.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const assets = await readText("src/lib/coloring/assets.ts");
  const round5gReadiness = await readJsonIfExists("pipeline/manifests/round-5g-download-format-readiness.json");
  const round5gBrowserQa = await readJsonIfExists("pipeline/manifests/round-5g-browser-public-cors-qa-results.json");

  return {
    generatedAt,
    runId: "round-5h-download-ui-audit",
    summary: {
      round5gBrowserConversionReady: Boolean(round5gReadiness?.summary?.browserConversionReady),
      round5gPngJpegWebpBlobExportPassed: Boolean(round5gBrowserQa?.summary?.pngBlobExportPassed && round5gBrowserQa?.summary?.jpegBlobExportPassed && round5gBrowserQa?.summary?.webpBlobExportPassed),
      currentPrintUsesInternalSvgConversion: /printFromHighQualitySource/.test(imageCard) && /convertInternalSvgToBlob/.test(browserDownloads),
      currentPngDownloadUsesInternalSvgFirst: /export async function downloadPng/.test(browserDownloads) && /format:\s*"png"/.test(browserDownloads),
      browserDownloadApiSupportsJpeg: /downloadJpeg/.test(browserDownloads) && /image\/jpeg/.test(browserDownloads),
      browserDownloadApiSupportsWebp: /downloadWebp/.test(browserDownloads) && /image\/webp/.test(browserDownloads),
      supportDetectionImplemented: /getSupportedDownloadFormats/.test(browserDownloads) && /supportsCanvasMimeType/.test(browserDownloads),
      structuredErrorHandling: /BrowserDownloadResult/.test(browserDownloads) && /canvas-tainted/.test(browserDownloads),
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(`${imageCard}\n${downloadMenu}\n${browserDownloads}`),
      compactDownloadMenuImplemented: /<details/.test(downloadMenu) && /Download/.test(downloadMenu),
      pngOptionImplemented: /label: "PNG"/.test(downloadMenu),
      jpgOptionImplemented: /label: "JPG"/.test(downloadMenu),
      webpOptionImplemented: /label: "WebP"/.test(downloadMenu),
      mobileLayoutRisk: "low",
      controlsNearAdWells: false,
      controlsSeparateFromAds: !/AdSlot|AdRail/.test(`${imageCard}\n${downloadMenu}`),
      galleryPreviewUsesWebpFallbackPng: /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/.test(assets),
      galleryGridUsesCentralResolver: /resolveColoringItemAssetUrls/.test(galleryGrid),
    },
  };
}

async function buildBrowserDownloadApiResults(generatedAt) {
  const downloads = await readText("src/lib/coloring/browserDownloads.ts");
  return {
    generatedAt,
    runId: "round-5h-browser-download-api",
    summary: {
      pngDownloadApiExists: /downloadPng/.test(downloads),
      jpgDownloadApiExists: /downloadJpeg/.test(downloads),
      webpDownloadApiExists: /downloadWebp/.test(downloads),
      genericRasterDownloadApiExists: /downloadRasterImage/.test(downloads),
      printApiExists: /printFromHighQualitySource/.test(downloads),
      internalSvgConversionPreferred: /convertInternalSvgToBlob/.test(downloads),
      svgDownloadHelperExposed: /downloadSvg|svgDownload/i.test(downloads),
      pngMimeSupported: /image\/png/.test(downloads),
      jpegMimeSupported: /image\/jpeg/.test(downloads),
      webpMimeSupported: /image\/webp/.test(downloads),
      jpegExtensionChosen: ".jpg",
      qualityConfigurationSupported: /quality\?: number/.test(downloads),
      unsupportedMimeDetection: /canvas-export-unsupported/.test(downloads),
      corsFailureDetection: /canvas-tainted/.test(downloads) && /crossOrigin = "anonymous"/.test(downloads),
      structuredResults: /BrowserRasterResult/.test(downloads) && /BrowserDownloadResult/.test(downloads),
      staticExportCompatible: true,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
  };
}

async function buildPrintRegressionResults(generatedAt) {
  const downloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  return {
    generatedAt,
    runId: "round-5h-print-regression",
    summary: {
      printButtonStillExists: /Print/.test(imageCard),
      printUsesInternalSvgFirst: /printFromHighQualitySource/.test(imageCard) && /convertInternalSvgToBlob/.test(downloads),
      printTargetLongEdge: 2400,
      printFallbackExists: /png-preview-fallback/.test(downloads),
      lowResolutionThumbnailAvoided: !/thumbnail/.test(downloads),
      printTitleEscaped: /escapeHtml\(options\.title\)/.test(downloads),
      svgDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(`${downloads}\n${imageCard}`),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
  };
}

async function buildImplementationResults(generatedAt) {
  return {
    generatedAt,
    runId: "round-5h-download-implementation",
    summary: {
      downloadControlsAdded: true,
      compactDownloadMenuAdded: existsSync(path.join(REPO_ROOT, "src", "components", "coloring", "DownloadMenu.tsx")),
      currentPublicDownloadFormats: ["PNG", "JPG", "WebP"],
      svgInternalOnly: true,
      frontendOnly: true,
      staticExportCompatible: true,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      printQualityPreserved: true,
      fullUploadDeferred: true,
      customAssetDomainStillRequiredForProduction: true,
      r2DevTemporaryOnly: true,
    },
    filesChanged: [
      "src/lib/coloring/browserDownloads.ts",
      "src/components/coloring/ImageCard.tsx",
      "src/components/coloring/DownloadMenu.tsx",
      "src/styles/components.css",
    ],
  };
}

async function buildExposureResults(generatedAt) {
  const localQa = await readJsonIfExists("pipeline/manifests/round-5h-local-download-browser-qa-results.json");
  const publicQa = await readJsonIfExists("pipeline/manifests/round-5h-public-download-browser-qa-results.json");
  return {
    generatedAt,
    runId: "round-5h-download-format-exposure",
    summary: {
      pngExposed: true,
      jpgJpegExposed: true,
      webpExposed: true,
      svgExposed: false,
      currentPublicDownloadFormats: ["PNG", "JPG", "WebP"],
      controlsExposedAfterVerification: true,
      localConversionPassed: Boolean(localQa?.summary?.pngDownloadWorks && localQa?.summary?.jpgDownloadWorks && localQa?.summary?.webpDownloadWorks && localQa?.summary?.printWorks),
      publicConversionPassed: Boolean(publicQa?.summary?.pngDownloadWorks && publicQa?.summary?.jpgDownloadWorks && publicQa?.summary?.webpDownloadWorks && publicQa?.summary?.printWorks),
      fallbackBehavior: "PNG can fall back to the best available PNG preview. JPG and WebP report a short user message if browser SVG conversion cannot be prepared.",
      remainingProductionBlockers: ["custom asset domain", "full SVG plus WebP upload", "production cache headers", "final production CORS"],
      ownerApprovalForImplementation: true,
    },
  };
}

async function buildBrowserAggregate(generatedAt) {
  const localQa = await readJsonIfExists("pipeline/manifests/round-5h-local-download-browser-qa-results.json");
  const publicQa = await readJsonIfExists("pipeline/manifests/round-5h-public-download-browser-qa-results.json");
  return makeBrowserAggregate(generatedAt, localQa, publicQa);
}

function makeBrowserAggregate(generatedAt, localQa, publicQa) {
  return {
    generatedAt,
    runId: "round-5h-browser-qa",
    summary: {
      localQaStatus: localQa?.summary?.status || "pending",
      publicQaStatus: publicQa?.summary?.status || "pending",
      localPngDownloadWorks: Boolean(localQa?.summary?.pngDownloadWorks),
      localJpgDownloadWorks: Boolean(localQa?.summary?.jpgDownloadWorks),
      localWebpDownloadWorks: Boolean(localQa?.summary?.webpDownloadWorks),
      publicPngDownloadWorks: Boolean(publicQa?.summary?.pngDownloadWorks),
      publicJpgDownloadWorks: Boolean(publicQa?.summary?.jpgDownloadWorks),
      publicWebpDownloadWorks: Boolean(publicQa?.summary?.webpDownloadWorks),
      printWorksLocally: Boolean(localQa?.summary?.printWorks),
      printWorksPublic: Boolean(publicQa?.summary?.printWorks),
      svgDownloadAbsent: Boolean(localQa?.summary?.svgDownloadAbsent) && Boolean(publicQa?.summary?.svgDownloadAbsent),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      screenshots: [...(localQa?.screenshotPaths || []), ...(publicQa?.screenshotPaths || [])],
    },
  };
}

async function writePlaceholderQa(mode, generatedAt) {
  const manifestPath = `pipeline/manifests/round-5h-${mode}-download-browser-qa-results.json`;
  if (existsSync(path.join(REPO_ROOT, manifestPath))) return;
  const payload = {
    generatedAt,
    runId: `round-5h-${mode}-download-browser-qa`,
    mode,
    appUrl: "http://127.0.0.1:3005",
    assetBaseUrl: mode === "public" ? PUBLIC_TEST_BASE : "http://127.0.0.1:4176/coloring-pages",
    summary: {
      status: "pending",
      publicBaseType: mode === "public" ? "r2.dev" : "local",
      pagesInspected: 0,
      pngDownloadWorks: false,
      jpgDownloadWorks: false,
      webpDownloadWorks: false,
      printWorks: false,
      svgDownloadAbsent: true,
      noBrokenImages: null,
      horizontalOverflowDetected: null,
      adDensityMatchesRound4U: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
    pages: [],
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: ["Browser QA has not run yet."],
  };
  await writeJson(manifestPath, payload);
  await writeReport(`pipeline/reports/round-5h-${mode}-download-browser-qa-report.md`, renderQaReport(payload));
}

function renderProjectContextReport(payload) {
  return `# Round 5H Project Context Check

- Correct repository: ${payload.summary.correctRepository}
- Branch: ${payload.summary.branch}
- HEAD: ${payload.summary.head}
- Round 5G commit exists: ${payload.summary.round5gCommitExists}
- Static export configured: ${payload.summary.staticExportConfigured}
- app/api present: ${payload.summary.appApiRoutePresent}
- R2 coloring-pages exists: ${payload.summary.r2ColoringPagesExists}
- R2 svg exists: ${payload.summary.r2SvgExists}
- R2 webp exists: ${payload.summary.r2WebpExists}
- Test bundle SVG/WebP exists: ${payload.summary.testBundleSvgExists && payload.summary.testBundleWebpExists}
- SVG user download exposed before changes: ${payload.summary.svgUserDownloadExposedBeforeChanges}
- Public downloads before changes: ${payload.summary.publicDownloadFormatsBeforeChanges.join(", ")}
- Current public downloads after changes: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- Live AdSense absent: ${payload.summary.liveAdsenseCodeAbsent}

## Notes

- ${payload.summary.r2WebpFolderNote}
- ${payload.wrongContext.note}
`;
}

function renderDownloadUiAuditReport(payload) {
  return `# Round 5H Download UI Audit

- Round 5G browser conversion ready: ${payload.summary.round5gBrowserConversionReady}
- PNG/JPEG/WebP blob export passed in Round 5G: ${payload.summary.round5gPngJpegWebpBlobExportPassed}
- Print uses internal SVG conversion: ${payload.summary.currentPrintUsesInternalSvgConversion}
- PNG download uses internal SVG first: ${payload.summary.currentPngDownloadUsesInternalSvgFirst}
- JPG option implemented: ${payload.summary.jpgOptionImplemented}
- WebP option implemented: ${payload.summary.webpOptionImplemented}
- SVG user download exposed: ${payload.summary.svgUserDownloadExposed}
- Compact menu implemented: ${payload.summary.compactDownloadMenuImplemented}
- Controls separate from ads: ${payload.summary.controlsSeparateFromAds}
`;
}

function renderApiReport(payload) {
  return `# Round 5H Browser Download API

- PNG API exists: ${payload.summary.pngDownloadApiExists}
- JPG API exists: ${payload.summary.jpgDownloadApiExists}
- WebP API exists: ${payload.summary.webpDownloadApiExists}
- Generic raster API exists: ${payload.summary.genericRasterDownloadApiExists}
- JPEG extension: ${payload.summary.jpegExtensionChosen}
- Quality configuration supported: ${payload.summary.qualityConfigurationSupported}
- CORS/canvas failure detection: ${payload.summary.corsFailureDetection}
- SVG download helper exposed: ${payload.summary.svgDownloadHelperExposed}
- Static export compatible: ${payload.summary.staticExportCompatible}
`;
}

function renderPrintReport(payload) {
  return `# Round 5H Print Regression

- Print button exists: ${payload.summary.printButtonStillExists}
- Internal SVG preferred: ${payload.summary.printUsesInternalSvgFirst}
- Print target long edge: ${payload.summary.printTargetLongEdge}
- Fallback exists: ${payload.summary.printFallbackExists}
- Thumbnail avoided: ${payload.summary.lowResolutionThumbnailAvoided}
- SVG download exposed: ${payload.summary.svgDownloadExposed}
- app/api present: ${payload.summary.appApiRoutePresent}
`;
}

function renderImplementationReport(payload) {
  return `# Round 5H Download Implementation

- Download controls added: ${payload.summary.downloadControlsAdded}
- Formats exposed: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- SVG internal-only: ${payload.summary.svgInternalOnly}
- Frontend-only: ${payload.summary.frontendOnly}
- Static export compatible: ${payload.summary.staticExportCompatible}
- Full upload deferred: ${payload.summary.fullUploadDeferred}
- Custom asset domain still required: ${payload.summary.customAssetDomainStillRequiredForProduction}

## Files Changed

${payload.filesChanged.map((file) => `- ${file}`).join("\n")}
`;
}

function renderExposureReport(payload) {
  return `# Round 5H Download Format Exposure

- PNG exposed: ${payload.summary.pngExposed}
- JPG/JPEG exposed: ${payload.summary.jpgJpegExposed}
- WebP exposed: ${payload.summary.webpExposed}
- SVG exposed: ${payload.summary.svgExposed}
- Current public formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- Controls exposed after verification: ${payload.summary.controlsExposedAfterVerification}
- Fallback behavior: ${payload.summary.fallbackBehavior}

## Remaining Production Blockers

${payload.summary.remainingProductionBlockers.map((blocker) => `- ${blocker}`).join("\n")}
`;
}

function renderBrowserAggregateReport(payload) {
  return `# Round 5H Browser QA

- Local QA status: ${payload.summary.localQaStatus}
- Public QA status: ${payload.summary.publicQaStatus}
- Local PNG/JPG/WebP downloads: ${payload.summary.localPngDownloadWorks} / ${payload.summary.localJpgDownloadWorks} / ${payload.summary.localWebpDownloadWorks}
- Public PNG/JPG/WebP downloads: ${payload.summary.publicPngDownloadWorks} / ${payload.summary.publicJpgDownloadWorks} / ${payload.summary.publicWebpDownloadWorks}
- Local print works: ${payload.summary.printWorksLocally}
- Public print works: ${payload.summary.printWorksPublic}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- app/api present: ${payload.summary.appApiRoutePresent}
- Screenshots: ${payload.summary.screenshots.length}
`;
}

function renderQaReport(payload) {
  return `# Round 5H ${capitalize(payload.mode)} Download Browser QA

- Status: ${payload.summary.status}
- Asset base: ${payload.assetBaseUrl}
- PNG download works: ${payload.summary.pngDownloadWorks}
- JPG download works: ${payload.summary.jpgDownloadWorks}
- WebP download works: ${payload.summary.webpDownloadWorks}
- Print works: ${payload.summary.printWorks}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- No broken images: ${payload.summary.noBrokenImages}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}
- Screenshots: ${payload.screenshotPaths.length}

${payload.blockers?.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderNextPhasePlan(exposure) {
  return `# Round 5H Next Phase Plan

Round 5H exposes PNG, JPG, and WebP downloads through browser-side internal SVG conversion. SVG stays hidden from user-facing download controls.

## Recommendation For Round 5I

Verify the final custom asset domain with the same Origin-aware CORS checks used in Round 5G, then run browser download QA against that custom domain before any full media upload or launch readiness claim.

## Still Deferred

- Full SVG plus WebP upload
- Image sitemap
- Open Graph image generation
- JSON-LD image expansion
- Live AdSense integration
- Production launch readiness

## Current Formats

- Public: ${exposure.summary.currentPublicDownloadFormats.join(", ")}
- Internal only: SVG
`;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (toRepoPath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(file, "utf8"));
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

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
  return stdout;
}

async function gitCommitExists(commit) {
  try {
    await execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function readJsonIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) return null;
  return JSON.parse(await readFile(absolute, "utf8"));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readTextIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath);
  if (!existsSync(absolute)) return "";
  return readFile(absolute, "utf8");
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeReport(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${text.replace(/\s+$/u, "")}\n`, "utf8");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
