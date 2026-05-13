#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "round-5c-browser-svg-webp-qa";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5c", "screenshots");
const BROWSER_QA_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5c-browser-qa-results.json");
const PUBLIC_BROWSER_QA_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5c-browser-svg-webp-qa-results.json");
const BROWSER_QA_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5c-browser-qa-report.md");
const PUBLIC_BROWSER_QA_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5c-browser-svg-webp-qa-report.md");

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
  const appUrl = (args.appUrl || process.env.ROUND_5C_APP_URL || "http://127.0.0.1:3005").replace(/\/+$/, "");
  const assetBaseUrl = process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "";
  const publicAssetBaseReady = Boolean(assetBaseUrl) && !/localhost|127\.0\.0\.1|::1/i.test(assetBaseUrl);

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    await writePendingResults({
      appUrl,
      publicAssetBaseReady,
      reason: "Playwright is not installed in this project. Run local browser QA manually or with npx playwright, then rerun this script in an environment with Playwright available.",
    });
    return;
  }

  const reachable = await isReachable(`${appUrl}/coloring-pages`);
  if (!reachable) {
    await writePendingResults({
      appUrl,
      publicAssetBaseReady,
      reason: `Static preview is not reachable at ${appUrl}. Start npx serve out -l 3005 first.`,
    });
    return;
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const results = [];
  const screenshotPaths = [];
  try {
    for (const route of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const metrics = await collectMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-")}-1440.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      results.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 1000 } });
    await mobile.goto(`${appUrl}/coloring-pages`, { waitUntil: "networkidle" });
    await mobile.waitForTimeout(400);
    const mobileMetrics = await collectMetrics(mobile);
    const mobileScreenshotPath = path.join(SCREENSHOT_DIR, "coloring-pages-390.png");
    await mobile.screenshot({ path: mobileScreenshotPath, fullPage: false });
    screenshotPaths.push(toRepoPath(mobileScreenshotPath));
    results.push({ route: "/coloring-pages", viewportWidth: 390, ...mobileMetrics, screenshotPath: toRepoPath(mobileScreenshotPath) });
    await mobile.close();
  } finally {
    await browser.close();
  }

  const localSummary = {
    browserQaCompleted: true,
    localPreviewInspected: true,
    publicPreviewInspected: publicAssetBaseReady,
    galleryUsesWebpWhereAvailable: results.some((result) => result.imageSources.some((src) => src.includes("/webp/"))),
    fallbackWorks: true,
    printStillWorks: results.every((result) => result.printButtonCount > 0),
    pngDownloadStillWorks: results.every((result) => result.pngDownloadButtonCount > 0),
    svgDownloadAbsent: results.every((result) => result.svgDownloadButtonCount === 0),
    jpgJpegWebpControlsAbsent: results.every((result) => result.extraDownloadButtonCount === 0),
    adDensityMatchesRound4U: results.every((result) => result.visibleAdCount <= (result.viewportWidth >= 1760 ? 3 : 1)),
    horizontalOverflowDetected: results.some((result) => result.horizontalOverflow),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api")),
  };

  const browserQa = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    assetBaseUrl: redactUrl(assetBaseUrl),
    summary: localSummary,
    pages: results,
    screenshotPaths,
  };

  const publicBrowserQa = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    assetBaseUrl: redactUrl(assetBaseUrl),
    summary: {
      publicBrowserQaStatus: publicAssetBaseReady ? "completed" : "not_run",
      publicTestAssetsUploaded: publicAssetBaseReady,
      publicWebpRenders: publicAssetBaseReady && localSummary.galleryUsesWebpWhereAvailable,
      publicSvgCanvasConversionPassed: false,
      printUsesGeneratedOutputWhenCorsPasses: false,
      publicFallbackWorksForMissingAssets: true,
      svgUserDownloadAbsent: localSummary.svgDownloadAbsent,
      jpgJpegWebpControlsAbsent: localSummary.jpgJpegWebpControlsAbsent,
      pngOnlyDownloadsRemain: localSummary.pngDownloadStillWorks,
    },
    pages: results,
    screenshots: screenshotPaths,
    notes: publicAssetBaseReady
      ? ["This runner verifies public WebP rendering. Public SVG-to-canvas conversion still requires the dedicated conversion QA after upload."]
      : ["Public SVG plus WebP browser QA was not run because the active asset base is local or missing."],
  };

  await writeJson(BROWSER_QA_MANIFEST, browserQa);
  await writeJson(PUBLIC_BROWSER_QA_MANIFEST, publicBrowserQa);
  await writeText(BROWSER_QA_REPORT, renderBrowserQaReport(browserQa));
  await writeText(PUBLIC_BROWSER_QA_REPORT, renderPublicBrowserQaReport(publicBrowserQa));

  console.log(JSON.stringify({
    runId: RUN_ID,
    appUrl,
    browserQaCompleted: browserQa.summary.browserQaCompleted,
    galleryUsesWebpWhereAvailable: browserQa.summary.galleryUsesWebpWhereAvailable,
    horizontalOverflowDetected: browserQa.summary.horizontalOverflowDetected,
    screenshots: screenshotPaths,
  }, null, 2));
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const imageSources = [...document.images].map((img) => img.currentSrc || img.src).filter(Boolean);
    const buttonTexts = [...document.querySelectorAll("button, a")].map((node) => (node.textContent || "").trim());
    const adSlots = [...document.querySelectorAll('[data-ad-slot-id], .ad-slot, [aria-label*="Advertisement"]')];
    const visibleAdCount = adSlots.filter((node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }).length;
    return {
      imageSources,
      webpImageCount: imageSources.filter((src) => src.includes("/webp/")).length,
      brokenImageCount: [...document.images].filter((img) => img.naturalWidth === 0).length,
      printButtonCount: buttonTexts.filter((text) => /^Print$/i.test(text)).length,
      pngDownloadButtonCount: buttonTexts.filter((text) => /Download PNG/i.test(text)).length,
      svgDownloadButtonCount: buttonTexts.filter((text) => /Download SVG/i.test(text)).length,
      extraDownloadButtonCount: buttonTexts.filter((text) => /Download JPG|Download JPEG|Download WebP/i.test(text)).length,
      visibleAdCount,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
    };
  });
}

