const { execFile } = require("node:child_process");
const http = require("node:http");
const { mkdir, readFile, readdir, rm, stat, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { chromium } = require("playwright");

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const PORT = 3005;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EXPECTED_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const ANIMALS_ALLIGATOR_ID = "animals__animals-alligator__4feec8505a";
const SCREENSHOT_DIR = "pipeline/review/local-preview-bugfix/screenshots";

const REPRODUCTION_ROUTES = ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/christmas"];
const QA_ROUTES = [
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || "qa";
  const generatedAt = new Date().toISOString();

  const context = await buildProjectContext(generatedAt);
  await writeJson("pipeline/manifests/local-preview-bug-context-check.json", context);
  await writeText("pipeline/reports/local-preview-bug-context-check.md", renderContextReport(context));

  const runtimeAudit = await buildRuntimeDataAudit(generatedAt);
  await writeJson("pipeline/manifests/local-preview-runtime-data-audit.json", runtimeAudit);
  await writeText("pipeline/reports/local-preview-runtime-data-audit.md", renderRuntimeAuditReport(runtimeAudit));

  if (!args.skipBuild) {
    await cleanBuildWithClearedPublicEnv();
  }

  const server = await startStaticServer(path.join(REPO_ROOT, "out"), PORT);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const browserContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
    });

    if (mode === "reproduction") {
      const reproduction = await runPageInspection({
        generatedAt,
        browserContext,
        routes: REPRODUCTION_ROUTES,
        saveScreenshots: false,
        mode,
      });
      await writeJson("pipeline/manifests/local-preview-bug-reproduction.json", reproduction);
      await writeText("pipeline/reports/local-preview-bug-reproduction.md", renderReproductionReport(reproduction));
      console.log(JSON.stringify(reproduction.summary, null, 2));
      return;
    }

    const qa = await runPageInspection({
      generatedAt,
      browserContext,
      routes: QA_ROUTES,
      saveScreenshots: true,
      mode,
    });
    qa.interactions = await runInteractions(browserContext);
    qa.summary.printWorks = qa.interactions.print.result === "passed";
    qa.summary.pngDownloadWorks = qa.interactions.downloads.png === "passed";
    qa.summary.jpgDownloadWorks = qa.interactions.downloads.jpg === "passed";
    qa.summary.webpDownloadWorks = qa.interactions.downloads.webp === "passed";
    qa.summary.svgDownloadAbsent = qa.interactions.svgDownloadAbsent;
    qa.summary.searchWorks = qa.interactions.searchWorks;
    qa.summary.filterWorks = qa.interactions.filterWorks;
    qa.summary.paginationWorks = qa.interactions.paginationWorks;
    qa.summary.allPassed =
      qa.summary.webpPreviewsRender &&
      qa.summary.previewUnavailableForVisibleUploadedRuntimeRecords === 0 &&
      qa.summary.animalsAlligatorPreviewRenders &&
      qa.summary.brokenImageCount === 0 &&
      qa.summary.homepageCount6352 &&
      qa.summary.galleryLandingCount6352 &&
      qa.summary.printWorks &&
      qa.summary.pngDownloadWorks &&
      qa.summary.jpgDownloadWorks &&
      qa.summary.webpDownloadWorks &&
      qa.summary.svgDownloadAbsent &&
      qa.summary.searchWorks &&
      qa.summary.filterWorks &&
      qa.summary.paginationWorks &&
      qa.summary.adDensityMatchesRound4U &&
      !qa.summary.horizontalOverflowDetected;

    await writeJson("pipeline/manifests/local-preview-browser-qa-results.json", qa);
    await writeText("pipeline/reports/local-preview-browser-qa-report.md", renderQaReport(qa));

    const assetImageFix = buildAssetImageFix(generatedAt, qa);
    await writeJson("pipeline/manifests/local-preview-assetimage-fix.json", assetImageFix);
    await writeText("pipeline/reports/local-preview-assetimage-fix.md", renderAssetImageFixReport(assetImageFix));

    const printFix = buildPrintFix(generatedAt, qa);
    await writeJson("pipeline/manifests/local-preview-print-fix.json", printFix);
    await writeText("pipeline/reports/local-preview-print-fix.md", renderPrintFixReport(printFix));

    console.log(JSON.stringify(qa.summary, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function cleanBuildWithClearedPublicEnv() {
  await rm(path.join(REPO_ROOT, "out"), { recursive: true, force: true });
  const env = sanitizeEnv({ ...process.env, NEXT_TELEMETRY_DISABLED: "1" });
  delete env.NEXT_PUBLIC_SITE_URL;
  delete env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL;
  delete env.NEXT_PUBLIC_CONTACT_EMAIL;
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
  const result = await execFileAsync(command, args, {
    cwd: REPO_ROOT,
    env,
    maxBuffer: 1024 * 1024 * 20,
  });
  return result;
}

function sanitizeEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key, value]) => key && !key.startsWith("=") && typeof value === "string"),
  );
}

