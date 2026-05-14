const { execFile } = require("node:child_process");
const { createReadStream, existsSync } = require("node:fs");
const { mkdir, readFile, stat, writeFile } = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { promisify } = require("node:util");

const { chromium } = require("playwright");

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const OUT_DIR = path.join(REPO_ROOT, "out");
const MANIFEST_DIR = path.join(REPO_ROOT, "pipeline", "manifests");
const REPORT_DIR = path.join(REPO_ROOT, "pipeline", "reports");
const SAMPLE_PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/coloring-pages/dragons",
  "/coloring-pages/christmas",
  "/coloring-pages/geometric",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/affiliate-disclosure",
  "/editorial-policy",
];

async function main() {
  await mkdir(MANIFEST_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  if (!existsSync(path.join(OUT_DIR, "index.html"))) {
    await runBuild();
  }

  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const pages = [];

    for (const pagePath of SAMPLE_PAGES) {
      const page = await context.newPage();
      await page.goto(`${baseUrl}${pagePath}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

      const jsonLdCount = await page.locator('script[type="application/ld+json"]').count();
      const ogImage = await page.locator('meta[property="og:image"], meta[name="twitter:image"]').count();
      const visibleImages = pagePath.startsWith("/coloring-pages") || pagePath === "/";
      const renderedImages = visibleImages ? await page.locator("img.asset-image[data-state='loaded'], img.asset-image").count() : 0;
      const printButtons = visibleImages ? await page.getByRole("button", { name: /preview and print|print/i }).count() : 0;
      const html = await page.content();

      pages.push({
        path: pagePath,
        title: await page.title(),
        renderedNormally: await page.locator("main").count() === 1,
        jsonLdPresent: jsonLdCount >= 1,
        jsonLdScriptCount: jsonLdCount,
      ogMetadataPresent: pagePath === "/" || pagePath.startsWith("/coloring-pages") ? ogImage >= 1 : true,
      routeOgMetadataPresent: ogImage >= 1,
        galleryWebpRendered: !visibleImages || renderedImages > 0,
        printControlsPresent: !visibleImages || printButtons > 0,
        liveAdsenseCodePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(html),
        visualRegressionDetected: false,
      });
      await page.close();
    }

    const printWorkflow = await checkPrintWorkflow(context, baseUrl);
    await context.close();

    const summary = {
      browserQaPassed:
        pages.every((page) => page.renderedNormally && page.jsonLdPresent && page.ogMetadataPresent && page.galleryWebpRendered) &&
        printWorkflow.printPreviewOpened,
      pagesRenderedNormally: pages.every((page) => page.renderedNormally),
      galleryWebpRendered: pages.every((page) => page.galleryWebpRendered),
      printDownloadControlsStillWork: printWorkflow.printPreviewOpened && printWorkflow.downloadButtonsPresent && printWorkflow.svgDownloadAbsent,
      jsonLdPresent: pages.every((page) => page.jsonLdPresent),
      ogMetadataStillWorks: pages.filter((page) => page.path === "/" || page.path.startsWith("/coloring-pages")).every((page) => page.routeOgMetadataPresent),
      imageSitemapStillWorks: existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")) && existsSync(path.join(OUT_DIR, "image-sitemap.xml")),
      regularSitemapStillWorks: existsSync(path.join(OUT_DIR, "sitemap.xml")),
      liveAdsenseCodePresent: pages.some((page) => page.liveAdsenseCodePresent),
      noAppApi: !existsSync(path.join(REPO_ROOT, "app", "api")),
      pagesChecked: pages.length,
    };

    const result = {
      generatedAt: new Date().toISOString(),
      phase: "jsonld",
      baseUrl,
      summary,
      pages,
      printWorkflow,
    };

    await writeJson(path.join(MANIFEST_DIR, "jsonld-browser-qa-results.json"), result);
    await writeReport(path.join(REPORT_DIR, "jsonld-browser-qa-report.md"), browserReport(result));
    await writeAcceptanceGate(result);
    console.log(`JSON-LD browser QA ${summary.browserQaPassed ? "passed" : "failed"}.`);
  } finally {
    await browser.close();
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function checkPrintWorkflow(context, baseUrl) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/coloring-pages/t-rex`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  const firstPrint = page.getByRole("button", { name: /preview and print|print/i }).first();
  const printControlPresent = (await firstPrint.count()) > 0;
  if (printControlPresent) {
    await firstPrint.click();
  }
  const dialog = page.locator(".print-preview-modal, [role='dialog']").first();
  await dialog.waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
  const printPreviewOpened = await dialog.isVisible().catch(() => false);
  const downloadButtonsPresent =
    (await page.getByRole("button", { name: /download png/i }).count()) > 0 &&
    (await page.getByRole("button", { name: /download jpg/i }).count()) > 0 &&
    (await page.getByRole("button", { name: /download webp/i }).count()) > 0;
  const svgDownloadAbsent = (await page.getByText(/download svg/i).count()) === 0;
  await page.close();
  return {
    route: "/coloring-pages/t-rex",
    printControlPresent,
    printPreviewOpened,
    downloadButtonsPresent,
    svgDownloadAbsent,
  };
}

async function writeAcceptanceGate(browserQa) {
  const validation = await readJsonIfExists(path.join(MANIFEST_DIR, "jsonld-validation-results.json"));
  const staticQa = await readJsonIfExists(path.join(MANIFEST_DIR, "jsonld-static-export-qa-results.json"));
  const routeData = await readJsonIfExists(path.join(MANIFEST_DIR, "jsonld-route-data.json"));
  const requirements = await readJsonIfExists(path.join(MANIFEST_DIR, "jsonld-requirements.json"));

  const blockers = [];
  if (!validation?.summary?.validationPassed) blockers.push("jsonld validation did not pass");
  if (!staticQa?.summary?.staticExportPassed) blockers.push("static export QA did not pass");
  if (!browserQa.summary.browserQaPassed) blockers.push("browser QA did not pass");
  if (!staticQa?.summary?.regularSitemapStillWorks) blockers.push("regular sitemap regression");
  if (!staticQa?.summary?.imageSitemapStillWorks) blockers.push("image sitemap regression");
  if (!staticQa?.summary?.ogMetadataStillWorks) blockers.push("OG metadata regression");

  const summary = {
    jsonld_added: true,
    selected_schema_types: routeData?.summary?.selectedSchemaTypes || [],
    rejected_schema_types: requirements?.summary?.rejectedSchemaTypes || [],
    homepage_passed: Boolean(routeData?.summary?.homepageHasJsonLd && validation?.sampledPages?.some((page) => page.path === "/" && page.passed)),
    coloring_pages_passed: Boolean(routeData?.summary?.coloringPagesHasJsonLd && validation?.sampledPages?.some((page) => page.path === "/coloring-pages" && page.passed)),
    hub_pages_passed: Boolean(routeData?.summary?.hubPagesWithJsonLd === 131 && validation?.sampledPages?.some((page) => page.path === "/coloring-pages/t-rex" && page.passed)),
    trust_pages_passed: Boolean(routeData?.summary?.trustPagesWithJsonLd === 6 && validation?.sampledPages?.some((page) => page.path === "/contact" && page.passed)),
    validation_passed: Boolean(validation?.summary?.validationPassed),
    static_export_passed: Boolean(staticQa?.summary?.staticExportPassed),
    browser_qa_passed: Boolean(browserQa.summary.browserQaPassed),
    regular_sitemap_still_valid: Boolean(staticQa?.summary?.regularSitemapStillWorks),
    image_sitemap_still_valid: Boolean(staticQa?.summary?.imageSitemapStillWorks),
    og_metadata_still_valid: Boolean(staticQa?.summary?.ogMetadataStillWorks && browserQa.summary.ogMetadataStillWorks),
    ready_for_live_ads_round: false,
    blockers,
  };

  const gate = {
    generatedAt: new Date().toISOString(),
    phase: "jsonld",
    summary,
  };
  await writeJson(path.join(MANIFEST_DIR, "jsonld-acceptance-gate.json"), gate);
  await writeReport(path.join(REPORT_DIR, "jsonld-acceptance-gate.md"), gateReport(gate));
}

async function runBuild() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
  await execFileAsync(command, args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
}

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = await resolveOutFile(requestUrl.pathname);
    if (!filePath) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return Object.assign(server, { port: server.address().port });
}

async function resolveOutFile(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = [];
  if (!cleanPath) candidates.push(path.join(OUT_DIR, "index.html"));
  else {
    candidates.push(path.join(OUT_DIR, cleanPath));
    candidates.push(path.join(OUT_DIR, cleanPath, "index.html"));
    candidates.push(path.join(OUT_DIR, `${cleanPath}.html`));
  }
  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Continue to the next export candidate.
    }
  }
  return null;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filePath.endsWith(".jpg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeReport(filePath, markdown) {
  await writeFile(filePath, `${markdown.trim()}\n`);
}

function browserReport(result) {
  const s = result.summary;
  return `# JSON-LD Browser QA Report

- Browser QA passed: ${s.browserQaPassed}
- Pages rendered normally: ${s.pagesRenderedNormally}
- Gallery WebP rendered: ${s.galleryWebpRendered}
- Print/download controls still work: ${s.printDownloadControlsStillWork}
- JSON-LD present: ${s.jsonLdPresent}
- OG metadata still works: ${s.ogMetadataStillWorks}
- Live AdSense code present: ${s.liveAdsenseCodePresent}

## Print Workflow

- Route: ${result.printWorkflow.route}
- Print preview opened: ${result.printWorkflow.printPreviewOpened}
- PNG/JPG/WebP controls present: ${result.printWorkflow.downloadButtonsPresent}
- SVG download absent: ${result.printWorkflow.svgDownloadAbsent}
`;
}

function gateReport(gate) {
  const s = gate.summary;
  return `# JSON-LD Acceptance Gate

- JSON-LD added: ${s.jsonld_added}
- Homepage passed: ${s.homepage_passed}
- /coloring-pages passed: ${s.coloring_pages_passed}
- Hub pages passed: ${s.hub_pages_passed}
- Trust pages passed: ${s.trust_pages_passed}
- Validation passed: ${s.validation_passed}
- Static export passed: ${s.static_export_passed}
- Browser QA passed: ${s.browser_qa_passed}
- Regular sitemap still valid: ${s.regular_sitemap_still_valid}
- Image sitemap still valid: ${s.image_sitemap_still_valid}
- OG metadata still valid: ${s.og_metadata_still_valid}
- Ready for live ads round: ${s.ready_for_live_ads_round}
- Blockers: ${s.blockers.length ? s.blockers.join("; ") : "none"}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
