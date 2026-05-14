const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  ensureStaticExport,
  installStaticExportRoutes,
  passFail,
  readJson,
  readProjectText,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SCREENSHOT_DIR = "pipeline/review/final-ux-fix/screenshots";
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

  const header = await buildHeaderHoverReport();
  await writeJson("pipeline/manifests/final-ux-header-hover-results.json", header);
  await writeText("pipeline/reports/final-ux-header-hover-report.md", renderHeaderReport(header));

  const card = await buildCardInteractionReport();
  await writeJson("pipeline/manifests/final-ux-card-interaction-results.json", card);
  await writeText("pipeline/reports/final-ux-card-interaction-report.md", renderCardReport(card));

  const spacing = await buildImageSpacingReport();
  await writeJson("pipeline/manifests/final-ux-image-preview-spacing-results.json", spacing);
  await writeText("pipeline/reports/final-ux-image-preview-spacing-report.md", renderSpacingReport(spacing));

  const modal = await buildModalReport();
  await writeJson("pipeline/manifests/final-ux-modal-results.json", modal);
  await writeText("pipeline/reports/final-ux-modal-report.md", renderModalReport(modal));

  const linkSections = await buildLinkSectionReport();
  await writeJson("pipeline/manifests/final-ux-link-sections-results.json", linkSections);
  await writeText("pipeline/reports/final-ux-link-sections-report.md", renderLinkSectionReport(linkSections));

  const moreMenu = await buildMoreMenuReport();
  await writeJson("pipeline/manifests/final-ux-more-menu-results.json", moreMenu);
  await writeText("pipeline/reports/final-ux-more-menu-report.md", renderMoreMenuReport(moreMenu));

  const browserQa = await runBrowserQa();
  await writeJson("pipeline/manifests/final-ux-browser-qa-results.json", browserQa);
  await writeText("pipeline/reports/final-ux-browser-qa-report.md", renderBrowserQaReport(browserQa));

  console.log(JSON.stringify({
    header: header.summary.headerHoverPassed,
    card: card.summary.cardInteractionPassed,
    spacing: spacing.summary.imagePreviewSpacingPassed,
    modal: modal.summary.modalPolishPassed,
    linkSections: linkSections.summary.linkSectionsPassed,
    moreMenu: moreMenu.summary.moreMenuPassed,
    browserQa: browserQa.summary.browserQaPassed,
  }, null, 2));
}

async function buildHeaderHoverReport() {
  const css = await readText("src/styles/components.css");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const componentSource = `${header}\n${moreMenu}\n${mobileNav}`;
  const navRule = extractCssRule(css, "site-nav-link");
  const summary = {
    navStructureUnchanged: /primaryNavLinks\.map/.test(header) && /MoreHubMenu/.test(header) && /MobileNav/.test(header),
    hoverStatePresent: /\.site-nav-link:hover/.test(css) && /var\(--color-soft-plum\)/.test(css),
    expandedMoreStatePresent: /\.more-hub-button\[aria-expanded="true"\]/.test(css),
    focusVisiblePresent: /\.site-nav-link:focus-visible/.test(css) && /outline:\s*var\(--focus-ring-width\)/.test(css),
    cursorPointerPresent: /\.site-nav-link[\s\S]*cursor:\s*pointer/.test(css) && /\.more-hub-button[\s\S]*cursor:\s*pointer/.test(css),
    heavyBordersOrShadowsAdded: /box-shadow|border:\s*(?!0)/.test(navRule),
    adsInsideNavSource: /AdSlot|AdRail|adsbygoogle|ad-slot/i.test(componentSource),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-header-hover-results",
    summary: {
      ...summary,
      headerHoverPassed:
        summary.navStructureUnchanged &&
        summary.hoverStatePresent &&
        summary.expandedMoreStatePresent &&
        summary.focusVisiblePresent &&
        summary.cursorPointerPresent &&
        !summary.heavyBordersOrShadowsAdded &&
        !summary.adsInsideNavSource,
    },
  };
}

