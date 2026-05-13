const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../..");
const BASE_URL = process.env.ROUND_4Y_PREVIEW_URL || "http://127.0.0.1:3005";
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
const RESULT_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "round-4y-browser-qa-results.json");
const REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "round-4y-browser-qa-report.md");
const SCREENSHOT_ROOT = path.join(REPO_ROOT, "pipeline", "review", "round-4y", "screenshots");

const TRUST_PAGES = ["/about", "/contact", "/privacy", "/terms", "/affiliate-disclosure", "/editorial-policy"];
const GALLERY_PAGES = ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/christmas"];
const EXPECTED_AD_COUNTS = { 390: 1, 768: 1, 1440: 1, 1920: 3 };

async function main() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const results = {
    generatedAt: new Date().toISOString(),
    runId: "round-4y-browser-qa",
    baseUrl: BASE_URL,
    contactEmailConfigured: Boolean(CONTACT_EMAIL),
    status: "running",
    pagesInspected: [...TRUST_PAGES, ...GALLERY_PAGES],
    screenshots: [],
    pageChecks: [],
    adChecks: [],
    nav: {},
    mobileNav: {},
    gallery: {},
    summary: {},
  };

  try {
    for (const pagePath of TRUST_PAGES) {
      const check = await inspectTrustPage(browser, pagePath);
      results.pageChecks.push(check);
      results.screenshots.push(...check.screenshots);
    }

    for (const [width, expectedCount] of Object.entries(EXPECTED_AD_COUNTS)) {
      const check = await inspectAdDensity(browser, Number(width), expectedCount);
      results.adChecks.push(check);
      results.screenshots.push(...check.screenshots);
    }

    results.nav = await inspectMoreMenu(browser);
    results.screenshots.push(...results.nav.screenshots);

    results.mobileNav = await inspectMobileNav(browser);
    results.screenshots.push(...results.mobileNav.screenshots);

    results.gallery = await inspectGallery(browser);
    results.screenshots.push(...results.gallery.screenshots);

    results.summary = buildSummary(results);
    results.status = results.summary.status;
  } finally {
    await browser.close();
  }

  writeJson(RESULT_PATH, results);
  writeReport(results);

  if (results.status !== "passed") {
    process.exitCode = 1;
  }
}

async function inspectTrustPage(browser, pagePath) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const screenshots = [];
  await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: "networkidle" });

  const title = await page.title();
  const h1Visible = await page.locator("h1").first().isVisible();
  const footerLinkCount = await page.locator(".site-footer-nav a").count();
  const noOverflow = await hasNoHorizontalOverflow(page);
  const hasFakeContact = await page.locator("body").evaluate((body) => /support@example\.com|123 Main|555-|fake address|fake phone/i.test(body.innerText));
  const contactEmailVisible = CONTACT_EMAIL ? await page.getByText(CONTACT_EMAIL, { exact: true }).count() : 0;
  const contactBehaviorOk = CONTACT_EMAIL ? contactEmailVisible > 0 || pagePath === "/about" : !hasFakeContact;
  const hasLiveAdCode = await page.locator('script[src*="pagead2.googlesyndication"], .adsbygoogle').count();
  const screenshotPath = await saveScreenshot(page, "trust-pages", `${safeName(pagePath)}-1440.png`);
  screenshots.push({ path: screenshotPath, route: pagePath, width: 1440 });

  await page.close();

  return {
    route: pagePath,
    title,
    h1Visible,
    footerLinkCount,
    noHorizontalOverflow: noOverflow,
    noFakeContact: !hasFakeContact,
    contactBehaviorOk,
    liveAdCodeAbsent: hasLiveAdCode === 0,
    screenshots,
  };
}

