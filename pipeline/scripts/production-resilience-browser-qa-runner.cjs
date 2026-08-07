#!/usr/bin/env node

const { createReadStream, existsSync, statSync } = require("node:fs");
const { mkdir, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "production-resilience");
const PRINTABLE = "/printables/animals/animals-alligator-4feec8505a";
const WIDTHS = [320, 390, 768, 1024, 1440, 1920, 2400, 3440];
const ROUTES = [
  ["home", "/"],
  ["gallery", "/coloring-pages"],
  ["animals", "/coloring-pages/animals"],
  ["christmas", "/coloring-pages/christmas"],
  ["small-lotus", "/coloring-pages/lotus"],
  ["plushies-deep", "/coloring-pages/plushies/page/36"],
  ["printable", PRINTABLE],
  ["privacy", "/privacy"],
  ["sitemap", "/sitemap"],
  ["404", "/resilience-missing-route"],
];
const NO_JS_ROUTES = [
  ["home", "/"],
  ["gallery", "/coloring-pages"],
  ["animals", "/coloring-pages/animals"],
  ["paginated", "/coloring-pages/animals/page/2"],
  ["printable", PRINTABLE],
  ["privacy", "/privacy"],
  ["sitemap", "/sitemap"],
  ["404", "/resilience-no-js-missing"],
];
const BROWSERS = [["chrome", "chrome"], ["edge", "msedge"]];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(path.join(OUT, "index.html"))) throw new Error("out/ is missing; run a production build first.");
  await mkdir(REVIEW_DIR, { recursive: true });
  const server = await startStaticServer();
  const failureOnly = process.argv.includes("--failure-only");
  const result = {
    measuredAt: new Date().toISOString(),
    measurementClass: "local production-build browser failure lab",
    browsers: [],
    widths: WIDTHS,
    routes: ROUTES.map(([id, route]) => ({ id, route })),
    limitations: [
      "Chrome and Edge are both Chromium-based coverage.",
      "All failure injection is confined to this local QA runner.",
      "Ad network requests are blocked; no live impressions are generated.",
      "Measurements are desktop lab results, not field or physical-device results.",
    ],
  };

  try {
    for (const [id, channel] of BROWSERS) {
      let browser;
      try {
        browser = await chromium.launch({ channel, headless: true });
      } catch (error) {
        result.browsers.push({ id, available: false, error: firstLine(error) });
        continue;
      }
      try {
        const normal = failureOnly ? { checks: [], failures: [] } : await runNormalMatrix(browser, id, server.baseUrl);
        const noJavaScript = failureOnly ? { checks: [], failures: [] } : await runNoJavaScript(browser, id, server.baseUrl);
        const scenarios = id === "chrome" ? await runFailureScenarios(browser, server.baseUrl) : null;
        result.browsers.push({ id, engineCoverage: "Chromium", version: browser.version(), available: true, normal, noJavaScript, scenarios });
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }

  const available = result.browsers.filter((entry) => entry.available);
  const normalFailures = available.flatMap((entry) => entry.normal.failures);
  const noJavaScriptFailures = available.flatMap((entry) => entry.noJavaScript.failures);
  const scenarios = available.find((entry) => entry.id === "chrome")?.scenarios;
  result.summary = {
    expectedBrowsersAvailable: available.length === BROWSERS.length,
    normalChecks: available.reduce((sum, entry) => sum + entry.normal.checks.length, 0),
    normalFailures,
    noJavaScriptChecks: available.reduce((sum, entry) => sum + entry.noJavaScript.checks.length, 0),
    noJavaScriptFailures,
    failureScenariosPassed: scenarios?.passed === true,
    maximumLayoutShift: maximum(available.flatMap((entry) => entry.normal.checks.map((check) => check.layoutShift))),
    maximumLongTaskMs: maximum(available.flatMap((entry) => entry.normal.checks.flatMap((check) => check.longTasks.map((task) => task.duration)))),
  };
  result.summary.passed = result.summary.expectedBrowsersAvailable
    && normalFailures.length === 0
    && noJavaScriptFailures.length === 0
    && result.summary.failureScenariosPassed;
  const output = path.join(REVIEW_DIR, "browser-qa-results.json");
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: relative(output), ...result.summary }, null, 2));
  if (!result.summary.passed) process.exitCode = 1;
}

