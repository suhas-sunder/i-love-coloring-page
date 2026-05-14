const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const utils = await import("./live-seo-utils.mjs");
  await utils.ensureOutputDirs();
  await mkdir(utils.REVIEW_SCREENSHOT_DIR, { recursive: true });

  let browser;
  const pageChecks = [];
  const workflowChecks = {
    printPreviewOpened: false,
    printButtonWorks: false,
    printDocumentScoped: false,
    pngDownloadWorks: false,
    jpgDownloadWorks: false,
    webpDownloadWorks: false,
    svgDownloadAbsent: false,
    moreMenuWorks: false,
    mobileNavWorks: false,
    searchFilterWorks: false,
    paginationWorks: false,
    homepageFreshPagesChangedAfterReload: false,
    hubFeaturedPagesRender: false,
  };
  const blockers = [];
  const freshness = await utils.readManifestIfExists("pipeline/manifests/live-seo-deploy-freshness-check.json");
  const productionStale = freshness?.summary?.productionDeployCurrent === false;
  if (productionStale) {
    blockers.push("production deployment appears stale, so interactive print/download/navigation checks were recorded as blocked");
  }

  try {
    browser = await chromium.launch({ headless: true });
    const viewportsToCheck = productionStale ? VIEWPORTS.filter((viewport) => ["390", "1440"].includes(viewport.label)) : VIEWPORTS;
    for (const viewport of viewportsToCheck) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        acceptDownloads: true,
      });
      for (const pagePath of utils.BROWSER_SAMPLE_PATHS) {
        const page = await context.newPage();
        const check = await inspectPage(page, pagePath, viewport, utils, { quick: productionStale });
        pageChecks.push(check);
        await page.close();
      }
      await context.close();
    }

    if (!productionStale) {
      Object.assign(workflowChecks, await inspectHomepageRotation(browser, utils));
      Object.assign(workflowChecks, await inspectGalleryWorkflows(browser, utils));
      Object.assign(workflowChecks, await inspectNavigation(browser, utils));
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (browser) await browser.close();
  }

  const galleryChecks = pageChecks.filter((entry) => entry.hasGallery);
  const summary = {
    pagesChecked: pageChecks.length,
    viewportsChecked: [...new Set(pageChecks.map((entry) => entry.viewport))],
    skippedInteractiveWorkflowChecks: productionStale,
    browserQaPassed:
      pageChecks.length >= utils.BROWSER_SAMPLE_PATHS.length &&
      pageChecks.every((entry) =>
        entry.status === 200 &&
        entry.pageRendered &&
        entry.noHorizontalOverflow &&
        entry.noBrokenImageIcons &&
        entry.noPreviewUnavailable &&
        entry.noSvgDownloadCopy,
      ) &&
      galleryChecks.every((entry) => entry.galleryImagesRender) &&
      workflowChecks.printPreviewOpened &&
      workflowChecks.printButtonWorks &&
      workflowChecks.printDocumentScoped &&
      workflowChecks.pngDownloadWorks &&
      workflowChecks.jpgDownloadWorks &&
      workflowChecks.webpDownloadWorks &&
      workflowChecks.svgDownloadAbsent &&
      workflowChecks.moreMenuWorks &&
      workflowChecks.mobileNavWorks &&
      workflowChecks.searchFilterWorks &&
      workflowChecks.paginationWorks &&
      workflowChecks.homepageFreshPagesChangedAfterReload &&
      workflowChecks.hubFeaturedPagesRender &&
      blockers.length === 0,
    webpGalleryPreviewsRender: galleryChecks.length > 0 && galleryChecks.every((entry) => entry.galleryImagesRender),
    noPreviewUnavailable: pageChecks.every((entry) => entry.noPreviewUnavailable),
    noBrokenImageIcons: pageChecks.every((entry) => entry.noBrokenImageIcons),
    deferredRecordsHidden: pageChecks.every((entry) => entry.deferredRecordsHidden),
    countsShow6352WhereApplicable: pageChecks.some((entry) => entry.path === "/" && entry.pageTextIncludes6352) || pageChecks.some((entry) => entry.path === "/coloring-pages" && entry.pageTextIncludes6352),
    featuredRotationWorks: workflowChecks.homepageFreshPagesChangedAfterReload && workflowChecks.hubFeaturedPagesRender,
    searchFilterWorks: workflowChecks.searchFilterWorks,
    paginationWorks: workflowChecks.paginationWorks,
    moreMenuWorks: workflowChecks.moreMenuWorks,
    mobileNavWorks: workflowChecks.mobileNavWorks,
    printWorks: workflowChecks.printPreviewOpened && workflowChecks.printButtonWorks && workflowChecks.printDocumentScoped,
    pngDownloadWorks: workflowChecks.pngDownloadWorks,
    jpgDownloadWorks: workflowChecks.jpgDownloadWorks,
    webpDownloadWorks: workflowChecks.webpDownloadWorks,
    svgDownloadAbsent: (productionStale ? true : workflowChecks.svgDownloadAbsent) && pageChecks.every((entry) => entry.noSvgDownloadCopy),
    adWellsVisibleWithAcceptedDensity: pageChecks.some((entry) => entry.visibleAdLabels > 0) && pageChecks.every((entry) => entry.visibleAdLabels <= 3),
    noHorizontalOverflow: pageChecks.every((entry) => entry.noHorizontalOverflow),
    trustPagesRender: pageChecks.filter((entry) => ["/contact", "/privacy"].includes(entry.path)).every((entry) => entry.status === 200 && entry.pageRendered),
    contactEmailAppearsCorrectly: pageChecks.some((entry) => entry.path === "/contact" && entry.contactEmailVisible),
    screenshotDirectory: utils.REVIEW_SCREENSHOT_DIR,
    blockers,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    phase: "live-seo-verification",
    summary,
    workflowChecks,
    pageChecks,
  };

  await utils.writeJson("pipeline/manifests/live-seo-browser-qa-results.json", result);
  await utils.writeReport("pipeline/reports/live-seo-browser-qa-report.md", report(result));
  await utils.writeAcceptanceGate();
  console.log(`Live SEO browser QA complete: ${summary.browserQaPassed ? "passed" : "blocked"}.`);
}

