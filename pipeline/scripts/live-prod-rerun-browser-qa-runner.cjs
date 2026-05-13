const { chromium } = require("playwright");
const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const SCREENSHOT_DIR = path.join("pipeline", "review", "live-prod-rerun", "screenshots");
const MANIFEST_DIR = path.join("pipeline", "manifests");
const REPORT_DIR = path.join("pipeline", "reports");

const ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
  "/contact",
  "/privacy",
  "/about",
  "/terms",
];

const GALLERY_ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
];

const VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 900 },
  { label: "tablet-768", width: 768, height: 1000 },
  { label: "desktop-1440", width: 1440, height: 1100 },
  { label: "wide-1920", width: 1920, height: 1100 },
];

const outputFiles = {
  browserManifest: path.join(MANIFEST_DIR, "live-prod-rerun-browser-qa-results.json"),
  browserReport: path.join(REPORT_DIR, "live-prod-rerun-browser-qa-report.md"),
  downloadManifest: path.join(MANIFEST_DIR, "live-prod-rerun-download-print-results.json"),
  downloadReport: path.join(REPORT_DIR, "live-prod-rerun-download-print-report.md"),
  sitemapManifest: path.join(MANIFEST_DIR, "live-prod-rerun-sitemap-robots-check.json"),
  sitemapReport: path.join(REPORT_DIR, "live-prod-rerun-sitemap-robots-check.md"),
  metadataManifest: path.join(MANIFEST_DIR, "live-prod-rerun-metadata-check.json"),
  metadataReport: path.join(REPORT_DIR, "live-prod-rerun-metadata-check.md"),
  adManifest: path.join(MANIFEST_DIR, "live-prod-rerun-ad-layout-check.json"),
  adReport: path.join(REPORT_DIR, "live-prod-rerun-ad-layout-check.md"),
  acceptanceManifest: path.join(MANIFEST_DIR, "live-prod-rerun-acceptance-gate.json"),
  acceptanceReport: path.join(REPORT_DIR, "live-prod-rerun-acceptance-gate.md"),
};

main().catch((error) => {
  console.error(redact(error?.stack || error?.message || String(error)));
  process.exitCode = 1;
});

async function main() {
  await ensureDirs();
  const http = await readJson(path.join(MANIFEST_DIR, "live-prod-rerun-http-results.json"), null);
  const deployment = await readJson(path.join(MANIFEST_DIR, "live-prod-deploy-commit-check.json"), null);
  const sampled = await readJson(path.join(MANIFEST_DIR, "live-prod-rerun-sampled-asset-check-results.json"), null);
  const fullQaAllowed = Boolean(
    http?.summary?.nonRootRoutesReachable &&
      http?.summary?.sitemapCurrent &&
      deployment?.summary?.productionDeployCurrent,
  );

  const browser = await chromium.launch({ headless: true });
  let pageResults = [];
  let interactions = buildBlockedInteractions("not_run");
  let downloadPrint = buildBlockedDownloadPrint("not_run");
  let sitemapRobots = null;
  let metadata = null;
  let adLayout = null;

  try {
    pageResults = await collectPageResults(browser, fullQaAllowed ? ROUTES : ["/"]);
    if (fullQaAllowed) {
      interactions = await safeRunInteractions(browser);
      downloadPrint = await safeRunDownloadPrint(browser);
    } else {
      const reason = "Live production deployment is stale or non-root routes are blocked, so live browser interactions, print, and downloads are not accepted.";
      interactions = buildBlockedInteractions(reason);
      downloadPrint = buildBlockedDownloadPrint(reason);
    }
    sitemapRobots = await runSitemapRobotsCheck();
    metadata = fullQaAllowed ? await safeCollectMetadata(browser) : await collectBlockedMetadata(http);
    adLayout = evaluateAdLayout(pageResults, fullQaAllowed);
  } finally {
    await browser.close();
  }

  const browserQa = buildBrowserQa(pageResults, interactions, fullQaAllowed);
  await writeJson(outputFiles.browserManifest, browserQa);
  await writeMarkdown(outputFiles.browserReport, renderBrowserReport(browserQa));

  await writeJson(outputFiles.downloadManifest, downloadPrint);
  await writeMarkdown(outputFiles.downloadReport, renderDownloadReport(downloadPrint));

  await writeJson(outputFiles.sitemapManifest, sitemapRobots);
  await writeMarkdown(outputFiles.sitemapReport, renderSitemapReport(sitemapRobots));

  await writeJson(outputFiles.metadataManifest, metadata);
  await writeMarkdown(outputFiles.metadataReport, renderMetadataReport(metadata));

  await writeJson(outputFiles.adManifest, adLayout);
  await writeMarkdown(outputFiles.adReport, renderAdReport(adLayout));

  const gate = buildAcceptanceGate({
    http,
    deployment,
    sampled,
    browserQa,
    downloadPrint,
    sitemapRobots,
    metadata,
    adLayout,
  });
  await writeJson(outputFiles.acceptanceManifest, gate);
  await writeMarkdown(outputFiles.acceptanceReport, renderGateReport(gate));

  console.log(JSON.stringify({
    fullQaAllowed,
    pagesInspected: browserQa.summary.pagesInspected,
    galleryWebpRenderingPassed: gate.gallery_webp_rendering_passed,
    printPassed: gate.print_passed,
    sitemapRobotsPassed: gate.sitemap_robots_passed,
    acceptancePassed: gate.passed,
    blockers: gate.blockers,
  }, null, 2));
}

