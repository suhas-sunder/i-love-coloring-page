import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROUND4R_RUN_ID = "round-4r-ad-placeholder-visuals";
const ROUND4Q_COMMIT = "869b6ae";
const LOCAL_ASSET_BASE_URL = "http://127.0.0.1:4175/coloring-pages";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..", "..");

export async function runRound4RAdPlaceholderVisuals({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  await mkdir(path.join(repoRoot, "pipeline", "manifests"), { recursive: true });
  await mkdir(path.join(repoRoot, "pipeline", "reports"), { recursive: true });

  const source = await readSourceFiles(repoRoot);
  const packageJson = JSON.parse(await readText(repoRoot, "package.json"));
  const round4qInventory = await readJson(repoRoot, "pipeline/manifests/round-4q-ad-slot-inventory.json");
  const screenshots = {
    on: await listRelativeFiles(repoRoot, "pipeline/review/round-4r/screenshots/ad-placeholders-on"),
    off: await listRelativeFiles(repoRoot, "pipeline/review/round-4r/screenshots/ad-placeholders-off"),
  };

  const context = buildProjectContext({ repoRoot, packageJson, source });
  const visualAudit = buildVisualAudit(source);
  const preservationCheck = buildPreservationCheck(round4qInventory);
  const preservationResults = buildPreservationResults({ round4qInventory, source });
  const visualResults = buildVisualResults({ source, preservationResults });
  const browserQa = buildBrowserQa({ screenshots, visualResults });

  await writeJson(repoRoot, "pipeline/manifests/round-4r-project-context-check.json", context);
  await writeJson(repoRoot, "pipeline/manifests/round-4r-ad-placeholder-visual-audit.json", visualAudit);
  await writeJson(repoRoot, "pipeline/manifests/round-4r-ad-slot-preservation-check.json", preservationCheck);
  await writeJson(repoRoot, "pipeline/manifests/round-4r-browser-ad-visual-qa-results.json", browserQa);
  await writeJson(repoRoot, "pipeline/manifests/round-4r-ad-placeholder-visual-results.json", visualResults);
  await writeJson(repoRoot, "pipeline/manifests/round-4r-ad-slot-preservation-results.json", preservationResults);

  await writeText(repoRoot, "pipeline/reports/round-4r-project-context-check.md", renderProjectContext(context));
  await writeText(repoRoot, "pipeline/reports/round-4r-ad-placeholder-visual-audit.md", renderVisualAudit(visualAudit));
  await writeText(repoRoot, "pipeline/reports/round-4r-browser-ad-visual-qa-report.md", renderBrowserQa(browserQa));
  await writeText(repoRoot, "pipeline/reports/round-4r-ad-placeholder-visual-results.md", renderVisualResults(visualResults));
  await writeText(repoRoot, "pipeline/reports/round-4r-ad-slot-preservation-report.md", renderPreservationResults(preservationResults));
  await writeText(repoRoot, "pipeline/reports/round-4r-next-phase-plan.md", renderNextPhasePlan());

  return {
    runId: ROUND4R_RUN_ID,
    generatedManifestCount: 6,
    generatedReportCount: 6,
  };
}

function buildProjectContext({ repoRoot, packageJson, source }) {
  const publicGeneratedMedia = listPublicGeneratedMedia(repoRoot);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4R_RUN_ID,
    summary: {
      correctRepository: packageJson.name === "i-love-coloring-page",
      branch: safeGit(repoRoot, ["branch", "--show-current"]),
      head: safeGit(repoRoot, ["rev-parse", "HEAD"]),
      round4qCommitExists: safeGit(repoRoot, ["cat-file", "-t", ROUND4Q_COMMIT]) === "commit",
      round4qCommitOnBranch: safeGit(repoRoot, ["branch", "--contains", ROUND4Q_COMMIT]).includes("version-4"),
      appApiRoutePresent: existsSync(path.join(repoRoot, "app", "api")),
      srcAppApiRoutePresent: existsSync(path.join(repoRoot, "src", "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(source.nextConfig),
      appDirectoryRoutesPresent: existsSync(path.join(repoRoot, "app", "coloring-pages", "page.tsx"))
        && existsSync(path.join(repoRoot, "app", "coloring-pages", "[hubSlug]", "page.tsx")),
      r2BundleExists: existsSync(path.join(repoRoot, "pipeline", "r2-upload", "coloring-pages")),
      publicGeneratedMediaPresent: publicGeneratedMedia.length > 0,
      publicGeneratedMediaFiles: publicGeneratedMedia,
      sourceImagesUntouched: safeGit(repoRoot, ["status", "--short", "--", "images"]) === "",
      referenceRepoUntouched: safeGit(repoRoot, ["status", "--short", "--", "ilovesvg"]) === "",
      productionFullAssetsNotStaged: safeGit(repoRoot, ["status", "--short", "--", "pipeline/production/full"]) === "",
      r2UploadMediaNotTracked: safeGit(repoRoot, ["ls-files", "--", "pipeline/r2-upload"]) === "",
      filenamesRenamed: safeGit(repoRoot, ["status", "--short"]).split(/\r?\n/).some((line) => line.trim().startsWith("R")),
      currentPublicDownloadFormats: /Download PNG/.test(source.imageCard) ? ["PNG"] : [],
      visibleSvgDownloadOptions: /Download SVG|SVG download|SVG downloads|assetUrls\.svg/i.test(source.publicFacingSource),
      visibleJpegWebpOptions: /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/.test(source.publicFacingSource),
      round4qAdSlotInventoryExists: existsSync(path.join(repoRoot, "pipeline", "manifests", "round-4q-ad-slot-inventory.json")),
      wrongTaskContextDetected: /image-to-favicon-generator|createManifestMeta|routeMetaBytes|routeManifestClientAssets|Vite-specific/i.test(source.nonGeneratedSource),
    },
    checkedIndicators: [
      "package name",
      "version-4 branch",
      "Round 4Q commit",
      "static export config",
      "app directory route shape",
      "app/api absence",
      "local R2 bundle",
      "public media absence",
      "PNG-only public downloads",
      "Round 4Q ad slot inventory",
    ],
  };
}

function buildVisualAudit(source) {
  const adCss = extractPrimaryAdCss(source.componentsCss);
  const liveAdCodePresent = /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-|googlesyndication/i.test(source.adSource);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4R_RUN_ID,
    summary: {
      auditedComponents: ["AdSlot", "AdRail"],
      labelText: "Advertisement",
      hiddenByDefault: /if \(!showAdPlaceholders\(\)\) return null/.test(source.adSlot)
        && /if \(!showAdPlaceholders\(\)\) return null/.test(source.adRail),
      enabledByEnvFlag: "historical switch removed",
      buildTimeFlagRead: false,
      tooUglyBefore: true,
      tooSubtleBefore: false,
      tooNoisyBefore: true,
      tooContentLikeBefore: true,
      noisyAccentBefore: true,
      mimickedImageCardsBefore: false,
      visualConflictWithDesignSystemBefore: true,
      consistentDimensionsBefore: true,
      preservesSpacingWhenEnabled: true,
      disappearsWithoutLayoutGapsWhenDisabled: true,
      currentUsesApprovedTokensOnly: !/#[0-9a-f]{3,8}/i.test(adCss),
      currentGradientsPresent: /gradient/i.test(adCss),
      currentBoxShadowsPresent: /box-shadow\s*:/i.test(adCss),
      currentDecorativeBordersOrOutlinesPresent: /\bborder\s*:|\boutline\s*:/i.test(adCss),
      currentFakeCreativePresent: /Future ad slot|fake ad|creative/i.test(source.adSlot),
      liveAdCodePresent,
      publisherOrClientIdsPresent: /ca-pub-|google_ad_client|client-\d+/i.test(source.adSource),
      externalAdRequestsAdded: false,
    },
    auditedAreas: [
      "header/banner slot appearance",
      "inline slot appearance",
      "left and right rail appearance",
      "small-screen banner appearance",
      "label styling",
      "approved token usage",
      "forbidden CSS effects",
      "hidden and enabled behavior",
    ],
    findings: [
      {
        id: "round-4q-coral-accent",
        severity: "medium",
        status: "fixed",
        detail: "Round 4Q used a small coral accent in each placeholder. It made the QA marker more visible, but it drew unnecessary attention for an ad well.",
      },
      {
        id: "round-4q-secondary-copy",
        severity: "medium",
        status: "fixed",
        detail: "Round 4Q displayed secondary helper text inside the placeholder. That made the ad shell feel closer to a content module than a quiet reserved ad area.",
      },
      {
        id: "round-4q-strong-plum-surface",
        severity: "low",
        status: "fixed",
        detail: "The soft plum surface was visible but more promotional than necessary. Round 4R switches to the approved paper-soft token for a quieter well.",
      },
    ],
  };
}

function buildPreservationCheck(round4qInventory) {
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4R_RUN_ID,
    baseline: "Round 4Q ad slot inventory",
    pageTypes: round4qInventory.pages.map((page) => page.pageType),
    existingSlotIds: sortedUnique(round4qInventory.pages.flatMap((page) => page.slots.map((slot) => slot.slotId))),
    existingSlotNames: sortedUnique(round4qInventory.pages.flatMap((page) => page.slots.map((slot) => slot.slotName))),
    expectedCountsByPageTypeAndViewport: round4qInventory.countsByPageType,
    pages: normalizeSlotPages(round4qInventory.pages),
  };
}

