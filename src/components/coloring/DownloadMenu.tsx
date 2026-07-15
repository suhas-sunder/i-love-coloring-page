"use client";

import { useEffect, useState } from "react";

import {
  downloadJpeg,
  downloadPng,
  downloadWebp,
  getSupportedDownloadFormats,
  type BrowserDownloadResult,
  type PublicDownloadFormat,
} from "@/lib/coloring/browserDownloads";

type DownloadMenuProps = {
  title: string;
  internalSvgUrl: string | null | undefined;
  pngPreviewUrl: string | null | undefined;
  "aria-label": string;
  onStatus: (message: string) => void;
};

type DownloadOption = {
  format: Extract<PublicDownloadFormat, "png" | "jpg" | "webp">;
  label: "PNG" | "JPG" | "WebP";
};

const DOWNLOAD_OPTIONS: readonly DownloadOption[] = [
  { format: "png", label: "PNG" },
  { format: "jpg", label: "JPG" },
  { format: "webp", label: "WebP" },
];

const DOWNLOADERS = {
  png: downloadPng,
  jpg: downloadJpeg,
  webp: downloadWebp,
};

export function DownloadMenu({ title, internalSvgUrl, pngPreviewUrl, "aria-label": ariaLabel, onStatus }: DownloadMenuProps) {
  const [busyFormat, setBusyFormat] = useState<DownloadOption["format"] | null>(null);
  const [supportedFormats, setSupportedFormats] = useState<readonly PublicDownloadFormat[]>(["png"]);

  useEffect(() => {
    setSupportedFormats(getSupportedDownloadFormats());
  }, []);

  const visibleOptions = DOWNLOAD_OPTIONS.filter((option) => supportedFormats.includes(option.format));

  async function downloadFormat(option: DownloadOption) {
    setBusyFormat(option.format);
    onStatus("");

    try {
      const result = await DOWNLOADERS[option.format]({
        internalSvgUrl,
        pngPreviewUrl,
        title,
      });
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
        >
          {busyFormat === option.format ? `Preparing ${option.label}` : getDownloadButtonLabel(option.label)}
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