const VIEWPORTS = [
  { label: "390", width: 390, height: 900 },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 1100 },
  { label: "1920", width: 1920, height: 1100 },
];

async function inspectPage(page, pagePath, viewport, utils, options = {}) {
  const url = pagePath === "/" ? `${utils.SITE_URL}/` : `${utils.SITE_URL}${pagePath}`;
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.quick ? 20000 : 45000 }).catch((error) => ({ status: () => 0, error }));
  if (!options.quick) await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const gallery = page.locator("#gallery");
  if ((await gallery.count()) > 0) {
    await gallery.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await waitForVisibleGalleryImages(page, options.quick ? 3000 : 30000).catch(() => {});
  }

  const screenshotPath = path.join(utils.REVIEW_SCREENSHOT_DIR, `${slugForScreenshot(pagePath)}-${viewport.label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

  const metrics = await page.evaluate((contactEmail) => {
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    const galleryItems = Array.from(document.querySelectorAll(".gallery-item"));
    const galleryImages = Array.from(document.querySelectorAll(".gallery-item img")).filter(isVisible);
    const brokenImages = Array.from(document.images)
      .filter((image) => isVisible(image) && image.complete && image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src || image.alt)
      .slice(0, 10);
    const bodyText = document.body.innerText || "";
    const visibleAdLabels = Array.from(document.querySelectorAll(".ad-slot-label"))
      .filter(isVisible)
      .length;

    return {
      pageRendered: Boolean(document.querySelector("main")) && bodyText.length > 100,
      hasGallery: galleryItems.length > 0,
      galleryImageCount: galleryImages.length,
      galleryImagesRender: galleryItems.length === 0 || galleryImages.some((image) => image.naturalWidth > 0),
      brokenImages,
      noHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 2,
      previewUnavailableCount: (bodyText.match(/Preview unavailable/g) || []).length,
      deferredRecordsHidden: !/manual review|deferred/i.test(bodyText),
      pageTextIncludes6352: /6,352/.test(bodyText),
      noSvgDownloadCopy: !/Download SVG|downloadSvg|svgDownload/i.test(document.documentElement.innerHTML),
      visibleAdLabels,
      contactEmailVisible: bodyText.includes(contactEmail),
    };
  }, utils.CONTACT_EMAIL);

  return {
    path: pagePath,
    viewport: viewport.label,
    url,
    status: typeof response?.status === "function" ? response.status() : 0,
    finalUrl: page.url(),
    screenshotPath,
    ...metrics,
    noBrokenImageIcons: metrics.brokenImages.length === 0,
    noPreviewUnavailable: metrics.previewUnavailableCount === 0,
  };
}

async function inspectHomepageRotation(browser, utils) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await page.goto(`${utils.SITE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.locator("#gallery").scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await waitForVisibleGalleryImages(page).catch(() => {});
  const firstIds = await getFeaturedAssetIds(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.locator("#gallery").scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await waitForVisibleGalleryImages(page).catch(() => {});
  const secondIds = await getFeaturedAssetIds(page);
  await context.close();

  return {
    homepageFreshPagesChangedAfterReload: firstIds.length > 0 && secondIds.length > 0 && firstIds.join("|") !== secondIds.join("|"),
  };
}

async function inspectGalleryWorkflows(browser, utils) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  const result = {
    printPreviewOpened: false,
    printButtonWorks: false,
    printDocumentScoped: false,
    pngDownloadWorks: false,
    jpgDownloadWorks: false,
    webpDownloadWorks: false,
    svgDownloadAbsent: false,
    searchFilterWorks: false,
    paginationWorks: false,
    hubFeaturedPagesRender: false,
  };

  await page.goto(`${utils.SITE_URL}/coloring-pages/t-rex`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.locator("#featured-pages").scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await waitForVisibleGalleryImages(page).catch(() => {});
  result.hubFeaturedPagesRender = await page.evaluate(() => {
    const featured = document.querySelector(".rotating-featured-grid");
    if (!featured) return false;
    return Array.from(featured.querySelectorAll("img")).some((image) => image.complete && image.naturalWidth > 0);
  });

  await page.locator("#gallery").scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  const previewButton = page.getByRole("button", { name: /Preview and print/i }).first();
  await previewButton.click({ timeout: 15000 });
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const preview = document.querySelector(".print-preview-media img");
    const error = document.querySelector(".print-preview-state-error");
    return Boolean(error) || Boolean(preview && preview.complete && preview.naturalWidth > 0);
  }, undefined, { timeout: 45000 }).catch(() => {});
  result.printPreviewOpened = await dialog.isVisible().catch(() => false);
  result.svgDownloadAbsent = (await page.getByText(/Download SVG/i).count()) === 0;
  result.printDocumentScoped = await page.evaluate(() => {
    const documentNode = document.querySelector(".print-document");
    const previewImage = documentNode?.querySelector("img");
    const panel = document.querySelector(".print-preview-panel");
    return Boolean(documentNode && previewImage && previewImage.complete && previewImage.naturalWidth > 0 && panel);
  });

  await page.evaluate(() => {
    window.__liveSeoPrintCalled = false;
    window.print = () => {
      window.__liveSeoPrintCalled = true;
    };
  });
  await page.getByRole("button", { name: /^Print$/ }).click({ timeout: 10000 });
  result.printButtonWorks = await page.waitForFunction(() => window.__liveSeoPrintCalled === true, undefined, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  for (const label of ["PNG", "JPG", "WebP"]) {
    result[`${label.toLowerCase() === "jpg" ? "jpg" : label.toLowerCase()}DownloadWorks`] = await clickAndCaptureDownload(page, label);
  }

  await page.goto(`${utils.SITE_URL}/coloring-pages`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await page.locator("#gallery").scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  const searchInput = page.getByLabel(/Search this collection/i).first();
  if (await searchInput.count()) {
    await searchInput.fill("t-rex");
    result.searchFilterWorks = await page.getByText(/t-rex|tyrannosaurus/i).first().waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
  }

  await page.goto(`${utils.SITE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  result.paginationWorks = (await page.locator('a[href*="/coloring-pages/animals/page/2"], a[aria-label*="Next"], a:has-text("Next")').count()) > 0;

  await context.close();
  return result;
}

async function inspectNavigation(browser, utils) {
  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1100 } });
  const desktopPage = await desktop.newPage();
  const result = {
    moreMenuWorks: false,
    mobileNavWorks: false,
  };

  await desktopPage.goto(`${utils.SITE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await desktopPage.getByRole("button", { name: /^More$/ }).click({ timeout: 10000 });
  const desktopSearch = desktopPage.getByLabel(/Search hub pages/i).first();
  if (await desktopSearch.count()) {
    await desktopSearch.fill("dragons");
    result.moreMenuWorks = await desktopPage.getByRole("link", { name: /dragons/i }).first().waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
  }
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${utils.SITE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await mobilePage.getByRole("button", { name: /Open navigation menu/i }).click({ timeout: 10000 });
  const mobileSearch = mobilePage.getByLabel(/Search mobile hub pages/i).first();
  if (await mobileSearch.count()) {
    await mobileSearch.fill("t-rex");
    result.mobileNavWorks = await mobilePage.getByRole("link", { name: /t-rex/i }).first().waitFor({ state: "visible", timeout: 10000 })
      .then(() => true)
      .catch(() => false);
  }
  await mobile.close();

  return result;
}

async function waitForVisibleGalleryImages(page, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }
    return Array.from(document.querySelectorAll(".gallery-item img")).some((image) => isVisible(image) && image.complete && image.naturalWidth > 0);
  }, undefined, { timeout: timeoutMs });
}

async function getFeaturedAssetIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#gallery .gallery-item, .rotating-featured-grid .gallery-item"))
      .slice(0, 8)
      .map((entry) => entry.id)
      .filter(Boolean),
  );
}

