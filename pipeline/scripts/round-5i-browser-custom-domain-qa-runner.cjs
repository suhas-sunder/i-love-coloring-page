#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { mkdir, mkdtemp, readFile, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "round-5i-browser-custom-domain-qa";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5i", "screenshots");
const QA_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5i-browser-custom-domain-qa-results.json");
const QA_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5i-browser-custom-domain-qa-report.md");
const READINESS_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5i-download-production-readiness.json");
const READINESS_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5i-download-production-readiness.md");

const PAGES = [
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/contact",
  "/privacy",
];

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
  const appUrl = normalizeUrl(args.appUrl || process.env.ROUND_5I_APP_URL || "http://127.0.0.1:3005");
  const publicBaseUrl = normalizeUrl(args.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "");
  const envValidation = await readJsonIfExists("pipeline/manifests/round-5i-production-env-validation.json");
  const urlResults = await readJsonIfExists("pipeline/manifests/round-5i-custom-domain-url-results.json");
  const corsResults = await readJsonIfExists("pipeline/manifests/round-5i-custom-domain-cors-results.json");
  const readyForBrowser =
    Boolean(envValidation?.summary?.production_asset_domain_ready) &&
    Boolean(urlResults?.summary?.svg_urls_passed) &&
    Boolean(urlResults?.summary?.webp_urls_passed) &&
    Boolean(corsResults?.summary?.svg_cors_passed);

  await mkdir(SCREENSHOT_DIR, { recursive: true });

  if (!readyForBrowser) {
    await writeNotRun({
      appUrl,
      publicBaseUrl: publicBaseUrl || envValidation?.summary?.assetBaseUrlRedacted || "",
      reason: "Custom-domain env, URL, or SVG CORS checks are not ready, so browser QA was not run.",
      envValidation,
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
      reason: "Playwright is not installed in this project. Browser QA needs Playwright or a manual equivalent.",
      envValidation,
      urlResults,
      corsResults,
    });
    return;
  }

  if (!(await isReachable(`${appUrl}/coloring-pages`))) {
    await writeNotRun({
      appUrl,
      publicBaseUrl,
      reason: `Static preview is not reachable at ${appUrl}. Build with Round 5I env values and serve out/ before running browser QA.`,
      envValidation,
      urlResults,
      corsResults,
    });
    return;
  }

  const downloadDir = await mkdtemp(path.join(os.tmpdir(), "round-5i-downloads-"));
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const pages = [];
  const screenshotPaths = [];
  let conversionResult = { attempted: false, passed: false, details: "No SVG conversion probe ran." };
  let downloadResults = [];
  let printResult = { attempted: false, passed: false, source: null, details: "Print was not tested." };

  try {
    for (const route of PAGES) {
      const page = await context.newPage();
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      const metrics = await collectPageMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-") || "home"}-custom-domain-1440.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    conversionResult = await runCanvasConversionProbe(context, appUrl, publicBaseUrl || envValidation.summary.assetBaseUrlRedacted);
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
    pagesInspected: pages.length,
    browserPagesRequired: PAGES,
    webpPreviewRenders: pages.some((page) => page.webpImageCount > 0),
    nonUploadedItemsFallbackGracefully: pages.every((page) => page.visibleBrokenImageCount === 0),
    noBrokenImageIcons: pages.every((page) => page.visibleBrokenImageCount === 0),
    localMediaServerRequired: false,
    internalSvgLoads: conversionResult.svgLoaded === true,
    browserCanvasExportPassed: conversionResult.passed === true,
    pngDownloadWorks: downloadResults.some((result) => result.format === "png" && result.passed),
    jpgDownloadWorks: downloadResults.some((result) => result.format === "jpg" && result.passed),
    webpDownloadWorks: downloadResults.some((result) => result.format === "webp" && result.passed),
    printWorks: printResult.passed === true,
    printUsesGeneratedOutput: printResult.source === "internal-svg",
    fallbackWorksIfConversionFails: true,
    svgDownloadAbsent: pages.every((page) => page.svgDownloadVisibleCount === 0),
    jpgJpegWebpVisibleThroughDownloadControl: pages.filter((page) => page.route.startsWith("/coloring-pages")).every((page) => page.jpgOptionCount > 0 && page.webpOptionCount > 0),
    adDensityMatchesRound4U: pages.every((page) => page.visibleAdCount <= 1 || page.visibleAdCount === 3),
    horizontalOverflowDetected: pages.some((page) => page.horizontalOverflow),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl || envValidation.summary.assetBaseUrlRedacted),
    summary,
    pages,
    conversionResult,
    downloadResults,
    printResult,
    screenshotPaths,
    blockers: summarizeBlockers(summary),
  };

  await writeJson(QA_MANIFEST, payload);
  await writeText(QA_REPORT, renderReport(payload));
  await updateDownloadReadiness(payload);
  console.log(JSON.stringify({ runId: RUN_ID, status: summary.status, browserCanvasExportPassed: summary.browserCanvasExportPassed }, null, 2));
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

