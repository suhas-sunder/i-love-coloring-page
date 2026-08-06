import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const modules = await importExportModules();
const composition = modules.composition;
const downloads = modules.downloads;

test.after(async () => {
  await rm(modules.tempRoot, { recursive: true, force: true });
});

test("print settings start at Letter, portrait, and Maximum with native labeled controls", async () => {
  const experience = await source("src/components/coloring/PrintableDetailExperience.tsx");
  assert.match(experience, /useState<Required<PrintableProfileRequest>>\(\(\) => \(\{ \.\.\.DEFAULT_PRINTABLE_PROFILE \}\)\)/);
  assert.match(experience, /data-printable-settings-version="paper-controls-v1"/);
  assert.deepEqual([...experience.matchAll(/<legend>([^<]+)<\/legend>/g)].map((match) => match[1]), ["Paper", "Orientation", "Artwork size"]);
  assert.equal((experience.match(/type="radio"/g) || []).length, 3, "each mapped option group must render native radio inputs");
  assert.match(experience, /htmlFor=\{`\$\{inputPrefix\}-paper-\$\{paperKind\}`\}/);
  assert.match(experience, /id=\{`\$\{inputPrefix\}-paper-\$\{paperKind\}`\}/);
  assert.match(experience, /name=\{`\$\{inputPrefix\}-orientation`\}/);
  assert.match(experience, /name=\{`\$\{inputPrefix\}-scale`\}/);
  assert.doesNotMatch(experience, /<select|role="radio"|role="radiogroup"|localStorage|sessionStorage|indexedDB|URLSearchParams|process\.env/);
});

test("reset is conditional, keyboard-native, and route identity resets local state", async () => {
  const [experience, page] = await Promise.all([
    source("src/components/coloring/PrintableDetailExperience.tsx"),
    source("src/components/coloring/PrintableDetailPage.tsx"),
  ]);
  assert.match(experience, /!isDefault \? \([\s\S]*Reset to defaults[\s\S]*\) : null/);
  assert.match(experience, /<button[^>]+type="button"[^>]+onClick=\{resetSettings\}/);
  assert.match(experience, /applySettings\(DEFAULT_PRINTABLE_PROFILE\)/);
  assert.match(experience, /restoreResetFocusRef\.current = true/);
  assert.match(experience, /defaultPaperInputRef\.current\?\.focus\(\)/);
  assert.match(page, /<PrintableDetailExperience[\s\S]*key=\{printable\.assetId\}/);
  assert.doesNotMatch(experience, /location\.reload|router\.(?:push|replace)|history\./);
});

test("preview uses centralized lightweight geometry for every profile and scale", async () => {
  const preview = await source("src/components/coloring/PrintablePagePreview.tsx");
  assert.match(preview, /computePrintableLayout\(sourceWidth, sourceHeight, settings\)/);
  assert.match(preview, /data-preview-renderer="css-geometry"/);
  assert.match(preview, /data-resolved-orientation=\{layout\.page\.orientation\}/);
  assert.doesNotMatch(preview, /canvas|toBlob|toDataURL|2550|3300|3508|2480/);
  assert.doesNotMatch(preview, /aria-live|role="status"/);

  const cases = [
    [{ paperKind: "letter", orientation: "portrait", artworkScalePercent: 100 }, "letter-portrait", [612, 792]],
    [{ paperKind: "letter", orientation: "landscape", artworkScalePercent: 100 }, "letter-landscape", [792, 612]],
    [{ paperKind: "a4", orientation: "portrait", artworkScalePercent: 100 }, "a4-portrait", [595.28, 841.89]],
    [{ paperKind: "a4", orientation: "landscape", artworkScalePercent: 75 }, "a4-landscape", [841.89, 595.28]],
  ];
  for (const [request, pageId, dimensions] of cases) {
    const layout = composition.computePrintableLayout(800, 1200, request);
    assert.equal(layout.page.id, pageId);
    assert.deepEqual([layout.pageBounds.width, layout.pageBounds.height], dimensions);
    assertContained(layout.imageBox, layout.safeContentBounds);
    assertContained(layout.brandBox, layout.pageBounds);
    assertContained(layout.outerFrame, layout.pageBounds);
  }

  assert.equal(composition.computePrintableLayout(800, 1200, { orientation: "auto" }).page.orientation, "portrait");
  assert.equal(composition.computePrintableLayout(1200, 800, { orientation: "auto" }).page.orientation, "landscape");
  assert.equal(composition.computePrintableLayout(1000, 1000, { orientation: "auto" }).page.orientation, "portrait");
  const widths = [100, 90, 75, 50].map((artworkScalePercent) => (
    composition.computePrintableLayout(800, 1200, { artworkScalePercent }).imageBox.width
  ));
  assert.ok(widths[0] > widths[1] && widths[1] > widths[2] && widths[2] > widths[3]);
});

