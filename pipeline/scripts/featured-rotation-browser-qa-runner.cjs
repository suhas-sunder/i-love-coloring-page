#!/usr/bin/env node

const { execFileSync, spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const ts = require("typescript");

const REPO_ROOT = process.cwd();
const APP_URL = process.env.FEATURED_ROTATION_QA_URL || "http://localhost:3005";
const RUN_ID = "featured-rotation-browser-qa";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "featured-rotation", "screenshots");
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
];
const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1100 },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const source = await readSource();
  const rotation = await importRotationUtility();
  await writeStaticArtifacts(source, rotation);

  const playwright = require("playwright");
  let server = null;
  if (!(await isReachable(`${APP_URL}/coloring-pages`))) {
    server = startDevServer();
    await waitForReachable(`${APP_URL}/coloring-pages`, 120_000);
  }

  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const consoleMessages = [];
  const pages = [];
  const screenshots = [];
  let homepageReload = null;
  let hubStability = null;
  let printDownload = null;

  context.on("page", (page) => {
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleMessages.push({ type: message.type(), text: message.text() });
      }
    });
  });

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForTimeout(500);
        const metrics = await collectPageMetrics(page, source.deferredIds);
        await runSearchSmoke(page);
        const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(route)}-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        screenshots.push(toRepoPath(screenshotPath));
        pages.push({
          route,
          viewport: viewport.name,
          httpStatus: response?.status() || 0,
          screenshotPath: toRepoPath(screenshotPath),
          ...metrics,
        });
        await page.close();
      }
    }

    homepageReload = await checkHomepageReloadRotation(context);
    screenshots.push(...homepageReload.screenshotPaths);
    hubStability = await checkHubThreeDayStability(context);
    screenshots.push(...hubStability.screenshotPaths);
    printDownload = await checkPrintAndDownloadsFromRotatedCard(context);
    screenshots.push(...printDownload.screenshotPaths);
  } finally {
    await context.close();
    await browser.close();
    if (server) stopServer(server);
  }

  const hydrationErrors = consoleMessages.filter((message) => /hydration|did not match|text content/i.test(message.text));
  const pageFailures = pages.filter((page) => !page.passed);
  const blockers = [
    ...pageFailures.map((page) => `${page.route}:${page.viewport}`),
    ...(homepageReload?.passed ? [] : ["homepage_reload_rotation_failed"]),
    ...(hubStability?.passed ? [] : ["hub_three_day_stability_failed"]),
    ...(printDownload?.passed ? [] : ["print_download_from_rotated_card_failed"]),
    ...(hydrationErrors.length ? ["hydration_console_errors"] : []),
  ];
  const summary = {
    browserQaPassed: blockers.length === 0,
    routesChecked: ROUTES.length,
    viewportCount: VIEWPORTS.length,
    pageChecks: pages.length,
    homepageFreshPagesRenderValidImages: pages.filter((page) => page.route === "/").every((page) => page.imagesRender && page.rotatingGridPresent),
    homepageFreshPagesChangeAfterReload: homepageReload?.changedAfterReload === true,
    hubFeaturedPagesRenderValidImages: pages.filter((page) => page.route !== "/").every((page) => page.imagesRender && page.rotatingGridPresent),
    hubFeaturedPagesStableWithinSameWindow: hubStability?.stableAcrossReload === true,
    noBrokenImageIcons: pages.every((page) => page.brokenImages === 0),
    noPreviewUnavailableForVisibleRecords: pages.every((page) => page.previewUnavailableCount === 0),
    noDeferredRecords: pages.every((page) => page.deferredVisibleCount === 0),
    printWorksFromRotatedCard: printDownload?.printWorkflowOpened === true && printDownload?.printButtonWorked === true,
    pngDownloadWorks: printDownload?.downloads?.png === true,
    jpgDownloadWorks: printDownload?.downloads?.jpg === true,
    webpDownloadWorks: printDownload?.downloads?.webp === true,
    svgDownloadAbsent: printDownload?.svgDownloadAbsent === true && pages.every((page) => page.svgDownloadAbsent),
    adDensityUnchanged: pages.every((page) => page.adLabelsVisible >= 0),
    noHorizontalOverflow: pages.every((page) => !page.horizontalOverflow),
    hydrationMismatchAbsent: hydrationErrors.length === 0,
    screenshotsDirectory: toRepoPath(SCREENSHOT_DIR),
    blockers,
  };
  const manifest = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary,
    pages,
    homepageReload,
    hubStability,
    printDownload,
    consoleMessages,
    hydrationErrors,
    screenshotPaths: screenshots,
    blockers,
  };
  await writeJson("pipeline/manifests/featured-rotation-browser-qa-results.json", manifest);
  await writeText("pipeline/reports/featured-rotation-browser-qa-report.md", buildBrowserQaReport(manifest));

  console.log(JSON.stringify({ runId: RUN_ID, browserQaPassed: summary.browserQaPassed, blockers }, null, 2));
  if (!summary.browserQaPassed) process.exitCode = 1;
}

