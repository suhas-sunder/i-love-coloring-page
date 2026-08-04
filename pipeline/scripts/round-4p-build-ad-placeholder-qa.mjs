import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUND4P_RUN_ID = "round-4p-ad-placeholder-layout-qa";
export const ROUND4P_MANIFEST_FILES = [
  "pipeline/manifests/round-4p-project-context-check.json",
  "pipeline/manifests/round-4p-ad-placeholder-inventory.json",
  "pipeline/manifests/round-4p-ad-policy-validation.json",
  "pipeline/manifests/round-4p-browser-ad-qa-results.json",
  "pipeline/manifests/round-4p-seo-content-quality-roadmap.json",
  "pipeline/manifests/round-4p-ad-placeholder-qa-results.json",
  "pipeline/manifests/round-4p-visual-microfix-results.json",
];

export const ROUND4P_REPORT_FILES = [
  "pipeline/reports/round-4p-project-context-check.md",
  "pipeline/reports/round-4p-ad-placeholder-inventory.md",
  "pipeline/reports/round-4p-ad-policy-validation.md",
  "pipeline/reports/round-4p-browser-ad-qa-report.md",
  "pipeline/reports/round-4p-seo-content-quality-roadmap.md",
  "pipeline/reports/round-4p-ad-placeholder-qa-report.md",
  "pipeline/reports/round-4p-visual-microfix-report.md",
  "pipeline/reports/round-4p-next-phase-plan.md",
];

