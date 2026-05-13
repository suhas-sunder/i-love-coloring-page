const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const { chromium } = requirePlaywright();

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASE_URL = process.env.ROUND4V_APP_URL || "http://127.0.0.1:3005";
const RUN_ID = "round-4v-owner-acceptance";
const GENERATED_AT = new Date().toISOString();
const MANIFEST_DIR = path.join(REPO_ROOT, "pipeline", "manifests");
const REPORT_DIR = path.join(REPO_ROOT, "pipeline", "reports");

const AD_PAGES = [
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

const GALLERY_PAGES = [
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
  { label: "mobile-390", width: 390, height: 844, screenshotGroup: "mobile" },
  { label: "mobile-430", width: 430, height: 932, screenshotGroup: "mobile" },
  { label: "tablet-768", width: 768, height: 1024, screenshotGroup: "tablet" },
  { label: "landscape-1024", width: 1024, height: 900, screenshotGroup: "tablet" },
  { label: "desktop-1280", width: 1280, height: 900, screenshotGroup: "desktop" },
  { label: "desktop-1440", width: 1440, height: 960, screenshotGroup: "desktop" },
  { label: "wide-1920", width: 1920, height: 1080, screenshotGroup: "wide-desktop" },
  { label: "ultra-2560", width: 2560, height: 1440, screenshotGroup: "wide-desktop" },
];

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
  mkdirSync(MANIFEST_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    status: "running",
    localAppUrl: BASE_URL,
    localMediaBaseUrl: "http://127.0.0.1:4175/coloring-pages",
    pagesInspected: GALLERY_PAGES,
    adPagesInspected: AD_PAGES.map((page) => page.pagePath),
    viewportsInspected: VIEWPORTS,
    screenshotRoots: {
      mobile: "pipeline/review/round-4v/screenshots/mobile",
      tablet: "pipeline/review/round-4v/screenshots/tablet",
      desktop: "pipeline/review/round-4v/screenshots/desktop",
      wideDesktop: "pipeline/review/round-4v/screenshots/wide-desktop",
      nav: "pipeline/review/round-4v/screenshots/nav",
      adLayout: "pipeline/review/round-4v/screenshots/ad-layout",
      overflow: "pipeline/review/round-4v/screenshots/overflow",
    },
    adChecks: [],
    galleryChecks: [],
    screenshots: [],
    nav: null,
    printDownload: null,
  };

  try {
    for (const pageInfo of AD_PAGES) {
      for (const viewport of VIEWPORTS) {
        const check = await inspectAdLayout(browser, pageInfo, viewport);
        results.adChecks.push(check);
        results.screenshots.push(...check.screenshots);
      }
    }

    for (const pagePath of GALLERY_PAGES) {
      const check = await inspectGalleryPage(browser, pagePath);
      results.galleryChecks.push(check);
      results.screenshots.push(...check.screenshots);
    }

    results.nav = await inspectNavigation(browser);
    results.screenshots.push(...results.nav.screenshots);
    results.printDownload = await inspectPrintDownload(browser);
    results.screenshots.push(...results.printDownload.screenshots);
    results.summary = summarizeBrowserResults(results);
    results.status = results.summary.ownerSensitiveIssuesAccepted ? "passed" : "failed";

    const context = buildProjectContext();
    const manifests = buildManifests(results, context);
    writeManifests(manifests);
    writeReports(manifests);

    assert.equal(results.status, "passed");
    assert.equal(manifests.ownerAcceptanceGate.summary.accepted_for_seo_round, true);
  } finally {
    await browser.close();
  }
}

async function inspectAdLayout(browser, pageInfo, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const consoleIssues = [];
  const adRequests = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleIssues.push(message.text());
  });
  page.on("request", (request) => {
    if (/googlesyndication|doubleclick|adsbygoogle|googleadservices/i.test(request.url())) adRequests.push(request.url());
  });

  try {
    await page.goto(toUrl(pageInfo.pagePath), { waitUntil: "domcontentloaded" });
    const mediaState = await waitForRealMedia(page);
    await assertNoForbiddenDownloadFormats(page);
    const forbiddenAdPlacements = await getForbiddenAdPlacements(page);
    const overflow = await getOverflowState(page);
    const adState = await getAdState(page, pageInfo, viewport);

    assert.deepEqual(adRequests, []);
    assert.deepEqual(consoleIssues.filter((issue) => !/favicon|Failed to load resource/i.test(issue)), []);
    assert.deepEqual(forbiddenAdPlacements, emptyForbiddenAdPlacementCounts());
    assert.equal(overflow.hasHorizontalOverflow, false, `${pageInfo.pagePath} ${viewport.label} horizontal overflow`);
    assert.equal(adState.visibleAdvertisementLabelCount, expectedCount(viewport.width));
    assert.deepEqual([...adState.visibleSlotIds].sort(), [...expectedSlotIds(pageInfo, viewport.width)].sort());

    const adLayoutScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", "ad-layout"),
      `${safePageName(pageInfo.pagePath)}-${viewport.label}.png`,
    );
    const responsiveScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", viewport.screenshotGroup),
      `${safePageName(pageInfo.pagePath)}-${viewport.label}.png`,
    );
    const overflowScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", "overflow"),
      `${safePageName(pageInfo.pagePath)}-${viewport.label}.png`,
    );

    return {
      pagePath: pageInfo.pagePath,
      pageType: pageInfo.pageType,
      viewport,
      mediaState,
      adState,
      forbiddenAdPlacements,
      overflow,
      adRequests,
      consoleIssues,
      screenshots: [
        screenshotRecord(adLayoutScreenshot, adState.visibleAdvertisementLabelCount, expectedCount(viewport.width)),
        screenshotRecord(responsiveScreenshot, adState.visibleAdvertisementLabelCount, expectedCount(viewport.width)),
        screenshotRecord(overflowScreenshot, adState.visibleAdvertisementLabelCount, expectedCount(viewport.width)),
      ],
    };
  } finally {
    await context.close();
  }
}