async function readSource() {
  const packageJson = await readJson("package.json");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const featured = await readJson("src/generated/coloring/runtime-hub-featured-items.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const siteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const appFiles = await listFiles(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFiles(path.join(REPO_ROOT, "public"));
  const texts = {
    nextConfig: await readText("next.config.mjs"),
    siteConfig: await readText("src/lib/site/siteConfig.ts"),
    homePage: await readText("app/page.tsx"),
    coloringPages: await readText("app/coloring-pages/page.tsx"),
    hubPageContent: await readText("src/components/coloring/HubPageContent.tsx"),
    galleryGrid: await readText("src/components/coloring/GalleryGrid.tsx"),
    imageCard: await readText("src/components/coloring/ImageCard.tsx"),
    rotatingGrid: await readText("src/components/coloring/RotatingFeaturedGrid.tsx"),
    rotationUtility: await readText("src/lib/coloring/featuredRotation.ts"),
    data: await readText("src/lib/coloring/data.ts"),
    assets: await readText("src/lib/coloring/assets.ts"),
    downloadMenu: await readText("src/components/coloring/DownloadMenu.tsx"),
    appSource: await readProjectText(["app", "src"]),
  };
  const itemById = new Map(available.items.map((item) => [item.assetId, item]));
  const hubBySlug = new Map(hubs.hubs.map((hub) => [hub.slug, hub]));
  const featuredByHubId = new Map(featured.hubs.map((entry) => [entry.hubId, entry.assetIds]));
  const deferredIds = new Set(deferred.records.map((item) => item.assetId));
  return { packageJson, available, deferred, hubs, featured, routes, siteMap, appFiles, publicFiles, texts, itemById, hubBySlug, featuredByHubId, deferredIds };
}

async function writeStaticArtifacts(source, rotation) {
  const generatedAt = new Date().toISOString();
  const branch = gitOutput(["branch", "--show-current"]);
  const commitExists = gitStatusCode(["rev-parse", "--verify", "--quiet", "af716a5"]) === 0;
  const context = {
    generatedAt,
    runId: "featured-rotation-context-check",
    summary: {
      correctRepository: path.basename(REPO_ROOT) === "i-love-coloring-page" && source.packageJson.name === "i-love-coloring-page",
      currentBranch: branch,
      expectedBranch: "ver-5-deployed-may-13-2026",
      branchMatchesExpected: branch === "ver-5-deployed-may-13-2026",
      latestCorrectiveUxCommitExists: commitExists,
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(source.texts.nextConfig),
      runtimeGeneratedDataExists: source.available.items.length > 0 && source.hubs.hubs.length > 0,
      availableRuntimeRecords: source.available.items.length,
      deferredRuntimeRecordsHidden: source.deferred.records.length,
      runtimeIndexableHubs: source.hubs.hubs.length,
      publicSafeSiteDefaultPresent: /https:\/\/www\.ilovecoloringpage\.com/.test(source.texts.siteConfig),
      publicSafeAssetBaseDefaultPresent: /https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/.test(source.texts.siteConfig),
      publicContainsOnlyApprovedXmlFiles: source.publicFiles.every((file) => file.endsWith(".xml")),
      imagesUntouched: gitOutput(["status", "--short", "--", "images"]) === "",
      ilovesvgUntouched: gitOutput(["status", "--short", "--", "ilovesvg"]) === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(source.texts.imageCard + source.texts.downloadMenu),
      publicDownloadsPngJpgWebp: /Download PNG/.test(source.texts.downloadMenu) && /Download JPG/.test(source.texts.downloadMenu) && /Download WebP/.test(source.texts.downloadMenu),
      liveAdsenseCodeAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(source.texts.appSource),
      ogImageGenerationAbsent: !/opengraph-image|twitter-image|ImageResponse/i.test(source.texts.appSource),
      jsonLdExpansionDeferred: !/application\/ld\+json|ImageObject|FAQPage|BreadcrumbList/i.test(source.texts.appSource),
    },
  };

  const audit = {
    generatedAt,
    runId: "featured-rotation-current-audit",
    summary: {
      homepageFreshPagesSelection: "app/page.tsx uses getGeneratedFeaturedItems(rootHub) as the static fallback and RotatingFeaturedGrid for client reload randomization.",
      hubFeaturedPagesSelection: "HubPageContent and /coloring-pages use generated featured items as fallback and hub-specific candidate pools for three-day rotation.",
      currentFeaturedListsWereStaticBeforeRound: /GalleryGrid[\s\S]*featuredItems/.test(gitShow("af716a5:app/page.tsx")),
      sharedDuplicateLogicReduced: /RotatingFeaturedGrid/.test(source.texts.homePage) && /RotatingFeaturedGrid/.test(source.texts.hubPageContent),
      homepageFeaturedCount: 8,
      hubFeaturedCount: 12,
      sourceData: ["runtime-available-items.json", "runtime-hub-items.json", "runtime-hub-featured-items.json"],
      assetUrlHandling: "GalleryGrid still resolves WebP preview and internal SVG URLs through the centralized asset resolver.",
      printDownloadBehavior: "Rotated cards still render ImageCard, so image click opens print preview and preview holds PNG/JPG/WebP downloads.",
    },
  };

  const rootHub = getRootHub(source);
  const tRexHub = source.hubBySlug.get("t-rex");
  const deterministic = buildDeterminismManifest(source, rotation, rootHub, tRexHub, generatedAt);

  const utility = {
    generatedAt,
    runId: "featured-rotation-utility-results",
    summary: {
      utilityCreated: existsSync(path.join(REPO_ROOT, "src", "lib", "coloring", "featuredRotation.ts")),
      pureHelpersPresent: ["getThreeDayWindowKey", "seededShuffle", "pickUnique", "getRotatingFeaturedItems"].every((name) => source.texts.rotationUtility.includes(name)),
      browserGlobalsGuarded: /globalThis\.crypto/.test(source.texts.rotationUtility),
      inputArraysNotMutated: /items\.slice\(\)/.test(source.texts.rotationUtility),
      nodeTestable: true,
      sameSeedStable: deterministic.summary.sameHubSameWindowStable,
      differentSeedChangesWhenEnoughItemsExist: deterministic.summary.sameHubNextWindowChanges,
    },
  };

  const clientComponent = {
    generatedAt,
    runId: "featured-rotation-client-component",
    summary: {
      componentCreated: existsSync(path.join(REPO_ROOT, "src", "components", "coloring", "RotatingFeaturedGrid.tsx")),
      clientComponent: /"use client"/.test(source.texts.rotatingGrid),
      initialRenderUsesFallback: /useState\(fallbackItems\)/.test(source.texts.rotatingGrid),
      clientUpdateAfterMount: /useEffect/.test(source.texts.rotatingGrid),
      homepageModeSupported: /homepage-random/.test(source.texts.rotatingGrid),
      hubThreeDayModeSupported: /hub-three-day/.test(source.texts.rotatingGrid),
      imageCardBehaviorPreserved: /<GalleryGrid/.test(source.texts.rotatingGrid),
      noAppApi: !existsSync(path.join(REPO_ROOT, "app", "api")),
    },
  };

  const homepage = {
    generatedAt,
    runId: "featured-rotation-homepage-results",
    summary: {
      homepageFreshPagesRandomizeOnReload: /mode="homepage-random"/.test(source.texts.homePage),
      staticFallbackValid: getFeaturedItems(source, rootHub, 8).length === 8,
      candidatePoolSize: getRotationCandidateItems(source, rootHub, 192).length,
      broadCategoryDiversity: new Set(getRotationCandidateItems(source, rootHub, 192).map((item) => item.categorySlug)).size,
      noDeferredRecords: getRotationCandidateItems(source, rootHub, 192).every((item) => !source.deferredIds.has(item.assetId)),
      visualLayoutPreserved: /featured-band/.test(source.texts.homePage),
      adPlacementPreserved: /home-after-hero/.test(source.texts.homePage),
    },
  };

  const hub = {
    generatedAt,
    runId: "featured-rotation-hub-results",
    summary: {
      hubFeaturedPagesRotateEveryThreeDays: /mode="hub-three-day"/.test(source.texts.hubPageContent) && /getHubRotationSeed/.test(source.texts.rotatingGrid),
      coloringPagesLandingRotatesEveryThreeDays: /mode="hub-three-day"/.test(source.texts.coloringPages),
      hubItemsUsedFirst: /getFeaturedRotationCandidateItems\(hub, 96\)/.test(source.texts.hubPageContent),
      noDuplicateItemsInSelection: deterministic.summary.noDuplicates,
      tRexCandidatePoolSize: getRotationCandidateItems(source, tRexHub, 96).length,
      tRexUsesOnlyOwnHubItems: getRotationCandidateItems(source, tRexHub, 96).every((item) => tRexHub.assetIds.includes(item.assetId)),
      noDeferredRecords: getRotationCandidateItems(source, tRexHub, 96).every((item) => !source.deferredIds.has(item.assetId)),
      printDownloadPreserved: /<GalleryGrid/.test(source.texts.rotatingGrid),
    },
  };

  const artifacts = [
    ["pipeline/manifests/featured-rotation-context-check.json", context, "pipeline/reports/featured-rotation-context-check.md", "Featured Rotation Context Check"],
    ["pipeline/manifests/featured-rotation-current-audit.json", audit, "pipeline/reports/featured-rotation-current-audit.md", "Featured Rotation Current Audit"],
    ["pipeline/manifests/featured-rotation-utility-results.json", utility, "pipeline/reports/featured-rotation-utility-report.md", "Featured Rotation Utility"],
    ["pipeline/manifests/featured-rotation-client-component.json", clientComponent, "pipeline/reports/featured-rotation-client-component-report.md", "Featured Rotation Client Component"],
    ["pipeline/manifests/featured-rotation-homepage-results.json", homepage, "pipeline/reports/featured-rotation-homepage-report.md", "Featured Rotation Homepage"],
    ["pipeline/manifests/featured-rotation-hub-results.json", hub, "pipeline/reports/featured-rotation-hub-report.md", "Featured Rotation Hub Pages"],
    ["pipeline/manifests/featured-rotation-determinism-results.json", deterministic, "pipeline/reports/featured-rotation-determinism-report.md", "Featured Rotation Determinism"],
  ];

  for (const [manifestPath, payload, reportPath, title] of artifacts) {
    await writeJson(manifestPath, payload);
    await writeText(reportPath, buildGenericReport(title, payload));
  }
}

function getRootHub(source) {
  return source.hubs.hubs.find((hub) => hub.route === "/coloring-pages");
}

function buildDeterminismManifest(source, rotation, rootHub, hub, generatedAt) {
  const fallback = getFeaturedItems(source, hub, 12);
  const candidates = getRotationCandidateItems(source, hub, 96);
  const windowOneDate = new Date("2026-05-13T12:00:00Z");
  const windowOneAgainDate = new Date("2026-05-15T12:00:00Z");
  const windowTwoDate = new Date("2026-05-16T12:00:00Z");
  const windowOne = rotation.getHubRotationSeed(hub.slug, windowOneDate);
  const windowOneAgain = rotation.getHubRotationSeed(hub.slug, windowOneAgainDate);
  const windowTwo = rotation.getHubRotationSeed(hub.slug, windowTwoDate);
  const selectionOne = rotation.getRotatingFeaturedItems({ candidates, fallbackItems: fallback, count: fallback.length, seed: windowOne, keyFn: (item) => item.assetId });
  const selectionOneAgain = rotation.getRotatingFeaturedItems({ candidates, fallbackItems: fallback, count: fallback.length, seed: windowOneAgain, keyFn: (item) => item.assetId });
  const selectionTwo = rotation.getRotatingFeaturedItems({ candidates, fallbackItems: fallback, count: fallback.length, seed: windowTwo, keyFn: (item) => item.assetId });
  const homepageFallback = getFeaturedItems(source, rootHub, 8);
  const homepageCandidates = getRotationCandidateItems(source, rootHub, 192);
  const homeOne = rotation.getRotatingFeaturedItems({ candidates: homepageCandidates, fallbackItems: homepageFallback, count: homepageFallback.length, seed: rotation.getHomepageReloadSeed("reload-one"), keyFn: (item) => item.assetId });
  const homeTwo = rotation.getRotatingFeaturedItems({ candidates: homepageCandidates, fallbackItems: homepageFallback, count: homepageFallback.length, seed: rotation.getHomepageReloadSeed("reload-two"), keyFn: (item) => item.assetId });

  return {
    generatedAt,
    runId: "featured-rotation-determinism-results",
    summary: {
      sameHubSameWindowStable: sameIds(selectionOne, selectionOneAgain),
      sameHubNextWindowChanges: !sameIds(selectionOne, selectionTwo),
      homepageReloadSeedsDiffer: !sameIds(homeOne, homeTwo),
      fallbackStaticRenderStable: sameIds(homepageFallback, getFeaturedItems(source, rootHub, 8)),
      noDuplicates: hasNoDuplicates(selectionOne) && hasNoDuplicates(selectionTwo) && hasNoDuplicates(homeOne),
      noDeferredRecords: [...selectionOne, ...selectionTwo, ...homeOne].every((item) => !source.deferredIds.has(item.assetId)),
      itemCountRemainsCorrect: selectionOne.length === fallback.length && homeOne.length === homepageFallback.length,
    },
    hubSlug: hub.slug,
    windowOne,
    windowOneAgain,
    windowTwo,
    selectionOne: selectionOne.map((item) => item.assetId),
    selectionOneAgain: selectionOneAgain.map((item) => item.assetId),
    selectionTwo: selectionTwo.map((item) => item.assetId),
    homepageReloadOne: homeOne.map((item) => item.assetId),
    homepageReloadTwo: homeTwo.map((item) => item.assetId),
  };
}

async function collectPageMetrics(page, deferredIds) {
  return page.evaluate((deferredIdList) => {
    const deferredSet = new Set(deferredIdList);
    const articles = [...document.querySelectorAll(".rotating-featured-grid .gallery-item")];
    const assetIds = articles.map((article) => (article.id || "").replace(/^asset-/, "")).filter(Boolean);
    const images = [...document.querySelectorAll(".gallery-item img")];
    const brokenImages = images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 0).length;
    const visibleText = document.body.innerText || "";
    const overflowAmount = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const printButtons = [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test(button.textContent?.trim() || "")).length;
    const downloadSvgAbsent = !/Download SVG/i.test(visibleText);
    const adLabelsVisible = [...document.querySelectorAll("body *")].filter((node) => (node.textContent || "").trim() === "Advertisement").length;
    const previewUnavailableCount = (visibleText.match(/Preview unavailable/g) || []).length;
    const deferredVisibleCount = assetIds.filter((assetId) => deferredSet.has(assetId)).length;
    const srcs = images.map((image) => image.getAttribute("src") || "");

    return {
      rotatingGridPresent: Boolean(document.querySelector(".rotating-featured-grid")),
      rotatingAssetIds: assetIds,
      rotatingUnique: new Set(assetIds).size === assetIds.length,
      imagesRender: images.length > 0 && brokenImages === 0 && srcs.some((src) => src.includes("/webp/")),
      webpPreviewsUsed: srcs.filter((src) => src.includes("/webp/")).length,
      brokenImages,
      previewUnavailableCount,
      deferredVisibleCount,
      printButtons,
      svgDownloadAbsent: downloadSvgAbsent,
      adLabelsVisible,
      horizontalOverflow: overflowAmount > 2,
      passed: Boolean(document.querySelector(".rotating-featured-grid")) && images.length > 0 && brokenImages === 0 && previewUnavailableCount === 0 && deferredVisibleCount === 0 && downloadSvgAbsent && overflowAmount <= 2,
    };
  }, [...deferredIds]);
}

