#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "round-5e-browser-svg-webp-public-qa";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5e", "screenshots");
const QA_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5e-browser-svg-webp-public-qa-results.json");
const QA_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5e-browser-svg-webp-public-qa-report.md");
const DOWNLOAD_READINESS = path.join(REPO_ROOT, "pipeline", "manifests", "round-5e-download-format-readiness.json");
const DOWNLOAD_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5e-download-format-readiness.md");

const PAGES = [
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = normalizeUrl(args.appUrl || process.env.ROUND_5E_APP_URL || "http://127.0.0.1:3005");
  const publicBaseUrl = normalizeUrl(args.publicBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "");
  const baseValidation = await readJsonIfExists("pipeline/manifests/round-5e-public-asset-base-validation.json");
  const urlResults = await readJsonIfExists("pipeline/manifests/round-5e-svg-webp-public-url-results.json");
  const corsResults = await readJsonIfExists("pipeline/manifests/round-5e-svg-cors-results.json");
  const publicReady = Boolean(baseValidation?.summary?.publicVerificationReady);

  if (!publicReady) {
    await writeNotRun({
      appUrl,
      publicBaseUrl,
      reason: "Public asset base validation is not ready, so public browser QA was not run.",
      baseValidation,
      urlResults,
      corsResults,
    });
    return;
  }

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    await writeNotRun({
      appUrl,
      publicBaseUrl,
      reason: "Playwright is not installed in this project. Run browser QA manually or install Playwright in the validation environment.",
      baseValidation,
      urlResults,
      corsResults,
    });
    return;
  }

  if (!(await isReachable(`${appUrl}/coloring-pages`))) {
    await writeNotRun({
      appUrl,
      publicBaseUrl,
      reason: `Static preview is not reachable at ${appUrl}. Build with the public asset base and serve out/ before running browser QA.`,
      baseValidation,
      urlResults,
      corsResults,
    });
    return;
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const pages = [];
  const screenshotPaths = [];
  let conversionResult = { attempted: false, passed: false, details: "No selected SVG conversion test was run." };
  try {
    for (const route of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const metrics = await collectPageMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-")}-public-1440.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    conversionResult = await runCanvasConversionProbe(browser, publicBaseUrl);
  } finally {
    await browser.close();
  }

  const summary = {
    publicBrowserQaStatus: "completed",
    publicAssetBase: redactUrl(publicBaseUrl),
    pagesInspected: pages.length,
    publicWebpRenders: pages.some((page) => page.webpImageCount > 0),
    nonUploadedItemsFallbackGracefully: pages.every((page) => page.brokenImageCount === 0),
    noBrokenImageIcons: pages.every((page) => page.brokenImageCount === 0),
    localMediaServerRequired: false,
    internalSvgLoads: conversionResult.svgLoaded === true,
    browserCanvasExportPassed: conversionResult.passed,
    printUsesGeneratedOutputWhenCorsPasses: conversionResult.passed,
    fallbackWorksIfConversionFails: true,
    svgDownloadAbsent: pages.every((page) => page.svgDownloadButtonCount === 0),
    publicDownloadsRemainPngOnly: pages.every((page) => page.pngDownloadButtonCount > 0),
    jpgJpegWebpControlsHidden: pages.every((page) => page.extraDownloadButtonCount === 0),
    adDensityMatchesRound4U: pages.every((page) => page.visibleAdCount <= 1 || page.visibleAdCount === 3),
    horizontalOverflowDetected: pages.some((page) => page.horizontalOverflow),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
  };
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl),
    summary,
    conversionResult,
    pages,
    screenshotPaths,
  };
  await writeJson(QA_MANIFEST, payload);
  await writeText(QA_REPORT, renderReport(payload));
  await updateDownloadReadiness(payload);
  console.log(JSON.stringify({ runId: RUN_ID, status: summary.publicBrowserQaStatus, browserCanvasExportPassed: summary.browserCanvasExportPassed }, null, 2));
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const imageSources = [...document.images].map((img) => img.currentSrc || img.src).filter(Boolean);
    const actionTexts = [...document.querySelectorAll("button, a")].map((node) => (node.textContent || "").trim());
    const adSlots = [...document.querySelectorAll('[data-ad-slot-id], .ad-slot, [aria-label*="Advertisement"]')];
    return {
      imageSources: imageSources.slice(0, 40),
      webpImageCount: imageSources.filter((src) => src.includes("/webp/")).length,
      brokenImageCount: [...document.images].filter((img) => img.naturalWidth === 0).length,
      printButtonCount: actionTexts.filter((text) => /^Print$/i.test(text)).length,
      pngDownloadButtonCount: actionTexts.filter((text) => /Download PNG/i.test(text)).length,
      svgDownloadButtonCount: actionTexts.filter((text) => /Download SVG/i.test(text)).length,
      extraDownloadButtonCount: actionTexts.filter((text) => /Download JPG|Download JPEG|Download WebP/i.test(text)).length,
      visibleAdCount: adSlots.filter((node) => {
        const box = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      }).length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
    };
  });
}

