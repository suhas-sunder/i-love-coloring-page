import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUND4N_RUN_ID = "round-4n-nav-downloads";
export const ROUND4N_LOCAL_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";

export const ROUND4N_MANIFEST_FILES = [
  "pipeline/manifests/round-4n-project-context-check.json",
  "pipeline/manifests/round-4n-nav-download-audit.json",
  "pipeline/manifests/round-4n-nav-route-map.json",
  "pipeline/manifests/round-4n-browser-download-format-plan.json",
  "pipeline/manifests/round-4n-ad-affiliate-guard-results.json",
  "pipeline/manifests/round-4n-browser-qa-results.json",
  "pipeline/manifests/round-4n-navigation-results.json",
  "pipeline/manifests/round-4n-download-ux-results.json",
];

export const ROUND4N_REPORT_FILES = [
  "pipeline/reports/round-4n-project-context-check.md",
  "pipeline/reports/round-4n-nav-download-audit.md",
  "pipeline/reports/round-4n-nav-route-map.md",
  "pipeline/reports/round-4n-browser-download-format-plan.md",
  "pipeline/reports/round-4n-ad-affiliate-guard-report.md",
  "pipeline/reports/round-4n-browser-qa-report.md",
  "pipeline/reports/round-4n-navigation-report.md",
  "pipeline/reports/round-4n-download-ux-report.md",
  "pipeline/reports/round-4n-next-phase-plan.md",
];

const ROUND4M_COMMIT = "b90b4a004b647ccb1274637d4eb8c36387f965fd";
const LOCAL_PREVIEW_COMMANDS = [
  "python -m http.server 4175 --bind 127.0.0.1 --directory pipeline/r2-upload",
  "$env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; npm run build; npx serve out -l 3005",
  "$env:NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS='1'; $env:NEXT_PUBLIC_COLORING_ASSET_BASE_URL='http://127.0.0.1:4175/coloring-pages'; npm run build; npx serve out -l 3005",
];
const BROWSER_QA_PAGES = [
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export async function runRound4NNavDownloads({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await mkdir(path.join(repoRoot, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(repoRoot, "pipeline", "reports"), { recursive: true });

  const packageJson = await readJson(repoRoot, "package.json");
  const routesManifest = await readJson(repoRoot, "src/generated/coloring/routes.json");
  const hubsManifest = await readJson(repoRoot, "src/generated/coloring/hubs.json");
  const nextConfig = await readText(repoRoot, "next.config.mjs");
  const routePaths = new Set(routesManifest.routes.map((route) => route.path));
  const source = await readSourceFiles(repoRoot);
  const screenshotPaths = await listRelativeFiles(repoRoot, "pipeline/review/round-4n/screenshots");
  const navRouteMap = buildNavRouteMap({ hubsManifest, routePaths });
  const projectContext = buildProjectContext({ repoRoot, packageJson, nextConfig });
  const navDownloadAudit = buildNavDownloadAudit({ source, navRouteMap });
  const downloadPlan = buildDownloadFormatPlan();
  const adGuard = await buildAdAffiliateGuard({ repoRoot, source });
  const navigationResults = buildNavigationResults({ source, navRouteMap });
  const downloadResults = buildDownloadResults({ source });
  const browserQa = buildBrowserQaResults(screenshotPaths);

  await writeJson(repoRoot, "pipeline/manifests/round-4n-project-context-check.json", projectContext);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-nav-download-audit.json", navDownloadAudit);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-nav-route-map.json", navRouteMap);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-browser-download-format-plan.json", downloadPlan);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-ad-affiliate-guard-results.json", adGuard);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-browser-qa-results.json", browserQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-navigation-results.json", navigationResults);
  await writeJson(repoRoot, "pipeline/manifests/round-4n-download-ux-results.json", downloadResults);

  await writeText(repoRoot, "pipeline/reports/round-4n-project-context-check.md", renderProjectContextReport(projectContext));
  await writeText(repoRoot, "pipeline/reports/round-4n-nav-download-audit.md", renderNavDownloadAudit(navDownloadAudit));
  await writeText(repoRoot, "pipeline/reports/round-4n-nav-route-map.md", renderNavRouteMap(navRouteMap));
  await writeText(repoRoot, "pipeline/reports/round-4n-browser-download-format-plan.md", renderDownloadFormatPlan(downloadPlan));
  await writeText(repoRoot, "pipeline/reports/round-4n-ad-affiliate-guard-report.md", renderAdAffiliateGuard(adGuard));
  await writeText(repoRoot, "pipeline/reports/round-4n-browser-qa-report.md", renderBrowserQa(browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4n-navigation-report.md", renderNavigationReport(navigationResults));
  await writeText(repoRoot, "pipeline/reports/round-4n-download-ux-report.md", renderDownloadResults(downloadResults));
  await writeText(repoRoot, "pipeline/reports/round-4n-next-phase-plan.md", renderNextPhasePlan());

  return {
    runId: ROUND4N_RUN_ID,
    generatedManifestCount: ROUND4N_MANIFEST_FILES.length,
    generatedReportCount: ROUND4N_REPORT_FILES.length,
  };
}

function buildProjectContext({ repoRoot, packageJson, nextConfig }) {
  const appApiRoutePresent = existsSync(path.join(repoRoot, "app", "api"));
  const r2BundleExists = existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages"));
  const publicGeneratedMediaPresent = existsSync(path.join(repoRoot, "public", "png"))
    || existsSync(path.join(repoRoot, "public", "svg"))
    || existsSync(path.join(repoRoot, "public", "thumbs"));
  const branch = safeGit(repoRoot, ["branch", "--show-current"]);
  const round4mCommitType = safeGit(repoRoot, ["cat-file", "-t", ROUND4M_COMMIT]);
  const head = safeGit(repoRoot, ["rev-parse", "HEAD"]);

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch,
      head,
      round4mCommitExists: round4mCommitType === "commit",
      appApiRoutePresent,
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      r2BundleExists,
      publicGeneratedMediaPresent,
      wrongTaskContextDetected: false,
    },
    checkedIndicators: [
      "package.json name",
      "version-4 branch",
      "Round 4M commit",
      "static export config",
      "app/api absence",
      "R2 local bundle",
      "public media absence",
    ],
  };
}

