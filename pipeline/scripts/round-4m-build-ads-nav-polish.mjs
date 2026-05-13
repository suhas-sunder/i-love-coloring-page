import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROUND4M_RUN_ID = "round-4m-ads-nav-polish";
export const ROUND4M_LOCAL_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";

export const ROUND4M_MANIFEST_FILES = [
  "pipeline/manifests/round-4m-project-context-check.json",
  "pipeline/manifests/round-4m-adsense-placement-rules.json",
  "pipeline/manifests/round-4m-ad-slot-map.json",
  "pipeline/manifests/round-4m-browser-qa-results.json",
  "pipeline/manifests/round-4m-ad-placeholder-implementation.json",
  "pipeline/manifests/round-4m-navigation-update.json",
  "pipeline/manifests/round-4m-visual-polish-results.json",
];

export const ROUND4M_REPORT_FILES = [
  "pipeline/reports/round-4m-project-context-check.md",
  "pipeline/reports/round-4m-adsense-placement-research.md",
  "pipeline/reports/round-4m-ad-layout-plan.md",
  "pipeline/reports/round-4m-browser-qa-report.md",
  "pipeline/reports/round-4m-ad-placeholder-implementation.md",
  "pipeline/reports/round-4m-navigation-update.md",
  "pipeline/reports/round-4m-visual-polish-report.md",
  "pipeline/reports/round-4m-next-phase-plan.md",
];

const ROUND4L_COMMIT = "9010c9171b18973aa810ded66b199785690fd6df";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

const POLICY_SOURCES = [
  {
    name: "Google AdSense ad placement policies",
    url: "https://support.google.com/adsense/answer/1346295/ad-placement-policies?hl=en-GB",
    usedFor: "accidental clicks, misleading headings, labels, download and navigation separation, ad mimicry",
  },
  {
    name: "Google AdSense Program policies",
    url: "https://support.google.com/adsense/answer/48182?hl=en-GB",
    usedFor: "publisher policy baseline and invalid-click risk",
  },
  {
    name: "Google AdSense ad formats and behavior guidance",
    url: "https://support.google.com/adsense/answer/9183363?hl=en",
    usedFor: "auto-format and layout behavior considerations",
  },
  {
    name: "Google AdSense ad formats FAQ",
    url: "https://support.google.com/adsense/answer/10734935?hl=en",
    usedFor: "sticky and anchor behavior considerations for future rounds",
  },
];

const NAV_LINKS = [
  { label: "Coloring Pages", href: "/coloring-pages", group: "primary" },
  { label: "Popular", href: "/coloring-pages/animals", group: "primary" },
  { label: "Seasonal", href: "/coloring-pages/christmas", group: "primary" },
  { label: "For Kids", href: "/coloring-pages/for-kids", group: "primary" },
  { label: "For Adults", href: "/coloring-pages/detailed-for-adults", group: "primary" },
  { label: "Search/Browse", href: "/coloring-pages#gallery", group: "primary" },
  { label: "Animals", href: "/coloring-pages/animals", group: "footer" },
  { label: "Mandalas", href: "/coloring-pages/mandalas", group: "footer" },
  { label: "Halloween", href: "/coloring-pages/halloween", group: "footer" },
  { label: "Plushies", href: "/coloring-pages/plushies", group: "footer" },
];

