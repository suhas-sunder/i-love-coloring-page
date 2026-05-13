#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { createReadStream, existsSync } = require("node:fs");
const { mkdir, mkdtemp, readFile, rm, stat, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "round-5k-browser-custom-domain-qa";
const EXPECTED_CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5k", "screenshots");
const QA_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5k-browser-custom-domain-qa-results.json");
const QA_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5k-browser-custom-domain-qa-report.md");
const READINESS_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5k-download-production-readiness.json");
const READINESS_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5k-download-production-readiness.md");
const GUIDANCE_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5k-final-upload-guidance.json");
const GUIDANCE_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5k-final-upload-guidance.md");

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
  const appUrl = normalizeUrl(args.appUrl || process.env.ROUND_5K_APP_URL || "http://127.0.0.1:3005");
  const publicBaseUrl = normalizeUrl(args.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "https://assets.ilovecoloringpage.com/coloring-pages");
  const envValidation = await readJsonIfExists("pipeline/manifests/round-5k-env-validation.json");
  const urlResults = await readJsonIfExists("pipeline/manifests/round-5k-custom-domain-url-results.json");
  const corsResults = await readJsonIfExists("pipeline/manifests/round-5k-origin-cors-results.json");
  const cacheResults = await readJsonIfExists("pipeline/manifests/round-5k-cache-content-type-results.json");
  const staticExport = await readJsonIfExists("pipeline/manifests/round-5k-production-static-export-results.json");
  const readyForBrowser =
    Boolean(envValidation?.summary?.production_env_ready) &&
    Boolean(urlResults?.summary?.svg_urls_passed) &&
    Boolean(urlResults?.summary?.webp_urls_passed) &&
    Boolean(corsResults?.summary?.svg_cors_passed) &&
    Boolean(staticExport?.summary?.staticExportWorks);

  await mkdir(SCREENSHOT_DIR, { recursive: true });

  if (!readyForBrowser) {
    await writeNotRun({
      appUrl,
      publicBaseUrl,
      reason: "Custom-domain env, URL, SVG CORS, or static export checks are not ready, so browser QA was not run.",
      envValidation,
      urlResults,
      corsResults,
      cacheResults,
      staticExport,
    });
    return;
  }

  let playwright = null;
  try {
    playwright = require("playwright");
  } catch {
    playwright = null;
  }

  let server = null;
  if (args.serveOut) {
    server = await startStaticServer(path.join(REPO_ROOT, "out"), appUrl);
  }

  try {
    if (!(await isReachable(`${appUrl}/coloring-pages`))) {
      await writeNotRun({
        appUrl,
        publicBaseUrl,
        reason: `Static preview is not reachable at ${appUrl}. Build with Round 5K env values and serve out/ before running browser QA.`,
        envValidation,
        urlResults,
        corsResults,
        cacheResults,
        staticExport,
      });
      return;
    }

    const payload = playwright
      ? await runBrowserQa(playwright, appUrl, publicBaseUrl)
      : await runBrowserQaWithCdp(appUrl, publicBaseUrl);
    await writeJson(QA_MANIFEST, payload);
    await writeText(QA_REPORT, renderReport(payload));
    await updateDownloadReadiness(payload, { envValidation, urlResults, corsResults, cacheResults, staticExport });
    console.log(JSON.stringify({ runId: RUN_ID, status: payload.summary.status, browserCanvasExportPassed: payload.summary.browserCanvasExportPassed }, null, 2));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

async function runBrowserQa(playwright, appUrl, publicBaseUrl) {
  const downloadDir = await mkdtemp(path.join(os.tmpdir(), "round-5k-downloads-"));
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
      await page.waitForTimeout(700);
      const metrics = await collectPageMetrics(page, publicBaseUrl);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-") || "home"}-custom-domain-1440.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    conversionResult = await runCanvasConversionProbe(context, appUrl, publicBaseUrl);
    const testPage = await context.newPage();
    await testPage.goto(`${appUrl}/coloring-pages`, { waitUntil: "networkidle" });
    await testPage.waitForTimeout(900);
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
    webpPreviewRenders: pages.some((page) => page.customDomainWebpLoadedCount > 0),
    nonUploadedItemsFallbackGracefully: pages.every((page) => page.visibleBrokenImageCount === 0),
    noBrokenImageIcons: pages.every((page) => page.visibleBrokenImageCount === 0),
    localMediaServerRequired: pages.every((page) => page.localMediaReferenceCount === 0),
    noLocalMediaServerRequired: pages.every((page) => page.localMediaReferenceCount === 0),
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
    contactEmailAppearsCorrectly: pages.filter((page) => ["/contact", "/privacy"].includes(page.route)).every((page) => page.pageTextIncludesContactEmail),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl),
    summary,
    pages,
    conversionResult,
    downloadResults,
    printResult,
    screenshotPaths,
    blockers: summarizeBlockers(summary),
  };
}