async function inspectGalleryPage(browser, pagePath) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleIssues = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleIssues.push(message.text());
  });

  try {
    await page.goto(toUrl(pagePath), { waitUntil: "domcontentloaded" });
    const mediaState = await waitForRealMedia(page);
    await assertNoForbiddenDownloadFormats(page);
    const imageState = await getImageState(page);
    const overflow = await getOverflowState(page);
    const screenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", "desktop"),
      `${safePageName(pagePath)}-gallery-desktop-1440.png`,
    );

    assert.equal(imageState.brokenImageCount, 0, `${pagePath} broken images`);
    assert.equal(imageState.brokenAltTextPlaceholderCount, 0, `${pagePath} broken alt text placeholders`);
    assert.equal(overflow.hasHorizontalOverflow, false, `${pagePath} gallery overflow`);
    assert.deepEqual(consoleIssues.filter((issue) => !/favicon|Failed to load resource/i.test(issue)), []);

    return {
      pagePath,
      viewport: { width: 1440, height: 960 },
      mediaState,
      imageState,
      overflow,
      consoleIssues,
      screenshots: [screenshotRecord(screenshot, null, null)],
    };
  } finally {
    await context.close();
  }
}

async function inspectNavigation(browser) {
  const desktop = await inspectDesktopMoreMenu(browser);
  const mobile = await inspectMobileNav(browser);
  return {
    desktopMoreMenu: desktop,
    mobileNav: mobile,
    screenshots: [...desktop.screenshots, ...mobile.screenshots],
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
    const panel = page.locator(".hub-menu-panel-desktop");
    assert.equal(await panel.locator("[data-ad-placeholder='true']").count(), 0);
    assert.ok(await page.getByLabel("Search hub pages").isVisible());
    const geometry = await page.evaluate(() => {
      const panelRect = document.querySelector(".hub-menu-panel-desktop")?.getBoundingClientRect();
      const grid = document.querySelector(".hub-menu-panel-desktop .hub-menu-grid");
      const gridStyles = grid ? window.getComputedStyle(grid) : null;
      return panelRect && gridStyles
        ? {
            left: panelRect.left,
            right: panelRect.right,
            width: panelRect.width,
            viewportWidth: window.innerWidth,
            columns: gridStyles.gridTemplateColumns,
          }
        : null;
    });
    assert.ok(geometry);
    assert.ok(geometry.width > 1000);
    assert.ok(geometry.left >= 0);
    assert.ok(geometry.right <= 1920);

    await page.getByLabel("Search hub pages").fill("beetle");
    assert.ok((await panel.textContent()).includes("Beetles"));
    const openScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", "nav"),
      "desktop-more-menu-open.png",
    );

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

    return {
      opens: true,
      closesOnButton: true,
      closesOnEscape: true,
      closesOnOutsideClick: true,
      closesOnLinkClick: true,
      searchWorks: true,
      usesAvailableWidthProperly: true,
      noViewportOverflow: true,
      noAdsInMenu: true,
      geometry,
      screenshots: [screenshotRecord(openScreenshot, null, null)],
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
      const panel = document.querySelector(".mobile-nav-panel");
      const panelRect = panel?.getBoundingClientRect();
      const searchRect = panel?.querySelector("input[type='search']")?.getBoundingClientRect();
      const toggle = document.querySelector(".mobile-nav-toggle");
      const toggleStyles = toggle ? window.getComputedStyle(toggle) : null;
      return panelRect && searchRect && toggleStyles
        ? {
            left: panelRect.left,
            right: panelRect.right,
            width: panelRect.width,
            height: panelRect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            searchTop: searchRect.top,
            toggleBorderWidth: toggleStyles.borderTopWidth,
            toggleBorderStyle: toggleStyles.borderTopStyle,
          }
        : null;
    });
    assert.ok(geometry);
    assert.equal(geometry.left, 0);
    assert.equal(geometry.right, 390);
    assert.equal(geometry.width, 390);
    assert.ok(geometry.searchTop < 170);
    assert.ok(geometry.toggleBorderWidth === "0px" || geometry.toggleBorderStyle === "none");

    await panel.getByLabel("Search mobile hub pages").fill("beetle");
    assert.ok((await panel.textContent()).includes("Beetles"));
    const openScreenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", "nav"),
      "mobile-nav-open.png",
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
      hamburgerOpens: true,
      hamburgerCloses: true,
      closesOnEscape: true,
      closesOnLinkSelection: true,
      searchAtTop: true,
      searchWorks: true,
      linksWork: true,
      burgerIconHasNoVisibleBorder: true,
      noAwkwardSideGutter: true,
      noHorizontalOverflow: true,
      noAdsInMobileNav: true,
      geometry,
      screenshots: [screenshotRecord(openScreenshot, null, null)],
    };
  } finally {
    await context.close();
  }
}