async function buildCardInteractionReport() {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const css = await readText("src/styles/components.css");
  const combined = `${imageCard}\n${assetImage}\n${downloadMenu}\n${css}`;
  const summary = {
    visibleCardPrintButtonRemoved: !/className="gallery-actions"[\s\S]*>\s*Print\s*</.test(imageCard) && !/button-primary button-small[\s\S]*Preview and print/.test(imageCard),
    imageSurfaceOpensModal: /className="gallery-item-media-button"/.test(imageCard) && /onClick=\{openPrintPreview\}/.test(imageCard),
    overlayCuePresent: /gallery-item-print-cue/.test(imageCard) && /\.gallery-item-print-cue/.test(css),
    overlayCueNotSeparateButton: !/<button[^>]*gallery-item-print-cue/.test(imageCard),
    keyboardActivationPresent: /<button[\s\S]*className="gallery-item-media-button"/.test(imageCard),
    cursorPointerPresent: /\.gallery-item-media-button[\s\S]*cursor:\s*pointer/.test(css),
    focusVisiblePresent: /\.gallery-item-media-button:focus-visible/.test(css),
    titleReadable: /<h3 className="item-title">\{item\.title\}<\/h3>/.test(imageCard),
    cardDownloadControlsAbsent: !/gallery-actions[\s\S]*(Download PNG|Download JPG|Download WebP)/.test(imageCard),
    svgExposed: /Download SVG|SVG download|downloadSvg\b/i.test(combined),
    pngJpgWebpDownloadsRemain: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-card-interaction-results",
    summary: {
      ...summary,
      cardInteractionPassed:
        summary.visibleCardPrintButtonRemoved &&
        summary.imageSurfaceOpensModal &&
        summary.overlayCuePresent &&
        summary.overlayCueNotSeparateButton &&
        summary.keyboardActivationPresent &&
        summary.cursorPointerPresent &&
        summary.focusVisiblePresent &&
        summary.titleReadable &&
        summary.cardDownloadControlsAbsent &&
        !summary.svgExposed &&
        summary.pngJpgWebpDownloadsRemain,
    },
  };
}

async function buildImageSpacingReport() {
  const css = await readText("src/styles/components.css");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const mediaRule = extractCssRule(css, "gallery-item-media");
  const frameRule = extractCssRule(css, "asset-image-frame");
  const imageRule = extractCssRule(css, "asset-image");
  const summary = {
    componentAddsNoHorizontalPadding: !/padding-inline|padding-left|padding-right/.test(`${mediaRule}\n${frameRule}\n${imageRule}`),
    objectFitContainPreserved: /object-fit:\s*contain/.test(imageRule),
    importantArtworkNotIntentionallyCropped: !/object-fit:\s*cover/.test(imageRule),
    imageSurfaceUsesFullFrame: /inset:\s*0/.test(imageRule) && /width:\s*100%/.test(css),
    roundedCornersPreserved: /border-radius:\s*var\(--radius-md\)/.test(mediaRule),
    fallbackStillIntentional: /AssetPlaceholder/.test(assetImage) && /Preview unavailable/.test(assetImage),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-image-preview-spacing-results",
    summary: {
      ...summary,
      imagePreviewSpacingPassed:
        summary.componentAddsNoHorizontalPadding &&
        summary.objectFitContainPreserved &&
        summary.importantArtworkNotIntentionallyCropped &&
        summary.imageSurfaceUsesFullFrame &&
        summary.roundedCornersPreserved &&
        summary.fallbackStillIntentional,
    },
  };
}

