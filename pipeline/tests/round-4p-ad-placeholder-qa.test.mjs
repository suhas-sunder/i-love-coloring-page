import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4P_MANIFESTS = [
  "pipeline/manifests/round-4p-project-context-check.json",
  "pipeline/manifests/round-4p-ad-placeholder-inventory.json",
  "pipeline/manifests/round-4p-ad-policy-validation.json",
  "pipeline/manifests/round-4p-browser-ad-qa-results.json",
  "pipeline/manifests/round-4p-seo-content-quality-roadmap.json",
  "pipeline/manifests/round-4p-ad-placeholder-qa-results.json",
  "pipeline/manifests/round-4p-visual-microfix-results.json",
];

test("Round 4P JSON manifests parse and confirm the requested project context", async () => {
  for (const relativePath of ROUND4P_MANIFESTS) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  const context = await readJson("pipeline/manifests/round-4p-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4oCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.visibleSvgDownloadOptions, false);
  assert.equal(context.summary.visibleJpegWebpOptions, false);
});

test("ad placeholder inventory keeps placeholders permanent, labeled, and outside forbidden surfaces", async () => {
  const inventory = await readJson("pipeline/manifests/round-4p-ad-placeholder-inventory.json");
  const policy = await readJson("pipeline/manifests/round-4p-ad-policy-validation.json");
  const qa = await readJson("pipeline/manifests/round-4p-ad-placeholder-qa-results.json");
  const slot = await readText("src/components/ads/AdSlot.tsx");
  const rail = await readText("src/components/ads/AdRail.tsx");
  const config = await readText("src/lib/ads/config.ts");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const css = await readText("src/styles/components.css");

  assert.equal(inventory.summary.labelText, "Advertisement");
  assert.equal(inventory.summary.liveAdCodePresent, false);
  assert.equal(inventory.summary.publisherOrClientIdsPresent, false);
  assert.equal(policy.summary.passesPolicySafePlaceholderCheck, true);
  assert.equal(policy.summary.adInsideNav, false);
  assert.equal(policy.summary.adInsideImageCard, false);
  assert.equal(policy.summary.adInsideGalleryGrid, false);
  assert.equal(policy.summary.adAdjacentToPrintDownloadRows, false);
  assert.equal(qa.summary.placeholdersVisibleWhenEnabled, true);
  assert.match(slot, /aria-label="Advertisement"/);
  assert.match(slot, /data-ad-placeholder="true"/);
  assert.doesNotMatch(`${config}\n${slot}\n${rail}`, /NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders|return null/);
  assert.match(css, /@media print[\s\S]*\.ad-slot/);
  assert.doesNotMatch(`${header}\n${imageCard}\n${galleryGrid}`, /AdSlot|AdRail|data-ad-placeholder|Advertisement/);
});

test("downloads remain PNG-only and no public SVG, JPG, JPEG, or WebP options are exposed", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const publicSource = await readProjectText(["app", "src/components", "src/lib/navigation"]);

  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(publicSource, /Download SVG|SVG download|SVG downloads|SVG and PNG|PNG and SVG|download format.*SVG/i);
  assert.doesNotMatch(imageCard, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/);
});

test("Round 4P keeps static architecture, media boundaries, and SEO implementation out of scope", async () => {
  const nextConfig = await readText("next.config.mjs");
  const routes = await readJson("src/generated/coloring/routes.json");
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const sourceText = await readProjectText(["app", "src", "pipeline/reports/round-4p-seo-content-quality-roadmap.md"]);
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.equal(statusImages.trim(), "");
  assert.equal(statusIlovesvg.trim(), "");
  assert.equal(statusProductionFull.trim(), "");
  assert.equal(trackedR2UploadMedia.trim(), "");
  assert.doesNotMatch(sourceText, /application\/ld\+json|ImageObject|BreadcrumbList|FAQPage|opengraph-image/i);
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

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    if (/\.(?:ts|tsx|css|json|md)$/.test(relativeRoot)) {
      chunks.push(await readText(relativeRoot));
      continue;
    }
    const files = await listFilesIfExists(root);
    for (const file of files) {
      if (!/\.(?:ts|tsx|css|json|md)$/.test(file)) continue;
      chunks.push(await readText(file));
    }
  }
  return chunks.join("\n");
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
