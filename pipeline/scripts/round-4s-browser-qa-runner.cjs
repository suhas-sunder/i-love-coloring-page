const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const { chromium } = requirePlaywright();

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MODE = process.env.ROUND4S_PLACEHOLDER_MODE || "off";
const BASE_URL = process.env.ROUND4S_APP_URL || "http://127.0.0.1:3005";
const RESULT_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "round-4s-browser-qa-results.json");

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
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "landscape-1024", width: 1024, height: 900 },
  { label: "desktop-1440", width: 1440, height: 960 },
  { label: "wide-1920", width: 1920, height: 1080 },
  { label: "ultra-2560", width: 2560, height: 1440 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = await readExistingResults();
  results.generatedAt = new Date().toISOString();
  results.status = "running";
  results.localMediaBaseUrl = "http://127.0.0.1:4175/coloring-pages";
  results.localAppUrl = BASE_URL;
  results.pagesInspected = PAGES;
  results.viewportsInspected = VIEWPORTS;
  results.screenshotRoots = {
    adPlaceholdersOn: "pipeline/review/round-4s/screenshots/ad-placeholders-on",
    adPlaceholdersOff: "pipeline/review/round-4s/screenshots/ad-placeholders-off",
    navDesktop: "pipeline/review/round-4s/screenshots/nav-desktop",
    navMobile: "pipeline/review/round-4s/screenshots/nav-mobile",
    overflowChecks: "pipeline/review/round-4s/screenshots/overflow-checks",
  };
  results.modes[MODE] = { pages: [], screenshots: [] };

  try {
    for (const pagePath of PAGES) {
      for (const viewport of VIEWPORTS) {
        const pageResult = await inspectPage(browser, pagePath, viewport);
        results.modes[MODE].pages.push(pageResult);
        results.modes[MODE].screenshots.push(...pageResult.screenshots);
      }
    }

    if (MODE === "on") {
      results.moreMenu = await inspectDesktopMoreMenu(browser);
      results.mobileNav = await inspectMobileNav(browser);
    }

    results.summary = summarize(results);
    results.status = results.summary.pass ? "passed" : "failed";
    await writeResults(results);
    assert.equal(results.summary.pass, true);
  } finally {
    await browser.close();
  }
}

async function inspectPage(browser, pagePath, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const consoleIssues = [];
  const adRequests = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleIssues.push(message.text());
  });
  page.on("request", (request) => {
    if (/googlesyndication|doubleclick|adsbygoogle|googleadservices/i.test(request.url())) {
      adRequests.push(request.url());
    }
  });

  try {
    await page.goto(toUrl(pagePath), { waitUntil: "domcontentloaded" });
    const mediaState = await waitForRealMedia(page);
    await assertNoForbiddenDownloadFormats(page);
    await assertNoForbiddenAdPlacements(page);
    const overflow = await getOverflowState(page);

    let adState;
    if (MODE === "on") {
      adState = await assertPlaceholderOn(page, pagePath, viewport);
    } else {
      adState = await assertPlaceholderOff(page, pagePath);
    }

    assert.deepEqual(adRequests, []);
    assert.deepEqual(consoleIssues.filter((issue) => !/favicon|Failed to load resource/i.test(issue)), []);
    assert.equal(overflow.hasHorizontalOverflow, false, `${pagePath} ${viewport.label} has horizontal overflow`);

    const screenshotRoot = MODE === "on" ? "ad-placeholders-on" : "ad-placeholders-off";
    const screenshot = await saveScreenshot(page, path.join("pipeline", "review", "round-4s", "screenshots", screenshotRoot), `${safePageName(pagePath)}-${viewport.label}.png`);
    const overflowScreenshot = await saveScreenshot(page, path.join("pipeline", "review", "round-4s", "screenshots", "overflow-checks"), `${MODE}-${safePageName(pagePath)}-${viewport.label}.png`);

    return {
      pagePath,
      viewport,
      overflow,
      mediaState,
      adState,
      adRequests,
      consoleIssues,
      screenshots: [
        { path: screenshot, committed: false },
        { path: overflowScreenshot, committed: false },
      ],
    };
  } finally {
    await context.close();
  }
}