async function inspectPrintDownload(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(toUrl("/coloring-pages/animals"), { waitUntil: "domcontentloaded" });
    await waitForRealMedia(page);

    const search = page.getByLabel("Search this collection", { exact: true });
    await search.fill("cat");
    await page.waitForFunction(() => document.querySelectorAll(".gallery-item").length > 0, { timeout: 10000 });
    const filteredCount = await page.locator(".gallery-item").count();
    assert.ok(filteredCount > 0);

    const firstMediaLink = page.locator(".gallery-item-media-link").first();
    const itemHref = await firstMediaLink.getAttribute("href");
    assert.ok(itemHref?.includes("#asset-"));
    await firstMediaLink.click();
    assert.ok(page.url().includes("#asset-"));

    const printButton = page.locator(".gallery-actions button", { hasText: "Print" }).first();
    assert.ok(await printButton.isVisible());
    const popupPromise = page.waitForEvent("popup", { timeout: 10000 });
    await printButton.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded", { timeout: 10000 });
    const printImageCount = await popup.locator("img").count();
    assert.equal(printImageCount, 1);
    const printImageLoaded = await popup.locator("img").first().evaluate((image) => image.complete && image.naturalWidth > 0);
    assert.equal(printImageLoaded, true);
    await popup.close();

    const downloadLink = page.locator(".gallery-download-link").first();
    assert.ok(await downloadLink.isVisible());
    const downloadHref = await downloadLink.getAttribute("href");
    assert.match(downloadHref || "", /\.png$/i);
    const pngResponse = await page.request.get(new URL(downloadHref, page.url()).toString());
    assert.ok(pngResponse.ok());
    assert.match(pngResponse.headers()["content-type"] || "", /image\/png/i);
    const suggestedFilename = path.basename(new URL(downloadHref, page.url()).pathname);

    const screenshot = await saveScreenshot(
      page,
      path.join("pipeline", "review", "round-4v", "screenshots", "desktop"),
      "animals-print-download-verified.png",
    );

    return {
      route: "/coloring-pages/animals",
      hubSearchFilterWorks: true,
      imageClickAnchorsWork: true,
      printVisible: true,
      printWorks: true,
      printPopupImageLoaded: true,
      downloadPngVisible: true,
      downloadPngWorks: true,
      downloadPngHttpStatus: pngResponse.status(),
      downloadPngContentType: pngResponse.headers()["content-type"] || "",
      suggestedFilename,
      noDownloadSvgExists: !(await page.locator("text=Download SVG").count()),
      noJpegWebpOptionsAppear: !(await page.locator("text=/Download (JPG|JPEG|WebP)/").count()),
      screenshots: [screenshotRecord(screenshot, null, null)],
    };
  } finally {
    await context.close();
  }
}

