import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("canonical printable pages expose only the accepted default experience", async () => {
  const page = await source("src/components/coloring/PrintableDetailPage.tsx");
  assert.match(page, /data-printable-experience-version="default-only-v2"/);
  assert.doesNotMatch(page, /data-printable-settings-version|PrintableDetailExperience|PrintablePagePreview/);
  assert.doesNotMatch(page, /Paper size|Orientation preference|Artwork size|Reset to defaults/);
  await assert.rejects(access(path.join(ROOT, "src/components/coloring/PrintableDetailExperience.tsx")));
  await assert.rejects(access(path.join(ROOT, "src/components/coloring/PrintablePagePreview.tsx")));
});

test("default printable workspace keeps preview, actions, facts, and help together", async () => {
  const page = await source("src/components/coloring/PrintableDetailPage.tsx");
  assertOrder(page, [
    'data-page-section="printable-main"',
    "<AssetImage",
    '<aside className="printable-action-panel"',
    "<PrintableDetailActions",
    'data-printable-details',
    '<details className="printable-help"',
  ]);
  assert.match(page, /Printable PDF[\s\S]*PRINTABLE_COMPOSITION\.page\.paperSize/);
  assert.match(page, /PDF paper size[\s\S]*PRINTABLE_COMPOSITION\.page\.widthIn/);
  assert.match(page, /PNG\/JPG output[\s\S]*PRINTABLE_COMPOSITION\.page\.widthPx/);
  assert.match(page, /WebP output[\s\S]*Artwork image/);
});

test("public actions always use the default composition path", async () => {
  const [actions, cardActions, dialog, menu] = await Promise.all([
    source("src/components/coloring/PrintableDetailActions.tsx"),
    source("src/components/coloring/PrintableCardActions.tsx"),
    source("src/components/coloring/PrintablePreviewDialog.tsx"),
    source("src/components/coloring/DownloadMenu.tsx"),
  ]);
  for (const text of [actions, cardActions, dialog, menu]) {
    assert.doesNotMatch(text, /PrintableProfileRequest|compositionSnapshot|paperOperation|paperPreview|scalePercent|orientationPreference/);
  }
  assert.match(actions, /downloadOnePagePdf\(\{[\s\S]*filenameBaseName: item\.downloadBaseName,[\s\S]*\}\)/);
  assert.doesNotMatch(actions, /downloadOnePagePdf\(\{[\s\S]*composition:/);
  assert.match(dialog, /printOnePagePdf\(\{[\s\S]*filenameBaseName: item\.downloadBaseName,[\s\S]*\}\)/);
  assert.doesNotMatch(dialog, /printOnePagePdf\(\{[\s\S]*composition:/);
});

test("action order, format truth, focus, and status contracts remain intact", async () => {
  const [actions, dialog, menu] = await Promise.all([
    source("src/components/coloring/PrintableDetailActions.tsx"),
    source("src/components/coloring/PrintablePreviewDialog.tsx"),
    source("src/components/coloring/DownloadMenu.tsx"),
  ]);
  assertOrder(actions, ["Download PDF", "<PrintableCardActions", "Download image"]);
  assert.match(actions, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(actions, /pdfDownloadButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(dialog, /useModalDialog\(\{ open, panelRef, onEscape: onClose \}\)/);
  assert.match(menu, /PNG[\s\S]*Printable page image/);
  assert.match(menu, /JPG[\s\S]*Printable page image/);
  assert.match(menu, /WebP[\s\S]*High-resolution artwork image/);
  assert.match(menu, /recommended: true/);
  assert.doesNotMatch(menu, /SVG|Download SVG/);
});

test("public CSS no longer contains settings or profile-preview systems", async () => {
  const styles = await source("src/styles/components.css");
  assert.doesNotMatch(styles, /\.printable-settings|\.printable-profile|\.printable-page-preview|\.printable-preview-page/);
  assert.doesNotMatch(styles, /data-printable-settings-version/);
});

test("paper profiles stay centralized and available only as internal export inputs", async () => {
  const composition = await source("src/lib/coloring/exportComposition.ts");
  for (const value of [
    'export type PaperKind = "letter" | "a4"',
    'export type OrientationPreference = "auto" | PageOrientation',
    'export type ArtworkScalePercent = 100 | 90 | 75 | 50',
    'paperKind: "letter"',
    'orientation: "portrait"',
    'artworkScalePercent: 100',
  ]) assert.match(composition, new RegExp(escapeRegExp(value)));
  assert.match(composition, /export function computePrintableLayout/);
  assert.match(composition, /export function resolvePrintableProfile/);
});

test("default filenames remain unsuffixed while internal profile requests stay deterministic", async () => {
  const downloads = await source("src/lib/coloring/browserDownloads.ts");
  assert.match(downloads, /buildPrintPdfFilename\(options\.filenameBaseName \|\| options\.title\)/);
  assert.ok(downloads.includes('return buildDownloadFilename(title, "png").replace(/\\.png$/i, ".pdf");'));
  assert.match(downloads, /filename: buildDownloadFilename\(options\.filenameBaseName \|\| options\.title, formatConfig\.extension\)/);
  assert.doesNotMatch(downloads, /buildPrintablePageFilename|paperKindSuffix|orientationSuffix|scaleSuffix/);
});

test("protected printable inventory and dependency contract remain frozen", async () => {
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function source(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function json(relativePath) {
  return JSON.parse(await source(relativePath));
}