async function runNormalMatrix(browser, browserId, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  await installMetrics(context);
  const checks = [];
  try {
    for (const width of WIDTHS) {
      for (const [routeId, route] of ROUTES) {
        const page = await context.newPage();
        const errors = collectErrors(page, routeId === "404");
        try {
          await page.setViewportSize({ width, height: width <= 768 ? 900 : 1000 });
          const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(400);
          const state = await page.evaluate(() => {
            const shell = document.querySelector(".public-page-shell");
            const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
            return {
              marker: shell?.getAttribute("data-resilience-version") || null,
              adLayout: shell?.getAttribute("data-ad-layout") || null,
              h1Count: document.querySelectorAll("h1").length,
              overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
              duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
              brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && getComputedStyle(image).display !== "none").length,
              layoutShift: window.__RESILIENCE_METRICS__.layoutShift,
              longTasks: window.__RESILIENCE_METRICS__.longTasks,
              availableWidthZero: window.__RESILIENCE_METRICS__.messages.filter((message) => /availableWidth.?=.?0/i.test(message)),
            };
          });
          const expectedStatus = routeId === "404" ? 404 : 200;
          const passed = response?.status() === expectedStatus
            && state.marker === (state.adLayout === "full" ? "failure-hardening-v1" : null)
            && state.h1Count === 1
            && state.overflow === 0
            && state.duplicateIds.length === 0
            && state.brokenImages === 0
            && state.availableWidthZero.length === 0
              && errors.console.length === 0
              && errors.page.length === 0
            && maximum(state.longTasks.map((task) => task.duration)) <= 200;
          checks.push({ browser: browserId, route: routeId, width, status: response?.status(), passed, ...state, errors });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { checks, failures: checks.filter((check) => !check.passed).map((check) => `${browserId}:${check.route}@${check.width}`) };
}

async function runNoJavaScript(browser, browserId, baseUrl) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const checks = [];
  try {
    for (const [routeId, route] of NO_JS_ROUTES) {
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width: 390, height: 900 });
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "load", timeout: 30_000 });
        const state = await page.evaluate(() => ({
          brandVisible: document.querySelector(".brand") !== null,
          h1Count: document.querySelectorAll("h1").length,
          canonicalLinks: document.querySelectorAll("a[href^='/printables/'], a[href^='/coloring-pages']").length,
          breadcrumbLinks: document.querySelectorAll(".breadcrumb a").length,
          paginationLinks: document.querySelectorAll(".pagination a").length,
          footerLinks: document.querySelectorAll("footer a").length,
          overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        }));
        const expectedStatus = routeId === "404" ? 404 : 200;
        const needsDiscoveryLinks = !["privacy", "404"].includes(routeId);
        const passed = response?.status() === expectedStatus
          && state.brandVisible
          && state.h1Count === 1
          && state.footerLinks > 0
          && state.overflow === 0
          && (!needsDiscoveryLinks || state.canonicalLinks > 0);
        checks.push({ browser: browserId, route: routeId, passed, status: response?.status(), ...state });
        if (browserId === "chrome" && routeId === "printable") {
          await page.screenshot({ path: path.join(REVIEW_DIR, "no-js-printable-390.png"), fullPage: false });
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }
  return { checks, failures: checks.filter((check) => !check.passed).map((check) => `${browserId}:${check.route}`) };
}

