import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  auditAccessibilitySource,
  auditCssCustomProperties,
  collectPerformanceAccessibilitySnapshot,
  PERFORMANCE_BUDGETS,
} from "../lib/performance-accessibility-quality.mjs";

const ROOT = process.cwd();

test("representative static routes pass measured first-party payload and image budgets", () => {
  const snapshot = collectPerformanceAccessibilitySnapshot(ROOT, { label: "test" });
  assert.equal(snapshot.passedMeasuredBudgets, true, JSON.stringify(snapshot.budgetResults.filter((entry) => !entry.passed), null, 2));
  for (const route of snapshot.routes.filter((entry) => entry.family === "gallery")) {
    assert.ok(route.javascriptGzipBytes <= PERFORMANCE_BUDGETS.galleryJavaScriptGzipBytes, route.route);
    assert.ok(route.initialImageBytes <= PERFORMANCE_BUDGETS.mobileInitialImageBytes, route.route);
  }
  for (const route of snapshot.routes) {
    assert.equal(
      route.firstPartyRequestCount,
      1 + route.javascriptAssets.length + route.cssAssets.length + route.fontAssets.length + route.initialImageRequestCount,
      `${route.route}: first-party request total must include initial images`,
    );
    assert.equal(
      route.estimatedFirstPartyTransferBytes,
      route.htmlGzipBytes + route.javascriptGzipBytes + route.cssGzipBytes + route.fontBytes + route.initialImageBytes,
      `${route.route}: first-party transfer total must include initial images`,
    );
  }
  const printable = snapshot.routes.find((route) => route.family === "printable");
  assert.ok(printable.javascriptGzipBytes <= PERFORMANCE_BUDGETS.printableJavaScriptGzipBytes);
  assert.equal(snapshot.routes.reduce((sum, route) => sum + route.brokenPublicImageCount, 0), 0);
  assert.ok(snapshot.pdf.maxBytes <= PERFORMANCE_BUDGETS.printablePdfBytes);
});

test("hub image priority keeps the LCP candidate eager without eagerly loading the below-fold gallery", async () => {
  const [hubPage, gallerySearch] = await Promise.all([
    source("src/components/coloring/HubPageContent.tsx"),
    source("src/components/coloring/GallerySearch.tsx"),
  ]);
  assert.match(hubPage, /mode="hub-three-day"[\s\S]*priorityCount=\{2\}/);
  assert.match(hubPage, /priorityCount=\{showFeatured \? 0 : 4\}/);
  assert.match(gallerySearch, /priorityCount = 4/);
  assert.match(gallerySearch, /<GalleryGrid items=\{resultItems\} priorityCount=\{priorityCount\}/);
});

test("all public CSS custom properties resolve through approved definitions or runtime font variables", () => {
  const audit = auditCssCustomProperties(ROOT);
  assert.deepEqual(audit.unresolved, []);
});

test("representative exported pages retain core semantic contracts", () => {
  const snapshot = collectPerformanceAccessibilitySnapshot(ROOT, { label: "semantics" });
  for (const route of snapshot.routes) {
    assert.equal(route.semantics.h1Count, 1, `${route.route}: expected one H1`);
    assert.equal(route.semantics.mainCount, 1, `${route.route}: expected one main landmark`);
    assert.deepEqual(route.semantics.duplicateIds, [], `${route.route}: duplicate IDs`);
    assert.equal(route.semantics.missingImageAltCount, 0, `${route.route}: missing image alt`);
    assert.equal(route.semantics.nestedInteractiveControls, false, `${route.route}: nested interactive controls`);
  }
});

test("modal focus filtering, status regions, reduced motion, and overflow safeguards remain explicit", () => {
  const checks = auditAccessibilitySource(ROOT);
  assert.deepEqual(checks, {
    focusTrapFiltersRenderedControls: true,
    printablePreviewSingleStatusRegion: true,
    printablePreviewFailureRecovery: true,
    directPdfStatusRegion: true,
    searchStatusRegion: true,
    reducedMotion: true,
    noGlobalOverflowMask: true,
    focusVisibleUsesApprovedTokens: true,
  });
});

test("dialog controls retain names, relationships, native semantics, and focus restoration", async () => {
  const [mobileNav, search, filters, preview, cards, modalHook] = await Promise.all([
    source("src/components/site/MobileNav.tsx"),
    source("src/components/site/GlobalSearchDialog.tsx"),
    source("src/components/coloring/GalleryFilters.tsx"),
    source("src/components/coloring/PrintablePreviewDialog.tsx"),
    source("src/components/coloring/PrintableCardActions.tsx"),
    source("src/hooks/useModalDialog.ts"),
  ]);
  for (const component of [mobileNav, search, filters, preview]) {
    assert.match(component, /role="dialog" aria-modal="true" aria-labelledby=/);
  }
  assert.match(mobileNav, /aria-expanded=\{isOpen\}/);
  assert.match(mobileNav, /aria-controls=\{panelId\}/);
  assert.match(filters, /aria-expanded=\{isMobile \? mobileOpen : desktopOpen\}/);
  assert.match(filters, /aria-controls=\{panelId\}/);
  assert.match(cards, /<button[\s\S]*type="button"[\s\S]*aria-haspopup="dialog"/);
  assert.match(modalHook, /event\.key === "Escape"/);
  assert.match(modalHook, /event\.key !== "Tab"/);
  assert.match(modalHook, /target\?\.isConnected/);
  assert.doesNotMatch(`${mobileNav}\n${search}\n${filters}\n${preview}`, /role="menu"/);
});

test("loading and error states cannot strand printable preview controls in a busy state", async () => {
  const preview = await source("src/components/coloring/PrintablePreviewDialog.tsx");
  assert.match(preview, /\.catch\(\(\) => \{[\s\S]*setPreparing\(false\)[\s\S]*Print preview could not be prepared\. Please try again\./);
  assert.match(preview, /try \{[\s\S]*printOnePagePdf[\s\S]*\} catch \{[\s\S]*The printable PDF could not be prepared\. Please try again\.[\s\S]*\} finally \{[\s\S]*setPrinting\(false\)/);
});

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}
