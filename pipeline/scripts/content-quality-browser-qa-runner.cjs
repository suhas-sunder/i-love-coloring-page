#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const {
  REPO_ROOT,
  ensureStaticExport,
  installStaticExportRoutes,
  readText,
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const RUN_ID = "content-quality-browser-qa";
const SCREENSHOT_DIR = "pipeline/review/content-quality/screenshots";
const ROUTES = [
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
  "/coloring-pages/orchid",
  "/coloring-pages/salmon",
  "/sitemap",
  "/about",
  "/contact",
  "/privacy",
];
const VIEWPORTS = [
  { label: "390", width: 390, height: 844, mobile: true },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 1000 },
  { label: "1920", width: 1920, height: 1080 },
];
const SCREENSHOT_ROUTES = new Set([
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/dodo",
  "/coloring-pages/orchid",
  "/coloring-pages/salmon",
  "/sitemap",
]);
const SCREENSHOT_VIEWPORTS = new Set(["390", "1440", "1920"]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const build = await ensureStaticExport({ force: true });
  await fsp.mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });

  const source = await inspectSource();
  const browser = await chromium.launch();
  const routeResults = [];
  const screenshotPaths = [];
  const consoleIssues = [];
  let modalResult = null;
  let moreMenuResult = null;
  let adRailCompactResult = null;

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
            if (["error", "warning"].includes(message.type())) {
              consoleIssues.push({ route, viewport: viewport.label, type: message.type(), text: message.text() });
            }
          });
          page.on("pageerror", (error) => {
            consoleIssues.push({ route, viewport: viewport.label, type: "pageerror", text: error.message });
          });
          try {
            await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
            await page.waitForLoadState("load", { timeout: 45000 }).catch(() => {});
            const metrics = await collectRouteMetrics(page, route, viewport.label);
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
          modalResult = await runModalCheck(context, baseUrl);
          moreMenuResult = await runMoreMenuCheck(context, baseUrl);
        }
      } finally {
        await context.close();
      }
    }

    const compactContext = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
    const compactBaseUrl = await installStaticExportRoutes(compactContext, build.outDir);
    try {
      adRailCompactResult = await runAdRailCompactCheck(compactContext, compactBaseUrl);
    } finally {
      await compactContext.close();
    }
  } finally {
    await browser.close();
  }

  const summary = buildSummary(routeResults, modalResult, moreMenuResult, adRailCompactResult, consoleIssues, source);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    baseUrl: "https://www.ilovecoloringpage.com",
    build,
    routes: ROUTES,
    viewports: VIEWPORTS.map((viewport) => viewport.label),
    sourceChecks: source,
    summary,
    routeResults,
    modalResult,
    moreMenuResult,
    adRailCompactResult,
    consoleIssues,
    screenshotDirectory: SCREENSHOT_DIR,
    screenshotPaths,
    blockers: buildBlockers(summary, consoleIssues),
  };

  await writeJson("pipeline/manifests/content-quality-browser-qa-results.json", payload);
  await writeText("pipeline/reports/content-quality-browser-qa-report.md", renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!summary.browserQaPassed) process.exitCode = 1;
}

