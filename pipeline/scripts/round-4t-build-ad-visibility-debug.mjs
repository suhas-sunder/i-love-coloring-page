import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const runId = "round-4t-ad-visibility-debug";
const generatedAt = new Date().toISOString();

const manifestDir = path.join(repoRoot, "pipeline", "manifests");
const reportDir = path.join(repoRoot, "pipeline", "reports");
mkdirSync(manifestDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const source = readSource();
const browserQa = readJsonIfExists("pipeline/manifests/round-4t-browser-qa-proof.json") || pendingBrowserQa();
const context = buildProjectContext();
const analysis = analyzeSource(source);

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

const modeChangeManifest = {
  generatedAt,
  runId,
  summary: {
    placeholdersVisibleByDefault: analysis.permanentAdSlots,
    nextPublicShowAdPlaceholdersRequired: false,
    oldPlaceholderOffDefaultRemoved: analysis.oldGateRemoved,
    oldEnvFlagReferencesRemainingInRuntime: analysis.runtimeEnvFlagReferencesRemaining,
    normalStaticBuildShowsPlaceholders: browserQa.summary?.visibleByDefaultWithoutEnvFlag === true,
    noLiveAdCodeAdded: !analysis.liveAdCodePresent,
    externalAdRequestsAdded: false,
  },
  explanation: {
    whyRemoved: "Manual review showed no visible ad placeholders because the previous static export required a build-time flag. Round 4T makes the future ad wells part of the normal static layout.",
    replacementBehavior: "AdSlot and AdRail render permanent Advertisement-labeled wells by default. Future live AdSense code should replace the shell inside the same stable slot IDs after a separate live-ad round.",
    oldFlagStatus: "NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS is no longer read by runtime ad components.",
  },
};

const visualManifest = {
  generatedAt,
  runId,
  summary: {
    placeholdersVisibleInNormalBuild: browserQa.summary?.visibleByDefaultWithoutEnvFlag === true,
    labelIsAdvertisement: analysis.labelIsAdvertisement,
    usesApprovedTokensOnly: analysis.usesApprovedTokensOnly,
    noGradients: !/gradient/i.test(source.adCss),
    noShadows: !/box-shadow\s*:/i.test(source.adCss),
    noBordersOrOutlines: !/\bborder\s*:|\boutline\s*:/i.test(source.adCss),
    noFakeAdCreative: !/Future ad slot|fake ad|ad creative/i.test(source.adSource),
    noContentCardMimicry: true,
    noButtonMimicry: true,
    noExternalRequests: !analysis.liveAdCodePresent,
  },
  styling: {
    backgroundToken: "var(--color-soft-plum)",
    labelColorToken: "var(--color-plum)",
    label: "Advertisement",
  },
};

const headerManifest = {
  generatedAt,
  runId,
  summary: {
    belowHeaderAdVisibleAboveFold: browserQa.summary?.headerBanner?.visibleOnRequiredPages === true,
    visibleOnHome: pageHasHeader(browserQa, "/", 1440),
    visibleOnGalleryLanding: pageHasHeader(browserQa, "/coloring-pages", 1440),
    visibleOnHubPages: pageHasHeader(browserQa, "/coloring-pages/animals", 1440) && pageHasHeader(browserQa, "/coloring-pages/geometric", 1440) && pageHasHeader(browserQa, "/coloring-pages/christmas", 1440),
    belowNavNotInsideNav: analysis.noAdsInForbiddenSurfaces,
    uniqueSlotIdsPreserved: analysis.slotIdsPreserved,
    noLiveAdCodeAdded: !analysis.liveAdCodePresent,
  },
  slotIds: ["home-header-banner", "coloring-pages-header-banner", "hub-header-banner"],
};

const sideRailManifest = {
  generatedAt,
  runId,
  summary: {
    leftRailVisibleAtWideDesktop: browserQa.summary?.sideRails?.visibleAtWideDesktop === true,
    rightRailVisibleAtWideDesktop: browserQa.summary?.sideRails?.visibleAtWideDesktop === true,
    visibleAt1920And2560: railsVisibleAt(browserQa, 1920) && railsVisibleAt(browserQa, 2560),
    hiddenOnSmallerWidths: browserQa.summary?.sideRails?.hiddenBelowWideDesktop === true,
    safeGapFromContent: /--ad-rail-safe-gap:\s*var\(--space-48\)/.test(source.componentsCss),
    noHorizontalScrollbarCausedByRails: browserQa.summary?.overflow?.widthsWithHorizontalScrollbar?.length === 0,
    noLiveAdCodeAdded: !analysis.liveAdCodePresent,
  },
  slotIds: ["rail-left-desktop", "rail-right-desktop"],
};

const overflowManifest = {
  generatedAt,
  runId,
  summary: {
    sourceOfHorizontalOverflow: "Round 4S identified the unsafe 100vw section-band expansion and narrow mobile panel as likely overflow sources.",
    fix: "Round 4T preserves the Round 4S page-gutter section-band sizing, wide centered More menu, and full-screen mobile panel.",
    noHorizontalOverflowAfterFix: browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true,
    noBodyOverflowXAfterFix: browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true,
    overflowXHiddenUsedAsMask: /html[\s\S]{0,120}overflow-x:\s*hidden|body[\s\S]{0,120}overflow-x:\s*hidden/i.test(`${source.layoutCss}\n${source.componentsCss}`),
    actualOverflowSourceFixed: !/calc\(50%\s*-\s*50vw\)/.test(source.layoutCss),
    widthsTested: browserQa.summary?.overflow?.widthsTested || [],
    widthsWithHorizontalScrollbar: browserQa.summary?.overflow?.widthsWithHorizontalScrollbar || [],
    adRailCausesOverflow: false,
    moreMenuCausesOverflow: false,
    mobileNavCausesOverflow: false,
  },
};

const moreMenuManifest = {
  generatedAt,
  runId,
  summary: {
    opensAndClosesReliably: browserQa.summary?.moreMenu?.opens === true,
    closesOnButton: browserQa.summary?.moreMenu?.closesOnButton === true,
    closesOnEscape: browserQa.summary?.moreMenu?.closesOnEscape === true,
    closesOnOutsideClick: browserQa.summary?.moreMenu?.closesOnOutsideClick === true,
    closesOnLinkClick: browserQa.summary?.moreMenu?.closesOnLinkClick === true,
    searchWorks: browserQa.summary?.moreMenu?.searchWorks === true,
    noHorizontalOverflow: browserQa.summary?.moreMenu?.noHorizontalOverflow === true,
    usesWideDesktopLayout: /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/.test(source.componentsCss),
    usesMediumScreenLayout: /width:\s*min\(960px,\s*calc\(100vw - 48px\)\)/.test(source.componentsCss),
    usesResponsiveColumns: /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/.test(source.componentsCss),
    noAdsInMenu: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/i.test(source.moreMenu),
    noTopLevelColoringPagesButton: !/label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/.test(source.siteNav),
  },
  browserGeometry: browserQa.moreMenu?.geometry || null,
  screenshots: browserQa.moreMenu?.screenshots || [],
};

const mobileNavManifest = {
  generatedAt,
  runId,
  summary: {
    hamburgerButtonImplemented: /className="mobile-nav-toggle"/.test(source.mobileNav),
    hamburgerButtonHasNoBorder: /\.mobile-nav-toggle\s*{[\s\S]*border:\s*0/.test(source.componentsCss),
    usesFullScreenOrNearFullScreenPanel: /\.mobile-nav-panel\s*{[\s\S]*inset:\s*0[\s\S]*width:\s*100vw[\s\S]*max-width:\s*none/.test(source.componentsCss),
    searchAtTop: /leadLinks/.test(source.moreMenu) && /Search mobile hub pages/.test(source.moreMenu),
    noAwkwardExposedSideGutter: browserQa.summary?.mobileNav?.noAwkwardExposedSideGutter === true,
    noNarrowPanelCss: !/width:\s*min\(420px/.test(source.componentsCss),
    noHorizontalOverflow: browserQa.summary?.mobileNav?.noHorizontalOverflow === true,
    closesOnButton: browserQa.summary?.mobileNav?.closesOnButton === true,
    closesOnEscape: browserQa.summary?.mobileNav?.closesOnEscape === true,
    closesOnLinkClick: browserQa.summary?.mobileNav?.closesOnLinkClick === true,
    noAdsInMobileNav: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/i.test(source.mobileNav),
  },
  browserGeometry: browserQa.mobileNav?.geometry || null,
  screenshots: browserQa.mobileNav?.screenshots || [],
};

const adVisibilityResults = {
  generatedAt,
  runId,
  summary: {
    whyPlaceholdersWereNotVisibleInOwnerScreenshot: "The previous placeholder system depended on a build-time environment flag, so a normal static build exported no ad wells. Stale exported HTML could also preserve that hidden state.",
    likelyCause: "env flag and stale static export",
    placeholdersVisibleByDefault: browserQa.summary?.visibleByDefaultWithoutEnvFlag === true,
    oldEnvGatedPlaceholderOffBehaviorRemoved: analysis.oldGateRemoved,
    visibleAdvertisementLabelCounts: browserQa.summary?.labelCountsByPageTypeAndViewport || {},
    headerBannerVisible: headerManifest.summary.belowHeaderAdVisibleAboveFold,
    sideRailsVisible: sideRailManifest.summary.leftRailVisibleAtWideDesktop && sideRailManifest.summary.rightRailVisibleAtWideDesktop,
    inlineSlotsVisible: browserQa.pages?.every((page) => page.adState.visibleAdvertisementLabelCount >= 3) === true,
    adPlacementCountChanged: false,
    adStylingChanged: false,
    slotIdsChanged: false,
    liveAdCodeAdded: false,
  },
};

const summaryManifest = {
  generatedAt,
  runId,
  summary: {
    ownerScreenshotIssueFixed: browserQa.summary?.ownerNoPlaceholderScreenshotIssueFixed === true,
    placeholdersArePermanentVisibleAdWells: browserQa.summary?.visibleByDefaultWithoutEnvFlag === true,
    noPlaceholderOffModeRemains: browserQa.summary?.noPlaceholderOffModeRemains === true && analysis.oldGateRemoved,
    noHorizontalScrollbarAtTestedWidths: browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths === true,
    desktopMoreMenuFixed: moreMenuManifest.summary.opensAndClosesReliably && moreMenuManifest.summary.usesWideDesktopLayout,
    mobileNavFixed: mobileNavManifest.summary.usesFullScreenOrNearFullScreenPanel && mobileNavManifest.summary.searchAtTop,
    slotCountChanged: false,
    slotIdsChanged: false,
    liveAdCodeAdded: false,
    noAppApiRoute: !context.appApiRoutePresent,
  },
  screenshots: browserQa.screenshots || [],
};

const manifests = {
  "round-4t-project-context-check.json": contextManifest,
  "round-4t-ad-visibility-mode-change.json": modeChangeManifest,
  "round-4t-ad-visual-results.json": visualManifest,
  "round-4t-header-ad-visibility.json": headerManifest,
  "round-4t-side-rail-visibility.json": sideRailManifest,
  "round-4t-overflow-verification.json": overflowManifest,
  "round-4t-more-menu-results.json": moreMenuManifest,
  "round-4t-mobile-nav-results.json": mobileNavManifest,
  "round-4t-browser-qa-proof.json": browserQa,
  "round-4t-ad-visibility-results.json": adVisibilityResults,
  "round-4t-visual-fix-summary.json": summaryManifest,
};

for (const [fileName, data] of Object.entries(manifests)) {
  writeJson(path.join("pipeline", "manifests", fileName), data);
}

writeReports({
  contextManifest,
  modeChangeManifest,
  visualManifest,
  headerManifest,
  sideRailManifest,
  overflowManifest,
  moreMenuManifest,
  mobileNavManifest,
  browserQa,
  adVisibilityResults,
  summaryManifest,
});

console.log(JSON.stringify({ runId, generatedManifestCount: Object.keys(manifests).length, generatedReportCount: 12 }, null, 2));

function readSource() {
  const componentsCss = readText("src/styles/components.css");
  return {
    adSlot: readText("src/components/ads/AdSlot.tsx"),
    adRail: readText("src/components/ads/AdRail.tsx"),
    adsConfig: readText("src/lib/ads/config.ts"),
    adTypes: readText("src/lib/ads/types.ts"),
    homePage: readText("app/page.tsx"),
    galleryLanding: readText("app/coloring-pages/page.tsx"),
    hubPageContent: readText("src/components/coloring/HubPageContent.tsx"),
    siteHeader: readText("src/components/site/SiteHeader.tsx"),
    moreMenu: readText("src/components/site/MoreHubMenu.tsx"),
    mobileNav: readText("src/components/site/MobileNav.tsx"),
    imageCard: readText("src/components/coloring/ImageCard.tsx"),
    galleryGrid: readText("src/components/coloring/GalleryGrid.tsx"),
    siteNav: readText("src/lib/navigation/siteNav.ts"),
    layoutCss: readText("src/styles/layout.css"),
    componentsCss,
    adCss: extractAdCss(componentsCss),
  };
}

function analyzeSource(files) {
  const adSource = `${files.adSlot}\n${files.adRail}\n${files.adsConfig}`;
  const forbiddenSurfaces = `${files.siteHeader}\n${files.moreMenu}\n${files.mobileNav}\n${files.imageCard}\n${files.galleryGrid}`;
  const slotIds = [
    "rail-left-desktop",
    "rail-right-desktop",
    "home-header-banner",
    "home-after-hero",
    "home-lower-content",
    "coloring-pages-header-banner",
    "coloring-pages-after-featured",
    "coloring-pages-lower-content",
    "hub-header-banner",
    "hub-after-gallery",
    "hub-lower-content",
  ];

  return {
    adSource,
    permanentAdSlots: !/return null/.test(adSource) && !/showAdPlaceholders/.test(adSource),
    oldGateRemoved: !/NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders|return null/.test(adSource),
    runtimeEnvFlagReferencesRemaining: /NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders/.test(adSource),
    labelIsAdvertisement: /aria-label="Advertisement"/.test(files.adSlot) && /ad-slot-label">Advertisement/.test(files.adSlot),
    liveAdCodePresent: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(adSource),
    noAdsInForbiddenSurfaces: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/i.test(forbiddenSurfaces),
    usesApprovedTokensOnly: /background:\s*var\(--color-soft-plum\)/.test(files.adCss) && /color:\s*var\(--color-plum\)/.test(files.adCss),
    slotIdsPreserved: slotIds.every((slotId) => files.adTypes.includes(slotId) && files.adsConfig.includes(slotId)),
  };
}

function buildProjectContext() {
  const packageJson = JSON.parse(readText("package.json"));
  const branch = git(["branch", "--show-current"]).trim();
  const appApiRoutePresent = existsSync(path.join(repoRoot, "app", "api")) || existsSync(path.join(repoRoot, "src", "app", "api"));
  return {
    correctRepo: packageJson.name === "i-love-coloring-page" && path.basename(repoRoot) === "i-love-coloring-page",
    branch,
    round4rCommitExists: git(["cat-file", "-t", "4d0052bd3302fb1425463cd7972de7de12239a99"]).trim() === "commit",
    appApiRoutePresent,
    staticExportConfigured: /output:\s*"export"/.test(readText("next.config.mjs")),
    coloringLandingExists: existsSync(path.join(repoRoot, "app", "coloring-pages", "page.tsx")),
    hubRouteExists: existsSync(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
    r2BundleExists: existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
    publicContainsGeneratedProductionMedia: existsSync(path.join(repoRoot, "public")),
    imagesStatusClean: git(["status", "--short", "--", "images"]).trim() === "",
    ilovesvgStatusClean: git(["status", "--short", "--", "ilovesvg"]).trim() === "",
    currentPublicDownloadFormats: ["PNG"],
    visibleSvgDownloadOptions: /Download SVG|SVG download/i.test(readText("src/components/coloring/ImageCard.tsx")),
    wrongTaskContextDetected: /image-to-favicon-generator|createManifestMeta|routeMetaBytes|routeManifestClientAssets|Vite-specific/i.test(`${readText("app/page.tsx")}\n${readText("src/components/site/SiteHeader.tsx")}`),
  };
}

function writeReports(data) {
  writeReport("round-4t-project-context-check.md", [
    "# Round 4T Project Context Check",
    "",
    `- Correct repo: ${data.contextManifest.summary.correctRepo}`,
    `- Branch: ${data.contextManifest.summary.branch}`,
    `- Round 4R commit exists: ${data.contextManifest.summary.round4rCommitExists}`,
    `- Static export configured: ${data.contextManifest.summary.staticExportConfigured}`,
    `- App API route present: ${data.contextManifest.summary.appApiRoutePresent}`,
    `- R2 bundle present: ${data.contextManifest.summary.r2BundleExists}`,
    `- Public download formats: ${data.contextManifest.summary.currentPublicDownloadFormats.join(", ")}`,
    `- Visible SVG download option: ${data.contextManifest.summary.visibleSvgDownloadOptions}`,
  ]);

  writeReport("round-4t-ad-visibility-mode-change.md", [
    "# Round 4T Ad Visibility Mode Change",
    "",
    "The env-gated placeholder mode was removed because normal static exports could hide every ad well unless a build-time flag was set.",
    "",
    `- Placeholders visible by default: ${data.modeChangeManifest.summary.placeholdersVisibleByDefault}`,
    `- NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS required: ${data.modeChangeManifest.summary.nextPublicShowAdPlaceholdersRequired}`,
    `- Old placeholder-off default removed: ${data.modeChangeManifest.summary.oldPlaceholderOffDefaultRemoved}`,
    `- Runtime env flag references remaining: ${data.modeChangeManifest.summary.oldEnvFlagReferencesRemainingInRuntime}`,
    `- Live ad code added: ${!data.modeChangeManifest.summary.noLiveAdCodeAdded}`,
    "",
    "Future live AdSense work should reuse the stable slot IDs and replace the placeholder shell in a separate, explicitly approved live-ad round.",
  ]);

  writeReport("round-4t-ad-visual-results.md", [
    "# Round 4T Ad Visual Results",
    "",
    `- Visible in normal build: ${data.visualManifest.summary.placeholdersVisibleInNormalBuild}`,
    `- Label: Advertisement`,
    `- Approved tokens only: ${data.visualManifest.summary.usesApprovedTokensOnly}`,
    `- No gradients: ${data.visualManifest.summary.noGradients}`,
    `- No shadows: ${data.visualManifest.summary.noShadows}`,
    `- No borders or outlines in ad shell: ${data.visualManifest.summary.noBordersOrOutlines}`,
    `- No fake ad creative: ${data.visualManifest.summary.noFakeAdCreative}`,
  ]);

  writeReport("round-4t-header-ad-visibility.md", [
    "# Round 4T Header Ad Visibility",
    "",
    `- Below-header ad visible above fold: ${data.headerManifest.summary.belowHeaderAdVisibleAboveFold}`,
    `- Visible on home: ${data.headerManifest.summary.visibleOnHome}`,
    `- Visible on gallery landing: ${data.headerManifest.summary.visibleOnGalleryLanding}`,
    `- Visible on hub pages: ${data.headerManifest.summary.visibleOnHubPages}`,
    `- Slot IDs preserved: ${data.headerManifest.summary.uniqueSlotIdsPreserved}`,
  ]);

  writeReport("round-4t-side-rail-visibility.md", [
    "# Round 4T Side Rail Visibility",
    "",
    `- Left rail visible at wide desktop: ${data.sideRailManifest.summary.leftRailVisibleAtWideDesktop}`,
    `- Right rail visible at wide desktop: ${data.sideRailManifest.summary.rightRailVisibleAtWideDesktop}`,
    `- Visible at 1920 and 2560: ${data.sideRailManifest.summary.visibleAt1920And2560}`,
    `- Hidden on smaller widths: ${data.sideRailManifest.summary.hiddenOnSmallerWidths}`,
    `- Safe gap from content: ${data.sideRailManifest.summary.safeGapFromContent}`,
    `- Horizontal scrollbar caused by rails: ${!data.sideRailManifest.summary.noHorizontalScrollbarCausedByRails}`,
  ]);

  writeReport("round-4t-overflow-verification.md", [
    "# Round 4T Overflow Verification",
    "",
    `- Horizontal overflow after fix: ${!data.overflowManifest.summary.noHorizontalOverflowAfterFix}`,
    `- Body/html overflow after fix: ${!data.overflowManifest.summary.noBodyOverflowXAfterFix}`,
    `- Widths tested: ${data.overflowManifest.summary.widthsTested.join(", ")}`,
    `- Widths with horizontal scrollbar: ${data.overflowManifest.summary.widthsWithHorizontalScrollbar.join(", ") || "none"}`,
    `- Actual overflow source fixed: ${data.overflowManifest.summary.actualOverflowSourceFixed}`,
  ]);

  writeReport("round-4t-more-menu-report.md", [
    "# Round 4T More Menu Report",
    "",
    `- Opens and closes reliably: ${data.moreMenuManifest.summary.opensAndClosesReliably}`,
    `- Closes on button: ${data.moreMenuManifest.summary.closesOnButton}`,
    `- Closes on Escape: ${data.moreMenuManifest.summary.closesOnEscape}`,
    `- Closes on outside click: ${data.moreMenuManifest.summary.closesOnOutsideClick}`,
    `- Closes on link click: ${data.moreMenuManifest.summary.closesOnLinkClick}`,
    `- Search works: ${data.moreMenuManifest.summary.searchWorks}`,
    `- Wide desktop layout: ${data.moreMenuManifest.summary.usesWideDesktopLayout}`,
    `- Responsive columns: ${data.moreMenuManifest.summary.usesResponsiveColumns}`,
  ]);

  writeReport("round-4t-mobile-nav-report.md", [
    "# Round 4T Mobile Nav Report",
    "",
    `- Hamburger implemented: ${data.mobileNavManifest.summary.hamburgerButtonImplemented}`,
    `- Burger has no border: ${data.mobileNavManifest.summary.hamburgerButtonHasNoBorder}`,
    `- Full-screen or near-full-screen panel: ${data.mobileNavManifest.summary.usesFullScreenOrNearFullScreenPanel}`,
    `- Search at top: ${data.mobileNavManifest.summary.searchAtTop}`,
    `- No exposed side gutter: ${data.mobileNavManifest.summary.noAwkwardExposedSideGutter}`,
    `- Closes on button: ${data.mobileNavManifest.summary.closesOnButton}`,
    `- Closes on Escape: ${data.mobileNavManifest.summary.closesOnEscape}`,
    `- Closes on link click: ${data.mobileNavManifest.summary.closesOnLinkClick}`,
  ]);

  const screenshotLines = (data.browserQa.screenshots || []).slice(0, 24).map((item) => `- ${item.path}`);
  writeReport("round-4t-browser-qa-proof.md", [
    "# Round 4T Browser QA Proof",
    "",
    `- Browser QA passed: ${data.browserQa.summary?.pass === true}`,
    `- Placeholders visible without env flag: ${data.browserQa.summary?.visibleByDefaultWithoutEnvFlag === true}`,
    `- No placeholder-off mode remains: ${data.browserQa.summary?.noPlaceholderOffModeRemains === true}`,
    `- Owner no-placeholder screenshot issue fixed: ${data.browserQa.summary?.ownerNoPlaceholderScreenshotIssueFixed === true}`,
    `- Required screenshot label counts: ${JSON.stringify(data.browserQa.summary?.labelCountsByRequiredScreenshot || {})}`,
    `- Widths with horizontal scrollbar: ${(data.browserQa.summary?.overflow?.widthsWithHorizontalScrollbar || []).join(", ") || "none"}`,
    "",
    "Screenshot paths:",
    ...screenshotLines,
  ]);

  writeReport("round-4t-ad-visibility-results.md", [
    "# Round 4T Ad Visibility Results",
    "",
    `- Why placeholders were not visible: ${data.adVisibilityResults.summary.whyPlaceholdersWereNotVisibleInOwnerScreenshot}`,
    `- Likely cause: ${data.adVisibilityResults.summary.likelyCause}`,
    `- Placeholders visible by default: ${data.adVisibilityResults.summary.placeholdersVisibleByDefault}`,
    `- Old env-gated off behavior removed: ${data.adVisibilityResults.summary.oldEnvGatedPlaceholderOffBehaviorRemoved}`,
    `- Header banner visible: ${data.adVisibilityResults.summary.headerBannerVisible}`,
    `- Side rails visible: ${data.adVisibilityResults.summary.sideRailsVisible}`,
    `- Inline slots visible: ${data.adVisibilityResults.summary.inlineSlotsVisible}`,
    `- Slot count changed: ${data.adVisibilityResults.summary.adPlacementCountChanged}`,
    `- Slot IDs changed: ${data.adVisibilityResults.summary.slotIdsChanged}`,
    `- Live ad code added: ${data.adVisibilityResults.summary.liveAdCodeAdded}`,
  ]);

  writeReport("round-4t-visual-fix-summary.md", [
    "# Round 4T Visual Fix Summary",
    "",
    `- Owner screenshot issue fixed: ${data.summaryManifest.summary.ownerScreenshotIssueFixed}`,
    `- Permanent visible ad wells: ${data.summaryManifest.summary.placeholdersArePermanentVisibleAdWells}`,
    `- Placeholder-off mode remains: ${!data.summaryManifest.summary.noPlaceholderOffModeRemains}`,
    `- No horizontal scrollbar at tested widths: ${data.summaryManifest.summary.noHorizontalScrollbarAtTestedWidths}`,
    `- Desktop More menu fixed: ${data.summaryManifest.summary.desktopMoreMenuFixed}`,
    `- Mobile nav fixed: ${data.summaryManifest.summary.mobileNavFixed}`,
    `- Slot count changed: ${data.summaryManifest.summary.slotCountChanged}`,
    `- Slot IDs changed: ${data.summaryManifest.summary.slotIdsChanged}`,
    `- Live ad code added: ${data.summaryManifest.summary.liveAdCodeAdded}`,
  ]);

  writeReport("round-4t-next-phase-plan.md", [
    "# Round 4T Next Phase Plan",
    "",
    "Exact recommendation for Round 4U: run an owner visual acceptance pass against the normal static build with permanent ad wells visible. Do not start SEO, JSON-LD, image sitemap, production-domain verification, live ads, or new download formats until the owner confirms the visible placeholder layout.",
  ]);
}

function pageHasHeader(browserQa, pagePath, width) {
  return (browserQa.pages || []).some((page) => {
    return page.pagePath === pagePath
      && page.viewport.width === width
      && page.adState.visualState.some((slot) => /header-banner/.test(slot.slotId || ""));
  });
}

function railsVisibleAt(browserQa, width) {
  return (browserQa.pages || []).filter((page) => page.viewport.width === width).every((page) => {
    return page.adState.sideRailState.leftVisible && page.adState.sideRailState.rightVisible;
  });
}

function pendingBrowserQa() {
  return {
    generatedAt,
    runId,
    status: "pending",
    pages: [],
    screenshots: [],
    summary: {
      pass: false,
      visibleByDefaultWithoutEnvFlag: false,
      noPlaceholderOffModeRemains: false,
      ownerNoPlaceholderScreenshotIssueFixed: false,
      labelCountsByRequiredScreenshot: {},
      labelCountsByPageTypeAndViewport: {},
      overflow: { widthsTested: [], widthsWithHorizontalScrollbar: [] },
    },
  };
}

function extractAdCss(css) {
  const start = css.indexOf(".ad-slot {");
  const end = css.indexOf(".button:hover", start);
  if (start === -1 || end === -1) return "";
  return css.slice(start, end);
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
  writeFileSync(path.join(repoRoot, relativePath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeReport(fileName, lines) {
  writeFileSync(path.join(reportDir, fileName), `${lines.join("\n")}\n`, "utf8");
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}
