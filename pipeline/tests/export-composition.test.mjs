import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { inflateSync } from "node:zlib";

import ts from "typescript";

const ROOT = process.cwd();
const modules = await importExportModules();
const composition = modules.composition;
const downloads = modules.downloads;
const baseline = JSON.parse(await readFile(path.join(ROOT, "pipeline/tests/fixtures/printable-paper-profile-baseline.json"), "utf8"));
const SYNTHETIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="white"/><path d="M40 400H1160" fill="none" stroke="black" stroke-width="8"/></svg>`;

test.after(async () => {
  await rm(modules.tempRoot, { recursive: true, force: true });
});

test("shared composition constants preserve Letter PDF and 300 DPI raster output", () => {
  const spec = composition.PRINTABLE_COMPOSITION;
  assert.equal(spec.page.widthPt, 612);
  assert.equal(spec.page.heightPt, 792);
  assert.equal(spec.page.paperSize, "US Letter");
  assert.equal(spec.page.orientation, "portrait");
  assert.equal(spec.page.widthIn, 8.5);
  assert.equal(spec.page.heightIn, 11);
  assert.equal(spec.page.widthPx, 2550);
  assert.equal(spec.page.heightPx, 3300);
  assert.equal(spec.page.rasterDpi, 300);
  assert.equal(spec.frame.insetPt, 10);
  assert.equal(spec.safePaddingPt, 5);
  assert.equal(spec.branding.text, "iLoveColoringPage.com");
  assert.equal(spec.branding.fontSizePt, 7);
  assert.equal(spec.jpegQuality, 0.94);
  assert.equal(spec.page.widthPt / spec.page.heightPt, spec.page.widthPx / spec.page.heightPx);
  assert.deepEqual(spec.defaultProfile, {
    paperKind: "letter",
    orientation: "portrait",
    artworkScalePercent: 100,
  });
  assert.deepEqual(spec.supportedOrientations, ["portrait", "landscape", "auto"]);
  assert.deepEqual(spec.supportedArtworkScales, [100, 90, 75, 50]);
  assert.equal(spec.page.id, "letter-portrait");
  assert.equal(spec.page.paperKind, "letter");
});

test("paper registry resolves Letter and A4 in both physical orientations", () => {
  const expected = {
    "letter-portrait": [612, 792, 2550, 3300],
    "letter-landscape": [792, 612, 3300, 2550],
    "a4-portrait": [595.28, 841.89, 2480, 3508],
    "a4-landscape": [841.89, 595.28, 3508, 2480],
  };

  for (const paperKind of ["letter", "a4"]) {
    for (const orientation of ["portrait", "landscape"]) {
      const resolved = composition.resolvePrintableProfile(800, 1200, { paperKind, orientation });
      assert.equal(resolved.page.id, `${paperKind}-${orientation}`);
      assert.deepEqual(
        [resolved.page.widthPt, resolved.page.heightPt, resolved.page.widthPx, resolved.page.heightPx],
        expected[resolved.page.id],
      );
      assert.equal(resolved.page.rasterDpi, 300);
    }
  }
});

test("automatic orientation maximizes safe fit with a deterministic portrait tie", () => {
  assert.equal(composition.selectAutomaticOrientation(800, 1200, "letter"), "portrait");
  assert.equal(composition.selectAutomaticOrientation(1200, 800, "letter"), "landscape");
  assert.equal(composition.selectAutomaticOrientation(1000, 1000, "letter"), "portrait");
  assert.equal(composition.resolvePrintableProfile(800, 1200, { paperKind: "a4", orientation: "auto" }).page.orientation, "portrait");
  assert.equal(composition.resolvePrintableProfile(1200, 800, { paperKind: "a4", orientation: "auto" }).page.orientation, "landscape");
});

test("artwork scales are percentages of maximum safe fit, centered, and never clip", () => {
  const maximum = composition.computePrintableLayout(800, 1200, { artworkScalePercent: 100 });
  for (const artworkScalePercent of [100, 90, 75, 50]) {
    const layout = composition.computePrintableLayout(800, 1200, { artworkScalePercent });
    assert.equal(layout.artworkScalePercent, artworkScalePercent);
    assert.equal(layout.imageBox.width, round4(maximum.maximumImageBox.width * artworkScalePercent / 100));
    assert.equal(layout.imageBox.height, round4(maximum.maximumImageBox.height * artworkScalePercent / 100));
    assert.equal(round4(layout.imageBox.x + layout.imageBox.width / 2), round4(layout.safeContentBounds.x + layout.safeContentBounds.width / 2));
    assert.equal(round4(layout.imageBox.y + layout.imageBox.height / 2), round4(layout.safeContentBounds.y + layout.safeContentBounds.height / 2));
    assert.ok(layout.imageBox.x >= layout.safeContentBounds.x);
    assert.ok(layout.imageBox.y >= layout.safeContentBounds.y);
    assert.ok(layout.imageBox.x + layout.imageBox.width <= layout.safeContentBounds.x + layout.safeContentBounds.width);
    assert.ok(layout.imageBox.y + layout.imageBox.height <= layout.safeContentBounds.y + layout.safeContentBounds.height);
  }
});

test("default profile remains geometrically identical to the accepted baseline fixture", () => {
  const layout = composition.computePrintableLayout(800, 1200);
  assert.equal(layout.page.id, baseline.defaultProfile.pageSize);
  assert.deepEqual([layout.pageBounds.width, layout.pageBounds.height], baseline.defaultProfile.pdfPoints);
  assert.deepEqual(layout.outerFrame, baseline.defaultProfile.outerFrame);
  assert.deepEqual(layout.safeContentBounds, baseline.defaultProfile.safeContentBounds);
  assert.deepEqual(layout.imageBox, baseline.defaultProfile.portraitArtworkBox);
  assert.deepEqual(layout.brandBox, baseline.defaultProfile.brandBox);
  assert.deepEqual(layout.brandKnockoutBox, baseline.defaultProfile.brandKnockoutBox);
});

test("invalid profile inputs fail explicitly instead of producing malformed geometry", () => {
  assert.throws(() => composition.computePrintableLayout(0, 1200), /positive finite/);
  assert.throws(() => composition.computePrintableLayout(800, 1200, { paperKind: "legal" }), /paper kind/);
  assert.throws(() => composition.computePrintableLayout(800, 1200, { orientation: "sideways" }), /orientation/);
  assert.throws(() => composition.computePrintableLayout(800, 1200, { artworkScalePercent: 80 }), /artwork scale/);
});

test("point-to-pixel scale and normalized PDF/raster geometry match", () => {
  const scale = composition.pointToRasterScale();
  assert.equal(scale, 2550 / 612);
  assert.equal(composition.pdfPointToRasterPixels(612), 2550);
  assert.equal(composition.pdfPointToRasterPixels(792), 3300);

  const pdf = composition.computePrintableLayout(1200, 800, "pdf");
  const raster = composition.computePrintableLayout(1200, 800, "raster");
  for (const key of ["pageBounds", "outerFrame", "safeContentBounds", "imageBox", "brandBox", "brandKnockoutBox"]) {
    for (const field of ["x", "y", "width", "height"]) {
      assert.ok(Math.abs(raster[key][field] / scale - pdf[key][field]) < 0.0001, `${key}.${field}`);
    }
  }
});

test("frame, safe content, centered artwork, and branding remain non-overlapping", () => {
  const layout = composition.computePrintableLayout(1200, 800, "pdf");
  assert.deepEqual(layout.outerFrame, { x: 10, y: 10, width: 592, height: 772 });
  assert.equal(layout.safeContentBounds.x, 15);
  assert.equal(layout.safeContentBounds.y, 15);
  assert.equal(layout.safeContentBounds.width, 582);
  assert.equal(layout.imageBox.x + layout.imageBox.width / 2, layout.safeContentBounds.x + layout.safeContentBounds.width / 2);
  assert.equal(layout.imageBox.y + layout.imageBox.height / 2, layout.safeContentBounds.y + layout.safeContentBounds.height / 2);
  assert.equal(composition.boxesOverlap(layout.imageBox, layout.brandBox), false);
  assert.equal(layout.imageBox.x >= layout.safeContentBounds.x, true);
  assert.equal(layout.imageBox.y >= layout.safeContentBounds.y, true);
});

test("branded PNG and JPEG use opaque 2550x3300 Letter canvases", async () => {
  const mock = installCanvasMock();
  try {
    const png = await downloads.composePrintableRasterToBlob({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      format: "png",
    });
    assert.equal(png.ok, true);
    assert.equal(png.width, 2550);
    assert.equal(png.height, 3300);
    assert.equal(png.mimeType, "image/png");
    assert.equal(png.filename, "synthetic-landscape.png");
    assertOpaqueWhitePage(mock.canvases[0]);

    const jpeg = await downloads.composePrintableRasterToBlob({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      format: "jpg",
    });
    assert.equal(jpeg.ok, true);
    assert.equal(jpeg.width, 2550);
    assert.equal(jpeg.height, 3300);
    assert.equal(jpeg.mimeType, "image/jpeg");
    assert.equal(jpeg.filename, "synthetic-landscape.jpg");
    assert.equal(mock.canvases[1].lastQuality, 0.94);
    assertOpaqueWhitePage(mock.canvases[1]);
  } finally {
    mock.restore();
  }
});

test("printable raster composition consumes the selected centralized paper profile", async () => {
  const mock = installCanvasMock();
  try {
    const result = await downloads.composePrintableRasterToBlob({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      format: "png",
      composition: { paperKind: "a4", orientation: "landscape", artworkScalePercent: 75 },
    });
    assert.equal(result.ok, true);
    assert.deepEqual([result.width, result.height], [3508, 2480]);
    const canvas = mock.canvases[0];
    assert.deepEqual([canvas.width, canvas.height], [3508, 2480]);
    const draw = canvas.context.operations.find((operation) => operation.name === "drawImage");
    const layout = composition.computePrintableLayout(1200, 800, {
      unit: "raster",
      paperKind: "a4",
      orientation: "landscape",
      artworkScalePercent: 75,
    });
    assert.deepEqual(draw.args, [
      layout.imageBox.x,
      composition.canvasTopFromBottomOrigin(layout.imageBox, 2480),
      layout.imageBox.width,
      layout.imageBox.height,
    ]);
  } finally {
    mock.restore();
  }
});

test("WebP remains artwork-oriented instead of using the branded Letter page", async () => {
  const mock = installCanvasMock();
  try {
    const webp = await downloads.convertInternalSvgToBlob({
      internalSvgUrl: svgDataUrl(),
      title: "Synthetic Landscape",
      format: "webp",
      targetLongEdge: 2400,
    });
    assert.equal(webp.ok, true);
    assert.equal(webp.width, 2400);
    assert.equal(webp.height, 1600);
    assert.equal(webp.filename, "synthetic-landscape.webp");
    assert.notDeepEqual([webp.width, webp.height], [2550, 3300]);
  } finally {
    mock.restore();
  }
});

test("synthetic PDF remains one Letter page with the shared frame, artwork, and brand geometry", async () => {
  const mock = installCanvasMock();
  try {
    const pdf = await downloads.prepareOnePagePrintPdf({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      altText: "Synthetic landscape coloring page",
    });
    assert.equal(pdf.ok, true);
    assert.equal(pdf.pageCount, 1);
    assert.equal(pdf.pageSize, "letter-portrait");
    assert.deepEqual(pdf.pageDimensions, { widthPt: 612, heightPt: 792 });
    assert.equal(pdf.printableBorderCount, 1);
    assert.equal(pdf.brandPlacement, "bottom-frame-label");
    assert.equal(pdf.brandingOverlapsArtwork, false);
    assert.equal(pdf.appUiControlsIncluded, false);
    assert.equal(pdf.pdfByteLength > 0, true);
    assert.equal(pdf.pdfBlob.type, "application/pdf");
    const pdfBytes = Buffer.from(await pdf.pdfBlob.arrayBuffer());
    const pdfMagic = pdfBytes.subarray(0, 4).toString("ascii");
    assert.equal(pdfMagic, "%PDF");
    assert.ok(pdfBytes.length <= 3 * 1024 * 1024, `compressed fixture is ${pdfBytes.length} bytes`);
    const image = parsePdfImageStream(pdfBytes);
    assert.equal(image.colorSpace, "/DeviceRGB");
    assert.equal(image.bitsPerComponent, 8);
    assert.equal(image.filter, "/FlateDecode");
    assert.equal(image.width, 2400);
    assert.equal(image.height, 1600);
    assert.ok(image.bytes.length < image.width * image.height * 3);
    const inflated = inflateSync(image.bytes);
    assert.equal(inflated.length, image.width * image.height * 3);
    assert.equal(inflated.every((byte) => byte === 255), true);
    assert.doesNotMatch(pdfBytes.toString("latin1"), /\/Length 11520000\s*>>\s*stream/);
    assertValidClassicXref(pdfBytes);
    assert.match(pdfBytes.toString("latin1"), /\/Title \(Synthetic Landscape - iLoveColoringPage\.com\)/);
    assert.equal(composition.boxesOverlap(pdf.imageBox, pdf.brandBox), false);
    assert.equal(pdf.filename, "synthetic-landscape.pdf");
    downloads.revokePreparedPrintPdf(pdf);
  } finally {
    mock.restore();
  }
});

test("PDF writer uses the selected A4 landscape profile without changing document structure", async () => {
  const mock = installCanvasMock();
  try {
    const pdf = await downloads.prepareOnePagePrintPdf({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      altText: "Synthetic landscape coloring page",
      composition: { paperKind: "a4", orientation: "landscape", artworkScalePercent: 75 },
    });
    assert.equal(pdf.ok, true);
    assert.equal(pdf.pageCount, 1);
    assert.equal(pdf.pageSize, "a4-landscape");
    assert.deepEqual(pdf.pageDimensions, { widthPt: 841.89, heightPt: 595.28 });
    const bytes = Buffer.from(await pdf.pdfBlob.arrayBuffer());
    assert.match(bytes.toString("latin1"), /\/MediaBox \[0 0 841\.89 595\.28\]/);
    assert.match(bytes.toString("latin1"), /\/Filter \/FlateDecode/);
    assertValidClassicXref(bytes);
    const expected = composition.computePrintableLayout(1200, 800, {
      paperKind: "a4",
      orientation: "landscape",
      artworkScalePercent: 75,
    });
    assert.deepEqual(pdf.imageBox, expected.imageBox);
    assert.deepEqual(pdf.artworkBox, expected.artworkBox);
    assert.equal(pdf.filename, "synthetic-landscape.pdf");
    assert.equal(pdf.metadataTitle, "Synthetic Landscape - iLoveColoringPage.com");
    downloads.revokePreparedPrintPdf(pdf);
  } finally {
    mock.restore();
  }
});

test("direct PDF download reuses preparation, stays separate from print, and releases every temporary URL", async () => {
  const source = await readFile(path.join(ROOT, "src/lib/coloring/browserDownloads.ts"), "utf8");
  const directDownloadSource = sliceBetween(source, "export async function downloadOnePagePdf", "export function revokePreparedPrintImage");
  const printSource = sliceBetween(source, "export async function printOnePagePdf", "export async function downloadOnePagePdf");
  assert.match(directDownloadSource, /prepareOnePagePrintPdf\(options\)/);
  assert.match(directDownloadSource, /triggerUrlDownload\(prepared\.pdfUrl, prepared\.filename\)/);
  assert.match(directDownloadSource, /revokePreparedPrintPdf\(prepared\)/);
  assert.doesNotMatch(directDownloadSource, /triggerPdfPrint|\.print\(|iframe|window\.open/);
  assert.match(printSource, /prepareOnePagePrintPdf\(options\)/);
  assert.match(printSource, /await triggerPdfPrint\(prepared, options\.signal\)/);

  const mock = installCanvasMock();
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await downloads.downloadOnePagePdf({
        internalSvgUrl: svgDataUrl(),
        pngPreviewUrl: null,
        title: "Synthetic Landscape",
        filenameBaseName: "Synthetic Landscape",
        altText: "Synthetic landscape coloring page",
      });
      assert.equal(result.ok, true);
      assert.equal(result.mimeType, "application/pdf");
      assert.equal(result.filename, "synthetic-landscape.pdf");
      assert.equal(result.pageCount, 1);
      assert.equal(result.pageSize, "letter-portrait");
      assert.deepEqual(result.pageDimensions, { widthPt: 612, heightPt: 792 });
      assert.equal(result.message, "PDF download started.");
      assert.equal(mock.activeObjectUrls.size, 0);
    }

    assert.equal(mock.anchors.length, 2);
    assert.equal(mock.anchors.every((anchor) => anchor.clicked && anchor.removed && !anchor.attached), true);
    assert.deepEqual(mock.anchors.map((anchor) => anchor.download), ["synthetic-landscape.pdf", "synthetic-landscape.pdf"]);
    assert.equal(mock.createdObjectUrls.length, 2);
    assert.equal(mock.revokedObjectUrls.length, 2);
    assert.deepEqual(mock.revokedObjectUrls, mock.createdObjectUrls);
    assert.equal(mock.createdElements.includes("iframe"), false);
  } finally {
    mock.restore();
  }
});

test("failed PDF download triggers clean anchors and object URLs", async () => {
  const mock = installCanvasMock({ anchorClickThrows: true });
  try {
    const result = await downloads.downloadOnePagePdf({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      altText: "Synthetic landscape coloring page",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "download-unavailable");
    assert.match(result.message, /could not start the download/i);
    assert.equal(mock.anchors.length, 1);
    assert.equal(mock.anchors[0].removed, true);
    assert.equal(mock.anchors[0].attached, false);
    assert.equal(mock.activeObjectUrls.size, 0);
    assert.deepEqual(mock.revokedObjectUrls, mock.createdObjectUrls);
  } finally {
    mock.restore();
  }
});

test("PNG and JPG draw and download failures remain typed, isolated, and leak-free", async () => {
  const drawFailure = installCanvasMock({ drawImageThrows: true });
  try {
    const result = await downloads.composePrintableRasterToBlob({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      format: "png",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "canvas-export-failed");
    assert.equal(drawFailure.createdObjectUrls.length, 0);
  } finally {
    drawFailure.restore();
  }

  const triggerFailure = installCanvasMock({ anchorClickThrows: true });
  try {
    const png = await downloads.downloadPng({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
    });
    const jpg = await downloads.downloadJpeg({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
    });
    assert.deepEqual([png.ok, png.reason], [false, "download-unavailable"]);
    assert.deepEqual([jpg.ok, jpg.reason], [false, "download-unavailable"]);
    assert.match(png.message, /PNG was created/i);
    assert.match(jpg.message, /JPG was created/i);
    assert.equal(triggerFailure.anchors.every((anchor) => anchor.removed && !anchor.attached), true);
    assert.equal(triggerFailure.activeObjectUrls.size, 0);
  } finally {
    triggerFailure.restore();
  }
});

test("PDF object URL and print handoff failures are explicit and release resources", async () => {
  const urlFailure = installCanvasMock({ objectUrlThrows: true });
  try {
    const result = await downloads.prepareOnePagePrintPdf({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      altText: "Synthetic landscape coloring page",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "pdf-generation-failed");
    assert.equal(urlFailure.activeObjectUrls.size, 0);
  } finally {
    urlFailure.restore();
  }

  const printFailure = installCanvasMock({ printWindowUnavailable: true });
  try {
    const result = await downloads.printOnePagePdf({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      altText: "Synthetic landscape coloring page",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "print-unavailable");
    assert.equal(printFailure.iframes.length, 1);
    assert.equal(printFailure.iframes[0].removed, true);
    assert.equal(printFailure.activeObjectUrls.size, 0);
  } finally {
    printFailure.restore();
  }
});

test("canonical printable actions and format descriptions communicate the actual outputs", async () => {
  const actions = await readFile(path.join(ROOT, "src/components/coloring/PrintableDetailActions.tsx"), "utf8");
  const cardActions = await readFile(path.join(ROOT, "src/components/coloring/PrintableCardActions.tsx"), "utf8");
  const menu = await readFile(path.join(ROOT, "src/components/coloring/DownloadMenu.tsx"), "utf8");
  const detail = await readFile(path.join(ROOT, "src/components/coloring/PrintableDetailPage.tsx"), "utf8");

  assert.match(actions, /downloadOnePagePdf/);
  assert.match(actions, /Preparing PDF/);
  assert.match(actions, /aria-busy=\{preparingPdf\}/);
  assert.match(actions, /role="status"[^>]*aria-live="polite"/);
  assertOrder(actions, ["Download PDF", "<PrintableCardActions", "Download image"]);
  assert.match(cardActions, /buttonClassName \|\| "button button-ghost button-small gallery-print-button"/);
  assert.match(actions, /buttonClassName="button button-subtle"/);
  assert.match(menu, /Printable page image, \$\{DEFAULT_PRINTABLE_RASTER_DIMENSIONS\.widthPx\} × \$\{DEFAULT_PRINTABLE_RASTER_DIMENSIONS\.heightPx\} px/);
  assert.match(menu, /High-resolution artwork image/);
  assert.match(menu, /recommended: true/);
  assert.match(menu, /aria-describedby/);
  assert.doesNotMatch(menu, /Download SVG|label:\s*"SVG"|downloadSvg/i);
  assert.doesNotMatch(detail, /<dt>Artwork size<\/dt>/);
  assert.match(detail, /<dt>Printable PDF<\/dt>/);
  assert.match(detail, /<dt>PDF paper size<\/dt>/);
  assert.match(detail, /<dt>PNG\/JPG output<\/dt>/);
  assert.match(detail, /<dt>WebP output<\/dt><dd>Artwork image<\/dd>/);
  assert.match(detail, /PRINTABLE_COMPOSITION\.page\.widthPx/);
  assert.match(detail, /Download PDF saves a printable US Letter document/);
  assert.match(detail, /Print prepares the same PDF and opens the device print workflow/);
});

test("filename behavior, SVG exclusion, and conversion failure remain user-safe", async () => {
  assert.equal(downloads.buildDownloadFilename("  Anime Girl: Balloon!  ", "png"), "anime-girl-balloon.png");
  assert.equal(downloads.buildDownloadFilename("", "jpeg"), "coloring-page.jpg");
  assert.deepEqual(downloads.EXPOSED_PUBLIC_DOWNLOAD_FORMATS, ["png", "jpg", "webp"]);

  const mock = installCanvasMock();
  try {
    const result = await downloads.composePrintableRasterToBlob({
      internalSvgUrl: null,
      pngPreviewUrl: null,
      title: "Unavailable",
      format: "png",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing-internal-svg");
    assert.doesNotMatch(result.message, /https?:|\.svg|stack|cors/i);
  } finally {
    mock.restore();
  }

  const menuSource = await readFile(path.join(ROOT, "src/components/coloring/DownloadMenu.tsx"), "utf8");
  assert.doesNotMatch(menuSource, /Download SVG|label:\s*"SVG"|downloadSvg/i);
});

test("PDF and raster outputs consume one shared paper-profile layout engine", async () => {
  const source = await readFile(path.join(ROOT, "src/lib/coloring/browserDownloads.ts"), "utf8");
  assert.match(source, /computePrintableLayout\(rendered\.width, rendered\.height, \{[\s\S]*?\.\.\.options\.composition,[\s\S]*?unit: "pdf"/);
  assert.match(source, /computePrintableLayout\(sourceWidth, sourceHeight, \{[\s\S]*?\.\.\.options\.composition,[\s\S]*?unit: "raster"/);
  assert.match(source, /`\/MediaBox \[0 0 \$\{formatPdfNumber\(layout\.pageBounds\.width\)\} \$\{formatPdfNumber\(layout\.pageBounds\.height\)\}\]`/);
  assert.doesNotMatch(source, /PRINT_PAGE_WIDTH_PT|PRINT_PAGE_HEIGHT_PT/);
  assert.match(source, /PRINT_BRAND_FONT_SIZE = PRINTABLE_COMPOSITION\.branding\.fontSizePt/);
  assert.match(source, /await buildPrintPdfBytes\(rendered\.canvas, layout, metadataTitle\)/);
  assert.match(source, /new CompressionStream\("deflate"\)/);
  assert.match(source, /new Response\(compressor\.readable\)\.arrayBuffer\(\)/);
  assert.match(source, /"\/Filter \/FlateDecode"/);
  assert.doesNotMatch(source, /base64|btoa\(|toDataURL\([^)]*pdf/i);
  assert.equal(source.includes("function getPrintPdfLayout"), false);
});

test("paper profiles remain internal and expose no new printable controls", async () => {
  const actions = await readFile(path.join(ROOT, "src/components/coloring/PrintableDetailActions.tsx"), "utf8");
  const preview = await readFile(path.join(ROOT, "src/components/coloring/PrintablePreviewDialog.tsx"), "utf8");
  const page = await readFile(path.join(ROOT, "src/components/coloring/PrintableDetailPage.tsx"), "utf8");
  const visibleSource = `${actions}\n${preview}\n${page}`;
  assert.doesNotMatch(visibleSource, /paperKind|artworkScalePercent|OrientationPreference/);
  assert.doesNotMatch(visibleSource, /<select|type="radio"|>A4</);
  assert.match(actions, /Download PDF/);
  assert.match(actions, /<PrintableCardActions/);
  assert.match(page, /PRINTABLE_COMPOSITION\.page\.paperSize/);
});

test("PDF compression failure stays explicit instead of emitting a raw or empty document", async () => {
  const originalCompressionStream = globalThis.CompressionStream;
  const mock = installCanvasMock();
  try {
    globalThis.CompressionStream = undefined;
    const result = await downloads.prepareOnePagePrintPdf({
      internalSvgUrl: svgDataUrl(),
      pngPreviewUrl: null,
      title: "Synthetic Landscape",
      altText: "Synthetic landscape coloring page",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "pdf-generation-failed");
    assert.match(result.message, /could not be prepared/i);
    assert.equal(mock.createdObjectUrls.length, 0);
  } finally {
    globalThis.CompressionStream = originalCompressionStream;
    mock.restore();
  }
});

function assertOpaqueWhitePage(canvas) {
  assert.equal(canvas.width, 2550);
  assert.equal(canvas.height, 3300);
  const firstFill = canvas.context.operations.find((operation) => operation.name === "fillRect");
  assert.deepEqual(firstFill, { name: "fillRect", fillStyle: "#ffffff", args: [0, 0, 2550, 3300] });
}

function svgDataUrl() {
  return `data:image/svg+xml,${encodeURIComponent(SYNTHETIC_SVG)}`;
}

function installCanvasMock(options = {}) {
  const originals = new Map();
  const canvases = [];
  const anchors = [];
  const iframes = [];
  const createdElements = [];
  const createdObjectUrls = [];
  const revokedObjectUrls = [];
  const activeObjectUrls = new Set();

  class FakeContext {
    constructor(canvas) { this.canvas = canvas; }
    operations = [];
    fillStyle = "";
    strokeStyle = "";
    lineWidth = 1;
    font = "";
    textBaseline = "alphabetic";
    save() {}
    restore() {}
    fillRect(...args) { this.operations.push({ name: "fillRect", fillStyle: this.fillStyle, args }); }
    strokeRect(...args) { this.operations.push({ name: "strokeRect", strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, args }); }
    drawImage(...args) {
      if (options.drawImageThrows) throw new Error("controlled draw failure");
      this.operations.push({ name: "drawImage", args: args.slice(1) });
    }
    fillText(...args) { this.operations.push({ name: "fillText", fillStyle: this.fillStyle, font: this.font, args }); }
    getImageData() { return { data: new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4).fill(255) }; }
  }

  class FakeCanvas {
    width = 300;
    height = 150;
    context = new FakeContext(this);
    lastMimeType = null;
    lastQuality = undefined;
    getContext() { return options.canvasContextUnavailable ? null : this.context; }
    toBlob(callback, mimeType, quality) {
      this.lastMimeType = mimeType;
      this.lastQuality = quality;
      callback(options.blobUnavailable ? null : new Blob(["synthetic-raster"], { type: mimeType }));
    }
    toDataURL(mimeType) { return `data:${mimeType};base64,fixture`; }
  }

  class FakeImage {
    naturalWidth = 1200;
    naturalHeight = 800;
    width = 1200;
    height = 800;
    onload = null;
    onerror = null;
    set src(_value) { queueMicrotask(() => this.onload?.()); }
  }

  class FakeAnchor {
    href = "";
    download = "";
    rel = "";
    attached = false;
    clicked = false;
    removed = false;
    click() {
      this.clicked = true;
      if (options.anchorClickThrows) throw new Error("controlled anchor failure");
    }
    remove() { this.removed = true; this.attached = false; }
  }

  class FakeIframe {
    title = "";
    src = "";
    style = {};
    attached = false;
    removed = false;
    onload = null;
    onerror = null;
    contentWindow = options.printWindowUnavailable ? null : {
      focus() {},
      print() {
        if (options.printThrows) throw new Error("controlled print failure");
      },
    };
    setAttribute() {}
    remove() { this.removed = true; this.attached = false; }
  }

  setGlobal("window", { setTimeout, clearTimeout });
  setGlobal("document", {
    body: {
      append(element) {
        element.attached = true;
        if (element instanceof FakeIframe) {
          queueMicrotask(() => options.iframeLoadFails ? element.onerror?.() : element.onload?.());
        }
      }
    },
    createElement(name) {
      createdElements.push(name);
      if (name === "canvas") {
        const canvas = new FakeCanvas();
        canvases.push(canvas);
        return canvas;
      }
      if (name === "a") {
        const anchor = new FakeAnchor();
        anchors.push(anchor);
        return anchor;
      }
      if (name === "iframe") {
        const iframe = new FakeIframe();
        iframes.push(iframe);
        return iframe;
      }
      throw new Error(`Unexpected element: ${name}`);
    },
  });
  setGlobal("Image", FakeImage);
  setGlobal("HTMLCanvasElement", FakeCanvas);
  setGlobal("URL", {
    createObjectURL() {
      if (options.objectUrlThrows) throw new Error("controlled object URL failure");
      const url = `blob:test-${createdObjectUrls.length + 1}`;
      createdObjectUrls.push(url);
      activeObjectUrls.add(url);
      return url;
    },
    revokeObjectURL(url) {
      revokedObjectUrls.push(url);
      activeObjectUrls.delete(url);
    },
  });

  return {
    canvases,
    anchors,
    iframes,
    createdElements,
    createdObjectUrls,
    revokedObjectUrls,
    activeObjectUrls,
    restore() {
      for (const [key, value] of originals) {
        if (value.exists) globalThis[key] = value.value;
        else delete globalThis[key];
      }
    },
  };

  function setGlobal(key, value) {
    originals.set(key, { exists: Object.hasOwn(globalThis, key), value: globalThis[key] });
    globalThis[key] = value;
  }
}

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, start);
  assert.notEqual(endIndex, -1, end);
  return source.slice(startIndex, endIndex);
}

function assertOrder(source, values) {
  let previous = -1;
  for (const value of values) {
    const index = source.indexOf(value);
    assert.ok(index > previous, `${value} must appear after the previous value`);
    previous = index;
  }
}

function parsePdfImageStream(pdfBytes) {
  const objectStart = pdfBytes.indexOf(Buffer.from("4 0 obj\n", "ascii"));
  assert.notEqual(objectStart, -1);
  const streamMarker = Buffer.from("stream\n", "ascii");
  const streamMarkerStart = pdfBytes.indexOf(streamMarker, objectStart);
  assert.notEqual(streamMarkerStart, -1);
  const dictionary = pdfBytes.subarray(objectStart, streamMarkerStart).toString("ascii");
  const length = Number(requiredMatch(dictionary, /\/Length\s+(\d+)/));
  const streamStart = streamMarkerStart + streamMarker.length;
  const bytes = pdfBytes.subarray(streamStart, streamStart + length);
  assert.equal(pdfBytes.subarray(streamStart + length, streamStart + length + 11).toString("ascii"), "\nendstream\n");
  return {
    bytes,
    width: Number(requiredMatch(dictionary, /\/Width\s+(\d+)/)),
    height: Number(requiredMatch(dictionary, /\/Height\s+(\d+)/)),
    colorSpace: requiredMatch(dictionary, /\/ColorSpace\s+(\/\w+)/),
    bitsPerComponent: Number(requiredMatch(dictionary, /\/BitsPerComponent\s+(\d+)/)),
    filter: requiredMatch(dictionary, /\/Filter\s+(\/\w+)/),
  };
}

function assertValidClassicXref(pdfBytes) {
  const source = pdfBytes.toString("latin1");
  const xrefOffset = Number(requiredMatch(source, /startxref\s+(\d+)\s+%%EOF/));
  assert.equal(pdfBytes.subarray(xrefOffset, xrefOffset + 4).toString("ascii"), "xref");
  const xref = source.slice(xrefOffset);
  const entries = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)];
  assert.equal(entries.length, 7);
  entries.forEach((entry, index) => {
    const objectId = index + 1;
    const objectOffset = Number(entry[1]);
    assert.equal(pdfBytes.subarray(objectOffset, objectOffset + `${objectId} 0 obj`.length).toString("ascii"), `${objectId} 0 obj`);
  });
}

function requiredMatch(value, pattern) {
  const match = value.match(pattern);
  assert.ok(match, pattern.toString());
  return match[1];
}

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

async function importExportModules() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-export-tests-"));
  const moduleNames = [
    "printableOutputFacts",
    "exportComposition",
    "browserDownloadSupport",
    "browserCanvasRuntime",
    "browserArtworkDownloads",
    "browserDownloads",
  ];
  for (const moduleName of moduleNames) {
    const sourceText = await readFile(path.join(ROOT, `src/lib/coloring/${moduleName}.ts`), "utf8");
    const outputText = ts.transpileModule(sourceText, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
    }).outputText.replace(/from "\.\/([^".]+)";/g, 'from "./$1.mjs";');
    await writeFile(path.join(tempRoot, `${moduleName}.mjs`), outputText, "utf8");
  }

  const compositionPath = path.join(tempRoot, "exportComposition.mjs");
  const downloadsPath = path.join(tempRoot, "browserDownloads.mjs");

  return {
    tempRoot,
    composition: await import(`${pathToFileURL(compositionPath).href}?v=${Date.now()}`),
    downloads: await import(`${pathToFileURL(downloadsPath).href}?v=${Date.now()}`),
  };
}
