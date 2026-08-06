import {
  canvasTopFromBottomOrigin,
  computePrintableLayout,
  pdfPointToRasterPixels,
  PRINTABLE_COMPOSITION,
  type PrintableLayout,
  type PrintablePageProfile,
  type PrintableProfileRequest,
} from "./exportComposition";

export type PublicDownloadFormat = "png" | "jpg" | "jpeg" | "webp";
export type DownloadFileFormat = PublicDownloadFormat | "pdf";
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

export type BrowserPdfDownloadResult =
  | {
      ok: true;
      filename: string;
      mimeType: "application/pdf";
      source: "internal-svg";
      pageCount: 1;
      pageSize: PrintablePageProfile["id"];
      pageDimensions: {
        widthPt: number;
        heightPt: number;
      };
      message: string;
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
      pageSize: PrintablePageProfile["id"];
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
  filenameBaseName?: string;
  format: RasterDownloadFormat;
  quality?: number;
  targetLongEdge?: number;
  imageLoadTimeoutMs?: number;
};

type DownloadOptions = {
  internalSvgUrl: string | null | undefined;
  pngPreviewUrl: string | null | undefined;
  title: string;
  filenameBaseName?: string;
  quality?: number;
  composition?: PrintableProfileRequest;
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

type PrintPdfLayout = PrintableLayout;

type PrintDocumentQaSnapshot = {
  pageCount: 1;
  pageSize: PrintablePageProfile["id"];
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
export const PRINT_DOCUMENT_BRAND = PRINTABLE_COMPOSITION.branding.text;
const PRINT_BRAND_FONT_SIZE = PRINTABLE_COMPOSITION.branding.fontSizePt;

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

export function buildDownloadFilename(title: string, format: DownloadFileFormat) {
  const extension = format === "jpeg" ? "jpg" : format;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);

  return `${slug || "coloring-page"}.${extension}`;
}

export function buildPrintablePageFilename(
  title: string,
  format: Exclude<DownloadFileFormat, "webp">,
  layout: PrintableLayout,
) {
  const filename = buildDownloadFilename(title, format);
  const suffixParts: string[] = [];

  if (layout.page.paperKind === "a4") suffixParts.push("a4");
  if (layout.requestedOrientation === "auto") {
    suffixParts.push("auto", layout.page.orientation);
  } else if (layout.page.orientation === "landscape") {
    suffixParts.push("landscape");
  }
  if (layout.artworkScalePercent !== 100) suffixParts.push(String(layout.artworkScalePercent));
  if (suffixParts.length === 0) return filename;

  const extension = filename.slice(filename.lastIndexOf("."));
  const stem = filename.slice(0, -extension.length);
  const suffix = `-${suffixParts.join("-")}`;
  return `${stem.endsWith(suffix) ? stem : `${stem}${suffix}`}${extension}`;
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
      filename: buildDownloadFilename(options.filenameBaseName || options.title, formatConfig.extension),
      width: rendered.width,
      height: rendered.height,
      source: "internal-svg",
    };
  } catch {
    return failure("canvas-tainted", "The browser could not prepare this image. Please try again.");
  }
}