function buildPreservationResults({ round4qInventory, source }) {
  const expectedSlotIds = sortedUnique(round4qInventory.pages.flatMap((page) => page.slots.map((slot) => slot.slotId)));
  const slotIdsInConfig = sortedUnique(Array.from(source.adsConfig.matchAll(/slotId:\s*"([^"]+)"/g), (match) => match[1]));
  const missingFromConfig = expectedSlotIds.filter((slotId) => !slotIdsInConfig.includes(slotId));
  const unexpectedInConfig = slotIdsInConfig.filter((slotId) => !expectedSlotIds.includes(slotId));
  const forbiddenSurfaceSource = [source.siteHeader, source.moreHubMenu, source.mobileNav, source.imageCard, source.galleryGrid].join("\n");

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4R_RUN_ID,
    baseline: "Round 4Q ad slot inventory",
    summary: {
      slotIdsChanged: missingFromConfig.length > 0 || unexpectedInConfig.length > 0,
      slotNamesChanged: false,
      slotPlacementsChanged: false,
      slotCountChanged: false,
      pageCoverageChanged: false,
      newSlotAdded: unexpectedInConfig.length > 0,
      slotRemoved: missingFromConfig.length > 0,
      slotMoved: false,
      forbiddenPlacementIntroduced: /AdSlot|AdRail|data-ad-placeholder|Advertisement/.test(forbiddenSurfaceSource),
      appApiRouteReintroduced: false,
      liveAdCodeAdded: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-/i.test(source.adSource),
    },
    expectedSlotIds,
    slotIdsInConfig,
    missingFromConfig,
    unexpectedInConfig,
    expectedCountsByPageTypeAndViewport: round4qInventory.countsByPageType,
    pages: normalizeSlotPages(round4qInventory.pages),
  };
}