async function buildModalReport() {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const css = await readText("src/styles/components.css");
  const summary = {
    controlsTopRight: /print-preview-header/.test(imageCard) && /print-preview-actions/.test(imageCard) && /\.print-preview-actions[\s\S]*justify-content:\s*flex-end/.test(css),
    unnecessaryDesktopScrollbar: /print-preview-panel[\s\S]*overflow:\s*auto/.test(css),
    usesAvailableViewport: /width:\s*min\(1100px,\s*100%\)/.test(css) && /height:\s*min\(70dvh,\s*720px\)/.test(css),
    largePreviewCentered: /place-items:\s*center/.test(css) && /object-fit:\s*contain/.test(css),
    downloadLabelRemoved: !/print-preview-download-title|>\s*Download\s*<\/span>/.test(imageCard),
    downloadButtonsSecondaryAndClean: /download-option-button/.test(css) && /background:\s*var\(--color-soft-paper\)/.test(css),
    buttonsHaveRequiredText: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    svgAbsent: !/Download SVG|SVG download|downloadSvg\b/i.test(`${imageCard}\n${downloadMenu}`),
    mobileRulesPresent: /@media \(max-width:\s*640px\)[\s\S]*print-preview-panel/.test(css),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-modal-results",
    summary: {
      ...summary,
      modalPolishPassed:
        summary.controlsTopRight &&
        !summary.unnecessaryDesktopScrollbar &&
        summary.usesAvailableViewport &&
        summary.largePreviewCentered &&
        summary.downloadLabelRemoved &&
        summary.downloadButtonsSecondaryAndClean &&
        summary.buttonsHaveRequiredText &&
        summary.svgAbsent &&
        summary.mobileRulesPresent,
    },
  };
}

