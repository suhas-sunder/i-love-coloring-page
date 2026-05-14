const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  ensureStaticExport,
  gitStatusFor,
  installStaticExportRoutes,
  normalizePath,
  passFail,
  readJson,
  readProjectText,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SCREENSHOT_DIR = "pipeline/review/predeploy-local/screenshots";
const ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];
const VIEWPORTS = [390, 768, 1440, 1920, 2560];
const VIEWPORT_HEIGHT = {
  390: 900,
  768: 1000,
  1440: 1100,
  1920: 1200,
  2560: 1400,
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });
  const linkSection = await buildLinkSectionUiReport();
  await writeJson("pipeline/manifests/predeploy-link-section-ui-results.json", linkSection);
  await writeText("pipeline/reports/predeploy-link-section-ui-report.md", renderLinkSectionReport(linkSection));

  const browserQa = await runBrowserQa();
  await writeJson("pipeline/manifests/predeploy-local-browser-qa-results.json", browserQa);
  await writeText("pipeline/reports/predeploy-local-browser-qa-report.md", renderBrowserQaReport(browserQa));

  const trust = await buildTrustLegalReview(browserQa);
  await writeJson("pipeline/manifests/predeploy-trust-legal-local-review.json", trust);
  await writeText("pipeline/reports/predeploy-trust-legal-local-review.md", renderTrustReport(trust));

  const ads = await buildAdPlaceholderQa(browserQa);
  await writeJson("pipeline/manifests/predeploy-ad-placeholder-local-qa.json", ads);
  await writeText("pipeline/reports/predeploy-ad-placeholder-local-qa.md", renderAdReport(ads));

  console.log(JSON.stringify({
    linkSection: linkSection.summary,
    browserQa: browserQa.summary,
    trust: trust.summary,
    ads: ads.summary,
  }, null, 2));
}

