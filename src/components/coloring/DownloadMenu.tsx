"use client";

import { useEffect, useId, useState } from "react";

import type { BrowserDownloadResult, PublicDownloadFormat } from "@/lib/coloring/browserDownloads";
import { getSupportedDownloadFormats } from "@/lib/coloring/browserDownloadSupport";
import { loadArtworkDownloadRuntime, loadPrintableExportRuntime } from "@/lib/coloring/browserExportLoader";
import { DEFAULT_PRINTABLE_RASTER_DIMENSIONS } from "@/lib/coloring/printableOutputFacts";

type DownloadMenuProps = {
  title: string;
  downloadBaseName: string;
  internalSvgUrl: string | null | undefined;
  pngPreviewUrl: string | null | undefined;
  "aria-label": string;
  onStatus: (message: string) => void;
};

type DownloadOption = {
  format: Extract<PublicDownloadFormat, "png" | "jpg" | "webp">;
  label: "PNG" | "JPG" | "WebP";
  description: string;
  recommended?: true;
};

const DOWNLOAD_OPTIONS: readonly DownloadOption[] = [
  { format: "png", label: "PNG", description: `Printable page image, ${DEFAULT_PRINTABLE_RASTER_DIMENSIONS.widthPx} × ${DEFAULT_PRINTABLE_RASTER_DIMENSIONS.heightPx} px`, recommended: true },
  { format: "jpg", label: "JPG", description: `Printable page image, ${DEFAULT_PRINTABLE_RASTER_DIMENSIONS.widthPx} × ${DEFAULT_PRINTABLE_RASTER_DIMENSIONS.heightPx} px` },
  { format: "webp", label: "WebP", description: "High-resolution artwork image" },
];

export function DownloadMenu({ title, downloadBaseName, internalSvgUrl, pngPreviewUrl, "aria-label": ariaLabel, onStatus }: DownloadMenuProps) {
  const [busyFormat, setBusyFormat] = useState<DownloadOption["format"] | null>(null);
  const [supportedFormats, setSupportedFormats] = useState<readonly PublicDownloadFormat[]>(["png"]);
  const descriptionIdPrefix = useId();

  useEffect(() => {
    setSupportedFormats(getSupportedDownloadFormats());
  }, []);

  const visibleOptions = DOWNLOAD_OPTIONS.filter((option) => supportedFormats.includes(option.format));

  async function downloadFormat(option: DownloadOption) {
    setBusyFormat(option.format);
    onStatus("");

    try {
      const downloadOptions = { internalSvgUrl, pngPreviewUrl, title, filenameBaseName: downloadBaseName };
      const result = option.format === "webp"
        ? await (await loadArtworkDownloadRuntime()).downloadWebp(downloadOptions)
        : option.format === "jpg"
          ? await (await loadPrintableExportRuntime()).downloadJpeg(downloadOptions)
          : await (await loadPrintableExportRuntime()).downloadPng(downloadOptions);
      onStatus(getDownloadStatusMessage(result, option.label));
    } catch {
      onStatus(option.label === "PNG" ? "Download could not be prepared. Please try again." : `${option.label} download could not be prepared. Try PNG instead.`);
    } finally {
      setBusyFormat(null);
    }
  }

  return (
    <div className="download-options" role="group" aria-label={ariaLabel}>
      {visibleOptions.map((option) => (
        <button
          className="download-option-button"
          type="button"
          key={option.format}
          onClick={() => downloadFormat(option)}
          disabled={busyFormat !== null}
          aria-label={`Download ${option.label} for ${title}`}
          aria-describedby={`${descriptionIdPrefix}-${option.format}`}
        >
          <span className="download-option-title">
            <span>{busyFormat === option.format ? `Preparing ${option.label}` : getDownloadButtonLabel(option.label)}</span>
            {option.recommended ? <span className="download-option-recommended">Recommended</span> : null}
          </span>
          <span className="download-option-description" id={`${descriptionIdPrefix}-${option.format}`}>{option.description}</span>
        </button>
      ))}
    </div>
  );
}

function getDownloadButtonLabel(label: DownloadOption["label"]) {
  if (label === "PNG") return "Download PNG";
  if (label === "JPG") return "Download JPG";
  return "Download WebP";
}

function getDownloadStatusMessage(result: BrowserDownloadResult, label: DownloadOption["label"]) {
  if (result.ok) return result.message || `${label} download started.`;
  if (result.reason === "unsupported-format" || result.reason === "canvas-export-unsupported") {
    return `${label} is not supported by this browser.`;
  }
  if (label !== "PNG") return `${label} download could not be prepared. Try PNG instead.`;
  return "Download could not be prepared. Please try again.";
}
