import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const readiness = await importTypeScript("src/lib/ads/initializationReadiness.ts");

test("zero, non-finite, and undersized ad surfaces cannot initialize", () => {
  const responsive = { width: 250, height: 50, exact: false };
  assert.equal(readiness.hasRequiredAdSurfaceSize({ width: 0, height: 90 }, { width: 0, height: 90 }, responsive), false);
  assert.equal(readiness.hasRequiredAdSurfaceSize({ width: Number.NaN, height: 90 }, { width: 728, height: 90 }, responsive), false);
  assert.equal(readiness.hasRequiredAdSurfaceSize({ width: 249, height: 90 }, { width: 249, height: 90 }, responsive), false);
  assert.equal(readiness.hasRequiredAdSurfaceSize({ width: 728, height: 90 }, { width: 728, height: 90 }, responsive), true);
  assert.equal(readiness.hasRequiredAdSurfaceSize(
    { width: 300, height: 600 },
    { width: 300, height: 600 },
    { width: 300, height: 600, exact: true },
  ), true);
  assert.equal(readiness.hasRequiredAdSurfaceSize(
    { width: 301, height: 600 },
    { width: 301, height: 600 },
    { width: 300, height: 600, exact: true },
  ), false);
});

test("minimum dimensions are placement-aware and remain centralized", async () => {
  const config = await source("src/lib/ads/config.ts");
  assert.match(config, /getAdInitializationMinimumSize/);
  assert.match(config, /placement === "top-banner"[\s\S]*getFixedHeaderSize\(viewportWidth\)/);
  assert.match(config, /"left-rail"[\s\S]*width: 300, height: 600/);
  assert.match(config, /"supporting-square"[\s\S]*width: 250, height: 250/);
  assert.match(config, /width: 250, height: 50/);
});