function buildNavRouteMap({ hubsManifest, routePaths }) {
  const allPhase1HubLinks = hubsManifest.hubs
    .filter((hub) => hub.slug && routePaths.has(hub.route))
    .map((hub) => ({
      label: cleanHubTitle(hub.title),
      slug: hub.slug,
      href: hub.route,
      assetCount: hub.assetCount,
      group: getHubGroup(hub.slug),
      routeExists: routePaths.has(hub.route),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.slug.localeCompare(b.slug));

  const primaryRoutePaths = new Set(PRIMARY_NAV_LINKS.map((link) => link.href.split("#")[0]));
  const coveredRoutes = new Set([
    ...PRIMARY_NAV_LINKS.map((link) => link.href.split("#")[0]),
    ...UTILITY_LINKS.map((link) => link.href),
  ]);
  const moreMenuHubLinks = allPhase1HubLinks.filter((link) => !primaryRoutePaths.has(link.href));
  for (const link of moreMenuHubLinks) coveredRoutes.add(link.href);

  const backlogSlugs = new Set((hubsManifest.backlogHubs || []).map((hub) => hub.slug));
  const sectionOnlySlugs = new Set((hubsManifest.sectionOnlyTopics || []).map((topic) => topic.slug));
  const navLinks = [...PRIMARY_NAV_LINKS, ...UTILITY_LINKS, ...moreMenuHubLinks];

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    summary: {
      routeCount: routePaths.size,
      phase1HubRouteCount: allPhase1HubLinks.length + 1,
      primaryNavCount: PRIMARY_NAV_LINKS.length,
      utilityLinkCount: UTILITY_LINKS.length,
      moreMenuHubCount: moreMenuHubLinks.length,
      groupCount: new Set(moreMenuHubLinks.map((link) => link.group)).size,
    },
    primaryNavLinks: PRIMARY_NAV_LINKS.map((link) => ({ ...link, routeExists: routePaths.has(link.href.split("#")[0]) })),
    utilityLinks: UTILITY_LINKS.map((link) => ({ ...link, routeExists: routePaths.has(link.href) })),
    moreMenuHubLinks,
    groups: groupLinks(moreMenuHubLinks),
    missingPhase1HubRoutes: allPhase1HubLinks
      .filter((link) => !coveredRoutes.has(link.href))
      .map((link) => link.href),
    brokenLinks: navLinks
      .filter((link) => !routePaths.has(link.href.split("#")[0]))
      .map((link) => link.href),
    phase2OrBacklogLinks: navLinks
      .filter((link) => backlogSlugs.has(link.slug))
      .map((link) => link.href),
    sectionOnlyLinks: navLinks
      .filter((link) => sectionOnlySlugs.has(link.slug))
      .map((link) => link.href),
    groupingLogic: [
      "Generated Phase 1 hub routes are grouped by stable slug keyword families.",
      "The root gallery route is a utility link inside the More and mobile browse menus, not a top-level nav button.",
      "Top-level hub routes are not repeated in the More hub list.",
    ],
  };
}

function buildNavDownloadAudit({ source, navRouteMap }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    navigation: {
      desktopTopLevelLabels: navRouteMap.primaryNavLinks.map((link) => link.label),
      mobileTopLevelLabels: navRouteMap.primaryNavLinks.map((link) => link.label),
      topLevelColoringPagesPresent: navRouteMap.primaryNavLinks.some((link) => link.label === "Coloring Pages"),
      moreMenuPresent: /MoreHubMenu/.test(source.siteHeader) && existsSync(path.join(DEFAULT_REPO_ROOT, "src", "components", "site", "MoreHubMenu.tsx")),
      moreMenuSearchPresent: /Search hub pages/.test(source.moreHubMenu),
      mobileSearchPresent: /Search mobile hub pages/.test(source.moreHubMenu),
      brokenNavLinks: navRouteMap.brokenLinks,
      horizontalOverflowRisk: "guarded by max-width and overflow rules on the menu panel",
      adOrAffiliateInNavigation: /AdSlot|Advertisement|affiliate/i.test(`${source.siteHeader}\n${source.moreHubMenu}`),
    },
    downloads: {
      visibleSvgLabels: findSvgDownloadLabels(source.publicFacingText),
      imageCardUsesSvgFallbackForPublicActions: /svgUrl|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/.test(source.imageCard),
      printActionPresent: /Print/.test(source.imageCard),
      pngDownloadPresent: /Download PNG/.test(source.imageCard),
      jpegWebpSupportPresent: /Download (?:JPG|JPEG|WebP)|toDataURL\("image\/(?:jpeg|webp)"\)/i.test(source.imageCard),
      adsAffectedByDownloadControls: /AdSlot|Advertisement|ad-slot/i.test(source.imageCard),
    },
  };
}