async function assertPlaceholderOn(page, pagePath, viewport) {
  const expectedVisible = viewport.width >= 1740 ? 5 : 3;
  const visiblePlaceholders = await page.locator('[data-ad-placeholder="true"]:visible').count();
  const visibleLabels = await page.locator(".ad-slot-label:visible").count();
  assert.equal(visiblePlaceholders, expectedVisible, `${pagePath} ${viewport.label} should show expected ad placeholders`);
  assert.equal(visibleLabels, expectedVisible, `${pagePath} ${viewport.label} should show Advertisement labels`);
  assert.equal(await page.getByText("Future ad slot").count(), 0);

  const visualState = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-ad-placeholder='true']")).filter((slot) => {
      const rect = slot.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map((slot) => {
      const computed = window.getComputedStyle(slot);
      const pseudo = window.getComputedStyle(slot, "::before");
      const rect = slot.getBoundingClientRect();
      return {
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        boxShadow: computed.boxShadow,
        borderStyle: computed.borderStyle,
        pseudoContent: pseudo.content,
        width: rect.width,
        height: rect.height,
      };
    });
  });

  assert.ok(visualState.every((slot) => slot.backgroundImage === "none"));
  assert.ok(visualState.every((slot) => slot.boxShadow === "none"));
  assert.ok(visualState.every((slot) => slot.borderStyle === "none"));
  assert.ok(visualState.every((slot) => slot.pseudoContent === "none" || slot.pseudoContent === "normal"));
  assert.ok(visualState.every((slot) => slot.width > 0 && slot.height > 0));

  const headerSlotId = getHeaderSlotId(pagePath);
  assert.equal(await page.locator(`[data-ad-slot="${headerSlotId}"]:visible`).count(), 1);
  if (viewport.width >= 1740) {
    assert.equal(await page.locator('.ad-rail-left [data-ad-slot="rail-left-desktop"]:visible').count(), 1);
    assert.equal(await page.locator('.ad-rail-right [data-ad-slot="rail-right-desktop"]:visible').count(), 1);
    const railGaps = await page.evaluate(() => {
      const content = document.querySelector(".page-shell")?.getBoundingClientRect();
      const left = document.querySelector(".ad-rail-left")?.getBoundingClientRect();
      const right = document.querySelector(".ad-rail-right")?.getBoundingClientRect();
      return content && left && right
        ? { leftGap: content.left - left.right, rightGap: right.left - content.right, leftViewportGap: left.left, rightViewportGap: window.innerWidth - right.right }
        : null;
    });
    assert.ok(railGaps);
    assert.ok(railGaps.leftGap >= 40);
    assert.ok(railGaps.rightGap >= 40);
    assert.ok(railGaps.leftViewportGap >= 0);
    assert.ok(railGaps.rightViewportGap >= 0);
  } else {
    assert.equal(await page.locator(".ad-rail:visible").count(), 0);
  }

  return {
    visiblePlaceholderCount: visiblePlaceholders,
    visibleAdvertisementLabelCount: visibleLabels,
    expectedVisiblePlaceholderCount: expectedVisible,
  };
}

async function assertPlaceholderOff(page, pagePath) {
  const renderedPlaceholders = await page.locator('[data-ad-placeholder="true"]').count();
  const labels = await page.getByText("Advertisement").count();
  assert.equal(renderedPlaceholders, 0, `${pagePath} should not render placeholders when flag is off`);
  assert.equal(labels, 0, `${pagePath} should not show Advertisement labels when flag is off`);
  return {
    visiblePlaceholderCount: 0,
    visibleAdvertisementLabelCount: 0,
    expectedVisiblePlaceholderCount: 0,
  };
}