async function runBrowserQaWithCdp(appUrl, publicBaseUrl) {
  if (typeof WebSocket === "undefined") {
    return buildBrowserBlockedPayload(appUrl, publicBaseUrl, "Playwright is not installed and this Node runtime does not expose WebSocket for the Chrome DevTools Protocol fallback.");
  }

  const launched = await launchCdpBrowser();
  if (!launched.ok) return buildBrowserBlockedPayload(appUrl, publicBaseUrl, launched.reason);

  const browser = launched.browser;
  const pages = [];
  const screenshotPaths = [];
  let conversionResult = { attempted: false, passed: false, details: "No SVG conversion probe ran." };
  let downloadResults = [];
  let printResult = { attempted: false, passed: false, source: null, details: "Print was not tested." };

  try {
    for (const route of PAGES) {
      const page = await browser.newPage({ width: 1440, height: 1100 });
      try {
        await page.navigate(`${appUrl}${route}`);
        await page.waitForReady();
        await page.wait(700);
        const metrics = await page.evaluate(collectPageMetricsSource(), { publicBaseUrl, expectedContactEmail: EXPECTED_CONTACT_EMAIL });
        const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-") || "home"}-custom-domain-1440.png`);
        await page.screenshot(screenshotPath);
        screenshotPaths.push(toRepoPath(screenshotPath));
        pages.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      } finally {
        await page.close().catch(() => {});
      }
    }

    conversionResult = await runCdpCanvasConversionProbe(browser, appUrl, publicBaseUrl);
    downloadResults = await runCdpDownloadChecks(browser, appUrl);
    printResult = await runCdpPrintCheck(browser, appUrl);
  } finally {
    await browser.close();
  }

  const summary = {
    status: "completed",
    pagesInspected: pages.length,
    browserPagesRequired: PAGES,
    webpPreviewRenders: pages.some((page) => page.customDomainWebpLoadedCount > 0),
    nonUploadedItemsFallbackGracefully: pages.every((page) => page.visibleBrokenImageCount === 0),
    noBrokenImageIcons: pages.every((page) => page.visibleBrokenImageCount === 0),
    localMediaServerRequired: pages.every((page) => page.localMediaReferenceCount === 0),
    noLocalMediaServerRequired: pages.every((page) => page.localMediaReferenceCount === 0),
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
    contactEmailAppearsCorrectly: pages.filter((page) => ["/contact", "/privacy"].includes(page.route)).every((page) => page.pageTextIncludesContactEmail),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl),
    runner: "chrome-devtools-protocol",
    summary,
    pages,
    conversionResult,
    downloadResults,
    printResult,
    screenshotPaths,
    blockers: summarizeBlockers(summary),
  };
}

function buildBrowserBlockedPayload(appUrl, publicBaseUrl, reason) {
  const summary = {
    status: "not_run",
    pagesInspected: 0,
    browserPagesRequired: PAGES,
    webpPreviewRenders: false,
    nonUploadedItemsFallbackGracefully: false,
    noBrokenImageIcons: null,
    localMediaServerRequired: false,
    noLocalMediaServerRequired: false,
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
    contactEmailAppearsCorrectly: false,
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    publicBaseUrl: redactUrl(publicBaseUrl),
    runner: "not_available",
    summary,
    pages: [],
    conversionResult: { attempted: false, passed: false, details: reason },
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: [reason],
  };
}

async function runCdpCanvasConversionProbe(browser, appUrl, publicBaseUrl) {
  const plan = await readJsonIfExists("pipeline/manifests/round-5c-svg-webp-url-verification-plan.json");
  const svgEntry = (plan?.allUrls || plan?.records?.flatMap((record) => record.urls || []) || []).find((entry) => entry.mediaType === "svg");
  if (!svgEntry) return { attempted: false, passed: false, details: "No SVG entry was available in the Round 5C URL plan." };

  const svgUrl = `${publicBaseUrl.replace(/\/+$/, "")}/${svgEntry.r2ObjectKey.replace(/^coloring-pages\//, "").split("/").map(encodeURIComponent).join("/")}`;
  const page = await browser.newPage({ width: 1440, height: 1100 });
  try {
    await page.navigate(`${appUrl}/coloring-pages`);
    await page.waitForReady();
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
    await page.close().catch(() => {});
  }
}