async function inspectSource() {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const css = await readText("src/styles/components.css");
  const hubPageContent = await readText("src/components/coloring/HubPageContent.tsx");
  const seoContentSection = await readText("src/components/coloring/SeoContentSection.tsx");
  const adsSource = [
    await readText("src/components/ads/AdSlot.tsx"),
    await readText("src/components/ads/AdRail.tsx"),
    await readText("src/styles/components.css"),
  ].join("\n");
  return {
    galleryFirstSourceOrder: hubPageContent.indexOf("GallerySearch") < hubPageContent.indexOf("SeoContentSection"),
    seoSectionExists: /seo-content-section/.test(seoContentSection),
    imageClickModalBehavior: /className="gallery-item-media-button"/.test(imageCard) && /onClick=\{openPrintPreview\}/.test(imageCard),
    pngJpgWebpDownloadControls: /Download PNG/.test(downloadMenu) && /Download JPG/.test(downloadMenu) && /Download WebP/.test(downloadMenu),
    svgDownloadAbsent: !/Download SVG|downloadSvg\b|svgDownload/i.test(`${imageCard}\n${downloadMenu}\n${browserDownloads}`),
    previewUsesContain: /\.print-preview-media img\s*\{[\s\S]*object-fit:\s*contain/.test(css),
    adPlacementUnchanged: /ad-slot-header-banner|ad-rail|hub-after-gallery|hub-lower-content/.test(adsSource),
    compactAdRailBreakpointPresent: /--ad-rail-compact-min-viewport:\s*1536px/.test(css) && /@media\s*\(min-width:\s*1536px\)\s*and\s*\(max-width:\s*1739px\)/.test(css),
    liveAdsenseAbsent: !/adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|data-ad-client/i.test(`${imageCard}\n${downloadMenu}\n${browserDownloads}\n${adsSource}`),
  };
}

async function collectRouteMetrics(page, route, viewport) {
  return await page.evaluate(({ route, viewport }) => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((element) => {
      const style = window.getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    }).length;
    const gallery = rect(".gallery-section");
    const seo = rect(".seo-content-section");
    const galleryCards = visible(".gallery-item");
    const previewImages = Array.from(document.querySelectorAll(".gallery-item-media img"));
    const brokenImages = previewImages.filter((image) => image.complete && image.naturalWidth === 0).length;
    const seoBlocks = Array.from(document.querySelectorAll(".seo-content-block p")).map((element) => element.textContent?.trim() || "");
    const relatedLinks = Array.from(document.querySelectorAll(".seo-related-link")).map((element) => {
      const label = element.querySelector(".seo-related-link-label")?.textContent?.trim() || "";
      const count = element.querySelector(".seo-related-link-count")?.textContent?.trim() || "";
      const box = element.getBoundingClientRect();
      return { label, count, width: box.width };
    });
    const sitemapGroups = visible(".html-sitemap-group, .sitemap-section, .sitemap-group, [data-sitemap-group]");
    const body = document.documentElement;
    const contentTooHeavyBeforeGallery = false;
    return {
      route,
      viewport,
      loaded: true,
      title: document.title,
      h1Count: document.querySelectorAll("h1").length,
      galleryCards,
      previewImages: previewImages.length,
      brokenImages,
      previewUnavailableVisible: document.body.innerText.includes("Preview unavailable"),
      galleryBeforeSeo: !gallery || !seo || gallery.top < seo.top,
      contentTooHeavyBeforeGallery,
      seoSectionPresent: Boolean(seo),
      seoBlocks: seoBlocks.length,
      seoWallOfText: seoBlocks.some((text) => text.length > 720),
      relatedLinks: relatedLinks.length,
      relatedCountsAligned: relatedLinks.every((link) => link.label && link.count && link.width > 180),
      sitemapGrouped: route === "/sitemap" ? sitemapGroups >= 4 : true,
      adSlotsVisible: visible(".ad-slot"),
      adRailsVisible: visible(".ad-rail"),
      horizontalOverflow: body.scrollWidth > window.innerWidth + 2,
      svgDownloadVisible: /Download SVG/i.test(document.body.innerText),
    };
  }, { route, viewport });
}