async function inspectDesktopMoreMenu(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  try {
    await page.goto(toUrl("/coloring-pages"), { waitUntil: "domcontentloaded" });
    await waitForRealMedia(page);
    const moreButton = page.getByRole("button", { name: "More", exact: true });
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    assert.equal(await moreButton.getAttribute("aria-expanded"), "true");
    assert.ok(await page.getByLabel("Search hub pages").isVisible());
    assert.equal(await page.locator(".hub-menu-panel [data-ad-placeholder='true']").count(), 0);
    const menuGeometry = await page.evaluate(() => {
      const panel = document.querySelector(".hub-menu-panel-desktop")?.getBoundingClientRect();
      const columns = window.getComputedStyle(document.querySelector(".hub-menu-grid")).gridTemplateColumns.split(" ").length;
      return panel ? { left: panel.left, right: panel.right, width: panel.width, viewportWidth: window.innerWidth, columns } : null;
    });
    assert.ok(menuGeometry);
    assert.ok(menuGeometry.width >= 1200);
    assert.ok(menuGeometry.left >= 0);
    assert.ok(menuGeometry.right <= menuGeometry.viewportWidth);
    assert.ok(menuGeometry.columns >= 5);
    await page.getByLabel("Search hub pages").fill("geometric");
    assert.equal(await page.locator(".hub-menu-panel-desktop a[href*='/coloring-pages/geometric']").count(), 1);
    const openScreenshot = await saveScreenshot(page, path.join("pipeline", "review", "round-4s", "screenshots", "nav-desktop"), "more-menu-open-wide.png");
    await moreButton.click();
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    await page.keyboard.press("Escape");
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    await page.mouse.click(20, 20);
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    await page.getByLabel("Search hub pages").fill("geometric");
    await page.locator(".hub-menu-panel-desktop a[href*='/coloring-pages/geometric']").click();
    await page.waitForURL(/\/coloring-pages\/geometric\/?$/);
    return {
      opens: true,
      closesOnButton: true,
      closesOnEscape: true,
      closesOnOutsideClick: true,
      closesOnLinkClick: true,
      searchWorks: true,
      geometry: menuGeometry,
      screenshots: [{ path: openScreenshot, committed: false }],
    };
  } finally {
    await context.close();
  }
}

async function inspectMobileNav(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(toUrl("/coloring-pages"), { waitUntil: "domcontentloaded" });
    await waitForRealMedia(page);
    const openButton = page.getByRole("button", { name: "Open navigation menu" });
    assert.equal(await openButton.getAttribute("aria-expanded"), "false");
    await openButton.click();
    const closeButton = page.locator(".mobile-nav-panel .mobile-nav-close");
    assert.equal(await closeButton.count(), 1);
    assert.ok(await page.getByLabel("Search mobile hub pages").isVisible());
    assert.equal(await page.locator(".mobile-nav-panel [data-ad-placeholder='true']").count(), 0);
    const panelGeometry = await page.evaluate(() => {
      const panel = document.querySelector(".mobile-nav-panel")?.getBoundingClientRect();
      const search = document.querySelector(".mobile-nav-panel input[type='search']")?.getBoundingClientRect();
      const styles = panel ? window.getComputedStyle(document.querySelector(".mobile-nav-panel")) : null;
      return panel && search && styles
        ? { left: panel.left, right: panel.right, width: panel.width, height: panel.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, searchTop: search.top, overflowX: styles.overflowX, overflowY: styles.overflowY }
        : null;
    });
    assert.ok(panelGeometry);
    assert.equal(Math.round(panelGeometry.left), 0);
    assert.equal(Math.round(panelGeometry.right), panelGeometry.viewportWidth);
    assert.equal(Math.round(panelGeometry.width), panelGeometry.viewportWidth);
    assert.ok(panelGeometry.height >= panelGeometry.viewportHeight - 1);
    assert.ok(panelGeometry.searchTop < 160);
    assert.ok(["clip", "hidden"].includes(panelGeometry.overflowX));
    assert.equal(panelGeometry.overflowY, "auto");
    const openScreenshot = await saveScreenshot(page, path.join("pipeline", "review", "round-4s", "screenshots", "nav-mobile"), "mobile-menu-open.png");
    await page.getByLabel("Search mobile hub pages").fill("mandalas");
    assert.equal(await page.locator(".mobile-nav-panel a[href*='/coloring-pages/mandalas']").count(), 1);
    await closeButton.click();
    assert.equal(await page.getByRole("button", { name: "Open navigation menu" }).getAttribute("aria-expanded"), "false");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Open navigation menu" }).getAttribute("aria-expanded"), "false");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByLabel("Search mobile hub pages").fill("chibi");
    await page.locator(".mobile-nav-panel a[href='/coloring-pages/chibi/']").click();
    await page.waitForURL(/\/coloring-pages\/chibi\/?$/);
    return {
      opens: true,
      closesOnButton: true,
      closesOnEscape: true,
      closesOnLinkClick: true,
      searchWorks: true,
      noAwkwardExposedSideGutter: true,
      geometry: panelGeometry,
      screenshots: [{ path: openScreenshot, committed: false }],
    };
  } finally {
    await context.close();
  }
}

