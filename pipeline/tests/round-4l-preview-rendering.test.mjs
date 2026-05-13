import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4L_MANIFEST_FILES,
  ROUND4L_REPORT_FILES,
  ROUND4L_RUN_ID,
  runRound4LPreviewUrlAudit,
} from "../scripts/round-4l-audit-preview-urls.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

test("Round 4L preview audit artifacts parse and confirm the requested project context", async () => {
  const result = await runRound4LPreviewUrlAudit({ repoRoot: REPO_ROOT });
  assert.equal(result.runId, ROUND4L_RUN_ID);

  for (const relativePath of ROUND4L_MANIFEST_FILES) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const reportPath of ROUND4L_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4L/i, reportPath);
    assert.doesNotMatch(text, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  const context = await readJson("pipeline/manifests/round-4l-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4kCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
});

test("preview URL fixtures use the verified coloring-pages asset structure", async () => {
  const fixtures = await readJson("pipeline/manifests/round-4l-preview-url-fixtures.json");
  assert.equal(fixtures.runId, ROUND4L_RUN_ID);
  assert.ok(fixtures.fixtures.length >= 34);

  const hubSlugs = new Set(fixtures.fixtures.flatMap((fixture) => fixture.hubSlugs || []));
  for (const slug of ["animals", "anime-girls", "birds", "geometric", "mandalas", "chibi", "fantasy", "christmas", "cars", "plushies"]) {
    assert.equal(hubSlugs.has(slug), true, slug);
  }

  for (const fixture of fixtures.fixtures) {
    assert.match(fixture.expectedPngUrlPath, /^\/png\/[^/]+\/.+\.png$/i, fixture.assetId);
    assert.match(fixture.expectedSvgUrlPath, /^\/svg\/[^/]+\/.+\.svg$/i, fixture.assetId);
    assert.match(fixture.expectedThumbnailUrlPath, /^\/thumbs\/[^/]+\/.+-thumb\.png$/i, fixture.assetId);
    assert.match(fixture.expectedLocalHttpPngUrl, /^http:\/\/127\.0\.0\.1:4175\/coloring-pages\/png\//, fixture.assetId);
    assert.doesNotMatch(fixture.expectedLocalHttpPngUrl, /coloring-pages\/coloring-pages|coloring\/test-v1|[A-Za-z]:\\/i);

    for (const relativePath of [
      fixture.expectedLocalPngFilesystemPath,
      fixture.expectedLocalSvgFilesystemPath,
      fixture.expectedLocalThumbnailFilesystemPath,
    ]) {
      assert.match(relativePath, /^pipeline\/r2-upload\/coloring-pages\/(?:png|svg|thumbs)\//, `${fixture.assetId} ${relativePath}`);
      const fileStat = await stat(path.join(REPO_ROOT, ...relativePath.split("/")));
      assert.ok(fileStat.size > 0, `${fixture.assetId} ${relativePath}`);
    }
  }
});

test("first-page visible items resolve to existing local PNG previews", async () => {
  const audit = await readJson("pipeline/manifests/round-4l-preview-url-audit.json");
  const byTitle = new Map(audit.firstPageVisibleItems.map((entry) => [entry.title, entry]));

  for (const title of ["Animals Alligator", "Animals Armadillo", "Anime Girl Air Balloon", "Birds Albatross"]) {
    const entry = byTitle.get(title);
    assert.ok(entry, title);
    assert.equal(entry.fileChecks.pngPreview.exists, true, title);
    assert.equal(entry.fileChecks.thumbnail.exists, true, title);
    assert.equal(entry.fileChecks.svg.exists, true, title);
    assert.match(entry.actualRenderedPreviewUrl, /\/coloring-pages\/png\//, title);
    assert.doesNotMatch(entry.actualRenderedPreviewUrl, /coloring-pages\/coloring-pages|coloring\/test-v1|[A-Za-z]:\\/i, title);
    if (entry.localHttpCheck.status !== "not_run") {
      assert.equal(entry.localHttpCheck.pngPreview.status, 200, title);
      assert.match(entry.localHttpCheck.pngPreview.contentType || "", /^image\/png/i, title);
    }
  }
});

test("asset resolver and image components avoid broken icon states", async () => {
  const assets = await readText("src/lib/coloring/assets.ts");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const css = await readText("src/styles/components.css");

  assert.match(assets, /preview:\s*(?:webp\s*\|\|\s*)?png\s*\|\|\s*thumbnail/);
  assert.match(assets, /normalizeColoringAssetBaseUrl/);
  assert.doesNotMatch(assets, /coloring\/test-v1/);
  assert.match(assetImage, /onError=\{handleImageError\}/);
  assert.match(assetImage, /onLoad=\{handleImageLoad\}/);
  assert.match(assetImage, /useEffect/);
  assert.match(assetImage, /\.complete/);
  assert.match(assetImage, /\.naturalWidth/);
  assert.match(assetImage, /alt=""/);
  assert.match(assetImage, /role="img"/);
  assert.match(assetImage, /aria-label=\{item\.altText\}/);
  assert.match(assetImage, /data-state=\{loaded \? "loaded" : "loading"\}/);
  assert.match(css, /\.asset-image\[data-state="loading"\][\s\S]*opacity:\s*0/);
  assert.match(css, /\.asset-image-fallback/);
  assert.match(imageCard, /Print/);
  assert.doesNotMatch(imageCard, />\s*SVG\s*</);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(imageCard, /Download SVG|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/);
});

test("static architecture and protected media boundaries remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const routes = await readJson("src/generated/coloring/routes.json");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
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

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else results.push(path.relative(REPO_ROOT, entryPath));
    }
  }

  await walk(root);
  return results;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
