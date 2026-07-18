#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const printables = readJson("src/generated/coloring/runtime-printables.json").records;

if (!existsSync(OUT)) {
  console.error("Canonical accessibility validation not_run: out/ does not exist.");
  process.exit(2);
}

const representatives = selectRepresentatives(printables);
const results = representatives.map((printable) => {
  const relativePath = `${printable.canonicalPath.slice(1)}.html`;
  const html = readFileSync(path.join(OUT, relativePath), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const checks = {
    oneH1: (html.match(/<h1\b/g) || []).length === 1,
    breadcrumbNav: /<nav[^>]+aria-label="Breadcrumb"/.test(html) && /aria-current="page"/.test(html),
    nativePrintButton: /<button[^>]+type="button"[^>]*>Print<\/button>/.test(html),
    downloadGroupNamed: /<div[^>]*role="group"[^>]*aria-label="Download [^"]+"/.test(html),
    canonicalRelatedLinks:
      anchorHasClassAndPrintableHref(html, "gallery-item-media-link") &&
      anchorHasClassAndPrintableHref(html, "item-title-link"),
    noNestedInteractiveControls: !/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/i.test(html),
    imageAlternatives: images.length > 0 && images.every((image) => /\salt="[^"]*"/.test(image)),
    uniqueIds: ids.length === new Set(ids).size,
    noHiddenFocusAttribute: !/tabindex="-1"[^>]*(?:Print|Download)/i.test(html),
  };
  return { canonicalPath: printable.canonicalPath, relativePath, checks };
});

const dialog = readText("src/components/coloring/PrintablePreviewDialog.tsx");
const actions = readText("src/components/coloring/PrintableCardActions.tsx");
const modalHook = readText("src/hooks/useModalDialog.ts");
const overlayProvider = readText("src/components/site/SiteInteractionProvider.tsx");
const styles = readText("src/styles/components.css");
const sourceChecks = {
  dialogNamed: /role="dialog" aria-modal="true" aria-labelledby=\{titleId\}/.test(dialog),
  escapeClose: /event\.key === "Escape"/.test(modalHook) && /useModalDialog/.test(dialog),
  focusTrap: /event\.key !== "Tab"/.test(modalHook) && /controls\[0\]/.test(modalHook),
  scrollLock: /document\.body\.style\.overflow = "hidden"/.test(overlayProvider),
  focusRestore:
    /restoreFocusAfterModalClose\(triggerRef\.current\)/.test(actions) &&
    /requestAnimationFrame\(\(\) => \{[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*target\?\.isConnected[\s\S]*target\.focus\(\)/.test(modalHook),
  visibleFocus: /:focus-visible/.test(styles) && /outline: var\(--focus-ring-width\) solid var\(--color-focus\)/.test(styles),
  mobileSingleColumn: /@media \(max-width: 1023px\)[\s\S]*\.printable-main[\s\S]*grid-template-columns: 1fr/.test(styles),
  placeholdersNotFocusable: !/data-ad-placeholder[^>]*tabIndex|data-ad-placeholder[^>]*tabindex/.test(readText("src/components/ads/AdSlot.tsx")),
  placeholdersOutsideHeadings: !/<h[1-6][^>]*>[\s\S]*Advertisement/.test(readText("src/components/ads/AdSlot.tsx")),
};

const passed = results.every((result) => Object.values(result.checks).every(Boolean)) && Object.values(sourceChecks).every(Boolean);
console.log(JSON.stringify({ passed, representativeCount: results.length, results, sourceChecks }, null, 2));
if (!passed) process.exitCode = 1;

function selectRepresentatives(records) {
  const candidates = [
    records.find((record) => record.primaryCategorySlug === "animals"),
    records.find((record) => record.primaryCategorySlug === "mandalas"),
    records.find((record) => record.primaryCategorySlug === "anime-girls"),
    records.find((record) => /christmas|halloween/i.test(record.publicTitle)),
    [...records].sort((left, right) => right.displayTitle.length - left.displayTitle.length || left.assetId.localeCompare(right.assetId))[0],
  ].filter(Boolean);
  return candidates.filter((record, index) => candidates.findIndex((candidate) => candidate.canonicalPath === record.canonicalPath) === index);
}

function anchorHasClassAndPrintableHref(html, className) {
  return [...html.matchAll(/<a\b[^>]*>/g)].some(
    ([anchor]) => anchor.includes(`class="${className}"`) && /href="\/printables\//.test(anchor),
  );
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}
