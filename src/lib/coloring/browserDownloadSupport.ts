import type { CanvasDownloadFormat, PublicDownloadFormat } from "./browserDownloads";

export const VERIFIED_PUBLIC_DOWNLOAD_FORMATS: readonly PublicDownloadFormat[] = ["png"];
export const EXPOSED_PUBLIC_DOWNLOAD_FORMATS: readonly PublicDownloadFormat[] = ["png", "jpg", "webp"];
export const DEFERRED_CANVAS_DOWNLOAD_FORMATS: readonly CanvasDownloadFormat[] = [];

export function getVisibleDownloadFormats(options: {
  canvasConversionVerified: boolean;
  supportsJpeg?: boolean;
  supportsWebp?: boolean;
}) {
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