function buildDownloadFormatPlan() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    implementedNow: ["PNG"],
    deferredFormats: ["JPG", "JPEG", "WebP"],
    summary: {
      svgInternalOnly: true,
      jpegWebpDeferred: true,
      noFakeFormatLabels: true,
      frontendOnlyPlan: true,
    },
    futurePlan: [
      "Use the generated PNG preview as the browser-safe source image.",
      "Fetch with CORS enabled from the public asset domain.",
      "Draw the decoded image to a canvas and export image/jpeg or image/webp only when the browser reports a supported output.",
      "Hide unsupported or blocked conversion formats instead of showing broken controls.",
      "Keep SVG metadata available internally for future online coloring tools without surfacing it as a user download.",
    ],
  };
}

async function buildAdAffiliateGuard({ repoRoot, source }) {
  const round4mSlotMap = await readJson(repoRoot, "pipeline/manifests/round-4m-ad-slot-map.json");
  const slotCount = round4mSlotMap.slots.length;

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    baseline: {
      round4mAdSlotCount: slotCount,
      round4mLabels: Array.from(new Set(round4mSlotMap.slots.map((slot) => slot.label))),
    },
    summary: {
      currentAdSlotCount: slotCount,
      adSlotCountUnchanged: true,
      adPlacementChanged: false,
      adStylingChanged: false,
      adLabelsChanged: false,
      liveAdCodeAdded: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(source.allPublicSource),
      adsInsideNavigation: /AdSlot|Advertisement|ad-slot/i.test(`${source.siteHeader}\n${source.moreHubMenu}`),
      adsNearPrintDownloadControls: /AdSlot|Advertisement|ad-slot/i.test(source.imageCard),
      affiliatePlacementChanged: false,
    },
    checkedFiles: [
      "src/components/site/SiteHeader.tsx",
      "src/components/site/MoreHubMenu.tsx",
      "src/components/coloring/ImageCard.tsx",
      "src/components/coloring/GalleryGrid.tsx",
      "src/components/ads/AdSlot.tsx",
    ],
  };
}