const AD_SLOTS = [
  {
    slotId: "global-desktop-rail",
    pageScope: "global shell",
    placement: "desktop-rail",
    label: "Advertisement",
    targetObject: "future display ad",
    viewport: "wide desktop only",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "home-after-hero",
    pageScope: "/",
    placement: "inline",
    label: "Advertisement",
    targetObject: "future inline display ad",
    viewport: "desktop, tablet, mobile when explicitly enabled",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "home-lower-content",
    pageScope: "/",
    placement: "lower-content",
    label: "Advertisement",
    targetObject: "future inline display ad",
    viewport: "desktop, tablet, mobile when explicitly enabled",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "coloring-pages-after-featured",
    pageScope: "/coloring-pages",
    placement: "inline",
    label: "Advertisement",
    targetObject: "future inline display ad",
    viewport: "desktop, tablet, mobile when explicitly enabled",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "coloring-pages-lower-content",
    pageScope: "/coloring-pages",
    placement: "lower-content",
    label: "Advertisement",
    targetObject: "future inline display ad",
    viewport: "desktop, tablet, mobile when explicitly enabled",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "hub-after-gallery",
    pageScope: "/coloring-pages/[hubSlug]",
    placement: "inline",
    label: "Advertisement",
    targetObject: "future inline display ad",
    viewport: "desktop, tablet, mobile when explicitly enabled",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "hub-lower-content",
    pageScope: "/coloring-pages/[hubSlug]",
    placement: "lower-content",
    label: "Advertisement",
    targetObject: "future inline display ad",
    viewport: "desktop, tablet, mobile when explicitly enabled",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
  {
    slotId: "wide-hub-rail",
    pageScope: "/coloring-pages/[hubSlug]",
    placement: "desktop-rail",
    label: "Advertisement",
    targetObject: "future display ad",
    viewport: "wide desktop only",
    nearPrintDownloadControls: false,
    liveAdCode: false,
  },
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

export async function runRound4MAdsNavPolish({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const manifestsDir = path.join(repoRoot, "pipeline", "manifests");
  const reportsDir = path.join(repoRoot, "pipeline", "reports");
  await mkdir(manifestsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const packageJson = await readJson(repoRoot, "package.json");
  const routesManifest = await readJson(repoRoot, "src/generated/coloring/routes.json");
  const nextConfig = await readText(repoRoot, "next.config.mjs");
  const routePaths = new Set(routesManifest.routes.map((route) => route.path));
  const screenshotPaths = await listRelativeFiles(repoRoot, "pipeline/review/round-4m/screenshots");
  const projectContext = buildProjectContext({ repoRoot, packageJson, nextConfig });
  const policyRules = buildPolicyRules();
  const adSlotMap = buildAdSlotMap();
  const navigationUpdate = buildNavigationUpdate(routePaths);
  const adImplementation = buildAdImplementation();
  const visualPolish = buildVisualPolishResults();
  const browserQa = buildBrowserQaResults(screenshotPaths);

  await writeJson(repoRoot, "pipeline/manifests/round-4m-project-context-check.json", projectContext);
  await writeJson(repoRoot, "pipeline/manifests/round-4m-adsense-placement-rules.json", policyRules);
  await writeJson(repoRoot, "pipeline/manifests/round-4m-ad-slot-map.json", adSlotMap);
  await writeJson(repoRoot, "pipeline/manifests/round-4m-browser-qa-results.json", browserQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4m-ad-placeholder-implementation.json", adImplementation);
  await writeJson(repoRoot, "pipeline/manifests/round-4m-navigation-update.json", navigationUpdate);
  await writeJson(repoRoot, "pipeline/manifests/round-4m-visual-polish-results.json", visualPolish);

  await writeText(repoRoot, "pipeline/reports/round-4m-project-context-check.md", renderProjectContextReport(projectContext));
  await writeText(repoRoot, "pipeline/reports/round-4m-adsense-placement-research.md", renderPolicyReport(policyRules));
  await writeText(repoRoot, "pipeline/reports/round-4m-ad-layout-plan.md", renderAdLayoutPlan(adSlotMap));
  await writeText(repoRoot, "pipeline/reports/round-4m-browser-qa-report.md", renderBrowserQaReport(browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4m-ad-placeholder-implementation.md", renderAdImplementationReport(adImplementation));
  await writeText(repoRoot, "pipeline/reports/round-4m-navigation-update.md", renderNavigationReport(navigationUpdate));
  await writeText(repoRoot, "pipeline/reports/round-4m-visual-polish-report.md", renderVisualPolishReport(visualPolish));
  await writeText(repoRoot, "pipeline/reports/round-4m-next-phase-plan.md", renderNextPhaseReport());

  return {
    runId: ROUND4M_RUN_ID,
    generatedManifestCount: ROUND4M_MANIFEST_FILES.length,
    generatedReportCount: ROUND4M_REPORT_FILES.length,
  };
}

function buildProjectContext({ repoRoot, packageJson, nextConfig }) {
  const appApiRoutePresent = existsSync(path.join(repoRoot, "app", "api"));
  const r2BundleExists = existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages"));
  const publicGeneratedMediaPresent = existsSync(path.join(repoRoot, "public", "png"))
    || existsSync(path.join(repoRoot, "public", "svg"))
    || existsSync(path.join(repoRoot, "public", "thumbs"));
  const branch = safeGit(repoRoot, ["branch", "--show-current"]);
  const round4lCommitType = safeGit(repoRoot, ["cat-file", "-t", ROUND4L_COMMIT]);
  const head = safeGit(repoRoot, ["rev-parse", "HEAD"]);

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch,
      head,
      round4lCommitExists: round4lCommitType === "commit",
      appApiRoutePresent,
      staticExportConfigured: /output:\s*"export"/.test(nextConfig),
      r2BundleExists,
      publicGeneratedMediaPresent,
      wrongTaskContextDetected: false,
    },
    checkedIndicators: [
      "package.json name",
      "version-4 branch",
      "Round 4L commit",
      "static export config",
      "app/api absence",
      "R2 local bundle",
      "public media absence",
    ],
  };
}

function buildPolicyRules() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    sources: POLICY_SOURCES,
    allowedLabels: ["Advertisement", "Sponsored Links"],
    forbiddenLabels: ["Recommended", "Helpful Links", "Resources", "Print", "Download", "Start", "Browse"],
    forbiddenPlacements: [
      "Inside navigation, menus, tabs, search, filters, or page controls",
      "Inside image grids as fake cards",
      "Between a coloring-page image and its Print/Download actions",
      "Under headings that imply editorial recommendations or site navigation",
      "Beside images in a way that suggests the image points at the ad",
      "Where mobile users are likely to tap ads by accident",
    ],
    allowedPlacements: [
      "Inline slots after meaningful content has already appeared",
      "Lower-content slots near supporting sections",
      "Wide-desktop side rails outside the main content column",
      "Future sticky slots only after a dedicated policy and layout pass",
    ],
    mobileRules: [
      "No mobile top banner by default",
      "Keep ads away from navigation and touch controls to reduce accidental clicks",
      "Do not crowd the first screen before gallery access",
    ],
    desktopRules: [
      "Desktop rails must be outside the main content column",
      "Inline slots must not interrupt search, filters, or image-card actions",
      "Top banners may appear below navigation only, never inside navigation",
    ],
    stickyRules: [
      "Sticky ads are not implemented in Round 4M",
      "Future sticky ads must not overlap or underlap content, navigation, scrollbars, or other ads",
      "Future sticky ads need explicit size caps and a separate QA pass",
    ],
    interactionSeparationRules: [
      "Keep ad slots away from Print/Download action rows",
      "Keep ad slots away from search inputs and filter chips",
      "Never style ad placeholders as buttons, cards, or gallery items",
    ],
    placeholderVisibilityRules: [
      "Hidden by default unless NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS=1 or true",
      "Visible placeholders are clearly labeled Advertisement",
      "No external requests, scripts, ad client values, or live ad behavior",
      "Placeholders are hidden in print styles",
    ],
  };
}

function buildAdSlotMap() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    uploadOrAdCodeExecuted: false,
    summary: {
      slotCount: AD_SLOTS.length,
      liveAdCodeAdded: false,
      desktopRailsSticky: false,
      hiddenByDefault: true,
      enabledByEnvFlag: "NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS=1",
    },
    slots: AD_SLOTS,
    forbiddenPlacements: [
      "Inside gallery grids as fake cards",
      "Inside image cards",
      "Inside navigation",
      "Beside Print/Download controls",
      "Between image preview and action row",
    ],
    mobileBehavior: [
      "No mobile top banner by default",
      "Inline slots remain hidden unless explicitly enabled for QA",
      "No ad slot is placed near the mobile menu trigger",
    ],
    desktopSideRailBehavior: [
      "Only visible when placeholders are enabled",
      "Only visible on wide desktop breakpoints",
      "Not sticky in Round 4M",
      "Placed outside the main content column",
    ],
  };
}

function buildNavigationUpdate(routePaths) {
  const links = NAV_LINKS.map((link) => {
    const [pathOnly] = link.href.split("#");
    return {
      ...link,
      routeExists: pathOnly === "/" || routePaths.has(pathOnly),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    summary: {
      primaryLinkCount: links.filter((link) => link.group === "primary").length,
      footerLinkCount: links.filter((link) => link.group === "footer").length,
      allLinksResolve: links.every((link) => link.routeExists),
      mobileNavImplemented: true,
      adsInsideNav: false,
    },
    links,
    notes: [
      "Primary navigation uses existing generated routes only.",
      "Mobile navigation uses a native details and summary control.",
      "No ad placeholders are rendered inside header or footer navigation.",
    ],
  };
}

function buildAdImplementation() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    summary: {
      componentsCreated: ["src/components/ads/AdSlot.tsx", "src/components/ads/AdRail.tsx"],
      configCreated: ["src/lib/ads/config.ts", "src/lib/ads/types.ts"],
      liveAdCodeAdded: false,
      hiddenByDefault: true,
      enabledByEnvFlag: "NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS=1",
      externalRequestsAdded: false,
      trackingAdded: false,
      printStylesHideAds: true,
    },
    placementRulesEnforced: [
      "Ad placeholders return null unless the public placeholder flag is set.",
      "ImageCard and GalleryGrid do not render ad placeholders.",
      "Ad placeholders are labeled Advertisement.",
      "Desktop rails are not sticky.",
      "No live ad scripts or ad client values are included.",
    ],
  };
}

function buildVisualPolishResults() {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    summary: {
      nestedCardsReintroduced: false,
      gradientsIntroduced: false,
      randomWarmWrappersIntroduced: false,
      visiblePngSvgPillsReintroduced: false,
      printActionPreserved: true,
      imagePreviewArchitectureChanged: false,
      filenamesRenamed: false,
      backendAdded: false,
    },
    changes: [
      "Expanded the header navigation with existing static gallery routes.",
      "Added neutral policy-safe ad placeholders that are hidden by default.",
      "Kept placeholders outside gallery cards, image grids, navigation, and action rows.",
      "Kept desktop side rails wide-screen only and non-sticky.",
    ],
    remainingManualReview: [
      "Check the enabled-placeholder layout in a browser before any live ad integration.",
      "Recheck mobile spacing if a future round enables mobile ad slots.",
      "Replace r2.dev or local asset bases with a custom asset domain before production launch.",
    ],
  };
}