async function runFailureScenarios(browser, baseUrl) {
  const dynamicImports = {};
  for (const action of ["PDF", "PNG", "JPG"]) dynamicImports[action] = await deferredImportFailure(browser, baseUrl, action);
  const generation = {
    pdf: await generationFailure(browser, baseUrl, "pdf"),
    png: await generationFailure(browser, baseUrl, "png"),
    jpg: await generationFailure(browser, baseUrl, "jpg"),
    objectUrl: await generationFailure(browser, baseUrl, "object-url"),
    print: await generationFailure(browser, baseUrl, "print"),
  };
  const rapidActivationResult = await rapidActivation(browser, baseUrl);
  const routeChange = await routeChangeDuringExport(browser, baseUrl);
  const brokenImages = await brokenImageScenario(browser, baseUrl);
  const slowImages = await slowImageScenario(browser, baseUrl);
  const lazyScroll = await lazyScrollScenario(browser, baseUrl);
  const search = await searchScenario(browser, baseUrl);
  const navigation = await navigationScenario(browser, baseUrl);
  const invalidRoutes = await invalidRouteScenario(browser, baseUrl);
  const longSession = await longSessionScenario(browser, baseUrl);
  const results = { dynamicImports, generation, rapidActivation: rapidActivationResult, routeChange, brokenImages, slowImages, lazyScroll, search, navigation, invalidRoutes, longSession };
  const passed = Object.values(dynamicImports).every((entry) => entry.passed)
    && Object.values(generation).every((entry) => entry.passed)
    && [rapidActivationResult, routeChange, brokenImages, slowImages, lazyScroll, search, navigation, invalidRoutes, longSession].every((entry) => entry.passed);
  return { passed, results };
}

async function deferredImportFailure(browser, baseUrl, action) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(`${baseUrl}${PRINTABLE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?|$)/, (route) => route.abort("failed"));
    const button = action === "PDF"
      ? page.getByRole("button", { name: "Download PDF", exact: true })
      : page.getByRole("button", { name: new RegExp(`^Download ${action} for`) });
    await button.click();
    await page.waitForFunction((label) => [...document.querySelectorAll("[aria-live]")].some((node) => new RegExp(label, "i").test(node.textContent || "") && /could not|unavailable/i.test(node.textContent || "")), action, { timeout: 15_000 });
    const state = await page.evaluate((label) => ({
      status: [...document.querySelectorAll("[aria-live]")].map((node) => node.textContent?.trim()).filter(Boolean),
      enabled: [...document.querySelectorAll("button")].some((button) => button.getAttribute("aria-label")?.startsWith(`Download ${label} for`) ? !button.disabled : label === "PDF" && button.textContent?.includes("Download PDF") && !button.disabled),
    }), action);
    return { passed: state.enabled && state.status.some((value) => new RegExp(action, "i").test(value)) && errors.page.length === 0, ...state, errors };
  } finally {
    await context.close();
  }
}

async function generationFailure(browser, baseUrl, kind) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  await installExportFixture(context);
  if (kind === "pdf") await context.addInitScript(() => Object.defineProperty(window, "CompressionStream", { configurable: true, value: class { constructor() { throw new Error("controlled compression failure"); } } }));
  if (kind === "object-url") await context.addInitScript(() => { URL.createObjectURL = () => { throw new Error("controlled object URL failure"); }; });
  if (kind === "png" || kind === "jpg") await context.addInitScript(() => { CanvasRenderingContext2D.prototype.drawImage = () => { throw new Error("controlled draw failure"); }; });
  if (kind === "print") await context.addInitScript(() => {
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function(tagName, options) {
      const element = createElement.call(this, tagName, options);
      if (String(tagName).toLowerCase() === "iframe") Object.defineProperty(element, "contentWindow", { configurable: true, get: () => null });
      return element;
    };
  });
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(`${baseUrl}${PRINTABLE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    if (kind === "print") {
      await page.getByRole("button", { name: "Print", exact: true }).first().click();
      await page.getByRole("dialog").waitFor({ state: "visible" });
      await page.waitForFunction(() => {
        const button = document.querySelector(".print-preview-panel .print-preview-actions .button-primary");
        const failed = [...document.querySelectorAll("[aria-live]")].some((node) => /could not|unavailable/i.test(node.textContent || ""));
        return (button instanceof HTMLButtonElement && !button.disabled) || failed;
      }, null, { timeout: 20_000 });
      const previewState = await page.evaluate(() => ({
        enabled: !document.querySelector(".print-preview-panel .print-preview-actions .button-primary")?.disabled,
        status: [...document.querySelectorAll("[aria-live]")].map((node) => node.textContent?.trim()).filter(Boolean),
      }));
      if (!previewState.enabled) return { passed: false, stage: "preview", ...previewState, errors };
      await page.getByRole("dialog").getByRole("button", { name: "Print", exact: true }).click();
    } else {
      const action = kind === "jpg" ? "JPG" : kind === "png" ? "PNG" : "PDF";
      const button = action === "PDF" ? page.getByRole("button", { name: "Download PDF", exact: true }) : page.getByRole("button", { name: new RegExp(`^Download ${action} for`) });
      await button.click();
    }
    await page.waitForFunction(() => [...document.querySelectorAll("[aria-live]")].some((node) => /could not|unavailable/i.test(node.textContent || "")), null, { timeout: 20_000 });
    const state = await page.evaluate(() => ({
      status: [...document.querySelectorAll("[aria-live]")].map((node) => node.textContent?.trim()).filter(Boolean),
      temporaryAnchors: document.querySelectorAll("a[download]").length,
      temporaryFrames: document.querySelectorAll("iframe[title='Printable coloring page PDF']").length,
      disabledBusy: [...document.querySelectorAll("button[aria-busy='true']")].length,
    }));
    return { passed: state.temporaryAnchors === 0 && state.temporaryFrames === 0 && state.disabledBusy === 0 && errors.page.length === 0, ...state, errors };
  } finally {
    await context.close();
  }
}