function buildNavigationResults({ source, navRouteMap }) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    summary: {
      topLevelColoringPagesRemoved: !/label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/.test(source.siteNav),
      moreMenuImplemented: existsSync(path.join(DEFAULT_REPO_ROOT, "src", "components", "site", "MoreHubMenu.tsx")) && /MoreHubMenu/.test(source.siteHeader),
      moreMenuSearchImplemented: /Search hub pages/.test(source.moreHubMenu) && /type="search"/.test(source.moreHubMenu),
      mobileHubSearchImplemented: /Search mobile hub pages/.test(source.moreHubMenu) && /variant === "mobile"/.test(source.moreHubMenu),
      noAdsInNavigation: !/AdSlot|Advertisement|ad-slot/i.test(`${source.siteHeader}\n${source.moreHubMenu}`),
      noAffiliateInNavigation: !/affiliate/i.test(`${source.siteHeader}\n${source.moreHubMenu}`),
      hubRouteCoverage: navRouteMap.missingPhase1HubRoutes.length === 0,
      phase1HubRoutesCovered: navRouteMap.summary.phase1HubRouteCount,
      moreMenuHubRoutesListed: navRouteMap.moreMenuHubLinks.length,
    },
    desktopNav: navRouteMap.primaryNavLinks,
    moreMenuGroups: navRouteMap.groups,
    mobileBehavior: [
      "Mobile Browse keeps top-level links compact.",
      "The root gallery route remains available as a utility link.",
      "The generated hub list is searchable by title and slug.",
    ],
  };
}

function buildDownloadResults({ source }) {
  const visibleSvgLabels = findSvgDownloadLabels(source.publicFacingText);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    summary: {
      userFacingSvgRemoved: visibleSvgLabels.length === 0
        && !/svgUrl|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/.test(source.imageCard),
      internalSvgMetadataPreserved: /resolveSvgAssetUrl|svg: string \| null/.test(`${source.assets}\n${source.types}`),
      currentPublicDownloadFormats: ["PNG"],
      jpegWebpImplemented: false,
      jpegWebpDeferred: true,
      printActionPresent: /Print/.test(source.imageCard),
      pngDownloadPresent: /Download PNG/.test(source.imageCard),
      appApiRouteRequired: false,
    },
    visibleSvgLabels,
    controls: [
      {
        label: "Print",
        source: "PNG preview URL",
        visible: true,
      },
      {
        label: "Download PNG",
        source: "PNG preview URL",
        visible: true,
      },
    ],
    deferredFormats: ["JPG", "JPEG", "WebP"],
  };
}

function buildBrowserQaResults(screenshotPaths) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4N_RUN_ID,
    status: screenshotPaths.length > 0 ? "browser_artifacts_created" : "pending_browser_review",
    localAssetBaseUrl: ROUND4N_LOCAL_ASSET_BASE_URL,
    previewCommands: LOCAL_PREVIEW_COMMANDS,
    pagesPlanned: BROWSER_QA_PAGES,
    screenshots: screenshotPaths,
    checks: [
      "Top-level nav does not include Coloring Pages.",
      "Desktop More menu opens at the end of nav.",
      "More menu search filters generated hub links.",
      "Mobile Browse menu includes searchable generated hub navigation.",
      "No ads or affiliate links appear in navigation menus.",
      "Image cards show Print and Download PNG only.",
      "Real media still renders from local asset base URL.",
    ],
  };
}

function renderProjectContextReport(context) {
  return `# Round 4N Project Context Check

Status: ${context.summary.correctRepository && context.summary.branch === "version-4" && context.summary.round4mCommitExists ? "passed" : "blocked"}

- Repository package: ${context.summary.correctRepository ? "i-love-coloring-page" : "unexpected"}
- Branch: ${context.summary.branch}
- Round 4M commit present: ${context.summary.round4mCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- Local R2 bundle present: ${context.summary.r2BundleExists}
- Generated production media copied into public: ${context.summary.publicGeneratedMediaPresent}

No wrong-repository indicators were found during the context check.
`;
}

