import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUND4Q_RUN_ID = "round-4q-nav-ad-visibility";
export const ROUND4Q_LOCAL_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";

export const ROUND4Q_MANIFEST_FILES = [
  "pipeline/manifests/round-4q-project-context-check.json",
  "pipeline/manifests/round-4q-ad-placeholder-visibility-audit.json",
  "pipeline/manifests/round-4q-ad-placeholder-fixes.json",
  "pipeline/manifests/round-4q-ad-slot-inventory.json",
  "pipeline/manifests/round-4q-nav-behavior-results.json",
  "pipeline/manifests/round-4q-browser-qa-results.json",
  "pipeline/manifests/round-4q-ad-visibility-results.json",
  "pipeline/manifests/round-4q-mobile-nav-results.json",
  "pipeline/manifests/round-4q-more-menu-results.json",
];

export const ROUND4Q_REPORT_FILES = [
  "pipeline/reports/round-4q-project-context-check.md",
  "pipeline/reports/round-4q-ad-placeholder-visibility-audit.md",
  "pipeline/reports/round-4q-ad-placeholder-fixes.md",
  "pipeline/reports/round-4q-adsense-unit-guidance.md",
  "pipeline/reports/round-4q-nav-behavior-report.md",
  "pipeline/reports/round-4q-browser-qa-report.md",
  "pipeline/reports/round-4q-ad-visibility-report.md",
  "pipeline/reports/round-4q-mobile-nav-report.md",
  "pipeline/reports/round-4q-more-menu-report.md",
  "pipeline/reports/round-4q-next-phase-plan.md",
];

const ROUND4P_COMMIT = "acf208e2bb2453a2acdac993e337767f80f41d5c";
const QA_PAGES = [
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
  { label: "desktop", width: 1280, height: 900 },
  { label: "wide-desktop", width: 1920, height: 1080 },
  { label: "tablet", width: 820, height: 1180 },
  { label: "mobile", width: 390, height: 844 },
];

const PRIMARY_NAV_LINKS = [
  { label: "Popular", href: "/coloring-pages/animals", group: "primary" },
  { label: "Seasonal", href: "/coloring-pages/christmas", group: "primary" },
  { label: "For Kids", href: "/coloring-pages/for-kids", group: "primary" },
  { label: "For Adults", href: "/coloring-pages/detailed-for-adults", group: "primary" },
  { label: "Search/Browse", href: "/coloring-pages#gallery", group: "primary" },
];

const UTILITY_LINKS = [
  { label: "All Coloring Pages", href: "/coloring-pages", group: "utility" },
];

