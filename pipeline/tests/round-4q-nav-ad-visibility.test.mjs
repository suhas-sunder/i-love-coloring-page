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

const ROUND4Q_MANIFESTS = [
  "pipeline/manifests/round-4q-project-context-check.json",
  "pipeline/manifests/round-4q-ad-placeholder-visibility-audit.json",
  "pipeline/manifests/round-4q-ad-placeholder-fixes.json",
  "pipeline/manifests/round-4q-ad-slot-inventory.json",
  "pipeline/manifests/round-4q-nav-behavior-results.json",
  "pipeline/manifests/round-4q-browser-qa-results.json",
  "pipeline/manifests/round-4q-ad-visibility-results.json",
  "pipeline/manifests/round-4q-mobile-nav-results.json",
  "pipeline/manifests/round-4q-more-menu-results.json",
];

const ROUND4Q_REPORTS = [
  "pipeline/reports/round-4q-project-context-check.md",
  "pipeline/reports/round-4q-ad-placeholder-visibility-audit.md",
  "pipeline/reports/round-4q-ad-placeholder-fixes.md",
  "pipeline/reports/round-4q-adsense-unit-guidance.md",
  "pipeline/reports/round-4q-nav-behavior-report.md",
  "pipeline/reports/round-4q-browser-qa-report.md",
  "pipeline/reports/round-4q-ad-visibility-report.md",
  "pipeline/reports/round-4q-mobile-nav-report.md",
  "pipeline/reports/round-4q-more-menu-report.md",
  "pipeline/reports/round-4q-next-phase-plan.md",
];