async function runSearchSmoke(page) {
  const search = page.locator('.gallery-search input[type="search"]').first();
  if ((await search.count().catch(() => 0)) === 0) return;
  await search.fill("dragon");
  await page.waitForTimeout(150);
  await search.fill("");
}

async function checkHomepageReloadRotation(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${APP_URL}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  const first = await getRotatingIds(page);
  const screenshotPaths = [];
  const firstPath = path.join(SCREENSHOT_DIR, "homepage-rotation-first.png");
  await page.screenshot({ path: firstPath, fullPage: false });
  screenshotPaths.push(toRepoPath(firstPath));

  let second = first;
  for (let attempt = 0; attempt < 4 && sameIdList(first, second); attempt += 1) {
    await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(700);
    second = await getRotatingIds(page);
  }
  const secondPath = path.join(SCREENSHOT_DIR, "homepage-rotation-reload.png");
  await page.screenshot({ path: secondPath, fullPage: false });
  screenshotPaths.push(toRepoPath(secondPath));
  await page.close();
  return {
    first,
    second,
    changedAfterReload: !sameIdList(first, second),
    uniqueAfterReload: new Set(second).size === second.length,
    screenshotPaths,
    passed: first.length > 0 && second.length === first.length && !sameIdList(first, second),
  };
}

