#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { createReadStream, existsSync, readFileSync, statSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "client-bundle-hydration");
const PRINTABLE_ROUTE = "/printables/animals/animals-alligator-4feec8505a";
const ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/animals/page/2",
  PRINTABLE_ROUTE,
  "/privacy",
  "/terms",
  "/sitemap",
  "/missing-client-bundle-route",
];
const VIEWPORTS = [390, 768, 1024, 1440, 1920, 2400, 3440];
const BROWSERS = [
  { id: "chrome", channel: "chrome" },
  { id: "edge", channel: "msedge" },
];
const EXPECTED_PDF_BYTES = 613_584;

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(path.join(OUT, "index.html"))) throw new Error("out/ is missing; run a production build before browser QA.");
  await mkdir(REVIEW_DIR, { recursive: true });
  const bundleAnalysis = JSON.parse(await readFile(path.join(REVIEW_DIR, "current.json"), "utf8"));
  const chunkByName = new Map(bundleAnalysis.chunks.map((chunk) => [path.basename(chunk.asset), chunk]));
  const heavyChunkNames = new Set(bundleAnalysis.deferredExportChunks
    .filter((chunk) => chunk.signatures.hasPdfWriter || chunk.signatures.hasArtworkCanvas || chunk.signatures.hasPreviewDialog)
    .map((chunk) => path.basename(chunk.asset)));
  const server = await startStaticServer();
  const results = {
    measuredAt: new Date().toISOString(),
    measurementClass: "local production-build browser lab measurement",
    fieldData: null,
    browsers: [],
    routes: ROUTES,
    viewports: VIEWPORTS,
    evidence: [],
    limitations: [
      "Chrome and Edge are both Chromium-based coverage.",
      "The AdSense network was blocked during deterministic local QA; advertising source tests own fill behavior.",
      "Timings are desktop lab measurements, not field p75 or physical mobile measurements.",
    ],
  };

  try {
    for (const browserSpec of BROWSERS) {
      let browser;
      try {
        browser = await chromium.launch({ channel: browserSpec.channel, headless: true });
      } catch (error) {
        results.browsers.push({ id: browserSpec.id, available: false, reason: firstLine(error) });
        continue;
      }

      try {
        const actions = browserSpec.id === "chrome"
          ? await runPrintableActions(browser, server.baseUrl, chunkByName, heavyChunkNames)
          : null;
        const matrix = await runMatrix(browser, browserSpec.id, server.baseUrl, chunkByName, heavyChunkNames, results.evidence);
        results.browsers.push({
          id: browserSpec.id,
          engineCoverage: "Chromium",
          available: true,
          version: browser.version(),
          matrix,
          actions,
        });
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }

  const available = results.browsers.filter((browser) => browser.available);
  results.summary = {
    expectedBrowsersAvailable: available.length === BROWSERS.length,
    matrixChecks: available.reduce((sum, browser) => sum + browser.matrix.checks.length, 0),
    matrixFailures: available.flatMap((browser) => browser.matrix.failures),
    printableActionsPassed: available.find((browser) => browser.id === "chrome")?.actions?.passed === true,
  };
  results.summary.passed = results.summary.expectedBrowsersAvailable
    && results.summary.matrixFailures.length === 0
    && results.summary.printableActionsPassed;

  const outputPath = path.join(REVIEW_DIR, "browser-qa-results.json");
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: relative(outputPath), ...results.summary }, null, 2));
  if (!results.summary.passed) process.exitCode = 1;
}