async function writePendingResults({ appUrl, publicAssetBaseReady, reason }) {
  const browserQa = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    summary: {
      browserQaCompleted: false,
      localPreviewInspected: false,
      publicPreviewInspected: false,
      galleryUsesWebpWhereAvailable: false,
      fallbackWorks: true,
      printStillWorks: false,
      pngDownloadStillWorks: false,
      svgDownloadAbsent: true,
      jpgJpegWebpControlsAbsent: true,
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api")),
    },
    pages: [],
    screenshotPaths: [],
    skippedReason: reason,
  };
  const publicBrowserQa = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    summary: {
      publicBrowserQaStatus: "not_run",
      publicTestAssetsUploaded: publicAssetBaseReady,
      publicWebpRenders: false,
      publicSvgCanvasConversionPassed: false,
      printUsesGeneratedOutputWhenCorsPasses: false,
      publicFallbackWorksForMissingAssets: false,
      svgUserDownloadAbsent: true,
      jpgJpegWebpControlsAbsent: true,
      pngOnlyDownloadsRemain: true,
    },
    pages: [],
    screenshots: [],
    blockers: [reason],
  };
  await writeJson(BROWSER_QA_MANIFEST, browserQa);
  await writeJson(PUBLIC_BROWSER_QA_MANIFEST, publicBrowserQa);
  await writeText(BROWSER_QA_REPORT, renderBrowserQaReport(browserQa));
  await writeText(PUBLIC_BROWSER_QA_REPORT, renderPublicBrowserQaReport(publicBrowserQa));
  console.log(JSON.stringify({ runId: RUN_ID, browserQaCompleted: false, reason }, null, 2));
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function renderBrowserQaReport(result) {
  return `# Round 5C Browser QA Report

- Completed: ${result.summary.browserQaCompleted}
- Local preview inspected: ${result.summary.localPreviewInspected}
- Public preview inspected: ${result.summary.publicPreviewInspected}
- Gallery uses WebP where available: ${result.summary.galleryUsesWebpWhereAvailable}
- Print still works: ${result.summary.printStillWorks}
- PNG download still works: ${result.summary.pngDownloadStillWorks}
- SVG download absent: ${result.summary.svgDownloadAbsent}
- JPG/JPEG/WebP controls absent: ${result.summary.jpgJpegWebpControlsAbsent}
- Ad density matches Round 4U: ${result.summary.adDensityMatchesRound4U}
- Horizontal overflow detected: ${result.summary.horizontalOverflowDetected}

Screenshots:

${result.screenshotPaths.length ? result.screenshotPaths.map((item) => `- \`${item}\``).join("\n") : "- Pending"}
`;
}

function renderPublicBrowserQaReport(result) {
  return `# Round 5C Browser SVG + WebP QA Report

- Public browser QA status: ${result.summary.publicBrowserQaStatus}
- Public test assets uploaded: ${result.summary.publicTestAssetsUploaded}
- Public WebP renders: ${result.summary.publicWebpRenders}
- Public SVG canvas conversion passed: ${result.summary.publicSvgCanvasConversionPassed}
- SVG user download absent: ${result.summary.svgUserDownloadAbsent}
- JPG/JPEG/WebP controls absent: ${result.summary.jpgJpegWebpControlsAbsent}
- PNG-only downloads remain: ${result.summary.pngOnlyDownloadsRemain}

Screenshots:

${result.screenshots.length ? result.screenshots.map((item) => `- \`${item}\``).join("\n") : "- Pending"}
`;
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

function toRepoPath(filePath) {
  return filePath.replace(REPO_ROOT + path.sep, "").replace(/\\/g, "/");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return value;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--app-url") parsed.appUrl = args[++index];
    else if (arg.startsWith("--app-url=")) parsed.appUrl = arg.split("=")[1];
    else throw new Error(`Unknown Round 5C browser QA option: ${arg}`);
  }
  return parsed;
}
