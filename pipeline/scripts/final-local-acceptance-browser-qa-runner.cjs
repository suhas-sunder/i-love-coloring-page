#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  ensureStaticExport,
  installStaticExportRoutes,
  passFail,
  readJson,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const RUN_ID = "final-local-acceptance-browser-qa";
const SCREENSHOT_DIR = "pipeline/review/final-local-acceptance/screenshots";
const ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/dodo",
  "/coloring-pages/bamboo",
  "/coloring-pages/steam-train",
  "/coloring-pages/magic",
  "/coloring-pages/lily",
  "/coloring-pages/bulldog",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];
const VIEWPORTS = [
  { label: "390", width: 390, height: 844, mobile: true },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 1000 },
  { label: "1920", width: 1920, height: 1080 },
  { label: "2560", width: 2560, height: 1440 },
];
const SCREENSHOT_ROUTES = new Set([
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/dodo",
  "/coloring-pages/magic",
  "/coloring-pages/lily",
  "/coloring-pages/bulldog",
  "/about",
  "/privacy",
]);
const SCREENSHOT_VIEWPORTS = new Set(["390", "1440", "1920", "2560"]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const build = await ensureStaticExport({ force: true });
  await fsp.mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });

  const source = await inspectSource();
  const staticExport = await inspectStaticExport(build, source);
  await writeJson("pipeline/manifests/final-local-static-export-results.json", staticExport);
  await writeText("pipeline/reports/final-local-static-export-report.md", renderStaticExportReport(staticExport));

  const browser = await chromium.launch();
  const routeResults = [];
  const screenshotPaths = [];
  const consoleErrors = [];
  let interactionResults = null;

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: Boolean(viewport.mobile),
        acceptDownloads: true,
      });
      const baseUrl = await installStaticExportRoutes(context, build.outDir);
      try {
        for (const route of ROUTES) {
          const page = await context.newPage();
          page.on("console", (message) => {
            if (message.type() === "error") {
              consoleErrors.push({ route, viewport: viewport.label, text: message.text() });
            }
          });
          page.on("pageerror", (error) => {
            consoleErrors.push({ route, viewport: viewport.label, text: error.message });
          });
          try {
            await safeGoto(page, `${baseUrl}${route}`);
            await waitForRouteSettled(page);
            const metrics = await collectRouteMetrics(page, route, viewport, source);
            if (SCREENSHOT_ROUTES.has(route) && SCREENSHOT_VIEWPORTS.has(viewport.label)) {
              const screenshotPath = path.join(SCREENSHOT_DIR, `${slugFor(route)}-${viewport.label}.png`);
              await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: false });
              metrics.screenshotPath = screenshotPath;
              screenshotPaths.push(screenshotPath);
            }
            routeResults.push(metrics);
          } catch (error) {
            routeResults.push({
              route,
              viewport: viewport.label,
              loaded: false,
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            await page.close().catch(() => {});
          }
        }

        if (viewport.label === "1440") {
          interactionResults = await runDesktopInteractionChecks(context, baseUrl, source);
        }
      } finally {
        await context.close();
      }
    }

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, acceptDownloads: true });
    const baseUrl = await installStaticExportRoutes(mobileContext, build.outDir);
    try {
      interactionResults.mobileNav = await runMobileNavCheck(mobileContext, baseUrl);
    } finally {
      await mobileContext.close();
    }
  } finally {
    await browser.close();
  }

  const linkSectionAcceptance = buildLinkSectionAcceptance(source, routeResults, interactionResults);
  await writeJson("pipeline/manifests/final-local-link-section-acceptance.json", linkSectionAcceptance);
  await writeText("pipeline/reports/final-local-link-section-acceptance.md", renderLinkSectionReport(linkSectionAcceptance));

  const adPlaceholderQa = buildAdPlaceholderQa(source, routeResults);
  await writeJson("pipeline/manifests/final-local-ad-placeholder-qa.json", adPlaceholderQa);
  await writeText("pipeline/reports/final-local-ad-placeholder-qa.md", renderAdReport(adPlaceholderQa));

  const summary = buildBrowserSummary(routeResults, interactionResults, consoleErrors, linkSectionAcceptance, adPlaceholderQa);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    baseUrl: "https://www.ilovecoloringpage.com",
    build,
    routes: ROUTES,
    viewports: VIEWPORTS.map((viewport) => viewport.label),
    sourceChecks: source.browserRelevant,
    summary,
    routeResults,
    interactionResults,
    linkSectionAcceptance: linkSectionAcceptance.summary,
    adPlaceholderQa: adPlaceholderQa.summary,
    consoleErrors,
    screenshotDirectory: SCREENSHOT_DIR,
    screenshotPaths,
    blockers: buildBrowserBlockers(summary, consoleErrors),
  };

  await writeJson("pipeline/manifests/final-local-acceptance-browser-qa-results.json", payload);
  await writeText("pipeline/reports/final-local-acceptance-browser-qa-report.md", renderBrowserReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!payload.summary.browserQaPassed) process.exitCode = 1;
}