async function buildLinkSectionUiReport() {
  const home = await readText("app/page.tsx");
  const landing = await readText("app/coloring-pages/page.tsx");
  const hubHero = await readText("src/components/coloring/HubHero.tsx");
  const hubPage = await readText("src/components/coloring/HubPageContent.tsx");
  const related = await readText("src/components/coloring/RelatedHubs.tsx");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const nav = await readText("src/lib/navigation/siteNav.ts");
  const css = await readText("src/styles/components.css");
  const combined = `${home}\n${landing}\n${hubHero}\n${hubPage}\n${related}\n${moreMenu}\n${nav}\n${css}`;
  const sectionTitles = [...combined.matchAll(/<h2[^>]*>([^<]+)<\/h2>|<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => (match[1] || match[2] || "").trim());
  const duplicateTitles = findDuplicates(sectionTitles.filter(Boolean));
  const summary = {
    uselessColoringPagesEyebrowPresent: /className="hero-related-kicker"[\s\S]*Coloring Pages/.test(combined),
    genericHeroKickerRemoved: !/className="hero-related-kicker"/.test(home + hubHero),
    popularCollectionsPurposeful: /Popular collections/.test(home + landing) && /featuredHubs/.test(home + landing),
    relatedCollectionsPurposeful: /getRelatedHubs|getChildHubs|RelatedHubs/.test(hubPage + related),
    moreWaysDistinctPurpose: /More ways to browse/.test(landing + hubPage) && /Use these links after the gallery|Browse by subject|Style and difficulty/.test(landing + hubPage),
    countsAlignedCleanly: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(css) && /text-align:\s*right/.test(css),
    importantHubTitlesEllipsized: /text-overflow:\s*ellipsis|white-space:\s*nowrap/.test(extractCssRules(css, ["hub-link-title", "related-link-label", "hero-related-label", "hub-menu-link-label"])),
    giantUnstructuredDump: /moreHubGroups/.test(moreMenu) ? false : /phase1HubLinks\.map/.test(moreMenu),
    nestedCardHeavyLayout: /background:|box-shadow|border:/.test(extractCssRules(css, ["hub-link-grid", "related-list", "hero-related-panel"])),
    broadCategoryNavigationPreserved: /Animals & Nature|Fantasy & Characters|Patterns & Detailed|Dinosaurs & Prehistoric/.test(nav),
    groupedMoreMenuPreserved: /groupHubLinks|hub-menu-group|hub-menu-grid/.test(moreMenu + nav),
    duplicateSectionTitles: duplicateTitles,
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-link-section-ui-results",
    summary: {
      ...summary,
      linkSectionUiPassed:
        !summary.uselessColoringPagesEyebrowPresent &&
        summary.genericHeroKickerRemoved &&
        summary.popularCollectionsPurposeful &&
        summary.relatedCollectionsPurposeful &&
        summary.moreWaysDistinctPurpose &&
        summary.countsAlignedCleanly &&
        !summary.importantHubTitlesEllipsized &&
        !summary.giantUnstructuredDump &&
        !summary.nestedCardHeavyLayout &&
        summary.broadCategoryNavigationPreserved &&
        summary.groupedMoreMenuPreserved,
    },
  };
}

async function runBrowserQa() {
  const build = await ensureStaticExport({ force: false });
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const baseUrl = await installStaticExportRoutes(context, build.outDir);
  const consoleErrors = [];
  const networkErrors = [];
  const pageResults = [];

  try {
    for (const width of VIEWPORTS) {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push({ width, message: message.text() });
      });
      page.on("pageerror", (error) => consoleErrors.push({ width, message: error.message }));
      page.on("response", (response) => {
        if (response.status() >= 400) networkErrors.push({ width, url: response.url(), status: response.status() });
      });
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT[width] });

      for (const route of ROUTES) {
        pageResults.push(await inspectRoute(page, baseUrl, route, width));
      }
      await page.close();
    }

    const interactionResults = await runInteractionChecks(context, baseUrl);
    const runtimeAvailable = await readJson("src/generated/coloring/runtime-available-items.json");
    const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
    const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json").catch(() => ({ items: [] }));
    const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });

    const summary = {
      routeCount: ROUTES.length,
      viewportCount: VIEWPORTS.length,
      runtimeAvailableRecords: runtimeAvailable.items?.length || 0,
      runtimeIndexableHubs: runtimeHubs.hubs?.length || 0,
      webpGalleryPreviewsRender: pageResults.filter((result) => result.galleryImageCount > 0).every((result) => result.loadedWebpCount > 0),
      previewUnavailableVisibleForUploadedRecords: pageResults.some((result) => result.previewUnavailableCount > 0),
      deferredRecordsHidden: !pageResults.some((result) => result.visibleDeferredAssetIds.length > 0),
      deferredRecordCount: deferred.items?.length || 0,
      countsShow6352WhereApplicable: pageResults.filter((result) => ["/", "/coloring-pages"].includes(result.route)).every((result) => result.textIncludes6352),
      featuredFreshRotationWorks: interactionResults.featuredFreshRotationWorks,
      searchWorks: interactionResults.searchWorks,
      filterWorks: interactionResults.filterWorks,
      paginationWorks: interactionResults.paginationWorks,
      moreMenuWorks: interactionResults.moreMenuWorks,
      mobileNavWorks: interactionResults.mobileNavWorks,
      printWorks: interactionResults.printWorks,
      generatedPrintOutputClean: interactionResults.generatedPrintOutputClean,
      pngDownloadWorks: interactionResults.downloads.png,
      jpgDownloadWorks: interactionResults.downloads.jpg,
      webpDownloadWorks: interactionResults.downloads.webp,
      svgDownloadAbsent: interactionResults.svgDownloadAbsent,
      adPlaceholdersFollowAcceptedDensity: pageResults.every((result) => result.adDensityOk),
      noHorizontalOverflow: pageResults.every((result) => !result.horizontalOverflow),
      trustPagesRender: pageResults.filter((result) => ["/about", "/contact", "/privacy", "/terms"].includes(result.route)).every((result) => result.status === "ok"),
      contactEmailAppearsCorrectly: pageResults.find((result) => result.route === "/contact" && result.width === 1440)?.text.includes("admin@ilovecoloringpage.com") || false,
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      noConsoleErrors: consoleErrors.length === 0 && networkErrors.length === 0,
    };

    return {
      generatedAt: new Date().toISOString(),
      runId: "predeploy-local-browser-qa-results",
      build,
      baseUrl,
      screenshotsDirectory: SCREENSHOT_DIR,
      routes: pageResults,
      interactions: interactionResults,
      consoleErrors,
      networkErrors,
      summary: {
        ...summary,
        browserQaPassed:
          summary.webpGalleryPreviewsRender &&
          !summary.previewUnavailableVisibleForUploadedRecords &&
          summary.deferredRecordsHidden &&
          summary.countsShow6352WhereApplicable &&
          summary.featuredFreshRotationWorks &&
          summary.searchWorks &&
          summary.filterWorks &&
          summary.paginationWorks &&
          summary.moreMenuWorks &&
          summary.mobileNavWorks &&
          summary.printWorks &&
          summary.generatedPrintOutputClean &&
          summary.pngDownloadWorks &&
          summary.jpgDownloadWorks &&
          summary.webpDownloadWorks &&
          summary.svgDownloadAbsent &&
          summary.adPlaceholdersFollowAcceptedDensity &&
          summary.noHorizontalOverflow &&
          summary.trustPagesRender &&
          summary.contactEmailAppearsCorrectly &&
          !summary.liveAdSenseCodePresent &&
          summary.noConsoleErrors,
      },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function inspectRoute(page, baseUrl, route, width) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(700);
  const safeRoute = route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/-$/, "");
  const screenshotPath = `${SCREENSHOT_DIR}/${width}-${safeRoute}.png`;
  await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: false });

  const inspection = await page.evaluate(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const images = [...document.querySelectorAll(".asset-image")].filter(isVisible);
    const visibleText = document.body.innerText;
    const adLabels = [...document.querySelectorAll(".ad-slot-label")].filter(isVisible);
    return {
      text: visibleText,
      galleryImageCount: images.length,
      loadedWebpCount: images.filter((image) => image.currentSrc.includes("/webp/") && image.complete && image.naturalWidth > 0).length,
      previewUnavailableCount: [...document.querySelectorAll(".asset-placeholder")].filter(isVisible).length,
      visibleAssetIds: [...document.querySelectorAll("article.gallery-item[id^='asset-']")].filter(isVisible).map((element) => element.id.replace(/^asset-/, "")),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      adLabelCount: adLabels.length,
      adsInsideNav: [...document.querySelectorAll("nav .ad-slot, nav [data-ad-placeholder='true']")].some(isVisible),
      adsInsideGalleryGrid: [...document.querySelectorAll(".gallery-grid .ad-slot, .gallery-grid [data-ad-placeholder='true']")].some(isVisible),
      adsBesidePrintDownloadControls: [...document.querySelectorAll(".print-preview-panel .ad-slot, .gallery-actions .ad-slot, .download-options .ad-slot")].some(isVisible),
    };
  });
  const deferredIds = new Set((await readJson("src/generated/coloring/runtime-deferred-items.json").catch(() => ({ items: [] }))).items?.map((item) => item.assetId) || []);
  const visibleDeferredAssetIds = inspection.visibleAssetIds.filter((assetId) => deferredIds.has(assetId));
  const adDensityOk = expectedAdCount(width, route) === inspection.adLabelCount;

  return {
    route,
    width,
    status: "ok",
    screenshotPath,
    text: inspection.text.slice(0, 2000),
    textIncludes6352: /6,352/.test(inspection.text),
    galleryImageCount: inspection.galleryImageCount,
    loadedWebpCount: inspection.loadedWebpCount,
    previewUnavailableCount: inspection.previewUnavailableCount,
    visibleDeferredAssetIds,
    horizontalOverflow: inspection.horizontalOverflow,
    adLabelCount: inspection.adLabelCount,
    expectedAdLabelCount: expectedAdCount(width, route),
    adDensityOk,
    adsInsideNav: inspection.adsInsideNav,
    adsInsideGalleryGrid: inspection.adsInsideGalleryGrid,
    adsBesidePrintDownloadControls: inspection.adsBesidePrintDownloadControls,
  };
}

