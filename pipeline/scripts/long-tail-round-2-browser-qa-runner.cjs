#!/usr/bin/env node

const { createReadStream, existsSync, statSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = process.cwd();
const RUN_ID = "long-tail-round-2-browser-qa";
const OUT_DIR = path.join(REPO_ROOT, "out");
const SCREENSHOT_DIR = path.join(REPO_ROOT, "pipeline", "review", "long-tail-round-2", "screenshots");
const MANIFEST_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "long-tail-round-2-browser-qa-results.json");
const REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "long-tail-round-2-browser-qa-report.md");
const ACCEPTANCE_PATH = path.join(REPO_ROOT, "pipeline", "manifests", "long-tail-round-2-acceptance-gate.json");
const ACCEPTANCE_REPORT_PATH = path.join(REPO_ROOT, "pipeline", "reports", "long-tail-round-2-acceptance-gate.md");

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const playwright = require("playwright");
  const promoted = await readJson("pipeline/manifests/long-tail-round-2-promoted-hubs.json");
  const promotedSlugs = promoted.hubs.map((hub) => hub.slug);
  const inspectedRoutes = unique([
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/t-rex",
    "/coloring-pages/christmas",
    "/coloring-pages/anime-girls",
    "/coloring-pages/dogs",
    "/coloring-pages/flowers",
    "/coloring-pages/dinosaurs",
    ...promotedSlugs.map((slug) => `/coloring-pages/${slug}`),
  ]);

  const build = runBuild();
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const server = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, acceptDownloads: true });
  await installLocalAssetCorsRoute(context);
  await installLocalAssetCorsRoute(mobileContext);
  const consoleErrors = [];
  const routeResults = [];
  const screenshotPaths = [];
  let printDownloadCheck = null;
  let navReachabilityCheck = null;
  let mobileNavCheck = null;

  try {
    for (const route of inspectedRoutes) {
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push({ route, text: message.text() });
      });
      await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(250);
      const metrics = await collectRouteMetrics(page);
      const screenshotPath = path.join(SCREENSHOT_DIR, `${slugForRoute(route)}-desktop.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      screenshotPaths.push(toRepoPath(screenshotPath));
      routeResults.push({ route, viewport: "desktop", ...metrics, screenshotPath: toRepoPath(screenshotPath) });
      await page.close();
    }

    printDownloadCheck = await runPrintAndDownloadCheck(context, baseUrl, promotedSlugs[0] || "animals");
    navReachabilityCheck = await runMoreMenuReachabilityCheck(context, baseUrl, promoted.hubs.slice(0, 8));
    mobileNavCheck = await runMobileReachabilityCheck(mobileContext, baseUrl, promoted.hubs[0]);
  } finally {
    await context.close();
    await mobileContext.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const summary = {
    buildRan: build.status === 0,
    routesInspected: routeResults.length,
    promotedRoutesInspected: routeResults.filter((result) => promotedSlugs.some((slug) => result.route === `/coloring-pages/${slug}`)).length,
    allPromotedRoutesInspected: promotedSlugs.every((slug) => routeResults.some((result) => result.route === `/coloring-pages/${slug}`)),
    routesLoad: routeResults.every((result) => result.loaded && result.h1Text.length > 0),
    galleryWebpPreviewsRender: routeResults.every((result) => result.webpImageCount > 0),
    noBrokenImages: routeResults.every((result) => result.visibleBrokenImageCount === 0),
    noPreviewUnavailableForVisibleRecords: routeResults.every((result) => result.previewUnavailableCount === 0),
    printWorks: printDownloadCheck?.printPdfPrepared === true && printDownloadCheck?.printPdfSnapshot?.pageCount === 1,
    pngDownloadWorks: printDownloadCheck?.downloads?.png === true,
    jpgDownloadWorks: printDownloadCheck?.downloads?.jpg === true,
    webpDownloadWorks: printDownloadCheck?.downloads?.webp === true,
    svgDownloadAbsent: routeResults.every((result) => result.svgDownloadVisible === false) && printDownloadCheck?.svgDownloadAbsent === true,
    noHorizontalOverflow: routeResults.every((result) => !result.horizontalOverflow),
    navigationSearchCanReachNewHubs: navReachabilityCheck?.passed === true,
    mobileNavCanReachNewHub: mobileNavCheck?.passed === true,
    noConsoleErrors: consoleErrors.length === 0,
  };
  summary.browserQaPassed = Object.values(summary).every((value) => value === true || typeof value === "number");
  const blockers = buildBlockers(summary, build, consoleErrors);

  const payload = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    browserPath: "standalone-playwright-runner",
    browserPathReason: "This round requires a committed local QA script and local screenshot artifacts.",
    baseUrl,
    assetCorsMode: "local-playwright-svg-fulfill-for-browser-conversion",
    assetCorsModeReason:
      "The committed local QA runner serves the static export from 127.0.0.1, while the asset CDN CORS policy is verified separately for the production origin.",
    inspectedRoutes,
    promotedSlugs,
    build,
    summary,
    routeResults,
    printDownloadCheck,
    navReachabilityCheck,
    mobileNavCheck,
    consoleErrors,
    screenshotDirectory: toRepoPath(SCREENSHOT_DIR),
    screenshotPaths,
    blockers,
  };

  await writeJsonAbsolute(MANIFEST_PATH, payload);
  await writeTextAbsolute(REPORT_PATH, renderReport(payload));
  await updateAcceptanceGate(payload);
  console.log(JSON.stringify({ runId: RUN_ID, browserQaPassed: summary.browserQaPassed, routes: routeResults.length, blockers }, null, 2));
  if (!summary.browserQaPassed) process.exitCode = 1;
}

function runBuild() {
  const startedAt = new Date().toISOString();
  const env = { ...process.env };
  delete env.NEXT_PUBLIC_SITE_URL;
  delete env.NEXT_PUBLIC_COLORING_ASSET_BASE_URL;
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    timeout: 240_000,
  });
  return {
    command: "npm run build",
    startedAt,
    finishedAt: new Date().toISOString(),
    status: result.status,
    error: result.error?.message || null,
    stdoutTail: tail(result.stdout || "", 60),
    stderrTail: tail(result.stderr || "", 60),
  };
}

async function startStaticServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = resolveStaticPath(url.pathname);
    if (!filePath || !existsSync(filePath)) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }
    const type = contentTypeFor(filePath);
    response.writeHead(200, { "content-type": type });
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.port = server.address().port;
  return server;
}

function resolveStaticPath(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = [];
  if (!cleanPath) candidates.push(path.join(OUT_DIR, "index.html"));
  else {
    candidates.push(path.join(OUT_DIR, cleanPath));
    candidates.push(path.join(OUT_DIR, `${cleanPath}.html`));
    candidates.push(path.join(OUT_DIR, cleanPath, "index.html"));
  }
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
}

async function collectRouteMetrics(page) {
  return page.evaluate(() => {
    const isVisible = (node) => {
      const box = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    };
    const visibleBrokenImages = [...document.images].filter((image) => isVisible(image) && image.complete && image.naturalWidth === 0);
    const bodyText = document.body.textContent || "";
    const actionText = [...document.querySelectorAll("a, button, summary")].map((node) => (node.textContent || "").trim()).join("\n");
    return {
      loaded: document.readyState === "complete",
      title: document.title,
      h1Text: (document.querySelector("h1")?.textContent || "").trim(),
      imageCount: document.images.length,
      webpImageCount: [...document.images].filter((image) => (image.currentSrc || image.src).includes("/webp/") && image.naturalWidth > 0).length,
      visibleBrokenImageCount: visibleBrokenImages.length,
      previewUnavailableCount: (bodyText.match(/Preview unavailable/g) || []).length,
      svgDownloadVisible: /Download SVG|^SVG$/im.test(actionText),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      searchInputCount: document.querySelectorAll('input[type="search"]').length,
      galleryCardCount: document.querySelectorAll(".gallery-item").length,
    };
  });
}

async function runPrintAndDownloadCheck(context, baseUrl, slug) {
  const page = await context.newPage();
  const downloads = { png: false, jpg: false, webp: false };
  let printPdfPrepared = false;
  let printPdfSnapshot = null;
  try {
    await page.goto(`${baseUrl}/coloring-pages/${slug}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.locator(".gallery-item-media-button").first().click({ timeout: 15_000 });
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".print-preview-media img").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("button", { name: /^Print$/ }).click({ timeout: 15_000 });
    await page.waitForFunction(() => window.__ILCP_LAST_PRINT_DOCUMENT__?.pageCount === 1, null, { timeout: 45_000 });
    printPdfSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__ || null);
    printPdfPrepared = printPdfSnapshot?.pageCount === 1 && printPdfSnapshot?.printableBorderCount === 1;
    for (const [key, label] of Object.entries({ png: "Download PNG", jpg: "Download JPG", webp: "Download WebP" })) {
      const download = page.waitForEvent("download", { timeout: 45_000 });
      await page.getByRole("button", { name: new RegExp(label, "i") }).click({ timeout: 15_000 });
      await download;
      downloads[key] = true;
    }
    const svgDownloadAbsent = (await page.getByText(/Download SVG|^SVG$/i).count()) === 0;
    return { route: `/coloring-pages/${slug}`, printPdfPrepared, printPdfSnapshot, downloads, svgDownloadAbsent };
  } catch (error) {
    const dialogText = await page.getByRole("dialog").textContent().catch(() => "");
    return {
      route: `/coloring-pages/${slug}`,
      printPdfPrepared,
      printPdfSnapshot,
      downloads,
      svgDownloadAbsent: false,
      dialogText,
      error: error?.message || String(error),
    };
  } finally {
    await page.close();
  }
}

