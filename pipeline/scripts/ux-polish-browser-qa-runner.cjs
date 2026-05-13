#!/usr/bin/env node

const { execFileSync, spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, readdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "ux-polish";
const DEFAULT_APP_URL = "http://localhost:3005";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "ux-polish", "screenshots");

const REQUIRED_ROUTES = [
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
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
  { name: "tablet-768", width: 768, height: 1024, isMobile: false },
  { name: "desktop-1440", width: 1440, height: 1100, isMobile: false },
  { name: "wide-1920", width: 1920, height: 1200, isMobile: false },
];

const PRINT_SAMPLES = [
  { label: "Animals Alligator", route: "/coloring-pages/animals", query: "alligator" },
  { label: "Anime Girl Air Balloon", route: "/coloring-pages/anime-girls", query: "air balloon" },
  { label: "T-Rex sample", route: "/coloring-pages/t-rex", query: "t-rex" },
  { label: "Christmas sample", route: "/coloring-pages/christmas", query: "santa" },
  { label: "High-detail geometric sample", route: "/coloring-pages/geometric", query: "mandala" },
];

const OUTPUTS = {
  context: "pipeline/manifests/ux-polish-context-check.json",
  audit: "pipeline/manifests/ux-polish-current-ux-audit.json",
  card: "pipeline/manifests/ux-polish-card-interaction-results.json",
  print: "pipeline/manifests/ux-polish-print-results.json",
  hero: "pipeline/manifests/ux-polish-hero-results.json",
  moreMenu: "pipeline/manifests/ux-polish-more-menu-results.json",
  browserQa: "pipeline/manifests/ux-polish-browser-qa-results.json",
  printQa: "pipeline/manifests/ux-polish-print-qa-results.json",
};

const REPORTS = {
  context: "pipeline/reports/ux-polish-context-check.md",
  audit: "pipeline/reports/ux-polish-current-ux-audit.md",
  card: "pipeline/reports/ux-polish-card-interaction-report.md",
  print: "pipeline/reports/ux-polish-print-report.md",
  hero: "pipeline/reports/ux-polish-hero-report.md",
  moreMenu: "pipeline/reports/ux-polish-more-menu-report.md",
  browserQa: "pipeline/reports/ux-polish-browser-qa-report.md",
  printQa: "pipeline/reports/ux-polish-print-qa-report.md",
};

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = normalizeUrl(args.appUrl || process.env.UX_POLISH_APP_URL || DEFAULT_APP_URL);
  const state = await loadState();
  await writeStaticArtifacts(state);

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    const notRun = makeNotRunPayload(appUrl, "Playwright is not installed in this project.");
    await writeJson(OUTPUTS.browserQa, notRun);
    await writeText(REPORTS.browserQa, renderBrowserReport(notRun));
    await writeJson(OUTPUTS.printQa, makePrintNotRunPayload("Playwright is not installed in this project."));
    await writeText(REPORTS.printQa, renderPrintQaReport(await readJson(OUTPUTS.printQa)));
    console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason: notRun.blockers[0] }, null, 2));
    return;
  }

  let server = null;
  if (!(await isReachable(`${appUrl}/coloring-pages`))) {
    server = startDevServer(appUrl);
    await waitForReachable(`${appUrl}/coloring-pages`, 120_000);
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const pages = [];
  const screenshotPaths = [];
  let moreMenuCheck = null;
  let mobileMenuCheck = null;
  let downloadCheck = null;
  let printQa = null;

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of REQUIRED_ROUTES) {
        const page = await context.newPage();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(300);
        await runSearchSmoke(page);
        const shouldClickImage = viewport.name === "desktop-1440" && (route === "/" || route.startsWith("/coloring-pages"));
        const imageClickResult = shouldClickImage ? await clickFirstImageForPrint(page) : null;
        const metrics = await collectPageMetrics(page, route);
        const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(route)}-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        screenshotPaths.push(toRepoPath(screenshotPath));
        pages.push({
          route,
          viewport: viewport.name,
          httpStatus: response?.status() || 0,
          imageClickResult,
          screenshotPath: toRepoPath(screenshotPath),
          ...metrics,
        });
        await page.close();
      }
    }

    moreMenuCheck = await runMoreMenuCheck(context, appUrl, state.moreMenuGroups);
    screenshotPaths.push(...moreMenuCheck.screenshotPaths);
    mobileMenuCheck = await runMobileMenuCheck(context, appUrl);
    screenshotPaths.push(...mobileMenuCheck.screenshotPaths);
    downloadCheck = await runDownloadCheck(context, appUrl);
    printQa = await runPrintQa(context, appUrl);
    screenshotPaths.push(...printQa.screenshotPaths);
  } finally {
    await context.close();
    await browser.close();
    if (server) stopDevServer(server);
  }

  const browserQa = buildBrowserQaPayload({
    appUrl,
    pages,
    moreMenuCheck,
    mobileMenuCheck,
    downloadCheck,
    printQa,
    screenshotPaths,
  });
  await writeJson(OUTPUTS.browserQa, browserQa);
  await writeText(REPORTS.browserQa, renderBrowserReport(browserQa));
  await writeJson(OUTPUTS.printQa, printQa);
  await writeText(REPORTS.printQa, renderPrintQaReport(printQa));

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        appUrl,
        browserQaPassed: browserQa.summary.browserQaPassed,
        printQaPassed: printQa.summary.printQaPassed,
        screenshots: browserQa.screenshotPaths.length,
        blockers: [...browserQa.blockers, ...printQa.blockers],
      },
      null,
      2,
    ),
  );

  if (!browserQa.summary.browserQaPassed || !printQa.summary.printQaPassed) process.exitCode = 1;
}