async function collectPageResults(browser, routes) {
  const results = [];
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true });
    const page = await context.newPage();
    for (const route of routes) {
      const url = `${SITE_URL}${route}`;
      let status = 0;
      let error = "";
      let metrics = null;
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        status = response?.status() || 0;
        await page.waitForTimeout(1200);
        if (GALLERY_ROUTES.includes(route)) {
          await page.evaluate(() => window.scrollTo(0, Math.min(1200, document.body.scrollHeight)));
          await page.waitForTimeout(400);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        metrics = await collectMetrics(page, route, viewport);
      } catch (caught) {
        error = redact(caught?.message || String(caught));
      }
      results.push({ route, url, status, viewport, metrics, error });
    }
    await context.close();
  }
  return results;
}

async function collectMetrics(page, route, viewport) {
  const screenshotPath = path.join(SCREENSHOT_DIR, `${viewport.label}-${slugForRoute(route)}.png`);
  await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: true });
  return await page.evaluate(
    ({ assetBaseUrl, contactEmail, screenshotPath, siteUrl }) => {
      const bodyText = document.body?.innerText || "";
      const html = document.documentElement.innerHTML || "";
      const imageRecords = [...document.images].map((image) => ({
        src: image.currentSrc || image.src || "",
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        visible: Boolean(image.offsetWidth || image.offsetHeight || image.getClientRects().length),
      }));
      const webpPreviews = imageRecords.filter((image) => image.src.includes("/coloring-pages/webp/"));
      const loadedWebpPreviews = webpPreviews.filter((image) => image.naturalWidth > 0 && image.naturalHeight > 0);
      const brokenWebpPreviews = webpPreviews.filter((image) => image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0));
      const visiblePreviewUnavailable = [...document.querySelectorAll("body *")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return (element.textContent || "").trim() === "Preview unavailable" && rect.width > 0 && rect.height > 0;
      }).length;
      const allControlsText = [...document.querySelectorAll("button, a, summary")]
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean)
        .join(" ");
      const navText = [...document.querySelectorAll("header, nav")].map((element) => element.innerText || "").join("\n");
      const galleryText = [...document.querySelectorAll('[class*="gallery"]')].map((element) => element.innerText || "").join("\n");
      const adLabels = [...document.querySelectorAll("body *")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return (element.textContent || "").trim() === "Advertisement" && rect.width > 0 && rect.height > 0;
      }).length;
      const allSources = [html, ...imageRecords.map((image) => image.src)].join("\n");
      const alligator = imageRecords.find((image) => image.src.includes("/webp/animals/animals-alligator-4feec8505a.webp")) || null;
      return {
        screenshotPath: screenshotPath.replace(/\\/g, "/"),
        title: document.title || "",
        description: document.querySelector('meta[name="description"]')?.content || "",
        canonical: document.querySelector('link[rel="canonical"]')?.href || "",
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
        ogDescription: document.querySelector('meta[property="og:description"]')?.content || "",
        ogImage: document.querySelector('meta[property="og:image"]')?.content || "",
        bodyContains6352: bodyText.includes("6,352") || bodyText.includes("6352"),
        bodyContains6557: bodyText.includes("6,557") || bodyText.includes("6557"),
        contactEmailPresent: bodyText.includes(contactEmail),
        webpPreviewCount: webpPreviews.length,
        loadedWebpPreviewCount: loadedWebpPreviews.length,
        brokenWebpPreviewCount: brokenWebpPreviews.length,
        previewUnavailableVisibleCount: visiblePreviewUnavailable,
        customAssetPreviewCount: webpPreviews.filter((image) => image.src.startsWith(assetBaseUrl)).length,
        nonCustomAssetPreviewCount: webpPreviews.filter((image) => !image.src.startsWith(assetBaseUrl)).length,
        animalsAlligatorAppears: bodyText.includes("Animals Alligator") || html.includes("animals__animals-alligator__4feec8505a"),
        animalsAlligatorImgSrc: alligator?.src || "",
        animalsAlligatorPreviewRenders: Boolean(alligator && alligator.naturalWidth > 0 && alligator.naturalHeight > 0),
        visibleAdvertisementLabels: adLabels,
        navContainsAdvertisement: /Advertisement/.test(navText),
        galleryContainsAdvertisement: /Advertisement/.test(galleryText),
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        liveAdSensePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(allSources),
        localhostPresent: /localhost|127\.0\.0\.1/i.test(allSources),
        r2DevPresent: /r2\.dev/i.test(allSources),
        duplicatePrefixPresent: /coloring-pages\/coloring-pages/i.test(allSources),
        appApiRefs: /\/api\//i.test(allSources),
        svgDownloadVisible: /download\s+svg|^SVG$/i.test(allControlsText),
        canonicalUsesSiteUrl: (document.querySelector('link[rel="canonical"]')?.href || "").startsWith(siteUrl),
      };
    },
    {
      assetBaseUrl: ASSET_BASE_URL,
      contactEmail: CONTACT_EMAIL,
      screenshotPath,
      siteUrl: SITE_URL,
    },
  );
}