async function getOverflowState(page) {
  return page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const viewportWidth = documentElement.clientWidth;
    const documentScrollWidth = documentElement.scrollWidth;
    const bodyScrollWidth = body ? body.scrollWidth : 0;
    const overflowingElements = Array.from(document.querySelectorAll("body *")).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        id: element.id || "",
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    }).filter((element) => element.right > viewportWidth + 1 || element.left < -1).slice(0, 20);
    return {
      viewportWidth,
      documentScrollWidth,
      bodyScrollWidth,
      hasHorizontalOverflow: documentScrollWidth > viewportWidth + 1 || bodyScrollWidth > viewportWidth + 1,
      overflowingElements,
    };
  });
}

function summarize(results) {
  const offPages = results.modes.off?.pages || [];
  const onPages = results.modes.on?.pages || [];
  const allPages = [...offPages, ...onPages];
  const widthsTested = Array.from(new Set(allPages.map((page) => page.viewport.width))).sort((a, b) => a - b);
  const widthsWithHorizontalScrollbar = Array.from(new Set(allPages.filter((page) => page.overflow.hasHorizontalOverflow).map((page) => page.viewport.width))).sort((a, b) => a - b);
  const requiredOnPages = new Set(["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric"]);
  const requiredOnStates = onPages.filter((page) => requiredOnPages.has(page.pagePath));
  const offLabels = offPages.reduce((sum, page) => sum + page.adState.visibleAdvertisementLabelCount, 0);
  const onLabelsByPageType = summarizeLabelCounts(onPages);
  const offModePass = widthsWithHorizontalScrollbar.length === 0
    && offPages.length >= PAGES.length * VIEWPORTS.length
    && offLabels === 0;
  const onModePass = widthsWithHorizontalScrollbar.length === 0
    && onPages.length >= PAGES.length * VIEWPORTS.length
    && requiredOnStates.every((page) => page.adState.visibleAdvertisementLabelCount > 0)
    && results.moreMenu?.opens
    && results.mobileNav?.opens;
  const pass = MODE === "off" ? offModePass : offModePass && onModePass;

  return {
    pass,
    overflow: {
      widthsTested,
      widthsWithHorizontalScrollbar,
      noHorizontalScrollbarAtTestedWidths: widthsWithHorizontalScrollbar.length === 0,
    },
    placeholderOff: {
      visibleAdvertisementLabelCount: offLabels,
      noPlaceholdersVisible: offLabels === 0,
    },
    placeholderOn: {
      allRequiredPagesHaveVisibleAdvertisementLabels: requiredOnStates.every((page) => page.adState.visibleAdvertisementLabelCount > 0),
      visibleAdvertisementLabelCountsByPageType: onLabelsByPageType,
      noAdCausedHorizontalOverflow: widthsWithHorizontalScrollbar.length === 0,
    },
    moreMenu: {
      opens: Boolean(results.moreMenu?.opens),
      closesOnButton: Boolean(results.moreMenu?.closesOnButton),
      closesOnEscape: Boolean(results.moreMenu?.closesOnEscape),
      closesOnOutsideClick: Boolean(results.moreMenu?.closesOnOutsideClick),
      closesOnLinkClick: Boolean(results.moreMenu?.closesOnLinkClick),
      searchWorks: Boolean(results.moreMenu?.searchWorks),
      noHorizontalOverflow: widthsWithHorizontalScrollbar.length === 0,
    },
    mobileNav: {
      opens: Boolean(results.mobileNav?.opens),
      closesOnButton: Boolean(results.mobileNav?.closesOnButton),
      closesOnEscape: Boolean(results.mobileNav?.closesOnEscape),
      closesOnLinkClick: Boolean(results.mobileNav?.closesOnLinkClick),
      searchWorks: Boolean(results.mobileNav?.searchWorks),
      noAwkwardExposedSideGutter: Boolean(results.mobileNav?.noAwkwardExposedSideGutter),
      noHorizontalOverflow: widthsWithHorizontalScrollbar.length === 0,
    },
  };
}