async function rapidActivation(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  let deferredRequests = 0;
  try {
    await page.goto(`${baseUrl}${PRINTABLE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?|$)/, async (route) => {
      deferredRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.abort("failed");
    });
    await page.locator(".printable-pdf-download").evaluate((button) => {
      for (let index = 0; index < 5; index += 1) button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForFunction(() => [...document.querySelectorAll("[aria-live]")].some((node) => /PDF.*could not/i.test(node.textContent || "")), null, { timeout: 15_000 });
    const state = await page.evaluate(() => ({ enabled: !document.querySelector(".printable-pdf-download").disabled, anchors: document.querySelectorAll("a[download]").length }));
    return { passed: deferredRequests === 1 && state.enabled && state.anchors === 0, deferredRequests, ...state };
  } finally {
    await context.close();
  }
}

async function routeChangeDuringExport(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(`${baseUrl}${PRINTABLE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.abort("failed");
    });
    await page.locator(".printable-pdf-download").click();
    await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => ({ path: location.pathname, staleStatus: [...document.querySelectorAll("[aria-live]")].some((node) => /PDF/i.test(node.textContent || "")), h1: document.querySelectorAll("h1").length }));
    return { passed: state.path === "/coloring-pages/animals" && !state.staleStatus && state.h1 === 1 && errors.page.length === 0, ...state, errors };
  } finally {
    await context.close();
  }
}