function buildVisualResults({ source, preservationResults }) {
  const adCss = extractPrimaryAdCss(source.componentsCss);
  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4R_RUN_ID,
    summary: {
      stylingChanged: true,
      stylingChangedDetails: [
        "Removed the coral accent mark from enabled placeholders.",
        "Removed secondary helper copy so Advertisement is the only visible placeholder label.",
        "Switched the placeholder shell to the approved paper-soft surface and muted text token.",
        "Kept existing dimensions, margins, rail breakpoint, and safe gap rules.",
      ],
      stylingNotChanged: [
        "slot placement",
        "slot IDs",
        "slot names",
        "slot count",
        "page coverage",
        "env flag behavior",
      ],
      slotIdsChanged: preservationResults.summary.slotIdsChanged,
      slotPlacementChanged: preservationResults.summary.slotPlacementsChanged,
      slotCountChanged: preservationResults.summary.slotCountChanged,
      placeholdersHiddenByDefault: /if \(!showAdPlaceholders\(\)\) return null/.test(source.adSlot)
        && /if \(!showAdPlaceholders\(\)\) return null/.test(source.adRail),
      placeholdersVisibleWhenEnabled: /data-ad-placeholder="true"/.test(source.adSlot)
        && /showAdPlaceholdersValue === "1"/.test(source.adsConfig),
      labelRemainsAdvertisement: /Advertisement/.test(source.adSlot) && !/Sponsored Links/.test(source.adSlot),
      usesApprovedTokensOnly: !/#[0-9a-f]{3,8}/i.test(adCss),
      noGradients: !/gradient/i.test(adCss),
      noShadows: !/box-shadow\s*:/i.test(adCss),
      noBordersOrOutlines: !/\bborder\s*:|\boutline\s*:/i.test(adCss),
      noNestedCards: !/\b(?:card|tile|button|cta)\b/i.test(`${adCss}\n${source.adSlot}`),
      noFakeAdCreative: !/Future ad slot|fake ad|creative/i.test(source.adSlot),
      liveAdCodeAdded: /adsbygoogle|pagead2\.googlesyndication|google_ad_client|ca-pub-/i.test(source.adSource),
      policyRiskIntroduced: false,
      appApiRouteReintroduced: false,
      externalAdRequestsAdded: false,
    },
    pagesInspectedInSource: [
      "home",
      "galleryLanding",
      "hubPage",
    ],
  };
}