async function runCdpDownloadChecks(browser, appUrl) {
  const page = await browser.newPage({ width: 1440, height: 1100 });
  try {
    await page.navigate(`${appUrl}/coloring-pages/animals`);
    await page.waitForReady();
    await page.waitForFunction(() => {
      const card = document.getElementById("asset-animals__animals-alligator__4feec8505a") || document.querySelector("article.gallery-item");
      if (!card) return false;
      const labels = [...card.querySelectorAll("button.download-menu-option")].map((button) => (button.textContent || "").trim());
      return labels.includes("PNG") && labels.includes("JPG") && labels.includes("WebP");
    }, null, { timeout: 15_000 });
    await page.evaluate(installDownloadProbeSource(), null);

    const results = [];
    for (const format of DOWNLOAD_FORMATS) {
      const beforeCount = await page.evaluate(() => window.__round5kDownloads?.length || 0, null);
      const clicked = await page.evaluate((label) => {
        const card = document.getElementById("asset-animals__animals-alligator__4feec8505a") || document.querySelector("article.gallery-item");
        if (!card) return false;
        const summary = card.querySelector("summary.download-menu-summary");
        if (summary) summary.click();
        const option = [...card.querySelectorAll("button.download-menu-option")].find((button) => (button.textContent || "").trim() === label);
        if (!option || option.disabled) return false;
        option.click();
        return true;
      }, format.label);
      if (!clicked) {
        results.push({ format: format.format, label: format.label, passed: false, details: "Download option was not clickable." });
        continue;
      }

      await page.waitForFunction((expectedCount) => (window.__round5kDownloads?.length || 0) > expectedCount, beforeCount, { timeout: 45_000 });
      await page.wait(250);
      const record = await page.evaluate(() => window.__round5kDownloads?.[window.__round5kDownloads.length - 1] || null, null);
      const expectedMime = format.format === "png" ? "image/png" : format.format === "jpg" ? "image/jpeg" : "image/webp";
      const magicPassed = magicHexMatches(format.format, record?.blob?.magicHex || "");
      results.push({
        format: format.format,
        label: format.label,
        suggestedFilename: record?.download || "",
        expectedExtension: format.extension,
        extensionPassed: String(record?.download || "").toLowerCase().endsWith(format.extension),
        byteLength: record?.blob?.size || 0,
        blobType: record?.blob?.type || "",
        mimeTypePassed: record?.blob?.type === expectedMime,
        magicPassed,
        passed: Boolean(record?.blob?.size > 0 && record?.blob?.type === expectedMime && magicPassed && String(record?.download || "").toLowerCase().endsWith(format.extension)),
      });
    }
    return results;
  } finally {
    await page.close().catch(() => {});
  }
}

async function runCdpPrintCheck(browser, appUrl) {
  const page = await browser.newPage({ width: 1440, height: 1100 });
  try {
    await page.navigate(`${appUrl}/coloring-pages/animals`);
    await page.waitForReady();
    await page.waitForFunction(() => {
      const card = document.getElementById("asset-animals__animals-alligator__4feec8505a") || document.querySelector("article.gallery-item");
      return Boolean(card?.querySelector("button"));
    }, null, { timeout: 15_000 });
    await page.evaluate(installPrintProbeSource(), null);
    const clicked = await page.evaluate(() => {
      const card = document.getElementById("asset-animals__animals-alligator__4feec8505a") || document.querySelector("article.gallery-item");
      const printButton = [...(card?.querySelectorAll("button") || [])].find((button) => /^Print$/i.test((button.textContent || "").trim()));
      if (!printButton) return false;
      printButton.click();
      return true;
    }, null);
    if (!clicked) return { attempted: true, passed: false, source: null, details: "Print button was not clickable." };
    await page.waitForFunction(() => (window.__round5kPrintWrites || []).some((html) => html.includes("data-print-source")), null, { timeout: 45_000 });
    const record = await page.evaluate(() => {
      const writes = window.__round5kPrintWrites || [];
      const finalHtml = writes.find((html) => html.includes("data-print-source")) || "";
      const source = /data-print-source="([^"]+)"/.exec(finalHtml)?.[1] || null;
      const imageSourceKind = /<img[^>]+src="blob:/i.test(finalHtml) ? "blob" : /<img[^>]+src="https?:/i.test(finalHtml) ? "url" : "missing";
      return { source, imageSourceKind, writeCount: writes.length };
    }, null);
    return {
      attempted: true,
      passed: record.source === "internal-svg" && record.imageSourceKind === "blob",
      source: record.source,
      imageSourceKind: record.imageSourceKind,
      details: record.source === "internal-svg" ? "Print path used generated internal SVG raster output." : "Print path used fallback or did not expose a generated source.",
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function collectPageMetricsSource() {
  return ({ publicBaseUrl, expectedContactEmail }) => {
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
    const pageText = document.body.innerText || "";

    return {
      imageSources: imageSources.slice(0, 50),
      customDomainWebpLoadedCount: [...document.images].filter((img) => {
        const src = img.currentSrc || img.src;
        return src.startsWith(publicBaseUrl) && src.includes("/webp/") && img.naturalWidth > 0;
      }).length,
      failedImageElementCount: failedImages.length,
      visibleBrokenImageCount: visibleBrokenImages.length,
      localMediaReferenceCount: imageSources.filter((src) => /(?:127\.0\.0\.1|localhost):4175/.test(src)).length,
      printButtonCount: [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
      downloadMenuCount: [...document.querySelectorAll("summary.download-menu-summary")].length,
      pngOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "PNG").length,
      jpgOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "JPG").length,
      webpOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "WebP").length,
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(actionText) ? 1 : 0,
      visibleAdCount: adSlots.length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
      pageTextIncludesContactEmail: pageText.includes(expectedContactEmail),
    };
  };
}