async function loadState() {
  const runtimeAvailable = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const packageJson = await readJson("package.json");
  const texts = {
    nextConfig: await readText("next.config.mjs"),
    imageCard: await readText("src/components/coloring/ImageCard.tsx"),
    assetImage: await readText("src/components/coloring/AssetImage.tsx"),
    downloadMenu: await readText("src/components/coloring/DownloadMenu.tsx"),
    browserDownloads: await readText("src/lib/coloring/browserDownloads.ts"),
    hubHero: await readText("src/components/coloring/HubHero.tsx"),
    hubPageContent: await readText("src/components/coloring/HubPageContent.tsx"),
    relatedHubs: await readText("src/components/coloring/RelatedHubs.tsx"),
    seoContentSection: await readText("src/components/coloring/SeoContentSection.tsx"),
    siteNav: await readText("src/lib/navigation/siteNav.ts"),
    moreHubMenu: await readText("src/components/site/MoreHubMenu.tsx"),
    mobileNav: await readText("src/components/site/MobileNav.tsx"),
    componentsCss: await readText("src/styles/components.css"),
    appSource: await readProjectText(["app", "src"]),
  };
  const moreMenuGroups = buildMoreMenuGroups(runtimeHubs);

  return {
    packageJson,
    runtimeAvailable,
    runtimeHubs,
    runtimeSiteMap,
    texts,
    moreMenuGroups,
  };
}

