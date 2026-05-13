#!/usr/bin/env node

const { createReadStream, existsSync, statSync } = require("node:fs");
const { mkdir, mkdtemp, readFile, realpath, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "round-5p-browser-qa";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "round-5p", "screenshots");
const QA_MANIFEST = path.join(REPO_ROOT, "pipeline", "manifests", "round-5p-browser-qa-results.json");
const QA_REPORT = path.join(REPO_ROOT, "pipeline", "reports", "round-5p-browser-qa-report.md");
const DEFAULT_APP_URL = "http://127.0.0.1:3005";
const DEFAULT_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";
const MEDIA_ROOT = "pipeline/r2-upload-optimized";
const PAGES = [
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
];
const DOWNLOAD_FORMATS = [
  { format: "png", label: "PNG", extension: ".png", magic: isPng },
  { format: "jpg", label: "JPG", extension: ".jpg", magic: isJpeg },
  { format: "webp", label: "WebP", extension: ".webp", magic: isWebp },
];
const STATIC_CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

main().catch(async (error) => {
  const payload = makeNotRunPayload({
    appUrl: DEFAULT_APP_URL,
    assetBaseUrl: DEFAULT_ASSET_BASE_URL,
    reason: error?.message || String(error),
  });
  await writeJson(QA_MANIFEST, payload);
  await writeText(QA_REPORT, renderReport(payload));
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = normalizeUrl(args.appUrl || process.env.ROUND_5P_APP_URL || DEFAULT_APP_URL);
  const assetBaseUrl = normalizeUrl(args.assetBaseUrl || process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || DEFAULT_ASSET_BASE_URL);
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  let staticServer = null;
  if (args.serveOut) {
    staticServer = await startStaticServer(path.join(REPO_ROOT, "out"), appUrl);
  }

  try {
    if (!(await isReachable(`${appUrl}/coloring-pages`))) {
      const payload = makeNotRunPayload({ appUrl, assetBaseUrl, reason: `Static preview is not reachable at ${appUrl}.` });
      await writeJson(QA_MANIFEST, payload);
      await writeText(QA_REPORT, renderReport(payload));
      console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason: payload.blockers[0] }, null, 2));
      process.exitCode = 1;
      return;
    }

    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      const payload = makeNotRunPayload({ appUrl, assetBaseUrl, reason: "Playwright is not installed in this project." });
      await writeJson(QA_MANIFEST, payload);
      await writeText(QA_REPORT, renderReport(payload));
      console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason: payload.blockers[0] }, null, 2));
      process.exitCode = 1;
      return;
    }

    const payload = await runBrowserQa(playwright, appUrl, assetBaseUrl);
    await writeJson(QA_MANIFEST, payload);
    await writeText(QA_REPORT, renderReport(payload));
    console.log(JSON.stringify({
      runId: RUN_ID,
      status: payload.summary.status,
      webpPreviewRenders: payload.summary.galleryWebpPreviewsRender,
      downloadsPngJpgWebpReady: payload.summary.downloadsPngJpgWebpReady,
      printReady: payload.summary.printReady,
      blockers: payload.blockers.length,
    }, null, 2));
    if (payload.blockers.length) process.exitCode = 1;
  } finally {
    if (staticServer) await new Promise((resolve) => staticServer.close(resolve));
  }
}

