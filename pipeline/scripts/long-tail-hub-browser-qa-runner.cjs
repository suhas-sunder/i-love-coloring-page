#!/usr/bin/env node

const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const RUN_ID = "long-tail-hub-browser-qa";
const DEFAULT_APP_URL = "http://127.0.0.1:3015";
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "long-tail-hubs", "screenshots");
const MANIFEST_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "long-tail-hub-browser-qa-results.json");
const REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "long-tail-hub-browser-qa-report.md");

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = normalizeUrl(args.appUrl || process.env.LONG_TAIL_APP_URL || DEFAULT_APP_URL);
  const implementation = await readJson("pipeline/manifests/long-tail-hub-implementation-results.json");
  const scores = await readJson("pipeline/manifests/long-tail-candidate-hub-scores.json");
  const routes = await readJson("src/generated/coloring/runtime-routes.json");
  const siteMap = await readJson("src/generated/coloring/runtime-site-map.json");
  const promotedSlugs = implementation.promotedHubs.map((hub) => hub.slug);
  const inspectedNewSlugs = pickNewHubSlugs(promotedSlugs);
  const inspectedRoutes = unique([
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/geometric",
    "/coloring-pages/christmas",
    "/coloring-pages/anime-girls",
    "/coloring-pages/plushies",
    ...inspectedNewSlugs.map((slug) => `/coloring-pages/${slug}`),
  ]);

  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    const payload = makeNotRunPayload(appUrl, "Playwright is not installed in this project.");
    await writeResults(payload);
    console.log(JSON.stringify({ runId: RUN_ID, status: "not_run", reason: payload.blockers[0] }, null, 2));
    return;
  }

  let server = null;
  if (!(await isReachable(`${appUrl}/coloring-pages`))) {
    server = startDevServer();
    await waitForReachable(`${appUrl}/coloring-pages`, 90_000);
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const pages = [];
  const screenshotPaths = [];
  let moreMenuCheck = null;
  let mobileNavCheck = null;

  try {
    for (const route of inspectedRoutes) {
      const page = await context.newPage();
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(500);
      await openFirstDownloadMenu(page);
      const metrics = await collectPageMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(route)}-desktop.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewport: "desktop", ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    moreMenuCheck = await runMoreMenuCheck(context, appUrl);
    screenshotPaths.push(...moreMenuCheck.screenshotPaths);
    mobileNavCheck = await runMobileNavCheck(mobileContext, appUrl);
    screenshotPaths.push(...mobileNavCheck.screenshotPaths);

    for (const route of ["/", "/coloring-pages", "/coloring-pages/t-rex"].filter((route) => inspectedRoutes.includes(route))) {
      const page = await mobileContext.newPage();
      await page.goto(`${appUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(500);
      const metrics = await collectPageMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForPath(route)}-mobile.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      pages.push({ route, viewport: "mobile", ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }
  } finally {
    await context.close();
    await mobileContext.close();
    await browser.close();
    if (server) stopDevServer(server);
  }

  const rejectedOrBacklogSlugs = new Set(
    scores.candidates
      .filter((candidate) => candidate.classification !== "promote_now")
      .map((candidate) => candidate.slug),
  );
  const sitemapPaths = new Set(siteMap.entries.map((entry) => entry.path));
  const routedPaths = new Set(routes.routes.map((route) => route.path));
  const promotedPaths = implementation.promotedHubs.map((hub) => `/coloring-pages/${hub.slug}`);

  const summary = {
    status: "completed",
    appUrl,
    pagesInspected: pages.length,
    oldBroadHubPagesChecked: pages.filter((page) => page.viewport === "desktop" && ["/coloring-pages/animals", "/coloring-pages/geometric", "/coloring-pages/christmas", "/coloring-pages/anime-girls", "/coloring-pages/plushies"].includes(page.route)).length,
    newLongTailPagesChecked: pages.filter((page) => page.viewport === "desktop" && promotedPaths.includes(page.route)).length,
    inspectedNewSlugs,
    tRexChecked: pages.some((page) => page.route === "/coloring-pages/t-rex"),
    newHubsRendered: inspectedNewSlugs.every((slug) => pages.some((page) => page.route === `/coloring-pages/${slug}` && page.h1Text.length > 0)),
    webpPreviewsRender: pages.every((page) => page.webpImageCount > 0),
    noBrokenImages: pages.every((page) => page.visibleBrokenImageCount === 0),
    noPreviewUnavailableForValidUploadedRecords: pages.every((page) => page.previewUnavailableTextCount === 0),
    searchFilterPresent: pages.filter((page) => page.route.startsWith("/coloring-pages")).every((page) => page.searchInputCount > 0),
    paginationPresentWhenNeeded: pages.every((page) => page.totalItems <= 48 || page.paginationLinkCount > 0 || page.route === "/" || page.route === "/coloring-pages"),
    relatedLinksPresent: pages.filter((page) => page.route.startsWith("/coloring-pages/") && page.viewport === "desktop").every((page) => page.relatedLinkCount > 0),
    moreMenuWorks: Boolean(moreMenuCheck?.tRexSearchResultFound),
    mobileNavWorks: Boolean(mobileNavCheck?.tRexSearchResultFound),
    sitemapIncludesPromotedHubs: promotedPaths.every((routePath) => sitemapPaths.has(routePath)),
    sitemapExcludesRejectedBacklogHubs: [...rejectedOrBacklogSlugs].every((slug) => !sitemapPaths.has(`/coloring-pages/${slug}`)),
    routedPathsIncludeOnlySitemapIndexableHubs: [...routedPaths].every((routePath) => sitemapPaths.has(routePath)),
    horizontalOverflowDetected: pages.some((page) => page.horizontalOverflow),
    adLayoutStillVisible: pages.some((page) => page.visibleAdLabelCount > 0),
    adDensityControlled: pages.every((page) => page.visibleAdLabelCount <= 3),
    pngJpgWebpControlsPresent: pages.filter((page) => page.route.startsWith("/coloring-pages")).every((page) => page.pngOptionCount > 0 && page.jpgOptionCount > 0 && page.webpOptionCount > 0),
    printControlPresent: pages.filter((page) => page.route.startsWith("/coloring-pages")).every((page) => page.printButtonCount > 0),
    svgDownloadAbsent: pages.every((page) => page.svgDownloadVisibleCount === 0),
    appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
  };

  const blockers = [];
  if (!summary.newHubsRendered) blockers.push("One or more inspected promoted hubs did not render.");
  if (!summary.noBrokenImages) blockers.push("A visible broken image was detected.");
  if (summary.horizontalOverflowDetected) blockers.push("Horizontal overflow was detected.");
  if (!summary.moreMenuWorks) blockers.push("Desktop More menu did not return the T-Rex hub.");
  if (!summary.mobileNavWorks) blockers.push("Mobile navigation did not return the T-Rex hub.");
  if (!summary.pngJpgWebpControlsPresent) blockers.push("PNG/JPG/WebP controls were not visible on all inspected gallery pages.");
  if (!summary.svgDownloadAbsent) blockers.push("A user-facing SVG download control was detected.");

  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary,
    pages,
    moreMenuCheck,
    mobileNavCheck,
    screenshotPaths: unique(screenshotPaths),
    blockers,
  };

  await writeResults(payload);
  if (blockers.length > 0) {
    console.log(JSON.stringify({ runId: RUN_ID, status: "failed", blockers }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ runId: RUN_ID, status: "completed", pages: pages.length, screenshots: payload.screenshotPaths.length }, null, 2));
  }
}

function pickNewHubSlugs(promotedSlugs) {
  const preferred = ["t-rex", "dragons", "mushrooms", "sushi", "bakery", "bears", "pumpkins", "wolves", "velociraptors"];
  return unique([...preferred.filter((slug) => promotedSlugs.includes(slug)), ...promotedSlugs]).slice(0, 10);
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const bodyText = document.body.textContent || "";
    const visibleBrokenImages = [...document.images].filter((img) => visible(img) && img.naturalWidth === 0);
    const actionText = [...document.querySelectorAll("button, summary, a")].map((node) => (node.textContent || "").trim()).join("\n");
    const h1 = document.querySelector("h1");
    const totalText = bodyText.match(/(?:Browse|Print|Search)\s+([0-9,]+)\s+/i)?.[1] || "";
    const totalItems = Number(totalText.replace(/,/g, "")) || 0;
    return {
      h1Text: (h1?.textContent || "").trim(),
      totalItems,
      imageCount: document.images.length,
      webpImageCount: [...document.images].filter((img) => (img.currentSrc || img.src).includes("/webp/") && img.naturalWidth > 0).length,
      visibleBrokenImageCount: visibleBrokenImages.length,
      previewUnavailableTextCount: (bodyText.match(/Preview unavailable/g) || []).length,
      searchInputCount: document.querySelectorAll('input[type="search"]').length,
      filterControlCount: [...document.querySelectorAll("button, input")].filter((node) => /simple|detailed|cute|seasonal|pattern/i.test(node.textContent || node.getAttribute("aria-label") || "")).length,
      paginationLinkCount: [...document.querySelectorAll("a")].filter((link) => /\/page\/[0-9]+/.test(link.getAttribute("href") || "")).length,
      relatedLinkCount: document.querySelectorAll(".seo-related-link, .hub-link-card").length,
      printButtonCount: [...document.querySelectorAll("button")].filter((button) => /^Print$/i.test((button.textContent || "").trim())).length,
      downloadMenuCount: document.querySelectorAll("summary.download-menu-summary").length,
      pngOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "PNG").length,
      jpgOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "JPG").length,
      webpOptionCount: [...document.querySelectorAll("button.download-menu-option")].filter((button) => (button.textContent || "").trim() === "WebP").length,
      svgDownloadVisibleCount: /Download SVG|^SVG$/im.test(actionText) ? 1 : 0,
      visibleAdLabelCount: [...document.querySelectorAll("body *")].filter((node) => visible(node) && (node.textContent || "").trim() === "Advertisement").length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1,
    };
  });
}

async function openFirstDownloadMenu(page) {
  const summary = page.locator("summary.download-menu-summary").first();
  if ((await summary.count()) === 0) return;
  await summary.click({ timeout: 8_000 }).catch(() => {});
}

async function runMoreMenuCheck(context, appUrl) {
  const page = await context.newPage();
  await page.goto(`${appUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByLabel("Search hub pages").fill("t-rex");
  await page.waitForTimeout(250);
  const tRexSearchResultFound = (await page.locator('a[href="/coloring-pages/t-rex"]').count()) > 0;
  const visibleLinkCount = await page.locator(".hub-menu-panel-desktop a").count();
  const screenshotPath = path.join(SCREENSHOT_DIR, "more-menu-t-rex-desktop.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.keyboard.press("Escape");
  const closesOnEscape = (await page.locator(".hub-menu-panel-desktop").count()) === 0;
  await page.close();
  return {
    tRexSearchResultFound,
    visibleLinkCount,
    closesOnEscape,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

async function runMobileNavCheck(context, appUrl) {
  const page = await context.newPage();
  await page.goto(`${appUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.getByLabel("Open navigation menu").click();
  await page.getByLabel("Search mobile hub pages").fill("t-rex");
  await page.waitForTimeout(250);
  const tRexSearchResultFound = (await page.locator('a[href="/coloring-pages/t-rex"]').count()) > 0;
  const panelVisible = (await page.locator(".mobile-nav-panel").count()) > 0;
  const screenshotPath = path.join(SCREENSHOT_DIR, "mobile-nav-t-rex.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await page.locator(".mobile-nav-close").click();
  const closesOnButton = (await page.locator(".mobile-nav-panel").count()) === 0;
  await page.close();
  return {
    panelVisible,
    tRexSearchResultFound,
    closesOnButton,
    screenshotPaths: [toRepoPath(screenshotPath)],
  };
}

function startDevServer() {
  const child = spawn("cmd.exe", ["/c", "npx", "next", "dev", "-H", "127.0.0.1", "-p", "3015"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: "https://www.ilovecoloringpage.com",
      NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "https://assets.ilovecoloringpage.com/coloring-pages",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return child;
}

function stopDevServer(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function waitForReachable(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Local app was not reachable at ${url} after ${timeoutMs}ms.`);
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function makeNotRunPayload(appUrl, reason) {
  return {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    summary: {
      status: "not_run",
      appUrl,
      reason,
      pagesInspected: 0,
      newHubsRendered: false,
      noBrokenImages: null,
      horizontalOverflowDetected: null,
      pngJpgWebpControlsPresent: null,
      printControlPresent: null,
      svgDownloadAbsent: null,
    },
    pages: [],
    screenshotPaths: [],
    blockers: [reason],
  };
}

async function writeResults(payload) {
  await writeJsonAbsolute(MANIFEST_PATH, payload);
  await writeTextAbsolute(REPORT_PATH, renderReport(payload));
}

function renderReport(payload) {
  const summary = payload.summary;
  return `# Long-Tail Hub Browser QA

- Status: ${summary.status}
- App URL: ${summary.appUrl}
- Pages inspected: ${summary.pagesInspected}
- New hubs rendered: ${formatBool(summary.newHubsRendered)}
- WebP previews render: ${formatBool(summary.webpPreviewsRender)}
- Broken images absent: ${formatBool(summary.noBrokenImages)}
- Preview unavailable absent: ${formatBool(summary.noPreviewUnavailableForValidUploadedRecords)}
- More menu works: ${formatBool(summary.moreMenuWorks)}
- Mobile nav works: ${formatBool(summary.mobileNavWorks)}
- Horizontal overflow detected: ${formatBool(summary.horizontalOverflowDetected)}
- Ad density controlled: ${formatBool(summary.adDensityControlled)}
- PNG/JPG/WebP controls present: ${formatBool(summary.pngJpgWebpControlsPresent)}
- Print controls present: ${formatBool(summary.printControlPresent)}
- SVG download absent: ${formatBool(summary.svgDownloadAbsent)}

## Screenshots

${payload.screenshotPaths?.length ? payload.screenshotPaths.map((filePath) => `- ${filePath}`).join("\n") : "_No screenshots captured._"}

## Blockers

${payload.blockers?.length ? payload.blockers.map((blocker) => `- ${blocker}`).join("\n") : "_None._"}
`;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJsonAbsolute(absolutePath, payload) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeTextAbsolute(absolutePath, text) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, text);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = args[index + 1] && !args[index + 1].startsWith("--") ? args[++index] : true;
  }
  return parsed;
}

function normalizeUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function slugForPath(route) {
  if (route === "/") return "home";
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatBool(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "not run";
}