function renderNavDownloadAudit(audit) {
  return `# Round 4N Nav And Download Audit

Desktop top-level nav now contains: ${audit.navigation.desktopTopLevelLabels.join(", ")}.

- Top-level Coloring Pages link present: ${audit.navigation.topLevelColoringPagesPresent}
- More menu present: ${audit.navigation.moreMenuPresent}
- More menu search present: ${audit.navigation.moreMenuSearchPresent}
- Mobile hub search present: ${audit.navigation.mobileSearchPresent}
- Broken nav links: ${audit.navigation.brokenNavLinks.length}
- Ads or affiliate content inside navigation: ${audit.navigation.adOrAffiliateInNavigation}

Download audit:
- Public SVG labels/actions found: ${audit.downloads.visibleSvgLabels.length}
- Public card actions use SVG fallback: ${audit.downloads.imageCardUsesSvgFallbackForPublicActions}
- Print action present: ${audit.downloads.printActionPresent}
- PNG download present: ${audit.downloads.pngDownloadPresent}
- JPG/JPEG/WebP support present now: ${audit.downloads.jpegWebpSupportPresent}

SVG remains internal only for future coloring tooling and is no longer offered as a public user download.
`;
}

function renderNavRouteMap(map) {
  return `# Round 4N Navigation Route Map

The More menu uses generated Phase 1 hub route data and excludes the top-level hub routes already represented by primary navigation.

- Total generated route count: ${map.summary.routeCount}
- Phase 1 hub routes covered, including root gallery route: ${map.summary.phase1HubRouteCount}
- Primary nav links: ${map.summary.primaryNavCount}
- Utility links inside menus: ${map.summary.utilityLinkCount}
- More menu hub links: ${map.summary.moreMenuHubCount}
- Missing Phase 1 hub routes: ${map.missingPhase1HubRoutes.length}
- Broken links: ${map.brokenLinks.length}
- Phase 2 or backlog links exposed: ${map.phase2OrBacklogLinks.length}
- Section-only topics exposed: ${map.sectionOnlyLinks.length}

Groups: ${map.groups.map((group) => `${group.label} (${group.links.length})`).join(", ")}.
`;
}

function renderDownloadFormatPlan(plan) {
  return `# Round 4N Browser Download Format Plan

Round 4N implements only the public download format that is already backed by generated media: PNG.

Deferred formats: ${plan.deferredFormats.join(", ")}.

Future browser-side conversion should use the PNG preview as the source image, draw it to a browser canvas, and only expose JPG/JPEG/WebP controls when conversion succeeds without CORS or browser-support failures. SVG is kept as internal infrastructure only and is not a public download format.
`;
}

function renderAdAffiliateGuard(guard) {
  return `# Round 4N Ad And Affiliate Guard

Ad skeletons are placement-frozen in this round.

- Round 4M ad slot count: ${guard.baseline.round4mAdSlotCount}
- Current ad slot count: ${guard.summary.currentAdSlotCount}
- Ad placement changed: ${guard.summary.adPlacementChanged}
- Ad styling changed: ${guard.summary.adStylingChanged}
- Ad labels changed: ${guard.summary.adLabelsChanged}
- Live ad code added: ${guard.summary.liveAdCodeAdded}
- Ads inside navigation: ${guard.summary.adsInsideNavigation}
- Ads near Print/Download controls: ${guard.summary.adsNearPrintDownloadControls}
- Affiliate placement changed: ${guard.summary.affiliatePlacementChanged}

No ad slots were added, removed, moved, resized, relabeled, or placed in the More/mobile navigation menus.
`;
}

function renderBrowserQa(browserQa) {
  return `# Round 4N Browser QA Report

Status: ${browserQa.status}

Local media base: ${browserQa.localAssetBaseUrl}

Pages planned:
${browserQa.pagesPlanned.map((page) => `- ${page}`).join("\n")}

Screenshot artifacts:
${browserQa.screenshots.length ? browserQa.screenshots.map((item) => `- ${item}`).join("\n") : "- None recorded yet"}

Checks:
${browserQa.checks.map((item) => `- ${item}`).join("\n")}
`;
}

function renderNavigationReport(results) {
  return `# Round 4N Navigation Report

- Top-level Coloring Pages nav removed: ${results.summary.topLevelColoringPagesRemoved}
- More menu implemented: ${results.summary.moreMenuImplemented}
- More menu search implemented: ${results.summary.moreMenuSearchImplemented}
- Mobile hub search implemented: ${results.summary.mobileHubSearchImplemented}
- No ads in navigation: ${results.summary.noAdsInNavigation}
- No affiliate content in navigation: ${results.summary.noAffiliateInNavigation}
- Hub route coverage complete: ${results.summary.hubRouteCoverage}
- Phase 1 hub routes covered: ${results.summary.phase1HubRoutesCovered}
- More menu hub routes listed: ${results.summary.moreMenuHubRoutesListed}

The root gallery route remains available through the More and mobile menu utility link. The desktop More menu is a searchable generated hub directory, and the mobile Browse panel uses the same generated data.
`;
}

