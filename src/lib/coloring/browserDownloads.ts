export type PublicDownloadFormat = "png" | "jpg" | "jpeg" | "webp";
export type CanvasDownloadFormat = Exclude<PublicDownloadFormat, "png">;
export type RasterDownloadFormat = PublicDownloadFormat;

export type BrowserRasterResult =
  | {
      ok: true;
      blob: Blob;
      format: RasterDownloadFormat;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      filename: string;
      width: number;
      height: number;
      source: "internal-svg" | "png-preview";
    }
  | {
      ok: false;
      reason:
        | "unsupported-format"
        | "missing-internal-svg"
        | "missing-png-preview"
        | "browser-api-unavailable"
        | "image-load-failed"
        | "canvas-unavailable"
        | "canvas-export-failed"
        | "canvas-export-unsupported"
        | "canvas-tainted"
        | "download-unavailable"
        | "popup-blocked"
        | "pdf-generation-failed"
        | "print-unavailable";
      message: string;
    };

export type BrowserDownloadResult =
  | {
      ok: true;
      filename: string;
      format: PublicDownloadFormat;
      source: "internal-svg" | "png-preview-fallback";
      message?: string;
    }
  | Extract<BrowserRasterResult, { ok: false }>;

export type BrowserPrintResult =
  | {
      ok: true;
      source: "internal-svg" | "png-preview-fallback";
      filename?: string;
      pageCount?: 1;
      message?: string;
    }
  | Extract<BrowserRasterResult, { ok: false }>;

export type PreparedPrintImageResult =
  | {
      ok: true;
      imageUrl: string;
      source: "internal-svg" | "png-preview-fallback";
      revokeObjectUrl: boolean;
      message?: string;
    }
  | Extract<BrowserRasterResult, { ok: false }>;

export type PrintDocumentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PreparedPrintPdfResult =
  | {
      ok: true;
      pdfBlob: Blob;
      pdfUrl: string;
      filename: string;
      source: "internal-svg";
      revokeObjectUrl: true;
      pageCount: 1;
      pageSize: "letter-portrait";
      pdfByteLength: number;
      pageDimensions: {
        widthPt: number;
        heightPt: number;
      };
      artworkBox: PrintDocumentBox;
      imageBox: PrintDocumentBox;
      brandBox: PrintDocumentBox;
      brandPlacement: "bottom-frame-label";
      brandingOverlapsArtwork: false;
      appUiControlsIncluded: false;
      printableBorderCount: 1;
      metadataTitle: string;
    }
  | Extract<BrowserRasterResult, { ok: false }>;

type BrowserRasterOptions = {
  internalSvgUrl: string | null | undefined;
  title: string;
  format: RasterDownloadFormat;
  quality?: number;
  targetLongEdge?: number;
  imageLoadTimeoutMs?: number;
};

type DownloadOptions = {
  internalSvgUrl: string | null | undefined;
  pngPreviewUrl: string | null | undefined;
  title: string;
  quality?: number;
};

type PrintOptions = DownloadOptions & {
  altText: string;
};

type FormatConfig = {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  quality?: number;
};

type RenderedCanvasResult =
  | {
      ok: true;
      canvas: HTMLCanvasElement;
      width: number;
      height: number;
      source: "internal-svg";
    }
  | Extract<BrowserRasterResult, { ok: false }>;

type PrintPdfLayout = {
  outerFrame: PrintDocumentBox;
  artworkBox: PrintDocumentBox;
  imageBox: PrintDocumentBox;
  brandBox: PrintDocumentBox;
  brandKnockoutBox: PrintDocumentBox;
  brandPlacement: "bottom-frame-label";
  printableBorderCount: 1;
};

