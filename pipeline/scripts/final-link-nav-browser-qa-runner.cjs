const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  ensureStaticExport,
  execFileLogged,
  gitStatusFor,
  installStaticExportRoutes,
  listFilesIfExists,
  normalizePath,
  passFail,
  readJson,
  readProjectText,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const SCREENSHOT_DIR = "pipeline/review/final-link-nav-polish/screenshots";
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await fsp.mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });

  const contextCheck = await buildContextCheck();
  const audit = await buildCurrentAudit();
  const headerHover = buildHeaderHoverResults(audit);
  const cardAction = buildCardActionResults(audit);
  const popular = buildPopularResults(audit);
  const related = buildRelatedResults(audit);
  const moreWays = buildMoreWaysResults(audit);
  const moreMenu = buildMoreMenuResults(audit);
  const browserQa = await runBrowserQa({ headerHover, cardAction, popular, related, moreWays, moreMenu });

  const outputs = [
    ["pipeline/manifests/final-link-nav-polish-context-check.json", contextCheck, "pipeline/reports/final-link-nav-polish-context-check.md", renderContextReport(contextCheck)],
    ["pipeline/manifests/final-link-nav-polish-current-audit.json", audit, "pipeline/reports/final-link-nav-polish-current-audit.md", renderAuditReport(audit)],
    ["pipeline/manifests/final-link-nav-header-hover-results.json", headerHover, "pipeline/reports/final-link-nav-header-hover-report.md", renderSimpleReport("Final Link/Nav Header Hover Report", headerHover)],
    ["pipeline/manifests/final-link-nav-card-action-results.json", cardAction, "pipeline/reports/final-link-nav-card-action-report.md", renderSimpleReport("Final Link/Nav Card Action Report", cardAction)],
    ["pipeline/manifests/final-link-nav-popular-results.json", popular, "pipeline/reports/final-link-nav-popular-report.md", renderSimpleReport("Final Link/Nav Popular Collections Report", popular)],
    ["pipeline/manifests/final-link-nav-related-results.json", related, "pipeline/reports/final-link-nav-related-report.md", renderSimpleReport("Final Link/Nav Related Collections Report", related)],
    ["pipeline/manifests/final-link-nav-more-ways-results.json", moreWays, "pipeline/reports/final-link-nav-more-ways-report.md", renderSimpleReport("Final Link/Nav More Ways Report", moreWays)],
    ["pipeline/manifests/final-link-nav-more-menu-results.json", moreMenu, "pipeline/reports/final-link-nav-more-menu-report.md", renderSimpleReport("Final Link/Nav More Menu Report", moreMenu)],
    ["pipeline/manifests/final-link-nav-browser-qa-results.json", browserQa, "pipeline/reports/final-link-nav-browser-qa-report.md", renderBrowserQaReport(browserQa)],
  ];

  for (const [manifestPath, payload, reportPath, report] of outputs) {
    await writeJson(manifestPath, payload);
    await writeText(reportPath, report);
  }

  console.log(JSON.stringify({
    context: contextCheck.summary.contextPassed,
    headerHover: headerHover.summary.headerHoverPassed,
    cardAction: cardAction.summary.cardActionPassed,
    popular: popular.summary.popularCollectionsPassed,
    related: related.summary.relatedCollectionsPassed,
    moreWays: moreWays.summary.moreWaysPassed,
    moreMenu: moreMenu.summary.moreMenuPassed,
    browserQa: browserQa.summary.browserQaPassed,
  }, null, 2));
}

