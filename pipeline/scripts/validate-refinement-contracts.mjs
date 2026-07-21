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

assert.match(css, /\.hub-preview-card-media\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/s, "hub artwork frames must remain portrait-first");
assert.match(css, /\.gallery-item-media\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s, "printable gallery frames must avoid wide empty wells");
assert.match(css, /\.global-search-dialog\s*\{[^}]*max-height:\s*calc\(100dvh/s, "mobile search must remain viewport-bounded");
assert.match(css, /\.header-disclosure-panel\s*\{[^}]*max-height:\s*calc\(100dvh/s, "dropdowns must remain viewport-bounded");
assert.match(search, /className="global-search-close"/, "search requires an explicit close control");
assert.doesNotMatch(search, /global-search-footer[\s\S]{0,300}>\s*Close\s*</, "search must not reserve a detached close action at the bottom");
assert.match(header, /function handleKeyDown\(event: KeyboardEvent\)/, "desktop disclosures must handle Escape");
assert.match(header, /trigger\?\.focus\(\)/, "desktop disclosures must restore trigger focus");
assert.match(header, /aria-expanded=\{isOpen\}/, "desktop disclosures must expose their state");
assert.match(printable, /assetSources\.principalPreview\.width/, "printable preview dimensions must be driven by verified asset metadata");
assert.match(printable, /assetSources\.principalPreview\.height/, "printable preview dimensions must be driven by verified asset metadata");

const home = path.join(root, "out", "index.html");
if (existsSync(home)) {
  const html = read("out/index.html");
  assert.doesNotMatch(html, /data-ad-slot/, "production export must not emit ad slots while advertising is OFF");
}

process.stdout.write("Refinement contract checks passed.\n");
