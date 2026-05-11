import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const ROUND4S_MANIFESTS = [
  "pipeline/manifests/round-4s-project-context-check.json",
  "pipeline/manifests/round-4s-horizontal-overflow-audit.json",
  "pipeline/manifests/round-4s-ad-visibility-proof.json",
  "pipeline/manifests/round-4s-ad-slot-preservation-results.json",
  "pipeline/manifests/round-4s-more-menu-results.json",
  "pipeline/manifests/round-4s-mobile-nav-results.json",
  "pipeline/manifests/round-4s-browser-qa-results.json",
  "pipeline/manifests/round-4s-visual-fix-summary.json",
];

const ROUND4S_REPORTS = [
  "pipeline/reports/round-4s-project-context-check.md",
  "pipeline/reports/round-4s-horizontal-overflow-audit.md",
  "pipeline/reports/round-4s-ad-visibility-proof.md",
  "pipeline/reports/round-4s-ad-slot-preservation-report.md",
  "pipeline/reports/round-4s-more-menu-report.md",
  "pipeline/reports/round-4s-mobile-nav-report.md",
  "pipeline/reports/round-4s-browser-qa-report.md",
  "pipeline/reports/round-4s-visual-fix-summary.md",
  "pipeline/reports/round-4s-next-phase-plan.md",
];

