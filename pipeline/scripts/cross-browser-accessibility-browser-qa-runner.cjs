#!/usr/bin/env node

const { createReadStream, existsSync, readFileSync, statSync } = require("node:fs");
const { mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "cross-browser-accessibility");
const ASSET_ROOT = path.join(ROOT, "pipeline", "r2-upload-optimized", "coloring-pages");
const PRINTABLE = "/printables/animals/animals-alligator-4feec8505a";
const BROWSER_IDS = ["chrome", "edge", "firefox", "webkit"];
const WIDTHS = [320, 390, 480, 768, 1024, 1280, 1440, 1920, 2400, 3440];
const ROUTES = [
  ["home", "/"],
  ["gallery", "/coloring-pages"],
  ["animals", "/coloring-pages/animals"],
  ["christmas", "/coloring-pages/christmas"],
  ["small-lotus", "/coloring-pages/lotus"],
  ["animals-mid", "/coloring-pages/animals/page/16"],
  ["plushies-deep", "/coloring-pages/plushies/page/36"],
  ["printable", PRINTABLE],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["sitemap", "/sitemap"],
  ["404", "/cross-browser-accessibility-missing"],
];
const REFLOW_ROUTES = ["/", "/coloring-pages", "/coloring-pages/animals", PRINTABLE, "/privacy", "/sitemap"];
const REFLOW_WIDTHS = [1280, 1024, 853, 640, 427, 320];
const SCREENSHOTS = new Set([
  "chrome:home:320",
  "edge:animals:3440",
  "firefox:gallery:390",
  "firefox:printable:1440",
  "webkit:christmas:768",
  "webkit:printable:390",
]);
const BROWSER_SPECS = [
  { id: "chrome", engine: "Blink", launch: () => chromium.launch({ channel: "chrome", headless: true }) },
  { id: "edge", engine: "Blink", launch: () => chromium.launch({ channel: "msedge", headless: true }) },
  { id: "firefox", engine: "Gecko", launch: () => firefox.launch({ headless: true }) },
  { id: "webkit", engine: "WebKit", launch: () => webkit.launch({ headless: true }) },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  assertBuildExists();
  await mkdir(REVIEW_DIR, { recursive: true });
  const tempRoot = await require("node:fs/promises").mkdtemp(path.join(os.tmpdir(), "ilcp-cross-browser-"));
  const server = await startStaticServer();
  const result = {
    measuredAt: new Date().toISOString(),
    measurementClass: "local static-production browser lab measurement",
    baseUrl: server.baseUrl,
    browserIds: BROWSER_IDS,
    routeCount: ROUTES.length,
    widths: WIDTHS,
    routeViewportChecksPerBrowser: ROUTES.length * WIDTHS.length,
    limitations: [
      "Chrome and Edge are both Blink coverage, not independent rendering engines.",
      "Playwright WebKit is WebKit automation, not real Safari or iOS hardware.",
      "Zoom checks use equivalent CSS viewport widths; they are deterministic reflow checks, not browser UI zoom automation.",
      "Native print-dialog appearance, physical printing, physical screen readers, and real touch hardware remain manual checks.",
      "Advertising requests are blocked to avoid creating QA impressions.",
    ],
    cssFeatureInventory: inspectCssFeatures(),
    browsers: [],
  };

  try {
    for (const specification of BROWSER_SPECS) {
      let browser;
      try {
        browser = await specification.launch();
      } catch (error) {
        result.browsers.push({ id: specification.id, engine: specification.engine, available: false, error: firstLine(error) });
        continue;
      }
      try {
        result.browsers.push(await inspectBrowser(browser, specification, server.baseUrl, tempRoot));
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }

  const available = result.browsers.filter((entry) => entry.available);
  const failures = available.flatMap((entry) => entry.failures.map((failure) => `${entry.id}: ${failure}`));
  result.summary = {
    availableBrowsers: available.length,
    expectedBrowsers: BROWSER_SPECS.length,
    routeViewportChecks: available.reduce((total, entry) => total + entry.routeViewport.checks, 0),
    keyboardJourneys: available.filter((entry) => entry.keyboard.passed).length,
    touchJourneys: available.filter((entry) => entry.touch.passed).length,
    downloadSuites: available.filter((entry) => entry.downloads.passed).length,
    maximumLayoutShift: maximum(available.map((entry) => entry.routeViewport.maximumLayoutShift)),
    maximumLongTaskMs: maximum(available.map((entry) => entry.routeViewport.maximumLongTaskMs)),
    failures,
  };
  result.summary.passed = available.length === BROWSER_SPECS.length && failures.length === 0;
  const output = path.join(REVIEW_DIR, "browser-qa-results.json");
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: relative(output), ...result.summary }, null, 2));
  if (!result.summary.passed) process.exitCode = 1;
}

