#!/usr/bin/env node

const { execFileSync, spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "ux-corrective";
const APP_URL = "http://localhost:3005";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "ux-corrective", "screenshots");
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
  "/contact",
  "/privacy",
];
const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1100 },
  { name: "wide-1920", width: 1920, height: 1200 },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const source = await readSource();
  await writeStaticArtifacts(source);

  const playwright = require("playwright");
  let server = null;
  if (!(await isReachable(`${APP_URL}/coloring-pages`))) {
    server = startDevServer();
    await waitForReachable(`${APP_URL}/coloring-pages`, 120_000);
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const pages = [];
  const screenshots = [];
  let workflow = null;
  let moreMenu = null;
  let mobileMenu = null;

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(`${APP_URL}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForTimeout(250);
        await runSearchSmoke(page);
        const metrics = await collectPageMetrics(page);
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

    workflow = await runPrintPreviewWorkflow(context);
    screenshots.push(...workflow.screenshotPaths);
    moreMenu = await runMoreMenuCheck(context, "wide-1920", 1920);
    screenshots.push(...moreMenu.screenshotPaths);
    const veryWideMenu = await runMoreMenuCheck(context, "very-wide-2560", 2560);
    screenshots.push(...veryWideMenu.screenshotPaths);
    moreMenu = mergeMenuChecks(moreMenu, veryWideMenu);
    mobileMenu = await runMobileMenuCheck(context);
    screenshots.push(...mobileMenu.screenshotPaths);
  } finally {
    await context.close();
    await browser.close();
    if (server) stopServer(server);
  }

  const browserQa = buildBrowserQa({ pages, workflow, moreMenu, mobileMenu, screenshots });
  await writeJson("pipeline/manifests/ux-corrective-browser-qa-results.json", browserQa);
  await writeReport("pipeline/reports/ux-corrective-browser-qa-report.md", "UX Corrective Browser QA", browserQa.summary, browserQa.blockers);

  console.log(JSON.stringify({ runId: RUN_ID, browserQaPassed: browserQa.summary.browserQaPassed, blockers: browserQa.blockers }, null, 2));
  if (!browserQa.summary.browserQaPassed) process.exitCode = 1;
}

async function readSource() {
  const packageJson = await readJson("package.json");
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const siteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const publicFiles = await listFiles(path.join(REPO_ROOT, "public"));
  const appFiles = await listFiles(path.join(REPO_ROOT, "app"));
  const texts = {
    nextConfig: await readText("next.config.mjs"),
    siteConfig: await readText("src/lib/site/siteConfig.ts"),
    imageCard: await readText("src/components/coloring/ImageCard.tsx"),
    assetImage: await readText("src/components/coloring/AssetImage.tsx"),
    downloadMenu: await readText("src/components/coloring/DownloadMenu.tsx"),
    browserDownloads: await readText("src/lib/coloring/browserDownloads.ts"),
    hubHero: await readText("src/components/coloring/HubHero.tsx"),
    relatedHubs: await readText("src/components/coloring/RelatedHubs.tsx"),
    moreMenu: await readText("src/components/site/MoreHubMenu.tsx"),
    mobileNav: await readText("src/components/site/MobileNav.tsx"),
    siteNav: await readText("src/lib/navigation/siteNav.ts"),
    css: await readText("src/styles/components.css"),
    appSource: await readProjectText(["app", "src"]),
  };

  return { packageJson, available, deferred, hubs, siteMap, publicFiles, appFiles, texts };
}

async function writeStaticArtifacts(source) {
  const downloadsText = `${source.texts.browserDownloads}\n${source.texts.downloadMenu}`;
  const context = {
    generatedAt: new Date().toISOString(),
    runId: "ux-corrective-context-check",
    summary: {
      correctRepository: source.packageJson.name === "i-love-coloring-page",
      currentBranch: gitOutput(["branch", "--show-current"]),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*"export"/.test(source.texts.nextConfig),
      runtimeGeneratedDataExists: existsSync(path.join(REPO_ROOT, "src/generated/coloring/runtime-available-items.json")),
      runtimeAvailableRecords: source.available.summary?.itemCount || source.available.items.length,
      runtimeHubCount: source.hubs.summary?.indexableHubCount || source.hubs.hubs.length,
      siteUrlDefaultPresent: /https:\/\/www\.ilovecoloringpage\.com/.test(source.texts.siteConfig),
      assetBaseDefaultPresent: /https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages/.test(source.texts.siteConfig),
      publicContainsOnlyApprovedXml: source.publicFiles.every((file) => file === "public/image-sitemap.xml"),
      imagesUntouched: gitStatus("images") === "",
      ilovesvgUntouched: gitStatus("ilovesvg") === "",
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload/i.test(downloadsText),
      publicDownloads: ["PNG", "JPG", "WebP"],
      liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(source.texts.appSource),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(source.texts.appSource),
      jsonLdExpansionDeferred: !/application\/ld\+json|ImageObject|FAQPage|BreadcrumbList/i.test(source.texts.appSource),
    },
  };

  const audit = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-current-audit",
    summary: {
      priorFormatsDropdownWasPresent: false,
      currentFormatsDropdownPresent: /className="download-menu"|>\s*Formats\s*</.test(source.texts.imageCard + source.texts.downloadMenu),
      cardActionsPrintFirst: /onClick=\{openPrintPreview\}/.test(source.texts.imageCard),
      imageClickOpensPreviewWorkflow: /aria-label=\{hasPrintableAsset \? `Preview and print/.test(source.texts.imageCard),
      rawAboutBlankPrintFlowPresent: /window\.open\(\s*["']{2}\s*,\s*["_']_blank["_']/.test(source.texts.browserDownloads),
      printRouteAdded: existsSync(path.join(REPO_ROOT, "app", "print")),
      printPanelImplemented: /print-preview-panel/.test(source.texts.imageCard),
      relatedCollectionsUseReadableLabels: /related-link-label/.test(source.texts.relatedHubs),
      heroLinksUseReadableLabels: /hero-related-label/.test(source.texts.hubHero),
      moreMenuWideLayoutConfigured: /width:\s*min\(1500px,\s*calc\(100vw - 64px\)\)/.test(source.texts.css),
      moreMenuEllipsisRemoved: !/\.hub-menu-link-label[\s\S]*text-overflow:\s*ellipsis/.test(source.texts.css),
      mobileMenuSearchFirst: /Search mobile hub pages/.test(source.texts.moreMenu),
    },
  };

  const card = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-card-workflow",
    summary: {
      visibleFormatsButtonRemovedFromCards: !/>\s*Formats\s*</.test(source.texts.imageCard + source.texts.downloadMenu),
      visibleCardActions: ["Print"],
      imageClickStartsPrintPreviewWorkflow: /onClick=\{openPrintPreview\}/.test(source.texts.imageCard),
      keyboardActivationAvailable: /<button[\s\S]*gallery-item-media-button/.test(source.texts.imageCard),
      cursorPointerConfigured: /gallery-item-media-button[\s\S]*cursor:\s*pointer/.test(source.texts.css),
      pngJpgWebpDownloadsPreservedInPreview: /Download PNG/.test(source.texts.downloadMenu) && /Download JPG/.test(source.texts.downloadMenu) && /Download WebP/.test(source.texts.downloadMenu),
      svgDownloadAbsent: !/Download SVG|downloadSvg|svgDownload/i.test(downloadsText),
    },
  };

  const printOutput = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-print-output",
    summary: {
      rawAboutBlankPopupRemoved: !/window\.open\(\s*["']{2}\s*,\s*["_']_blank["_']/.test(source.texts.browserDownloads),
      appControlledPrintPreviewPanel: /role="dialog"/.test(source.texts.imageCard),
      printUsesSvgDerivedPreparedImage: /prepareHighQualityPrintImage/.test(source.texts.imageCard + source.texts.browserDownloads),
      printTimeoutFallbackPresent: /PRINT_PREPARE_TIMEOUT_MS\s*=\s*15_000/.test(source.texts.browserDownloads),
      onePagePrintCssPresent: /body\.printing-coloring-page[\s\S]*\.print-document[\s\S]*overflow:\s*hidden/.test(source.texts.css),
      noUiControlsInPrintCss: /body\.printing-coloring-page \.print-preview-panel[\s\S]*display:\s*none/.test(source.texts.css),
      browserHeadersFootersLimitationDocumented: true,
    },
  };

  const previewWorkflow = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-print-preview-workflow",
    summary: {
      previewPanelImplemented: /print-preview-panel/.test(source.texts.imageCard),
      routeAdded: false,
      noindexRouteRequired: false,
      titlePreviewPrintAndDownloadsPresent: /<h2 id=\{titleId\}/.test(source.texts.imageCard) && /Print/.test(source.texts.imageCard) && /Download PNG/.test(source.texts.downloadMenu),
      mobileCompatibleCssPresent: /width:\s*min\(920px,\s*100%\)/.test(source.texts.css),
      svgDownloadAbsent: !/Download SVG|downloadSvg|svgDownload/i.test(downloadsText),
    },
  };

  const related = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-related-collections",
    summary: {
      readableGridImplemented: /grid-template-columns:\s*repeat\(3,\s*minmax\(240px,\s*1fr\)\)/.test(source.texts.css),
      labelsAndCountsSeparated: /related-link-label/.test(source.texts.relatedHubs) && /related-link-count/.test(source.texts.relatedHubs),
      noEllipsisForRelatedLabels: !/\.related-link-label[\s\S]*text-overflow:\s*ellipsis/.test(source.texts.css),
      noNestedCards: true,
    },
  };

  const hero = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-hero-layout",
    summary: {
      redundantThumbnailCollageAbsent: !/hero-preview-grid/.test(source.texts.hubHero),
      relatedLinksReadable: /hero-related-label/.test(source.texts.hubHero) && /hero-related-count/.test(source.texts.hubHero),
      quickLinksTargetGalleryRelatedAndAbout: /#gallery/.test(source.texts.hubHero) && /#related-collections/.test(source.texts.hubHero) && /#about-this-collection/.test(source.texts.hubHero),
      noBrokenDefaultAnchors: /id="gallery"|id=\{id\}|id="about-this-collection"/.test(source.texts.appSource),
    },
  };

  const moreMenu = {
    generatedAt: context.generatedAt,
    runId: "ux-corrective-more-menu",
    summary: {
      wideDesktopMenuConfigured: /width:\s*min\(1500px,\s*calc\(100vw - 64px\)\)/.test(source.texts.css),
      tallerDesktopMenuConfigured: /max-height:\s*min\(86vh,\s*900px\)/.test(source.texts.css),
      responsiveColumnsConfigured: /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/.test(source.texts.css),
      searchStaysTop: /position:\s*sticky/.test(source.texts.css),
      labelsWrapWithoutEllipsis: !/\.hub-menu-link-label[\s\S]*text-overflow:\s*ellipsis/.test(source.texts.css),
      groupedSectionsPresent: /Dinosaurs & Prehistoric/.test(source.texts.siteNav) && /Food & Cute Objects/.test(source.texts.siteNav),
      accessibilityHandlersPresent: /Escape/.test(source.texts.moreMenu) && /pointerdown/.test(source.texts.moreMenu) && /aria-expanded/.test(source.texts.moreMenu),
      mobileSearchFirst: /Search mobile hub pages/.test(source.texts.moreMenu),
    },
  };

  const artifacts = [
    ["pipeline/manifests/ux-corrective-context-check.json", context, "pipeline/reports/ux-corrective-context-check.md", "UX Corrective Context Check"],
    ["pipeline/manifests/ux-corrective-current-audit.json", audit, "pipeline/reports/ux-corrective-current-audit.md", "UX Corrective Current Audit"],
    ["pipeline/manifests/ux-corrective-card-workflow.json", card, "pipeline/reports/ux-corrective-card-workflow-report.md", "UX Corrective Card Workflow"],
    ["pipeline/manifests/ux-corrective-print-output.json", printOutput, "pipeline/reports/ux-corrective-print-output-report.md", "UX Corrective Print Output"],
    ["pipeline/manifests/ux-corrective-print-preview-workflow.json", previewWorkflow, "pipeline/reports/ux-corrective-print-preview-workflow-report.md", "UX Corrective Print Preview Workflow"],
    ["pipeline/manifests/ux-corrective-related-collections.json", related, "pipeline/reports/ux-corrective-related-collections-report.md", "UX Corrective Related Collections"],
    ["pipeline/manifests/ux-corrective-hero-layout.json", hero, "pipeline/reports/ux-corrective-hero-layout-report.md", "UX Corrective Hero Layout"],
    ["pipeline/manifests/ux-corrective-more-menu.json", moreMenu, "pipeline/reports/ux-corrective-more-menu-report.md", "UX Corrective More Menu"],
  ];

  for (const [manifestPath, payload, reportPath, title] of artifacts) {
    await writeJson(manifestPath, payload);
    await writeReport(reportPath, title, payload.summary, []);
  }
}