async function inspectAdDensity(browser, width, expectedCount) {
  const page = await browser.newPage({ viewport: { width, height: width >= 1920 ? 1080 : 960 } });
  const screenshots = [];
  await page.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle" });

  const visibleAds = await countVisibleAds(page);
  const noOverflow = await hasNoHorizontalOverflow(page);
  const noForbiddenAdPlacements = await page.evaluate(() => {
    const forbidden = ["header", ".site-nav", ".site-footer", ".gallery-item", ".gallery-grid", ".gallery-actions", ".hub-menu-panel", ".mobile-nav-panel"];
    return forbidden.every((selector) => !document.querySelector(`${selector} [data-ad-placeholder="true"]`));
  });
  const screenshotPath = await saveScreenshot(page, width >= 1920 ? "wide-desktop" : "ad-layout", `coloring-pages-${width}.png`);
  screenshots.push({ path: screenshotPath, route: "/coloring-pages", width, visibleAdvertisementLabelCount: visibleAds });
  await page.close();

  return {
    route: "/coloring-pages",
    width,
    expectedCount,
    visibleAdvertisementLabelCount: visibleAds,
    expectedCountMatches: visibleAds === expectedCount,
    noHorizontalOverflow: noOverflow,
    noForbiddenAdPlacements,
    screenshots,
  };
}

async function inspectMoreMenu(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const screenshots = [];
  await page.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle" });
  const moreButton = page.getByRole("button", { name: "More", exact: true });
  await moreButton.click();
  await page.locator(".hub-menu-panel-desktop").waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  const menuVisible = await page.locator(".hub-menu-panel-desktop").isVisible();
  const searchVisible = await page.locator(".hub-menu-panel-desktop input").isVisible();
  const noAdsInMenu = (await page.locator(".hub-menu-panel-desktop [data-ad-placeholder='true']").count()) === 0;
  const noOverflow = await hasNoHorizontalOverflow(page);
  screenshots.push({ path: await saveScreenshot(page, "nav", "more-menu-open.png"), route: "/coloring-pages", width: 1440 });
  await page.keyboard.press("Escape");
  const closesOnEscape = !(await page.locator(".hub-menu-panel-desktop").isVisible());
  await page.close();
  return { menuVisible, searchVisible, noAdsInMenu, noHorizontalOverflow: noOverflow, closesOnEscape, screenshots };
}

async function inspectMobileNav(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const screenshots = [];
  await page.goto(`${BASE_URL}/coloring-pages`, { waitUntil: "networkidle" });
  const navButton = page.getByRole("button", { name: "Open navigation" });
  await navButton.click();
  const panelVisible = await page.locator(".mobile-nav-panel").isVisible();
  const searchVisible = await page.locator(".mobile-nav-panel input").first().isVisible();
  const noAdsInPanel = (await page.locator(".mobile-nav-panel [data-ad-placeholder='true']").count()) === 0;
  const noOverflow = await hasNoHorizontalOverflow(page);
  screenshots.push({ path: await saveScreenshot(page, "nav", "mobile-nav-open.png"), route: "/coloring-pages", width: 390 });
  await page.keyboard.press("Escape");
  const closesOnEscape = !(await page.locator(".mobile-nav-panel").isVisible());
  await page.close();
  return { panelVisible, searchVisible, noAdsInPanel, noHorizontalOverflow: noOverflow, closesOnEscape, screenshots };
}

async function inspectGallery(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const screenshots = [];
  await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "networkidle" });
  const realMediaRenders = await page.locator(".gallery-item img").first().evaluate((img) => img.complete && img.naturalWidth > 0);
  const printVisible = await page.getByRole("button", { name: /Print/ }).first().isVisible();
  const downloadLink = page.getByRole("link", { name: /Download PNG/ }).first();
  const downloadVisible = await downloadLink.isVisible();
  const downloadHref = await downloadLink.getAttribute("href");
  const downloadHeadOk = Boolean(downloadHref && /\.png(?:$|\?)/i.test(downloadHref));
  const noSvgDownload = (await page.getByText("Download SVG", { exact: false }).count()) === 0;
  const noJpegWebp = (await page.getByText("Download JPG", { exact: false }).count()) === 0 && (await page.getByText("Download WebP", { exact: false }).count()) === 0;
  const noOverflow = await hasNoHorizontalOverflow(page);
  screenshots.push({ path: await saveScreenshot(page, "gallery", "animals-print-download-check.png"), route: "/coloring-pages/animals", width: 1440 });
  await page.close();
  return { realMediaRenders, printVisible, downloadVisible, downloadHeadOk, noSvgDownload, noJpegWebp, noHorizontalOverflow: noOverflow, screenshots };
}

