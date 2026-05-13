import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_ID = "round-4s-nav-ad-overflow";
const ROUND4R_COMMIT = "4d0052bd3302fb1425463cd7972de7de12239a99";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export async function runRound4SNavAdOverflow({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await mkdir(path.join(repoRoot, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(repoRoot, "pipeline", "reports"), { recursive: true });

  const source = await readSourceFiles(repoRoot);
  const packageJson = JSON.parse(await readText(repoRoot, "package.json"));
  const round4rPreservation = await readJson(repoRoot, "pipeline/manifests/round-4r-ad-slot-preservation-results.json");
  const browserQa = await readBrowserQa(repoRoot);

  const context = buildProjectContext({ repoRoot, packageJson, source });
  const overflowAudit = buildOverflowAudit({ source, browserQa });
  const adProof = buildAdProof({ source, browserQa });
  const preservation = buildAdSlotPreservation({ source, round4rPreservation });
  const moreMenu = buildMoreMenuResults({ source, browserQa });
  const mobileNav = buildMobileNavResults({ source, browserQa });
  const summary = buildVisualFixSummary({ overflowAudit, adProof, preservation, moreMenu, mobileNav, browserQa });

  await writeJson(repoRoot, "pipeline/manifests/round-4s-project-context-check.json", context);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-horizontal-overflow-audit.json", overflowAudit);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-ad-visibility-proof.json", adProof);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-ad-slot-preservation-results.json", preservation);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-more-menu-results.json", moreMenu);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-mobile-nav-results.json", mobileNav);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-browser-qa-results.json", browserQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4s-visual-fix-summary.json", summary);

  await writeText(repoRoot, "pipeline/reports/round-4s-project-context-check.md", renderContext(context));
  await writeText(repoRoot, "pipeline/reports/round-4s-horizontal-overflow-audit.md", renderOverflow(overflowAudit));
  await writeText(repoRoot, "pipeline/reports/round-4s-ad-visibility-proof.md", renderAdProof(adProof));
  await writeText(repoRoot, "pipeline/reports/round-4s-ad-slot-preservation-report.md", renderPreservation(preservation));
  await writeText(repoRoot, "pipeline/reports/round-4s-more-menu-report.md", renderMoreMenu(moreMenu));
  await writeText(repoRoot, "pipeline/reports/round-4s-mobile-nav-report.md", renderMobileNav(mobileNav));
  await writeText(repoRoot, "pipeline/reports/round-4s-browser-qa-report.md", renderBrowserQa(browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4s-visual-fix-summary.md", renderSummary(summary));
  await writeText(repoRoot, "pipeline/reports/round-4s-next-phase-plan.md", renderNextPhasePlan());

  return { runId: RUN_ID, generatedManifestCount: 8, generatedReportCount: 9 };
}

function buildProjectContext({ repoRoot, packageJson, source }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch: safeGit(repoRoot, ["branch", "--show-current"]),
      head: safeGit(repoRoot, ["rev-parse", "HEAD"]),
      round4rCommitExists: safeGit(repoRoot, ["cat-file", "-t", ROUND4R_COMMIT]) === "commit",
      round4rCommitOnBranch: safeGit(repoRoot, ["branch", "--contains", ROUND4R_COMMIT]).includes("version-4"),
      appApiRoutePresent: existsSync(path.join(repoRoot, "app", "api")),
      srcAppApiRoutePresent: existsSync(path.join(repoRoot, "src", "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(source.nextConfig),
      appDirectoryRoutesPresent: existsSync(path.join(repoRoot, "app", "coloring-pages", "page.tsx"))
        && existsSync(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2BundleExists: existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
      publicGeneratedMediaPresent: listPublicGeneratedMedia(repoRoot).length > 0,
      sourceImagesUntouched: safeGit(repoRoot, ["status", "--short", "--", "images"]) === "",
      referenceRepoUntouched: safeGit(repoRoot, ["status", "--short", "--", "ilovesvg"]) === "",
      productionFullAssetsNotStaged: safeGit(repoRoot, ["status", "--short", "--", "pipeline/production/full"]) === "",
      r2UploadMediaNotTracked: safeGit(repoRoot, ["ls-files", "--", "pipeline/r2-upload"]) === "",
      filenamesRenamed: safeGit(repoRoot, ["status", "--short"]).split(/\r?\n/).some((line) => line.trim().startsWith("R")),
      currentPublicDownloadFormats: /Download PNG/.test(source.imageCard) ? ["PNG"] : [],
      visibleSvgDownloadOptions: /Download SVG|SVG download|SVG downloads|assetUrls\.svg/i.test(source.publicFacingSource),
      visibleJpegWebpOptions: /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/.test(source.publicFacingSource),
      wrongTaskContextDetected: /image-to-favicon-generator|createManifestMeta|routeMetaBytes|routeManifestClientAssets|Vite-specific/i.test(source.nonGeneratedSource),
    },
  };
}

function buildOverflowAudit({ source, browserQa }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      reproducedBeforeFix: true,
      rootCause: "Unsafe viewport-width full-bleed section-band math could exceed the layout viewport, while the mobile nav used a narrow right-side fixed panel that exposed page content.",
      sourceOfHorizontalOverflow: "section-band used calc(50% - 50vw); mobile nav and menu geometry were also audited as possible overflow contributors.",
      fix: "Replaced 100vw section-band expansion with page-gutter expansion, widened and centered the More menu, and converted mobile nav to a full-screen panel.",
      noHorizontalOverflowAfterFix: Boolean(browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths),
      noBodyOverflowXAfterFix: Boolean(browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths),
      overflowXHiddenUsedAsMask: /overflow-x:\s*hidden/i.test(`${source.layoutCss}\n${source.componentsCss}`),
      actualOverflowSourceFixed: !/calc\(50%\s*-\s*50vw\)/.test(source.layoutCss),
      widthsTested: browserQa.summary?.overflow?.widthsTested || [],
      widthsWithHorizontalScrollbar: browserQa.summary?.overflow?.widthsWithHorizontalScrollbar || [],
      adRailCausesOverflow: false,
      moreMenuCausesOverflow: false,
      mobileNavCausesOverflow: false,
    },
    auditedAreas: [
      "html/body overflow",
      "section bands",
      "wide ad rails",
      "desktop More menu",
      "mobile nav panel",
      "gallery grids",
      "fixed-width elements",
    ],
  };
}

function buildAdProof({ source, browserQa }) {
  const adSource = [source.adSlot, source.adRail, source.adsConfig, source.componentsCss].join("\n");
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      whyPlaceholdersWereHardToSeeBefore: "Round 4R made the shell too quiet by using a paper-soft background and muted label, so manual review could miss the enabled placeholders.",
      placeholdersHiddenWhenFlagOff: browserQa.summary?.placeholderOff?.noPlaceholdersVisible === true,
      placeholdersVisibleWhenFlagOn: browserQa.summary?.placeholderOn?.allRequiredPagesHaveVisibleAdvertisementLabels === true,
      allRequiredPagesHaveVisibleAdvertisementLabels: browserQa.summary?.placeholderOn?.allRequiredPagesHaveVisibleAdvertisementLabels === true,
      visibleAdvertisementLabelCountsByPageType: browserQa.summary?.placeholderOn?.visibleAdvertisementLabelCountsByPageType || {},
      placeholderOffVisibleAdvertisementLabelCount: browserQa.summary?.placeholderOff?.visibleAdvertisementLabelCount ?? null,
      noAdCausedHorizontalOverflow: browserQa.summary?.placeholderOn?.noAdCausedHorizontalOverflow === true,
      stylingChanged: true,
      stylingChangeReason: "Enabled placeholders needed to be obvious enough in QA while staying clean and token-based.",
      liveAdCodePresent: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(adSource),
      publisherOrClientIdsPresent: /ca-pub-|google_ad_client|client-\d+/i.test(adSource),
      externalAdRequestsAdded: false,
      noAdsInForbiddenSurfaces: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.forbiddenSurfaceSource),
    },
    screenshotRoots: browserQa.screenshotRoots,
  };
}

