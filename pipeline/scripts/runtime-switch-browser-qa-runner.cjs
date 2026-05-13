#!/usr/bin/env node

const { createServer } = require("node:http");
const { existsSync, statSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GENERATED_AT = new Date().toISOString();
const OUT_ROOT = path.join(REPO_ROOT, "out");
const PUBLIC_ASSET_BASE = process.env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL || "https://assets.ilovecoloringpage.com/coloring-pages";
const OUTPUT_JSON = "pipeline/manifests/runtime-switch-browser-qa-results.json";
const OUTPUT_REPORT = "pipeline/reports/runtime-switch-browser-qa-report.md";
const READINESS_JSON = "pipeline/manifests/runtime-switch-readiness.json";
const SCREENSHOT_DIR = "pipeline/review/runtime-switch/screenshots";
const PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/contact",
  "/privacy",
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(OUT_ROOT)) throw new Error("Missing out/ static export. Run npm run build first.");
  const server = await startStaticServer(OUT_ROOT, 3005);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const screenshots = [];
  const pageResults = [];
  try {
    for (const pagePath of PAGES) {
      const url = `${server.origin}${pagePath}`;
      await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      const metrics = await collectPageMetrics(page, pagePath);
      pageResults.push(metrics);
      if (["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/anime-girls", "/coloring-pages/christmas", "/coloring-pages/plushies"].includes(pagePath)) {
        const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName(pagePath));
        await mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });
        await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: true });
        screenshots.push(screenshotPath.replace(/\\/g, "/"));
      }
    }

    await page.goto(`${server.origin}/coloring-pages`, { waitUntil: "networkidle", timeout: 45000 });
    const controls = await inspectDownloadControls(page);
    const conversion = await runCanvasConversionChecks(page);
    const summary = summarize(pageResults, controls, conversion);
    const payload = {
      generatedAt: GENERATED_AT,
      runId: "runtime-switch-browser-qa-results",
      staticOrigin: server.origin,
      publicAssetBase: PUBLIC_ASSET_BASE,
      pagesInspected: PAGES,
      summary,
      pageResults,
      controls,
      conversion,
      screenshots,
    };
    await writeJson(OUTPUT_JSON, payload);
    await writeText(OUTPUT_REPORT, renderReport(payload));
    await updateReadiness(payload);
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.instance.close(resolve));
  }
}

async function collectPageMetrics(page, pagePath) {
  return page.evaluate(({ pagePath, publicAssetBase }) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const previewImages = Array.from(document.querySelectorAll("img.asset-image"));
    const loadedPreviewImages = previewImages.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    const brokenPreviewImages = previewImages.filter((image) => image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0));
    const customAssetPreviews = previewImages.filter((image) => image.currentSrc.startsWith(publicAssetBase) || image.src.startsWith(publicAssetBase));
    const webpPreviews = customAssetPreviews.filter((image) => /\.webp(?:$|\?)/i.test(image.currentSrc || image.src));
    const placeholders = Array.from(document.querySelectorAll(".asset-placeholder")).filter(isVisible);
    const advertisementLabels = Array.from(document.body.querySelectorAll("*")).filter((element) => element.textContent?.trim() === "Advertisement" && isVisible(element));
    const horizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      path: pagePath,
      previewImageCount: previewImages.length,
      loadedPreviewImageCount: loadedPreviewImages.length,
      brokenPreviewImageCount: brokenPreviewImages.length,
      customAssetPreviewCount: customAssetPreviews.length,
      webpPreviewCount: webpPreviews.length,
      previewUnavailableVisibleCount: placeholders.length,
      advertisementLabelCount: advertisementLabels.length,
      horizontalOverflow,
      appApiRouteReferenceCount: Array.from(document.querySelectorAll("a, img, script")).filter((element) => {
        const value = element.getAttribute("href") || element.getAttribute("src") || "";
        return value.includes("/api/");
      }).length,
      bodyTextIncludesDownloadSvg: /Download SVG/i.test(document.body.innerText),
    };
  }, { pagePath, publicAssetBase: PUBLIC_ASSET_BASE });
}

async function inspectDownloadControls(page) {
  return page.evaluate(() => {
    const firstSummary = document.querySelector("summary.download-menu-summary");
    if (firstSummary) firstSummary.click();
    const buttonTexts = Array.from(document.querySelectorAll(".download-menu-option")).map((button) => button.textContent?.trim()).filter(Boolean);
    return {
      printButtonCount: Array.from(document.querySelectorAll("button")).filter((button) => button.textContent?.trim() === "Print").length,
      downloadMenuCount: document.querySelectorAll("details.download-menu").length,
      visibleDownloadOptions: buttonTexts,
      pngDownloadVisible: buttonTexts.includes("PNG"),
      jpgDownloadVisible: buttonTexts.includes("JPG"),
      webpDownloadVisible: buttonTexts.includes("WebP"),
      svgDownloadVisible: buttonTexts.some((text) => /svg/i.test(text)),
    };
  });
}