async function clickAndCaptureDownload(page, label) {
  const button = page.getByRole("button", { name: new RegExp(`Download ${label}`, "i") }).first();
  if (!(await button.count())) return false;
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      button.click({ timeout: 15000 }),
    ]);
    const filename = download.suggestedFilename();
    await download.delete().catch(() => {});
    return new RegExp(`\\.${label === "JPG" ? "jpg" : label.toLowerCase()}$`, "i").test(filename);
  } catch {
    return false;
  }
}

function slugForScreenshot(pagePath) {
  return pagePath === "/" ? "home" : pagePath.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

function report(result) {
  const s = result.summary;
  return `# Live SEO Browser QA Report

- Pages checked: ${s.pagesChecked}
- Viewports checked: ${s.viewportsChecked.join(", ")}
- Browser QA passed: ${s.browserQaPassed}
- WebP gallery previews render: ${s.webpGalleryPreviewsRender}
- No Preview unavailable for visible uploaded records: ${s.noPreviewUnavailable}
- No broken image icons: ${s.noBrokenImageIcons}
- Deferred records hidden: ${s.deferredRecordsHidden}
- Counts show 6,352 where applicable: ${s.countsShow6352WhereApplicable}
- Featured rotation works: ${s.featuredRotationWorks}
- Search/filter works: ${s.searchFilterWorks}
- Pagination works: ${s.paginationWorks}
- More menu works: ${s.moreMenuWorks}
- Mobile nav works: ${s.mobileNavWorks}
- Print works: ${s.printWorks}
- PNG download works: ${s.pngDownloadWorks}
- JPG download works: ${s.jpgDownloadWorks}
- WebP download works: ${s.webpDownloadWorks}
- SVG download absent: ${s.svgDownloadAbsent}
- Ad wells visible with accepted density: ${s.adWellsVisibleWithAcceptedDensity}
- No horizontal overflow: ${s.noHorizontalOverflow}
- Trust pages render: ${s.trustPagesRender}
- Contact email appears correctly: ${s.contactEmailAppearsCorrectly}
- Screenshots: ${s.screenshotDirectory}
- Blockers: ${s.blockers.length ? s.blockers.join("; ") : "none"}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
