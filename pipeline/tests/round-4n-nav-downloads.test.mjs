import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ROUND4N_MANIFEST_FILES,
  ROUND4N_REPORT_FILES,
  ROUND4N_RUN_ID,
  runRound4NNavDownloads,
} from "../scripts/round-4n-build-nav-downloads.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ALLOWED_PRODUCTION_BRANCHES = new Set(["version-4", "version-1", "ver-5-deployed-may-13-2026", "ver-6-seo"]);

test("Round 4N generated artifacts parse and confirm the requested project context", async () => {
  const result = await runRound4NNavDownloads({ repoRoot: REPO_ROOT });
  assert.equal(result.runId, ROUND4N_RUN_ID);

  for (const relativePath of ROUND4N_MANIFEST_FILES) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const reportPath of ROUND4N_REPORT_FILES) {
    const text = await readText(reportPath);
    assert.match(text, /Round 4N/i, reportPath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, reportPath);
  }

  const context = await readJson("pipeline/manifests/round-4n-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.ok(ALLOWED_PRODUCTION_BRANCHES.has(context.summary.branch), `unexpected branch ${context.summary.branch}`);
  assert.equal(context.summary.round4mCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
});

test("desktop and mobile navigation expose searchable More hub navigation without the old top-level link", async () => {
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const navRouteMap = await readJson("pipeline/manifests/round-4n-nav-route-map.json");
  const navigationResults = await readJson("pipeline/manifests/round-4n-navigation-results.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const routePaths = new Set(routes.routes.map((route) => route.path));

  assert.equal(navigationResults.summary.topLevelColoringPagesRemoved, true);
  assert.equal(navigationResults.summary.moreMenuImplemented, true);
  assert.equal(navigationResults.summary.mobileHubSearchImplemented, true);
  assert.deepEqual(navRouteMap.missingPhase1HubRoutes, []);
  assert.deepEqual(navRouteMap.brokenLinks, []);
  assert.deepEqual(navRouteMap.phase2OrBacklogLinks, []);
  assert.deepEqual(navRouteMap.sectionOnlyLinks, []);
  assert.ok(navRouteMap.moreMenuHubLinks.length > 40);

  assert.doesNotMatch(siteNav, /label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/);
  assert.match(header, /MoreHubMenu/);
  assert.match(moreMenu, /type="search"/);
  assert.match(moreMenu, /Search hub pages/);
  assert.match(moreMenu, /Search mobile hub pages/);
  assert.doesNotMatch(`${siteNav}\n${header}\n${moreMenu}`, /AdSlot|Advertisement|affiliate/i);

  for (const link of [...navRouteMap.primaryNavLinks, ...navRouteMap.utilityLinks, ...navRouteMap.moreMenuHubLinks]) {
    const pathOnly = link.href.split("#")[0];
    assert.ok(routePaths.has(pathOnly) || pathOnly === "/", link.href);
  }
});

test("user-facing downloads remove SVG and keep only formats that are actually implemented", async () => {
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const downloadResults = await readJson("pipeline/manifests/round-4n-download-ux-results.json");
  const publicSource = await readProjectText(["app", "src/components", "src/lib/navigation"]);

  assert.equal(downloadResults.summary.userFacingSvgRemoved, true);
  assert.deepEqual(downloadResults.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(downloadResults.summary.jpegWebpImplemented, false);
  assert.equal(downloadResults.summary.jpegWebpDeferred, true);

  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(imageCard, /Download SVG|SVG pill|svgUrl|pngUrl\s*\|\|\s*svgUrl|assetUrls\.svg/);
  assert.doesNotMatch(publicSource, /Download SVG|SVG download|SVG downloads|SVG and PNG|PNG and SVG|download format.*SVG/i);
  assert.doesNotMatch(imageCard, /\bDownload JPG\b|\bDownload JPEG\b|\bDownload WebP\b/);
});

test("ad and affiliate placement remains frozen while nav and downloads change", async () => {
  const guard = await readJson("pipeline/manifests/round-4n-ad-affiliate-guard-results.json");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const galleryGrid = await readText("src/components/coloring/GalleryGrid.tsx");

  assert.equal(guard.summary.adPlacementChanged, false);
  assert.equal(guard.summary.adStylingChanged, false);
  assert.equal(guard.summary.adSlotCountUnchanged, true);
  assert.equal(guard.summary.liveAdCodeAdded, false);
  assert.equal(guard.summary.adsInsideNavigation, false);
  assert.equal(guard.summary.affiliatePlacementChanged, false);
  assert.doesNotMatch(`${moreMenu}\n${header}`, /AdSlot|Advertisement|ad-slot|affiliate/i);
  assert.doesNotMatch(`${imageCard}\n${galleryGrid}`, /AdSlot|Advertisement|ad-slot/i);
});

test("Round 4N keeps static export, media boundaries, route boundaries, and focus states intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const packageJson = await readJson("package.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src", "pipeline/manifests/round-4n-navigation-results.json"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.routes.length, 65);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs)[\\/]/i.test(file)), false);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(sourceText, /coloring\/test-v1/);
  assert.match(sourceText, /:focus-visible/);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["next", "react", "react-dom"]);
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

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    const rootStat = await stat(root);
    if (rootStat.isFile()) {
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

async function gitLsFiles(relativePath) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

async function gitStatusFor(relativePath) {
  const { stdout } = await execFileAsync("git", ["status", "--short", "--", relativePath], { cwd: REPO_ROOT });
  return stdout;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