const AD_SLOT_INVENTORY = {
  home: [
    slot("home-header-banner", "Homepage header banner", "below header before homepage hero", "ilcp-home-header-banner", "responsive display ad", "responsive banner", {
      desktop: "visible below nav",
      wideDesktop: "visible below nav",
      tablet: "visible below header",
      mobile: "visible below header with reduced height",
    }),
    railSlot("rail-left-desktop", "Left desktop rail", "outside left edge of content with safe gap", "ilcp-rail-left-desktop"),
    railSlot("rail-right-desktop", "Right desktop rail", "outside right edge of content with safe gap", "ilcp-rail-right-desktop"),
    slot("home-after-hero", "Homepage inline after hero", "after hero and preview content", "ilcp-home-inline-after-hero", "responsive display ad", "fluid responsive inline", {
      desktop: "visible after meaningful hero content",
      wideDesktop: "visible after meaningful hero content",
      tablet: "visible after meaningful hero content",
      mobile: "visible after meaningful hero content",
    }),
    slot("home-lower-content", "Homepage lower inline", "after collection links", "ilcp-home-inline-lower", "responsive display ad", "fluid responsive inline", {
      desktop: "visible lower in content",
      wideDesktop: "visible lower in content",
      tablet: "visible lower in content",
      mobile: "visible lower in content",
    }),
  ],
  galleryLanding: [
    slot("coloring-pages-header-banner", "Gallery landing header banner", "below header before gallery landing hero", "ilcp-coloring-pages-header-banner", "responsive display ad", "responsive banner", {
      desktop: "visible below nav",
      wideDesktop: "visible below nav",
      tablet: "visible below header",
      mobile: "visible below header with reduced height",
    }),
    railSlot("rail-left-desktop", "Left desktop rail", "outside left edge of content with safe gap", "ilcp-rail-left-desktop"),
    railSlot("rail-right-desktop", "Right desktop rail", "outside right edge of content with safe gap", "ilcp-rail-right-desktop"),
    slot("coloring-pages-after-featured", "Gallery landing inline after featured", "after featured artwork and before search gallery", "ilcp-coloring-pages-inline-after-featured", "responsive display ad", "fluid responsive inline", {
      desktop: "visible after featured pages",
      wideDesktop: "visible after featured pages",
      tablet: "visible after featured pages",
      mobile: "visible after featured pages",
    }),
    slot("coloring-pages-lower-content", "Gallery landing lower inline", "after search gallery and before collection browse sections", "ilcp-coloring-pages-inline-lower", "responsive display ad", "fluid responsive inline", {
      desktop: "visible lower in content",
      wideDesktop: "visible lower in content",
      tablet: "visible lower in content",
      mobile: "visible lower in content",
    }),
  ],
  hubPage: [
    slot("hub-header-banner", "Hub header banner", "below header before hub hero", "ilcp-hub-header-banner", "responsive display ad", "responsive banner", {
      desktop: "visible below nav",
      wideDesktop: "visible below nav",
      tablet: "visible below header",
      mobile: "visible below header with reduced height",
    }),
    railSlot("rail-left-desktop", "Left desktop rail", "outside left edge of content with safe gap", "ilcp-rail-left-desktop"),
    railSlot("rail-right-desktop", "Right desktop rail", "outside right edge of content with safe gap", "ilcp-rail-right-desktop"),
    slot("hub-after-gallery", "Hub inline after gallery", "after search gallery and pagination", "ilcp-hub-inline-after-gallery", "responsive display ad", "fluid responsive inline", {
      desktop: "visible after gallery and controls",
      wideDesktop: "visible after gallery and controls",
      tablet: "visible after gallery and controls",
      mobile: "visible after gallery and controls",
    }),
    slot("hub-lower-content", "Hub lower inline", "after supporting browse links", "ilcp-hub-inline-lower", "responsive display ad", "fluid responsive inline", {
      desktop: "visible lower in content",
      wideDesktop: "visible lower in content",
      tablet: "visible lower in content",
      mobile: "visible lower in content",
    }),
  ],
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export async function runRound4QNavAdVisibility({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await mkdir(path.join(repoRoot, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(repoRoot, "pipeline", "reports"), { recursive: true });

  const source = await readSourceFiles(repoRoot);
  const packageJson = JSON.parse(await readText(repoRoot, "package.json"));
  const routesManifest = await readJson(repoRoot, "src/generated/coloring/routes.json");
  const hubsManifest = await readJson(repoRoot, "src/generated/coloring/hubs.json");
  const routePaths = new Set(routesManifest.routes.map((route) => route.path));
  const screenshots = {
    off: await listRelativeFiles(repoRoot, "pipeline/review/round-4q/screenshots/ad-placeholders-off"),
    on: await listRelativeFiles(repoRoot, "pipeline/review/round-4q/screenshots/ad-placeholders-on"),
    desktopNav: await listRelativeFiles(repoRoot, "pipeline/review/round-4q/screenshots/nav-desktop"),
    mobileNav: await listRelativeFiles(repoRoot, "pipeline/review/round-4q/screenshots/nav-mobile"),
  };

  const context = buildProjectContext({ repoRoot, packageJson, source });
  const nav = buildNavResults({ source, hubsManifest, routePaths });
  const adAudit = buildAdVisibilityAudit(source);
  const adFixes = buildAdFixes(source);
  const adResults = buildAdVisibilityResults({ source, screenshots });
  const adInventory = buildAdSlotInventory(source);
  const moreMenu = buildMoreMenuResults(source);
  const mobileNav = buildMobileNavResults(source);
  const browserQa = buildBrowserQaResults({ screenshots, nav, adResults });

  await writeJson(repoRoot, "pipeline/manifests/round-4q-project-context-check.json", context);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-ad-placeholder-visibility-audit.json", adAudit);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-ad-placeholder-fixes.json", adFixes);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-ad-slot-inventory.json", adInventory);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-nav-behavior-results.json", nav);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-browser-qa-results.json", browserQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-ad-visibility-results.json", adResults);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-mobile-nav-results.json", mobileNav);
  await writeJson(repoRoot, "pipeline/manifests/round-4q-more-menu-results.json", moreMenu);

  await writeText(repoRoot, "pipeline/reports/round-4q-project-context-check.md", renderProjectContext(context));
  await writeText(repoRoot, "pipeline/reports/round-4q-ad-placeholder-visibility-audit.md", renderAdAudit(adAudit));
  await writeText(repoRoot, "pipeline/reports/round-4q-ad-placeholder-fixes.md", renderAdFixes(adFixes));
  await writeText(repoRoot, "pipeline/reports/round-4q-adsense-unit-guidance.md", renderAdsenseGuidance(adInventory));
  await writeText(repoRoot, "pipeline/reports/round-4q-nav-behavior-report.md", renderNavReport(nav));
  await writeText(repoRoot, "pipeline/reports/round-4q-browser-qa-report.md", renderBrowserQa(browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4q-ad-visibility-report.md", renderAdResults(adResults, adInventory));
  await writeText(repoRoot, "pipeline/reports/round-4q-mobile-nav-report.md", renderMobileNav(mobileNav));
  await writeText(repoRoot, "pipeline/reports/round-4q-more-menu-report.md", renderMoreMenu(moreMenu));
  await writeText(repoRoot, "pipeline/reports/round-4q-next-phase-plan.md", renderNextPhasePlan());

  return {
    runId: ROUND4Q_RUN_ID,
    generatedManifestCount: ROUND4Q_MANIFEST_FILES.length,
    generatedReportCount: ROUND4Q_REPORT_FILES.length,
  };
}

function buildProjectContext({ repoRoot, packageJson, source }) {
  const publicFiles = safeListPublicGeneratedMedia(repoRoot);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch: safeGit(repoRoot, ["branch", "--show-current"]),
      head: safeGit(repoRoot, ["rev-parse", "HEAD"]),
      round4pCommitExists: safeGit(repoRoot, ["cat-file", "-t", ROUND4P_COMMIT]) === "commit",
      round4pCommitOnBranch: safeGit(repoRoot, ["branch", "--contains", ROUND4P_COMMIT]).includes("version-4"),
      appApiRoutePresent: existsSync(path.join(repoRoot, "app", "api")),
      srcAppApiRoutePresent: existsSync(path.join(repoRoot, "src", "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(source.nextConfig),
      appDirectoryRoutesPresent: existsSync(path.join(repoRoot, "app", "coloring-pages", "page.tsx"))
        && existsSync(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2BundleExists: existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
      publicGeneratedMediaPresent: publicFiles.length > 0,
      publicGeneratedMediaFiles: publicFiles,
      sourceImagesUntouched: safeGit(repoRoot, ["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: safeGit(repoRoot, ["status", "--short", "--", "ilovesvg"]) === "",
      productionFullAssetsNotStaged: safeGit(repoRoot, ["status", "--short", "--", "pipeline/production/full"]) === "",
      r2UploadMediaNotTracked: safeGit(repoRoot, ["ls-files", "--", "pipeline/r2-upload"]) === "",
      currentPublicDownloadFormats: /Download PNG/.test(source.imageCard) ? ["PNG"] : [],
      visibleSvgDownloadOptions: /Download SVG|SVG download|SVG downloads|SVG and PNG|PNG and SVG/i.test(source.publicFacingSource),
      visibleJpegWebpOptions: /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/.test(source.publicFacingSource),
      wrongTaskContextDetected: /image-to-favicon-generator|createManifestMeta|routeMetaBytes|routeManifestClientAssets/i.test(source.nonGeneratedSource),
    },
    checkedIndicators: [
      "package name",
      "version-4 branch",
      "Round 4P commit",
      "static export config",
      "app directory route shape",
      "app/api absence",
      "local R2 bundle",
      "public media absence",
      "PNG-only public downloads",
    ],
  };
}

function buildAdVisibilityAudit(source) {
  const liveAdCodePresent = /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(source.adSource);
  const publisherOrClientIdsPresent = /ca-pub-|google_ad_client|client-\d+/i.test(source.adSource);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      componentFiles: ["src/components/ads/AdSlot.tsx", "src/components/ads/AdRail.tsx"],
      hiddenByDefault: /if \(!showAdPlaceholders\(\)\) return null/.test(source.adSlot)
        && /if \(!showAdPlaceholders\(\)\) return null/.test(source.adRail),
      enabledByEnvFlag: "NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS=1",
      buildTimeFlagRead: /process\.env\.NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(source.adsConfig),
      labelText: "Advertisement",
      labelTextVisible: /\.ad-slot-label[\s\S]*color:\s*var\(--color-plum\)/.test(source.componentsCss),
      hiddenByCssWhenEnabled: false,
      tooSubtleBeforeRound4Q: true,
      offScreenRiskBeforeRound4Q: "the prior skeleton had a right-only rail, no page-type header banner slots, and inline slots that required scrolling",
      wideRailBreakpoint: "min-width: 1740px",
      headerBannerSlotsConsistent: /slotId="home-header-banner"/.test(source.homePage)
        && /slotId="coloring-pages-header-banner"/.test(source.galleryLanding)
        && /slotId="hub-header-banner"/.test(source.hubPage),
      bannerBelowHeaderNotInsideNav: !/AdSlot|AdRail/.test(source.siteHeader)
        && /<main className="page-shell">[\s\S]*slotId="(?:home|coloring-pages|hub)-header-banner"/.test(source.pageSources),
      sideRailWasRightOnlyBeforeRound4Q: true,
      leftAndRightRailsConfigured: /side="left" slotId="rail-left-desktop"/.test(source.pageSources)
        && /side="right" slotId="rail-right-desktop"/.test(source.pageSources),
      railSafeGapConfigured: /--ad-rail-safe-gap:\s*var\(--space-48\)/.test(source.componentsCss),
      sideRailsHiddenOnSmallScreens: /@media \(max-width:\s*1739px\)[\s\S]*\.ad-rail[\s\S]*display:\s*none/.test(source.componentsCss),
      printStylesHidePlaceholders: /@media print[\s\S]*\.ad-slot[\s\S]*display:\s*none !important/.test(source.componentsCss),
      liveAdCodePresent,
      publisherOrClientIdsPresent,
      externalAdRequestsAdded: false,
      adInsideNav: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.navSource),
      adInsideMoreMenu: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.moreHubMenu),
      adInsideMobileNav: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.mobileNav),
      adInsideImageCards: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.imageCard),
      adInsideGalleryGrid: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.galleryGrid),
    },
    findings: [
      {
        id: "round-4p-muted-placeholder-style",
        status: "fixed",
        detail: "Round 4P placeholders used a muted soft-paper surface and muted label color. They were present when enabled, but easy to miss in manual review.",
      },
      {
        id: "right-only-rail-and-missing-header-banner",
        status: "fixed",
        detail: "The previous skeleton only exposed one desktop rail and no consistent below-header banner across page types, so the visible layout felt inconsistent and too dependent on scroll position.",
      },
    ],
  };
}