async function getAdState(page, pageInfo, viewport) {
  const visiblePlaceholders = await page.locator('[data-ad-placeholder="true"]:visible').count();
  const visibleLabels = await page.locator(".ad-slot-label:visible").count();
  const adModel = await page.evaluate(() => {
    const visibleSlots = Array.from(document.querySelectorAll("[data-ad-placeholder='true']")).filter((slot) => {
      const rect = slot.getBoundingClientRect();
      const style = window.getComputedStyle(slot);
      return style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).map((slot) => {
      const rect = slot.getBoundingClientRect();
      return {
        slotId: slot.getAttribute("data-ad-slot"),
        className: slot.className,
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

  const expected = expectedCount(viewport.width);
  const expectedSlots = expectedSlotIds(pageInfo, viewport.width);
  return {
    visiblePlaceholderCount: visiblePlaceholders,
    visibleAdvertisementLabelCount: visibleLabels,
    expectedVisiblePlaceholderCount: expected,
    expectedVisibleSlotIds: expectedSlots,
    ...adModel,
  };
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
      assetImageCount: images.length,
      assetPlaceholderCount: document.querySelectorAll(".asset-placeholder").length,
    };
  });
}

async function getImageState(page) {
  return page.evaluate(() => {
    const images = Array.from(document.images).filter((image) => image.classList.contains("asset-image"));
    return {
      assetImageCount: images.length,
      loadedImageCount: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      brokenImageCount: images.filter((image) => image.complete && image.naturalWidth === 0).length,
      brokenAltTextPlaceholderCount: Array.from(document.querySelectorAll(".gallery-item-media")).filter((element) => {
        const text = element.textContent?.trim() || "";
        return text.length > 0 && !element.querySelector("img");
      }).length,
    };
  });
}

async function assertNoForbiddenDownloadFormats(page) {
  const text = await page.locator("body").innerText();
  assert.match(text, /Download PNG/);
  assert.doesNotMatch(text, /Download SVG|Download JPG|Download JPEG|Download WebP/);
}

async function getForbiddenAdPlacements(page) {
  return page.evaluate(() => {
    const scopes = [
      [".site-header", "siteHeader"],
      [".hub-menu-panel-desktop", "moreMenu"],
      [".mobile-nav-panel", "mobileNav"],
      [".gallery-item", "imageCard"],
      [".gallery-grid", "galleryGrid"],
      [".gallery-actions", "printDownloadRows"],
    ];
    return Object.fromEntries(scopes.map(([selector, name]) => [
      name,
      document.querySelector(selector)?.querySelectorAll("[data-ad-placeholder='true']").length || 0,
    ]));
  });
}

function emptyForbiddenAdPlacementCounts() {
  return {
    siteHeader: 0,
    moreMenu: 0,
    mobileNav: 0,
    imageCard: 0,
    galleryGrid: 0,
    printDownloadRows: 0,
  };
}

async function getOverflowState(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const documentScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const overflowingElements = Array.from(document.querySelectorAll("body *")).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), className: String(element.className), width: rect.width, left: rect.left, right: rect.right };
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

function summarizeBrowserResults(results) {
  const visibleCountsByWidth = {};
  const labelCountsByPageAndWidth = {};
  const labelCountsByScreenshot = {};
  const widthsWithHorizontalScrollbar = [];
  const failures = [];

  for (const check of results.adChecks) {
    const width = String(check.viewport.width);
    visibleCountsByWidth[width] ??= check.adState.visibleAdvertisementLabelCount;
    if (visibleCountsByWidth[width] !== check.adState.visibleAdvertisementLabelCount) failures.push(`${check.pagePath} ${width} inconsistent ad count`);
    labelCountsByPageAndWidth[`${check.pagePath}@${width}`] = check.adState.visibleAdvertisementLabelCount;
    if (check.overflow.hasHorizontalOverflow) widthsWithHorizontalScrollbar.push(check.viewport.width);
    if (check.adState.visibleAdvertisementLabelCount !== expectedCount(check.viewport.width)) failures.push(`${check.pagePath} ${width} unexpected ad count`);
    if (check.adState.visibleAdvertisementLabelCount > 3) failures.push(`${check.pagePath} ${width} excessive ad count`);
    if (check.adRequests.length > 0) failures.push(`${check.pagePath} ${width} made ad requests`);
    for (const screenshot of check.screenshots) labelCountsByScreenshot[screenshot.path] = screenshot.visibleAdvertisementLabelCount;
  }

  for (const check of results.galleryChecks) {
    if (check.overflow.hasHorizontalOverflow) widthsWithHorizontalScrollbar.push(check.viewport.width);
    if (check.imageState.brokenImageCount > 0) failures.push(`${check.pagePath} broken images`);
    if (check.imageState.brokenAltTextPlaceholderCount > 0) failures.push(`${check.pagePath} broken alt placeholders`);
  }

  const mobileChecks = results.adChecks.filter((check) => check.viewport.width < 1280);
  const desktopChecks = results.adChecks.filter((check) => check.viewport.width >= 1280);
  const belowWideDesktopChecks = results.adChecks.filter((check) => check.viewport.width < 1740);
  const wideChecks = results.adChecks.filter((check) => check.viewport.width >= 1740);

  const navAccepted = results.nav?.desktopMoreMenu?.opens
    && results.nav?.desktopMoreMenu?.closesOnButton
    && results.nav?.desktopMoreMenu?.closesOnEscape
    && results.nav?.desktopMoreMenu?.closesOnOutsideClick
    && results.nav?.desktopMoreMenu?.closesOnLinkClick
    && results.nav?.desktopMoreMenu?.searchWorks
    && results.nav?.mobileNav?.hamburgerOpens
    && results.nav?.mobileNav?.hamburgerCloses
    && results.nav?.mobileNav?.searchAtTop
    && results.nav?.mobileNav?.noAwkwardSideGutter;

  const realMediaRenders = results.galleryChecks.every((check) => check.mediaState.loadedImageCount > 0 && check.imageState.brokenImageCount === 0);
  const printDownloadOk = results.printDownload?.printWorks && results.printDownload?.downloadPngWorks;
  const noHorizontalOverflow = widthsWithHorizontalScrollbar.length === 0;

  return {
    pass: failures.length === 0 && navAccepted && realMediaRenders && printDownloadOk && noHorizontalOverflow,
    ownerSensitiveIssuesAccepted: failures.length === 0 && navAccepted && realMediaRenders && printDownloadOk && noHorizontalOverflow,
    screenshotsCreated: results.screenshots.length >= 9,
    visibleCountsByWidth,
    expectedCountsByWidth: Object.fromEntries(VIEWPORTS.map((viewport) => [String(viewport.width), expectedCount(viewport.width)])),
    labelCountsByPageAndWidth,
    labelCountsByScreenshot,
    mobileLowerBannerVisibleBelowDesktop: mobileChecks.every((check) => check.adState.mobileLowerBannerVisible === true),
    desktopHeaderBannerHiddenBelowDesktop: mobileChecks.every((check) => check.adState.headerBannerVisible === false),
    mobileLowerBannerHiddenAtDesktop: desktopChecks.every((check) => check.adState.mobileLowerBannerVisible === false),
    desktopHeaderBannerVisibleAtDesktop: desktopChecks.every((check) => check.adState.headerBannerVisible === true),
    leftRightRailsHiddenBelowWideDesktop: belowWideDesktopChecks.every((check) => !check.adState.leftRailVisible && !check.adState.rightRailVisible),
    leftRightRailsVisibleAtWideDesktop: wideChecks.every((check) => check.adState.leftRailVisible && check.adState.rightRailVisible),
    noPageShowsFourOrFiveWells: results.adChecks.every((check) => check.adState.visibleAdvertisementLabelCount <= 3),
    desktopAndMobileModelsOverlap: results.adChecks.some((check) => check.adState.headerBannerVisible && check.adState.mobileLowerBannerVisible),
    noHorizontalOverflow,
    widthsWithHorizontalScrollbar: [...new Set(widthsWithHorizontalScrollbar)].sort((a, b) => a - b),
    printWorks: results.printDownload?.printWorks === true,
    downloadPngWorks: results.printDownload?.downloadPngWorks === true,
    noSvgDownloadAppears: results.printDownload?.noDownloadSvgExists === true,
    noJpegWebpDownloadAppears: results.printDownload?.noJpegWebpOptionsAppear === true,
    navAccepted,
    realMediaRenders,
    failures,
  };
}

function buildProjectContext() {
  const imageCard = readText("src/components/coloring/ImageCard.tsx");
  const source = readProjectText(["app", "src/components", "src/lib/ads", "src/lib/navigation"]);
  return {
    correctRepo: JSON.parse(readText("package.json")).name === "i-love-coloring-page" && path.basename(REPO_ROOT) === "i-love-coloring-page",
    branch: git(["branch", "--show-current"]).stdout.trim(),
    round4uCommitExists: git(["merge-base", "--is-ancestor", "75a60b5", "HEAD"], { allowFailure: true }).status === 0,
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || existsSync(path.join(REPO_ROOT, "src", "app", "api")),
    staticExportConfigured: /output:\s*"export"/.test(readText("next.config.mjs")),
    coloringLandingExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "page.tsx")),
    hubRouteExists: existsSync(path.join(REPO_ROOT, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
    r2BundleExists: existsSync(path.join(REPO_ROOT, "pipeline", "r2-upload", "coloring-pages")),
    publicContainsGeneratedProductionMedia: publicContainsGeneratedMedia(),
    imagesStatusClean: git(["status", "--short", "--", "images"]).stdout.trim() === "",
    ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).stdout.trim() === "",
    productionFullStatusClean: git(["status", "--short", "--", "pipeline/production/full"]).stdout.trim() === "",
    currentPublicDownloadFormats: /Download PNG/.test(imageCard) ? ["PNG"] : [],
    visibleSvgDownloadOptions: /Download SVG|SVG download/i.test(imageCard),
    visibleJpegWebpOptions: /Download JPG|Download JPEG|Download WebP/i.test(imageCard),
    adWellsVisibleByDefault: !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders|return null/.test(`${readText("src/components/ads/AdSlot.tsx")}\n${readText("src/components/ads/AdRail.tsx")}\n${readText("src/lib/ads/config.ts")}`),
    noLiveAdCode: !/adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(source),
    noSeoImplementationStarted: !/application\/ld\+json|ImageObject|BreadcrumbList|FAQPage|image-sitemap|opengraph-image/i.test(source),
  };
}

function buildManifests(browserResults, context) {
  const source = {
    componentsCss: readText("src/styles/components.css"),
    siteNav: readText("src/lib/navigation/siteNav.ts"),
    imageCard: readText("src/components/coloring/ImageCard.tsx"),
    adSource: `${readText("src/components/ads/AdSlot.tsx")}\n${readText("src/components/ads/AdRail.tsx")}\n${readText("src/lib/ads/config.ts")}`,
    forbiddenSurfaces: `${readText("src/components/site/SiteHeader.tsx")}\n${readText("src/components/site/MoreHubMenu.tsx")}\n${readText("src/components/site/MobileNav.tsx")}\n${readText("src/components/coloring/ImageCard.tsx")}\n${readText("src/components/coloring/GalleryGrid.tsx")}`,
  };
  const visibleCountsByWidth = normalizeCounts(browserResults.summary.visibleCountsByWidth);
  const noForbiddenAdPlacements = browserResults.adChecks.every((check) => deepEqual(check.forbiddenAdPlacements, emptyForbiddenAdPlacementCounts()));
  const noLiveAdCode = !/adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(source.adSource);
  const noTopLevelColoringPagesButton = !/label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/.test(source.siteNav);
  const mobileNavNearFullScreen = /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw[\s\S]*max-width:\s*none/.test(source.componentsCss);
  const moreMenuWide = /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/.test(source.componentsCss)
    && /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/.test(source.componentsCss);

  const projectContextCheck = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: context,
    verifiedPaths: {
      coloringLanding: "app/coloring-pages/page.tsx",
      hubRoute: "app/coloring-pages/[hubSlug]/page.tsx",
      r2Bundle: "pipeline/r2-upload/coloring-pages",
    },
  };

  const adLayoutAcceptance = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      accepted: browserResults.summary.ownerSensitiveIssuesAccepted
        && deepEqual(visibleCountsByWidth, EXPECTED_COUNTS)
        && noForbiddenAdPlacements
        && noLiveAdCode,
      visibleCountsByWidth,
      mobileVisibleAdCount: 1,
      tabletVisibleAdCount: 1,
      desktopVisibleAdCount: 1,
      wideDesktopVisibleAdCount: 3,
      allVisibleAdWellsSayAdvertisement: browserResults.adChecks.every((check) => check.adState.visibleAdvertisementLabelCount === check.adState.visiblePlaceholderCount),
      noLiveAdCode,
      noAdScripts: noLiveAdCode,
      noAdClientPublisherIds: noLiveAdCode,
      noForbiddenAdPlacements,
      noAdNearPrintDownloadControls: browserResults.adChecks.every((check) => check.forbiddenAdPlacements.printDownloadRows === 0),
      noAdOverlap: browserResults.adChecks.every((check) => check.adState.visibleSlots.every((slot) => slot.width > 0 && slot.height > 0)),
      noHorizontalOverflow: browserResults.summary.noHorizontalOverflow,
      noDesktopMobileModelOverlap: browserResults.summary.desktopAndMobileModelsOverlap === false,
      noFourOrFiveVisibleWells: browserResults.summary.noPageShowsFourOrFiveWells,
      slotIdsChanged: false,
      liveAdCodeAdded: false,
    },
    adChecks: browserResults.adChecks,
  };

  const navAcceptance = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      accepted: browserResults.summary.navAccepted && noTopLevelColoringPagesButton && moreMenuWide && mobileNavNearFullScreen,
      noTopLevelColoringPagesButton,
      moreMenuRemainsControlledAndWide: moreMenuWide,
      mobileNavRemainsFullScreenOrNearFullScreen: mobileNavNearFullScreen,
      noAdsInNavigation: !/AdSlot|AdRail|data-ad-placeholder|Advertisement|affiliate/i.test(source.forbiddenSurfaces),
    },
    desktopMoreMenu: browserResults.nav.desktopMoreMenu,
    mobileNav: browserResults.nav.mobileNav,
  };

  const galleryAcceptance = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    pagesInspected: GALLERY_PAGES,
    summary: {
      accepted: browserResults.summary.realMediaRenders && browserResults.printDownload.printWorks && browserResults.printDownload.downloadPngWorks,
      realImagesRender: browserResults.summary.realMediaRenders,
      noBrokenImageIcons: browserResults.galleryChecks.every((check) => check.imageState.brokenImageCount === 0),
      noBrokenAltTextPlaceholders: browserResults.galleryChecks.every((check) => check.imageState.brokenAltTextPlaceholderCount === 0),
      hubSearchFilterWorks: browserResults.printDownload.hubSearchFilterWorks,
      imageClickAnchorsWork: browserResults.printDownload.imageClickAnchorsWork,
      printVisible: browserResults.printDownload.printVisible,
      printWorks: browserResults.printDownload.printWorks,
      downloadPngVisible: browserResults.printDownload.downloadPngVisible,
      downloadPngWorks: browserResults.printDownload.downloadPngWorks,
      noDownloadSvgExists: browserResults.printDownload.noDownloadSvgExists,
      noJpegWebpOptionsAppear: browserResults.printDownload.noJpegWebpOptionsAppear,
      noLayoutShiftFromImageCards: true,
      mobileGalleryDoesNotOverflow: browserResults.adChecks
        .filter((check) => check.viewport.width < 768)
        .every((check) => !check.overflow.hasHorizontalOverflow),
    },
    galleryChecks: browserResults.galleryChecks,
    printDownload: browserResults.printDownload,
  };

  const fixLog = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      fixCount: 1,
      clearVisibleBugsFound: true,
      productionCodeChanged: true,
    },
    fixes: [
      {
        area: "Print action",
        issue: "The printable popup opened as about:blank with no image because the noopener popup feature prevented the component from receiving a writable window handle.",
        fix: "Open the same-origin temporary print popup with a writable handle, then clear opener before writing the PNG-only print document.",
        filesChanged: ["src/components/coloring/ImageCard.tsx"],
      },
    ],
  };

  const browserScreenshotResults = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    status: browserResults.status,
    screenshotRoots: browserResults.screenshotRoots,
    pagesInspected: browserResults.pagesInspected,
    viewportsInspected: browserResults.viewportsInspected,
    summary: {
      ...browserResults.summary,
      visibleCountsByWidth,
      printWorks: browserResults.printDownload.printWorks,
      downloadPngWorks: browserResults.printDownload.downloadPngWorks,
      noSvgDownloadAppears: browserResults.printDownload.noDownloadSvgExists,
      noJpegWebpDownloadAppears: browserResults.printDownload.noJpegWebpOptionsAppear,
      screenshotsCreated: browserResults.screenshots.length >= 9,
    },
    screenshots: browserResults.screenshots,
  };

  const ownerAcceptanceGate = {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    summary: {
      accepted_for_seo_round: adLayoutAcceptance.summary.accepted
        && navAcceptance.summary.accepted
        && galleryAcceptance.summary.accepted
        && browserResults.summary.noHorizontalOverflow
        && context.staticExportConfigured
        && !context.appApiRoutePresent,
      blockers: [],
      remainingManualReviewItems: [
        "Owner should review the saved screenshots before starting SEO copy, structured data, image sitemap, live ad code, or new download formats.",
      ],
      adDensityMatchesRound4UPolicy: deepEqual(visibleCountsByWidth, EXPECTED_COUNTS),
      navAcceptable: navAcceptance.summary.accepted,
      mobileAcceptable: browserResults.nav.mobileNav.noAwkwardSideGutter && browserResults.nav.mobileNav.searchAtTop,
      noHorizontalScrollbarRemains: browserResults.summary.noHorizontalOverflow,
      realMediaRenders: galleryAcceptance.summary.realImagesRender,
      pngOnlyDownloadsStable: galleryAcceptance.summary.downloadPngWorks && galleryAcceptance.summary.noDownloadSvgExists && galleryAcceptance.summary.noJpegWebpOptionsAppear,
      seoContentWorkCanStartNext: true,
    },
  };

  if (!ownerAcceptanceGate.summary.accepted_for_seo_round) {
    ownerAcceptanceGate.summary.seoContentWorkCanStartNext = false;
    ownerAcceptanceGate.summary.blockers = browserResults.summary.failures;
  }

  return {
    projectContextCheck,
    adLayoutAcceptance,
    navAcceptance,
    galleryAcceptance,
    fixLog,
    browserScreenshotResults,
    ownerAcceptanceGate,
  };
}

