import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-4t-project-context-check.json",
  "pipeline/manifests/round-4t-ad-visibility-mode-change.json",
  "pipeline/manifests/round-4t-ad-visual-results.json",
  "pipeline/manifests/round-4t-header-ad-visibility.json",
  "pipeline/manifests/round-4t-side-rail-visibility.json",
  "pipeline/manifests/round-4t-overflow-verification.json",
  "pipeline/manifests/round-4t-more-menu-results.json",
  "pipeline/manifests/round-4t-mobile-nav-results.json",
  "pipeline/manifests/round-4t-browser-qa-proof.json",
  "pipeline/manifests/round-4t-ad-visibility-results.json",
  "pipeline/manifests/round-4t-visual-fix-summary.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/round-4t-project-context-check.md",
  "pipeline/reports/round-4t-ad-visibility-mode-change.md",
  "pipeline/reports/round-4t-ad-visual-results.md",
  "pipeline/reports/round-4t-header-ad-visibility.md",
  "pipeline/reports/round-4t-side-rail-visibility.md",
  "pipeline/reports/round-4t-overflow-verification.md",
  "pipeline/reports/round-4t-more-menu-report.md",
  "pipeline/reports/round-4t-mobile-nav-report.md",
  "pipeline/reports/round-4t-browser-qa-proof.md",
  "pipeline/reports/round-4t-ad-visibility-results.md",
  "pipeline/reports/round-4t-visual-fix-summary.md",
  "pipeline/reports/round-4t-next-phase-plan.md",
];

