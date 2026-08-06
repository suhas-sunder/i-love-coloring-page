import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const LEGACY_SLOT_IDS = [
  "rail-left-desktop",
  "rail-right-desktop",
  "home-header-banner",
  "home-after-hero",
  "home-lower-content",
  "coloring-pages-header-banner",
  "coloring-pages-after-featured",
  "coloring-pages-lower-content",
  "hub-header-banner",
  "hub-after-gallery",
  "hub-lower-content",
];

test("advertisement placement is centralized and preserves every frozen identifier", async () => {
  const config = await readText("src/lib/ads/config.ts");
  const types = await readText("src/lib/ads/types.ts");
  for (const id of LEGACY_SLOT_IDS) {
    assert.match(config, new RegExp(`"${id}"`), id);
    assert.match(types, new RegExp(`\\| "${id}"`), id);
  }
  for (const field of ["supportedPageFamilies", "eligibility", "reservedSize", "minimumSpacing", "sideRailsAllowed", "suppressedOnPaginatedPages"]) {
    assert.match(types, new RegExp(`${field}:`), field);
  }
  assert.match(config, /export const AD_PAGE_LAYOUTS/);
  assert.match(config, /home: fullLayout/);
  assert.match(config, /gallery: fullLayout/);
  assert.match(config, /hub: fullLayout/);
  assert.match(config, /printable: fullLayout/);
  assert.match(config, /"hub-pagination": condensedLayout/);
  assert.match(config, /trust: \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
  assert.match(config, /"html-sitemap": \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
  assert.match(config, /"not-found": \{ mode: "none"/);

  const pages = await readProjectText(["app/page.tsx", "app/coloring-pages/page.tsx", "src/components/coloring/HubPageContent.tsx", "src/components/coloring/PrintableDetailPage.tsx"]);
  assert.doesNotMatch(pages, new RegExp(LEGACY_SLOT_IDS.join("|")));

  for (const value of [
    "pub-4810616735714570",
    "ca-pub-4810616735714570",
    "5574432869",
    "5115981872",
    "9929324856",
    "2489818539",
    "5382861174",
  ]) assert.match(config, new RegExp(value));
  assert.match(config, /ADS_TXT_RECORD = "google\.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0"/);
});

test("manual advertisement geometry uses fixed header sizes and measured ultra-wide rails", async () => {
  const config = await readText("src/lib/ads/config.ts");
  const layout = await readText("src/lib/ads/layout.ts");
  const css = await readText("src/styles/components.css");
  const baseCss = await readText("src/styles/base.css");
  assert.match(config, /mobileMaxWidth: 640/);
  assert.match(config, /tabletMaxWidth: 1023/);
  assert.match(config, /desktopMinWidth: 1024/);
  assert.match(config, /sideRailsMinWidth: AD_RAIL_LAYOUT\.minViewportWidth/);
  assert.match(layout, /minViewportWidth: 2400/);
  assert.match(layout, /width: 300/);
  assert.match(layout, /height: 600/);
  assert.match(layout, /contentGap: 24/);
  assert.match(layout, /outerPadding: 16/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 1023px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /\.ad-slot-top-banner \{[\s\S]*width: min\(300px, calc\(100vw - 16px\)\)[\s\S]*height: 50px[\s\S]*max-height: 50px/);
  assert.match(css, /@media \(min-width: 360px\)[\s\S]*\.ad-slot-top-banner \{[\s\S]*width: 320px/);
  assert.match(css, /@media \(min-width: 641px\)[\s\S]*\.ad-slot-top-banner \{[\s\S]*width: 468px[\s\S]*height: 60px/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.ad-slot-top-banner \{[\s\S]*width: 728px[\s\S]*height: 90px/);
  assert.equal((css.match(/@media \(min-width: 2400px\)/g) || []).length, 1);
  assert.match(css, /\.ad-rail \{[\s\S]*display: none/);
  assert.match(css, /@media \(min-width: 2400px\)[\s\S]*data-ad-rails-eligible="true"[\s\S]*\.ad-rail \{[\s\S]*display: block/);
  assert.match(css, /\.ad-rail-left[\s\S]*left: calc\(-1 \* \(var\(--ad-rail-width\) \+ var\(--ad-rail-gap\)\)\)/);
  assert.match(css, /\.ad-rail-right[\s\S]*right: calc\(-1 \* \(var\(--ad-rail-width\) \+ var\(--ad-rail-gap\)\)\)/);
  assert.match(css, /\.ad-rail \{[\s\S]*position: absolute[\s\S]*top: 112px[\s\S]*height: 600px/);
  assert.doesNotMatch(css, /\.ad-rail[\s\S]{0,300}position: (?:fixed|sticky)/);
  assert.doesNotMatch(css, /\.ad-slot-(?:top-banner|post-header-banner|related-banner)[\s\S]{0,200}position: (?:fixed|sticky)/);
  assert.doesNotMatch(css, /\.public-page-shell \.ad-slot-(?:post-header-banner|supporting-square|related-banner)[\s\S]{0,300}display: none/);
  assert.doesNotMatch(css, /data-ad-layout="full"[^}]+ad-slot-top-banner[^}]+display: none/);
  assert.doesNotMatch(baseCss, /html\s*\{[^}]*min-width:\s*320px/);
});

test("page-family density rules and exceptions are explicit", async () => {
  const config = await readText("src/lib/ads/config.ts");
  const routes = await readProjectText([
    "app/page.tsx",
    "app/coloring-pages/page.tsx",
    "src/components/coloring/HubPageContent.tsx",
    "src/components/coloring/PrintableDetailPage.tsx",
  ]);
  assert.match(config, /function fullLayout[\s\S]*"left-rail": "rail-left-desktop"[\s\S]*"right-rail": "rail-right-desktop"/);
  for (const family of ["home", "gallery", "hub", "printable"]) {
    const pageLayout = extractLayout(config, family, family === "home" ? "gallery" : family === "gallery" ? "gallery-pagination" : family === "hub" ? "hub-pagination" : "trust");
    for (const placement of ["top-banner", "post-header-banner", "supporting-square", "related-banner"]) {
      assert.match(pageLayout, new RegExp(`"${placement}"`), `${family} ${placement}`);
    }
  }
  assert.equal((routes.match(/placement="supporting-square"/g) || []).length, 4);
  assert.match(config, /"hub-pagination": condensedLayout\(\{[\s\S]*"related-banner": "hub-after-gallery"/);
  assert.doesNotMatch(extractLayout(config, "hub-pagination", "printable"), /supporting-square|left-rail|right-rail/);
  assert.match(extractLayout(config, "trust", "html-sitemap"), /mode: "none"[\s\S]*slots: \{\}/);
  assert.match(extractLayout(config, "html-sitemap", "not-found"), /mode: "none"[\s\S]*slots: \{\}/);
  assert.match(config, /"not-found": \{ mode: "none", sideRailsAllowed: false, slots: \{\} \}/);
});

test("advertisements remain outside navigation, cards, controls, grids, and dialogs", async () => {
  const forbidden = await readProjectText([
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/site/GlobalSearchDialog.tsx",
    "src/components/site/SiteInteractionProvider.tsx",
    "src/components/coloring/ImageCard.tsx",
    "src/components/coloring/GalleryGrid.tsx",
    "src/components/coloring/GallerySearch.tsx",
    "src/components/coloring/GalleryFilters.tsx",
    "src/components/coloring/PrintablePreviewDialog.tsx",
    "src/components/coloring/PrintableDetailActions.tsx",
  ]);
  assert.doesNotMatch(forbidden, /PageAdSlot|<AdSlot|<AdRail|data-ad-fallback|>Advertisement</);

  const script = await readText("src/components/ads/AdSenseScript.tsx");
  const runtime = await readText("src/components/ads/AdSenseRuntime.tsx");
  const coordinator = await readText("src/lib/ads/pageCoordinator.ts");
  const creativeEvidence = await readText("src/lib/ads/creativeEvidence.ts");
  const eligibility = await readText("src/lib/ads/eligibility.ts");
  const shell = await readText("src/components/site/PublicPageShell.tsx");
  assert.match(script, /hasValidAdSenseConfiguration/);
  assert.match(script, /<AdSenseRuntime/);
  assert.equal((`${script}\n${runtime}`.match(/id = "adsense-runtime"|SCRIPT_ID = "adsense-runtime"/g) || []).length, 1);
  assert.match(runtime, /new IntersectionObserver/);
  assert.equal((runtime.match(/new MutationObserver/g) || []).length, 2);
  assert.equal((runtime.match(/new ResizeObserver/g) || []).length, 1);
  assert.match(runtime, /attributeFilter: \["data-ad-status"\]/);
  assert.doesNotMatch(runtime, /data-adsbygoogle-status/);
  assert.match(runtime, /if \(unit\.isConnected\) continue/);
  assert.match(runtime, /isActuallyVisible/);
  assert.match(runtime, /hasVisibleAdSenseOwnedSurface/);
  assert.match(creativeEvidence, /googleads\.g\.doubleclick\.net|doubleclick\.net/);
  assert.match(runtime, /unit\.dataset\.adInitialized === "true"/);
  assert.match(runtime, /window\.adsbygoogle[\s\S]*\.push\(\{\}\)/);
  assert.match(coordinator, /"pending" \| "fallback" \| "adsense-present"/);
  assert.match(coordinator, /AD_FALLBACK_TIMEOUT_MS = 13_000/);
  assert.match(coordinator, /AD_SCRIPT_AVAILABILITY_GRACE_MS = 4_000/);
  assert.match(coordinator, /"filled" \| "unfilled" \| "unfill-optimized"/);
  assert.doesNotMatch(runtime, /querySelectorAll\([^\n]+not\(\[data-initialized\]\)[\s\S]+forEach[\s\S]+push/);
  for (const field of ["configurationValid", "actuallyVisible", "nearViewport", "alreadyInitialized"]) {
    assert.match(eligibility, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(eligibility, /liveAdvertisingEnabled|regionalRequirementsSatisfied/);
  assert.match(eligibility, /supportedPageFamilies\.includes/);
  assert.match(eligibility, /sideRailsMinWidth/);
  assert.match(shell, /<PageAdSlot pageFamily=\{pageFamily\} placement="top-banner" \/>[\s\S]*\{layout\.sideRailsAllowed/);
  assert.match(shell, /data-ad-layout-version=\{layout\.mode === "full" \? "manual-six-v2" : undefined\}/);

  const project = await readTreeText(["app", "src"]);
  const legacyModeVariable = ["NEXT", "PUBLIC", "AD", "MODE"].join("_");
  const legacyRegionalVariable = ["NEXT", "PUBLIC", "AD", "REGIONAL", "REQUIREMENTS", "SATISFIED"].join("_");
  assert.equal(project.includes(legacyModeVariable), false);
  assert.equal(project.includes(legacyRegionalVariable), false);
  assert.doesNotMatch(project, /process\.env\.NODE_ENV|resolveAdMode|AdRuntimeEnvironment|ResolvedAdMode/);
});

test("fallback presentation is initially hidden, neutral, and noninteractive", async () => {
  const slot = await readText("src/components/ads/AdSlot.tsx");
  const rail = await readText("src/components/ads/AdRail.tsx");
  const css = await readText("src/styles/components.css");
  assert.match(slot, /<span className="ad-slot-label">Advertisement<\/span>/);
  assert.match(slot, /<span className="ad-slot-fallback-lines" aria-hidden="true">/);
  assert.doesNotMatch(slot, /tabIndex|tabindex|<a\b|<button\b|role="(?:button|link|navigation)"|<h[1-6]\b/);
  assert.match(slot, /aria-label="Advertisement"/);
  assert.match(slot, /role="complementary"/);
  assert.match(slot, /aria-hidden="true" data-ad-fallback="true" hidden/);
  assert.doesNotMatch(slot, /Development placeholder|Sponsored|Learn more|Shop now/i);
  assert.match(slot, /data-ad-format=\{isFixedHeader \? undefined : "auto"\}/);
  assert.match(slot, /data-full-width-responsive=\{isFixedHeader \? undefined : "true"\}/);
  assert.match(slot, /data-ad-size-policy=\{isFixedHeader \? "fixed-header-v1" : undefined\}/);
  assert.match(rail, /data-ad-rail=\{side\}/);
  assert.match(rail, /data-ad-rail-size="300x600"/);
  assert.match(rail, /<aside[^>]+aria-label=\{`\$\{side\} desktop advertising rail`\}/);
  assert.doesNotMatch(css, /\.ad-slot:focus-visible/);
  assert.doesNotMatch(css, /\.ad-slot[\s\S]{0,220}(?:gradient|box-shadow)/);
  assert.match(css, /\.adsbygoogle\[data-ad-status="filled"\] ~ \[data-ad-fallback\]/);
  assert.match(css, /\.adsbygoogle\[data-ad-status="unfill-optimized"\] ~ \[data-ad-fallback\]/);
  assert.match(css, /\[data-ad-page-state="adsense-present"\] \[data-ad-fallback\]/);
  assert.doesNotMatch(css, /\.ad-slot-fallback[\s\S]{0,180}position:\s*(?:fixed|sticky|absolute)/);
  assert.doesNotMatch(css, /\.ad-slot-fallback[\s\S]{0,260}(?:box-shadow|gradient|cursor:\s*pointer|transition)/);
});

function extractLayout(source, start, end) {
  const startIndex = source.indexOf(`  ${JSON.stringify(start)}:`) >= 0
    ? source.indexOf(`  ${JSON.stringify(start)}:`)
    : source.indexOf(`  ${start}:`);
  const endIndex = source.indexOf(`  ${JSON.stringify(end)}:`, startIndex) >= 0
    ? source.indexOf(`  ${JSON.stringify(end)}:`, startIndex)
    : source.indexOf(`  ${end}:`, startIndex);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `${start} layout`);
  return source.slice(startIndex, endIndex);
}

async function readText(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function readProjectText(relativePaths) {
  return (await Promise.all(relativePaths.map(readText))).join("\n");
}

async function readTreeText(relativeRoots) {
  const chunks = [];
  for (const relativeRoot of relativeRoots) {
    await walk(path.join(ROOT, relativeRoot));
  }
  return chunks.join("\n");

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (/\.(?:ts|tsx|js|jsx|css)$/.test(entry.name) && (await stat(absolute)).isFile()) {
        chunks.push(await readFile(absolute, "utf8"));
      }
    }
  }
}