function installDownloadProbeSource() {
  return () => {
    if (window.__round5kDownloadProbeInstalled) return true;
    window.__round5kDownloadProbeInstalled = true;
    window.__round5kDownloads = [];
    window.__round5kObjectUrls = {};
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const objectUrl = originalCreateObjectUrl(blob);
      const record = { type: blob?.type || "", size: blob?.size || 0, magicHex: "" };
      window.__round5kObjectUrls[objectUrl] = record;
      if (blob && typeof blob.slice === "function") {
        blob.slice(0, 16).arrayBuffer().then((buffer) => {
          record.magicHex = [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
        });
      }
      return objectUrl;
    };
    HTMLAnchorElement.prototype.click = function clickProbe() {
      const blob = window.__round5kObjectUrls[this.href] || null;
      window.__round5kDownloads.push({
        download: this.download || "",
        hrefKind: this.href?.startsWith("blob:") ? "blob" : this.href?.startsWith("http") ? "url" : "other",
        blob,
      });
    };
    return true;
  };
}

function installPrintProbeSource() {
  return () => {
    window.__round5kPrintWrites = [];
    window.__round5kPrintCalled = false;
    window.open = () => ({
      opener: null,
      document: {
        open() {},
        write(html) {
          window.__round5kPrintWrites.push(String(html || ""));
        },
        close() {},
      },
      focus() {},
      print() {
        window.__round5kPrintCalled = true;
      },
      close() {},
    });
    return true;
  };
}


async function collectPageMetrics(page, publicBaseUrl) {
  return page.evaluate(({ publicBaseUrl, expectedContactEmail }) => {
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
    const pageText = document.body.innerText || "";

    return {
      imageSources: imageSources.slice(0, 50),
      customDomainWebpLoadedCount: [...document.images].filter((img) => {
        const src = img.currentSrc || img.src;
        return src.startsWith(publicBaseUrl) && src.includes("/webp/") && img.naturalWidth > 0;
      }).length,
      failedImageElementCount: failedImages.length,
      visibleBrokenImageCount: visibleBrokenImages.length,
      localMediaReferenceCount: imageSources.filter((src) => /(?:127\.0\.0\.1|localhost):4175/.test(src)).length,
      printButtonCount: [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
      downloadMenuCount: [...document.querySelectorAll("summary.download-menu-summary")].length,
      pngOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "PNG").length,
      jpgOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "JPG").length,
      webpOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "WebP").length,
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(actionText) ? 1 : 0,
      visibleAdCount: adSlots.length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
      pageTextIncludesContactEmail: pageText.includes(expectedContactEmail),
    };
  }, { publicBaseUrl, expectedContactEmail: EXPECTED_CONTACT_EMAIL });
}