function summarizeLabelCounts(onPages) {
  const result = {};
  for (const page of onPages) {
    const pageType = getPageType(page.pagePath);
    result[pageType] ||= {};
    result[pageType][page.viewport.label] ||= page.adState.visibleAdvertisementLabelCount;
  }
  return result;
}

function getPageType(pagePath) {
  if (pagePath === "/") return "home";
  if (pagePath === "/coloring-pages") return "galleryLanding";
  return "hubPage";
}

function toUrl(pagePath) {
  return `${BASE_URL}${pagePath}`;
}

function getHeaderSlotId(pagePath) {
  if (pagePath === "/") return "home-header-banner";
  if (pagePath === "/coloring-pages") return "coloring-pages-header-banner";
  return "hub-header-banner";
}

async function waitForRealMedia(page) {
  await page.waitForFunction(() => document.querySelectorAll("img.asset-image[data-state='loaded']").length > 0, null, { timeout: 15000 });
  const loadedImageCount = await page.locator("img.asset-image[data-state='loaded']").count();
  const assetPlaceholderCount = await page.locator(".asset-placeholder").count();
  assert.equal(loadedImageCount > 0, true);
  return { loadedImageCount, assetPlaceholderCount };
}

async function assertNoForbiddenDownloadFormats(page) {
  assert.equal(await page.getByText(/Download SVG|Download JPG|Download JPEG|Download WebP/i).count(), 0);
}

async function assertNoForbiddenAdPlacements(page) {
  assert.equal(await page.locator("header [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".hub-menu-panel [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".mobile-nav-panel [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".gallery-grid [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".gallery-actions [data-ad-placeholder='true']").count(), 0);
}

async function saveScreenshot(page, relativeRoot, fileName) {
  const root = path.join(REPO_ROOT, relativeRoot);
  await mkdir(root, { recursive: true });
  const relativePath = path.join(relativeRoot, fileName).replaceAll("\\", "/");
  await page.screenshot({ path: path.join(REPO_ROOT, relativePath), fullPage: true });
  return relativePath;
}

async function readExistingResults() {
  try {
    return JSON.parse(await readFile(RESULT_PATH, "utf8"));
  } catch {
    return {
      runId: "round-4s-nav-ad-overflow",
      modes: {},
    };
  }
}

async function writeResults(results) {
  await mkdir(path.dirname(RESULT_PATH), { recursive: true });
  await writeFile(RESULT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
}

function safePageName(pagePath) {
  if (pagePath === "/") return "home";
  return pagePath.replace(/^\//, "").replaceAll("/", "-");
}

function requirePlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }

  const executableNames = process.platform === "win32" ? ["playwright.cmd", "playwright.ps1", "playwright.exe"] : ["playwright"];
  for (const pathEntry of (process.env.PATH || "").split(path.delimiter)) {
    for (const executableName of executableNames) {
      const executablePath = path.join(pathEntry, executableName);
      if (!existsSync(executablePath)) continue;
      const packageRoot = path.resolve(pathEntry, "..", "playwright");
      if (existsSync(packageRoot)) return require(packageRoot);
    }
  }

  throw new Error("Playwright is not available. Run this script with npm exec --package=playwright -- node <script>.");
}

main().then(
  () => {
    const output = JSON.parse(readFileSync(RESULT_PATH, "utf8"));
    console.log(JSON.stringify({ mode: MODE, status: output.status }, null, 2));
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