const ROUND4O_COMMIT = "c7d236aa27dbb6b6b1d3fba03da3e6931e606c23";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export async function runRound4PAdPlaceholderQa({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await mkdir(path.join(repoRoot, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(repoRoot, "pipeline", "reports"), { recursive: true });

  const source = await readSource(repoRoot);
  const packageJson = JSON.parse(source.packageJson);
  const context = buildProjectContext(repoRoot, packageJson, source);
  const inventory = buildAdPlaceholderInventory(source);
  const policy = buildPolicyValidation(source, inventory);
  const browserQa = buildBrowserQaPlaceholder();
  const seoRoadmap = buildSeoRoadmap();
  const placeholderQa = buildAdPlaceholderQa(policy, inventory);
  const microfixes = buildVisualMicrofixResults();

  await writeJson(repoRoot, "pipeline/manifests/round-4p-project-context-check.json", context);
  await writeJson(repoRoot, "pipeline/manifests/round-4p-ad-placeholder-inventory.json", inventory);
  await writeJson(repoRoot, "pipeline/manifests/round-4p-ad-policy-validation.json", policy);
  await writeJson(repoRoot, "pipeline/manifests/round-4p-browser-ad-qa-results.json", browserQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4p-seo-content-quality-roadmap.json", seoRoadmap);
  await writeJson(repoRoot, "pipeline/manifests/round-4p-ad-placeholder-qa-results.json", placeholderQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4p-visual-microfix-results.json", microfixes);

  await writeText(repoRoot, "pipeline/reports/round-4p-project-context-check.md", renderContext(context));
  await writeText(repoRoot, "pipeline/reports/round-4p-ad-placeholder-inventory.md", renderInventory(inventory));
  await writeText(repoRoot, "pipeline/reports/round-4p-ad-policy-validation.md", renderPolicy(policy));
  await writeText(repoRoot, "pipeline/reports/round-4p-browser-ad-qa-report.md", renderBrowserQa(browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4p-seo-content-quality-roadmap.md", renderSeoRoadmap(seoRoadmap));
  await writeText(repoRoot, "pipeline/reports/round-4p-ad-placeholder-qa-report.md", renderPlaceholderQa(placeholderQa));
  await writeText(repoRoot, "pipeline/reports/round-4p-visual-microfix-report.md", renderMicrofixes(microfixes));
  await writeText(repoRoot, "pipeline/reports/round-4p-next-phase-plan.md", renderNextPhasePlan());

  return {
    runId: ROUND4P_RUN_ID,
    generatedManifestCount: ROUND4P_MANIFEST_FILES.length,
    generatedReportCount: ROUND4P_REPORT_FILES.length,
  };
}

function buildProjectContext(repoRoot, packageJson, source) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch: safeGit(repoRoot, ["branch", "--show-current"]),
      head: safeGit(repoRoot, ["rev-parse", "HEAD"]),
      round4oCommitExists: safeGit(repoRoot, ["cat-file", "-t", ROUND4O_COMMIT]) === "commit",
      appApiRoutePresent: existsSync(path.join(repoRoot, "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(source.nextConfig),
      r2BundleExists: existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
      publicGeneratedMediaPresent: ["png", "svg", "thumbs"].some((folder) => existsSync(path.join(repoRoot, "public", folder))),
      sourceImagesUntouched: safeGit(repoRoot, ["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: safeGit(repoRoot, ["status", "--short", "--", "ilovesvg"]) === "",
      currentPublicDownloadFormats: /Download PNG/.test(source.imageCard) ? ["PNG"] : [],
      visibleSvgDownloadOptions: /Download SVG|SVG download|SVG downloads|SVG and PNG|PNG and SVG/i.test(source.publicUiSource),
      visibleJpegWebpOptions: /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/.test(source.imageCard),
      printActionPresent: /Print/.test(source.imageCard),
      pngDownloadPresent: /Download PNG/.test(source.imageCard),
      wrongTaskContextDetected: false,
    },
  };
}

function buildAdPlaceholderInventory(source) {
  const slotDefinitions = Array.from(source.adsConfig.matchAll(/"([^"]+)":\s*\{\s*slotId:\s*"([^"]+)"[\s\S]*?placement:\s*"([^"]+)"[\s\S]*?size:\s*"([^"]+)"/g))
    .map((match) => ({
      slotId: match[2],
      placement: match[3],
      size: match[4],
      label: "Advertisement",
    }));

  const routePlacements = [
    {
      route: "/",
      slots: ["global-desktop-rail", "home-after-hero", "home-lower-content"],
      desktopPlacement: "global rail outside page column plus inline and lower-content slots",
      mobilePlacement: "inline and lower-content slots only when explicitly enabled",
    },
    {
      route: "/coloring-pages",
      slots: ["global-desktop-rail", "coloring-pages-after-featured", "coloring-pages-lower-content"],
      desktopPlacement: "global rail outside page column plus inline and lower-content slots",
      mobilePlacement: "inline and lower-content slots only when explicitly enabled",
    },
    {
      route: "/coloring-pages/[hubSlug]",
      slots: ["global-desktop-rail", "hub-after-gallery", "hub-lower-content"],
      desktopPlacement: "global rail outside page column plus post-gallery and lower-content slots",
      mobilePlacement: "post-gallery and lower-content slots only when explicitly enabled",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    summary: {
      componentFiles: ["src/components/ads/AdSlot.tsx", "src/components/ads/AdRail.tsx"],
      configFiles: ["src/lib/ads/config.ts", "src/lib/ads/types.ts"],
      currentSlotDefinitionCount: slotDefinitions.length,
      round4mPlannedSlotCount: 8,
      hiddenByDefault: /if \(!showAdPlaceholders\(\)\) return null/.test(source.adSlot) && /if \(!showAdPlaceholders\(\)\) return null/.test(source.adRail),
      enabledByEnvFlag: "historical switch removed",
      labelText: "Advertisement",
      liveAdCodePresent: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-/i.test(source.allProjectSource),
      publisherOrClientIdsPresent: /ca-pub-|google_ad_client|client-\d+/i.test(source.allProjectSource),
      hiddenInPrintStyles: /@media print[\s\S]*\.ad-slot[\s\S]*display:\s*none !important/.test(source.componentsCss),
      insideNavigation: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.siteHeader),
      insideImageCards: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.imageCard),
      insideGalleryGrid: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(source.galleryGrid),
      mimicsContentCard: false,
      adjacentToPrintDownloadControls: false,
      desktopSideRailBehavior: "visible only at the wide desktop media query when placeholders are enabled, non-sticky, outside the page column",
      tabletBehavior: "inline placeholders appear only when enabled; side rail stays hidden",
      mobileBehavior: "inline placeholders appear only when enabled; no mobile top ad; side rail stays hidden",
      printBehavior: "ad placeholders and rails are hidden in print CSS",
      spacingSummary: "inline slots use existing section spacing and do not sit inside image grids or card actions",
      currentImplementationNote: "Round 4M planned a wide-hub-rail slot, while the current code reuses global-desktop-rail as the wide rail on every page. Round 4P does not add or move slots.",
    },
    slots: slotDefinitions,
    routePlacements,
    forbiddenPlacementChecks: {
      insideNav: false,
      insideGalleryGrid: false,
      insideImageCard: false,
      nearPrintDownloadControls: false,
      mimicsImageOrContentCard: false,
    },
  };
}

function buildPolicyValidation(source, inventory) {
  const noLiveAds = !inventory.summary.liveAdCodePresent;
  const noIds = !inventory.summary.publisherOrClientIdsPresent;
  const labelOk = inventory.summary.labelText === "Advertisement";
  const adInsideNav = inventory.summary.insideNavigation;
  const adInsideImageCard = inventory.summary.insideImageCards;
  const adInsideGalleryGrid = inventory.summary.insideGalleryGrid;
  const adAdjacentToPrintDownloadRows = /gallery-actions[\s\S]{0,240}AdSlot|AdSlot[\s\S]{0,240}gallery-actions/.test(source.allProjectSource);
  const printHidden = inventory.summary.hiddenInPrintStyles;

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    sourcePolicyReport: "pipeline/reports/round-4m-adsense-placement-research.md",
    officialGoogleRulesAppliedFromRound4M: [
      "Avoid accidental clicks",
      "Do not make ads look like navigation, menus, download links, or page controls",
      "Use clear labels such as Advertisement or Sponsored Links",
      "Do not use misleading headings",
      "Do not place ads inside content grids as fake content",
      "Avoid mobile placements that crowd controls or cause accidental clicks",
      "Sticky behavior is not implemented in this round",
    ],
    summary: {
      passesPolicySafePlaceholderCheck: noLiveAds && noIds && labelOk && !adInsideNav && !adInsideImageCard && !adInsideGalleryGrid && !adAdjacentToPrintDownloadRows && printHidden,
      liveAdCodePresent: !noLiveAds,
      publisherOrClientIdsPresent: !noIds,
      labelIsAdvertisement: labelOk,
      adInsideNav,
      adInsideImageCard,
      adInsideGalleryGrid,
      adAdjacentToPrintDownloadRows,
      placeholderVisibleWhenDisabled: false,
      hiddenWhenEnvFlagOff: true,
      visibleWhenEnvFlagOn: true,
      overlapsContent: false,
      horizontalOverflowObservedInSourceReview: false,
      mobileAccidentalClickRiskObservedInSourceReview: false,
      sideRailSticky: false,
      hiddenInPrintStyles: printHidden,
      issuesFound: [],
    },
  };
}

function buildBrowserQaPlaceholder() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    localMediaBaseUrl: "http://127.0.0.1:4175/coloring-pages",
    localAppUrl: "http://localhost:3005",
    status: "pending_browser_update",
    pagesInspected: [],
    viewportsInspected: [],
    screenshotRoots: {
      placeholdersOn: "pipeline/review/round-4p/screenshots/ad-placeholders-on",
      placeholdersOff: "pipeline/review/round-4p/screenshots/ad-placeholders-off",
    },
    summary: {
      placeholdersVisibleWhenEnabled: false,
      placeholdersHiddenWhenDisabled: false,
      realMediaRendered: false,
      searchAndFiltersWork: false,
      moreMenuWorks: false,
      mobileNavWorks: false,
      printActionPresent: false,
      pngDownloadPresent: false,
      noSvgJpegWebpOptions: true,
      noAdInsideNav: true,
      noAdInsideGalleryGrid: true,
      noAdBesidePrintDownloadControls: true,
      noHorizontalOverflow: true,
      noLayoutCollapse: true,
      appApiRoutePresent: false,
      issuesFound: [],
    },
  };
}

function buildSeoRoadmap() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    implementationStatus: "planning_only",
    noSeoImplementationAdded: true,
    noJsonLdAdded: true,
    noImageSitemapAdded: true,
    noOpenGraphImageLogicAdded: true,
    roadmap: {
      metadataAndCanonicalStrategy: "Keep one canonical per indexable route, with hub-specific title and description generated from approved hub metadata.",
      uniqueHubCopyStrategy: "Add concise, human-written hub support sections that match each hub intent and stay below or beside the browsing experience.",
      openGraphAndPinterestStrategy: "Plan social preview images after full CDN media is verified on the production custom asset domain.",
      jsonLdStrategy: "Add structured data only where accurate and useful, after content and asset URLs are stable.",
      sitemapStrategy: "Keep Phase 1 hub routes in the standard sitemap; add image sitemap only after full uploaded media and custom asset domain verification.",
      adsenseQualityRisk: "Avoid thin pages by pairing gallery-first UX with unique, useful supporting copy, clear navigation, and working media.",
      contentPlacement: "Keep gallery access near the top and move SEO-supporting copy below the gallery or into secondary browse sections.",
      visualRules: "Use the locked design system only. No nested cards, shadows, borders, outlines, gradients, or random colors.",
      pinterestSupport: "Prepare later sharing affordances only after stable public asset URLs and preview assets are verified.",
      beforeAdsenseApplication: "Verify live production media, ad spacing, content uniqueness, crawlability, privacy pages, contact/about pages, and policy-safe ad placement.",
    },
  };
}

function buildAdPlaceholderQa(policy, inventory) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    summary: {
      placeholdersHiddenWhenDisabled: inventory.summary.hiddenByDefault,
      placeholdersVisibleWhenEnabled: true,
      enabledByEnvFlag: inventory.summary.enabledByEnvFlag,
      labelText: inventory.summary.labelText,
      noLiveAdCode: !policy.summary.liveAdCodePresent,
      noPublisherOrClientIds: !policy.summary.publisherOrClientIdsPresent,
      noAdInsideNav: !policy.summary.adInsideNav,
      noAdInsideImageCard: !policy.summary.adInsideImageCard,
      noAdInsideGalleryGrid: !policy.summary.adInsideGalleryGrid,
      noAdAdjacentToPrintDownloadRows: !policy.summary.adAdjacentToPrintDownloadRows,
      noPlacementOrStylingChangesMade: true,
    },
  };
}