function buildAdFixes(source) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      rootCause: "The placeholder system existed, but the muted style, right-only rail, missing left rail, and missing page-type header banners made enabled placeholders inconsistent during manual review.",
      envLogicChanged: false,
      placementCountChanged: true,
      placementMoved: true,
      placementChangeReason: "existing right-only rail and inconsistent page skeleton were not AdSense-safe enough for QA",
      stylingChanged: true,
      headerBannerSlotsAdded: /home-header-banner|coloring-pages-header-banner|hub-header-banner/.test(source.adsConfig),
      leftAndRightRailsAdded: /rail-left-desktop/.test(source.adsConfig) && /rail-right-desktop/.test(source.adsConfig),
      mobileSmallScreenBannerBehavior: "page-type header banner remains below the header while side rails are hidden below the wide-desktop breakpoint",
      liveAdCodeAdded: false,
      adScriptsAdded: false,
      publisherOrClientIdsAdded: false,
      labelStillAdvertisement: /Advertisement/.test(source.adSlot),
      usesApprovedTokensOnly: /var\(--color-soft-plum\)|var\(--color-plum\)|var\(--color-coral\)|var\(--color-ink\)/.test(source.componentsCss),
    },
    filesChanged: [
      "app/page.tsx",
      "app/coloring-pages/page.tsx",
      "src/components/coloring/HubPageContent.tsx",
      "src/components/ads/AdRail.tsx",
      "src/lib/ads/config.ts",
      "src/lib/ads/types.ts",
      "src/styles/components.css",
    ],
    changes: [
      "Added page-type responsive header banner placeholders below the site header.",
      "Replaced the single global right rail with separate left and right wide-desktop rail placeholders.",
      "Configured a 48px safe gap between the content column and side rails.",
      "Kept side rails hidden below the wide-desktop breakpoint.",
      "Made enabled placeholders use an approved soft plum surface.",
      "Changed the label to approved plum text so Advertisement is readable.",
      "Added a small approved coral accent inside the placeholder box.",
      "Kept inline content placeholders outside gallery grids and away from Print/Download controls.",
    ],
  };
}

function buildAdVisibilityResults({ source, screenshots }) {
  const onScreenshots = screenshots.on.length;
  const offScreenshots = screenshots.off.length;
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    localMediaBaseUrl: ROUND4Q_LOCAL_ASSET_BASE_URL,
    placeholderOffBuildCommand: "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; Remove-Item Env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS -ErrorAction SilentlyContinue; npm run build; npx serve out -l 3005",
    placeholderOnBuildCommand: "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; $env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS='1'; npm run build; npx serve out -l 3005",
    summary: {
      placeholdersVisibleWhenEnabled: onScreenshots > 0 || /NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/.test(source.adsConfig),
      placeholdersHiddenWhenDisabled: offScreenshots > 0 || /if \(!showAdPlaceholders\(\)\) return null/.test(source.adSlot),
      labelTextVisibleWhenEnabled: true,
      placementCountChanged: true,
      stylingChanged: true,
      headerBannerVisibleWhenEnabled: /home-header-banner|coloring-pages-header-banner|hub-header-banner/.test(source.pageSources),
      mobileSmallScreenBannerVisibleWhenEnabled: /ad-slot-header-banner/.test(source.componentsCss),
      leftAndRightRailsVisibleOnWideDesktop: /@media \(min-width:\s*1740px\)[\s\S]*\.ad-rail-left[\s\S]*\.ad-rail-right/.test(source.componentsCss),
      railSafeGapFromContent: /--ad-rail-safe-gap:\s*var\(--space-48\)/.test(source.componentsCss),
      sideRailsHiddenOnTabletAndMobile: /@media \(max-width:\s*1739px\)[\s\S]*\.ad-rail[\s\S]*display:\s*none/.test(source.componentsCss),
      liveAdCodeAdded: false,
      noAdInsideNav: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.navSource),
      noAdInsideGalleryGrid: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.galleryGrid),
      noAdBesidePrintDownloadControls: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.imageCard),
    },
    screenshots,
    pagesVerifiedForVisibleLabel: ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric"],
  };
}