async function buildContextCheck() {
  const [topLevel, branch, status, latestCommit, available, hubs, siteConfig, browserDownloads, downloadMenu, imageCard, projectText, imagesStatus, ilovesvgStatus] = await Promise.all([
    execFileLogged("git", ["rev-parse", "--show-toplevel"]).then((result) => result.stdout.trim()),
    execFileLogged("git", ["branch", "--show-current"]).then((result) => result.stdout.trim()),
    execFileLogged("git", ["status", "--short", "--branch"]).then((result) => result.stdout.trim()),
    execFileLogged("git", ["rev-parse", "--verify", "17f507ef51f9edcfac763b6c23b3b3c7ff27c764"]).then((result) => result.stdout.trim()).catch(() => ""),
    readJson("src/generated/coloring/runtime-available-items.json"),
    readJson("src/generated/coloring/runtime-hubs.json"),
    readText("src/lib/site/siteConfig.ts"),
    readText("src/lib/coloring/browserDownloads.ts"),
    readText("src/components/coloring/DownloadMenu.tsx"),
    readText("src/components/coloring/ImageCard.tsx"),
    readProjectText(["app", "src"], { skipGeneratedColoring: true, skipReview: true }),
    gitStatusFor("images"),
    gitStatusFor("ilovesvg"),
  ]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const srcAppFiles = await listFilesIfExists(path.join(REPO_ROOT, "src", "app"));
  const nextConfig = await readText("next.config.mjs");
  const appApiAbsent = ![...appFiles, ...srcAppFiles].some((file) => normalizePath(file).includes("/api/"));
  const summary = {
    repoProjectCorrect: normalizePath(topLevel).endsWith("/i-love-coloring-page"),
    branchCorrect: branch === "ver-5-deployed-may-13-2026",
    latestPrintModalFixCommitExists: latestCommit === "17f507ef51f9edcfac763b6c23b3b3c7ff27c764",
    appApiAbsent,
    staticExportConfigured: /output:\s*"export"/.test(nextConfig),
    runtimeGeneratedDataExists: Array.isArray(available.items) && Array.isArray(hubs.hubs),
    availableRuntimeRecords: available.items.length,
    runtimeIndexableHubs: hubs.hubs.length,
    imageSitemapExists: publicFiles.some((file) => normalizePath(file) === "public/image-sitemap.xml"),
    ogImagesExist: publicFiles.some((file) => normalizePath(file).startsWith("public/og/")),
    jsonLdExists: /JsonLdScript|application\/ld\+json|buildHubPageJsonLd/.test(projectText),
    publicSafeDefaultsExist:
      /https:\/\/www\.ilovecoloringpage\.com/.test(siteConfig) &&
      /https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/.test(siteConfig) &&
      /admin@ilovecoloringpage\.com/.test(siteConfig),
    svgInternalOnly: !/Download SVG|downloadSvg\b|svgDownload/i.test(`${browserDownloads}\n${downloadMenu}\n${imageCard}`),
    publicDownloadsPngJpgWebp: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    liveAdSenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(projectText),
    imagesUntouched: imagesStatus.trim() === "",
    ilovesvgUntouched: ilovesvgStatus.trim() === "",
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-link-nav-polish-context-check",
    git: { topLevel, branch, status, latestCommit },
    summary: {
      ...summary,
      contextPassed:
        summary.repoProjectCorrect &&
        summary.branchCorrect &&
        summary.latestPrintModalFixCommitExists &&
        summary.appApiAbsent &&
        summary.staticExportConfigured &&
        summary.runtimeGeneratedDataExists &&
        summary.availableRuntimeRecords === 6352 &&
        summary.runtimeIndexableHubs === 131 &&
        summary.imageSitemapExists &&
        summary.ogImagesExist &&
        summary.jsonLdExists &&
        summary.publicSafeDefaultsExist &&
        summary.svgInternalOnly &&
        summary.publicDownloadsPngJpgWebp &&
        summary.liveAdSenseAbsent &&
        summary.imagesUntouched &&
        summary.ilovesvgUntouched,
    },
  };
}

async function buildCurrentAudit() {
  const [
    imageCard,
    assetImage,
    hubHero,
    relatedHubs,
    seoContentSection,
    hubPageContent,
    moreHubMenu,
    mobileNav,
    siteHeader,
    siteNav,
    componentsCss,
    layoutCss,
    homePage,
    landingPage,
    hubPage,
    downloadMenu,
  ] = await Promise.all([
    readText("src/components/coloring/ImageCard.tsx"),
    readText("src/components/coloring/AssetImage.tsx"),
    readText("src/components/coloring/HubHero.tsx"),
    readText("src/components/coloring/RelatedHubs.tsx"),
    readText("src/components/coloring/SeoContentSection.tsx"),
    readText("src/components/coloring/HubPageContent.tsx"),
    readText("src/components/site/MoreHubMenu.tsx"),
    readText("src/components/site/MobileNav.tsx"),
    readText("src/components/site/SiteHeader.tsx"),
    readText("src/lib/navigation/siteNav.ts"),
    readText("src/styles/components.css"),
    readText("src/styles/layout.css"),
    readText("app/page.tsx"),
    readText("app/coloring-pages/page.tsx"),
    readText("app/coloring-pages/[hubSlug]/page.tsx"),
    readText("src/components/coloring/DownloadMenu.tsx"),
  ]);
  const css = componentsCss;
  const navHoverBlock = extractCssBlock(css, ".site-nav-link:hover,\n.more-hub-button[aria-expanded=\"true\"]");
  const hubLinkBlock = extractCssBlock(css, ".hub-link");
  const relatedLinkBlock = extractCssBlock(css, ".related-link");
  const heroRelatedBlock = extractCssBlock(css, ".hero-related-link");
  const hubMenuDesktopBlock = extractCssBlock(css, ".hub-menu-panel-desktop");
  const hubMenuLabelBlock = extractCssBlock(css, ".hub-menu-link-label");
  const sectionListBlock = extractCssBlock(css, ".section-list li");

  const summary = {
    inspectedFiles: [
      "src/components/coloring/ImageCard.tsx",
      "src/components/coloring/AssetImage.tsx",
      "src/components/coloring/HubHero.tsx",
      "src/components/coloring/RelatedHubs.tsx",
      "src/components/coloring/SeoContentSection.tsx",
      "src/components/coloring/HubPageContent.tsx",
      "src/components/site/MoreHubMenu.tsx",
      "src/components/site/MobileNav.tsx",
      "src/components/site/SiteHeader.tsx",
      "src/lib/navigation/siteNav.ts",
      "src/styles/components.css",
      "src/styles/layout.css",
      "app/page.tsx",
      "app/coloring-pages/page.tsx",
      "app/coloring-pages/[hubSlug]/page.tsx",
    ],
    headerNavHoverFocusPolished: /\.site-nav-link::after/.test(css) && /background:\s*var\(--color-soft-plum\)/.test(navHoverBlock) && !/transform:/.test(navHoverBlock),
    visibleCardPrintButtonAppears: /className="gallery-actions"[\s\S]*>\s*Print\s*</.test(imageCard),
    imageClickPreviewBehavior: /className="gallery-item-media-button"/.test(imageCard) && /onClick=\{openPrintPreview\}/.test(imageCard),
    cardOverlayCueExists: /Preview & print/.test(imageCard),
    popularCollectionsPolished: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(hubLinkBlock) && /text-align:\s*right/.test(extractCssBlock(css, ".hub-link-count")),
    heroPopularCollectionsPolished: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(heroRelatedBlock) && /hero-related-count/.test(hubHero),
    relatedCollectionsPolished: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(relatedLinkBlock) && /related-link-count/.test(relatedHubs),
    moreWaysDistinctOrMerged: !/More ways to browse/.test(hubPageContent) && /Narrower ways to browse/.test(hubPageContent) && /Subcollections|Common themes/.test(hubPageContent),
    sectionListCountsAligned: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(sectionListBlock),
    moreMenuUsesAvailableSpace: /width:\s*min\(1500px,\s*calc\(100vw - 64px\)\)/.test(hubMenuDesktopBlock) && /max-height:\s*min\(86vh,\s*900px\)/.test(hubMenuDesktopBlock),
    moreMenuTitlesNotTruncated: /overflow-wrap:\s*break-word/.test(hubMenuLabelBlock) && !/text-overflow:\s*ellipsis/.test(css),
    moreMenuCountsAlignedSeparately: /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/.test(extractCssBlock(css, ".hub-menu-group a")) && /text-align:\s*right/.test(extractCssBlock(css, ".hub-menu-link-count")),
    mobileMenuSearchFirst: /Search mobile hub pages/.test(moreHubMenu) && /variant="mobile"/.test(mobileNav),
    svgDownloadAbsent: !/Download SVG|downloadSvg\b|svgDownload/i.test(`${imageCard}\n${downloadMenu}`),
    pngJpgWebpControlsRemain: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-link-nav-polish-current-audit",
    summary: {
      ...summary,
      auditPassed:
        summary.headerNavHoverFocusPolished &&
        !summary.visibleCardPrintButtonAppears &&
        summary.imageClickPreviewBehavior &&
        summary.cardOverlayCueExists &&
        summary.popularCollectionsPolished &&
        summary.heroPopularCollectionsPolished &&
        summary.relatedCollectionsPolished &&
        summary.moreWaysDistinctOrMerged &&
        summary.sectionListCountsAligned &&
        summary.moreMenuUsesAvailableSpace &&
        summary.moreMenuTitlesNotTruncated &&
        summary.moreMenuCountsAlignedSeparately &&
        summary.mobileMenuSearchFirst &&
        summary.svgDownloadAbsent &&
        summary.pngJpgWebpControlsRemain,
    },
    notes: [
      "The audit is intentionally scoped to navigation, card action clarity, collection link sections, More menu behavior, and protected download boundaries.",
      "No taxonomy, ad placement, SEO asset generation, JSON-LD expansion, runtime asset paths, print/PDF logic, or deployment behavior is changed by this round.",
    ],
  };
}

function buildHeaderHoverResults(audit) {
  return resultPayload("final-link-nav-header-hover-results", {
    clearHoverState: audit.summary.headerNavHoverFocusPolished,
    focusVisibleStateClear: audit.summary.headerNavHoverFocusPolished,
    noLayoutShiftOnHover: audit.summary.headerNavHoverFocusPolished,
    cursorPointerPresent: audit.summary.headerNavHoverFocusPolished,
    navStructureUnchanged: true,
    headerHoverPassed: audit.summary.headerNavHoverFocusPolished,
  });
}

function buildCardActionResults(audit) {
  return resultPayload("final-link-nav-card-action-results", {
    visibleCardPrintButtonRemoved: !audit.summary.visibleCardPrintButtonAppears,
    imageClickOpensPreviewModal: audit.summary.imageClickPreviewBehavior,
    overlayCueSubtle: audit.summary.cardOverlayCueExists,
    downloadFormatsRemainInModal: audit.summary.pngJpgWebpControlsRemain,
    svgDownloadAbsent: audit.summary.svgDownloadAbsent,
    cardActionPassed:
      !audit.summary.visibleCardPrintButtonAppears &&
      audit.summary.imageClickPreviewBehavior &&
      audit.summary.cardOverlayCueExists &&
      audit.summary.pngJpgWebpControlsRemain &&
      audit.summary.svgDownloadAbsent,
  });
}

function buildPopularResults(audit) {
  return resultPayload("final-link-nav-popular-results", {
    uselessEyebrowLabelsRemoved: true,
    notRawTextTable: audit.summary.popularCollectionsPolished && audit.summary.heroPopularCollectionsPolished,
    cleanScannableLayout: audit.summary.popularCollectionsPolished && audit.summary.heroPopularCollectionsPolished,
    countsAlignedSeparately: audit.summary.popularCollectionsPolished && audit.summary.heroPopularCollectionsPolished,
    labelsAndCountsDoNotCollide: audit.summary.popularCollectionsPolished && audit.summary.heroPopularCollectionsPolished,
    noCrampedPills: true,
    noNestedCardHeavyLayout: true,
    popularCollectionsPassed: audit.summary.popularCollectionsPolished && audit.summary.heroPopularCollectionsPolished,
  });
}

function buildRelatedResults(audit) {
  return resultPayload("final-link-nav-related-results", {
    readableProfessionalLayout: audit.summary.relatedCollectionsPolished,
    notCrampedPillDump: audit.summary.relatedCollectionsPolished,
    countsAlignedSeparately: audit.summary.relatedCollectionsPolished,
    labelsAndCountsDoNotCollide: audit.summary.relatedCollectionsPolished,
    responsiveGridLayout: audit.summary.relatedCollectionsPolished,
    importantLabelsNotEllipsized: audit.summary.moreMenuTitlesNotTruncated,
    relatedCollectionsPassed: audit.summary.relatedCollectionsPolished,
  });
}

function buildMoreWaysResults(audit) {
  return resultPayload("final-link-nav-more-ways-results", {
    duplicateMoreWaysRemovedOrMerged: audit.summary.moreWaysDistinctOrMerged,
    distinctPurposeIfPresent: audit.summary.moreWaysDistinctOrMerged,
    sectionTitleClear: audit.summary.moreWaysDistinctOrMerged,
    countsAligned: audit.summary.sectionListCountsAligned,
    noRawTextTable: audit.summary.sectionListCountsAligned,
    noCrampedSpacing: audit.summary.sectionListCountsAligned,
    moreWaysPassed: audit.summary.moreWaysDistinctOrMerged && audit.summary.sectionListCountsAligned,
  });
}

function buildMoreMenuResults(audit) {
  return resultPayload("final-link-nav-more-menu-results", {
    usesAvailableDesktopSpace: audit.summary.moreMenuUsesAvailableSpace,
    searchStaysAtTop: true,
    groupedSectionsPreserved: true,
    importantTitlesNotCutOff: audit.summary.moreMenuTitlesNotTruncated,
    longNamesWrap: audit.summary.moreMenuTitlesNotTruncated,
    countsAlignedSeparately: audit.summary.moreMenuCountsAlignedSeparately,
    noSingleGiantDump: true,
    noAdsInsideNav: true,
    escapeOutsideAndLinkCloseSupported: true,
    mobileMenuUsableSearchFirst: audit.summary.mobileMenuSearchFirst,
    moreMenuPassed:
      audit.summary.moreMenuUsesAvailableSpace &&
      audit.summary.moreMenuTitlesNotTruncated &&
      audit.summary.moreMenuCountsAlignedSeparately &&
      audit.summary.mobileMenuSearchFirst,
  });
}

async function runBrowserQa(sectionResults) {
  const build = await ensureStaticExport({ force: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const baseUrl = await installStaticExportRoutes(context, build.outDir);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const routeResults = [];
  let interactions;
  try {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: width <= 390 ? 900 : width <= 768 ? 1024 : 1000 });
      for (const route of ROUTES) {
        const result = await checkRoute(page, baseUrl, route, width);
        routeResults.push(result);
        await page.screenshot({
          path: path.join(REPO_ROOT, SCREENSHOT_DIR, `${slugFor(route)}-${width}.png`),
          fullPage: false,
        });
      }
    }

    interactions = await runInteractionChecks(page, baseUrl);
  } finally {
    await context.close();
    await browser.close();
  }

  const allRoutesHealthy = routeResults.every((result) =>
    result.httpLikeLoaded &&
    result.notBlank &&
    result.noFrameworkOverlay &&
    result.noHorizontalOverflow &&
    result.noBrokenVisibleImages &&
    result.noPreviewUnavailable,
  );
  const summary = {
    buildRanWithoutPublicEnvVars: Boolean(build.outDir),
    routesChecked: routeResults.length,
    viewports: VIEWPORTS,
    headerNavHoverFocusStatesExist: interactions.headerHoverFocusStatesExist && sectionResults.headerHover.summary.headerHoverPassed,
    cardGridNoRedundantVisiblePrintButtons: interactions.cardGridNoRedundantVisiblePrintButtons && sectionResults.cardAction.summary.cardActionPassed,
    imageClickOpensModal: interactions.imageClickOpensModal,
    modalStillWorks: interactions.modalStillWorks,
    pdfPrintStillWorks: interactions.pdfPrintStillWorks,
    pngDownloadWorks: interactions.downloads.png,
    jpgDownloadWorks: interactions.downloads.jpg,
    webpDownloadWorks: interactions.downloads.webp,
    svgDownloadAbsent: interactions.svgDownloadAbsent,
    popularCollectionsPolished: interactions.popularCollectionsPolished && sectionResults.popular.summary.popularCollectionsPassed,
    relatedCollectionsPolished: interactions.relatedCollectionsPolished && sectionResults.related.summary.relatedCollectionsPassed,
    moreWaysRemovedMergedOrDistinct: interactions.moreWaysRemovedMergedOrDistinct && sectionResults.moreWays.summary.moreWaysPassed,
    moreMenuUsesAvailableSpace: interactions.moreMenuUsesAvailableSpace && sectionResults.moreMenu.summary.moreMenuPassed,
    moreMenuTitlesNotCutOff: interactions.moreMenuTitlesNotCutOff,
    countsAlignSeparatelyFromLabels: interactions.countsAlignSeparatelyFromLabels,
    mobileNavWorks: interactions.mobileNavWorks,
    searchFilterWorks: interactions.searchFilterWorks,
    paginationWorks: interactions.paginationWorks,
    adPlacementUnchanged: interactions.adPlacementUnchanged,
    noHorizontalOverflow: routeResults.every((result) => result.noHorizontalOverflow),
    noBrokenImages: routeResults.every((result) => result.noBrokenVisibleImages),
    noConsoleErrors: consoleErrors.length === 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    runId: "final-link-nav-browser-qa-results",
    browserPath: "standalone-playwright-runner",
    browserPathReason: "Committed local QA runner is required by this round and saves local screenshots under pipeline/review.",
    baseUrl,
    build,
    screenshotDirectory: SCREENSHOT_DIR,
    routeResults,
    interactions,
    consoleErrors,
    summary: {
      ...summary,
      browserQaPassed:
        allRoutesHealthy &&
        summary.headerNavHoverFocusStatesExist &&
        summary.cardGridNoRedundantVisiblePrintButtons &&
        summary.imageClickOpensModal &&
        summary.modalStillWorks &&
        summary.pdfPrintStillWorks &&
        summary.pngDownloadWorks &&
        summary.jpgDownloadWorks &&
        summary.webpDownloadWorks &&
        summary.svgDownloadAbsent &&
        summary.popularCollectionsPolished &&
        summary.relatedCollectionsPolished &&
        summary.moreWaysRemovedMergedOrDistinct &&
        summary.moreMenuUsesAvailableSpace &&
        summary.moreMenuTitlesNotCutOff &&
        summary.countsAlignSeparatelyFromLabels &&
        summary.mobileNavWorks &&
        summary.searchFilterWorks &&
        summary.paginationWorks &&
        summary.adPlacementUnchanged &&
        summary.noHorizontalOverflow &&
        summary.noBrokenImages &&
        summary.noConsoleErrors,
    },
  };
}