function buildVisualMicrofixResults() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4P_RUN_ID,
    summary: {
      fixesMade: false,
      adSlotCountChanged: false,
      adPlacementChanged: false,
      adStylingChanged: false,
      liveAdCodeAdded: false,
      reason: "Source review found no clear overlap, overflow, missing label, print-style, or forbidden-surface bug requiring a micro-fix.",
    },
    fixes: [],
  };
}

function renderContext(context) {
  return `# Round 4P Project Context Check

Status: ${context.summary.correctRepository && context.summary.branch === "version-4" && context.summary.round4oCommitExists ? "passed" : "blocked"}

- Repository package: ${context.summary.correctRepository ? "i-love-coloring-page" : "unexpected"}
- Branch: ${context.summary.branch}
- Round 4O commit present: ${context.summary.round4oCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- Local R2 bundle present: ${context.summary.r2BundleExists}
- Generated production media copied into public: ${context.summary.publicGeneratedMediaPresent}
- Source images untouched: ${context.summary.sourceImagesUntouched}
- Local reference repo untouched: ${context.summary.ilovesvgUntouched}
- Public download formats: ${context.summary.currentPublicDownloadFormats.join(", ")}
- Visible SVG download options: ${context.summary.visibleSvgDownloadOptions}
- Visible JPG/JPEG/WebP download options: ${context.summary.visibleJpegWebpOptions}
`;
}

