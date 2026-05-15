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
  renderTable,
  writeJson,
  writeText,
} = require("./predeploy-local-utils.cjs");

const RUN_ID = "final-sitemap-related-browser-qa";
const SCREENSHOT_DIR = "pipeline/review/final-sitemap-related/screenshots";
const ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/geometric",
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
  { label: "2560", width: 2560, height: 1440 },
];
const SCREENSHOT_ROUTES = new Set(["/coloring-pages/animals", "/sitemap"]);
const SCREENSHOT_VIEWPORTS = new Set(["390", "1440", "1920", "2560"]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const build = await ensureStaticExport({ force: false });
  await fsp.mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });

  const runtimeHubs = await readJson("src/generated/coloring/runtime-hubs.json");
  const runtimeHubRoutes = runtimeHubs.hubs.map((hub) => hub.route);
  const browser = await chromium.launch();
  const routeResults = [];
  const screenshotPaths = [];
  const consoleErrors = [];
  let interactions = null;

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
            if (message.type() === "error") consoleErrors.push({ route, viewport: viewport.label, text: message.text() });
          });
          page.on("pageerror", (error) => consoleErrors.push({ route, viewport: viewport.label, text: error.message }));
          try {
            await safeGoto(page, `${baseUrl}${route}`);
            await waitForRouteSettled(page);
            const metrics = await collectRouteMetrics(page, route, viewport);
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
          interactions = await runInteractionChecks(context, baseUrl, runtimeHubRoutes);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const summary = buildSummary(routeResults, interactions, consoleErrors);
  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    build,
    routes: ROUTES,
    viewports: VIEWPORTS.map((viewport) => viewport.label),
    summary,
    routeResults,
    interactionResults: interactions,
    consoleErrors,
    screenshotDirectory: SCREENSHOT_DIR,
    screenshotPaths,
    blockers: buildBlockers(summary, consoleErrors),
  };

  await writeJson("pipeline/manifests/final-sitemap-related-browser-qa-results.json", payload);
  await writeText("pipeline/reports/final-sitemap-related-browser-qa-report.md", renderReport(payload));
  console.log(JSON.stringify(payload.summary, null, 2));
  if (!payload.summary.browserQaPassed) process.exitCode = 1;
}

async function runInteractionChecks(context, baseUrl, runtimeHubRoutes) {
  const page = await context.newPage();
  try {
    const related = await checkRelatedCollections(page, baseUrl);
    const sitemap = await checkHtmlSitemap(page, baseUrl, runtimeHubRoutes);
    const footer = await checkFooterSitemapLink(page, baseUrl);
    const moreMenu = await checkMoreMenu(page, baseUrl);
    const printDownloads = await checkPrintAndDownloads(page, baseUrl);
    return { related, sitemap, footer, moreMenu, printDownloads };
  } finally {
    await page.close().catch(() => {});
  }
}