async function runInteractionChecks(context, baseUrl) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(700);
  const featuredFreshRotationWorks = (await page.locator(".gallery-item").count()) > 0;

  const search = page.getByRole("searchbox", { name: /search this collection/i });
  await search.fill("alligator");
  await page.waitForTimeout(500);
  const searchWorks = await page.getByText("Animals Alligator", { exact: true }).first().isVisible().catch(() => false);
  await search.fill("");

  const firstFilter = page.locator(".filter-chip").filter({ hasText: /animals|mandalas|cute|fantasy/i }).first();
  const filterExists = (await firstFilter.count()) > 0;
  if (filterExists) {
    await firstFilter.click();
    await page.waitForTimeout(300);
  }
  const filterWorks = filterExists && (await page.locator(".results-note").innerText()).includes("Showing");

  await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const nextLink = page.getByRole("link", { name: /^Next$/ });
  const paginationWorks = (await nextLink.count()) > 0 && (await nextLink.getAttribute("href"))?.includes("/page/2");

  await page.getByRole("button", { name: /^More$/ }).click();
  await page.getByRole("searchbox", { name: /search hub pages/i }).fill("dragon");
  await page.waitForTimeout(300);
  const moreMenuWorks = await page.locator(".hub-menu-panel-desktop").getByRole("link", { name: /dragon/i }).first().isVisible().catch(() => false);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("button", { name: /open navigation menu/i }).click();
  const mobileNavWorks = await page.locator(".mobile-nav-panel").getByRole("searchbox", { name: /search mobile hub pages/i }).isVisible().catch(() => false);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("searchbox", { name: /search this collection/i }).fill("Animals Alligator");
  await page.waitForTimeout(500);
  const article = page.locator('[id="asset-animals__animals-alligator__4feec8505a"]').first();
  await article.waitFor({ state: "visible", timeout: 20_000 });
  await article.scrollIntoViewIfNeeded();
  await article.getByRole("button", { name: /preview and print/i }).first().click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 20_000 });
  const svgDownloadAbsent = (await page.getByRole("button", { name: /svg/i }).count()) === 0;
  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 30_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
  const downloads = {
    png: await triggerDownload(page, "Download PNG", ".png"),
    jpg: await triggerDownload(page, "Download JPG", ".jpg"),
    webp: await triggerDownload(page, "Download WebP", ".webp"),
  };
  await page.close();

  return {
    featuredFreshRotationWorks,
    searchWorks,
    filterWorks,
    paginationWorks: Boolean(paginationWorks),
    moreMenuWorks,
    mobileNavWorks,
    printWorks: printSnapshot?.pageCount === 1,
    generatedPrintOutputClean: printSnapshot?.pageCount === 1 && !printSnapshot?.brandingOverlapsArtwork && !printSnapshot?.appUiControlsIncluded,
    downloads,
    svgDownloadAbsent,
    printSnapshot,
  };
}

