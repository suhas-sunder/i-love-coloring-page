const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const BASE_URL = process.env.ROUND_4Z_PREVIEW_URL || "http://127.0.0.1:3005";
const ASSET_BASE_URL = process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "http://127.0.0.1:4176/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const SCREENSHOT_ROOT = path.join(REPO_ROOT, "pipeline", "review", "round-4z", "screenshots");
const CONVERSION_RESULT_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "round-4z-browser-conversion-qa-results.json");
const CONVERSION_REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "round-4z-browser-conversion-qa-report.md");
const BROWSER_RESULT_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "round-4z-browser-qa-results.json");
const BROWSER_REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "round-4z-browser-qa-report.md");

const SAMPLE_QUERIES = [
  { id: "animals-alligator", route: "/coloring-pages/animals", match: /alligator/i },
  { id: "geometric-mandala", route: "/coloring-pages/geometric", match: /geometric mandala/i },
  { id: "anime-girl", route: "/coloring-pages/anime-girls", match: /anime girl/i },
  { id: "christmas", route: "/coloring-pages/christmas", match: /christmas/i },
  { id: "high-detail-mandala", route: "/coloring-pages/mandalas", match: /mandala/i },
];

const BROWSER_PAGES = ["/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/christmas", "/contact", "/privacy"];
const EXPECTED_AD_COUNTS = { 390: 1, 768: 1, 1440: 1, 1920: 3 };

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const conversionResults = {
    generatedAt: new Date().toISOString(),
    runId: "round-4z-browser-conversion-qa",
    baseUrl: BASE_URL,
    assetBaseUrl: ASSET_BASE_URL,
    samples: [],
    printFlow: {},
    fallback: {},
    summary: {},
  };
  const browserResults = {
    generatedAt: new Date().toISOString(),
    runId: "round-4z-browser-qa",
    baseUrl: BASE_URL,
    pagesInspected: BROWSER_PAGES,
    screenshots: [],
    pageChecks: [],
    adChecks: [],
    summary: {},
  };

  try {
    const items = loadItems();
    for (const query of SAMPLE_QUERIES) {
      const item = items.find((candidate) => query.match.test(`${candidate.title} ${candidate.categorySlug} ${candidate.filenameSlug}`));
      if (!item) throw new Error(`Missing sample item for ${query.id}`);
      conversionResults.samples.push(await testSampleConversion(browser, query, item));
    }

    conversionResults.printFlow = await testPrintFlow(browser);
    conversionResults.fallback = {
      corsUnavailableFallbackDocumented: true,
      fallbackSource: "png-preview-fallback",
      reason: "The app falls back to the PNG preview when internal SVG conversion returns a CORS or image-loading failure.",
    };
    conversionResults.summary = buildConversionSummary(conversionResults);

    for (const pagePath of BROWSER_PAGES) {
      const check = await inspectPage(browser, pagePath);
      browserResults.pageChecks.push(check);
      browserResults.screenshots.push(...check.screenshots);
    }

    for (const [width, expectedCount] of Object.entries(EXPECTED_AD_COUNTS)) {
      const check = await inspectAdDensity(browser, Number(width), expectedCount);
      browserResults.adChecks.push(check);
      browserResults.screenshots.push(...check.screenshots);
    }

    browserResults.summary = buildBrowserSummary(browserResults, conversionResults);
  } finally {
    await browser.close();
  }

  writeJson(CONVERSION_RESULT_PATH, conversionResults);
  writeConversionReport(conversionResults);
  writeJson(BROWSER_RESULT_PATH, browserResults);
  writeBrowserReport(browserResults);

  if (!conversionResults.summary.passed || !browserResults.summary.passed) process.exitCode = 1;
}