test("Round 4S manifests and reports parse and confirm the requested project context", async () => {
  for (const relativePath of ROUND4S_MANIFESTS) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const relativePath of ROUND4S_REPORTS) {
    const text = await readText(relativePath);
    assert.match(text, /Round 4S/i, relativePath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  const context = await readJson("pipeline/manifests/round-4s-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4rCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.visibleSvgDownloadOptions, false);
});

test("Round 4S removes horizontal overflow sources instead of masking them", async () => {
  const overflow = await readJson("pipeline/manifests/round-4s-horizontal-overflow-audit.json");
  const browserQa = await readJson("pipeline/manifests/round-4s-browser-qa-results.json");
  const layoutCss = await readText("src/styles/layout.css");
  const componentsCss = await readText("src/styles/components.css");

  assert.equal(overflow.summary.reproducedBeforeFix, true);
  assert.equal(overflow.summary.noHorizontalOverflowAfterFix, true);
  assert.equal(overflow.summary.noBodyOverflowXAfterFix, true);
  assert.equal(overflow.summary.overflowXHiddenUsedAsMask, false);
  assert.equal(overflow.summary.actualOverflowSourceFixed, true);
  assert.deepEqual(browserQa.summary.overflow.widthsWithHorizontalScrollbar, []);
  assert.ok(browserQa.summary.overflow.widthsTested.includes(390));
  assert.ok(browserQa.summary.overflow.widthsTested.includes(2560));
  assert.doesNotMatch(layoutCss, /calc\(50%\s*-\s*50vw\)/);
  assert.doesNotMatch(componentsCss, /width:\s*min\(420px,\s*calc\(100vw - 32px\)\)/);
  assert.doesNotMatch(componentsCss, /right:\s*var\(--page-gutter\)/);
  assert.doesNotMatch(`${layoutCss}\n${componentsCss}`, /overflow-x:\s*hidden/i);
});

test("ad placeholders are clearly visible when enabled and remain policy safe", async () => {
  const proof = await readJson("pipeline/manifests/round-4s-ad-visibility-proof.json");
  const preservation = await readJson("pipeline/manifests/round-4s-ad-slot-preservation-results.json");
  const adSlot = await readText("src/components/ads/AdSlot.tsx");
  const adRail = await readText("src/components/ads/AdRail.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const componentsCss = await readText("src/styles/components.css");
  const adCss = extractAdCss(componentsCss);
  const forbiddenSurfaces = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MoreHubMenu.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
  ]);

  assert.equal(proof.summary.placeholdersHiddenWhenFlagOff, true);
  assert.equal(proof.summary.placeholdersVisibleWhenFlagOn, true);
  assert.equal(proof.summary.allRequiredPagesHaveVisibleAdvertisementLabels, true);
  assert.equal(proof.summary.noAdCausedHorizontalOverflow, true);
  assert.equal(proof.summary.liveAdCodePresent, false);
  assert.equal(proof.summary.publisherOrClientIdsPresent, false);
  assert.equal(preservation.summary.slotIdsChanged, false);
  assert.equal(preservation.summary.slotCountChanged, false);
  assert.equal(preservation.summary.placementCountChanged, false);
  assert.equal(preservation.summary.sideRailsHiddenOnSmallerScreens, true);
  assert.equal(preservation.summary.sideRailsHaveSafeGap, true);
  assert.match(adSlot, /if \(!showAdPlaceholders\(\)\) return null/);
  assert.match(adRail, /if \(!showAdPlaceholders\(\)\) return null/);
  assert.match(adsConfig, /showAdPlaceholdersValue === "1"/);
  assert.match(adSlot, /aria-label="Advertisement"/);
  assert.match(adSlot, /data-ad-placeholder="true"/);
  assert.match(adCss, /background:\s*var\(--color-soft-plum\)/);
  assert.match(adCss, /\.ad-slot-label[\s\S]*color:\s*var\(--color-plum\)/);
  assert.match(adCss, /--ad-rail-safe-gap:\s*var\(--space-48\)/);
  assert.match(componentsCss, /\.ad-rail-left/);
  assert.match(componentsCss, /\.ad-rail-right/);
  assert.doesNotMatch(adCss, /#[0-9a-f]{3,8}|gradient|box-shadow\s*:|\bborder\s*:|\boutline\s*:/i);
  assert.doesNotMatch(adCss, /::before[\s\S]{0,220}content:\s*""/i);
  assert.doesNotMatch(forbiddenSurfaces, /AdSlot|AdRail|data-ad-placeholder|Advertisement/);
  assert.doesNotMatch(await readProjectText(["app", "src/components", "src/lib"]), /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

test("desktop More menu uses wide responsive layout and reliable controlled close behavior", async () => {
  const more = await readJson("pipeline/manifests/round-4s-more-menu-results.json");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const componentsCss = await readText("src/styles/components.css");

  assert.equal(more.summary.opensAndClosesReliably, true);
  assert.equal(more.summary.closesOnButton, true);
  assert.equal(more.summary.closesOnEscape, true);
  assert.equal(more.summary.closesOnOutsideClick, true);
  assert.equal(more.summary.closesOnLinkClick, true);
  assert.equal(more.summary.searchWorks, true);
  assert.equal(more.summary.noHorizontalOverflow, true);
  assert.equal(more.summary.usesWideDesktopLayout, true);
  assert.match(moreMenu, /useState/);
  assert.match(moreMenu, /useRef/);
  assert.match(moreMenu, /useEffect/);
  assert.match(moreMenu, /aria-expanded=\{isOpen\}/);
  assert.match(moreMenu, /aria-controls=\{menuId\}/);
  assert.match(moreMenu, /event\.key === "Escape"/);
  assert.match(moreMenu, /pointerdown/);
  assert.match(moreMenu, /type="search"/);
  assert.match(componentsCss, /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/);
  assert.match(componentsCss, /width:\s*min\(960px,\s*calc\(100vw - 48px\)\)/);
  assert.match(componentsCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
  assert.doesNotMatch(siteNav, /label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/);
  assert.doesNotMatch(moreMenu, /AdSlot|AdRail|data-ad-placeholder|affiliate/i);
});

test("mobile nav is a proper full-screen hamburger menu with search-first layout", async () => {
  const mobile = await readJson("pipeline/manifests/round-4s-mobile-nav-results.json");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const componentsCss = await readText("src/styles/components.css");

  assert.equal(mobile.summary.hamburgerButtonImplemented, true);
  assert.equal(mobile.summary.hamburgerButtonHasNoBorder, true);
  assert.equal(mobile.summary.usesFullScreenOrNearFullScreenPanel, true);
  assert.equal(mobile.summary.searchAtTop, true);
  assert.equal(mobile.summary.noAwkwardExposedSideGutter, true);
  assert.equal(mobile.summary.noNarrowPanelCss, true);
  assert.equal(mobile.summary.noHorizontalOverflow, true);
  assert.equal(mobile.summary.closesOnButton, true);
  assert.equal(mobile.summary.closesOnEscape, true);
  assert.equal(mobile.summary.closesOnLinkClick, true);
  assert.match(mobileNav, /className="mobile-nav-toggle"/);
  assert.match(mobileNav, /aria-label=\{isOpen \? "Close navigation menu" : "Open navigation menu"\}/);
  assert.match(mobileNav, /aria-expanded=\{isOpen\}/);
  assert.match(mobileNav, /aria-controls=\{panelId\}/);
  assert.match(mobileNav, /mobile-nav-panel-header/);
  assert.match(mobileNav, /mobile-nav-close/);
  assert.match(mobileNav, /<button/);
  assert.match(mobileNav, /<Link/);
  assert.match(moreMenu, /leadLinks/);
  assert.match(componentsCss, /\.mobile-nav-toggle\s*{[\s\S]*border:\s*0/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*inset:\s*0/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*max-width:\s*none/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*overflow-y:\s*auto/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*overflow-x:\s*clip/);
  assert.doesNotMatch(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*width:\s*min\(420px/);
  assert.doesNotMatch(`${mobileNav}\n${moreMenu}`, /AdSlot|AdRail|data-ad-placeholder|Advertisement|affiliate/i);
});

test("Round 4S keeps static export, media boundaries, route boundaries, and download limits intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const packageJson = await readJson("package.json");
  const routes = await readJson("src/generated/coloring/routes.json");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const sourceText = await readProjectText(["app", "src/components", "src/lib/navigation", "src/lib/ads"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(routes.noPerImageRoutes, true);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["next", "react", "react-dom"]);
  assert.match(imageCard, /Download PNG/);
  assert.match(imageCard, /Print/);
  assert.doesNotMatch(sourceText, /Download SVG|SVG download|Download JPG|Download JPEG|Download WebP|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/i);
  assert.doesNotMatch(sourceText, /application\/ld\+json|ImageObject|BreadcrumbList|FAQPage|image-sitemap|opengraph-image/i);
  assert.equal(trackedR2UploadMedia.trim(), "");
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
      if (normalizePath(file).startsWith("src/generated/coloring/items.json")) continue;
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

async function gitStatus() {
  const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: REPO_ROOT });
  return stdout;
}

function extractAdCss(css) {
  const start = css.indexOf(".ad-slot {");
  const end = css.indexOf(".button:hover", start);
  assert.notEqual(start, -1, "ad CSS start marker missing");
  assert.notEqual(end, -1, "ad CSS end marker missing");
  return css.slice(start, end);
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