async function inspectBrowser(browser, specification, baseUrl, tempRoot) {
  const entry = {
    id: specification.id,
    engine: specification.engine,
    available: true,
    version: browser.version(),
    automation: `Playwright ${specification.id === "chrome" || specification.id === "edge" ? "installed channel" : "managed binary"}`,
    capabilities: {
      headless: true,
      screenshots: true,
      keyboard: true,
      pointerAndTouch: true,
      networkInterception: true,
      consoleCapture: true,
      accessibilitySnapshot: true,
      nativePrintDialog: false,
    },
    failures: [],
  };
  const tasks = [
    ["routeViewport", () => runRouteViewportMatrix(browser, specification.id, baseUrl)],
    ["keyboard", () => runKeyboardJourney(browser, baseUrl)],
    ["touch", () => runTouchJourney(browser, baseUrl)],
    ["reflow", () => runReflow(browser, baseUrl)],
    ["textEnlargement", () => runTextEnlargement(browser, baseUrl)],
    ["focus", () => runFocusScan(browser, baseUrl)],
    ["semantics", () => runSemanticAudit(browser, baseUrl)],
    ["liveRegions", () => runLiveRegionAudit(browser, baseUrl)],
    ["reducedMotion", () => runReducedMotion(browser, baseUrl)],
    ["forcedColors", () => runForcedColors(browser, specification, baseUrl)],
    ["printCss", () => runPrintCss(browser, baseUrl)],
    ["downloads", () => runDownloads(browser, baseUrl, tempRoot)],
    ["printHandoff", () => runPrintHandoff(browser, baseUrl)],
    ["imageScroll", () => runImageScroll(browser, baseUrl)],
    ["fontFallback", () => runFontFallback(browser, baseUrl)],
    ["orientation", () => runOrientationSimulation(browser, baseUrl)],
  ];
  for (const [name, task] of tasks) {
    try {
      entry[name] = await task();
      if (!entry[name].passed) entry.failures.push(...entry[name].failures.map((failure) => `${name}: ${failure}`));
    } catch (error) {
      entry[name] = { passed: false, failures: [firstLine(error)] };
      entry.failures.push(`${name}: ${firstLine(error)}`);
    }
  }
  return entry;
}

async function runRouteViewportMatrix(browser, browserId, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  let checks = 0;
  let maximumLayoutShift = 0;
  let maximumLongTaskMs = 0;
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width <= 480 ? 900 : 1000 });
      for (const [routeId, route] of ROUTES) {
        const diagnostics = captureDiagnostics(page);
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "load", timeout: 45_000 });
        await page.waitForTimeout(75);
        const metrics = await page.evaluate(() => {
          const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const clippedControls = [...document.querySelectorAll("a[href],button,input,select,textarea,summary")]
            .filter(visible)
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              const style = getComputedStyle(node);
              const clipsInlineContent = /hidden|clip/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2;
              return rect.left < -1 || rect.right > innerWidth + 1 || clipsInlineContent;
            })
            .slice(0, 5)
            .map((node) => `${node.tagName.toLowerCase()}:${node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 40) || "unnamed"}`);
          const adOverlap = [...document.querySelectorAll("[data-ad-slot-wrapper]")].filter(visible).some((ad) => {
            const a = ad.getBoundingClientRect();
            return [...document.querySelectorAll("nav,.printable-action-panel,.gallery-controls,.pagination")].filter(visible).some((target) => {
              const b = target.getBoundingClientRect();
              return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            });
          });
          const images = [...document.images].filter(visible);
          return {
            mainCount: document.querySelectorAll("main").length,
            h1Count: document.querySelectorAll("h1").length,
            overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
            clippedControls,
            brokenImages: images.filter((image) => image.complete && image.currentSrc && image.naturalWidth === 0).length,
            duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index),
            mobileNavVisible: visible(document.querySelector(".mobile-header-actions") || document.body),
            desktopNavVisible: visible(document.querySelector(".site-nav-desktop") || document.body),
            adOverlap,
            layoutShift: window.__compatQa?.layoutShift || 0,
            longTasks: window.__compatQa?.longTasks || [],
          };
        });
        const errors = diagnostics.finish();
        const expectedStatus = routeId === "404" ? 404 : 200;
        const maximumTask = maximum(metrics.longTasks.map((task) => task.duration));
        maximumLayoutShift = Math.max(maximumLayoutShift, metrics.layoutShift);
        maximumLongTaskMs = Math.max(maximumLongTaskMs, maximumTask);
        const reasons = [];
        if (response?.status() !== expectedStatus) reasons.push(`HTTP ${response?.status() || 0}`);
        if (metrics.mainCount !== 1 || metrics.h1Count !== 1) reasons.push(`main/H1 ${metrics.mainCount}/${metrics.h1Count}`);
        if (metrics.overflowPx > 1) reasons.push(`horizontal overflow ${metrics.overflowPx}px`);
        if (metrics.clippedControls.length) reasons.push(`clipped controls ${metrics.clippedControls.join(", ")}`);
        if (metrics.brokenImages) reasons.push(`${metrics.brokenImages} broken visible images`);
        if (metrics.duplicateIds.length) reasons.push(`duplicate IDs ${metrics.duplicateIds.join(", ")}`);
        if (metrics.adOverlap) reasons.push("ad/control overlap");
        if (width < 900 && !metrics.mobileNavVisible) reasons.push("mobile navigation unavailable");
        if (width >= 900 && !metrics.desktopNavVisible) reasons.push("desktop navigation unavailable");
        if (errors.length) reasons.push(`runtime errors ${errors.join(" | ")}`);
        if (maximumTask > 200) reasons.push(`long task ${maximumTask.toFixed(1)}ms`);
        if (reasons.length) failures.push(`${routeId}@${width}: ${reasons.join("; ")}`);
        if (SCREENSHOTS.has(`${browserId}:${routeId}:${width}`)) {
          await page.screenshot({ path: path.join(REVIEW_DIR, `${browserId}-${routeId}-${width}.png`), fullPage: false });
        }
        checks += 1;
      }
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, checks, maximumLayoutShift, maximumLongTaskMs };
}