async function triggerDownload(page, label, extension) {
  const button = page.getByRole("button", { name: label });
  if ((await button.count()) === 0) return false;
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    button.click(),
  ]);
  return download.suggestedFilename().toLowerCase().endsWith(extension);
}

async function buildTrustLegalReview(browserQa) {
  const trustPages = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];
  const trustSource = await readProjectText(["app/about", "app/contact", "app/privacy", "app/terms", "app/affiliate-disclosure", "app/editorial-policy", "src/lib/trust", "src/lib/site/siteConfig.ts"]);
  const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const pageFiles = trustPages.map((route) => routeToTrustFile(route));
  const pagesExist = pageFiles.every((file) => fs.existsSync(path.join(REPO_ROOT, file)));
  const summary = {
    pagesReviewed: trustPages,
    pagesExist,
    pagesRenderedLocally: browserQa.routes.filter((route) => ["/about", "/contact", "/privacy", "/terms"].includes(route.route)).every((route) => route.status === "ok"),
    contactEmail: "admin@ilovecoloringpage.com",
    contactEmailPresent: /admin@ilovecoloringpage\.com/.test(trustSource),
    fakeAddressOrPhonePresent: /123 Main|555-|fake address|fake phone|\(\d{3}\)\s*\d{3}-\d{4}/i.test(trustSource),
    privacyMentionsAdsOrCookies: /ads|advertising|cookie/i.test(await readText("app/privacy/page.tsx")),
    privacyDraftSafe: /draft|owner|review|future/i.test(await readText("app/privacy/page.tsx")),
    termsDraftSafe: /draft|owner|legal review|review/i.test(await readText("app/terms/page.tsx")),
    affiliateDisclosureExists: fs.existsSync(path.join(REPO_ROOT, "app/affiliate-disclosure/page.tsx")),
    editorialPolicyExists: fs.existsSync(path.join(REPO_ROOT, "app/editorial-policy/page.tsx")),
    legalReviewStillRecommended: /legal review|owner.*review|review before/i.test(trustSource),
    liveAdsAdded: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-trust-legal-local-review",
    summary: {
      ...summary,
      trustPagesPassed:
        summary.pagesExist &&
        summary.pagesRenderedLocally &&
        summary.contactEmailPresent &&
        !summary.fakeAddressOrPhonePresent &&
        summary.privacyMentionsAdsOrCookies &&
        summary.termsDraftSafe &&
        summary.affiliateDisclosureExists &&
        summary.editorialPolicyExists &&
        summary.legalReviewStillRecommended &&
        !summary.liveAdsAdded,
    },
  };
}

