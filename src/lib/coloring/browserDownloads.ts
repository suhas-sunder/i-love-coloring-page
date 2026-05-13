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
        | "popup-blocked";
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
      message?: string;
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

const PRINT_TARGET_LONG_EDGE = 2400;
const DOWNLOAD_TARGET_LONG_EDGE = 2400;
const IMAGE_LOAD_TIMEOUT_MS = 12_000;
const PRINT_PREPARE_TIMEOUT_MS = 15_000;
export const INTERNAL_SVG_CONTENT_TYPE = "image/svg+xml";

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
  if (!options.internalSvgUrl) return failure("missing-internal-svg", "The internal SVG source is unavailable for high-quality conversion.");
  if (!canUseCanvasExport()) return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");

  const image = await loadCorsImage(options.internalSvgUrl, options.imageLoadTimeoutMs ?? IMAGE_LOAD_TIMEOUT_MS);
  if (!image) return failure("image-load-failed", "The internal SVG source could not be loaded for conversion.");

  const sourceWidth = image.naturalWidth || image.width || 800;
  const sourceHeight = image.naturalHeight || image.height || 1200;
  const dimensions = getTargetDimensions(sourceWidth, sourceHeight, options.targetLongEdge ?? DOWNLOAD_TARGET_LONG_EDGE);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return failure("canvas-unavailable", "Canvas rendering is unavailable in this browser.");

  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  try {
    const blob = await canvasToBlob(canvas, formatConfig.mimeType, options.quality ?? formatConfig.quality);
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
      width: canvas.width,
      height: canvas.height,
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

export async function printFromHighQualitySource(options: PrintOptions): Promise<BrowserPrintResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return failure("browser-api-unavailable", "Browser print APIs are unavailable.");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) return failure("popup-blocked", "The browser blocked the print window.");
  printWindow.opener = null;
  writePreparingDocument(printWindow, options.title);

  const converted = await convertInternalSvgToBlob({
    internalSvgUrl: options.internalSvgUrl,
    title: options.title,
    format: "png",
    targetLongEdge: PRINT_TARGET_LONG_EDGE,
    imageLoadTimeoutMs: PRINT_PREPARE_TIMEOUT_MS,
  });

  if (converted.ok) {
    const objectUrl = URL.createObjectURL(converted.blob);
    writePrintDocument(printWindow, {
      title: options.title,
      altText: options.altText,
      imageUrl: objectUrl,
      source: "internal-svg",
      revokeObjectUrl: true,
    });
    return {
      ok: true,
      source: "internal-svg",
    };
  }

  if (!options.pngPreviewUrl) {
    writePrintFailureDocument(printWindow, options.title);
    return converted;
  }
  writePrintDocument(printWindow, {
    title: options.title,
    altText: options.altText,
    imageUrl: options.pngPreviewUrl,
    source: "png-preview-fallback",
    revokeObjectUrl: false,
  });

  return {
    ok: true,
    source: "png-preview-fallback",
    message: "Printing from the best available preview because the high-quality file could not be prepared.",
  };
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