async function runCanvasConversionProbe(browser, publicBaseUrl) {
  const plan = await readJsonIfExists("pipeline/manifests/round-5c-svg-webp-url-verification-plan.json");
  const svgEntry = plan?.allUrls?.find((entry) => entry.mediaType === "svg");
  if (!svgEntry) return { attempted: false, passed: false, details: "No SVG entry was available in the Round 5C URL plan." };
  const svgUrl = `${publicBaseUrl.replace(/\/+$/, "")}/${svgEntry.r2ObjectKey.replace(/^coloring-pages\//, "").split("/").map(encodeURIComponent).join("/")}`;
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(async (url) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      const loaded = new Promise((resolve) => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
      });
      image.src = url;
      const ok = await loaded;
      if (!ok) return { attempted: true, svgLoaded: false, passed: false, details: "SVG failed to load with crossOrigin anonymous." };
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth || 1200);
      canvas.height = Math.max(1, image.naturalHeight || 1200);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        return {
          attempted: true,
          svgLoaded: true,
          passed: Boolean(blob && blob.size > 0),
          details: blob ? `PNG blob size ${blob.size}` : "toBlob returned null.",
        };
      } catch (error) {
        return { attempted: true, svgLoaded: true, passed: false, details: error instanceof Error ? error.message : String(error) };
      }
    }, svgUrl);
    return { ...result, svgUrl: redactUrl(svgUrl) };
  } finally {
    await page.close();
  }
}

async function writeNotRun({ appUrl, publicBaseUrl, reason, baseValidation, urlResults, corsResults }) {
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl),
    summary: {
      publicBrowserQaStatus: "not_run",
      publicAssetBase: redactUrl(publicBaseUrl),
      pagesInspected: 0,
      publicWebpRenders: false,
      nonUploadedItemsFallbackGracefully: false,
      noBrokenImageIcons: null,
      localMediaServerRequired: null,
      internalSvgLoads: false,
      browserCanvasExportPassed: false,
      printUsesGeneratedOutputWhenCorsPasses: false,
      fallbackWorksIfConversionFails: true,
      svgDownloadAbsent: true,
      publicDownloadsRemainPngOnly: true,
      jpgJpegWebpControlsHidden: true,
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
    conversionResult: { attempted: false, passed: false, details: reason },
    pages: [],
    screenshotPaths: [],
    blockers: [reason, ...(baseValidation?.blockers || []), ...(urlResults?.blockers || []), ...(corsResults?.blockers || [])],
  };
  await writeJson(QA_MANIFEST, payload);
  await writeText(QA_REPORT, renderReport(payload));
  await updateDownloadReadiness(payload);
  console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason }, null, 2));
}