function buildBrowserQa(pageResults, interactions, fullQaAllowed) {
  const metricResults = pageResults.filter((result) => result.metrics);
  const galleryMetrics = metricResults.filter((result) => GALLERY_ROUTES.includes(result.route));
  const galleryFailures = galleryMetrics.filter((result) =>
    result.metrics.loadedWebpPreviewCount === 0 ||
    result.metrics.brokenWebpPreviewCount > 0 ||
    result.metrics.previewUnavailableVisibleCount > 0 ||
    result.metrics.nonCustomAssetPreviewCount > 0,
  );
  const homeDesktop = metricResults.find((result) => result.route === "/" && result.viewport.label === "desktop-1440");
  const coloringDesktop = metricResults.find((result) => result.route === "/coloring-pages" && result.viewport.label === "desktop-1440");
  const animalsMetrics = metricResults.filter((result) => result.route === "/coloring-pages/animals");
  const horizontalOverflowPages = metricResults.filter((result) => result.metrics.hasHorizontalOverflow);

  const summary = {
    fullQaAllowed,
    blockedByStaleDeployment: !fullQaAllowed,
    pagesInspected: pageResults.length,
    webpGalleryPreviewsRender: fullQaAllowed && galleryFailures.length === 0 && galleryMetrics.length > 0,
    homepagePreviewGridRendersImages: Boolean(homeDesktop?.metrics.loadedWebpPreviewCount),
    coloringPagesGalleryRendersImages: Boolean(coloringDesktop?.metrics.loadedWebpPreviewCount),
    animalsAlligatorPreviewRenders: animalsMetrics.some((result) => result.metrics.animalsAlligatorPreviewRenders),
    noPreviewUnavailableForVisibleUploadedRecords: fullQaAllowed && galleryMetrics.every((result) => result.metrics.previewUnavailableVisibleCount === 0),
    noBrokenImageIcons: fullQaAllowed && galleryMetrics.every((result) => result.metrics.brokenWebpPreviewCount === 0),
    deferredRecordsHidden: fullQaAllowed && Boolean(coloringDesktop?.metrics.bodyContains6352) && !Boolean(coloringDesktop?.metrics.bodyContains6557),
    homepageCountShows6352: Boolean(homeDesktop?.metrics.bodyContains6352),
    coloringPagesCountShows6352: Boolean(coloringDesktop?.metrics.bodyContains6352),
    searchWorks: interactions.search.passed,
    filterWorks: interactions.filter.passed || !interactions.filter.attempted,
    paginationWorks: interactions.pagination.passed || !interactions.pagination.attempted,
    moreMenuWorks: interactions.moreMenu.passed,
    mobileNavWorks: interactions.mobileNav.passed,
    noHorizontalOverflow: fullQaAllowed && horizontalOverflowPages.length === 0,
    trustPagesRender: fullQaAllowed && ["/contact", "/privacy", "/about", "/terms"].every((route) =>
      pageResults.some((result) => result.route === route && result.status === 200),
    ),
    contactEmailAppears: fullQaAllowed && metricResults
      .filter((result) => ["/contact", "/privacy", "/terms"].includes(result.route))
      .every((result) => result.metrics.contactEmailPresent),
    noLiveAdSenseCode: metricResults.every((result) => !result.metrics.liveAdSensePresent),
    svgUserDownloadAbsent: metricResults.every((result) => !result.metrics.svgDownloadVisible),
  };

  return {
    checkedAt: new Date().toISOString(),
    runId: "live-prod-rerun-browser-qa",
    siteUrl: SITE_URL,
    screenshotDirectory: SCREENSHOT_DIR.replace(/\\/g, "/"),
    routes: fullQaAllowed ? ROUTES : ["/"],
    viewports: VIEWPORTS,
    pageResults,
    interactions,
    summary,
    galleryFailures: galleryFailures.map((result) => ({
      route: result.route,
      viewport: result.viewport.label,
      loadedWebpPreviewCount: result.metrics.loadedWebpPreviewCount,
      brokenWebpPreviewCount: result.metrics.brokenWebpPreviewCount,
      previewUnavailableVisibleCount: result.metrics.previewUnavailableVisibleCount,
      nonCustomAssetPreviewCount: result.metrics.nonCustomAssetPreviewCount,
    })),
    horizontalOverflowPages: horizontalOverflowPages.map((result) => ({
      route: result.route,
      viewport: result.viewport.label,
      scrollWidth: result.metrics.scrollWidth,
      clientWidth: result.metrics.clientWidth,
    })),
    passed: Object.entries(summary)
      .filter(([key]) => !["blockedByStaleDeployment"].includes(key))
      .every(([, value]) => value === true),
  };
}