async function runKeyboardJourney(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoReady(page, `${baseUrl}/`);
    const categories = page.getByRole("button", { name: "Categories", exact: true });
    await categories.focus();
    await page.keyboard.press("Enter");
    if (await categories.getAttribute("aria-expanded") !== "true") failures.push("Categories did not open with Enter");
    await page.keyboard.press("Tab");
    let tabEnteredPanel = await page.locator(".category-browser a").first().evaluate((node) => node === document.activeElement);
    for (let attempt = 0; !tabEnteredPanel && attempt < 3; attempt += 1) {
      await page.keyboard.press("Tab");
      tabEnteredPanel = await page.locator(".category-browser a").evaluateAll((nodes) => nodes.some((node) => node === document.activeElement));
    }
    if (!tabEnteredPanel) {
      const firstPanelLink = page.locator(".category-browser a").first();
      await firstPanelLink.focus();
      if (!await firstPanelLink.evaluate((node) => node === document.activeElement)) failures.push("Categories links were not keyboard focusable");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    if (await categories.getAttribute("aria-expanded") !== "false" || !await categories.evaluate((node) => node === document.activeElement)) failures.push("Categories Escape/focus restoration failed");
    const seasonal = page.getByRole("button", { name: "Seasonal", exact: true });
    await seasonal.focus();
    await page.keyboard.press("Space");
    if (await seasonal.getAttribute("aria-expanded") !== "true") failures.push("Seasonal did not open with Space");
    await categories.click();
    if (await seasonal.getAttribute("aria-expanded") !== "false" || await categories.getAttribute("aria-expanded") !== "true") failures.push("only-one-disclosure contract failed");
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    if (await categories.getAttribute("aria-expanded") !== "false") failures.push("outside pointer did not close disclosure");
    const search = page.getByRole("button", { name: "Search", exact: true });
    await search.focus();
    await page.keyboard.press("Enter");
    const searchInput = page.getByRole("searchbox", { name: "Search coloring pages" });
    await searchInput.waitFor({ state: "visible" });
    await waitForActive(page, ".global-search-field input");
    if (!await searchInput.evaluate((node) => node === document.activeElement)) failures.push("Search dialog initial focus failed");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    if (!await search.evaluate((node) => node === document.activeElement)) failures.push("Search Escape focus restoration failed");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileToggle = page.getByRole("button", { name: "Open navigation menu" });
    await mobileToggle.focus();
    await page.keyboard.press("Enter");
    const mobileDialog = page.getByRole("dialog", { name: "Browse coloring pages" });
    await mobileDialog.waitFor({ state: "visible" });
    await waitForActive(page, ".mobile-nav-close");
    if (!await page.getByRole("button", { name: "Close" }).evaluate((node) => node === document.activeElement)) failures.push("Mobile navigation initial focus failed");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    if (!await mobileToggle.evaluate((node) => node === document.activeElement)) failures.push("Mobile navigation Escape focus restoration failed");

    await gotoReady(page, `${baseUrl}${PRINTABLE}`);
    const downloadImage = page.getByRole("group", { name: /Download available formats/ });
    const pdf = page.getByRole("button", { name: "Download PDF", exact: true });
    await pdf.focus();
    if (!await pdf.evaluate((node) => node === document.activeElement)) failures.push("PDF action is not keyboard focusable");
    await page.keyboard.press("Tab");
    if (!/Print/.test(await page.locator(":focus").textContent())) failures.push("Print does not follow PDF in keyboard order");
    if (!await downloadImage.getByRole("button").first().isVisible()) failures.push("Image downloads are not keyboard reachable");
    const related = page.locator(".related-printables a,.related-link").first();
    await related.focus();
    if (!await related.evaluate((node) => node === document.activeElement)) failures.push("Related content is not keyboard focusable");
    const breadcrumb = page.locator(".breadcrumb a:visible").first();
    await breadcrumb.focus();
    if (!await breadcrumb.evaluate((node) => node === document.activeElement)) failures.push("Breadcrumb is not keyboard focusable");
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures };
}