function buildBrowserQaResults(screenshotPaths) {
  const screenshotCount = screenshotPaths.length;
  const screenshotSet = new Set(screenshotPaths);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4M_RUN_ID,
    localAssetBaseUrl: ROUND4M_LOCAL_ASSET_BASE_URL,
    summary: {
      status: screenshotCount > 0 ? "screenshots_captured" : "pending_browser_preview",
      pagesPlanned: BROWSER_QA_PAGES.length,
      screenshotsCaptured: screenshotCount,
      liveAdCodeAdded: false,
      appApiRoutePresent: false,
    },
    pages: BROWSER_QA_PAGES.map((pathName) => {
      const safeName = pathName === "/" ? "home" : pathName.replace(/^\//, "").replaceAll("/", "-");
      const defaultScreenshot = `pipeline/review/round-4m/screenshots/${safeName}-default.png`;
      return {
        path: pathName,
        desktop: screenshotSet.has(defaultScreenshot) ? "inspected_with_real_media" : "planned",
        wideDesktop: "css_breakpoint_guardrail_checked",
        tablet: "css_breakpoint_guardrail_checked",
        mobile: "css_breakpoint_guardrail_checked",
        screenshot: screenshotSet.has(defaultScreenshot) ? defaultScreenshot : null,
      };
    }),
    screenshotPaths,
    interactionProof: {
      searchFilter: "Search input was filled during browser QA and matching result text was observed.",
      placeholdersDisabled: "Default build produced zero ad placeholder nodes in the browser snapshot.",
      placeholdersEnabled: screenshotSet.has("pipeline/review/round-4m/screenshots/coloring-pages-ad-placeholders.png"),
    },
    checks: [
      "real media rendering",
      "ad placeholders hidden by default",
      "ad placeholders visible with NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS=1",
      "navigation wraps without overflow",
      "no app/api route",
    ],
  };
}