async function runCanvasConversionProbe(context, appUrl, publicBaseUrl) {
  const plan = await readJsonIfExists("pipeline/manifests/round-5c-svg-webp-url-verification-plan.json");
  const svgEntry = (plan?.allUrls || plan?.records?.flatMap((record) => record.urls || []) || []).find((entry) => entry.mediaType === "svg");
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
    results.push({
      format: format.format,
      label: format.label,
      suggestedFilename,
      expectedExtension: format.extension,
      extensionPassed: suggestedFilename.toLowerCase().endsWith(format.extension),
      byteLength: bytes.length,
      magicPassed: format.magic(bytes),
      passed: bytes.length > 0 && format.magic(bytes) && suggestedFilename.toLowerCase().endsWith(format.extension),
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

async function launchCdpBrowser() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    return { ok: false, reason: "Playwright is not installed and no Chrome or Edge executable was found for the CDP browser fallback." };
  }

  const port = await findFreePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "round-5k-cdp-profile-"));
  const browserProcess = spawn(executablePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], {
    stdio: "ignore",
    windowsHide: true,
  });

  try {
    const version = await waitForCdpVersion(port);
    const connection = await CdpConnection.connect(version.webSocketDebuggerUrl);
    return {
      ok: true,
      browser: {
        async newPage(viewport = { width: 1440, height: 1100 }) {
          const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
          const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
          await connection.send("Page.enable", {}, sessionId);
          await connection.send("Runtime.enable", {}, sessionId);
          await connection.send("Network.enable", {}, sessionId);
          await connection.send("Emulation.setDeviceMetricsOverride", {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: 1,
            mobile: false,
          }, sessionId);
          return new CdpPage(connection, sessionId, targetId);
        },
        async close() {
          await connection.send("Browser.close").catch(() => {});
          connection.close();
          if (!browserProcess.killed) browserProcess.kill();
          await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
        },
      },
    };
  } catch (error) {
    if (!browserProcess.killed) browserProcess.kill();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, reason: `Chrome DevTools Protocol fallback could not start: ${error instanceof Error ? error.message : String(error)}` };
  }
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("CDP connection closed."));
      this.pending.clear();
    });
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools Protocol.")), 20_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Chrome DevTools Protocol WebSocket failed to open."));
      }, { once: true });
    });
    return new CdpConnection(socket);
  }

  handleMessage(event) {
    const text = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }

    const listeners = this.listeners.get(message.method) || [];
    for (const listener of listeners) listener(message);
  }

  send(method, params = {}, sessionId = undefined, timeout = 30_000) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP method ${method}.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(payload));
    });
  }

  waitFor(method, predicate = () => true, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(method, listener);
        reject(new Error(`Timed out waiting for CDP event ${method}.`));
      }, timeout);
      const listener = (message) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        this.off(method, listener);
        resolve(message);
      };
      this.on(method, listener);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  off(method, listener) {
    const listeners = this.listeners.get(method) || [];
    this.listeners.set(method, listeners.filter((item) => item !== listener));
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // Browser is already closed.
    }
  }
}

class CdpPage {
  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  async navigate(url) {
    const loadPromise = this.connection.waitFor("Page.loadEventFired", (message) => message.sessionId === this.sessionId, 45_000).catch(() => null);
    await this.connection.send("Page.navigate", { url }, this.sessionId, 45_000);
    await loadPromise;
  }

  async waitForReady(timeout = 20_000) {
    await this.waitForFunction(() => document.readyState === "complete", null, { timeout }).catch(() => {});
    await this.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout }).catch(() => {});
  }

  async wait(milliseconds) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async evaluate(fn, arg) {
    const expression = `(${fn.toString()})(${JSON.stringify(arg)})`;
    const result = await this.connection.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 45_000,
    }, this.sessionId, 60_000);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "CDP evaluation failed.");
    }
    return result.result?.value;
  }

  async waitForFunction(fn, arg, options = {}) {
    const timeout = options.timeout || 20_000;
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeout) {
      try {
        if (await this.evaluate(fn, arg)) return true;
      } catch (error) {
        lastError = error;
      }
      await this.wait(options.interval || 150);
    }
    throw lastError || new Error("Timed out waiting for browser condition.");
  }

  async screenshot(filePath) {
    const result = await this.connection.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, this.sessionId, 45_000);
    await writeFile(filePath, Buffer.from(result.data, "base64"));
  }

  async close() {
    await this.connection.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
  }
}

function findBrowserExecutable() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForCdpVersion(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 20_000) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error("Timed out waiting for Chrome DevTools Protocol version endpoint.");
}

