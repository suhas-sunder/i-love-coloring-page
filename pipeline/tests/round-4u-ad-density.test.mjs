import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

const REQUIRED_JSON = [
  "pipeline/manifests/round-4u-project-context-check.json",
  "pipeline/manifests/round-4u-ad-density-audit.json",
  "pipeline/manifests/round-4u-ad-breakpoint-policy.json",
  "pipeline/manifests/round-4u-ad-slot-inventory.json",
  "pipeline/manifests/round-4u-overflow-results.json",
  "pipeline/manifests/round-4u-nav-regression-check.json",
  "pipeline/manifests/round-4u-browser-qa-results.json",
  "pipeline/manifests/round-4u-ad-layout-results.json",
  "pipeline/manifests/round-4u-visual-fix-summary.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/round-4u-project-context-check.md",
  "pipeline/reports/round-4u-ad-density-audit.md",
  "pipeline/reports/round-4u-ad-breakpoint-policy.md",
  "pipeline/reports/round-4u-adsense-unit-guidance.md",
  "pipeline/reports/round-4u-overflow-report.md",
  "pipeline/reports/round-4u-nav-regression-check.md",
  "pipeline/reports/round-4u-browser-qa-report.md",
  "pipeline/reports/round-4u-ad-layout-results.md",
  "pipeline/reports/round-4u-visual-fix-summary.md",
  "pipeline/reports/round-4u-next-phase-plan.md",
];

const EXPECTED_COUNTS = {
  "390": 1,
  "430": 1,
  "768": 1,
  "1024": 1,
  "1280": 1,
  "1440": 1,
  "1920": 3,
  "2560": 3,
};

