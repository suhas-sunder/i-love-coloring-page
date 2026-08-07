import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("public viewport policy preserves user zoom and avoids browser-sniffing branches", () => {
  const html = source("out/index.html");
  const viewport = html.match(/<meta[^>]+name="viewport"[^>]+content="([^"]+)"/i)?.[1] || "";
  assert.match(viewport, /width=device-width/i);
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0+)?/i);

  const activeSource = readTree(["app", "src"], [".ts", ".tsx", ".css"]).join("\n");
  assert.doesNotMatch(activeSource, /navigator\.(?:userAgent|userAgentData)|document\.documentMode/);
  assert.doesNotMatch(activeSource, /(?:^|[\s{;])zoom\s*:\s*(?:0|1)(?:[;\s}]|$)/m);
});

test("mobile navigation exits modal state when the desktop layout becomes active", () => {
  const mobileNav = source("src/components/site/MobileNav.tsx");
  assert.match(mobileNav, /window\.matchMedia\("\(min-width: 900px\)"\)/);
  assert.match(mobileNav, /desktopNavigation\.addEventListener\("change", closeForDesktopLayout\)/);
  assert.match(mobileNav, /closeModal\(surface\)/);
  assert.match(mobileNav, /restoreFocusAfterModalClose\(document\.querySelector<HTMLElement>\("\.brand"\)\)/);
  assert.match(mobileNav, /desktopNavigation\.removeEventListener\("change", closeForDesktopLayout\)/);
});

