#!/usr/bin/env node

const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const APP_URL = resolveAppUrl(process.argv.slice(2));
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "ads-trust-readiness");
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
];
const ROUTES = [
  { path: "/", family: "home", adsAllowed: true },
  { path: "/coloring-pages", family: "gallery", adsAllowed: true },
  { path: "/coloring-pages/animals", family: "hub", adsAllowed: true },
  { path: "/printables/animals/animals-alligator-4feec8505a", family: "printable", adsAllowed: true },
  { path: "/privacy", family: "trust", adsAllowed: false },
  { path: "/terms", family: "trust", adsAllowed: false },
  { path: "/editorial-policy", family: "trust", adsAllowed: false },
  { path: "/affiliate-disclosure", family: "trust", adsAllowed: false },
  { path: "/contact", family: "trust", adsAllowed: false },
  { path: "/sitemap", family: "html-sitemap", adsAllowed: false },
  { path: "/ads-trust-readiness-missing-page", family: "not-found", adsAllowed: false, expectedStatus: 404 },
];
const BROWSERS = [
  { id: "chrome", options: { channel: "chrome" } },
  { id: "edge", options: { channel: "msedge" } },
];

function resolveAppUrl(arguments_) {
  const index = arguments_.indexOf("--base-url");
  const value = index >= 0 ? arguments_[index + 1] : "http://127.0.0.1:3005";
  if (!value || !/^https?:\/\//i.test(value)) throw new Error("--base-url must be followed by an HTTP(S) URL.");
  return value.replace(/\/$/, "");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  await mkdir(REVIEW_DIR, { recursive: true });
  const result = { appUrl: APP_URL, browsers: [], routes: ROUTES, viewports: VIEWPORTS.map(({ width }) => width), screenshots: [] };

  for (const specification of BROWSERS) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true, ...specification.options });
    } catch (error) {
      result.browsers.push({ id: specification.id, available: false, reason: firstLine(error) });
      continue;
    }

    try {
      result.browsers.push(await runBrowser(browser, specification, result.screenshots));
    } finally {
      await browser.close();
    }
  }

  const available = result.browsers.filter((entry) => entry.available);
  result.summary = {
    availableBrowsers: available.map((entry) => entry.id),
    unavailableBrowsers: result.browsers.filter((entry) => !entry.available).map((entry) => entry.id),
    pageChecks: available.reduce((sum, entry) => sum + entry.pageChecks, 0),
    failures: available.flatMap((entry) => entry.failures.map((failure) => `${entry.id}: ${failure}`)),
  };
  result.summary.passed = available.length === BROWSERS.length && result.summary.failures.length === 0;

  const outputPath = path.join(REVIEW_DIR, "browser-verification-results.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (!result.summary.passed) process.exitCode = 1;
}