function writePreparingDocument(printWindow: Window, title: string) {
  const escapedTitle = escapeHtml(title);
  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapedTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: white;
            color: rgb(38 31 47);
            font-family: Arial, sans-serif;
            padding: 2rem;
            text-align: center;
          }
          .print-prep-card {
            display: grid;
            gap: 0.75rem;
            max-width: 28rem;
          }
          .print-brand {
            color: rgb(107 74 127);
            font-size: 0.78rem;
            font-weight: 800;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          h1 {
            margin: 0;
            font-family: Georgia, serif;
            font-size: clamp(1.5rem, 4vw, 2.25rem);
            line-height: 1.1;
          }
          p {
            margin: 0;
            color: rgb(92 86 101);
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <main class="print-prep-card" aria-live="polite">
          <p class="print-brand">I Love Coloring Page</p>
          <h1>${escapedTitle}</h1>
          <p>Preparing print file...</p>
        </main>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function writePrintFailureDocument(printWindow: Window, title: string) {
  const escapedTitle = escapeHtml(title);
  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapedTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: white;
            color: rgb(38 31 47);
            font-family: Arial, sans-serif;
            padding: 2rem;
            text-align: center;
          }
          main {
            display: grid;
            gap: 0.75rem;
            max-width: 28rem;
          }
          .print-brand {
            color: rgb(107 74 127);
            font-size: 0.78rem;
            font-weight: 800;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          h1 {
            margin: 0;
            font-family: Georgia, serif;
            font-size: 1.75rem;
            line-height: 1.15;
          }
          p {
            margin: 0;
            color: rgb(92 86 101);
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <main>
          <p class="print-brand">I Love Coloring Page</p>
          <h1>${escapedTitle}</h1>
          <p>Print file could not be prepared. Please try a download instead.</p>
        </main>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function writePrintDocument(
  printWindow: Window,
  options: {
    title: string;
    altText: string;
    imageUrl: string;
    source: "internal-svg" | "png-preview-fallback";
    revokeObjectUrl: boolean;
  },
) {
  const escapedTitle = escapeHtml(options.title);
  const escapedAlt = escapeHtml(options.altText);
  const escapedImageUrl = escapeAttribute(options.imageUrl);
  const escapedFailureMessage = escapeHtml("Print file could not be prepared. Please try a download instead.");
  const revokeUrl = JSON.stringify(options.imageUrl);
  const revokeScript = options.revokeObjectUrl
    ? `window.addEventListener("afterprint", function(){ setTimeout(function(){ URL.revokeObjectURL(${revokeUrl}); }, 500); });`
    : "";

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapedTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page { size: auto; margin: 0.35in; }
          * { box-sizing: border-box; }
          html, body { min-height: 100%; }
          body {
            margin: 0;
            background: white;
            color: rgb(38 31 47);
            font-family: Arial, sans-serif;
          }
          .print-shell {
            display: grid;
            min-height: 100vh;
            place-items: center;
            padding: 24px;
          }
          .screen-only {
            display: grid;
            gap: 0.35rem;
            margin-bottom: 1rem;
            text-align: center;
          }
          .screen-only strong {
            color: rgb(38 31 47);
            font-family: Georgia, serif;
            font-size: 1.2rem;
            line-height: 1.2;
          }
          .screen-only span {
            color: rgb(92 86 101);
            font-size: 0.9rem;
            line-height: 1.4;
          }
          .print-page {
            width: min(100%, 8in);
            min-height: calc(100vh - 48px);
            display: grid;
            grid-template-rows: minmax(0, 1fr) auto;
            gap: 0.16in;
          }
          .print-artwork {
            display: grid;
            min-height: 0;
            place-items: center;
          }
          .print-artwork-frame {
            width: 100%;
            height: 100%;
            display: grid;
            place-items: center;
            border: 1px solid rgb(221 216 229);
            padding: 0.12in;
          }
          img {
            display: block;
            max-width: 100%;
            max-height: calc(100vh - 1.15in);
            object-fit: contain;
          }
          .print-brand {
            margin: 0;
            color: rgb(107 74 127);
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0;
            line-height: 1.2;
            text-align: center;
            text-transform: uppercase;
          }
          @media print {
            html,
            body {
              width: 100%;
              min-height: 100%;
            }
            body {
              background: white;
            }
            .screen-only {
              display: none !important;
            }
            .print-shell {
              min-height: 100vh;
              padding: 0;
            }
            .print-page {
              width: 100%;
              min-height: calc(100vh - 0.7in);
            }
            .print-artwork-frame {
              height: calc(100vh - 1.1in);
            }
            img {
              max-height: 100%;
            }
          }
        </style>
      </head>
      <body data-print-source="${options.source}">
        <main class="print-shell">
          <section class="screen-only" aria-live="polite">
            <strong>${escapedTitle}</strong>
            <span>Print dialog opening...</span>
          </section>
          <section class="print-page" aria-label="${escapedTitle}">
            <div class="print-artwork">
              <div class="print-artwork-frame">
                <img id="print-image" src="${escapedImageUrl}" alt="${escapedAlt}" />
              </div>
            </div>
            <p class="print-brand">I Love Coloring Page</p>
          </section>
        </main>
        <script>
          (function(){
            var PRINT_PREPARE_TIMEOUT_MS = ${PRINT_PREPARE_TIMEOUT_MS};
            var image = document.getElementById("print-image");
            var failed = false;
            function showFailure() {
              if (failed) return;
              failed = true;
              document.body.removeAttribute("data-print-source");
              document.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;font-family:Arial,sans-serif;text-align:center;padding:2rem;color:rgb(38 31 47);background:white;";
              document.body.innerHTML = "<main><p class=\\"print-brand\\" style=\\"color:rgb(107 74 127);font-size:.78rem;font-weight:800;text-transform:uppercase;\\">I Love Coloring Page</p><p>${escapedFailureMessage}</p></main>";
            }
            var timer = window.setTimeout(showFailure, PRINT_PREPARE_TIMEOUT_MS);
            image.addEventListener("load", function(){
              window.clearTimeout(timer);
              setTimeout(function(){ window.focus(); window.print(); }, 80);
            });
            image.addEventListener("error", showFailure);
          })();
          ${revokeScript}
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function failure(reason: Extract<BrowserRasterResult, { ok: false }>["reason"], message: string): Extract<BrowserRasterResult, { ok: false }> {
  return {
    ok: false,
    reason,
    message,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
