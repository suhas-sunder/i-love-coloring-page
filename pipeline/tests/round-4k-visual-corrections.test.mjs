import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4K_MANIFEST_FILES,
  ROUND4K_REPORT_FILES,
  ROUND4K_RUN_ID,
  runRound4KDisplayTitleCleanup,
} from "../scripts/round-4k-clean-display-titles.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BAD_TITLE_PATTERN = /\b(?:Failed\s+)?ChatGPT Image\b|\bOpenAI\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2}|\b\d{1,2}-\d{1,2}-20\d{2}\b/i;
const ALLOWED_PRODUCTION_BRANCHES = new Set(["main", "version-4", "version-1", "ver-5-deployed-may-13-2026", "ver-6-seo"]);

test("Round 4K generated artifacts parse and confirm the requested project context", async () => {
  const result = await runRound4KDisplayTitleCleanup({ repoRoot: REPO_ROOT });
  assert.equal(result.runId, ROUND4K_RUN_ID);

  for (const relativePath of ROUND4K_MANIFEST_FILES) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const reportPath of ROUND4K_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4K/i, reportPath);
    assert.doesNotMatch(text, /coloring\/test-v1|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  const context = await readJson("pipeline/manifests/round-4k-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.ok(ALLOWED_PRODUCTION_BRANCHES.has(context.summary.branch), `unexpected branch ${context.summary.branch}`);
  assert.equal(context.summary.round4jCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
});

test("Round 4K color rules remove random warm wrappers and keep only approved tokens", async () => {
  const tokens = await readText("src/styles/tokens.css");
  const components = await readText("src/styles/components.css");
  const layout = await readText("src/styles/layout.css");
  const base = await readText("src/styles/base.css");
  const allCss = `${tokens}\n${components}\n${layout}\n${base}`;

  for (const token of [
    "--color-canvas",
    "--color-paper",
    "--color-paper-soft",
    "--color-ink",
    "--color-text",
    "--color-text-muted",
    "--color-plum",
    "--color-coral",
    "--color-sky",
    "--color-mint",
    "--color-rose",
    "--color-deep-navy",
    "--color-focus",
    "--color-soft-sky",
    "--color-soft-mint",
    "--color-soft-rose",
    "--color-soft-plum",
    "--color-soft-paper",
  ]) {
    assert.match(tokens, new RegExp(escapeRegExp(token)), token);
  }

  assert.doesNotMatch(allCss, /linear-gradient|radial-gradient|conic-gradient/i);
  assert.doesNotMatch(allCss, /--color-(?:creative|soft)-yellow|yellow-surface|#f8eecf|#a86b00/i);
  assert.doesNotMatch(components, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(layout, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(base, /#[0-9a-f]{3,8}\b/i);
  assert.match(allCss, /:focus-visible/);
});

test("section layouts avoid nested gallery cards and colored wrapper cards", async () => {
  const files = [
    "app/page.tsx",
    "app/coloring-pages/page.tsx",
    "src/components/coloring/HubPageContent.tsx",
    "src/styles/components.css",
  ];
  const combined = (await Promise.all(files.map(readText))).join("\n");

  assert.doesNotMatch(combined, /featured-strip|section-list-panel|nested-card/i);
  assert.doesNotMatch(combined, /soft-yellow|creative-yellow|yellow-surface/i);
  assert.match(combined, /section-band/);
  assert.match(combined, /featured-band/);
});

test("image cards use clean clickable previews and simplified actions", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const assetImage = await readText("src/components/coloring/AssetImage.tsx");
  const assets = await readText("src/lib/coloring/assets.ts");
  const components = await readText("src/styles/components.css");

  assert.match(imageCard, /id=\{`asset-\$\{item\.assetId\}`\}/);
  assert.match(imageCard, /gallery-item-media-button/);
  assert.match(imageCard, /onClick=\{openPrintPreview\}/);
  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download/);
  assert.doesNotMatch(imageCard, />\s*SVG\s*</);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(imageCard, /Download SVG|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/);
  assert.match(galleryGrid, /getItemHref/);
  assert.match(assetImage, /className="asset-image"/);
  assert.match(assets, /preview:\s*(?:webp\s*\|\|\s*)?png\s*\|\|\s*thumbnail/);
  assert.match(components, /\.gallery-item-media-button[\s\S]*cursor:\s*pointer/);
  assert.doesNotMatch(components, /\.gallery-item-media[\s\S]{0,220}padding:/);
});

test("homepage, landing, and featured previews link to real static anchors", async () => {
  const home = await readText("app/page.tsx");
  const landing = await readText("app/coloring-pages/page.tsx");
  const hubContent = await readText("src/components/coloring/HubPageContent.tsx");
  const rotatingFeaturedGrid = await readText("src/components/coloring/RotatingFeaturedGrid.tsx");

  assert.ok(/href=\{getColoringItemHref\(item, rootHub\.route\)\}/.test(home) || /itemHrefBasePath=\{rootHub\.route\}/.test(home));
  assert.ok(/href=\{getColoringItemHref\(item, rootHub\.route\)\}/.test(landing) || /itemHrefBasePath=\{rootHub\.route\}/.test(landing));
  assert.ok(/href=\{getColoringItemHref\(item, hub\.route\)\}/.test(hubContent) || /itemHrefBasePath=\{hub\.route\}/.test(hubContent));
  assert.match(rotatingFeaturedGrid, /`\$\{itemHrefBasePath\}#asset-\$\{item\.assetId\}`/);
  assert.doesNotMatch(`${home}\n${landing}\n${hubContent}`, /\[assetId\]|\/image\//i);
});

test("display-title cleanup removes bad public titles without renaming files", async () => {
  const cleanup = await readJson("pipeline/manifests/round-4k-display-title-cleanup.json");
  const overrides = await readJson("src/generated/coloring/title-overrides.json");
  const searchIndex = await readJson("src/generated/coloring/search-index.json");
  const items = await readJson("src/generated/coloring/items.json");

  assert.equal(overrides.runId, ROUND4K_RUN_ID);
  assert.equal(cleanup.summary.detectedBadTitleCount, overrides.overrides.length);
  assert.ok(overrides.overrides.length >= 3);

  const overrideIds = new Set(overrides.overrides.map((entry) => entry.assetId));
  const searchById = new Map(searchIndex.entries.map((entry) => [entry.assetId, entry]));
  const itemById = new Map(items.items.map((item) => [item.assetId, item]));
  for (const override of overrides.overrides) {
    assert.equal(typeof override.cleanTitle, "string");
    assert.doesNotMatch(override.cleanTitle, BAD_TITLE_PATTERN);
    assert.doesNotMatch(override.cleanAltText, BAD_TITLE_PATTERN);
    assert.equal(Boolean(itemById.get(override.assetId)), true, override.assetId);
    assert.equal(override.filesRenamed, false, override.assetId);
    assert.equal(override.mediaFilenamesRenamed, false, override.assetId);
    assert.equal(typeof override.manualReviewRequired, "boolean", override.assetId);
    const searchEntry = searchById.get(override.assetId);
    assert.ok(searchEntry, override.assetId);
    assert.doesNotMatch(searchEntry.title, BAD_TITLE_PATTERN, override.assetId);
  }

  for (const entry of searchIndex.entries.filter((entry) => overrideIds.has(entry.assetId))) {
    assert.doesNotMatch(entry.title, BAD_TITLE_PATTERN, entry.assetId);
  }

  const { stdout } = await execFileAsync("git", ["diff", "--name-only", "--", "src/generated/coloring/items.json"], { cwd: REPO_ROOT });
  assert.equal(stdout.trim(), "");
});

test("typography is locked to next/font/google with Fraunces and Figtree roles", async () => {
  const layout = await readText("app/layout.tsx");
  const typography = await readJson("pipeline/manifests/round-4k-typography-audit.json");
  const components = await readText("src/styles/components.css");
  const base = await readText("src/styles/base.css");

  assert.match(layout, /next\/font\/google/);
  assert.match(layout, /\bFigtree\b/);
  assert.match(layout, /\bFraunces\b/);
  assert.doesNotMatch(`${layout}\n${components}\n${base}`, /fonts\.googleapis\.com|@import\s+url\([^)]*font/i);
  assert.equal(typography.summary.figtreeConfigured, true);
  assert.equal(typography.summary.frauncesConfigured, true);
  assert.equal(typography.summary.atkinsonConfigured, false);
  assert.match(components, /\.item-title[\s\S]*font-family:\s*var\(--font-ui\)/);
  assert.match(components, /\.page-title[\s\S]*font-family:\s*var\(--font-display\)/);
});

test("static architecture and protected assets remain unchanged", async () => {
  const nextConfig = await readText("next.config.mjs");
  const routes = await readJson("src/generated/coloring/routes.json");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const activeRound4KText = await readActiveRound4KArtifacts();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.doesNotMatch(activeRound4KText, /coloring\/test-v1/i);

  const inventory = await readJson("pipeline/manifests/image-inventory.json");
  for (const entry of inventory.entries.slice(0, 25)) {
    const sourceStat = await stat(path.join(REPO_ROOT, ...entry.sourceRelativePath.split("/")));
    assert.equal(Number(sourceStat.size), Number(entry.fileSizeBytes), entry.sourceRelativePath);
  }
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), "utf8");
}

async function readActiveRound4KArtifacts() {
  const chunks = [];
  for (const relativePath of [...ROUND4K_MANIFEST_FILES, ...ROUND4K_REPORT_FILES]) {
    chunks.push(await readText(relativePath));
  }
  return chunks.join("\n");
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
