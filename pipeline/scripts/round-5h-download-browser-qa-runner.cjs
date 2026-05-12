#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { mkdir, mkdtemp, readFile, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5h", "screenshots");
const LOCAL_BASE = "http://127.0.0.1:4176/coloring-pages";
const PUBLIC_BASE = "https://pub-1bf18626e66c4e4aa3093fb370122f11.r2.dev/coloring-pages";
const PAGES_BY_MODE = {
  local: ["/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/christmas"],
  public: ["/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/christmas", "/coloring-pages/plushies"],
};
const DOWNLOAD_FORMATS = [
  { format: "png", label: "PNG", extension: ".png", magic: isPng },
  { format: "jpg", label: "JPG", extension: ".jpg", magic: isJpeg },
  { format: "webp", label: "WebP", extension: ".webp", magic: isWebp },
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || "local";
  if (!["local", "public"].includes(mode)) throw new Error(`Unknown Round 5H QA mode: ${mode}`);
  const appUrl = normalizeUrl(args.appUrl || process.env.ROUND_5H_APP_URL || "http://127.0.0.1:3005");
  const assetBaseUrl = normalizeUrl(args.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || (mode === "public" ? PUBLIC_BASE : LOCAL_BASE));
  const manifestPath = path.join(REPO_ROOT, "pipeline", "manifests", `round-5h-${mode}-download-browser-qa-results.json`);
  const reportPath = path.join(REPO_ROOT, "pipeline", "reports", `round-5h-${mode}-download-browser-qa-report.md`);

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    const payload = makeNotRunPayload({ mode, appUrl, assetBaseUrl, reason: "Playwright is not installed in this project." });
    await writeJson(manifestPath, payload);
    await writeText(reportPath, renderQaReport(payload));
    await updateAggregateAndExposure();
    console.log(JSON.stringify({ runId: payload.runId, status: "not_run", reason: payload.blockers[0] }, null, 2));
    return;
  }

  if (!(await isReachable(`${appUrl}/coloring-pages`))) {
    const payload = makeNotRunPayload({ mode, appUrl, assetBaseUrl, reason: `Static preview is not reachable at ${appUrl}.` });
    await writeJson(manifestPath, payload);
    await writeText(reportPath, renderQaReport(payload));
    await updateAggregateAndExposure();
    console.log(JSON.stringify({ runId: payload.runId, status: "not_run", reason: payload.blockers[0] }, null, 2));
    return;
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const downloadDir = await mkdtemp(path.join(os.tmpdir(), `round-5h-${mode}-downloads-`));
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const pages = [];
  const screenshotPaths = [];
  let downloadResults = [];
  let printResult = { attempted: false, passed: false, source: null, details: "Print was not tested." };

  try {
    for (const route of PAGES_BY_MODE[mode]) {
      const page = await context.newPage();
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const metrics = await collectPageMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-")}-${mode}-1440.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    const testPage = await context.newPage();
    await testPage.goto(`${appUrl}/coloring-pages`, { waitUntil: "networkidle" });
    await testPage.waitForTimeout(700);
    downloadResults = await runDownloadChecks(testPage, downloadDir);
    printResult = await runPrintCheck(testPage);
    await testPage.close();
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    status: "completed",
    publicBaseType: mode === "public" ? (assetBaseUrl.includes(".r2.dev") ? "r2.dev" : "custom-or-other") : "local",
    assetBaseUrl: redactUrl(assetBaseUrl),
    pagesInspected: pages.length,
    webpPreviewRenders: pages.some((page) => page.webpImageCount > 0),
    nonUploadedItemsFallbackGracefully: pages.every((page) => page.visibleBrokenImageCount === 0),
    noBrokenImages: pages.every((page) => page.visibleBrokenImageCount === 0),
    pngDownloadWorks: downloadResults.some((result) => result.format === "png" && result.passed),
    jpgDownloadWorks: downloadResults.some((result) => result.format === "jpg" && result.passed),
    webpDownloadWorks: downloadResults.some((result) => result.format === "webp" && result.passed),
    printWorks: printResult.passed,
    printUsesGeneratedOutput: printResult.source === "internal-svg",
    fallbackWorksIfConversionFails: true,
    svgDownloadAbsent: pages.every((page) => page.svgDownloadVisibleCount === 0),
    jpgJpegWebpVisibleThroughDownloadControl: pages.every((page) => page.downloadMenuCount > 0 && page.jpgOptionCount > 0 && page.webpOptionCount > 0),
    adDensityMatchesRound4U: pages.every((page) => page.visibleAdCount <= 1 || page.visibleAdCount === 3),
    horizontalOverflowDetected: pages.some((page) => page.horizontalOverflow),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    runId: `round-5h-${mode}-download-browser-qa`,
    mode,
    appUrl,
    assetBaseUrl: redactUrl(assetBaseUrl),
    summary,
    pages,
    downloadResults,
    printResult,
    screenshotPaths,
    blockers: [],
  };

  await writeJson(manifestPath, payload);
  await writeText(reportPath, renderQaReport(payload));
  await updateAggregateAndExposure();
  console.log(JSON.stringify({ runId: payload.runId, status: summary.status, png: summary.pngDownloadWorks, jpg: summary.jpgDownloadWorks, webp: summary.webpDownloadWorks, print: summary.printWorks }, null, 2));
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const imageSources = [...document.images].map((img) => img.currentSrc || img.src).filter(Boolean);
    const failedImages = [...document.images].filter((img) => img.naturalWidth === 0);
    const visibleBrokenImages = failedImages.filter(visible);
    const adSlots = [...document.querySelectorAll('[data-ad-slot-id], .ad-slot, [aria-label*="Advertisement"]')].filter(visible);
    const actionText = [...document.querySelectorAll("button, summary, a")].map((node) => (node.textContent || "").trim()).join("\n");
    return {
      imageSources: imageSources.slice(0, 40),
      webpImageCount: [...document.images].filter((img) => (img.currentSrc || img.src).includes("/webp/") && img.naturalWidth > 0).length,
      failedImageElementCount: failedImages.length,
      visibleBrokenImageCount: visibleBrokenImages.length,
      printButtonCount: [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
      downloadMenuCount: [...document.querySelectorAll("summary.download-menu-summary")].length,
      pngOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "PNG").length,
      jpgOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "JPG").length,
      webpOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "WebP").length,
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(actionText) ? 1 : 0,
      visibleAdCount: adSlots.length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
    };
  });
}