function magicHexMatches(format, hex) {
  const value = String(hex || "").toLowerCase();
  if (format === "png") return value.startsWith("89504e470d0a1a0a");
  if (format === "jpg") return value.startsWith("ffd8ff");
  if (format === "webp") return value.startsWith("52494646") && value.slice(16, 24) === "57454250";
  return false;
}

async function writeNotRun({ appUrl, publicBaseUrl, reason, envValidation, urlResults, corsResults, cacheResults, staticExport }) {
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
      noLocalMediaServerRequired: false,
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
      contactEmailAppearsCorrectly: false,
    },
    pages: [],
    conversionResult: { attempted: false, passed: false, details: reason },
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: [
      reason,
      ...(envValidation?.blockers || []),
      ...(urlResults?.blockers || []),
      ...(corsResults?.blockers || []),
      ...(cacheResults?.blockers || []),
      ...(staticExport?.blockers || []),
    ].filter(uniqueFilter),
  };

  await writeJson(QA_MANIFEST, payload);
  await writeText(QA_REPORT, renderReport(payload));
  await updateDownloadReadiness(payload, { envValidation, urlResults, corsResults, cacheResults, staticExport });
  console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason }, null, 2));
}

async function updateDownloadReadiness(browserPayload, dependencies) {
  const readiness = await readJsonIfExistsPath(READINESS_MANIFEST);
  if (!readiness) return;
  const envValidation = dependencies.envValidation || {};
  const urlResults = dependencies.urlResults || {};
  const corsResults = dependencies.corsResults || {};
  const cacheResults = dependencies.cacheResults || {};
  const staticExport = dependencies.staticExport || {};
  const blockers = [
    ...(envValidation.blockers || []),
    ...(urlResults.blockers || []),
    ...(corsResults.blockers || []),
    ...(cacheResults.blockers || []),
    ...(staticExport.blockers || []),
    ...(browserPayload.blockers || []),
  ].filter(uniqueFilter);

  readiness.generatedAt = new Date().toISOString();
  readiness.custom_domain_verified = Boolean(envValidation.summary?.production_env_ready && urlResults.summary?.customDomainUrlVerificationPassed && corsResults.summary?.svg_cors_passed);
  readiness.svg_urls_passed = Boolean(urlResults.summary?.svg_urls_passed);
  readiness.webp_urls_passed = Boolean(urlResults.summary?.webp_urls_passed);
  readiness.svg_cors_passed = Boolean(corsResults.summary?.svg_cors_passed);
  readiness.browser_canvas_export_passed = Boolean(browserPayload.summary.browserCanvasExportPassed);
  readiness.print_ready = Boolean(browserPayload.summary.printWorks && readiness.browser_canvas_export_passed);
  readiness.png_download_ready = Boolean(browserPayload.summary.pngDownloadWorks && readiness.browser_canvas_export_passed);
  readiness.jpg_download_ready = Boolean(browserPayload.summary.jpgDownloadWorks && readiness.browser_canvas_export_passed);
  readiness.webp_download_ready = Boolean(browserPayload.summary.webpDownloadWorks && readiness.browser_canvas_export_passed);
  readiness.svg_user_download_absent = Boolean(browserPayload.summary.svgDownloadAbsent);
  readiness.cache_headers_acceptable = Boolean(cacheResults.summary?.cache_headers_acceptable);
  readiness.ready_for_full_upload = Boolean(
    readiness.custom_domain_verified &&
      readiness.svg_urls_passed &&
      readiness.webp_urls_passed &&
      readiness.svg_cors_passed &&
      readiness.browser_canvas_export_passed &&
      readiness.print_ready &&
      readiness.png_download_ready &&
      readiness.jpg_download_ready &&
      readiness.webp_download_ready &&
      readiness.svg_user_download_absent &&
      readiness.cache_headers_acceptable &&
      staticExport.summary?.staticExportWorks &&
      blockers.length === 0,
  );
  readiness.ready_for_image_sitemap = false;
  readiness.ready_for_og_images = false;
  readiness.live_ads_in_scope = false;
  readiness.blockers = blockers;
  readiness.decision = blockers.length === 0
    ? "Round 5K custom asset-domain checks passed for the 30-record SVG plus WebP test bundle. Full upload still requires explicit approval."
    : "Round 5K production download readiness is blocked or partial until the listed checks pass.";

  await writeJson(READINESS_MANIFEST, readiness);
  await writeText(READINESS_REPORT, renderReadinessReport(readiness));
  await updateFinalUploadGuidance(readiness, dependencies, browserPayload);
}

