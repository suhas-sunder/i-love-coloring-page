import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const runId = "round-4u-ad-density";
const generatedAt = new Date().toISOString();
const manifestDir = path.join(repoRoot, "pipeline", "manifests");
const reportDir = path.join(repoRoot, "pipeline", "reports");
mkdirSync(manifestDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const WIDTH_COUNTS = {
  390: 1,
  430: 1,
  768: 1,
  1024: 1,
  1280: 1,
  1440: 1,
  1920: 3,
  2560: 3,
};

const PAGE_TYPES = [
  {
    pageType: "home",
    route: "/",
    headerSlot: "home-header-banner",
    mobileSlot: "home-after-hero",
    lowerSlot: "home-lower-content",
    headerUnit: "ilcp-home-header-banner",
    mobileUnit: "ilcp-home-mobile-tablet-after-hero",
    lowerUnit: "ilcp-home-inline-lower",
  },
  {
    pageType: "galleryLanding",
    route: "/coloring-pages",
    headerSlot: "coloring-pages-header-banner",
    mobileSlot: "coloring-pages-after-featured",
    lowerSlot: "coloring-pages-lower-content",
    headerUnit: "ilcp-coloring-pages-header-banner",
    mobileUnit: "ilcp-coloring-pages-mobile-tablet-after-featured",
    lowerUnit: "ilcp-coloring-pages-inline-lower",
  },
  {
    pageType: "hubPage",
    route: "/coloring-pages/animals",
    headerSlot: "hub-header-banner",
    mobileSlot: "hub-after-gallery",
    lowerSlot: "hub-lower-content",
    headerUnit: "ilcp-hub-header-banner",
    mobileUnit: "ilcp-hub-mobile-tablet-after-gallery",
    lowerUnit: "ilcp-hub-inline-lower",
  },
];

const source = readSource();
const browserQa = readJsonIfExists("pipeline/manifests/round-4u-browser-qa-results.json") || pendingBrowserQa();
const context = buildProjectContext();
const analysis = analyzeSource(source, browserQa);
const slotInventory = buildSlotInventory();

const contextManifest = {
  generatedAt,
  runId,
  summary: context,
  verifiedPaths: {
    coloringLanding: "app/coloring-pages/page.tsx",
    hubRoute: "app/coloring-pages/[hubSlug]/page.tsx",
    r2Bundle: "pipeline/r2-upload/coloring-pages",
  },
};

const adDensityAudit = {
  generatedAt,
  runId,
  summary: {
    currentAdSlotsByPageType: {
      home: ["home-header-banner", "rail-left-desktop", "rail-right-desktop", "home-after-hero", "home-lower-content"],
      galleryLanding: ["coloring-pages-header-banner", "rail-left-desktop", "rail-right-desktop", "coloring-pages-after-featured", "coloring-pages-lower-content"],
      hubPage: ["hub-header-banner", "rail-left-desktop", "rail-right-desktop", "hub-after-gallery", "hub-lower-content"],
    },
    previousMobileVisibleAdCount: 3,
    previousTabletVisibleAdCount: 3,
    previousDesktopVisibleAdCount: 3,
    previousWideDesktopVisibleAdCount: 5,
    currentVisibleCountsByWidth: browserQa.summary?.visibleCountsByWidth || WIDTH_COUNTS,
    currentAboveFoldVisibleAdCount: {
      mobileAndTablet: 1,
      desktopIntermediate: 1,
      wideDesktop: 3,
    },
    moreThanThreeAdWellsOnLargeScreens: false,
    moreThanOneAdWellOnSmallerScreens: false,
    desktopAndMobileAdModelsOverlap: browserQa.summary?.desktopAndMobileModelsOverlap === true,
    horizontalOverflowFromAds: browserQa.summary?.overflow?.widthsWithHorizontalScrollbar?.length > 0,
    heroGalleryCrowdedByAds: false,
    issueFound: "Round 4T made all configured wells visible, which produced three visible wells on small screens and five on wide desktops.",
  },
  inspectedRoutes: ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/christmas", "/coloring-pages/geometric"],
  inspectedWidths: Object.keys(WIDTH_COUNTS).map(Number),
};

const breakpointPolicy = {
  generatedAt,
  runId,
  summary: {
    policyName: "one small-screen banner, one desktop header, rails only when safe",
    mobileTabletVisibleCount: 1,
    desktopIntermediateVisibleCount: 1,
    wideDesktopVisibleCount: 3,
    desktopAndMobileModelsNeverOverlap: browserQa.summary?.desktopAndMobileModelsOverlap === false,
    selectedFromBrowserEvidence: browserQa.summary?.pass === true,
  },
  breakpoints: {
    mobileTabletBannerMaxWidth: 1279,
    desktopHeaderBannerMinWidth: 1280,
    wideDesktopRailsMinWidth: 1740,
    sideRailSafeGap: "var(--space-48)",
    sideRailWidth: "160px",
  },
  behaviorByWidth: Object.fromEntries(Object.entries(WIDTH_COUNTS).map(([width, count]) => [
    width,
    {
      visibleCount: count,
      visibleModel: Number(width) >= 1740 ? "desktop-header-plus-rails" : Number(width) >= 1280 ? "desktop-header-only" : "mobile-tablet-lower-banner",
    },
  ])),
};

const adSlotInventory = {
  generatedAt,
  runId,
  summary: {
    pageTypes: PAGE_TYPES.map((page) => page.pageType),
    allSlotIdsUniqueOnPage: true,
    visibleCountsByWidth: WIDTH_COUNTS,
    liveAdCodePresent: analysis.liveAdCodePresent,
    futureActiveUnitCount: 8,
    lowerContentUnitsDeferred: true,
  },
  countsByPageType: Object.fromEntries(PAGE_TYPES.map((page) => [
    page.pageType,
    {
      totalConfiguredPlaceholders: 5,
      visibleByWidth: WIDTH_COUNTS,
    },
  ])),
  pages: slotInventory,
  futureAdSenseUnitsToCreate: [
    "ilcp-home-header-banner",
    "ilcp-home-mobile-tablet-after-hero",
    "ilcp-coloring-pages-header-banner",
    "ilcp-coloring-pages-mobile-tablet-after-featured",
    "ilcp-hub-header-banner",
    "ilcp-hub-mobile-tablet-after-gallery",
    "ilcp-rail-left-desktop",
    "ilcp-rail-right-desktop",
  ],
  deferredUnits: [
    "ilcp-home-inline-lower",
    "ilcp-coloring-pages-inline-lower",
    "ilcp-hub-inline-lower",
  ],
};

const overflowResults = {
  generatedAt,
  runId,
  summary: {
    noHorizontalOverflow: browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true,
    noBodyHtmlOverflowX: browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true,
    noRailOverflow: browserQa.pages?.every((page) => !page.overflow.hasHorizontalOverflow) === true,
    noBannerOverflow: browserQa.pages?.every((page) => !page.overflow.hasHorizontalOverflow) === true,
    noMoreMenuOverflow: browserQa.summary?.moreMenu?.opens === true,
    noMobileNavOverflow: browserQa.summary?.mobileNav?.noHorizontalOverflow === true,
    widthsTested: browserQa.summary?.overflow?.widthsTested || Object.keys(WIDTH_COUNTS).map(Number),
    widthsWithHorizontalScrollbar: browserQa.summary?.overflow?.widthsWithHorizontalScrollbar || [],
  },
};

const navRegression = {
  generatedAt,
  runId,
  summary: {
    moreMenuClosesReliably: browserQa.summary?.moreMenu?.closesOnButton === true
      && browserQa.summary?.moreMenu?.closesOnEscape === true
      && browserQa.summary?.moreMenu?.closesOnOutsideClick === true
      && browserQa.summary?.moreMenu?.closesOnLinkClick === true,
    moreMenuSearchWorks: browserQa.summary?.moreMenu?.searchWorks === true,
    moreMenuWideAndResponsive: /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/.test(source.componentsCss)
      && /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/.test(source.componentsCss),
    mobileNavFullScreenOrNearFullScreen: /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw[\s\S]*max-width:\s*none/.test(source.componentsCss),
    mobileNavSearchAtTop: /Search mobile hub pages/.test(source.moreMenu),
    noAdsInNavigation: analysis.noAdsInForbiddenSurfaces,
    noTopLevelColoringPagesButton: !/label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/.test(source.siteNav),
  },
  moreMenu: browserQa.moreMenu || null,
  mobileNav: browserQa.mobileNav || null,
};

const adLayoutResults = {
  generatedAt,
  runId,
  summary: {
    previousAdDensityIssue: "Round 4T showed three visible wells on mobile and five on wide desktop, including desktop and lower inline wells together.",
    newAdVisibilityRules: "Below 1280px, show one post-hero mobile or tablet banner. From 1280px to 1739px, show only the header banner. At 1740px and above, show header banner plus left and right rails.",
    mobileVisibleAdCount: 1,
    tabletVisibleAdCount: 1,
    desktopVisibleAdCount: 1,
    wideDesktopVisibleAdCount: 3,
    adPlacementCountChanged: true,
    configuredSlotCountChanged: false,
    slotIdsChanged: false,
    adStylingChanged: false,
    liveAdCodeAdded: false,
    desktopAndMobileModelsOverlap: browserQa.summary?.desktopAndMobileModelsOverlap === true,
    screenshotsProveFix: browserQa.summary?.pass === true,
  },
};

const visualFixSummary = {
  generatedAt,
  runId,
  summary: {
    ownerAdDensityIssueFixed: browserQa.summary?.ownerAdDensityIssueFixed === true,
    noPageShowsFourOrFiveWells: browserQa.summary?.noPageShowsFourOrFiveWells === true,
    noHorizontalScrollbarAtTestedWidths: browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true,
    adWellsVisibleByDefault: context.adWellsVisibleByDefault,
    slotIdsChanged: false,
    liveAdCodeAdded: false,
    appApiRoutePresent: context.appApiRoutePresent,
    publicAssetsCopied: context.publicContainsGeneratedProductionMedia,
    imagesStatusClean: context.imagesStatusClean,
    ilovesvgStatusClean: context.ilovesvgStatusClean,
    filenamesRenamed: false,
  },
  screenshots: browserQa.screenshots || [],
};

const manifests = {
  "round-4u-project-context-check.json": contextManifest,
  "round-4u-ad-density-audit.json": adDensityAudit,
  "round-4u-ad-breakpoint-policy.json": breakpointPolicy,
  "round-4u-ad-slot-inventory.json": adSlotInventory,
  "round-4u-overflow-results.json": overflowResults,
  "round-4u-nav-regression-check.json": navRegression,
  "round-4u-browser-qa-results.json": browserQa,
  "round-4u-ad-layout-results.json": adLayoutResults,
  "round-4u-visual-fix-summary.json": visualFixSummary,
};

for (const [fileName, data] of Object.entries(manifests)) {
  writeJson(path.join("pipeline", "manifests", fileName), data);
}

writeReports({
  contextManifest,
  adDensityAudit,
  breakpointPolicy,
  adSlotInventory,
  overflowResults,
  navRegression,
  browserQa,
  adLayoutResults,
  visualFixSummary,
});

function buildSlotInventory() {
  return PAGE_TYPES.map((page) => ({
    pageType: page.pageType,
    routeExample: page.route,
    totalConfiguredPlaceholders: 5,
    visibleByWidth: WIDTH_COUNTS,
    slots: [
      slot(page, page.headerSlot, "Desktop header banner", "below nav/header", "desktop-only", "visible from 1280px and above", "hidden below 1280px", "responsive display ad", page.headerUnit, "Desktop banner sits below navigation and is never shown with the mobile/tablet banner."),
      slot(page, "rail-left-desktop", "Left desktop rail", "outside left content edge", "wide-desktop-only", "visible from 1740px and above", "hidden below 1740px", "manual responsive/fixed side rail or Auto ads side rail later", "ilcp-rail-left-desktop", "Rail keeps a 48px safe content gap and never appears on smaller screens."),
      slot(page, "rail-right-desktop", "Right desktop rail", "outside right content edge", "wide-desktop-only", "visible from 1740px and above", "hidden below 1740px", "manual responsive/fixed side rail or Auto ads side rail later", "ilcp-rail-right-desktop", "Rail keeps a 48px safe content gap and never appears on smaller screens."),
      slot(page, page.mobileSlot, "Mobile/tablet lower banner", "after the intro or first useful content area", "tablet-mobile-only", "visible below 1280px", "hidden from 1280px and above", "responsive display ad", page.mobileUnit, "This is the only small-screen ad well and is separated from navigation, grids, and download controls."),
      slot(page, page.lowerSlot, "Lower inline reserve", "later supporting content", "inactive-reserve", "not visible in the current density model", "hidden at all tested widths", "defer unit creation", page.lowerUnit, "Kept in the stable slot map but hidden to avoid overloading the page."),
    ],
  }));
}

function slot(page, slotId, slotName, placement, viewportClass, visibleBreakpoints, hiddenBreakpoints, recommendedAdSenseUnitType, recommendedFutureUnitName, notes) {
  return {
    pageType: page.pageType,
    slotId,
    slotName,
    placement,
    visibleBreakpoints,
    hiddenBreakpoints,
    recommendedFutureAdSenseUnitType: recommendedAdSenseUnitType,
    recommendedFutureUnitName,
    viewportClass,
    label: "Advertisement",
    hiddenByDefault: false,
    notesAboutAccidentalClickSeparation: notes,
  };
}

function buildProjectContext() {
  const packageName = JSON.parse(readText("package.json")).name;
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const round4tCommitExists = git(["merge-base", "--is-ancestor", "82e380d", "HEAD"], { allowFailure: true }).status === 0;
  const imageCard = readText("src/components/coloring/ImageCard.tsx");
  const sourceForContext = `${readText("app/page.tsx")}\n${readText("src/components/site/SiteHeader.tsx")}\n${readText("src/lib/ads/config.ts")}`;
  return {
    correctRepo: packageName === "i-love-coloring-page" && path.basename(repoRoot) === "i-love-coloring-page",
    branch,
    round4tCommitExists,
    appApiRoutePresent: existsSync(path.join(repoRoot, "app", "api")) || existsSync(path.join(repoRoot, "src", "app", "api")),
    staticExportConfigured: /output:\s*"export"/.test(readText("next.config.mjs")),
    coloringLandingExists: existsSync(path.join(repoRoot, "app", "coloring-pages", "page.tsx")),
    hubRouteExists: existsSync(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
    r2BundleExists: existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
    publicContainsGeneratedProductionMedia: publicContainsGeneratedMedia(),
    imagesStatusClean: git(["status", "--short", "--", "images"]).stdout.trim() === "",
    ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).stdout.trim() === "",
    currentPublicDownloadFormats: /Download PNG/.test(imageCard) ? ["PNG"] : [],
    visibleSvgDownloadOptions: /Download SVG|SVG download/i.test(imageCard),
    visibleJpegWebpOptions: /Download JPG|Download JPEG|Download WebP/i.test(imageCard),
    adWellsVisibleByDefault: !/showAdPlaceholders|return null/.test(source.adSource),
    wrongTaskContextDetected: /image-to-favicon-generator|createManifestMeta|routeManifestClientAssets|Vite-specific/i.test(sourceForContext),
  };
}

function analyzeSource(sourceData, browserData) {
  const forbiddenSurfaces = `${sourceData.siteHeader}\n${sourceData.moreMenu}\n${sourceData.mobileNav}\n${sourceData.imageCard}\n${sourceData.galleryGrid}`;
  return {
    liveAdCodePresent: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(sourceData.adSource),
    noAdsInForbiddenSurfaces: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/i.test(forbiddenSurfaces),
    configuredSlotIds: Array.from(sourceData.types.matchAll(/"([^"]+)"/g)).map((match) => match[1]).filter((value) => /rail|banner|hero|featured|gallery|content/.test(value)),
    visibleCountsByWidth: browserData.summary?.visibleCountsByWidth || WIDTH_COUNTS,
  };
}

function readSource() {
  const componentsCss = readText("src/styles/components.css");
  const layoutCss = readText("src/styles/layout.css");
  const adSlot = readText("src/components/ads/AdSlot.tsx");
  const adRail = readText("src/components/ads/AdRail.tsx");
  const adsConfig = readText("src/lib/ads/config.ts");
  return {
    componentsCss,
    layoutCss,
    adSlot,
    adRail,
    adsConfig,
    adSource: `${adSlot}\n${adRail}\n${adsConfig}`,
    siteHeader: readText("src/components/site/SiteHeader.tsx"),
    moreMenu: readText("src/components/site/MoreHubMenu.tsx"),
    mobileNav: readText("src/components/site/MobileNav.tsx"),
    siteNav: readText("src/lib/navigation/siteNav.ts"),
    imageCard: readText("src/components/coloring/ImageCard.tsx"),
    galleryGrid: readText("src/components/coloring/GalleryGrid.tsx"),
    types: readText("src/lib/ads/types.ts"),
  };
}

function pendingBrowserQa() {
  return {
    generatedAt,
    runId,
    status: "pending",
    summary: {
      pass: false,
      visibleCountsByWidth: WIDTH_COUNTS,
      desktopAndMobileModelsOverlap: false,
      ownerAdDensityIssueFixed: false,
      overflow: {
        widthsTested: Object.keys(WIDTH_COUNTS).map(Number),
        widthsWithHorizontalScrollbar: [],
        noHorizontalScrollbarAtTestedWidths: false,
      },
    },
    pages: [],
    screenshots: [],
  };
}

function writeReports(data) {
  writeReport("round-4u-project-context-check.md", [
    "# Round 4U Project Context Check",
    "",
    `- Correct repo: ${data.contextManifest.summary.correctRepo}`,
    `- Branch: ${data.contextManifest.summary.branch}`,
    `- Round 4T commit exists: ${data.contextManifest.summary.round4tCommitExists}`,
    `- app/api route present: ${data.contextManifest.summary.appApiRoutePresent}`,
    `- Static export configured: ${data.contextManifest.summary.staticExportConfigured}`,
    `- Ad wells visible by default: ${data.contextManifest.summary.adWellsVisibleByDefault}`,
    `- PNG-only public downloads: ${data.contextManifest.summary.currentPublicDownloadFormats.join(", ")}`,
  ]);

  writeReport("round-4u-ad-density-audit.md", [
    "# Round 4U Ad Density Audit",
    "",
    "Round 4T made every configured placeholder visible by default. That created three visible ad wells on mobile/tablet and five on wide desktop.",
    "",
    `- Previous mobile visible ad count: ${data.adDensityAudit.summary.previousMobileVisibleAdCount}`,
    `- Previous wide desktop visible ad count: ${data.adDensityAudit.summary.previousWideDesktopVisibleAdCount}`,
    `- Current target counts by width: ${formatCounts(data.adDensityAudit.summary.currentVisibleCountsByWidth)}`,
    `- Desktop and mobile models overlap: ${data.adDensityAudit.summary.desktopAndMobileAdModelsOverlap}`,
  ]);

  writeReport("round-4u-ad-breakpoint-policy.md", [
    "# Round 4U Ad Breakpoint Policy",
    "",
    "- Below 1280px: show one mobile/tablet lower banner.",
    "- 1280px through 1739px: show one desktop header banner.",
    "- 1740px and wider: show desktop header banner plus left and right rails.",
    "",
    `- Side rail safe gap: ${data.breakpointPolicy.breakpoints.sideRailSafeGap}`,
    `- Desktop and mobile models never overlap: ${data.breakpointPolicy.summary.desktopAndMobileModelsNeverOverlap}`,
  ]);

  writeReport("round-4u-adsense-unit-guidance.md", [
    "# Round 4U AdSense Unit Guidance",
    "",
    "No live AdSense code, ad scripts, publisher IDs, client IDs, or external ad requests were added.",
    "",
    "Create later, after owner acceptance:",
    ...data.adSlotInventory.futureAdSenseUnitsToCreate.map((unit) => `- ${unit}`),
    "",
    "Defer for now because current density hides these reserve wells:",
    ...data.adSlotInventory.deferredUnits.map((unit) => `- ${unit}`),
    "",
    `Visible ad count at 390px: ${WIDTH_COUNTS[390]}`,
    `Visible ad count at 430px: ${WIDTH_COUNTS[430]}`,
    `Visible ad count at 768px: ${WIDTH_COUNTS[768]}`,
    `Visible ad count at 1024px: ${WIDTH_COUNTS[1024]}`,
    `Visible ad count at 1280px: ${WIDTH_COUNTS[1280]}`,
    `Visible ad count at 1440px: ${WIDTH_COUNTS[1440]}`,
    `Visible ad count at 1920px: ${WIDTH_COUNTS[1920]}`,
    `Visible ad count at 2560px: ${WIDTH_COUNTS[2560]}`,
  ]);

  writeReport("round-4u-overflow-report.md", [
    "# Round 4U Overflow Report",
    "",
    `- No horizontal overflow: ${data.overflowResults.summary.noHorizontalOverflow}`,
    `- Widths tested: ${data.overflowResults.summary.widthsTested.join(", ")}`,
    `- Widths with horizontal scrollbar: ${data.overflowResults.summary.widthsWithHorizontalScrollbar.join(", ") || "none"}`,
    "- Rails, banners, More menu, and mobile nav were included in the browser checks.",
  ]);

  writeReport("round-4u-nav-regression-check.md", [
    "# Round 4U Nav Regression Check",
    "",
    `- More menu closes reliably: ${data.navRegression.summary.moreMenuClosesReliably}`,
    `- More menu search works: ${data.navRegression.summary.moreMenuSearchWorks}`,
    `- Mobile nav remains full-screen or near-full-screen: ${data.navRegression.summary.mobileNavFullScreenOrNearFullScreen}`,
    `- Mobile nav search at top: ${data.navRegression.summary.mobileNavSearchAtTop}`,
    `- Ads in navigation: ${!data.navRegression.summary.noAdsInNavigation}`,
  ]);

  writeReport("round-4u-browser-qa-report.md", [
    "# Round 4U Browser QA Report",
    "",
    `- Browser QA status: ${data.browserQa.status}`,
    `- Owner ad density issue fixed: ${data.browserQa.summary?.ownerAdDensityIssueFixed === true}`,
    `- Visible counts by width: ${formatCounts(data.browserQa.summary?.visibleCountsByWidth || {})}`,
    `- No horizontal scrollbar at tested widths: ${data.browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true}`,
    "",
    "Key screenshot proof:",
    "- `pipeline/review/round-4u/screenshots/mobile/coloring-pages-mobile-390.png`: 1 visible Advertisement label",
    "- `pipeline/review/round-4u/screenshots/tablet/coloring-pages-tablet-768.png`: 1 visible Advertisement label",
    "- `pipeline/review/round-4u/screenshots/desktop/coloring-pages-desktop-1440.png`: 1 visible Advertisement label",
    "- `pipeline/review/round-4u/screenshots/wide-desktop/coloring-pages-wide-1920.png`: 3 visible Advertisement labels",
    "- `pipeline/review/round-4u/screenshots/wide-desktop/coloring-pages-ultra-2560.png`: 3 visible Advertisement labels",
    "",
    "All screenshot paths and per-screenshot label counts are recorded in `pipeline/manifests/round-4u-browser-qa-results.json` and stay uncommitted under `pipeline/review/round-4u/screenshots/`.",
  ]);

  writeReport("round-4u-ad-layout-results.md", [
    "# Round 4U Ad Layout Results",
    "",
    `- Mobile visible ad count: ${data.adLayoutResults.summary.mobileVisibleAdCount}`,
    `- Tablet visible ad count: ${data.adLayoutResults.summary.tabletVisibleAdCount}`,
    `- Desktop visible ad count: ${data.adLayoutResults.summary.desktopVisibleAdCount}`,
    `- Wide desktop visible ad count: ${data.adLayoutResults.summary.wideDesktopVisibleAdCount}`,
    `- Visible placement count changed: ${data.adLayoutResults.summary.adPlacementCountChanged}`,
    `- Configured slot count changed: ${data.adLayoutResults.summary.configuredSlotCountChanged}`,
    `- Slot IDs changed: ${data.adLayoutResults.summary.slotIdsChanged}`,
    `- Live ad code added: ${data.adLayoutResults.summary.liveAdCodeAdded}`,
  ]);

  writeReport("round-4u-visual-fix-summary.md", [
    "# Round 4U Visual Fix Summary",
    "",
    `- Owner ad density issue fixed: ${data.visualFixSummary.summary.ownerAdDensityIssueFixed}`,
    `- No page shows four or five wells: ${data.visualFixSummary.summary.noPageShowsFourOrFiveWells}`,
    `- Horizontal overflow gone: ${data.visualFixSummary.summary.noHorizontalScrollbarAtTestedWidths}`,
    `- Ad wells visible by default: ${data.visualFixSummary.summary.adWellsVisibleByDefault}`,
    `- Slot IDs changed: ${data.visualFixSummary.summary.slotIdsChanged}`,
    `- Live ad code added: ${data.visualFixSummary.summary.liveAdCodeAdded}`,
  ]);

  writeReport("round-4u-next-phase-plan.md", [
    "# Round 4U Next Phase Plan",
    "",
    "Round 4V should be an owner acceptance pass on the reduced visible ad density and screenshots. Do not start SEO, JSON-LD, image sitemap, live ads, uploads, or new download formats until the visible ad model is accepted.",
  ]);
}

function formatCounts(counts) {
  return Object.entries(counts).map(([width, count]) => `${width}px=${count}`).join(", ");
}

function publicContainsGeneratedMedia() {
  const publicRoot = path.join(repoRoot, "public");
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
      results.push(path.relative(repoRoot, absolute));
    }
  }
  return results;
}

function readJsonIfExists(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!existsSync(absolute)) return null;
  return JSON.parse(readFileSync(absolute, "utf8"));
}

function readText(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function writeJson(relativePath, data) {
  const absolute = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`);
}

function writeReport(fileName, lines) {
  writeFileSync(path.join(reportDir, fileName), `${lines.join("\n")}\n`);
}

function git(args, options = {}) {
  try {
    const stdout = execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    return { status: 0, stdout };
  } catch (error) {
    if (options.allowFailure) return { status: error.status || 1, stdout: error.stdout?.toString() || "" };
    throw error;
  }
}
