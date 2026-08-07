#!/usr/bin/env node

const { createReadStream, existsSync, readFileSync, statSync } = require("node:fs");
const { mkdir, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const REVIEW_DIR = path.join(ROOT, "pipeline", "review", "internal-link-crawlability");
const VIEWPORTS = [390, 768, 1024, 1440, 1920, 2400, 3440];
const BROWSERS = [
  { id: "chrome", channel: "chrome" },
  { id: "edge", channel: "msedge" },
];

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(path.join(OUT, "index.html"))) throw new Error("out/ is missing; run a production build before browser QA.");
  const printables = JSON.parse(readFileSync(path.join(ROOT, "src", "generated", "coloring", "runtime-printables.json"), "utf8")).records;
  const hubs = JSON.parse(readFileSync(path.join(ROOT, "src", "generated", "coloring", "runtime-hubs.json"), "utf8")).hubs;
  const smallHub = hubs
    .filter((entry) => entry.route !== "/coloring-pages" && entry.indexable && entry.sitemap)
    .sort((left, right) => left.assetCount - right.assetCount || left.route.localeCompare(right.route))[0];
  const printableSamples = selectPrintableSamples(printables, 5).map((entry) => entry.canonicalPath);
  const routes = [
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    smallHub.route,
    "/coloring-pages/christmas",
    "/coloring-pages/animals/page/2",
    ...printableSamples,
    "/privacy",
    "/terms",
    "/about",
    "/sitemap",
    "/missing-internal-link-route",
  ];
  await mkdir(REVIEW_DIR, { recursive: true });
  const server = await startStaticServer();
  const results = {
    measurementClass: "local generated-export browser QA",
    engineNote: "Chrome and Edge are both Chromium-based coverage.",
    viewports: VIEWPORTS,
    routes,
    printableSamples,
    smallHub: { route: smallHub.route, assetCount: smallHub.assetCount },
    browsers: [],
    interactionChecks: null,
    evidence: [],
  };

  try {
    for (const browserSpec of BROWSERS) {
      let browser;
      try {
        browser = await chromium.launch({ channel: browserSpec.channel, headless: true });
      } catch (error) {
        results.browsers.push({ id: browserSpec.id, available: false, reason: firstLine(error) });
        continue;
      }
      try {
        const matrix = await runMatrix(browser, browserSpec.id, server.baseUrl, routes, results.evidence);
        results.browsers.push({
          id: browserSpec.id,
          engineCoverage: "Chromium",
          available: true,
          version: browser.version(),
          matrix,
        });
        if (browserSpec.id === "chrome") results.interactionChecks = await runInteractions(browser, server.baseUrl, printableSamples[0]);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }

  const available = results.browsers.filter((entry) => entry.available);
  const failures = available.flatMap((entry) => entry.matrix.failures);
  results.summary = {
    expectedBrowsersAvailable: available.length === BROWSERS.length,
    checks: available.reduce((sum, entry) => sum + entry.matrix.checks.length, 0),
    failures,
    interactionChecksPassed: results.interactionChecks?.passed === true,
  };
  results.summary.passed = results.summary.expectedBrowsersAvailable
    && failures.length === 0
    && results.summary.interactionChecksPassed;

  const output = path.join(REVIEW_DIR, "browser-qa-results.json");
  await writeFile(output, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: relative(output), ...results.summary }, null, 2));
  if (!results.summary.passed) process.exitCode = 1;
}