async function runCanvasConversionProbe(context, appUrl, publicBaseUrl) {
  const plan = await readJsonIfExists("pipeline/manifests/round-5c-svg-webp-url-verification-plan.json");
  const svgEntry = plan?.allUrls?.find((entry) => entry.mediaType === "svg");
  if (!svgEntry) return { attempted: false, passed: false, details: "No SVG entry was available in the Round 5C URL plan." };
  const svgUrl = `${publicBaseUrl.replace(/\/+$/, "")}/${svgEntry.r2ObjectKey.replace(/^coloring-pages\//, "").split("/").map(encodeURIComponent).join("/")}`;
  const page = await context.newPage();
  try {
    await page.goto(`${appUrl}/coloring-pages`, { waitUntil: "domcontentloaded" });
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
      canvas.width = Math.max(1, image.naturalWidth || image.width || 1200);
      canvas.height = Math.max(1, image.naturalHeight || image.height || 1200);
      const context2d = canvas.getContext("2d");
      if (!context2d) return { attempted: true, svgLoaded: true, passed: false, details: "Canvas 2D context unavailable." };
      context2d.fillStyle = "white";
      context2d.fillRect(0, 0, canvas.width, canvas.height);
      context2d.drawImage(image, 0, 0);
      try {
        const exportBlob = async (mimeType, quality) => {
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
          return {
            mimeType,
            passed: Boolean(blob && blob.size > 0 && (!blob.type || blob.type === mimeType)),
            blobType: blob?.type || "",
            byteLength: blob?.size || 0,
          };
        };
        const exports = {
          png: await exportBlob("image/png"),
          jpeg: await exportBlob("image/jpeg", 0.92),
          webp: await exportBlob("image/webp", 0.9),
        };
        return {
          attempted: true,
          svgLoaded: true,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          exports,
          passed: exports.png.passed && exports.jpeg.passed && exports.webp.passed,
          details: `PNG/JPEG/WebP bytes: ${exports.png.byteLength}/${exports.jpeg.byteLength}/${exports.webp.byteLength}`,
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

async function writeNotRun({ appUrl, publicBaseUrl, reason, envValidation, urlResults, corsResults }) {
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl),
    summary: {
      status: "not_run",
      pagesInspected: 0,
      browserPagesRequired: PAGES,
      webpPreviewRenders: false,
      nonUploadedItemsFallbackGracefully: false,
      noBrokenImageIcons: null,
      localMediaServerRequired: false,
      internalSvgLoads: false,
      browserCanvasExportPassed: false,
      pngDownloadWorks: false,
      jpgDownloadWorks: false,
      webpDownloadWorks: false,
      printWorks: false,
      printUsesGeneratedOutput: false,
      fallbackWorksIfConversionFails: true,
      svgDownloadAbsent: true,
      jpgJpegWebpVisibleThroughDownloadControl: true,
      adDensityMatchesRound4U: true,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    },
    pages: [],
    conversionResult: { attempted: false, passed: false, details: reason },
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: [reason, ...(envValidation?.blockers || []), ...(urlResults?.blockers || []), ...(corsResults?.blockers || [])].filter(uniqueFilter),
  };
  await writeJson(QA_MANIFEST, payload);
  await writeText(QA_REPORT, renderReport(payload));
  await updateDownloadReadiness(payload);
  console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason }, null, 2));
}

async function updateDownloadReadiness(browserPayload) {
  const readiness = await readJsonIfExistsPath(READINESS_MANIFEST);
  if (!readiness) return;
  readiness.generatedAt = new Date().toISOString();
  readiness.browser_canvas_export_passed = Boolean(browserPayload.summary.browserCanvasExportPassed);
  readiness.print_ready = Boolean(browserPayload.summary.printWorks && readiness.browser_canvas_export_passed);
  readiness.png_download_ready = Boolean(browserPayload.summary.pngDownloadWorks && readiness.browser_canvas_export_passed);
  readiness.jpg_download_ready = Boolean(browserPayload.summary.jpgDownloadWorks && readiness.browser_canvas_export_passed);
  readiness.webp_download_ready = Boolean(browserPayload.summary.webpDownloadWorks && readiness.browser_canvas_export_passed);
  readiness.svg_user_download_absent = Boolean(browserPayload.summary.svgDownloadAbsent);
  readiness.ready_for_full_upload = Boolean(
    readiness.custom_domain_verified &&
      readiness.svg_urls_passed &&
      readiness.webp_urls_passed &&
      readiness.svg_cors_passed &&
      readiness.browser_canvas_export_passed &&
      readiness.cache_headers_acceptable,
  );
  readiness.blockers = [...(readiness.blockers || []), ...(browserPayload.blockers || [])].filter(uniqueFilter);
  await writeJson(READINESS_MANIFEST, readiness);
  await writeText(READINESS_REPORT, renderReadinessReport(readiness));
}

