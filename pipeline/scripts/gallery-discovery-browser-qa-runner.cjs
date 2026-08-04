#!/usr/bin/env node

const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const APP_URL = (process.env.GALLERY_DISCOVERY_APP_URL || "http://localhost:3005").replace(/\/$/, "");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "gallery-discovery", "after");
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];
const ROUTES = [
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/forget-me-not",
  "/coloring-pages/christmas",
  "/coloring-pages/animals/page/2",
  "/coloring-pages/anime-girls",
  "/printables/animals/animals-alligator-4feec8505a",
  "/printables/animals/anime-girl-cat-3794ff8eaa",
  "/printables/animals/anime-girl-dinosaur-fossil-hoodie-plushie-8dda1f7ef2",
];
const BROWSERS = [
  { id: "chrome", options: { channel: "chrome" } },
  { id: "edge", options: { channel: "msedge" } },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  await mkdir(REVIEW_DIR, { recursive: true });
  const result = { appUrl: APP_URL, browsers: [], routes: ROUTES, viewports: VIEWPORTS.map(({ width }) => width), screenshots: [] };

  for (const specification of BROWSERS) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true, ...specification.options });
    } catch (error) {
      result.browsers.push({ id: specification.id, available: false, reason: firstLine(error) });
      continue;
    }

    try {
      const matrix = await runMatrix(browser, specification.id);
      const interactions = specification.id === "chrome" ? await runInteractions(browser, result.screenshots) : null;
      result.browsers.push({ id: specification.id, available: true, version: browser.version(), matrix, interactions });
    } finally {
      await browser.close();
    }
  }

  const available = result.browsers.filter((entry) => entry.available);
  const failures = available.flatMap((entry) => [
    ...entry.matrix.failures.map((failure) => `${entry.id}: ${failure}`),
    ...Object.entries(entry.interactions?.checks || {}).filter(([, passed]) => passed !== true).map(([check]) => `${entry.id}: ${check}`),
  ]);
  result.summary = {
    availableBrowsers: available.map((entry) => entry.id),
    chromiumCoverageOnly: true,
    pageChecks: available.reduce((sum, entry) => sum + entry.matrix.pageChecks, 0),
    failures,
    passed: available.length === BROWSERS.length && failures.length === 0,
  };

  const outputPath = path.join(REVIEW_DIR, "browser-verification-results.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (!result.summary.passed) process.exitCode = 1;
}

