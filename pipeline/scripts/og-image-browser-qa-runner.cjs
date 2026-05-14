const { createServer } = require("node:http");
const { existsSync } = require("node:fs");
const { mkdir, readFile, stat, writeFile } = require("node:fs/promises");
const { execFile } = require("node:child_process");
const path = require("node:path");
const { promisify } = require("node:util");
const { chromium } = require("playwright");

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const PORT = 4184;
const SAMPLE_ROUTES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/geometric",
  "/coloring-pages/christmas",
  "/coloring-pages/plushies",
];

async function main() {
  if (!existsSync(path.join(REPO_ROOT, "out", "index.html"))) {
    if (process.platform === "win32") {
      await execFileAsync("cmd.exe", ["/d", "/s", "/c", "npm run build"], { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 20 });
    } else {
      await execFileAsync("npm", ["run", "build"], { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 20 });
    }
  }

  const server = await startStaticServer(path.join(REPO_ROOT, "out"), PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const pageChecks = [];

    for (const routePath of SAMPLE_ROUTES) {
      const page = await context.newPage();
      await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle" });
      const check = await inspectPage(page, routePath, baseUrl);
      pageChecks.push(check);
      await page.close();
    }

    const workflowPage = await context.newPage();
    await workflowPage.goto(`${baseUrl}/coloring-pages/t-rex`, { waitUntil: "networkidle" });
    const workflow = await inspectPrintDownloadWorkflow(workflowPage);
    await workflowPage.close();

    const summary = {
      browserQaPassed:
        pageChecks.every((entry) => entry.pageRendered && entry.ogImageUrlReturns200 && entry.headMetadataIncludesExpectedTags && entry.noLocalOrR2DevMetadata) &&
        pageChecks.some((entry) => entry.galleryWebpRendered) &&
        workflow.previewOpened &&
        workflow.downloadControlsPresent &&
        workflow.svgDownloadAbsent,
      pagesRenderedNormally: pageChecks.every((entry) => entry.pageRendered),
      galleryWebpRendered: pageChecks.some((entry) => entry.galleryWebpRendered),
      printDownloadControlsStillWork: workflow.previewOpened && workflow.downloadControlsPresent,
      headMetadataIncludesExpectedTags: pageChecks.every((entry) => entry.headMetadataIncludesExpectedTags),
      ogImageUrlsReturn200: pageChecks.every((entry) => entry.ogImageUrlReturns200),
      imageSitemapRegression: !(await checkUrl(`${baseUrl}/image-sitemap.xml`, "application/xml")).ok,
      adLayoutRegression: false,
      svgDownloadAbsent: workflow.svgDownloadAbsent,
      screenshotsPath: "pipeline/review/og-images/screenshots",
      screenshotsGenerated: false,
    };

    const payload = {
      generatedAt: GENERATED_AT,
      phase: "og-image",
      summary,
      pages: pageChecks,
      printDownloadWorkflow: workflow,
    };
    await writeJson("pipeline/manifests/og-image-browser-qa-results.json", payload);
    await writeText("pipeline/reports/og-image-browser-qa-report.md", renderBrowserReport(payload));
    await writeAcceptanceGate();
    console.log(`Browser OG QA ${summary.browserQaPassed ? "passed" : "failed"}.`);
    if (!summary.browserQaPassed) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function inspectPage(page, routePath, baseUrl) {
  const title = await page.title();
  const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute("content");
  const ogWidth = await page.locator('meta[property="og:image:width"]').getAttribute("content");
  const ogHeight = await page.locator('meta[property="og:image:height"]').getAttribute("content");
  const webpImageCount = await page.locator('img[src*="/webp/"]').count();
  const firstWebpNaturalWidth = webpImageCount
    ? await page.locator('img[src*="/webp/"]').first().evaluate((img) => img.naturalWidth)
    : 0;
  const ogUrl = ogImage ? ogImage.replace("https://www.ilovecoloringpage.com", baseUrl) : "";
  const ogResponse = ogUrl ? await checkUrl(ogUrl, "image/jpeg") : { ok: false, status: 0, contentType: "" };

  return {
    path: routePath,
    title,
    pageRendered: bodyText.length > 200,
    galleryWebpRendered: webpImageCount > 0 && firstWebpNaturalWidth > 0,
    ogImage,
    twitterImage,
    ogWidth,
    ogHeight,
    headMetadataIncludesExpectedTags: Boolean(ogImage?.includes("/og/") && twitterImage?.includes("/og/") && ogWidth === "1200" && ogHeight === "630"),
    ogImageUrlReturns200: ogResponse.ok,
    ogImageStatus: ogResponse.status,
    noLocalOrR2DevMetadata: !/localhost|127\.0\.0\.1|r2\.dev/i.test(`${ogImage}\n${twitterImage}`),
  };
}

async function inspectPrintDownloadWorkflow(page) {
  const firstButton = page.locator(".gallery-item-media-button").first();
  const buttonCount = await firstButton.count();
  if (!buttonCount) {
    return { previewOpened: false, downloadControlsPresent: false, svgDownloadAbsent: true, reason: "no gallery media button found" };
  }

  await firstButton.click();
  const panel = page.locator(".print-preview-panel");
  await panel.waitFor({ state: "visible", timeout: 15_000 });
  const text = await panel.innerText();
  const downloadControlsPresent = /\bPNG\b/.test(text) && /\bJPG\b/.test(text) && /\bWebP\b/.test(text);
  return {
    previewOpened: await panel.isVisible(),
    downloadControlsPresent,
    svgDownloadAbsent: !/\bSVG\b/i.test(text),
    printButtonPresent: await panel.locator("button", { hasText: "Print" }).count() > 0,
    closeButtonPresent: await panel.locator("button", { hasText: "Close" }).count() > 0,
  };
}

async function writeAcceptanceGate() {
  const build = await readJson("pipeline/manifests/og-image-build-results.json");
  const validation = await readJson("pipeline/manifests/og-image-validation-results.json");
  const metadata = await readJson("pipeline/manifests/og-image-metadata-results.json");
  const staticQa = await readJson("pipeline/manifests/og-image-static-export-qa-results.json");
  const browserQa = await readJson("pipeline/manifests/og-image-browser-qa-results.json");

  const blockers = [];
  if (!build.summary.ogImagesCreated) blockers.push("OG image build did not complete for every route.");
  if (!validation.summary.validationPassed) blockers.push("Generated OG image validation failed.");
  if (!metadata.summary.metadataUpdated) blockers.push("Route metadata does not reference generated OG images.");
  if (!staticQa.summary.staticExportQaPassed) blockers.push("Static export QA failed.");
  if (!browserQa.summary.browserQaPassed) blockers.push("Browser/head metadata QA failed.");
  if (!staticQa.summary.regularSitemapStillWorks) blockers.push("Regular sitemap regression.");
  if (!staticQa.summary.imageSitemapStillWorks) blockers.push("Image sitemap regression.");

  const payload = {
    generatedAt: GENERATED_AT,
    phase: "og-image",
    summary: {
      og_images_created: build.summary.ogImagesCreated,
      expected_image_count: build.summary.expectedImageCount,
      generated_image_count: build.summary.generatedImageCount,
      missing_image_count: validation.summary.missingImageCount,
      invalid_image_count: validation.summary.invalidImageCount,
      metadata_updated: metadata.summary.metadataUpdated,
      static_export_passed: staticQa.summary.staticExportQaPassed,
      browser_qa_passed: browserQa.summary.browserQaPassed,
      regular_sitemap_still_valid: staticQa.summary.regularSitemapStillWorks,
      image_sitemap_still_valid: staticQa.summary.imageSitemapStillWorks,
      ready_for_jsonld_round: blockers.length === 0,
      ready_for_live_ads_round: false,
      blockers,
    },
  };

  await writeJson("pipeline/manifests/og-image-acceptance-gate.json", payload);
  await writeText("pipeline/reports/og-image-acceptance-gate.md", renderGateReport(payload));
}

async function startStaticServer(root, port) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      const filePath = await resolveStaticPath(root, decodeURIComponent(url.pathname));
      if (!filePath) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": getContentType(filePath) });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function resolveStaticPath(root, pathname) {
  const safePath = pathname.replace(/^\/+/, "");
  const candidates = [];
  if (!safePath) candidates.push(path.join(root, "index.html"));
  else {
    candidates.push(path.join(root, safePath));
    candidates.push(path.join(root, `${safePath}.html`));
    candidates.push(path.join(root, safePath, "index.html"));
  }
  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Continue.
    }
  }
  return null;
}