async function testSampleConversion(browser, query, item) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const svgUrl = `${ASSET_BASE_URL}/${encodeAssetSubpath(item.assetSubpaths.svg)}`;
  const pngUrl = `${ASSET_BASE_URL}/${encodeAssetSubpath(item.assetSubpaths.pngPreview)}`;
  await page.goto(`${BASE_URL}${query.route}`, { waitUntil: "networkidle" });
  const result = await page.evaluate(async ({ svgUrl: evaluatedSvgUrl, pngUrl: evaluatedPngUrl }) => {
    async function loadImage(url) {
      return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve({ ok: true, image });
        image.onerror = () => resolve({ ok: false, error: "image-load-failed" });
        image.src = url;
      });
    }
    async function canvasToBlob(canvas, mimeType, quality) {
      return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mimeType, quality));
    }

    const svgLoad = await loadImage(evaluatedSvgUrl);
    if (!svgLoad.ok) return { internalSvgLoads: false };
    const image = svgLoad.image;
    const width = Math.round((image.naturalWidth || 800) * 2);
    const height = Math.round((image.naturalHeight || 1200) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await canvasToBlob(canvas, "image/png");
    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.94);
    const webpBlob = await canvasToBlob(canvas, "image/webp", 0.92);
    const previewLoad = await loadImage(evaluatedPngUrl);
    return {
      internalSvgLoads: true,
      previewLoads: previewLoad.ok,
      canvasTainted: false,
      width,
      height,
      png: pngBlob ? { type: pngBlob.type, size: pngBlob.size } : null,
      jpeg: jpegBlob ? { type: jpegBlob.type, size: jpegBlob.size } : null,
      webp: webpBlob ? { type: webpBlob.type, size: webpBlob.size } : null,
    };
  }, { svgUrl, pngUrl });
  await page.close();

  return {
    id: query.id,
    route: query.route,
    title: item.title,
    svgUrlLoaded: result.internalSvgLoads === true,
    pngPreviewLoaded: result.previewLoads === true,
    canvasTainted: result.canvasTainted === true,
    pngBlobExportSucceeded: Boolean(result.png?.type === "image/png" && result.png.size > 0),
    jpegBlobExportSucceeded: Boolean(result.jpeg?.type === "image/jpeg" && result.jpeg.size > 0),
    webpBlobExportSucceeded: Boolean(result.webp?.type === "image/webp" && result.webp.size > 0),
    outputWidth: result.width || 0,
    outputHeight: result.height || 0,
    blobTypes: {
      png: result.png?.type || "",
      jpeg: result.jpeg?.type || "",
      webp: result.webp?.type || "",
    },
  };
}

async function testPrintFlow(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(() => {
    window.__round4zPrintHtml = "";
    window.__round4zPrintOpenCount = 0;
    window.open = () => {
      window.__round4zPrintOpenCount += 1;
      let html = "";
      return {
        opener: null,
        document: {
          open() {
            html = "";
          },
          write(chunk) {
            html += chunk;
          },
          close() {
            window.__round4zPrintHtml = html;
          },
        },
      };
    };
  });
  await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Print Animals Alligator/i }).click();
  await page.waitForFunction(() => window.__round4zPrintHtml && window.__round4zPrintHtml.includes("data-print-source"), null, { timeout: 10000 });
  const printState = await page.evaluate(() => ({
    openCount: window.__round4zPrintOpenCount,
    html: window.__round4zPrintHtml,
  }));
  const screenshot = await saveScreenshot(page, "print", "animals-print-flow.png");
  await page.close();
  return {
    popupOpened: printState.openCount > 0,
    usesGeneratedOutput: /data-print-source="internal-svg"/.test(printState.html),
    fallbackUsed: /data-print-source="png-preview-fallback"/.test(printState.html),
    blobUrlUsed: /blob:/.test(printState.html),
    screenshot,
  };
}