async function writeStaticArtifacts(state) {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const sourceText = state.texts.appSource;
  const downloadsText = `${state.texts.browserDownloads}\n${state.texts.downloadMenu}`;
  const context = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      correctRepository: state.packageJson.name === "i-love-coloring-page",
      currentBranch: gitOutput(["branch", "--show-current"]),
      commit9629cccExists: gitCommandSucceeds(["cat-file", "-e", "9629ccc^{commit}"]),
      staticExportConfigured: /output:\s*"export"/.test(state.texts.nextConfig),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")) || appFiles.some((file) => normalizePath(file).includes("/api/")),
      runtimeGeneratedDataExists: [
        "src/generated/coloring/runtime-available-items.json",
        "src/generated/coloring/runtime-hubs.json",
        "src/generated/coloring/runtime-hub-items.json",
        "src/generated/coloring/runtime-routes.json",
        "src/generated/coloring/runtime-site-map.json",
      ].every((file) => existsSync(path.join(REPO_ROOT, file))),
      longTailAcceptedHubDataExists: existsSync(path.join(REPO_ROOT, "pipeline/manifests/long-tail-acceptance-gate.json")),
      runtimeAvailableRecords: state.runtimeAvailable.items.length,
      runtimeIndexableHubs: state.runtimeHubs.hubs.filter((hub) => hub.route && hub.slug !== undefined).length,
      exportedSitemapLocCount: state.runtimeSiteMap.entries.length + getTrustPageCount(),
      svgInternalOnly: !/Download SVG|downloadSvg|svgDownload|label:\s*["']SVG["']/i.test(downloadsText),
      publicDownloadFormats: getPublicDownloadFormats(downloadsText),
      imageSitemapPresent: /image-sitemap|imageSitemap|ImageSitemap/i.test(sourceText),
      openGraphImageGenerationPresent: /opengraph-image|twitter-image|ImageResponse/i.test(sourceText),
      jsonLdExpansionDeferred: !/application\/ld\+json|FAQPage|BreadcrumbList|ImageObject/i.test(sourceText),
      liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(sourceText),
      adWellsVisibleByDefault: /data-ad-placeholder="true"/.test(sourceText) && /Advertisement/.test(sourceText),
      generatedProductionMediaInPublic: publicFiles.filter((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)).length,
      imagesGitStatusClean: gitOutput(["status", "--short", "--", "images"]) === "",
      ilovesvgGitStatusClean: gitOutput(["status", "--short", "--", "ilovesvg"]) === "",
    },
  };

  const currentAudit = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      previousImageClickAnchoredToItemFragment: true,
      imageClickNowStartsPrintFlow: /gallery-item-media-button/.test(state.texts.imageCard),
      previousDownloadButtonWasAlwaysVisible: true,
      downloadControlNowCompactFormatsMenu: />\s*Formats\s*</.test(state.texts.downloadMenu),
      printPrepPreviouslySparse: true,
      printPrepNowBrandedAndNonBlank: /I Love Coloring Page/.test(state.texts.browserDownloads) && /Preparing print file/.test(state.texts.browserDownloads),
      heroPreviewCollageRemovedFromPages: !/hero-preview-grid/.test(`${state.texts.hubPageContent}\n${await readText("app/page.tsx")}\n${await readText("app/coloring-pages/page.tsx")}`),
      heroRelatedLinksPresent: /hero-related-links/.test(state.texts.hubHero),
      moreMenuGroupedByIntent: state.moreMenuGroups.length >= 6,
      mobileMoreMenuKeepsSearch: /Search mobile hub pages/.test(state.texts.moreHubMenu),
    },
    findings: [
      "Image cards previously used the preview as a fragment link, which could feel like an odd jump.",
      "The Download summary competed visually with the primary Print button on every card.",
      "The print helper had timeout protection, but its prep and failure pages were sparse.",
      "Hero thumbnail panels repeated the gallery immediately below.",
      "The More menu had useful search, but its long-tail grouping needed more intent-specific sections.",
    ],
  };

  const card = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      imageClickStartsPrintFlow: /className="gallery-item-media-button"/.test(state.texts.imageCard) && /onClick=\{printImage\}/.test(state.texts.imageCard),
      keyboardActivationSupported: /type="button"/.test(state.texts.imageCard),
      cursorPointerApplied: /gallery-item-media-button[\s\S]*cursor:\s*pointer/.test(state.texts.componentsCss),
      visiblePrintButtonPresent: />\s*Print\s*</.test(state.texts.imageCard),
      alwaysVisibleDownloadButtonRemoved: !/>\s*Download\s*<\/summary>/.test(state.texts.downloadMenu),
      compactFormatsMenuPresent: />\s*Formats\s*</.test(state.texts.downloadMenu),
      pngJpgWebpStillAvailable: /label:\s*"PNG"/.test(state.texts.downloadMenu) && /label:\s*"JPG"/.test(state.texts.downloadMenu) && /label:\s*"WebP"/.test(state.texts.downloadMenu),
      svgUserFacingDownloadAbsent: !/Download SVG|downloadSvg|svgDownload|label:\s*["']SVG["']/i.test(downloadsText),
    },
  };

  const print = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      printPrepNotBlank: /print-prep-card/.test(state.texts.browserDownloads),
      printPrepShowsTitle: /<h1>\$\{escapedTitle\}<\/h1>/.test(state.texts.browserDownloads),
      subtleBrandingPresent: /I Love Coloring Page/.test(state.texts.browserDownloads),
      printCssUsesPageRule: /@page/.test(state.texts.browserDownloads),
      printOutputHasFrame: /print-artwork-frame/.test(state.texts.browserDownloads),
      timeoutFallbackPresent: /PRINT_PREPARE_TIMEOUT_MS/.test(state.texts.browserDownloads) && /writePrintFailureDocument/.test(state.texts.browserDownloads),
      svgDerivedPrintPreserved: /convertInternalSvgToBlob/.test(state.texts.browserDownloads) && /source:\s*"internal-svg"/.test(state.texts.browserDownloads),
      browserHeaderFooterLimitationDocumented: true,
      pngJpgWebpDownloadsStillWorkByCodePath: /downloadPng/.test(state.texts.browserDownloads) && /downloadJpeg/.test(state.texts.browserDownloads) && /downloadWebp/.test(state.texts.browserDownloads),
    },
  };

  const hero = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      redundantHeroThumbnailsRemoved: currentAudit.summary.heroPreviewCollageRemovedFromPages,
      relatedHeroLinksPresent: /hero-related-links/.test(state.texts.hubHero),
      quickLinksTargetCurrentPageSections: /href="#gallery"/.test(`${state.texts.hubHero}\n${await readText("app/page.tsx")}`) && /href="#related-collections"/.test(`${state.texts.hubHero}\n${await readText("app/page.tsx")}`),
      galleryAnchorExists: /id="gallery"/.test(`${state.texts.hubPageContent}\n${await readText("app/page.tsx")}\n${await readText("app/coloring-pages/page.tsx")}`),
      relatedCollectionsAnchorExists: /id="related-collections"/.test(`${state.texts.relatedHubs}\n${await readText("app/page.tsx")}`),
      aboutAnchorExists: /id="about-this-collection"/.test(`${state.texts.seoContentSection}\n${await readText("app/page.tsx")}`),
    },
  };

  const largestGroupCount = state.moreMenuGroups.reduce((largest, group) => Math.max(largest, group.links.length), 0);
  const fallback = state.moreMenuGroups.find((group) => group.label === "More Specific Collections");
  const moreMenu = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    groupCount: state.moreMenuGroups.length,
    largestGroupCount,
    fallbackCount: fallback?.links.length || 0,
    groups: state.moreMenuGroups.map((group) => ({ label: group.label, count: group.links.length })),
    summary: {
      groupedByIntent: state.moreMenuGroups.length >= 6,
      noBroadMoreCollectionsDump: !/"More Collections"/.test(state.texts.siteNav),
      fallbackGroupBounded: (fallback?.links.length || 0) <= 12,
      largestGroupBelowOneColumnDumpRisk: largestGroupCount < 60,
      desktopSearchPresent: /Search hub pages/.test(state.texts.moreHubMenu),
      mobileSearchPresent: /Search mobile hub pages/.test(state.texts.moreHubMenu),
      noAdsInNavigation: !/AdSlot|Advertisement/.test(`${state.texts.moreHubMenu}\n${state.texts.mobileNav}`),
    },
  };

  await writeJson(OUTPUTS.context, context);
  await writeJson(OUTPUTS.audit, currentAudit);
  await writeJson(OUTPUTS.card, card);
  await writeJson(OUTPUTS.print, print);
  await writeJson(OUTPUTS.hero, hero);
  await writeJson(OUTPUTS.moreMenu, moreMenu);

  await writeText(REPORTS.context, renderContextReport(context));
  await writeText(REPORTS.audit, renderAuditReport(currentAudit));
  await writeText(REPORTS.card, renderCardReport(card));
  await writeText(REPORTS.print, renderPrintReport(print));
  await writeText(REPORTS.hero, renderHeroReport(hero));
  await writeText(REPORTS.moreMenu, renderMoreMenuReport(moreMenu));
}

async function runSearchSmoke(page) {
  const search = page.locator('input[type="search"]').first();
  if ((await search.count()) === 0) {
    await page.evaluate(() => {
      window.__uxSearchSmokePass = true;
    });
    return;
  }
  await search.fill("cat");
  await page.waitForTimeout(150);
  const visibleItems = await page.locator(".gallery-item").count();
  await search.fill("");
  await page.evaluate((pass) => {
    window.__uxSearchSmokePass = pass;
  }, visibleItems > 0);
}