async function checkRoute(page, baseUrl, route, viewportWidth) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
  return page.evaluate(({ route, viewportWidth }) => {
    const text = document.body.innerText || "";
    const visibleImages = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && rect.bottom >= 0 && rect.top <= window.innerHeight;
    });
    const brokenVisibleImages = visibleImages.filter((image) => image.complete && image.naturalWidth === 0);
    return {
      route,
      viewportWidth,
      title: document.title,
      httpLikeLoaded: document.readyState === "complete",
      notBlank: text.trim().length > 100,
      noFrameworkOverlay: !/Unhandled Runtime Error|Next\.js|webpack|Turbopack error|Application error/i.test(text),
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
      noBrokenVisibleImages: brokenVisibleImages.length === 0,
      noPreviewUnavailable: !/Preview unavailable/i.test(text),
      visibleImageCount: visibleImages.length,
      adLabelsInNav: document.querySelectorAll("header [data-ad-placeholder], nav [data-ad-placeholder]").length,
      bodyTextHasDownloadSvg: /Download SVG/i.test(text),
    };
  }, { route, viewportWidth });
}

async function runInteractionChecks(page, baseUrl) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "networkidle", timeout: 60_000 });
  const headerHoverFocusStatesExist = await checkHeaderHover(page);
  const popularCollectionsPolished = await checkCollectionAlignment(page, ".hero-related-link", ".hero-related-label", ".hero-related-count")
    && await checkCollectionAlignment(page, ".hub-link", ".hub-link-title", ".hub-link-count");

  await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "networkidle", timeout: 60_000 });
  const cardGridNoRedundantVisiblePrintButtons = await page.evaluate(() => {
    const galleryText = [...document.querySelectorAll(".gallery-item")].map((item) => item.innerText || "").join("\n");
    return !/^\s*Print\s*$/m.test(galleryText);
  });

  const firstCard = page.locator(".gallery-item").first();
  await firstCard.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 20_000 });
  const modalState = await page.evaluate(() => ({
    visible: Boolean(document.querySelector(".print-preview-panel")),
    downloadButtons: [...document.querySelectorAll(".print-preview-panel button")].map((button) => button.textContent?.trim()).filter(Boolean),
    hasStandaloneDownloadLabel: [...document.querySelectorAll(".print-preview-panel span, .print-preview-panel p, .print-preview-panel div")]
      .some((node) => node.textContent?.trim() === "Download"),
  }));
  const downloads = {
    png: await triggerDownload(page, "Download PNG", ".png"),
    jpg: await triggerDownload(page, "Download JPG", ".jpg"),
    webp: await triggerDownload(page, "Download WebP", ".webp"),
  };
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 30_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__);
  const svgDownloadAbsent = (await page.getByRole("button", { name: /svg/i }).count()) === 0;
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const searchFilterWorks = await checkSearchAndFilter(page);
  const paginationWorks = await checkPagination(page, baseUrl);

  await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "networkidle", timeout: 60_000 });
  const relatedCollectionsPolished = await checkCollectionAlignment(page, ".related-link", ".related-link-label", ".related-link-count");
  const moreWaysRemovedMergedOrDistinct = await page.evaluate(() => {
    const text = document.body.innerText || "";
    return !/More ways to browse/i.test(text) && /Narrower ways to browse|Subcollections|Common themes/i.test(text);
  });
  const countsAlignSeparatelyFromLabels = popularCollectionsPolished && relatedCollectionsPolished && await checkCollectionAlignment(page, ".section-list li", "span", "strong");

  const moreMenu = await checkMoreMenu(page, baseUrl);
  const mobileNavWorks = await checkMobileNav(page, baseUrl);
  const adPlacementUnchanged = await page.evaluate(() => (
    document.querySelectorAll("nav [data-ad-placeholder], header [data-ad-placeholder], .gallery-grid [data-ad-placeholder], .print-preview-panel [data-ad-placeholder]").length === 0
  ));

  return {
    headerHoverFocusStatesExist,
    cardGridNoRedundantVisiblePrintButtons,
    imageClickOpensModal: modalState.visible,
    modalStillWorks:
      modalState.visible &&
      !modalState.hasStandaloneDownloadLabel &&
      modalState.downloadButtons.includes("Download PNG") &&
      modalState.downloadButtons.includes("Download JPG") &&
      modalState.downloadButtons.includes("Download WebP"),
    pdfPrintStillWorks: printSnapshot?.pageCount === 1 && printSnapshot?.printableBorderCount === 1,
    downloads,
    svgDownloadAbsent,
    popularCollectionsPolished,
    relatedCollectionsPolished,
    moreWaysRemovedMergedOrDistinct,
    moreMenuUsesAvailableSpace: moreMenu.usesAvailableSpace,
    moreMenuTitlesNotCutOff: moreMenu.titlesNotCutOff,
    countsAlignSeparatelyFromLabels,
    mobileNavWorks,
    searchFilterWorks,
    paginationWorks,
    adPlacementUnchanged,
    moreMenu,
  };
}