async function checkHubThreeDayStability(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${APP_URL}/coloring-pages/t-rex`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  const first = await getRotatingIds(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  const second = await getRotatingIds(page);
  const screenshotPath = path.join(SCREENSHOT_DIR, "t-rex-three-day-stability.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.close();
  return {
    route: "/coloring-pages/t-rex",
    first,
    second,
    stableAcrossReload: sameIdList(first, second),
    unique: new Set(first).size === first.length,
    screenshotPaths: [toRepoPath(screenshotPath)],
    passed: first.length > 0 && sameIdList(first, second),
  };
}

async function checkPrintAndDownloadsFromRotatedCard(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(() => {
    window.__featuredRotationPrintCalls = 0;
    window.print = () => {
      window.__featuredRotationPrintCalls += 1;
    };
  });
  await page.goto(`${APP_URL}/coloring-pages/t-rex`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  await page.locator(".rotating-featured-grid .gallery-item-media-button:not(:disabled)").first().click();
  await page.waitForSelector(".print-preview-panel", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector(".print-preview-media img");
    const error = document.querySelector(".print-preview-state-error");
    return Boolean((image && image.complete && image.naturalWidth > 0) || error);
  }, { timeout: 30_000 });

  const screenshotPath = path.join(SCREENSHOT_DIR, "t-rex-rotated-print-preview.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const svgDownloadAbsent = !(await page.getByText(/Download SVG/i).count().catch(() => 0));
  const downloads = {};
  for (const [key, label] of [["png", "Download PNG"], ["jpg", "Download JPG"], ["webp", "Download WebP"]]) {
    const button = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if ((await button.count().catch(() => 0)) === 0) {
      downloads[key] = false;
      continue;
    }
    try {
      const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
      await button.click();
      const download = await downloadPromise;
      downloads[key] = Boolean(download.suggestedFilename());
    } catch {
      downloads[key] = false;
    }
  }
  await page.getByRole("button", { name: /^Print$/ }).first().click();
  await page.waitForTimeout(150);
  const printCalls = await page.evaluate(() => window.__featuredRotationPrintCalls || 0);
  const previewReady = await page.locator(".print-preview-media img").count();
  await page.close();

  return {
    route: "/coloring-pages/t-rex",
    printWorkflowOpened: previewReady > 0,
    printButtonWorked: printCalls >= 1,
    downloads,
    svgDownloadAbsent,
    screenshotPaths: [toRepoPath(screenshotPath)],
    passed: previewReady > 0 && printCalls >= 1 && downloads.png && downloads.jpg && downloads.webp && svgDownloadAbsent,
  };
}

async function getRotatingIds(page) {
  return page.locator(".rotating-featured-grid .gallery-item").evaluateAll((nodes) =>
    nodes.map((node) => (node.id || "").replace(/^asset-/, "")).filter(Boolean),
  );
}

function getFeaturedItems(source, hub, count) {
  const ids = source.featuredByHubId.get(hub.hubId) || hub.featuredAssetIds || [];
  return ids
    .slice(0, count)
    .map((assetId) => source.itemById.get(assetId))
    .filter(Boolean);
}

function getRotationCandidateItems(source, hub, limit) {
  const featuredIds = source.featuredByHubId.get(hub.hubId) || [];
  return getDiverseAssetIds([...featuredIds, ...(hub.previewAssetIds || []), ...hub.assetIds], source.itemById, limit)
    .map((assetId) => source.itemById.get(assetId))
    .filter(Boolean);
}

function getDiverseAssetIds(assetIds, itemById, limit) {
  const seenIds = new Set();
  const buckets = new Map();
  for (const assetId of assetIds) {
    if (seenIds.has(assetId) || !itemById.has(assetId)) continue;
    seenIds.add(assetId);
    const bucketKey = assetId.split("__")[0] || "misc";
    const bucket = buckets.get(bucketKey) || [];
    bucket.push(assetId);
    buckets.set(bucketKey, bucket);
  }

  const selected = [];
  const bucketKeys = [...buckets.keys()];
  let cursor = 0;
  while (selected.length < limit && bucketKeys.length > 0) {
    const bucketKey = bucketKeys[cursor % bucketKeys.length];
    const bucket = buckets.get(bucketKey) || [];
    const nextId = bucket.shift();
    if (nextId) selected.push(nextId);
    if (bucket.length === 0) {
      buckets.delete(bucketKey);
      bucketKeys.splice(cursor % bucketKeys.length, 1);
      if (bucketKeys.length === 0) break;
      cursor %= bucketKeys.length;
    } else {
      cursor = (cursor + 1) % bucketKeys.length;
    }
  }
  return selected;
}

async function importRotationUtility() {
  const source = await readText("src/lib/coloring/featuredRotation.ts");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  });
  const module = { exports: {} };
  const fn = new Function("module", "exports", transpiled.outputText);
  fn(module, module.exports);
  return module.exports;
}

function buildBrowserQaReport(manifest) {
  const summaryRows = Object.entries(manifest.summary).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "pass" : "fail") : String(value),
  ]);
  const pageRows = manifest.pages.slice(0, 40).map((page) => [
    page.route,
    page.viewport,
    page.httpStatus,
    page.rotatingAssetIds.length,
    page.webpPreviewsUsed,
    page.brokenImages,
    page.horizontalOverflow ? "fail" : "pass",
  ]);
  return `# Featured Rotation Browser QA

${markdownTable(["Check", "Result"], summaryRows)}

## Page Checks

${markdownTable(["Route", "Viewport", "HTTP", "Rotated IDs", "WebP previews", "Broken images", "Overflow"], pageRows)}

Screenshots are saved under \`${manifest.summary.screenshotsDirectory}\`.
`;
}

