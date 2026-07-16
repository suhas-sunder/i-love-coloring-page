"use client";

import { lazy, Suspense, useState } from "react";

import type { PublicColoringItem } from "@/lib/coloring/types";

import { PrintableCardActions } from "./PrintableCardActions";

const DownloadMenu = lazy(() => import("./DownloadMenu").then((module) => ({ default: module.DownloadMenu })));

type PrintableDetailActionsProps = {
  item: PublicColoringItem;
  internalSvgUrl: string | null;
  pngPreviewUrl: string | null;
};

export function PrintableDetailActions({ item, internalSvgUrl, pngPreviewUrl }: PrintableDetailActionsProps) {
  const [status, setStatus] = useState("");
  return (
    <div className="printable-action-controls">
      <PrintableCardActions className="printable-primary-action" item={item} assetUrls={{ internalSvg: internalSvgUrl, png: pngPreviewUrl }} />
      <div className="printable-download-group">
        <h2>Download</h2>
        <Suspense fallback={<p className="utility-note">Loading download options...</p>}>
          <DownloadMenu title={item.title} downloadBaseName={item.downloadBaseName} internalSvgUrl={internalSvgUrl} pngPreviewUrl={pngPreviewUrl} aria-label={`Download PNG, JPG, or WebP for ${item.title}`} onStatus={setStatus} />
        </Suspense>
      </div>
      {status ? <p className="print-preview-status" aria-live="polite">{status}</p> : null}
    </div>
  );
}