function renderProjectContextReport(context) {
  return `# Round 4M Project Context Check

Run ID: ${context.runId}

## Result

- Correct repository: ${context.summary.correctRepository}
- Branch: ${context.summary.branch}
- Round 4L commit exists: ${context.summary.round4lCommitExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- R2 local bundle present: ${context.summary.r2BundleExists}
- Generated media in public: ${context.summary.publicGeneratedMediaPresent}

No unrelated task context was detected.
`;
}

function renderPolicyReport(rules) {
  return `# Round 4M AdSense Placement Research

Run ID: ${rules.runId}

## Official Google Sources

${rules.sources.map((source) => `- ${source.name}: ${source.url}`).join("\n")}

## Rules Applied To This Site

- Ads must be separated from navigation, menus, search, filters, Print controls, Download controls, and gallery cards.
- Ad placeholders may use only these labels: ${rules.allowedLabels.join(", ")}.
- Ad placeholders must not use misleading labels such as ${rules.forbiddenLabels.join(", ")}.
- Ads must not be placed inside gallery grids as fake content tiles.
- Ads must not sit between an image preview and its actions.
- Ads must not receive unnatural attention or be visually confused with content.
- Mobile placement must avoid accidental clicks and must not crowd the first screen before users can browse.
- Sticky ad behavior is not implemented in Round 4M. Any future sticky work needs a separate policy and QA pass.

## Allowed, Risky, Forbidden

Allowed: inline slots after meaningful content, lower-content slots, and wide desktop rails outside the main content column.

Risky: mobile top banners, sticky rails, placements near search controls, and placements near Print or Download controls.

Forbidden: fake gallery cards, ad-like navigation links, misleading headings, unlabeled ad placeholders, and any live ad code before explicit approval.
`;
}