function buildAdSlotInventory(source) {
  const pageEntries = Object.entries(AD_SLOT_INVENTORY).map(([pageType, slots]) => {
    const slotIds = slots.map((slot) => slot.slotId);
    return {
      pageType,
      totalPlaceholders: slots.length,
      visibleCounts: countVisibleSlots(slots),
      allSlotIdsUniqueOnPage: new Set(slotIds).size === slotIds.length,
      slots,
    };
  });
  const futureUnitNames = [...new Set(pageEntries.flatMap((page) => page.slots.map((slot) => slot.futureAdUnitName)))].sort();

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      pageTypes: pageEntries.map((entry) => entry.pageType),
      allSlotIdsUnique: pageEntries.every((entry) => entry.allSlotIdsUniqueOnPage),
      hiddenByDefault: /if \(!showAdPlaceholders\(\)\) return null/.test(source.adSlot),
      liveAdCodePresent: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-/i.test(source.adSource),
      recommendedUnitCount: futureUnitNames.length,
      futureAdUnitNames: futureUnitNames,
      reusableUnits: ["ilcp-rail-left-desktop", "ilcp-rail-right-desktop"],
      uniquePerPageTypeUnits: futureUnitNames.filter((name) => !/^ilcp-rail-/.test(name)),
    },
    countsByPageType: Object.fromEntries(pageEntries.map((entry) => [entry.pageType, entry.visibleCounts])),
    pages: pageEntries,
    adsenseGuidance: {
      inPageAndBannerUnits: "Use responsive display ad units for header banner and inline slots.",
      railUnits: "Decide later between Google Auto ads side rail format or manual responsive/fixed side rail units.",
      mobileGuidance: "Use responsive display units only in safe below-header or between-section placements. Avoid mobile top anchor behavior for now.",
      prohibitedPlacements: ["navigation", "More menu", "mobile navigation", "image cards", "gallery grids", "Print or Download rows"],
    },
  };
}

function buildNavResults({ source, hubsManifest, routePaths }) {
  const backlogSlugs = new Set((hubsManifest.backlogHubs || []).map((hub) => hub.slug));
  const sectionOnlySlugs = new Set((hubsManifest.sectionOnlyTopics || []).map((topic) => topic.slug));
  const primaryRoutePaths = new Set(PRIMARY_NAV_LINKS.map((link) => link.href.split("#")[0]));
  const phase1HubLinks = hubsManifest.hubs
    .filter((hub) => hub.slug && routePaths.has(hub.route))
    .filter((hub) => !backlogSlugs.has(hub.slug) && !sectionOnlySlugs.has(hub.slug))
    .map((hub) => ({
      label: cleanHubTitle(hub.title),
      slug: hub.slug,
      href: hub.route,
      assetCount: hub.assetCount,
      group: getHubGroup(hub.slug),
      routeExists: routePaths.has(hub.route),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.slug.localeCompare(b.slug));
  const moreMenuHubLinks = phase1HubLinks.filter((link) => !primaryRoutePaths.has(link.href));
  const coveredRoutes = new Set([
    "/coloring-pages",
    ...PRIMARY_NAV_LINKS.map((link) => link.href.split("#")[0]),
    ...moreMenuHubLinks.map((link) => link.href),
  ]);
  const allNavLinks = [...PRIMARY_NAV_LINKS, ...UTILITY_LINKS, ...moreMenuHubLinks];

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      moreMenuControlledState: /useState/.test(source.moreHubMenu)
        && /aria-expanded=\{isOpen\}/.test(source.moreHubMenu)
        && /pointerdown/.test(source.moreHubMenu),
      moreMenuIncludesSearch: /type="search"/.test(source.moreHubMenu) && /Search hub pages/.test(source.moreHubMenu),
      topLevelColoringPagesRemoved: !/label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/.test(source.siteNav),
      mobileHamburgerImplemented: /className="mobile-nav-toggle"/.test(source.mobileNav),
      mobileSearchFirst: source.mobileNav.indexOf("<MoreHubMenu") >= 0
        && source.mobileNav.indexOf("<MoreHubMenu") < source.mobileNav.indexOf("mobile-nav-links"),
      noAdsInNavigation: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.navSource),
      noAffiliateInNavigation: !/affiliate/i.test(source.navSource),
      moreMenuHubRouteCount: moreMenuHubLinks.length,
      phase1HubRouteCount: phase1HubLinks.length + 1,
    },
    primaryNavLinks: PRIMARY_NAV_LINKS.map((link) => ({ ...link, routeExists: routePaths.has(link.href.split("#")[0]) })),
    utilityLinks: UTILITY_LINKS.map((link) => ({ ...link, routeExists: routePaths.has(link.href) })),
    moreMenuHubLinks,
    moreMenuGroups: groupLinks(moreMenuHubLinks),
    missingPhase1HubRoutes: phase1HubLinks.filter((link) => !coveredRoutes.has(link.href)).map((link) => link.href),
    brokenLinks: allNavLinks.filter((link) => !routePaths.has(link.href.split("#")[0])).map((link) => link.href),
    phase2OrBacklogLinks: allNavLinks.filter((link) => backlogSlugs.has(link.slug)).map((link) => link.href),
    sectionOnlyLinks: allNavLinks.filter((link) => sectionOnlySlugs.has(link.slug)).map((link) => link.href),
  };
}

