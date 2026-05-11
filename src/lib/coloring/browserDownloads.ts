export type PublicDownloadFormat = "png" | "jpg" | "jpeg" | "webp";
export type CanvasDownloadFormat = Exclude<PublicDownloadFormat, "png">;

export type BrowserConversionResult =
  | {
      ok: true;
      blob: Blob;
      format: CanvasDownloadFormat;
      mimeType: "image/jpeg" | "image/webp";
      filename: string;
    }
  | {
      ok: false;
      reason:
        | "unsupported-format"
        | "missing-png-preview"
        | "browser-api-unavailable"
        | "image-load-failed"
        | "canvas-unavailable"
        | "canvas-export-failed"
        | "canvas-export-unsupported"
        | "canvas-tainted";
      message: string;
    };

type BrowserConversionFailureReason = Extract<BrowserConversionResult, { ok: false }>["reason"];

type BrowserConversionOptions = {
  pngPreviewUrl: string | null | undefined;
  title: string;
  format: CanvasDownloadFormat;
  quality?: number;
};

const CANVAS_FORMATS: Record<CanvasDownloadFormat, { mimeType: "image/jpeg" | "image/webp"; extension: "jpg" | "webp" }> = {
  jpg: { mimeType: "image/jpeg", extension: "jpg" },
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  webp: { mimeType: "image/webp", extension: "webp" },
};

export const VERIFIED_PUBLIC_DOWNLOAD_FORMATS: readonly PublicDownloadFormat[] = ["png"];
export const DEFERRED_CANVAS_DOWNLOAD_FORMATS: readonly CanvasDownloadFormat[] = ["jpg", "webp"];

export function getVisibleDownloadFormats(options: { canvasConversionVerified: boolean; supportsJpeg?: boolean; supportsWebp?: boolean }) {
  if (!options.canvasConversionVerified) return VERIFIED_PUBLIC_DOWNLOAD_FORMATS;

  const formats: PublicDownloadFormat[] = ["png"];
  if (options.supportsJpeg) formats.push("jpg");
  if (options.supportsWebp) formats.push("webp");
  return formats;
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

export async function convertPngPreviewToBrowserDownload(options: BrowserConversionOptions): Promise<BrowserConversionResult> {
  const formatConfig = CANVAS_FORMATS[options.format];
  if (!formatConfig) {
    return failure("unsupported-format", "This download format is not supported.");
  }

  if (!options.pngPreviewUrl) {
    return failure("missing-png-preview", "PNG preview is unavailable.");
  }

  if (typeof window === "undefined" || typeof document === "undefined" || typeof Image === "undefined") {
    return failure("browser-api-unavailable", "Browser image conversion APIs are unavailable.");
  }

  const image = await loadPngPreview(options.pngPreviewUrl);
  if (!image) {
    return failure("image-load-failed", "The PNG preview could not be loaded for conversion.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return failure("canvas-unavailable", "Canvas rendering is unavailable in this browser.");
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  context.drawImage(image, 0, 0);

  try {
    const blob = await canvasToBlob(canvas, formatConfig.mimeType, options.quality ?? 0.92);
    if (!blob) {
      return failure("canvas-export-failed", "The browser could not export this image format.");
    }

    if (blob.type && blob.type !== formatConfig.mimeType) {
      return failure("canvas-export-unsupported", "The browser fell back to another image format.");
    }

    return {
      ok: true,
      blob,
      format: options.format,
      mimeType: formatConfig.mimeType,
      filename: buildDownloadFilename(options.title, formatConfig.extension),
    };
  } catch {
    return failure("canvas-tainted", "Canvas export was blocked. The asset host must allow CORS for browser conversion.");
  }
}

function loadPngPreview(pngPreviewUrl: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = pngPreviewUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: "image/jpeg" | "image/webp", quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function failure(reason: BrowserConversionFailureReason, message: string): BrowserConversionResult {
  return {
    ok: false,
    reason,
    message,
  };
}