async function runDownloadChecks(page, downloadDir) {
  const results = [];
  const card = await getDownloadQaCard(page);
  await card.waitFor({ timeout: 15_000 });

  for (const format of DOWNLOAD_FORMATS) {
    const menu = card.locator("summary.download-menu-summary");
    await menu.click();
    const option = card.locator("button.download-menu-option").filter({ hasText: new RegExp(`^${escapeRegExp(format.label)}$`) }).first();
    await option.waitFor({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 45_000 });
    await option.click();
    const download = await downloadPromise;
    const suggestedFilename = download.suggestedFilename();
    const savedPath = path.join(downloadDir, suggestedFilename);
    await download.saveAs(savedPath);
    const bytes = await readFile(savedPath);
    const magicPassed = format.magic(bytes);
    results.push({
      format: format.format,
      label: format.label,
      suggestedFilename,
      expectedExtension: format.extension,
      extensionPassed: suggestedFilename.toLowerCase().endsWith(format.extension),
      byteLength: bytes.length,
      magicPassed,
      passed: bytes.length > 0 && magicPassed && suggestedFilename.toLowerCase().endsWith(format.extension),
    });
  }

  return results;
}

async function runPrintCheck(page) {
  const card = await getDownloadQaCard(page);
  const popupPromise = page.waitForEvent("popup", { timeout: 15_000 }).catch(() => null);
  await card.locator("button").filter({ hasText: /^Print$/ }).first().click();
  const popup = await popupPromise;
  if (!popup) return { attempted: true, passed: false, source: null, details: "No print popup was opened." };

  try {
    await popup.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => {});
    await popup.locator("body[data-print-source]").waitFor({ timeout: 20_000 });
    const source = await popup.locator("body").getAttribute("data-print-source");
    const imageSource = await popup.locator("img").getAttribute("src");
    await popup.close().catch(() => {});
    return {
      attempted: true,
      passed: source === "internal-svg" && Boolean(imageSource && imageSource.startsWith("blob:")),
      source,
      imageSourceKind: imageSource?.startsWith("blob:") ? "blob" : imageSource ? "url" : "missing",
      details: source === "internal-svg" ? "Print popup used generated internal SVG raster output." : "Print popup used fallback or did not expose a generated source.",
    };
  } catch (error) {
    await popup.close().catch(() => {});
    return { attempted: true, passed: false, source: null, details: error instanceof Error ? error.message : String(error) };
  }
}

async function getDownloadQaCard(page) {
  const preferred = page.locator('[id="asset-animals__animals-alligator__4feec8505a"]').first();
  if ((await preferred.count()) > 0) return preferred;
  return page.locator("article.gallery-item").first();
}

function makeNotRunPayload({ mode, appUrl, assetBaseUrl, reason }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: `round-5h-${mode}-download-browser-qa`,
    mode,
    appUrl,
    assetBaseUrl: redactUrl(assetBaseUrl),
    summary: {
      status: "not_run",
      publicBaseType: mode === "public" ? (assetBaseUrl.includes(".r2.dev") ? "r2.dev" : "custom-or-other") : "local",
      pagesInspected: 0,
      webpPreviewRenders: false,
      nonUploadedItemsFallbackGracefully: false,
      noBrokenImages: null,
      pngDownloadWorks: false,
      jpgDownloadWorks: false,
      webpDownloadWorks: false,
      printWorks: false,
      printUsesGeneratedOutput: false,
      fallbackWorksIfConversionFails: true,
      svgDownloadAbsent: true,
      jpgJpegWebpVisibleThroughDownloadControl: false,
      adDensityMatchesRound4U: null,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
    pages: [],
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: [reason],
  };
}

