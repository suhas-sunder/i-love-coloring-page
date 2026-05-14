import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

import {
  IMAGE_SITEMAP_URL,
  REGULAR_SITEMAP_URL,
  RUN_ID,
  SITE_URL,
  buildMarkdownTable,
  readJson,
  repoPath,
  summarizeBoolean,
  writeJson,
  writeText,
} from "./image-sitemap-utils.mjs";

const execFileAsync = promisify(execFile);
const DATA_MANIFEST = "pipeline/manifests/image-sitemap-data.json";
const BUILD_MANIFEST = "pipeline/manifests/image-sitemap-build-results.json";
const VALIDATION_MANIFEST = "pipeline/manifests/image-sitemap-xml-validation.json";
const SAMPLE_MANIFEST = "pipeline/manifests/image-sitemap-sampled-url-check-results.json";
const STATIC_QA_MANIFEST = "pipeline/manifests/image-sitemap-static-export-qa-results.json";
const STATIC_QA_REPORT = "pipeline/reports/image-sitemap-static-export-qa-report.md";
const ACCEPTANCE_MANIFEST = "pipeline/manifests/image-sitemap-acceptance-gate.json";
const ACCEPTANCE_REPORT = "pipeline/reports/image-sitemap-acceptance-gate.md";

async function main() {
  const data = await readJson(DATA_MANIFEST);
  const build = await readJson(BUILD_MANIFEST);
  const validation = await readJson(VALIDATION_MANIFEST);
  const sampled = await readJson(SAMPLE_MANIFEST);
  const buildCommand = process.platform === "win32" ? "cmd.exe" : "npm";
  const buildArgs = process.platform === "win32" ? ["/c", "npm", "run", "build"] : ["run", "build"];
  const buildOutput = await execFileAsync(buildCommand, buildArgs, {
    cwd: repoPath("."),
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });

  const server = await startStaticServer(repoPath("out"));
  let staticQa;
  try {
    staticQa = await runStaticQa({ data, buildOutput, localOrigin: server.origin });
  } finally {
    await server.close();
  }

  await writeJson(STATIC_QA_MANIFEST, staticQa);
  await writeText(STATIC_QA_REPORT, buildStaticQaReport(staticQa));

  const gate = buildAcceptanceGate({ data, build, validation, sampled, staticQa });
  await writeJson(ACCEPTANCE_MANIFEST, gate);
  await writeText(ACCEPTANCE_REPORT, buildAcceptanceReport(gate));

  if (!staticQa.summary.staticExportQaPassed || gate.summary.blockers.length) {
    process.exitCode = 1;
  }
}

