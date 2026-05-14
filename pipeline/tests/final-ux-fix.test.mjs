import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/final-ux-fix-context-check.json",
  "pipeline/manifests/final-ux-fix-current-audit.json",
  "pipeline/manifests/final-ux-header-hover-results.json",
  "pipeline/manifests/final-ux-card-interaction-results.json",
  "pipeline/manifests/final-ux-image-preview-spacing-results.json",
  "pipeline/manifests/final-ux-modal-results.json",
  "pipeline/manifests/final-ux-print-pdf-results.json",
  "pipeline/manifests/final-ux-link-sections-results.json",
  "pipeline/manifests/final-ux-more-menu-results.json",
  "pipeline/manifests/final-ux-browser-qa-results.json",
  "pipeline/manifests/final-ux-print-qa-results.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/final-ux-fix-context-check.md",
  "pipeline/reports/final-ux-fix-current-audit.md",
  "pipeline/reports/final-ux-header-hover-report.md",
  "pipeline/reports/final-ux-card-interaction-report.md",
  "pipeline/reports/final-ux-image-preview-spacing-report.md",
  "pipeline/reports/final-ux-modal-report.md",
  "pipeline/reports/final-ux-print-pdf-report.md",
  "pipeline/reports/final-ux-link-sections-report.md",
  "pipeline/reports/final-ux-more-menu-report.md",
  "pipeline/reports/final-ux-browser-qa-report.md",
  "pipeline/reports/final-ux-print-qa-report.md",
];

test("final UX manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.ok((await readText(relativePath)).trim().length > 0, `${relativePath} should not be empty`);
  }
});

test("image cards use image-first print preview without a redundant card Print button", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const css = await readText("src/styles/components.css");

  assert.match(imageCard, /className="gallery-item-media-button"/);
  assert.match(imageCard, /onClick=\{openPrintPreview\}/);
  assert.match(imageCard, /gallery-item-print-cue/);
  assert.match(assetImage, /data-interactive=\{interactive \? "true" : "false"\}/);
  assert.match(css, /\.gallery-item-media-button[^{}]*\{[\s\S]*cursor:\s*pointer/);
  assert.match(css, /\.gallery-item-print-cue/);
  assert.doesNotMatch(imageCard, /className="gallery-actions"[\s\S]*>\s*Print\s*</);
  assert.doesNotMatch(imageCard, /button-primary button-small[\s\S]*Preview and print/);
});

test("modal actions and downloads are clean, top-right, and SVG-free", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const css = await readText("src/styles/components.css");

  assert.match(imageCard, /className="print-preview-actions"/);
  assert.match(css, /\.print-preview-header[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
  assert.match(css, /\.print-preview-actions[\s\S]*justify-content:\s*flex-end/);
  assert.doesNotMatch(imageCard, /print-preview-download-title/);
  assert.doesNotMatch(imageCard, />\s*Download\s*<\/span>/);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}`, /Download SVG|SVG download|downloadSvg\b/i);
});

test("PDF print helper keeps one slim border and safe footer branding", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const printResults = await readJson("pipeline/manifests/final-ux-print-pdf-results.json");
  const printQa = await readJson("pipeline/manifests/final-ux-print-qa-results.json");

  assert.match(browserDownloads, /prepareOnePagePrintPdf|printOnePagePdf/);
  assert.match(browserDownloads, /PRINT_DOCUMENT_BRAND = "iLoveColoringPage\.com"/);
  assert.match(browserDownloads, /printableBorderCount:\s*1/);
  assert.equal(printResults.summary.oneSlimBorderOnly, true);
  assert.equal(printResults.summary.brandingOutsideArtwork, true);
  assert.equal(printResults.summary.brandingOverlapsArtwork, false);
  assert.equal(printQa.summary.allGeneratedPrintableDocumentsOnePage, true);
  assert.equal(printQa.summary.oneSlimBorderOnly, true);
  assert.equal(printQa.summary.brandingOverlapsArtwork, false);
});

test("link sections and More menu reports document purposeful spacing", async () => {
  const linkSections = await readJson("pipeline/manifests/final-ux-link-sections-results.json");
  const moreMenu = await readJson("pipeline/manifests/final-ux-more-menu-results.json");

  assert.equal(linkSections.summary.uselessEyebrowLabelsRemoved, true);
  assert.equal(linkSections.summary.relatedCollectionsProfessional, true);
  assert.equal(linkSections.summary.moreWaysDistinctOrMerged, true);
  assert.equal(linkSections.summary.countsAlignedCleanly, true);
  assert.equal(moreMenu.summary.groupedSectionsPreserved, true);
  assert.equal(moreMenu.summary.importantTitlesNotTruncated, true);
  assert.equal(moreMenu.summary.countsAlignedSeparately, true);
});

test("static export, SEO assets, app/api absence, and live ads absence remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const sourceText = await readProjectText(["app", "src"], { skipGeneratedColoring: true });
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const srcAppFiles = await listFilesIfExists(path.join(REPO_ROOT, "src", "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal([...appFiles, ...srcAppFiles].some((file) => normalizePath(file).includes("/api/")), false);
  assert.ok(publicFiles.some((file) => normalizePath(file) === "public/image-sitemap.xml"));
  assert.ok(publicFiles.some((file) => normalizePath(file).startsWith("public/og/")));
  assert.match(sourceText, /JsonLdScript|application\/ld\+json|buildHubPageJsonLd/);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

test("public downloads remain PNG/JPG/WebP and SVG stays internal-only", async () => {
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const browserQa = await readJson("pipeline/manifests/final-ux-browser-qa-results.json");

  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.match(browserDownloads, /EXPOSED_PUBLIC_DOWNLOAD_FORMATS:\s*readonly PublicDownloadFormat\[\]\s*=\s*\["png", "jpg", "webp"\]/);
  assert.doesNotMatch(`${browserDownloads}\n${downloadMenu}\n${imageCard}`, /Download SVG|SVG download|downloadSvg\b/i);
  assert.equal(browserQa.summary.svgDownloadAbsent, true);
  assert.equal(browserQa.summary.pngDownloadWorks, true);
  assert.equal(browserQa.summary.jpgDownloadWorks, true);
  assert.equal(browserQa.summary.webpDownloadWorks, true);
});

test("repo safety boundaries remain clean", async () => {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imagesStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");
  const envStatus = await gitStatusFor(".env.local");

  assert.equal(publicFiles.every(isApprovedPublicFile), true);
  assert.equal(imagesStatus.trim(), "");
  assert.equal(ilovesvgStatus.trim(), "");
  assert.equal(envStatus.trim(), "");
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

async function readProjectText(relativeRoots, options = {}) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      const normalized = normalizePath(file);
      if (!/\.(?:ts|tsx|css|json|md)$/.test(normalized)) continue;
      if (options.skipGeneratedColoring && normalized.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function isApprovedPublicFile(filePath) {
  const normalized = normalizePath(filePath);
  return normalized === "public/image-sitemap.xml" || /^public\/og\/.+\.jpg$/i.test(normalized);
}
