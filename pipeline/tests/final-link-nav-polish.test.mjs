import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_MANIFESTS = [
  "pipeline/manifests/final-link-nav-polish-context-check.json",
  "pipeline/manifests/final-link-nav-polish-current-audit.json",
  "pipeline/manifests/final-link-nav-header-hover-results.json",
  "pipeline/manifests/final-link-nav-card-action-results.json",
  "pipeline/manifests/final-link-nav-popular-results.json",
  "pipeline/manifests/final-link-nav-related-results.json",
  "pipeline/manifests/final-link-nav-more-ways-results.json",
  "pipeline/manifests/final-link-nav-more-menu-results.json",
  "pipeline/manifests/final-link-nav-browser-qa-results.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/final-link-nav-polish-context-check.md",
  "pipeline/reports/final-link-nav-polish-current-audit.md",
  "pipeline/reports/final-link-nav-header-hover-report.md",
  "pipeline/reports/final-link-nav-card-action-report.md",
  "pipeline/reports/final-link-nav-popular-report.md",
  "pipeline/reports/final-link-nav-related-report.md",
  "pipeline/reports/final-link-nav-more-ways-report.md",
  "pipeline/reports/final-link-nav-more-menu-report.md",
  "pipeline/reports/final-link-nav-browser-qa-report.md",
];

test("final link and nav manifests and reports exist and pass", async () => {
  for (const relativePath of REQUIRED_MANIFESTS) {
    const payload = await readJson(relativePath);
    assert.ok(payload.summary, `${relativePath} should include summary`);
  }

  for (const relativePath of REQUIRED_REPORTS) {
    assert.ok((await readText(relativePath)).trim().length > 0, `${relativePath} should not be empty`);
  }

  const browserQa = await readJson("pipeline/manifests/final-link-nav-browser-qa-results.json");
  assert.equal(browserQa.summary.browserQaPassed, true);
});

test("header hover uses polished non-shifting focusable nav states", async () => {
  const css = await readText("src/styles/components.css");
  const navLink = extractCssBlock(css, ".site-nav-link");
  const hover = extractCssBlock(css, ".site-nav-link:hover,\n.more-hub-button[aria-expanded=\"true\"]");

  assert.match(navLink, /cursor:\s*pointer/);
  assert.match(css, /\.site-nav-link::after/);
  assert.match(css, /\.site-nav-link:focus-visible/);
  assert.match(hover, /background:\s*var\(--color-soft-plum\)/);
  assert.doesNotMatch(hover, /transform:/);
});

test("card grid stays image-first without redundant visible card Print buttons", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadMenu = await readText("src/components/coloring/DownloadMenu.tsx");

  assert.match(imageCard, /className="gallery-item-media-button"/);
  assert.match(imageCard, /onClick=\{openPrintPreview\}/);
  assert.match(imageCard, /Preview & print/);
  assert.doesNotMatch(imageCard, /className="gallery-actions"[\s\S]*>\s*Print\s*</);
  assert.doesNotMatch(`${imageCard}\n${downloadMenu}`, /Download SVG|downloadSvg\b|svgDownload/i);
  assert.match(downloadMenu, /Download PNG/);
  assert.match(downloadMenu, /Download JPG/);
  assert.match(downloadMenu, /Download WebP/);
});

test("popular and related collection links separate labels from counts without ellipses", async () => {
  const css = await readText("src/styles/components.css");
  const hubLink = extractCssBlock(css, ".hub-link");
  const heroRelated = extractCssBlock(css, ".hero-related-link");
  const relatedLink = extractCssBlock(css, ".related-link");
  const hubCount = extractCssBlock(css, ".hub-link-count");
  const relatedCount = extractCssBlock(css, ".related-link-count");
  const heroCount = extractCssBlock(css, ".hero-related-count");

  for (const block of [hubLink, heroRelated, relatedLink]) {
    assert.match(block, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/);
    assert.match(block, /gap:\s*var\(--space-16\)/);
  }
  for (const block of [hubCount, relatedCount, heroCount]) {
    assert.match(block, /text-align:\s*right/);
    assert.match(block, /white-space:\s*nowrap/);
  }
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
});

test("More ways to browse is not a duplicate raw browse section", async () => {
  const hubPageContent = await readText("src/components/coloring/HubPageContent.tsx");
  const css = await readText("src/styles/components.css");

  assert.doesNotMatch(hubPageContent, /More ways to browse/);
  assert.match(hubPageContent, /Narrower ways to browse/);
  assert.match(hubPageContent, /Subcollections|Common themes/);
  assert.match(css, /\.section-list li[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/);
});

test("More menu uses wide grouped layout with wrapping labels and aligned counts", async () => {
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const css = await readText("src/styles/components.css");
  const desktopPanel = extractCssBlock(css, ".hub-menu-panel-desktop");
  const menuLink = extractCssBlock(css, ".hub-menu-group a");
  const label = extractCssBlock(css, ".hub-menu-link-label");
  const count = extractCssBlock(css, ".hub-menu-link-count");

  assert.match(moreMenu, /handleKeyDown/);
  assert.match(moreMenu, /handlePointerDown/);
  assert.match(moreMenu, /handleNavigate/);
  assert.match(desktopPanel, /width:\s*min\(1500px,\s*calc\(100vw - 64px\)\)/);
  assert.match(desktopPanel, /max-height:\s*min\(86vh,\s*900px\)/);
  assert.match(menuLink, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*max-content/);
  assert.match(label, /overflow-wrap:\s*break-word/);
  assert.doesNotMatch(label, /white-space:\s*nowrap|text-overflow:\s*ellipsis/);
  assert.match(count, /text-align:\s*right/);
  assert.match(count, /white-space:\s*nowrap/);
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

test("repo safety boundaries remain clean", async () => {
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const imagesStatus = await gitStatusFor("images");
  const ilovesvgStatus = await gitStatusFor("ilovesvg");

  assert.equal(publicFiles.every(isApprovedPublicFile), true);
  assert.equal(imagesStatus.trim(), "");
  assert.equal(ilovesvgStatus.trim(), "");
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

function extractCssBlock(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
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

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function isApprovedPublicFile(file) {
  const normalized = normalizePath(file);
  return (
    normalized === "public/image-sitemap.xml" ||
    normalized === "public/favicon.ico" ||
    normalized === "public/icon.svg" ||
    normalized.startsWith("public/og/")
  );
}