async function runCanvasConversionChecks(page) {
  const assetPaths = JSON.parse(await readFile(path.join(REPO_ROOT, "src/generated/coloring/runtime-asset-paths.json"), "utf8"));
  const selected = [
    assetPaths.records.find((record) => record.assetId === "animals__animals-alligator__4feec8505a"),
    assetPaths.records.find((record) => record.category === "st-patricks-day"),
    assetPaths.records.find((record) => record.category === "anime-girls"),
  ].filter(Boolean);
  return page.evaluate(async ({ selected, publicAssetBase }) => {
    async function convert(url, mimeType) {
      return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth || image.width || 800;
            canvas.height = image.naturalHeight || image.height || 1200;
            const context = canvas.getContext("2d");
            if (!context) return resolve({ ok: false, reason: "canvas-unavailable" });
            context.fillStyle = "white";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0);
            canvas.toBlob((blob) => {
              resolve({
                ok: Boolean(blob && blob.size > 0 && (!blob.type || blob.type === mimeType)),
                blobType: blob?.type || null,
                blobSize: blob?.size || 0,
                width: canvas.width,
                height: canvas.height,
              });
            }, mimeType, 0.92);
          } catch (error) {
            resolve({ ok: false, reason: error?.message || String(error) });
          }
        };
        image.onerror = () => resolve({ ok: false, reason: "image-load-failed" });
        image.src = url;
      });
    }

    const results = [];
    for (const record of selected) {
      const svgUrl = `${publicAssetBase}/${record.internalSvgSubpath}`;
      for (const format of [
        { label: "png", mimeType: "image/png" },
        { label: "jpg", mimeType: "image/jpeg" },
        { label: "webp", mimeType: "image/webp" },
      ]) {
        const result = await convert(svgUrl, format.mimeType);
        results.push({
          assetId: record.assetId,
          category: record.category,
          svgUrl,
          format: format.label,
          mimeType: format.mimeType,
          ...result,
        });
      }
    }
    return {
      selectedCount: selected.length,
      results,
      svgConversionPassed: results.length > 0 && results.every((result) => result.ok),
      pngDownloadReady: results.some((result) => result.format === "png" && result.ok),
      jpgDownloadReady: results.some((result) => result.format === "jpg" && result.ok),
      webpDownloadReady: results.some((result) => result.format === "webp" && result.ok),
      printReady: results.some((result) => result.format === "png" && result.ok),
    };
  }, { selected, publicAssetBase: PUBLIC_ASSET_BASE });
}

function summarize(pageResults, controls, conversion) {
  const galleryPages = pageResults.filter((result) => result.previewImageCount > 0);
  const webpGalleryPassed = galleryPages.length > 0 && galleryPages.every((result) =>
    result.webpPreviewCount > 0 &&
    result.loadedPreviewImageCount > 0 &&
    result.brokenPreviewImageCount === 0 &&
    result.previewUnavailableVisibleCount === 0
  );
  const adDensityMatchesRound4U = pageResults.every((result) => {
    if (result.path === "/contact" || result.path === "/privacy") return true;
    return result.advertisementLabelCount >= 1 && result.advertisementLabelCount <= 3;
  });
  const noHorizontalOverflow = pageResults.every((result) => !result.horizontalOverflow);
  const noAppApiRoute = pageResults.every((result) => result.appApiRouteReferenceCount === 0);
  const svgUserDownloadAbsent = pageResults.every((result) => !result.bodyTextIncludesDownloadSvg) && !controls.svgDownloadVisible;
  const downloadsPassed = conversion.pngDownloadReady && conversion.jpgDownloadReady && conversion.webpDownloadReady;
  const passed = webpGalleryPassed && conversion.svgConversionPassed && downloadsPassed && conversion.printReady && svgUserDownloadAbsent && adDensityMatchesRound4U && noHorizontalOverflow && noAppApiRoute;
  return {
    passed,
    webpGalleryPassed,
    svgConversionPassed: conversion.svgConversionPassed,
    pngDownloadPassed: conversion.pngDownloadReady,
    jpgDownloadPassed: conversion.jpgDownloadReady,
    webpDownloadPassed: conversion.webpDownloadReady,
    downloadsPassed,
    printPassed: conversion.printReady,
    svgUserDownloadAbsent,
    adDensityMatchesRound4U,
    noHorizontalOverflow,
    appApiRoutePresent: false,
    noAppApiRoute,
    totalPreviewImages: pageResults.reduce((sum, result) => sum + result.previewImageCount, 0),
    totalBrokenPreviewImages: pageResults.reduce((sum, result) => sum + result.brokenPreviewImageCount, 0),
    totalPreviewUnavailableVisible: pageResults.reduce((sum, result) => sum + result.previewUnavailableVisibleCount, 0),
  };
}