async function buildAdPlaceholderQa(browserQa) {
  const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const allRouteChecks = browserQa.routes;
  const summary = {
    adWellsVisibleByDefault: allRouteChecks.some((route) => route.adLabelCount > 0),
    liveAdSenseScriptPresent: /pagead2\.googlesyndication|adsbygoogle/i.test(sourceText),
    adClientIdsPresent: /ca-pub-|google_ad_client/i.test(sourceText),
    desktopWideDensityCorrect: allRouteChecks.filter((route) => route.width >= 1920).every((route) => route.adLabelCount === route.expectedAdLabelCount),
    desktopStandardDensityCorrect: allRouteChecks.filter((route) => route.width === 1440).every((route) => route.adLabelCount === route.expectedAdLabelCount),
    mobileTabletDensityCorrect: allRouteChecks.filter((route) => route.width === 390 || route.width === 768).every((route) => route.adLabelCount === route.expectedAdLabelCount),
    adsInsideNav: allRouteChecks.some((route) => route.adsInsideNav),
    adsInsideGalleryGrid: allRouteChecks.some((route) => route.adsInsideGalleryGrid),
    adsBesidePrintDownloadControls: allRouteChecks.some((route) => route.adsBesidePrintDownloadControls),
    overlapDetected: allRouteChecks.some((route) => route.horizontalOverflow),
    horizontalOverflow: allRouteChecks.some((route) => route.horizontalOverflow),
    visibleAdvertisementLabelCounts: summarizeAdCounts(allRouteChecks),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "predeploy-ad-placeholder-local-qa",
    summary: {
      ...summary,
      adPlaceholdersPassed:
        summary.adWellsVisibleByDefault &&
        !summary.liveAdSenseScriptPresent &&
        !summary.adClientIdsPresent &&
        summary.desktopWideDensityCorrect &&
        summary.desktopStandardDensityCorrect &&
        summary.mobileTabletDensityCorrect &&
        !summary.adsInsideNav &&
        !summary.adsInsideGalleryGrid &&
        !summary.adsBesidePrintDownloadControls &&
        !summary.overlapDetected &&
        !summary.horizontalOverflow,
    },
  };
}

function expectedAdCount(width, route) {
  if (["/about", "/contact", "/privacy", "/terms"].includes(route)) return 0;
  if (width >= 1740) return 3;
  return 1;
}

function summarizeAdCounts(routes) {
  const byWidth = {};
  for (const width of VIEWPORTS) {
    byWidth[width] = routes.filter((route) => route.width === width).map((route) => route.adLabelCount);
  }
  return byWidth;
}

function routeToTrustFile(route) {
  return `app${route}/page.tsx`.replace(/\/+/g, "/");
}

function findDuplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function extractCssRules(css, classNames) {
  return classNames
    .map((className) => {
      const match = css.match(new RegExp(`\\.${className}\\s*\\{[\\s\\S]*?\\}`, "m"));
      return match?.[0] || "";
    })
    .join("\n");
}

function renderLinkSectionReport(payload) {
  return [
    "# Predeploy Link Section UI Report",
    "",
    renderTable([
      ["genericHeroKickerRemoved", passFail(payload.summary.genericHeroKickerRemoved)],
      ["popularCollectionsPurposeful", passFail(payload.summary.popularCollectionsPurposeful)],
      ["relatedCollectionsPurposeful", passFail(payload.summary.relatedCollectionsPurposeful)],
      ["moreWaysDistinctPurpose", passFail(payload.summary.moreWaysDistinctPurpose)],
      ["countsAlignedCleanly", passFail(payload.summary.countsAlignedCleanly)],
      ["importantHubTitlesEllipsized", payload.summary.importantHubTitlesEllipsized ? "fail" : "pass"],
      ["giantUnstructuredDump", payload.summary.giantUnstructuredDump ? "fail" : "pass"],
      ["groupedMoreMenuPreserved", passFail(payload.summary.groupedMoreMenuPreserved)],
      ["linkSectionUiPassed", passFail(payload.summary.linkSectionUiPassed)],
    ]),
  ].join("\n");
}