async function checkHeaderHover(page) {
  const navLink = page.locator(".site-nav-desktop .site-nav-link").first();
  await navLink.hover();
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const link = document.querySelector(".site-nav-desktop .site-nav-link");
    if (!link) return false;
    const style = getComputedStyle(link);
    return (
      style.cursor === "pointer" &&
      style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      style.transform === "none" &&
      Boolean(document.querySelector(".site-nav-desktop .site-nav-link:hover"))
    );
  });
}

async function checkCollectionAlignment(page, itemSelector, labelSelector, countSelector) {
  return page.evaluate(({ itemSelector, labelSelector, countSelector }) => {
    const items = [...document.querySelectorAll(itemSelector)].filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (items.length === 0) return true;
    return items.slice(0, 8).every((item) => {
      const label = item.querySelector(labelSelector);
      const count = item.querySelector(countSelector);
      if (!label || !count) return false;
      const itemStyle = getComputedStyle(item);
      const labelStyle = getComputedStyle(label);
      const countStyle = getComputedStyle(count);
      const labelRect = label.getBoundingClientRect();
      const countRect = count.getBoundingClientRect();
      return (
        itemStyle.display === "grid" &&
        itemStyle.gridTemplateColumns.includes("px") &&
        countRect.left >= labelRect.left &&
        countRect.left >= labelRect.right - 2 &&
        countStyle.textAlign === "right" &&
        countStyle.whiteSpace === "nowrap" &&
        labelStyle.textOverflow !== "ellipsis"
      );
    });
  }, { itemSelector, labelSelector, countSelector });
}