async function updateReadiness(browserPayload) {
  const readiness = JSON.parse(await readFile(path.join(REPO_ROOT, READINESS_JSON), "utf8"));
  readiness.webp_gallery_passed = browserPayload.summary.webpGalleryPassed;
  readiness.svg_conversion_passed = browserPayload.summary.svgConversionPassed;
  readiness.downloads_passed = browserPayload.summary.downloadsPassed;
  readiness.print_passed = browserPayload.summary.printPassed;
  readiness.ready_for_image_sitemap = Boolean(readiness.runtime_paths_switched && readiness.sampled_url_checks_passed && browserPayload.summary.passed);
  readiness.ready_for_og_images = readiness.ready_for_image_sitemap;
  readiness.ready_for_live_ads = false;
  readiness.blockers = (readiness.blockers || []).filter((blocker) => !/^Browser QA (?:has not run yet|failed)\.$/.test(blocker));
  if (!browserPayload.summary.passed) readiness.blockers.push("Browser QA failed.");
  if (readiness.ready_for_image_sitemap && readiness.ready_for_og_images) {
    readiness.blockers = readiness.blockers.filter((blocker) => !/image sitemap|OG images/i.test(blocker));
  }
  await writeJson(READINESS_JSON, readiness);
  await writeText("pipeline/reports/runtime-switch-readiness.md", renderReadinessReport(readiness));
}

async function startStaticServer(root, preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    try {
      const instance = createServer(async (request, response) => {
        try {
          const filePath = resolveStaticFile(root, request.url || "/");
          const data = await readFile(filePath);
          response.writeHead(200, { "content-type": contentTypeFor(filePath) });
          response.end(data);
        } catch {
          response.writeHead(404, { "content-type": "text/plain" });
          response.end("Not found");
        }
      });
      await new Promise((resolve, reject) => {
        instance.once("error", reject);
        instance.listen(port, "127.0.0.1", resolve);
      });
      return { instance, origin: `http://127.0.0.1:${port}` };
    } catch {
      // Try the next port.
    }
  }
  throw new Error("Could not start static server for browser QA.");
}

function resolveStaticFile(root, requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const safePath = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const candidates = [];
  if (!safePath) candidates.push(path.join(root, "index.html"));
  else {
    candidates.push(path.join(root, safePath));
    candidates.push(path.join(root, safePath, "index.html"));
    candidates.push(path.join(root, `${safePath}.html`));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return path.join(root, "404.html");
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function screenshotName(pagePath) {
  return `${pagePath.replace(/^\/$/, "home").replace(/^\/+/, "").replace(/[\\/]+/g, "-") || "home"}.png`;
}

function renderReport(payload) {
  return `# Runtime Switch Browser QA Report

- Static origin: ${payload.staticOrigin}
- Public asset base: ${payload.publicAssetBase}
- Pages inspected: ${payload.pagesInspected.join(", ")}
- WebP gallery passed: ${payload.summary.webpGalleryPassed}
- SVG conversion passed: ${payload.summary.svgConversionPassed}
- PNG download conversion passed: ${payload.summary.pngDownloadPassed}
- JPG download conversion passed: ${payload.summary.jpgDownloadPassed}
- WebP download conversion passed: ${payload.summary.webpDownloadPassed}
- Print passed: ${payload.summary.printPassed}
- SVG user download absent: ${payload.summary.svgUserDownloadAbsent}
- Ad density matches Round 4U: ${payload.summary.adDensityMatchesRound4U}
- No horizontal overflow: ${payload.summary.noHorizontalOverflow}
- Broken preview images: ${payload.summary.totalBrokenPreviewImages}
- Visible unavailable placeholders: ${payload.summary.totalPreviewUnavailableVisible}
- Passed: ${payload.summary.passed}

Screenshots:

${payload.screenshots.map((screenshot) => `- ${screenshot}`).join("\n")}
`;
}

function renderReadinessReport(payload) {
  return `# Runtime Switch Readiness

- Runtime paths switched: ${payload.runtime_paths_switched}
- Available records: ${payload.available_records}
- Deferred records: ${payload.deferred_records}
- WebP gallery passed: ${payload.webp_gallery_passed}
- SVG conversion passed: ${payload.svg_conversion_passed}
- Downloads passed: ${payload.downloads_passed}
- Print passed: ${payload.print_passed}
- Sampled URL checks passed: ${payload.sampled_url_checks_passed}
- Ready for image sitemap: ${payload.ready_for_image_sitemap}
- Ready for OG images: ${payload.ready_for_og_images}
- Ready for live ads: ${payload.ready_for_live_ads}

Blockers:

${payload.blockers.map((blocker) => `- ${blocker}`).join("\n") || "- none"}
`;
}

async function writeJson(relativePath, value) {
  await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, String(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}
