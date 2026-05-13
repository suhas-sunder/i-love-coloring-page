const { chromium } = require("playwright");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const SITE_URL = "https://www.ilovecoloringpage.com";
const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
const SCREENSHOT_DIR = path.join("pipeline", "review", "live-production", "screenshots");
const MANIFEST_DIR = path.join("pipeline", "manifests");
const REPORT_DIR = path.join("pipeline", "reports");

const pages = [
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

const galleryPages = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
];

const viewports = [
  { label: "mobile-390", width: 390, height: 900 },
  { label: "tablet-768", width: 768, height: 1000 },
  { label: "desktop-1440", width: 1440, height: 1100 },
  { label: "wide-1920", width: 1920, height: 1100 },
];

const outputFiles = {
  deploymentManifest: path.join(MANIFEST_DIR, "live-production-deployment-check.json"),
  deploymentReport: path.join(REPORT_DIR, "live-production-deployment-check.md"),
  browserManifest: path.join(MANIFEST_DIR, "live-production-browser-qa-results.json"),
  browserReport: path.join(REPORT_DIR, "live-production-browser-qa-report.md"),
  downloadManifest: path.join(MANIFEST_DIR, "live-production-download-print-qa-results.json"),
  downloadReport: path.join(REPORT_DIR, "live-production-download-print-qa-report.md"),
  sitemapManifest: path.join(MANIFEST_DIR, "live-production-sitemap-robots-check.json"),
  sitemapReport: path.join(REPORT_DIR, "live-production-sitemap-robots-check.md"),
  metadataManifest: path.join(MANIFEST_DIR, "live-production-metadata-check.json"),
  metadataReport: path.join(REPORT_DIR, "live-production-metadata-check.md"),
  adManifest: path.join(MANIFEST_DIR, "live-production-ad-layout-check.json"),
  adReport: path.join(REPORT_DIR, "live-production-ad-layout-check.md"),
  acceptanceManifest: path.join(MANIFEST_DIR, "live-production-acceptance-gate.json"),
  acceptanceReport: path.join(REPORT_DIR, "live-production-acceptance-gate.md"),
};