async function runTouchJourney(browser, baseUrl) {
  const context = await createContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const failures = [];
  try {
    await gotoReady(page, `${baseUrl}/coloring-pages`);
    const toggle = page.getByRole("button", { name: "Open navigation menu" });
    await toggle.tap();
    if (!await page.getByRole("dialog", { name: "Browse coloring pages" }).isVisible()) failures.push("Touch did not open mobile navigation");
    await page.getByRole("button", { name: "Close" }).tap();
    if (await page.locator(".mobile-nav-panel").count()) failures.push("Touch close left the mobile panel mounted");
    const cardLink = page.locator(".gallery-item-media-link").first();
    const expected = await cardLink.getAttribute("href");
    await cardLink.tap();
    await page.waitForURL((url) => url.pathname === expected, { timeout: 15_000 });
    await page.goBack({ waitUntil: "load" });
    const printButton = page.locator(".gallery-print-button").first();
    await printButton.waitFor({ state: "visible" });
    await page.waitForTimeout(50);
    await printButton.tap();
    const dialog = page.getByRole("dialog");
    try {
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      failures.push("Card Print touch target did not open its dialog");
    }
    if (new URL(page.url()).pathname !== "/coloring-pages") failures.push("Card Print stole canonical navigation");
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures };
}

async function runReflow(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  let checks = 0;
  try {
    for (let index = 0; index < REFLOW_WIDTHS.length; index += 1) {
      const width = REFLOW_WIDTHS[index];
      await page.setViewportSize({ width, height: 900 });
      for (const route of REFLOW_ROUTES) {
        await gotoReady(page, `${baseUrl}${route}`);
        const metrics = await layoutMetrics(page);
        if (metrics.overflowPx > 1) failures.push(`${route} equivalent ${[100, 125, 150, 200, 300, 400][index]}%: ${metrics.overflowPx}px overflow`);
        if (metrics.clipped.length) failures.push(`${route}@${width}: clipped ${metrics.clipped.join(", ")}`);
        checks += 1;
      }
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, checks, method: "equivalent CSS viewport widths", factors: [100, 125, 150, 200, 300, 400] };
}

async function runTextEnlargement(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  let checks = 0;
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    for (const factor of [1, 1.5, 2]) {
      for (const route of ["/", "/coloring-pages", PRINTABLE, "/privacy"] ) {
        await gotoReady(page, `${baseUrl}${route}`);
        await page.addStyleTag({ content: `html { font-size: ${factor * 16}px !important; }` });
        await page.waitForTimeout(25);
        const metrics = await layoutMetrics(page);
        if (metrics.overflowPx > 1) failures.push(`${route}@${factor * 100}% text: ${metrics.overflowPx}px overflow`);
        if (metrics.clipped.length) failures.push(`${route}@${factor * 100}% text: clipped ${metrics.clipped.join(", ")}`);
        checks += 1;
      }
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, checks, factors: [100, 150, 200] };
}

async function runFocusScan(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  const samples = [];
  try {
    for (const route of ["/", "/coloring-pages", PRINTABLE]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await gotoReady(page, `${baseUrl}${route}`);
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      const seen = new Set();
      for (let index = 0; index < 80; index += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const node = document.activeElement;
          if (!(node instanceof HTMLElement) || node === document.body) return null;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            key: `${node.tagName}:${node.getAttribute("aria-label") || node.textContent?.trim().slice(0, 60) || node.id}`,
            tag: node.tagName.toLowerCase(),
            name: node.getAttribute("aria-label") || node.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) || "",
            visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && !node.closest("[inert]"),
            focusIndicator: parseFloat(style.outlineWidth) > 0 || style.boxShadow !== "none" || style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.textDecorationLine.includes("underline"),
            outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
            boxShadow: style.boxShadow,
          };
        });
        if (!focused || seen.has(focused.key)) break;
        seen.add(focused.key);
        samples.push({ route, ...focused });
        if (!focused.visible) failures.push(`${route}: hidden focus ${focused.key}`);
        if (!focused.name) failures.push(`${route}: unnamed focusable ${focused.key}`);
        if (!focused.focusIndicator) failures.push(`${route}: no visible focus ${focused.key}`);
      }
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, samples: samples.slice(0, 80), scanned: samples.length };
}