async function runBrowserQa(playwright, appUrl, assetBaseUrl) {
  const downloadDir = await mkdtemp(path.join(os.tmpdir(), "round-5p-downloads-"));
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const pages = [];
  const screenshotPaths = [];
  let downloadResults = [];
  let printResult = { attempted: false, passed: false, source: null, details: "Print was not tested." };
  let canvasProbe = { attempted: false, passed: false, svgLoaded: false, details: "Canvas probe was not tested." };

  try {
    for (const route of PAGES) {
      const page = await context.newPage();
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      const metrics = await collectPageMetrics(page, assetBaseUrl);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.replace(/^\/+/, "").replace(/\//g, "-")}-optimized-1440.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewportWidth: 1440, ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    const testPage = await context.newPage();
    await testPage.goto(`${appUrl}/coloring-pages`, { waitUntil: "networkidle" });
    await testPage.waitForTimeout(900);
    canvasProbe = await runCanvasProbe(testPage, assetBaseUrl);
    downloadResults = await runDownloadChecks(testPage, downloadDir);
    printResult = await runPrintCheck(testPage);
    await testPage.close();
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    status: "completed",
    mediaRoot: MEDIA_ROOT,
    assetBaseUsed: assetBaseUrl,
    pagesInspected: PAGES,
    pageCount: pages.length,
    galleryWebpPreviewsRender: pages.some((page) => page.webpImageCount > 0),
    noBrokenPreviews: pages.every((page) => page.visibleBrokenImageCount === 0),
    localOptimizedMediaServerUsed: assetBaseUrl.includes("127.0.0.1") || assetBaseUrl.includes("localhost"),
    internalSvgLoads: canvasProbe.svgLoaded === true,
    browserCanvasExportPassed: canvasProbe.passed === true,
    printReady: printResult.passed === true,
    pngDownloadReady: downloadResults.some((result) => result.format === "png" && result.passed),
    jpgDownloadReady: downloadResults.some((result) => result.format === "jpg" && result.passed),
    webpDownloadReady: downloadResults.some((result) => result.format === "webp" && result.passed),
    downloadsPngJpgWebpReady: DOWNLOAD_FORMATS.every((format) => downloadResults.some((result) => result.format === format.format && result.passed)),
    svgDownloadAbsent: pages.every((page) => page.svgDownloadVisibleCount === 0),
    jpgJpegWebpVisibleThroughDownloadControl: pages.every((page) => page.downloadMenuCount > 0 && page.jpgOptionCount > 0 && page.webpOptionCount > 0),
    adDensityMatchesRound4U: pages.every((page) => page.visibleAdCount <= 1 || page.visibleAdCount === 3),
    horizontalOverflowDetected: pages.some((page) => page.horizontalOverflow),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
    staticExportCompatible: existsSync(path.join(REPO_ROOT, "out")),
    screenshotsDirectory: "pipeline/review/round-5p/screenshots",
  };

  const blockers = summarizeBlockers(summary);
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    assetBaseUrl: redactUrl(assetBaseUrl),
    summary,
    pages,
    canvasProbe,
    downloadResults,
    printResult,
    screenshotPaths,
    blockers,
  };
}

async function collectPageMetrics(page, assetBaseUrl) {
  return page.evaluate(({ assetBaseUrl }) => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const normalizedBase = assetBaseUrl.replace(/\/+$/, "");
    const failedImages = [...document.images].filter((img) => img.naturalWidth === 0);
    const visibleBrokenImages = failedImages.filter(visible);
    const actionText = [...document.querySelectorAll("button, summary, a")].map((node) => (node.textContent || "").trim()).join("\n");
    const adSlots = [...document.querySelectorAll('[data-ad-slot-id], .ad-slot, [aria-label*="Advertisement"]')].filter(visible);
    return {
      imageSources: [...document.images].map((img) => img.currentSrc || img.src).filter(Boolean).slice(0, 40),
      webpImageCount: [...document.images].filter((img) => {
        const src = img.currentSrc || img.src || "";
        return src.startsWith(`${normalizedBase}/webp/`) && img.naturalWidth > 0;
      }).length,
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
  }, { assetBaseUrl });
}

async function runCanvasProbe(page, assetBaseUrl) {
  const objectMap = JSON.parse(await readFile(path.join(REPO_ROOT, "pipeline", "manifests", "round-5n-clean-upload-object-key-map.json"), "utf8"));
  const record = objectMap.records.find((item) => item.cleanSvgObjectKey.includes("/animals/")) || objectMap.records[0];
  const svgUrl = `${assetBaseUrl.replace(/\/+$/, "")}/${record.cleanSvgObjectKey.replace(/^coloring-pages\//, "")}`;
  return page.evaluate(async ({ svgUrl }) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const loaded = new Promise((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
    });
    image.src = svgUrl;
    const svgLoaded = await loaded;
    if (!svgLoaded) return { attempted: true, passed: false, svgLoaded: false, svgUrl, details: "SVG image did not load." };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth || image.width || 1200);
    canvas.height = Math.max(1, image.naturalHeight || image.height || 1200);
    const context = canvas.getContext("2d");
    if (!context) return { attempted: true, passed: false, svgLoaded: true, svgUrl, details: "Canvas context unavailable." };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    return {
      attempted: true,
      passed: Boolean(blob && blob.size > 0 && blob.type === "image/webp"),
      svgLoaded: true,
      svgUrl,
      width: canvas.width,
      height: canvas.height,
      blobType: blob?.type || "",
      blobSize: blob?.size || 0,
      details: blob ? "SVG rendered to canvas and exported to WebP." : "Canvas export failed.",
    };
  }, { svgUrl });
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
      details: source === "internal-svg" ? "Print popup used generated internal SVG raster output." : "Print popup used fallback or did not expose generated output.",
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