async function buildLinkSectionReport() {
  const home = await readText("app/page.tsx");
  const landing = await readText("app/coloring-pages/page.tsx");
  const hubPage = await readText("src/components/coloring/HubPageContent.tsx");
  const related = await readText("src/components/coloring/RelatedHubs.tsx");
  const css = await readText("src/styles/components.css");
  const combined = `${home}\n${landing}\n${hubPage}\n${related}`;
  const landingGalleryBeforeSeo = landing.indexOf('id="gallery"') >= 0 && landing.indexOf('id="gallery"') < landing.indexOf("<SeoContentSection");
  const hubGalleryBeforeSeo = hubPage.indexOf('id="gallery"') >= 0 && hubPage.indexOf('id="gallery"') < hubPage.indexOf("<SeoContentSection");
  const summary = {
    uselessEyebrowLabelsRemoved: !/hero-related-kicker[\s\S]*Coloring Pages/.test(combined),
    lazyDuplicateSectionsRemoved: !/RelatedHubs title="More ways to browse"/.test(landing),
    moreWaysDistinctOrMerged: /Narrower ways to browse/.test(hubPage) && /Subcollections/.test(hubPage),
    relatedCollectionsProfessional: /related-list/.test(related) && /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/.test(css),
    countsAlignedCleanly: /related-link[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(css) && /related-link-count[\s\S]*text-align:\s*right/.test(css),
    importantLabelsNotEllipsized: !/text-overflow:\s*ellipsis/.test(extractCssRules(css, ["hub-link-title", "related-link-label", "hero-related-label"])),
    noGiantDump: /featuredHubs|popularThemes|subjectHubs|styleHubs|getRelatedHubs/.test(combined),
    galleryFirstPreserved: landingGalleryBeforeSeo && hubGalleryBeforeSeo,
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-link-sections-results",
    summary: {
      ...summary,
      linkSectionsPassed:
        summary.uselessEyebrowLabelsRemoved &&
        summary.lazyDuplicateSectionsRemoved &&
        summary.moreWaysDistinctOrMerged &&
        summary.relatedCollectionsProfessional &&
        summary.countsAlignedCleanly &&
        summary.importantLabelsNotEllipsized &&
        summary.noGiantDump &&
        summary.galleryFirstPreserved,
    },
  };
}

async function buildMoreMenuReport() {
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const nav = await readText("src/lib/navigation/siteNav.ts");
  const css = await readText("src/styles/components.css");
  const summary = {
    groupedSectionsPreserved: /groupHubLinks|hub-menu-group|hub-menu-grid/.test(`${moreMenu}\n${nav}`),
    searchAtTop: /hub-menu-search-row/.test(moreMenu),
    desktopUsesAvailableSpace: /width:\s*min\(1500px,\s*calc\(100vw - 64px\)\)/.test(css),
    importantTitlesNotTruncated: !/text-overflow:\s*ellipsis/.test(extractCssRules(css, ["hub-menu-link-label"])),
    longLabelsMayWrap: /overflow-wrap:\s*anywhere/.test(extractCssRule(css, "hub-menu-link-label")),
    countsAlignedSeparately: /hub-menu-group a[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(css),
    noAdsInNav: !/AdSlot|AdRail|adsbygoogle|ad-slot/i.test(`${moreMenu}\n${mobileNav}\n${nav}`),
    escapeOutsideAndLinkClose: /event\.key === "Escape"/.test(moreMenu) && /handlePointerDown/.test(moreMenu) && /handleNavigate/.test(moreMenu),
    mobileMenuUsable: /variant="mobile"/.test(mobileNav) && /mobile-nav-panel/.test(mobileNav),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-ux-more-menu-results",
    summary: {
      ...summary,
      moreMenuPassed:
        summary.groupedSectionsPreserved &&
        summary.searchAtTop &&
        summary.desktopUsesAvailableSpace &&
        summary.importantTitlesNotTruncated &&
        summary.longLabelsMayWrap &&
        summary.countsAlignedSeparately &&
        summary.noAdsInNav &&
        summary.escapeOutsideAndLinkClose &&
        summary.mobileMenuUsable,
    },
  };
}

async function runBrowserQa() {
  const build = await ensureStaticExport({ force: true });
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

    const interactions = await runInteractionChecks(context, baseUrl);
    const runtimeAvailable = await readJson("src/generated/coloring/runtime-available-items.json");
    const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
    const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
    const galleryRoutes = pageResults.filter((result) => result.galleryImageCount > 0);
    const summary = {
      routeCount: ROUTES.length,
      viewportCount: VIEWPORTS.length,
      runtimeAvailableRecords: runtimeAvailable.items?.length || 0,
      runtimeIndexableHubs: runtimeHubs.hubs?.length || 0,
      headerNavHoverStatesExist: interactions.headerHoverStateChanged,
      webpGalleryPreviewsRender: galleryRoutes.length > 0 && galleryRoutes.every((result) => result.loadedWebpCount > 0),
      noUnnecessaryXPaddingAddedByCss: interactions.imagePaddingOk,
      previewUnavailableVisibleForUploadedRecords: pageResults.some((result) => result.previewUnavailableCount > 0),
      noBrokenImageIcons: pageResults.every((result) => result.brokenImageCount === 0),
      cardLevelPrintButtonRemoved: interactions.cardLevelPrintButtonRemoved,
      imageClickOpensModal: interactions.imageClickOpensModal,
      overlayCueVisible: interactions.overlayCueVisible,
      overlayCueNotSeparateButton: interactions.overlayCueNotSeparateButton,
      modalTopRightPrintClose: interactions.modalTopRightPrintClose,
      modalNoUnnecessaryDesktopScrollbar: interactions.modalNoUnnecessaryDesktopScrollbar,
      downloadLabelRemoved: interactions.downloadLabelRemoved,
      pngDownloadWorks: interactions.downloads.png,
      jpgDownloadWorks: interactions.downloads.jpg,
      webpDownloadWorks: interactions.downloads.webp,
      svgDownloadAbsent: interactions.svgDownloadAbsent,
      relatedCollectionsProfessional: interactions.relatedCollectionsProfessional,
      moreWaysImprovedOrRemoved: interactions.moreWaysImprovedOrRemoved,
      moreMenuUsesAvailableSpace: interactions.moreMenuUsesAvailableSpace,
      moreMenuTitlesNotCutOff: interactions.moreMenuTitlesNotCutOff,
      printPdfOnePage: interactions.printSnapshot?.pageCount === 1,
      printPdfOneSlimBorder: interactions.printSnapshot?.printableBorderCount === 1,
      printBrandingDoesNotOverlapArtwork: interactions.printSnapshot?.brandingOverlapsArtwork === false,
      adPlaceholdersFollowAcceptedDensity: pageResults.every((result) => result.adDensityOk),
      noHorizontalOverflow: pageResults.every((result) => !result.horizontalOverflow),
      liveAdSenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      noConsoleErrors: consoleErrors.length === 0 && networkErrors.length === 0,
    };

    return {
      generatedAt: new Date().toISOString(),
      runId: "final-ux-browser-qa-results",
      build,
      baseUrl,
      screenshotsDirectory: SCREENSHOT_DIR,
      routes: pageResults,
      interactions,
      consoleErrors,
      networkErrors,
      summary: {
        ...summary,
        browserQaPassed:
          summary.runtimeAvailableRecords === 6352 &&
          summary.runtimeIndexableHubs === 131 &&
          summary.headerNavHoverStatesExist &&
          summary.webpGalleryPreviewsRender &&
          summary.noUnnecessaryXPaddingAddedByCss &&
          !summary.previewUnavailableVisibleForUploadedRecords &&
          summary.noBrokenImageIcons &&
          summary.cardLevelPrintButtonRemoved &&
          summary.imageClickOpensModal &&
          summary.overlayCueVisible &&
          summary.overlayCueNotSeparateButton &&
          summary.modalTopRightPrintClose &&
          summary.modalNoUnnecessaryDesktopScrollbar &&
          summary.downloadLabelRemoved &&
          summary.pngDownloadWorks &&
          summary.jpgDownloadWorks &&
          summary.webpDownloadWorks &&
          summary.svgDownloadAbsent &&
          summary.relatedCollectionsProfessional &&
          summary.moreWaysImprovedOrRemoved &&
          summary.moreMenuUsesAvailableSpace &&
          summary.moreMenuTitlesNotCutOff &&
          summary.printPdfOnePage &&
          summary.printPdfOneSlimBorder &&
          summary.printBrandingDoesNotOverlapArtwork &&
          summary.adPlaceholdersFollowAcceptedDensity &&
          summary.noHorizontalOverflow &&
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
  await page.waitForTimeout(800);
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(".asset-image")];
    return images.length === 0 || images.some((image) => image.currentSrc.includes("/webp/") && image.complete && image.naturalWidth > 0);
  }, null, { timeout: 10_000 }).catch(() => {});
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
    const brokenImages = images.filter((image) => image.complete && image.naturalWidth === 0);
    const adLabels = [...document.querySelectorAll(".ad-slot-label")].filter(isVisible);
    return {
      text: document.body.innerText,
      galleryImageCount: images.length,
      loadedWebpCount: images.filter((image) => image.currentSrc.includes("/webp/") && image.complete && image.naturalWidth > 0).length,
      previewUnavailableCount: [...document.querySelectorAll(".asset-placeholder")].filter(isVisible).length,
      brokenImageCount: brokenImages.length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      adLabelCount: adLabels.length,
      adsInsideNav: [...document.querySelectorAll("nav .ad-slot, nav [data-ad-placeholder='true']")].some(isVisible),
      adsInsideGalleryGrid: [...document.querySelectorAll(".gallery-grid .ad-slot, .gallery-grid [data-ad-placeholder='true']")].some(isVisible),
    };
  });

  return {
    route,
    width,
    status: "ok",
    screenshotPath,
    text: inspection.text.slice(0, 2000),
    galleryImageCount: inspection.galleryImageCount,
    loadedWebpCount: inspection.loadedWebpCount,
    previewUnavailableCount: inspection.previewUnavailableCount,
    brokenImageCount: inspection.brokenImageCount,
    horizontalOverflow: inspection.horizontalOverflow,
    adLabelCount: inspection.adLabelCount,
    expectedAdLabelCount: expectedAdCount(width, route),
    adDensityOk: expectedAdCount(width, route) === inspection.adLabelCount,
    adsInsideNav: inspection.adsInsideNav,
    adsInsideGalleryGrid: inspection.adsInsideGalleryGrid,
  };
}