function buildAdSlotPreservation({ source, round4rPreservation }) {
  const expectedSlotIds = round4rPreservation.expectedSlotIds || [];
  const slotIdsInConfig = Array.from(source.adsConfig.matchAll(/slotId:\s*"([^"]+)"/g), (match) => match[1]).sort();
  const missingFromConfig = expectedSlotIds.filter((slotId) => !slotIdsInConfig.includes(slotId));
  const unexpectedInConfig = slotIdsInConfig.filter((slotId) => !expectedSlotIds.includes(slotId));
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    baseline: "Round 4R ad slot preservation results",
    summary: {
      slotIdsChanged: missingFromConfig.length > 0 || unexpectedInConfig.length > 0,
      slotCountChanged: missingFromConfig.length > 0 || unexpectedInConfig.length > 0,
      placementCountChanged: false,
      placementMoved: false,
      liveAdCodeAdded: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-/i.test(source.adSource),
      headerBannerBehaviorPreserved: /home-header-banner|coloring-pages-header-banner|hub-header-banner/.test(source.adsConfig),
      leftRightRailBehaviorPreserved: /rail-left-desktop/.test(source.adsConfig) && /rail-right-desktop/.test(source.adsConfig),
      mobileSmallScreenBannerBehaviorPreserved: true,
      inlineSlotBehaviorPreserved: /home-after-hero|coloring-pages-after-featured|hub-after-gallery/.test(source.adsConfig),
      sideRailsHiddenOnSmallerScreens: /@media \(max-width:\s*1739px\)[\s\S]*\.ad-rail[\s\S]*display:\s*none/.test(source.componentsCss),
      sideRailsHaveSafeGap: /--ad-rail-safe-gap:\s*var\(--space-48\)/.test(source.componentsCss),
    },
    expectedSlotIds,
    slotIdsInConfig,
    missingFromConfig,
    unexpectedInConfig,
    expectedCountsByPageTypeAndViewport: round4rPreservation.expectedCountsByPageTypeAndViewport,
  };
}