async function installLocalAssetCorsRoute(context) {
  await context.route("https://assets.ilovecoloringpage.com/coloring-pages/svg/**", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
      },
    });
  });
}

async function runMoreMenuReachabilityCheck(context, baseUrl, hubs) {
  const page = await context.newPage();
  const results = [];
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
    for (const hub of hubs) {
      await page.getByRole("button", { name: "More" }).click({ timeout: 10_000 });
      const panel = page.locator(".hub-menu-panel-desktop");
      await panel.waitFor({ state: "visible", timeout: 10_000 });
      await panel.locator('input[type="search"]').first().fill(hub.slug);
      const link = panel.getByRole("link", { name: new RegExp(escapeRegExp(hub.title.replace(/\s+Coloring Pages$/i, "")), "i") }).first();
      const found = (await link.count()) > 0;
      results.push({ slug: hub.slug, found });
      await page.keyboard.press("Escape");
    }
    return { checked: results.length, results, passed: results.every((result) => result.found) };
  } finally {
    await page.close();
  }
}

async function runMobileReachabilityCheck(context, baseUrl, hub) {
  if (!hub) return { checked: 0, passed: true };
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.getByRole("button", { name: /Open navigation menu/i }).click({ timeout: 10_000 });
    const panel = page.locator(".mobile-nav-panel");
    await panel.waitFor({ state: "visible", timeout: 10_000 });
    await panel.locator('input[type="search"]').first().fill(hub.slug);
    const found = (await panel.getByRole("link", { name: new RegExp(escapeRegExp(hub.title.replace(/\s+Coloring Pages$/i, "")), "i") }).count()) > 0;
    return { slug: hub.slug, found, passed: found };
  } finally {
    await page.close();
  }
}

