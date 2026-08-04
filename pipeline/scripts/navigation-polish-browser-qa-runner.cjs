#!/usr/bin/env node

const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = process.cwd();
const APP_URL = (process.env.NAV_POLISH_APP_URL || "http://127.0.0.1:3005").replace(/\/$/, "");
const SCREENSHOT_DIR = path.join(ROOT, "pipeline", "review", "navigation-polish", "after");
const ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/christmas",
  "/printables/animals/animals-alligator-4feec8505a",
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];
const BROWSERS = [
  { id: "chrome", type: chromium, options: { channel: "chrome" }, chromiumBased: true },
  { id: "edge", type: chromium, options: { channel: "msedge" }, chromiumBased: true },
  { id: "playwright-chromium", type: chromium, options: {}, chromiumBased: true },
  { id: "playwright-firefox", type: firefox, options: {}, chromiumBased: false },
  { id: "playwright-webkit", type: webkit, options: {}, chromiumBased: false },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const results = { appUrl: APP_URL, routes: ROUTES, viewports: VIEWPORTS.map(({ width }) => width), browsers: [], screenshots: [], checks: {} };

  for (const specification of BROWSERS) {
    let browser;
    try {
      browser = await specification.type.launch({ headless: true, ...specification.options });
    } catch (error) {
      results.browsers.push({ id: specification.id, available: false, reason: firstLine(error) });
      continue;
    }

    try {
      const browserResult = await runBrowserMatrix(browser, specification);
      results.browsers.push({ id: specification.id, available: true, version: browser.version(), ...browserResult });
      if (specification.id === "chrome") {
        const interactionResult = await runInteractionQa(browser, results.screenshots);
        results.checks = interactionResult;
      }
    } finally {
      await browser.close();
    }
  }

  const available = results.browsers.filter((entry) => entry.available);
  const matrixPassed = available.length > 0 && available.every((entry) => entry.failures.length === 0);
  const interactionPassed = Object.values(results.checks).every((value) => value === true);
  results.summary = {
    availableBrowsers: available.map((entry) => entry.id),
    unavailableBrowsers: results.browsers.filter((entry) => !entry.available).map((entry) => entry.id),
    matrixPassed,
    interactionPassed,
    browserQaPassed: matrixPassed && interactionPassed,
  };

  console.log(JSON.stringify(results, null, 2));
  if (!results.summary.browserQaPassed) process.exitCode = 1;
}