type PrintDocumentQaSnapshot = {
  pageCount: 1;
  pageSize: "letter-portrait";
  pdfByteLength: number;
  artworkBox: PrintDocumentBox;
  imageBox: PrintDocumentBox;
  brandBox: PrintDocumentBox;
  brandPlacement: "bottom-frame-label";
  brandingOverlapsArtwork: false;
  appUiControlsIncluded: false;
  printableBorderCount: 1;
  metadataTitle: string;
  source: "internal-svg";
};

declare global {
  interface Window {
    __ILCP_LAST_PRINT_DOCUMENT__?: PrintDocumentQaSnapshot;
  }
}

const PRINT_TARGET_LONG_EDGE = 2400;
const DOWNLOAD_TARGET_LONG_EDGE = 2400;
const IMAGE_LOAD_TIMEOUT_MS = 12_000;
export const PRINT_PREPARE_TIMEOUT_MS = 15_000;
export const INTERNAL_SVG_CONTENT_TYPE = "image/svg+xml";
export const PRINT_DOCUMENT_BRAND = "iLoveColoringPage.com";
const PRINT_PAGE_WIDTH_PT = 612;
const PRINT_PAGE_HEIGHT_PT = 792;
const PRINT_BRAND_FONT_SIZE = 7;

const CANVAS_FORMATS: Record<RasterDownloadFormat, FormatConfig> = {
  png: { mimeType: "image/png", extension: "png" },
  jpg: { mimeType: "image/jpeg", extension: "jpg", quality: 0.94 },
  jpeg: { mimeType: "image/jpeg", extension: "jpg", quality: 0.94 },
  webp: { mimeType: "image/webp", extension: "webp", quality: 0.92 },
};

export const VERIFIED_PUBLIC_DOWNLOAD_FORMATS: readonly PublicDownloadFormat[] = ["png"];
export const EXPOSED_PUBLIC_DOWNLOAD_FORMATS: readonly PublicDownloadFormat[] = ["png", "jpg", "webp"];
export const DEFERRED_CANVAS_DOWNLOAD_FORMATS: readonly CanvasDownloadFormat[] = [];

export function getVisibleDownloadFormats(options: { canvasConversionVerified: boolean; supportsJpeg?: boolean; supportsWebp?: boolean }) {
  if (!options.canvasConversionVerified) return VERIFIED_PUBLIC_DOWNLOAD_FORMATS;

  const formats: PublicDownloadFormat[] = ["png"];
  if (options.supportsJpeg) formats.push("jpg");
  if (options.supportsWebp) formats.push("webp");
  return formats;
}

export function getSupportedDownloadFormats() {
  if (!canUseCanvasExport()) return VERIFIED_PUBLIC_DOWNLOAD_FORMATS;

  const formats: PublicDownloadFormat[] = ["png"];
  if (supportsCanvasMimeType("image/jpeg")) formats.push("jpg");
  if (supportsCanvasMimeType("image/webp")) formats.push("webp");
  return formats;
}

export function canUseCanvasExport() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof Image !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof URL !== "undefined"
  );
}

export function buildDownloadFilename(title: string, format: PublicDownloadFormat) {
  const extension = format === "jpeg" ? "jpg" : format;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);

  return `${slug || "coloring-page"}.${extension}`;
}

export async function downloadRasterImage(options: DownloadOptions & { format: PublicDownloadFormat }): Promise<BrowserDownloadResult> {
  switch (options.format) {
    case "png":
      return downloadPng(options);
    case "jpg":
    case "jpeg":
      return downloadJpeg(options);
    case "webp":
      return downloadWebp(options);
    default:
      return failure("unsupported-format", "This download format is not supported.");
  }
}