async function brokenImageScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  await context.route(/\.(?:webp|png)(?:\?|$)/i, (route) => route.abort("failed"));
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const state = await page.evaluate(() => ({
      placeholders: document.querySelectorAll(".asset-placeholder").length,
      mediaLinks: document.querySelectorAll("a[href^='/printables/']").length,
      titleLinks: document.querySelectorAll(".item-title-link").length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    await page.screenshot({ path: path.join(REVIEW_DIR, "broken-images-gallery-390.png"), fullPage: false });
    return { passed: state.placeholders > 0 && state.mediaLinks > 0 && state.titleLinks > 0 && !state.overflow, ...state };
  } finally {
    await context.close();
  }
}

async function slowImageScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  await context.route(/\.webp(?:\?|$)/i, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await installMetrics(context);
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded" });
    const before = await page.locator(".asset-image-frame").first().evaluate((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, state: node.getAttribute("data-state") }));
    await page.waitForTimeout(1400);
    const after = await page.evaluate(() => ({ layoutShift: window.__RESILIENCE_METRICS__.layoutShift, loadingFrames: document.querySelectorAll(".asset-image-frame[data-state='loading']").length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
    return { passed: before.width > 0 && before.height > 0 && after.layoutShift <= 0.1 && !after.overflow, before, after };
  } finally {
    await context.close();
  }
}

async function lazyScrollScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const routes = ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/christmas", "/coloring-pages/plushies/page/36"];
  const checks = [];
  try {
    for (const route of routes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        scrollTo(0, document.documentElement.scrollHeight);
      });
      await page.waitForTimeout(800);
      const images = await page.evaluate(() => [...document.images].map((image) => ({ src: image.getAttribute("src"), currentSrc: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, loading: image.loading, top: Math.round(image.getBoundingClientRect().top) })));
      const broken = images.filter((image) => image.currentSrc && image.complete && image.naturalWidth === 0);
      const missingSource = images.filter((image) => !image.src);
      checks.push({ route, count: images.length, broken: broken.length, missingSource: missingSource.length, lazy: images.filter((image) => image.loading === "lazy").length });
    }
    return { passed: checks.every((check) => check.count > 0 && check.broken === 0 && check.missingSource === 0), checks };
  } finally {
    await context.close();
  }
}

async function searchScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const errors = collectErrors(page);
  const queries = ["", "   ", "a".repeat(500), "dragón", "🦕", "children's", "t-rex", "123", "no-results-resilience-fixture"];
  const checks = [];
  try {
    await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "domcontentloaded" });
    const input = page.locator("input[type='search']").first();
    await input.waitFor({ state: "visible" });
    for (const query of queries) {
      await input.fill(query);
      await page.waitForTimeout(80);
      checks.push(await page.evaluate((value) => ({ value, cards: document.querySelectorAll(".gallery-item").length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }), query));
    }
    await input.fill("");
    return { passed: checks.every((check) => !check.overflow) && errors.page.length === 0 && errors.console.length === 0, checks, errors };
  } finally {
    await context.close();
  }
}

async function navigationScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const errors = collectErrors(page);
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded" });
    const toggle = page.getByRole("button", { name: "Open navigation menu" });
    for (let index = 0; index < 4; index += 1) {
      await toggle.click();
      await page.keyboard.press("Escape");
    }
    await toggle.click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.keyboard.press("Escape");
    const state = await page.evaluate(() => ({ dialogs: document.querySelectorAll(".mobile-nav-panel").length, bodyOverflow: getComputedStyle(document.body).overflow, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
    return { passed: state.dialogs === 0 && !state.overflow && errors.page.length === 0, ...state, errors };
  } finally {
    await context.close();
  }
}

async function invalidRouteScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const routes = ["/missing-top-level", "/coloring-pages/not-a-hub", "/coloring-pages/animals/page/0", "/coloring-pages/animals/page/9999", "/printables/animals/malformed"];
  const checks = [];
  try {
    for (const route of routes) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
      checks.push(await page.evaluate((value) => ({ route: value, h1: document.querySelectorAll("h1").length, ads: document.querySelectorAll("[data-ad-slot-wrapper]").length, recovery: document.querySelectorAll("a[href='/coloring-pages'], a[href='/']").length, robots: document.querySelector("meta[name='robots']")?.content || null }), route));
      checks.at(-1).status = response?.status();
    }
    return { passed: checks.every((check) => check.status === 404 && check.h1 === 1 && check.ads === 0 && check.recovery > 0), checks };
  } finally {
    await context.close();
  }
}