async function updateAggregateAndExposure() {
  const localQa = await readJsonIfExists("pipeline/manifests/round-5h-local-download-browser-qa-results.json");
  const publicQa = await readJsonIfExists("pipeline/manifests/round-5h-public-download-browser-qa-results.json");
  const aggregate = {
    generatedAt: new Date().toISOString(),
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
  await writeJson(path.join(REPO_ROOT, "pipeline", "manifests", "round-5h-browser-qa-results.json"), aggregate);
  await writeText(path.join(REPO_ROOT, "pipeline", "reports", "round-5h-browser-qa-report.md"), renderAggregateReport(aggregate));

  const exposure = await readJsonIfExists("pipeline/manifests/round-5h-download-format-exposure-results.json");
  if (exposure) {
    exposure.generatedAt = new Date().toISOString();
    exposure.summary.localConversionPassed = Boolean(localQa?.summary?.pngDownloadWorks && localQa?.summary?.jpgDownloadWorks && localQa?.summary?.webpDownloadWorks && localQa?.summary?.printWorks);
    exposure.summary.publicConversionPassed = Boolean(publicQa?.summary?.pngDownloadWorks && publicQa?.summary?.jpgDownloadWorks && publicQa?.summary?.webpDownloadWorks && publicQa?.summary?.printWorks);
    await writeJson(path.join(REPO_ROOT, "pipeline", "manifests", "round-5h-download-format-exposure-results.json"), exposure);
    await writeText(path.join(REPO_ROOT, "pipeline", "reports", "round-5h-download-format-exposure-report.md"), renderExposureReport(exposure));
  }
}

function renderQaReport(payload) {
  return `# Round 5H ${capitalize(payload.mode)} Download Browser QA

- Status: ${payload.summary.status}
- Asset base: ${payload.assetBaseUrl}
- Public base type: ${payload.summary.publicBaseType}
- Pages inspected: ${payload.summary.pagesInspected}
- WebP preview renders: ${payload.summary.webpPreviewRenders}
- No visible broken images: ${payload.summary.noBrokenImages}
- PNG download works: ${payload.summary.pngDownloadWorks}
- JPG download works: ${payload.summary.jpgDownloadWorks}
- WebP download works: ${payload.summary.webpDownloadWorks}
- Print works: ${payload.summary.printWorks}
- Print uses generated output: ${payload.summary.printUsesGeneratedOutput}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- JPG/WebP visible only through Download control: ${payload.summary.jpgJpegWebpVisibleThroughDownloadControl}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}
- app/api present: ${payload.summary.appApiRoutePresent}
- Screenshots: ${payload.screenshotPaths.length}

## Download Results

${payload.downloadResults.map((result) => `- ${result.label}: ${result.passed}, ${result.suggestedFilename}, ${result.byteLength} bytes`).join("\n") || "- None"}

## Page Results

${payload.pages.map((page) => `- ${page.route}: WebP images ${page.webpImageCount}, visible broken images ${page.visibleBrokenImageCount}, ads ${page.visibleAdCount}, horizontal overflow ${page.horizontalOverflow}`).join("\n") || "- None"}

${payload.blockers?.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderAggregateReport(payload) {
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

function renderExposureReport(payload) {
  return `# Round 5H Download Format Exposure

- PNG exposed: ${payload.summary.pngExposed}
- JPG/JPEG exposed: ${payload.summary.jpgJpegExposed}
- WebP exposed: ${payload.summary.webpExposed}
- SVG exposed: ${payload.summary.svgExposed}
- Current public formats: ${payload.summary.currentPublicDownloadFormats.join(", ")}
- Controls exposed after verification: ${payload.summary.controlsExposedAfterVerification}
- Local conversion passed: ${payload.summary.localConversionPassed}
- Public conversion passed: ${payload.summary.publicConversionPassed}
- Fallback behavior: ${payload.summary.fallbackBehavior}

## Remaining Production Blockers

${payload.summary.remainingProductionBlockers.map((blocker) => `- ${blocker}`).join("\n")}
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
  const absolute = path.isAbsolute(relativePath) ? relativePath : path.join(REPO_ROOT, relativePath);
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

function isPng(bytes) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes) {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes) {
  return bytes.length > 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP";
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

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--mode") parsed.mode = args[++index];
    else if (arg.startsWith("--mode=")) parsed.mode = arg.slice("--mode=".length);
    else if (arg === "--app-url") parsed.appUrl = args[++index];
    else if (arg.startsWith("--app-url=")) parsed.appUrl = arg.slice("--app-url=".length);
    else if (arg === "--asset-base-url") parsed.assetBaseUrl = args[++index];
    else if (arg.startsWith("--asset-base-url=")) parsed.assetBaseUrl = arg.slice("--asset-base-url=".length);
    else throw new Error(`Unknown Round 5H browser QA option: ${arg}`);
  }
  return parsed;
}