export async function composePrintableRasterToBlob(options: DownloadOptions & { format: "png" | "jpg" | "jpeg" }): Promise<BrowserRasterResult> {
  if (!canUseCanvasExport()) return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");
  const formatConfig = CANVAS_FORMATS[options.format];
  if (!formatConfig) return failure("unsupported-format", "This download format is not supported.");

  let image: HTMLImageElement | null = null;
  let source: "internal-svg" | "png-preview" = "internal-svg";
  if (options.internalSvgUrl) image = await loadCorsImage(options.internalSvgUrl, IMAGE_LOAD_TIMEOUT_MS);
  if (!image && options.pngPreviewUrl) {
    source = "png-preview";
    image = await loadCorsImage(options.pngPreviewUrl, IMAGE_LOAD_TIMEOUT_MS);
  }
  if (!image) {
    return failure(
      options.internalSvgUrl ? "image-load-failed" : "missing-internal-svg",
      "The printable page could not be prepared from the available artwork.",
    );
  }

  const sourceWidth = image.naturalWidth || image.width || 800;
  const sourceHeight = image.naturalHeight || image.height || 1200;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return failure("canvas-unavailable", "Canvas rendering is unavailable in this browser.");

  const layout = computePrintableLayout(sourceWidth, sourceHeight, {
    ...options.composition,
    unit: "raster",
  });
  canvas.width = layout.page.widthPx;
  canvas.height = layout.page.heightPx;
  drawPrintableRasterComposition(context, canvas, image, layout);

  try {
    const blob = await canvasToBlob(canvas, formatConfig.mimeType, options.quality ?? formatConfig.quality);
    if (!blob) return failure("canvas-export-failed", "The browser could not export this printable page.");
    if (blob.type && blob.type !== formatConfig.mimeType) {
      return failure("canvas-export-unsupported", "The browser fell back to another image format.");
    }
    return {
      ok: true,
      blob,
      format: options.format,
      mimeType: formatConfig.mimeType,
      filename: buildPrintablePageFilename(options.filenameBaseName || options.title, options.format, layout),
      width: canvas.width,
      height: canvas.height,
      source,
    };
  } catch {
    return failure("canvas-tainted", "The browser could not prepare this image. Please try again.");
  }
}

export async function convertPngPreviewToBrowserDownload(options: {
  pngPreviewUrl: string | null | undefined;
  title: string;
  filenameBaseName?: string;
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
      filename: buildDownloadFilename(options.filenameBaseName || options.title, formatConfig.extension),
      width: canvas.width,
      height: canvas.height,
      source: "png-preview",
    };
  } catch {
    return failure("canvas-tainted", "The browser could not prepare this image. Please try again.");
  }
}

export async function downloadPng(options: DownloadOptions): Promise<BrowserDownloadResult> {
  const converted = await composePrintableRasterToBlob({ ...options, format: "png" });

  if (converted.ok) {
    downloadBlob(converted.blob, converted.filename);
    return {
      ok: true,
      filename: converted.filename,
      format: "png",
      source: converted.source === "internal-svg" ? "internal-svg" : "png-preview-fallback",
    };
  }
  return converted;
}

export async function downloadJpeg(options: DownloadOptions): Promise<BrowserDownloadResult> {
  const converted = await composePrintableRasterToBlob({ ...options, format: "jpg" });
  if (!converted.ok) return converted;
  downloadBlob(converted.blob, converted.filename);
  return {
    ok: true,
    filename: converted.filename,
    format: "jpg",
    source: converted.source === "internal-svg" ? "internal-svg" : "png-preview-fallback",
  };
}

export async function downloadWebp(options: DownloadOptions): Promise<BrowserDownloadResult> {
  return downloadConvertedCanvasFormat(options, "webp");
}