test("PDF, Print, PNG, and JPG snapshot one profile while WebP remains independent", async () => {
  const [actions, dialog, menu, downloadsSource] = await Promise.all([
    source("src/components/coloring/PrintableDetailActions.tsx"),
    source("src/components/coloring/PrintablePreviewDialog.tsx"),
    source("src/components/coloring/DownloadMenu.tsx"),
    source("src/lib/coloring/browserDownloads.ts"),
  ]);
  assert.match(actions, /const compositionSnapshot = \{ \.\.\.composition \}/);
  assert.match(actions, /paperOperation\.begin\(\)/);
  assert.match(actions, /composition: compositionSnapshot/);
  assert.match(actions, /paperOperation\.end\(\)/);
  assert.match(dialog, /const compositionSnapshot = composition \? \{ \.\.\.composition \} : undefined/);
  assert.match(dialog, /printOnePagePdf\(\{[\s\S]*composition: compositionSnapshot/);
  assert.match(menu, /const usesPaperSettings = option\.format !== "webp"/);
  assert.match(menu, /composition: usesPaperSettings \? compositionSnapshot : undefined/);
  assert.match(menu, /option\.format !== "webp" && Boolean\(paperOperation\?\.busy\)/);
  assert.match(downloadsSource, /export async function downloadWebp[\s\S]*downloadConvertedCanvasFormat\(options, "webp"\)/);
  assert.doesNotMatch(sliceBetween(downloadsSource, "export async function downloadWebp", "export async function prepareHighQualityPrintImage"), /computePrintableLayout|composePrintableRasterToBlob/);
});

test("profile-aware filenames are deterministic and leave defaults and WebP unchanged", () => {
  const defaultLayout = composition.computePrintableLayout(800, 1200);
  const a4 = composition.computePrintableLayout(800, 1200, { paperKind: "a4" });
  const landscape = composition.computePrintableLayout(800, 1200, { orientation: "landscape" });
  const autoLandscape = composition.computePrintableLayout(1200, 800, { paperKind: "a4", orientation: "auto", artworkScalePercent: 75 });
  assert.equal(downloads.buildPrintablePageFilename("Fox", "pdf", defaultLayout), "fox.pdf");
  assert.equal(downloads.buildPrintablePageFilename("Fox", "png", a4), "fox-a4.png");
  assert.equal(downloads.buildPrintablePageFilename("Fox", "jpg", landscape), "fox-landscape.jpg");
  assert.equal(downloads.buildPrintablePageFilename("Fox", "pdf", autoLandscape), "fox-a4-auto-landscape-75.pdf");
  assert.equal(downloads.buildDownloadFilename("Fox", "webp"), "fox.webp");
});

test("settings retain practical touch targets, visible focus, status semantics, and no motion", async () => {
  const [experience, actions, styles] = await Promise.all([
    source("src/components/coloring/PrintableDetailExperience.tsx"),
    source("src/components/coloring/PrintableDetailActions.tsx"),
    source("src/styles/components.css"),
  ]);
  assert.match(styles, /\.printable-settings-option \{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.printable-settings-option input:focus-visible \{[\s\S]*--focus-ring-width[\s\S]*--color-focus/);
  assert.match(styles, /\.printable-settings-reset \{[\s\S]*min-height: 44px/);
  assert.doesNotMatch(styles, /\.printable-(?:settings|preview)[\s\S]{0,240}(?:transition|animation)/);
  assert.match(experience, /Auto selected:/);
  assert.match(experience, /Preview updated:/);
  assert.match(actions, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(experience, /<a\b|tabIndex|role="button"/);
});

test("settings stay outside ads and preserve the finalized six-position contract", async () => {
  const [page, shell, adSlot, adsConfig, styles, adsTxt] = await Promise.all([
    source("src/components/coloring/PrintableDetailPage.tsx"),
    source("src/components/site/PublicPageShell.tsx"),
    source("src/components/ads/AdSlot.tsx"),
    source("src/lib/ads/config.ts"),
    source("src/styles/components.css"),
    source("public/ads.txt"),
  ]);
  assertOrder(page, ["placement=\"post-header-banner\"", "<PrintableDetailExperience", "placement=\"supporting-square\"", "placement=\"related-banner\""]);
  assert.doesNotMatch(page.slice(page.indexOf("<PrintableDetailExperience"), page.indexOf("<section className=\"content-section printable-related-section\"")), /PageAdSlot|AdSlot|data-ad-/);
  assert.match(shell, /data-ad-layout-version=\{layout\.mode === "full" \? "manual-six-v2" : undefined\}/);
  assert.match(adSlot, /data-ad-size-policy=\{isFixedHeader \? "fixed-header-v1" : undefined\}/);
  assert.match(adSlot, /data-ad-format=\{isFixedHeader \? undefined : "auto"\}/);
  for (const slotId of ["5574432869", "5115981872", "9929324856", "2489818539", "5382861174"]) assert.match(adsConfig, new RegExp(slotId));
  assert.match(styles, /--ad-rail-width: 300px/);
  assert.equal(adsTxt, "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0");
});

test("protected printable inventory, route hash, and package versions remain frozen", async () => {
  const [runtime, routeIndex, packageJson, lockfile] = await Promise.all([
    json("src/generated/coloring/runtime-printables.json"),
    json("src/generated/coloring/runtime-printable-route-index.json"),
    json("package.json"),
    json("package-lock.json"),
  ]);
  assert.equal(runtime.records.length, 6352);
  assert.equal(runtime.summary.recordSha256, "4fc394e39aa4d8e2b0e2e96ebbc586d00c91e5e18479748b72dbb6075e77bed6");
  assert.equal(routeIndex.summary.recordSha256, runtime.summary.recordSha256);
  assert.deepEqual(packageJson.dependencies, { next: "16.2.6", react: "19.2.6", "react-dom": "19.2.6" });
  assert.equal(lockfile.packages[""].dependencies.next, "16.2.6");
});

function assertContained(inner, outer) {
  assert.ok(inner.x >= outer.x);
  assert.ok(inner.y >= outer.y);
  assert.ok(inner.x + inner.width <= outer.x + outer.width + 0.0001);
  assert.ok(inner.y + inner.height <= outer.y + outer.height + 0.0001);
}

function assertOrder(sourceText, values) {
  let previous = -1;
  for (const value of values) {
    const index = sourceText.indexOf(value, previous + 1);
    assert.ok(index > previous, `${value} must appear in order`);
    previous = index;
  }
}

function sliceBetween(value, start, end) {
  return value.slice(value.indexOf(start), value.indexOf(end));
}

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await source(relativePath));
}

async function importExportModules() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-printable-settings-tests-"));
  const compositionSource = await source("src/lib/coloring/exportComposition.ts");
  const compositionOutput = ts.transpileModule(compositionSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const compositionPath = path.join(tempRoot, "exportComposition.mjs");
  await writeFile(compositionPath, compositionOutput, "utf8");

  const downloadsSource = (await source("src/lib/coloring/browserDownloads.ts"))
    .replace('from "./exportComposition";', 'from "./exportComposition.mjs";');
  const downloadsOutput = ts.transpileModule(downloadsSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const downloadsPath = path.join(tempRoot, "browserDownloads.mjs");
  await writeFile(downloadsPath, downloadsOutput, "utf8");

  return {
    tempRoot,
    composition: await import(`${pathToFileUrl(compositionPath)}?v=${Date.now()}`),
    downloads: await import(`${pathToFileUrl(downloadsPath)}?v=${Date.now()}`),
  };
}

function pathToFileUrl(value) {
  return `file:///${value.replaceAll("\\", "/")}`;
}