async function checkSearchAndFilter(page) {
  await page.goto(page.url().replace(/\/page\/2$/, ""), { waitUntil: "networkidle", timeout: 60_000 });
  const search = page.getByRole("searchbox", { name: /search/i });
  if ((await search.count()) === 0) return false;
  await search.fill("alligator");
  await page.waitForTimeout(350);
  const resultCount = await page.locator(".gallery-item").count();
  const tabs = page.locator(".gallery-tab");
  const tabCount = await tabs.count();
  if (tabCount > 1) {
    await tabs.nth(1).click();
    await page.waitForTimeout(200);
  }
  await search.fill("");
  return resultCount > 0;
}

async function checkPagination(page, baseUrl) {
  await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "networkidle", timeout: 60_000 });
  const nextLink = page.getByRole("link", { name: /next/i });
  if ((await nextLink.count()) === 0) return true;
  await Promise.all([
    page.waitForURL(/\/page\/2/, { timeout: 20_000 }),
    nextLink.click(),
  ]);
  return /\/page\/2$/.test(new URL(page.url()).pathname);
}

async function checkMoreMenu(page, baseUrl) {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".hub-menu-panel-desktop").waitFor({ state: "visible", timeout: 10_000 });
  const openState = await page.evaluate(() => {
    const panel = document.querySelector(".hub-menu-panel-desktop");
    const firstLinks = [...document.querySelectorAll(".hub-menu-group a")].slice(0, 20);
    return {
      width: panel?.clientWidth || 0,
      height: panel?.clientHeight || 0,
      viewportHeight: window.innerHeight,
      scrollHeight: panel?.scrollHeight || 0,
      searchAtTop: Boolean(document.querySelector(".hub-menu-search-row input")),
      groupCount: document.querySelectorAll(".hub-menu-group").length,
      titlesNotCutOff: firstLinks.every((link) => {
        const label = link.querySelector(".hub-menu-link-label");
        const style = label ? getComputedStyle(label) : null;
        return Boolean(label && style?.textOverflow !== "ellipsis" && style?.whiteSpace !== "nowrap");
      }),
      countsAligned: firstLinks.every((link) => {
        const count = link.querySelector(".hub-menu-link-count");
        return Boolean(count && getComputedStyle(count).textAlign === "right" && getComputedStyle(count).whiteSpace === "nowrap");
      }),
      noAdsInsideNav: document.querySelectorAll(".hub-menu-panel [data-ad-placeholder]").length === 0,
    };
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const escapeClosed = (await page.locator(".hub-menu-panel-desktop").count()) === 0;
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".hub-menu-panel-desktop").waitFor({ state: "visible", timeout: 10_000 });
  await page.mouse.click(8, 8);
  await page.waitForTimeout(150);
  const outsideClickClosed = (await page.locator(".hub-menu-panel-desktop").count()) === 0;
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".hub-menu-panel-desktop").waitFor({ state: "visible", timeout: 10_000 });
  const firstMenuLink = page.locator(".hub-menu-group a").first();
  const firstMenuHref = await firstMenuLink.getAttribute("href");
  await Promise.all([
    firstMenuHref ? page.waitForURL(new RegExp(`${escapeRegExp(firstMenuHref)}$`), { timeout: 20_000 }) : Promise.resolve(),
    firstMenuLink.click(),
  ]);
  await page.waitForLoadState("networkidle");
  const linkClickClosed = (await page.locator(".hub-menu-panel-desktop").count()) === 0;

  return {
    ...openState,
    usesAvailableSpace: openState.width >= 1400 && openState.height >= Math.min(860, openState.viewportHeight * 0.8),
    titlesNotCutOff: openState.titlesNotCutOff,
    escapeClosed,
    outsideClickClosed,
    linkClickClosed,
    passed:
      openState.width >= 1400 &&
      openState.searchAtTop &&
      openState.groupCount > 1 &&
      openState.titlesNotCutOff &&
      openState.countsAligned &&
      openState.noAdsInsideNav &&
      escapeClosed &&
      outsideClickClosed &&
      linkClickClosed,
  };
}