async function runSemanticAudit(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  const snapshots = [];
  try {
    for (const route of ["/", "/coloring-pages", PRINTABLE, "/privacy", "/sitemap"]) {
      await gotoReady(page, `${baseUrl}${route}`);
      const semantics = await page.evaluate(() => ({
        header: document.querySelectorAll("header.site-header").length,
        main: document.querySelectorAll("main").length,
        footer: document.querySelectorAll("footer.site-footer").length,
        h1: document.querySelectorAll("h1").length,
        unnamedButtons: [...document.querySelectorAll("button")].filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim())).length,
        unnamedLinks: [...document.querySelectorAll("a[href]")].filter((link) => !(link.getAttribute("aria-label") || link.textContent?.trim() || link.querySelector("img[alt]"))).length,
        missingAlt: document.querySelectorAll("img:not([alt])").length,
        brokenControls: [...document.querySelectorAll("[aria-controls]")].filter((node) => {
          const expanded = node.getAttribute("aria-expanded");
          return expanded === "true" && !document.getElementById(node.getAttribute("aria-controls"));
        }).length,
        nestedInteractive: document.querySelectorAll("a button,button a,a input,button input").length,
        breadcrumbs: document.querySelectorAll("nav[aria-label='Breadcrumb']").length,
      }));
      if (semantics.main !== 1 || semantics.h1 !== 1 || semantics.unnamedButtons || semantics.unnamedLinks || semantics.missingAlt || semantics.brokenControls || semantics.nestedInteractive) {
        failures.push(`${route}: ${JSON.stringify(semantics)}`);
      }
      const main = page.locator("main");
      snapshots.push({ route, main: typeof main.ariaSnapshot === "function" ? (await main.ariaSnapshot()).slice(0, 1200) : "ariaSnapshot unavailable" });
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, snapshots };
}