async function runBrowserMatrix(browser, specification) {
  const context = await browser.newContext();
  const failures = [];
  let pageCount = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(`${APP_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await page.waitForTimeout(80);
          const metrics = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            adSlots: document.querySelectorAll("[data-ad-slot]").length,
            headerHeight: document.querySelector(".site-header")?.getBoundingClientRect().height || 0,
            hasMain: Boolean(document.querySelector("main")),
          }));
          pageCount += 1;
          if (!response || response.status() !== 200) failures.push(`${route}@${viewport.width}: HTTP ${response?.status() || 0}`);
          if (!metrics.hasMain) failures.push(`${route}@${viewport.width}: missing main`);
          if (metrics.overflow) failures.push(`${route}@${viewport.width}: horizontal overflow`);
          if (metrics.headerHeight > 64) failures.push(`${route}@${viewport.width}: header height ${metrics.headerHeight}`);
          if (metrics.adSlots !== 0) failures.push(`${route}@${viewport.width}: unexpected ad DOM ${metrics.adSlots}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { chromiumBased: specification.chromiumBased, pageCount, failures };
}

async function runInteractionQa(browser, screenshots) {
  const checks = {};
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const triggerMetrics = await page.evaluate(() => {
      const read = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          appearance: style.appearance,
          background: style.backgroundColor,
          borderWidth: style.borderWidth,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          padding: style.padding,
          height: rect.height,
          alignItems: style.alignItems,
        };
      };
      return {
        normal: read(document.querySelector('.site-nav-link[href="/coloring-pages"]')),
        triggers: [...document.querySelectorAll(".header-disclosure-trigger")].map(read),
        svgCount: document.querySelectorAll(".header-disclosure-trigger .disclosure-chevron").length,
        glyphPresent: [...document.querySelectorAll(".header-disclosure-trigger")].some((element) => element.textContent.includes("⌄")),
      };
    });
    checks.triggerAppearanceReset = triggerMetrics.triggers.every((item) => item.appearance === "none");
    checks.triggerRestingSurface = triggerMetrics.triggers.every((item) => item.background === "rgba(0, 0, 0, 0)" && item.borderWidth === "0px");
    checks.triggerTypographyAligned = triggerMetrics.triggers.every((item) => item.fontFamily === triggerMetrics.normal.fontFamily && item.fontSize === triggerMetrics.normal.fontSize && item.fontWeight === triggerMetrics.normal.fontWeight && item.lineHeight === triggerMetrics.normal.lineHeight);
    checks.triggerMetricsAligned = triggerMetrics.triggers.every((item) => item.height === triggerMetrics.normal.height && item.padding === triggerMetrics.normal.padding && item.alignItems === "center");
    checks.svgChevronOnly = triggerMetrics.svgCount === 2 && !triggerMetrics.glyphPresent;

    await screenshot(page, "chrome-1440-navigation-resting.png", screenshots);
    const categories = page.getByRole("button", { name: "Categories", exact: true });
    const seasonal = page.getByRole("button", { name: "Seasonal", exact: true });
    const search = page.getByRole("button", { name: "Search", exact: true });
    await categories.hover();
    await page.waitForTimeout(200);
    await screenshot(page, "chrome-1440-navigation-hover.png", screenshots);

    for (let index = 0; index < 8 && (await page.evaluate(() => document.activeElement?.textContent?.trim())) !== "Categories"; index += 1) {
      await page.keyboard.press("Tab");
    }
    checks.keyboardFocusReachedTrigger = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Categories");
    const focusStyle = await categories.evaluate((element) => ({ outline: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }));
    checks.keyboardFocusVisible = focusStyle.outline === "solid" && focusStyle.width === "3px";
    await screenshot(page, "chrome-1440-navigation-focus.png", screenshots);

    await categories.press("Enter");
    await page.locator(".category-browser").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    checks.enterOpens = (await categories.getAttribute("aria-expanded")) === "true";
    const expandedState = await categories.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      chevronTransform: getComputedStyle(element.querySelector(".disclosure-chevron")).transform,
    }));
    checks.expandedStateDeliberate = expandedState.background === "rgb(238, 229, 241)" && expandedState.color === "rgb(109, 59, 115)" && expandedState.chevronTransform !== "none";
    const gridAlignment = await page.evaluate(() => ({
      headerLeft: document.querySelector(".site-header-inner").getBoundingClientRect().left,
      panelLeft: document.querySelector(".category-browser").getBoundingClientRect().left,
    }));
    checks.panelAlignedToHeaderGrid = Math.abs(gridAlignment.headerLeft - gridAlignment.panelLeft) < 1;
    const headerHeightBefore = await page.locator(".site-header").evaluate((element) => element.getBoundingClientRect().height);
    await screenshot(page, "chrome-1440-categories-expanded.png", screenshots);
    await page.keyboard.press("Tab");
    checks.tabEntersPanel = await page.evaluate(() => document.activeElement?.getAttribute("href") === "/coloring-pages/animals");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('.header-disclosure-trigger[aria-controls]')?.getAttribute("aria-expanded") === "false" && document.activeElement?.textContent?.trim() === "Categories");
    checks.escapeClosesAndRestores = (await categories.getAttribute("aria-expanded")) === "false" && await page.evaluate(() => document.activeElement?.textContent?.trim() === "Categories");

    await categories.press("Space");
    checks.spaceOpens = (await categories.getAttribute("aria-expanded")) === "true";
    await seasonal.click();
    checks.onlyOneDisclosureOpen = await page.locator(".header-disclosure-panel").count() === 1 && (await categories.getAttribute("aria-expanded")) === "false" && (await seasonal.getAttribute("aria-expanded")) === "true";
    await page.waitForTimeout(200);
    await screenshot(page, "chrome-1440-seasonal-expanded.png", screenshots);
    await page.getByRole("heading", { level: 1, name: "I Love Coloring Page" }).click();
    checks.outsidePointerCloses = await page.locator(".header-disclosure-panel").count() === 0;

    await categories.click();
    await search.click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    checks.searchClosesDisclosures = await page.locator(".header-disclosure-panel").count() === 0 && await page.getByRole("dialog").count() === 1;
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => !document.querySelector("[inert]") && getComputedStyle(document.body).overflow !== "hidden" && document.activeElement?.textContent?.trim() === "Search");
    checks.searchEscapeRestores = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Search");
    checks.searchReleasesPage = await page.evaluate(() => !document.querySelector("[inert]") && getComputedStyle(document.body).overflow !== "hidden");
    const headerHeightAfter = await page.locator(".site-header").evaluate((element) => element.getBoundingClientRect().height);
    checks.noHeaderLayoutShift = headerHeightBefore === headerHeightAfter;

    await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    const animals = page.locator('.category-browser a[href="/coloring-pages/animals"]');
    await Promise.all([page.waitForURL(`${APP_URL}/coloring-pages/animals`), animals.click()]);
    checks.routeChangeCloses = await page.locator(".header-disclosure-panel").count() === 0;

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`${APP_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded" });
    const categoriesAt1024 = page.getByRole("button", { name: "Categories", exact: true });
    const currentState = await categoriesAt1024.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
    checks.currentRouteStateDeliberate = currentState.background === "rgb(238, 229, 241)" && currentState.color === "rgb(109, 59, 115)";
    await categoriesAt1024.click();
    const panelRect = await page.locator(".category-browser").evaluate((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, overflow: element.scrollWidth > element.clientWidth }; });
    checks.panelContainedAt1024 = panelRect.left >= 0 && panelRect.right <= 1024 && !panelRect.overflow;
    const panelHierarchy = await page.locator(".category-browser-group a").first().evaluate((element) => {
      const count = element.querySelector("strong");
      return { height: element.getBoundingClientRect().height, columns: getComputedStyle(element).gridTemplateColumns, countSize: getComputedStyle(count).fontSize, labelSize: getComputedStyle(element).fontSize };
    });
    checks.panelHierarchyPolished = panelHierarchy.height >= 44 && panelHierarchy.columns.split(" ").length === 2 && Number.parseFloat(panelHierarchy.countSize) < Number.parseFloat(panelHierarchy.labelSize);
    await screenshot(page, "chrome-1024-categories-contained.png", screenshots);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${APP_URL}/coloring-pages`, { waitUntil: "domcontentloaded" });
    checks.rootPlaceholderGrammatical = await page.locator(".gallery-search input").getAttribute("placeholder") === "Search coloring pages";
    await page.goto(`${APP_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded" });
    checks.hubPlaceholderGrammatical = await page.locator(".gallery-search input").getAttribute("placeholder") === "Search animals coloring pages";

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP_URL}/printables/animals/animals-alligator-4feec8505a`, { waitUntil: "domcontentloaded" });
    const breadcrumb = await page.evaluate(() => ({
      allItems: document.querySelectorAll(".printable-breadcrumb .breadcrumb-item").length,
      visibleItems: [...document.querySelectorAll(".printable-breadcrumb .breadcrumb-item")].filter((element) => getComputedStyle(element).display !== "none").map((element) => element.textContent.trim()),
      visibleParentLink: [...document.querySelectorAll(".printable-breadcrumb a")].find((element) => getComputedStyle(element.closest(".breadcrumb-item")).display !== "none")?.getAttribute("href"),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      ellipsis: [...document.querySelectorAll(".printable-breadcrumb a, .printable-breadcrumb [aria-current='page']")].some((element) => getComputedStyle(element).textOverflow === "ellipsis" && getComputedStyle(element.closest(".breadcrumb-item")).display !== "none"),
    }));
    checks.mobileBreadcrumbReadable = breadcrumb.allItems === 4 && breadcrumb.visibleItems.length === 2 && breadcrumb.visibleParentLink === "/coloring-pages/animals" && !breadcrumb.overflow && !breadcrumb.ellipsis;
    await page.locator(".printable-action-panel").waitFor({ state: "attached" });
    await page.waitForTimeout(300);
    const formatCounts = await page.evaluate(() => {
      const names = [...document.querySelectorAll(".printable-action-panel button")].map((element) => element.textContent.trim());
      const count = (name) => names.filter((value) => value === name).length;
      return { print: count("Print"), png: count("Download PNG"), jpg: count("Download JPG"), webp: count("Download WebP"), svg: count("Download SVG") };
    });
    checks.printDownloadsUnchanged = formatCounts.print === 1 && formatCounts.png === 1 && formatCounts.svg === 0;
    checks.optionalFormatsRemainCapabilityGated = formatCounts.jpg === formatCounts.webp && formatCounts.jpg <= 1;
    await screenshot(page, "chrome-390-printable-breadcrumb.png", screenshots);

    const mobileMenu = page.getByRole("button", { name: "Open navigation menu", exact: true });
    await mobileMenu.click();
    const summaries = page.locator(".mobile-nav-group summary");
    const summaryCount = await summaries.count();
    const firstSummary = summaries.first();
    const summaryMetrics = await firstSummary.evaluate((element) => ({ height: element.getBoundingClientRect().height }));
    await firstSummary.click();
    const mobileChevronTransform = await firstSummary.locator(".disclosure-chevron").evaluate((element) => getComputedStyle(element).transform);
    checks.mobileNavigationIntact = summaryCount === 4 && summaryMetrics.height >= 48 && mobileChevronTransform !== "none" && await page.getByRole("dialog").count() === 1;
    checks.mobileNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await screenshot(page, "chrome-390-mobile-navigation.png", screenshots);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Open navigation menu");
    checks.mobileEscapeRestores = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open navigation menu");
  } finally {
    await context.close();
  }

  const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  try {
    await reducedPage.setViewportSize({ width: 1440, height: 900 });
    await reducedPage.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
    checks.reducedMotionRemovesChevronTransition = await reducedPage.locator(".disclosure-chevron").first().evaluate((element) => getComputedStyle(element).transitionDuration === "0s");
  } finally {
    await reducedContext.close();
  }

  return checks;
}

async function screenshot(page, name, screenshots) {
  const target = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: target, fullPage: false });
  screenshots.push(path.relative(ROOT, target).replaceAll("\\", "/"));
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}