test("Round 4Q JSON manifests and reports parse and keep the requested project context", async () => {
  for (const relativePath of ROUND4Q_MANIFESTS) {
    const raw = await readText(relativePath);
    const parsed = JSON.parse(raw);
    assert.ok(parsed, relativePath);
    assert.doesNotMatch(raw, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  for (const relativePath of ROUND4Q_REPORTS) {
    const text = await readText(relativePath);
    assert.match(text, /Round 4Q/i, relativePath);
    assert.doesNotMatch(text, /client-\d+|ca-pub-|google_ad_client|adsbygoogle|[A-Za-z]:\\|ilovesvg\//i, relativePath);
  }

  const context = await readJson("pipeline/manifests/round-4q-project-context-check.json");
  assert.equal(context.summary.correctRepository, true);
  assert.equal(context.summary.branch, "version-4");
  assert.equal(context.summary.round4pCommitExists, true);
  assert.equal(context.summary.appApiRoutePresent, false);
  assert.equal(context.summary.staticExportConfigured, true);
  assert.equal(context.summary.r2BundleExists, true);
  assert.deepEqual(context.summary.currentPublicDownloadFormats, ["PNG"]);
  assert.equal(context.summary.visibleSvgDownloadOptions, false);
  assert.equal(context.summary.visibleJpegWebpOptions, false);
});

test("ad placeholders stay env gated, visibly labeled when enabled, and policy safe", async () => {
  const audit = await readJson("pipeline/manifests/round-4q-ad-placeholder-visibility-audit.json");
  const fixes = await readJson("pipeline/manifests/round-4q-ad-placeholder-fixes.json");
  const results = await readJson("pipeline/manifests/round-4q-ad-visibility-results.json");
  const inventory = await readJson("pipeline/manifests/round-4q-ad-slot-inventory.json");
  const slot = await readText("src/components/ads/AdSlot.tsx");
  const rail = await readText("src/components/ads/AdRail.tsx");
  const config = await readText("src/lib/ads/config.ts");
  const types = await readText("src/lib/ads/types.ts");
  const css = await readText("src/styles/components.css");
  const homePage = await readText("app/page.tsx");
  const galleryLanding = await readText("app/coloring-pages/page.tsx");
  const hubPage = await readText("src/components/coloring/HubPageContent.tsx");
  const guidance = await readText("pipeline/reports/round-4q-adsense-unit-guidance.md");
  const forbiddenSurfaces = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MoreHubMenu.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
  ]);

  assert.equal(audit.summary.hiddenByDefault, true);
  assert.equal(audit.summary.enabledByEnvFlag, "NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS=1");
  assert.equal(audit.summary.liveAdCodePresent, false);
  assert.equal(audit.summary.publisherOrClientIdsPresent, false);
  assert.equal(audit.summary.labelTextVisible, true);
  assert.equal(audit.summary.headerBannerSlotsConsistent, true);
  assert.equal(audit.summary.leftAndRightRailsConfigured, true);
  assert.equal(audit.summary.railSafeGapConfigured, true);
  assert.equal(audit.summary.sideRailsHiddenOnSmallScreens, true);
  assert.equal(fixes.summary.placementCountChanged, true);
  assert.equal(fixes.summary.liveAdCodeAdded, false);
  assert.equal(fixes.summary.headerBannerSlotsAdded, true);
  assert.equal(fixes.summary.leftAndRightRailsAdded, true);
  assert.equal(fixes.summary.placementChangeReason, "existing right-only rail and inconsistent page skeleton were not AdSense-safe enough for QA");
  assert.equal(results.summary.placeholdersVisibleWhenEnabled, true);
  assert.equal(results.summary.placeholdersHiddenWhenDisabled, true);
  assert.equal(results.summary.headerBannerVisibleWhenEnabled, true);
  assert.equal(results.summary.leftAndRightRailsVisibleOnWideDesktop, true);
  assert.equal(results.summary.sideRailsHiddenOnTabletAndMobile, true);
  assert.match(config, /process\.env\.NEXT_PUBLIC_SHOW_AD_PLACEHOLDERS/);
  assert.match(config, /showAdPlaceholdersValue === "1"/);
  assert.match(types, /home-header-banner/);
  assert.match(types, /coloring-pages-header-banner/);
  assert.match(types, /hub-header-banner/);
  assert.match(types, /rail-left-desktop/);
  assert.match(types, /rail-right-desktop/);
  assert.match(slot, /aria-label="Advertisement"/);
  assert.match(slot, /data-ad-placeholder="true"/);
  assert.match(slot, /data-ad-slot=\{slot\.slotId\}/);
  assert.match(rail, /side:\s*"left"\s*\|\s*"right"/);
  assert.match(rail, /ad-rail-left/);
  assert.match(rail, /ad-rail-right/);
  assert.match(homePage, /slotId="home-header-banner"/);
  assert.match(homePage, /slotId="rail-left-desktop"/);
  assert.match(homePage, /slotId="rail-right-desktop"/);
  assert.match(galleryLanding, /slotId="coloring-pages-header-banner"/);
  assert.match(galleryLanding, /slotId="rail-left-desktop"/);
  assert.match(galleryLanding, /slotId="rail-right-desktop"/);
  assert.match(hubPage, /slotId="hub-header-banner"/);
  assert.match(hubPage, /slotId="rail-left-desktop"/);
  assert.match(hubPage, /slotId="rail-right-desktop"/);
  assert.match(css, /\.ad-slot\[data-ad-placeholder="true"\]/);
  assert.match(css, /\.ad-slot-label[\s\S]*color:\s*var\(--color-plum\)/);
  assert.match(css, /\.ad-slot-header-banner/);
  assert.match(css, /--ad-rail-safe-gap:\s*var\(--space-48\)/);
  assert.match(css, /\.ad-rail-left/);
  assert.match(css, /\.ad-rail-right/);
  assert.match(css, /@media \(min-width:\s*1740px\)/);
  assert.match(css, /@media \(max-width:\s*1739px\)[\s\S]*\.ad-rail/);
  assert.match(css, /@media print[\s\S]*\.ad-slot/);
  assert.equal(inventory.summary.pageTypes.length, 3);
  assert.equal(inventory.summary.allSlotIdsUnique, true);
  assert.equal(inventory.summary.liveAdCodePresent, false);
  assert.deepEqual(inventory.summary.pageTypes.sort(), ["galleryLanding", "home", "hubPage"]);
  assert.equal(inventory.countsByPageType.home.mobile, 3);
  assert.equal(inventory.countsByPageType.galleryLanding.mobile, 3);
  assert.equal(inventory.countsByPageType.hubPage.mobile, 3);
  assert.equal(inventory.countsByPageType.home.wideDesktop, 5);
  assert.equal(inventory.countsByPageType.galleryLanding.wideDesktop, 5);
  assert.equal(inventory.countsByPageType.hubPage.wideDesktop, 5);
  assert.match(guidance, /ilcp-home-header-banner/);
  assert.match(guidance, /ilcp-coloring-pages-header-banner/);
  assert.match(guidance, /ilcp-hub-header-banner/);
  assert.match(guidance, /ilcp-rail-left-desktop/);
  assert.match(guidance, /ilcp-rail-right-desktop/);
  assert.doesNotMatch(forbiddenSurfaces, /AdSlot|AdRail|data-ad-placeholder|Advertisement/);
  assert.doesNotMatch(await readProjectText(["app", "src/components", "src/lib"]), /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i);
});

test("desktop More menu is a controlled, searchable, viewport-centered hub menu", async () => {
  const navResults = await readJson("pipeline/manifests/round-4q-nav-behavior-results.json");
  const moreResults = await readJson("pipeline/manifests/round-4q-more-menu-results.json");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const siteNav = await readText("src/lib/navigation/siteNav.ts");
  const css = await readText("src/styles/components.css");
  const routes = await readJson("src/generated/coloring/routes.json");
  const hubs = await readJson("src/generated/coloring/hubs.json");
  const routePaths = new Set(routes.routes.map((route) => route.path));

  assert.equal(navResults.summary.moreMenuControlledState, true);
  assert.equal(navResults.summary.moreMenuIncludesSearch, true);
  assert.equal(navResults.summary.topLevelColoringPagesRemoved, true);
  assert.deepEqual(navResults.missingPhase1HubRoutes, []);
  assert.deepEqual(navResults.brokenLinks, []);
  assert.deepEqual(navResults.phase2OrBacklogLinks, []);
  assert.deepEqual(navResults.sectionOnlyLinks, []);
  assert.equal(moreResults.summary.closesOnButton, true);
  assert.equal(moreResults.summary.closesOnEscape, true);
  assert.equal(moreResults.summary.closesOnOutsideClick, true);
  assert.equal(moreResults.summary.closesOnLinkClick, true);
  assert.equal(moreResults.summary.usesWideDesktopLayout, true);

  assert.match(moreMenu, /useState/);
  assert.match(moreMenu, /useRef/);
  assert.match(moreMenu, /useEffect/);
  assert.match(moreMenu, /aria-expanded=\{isOpen\}/);
  assert.match(moreMenu, /aria-controls=\{menuId\}/);
  assert.match(moreMenu, /event\.key === "Escape"/);
  assert.match(moreMenu, /pointerdown/);
  assert.match(moreMenu, /onNavigate/);
  assert.match(moreMenu, /type="search"/);
  assert.match(css, /width:\s*min\(1320px,\s*calc\(100vw - 96px\)\)/);
  assert.match(css, /width:\s*min\(960px,\s*calc\(100vw - 48px\)\)/);
  assert.match(css, /left:\s*50%/);
  assert.match(css, /transform:\s*translateX\(-50%\)/);
  assert.doesNotMatch(siteNav, /label:\s*"Coloring Pages"[\s\S]*group:\s*"primary"/);

  const backlogSlugs = new Set((hubs.backlogHubs || []).map((hub) => hub.slug));
  const sectionOnlySlugs = new Set((hubs.sectionOnlyTopics || []).map((topic) => topic.slug));
  for (const link of navResults.moreMenuHubLinks) {
    const pathOnly = link.href.split("#")[0];
    assert.ok(routePaths.has(pathOnly), link.href);
    assert.equal(backlogSlugs.has(link.slug), false, link.slug);
    assert.equal(sectionOnlySlugs.has(link.slug), false, link.slug);
  }
});

test("mobile navigation uses a proper hamburger panel with search-first hub navigation", async () => {
  const navResults = await readJson("pipeline/manifests/round-4q-nav-behavior-results.json");
  const mobileResults = await readJson("pipeline/manifests/round-4q-mobile-nav-results.json");
  const header = await readText("src/components/site/SiteHeader.tsx");
  const mobileNav = await readText("src/components/site/MobileNav.tsx");
  const moreMenu = await readText("src/components/site/MoreHubMenu.tsx");
  const css = await readText("src/styles/components.css");

  assert.equal(navResults.summary.mobileHamburgerImplemented, true);
  assert.equal(navResults.summary.mobileSearchFirst, true);
  assert.equal(mobileResults.summary.hamburgerButtonImplemented, true);
  assert.equal(mobileResults.summary.searchAtTop, true);
  assert.equal(mobileResults.summary.closesOnButton, true);
  assert.equal(mobileResults.summary.closesOnEscape, true);
  assert.equal(mobileResults.summary.closesOnOutsideClick, true);
  assert.equal(mobileResults.summary.closesOnLinkClick, true);
  assert.equal(mobileResults.summary.noAdsInMobileNav, true);

  assert.match(header, /MobileNav/);
  assert.match(mobileNav, /"use client"/);
  assert.match(mobileNav, /aria-label=\{isOpen \? "Close navigation menu" : "Open navigation menu"\}/);
  assert.match(mobileNav, /aria-expanded=\{isOpen\}/);
  assert.match(mobileNav, /aria-controls=\{panelId\}/);
  assert.match(mobileNav, /className="mobile-nav-toggle"/);
  assert.match(mobileNav, /event\.key === "Escape"/);
  assert.match(mobileNav, /pointerdown/);
  assert.match(mobileNav, /<button/);
  assert.match(mobileNav, /<Link/);
  assert.match(moreMenu, /Search mobile hub pages/);
  assert.ok(mobileNav.indexOf("<MoreHubMenu") < mobileNav.indexOf("mobile-nav-links"), "mobile search should render before the link groups");
  assert.match(css, /\.mobile-nav-toggle\s*{[\s\S]*border:\s*0/);
  assert.match(css, /\.mobile-nav-toggle\s*{[\s\S]*cursor:\s*pointer/);
  assert.doesNotMatch(`${header}\n${mobileNav}\n${moreMenu}`, /AdSlot|AdRail|data-ad-placeholder|Advertisement|affiliate/i);
});

test("Round 4Q keeps static export, media boundaries, route boundaries, and download limits intact", async () => {
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

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
