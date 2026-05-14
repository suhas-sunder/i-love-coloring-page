import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();

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

const REQUIRED_JSON = [
  "pipeline/manifests/round-4v-project-context-check.json",
  "pipeline/manifests/round-4v-ad-layout-acceptance.json",
  "pipeline/manifests/round-4v-nav-acceptance.json",
  "pipeline/manifests/round-4v-gallery-acceptance.json",
  "pipeline/manifests/round-4v-fix-log.json",
  "pipeline/manifests/round-4v-browser-screenshot-results.json",
  "pipeline/manifests/round-4v-owner-acceptance-gate.json",
];

const REQUIRED_REPORTS = [
  "pipeline/reports/round-4v-project-context-check.md",
  "pipeline/reports/round-4v-ad-layout-acceptance.md",
  "pipeline/reports/round-4v-nav-acceptance.md",
  "pipeline/reports/round-4v-gallery-acceptance.md",
  "pipeline/reports/round-4v-fix-log.md",
  "pipeline/reports/round-4v-browser-screenshot-report.md",
  "pipeline/reports/round-4v-owner-acceptance-gate.md",
  "pipeline/reports/round-4v-next-phase-plan.md",
];

test("Round 4V JSON manifests and acceptance reports parse", async () => {
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

  const context = await readJson("pipeline/manifests/round-4v-project-context-check.json");
  assert.equal(context.summary.correctRepo, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4uCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.equal(context.summary.adWellsVisibleByDefault, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.visibleSvgDownloadOptions, false);
});

test("Round 4V owner acceptance gate passes only with browser evidence", async () => {
  const gate = await readJson("pipeline/manifests/round-4v-owner-acceptance-gate.json");
  const screenshots = await readJson("pipeline/manifests/round-4v-browser-screenshot-results.json");
  const ad = await readJson("pipeline/manifests/round-4v-ad-layout-acceptance.json");
  const nav = await readJson("pipeline/manifests/round-4v-nav-acceptance.json");
  const gallery = await readJson("pipeline/manifests/round-4v-gallery-acceptance.json");
  const fixes = await readJson("pipeline/manifests/round-4v-fix-log.json");

  assert.equal(gate.summary.accepted_for_seo_round, true);
  assert.deepEqual(gate.summary.blockers, []);
  assert.equal(gate.summary.adDensityMatchesRound4UPolicy, true);
  assert.equal(gate.summary.navAcceptable, true);
  assert.equal(gate.summary.mobileAcceptable, true);
  assert.equal(gate.summary.noHorizontalScrollbarRemains, true);
  assert.equal(gate.summary.realMediaRenders, true);
  assert.equal(gate.summary.pngOnlyDownloadsStable, true);
  assert.equal(gate.summary.seoContentWorkCanStartNext, true);
  assert.equal(fixes.summary.fixCount, 1);
  assert.equal(fixes.summary.clearVisibleBugsFound, true);
  assert.equal(fixes.summary.productionCodeChanged, true);
  assert.match(fixes.fixes[0].fix, /print/i);

  assert.equal(screenshots.status, "passed");
  assert.equal(screenshots.summary.screenshotsCreated, true);
  assert.ok(screenshots.screenshots.length >= 9);
  assert.deepEqual(screenshots.summary.widthsWithHorizontalScrollbar, []);
  assert.equal(screenshots.summary.noHorizontalOverflow, true);
  assert.equal(screenshots.summary.printWorks, true);
  assert.equal(screenshots.summary.downloadPngWorks, true);
  assert.equal(screenshots.summary.noSvgDownloadAppears, true);
  assert.equal(screenshots.summary.noJpegWebpDownloadAppears, true);
  assert.equal(screenshots.summary.ownerSensitiveIssuesAccepted, true);

  assert.equal(ad.summary.accepted, true);
  assert.equal(nav.summary.accepted, true);
  assert.equal(gallery.summary.accepted, true);
});

test("visible ad counts match Round 4U policy across accepted viewports", async () => {
  const ad = await readJson("pipeline/manifests/round-4v-ad-layout-acceptance.json");
  const screenshots = await readJson("pipeline/manifests/round-4v-browser-screenshot-results.json");

  assert.deepEqual(ad.summary.visibleCountsByWidth, EXPECTED_COUNTS);
  assert.deepEqual(screenshots.summary.visibleCountsByWidth, EXPECTED_COUNTS);
  assert.equal(ad.summary.mobileVisibleAdCount, 1);
  assert.equal(ad.summary.tabletVisibleAdCount, 1);
  assert.equal(ad.summary.desktopVisibleAdCount, 1);
  assert.equal(ad.summary.wideDesktopVisibleAdCount, 3);
  assert.equal(ad.summary.noLiveAdCode, true);
  assert.equal(ad.summary.noAdScripts, true);
  assert.equal(ad.summary.noAdClientPublisherIds, true);
  assert.equal(ad.summary.noForbiddenAdPlacements, true);
  assert.equal(ad.summary.noAdNearPrintDownloadControls, true);
  assert.equal(ad.summary.noAdOverlap, true);
  assert.equal(ad.summary.noHorizontalOverflow, true);

  for (const [width, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
    assert.equal(screenshots.summary.visibleCountsByWidth[width], expectedCount, width);
  }

  for (const screenshot of screenshots.screenshots) {
    assert.equal(typeof screenshot.path, "string");
    assert.equal(screenshot.committed, false);
    if (screenshot.expectedAdvertisementLabelCount != null) {
      assert.equal(
        screenshot.visibleAdvertisementLabelCount,
        screenshot.expectedAdvertisementLabelCount,
        screenshot.path,
      );
    }
  }
});

test("navigation and gallery acceptance cover the owner-sensitive flows", async () => {
  const nav = await readJson("pipeline/manifests/round-4v-nav-acceptance.json");
  const gallery = await readJson("pipeline/manifests/round-4v-gallery-acceptance.json");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const componentsCss = await readText("src/styles/components.css");

  assert.equal(nav.desktopMoreMenu.opens, true);
  assert.equal(nav.desktopMoreMenu.closesOnButton, true);
  assert.equal(nav.desktopMoreMenu.closesOnEscape, true);
  assert.equal(nav.desktopMoreMenu.closesOnOutsideClick, true);
  assert.equal(nav.desktopMoreMenu.closesOnLinkClick, true);
  assert.equal(nav.desktopMoreMenu.searchWorks, true);
  assert.equal(nav.desktopMoreMenu.usesAvailableWidthProperly, true);
  assert.equal(nav.desktopMoreMenu.noAdsInMenu, true);
  assert.equal(nav.desktopMoreMenu.noViewportOverflow, true);
  assert.equal(nav.summary.noTopLevelColoringPagesButton, true);

  assert.equal(nav.mobileNav.hamburgerOpens, true);
  assert.equal(nav.mobileNav.hamburgerCloses, true);
  assert.equal(nav.mobileNav.burgerIconHasNoVisibleBorder, true);
  assert.equal(nav.mobileNav.searchAtTop, true);
  assert.equal(nav.mobileNav.linksWork, true);
  assert.equal(nav.mobileNav.closesOnLinkSelection, true);
  assert.equal(nav.mobileNav.noAwkwardSideGutter, true);
  assert.equal(nav.mobileNav.noHorizontalOverflow, true);
  assert.equal(nav.mobileNav.noAdsInMobileNav, true);

  assert.match(moreMenu, /aria-expanded=\{isOpen\}/);
  assert.match(componentsCss, /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/);
  assert.match(componentsCss, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(180px,\s*1fr\)\)/);
  assert.match(mobileNav, /className="mobile-nav-toggle"/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*width:\s*100vw/);
  assert.match(componentsCss, /\.mobile-nav-panel\s*{[\s\S]*max-width:\s*none/);
  assert.doesNotMatch(siteNav, /label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/);

  assert.deepEqual(gallery.pagesInspected, [
    "/",
    "/coloring-pages",
    "/coloring-pages/animals",
    "/coloring-pages/geometric",
    "/coloring-pages/anime-girls",
    "/coloring-pages/mandalas",
    "/coloring-pages/chibi",
    "/coloring-pages/fantasy",
    "/coloring-pages/christmas",
    "/coloring-pages/halloween",
    "/coloring-pages/plushies",
  ]);
  assert.equal(gallery.summary.realImagesRender, true);
  assert.equal(gallery.summary.noBrokenImageIcons, true);
  assert.equal(gallery.summary.noBrokenAltTextPlaceholders, true);
  assert.equal(gallery.summary.hubSearchFilterWorks, true);
  assert.equal(gallery.summary.imageClickAnchorsWork, true);
  assert.equal(gallery.summary.printVisible, true);
  assert.equal(gallery.summary.printWorks, true);
  assert.equal(gallery.summary.downloadPngVisible, true);
  assert.equal(gallery.summary.downloadPngWorks, true);
  assert.equal(gallery.summary.noDownloadSvgExists, true);
  assert.equal(gallery.summary.noJpegWebpOptionsAppear, true);
  assert.equal(gallery.summary.mobileGalleryDoesNotOverflow, true);
});

test("Round 4V keeps route, media, source, and download boundaries intact", async () => {
  const nextConfig = await readText("next.config.mjs");
  const imageCard = await readText("src/components/coloring/ImageCard.tsx");
  const appFiles = await listFilesIfExists(path.join(REPO_ROOT, "app"));
  const publicFiles = await listFilesIfExists(path.join(REPO_ROOT, "public"));
  const forbiddenSurfaces = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MoreHubMenu.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
  ]);
  const publicSource = await readProjectText(["app", "src/components", "src/lib"]);
  const trackedR2UploadMedia = await gitLsFiles("pipeline/r2-upload");
  const statusImages = await gitStatusFor("images");
  const statusIlovesvg = await gitStatusFor("ilovesvg");
  const statusProductionFull = await gitStatusFor("pipeline/production/full");
  const renameStatus = await gitStatus();

  assert.match(nextConfig, /output:\s*"export"/);
  assert.equal(appFiles.some((file) => normalizePath(file).includes("/api/")), false);
  assert.equal(publicFiles.some((file) => /(?:^|[\\/])(?:svg|png|thumbs|coloring-pages)[\\/]/i.test(file)), false);
  assert.match(imageCard, /Print/);
  assert.match(imageCard, /Download PNG/);
  assert.doesNotMatch(imageCard, /Download SVG|Download JPG|Download JPEG|Download WebP|assetUrls\.svg|pngUrl\s*\|\|\s*svgUrl/i);
  assert.doesNotMatch(publicSource, /application\/ld\+json|ImageObject|BreadcrumbList|FAQPage|opengraph-image/i);
  assert.doesNotMatch(publicSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
  assert.doesNotMatch(forbiddenSurfaces, /AdSlot|AdRail|data-ad-placeholder|Advertisement|affiliate/i);
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
        if (normalizePath(file).startsWith("src/generated/coloring/hubs.json")) continue;
        if (normalizePath(file).startsWith("src/generated/coloring/search-index.json")) continue;
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