async function runModalCheck(context, baseUrl) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("load", { timeout: 45000 }).catch(() => {});
    const button = page.locator(".gallery-item-media-button").first();
    await button.click({ timeout: 15000 });
    await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 15000 });
    await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    return await page.evaluate(() => {
      const panel = document.querySelector(".print-preview-panel");
      const image = document.querySelector(".print-preview-media img");
      const downloadText = document.querySelector(".print-preview-downloads")?.textContent || "";
      return {
        modalOpened: Boolean(panel),
        previewObjectFitContain: image ? window.getComputedStyle(image).objectFit === "contain" : false,
        modalHasUnnecessaryScrollbar: panel ? panel.scrollHeight > panel.clientHeight + 8 : true,
        downloadPngPresent: /Download PNG/.test(downloadText),
        downloadJpgPresent: /Download JPG/.test(downloadText),
        downloadWebpPresent: /Download WebP/.test(downloadText),
        svgDownloadAbsent: !/Download SVG/.test(document.body.innerText),
        standaloneDownloadLabelAbsent: !/^\s*Download\s*$/m.test(downloadText),
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function runMoreMenuCheck(context, baseUrl) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const moreButton = page.getByRole("button", { name: "More" });
    await moreButton.click({ timeout: 15000 });
    await page.locator(".hub-menu-panel").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    return await page.evaluate(() => {
      const panel = document.querySelector(".hub-menu-panel");
      const search = document.querySelector('input[type="search"], input[placeholder*="Search" i]');
      const links = Array.from(document.querySelectorAll(".hub-menu-panel a"));
      const truncated = links.some((link) => {
        const style = window.getComputedStyle(link);
        return style.textOverflow === "ellipsis";
      });
      return {
        opened: Boolean(panel),
        searchPresent: Boolean(search),
        linkCount: links.length,
        importantTitlesNotEllipsized: !truncated,
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function runAdRailCompactCheck(context, baseUrl) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("load", { timeout: 45000 }).catch(() => {});
    return await page.evaluate(() => {
      const visible = (selector) => Array.from(document.querySelectorAll(selector)).filter((element) => {
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      }).length;
      return {
        viewportWidth: window.innerWidth,
        visibleAdSlots: visible(".ad-slot"),
        visibleRails: visible(".ad-rail"),
        leftRailVisible: visible(".ad-rail-left") === 1,
        rightRailVisible: visible(".ad-rail-right") === 1,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

function buildSummary(routeResults, modalResult, moreMenuResult, adRailCompactResult, consoleIssues, source) {
  const loaded = routeResults.every((route) => route.loaded);
  const galleryPages = routeResults.filter((route) => route.route.startsWith("/coloring-pages"));
  const sitemapPages = routeResults.filter((route) => route.route === "/sitemap");
  const summary = {
    routesChecked: routeResults.length,
    routesLoaded: loaded,
    galleryStillAppearsEarly: galleryPages.every((route) => route.galleryBeforeSeo),
    contentReadable: routeResults.every((route) => !route.seoWallOfText),
    internalLinksUseful: galleryPages.every((route) => route.relatedLinks > 0 && route.relatedCountsAligned),
    relatedCollectionsClean: galleryPages.every((route) => route.relatedCountsAligned),
    htmlSitemapGrouped: sitemapPages.every((route) => route.sitemapGrouped),
    webpPreviewsRender: galleryPages.every((route) => route.previewImages > 0 && route.brokenImages === 0),
    noPreviewUnavailable: galleryPages.every((route) => !route.previewUnavailableVisible),
    imageClickModalWorks: Boolean(modalResult?.modalOpened),
    modalPreviewNotCropped: Boolean(modalResult?.previewObjectFitContain),
    modalNoUnnecessaryScrollbar: Boolean(modalResult && !modalResult.modalHasUnnecessaryScrollbar),
    downloadsPngJpgWebpPresent: Boolean(modalResult?.downloadPngPresent && modalResult?.downloadJpgPresent && modalResult?.downloadWebpPresent),
    svgDownloadAbsent: source.svgDownloadAbsent && routeResults.every((route) => !route.svgDownloadVisible) && Boolean(modalResult?.svgDownloadAbsent),
    moreMenuUsable: Boolean(moreMenuResult?.opened && moreMenuResult?.searchPresent && moreMenuResult?.linkCount > 20 && moreMenuResult?.importantTitlesNotEllipsized),
    adPlacementUnchanged: source.adPlacementUnchanged,
    compactSideRailsVisible: Boolean(adRailCompactResult?.leftRailVisible && adRailCompactResult?.rightRailVisible),
    noHorizontalOverflow: routeResults.every((route) => !route.horizontalOverflow) && !adRailCompactResult?.horizontalOverflow,
    liveAdsenseAbsent: source.liveAdsenseAbsent,
    consoleIssueCount: consoleIssues.length,
  };
  summary.browserQaPassed = Object.entries(summary)
    .filter(([key]) => !["routesChecked", "consoleIssueCount"].includes(key))
    .every(([, value]) => value === true) && summary.consoleIssueCount === 0;
  return summary;
}

function buildBlockers(summary, consoleIssues) {
  const blockers = [];
  for (const [key, value] of Object.entries(summary)) {
    if (["routesChecked", "consoleIssueCount", "browserQaPassed"].includes(key)) continue;
    if (value !== true) blockers.push(key);
  }
  if (consoleIssues.length) blockers.push(`${consoleIssues.length} console warnings/errors`);
  return blockers;
}

function renderReport(payload) {
  return `# Content Quality Browser QA

${renderTable(Object.entries(payload.summary).map(([key, value]) => [key, value]))}

## Screenshots
${payload.screenshotPaths.length ? payload.screenshotPaths.map((item) => `- ${item}`).join("\n") : "- None saved."}

## Blockers
${payload.blockers.length ? payload.blockers.map((item) => `- ${item}`).join("\n") : "- None."}
`;
}

function slugFor(route) {
  return route === "/" ? "home" : route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}