export async function convertInternalSvgToBlob(options: BrowserRasterOptions): Promise<BrowserRasterResult> {
  const formatConfig = CANVAS_FORMATS[options.format];
  if (!formatConfig) return failure("unsupported-format", "This download format is not supported.");
  const rendered = await renderInternalSvgToCanvas({
    internalSvgUrl: options.internalSvgUrl,
    targetLongEdge: options.targetLongEdge ?? DOWNLOAD_TARGET_LONG_EDGE,
    imageLoadTimeoutMs: options.imageLoadTimeoutMs ?? IMAGE_LOAD_TIMEOUT_MS,
  });
  if (!rendered.ok) return rendered;

  try {
    const blob = await canvasToBlob(rendered.canvas, formatConfig.mimeType, options.quality ?? formatConfig.quality);
    if (!blob) return failure("canvas-export-failed", "The browser could not export this image.");

    if (blob.type && blob.type !== formatConfig.mimeType) {
      return failure("canvas-export-unsupported", "The browser fell back to another image format.");
    }

    return {
      ok: true,
      blob,
      format: options.format,
      mimeType: formatConfig.mimeType,
      filename: buildDownloadFilename(options.title, formatConfig.extension),
      width: rendered.width,
      height: rendered.height,
      source: "internal-svg",
    };
  } catch {
    return failure("canvas-tainted", "Canvas export was blocked. The asset host must allow CORS for browser conversion.");
  }
}

export async function convertPngPreviewToBrowserDownload(options: {
  pngPreviewUrl: string | null | undefined;
  title: string;
  format: CanvasDownloadFormat;
  quality?: number;
}): Promise<BrowserRasterResult> {
  if (!options.pngPreviewUrl) return failure("missing-png-preview", "PNG preview is unavailable.");
  if (!canUseCanvasExport()) return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");

  const image = await loadCorsImage(options.pngPreviewUrl, IMAGE_LOAD_TIMEOUT_MS);
  if (!image) return failure("image-load-failed", "The PNG preview could not be loaded for conversion.");

  const formatConfig = CANVAS_FORMATS[options.format];
  if (!formatConfig) return failure("unsupported-format", "This download format is not supported.");

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return failure("canvas-unavailable", "Canvas rendering is unavailable in this browser.");

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  try {
    const blob = await canvasToBlob(canvas, formatConfig.mimeType, options.quality ?? formatConfig.quality);
    if (!blob) return failure("canvas-export-failed", "The browser could not export this image format.");
    if (blob.type && blob.type !== formatConfig.mimeType) {
      return failure("canvas-export-unsupported", "The browser fell back to another image format.");
    }

    return {
      ok: true,
      blob,
      format: options.format,
      mimeType: formatConfig.mimeType,
      filename: buildDownloadFilename(options.title, formatConfig.extension),
      width: canvas.width,
      height: canvas.height,
      source: "png-preview",
    };
  } catch {
    return failure("canvas-tainted", "Canvas export was blocked. The asset host must allow CORS for browser conversion.");
  }
}

export async function downloadPng(options: DownloadOptions): Promise<BrowserDownloadResult> {
  const converted = await convertInternalSvgToBlob({
    internalSvgUrl: options.internalSvgUrl,
    title: options.title,
    format: "png",
    quality: options.quality,
    targetLongEdge: DOWNLOAD_TARGET_LONG_EDGE,
  });

  if (converted.ok) {
    downloadBlob(converted.blob, converted.filename);
    return {
      ok: true,
      filename: converted.filename,
      format: "png",
      source: "internal-svg",
    };
  }

  if (!options.pngPreviewUrl) return converted.reason === "missing-internal-svg" ? failure("missing-png-preview", "PNG preview is unavailable.") : converted;
  triggerUrlDownload(options.pngPreviewUrl, buildDownloadFilename(options.title, "png"));
  return {
    ok: true,
    filename: buildDownloadFilename(options.title, "png"),
    format: "png",
    source: "png-preview-fallback",
    message: "Downloaded the best available PNG file for this page.",
  };
}

export async function downloadJpeg(options: DownloadOptions): Promise<BrowserDownloadResult> {
  return downloadConvertedCanvasFormat(options, "jpg");
}

export async function downloadWebp(options: DownloadOptions): Promise<BrowserDownloadResult> {
  return downloadConvertedCanvasFormat(options, "webp");
}