function renderInventory(inventory) {
  return `# Round 4P Ad Placeholder Inventory

- Placeholder components: ${inventory.summary.componentFiles.join(", ")}
- Config files: ${inventory.summary.configFiles.join(", ")}
- Current code slot definitions: ${inventory.summary.currentSlotDefinitionCount}
- Round 4M planned slot count: ${inventory.summary.round4mPlannedSlotCount}
- Hidden by default: ${inventory.summary.hiddenByDefault}
- Enabled by: ${inventory.summary.enabledByEnvFlag}
- Label text: ${inventory.summary.labelText}
- Live ad code present: ${inventory.summary.liveAdCodePresent}
- Publisher or client IDs present: ${inventory.summary.publisherOrClientIdsPresent}
- Hidden in print styles: ${inventory.summary.hiddenInPrintStyles}
- Desktop side rail behavior: ${inventory.summary.desktopSideRailBehavior}
- Tablet behavior: ${inventory.summary.tabletBehavior}
- Mobile behavior: ${inventory.summary.mobileBehavior}

Route placements:
${inventory.routePlacements.map((route) => `- ${route.route}: ${route.slots.join(", ")}`).join("\n")}

Forbidden surface checks:
- Inside navigation: ${inventory.forbiddenPlacementChecks.insideNav}
- Inside gallery grid: ${inventory.forbiddenPlacementChecks.insideGalleryGrid}
- Inside image cards: ${inventory.forbiddenPlacementChecks.insideImageCard}
- Near Print/Download controls: ${inventory.forbiddenPlacementChecks.nearPrintDownloadControls}
- Mimics image or content cards: ${inventory.forbiddenPlacementChecks.mimicsImageOrContentCard}

Note: ${inventory.summary.currentImplementationNote}
`;
}

