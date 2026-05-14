import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const REPO_ROOT = process.cwd();

test("modal downloads have no standalone Download label and keep raster formats only", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");

  assert.doesNotMatch(imageCard, /print-preview-download-title/);
  assert.doesNotMatch(imageCard, />\s*Download\s*<\/(?:span|p|div|strong)>/);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}`, /Download SVG|downloadSvg\b|svgDownload/i);
});

test("modal preview image uses non-cropping contain behavior", async () => {
  const css = await readText("src/styles/components.css");
  const mediaBlock = extractCssBlock(css, ".print-preview-media");
  const imageBlock = extractCssBlock(css, ".print-preview-media img");

  assert.match(mediaBlock, /overflow:\s*hidden/);
  assert.match(imageBlock, /object-fit:\s*contain/);
  assert.match(imageBlock, /width:\s*100%/);
  assert.match(imageBlock, /height:\s*100%/);
  assert.doesNotMatch(imageBlock, /object-fit:\s*cover/);
});

test("PDF print layout uses one border and a bottom-frame brand label, not a footer row", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");

  assert.match(browserDownloads, /PRINT_DOCUMENT_BRAND = "iLoveColoringPage\.com"/);
  assert.match(browserDownloads, /printableBorderCount:\s*1/);
  assert.equal(countMatches(browserDownloads, /boxCommand\(layout\.outerFrame\)\}\s*S/g), 1);
  assert.doesNotMatch(browserDownloads, /boxCommand\(layout\.(?:artworkBox|brandBox|imageBox)\)\s*S/g);
  assert.doesNotMatch(browserDownloads, /footerHeight/);
  assert.match(browserDownloads, /brandPlacement:\s*"bottom-frame-label"/);
  assert.match(browserDownloads, /knockout/i);
});

test("focused print modal QA artifacts exist and pass", async () => {
  const manifest = await readJson("pipeline/manifests/final-print-modal-fix-results.json");
  const report = await readText("pipeline/reports/final-print-modal-fix-report.md");

  assert.equal(manifest.summary.modalDownloadLabelRemoved, true);
  assert.equal(manifest.summary.modalPreviewNotCropped, true);
  assert.equal(manifest.summary.modalPreviewShowsFullImage, true);
  assert.equal(manifest.summary.pdfOnePage, true);
  assert.equal(manifest.summary.oneSlimBorderOnly, true);
  assert.equal(manifest.summary.logoIntegratedIntoBottomFrame, true);
  assert.equal(manifest.summary.logoOverlapsArtwork, false);
  assert.equal(manifest.summary.artworkUsesMorePageSpaceThanBefore, true);
  assert.equal(manifest.summary.pngJpgWebpDownloadsWork, true);
  assert.equal(manifest.summary.svgDownloadAbsent, true);
  assert.match(report, /iLoveColoringPage\.com/);
});

test("static export stays frontend-only with no app api route", async () => {
  const nextConfig = await readText("next.config.mjs");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const srcAppFiles = await listFilesIfExists(path.join(REPO_ROOT, "src", "app"));

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal([...appFiles, ...srcAppFiles].some((file) => normalizePath(file).includes("/api/")), false);
});

function extractCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

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

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