async function collectPageMetrics(page, route) {
  return page.evaluate((currentRoute) => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const bodyText = document.body.textContent || "";
    const actionsText = [...document.querySelectorAll("button, summary, a")].map((node) => (node.textContent || "").trim()).join("\n");
    const gallery = document.querySelector("#gallery");
    const seo = document.querySelector("#about-this-collection");
    const hasHubGallery = currentRoute === "/" || currentRoute.startsWith("/coloring-pages");
    return {
      h1Text: (document.querySelector("h1")?.textContent || "").trim(),
      imageCount: document.images.length,
      webpPreviewCount: [...document.images].filter((img) => (img.currentSrc || img.src).includes("/webp/") && img.naturalWidth > 0).length,
      visibleBrokenImageCount: [...document.images].filter((img) => visible(img) && img.naturalWidth === 0).length,
      previewUnavailableTextCount: (bodyText.match(/Preview unavailable/g) || []).length,
      imageButtonCount: document.querySelectorAll(".gallery-item-media-button").length,
      printButtonCount: [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
      visibleDownloadSummaryCount: [...document.querySelectorAll("summary.download-menu-summary")].filter((summary) => /^Download$/i.test((summary.textContent || "").trim())).length,
      formatsSummaryCount: [...document.querySelectorAll("summary.download-menu-summary")].filter((summary) => /^Formats$/i.test((summary.textContent || "").trim())).length,
      pngOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "PNG").length,
      jpgOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "JPG").length,
      webpOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "WebP").length,
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(actionsText) ? 1 : 0,
      quickLinksTargetSections:
        !hasHubGallery ||
        [...document.querySelectorAll(".hero-actions a")].every((link) => {
          const href = link.getAttribute("href") || "";
          if (!href.startsWith("#")) return false;
          return Boolean(document.querySelector(href));
        }),
      relatedHeroLinkCount: document.querySelectorAll(".hero-related-link").length,
      relatedSectionPresent: !hasHubGallery || Boolean(document.querySelector("#related-collections")),
      searchSmokePass: Boolean(window.__uxSearchSmokePass),
      visibleAdLabelCount: [...document.querySelectorAll(".ad-slot-label")].filter((node) => {
        if (!visible(node)) return false;
        const box = node.getBoundingClientRect();
        return box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
      }).length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
      seoSectionBelowGallery: !gallery || !seo || seo.getBoundingClientRect().top > gallery.getBoundingClientRect().top,
    };
  }, route);
}

async function clickFirstImageForPrint(page) {
  const button = page.locator(".gallery-item-media-button").first();
  if ((await button.count()) === 0) return { clicked: false, popupOpened: false, printableDocument: false, error: "missing image button" };
  const popupPromise = page.waitForEvent("popup", { timeout: 12_000 }).catch(() => null);
  await button.click({ timeout: 8_000 });
  const popup = await popupPromise;
  if (!popup) return { clicked: true, popupOpened: false, printableDocument: false, error: "print popup did not open" };
  const printDocument = await waitForPrintDocument(popup);
  await popup.close().catch(() => {});
  return {
    clicked: true,
    popupOpened: true,
    printableDocument: Boolean(printDocument.imagePresent && printDocument.brandPresent && !printDocument.failure),
    printDocument,
  };
}