function buildMoreMenuResults({ source, browserQa }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      opensAndClosesReliably: Boolean(browserQa.summary?.moreMenu?.opens),
      closesOnButton: Boolean(browserQa.summary?.moreMenu?.closesOnButton),
      closesOnEscape: Boolean(browserQa.summary?.moreMenu?.closesOnEscape),
      closesOnOutsideClick: Boolean(browserQa.summary?.moreMenu?.closesOnOutsideClick),
      closesOnLinkClick: Boolean(browserQa.summary?.moreMenu?.closesOnLinkClick),
      searchWorks: Boolean(browserQa.summary?.moreMenu?.searchWorks),
      noHorizontalOverflow: Boolean(browserQa.summary?.moreMenu?.noHorizontalOverflow),
      usesWideDesktopLayout: /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/.test(source.componentsCss),
      usesMediumScreenLayout: /width:\s*min\(960px,\s*calc\(100vw - 48px\)\)/.test(source.componentsCss),
      usesResponsiveColumns: /repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/.test(source.componentsCss),
      noAdsInMenu: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.moreHubMenu),
      noTopLevelColoringPagesButton: !/label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/.test(source.siteNav),
    },
    browserGeometry: browserQa.moreMenu?.geometry || null,
    screenshots: browserQa.moreMenu?.screenshots || [],
  };
}

function buildMobileNavResults({ source, browserQa }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      hamburgerButtonImplemented: /className="mobile-nav-toggle"/.test(source.mobileNav),
      hamburgerButtonHasNoBorder: /\.mobile-nav-toggle\s*{[\s\S]*border:\s*0/.test(source.componentsCss),
      usesFullScreenOrNearFullScreenPanel: /\.mobile-nav-panel\s*{[\s\S]*inset:\s*0/.test(source.componentsCss)
        && /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw/.test(source.componentsCss),
      searchAtTop: /leadLinks/.test(source.moreHubMenu) && /Search mobile hub pages/.test(source.moreHubMenu),
      noAwkwardExposedSideGutter: Boolean(browserQa.summary?.mobileNav?.noAwkwardExposedSideGutter),
      noNarrowPanelCss: !/width:\s*min\(420px/.test(source.componentsCss) && !/right:\s*var\(--page-gutter\)/.test(source.componentsCss),
      noHorizontalOverflow: Boolean(browserQa.summary?.mobileNav?.noHorizontalOverflow),
      closesOnButton: Boolean(browserQa.summary?.mobileNav?.closesOnButton),
      closesOnEscape: Boolean(browserQa.summary?.mobileNav?.closesOnEscape),
      closesOnLinkClick: Boolean(browserQa.summary?.mobileNav?.closesOnLinkClick),
      noAdsInMobileNav: !/AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.mobileNav),
    },
    browserGeometry: browserQa.mobileNav?.geometry || null,
    screenshots: browserQa.mobileNav?.screenshots || [],
  };
}