test("Round 4T JSON manifests and reports parse and confirm project context", async () => {
  for (const relativePath of REQUIRED_JSON) {
    const raw = await readText(relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
    JSON.parse(raw);
  }

  for (const relativePath of REQUIRED_REPORTS) {
    const text = await readText(relativePath);
    assert.match(text, /\S/, relativePath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  const context = await readJson("pipeline/manifests/round-4t-project-context-check.json");
  assert.equal(context.summary.correctRepo, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4rCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.visibleSvgDownloadOptions, false);
});

test("ad placeholders are permanent visible wells and no longer env gated", async () => {
  const modeChange = await readJson("pipeline/manifests/round-4t-ad-visibility-mode-change.json");
  const adResults = await readJson("pipeline/manifests/round-4t-ad-visibility-results.json");
  const visual = await readJson("pipeline/manifests/round-4t-ad-visual-results.json");
  const header = await readJson("pipeline/manifests/round-4t-header-ad-visibility.json");
  const sideRails = await readJson("pipeline/manifests/round-4t-side-rail-visibility.json");
  const browserQa = await readJson("pipeline/manifests/round-4t-browser-qa-proof.json");
  const adSlot = await readText("src/components/ads/AdSlot.tsx");
  const adRail = await readText("src/components/ads/AdRail.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");
  const componentsCss = await readText("src/styles/components.css");
  const forbiddenSurfaces = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MoreHubMenu.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
  ]);

  assert.equal(modeChange.summary.placeholdersVisibleByDefault, true);
  assert.equal(modeChange.summary.nextPublicShowAdPlaceholdersRequired, false);
  assert.equal(modeChange.summary.oldPlaceholderOffDefaultRemoved, true);
  assert.equal(modeChange.summary.noLiveAdCodeAdded, true);
  assert.equal(adResults.summary.placeholdersVisibleByDefault, true);
  assert.equal(adResults.summary.oldEnvGatedPlaceholderOffBehaviorRemoved, true);
  assert.equal(visual.summary.labelIsAdvertisement, true);
  assert.equal(header.summary.belowHeaderAdVisibleAboveFold, true);
  assert.equal(sideRails.summary.leftRailVisibleAtWideDesktop, true);
  assert.equal(sideRails.summary.rightRailVisibleAtWideDesktop, true);
  assert.equal(sideRails.summary.hiddenOnSmallerWidths, true);
  assert.equal(browserQa.summary.pass, true);
  assert.equal(browserQa.summary.visibleByDefaultWithoutEnvFlag, true);
  assert.equal(browserQa.summary.noPlaceholderOffModeRemains, true);
  assert.equal(browserQa.summary.ownerNoPlaceholderScreenshotIssueFixed, true);
  assert.equal(browserQa.summary.labelCountsByRequiredScreenshot["coloring-pages-1440"], 3);
  assert.equal(browserQa.summary.labelCountsByRequiredScreenshot["coloring-pages-1920"], 5);
  assert.equal(browserQa.summary.labelCountsByRequiredScreenshot["animals-1440"], 3);
  assert.equal(browserQa.summary.labelCountsByRequiredScreenshot["christmas-1440"], 3);
  assert.equal(browserQa.summary.labelCountsByRequiredScreenshot["mobile-banner"], 3);
  assert.match(adSlot, /data-ad-placeholder="true"/);
  assert.match(adSlot, /aria-label="Advertisement"/);
  assert.match(adSlot, /ad-slot-label/);
  assert.doesNotMatch(`${adSlot}\n${adRail}\n${adsConfig}`, /NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders|return null/);
  assert.match(componentsCss, /--ad-rail-safe-gap:\s*var\(--space-48\)/);
  assert.match(componentsCss, /\.ad-rail-left/);
  assert.match(componentsCss, /\.ad-rail-right/);
  assert.doesNotMatch(forbiddenSurfaces, /AdSlot|AdRail|data-ad-placeholder|Advertisement/);
  assert.doesNotMatch(await readProjectText(["app", "src/components", "src/lib"]), /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

test("Round 4T keeps overflow, More menu, and mobile nav fixes intact", async () => {
  const overflow = await readJson("pipeline/manifests/round-4t-overflow-verification.json");
  const more = await readJson("pipeline/manifests/round-4t-more-menu-results.json");
  const mobile = await readJson("pipeline/manifests/round-4t-mobile-nav-results.json");
  const browserQa = await readJson("pipeline/manifests/round-4t-browser-qa-proof.json");
  const componentsCss = await readText("src/styles/components.css");
  const layoutCss = await readText("src/styles/layout.css");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");

  assert.equal(overflow.summary.noHorizontalOverflowAfterFix, true);
  assert.equal(overflow.summary.noBodyOverflowXAfterFix, true);
  assert.deepEqual(overflow.summary.widthsWithHorizontalScrollbar, []);
  assert.deepEqual(browserQa.summary.overflow.widthsWithHorizontalScrollbar, []);
  assert.ok(browserQa.summary.overflow.widthsTested.includes(390));
  assert.ok(browserQa.summary.overflow.widthsTested.includes(2560));
  assert.equal(more.summary.opensAndClosesReliably, true);
  assert.equal(more.summary.usesWideDesktopLayout, true);
  assert.equal(more.summary.usesResponsiveColumns, true);
  assert.equal(mobile.summary.usesFullScreenOrNearFullScreenPanel, true);
  assert.equal(mobile.summary.searchAtTop, true);
  assert.equal(mobile.summary.noAwkwardExposedSideGutter, true);
  assert.match(moreMenu, /useState/);
  assert.match(moreMenu, /aria-expanded=\{isOpen\}/);
  assert.match(moreMenu, /aria-controls=\{menuId\}/);
  assert.match(componentsCss, /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/);
  assert.match(componentsCss, /width:\s*min\(960px,\s*calc\(100vw - 48px\)\)/);
  assert.match(componentsCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
  assert.match(mobileNav, /className="mobile-nav-toggle"/);
  assert.match(mobileNav, /mobile-nav-panel-header/);
  assert.match(componentsCss, /\.mobile-nav-toggle\s*{[\s\S]*border:\s*0/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*inset:\s*0/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*max-width:\s*none/);
  assert.doesNotMatch(layoutCss, /calc\(50%\s*-\s*50vw\)/);
  assert.doesNotMatch(siteNav, /label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/);
});

test("Round 4T keeps static export, media boundaries, route boundaries, and download limits intact", async () => {
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
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        results.push(path.relative(REPO_ROOT, absolute));
      }
    }
  }
  await walk(root);
  return results;
}

async function readProjectText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    const root = path.join(REPO_ROOT, relativeRoot);
    try {
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
    } catch {
      continue;
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

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
