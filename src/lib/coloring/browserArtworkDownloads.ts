import type { BrowserDownloadResult, DownloadOptions } from "./browserDownloads";
import { convertInternalSvgToBlob, downloadBlob } from "./browserCanvasRuntime";

const DOWNLOAD_TARGET_LONG_EDGE = 2400;

export async function downloadWebp(options: DownloadOptions): Promise<BrowserDownloadResult> {
  const converted = await convertInternalSvgToBlob({
    internalSvgUrl: options.internalSvgUrl,
    title: options.title,
    filenameBaseName: options.filenameBaseName,
    format: "webp",
    quality: options.quality,
    targetLongEdge: DOWNLOAD_TARGET_LONG_EDGE,
    signal: options.signal,
  });

  if (!converted.ok) return converted;
  if (options.signal?.aborted) {
    return { ok: false, reason: "operation-cancelled", message: "The WebP download was cancelled." };
  }
  if (!downloadBlob(converted.blob, converted.filename)) {
    return { ok: false, reason: "download-unavailable", message: "The WebP was created, but this browser could not start the download." };
  }
  return { ok: true, filename: converted.filename, format: "webp", source: "internal-svg" };
}