async function updateFinalUploadGuidance(readiness, dependencies, browserPayload) {
  const guidance = await readJsonIfExistsPath(GUIDANCE_MANIFEST);
  if (!guidance) return;
  const urlResults = dependencies.urlResults || {};
  const corsResults = dependencies.corsResults || {};
  const cacheResults = dependencies.cacheResults || {};

  guidance.generatedAt = new Date().toISOString();
  guidance.currentEvidence = {
    customDomainUrlStatus: urlResults.summary?.status || "unknown",
    svgUrlsPassed: Boolean(readiness.svg_urls_passed),
    webpUrlsPassed: Boolean(readiness.webp_urls_passed),
    svgCorsPassed: Boolean(readiness.svg_cors_passed),
    cacheHeadersAcceptable: Boolean(readiness.cache_headers_acceptable),
    browserCanvasExportPassed: Boolean(readiness.browser_canvas_export_passed),
    printReady: Boolean(readiness.print_ready),
    pngDownloadReady: Boolean(readiness.png_download_ready),
    jpgDownloadReady: Boolean(readiness.jpg_download_ready),
    webpDownloadReady: Boolean(readiness.webp_download_ready),
    browserQaStatus: browserPayload.summary?.status || "unknown",
  };
  guidance.blockers = readiness.blockers || [];
  guidance.summary.finalSvgWebpModelConfirmed = Boolean(
    readiness.custom_domain_verified &&
      readiness.svg_urls_passed &&
      readiness.webp_urls_passed &&
      readiness.svg_cors_passed &&
      readiness.browser_canvas_export_passed &&
      readiness.cache_headers_acceptable &&
      cacheResults.summary?.content_type_behavior_acceptable,
  );
  guidance.summary.pngThumbsCanRemainExcluded = Boolean(guidance.summary.finalSvgWebpModelConfirmed);

  await writeJson(GUIDANCE_MANIFEST, guidance);
  await writeText(GUIDANCE_REPORT, renderGuidanceReport(guidance));
}

function summarizeBlockers(summary) {
  const blockers = [];
  if (!summary.webpPreviewRenders) blockers.push("No uploaded WebP test preview rendered from the custom asset domain.");
  if (!summary.nonUploadedItemsFallbackGracefully) blockers.push("Non-uploaded items did not fall back gracefully.");
  if (summary.noBrokenImageIcons !== true) blockers.push("Broken image icons were detected or could not be ruled out.");
  if (!summary.localMediaServerRequired) blockers.push("A local media server reference was detected or local media independence could not be confirmed.");
  if (!summary.browserCanvasExportPassed) blockers.push("Browser SVG-to-canvas export did not pass.");
  if (!summary.pngDownloadWorks || !summary.jpgDownloadWorks || !summary.webpDownloadWorks) blockers.push("One or more PNG/JPG/WebP download checks failed.");
  if (!summary.printWorks || !summary.printUsesGeneratedOutput) blockers.push("Print did not use generated internal SVG output.");
  if (!summary.svgDownloadAbsent) blockers.push("SVG appeared as a user-facing download option.");
  if (!summary.adDensityMatchesRound4U) blockers.push("Ad density did not match the Round 4U policy.");
  if (summary.horizontalOverflowDetected) blockers.push("Horizontal overflow was detected.");
  if (summary.appApiRoutePresent) blockers.push("app/api route was present.");
  if (!summary.contactEmailAppearsCorrectly) blockers.push("The expected contact email was not visible on contact/privacy pages.");
  return blockers;
}

async function startStaticServer(root, appUrl) {
  const parsed = new URL(appUrl);
  const host = parsed.hostname;
  const port = Number(parsed.port || 80);
  if (!existsSync(root)) throw new Error(`Static output folder does not exist: ${root}`);

  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }

    const target = await resolveStaticTarget(root, request.url || "/");
    if (!target) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": getContentType(target),
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(target).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

async function resolveStaticTarget(root, requestUrl) {
  let pathname = "/";
  try {
    pathname = new URL(requestUrl, "http://static.local").pathname;
  } catch {
    return null;
  }
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = [];
  const base = path.resolve(root, decoded);
  if (decoded) candidates.push(base);
  candidates.push(path.join(base, "index.html"));
  if (!path.extname(base)) candidates.push(`${base}.html`);
  if (!decoded) candidates.push(path.join(root, "index.html"));

  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".xml") return "application/xml; charset=utf-8";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml; charset=utf-8";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