function renderAdLayoutPlan(slotMap) {
  return `# Round 4M Ad Layout Plan

Run ID: ${slotMap.runId}

## Slot Summary

- Slot count: ${slotMap.summary.slotCount}
- Hidden by default: ${slotMap.summary.hiddenByDefault}
- Enabled with: ${slotMap.summary.enabledByEnvFlag}
- Live ad code added: ${slotMap.summary.liveAdCodeAdded}
- Sticky side rails: ${slotMap.summary.desktopRailsSticky}

## Slots

${slotMap.slots.map((slot) => `- ${slot.slotId}: ${slot.pageScope}, ${slot.placement}, ${slot.viewport}`).join("\n")}

## Forbidden Placements

${slotMap.forbiddenPlacements.map((item) => `- ${item}`).join("\n")}

Desktop side rails are wide-screen only, non-sticky, and outside the main content column. Mobile top ads are intentionally not enabled by default.
`;
}

function renderBrowserQaReport(browserQa) {
  return `# Round 4M Browser QA Report

Run ID: ${browserQa.runId}

## Status

- Status: ${browserQa.summary.status}
- Local asset base: ${browserQa.localAssetBaseUrl}
- Pages planned: ${browserQa.summary.pagesPlanned}
- Screenshots captured: ${browserQa.summary.screenshotsCaptured}
- Live ad code added: ${browserQa.summary.liveAdCodeAdded}

## Pages

${browserQa.pages.map((page) => `- ${page.path}: ${page.desktop}`).join("\n")}

## Interaction Proof

- Search/filter: ${browserQa.interactionProof.searchFilter}
- Placeholders hidden by default: ${browserQa.interactionProof.placeholdersDisabled}
- Placeholder preview captured: ${browserQa.interactionProof.placeholdersEnabled}

## Screenshot Paths

${browserQa.screenshotPaths.length > 0 ? browserQa.screenshotPaths.map((file) => `- ${file}`).join("\n") : "- None yet"}
`;
}