test("keyboard focus remains visible in normal and forced-color presentations", () => {
  const css = allCss();
  assert.match(css, /:where\(a, button, input, select, textarea, \[tabindex\]\):focus-visible/);
  assert.match(css, /outline:\s*var\(--focus-ring-width\) solid var\(--color-focus\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.site-nav-link:focus-visible,[\s\S]*?outline:\s*var\(--focus-ring-width\) solid var\(--color-focus\)/);
  for (const selector of [
    ".site-nav-link:focus-visible",
    ".hero-related-link:focus-visible",
    ".hub-link:focus-visible",
    ".related-link:focus-visible",
  ]) {
    assert.ok(css.includes(selector), `${selector} must retain a forced-colors focus outline`);
  }
  assert.match(css, /outline:\s*var\(--focus-ring-width\) solid CanvasText/);
  assert.match(css, /\.trust-section a\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /\.item-title\s*\{[\s\S]*?min-width:\s*0[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /\.item-title-link\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});

test("reduced motion and non-hover input contracts remain explicit", () => {
  const css = allCss();
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration:\s*0\.01ms !important/);
  assert.match(css, /\.disclosure-chevron\s*\{[\s\S]*?transition:\s*none !important/);
  assert.doesNotMatch(css, /@media\s*\([^)]*(?:hover:\s*hover|pointer:\s*fine)[^)]*\)[\s\S]*?display:\s*(?:block|flex|grid)/i);

  const card = source("src/components/coloring/ImageCard.tsx");
  assert.match(card, /<Link className="gallery-item-media-link"/);
  assert.match(card, /<PrintableCardActions item=\{item\}/);
  const mediaLinkStart = card.indexOf('<Link className="gallery-item-media-link"');
  const mediaLinkEnd = card.indexOf("</Link>", mediaLinkStart);
  const printAction = card.indexOf("<PrintableCardActions", mediaLinkStart);
  assert.ok(mediaLinkStart >= 0 && mediaLinkEnd > mediaLinkStart && printAction > mediaLinkEnd, "Card Print must remain outside the canonical media link");
});

test("browser page printing excludes application chrome, controls, ads, and modal overlays", () => {
  const css = source("src/styles/components.css");
  const printIndex = css.lastIndexOf("@media print");
  assert.ok(printIndex >= 0);
  const printCss = css.slice(printIndex);
  for (const selector of [
    ".site-header",
    ".site-footer",
    ".ad-slot",
    ".ad-rail",
    ".mobile-nav-overlay",
    ".global-search-overlay",
    ".print-preview-overlay",
    ".printable-action-panel",
    "button",
    ".button",
  ]) {
    assert.ok(printCss.includes(selector), `${selector} must be excluded from page printing`);
  }
  assert.match(printCss, /\.printable-main\s*\{\s*grid-template-columns:\s*1fr/);
});

test("representative static pages retain semantic and reflow prerequisites", () => {
  const outputs = [
    "out/index.html",
    "out/coloring-pages.html",
    "out/coloring-pages/animals.html",
    "out/coloring-pages/christmas.html",
    "out/coloring-pages/lotus.html",
    "out/coloring-pages/animals/page/16.html",
    "out/coloring-pages/plushies/page/36.html",
    "out/printables/animals/animals-alligator-4feec8505a.html",
    "out/privacy.html",
    "out/terms.html",
    "out/sitemap.html",
    "out/404.html",
  ];
  for (const output of outputs) {
    const html = source(output);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal((html.match(/<main\b/g) || []).length, 1, output);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, output);
    assert.equal(ids.length, new Set(ids).size, `${output}: duplicate IDs`);
    assert.doesNotMatch(html, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/i, `${output}: nested interactive control`);
    for (const image of html.match(/<img\b[^>]*>/g) || []) assert.match(image, /\salt="[^"]*"/, output);
  }

  const css = source("src/styles/components.css");
  assert.match(css, /\.breadcrumb\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.pagination\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.related-list\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("dialog, disclosure, status, and accessible-name ownership remains native and bounded", () => {
  const files = [
    "src/components/site/SiteHeader.tsx",
    "src/components/site/MobileNav.tsx",
    "src/components/site/GlobalSearchDialog.tsx",
    "src/components/coloring/GalleryFilters.tsx",
    "src/components/coloring/PrintableDetailActions.tsx",
    "src/components/coloring/PrintablePreviewDialog.tsx",
    "src/components/coloring/DownloadMenu.tsx",
  ].map(source).join("\n");
  assert.doesNotMatch(files, /role="menu"|role="menuitem"/);
  assert.match(files, /aria-expanded=/);
  assert.match(files, /aria-controls=/);
  assert.match(files, /role="dialog" aria-modal="true" aria-labelledby=/);
  assert.match(files, /role="status" aria-live="polite"/);
  assert.match(files, /aria-describedby=/);
  assert.match(files, /aria-label=\{`Download \$\{option\.label\} for \$\{title\}`\}/);

  const searchDialog = source("src/components/site/GlobalSearchDialog.tsx");
  assert.match(searchDialog, /useModalDialog\(\{ open: open && mounted,/);

  const modalHook = source("src/hooks/useModalDialog.ts");
  assert.match(modalHook, /event\.key === "Escape"/);
  assert.match(modalHook, /event\.key !== "Tab"/);
  assert.match(modalHook, /getClientRects\(\)\.length > 0/);
  assert.match(modalHook, /element\.closest\("\[inert\]"\)/);
});

test("cross-browser QA runner is deterministic, local, and blocks advertising requests", () => {
  const runner = source("pipeline/scripts/cross-browser-accessibility-browser-qa-runner.cjs");
  assert.match(runner, /\["chrome", "edge", "firefox", "webkit"\]/);
  for (const blockedDomain of ["googlesyndication", "doubleclick", "googleadservices"]) assert.ok(runner.includes(blockedDomain));
  assert.match(runner, /pipeline["'], "review["'], "cross-browser-accessibility/);
  assert.match(runner, /server\.closeAllConnections\(\)/);
  assert.doesNotMatch(runner, /process\.env|navigator\.userAgent/);
});

function source(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  assert.ok(existsSync(absolute), `Missing ${relativePath}`);
  return readFileSync(absolute, "utf8");
}

function allCss() {
  return ["src/styles/tokens.css", "src/styles/base.css", "src/styles/layout.css", "src/styles/components.css"]
    .map(source)
    .join("\n");
}

function readTree(roots, extensions) {
  const files = [];
  for (const root of roots) walk(path.join(ROOT, root));
  return files.map((file) => readFileSync(file, "utf8"));

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(absolute);
    }
  }
}
