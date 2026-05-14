import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();
const REQUIRED_MANIFESTS = [
  "pipeline/manifests/live-seo-verification-context-check.json",
  "pipeline/manifests/live-seo-deploy-freshness-check.json",
  "pipeline/manifests/live-seo-http-results.json",
  "pipeline/manifests/live-seo-sitemap-results.json",
  "pipeline/manifests/live-seo-og-metadata-results.json",
  "pipeline/manifests/live-seo-jsonld-results.json",
  "pipeline/manifests/live-seo-browser-qa-results.json",
  "pipeline/manifests/live-seo-sampled-asset-check-results.json",
  "pipeline/manifests/live-seo-acceptance-gate.json",
];
const REQUIRED_REPORTS = [
  "pipeline/reports/live-seo-verification-context-check.md",
  "pipeline/reports/live-seo-deploy-freshness-check.md",
  "pipeline/reports/live-seo-http-report.md",
  "pipeline/reports/live-seo-sitemap-report.md",
  "pipeline/reports/live-seo-og-metadata-report.md",
  "pipeline/reports/live-seo-jsonld-report.md",
  "pipeline/reports/live-seo-browser-qa-report.md",
  "pipeline/reports/live-seo-sampled-asset-check-report.md",
  "pipeline/reports/live-seo-acceptance-gate.md",
];
const REQUIRED_SCRIPTS = [
  "pipeline/scripts/live-seo-http-check.mjs",
  "pipeline/scripts/live-seo-sitemap-check.mjs",
  "pipeline/scripts/live-seo-og-metadata-check.mjs",
  "pipeline/scripts/live-seo-jsonld-check.mjs",
  "pipeline/scripts/live-seo-browser-qa-runner.cjs",
  "pipeline/scripts/live-seo-sampled-asset-check.mjs",
];

test("live SEO verification artifacts exist and parse", async () => {
  for (const relativePath of [...REQUIRED_SCRIPTS, ...REQUIRED_MANIFESTS, ...REQUIRED_REPORTS]) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }
});

test("context keeps the current static-export project boundaries intact", async () => {
  const context = await readJson("pipeline/manifests/live-seo-verification-context-check.json");
  const nextConfig = await readText("next.config.mjs");
  const appSource = await readProjectText(["app", "src"], { excludeGenerated: true });

  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.currentBranch, "ver-5-deployed-may-13-2026");
  assert.equal(context.summary.commit0e18282Exists, true);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.runtimeAvailableRecords, 6352);
  assert.equal(context.summary.runtimeIndexableHubs, 131);
  assert.equal(context.summary.regularSitemapExists, true);
  assert.equal(context.summary.imageSitemapExists, true);
  assert.equal(context.summary.ogImagesExist, true);
  assert.equal(context.summary.jsonLdImplemented, true);
  assert.equal(context.summary.svgInternalOnly, true);
  assert.deepEqual(context.summary.publicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(context.summary.liveAdsenseCodePresent, false);
  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.doesNotMatch(appSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

test("live reports cover HTTP, sitemap, OG, JSON-LD, browser, sampled assets, and acceptance", async () => {
  const http = await readJson("pipeline/manifests/live-seo-http-results.json");
  const sitemap = await readJson("pipeline/manifests/live-seo-sitemap-results.json");
  const og = await readJson("pipeline/manifests/live-seo-og-metadata-results.json");
  const jsonld = await readJson("pipeline/manifests/live-seo-jsonld-results.json");
  const browser = await readJson("pipeline/manifests/live-seo-browser-qa-results.json");
  const assets = await readJson("pipeline/manifests/live-seo-sampled-asset-check-results.json");
  const gate = await readJson("pipeline/manifests/live-seo-acceptance-gate.json");

  assert.ok(http.summary.checkedUrlCount >= 10);
  assert.ok(sitemap.summary.regularSitemapChecked);
  assert.ok(sitemap.summary.imageSitemapChecked);
  assert.ok(og.summary.pagesChecked >= 10);
  assert.ok(jsonld.summary.pagesChecked >= 12);
  assert.ok(browser.summary.pagesChecked >= 10);
  assert.ok(assets.summary.sampledRecordCount >= 200 || assets.summary.blockedByProductionFreshness === true);
  assert.equal(gate.summary.ready_for_live_ads_round, false);
  assert.ok(Array.isArray(gate.summary.blockers));
});

test("download, JSON-LD, app API, and source media boundaries remain intact", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const jsonLdGate = await readJson("pipeline/manifests/jsonld-acceptance-gate.json");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.equal(jsonLdGate.summary.jsonld_added, true);
  assert.equal(existsSync(path.join(REPO_ROOT, "public", "image-sitemap.xml")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, "public", "og", "home.jpg")), true);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}`, /Download SVG|downloadSvg|svgDownload/i);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.equal(publicFiles.every((file) => /^public\/(?:image-sitemap\.xml|og\/.+\.jpg)$/.test(normalizePath(file)) || normalizePath(file) === "public/icon.svg"), true);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root).replace(/\\/g, "/")];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs|cjs)$/.test(file)) continue;
      if (options.excludeGenerated && normalizePath(file).startsWith("src/generated/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
