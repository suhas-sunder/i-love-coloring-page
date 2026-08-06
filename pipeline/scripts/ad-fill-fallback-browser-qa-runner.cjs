#!/usr/bin/env node

const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const BASE_URL = readBaseUrl(process.argv.slice(2));
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "ad-layout-finalization");
const ROUTES = [
  { id: "home", path: "/", ads: true },
  { id: "gallery", path: "/coloring-pages", ads: true },
  { id: "hub", path: "/coloring-pages/animals", ads: true },
  { id: "hub-pagination", path: "/coloring-pages/animals/page/2", ads: true },
  { id: "printable", path: "/printables/animals/animals-alligator-4feec8505a", ads: true },
  { id: "privacy", path: "/privacy", ads: false },
  { id: "terms", path: "/terms", ads: false },
  { id: "not-found", path: "/missing-ad-fill-fallback-route", ads: false },
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
  { width: 2400, height: 1080 },
  { width: 2560, height: 1080 },
  { width: 3440, height: 1440 },
];
const BROWSERS = [
  { id: "chrome", channel: "chrome" },
  { id: "edge", channel: "msedge" },
];
const FALLBACK_TIMEOUT_MS = 13_000;

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  await mkdir(REVIEW_DIR, { recursive: true });
  const results = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    browsers: [],
    routes: ROUTES.map(({ id, path: routePath }) => ({ id, path: routePath })),
    viewports: VIEWPORTS.map(({ width }) => width),
    timeoutMs: FALLBACK_TIMEOUT_MS,
    evidence: [],
    limitations: [
      "Chrome and Edge are both Chromium-based coverage.",
      "Local statuses are deterministic harness injections; no creative or Google fill is simulated.",
    ],
  };

  for (const browserSpec of BROWSERS) {
    let browser;
    try {
      browser = await chromium.launch({ channel: browserSpec.channel, headless: true });
    } catch (error) {
      results.browsers.push({ id: browserSpec.id, available: false, reason: firstLine(error) });
      continue;
    }

    try {
      const matrix = await runAllUnfilledMatrix(browser, browserSpec.id, results.evidence);
      const scenarios = await runStateScenarios(browser, browserSpec.id, results.evidence);
      results.browsers.push({
        id: browserSpec.id,
        available: true,
        engine: "Chromium",
        version: browser.version(),
        matrix,
        scenarios,
      });
    } finally {
      await browser.close();
    }
  }

  const available = results.browsers.filter((entry) => entry.available);
  results.summary = {
    expectedBrowsersAvailable: available.length === BROWSERS.length,
    matrixChecks: available.reduce((sum, entry) => sum + entry.matrix.checks.length, 0),
    matrixFailures: available.flatMap((entry) => entry.matrix.failures),
    scenarioFailures: available.flatMap((entry) => entry.scenarios.filter((scenario) => !scenario.passed).map((scenario) => `${entry.id}:${scenario.id}`)),
  };
  results.summary.passed = results.summary.expectedBrowsersAvailable
    && results.summary.matrixFailures.length === 0
    && results.summary.scenarioFailures.length === 0;

  await writeFile(path.join(REVIEW_DIR, "browser-qa-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(results.summary, null, 2));
  if (!results.summary.passed) process.exitCode = 1;
}

async function runAllUnfilledMatrix(browser, browserId, evidence) {
  const context = await browser.newContext();
  await installHarness(context, "success");
  const checks = [];
  const failures = [];
  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await context.newPage();
        try {
          await page.setViewportSize(viewport);
          const response = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          if (route.ads) {
            await waitForInitialized(page);
            await setEveryInitializedStatus(page, "unfilled");
            await waitForState(page, "fallback");
          }
          const snapshot = await inspectPage(page);
          const expectedVisible = route.ads
            ? (route.id === "hub-pagination" ? 3 : viewport.width >= 2400 ? 6 : 4)
            : 0;
          const passed = Boolean(response)
            && (route.id === "not-found" ? response.status() === 404 : response.status() === 200)
            && snapshot.wrapperCount === (route.ads ? expectedWrapperCount(route.id) : 0)
            && snapshot.visibleFallbackCount === expectedVisible
            && snapshot.visibleLiveFallbackOverlapCount === 0
            && snapshot.clickableFallbackCount === 0
            && snapshot.horizontalOverflow === false
            && snapshot.scriptCount === (route.ads ? 1 : 0)
            && snapshot.duplicateLogicalInitializations.length === 0
            && snapshot.creativeIframeCount === 0;
          const check = { route: route.path, width: viewport.width, expectedVisible, passed, snapshot };
          checks.push(check);
          if (!passed) failures.push(`${browserId}:${route.id}@${viewport.width}`);

          if (browserId === "chrome" && route.id === "hub" && [390, 1440, 3440].includes(viewport.width)) {
            const filename = `chrome-${viewport.width}-all-unfilled.png`;
            await page.screenshot({ path: path.join(REVIEW_DIR, filename), fullPage: false });
            evidence.push(`pipeline/review/ad-layout-finalization/${filename}`);
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { checks, failures };
}

async function runStateScenarios(browser, browserId, evidence) {
  const scenarios = [];
  scenarios.push(await runStatusScenario(browser, "one-filled", async (page) => {
    await setMixedStatuses(page, "filled", true);
    await waitForState(page, "adsense-present");
    const snapshot = await inspectPage(page);
    return { snapshot, passed: snapshot.visibleFallbackCount === 0 && snapshot.filledCount === 1 };
  }));
  scenarios.push(await runStatusScenario(browser, "optimized-visible", async (page) => {
    await setMixedStatuses(page, "unfill-optimized", true);
    await waitForState(page, "adsense-present");
    const snapshot = await inspectPage(page);
    return { snapshot, passed: snapshot.visibleFallbackCount === 0 && snapshot.optimizedCount === 1 };
  }));
  scenarios.push(await runStatusScenario(browser, "filled-empty-iframe", async (page) => {
    await setMixedStatuses(page, "filled", false, true);
    await page.waitForTimeout(100);
    const snapshot = await inspectPage(page);
    return { snapshot, passed: snapshot.pageState === "pending" && snapshot.visibleFallbackCount === 0 };
  }));
  scenarios.push(await runStatusScenario(browser, "optimized-blank", async (page) => {
    await setMixedStatuses(page, "unfill-optimized", false);
    await page.waitForTimeout(100);
    const snapshot = await inspectPage(page);
    return { snapshot, passed: snapshot.pageState === "pending" && snapshot.visibleFallbackCount === 0 };
  }));
  scenarios.push(await runStatusScenario(browser, "late-fill", async (page) => {
    await setEveryInitializedStatus(page, "unfilled");
    await waitForState(page, "fallback");
    const fallbackSnapshot = await inspectPage(page);
    await setFirstInitializedStatus(page, "filled", true);
    await waitForState(page, "adsense-present");
    await setFirstInitializedStatus(page, "unfilled");
    const finalSnapshot = await inspectPage(page);
    if (browserId === "chrome") {
      const filename = "chrome-1440-late-fill-final.png";
      await page.screenshot({ path: path.join(REVIEW_DIR, filename), fullPage: false });
      evidence.push(`pipeline/review/ad-layout-finalization/${filename}`);
    }
    return {
      fallbackSnapshot,
      finalSnapshot,
      passed: fallbackSnapshot.visibleFallbackCount === 1
        && finalSnapshot.pageState === "adsense-present"
        && finalSnapshot.visibleFallbackCount === 0,
    };
  }));
  scenarios.push(await runScriptFailureScenario(browser));
  scenarios.push(await runTimeoutScenario(browser));
  scenarios.push(await runNavigationResetScenario(browser));
  return scenarios;

  async function runStatusScenario(targetBrowser, id, exercise) {
    const context = await targetBrowser.newContext();
    await installHarness(context, "success");
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await waitForInitialized(page);
      const result = await exercise(page);
      return { id, ...result };
    } finally {
      await context.close();
    }
  }
}

async function runScriptFailureScenario(browser) {
  const context = await browser.newContext();
  await installHarness(context, "failure");
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForInitialized(page);
    await waitForState(page, "fallback");
    const snapshot = await inspectPage(page);
    return {
      id: "script-failure",
      snapshot,
      passed: snapshot.visibleFallbackCount === 1 && snapshot.scriptCount === 1 && snapshot.adScriptLoadState === "failed",
    };
  } finally {
    await context.close();
  }
}

async function runTimeoutScenario(browser) {
  const context = await browser.newContext();
  await installHarness(context, "success");
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForInitialized(page);
    const pendingSnapshot = await inspectPage(page);
    await waitForState(page, "fallback", FALLBACK_TIMEOUT_MS + 3_000);
    const fallbackSnapshot = await inspectPage(page);
    await setFirstInitializedStatus(page, "filled", true);
    await waitForState(page, "adsense-present");
    const lateSnapshot = await inspectPage(page);
    return {
      id: "pending-timeout",
      pendingSnapshot,
      fallbackSnapshot,
      lateSnapshot,
      passed: pendingSnapshot.pageState === "pending"
        && pendingSnapshot.visibleFallbackCount === 0
        && fallbackSnapshot.visibleFallbackCount === 1
        && lateSnapshot.visibleFallbackCount === 0,
    };
  } finally {
    await context.close();
  }
}

