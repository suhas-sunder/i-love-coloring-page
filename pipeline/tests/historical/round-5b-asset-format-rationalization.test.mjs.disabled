import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-5b-project-context-check.json",
  "pipeline/manifests/round-5b-current-asset-format-audit.json",
  "pipeline/manifests/round-5b-webp-quality-policy.json",
  "pipeline/manifests/round-5b-format-comparison.json",
  "pipeline/manifests/round-5b-future-r2-upload-plan.json",
  "pipeline/manifests/round-5b-webp-preview-assets.json",
  "pipeline/manifests/round-5b-webp-missing-assets.json",
  "pipeline/manifests/round-5b-webp-generation-results.json",
  "pipeline/manifests/round-5b-gallery-preview-source-map.json",
  "pipeline/manifests/round-5b-browser-qa-results.json",
  "pipeline/manifests/round-5b-asset-publishing-strategy-update.json",
];

test("Round 5B JSON manifests parse and confirm the correct bounded project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5b-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5aCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.equal(context.summary.svgUserDownloadExposed, false);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.liveAdSenseCodePresent, false);
});

test("WebP generation results match successful assets or document every miss", async () => {
  const itemsData = await readJson("src/generated/coloring/items.json");
  const successfulAssetCount = itemsData.items.length;
  const results = await readJson("pipeline/manifests/round-5b-webp-generation-results.json");
  const assets = await readJson("pipeline/manifests/round-5b-webp-preview-assets.json");
  const missing = await readJson("pipeline/manifests/round-5b-webp-missing-assets.json");

  assert.equal(results.summary.sourceAssetCount, successfulAssetCount);
  assert.equal(results.summary.generatedWebpCount + results.summary.existingWebpCount + missing.summary.missingCount, successfulAssetCount);
  assert.equal(assets.summary.webpPreviewCount, results.summary.generatedWebpCount + results.summary.existingWebpCount);
  assert.ok(results.summary.totalWebpBytes > 0);
  assert.ok(results.summary.quality > 0);
  assert.ok(results.summary.quality <= 100);
  assert.match(results.outputRoot, /pipeline\/r2-upload\/coloring-pages\/webp$/);

  if (missing.summary.missingCount > 0) {
    assert.ok(missing.items.every((item) => item.fallbackSource === "pngPreview"));
  } else {
    assert.equal(assets.summary.webpPreviewCount, successfulAssetCount);
  }
});

test("future R2 upload plan is SVG plus WebP and keeps legacy PNG/thumb media out of the final plan", async () => {
  const plan = await readJson("pipeline/manifests/round-5b-future-r2-upload-plan.json");
  const strategy = await readJson("pipeline/manifests/round-5b-asset-publishing-strategy-update.json");

  assert.deepEqual(plan.finalR2Folders, ["svg", "webp"]);
  assert.equal(plan.excludedFolders.includes("png"), true);
  assert.equal(plan.excludedFolders.includes("thumbs"), true);
  assert.equal(plan.summary.usesSvgAndWebpOnly, true);
  assert.equal(plan.summary.svgInternalOnly, true);
  assert.equal(plan.summary.webpGalleryPreviewFormat, true);
  assert.equal(plan.summary.fullUploadDeferred, true);
  assert.equal(strategy.summary.finalUploadUsesSvgAndWebp, true);
  assert.equal(strategy.summary.pngThumbUploadAvoidedUnlessFutureBlocker, true);
  assert.equal(strategy.summary.publicCorsStillRequiredForConversion, true);
});