async function checkRelatedCollections(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/coloring-pages/animals`);
  await waitForRouteSettled(page);
  return page.evaluate(() => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const inspectLinks = (selector, labelSelector, countSelector) => {
      const links = [...document.querySelectorAll(selector)].filter(visible);
      const collisions = links.filter((link) => {
        const label = link.querySelector(labelSelector);
        const count = link.querySelector(countSelector);
        if (!label || !count) return false;
        const a = label.getBoundingClientRect();
        const b = count.getBoundingClientRect();
        return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      }).length;
      const displays = links.map((link) => getComputedStyle(link).display);
      const pillLike = links.filter((link) => {
        const style = getComputedStyle(link);
        return style.display === "inline-flex" || parseFloat(style.borderRadius || "0") > 18;
      }).length;
      const countsAlignRight = links.every((link) => {
        const count = link.querySelector(countSelector);
        return !count || getComputedStyle(count).textAlign === "right";
      });
      const labelsEllipsized = links.filter((link) => {
        const label = link.querySelector(labelSelector);
        return label && getComputedStyle(label).textOverflow === "ellipsis";
      }).length;
      return { count: links.length, collisions, displays, pillLike, countsAlignRight, labelsEllipsized };
    };
    const seoRelatedList = document.querySelector(".seo-related-link-list");
    const seoListStyle = seoRelatedList ? getComputedStyle(seoRelatedList) : null;
    const seoRelated = inspectLinks(".seo-related-link", ".seo-related-link-label", ".seo-related-link-count");
    const bottomRelated = inspectLinks(".related-link", ".related-link-label", ".related-link-count");
    const text = document.body.innerText || "";
    return {
      seoRelated,
      bottomRelated,
      seoListDisplay: seoListStyle?.display || "",
      seoListColumnGap: seoListStyle?.columnGap || "",
      seoListRowGap: seoListStyle?.rowGap || "",
      moreWaysRemovedOrDistinct: !/More ways to browse/i.test(text) && /Narrower ways to browse/i.test(text),
      passed:
        seoRelated.count > 0 &&
        bottomRelated.count > 0 &&
        seoRelated.collisions === 0 &&
        bottomRelated.collisions === 0 &&
        seoRelated.pillLike === 0 &&
        bottomRelated.pillLike === 0 &&
        seoRelated.countsAlignRight &&
        bottomRelated.countsAlignRight &&
        seoRelated.labelsEllipsized === 0 &&
        bottomRelated.labelsEllipsized === 0 &&
        seoListStyle?.display === "grid" &&
        !/More ways to browse/i.test(text),
    };
  });
}

async function checkHtmlSitemap(page, baseUrl, runtimeHubRoutes) {
  await safeGoto(page, `${baseUrl}/sitemap`);
  await waitForRouteSettled(page);
  const metrics = await page.evaluate((expectedRoutes) => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const hrefs = [...document.querySelectorAll("a[href]")].map((link) => link.getAttribute("href") || "");
    const missingRoutes = expectedRoutes.filter((route) => !hrefs.includes(route));
    const groups = [...document.querySelectorAll(".html-sitemap-group")].filter(visible);
    const links = [...document.querySelectorAll(".html-sitemap-link")].filter(visible);
    const groupCollisions = groups.filter((group, index) => {
      const a = group.getBoundingClientRect();
      return groups.slice(index + 1).some((other) => {
        const b = other.getBoundingClientRect();
        const sameRow = Math.abs(a.top - b.top) < 8;
        return sameRow && a.right + 24 > b.left && b.right + 24 > a.left;
      });
    }).length;
    const countCollisions = links.filter((link) => {
      const label = link.querySelector(".html-sitemap-link-label");
      const count = link.querySelector(".html-sitemap-link-count");
      if (!label || !count) return false;
      const a = label.getBoundingClientRect();
      const b = count.getBoundingClientRect();
      return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    }).length;
    return {
      h1: (document.querySelector("h1")?.textContent || "").trim(),
      groupCount: groups.length,
      linkCount: links.length,
      missingRoutes,
      hasMainPages: /Main pages/.test(document.body.innerText || ""),
      hasMoreCollections: /More Collections/.test(document.body.innerText || ""),
      hasTrustLinks: ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"].every((route) => hrefs.includes(route)),
      countCollisions,
      groupCollisions,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, runtimeHubRoutes);

  const firstHub = page.locator('a[href="/coloring-pages/dodo"]').first();
  const htmlSitemapLinksWork = (await firstHub.count()) > 0;
  if (htmlSitemapLinksWork) {
    await firstHub.click();
    await page.waitForURL(/\/coloring-pages\/dodo$/, { timeout: 15_000 }).catch(() => {});
  }

  return {
    ...metrics,
    htmlSitemapLinksWork: htmlSitemapLinksWork && page.url().endsWith("/coloring-pages/dodo"),
    passed:
      metrics.h1 === "Sitemap" &&
      metrics.groupCount >= 8 &&
      metrics.linkCount >= runtimeHubRoutes.length &&
      metrics.missingRoutes.length === 0 &&
      metrics.hasMainPages &&
      metrics.hasMoreCollections &&
      metrics.hasTrustLinks &&
      metrics.countCollisions === 0 &&
      metrics.groupCollisions === 0 &&
      !metrics.horizontalOverflow &&
      htmlSitemapLinksWork &&
      page.url().endsWith("/coloring-pages/dodo"),
  };
}

async function checkFooterSitemapLink(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/`);
  await waitForRouteSettled(page);
  const footerLink = page.locator('footer a[href="/sitemap"]').first();
  const present = (await footerLink.count()) > 0;
  if (present) {
    await footerLink.click();
    await page.waitForURL(/\/sitemap$/, { timeout: 15_000 }).catch(() => {});
  }
  return {
    present,
    navigated: page.url().endsWith("/sitemap"),
    passed: present && page.url().endsWith("/sitemap"),
  };
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
    const labels = [...node.querySelectorAll(".hub-menu-link-label")];
    const counts = [...node.querySelectorAll(".hub-menu-link-count")];
    return {
      width: Math.round(box.width),
      searchAtTop: Boolean(node.querySelector(".hub-menu-search-row input[type='search']")),
      groupedSectionCount: node.querySelectorAll(".hub-menu-group").length,
      ellipsizedLabels: labels.filter((label) => getComputedStyle(label).textOverflow === "ellipsis").length,
      countAlignRight: counts.every((count) => getComputedStyle(count).textAlign === "right"),
      hasAd: /Advertisement/.test(node.textContent || ""),
    };
  });
  await panel.locator('input[type="search"]').first().fill("bamboo");
  const searchFound = (await panel.getByRole("link", { name: /Bamboo/i }).count()) > 0;
  await page.keyboard.press("Escape");
  const escapeClosed = (await panel.count()) === 0;
  return {
    ...opened,
    searchFound,
    escapeClosed,
    passed:
      opened.width >= Math.min(1400, 1440 - 64) &&
      opened.searchAtTop &&
      opened.groupedSectionCount > 1 &&
      opened.ellipsizedLabels === 0 &&
      opened.countAlignRight &&
      !opened.hasAd &&
      searchFound &&
      escapeClosed,
  };
}