export async function prepareHighQualityPrintImage(options: PrintOptions): Promise<PreparedPrintImageResult> {
  const converted = await convertInternalSvgToBlob({
    internalSvgUrl: options.internalSvgUrl,
    title: options.title,
    format: "png",
    targetLongEdge: PRINT_TARGET_LONG_EDGE,
    imageLoadTimeoutMs: PRINT_PREPARE_TIMEOUT_MS,
  });

  if (converted.ok) {
    const objectUrl = URL.createObjectURL(converted.blob);
    return {
      ok: true,
      imageUrl: objectUrl,
      source: "internal-svg",
      revokeObjectUrl: true,
    };
  }

  if (!options.pngPreviewUrl) {
    return converted;
  }

  return {
    ok: true,
    imageUrl: options.pngPreviewUrl,
    source: "png-preview-fallback",
    revokeObjectUrl: false,
    message: "Printing from the best available preview because the high-quality file could not be prepared.",
  };
}

export async function printFromHighQualitySource(options: PrintOptions): Promise<BrowserPrintResult> {
  const prepared = await prepareHighQualityPrintImage(options);
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    source: prepared.source,
    message: prepared.message || "Print preview is ready.",
  };
}

export async function prepareOnePagePrintPdf(options: PrintOptions): Promise<PreparedPrintPdfResult> {
  const rendered = await renderInternalSvgToCanvas({
    internalSvgUrl: options.internalSvgUrl,
    targetLongEdge: PRINT_TARGET_LONG_EDGE,
    imageLoadTimeoutMs: PRINT_PREPARE_TIMEOUT_MS,
  });
  if (!rendered.ok) return rendered;

  try {
    const layout = getPrintPdfLayout(rendered.width, rendered.height);
    const metadataTitle = buildPrintPdfTitle(options.title);
    const pdfBytes = buildPrintPdfBytes(rendered.canvas, layout, metadataTitle);
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const result: Extract<PreparedPrintPdfResult, { ok: true }> = {
      ok: true,
      pdfBlob,
      pdfUrl,
      filename: buildPrintPdfFilename(options.title),
      source: "internal-svg",
      revokeObjectUrl: true,
      pageCount: 1,
      pageSize: "letter-portrait",
      pdfByteLength: pdfBlob.size,
      pageDimensions: {
        widthPt: PRINT_PAGE_WIDTH_PT,
        heightPt: PRINT_PAGE_HEIGHT_PT,
      },
      artworkBox: layout.artworkBox,
      imageBox: layout.imageBox,
      brandBox: layout.brandBox,
      brandPlacement: layout.brandPlacement,
      brandingOverlapsArtwork: false,
      appUiControlsIncluded: false,
      printableBorderCount: layout.printableBorderCount,
      metadataTitle,
    };
    recordPrintDocumentQa(result);
    return result;
  } catch {
    return failure("pdf-generation-failed", "The printable PDF could not be prepared. Try again, or use a PNG download.");
  }
}

export async function printOnePagePdf(options: PrintOptions): Promise<BrowserPrintResult> {
  const prepared = await prepareOnePagePrintPdf(options);
  if (!prepared.ok) return prepared;

  const printStarted = triggerPdfPrint(prepared);
  if (!printStarted) {
    revokePreparedPrintPdf(prepared);
    return failure("print-unavailable", "The printable PDF was prepared, but this browser could not open the print workflow.");
  }

  return {
    ok: true,
    source: prepared.source,
    filename: prepared.filename,
    pageCount: prepared.pageCount,
    message: "Printable PDF is ready.",
  };
}

export function revokePreparedPrintImage(prepared: PreparedPrintImageResult | null | undefined) {
  if (!prepared?.ok || !prepared.revokeObjectUrl || typeof URL === "undefined") return;
  URL.revokeObjectURL(prepared.imageUrl);
}

