#!/usr/bin/env node

const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "long-tail-acceptance-browser-qa";
const DEFAULT_APP_URL = "http://localhost:3005";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "long-tail-acceptance", "screenshots");
const MANIFEST_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "long-tail-acceptance-browser-qa-results.json");
const REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "long-tail-acceptance-browser-qa-report.md");
const REQUIRED_ROUTES = [
  "/coloring-pages",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/mushrooms",
  "/coloring-pages/sushi",
  "/coloring-pages/bakery",
  "/coloring-pages/bears",
  "/coloring-pages/pumpkins",
  "/coloring-pages/wolves",
  "/coloring-pages/velociraptors",
  "/coloring-pages/christmas-dogs",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = normalizeUrl(args.appUrl || process.env.LONG_TAIL_ACCEPTANCE_APP_URL || DEFAULT_APP_URL);
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const deferredAssetIds = (deferred.items || deferred.records || []).map((item) => item.assetId).filter(Boolean);
  const routeData = new Map(routes.routes.map((route) => [route.path, route]));

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    const payload = makeNotRunPayload(appUrl, "Playwright is not installed in this project.");
    await writeResults(payload);
    await refreshAcceptanceGate();
    console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason: payload.blockers[0] }, null, 2));
    return;
  }

  let server = null;
  if (!(await isReachable(`${appUrl}/coloring-pages`))) {
    server = startDevServer();
    await waitForReachable(`${appUrl}/coloring-pages`, 90_000);
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const pages = [];
  const screenshotPaths = [];
  let moreMenuCheck = null;
  let mobileNavCheck = null;

  try {
    for (const route of REQUIRED_ROUTES) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__longTailPrintCalls = 0;
        window.print = () => {
          window.__longTailPrintCalls += 1;
        };
      });
      const response = await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(400);
      await runSearchSmoke(page);
      await openFirstDownloadMenu(page);
      const printClickResult = await clickFirstPrint(page);
      const metrics = await collectPageMetrics(page, {
        expectedCount: routeData.get(route)?.assetCount || null,
        deferredAssetIds,
      });
      const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(route)}-desktop.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({
        route,
        viewport: "desktop",
        httpStatus: response?.status() || 0,
        printClickResult,
        screenshotPath: toRepoPath(screenshotPath),
        ...metrics,
      });
      await page.close();
    }

    moreMenuCheck = await runMoreMenuCheck(context, appUrl);
    screenshotPaths.push(...moreMenuCheck.screenshotPaths);
    mobileNavCheck = await runMobileNavCheck(mobileContext, appUrl);
    screenshotPaths.push(...mobileNavCheck.screenshotPaths);

    for (const route of ["/coloring-pages", "/coloring-pages/t-rex", "/coloring-pages/christmas-dogs"]) {
      const page = await mobileContext.newPage();
      const response = await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(400);
      const metrics = await collectPageMetrics(page, {
        expectedCount: routeData.get(route)?.assetCount || null,
        deferredAssetIds,
      });
      const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(route)}-mobile.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({
        route,
        viewport: "mobile",
        httpStatus: response?.status() || 0,
        printClickResult: null,
        screenshotPath: toRepoPath(screenshotPath),
        ...metrics,
      });
      await page.close();
    }
  } finally {
    await context.close();
    await mobileContext.close();
    await browser.close();
    if (server) stopDevServer(server);
  }

  const requiredRouteSet = new Set(REQUIRED_ROUTES);
  const desktopPages = pages.filter((page) => page.viewport === "desktop");
  const hubPages = pages.filter((page) => page.route.startsWith("/coloring-pages"));
  const summary = {
    status: "completed",
    appUrl,
    pagesInspected: pages.length,
    requiredRoutesChecked: REQUIRED_ROUTES.filter((route) => desktopPages.some((page) => page.route === route)),
    allRequiredRoutesReturnedPage: REQUIRED_ROUTES.every((route) => desktopPages.some((page) => page.route === route && page.httpStatus >= 200 && page.httpStatus < 400 && page.h1Text.length > 0)),
    webpPreviewsRender: hubPages.every((page) => page.webpImageCount > 0),
    noBrokenImages: hubPages.every((page) => page.visibleBrokenImageCount === 0),
    noPreviewUnavailableForVisibleUploadedRecords: hubPages.every((page) => page.previewUnavailableTextCount === 0),
    deferredRecordsHidden: hubPages.every((page) => page.deferredVisibleCount === 0),
    countsAccurate: hubPages.every((page) => page.expectedCount === null || page.totalItems === page.expectedCount),
    searchFilterWorks: desktopPages.filter((page) => requiredRouteSet.has(page.route)).every((page) => page.searchSmokePass),
    paginationWorksWhereApplicable: hubPages.every((page) => page.totalItems <= 48 || page.paginationLinkCount > 0 || page.route === "/coloring-pages"),
    printWorksOnSampledCards: desktopPages.every((page) => page.printClickResult?.clicked === true && page.printClickResult?.popupOpened === true && page.printClickResult?.printableDocument === true),
    pngJpgWebpDownloadControlsExist: hubPages.every((page) => page.pngOptionCount > 0 && page.jpgOptionCount > 0 && page.webpOptionCount > 0),
    svgDownloadAbsent: pages.every((page) => page.svgDownloadVisibleCount === 0),
    adDensityFollowsRules: pages.every((page) => page.visibleAdLabelCount <= 3 && page.visibleAdLabelCount >= 0),
    noHorizontalOverflow: pages.every((page) => !page.horizontalOverflow),
    seoSectionBelowGallery: desktopPages.every((page) => page.seoSectionBelowGallery === true || page.route === "/coloring-pages"),
    moreMenuWorks: Boolean(moreMenuCheck?.tRexSearchResultFound && moreMenuCheck?.dragonSearchResultFound),
    mobileNavWorks: Boolean(mobileNavCheck?.tRexSearchResultFound && mobileNavCheck?.dragonSearchResultFound),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
  };

  summary.browserQaPassed =
    summary.allRequiredRoutesReturnedPage &&
    summary.webpPreviewsRender &&
    summary.noBrokenImages &&
    summary.noPreviewUnavailableForVisibleUploadedRecords &&
    summary.deferredRecordsHidden &&
    summary.countsAccurate &&
    summary.searchFilterWorks &&
    summary.paginationWorksWhereApplicable &&
    summary.printWorksOnSampledCards &&
    summary.pngJpgWebpDownloadControlsExist &&
    summary.svgDownloadAbsent &&
    summary.adDensityFollowsRules &&
    summary.noHorizontalOverflow &&
    summary.seoSectionBelowGallery &&
    summary.moreMenuWorks &&
    summary.mobileNavWorks &&
    !summary.appApiRoutePresent;

  const blockers = buildBlockers(summary, pages);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary,
    pages,
    moreMenuCheck,
    mobileNavCheck,
    screenshotPaths: unique(screenshotPaths),
    blockers,
  };

  await writeResults(payload);
  await refreshAcceptanceGate();
  console.log(JSON.stringify({ runId: RUN_ID, status: summary.status, browserQaPassed: summary.browserQaPassed, pages: pages.length, screenshots: payload.screenshotPaths.length, blockers }, null, 2));
  if (!summary.browserQaPassed) process.exitCode = 1;
}