async function runStaticQa({ data, buildOutput, localOrigin }) {
  const checkedPaths = ["/sitemap.xml", "/robots.txt", "/image-sitemap.xml"];
  const httpResults = [];
  for (const routePath of checkedPaths) {
    const response = await fetch(`${localOrigin}${routePath}`);
    httpResults.push({
      path: routePath,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      body: await response.text(),
    });
  }

  const browser = await chromium.launch({ headless: true });
  const pageResults = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    for (const routePath of ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/t-rex", "/coloring-pages/dragons"]) {
      const response = await page.goto(`${localOrigin}${routePath}`, { waitUntil: "networkidle", timeout: 45_000 });
      const status = response?.status() || 0;
      const imageRendered = await page
        .locator(".gallery-item img")
        .first()
        .evaluate((image) => image instanceof HTMLImageElement && image.naturalWidth > 0 && image.naturalHeight > 0)
        .catch(() => false);
      const printPresent = (await page.getByRole("button", { name: /^Print / }).count().catch(() => 0)) > 0;
      const formatsPresent = (await page.getByText("Formats").count().catch(() => 0)) > 0;
      pageResults.push({
        path: routePath,
        status,
        ok: status >= 200 && status < 300,
        imageRendered,
        printPresent,
        formatsPresent,
      });
    }
    await page.close();
  } finally {
    await browser.close();
  }

  const sitemapResult = httpResults.find((result) => result.path === "/sitemap.xml");
  const robotsResult = httpResults.find((result) => result.path === "/robots.txt");
  const imageSitemapResult = httpResults.find((result) => result.path === "/image-sitemap.xml");
  const regularSitemapLocCount = (sitemapResult?.body.match(/<loc>/g) || []).length;
  const imageSitemapImageCount = (imageSitemapResult?.body.match(/<image:image>/g) || []).length;

  const summary = {
    staticExportQaPassed: false,
    buildCommand: "npm run build",
    buildExitCode: 0,
    buildGeneratedOutDirectory: existsSync(repoPath("out")),
    imageSitemapAccessibleLocally: imageSitemapResult?.ok === true,
    robotsTxtAccessibleLocally: robotsResult?.ok === true,
    sitemapXmlAccessibleLocally: sitemapResult?.ok === true,
    robotsTxtReferencesImageSitemap: new RegExp(`Sitemap:\\s*${escapeRegExp(IMAGE_SITEMAP_URL)}`).test(robotsResult?.body || ""),
    robotsTxtReferencesRegularSitemap: new RegExp(`Sitemap:\\s*${escapeRegExp(REGULAR_SITEMAP_URL)}`).test(robotsResult?.body || ""),
    regularSitemapStillAccessible: sitemapResult?.ok === true && regularSitemapLocCount === 138,
    imageSitemapImageCount,
    imageSitemapExpectedImageCount: data.summary.imageEntryCount,
    imageSitemapCountMatchesData: imageSitemapImageCount === data.summary.imageEntryCount,
    sampleHubPagesStillWork: pageResults.every((result) => result.ok),
    galleryImagesStillRender: pageResults.every((result) => result.imageRendered),
    downloadPrintControlsPresent: pageResults.every((result) => result.printPresent && result.formatsPresent),
    noRouteRegression: pageResults.every((result) => result.ok),
  };

  summary.staticExportQaPassed =
    summary.buildGeneratedOutDirectory &&
    summary.imageSitemapAccessibleLocally &&
    summary.robotsTxtAccessibleLocally &&
    summary.sitemapXmlAccessibleLocally &&
    summary.robotsTxtReferencesImageSitemap &&
    summary.robotsTxtReferencesRegularSitemap &&
    summary.regularSitemapStillAccessible &&
    summary.imageSitemapCountMatchesData &&
    summary.sampleHubPagesStillWork &&
    summary.galleryImagesStillRender &&
    summary.downloadPrintControlsPresent &&
    summary.noRouteRegression;

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-static-export-qa`,
    summary,
    localOrigin,
    httpResults: httpResults.map((result) => ({
      path: result.path,
      status: result.status,
      ok: result.ok,
      contentType: result.contentType,
      bodySample: result.body.slice(0, 240),
    })),
    pageResults,
    buildOutput: {
      stdoutTail: buildOutput.stdout.slice(-4000),
      stderrTail: buildOutput.stderr.slice(-4000),
    },
  };
}

function buildAcceptanceGate({ data, build, validation, sampled, staticQa }) {
  const blockers = [];
  if (!build.summary.imageSitemapCreated) blockers.push("image_sitemap_not_created");
  if (!staticQa.summary.staticExportQaPassed) blockers.push("static_export_qa_failed");
  if (!staticQa.summary.robotsTxtReferencesImageSitemap) blockers.push("robots_missing_image_sitemap");
  if (!staticQa.summary.regularSitemapStillAccessible) blockers.push("regular_sitemap_invalid");
  if (!sampled.summary.sampledUrlCheckPassed) blockers.push("sampled_image_url_check_failed");
  if (!validation.summary.xmlValidationPassed) blockers.push("xml_validation_failed");
  if (!data.summary.svgUrlsExcluded) blockers.push("svg_urls_present");
  if (!data.summary.pngThumbUrlsExcluded) blockers.push("png_or_thumb_urls_present");
  if (data.summary.perImageRoutesCreated) blockers.push("per_image_routes_present");

  return {
    generatedAt: data.generatedAt,
    runId: `${RUN_ID}-acceptance-gate`,
    summary: {
      image_sitemap_created: build.summary.imageSitemapCreated,
      static_export_compatible: staticQa.summary.staticExportQaPassed,
      robots_references_image_sitemap: staticQa.summary.robotsTxtReferencesImageSitemap,
      regular_sitemap_still_valid: staticQa.summary.regularSitemapStillAccessible,
      image_url_sample_passed: sampled.summary.sampledUrlCheckPassed,
      xml_validation_passed: validation.summary.xmlValidationPassed,
      deferred_records_excluded: data.summary.deferredRecordsExcluded === 205 && sampled.summary.noDeferredRecords,
      svg_excluded: data.summary.svgUrlsExcluded && validation.summary.noSvgImageUrls && sampled.summary.noSvgUrls,
      png_thumbs_excluded: data.summary.pngThumbUrlsExcluded && validation.summary.noPngThumbImageUrls && sampled.summary.noPngUrls,
      per_image_routes_absent: !data.summary.perImageRoutesCreated && validation.summary.noPerImageRoutes,
      ready_for_og_image_round: blockers.length === 0,
      ready_for_jsonld_round: blockers.length === 0,
      ready_for_live_ads_round: false,
      blockers,
    },
  };
}

async function startStaticServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const filePath = resolveStaticPath(root, requestUrl.pathname);
      if (!filePath) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const fileStat = await stat(filePath);
      response.writeHead(200, { "content-type": contentTypeFor(filePath), "content-length": fileStat.size });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Server error");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function resolveStaticPath(root, pathname) {
  const safePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = [];
  if (!safePath) candidates.push(path.join(root, "index.html"));
  else {
    candidates.push(path.join(root, safePath));
    candidates.push(path.join(root, `${safePath}.html`));
    candidates.push(path.join(root, safePath, "index.html"));
  }
  return candidates.find((candidate) => {
    if (!existsSync(candidate) || !path.resolve(candidate).startsWith(path.resolve(root))) return false;
    return statSync(candidate).isFile();
  });
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function buildStaticQaReport(manifest) {
  return `# Image Sitemap Static Export QA Report

${buildMarkdownTable(
  ["Check", "Result"],
  Object.entries(manifest.summary).map(([key, value]) => [key, typeof value === "boolean" ? summarizeBoolean(value) : value]),
)}

Local static origin used for QA: ${manifest.localOrigin}
`;
}

function buildAcceptanceReport(gate) {
  return `# Image Sitemap Acceptance Gate

${buildMarkdownTable(
  ["Field", "Result"],
  Object.entries(gate.summary).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? summarizeBoolean(value) : value]),
)}
`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