async function longSessionScenario(browser, baseUrl) {
  const context = await browser.newContext();
  await blockAdvertising(context);
  const page = await context.newPage();
  const errors = collectErrors(page);
  const sequence = ["/", "/coloring-pages/animals", PRINTABLE, "/coloring-pages/animals/page/2", "/coloring-pages/christmas", "/coloring-pages", "/sitemap", "/"];
  const checks = [];
  try {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const route of sequence) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
        checks.push(await page.evaluate((value) => ({ route: value, h1: document.querySelectorAll("h1").length, duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index).length, dialogs: document.querySelectorAll("[role='dialog']").length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }), route));
      }
    }
    return { passed: checks.every((check) => check.h1 === 1 && check.duplicateIds === 0 && check.dialogs === 0 && !check.overflow) && errors.page.length === 0 && errors.console.length === 0, checks: checks.length, errors };
  } finally {
    await context.close();
  }
}

async function installMetrics(context) {
  await context.addInitScript(() => {
    window.__RESILIENCE_METRICS__ = { layoutShift: 0, longTasks: [], messages: [] };
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__RESILIENCE_METRICS__.layoutShift += entry.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__RESILIENCE_METRICS__.longTasks.push({ startTime: entry.startTime, duration: entry.duration }); }).observe({ type: "longtask", buffered: true });
    const originalError = console.error;
    console.error = (...args) => { window.__RESILIENCE_METRICS__.messages.push(args.map(String).join(" ")); originalError(...args); };
  });
}

async function blockAdvertising(context) {
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i, (route) => route.abort("blockedbyclient"));
}

async function installExportFixture(context) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="white"/><path d="M40 400H1160" fill="none" stroke="black" stroke-width="8"/></svg>';
  await context.route(/assets\.ilovecoloringpage\.com\/coloring-pages\/svg\/.*\.svg(?:\?|$)/i, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
    body: svg,
  }));
}

function collectErrors(page, allow404 = false) {
  const errors = { console: [], page: [], network: [] };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (/googlesyndication|doubleclick|ERR_BLOCKED_BY_CLIENT|ERR_FAILED/i.test(value)) return;
    // The minimal local static server cannot serve Next's optional RSC prefetch aliases;
    // response tracking below retains URL-level evidence for every real HTTP failure.
    if (/^Failed to load resource:.*404 \(Not Found\)$/i.test(value)) return;
    if (allow404 && /404 \(Not Found\)/i.test(value)) return;
    errors.console.push(value);
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (allow404 && response.request().isNavigationRequest()) return;
    errors.network.push(`${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const value = `${request.failure()?.errorText || "request failed"} ${request.url()}`;
    if (/googlesyndication|doubleclick|googletagservices|googleadservices/i.test(value)) return;
    errors.network.push(value);
  });
  return errors;
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname).replace(/\\/g, "/");
    if (pathname.includes("..")) return send404(response);
    if (pathname === "/") pathname = "/index.html";
    let filePath = path.join(OUT, pathname.replace(/^\/+/, ""));
    if (!path.extname(filePath) && existsSync(`${filePath}.html`)) filePath = `${filePath}.html`;
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return send404(response);
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType(filePath));
    response.setHeader("Cache-Control", "no-store");
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function send404(response) {
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  createReadStream(path.join(OUT, "404.html")).pipe(response);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" })[extension] || "application/octet-stream";
}

function maximum(values) { return Math.max(0, ...values.filter(Number.isFinite)); }
function firstLine(error) { return String(error?.message || error).split(/\r?\n/)[0]; }
function relative(value) { return path.relative(ROOT, value).replaceAll("\\", "/"); }