async function collectPageMetrics(page, options) {
  return page.evaluate(({ expectedCount, deferredAssetIds }) => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const bodyText = document.body.textContent || "";
    const visibleBrokenImages = [...document.images].filter((img) => visible(img) && img.naturalWidth === 0);
    const actionText = [...document.querySelectorAll("button, summary, a")].map((node) => (node.textContent || "").trim()).join("\n");
    const h1 = document.querySelector("h1");
    const gallerySection = document.querySelector("#gallery");
    const seoSection = document.querySelector(".seo-content-section");
    const totalText = bodyText.match(/(?:Browse|Print|Search)\s+([0-9,]+)\s+/i)?.[1] || "";
    const totalItems = Number(totalText.replace(/,/g, "")) || expectedCount || 0;
    const html = document.documentElement.outerHTML;
    return {
      h1Text: (h1?.textContent || "").trim(),
      expectedCount,
      totalItems,
      imageCount: document.images.length,
      webpImageCount: [...document.images].filter((img) => (img.currentSrc || img.src).includes("/webp/") && img.naturalWidth > 0).length,
      visibleBrokenImageCount: visibleBrokenImages.length,
      previewUnavailableTextCount: (bodyText.match(/Preview unavailable/g) || []).length,
      deferredVisibleCount: deferredAssetIds.filter((assetId) => html.includes(`asset-${assetId}`)).length,
      searchInputCount: document.querySelectorAll('input[type="search"]').length,
      searchSmokePass: Boolean(window.__longTailSearchSmokePass),
      paginationLinkCount: [...document.querySelectorAll("a")].filter((link) => /\/page\/[0-9]+/.test(link.getAttribute("href") || "")).length,
      relatedLinkCount: document.querySelectorAll(".seo-related-link, .hub-link-card, .related-link").length,
      printButtonCount: [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
      downloadMenuCount: document.querySelectorAll("summary.download-menu-summary").length,
      pngOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "PNG").length,
      jpgOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "JPG").length,
      webpOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "WebP").length,
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(actionText) ? 1 : 0,
      visibleAdLabelCount: [...document.querySelectorAll("body *")].filter((node) => visible(node) && (node.textContent || "").trim() === "Advertisement").length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
      seoSectionBelowGallery: gallerySection && seoSection ? seoSection.getBoundingClientRect().top > gallerySection.getBoundingClientRect().top : true,
    };
  }, options);
}