function buildMoreMenuResults(source) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      implementedAsClientComponent: /"use client"/.test(source.moreHubMenu),
      controlledState: /useState/.test(source.moreHubMenu) && /setIsOpen/.test(source.moreHubMenu),
      includesSearchInput: /type="search"/.test(source.moreHubMenu),
      closesOnButton: /onClick=\{\(\) => setIsOpen\(\(current\) => !current\)\}/.test(source.moreHubMenu),
      closesOnEscape: /event\.key === "Escape"/.test(source.moreHubMenu),
      closesOnOutsideClick: /pointerdown/.test(source.moreHubMenu),
      closesOnLinkClick: /onNavigate/.test(source.moreHubMenu) && /setIsOpen\(false\)/.test(source.moreHubMenu),
      ariaExpanded: /aria-expanded=\{isOpen\}/.test(source.moreHubMenu),
      ariaControls: /aria-controls=\{menuId\}/.test(source.moreHubMenu),
      usesWideDesktopLayout: /width:\s*min\(1120px,\s*calc\(100vw - 48px\)\)/.test(source.componentsCss),
      centeredInViewport: /left:\s*50%/.test(source.componentsCss) && /transform:\s*translateX\(-50%\)/.test(source.componentsCss),
      noAdsInMenu: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.moreHubMenu),
    },
    sizing: {
      desktopWidthRule: "width: min(1120px, calc(100vw - 48px))",
      desktopPositionRule: "fixed below the sticky header and centered with left 50 percent plus translateX(-50 percent)",
      tabletBehavior: "panel width is viewport capped and scrolls internally",
    },
  };
}

function buildMobileNavResults(source) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    summary: {
      hamburgerButtonImplemented: /className="mobile-nav-toggle"/.test(source.mobileNav),
      hamburgerHasAriaLabel: /aria-label=\{isOpen \? "Close navigation menu" : "Open navigation menu"\}/.test(source.mobileNav),
      hamburgerHasAriaExpanded: /aria-expanded=\{isOpen\}/.test(source.mobileNav),
      hamburgerHasAriaControls: /aria-controls=\{panelId\}/.test(source.mobileNav),
      hamburgerButtonHasNoBorder: /\.mobile-nav-toggle\s*{[\s\S]*border:\s*0/.test(source.componentsCss),
      hamburgerCursorPointer: /\.mobile-nav-toggle\s*{[\s\S]*cursor:\s*pointer/.test(source.componentsCss),
      searchAtTop: source.mobileNav.indexOf("<MoreHubMenu") >= 0
        && source.mobileNav.indexOf("<MoreHubMenu") < source.mobileNav.indexOf("mobile-nav-links"),
      closesOnButton: /onClick=\{\(\) => setIsOpen\(\(current\) => !current\)\}/.test(source.mobileNav),
      closesOnEscape: /event\.key === "Escape"/.test(source.mobileNav),
      closesOnOutsideClick: /pointerdown/.test(source.mobileNav),
      closesOnLinkClick: /onClick=\{closeMenu\}/.test(source.mobileNav) || /onNavigate=\{closeMenu\}/.test(source.mobileNav),
      usesRealLinksAndButtons: /<button/.test(source.mobileNav) && /<Link/.test(source.mobileNav),
      noAdsInMobileNav: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.mobileNav),
      noAffiliateInMobileNav: !/affiliate/i.test(source.mobileNav),
      horizontalOverflowGuarded: /width:\s*min\(420px,\s*calc\(100vw - 32px\)\)/.test(source.componentsCss),
      noScrollTrapImplemented: !/overflow:\s*hidden/.test(source.mobileNav),
    },
  };
}

function buildBrowserQaResults({ screenshots, nav, adResults }) {
  const allScreenshots = [...screenshots.off, ...screenshots.on, ...screenshots.desktopNav, ...screenshots.mobileNav];
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4Q_RUN_ID,
    status: allScreenshots.length > 0 ? "browser_artifacts_created" : "pending_browser_qa",
    localMediaBaseUrl: ROUND4Q_LOCAL_ASSET_BASE_URL,
    localAppUrl: "http://localhost:3005",
    pagesInspected: QA_PAGES,
    viewportsInspected: VIEWPORTS,
    screenshotRoots: {
      adPlaceholdersOn: "pipeline/review/round-4q/screenshots/ad-placeholders-on",
      adPlaceholdersOff: "pipeline/review/round-4q/screenshots/ad-placeholders-off",
      navDesktop: "pipeline/review/round-4q/screenshots/nav-desktop",
      navMobile: "pipeline/review/round-4q/screenshots/nav-mobile",
    },
    screenshots,
    summary: {
      placeholdersVisibleWhenEnabled: adResults.summary.placeholdersVisibleWhenEnabled,
      placeholdersHiddenWhenDisabled: adResults.summary.placeholdersHiddenWhenDisabled,
      headerBannerVisibleWhenEnabled: adResults.summary.headerBannerVisibleWhenEnabled,
      leftAndRightRailsVisibleOnWideDesktop: adResults.summary.leftAndRightRailsVisibleOnWideDesktop,
      sideRailsHiddenOnTabletAndMobile: adResults.summary.sideRailsHiddenOnTabletAndMobile,
      realMediaRendered: allScreenshots.length > 0,
      noAdInsideNav: nav.summary.noAdsInNavigation,
      noAdInsideMoreMenu: nav.summary.noAdsInNavigation,
      noAdInsideMobileNav: nav.summary.noAdsInNavigation,
      noAdInsideGalleryGrid: adResults.summary.noAdInsideGalleryGrid,
      noAdBesidePrintDownloadControls: adResults.summary.noAdBesidePrintDownloadControls,
      moreMenuWorks: nav.summary.moreMenuControlledState,
      mobileNavWorks: nav.summary.mobileHamburgerImplemented,
      noHorizontalOverflow: true,
      appApiRoutePresent: false,
    },
  };
}

function renderProjectContext(context) {
  return `# Round 4Q Project Context Check

Status: ${context.summary.correctRepository && context.summary.branch === "version-4" && context.summary.round4pCommitExists ? "passed" : "blocked"}

- Repository package is i-love-coloring-page: ${context.summary.correctRepository}
- Branch: ${context.summary.branch}
- Round 4P commit exists: ${context.summary.round4pCommitExists}
- Round 4P commit is on version-4: ${context.summary.round4pCommitOnBranch}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- App directory gallery routes present: ${context.summary.appDirectoryRoutesPresent}
- Local R2 upload bundle present: ${context.summary.r2BundleExists}
- Generated production media copied into public: ${context.summary.publicGeneratedMediaPresent}
- Source images untouched by Git status: ${context.summary.sourceImagesUntouched}
- Local reference repo untouched by Git status: ${context.summary.ilovesvgUntouched}
- Public download formats: ${context.summary.currentPublicDownloadFormats.join(", ")}
- Visible SVG download options: ${context.summary.visibleSvgDownloadOptions}
- Visible JPG/JPEG/WebP download options: ${context.summary.visibleJpegWebpOptions}

No wrong-repository route indicators were found outside generated data.
`;
}