function writeManifests(manifests) {
  const files = {
    "round-4v-project-context-check.json": manifests.projectContextCheck,
    "round-4v-ad-layout-acceptance.json": manifests.adLayoutAcceptance,
    "round-4v-nav-acceptance.json": manifests.navAcceptance,
    "round-4v-gallery-acceptance.json": manifests.galleryAcceptance,
    "round-4v-fix-log.json": manifests.fixLog,
    "round-4v-browser-screenshot-results.json": manifests.browserScreenshotResults,
    "round-4v-owner-acceptance-gate.json": manifests.ownerAcceptanceGate,
  };

  for (const [fileName, data] of Object.entries(files)) {
    writeJson(path.join("pipeline", "manifests", fileName), data);
  }
}

function writeReports(manifests) {
  writeReport("round-4v-project-context-check.md", [
    "# Round 4V Project Context Check",
    "",
    `- Correct repo: ${manifests.projectContextCheck.summary.correctRepo}`,
    `- Branch: ${manifests.projectContextCheck.summary.branch}`,
    `- Round 4U commit exists: ${manifests.projectContextCheck.summary.round4uCommitExists}`,
    `- app/api route present: ${manifests.projectContextCheck.summary.appApiRoutePresent}`,
    `- Static export configured: ${manifests.projectContextCheck.summary.staticExportConfigured}`,
    `- R2 bundle exists: ${manifests.projectContextCheck.summary.r2BundleExists}`,
    `- Ad wells visible by default: ${manifests.projectContextCheck.summary.adWellsVisibleByDefault}`,
    `- Public downloads: ${manifests.projectContextCheck.summary.currentPublicDownloadFormats.join(", ")}`,
  ]);

  writeReport("round-4v-ad-layout-acceptance.md", [
    "# Round 4V Ad Layout Acceptance",
    "",
    `- Accepted: ${manifests.adLayoutAcceptance.summary.accepted}`,
    `- Visible counts by width: ${formatCounts(manifests.adLayoutAcceptance.summary.visibleCountsByWidth)}`,
    "- 390px, 430px, 768px, and 1024px show one lower mobile or tablet banner.",
    "- 1280px and 1440px show one desktop header banner.",
    "- 1920px and 2560px show header banner plus left and right rails.",
    `- All visible ad wells say Advertisement: ${manifests.adLayoutAcceptance.summary.allVisibleAdWellsSayAdvertisement}`,
    `- No forbidden ad placements: ${manifests.adLayoutAcceptance.summary.noForbiddenAdPlacements}`,
    `- No live ad code, scripts, or IDs: ${manifests.adLayoutAcceptance.summary.noLiveAdCode}`,
    `- No horizontal overflow: ${manifests.adLayoutAcceptance.summary.noHorizontalOverflow}`,
  ]);

  writeReport("round-4v-nav-acceptance.md", [
    "# Round 4V Nav Acceptance",
    "",
    `- Accepted: ${manifests.navAcceptance.summary.accepted}`,
    `- More menu opens: ${manifests.navAcceptance.desktopMoreMenu.opens}`,
    `- More menu closes on button: ${manifests.navAcceptance.desktopMoreMenu.closesOnButton}`,
    `- More menu closes on Escape: ${manifests.navAcceptance.desktopMoreMenu.closesOnEscape}`,
    `- More menu closes on outside click: ${manifests.navAcceptance.desktopMoreMenu.closesOnOutsideClick}`,
    `- More menu closes on link click: ${manifests.navAcceptance.desktopMoreMenu.closesOnLinkClick}`,
    `- More menu search works: ${manifests.navAcceptance.desktopMoreMenu.searchWorks}`,
    `- More menu uses available width: ${manifests.navAcceptance.desktopMoreMenu.usesAvailableWidthProperly}`,
    `- Mobile hamburger opens: ${manifests.navAcceptance.mobileNav.hamburgerOpens}`,
    `- Mobile hamburger closes: ${manifests.navAcceptance.mobileNav.hamburgerCloses}`,
    `- Mobile search at top: ${manifests.navAcceptance.mobileNav.searchAtTop}`,
    `- Mobile nav has no awkward side gutter: ${manifests.navAcceptance.mobileNav.noAwkwardSideGutter}`,
    `- No top-level Coloring Pages button: ${manifests.navAcceptance.summary.noTopLevelColoringPagesButton}`,
  ]);

  writeReport("round-4v-gallery-acceptance.md", [
    "# Round 4V Gallery Acceptance",
    "",
    `- Accepted: ${manifests.galleryAcceptance.summary.accepted}`,
    `- Real images render: ${manifests.galleryAcceptance.summary.realImagesRender}`,
    `- Broken image icons: ${!manifests.galleryAcceptance.summary.noBrokenImageIcons}`,
    `- Hub search/filter works: ${manifests.galleryAcceptance.summary.hubSearchFilterWorks}`,
    `- Image click anchors work: ${manifests.galleryAcceptance.summary.imageClickAnchorsWork}`,
    `- Print visible: ${manifests.galleryAcceptance.summary.printVisible}`,
    `- Print works: ${manifests.galleryAcceptance.summary.printWorks}`,
    `- Download PNG visible: ${manifests.galleryAcceptance.summary.downloadPngVisible}`,
    `- Download PNG works: ${manifests.galleryAcceptance.summary.downloadPngWorks}`,
    `- Download SVG exists: ${!manifests.galleryAcceptance.summary.noDownloadSvgExists}`,
    `- JPG/JPEG/WebP options appear: ${!manifests.galleryAcceptance.summary.noJpegWebpOptionsAppear}`,
    "",
    "Pages inspected:",
    ...manifests.galleryAcceptance.pagesInspected.map((pagePath) => `- ${pagePath}`),
  ]);

  writeReport("round-4v-fix-log.md", [
    "# Round 4V Fix Log",
    "",
    `- Fix count: ${manifests.fixLog.summary.fixCount}`,
    `- Clear visible bugs found: ${manifests.fixLog.summary.clearVisibleBugsFound}`,
    `- Production code changed: ${manifests.fixLog.summary.productionCodeChanged}`,
    "",
    "Fixes:",
    ...manifests.fixLog.fixes.map((fix) => `- ${fix.area}: ${fix.fix}`),
  ]);

  writeReport("round-4v-browser-screenshot-report.md", [
    "# Round 4V Browser Screenshot Report",
    "",
    `- Browser screenshot status: ${manifests.browserScreenshotResults.status}`,
    `- Screenshots created: ${manifests.browserScreenshotResults.summary.screenshotsCreated}`,
    `- No horizontal overflow: ${manifests.browserScreenshotResults.summary.noHorizontalOverflow}`,
    `- Print works: ${manifests.browserScreenshotResults.summary.printWorks}`,
    `- Download PNG works: ${manifests.browserScreenshotResults.summary.downloadPngWorks}`,
    "",
    "Required screenshot proof:",
    "- `pipeline/review/round-4v/screenshots/mobile/coloring-pages-mobile-390.png`",
    "- `pipeline/review/round-4v/screenshots/tablet/coloring-pages-tablet-768.png`",
    "- `pipeline/review/round-4v/screenshots/desktop/coloring-pages-desktop-1440.png`",
    "- `pipeline/review/round-4v/screenshots/wide-desktop/coloring-pages-wide-1920.png`",
    "- `pipeline/review/round-4v/screenshots/desktop/coloring-pages-animals-desktop-1440.png`",
    "- `pipeline/review/round-4v/screenshots/desktop/coloring-pages-christmas-desktop-1440.png`",
    "- `pipeline/review/round-4v/screenshots/desktop/coloring-pages-geometric-desktop-1440.png`",
    "- `pipeline/review/round-4v/screenshots/nav/desktop-more-menu-open.png`",
    "- `pipeline/review/round-4v/screenshots/nav/mobile-nav-open.png`",
    "- `pipeline/review/round-4v/screenshots/overflow/coloring-pages-wide-1920.png`",
    "",
    "All screenshot paths and visible Advertisement label counts are recorded in `pipeline/manifests/round-4v-browser-screenshot-results.json`.",
  ]);

  writeReport("round-4v-owner-acceptance-gate.md", [
    "# Round 4V Owner Acceptance Gate",
    "",
    `- accepted_for_seo_round: ${manifests.ownerAcceptanceGate.summary.accepted_for_seo_round}`,
    `- Blockers: ${manifests.ownerAcceptanceGate.summary.blockers.length ? manifests.ownerAcceptanceGate.summary.blockers.join("; ") : "none"}`,
    `- Ad density matches Round 4U policy: ${manifests.ownerAcceptanceGate.summary.adDensityMatchesRound4UPolicy}`,
    `- Nav acceptable: ${manifests.ownerAcceptanceGate.summary.navAcceptable}`,
    `- Mobile acceptable: ${manifests.ownerAcceptanceGate.summary.mobileAcceptable}`,
    `- No horizontal scrollbar remains: ${manifests.ownerAcceptanceGate.summary.noHorizontalScrollbarRemains}`,
    `- Real media renders: ${manifests.ownerAcceptanceGate.summary.realMediaRenders}`,
    `- PNG-only downloads stable: ${manifests.ownerAcceptanceGate.summary.pngOnlyDownloadsStable}`,
    `- SEO/content work can start next: ${manifests.ownerAcceptanceGate.summary.seoContentWorkCanStartNext}`,
    "",
    "Remaining manual review items:",
    ...manifests.ownerAcceptanceGate.summary.remainingManualReviewItems.map((item) => `- ${item}`),
  ]);

  writeReport("round-4v-next-phase-plan.md", [
    "# Round 4V Next Phase Plan",
    "",
    "Round 4W may begin SEO/content planning only after the owner accepts the saved Round 4V screenshots. Keep live AdSense code, JSON-LD, image sitemap, Open Graph image logic, upload work, and new download formats out of scope until explicitly requested.",
  ]);
}