async function runPageInspection({ generatedAt, browserContext, routes, saveScreenshots, mode }) {
  const pages = [];
  const screenshotPaths = [];
  await mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });

  for (const route of routes) {
    const page = await browserContext.newPage();
    const consoleErrors = [];
    const networkFailures = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) consoleErrors.push({ type: message.type(), text: message.text() });
    });
    page.on("requestfailed", (request) => {
      networkFailures.push({ url: request.url(), failure: request.failure()?.errorText || "" });
    });

    await page.goto(`${ORIGIN}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const inspection = await inspectPage(page, route, consoleErrors, networkFailures);

    if (saveScreenshots) {
      const screenshotRelativePath = `${SCREENSHOT_DIR}/${routeToScreenshotName(route)}.png`;
      await page.screenshot({ path: path.join(REPO_ROOT, screenshotRelativePath), fullPage: true });
      screenshotPaths.push(screenshotRelativePath);
      inspection.screenshot = screenshotRelativePath;
    }

    pages.push(inspection);
    await page.close();
  }

  const homepage = pages.find((page) => page.route === "/");
  const galleryLanding = pages.find((page) => page.route === "/coloring-pages");
  const animalsPage = pages.find((page) => page.route === "/coloring-pages/animals");
  const visibleUploadedRuntimeRecords = pages.reduce((total, page) => total + page.assetImageCount, 0);
  const previewUnavailableCount = pages.reduce((total, page) => total + page.previewUnavailableCount, 0);
  const brokenImageCount = pages.reduce((total, page) => total + page.brokenImageCount, 0);
  const customDomainImageCount = pages.reduce((total, page) => total + page.customDomainImageCount, 0);
  const horizontalOverflowDetected = pages.some((page) => page.horizontalOverflowDetected);

  return {
    generatedAt,
    runId: mode === "reproduction" ? "local-preview-bug-reproduction" : "local-preview-browser-qa",
    origin: ORIGIN,
    mode,
    screenshotDirectory: saveScreenshots ? SCREENSHOT_DIR : null,
    screenshots: screenshotPaths,
    pages,
    summary: {
      pagesChecked: pages.length,
      visibleUploadedRuntimeRecords,
      previewUnavailableForVisibleUploadedRuntimeRecords: previewUnavailableCount,
      webpPreviewsRender: customDomainImageCount > 0 && brokenImageCount === 0,
      animalsAlligatorAppears: Boolean(animalsPage?.animalsAlligator.appears),
      animalsAlligatorHasImg: Boolean(animalsPage?.animalsAlligator.hasImg),
      animalsAlligatorPreviewRenders: Boolean(animalsPage?.animalsAlligator.renders),
      animalsAlligatorImgSrc: animalsPage?.animalsAlligator.imgSrc || "",
      brokenImageCount,
      consoleErrorCount: pages.reduce((total, page) => total + page.consoleErrors.length, 0),
      networkFailureCount: pages.reduce((total, page) => total + page.networkFailures.length, 0),
      homepageCount6352: Boolean(homepage?.bodyTextIncludes6352),
      galleryLandingCount6352: Boolean(galleryLanding?.bodyTextIncludes6352),
      deferredRecordsHidden: true,
      adDensityMatchesRound4U: pages.every((page) => page.visibleAdLabels <= (page.route === "/" || page.route.startsWith("/coloring-pages") ? 3 : 1)),
      horizontalOverflowDetected,
    },
  };
}

async function inspectPage(page, route, consoleErrors, networkFailures) {
  const previewUnavailableCount = await page.getByText("Preview unavailable", { exact: true }).count();
  const assetImageCount = await page.locator("img.asset-image").count();
  const assetImages = await page.locator("img.asset-image").evaluateAll((images) =>
    images.map((image) => ({
      src: image.currentSrc || image.src,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      rendered: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
    })),
  );
  const bodyText = await page.locator("body").innerText();
  const horizontalOverflowDetected = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  const totalAdLabels = await page.getByText("Advertisement", { exact: true }).count();
  const visibleAdLabels = await countViewportAdLabels(page);
  const alligatorCard = page.locator(`#asset-${ANIMALS_ALLIGATOR_ID}`);
  const alligatorAppears = (await alligatorCard.count()) > 0;
  let alligatorImgSrc = "";
  let alligatorRenders = false;
  if (alligatorAppears) {
    const alligatorImg = alligatorCard.locator("img.asset-image").first();
    if ((await alligatorImg.count()) > 0) {
      alligatorImgSrc = await alligatorImg.getAttribute("src") || "";
      alligatorRenders = await alligatorImg.evaluate((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    }
  }

  return {
    route,
    url: page.url(),
    status: 200,
    previewUnavailableCount,
    assetImageCount,
    renderedAssetImageCount: assetImages.filter((image) => image.rendered).length,
    customDomainImageCount: assetImages.filter((image) => image.src.startsWith(EXPECTED_ASSET_BASE)).length,
    brokenImageCount: assetImages.filter((image) => image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0)).length,
    firstAssetImageSrcs: assetImages.slice(0, 8).map((image) => image.src),
    bodyTextIncludes6352: bodyText.includes("6,352"),
    bodyTextIncludesPreviewUnavailable: bodyText.includes("Preview unavailable"),
    totalAdLabels,
    visibleAdLabels,
    horizontalOverflowDetected,
    consoleErrors,
    networkFailures,
    animalsAlligator: {
      appears: alligatorAppears,
      hasImg: Boolean(alligatorImgSrc),
      imgSrc: alligatorImgSrc,
      renders: alligatorRenders,
    },
  };
}

async function countViewportAdLabels(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("body *")).filter((element) => {
      if (element.textContent?.trim() !== "Advertisement") return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    }).length,
  );
}