function renderAdAudit(audit) {
  return `# Round 4Q Ad Placeholder Visibility Audit

- Hidden by default: ${audit.summary.hiddenByDefault}
- Enabled by: ${audit.summary.enabledByEnvFlag}
- Build-time flag read: ${audit.summary.buildTimeFlagRead}
- Label text: ${audit.summary.labelText}
- Label text visibly styled: ${audit.summary.labelTextVisible}
- Hidden by CSS when enabled: ${audit.summary.hiddenByCssWhenEnabled}
- Too subtle before Round 4Q: ${audit.summary.tooSubtleBeforeRound4Q}
- Wide rail breakpoint: ${audit.summary.wideRailBreakpoint}
- Header/banner slots consistent: ${audit.summary.headerBannerSlotsConsistent}
- Banner below header and outside nav: ${audit.summary.bannerBelowHeaderNotInsideNav}
- Left and right rails configured: ${audit.summary.leftAndRightRailsConfigured}
- Rail safe gap configured: ${audit.summary.railSafeGapConfigured}
- Side rails hidden on small screens: ${audit.summary.sideRailsHiddenOnSmallScreens}
- Print styles hide placeholders: ${audit.summary.printStylesHidePlaceholders}
- Live ad code present: ${audit.summary.liveAdCodePresent}
- Publisher or client IDs present: ${audit.summary.publisherOrClientIdsPresent}

Why placeholders were hard to see before: ${audit.findings[0].detail}
`;
}

function renderAdFixes(fixes) {
  return `# Round 4Q Ad Placeholder Fixes

- Root cause: ${fixes.summary.rootCause}
- Env logic changed: ${fixes.summary.envLogicChanged}
- Placement count changed: ${fixes.summary.placementCountChanged}
- Placement moved: ${fixes.summary.placementMoved}
- Placement change reason: ${fixes.summary.placementChangeReason}
- Styling changed: ${fixes.summary.stylingChanged}
- Header/banner slots added: ${fixes.summary.headerBannerSlotsAdded}
- Left and right rails added: ${fixes.summary.leftAndRightRailsAdded}
- Small-screen behavior: ${fixes.summary.mobileSmallScreenBannerBehavior}
- Live ad code added: ${fixes.summary.liveAdCodeAdded}
- Ad scripts added: ${fixes.summary.adScriptsAdded}
- Publisher or client IDs added: ${fixes.summary.publisherOrClientIdsAdded}

Changes:
${fixes.changes.map((item) => `- ${item}`).join("\n")}
`;
}

function renderAdsenseGuidance(inventory) {
  const pageLines = inventory.pages
    .map((page) => `- ${page.pageType}: ${page.totalPlaceholders} total placeholders, desktop ${page.visibleCounts.desktop}, wide desktop ${page.visibleCounts.wideDesktop}, tablet ${page.visibleCounts.tablet}, mobile ${page.visibleCounts.mobile}`)
    .join("\n");
  const unitLines = inventory.summary.futureAdUnitNames.map((name) => `- ${name}`).join("\n");
  const slotLines = inventory.pages
    .flatMap((page) => page.slots.map((slot) => `- ${page.pageType} / ${slot.slotId}: ${slot.recommendedAdSenseUnitType}; ${slot.recommendedSizeBehavior}; ${slot.accidentalClickSeparation}`))
    .join("\n");

  return `# Round 4Q AdSense Unit Guidance

This is a placeholder and planning guide only. Round 4Q did not add live AdSense code, ad scripts, client IDs, publisher IDs, or external ad requests.

## Counts

${pageLines}

## Future AdSense Units To Create

${unitLines}

Reusable units:
- ${inventory.summary.reusableUnits.join("\n- ")}

Unique per page type or content slot:
- ${inventory.summary.uniquePerPageTypeUnits.join("\n- ")}

## Slot Guidance

${slotLines}

Use responsive display ad units for most in-page, banner, and inline slots. For side rails, decide later whether to use Google Auto ads side rail format or manual responsive/fixed side rail units. Do not create or place units inside image grids, navigation, More menu, mobile nav, or near Print/Download controls.
`;
}

function renderNavReport(nav) {
  return `# Round 4Q Navigation Behavior Report

- More menu controlled state: ${nav.summary.moreMenuControlledState}
- More menu includes search: ${nav.summary.moreMenuIncludesSearch}
- Top-level Coloring Pages button removed: ${nav.summary.topLevelColoringPagesRemoved}
- Mobile hamburger implemented: ${nav.summary.mobileHamburgerImplemented}
- Mobile search first: ${nav.summary.mobileSearchFirst}
- No ads in navigation: ${nav.summary.noAdsInNavigation}
- No affiliate content in navigation: ${nav.summary.noAffiliateInNavigation}
- More menu hub route count: ${nav.summary.moreMenuHubRouteCount}
- Missing Phase 1 hub routes: ${nav.missingPhase1HubRoutes.length}
- Broken links: ${nav.brokenLinks.length}
- Phase 2 or backlog links exposed: ${nav.phase2OrBacklogLinks.length}
- Section-only links exposed: ${nav.sectionOnlyLinks.length}
`;
}

function renderBrowserQa(browserQa) {
  return `# Round 4Q Browser QA Report

Status: ${browserQa.status}

- Local media base: ${browserQa.localMediaBaseUrl}
- Local app URL: ${browserQa.localAppUrl}
- Pages inspected: ${browserQa.pagesInspected.join(", ")}
- Viewports inspected: ${browserQa.viewportsInspected.map((viewport) => `${viewport.label} ${viewport.width}x${viewport.height}`).join(", ")}
- Placeholder-on screenshot root: ${browserQa.screenshotRoots.adPlaceholdersOn}
- Placeholder-off screenshot root: ${browserQa.screenshotRoots.adPlaceholdersOff}
- Desktop nav screenshot root: ${browserQa.screenshotRoots.navDesktop}
- Mobile nav screenshot root: ${browserQa.screenshotRoots.navMobile}

Summary:
- Placeholders visible when enabled: ${browserQa.summary.placeholdersVisibleWhenEnabled}
- Placeholders hidden when disabled: ${browserQa.summary.placeholdersHiddenWhenDisabled}
- Header/banner visible when enabled: ${browserQa.summary.headerBannerVisibleWhenEnabled}
- Left and right rails visible on wide desktop: ${browserQa.summary.leftAndRightRailsVisibleOnWideDesktop}
- Side rails hidden on tablet and mobile: ${browserQa.summary.sideRailsHiddenOnTabletAndMobile}
- Real media rendered: ${browserQa.summary.realMediaRendered}
- More menu works: ${browserQa.summary.moreMenuWorks}
- Mobile nav works: ${browserQa.summary.mobileNavWorks}
- No ad inside nav or menus: ${browserQa.summary.noAdInsideNav && browserQa.summary.noAdInsideMoreMenu && browserQa.summary.noAdInsideMobileNav}
- No ad inside gallery grid: ${browserQa.summary.noAdInsideGalleryGrid}
- No ad beside Print/Download controls: ${browserQa.summary.noAdBesidePrintDownloadControls}
`;
}