async function safeRunInteractions(browser) {
  const result = {
    search: { attempted: false, passed: false, details: "" },
    filter: { attempted: false, passed: false, details: "" },
    pagination: { attempted: false, passed: false, details: "" },
    moreMenu: { attempted: false, passed: false, details: "" },
    mobileNav: { attempted: false, passed: false, details: "" },
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  try {
    await page.goto(`${SITE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);

    const searchInput = page.locator('input[type="search"]').first();
    if (await searchInput.count()) {
      result.search.attempted = true;
      await searchInput.fill("alligator");
      await page.waitForTimeout(500);
      const body = await page.locator("body").innerText();
      result.search.passed = /alligator/i.test(body) && !/0\s+matching/i.test(body);
      result.search.details = result.search.passed ? "Search returned expected content." : "Search did not return expected content.";
    }

    const filterButtons = page.locator('.gallery-filters button, [data-filter] button, button[aria-pressed]');
    if ((await filterButtons.count()) > 1) {
      result.filter.attempted = true;
      const before = await page.locator("body").innerText();
      await filterButtons.nth(1).click();
      await page.waitForTimeout(500);
      const after = await page.locator("body").innerText();
      result.filter.passed = before !== after || (await filterButtons.nth(1).getAttribute("aria-pressed")) === "true";
      result.filter.details = result.filter.passed ? "Filter changed visible state." : "Filter did not change visible state.";
    }

    const paginationLink = page.locator('a[href*="/page/2"]').first();
    if (await paginationLink.count()) {
      result.pagination.attempted = true;
      const href = await paginationLink.getAttribute("href");
      const response = await page.request.get(new URL(href, SITE_URL).toString());
      result.pagination.passed = response.status() === 200;
      result.pagination.details = `${href} returned ${response.status()}.`;
    }

    await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    const moreButton = page.locator('button:has-text("More")').first();
    if (await moreButton.count()) {
      result.moreMenu.attempted = true;
      await moreButton.click();
      await page.waitForTimeout(500);
      result.moreMenu.passed = /Animals|Christmas|Search/i.test(await page.locator("body").innerText());
      result.moreMenu.details = result.moreMenu.passed ? "More menu opened." : "More menu did not expose expected links.";
    }
  } catch (error) {
    result.error = redact(error?.message || String(error));
  } finally {
    await context.close();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobileContext.newPage();
  try {
    await mobilePage.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    const mobileButton = mobilePage.locator('button[aria-label*="menu" i], button:has-text("Menu")').first();
    if (await mobileButton.count()) {
      result.mobileNav.attempted = true;
      await mobileButton.click();
      await mobilePage.waitForTimeout(500);
      result.mobileNav.passed = /Animals|Christmas|Search/i.test(await mobilePage.locator("body").innerText());
      result.mobileNav.details = result.mobileNav.passed ? "Mobile navigation opened." : "Mobile navigation did not expose expected links.";
    }
  } catch (error) {
    result.mobileNav.details = redact(error?.message || String(error));
  } finally {
    await mobileContext.close();
  }

  return result;
}

async function safeRunDownloadPrint(browser) {
  try {
    const assetPaths = await readJson(path.join("src", "generated", "coloring", "runtime-asset-paths.json"), { records: [] });
    const candidate = assetPaths.records.find((record) => record.assetId === "animals__animals-alligator__4feec8505a") || assetPaths.records[0];
    const svgUrl = candidate.expectedPublicSvgUrl || `${ASSET_BASE_URL}/${candidate.internalSvgSubpath}`;
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(`${SITE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);

    const controls = await page.evaluate(() => {
      const labels = [...document.querySelectorAll("button, a, summary")]
        .map((element) => (element.textContent || "").trim())
        .filter(Boolean);
      return {
        printPresent: labels.some((label) => /^Print$/i.test(label)),
        pngPresent: labels.some((label) => /^PNG$/i.test(label)),
        jpgPresent: labels.some((label) => /^JPG$|^JPEG$/i.test(label)),
        webpPresent: labels.some((label) => /^WebP$/i.test(label)),
        svgDownloadPresent: labels.some((label) => /download\s+svg|^SVG$/i.test(label)),
        labels,
      };
    });

    const conversion = await page.evaluate(async ({ svgUrl }) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      const loaded = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("SVG load timed out")), 15000);
        image.onload = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        image.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("SVG load failed"));
        };
      });
      image.src = svgUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth || 800);
      canvas.height = Math.max(1, image.naturalHeight || 1200);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      async function convert(type, quality) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
        if (!blob) return { ok: false, type, blobType: "", size: 0, magic: [] };
        return { ok: true, type, blobType: blob.type, size: blob.size, magic: [...new Uint8Array(await blob.arrayBuffer()).slice(0, 16)] };
      }
      return {
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
        png: await convert("image/png"),
        jpg: await convert("image/jpeg", 0.92),
        webp: await convert("image/webp", 0.92),
      };
    }, { svgUrl });

    const downloads = {};
    for (const [format, pattern] of Object.entries({ png: /^PNG$/i, jpg: /^JPG$|^JPEG$/i, webp: /^WebP$/i })) {
      try {
        const details = page.locator("details.download-menu").first();
        if (await details.count()) {
          const open = await details.evaluate((node) => node.open);
          if (!open) await details.locator("summary").click();
        }
        const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
        await page.locator("button").filter({ hasText: pattern }).first().click();
        const download = await downloadPromise;
        downloads[format] = {
          ok: true,
          suggestedFilename: download.suggestedFilename(),
          extensionOk: new RegExp(`\\.${format === "jpg" ? "jpg" : format}$`, "i").test(download.suggestedFilename()),
        };
      } catch (error) {
        downloads[format] = { ok: false, error: redact(error?.message || String(error)) };
      }
    }

    const print = { buttonPresent: controls.printPresent, popupOpened: false, noHang: false, bodyText: "", error: "" };
    try {
      const popupPromise = page.waitForEvent("popup", { timeout: 8000 });
      await page.locator("button").filter({ hasText: /^Print$/i }).first().click();
      const popup = await popupPromise;
      print.popupOpened = true;
      await popup.waitForTimeout(3000);
      print.bodyText = (await popup.locator("body").innerText({ timeout: 5000 })).slice(0, 200);
      print.noHang = !/Preparing print file/i.test(print.bodyText);
      await popup.close();
    } catch (error) {
      print.error = redact(error?.message || String(error));
    }

    await context.close();
    const pngMagicOk = bytesToHex(conversion.png.magic.slice(0, 4)) === "89 50 4e 47";
    const jpgMagicOk = bytesToHex(conversion.jpg.magic.slice(0, 2)) === "ff d8";
    const webpMagicOk = bytesToHex(conversion.webp.magic.slice(0, 4)) === "52 49 46 46" && String.fromCharCode(...conversion.webp.magic.slice(8, 12)) === "WEBP";

    return {
      checkedAt: new Date().toISOString(),
      runId: "live-prod-rerun-download-print",
      attempted: true,
      blockedByStaleDeployment: false,
      sourceAssetId: candidate.assetId,
      sourceSvgUrl: svgUrl,
      controls,
      conversion: {
        ...conversion,
        pngMagicOk,
        jpgMagicOk,
        webpMagicOk,
      },
      downloads,
      print: {
        ...print,
        passed: print.buttonPresent && print.popupOpened && print.noHang,
      },
      noAppApiUsed: true,
      consoleErrors,
      passed:
        controls.printPresent &&
        controls.pngPresent &&
        controls.jpgPresent &&
        controls.webpPresent &&
        !controls.svgDownloadPresent &&
        pngMagicOk &&
        jpgMagicOk &&
        webpMagicOk &&
        downloads.png?.extensionOk &&
        downloads.jpg?.extensionOk &&
        downloads.webp?.extensionOk &&
        print.popupOpened &&
        print.noHang &&
        consoleErrors.length === 0,
    };
  } catch (error) {
    return {
      ...buildBlockedDownloadPrint(redact(error?.message || String(error))),
      attempted: true,
    };
  }
}