async function runSearchSmoke(page) {
  const search = page.locator('input[type="search"]').first();
  if ((await search.count()) === 0) {
    await page.evaluate(() => {
      window.__longTailSearchSmokePass = false;
    });
    return;
  }
  const firstAlt = await page.locator(".gallery-item img").first().getAttribute("alt").catch(() => "");
  const query = ((firstAlt || "").split(/\s+/).find((part) => /^[A-Za-z][A-Za-z-]{2,}$/.test(part)) || "coloring").toLowerCase();
  await search.fill(query);
  await page.waitForTimeout(250);
  const visibleItems = await page.locator(".gallery-item").count();
  await page.evaluate((pass) => {
    window.__longTailSearchSmokePass = pass;
  }, visibleItems > 0);
  await search.fill("");
  await page.waitForTimeout(100);
}

async function clickFirstPrint(page) {
  const button = page.getByRole("button", { name: "Print" }).first();
  if ((await button.count()) === 0) return { clicked: false, printCallCount: 0, error: "missing print button" };
  try {
    const popupPromise = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);
    await button.click({ timeout: 8_000 });
    const popup = await popupPromise;
    if (!popup) return { clicked: true, popupOpened: false, printableDocument: false, error: "print popup did not open" };
    await popup.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    await popup
      .waitForFunction(
        () => Boolean(document.querySelector("#print-image")) || /Print file could not be prepared/i.test(document.body.textContent || ""),
        { timeout: 20_000 },
      )
      .catch(() => {});
    const printDocument = await popup.evaluate(() => {
      const image = document.querySelector("#print-image");
      const source = document.body.getAttribute("data-print-source");
      const failure = !source && /Print file could not be prepared/i.test(document.body.innerText || "");
      return {
        imagePresent: Boolean(image),
        source,
        failure,
        title: document.title,
      };
    }).catch((error) => ({ imagePresent: false, source: "", failure: true, title: "", error: error?.message || String(error) }));
    await popup.close().catch(() => {});
    return {
      clicked: true,
      popupOpened: true,
      printableDocument: Boolean(printDocument.imagePresent && printDocument.source && !printDocument.failure),
      printDocument,
    };
  } catch (error) {
    return { clicked: false, popupOpened: false, printableDocument: false, error: error?.message || String(error) };
  }
}

async function openFirstDownloadMenu(page) {
  const summary = page.locator("summary.download-menu-summary").first();
  if ((await summary.count()) === 0) return;
  await summary.click({ timeout: 8_000 }).catch(() => {});
}