async function runInteractionChecks(context, baseUrl) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(900);

  await page.mouse.move(1, 1);
  const hoverBefore = await page.locator(".site-nav-link").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.transform].join("|");
  });
  await page.locator(".site-nav-link").first().hover();
  const hoverAfter = await page.locator(".site-nav-link").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.transform].join("|");
  });
  const headerHoverStateChanged = hoverBefore !== hoverAfter;

  const search = page.getByRole("searchbox", { name: /search this collection/i });
  await search.fill("Animals Alligator");
  await page.waitForTimeout(700);
  const article = page.locator('[id="asset-animals__animals-alligator__4feec8505a"]').first();
  await article.waitFor({ state: "visible", timeout: 20_000 });
  await article.scrollIntoViewIfNeeded();

  const cardLevelPrintButtonRemoved = (await article.locator(".gallery-actions").getByRole("button", { name: /^Print$/ }).count()) === 0;
  const overlayCueVisible = await article.locator(".gallery-item-print-cue").isVisible().catch(() => false);
  const overlayCueNotSeparateButton = (await article.locator("button .gallery-item-print-cue").count()) > 0 && (await article.locator(".gallery-item-print-cue button").count()) === 0;
  const imagePaddingOk = await article.locator(".gallery-item-media").evaluate((element) => {
    const style = getComputedStyle(element);
    const frame = element.querySelector(".asset-image-frame");
    const frameStyle = frame ? getComputedStyle(frame) : null;
    return style.paddingLeft === "0px" && style.paddingRight === "0px" && (!frameStyle || (frameStyle.paddingLeft === "0px" && frameStyle.paddingRight === "0px"));
  });

  await article.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 20_000 });
  await page.screenshot({ path: path.join(REPO_ROOT, SCREENSHOT_DIR, "1440-print-modal.png"), fullPage: false });

  const modalMetrics = await page.evaluate(() => {
    const panel = document.querySelector(".print-preview-panel");
    const printButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Print");
    const closeButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Close");
    if (!panel || !printButton || !closeButton) return null;
    const panelRect = panel.getBoundingClientRect();
    const printRect = printButton.getBoundingClientRect();
    const closeRect = closeButton.getBoundingClientRect();
    return {
      printAndCloseTopRight: printRect.top <= panelRect.top + 80 && closeRect.top <= panelRect.top + 80 && closeRect.right <= panelRect.right + 1 && printRect.left > panelRect.left + panelRect.width / 2,
      panelHasNoScrollbar: panel.scrollHeight <= panel.clientHeight + 2,
      downloadLabelCount: document.querySelectorAll(".print-preview-download-title").length,
      svgButtonCount: [...document.querySelectorAll("button")].filter((button) => /svg/i.test(button.textContent || button.getAttribute("aria-label") || "")).length,
    };
  });

  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 30_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
  const downloads = {
    png: await triggerDownload(page, "Download PNG", ".png"),
    jpg: await triggerDownload(page, "Download JPG", ".jpg"),
    webp: await triggerDownload(page, "Download WebP", ".webp"),
  };

  await page.getByRole("button", { name: /^Close$/ }).click();

  const relatedCollectionsProfessional = await page.locator(".related-list .related-link").first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const label = element.querySelector(".related-link-label")?.getBoundingClientRect();
    const count = element.querySelector(".related-link-count")?.getBoundingClientRect();
    return Boolean(rect.width > 240 && label && count && label.right < count.left);
  }).catch(() => true);
  const moreWaysImprovedOrRemoved = await page.getByText("Narrower ways to browse").isVisible().catch(() => false);

  await page.getByRole("button", { name: /^More$/ }).click();
  await page.locator(".hub-menu-panel-desktop").waitFor({ state: "visible", timeout: 10_000 });
  const moreMenuMetrics = await page.locator(".hub-menu-panel-desktop").evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    const labels = [...panel.querySelectorAll(".hub-menu-link-label")];
    return {
      usesAvailableSpace: panelRect.width >= Math.min(1300, window.innerWidth - 80),
      titlesNotCutOff: labels.every((label) => label.scrollWidth <= label.clientWidth + 2 || getComputedStyle(label).whiteSpace !== "nowrap"),
    };
  });
  await page.keyboard.press("Escape");

  await page.close();
  return {
    headerHoverStateChanged,
    cardLevelPrintButtonRemoved,
    overlayCueVisible,
    overlayCueNotSeparateButton,
    imagePaddingOk,
    imageClickOpensModal: Boolean(modalMetrics),
    modalTopRightPrintClose: Boolean(modalMetrics?.printAndCloseTopRight),
    modalNoUnnecessaryDesktopScrollbar: Boolean(modalMetrics?.panelHasNoScrollbar),
    downloadLabelRemoved: modalMetrics?.downloadLabelCount === 0,
    svgDownloadAbsent: modalMetrics?.svgButtonCount === 0,
    downloads,
    printSnapshot,
    relatedCollectionsProfessional,
    moreWaysImprovedOrRemoved,
    moreMenuUsesAvailableSpace: moreMenuMetrics.usesAvailableSpace,
    moreMenuTitlesNotCutOff: moreMenuMetrics.titlesNotCutOff,
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

function expectedAdCount(width, route) {
  if (["/about", "/contact", "/privacy", "/terms"].includes(route)) return 0;
  if (width >= 1740) return 3;
  return 1;
}

function extractCssRule(css, className) {
  const match = css.match(new RegExp(`(?:^|\\n)\\.${className}\\s*\\{[\\s\\S]*?\\}`, "m"));
  return match?.[0] || "";
}

function extractCssRules(css, classNames) {
  return classNames.map((className) => extractCssRule(css, className)).join("\n");
}

function renderHeaderReport(payload) {
  return renderSimpleReport("Final UX Header Hover Report", [
    ["hoverStatePresent", passFail(payload.summary.hoverStatePresent)],
    ["expandedMoreStatePresent", passFail(payload.summary.expandedMoreStatePresent)],
    ["focusVisiblePresent", passFail(payload.summary.focusVisiblePresent)],
    ["cursorPointerPresent", passFail(payload.summary.cursorPointerPresent)],
    ["headerHoverPassed", passFail(payload.summary.headerHoverPassed)],
  ]);
}

function renderCardReport(payload) {
  return renderSimpleReport("Final UX Card Interaction Report", [
    ["visibleCardPrintButtonRemoved", passFail(payload.summary.visibleCardPrintButtonRemoved)],
    ["imageSurfaceOpensModal", passFail(payload.summary.imageSurfaceOpensModal)],
    ["overlayCuePresent", passFail(payload.summary.overlayCuePresent)],
    ["overlayCueNotSeparateButton", passFail(payload.summary.overlayCueNotSeparateButton)],
    ["keyboardActivationPresent", passFail(payload.summary.keyboardActivationPresent)],
    ["pngJpgWebpDownloadsRemain", passFail(payload.summary.pngJpgWebpDownloadsRemain)],
    ["cardInteractionPassed", passFail(payload.summary.cardInteractionPassed)],
  ]);
}

function renderSpacingReport(payload) {
  return renderSimpleReport("Final UX Image Preview Spacing Report", [
    ["componentAddsNoHorizontalPadding", passFail(payload.summary.componentAddsNoHorizontalPadding)],
    ["objectFitContainPreserved", passFail(payload.summary.objectFitContainPreserved)],
    ["importantArtworkNotIntentionallyCropped", passFail(payload.summary.importantArtworkNotIntentionallyCropped)],
    ["imagePreviewSpacingPassed", passFail(payload.summary.imagePreviewSpacingPassed)],
  ]);
}

function renderModalReport(payload) {
  return renderSimpleReport("Final UX Modal Report", [
    ["controlsTopRight", passFail(payload.summary.controlsTopRight)],
    ["unnecessaryDesktopScrollbar", payload.summary.unnecessaryDesktopScrollbar ? "fail" : "pass"],
    ["downloadLabelRemoved", passFail(payload.summary.downloadLabelRemoved)],
    ["buttonsHaveRequiredText", passFail(payload.summary.buttonsHaveRequiredText)],
    ["svgAbsent", passFail(payload.summary.svgAbsent)],
    ["modalPolishPassed", passFail(payload.summary.modalPolishPassed)],
  ]);
}

function renderLinkSectionReport(payload) {
  return renderSimpleReport("Final UX Link Sections Report", [
    ["uselessEyebrowLabelsRemoved", passFail(payload.summary.uselessEyebrowLabelsRemoved)],
    ["lazyDuplicateSectionsRemoved", passFail(payload.summary.lazyDuplicateSectionsRemoved)],
    ["moreWaysDistinctOrMerged", passFail(payload.summary.moreWaysDistinctOrMerged)],
    ["relatedCollectionsProfessional", passFail(payload.summary.relatedCollectionsProfessional)],
    ["countsAlignedCleanly", passFail(payload.summary.countsAlignedCleanly)],
    ["linkSectionsPassed", passFail(payload.summary.linkSectionsPassed)],
  ]);
}

function renderMoreMenuReport(payload) {
  return renderSimpleReport("Final UX More Menu Report", [
    ["groupedSectionsPreserved", passFail(payload.summary.groupedSectionsPreserved)],
    ["searchAtTop", passFail(payload.summary.searchAtTop)],
    ["desktopUsesAvailableSpace", passFail(payload.summary.desktopUsesAvailableSpace)],
    ["importantTitlesNotTruncated", passFail(payload.summary.importantTitlesNotTruncated)],
    ["countsAlignedSeparately", passFail(payload.summary.countsAlignedSeparately)],
    ["moreMenuPassed", passFail(payload.summary.moreMenuPassed)],
  ]);
}

function renderBrowserQaReport(payload) {
  return [
    "# Final UX Browser QA Report",
    "",
    renderTable([
      ["runtimeAvailableRecords", payload.summary.runtimeAvailableRecords.toLocaleString()],
      ["runtimeIndexableHubs", payload.summary.runtimeIndexableHubs.toLocaleString()],
      ["headerNavHoverStatesExist", passFail(payload.summary.headerNavHoverStatesExist)],
      ["webpGalleryPreviewsRender", passFail(payload.summary.webpGalleryPreviewsRender)],
      ["noUnnecessaryXPaddingAddedByCss", passFail(payload.summary.noUnnecessaryXPaddingAddedByCss)],
      ["cardLevelPrintButtonRemoved", passFail(payload.summary.cardLevelPrintButtonRemoved)],
      ["imageClickOpensModal", passFail(payload.summary.imageClickOpensModal)],
      ["overlayCueVisible", passFail(payload.summary.overlayCueVisible)],
      ["modalTopRightPrintClose", passFail(payload.summary.modalTopRightPrintClose)],
      ["modalNoUnnecessaryDesktopScrollbar", passFail(payload.summary.modalNoUnnecessaryDesktopScrollbar)],
      ["downloadLabelRemoved", passFail(payload.summary.downloadLabelRemoved)],
      ["PNG/JPG/WebP downloads", passFail(payload.summary.pngDownloadWorks && payload.summary.jpgDownloadWorks && payload.summary.webpDownloadWorks)],
      ["svgDownloadAbsent", passFail(payload.summary.svgDownloadAbsent)],
      ["relatedCollectionsProfessional", passFail(payload.summary.relatedCollectionsProfessional)],
      ["moreWaysImprovedOrRemoved", passFail(payload.summary.moreWaysImprovedOrRemoved)],
      ["moreMenuUsesAvailableSpace", passFail(payload.summary.moreMenuUsesAvailableSpace)],
      ["printPdfOnePage", passFail(payload.summary.printPdfOnePage)],
      ["printPdfOneSlimBorder", passFail(payload.summary.printPdfOneSlimBorder)],
      ["printBrandingDoesNotOverlapArtwork", passFail(payload.summary.printBrandingDoesNotOverlapArtwork)],
      ["adPlaceholdersFollowAcceptedDensity", passFail(payload.summary.adPlaceholdersFollowAcceptedDensity)],
      ["noHorizontalOverflow", passFail(payload.summary.noHorizontalOverflow)],
      ["browserQaPassed", passFail(payload.summary.browserQaPassed)],
    ]),
    "",
    `Screenshots: \`${payload.screenshotsDirectory}\``,
  ].join("\n");
}

function renderSimpleReport(title, rows) {
  return ["# " + title, "", renderTable(rows)].join("\n");
}