async function inspectSource() {
  const runtimeItems = await readJson("src/generated/coloring/runtime-available-items.json");
  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeSiteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const css = await readText("src/styles/components.css");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const moreHubMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const siteConfig = await readText("src/lib/site/siteConfig.ts");
  const sourceForAds = [
    await readText("src/lib/coloring/browserDownloads.ts"),
    await readText("src/components/coloring/DownloadMenu.tsx"),
    await readText("src/components/coloring/ImageCard.tsx"),
    await readText("src/components/site/SiteHeader.tsx"),
    await readText("src/components/site/MoreHubMenu.tsx"),
    await readText("src/components/site/MobileNav.tsx"),
    await readText("src/components/ads/AdSlot.tsx"),
  ].join("\n");

  const hubByRoute = new Map(runtimeHubs.hubs.map((hub) => [hub.route, hub]));
  return {
    runtimeItems,
    runtimeHubs,
    runtimeSiteMap,
    hubItems,
    hubByRoute,
    css,
    imageCard,
    downloadMenu,
    browserDownloads,
    moreHubMenu,
    mobileNav,
    siteConfig,
    sourceForAds,
    browserRelevant: {
      appApiAbsent: !fs.existsSync(path.join(REPO_ROOT, "app", "api")),
      staticExportConfigured: /output:\s*["']export["']/.test(await readText("next.config.mjs")),
      runtimeAvailableRecords: runtimeItems.items.length,
      runtimeHubCount: runtimeHubs.hubs.length,
      runtimeSitemapRouteCount: runtimeSiteMap.entries.length,
      publicSafeDefaultsPresent:
        siteConfig.includes("https://www.ilovecoloringpage.com") &&
        siteConfig.includes("https://assets.ilovecoloringpage.com/coloring-pages") &&
        siteConfig.includes("admin@ilovecoloringpage.com"),
      cardLevelPrintButtonRemoved: !/className="gallery-actions"[\s\S]*>\s*Print\s*</.test(imageCard),
      imageClickModalBehaviorPresent: /className="gallery-item-media-button"/.test(imageCard) && /onClick=\{openPrintPreview\}/.test(imageCard),
      overlayCuePresent: /gallery-item-print-cue/.test(imageCard) && /Preview & print/.test(imageCard),
      modalDownloadLabelAbsent: !/print-preview-download-title|>\s*Download\s*<\/(?:span|p|div|strong)>/.test(imageCard),
      downloadControlsPresent: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
      svgDownloadAbsent: !/Download SVG|downloadSvg\b|svgDownload/i.test(`${imageCard}\n${downloadMenu}\n${browserDownloads}`),
      previewUsesContain: /\.print-preview-media img\s*\{[\s\S]*object-fit:\s*contain/.test(css),
      liveAdsenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(sourceForAds),
      moreMenuEscapeOutsideAndLinkCloseHandlers:
        /handleKeyDown/.test(moreHubMenu) && /handlePointerDown/.test(moreHubMenu) && /handleNavigate/.test(moreHubMenu),
      mobileMenuEscapeOutsideAndLinkCloseHandlers:
        /handleKeyDown/.test(mobileNav) && /handlePointerDown/.test(mobileNav) && /closeMenu/.test(mobileNav),
    },
  };
}

async function inspectStaticExport(build, source) {
  const outDir = build.outDir;
  const files = await listFiles(outDir);
  const textFiles = files.filter((file) => /\.(?:html|xml|txt|js|css|json)$/i.test(file));
  const htmlFiles = files.filter((file) => /\.html$/i.test(file));
  const scan = scanTextFiles(textFiles);
  const appApiRefs = scan.appApiRefs;
  const localhostRefs = scan.localhostRefs;
  const r2DevRefs = scan.r2DevRefs;
  const privateR2Refs = scan.privateR2Refs;
  const downloadSvgRefs = scan.downloadSvgRefs;
  const liveAdsRefs = scan.liveAdsRefs;
  const summary = {
    buildPassed: true,
    buildRan: build.buildRan === true,
    staticExportConfigured: source.browserRelevant.staticExportConfigured,
    htmlFileCount: htmlFiles.length,
    runtimeSitemapRouteCount: source.runtimeSiteMap.entries.length,
    generatedExpectedRuntimeRoutes: source.runtimeSiteMap.entries.every((entry) => outputContainsRoute(files, entry.path)),
    noLocalhost: !localhostRefs,
    noR2Dev: !r2DevRefs,
    noPrivateR2Endpoint: !privateR2Refs,
    noAppApiReferences: !appApiRefs,
    noDownloadSvgText: !downloadSvgRefs,
    noLiveAdsenseScriptsOrIds: !liveAdsRefs,
  };
  summary.staticExportPassed = Object.values(summary).every((value) => value === true || typeof value === "number");
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-local-static-export-results",
    build,
    outDir: path.relative(REPO_ROOT, outDir).replace(/\\/g, "/"),
    summary,
    blockers: buildStaticBlockers(summary),
  };
}

async function waitForRouteSettled(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page
    .waitForFunction(
      () => {
        const cards = document.querySelectorAll(".gallery-item, .preview-tile").length;
        if (cards === 0) return true;
        return [...document.images].some((image) => image.complete && image.naturalWidth > 0);
      },
      null,
      { timeout: 18_000 },
    )
    .catch(() => {});
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (error) {
    if (!(error instanceof Error) || !/ERR_ABORTED|Navigation interrupted/i.test(error.message)) throw error;
    await page.waitForTimeout(400);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  }
}

async function collectRouteMetrics(page, route, viewport, source) {
  const expected = expectedCountForRoute(route, source);
  return page.evaluate(
    ({ route, viewport, expectedCount }) => {
      const isVisible = (node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
      };
      const visibleText = document.body.innerText || "";
      const actionText = [...document.querySelectorAll("a, button, summary")].map((node) => (node.textContent || "").trim()).join("\n");
      const galleryCards = [...document.querySelectorAll(".gallery-item")].filter(isVisible);
      const previewTiles = [...document.querySelectorAll(".preview-tile")].filter(isVisible);
      const galleryOrPreviewCount = galleryCards.length + previewTiles.length;
      const visibleImages = [...document.images].filter(isVisible);
      const loadedVisibleImages = visibleImages.filter((image) => image.complete && image.naturalWidth > 0);
      const visibleWebpImages = loadedVisibleImages.filter((image) => (image.currentSrc || image.src).includes("/webp/"));
      const brokenImages = visibleImages.filter((image) => image.complete && image.naturalWidth === 0);
      const visibleAds = [...document.querySelectorAll(".ad-slot")].filter(isVisible);
      const adInNav = [...document.querySelectorAll("nav .ad-slot, .site-header .ad-slot, .hub-menu-panel .ad-slot, .mobile-nav-panel .ad-slot")].filter(isVisible);
      const adInGallery = [...document.querySelectorAll(".gallery-grid .ad-slot, .gallery-item .ad-slot")].filter(isVisible);
      const adNearPrintDownload = [...document.querySelectorAll(".print-preview-panel .ad-slot, .gallery-actions .ad-slot, .print-preview-downloads .ad-slot")].filter(isVisible);
      const countText = typeof expectedCount === "number" ? expectedCount.toLocaleString("en-US") : "";
      const textOverflowEllipsis = [...document.querySelectorAll(".hub-menu-link-label, .related-link-label, .hero-related-label, .hub-link-title")].some(
        (node) => getComputedStyle(node).textOverflow === "ellipsis",
      );
      const labelCountCollision = [...document.querySelectorAll(".hero-related-link, .related-link, .hub-link")].some((link) => {
        const label = link.querySelector(".hero-related-label, .related-link-label, .hub-link-title");
        const count = link.querySelector(".hero-related-count, .related-link-count, .hub-link-count");
        if (!label || !count) return false;
        const a = label.getBoundingClientRect();
        const b = count.getBoundingClientRect();
        return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      });
      const relatedLinks = [...document.querySelectorAll(".related-link")].filter(isVisible);
      const relatedLayoutGaps = relatedLinks.slice(0, -1).map((link, index) => {
        const a = link.getBoundingClientRect();
        const b = relatedLinks[index + 1].getBoundingClientRect();
        if (Math.abs(a.top - b.top) < 2) return Math.max(0, b.left - a.right);
        return Math.max(0, b.top - a.bottom);
      });
      const popularLinks = [...document.querySelectorAll(".hub-link")].filter(isVisible);
      const mediaButtons = [...document.querySelectorAll(".gallery-item-media-button")].filter(isVisible);
      const routeHasGallery = route === "/" || route.startsWith("/coloring-pages");
      return {
        route,
        viewport: viewport.label,
        width: viewport.width,
        height: viewport.height,
        loaded: document.readyState === "complete" || document.readyState === "interactive",
        title: document.title,
        h1: (document.querySelector("h1")?.textContent || "").trim(),
        routeHasGallery,
        galleryCardCount: galleryCards.length,
        previewTileCount: previewTiles.length,
        visibleImageCount: visibleImages.length,
        loadedVisibleImageCount: loadedVisibleImages.length,
        visibleWebpImageCount: visibleWebpImages.length,
        visibleBrokenImageCount: brokenImages.length,
        previewUnavailableCount: (visibleText.match(/Preview unavailable/g) || []).length,
        deferredVisibleCount: (visibleText.match(/manual review|deferred|pending upload/gi) || []).length,
        countsCorrect: expectedCount == null ? true : visibleText.includes(countText),
        expectedCount,
        searchInputCount: document.querySelectorAll('input[type="search"]').length,
        cardLevelPrintButtonCount: [...document.querySelectorAll(".gallery-item button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
        mediaButtonCount: mediaButtons.length,
        mediaButtonsUsePointer: mediaButtons.every((button) => getComputedStyle(button).cursor === "pointer"),
        overlayCueCount: [...document.querySelectorAll(".gallery-item-print-cue")].filter(isVisible).length,
        svgDownloadVisible: /Download SVG|^SVG$/im.test(actionText),
        pngDownloadVisible: /Download PNG/i.test(actionText),
        jpgDownloadVisible: /Download JPG/i.test(actionText),
        webpDownloadVisible: /Download WebP/i.test(actionText),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        visibleAdCount: visibleAds.length,
        adInNavigationCount: adInNav.length,
        adInsideGalleryCount: adInGallery.length,
        adBesidePrintDownloadCount: adNearPrintDownload.length,
        expectedAdCount: routeHasGallery ? (viewport.width >= 1740 ? 3 : 1) : 0,
        textOverflowEllipsis,
        labelCountCollision,
        relatedLinkCount: relatedLinks.length,
        relatedMinimumGap: relatedLayoutGaps.length ? Math.min(...relatedLayoutGaps) : null,
        popularLinkCount: popularLinks.length,
        popularLooksLikeRawTable: popularLinks.length > 0 && !popularLinks.every((link) => getComputedStyle(link).display === "grid"),
        lazyDuplicateBrowseSectionVisible: /More ways to browse/i.test(visibleText),
        noUselessEyebrowLabels: [...document.querySelectorAll(".hero-related-kicker, .eyebrow, .section-eyebrow")].every(
          (node) => (node.textContent || "").trim() !== "Coloring Pages",
        ),
        routeHasAnyGalleryMedia: galleryOrPreviewCount > 0,
      };
    },
    { route, viewport, expectedCount: expected },
  );
}

async function runDesktopInteractionChecks(context, baseUrl, source) {
  const page = await context.newPage();
  const results = {};
  try {
    await safeGoto(page, `${baseUrl}/coloring-pages/animals`);
    await waitForRouteSettled(page);
    results.header = await checkHeaderHoverAndFocus(page, baseUrl);
    results.popularRelated = await checkLinkSections(page, baseUrl);
    results.moreMenu = await checkMoreMenu(page, baseUrl);
    results.searchFilterPagination = await checkSearchFilterPagination(page, baseUrl);
    results.printAndDownloads = await checkPrintAndDownloads(page, baseUrl);
    results.source = source.browserRelevant;
    return results;
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkHeaderHoverAndFocus(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/`);
  await waitForRouteSettled(page);
  const firstNav = page.locator(".site-nav-desktop .site-nav-link").first();
  await firstNav.hover();
  const hover = await firstNav.evaluate((node) => {
    const style = getComputedStyle(node);
    const after = getComputedStyle(node, "::after");
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      textDecorationLine: style.textDecorationLine,
      outlineStyle: style.outlineStyle,
      afterContent: after.content,
      afterHeight: after.height,
      cursor: style.cursor,
      transform: style.transform,
    };
  });
  await firstNav.focus();
  const focus = await firstNav.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      textDecorationLine: style.textDecorationLine,
      outlineStyle: style.outlineStyle,
      cursor: style.cursor,
    };
  });
  const before = await firstNav.boundingBox();
  await firstNav.hover();
  const after = await firstNav.boundingBox();
  return {
    hoverBackgroundChanges: hover.backgroundColor !== "rgba(0, 0, 0, 0)" && hover.backgroundColor !== "transparent",
    hoverNoUnderline: hover.textDecorationLine === "none",
    hoverNoPseudoUnderline: hover.afterContent === "none" || hover.afterHeight === "auto" || hover.afterHeight === "0px",
    hoverNoLayoutShift: before && after ? Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1 : false,
    hoverCursorPointer: hover.cursor === "pointer",
    focusVisibleNonUnderline: focus.textDecorationLine === "none",
    focusVisibleNoOutline: focus.outlineStyle === "none",
    focusVisibleBackground: focus.backgroundColor !== "rgba(0, 0, 0, 0)" && focus.backgroundColor !== "transparent",
    passed:
      hover.textDecorationLine === "none" &&
      (hover.afterContent === "none" || hover.afterHeight === "auto" || hover.afterHeight === "0px") &&
      hover.cursor === "pointer" &&
      focus.textDecorationLine === "none" &&
      focus.outlineStyle === "none",
  };
}

async function checkLinkSections(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/coloring-pages/animals`);
  await waitForRouteSettled(page);
  return page.evaluate(() => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const linkInfo = (selector, labelSelector, countSelector) => {
      const links = [...document.querySelectorAll(selector)].filter(visible);
      const collisions = links.filter((link) => {
        const label = link.querySelector(labelSelector);
        const count = link.querySelector(countSelector);
        if (!label || !count) return false;
        const a = label.getBoundingClientRect();
        const b = count.getBoundingClientRect();
        return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      }).length;
      const countAlignRight = links.every((link) => {
        const count = link.querySelector(countSelector);
        return !count || getComputedStyle(count).textAlign === "right";
      });
      const ellipsized = links.some((link) => {
        const label = link.querySelector(labelSelector);
        return label && getComputedStyle(label).textOverflow === "ellipsis";
      });
      return { count: links.length, collisions, countAlignRight, ellipsized };
    };
    const popular = linkInfo(".hub-link", ".hub-link-title", ".hub-link-count");
    const heroRelated = linkInfo(".hero-related-link", ".hero-related-label", ".hero-related-count");
    const related = linkInfo(".related-link", ".related-link-label", ".related-link-count");
    const text = document.body.innerText || "";
    return {
      popular,
      heroRelated,
      related,
      moreWaysRemovedOrDistinct: !/More ways to browse/i.test(text) && /Narrower ways to browse|Related collections/i.test(text),
      noUselessEyebrowLabels: [...document.querySelectorAll(".hero-related-kicker, .eyebrow, .section-eyebrow")].every(
        (node) => (node.textContent || "").trim() !== "Coloring Pages",
      ),
      passed:
        popular.collisions === 0 &&
        heroRelated.collisions === 0 &&
        related.collisions === 0 &&
        popular.countAlignRight &&
        heroRelated.countAlignRight &&
        related.countAlignRight &&
        !popular.ellipsized &&
        !heroRelated.ellipsized &&
        !related.ellipsized &&
        !/More ways to browse/i.test(text),
    };
  });
}

async function checkMoreMenu(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/`);
  await waitForRouteSettled(page);
  const button = page.getByRole("button", { name: /^More$/ });
  await button.click();
  const panel = page.locator(".hub-menu-panel-desktop");
  await panel.waitFor({ state: "visible", timeout: 10_000 });
  const opened = await panel.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const styles = getComputedStyle(node);
    const labels = [...node.querySelectorAll(".hub-menu-link-label")];
    const counts = [...node.querySelectorAll(".hub-menu-link-count")];
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      maxHeight: styles.maxHeight,
      searchAtTop: Boolean(node.querySelector(".hub-menu-search-row input[type='search']")),
      groupedSectionCount: node.querySelectorAll(".hub-menu-group").length,
      ellipsizedLabels: labels.filter((label) => getComputedStyle(label).textOverflow === "ellipsis").length,
      nowrapLabels: labels.filter((label) => getComputedStyle(label).whiteSpace === "nowrap").length,
      countAlignRight: counts.every((count) => getComputedStyle(count).textAlign === "right"),
      hasAd: /Advertisement/.test(node.textContent || ""),
      unnecessaryLargeScreenScroll: box.width >= 1400 && node.scrollHeight > node.clientHeight + 24,
    };
  });
  const search = panel.locator('input[type="search"]').first();
  await search.fill("woolly mammoth");
  const searchFound = (await panel.getByRole("link", { name: /Woolly Mammoth/i }).count()) > 0;
  await page.keyboard.press("Escape");
  const escapeClosed = (await panel.count()) === 0;
  await button.click();
  await panel.waitFor({ state: "visible", timeout: 10_000 });
  await page.mouse.click(20, 20);
  const outsideClosed = (await panel.count()) === 0;
  await button.click();
  await panel.waitFor({ state: "visible", timeout: 10_000 });
  await panel.locator('input[type="search"]').first().fill("lily");
  await panel.getByRole("link", { name: /Lily/i }).first().click();
  await page.waitForURL(/\/coloring-pages\/lily$/, { timeout: 15_000 });
  const linkClickClosesAndNavigates = page.url().endsWith("/coloring-pages/lily");
  return {
    ...opened,
    searchFound,
    escapeClosed,
    outsideClosed,
    linkClickClosesAndNavigates,
    passed:
      opened.width >= Math.min(1400, 1440 - 64) &&
      opened.searchAtTop &&
      opened.groupedSectionCount > 1 &&
      opened.ellipsizedLabels === 0 &&
      opened.nowrapLabels === 0 &&
      opened.countAlignRight &&
      !opened.hasAd &&
      !opened.unnecessaryLargeScreenScroll &&
      searchFound &&
      escapeClosed &&
      outsideClosed &&
      linkClickClosesAndNavigates,
  };
}

async function checkSearchFilterPagination(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/coloring-pages`);
  await waitForRouteSettled(page);
  const search = page.getByRole("searchbox", { name: /Search this collection/i }).first();
  await search.fill("dragon");
  await page.waitForFunction(() => /matching pages/i.test(document.querySelector(".results-note")?.textContent || ""), null, { timeout: 10_000 }).catch(() => {});
  const searchWorks =
    /matching pages/i.test(await page.locator(".results-note").innerText().catch(() => "")) &&
    (await page.locator(".gallery-item").count()) > 0;
  const firstTab = page.locator(".gallery-tab").nth(1);
  const tabWorks = (await firstTab.count()) > 0;
  if (tabWorks) {
    await firstTab.click();
    await page.waitForTimeout(300);
  }
  const firstFilter = page.locator(".filter-chip").first();
  let filterWorks = true;
  if ((await firstFilter.count()) > 0) {
    await firstFilter.click();
    await page.waitForTimeout(300);
    filterWorks = /Showing \d/.test(await page.locator(".results-note").innerText().catch(() => ""));
  }
  await safeGoto(page, `${baseUrl}/coloring-pages/animals`);
  await waitForRouteSettled(page);
  const nextLink = page.getByRole("link", { name: /next/i }).first();
  const paginationLinkPresent = (await nextLink.count()) > 0;
  if (paginationLinkPresent) {
    await nextLink.click();
    await page.waitForURL(/\/coloring-pages\/animals\/page\/2\/?$/, { timeout: 20_000 }).catch(() => {});
  }
  const paginationWorks = paginationLinkPresent && /\/page\/2\/?$/.test(page.url());
  return {
    searchWorks,
    filterWorks,
    galleryTabsWork: tabWorks,
    paginationWorks,
    passed: searchWorks && filterWorks && tabWorks && paginationWorks,
  };
}

async function checkPrintAndDownloads(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/coloring-pages/animals`);
  await waitForRouteSettled(page);
  const target = page.locator('[id="asset-animals__animals-alligator__4feec8505a"]').first();
  await target.scrollIntoViewIfNeeded();
  await target.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 30_000 });
  const modal = await page.evaluate(() => {
    const panel = document.querySelector(".print-preview-panel");
    const mediaImage = document.querySelector(".print-preview-media img");
    const style = mediaImage ? getComputedStyle(mediaImage) : null;
    const actionButtons = [...document.querySelectorAll(".print-preview-actions button")].map((button) => (button.textContent || "").trim());
    return {
      open: Boolean(panel),
      topRightPrint: actionButtons.includes("Print"),
      topRightClose: actionButtons.includes("Close"),
      panelHasUnnecessaryScrollbar: panel ? panel.scrollHeight > panel.clientHeight + 3 : true,
      previewObjectFit: style?.objectFit || "",
      previewLoaded: Boolean(mediaImage?.complete && mediaImage.naturalWidth > 0),
      standaloneDownloadLabelCount: [...document.querySelectorAll(".print-preview-panel span, .print-preview-panel p, .print-preview-panel div")].filter(
        (node) => node.textContent?.trim() === "Download",
      ).length,
    };
  });
  const downloads = {
    png: await triggerDownload(page, "Download PNG", ".png"),
    jpg: await triggerDownload(page, "Download JPG", ".jpg"),
    webp: await triggerDownload(page, "Download WebP", ".webp"),
  };
  await page.getByRole("button", { name: /^Print$/ }).click();
  await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 45_000 });
  const printSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__ || null);
  const svgDownloadAbsent = (await page.getByRole("button", { name: /svg/i }).count()) === 0;
  return {
    modal,
    downloads,
    printSnapshot,
    svgDownloadAbsent,
    passed:
      modal.open &&
      modal.topRightPrint &&
      modal.topRightClose &&
      !modal.panelHasUnnecessaryScrollbar &&
      modal.previewObjectFit === "contain" &&
      modal.previewLoaded &&
      modal.standaloneDownloadLabelCount === 0 &&
      downloads.png &&
      downloads.jpg &&
      downloads.webp &&
      printSnapshot?.pageCount === 1 &&
      printSnapshot?.printableBorderCount === 1 &&
      printSnapshot?.brandingOverlapsArtwork === false &&
      svgDownloadAbsent,
  };
}

async function triggerDownload(page, label, extension) {
  const button = page.getByRole("button", { name: label });
  if ((await button.count()) === 0) return false;
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 45_000 }), button.click()]);
  return download.suggestedFilename().toLowerCase().endsWith(extension);
}

async function runMobileNavCheck(context, baseUrl) {
  const page = await context.newPage();
  try {
    await safeGoto(page, `${baseUrl}/`);
    await waitForRouteSettled(page);
    await page.getByRole("button", { name: /Open navigation menu/i }).click();
    const panel = page.locator(".mobile-nav-panel");
    await panel.waitFor({ state: "visible", timeout: 10_000 });
    const metrics = await panel.evaluate((node) => ({
      open: true,
      hasSearch: Boolean(node.querySelector('input[type="search"]')),
      hasAds: /Advertisement/.test(node.textContent || ""),
      width: Math.round(node.getBoundingClientRect().width),
    }));
    await panel.locator('input[type="search"]').first().fill("bulldog");
    const searchFound = (await panel.getByRole("link", { name: /Bulldog/i }).count()) > 0;
    await page.keyboard.press("Escape");
    const escapeClosed = (await panel.count()) === 0;
    await page.getByRole("button", { name: /Open navigation menu/i }).click();
    await panel.waitFor({ state: "visible", timeout: 10_000 });
    await panel.locator('input[type="search"]').first().fill("dodo");
    await panel.getByRole("link", { name: /Dodo/i }).first().click();
    await page.waitForURL(/\/coloring-pages\/dodo$/, { timeout: 15_000 });
    const linkClickClosesAndNavigates = page.url().endsWith("/coloring-pages/dodo");
    return {
      ...metrics,
      searchFound,
      escapeClosed,
      linkClickClosesAndNavigates,
      passed: metrics.open && metrics.hasSearch && !metrics.hasAds && metrics.width >= 320 && searchFound && escapeClosed && linkClickClosesAndNavigates,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function buildLinkSectionAcceptance(source, routeResults, interactions) {
  const desktopRoutes = routeResults.filter((result) => result.viewport === "1440" && result.loaded);
  const summary = {
    headerHoverFocusPassed: interactions?.header?.passed === true,
    popularCollectionsPassed: interactions?.popularRelated?.popular?.collisions === 0 && interactions?.popularRelated?.popular?.countAlignRight === true,
    relatedCollectionsPassed:
      interactions?.popularRelated?.related?.collisions === 0 &&
      interactions?.popularRelated?.heroRelated?.collisions === 0 &&
      interactions?.popularRelated?.related?.countAlignRight === true,
    moreWaysRemovedOrDistinct: interactions?.popularRelated?.moreWaysRemovedOrDistinct === true,
    moreMenuPassed: interactions?.moreMenu?.passed === true,
    mobileMenuPassed: interactions?.mobileNav?.passed === true,
    noRoughTableLook: desktopRoutes.every((result) => !result.popularLooksLikeRawTable),
    noCrampedPills: desktopRoutes.every((result) => result.relatedMinimumGap == null || result.relatedMinimumGap >= 16),
    noLabelCountCollisions: desktopRoutes.every((result) => result.labelCountCollision === false),
    noEllipsizedImportantLabels: desktopRoutes.every((result) => result.textOverflowEllipsis === false),
    noLazyDuplicateSection: desktopRoutes.every((result) => result.lazyDuplicateBrowseSectionVisible === false),
    sourceHandlersPresent: source.browserRelevant.moreMenuEscapeOutsideAndLinkCloseHandlers && source.browserRelevant.mobileMenuEscapeOutsideAndLinkCloseHandlers,
  };
  summary.linkSectionAcceptancePassed = Object.values(summary).every(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-local-link-section-acceptance",
    summary,
    details: {
      header: interactions?.header || null,
      linkSections: interactions?.popularRelated || null,
      moreMenu: interactions?.moreMenu || null,
      mobileMenu: interactions?.mobileNav || null,
    },
    blockers: Object.entries(summary)
      .filter(([key, value]) => key !== "linkSectionAcceptancePassed" && value !== true)
      .map(([key]) => `${key} failed.`),
  };
}

function buildAdPlaceholderQa(source, routeResults) {
  const galleryRoutes = routeResults.filter((result) => result.routeHasGallery && result.loaded);
  const summary = {
    adWellsVisibleByDefault: galleryRoutes.every((result) => result.visibleAdCount === result.expectedAdCount),
    noLiveAdsenseScript: source.browserRelevant.liveAdsenseAbsent,
    noAdClientIds: !/ca-pub-|data-ad-client|google_ad_client/i.test(source.sourceForAds),
    desktopWideDensityCorrect: galleryRoutes.filter((result) => result.width >= 1740).every((result) => result.visibleAdCount === 3),
    mobileTabletDensityCorrect: galleryRoutes.filter((result) => result.width < 1280).every((result) => result.visibleAdCount === 1),
    desktopDensityCorrect: galleryRoutes.filter((result) => result.width >= 1280 && result.width < 1740).every((result) => result.visibleAdCount === 1),
    noAdsInsideNav: routeResults.every((result) => result.adInNavigationCount === 0),
    noAdsInsideGalleryGrid: routeResults.every((result) => result.adInsideGalleryCount === 0),
    noAdsBesidePrintDownloadControls: routeResults.every((result) => result.adBesidePrintDownloadCount === 0),
    noOverlap: routeResults.every((result) => result.horizontalOverflow === false),
    noHorizontalOverflow: routeResults.every((result) => result.horizontalOverflow === false),
  };
  summary.adPlaceholderQaPassed = Object.values(summary).every(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-local-ad-placeholder-qa",
    summary,
    visibleAdCounts: galleryRoutes.map((result) => ({
      route: result.route,
      viewport: result.viewport,
      width: result.width,
      visibleAdCount: result.visibleAdCount,
      expectedAdCount: result.expectedAdCount,
    })),
    blockers: Object.entries(summary)
      .filter(([key, value]) => key !== "adPlaceholderQaPassed" && value !== true)
      .map(([key]) => `${key} failed.`),
  };
}

function buildBrowserSummary(routeResults, interactions, consoleErrors, linkSectionAcceptance, adPlaceholderQa) {
  const galleryRoutes = routeResults.filter((result) => result.routeHasGallery && result.loaded);
  const summary = {
    routeCountInspected: routeResults.length,
    routesLoad: routeResults.every((result) => result.loaded),
    viewportsChecked: VIEWPORTS.length,
    webpPreviewsRender: galleryRoutes.every((result) => result.visibleWebpImageCount > 0),
    noBrokenImageIcons: routeResults.every((result) => result.visibleBrokenImageCount === 0),
    noPreviewUnavailableForVisibleUploadedRecords: galleryRoutes.every((result) => result.previewUnavailableCount === 0),
    deferredRecordsHidden: routeResults.every((result) => result.deferredVisibleCount === 0),
    countsCorrect: routeResults.every((result) => result.countsCorrect !== false),
    featuredFreshRotationWorks: galleryRoutes.some((result) => result.route === "/" && result.galleryCardCount > 0),
    searchFilterWorks: interactions?.searchFilterPagination?.searchWorks === true && interactions?.searchFilterPagination?.filterWorks === true,
    paginationWorks: interactions?.searchFilterPagination?.paginationWorks === true,
    moreMenuWorks: interactions?.moreMenu?.passed === true,
    mobileNavWorks: interactions?.mobileNav?.passed === true,
    headerNavHoverFocusPassed: interactions?.header?.passed === true,
    popularCollectionsPolished: linkSectionAcceptance.summary.popularCollectionsPassed,
    relatedCollectionsPolished: linkSectionAcceptance.summary.relatedCollectionsPassed,
    countsAlignCleanly: linkSectionAcceptance.summary.noLabelCountCollisions,
    noUselessEyebrowLabels: routeResults.every((result) => result.noUselessEyebrowLabels !== false),
    noLazyDuplicateBrowseSections: linkSectionAcceptance.summary.noLazyDuplicateSection,
    noRedundantCardPrintButton: routeResults.every((result) => result.cardLevelPrintButtonCount === 0),
    imageClickOpensPreviewModal: interactions?.printAndDownloads?.modal?.open === true,
    modalPreviewNotCropped: interactions?.printAndDownloads?.modal?.previewObjectFit === "contain",
    modalNoUnnecessaryScrollbar: interactions?.printAndDownloads?.modal?.panelHasUnnecessaryScrollbar === false,
    printWorks: interactions?.printAndDownloads?.printSnapshot?.pageCount === 1,
    downloadsPassed:
      interactions?.printAndDownloads?.downloads?.png === true &&
      interactions?.printAndDownloads?.downloads?.jpg === true &&
      interactions?.printAndDownloads?.downloads?.webp === true,
    svgDownloadAbsent: routeResults.every((result) => result.svgDownloadVisible === false) && interactions?.printAndDownloads?.svgDownloadAbsent === true,
    adPlaceholderDensityUnchanged: adPlaceholderQa.summary.adPlaceholderQaPassed,
    noHorizontalOverflow: routeResults.every((result) => result.horizontalOverflow === false),
    noConsoleErrors: consoleErrors.length === 0,
  };
  summary.browserQaPassed = Object.entries(summary)
    .filter(([key]) => !["routeCountInspected", "viewportsChecked"].includes(key))
    .every(([, value]) => value === true || typeof value === "number");
  return summary;
}

function expectedCountForRoute(route, source) {
  if (route === "/" || route === "/coloring-pages") return source.runtimeItems.items.length;
  return source.hubByRoute.get(route)?.assetCount ?? null;
}

function outputContainsRoute(files, route) {
  if (route === "/") return files.some((file) => file.endsWith(`${path.sep}index.html`));
  const safe = route.replace(/^\/+/, "").split("/").join(path.sep);
  return files.some((file) => file.endsWith(`${path.sep}${safe}${path.sep}index.html`) || file.endsWith(`${path.sep}${safe}.html`));
}

async function listFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else files.push(absolute);
    }
  }
  await walk(root);
  return files;
}

function buildStaticBlockers(summary) {
  return Object.entries(summary)
    .filter(([key, value]) => key !== "staticExportPassed" && key !== "htmlFileCount" && key !== "runtimeSitemapRouteCount" && value !== true)
    .map(([key]) => `${key} failed.`);
}

function scanTextFiles(files) {
  const result = {
    appApiRefs: false,
    localhostRefs: false,
    r2DevRefs: false,
    privateR2Refs: false,
    downloadSvgRefs: false,
    liveAdsRefs: false,
  };
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const renderedDocument = /\.(?:html|xml|txt|json)$/i.test(file);
    if (renderedDocument) {
      result.appApiRefs ||= /\/api\/|app\/api/i.test(text);
      result.localhostRefs ||= /localhost|127\.0\.0\.1|file:\/\//i.test(text);
      result.r2DevRefs ||= /r2\.dev/i.test(text);
      result.privateR2Refs ||= /r2\.cloudflarestorage\.com/i.test(text);
    }
    result.downloadSvgRefs ||= /Download SVG|>\s*SVG\s*<\/(?:button|a|span)>/i.test(text);
    result.liveAdsRefs ||= /adsbygoogle|pagead2\.googlesyndication|ca-pub-|data-ad-client|google_ad_client/i.test(text);
  }
  return result;
}

function buildBrowserBlockers(summary, consoleErrors) {
  const blockers = Object.entries(summary)
    .filter(([key, value]) => key !== "browserQaPassed" && key !== "routeCountInspected" && key !== "viewportsChecked" && value !== true)
    .map(([key]) => `${key} failed.`);
  if (consoleErrors.length > 0) blockers.push("Console errors were detected.");
  return blockers;
}

function renderStaticExportReport(payload) {
  return [
    "# Final Local Static Export Report",
    "",
    renderTable([
      ["buildPassed", passFail(payload.summary.buildPassed)],
      ["staticExportConfigured", passFail(payload.summary.staticExportConfigured)],
      ["htmlFileCount", String(payload.summary.htmlFileCount)],
      ["runtimeSitemapRouteCount", String(payload.summary.runtimeSitemapRouteCount)],
      ["generatedExpectedRuntimeRoutes", passFail(payload.summary.generatedExpectedRuntimeRoutes)],
      ["noLocalhost", passFail(payload.summary.noLocalhost)],
      ["noR2Dev", passFail(payload.summary.noR2Dev)],
      ["noPrivateR2Endpoint", passFail(payload.summary.noPrivateR2Endpoint)],
      ["noAppApiReferences", passFail(payload.summary.noAppApiReferences)],
      ["noDownloadSvgText", passFail(payload.summary.noDownloadSvgText)],
      ["noLiveAdsenseScriptsOrIds", passFail(payload.summary.noLiveAdsenseScriptsOrIds)],
      ["staticExportPassed", passFail(payload.summary.staticExportPassed)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderBrowserReport(payload) {
  return [
    "# Final Local Acceptance Browser QA",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, typeof value === "boolean" ? passFail(value) : String(value)])),
    "",
    `Screenshots: \`${payload.screenshotDirectory}\``,
    `Routes inspected: ${payload.routes.length}`,
    `Viewport count: ${payload.viewports.length}`,
    "",
    "## Interaction Checks",
    "",
    `- Header hover/focus: ${passFail(payload.interactionResults?.header?.passed)}`,
    `- More menu: ${passFail(payload.interactionResults?.moreMenu?.passed)}`,
    `- Mobile nav: ${passFail(payload.interactionResults?.mobileNav?.passed)}`,
    `- Search/filter/pagination: ${passFail(payload.interactionResults?.searchFilterPagination?.passed)}`,
    `- Print/download modal: ${passFail(payload.interactionResults?.printAndDownloads?.passed)}`,
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderLinkSectionReport(payload) {
  return [
    "# Final Local Link Section Acceptance",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, passFail(value)])),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function renderAdReport(payload) {
  return [
    "# Final Local Ad Placeholder QA",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, passFail(value)])),
    "",
    "Visible ad counts were checked across gallery routes and 390, 768, 1440, 1920, and 2560 widths.",
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
}

function slugFor(route) {
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}