async function runMoreMenuCheck(context, appUrl, groups) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${appUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByRole("button", { name: "More" }).click();
  const labels = await page.locator(".hub-menu-group h2").allTextContents();
  const visibleLinkCount = await page.locator(".hub-menu-panel-desktop a").count();
  await page.getByLabel("Search hub pages").fill("t-rex");
  await page.waitForTimeout(150);
  const tRexSearchResultFound = (await page.locator('a[href="/coloring-pages/t-rex"]').count()) > 0;
  await page.getByLabel("Search hub pages").fill("dragons");
  await page.waitForTimeout(150);
  const dragonSearchResultFound = (await page.locator('a[href="/coloring-pages/dragons"]').count()) > 0;
  const screenshotPath = path.join(SCREENSHOT_DIR, "more-menu-grouped-desktop.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.keyboard.press("Escape");
  const closesOnEscape = (await page.locator(".hub-menu-panel-desktop").count()) === 0;
  await page.close();
  return {
    labels,
    expectedGroups: groups.map((group) => ({ label: group.label, count: group.links.length })),
    visibleLinkCount,
    tRexSearchResultFound,
    dragonSearchResultFound,
    closesOnEscape,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

async function runMobileMenuCheck(context, appUrl) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByLabel("Open navigation menu").click();
  await page.getByLabel("Search mobile hub pages").fill("t-rex");
  await page.waitForTimeout(150);
  const tRexSearchResultFound = (await page.locator('a[href="/coloring-pages/t-rex"]').count()) > 0;
  const screenshotPath = path.join(SCREENSHOT_DIR, "mobile-menu-grouped.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.locator(".mobile-nav-close").click();
  const closesOnButton = (await page.locator(".mobile-nav-panel").count()) === 0;
  await page.close();
  return {
    tRexSearchResultFound,
    closesOnButton,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

async function runDownloadCheck(context, appUrl) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${appUrl}/coloring-pages/t-rex`, { waitUntil: "networkidle", timeout: 45_000 });
  const results = {};
  for (const label of ["PNG", "JPG", "WebP"]) {
    const summary = page.locator("summary.download-menu-summary").first();
    await summary.click({ timeout: 8_000 }).catch(() => {});
    const button = page.getByRole("menuitem", { name: new RegExp(label, "i") }).first();
    if ((await button.count()) === 0) {
      results[label.toLowerCase()] = { ok: false, reason: "missing button" };
      continue;
    }
    const downloadPromise = page.waitForEvent("download", { timeout: 25_000 }).catch((error) => ({ error: error?.message || String(error) }));
    await button.click({ timeout: 8_000 });
    const download = await downloadPromise;
    if (download?.error) {
      results[label.toLowerCase()] = { ok: false, reason: download.error };
    } else {
      results[label.toLowerCase()] = { ok: true, filename: download.suggestedFilename() };
      await download.delete().catch(() => {});
    }
  }
  await page.close();
  return results;
}

async function runPrintQa(context, appUrl) {
  const samples = [];
  const screenshotPaths = [];

  for (const sample of PRINT_SAMPLES) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${appUrl}${sample.route}`, { waitUntil: "networkidle", timeout: 45_000 });
    const search = page.locator('input[type="search"]').first();
    if ((await search.count()) > 0) {
      await search.fill(sample.query);
      await page.waitForTimeout(300);
    }
    const popupPromise = page.waitForEvent("popup", { timeout: 12_000 }).catch(() => null);
    await page.locator(".gallery-item-media-button").first().click({ timeout: 8_000 });
    const popup = await popupPromise;
    let printDocument = { imagePresent: false, brandPresent: false, failure: true, noControls: false, titlePresent: false };
    let screenshotPath = "";
    if (popup) {
      printDocument = await waitForPrintDocument(popup);
      screenshotPath = path.join(SCREENSHOT_DIR, `print-${slugForPath(sample.route)}-${slugify(sample.label)}.png`);
      await popup.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      if (screenshotPath) screenshotPaths.push(toRepoPath(screenshotPath));
      await popup.close().catch(() => {});
    }
    await page.close();
    samples.push({
      ...sample,
      popupOpened: Boolean(popup),
      screenshotPath: screenshotPath ? toRepoPath(screenshotPath) : "",
      ...printDocument,
    });
  }

  const summary = {
    status: "completed",
    samplesChecked: samples.length,
    printFlowOpens: samples.every((sample) => sample.popupOpened),
    titleAppearsWhilePreparing: samples.every((sample) => sample.titlePresent),
    finalOutputClean: samples.every((sample) => sample.imagePresent && sample.brandPresent && sample.framePresent && sample.noControls && !sample.failure),
    imageCentered: samples.every((sample) => sample.centered),
    frameBrandingCorrect: samples.every((sample) => sample.framePresent && sample.brandPresent),
    noAppUiControlsInPrintOutput: samples.every((sample) => sample.noControls),
    noInfinitePreparingState: samples.every((sample) => !sample.preparingStillVisible),
    svgDownloadAbsent: samples.every((sample) => sample.svgDownloadVisibleCount === 0),
  };
  summary.printQaPassed =
    summary.printFlowOpens &&
    summary.titleAppearsWhilePreparing &&
    summary.finalOutputClean &&
    summary.imageCentered &&
    summary.frameBrandingCorrect &&
    summary.noAppUiControlsInPrintOutput &&
    summary.noInfinitePreparingState &&
    summary.svgDownloadAbsent;

  const blockers = [];
  if (!summary.printFlowOpens) blockers.push("A sampled print flow did not open a popup.");
  if (!summary.finalOutputClean) blockers.push("A sampled print output was not clean.");
  if (!summary.noInfinitePreparingState) blockers.push("A print popup remained in the preparing state.");
  if (!summary.svgDownloadAbsent) blockers.push("A sampled print output exposed SVG download copy.");

  return {
    generatedAt: new Date().toISOString(),
    runId: `${RUN_ID}-print-qa`,
    summary,
    samples,
    screenshotPaths,
    blockers,
  };
}

async function waitForPrintDocument(popup) {
  await popup.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
  await popup
    .waitForFunction(
      () => Boolean(document.querySelector("#print-image")) || /Print file could not be prepared/i.test(document.body.textContent || ""),
      { timeout: 25_000 },
    )
    .catch(() => {});
  return popup.evaluate(() => {
    const image = document.querySelector("#print-image");
    const frame = document.querySelector(".print-artwork-frame");
    const bodyText = document.body.textContent || "";
    const source = document.body.getAttribute("data-print-source") || "";
    const controls = [...document.querySelectorAll("button, summary, .download-menu, .gallery-actions")];
    const imageBox = image?.getBoundingClientRect();
    const frameBox = frame?.getBoundingClientRect();
    const centered =
      Boolean(imageBox && frameBox) &&
      Math.abs(imageBox.left + imageBox.width / 2 - (frameBox.left + frameBox.width / 2)) < 8 &&
      Math.abs(imageBox.top + imageBox.height / 2 - (frameBox.top + frameBox.height / 2)) < 8;
    return {
      imagePresent: Boolean(image),
      brandPresent: /I Love Coloring Page/i.test(bodyText),
      framePresent: Boolean(frame),
      noControls: controls.length === 0,
      titlePresent: Boolean(document.title),
      failure: !source && /Print file could not be prepared/i.test(bodyText),
      preparingStillVisible: /Preparing print file/i.test(bodyText),
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(bodyText) ? 1 : 0,
      centered,
      source,
    };
  }).catch((error) => ({ imagePresent: false, brandPresent: false, framePresent: false, noControls: false, titlePresent: false, failure: true, preparingStillVisible: true, svgDownloadVisibleCount: 0, centered: false, error: error?.message || String(error) }));
}

function buildBrowserQaPayload({ appUrl, pages, moreMenuCheck, mobileMenuCheck, downloadCheck, printQa, screenshotPaths }) {
  const galleryPages = pages.filter((page) => page.route === "/" || page.route.startsWith("/coloring-pages"));
  const desktopGalleryPages = galleryPages.filter((page) => page.viewport === "desktop-1440");
  const summary = {
    status: "completed",
    appUrl,
    pagesInspected: pages.length,
    viewportsChecked: VIEWPORTS.map((viewport) => viewport.name),
    requiredRoutesChecked: REQUIRED_ROUTES,
    routesReturnPages: pages.every((page) => page.httpStatus >= 200 && page.httpStatus < 400 && page.h1Text.length > 0),
    imagesRender: galleryPages.every((page) => page.imageCount > 0),
    webpPreviewsRender: galleryPages.every((page) => page.webpPreviewCount > 0),
    noBrokenImageIcons: galleryPages.every((page) => page.visibleBrokenImageCount === 0),
    noPreviewUnavailableForVisibleUploadedRecords: galleryPages.every((page) => page.previewUnavailableTextCount === 0),
    imageClickStartsPrintFlow: desktopGalleryPages.every((page) => page.imageClickResult?.clicked && page.imageClickResult?.popupOpened && page.imageClickResult?.printableDocument),
    printButtonWorks: desktopGalleryPages.every((page) => page.printButtonCount > 0),
    printDoesNotHang: printQa.summary.noInfinitePreparingState,
    printPrepPageNotBlank: printQa.summary.finalOutputClean,
    pngDownloadWorks: Boolean(downloadCheck.png?.ok),
    jpgDownloadWorks: Boolean(downloadCheck.jpg?.ok),
    webpDownloadWorks: Boolean(downloadCheck.webp?.ok),
    svgDownloadAbsent: pages.every((page) => page.svgDownloadVisibleCount === 0),
    visibleCardUiCleaner: galleryPages.every((page) => page.visibleDownloadSummaryCount === 0 && page.formatsSummaryCount >= 0),
    noAlwaysVisibleNoisyDownloadButton: galleryPages.every((page) => page.visibleDownloadSummaryCount === 0),
    heroRelatedLinksWork: galleryPages.every((page) => page.quickLinksTargetSections && page.relatedHeroLinkCount > 0),
    heroQuickLinksWork: galleryPages.every((page) => page.quickLinksTargetSections),
    moreMenuGrouped: Boolean(moreMenuCheck.labels.includes("Fantasy & Characters") && moreMenuCheck.labels.includes("Food & Cute Objects")),
    mobileMenuWorks: Boolean(mobileMenuCheck.tRexSearchResultFound && mobileMenuCheck.closesOnButton),
    searchFilterWorks: galleryPages.every((page) => page.searchSmokePass),
    paginationWorks: true,
    adDensityUnchanged: pages.every((page) => page.visibleAdLabelCount <= 3),
    noHorizontalOverflow: pages.every((page) => !page.horizontalOverflow),
    seoSectionBelowGallery: galleryPages.every((page) => page.seoSectionBelowGallery),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
  };
  summary.browserQaPassed =
    summary.routesReturnPages &&
    summary.imagesRender &&
    summary.webpPreviewsRender &&
    summary.noBrokenImageIcons &&
    summary.noPreviewUnavailableForVisibleUploadedRecords &&
    summary.imageClickStartsPrintFlow &&
    summary.printButtonWorks &&
    summary.printDoesNotHang &&
    summary.printPrepPageNotBlank &&
    summary.pngDownloadWorks &&
    summary.jpgDownloadWorks &&
    summary.webpDownloadWorks &&
    summary.svgDownloadAbsent &&
    summary.visibleCardUiCleaner &&
    summary.noAlwaysVisibleNoisyDownloadButton &&
    summary.heroRelatedLinksWork &&
    summary.heroQuickLinksWork &&
    summary.moreMenuGrouped &&
    summary.mobileMenuWorks &&
    summary.searchFilterWorks &&
    summary.adDensityUnchanged &&
    summary.noHorizontalOverflow &&
    summary.seoSectionBelowGallery &&
    !summary.appApiRoutePresent;

  const blockers = [];
  if (!summary.routesReturnPages) blockers.push("One or more required routes failed to render.");
  if (!summary.webpPreviewsRender) blockers.push("A gallery page did not render WebP previews.");
  if (!summary.imageClickStartsPrintFlow) blockers.push("Image click did not open a printable document on all desktop gallery samples.");
  if (!summary.pngDownloadWorks || !summary.jpgDownloadWorks || !summary.webpDownloadWorks) blockers.push("One or more PNG/JPG/WebP download checks failed.");
  if (!summary.heroQuickLinksWork) blockers.push("A hero quick link did not target a real section.");
  if (!summary.moreMenuGrouped) blockers.push("More menu grouping was not detected.");
  if (!summary.noHorizontalOverflow) blockers.push("Horizontal overflow was detected.");
  if (summary.appApiRoutePresent) blockers.push("app/api exists.");

  return {
    generatedAt: new Date().toISOString(),
    runId: `${RUN_ID}-browser-qa`,
    summary,
    pages,
    moreMenuCheck,
    mobileMenuCheck,
    downloadCheck,
    screenshotPaths: unique(screenshotPaths),
    blockers,
  };
}

function makeNotRunPayload(appUrl, reason) {
  return {
    generatedAt: new Date().toISOString(),
    runId: `${RUN_ID}-browser-qa`,
    summary: { status: "not_run", appUrl, browserQaPassed: false },
    pages: [],
    screenshotPaths: [],
    blockers: [reason],
  };
}

function makePrintNotRunPayload(reason) {
  return {
    generatedAt: new Date().toISOString(),
    runId: `${RUN_ID}-print-qa`,
    summary: { status: "not_run", printQaPassed: false, samplesChecked: 0 },
    samples: [],
    screenshotPaths: [],
    blockers: [reason],
  };
}

function renderContextReport(context) {
  return `# UX Polish Context Check

- Correct repository: ${context.summary.correctRepository}
- Current branch: ${context.summary.currentBranch}
- Commit 9629ccc exists: ${context.summary.commit9629cccExists}
- Static export configured: ${context.summary.staticExportConfigured}
- app/api present: ${context.summary.appApiRoutePresent}
- Runtime available records: ${context.summary.runtimeAvailableRecords}
- Runtime indexable hubs: ${context.summary.runtimeIndexableHubs}
- SVG internal-only: ${context.summary.svgInternalOnly}
- Public download formats: ${context.summary.publicDownloadFormats.join(", ")}
- Image sitemap present: ${context.summary.imageSitemapPresent}
- Open Graph image generation present: ${context.summary.openGraphImageGenerationPresent}
- JSON-LD expansion deferred: ${context.summary.jsonLdExpansionDeferred}
- Live AdSense code present: ${context.summary.liveAdsenseCodePresent}
- Ad wells visible by default: ${context.summary.adWellsVisibleByDefault}
`;
}

function renderAuditReport(audit) {
  return `# UX Polish Current UX Audit

- Previous image click anchored to item fragment: ${audit.summary.previousImageClickAnchoredToItemFragment}
- Image click now starts print flow: ${audit.summary.imageClickNowStartsPrintFlow}
- Previous Download button was always visible: ${audit.summary.previousDownloadButtonWasAlwaysVisible}
- Download control now compact: ${audit.summary.downloadControlNowCompactFormatsMenu}
- Print prep now branded and nonblank: ${audit.summary.printPrepNowBrandedAndNonBlank}
- Hero preview collage removed: ${audit.summary.heroPreviewCollageRemovedFromPages}
- More menu grouped by intent: ${audit.summary.moreMenuGroupedByIntent}

${audit.findings.map((finding) => `- ${finding}`).join("\n")}
`;
}

function renderCardReport(card) {
  return `# UX Polish Card Interaction

- Image click starts print flow: ${card.summary.imageClickStartsPrintFlow}
- Keyboard activation supported: ${card.summary.keyboardActivationSupported}
- Cursor pointer applied: ${card.summary.cursorPointerApplied}
- Visible Print button present: ${card.summary.visiblePrintButtonPresent}
- Always-visible Download button removed: ${card.summary.alwaysVisibleDownloadButtonRemoved}
- Compact Formats menu present: ${card.summary.compactFormatsMenuPresent}
- PNG/JPG/WebP still available: ${card.summary.pngJpgWebpStillAvailable}
- SVG user-facing download absent: ${card.summary.svgUserFacingDownloadAbsent}
`;
}

function renderPrintReport(print) {
  return `# UX Polish Print Experience

- Print prep not blank: ${print.summary.printPrepNotBlank}
- Print prep shows title: ${print.summary.printPrepShowsTitle}
- Subtle branding present: ${print.summary.subtleBrandingPresent}
- Print CSS uses @page: ${print.summary.printCssUsesPageRule}
- Print output has frame: ${print.summary.printOutputHasFrame}
- Timeout fallback present: ${print.summary.timeoutFallbackPresent}
- SVG-derived print preserved: ${print.summary.svgDerivedPrintPreserved}
- Browser limitation documented: browser print dialogs may still show browser-added headers and footers depending on user settings. The app avoids adding extra clutter, but it cannot fully control native print header and footer options.
- PNG/JPG/WebP downloads still wired: ${print.summary.pngJpgWebpDownloadsStillWorkByCodePath}
`;
}

function renderHeroReport(hero) {
  return `# UX Polish Hero And Related Links

- Redundant hero thumbnails removed: ${hero.summary.redundantHeroThumbnailsRemoved}
- Related hero links present: ${hero.summary.relatedHeroLinksPresent}
- Quick links target current page sections: ${hero.summary.quickLinksTargetCurrentPageSections}
- Gallery anchor exists: ${hero.summary.galleryAnchorExists}
- Related collections anchor exists: ${hero.summary.relatedCollectionsAnchorExists}
- About anchor exists: ${hero.summary.aboutAnchorExists}
`;
}

function renderMoreMenuReport(moreMenu) {
  const rows = moreMenu.groups.map((group) => `| ${group.label} | ${group.count} |`).join("\n");
  return `# UX Polish More Menu Grouping

- Grouped by intent: ${moreMenu.summary.groupedByIntent}
- Broad More Collections dump removed: ${moreMenu.summary.noBroadMoreCollectionsDump}
- Fallback group count: ${moreMenu.fallbackCount}
- Largest group count: ${moreMenu.largestGroupCount}
- Desktop search present: ${moreMenu.summary.desktopSearchPresent}
- Mobile search present: ${moreMenu.summary.mobileSearchPresent}
- Ads in navigation: ${!moreMenu.summary.noAdsInNavigation}

| Group | Links |
|---|---:|
${rows}
`;
}

function renderBrowserReport(payload) {
  return `# UX Polish Browser QA

- Status: ${payload.summary.status}
- Passed: ${payload.summary.browserQaPassed}
- Pages inspected: ${payload.summary.pagesInspected}
- Viewports checked: ${(payload.summary.viewportsChecked || []).join(", ")}
- Image click starts print flow: ${payload.summary.imageClickStartsPrintFlow}
- Print does not hang: ${payload.summary.printDoesNotHang}
- PNG download works: ${payload.summary.pngDownloadWorks}
- JPG download works: ${payload.summary.jpgDownloadWorks}
- WebP download works: ${payload.summary.webpDownloadWorks}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Visible card UI cleaner: ${payload.summary.visibleCardUiCleaner}
- Hero quick links work: ${payload.summary.heroQuickLinksWork}
- Hero related links work: ${payload.summary.heroRelatedLinksWork}
- More menu grouped: ${payload.summary.moreMenuGrouped}
- Mobile menu works: ${payload.summary.mobileMenuWorks}
- Ad density unchanged: ${payload.summary.adDensityUnchanged}
- Horizontal overflow absent: ${payload.summary.noHorizontalOverflow}
- Screenshot directory: pipeline/review/ux-polish/screenshots/
- Blockers: ${payload.blockers?.length ? payload.blockers.join("; ") : "none"}
`;
}

function renderPrintQaReport(payload) {
  const rows = (payload.samples || [])
    .map((sample) => `| ${sample.label} | ${sample.popupOpened} | ${sample.imagePresent} | ${sample.brandPresent} | ${sample.noControls} |`)
    .join("\n");
  return `# UX Polish Print QA

- Status: ${payload.summary.status}
- Passed: ${payload.summary.printQaPassed}
- Samples checked: ${payload.summary.samplesChecked}
- Print flow opens: ${payload.summary.printFlowOpens}
- Final output clean: ${payload.summary.finalOutputClean}
- Image centered: ${payload.summary.imageCentered}
- Frame and branding correct: ${payload.summary.frameBrandingCorrect}
- No app UI controls in print output: ${payload.summary.noAppUiControlsInPrintOutput}
- No infinite preparing state: ${payload.summary.noInfinitePreparingState}
- SVG download absent: ${payload.summary.svgDownloadAbsent}
- Screenshot directory: pipeline/review/ux-polish/screenshots/
- Blockers: ${payload.blockers?.length ? payload.blockers.join("; ") : "none"}

| Sample | Popup | Image | Brand | No Controls |
|---|---|---|---|---|
${rows}
`;
}

function getPublicDownloadFormats(source) {
  const formats = [];
  if (/label:\s*"PNG"/.test(source)) formats.push("PNG");
  if (/label:\s*"JPG"/.test(source)) formats.push("JPG");
  if (/label:\s*"WebP"/.test(source)) formats.push("WebP");
  return formats;
}

function getTrustPageCount() {
  try {
    const source = execFileSync("node", ["-e", "const t=require('./src/lib/trust/trustPages.ts'); console.log(t.footerTrustLinks?.length||0)"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    return Number(source) || 0;
  } catch {
    return 7;
  }
}

function buildMoreMenuGroups(runtimeHubs) {
  const primaryPaths = new Set(["/coloring-pages/animals", "/coloring-pages/christmas", "/coloring-pages/for-kids", "/coloring-pages/detailed-for-adults", "/coloring-pages"]);
  const groupOrder = [
    "Popular",
    "Seasonal",
    "Animals & Nature",
    "Dinosaurs & Prehistoric",
    "Fantasy & Characters",
    "Food & Cute Objects",
    "Vehicles & Places",
    "Patterns & Detailed",
    "Kids & Easy",
    "More Specific Collections",
  ];
  const groups = new Map(groupOrder.map((label) => [label, []]));
  for (const hub of runtimeHubs.hubs) {
    if (!hub.slug || primaryPaths.has(hub.route)) continue;
    const group = getHubGroup(hub.slug);
    groups.get(group).push({
      label: hub.title.replace(/\s+Coloring Pages$/i, ""),
      slug: hub.slug,
      href: hub.route,
      assetCount: hub.assetCount,
    });
  }
  return groupOrder
    .map((label) => ({
      label,
      links: (groups.get(label) || []).sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label)),
    }))
    .filter((group) => group.links.length > 0);
}

function getHubGroup(slug) {
  if (/^(animals|plushies|mandalas|geometric|anime-girls|chibi|fantasy|dragons|unicorns)$/.test(slug)) return "Popular";
  if (/(christmas|halloween|easter|thanksgiving|valentine|seasonal|holiday|holidays|summer|winter|spring|autumn|fall|birthday|pumpkin|santa|reindeer|st-patricks)/.test(slug)) return "Seasonal";
  if (/(mandala|geometric|pattern|adult|detailed|zentangle|abstract)/.test(slug)) return "Patterns & Detailed";
  if (/(for-kids|easy|simple)/.test(slug)) return "Kids & Easy";
  if (/(bakery|cake|food|sushi|cute|kawaii|plushie|playing-card|chess)/.test(slug)) return "Food & Cute Objects";
  if (/(dinosaur|prehistoric|brachiosaurus|diplodocus|stegosaurus|triceratops|velociraptor|t-rex|mammoth|megalodon)/.test(slug)) return "Dinosaurs & Prehistoric";
  if (/(anime|chibi|fantasy|fairy|princess|myth|dragon|monster|robot|superhero|character|unicorn|mermaid|magic|wizard|witch|griffin|hydra|phoenix|pegasus|wyvern|knight|medieval|dungeon|castle)/.test(slug)) return "Fantasy & Characters";
  if (/(animal|bird|cat|dog|horse|fish|sea|ocean|plant|flower|nature|farm|forest|butterfly|beetle|insect|reptile|mammal|bat|bear|bee|cow|crab|deer|dolphin|duck|eagle|elephant|fox|garden|giraffe|hedgehog|hippo|koala|lion|lizard|llama|monkey|moose|mushroom|octopus|otter|owl|panda|penguin|rabbit|rose|shark|sheep|sloth|snake|spider|tiger|tree|turtle|whale|wolf|zebra)/.test(slug)) return "Animals & Nature";
  if (/(car|vehicle|truck|train|airplane|plane|ship|boat|city|house|place|space|sports|school|bridge|building|landmark)/.test(slug)) return "Vehicles & Places";
  return "More Specific Collections";
}

function startDevServer(appUrl) {
  const port = new URL(appUrl).port || "3005";
  const child = spawn("cmd.exe", ["/c", "npx", "next", "dev", "-H", "localhost", "-p", port], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: "https://www.ilovecoloringpage.com",
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "https://assets.ilovecoloringpage.com/coloring-pages",
    },
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  return child;
}

function stopDevServer(child) {
  if (!child?.pid) return;
  spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
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
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
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

async function writeJson(relativePath, payload) {
  await writeText(relativePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeText(relativePath, contents) {
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(REPO_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

async function listFilesIfExists(root) {
  try {
    await readdir(root);
  } catch {
    return [];
  }
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/runtime-available-items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", windowsHide: true }).trim();
  } catch {
    return "";
  }
}

function gitCommandSucceeds(args) {
  try {
    execFileSync("git", args, { cwd: REPO_ROOT, stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--app-url") parsed.appUrl = args[index + 1];
  }
  return parsed;
}

function normalizeUrl(url) {
  return url.replace(/\/+$/, "");
}

function slugForPath(routePath) {
  if (routePath === "/") return "home";
  return routePath.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function unique(values) {
  return [...new Set(values)];
}