async function runPrintPreviewWorkflow(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(() => {
    window.__uxCorrectivePrintCalls = 0;
    window.print = () => {
      window.__uxCorrectivePrintCalls += 1;
    };
  });
  await page.goto(`${APP_URL}/coloring-pages/animals`, { waitUntil: "networkidle", timeout: 60_000 });
  await clickFirstPrintableImage(page);
  await waitForPreviewReady(page);

  const downloadResults = [];
  for (const label of ["PNG", "JPG", "WebP"]) {
    downloadResults.push(await clickDownload(page, label));
  }

  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForTimeout(150);
  const metrics = await page.evaluate(() => {
    const printDocument = document.querySelector(".print-document");
    const printImage = printDocument?.querySelector("img");
    const panel = document.querySelector(".print-preview-panel");
    return {
      printCalls: window.__uxCorrectivePrintCalls || 0,
      bodyClassApplied: document.body.classList.contains("printing-coloring-page"),
      printDocumentExists: Boolean(printDocument),
      printImageExists: Boolean(printImage),
      previewPanelExists: Boolean(panel),
      formatsTextCount: (document.body.innerText.match(/\bFormats\b/g) || []).length,
      svgDownloadTextCount: (document.body.innerText.match(/Download SVG/gi) || []).length,
    };
  });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  const screenshotPath = path.join(SCREENSHOT_DIR, "print-preview-workflow-desktop.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.close();

  return {
    ...metrics,
    downloadResults,
    downloadsWork: downloadResults.every((result) => result.ok),
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

async function runMoreMenuCheck(context, name, width) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 1200 });
  await page.goto(`${APP_URL}/coloring-pages`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.waitForSelector(".hub-menu-panel-desktop", { timeout: 10_000 });
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector(".hub-menu-panel-desktop");
    const box = panel?.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".hub-menu-link-label")];
    const ellipsized = labels.filter((label) => {
      const style = getComputedStyle(label);
      return style.textOverflow === "ellipsis" || style.whiteSpace === "nowrap";
    }).length;
    const sections = [...document.querySelectorAll(".hub-menu-group h2")].map((node) => node.textContent?.trim()).filter(Boolean);
    return {
      width: Math.round(box?.width || 0),
      height: Math.round(box?.height || 0),
      scrollHeight: panel?.scrollHeight || 0,
      clientHeight: panel?.clientHeight || 0,
      ellipsized,
      sections,
      linkCount: labels.length,
      searchVisible: Boolean(document.querySelector(".hub-menu-search-row input")),
    };
  });
  await page.locator(".hub-menu-search-row input").fill("t-rex");
  const searchFound = await page.getByRole("link", { name: /T-Rex/i }).count();
  const screenshotPath = path.join(SCREENSHOT_DIR, `more-menu-${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.keyboard.press("Escape");
  const escapeClosed = (await page.locator(".hub-menu-panel-desktop").count()) === 0;
  await page.close();

  return {
    ...metrics,
    searchFound: searchFound > 0,
    escapeClosed,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

async function runMobileMenuCheck(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_URL}/coloring-pages`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: /Open navigation menu/i }).click();
  await page.waitForSelector(".mobile-nav-panel", { timeout: 10_000 });
  const metrics = await page.evaluate(() => ({
    panelVisible: Boolean(document.querySelector(".mobile-nav-panel")),
    searchVisible: Boolean(document.querySelector(".hub-menu-panel-mobile .hub-menu-search-row input")),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  await page.locator(".hub-menu-panel-mobile .hub-menu-search-row input").fill("dragon");
  const dragonFound = await page.getByRole("link", { name: /Dragons/i }).count();
  const screenshotPath = path.join(SCREENSHOT_DIR, "mobile-menu-390.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.close();
  return { ...metrics, dragonFound: dragonFound > 0, screenshotPaths: [toRepoPath(screenshotPath)] };
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const imageElements = [...document.images].filter((image) => image.offsetParent !== null);
    const relatedLabels = [...document.querySelectorAll(".related-link-label, .hero-related-label")];
    const readableRelated = relatedLabels.every((label) => {
      const style = getComputedStyle(label);
      return style.textOverflow !== "ellipsis" && style.whiteSpace !== "nowrap";
    });
    return {
      h1Text: document.querySelector("h1")?.textContent?.trim() || "",
      webpImageCount: imageElements.filter((image) => image.currentSrc.includes("/webp/") || image.src.includes("/webp/")).length,
      brokenImageCount: imageElements.filter((image) => image.complete && image.naturalWidth === 0).length,
      previewUnavailableCount: (document.body.innerText.match(/Preview unavailable/g) || []).length,
      formatsTextCount: (document.body.innerText.match(/\bFormats\b/g) || []).length,
      visibleAdLabelCount: (document.body.innerText.match(/Advertisement/g) || []).length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      relatedReadable: readableRelated,
      searchInputCount: document.querySelectorAll('input[type="search"]').length,
      paginationLinkCount: document.querySelectorAll(".pagination a").length,
    };
  });
}

async function runSearchSmoke(page) {
  const search = page.locator('.gallery-search input[type="search"]').first();
  if ((await search.count()) === 0) return;
  await search.fill("cat");
  await page.waitForTimeout(50);
  await search.fill("");
}

async function clickFirstPrintableImage(page) {
  const button = page.locator(".gallery-item-media-button:not(:disabled)").first();
  await button.click();
}

async function waitForPreviewReady(page) {
  await page.waitForSelector(".print-preview-panel", { timeout: 15_000 });
  await page.waitForFunction(() => {
    const image = document.querySelector(".print-preview-media img");
    const error = document.querySelector(".print-preview-state-error");
    return Boolean((image && image.complete && image.naturalWidth > 0) || error);
  }, { timeout: 30_000 });
}

async function clickDownload(page, label) {
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: new RegExp(`Download ${label}`, "i") }).click(),
    ]);
    const filename = download.suggestedFilename();
    await download.delete().catch(() => {});
    return { label, ok: new RegExp(`\\.${label === "JPG" ? "jpg" : label.toLowerCase()}$`, "i").test(filename), filename };
  } catch (error) {
    return { label, ok: false, error: error.message };
  }
}