async function runLiveRegionAudit(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  try {
    await gotoReady(page, `${baseUrl}/`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const input = page.getByRole("searchbox", { name: "Search coloring pages" });
    await input.fill("animals");
    await page.waitForTimeout(300);
    const searchRegions = await page.locator("[aria-live], [role='status'], [role='alert']").evaluateAll((nodes) => nodes.map((node) => ({ role: node.getAttribute("role"), live: node.getAttribute("aria-live"), atomic: node.getAttribute("aria-atomic"), text: node.textContent.trim() })));
    if (searchRegions.filter((region) => region.text && /result|search/i.test(region.text)).length !== 1) failures.push("Search did not retain one restrained result announcement");
    await page.keyboard.press("Escape");
    if (await page.locator(".global-search-status").count()) failures.push("Search live region persisted after dialog close");
    await gotoReady(page, `${baseUrl}${PRINTABLE}`);
    const printable = await page.locator("[aria-live], [role='status'], [role='alert']").evaluateAll((nodes) => nodes.map((node) => ({ role: node.getAttribute("role"), live: node.getAttribute("aria-live"), atomic: node.getAttribute("aria-atomic") })));
    if (!printable.some((region) => region.role === "status" && region.live === "polite" && region.atomic === "true")) failures.push("Printable status region is missing its restrained polite contract");
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures };
}

async function runReducedMotion(browser, baseUrl) {
  const context = await createContext(browser, { reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = [];
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoReady(page, `${baseUrl}/`);
    const trigger = page.getByRole("button", { name: "Categories", exact: true });
    const transition = await trigger.locator(".disclosure-chevron").evaluate((node) => ({ duration: getComputedStyle(node).transitionDuration, animation: getComputedStyle(node).animationName }));
    if (!/^0(?:s|ms)(?:,\s*0(?:s|ms))*$/.test(transition.duration) && transition.duration !== "0.01ms") failures.push(`Chevron transition remains ${transition.duration}`);
    await trigger.click();
    if (await trigger.getAttribute("aria-expanded") !== "true") failures.push("Reduced motion removed disclosure state change");
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures };
}

async function runForcedColors(browser, specification, baseUrl) {
  if (specification.engine !== "Blink") return { passed: true, failures: [], supported: false, limitation: "Playwright forced-colors emulation is recorded only for installed Chromium channels." };
  const context = await createContext(browser, { forcedColors: "active" });
  const page = await context.newPage();
  const failures = [];
  const samples = [];
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const [route, selector] of [["/", ".site-nav-link"], [PRINTABLE, ".related-link"]]) {
      await gotoReady(page, `${baseUrl}${route}`);
      const target = page.locator(selector).first();
      await target.focus();
      const style = await target.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { outlineWidth: computed.outlineWidth, outlineStyle: computed.outlineStyle, color: computed.color, background: computed.backgroundColor };
      });
      samples.push({ route, selector, ...style });
      if (parseFloat(style.outlineWidth) < 2 || style.outlineStyle === "none") failures.push(`${route} ${selector}: forced-colors focus outline missing`);
    }
    await page.screenshot({ path: path.join(REVIEW_DIR, `${specification.id}-forced-colors-focus.png`), fullPage: false });
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, supported: true, samples };
}

async function runPrintCss(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  const checks = [];
  try {
    await page.emulateMedia({ media: "print" });
    for (const route of ["/", "/privacy", PRINTABLE]) {
      await gotoReady(page, `${baseUrl}${route}`);
      const values = await page.evaluate(() => {
        const display = (selector) => document.querySelector(selector) ? getComputedStyle(document.querySelector(selector)).display : null;
        return {
          header: display(".site-header"), footer: display(".site-footer"), ad: display(".ad-slot"),
          buttonDisplays: [...document.querySelectorAll("button")].map((node) => getComputedStyle(node).display),
          main: display("main"), printableColumns: document.querySelector(".printable-main") ? getComputedStyle(document.querySelector(".printable-main")).gridTemplateColumns : null,
        };
      });
      checks.push({ route, ...values });
      if (values.header !== "none" || values.footer !== "none" || values.buttonDisplays.some((display) => display !== "none") || values.main === "none") failures.push(`${route}: application chrome leaked into print`);
      if (route === PRINTABLE && values.printableColumns?.trim().split(/\s+/).length !== 1) failures.push("Printable browser page did not collapse to one print column");
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, checks, limitation: "CSS print emulation only; native print dialog was not inspected." };
}

async function runDownloads(browser, baseUrl, tempRoot) {
  const context = await createContext(browser, { acceptDownloads: true });
  const page = await context.newPage();
  const failures = [];
  const files = [];
  try {
    await context.addInitScript(() => {
      window.__downloadQa = { created: 0, revoked: 0, active: new Set() };
      const schedule = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay = 0, ...args) => schedule(callback, delay === 30_000 ? 0 : delay, ...args);
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        window.__downloadQa.created += 1;
        window.__downloadQa.active.add(url);
        return url;
      };
      URL.revokeObjectURL = (url) => {
        window.__downloadQa.revoked += 1;
        window.__downloadQa.active.delete(url);
        return revoke(url);
      };
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoReady(page, `${baseUrl}${PRINTABLE}`);
    const actions = [
      ["pdf", "Download PDF", ".pdf", "%PDF"],
      ["pdf-repeat", "Download PDF", ".pdf", "%PDF"],
      ["png", "Download PNG", ".png", "89504e47"],
      ["jpg", "Download JPG", ".jpg", "ffd8ff"],
      ["webp", "Download WebP", ".webp", "RIFF"],
    ];
    for (const [id, label, extension, magic] of actions) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 90_000 }),
        page.getByRole("button", { name: new RegExp(`^${label}`) }).click(),
      ]);
      const suggested = download.suggestedFilename();
      const sourcePath = await download.path();
      const bytes = await readFile(sourcePath);
      const prefix = magic === "89504e47" || magic === "ffd8ff" ? bytes.subarray(0, 4).toString("hex") : bytes.subarray(0, 4).toString("ascii");
      const destination = path.join(tempRoot, `${Date.now()}-${suggested}`);
      await download.saveAs(destination);
      const correctMagic = magic === "89504e47" ? prefix === magic : magic === "ffd8ff" ? prefix.startsWith(magic) : prefix === magic;
      files.push({ id, filename: suggested, bytes: bytes.length, prefix });
      if (!suggested.endsWith(extension) || !correctMagic || bytes.length === 0) failures.push(`${id}: invalid ${suggested} (${bytes.length} bytes, ${prefix})`);
      await page.waitForTimeout(175);
    }
    const lifecycle = await page.evaluate(() => ({ created: window.__downloadQa.created, revoked: window.__downloadQa.revoked, active: window.__downloadQa.active.size, anchors: document.querySelectorAll("a[download]").length }));
    if (lifecycle.active || lifecycle.anchors || lifecycle.revoked < lifecycle.created) failures.push(`object URL cleanup ${JSON.stringify(lifecycle)}`);
    return { passed: failures.length === 0, failures, files, lifecycle, navigated: new URL(page.url()).pathname !== PRINTABLE };
  } finally {
    await context.close();
  }
}