export function revokePreparedPrintPdf(prepared: PreparedPrintPdfResult | null | undefined) {
  if (!prepared?.ok || !prepared.revokeObjectUrl || typeof URL === "undefined") return;
  URL.revokeObjectURL(prepared.pdfUrl);
}

async function downloadConvertedCanvasFormat(options: DownloadOptions, format: CanvasDownloadFormat): Promise<BrowserDownloadResult> {
  const converted = await convertInternalSvgToBlob({
    internalSvgUrl: options.internalSvgUrl,
    title: options.title,
    format,
    quality: options.quality,
    targetLongEdge: DOWNLOAD_TARGET_LONG_EDGE,
  });

  if (!converted.ok) return converted;
  downloadBlob(converted.blob, converted.filename);
  return {
    ok: true,
    filename: converted.filename,
    format,
    source: "internal-svg",
  };
}

async function renderInternalSvgToCanvas(options: {
  internalSvgUrl: string | null | undefined;
  targetLongEdge: number;
  imageLoadTimeoutMs: number;
}): Promise<RenderedCanvasResult> {
  if (!options.internalSvgUrl) return failure("missing-internal-svg", "The internal SVG source is unavailable for high-quality conversion.");
  if (!canUseCanvasExport()) return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");

  const image = await loadCorsImage(options.internalSvgUrl, options.imageLoadTimeoutMs);
  if (!image) return failure("image-load-failed", "The internal SVG source could not be loaded for conversion.");

  const sourceWidth = image.naturalWidth || image.width || 800;
  const sourceHeight = image.naturalHeight || image.height || 1200;
  const dimensions = getTargetDimensions(sourceWidth, sourceHeight, options.targetLongEdge);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return failure("canvas-unavailable", "Canvas rendering is unavailable in this browser.");

  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    ok: true,
    canvas,
    width: canvas.width,
    height: canvas.height,
    source: "internal-svg",
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function triggerUrlDownload(url: string, filename: string) {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

function triggerPdfPrint(prepared: Extract<PreparedPrintPdfResult, { ok: true }>) {
  if (typeof document === "undefined" || typeof window === "undefined") return false;

  const frame = document.createElement("iframe");
  let cleanedUp = false;
  let printed = false;

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    frame.remove();
    URL.revokeObjectURL(prepared.pdfUrl);
  }

  frame.title = "Printable coloring page PDF";
  frame.src = prepared.pdfUrl;
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.setAttribute("aria-hidden", "true");
  frame.onload = () => {
    window.setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        printed = true;
      } finally {
        window.setTimeout(cleanup, printed ? 90_000 : 10_000);
      }
    }, 120);
  };

  document.body.append(frame);
  window.setTimeout(cleanup, 120_000);
  return true;
}