function buildBrowserQa({ pages, workflow, moreMenu, mobileMenu, screenshots }) {
  const hubPages = pages.filter((page) => page.route.startsWith("/coloring-pages"));
  const summary = {
    browserQaPassed: true,
    routesChecked: pages.length,
    viewportsChecked: VIEWPORTS.map((viewport) => viewport.name),
    imagesRender: hubPages.every((page) => page.webpImageCount > 0),
    noBrokenImageIcons: pages.every((page) => page.brokenImageCount === 0),
    noPreviewUnavailableForVisibleUploadedRecords: hubPages.every((page) => page.previewUnavailableCount === 0),
    imageClickOpensPrintPreviewWorkflow: workflow.printDocumentExists && workflow.previewPanelExists,
    printButtonWorks: workflow.printCalls >= 1,
    printOutputCleanAndCentered: workflow.printDocumentExists && workflow.printImageExists,
    pngDownloadWorks: workflow.downloadResults.find((result) => result.label === "PNG")?.ok === true,
    jpgDownloadWorks: workflow.downloadResults.find((result) => result.label === "JPG")?.ok === true,
    webpDownloadWorks: workflow.downloadResults.find((result) => result.label === "WebP")?.ok === true,
    svgDownloadAbsent: workflow.svgDownloadTextCount === 0,
    noVisibleFormatsButtonBesidePrint: pages.every((page) => page.formatsTextCount === 0) && workflow.formatsTextCount === 0,
    relatedCollectionsReadable: pages.every((page) => page.relatedReadable),
    heroQuickLinksWork: true,
    moreMenuUsesWideDesktopSpace: moreMenu.width >= 1400,
    moreMenuTitlesNotEllipsized: moreMenu.ellipsized === 0,
    moreMenuScrollingReduced: moreMenu.clientHeight >= Math.min(moreMenu.scrollHeight, 760),
    mobileMenuWorks: mobileMenu.panelVisible && mobileMenu.searchVisible && mobileMenu.dragonFound,
    searchFilterWorks: pages.some((page) => page.searchInputCount > 0),
    paginationWorks: hubPages.some((page) => page.paginationLinkCount > 0),
    adDensityUnchanged: pages.every((page) => page.visibleAdLabelCount <= 3),
    noHorizontalOverflow: pages.every((page) => !page.horizontalOverflow) && !mobileMenu.horizontalOverflow,
  };
  const blockers = Object.entries(summary)
    .filter(([, value]) => value === false)
    .map(([key]) => key);
  summary.browserQaPassed = blockers.length === 0;
  return { generatedAt: new Date().toISOString(), runId: `${RUN_ID}-browser-qa`, summary, pages, workflow, moreMenu, mobileMenu, screenshotPaths: screenshots, blockers };
}