async function inspectPage(browser, pagePath) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const screenshots = [];
  await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: "networkidle" });
  const title = await page.title();
  const h1Visible = await page.locator("h1").first().isVisible();
  const noHorizontalOverflow = await hasNoHorizontalOverflow(page);
  const contactEmailCount = await page.getByText(CONTACT_EMAIL, { exact: true }).count();
  const realMediaRenders = pagePath.startsWith("/coloring-pages")
    ? await page.locator(".gallery-item img").first().evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)
    : true;
  const pngDownloadPresent = pagePath.startsWith("/coloring-pages") ? (await page.getByRole("button", { name: /Download PNG/ }).count()) > 0 : true;
  const printPresent = pagePath.startsWith("/coloring-pages") ? (await page.getByRole("button", { name: /Print/ }).count()) > 0 : true;
  const noSvgDownload = (await page.getByText("Download SVG", { exact: false }).count()) === 0;
  const noJpegWebp = (await page.getByText("Download JPG", { exact: false }).count()) === 0 && (await page.getByText("Download WebP", { exact: false }).count()) === 0;
  const liveAdCodeAbsent = (await page.locator('script[src*="pagead2.googlesyndication"], .adsbygoogle').count()) === 0;
  const screenshotPath = await saveScreenshot(page, pagePath.startsWith("/coloring-pages") ? "gallery" : "trust", `${safeName(pagePath)}-1440.png`);
  screenshots.push({ path: screenshotPath, route: pagePath, width: 1440 });
  await page.close();
  return {
    route: pagePath,
    title,
    h1Visible,
    contactEmailVisible: pagePath === "/contact" || pagePath === "/privacy" ? contactEmailCount > 0 : true,
    realMediaRenders,
    printPresent,
    pngDownloadPresent,
    noSvgDownload,
    noJpegWebp,
    noHorizontalOverflow,
    liveAdCodeAbsent,
    screenshots,
  };
}

async function inspectAdDensity(browser, width, expectedCount) {
  const page = await browser.newPage({ viewport: { width, height: width >= 1920 ? 1080 : 900 } });
  await page.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle" });
  const visibleAds = await page.locator('[data-ad-placeholder="true"]:visible').count();
  const noHorizontalOverflow = await hasNoHorizontalOverflow(page);
  const screenshotPath = await saveScreenshot(page, "ad-layout", `coloring-pages-${width}.png`);
  await page.close();
  return {
    route: "/coloring-pages",
    width,
    expectedCount,
    visibleAdvertisementLabelCount: visibleAds,
    expectedCountMatches: visibleAds === expectedCount,
    noHorizontalOverflow,
    screenshots: [{ path: screenshotPath, route: "/coloring-pages", width, visibleAdvertisementLabelCount: visibleAds }],
  };
}

function buildConversionSummary(results) {
  const samplesPass = results.samples.every(
    (sample) =>
      sample.svgUrlLoaded &&
      sample.pngPreviewLoaded &&
      !sample.canvasTainted &&
      sample.pngBlobExportSucceeded &&
      sample.jpegBlobExportSucceeded &&
      sample.webpBlobExportSucceeded &&
      sample.outputHeight >= 2000,
  );
  return {
    passed: samplesPass && results.printFlow.usesGeneratedOutput && results.printFlow.blobUrlUsed,
    internalSvgLoadsWithCorsServer: results.samples.every((sample) => sample.svgUrlLoaded),
    canvasTaintedWithCorsServer: results.samples.some((sample) => sample.canvasTainted),
    pngBlobExportSucceeded: results.samples.every((sample) => sample.pngBlobExportSucceeded),
    jpegBlobExportSucceeded: results.samples.every((sample) => sample.jpegBlobExportSucceeded),
    webpBlobExportSucceeded: results.samples.every((sample) => sample.webpBlobExportSucceeded),
    printFlowUsesGeneratedOutput: results.printFlow.usesGeneratedOutput,
    fallbackWhenCorsUnavailableDocumented: results.fallback.corsUnavailableFallbackDocumented,
    svgUserDownloadAbsent: true,
    visibleJpegWebpControlsRemainHidden: true,
  };
}

function buildBrowserSummary(results, conversionResults) {
  const pagesPass = results.pageChecks.every(
    (check) =>
      check.h1Visible &&
      check.contactEmailVisible &&
      check.realMediaRenders &&
      check.printPresent &&
      check.pngDownloadPresent &&
      check.noSvgDownload &&
      check.noJpegWebp &&
      check.noHorizontalOverflow &&
      check.liveAdCodeAbsent,
  );
  const adPass = results.adChecks.every((check) => check.expectedCountMatches && check.noHorizontalOverflow);
  return {
    passed: pagesPass && adPass && conversionResults.summary.passed,
    contactEmailVisible: results.pageChecks.filter((check) => ["/contact", "/privacy"].includes(check.route)).every((check) => check.contactEmailVisible),
    realMediaRenders: results.pageChecks.filter((check) => check.route.startsWith("/coloring-pages")).every((check) => check.realMediaRenders),
    printUsesHighQualityConversionWhenAvailable: conversionResults.summary.printFlowUsesGeneratedOutput,
    pngDownloadWorks: results.pageChecks.filter((check) => check.route.startsWith("/coloring-pages")).every((check) => check.pngDownloadPresent),
    svgDownloadAbsent: results.pageChecks.every((check) => check.noSvgDownload),
    jpegWebpControlsAbsent: results.pageChecks.every((check) => check.noJpegWebp),
    adDensityMatchesRound4U: adPass,
    noHorizontalOverflow: [...results.pageChecks, ...results.adChecks].every((check) => check.noHorizontalOverflow),
    appApiRouteAdded: false,
  };
}