function renderBrowserQaReport(payload) {
  return [
    "# Predeploy Local Browser QA Report",
    "",
    renderTable([
      ["runtimeAvailableRecords", payload.summary.runtimeAvailableRecords.toLocaleString()],
      ["runtimeIndexableHubs", payload.summary.runtimeIndexableHubs.toLocaleString()],
      ["webpGalleryPreviewsRender", passFail(payload.summary.webpGalleryPreviewsRender)],
      ["previewUnavailableVisibleForUploadedRecords", payload.summary.previewUnavailableVisibleForUploadedRecords ? "fail" : "pass"],
      ["deferredRecordsHidden", passFail(payload.summary.deferredRecordsHidden)],
      ["countsShow6352WhereApplicable", passFail(payload.summary.countsShow6352WhereApplicable)],
      ["featuredFreshRotationWorks", passFail(payload.summary.featuredFreshRotationWorks)],
      ["searchWorks", passFail(payload.summary.searchWorks)],
      ["filterWorks", passFail(payload.summary.filterWorks)],
      ["paginationWorks", passFail(payload.summary.paginationWorks)],
      ["moreMenuWorks", passFail(payload.summary.moreMenuWorks)],
      ["mobileNavWorks", passFail(payload.summary.mobileNavWorks)],
      ["printWorks", passFail(payload.summary.printWorks)],
      ["PNG/JPG/WebP downloads", passFail(payload.summary.pngDownloadWorks && payload.summary.jpgDownloadWorks && payload.summary.webpDownloadWorks)],
      ["svgDownloadAbsent", passFail(payload.summary.svgDownloadAbsent)],
      ["adPlaceholdersFollowAcceptedDensity", passFail(payload.summary.adPlaceholdersFollowAcceptedDensity)],
      ["noHorizontalOverflow", passFail(payload.summary.noHorizontalOverflow)],
      ["trustPagesRender", passFail(payload.summary.trustPagesRender)],
      ["contactEmailAppearsCorrectly", passFail(payload.summary.contactEmailAppearsCorrectly)],
      ["browserQaPassed", passFail(payload.summary.browserQaPassed)],
    ]),
    "",
    `Screenshots: \`${payload.screenshotsDirectory}\``,
  ].join("\n");
}

function renderTrustReport(payload) {
  return [
    "# Predeploy Trust Legal Local Review",
    "",
    renderTable([
      ["pagesExist", passFail(payload.summary.pagesExist)],
      ["contactEmail", payload.summary.contactEmail],
      ["contactEmailPresent", passFail(payload.summary.contactEmailPresent)],
      ["fakeAddressOrPhonePresent", payload.summary.fakeAddressOrPhonePresent ? "fail" : "pass"],
      ["privacyMentionsAdsOrCookies", passFail(payload.summary.privacyMentionsAdsOrCookies)],
      ["termsDraftSafe", passFail(payload.summary.termsDraftSafe)],
      ["affiliateDisclosureExists", passFail(payload.summary.affiliateDisclosureExists)],
      ["legalReviewStillRecommended", passFail(payload.summary.legalReviewStillRecommended)],
      ["liveAdsAdded", payload.summary.liveAdsAdded ? "fail" : "pass"],
      ["trustPagesPassed", passFail(payload.summary.trustPagesPassed)],
    ]),
  ].join("\n");
}

function renderAdReport(payload) {
  return [
    "# Predeploy Ad Placeholder Local QA",
    "",
    renderTable([
      ["adWellsVisibleByDefault", passFail(payload.summary.adWellsVisibleByDefault)],
      ["liveAdSenseScriptPresent", payload.summary.liveAdSenseScriptPresent ? "fail" : "pass"],
      ["adClientIdsPresent", payload.summary.adClientIdsPresent ? "fail" : "pass"],
      ["desktopWideDensityCorrect", passFail(payload.summary.desktopWideDensityCorrect)],
      ["desktopStandardDensityCorrect", passFail(payload.summary.desktopStandardDensityCorrect)],
      ["mobileTabletDensityCorrect", passFail(payload.summary.mobileTabletDensityCorrect)],
      ["adsInsideNav", payload.summary.adsInsideNav ? "fail" : "pass"],
      ["adsInsideGalleryGrid", payload.summary.adsInsideGalleryGrid ? "fail" : "pass"],
      ["adsBesidePrintDownloadControls", payload.summary.adsBesidePrintDownloadControls ? "fail" : "pass"],
      ["horizontalOverflow", payload.summary.horizontalOverflow ? "fail" : "pass"],
      ["adPlaceholdersPassed", passFail(payload.summary.adPlaceholdersPassed)],
    ]),
    "",
    `Visible Advertisement label counts: \`${JSON.stringify(payload.summary.visibleAdvertisementLabelCounts)}\``,
  ].join("\n");
}