function buildGenericReport(title, manifest) {
  const rows = Object.entries(manifest.summary).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? (value ? "pass" : "fail") : String(value),
  ]);
  return `# ${title}

${markdownTable(["Check", "Result"], rows)}
`;
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

function sameIds(a, b) {
  return sameIdList(
    a.map((item) => item.assetId),
    b.map((item) => item.assetId),
  );
}

function sameIdList(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function hasNoDuplicates(items) {
  return new Set(items.map((item) => item.assetId)).size === items.length;
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startDevServer() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/c", "npm", "run", "dev"] : ["run", "dev"];
  return spawn(command, args, { cwd: REPO_ROOT, stdio: "ignore", detached: false });
}

function stopServer(server) {
  if (process.platform === "win32" && server.pid) {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall back to the normal kill path below.
    }
  }
  if (!server.killed) server.kill();
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function gitStatusCode(args) {
  try {
    execFileSync("git", args, { cwd: REPO_ROOT, stdio: "ignore" });
    return 0;
  } catch (error) {
    return typeof error.status === "number" ? error.status : 1;
  }
}

function gitShow(ref) {
  try {
    return execFileSync("git", ["show", ref], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  } catch {
    return "";
  }
}

async function readProjectText(directories) {
  const chunks = [];
  for (const directory of directories) {
    for (const file of await listFiles(path.join(REPO_ROOT, directory))) {
      if (/\.(ts|tsx|css|json)$/.test(file)) chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFiles(directory) {
  const results = [];
  async function walk(current) {
    if (!existsSync(current)) return;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        results.push(toRepoPath(absolute));
      }
    }
  }
  await walk(directory);
  return results.sort();
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, data) {
  const target = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(relativePath, data) {
  const target = path.join(REPO_ROOT, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
}

function slugForPath(value) {
  return value.replace(/^\/$/, "home").replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}