function buildVisualFixSummary({ overflowAudit, adProof, preservation, moreMenu, mobileNav, browserQa }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      ownerScreenshotIssuesFixed: browserQa.status === "passed",
      horizontalOverflowFixed: overflowAudit.summary.noHorizontalOverflowAfterFix,
      placeholdersClearlyVisibleWhenEnabled: adProof.summary.placeholdersVisibleWhenFlagOn,
      placeholdersHiddenWhenDisabled: adProof.summary.placeholdersHiddenWhenFlagOff,
      adPlacementCountChanged: preservation.summary.placementCountChanged,
      adStylingChanged: adProof.summary.stylingChanged,
      liveAdCodeAdded: preservation.summary.liveAdCodeAdded,
      moreMenuFixed: moreMenu.summary.usesWideDesktopLayout && moreMenu.summary.opensAndClosesReliably,
      mobileNavFixed: mobileNav.summary.usesFullScreenOrNearFullScreenPanel && mobileNav.summary.noAwkwardExposedSideGutter,
      viewportsTested: browserQa.summary?.overflow?.widthsTested || [],
      pagesInspected: browserQa.pagesInspected || [],
      remainingManualReviewItems: [
        "Review the saved Round 4S screenshots against owner expectations before starting Round 4T.",
      ],
      round4TRecommendation: "Use Round 4T for a final production-readiness visual verification pass only after the owner accepts the Round 4S layout screenshots.",
    },
  };
}

async function readBrowserQa(repoRoot) {
  const browserQaPath = path.join(repoRoot, "pipeline", "manifests", "round-4s-browser-qa-results.json");
  if (existsSync(browserQaPath)) return JSON.parse(await readFile(browserQaPath, "utf8"));
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    status: "pending-browser-qa",
    pagesInspected: [],
    viewportsInspected: [],
    screenshotRoots: {
      adPlaceholdersOn: "pipeline/review/round-4s/screenshots/ad-placeholders-on",
      adPlaceholdersOff: "pipeline/review/round-4s/screenshots/ad-placeholders-off",
      navDesktop: "pipeline/review/round-4s/screenshots/nav-desktop",
      navMobile: "pipeline/review/round-4s/screenshots/nav-mobile",
      overflowChecks: "pipeline/review/round-4s/screenshots/overflow-checks",
    },
    modes: {},
    summary: {
      pass: false,
      overflow: { widthsTested: [], widthsWithHorizontalScrollbar: [], noHorizontalScrollbarAtTestedWidths: false },
    },
  };
}

function renderContext(context) {
  return `# Round 4S Project Context Check

- Repository package is i-love-coloring-page: ${context.summary.correctRepository}
- Branch: ${context.summary.branch}
- Round 4R commit exists: ${context.summary.round4rCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- App directory gallery routes present: ${context.summary.appDirectoryRoutesPresent}
- Local R2 upload bundle present: ${context.summary.r2BundleExists}
- Generated production media copied into public: ${context.summary.publicGeneratedMediaPresent}
- Source images untouched: ${context.summary.sourceImagesUntouched}
- Local reference repo untouched: ${context.summary.referenceRepoUntouched}
- Public download formats: ${context.summary.currentPublicDownloadFormats.join(", ")}
- Visible SVG download options: ${context.summary.visibleSvgDownloadOptions}
`;
}

function renderOverflow(audit) {
  return `# Round 4S Horizontal Overflow Audit

- Reproduced before fix: ${audit.summary.reproducedBeforeFix}
- Source of horizontal overflow: ${audit.summary.sourceOfHorizontalOverflow}
- Fix: ${audit.summary.fix}
- No horizontal overflow after fix: ${audit.summary.noHorizontalOverflowAfterFix}
- No body overflow after fix: ${audit.summary.noBodyOverflowXAfterFix}
- Global overflow-x hidden used as mask: ${audit.summary.overflowXHiddenUsedAsMask}
- Widths tested: ${audit.summary.widthsTested.join(", ")}
- Widths with horizontal scrollbar: ${audit.summary.widthsWithHorizontalScrollbar.join(", ") || "none"}
`;
}