async function runMatrix(browser, browserId, baseUrl, routes, evidence) {
  const context = await browser.newContext();
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i, (route) => route.abort("blockedbyclient"));
  const checks = [];
  const failures = [];
  try {
    for (const width of VIEWPORTS) {
      for (const route of routes) {
        const page = await context.newPage();
        const consoleErrors = [];
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          const text = message.text();
          if (/googlesyndication|doubleclick|ERR_BLOCKED_BY_CLIENT|Failed to load resource.*404/i.test(text)) return;
          consoleErrors.push(text);
        });
        try {
          await page.setViewportSize({ width, height: width <= 768 ? 900 : 1000 });
          const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForTimeout(100);
          const snapshot = await page.evaluate(() => {
            const anchors = [...document.querySelectorAll("a[href]")];
            const duplicateIds = [...document.querySelectorAll("[id]")]
              .map((element) => element.id)
              .filter((id, index, ids) => id && ids.indexOf(id) !== index);
            return {
              marker: document.querySelector("[data-link-graph-version='static-crawl-v1']") !== null,
              h1Count: document.querySelectorAll("h1").length,
              canonicalCount: document.querySelectorAll("link[rel~='canonical']").length,
              horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
              anchorCount: anchors.length,
              emptyAnchorNames: anchors.filter((anchor) => !(anchor.getAttribute("aria-label") || anchor.textContent || anchor.querySelector("img")?.alt || "").trim()).length,
              pageOneLinks: anchors.filter((anchor) => /\/page\/1(?:$|[?#])/.test(anchor.getAttribute("href") || "")).length,
              queryLinks: anchors.filter((anchor) => /^\/(?!_next\/)[^#?]*\?/.test(anchor.getAttribute("href") || "")).length,
              svgLinks: anchors.filter((anchor) => /\.svg(?:$|[?#])/i.test(anchor.getAttribute("href") || "")).length,
              duplicateIds: [...new Set(duplicateIds)],
              breadcrumbLinkCount: document.querySelectorAll("nav[aria-label='Breadcrumb'] a[href]").length,
              visibleRelatedLinkCount: [...document.querySelectorAll("[data-page-section='related-collections'] a[href], .printable-related-section a[href]")]
                .filter((anchor) => anchor.getClientRects().length > 0).length,
            };
          });
          const expectedStatus = route === "/missing-internal-link-route" ? 404 : 200;
          const passed = response?.status() === expectedStatus
            && snapshot.marker
            && snapshot.h1Count === 1
            && (expectedStatus === 404 || snapshot.canonicalCount === 1)
            && !snapshot.horizontalOverflow
            && snapshot.emptyAnchorNames === 0
            && snapshot.pageOneLinks === 0
            && snapshot.queryLinks === 0
            && snapshot.svgLinks === 0
            && snapshot.duplicateIds.length === 0
            && consoleErrors.length === 0;
          const record = { browser: browserId, route, width, status: response?.status(), passed, consoleErrors, ...snapshot };
          checks.push(record);
          if (!passed) failures.push(`${browserId}:${route}@${width}`);

          if (browserId === "chrome" && ((route === "/coloring-pages/animals" && [390, 1440].includes(width)) || (route.includes("/page/2") && width === 1024))) {
            const name = `chrome-${width}-${route.includes("page/2") ? "pagination" : "animals"}.png`;
            await page.screenshot({ path: path.join(REVIEW_DIR, name), fullPage: false });
            evidence.push(`pipeline/review/internal-link-crawlability/${name}`);
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

async function runInteractions(browser, baseUrl, printableRoute) {
  const context = await browser.newContext();
  await context.route(/googlesyndication|doubleclick|googletagservices|googleadservices/i, (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  const checks = [];
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/coloring-pages/animals`, { waitUntil: "domcontentloaded" });
    const next = page.locator("nav[aria-label='Gallery pagination'] a", { hasText: "Next" });
    await clickAndWaitForPath(page, next, "/coloring-pages/animals/page/2");
    checks.push({ name: "pagination-next", actualPath: new URL(page.url()).pathname, passed: new URL(page.url()).pathname === "/coloring-pages/animals/page/2" });

    await page.goto(`${baseUrl}${printableRoute}`, { waitUntil: "domcontentloaded" });
    const hubLink = page.locator("nav[aria-label='Breadcrumb'] a").last();
    const hubHref = await hubLink.getAttribute("href");
    await clickAndWaitForPath(page, hubLink, hubHref);
    checks.push({ name: "printable-primary-hub", href: hubHref, actualPath: new URL(page.url()).pathname, passed: new URL(page.url()).pathname === hubHref });

    await page.goto(`${baseUrl}/sitemap`, { waitUntil: "domcontentloaded" });
    const sitemapLink = page.locator(".html-sitemap-link-list a").first();
    const sitemapHref = await sitemapLink.getAttribute("href");
    await clickAndWaitForPath(page, sitemapLink, sitemapHref);
    checks.push({ name: "html-sitemap-hub", href: sitemapHref, actualPath: new URL(page.url()).pathname, passed: new URL(page.url()).pathname === sitemapHref });

    await page.goto(`${baseUrl}/coloring-pages`, { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, name: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() }));
    checks.push({ name: "keyboard-link-focus", focus, passed: ["A", "BUTTON"].includes(focus.tag) && Boolean(focus.name) });
  } finally {
    await context.close();
  }
  return { checks, passed: checks.every((entry) => entry.passed) };
}

async function clickAndWaitForPath(page, locator, expectedPath) {
  await Promise.all([
    page.waitForURL((url) => url.pathname === expectedPath, { timeout: 15_000 }),
    locator.click(),
  ]);
}

function selectPrintableSamples(records, count) {
  const chosen = [];
  const categories = new Set();
  for (const record of records) {
    if (categories.has(record.primaryCategorySlug)) continue;
    categories.add(record.primaryCategorySlug);
    chosen.push(record);
    if (chosen.length === count) break;
  }
  return chosen;
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
    server.listen(3005, "127.0.0.1", resolve);
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
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function firstLine(error) {
  return String(error?.message || error).split(/\r?\n/)[0];
}

function relative(value) {
  return path.relative(ROOT, value).replaceAll("\\", "/");
}