function buildBlockers(summary, build, consoleErrors) {
  const blockers = [];
  if (build.status !== 0) blockers.push("Local static export build failed.");
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === "boolean" && value !== true && key !== "browserQaPassed") blockers.push(`${key} failed.`);
  }
  if (consoleErrors.length > 0) blockers.push("Console errors were detected.");
  return blockers;
}

async function updateAcceptanceGate(browserPayload) {
  if (!existsSync(ACCEPTANCE_PATH)) return;
  const acceptance = await readJsonAbsolute(ACCEPTANCE_PATH);
  acceptance.generatedAt = new Date().toISOString();
  acceptance.browser_qa_passed = browserPayload.summary.browserQaPassed;
  acceptance.blockers = (acceptance.blockers || []).filter((blocker) => !/browser qa/i.test(blocker));
  if (!browserPayload.summary.browserQaPassed) acceptance.blockers.push("Round 2 browser QA failed.");
  acceptance.ready_for_next_local_qa = acceptance.blockers.length === 0;
  await writeJsonAbsolute(ACCEPTANCE_PATH, acceptance);
  await writeTextAbsolute(ACCEPTANCE_REPORT_PATH, renderAcceptanceReport(acceptance));
}

function renderReport(payload) {
  const rows = Object.entries(payload.summary)
    .map(([key, value]) => `| ${key} | ${String(value)} |`)
    .join("\n");
  return `# Long-Tail Round 2 Browser QA Report

| Check | Result |
| --- | --- |
${rows}

Screenshots: \`${payload.screenshotDirectory}\`

Blockers:
${payload.blockers.length ? payload.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

function renderAcceptanceReport(acceptance) {
  const rows = Object.entries(acceptance)
    .filter(([key]) => !["generatedAt", "runId", "blockers"].includes(key))
    .map(([key, value]) => `| ${key} | ${Array.isArray(value) ? value.join(", ") : String(value)} |`)
    .join("\n");
  return `# Long-Tail Round 2 Acceptance Gate

| Field | Value |
| --- | --- |
${rows}

Blockers:
${acceptance.blockers.length ? acceptance.blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None"}
`;
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function slugForRoute(route) {
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toRepoPath(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");
}

function tail(text, maxLines) {
  return text.split(/\r?\n/).slice(-maxLines).join("\n");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function readJsonAbsolute(absolutePath) {
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function writeJsonAbsolute(absolutePath, value) {
  await writeTextAbsolute(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAbsolute(absolutePath, value) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, value, "utf8");
}