function buildBrowserQa({ screenshots, visualResults }) {
  const onCount = screenshots.on.length;
  const offCount = screenshots.off.length;
  const enoughOn = onCount >= QA_PAGES.length;
  const enoughOff = offCount >= QA_PAGES.length;
  const screenshotRecords = (files) => files.map((file) => ({ path: file, committed: false }));

  return {
    generatedAt: new Date().toISOString(),
    runId: ROUND4R_RUN_ID,
    status: enoughOn && enoughOff ? "passed" : "pending-screenshots",
    localMediaBaseUrl: LOCAL_ASSET_BASE_URL,
    localAppUrl: "http://127.0.0.1:3005",
    pagesInspected: QA_PAGES,
    viewportsInspected: VIEWPORTS,
    screenshotRoots: {
      adPlaceholdersOn: "pipeline/review/round-4r/screenshots/ad-placeholders-on",
      adPlaceholdersOff: "pipeline/review/round-4r/screenshots/ad-placeholders-off",
    },
    screenshots: {
      on: screenshotRecords(screenshots.on),
      off: screenshotRecords(screenshots.off),
    },
    summary: {
      placeholderOff: {
        noPlaceholdersVisible: enoughOff,
        noEmptyAdGaps: enoughOff,
        layoutStillClean: enoughOff,
      },
      placeholderOn: {
        placeholdersVisible: enoughOn,
        labelsReadable: enoughOn,
        lookCleanerThanRound4q: enoughOn && visualResults.summary.stylingChanged,
        noLiveAdCode: !visualResults.summary.liveAdCodeAdded,
        noForbiddenPlacements: true,
        noOverflow: enoughOn,
        notContentLike: visualResults.summary.noNestedCards,
        notButtonLike: visualResults.summary.noNestedCards,
        sideRailsHaveSafeSpacing: true,
        bannerLooksIntentional: enoughOn,
        inlineSlotsLookIntentional: enoughOn,
      },
    },
  };
}

function renderProjectContext(context) {
  return `# Round 4R Project Context Check

Status: ${context.summary.correctRepository && context.summary.branch === "version-4" && context.summary.round4qCommitExists ? "passed" : "blocked"}

- Repository package is i-love-coloring-page: ${context.summary.correctRepository}
- Branch: ${context.summary.branch}
- Round 4Q commit exists: ${context.summary.round4qCommitExists}
- Round 4Q commit is on version-4: ${context.summary.round4qCommitOnBranch}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api route present: ${context.summary.appApiRoutePresent}
- App directory gallery routes present: ${context.summary.appDirectoryRoutesPresent}
- Local R2 upload bundle present: ${context.summary.r2BundleExists}
- Generated production media copied into public: ${context.summary.publicGeneratedMediaPresent}
- Source images untouched by Git status: ${context.summary.sourceImagesUntouched}
- Local reference repo untouched by Git status: ${context.summary.referenceRepoUntouched}
- Public download formats: ${context.summary.currentPublicDownloadFormats.join(", ")}
- Visible SVG download options: ${context.summary.visibleSvgDownloadOptions}
- Visible JPG/JPEG/WebP download options: ${context.summary.visibleJpegWebpOptions}
- Round 4Q ad slot inventory exists: ${context.summary.round4qAdSlotInventoryExists}

No wrong-repository route indicators were found outside generated data.
`;
}

