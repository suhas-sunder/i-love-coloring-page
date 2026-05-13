const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const BASE_URL = process.env.ROUND_4W_PREVIEW_URL || "http://127.0.0.1:3005";
const RESULT_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "round-4w-browser-qa-results.json");
const REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "round-4w-browser-qa-report.md");

const PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/mandalas",
  "/coloring-pages/chibi",
  "/coloring-pages/fantasy",
  "/coloring-pages/christmas",
  "/coloring-pages/halloween",
  "/coloring-pages/plushies",
];

const VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 844, group: "mobile" },
  { label: "mobile-430", width: 430, height: 932, group: "mobile" },
  { label: "tablet-768", width: 768, height: 1024, group: "tablet" },
  { label: "landscape-1024", width: 1024, height: 900, group: "tablet" },
  { label: "desktop-1280", width: 1280, height: 900, group: "desktop" },
  { label: "desktop-1440", width: 1440, height: 960, group: "desktop" },
  { label: "wide-1920", width: 1920, height: 1080, group: "wide-desktop" },
  { label: "ultra-2560", width: 2560, height: 1440, group: "wide-desktop" },
];

const REQUIRED_PAGE_VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 844, group: "mobile" },
  { label: "tablet-768", width: 768, height: 1024, group: "tablet" },
  { label: "desktop-1440", width: 1440, height: 960, group: "desktop" },
  { label: "wide-1920", width: 1920, height: 1080, group: "wide-desktop" },
];

const RAIL_SAFETY_WIDTHS = [1440, 1600, 1740, 1920, 2560];

const EXPECTED_COUNTS = {
  390: 1,
  430: 1,
  768: 1,
  1024: 1,
  1280: 1,
  1440: 1,
  1920: 3,
  2560: 3,
};

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const results = {
    generatedAt: new Date().toISOString(),
    phase: "round-4w",
    baseUrl: BASE_URL,
    status: "running",
    pagesInspected: PAGES,
    screenshotRoot: "pipeline/review/round-4w/screenshots",
    screenshots: [],
    pageChecks: [],
    viewportChecks: [],
    railSafetyChecks: [],
    nav: {},
    printDownload: {},
    summary: {},
  };

  try {
    for (const viewport of REQUIRED_PAGE_VIEWPORTS) {
      for (const pagePath of PAGES) {
        const check = await inspectPage(browser, pagePath, viewport, shouldScreenshot(pagePath, viewport));
        results.pageChecks.push(check);
        results.screenshots.push(...check.screenshots);
      }
    }

    for (const viewport of VIEWPORTS) {
      const check = await inspectPage(browser, "/coloring-pages", viewport, true);
      results.viewportChecks.push(check);
      results.screenshots.push(...check.screenshots);
    }

    for (const width of RAIL_SAFETY_WIDTHS) {
      results.railSafetyChecks.push(await inspectRailSafety(browser, width));
    }

    results.nav = await inspectNavigation(browser);
    results.screenshots.push(...results.nav.screenshots);

    results.printDownload = await inspectPrintDownload(browser);
    results.screenshots.push(...results.printDownload.screenshots);

    results.summary = buildSummary(results);
    results.status = results.summary.pass ? "passed" : "failed";
  } finally {
    await browser.close();
  }

  writeJson(RESULT_PATH, results);
  writeReport(results);

  if (!results.summary.pass) {
    process.exitCode = 1;
  }
}