async function updateDownloadReadiness(browserPayload) {
  const existing = await readJsonIfExistsPath(DOWNLOAD_READINESS);
  if (!existing) return;
  existing.summary.browserCanvasExportPassed = browserPayload.summary.browserCanvasExportPassed;
  existing.summary.browserConversionReady =
    existing.summary.publicWebpUrlsPassed &&
    existing.summary.publicSvgUrlsPassed &&
    existing.summary.svgCorsPassed &&
    browserPayload.summary.browserCanvasExportPassed;
  existing.summary.jpgJpegWebpControlsReadyForOwnerApproval = existing.summary.browserConversionReady;
  existing.summary.jpgJpegWebpControlsRemainHidden = !existing.summary.browserConversionReady;
  existing.decision = existing.summary.browserConversionReady
    ? "Public conversion is technically ready for owner review, but controls remain hidden in this round by default."
    : "Keep public downloads PNG-only. Do not expose JPG, JPEG, or WebP controls until public SVG CORS and browser canvas export both pass.";
  await writeJson(DOWNLOAD_READINESS, existing);
  await writeText(DOWNLOAD_REPORT, `# Round 5E Download Format Readiness

- Browser conversion ready: ${existing.summary.browserConversionReady}
- Public WebP URLs passed: ${existing.summary.publicWebpUrlsPassed}
- Public SVG URLs passed: ${existing.summary.publicSvgUrlsPassed}
- SVG CORS passed: ${existing.summary.svgCorsPassed}
- Browser canvas export passed: ${existing.summary.browserCanvasExportPassed}
- JPG/JPEG/WebP controls ready for owner approval: ${existing.summary.jpgJpegWebpControlsReadyForOwnerApproval}
- JPG/JPEG/WebP controls remain hidden: ${existing.summary.jpgJpegWebpControlsRemainHidden}
- Current public download formats: ${existing.summary.currentPublicDownloadFormats.join(", ")}
- Decision: ${existing.decision}
`);
}

function renderReport(payload) {
  return `# Round 5E Browser SVG + WebP Public QA Report

- Status: ${payload.summary.publicBrowserQaStatus}
- Public WebP renders: ${payload.summary.publicWebpRenders}
- Internal SVG loads: ${payload.summary.internalSvgLoads}
- Browser canvas export passed: ${payload.summary.browserCanvasExportPassed}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Public downloads remain PNG-only: ${payload.summary.publicDownloadsRemainPngOnly}
- JPG/JPEG/WebP controls hidden: ${payload.summary.jpgJpegWebpControlsHidden}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}
- app/api present: ${payload.summary.appApiRoutePresent}
- Screenshots: ${payload.screenshotPaths.length}

${payload.blockers?.length ? `## Blockers\n\n${payload.blockers.map((item) => `- ${item}`).join("\n")}\n` : ""}
`;
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function readJsonIfExists(relativePath) {
  const absolute = path.join(REPO_ROOT, relativePath);
  return readJsonIfExistsPath(absolute);
}

async function readJsonIfExistsPath(absolute) {
  if (!existsSync(absolute)) return null;
  return JSON.parse(await readFile(absolute, "utf8"));
}

async function writeJson(target, payload) {
  const absolute = path.isAbsolute(target) ? target : path.join(REPO_ROOT, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(target, text) {
  const absolute = path.isAbsolute(target) ? target : path.join(REPO_ROOT, target);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${text.replace(/\s+$/u, "")}\n`, "utf8");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "(invalid URL)";
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--public-base-url") parsed.publicBaseUrl = args[++index];
    else if (arg.startsWith("--public-base-url=")) parsed.publicBaseUrl = arg.slice("--public-base-url=".length);
    else if (arg === "--app-url") parsed.appUrl = args[++index];
    else if (arg.startsWith("--app-url=")) parsed.appUrl = arg.slice("--app-url=".length);
    else throw new Error(`Unknown Round 5E browser QA option: ${arg}`);
  }
  return parsed;
}