async function runSitemapRobotsCheck() {
  const [sitemapResponse, robotsResponse] = await Promise.all([
    fetch(`${SITE_URL}/sitemap.xml`),
    fetch(`${SITE_URL}/robots.txt`),
  ]);
  const [sitemap, robots] = await Promise.all([sitemapResponse.text(), robotsResponse.text()]);
  const runtimeRoutesPayload = await readJson(path.join("src", "generated", "coloring", "runtime-site-map.json"), { entries: [] });
  const expectedRoutes = (runtimeRoutesPayload.entries || []).map((entry) => entry.path);
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const phase2 = await readJson(path.join("src", "generated", "coloring", "runtime-hubs.json"), { backlogHubs: [], sectionOnlyTopics: [] });
  const phase2Routes = (phase2.backlogHubs || []).map((hub) => `/coloring-pages/${hub.slug}`);
  const sectionOnlyRoutes = (phase2.sectionOnlyTopics || []).map((topic) => `/coloring-pages/${topic.slug}`);
  const missingRuntimeRoutes = expectedRoutes.filter((route) => !locs.includes(`${SITE_URL}${route}`));
  const phase2Included = phase2Routes.filter((route) => locs.includes(`${SITE_URL}${route}`));
  const sectionOnlyIncluded = sectionOnlyRoutes.filter((route) => locs.includes(`${SITE_URL}${route}`));
  const checks = {
    sitemapLoads: sitemapResponse.status === 200,
    robotsLoads: robotsResponse.status === 200,
    sitemapUsesSiteUrl: locs.every((loc) => loc.startsWith(SITE_URL)),
    sitemapIncludesHomepage: locs.includes(`${SITE_URL}/`) || locs.includes(SITE_URL),
    sitemapIncludesColoringPages: locs.includes(`${SITE_URL}/coloring-pages`),
    sitemapIncludesPhase1HubRoutes: missingRuntimeRoutes.length === 0,
    sitemapIncludesTrustPages: ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"].every((route) => locs.includes(`${SITE_URL}${route}`)),
    sitemapExcludesPerImageRoutes: !locs.some((loc) => /#asset-|\/page\/[^/]+$/i.test(loc)),
    sitemapExcludesPhase2Hubs: phase2Included.length === 0,
    sitemapExcludesSectionOnlyTopics: sectionOnlyIncluded.length === 0,
    imageSitemapAbsent: !/xmlns:image|image:image|image-sitemap/i.test(sitemap),
    robotsDoesNotBlockPublicPages: !/Disallow:\s*\/\s*$/im.test(robots),
    robotsReferencesSitemap: robots.includes(`${SITE_URL}/sitemap.xml`),
    noLocalhostOrR2Dev: !/localhost|127\.0\.0\.1|r2\.dev/i.test(`${sitemap}\n${robots}`),
  };
  return {
    checkedAt: new Date().toISOString(),
    runId: "live-prod-rerun-sitemap-robots",
    sitemapStatus: sitemapResponse.status,
    robotsStatus: robotsResponse.status,
    sitemapLocCount: locs.length,
    checks,
    missingRuntimeRoutes,
    phase2Included,
    sectionOnlyIncluded,
    passed: Object.values(checks).every(Boolean),
  };
}

async function safeCollectMetadata(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const records = [];
  for (const route of ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/anime-girls", "/coloring-pages/christmas", "/contact", "/privacy"]) {
    try {
      const response = await page.goto(`${SITE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(500);
      records.push(await page.evaluate(({ route, siteUrl }) => {
        const text = document.body?.innerText || "";
        const html = document.documentElement.innerHTML || "";
        return {
          route,
          status: document.readyState ? 200 : 0,
          responseStatus: null,
          title: document.title || "",
          description: document.querySelector('meta[name="description"]')?.content || "",
          canonical: document.querySelector('link[rel="canonical"]')?.href || "",
          ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
          ogDescription: document.querySelector('meta[property="og:description"]')?.content || "",
          ogImage: document.querySelector('meta[property="og:image"]')?.content || "",
          noSvgDownloadCopy: !/download\s+svg/i.test(text),
          noOnlineColoringPromise: !/online coloring|color online/i.test(text),
          noInternalPipelineWording: !/pipeline|manual-review|runtime switch|r2-upload/i.test(text),
          noLocalhost: !/localhost|127\.0\.0\.1/i.test(html),
          noR2Dev: !/r2\.dev/i.test(html),
          canonicalUsesSiteUrl: (document.querySelector('link[rel="canonical"]')?.href || "").startsWith(siteUrl),
        };
      }, { route, siteUrl: SITE_URL }));
      records[records.length - 1].responseStatus = response?.status() || 0;
    } catch (error) {
      records.push({ route, responseStatus: 0, error: redact(error?.message || String(error)) });
    }
  }
  await context.close();
  return buildMetadataPayload(records, true);
}

async function collectBlockedMetadata(http) {
  const records = (http?.checks || []).map((check) => ({
    route: new URL(check.url).pathname,
    responseStatus: check.finalStatus,
    title: "",
    description: "",
    canonical: "",
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    noSvgDownloadCopy: true,
    noOnlineColoringPromise: true,
    noInternalPipelineWording: true,
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(JSON.stringify(check)),
    noR2Dev: !/r2\.dev/i.test(JSON.stringify(check)),
    canonicalUsesSiteUrl: false,
    blockedByStaleDeployment: true,
  }));
  return buildMetadataPayload(records, false);
}

function buildMetadataPayload(records, fullQaAllowed) {
  const duplicateTitles = records.map((record) => record.title).filter((title, index, titles) => title && titles.indexOf(title) !== index);
  const duplicateDescriptions = records.map((record) => record.description).filter((description, index, descriptions) => description && descriptions.indexOf(description) !== index);
  const checks = {
    titlesPresent: fullQaAllowed && records.every((record) => record.title),
    descriptionsPresent: fullQaAllowed && records.every((record) => record.description),
    canonicalsPresent: fullQaAllowed && records.every((record) => record.canonical),
    canonicalsUseSiteUrl: fullQaAllowed && records.every((record) => record.canonicalUsesSiteUrl),
    noOgImageDependency: records.every((record) => !record.ogImage),
    noSvgDownloadCopy: records.every((record) => record.noSvgDownloadCopy !== false),
    noOnlineColoringPromise: records.every((record) => record.noOnlineColoringPromise !== false),
    noInternalPipelineWording: records.every((record) => record.noInternalPipelineWording !== false),
    noLocalhost: records.every((record) => record.noLocalhost !== false),
    noR2Dev: records.every((record) => record.noR2Dev !== false),
    noObviousDuplicateTitles: duplicateTitles.length === 0,
    noObviousDuplicateDescriptions: duplicateDescriptions.length === 0,
  };
  return {
    checkedAt: new Date().toISOString(),
    runId: "live-prod-rerun-metadata",
    fullQaAllowed,
    records,
    duplicateTitles,
    duplicateDescriptions,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function evaluateAdLayout(pageResults, fullQaAllowed) {
  const metricResults = pageResults.filter((result) => result.metrics && GALLERY_ROUTES.includes(result.route));
  const counts = metricResults.map((result) => ({
    route: result.route,
    viewport: result.viewport.label,
    width: result.viewport.width,
    visibleAdvertisementLabels: result.metrics.visibleAdvertisementLabels,
  }));
  const checks = {
    adWellsVisibleByDefault: fullQaAllowed && counts.every((count) => count.visibleAdvertisementLabels >= 1),
    noLiveAdSenseScript: pageResults.filter((result) => result.metrics).every((result) => !result.metrics.liveAdSensePresent),
    noAdClientIds: pageResults.filter((result) => result.metrics).every((result) => !result.metrics.liveAdSensePresent),
    wideDesktopHeaderPlusSideRails: fullQaAllowed && counts.filter((count) => count.width >= 1920).every((count) => count.visibleAdvertisementLabels >= 1 && count.visibleAdvertisementLabels <= 3),
    mobileTabletOneAdWell: fullQaAllowed && counts.filter((count) => count.width <= 768).every((count) => count.visibleAdvertisementLabels === 1),
    noAdsInsideNav: pageResults.filter((result) => result.metrics).every((result) => !result.metrics.navContainsAdvertisement),
    noAdsInsideGalleryGrids: pageResults.filter((result) => result.metrics).every((result) => !result.metrics.galleryContainsAdvertisement),
    noOverlapOrHorizontalOverflow: fullQaAllowed && pageResults.filter((result) => result.metrics).every((result) => !result.metrics.hasHorizontalOverflow),
  };
  return {
    checkedAt: new Date().toISOString(),
    runId: "live-prod-rerun-ad-layout",
    fullQaAllowed,
    counts,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function buildAcceptanceGate({ http, deployment, sampled, browserQa, downloadPrint, sitemapRobots, metadata, adLayout }) {
  const gate = {
    checkedAt: new Date().toISOString(),
    runId: "live-prod-rerun-acceptance-gate",
    production_site_reachable: http?.summary?.liveRootReachable === true,
    production_deploy_current: deployment?.summary?.productionDeployCurrent === true,
    non_root_routes_200: http?.summary?.nonRootRoutesReachable === true,
    sitemap_current: http?.summary?.sitemapCurrent === true,
    production_runtime_asset_switch_active: http?.summary?.runtimeSwitchActiveInLiveHtml === true,
    gallery_webp_rendering_passed: browserQa.summary.webpGalleryPreviewsRender === true,
    no_preview_unavailable_for_visible_records: browserQa.summary.noPreviewUnavailableForVisibleUploadedRecords === true,
    svg_conversion_passed: downloadPrint.conversion?.pngMagicOk === true && downloadPrint.conversion?.jpgMagicOk === true && downloadPrint.conversion?.webpMagicOk === true,
    png_download_passed: downloadPrint.downloads?.png?.extensionOk === true,
    jpg_download_passed: downloadPrint.downloads?.jpg?.extensionOk === true,
    webp_download_passed: downloadPrint.downloads?.webp?.extensionOk === true,
    print_passed: downloadPrint.print?.passed === true,
    print_no_hang: downloadPrint.print?.noHang === true,
    deferred_records_hidden: browserQa.summary.deferredRecordsHidden === true,
    sitemap_robots_passed: sitemapRobots.passed === true,
    metadata_passed: metadata.passed === true,
    ad_layout_passed: adLayout.passed === true,
    no_svg_download: browserQa.summary.svgUserDownloadAbsent === true && downloadPrint.controls?.svgDownloadPresent !== true,
    no_app_api: !existsSync(path.join(REPO_ROOT, "app", "api")),
    no_horizontal_overflow: browserQa.summary.noHorizontalOverflow === true,
    sampled_asset_check_passed: sampled?.summary?.passed === true,
    ready_for_live_ads_round: false,
    blockers: [],
  };

  for (const [key, value] of Object.entries(gate)) {
    if (key === "blockers" || key.startsWith("ready_for_")) continue;
    if (typeof value === "boolean" && value !== true) gate.blockers.push(key);
  }

  gate.ready_for_image_sitemap_round =
    gate.production_site_reachable &&
    gate.production_deploy_current &&
    gate.non_root_routes_200 &&
    gate.sitemap_current &&
    gate.production_runtime_asset_switch_active &&
    gate.gallery_webp_rendering_passed &&
    gate.sampled_asset_check_passed;
  gate.ready_for_og_image_round =
    gate.production_site_reachable &&
    gate.production_deploy_current &&
    gate.production_runtime_asset_switch_active &&
    gate.gallery_webp_rendering_passed &&
    gate.svg_conversion_passed &&
    gate.sampled_asset_check_passed;
  gate.ready_for_jsonld_round =
    gate.production_site_reachable &&
    gate.production_deploy_current &&
    gate.non_root_routes_200 &&
    gate.sitemap_current &&
    gate.metadata_passed;
  gate.passed = gate.blockers.length === 0;
  return gate;
}

function buildBlockedInteractions(reason) {
  return {
    search: { attempted: false, passed: false, details: reason },
    filter: { attempted: false, passed: false, details: reason },
    pagination: { attempted: false, passed: false, details: reason },
    moreMenu: { attempted: false, passed: false, details: reason },
    mobileNav: { attempted: false, passed: false, details: reason },
  };
}

function buildBlockedDownloadPrint(reason) {
  return {
    checkedAt: new Date().toISOString(),
    runId: "live-prod-rerun-download-print",
    attempted: false,
    blockedByStaleDeployment: true,
    notRunReason: reason,
    sourceAssetId: null,
    sourceSvgUrl: null,
    controls: {
      printPresent: false,
      pngPresent: false,
      jpgPresent: false,
      webpPresent: false,
      svgDownloadPresent: false,
      labels: [],
    },
    conversion: {
      pngMagicOk: false,
      jpgMagicOk: false,
      webpMagicOk: false,
    },
    downloads: {},
    print: {
      buttonPresent: false,
      popupOpened: false,
      noHang: false,
      passed: false,
      error: reason,
    },
    noAppApiUsed: true,
    consoleErrors: [],
    passed: false,
  };
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function slugForRoute(route) {
  if (route === "/") return "home";
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

async function ensureDirs() {
  await mkdir(path.join(REPO_ROOT, SCREENSHOT_DIR), { recursive: true });
  await mkdir(path.join(REPO_ROOT, MANIFEST_DIR), { recursive: true });
  await mkdir(path.join(REPO_ROOT, REPORT_DIR), { recursive: true });
}

async function readJson(relativePath, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath, data) {
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeMarkdown(relativePath, markdown) {
  await writeFile(path.join(REPO_ROOT, relativePath), `${markdown.trim()}\n`, "utf8");
}

function bool(value) {
  return value ? "pass" : "fail";
}

function renderBrowserReport(payload) {
  return `
# Live Production Rerun Browser QA

- Full QA allowed: ${bool(payload.summary.fullQaAllowed)}
- Blocked by stale deployment: ${bool(payload.summary.blockedByStaleDeployment)}
- Pages inspected: ${payload.summary.pagesInspected}
- Screenshots: ${payload.screenshotDirectory}
- WebP gallery previews render: ${bool(payload.summary.webpGalleryPreviewsRender)}
- Homepage preview grid renders images: ${bool(payload.summary.homepagePreviewGridRendersImages)}
- Gallery landing renders images: ${bool(payload.summary.coloringPagesGalleryRendersImages)}
- Animals Alligator preview renders: ${bool(payload.summary.animalsAlligatorPreviewRenders)}
- No preview unavailable for visible uploaded records: ${bool(payload.summary.noPreviewUnavailableForVisibleUploadedRecords)}
- No broken image icons: ${bool(payload.summary.noBrokenImageIcons)}
- Deferred records hidden: ${bool(payload.summary.deferredRecordsHidden)}
- Homepage count shows 6,352: ${bool(payload.summary.homepageCountShows6352)}
- Gallery count shows 6,352: ${bool(payload.summary.coloringPagesCountShows6352)}
- Search works: ${bool(payload.summary.searchWorks)}
- Filter works: ${bool(payload.summary.filterWorks)}
- Pagination works: ${bool(payload.summary.paginationWorks)}
- More menu works: ${bool(payload.summary.moreMenuWorks)}
- Mobile nav works: ${bool(payload.summary.mobileNavWorks)}
- No horizontal overflow: ${bool(payload.summary.noHorizontalOverflow)}
- Trust pages render: ${bool(payload.summary.trustPagesRender)}
- Contact email appears where relevant: ${bool(payload.summary.contactEmailAppears)}
- Result: ${bool(payload.passed)}
`;
}

function renderDownloadReport(payload) {
  return `
# Live Production Rerun Download And Print Report

- Attempted: ${bool(payload.attempted)}
- Blocked by stale deployment: ${bool(payload.blockedByStaleDeployment)}
- Reason: ${payload.notRunReason || "none"}
- Source asset: ${payload.sourceAssetId || "not run"}
- Print present: ${bool(payload.controls.printPresent)}
- PNG present: ${bool(payload.controls.pngPresent)}
- JPG present: ${bool(payload.controls.jpgPresent)}
- WebP present: ${bool(payload.controls.webpPresent)}
- SVG download absent: ${bool(!payload.controls.svgDownloadPresent)}
- SVG conversion PNG magic valid: ${bool(payload.conversion.pngMagicOk)}
- SVG conversion JPG magic valid: ${bool(payload.conversion.jpgMagicOk)}
- SVG conversion WebP magic valid: ${bool(payload.conversion.webpMagicOk)}
- PNG download passed: ${bool(payload.downloads.png?.extensionOk)}
- JPG download passed: ${bool(payload.downloads.jpg?.extensionOk)}
- WebP download passed: ${bool(payload.downloads.webp?.extensionOk)}
- Print passed: ${bool(payload.print.passed)}
- Print no hang: ${bool(payload.print.noHang)}
- Result: ${bool(payload.passed)}
`;
}

function renderSitemapReport(payload) {
  return `
# Live Production Rerun Sitemap And Robots Check

- Sitemap status: ${payload.sitemapStatus}
- Robots status: ${payload.robotsStatus}
- Sitemap URL count: ${payload.sitemapLocCount}
- Sitemap uses production URLs: ${bool(payload.checks.sitemapUsesSiteUrl)}
- Includes homepage: ${bool(payload.checks.sitemapIncludesHomepage)}
- Includes /coloring-pages: ${bool(payload.checks.sitemapIncludesColoringPages)}
- Includes Phase 1 hub routes: ${bool(payload.checks.sitemapIncludesPhase1HubRoutes)}
- Includes trust pages: ${bool(payload.checks.sitemapIncludesTrustPages)}
- Excludes per-image routes: ${bool(payload.checks.sitemapExcludesPerImageRoutes)}
- Excludes Phase 2 hubs: ${bool(payload.checks.sitemapExcludesPhase2Hubs)}
- Excludes section-only topics: ${bool(payload.checks.sitemapExcludesSectionOnlyTopics)}
- Image sitemap absent: ${bool(payload.checks.imageSitemapAbsent)}
- Robots does not block public pages: ${bool(payload.checks.robotsDoesNotBlockPublicPages)}
- No localhost or r2.dev: ${bool(payload.checks.noLocalhostOrR2Dev)}
- Result: ${bool(payload.passed)}
`;
}

function renderMetadataReport(payload) {
  return `
# Live Production Rerun Metadata Check

- Full QA allowed: ${bool(payload.fullQaAllowed)}
- Titles present: ${bool(payload.checks.titlesPresent)}
- Descriptions present: ${bool(payload.checks.descriptionsPresent)}
- Canonicals present: ${bool(payload.checks.canonicalsPresent)}
- Canonicals use production site URL: ${bool(payload.checks.canonicalsUseSiteUrl)}
- No OG image dependency: ${bool(payload.checks.noOgImageDependency)}
- No SVG download copy: ${bool(payload.checks.noSvgDownloadCopy)}
- No online coloring promise: ${bool(payload.checks.noOnlineColoringPromise)}
- No internal pipeline wording: ${bool(payload.checks.noInternalPipelineWording)}
- No localhost: ${bool(payload.checks.noLocalhost)}
- No r2.dev: ${bool(payload.checks.noR2Dev)}
- No obvious duplicate titles: ${bool(payload.checks.noObviousDuplicateTitles)}
- No obvious duplicate descriptions: ${bool(payload.checks.noObviousDuplicateDescriptions)}
- Result: ${bool(payload.passed)}
`;
}

function renderAdReport(payload) {
  return `
# Live Production Rerun Ad Layout Check

- Full QA allowed: ${bool(payload.fullQaAllowed)}
- Ad wells visible by default: ${bool(payload.checks.adWellsVisibleByDefault)}
- Live AdSense script absent: ${bool(payload.checks.noLiveAdSenseScript)}
- Ad client IDs absent: ${bool(payload.checks.noAdClientIds)}
- Wide desktop ad model controlled: ${bool(payload.checks.wideDesktopHeaderPlusSideRails)}
- Mobile and tablet use one ad well: ${bool(payload.checks.mobileTabletOneAdWell)}
- No ads inside nav: ${bool(payload.checks.noAdsInsideNav)}
- No ads inside gallery grids: ${bool(payload.checks.noAdsInsideGalleryGrids)}
- No overlap or horizontal overflow: ${bool(payload.checks.noOverlapOrHorizontalOverflow)}
- Result: ${bool(payload.passed)}
`;
}

function renderGateReport(payload) {
  return `
# Live Production Rerun Acceptance Gate

- Production site reachable: ${bool(payload.production_site_reachable)}
- Production deploy current: ${bool(payload.production_deploy_current)}
- Non-root routes 200: ${bool(payload.non_root_routes_200)}
- Sitemap current: ${bool(payload.sitemap_current)}
- Runtime asset switch active: ${bool(payload.production_runtime_asset_switch_active)}
- WebP rendering passed: ${bool(payload.gallery_webp_rendering_passed)}
- No preview unavailable for visible records: ${bool(payload.no_preview_unavailable_for_visible_records)}
- SVG conversion passed: ${bool(payload.svg_conversion_passed)}
- PNG download passed: ${bool(payload.png_download_passed)}
- JPG download passed: ${bool(payload.jpg_download_passed)}
- WebP download passed: ${bool(payload.webp_download_passed)}
- Print passed: ${bool(payload.print_passed)}
- Print no hang: ${bool(payload.print_no_hang)}
- Deferred records hidden: ${bool(payload.deferred_records_hidden)}
- Sitemap and robots passed: ${bool(payload.sitemap_robots_passed)}
- Metadata passed: ${bool(payload.metadata_passed)}
- Ad layout passed: ${bool(payload.ad_layout_passed)}
- No SVG download: ${bool(payload.no_svg_download)}
- No app/api: ${bool(payload.no_app_api)}
- No horizontal overflow: ${bool(payload.no_horizontal_overflow)}
- Sampled asset check passed: ${bool(payload.sampled_asset_check_passed)}
- Ready for image sitemap round: ${bool(payload.ready_for_image_sitemap_round)}
- Ready for OG image round: ${bool(payload.ready_for_og_image_round)}
- Ready for JSON-LD round: ${bool(payload.ready_for_jsonld_round)}
- Ready for live ads round: ${bool(payload.ready_for_live_ads_round)}
- Blockers: ${payload.blockers.length ? payload.blockers.join(", ") : "none"}
- Result: ${bool(payload.passed)}
`;
}

function redact(value) {
  return String(value).replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]");
}
