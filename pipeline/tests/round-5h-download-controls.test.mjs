import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-5h-project-context-check.json",
  "pipeline/manifests/round-5h-download-ui-audit.json",
  "pipeline/manifests/round-5h-browser-download-api-results.json",
  "pipeline/manifests/round-5h-print-regression-results.json",
  "pipeline/manifests/round-5h-local-download-browser-qa-results.json",
  "pipeline/manifests/round-5h-public-download-browser-qa-results.json",
  "pipeline/manifests/round-5h-download-format-exposure-results.json",
  "pipeline/manifests/round-5h-download-implementation-results.json",
  "pipeline/manifests/round-5h-browser-qa-results.json",
];

test("Round 5H JSON manifests parse and confirm the expected project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /ca-pub-|google_ad_client|adsbygoogle|pagead2\.googlesyndication/i, relativePath);
    JSON.parse(raw);
  }

  const context = await readJson("pipeline/manifests/round-5h-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round5gCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2ColoringPagesExists, true);
  assert.equal(context.summary.r2SvgExists, true);
  assert.equal(context.summary.svgUserDownloadExposedBeforeChanges, false);
  assert.deepEqual(context.summary.publicDownloadFormatsBeforeChanges, ["PNG"]);
  assert.equal(context.summary.jpgJpegWebpControlsAlreadyVisible, false);
});

test("browser download API exposes raster downloads and hides SVG downloads", async () => {
  const downloads = await readText("src/lib/coloring/browserDownloads.ts");

  assert.match(downloads, /export type PublicDownloadFormat = "png" \| "jpg" \| "jpeg" \| "webp"/);
  assert.match(downloads, /downloadPng/);
  assert.match(downloads, /downloadJpeg/);
  assert.match(downloads, /downloadWebp/);
  assert.match(downloads, /printFromHighQualitySource/);
  assert.match(downloads, /image\/png/);
  assert.match(downloads, /image\/jpeg/);
  assert.match(downloads, /image\/webp/);
  assert.match(downloads, /buildDownloadFilename/);
  assert.match(downloads, /canvas-export-unsupported/);
  assert.match(downloads, /canvas-tainted/);
  assert.match(downloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.doesNotMatch(downloads, /downloadSvg|svgDownload|Download SVG/i);
});

test("ImageCard renders a compact Download control with PNG, JPG, and WebP but no SVG", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const source = `${imageCard}\n${downloadMenu}`;

  assert.match(source, /Print/);
  assert.match(source, /Download/);
  assert.match(source, /label: "PNG"/);
  assert.match(source, /label: "JPG"/);
  assert.match(source, /label: "WebP"/);
  assert.match(source, /aria-expanded|<details/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /downloadPng/);
  assert.match(source, /downloadJpeg/);
  assert.match(source, /downloadWebp/);
  assert.doesNotMatch(source, /Download SVG|>SVG<|downloadSvg|svgDownload/i);
});

test("Round 5H reports document local and temporary public browser download QA", async () => {
  const localQa = await readJson("pipeline/manifests/round-5h-local-download-browser-qa-results.json");
  const publicQa = await readJson("pipeline/manifests/round-5h-public-download-browser-qa-results.json");
  const exposure = await readJson("pipeline/manifests/round-5h-download-format-exposure-results.json");
  const implementation = await readJson("pipeline/manifests/round-5h-download-implementation-results.json");

  assert.equal(localQa.summary.pngDownloadWorks, true);
  assert.equal(localQa.summary.jpgDownloadWorks, true);
  assert.equal(localQa.summary.webpDownloadWorks, true);
  assert.equal(localQa.summary.svgDownloadAbsent, true);
  assert.equal(localQa.summary.printWorks, true);

  assert.equal(publicQa.summary.publicBaseType, "r2.dev");
  assert.equal(publicQa.summary.pngDownloadWorks, true);
  assert.equal(publicQa.summary.jpgDownloadWorks, true);
  assert.equal(publicQa.summary.webpDownloadWorks, true);
  assert.equal(publicQa.summary.svgDownloadAbsent, true);
  assert.equal(publicQa.summary.printWorks, true);

  assert.deepEqual(exposure.summary.currentPublicDownloadFormats, ["PNG", "JPG", "WebP"]);
  assert.equal(exposure.summary.svgExposed, false);
  assert.equal(exposure.summary.controlsExposedAfterVerification, true);
  assert.equal(implementation.summary.frontendOnly, true);
  assert.equal(implementation.summary.staticExportCompatible, true);
  assert.equal(implementation.summary.appApiRoutePresent, false);
});

test("static export, media boundaries, ads, and deferred SEO work remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const projectText = await readProjectText(["app", "src"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const trackedTestBundleMedia = await gitLsFiles("pipeline/r2-upload-test-svg-webp");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|webp|coloring-pages)[\\/]/i.test(file)), false);
  assert.doesNotMatch(projectText, /Download SVG|SVG download|downloadSvg|svgDownload/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /ImageResponse|opengraph-image|twitter-image/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(trackedTestBundleMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(renameStatus.split(/\r?\n/).some((line) => /^R/.test(line.trim())), false);
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