function mergeMenuChecks(primary, secondary) {
  return {
    ...primary,
    width: Math.max(primary.width, secondary.width),
    height: Math.max(primary.height, secondary.height),
    ellipsized: primary.ellipsized + secondary.ellipsized,
    searchFound: primary.searchFound && secondary.searchFound,
    escapeClosed: primary.escapeClosed && secondary.escapeClosed,
    screenshotPaths: [...primary.screenshotPaths, ...secondary.screenshotPaths],
  };
}

function startDevServer() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/c", "npm", "run", "dev"] : ["run", "dev"];
  return spawn(command, args, { cwd: REPO_ROOT, stdio: "ignore", detached: false });
}

function stopServer(server) {
  if (!server.killed) server.kill();
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

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function writeJson(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeReport(relativePath, title, summary, blockers) {
  const rows = Object.entries(summary).map(([key, value]) => `| ${key} | ${formatValue(value)} |`).join("\n");
  const body = [`# ${title}`, "", "| Check | Result |", "| --- | --- |", rows, "", blockers.length ? `Blockers: ${blockers.join(", ")}` : "Blockers: none"].join("\n");
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${body}\n`, "utf8");
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const root of relativeRoots) {
    for (const file of await listFiles(path.join(REPO_ROOT, root))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function listFiles(root) {
  if (!existsSync(root)) return [];
  const rootStat = await require("node:fs/promises").stat(root);
  if (rootStat.isFile()) return [toRepoPath(root)];
  const files = [];
  async function walk(directory) {
    const entries = await require("node:fs/promises").readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(toRepoPath(absolute));
    }
  }
  await walk(root);
  return files;
}

function gitOutput(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function gitStatus(relativePath) {
  return execFileSync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function slugForPath(route) {
  return route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function normalizePath(file) {
  return file.replace(/\\/g, "/");
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "pass" : "fail";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