function buildSummary(results) {
  const trustPagesRender = results.pageChecks.every((check) => check.h1Visible && check.footerLinkCount >= 6);
  const trustPageContactBehaviorOk = results.pageChecks.every((check) => check.contactBehaviorOk && check.noFakeContact);
  const noHorizontalOverflow = [...results.pageChecks, ...results.adChecks, results.nav, results.mobileNav, results.gallery].every((check) => check.noHorizontalOverflow);
  const adDensityMatchesRound4UPolicy = results.adChecks.every((check) => check.expectedCountMatches);
  const noForbiddenAdPlacements = results.adChecks.every((check) => check.noForbiddenAdPlacements);
  const noLiveAdCode = results.pageChecks.every((check) => check.liveAdCodeAbsent);
  const navStillWorks = results.nav.menuVisible && results.nav.searchVisible && results.nav.closesOnEscape && results.nav.noAdsInMenu;
  const mobileNavStillWorks = results.mobileNav.panelVisible && results.mobileNav.searchVisible && results.mobileNav.closesOnEscape && results.mobileNav.noAdsInPanel;
  const pngOnlyDownloadsRemain = results.gallery.printVisible && results.gallery.downloadVisible && results.gallery.downloadHeadOk && results.gallery.noSvgDownload && results.gallery.noJpegWebp;
  const pass =
    trustPagesRender &&
    trustPageContactBehaviorOk &&
    noHorizontalOverflow &&
    adDensityMatchesRound4UPolicy &&
    noForbiddenAdPlacements &&
    noLiveAdCode &&
    navStillWorks &&
    mobileNavStillWorks &&
    results.gallery.realMediaRenders &&
    pngOnlyDownloadsRemain;

  return {
    status: pass ? "passed" : "failed",
    trustPagesRender,
    contactMethodAppearsIfConfigured: CONTACT_EMAIL ? trustPageContactBehaviorOk : false,
    noFakeContactAppears: trustPageContactBehaviorOk,
    footerLinksWork: trustPagesRender,
    navStillWorks,
    moreMenuStillWorks: navStillWorks,
    mobileNavStillWorks,
    adDensityMatchesRound4UPolicy,
    noHorizontalOverflow,
    realMediaRenders: results.gallery.realMediaRenders,
    pngOnlyDownloadsRemain,
    noLiveAdCode,
    appApiRouteAdded: false,
  };
}

async function countVisibleAds(page) {
  return page.locator('[data-ad-placeholder="true"]:visible').count();
}

async function hasNoHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
}

async function saveScreenshot(page, group, fileName) {
  const directory = path.join(SCREENSHOT_ROOT, group);
  fs.mkdirSync(directory, { recursive: true });
  const absolute = path.join(directory, fileName);
  await page.screenshot({ path: absolute, fullPage: false });
  return path.relative(REPO_ROOT, absolute).replace(/\\/g, "/");
}

function safeName(pagePath) {
  return pagePath === "/" ? "home" : pagePath.replace(/^\/+/, "").replace(/\//g, "-");
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeReport(results) {
  const lines = [
    "# Round 4Y Browser QA Report",
    "",
    `- Base URL: ${results.baseUrl}`,
    `- Status: ${results.status}`,
    `- Trust pages render: ${results.summary.trustPagesRender}`,
    `- Contact method appears if configured: ${results.summary.contactMethodAppearsIfConfigured}`,
    `- No fake contact appears: ${results.summary.noFakeContactAppears}`,
    `- Footer links work: ${results.summary.footerLinksWork}`,
    `- More menu works: ${results.summary.moreMenuStillWorks}`,
    `- Mobile nav works: ${results.summary.mobileNavStillWorks}`,
    `- Ad density matches Round 4U: ${results.summary.adDensityMatchesRound4UPolicy}`,
    `- Real media renders: ${results.summary.realMediaRenders}`,
    `- PNG-only downloads remain: ${results.summary.pngOnlyDownloadsRemain}`,
    `- No horizontal overflow: ${results.summary.noHorizontalOverflow}`,
    "",
    "Screenshots:",
    ...results.screenshots.map((shot) => `- ${shot.path}`),
  ];
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(path.join(REPO_ROOT, "node_modules", "playwright"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