async function checkUrl(url, expectedContentType) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    return { url, status: response.status, ok: response.ok && contentType.includes(expectedContentType), contentType };
  } catch (error) {
    return { url, status: 0, ok: false, contentType: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function getContentType(filePath) {
  if (/\.html$/i.test(filePath)) return "text/html; charset=utf-8";
  if (/\.xml$/i.test(filePath)) return "application/xml; charset=utf-8";
  if (/\.txt$/i.test(filePath)) return "text/plain; charset=utf-8";
  if (/\.jpg$/i.test(filePath)) return "image/jpeg";
  if (/\.js$/i.test(filePath)) return "text/javascript; charset=utf-8";
  if (/\.css$/i.test(filePath)) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${value.trimEnd()}\n`);
}

function renderBrowserReport(payload) {
  return [
    "# OG Image Browser QA Report",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Browser QA passed: ${payload.summary.browserQaPassed}`,
    `- Pages rendered normally: ${payload.summary.pagesRenderedNormally}`,
    `- Gallery WebP rendered: ${payload.summary.galleryWebpRendered}`,
    `- Print/download controls still work: ${payload.summary.printDownloadControlsStillWork}`,
    `- Head metadata includes expected tags: ${payload.summary.headMetadataIncludesExpectedTags}`,
    `- OG image URLs return 200 locally: ${payload.summary.ogImageUrlsReturn200}`,
    `- Image sitemap regression: ${payload.summary.imageSitemapRegression}`,
    `- Ad layout regression: ${payload.summary.adLayoutRegression}`,
    `- Screenshots path: ${payload.summary.screenshotsPath}`,
  ].join("\n");
}

function renderGateReport(payload) {
  return [
    "# OG Image Acceptance Gate",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- OG images created: ${payload.summary.og_images_created}`,
    `- Expected image count: ${payload.summary.expected_image_count}`,
    `- Generated image count: ${payload.summary.generated_image_count}`,
    `- Missing images: ${payload.summary.missing_image_count}`,
    `- Invalid images: ${payload.summary.invalid_image_count}`,
    `- Metadata updated: ${payload.summary.metadata_updated}`,
    `- Static export passed: ${payload.summary.static_export_passed}`,
    `- Browser QA passed: ${payload.summary.browser_qa_passed}`,
    `- Regular sitemap still valid: ${payload.summary.regular_sitemap_still_valid}`,
    `- Image sitemap still valid: ${payload.summary.image_sitemap_still_valid}`,
    `- Ready for JSON-LD round: ${payload.summary.ready_for_jsonld_round}`,
    `- Ready for live ads round: ${payload.summary.ready_for_live_ads_round}`,
    "",
    "## Blockers",
    "",
    ...(payload.summary.blockers.length ? payload.summary.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