async function ensureDirs() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await mkdir(MANIFEST_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeMarkdown(filePath, markdown) {
  await writeFile(filePath, `${markdown.trim()}\n`);
}

function absoluteUrl(route) {
  return `${SITE_URL}${route}`;
}

function assetUrlFromPath(assetPath) {
  const relative = assetPath
    .replace(/^coloring-pages\//, "")
    .replace(/^\/+/, "");
  return `${ASSET_BASE_URL}/${relative}`;
}

function slugForPath(route) {
  if (route === "/") return "home";
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

function boolStatus(value) {
  return value ? "pass" : "fail";
}

function countVisibleAds(pageMetrics) {
  return pageMetrics.visibleAdvertisementLabels;
}

async function collectPageMetrics(page, route, viewport) {
  const screenshotPath = path.join(
    SCREENSHOT_DIR,
    `${viewport.label}-${slugForPath(route)}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return await page.evaluate(
    ({ expectedAssetBase, expectedSiteUrl, contactEmail, screenshotPath }) => {
      const bodyText = document.body?.innerText || "";
      const images = [...document.images].map((img) => ({
        src: img.currentSrc || img.src || "",
        complete: img.complete,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: img.alt || "",
        visible: Boolean(img.offsetWidth || img.offsetHeight || img.getClientRects().length),
      }));
      const previewImages = images.filter((image) => image.src.includes("/coloring-pages/webp/"));
      const loadedPreviewImages = previewImages.filter((image) => image.width > 0 && image.height > 0);
      const brokenPreviewImages = previewImages.filter(
        (image) => image.complete && (image.width === 0 || image.height === 0),
      );
      const visiblePreviewUnavailable = [...document.querySelectorAll("body *")].filter((el) => {
        const text = (el.textContent || "").trim();
        const rect = el.getBoundingClientRect();
        return text === "Preview unavailable" && rect.width > 0 && rect.height > 0;
      }).length;
      const allLinks = [...document.querySelectorAll("a[href]")].map((a) => a.href);
      const allSources = [
        ...images.map((image) => image.src),
        ...allLinks,
        document.documentElement.innerHTML,
      ].join("\n");
      const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
      const title = document.title || "";
      const description = document.querySelector('meta[name="description"]')?.content || "";
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || "";
      const ogDescription = document.querySelector('meta[property="og:description"]')?.content || "";
      const ogImage = document.querySelector('meta[property="og:image"]')?.content || "";
      const visibleAdvertisementLabels = [...document.querySelectorAll("body *")].filter((el) => {
        const text = (el.textContent || "").trim();
        const rect = el.getBoundingClientRect();
        return text === "Advertisement" && rect.width > 0 && rect.height > 0;
      }).length;
      const navText = [...document.querySelectorAll("nav, header")].map((el) => el.innerText || "").join("\n");
      const galleryText = [...document.querySelectorAll('[class*="gallery"], [data-testid*="gallery"]')]
        .map((el) => el.innerText || "")
        .join("\n");
      const appApiRefs = allSources.includes("/api/");
      const svgDownloadVisible = /download\s+svg/i.test(bodyText) || /\bsvg\b/i.test(
        [...document.querySelectorAll("button, a, summary")]
          .map((el) => (el.textContent || "").trim())
          .join(" "),
      );
      const downloadLabels = [...document.querySelectorAll("button, a, summary")]
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHorizontalOverflow = scrollWidth > clientWidth + 1;
      const linksToAssetBase = allSources.includes(expectedAssetBase);
      const leakedValues = {
        localhost: /localhost|127\.0\.0\.1/i.test(allSources),
        r2Dev: /r2\.dev/i.test(allSources),
        privateR2Endpoint: /r2\.cloudflarestorage\.com/i.test(allSources),
        duplicatePrefix: /coloring-pages\/coloring-pages/i.test(allSources),
        sourcePath: /D:\\|images\/|ilovesvg\//i.test(allSources),
        liveAds: /pagead2\.googlesyndication\.com|ca-pub-/i.test(allSources),
      };
      return {
        screenshotPath,
        title,
        description,
        canonical,
        ogTitle,
        ogDescription,
        ogImage,
        statusText: bodyText.slice(0, 1500),
        bodyContains6352: bodyText.includes("6,352") || bodyText.includes("6352"),
        bodyContains6557: bodyText.includes("6,557") || bodyText.includes("6557"),
        contactEmailPresent: bodyText.includes(contactEmail),
        previewImageCount: previewImages.length,
        loadedPreviewImageCount: loadedPreviewImages.length,
        brokenPreviewImageCount: brokenPreviewImages.length,
        previewUnavailableVisibleCount: visiblePreviewUnavailable,
        customAssetPreviewCount: previewImages.filter((image) => image.src.startsWith(expectedAssetBase)).length,
        nonCustomAssetPreviewCount: previewImages.filter((image) => !image.src.startsWith(expectedAssetBase)).length,
        visibleAdvertisementLabels,
        navContainsAdvertisement: /Advertisement/.test(navText),
        galleryContainsAdvertisement: /Advertisement/.test(galleryText),
        hasHorizontalOverflow,
        scrollWidth,
        clientWidth,
        linksToAssetBase,
        leakedValues,
        appApiRefs,
        svgDownloadVisible,
        downloadLabels,
        canonicalUsesSiteUrl: canonical.startsWith(expectedSiteUrl),
      };
    },
    {
      expectedAssetBase: ASSET_BASE_URL,
      expectedSiteUrl: SITE_URL,
      contactEmail: CONTACT_EMAIL,
      screenshotPath: screenshotPath.replace(/\\/g, "/"),
    },
  );
}

async function runInteractionChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const result = {
    search: { attempted: false, passed: false, details: "" },
    filter: { attempted: false, passed: false, details: "" },
    pagination: { attempted: false, passed: false, details: "" },
    moreMenu: { attempted: false, passed: false, details: "" },
    mobileNav: { attempted: false, passed: false, details: "" },
  };

  await page.goto(absoluteUrl("/coloring-pages/animals"), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const searchInput = page.locator('input[type="search"]').first();
  if (await searchInput.count()) {
    result.search.attempted = true;
    await searchInput.fill("alligator");
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText();
    result.search.passed = /alligator/i.test(body) && !/0\s+matching/i.test(body);
    result.search.details = result.search.passed ? "Search returned alligator content." : "Search did not return expected alligator content.";
  } else {
    result.search.details = "No search input found.";
  }

  const filterButtons = page.locator('.gallery-filters button, [data-filter] button, button[aria-pressed]');
  const filterButtonCount = await filterButtons.count();
  if (filterButtonCount > 1) {
    result.filter.attempted = true;
    const before = await page.locator("body").innerText();
    await filterButtons.nth(1).click();
    await page.waitForTimeout(500);
    const after = await page.locator("body").innerText();
    result.filter.passed = before !== after || (await filterButtons.nth(1).getAttribute("aria-pressed")) === "true";
    result.filter.details = result.filter.passed ? "Filter interaction changed the results state." : "Filter interaction did not change visible state.";
  } else {
    result.filter.details = "No filter controls found on sampled hub.";
  }

  const paginationLink = page.locator('a[href*="/page/2"]').first();
  if (await paginationLink.count()) {
    result.pagination.attempted = true;
    const href = await paginationLink.getAttribute("href");
    const response = await page.request.get(new URL(href, SITE_URL).toString());
    result.pagination.passed = response.status() === 200;
    result.pagination.details = `${href} returned ${response.status()}.`;
  } else {
    result.pagination.details = "No page 2 pagination link found on sampled hub.";
  }

  await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  const moreButton = page.locator('button:has-text("More")').first();
  if (await moreButton.count()) {
    result.moreMenu.attempted = true;
    await moreButton.click();
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText();
    result.moreMenu.passed = /Animals|Christmas|Search/i.test(body);
    result.moreMenu.details = result.moreMenu.passed ? "More menu opened with hub navigation." : "More menu did not expose expected navigation.";
  } else {
    result.moreMenu.details = "No More menu button found.";
  }

  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await mobilePage.waitForTimeout(1000);
  const mobileButton = mobilePage.locator('button[aria-label*="menu" i], button:has-text("Menu")').first();
  if (await mobileButton.count()) {
    result.mobileNav.attempted = true;
    await mobileButton.click();
    await mobilePage.waitForTimeout(500);
    const body = await mobilePage.locator("body").innerText();
    result.mobileNav.passed = /Animals|Christmas|Search/i.test(body);
    result.mobileNav.details = result.mobileNav.passed ? "Mobile navigation opened with hub access." : "Mobile navigation did not expose expected hub access.";
  } else {
    result.mobileNav.details = "No mobile menu button found.";
  }
  await mobileContext.close();

  return result;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

async function runDownloadAndPrintChecks(browser) {
  const runtimePaths = await readJson(path.join("src", "generated", "coloring", "runtime-asset-paths.json"), []);
  const candidate = runtimePaths.find((record) => record.assetId.includes("alligator")) || runtimePaths[0];
  const svgUrl = assetUrlFromPath(candidate.svgPath);
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  await page.goto(absoluteUrl("/coloring-pages/animals"), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const controls = await page.evaluate(() => {
    const labels = [...document.querySelectorAll("button, a, summary")]
      .map((el) => (el.textContent || "").trim())
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
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(true);
      image.onerror = () => reject(new Error("SVG image failed to load for canvas conversion."));
    });
    image.src = svgUrl;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.min(1200, image.naturalWidth || 1200));
    canvas.height = Math.max(1, Math.min(1200, image.naturalHeight || 1200));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    async function convert(type, quality) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
      if (!blob) {
        return { type, ok: false, blobType: "", size: 0, magic: [] };
      }
      const bytes = [...new Uint8Array(await blob.arrayBuffer()).slice(0, 16)];
      return { type, ok: true, blobType: blob.type, size: blob.size, magic: bytes };
    }

    return {
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      png: await convert("image/png"),
      jpg: await convert("image/jpeg", 0.92),
      webp: await convert("image/webp", 0.92),
    };
  }, { svgUrl });

  const downloadAttempts = {};
  const selectors = {
    png: /^PNG$/i,
    jpg: /^JPG$|^JPEG$/i,
    webp: /^WebP$/i,
  };

  for (const [format, pattern] of Object.entries(selectors)) {
    try {
      const details = page.locator("details").first();
      if (await details.count()) {
        const isOpen = await details.evaluate((node) => node.open);
        if (!isOpen) await details.locator("summary").click();
      }
      const button = page.locator("button").filter({ hasText: pattern }).first();
      const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
      await button.click();
      const download = await downloadPromise;
      downloadAttempts[format] = {
        ok: true,
        suggestedFilename: download.suggestedFilename(),
        extensionOk: new RegExp(`\\.${format === "jpg" ? "jpg" : format}$`, "i").test(download.suggestedFilename()),
      };
    } catch (error) {
      downloadAttempts[format] = {
        ok: false,
        error: error.message.replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]"),
      };
    }
  }

  let printPopupOpened = false;
  let printClickError = "";
  try {
    const printButton = page.locator("button").filter({ hasText: /^Print$/i }).first();
    const popupPromise = page.waitForEvent("popup", { timeout: 8000 });
    await printButton.click();
    const popup = await popupPromise;
    printPopupOpened = true;
    await popup.close();
  } catch (error) {
    printClickError = error.message.replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]");
  }

  await context.close();

  const pngMagicOk = bytesToHex(conversion.png.magic.slice(0, 4)) === "89 50 4e 47";
  const jpgMagicOk = bytesToHex(conversion.jpg.magic.slice(0, 2)) === "ff d8";
  const webpMagicOk =
    bytesToHex(conversion.webp.magic.slice(0, 4)) === "52 49 46 46" &&
    String.fromCharCode(...conversion.webp.magic.slice(8, 12)) === "WEBP";

  return {
    checkedAt: new Date().toISOString(),
    sourceAssetId: candidate.assetId,
    sourceSvgUrl: svgUrl,
    controls,
    conversion: {
      ...conversion,
      pngMagicOk,
      jpgMagicOk,
      webpMagicOk,
    },
    downloadAttempts,
    print: {
      buttonPresent: controls.printPresent,
      popupOpened: printPopupOpened,
      conversionReady: pngMagicOk,
      passed: controls.printPresent && (printPopupOpened || pngMagicOk),
      error: printClickError,
    },
    passed:
      controls.printPresent &&
      controls.pngPresent &&
      controls.jpgPresent &&
      controls.webpPresent &&
      !controls.svgDownloadPresent &&
      conversion.png.ok &&
      conversion.jpg.ok &&
      conversion.webp.ok &&
      pngMagicOk &&
      jpgMagicOk &&
      webpMagicOk &&
      downloadAttempts.png?.extensionOk &&
      downloadAttempts.jpg?.extensionOk &&
      downloadAttempts.webp?.extensionOk,
  };
}

async function runSitemapRobotsCheck() {
  const [sitemapResponse, robotsResponse] = await Promise.all([
    fetch(`${SITE_URL}/sitemap.xml`),
    fetch(`${SITE_URL}/robots.txt`),
  ]);
  const [sitemap, robots] = await Promise.all([
    sitemapResponse.text(),
    robotsResponse.text(),
  ]);
  const runtimeRoutes = await readJson(path.join("src", "generated", "coloring", "runtime-routes.json"), []);
  const phase2 = await readJson(path.join("pipeline", "manifests", "round-4a-phase-2-hub-backlog.json"), { hubs: [] });
  const phase2Routes = Array.isArray(phase2.hubs)
    ? phase2.hubs.map((hub) => `/coloring-pages/${hub.slug}`).filter(Boolean)
    : [];

  const phase2Included = phase2Routes.filter((route) => sitemap.includes(`${SITE_URL}${route}`));
  const sampleRuntimeRoutesMissing = runtimeRoutes
    .slice(0, 25)
    .map((route) => route.path)
    .filter((route) => route && !sitemap.includes(`${SITE_URL}${route}`));

  const checks = {
    sitemapLoads: sitemapResponse.status === 200,
    robotsLoads: robotsResponse.status === 200,
    sitemapUsesSiteUrl: sitemap.includes(SITE_URL),
    sitemapIncludesHome: sitemap.includes(`<loc>${SITE_URL}/</loc>`) || sitemap.includes(`<loc>${SITE_URL}</loc>`),
    sitemapIncludesColoringPages: sitemap.includes(`${SITE_URL}/coloring-pages`),
    sitemapIncludesTrustPages:
      sitemap.includes(`${SITE_URL}/contact`) &&
      sitemap.includes(`${SITE_URL}/privacy`) &&
      sitemap.includes(`${SITE_URL}/about`) &&
      sitemap.includes(`${SITE_URL}/terms`),
    sitemapExcludesPerImageRoutes: !/\/coloring-pages\/[^<]+\/[a-z0-9_-]{8,}/i.test(sitemap),
    sitemapExcludesPhase2: phase2Included.length === 0,
    imageSitemapAbsent: !/xmlns:image|image:image|image-sitemap/i.test(sitemap),
    robotsAllowsPublic: !/Disallow:\s*\/\s*$/im.test(robots),
    robotsReferencesSitemap: robots.includes(`${SITE_URL}/sitemap.xml`),
    noLocalhost: !/localhost|127\.0\.0\.1/i.test(sitemap + robots),
    noR2Dev: !/r2\.dev/i.test(sitemap + robots),
    sampleRuntimeRoutesMissing,
    phase2Included,
  };

  return {
    checkedAt: new Date().toISOString(),
    sitemapStatus: sitemapResponse.status,
    robotsStatus: robotsResponse.status,
    sitemapBytes: sitemap.length,
    robotsBytes: robots.length,
    checks,
    passed: Object.entries(checks)
      .filter(([key]) => key !== "sampleRuntimeRoutesMissing" && key !== "phase2Included")
      .every(([, value]) => value === true) && sampleRuntimeRoutesMissing.length === 0,
  };
}

async function collectMetadata(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const sampledPages = [
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/geometric",
    "/coloring-pages/anime-girls",
    "/coloring-pages/christmas",
    "/contact",
    "/privacy",
  ];
  const records = [];
  for (const route of sampledPages) {
    await page.goto(absoluteUrl(route), { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(500);
    records.push(await page.evaluate(({ route, siteUrl }) => {
      const html = document.documentElement.innerHTML;
      return {
        route,
        title: document.title || "",
        description: document.querySelector('meta[name="description"]')?.content || "",
        canonical: document.querySelector('link[rel="canonical"]')?.href || "",
        ogTitle: document.querySelector('meta[property="og:title"]')?.content || "",
        ogDescription: document.querySelector('meta[property="og:description"]')?.content || "",
        ogImage: document.querySelector('meta[property="og:image"]')?.content || "",
        hasSvgDownloadCopy: /download\s+svg/i.test(document.body?.innerText || ""),
        promisesOnlineColoring: /online coloring|color online/i.test(document.body?.innerText || ""),
        hasInternalPipelineWording: /pipeline|manual-review|r2-upload|runtime switch/i.test(document.body?.innerText || ""),
        noLocalhost: !/localhost|127\.0\.0\.1/i.test(html),
        noR2Dev: !/r2\.dev/i.test(html),
        canonicalUsesSiteUrl: (document.querySelector('link[rel="canonical"]')?.href || "").startsWith(siteUrl),
      };
    }, { route, siteUrl: SITE_URL }));
  }
  await context.close();

  const duplicateTitles = records
    .map((record) => record.title)
    .filter((title, index, titles) => title && titles.indexOf(title) !== index);
  const duplicateDescriptions = records
    .map((record) => record.description)
    .filter((description, index, descriptions) => description && descriptions.indexOf(description) !== index);

  const checks = {
    titlesPresent: records.every((record) => record.title.length > 0),
    descriptionsPresent: records.every((record) => record.description.length > 0),
    canonicalsPresent: records.every((record) => record.canonical.length > 0),
    canonicalsUseSiteUrl: records.every((record) => record.canonicalUsesSiteUrl),
    noOgImageDependency: records.every((record) => !record.ogImage),
    noSvgDownloadCopy: records.every((record) => !record.hasSvgDownloadCopy),
    noOnlineColoringPromise: records.every((record) => !record.promisesOnlineColoring),
    noInternalPipelineWording: records.every((record) => !record.hasInternalPipelineWording),
    noLocalhost: records.every((record) => record.noLocalhost),
    noR2Dev: records.every((record) => record.noR2Dev),
    noObviousDuplicateTitles: duplicateTitles.length === 0,
    noObviousDuplicateDescriptions: duplicateDescriptions.length === 0,
  };

  return {
    checkedAt: new Date().toISOString(),
    records,
    duplicateTitles,
    duplicateDescriptions,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function evaluateAdLayout(pageResults) {
  const checks = {
    visibleByDefault: true,
    noLiveAds: true,
    noNavAds: true,
    noGalleryAds: true,
    mobileTabletSingleWell: true,
    desktopControlled: true,
    wideControlled: true,
    noHorizontalOverflow: true,
  };
  const counts = [];

  for (const result of pageResults) {
    if (!galleryPages.includes(result.route)) continue;
    const adCount = countVisibleAds(result.metrics);
    counts.push({ route: result.route, viewport: result.viewport.label, adCount });
    checks.noLiveAds = checks.noLiveAds && !result.metrics.leakedValues.liveAds;
    checks.noNavAds = checks.noNavAds && !result.metrics.navContainsAdvertisement;
    checks.noGalleryAds = checks.noGalleryAds && !result.metrics.galleryContainsAdvertisement;
    checks.noHorizontalOverflow = checks.noHorizontalOverflow && !result.metrics.hasHorizontalOverflow;
    if (result.viewport.width <= 768) {
      checks.mobileTabletSingleWell = checks.mobileTabletSingleWell && adCount === 1;
    } else if (result.viewport.width < 1920) {
      checks.desktopControlled = checks.desktopControlled && adCount >= 1 && adCount <= 2;
    } else {
      checks.wideControlled = checks.wideControlled && adCount >= 1 && adCount <= 3;
    }
  }

  checks.visibleByDefault = counts.every((count) => count.adCount >= 1);
  return {
    checkedAt: new Date().toISOString(),
    counts,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

async function main() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const pageResults = [];
  let deployment = null;
  let browserQa = null;
  let downloadPrint = null;
  let sitemapRobots = null;
  let metadata = null;
  let adLayout = null;

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      for (const route of pages) {
        const url = absoluteUrl(route);
        let status = 0;
        let error = "";
        try {
          const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
          status = response?.status() || 0;
          await page.waitForTimeout(1500);
          if (galleryPages.includes(route)) {
            await page.evaluate(() => window.scrollTo(0, Math.min(1200, document.body.scrollHeight)));
            await page.waitForTimeout(750);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(500);
          }
          const metrics = await collectPageMetrics(page, route, viewport);
          pageResults.push({ route, url, status, viewport, metrics, error });
        } catch (caught) {
          error = caught.message.replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]");
          pageResults.push({ route, url, status, viewport, metrics: null, error });
        }
      }
      await context.close();
    }

    const interactionChecks = await runInteractionChecks(browser);
    downloadPrint = await runDownloadAndPrintChecks(browser);
    sitemapRobots = await runSitemapRobotsCheck();
    metadata = await collectMetadata(browser);
    adLayout = evaluateAdLayout(pageResults.filter((result) => result.metrics));

    const homeDesktop = pageResults.find((result) => result.route === "/" && result.viewport.label === "desktop-1440");
    const coloringDesktop = pageResults.find((result) => result.route === "/coloring-pages" && result.viewport.label === "desktop-1440");
    const galleryMetricResults = pageResults.filter((result) => galleryPages.includes(result.route) && result.metrics);
    const failedPageLoads = pageResults.filter((result) => result.status !== 200 || result.error);
    const leakedPages = pageResults.filter((result) => {
      if (!result.metrics) return false;
      return Object.values(result.metrics.leakedValues).some(Boolean) || result.metrics.appApiRefs;
    });
    const galleryPreviewFailures = galleryMetricResults.filter(
      (result) =>
        result.metrics.loadedPreviewImageCount === 0 ||
        result.metrics.brokenPreviewImageCount > 0 ||
        result.metrics.previewUnavailableVisibleCount > 0 ||
        result.metrics.nonCustomAssetPreviewCount > 0,
    );
    const horizontalOverflowPages = pageResults.filter((result) => result.metrics?.hasHorizontalOverflow);
    const svgDownloadPages = pageResults.filter((result) => result.metrics?.svgDownloadVisible);
    const contactPages = pageResults.filter((result) => ["/contact", "/privacy", "/terms"].includes(result.route) && result.metrics);

    deployment = {
      checkedAt: new Date().toISOString(),
      siteUrl: SITE_URL,
      assetBaseUrl: ASSET_BASE_URL,
      homeStatus: homeDesktop?.status || 0,
      coloringPagesStatus: coloringDesktop?.status || 0,
      productionSiteReachable: failedPageLoads.length === 0,
      latestRuntimeSwitchAppearsActive:
        Boolean(coloringDesktop?.metrics?.bodyContains6352) &&
        !Boolean(coloringDesktop?.metrics?.bodyContains6557) &&
        Boolean(coloringDesktop?.metrics?.linksToAssetBase),
      noLocalhostLeakage: leakedPages.every((result) => !result.metrics?.leakedValues.localhost),
      noR2DevLeakage: leakedPages.every((result) => !result.metrics?.leakedValues.r2Dev),
      noPrivateR2EndpointLeakage: leakedPages.every((result) => !result.metrics?.leakedValues.privateR2Endpoint),
      noAppApiReferences: leakedPages.every((result) => !result.metrics?.appApiRefs),
      noSvgDownloadLabelsOrLinks: svgDownloadPages.length === 0,
      noLiveAdSenseCode: leakedPages.every((result) => !result.metrics?.leakedValues.liveAds),
      noSourcePathLeakage: leakedPages.every((result) => !result.metrics?.leakedValues.sourcePath),
      noDuplicateAssetPrefix: leakedPages.every((result) => !result.metrics?.leakedValues.duplicatePrefix),
      canonicalUrlsUseSiteUrl: pageResults.filter((result) => result.metrics).every((result) => result.metrics.canonicalUsesSiteUrl),
      footerTrustLinksWork: ["/contact", "/privacy", "/about", "/terms"].every((route) =>
        pageResults.some((result) => result.route === route && result.status === 200),
      ),
      contactEmailAppears: contactPages.every((result) => result.metrics.contactEmailPresent || result.route === "/about"),
      failedPageLoads,
      leakedPages: leakedPages.map((result) => ({
        route: result.route,
        viewport: result.viewport.label,
        leakedValues: result.metrics.leakedValues,
        appApiRefs: result.metrics.appApiRefs,
      })),
    };
    deployment.passed = [
      deployment.productionSiteReachable,
      deployment.latestRuntimeSwitchAppearsActive,
      deployment.noLocalhostLeakage,
      deployment.noR2DevLeakage,
      deployment.noPrivateR2EndpointLeakage,
      deployment.noAppApiReferences,
      deployment.noSvgDownloadLabelsOrLinks,
      deployment.noLiveAdSenseCode,
      deployment.noSourcePathLeakage,
      deployment.noDuplicateAssetPrefix,
      deployment.canonicalUrlsUseSiteUrl,
      deployment.footerTrustLinksWork,
      deployment.contactEmailAppears,
    ].every(Boolean);

    browserQa = {
      checkedAt: new Date().toISOString(),
      siteUrl: SITE_URL,
      pages,
      viewports,
      screenshotsDirectory: SCREENSHOT_DIR.replace(/\\/g, "/"),
      pageResults,
      interactionChecks,
      summary: {
        webpGalleryPreviewsRender: galleryPreviewFailures.length === 0,
        noPreviewUnavailableVisible: galleryMetricResults.every((result) => result.metrics.previewUnavailableVisibleCount === 0),
        noBrokenImageIcons: galleryMetricResults.every((result) => result.metrics.brokenPreviewImageCount === 0),
        deferredRecordsHidden: Boolean(coloringDesktop?.metrics?.bodyContains6352) && !Boolean(coloringDesktop?.metrics?.bodyContains6557),
        homepageCountShows6352: Boolean(homeDesktop?.metrics?.bodyContains6352),
        coloringPagesCountShows6352: Boolean(coloringDesktop?.metrics?.bodyContains6352),
        searchWorks: interactionChecks.search.passed,
        filterWorks: interactionChecks.filter.passed || !interactionChecks.filter.attempted,
        paginationWorks: interactionChecks.pagination.passed || !interactionChecks.pagination.attempted,
        moreMenuWorks: interactionChecks.moreMenu.passed,
        mobileNavWorks: interactionChecks.mobileNav.passed,
        noHorizontalOverflow: horizontalOverflowPages.length === 0,
        trustPagesRender: ["/contact", "/privacy", "/about", "/terms"].every((route) =>
          pageResults.some((result) => result.route === route && result.status === 200),
        ),
        contactEmailAppears: deployment.contactEmailAppears,
        svgUserDownloadAbsent: svgDownloadPages.length === 0 && !downloadPrint.controls.svgDownloadPresent,
      },
      galleryPreviewFailures: galleryPreviewFailures.map((result) => ({
        route: result.route,
        viewport: result.viewport.label,
        loadedPreviewImageCount: result.metrics.loadedPreviewImageCount,
        brokenPreviewImageCount: result.metrics.brokenPreviewImageCount,
        previewUnavailableVisibleCount: result.metrics.previewUnavailableVisibleCount,
        nonCustomAssetPreviewCount: result.metrics.nonCustomAssetPreviewCount,
      })),
      horizontalOverflowPages: horizontalOverflowPages.map((result) => ({
        route: result.route,
        viewport: result.viewport.label,
        scrollWidth: result.metrics.scrollWidth,
        clientWidth: result.metrics.clientWidth,
      })),
    };
    browserQa.passed = Object.values(browserQa.summary).every(Boolean);

    await writeJson(outputFiles.deploymentManifest, deployment);
    await writeMarkdown(outputFiles.deploymentReport, `
# Live Production Deployment Check

- Site: ${SITE_URL}
- Asset base: ${ASSET_BASE_URL}
- Production reachable: ${boolStatus(deployment.productionSiteReachable)}
- Runtime switch active: ${boolStatus(deployment.latestRuntimeSwitchAppearsActive)}
- No localhost leakage: ${boolStatus(deployment.noLocalhostLeakage)}
- No r2.dev leakage: ${boolStatus(deployment.noR2DevLeakage)}
- No private R2 endpoint leakage: ${boolStatus(deployment.noPrivateR2EndpointLeakage)}
- No app/api references: ${boolStatus(deployment.noAppApiReferences)}
- No SVG download labels or links: ${boolStatus(deployment.noSvgDownloadLabelsOrLinks)}
- No live AdSense code: ${boolStatus(deployment.noLiveAdSenseCode)}
- Canonicals use production site URL: ${boolStatus(deployment.canonicalUrlsUseSiteUrl)}
- Contact email appears where relevant: ${boolStatus(deployment.contactEmailAppears)}
- Result: ${boolStatus(deployment.passed)}
`);

    await writeJson(outputFiles.browserManifest, browserQa);
    await writeMarkdown(outputFiles.browserReport, `
# Live Production Browser QA

- Pages inspected: ${pages.join(", ")}
- Viewports: ${viewports.map((viewport) => viewport.label).join(", ")}
- Screenshots: ${SCREENSHOT_DIR.replace(/\\/g, "/")}
- WebP gallery previews render: ${boolStatus(browserQa.summary.webpGalleryPreviewsRender)}
- No preview unavailable states: ${boolStatus(browserQa.summary.noPreviewUnavailableVisible)}
- No broken preview images: ${boolStatus(browserQa.summary.noBrokenImageIcons)}
- Deferred records hidden: ${boolStatus(browserQa.summary.deferredRecordsHidden)}
- Homepage count shows 6,352: ${boolStatus(browserQa.summary.homepageCountShows6352)}
- Coloring pages count shows 6,352: ${boolStatus(browserQa.summary.coloringPagesCountShows6352)}
- Search works: ${boolStatus(browserQa.summary.searchWorks)}
- Filter works: ${boolStatus(browserQa.summary.filterWorks)}
- Pagination works: ${boolStatus(browserQa.summary.paginationWorks)}
- More menu works: ${boolStatus(browserQa.summary.moreMenuWorks)}
- Mobile nav works: ${boolStatus(browserQa.summary.mobileNavWorks)}
- No horizontal overflow: ${boolStatus(browserQa.summary.noHorizontalOverflow)}
- Trust pages render: ${boolStatus(browserQa.summary.trustPagesRender)}
- Result: ${boolStatus(browserQa.passed)}
`);

    await writeJson(outputFiles.downloadManifest, downloadPrint);
    await writeMarkdown(outputFiles.downloadReport, `
# Live Production Download And Print QA

- Source asset: ${downloadPrint.sourceAssetId}
- Source SVG URL: ${downloadPrint.sourceSvgUrl}
- Print control present: ${boolStatus(downloadPrint.controls.printPresent)}
- PNG control present: ${boolStatus(downloadPrint.controls.pngPresent)}
- JPG control present: ${boolStatus(downloadPrint.controls.jpgPresent)}
- WebP control present: ${boolStatus(downloadPrint.controls.webpPresent)}
- SVG download absent: ${boolStatus(!downloadPrint.controls.svgDownloadPresent)}
- PNG conversion magic bytes valid: ${boolStatus(downloadPrint.conversion.pngMagicOk)}
- JPG conversion magic bytes valid: ${boolStatus(downloadPrint.conversion.jpgMagicOk)}
- WebP conversion magic bytes valid: ${boolStatus(downloadPrint.conversion.webpMagicOk)}
- PNG download extension valid: ${boolStatus(downloadPrint.downloadAttempts.png?.extensionOk)}
- JPG download extension valid: ${boolStatus(downloadPrint.downloadAttempts.jpg?.extensionOk)}
- WebP download extension valid: ${boolStatus(downloadPrint.downloadAttempts.webp?.extensionOk)}
- Print passed: ${boolStatus(downloadPrint.print.passed)}
- Result: ${boolStatus(downloadPrint.passed)}
`);

    await writeJson(outputFiles.sitemapManifest, sitemapRobots);
    await writeMarkdown(outputFiles.sitemapReport, `
# Live Production Sitemap And Robots Check

- Sitemap status: ${sitemapRobots.sitemapStatus}
- Robots status: ${sitemapRobots.robotsStatus}
- Sitemap uses production URLs: ${boolStatus(sitemapRobots.checks.sitemapUsesSiteUrl)}
- Includes homepage and /coloring-pages: ${boolStatus(sitemapRobots.checks.sitemapIncludesHome && sitemapRobots.checks.sitemapIncludesColoringPages)}
- Includes trust pages: ${boolStatus(sitemapRobots.checks.sitemapIncludesTrustPages)}
- Excludes per-image routes: ${boolStatus(sitemapRobots.checks.sitemapExcludesPerImageRoutes)}
- Excludes Phase 2 routes: ${boolStatus(sitemapRobots.checks.sitemapExcludesPhase2)}
- Image sitemap absent: ${boolStatus(sitemapRobots.checks.imageSitemapAbsent)}
- Robots allows public pages: ${boolStatus(sitemapRobots.checks.robotsAllowsPublic)}
- No localhost or r2.dev: ${boolStatus(sitemapRobots.checks.noLocalhost && sitemapRobots.checks.noR2Dev)}
- Result: ${boolStatus(sitemapRobots.passed)}
`);

    await writeJson(outputFiles.metadataManifest, metadata);
    await writeMarkdown(outputFiles.metadataReport, `
# Live Production Metadata Check

- Titles present: ${boolStatus(metadata.checks.titlesPresent)}
- Descriptions present: ${boolStatus(metadata.checks.descriptionsPresent)}
- Canonicals present: ${boolStatus(metadata.checks.canonicalsPresent)}
- Canonicals use production site URL: ${boolStatus(metadata.checks.canonicalsUseSiteUrl)}
- No OG image dependency: ${boolStatus(metadata.checks.noOgImageDependency)}
- No SVG download copy: ${boolStatus(metadata.checks.noSvgDownloadCopy)}
- No online coloring promise: ${boolStatus(metadata.checks.noOnlineColoringPromise)}
- No internal pipeline wording: ${boolStatus(metadata.checks.noInternalPipelineWording)}
- No obvious duplicate hub metadata: ${boolStatus(metadata.checks.noObviousDuplicateTitles && metadata.checks.noObviousDuplicateDescriptions)}
- Result: ${boolStatus(metadata.passed)}
`);

    await writeJson(outputFiles.adManifest, adLayout);
    await writeMarkdown(outputFiles.adReport, `
# Live Production Ad Layout Check

- Ad wells visible by default: ${boolStatus(adLayout.checks.visibleByDefault)}
- Live AdSense code absent: ${boolStatus(adLayout.checks.noLiveAds)}
- No ads in nav: ${boolStatus(adLayout.checks.noNavAds)}
- No ads inside gallery containers: ${boolStatus(adLayout.checks.noGalleryAds)}
- Mobile and tablet use one well: ${boolStatus(adLayout.checks.mobileTabletSingleWell)}
- Desktop ad count controlled: ${boolStatus(adLayout.checks.desktopControlled)}
- Wide desktop ad count controlled: ${boolStatus(adLayout.checks.wideControlled)}
- No horizontal overflow: ${boolStatus(adLayout.checks.noHorizontalOverflow)}
- Result: ${boolStatus(adLayout.passed)}
`);

    const configAudit = await readJson(path.join(MANIFEST_DIR, "live-production-public-config-audit.json"), {});
    const noEnvBuild = await readJson(path.join(MANIFEST_DIR, "live-production-no-env-build-results.json"), {});
    const sampledAsset = await readJson(path.join(MANIFEST_DIR, "live-production-sampled-asset-check-results.json"), {});

    const blockers = [];
    const gate = {
      checkedAt: new Date().toISOString(),
      public_config_defaults_passed: configAudit.passed === true,
      build_without_public_env_passed: noEnvBuild.passed === true,
      production_site_reachable: deployment.productionSiteReachable,
      production_runtime_asset_switch_active: deployment.latestRuntimeSwitchAppearsActive,
      gallery_webp_rendering_passed: browserQa.summary.webpGalleryPreviewsRender,
      svg_conversion_passed: downloadPrint.conversion.pngMagicOk && downloadPrint.conversion.jpgMagicOk && downloadPrint.conversion.webpMagicOk,
      png_download_passed: Boolean(downloadPrint.downloadAttempts.png?.extensionOk),
      jpg_download_passed: Boolean(downloadPrint.downloadAttempts.jpg?.extensionOk),
      webp_download_passed: Boolean(downloadPrint.downloadAttempts.webp?.extensionOk),
      print_passed: downloadPrint.print.passed,
      deferred_records_hidden: browserQa.summary.deferredRecordsHidden,
      sampled_url_checks_passed: sampledAsset.passed === true,
      sitemap_robots_passed: sitemapRobots.passed,
      metadata_passed: metadata.passed,
      ad_layout_passed: adLayout.passed,
      no_svg_download: deployment.noSvgDownloadLabelsOrLinks && !downloadPrint.controls.svgDownloadPresent,
      no_app_api: deployment.noAppApiReferences,
      no_horizontal_overflow: browserQa.summary.noHorizontalOverflow,
      ready_for_live_ads_round: false,
      blockers,
    };
    for (const [key, value] of Object.entries(gate)) {
      if (key === "blockers" || key.startsWith("ready_for_")) continue;
      if (value !== true) blockers.push(key);
    }
    const corePassed = blockers.length === 0;
    gate.ready_for_image_sitemap_round = corePassed;
    gate.ready_for_og_image_round = corePassed;
    gate.ready_for_jsonld_round = corePassed;
    gate.passed = corePassed;

    await writeJson(outputFiles.acceptanceManifest, gate);
    await writeMarkdown(outputFiles.acceptanceReport, `
# Live Production Acceptance Gate

- Public config defaults passed: ${boolStatus(gate.public_config_defaults_passed)}
- Build without public env passed: ${boolStatus(gate.build_without_public_env_passed)}
- Production site reachable: ${boolStatus(gate.production_site_reachable)}
- Runtime asset switch active: ${boolStatus(gate.production_runtime_asset_switch_active)}
- WebP gallery rendering passed: ${boolStatus(gate.gallery_webp_rendering_passed)}
- SVG conversion passed: ${boolStatus(gate.svg_conversion_passed)}
- PNG download passed: ${boolStatus(gate.png_download_passed)}
- JPG download passed: ${boolStatus(gate.jpg_download_passed)}
- WebP download passed: ${boolStatus(gate.webp_download_passed)}
- Print passed: ${boolStatus(gate.print_passed)}
- Deferred records hidden: ${boolStatus(gate.deferred_records_hidden)}
- Sampled URL checks passed: ${boolStatus(gate.sampled_url_checks_passed)}
- Sitemap and robots passed: ${boolStatus(gate.sitemap_robots_passed)}
- Metadata passed: ${boolStatus(gate.metadata_passed)}
- Ad layout passed: ${boolStatus(gate.ad_layout_passed)}
- No SVG download: ${boolStatus(gate.no_svg_download)}
- No app/api: ${boolStatus(gate.no_app_api)}
- No horizontal overflow: ${boolStatus(gate.no_horizontal_overflow)}
- Ready for image sitemap round: ${boolStatus(gate.ready_for_image_sitemap_round)}
- Ready for OG image round: ${boolStatus(gate.ready_for_og_image_round)}
- Ready for JSON-LD round: ${boolStatus(gate.ready_for_jsonld_round)}
- Ready for live ads round: ${boolStatus(gate.ready_for_live_ads_round)}
- Blockers: ${blockers.length ? blockers.join(", ") : "none"}
- Result: ${boolStatus(gate.passed)}
`);

    if (!gate.passed) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message.replace(/[A-Za-z0-9+/=]{24,}/g, "[redacted]"));
  process.exit(1);
});