async function runNavigationResetScenario(browser) {
  const context = await browser.newContext();
  await installHarness(context, "success");
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${BASE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForInitialized(page);
    await setFirstInitializedStatus(page, "filled", true);
    await waitForState(page, "adsense-present");
    await page.evaluate(() => { window.__adQaOldUnit = document.querySelector(".ad-slot-live-unit[data-ad-initialized='true']"); });
    await page.getByRole("link", { name: "Coloring Pages", exact: true }).first().click();
    await page.waitForURL(/\/coloring-pages\/?$/);
    await waitForInitialized(page);
    await page.waitForFunction(() => document.documentElement.dataset.adPageState === "pending");
    await page.evaluate(() => window.__adQaOldUnit?.setAttribute("data-ad-status", "filled"));
    await page.waitForTimeout(50);
    const staleSnapshot = await inspectPage(page);
    await setEveryInitializedStatus(page, "unfilled");
    await waitForState(page, "fallback");
    const finalSnapshot = await inspectPage(page);
    return {
      id: "client-navigation-reset",
      staleSnapshot,
      finalSnapshot,
      passed: staleSnapshot.pageState === "pending"
        && finalSnapshot.pageState === "fallback"
        && finalSnapshot.scriptCount === 1
        && finalSnapshot.duplicateLogicalInitializations.length === 0,
    };
  } finally {
    await context.close();
  }
}

