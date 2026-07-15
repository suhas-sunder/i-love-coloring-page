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
  assert.match(config, /trust: condensedLayout/);
  assert.match(config, /"html-sitemap": condensedLayout/);
  assert.match(config, /"not-found": \{ mode: "none"/);

  const pages = await readProjectText(["app/page.tsx", "app/coloring-pages/page.tsx", "src/components/coloring/HubPageContent.tsx", "src/components/coloring/PrintableDetailPage.tsx"]);
  assert.doesNotMatch(pages, new RegExp(LEGACY_SLOT_IDS.join("|")));
});

test("responsive advertisement behavior uses one safe rail threshold", async () => {
  const config = await readText("src/lib/ads/config.ts");
  const css = await readText("src/styles/components.css");
  const baseCss = await readText("src/styles/base.css");
  assert.match(config, /mobileMaxWidth: 640/);
  assert.match(config, /tabletMaxWidth: 1023/);
  assert.match(config, /desktopMinWidth: 1024/);
  assert.match(config, /sideRailsMinWidth: 1536/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 1023px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
  assert.match(css, /\.ad-slot-responsive-banner \{[\s\S]*width: min\(100%, 320px\)[\s\S]*min-height: 50px/);
  assert.match(css, /@media \(min-width: 641px\)[\s\S]*\.ad-slot-responsive-banner \{[\s\S]*width: min\(100%, 468px\)[\s\S]*min-height: 60px/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.ad-slot-responsive-banner \{[\s\S]*width: min\(100%, 728px\)[\s\S]*min-height: 90px/);
  assert.equal((css.match(/@media \(min-width: 1536px\)/g) || []).length, 1);
  assert.match(css, /\.ad-rail \{[\s\S]*display: none/);
  assert.match(css, /@media \(min-width: 1536px\)[\s\S]*\.ad-rail \{[\s\S]*display: block/);
  assert.match(css, /\.ad-rail-left[\s\S]*left: calc\(-1 \* \(var\(--ad-rail-width\) \+ var\(--ad-rail-gap\)\)\)/);
  assert.match(css, /\.ad-rail-right[\s\S]*right: calc\(-1 \* \(var\(--ad-rail-width\) \+ var\(--ad-rail-gap\)\)\)/);
  assert.doesNotMatch(css, /\.ad-rail[\s\S]{0,300}position: (?:fixed|sticky)/);
  assert.doesNotMatch(baseCss, /html\s*\{[^}]*min-width:\s*320px/);
});

test("page-family density rules and exceptions are explicit", async () => {
  const config = await readText("src/lib/ads/config.ts");
  assert.match(config, /function fullLayout[\s\S]*"left-rail": "rail-left-desktop"[\s\S]*"right-rail": "rail-right-desktop"/);
  assert.match(config, /"hub-pagination": condensedLayout\(\{[\s\S]*"related-banner": "hub-after-gallery"/);
  assert.doesNotMatch(extractLayout(config, "hub-pagination", "printable"), /supporting-square|left-rail|right-rail/);
  assert.doesNotMatch(extractLayout(config, "trust", "html-sitemap"), /supporting-square|left-rail|right-rail|related-banner/);
  assert.doesNotMatch(extractLayout(config, "html-sitemap", "not-found"), /supporting-square|left-rail|right-rail|related-banner/);
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
  assert.doesNotMatch(forbidden, /PageAdSlot|<AdSlot|<AdRail|data-ad-placeholder|>Advertisement</);

  const allSource = await readTreeText(["app", "src"]);
  assert.doesNotMatch(allSource, /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client|googletag/i);
});

test("placeholder presentation is visible but not interactive or heading content", async () => {
  const slot = await readText("src/components/ads/AdSlot.tsx");
  const rail = await readText("src/components/ads/AdRail.tsx");
  const css = await readText("src/styles/components.css");
  assert.match(slot, /<span className="ad-slot-label">Advertisement<\/span>/);
  assert.doesNotMatch(slot, /tabIndex|tabindex|<a\b|<button\b|role="(?:button|link|navigation)"|<h[1-6]\b/);
  assert.doesNotMatch(slot, /aria-label="Advertisement"/);
  assert.match(rail, /<aside[^>]+aria-label=\{`\$\{side\} desktop advertising rail`\}/);
  assert.doesNotMatch(css, /\.ad-slot:focus-visible/);
  assert.doesNotMatch(css, /\.ad-slot[\s\S]{0,220}(?:gradient|box-shadow)/);
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