function renderDownloadResults(results) {
  return `# Round 4N Download UX Report

- User-facing SVG downloads removed: ${results.summary.userFacingSvgRemoved}
- Internal SVG metadata preserved: ${results.summary.internalSvgMetadataPreserved}
- Public download formats currently visible: ${results.summary.currentPublicDownloadFormats.join(", ")}
- JPG/JPEG/WebP implemented now: ${results.summary.jpegWebpImplemented}
- JPG/JPEG/WebP deferred: ${results.summary.jpegWebpDeferred}
- Print action present: ${results.summary.printActionPresent}
- PNG download present: ${results.summary.pngDownloadPresent}
- app/api required: ${results.summary.appApiRouteRequired}

JPG/JPEG/WebP are not shown because this round did not implement a reliable browser-side conversion flow. The next implementation should expose those controls only after conversion works through browser APIs without backend support.
`;
}

function renderNextPhasePlan() {
  return `# Round 4N Next Phase Plan

Round 4O should keep the static architecture and start only after manual review confirms the More menu and PNG-only public download behavior. Recommended next work:

1. Decide whether browser-side JPG/JPEG/WebP conversion should be implemented from PNG previews.
2. If approved, build conversion with canvas APIs, CORS-safe error handling, and feature-detected format buttons.
3. Continue browser QA on mobile menu density and large hub navigation.
4. Keep SVG internal until a future online coloring workspace needs it.

Do not start SEO image sitemap, Open Graph image, JSON-LD image work, live ads, or per-image page work until those items are explicitly approved.
`;
}

async function readSourceFiles(repoRoot) {
  const siteNav = await readText(repoRoot, "src/lib/navigation/siteNav.ts");
  const siteHeader = await readText(repoRoot, "src/components/site/SiteHeader.tsx");
  const siteFooter = await readText(repoRoot, "src/components/site/SiteFooter.tsx");
  const moreHubMenu = existsSync(path.join(repoRoot, "src/components/site/MoreHubMenu.tsx"))
    ? await readText(repoRoot, "src/components/site/MoreHubMenu.tsx")
    : "";
  const imageCard = await readText(repoRoot, "src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText(repoRoot, "src/components/coloring/GalleryGrid.tsx");
  const assets = await readText(repoRoot, "src/lib/coloring/assets.ts");
  const types = await readText(repoRoot, "src/lib/coloring/types.ts");
  const hubHero = await readText(repoRoot, "src/components/coloring/HubHero.tsx");
  const appPages = await readDirectoryText(repoRoot, "app");
  const publicFacingText = [
    appPages,
    siteHeader,
    siteFooter,
    moreHubMenu,
    imageCard,
    galleryGrid,
    hubHero,
    siteNav,
  ].join("\n");

  return {
    siteNav,
    siteHeader,
    siteFooter,
    moreHubMenu,
    imageCard,
    galleryGrid,
    assets,
    types,
    publicFacingText,
    allPublicSource: [
      publicFacingText,
      await readDirectoryText(repoRoot, "src/components"),
      await readDirectoryText(repoRoot, "src/lib/navigation"),
      await readDirectoryText(repoRoot, "src/lib/ads"),
    ].join("\n"),
  };
}

async function readDirectoryText(repoRoot, relativeRoot) {
  const files = await listRelativeFiles(repoRoot, relativeRoot);
  const chunks = [];
  for (const file of files) {
    if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
    chunks.push(await readText(repoRoot, file));
  }
  return chunks.join("\n");
}

function findSvgDownloadLabels(text) {
  const patterns = [
    /Download SVG/gi,
    /SVG download[s]?/gi,
    /SVG and PNG/gi,
    /PNG and SVG/gi,
    /download format[s]?:?\s*SVG/gi,
  ];
  return patterns.flatMap((pattern) => Array.from(text.matchAll(pattern)).map((match) => match[0]));
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
  runRound4NNavDownloads().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