async function installHarness(context, scriptOutcome) {
  await context.addInitScript(() => {
    window.__adQaPushCount = 0;
    const queue = [];
    queue.push = (...items) => {
      window.__adQaPushCount += items.length;
      return Array.prototype.push.apply(queue, items);
    };
    window.adsbygoogle = queue;
  });
  await context.route("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js**", (route) => {
    if (scriptOutcome === "failure") return route.abort("failed");
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* deterministic AdSense script stub; statuses are injected by the QA harness */" });
  });
  await context.route("https://googleads.g.doubleclick.net/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>AdSense QA surface</title>",
  }));
}

async function waitForInitialized(page) {
  await page.waitForFunction(() => document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']").length > 0, null, { timeout: 10_000 });
}

async function waitForState(page, state, timeout = 5_000) {
  await page.waitForFunction((expected) => document.documentElement.dataset.adPageState === expected, state, { timeout });
}

async function setEveryInitializedStatus(page, status) {
  await page.evaluate((value) => {
    for (const unit of document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']")) unit.setAttribute("data-ad-status", value);
  }, status);
}

async function setMixedStatuses(page, presentStatus, withVisibleCreative, withEmptyCreative = false) {
  await page.evaluate(({ value, visibleCreative, emptyCreative }) => {
    const units = [...document.querySelectorAll(".ad-slot-live-unit[data-ad-initialized='true']")];
    units.forEach((unit, index) => {
      unit.setAttribute("data-ad-status", index === 0 ? value : "unfilled");
      if (index !== 0 || (!visibleCreative && !emptyCreative)) return;
      const frame = document.createElement("iframe");
      frame.src = "https://googleads.g.doubleclick.net/pagead/ads";
      frame.style.width = visibleCreative ? "300px" : "0";
      frame.style.height = visibleCreative ? "250px" : "0";
      frame.setAttribute("data-qa-google-creative", visibleCreative ? "visible" : "empty");
      unit.append(frame);
    });
  }, { value: presentStatus, visibleCreative: withVisibleCreative, emptyCreative: withEmptyCreative });
}

async function setFirstInitializedStatus(page, status, withVisibleCreative = false) {
  await page.evaluate(({ value, visibleCreative }) => {
    const unit = document.querySelector(".ad-slot-live-unit[data-ad-initialized='true']");
    if (!unit) return;
    unit.setAttribute("data-ad-status", value);
    if (!visibleCreative) return;
    const frame = document.createElement("iframe");
    frame.src = "https://googleads.g.doubleclick.net/pagead/ads";
    frame.style.width = "300px";
    frame.style.height = "250px";
    frame.setAttribute("data-qa-google-creative", "visible");
    unit.append(frame);
  }, { value: status, visibleCreative: withVisibleCreative });
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const fallbacks = [...document.querySelectorAll("[data-ad-fallback]")];
    const units = [...document.querySelectorAll(".ad-slot-live-unit")];
    const initialized = units.filter((unit) => unit.dataset.adInitialized === "true");
    const logicalCounts = initialized.reduce((counts, unit) => {
      const id = unit.closest("[data-ad-slot]")?.dataset.adSlot || "missing";
      counts[id] = (counts[id] || 0) + 1;
      return counts;
    }, {});
    const overlaps = fallbacks.filter(visible).filter((fallback) => {
      const live = fallback.parentElement?.querySelector(".ad-slot-live-unit");
      if (!live || !visible(live)) return false;
      const left = fallback.getBoundingClientRect();
      const right = live.getBoundingClientRect();
      return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    });
    return {
      pageState: document.documentElement.dataset.adPageState || null,
      wrapperCount: document.querySelectorAll("[data-ad-fallback-policy='page-all-or-none-v1']").length,
      fallbackCount: fallbacks.length,
      visibleFallbackCount: fallbacks.filter(visible).length,
      visibleLiveFallbackOverlapCount: overlaps.length,
      clickableFallbackCount: fallbacks.filter((fallback) => fallback.matches("a,button,[tabindex]") || fallback.querySelector("a,button,[tabindex]")).length,
      initializedCount: initialized.length,
      pushCount: window.__adQaPushCount || 0,
      duplicateLogicalInitializations: Object.entries(logicalCounts).filter(([, count]) => count > 1),
      scriptCount: document.querySelectorAll("script#adsense-runtime").length,
      adScriptLoadState: document.querySelector("script#adsense-runtime")?.dataset.adLoadState || null,
      filledCount: initialized.filter((unit) => unit.getAttribute("data-ad-status") === "filled").length,
      optimizedCount: initialized.filter((unit) => unit.getAttribute("data-ad-status") === "unfill-optimized").length,
      unfilledCount: initialized.filter((unit) => unit.getAttribute("data-ad-status") === "unfilled").length,
      creativeIframeCount: document.querySelectorAll(".ad-slot iframe").length,
      headerSize: (() => {
        const header = document.querySelector("[data-ad-size-policy='fixed-header-v1']");
        if (!header) return null;
        const rect = header.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })(),
      railSizes: [...document.querySelectorAll("[data-ad-rail]")].filter(visible).map((rail) => {
        const rect = rail.getBoundingClientRect();
        return { side: rail.dataset.adRail, width: rect.width, height: rect.height };
      }),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

function expectedWrapperCount(routeId) {
  return routeId === "hub-pagination" ? 3 : 6;
}

function readBaseUrl(args) {
  const index = args.indexOf("--base-url");
  const value = index >= 0 ? args[index + 1] : "http://127.0.0.1:3013";
  if (!value || !/^https?:\/\//i.test(value)) throw new Error("--base-url must be followed by an HTTP(S) URL.");
  return value.replace(/\/$/, "");
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}