async function runMatrix(browser, browserId, baseUrl, chunkByName, heavyChunkNames, evidence) {
  const context = await browser.newContext();
  await installMeasurementHarness(context);
  await blockAdvertising(context);
  const checks = [];
  const failures = [];
  try {
    for (const width of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        const consoleErrors = [];
        const networkErrors = [];
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          const value = message.text();
          if (/googlesyndication|doubleclick|ERR_FAILED|ERR_BLOCKED_BY_CLIENT/i.test(value)) return;
          if (/^Failed to load resource:.*404 \((?:Not Found|File not found)\)$/i.test(value)) return;
          consoleErrors.push(value);
        });
        page.on("response", (response) => {
          if (response.status() < 400 || /[?&]_rsc=/.test(response.url())) return;
          if (route === "/missing-client-bundle-route" && response.request().isNavigationRequest()) return;
          networkErrors.push(`${response.status()} ${response.url()}`);
        });
        page.on("requestfailed", (request) => {
          const value = `${request.failure()?.errorText || "request failed"} ${request.url()}`;
          if (/googlesyndication|doubleclick|ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/i.test(value)) return;
          networkErrors.push(value);
        });
        try {
          await page.setViewportSize({ width, height: width <= 768 ? 900 : 1000 });
          const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(750);
          const snapshot = await page.evaluate(() => ({
            marker: document.querySelector("[data-runtime-optimization-version='client-split-v1']") !== null,
            h1Count: document.querySelectorAll("h1").length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            hydrationErrors: window.__ILCP_PERF__.hydrationErrors,
            layoutShift: window.__ILCP_PERF__.layoutShift,
            longTasks: window.__ILCP_PERF__.longTasks,
            actionCount: document.querySelectorAll(".printable-action-controls button").length,
            fixedHeaderSize: (() => {
              const slot = document.querySelector("[data-ad-size-policy='fixed-header-v1']");
              if (!slot) return null;
              const rect = slot.getBoundingClientRect();
              return { width: Math.round(rect.width), height: Math.round(rect.height) };
            })(),
            adLayoutMarker: document.querySelector("[data-ad-layout-version='manual-six-v2']") !== null,
            initialJs: performance.getEntriesByType("resource")
              .filter((entry) => entry.name.includes("/_next/static/") && /\.js(?:\?|$)/.test(entry.name))
              .map((entry) => ({ name: entry.name.split("/").pop().split("?")[0], duration: entry.duration })),
          }));
          const initialNames = new Set(snapshot.initialJs.map((entry) => entry.name));
          const unexpectedHeavy = [...heavyChunkNames].filter((name) => initialNames.has(name));
          const initialBytes = sumChunkBytes(initialNames, chunkByName);
          const expectedStatus = route === "/missing-client-bundle-route" ? 404 : 200;
          const passed = response?.status() === expectedStatus
            && snapshot.marker
            && snapshot.h1Count === 1
            && !snapshot.horizontalOverflow
            && snapshot.hydrationErrors.length === 0
            && consoleErrors.length === 0
            && networkErrors.length === 0
            && unexpectedHeavy.length === 0
            && (route !== PRINTABLE_ROUTE || snapshot.actionCount >= 5);
          checks.push({ route, width, passed, consoleErrors, networkErrors, unexpectedHeavy, initialBytes, ...snapshot });
          if (!passed) failures.push(`${browserId}:${route}@${width}`);

          if (browserId === "chrome" && route === PRINTABLE_ROUTE && [390, 1440].includes(width)) {
            const filename = `chrome-${width}-printable-initial.png`;
            await page.screenshot({ path: path.join(REVIEW_DIR, filename), fullPage: false });
            evidence.push(`pipeline/review/client-bundle-hydration/${filename}`);
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { checks, failures };
}

async function runPrintableActions(browser, baseUrl, chunkByName, heavyChunkNames) {
  const pdf = await runDownloadAction(browser, baseUrl, "Download PDF", "pdf", chunkByName, heavyChunkNames, true);
  const png = await runDownloadAction(browser, baseUrl, "Download PNG", "png", chunkByName, heavyChunkNames, false);
  const jpg = await runDownloadAction(browser, baseUrl, "Download JPG", "jpg", chunkByName, heavyChunkNames, false);
  const webp = await runDownloadAction(browser, baseUrl, "Download WebP", "webp", chunkByName, heavyChunkNames, false);
  const print = await runPrintAction(browser, baseUrl, chunkByName, heavyChunkNames);
  const passed = [pdf, png, jpg, webp, print].every((entry) => entry.passed)
    && pdf.byteLength === EXPECTED_PDF_BYTES
    && webp.loadedHeavyPrintableChunk === false;
  return { passed, pdf, png, jpg, webp, print };
}

async function runDownloadAction(browser, baseUrl, buttonName, format, chunkByName, heavyChunkNames, repeat) {
  const context = await browser.newContext({ acceptDownloads: true });
  await installMeasurementHarness(context);
  await blockAdvertising(context);
  const page = await context.newPage();
  const actionErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") actionErrors.push(message.text());
  });
  page.on("pageerror", (error) => actionErrors.push(error.message));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}${PRINTABLE_ROUTE}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(750);
    const initialNames = new Set(await readJavascriptNames(page));
    const beforeLongTasks = await readLongTasks(page);
    const button = format === "pdf"
      ? page.locator(".printable-pdf-download")
      : page.locator(`.download-option-button[aria-label^="${buttonName} for "]`);
    await button.waitFor({ state: "visible", timeout: 15_000 });
    const startedAt = performance.now();
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      button.click(),
    ]);
    const firstDurationMs = round2(performance.now() - startedAt);
    const downloadPath = await download.path();
    const bytes = await readFile(downloadPath);
    const metadata = format === "png" || format === "jpg" || format === "webp" ? await sharp(bytes).metadata() : null;
    const afterNames = new Set(await readJavascriptNames(page));
    const newlyLoaded = [...afterNames].filter((name) => !initialNames.has(name)).sort();
    const loadedHeavyPrintableChunk = newlyLoaded.some((name) => chunkByName.get(name)?.signatures?.hasPdfWriter);
    let repeatResult = null;
    if (repeat) {
      const beforeRepeatNames = new Set(afterNames);
      const repeatStarted = performance.now();
      const [repeatDownload] = await Promise.all([
        page.waitForEvent("download", { timeout: 45_000 }),
        button.click(),
      ]);
      const repeatBytes = await readFile(await repeatDownload.path());
      const afterRepeatNames = new Set(await readJavascriptNames(page));
      repeatResult = {
        durationMs: round2(performance.now() - repeatStarted),
        byteIdentical: Buffer.compare(bytes, repeatBytes) === 0,
        newChunkCount: [...afterRepeatNames].filter((name) => !beforeRepeatNames.has(name)).length,
      };
    }
    const longTasks = (await readLongTasks(page)).slice(beforeLongTasks.length);
    const expectedMagic = format === "pdf" ? "%PDF" : null;
    const magic = bytes.subarray(0, 4).toString("ascii");
    const expectedDimensions = format === "png" || format === "jpg" ? [2550, 3300] : null;
    const passed = download.suggestedFilename().endsWith(`.${format}`)
      && (!expectedMagic || magic === expectedMagic)
      && (!expectedDimensions || (metadata.width === expectedDimensions[0] && metadata.height === expectedDimensions[1]))
      && (format !== "pdf" || bytes.length === EXPECTED_PDF_BYTES)
      && (format !== "webp" || !loadedHeavyPrintableChunk)
      && (!repeatResult || (repeatResult.byteIdentical && repeatResult.newChunkCount === 0));
    return {
      passed,
      format,
      filename: download.suggestedFilename(),
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      magic,
      dimensions: metadata ? { width: metadata.width, height: metadata.height, format: metadata.format } : null,
      initialJavaScript: sumChunkBytes(initialNames, chunkByName),
      newlyLoaded,
      deferredJavaScript: sumChunkBytes(new Set(newlyLoaded), chunkByName),
      loadedHeavyPrintableChunk,
      firstDurationMs,
      repeat: repeatResult,
      longTasks,
      maxLongTaskMs: Math.max(0, ...longTasks.map((entry) => entry.duration)),
      initialHeavyChunks: [...heavyChunkNames].filter((name) => initialNames.has(name)),
    };
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      pdfButtonCount: document.querySelectorAll(".printable-pdf-download").length,
      status: [...document.querySelectorAll("[aria-live]")].map((element) => element.textContent?.trim() || ""),
    })).catch(() => null);
    throw new Error(`${format.toUpperCase()} browser action failed: ${firstLine(error)}; ${JSON.stringify({ diagnostics, actionErrors })}`, { cause: error });
  } finally {
    await context.close();
  }
}