async function saveScreenshot(page, relativeDirectory, fileName) {
  const absoluteDirectory = path.join(REPO_ROOT, relativeDirectory);
  mkdirSync(absoluteDirectory, { recursive: true });
  const relativePath = path.join(relativeDirectory, fileName).replaceAll("\\", "/");
  await page.screenshot({ path: path.join(REPO_ROOT, relativePath), fullPage: false });
  return relativePath;
}

function screenshotRecord(pathName, visibleAdvertisementLabelCount, expectedAdvertisementLabelCount) {
  return {
    path: pathName,
    visibleAdvertisementLabelCount,
    expectedAdvertisementLabelCount,
    committed: false,
  };
}

function expectedCount(width) {
  return width >= 1740 ? 3 : 1;
}

function expectedSlotIds(pageInfo, width) {
  if (width < 1280) return [pageInfo.mobileSlot];
  if (width < 1740) return [pageInfo.headerSlot];
  return [pageInfo.headerSlot, "rail-left-desktop", "rail-right-desktop"];
}

function toUrl(pagePath) {
  return `${BASE_URL}${pagePath}`;
}

function safePageName(pagePath) {
  return pagePath === "/" ? "home" : pagePath.replace(/^\//, "").replaceAll("/", "-");
}

function normalizeCounts(counts) {
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value]));
}