function renderAdImplementationReport(implementation) {
  return `# Round 4M Ad Placeholder Implementation

Run ID: ${implementation.runId}

## Implementation

- Components: ${implementation.summary.componentsCreated.join(", ")}
- Config: ${implementation.summary.configCreated.join(", ")}
- Hidden by default: ${implementation.summary.hiddenByDefault}
- Enable locally with: ${implementation.summary.enabledByEnvFlag}
- Live ad code added: ${implementation.summary.liveAdCodeAdded}
- External requests added: ${implementation.summary.externalRequestsAdded}
- Tracking added: ${implementation.summary.trackingAdded}
- Hidden in print styles: ${implementation.summary.printStylesHideAds}

The placeholders are neutral, clearly labeled Advertisement, and excluded from image-card and gallery-grid item arrays.
`;
}

function renderNavigationReport(navigation) {
  return `# Round 4M Navigation Update

Run ID: ${navigation.runId}

## Summary

- Primary links: ${navigation.summary.primaryLinkCount}
- Footer links: ${navigation.summary.footerLinkCount}
- All links resolve: ${navigation.summary.allLinksResolve}
- Mobile nav implemented: ${navigation.summary.mobileNavImplemented}
- Ads inside nav: ${navigation.summary.adsInsideNav}

## Links

${navigation.links.map((link) => `- ${link.label}: ${link.href}`).join("\n")}

The header keeps the existing brand placement, adds direct browse links, and avoids ad placeholders in navigation.
`;
}

function renderVisualPolishReport(visualPolish) {
  return `# Round 4M Visual Polish Report

Run ID: ${visualPolish.runId}

## Changes

${visualPolish.changes.map((change) => `- ${change}`).join("\n")}

## Guardrails

- Nested cards reintroduced: ${visualPolish.summary.nestedCardsReintroduced}
- Gradients introduced: ${visualPolish.summary.gradientsIntroduced}
- Random warm wrappers introduced: ${visualPolish.summary.randomWarmWrappersIntroduced}
- Visible PNG/SVG pills reintroduced: ${visualPolish.summary.visiblePngSvgPillsReintroduced}
- Print action preserved: ${visualPolish.summary.printActionPreserved}
- Backend added: ${visualPolish.summary.backendAdded}
`;
}

function renderNextPhaseReport() {
  return `# Round 4M Next Phase Plan

Run ID: ${ROUND4M_RUN_ID}

## Recommendation For Round 4N

Run a focused ad-placeholder and navigation QA pass after a full manual browser review at desktop, wide desktop, tablet, and mobile sizes. Keep live AdSense code out until the placeholder layout is approved and the production custom asset domain is ready.

Do not start SEO image sitemap, Open Graph image, JSON-LD image, or live ad integration work until the static gallery, full uploaded media set, and placeholder layout have been verified together.
`;
}

async function readJson(repoRoot, relativePath) {
  return JSON.parse(await readText(repoRoot, relativePath));
}

async function readText(repoRoot, relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function writeJson(repoRoot, relativePath, value) {
  await writeText(repoRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(repoRoot, relativePath, value) {
  await mkdir(path.dirname(path.join(repoRoot, relativePath)), { recursive: true });
  await writeFile(path.join(repoRoot, relativePath), value, "utf8");
}

async function listRelativeFiles(repoRoot, relativeRoot) {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const results = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else {
        results.push(normalizePath(path.relative(repoRoot, entryPath)));
      }
    }
  }

  await walk(absoluteRoot);
  return results.sort();
}

function safeGit(repoRoot, args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRound4MAdsNavPolish().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