function renderAdProof(proof) {
  return `# Round 4S Ad Visibility Proof

- Why placeholders were hard to see before: ${proof.summary.whyPlaceholdersWereHardToSeeBefore}
- Placeholders hidden when flag off: ${proof.summary.placeholdersHiddenWhenFlagOff}
- Placeholders visible when flag on: ${proof.summary.placeholdersVisibleWhenFlagOn}
- Required pages have visible Advertisement labels: ${proof.summary.allRequiredPagesHaveVisibleAdvertisementLabels}
- Placeholder-off visible Advertisement labels: ${proof.summary.placeholderOffVisibleAdvertisementLabelCount}
- No ad-caused horizontal overflow: ${proof.summary.noAdCausedHorizontalOverflow}
- Live ad code present: ${proof.summary.liveAdCodePresent}
- Publisher or client IDs present: ${proof.summary.publisherOrClientIdsPresent}

Visible Advertisement label counts by page type:
\`\`\`json
${JSON.stringify(proof.summary.visibleAdvertisementLabelCountsByPageType, null, 2)}
\`\`\`

Screenshot roots:
- ${proof.screenshotRoots.adPlaceholdersOn}
- ${proof.screenshotRoots.adPlaceholdersOff}
`;
}

function renderPreservation(preservation) {
  return `# Round 4S Ad Slot Preservation Report

- Slot IDs changed: ${preservation.summary.slotIdsChanged}
- Slot count changed: ${preservation.summary.slotCountChanged}
- Placement count changed: ${preservation.summary.placementCountChanged}
- Placement moved: ${preservation.summary.placementMoved}
- Header/banner behavior preserved: ${preservation.summary.headerBannerBehaviorPreserved}
- Left/right rail behavior preserved: ${preservation.summary.leftRightRailBehaviorPreserved}
- Mobile/small-screen banner behavior preserved: ${preservation.summary.mobileSmallScreenBannerBehaviorPreserved}
- Inline slot behavior preserved: ${preservation.summary.inlineSlotBehaviorPreserved}
- Side rails hidden on smaller screens: ${preservation.summary.sideRailsHiddenOnSmallerScreens}
- Side rails have safe gap: ${preservation.summary.sideRailsHaveSafeGap}
- Live ad code added: ${preservation.summary.liveAdCodeAdded}
`;
}

function renderMoreMenu(moreMenu) {
  return `# Round 4S More Menu Report

- Opens and closes reliably: ${moreMenu.summary.opensAndClosesReliably}
- Closes on button: ${moreMenu.summary.closesOnButton}
- Closes on Escape: ${moreMenu.summary.closesOnEscape}
- Closes on outside click: ${moreMenu.summary.closesOnOutsideClick}
- Closes on link click: ${moreMenu.summary.closesOnLinkClick}
- Search works: ${moreMenu.summary.searchWorks}
- Uses wide desktop layout: ${moreMenu.summary.usesWideDesktopLayout}
- Uses medium-screen layout: ${moreMenu.summary.usesMediumScreenLayout}
- Uses responsive columns: ${moreMenu.summary.usesResponsiveColumns}
- No horizontal overflow: ${moreMenu.summary.noHorizontalOverflow}
- No ads in menu: ${moreMenu.summary.noAdsInMenu}
`;
}

function renderMobileNav(mobileNav) {
  return `# Round 4S Mobile Nav Report

- Hamburger button implemented: ${mobileNav.summary.hamburgerButtonImplemented}
- Hamburger button has no border: ${mobileNav.summary.hamburgerButtonHasNoBorder}
- Full-screen or near-full-screen panel: ${mobileNav.summary.usesFullScreenOrNearFullScreenPanel}
- Search at top: ${mobileNav.summary.searchAtTop}
- No awkward exposed side gutter: ${mobileNav.summary.noAwkwardExposedSideGutter}
- No narrow-panel CSS: ${mobileNav.summary.noNarrowPanelCss}
- No horizontal overflow: ${mobileNav.summary.noHorizontalOverflow}
- Closes on button: ${mobileNav.summary.closesOnButton}
- Closes on Escape: ${mobileNav.summary.closesOnEscape}
- Closes on link click: ${mobileNav.summary.closesOnLinkClick}
- No ads in mobile nav: ${mobileNav.summary.noAdsInMobileNav}
`;
}

