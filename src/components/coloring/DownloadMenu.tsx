"use client";

import { useEffect, useId, useState } from "react";

import {
  downloadJpeg,
  downloadPng,
  downloadWebp,
  getSupportedDownloadFormats,
  type BrowserDownloadResult,
  type PublicDownloadFormat,
} from "@/lib/coloring/browserDownloads";
import { computePrintableLayout, PRINTABLE_COMPOSITION, type PrintableProfileRequest } from "@/lib/coloring/exportComposition";

import type { PrintablePaperOperationController } from "./PrintableDetailActions";

type DownloadMenuProps = {
  title: string;
  downloadBaseName: string;
  internalSvgUrl: string | null | undefined;
  pngPreviewUrl: string | null | undefined;
  "aria-label": string;
  onStatus: (message: string) => void;
  composition?: Required<PrintableProfileRequest>;
  paperOperation?: PrintablePaperOperationController;
  sourceWidth?: number;
  sourceHeight?: number;
};

type DownloadOption = {
  format: Extract<PublicDownloadFormat, "png" | "jpg" | "webp">;
  label: "PNG" | "JPG" | "WebP";
  description: string;
  recommended?: true;
};

const DOWNLOADERS = {
  png: downloadPng,
  jpg: downloadJpeg,
  webp: downloadWebp,
};

export function DownloadMenu({
  title,
  downloadBaseName,
  internalSvgUrl,
  pngPreviewUrl,
  "aria-label": ariaLabel,
  onStatus,
  composition,
  paperOperation,
  sourceWidth,
  sourceHeight,
}: DownloadMenuProps) {
  const [busyFormat, setBusyFormat] = useState<DownloadOption["format"] | null>(null);
  const [supportedFormats, setSupportedFormats] = useState<readonly PublicDownloadFormat[]>(["png"]);
  const descriptionIdPrefix = useId();

  useEffect(() => {
    setSupportedFormats(getSupportedDownloadFormats());
  }, []);

  const visibleOptions = getDownloadOptions(composition, sourceWidth, sourceHeight)
    .filter((option) => supportedFormats.includes(option.format));

  async function downloadFormat(option: DownloadOption) {
    const usesPaperSettings = option.format !== "webp";
    const operationStarted = usesPaperSettings && paperOperation ? paperOperation.begin() : false;
    if (usesPaperSettings && paperOperation && !operationStarted) return;
    const compositionSnapshot = composition ? { ...composition } : undefined;
    setBusyFormat(option.format);
    onStatus("");

    try {
      const result = await DOWNLOADERS[option.format]({
        internalSvgUrl,
        pngPreviewUrl,
        title,
        filenameBaseName: downloadBaseName,
        composition: usesPaperSettings ? compositionSnapshot : undefined,
      });
      onStatus(getDownloadStatusMessage(result, option.label));
    } catch {
      onStatus(option.label === "PNG" ? "Download could not be prepared. Please try again." : `${option.label} download could not be prepared. Try PNG instead.`);
    } finally {
      setBusyFormat(null);
      if (operationStarted) paperOperation?.end();
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
          disabled={busyFormat !== null || (option.format !== "webp" && Boolean(paperOperation?.busy))}
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

function getDownloadOptions(
  composition: Required<PrintableProfileRequest> | undefined,
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
): readonly DownloadOption[] {
  const page = composition && sourceWidth && sourceHeight
    ? computePrintableLayout(sourceWidth, sourceHeight, { ...composition, unit: "raster" }).page
    : PRINTABLE_COMPOSITION.page;
  const printableDescription = `Printable page image, ${page.widthPx} × ${page.heightPx} px`;
  return [
    { format: "png", label: "PNG", description: printableDescription, recommended: true },
    { format: "jpg", label: "JPG", description: printableDescription },
    { format: "webp", label: "WebP", description: "High-resolution artwork image" },
  ];
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