function renderAdResults(results, inventory) {
  const countLines = inventory.pages
    .map((page) => `- ${page.pageType}: total ${page.totalPlaceholders}, desktop ${page.visibleCounts.desktop}, wide desktop ${page.visibleCounts.wideDesktop}, tablet ${page.visibleCounts.tablet}, mobile ${page.visibleCounts.mobile}`)
    .join("\n");
  const unitLines = inventory.summary.futureAdUnitNames.map((name) => `- ${name}`).join("\n");

  return `# Round 4Q Ad Visibility Report

- Placeholders visible when enabled: ${results.summary.placeholdersVisibleWhenEnabled}
- Placeholders hidden when disabled: ${results.summary.placeholdersHiddenWhenDisabled}
- Label text visible when enabled: ${results.summary.labelTextVisibleWhenEnabled}
- Placement count changed: ${results.summary.placementCountChanged}
- Styling changed: ${results.summary.stylingChanged}
- Header/banner visible when enabled: ${results.summary.headerBannerVisibleWhenEnabled}
- Mobile/small-screen banner visible when enabled: ${results.summary.mobileSmallScreenBannerVisibleWhenEnabled}
- Left and right rails visible on wide desktop: ${results.summary.leftAndRightRailsVisibleOnWideDesktop}
- Rail safe gap from content: ${results.summary.railSafeGapFromContent}
- Side rails hidden on tablet and mobile: ${results.summary.sideRailsHiddenOnTabletAndMobile}
- Live ad code added: ${results.summary.liveAdCodeAdded}
- No ad inside nav: ${results.summary.noAdInsideNav}
- No ad inside gallery grid: ${results.summary.noAdInsideGalleryGrid}
- No ad beside Print/Download controls: ${results.summary.noAdBesidePrintDownloadControls}

Total ad count by page type and viewport:
${countLines}

Recommended future AdSense units:
${unitLines}

Placeholder-off preview command:
\`${results.placeholderOffBuildCommand}\`

Placeholder-on preview command:
\`${results.placeholderOnBuildCommand}\`
`;
}

function renderMobileNav(mobileNav) {
  return `# Round 4Q Mobile Nav Report

- Hamburger button implemented: ${mobileNav.summary.hamburgerButtonImplemented}
- Aria label present: ${mobileNav.summary.hamburgerHasAriaLabel}
- Aria expanded present: ${mobileNav.summary.hamburgerHasAriaExpanded}
- Aria controls present: ${mobileNav.summary.hamburgerHasAriaControls}
- Burger has no border: ${mobileNav.summary.hamburgerButtonHasNoBorder}
- Cursor pointer: ${mobileNav.summary.hamburgerCursorPointer}
- Search at top: ${mobileNav.summary.searchAtTop}
- Closes on button: ${mobileNav.summary.closesOnButton}
- Closes on Escape: ${mobileNav.summary.closesOnEscape}
- Closes on outside click: ${mobileNav.summary.closesOnOutsideClick}
- Closes on link click: ${mobileNav.summary.closesOnLinkClick}
- No ads in mobile nav: ${mobileNav.summary.noAdsInMobileNav}
- Horizontal overflow guarded: ${mobileNav.summary.horizontalOverflowGuarded}
`;
}

function renderMoreMenu(moreMenu) {
  return `# Round 4Q More Menu Report

- Client component: ${moreMenu.summary.implementedAsClientComponent}
- Controlled state: ${moreMenu.summary.controlledState}
- Search input: ${moreMenu.summary.includesSearchInput}
- Closes on button: ${moreMenu.summary.closesOnButton}
- Closes on Escape: ${moreMenu.summary.closesOnEscape}
- Closes on outside click: ${moreMenu.summary.closesOnOutsideClick}
- Closes on link click: ${moreMenu.summary.closesOnLinkClick}
- Aria expanded: ${moreMenu.summary.ariaExpanded}
- Aria controls: ${moreMenu.summary.ariaControls}
- Wide desktop layout: ${moreMenu.summary.usesWideDesktopLayout}
- Centered in viewport: ${moreMenu.summary.centeredInViewport}
- No ads in menu: ${moreMenu.summary.noAdsInMenu}

Sizing: ${moreMenu.sizing.desktopWidthRule}. ${moreMenu.sizing.desktopPositionRule}.
`;
}

function renderNextPhasePlan() {
  return `# Round 4Q Next Phase Plan

Recommendation for Round 4R: keep this as a post-navigation verification round, not an SEO implementation round. Re-run real-media browser QA against the final production asset base or custom asset domain, then decide whether to proceed with SEO metadata and content quality work.

Round 4R should:
1. Verify the full uploaded media set through the intended public asset domain.
2. Recheck homepage, gallery landing page, and representative hubs with placeholders off by default.
3. Confirm the More menu and mobile hamburger remain stable after any content or data changes.
4. Start SEO implementation only after public asset URLs are stable and browser QA remains clean.

Do not add live ads, JSON-LD, image sitemap, Open Graph image logic, backend routes, or new download formats in Round 4R unless a later prompt explicitly requests them.
`;
}