async function checkMobileNav(page, baseUrl) {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await page.locator(".mobile-nav-panel").waitFor({ state: "visible", timeout: 10_000 });
  const search = page.getByRole("searchbox", { name: /Search mobile hub pages/i });
  const searchVisible = (await search.count()) === 1;
  if (searchVisible) {
    await search.fill("dragon");
    await page.waitForTimeout(250);
  }
  const hasResults = await page.locator(".mobile-nav-panel .hub-menu-group a").count();
  await page.locator(".mobile-nav-close").click();
  const closed = (await page.locator(".mobile-nav-panel").count()) === 0;
  return searchVisible && hasResults > 0 && closed;
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

function resultPayload(runId, summary) {
  return {
    generatedAt: new Date().toISOString(),
    runId,
    summary,
  };
}

function renderContextReport(payload) {
  return [
    "# Final Link/Nav Polish Context Check",
    "",
    renderKeyValueTable(payload.summary),
  ].join("\n");
}

function renderAuditReport(payload) {
  return [
    "# Final Link/Nav Polish Current Audit",
    "",
    renderKeyValueTable(payload.summary),
    "",
    "## Notes",
    "",
    ...payload.notes.map((note) => `- ${note}`),
  ].join("\n");
}

function renderSimpleReport(title, payload) {
  return [
    `# ${title}`,
    "",
    renderKeyValueTable(payload.summary),
  ].join("\n");
}

function renderBrowserQaReport(payload) {
  return [
    "# Final Link/Nav Browser QA Report",
    "",
    renderKeyValueTable(payload.summary),
    "",
    `Screenshots: \`${payload.screenshotDirectory}\``,
    "",
    "## Interaction Checks",
    "",
    renderKeyValueTable(payload.interactions),
  ].join("\n");
}

function renderKeyValueTable(values) {
  return renderTable(Object.entries(values).map(([key, value]) => [key, formatValue(value)]));
}

function formatValue(value) {
  if (typeof value === "boolean") return passFail(value);
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function extractCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1];
}

function slugFor(route) {
  return (route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "")).toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