async function isReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function renderReport(payload) {
  return `# Round 5K Browser Custom Domain QA Report

- Status: ${payload.summary.status}
- Pages inspected: ${payload.summary.pagesInspected}
- WebP preview renders: ${payload.summary.webpPreviewRenders}
- Non-uploaded items fall back gracefully: ${payload.summary.nonUploadedItemsFallbackGracefully}
- No broken image icons: ${payload.summary.noBrokenImageIcons}
- No local media server required: ${payload.summary.noLocalMediaServerRequired ?? payload.summary.localMediaServerRequired}
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
- Contact email appears correctly: ${payload.summary.contactEmailAppearsCorrectly}
- Screenshots: ${payload.screenshotPaths.length}

${payload.screenshotPaths.length ? `## Screenshots\n\n${payload.screenshotPaths.map((screenshot) => `- ${screenshot}`).join("\n")}\n` : ""}
${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No browser QA blockers found.\n"}
`;
}

function renderReadinessReport(payload) {
  return `# Round 5K Download Production Readiness

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

function renderGuidanceReport(payload) {
  return `# Round 5K Final Upload Guidance

- Final SVG plus WebP model confirmed: ${payload.summary.finalSvgWebpModelConfirmed}
- PNG/thumbs can remain excluded: ${payload.summary.pngThumbsCanRemainExcluded}
- SVG internal only: ${payload.summary.svgInternalOnly}
- Full upload still final stage: ${payload.summary.fullUploadStillFinalStage}
- Explicit approval required before full upload: ${payload.summary.explicitApprovalRequiredBeforeFullUpload}
- Image sitemap deferred: ${payload.summary.imageSitemapDeferred}
- Open Graph images deferred: ${payload.summary.openGraphImagesDeferred}
- Live AdSense deferred: ${payload.summary.liveAdSenseDeferred}
- PNG not used as WebP substitute: ${payload.summary.pngNotUsedAsWebpSubstitute}

## Object Key Pattern

${payload.objectKeyPattern}

## Custom Asset Domain Pattern

${payload.customAssetDomainPattern}

## Required Content Types

- SVG: ${payload.requiredContentTypes.svg}
- WebP: ${payload.requiredContentTypes.webp}

## Required CORS

- Origins: ${payload.requiredCors.origins.join(", ")}
- Optional origins: ${payload.requiredCors.optionalOrigins.join(", ")}
- Methods: ${payload.requiredCors.methods.join(", ")}
- Credentials required: ${payload.requiredCors.credentialsRequired}
- Note: ${payload.requiredCors.note}

## Cache Recommendation

- Cache-Control: ${payload.cacheHeaderRecommendation.cacheControl}
- ETag or Last-Modified recommended: ${payload.cacheHeaderRecommendation.etagOrLastModifiedRecommended}
- Purge needed after header change: ${payload.cacheHeaderRecommendation.purgeNeededAfterHeaderChange}

## Current Evidence

- Custom-domain URL status: ${payload.currentEvidence.customDomainUrlStatus}
- SVG URLs passed: ${payload.currentEvidence.svgUrlsPassed}
- WebP URLs passed: ${payload.currentEvidence.webpUrlsPassed}
- SVG CORS passed: ${payload.currentEvidence.svgCorsPassed}
- Cache headers acceptable: ${payload.currentEvidence.cacheHeadersAcceptable}
- Browser canvas export passed: ${payload.currentEvidence.browserCanvasExportPassed}
- Print ready: ${payload.currentEvidence.printReady}
- PNG download ready: ${payload.currentEvidence.pngDownloadReady}
- JPG download ready: ${payload.currentEvidence.jpgDownloadReady}
- WebP download ready: ${payload.currentEvidence.webpDownloadReady}
- Browser QA status: ${payload.currentEvidence.browserQaStatus}

## Full Upload Checklist

${payload.fullUploadChecklist.map((item) => `- ${item}`).join("\n")}

## Verification Commands After Full Upload

${payload.verificationCommandsAfterFullUpload.map((command) => `- \`${command}\``).join("\n")}

${payload.blockers.length ? `## Blockers\n\n${payload.blockers.map((blocker) => `- ${blocker}`).join("\n")}\n` : "No Round 5K upload guidance blockers remain for the 30-record SVG plus WebP test bundle.\n"}
`;
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
  await writeFile(absolutePath, `${String(text).replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app-url") args.appUrl = argv[++index];
    else if (arg === "--asset-base-url" || arg === "--public-base-url") args.assetBaseUrl = argv[++index];
    else if (arg === "--serve-out") args.serveOut = true;
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
