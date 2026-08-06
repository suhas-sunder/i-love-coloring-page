import type {
  BrowserRasterOptions,
  BrowserRasterResult,
  FormatConfig,
  PublicDownloadFormat,
  RasterDownloadFormat,
  RenderedCanvasResult,
} from "./browserDownloads";
import { canUseCanvasExport } from "./browserDownloadSupport";

export const IMAGE_LOAD_TIMEOUT_MS = 12_000;

export const CANVAS_FORMATS: Record<RasterDownloadFormat, FormatConfig> = {
  png: { mimeType: "image/png", extension: "png" },
  jpg: { mimeType: "image/jpeg", extension: "jpg", quality: 0.94 },
  jpeg: { mimeType: "image/jpeg", extension: "jpg", quality: 0.94 },
  webp: { mimeType: "image/webp", extension: "webp", quality: 0.92 },
};

export function buildDownloadFilename(title: string, format: PublicDownloadFormat) {
  const extension = format === "jpeg" ? "jpg" : format;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);

  return `${slug || "coloring-page"}.${extension}`;
}

export async function convertInternalSvgToBlob(options: BrowserRasterOptions): Promise<BrowserRasterResult> {
  const formatConfig = CANVAS_FORMATS[options.format];
  if (!formatConfig) return failure("unsupported-format", "This download format is not supported.");
  const rendered = await renderInternalSvgToCanvas({
    internalSvgUrl: options.internalSvgUrl,
    targetLongEdge: options.targetLongEdge ?? 2400,
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

export async function renderInternalSvgToCanvas(options: {
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

  return { ok: true, canvas, width: canvas.width, height: canvas.height, source: "internal-svg" };
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

export function loadCorsImage(imageUrl: string, timeoutMs = IMAGE_LOAD_TIMEOUT_MS) {
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

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export function failure(
  reason: Extract<BrowserRasterResult, { ok: false }>["reason"],
  message: string,
): Extract<BrowserRasterResult, { ok: false }> {
  return { ok: false, reason, message };
}

function getTargetDimensions(sourceWidth: number, sourceHeight: number, targetLongEdge: number) {
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const scale = longEdge > 0 ? Math.max(1, targetLongEdge / longEdge) : 1;
  return { width: Math.round(sourceWidth * scale), height: Math.round(sourceHeight * scale) };
}