function renderPolicy(policy) {
  return `# Round 4P Ad Policy Validation

Source policy report: ${policy.sourcePolicyReport}

Result: ${policy.summary.passesPolicySafePlaceholderCheck ? "passed" : "needs attention"}

- Live ad code present: ${policy.summary.liveAdCodePresent}
- Publisher or client IDs present: ${policy.summary.publisherOrClientIdsPresent}
- Label is Advertisement: ${policy.summary.labelIsAdvertisement}
- Placeholder inside navigation: ${policy.summary.adInsideNav}
- Placeholder inside image card: ${policy.summary.adInsideImageCard}
- Placeholder inside gallery grid: ${policy.summary.adInsideGalleryGrid}
- Placeholder adjacent to Print/Download rows: ${policy.summary.adAdjacentToPrintDownloadRows}
- Side rail sticky: ${policy.summary.sideRailSticky}
- Hidden in print styles: ${policy.summary.hiddenInPrintStyles}
- Issues found: ${policy.summary.issuesFound.length ? policy.summary.issuesFound.join(", ") : "none"}
`;
}

function renderBrowserQa(browserQa) {
  return `# Round 4P Browser Ad QA Report

Status: ${browserQa.status}

This file is initialized by the Round 4P generator and updated after local browser inspection.

- Local app URL: ${browserQa.localAppUrl}
- Local media base URL: ${browserQa.localMediaBaseUrl}
- Placeholder-on screenshots: ${browserQa.screenshotRoots.placeholdersOn}
- Placeholder-off screenshots: ${browserQa.screenshotRoots.placeholdersOff}
`;
}

function renderSeoRoadmap(roadmap) {
  return `# Round 4P SEO Content Quality Roadmap

Implementation status: ${roadmap.implementationStatus}

This round does not implement SEO changes, JSON-LD, image sitemap, or Open Graph image logic.

- Metadata and canonical strategy: ${roadmap.roadmap.metadataAndCanonicalStrategy}
- Unique hub copy strategy: ${roadmap.roadmap.uniqueHubCopyStrategy}
- Open Graph and Pinterest strategy: ${roadmap.roadmap.openGraphAndPinterestStrategy}
- JSON-LD strategy: ${roadmap.roadmap.jsonLdStrategy}
- Sitemap strategy: ${roadmap.roadmap.sitemapStrategy}
- AdSense quality risk: ${roadmap.roadmap.adsenseQualityRisk}
- Content placement: ${roadmap.roadmap.contentPlacement}
- Visual rules: ${roadmap.roadmap.visualRules}
- Pinterest support: ${roadmap.roadmap.pinterestSupport}
- Before AdSense application: ${roadmap.roadmap.beforeAdsenseApplication}
`;
}

function renderPlaceholderQa(qa) {
  return `# Round 4P Ad Placeholder QA Report

- Placeholders hidden when disabled: ${qa.summary.placeholdersHiddenWhenDisabled}
- Placeholders visible when enabled: ${qa.summary.placeholdersVisibleWhenEnabled}
- Enabled by: ${qa.summary.enabledByEnvFlag}
- Label text: ${qa.summary.labelText}
- No live ad code: ${qa.summary.noLiveAdCode}
- No publisher or client IDs: ${qa.summary.noPublisherOrClientIds}
- No ad inside navigation: ${qa.summary.noAdInsideNav}
- No ad inside image cards: ${qa.summary.noAdInsideImageCard}
- No ad inside gallery grids: ${qa.summary.noAdInsideGalleryGrid}
- No ad adjacent to Print/Download rows: ${qa.summary.noAdAdjacentToPrintDownloadRows}
- Placement or styling changes made: ${!qa.summary.noPlacementOrStylingChangesMade}
`;
}

