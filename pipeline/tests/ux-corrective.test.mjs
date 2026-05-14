import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/ux-corrective-context-check.json",
  "pipeline/manifests/ux-corrective-current-audit.json",
  "pipeline/manifests/ux-corrective-card-workflow.json",
  "pipeline/manifests/ux-corrective-print-output.json",
  "pipeline/manifests/ux-corrective-print-preview-workflow.json",
  "pipeline/manifests/ux-corrective-related-collections.json",
  "pipeline/manifests/ux-corrective-hero-layout.json",
  "pipeline/manifests/ux-corrective-more-menu.json",
  "pipeline/manifests/ux-corrective-browser-qa-results.json",
  "pipeline/manifests/ux-corrective-print-qa-results.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/ux-corrective-context-check.md",
  "pipeline/reports/ux-corrective-current-audit.md",
  "pipeline/reports/ux-corrective-card-workflow-report.md",
  "pipeline/reports/ux-corrective-print-output-report.md",
  "pipeline/reports/ux-corrective-print-preview-workflow-report.md",
  "pipeline/reports/ux-corrective-related-collections-report.md",
  "pipeline/reports/ux-corrective-hero-layout-report.md",
  "pipeline/reports/ux-corrective-more-menu-report.md",
  "pipeline/reports/ux-corrective-browser-qa-report.md",
  "pipeline/reports/ux-corrective-print-qa-report.md",
];

test("UX corrective manifests and reports exist and parse", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    JSON.parse(await readText(relativePath));
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.equal(existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    assert.ok((await readText(relativePath)).trim().length > 0, `${relativePath} should not be empty`);
  }
});

test("card grid is print-first and does not show per-card format controls", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const css = await readText("src/styles/components.css");

  assert.match(imageCard, /onClick=\{openPrintPreview\}/);
  assert.match(imageCard, /aria-label=\{hasPrintableAsset \? `Preview and print/);
  assert.doesNotMatch(sliceBetween(imageCard, 'className="gallery-actions"', "</div>"), /DownloadMenu|Download PNG|Download JPG|Download WebP|Formats/);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}`, />Formats<|download-menu-summary|className="download-menu"/);
  assert.match(css, /\.gallery-item-media-button:hover \.gallery-item-media/);
  assert.match(css, /\.gallery-item-media-button:focus-visible \.gallery-item-media/);
  assert.match(css, /cursor:\s*pointer/);
});

test("print preview workflow is app-controlled, one-page oriented, and preserves downloads", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");
  const browserDownloads = await readText("src/lib/coloring/browserDownloads.ts");
  const css = await readText("src/styles/components.css");

  assert.match(imageCard, /role="dialog"/);
  assert.match(imageCard, /className="print-preview-overlay"/);
  assert.match(imageCard, /className="print-document"/);
  assert.match(imageCard, /document\.body\.classList\.add\("printing-coloring-page"\)/);
  assert.match(imageCard, /window\.print\(\)/);
  assert.match(browserDownloads, /PRINT_PREPARE_TIMEOUT_MS\s*=\s*15_000/);
  assert.match(browserDownloads, /prepareHighQualityPrintImage/);
  assert.doesNotMatch(browserDownloads, /window\.open\(\s*["']{2}\s*,\s*["_']_blank["_']/);
  assert.doesNotMatch(browserDownloads, /about:blank/i);
  assert.match(css, /@media print[\s\S]*\.print-document/);
  assert.match(css, /page-break-inside:\s*avoid/);
  assert.match(css, /break-inside:\s*avoid/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}\n${browserDownloads}`, /Download SVG|downloadSvg|svgDownload/i);
});

test("related collections, hero links, and More menu use readable layouts without ellipsized labels", async () => {
  const relatedHubs = await readText("src/components/coloring/RelatedHubs.tsx");
  const hubHero = await readText("src/components/coloring/HubHero.tsx");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const css = await readText("src/styles/components.css");

  assert.match(relatedHubs, /related-link-label/);
  assert.match(relatedHubs, /related-link-count/);
  assert.match(hubHero, /hero-related-label/);
  assert.match(hubHero, /hero-related-count/);
  assert.match(moreMenu, /hub-menu-link-label/);
  assert.match(moreMenu, /hub-menu-link-count/);
  assert.match(siteNav, /Dinosaurs & Prehistoric/);
  assert.match(siteNav, /More Specific Collections/);
  assert.match(css, /width:\s*min\(1500px,\s*calc\(100vw - 64px\)\)/);
  assert.match(css, /max-height:\s*min\(86vh,\s*900px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(240px,\s*1fr\)\)/);
  assert.doesNotMatch(sliceRule(css, ".hub-menu-link-label"), /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.doesNotMatch(sliceRule(css, ".hero-related-label"), /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.doesNotMatch(sliceRule(css, ".related-link-label"), /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
});

test("browser and print QA gates pass", async () => {
  const browserQa = await readJson("pipeline/manifests/ux-corrective-browser-qa-results.json");
  const printQa = await readJson("pipeline/manifests/ux-corrective-print-qa-results.json");

  assert.equal(browserQa.summary.browserQaPassed, true);
  assert.equal(browserQa.summary.noVisibleFormatsButtonBesidePrint, true);
  assert.equal(browserQa.summary.moreMenuUsesWideDesktopSpace, true);
  assert.equal(browserQa.summary.moreMenuTitlesNotEllipsized, true);
  assert.equal(browserQa.summary.relatedCollectionsReadable, true);
  assert.equal(printQa.summary.printQaPassed, true);
  assert.equal(printQa.summary.generatedPrintDocumentOnePageOriented, true);
  assert.equal(printQa.summary.noBlankPrintPagesExpected, true);
  assert.equal(printQa.summary.noUnexplainedAboutBlank, true);
  assert.equal(printQa.summary.svgDownloadAbsent, true);
});

test("static export, SEO deferrals, image sitemap, and protected media boundaries remain intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const projectText = await readProjectText(["app", "src"]);
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imageSitemap = await readText("public/image-sitemap.xml");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(existsSync(path.join(REPO_ROOT, "app", "api")), false);
  assert.deepEqual(publicFiles.sort(), ["public/image-sitemap.xml"]);
  assert.match(imageSitemap, /<image:loc>https:\/\/assets\.ilovecoloringpage\.com\/coloring-pages\/webp\//);
  assert.doesNotMatch(imageSitemap, /\/svg\/|\/png\/|\/thumbs\/|r2\.dev|localhost/i);
  assert.doesNotMatch(projectText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(projectText, /opengraph-image|twitter-image|ImageResponse/i);
  assert.equal(gitStatusFor("images"), "");
  assert.equal(gitStatusFor("ilovesvg"), "");
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

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    for (const file of await listFilesIfExists(path.join(REPO_ROOT, relativeRoot))) {
      if (!/\.(?:ts|tsx|css|json|mjs)$/.test(file)) continue;
      if (file.startsWith("src/generated/coloring/")) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

function gitStatusFor(relativePath) {
  return execFileSync("git", ["status", "--short", "--", relativePath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

function sliceRule(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) return "";
  const end = css.indexOf("}", start);
  return end === -1 ? css.slice(start) : css.slice(start, end + 1);
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  if (start === -1) return "";
  const end = source.indexOf(endNeedle, start);
  return end === -1 ? source.slice(start) : source.slice(start, end + endNeedle.length);
}
