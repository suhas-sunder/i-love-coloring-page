"use client";

import { useEffect, useRef, useState } from "react";

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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState<DownloadOption["format"] | null>(null);
  const [supportedFormats, setSupportedFormats] = useState<readonly PublicDownloadFormat[]>(["png"]);

  useEffect(() => {
    setSupportedFormats(getSupportedDownloadFormats());
  }, []);

  const visibleOptions = DOWNLOAD_OPTIONS.filter((option) => supportedFormats.includes(option.format));

  async function downloadFormat(option: DownloadOption) {
    setBusyFormat(option.format);
    onStatus("");

    const result = await DOWNLOADERS[option.format]({
      internalSvgUrl,
      pngPreviewUrl,
      title,
    });

    onStatus(getDownloadStatusMessage(result, option.label));
    setBusyFormat(null);
    setOpen(false);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <details className="download-menu" ref={detailsRef} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="button button-subtle button-small download-menu-summary" aria-expanded={open}>
        Download
      </summary>
      <div className="download-menu-panel" role="menu" aria-label={ariaLabel}>
        {visibleOptions.map((option) => (
          <button
            className="download-menu-option"
            type="button"
            role="menuitem"
            key={option.format}
            onClick={() => downloadFormat(option)}
            disabled={busyFormat !== null}
            aria-label={option.format === "png" ? `Download PNG for ${title}` : `${option.label} download for ${title}`}
          >
            {busyFormat === option.format ? "Preparing" : option.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function getDownloadStatusMessage(result: BrowserDownloadResult, label: DownloadOption["label"]) {
  if (result.ok) return result.message || `${label} download started.`;
  if (result.reason === "unsupported-format" || result.reason === "canvas-export-unsupported") {
    return `${label} is not supported by this browser.`;
  }
  if (label !== "PNG") return `${label} download could not be prepared. Try PNG instead.`;
  return "Download could not be prepared. Please try again.";
}
