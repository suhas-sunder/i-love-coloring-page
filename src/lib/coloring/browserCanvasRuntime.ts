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
    signal: options.signal,
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
  signal?: AbortSignal;
}): Promise<RenderedCanvasResult> {
  if (!options.internalSvgUrl) return failure("missing-internal-svg", "The high-quality artwork is unavailable.");
  if (!canUseCanvasExport()) return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");

  const image = await loadCorsImage(options.internalSvgUrl, options.imageLoadTimeoutMs, options.signal);
  if (options.signal?.aborted) return failure("operation-cancelled", "The image operation was cancelled.");
  if (!image) return failure("image-load-failed", "The high-quality artwork could not be loaded. Please try again.");

  const sourceWidth = image.naturalWidth || image.width || 800;
  const sourceHeight = image.naturalHeight || image.height || 1200;
  const dimensions = getTargetDimensions(sourceWidth, sourceHeight, options.targetLongEdge);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return failure("canvas-unavailable", "Canvas rendering is unavailable in this browser.");

  try {
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } catch {
    return failure("canvas-export-failed", "The browser could not draw the requested image. Please try again.");
  }

  return { ok: true, canvas, width: canvas.width, height: canvas.height, source: "internal-svg" };
}

export function downloadBlob(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  let objectUrl: string | null = null;
  let link: HTMLAnchorElement | null = null;
  let initiated = false;

  try {
    objectUrl = URL.createObjectURL(blob);
    link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    initiated = true;
    return true;
  } catch {
    return false;
  } finally {
    link?.remove();
    if (objectUrl) {
      if (initiated && typeof window !== "undefined") {
        try {
          window.setTimeout(() => URL.revokeObjectURL(objectUrl as string), 30_000);
        } catch {
          URL.revokeObjectURL(objectUrl);
        }
      } else {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }
}

export function loadCorsImage(imageUrl: string, timeoutMs = IMAGE_LOAD_TIMEOUT_MS, signal?: AbortSignal) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }

    const image = new Image();
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => finish(null);
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    signal?.addEventListener("abort", abort, { once: true });
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