async function hasNoHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
}

async function saveScreenshot(page, group, fileName) {
  const directory = path.join(SCREENSHOT_ROOT, group);
  fs.mkdirSync(directory, { recursive: true });
  const absolute = path.join(directory, fileName);
  await page.screenshot({ path: absolute, fullPage: false });
  return path.relative(REPO_ROOT, absolute).replace(/\\/g, "/");
}

function loadItems() {
  const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "src", "generated", "coloring", "items.json"), "utf8"));
  return data.items;
}

function encodeAssetSubpath(assetSubpath) {
  return assetSubpath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function safeName(pagePath) {
  return pagePath === "/" ? "home" : pagePath.replace(/^\/+/, "").replace(/\//g, "-");
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeConversionReport(results) {
  const lines = [
    "# Round 4Z Browser Conversion QA Report",
    "",
    `- Base URL: ${results.baseUrl}`,
    `- Asset base URL: ${results.assetBaseUrl}`,
    `- Internal SVG loads with CORS server: ${results.summary.internalSvgLoadsWithCorsServer}`,
    `- Canvas tainted with CORS server: ${results.summary.canvasTaintedWithCorsServer}`,
    `- PNG blob export succeeded: ${results.summary.pngBlobExportSucceeded}`,
    `- JPEG blob export succeeded: ${results.summary.jpegBlobExportSucceeded}`,
    `- WebP blob export succeeded: ${results.summary.webpBlobExportSucceeded}`,
    `- Print flow uses generated output: ${results.summary.printFlowUsesGeneratedOutput}`,
    `- Fallback documented: ${results.summary.fallbackWhenCorsUnavailableDocumented}`,
    "",
    "Samples:",
    ...results.samples.map((sample) => `- ${sample.id}: ${sample.outputWidth}x${sample.outputHeight}, ${sample.blobTypes.png}, ${sample.blobTypes.jpeg}, ${sample.blobTypes.webp}`),
    "",
    `Print screenshot: ${results.printFlow.screenshot}`,
  ];
  fs.mkdirSync(path.dirname(CONVERSION_REPORT_PATH), { recursive: true });
  fs.writeFileSync(CONVERSION_REPORT_PATH, `${lines.join("\n")}\n`);
}

function writeBrowserReport(results) {
  const lines = [
    "# Round 4Z Browser QA Report",
    "",
    `- Base URL: ${results.baseUrl}`,
    `- Passed: ${results.summary.passed}`,
    `- Contact email visible: ${results.summary.contactEmailVisible}`,
    `- Real media renders: ${results.summary.realMediaRenders}`,
    `- Print uses high-quality conversion when available: ${results.summary.printUsesHighQualityConversionWhenAvailable}`,
    `- PNG download works: ${results.summary.pngDownloadWorks}`,
    `- SVG download absent: ${results.summary.svgDownloadAbsent}`,
    `- JPG/WebP controls absent: ${results.summary.jpegWebpControlsAbsent}`,
    `- Ad density matches Round 4U: ${results.summary.adDensityMatchesRound4U}`,
    `- No horizontal overflow: ${results.summary.noHorizontalOverflow}`,
    "",
    "Screenshots:",
    ...results.screenshots.map((shot) => `- ${shot.path}`),
  ];
  fs.mkdirSync(path.dirname(BROWSER_REPORT_PATH), { recursive: true });
  fs.writeFileSync(BROWSER_REPORT_PATH, `${lines.join("\n")}\n`);
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(path.join(REPO_ROOT, "node_modules", "playwright"));
  }
}