function summarizeBlockers(summary) {
  const blockers = [];
  if (!summary.galleryWebpPreviewsRender) blockers.push("Optimized WebP previews did not render.");
  if (!summary.noBrokenPreviews) blockers.push("Visible broken preview images were found.");
  if (!summary.browserCanvasExportPassed) blockers.push("SVG-to-canvas export failed.");
  if (!summary.printReady) blockers.push("Print did not use internal SVG-derived output.");
  if (!summary.downloadsPngJpgWebpReady) blockers.push("PNG/JPG/WebP download QA failed.");
  if (!summary.svgDownloadAbsent) blockers.push("SVG download was visible.");
  if (!summary.adDensityMatchesRound4U) blockers.push("Ad density did not match Round 4U limits.");
  if (summary.horizontalOverflowDetected) blockers.push("Horizontal overflow was detected.");
  if (summary.appApiRoutePresent) blockers.push("app/api route exists.");
  return blockers;
}

function makeNotRunPayload({ appUrl, assetBaseUrl, reason }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    appUrl,
    assetBaseUrl: redactUrl(assetBaseUrl),
    summary: {
      status: "not_run",
      mediaRoot: MEDIA_ROOT,
      assetBaseUsed: assetBaseUrl,
      pagesInspected: PAGES,
      galleryWebpPreviewsRender: false,
      noBrokenPreviews: false,
      internalSvgLoads: false,
      browserCanvasExportPassed: false,
      printReady: false,
      downloadsPngJpgWebpReady: false,
      svgDownloadAbsent: true,
      adDensityMatchesRound4U: null,
      horizontalOverflowDetected: null,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      screenshotsDirectory: "pipeline/review/round-5p/screenshots",
    },
    pages: [],
    canvasProbe: null,
    downloadResults: [],
    printResult: null,
    screenshotPaths: [],
    blockers: [reason],
  };
}

function renderReport(payload) {
  return `# Round 5P Browser QA Report

- Status: ${payload.summary.status}
- Media root: ${payload.summary.mediaRoot}
- Asset base: ${payload.summary.assetBaseUsed}
- Pages inspected: ${payload.summary.pagesInspected.join(", ")}
- Gallery WebP previews render: ${payload.summary.galleryWebpPreviewsRender}
- No broken previews: ${payload.summary.noBrokenPreviews}
- Browser canvas export passed: ${payload.summary.browserCanvasExportPassed}
- Print ready: ${payload.summary.printReady}
- PNG/JPG/WebP downloads ready: ${payload.summary.downloadsPngJpgWebpReady}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Ad density matches Round 4U: ${payload.summary.adDensityMatchesRound4U}
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

async function startStaticServer(rootPath, appUrl) {
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    throw new Error(`Static output directory does not exist: ${path.relative(REPO_ROOT, rootPath)}`);
  }
  const root = await realpath(rootPath);
  const url = new URL(appUrl);
  const host = url.hostname;
  const port = Number(url.port || 80);
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }
    const target = await resolveStaticTarget(root, request.url || "/");
    if (!target.ok) {
      response.writeHead(target.status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(target.message);
      return;
    }
    const contentType = STATIC_CONTENT_TYPES.get(path.extname(target.filePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": target.size,
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(target.filePath).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function resolveStaticTarget(root, requestUrl) {
  let pathname = "/";
  try {
    pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  } catch {
    return { ok: false, status: 400, message: "Bad request" };
  }
  let decoded = "";
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { ok: false, status: 400, message: "Bad path encoding" };
  }
  const relativePath = decoded.replace(/^\/+/, "");
  const candidates = [];
  if (!relativePath) candidates.push("index.html");
  else {
    candidates.push(relativePath);
    candidates.push(`${relativePath}.html`);
    candidates.push(path.join(relativePath, "index.html"));
  }
  for (const candidatePath of candidates) {
    const candidate = path.resolve(root, candidatePath);
    if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) continue;
    try {
      const actualPath = await realpath(candidate);
      if (!actualPath.startsWith(`${root}${path.sep}`)) continue;
      const fileStat = statSync(actualPath);
      if (fileStat.isFile()) return { ok: true, filePath: actualPath, size: fileStat.size };
    } catch {}
  }
  return { ok: false, status: 404, message: "Not found" };
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function writeJson(target, payload) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(target, text) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${text.replace(/\s+$/u, "")}\n`, "utf8");
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

function parseArgs(rawArgs) {
  const parsed = { serveOut: false };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--serve-out") parsed.serveOut = true;
    else if (arg === "--app-url") parsed.appUrl = rawArgs[++index];
    else if (arg.startsWith("--app-url=")) parsed.appUrl = arg.slice("--app-url=".length);
    else if (arg === "--asset-base-url") parsed.assetBaseUrl = rawArgs[++index];
    else if (arg.startsWith("--asset-base-url=")) parsed.assetBaseUrl = arg.slice("--asset-base-url=".length);
    else throw new Error(`Unknown Round 5P browser QA option: ${arg}`);
  }
  return parsed;
}