async function runPrintHandoff(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  let result;
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoReady(page, `${baseUrl}${PRINTABLE}`);
    await page.getByRole("button", { name: "Print", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    const printButton = dialog.getByRole("button", { name: /^Print/ });
    const closeButton = dialog.getByRole("button", { name: "Close" });
    result = { dialogVisible: await dialog.isVisible(), printButtonVisible: await printButton.isVisible(), closeButtonVisible: await closeButton.isVisible(), iframeCount: await page.locator("iframe").count() };
    if (!result.dialogVisible || !result.printButtonVisible || !result.closeButtonVisible) failures.push("Print preview handoff controls unavailable");
    await closeButton.click();
    if (await dialog.count()) failures.push("Print preview did not clean up after Close");
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, ...result, limitation: "Preview and handoff controls verified; native OS print dialog was not invoked." };
}

async function runImageScroll(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  const checks = [];
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const route of ["/coloring-pages/animals", "/coloring-pages/christmas", "/coloring-pages/plushies/page/36"]) {
      await gotoReady(page, `${baseUrl}${route}`);
      await page.evaluate(async () => {
        for (let top = 0; top < document.documentElement.scrollHeight; top += 700) {
          scrollTo(0, top);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        scrollTo(0, document.documentElement.scrollHeight);
      });
      await page.waitForTimeout(250);
      const values = await page.evaluate(() => ({
        images: document.images.length,
        broken: [...document.images].filter((image) => image.currentSrc && image.complete && image.naturalWidth === 0).length,
        collapsedCards: [...document.querySelectorAll(".gallery-item")].filter((card) => card.getBoundingClientRect().height < 100).length,
        layoutShift: window.__compatQa?.layoutShift || 0,
      }));
      checks.push({ route, ...values });
      if (values.broken || values.collapsedCards || values.layoutShift > 0.1) failures.push(`${route}: ${JSON.stringify(values)}`);
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, checks };
}

async function runFontFallback(browser, baseUrl) {
  const context = await createContext(browser, {}, { blockFonts: true });
  const page = await context.newPage();
  const failures = [];
  const checks = [];
  try {
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/coloring-pages", PRINTABLE]) {
        await gotoReady(page, `${baseUrl}${route}`);
        const metrics = await layoutMetrics(page);
        checks.push({ route, width, ...metrics });
        if (metrics.overflowPx > 1 || metrics.clipped.length) failures.push(`${route}@${width}: fallback-font layout ${JSON.stringify(metrics)}`);
      }
    }
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, checks };
}

