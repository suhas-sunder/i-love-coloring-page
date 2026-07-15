import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

const ROOT = process.cwd();
const modules = await importExportModules();
const composition = modules.composition;
const downloads = modules.downloads;
const SYNTHETIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="white"/><path d="M40 400H1160" fill="none" stroke="black" stroke-width="8"/></svg>`;

test.after(async () => {
  await rm(modules.tempRoot, { recursive: true, force: true });
});

test("shared composition constants preserve Letter PDF and 300 DPI raster output", () => {
  const spec = composition.PRINTABLE_COMPOSITION;
  assert.equal(spec.page.widthPt, 612);
  assert.equal(spec.page.heightPt, 792);
  assert.equal(spec.page.widthPx, 2550);
  assert.equal(spec.page.heightPx, 3300);
  assert.equal(spec.page.rasterDpi, 300);
  assert.equal(spec.frame.insetPt, 10);
  assert.equal(spec.safePaddingPt, 5);
  assert.equal(spec.branding.text, "iLoveColoringPage.com");
  assert.equal(spec.branding.fontSizePt, 7);
  assert.equal(spec.jpegQuality, 0.94);
  assert.equal(spec.page.widthPt / spec.page.heightPt, spec.page.widthPx / spec.page.heightPx);
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
    assert.equal(composition.boxesOverlap(pdf.imageBox, pdf.brandBox), false);
    assert.equal(pdf.filename, "synthetic-landscape.pdf");
    downloads.revokePreparedPrintPdf(pdf);
  } finally {
    mock.restore();
  }
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

test("PDF output consumes the shared layout and preserves its existing geometry constants", async () => {
  const source = await readFile(path.join(ROOT, "src/lib/coloring/browserDownloads.ts"), "utf8");
  assert.match(source, /computePrintableLayout\(rendered\.width, rendered\.height, "pdf"\)/);
  assert.match(source, /PRINT_PAGE_WIDTH_PT = PRINTABLE_COMPOSITION\.page\.widthPt/);
  assert.match(source, /PRINT_PAGE_HEIGHT_PT = PRINTABLE_COMPOSITION\.page\.heightPt/);
  assert.match(source, /PRINT_BRAND_FONT_SIZE = PRINTABLE_COMPOSITION\.branding\.fontSizePt/);
  assert.equal(source.includes("function getPrintPdfLayout"), false);
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

function installCanvasMock() {
  const originals = new Map();
  const canvases = [];

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
    drawImage(...args) { this.operations.push({ name: "drawImage", args: args.slice(1) }); }
    fillText(...args) { this.operations.push({ name: "fillText", fillStyle: this.fillStyle, font: this.font, args }); }
    getImageData() { return { data: new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4).fill(255) }; }
  }

  class FakeCanvas {
    width = 300;
    height = 150;
    context = new FakeContext(this);
    lastMimeType = null;
    lastQuality = undefined;
    getContext() { return this.context; }
    toBlob(callback, mimeType, quality) {
      this.lastMimeType = mimeType;
      this.lastQuality = quality;
      callback(new Blob(["synthetic-raster"], { type: mimeType }));
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

  setGlobal("window", { setTimeout, clearTimeout });
  setGlobal("document", {
    createElement(name) {
      if (name !== "canvas") throw new Error(`Unexpected element: ${name}`);
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
  });
  setGlobal("Image", FakeImage);
  setGlobal("HTMLCanvasElement", FakeCanvas);

  return {
    canvases,
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

async function importExportModules() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ilcp-export-tests-"));
  const compositionSource = await readFile(path.join(ROOT, "src/lib/coloring/exportComposition.ts"), "utf8");
  const compositionOutput = ts.transpileModule(compositionSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const compositionPath = path.join(tempRoot, "exportComposition.mjs");
  await writeFile(compositionPath, compositionOutput, "utf8");

  const downloadsSource = (await readFile(path.join(ROOT, "src/lib/coloring/browserDownloads.ts"), "utf8"))
    .replace('from "./exportComposition";', `from "${pathToFileURL(compositionPath).href}";`);
  const downloadsOutput = ts.transpileModule(downloadsSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText;
  const downloadsPath = path.join(tempRoot, "browserDownloads.mjs");
  await writeFile(downloadsPath, downloadsOutput, "utf8");

  return {
    tempRoot,
    composition: await import(`${pathToFileURL(compositionPath).href}?v=${Date.now()}`),
    downloads: await import(`${pathToFileURL(downloadsPath).href}?v=${Date.now()}`),
  };
}