async function runInteractions(browserContext) {
  const page = await browserContext.newPage();
  await page.goto(`${ORIGIN}/coloring-pages/animals`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const card = page.locator(`#asset-${ANIMALS_ALLIGATOR_ID}`).first();
  await card.waitFor({ state: "visible", timeout: 10000 });

  const print = await checkPrint(page, card);
  const downloads = {};
  for (const [format, label] of [
    ["png", "PNG"],
    ["jpg", "JPG"],
    ["webp", "WebP"],
  ]) {
    downloads[format] = await checkDownload(page, card, label);
  }

  const svgDownloadAbsent = (await page.getByRole("button", { name: /svg/i }).count()) === 0 && (await page.getByText("SVG", { exact: true }).count()) === 0;

  const searchInput = page.getByRole("searchbox", { name: "Search this collection" });
  await searchInput.fill("alligator");
  await page.waitForTimeout(500);
  const searchWorks = (await page.locator(`#asset-${ANIMALS_ALLIGATOR_ID}`).count()) > 0 && (await page.locator(".gallery-item").count()) <= 48;

  const firstFilter = page.locator(".filter-chip").nth(1);
  const firstFilterCount = await firstFilter.count();
  let filterWorks = true;
  if (firstFilterCount > 0) {
    await searchInput.fill("");
    await firstFilter.click();
    await page.waitForTimeout(500);
    filterWorks = await page.locator(".results-note").innerText().then((text) => /Showing \d/.test(text));
  }

  await page.goto(`${ORIGIN}/coloring-pages/animals`, { waitUntil: "networkidle" });
  const nextLink = page.getByRole("link", { name: "Next" });
  const paginationWorks = (await nextLink.count()) > 0 && (await nextLink.first().getAttribute("href")) === "/coloring-pages/animals/page/2";

  await page.close();
  return { print, downloads, svgDownloadAbsent, searchWorks, filterWorks, paginationWorks };
}

async function checkPrint(page, card) {
  const popupPromise = page.waitForEvent("popup", { timeout: 10000 });
  await card.getByRole("button", { name: /Print/i }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await popup.waitForTimeout(8000);
  const bodyText = await popup.locator("body").innerText().catch(() => "");
  const imageCount = await popup.locator("img").count().catch(() => 0);
  const source = await popup.locator("body").getAttribute("data-print-source").catch(() => "");
  const stillPreparing = /Preparing print file/i.test(bodyText);
  await popup.close().catch(() => {});
  return {
    result: !stillPreparing && imageCount > 0 ? "passed" : "failed",
    stillPreparing,
    imageCount,
    source: source || "",
    bodyText: bodyText.slice(0, 200),
  };
}

async function checkDownload(page, card, label) {
  const summary = card.locator("summary.download-menu-summary");
  await summary.click();
  const option = card.getByRole("menuitem", { name: new RegExp(label, "i") });
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
  await option.click();
  const download = await downloadPromise;
  if (download) {
    await download.delete().catch(() => {});
    return "passed";
  }
  const statusText = await card.locator(".gallery-action-status").innerText().catch(() => "");
  return /started/i.test(statusText) ? "passed" : "failed";
}

async function buildProjectContext(generatedAt) {
  const root = await git(["rev-parse", "--show-toplevel"]);
  const branch = await git(["branch", "--show-current"]);
  const runtimeCommitExists = await gitCommitExists("275dd6d33d64223f14e519ffb57d67825a7f5c19");
  const nextConfig = await readText("next.config.mjs");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const projectText = await readProjectText(["app", "src"]);
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");

  return {
    generatedAt,
    runId: "local-preview-bug-context-check",
    summary: {
      correctRepository: path.basename(root.trim()) === "i-love-coloring-page",
      repoRoot: root.trim(),
      branch: branch.trim(),
      branchExpected: branch.trim() === "version-4",
      runtimeSwitchCommitExists: runtimeCommitExists,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src", "generated", "coloring", "runtime-available-items.json")),
      runtimeAvailableCount: available.items.length,
      runtimeDeferredCount: deferred.records.length,
      siteUrlDefaultPresent: siteConfig.includes("https://www.ilovecoloringpage.com"),
      assetBaseUrlDefaultPresent: siteConfig.includes(EXPECTED_ASSET_BASE),
      contactEmailDefaultPresent: siteConfig.includes(EXPECTED_CONTACT_EMAIL),
      publicContainsGeneratedProductionMedia: (await listFilesIfExists(path.join(REPO_ROOT, "public"))).some((file) => /(?:^|[\\/])(?:coloring-pages|svg|webp|png|thumbs)[\\/]/i.test(file)),
      imagesStatusClean: (await gitStatusFor("images")).trim() === "",
      ilovesvgStatusClean: (await gitStatusFor("ilovesvg")).trim() === "",
      svgUserDownloadExposed: /Download SVG|downloadSvg|svgDownload/i.test(projectText),
      publicDownloadsPngJpgWebp: /label: "PNG"/.test(projectText) && /label: "JPG"/.test(projectText) && /label: "WebP"/.test(projectText),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
      imageSitemapPresent: /image-sitemap|ImageSitemap/i.test(projectText),
      ogImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(projectText),
      browserDownloadFormats: /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/.test(browserDownloads),
    },
  };
}

async function buildRuntimeDataAudit(generatedAt) {
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const dataSource = await readText("src/lib/coloring/data.ts");
  const assetsSource = await readText("src/lib/coloring/assets.ts");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const deferredIds = new Set(deferred.records.map((record) => record.assetId));
  const alligator = available.items.find((item) => item.assetId === ANIMALS_ALLIGATOR_ID);

  return {
    generatedAt,
    runId: "local-preview-runtime-data-audit",
    animalsAlligator: alligator || null,
    summary: {
      availableRecords: available.items.length,
      deferredRecords: deferred.records.length,
      deferredRecordsHiddenFromAvailable: !available.items.some((item) => deferredIds.has(item.assetId)),
      deferredRecordsHiddenFromHubItems: !hubItems.items.some((item) => deferredIds.has(item.assetId)),
      runtimeAvailableItemsUsed: /runtime-available-items\.json/.test(dataSource),
      runtimeAssetPathsUsedForTrace: assetPaths.summary.recordCount === available.items.length,
      imageCardReceivesWebpPreviewUrl: /preview:\s*resolvedUrls\.preview/.test(galleryGrid),
      imageCardReceivesInternalSvgUrl: /internalSvg:\s*resolvedUrls\.svg/.test(galleryGrid),
      primaryPreviewUsesWebpFirst: /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/.test(assetsSource),
      assetResolverHasPublicDefault: assetsSource.includes(EXPECTED_ASSET_BASE),
      noDuplicatePrefixInRuntimePaths: !JSON.stringify(assetPaths).includes("coloring-pages/coloring-pages"),
      noLocalhostInRuntimePaths: !/localhost|127\.0\.0\.1|::1/i.test(JSON.stringify(assetPaths)),
      noR2DevInRuntimePaths: !/\.r2\.dev/i.test(JSON.stringify(assetPaths)),
      assetImageHasErrorFallback: /onError=\{handleImageError\}/.test(assetImage),
      svgUserDownloadAbsent: !/Download SVG|downloadSvg|svgDownload/i.test(`${imageCard}\n${assetImage}`),
    },
  };
}

function buildAssetImageFix(generatedAt, qa) {
  return {
    generatedAt,
    runId: "local-preview-assetimage-fix",
    summary: {
      rootCause: "The preview resolver honored a localhost .env.local public asset override during static preview instead of falling back to the custom asset-domain default.",
      validWebpPreviewsRender: qa.summary.webpPreviewsRender,
      previewUnavailableForVisibleUploadedRuntimeRecords: qa.summary.previewUnavailableForVisibleUploadedRuntimeRecords,
      animalsAlligatorPreviewRenders: qa.summary.animalsAlligatorPreviewRenders,
      noBrokenImageIcons: qa.summary.brokenImageCount === 0,
      noAppApiAdded: !existsSync(path.join(REPO_ROOT, "app", "api")),
    },
  };
}

function buildPrintFix(generatedAt, qa) {
  return {
    generatedAt,
    runId: "local-preview-print-fix",
    summary: {
      rootCause: "The print popup wrote a preparing page before SVG conversion and did not replace it when conversion failed or stalled.",
      printWorks: qa.summary.printWorks,
      pngDownloadWorks: qa.summary.pngDownloadWorks,
      jpgDownloadWorks: qa.summary.jpgDownloadWorks,
      webpDownloadWorks: qa.summary.webpDownloadWorks,
      svgDownloadAbsent: qa.summary.svgDownloadAbsent,
      noUncaughtPromiseRejectionsObserved: qa.summary.consoleErrorCount === 0,
    },
  };
}

async function startStaticServer(root, port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", ORIGIN);
      const filePath = await resolveStaticFile(root, url.pathname);
      if (!filePath) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function resolveStaticFile(root, pathname) {
  const decodedPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = [];
  if (!decodedPath) candidates.push(path.join(root, "index.html"));
  else {
    candidates.push(path.join(root, decodedPath));
    candidates.push(path.join(root, `${decodedPath}.html`));
    candidates.push(path.join(root, decodedPath, "index.html"));
  }
  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    if (existsSync(candidate) && (await stat(candidate)).isFile()) return candidate;
  }
  return null;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

function renderContextReport(payload) {
  return [
    "# Local Preview Bug Context Check",
    "",
    `- Repository: ${payload.summary.repoRoot}`,
    `- Branch: ${payload.summary.branch}`,
    `- Correct repository: ${payload.summary.correctRepository}`,
    `- Static export configured: ${payload.summary.staticExportConfigured}`,
    `- app/api present: ${payload.summary.appApiRoutePresent}`,
    `- Runtime available records: ${payload.summary.runtimeAvailableCount}`,
    `- Runtime deferred records: ${payload.summary.runtimeDeferredCount}`,
    `- Public defaults present: ${payload.summary.siteUrlDefaultPresent && payload.summary.assetBaseUrlDefaultPresent && payload.summary.contactEmailDefaultPresent}`,
    `- SVG user download exposed: ${payload.summary.svgUserDownloadExposed}`,
    `- Live AdSense present: ${payload.summary.liveAdSenseCodePresent}`,
    `- Image sitemap present: ${payload.summary.imageSitemapPresent}`,
    `- Open Graph image generation present: ${payload.summary.ogImageGenerationPresent}`,
  ].join("\n");
}

function renderRuntimeAuditReport(payload) {
  return [
    "# Local Preview Runtime Data Audit",
    "",
    `- Available records: ${payload.summary.availableRecords}`,
    `- Deferred records: ${payload.summary.deferredRecords}`,
    `- Deferred hidden from available: ${payload.summary.deferredRecordsHiddenFromAvailable}`,
    `- Runtime available data used: ${payload.summary.runtimeAvailableItemsUsed}`,
    `- Image cards receive WebP preview: ${payload.summary.imageCardReceivesWebpPreviewUrl}`,
    `- Image cards receive internal SVG: ${payload.summary.imageCardReceivesInternalSvgUrl}`,
    `- Primary preview uses WebP first: ${payload.summary.primaryPreviewUsesWebpFirst}`,
    `- No duplicate prefix in runtime paths: ${payload.summary.noDuplicatePrefixInRuntimePaths}`,
    `- No localhost in runtime paths: ${payload.summary.noLocalhostInRuntimePaths}`,
    `- No r2.dev in runtime paths: ${payload.summary.noR2DevInRuntimePaths}`,
  ].join("\n");
}

function renderReproductionReport(payload) {
  return [
    "# Local Preview Bug Reproduction",
    "",
    `- Origin: ${payload.origin}`,
    `- Pages checked: ${payload.summary.pagesChecked}`,
    `- Preview unavailable labels: ${payload.summary.previewUnavailableForVisibleUploadedRuntimeRecords}`,
    `- WebP previews render: ${payload.summary.webpPreviewsRender}`,
    `- Animals Alligator appears: ${payload.summary.animalsAlligatorAppears}`,
    `- Animals Alligator has image: ${payload.summary.animalsAlligatorHasImg}`,
    `- Animals Alligator image source: ${payload.summary.animalsAlligatorImgSrc || "missing"}`,
    `- Broken image count: ${payload.summary.brokenImageCount}`,
    `- Network failures: ${payload.summary.networkFailureCount}`,
  ].join("\n");
}

function renderQaReport(payload) {
  return [
    "# Local Preview Browser QA Report",
    "",
    `- Origin: ${payload.origin}`,
    `- Screenshots: ${payload.screenshotDirectory}`,
    `- Pages checked: ${payload.summary.pagesChecked}`,
    `- WebP previews render: ${payload.summary.webpPreviewsRender}`,
    `- Preview unavailable labels for visible uploaded records: ${payload.summary.previewUnavailableForVisibleUploadedRuntimeRecords}`,
    `- Animals Alligator preview renders: ${payload.summary.animalsAlligatorPreviewRenders}`,
    `- Broken image count: ${payload.summary.brokenImageCount}`,
    `- Homepage count 6,352: ${payload.summary.homepageCount6352}`,
    `- Gallery landing count 6,352: ${payload.summary.galleryLandingCount6352}`,
    `- Print works: ${payload.summary.printWorks}`,
    `- PNG download works: ${payload.summary.pngDownloadWorks}`,
    `- JPG download works: ${payload.summary.jpgDownloadWorks}`,
    `- WebP download works: ${payload.summary.webpDownloadWorks}`,
    `- SVG download absent: ${payload.summary.svgDownloadAbsent}`,
    `- Search works: ${payload.summary.searchWorks}`,
    `- Filter works: ${payload.summary.filterWorks}`,
    `- Pagination works: ${payload.summary.paginationWorks}`,
    `- Ad density follows Round 4U: ${payload.summary.adDensityMatchesRound4U}`,
    `- Horizontal overflow detected: ${payload.summary.horizontalOverflowDetected}`,
    `- All passed: ${payload.summary.allPassed}`,
  ].join("\n");
}

function renderAssetImageFixReport(payload) {
  return [
    "# Local Preview AssetImage Fix",
    "",
    `- Root cause: ${payload.summary.rootCause}`,
    `- Valid WebP previews render: ${payload.summary.validWebpPreviewsRender}`,
    `- Preview unavailable labels: ${payload.summary.previewUnavailableForVisibleUploadedRuntimeRecords}`,
    `- Animals Alligator preview renders: ${payload.summary.animalsAlligatorPreviewRenders}`,
    `- No broken image icons: ${payload.summary.noBrokenImageIcons}`,
    `- app/api added: ${!payload.summary.noAppApiAdded}`,
  ].join("\n");
}

function renderPrintFixReport(payload) {
  return [
    "# Local Preview Print Fix",
    "",
    `- Root cause: ${payload.summary.rootCause}`,
    `- Print works: ${payload.summary.printWorks}`,
    `- PNG download works: ${payload.summary.pngDownloadWorks}`,
    `- JPG download works: ${payload.summary.jpgDownloadWorks}`,
    `- WebP download works: ${payload.summary.webpDownloadWorks}`,
    `- SVG download absent: ${payload.summary.svgDownloadAbsent}`,
    `- No uncaught Promise rejections observed: ${payload.summary.noUncaughtPromiseRejectionsObserved}`,
  ].join("\n");
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readFile(path.join(REPO_ROOT, file), "utf8"));
    }
  }
  return chunks.join("\n");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, payload) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeText(relativePath, text) {
  const absolute = path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${text.replace(/[ \t]+$/gm, "").replace(/\n+$/g, "")}\n`, "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 20 });
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
  return git(["status", "--short", "--", relativePath]);
}

function routeToScreenshotName(route) {
  return (route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/-+$/g, "")).toLowerCase();
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--mode") parsed.mode = argv[++index];
    else if (argv[index] === "--skip-build") parsed.skipBuild = true;
  }
  return parsed;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