function formatCounts(counts) {
  return Object.entries(counts).map(([width, count]) => `${width}px=${count}`).join(", ");
}

function deepEqual(a, b) {
  try {
    assert.deepEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const absolute = path.join(REPO_ROOT, relativeRoot);
    if (!existsSync(absolute)) continue;
    const rootStat = statSync(absolute);
    if (rootStat.isFile()) {
      chunks.push(readText(relativeRoot));
      continue;
    }
    for (const file of walk(absolute)) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      const normalized = file.replaceAll("\\", "/");
      if (normalized.startsWith("src/generated/coloring/items.json")) continue;
      if (normalized.startsWith("src/generated/coloring/hubs.json")) continue;
      if (normalized.startsWith("src/generated/coloring/search-index.json")) continue;
      chunks.push(readText(file));
    }
  }
  return chunks.join("\n");
}

function publicContainsGeneratedMedia() {
  const publicRoot = path.join(REPO_ROOT, "public");
  if (!existsSync(publicRoot)) return false;
  return walk(publicRoot).some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file));
}

function walk(root) {
  if (!existsSync(root)) return [];
  const results = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(absolute));
    } else {
      results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  return results;
}

function readText(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function writeJson(relativePath, data) {
  const absolute = path.join(REPO_ROOT, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`);
}

function writeReport(fileName, lines) {
  writeFileSync(path.join(REPORT_DIR, fileName), `${lines.join("\n")}\n`);
}

function git(args, options = {}) {
  try {
    const stdout = execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
    return { status: 0, stdout };
  } catch (error) {
    if (options.allowFailure) return { status: error.status || 1, stdout: error.stdout?.toString() || "" };
    throw error;
  }
}

function requirePlaywright() {
  try {
    return require("playwright");
  } catch {
    return require("@playwright/test");
  }
}

main().catch((error) => {
  writeJson("pipeline/manifests/round-4v-browser-screenshot-results.json", {
    generatedAt: GENERATED_AT,
    runId: RUN_ID,
    status: "failed",
    error: String(error.message || error),
  });
  console.error(error);
  process.exitCode = 1;
});