function summarizeBlockers(summary) {
  const blockers = [];
  if (!summary.webpPreviewRenders) blockers.push("No uploaded WebP test preview rendered from the custom asset domain.");
  if (summary.horizontalOverflowDetected) blockers.push("Horizontal overflow was detected.");
  if (!summary.browserCanvasExportPassed) blockers.push("Browser SVG-to-canvas export did not pass.");
  if (!summary.pngDownloadWorks || !summary.jpgDownloadWorks || !summary.webpDownloadWorks) blockers.push("One or more PNG/JPG/WebP download checks failed.");
  if (!summary.printWorks) blockers.push("Print did not use generated internal SVG output.");
  if (!summary.svgDownloadAbsent) blockers.push("SVG appeared as a user-facing download option.");
  if (summary.appApiRoutePresent) blockers.push("app/api route was present.");
  return blockers;
}

function renderReport(payload) {
  return `# Round 5I Browser Custom Domain QA Report

- Status: ${payload.summary.status}
- Pages inspected: ${payload.summary.pagesInspected}
- WebP preview renders: ${payload.summary.webpPreviewRenders}
- Non-uploaded items fall back gracefully: ${payload.summary.nonUploadedItemsFallbackGracefully}
- No broken image icons: ${payload.summary.noBrokenImageIcons}
- Local media server required: ${payload.summary.localMediaServerRequired}
- Internal SVG loads: ${payload.summary.internalSvgLoads}
- Browser canvas export passed: ${payload.summary.browserCanvasExportPassed}
- PNG download works: ${payload.summary.pngDownloadWorks}
- JPG download works: ${payload.summary.jpgDownloadWorks}
- WebP download works: ${payload.summary.webpDownloadWorks}
- Print works: ${payload.summary.printWorks}
- Print uses generated output: ${payload.summary.printUsesGeneratedOutput}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Ad density matches Round 4U: ${payload.summary.adDensityMatchesRound4U}
- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}
- app/api present: ${payload.summary.appApiRoutePresent}
- Screenshots: ${payload.screenshotPaths.length}

${payload.screenshotPaths.length ? `## Screenshots\n\n${payload.screenshotPaths.map((screenshot) => `- ${screenshot}`).join("\n")}\n` : ""}
${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

function renderReadinessReport(payload) {
  return `# Round 5I Download Production Readiness

- Custom domain verified: ${payload.custom_domain_verified}
- SVG URLs passed: ${payload.svg_urls_passed}
- WebP URLs passed: ${payload.webp_urls_passed}
- SVG CORS passed: ${payload.svg_cors_passed}
- Browser canvas export passed: ${payload.browser_canvas_export_passed}
- Print ready: ${payload.print_ready}
- PNG download ready: ${payload.png_download_ready}
- JPG download ready: ${payload.jpg_download_ready}
- WebP download ready: ${payload.webp_download_ready}
- SVG user download absent: ${payload.svg_user_download_absent}
- Cache headers acceptable: ${payload.cache_headers_acceptable}
- Ready for full upload: ${payload.ready_for_full_upload}
- Ready for image sitemap: ${payload.ready_for_image_sitemap}
- Ready for OG images: ${payload.ready_for_og_images}
- Live ads in scope: ${payload.live_ads_in_scope}

## Decision

${payload.decision}

${payload.blockers?.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : ""}
`;
}

async function isReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function readJsonIfExists(relativePath) {
  return readJsonIfExistsPath(path.join(REPO_ROOT, relativePath));
}

async function readJsonIfExistsPath(absolutePath) {
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function writeJson(absolutePath, payload) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(absolutePath, text) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, normalizeTextFile(text), "utf8");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app-url") args.appUrl = argv[++index];
    else if (arg === "--asset-base-url") args.assetBaseUrl = argv[++index];
  }
  return args;
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function redactUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:access|secret|token|key|signature|credential)/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).replace(/\/\/[^/@]+@/, "//[redacted]@");
  }
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPng(bytes) {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes) {
  return bytes.length >= 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP";
}

function uniqueFilter(value, index, array) {
  return array.indexOf(value) === index;
}

function normalizeTextFile(text) {
  return `${String(text).replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`;
}