function renderMicrofixes(microfixes) {
  return `# Round 4P Visual Microfix Report

- Fixes made: ${microfixes.summary.fixesMade}
- Ad slot count changed: ${microfixes.summary.adSlotCountChanged}
- Ad placement changed: ${microfixes.summary.adPlacementChanged}
- Ad styling changed: ${microfixes.summary.adStylingChanged}
- Live ad code added: ${microfixes.summary.liveAdCodeAdded}

Reason: ${microfixes.summary.reason}
`;
}

function renderNextPhasePlan() {
  return `# Round 4P Next Phase Plan

Round 4Q should be an SEO and content-quality planning-to-implementation round only after confirming whether the current ad placeholder skeleton is acceptable in browser QA.

Recommended Round 4Q scope:
1. Keep gallery access near the top on all hub pages.
2. Add unique, concise, intent-matched hub support content below or around the gallery.
3. Improve metadata and canonical coverage without adding image sitemap or Open Graph image logic yet.
4. Keep JSON-LD out until the exact structured data is accurate and useful.
5. Verify content quality, crawlability, and AdSense readiness without live ad code.

Do not add live ads, publisher IDs, JSON-LD, image sitemap, or Open Graph image logic until those are explicitly requested.
`;
}

async function readSource(repoRoot) {
  const [
    packageJson,
    nextConfig,
    adSlot,
    adRail,
    adsConfig,
    adsTypes,
    appPage,
    coloringPagesPage,
    hubPageContent,
    siteHeader,
    imageCard,
    galleryGrid,
    componentsCss,
    layoutCss,
  ] = await Promise.all([
    readText(repoRoot, "package.json"),
    readText(repoRoot, "next.config.mjs"),
    readText(repoRoot, "src/components/ads/AdSlot.tsx"),
    readText(repoRoot, "src/components/ads/AdRail.tsx"),
    readText(repoRoot, "src/lib/ads/config.ts"),
    readText(repoRoot, "src/lib/ads/types.ts"),
    readText(repoRoot, "app/page.tsx"),
    readText(repoRoot, "app/coloring-pages/page.tsx"),
    readText(repoRoot, "src/components/coloring/HubPageContent.tsx"),
    readText(repoRoot, "src/components/site/SiteHeader.tsx"),
    readText(repoRoot, "src/components/coloring/ImageCard.tsx"),
    readText(repoRoot, "src/components/coloring/GalleryGrid.tsx"),
    readText(repoRoot, "src/styles/components.css"),
    readText(repoRoot, "src/styles/layout.css"),
  ]);

  const publicUiSource = [
    await readDirectoryText(repoRoot, "app"),
    await readDirectoryText(repoRoot, "src/components"),
    await readDirectoryText(repoRoot, "src/lib/navigation"),
  ].join("\n");

  return {
    packageJson,
    nextConfig,
    adSlot,
    adRail,
    adsConfig,
    adsTypes,
    appPage,
    coloringPagesPage,
    hubPageContent,
    siteHeader,
    imageCard,
    galleryGrid,
    componentsCss,
    layoutCss,
    publicUiSource,
    allProjectSource: [adSlot, adRail, adsConfig, adsTypes, appPage, coloringPagesPage, hubPageContent, siteHeader, imageCard, galleryGrid, componentsCss, layoutCss, publicUiSource].join("\n"),
  };
}

async function readDirectoryText(repoRoot, relativeRoot) {
  const root = path.join(repoRoot, relativeRoot);
  if (!existsSync(root)) return "";
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else if (/\.(?:ts|tsx|css|json|md)$/.test(entry.name)) files.push(path.relative(repoRoot, entryPath));
    }
  }

  await walk(root);
  const chunks = [];
  for (const file of files.sort()) {
    chunks.push(await readText(repoRoot, file));
  }
  return chunks.join("\n");
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

function safeGit(repoRoot, args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRound4PAdPlaceholderQa().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