async function runOrientationSimulation(browser, baseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();
  const failures = [];
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, `${baseUrl}/coloring-pages`);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    if (!await page.locator(".mobile-nav-panel").isVisible()) failures.push("Landscape-width mobile menu became unreachable");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(50);
    const desktop = await page.evaluate(() => ({ panel: document.querySelector(".mobile-nav-panel") !== null, inert: document.querySelector(".site-shell")?.hasAttribute("inert") || false, overflow: getComputedStyle(document.body).overflow, focus: document.activeElement?.className || "" }));
    if (desktop.panel || desktop.inert || desktop.overflow === "hidden" || !String(desktop.focus).includes("brand")) failures.push(`desktop transition cleanup ${JSON.stringify(desktop)}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(75);
    const final = await layoutMetrics(page);
    if (final.overflowPx > 1) failures.push(`portrait return overflow ${final.overflowPx}px`);
  } finally {
    await context.close();
  }
  return { passed: failures.length === 0, failures, limitation: "Viewport resizing simulates orientation; this is not real iOS rotation." };
}

async function createContext(browser, options = {}, routing = {}) {
  const context = await browser.newContext(options);
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i, (route) => route.abort("blockedbyclient"));
  await context.route("https://assets.ilovecoloringpage.com/coloring-pages/**", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/coloring-pages\//, "");
    const filePath = path.resolve(ASSET_ROOT, pathname);
    if (!filePath.startsWith(path.resolve(ASSET_ROOT)) || !existsSync(filePath)) return route.abort("failed");
    await route.fulfill({ path: filePath, contentType: contentType(filePath), headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=31536000" } });
  });
  if (routing.blockFonts) await context.route(/\.woff2(?:\?|$)/i, (route) => route.abort("blockedbyclient"));
  await context.addInitScript(() => {
    window.__compatQa = { layoutShift: 0, longTasks: [] };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__compatQa.layoutShift += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__compatQa.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  return context;
}

async function gotoReady(page, url) {
  const response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  if (!response || (response.status() !== 200 && response.status() !== 404)) throw new Error(`${url}: HTTP ${response?.status() || 0}`);
  await page.locator("main").waitFor({ state: "visible" });
  await page.waitForTimeout(50);
  return response;
}

function captureDiagnostics(page) {
  const errors = [];
  const consoleListener = (message) => {
    if (message.type() !== "error") return;
    const value = message.text();
    if (ignoreRuntimeDiagnostic(value)) return;
    errors.push(value);
  };
  const pageErrorListener = (error) => {
    if (!ignoreRuntimeDiagnostic(error.message)) errors.push(error.message);
  };
  page.on("console", consoleListener);
  page.on("pageerror", pageErrorListener);
  return {
    finish() {
      page.off("console", consoleListener);
      page.off("pageerror", pageErrorListener);
      return errors;
    },
  };
}

function ignoreRuntimeDiagnostic(value) {
  return /googlesyndication|doubleclick|ERR_BLOCKED_BY_CLIENT|Failed to load resource.*404|due to access control checks/i.test(value);
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const clipped = [...document.querySelectorAll("button,a[href],input,summary")].filter(visible).filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const clipsInlineContent = /hidden|clip/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2;
      return rect.left < -1 || rect.right > innerWidth + 1 || clipsInlineContent;
    }).slice(0, 6).map((node) => node.getAttribute("aria-label") || node.textContent?.trim().replace(/\s+/g, " ").slice(0, 50) || node.tagName);
    return { overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), clipped };
  });
}

async function waitForActive(page, selector) {
  await page.waitForFunction((value) => document.activeElement?.matches(value), selector, { timeout: 2_000 });
}

function inspectCssFeatures() {
  const css = ["tokens.css", "base.css", "layout.css", "components.css"].map((file) => readFileSync(path.join(ROOT, "src", "styles", file), "utf8")).join("\n");
  const features = ["aspect-ratio", "min(", "max(", "clamp(", "gap:", "display: grid", "display: flex", "position: sticky", "position: fixed", "inset:", "overflow:", "scrollbar-gutter", "content-visibility", "contain:", ":focus-visible", ":has(", "dvh", "svh", "lvh", "text-wrap", "overflow-wrap", "word-break", "appearance:", "object-fit", "object-position", "@supports", "prefers-reduced-motion", "prefers-contrast", "@media print"];
  return Object.fromEntries(features.map((feature) => [feature, (css.match(new RegExp(escapeRegex(feature), "g")) || []).length]));
}

function assertBuildExists() {
  if (!existsSync(path.join(OUT, "index.html"))) throw new Error("out/ is missing; run npm run build before cross-browser QA.");
  if (!existsSync(ASSET_ROOT)) throw new Error("Local R2 review bundle is missing; real-media and download QA cannot run.");
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
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

function send404(response) {
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  createReadStream(path.join(OUT, "404.html")).pipe(response);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" })[extension] || "application/octet-stream";
}

function maximum(values) {
  return Math.max(0, ...values.filter(Number.isFinite));
}

function firstLine(error) {
  return String(error?.message || error).split(/\r?\n/)[0];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll("\\", "/");
}