test("Round 4U JSON manifests and reports parse", async () => {
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

  const context = await readJson("pipeline/manifests/round-4u-project-context-check.json");
  assert.equal(context.summary.correctRepo, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4tCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
});

test("responsive ad density model exposes the expected visible ad count by viewport", async () => {
  const audit = await readJson("pipeline/manifests/round-4u-ad-density-audit.json");
  const policy = await readJson("pipeline/manifests/round-4u-ad-breakpoint-policy.json");
  const inventory = await readJson("pipeline/manifests/round-4u-ad-slot-inventory.json");
  const layout = await readJson("pipeline/manifests/round-4u-ad-layout-results.json");
  const browserQa = await readJson("pipeline/manifests/round-4u-browser-qa-results.json");
  const componentsCss = await readText("src/styles/components.css");
  const adSlot = await readText("src/components/ads/AdSlot.tsx");
  const adRail = await readText("src/components/ads/AdRail.tsx");
  const adsConfig = await readText("src/lib/ads/config.ts");

  assert.equal(audit.summary.previousMobileVisibleAdCount, 3);
  assert.equal(audit.summary.previousWideDesktopVisibleAdCount, 5);
  assert.equal(layout.summary.slotIdsChanged, false);
  assert.equal(layout.summary.liveAdCodeAdded, false);
  assert.equal(layout.summary.desktopAndMobileModelsOverlap, false);
  assert.equal(policy.breakpoints.mobileTabletBannerMaxWidth, 1279);
  assert.equal(policy.breakpoints.desktopHeaderBannerMinWidth, 1280);
  assert.equal(policy.breakpoints.wideDesktopRailsMinWidth, 1740);
  assert.equal(policy.summary.mobileTabletVisibleCount, 1);
  assert.equal(policy.summary.desktopIntermediateVisibleCount, 1);
  assert.equal(policy.summary.wideDesktopVisibleCount, 3);

  for (const pageType of ["home", "galleryLanding", "hubPage"]) {
    assert.deepEqual(inventory.countsByPageType[pageType].visibleByWidth, EXPECTED_COUNTS, pageType);
  }

  for (const [width, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
    assert.equal(browserQa.summary.visibleCountsByWidth[width], expectedCount, width);
  }

  assert.equal(browserQa.summary.mobileLowerBannerVisibleBelowDesktop, true);
  assert.equal(browserQa.summary.desktopHeaderBannerHiddenBelowDesktop, true);
  assert.equal(browserQa.summary.mobileLowerBannerHiddenAtDesktop, true);
  assert.equal(browserQa.summary.leftRightRailsHiddenBelowWideDesktop, true);
  assert.equal(browserQa.summary.leftRightRailsVisibleAtWideDesktop, true);
  assert.equal(browserQa.summary.noPageShowsFourOrFiveWells, true);
  assert.equal(browserQa.summary.ownerAdDensityIssueFixed, true);

  assert.match(componentsCss, /@media \(max-width:\s*1279px\)[\s\S]*\.ad-slot-inline\s*{[\s\S]*display:\s*grid/);
  assert.match(componentsCss, /@media \(max-width:\s*1279px\)[\s\S]*\.ad-slot-header-banner\s*{[\s\S]*display:\s*none/);
  assert.match(componentsCss, /@media \(min-width:\s*1280px\)[\s\S]*\.ad-slot-header-banner\s*{[\s\S]*display:\s*grid/);
  assert.match(componentsCss, /@media \(min-width:\s*1280px\)[\s\S]*\.ad-slot-inline[\s\S]*display:\s*none/);
  assert.match(componentsCss, /@media \(min-width:\s*1740px\)[\s\S]*\.ad-rail/);
  assert.match(componentsCss, /@media \(max-width:\s*1739px\)[\s\S]*\.ad-rail/);
  assert.match(componentsCss, /--ad-rail-safe-gap:\s*var\(--space-48\)/);
  assert.match(adSlot, /aria-label="Advertisement"/);
  assert.doesNotMatch(`${adSlot}\n${adRail}\n${adsConfig}`, /NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS|showAdPlaceholders|return null/);
});

test("Round 4U keeps ads out of forbidden surfaces and preserves nav behavior", async () => {
  const overflow = await readJson("pipeline/manifests/round-4u-overflow-results.json");
  const nav = await readJson("pipeline/manifests/round-4u-nav-regression-check.json");
  const browserQa = await readJson("pipeline/manifests/round-4u-browser-qa-results.json");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const componentsCss = await readText("src/styles/components.css");
  const forbiddenSurfaces = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MoreHubMenu.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
  ]);

  assert.deepEqual(overflow.summary.widthsWithHorizontalScrollbar, []);
  assert.equal(overflow.summary.noHorizontalOverflow, true);
  assert.equal(overflow.summary.noRailOverflow, true);
  assert.equal(overflow.summary.noBannerOverflow, true);
  assert.equal(browserQa.summary.overflow.noHorizontalScrollbarAtTestedWidths, true);
  assert.equal(nav.summary.moreMenuClosesReliably, true);
  assert.equal(nav.summary.moreMenuSearchWorks, true);
  assert.equal(nav.summary.mobileNavFullScreenOrNearFullScreen, true);
  assert.equal(nav.summary.mobileNavSearchAtTop, true);
  assert.equal(nav.summary.noAdsInNavigation, true);
  assert.match(moreMenu, /aria-expanded=\{isOpen\}/);
  assert.match(componentsCss, /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/);
  assert.match(componentsCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
  assert.match(mobileNav, /className="mobile-nav-toggle"/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*max-width:\s*none/);
  assert.doesNotMatch(siteNav, /label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/);
  assert.doesNotMatch(forbiddenSurfaces, /AdSlot|AdRail|data-ad-placeholder|Advertisement|affiliate/i);
});

test("Round 4U keeps static export, media boundaries, route boundaries, and download limits intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const packageJson = await readJson("package.json");
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
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), ["next", "react", "react-dom"]);
  assert.match(imageCard, /Download PNG/);
  assert.match(imageCard, /Print/);
  assert.doesNotMatch(sourceText, /Download SVG|SVG download|Download JPG|Download JPEG|Download WebP|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/i);
  assert.doesNotMatch(sourceText, /application\/ld\+json|ImageObject|BreadcrumbList|FAQPage|image-sitemap|opengraph-image/i);
  assert.doesNotMatch(sourceText, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
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