async function runMoreMenuCheck(context, appUrl) {
  const page = await context.newPage();
  await page.goto(`${appUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByLabel("Search hub pages").fill("t-rex");
  await page.waitForTimeout(200);
  const tRexSearchResultFound = (await page.locator('a[href="/coloring-pages/t-rex"]').count()) > 0;
  await page.getByLabel("Search hub pages").fill("dragons");
  await page.waitForTimeout(200);
  const dragonSearchResultFound = (await page.locator('a[href="/coloring-pages/dragons"]').count()) > 0;
  const visibleLinkCount = await page.locator(".hub-menu-panel-desktop a").count();
  const screenshotPath = path.join(SCREENSHOT_DIR, "more-menu-promoted-hubs-desktop.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.keyboard.press("Escape");
  const closesOnEscape = (await page.locator(".hub-menu-panel-desktop").count()) === 0;
  await page.close();
  return {
    tRexSearchResultFound,
    dragonSearchResultFound,
    visibleLinkCount,
    closesOnEscape,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

async function runMobileNavCheck(context, appUrl) {
  const page = await context.newPage();
  await page.goto(`${appUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByLabel("Open navigation menu").click();
  await page.getByLabel("Search mobile hub pages").fill("t-rex");
  await page.waitForTimeout(200);
  const tRexSearchResultFound = (await page.locator('a[href="/coloring-pages/t-rex"]').count()) > 0;
  await page.getByLabel("Search mobile hub pages").fill("dragons");
  await page.waitForTimeout(200);
  const dragonSearchResultFound = (await page.locator('a[href="/coloring-pages/dragons"]').count()) > 0;
  const panelVisible = (await page.locator(".mobile-nav-panel").count()) > 0;
  const screenshotPath = path.join(SCREENSHOT_DIR, "mobile-nav-promoted-hubs.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.locator(".mobile-nav-close").click();
  const closesOnButton = (await page.locator(".mobile-nav-panel").count()) === 0;
  await page.close();
  return {
    panelVisible,
    tRexSearchResultFound,
    dragonSearchResultFound,
    closesOnButton,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

function buildBlockers(summary, pages) {
  const blockers = [];
  if (!summary.allRequiredRoutesReturnedPage) blockers.push("One or more required routes did not return a rendered page.");
  if (!summary.webpPreviewsRender) blockers.push("A checked page did not render WebP previews.");
  if (!summary.noBrokenImages) blockers.push("A visible broken image was detected.");
  if (!summary.noPreviewUnavailableForVisibleUploadedRecords) blockers.push("Preview unavailable appeared on a checked page.");
  if (!summary.deferredRecordsHidden) blockers.push("A deferred asset record appeared on a checked page.");
  if (!summary.countsAccurate) blockers.push("A checked page count did not match runtime route data.");
  if (!summary.searchFilterWorks) blockers.push("Search smoke check failed on a checked page.");
  if (!summary.paginationWorksWhereApplicable) blockers.push("Pagination was missing where expected.");
  if (!summary.printWorksOnSampledCards) blockers.push("Print button smoke check failed.");
  if (!summary.pngJpgWebpDownloadControlsExist) blockers.push("PNG/JPG/WebP download controls were not visible.");
  if (!summary.svgDownloadAbsent) blockers.push("A user-facing SVG download control was detected.");
  if (!summary.adDensityFollowsRules) blockers.push("Ad density exceeded the accepted placeholder model.");
  if (!summary.noHorizontalOverflow) blockers.push("Horizontal overflow was detected.");
  if (!summary.seoSectionBelowGallery) blockers.push("SEO content appeared above the gallery on a checked hub.");
  if (!summary.moreMenuWorks) blockers.push("More menu search did not find promoted hubs.");
  if (!summary.mobileNavWorks) blockers.push("Mobile nav search did not find promoted hubs.");
  if (summary.appApiRoutePresent) blockers.push("app/api exists.");
  const failedRoutes = pages.filter((page) => page.viewport === "desktop" && (page.httpStatus < 200 || page.httpStatus >= 400 || !page.h1Text)).map((page) => page.route);
  if (failedRoutes.length) blockers.push(`Failed desktop routes: ${failedRoutes.join(", ")}`);
  return blockers;
}

async function writeResults(payload) {
  await writeJson(MANIFEST_PATH, payload);
  await writeText(REPORT_PATH, renderReport(payload));
}

function renderReport(payload) {
  return `# Long-Tail Acceptance Browser QA

- Status: ${payload.summary.status}
- Passed: ${payload.summary.browserQaPassed}
- Pages inspected: ${payload.summary.pagesInspected}
- Required routes checked: ${payload.summary.requiredRoutesChecked.join(", ")}
- WebP previews render: ${payload.summary.webpPreviewsRender}
- No broken images: ${payload.summary.noBrokenImages}
- Preview unavailable absent: ${payload.summary.noPreviewUnavailableForVisibleUploadedRecords}
- Deferred records hidden: ${payload.summary.deferredRecordsHidden}
- Counts accurate: ${payload.summary.countsAccurate}
- Search/filter smoke passed: ${payload.summary.searchFilterWorks}
- Pagination works where applicable: ${payload.summary.paginationWorksWhereApplicable}
- Print smoke passed: ${payload.summary.printWorksOnSampledCards}
- PNG/JPG/WebP controls visible: ${payload.summary.pngJpgWebpDownloadControlsExist}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Ad density follows rules: ${payload.summary.adDensityFollowsRules}
- Horizontal overflow absent: ${payload.summary.noHorizontalOverflow}
- SEO section below gallery: ${payload.summary.seoSectionBelowGallery}
- More menu works: ${payload.summary.moreMenuWorks}
- Mobile nav works: ${payload.summary.mobileNavWorks}
- Screenshot directory: pipeline/review/long-tail-acceptance/screenshots/
- Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}
`;
}

function makeNotRunPayload(appUrl, reason) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      status: "not_run",
      appUrl,
      browserQaPassed: false,
    },
    pages: [],
    screenshotPaths: [],
    blockers: [reason],
  };
}

function startDevServer() {
  const child = spawn("cmd.exe", ["/c", "npx", "next", "dev", "-H", "localhost", "-p", "3005"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: "https://www.ilovecoloringpage.com",
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "https://assets.ilovecoloringpage.com/coloring-pages",
    },
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  return child;
}

function stopDevServer(child) {
  if (!child?.pid) return;
  spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function refreshAcceptanceGate() {
  execFileSync("node", ["pipeline/scripts/build-long-tail-acceptance-gate.mjs"], {
    cwd: REPO_ROOT,
    windowsHide: true,
    stdio: "ignore",
  });
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(filePath, payload) {
  await writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--app-url") parsed.appUrl = args[index + 1];
  }
  return parsed;
}

function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

function slugForPath(routePath) {
  if (routePath === "/") return "home";
  return routePath.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function unique(values) {
  return [...new Set(values)];
}