test("gallery preview source map prefers WebP where available and documents PNG fallback", async () => {
  const sourceMap = await readJson("pipeline/manifests/round-5b-gallery-preview-source-map.json");
  const assets = await readJson("pipeline/manifests/round-5b-webp-preview-assets.json");
  const missing = await readJson("pipeline/manifests/round-5b-webp-missing-assets.json");

  assert.equal(sourceMap.summary.totalItems, assets.summary.sourceAssetCount);
  assert.equal(sourceMap.summary.webpPreferredCount, assets.summary.webpPreviewCount);
  assert.equal(sourceMap.summary.pngFallbackCount, missing.summary.missingCount);
  assert.equal(sourceMap.summary.thumbnailPrimaryUseRemoved, true);

  const mappedWebp = sourceMap.items.find((item) => item.selectedPreviewSource === "webp");
  assert.ok(mappedWebp, "at least one gallery item should select a WebP preview");
  assert.match(mappedWebp.selectedPreviewSubpath, /^webp\//);
  assert.match(mappedWebp.fallbackPreviewSubpath, /^png\//);
});

test("asset resolver supports WebP preview preference, PNG fallback, and internal-only SVG", async () => {
  const assetsSource = await readText("src/lib/coloring/assets.ts");
  const assetImageSource = await readText("src/components/coloring/AssetImage.tsx");
  const imageCardSource = await readText("src/components/coloring/ImageCard.tsx");
  const homeSource = await readText("app/page.tsx");

  assert.match(assetsSource, /webpPreview/);
  assert.match(assetsSource, /resolveWebpPreviewAssetUrl/);
  assert.match(assetsSource, /deriveWebpPreviewSubpath/);
  assert.match(assetsSource, /preview:\s*webp\s*\|\|\s*png\s*\|\|\s*thumbnail/);
  assert.match(assetsSource, /previewFallback:\s*png\s*\|\|\s*thumbnail/);
  assert.match(assetsSource, /new Set\(\["svg", "png", "thumbs", "webp"\]\)/);
  assert.match(assetImageSource, /fallbackImageUrl/);
  assert.match(imageCardSource, /fallbackPreview/);
  assert.doesNotMatch(homeSource, /thumbnail\s*\|\|\s*item\.assetSubpaths\.pngPreview/);
  assert.doesNotMatch(assetsSource + imageCardSource + homeSource, /Download SVG|downloadSvg|svgDownload/i);
});

test("public downloads remain PNG-only while print and browser conversion stay intact", async () => {
  const downloads = await readText("src/lib/coloring/browserDownloads.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadDecision = await readJson("pipeline/manifests/round-5b-format-comparison.json");

  assert.match(downloads, /VERIFIED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png"\]/);
  assert.match(downloads, /convertInternalSvgToBlob/);
  assert.match(downloads, /printFromHighQualitySource/);
  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download PNG/);
  assert.equal(downloadDecision.summary.currentPublicDownloadFormats.length, 1);
  assert.equal(downloadDecision.summary.currentPublicDownloadFormats[0], "PNG");
  assert.doesNotMatch(imageCard, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b|\bDownload SVG\b/);
});

test("static export, app boundaries, source media boundaries, ad rules, and deferred SEO work remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src/components", "src/lib", "pipeline/manifests/round-5b-asset-publishing-strategy-update.json"]);
  const publishingStrategy = await readJson("pipeline/manifests/round-5b-asset-publishing-strategy-update.json");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /Download SVG|SVG download|downloadSvg\b/i);
  assert.equal(publishingStrategy.summary.adDensityRulesRemainRepresented, true);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
});

test("Round 5B does not create image sitemap, OG image generation, app API, uploads, or live ads", async () => {
  const script = await readText("pipeline/scripts/round-5b-generate-webp-previews.mjs");
  const allPublicSource = await readProjectText(["app", "src"]);

  assert.match(script, /sharp/);
  assert.match(script, /webp/);
  assert.doesNotMatch(script, /wrangler\s+r2\s+object\s+put|cloudflare\.request|bucket\s+cors\s+set/i);
  assert.doesNotMatch(allPublicSource, /ImageResponse|opengraph-image|twitter-image/i);
  assert.doesNotMatch(allPublicSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-/i);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function listFilesIfExists(root) {
  try {
    await access(root);
  } catch {
    return [];
  }

  const rootStat = await import("node:fs/promises").then((fs) => fs.stat(root));
  if (rootStat.isFile()) return [path.relative(REPO_ROOT, root)];

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
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of await listFilesIfExists(root)) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