test("runtime waits for connected, rendered, measurable surfaces before registration and push", async () => {
  const runtime = await source("src/components/ads/AdSenseRuntime.tsx");
  assert.match(runtime, /slot\.isConnected[\s\S]*unit\.isConnected[\s\S]*currentWrapper !== slot/);
  assert.match(runtime, /getClientRects\(\)\.length > 0/);
  assert.match(runtime, /style\.contentVisibility === "hidden"/);
  assert.match(runtime, /hasRequiredAdSurfaceSize/);
  assertOrder(runtime, [
    "const measurement = readInitializationMeasurement",
    "if (!decision.eligible)",
    'unit.dataset.adInitialized = "true"',
    "registerUnitForLifecycle(slotId)",
    ".push({})",
  ]);
  assert.match(runtime, /function registerUnitForLifecycle[\s\S]*coordinator\.registerUnit/);
  assert.match(runtime, /MAX_INITIALIZATION_MEASUREMENT_RETRIES = 8/);
  assert.match(runtime, /scheduleInitializationRetry/);
  assert.match(runtime, /initializationRetryCounts/);
  assert.match(runtime, /initializationRetryFrames/);
  assert.match(runtime, /new ResizeObserver\(\(entries\)/);
  assert.match(runtime, /resizeObserver\.observe\(wrapper\)/);
  assert.match(runtime, /else initializeUnit\(unit, isWithinLoadRange\(unit\)\)/);
  assert.match(runtime, /for \(const frame of initializationRetryFrames\.values\(\)\) cancelAnimationFrame\(frame\)/);
  assert.equal((runtime.match(/\.push\(\{\}\)/g) || []).length, 1);
});

test("secondary banners follow meaningful content on every approved page family", async () => {
  const [home, gallery, hub, printable] = await Promise.all([
    source("app/page.tsx"),
    source("app/coloring-pages/page.tsx"),
    source("src/components/coloring/HubPageContent.tsx"),
    source("src/components/coloring/PrintableDetailPage.tsx"),
  ]);
  assertOrder(home, [
    'data-page-section="primary-collections"',
    'placement="post-header-banner"',
    'data-page-section="fresh-printables"',
    'placement="supporting-square"',
    'data-page-section="additional-discovery"',
    'placement="related-banner"',
  ]);
  assertOrder(gallery, [
    'data-page-section="gallery"',
    'placement="post-header-banner"',
    'data-page-section="supporting-browse"',
    'supportingHubs.slice(0, 4)',
    'placement="supporting-square"',
    'supportingHubs.slice(4)',
    'placement="related-banner"',
  ]);
  const pageOne = hub.slice(hub.indexOf("{isPageOne ? ("), hub.indexOf(") : (", hub.indexOf("{isPageOne ? (")));
  assertOrder(pageOne, [
    '<GallerySearch',
    'placement="post-header-banner"',
    'data-page-section="related-collections"',
    'placement="supporting-square"',
  ]);
  const pagination = hub.slice(hub.indexOf('data-page-section="paginated-gallery"'));
  assertOrder(pagination, [
    '<PaginatedGalleryGrid',
    '<Pagination',
    'placement="post-header-banner"',
    'data-page-section="return-to-collection"',
    'placement="related-banner"',
  ]);
  assertOrder(printable, [
    'data-printable-experience-version="default-only-v2"',
    'placement="post-header-banner"',
    'Related printable pages',
    'placement="supporting-square"',
    'Related Collections',
    'placement="related-banner"',
  ]);
  for (const page of [home, gallery, hub, printable]) {
    assert.doesNotMatch(page, /<PageAdSlot[^>]+\/>\s*<PageAdSlot/);
  }
});

test("secondary ad spacing is symmetric and avoids stacked following margins", async () => {
  const css = await source("src/styles/components.css");
  assert.match(css, /\.ad-slot-post-header-banner \{\s*margin-block: var\(--space-32\);\s*\}/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.ad-slot-post-header-banner,[\s\S]*\.ad-slot-supporting-square \{\s*margin-block: var\(--space-48\);/);
  assert.match(css, /\.ad-slot-post-header-banner \+ \.content-section,[\s\S]*\.ad-slot-supporting-square \+ \.content-section \{\s*margin-top: 0;/);
});

test("new flow marker is emitted only by the approved secondary-banner wrapper", async () => {
  const [slot, shell] = await Promise.all([
    source("src/components/ads/AdSlot.tsx"),
    source("src/components/site/PublicPageShell.tsx"),
  ]);
  assert.match(slot, /data-ad-flow-version=\{slot\.logicalPlacement === "post-header-banner" \? "balanced-mid-content-v1" : undefined\}/);
  assert.match(shell, /data-ad-layout-version=\{layout\.mode === "full" \? "manual-six-v2" : undefined\}/);
  assert.doesNotMatch(slot, /position:\s*(?:fixed|sticky)|zIndex|overflowX/);
});

test("trust, sitemap, and 404 families remain ad-free", async () => {
  const config = await source("src/lib/ads/config.ts");
  for (const family of ["trust", "html-sitemap", "not-found"]) {
    assert.match(config, new RegExp(`(?:"${family}"|${family}): \\{ mode: "none", sideRailsAllowed: false, slots: \\{\\} \\}`));
  }
});

test("protected printable, AdSense, ads.txt, and dependency identities remain unchanged", async () => {
  const [runtime, config, adsTxt, packageJson, lockfile] = await Promise.all([
    json("src/generated/coloring/runtime-printables.json"),
    source("src/lib/ads/config.ts"),
    source("public/ads.txt"),
    json("package.json"),
    json("package-lock.json"),
  ]);
  assert.equal(runtime.records.length, 6352);
  assert.equal(runtime.summary.recordSha256, "4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6");
  for (const value of ["ca-pub-4810616735714570", "5574432869", "5115981872", "9929324856", "2489818539", "5382861174"]) {
    assert.match(config, new RegExp(value));
  }
  assert.equal(adsTxt, "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0");
  assert.deepEqual(packageJson.dependencies, lockfile.packages[""].dependencies);
});

function assertOrder(sourceText, values) {
  let previous = -1;
  for (const value of values) {
    const index = sourceText.indexOf(value, previous + 1);
    assert.ok(index > previous, `${value} must appear in order`);
    previous = index;
  }
}

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await source(relativePath));
}

async function importTypeScript(relativePath) {
  const input = await source(relativePath);
  const output = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}#${encodeURIComponent(relativePath)}`);
}