async function runMatrix(browser, browserId) {
  const context = await browser.newContext();
  const failures = [];
  let pageChecks = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(`${APP_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
          await page.waitForTimeout(250);
          const metrics = await page.evaluate(() => {
            const gallery = document.querySelector(".gallery-explorer .gallery-grid, .paginated-gallery-section .gallery-grid");
            const cards = [...(gallery?.querySelectorAll(".gallery-item") || [])];
            const firstCard = cards[0];
            const imageLink = firstCard?.querySelector(".gallery-item-media-link");
            const titleLink = firstCard?.querySelector(".item-title-link");
            const print = firstCard?.querySelector(".gallery-print-button");
            const brokenImages = [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.offsetParent !== null).length;
            const duplicateCardIds = cards.length - new Set(cards.map((card) => card.querySelector(".gallery-item-media-link")?.getAttribute("href"))).size;
            return {
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              brokenImages,
              cards: cards.length,
              duplicateCardIds,
              columns: gallery ? getComputedStyle(gallery).gridTemplateColumns.split(" ").length : 0,
              imageHref: imageLink?.getAttribute("href") || null,
              titleHref: titleLink?.getAttribute("href") || null,
              printAvailable: Boolean(print),
              printPrimary: print?.classList.contains("button-primary") || false,
              printWidth: print?.getBoundingClientRect().width || 0,
              printHeight: print?.getBoundingClientRect().height || 0,
              cardWidth: firstCard?.getBoundingClientRect().width || 0,
              focusOrder: firstCard ? [...firstCard.querySelectorAll("a, button")].map((control) => control.matches(".gallery-item-media-link") ? "image" : control.matches(".item-title-link") ? "title" : control.textContent.trim()) : [],
              adInsideGallery: Boolean(gallery?.querySelector(".ad-slot, ins.adsbygoogle")),
              adInsidePrintableActions: Boolean(document.querySelector(".printable-action-controls .ad-slot, .printable-action-controls ins.adsbygoogle")),
            };
          });
          pageChecks += 1;
          const label = `${route}@${viewport.width}`;
          if (!response || response.status() !== 200) failures.push(`${label}: HTTP ${response?.status() || 0}`);
          if (metrics.overflow) failures.push(`${label}: horizontal overflow`);
          if (metrics.brokenImages) failures.push(`${label}: ${metrics.brokenImages} broken visible images`);
          if (metrics.duplicateCardIds) failures.push(`${label}: ${metrics.duplicateCardIds} duplicate cards`);
          if (metrics.adInsideGallery || metrics.adInsidePrintableActions) failures.push(`${label}: ad entered a prohibited interaction area`);
          if (metrics.cards > 0) {
            if (metrics.imageHref !== metrics.titleHref || !metrics.imageHref?.startsWith("/printables/")) failures.push(`${label}: canonical card links differ`);
            if (!metrics.printAvailable || metrics.printPrimary) failures.push(`${label}: Print is missing or primary`);
            if (metrics.printHeight < 44) failures.push(`${label}: Print target is ${metrics.printHeight}px high`);
            if (metrics.focusOrder.join("|") !== "image|title|Print") failures.push(`${label}: card focus order is ${metrics.focusOrder.join("|")}`);
            if (viewport.width === 390 && metrics.columns !== 2) failures.push(`${label}: expected two mobile columns, found ${metrics.columns}`);
            if (viewport.width === 390 && metrics.printWidth >= metrics.cardWidth * 0.8) failures.push(`${label}: Print remains visually dominant`);
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { browserId, pageChecks, failures };
}

async function runInteractions(browser, screenshots) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const checks = {};
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP_URL}/coloring-pages`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(500);
    await capture(page, "chrome-main-gallery-390.png", screenshots, true);
    checks.mobileCardDensity = await page.locator(".gallery-explorer .gallery-grid").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length === 2);
    const firstCard = page.locator(".gallery-explorer .gallery-item").first();
    const imageHref = await firstCard.locator(".gallery-item-media-link").getAttribute("href");
    const titleHref = await firstCard.locator(".item-title-link").getAttribute("href");
    checks.canonicalCardTargetsMatch = Boolean(imageHref?.startsWith("/printables/") && imageHref === titleHref);
    await firstCard.locator(".gallery-item-media-link").focus();
    await capture(page, "chrome-card-keyboard-focus-390.png", screenshots, false);
    checks.cardFocusVisible = await firstCard.locator(".gallery-item-media-link").evaluate((link) => getComputedStyle(link).outlineStyle === "solid");
    const galleryUrl = page.url();
    await firstCard.locator(".gallery-print-button").click();
    await page.locator('[role="dialog"]').waitFor({ state: "visible" });
    checks.printOpensDialogWithoutNavigation = page.url() === galleryUrl;
    await page.getByRole("button", { name: "Close" }).click();

    const search = page.getByRole("searchbox", { name: "Search this collection" });
    await search.fill("alligator");
    await page.waitForFunction(() => document.querySelector(".gallery-control-summary")?.textContent.includes("matching coloring pages"));
    await page.waitForTimeout(250);
    await capture(page, "chrome-search-alligator-390.png", screenshots, true);
    const searchTitles = await page.locator(".gallery-explorer .item-title-link").allTextContents();
    checks.searchUsesRelevantCompleteData = searchTitles.length > 0 && searchTitles.every((title) => /alligator/i.test(title));
    checks.searchHasNoDuplicates = new Set(searchTitles).size === searchTitles.length;

    await search.fill("no-match-gallery-discovery-zzzz");
    await page.getByRole("heading", { name: "No matching coloring pages" }).waitFor();
    await capture(page, "chrome-search-no-results-390.png", screenshots, false);
    const emptyStateClear = page.locator(".empty-state").getByRole("button", { name: "Clear all" });
    checks.noResultState = await emptyStateClear.isVisible();
    await emptyStateClear.click();
    await page.waitForFunction(() => !document.querySelector(".gallery-control-summary")?.textContent.includes("matching coloring pages")
      && document.querySelectorAll(".gallery-explorer .gallery-item").length === 48);
    checks.clearRestoresStaticPresentation = await page.locator(".gallery-explorer .gallery-item").count() === 48;

    await search.fill("animal");
    await page.waitForFunction(() => document.querySelector(".gallery-control-summary")?.textContent.includes("matching coloring pages")
      && document.querySelectorAll(".gallery-explorer .gallery-item").length === 48
      && Boolean(document.querySelector(".gallery-show-more button")));
    const beforeIds = await cardHrefs(page);
    await capture(page, "chrome-show-more-before-390.png", screenshots, false);
    const showMore = page.getByRole("button", { name: "Show more" });
    checks.showMoreAvailable = await showMore.isVisible();
    await showMore.click();
    await page.waitForFunction(() => document.querySelectorAll(".gallery-explorer .gallery-item").length > 48);
    const afterIds = await cardHrefs(page);
    await capture(page, "chrome-show-more-after-390.png", screenshots, false);
    checks.showMoreAddsWithoutDuplicates = afterIds.length > beforeIds.length && new Set(afterIds).size === afterIds.length && beforeIds.every((id, index) => afterIds[index] === id);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${APP_URL}/coloring-pages`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await capture(page, "chrome-main-gallery-1440.png", screenshots, true);
    await page.goto(`${APP_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page.locator(".gallery-filter-options label").filter({ hasText: "Cute" }).locator("input").check();
    await page.waitForFunction(() => document.querySelector(".gallery-control-summary")?.textContent.includes("matching coloring pages"));
    const oneFilterCount = await page.locator(".gallery-explorer .gallery-item").count();
    await page.locator(".gallery-filter-options label").filter({ hasText: "Dinosaurs" }).locator("input").check();
    await page.waitForTimeout(250);
    const combinedFilterCount = await page.locator(".gallery-explorer .gallery-item").count();
    checks.filterCombinationUsesCompleteData = oneFilterCount > 0 && combinedFilterCount > 0 && combinedFilterCount <= oneFilterCount;
    await page.getByRole("searchbox", { name: "Search this collection" }).fill("dinosaur");
    await page.waitForTimeout(250);
    const combinedTitles = await page.locator(".gallery-explorer .item-title-link").allTextContents();
    checks.searchPlusFilters = combinedTitles.length > 0
      && combinedTitles.slice(0, 15).every((title) => /dinosaur|dino|stegasaurus|triceratops|tyrannosaurus/i.test(title))
      && new Set(combinedTitles).size === combinedTitles.length;
    await page.locator(".gallery-control-summary").getByRole("button", { name: "Clear all" }).click();
    await page.waitForFunction(() => !document.querySelector(".gallery-control-summary")?.textContent.includes("matching coloring pages"));
    checks.filterClearRestoresGallery = await page.locator(".gallery-explorer .gallery-item").count() === 48;
    await page.goto(`${APP_URL}/coloring-pages/animals/page/2`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await capture(page, "chrome-animals-pagination-1440.png", screenshots, false);
    checks.paginationCrawlable = await page.getByRole("link", { name: "Previous" }).getAttribute("href") === "/coloring-pages/animals"
      && await page.getByRole("link", { name: "Next" }).getAttribute("href") === "/coloring-pages/animals/page/3";
    checks.paginationFramingConcise = (await page.locator("main").innerText()).match(/Page 2 of \d+/g)?.length === 1;

    await page.goto(`${APP_URL}/printables/animals/animals-alligator-4feec8505a`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const relatedPrintables = page.locator(".printable-related-section");
    const relatedCollections = page.locator('[data-page-section="related-collections"]');
    await relatedPrintables.scrollIntoViewIfNeeded();
    await captureLocator(relatedPrintables, "chrome-alligator-related-printables.png", screenshots);
    await captureLocator(relatedCollections, "chrome-alligator-related-collections.png", screenshots);
    const alligatorTitles = await relatedPrintables.locator(".item-title-link").allTextContents();
    checks.alligatorPrintableRelevance = alligatorTitles.slice(0, 8).filter((title) => /alligator/i.test(title)).length >= 7;
    checks.alligatorCollectionRelevance = (await relatedCollections.locator(".related-link-label").first().textContent())?.trim() === "Reptiles Coloring Pages";
    checks.relatedLinksCanonical = (await relatedPrintables.locator(".item-title-link").evaluateAll((links) => links.every((link) => link.getAttribute("href")?.startsWith("/printables/")))) === true;

    await page.goto(`${APP_URL}/printables/anime-girls/anime-girl-field-of-flowers-c6343aeefe`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const flowerRelated = page.locator(".printable-related-section");
    await flowerRelated.scrollIntoViewIfNeeded();
    await captureLocator(flowerRelated, "chrome-flower-related-printables.png", screenshots);
    const flowerTitles = await flowerRelated.locator(".item-title-link").allTextContents();
    checks.flowerPrintableRelevance = flowerTitles.slice(0, 8).filter((title) => /flower|tulip|bird of paradise/i.test(title)).length >= 6;
  } finally {
    await context.close();
  }
  return { checks };
}

async function cardHrefs(page) {
  return page.locator(".gallery-explorer .gallery-item-media-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
}

async function capture(page, filename, screenshots, fullPage) {
  const output = path.join(REVIEW_DIR, filename);
  await page.screenshot({ path: output, fullPage });
  screenshots.push(path.relative(ROOT, output).replaceAll(path.sep, "/"));
}

async function captureLocator(locator, filename, screenshots) {
  const output = path.join(REVIEW_DIR, filename);
  await locator.screenshot({ path: output });
  screenshots.push(path.relative(ROOT, output).replaceAll(path.sep, "/"));
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}