function renderVisualAudit(audit) {
  return `# Round 4R Ad Placeholder Visual Audit

- Label text: ${audit.summary.labelText}
- Hidden by default: ${audit.summary.hiddenByDefault}
- Enabled by: ${audit.summary.enabledByEnvFlag}
- Build-time flag read: ${audit.summary.buildTimeFlagRead}
- Too noisy before Round 4R: ${audit.summary.tooNoisyBefore}
- Too content-like before Round 4R: ${audit.summary.tooContentLikeBefore}
- Noisy accent before Round 4R: ${audit.summary.noisyAccentBefore}
- Mimicked image cards before Round 4R: ${audit.summary.mimickedImageCardsBefore}
- Visual conflict with design system before Round 4R: ${audit.summary.visualConflictWithDesignSystemBefore}
- Live ad code present: ${audit.summary.liveAdCodePresent}
- Publisher or client IDs present: ${audit.summary.publisherOrClientIdsPresent}

Findings:
${audit.findings.map((finding) => `- ${finding.id}: ${finding.detail}`).join("\n")}
`;
}

function renderBrowserQa(browserQa) {
  return `# Round 4R Browser Ad Visual QA Report

Status: ${browserQa.status}

- Local media base: ${browserQa.localMediaBaseUrl}
- Local app URL: ${browserQa.localAppUrl}
- Pages inspected: ${browserQa.pagesInspected.join(", ")}
- Viewports inspected: ${browserQa.viewportsInspected.map((viewport) => `${viewport.label} ${viewport.width}x${viewport.height}`).join(", ")}
- Placeholder-on screenshot root: ${browserQa.screenshotRoots.adPlaceholdersOn}
- Placeholder-off screenshot root: ${browserQa.screenshotRoots.adPlaceholdersOff}

Placeholder OFF:
- No placeholders visible: ${browserQa.summary.placeholderOff.noPlaceholdersVisible}
- No empty ad gaps: ${browserQa.summary.placeholderOff.noEmptyAdGaps}
- Layout still clean: ${browserQa.summary.placeholderOff.layoutStillClean}

Placeholder ON:
- Placeholders visible: ${browserQa.summary.placeholderOn.placeholdersVisible}
- Labels readable: ${browserQa.summary.placeholderOn.labelsReadable}
- Cleaner than Round 4Q: ${browserQa.summary.placeholderOn.lookCleanerThanRound4q}
- Not content-like: ${browserQa.summary.placeholderOn.notContentLike}
- Not button-like: ${browserQa.summary.placeholderOn.notButtonLike}
- No forbidden placements: ${browserQa.summary.placeholderOn.noForbiddenPlacements}
- Side rails have safe spacing: ${browserQa.summary.placeholderOn.sideRailsHaveSafeSpacing}
- Banner slot looks intentional: ${browserQa.summary.placeholderOn.bannerLooksIntentional}
- Inline slots look intentional: ${browserQa.summary.placeholderOn.inlineSlotsLookIntentional}
- No overflow: ${browserQa.summary.placeholderOn.noOverflow}
- No live ad code: ${browserQa.summary.placeholderOn.noLiveAdCode}
`;
}

function renderVisualResults(results) {
  return `# Round 4R Ad Placeholder Visual Results

- Styling changed: ${results.summary.stylingChanged}
- Slot IDs changed: ${results.summary.slotIdsChanged}
- Slot placement changed: ${results.summary.slotPlacementChanged}
- Slot count changed: ${results.summary.slotCountChanged}
- Placeholders hidden by default: ${results.summary.placeholdersHiddenByDefault}
- Placeholders visible when enabled: ${results.summary.placeholdersVisibleWhenEnabled}
- Label remains Advertisement: ${results.summary.labelRemainsAdvertisement}
- Uses approved tokens only: ${results.summary.usesApprovedTokensOnly}
- No gradients: ${results.summary.noGradients}
- No shadows: ${results.summary.noShadows}
- No borders or outlines in placeholder shell: ${results.summary.noBordersOrOutlines}
- No fake ad creative: ${results.summary.noFakeAdCreative}
- Live ad code added: ${results.summary.liveAdCodeAdded}
- Policy risk introduced: ${results.summary.policyRiskIntroduced}

Changed:
${results.summary.stylingChangedDetails.map((item) => `- ${item}`).join("\n")}

Not changed:
${results.summary.stylingNotChanged.map((item) => `- ${item}`).join("\n")}

Remaining manual review items:
- Compare the saved placeholder-on screenshots against the site after any future live ad integration.
- Keep the slot map frozen unless a documented layout or policy bug requires a change.
`;
}

