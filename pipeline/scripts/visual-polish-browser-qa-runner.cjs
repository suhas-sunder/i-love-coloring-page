#!/usr/bin/env node

const { createReadStream, existsSync, statSync } = require("node:fs");
const { mkdir, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REVIEW_ROOT = path.join(ROOT, "pipeline", "review", "visual-polish");
const PRINTABLE = "/printables/animals/animals-alligator-4feec8505a";
const WIDTHS = [320, 390, 480, 768, 1024, 1280, 1440, 1920, 2400, 3440];
const ROUTES = [
  ["home", "/"],
  ["gallery", "/coloring-pages"],
  ["animals", "/coloring-pages/animals"],
  ["small-lotus", "/coloring-pages/lotus"],
  ["christmas", "/coloring-pages/christmas"],
  ["animals-page-2", "/coloring-pages/animals/page/2"],
  ["animals-last", "/coloring-pages/animals/page/31"],
  ["plushies-deep", "/coloring-pages/plushies/page/36"],
  ["printable", PRINTABLE],
  ["about", "/about"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["editorial", "/editorial-policy"],
  ["affiliate", "/affiliate-disclosure"],
  ["contact", "/contact"],
  ["sitemap", "/sitemap"],
  ["404", "/visual-polish-missing-route"],
];
const BROWSERS = [
  ["chrome", "chrome"],
  ["edge", "msedge"],
];
const SCREENSHOTS = new Map([
  ["home", [390, 1440, 3440]],
  ["gallery", [390, 1440]],
  ["animals", [390, 1440, 3440]],
  ["printable", [390, 1440]],
  ["privacy", [390, 1440]],
  ["sitemap", [1440]],
  ["404", [1440]],
]);

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const label = args.label || "after";
  const reviewDir = path.join(REVIEW_ROOT, label);
  await mkdir(reviewDir, { recursive: true });
  const server = args.baseUrl ? null : await startStaticServer();
  const baseUrl = args.baseUrl || server.baseUrl;
  const result = {
    measuredAt: new Date().toISOString(),
    measurementClass: args.baseUrl ? "published-browser verification" : "local production-build browser lab measurement",
    baseUrl,
    widths: WIDTHS,
    routes: ROUTES.map(([id, route]) => ({ id, route })),
    browsers: [],
    limitations: [
      "Chrome and Edge are both Chromium-based coverage.",
      "These are desktop lab measurements, not field or physical-device measurements.",
      "Ad network requests are blocked to avoid generating advertising traffic during visual QA.",
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
        result.browsers.push(await inspectBrowser(browser, id, baseUrl, reviewDir));
      } finally {
        await browser.close();
      }
    }
  } finally {
    if (server) await server.close();
  }

  const available = result.browsers.filter((entry) => entry.available);
  const checks = available.flatMap((entry) => entry.checks);
  result.summary = {
    expectedBrowsersAvailable: available.length === BROWSERS.length,
    checks: checks.length,
    failures: checks.filter((entry) => !entry.passed).map((entry) => `${entry.browser}:${entry.route}@${entry.width}`),
    maximumLayoutShift: maximum(checks.map((entry) => entry.layoutShift)),
    maximumLongTaskMs: maximum(checks.flatMap((entry) => entry.longTasks.map((task) => task.duration))),
  };
  result.summary.passed = result.summary.expectedBrowsersAvailable && result.summary.failures.length === 0;
  const output = path.join(reviewDir, "browser-qa-results.json");
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: relative(output), ...result.summary }, null, 2));
  if (!result.summary.passed) process.exitCode = 1;
}

async function inspectBrowser(browser, browserId, baseUrl, reviewDir) {
  const context = await browser.newContext();
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i, (route) => route.abort("blockedbyclient"));
  await context.addInitScript(() => {
    window.__VISUAL_QA__ = { layoutShift: 0, longTasks: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__VISUAL_QA__.layoutShift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__VISUAL_QA__.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  });
  const checks = [];
  try {
    for (const width of WIDTHS) {
      for (const [routeId, route] of ROUTES) {
        const page = await context.newPage();
        const consoleErrors = [];
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          const text = message.text();
          if (/googlesyndication|doubleclick|ERR_BLOCKED_BY_CLIENT|404 \(Not Found\)/i.test(text)) return;
          consoleErrors.push(text);
        });
        try {
          await page.setViewportSize({ width, height: width <= 480 ? 900 : 1000 });
          const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(300);
          const snapshot = await page.evaluate(() => {
            const visible = (element) => {
              if (!(element instanceof HTMLElement)) return false;
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            };
            const related = document.querySelector(".printable-related-collections");
            const relatedStyle = related ? getComputedStyle(related) : null;
            const links = related ? [...related.querySelectorAll(".related-link")] : [];
            return {
              marker: document.querySelector("[data-visual-polish-version='professional-sweep-v1']") !== null,
              h1Count: document.querySelectorAll("h1").length,
              horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
              brokenImages: [...document.images].filter((image) => visible(image) && image.complete && image.naturalWidth === 0).length,
              duplicateIds: [...document.querySelectorAll("[id]")].map((node) => node.id).filter((id, index, ids) => ids.indexOf(id) !== index),
              layoutShift: window.__VISUAL_QA__.layoutShift,
              longTasks: window.__VISUAL_QA__.longTasks,
              related: related ? {
                count: links.length,
                rowGap: relatedStyle.rowGap,
                columnGap: relatedStyle.columnGap,
                height: related.getBoundingClientRect().height,
                linkHeights: links.map((link) => link.getBoundingClientRect().height),
                hrefs: links.map((link) => link.getAttribute("href")),
              } : null,
            };
          });
          const expectedStatus = routeId === "404" ? 404 : 200;
          const passed = response?.status() === expectedStatus
            && snapshot.marker
            && snapshot.h1Count === 1
            && snapshot.horizontalOverflowPx === 0
            && snapshot.brokenImages === 0
            && snapshot.duplicateIds.length === 0
            && consoleErrors.length === 0
            && Math.max(0, ...snapshot.longTasks.map((entry) => entry.duration)) <= 200;
          checks.push({ browser: browserId, route: routeId, width, status: response?.status(), passed, consoleErrors, ...snapshot });

          if (browserId === "chrome" && SCREENSHOTS.get(routeId)?.includes(width)) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(reviewDir, `${routeId}-${width}.png`), fullPage: false });
          }
          if (browserId === "chrome" && routeId === "printable" && width === 1440) {
            const section = page.locator("[data-page-section='related-collections']");
            await section.scrollIntoViewIfNeeded();
            await section.screenshot({ path: path.join(reviewDir, "related-collections-1440.png") });
          }
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
  }
  return { id: browserId, engineCoverage: "Chromium", available: true, version: browser.version(), checks };
}

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--label") args.label = values[++index];
    if (values[index] === "--base-url") args.baseUrl = values[++index]?.replace(/\/$/, "");
  }
  return args;
}

async function startStaticServer() {
  if (!existsSync(path.join(OUT, "index.html"))) throw new Error("out/ is missing; run a production build before browser QA.");
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
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2" })[extension] || "application/octet-stream";
}

function maximum(values) {
  return Math.max(0, ...values.filter(Number.isFinite));
}

function firstLine(error) {
  return String(error?.message || error).split(/\r?\n/)[0];
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll("\\", "/");
}