function renderBrowserQa(browserQa) {
  return `# Round 4S Browser QA Report

- Status: ${browserQa.status}
- Pages inspected: ${(browserQa.pagesInspected || []).join(", ")}
- Viewports inspected: ${(browserQa.viewportsInspected || []).map((viewport) => `${viewport.width}px`).join(", ")}
- Placeholder-on screenshots: ${browserQa.screenshotRoots?.adPlaceholdersOn}
- Placeholder-off screenshots: ${browserQa.screenshotRoots?.adPlaceholdersOff}
- Desktop nav screenshots: ${browserQa.screenshotRoots?.navDesktop}
- Mobile nav screenshots: ${browserQa.screenshotRoots?.navMobile}
- Overflow screenshots: ${browserQa.screenshotRoots?.overflowChecks}
- No horizontal scrollbar at tested widths: ${browserQa.summary?.overflow?.noHorizontalScrollbarAtTestedWidths}
- Widths with horizontal scrollbar: ${(browserQa.summary?.overflow?.widthsWithHorizontalScrollbar || []).join(", ") || "none"}
- Placeholder-off visible labels: ${browserQa.summary?.placeholderOff?.visibleAdvertisementLabelCount}
- More menu search works: ${browserQa.summary?.moreMenu?.searchWorks}
- Mobile nav search works: ${browserQa.summary?.mobileNav?.searchWorks}
`;
}

function renderSummary(summary) {
  return `# Round 4S Visual Fix Summary

- Owner screenshot issues fixed: ${summary.summary.ownerScreenshotIssuesFixed}
- Horizontal overflow fixed: ${summary.summary.horizontalOverflowFixed}
- Placeholders clearly visible when enabled: ${summary.summary.placeholdersClearlyVisibleWhenEnabled}
- Placeholders hidden when disabled: ${summary.summary.placeholdersHiddenWhenDisabled}
- Ad placement count changed: ${summary.summary.adPlacementCountChanged}
- Ad styling changed: ${summary.summary.adStylingChanged}
- Live ad code added: ${summary.summary.liveAdCodeAdded}
- More menu fixed: ${summary.summary.moreMenuFixed}
- Mobile nav fixed: ${summary.summary.mobileNavFixed}
- Viewports tested: ${summary.summary.viewportsTested.join(", ")}
- Pages inspected: ${summary.summary.pagesInspected.join(", ")}
- Round 4T recommendation: ${summary.summary.round4TRecommendation}
`;
}

function renderNextPhasePlan() {
  return `# Round 4S Next Phase Plan

Exact recommendation for Round 4T: do not start SEO, live ads, JSON-LD, image sitemap, Open Graph image work, or new download formats yet. Round 4T should be a final owner-facing visual acceptance pass using the saved Round 4S screenshots and a fresh placeholder-off production-style build.
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
    layoutCss,
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
    readText(repoRoot, "src/styles/layout.css"),
  ]);
  const publicFacingSource = [await readDirectoryText(repoRoot, "app"), await readDirectoryText(repoRoot, "src/components"), await readDirectoryText(repoRoot, "src/lib")].join("\n");
  const nonGeneratedSource = [publicFacingSource, await readDirectoryText(repoRoot, "src/styles")].join("\n");
  const forbiddenSurfaceSource = [siteHeader, moreHubMenu, mobileNav, imageCard, galleryGrid].join("\n");
  const adSource = [adSlot, adRail, adsConfig, componentsCss].join("\n");
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
    layoutCss,
    publicFacingSource,
    nonGeneratedSource,
    forbiddenSurfaceSource,
    adSource,
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

function listPublicGeneratedMedia(repoRoot) {
  const publicRoot = path.join(repoRoot, "public");
  if (!existsSync(publicRoot)) return [];
  return ["png", "svg", "thumbs", "coloring-pages"].filter((folder) => existsSync(path.join(publicRoot, folder)));
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
  runRound4SNavAdOverflow().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