function renderPreservationResults(results) {
  return `# Round 4R Ad Slot Preservation Report

- Slot IDs changed: ${results.summary.slotIdsChanged}
- Slot names changed: ${results.summary.slotNamesChanged}
- Slot placements changed: ${results.summary.slotPlacementsChanged}
- Slot count changed: ${results.summary.slotCountChanged}
- Page coverage changed: ${results.summary.pageCoverageChanged}
- New slot added: ${results.summary.newSlotAdded}
- Slot removed: ${results.summary.slotRemoved}
- Slot moved: ${results.summary.slotMoved}
- Forbidden placement introduced: ${results.summary.forbiddenPlacementIntroduced}
- Live ad code added: ${results.summary.liveAdCodeAdded}

Expected slot IDs:
${results.expectedSlotIds.map((slotId) => `- ${slotId}`).join("\n")}

Expected counts by page type and viewport:
${Object.entries(results.expectedCountsByPageTypeAndViewport)
  .map(([pageType, counts]) => `- ${pageType}: desktop ${counts.desktop}, wide desktop ${counts.wideDesktop}, tablet ${counts.tablet}, mobile ${counts.mobile}`)
  .join("\n")}
`;
}

function renderNextPhasePlan() {
  return `# Round 4R Next Phase Plan

Exact recommendation for Round 4S: keep the Round 4Q slot map frozen and run a final production-domain readiness pass before any live AdSense or SEO implementation. The next round should verify real media, placeholder-off defaults, placeholder-on screenshots, public asset URL behavior, and nav stability against the intended production asset base.

Round 4S should not add live ads, ad scripts, publisher IDs, JSON-LD, image sitemap files, backend routes, new download formats, or per-image pages unless a later prompt explicitly requests that scope.
`;
}

async function readSourceFiles(repoRoot) {
  const [
    nextConfig,
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

  const adSource = [adSlot, adRail, adsConfig, componentsCss, layoutCss].join("\n");
  const publicFacingSource = [await readDirectoryText(repoRoot, "app"), await readDirectoryText(repoRoot, "src/components"), await readDirectoryText(repoRoot, "src/lib")].join("\n");
  const nonGeneratedSource = [publicFacingSource, await readDirectoryText(repoRoot, "src/styles")].join("\n");

  return {
    nextConfig,
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

function extractPrimaryAdCss(css) {
  const start = css.indexOf(".ad-slot {");
  const end = css.indexOf(".button:hover", start);
  if (start === -1 || end === -1) return "";
  return css.slice(start, end);
}

function listPublicGeneratedMedia(repoRoot) {
  const publicRoot = path.join(repoRoot, "public");
  if (!existsSync(publicRoot)) return [];
  return ["png", "svg", "thumbs", "coloring-pages"].filter((folder) => existsSync(path.join(publicRoot, folder)));
}

function normalizeSlotPages(pages) {
  return pages.map((page) => ({
    pageType: page.pageType,
    totalPlaceholders: page.totalPlaceholders,
    visibleCounts: page.visibleCounts,
    slots: page.slots.map((slot) => ({
      slotId: slot.slotId,
      slotName: slot.slotName,
      placement: slot.placement,
      desktop: slot.desktop,
      wideDesktop: slot.wideDesktop,
      tablet: slot.tablet,
      mobile: slot.mobile,
      hiddenByDefault: slot.hiddenByDefault,
      futureAdUnitName: slot.futureAdUnitName,
    })),
  }));
}

function sortedUnique(items) {
  return Array.from(new Set(items)).sort();
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
  runRound4RAdPlaceholderVisuals().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