async function runPrintAction(browser, baseUrl, chunkByName, heavyChunkNames) {
  const context = await browser.newContext();
  await installMeasurementHarness(context);
  await blockAdvertising(context);
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}${PRINTABLE_ROUTE}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(750);
    const initialNames = new Set(await readJavascriptNames(page));
    const openedAt = performance.now();
    await page.getByRole("button", { name: "Print", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector(".print-preview-media img") !== null, null, { timeout: 30_000 });
    const previewReadyMs = round2(performance.now() - openedAt);
    const afterPreview = new Set(await readJavascriptNames(page));
    const printStartedAt = performance.now();
    await dialog.getByRole("button", { name: "Print", exact: true }).click();
    await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pdfByteLength > 0, null, { timeout: 45_000 });
    const qa = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
    const afterPrint = new Set(await readJavascriptNames(page));
    const newlyLoaded = [...afterPrint].filter((name) => !initialNames.has(name)).sort();
    const passed = qa.pageCount === 1
      && qa.pageSize === "letter-portrait"
      && qa.pdfByteLength === EXPECTED_PDF_BYTES
      && qa.metadataTitle === "Animals Alligator - iLoveColoringPage.com"
      && [...heavyChunkNames].every((name) => !initialNames.has(name));
    return {
      passed,
      previewReadyMs,
      printPreparationMs: round2(performance.now() - printStartedAt),
      newlyLoaded,
      deferredJavaScript: sumChunkBytes(new Set(newlyLoaded), chunkByName),
      qa,
    };
  } finally {
    await context.close();
  }
}