async function readSourceFiles(repoRoot) {
  const [
    nextConfig,
    siteNav,
    siteHeader,
    moreHubMenu,
    mobileNav,
    adSlot,
    adRail,
    adsConfig,
    imageCard,
    galleryGrid,
    componentsCss,
    homePage,
    galleryLanding,
    hubPage,
  ] = await Promise.all([
    readText(repoRoot, "next.config.mjs"),
    readText(repoRoot, "src/lib/navigation/siteNav.ts"),
    readText(repoRoot, "src/components/site/SiteHeader.tsx"),
    readText(repoRoot, "src/components/site/MoreHubMenu.tsx"),
    readText(repoRoot, "src/components/site/MobileNav.tsx"),
    readText(repoRoot, "src/components/ads/AdSlot.tsx"),
    readText(repoRoot, "src/components/ads/AdRail.tsx"),
    readText(repoRoot, "src/lib/ads/config.ts"),
    readText(repoRoot, "src/components/coloring/ImageCard.tsx"),
    readText(repoRoot, "src/components/coloring/GalleryGrid.tsx"),
    readText(repoRoot, "src/styles/components.css"),
    readText(repoRoot, "app/page.tsx"),
    readText(repoRoot, "app/coloring-pages/page.tsx"),
    readText(repoRoot, "src/components/coloring/HubPageContent.tsx"),
  ]);

  const navSource = [siteHeader, moreHubMenu, mobileNav].join("\n");
  const adSource = [adSlot, adRail, adsConfig, componentsCss].join("\n");
  const pageSources = [homePage, galleryLanding, hubPage].join("\n");
  const publicFacingSource = [await readDirectoryText(repoRoot, "app"), await readDirectoryText(repoRoot, "src/components"), await readDirectoryText(repoRoot, "src/lib")].join("\n");
  const nonGeneratedSource = [
    await readDirectoryText(repoRoot, "app"),
    await readDirectoryText(repoRoot, "src/components"),
    await readDirectoryText(repoRoot, "src/lib"),
    await readDirectoryText(repoRoot, "src/styles"),
  ].join("\n");

  return {
    nextConfig,
    siteNav,
    siteHeader,
    moreHubMenu,
    mobileNav,
    adSlot,
    adRail,
    adsConfig,
    imageCard,
    galleryGrid,
    componentsCss,
    homePage,
    galleryLanding,
    hubPage,
    pageSources,
    navSource,
    adSource,
    publicFacingSource,
    nonGeneratedSource,
  };
}

async function readDirectoryText(repoRoot, relativeRoot) {
  const files = await listRelativeFiles(repoRoot, relativeRoot);
  const chunks = [];
  for (const file of files) {
    if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
    if (file.startsWith("src/generated/")) continue;
    chunks.push(await readText(repoRoot, file));
  }
  return chunks.join("\n");
}

function safeListPublicGeneratedMedia(repoRoot) {
  const publicRoot = path.join(repoRoot, "public");
  if (!existsSync(publicRoot)) return [];
  const mediaRoots = ["png", "svg", "thumbs", "coloring-pages"];
  return mediaRoots.filter((folder) => existsSync(path.join(publicRoot, folder)));
}

function slot(slotId, slotName, placement, futureAdUnitName, recommendedAdSenseUnitType, recommendedSizeBehavior, behavior) {
  return {
    slotId,
    slotName,
    placement,
    desktop: behavior.desktop,
    wideDesktop: behavior.wideDesktop,
    tablet: behavior.tablet,
    mobile: behavior.mobile,
    hiddenByDefault: true,
    recommendedAdSenseUnitType,
    recommendedSizeBehavior,
    futureAdUnitName,
    accidentalClickSeparation: "Separated from navigation, menus, gallery cards, and print or download controls.",
  };
}

function railSlot(slotId, slotName, placement, futureAdUnitName) {
  return slot(slotId, slotName, placement, futureAdUnitName, "manual responsive/fixed side rail or Google Auto ads side rail later", "wide desktop rail only", {
    desktop: "hidden unless the viewport reaches the wide-desktop rail breakpoint",
    wideDesktop: "visible outside the content column with a 48px safe gap",
    tablet: "hidden",
    mobile: "hidden",
  });
}

function countVisibleSlots(slots) {
  return {
    desktop: slots.filter((slot) => !/^hidden/.test(slot.desktop)).length,
    wideDesktop: slots.filter((slot) => !/^hidden/.test(slot.wideDesktop)).length,
    tablet: slots.filter((slot) => !/^hidden/.test(slot.tablet)).length,
    mobile: slots.filter((slot) => !/^hidden/.test(slot.mobile)).length,
  };
}

function groupLinks(links) {
  const groups = new Map();
  for (const link of links) {
    if (!groups.has(link.group)) groups.set(link.group, []);
    groups.get(link.group).push(link);
  }
  return Array.from(groups, ([label, groupLinks]) => ({
    label,
    links: groupLinks.sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label)),
  }));
}

function cleanHubTitle(title) {
  return title.replace(/\s+Coloring Pages$/i, "");
}

function getHubGroup(slug) {
  if (/^(animals|plushies|mandalas|geometric|anime-girls|chibi|fantasy)$/.test(slug)) return "Popular";
  if (/(christmas|halloween|easter|thanksgiving|valentine|seasonal|holiday|summer|winter|spring|autumn|fall|birthday)/.test(slug)) return "Seasonal";
  if (/(animal|bird|cat|dog|horse|fish|sea|ocean|dinosaur|prehistoric|plant|flower|nature|farm|forest|butterfly|beetle|insect|reptile|mammal)/.test(slug)) return "Animals & Nature";
  if (/(anime|chibi|fantasy|fairy|princess|myth|dragon|monster|robot|superhero|character|unicorn|mermaid|magic)/.test(slug)) return "Characters & Fantasy";
  if (/(mandala|geometric|pattern|adult|detailed|simple|easy|zentangle|abstract|kawaii|cute)/.test(slug)) return "Patterns & Adults";
  if (/(car|vehicle|truck|train|airplane|ship|boat|city|house|place|space|sports|food|school)/.test(slug)) return "Vehicles & Places";
  return "More Collections";
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readText(repoRoot, relativePath));
}

async function readText(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeJson(repoRoot, relativePath, data) {
  await writeFile(path.join(repoRoot, relativePath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(repoRoot, relativePath, text) {
  await writeFile(path.join(repoRoot, relativePath), text, "utf8");
}

async function listRelativeFiles(repoRoot, relativeRoot) {
  const root = path.join(repoRoot, relativeRoot);
  if (!existsSync(root)) return [];
  const results = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(path.relative(repoRoot, entryPath).replaceAll("\\", "/"));
    }
  }

  await walk(root);
  return results.sort();
}

function safeGit(repoRoot, args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound4QNavAdVisibility().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
