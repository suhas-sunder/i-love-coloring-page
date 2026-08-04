const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

const { chromium } = requirePlaywright();

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASE_URL = process.env.ROUND4U_APP_URL || "http://127.0.0.1:3005";
const RESULT_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "round-4u-browser-qa-results.json");

const PAGES = [
  { pagePath: "/", pageType: "home", headerSlot: "home-header-banner", mobileSlot: "home-after-hero" },
  {
    pagePath: "/coloring-pages",
    pageType: "galleryLanding",
    headerSlot: "coloring-pages-header-banner",
    mobileSlot: "coloring-pages-after-featured",
  },
  { pagePath: "/coloring-pages/animals", pageType: "hubPage", headerSlot: "hub-header-banner", mobileSlot: "hub-after-gallery" },
  { pagePath: "/coloring-pages/christmas", pageType: "hubPage", headerSlot: "hub-header-banner", mobileSlot: "hub-after-gallery" },
  { pagePath: "/coloring-pages/geometric", pageType: "hubPage", headerSlot: "hub-header-banner", mobileSlot: "hub-after-gallery" },
];

const VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 844, screenshotGroup: "mobile" },
  { label: "mobile-430", width: 430, height: 932, screenshotGroup: "mobile" },
  { label: "tablet-768", width: 768, height: 1024, screenshotGroup: "tablet" },
  { label: "landscape-1024", width: 1024, height: 900, screenshotGroup: "tablet" },
  { label: "desktop-1280", width: 1280, height: 900, screenshotGroup: "desktop" },
  { label: "desktop-1440", width: 1440, height: 960, screenshotGroup: "desktop" },
  { label: "wide-1920", width: 1920, height: 1080, screenshotGroup: "wide-desktop" },
  { label: "ultra-2560", width: 2560, height: 1440, screenshotGroup: "wide-desktop" },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = {
    generatedAt: new Date().toISOString(),
    runId: "round-4u-ad-density",
    status: "running",
    localAppUrl: BASE_URL,
    localMediaBaseUrl: "http://127.0.0.1:4175/coloring-pages",
    advertisingMode: "automatic",
    pagesInspected: PAGES.map((page) => page.pagePath),
    viewportsInspected: VIEWPORTS,
    screenshotRoots: {
      adDensity: "pipeline/review/round-4u/screenshots/ad-density",
      mobile: "pipeline/review/round-4u/screenshots/mobile",
      tablet: "pipeline/review/round-4u/screenshots/tablet",
      desktop: "pipeline/review/round-4u/screenshots/desktop",
      wideDesktop: "pipeline/review/round-4u/screenshots/wide-desktop",
      overflow: "pipeline/review/round-4u/screenshots/overflow",
    },
    pages: [],
    screenshots: [],
    moreMenu: null,
    mobileNav: null,
  };

  try {
    for (const pageInfo of PAGES) {
      for (const viewport of VIEWPORTS) {
        const pageResult = await inspectPage(browser, pageInfo, viewport);
        results.pages.push(pageResult);
        results.screenshots.push(...pageResult.screenshots);
      }
    }

    results.moreMenu = await inspectDesktopMoreMenu(browser);
    results.mobileNav = await inspectMobileNav(browser);
    results.screenshots.push(...results.moreMenu.screenshots, ...results.mobileNav.screenshots);
    results.summary = summarize(results);
    results.status = results.summary.pass ? "passed" : "failed";
    await writeResults(results);
    assert.equal(results.summary.pass, true);
  } finally {
    await browser.close();
  }
}

async function inspectPage(browser, pageInfo, viewport) {
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
    await page.goto(toUrl(pageInfo.pagePath), { waitUntil: "domcontentloaded" });
    const mediaState = await waitForRealMedia(page);
    await assertNoForbiddenDownloadFormats(page);
    await assertNoForbiddenAdPlacements(page);
    const overflow = await getOverflowState(page);
    const adState = await assertResponsiveAds(page, pageInfo, viewport);

    assert.deepEqual(adRequests, []);
    assert.deepEqual(consoleIssues.filter((issue) => !/favicon|Failed to load resource/i.test(issue)), []);
    assert.equal(overflow.hasHorizontalOverflow, false, `${pageInfo.pagePath} ${viewport.label} has horizontal overflow`);

    const adDensityScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4u", "screenshots", "ad-density"),
      `${safePageName(pageInfo.pagePath)}-${viewport.label}.png`,
    );
    const responsiveScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4u", "screenshots", viewport.screenshotGroup),
      `${safePageName(pageInfo.pagePath)}-${viewport.label}.png`,
    );
    const overflowScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4u", "screenshots", "overflow"),
      `${safePageName(pageInfo.pagePath)}-${viewport.label}.png`,
    );

    return {
      pagePath: pageInfo.pagePath,
      pageType: pageInfo.pageType,
      viewport,
      mediaState,
      overflow,
      adState,
      adRequests,
      consoleIssues,
      screenshots: [
        { path: adDensityScreenshot, visibleAdvertisementLabelCount: adState.visibleAdvertisementLabelCount, committed: false },
        { path: responsiveScreenshot, visibleAdvertisementLabelCount: adState.visibleAdvertisementLabelCount, committed: false },
        { path: overflowScreenshot, visibleAdvertisementLabelCount: adState.visibleAdvertisementLabelCount, committed: false },
      ],
    };
  } finally {
    await context.close();
  }
}