function supportsCanvasMimeType(mimeType: "image/png" | "image/jpeg" | "image/webp") {
  if (mimeType === "image/png") return true;
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`);
  } catch {
    return false;
  }
}

function loadCorsImage(imageUrl: string, timeoutMs = IMAGE_LOAD_TIMEOUT_MS) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(null);
    }, timeoutMs);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    image.src = imageUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: "image/png" | "image/jpeg" | "image/webp", quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function getTargetDimensions(sourceWidth: number, sourceHeight: number, targetLongEdge: number) {
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = longEdge > 0 ? Math.max(1, targetLongEdge / longEdge) : 1;
  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  };
}

function buildPrintPdfFilename(title: string) {
  return buildDownloadFilename(title, "png").replace(/\.png$/i, ".pdf");
}

function buildPrintPdfTitle(title: string) {
  const cleanTitle = title.trim() || "Coloring Page";
  return `${cleanTitle} - ${PRINT_DOCUMENT_BRAND}`;
}

function getPrintPdfLayout(imageWidth: number, imageHeight: number): PrintPdfLayout {
  const outerFrame = {
    x: 10,
    y: 10,
    width: PRINT_PAGE_WIDTH_PT - 20,
    height: PRINT_PAGE_HEIGHT_PT - 20,
  };
  const safePadding = 5;
  const brandTextWidth = estimatePdfTextWidth(PRINT_DOCUMENT_BRAND, PRINT_BRAND_FONT_SIZE);
  const brandKnockoutPaddingX = 4;
  const brandKnockoutPaddingY = 1;
  const brandKnockoutBox = {
    x: roundPdfNumber(outerFrame.x + (outerFrame.width - brandTextWidth) / 2 - brandKnockoutPaddingX),
    y: roundPdfNumber(outerFrame.y - PRINT_BRAND_FONT_SIZE * 0.55 - brandKnockoutPaddingY),
    width: roundPdfNumber(brandTextWidth + brandKnockoutPaddingX * 2),
    height: roundPdfNumber(PRINT_BRAND_FONT_SIZE + brandKnockoutPaddingY * 2),
  };
  const artworkBox = {
    x: outerFrame.x + safePadding,
    y: roundPdfNumber(Math.max(outerFrame.y + safePadding, brandKnockoutBox.y + brandKnockoutBox.height + 0.5)),
    width: outerFrame.width - safePadding * 2,
    height: 0,
  };
  artworkBox.height = roundPdfNumber(outerFrame.y + outerFrame.height - safePadding - artworkBox.y);
  const imageScale = Math.min(artworkBox.width / imageWidth, artworkBox.height / imageHeight);
  const imageBox = {
    width: roundPdfNumber(imageWidth * imageScale),
    height: roundPdfNumber(imageHeight * imageScale),
    x: roundPdfNumber(artworkBox.x + (artworkBox.width - imageWidth * imageScale) / 2),
    y: roundPdfNumber(artworkBox.y + (artworkBox.height - imageHeight * imageScale) / 2),
  };

  return {
    outerFrame,
    artworkBox,
    imageBox,
    brandBox: {
      x: roundPdfNumber(outerFrame.x + (outerFrame.width - brandTextWidth) / 2),
      y: roundPdfNumber(outerFrame.y - PRINT_BRAND_FONT_SIZE * 0.34),
      width: roundPdfNumber(brandTextWidth),
      height: PRINT_BRAND_FONT_SIZE,
    },
    brandKnockoutBox,
    brandPlacement: "bottom-frame-label",
    printableBorderCount: 1,
  };
}

function buildPrintPdfBytes(canvas: HTMLCanvasElement, layout: PrintPdfLayout, metadataTitle: string) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable.");

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgbBytes = rgbaToRgbBytes(imageData.data);
  const contentBytes = new TextEncoder().encode(buildPrintPdfContentStream(layout));
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  function appendAscii(value: string) {
    appendBytes(encoder.encode(value));
  }

  function appendBytes(bytes: Uint8Array) {
    chunks.push(bytes);
    byteLength += bytes.length;
  }

  function startObject(id: number) {
    offsets[id] = byteLength;
    appendAscii(`${id} 0 obj\n`);
  }

  appendAscii("%PDF-1.4\n");

  startObject(1);
  appendAscii("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObject(2);
  appendAscii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  startObject(3);
  appendAscii(
    [
      "<< /Type /Page",
      "/Parent 2 0 R",
      `/MediaBox [0 0 ${PRINT_PAGE_WIDTH_PT} ${PRINT_PAGE_HEIGHT_PT}]`,
      "/Resources << /XObject << /Im0 4 0 R >> /Font << /F1 5 0 R >> >>",
      "/Contents 6 0 R",
      ">>\nendobj\n",
    ].join(" "),
  );

  startObject(4);
  appendAscii(
    [
      "<< /Type /XObject",
      "/Subtype /Image",
      `/Width ${canvas.width}`,
      `/Height ${canvas.height}`,
      "/ColorSpace /DeviceRGB",
      "/BitsPerComponent 8",
      `/Length ${rgbBytes.length}`,
      ">>\nstream\n",
    ].join(" "),
  );
  appendBytes(rgbBytes);
  appendAscii("\nendstream\nendobj\n");

  startObject(5);
  appendAscii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  startObject(6);
  appendAscii(`<< /Length ${contentBytes.length} >>\nstream\n`);
  appendBytes(contentBytes);
  appendAscii("\nendstream\nendobj\n");

  startObject(7);
  appendAscii(`<< /Title (${escapePdfText(metadataTitle)}) /Creator (${escapePdfText(PRINT_DOCUMENT_BRAND)}) >>\nendobj\n`);

  const xrefOffset = byteLength;
  appendAscii("xref\n0 8\n0000000000 65535 f \n");
  for (let id = 1; id <= 7; id += 1) {
    appendAscii(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  appendAscii(`trailer\n<< /Size 8 /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function buildPrintPdfContentStream(layout: PrintPdfLayout) {
  return [
    "q",
    "0.76 0.73 0.82 RG",
    "0.55 w",
    `${boxCommand(layout.outerFrame)} S`,
    "Q",
    "q",
    `${formatPdfNumber(layout.imageBox.width)} 0 0 ${formatPdfNumber(layout.imageBox.height)} ${formatPdfNumber(layout.imageBox.x)} ${formatPdfNumber(layout.imageBox.y)} cm`,
    "/Im0 Do",
    "Q",
    "q",
    "1 1 1 rg",
    `${boxCommand(layout.brandKnockoutBox)} f`,
    "Q",
    "BT",
    `/F1 ${PRINT_BRAND_FONT_SIZE} Tf`,
    "0.42 0.29 0.50 rg",
    `${formatPdfNumber(layout.brandBox.x)} ${formatPdfNumber(layout.brandBox.y)} Td`,
    `(${escapePdfText(PRINT_DOCUMENT_BRAND)}) Tj`,
    "ET",
  ].join("\n");
}

function boxCommand(box: PrintDocumentBox) {
  return `${formatPdfNumber(box.x)} ${formatPdfNumber(box.y)} ${formatPdfNumber(box.width)} ${formatPdfNumber(box.height)} re`;
}

function rgbaToRgbBytes(rgba: Uint8ClampedArray) {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    const alpha = rgba[source + 3] / 255;
    rgb[target] = Math.round(rgba[source] * alpha + 255 * (1 - alpha));
    rgb[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * (1 - alpha));
    rgb[target + 2] = Math.round(rgba[source + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatPdfNumber(value: number) {
  return roundPdfNumber(value).toFixed(2).replace(/\.00$/, "");
}

function roundPdfNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function estimatePdfTextWidth(value: string, fontSize: number) {
  return roundPdfNumber(value.length * fontSize * 0.52);
}

function recordPrintDocumentQa(prepared: Extract<PreparedPrintPdfResult, { ok: true }>) {
  if (typeof window === "undefined") return;
  window.__ILCP_LAST_PRINT_DOCUMENT__ = {
    pageCount: prepared.pageCount,
    pageSize: prepared.pageSize,
    pdfByteLength: prepared.pdfByteLength,
    artworkBox: prepared.artworkBox,
    imageBox: prepared.imageBox,
    brandBox: prepared.brandBox,
    brandPlacement: prepared.brandPlacement,
    brandingOverlapsArtwork: prepared.brandingOverlapsArtwork,
    appUiControlsIncluded: prepared.appUiControlsIncluded,
    printableBorderCount: prepared.printableBorderCount,
    metadataTitle: prepared.metadataTitle,
    source: prepared.source,
  };
}

function failure(reason: Extract<BrowserRasterResult, { ok: false }>["reason"], message: string): Extract<BrowserRasterResult, { ok: false }> {
  return {
    ok: false,
    reason,
    message,
  };
}