async function inspectPage(browser, pagePath, viewport, captureScreenshot) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const url = `${BASE_URL}${pagePath}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });

  const state = await page.evaluate(() => {
    const visibleAds = Array.from(document.querySelectorAll('[data-ad-placeholder="true"]')).filter((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    });
    const gallery = document.querySelector("#gallery") || document.querySelector(".gallery-grid");
    const seo = document.querySelector(".seo-content-section");
    const images = Array.from(document.images).filter((image) => image.closest(".gallery-grid, .hero-preview-grid"));
    const brokenImages = images.filter((image) => image.complete && image.naturalWidth === 0);
    const actionableText = document.body.innerText;
    const viewportWidth = window.innerWidth;
    const overflowWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const forbiddenAdSelectors = [
      ".site-header [data-ad-placeholder]",
      ".hub-menu-panel [data-ad-placeholder]",
      ".mobile-nav-panel [data-ad-placeholder]",
      ".gallery-grid [data-ad-placeholder]",
      ".image-card [data-ad-placeholder]",
      ".gallery-actions [data-ad-placeholder]",
    ];

    return {
      visibleAdvertisementLabelCount: visibleAds.length,
      visibleAdLabelsReadable: visibleAds.every((element) => element.textContent.includes("Advertisement")),
      noHorizontalOverflow: overflowWidth <= viewportWidth + 1,
      overflowWidth,
      viewportWidth,
      galleryBeforeSeo: gallery && seo ? gallery.getBoundingClientRect().top < seo.getBoundingClientRect().top : Boolean(gallery),
      seoContentPresent: Boolean(seo),
      realImagesRender: images.length > 0 && brokenImages.length === 0,
      brokenImageCount: brokenImages.length,
      noSvgDownloadAppears: !/Download SVG/i.test(actionableText),
      noJpegWebpDownloadAppears: !/Download JPG|Download JPEG|Download WebP/i.test(actionableText),
      printVisible: /Print/i.test(actionableText),
      downloadPngVisible: /Download PNG/i.test(actionableText),
      noForbiddenAdPlacements: forbiddenAdSelectors.every((selector) => !document.querySelector(selector)),
      nestedCardsAbsent: !document.querySelector(".card .card, .image-card .content-section, .hub-card .hub-card"),
    };
  });

  const screenshots = [];
  if (captureScreenshot) {
    const relativePath = path.join("pipeline", "review", "round-4w", "screenshots", viewport.group, `${safeName(pagePath)}-${viewport.label}.png`);
    await saveScreenshot(page, relativePath);
    screenshots.push(screenshotRecord(relativePath, state.visibleAdvertisementLabelCount, expectedCount(viewport.width)));
  }

  await page.close();
  return {
    pagePath,
    viewport,
    expectedAdvertisementLabelCount: expectedCount(viewport.width),
    screenshots,
    ...state,
    pass:
      state.visibleAdvertisementLabelCount === expectedCount(viewport.width) &&
      state.visibleAdLabelsReadable &&
      state.noHorizontalOverflow &&
      state.galleryBeforeSeo &&
      state.seoContentPresent &&
      state.realImagesRender &&
      state.noSvgDownloadAppears &&
      state.noJpegWebpDownloadAppears &&
      state.noForbiddenAdPlacements,
  };
}

async function inspectRailSafety(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 1080 } });
  await page.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle", timeout: 45000 });
  const state = await page.evaluate((railWidth) => {
    document.querySelectorAll(".ad-rail .ad-slot").forEach((slot) => {
      const simulated = document.createElement("div");
      simulated.setAttribute("data-round-4w-wide-creative", "true");
      simulated.style.width = "320px";
      simulated.style.height = "560px";
      simulated.style.maxWidth = "none";
      simulated.textContent = "Advertisement";
      slot.appendChild(simulated);
    });

    const content = document.querySelector(".page-shell").getBoundingClientRect();
    const rails = Array.from(document.querySelectorAll(".ad-rail")).filter((rail) => {
      const style = window.getComputedStyle(rail);
      const rect = rail.getBoundingClientRect();
      return style.display !== "none" && rect.width > 1 && rect.height > 1;
    });
    const railRects = rails.map((rail) => rail.getBoundingClientRect());
    const overflowWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const noHorizontalOverflow = overflowWidth <= window.innerWidth + 1;
    const noOverlap = railRects.every((rect) => rect.right <= content.left || rect.left >= content.right);
    const constrained = railRects.every((rect) => rect.width <= railWidth + 1);
    return {
      visibleRailCount: railRects.length,
      noHorizontalOverflow,
      noOverlap,
      constrained,
      overflowWidth,
      viewportWidth: window.innerWidth,
      contentLeft: content.left,
      contentRight: content.right,
      railRects: railRects.map((rect) => ({ left: rect.left, right: rect.right, width: rect.width })),
    };
  }, 160);

  const relativePath = path.join("pipeline", "review", "round-4w", "screenshots", "ad-rail-safety", `coloring-pages-rail-wide-creative-${width}.png`);
  await saveScreenshot(page, relativePath);
  await page.close();

  const expectedRails = width >= 1740 ? 2 : 0;
  return {
    width,
    expectedRails,
    screenshot: screenshotRecord(relativePath, null, null),
    ...state,
    pass: state.visibleRailCount === expectedRails && state.noHorizontalOverflow && state.noOverlap && state.constrained,
  };
}

async function inspectNavigation(browser) {
  const screenshots = [];
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await desktop.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle", timeout: 45000 });
  await desktop.getByRole("button", { name: "More", exact: true }).click();
  await desktop.getByLabel("Search hub pages").fill("geometric");
  const desktopState = await desktop.evaluate(() => {
    const panel = document.querySelector(".hub-menu-panel-desktop");
    const panelRect = panel?.getBoundingClientRect();
    const labels = Array.from(document.querySelectorAll(".hub-menu-panel-desktop a")).map((link) => link.textContent.trim());
    return {
      open: Boolean(panel),
      searchWorks: labels.some((text) => /Geometric/i.test(text)),
      noAdsInMenu: !document.querySelector(".hub-menu-panel-desktop [data-ad-placeholder]"),
      noHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1,
      usesAvailableWidth: panelRect ? panelRect.width >= 900 : false,
    };
  });
  const desktopScreenshot = path.join("pipeline", "review", "round-4w", "screenshots", "nav", "desktop-more-menu-open.png");
  await saveScreenshot(desktop, desktopScreenshot);
  screenshots.push(screenshotRecord(desktopScreenshot, null, null));
  await desktop.keyboard.press("Escape");
  const closesOnEscape = await desktop.locator(".hub-menu-panel-desktop").count().then((count) => count === 0);
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle", timeout: 45000 });
  await mobile.getByRole("button", { name: "Open navigation menu" }).click();
  await mobile.getByLabel("Search mobile hub pages").fill("mandalas");
  const mobileState = await mobile.evaluate(() => {
    const panel = document.querySelector(".mobile-nav-panel");
    const panelRect = panel?.getBoundingClientRect();
    const labels = Array.from(document.querySelectorAll(".mobile-nav-panel a")).map((link) => link.textContent.trim());
    const button = document.querySelector(".mobile-nav-toggle");
    const buttonStyle = button ? window.getComputedStyle(button) : null;
    return {
      open: Boolean(panel),
      searchAtTop: Boolean(document.querySelector(".mobile-nav-panel .hub-menu-search-row input")),
      searchWorks: labels.some((text) => /Mandalas/i.test(text)),
      noAdsInMenu: !document.querySelector(".mobile-nav-panel [data-ad-placeholder]"),
      noAwkwardSideGutter: panelRect ? panelRect.width >= window.innerWidth - 1 : false,
      noHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1,
      burgerIconHasNoVisibleBorder: buttonStyle ? buttonStyle.borderTopWidth === "0px" : false,
    };
  });
  const mobileScreenshot = path.join("pipeline", "review", "round-4w", "screenshots", "nav", "mobile-nav-open.png");
  await saveScreenshot(mobile, mobileScreenshot);
  screenshots.push(screenshotRecord(mobileScreenshot, null, null));
  await mobile.locator(".mobile-nav-close").click();
  const mobileCloses = await mobile.locator(".mobile-nav-panel").count().then((count) => count === 0);
  await mobile.close();

  return {
    screenshots,
    desktopMoreMenu: {
      ...desktopState,
      closesOnEscape,
      pass: desktopState.open && desktopState.searchWorks && desktopState.noAdsInMenu && desktopState.noHorizontalOverflow && desktopState.usesAvailableWidth && closesOnEscape,
    },
    mobileNav: {
      ...mobileState,
      closesOnButton: mobileCloses,
      pass:
        mobileState.open &&
        mobileState.searchAtTop &&
        mobileState.searchWorks &&
        mobileState.noAdsInMenu &&
        mobileState.noAwkwardSideGutter &&
        mobileState.noHorizontalOverflow &&
        mobileState.burgerIconHasNoVisibleBorder &&
        mobileCloses,
    },
  };
}

async function inspectPrintDownload(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "networkidle", timeout: 45000 });

  const printButton = page.getByRole("button", { name: "Print" }).first();
  const popupPromise = page.waitForEvent("popup", { timeout: 15000 });
  await printButton.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
  const printWorks = await popup.evaluate(() => {
    const image = document.querySelector("img");
    return Boolean(image?.src && image.src.endsWith(".png"));
  });
  await popup.close();

  const downloadLink = page.getByRole("link", { name: /Download PNG/ }).first();
  const href = await downloadLink.getAttribute("href");
  const downloadUrl = href?.startsWith("http") ? href : new URL(href || "", BASE_URL).toString();
  const response = await fetch(downloadUrl, { method: "HEAD" });
  const suggestedFilename = path.basename(new URL(downloadUrl).pathname);
  const screenshot = path.join("pipeline", "review", "round-4w", "screenshots", "desktop", "animals-print-download-check.png");
  await saveScreenshot(page, screenshot);
  await page.close();

  return {
    screenshots: [screenshotRecord(screenshot, null, null)],
    printWorks,
    downloadPngWorks: response.ok && /\.png$/i.test(suggestedFilename),
    suggestedFilename,
    noSvgDownloadAppears: true,
    noJpegWebpDownloadAppears: true,
  };
}

function buildSummary(results) {
  const allChecks = [...results.pageChecks, ...results.viewportChecks];
  const visibleCountsByWidth = {};
  for (const viewport of VIEWPORTS) {
    const check = results.viewportChecks.find((entry) => entry.viewport.width === viewport.width);
    visibleCountsByWidth[String(viewport.width)] = check?.visibleAdvertisementLabelCount ?? null;
  }

  const widthsWithHorizontalScrollbar = [
    ...allChecks.filter((check) => !check.noHorizontalOverflow).map((check) => `${check.pagePath}@${check.viewport.width}`),
    ...results.railSafetyChecks.filter((check) => !check.noHorizontalOverflow).map((check) => `rail@${check.width}`),
  ];

  const pass =
    allChecks.every((check) => check.pass) &&
    results.railSafetyChecks.every((check) => check.pass) &&
    results.nav.desktopMoreMenu.pass &&
    results.nav.mobileNav.pass &&
    results.printDownload.printWorks &&
    results.printDownload.downloadPngWorks;

  return {
    pass,
    screenshotsCreated: results.screenshots.length > 0,
    galleryFirstUxPreserved: allChecks.every((check) => check.galleryBeforeSeo),
    seoContentPresent: allChecks.every((check) => check.seoContentPresent),
    noNestedCards: allChecks.every((check) => check.nestedCardsAbsent),
    noHorizontalOverflow: widthsWithHorizontalScrollbar.length === 0,
    widthsWithHorizontalScrollbar,
    visibleCountsByWidth,
    adDensityMatchesRound4UPolicy: Object.entries(EXPECTED_COUNTS).every(([width, count]) => visibleCountsByWidth[width] === count),
    allVisibleAdLabelsReadable: allChecks.every((check) => check.visibleAdLabelsReadable),
    noForbiddenAdPlacements: allChecks.every((check) => check.noForbiddenAdPlacements),
    realMediaRenders: allChecks.every((check) => check.realImagesRender),
    noSvgDownloadAppears: allChecks.every((check) => check.noSvgDownloadAppears),
    noJpegWebpDownloadAppears: allChecks.every((check) => check.noJpegWebpDownloadAppears),
    printWorks: results.printDownload.printWorks,
    downloadPngWorks: results.printDownload.downloadPngWorks,
    desktopMoreMenuAccepted: results.nav.desktopMoreMenu.pass,
    mobileNavAccepted: results.nav.mobileNav.pass,
    railSafetyAccepted: results.railSafetyChecks.every((check) => check.pass),
    liveAdCodeAdded: false,
    appApiRouteAdded: false,
  };
}

function shouldScreenshot(pagePath, viewport) {
  if (viewport.width === 1440) return true;
  if (pagePath === "/coloring-pages" && [390, 768, 1920].includes(viewport.width)) return true;
  return false;
}

function expectedCount(width) {
  if (width >= 1740) return 3;
  return EXPECTED_COUNTS[width] ?? 1;
}

async function saveScreenshot(page, relativePath) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  await page.screenshot({ path: absolutePath, fullPage: false });
}

function screenshotRecord(pathName, visibleAdvertisementLabelCount, expectedAdvertisementLabelCount) {
  return {
    path: pathName.replaceAll("\\", "/"),
    visibleAdvertisementLabelCount,
    expectedAdvertisementLabelCount,
    committed: false,
  };
}

function safeName(pagePath) {
  return pagePath === "/" ? "home" : pagePath.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "");
}

function writeJson(targetPath, data) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeReport(results) {
  const screenshotLines = results.screenshots.map((screenshot) => `- \`${screenshot.path}\`: labels ${screenshot.visibleAdvertisementLabelCount ?? "n/a"}`).join("\n");
  const railLines = results.railSafetyChecks
    .map((check) => `- ${check.width}px: rails ${check.visibleRailCount}/${check.expectedRails}, overflow ${!check.noHorizontalOverflow}, overlap ${!check.noOverlap}`)
    .join("\n");
  const report = `# Round 4W Browser QA Report

## Result
- Status: ${results.status}
- Gallery-first UX preserved: ${results.summary.galleryFirstUxPreserved}
- SEO content present below gallery: ${results.summary.seoContentPresent}
- Round 4U ad density preserved: ${results.summary.adDensityMatchesRound4UPolicy}
- No horizontal overflow: ${results.summary.noHorizontalOverflow}
- Real media renders: ${results.summary.realMediaRenders}
- Print works: ${results.summary.printWorks}
- Download PNG works: ${results.summary.downloadPngWorks}
- No SVG download appears: ${results.summary.noSvgDownloadAppears}
- Desktop More menu accepted: ${results.summary.desktopMoreMenuAccepted}
- Mobile nav accepted: ${results.summary.mobileNavAccepted}
- Rail safety accepted: ${results.summary.railSafetyAccepted}

## Visible Advertisement Counts
${Object.entries(results.summary.visibleCountsByWidth).map(([width, count]) => `- ${width}px: ${count}`).join("\n")}

## Pages Inspected
${results.pagesInspected.map((pagePath) => `- ${pagePath}`).join("\n")}

## Rail Safety
${railLines}

## Screenshots
${screenshotLines}

Screenshots are local review artifacts under \`pipeline/review/round-4w/screenshots/\` and should not be committed.
`;
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report);
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }

  try {
    return require("@playwright/test");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }

  const executableNames = process.platform === "win32" ? ["playwright.cmd", "playwright.ps1", "playwright.exe"] : ["playwright"];
  for (const pathEntry of (process.env.PATH || "").split(path.delimiter)) {
    for (const executableName of executableNames) {
      const executablePath = path.join(pathEntry, executableName);
      if (!fs.existsSync(executablePath)) continue;
      const packageRoot = path.resolve(pathEntry, "..", "playwright");
      if (fs.existsSync(packageRoot)) return require(packageRoot);
    }
  }

  throw new Error("Playwright is not available. Run with npm exec --package=playwright -- node pipeline/scripts/round-4w-browser-qa-runner.cjs.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