async function checkPrintAndDownloads(page, baseUrl) {
  await safeGoto(page, `${baseUrl}/coloring-pages/animals`);
  await waitForRouteSettled(page);
  const firstCard = page.locator(".gallery-item").first();
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.locator(".gallery-item-media-button").click();
  await page.locator(".print-preview-panel").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 30_000 });
  const modal = await page.evaluate(() => {
    const panel = document.querySelector(".print-preview-panel");
    const image = document.querySelector(".print-preview-media img");
    const imageStyle = image ? getComputedStyle(image) : null;
    return {
      open: Boolean(panel),
      previewObjectFit: imageStyle?.objectFit || "",
      previewLoaded: Boolean(image?.complete && image.naturalWidth > 0),
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

async function collectRouteMetrics(page, route, viewport) {
  return page.evaluate(
    ({ route, viewport }) => {
      const visible = (node) => {
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const actionText = [...document.querySelectorAll("a, button")].map((node) => (node.textContent || "").trim()).join("\n");
      const galleryRoute = route === "/" || route.startsWith("/coloring-pages");
      const visibleImages = [...document.images].filter(visible);
      const loadedImages = visibleImages.filter((image) => image.complete && image.naturalWidth > 0);
      const webpImages = loadedImages.filter((image) => (image.currentSrc || image.src).includes("/webp/"));
      const brokenImages = visibleImages.filter((image) => image.complete && image.naturalWidth === 0);
      const visibleAds = [...document.querySelectorAll(".ad-slot")].filter(visible);
      return {
        route,
        viewport: viewport.label,
        width: viewport.width,
        loaded: document.readyState === "complete" || document.readyState === "interactive",
        galleryRoute,
        visibleImageCount: visibleImages.length,
        loadedImageCount: loadedImages.length,
        webpImageCount: webpImages.length,
        brokenImageCount: brokenImages.length,
        previewUnavailableCount: ((document.body.innerText || "").match(/Preview unavailable/g) || []).length,
        svgDownloadVisible: /Download SVG|^SVG$/im.test(actionText),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        visibleAdCount: visibleAds.length,
      };
    },
    { route, viewport },
  );
}

function buildSummary(routeResults, interactions, consoleErrors) {
  const galleryRoutes = routeResults.filter((result) => result.galleryRoute && result.loaded);
  const summary = {
    routesLoad: routeResults.every((result) => result.loaded),
    webpPreviewsRender: galleryRoutes.every((result) => result.webpImageCount > 0),
    noBrokenImages: routeResults.every((result) => result.brokenImageCount === 0),
    noPreviewUnavailable: galleryRoutes.every((result) => result.previewUnavailableCount === 0),
    relatedCollectionsNoPillDump:
      interactions?.related?.seoRelated?.pillLike === 0 &&
      interactions?.related?.bottomRelated?.pillLike === 0 &&
      interactions?.related?.seoListDisplay === "grid",
    relatedCountsAligned:
      interactions?.related?.seoRelated?.countsAlignRight === true &&
      interactions?.related?.bottomRelated?.countsAlignRight === true &&
      interactions?.related?.seoRelated?.collisions === 0 &&
      interactions?.related?.bottomRelated?.collisions === 0,
    moreWaysRemovedOrDistinct: interactions?.related?.moreWaysRemovedOrDistinct === true,
    htmlSitemapRendersCleanly: interactions?.sitemap?.passed === true,
    htmlSitemapGroupSpacingPassed: interactions?.sitemap?.groupCollisions === 0,
    htmlSitemapLinksWork: interactions?.sitemap?.htmlSitemapLinksWork === true,
    footerSitemapLinkWorks: interactions?.footer?.passed === true,
    moreMenuWorks: interactions?.moreMenu?.passed === true,
    printWorks: interactions?.printDownloads?.printSnapshot?.pageCount === 1,
    downloadsStillAvailable:
      interactions?.printDownloads?.downloads?.png === true &&
      interactions?.printDownloads?.downloads?.jpg === true &&
      interactions?.printDownloads?.downloads?.webp === true,
    svgDownloadAbsent: routeResults.every((result) => result.svgDownloadVisible === false) && interactions?.printDownloads?.svgDownloadAbsent === true,
    adPlaceholdersUnchanged: galleryRoutes.every((result) => result.visibleAdCount === (result.width >= 1740 ? 3 : 1)),
    noHorizontalOverflow: routeResults.every((result) => result.horizontalOverflow === false),
    noConsoleErrors: consoleErrors.length === 0,
  };
  summary.browserQaPassed = Object.values(summary).every(Boolean);
  return summary;
}

function buildBlockers(summary, consoleErrors) {
  const blockers = Object.entries(summary)
    .filter(([key, value]) => key !== "browserQaPassed" && value !== true)
    .map(([key]) => `${key} failed.`);
  if (consoleErrors.length > 0) blockers.push("Console errors were detected.");
  return blockers;
}

function renderReport(payload) {
  return [
    "# Final Sitemap And Related Browser QA",
    "",
    renderTable(Object.entries(payload.summary).map(([key, value]) => [key, passFail(value)])),
    "",
    `Screenshots: \`${payload.screenshotDirectory}\``,
    `Routes inspected: ${payload.routes.length}`,
    `Viewports inspected: ${payload.viewports.length}`,
    "",
    "## Interaction Checks",
    "",
    `- Related collections: ${passFail(payload.interactionResults?.related?.passed)}`,
    `- HTML sitemap: ${passFail(payload.interactionResults?.sitemap?.passed)}`,
    `- Footer sitemap link: ${passFail(payload.interactionResults?.footer?.passed)}`,
    `- More menu: ${passFail(payload.interactionResults?.moreMenu?.passed)}`,
    `- Print and downloads: ${passFail(payload.interactionResults?.printDownloads?.passed)}`,
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join("; ") : "none"}`,
  ].join("\n");
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

function slugFor(route) {
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}
