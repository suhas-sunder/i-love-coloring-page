import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const REPO_ROOT = process.cwd();
const ANIMALS_ALLIGATOR_ID = "animals__animals-alligator__4feec8505a";
const EXPECTED_ASSET_BASE = "https://assets.ilovecoloringpage.com/coloring-pages";
const EXPECTED_WEBP_URL = `${EXPECTED_ASSET_BASE}/webp/animals/animals-alligator-4feec8505a.webp`;
const EXPECTED_SVG_URL = `${EXPECTED_ASSET_BASE}/svg/animals/animals-alligator-4feec8505a.svg`;
const EXPECTED_AVAILABLE_RECORDS = 6352;
const EXPECTED_DEFERRED_RECORDS = 205;

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/local-preview-bug-context-check.json",
  "pipeline/manifests/local-preview-bug-reproduction.json",
  "pipeline/manifests/local-preview-animals-alligator-trace.json",
  "pipeline/manifests/local-preview-runtime-data-audit.json",
  "pipeline/manifests/local-preview-assetimage-fix.json",
  "pipeline/manifests/local-preview-print-fix.json",
  "pipeline/manifests/local-preview-browser-qa-results.json",
  "pipeline/manifests/local-preview-sampled-url-check-results.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/local-preview-bug-context-check.md",
  "pipeline/reports/local-preview-bug-reproduction.md",
  "pipeline/reports/local-preview-animals-alligator-trace.md",
  "pipeline/reports/local-preview-runtime-data-audit.md",
  "pipeline/reports/local-preview-assetimage-fix.md",
  "pipeline/reports/local-preview-print-fix.md",
  "pipeline/reports/local-preview-browser-qa-report.md",
  "pipeline/reports/local-preview-sampled-url-check-report.md",
];

test("Animals Alligator resolves to the custom-domain WebP and internal SVG URLs even with a local env override", async () => {
  const resolver = await loadAssetResolver({
    NEXT_PUBLIC_COLORING_ASSET_BASE_URL: "http://127.0.0.1:4175/coloring-pages",
  });
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const assetPaths = await readJson("src/generated/coloring/runtime-asset-paths.json");
  const item = available.items.find((entry) => entry.assetId === ANIMALS_ALLIGATOR_ID);
  const pathRecord = assetPaths.records.find((entry) => entry.assetId === ANIMALS_ALLIGATOR_ID);

  assert.ok(item, "Animals Alligator should be runtime-available");
  assert.ok(pathRecord, "Animals Alligator should have a runtime asset path record");
  assert.equal(item.assetSubpaths.webpPreview, "webp/animals/animals-alligator-4feec8505a.webp");
  assert.equal(item.assetSubpaths.svg, "svg/animals/animals-alligator-4feec8505a.svg");
  assert.equal(pathRecord.expectedPublicWebpUrl, EXPECTED_WEBP_URL);
  assert.equal(pathRecord.expectedPublicSvgUrl, EXPECTED_SVG_URL);

  const urls = resolver.resolveColoringItemAssetUrls(item.assetSubpaths);
  assert.equal(urls.preview, EXPECTED_WEBP_URL);
  assert.equal(urls.webp, EXPECTED_WEBP_URL);
  assert.equal(urls.svg, EXPECTED_SVG_URL);
  assert.equal(urls.png, null);
  assert.equal(urls.thumbnail, null);
});

test("runtime data keeps 6352 available records and excludes 205 deferred records from galleries", async () => {
  const available = await readJson("src/generated/coloring/runtime-available-items.json");
  const deferred = await readJson("src/generated/coloring/runtime-deferred-items.json");
  const hubItems = await readJson("src/generated/coloring/runtime-hub-items.json");
  const searchIndex = await readJson("src/generated/coloring/runtime-search-index.json");
  const deferredIds = new Set(deferred.records.map((record) => record.assetId));

  assert.equal(available.items.length, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(available.summary.itemCount, EXPECTED_AVAILABLE_RECORDS);
  assert.equal(deferred.records.length, EXPECTED_DEFERRED_RECORDS);
  assert.equal(deferred.summary.deferredRecordCount, EXPECTED_DEFERRED_RECORDS);
  assert.equal(available.items.some((item) => deferredIds.has(item.assetId)), false);
  assert.equal(hubItems.items.some((item) => deferredIds.has(item.assetId)), false);
  assert.equal(searchIndex.entries.some((item) => deferredIds.has(item.assetId)), false);
});

test("gallery components use WebP previews first and never promote SVG as a public download", async () => {
  const assetsSource = await readText("src/lib/coloring/assets.ts");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");

  assert.match(assetsSource, /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/);
  assert.doesNotMatch(assetsSource, /png\s*\|\|\s*thumbnail\s*\|\|\s*webp/);
  assert.match(galleryGrid, /preview:\s*resolvedUrls\.preview/);
  assert.match(assetImage, /onError=\{handleImageError\}/);
  assert.match(assetImage, /onLoad=\{handleImageLoad\}/);
  assert.match(downloadMenu, /label: "PNG"/);
  assert.match(downloadMenu, /label: "JPG"/);
  assert.match(downloadMenu, /label: "WebP"/);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
});

test("print conversion has timeout and failure UI guards instead of hanging on the preparing page", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");

  assert.match(browserDownloads, /PRINT_PREPARE_TIMEOUT_MS/);
  assert.match(browserDownloads, /prepareHighQualityPrintImage/);
  assert.match(browserDownloads, /Print preview could not be prepared|image-load-failed|missing-png-preview/);
  assert.match(browserDownloads, /loadCorsImage\([^)]*timeoutMs/);
  assert.match(browserDownloads, /window\.setTimeout/);
});

test("local preview bug artifacts exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    assert.match(await readText(relativePath), /local preview/i);
  }
});

test("static export and deferred launch boundaries remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const projectText = await readProjectText(["app", "src"]);

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.doesNotMatch(projectText, /Download SVG|downloadSvg|svgDownload/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
});

async function loadAssetResolver(env) {
  const source = await readText("src/lib/coloring/assets.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    process: { env },
    URL,
    encodeURIComponent,
    Set,
  };
  vm.runInNewContext(compiled, context, { filename: "assets.ts" });
  return module.exports;
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  if (!existsSync(root)) return [];
  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute));
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
