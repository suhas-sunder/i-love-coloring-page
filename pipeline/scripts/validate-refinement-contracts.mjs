#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const css = read("src/styles/components.css");
const search = read("src/components/site/GlobalSearchDialog.tsx");
const header = read("src/components/site/SiteHeader.tsx");
const printable = read("src/components/coloring/PrintableDetailPage.tsx");
const printableExperience = read("src/components/coloring/PrintableDetailExperience.tsx");

assert.match(css, /\.hub-preview-card-media\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/s, "hub artwork frames must remain portrait-first");
assert.match(css, /\.gallery-item-media\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s, "printable gallery frames must avoid wide empty wells");
assert.match(css, /\.global-search-dialog\s*\{[^}]*max-height:\s*calc\(100dvh/s, "mobile search must remain viewport-bounded");
assert.match(css, /\.header-disclosure-panel\s*\{[^}]*max-height:\s*calc\(100dvh/s, "dropdowns must remain viewport-bounded");
assert.match(css, /\.header-disclosure-seasonal \.header-disclosure-panel\s*\{[^}]*right:\s*max\(var\(--page-gutter\),\s*calc\(\(100vw\s*-\s*var\(--layout-max\)\)\s*\/\s*2\)\);[^}]*left:\s*auto;[^}]*transform:\s*none/s, "roomy desktop Seasonal disclosure must align to the header grid without viewport overflow");
assert.match(css, /@media \(max-width:\s*1100px\)[\s\S]*\.header-disclosure-seasonal \.header-disclosure-panel\s*\{[^}]*right:\s*auto;[^}]*left:\s*50%;[^}]*translateX\(-50%\)/s, "compact desktop Seasonal disclosure must use the viewport-centered fallback");
assert.match(search, /className="global-search-close"/, "search requires an explicit close control");
assert.doesNotMatch(search, /global-search-footer[\s\S]{0,300}>\s*Close\s*</, "search must not reserve a detached close action at the bottom");
assert.match(header, /function handleKeyDown\(event: KeyboardEvent\)/, "desktop disclosures must handle Escape");
assert.match(header, /trigger\?\.focus\(\)/, "desktop disclosures must restore trigger focus");
assert.match(header, /aria-expanded=\{isOpen\}/, "desktop disclosures must expose their state");
assert.match(printable, /artworkWidth=\{assetSources\.fullResolutionArtwork\.width\}/, "printable width must come from verified full-resolution asset metadata");
assert.match(printable, /artworkHeight=\{assetSources\.fullResolutionArtwork\.height\}/, "printable height must come from verified full-resolution asset metadata");
assert.match(printableExperience, /computePrintableLayout\(artworkWidth, artworkHeight, settings\)/, "printable preview must consume verified metadata through the central composition engine");

const home = path.join(root, "out", "index.html");
if (existsSync(home)) {
  const html = read("out/index.html");
  const logicalSlots = [...html.matchAll(/data-ad-slot="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((slotId) => !/^\d{10}$/.test(slotId));
  assert.equal(logicalSlots.length, 6, "production homepage must retain its six configured logical slots");
  assert.equal(new Set(logicalSlots).size, 6, "production homepage logical wrappers must remain unique");
  assert.match(html, /data-ad-layout-version="manual-six-v2"/, "full layouts must emit the manual six-position deployment marker");
  assert.match(html, /data-ad-size-policy="fixed-header-v1"/, "the production header must use fixed breakpoint dimensions");
  assert.match(html, /data-ad-fallback-policy="page-all-or-none-v1"/, "production export must emit the coordinated live-unit marker");
  assert.match(html, /data-ad-client="ca-pub-4810616735714570"/, "production units must use the centralized client ID");
  assert.match(html, /data-ad-fallback="true" hidden=""/, "status fallbacks must exist and start hidden");
  assert.doesNotMatch(html, /Development placeholder|data-ad-mode=/, "production export must not emit an advertising mode");

  for (const relativePath of ["out/privacy.html", "out/sitemap.html", "out/404.html"]) {
    assert.doesNotMatch(read(relativePath), /data-ad-fallback-policy=|data-ad-client=|data-ad-fallback=/, `${relativePath} must remain ad-free`);
  }
}

process.stdout.write("Refinement contract checks passed.\n");