async function assertResponsiveAds(page, pageInfo, viewport) {
  const expectedVisible = expectedCount(viewport.width);
  const expectedSlots = expectedSlotIds(pageInfo, viewport.width);
  const visiblePlaceholders = await page.locator('[data-ad-placeholder="true"]:visible').count();
  const visibleLabels = await page.locator(".ad-slot-label:visible").count();

  assert.equal(visiblePlaceholders, expectedVisible, `${pageInfo.pagePath} ${viewport.label} ad well count`);
  assert.equal(visibleLabels, expectedVisible, `${pageInfo.pagePath} ${viewport.label} Advertisement label count`);

  const adModel = await page.evaluate(() => {
    const visibleSlots = Array.from(document.querySelectorAll("[data-ad-placeholder='true']")).filter((slot) => {
      const rect = slot.getBoundingClientRect();
      const style = window.getComputedStyle(slot);
      return style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).map((slot) => {
      const rect = slot.getBoundingClientRect();
      const computed = window.getComputedStyle(slot);
      return {
        slotId: slot.getAttribute("data-ad-slot"),
        className: slot.className,
        backgroundColor: computed.backgroundColor,
        backgroundImage: computed.backgroundImage,
        cursor: computed.cursor,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    const shell = document.querySelector(".page-shell")?.getBoundingClientRect();
    const left = document.querySelector(".ad-rail-left")?.getBoundingClientRect();
    const right = document.querySelector(".ad-rail-right")?.getBoundingClientRect();
    return {
      visibleSlots,
      visibleSlotIds: visibleSlots.map((slot) => slot.slotId),
      headerBannerVisible: visibleSlots.some((slot) => slot.className.includes("ad-slot-header-banner")),
      mobileLowerBannerVisible: visibleSlots.some((slot) => slot.className.includes("ad-slot-inline")),
      lowerContentVisible: visibleSlots.some((slot) => slot.className.includes("ad-slot-lower-content")),
      leftRailVisible: Boolean(left && left.width > 0 && left.height > 0),
      rightRailVisible: Boolean(right && right.width > 0 && right.height > 0),
      leftGap: shell && left ? shell.left - left.right : null,
      rightGap: shell && right ? right.left - shell.right : null,
    };
  });

  assert.deepEqual([...adModel.visibleSlotIds].sort(), [...expectedSlots].sort(), `${pageInfo.pagePath} ${viewport.label} visible slot ids`);
  assert.equal(adModel.lowerContentVisible, false, `${pageInfo.pagePath} ${viewport.label} should not show lower-content density reserve`);

  if (viewport.width < 1280) {
    assert.equal(adModel.mobileLowerBannerVisible, true);
    assert.equal(adModel.headerBannerVisible, false);
    assert.equal(adModel.leftRailVisible, false);
    assert.equal(adModel.rightRailVisible, false);
  } else if (viewport.width < 1740) {
    assert.equal(adModel.mobileLowerBannerVisible, false);
    assert.equal(adModel.headerBannerVisible, true);
    assert.equal(adModel.leftRailVisible, false);
    assert.equal(adModel.rightRailVisible, false);
  } else {
    assert.equal(adModel.mobileLowerBannerVisible, false);
    assert.equal(adModel.headerBannerVisible, true);
    assert.equal(adModel.leftRailVisible, true);
    assert.equal(adModel.rightRailVisible, true);
    assert.ok(adModel.leftGap >= 40);
    assert.ok(adModel.rightGap >= 40);
  }

  for (const slot of adModel.visibleSlots) {
    assert.notEqual(slot.backgroundColor, "rgba(0, 0, 0, 0)");
    assert.equal(slot.backgroundImage, "none");
    assert.notEqual(slot.cursor, "pointer");
    assert.ok(slot.width >= 120);
    assert.ok(slot.height >= 72);
  }

  return {
    visiblePlaceholderCount: visiblePlaceholders,
    visibleAdvertisementLabelCount: visibleLabels,
    expectedVisiblePlaceholderCount: expectedVisible,
    expectedVisibleSlotIds: expectedSlots,
    ...adModel,
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
    const menu = page.locator(".hub-menu-panel-desktop");
    assert.equal(await menu.count(), 1);
    assert.ok(await page.getByLabel("Search hub pages").isVisible());
    assert.equal(await menu.locator("[data-ad-placeholder='true']").count(), 0);
    const menuGeometry = await page.evaluate(() => {
      const menuRect = document.querySelector(".hub-menu-panel-desktop")?.getBoundingClientRect();
      const grid = document.querySelector(".hub-menu-panel-desktop .hub-menu-grid");
      const gridStyles = grid ? window.getComputedStyle(grid) : null;
      return menuRect && gridStyles
        ? { left: menuRect.left, right: menuRect.right, width: menuRect.width, viewportWidth: window.innerWidth, columns: gridStyles.gridTemplateColumns }
        : null;
    });
    assert.ok(menuGeometry);
    assert.ok(menuGeometry.width > 1000);
    assert.ok(menuGeometry.left >= 0);
    assert.ok(menuGeometry.right <= 1920);
    await page.getByLabel("Search hub pages").fill("beetle");
    assert.ok((await menu.textContent()).includes("Beetles"));
    await moreButton.click();
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    await page.keyboard.press("Escape");
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    await page.mouse.click(10, 10);
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    await page.getByLabel("Search hub pages").fill("beetle");
    await page.locator(".hub-menu-panel-desktop a[href='/coloring-pages/beetles/']").click();
    await page.waitForURL("**/coloring-pages/beetles/", { timeout: 10000 });

    const screenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4u", "screenshots", "desktop"),
      "desktop-more-menu-after-link.png",
    );

    return {
      opens: true,
      closesOnButton: true,
      closesOnEscape: true,
      closesOnOutsideClick: true,
      closesOnLinkClick: true,
      searchWorks: true,
      noAdsInMenu: true,
      geometry: menuGeometry,
      screenshots: [{ path: screenshot, committed: false }],
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
    const toggle = page.locator(".mobile-nav-toggle");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const panel = page.locator(".mobile-nav-panel");
    assert.equal(await panel.locator("[data-ad-placeholder='true']").count(), 0);
    assert.ok(await panel.getByLabel("Search mobile hub pages").isVisible());
    const geometry = await page.evaluate(() => {
      const panelRect = document.querySelector(".mobile-nav-panel")?.getBoundingClientRect();
      const searchRect = document.querySelector(".mobile-nav-panel input[type='search']")?.getBoundingClientRect();
      const styles = document.querySelector(".mobile-nav-panel") ? window.getComputedStyle(document.querySelector(".mobile-nav-panel")) : null;
      return panelRect && searchRect && styles
        ? {
            left: panelRect.left,
            right: panelRect.right,
            width: panelRect.width,
            height: panelRect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            searchTop: searchRect.top,
            overflowX: styles.overflowX,
            overflowY: styles.overflowY,
          }
        : null;
    });
    assert.ok(geometry);
    assert.equal(geometry.left, 0);
    assert.equal(geometry.right, 390);
    assert.equal(geometry.width, 390);
    await panel.getByLabel("Search mobile hub pages").fill("beetle");
    assert.ok((await panel.textContent()).includes("Beetles"));

    const openScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4u", "screenshots", "mobile"),
      "mobile-menu-open.png",
    );

    await page.locator(".mobile-nav-close").click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.click();
    await page.keyboard.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.click();
    await panel.getByLabel("Search mobile hub pages").fill("beetle");
    await panel.locator("a[href='/coloring-pages/beetles/']").click();
    await page.waitForURL("**/coloring-pages/beetles/", { timeout: 10000 });

    return {
      opens: true,
      closesOnButton: true,
      closesOnEscape: true,
      closesOnLinkClick: true,
      searchWorks: true,
      noAdsInMobileNav: true,
      noAwkwardExposedSideGutter: geometry.left === 0 && geometry.right === geometry.viewportWidth,
      noHorizontalOverflow: geometry.width <= geometry.viewportWidth,
      geometry,
      screenshots: [{ path: openScreenshot, committed: false }],
    };
  } finally {
    await context.close();
  }
}

function summarize(results) {
  const pages = results.pages;
  const visibleCountsByWidth = {};
  const labelCountsByPageAndWidth = {};
  const labelCountsByScreenshot = {};
  const widthsWithHorizontalScrollbar = [];
  const failures = [];

  for (const page of pages) {
    const width = String(page.viewport.width);
    visibleCountsByWidth[width] ??= page.adState.visibleAdvertisementLabelCount;
    if (visibleCountsByWidth[width] !== page.adState.visibleAdvertisementLabelCount) failures.push(`${page.pagePath} ${width} inconsistent count`);
    labelCountsByPageAndWidth[`${page.pagePath}@${width}`] = page.adState.visibleAdvertisementLabelCount;
    if (page.overflow.hasHorizontalOverflow) widthsWithHorizontalScrollbar.push(page.viewport.width);
    for (const screenshot of page.screenshots) labelCountsByScreenshot[screenshot.path] = screenshot.visibleAdvertisementLabelCount;
    if (page.adState.visibleAdvertisementLabelCount > 3) failures.push(`${page.pagePath} ${width} shows too many ad wells`);
    if (page.adRequests.length > 0) failures.push(`${page.pagePath} ${width} made ad requests`);
  }

  const mobilePages = pages.filter((page) => page.viewport.width < 1280);
  const desktopPages = pages.filter((page) => page.viewport.width >= 1280);
  const belowWideDesktopPages = pages.filter((page) => page.viewport.width < 1740);
  const widePages = pages.filter((page) => page.viewport.width >= 1740);
  const allExpectedCountsPass = pages.every((page) => page.adState.visibleAdvertisementLabelCount === expectedCount(page.viewport.width));

  const summary = {
    pass: failures.length === 0
      && allExpectedCountsPass
      && widthsWithHorizontalScrollbar.length === 0
      && results.moreMenu?.opens
      && results.mobileNav?.opens,
    visibleCountsByWidth,
    labelCountsByPageAndWidth,
    labelCountsByScreenshot,
    expectedCountsByWidth: Object.fromEntries(VIEWPORTS.map((viewport) => [String(viewport.width), expectedCount(viewport.width)])),
    mobileLowerBannerVisibleBelowDesktop: mobilePages.every((page) => page.adState.mobileLowerBannerVisible === true),
    desktopHeaderBannerHiddenBelowDesktop: mobilePages.every((page) => page.adState.headerBannerVisible === false),
    mobileLowerBannerHiddenAtDesktop: desktopPages.every((page) => page.adState.mobileLowerBannerVisible === false),
    desktopHeaderBannerVisibleAtDesktop: desktopPages.every((page) => page.adState.headerBannerVisible === true),
    leftRightRailsHiddenBelowWideDesktop: belowWideDesktopPages.every((page) => !page.adState.leftRailVisible && !page.adState.rightRailVisible),
    leftRightRailsVisibleAtWideDesktop: widePages.every((page) => page.adState.leftRailVisible && page.adState.rightRailVisible),
    noPageShowsFourOrFiveWells: pages.every((page) => page.adState.visibleAdvertisementLabelCount <= 3),
    desktopAndMobileModelsOverlap: pages.some((page) => page.adState.headerBannerVisible && page.adState.mobileLowerBannerVisible),
    ownerAdDensityIssueFixed: pages.every((page) => page.adState.visibleAdvertisementLabelCount <= 3)
      && mobilePages.every((page) => page.adState.visibleAdvertisementLabelCount === 1)
      && widePages.every((page) => page.adState.visibleAdvertisementLabelCount === 3),
    overflow: {
      widthsTested: VIEWPORTS.map((viewport) => viewport.width),
      widthsWithHorizontalScrollbar: [...new Set(widthsWithHorizontalScrollbar)].sort((a, b) => a - b),
      noHorizontalScrollbarAtTestedWidths: widthsWithHorizontalScrollbar.length === 0,
    },
    moreMenu: {
      opens: results.moreMenu?.opens === true,
      closesOnButton: results.moreMenu?.closesOnButton === true,
      closesOnEscape: results.moreMenu?.closesOnEscape === true,
      closesOnOutsideClick: results.moreMenu?.closesOnOutsideClick === true,
      closesOnLinkClick: results.moreMenu?.closesOnLinkClick === true,
      searchWorks: results.moreMenu?.searchWorks === true,
      noAdsInMenu: results.moreMenu?.noAdsInMenu === true,
    },
    mobileNav: {
      opens: results.mobileNav?.opens === true,
      closesOnButton: results.mobileNav?.closesOnButton === true,
      closesOnEscape: results.mobileNav?.closesOnEscape === true,
      closesOnLinkClick: results.mobileNav?.closesOnLinkClick === true,
      searchWorks: results.mobileNav?.searchWorks === true,
      noAdsInMobileNav: results.mobileNav?.noAdsInMobileNav === true,
      noAwkwardExposedSideGutter: results.mobileNav?.noAwkwardExposedSideGutter === true,
      noHorizontalOverflow: results.mobileNav?.noHorizontalOverflow === true,
    },
    failures,
  };

  return summary;
}

function expectedCount(width) {
  return width >= 1740 ? 3 : 1;
}

function expectedSlotIds(pageInfo, width) {
  if (width < 1280) return [pageInfo.mobileSlot];
  if (width < 1740) return [pageInfo.headerSlot];
  return [pageInfo.headerSlot, "rail-left-desktop", "rail-right-desktop"];
}

async function waitForRealMedia(page) {
  await page.waitForFunction(() => {
    const images = Array.from(document.images).filter((image) => image.classList.contains("asset-image"));
    return images.length > 0 && images.slice(0, 4).every((image) => image.complete && image.naturalWidth > 0);
  }, { timeout: 15000 });

  return page.evaluate(() => {
    const images = Array.from(document.images).filter((image) => image.classList.contains("asset-image"));
    return {
      loadedImageCount: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      assetPlaceholderCount: document.querySelectorAll(".asset-placeholder").length,
    };
  });
}

async function assertNoForbiddenDownloadFormats(page) {
  const text = await page.locator("body").innerText();
  assert.match(text, /Download PNG/);
  assert.doesNotMatch(text, /Download SVG|Download JPG|Download JPEG|Download WebP/);
}

async function assertNoForbiddenAdPlacements(page) {
  const forbiddenCounts = await page.evaluate(() => {
    const scopes = [
      [".site-header", "siteHeader"],
      [".hub-menu-panel-desktop", "moreMenu"],
      [".mobile-nav-panel", "mobileNav"],
      [".image-card", "imageCard"],
      [".gallery-grid", "galleryGrid"],
      [".image-card-actions", "cardActions"],
    ];
    return Object.fromEntries(scopes.map(([selector, name]) => [
      name,
      document.querySelector(selector)?.querySelectorAll("[data-ad-placeholder='true']").length || 0,
    ]));
  });

  assert.deepEqual(forbiddenCounts, {
    siteHeader: 0,
    moreMenu: 0,
    mobileNav: 0,
    imageCard: 0,
    galleryGrid: 0,
    cardActions: 0,
  });
}

async function getOverflowState(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const overflowingElements = Array.from(document.querySelectorAll("body *")).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), className: element.className, width: rect.width, left: rect.left, right: rect.right };
    }).filter((rect) => rect.right > viewportWidth + 1 || rect.left < -1).slice(0, 12);
    return {
      viewportWidth,
      documentScrollWidth,
      bodyScrollWidth,
      hasHorizontalOverflow: documentScrollWidth > viewportWidth + 1 || bodyScrollWidth > viewportWidth + 1,
      overflowingElements,
    };
  });
}

async function saveScreenshot(page, relativeDirectory, fileName) {
  const absoluteDirectory = path.join(REPO_ROOT, relativeDirectory);
  await mkdir(absoluteDirectory, { recursive: true });
  const relativePath = path.join(relativeDirectory, fileName).replaceAll("\\", "/");
  await page.screenshot({ path: path.join(REPO_ROOT, relativePath), fullPage: false });
  return relativePath;
}

async function writeResults(results) {
  await mkdir(path.dirname(RESULT_PATH), { recursive: true });
  await writeFile(RESULT_PATH, `${JSON.stringify(results, null, 2)}\n`);
}

function safePageName(pagePath) {
  return pagePath === "/" ? "home" : pagePath.replace(/^\//, "").replaceAll("/", "-");
}

function toUrl(pagePath) {
  return `${BASE_URL}${pagePath}`;
}

function requirePlaywright() {
  try {
    return require("playwright");
  } catch {
    return require("@playwright/test");
  }
}

main().catch(async (error) => {
  await writeResults({
    generatedAt: new Date().toISOString(),
    runId: "round-4u-ad-density",
    status: "failed",
    error: error.stack || String(error),
  });
  console.error(error);
  process.exitCode = 1;
});