export async function prepareHighQualityPrintImage(options: PrintOptions): Promise<PreparedPrintImageResult> {
  const converted = await convertInternalSvgToBlob({
    internalSvgUrl: options.internalSvgUrl,
    title: options.title,
    filenameBaseName: options.filenameBaseName,
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
    const layout = computePrintableLayout(rendered.width, rendered.height, {
      ...options.composition,
      unit: "pdf",
    });
    const metadataTitle = buildPrintPdfTitle(options.title);
    const pdfBytes = await buildPrintPdfBytes(rendered.canvas, layout, metadataTitle);
    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const result: Extract<PreparedPrintPdfResult, { ok: true }> = {
      ok: true,
      pdfBlob,
      pdfUrl,
      filename: buildPrintablePageFilename(options.filenameBaseName || options.title, "pdf", layout),
      source: "internal-svg",
      revokeObjectUrl: true,
      pageCount: 1,
      pageSize: layout.page.id,
      pdfByteLength: pdfBlob.size,
      pageDimensions: {
        widthPt: layout.page.widthPt,
        heightPt: layout.page.heightPt,
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

export async function downloadOnePagePdf(options: PrintOptions): Promise<BrowserPdfDownloadResult> {
  const prepared = await prepareOnePagePrintPdf(options);
  if (!prepared.ok) return prepared;

  try {
    if (!triggerUrlDownload(prepared.pdfUrl, prepared.filename)) {
      return failure("download-unavailable", "The printable PDF was prepared, but this browser could not start the download.");
    }

    return {
      ok: true,
      filename: prepared.filename,
      mimeType: "application/pdf",
      source: prepared.source,
      pageCount: prepared.pageCount,
      pageSize: prepared.pageSize,
      pageDimensions: prepared.pageDimensions,
      message: "PDF download started.",
    };
  } finally {
    revokePreparedPrintPdf(prepared);
  }
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
    filenameBaseName: options.filenameBaseName,
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
  if (!options.internalSvgUrl) return failure("missing-internal-svg", "The high-quality artwork is unavailable.");
  if (!canUseCanvasExport()) return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");

  const image = await loadCorsImage(options.internalSvgUrl, options.imageLoadTimeoutMs);
  if (!image) return failure("image-load-failed", "The high-quality artwork could not be loaded. Please try again.");

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
  if (typeof document === "undefined") return false;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  return true;
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

function drawPrintableRasterComposition(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  layout: PrintableLayout,
) {
  context.save();
  context.fillStyle = PRINTABLE_COMPOSITION.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const imageTop = canvasTopFromBottomOrigin(layout.imageBox, canvas.height);
  context.drawImage(image, layout.imageBox.x, imageTop, layout.imageBox.width, layout.imageBox.height);

  context.strokeStyle = PRINTABLE_COMPOSITION.frame.color;
  context.lineWidth = pdfPointToRasterPixels(PRINTABLE_COMPOSITION.frame.lineWidthPt, "x", layout.page);
  context.strokeRect(
    layout.outerFrame.x,
    canvasTopFromBottomOrigin(layout.outerFrame, canvas.height),
    layout.outerFrame.width,
    layout.outerFrame.height,
  );

  context.fillStyle = PRINTABLE_COMPOSITION.background;
  context.fillRect(
    layout.brandKnockoutBox.x,
    canvasTopFromBottomOrigin(layout.brandKnockoutBox, canvas.height),
    layout.brandKnockoutBox.width,
    layout.brandKnockoutBox.height,
  );
  context.fillStyle = PRINTABLE_COMPOSITION.branding.color;
  context.font = `${pdfPointToRasterPixels(PRINTABLE_COMPOSITION.branding.fontSizePt, "y", layout.page)}px ${PRINTABLE_COMPOSITION.branding.fontFamily}`;
  context.textBaseline = "alphabetic";
  context.fillText(
    PRINTABLE_COMPOSITION.branding.text,
    layout.brandBox.x,
    canvas.height - layout.brandBox.y,
  );
  context.restore();
}

function buildPrintPdfTitle(title: string) {
  const cleanTitle = title.trim() || "Coloring Page";
  return `${cleanTitle} - ${PRINT_DOCUMENT_BRAND}`;
}

async function buildPrintPdfBytes(canvas: HTMLCanvasElement, layout: PrintPdfLayout, metadataTitle: string) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable.");

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgbBytes = rgbaToRgbBytes(imageData.data);
  const compressedRgbBytes = await deflatePdfImageBytes(rgbBytes);
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
      `/MediaBox [0 0 ${formatPdfNumber(layout.pageBounds.width)} ${formatPdfNumber(layout.pageBounds.height)}]`,
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
      "/Filter /FlateDecode",
      `/Length ${compressedRgbBytes.length}`,
      ">>\nstream\n",
    ].join(" "),
  );
  appendBytes(compressedRgbBytes);
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

async function deflatePdfImageBytes(bytes: Uint8Array<ArrayBuffer>) {
  if (typeof CompressionStream === "undefined") {
    throw new Error("PDF compression is unavailable in this browser.");
  }

  const compressor = new CompressionStream("deflate");
  const writer = compressor.writable.getWriter();
  const compressedBytesPromise = new Response(compressor.readable).arrayBuffer();
  await writer.write(bytes);
  await writer.close();
  const compressedBytes = new Uint8Array(await compressedBytesPromise);
  if (compressedBytes.length === 0) throw new Error("PDF compression returned an empty image stream.");
  return compressedBytes;
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

function rgbaToRgbBytes(rgba: Uint8ClampedArray): Uint8Array<ArrayBuffer> {
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