async function runBrowser(browser, specification, screenshots) {
  const context = await browser.newContext();
  await context.route("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js**", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.__adsenseScriptLoads=(window.__adsenseScriptLoads||0)+1;",
  }));
  await context.addInitScript(() => {
    window.__adsPushCount = 0;
    const queue = [];
    queue.push = function push(...values) {
      window.__adsPushCount += values.length;
      return Array.prototype.push.apply(this, values);
    };
    window.adsbygoogle = queue;
  });

  const failures = [];
  let pageChecks = 0;
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(`${APP_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
          const expectedVisible = route.adsAllowed ? (viewport.width >= 1536 ? 3 : 1) : 0;
          if (route.adsAllowed) {
            await page.waitForFunction(
              (expected) => document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']").length === expected
                && document.querySelectorAll("#adsense-runtime").length === 1
                && window.__adsenseScriptLoads === 1,
              expectedVisible,
              { timeout: 15_000 },
            ).catch(() => {});
          } else {
            await page.waitForTimeout(300);
          }
          const metrics = await page.evaluate(() => {
            const wrappers = [...document.querySelectorAll(".ad-slot")];
            const visibleWrappers = wrappers.filter(isVisible);
            const initialized = [...document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']")];
            const hiddenInitialized = initialized.filter((unit) => !isVisible(unit) || !isVisible(unit.closest(".ad-slot")));
            const header = document.querySelector(".site-header");
            const main = document.querySelector("main");
            const headerAd = main?.querySelector(":scope > .ad-slot-top-banner");
            const actionPanel = document.querySelector(".printable-action-panel");
            const visibleAdRects = visibleWrappers.map((element) => element.getBoundingClientRect());
            const actionRect = actionPanel?.getBoundingClientRect();
            return {
              pageFamily: main?.getAttribute("data-page-family") || null,
              overflow: document.documentElement.scrollWidth > window.innerWidth,
              wrapperCount: wrappers.length,
              visibleCount: visibleWrappers.length,
              initializedCount: initialized.length,
              hiddenInitializedCount: hiddenInitialized.length,
              scriptCount: document.querySelectorAll("#adsense-runtime").length,
              scriptLoads: window.__adsenseScriptLoads || 0,
              pushes: window.__adsPushCount || 0,
              headerIsFirstMainChild: Boolean(headerAd && main?.firstElementChild === headerAd),
              headerGap: headerAd && header ? Math.round(headerAd.getBoundingClientRect().top - header.getBoundingClientRect().bottom) : null,
              headerPosition: headerAd ? getComputedStyle(headerAd).position : null,
              topExternalSlot: headerAd?.querySelector(".ad-slot-live-unit")?.getAttribute("data-ad-slot") || null,
              visibleExternalSlots: visibleWrappers.map((wrapper) => wrapper.querySelector(".ad-slot-live-unit")?.getAttribute("data-ad-slot")),
              uninitializedHiddenCount: wrappers.filter((wrapper) => !isVisible(wrapper) && !wrapper.querySelector("[data-ad-initialized='true']")).length,
              adNearPrintableActions: Boolean(actionRect && visibleAdRects.some((rect) => rectanglesAreNear(rect, actionRect, 24))),
              printControls: document.querySelectorAll(".printable-action-panel button, .printable-action-panel a").length,
              adsInsideProhibitedUi: document.querySelectorAll("nav .ad-slot, .gallery-grid .ad-slot, .gallery-search .ad-slot, .pagination .ad-slot, .printable-action-panel .ad-slot").length,
            };

            function isVisible(element) {
              if (!element) return false;
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            }

            function rectanglesAreNear(left, right, gap) {
              const horizontal = Math.max(0, Math.max(left.left, right.left) - Math.min(left.right, right.right));
              const vertical = Math.max(0, Math.max(left.top, right.top) - Math.min(left.bottom, right.bottom));
              return horizontal < gap && vertical < gap;
            }
          });

          pageChecks += 1;
          const expectedStatus = route.expectedStatus || 200;
          if (!response || response.status() !== expectedStatus) failures.push(`${route.path}@${viewport.width}: HTTP ${response?.status() || 0}`);
          if (metrics.pageFamily !== route.family) failures.push(`${route.path}@${viewport.width}: page family ${metrics.pageFamily}`);
          if (metrics.overflow) failures.push(`${route.path}@${viewport.width}: horizontal overflow`);
          if (metrics.adsInsideProhibitedUi !== 0) failures.push(`${route.path}@${viewport.width}: ad inside prohibited UI`);

          if (metrics.visibleCount !== expectedVisible) failures.push(`${route.path}@${viewport.width}: visible ${metrics.visibleCount}, expected ${expectedVisible}`);
          if (metrics.initializedCount !== expectedVisible) failures.push(`${route.path}@${viewport.width}: initialized ${metrics.initializedCount}, expected ${expectedVisible}`);
          if (metrics.hiddenInitializedCount !== 0) failures.push(`${route.path}@${viewport.width}: hidden initialized ${metrics.hiddenInitializedCount}`);
          if (metrics.pushes !== expectedVisible) failures.push(`${route.path}@${viewport.width}: pushes ${metrics.pushes}, expected ${expectedVisible}`);
          if (metrics.scriptCount !== (route.adsAllowed ? 1 : 0)) failures.push(`${route.path}@${viewport.width}: script count ${metrics.scriptCount}`);
          if (metrics.scriptLoads !== (route.adsAllowed ? 1 : 0)) failures.push(`${route.path}@${viewport.width}: script loads ${metrics.scriptLoads}`);

          if (route.adsAllowed) {
            if (!metrics.headerIsFirstMainChild) failures.push(`${route.path}@${viewport.width}: header banner is not first main child`);
            const expectedHeaderGap = viewport.width <= 640 ? 12 : 16;
            if (metrics.headerGap !== expectedHeaderGap) failures.push(`${route.path}@${viewport.width}: header gap ${metrics.headerGap}`);
            if (metrics.headerPosition === "fixed" || metrics.headerPosition === "sticky") failures.push(`${route.path}@${viewport.width}: header position ${metrics.headerPosition}`);
            if (metrics.topExternalSlot !== "5574432869") failures.push(`${route.path}@${viewport.width}: header unit ${metrics.topExternalSlot}`);
            if (metrics.uninitializedHiddenCount < 2) failures.push(`${route.path}@${viewport.width}: expected hidden alternatives`);
            if (viewport.width >= 1536) {
              for (const required of ["5115981872", "9929324856"]) {
                if (!metrics.visibleExternalSlots.includes(required)) failures.push(`${route.path}@${viewport.width}: missing rail ${required}`);
              }
            }
          } else if (metrics.wrapperCount !== 0) {
            failures.push(`${route.path}@${viewport.width}: prohibited ad DOM ${metrics.wrapperCount}`);
          }
          if (route.family === "printable" && metrics.adNearPrintableActions) failures.push(`${route.path}@${viewport.width}: ad near printable actions`);

          if (specification.id === "chrome" && shouldCapture(route.path, viewport.width)) {
            const fileName = `chrome-${viewport.width}-${route.family}.png`;
            const screenshotPath = path.join(REVIEW_DIR, fileName);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            screenshots.push(path.relative(ROOT, screenshotPath).replaceAll("\\", "/"));
          }
        } finally {
          await page.close();
        }
      }
    }

    const routeChange = await context.newPage();
    try {
      await routeChange.setViewportSize({ width: 1440, height: 1000 });
      await routeChange.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await routeChange.waitForFunction(
        () => document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']").length === 1
          && document.querySelectorAll("#adsense-runtime").length === 1
          && window.__adsenseScriptLoads === 1,
        undefined,
        { timeout: 15_000 },
      );
      const before = await routeChange.evaluate(() => ({ scripts: document.querySelectorAll("#adsense-runtime").length, pushes: window.__adsPushCount || 0 }));
      await Promise.all([
        routeChange.waitForURL(`${APP_URL}/coloring-pages`),
        routeChange.locator('.site-nav-link[href="/coloring-pages"]').click(),
      ]);
      await routeChange.waitForFunction(
        () => document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']").length === 1,
        undefined,
        { timeout: 15_000 },
      );
      const after = await routeChange.evaluate(() => ({ scripts: document.querySelectorAll("#adsense-runtime").length, pushes: window.__adsPushCount || 0 }));
      if (before.scripts !== 1 || after.scripts !== 1) failures.push(`route change: duplicate or missing script ${before.scripts}/${after.scripts}`);
      if (after.pushes !== before.pushes + 1) failures.push(`route change: pushes ${before.pushes}/${after.pushes}`);
      await routeChange.evaluate(() => window.dispatchEvent(new Event("resize")));
      await routeChange.mouse.wheel(0, 800);
      await routeChange.waitForTimeout(300);
      const repeated = await routeChange.evaluate(() => window.__adsPushCount || 0);
      if (repeated !== after.pushes) failures.push(`route change: duplicate initialization ${after.pushes}/${repeated}`);
    } finally {
      await routeChange.close();
    }
  } finally {
    await context.close();
  }

  return { id: specification.id, available: true, version: browser.version(), pageChecks, failures };
}

function shouldCapture(routePath, width) {
  return (routePath === "/" && [390, 1440, 1920].includes(width))
    || (routePath.startsWith("/printables/") && [390, 1440].includes(width))
    || (routePath === "/privacy" && width === 390)
    || (routePath.includes("missing-page") && width === 390);
}

function firstLine(error) {
  return String(error?.message || error).split(/\r?\n/)[0];
}