async function installMeasurementHarness(context) {
  await context.addInitScript(() => {
    window.__ILCP_PERF__ = { longTasks: [], layoutShift: 0, hydrationErrors: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__ILCP_PERF__.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__ILCP_PERF__.layoutShift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    window.addEventListener("error", (event) => {
      if (/hydration|did not match/i.test(event.message || "")) window.__ILCP_PERF__.hydrationErrors.push(event.message);
    });
  });
}

async function blockAdvertising(context) {
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i, (route) => route.abort("blockedbyclient"));
}

async function readJavascriptNames(page) {
  return page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/_next/static/") && /\.js(?:\?|$)/.test(entry.name))
    .map((entry) => entry.name.split("/").pop().split("?")[0]));
}

async function readLongTasks(page) {
  return page.evaluate(() => window.__ILCP_PERF__.longTasks.slice());
}

function sumChunkBytes(names, chunkByName) {
  const chunks = [...names].map((name) => chunkByName.get(name)).filter(Boolean);
  return {
    count: chunks.length,
    rawBytes: chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0),
    gzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
  };
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname).replace(/\\/g, "/");
    if (pathname.includes("..")) return send404(response);
    if (pathname === "/") pathname = "/index.html";
    let filePath = path.join(OUT, pathname.replace(/^\/+/, ""));
    if (!path.extname(filePath) && existsSync(`${filePath}.html`)) filePath = `${filePath}.html`;
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return send404(response);
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType(filePath));
    response.setHeader("Cache-Control", "no-store");
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(3005, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function send404(response) {
  const filePath = path.join(OUT, "404.html");
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  createReadStream(filePath).pipe(response);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html" || extension === ".txt") return extension === ".html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function firstLine(error) {
  return String(error?.message || error).split(/\r?\n/)[0];
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll("\\", "/");
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
